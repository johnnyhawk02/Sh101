# Kestrel MS-1

A circuit-modelled monosynth for the browser, with a 303-style step sequencer and a bend board for circuit-bending the model while it plays. Its architecture follows the classic single-VCO battery monosynth (VCO with sub-oscillator, 4-pole OTA filter, one envelope, LFO). It is an independent design: no Roland code, artwork or branding is used.

The app is in `site/` and is live at https://shyoy.pages.dev. To run it locally, serve `site/` over http (for example `npx serve site`), since the page fetches its engine files. Click **Run** or play keys A to K on your computer keyboard.

## What is modelled

Every stage in `site/js/dsp/engine.js` runs in physical units (volts, amps, farads, ohms, kelvin) and is integrated over time. The audio path is 2x oversampled.

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

## Code layout

There is no build step: `site/` is what gets deployed.

```
site/index.html          the page: markup only, loads the files below in order
site/css/shyoy.css       all styles (glass colour tokens on :root)
site/js/dsp/fx.js        AudioWorklet: effects (RAT, DS-1, TS808, Buchla 259, delay, the reverb slot, Compactor)
site/js/dsp/engine.js    AudioWorklet: the circuit model (VCO, sub, VCF, VCA, env, LFO, PSU, bridges, both sequencers)
site/js/app/*.js         the UI, as plain scripts sharing one scope, in this order:
  fit         (loaded in <head>) scales the fixed 1400 x 906 screen to the window, sets --k, fitK()
  notips      turns any title attribute into data-tip, so no tooltip ever shows
  defs        bend-board values, rack layout, effect units
  state       patterns, saved state, slot data
  audio       boots the worklet (fetches fx.js + engine.js, joins them) and sends it messages
  controls    faders, dials, switches, the rack
  bend        Bend board and Bridges
  effects     FX page
  sequencer   piano roll and its sliders
  tabs        tabs, full screen / landscape lock on phones
  slots       pattern slots and chains
  seqmenu     Randomise and Tools menus
  transport   run/stop, tempo
  presets     preset store, save bar, preset menu
  namer       preset namer
  sounds      what a preset holds, built-in sounds
  keyboard    engine feedback, computer keys, bender, Space
  options     the Options sheet (gear): tabs, Colours
  midi        MIDI CC to the front-panel controls, the MIDI tab's map and status
  app         install, check for update, auto-update
site/sw.js               offline cache: lists every file above (add new files there)
```

The UI scripts are classic scripts, not modules, so a file may use anything declared in an earlier one, and anything in a later one only from inside an event handler or function called later.

```
npm test         # runs the engine headless in Node: pitch, stability under heavy bending, every effect on
npm run deploy   # npx wrangler pages deploy site --project-name shyoy --branch main
```

`legacy/kestrel-v0.2/` keeps the first prototype (the old `src/`, `build.mjs` and its `index.html`).

## Live app (Shyoy)

`site/` holds the current Shyoy build (v0.17.1), moved here from johnnyhawk02.github.io/sh101. It is served at https://shyoy.pages.dev:

```
npx wrangler pages deploy site --project-name shyoy --branch main
```

### Sequencer randomisers from the TB-303 app (v0.22.0)

Brought level with the TB-303 app (tb303-circuit-model v164). The **Depth** slider scales the 303 app's odds: at its default 30% every randomiser behaves exactly like the 303 app, lower is gentler, higher is wilder. Ties rows stay Shyoy's own.
- **Generate** (⌥G, and Refill ⇧⌥G): no stored patterns. `generate.js` picks one of 16 styles, a scale, a root and a feel, walks a scale degree the way that style moves, keeps pulling back to a held repeat note, adds the odd octave jump and 303 slides (most across octave jumps). Zero to two moves (loop, reverse, double, Mutate, swap beats) vary the bar, and each later bar is the first with one more move, so a 64-step riff develops. `patterns.js` (commercial ABL3 / Phoscyon content) is deleted.
- **Randomise accents, slides, octaves** (⌥A ⌥S ⌥O): Generate's odds. Accents 42% on beats, 26% other even steps, 20% off-beats, struck notes only; slides only where the next step plays (50% across an octave, 12% same pitch, 22% otherwise); octaves pick one register for the riff and jump the odd note, the repeat note a third as often.
- **Alter accents, slides, octaves** (⇧⌥A ⇧⌥S ⇧⌥O): about a quarter of the notes at Depth 30% (Depth × 5/6, at least one), picked by weight: accents onto beats and off off-beats, slides where they tie into the next note (dead slides go first), octave jumps spare the repeat note and sometimes slide in.
- **Alter whole pattern** (⌥L, new, end of the alter section): the 303 app's Alter. It finds the pattern's key (repeat note as root, best-fitting scale) and changes about a quarter of the steps: walk a scale step or two or snap to the repeat note, octave jump, accent or slide toggle, rest on an off-beat or fill a rest with the repeat note. One press in eight fills every empty beat.
- **Shuffle steps** (⌥H): whole beats when the length is a multiple of 4 and at least 8, else steps; always changes something; dead slides dropped, orphaned ties become notes.
- **Undo** (⌘Z / Ctrl+Z) goes back up to 30 changes. Loading a slot or a sound empties it.

### Sequenced controls show it (v0.21.1)

A control with its step sequencer switched on has its name in an ink chip (on the strip, where the dials have no name, its readout). While the pattern runs, the fill, ring and readout stay at the control's own setting, and a marker shows the value being heard: a bar across a fader's track, a pointer across a dial's ring. The small square after the readout is gone.

### Per-control step sequencers (v0.21.0)

From Elixir Mobile's fader sequencers, as a pop-up. Hold any fader or dial for half a second (a move of more than 6 px cancels it), or right-click it, and its own step sequencer opens over a dimmed screen: page buttons (1-16 to 49-64), 16 steps in two rows of eight (drag to paint; the height is the step's offset from the control's setting, the middle is none; steps past the length are dimmed, the one playing outlined), then length (2-64), slew (off to a whole step), speed (a 16th up to 8 bars) and depth (±0-100% of the control's range), and Randomise with its kind (random, drunk, wobbly, ramp, s&h, sparse). Done, Esc or a click outside closes it. Keys: Left / Right pick a step, Up / Down nudge it, 1-4 pick the page, R randomises.

While the pattern runs the control plays its setting plus the step's offset; moving it (or a MIDI CC) moves the setting the steps play around, and stopping or switching the sequencer off puts it back. Steps count the bar's 16ths from the start (the engine's step message now carries that count, `n`, and the tempo), so a short length runs against the bar. They land on the swung 16ths, or on the grid with Options › Sequencer › follow the swing off. A control with one switched on shows a small square after its readout. The sequencers belong to the sound: they save with every preset (`cseq` in the sound), and a preset without any clears them. Code: `js/app/cseq.js`; controls register in `ctlReg` (controls.js).

### Factory presets: Compactor 30% / 250 ms (v0.17.1)
All the factory presets (Acid line, Sub bass, PWM arp, Starved & bent) now have the Compactor at Amount 30% and Release 250 ms. Nothing else in them changed, and your own saved presets are untouched.

### FX page laid out like the TB-303 app's, and new Compactor defaults (v0.17.0)
Only the look of the FX page changed; every effect, parameter and saved value is the same. The page is three bands with no boxes: folder, drive, delay and compactor across the top; the reverb then the flanger; the routing strip. Units in a band are split by a thin rule, and the second band and the strip have a rule across the top. Each unit's header is one row on the glass: an On / Off button (accent-filled when on in Grey + colour), the name in lowercase, then its own selectors. The pedal, the reverb type and the reverb program are dropdown menus (the 303 app's `drawTypeMenu`, in the sequencer menu style with a ✓ by the current item); the program button grid and the reverb readout are gone. Delay Mono / Ping-pong and Flanger / Chorus are small segmented switches in the header. Every continuous control is a dial, one row per unit, using the 303 app's short names (symmetry, distortion, volume, feedback, low cut, high cut). When a unit is off only its dials dim, to 50%. The subtitles are gone. The 303's sizes are drawn 1.4x, since its screen is 1000 px wide and Shyoy's 1400.

A new or init sound's Compactor now starts at Amount 30% and Release 250 ms (was 40% and 20 ms). Sounds you saved keep their own values, and a sound saved before the two-dial Compactor still migrates to 40% / 20 ms.

### Bigger text again, and a tidy (v0.16.4)
The type scale went up one more step: `--fs-xs` 18px, `--fs-s` 21px, `--fs` 23px, `--fs-l` 25px. The piano roll's row names and step numbers use `--fs-s`, and the D-pad arrows are a bit bigger. Reverb program names use `--fs-xs` with slightly tighter tracking, so all nine fit. On Bridges the tap voltages now sit in one right-aligned column instead of trailing each name. On Perform the bender faders, lever, mod push and transpose are centred instead of packed into the left corner, and the lever's knob springs back to the true centre (it had been 5px left). Every tab, the menus and Options still fit with no scrolling at 1440 x 900 and 915 x 412 (the About text scrolls, as before).

### Bigger small text (v0.16.3)
The type scale in `site/css/shyoy.css` went up about 15%: `--fs-xs` 14 to 16px, `--fs-s` 16 to 19px, `--fs` 18 to 21px, `--fs-l` 21 to 23px (the big logo size stays 40px). The routing diagram's labels and the MIDI channel badge on the pattern slots went up to match. Reverb program names sit 2px under `--fs-s` with tighter padding so "small hall b" still fits its button. Every tab still fits with no scrolling at 1440 x 900 and 915 x 412.

### No install pop-up, no portrait cover (v0.16.2)

- The install pop-up along the bottom edge is gone. **Options › About › Install app** asks the browser to install, or says how beside the button when it can't, as in the TB-303 app. The button hides in the installed app.
- Portrait on a phone no longer covers the screen with a turn-your-phone card. The same scaled screen shows, with a quiet "Turn sideways for a bigger view" hint under it, as in the TB-303 app.

### LCD look sliders, and two audit fixes (v0.16.1)

- **Options › Colours** gains the TB-303 app's look sliders: Brightness (-50..+50) and Saturation (0..200%) move the glass colour in HSL; Dirt (the shade at the top and in the corners), Grain (the pixel grid) and Glow (the ink's shadow) scale `--dirt`, `--grain` and `--glow`. Reset puts them back. Saved as `kestrel.lcdLook` (slider values) and `kestrel.lcdVars` (the variables), which the head script applies before first paint. At stock (Dirt 100%, unlike the 303 app's 0) Shyoy looks exactly as before.
- The sequencer menu buttons read `Randomise ▾` and `Tools ▾` (not lowercased), as specified.
- The reverb's long description under its programs is gone (no help text on the pages); the IR credits are in Options › About.

### One fixed-size screen, scaled to fit any window (v0.16.0)

After the TB-303 app's `fit.js` and its `html.fit` rules. The glass (`.unit`) is always **1400 x 906** CSS px, the 1.545:1 shape of Johnny's MacBook Pro display and big enough that the desktop layout fits unsqueezed. `js/app/fit.js` (loaded in `<head>`, before first paint) puts `fit` on `<html>` and sets `--k = min((vw - pad) / 1400, (vh - pad) / 906, 2.2)` (pad 16 px, 4 px when the window's short side is under 600 px); the `html.fit` rules at the end of `shyoy.css` centre the glass and scale it by `--k`, with the dark case round it. Every device gets this one layout: the landscape-phone and narrow-desktop media queries and the phone tokens are gone, and a phone or iPad shows the same screen smaller. The portrait "Turn your phone sideways" card stays. The viewport meta has `maximum-scale=1, user-scalable=no`.

- All six pages (Synth, Sequencer, Bend board, Bridges, FX, Perform) lay out at that size with nothing scrolling. Bridge cells are a fixed 52 px tall (they were sized from the window height).
- The Options sheet lives in the top layer, outside the glass, so it has its own fixed 1344 x 842 (96% x 93% of the screen) and the same `scale(var(--k))`. The preset menu and the sequencer menus are absolutely positioned inside the glass and scale with it; the preset menu's max height is worked out in design pixels.
- Drags: faders, the bend lever and range sliders measure their element, so they follow the pointer at any scale. The dials and the bridge cells counted screen pixels of travel; they now divide by `fitK()`, so a dial still turns the same amount for the same distance on the glass.

### FX routing strip and the BF-2 flanger, from the TB-303 app (v0.15.0)

- **Routing** (`FxChain` in `js/dsp/fx.js`): `fxorder` (0 = folder then drive, 1 = drive then folder) and `fxret` (0 = delay and reverb in parallel, 0.5 = delay into reverb, 1 = reverb into delay), instant like `drvtype`. In series the second unit is fed the dry signal plus 0.5 × the first one's return (L + R), both returns are heard, the Compactor ducks their sum: the 303 app's `_fxOut`. Stored in the sound as indices (`FX_ROUTE` in `defs.js`); a sound saved without them loads at 0 and 0, and with the defaults the chain's output is bit-identical to v0.14.
- **Flanger**: `BF2Flanger` copied unchanged from `tb303-model.js`, after the folder and drive and ahead of the split, so the returns and the dry path both get it. `flgman`, `flgdep`, `flgrate`, `flgres`, `flgmode` (0 flanger, 1 chorus) with the 303 app's defaults; `fx.flg` switches it, off in anything saved before. It shares the second row of the FX page with the reverb; in chorus mode Res dims.
- **Diagram** (`drawRoute()` in `js/app/effects.js`): an inline SVG strip under the units, redrawn on every on/off, pedal, reverb type, flanger mode and routing change and on preset loads. A block is a button: clicking it (or Enter / Space) clicks that unit's own on/off.

### Sequencer extras from the TB-303 app: Generate, Refill slots, move notes, D-pad, Join chain (v0.14.0)

- **Generate** (Randomise, ⌥G; was New pattern): `js/app/generate.js` is the TB-303 app's AcidLab-style generator (see v0.22.0; the stored ABL3 / Phoscyon patterns and `patterns.js` are gone). It keeps the pattern's length but writes all 64 steps, the rest into `tail`, so lengthening brings in more riff. About 1 in 10 notes that repeat the pitch before them become ties.
- **Auto slots**: a slot Generate filled by itself carries `auto: true` until its steps are edited. On load every empty slot except the current one gets a 16-step generated pattern. **Refill slots** (Randomise, ⇧⌥G) regenerates every auto or empty slot, never the current one or an edited one; no Undo.
- **Move notes** (Tools): up/down a semitone (] [), an octave (⇧] ⇧[), shift a step left/right (, .). A real transpose (B up becomes C an octave up), ties and rests move along; if any note would leave octave -2 C to octave +2 B nothing moves. Shifting rotates the pattern.
- **D-pad** under the roll at the right: ▲▼ a semitone (Shift-click an octave), ◀▶ a step. It replaces the Shift and Transpose spring sliders.
- **Join chain and copy** (Tools, ⌥J): the chained slots in order as one pattern of up to 64 steps, with the first slot's swing and gate, onto the Copy/Paste clipboard and the system clipboard as `{ app: 'kestrel-ms1', steps }`. No chain: the current slot.

### Options sheet and MIDI CC (v0.13.6)

From the TB-303 app. The ≡ menu and the Colours pop-up are gone; a gear at the right of the top bar (`#open-options`) opens **Options**, a modal `<dialog>` of the same glass with three tabs, `midi`, `colours` and `about` (left and right arrows move between them, the last one is saved as `kestrel.optTab`). It closes with ×, Escape or a click on the backdrop. A fixed 1344 x 842, scaled with the screen (v0.16.0).

- **MIDI** (`js/app/midi.js`): every input, every channel, inputs plugged in later too. CC 1 onwards are the rack's continuous controls in panel order, then the bender's VCO, VCF and LFO mod (27 in all; CC 1 is LFO Rate, CC 10 Cutoff), built from `RACK` and `BENDER`. A CC moves the fader, its readout, the engine and the saved state as a drag does, batched to one update per frame. Switches and notes are not used. Access is asked for on the first touch. The tab's status line is the only status text in the app.
- **Colours**: the old pop-up's mode switch and swatches, unchanged (`kestrel.lcdTheme`, `kestrel.lcdMode`, the head script).
- **About**: Install app and Check for update (the old menu items), the version, and short notes on each modelled stage and effect, with the impulse-response credits.

### Preset menu: delete from the list, Factory folder, Export all and favourites (v0.13.5)

From the TB-303 app's picker. Every row ends with a ×: the first click arms it (`delete?`), a second click on the same row deletes. Any other click in the list, or closing the menu, disarms it. Your own presets are removed for good; factory ones are hidden (`kestrel.hidden.prj`) and a `restore N deleted` row at the end of the Factory folder (or the flat list) brings them all back. Deleting the loaded preset sets the menu back to Choose… and leaves the sound alone, and a deleted preset leaves favourites and recents. Unticked stars are an outline ☆. The foot's Delete button is gone.

`FACTORY_PRESETS` in `js/app/sounds.js` is in the shape of an Export all file's `projectPresets`; paste one in and its presets join the Factory folder after the four factory patches (it starts with those four, identical to what `PRESETS` builds). They load through `applyPreset`, so missing newer controls get their defaults.

The foot reads: name, 🎲, Save, **Export all** (`shyoy-presets.json`, every preset of your own; with none, the current sound as one project file), **Export favourites** (`shyoy-favourites.json`, every starred preset, factory and own), **Import file** (a presets file adds them all without touching the sound; a project file loads and saves under its file name; the older project-plus-presets export still works), Sound only.

### No messages, no tooltips (v0.13.4)

As in the TB-303 app, nothing prints status text and nothing pops up on hover. The sequencer's message line (`#sq-msg`) and the preset bar's (`#prj-msg`) are gone with every call that wrote to them; the actions themselves are unchanged, and Delete still asks for a second click on the button itself (Confirm delete). Every `title` attribute is gone (where one was the only label it became an `aria-label`), and `js/app/notips.js`, from the 303 app's `statusline.js`, turns any `title` that turns up later into `data-tip` so the browser's tooltip box never appears. The help paragraphs are gone too: Bend board, Bridges, the Compactor note and the Perform page's computer-keyboard hint, with their CSS. Headings, module subtitles, readouts, the portrait notice, the install pop-up and the menu's version line stay.

### Code split into files (v0.13.3)

No change to the sound, the look or what anything does. The one 264 KB `index.html` is now the page markup plus `css/shyoy.css`, the AudioWorklet in `js/dsp/` (effects and engine) and the UI in sixteen files in `js/app/` (see Code layout). Checked against v0.13.2: the engine renders bit-identical audio (stock patch, every effect, each reverb and pedal, a bent patch), the page sends the engine the same messages, and every tab and the menu screenshot pixel-identical at desktop size and at Pixel 9a landscape, apart from the version number. The offline cache now holds every file and fetches the app's code fresh when online, so an update never mixes old and new files. Dead code removed: two unused CSS rules (`.stp`, `.fxu .progs`), an unused engine table and an unused variable. The arpeggio and the 101 sequencer stay in the engine. The first prototype moved to `legacy/`.

### Perform page: bender only (v0.13.2)

The Arpeggio, Load/Play sequencer, Hold, Rest and Clear seq buttons are gone from the Perform page; it now holds the bender (its faders, lever and Mod push) and Transpose. The Sequencer page is unchanged. The arpeggio and the 101's 100-step sequencer are still in the engine but have no controls, so they stay off.

### Switch LEDs only (v0.13.1)

On the Synth page the chosen option of a switch (wave, range, sub, env trigger and the rest) no longer gets an ink fill. Only its small square LED lights: ink in Mono, the spot colour in Grey + colour.

### Colours and the bigger preset namer (v0.13.0)

From the TB-303 app. **Colours…** in the ≡ menu picks **Mono** (one ink on one coloured glass, the old look) or **Grey + colour** (the default): grey glass with black ink and one deep spot colour on a few small things only (Run while running, the open tab, the pattern slot in use and the step playing in the roll, FX power when on, lit switch LEDs). Dials, faders and sliders always stay ink. Six swatches: Green (Shyoy's own), Orange, Amber, Blue, Red, Grey. Every glass colour is a token on `:root` (`--glass-rgb`, `--ink-rgb`, the haze's `--hl*-rgb` and `--dk*-rgb`), and a theme only swaps them; Mono Green is the pre-v0.13.0 look exactly. Saved as `kestrel.lcdTheme` and `kestrel.lcdMode`, and applied by a small script in `<head>` before first paint.

The 🎲 preset namer is the TB-303 app's: two or three real words from big pools, or one made-up word of alien syllables spliced with a spice, plus a few monosynth words (sub, arpeggio, portamento, bender, keytar, battery, strap).

### Sequencer Randomise and Tools menus (v0.12.0)

The sequencer's pattern buttons moved off the page into two menus at the right of the pattern row, as in the TB-303 app (`seqmenu.js`): **Randomise** (randomise and alter accents, slides, octaves and ties; Shuffle steps; New pattern) and **Tools** (Copy, Paste, Double, Clear, Undo). The actions are unchanged. Every item has a key, shown in the menu: Option/Alt plus the 303 app's letters (Shift for Alter, I for Ties), Cmd/Ctrl for Copy, Paste and Undo, Shift+Backspace for Clear, Option/Alt+R and +T open the menus. Keys are matched on `e.code` and ignored while typing. The Depth slider stays on the page with the others.

### Buchla 259 folder level and folding (v0.11.1)

The folder had the same fault the TB-303 app fixed in its v89: below the first fold the 259 curve has a gain of 5, so Timbre mostly made quiet signals louder (+20 dB from Timbre 0 to 1 on the Kestrel) while only each note's loudest part folded. Ported the 303 app's fix around the unchanged circuit maths: a peak follower on the folder input (instant attack, 200 ms release, 5 mV floor) scales every note to Timbre's depth at the cells and puts its envelope back on the output, the curve's rest value f(off) is subtracted so Symmetry leaves no DC thump, and the output is level-compensated from the curve's small-signal gain and peak swing.

The compensation was re-fitted to the Kestrel rather than copied: `norm = taper(Level) * 4.2 / ((5 * gain)^0.32 * pk^0.19)` (the 303 uses 6.7 / ((5 * gain)^0.3 * pk^0.7)). Measured on three patterns (decaying, sustained, low octave) at Symmetry 0, 0.5 and 1, Level at noon, the output stays within ±2.9 dB of the dry synth across Timbre (it was -4.7 to +16.1 dB), and brightness rises from about 355 to 840 Hz on the default pattern (it was 351 to 435 Hz). Silence in gives silence out at every setting, no NaN, CPU unchanged.

### Compactor (v0.10.0)

The Compactor (the sidechain that ducks the delay and reverb returns under the dry synth) has two dials, as in the TB-303 app (tb303-circuit-model at 5275b1e, `cmpamt` and `cmprel`, ported unchanged): **Amount** (how deep and how easily it ducks, 0 = off) and **Release** (0 to 1 s). Every built-in sound uses Amount 40% and Release 20 ms. A session or saved preset from before v0.10.0 also gets 40% / 20 ms; its old Threshold, Range, Attack, Hold, Mix and Detect settings are dropped, not mapped.

There is no plug-in version of Shyoy, only the web app.

### Reverb slot (v0.9.9)

The FX tab's reverb is the TB-303 model's reverb slot (tb303-circuit-model at 13da3f5), ported unchanged so both apps sound the same: one switch picks **224** (Lexicon 224 model), **Plate** (Dattorro, JAES 1997), **Spring** (after Välimäki, Parker and Abel, JAES 2010) or **Conv** (partitioned FFT convolution). Old sounds have no `revtype`, which falls back to the 224, the only reverb before v0.9.9, so they sound as they did.

The Conv impulse responses are in `site/irs/` (copied as they are from the TB-303 repo), with `irs.json` and `CREDITS.md`: the EMT 140 plate IRs are by Greg Hopkins (CC BY), the rest are Voxengo's free impulses (royalty-free for any use). The service worker caches them on first use.
