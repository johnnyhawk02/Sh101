// Shyoy circuit engine, C++ port of site/js/dsp/engine.js (the AudioWorklet).
//
// This is a line-by-line translation: same state, same order of operations, same random number generator, all in
// double precision, so that for the same message stream it renders the same samples as the JS engine
// (plugin/tools/match.mjs checks it). When engine.js changes, change this file the same way.
// No JUCE here, so the command line renderer and the plugin share it unchanged.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <algorithm>
#include "v8/ieee754.h"

namespace shyoy {

// Math.exp, Math.pow, Math.tan... exactly as V8 computes them (V8's own fdlibm port, src/v8/), not the C library's,
// which differ in the last bit now and then. The envelope's attack comparator, the VCO reset and the resonance
// clamp are knife edges where one bit decides a whole sample, so this is what makes the output match bit for bit.
namespace jsm = v8::base::ieee754;

static constexpr double T0 = 300.15;
static constexpr double VT0 = 0.025865;
static constexpr double CT_NOM = 1e-9;
static constexpr double VTH = 10;
static constexpr double CF_NOM = 240e-12;
static constexpr double OTA_DIV = 68560.0 / 560.0;
static constexpr double CE_NOM = 10e-6;
static constexpr double CL_NOM = 0.1e-6;
static constexpr double ENV_SUP = 15;
static constexpr double ENV_TH = 15.0 * 33.0 / (82.0 + 33.0);
static constexpr double VCF_V_OCT = 0.22;
static constexpr double VCF_ENV_OCT = ENV_TH * (33.0 / 100.0) / VCF_V_OCT;
static constexpr double VCF_MOD_OCT = 5.0 * (33.0 / 100.0) / VCF_V_OCT;
static constexpr double VCO_PPM = 50e-6;
static constexpr double I_CAP_MAX = 570e-6;
static constexpr double V_PULSE = 15 - 1.3;
static constexpr double VCF_TC = 0.15;
static constexpr double VCA_IN = OTA_DIV / 151.0;
static constexpr double VCA_OUT = 0.77 / VCA_IN;
static constexpr double RES_DIODE = 1.6;
static constexpr double PI = 3.141592653589793;

static const char* const NODES[] = { "SAW", "PULSE", "SUB", "NOISE", "LFOTRI", "LFOSQ", "ENVCAP", "VCF2", "VCFOUT", "VCAOUT", "FINGER" };
static const char* const INJ[] = { "VCOCAP", "VCOCV", "PWREF", "VCFCV", "VCFIN", "VCFC2", "ENVCAP", "LFOINT", "VCACV" };
static constexpr int N_NODES = 11, N_INJ = 9;

inline double tanhA (double x) { if (x > 3) return 1; if (x < -3) return -1; const double x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
inline double clampD (double x, double a, double b) { return x < a ? a : x > b ? b : x; }
inline int subWave (int type, int c) {
    if (type == 0) return (c & 1) ? 0 : 1;
    if (type == 1) return (c & 2) ? 0 : 1;
    return c == 0 ? 1 : 0;
}
struct Biquad { double b0, b1, b2, a1, a2, z1 = 0, z2 = 0; };
inline Biquad biquadLP (double fc, double fs, double q) {
    const double w = 2 * PI * fc / fs, cs = jsm::cos (w), al = jsm::sin (w) / (2 * q), a0 = 1 + al;
    return { (1 - cs) / 2 / a0, (1 - cs) / a0, (1 - cs) / 2 / a0, -2 * cs / a0, (1 - al) / a0, 0, 0 };
}
inline double bq (Biquad& f, double x) { const double y = f.b0 * x + f.z1; f.z1 = f.b1 * x - f.a1 * y + f.z2; f.z2 = f.b2 * x - f.a2 * y; return y; }

struct SeqStep { bool on = false; int o = 0; bool s = false; bool a = false; };

class Engine {
public:
    // ---- panel (mapped) targets, P in engine.js ----
    struct Panel {
        double range = 0, tune = 0, vcoMod = 0, pw = 0.3; int pwmSrc = 1;
        double saw = 0.8, pulse = 0, sub = 0.4; int subType = 0; double noise = 0;
        double cutoff = 0.35, reso = 0.6, vcfEnv = 0.5, vcfMod = 0, kybd = 0.5;
        double att = 0.002, dec = 0.3, sus = 0, rel = 0.1; int trig = 0;
        int vcaMode = 0; double level = 0.7, lfoRate = 2; int lfoWave = 0;
        double glide = 0.05; int glideMode = 1; double accent = 0.6, drive = 0.4;
        double bendVco = 0.3, bendVcf = 0, lfoMod = 0.3, lever = 0, modPush = 0; int transpose = 0;
        double accVcf = 0;   // undefined in JS until set; read as (P.accVcf || 0)
    } P;
    // ---- components (bend board), C in engine.js ----
    struct Comp {
        double ct = CT_NOM, tReset = 0.5e-6, rDis = 50, cf[4] = { CF_NOM, CF_NOM, CF_NOM, CF_NOM };
        double fbInv = 0, otaOff = 0, ce = CE_NOM, envTh = ENV_TH, hys = 5, cl = CL_NOM;
        double tempC = 27, vBatt = 9, rBatt = 0.9;
    } C;

    // the sequencer pattern (seq.js seqMsg): lanes in the order of engine.js's laneAt { o, on, s, a }
    enum Lane { LO = 0, LON = 1, LS = 2, LA = 3 };
    struct Seq {
        std::vector<SeqStep> steps; double bpm = 120;
        int len[4] = { 0, 0, 0, 0 }, st[4] = { 0, 0, 0, 0 }; bool rt[4] = { false, false, false, false };   // len 0 = unset (all steps)
        std::vector<int> notes; int loop = 0; bool advStep = false; int cyc = 0;
    } seq;
    int laneAt[4] = { 0, 0, 0, 0 }; int noteIdx = 0, cycN = 0; double shift = 0;
    bool running = false; int stepIdx = 0; double nextStepAt = 0, gateOffAt = -1; bool lastSlide = false; double root = -1;
    int64_t t = 0;

    // outgoing messages (the worklet's port.postMessage)
    struct Listener { virtual ~Listener() = default; virtual void step (int i, const int* lanePos, int ni) = 0; virtual void meters (const double* node, double rail, double vIn, double env, double vc) = 0; };
    Listener* listener = nullptr;

    explicit Engine (double sampleRate) {
        fs = sampleRate; setOS (2);
        smc = 1 - jsm::exp (-8 / (0.01 * fs));
        for (int i = 0; i < 4; i++) { s[i] = 0; tl[i] = 1; g[i] = 0; }
        std::fill (std::begin (node), std::end (node), 0.0);
        std::fill (std::begin (inj), std::end (inj), 0.0);
        initSmooth();
    }
    double sampleRate() const { return fs; }

    // v0.55.0: the oversampling factor of the audio path (1, 2 or 4); at 1x and 4x the per-tick constants are rescaled
    void setOS (int n) {
        n = n == 1 || n == 4 ? n : 2;
        os = n; fso = fs * n; dto = 1 / fso;
        dec1 = biquadLP (0.42 * fs, fso, 0.5412); dec2 = biquadLP (0.42 * fs, fso, 1.3066);
        hpK = n == 2 ? 0.9997 : 1 - 0.0003 * 2 / n;
        pinkA = n == 2 ? 0.7 : jsm::pow (0.7, 2.0 / n);
        pinkB = n == 2 ? 0.3 : (1 - pinkA) * std::sqrt (n / 2.0) * 0.3 / (1 - 0.7);
        wMax = std::min (fs * 0.5, fso * 0.45);
    }
    int oversampling() const { return os; }

    // ---------------- messages ----------------
    void setParam (const std::string& id, double v) {
        auto& p = P;
        if (id == "range") p.range = v - 1;
        else if (id == "tune") p.tune = (v - 0.5) / 12;
        else if (id == "vcoMod") p.vcoMod = v * v;
        else if (id == "pw") p.pw = v;
        else if (id == "pwmSrc") p.pwmSrc = toInt (v);
        else if (id == "saw") p.saw = v; else if (id == "pulse") p.pulse = v; else if (id == "sub") p.sub = v;
        else if (id == "noise") p.noise = v; else if (id == "cutoff") p.cutoff = v; else if (id == "reso") p.reso = v;
        else if (id == "drive") p.drive = v; else if (id == "vcfEnv") p.vcfEnv = v; else if (id == "vcfMod") p.vcfMod = v;
        else if (id == "kybd") p.kybd = v; else if (id == "level") p.level = v; else if (id == "accent") p.accent = v;
        else if (id == "bendVco") p.bendVco = v; else if (id == "bendVcf") p.bendVcf = v; else if (id == "lfoMod") p.lfoMod = v;
        else if (id == "lever") p.lever = v; else if (id == "modPush") p.modPush = v;
        else if (id == "transpose") p.transpose = toInt (v) - 1;
        else if (id == "subType") p.subType = toInt (v);
        else if (id == "attack") p.att = 0.0015 * jsm::pow (4 / 0.0015, v);
        else if (id == "decay") p.dec = 0.002 * jsm::pow (5000.0, v);
        else if (id == "sustain") p.sus = v;
        else if (id == "release") p.rel = 0.002 * jsm::pow (5000.0, v);
        else if (id == "trig") p.trig = toInt (v);
        else if (id == "vcaMode") p.vcaMode = toInt (v);
        else if (id == "lfoRate") p.lfoRate = jsm::pow (2.0, -3.32 + v * 8.23);
        else if (id == "lfoWave") p.lfoWave = toInt (v);
        else if (id == "glide") p.glide = v < 0.01 ? 0 : 0.003 * jsm::pow (5 / 0.003, v);
        else if (id == "glideMode") p.glideMode = toInt (v);
        else if (id == "accVcf") p.accVcf = v;
    }
    void setBend (const std::string& id, double v) {
        auto& c = C;
        if (id == "ct") c.ct = v; else if (id == "tReset") c.tReset = v; else if (id == "rDis") c.rDis = v;
        else if (id == "fbInv") c.fbInv = v; else if (id == "otaOff") c.otaOff = v; else if (id == "ce") c.ce = v;
        else if (id == "envTh") c.envTh = v; else if (id == "hys") c.hys = v; else if (id == "cl") c.cl = v;
        else if (id == "tempC") c.tempC = v; else if (id == "vBatt") c.vBatt = v; else if (id == "rBatt") c.rBatt = v;
    }
    void setBendCf (const double* v) { for (int i = 0; i < 4; i++) C.cf[i] = v[i]; }
    struct Bridge { int s, d; double g; };
    std::vector<Bridge> bridges;
    void clearBridges() { bridges.clear(); }
    void addBridge (const std::string& key, double v) {
        const auto gt = key.find ('>'); if (gt == std::string::npos) return;
        const auto sN = key.substr (0, gt), dN = key.substr (gt + 1);
        int si = -1, di = -1;
        for (int i = 0; i < N_NODES; i++) if (sN == NODES[i]) si = i;
        for (int i = 0; i < N_INJ; i++) if (dN == INJ[i]) di = i;
        if (si >= 0 && di >= 0 && v > 0) bridges.push_back ({ si, di, 1 / (10e6 * jsm::pow (1e-4, v)) });
    }
    void noteOn (double n, bool acc) { keyOn (n, acc); }
    void noteOff (double n) { keyOff (n); }
    void setHold (bool h) { hold = h; }
    // Object.assign (this.seq, m.seq): only what the message carries changes (see Messages.h)
    Seq& seqForUpdate() { return seq; }
    void run (bool on) {
        if (on && ! running) { running = true; stepIdx = 0; nextStepAt = (double) t; lastSlide = false; root = -1; for (auto& a : laneAt) a = 0; noteIdx = 0; shift = 0; cycN = 0; }
        else if (! on && running) { running = false; gateOff(); gateOffAt = -1; if (listener) listener->step (-1, nullptr, -1); }
    }
    void panic() { keys.clear(); gateOff(); }
    void reset() { vc = 0; for (int i = 0; i < 4; i++) { s[i] = 0; tl[i] = 1; } ve = 0; ltri = 0; }

    // ---------------- audio ----------------
    // Renders n samples into L (and R if given), exactly as the worklet's process() does for one render quantum.
    void process (float* L, float* R, int n) {
        const double dt = 1 / fs;
        auto& p = P; auto& c = C;
        const int osN = os;
        const double accUp = 1 - jsm::exp (-1 / (0.02 * fs)), accDn = 1 - jsm::exp (-1 / (0.15 * fs));
        const double gateC = 1 - jsm::exp (-1 / (0.0015 * fs));
        const double loadC = 1 - jsm::exp (-1 / (0.05 * fs));
        const double eA = 1 - jsm::exp (-dt / (p.att / (jsm::log (ENV_SUP / (ENV_SUP - ENV_TH)) * CE_NOM) * c.ce));
        const double eD = 1 - jsm::exp (-dt / (p.dec / (4 * CE_NOM) * c.ce));
        const double eR = 1 - jsm::exp (-dt / (p.rel / (4 * CE_NOM) * c.ce));

        for (int j = 0; j < n; j++) {
            if (running) {
                if ((double) t >= nextStepAt) seqStep();
                if (gateOffAt >= 0 && (double) t >= gateOffAt) { gateOff(); gateOffAt = -1; }
            }
            t++;
            if ((t & 7) == 0) for (int k = 0; k < N_SM; k++) sm[k] += (*smSrc[k] - sm[k]) * smc;
            const double smCutoff = sm[0], smReso = sm[1], smSaw = sm[2], smPulse = sm[3], smSub = sm[4], smNoise = sm[5], smPw = sm[6],
                smLevel = sm[7], smDrive = sm[8], smVcfEnv = sm[9], smVcfMod = sm[10], smKybd = sm[11], smVcoMod = sm[12], smLever = sm[13],
                smModPush = sm[14], smBendVco = sm[15], smBendVcf = sm[16], smLfoMod = sm[17], smTune = sm[18], smTempC = sm[19], smVBatt = sm[20];

            // ---- power supply ----
            load += (0.11 + std::abs (out) * 0.08 + ve * 0.004 - load) * loadC;
            const double vIn = smVBatt - load * c.rBatt;
            rail = clampD ((vIn - 0.6) / 5.4, 0.05, 1);
            const double Tk = 273.15 + smTempC, tsc = T0 / Tk;

            // ---- bridges ----
            for (int i = 0; i < N_INJ; i++) inj[i] = 0;
            for (const auto& x : bridges) inj[x.d] += node[x.s] * x.g;

            // ---- LFO ----
            const double vsat = 10 * rail;
            const double kInt = p.lfoRate * 4 * 5 * (CL_NOM / c.cl);
            ltri += (lsq > 0 ? 1 : -1) * kInt * (vsat / 10) * dt + inj[7] / c.cl * dt;
            const double hys = c.hys * rail;
            if (ltri > hys && lsq > 0) { ltri = hys; lsq = -1; }
            else if (ltri < -hys && lsq < 0) {
                ltri = std::max (ltri, -hys); lsq = 1; rnd = rand();
                if (p.trig == 2 && gate) stage = 1;
            }
            ltri = clampD (ltri, -vsat, vsat);
            lnoise += (rand() - lnoise) * 0.02;
            double lfo;
            switch (p.lfoWave) {
                case 0: lfo = ltri / 5; break;
                case 1: lfo = lsq * vsat / 10; break;
                case 2: lfo = rnd; break;
                default: lfo = clampD (lnoise * 4, -1, 1);
            }

            // ---- envelope ----
            const double Ce = c.ce;
            if (stage == 1) { ve += (ENV_SUP * rail - ve) * eA; if (ve >= c.envTh) stage = 2; }
            else if (stage == 2) { ve += (p.sus * ENV_TH - ve) * eD; }
            else if (stage == 3) { ve += (0 - ve) * eR; }
            ve += inj[6] / Ce * dt;
            ve = clampD (ve, -0.6, ENV_SUP * rail);
            const double env = std::max (0.0, ve) / ENV_TH;
            gateSm += ((gate ? 1 : 0) - gateSm) * gateC;

            // ---- accent ----
            const double accT = accOn * env;
            accCap += (accT - accCap) * (accT > accCap ? accUp : accDn);
            accBoost += (accOn * (gate ? 1 : 0) - accBoost) * gateC;

            // ---- portamento ----
            pitch += (pitchT - pitch) * glideCoef;

            // ---- VCO control ----
            const double lfoAmt = clampD (smVcoMod + smModPush * smLfoMod, 0, 2);
            const double octCV = (pitch - 69) / 12 + p.range + smTune + lfo * lfoAmt * 0.5 + smLever * smBendVco
                + clampD (inj[1] * 100e3, -6, 6);
            const double octEff = octCV + jsm::log2 (1 + VCO_PPM * (smTempC - 27));
            const double Ic = 442 * jsm::pow (2.0, octEff) * CT_NOM * VTH * rail;
            const double dV = clampD (Ic + inj[0], -I_CAP_MAX, I_CAP_MAX) / c.ct * dto;
            double duty;
            if (p.pwmSrc == 0) duty = 0.5 - smPw * 0.5 * (lfo + 1) / 2;
            else if (p.pwmSrc == 1) duty = 0.5 - smPw * 0.5;
            else duty = 0.5 - smPw * 0.5 * std::min (1.0, env);
            double vpw = VTH * (1 - duty);
            vpw = clampD (vpw + inj[2] * 10e3, 0.05, VTH * 1.2);
            if (duty <= 0.004) vpw = VTH * 1.2;
            const double disTau = c.rDis * c.ct;
            const bool fastReset = c.tReset < dto * 0.5;
            const double resid = fastReset ? VTH * jsm::exp (-c.tReset / disTau) : 0;
            const double decay1 = jsm::exp (-dto / disTau);

            // ---- VCF control ----
            const double fcOct = smCutoff * 10.966 - 6.644
                + smLever * smBendVcf * 4
                + smVcfEnv * env * VCF_ENV_OCT + accCap * p.accVcf * 2
                + lfo * ((jsm::pow (10.0, 2 * smVcfMod) - 1) / 99) * VCF_MOD_OCT
                + (pitch - 60) / 12 * smKybd
                + clampD (inj[3] * 100e3, -8, 8);
            const double fcBase = 1000 * jsm::pow (2.0, fcOct * (1 + (tsc - 1) * VCF_TC)) * rail;
            if ((t & 1) == 0 || std::abs (fcBase - fcLast) > fcLast * 0.02) {
                fcLast = fcBase;
                for (int i = 0; i < 4; i++) {
                    const double w = PI * std::min (fcBase * CF_NOM / c.cf[i], wMax) / fso;
                    g[i] = w < 0.3 ? w * (1 + w * w * (1.0 / 3 + w * w * 2 / 15)) : jsm::tan (w);
                }
            }
            const double kFull = smReso * 4.3, kRoll = kFull / (1 + jsm::pow (fcBase / 20000, 4.0));
            const double k0 = kRoll * (c.fbInv != 0 ? -1 : 1);
            const double passComp = c.fbInv != 0 ? 1 : (1 + kRoll) / (1 + kFull);
            const double att = (0.004 + smDrive * 0.03) * passComp;
            const double offN = c.otaOff / (2 * VT0);
            const double c2inj = inj[5] * dto / (c.cf[1] * 2 * VT0) * 2;
            const double vcfInj = inj[4] * 10e3 / (2 * VT0);

            // ---- VCA control ----
            const double amp = (p.vcaMode == 0 ? env : gateSm) * (1 + accBoost * p.accent * 0.9) + inj[8] * 47e3 / 5;
            const double gain = clampD (amp, 0, 3);
            const double railV = 13.5 * rail;
            const double lvSub = smSub, lvSaw = smSaw, lvPul = smPulse, lvNoi = smNoise;
            const int subType = p.subType;
            const double vdd = 5 * rail;

            double y = 0;
            for (int o = 0; o < osN; o++) {
                double ev = -1, evH = 0, evP = 0, evS = 0;
                const double vPrev = vc;
                if (resetLeft > 0) {
                    vc = vc * decay1 + dV;
                    resetLeft -= dto;
                } else {
                    vc += dV;
                    if (vc >= VTH && dV > 0) {
                        const double over = vc - VTH, d = clampD (over / dV, 0, 1);
                        const int sPrev = subWave (subType, subC);
                        subC = (subC + 1) & 3;
                        const int sNow = subWave (subType, subC);
                        if (fastReset) {
                            vc = resid + over;
                            ev = d; evH = vc - (VTH + over);
                        } else {
                            resetLeft = c.tReset - d * dto;
                            vc = VTH * jsm::exp (-d * dto / disTau);
                        }
                        evS = (sNow - sPrev) * vdd;
                        if (ev < 0) ev = d;
                    }
                }
                if (vc < -0.6) vc = -0.6;
                if (vc > 14) vc = 14;
                const double vcNow = vc;
                const int cmpNow = vcNow > vpw ? 1 : 0;
                double dP = -1;
                if (cmpNow != cmp) {
                    if (cmpNow == 1) dP = clampD ((vcNow - vpw) / std::max (1e-9, vcNow - vPrev), 0, 1);
                    else dP = ev >= 0 ? ev : 0.5;
                    evP = (cmpNow - cmp) * V_PULSE * rail;
                    cmp = cmpNow;
                }
                const double subNow = subWave (subType, subC) * vdd;
                double outSaw = oSaw + cSaw, outPul = oPul + cPul, outSub = oSub + cSub;
                cSaw = 0; cPul = 0; cSub = 0;
                if (ev >= 0) {
                    const double a = ev * ev * 0.5, b = (1 - ev) * (1 - ev) * 0.5;
                    if (evH != 0) { outSaw += evH * a; cSaw -= evH * b; }
                    if (evS != 0) { outSub += evS * a; cSub -= evS * b; }
                }
                if (dP >= 0) { outPul += evP * dP * dP * 0.5; cPul -= evP * (1 - dP) * (1 - dP) * 0.5; }
                oSaw = vcNow; oPul = cmpNow * V_PULSE * rail; oSub = subNow;

                pink = pink * pinkA + rand() * pinkB;

                double mix = (outSaw - VTH / 2) * 0.5 * lvSaw + (outPul - V_PULSE * rail * 0.5) * (5 / V_PULSE) * lvPul + (outSub - vdd * 0.5) * lvSub + pink * 3 * lvNoi;
                mix = railV * tanhA (-mix / railV);
                const double hp = mix - hpx + hpK * hpy; hpx = mix; hpy = hp;

                const double xin = hp * att / (2 * VT0) + offN + vcfInj;
                const double G0 = g[0] * tl[0], G1 = g[1] * tl[1], G2 = g[2] * tl[2], G3 = g[3] * tl[3];
                const double a0 = G0 / (1 + G0), a1 = G1 / (1 + G1), a2 = G2 / (1 + G2), a3 = G3 / (1 + G3);
                const double b0 = s[0] / (1 + G0), b1 = s[1] / (1 + G1), b2 = s[2] / (1 + G2), b3 = s[3] / (1 + G3);
                const double A = a0 * a1 * a2 * a3, B = ((b0 * a1 + b1) * a2 + b2) * a3 + b3;
                const double y4p = y4s, kd = std::abs (y4p) < 1e-4 ? 1 : RES_DIODE * tanhA (y4p / RES_DIODE) / y4p;
                const double k = k0 * kd;
                const double y4e = (A * xin + B) / (1 + k * A);
                const double x0 = xin - k * y4e;
                const double y1 = a0 * x0 + b0, y2 = a1 * y1 + b1, y3 = a2 * y2 + b2, y4 = a3 * y3 + b3;
                s[0] = clampD (2 * y1 - s[0], -30, 30); s[1] = clampD (2 * y2 - s[1] + c2inj, -30, 30);
                s[2] = clampD (2 * y3 - s[2], -30, 30); s[3] = clampD (2 * y4 - s[3], -30, 30);
                double e;
                e = (x0 - y1) * tsc; tl[0] = std::abs (e) < 1e-4 ? tsc : tsc * tanhA (e) / e;
                e = (y1 - y2) * tsc; tl[1] = std::abs (e) < 1e-4 ? tsc : tsc * tanhA (e) / e;
                e = (y2 - y3) * tsc; tl[2] = std::abs (e) < 1e-4 ? tsc : tsc * tanhA (e) / e;
                e = (y3 - y4) * tsc; tl[3] = std::abs (e) < 1e-4 ? tsc : tsc * tanhA (e) / e;
                y2s = y2; y4s = y4;

                const double vcaIn = y4 * VCA_IN;
                const double v = tanhA (vcaIn * tsc) * gain * VCA_OUT;
                y = osN > 1 ? bq (dec2, bq (dec1, v)) : v;
            }
            node[0] = oSaw; node[1] = oPul; node[2] = oSub; node[3] = pink;
            node[4] = ltri; node[5] = lsq * vsat; node[6] = ve;
            node[7] = y2s * 2 * VT0 * OTA_DIV; node[8] = y4s * 2 * VT0 * OTA_DIV; node[9] = out * 4;
            humPh += 50 / fs; if (humPh >= 1) humPh -= 1;
            node[10] = 0.4 * jsm::sin (2 * PI * humPh) + 0.12 * jsm::sin (6 * PI * humPh) + rand() * 0.05;

            const double dcOut = y - dcx + 0.9995 * dcy; dcx = y; dcy = dcOut;
            out = dcOut;
            const float o = (float) clampD (dcOut * smLevel, -1, 1); L[j] = o; if (R) R[j] = o;
        }
        meterAt += n;
        if (meterAt >= 2048) {
            meterAt = 0;
            if (listener) listener->meters (node, rail, C.vBatt - load * C.rBatt, ve, vc);
        }
    }

    // read-only views for the plugin (meters, tests)
    int stageNow() const { return stage; }
    double pitchTarget() const { return pitchT; }

private:
    double fs, fso, dto, smc; int os = 2; double hpK = 0.9997, pinkA = 0.7, pinkB = 0.3, wMax = 0;
    // smoothed panel values: the order of sm in engine.js
    static constexpr int N_SM = 21;
    double sm[N_SM];
    const double* smSrc[N_SM];
    void initSmooth() {
        const double init[N_SM] = { 0.35, 0.6, 0.8, 0, 0.4, 0, 0.3, 0.7, 0.4, 0.5, 0, 0.5, 0, 0, 0, 0.3, 0, 0.3, 0, 27, 9 };
        for (int i = 0; i < N_SM; i++) sm[i] = init[i];
        const double* src[N_SM] = { &P.cutoff, &P.reso, &P.saw, &P.pulse, &P.sub, &P.noise, &P.pw, &P.level, &P.drive, &P.vcfEnv, &P.vcfMod,
            &P.kybd, &P.vcoMod, &P.lever, &P.modPush, &P.bendVco, &P.bendVcf, &P.lfoMod, &P.tune, &C.tempC, &C.vBatt };
        for (int i = 0; i < N_SM; i++) smSrc[i] = src[i];
    }
    static int toInt (double v) { return std::isfinite (v) ? (int) (int64_t) v : 0; }   // v | 0

    double vc = 0, resetLeft = 0; int subC = 0, cmp = 0;
    double oSaw = 0, oPul = 0, oSub = 0, cSaw = 0, cPul = 0, cSub = 0;
    uint32_t rng = 22222; double pink = 0;
    double hpx = 0, hpy = 0;
    double s[4], tl[4], g[4];
    double ve = 0; int stage = 0; bool gate = false; double gateSm = 0;
    double ltri = 0, lsq = 1, rnd = 0, lnoise = 0, humPh = 0;
    double pitch = 48, pitchT = 48, glideCoef = 1;
    double accOn = 0, accCap = 0, accBoost = 0;
    double load = 0, rail = 1;
    double dcx = 0, dcy = 0;
    Biquad dec1, dec2;
    std::vector<double> keys;
    bool hold = false;
    int meterAt = 0;
    double node[N_NODES], inj[N_INJ];
    double y4s = 0, y2s = 0, out = 0, fcLast = 1000;

    double rand() { uint32_t x = rng; x ^= x << 13; x ^= x >> 17; x ^= x << 5; rng = x; return ((double) rng / 2147483648.0) - 1; }

    void setPitch (double n, double glideTime) {
        pitchT = n;
        if (glideTime > 0) glideCoef = 1 - jsm::exp (-1 / (glideTime * fs));
        else { glideCoef = 1; pitch = n; }
    }
    void trigger (bool acc) { stage = 1; gate = true; accOn = acc ? 1 : 0; }
    void gateOff() { if (gate) { gate = false; stage = 3; } }
    void keyOn (double n, bool acc) {
        n += P.transpose * 12;
        if (running) {
            root = n - 12;
            if (! seq.notes.empty()) shift = n - P.transpose * 12 - seq.notes[0];
            for (int k = 0; k < 4; k++) if (seq.rt[k]) laneAt[k] = stepIdx;
            if (seq.rt[LON]) noteIdx = 0;
            return;
        }
        const bool legato = ! keys.empty() && gate;
        keys.erase (std::remove (keys.begin(), keys.end(), n), keys.end()); keys.push_back (n);
        const int gm = P.glideMode;
        setPitch (n - 12, gm == 2 || (gm == 1 && legato) ? P.glide : 0);
        if (! legato || P.trig == 0) trigger (acc);
    }
    void keyOff (double n) {
        n += P.transpose * 12;
        if (running) return;
        const bool top = ! keys.empty() && keys.back() == n;
        keys.erase (std::remove (keys.begin(), keys.end(), n), keys.end());
        if (! keys.empty()) { if (! top) return; setPitch (keys.back() - 12, P.glideMode ? P.glide : 0); if (P.trig == 0) trigger (false); }
        else if (! hold) gateOff();
    }
    void seqStep() {
        const int N = stepIdx, n16 = std::max (1, (int) seq.steps.size());
        if (seq.cyc > 0) { if (cycN >= seq.cyc) { for (auto& a : laneAt) a = N; cycN = 0; } cycN++; }
        int pos[4];
        for (int k = 0; k < 4; k++) {
            const int a = std::max (0, std::min (n16 - 1, seq.st[k])), len = std::max (1, std::min (n16 - a, seq.len[k] ? seq.len[k] : n16));
            pos[k] = a + ((N - laneAt[k]) % len + len) % len;
        }
        auto lane = [&] (int k) { return pos[k] < (int) seq.steps.size() ? seq.steps[(size_t) pos[k]] : SeqStep(); };
        const SeqStep st { lane (LON).on, lane (LO).o, lane (LS).s, lane (LA).a };
        const int i = N; int ni = -1;
        const double dur = fs * 60 / seq.bpm / 4;
        nextStepAt += dur;
        const int NN = (int) seq.notes.size(), LP = seq.loop > 0 ? seq.loop : NN;
        int nk = -1;
        if (NN && (st.on || seq.advStep)) { const int c = noteIdx % LP; noteIdx = c + 1; nk = c % NN; ni = nk; }
        if (! st.on) { gateOff(); gateOffAt = -1; lastSlide = false; }
        else {
            double base;
            if (nk >= 0) base = seq.notes[(size_t) nk] + shift + 12 * P.transpose - 12;
            else base = root >= 0 ? root : 36 + 12 * P.transpose;
            const double n = base + 12 * std::max (0, std::min (2, st.o));
            if (lastSlide && gate) { setPitch (n, std::max (P.glide, 0.015)); accOn = st.a ? 1 : 0; }
            else { setPitch (n, P.glideMode == 2 ? P.glide : 0); trigger (st.a); }
            gateOffAt = st.s ? -1 : (double) t + dur * 0.5; lastSlide = st.s;
        }
        if (listener) listener->step (i, pos, ni);
        stepIdx = (N + 1) % 720720;
    }
};

} // namespace shyoy
