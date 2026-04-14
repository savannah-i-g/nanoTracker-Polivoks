<h1 align="center">★ ПОЛИВОКС ★</h1>

<p align="center">
  <strong>POLIVOKS</strong> — a faithful emulation of the 1982 Formanta Поливокс,<br>
  the dual-oscillator duophonic synth of the Soviet military-industrial complex.
</p>

<p align="center">
  <code>ФОРМАНТА · СВЕРДЛОВСК · СССР</code><br>
  <sub><em>Formanta · Sverdlovsk · USSR</em></sub>
</p>

<p align="center">
  <img alt="Plugin kind" src="https://img.shields.io/badge/kind-instrument-cc3a2e?style=flat-square&labelColor=140800">
  <img alt="Format" src="https://img.shields.io/badge/format-.ntins-7b61ff?style=flat-square">
  <img alt="Schema" src="https://img.shields.io/badge/schema-v3-ff7a00?style=flat-square">
  <img alt="Voices" src="https://img.shields.io/badge/voices-2%20(duophonic)-d4dde0?style=flat-square&labelColor=0e1418">
  <img alt="Worklet" src="https://img.shields.io/badge/dsp-worklet--v3-77dfd0?style=flat-square&labelColor=0e1418">
  <img alt="UI" src="https://img.shields.io/badge/ui-webview-cc3a2e?style=flat-square&labelColor=140800">
  <a href="https://github.com/savannah-i-g/nanoTracker-sdk"><img alt="Built with" src="https://img.shields.io/badge/built%20with-nanoTracker%20Plugin%20SDK-c8a8ff?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://federatedindustrial.com/tracker"><img alt="Host" src="https://img.shields.io/badge/host-federatedindustrial.com%2Ftracker-0e1418?style=flat-square&labelColor=cc3a2e"></a>
</p>

---

## ДОКУМЕНТ · OVERVIEW

Two VCOs. One comparator. Enough resonance to peel the plating off a
T-72. The original Поливокс was designed by Vladimir Kuzmin in 1982
at the Formanta factory in Kachkanar and built until 1990 — prized in
the post-Soviet underground for its abrasive, comparator-based filter
and its refusal to sound polite.

This port recreates the voice in a single-file nanoTracker instrument:
declarative manifest, custom AudioWorklet DSP, Cyrillic-labelled
control panel rendered in a webview.

---

## ХАРАКТЕРИСТИКИ · FEATURES

- **Two VCOs** — triangle / saw / square / pulse, each with range,
  tune, and per-oscillator modulation depth
- **Noise source** in the mixer bus
- **Comparator-based 2-pole VCF** — switchable LP / BP, aggressive
  self-oscillation well before max resonance (the trademark)
- **Two ADSR envelopes** — independent filter + amp, each with
  **AD-LFO repeat mode** (envelope loops as a tempo-free LFO)
- **One LFO modulator** — routable to pitch, filter, and amp
- **Oscillator cross-modulation** (II → I) for metallic / FM-ish
  textures
- **Glissando** between voices (duophonic portamento)
- **Drive stage** on the output
- **Dark navy panel** with Cyrillic labels — full `themeOverride`
  palette (red alarm highlight, teal scanline glow)

---

## ПАРАМЕТРЫ · PARAMETERS

| Group | Parameter | Panel label | English | Range |
|---|---|---|---|---|
| **Modulator (LFO)** | `mod.rate` | МОД ЧАСТ | Mod rate | 0.05 – 30 Hz |
| | `mod.shape` | МОД ФОРМА | Mod shape | 0 – 3 (tri/saw/sqr/s&h) |
| **Oscillator I** | `osc1.range` | I ДИАПАЗ | Range (octave) | 0 – 3 |
| | `osc1.shape` | I ФОРМА | Waveform | 0 – 4 (tri/saw/sqr/pulse/noise) |
| | `osc1.tune` | I НАСТР | Fine tune | ±100 cents |
| | `osc1.modDepth` | I МОДУЛ | LFO → pitch | 0 – 1 |
| **Oscillator II** | `osc2.range` | II ДИАПАЗ | Range (octave) | 0 – 3 |
| | `osc2.shape` | II ФОРМА | Waveform | 0 – 4 |
| | `osc2.detune` | II РАССТР | Detune | ±12 semitones |
| | `osc2.modDepth` | II МОДУЛ | LFO → pitch | 0 – 1 |
| | `osc2.xmod` | II X-МОД | Cross-mod (II → I) | 0 – 1 |
| **Mixer** | `mix.osc1` | МИКС I | Osc I level | 0 – 1 |
| | `mix.osc2` | МИКС II | Osc II level | 0 – 1 |
| | `mix.noise` | МИКС ШУМ | Noise level | 0 – 1 |
| **Filter** | `filt.mode` | ФИЛ РЕЖ | Filter mode | LP / BP |
| | `filt.cutoff` | ФИЛ СРЕЗ | Cutoff | 40 – 16 000 Hz |
| | `filt.reso` | ФИЛ РЕЗ | Resonance | 0 – 1 |
| | `filt.envAmt` | ФИЛ ОГИБ | Env → cutoff | ±1 |
| | `filt.modAmt` | ФИЛ МОДУЛ | LFO → cutoff | 0 – 1 |
| **Filter envelope** | `fenv.a` | ФИЛ АТАКА | Attack | 0.001 – 4 s |
| | `fenv.d` | ФИЛ ЗАТ | Decay | 0.005 – 6 s |
| | `fenv.s` | ФИЛ ПЬЕД | Sustain | 0 – 1 |
| | `fenv.r` | ФИЛ ПОСЛ | Release | 0.005 – 6 s |
| | `fenv.mode` | ФИЛ РЕЖ.ОГ | Envelope mode | ADSR / AD-LFO |
| **Amp envelope** | `aenv.a` | УС АТАКА | Attack | 0.001 – 4 s |
| | `aenv.d` | УС ЗАТ | Decay | 0.005 – 6 s |
| | `aenv.s` | УС ПЬЕД | Sustain | 0 – 1 |
| | `aenv.r` | УС ПОСЛ | Release | 0.005 – 6 s |
| | `aenv.mode` | УС РЕЖ.ОГ | Envelope mode | ADSR / AD-LFO |
| | `amp.modAmt` | УС ТРЕМ | Tremolo (LFO → amp) | 0 – 1 |
| **Global** | `glide` | ГЛИССАНДО | Glide / portamento | 0 – 1 s |
| | `drive` | ПЕРЕГРУЗ | Output drive | 0 – 1 |
| | `volume` | ГРОМКОСТЬ | Master volume | 0 – 1.5 |

---

## СЛОВАРЬ · GLOSSARY

The panel uses abbreviated Cyrillic labels in the style of the 1982
original. Quick lookup if you're reading the front panel:

| Cyrillic | Transliteration | English |
|---|---|---|
| МОД | MOD | Modulator / LFO |
| ЧАСТ | CHAST | Frequency / rate |
| ФОРМА | FORMA | Waveform / shape |
| ДИАПАЗ | DIAPAZ | Range (octave) |
| НАСТР | NASTR | Tune |
| РАССТР | RASSTR | Detune |
| МОДУЛ | MODUL | Modulation (depth) |
| X-МОД | X-MOD | Cross-modulation |
| МИКС | MIKS | Mix |
| ШУМ | SHUM | Noise |
| ФИЛ | FIL | Filter |
| РЕЖ | REZH | Mode |
| СРЕЗ | SREZ | Cutoff |
| РЕЗ | REZ | Resonance |
| ОГИБ | OGIB | Envelope (amount) |
| ОГ / РЕЖ.ОГ | OG / REZH.OG | Envelope / envelope mode |
| АТАКА | ATAKA | Attack |
| ЗАТ | ZAT | Decay (затухание) |
| ПЬЕД | P'YED | Sustain (пьедестал — "pedestal") |
| ПОСЛ | POSL | Release (послезвучие — "after-sound") |
| УС | US | Amp / amplifier (усилитель) |
| ТРЕМ | TREM | Tremolo |
| ГЛИССАНДО | GLISSANDO | Glide / portamento |
| ПЕРЕГРУЗ | PEREGRUZ | Overdrive |
| ГРОМКОСТЬ | GROMKOST' | Volume |
| I / II | I / II | Oscillator 1 / Oscillator 2 |

> Envelope stage names follow the Soviet convention —
> **ПЬЕД** (pedestal) is the sustain plateau, **ПОСЛ** (after-sound)
> is the release tail.

---

## УСТАНОВКА · INSTALLATION

Drop the pre-packed `polivoks.ntins` into nanoTracker:

1. Open <a href="https://federatedindustrial.com/tracker"><strong>federatedindustrial.com/tracker</strong></a>
2. **PLUGIN MANAGER → `+ LOAD PLUGIN`**
3. Select `polivoks.ntins`
4. **`+ ADD TO WS`** — the instrument window opens

---

## СБОРКА · BUILDING FROM SOURCE

Requires the [nanoTracker Plugin SDK](https://github.com/savannah-i-g/nanoTracker-sdk).

```bash
# Validate manifest + DSP against the spec
node path/to/plugin-sdk/tools/ntvalidate.mjs .

# Pack into a distributable .ntins archive
node path/to/plugin-sdk/tools/ntpack.mjs . --out polivoks.ntins
```

Source layout:

```
.
├── plugin.json        ← manifest (params, theme, UI controls)
├── script.js          ← AudioWorklet processor (polivoks-processor)
├── web/index.html     ← single-file webview panel (Cyrillic labels)
└── polivoks.ntins     ← pre-packed archive
```

---

## ССЫЛКИ · LINKS

- **Host application:** <a href="https://federatedindustrial.com/tracker">federatedindustrial.com/tracker</a>
- **Plugin SDK:** [savannah-i-g/nanoTracker-sdk](https://github.com/savannah-i-g/nanoTracker-sdk)
- **Plugin format:** [`docs/01-plugin-format.md`](https://github.com/savannah-i-g/nanoTracker-sdk/blob/main/docs/01-plugin-format.md)

---

<p align="center">
  <sub>
    <code>ИНСТРУМЕНТ МУЗЫКАЛЬНЫЙ ЭЛЕКТРОННЫЙ</code><br>
    <em>Electronic musical instrument</em><br>
    nanoTracker · Federated Industrial
  </sub>
</p>
