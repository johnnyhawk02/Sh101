// shyoy_host_test: loads the built Shyoy.vst3 the way a DAW does, opens its editor (the web app) and plays it, so the
// web view, the bridge and the engine link are checked together. Linux CI runs it under Xvfb (see the workflow):
//   shyoy_host_test path/to/Shyoy.vst3 [screenshot.png]
// It checks: the page loads and saves its sound into the plugin's state; host MIDI plays the engine; the editor's PLAY
// key (clicked with xdotool when it is installed) runs the octave sequencer; a saved state loads into a new instance.
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>

static int failures = 0;
static void check (bool ok, const juce::String& what) { std::printf ("%s %s\n", ok ? "ok  " : "FAIL", what.toRawUTF8()); std::fflush (stdout); if (! ok) failures++; }

struct Test : juce::Timer {
    std::unique_ptr<juce::AudioPluginInstance> plugin;
    std::unique_ptr<juce::DocumentWindow> window;
    juce::String shotPath;
    juce::PluginDescription desc;
    int tick = 0; double fs = 48000;
    juce::AudioBuffer<float> buf { 2, 512 };

    float render (int blocks, juce::MidiBuffer* midiFirst = nullptr) {
        float peak = 0;
        for (int b = 0; b < blocks; b++) {
            juce::MidiBuffer midi; if (b == 0 && midiFirst) midi = *midiFirst;
            buf.clear(); plugin->processBlock (buf, midi);
            peak = std::max (peak, buf.getMagnitude (0, 0, buf.getNumSamples()));
        }
        return peak;
    }
    // the plugin's own state, out of the VST3 host's wrapping (XML with the component state in base64)
    static juce::String unwrap (const juce::MemoryBlock& mb) {
        if (auto xml = juce::AudioProcessor::getXmlFromBinary (mb.getData(), (int) mb.getSize()))
            if (auto* c = xml->getChildByName ("IComponent")) { juce::MemoryBlock raw; raw.fromBase64Encoding (c->getAllSubText()); return raw.toString(); }
        return mb.toString();
    }
    juce::String state() { juce::MemoryBlock mb; plugin->getStateInformation (mb); return unwrap (mb); }

    void start (const juce::String& path) {
        juce::AudioPluginFormatManager fm; fm.addFormat (new juce::VST3PluginFormat());
        juce::OwnedArray<juce::PluginDescription> found;
        juce::VST3PluginFormat vst3; vst3.findAllTypesForFile (found, path);
        check (found.size() == 1, "found one plugin in " + path);
        if (found.isEmpty()) { finish(); return; }
        juce::String err;
        desc = *found[0];
        plugin = fm.createPluginInstance (desc, fs, 512, err);
        check (plugin != nullptr, "instantiated " + found[0]->name + " " + err);
        if (! plugin) { finish(); return; }
        plugin->enableAllBuses();
        plugin->prepareToPlay (fs, 512);
        check (render (20) == 0.0f, "silent until played");
        juce::MidiBuffer on; on.addEvent (juce::MidiMessage::noteOn (1, 48, (juce::uint8) 100), 0);
        const float p = render (40, &on);
        check (p > 0.05f && p <= 1.0f, "host MIDI note plays the engine before the editor opens (peak " + juce::String (p, 3) + ")");
        juce::MidiBuffer off; off.addEvent (juce::MidiMessage::noteOff (1, 48), 0); render (200, &off);
        // the editor
        auto* ed = plugin->createEditorIfNeeded();
        check (ed != nullptr, "editor created");
        window = std::make_unique<juce::DocumentWindow> ("Shyoy test", juce::Colours::black, 0);
        window->setUsingNativeTitleBar (false); window->setTitleBarHeight (0);
        window->setContentNonOwned (ed, true);
        window->setTopLeftPosition (0, 0);
        window->setVisible (true);
        startTimer (500);
    }
    void timerCallback() override {
        tick++;
        render (10);   // keep the audio side going, as a host would
        if (tick == 30) {   // 15 s: the page has loaded and booted
            const auto s = state();
            check (s.contains ("\"ccmap\""), "state holds the engine snapshot");
            // click PLAY in the sequencer row (at the default 1280 x 720 the 3D panel puts it 10.9% across, 79.4% down);
            // xdotool is optional
            if (juce::File ("/usr/bin/xdotool").existsAsFile()) {
                auto* ed = plugin->getActiveEditor();
                const auto r = ed->getScreenBounds();
                const int x = r.getX() + juce::roundToInt (r.getWidth() * 0.0695), y = r.getY() + juce::roundToInt (r.getHeight() * 0.925);
                // run in the background: the message loop has to keep turning while the click is delivered
                auto click = [] (int cx, int cy) { std::system (("(sleep 0.5; xdotool mousemove " + juce::String (cx) + " " + juce::String (cy) + "; sleep 0.5; xdotool click 1) &").toRawUTF8()); };
                std::printf ("     editor at %s, clicking PLAY at %d,%d\n", r.toString().toRawUTF8(), x, y);
                click (x, y);
                // and step 3's accent cell (27.9% across, 85.6% down), so the page has a change to save
                juce::Timer::callAfterDelay (2000, [r, click] { click (r.getX() + juce::roundToInt (r.getWidth() * 0.246), r.getY() + juce::roundToInt (r.getHeight() * 0.822)); });
            }
        }
        if (tick == 40) {
            const float p = render (200);
            const bool clicked = juce::File ("/usr/bin/xdotool").existsAsFile();
            if (clicked) check (p > 0.05f, "PLAY on the editor runs the sequencer (peak " + juce::String (p, 3) + ")");
            if (shotPath.isNotEmpty()) {
                juce::ChildProcess cp; cp.start (juce::StringArray { "import", "-window", "root", shotPath }); cp.waitForProcessToFinish (10000);
            }
            const auto s = state();
            check (s.contains ("kestrel-ms1-v2") || s.contains ("\"patch\":\"{"), "the page saved its sound into the plugin state");
            // a second instance restores it
            juce::MemoryBlock mb; plugin->getStateInformation (mb);
            juce::AudioPluginFormatManager fm; fm.addFormat (new juce::VST3PluginFormat());
            juce::String err; auto p2 = fm.createPluginInstance (desc, fs, 512, err);
            check (p2 != nullptr, "second instance " + err);
            if (p2) {
                p2->enableAllBuses(); p2->setStateInformation (mb.getData(), (int) mb.getSize()); p2->prepareToPlay (fs, 512);
                juce::MemoryBlock mb2; p2->getStateInformation (mb2);
                check (unwrap (mb2) == unwrap (mb) && unwrap (mb).contains ("\"patch\""), "a saved state loads into a new instance unchanged");
                p2->releaseResources();
            }
            finish();
        }
    }
    void finish() {
        stopTimer();
        if (window) { window->clearContentComponent(); window.reset(); }
        if (plugin) { if (auto* ed = plugin->getActiveEditor()) delete ed; plugin->releaseResources(); plugin.reset(); }
        std::printf (failures ? "HOST TEST FAILED\n" : "host test ok\n");
        juce::JUCEApplicationBase::getInstance()->setApplicationReturnValue (failures ? 1 : 0);
        juce::JUCEApplicationBase::quit();
    }
};

struct App : juce::JUCEApplication {
    Test test;
    const juce::String getApplicationName() override { return "shyoy_host_test"; }
    const juce::String getApplicationVersion() override { return "1"; }
    void initialise (const juce::String&) override {
        const auto args = getCommandLineParameterArray();
        if (args.isEmpty()) { std::printf ("usage: shyoy_host_test Shyoy.vst3 [shot.png]\n"); setApplicationReturnValue (2); quit(); return; }
        if (args.size() > 1) test.shotPath = args[1];
        test.start (juce::File::getCurrentWorkingDirectory().getChildFile (args[0]).getFullPathName());
    }
    void shutdown() override {}
};
START_JUCE_APPLICATION (App)
