# Shyoy plugin

VST3 for Windows, macOS and Linux (plus AU and a standalone app on macOS, and standalone apps on Windows and Linux),
built from the web app in `site/`, so it is the same instrument: same panel, same engine, same octave sequencer.

- **Engine:** `src/Engine.h` is a line-by-line C++ port of `site/js/dsp/engine.js`. It uses V8's own maths functions
  (`src/v8/`, copied from V8 12.4, Node 22's) and an exact JSON reader (`src/Json.h`), so it renders the same samples
  as the web engine, bit for bit. `node plugin/tools/match.mjs path/to/shyoy_render` checks six test sounds; CI runs it
  on all three platforms. **When engine.js changes, change Engine.h the same way and run the match.**
- **Panel:** the editor is the web app itself, served from inside the plugin to a web view (WebView2 on Windows,
  WKWebView on macOS, WebKitGTK on Linux). `web/bridge.js` goes in first and stands in for the AudioWorklet (engine
  messages go to the C++ engine), for localStorage (the sound is saved in the DAW project; looks, presets and options
  are shared by every instance in one file), and switches off Web MIDI and the service worker. `web/fonts/` holds the
  three Google fonts, so the panel needs no network.
- **Defaults:** `src/DefaultPatch.h` is what the page sends the engine when it boots with no saved sound, so an
  instance whose window has never been opened sounds the same. Regenerate it after changing the web defaults:
  `node plugin/tools/gen-default.mjs`.
- **Host:** MIDI notes, sustain, pitch bend (bender), aftertouch (mod) and CC 1-26 (the panel's faders in order, as in
  Options > MIDI) play the engine directly, and move the panel when it is open. The sequencer runs at the host's tempo;
  while the host plays, its steps sit on the host's sixteenths; when the host stops, a running sequencer stops.
  All-notes-off from the host silences it.

## Build

    cmake -S plugin -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --config Release

JUCE 8.0.10 is fetched and patched (`cmake/juce-linux-webview.patch`, two fixes to JUCE's Linux web view pipe).
Linux needs `libwebkit2gtk-4.1-dev libgtk-3-dev libasound2-dev libfreetype-dev libfontconfig1-dev`. Windows needs the
Microsoft.Web.WebView2 NuGet package (see `.github/workflows/plugin.yml`). `-DSHYOY_HOST_TEST=ON` adds
`shyoy_host_test`, which loads the VST3 like a DAW, opens the panel, clicks PLAY and checks the sound and the saved state.

`.github/workflows/plugin.yml` builds all three on every push that touches `site/` or `plugin/`, runs the checks and
puts the zips on the `plugin-latest` release.
