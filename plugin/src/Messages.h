// The web app talks to its engine with port messages ({ type: 'param', id, v }, { type: 'noteOn', n }, ...). The plugin
// gets the same messages from the web view as JSON, turns them into Cmds on the message thread (no parsing or string
// building on the audio thread) and the audio thread applies them to the Engine with apply(), as onMsg() does in JS.
#pragma once
#include <juce_core/juce_core.h>
#include "Engine.h"
#include "Json.h"

namespace shyoy {

struct Cmd {
    enum Type { Param, Bend, BendCf, BridgesClear, Bridge, NoteOn, NoteOff, Hold, Seq, Run, Panic, Reset, Os, Clip } type = Param;
    std::string id;
    double v = 0;
    bool b = false;
    double cf[4] {};
    std::vector<SeqStep> steps; bool hasSteps = false, hasBpm = false; double bpm = 120;
    // the rest of a seq message: each field only when the message has it (Object.assign)
    bool hasLen = false, hasSt = false, hasRt = false, hasNotes = false, hasLoop = false, hasAdv = false, hasCyc = false;
    int len[4] {}, st[4] {}; bool rt[4] {}; std::vector<int> notes; int loop = 0, cyc = 0; bool advStep = false;
};

inline double num (const juce::var& v) {
    if (v.isBool()) return (bool) v ? 1.0 : 0.0;
    if (v.isInt() || v.isInt64() || v.isDouble()) return (double) v;
    if (v.isString()) return v.toString().getDoubleValue();
    return std::nan ("");
}
inline bool truthy (const juce::var& v) {
    if (v.isVoid() || v.isUndefined()) return false;
    if (v.isBool()) return (bool) v;
    if (v.isInt() || v.isInt64() || v.isDouble()) { const double d = v; return d != 0 && ! std::isnan (d); }
    if (v.isString()) return v.toString().isNotEmpty();
    return true;   // objects, arrays
}
inline int intOf (const juce::var& v) { const double d = num (v); return std::isfinite (d) ? (int) (int64_t) d : 0; }   // v | 0

// One web message -> the Cmds that do the same to the engine.
inline void parse (const juce::var& m, std::vector<Cmd>& out) {
    const auto type = m.getProperty ("type", {}).toString();
    auto add = [&] (Cmd c) { out.push_back (std::move (c)); };
    if (type == "param") { Cmd c; c.type = Cmd::Param; c.id = m["id"].toString().toStdString(); c.v = num (m["v"]); add (c); }
    else if (type == "params") {
        if (auto* o = m["p"].getDynamicObject())
            for (const auto& nv : o->getProperties()) { Cmd c; c.type = Cmd::Param; c.id = nv.name.toString().toStdString(); c.v = num (nv.value); add (c); }
    }
    else if (type == "bend") {
        if (auto* o = m["b"].getDynamicObject())
            for (const auto& nv : o->getProperties()) {
                if (nv.name.toString() == "cf") {
                    if (auto* a = nv.value.getArray()) { Cmd c; c.type = Cmd::BendCf; for (int i = 0; i < 4; i++) c.cf[i] = i < a->size() ? num ((*a)[i]) : std::nan (""); add (c); }
                } else { Cmd c; c.type = Cmd::Bend; c.id = nv.name.toString().toStdString(); c.v = num (nv.value); add (c); }
            }
    }
    else if (type == "bridges") {
        Cmd clr; clr.type = Cmd::BridgesClear; add (clr);
        if (auto* o = m["br"].getDynamicObject())
            for (const auto& nv : o->getProperties()) { Cmd c; c.type = Cmd::Bridge; c.id = nv.name.toString().toStdString(); c.v = num (nv.value); add (c); }
    }
    else if (type == "noteOn") { Cmd c; c.type = Cmd::NoteOn; c.v = num (m["n"]); c.b = truthy (m["acc"]); add (c); }
    else if (type == "noteOff") { Cmd c; c.type = Cmd::NoteOff; c.v = num (m["n"]); add (c); }
    else if (type == "mode") { if (m.hasProperty ("hold")) { Cmd c; c.type = Cmd::Hold; c.b = truthy (m["hold"]); add (c); } }
    else if (type == "seq") {
        Cmd c; c.type = Cmd::Seq; const auto s = m["seq"];
        if (auto* a = s["steps"].getArray()) {
            c.hasSteps = true;
            for (const auto& st : *a) c.steps.push_back ({ truthy (st["on"]), intOf (st["o"]), truthy (st["s"]), truthy (st["a"]) });
        }
        if (s.hasProperty ("bpm")) { c.hasBpm = true; c.bpm = num (s["bpm"]); }
        static const char* lanes[4] = { "o", "on", "s", "a" };   // Engine::Lane order
        auto laneInts = [&] (const char* key, bool& has, int* dst) {
            if (! s.hasProperty (key)) return;
            has = true; const auto o = s[key];
            for (int k = 0; k < 4; k++) dst[k] = intOf (o[lanes[k]]);
        };
        laneInts ("len", c.hasLen, c.len); laneInts ("st", c.hasSt, c.st);
        if (s.hasProperty ("rt")) { c.hasRt = true; const auto o = s["rt"]; for (int k = 0; k < 4; k++) c.rt[k] = truthy (o[lanes[k]]); }
        if (s.hasProperty ("notes")) { c.hasNotes = true; if (auto* a = s["notes"].getArray()) for (const auto& n : *a) c.notes.push_back (intOf (n)); }
        if (s.hasProperty ("loop")) { c.hasLoop = true; c.loop = intOf (s["loop"]); }
        if (s.hasProperty ("adv")) { c.hasAdv = true; c.advStep = s["adv"].toString() == "step"; }
        if (s.hasProperty ("cyc")) { c.hasCyc = true; c.cyc = intOf (s["cyc"]); }
        add (c);
    }
    else if (type == "run") { Cmd c; c.type = Cmd::Run; c.b = truthy (m["on"]); add (c); }
    else if (type == "panic") { Cmd c; c.type = Cmd::Panic; add (c); }
    else if (type == "reset") { Cmd c; c.type = Cmd::Reset; add (c); }
    else if (type == "clip") { Cmd c; c.type = Cmd::Clip; c.b = truthy (m["on"]); add (c); }
    else if (type == "os") { Cmd c; c.type = Cmd::Os; c.v = intOf (m["n"]); add (c); }
}

inline void apply (Engine& e, const Cmd& c, bool useBpm = true) {
    switch (c.type) {
        case Cmd::Param: e.setParam (c.id, c.v); break;
        case Cmd::Bend: e.setBend (c.id, c.v); break;
        case Cmd::BendCf: e.setBendCf (c.cf); break;
        case Cmd::BridgesClear: e.clearBridges(); break;
        case Cmd::Bridge: e.addBridge (c.id, c.v); break;
        case Cmd::NoteOn: e.noteOn (c.v, c.b); break;
        case Cmd::NoteOff: e.noteOff (c.v); break;
        case Cmd::Hold: e.setHold (c.b); break;
        case Cmd::Seq: {
            auto& q = e.seqForUpdate();
            if (c.hasSteps) q.steps = c.steps;
            if (c.hasBpm && useBpm) q.bpm = c.bpm;
            if (c.hasLen) std::copy (c.len, c.len + 4, q.len);
            if (c.hasSt) std::copy (c.st, c.st + 4, q.st);
            if (c.hasRt) std::copy (c.rt, c.rt + 4, q.rt);
            if (c.hasNotes) q.notes = c.notes;
            if (c.hasLoop) q.loop = c.loop;
            if (c.hasAdv) q.advStep = c.advStep;
            if (c.hasCyc) q.cyc = c.cyc;
            break;
        }
        case Cmd::Os: e.setOS ((int) c.v); break;
        case Cmd::Clip: e.soft = c.b; break;
        case Cmd::Run: e.run (c.b); break;
        case Cmd::Panic: e.panic(); break;
        case Cmd::Reset: e.reset(); break;
    }
}

} // namespace shyoy
