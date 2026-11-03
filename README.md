# Kestrel MS-1

A circuit-modelled monosynth for the browser, with a 303-style step sequencer and a bend board for circuit-bending the model while it plays. Its architecture follows the classic single-VCO battery monosynth (VCO with sub-oscillator, 4-pole OTA filter, one envelope, LFO). It is an independent design: no Roland code, artwork or branding is used.

Open `index.html` in a browser (Chrome, Edge, Firefox or Safari). Click **Run** or play keys A to K on your computer keyboard.

## What is modelled

Every stage in `src/dsp.js` runs in physical units (volts, amps, farads, ohms, kelvin) and is integrated over time. The audio path is 2x oversampled.

| Stage | Model |
|---|---|
| VCO | Exponential converter (thermal voltage depends on temperature) sets the charging current into a 1 nF timing cap. A comparator at 5 V fires a reset transistor that discharges the cap through its on-resistance for a set pulse width. Pulse output is a second comparator against the PW reference. Edges are band-limited with sub-sample polyBLEP. |
| Sub-osc | Two flip-flops clocked by the VCO reset, giving -1 oct square, -2 oct square and -2 oct 25% pulse. Output level follows the logic rail. |
| Mixer | Inverting op-amp summer, soft-clipping at the supply rails, then a coupling cap. |
| VCF | Four OTA-C integrator stages, each `I = Iabc·tanh(ΔV/2Vt)` into its own 10 nF cap, with resonance feedback from stage 4. It is solved per sample as a zero-delay (TPT) network, re-linearised around each OTA's operating point. |
| VCA | OTA with tanh input, with Iabc set by the envelope or gate. |
| Envelope | A 1 µF timing cap charged toward a 12 V rail through the attack resistor. A comparator at 8 V hands over to decay, which discharges toward the sustain voltage. |
| LFO | Op-amp integrator and Schmitt trigger relaxation oscillator. S&H samples noise on each square edge. |
| Power | Battery with internal resistance feeding a regulator. It sags under load and drops out below about 8 V. |
| Accent | 303-style sweep capacitor: consecutive accents build up the filter sweep. |

### Values taken from the SH-101 schematic

These are read from the synth board (OPH177-2) and control board schematics in the service manual. In `src/dsp.js` they are marked `[SM]`.

- VCO timing cap C41 = 1000 pF on the CEM3340. These figures come from the CEM3340/AS3340 datasheet: a 0 to 10 V saw; a pulse that is an open-emitter output reaching V+ − 1.3 V; cap charge current capped at about 570 µA, which limits how hard a bend can push the core; and on-chip temperature compensation, with about 50 ppm/°C residual drift.
- IR3109 filter caps C47, C48, C50 and C51 = 240 pF. Each OTA input is fed through a 68k / 560 Ω divider, which sets how hard the stages saturate.
- The filter expo has an SDT-1000 thermistor (TH1) for temperature compensation. D30 and D31 clamp the resonance loop.
- Filter CV summer: an op-amp with 33k feedback. FREQ comes in via 200k, ENV via 100k, MOD via 100k (on an audio-taper pot) and KYBD via 150k, which works out to 0.22 V per octave at the summer.
- Envelope timing cap C58 = 10 µF, charged from +15 V. The attack comparator threshold comes from the R158 82k / R161 33k divider, about 4.3 V.
- LFO integrator cap C9 = 0.1 µF.
- Battery power goes through a DC/DC converter, so the rails hold up until the cells are nearly flat.

What is still approximate: the CEM3340's reset dead time, the BA662 VCA gain staging, the exact resonance-loop gain, the noise transistor spectrum, and the bender travel. These either aren't fully legible in the scan or come from inside an IC.

## Bend board

- **Component values:** VCO timing cap, reset pulse width and discharge resistance; each VCF stage capacitor; OTA offset; resonance loop polarity; envelope cap and attack comparator threshold; LFO cap and Schmitt hysteresis; temperature; battery voltage and internal resistance.
- **Bridges:** connect any tap node (saw cap, pulse comparator, sub flip-flop, noise, LFO, envelope cap, VCF stage 2, VCF out, VCA out, or your finger with mains hum) to any injection point (VCO cap, VCO CV, PW reference, VCF CV, VCF input, VCF stage-2 cap, envelope cap, LFO integrator, VCA CV) through a resistor from 10 MΩ to 1 kΩ. Each injection is applied physically: current into a cap or a summing node.

## Matching the SH-101

These values follow the SH-101 service manual's specifications and calibration targets:
- Tune ±50 cents. The VCO is tuned to A4 = 442 Hz at 8' with transpose on Mid, the factory adjustment target.
- PWM from 50% down to 0%, where the pulse goes silent. The PWM source is LFO, manual or envelope.
- Cutoff 10 Hz to 20 kHz. Key follow 0 to 100%.
- Attack 1.5 ms to 4 s. Decay and release 2 ms to 10 s.
- LFO 0.1 Hz to 30 Hz with triangle, square, random and noise. Random is a new value on each LFO clock edge, like the original's CPU-generated random.
- Envelope trigger modes Gate+Trig, Gate and LFO.
- Portamento 0 to 5 s with Off, Auto and On.
- 32-key keyboard from F to C, with Low/Mid/High transpose.
- Bender section with VCO, VCF and LFO-mod amounts, a spring-return lever and a mod push.
- Arpeggio (Up, Up&Down, Down) and a 100-step Load/Play sequencer. Both are clocked by the LFO, one step per LFO cycle, with Hold, rests, legato steps and key transpose.

Bender travel (±12 semitones and ±4 octaves at full) is an assumption; the manual text doesn't give it. Component values inside each stage are not yet traced from the schematic, as noted above.

## 303-style sequencer

16 steps with note, octave, tie, rest, accent and slide, plus swing and gate length. Sequencing runs inside the audio thread, so it is sample-accurate. While it runs, keys transpose the pattern.

## Develop

```
npm test        # runs the engine headless in Node: pitch tracking, self-oscillation, stability under heavy bending
npm run build   # inlines src/dsp.js into src/ui.html -> index.html
```
