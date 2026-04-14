/*
  polivoks-processor — duophonic Soviet-style dual-VCO synth.

  v3 whole-instrument AudioWorklet. Host allocates 2 voiceIds
  (duophonic as per original Polivoks) and posts noteOn/noteOff
  per voiceId. Parameter updates arrive as { type:"param", key, value }
  with dot-path keys that we dispatch via a flat PARAMS object.

  Per voice:
    [Gen I] ──┐
    [Gen II]──┼──► Mixer ──► VCF (comparator 2-pole LP/BP) ──► VCA ──► out
    [Noise] ──┘           ▲                          ▲              ▲
                          │                          │              │
                     [LFO modAmt]              [Filt EG + LFO] [Amp EG]

  Signature Polivoks details modelled here:
   - Comparator-based VCF: hard-clipped feedback path produces the
     chaotic self-oscillation character when resonance is pushed past
     ~0.85. Two 1-pole integrator stages with sign-clipped coupling.
   - Envelope "generator" mode (repeat): when mode==1, on reaching
     the end of decay, the envelope loops back to attack instead of
     sustaining. Gate still gates the loop on/off.
   - Oscillator cross-modulation: osc1's output is added to osc2's
     instantaneous phase increment (through-zero FM feel).
   - Glissando: target-freq with one-pole portamento.
*/

const SHAPE_TRI = 0;
const SHAPE_SAW = 1;
const SHAPE_SQR = 2;
const SHAPE_PW1 = 3;   // 25% pulse
const SHAPE_PW2 = 4;   // 12% pulse

const LFO_SIN = 0;
const LFO_TRI = 1;
const LFO_SAW = 2;
const LFO_SQR = 3;

const FMODE_LP = 0;
const FMODE_BP = 1;

const ENV_MODE_ADSR = 0;
const ENV_MODE_LOOP = 1;

// Range switch -> semitone offset from note.
const RANGE_OFFSETS = [-24, -12, 0, 12];

class PolivoksProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Flat PARAMS mirror (keyed by dot-path).
    this.P = {
      "mod.rate": 4,
      "mod.shape": LFO_SIN,

      "osc1.range": 1,
      "osc1.shape": SHAPE_SAW,
      "osc1.tune": 0,
      "osc1.modDepth": 0,

      "osc2.range": 1,
      "osc2.shape": SHAPE_TRI,
      "osc2.detune": 0.07,
      "osc2.modDepth": 0,
      "osc2.xmod": 0,

      "mix.osc1": 0.7,
      "mix.osc2": 0.5,
      "mix.noise": 0,

      "filt.mode": FMODE_LP,
      "filt.cutoff": 1200,
      "filt.reso": 0.35,
      "filt.envAmt": 0.5,
      "filt.modAmt": 0,

      "fenv.a": 0.01,  "fenv.d": 0.35, "fenv.s": 0.4,  "fenv.r": 0.2,  "fenv.mode": ENV_MODE_ADSR,
      "aenv.a": 0.005, "aenv.d": 0.3,  "aenv.s": 0.85, "aenv.r": 0.15, "aenv.mode": ENV_MODE_ADSR,
      "amp.modAmt": 0,

      "glide": 0,
      "drive": 0.15,
      "volume": 0.85,
    };

    // Voice pool keyed by voiceId. Each voice is lazily created on noteOn.
    this._voices = new Map();

    // Shared LFO state (one LFO for the whole instrument, like the real panel).
    this._lfoPhase = 0;
    this._lfoValue = 0;

    this.port.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "init":
        this.port.postMessage({ type: "ready" });
        break;

      case "noteOn": {
        const vid = msg.voiceId ?? 0;
        const freq = msg.frequency || 440;
        const vel = (msg.velocity ?? 100) / 127;
        let v = this._voices.get(vid);
        if (!v) {
          v = this._makeVoice();
          this._voices.set(vid, v);
        }
        // Glide: keep current freq, move target. If first note, snap.
        if (!v.gate) v.freq = freq;
        v.target = freq;
        v.vel = Math.max(0, Math.min(1, vel));
        v.gate = 1;
        v.aStage = 1; // attack
        v.fStage = 1;
        break;
      }

      case "noteOff": {
        const vid = msg.voiceId ?? 0;
        const v = this._voices.get(vid);
        if (v) {
          v.gate = 0;
          v.aStage = 4; // release
          v.fStage = 4;
        }
        break;
      }

      case "allNotesOff":
        for (const v of this._voices.values()) {
          v.gate = 0;
          v.aStage = 0; v.aEnv = 0;
          v.fStage = 0; v.fEnv = 0;
        }
        break;

      case "setPitch": {
        const vid = msg.voiceId ?? 0;
        const f = msg.frequencyHz ?? msg.frequency;
        const v = this._voices.get(vid);
        if (v && typeof f === "number" && f > 0) v.target = f;
        break;
      }

      case "setGain": {
        const vid = msg.voiceId ?? 0;
        const v = this._voices.get(vid);
        if (v && typeof msg.gain === "number") v.gainScale = msg.gain;
        break;
      }

      case "param":
        if (msg.key in this.P) this.P[msg.key] = msg.value;
        break;

      case "dispose":
        this._voices.clear();
        break;
    }
  }

  _makeVoice() {
    return {
      gate: 0,
      vel: 1,
      gainScale: 1,

      freq: 220,
      target: 220,

      phase1: Math.random(),
      phase2: Math.random(),

      // Filter state (2 one-pole integrators with comparator coupling).
      f1: 0,
      f2: 0,
      fHP: 0,    // for BP output derivation

      // Amp envelope.
      aEnv: 0,
      aStage: 0,  // 0 idle, 1 attack, 2 decay, 3 sustain, 4 release

      // Filter envelope.
      fEnv: 0,
      fStage: 0,

      // Noise LFSR.
      noiseReg: (Math.random() * 0xffffffff) >>> 0,
    };
  }

  // Fast polyBLEP anti-alias residual (Välimäki/Huovilainen).
  _polyBlep(t, dt) {
    if (t < dt) {
      const x = t / dt;
      return x + x - x * x - 1;
    }
    if (t > 1 - dt) {
      const x = (t - 1) / dt;
      return x * x + x + x + 1;
    }
    return 0;
  }

  _oscSample(shape, phase, dt) {
    let out;
    if (shape === SHAPE_TRI) {
      // Band-limited triangle = integrated square; cheap approach:
      out = 1 - 4 * Math.abs(phase - 0.5);
    } else if (shape === SHAPE_SAW) {
      out = 2 * phase - 1;
      out -= this._polyBlep(phase, dt);
    } else if (shape === SHAPE_SQR) {
      out = phase < 0.5 ? 1 : -1;
      out += this._polyBlep(phase, dt);
      out -= this._polyBlep((phase + 0.5) % 1, dt);
    } else if (shape === SHAPE_PW1) {
      const duty = 0.25;
      out = phase < duty ? 1 : -1;
      out += this._polyBlep(phase, dt);
      out -= this._polyBlep((phase + 1 - duty) % 1, dt);
    } else { // SHAPE_PW2
      const duty = 0.12;
      out = phase < duty ? 1 : -1;
      out += this._polyBlep(phase, dt);
      out -= this._polyBlep((phase + 1 - duty) % 1, dt);
    }
    return out;
  }

  // Xorshift32 noise.
  _noise(voice) {
    let x = voice.noiseReg;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    voice.noiseReg = x;
    return ((x >>> 0) / 0xffffffff) * 2 - 1;
  }

  _updateEnv(voice, which, gateOn, atkK, decK, relK, sustain, loopMode) {
    const stKey = which === "a" ? "aStage" : "fStage";
    const valKey = which === "a" ? "aEnv" : "fEnv";
    let st = voice[stKey];
    let v = voice[valKey];

    if (st === 1) {          // attack
      v += (1.05 - v) * atkK;
      if (v >= 1) { v = 1; st = 2; }
    } else if (st === 2) {   // decay
      v += (sustain - v) * decK;
      if (Math.abs(v - sustain) < 0.002) {
        v = sustain;
        if (loopMode === ENV_MODE_LOOP && gateOn) {
          // AD-LFO: restart attack, ignore sustain.
          st = 1;
          v = 0;
        } else {
          st = 3;
        }
      }
    } else if (st === 3) {   // sustain
      v = sustain;
      if (loopMode === ENV_MODE_LOOP && gateOn) { st = 1; v = 0; }
    } else if (st === 4) {   // release
      v += (0 - v) * relK;
      if (v < 0.0008) { v = 0; st = 0; }
    }

    voice[stKey] = st;
    voice[valKey] = v;
    return v;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const left = out[0];
    const right = out.length > 1 ? out[1] : null;
    const len = left.length;
    const sr = sampleRate;

    const P = this.P;

    // LFO (shared across voices and the block).
    const lfoRate = Math.max(0.01, P["mod.rate"]);
    const lfoShape = P["mod.shape"] | 0;
    const lfoInc = lfoRate / sr;

    // Per-block envelope coefficients.
    const fa = Math.max(0.001, P["fenv.a"]);
    const fd = Math.max(0.001, P["fenv.d"]);
    const fr = Math.max(0.001, P["fenv.r"]);
    const fs = Math.max(0, Math.min(1, P["fenv.s"]));
    const fMode = P["fenv.mode"] | 0;
    const faK = 1 - Math.exp(-1 / (fa * sr));
    const fdK = 1 - Math.exp(-1 / (fd * sr));
    const frK = 1 - Math.exp(-1 / (fr * sr));

    const aa = Math.max(0.001, P["aenv.a"]);
    const ad = Math.max(0.001, P["aenv.d"]);
    const ar = Math.max(0.001, P["aenv.r"]);
    const as = Math.max(0, Math.min(1, P["aenv.s"]));
    const aMode = P["aenv.mode"] | 0;
    const aaK = 1 - Math.exp(-1 / (aa * sr));
    const adK = 1 - Math.exp(-1 / (ad * sr));
    const arK = 1 - Math.exp(-1 / (ar * sr));

    const glideTime = Math.max(0.0002, P["glide"] || 0.0002);
    const glideK = 1 - Math.exp(-1 / (glideTime * sr));

    // Pitch/range for each oscillator — in semitones.
    const rng1 = RANGE_OFFSETS[Math.max(0, Math.min(3, P["osc1.range"] | 0))];
    const rng2 = RANGE_OFFSETS[Math.max(0, Math.min(3, P["osc2.range"] | 0))];
    const tune1 = (P["osc1.tune"] || 0) / 100; // cents -> semitones
    const det2  = P["osc2.detune"] || 0;        // semitones

    const shape1 = P["osc1.shape"] | 0;
    const shape2 = P["osc2.shape"] | 0;

    const modOsc1 = P["osc1.modDepth"] || 0;
    const modOsc2 = P["osc2.modDepth"] || 0;
    const xmod    = P["osc2.xmod"] || 0;

    const mixOsc1 = P["mix.osc1"] || 0;
    const mixOsc2 = P["mix.osc2"] || 0;
    const mixNoi  = P["mix.noise"] || 0;

    const filtCutBase = P["filt.cutoff"] || 1200;
    const filtReso = Math.max(0, Math.min(1, P["filt.reso"] || 0));
    const filtEnvAmt = P["filt.envAmt"] || 0;
    const filtModAmt = P["filt.modAmt"] || 0;
    const filtMode = P["filt.mode"] | 0;

    const ampModAmt = P["amp.modAmt"] || 0;
    const drive = P["drive"] || 0;
    const driveGain = 1 + drive * 5;
    const volume = P["volume"] || 0;

    // Clear output.
    for (let i = 0; i < len; i++) { left[i] = 0; if (right) right[i] = 0; }

    // Process each active voice.
    for (const [vid, v] of this._voices) {

      // Skip if long idle.
      if (v.aStage === 0 && v.aEnv < 1e-5 && !v.gate) {
        continue;
      }

      // Per-voice block-start constants.
      const twoPi = 2 * Math.PI;

      for (let i = 0; i < len; i++) {
        // Glide
        v.freq += (v.target - v.freq) * glideK;

        // LFO step (shared but computed here for sample accuracy).
        this._lfoPhase += lfoInc;
        if (this._lfoPhase >= 1) this._lfoPhase -= 1;
        let lfo;
        const lp = this._lfoPhase;
        switch (lfoShape) {
          case LFO_SIN: lfo = Math.sin(lp * twoPi); break;
          case LFO_TRI: lfo = 1 - 4 * Math.abs(lp - 0.5); break;
          case LFO_SAW: lfo = 2 * lp - 1; break;
          case LFO_SQR: lfo = lp < 0.5 ? 1 : -1; break;
          default: lfo = 0;
        }
        this._lfoValue = lfo;

        // Envelopes.
        const fEnv = this._updateEnv(v, "f", v.gate, faK, fdK, frK, fs, fMode);
        const aEnv = this._updateEnv(v, "a", v.gate, aaK, adK, arK, as, aMode);

        // Oscillator frequencies (note * range * tune/detune * LFO pitch mod).
        // Combine all pitch modifiers in log domain.
        const lfoPitchSemi1 = lfo * modOsc1 * 12;   // up to ±12 st
        const lfoPitchSemi2 = lfo * modOsc2 * 12;
        const f1 = v.freq * Math.pow(2, (rng1 + tune1 + lfoPitchSemi1) / 12);
        let f2 = v.freq * Math.pow(2, (rng2 + det2 + lfoPitchSemi2) / 12);

        const dt1 = Math.min(0.49, f1 / sr);
        // Advance osc1
        v.phase1 += dt1;
        if (v.phase1 >= 1) v.phase1 -= 1;
        const o1 = this._oscSample(shape1, v.phase1, dt1);

        // Osc2 cross-mod from osc1 signal (through-zero FM on phase).
        const xModOffset = xmod * o1 * 0.25;
        let p2 = v.phase2 + xModOffset;
        p2 = p2 - Math.floor(p2);
        const dt2 = Math.min(0.49, f2 / sr);
        v.phase2 += dt2;
        if (v.phase2 >= 1) v.phase2 -= 1;
        const o2 = this._oscSample(shape2, p2, dt2);

        // Noise.
        const n = this._noise(v);

        // Mixer.
        let sig = o1 * mixOsc1 + o2 * mixOsc2 + n * mixNoi;
        sig *= 0.5; // headroom

        // Filter cutoff modulation (envelope in octaves, LFO in octaves).
        const cutOctaves = filtEnvAmt * 6 * fEnv + filtModAmt * 3 * lfo;
        let fc = filtCutBase * Math.pow(2, cutOctaves);
        if (fc < 20) fc = 20;
        const fcMax = 0.45 * sr;
        if (fc > fcMax) fc = fcMax;

        // Comparator 2-pole filter (Polivoks-style).
        // g = prewarped coefficient.
        const g = Math.tan(Math.PI * fc / sr);
        const gClamped = Math.min(1.5, Math.max(0.0001, g));
        // Resonance mapping: up to ~4 feedback, pushed past 1 on high reso.
        const k = filtReso * 4.2;

        // Feedback input — asymmetric soft-clip to produce the Polivoks
        // chaotic bite at self-osc.
        let fbIn = sig - k * v.f2;
        // Comparator non-linearity (odd-symmetric tanh but slightly asymmetric).
        fbIn = Math.tanh(fbIn * 1.3) * 0.9;

        // Stage 1 — one-pole (trapezoid integrator).
        const v1 = (gClamped * (fbIn - v.f1)) / (1 + gClamped);
        const y1 = v1 + v.f1;
        v.f1 = y1 + v1;
        // Between-stage non-linearity (the "comparator coupling").
        const y1c = Math.tanh(y1 * 1.15);

        // Stage 2 — one-pole on y1c.
        const v2 = (gClamped * (y1c - v.f2)) / (1 + gClamped);
        const y2 = v2 + v.f2;
        v.f2 = y2 + v2;

        // Output: LP from stage 2; BP from (stage1 - stage2) bandpass tap.
        let filt;
        if (filtMode === FMODE_LP) filt = y2;
        else filt = (y1c - y2); // BP approximation

        // Drive (asymmetric tanh soft clip).
        let driven = Math.tanh(filt * driveGain) * 0.9;

        // Amp envelope + tremolo.
        const trem = 1 - ampModAmt * (0.5 - 0.5 * lfo);
        const amp = aEnv * v.vel * trem * (v.gainScale || 1);
        const samp = driven * amp;

        left[i] += samp;
        if (right) right[i] += samp;
      }

      // Notify host when voice is fully silent (aStage == 0 after release).
      if (v.aStage === 0 && v.aEnv < 1e-5) {
        this.port.postMessage({ type: "voiceEnded", voiceId: vid });
      }
    }

    // Master gain + soft bus limiter.
    const g = volume;
    for (let i = 0; i < len; i++) {
      let L = left[i] * g;
      let R = right ? right[i] * g : L;
      // Soft limiter to keep the bus sane on high resonance self-osc.
      if (L >  1.5) L =  1.5; if (L < -1.5) L = -1.5;
      if (R >  1.5) R =  1.5; if (R < -1.5) R = -1.5;
      L = Math.tanh(L * 0.85);
      R = Math.tanh(R * 0.85);
      left[i] = L;
      if (right) right[i] = R;
    }
    if (!right) {
      for (let ch = 1; ch < out.length; ch++) out[ch].set(left);
    }

    // Reap silent voices (but keep the Map entries lean).
    for (const [vid, v] of this._voices) {
      if (v.aStage === 0 && v.aEnv < 1e-6 && !v.gate) {
        this._voices.delete(vid);
      }
    }

    return true;
  }
}

registerProcessor("polivoks-processor", PolivoksProcessor);
