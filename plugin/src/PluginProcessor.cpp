#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "DefaultPatch.h"

using shyoy::Cmd;

ShyoyProcessor::ShyoyProcessor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)) {
    loadDefaultSnapshot();
    makeParams();
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
    { std::vector<Cmd> c; shyoy::parse (seqMessage(), c); for (auto& x : c) shyoy::apply (e, x, false); }
    e.setOS (sOs);
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
    hostChangesOnMessageThread();
    if (uiWake) uiWake();
}

void ShyoyProcessor::postFromUi (const juce::var& m) {
    const auto type = m.getProperty ("type", {}).toString();
    if (type == "ccmap") {   // the bridge tells us midi.js's CC list, so CC numbers follow the panel
        if (auto* a = m["ids"].getArray()) { ccMap.clear(); for (auto& x : *a) ccMap.push_back (x.toString().toStdString()); }
        return;
    }
    snapshot (m);
    // the host parameters follow the panel (a slider drag or a step click is a gesture, so a DAW can record it)
    if (type == "param") { auto it = synthIdx.find (m["id"].toString().toStdString()); if (it != synthIdx.end()) setHost (it->second, shyoy::num (m["v"]), true); }
    else if (type == "params") syncHostToSnapshot (false);
    else if (type == "seq") { const auto q = seqVals(); for (size_t i = 0; i < pdefs.size(); i++) if (pdefs[i].kind >= shyoy::ParamDef::Step && pdefs[i].kind <= shyoy::ParamDef::SeqNum) setHost ((int) i, seqPlain (q, pdefs[i]), true); }
    else if (type == "run" && playIdx >= 0) setHost (playIdx, shyoy::truthy (m["on"]) ? 1 : 0, true);
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
        seqMerge (m["seq"]);
    }
    else if (type == "os") { const int n = shyoy::intOf (m["n"]); sOs = n == 1 || n == 4 ? n : 2; }
    else if (type == "mode") { if (m.hasProperty ("hold")) sHold = shyoy::truthy (m["hold"]); }
    else if (type == "run") uiRunning = shyoy::truthy (m["on"]);
}

void ShyoyProcessor::loadDefaultSnapshot() {
    sParams.clear(); sBend.clear(); sBridges.clear(); sHasCf = false; sSeq = juce::var(); sOs = 2; sHold = false;
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
    o->setProperty ("seq", sSeq.getDynamicObject() ? sSeq : juce::var (new juce::DynamicObject()));
    o->setProperty ("os", sOs);
    o->setProperty ("hold", sHold);
    juce::Array<juce::var> cc; for (auto& c : ccMap) cc.add (juce::String (c));
    o->setProperty ("ccmap", cc);
    return juce::var (o);
}

void ShyoyProcessor::snapshotFromVar (const juce::var& v) {
    auto rd = [] (const juce::var& x, std::map<std::string, double>& m) { m.clear(); if (auto* o = x.getDynamicObject()) for (auto& nv : o->getProperties()) m[nv.name.toString().toStdString()] = shyoy::num (nv.value); };
    rd (v["params"], sParams); rd (v["bend"], sBend); rd (v["bridges"], sBridges);
    sHasCf = false; if (auto* a = v["cf"].getArray()) { sHasCf = true; for (int i = 0; i < 4; i++) sCf[i] = i < a->size() ? shyoy::num ((*a)[i]) : 0; }
    sSeq = juce::var(); seqMerge (v["seq"]);
    { const int n = shyoy::intOf (v["os"]); sOs = n == 1 || n == 4 ? n : 2; }
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
    syncHostToSnapshot (false);
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
    shyoy::parse (seqMessage(), cmds);
    { auto* om = new juce::DynamicObject(); om->setProperty ("type", "os"); om->setProperty ("n", sOs); shyoy::parse (juce::var (om), cmds); }
    auto* md = new juce::DynamicObject(); md->setProperty ("type", "mode"); md->setProperty ("hold", sHold);
    shyoy::parse (juce::var (md), cmds);
    queue (std::move (cmds));
    // an open panel starts again with the loaded sound (on the message thread: hosts call this from anywhere)
    juce::MessageManager::callAsync ([safe = juce::Component::SafePointer<juce::AudioProcessorEditor> (getActiveEditor())] {
        if (auto* ed = dynamic_cast<ShyoyEditor*> (safe.getComponent())) ed->reloadPage();
    });
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
void ShyoyProcessor::step (int i, const int* lanePos, int ni) {
    UiEvent e { UiEvent::Step, i, 0 }; e.ni = ni;
    if (lanePos) { e.hasP = true; for (int k = 0; k < 4; k++) e.p[k] = lanePos[k]; }
    pushUi (e);
}

// the engine's seq is Object.assign (seq, m.seq) of every seq message; keep the same merge (a copy, as the page's
// message objects are its own)
void ShyoyProcessor::seqMerge (const juce::var& s) {
    auto* in = s.getDynamicObject(); if (! in) return;
    auto* o = new juce::DynamicObject();
    if (auto* old = sSeq.getDynamicObject()) for (auto& nv : old->getProperties()) o->setProperty (nv.name, nv.value);
    for (auto& nv : in->getProperties()) o->setProperty (nv.name, nv.value);
    sSeq = juce::var (o);
}
juce::var ShyoyProcessor::seqMessage() const {
    auto* m = new juce::DynamicObject(); m->setProperty ("type", "seq");
    m->setProperty ("seq", sSeq.getDynamicObject() ? sSeq : juce::var (new juce::DynamicObject()));
    return juce::var (m);
}
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
    if (m.isNoteOn() && uiRecording) {   // RECORD: the note goes to the page's list; while the sequencer runs it isn't played
        UiEvent r { UiEvent::RecNote, m.getNoteNumber(), 0 }; pushUi (r);
        if (e.running) return;
    }
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
    // through the host parameter, so the DAW, the saved sound and the panel all follow (as a host change does)
    auto it = synthIdx.find (ccMap[(size_t) cc - 1]);
    if (it != synthIdx.end()) { auto* p = prm[(size_t) it->second]; p->setValueNotifyingHost (p->convertTo0to1 ((float) v)); audioDirty[(size_t) it->second] = false; }
    else pushUi ({ UiEvent::CC, cc - 1, (float) v });
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
    // faders the host moved (automation, a mapped controller) play at once
    for (auto& [id, i] : synthIdx) if (audioDirty[(size_t) i].exchange (false)) e.setParam (pdefs[(size_t) i].id, (double) hostVal[(size_t) i].load());

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
        const int idx = (int) (((int64_t) nextQ % 720720 + 720720) % 720720);   // the engine's step count (every lane length divides it)
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

// ---------------- host parameters ----------------
thread_local bool ShyoyProcessor::selfSet = false;

void ShyoyProcessor::makeParams() {
    using namespace shyoy;
    pdefs = paramDefs();
    const auto q = seqVals();
    hostVal.reset (new std::atomic<float>[pdefs.size()]);
    audioDirty.reset (new std::atomic<bool>[pdefs.size()]); uiDirty.reset (new std::atomic<bool>[pdefs.size()]);
    for (size_t i = 0; i < pdefs.size(); i++) {
        const auto& d = pdefs[i];
        const juce::ParameterID pid { juce::String (d.id), 1 };
        double def = 0;
        if (d.kind == ParamDef::Synth) { auto it = sParams.find (d.id); def = it != sParams.end() ? it->second : 0; synthIdx[d.id] = (int) i; }
        else if (d.kind == ParamDef::Play) { def = 0; playIdx = (int) i; }
        else def = seqPlain (q, d);
        std::unique_ptr<juce::RangedAudioParameter> p;
        if (d.opts.size() > 0) p = std::make_unique<juce::AudioParameterChoice> (pid, d.name, d.opts, juce::jlimit (0, d.opts.size() - 1, (int) def));
        else if (d.kind == ParamDef::Synth) {
            const std::string id = d.id;
            p = std::make_unique<juce::AudioParameterFloat> (pid, d.name, juce::NormalisableRange<float> (0, 1), (float) def,
                juce::AudioParameterFloatAttributes().withStringFromValueFunction ([id] (float v, int) { return synthText (id, v); }));
        }
        else if (d.kind == ParamDef::Play || d.kind == ParamDef::Step || (d.kind == ParamDef::Lane && d.field == 'r')) p = std::make_unique<juce::AudioParameterBool> (pid, d.name, def > 0.5);
        else p = std::make_unique<juce::AudioParameterInt> (pid, d.name, d.lo, d.hi, (int) def);
        hostVal[i] = (float) def; audioDirty[i] = false; uiDirty[i] = false;
        prm.push_back (p.get());
        p->addListener (this);
        addParameter (p.release());
    }
}

// a change from the host (any thread); our own setValueNotifyingHost calls are skipped
void ShyoyProcessor::parameterValueChanged (int index, float norm) {
    if (selfSet || index < 0 || index >= (int) prm.size()) return;
    hostVal[(size_t) index] = prm[(size_t) index]->convertFrom0to1 (norm);
    audioDirty[(size_t) index] = true; uiDirty[(size_t) index] = true;
}

void ShyoyProcessor::setHost (int i, double plain, bool gesture) {
    if (i < 0 || i >= (int) prm.size()) return;
    auto* p = prm[(size_t) i];
    const float n = p->convertTo0to1 ((float) plain);
    if (std::abs (p->getValue() - n) < 1e-7f) return;
    if (gesture && juce::MessageManager::existsAndIsCurrentThread()) { if (! gestureAge.count (i)) p->beginChangeGesture(); gestureAge[i] = 0; }
    selfSet = true; p->setValueNotifyingHost (n); selfSet = false;
    hostVal[(size_t) i] = p->convertFrom0to1 (n);
}

void ShyoyProcessor::syncHostToSnapshot (bool gesture) {
    const auto q = seqVals();
    for (size_t i = 0; i < pdefs.size(); i++) {
        const auto& d = pdefs[i];
        if (d.kind == shyoy::ParamDef::Synth) { auto it = sParams.find (d.id); if (it != sParams.end()) setHost ((int) i, it->second, gesture); }
        else if (d.kind == shyoy::ParamDef::Play) setHost ((int) i, uiRunning ? 1 : 0, gesture);
        else setHost ((int) i, seqPlain (q, d), gesture);
    }
}

void ShyoyProcessor::hostChangesOnMessageThread() {
    using shyoy::ParamDef;
    // gestures end a moment after the last change
    for (auto it = gestureAge.begin(); it != gestureAge.end();) {
        if (++it->second > 8) { prm[(size_t) it->first]->endChangeGesture(); it = gestureAge.erase (it); } else ++it;
    }
    juce::DynamicObject::Ptr page;
    auto pageObj = [&] { if (! page) { page = new juce::DynamicObject(); page->setProperty ("type", "host"); } return page.get(); };
    juce::DynamicObject::Ptr pp;
    bool seqChanged = false; auto q = seqVals();
    for (size_t i = 0; i < pdefs.size(); i++) {
        if (! uiDirty[i].exchange (false)) continue;
        const auto& d = pdefs[i]; const double v = hostVal[i].load();
        if (d.kind == ParamDef::Synth) {
            sParams[d.id] = v;
            if (! pp) pp = new juce::DynamicObject();
            pp->setProperty (juce::Identifier (juce::String (d.id)), v);
        }
        else if (d.kind == ParamDef::Play) {
            const bool on = v > 0.5;
            if (on != (bool) uiRunning) {
                uiRunning = on;
                Cmd c; c.type = Cmd::Run; c.b = on; std::vector<Cmd> cmds { c }; queue (std::move (cmds));
            }
            pageObj()->setProperty ("run", on);
        }
        else { seqSet (q, d, v); seqChanged = true; }
    }
    if (pp) pageObj()->setProperty ("p", juce::var (pp.get()));
    if (seqChanged) {
        seqValsToSnapshot (q);
        std::vector<Cmd> cmds; shyoy::parse (seqMessage(), cmds); queue (std::move (cmds));
        const auto t = seqVals();   // the tidied pattern: put any clamped value back on the host
        for (size_t i = 0; i < pdefs.size(); i++) if (pdefs[i].kind >= ParamDef::Step && pdefs[i].kind <= ParamDef::SeqNum) setHost ((int) i, seqPlain (t, pdefs[i]), false);
        pageObj()->setProperty ("seq", sSeq);
    }
    // the sequencer stopped with the host (or the page): PLAY follows
    if (playIdx >= 0) setHost (playIdx, uiRunning ? 1 : 0, false);
    if (page) {
        if (hostForPage.getDynamicObject()) {   // the editor hasn't taken the last lot yet: merge
            for (auto& nv : page->getProperties()) {
                if (nv.name.toString() == "p" && hostForPage["p"].getDynamicObject()) { for (auto& x : nv.value.getDynamicObject()->getProperties()) hostForPage["p"].getDynamicObject()->setProperty (x.name, x.value); }
                else hostForPage.getDynamicObject()->setProperty (nv.name, nv.value);
            }
        } else hostForPage = juce::var (page.get());
    }
}

juce::var ShyoyProcessor::hostStateForPage() const {
    auto* o = new juce::DynamicObject();
    auto* p = new juce::DynamicObject();
    for (auto& [id, i] : synthIdx) { auto it = sParams.find (id); if (it != sParams.end()) p->setProperty (juce::Identifier (juce::String (id)), it->second); }
    o->setProperty ("p", juce::var (p));
    if (sSeq.getDynamicObject()) o->setProperty ("seq", sSeq);
    return juce::var (o);
}

// the pattern as seq.js seqTidy fills it in
ShyoyProcessor::SeqVals ShyoyProcessor::seqVals() const {
    static const bool ON0[16] = { 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1 }; static const int O0[16] = { 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1 };
    SeqVals q {};
    const auto s = sSeq;
    const auto* steps = s["steps"].getArray();
    for (int i = 0; i < 16; i++) {
        if (steps && steps->size() == 16) { const auto st = (*steps)[i]; q.on[i] = shyoy::truthy (st["on"]); q.o[i] = juce::jlimit (0, 2, shyoy::intOf (st["o"])); q.s[i] = shyoy::truthy (st["s"]); q.a[i] = shyoy::truthy (st["a"]); }
        else { q.on[i] = ON0[i]; q.o[i] = O0[i]; q.s[i] = i == 4 || i == 12; q.a[i] = i % 4 == 0; }
    }
    for (int k = 0; k < 4; k++) {
        const auto key = shyoy::LANE_KEY[k];
        q.st[k] = juce::jlimit (0, 15, shyoy::intOf (s["st"][key]));
        const auto lv = s["len"][key];
        q.len[k] = juce::jlimit (1, 16 - q.st[k], lv.isVoid() || lv.isUndefined() ? 16 : shyoy::intOf (lv));
        q.rt[k] = shyoy::truthy (s["rt"][key]);
    }
    q.loop = juce::jlimit (0, 64, shyoy::intOf (s["loop"]));
    q.cyc = juce::jlimit (0, 64, shyoy::intOf (s["cyc"]));
    q.advStep = s["adv"].toString() == "step";
    return q;
}
void ShyoyProcessor::seqValsToSnapshot (const SeqVals& q) {
    auto* o = new juce::DynamicObject();
    if (auto* old = sSeq.getDynamicObject()) for (auto& nv : old->getProperties()) o->setProperty (nv.name, nv.value);   // notes, bpm
    juce::Array<juce::var> steps;
    for (int i = 0; i < 16; i++) { auto* st = new juce::DynamicObject(); st->setProperty ("on", q.on[i]); st->setProperty ("o", q.o[i]); st->setProperty ("s", q.s[i]); st->setProperty ("a", q.a[i]); steps.add (juce::var (st)); }
    o->setProperty ("steps", steps);
    auto* len = new juce::DynamicObject(); auto* st = new juce::DynamicObject(); auto* rt = new juce::DynamicObject();
    for (int k = 0; k < 4; k++) {
        const int a = juce::jlimit (0, 15, q.st[k]);
        st->setProperty (shyoy::LANE_KEY[k], a); len->setProperty (shyoy::LANE_KEY[k], juce::jlimit (1, 16 - a, q.len[k])); rt->setProperty (shyoy::LANE_KEY[k], q.rt[k]);
    }
    o->setProperty ("len", juce::var (len)); o->setProperty ("st", juce::var (st)); o->setProperty ("rt", juce::var (rt));
    o->setProperty ("loop", q.loop); o->setProperty ("adv", q.advStep ? "step" : "gate"); o->setProperty ("cyc", q.cyc);
    if (! o->hasProperty ("notes")) o->setProperty ("notes", juce::Array<juce::var>());
    if (! o->hasProperty ("bpm")) o->setProperty ("bpm", 120);
    sSeq = juce::var (o);
}
double ShyoyProcessor::seqPlain (const SeqVals& q, const shyoy::ParamDef& d) const {
    using shyoy::ParamDef;
    if (d.kind == ParamDef::Step) { const int i = d.step; return d.field == 'n' ? q.on[i] : d.field == 'o' ? q.o[i] : d.field == 's' ? q.s[i] : q.a[i]; }
    if (d.kind == ParamDef::Lane) { const int k = d.lane; return d.field == 'l' ? q.len[k] : d.field == 's' ? q.st[k] + 1 : q.rt[k]; }
    if (d.kind == ParamDef::SeqNum) return d.id == "loop" ? q.loop : d.id == "cyc" ? q.cyc : q.advStep;
    return 0;
}
void ShyoyProcessor::seqSet (SeqVals& q, const shyoy::ParamDef& d, double v) {
    using shyoy::ParamDef;
    const int n = juce::roundToInt (v); const bool b = v > 0.5;
    if (d.kind == ParamDef::Step) { const int i = d.step; if (d.field == 'n') q.on[i] = b; else if (d.field == 'o') q.o[i] = juce::jlimit (0, 2, n); else if (d.field == 's') q.s[i] = b; else q.a[i] = b; }
    else if (d.kind == ParamDef::Lane) { const int k = d.lane; if (d.field == 'l') q.len[k] = n; else if (d.field == 's') q.st[k] = n - 1; else q.rt[k] = b; }
    else if (d.kind == ParamDef::SeqNum) { if (d.id == "loop") q.loop = n; else if (d.id == "cyc") q.cyc = n; else q.advStep = b; }
}
