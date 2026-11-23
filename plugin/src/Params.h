// The plugin's host parameters (v0.57.9, Johnny: "the controls need to be assignable in ableton etc"): every panel
// control and the sequencer, so a DAW can automate them and map them to its controllers. The panel stays the web app:
// the processor keeps these in step with it both ways (PluginProcessor.cpp, host <-> page).
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <cmath>

namespace shyoy {

struct ParamDef {
    enum Kind { Synth, Step, Lane, SeqNum, Play } kind;
    std::string id;         // the page's id: state.params key, or a seq field
    juce::String name;
    juce::StringArray opts; // a switch: one choice per position
    int lo = 0, hi = 1;     // whole numbers (SeqNum, Lane counts)
    int step = -1, lane = -1; char field = 0;   // Step: step 0..15 and field o/n/s/a; Lane: lane 0..3 and field l (len) s (start) r (retrig)
};

static const char* const LANE_KEY[4] = { "o", "on", "s", "a" };          // Engine::Lane order
static const char* const LANE_NAME[4] = { "Octave", "Gate", "Slide", "Accent" };

inline std::vector<ParamDef> paramDefs() {
    std::vector<ParamDef> d;
    auto f = [&] (const char* id, const char* name) { ParamDef p { ParamDef::Synth, id, name }; d.push_back (p); };
    auto s = [&] (const char* id, const char* name, juce::StringArray o) { ParamDef p { ParamDef::Synth, id, name }; p.opts = o; d.push_back (p); };
    // the panel, in its order (view3d.js PANEL)
    f ("lfoRate", "LFO Rate"); s ("lfoWave", "LFO Wave", { "Tri", "Square", "Random", "Noise" });
    s ("range", "VCO Range", { "16'", "8'", "4'", "2'" }); f ("tune", "VCO Tune"); f ("vcoMod", "VCO Mod"); f ("pw", "VCO PW"); s ("pwmSrc", "VCO PWM Source", { "LFO", "Man", "Env" });
    f ("saw", "Saw"); f ("pulse", "Pulse"); f ("sub", "Sub"); f ("noise", "Noise"); s ("subType", "Sub Type", { "-1 Sq", "-2 Sq", "-2 25%" });
    f ("cutoff", "VCF Cutoff"); f ("reso", "VCF Res"); f ("vcfEnv", "VCF Env"); f ("vcfMod", "VCF Mod"); f ("kybd", "VCF Kybd"); f ("drive", "VCF Drive"); f ("accVcf", "VCF Accent");
    f ("attack", "Attack"); f ("decay", "Decay"); f ("sustain", "Sustain"); f ("release", "Release"); s ("trig", "Env Trigger", { "Gate+Trig", "Gate", "LFO" });
    s ("vcaMode", "VCA Mode", { "Env", "Gate" }); f ("level", "Level");
    f ("bendVco", "Bender VCO"); f ("bendVcf", "Bender VCF"); f ("lfoMod", "Bender LFO Mod"); s ("transpose", "Octave", { "Low", "Mid", "High" });
    f ("glide", "Porta"); s ("glideMode", "Porta Mode", { "Off", "Auto", "On" }); f ("accent", "Accent");
    // the sequencer
    { ParamDef p { ParamDef::Play, "run", "Seq Play" }; d.push_back (p); }
    for (int i = 0; i < 16; i++)
        for (auto [fc, nm] : { std::pair<char, const char*> { 'n', "Gate" }, { 'o', "Octave" }, { 's', "Slide" }, { 'a', "Accent" } }) {
            ParamDef p { ParamDef::Step, "step" + std::to_string (i + 1) + nm, "Step " + juce::String (i + 1) + " " + nm };
            p.step = i; p.field = fc; if (fc == 'o') p.opts = { "0", "+1", "+2" };
            d.push_back (p);
        }
    for (int k = 0; k < 4; k++) {
        ParamDef l { ParamDef::Lane, std::string ("len") + LANE_NAME[k], juce::String (LANE_NAME[k]) + " Length" }; l.lane = k; l.field = 'l'; l.lo = 1; l.hi = 16; d.push_back (l);
        ParamDef s0 { ParamDef::Lane, std::string ("start") + LANE_NAME[k], juce::String (LANE_NAME[k]) + " Start" }; s0.lane = k; s0.field = 's'; s0.lo = 1; s0.hi = 16; d.push_back (s0);
        ParamDef r { ParamDef::Lane, std::string ("retrig") + LANE_NAME[k], juce::String (LANE_NAME[k]) + " Retrig" }; r.lane = k; r.field = 'r'; d.push_back (r);
    }
    { ParamDef p { ParamDef::SeqNum, "loop", "Note Cycle" }; p.lo = 0; p.hi = 64; d.push_back (p); }
    { ParamDef p { ParamDef::SeqNum, "adv", "Next Note On" }; p.opts = { "Gate", "1/16" }; d.push_back (p); }
    { ParamDef p { ParamDef::SeqNum, "cyc", "Step Cycle" }; p.lo = 0; p.hi = 64; d.push_back (p); }
    return d;
}

// what a fader shows (defs.js fmt)
inline juce::String synthText (const std::string& id, double v) {
    auto ms = [] (double s) { return s < 1 ? juce::String (s * 1000, s < 0.01 ? 1 : 0) + " ms" : juce::String (s, 2) + " s"; };
    if (id == "lfoRate") { const double hz = std::pow (2.0, -3.32 + v * 8.23); return juce::String (hz, hz < 10 ? 2 : 1) + " Hz"; }
    if (id == "tune") return juce::String ((v - 0.5) * 100, 0) + " c";
    if (id == "pw") return juce::String (50 - v * 50, 0) + "%";
    if (id == "cutoff") { const double hz = 1000 * std::pow (2.0, v * 10.966 - 6.644); return hz < 1000 ? juce::String (hz, 0) + " Hz" : juce::String (hz / 1000, 1) + " kHz"; }
    if (id == "accVcf") return v < 0.005 ? juce::String ("off") : "+" + juce::String (v * 2, 1) + " oct";
    if (id == "attack") return ms (0.0015 * std::pow (4 / 0.0015, v));
    if (id == "decay" || id == "release") return ms (0.002 * std::pow (5000.0, v));
    if (id == "glide") return v < 0.01 ? juce::String ("off") : ms (0.003 * std::pow (5 / 0.003, v));
    if (id == "bendVco") return juce::String (juce::CharPointer_UTF8 ("\xc2\xb1")) + juce::String (v * 12, 1) + " st";
    if (id == "bendVcf") return juce::String (juce::CharPointer_UTF8 ("\xc2\xb1")) + juce::String (v * 4, 1) + " oct";
    return juce::String (juce::roundToInt (v * 100)) + "%";
}

} // namespace shyoy
