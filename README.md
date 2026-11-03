# Shyoy (formerly Kestrel MS-1)

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

The VCA input now uses the real R130 150k / R139 1k divider into the BA662 (read from the high-res scan). What is still approximate: the CEM3340 reset dead time, the BA662 control-current scaling (TR28 and R133 12k set it, but the transfer is inside the IC), the exact resonance-loop gain, the noise transistor spectrum, and the bender lever voltage swing. The bender path itself is known: IC3a scales by 100k/150k and feeds the CEM3340 summing node through 100k, against 91.6k for the 1 V/oct key CV.

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

A piano roll (modelled on tb303-circuit-model) of up to 64 steps: octave lanes, key rows, tie, slide and accent, with length, gate, swing, shift and transpose steppers. Phones lock to landscape. Sequencing runs inside the audio thread, so it is sample-accurate. While it runs, keys transpose the pattern.

## Develop

```
npm test        # runs the engine headless in Node: pitch tracking, self-oscillation, stability under heavy bending
npm run build   # inlines src/dsp.js into src/ui.html -> index.html
```

## Versions

The version shows next to the name at the top of the synth and comes from `package.json`. Bump it there for each release.

- **0.5.0**: preset system and effects brought over from tb303-circuit-model: grouped, searchable preset menu with favourites, prev/next, save/delete, name generator, sound-only loading and export/import; RAT distortion, tempo delay, Lexicon 224 reverb and the Compactor ducking the returns (new FX tab). Installs as an app (install pop-up, offline, full-screen landscape).
- **0.5.1**: on-screen keyboard removed; the freed space goes to the panels. Notes still come from the computer keyboard and the sequencers.
- **0.5.2**: sequencer length, gate and swing are sliders; shift and transpose are spring-loaded sliders that snap back to centre when released.
- **0.5.3**: the installed app updates itself: it checks for a new build on launch, when brought back to the front and every 15 minutes, then reloads (waiting until the sequencer is stopped).
- **0.6.0**: 8 pattern slots above the sequencer, as in the 303 app's banks: edits save to the selected slot, Copy/Paste between slots, ctrl/right-click or long-press to chain slots. Saved presets now hold all 8 slots and the chain; "Sound only" still loads just the sound.
- **0.6.1**: fixed the "sandpaper" noise with cutoff and resonance both near full. The resonance loop gain now rolls off near the top of the range, as the IR3109's OTAs do, so self-oscillation fades out above about 10 kHz instead of folding back from above Nyquist as broadband noise.
- **0.6.2**: accent's filter push now goes through the VCF ENV slider (the 101's only envelope route into the VCF CV summer), so with ENV and KYBD at 0 the cutoff stays put. Accent still lifts the VCA.
- **0.6.3**: ACC→VCF switch in Perform: Env (default, filter push follows the ENV slider) or Always (the old 303-style push).
- **0.6.4**: the ACC→VCF switch is replaced by an ACC depth fader on the VCF (0 = off as on a real 101, up to +4 octaves per accent, independent of ENV).
- **0.7.0**: renamed Shyoy (was Kestrel MS-1); the oscilloscope is removed. Saved presets and settings carry over.
- **0.8.0**: desktop uses the same tabs as the phone (Synth, Sequencer, Bend board, Bridges, FX, Perform) and fills the window with no page scroll; faders and piano roll scale with the window height; keyboard help moved to the Perform tab.
- **0.8.1**: Randomise on the Bridges tab with a Depth slider: 1 bridge at 0% up to 8 at 100%, and stronger (lower-resistance) bridges as depth rises.
- **0.9.0**: tidy pass on every tab: one heading style, labels on one line so value rows line up, tempo and preset labels inline in the header, Perform tab laid out like the rack, ruled groups on the Bend board, and faders and the piano roll use the spare height on desktop and phone.
- **0.9.1**: yellow-green backlit LCD glass (#b9cc3c).
- **0.4.0**: piano-roll sequencer (up to 64 steps), tabbed panels, phones lock to landscape and the whole synth fits one screen on a Pixel 9a (915 x 412). VCA input level now taken from the schematic (R130 150k / R139 1k). Full check against the high-res service manual.
- **0.3.0**: LCD look; CEM3340 VCO model.
- **0.2.0**: full SH-101 feature set (arpeggio, 100-step sequencer, bender, transpose) and schematic values from the service manual.
- **0.1.0**: first circuit-modelled build with the bend board and 303-style sequencer.
