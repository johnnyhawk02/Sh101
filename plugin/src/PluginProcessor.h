// Shyoy plugin: the audio side. The Engine (a port of the web app's AudioWorklet) runs in processBlock; the editor is
// the web app itself, whose engine messages arrive here (postFromUi) instead of going to a worklet.
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <map>
#include <set>
#include "Messages.h"
#include "Params.h"

// localStorage keys that every instance shares (looks, presets, options), kept in one file, as one browser keeps them
struct SharedPrefs {
    SharedPrefs(); ~SharedPrefs();
    void save();
    juce::CriticalSection lock; juce::var data; bool dirty = false; juce::File file;
};

class ShyoyProcessor : public juce::AudioProcessor, private juce::Timer, private shyoy::Engine::Listener, private juce::AudioProcessorParameter::Listener {
public:
    ShyoyProcessor();
    ~ShyoyProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return "Shyoy"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 2.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int) override;

    // ---- from the web view (message thread) ----
    void postFromUi (const juce::var& msg);                       // an engine port message
    void storeFromUi (const juce::String& key, const juce::String* value);   // a localStorage write (nullptr = remove)
    juce::var storeForUi() const;                                // what the page's localStorage starts with
    bool isSequencerRunning() const { return uiRunning; }
    void setRecording (bool on) { uiRecording = on; }   // the page's RECORD key: host notes go to its note list (seq.js seqRecNote)
    static const char* patchKey() { return "kestrel-ms1-v2"; }

    // ---- to the web view: what the engine said, and MIDI that moved a control (polled by the editor) ----
    struct UiEvent { enum Kind { Step, CC, Bend, Press, Running, RecNote } kind; int i; float v; int p[4] = { 0, 0, 0, 0 }; int ni = -1; bool hasP = false; };
    void drainUiEvents (std::vector<UiEvent>& out);
    bool takeMeters (juce::var& out);
    std::function<void()> uiWake;
    // host parameter changes for the page (message thread): { type: 'host', p: { id: v }, seq: {...}, run }
    bool takeHostForPage (juce::var& out) { if (! hostForPage.getDynamicObject()) return false; out = hostForPage; hostForPage = juce::var(); return true; }
    juce::var hostStateForPage() const;   // the page starts from these (they may have moved while it was closed)

private:
    // engine (audio thread)
    std::unique_ptr<shyoy::Engine> engine;
    double fs = 0;
    void step (int i, const int* lanePos, int ni) override;
    void meters (const double* node, double rail, double vIn, double env, double vc) override;

    // messages from the message thread to the audio thread: pending -> inbox; the inbox is emptied (freed) back on the
    // message thread, so the audio thread never frees memory
    juce::CriticalSection cmdLock;
    std::vector<shyoy::Cmd> pending, inbox;
    std::atomic<bool> inboxDone { false };
    void timerCallback() override;
    void queue (std::vector<shyoy::Cmd>&& cmds);
    void replaySnapshot (shyoy::Engine& e);

    // the sound as the engine last heard it, so a project reloads (and the engine restarts) without the editor
    std::map<std::string, double> sParams, sBend, sBridges;
    double sCf[4] {}; bool sHasCf = false, sHold = false;
    juce::var sSeq; int sOs = 2;   // the seq object as Object.assign builds it in the engine, and the oversampling
    void snapshot (const juce::var& m);
    void loadDefaultSnapshot();
    juce::var snapshotVar() const;
    void snapshotFromVar (const juce::var& v);
    std::atomic<bool> uiRunning { false }, uiRecording { false };
    void seqMerge (const juce::var& s);
    juce::var seqMessage() const;

    // the page's localStorage: the sound (patchKey) belongs to this instance; looks, presets and options are shared by
    // every instance and kept in a file, as the web app keeps them in one browser
    juce::String patchJson;
    juce::SharedResourcePointer<SharedPrefs> prefs; int saveTick = 0;

    // MIDI from the host, as the web app's midi.js plays it
    std::vector<std::string> ccMap;
    std::set<int> midiHeld, midiDown; bool midiSus = false;
    void handleMidi (const juce::MidiMessage& m);

    // ---- host parameters (Params.h) ----
    // A host change: parameterValueChanged stores it; the audio thread plays a fader change at once; the message thread
    // updates the snapshot, the sequencer and the page. A page change sets the host parameter (selfSet stops the echo).
    struct SeqVals { bool on[16], s[16], a[16]; int o[16]; int len[4], st[4]; bool rt[4]; int loop, cyc; bool advStep; };
    std::vector<shyoy::ParamDef> pdefs;
    std::vector<juce::RangedAudioParameter*> prm;
    std::unique_ptr<std::atomic<float>[]> hostVal;
    std::unique_ptr<std::atomic<bool>[]> audioDirty, uiDirty;
    std::map<std::string, int> synthIdx; int playIdx = -1;
    std::map<int, int> gestureAge;
    juce::var hostForPage;
    static thread_local bool selfSet;
    void makeParams();
    void parameterValueChanged (int index, float newValue) override;
    void parameterGestureChanged (int, bool) override {}
    void setHost (int i, double plain, bool gesture);
    void syncHostToSnapshot (bool gesture);
    void hostChangesOnMessageThread();
    SeqVals seqVals() const;
    void seqValsToSnapshot (const SeqVals& q);
    double seqPlain (const SeqVals& q, const shyoy::ParamDef& d) const;
    static void seqSet (SeqVals& q, const shyoy::ParamDef& d, double v);

    // host tempo and transport
    bool hostWasPlaying = false;

    // audio thread -> editor
    juce::AbstractFifo uiFifo { 512 };
    std::array<UiEvent, 512> uiBuf;
    void pushUi (UiEvent e);
    juce::SpinLock meterLock; std::array<double, shyoy::N_NODES + 4> meterVals {}; bool meterNew = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ShyoyProcessor)
};
