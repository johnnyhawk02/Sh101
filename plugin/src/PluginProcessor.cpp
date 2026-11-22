#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "DefaultPatch.h"

using shyoy::Cmd;

ShyoyProcessor::ShyoyProcessor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)) {
    loadDefaultSnapshot();
    startTimerHz (30);
}
ShyoyProcessor::~ShyoyProcessor() { stopTimer(); prefs->save(); }

bool ShyoyProcessor::isBusesLayoutSupported (const BusesLayout& l) const {
    const auto out = l.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::stereo() || out == juce::AudioChannelSet::mono();
}

// ---------------- engine lifetime ----------------
void ShyoyProcessor::prepareToPlay (double sampleRate, int) {
    if (engine && sampleRate == fs) return;
    const juce::ScopedLock sl (cmdLock);   // the audio thread is stopped here; hold off the queue while swapping
    fs = sampleRate;
    auto e = std::make_unique<shyoy::Engine> (sampleRate);
    replaySnapshot (*e);
    if (uiRunning) e->run (true);
    e->listener = this;
    engine = std::move (e);
    pending.clear(); inbox.clear(); inboxDone = false;   // the snapshot already holds everything queued
}

void ShyoyProcessor::replaySnapshot (shyoy::Engine& e) {
    for (auto& [k, v] : sParams) e.setParam (k, v);
    for (auto& [k, v] : sBend) e.setBend (k, v);
    if (sHasCf) e.setBendCf (sCf);
    e.clearBridges();
    for (auto& [k, v] : sBridges) e.addBridge (k, v);
    e.setSeq (&sSteps, &sBpm);
    e.setHold (sHold);
}

// ---------------- messages ----------------
void ShyoyProcessor::queue (std::vector<Cmd>&& cmds) {
    const juce::ScopedLock sl (cmdLock);
    for (auto& c : cmds) pending.push_back (std::move (c));
}

void ShyoyProcessor::timerCallback() {
    {   // free what the audio thread has finished with
        const juce::ScopedLock sl (cmdLock);
        if (inboxDone) { inbox.clear(); inboxDone = false; }
    }
    if (++saveTick % 30 == 0) prefs->save();   // at most once a second
    if (uiWake) uiWake();
}

void ShyoyProcessor::postFromUi (const juce::var& m) {
    const auto type = m.getProperty ("type", {}).toString();
    if (type == "ccmap") {   // the bridge tells us midi.js's CC list, so CC numbers follow the panel
        if (auto* a = m["ids"].getArray()) { ccMap.clear(); for (auto& x : *a) ccMap.push_back (x.toString().toStdString()); }
        return;
    }
    snapshot (m);
    std::vector<Cmd> cmds; shyoy::parse (m, cmds);
    if (! cmds.empty()) queue (std::move (cmds));
}

void ShyoyProcessor::snapshot (const juce::var& m) {
    const auto type = m.getProperty ("type", {}).toString();
    if (type == "param") sParams[m["id"].toString().toStdString()] = shyoy::num (m["v"]);
    else if (type == "params") { if (auto* o = m["p"].getDynamicObject()) for (auto& nv : o->getProperties()) sParams[nv.name.toString().toStdString()] = shyoy::num (nv.value); }
    else if (type == "bend") {
        if (auto* o = m["b"].getDynamicObject())
            for (auto& nv : o->getProperties()) {
                if (nv.name.toString() == "cf") { if (auto* a = nv.value.getArray()) { sHasCf = true; for (int i = 0; i < 4; i++) sCf[i] = i < a->size() ? shyoy::num ((*a)[i]) : 0; } }
                else sBend[nv.name.toString().toStdString()] = shyoy::num (nv.value);
            }
    }
    else if (type == "bridges") { sBridges.clear(); if (auto* o = m["br"].getDynamicObject()) for (auto& nv : o->getProperties()) sBridges[nv.name.toString().toStdString()] = shyoy::num (nv.value); }
    else if (type == "seq") {
        const auto s = m["seq"];
        if (auto* a = s["steps"].getArray()) { sSteps.clear(); for (auto& st : *a) sSteps.push_back ({ shyoy::truthy (st["on"]), shyoy::intOf (st["o"]), shyoy::truthy (st["s"]), shyoy::truthy (st["a"]) }); }
        if (s.hasProperty ("bpm")) sBpm = shyoy::num (s["bpm"]);
    }
    else if (type == "mode") { if (m.hasProperty ("hold")) sHold = shyoy::truthy (m["hold"]); }
    else if (type == "run") uiRunning = shyoy::truthy (m["on"]);
}

void ShyoyProcessor::loadDefaultSnapshot() {
    sParams.clear(); sBend.clear(); sBridges.clear(); sHasCf = false; sSteps.clear(); sBpm = 120; sHold = false;
    const auto d = shyoy::json::parse (shyoy::DEFAULT_PATCH_JSON);
    if (auto* a = d["boot"].getArray()) for (auto& m : *a) snapshot (m);
    ccMap.clear();
    if (auto* a = d["ccmap"].getArray()) for (auto& x : *a) ccMap.push_back (x.toString().toStdString());
}

juce::var ShyoyProcessor::snapshotVar() const {
    auto* o = new juce::DynamicObject();
    auto map = [] (const std::map<std::string, double>& m) { auto* x = new juce::DynamicObject(); for (auto& [k, v] : m) x->setProperty (juce::Identifier (juce::String (k)), v); return juce::var (x); };
    o->setProperty ("params", map (sParams));
    o->setProperty ("bend", map (sBend));
    o->setProperty ("bridges", map (sBridges));
    if (sHasCf) { juce::Array<juce::var> cf; for (double c : sCf) cf.add (c); o->setProperty ("cf", cf); }
    juce::Array<juce::var> steps;
    for (auto& s : sSteps) { auto* st = new juce::DynamicObject(); st->setProperty ("on", s.on); st->setProperty ("o", s.o); st->setProperty ("s", s.s); st->setProperty ("a", s.a); steps.add (juce::var (st)); }
    o->setProperty ("steps", steps);
    o->setProperty ("bpm", sBpm);
    o->setProperty ("hold", sHold);
    juce::Array<juce::var> cc; for (auto& c : ccMap) cc.add (juce::String (c));
    o->setProperty ("ccmap", cc);
    return juce::var (o);
}

void ShyoyProcessor::snapshotFromVar (const juce::var& v) {
    auto rd = [] (const juce::var& x, std::map<std::string, double>& m) { m.clear(); if (auto* o = x.getDynamicObject()) for (auto& nv : o->getProperties()) m[nv.name.toString().toStdString()] = shyoy::num (nv.value); };
    rd (v["params"], sParams); rd (v["bend"], sBend); rd (v["bridges"], sBridges);
    sHasCf = false; if (auto* a = v["cf"].getArray()) { sHasCf = true; for (int i = 0; i < 4; i++) sCf[i] = i < a->size() ? shyoy::num ((*a)[i]) : 0; }
    sSteps.clear(); if (auto* a = v["steps"].getArray()) for (auto& st : *a) sSteps.push_back ({ shyoy::truthy (st["on"]), shyoy::intOf (st["o"]), shyoy::truthy (st["s"]), shyoy::truthy (st["a"]) });
    sBpm = v.hasProperty ("bpm") ? shyoy::num (v["bpm"]) : 120.0;
    sHold = shyoy::truthy (v["hold"]);
    if (auto* a = v["ccmap"].getArray()) { ccMap.clear(); for (auto& x : *a) ccMap.push_back (x.toString().toStdString()); }
}

// ---------------- state ----------------
void ShyoyProcessor::getStateInformation (juce::MemoryBlock& dest) {
    auto* o = new juce::DynamicObject();
    o->setProperty ("shyoy", 1);
    o->setProperty ("version", SHYOY_VERSION);
    o->setProperty ("patch", patchJson);
    o->setProperty ("engine", snapshotVar());
    const auto s = shyoy::json::toString (juce::var (o));
    dest.replaceAll (s.toRawUTF8(), s.getNumBytesAsUTF8());
}

void ShyoyProcessor::setStateInformation (const void* data, int size) {
    const auto v = shyoy::json::parse (juce::String::fromUTF8 ((const char*) data, size));
    if (! v.hasProperty ("shyoy")) return;
    patchJson = v["patch"].toString();
    snapshotFromVar (v["engine"]);
    // send the whole sound to the running engine, as the web app's pushAll does
    std::vector<Cmd> cmds;
    auto snap = snapshotVar();
    juce::var params (new juce::DynamicObject()), bend (new juce::DynamicObject()), br (new juce::DynamicObject());
    for (auto& [k, x] : sParams) params.getDynamicObject()->setProperty (juce::Identifier (juce::String (k)), x);
    for (auto& [k, x] : sBend) bend.getDynamicObject()->setProperty (juce::Identifier (juce::String (k)), x);
    if (sHasCf) bend.getDynamicObject()->setProperty ("cf", snap["cf"]);
    for (auto& [k, x] : sBridges) br.getDynamicObject()->setProperty (juce::Identifier (juce::String (k)), x);
    auto msg = [] (const char* type, const char* key, const juce::var& val) { auto* o = new juce::DynamicObject(); o->setProperty ("type", type); o->setProperty (key, val); return juce::var (o); };
    shyoy::parse (msg ("params", "p", params), cmds);
    shyoy::parse (msg ("bend", "b", bend), cmds);
    shyoy::parse (msg ("bridges", "br", br), cmds);
    auto* sq = new juce::DynamicObject(); sq->setProperty ("steps", snap["steps"]); sq->setProperty ("bpm", sBpm);
    shyoy::parse (msg ("seq", "seq", juce::var (sq)), cmds);
    auto* md = new juce::DynamicObject(); md->setProperty ("type", "mode"); md->setProperty ("hold", sHold);
    shyoy::parse (juce::var (md), cmds);
    queue (std::move (cmds));
    if (auto* ed = dynamic_cast<ShyoyEditor*> (getActiveEditor())) ed->reloadPage();
}

// ---------------- localStorage ----------------
SharedPrefs::SharedPrefs() {
    file = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory).getChildFile ("Shyoy").getChildFile ("shared-storage.json");
    const auto v = juce::JSON::parse (file.loadFileAsString());
    data = v.getDynamicObject() ? v : juce::var (new juce::DynamicObject());
}
SharedPrefs::~SharedPrefs() { save(); }
void SharedPrefs::save() {
    juce::String text;
    { const juce::ScopedLock sl (lock); if (! dirty) return; dirty = false; text = juce::JSON::toString (data, true); }
    file.getParentDirectory().createDirectory();
    file.replaceWithText (text);
}
juce::var ShyoyProcessor::storeForUi() const {
    auto* o = new juce::DynamicObject();
    const juce::ScopedLock sl (prefs->lock);
    if (auto* p = prefs->data.getDynamicObject()) for (auto& nv : p->getProperties()) if (nv.name.toString() != patchKey()) o->setProperty (nv.name, nv.value);
    if (patchJson.isNotEmpty()) o->setProperty (patchKey(), patchJson);
    return juce::var (o);
}
void ShyoyProcessor::storeFromUi (const juce::String& key, const juce::String* value) {
    if (key == patchKey()) { patchJson = value ? *value : juce::String(); return; }
    const juce::ScopedLock sl (prefs->lock);
    if (auto* p = prefs->data.getDynamicObject()) { if (value) p->setProperty (key, *value); else p->removeProperty (key); prefs->dirty = true; }
}

// ---------------- audio thread -> editor ----------------
void ShyoyProcessor::pushUi (UiEvent e) {
    const auto w = uiFifo.write (1);
    if (w.blockSize1 > 0) uiBuf[(size_t) w.startIndex1] = e;
    else if (w.blockSize2 > 0) uiBuf[(size_t) w.startIndex2] = e;
}
void ShyoyProcessor::drainUiEvents (std::vector<UiEvent>& out) {
    const auto r = uiFifo.read (uiFifo.getNumReady());
    for (int i = 0; i < r.blockSize1; i++) out.push_back (uiBuf[(size_t) (r.startIndex1 + i)]);
    for (int i = 0; i < r.blockSize2; i++) out.push_back (uiBuf[(size_t) (r.startIndex2 + i)]);
}
void ShyoyProcessor::step (int i) { pushUi ({ UiEvent::Step, i, 0 }); }
void ShyoyProcessor::meters (const double* node, double rail, double vIn, double env, double vc) {
    const juce::SpinLock::ScopedTryLockType tl (meterLock);
    if (! tl.isLocked()) return;
    for (int i = 0; i < shyoy::N_NODES; i++) meterVals[(size_t) i] = node[i];
    meterVals[shyoy::N_NODES] = rail; meterVals[shyoy::N_NODES + 1] = vIn; meterVals[shyoy::N_NODES + 2] = env; meterVals[shyoy::N_NODES + 3] = vc;
    meterNew = true;
}
bool ShyoyProcessor::takeMeters (juce::var& out) {
    std::array<double, shyoy::N_NODES + 4> v;
    { const juce::SpinLock::ScopedLockType l (meterLock); if (! meterNew) return false; meterNew = false; v = meterVals; }
    auto* o = new juce::DynamicObject();
    o->setProperty ("type", "meters");
    juce::Array<juce::var> nodes; for (int i = 0; i < shyoy::N_NODES; i++) nodes.add (v[(size_t) i]);
    o->setProperty ("node", nodes);
    o->setProperty ("rail", v[shyoy::N_NODES]); o->setProperty ("vIn", v[shyoy::N_NODES + 1]);
    o->setProperty ("env", v[shyoy::N_NODES + 2]); o->setProperty ("vc", v[shyoy::N_NODES + 3]);
    out = juce::var (o);
    return true;
}

// ---------------- MIDI (site/js/app/midi.js, the path for any input) ----------------
void ShyoyProcessor::handleMidi (const juce::MidiMessage& m) {
    auto& e = *engine;
    if (m.isNoteOn()) { const int n = m.getNoteNumber(); midiDown.insert (n); midiHeld.insert (n); e.noteOn (n, false); return; }
    if (m.isNoteOff()) { const int n = m.getNoteNumber(); midiDown.erase (n); if (midiSus) return; if (midiHeld.erase (n)) e.noteOff (n); return; }
    if (m.isPitchWheel()) {
        const int raw = m.getPitchWheelValue();
        const double v = juce::jlimit (-1.0, 1.0, (raw - 8192) / (raw >= 8192 ? 8191.0 : 8192.0));
        e.setParam ("lever", v); pushUi ({ UiEvent::Bend, 0, (float) v }); return;
    }
    if (m.isChannelPressure()) { const double v = m.getChannelPressureValue() / 127.0; e.setParam ("modPush", v); pushUi ({ UiEvent::Press, 0, (float) v }); return; }
    if (! m.isController()) return;
    const int cc = m.getControllerNumber(), val = m.getControllerValue();
    if (cc == 64) {
        midiSus = val >= 64;
        if (! midiSus) for (auto it = midiHeld.begin(); it != midiHeld.end();) { if (! midiDown.count (*it)) { e.noteOff (*it); it = midiHeld.erase (it); } else ++it; }
        return;
    }
    if (cc == 123 || cc == 120) {   // all notes / sound off from the host (a DAW sends it on stop)
        for (int n : midiHeld) e.noteOff (n);
        midiHeld.clear(); midiDown.clear(); midiSus = false; e.panic(); return;
    }
    if (cc < 1 || cc > (int) ccMap.size()) return;
    const double v = val / 127.0;
    e.setParam (ccMap[(size_t) cc - 1], v);
    pushUi ({ UiEvent::CC, cc - 1, (float) v });
}

// ---------------- audio ----------------
void ShyoyProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) {
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    if (! engine) { buffer.clear(); return; }
    auto& e = *engine;

    // messages from the editor
    if (! inboxDone) {
        const juce::ScopedTryLock tl (cmdLock);
        if (tl.isLocked() && ! pending.empty()) {
            std::swap (pending, inbox);
            for (auto& c : inbox) {
                shyoy::apply (e, c, false);   // the host sets the tempo, not the page
                if (c.type == Cmd::Run) uiRunning = c.b;
            }
            inboxDone = true;
        }
    }

    // tempo and transport: the sequencer runs at the host's tempo; while the host plays, its steps sit on the host's
    // sixteenths; when the host stops, a running sequencer stops (PLAY goes out)
    double bpm = 120; bool playing = false; double ppq = 0; bool havePpq = false;
    if (auto* ph = getPlayHead())
        if (auto pos = ph->getPosition()) {
            if (auto b = pos->getBpm()) bpm = *b;
            playing = pos->getIsPlaying();
            if (auto q = pos->getPpqPosition()) { ppq = *q; havePpq = true; }
        }
    if (bpm > 0 && bpm < 1000) e.seq.bpm = bpm;
    if (hostWasPlaying && ! playing && e.running) { e.run (false); uiRunning = false; pushUi ({ UiEvent::Running, 0, 0 }); }
    hostWasPlaying = playing;
    if (playing && havePpq && e.running) {
        const double spStep = fs * 60 / e.seq.bpm / 4, q = ppq * 4, nextQ = std::ceil (q - 1e-7);
        const int len = std::max (1, (int) e.seq.steps.size());
        const int idx = (int) (((int64_t) nextQ % len + len) % len);
        const double at = (double) e.t + (nextQ - q) * spStep;
        if (std::abs (e.nextStepAt - at) > 1.0 || e.stepIdx != idx) { e.nextStepAt = at; e.stepIdx = idx; }
    }

    // render in pieces between MIDI events, so notes land on their sample
    auto* L = buffer.getWritePointer (0);
    auto* R = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : nullptr;
    int done = 0;
    for (const auto meta : midi) {
        const int at = juce::jlimit (0, n, meta.samplePosition);
        if (at > done) { e.process (L + done, R ? R + done : nullptr, at - done); done = at; }
        handleMidi (meta.getMessage());
    }
    if (n > done) e.process (L + done, R ? R + done : nullptr, n - done);
    for (int ch = 2; ch < buffer.getNumChannels(); ch++) buffer.clear (ch, 0, n);
}

juce::AudioProcessorEditor* ShyoyProcessor::createEditor() { return new ShyoyEditor (*this); }

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new ShyoyProcessor(); }
