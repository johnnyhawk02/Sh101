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

The component values are typical for these circuit topologies. They have not yet been traced part by part from a service-manual schematic. Calibrating them against a real schematic is the next step.

## Bend board

- **Component values:** VCO timing cap, reset pulse width and discharge resistance; each VCF stage capacitor; OTA offset; resonance loop polarity; envelope cap and attack comparator threshold; LFO cap and Schmitt hysteresis; temperature; battery voltage and internal resistance.
- **Bridges:** connect any tap node (saw cap, pulse comparator, sub flip-flop, noise, LFO, envelope cap, VCF stage 2, VCF out, VCA out, or your finger with mains hum) to any injection point (VCO cap, VCO CV, PW reference, VCF CV, VCF input, VCF stage-2 cap, envelope cap, LFO integrator, VCA CV) through a resistor from 10 MΩ to 1 kΩ. Each injection is applied physically: current into a cap or a summing node.

## Sequencer

16 steps with note, octave, tie, rest, accent and slide, plus swing and gate length. Sequencing runs inside the audio thread, so it is sample-accurate. While it runs, keys transpose the pattern.

## Develop

```
npm test        # runs the engine headless in Node: pitch tracking, self-oscillation, stability under heavy bending
npm run build   # inlines src/dsp.js into src/ui.html -> index.html
```

## Live app (Shyoy)

`site/` holds the current Shyoy build (v0.11.1), moved here from johnnyhawk02.github.io/sh101. It is served at https://shyoy.pages.dev:

```
npx wrangler pages deploy site --project-name shyoy --branch main
```

### Buchla 259 folder level and folding (v0.11.1)

The folder had the same fault the TB-303 app fixed in its v89: below the first fold the 259 curve has a gain of 5, so Timbre mostly made quiet signals louder (+20 dB from Timbre 0 to 1 on the Kestrel) while only each note's loudest part folded. Ported the 303 app's fix around the unchanged circuit maths: a peak follower on the folder input (instant attack, 200 ms release, 5 mV floor) scales every note to Timbre's depth at the cells and puts its envelope back on the output, the curve's rest value f(off) is subtracted so Symmetry leaves no DC thump, and the output is level-compensated from the curve's small-signal gain and peak swing.

The compensation was re-fitted to the Kestrel rather than copied: `norm = taper(Level) * 4.2 / ((5 * gain)^0.32 * pk^0.19)` (the 303 uses 6.7 / ((5 * gain)^0.3 * pk^0.7)). Measured on three patterns (decaying, sustained, low octave) at Symmetry 0, 0.5 and 1, Level at noon, the output stays within ±2.9 dB of the dry synth across Timbre (it was -4.7 to +16.1 dB), and brightness rises from about 355 to 840 Hz on the default pattern (it was 351 to 435 Hz). Silence in gives silence out at every setting, no NaN, CPU unchanged.

### Compactor (v0.10.0)

The Compactor (the sidechain that ducks the delay and reverb returns under the dry synth) has two dials, as in the TB-303 app (tb303-circuit-model at 5275b1e, `cmpamt` and `cmprel`, ported unchanged): **Amount** (how deep and how easily it ducks, 0 = off) and **Release** (0 to 1 s). Every built-in sound uses Amount 40% and Release 20 ms. A session or saved preset from before v0.10.0 also gets 40% / 20 ms; its old Threshold, Range, Attack, Hold, Mix and Detect settings are dropped, not mapped.

There is no plug-in version of Shyoy, only the web app.

### Reverb slot (v0.9.9)

The FX tab's reverb is the TB-303 model's reverb slot (tb303-circuit-model at 13da3f5), ported unchanged so both apps sound the same: one switch picks **224** (Lexicon 224 model), **Plate** (Dattorro, JAES 1997), **Spring** (after Välimäki, Parker and Abel, JAES 2010) or **Conv** (partitioned FFT convolution). Old sounds have no `revtype`, which falls back to the 224, the only reverb before v0.9.9, so they sound as they did.

The Conv impulse responses are in `site/irs/` (copied as they are from the TB-303 repo), with `irs.json` and `CREDITS.md`: the EMT 140 plate IRs are by Greg Hopkins (CC BY), the rest are Voxengo's free impulses (royalty-free for any use). The service worker caches them on first use.
