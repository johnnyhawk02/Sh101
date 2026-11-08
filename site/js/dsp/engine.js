// Kestrel MS-1 circuit-level engine (AudioWorklet).
//
// Every stage is written in physical units (volts, amps, farads, ohms, kelvin)
// and integrated in time, so changing a component value changes the sound the
// way it would on the bench. The audio path runs 2x oversampled.
//
//  VCO  : exponential converter (Vt-dependent) sets a charging current into a
//         timing cap; a comparator at Vth fires a reset transistor that
//         discharges the cap through its on-resistance for a set pulse width.
//         Pulse = second comparator against the PW reference. Sub = two
//         flip-flops clocked by the reset, CMOS output at the logic rail.
//  MIX  : inverting op-amp summer with soft rail clipping, coupling cap.
//  VCF  : four OTA-C integrator stages, each I = Iabc*tanh(dV/2Vt) into its
//         own cap, with resonance feedback from stage 4. Solved per sample
//         with a zero-delay (TPT) structure linearised around the last state.
//  VCA  : OTA with tanh input and envelope-driven Iabc.
//  ENV  : timing cap charged/discharged through attack/decay/release
//         resistors, comparator ends attack at a threshold voltage.
//  LFO  : op-amp integrator + Schmitt trigger relaxation oscillator.
//  PSU  : battery with internal resistance feeding a regulator; sags under
//         load and drops out when starved.
//  BEND : any node can be bridged to any injection point through a resistor.

const T0 = 300.15;               // calibration temperature (27 C)
const VT0 = 0.025865;            // thermal voltage at T0
const CT_NOM = 1e-9;             // VCO timing cap
// Values marked [SM] are read from the SH-101 service manual schematic (synth board OPH177-2).
const VTH = 10;                  // CEM3340 saw peak (0..10 V ramp)
const CF_NOM = 240e-12;          // [SM] IR3109 stage caps C47, C48, C50, C51 = 240 pF
const OTA_DIV = 68560 / 560;     // [SM] 68k / 560R divider in front of each IR3109 OTA input
const CE_NOM = 10e-6;            // [SM] envelope timing cap C58 = 10 uF
const CL_NOM = 0.1e-6;           // [SM] LFO integrator cap C9 = 0.1 uF
const ENV_SUP = 15;              // envelope charges from the +15 V rail
const ENV_TH = 15 * 33 / (82 + 33); // [SM] attack comparator from R158 82k / R161 33k divider (~4.3 V)
const VCF_V_OCT = 0.22;          // [SM] CV summer (R192 33k fb): KYBD via R193 150k -> 0.22 V per octave
const VCF_ENV_OCT = ENV_TH * (33 / 100) / VCF_V_OCT;  // [SM] ENV via R189 100k: ~6.5 oct at full
const VCF_MOD_OCT = 5 * (33 / 100) / VCF_V_OCT;       // [SM] MOD via R191 100k: LFO +-5 V -> +-7.5 oct
const VCO_PPM = 50e-6;           // CEM3340 datasheet: on-chip tempco cancellation, drift ~50 ppm/C typ
const I_CAP_MAX = 570e-6;        // CEM3340 datasheet: max timing-cap charge current ~570 uA typ
const V_PULSE = 15 - 1.3;        // CEM3340 pulse: open-emitter output, high = V+ - 1.3 V
const VCF_TC = 0.15;             // [SM] SDT-1000 thermistor (TH1) compensates the IR3109 expo
const VCA_IN = OTA_DIV / 151;    // [SM] R130 150k / R139 1k divider into the BA662
const VCA_OUT = 0.77 / VCA_IN;   // output scaled so small-signal loudness matches the earlier build
const RES_DIODE = 1.6;           // [SM] D30/D31 clamp in the resonance loop (normalised OTA units)

const NODES = ['SAW', 'PULSE', 'SUB', 'NOISE', 'LFOTRI', 'LFOSQ', 'ENVCAP', 'VCF2', 'VCFOUT', 'VCAOUT', 'FINGER'];
const INJ = ['VCOCAP', 'VCOCV', 'PWREF', 'VCFCV', 'VCFIN', 'VCFC2', 'ENVCAP', 'LFOINT', 'VCACV'];

function tanh(x) { if (x > 3) return 1; if (x < -3) return -1; const x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function subWave(type, c) {
  if (type === 0) return (c & 1) ? 0 : 1;
  if (type === 1) return (c & 2) ? 0 : 1;
  return c === 0 ? 1 : 0;
}
function biquadLP(fc, fs, q) {
  const w = 2 * Math.PI * fc / fs, cs = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return { b0: (1 - cs) / 2 / a0, b1: (1 - cs) / a0, b2: (1 - cs) / 2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0, z1: 0, z2: 0 };
}
function bq(f, x) { const y = f.b0 * x + f.z1; f.z1 = f.b1 * x - f.a1 * y + f.z2; f.z2 = f.b2 * x - f.a2 * y; return y; }

class KestrelProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const fs = sampleRate; this.fs = fs; this.os = 2; this.fso = fs * 2; this.dto = 1 / this.fso;
    this.t = 0;
    // panel (mapped) targets
    this.P = {
      range: 0, tune: 0, vcoMod: 0, pw: 0.3, pwmSrc: 1, drift: 0.25,
      saw: 0.8, pulse: 0, sub: 0.4, subType: 0, noise: 0,
      cutoff: 0.35, reso: 0.6, vcfEnv: 0.5, vcfMod: 0, kybd: 0.5,
      att: 0.002, dec: 0.3, sus: 0, rel: 0.1, trig: 0,
      vcaMode: 0, level: 0.7, lfoRate: 2, lfoWave: 0,
      glide: 0.05, glideMode: 1, slide: 0.06, accent: 0.6, drive: 0.4,
      bendVco: 0.3, bendVcf: 0, lfoMod: 0.3, lever: 0, modPush: 0, transpose: 0,
    };
    // components (bend board)
    this.C = {
      ct: CT_NOM, tReset: 0.5e-6, rDis: 50, cf: [CF_NOM, CF_NOM, CF_NOM, CF_NOM],
      fbInv: 0, otaOff: 0, ce: CE_NOM, envTh: ENV_TH, hys: 5, cl: CL_NOM,
      tempC: 27, vBatt: 9, rBatt: 0.9,
    };
    this.sm = { cutoff: 0.35, reso: 0.6, saw: 0.8, pulse: 0, sub: 0.4, noise: 0, pw: 0.3, level: 0.7, drive: 0.4, vcfEnv: 0.5, vcfMod: 0, kybd: 0.5, vcoMod: 0, lever: 0, modPush: 0, bendVco: 0.3, bendVcf: 0, lfoMod: 0.3, tune: 0, tempC: 27, vBatt: 9 };
    this.smc = 1 - Math.exp(-8 / (0.01 * fs));
    this.bridges = [];
    // VCO state
    this.vc = 0; this.resetLeft = 0; this.subC = 0; this.cmp = 0;
    this.oSaw = 0; this.oPul = 0; this.oSub = 0; this.cSaw = 0; this.cPul = 0; this.cSub = 0;
    this.drift = 0; this.driftT = 0;
    // noise
    this.rng = 22222; this.pink = 0;
    // mixer coupling cap
    this.hpx = 0; this.hpy = 0;
    // VCF
    this.s = new Float64Array(4); this.tl = new Float64Array([1, 1, 1, 1]); this.g = new Float64Array(4);
    // ENV
    this.ve = 0; this.stage = 0; this.gate = false; this.gateSm = 0;
    // LFO
    this.ltri = 0; this.lsq = 1; this.rnd = 0; this.lnoise = 0; this.humPh = 0;
    // pitch
    this.pitch = 48; this.pitchT = 48; this.glideCoef = 1;
    // accent
    this.accOn = 0; this.accCap = 0; this.accBoost = 0;
    // PSU
    this.load = 0; this.rail = 1;
    // output
    this.dcx = 0; this.dcy = 0;
    this.dec1 = biquadLP(0.42 * fs, this.fso, 0.5412); this.dec2 = biquadLP(0.42 * fs, this.fso, 1.3066);
    this.keys = [];
    this.seq = { steps: [], length: 16, bpm: 120, swing: 0, gateLen: 0.5 };
    this.arp = 0; this.seqMode = 0; this.hold = false; this.arpNotes = []; this.arpIdx = -1; this.arpDir = 1; this.allUp = true;
    this.s101 = []; this.s101Idx = 0; this.s101Tr = 0;
    this.running = false; this.stepIdx = 0; this.n16 = 0; this.nextStepAt = 0; this.gateOffAt = -1; this.lastSlide = false; this.transpose = 0;
    this.meterAt = 0;
    this.node = new Float64Array(NODES.length);
    this.inj = new Float64Array(INJ.length);
    this.y4 = 0; this.y2 = 0; this.out = 0; this.clockPending = false; this.fcLast = 1000;
    this.fxc = new FxChain(sampleRate); // effects from the 303 app (src/fx.js, loaded ahead of this file)
    this.port.onmessage = (e) => this.onMsg(e.data);
  }

  rand() { let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rng = x >>> 0; return (this.rng / 2147483648) - 1; }

  onMsg(m) {
    switch (m.type) {
      case 'param': if (m.id in FX_KNOB_DEFS) this.fxc.setKnob(m.id, m.v); else this.setParam(m.id, m.v); break;
      case 'params': for (const k in m.p) this.setParam(k, m.p[k]); break;
      case 'bend': for (const k in m.b) this.setBend(k, m.b[k]); break;
      case 'bridges':
        this.bridges = [];
        for (const k in m.br) {
          const [s, d] = k.split('>'); const si = NODES.indexOf(s), di = INJ.indexOf(d);
          if (si >= 0 && di >= 0 && m.br[k] > 0) this.bridges.push([si, di, 1 / (10e6 * Math.pow(1e-4, m.br[k]))]);
        }
        break;
      case 'noteOn': this.keyOn(m.n); break;
      case 'noteOff': this.keyOff(m.n); break;
      case 'seq': Object.assign(this.seq, m.seq); if (m.seq.bpm) this.fxc.setBpm(m.seq.bpm); break;
      case 'fx': this.fxc.setFx(m.name, m.on); break;
      case 'ir': this.fxc.conv.setIR(m.id, m.L, m.R); break; // a recorded impulse response for Conv, decoded at this rate
      case 'fxknobs': for (const k in m.k) this.fxc.knobs[k] = m.k[k]; this.fxc.derive(); break;
      case 'mode': {
        const was = this.arp || this.seqMode === 2;
        if ('arp' in m) this.arp = m.arp | 0;
        if ('seq' in m) this.seqMode = m.seq | 0;
        if ('hold' in m) { this.hold = !!m.hold; if (!this.hold && !this.keys.length) { this.arpNotes = []; if (this.arp) this.gateOff(); } }
        const now = this.arp || this.seqMode === 2;
        if (now && !was) { this.arpIdx = -1; this.s101Idx = 0; this.lfoReset(); }
        if (!now && was) this.gateOff();
        break;
      }
      case 'seq101': this.s101 = m.steps || []; if (this.s101Idx >= this.s101.length) this.s101Idx = 0; break;
      case 'run':
        if (m.on && !this.running) { this.running = true; this.stepIdx = 0; this.n16 = 0; this.nextStepAt = this.t; this.lastSlide = false; }
        else if (!m.on && this.running) { this.running = false; this.gateOff(); this.gateOffAt = -1; this.transpose = 0; }
        break;
      case 'panic': this.keys = []; this.gateOff(); break;
      case 'reset': this.vc = 0; this.s.fill(0); this.tl.fill(1); this.ve = 0; this.ltri = 0; break;
    }
  }

  setParam(id, v) {
    const P = this.P;
    switch (id) {
      case 'range': P.range = v - 1; break;                    // octaves
      case 'tune': P.tune = (v - 0.5) / 12; break;              // +-50 cents
      case 'vcoMod': P.vcoMod = v * v; break;
      case 'pw': P.pw = v; break;
      case 'pwmSrc': P.pwmSrc = v | 0; break;
      case 'drift': P.drift = v; break;
      case 'saw': case 'pulse': case 'sub': case 'noise': case 'cutoff': case 'reso': case 'drive':
      case 'vcfEnv': case 'vcfMod': case 'kybd': case 'level': case 'accent': P[id] = v; break;
      case 'bendVco': case 'bendVcf': case 'lfoMod': case 'lever': case 'modPush': P[id] = v; break;
      case 'transpose': P.transpose = (v | 0) - 1; break;   // L / M / H
      case 'subType': P.subType = v | 0; break;
      case 'attack': P.att = 0.0015 * Math.pow(4 / 0.0015, v); break;
      case 'decay': P.dec = 0.002 * Math.pow(5000, v); break;
      case 'sustain': P.sus = v; break;
      case 'release': P.rel = 0.002 * Math.pow(5000, v); break;
      case 'trig': P.trig = v | 0; break;
      case 'vcaMode': P.vcaMode = v | 0; break;
      case 'lfoRate': P.lfoRate = Math.pow(2, -3.32 + v * 8.23); break;
      case 'lfoWave': P.lfoWave = v | 0; break;
      case 'glide': P.glide = v < 0.01 ? 0 : 0.003 * Math.pow(5 / 0.003, v); break; // up to 5 s
      case 'glideMode': P.glideMode = v | 0; break;
      case 'accVcf': P.accVcf = v; break;
      case 'slide': P.slide = 0.02 + v * 0.28; break;
    }
  }
  setBend(id, v) {
    const C = this.C;
    if (id === 'cf') { for (let i = 0; i < 4; i++) C.cf[i] = v[i]; return; }
    if (id in C) C[id] = v;
  }

  setPitch(n, glideTime) {
    this.pitchT = n;
    if (glideTime > 0) this.glideCoef = 1 - Math.exp(-1 / (glideTime * this.fs));
    else { this.glideCoef = 1; this.pitch = n; }
  }
  trigger(acc) { this.stage = 1; this.gate = true; this.accOn = acc ? 1 : 0; }
  gateOff() { if (this.gate) { this.gate = false; this.stage = 3; } }
  lfoReset() { this.ltri = -this.C.hys * this.rail; this.lsq = -1; this.clockPending = true; }
  clockedMode() { return this.arp > 0 || this.seqMode === 2; }
  keyOn(n) {
    n += this.P.transpose * 12;
    if (this.running) { this.transpose = n - 60; return; }
    if (this.seqMode === 2) { this.s101Tr = n - 60; return; }
    if (this.arp) {
      if (this.hold && this.keys.length === 0) this.arpNotes = [];
      this.keys.push(n);
      if (!this.arpNotes.includes(n)) this.arpNotes.push(n);
      this.arpNotes.sort((a, b) => a - b);
      if (this.keys.length === 1 && this.arpIdx < 0 || this.keys.length === 1 && !this.hold) { this.arpIdx = -1; this.arpDir = 1; this.lfoReset(); }
      return;
    }
    const legato = this.keys.length > 0 && this.gate;
    this.keys = this.keys.filter(k => k !== n); this.keys.push(n);
    const gm = this.P.glideMode;
    this.setPitch(n - 12, gm === 2 || (gm === 1 && legato) ? this.P.glide : 0);
    if (!legato || this.P.trig === 0) this.trigger(false);
  }
  keyOff(n) {
    n += this.P.transpose * 12;
    if (this.running || this.seqMode === 2) return;
    if (this.arp) {
      this.keys = this.keys.filter(k => k !== n);
      if (!this.hold) { this.arpNotes = this.arpNotes.filter(k => k !== n); if (!this.arpNotes.length) { this.gateOff(); this.arpIdx = -1; } }
      return;
    }
    this.keys = this.keys.filter(k => k !== n);
    if (this.keys.length) { this.setPitch(this.keys[this.keys.length - 1] - 12, this.P.glideMode ? this.P.glide : 0); if (this.P.trig === 0) this.trigger(false); }
    else if (!this.hold) this.gateOff();
  }

  // LFO-clocked arpeggiator and 100-step sequencer (one step per LFO cycle, gate = high half)
  clockRise() {
    if (this.arp && this.arpNotes.length) {
      const N = this.arpNotes.length;
      if (this.arp === 1) this.arpIdx = (this.arpIdx + 1) % N;
      else if (this.arp === 3) this.arpIdx = this.arpIdx <= 0 ? N - 1 : this.arpIdx - 1;
      else {
        if (N === 1) this.arpIdx = 0;
        else { let i = this.arpIdx + this.arpDir; if (i >= N) { this.arpDir = -1; i = N - 2; } if (i < 0) { this.arpDir = 1; i = 1; } this.arpIdx = i; }
      }
      if (this.arpIdx >= N) this.arpIdx = 0;
      this.setPitch(this.arpNotes[this.arpIdx] - 12, this.P.glideMode === 2 ? this.P.glide : 0);
      this.trigger(false);
      this.port.postMessage({ type: 'arp', i: this.arpIdx });
    } else if (this.seqMode === 2 && this.s101.length) {
      if (this.s101Idx >= this.s101.length) this.s101Idx = 0;
      const st = this.s101[this.s101Idx];
      if (st.r) this.gateOff();
      else {
        const n = st.n + this.s101Tr - 12;
        if (st.l && this.gate) this.setPitch(n, this.P.glideMode ? this.P.glide : 0);
        else { this.setPitch(n, this.P.glideMode === 2 ? this.P.glide : 0); this.trigger(false); }
      }
      this.port.postMessage({ type: 's101', i: this.s101Idx });
      this.s101Idx = (this.s101Idx + 1) % this.s101.length;
    }
  }
  clockFall() {
    if (this.arp && this.arpNotes.length) this.gateOff();
    else if (this.seqMode === 2 && this.s101.length) {
      const nx = this.s101[this.s101Idx % this.s101.length];
      if (!(nx && nx.l && !nx.r)) this.gateOff();
    }
  }

  seqStep() {
    const S = this.seq, len = Math.max(1, Math.min(512, S.length | 0, S.steps.length || 1));
    if (this.stepIdx >= len) this.stepIdx = 0;
    const i = this.stepIdx, st = S.steps[i] || { m: 'R' }, nx = S.steps[(i + 1) % len] || { m: 'R' };
    const base = this.fs * 60 / S.bpm / 4, sw = S.swing * 0.5;
    const dur = (i % 2 === 0) ? base * (1 + sw) : base * (1 - sw);
    this.nextStepAt += dur;
    const hold = st.s || nx.m === 'T';
    if (st.m === 'R' || (st.m === 'T' && !this.gate)) { this.gateOff(); this.gateOffAt = -1; this.lastSlide = false; }
    else if (st.m === 'T') { this.gateOffAt = hold ? -1 : this.t + dur * S.gateLen; this.lastSlide = !!st.s; }
    else {
      const n = 48 + st.n + 12 * st.o + this.transpose;
      if (this.lastSlide && this.gate) { this.setPitch(n, this.P.slide); this.accOn = st.a ? 1 : 0; }
      else { this.setPitch(n, this.P.glideMode === 2 ? this.P.glide : 0); this.trigger(st.a); }
      this.gateOffAt = hold ? -1 : this.t + dur * S.gateLen;
      this.lastSlide = !!st.s;
    }
    // n: sixteenths counted from the start (bar 1), for the per-control step sequencers; bpm for their slew
    this.port.postMessage({ type: 'step', i, n: this.n16++, bpm: S.bpm });
    this.stepIdx = (i + 1) % len;
  }

  process(inputs, outputs) {
    const out = outputs[0], L = out[0], R = out[1], n = L.length;
    const fs = this.fs, dt = 1 / fs, dto = this.dto, fso = this.fso;
    const P = this.P, C = this.C, sm = this.sm, smc = this.smc;
    const node = this.node, inj = this.inj, br = this.bridges, s = this.s, tl = this.tl, g = this.g;
    const accUp = 1 - Math.exp(-1 / (0.02 * fs)), accDn = 1 - Math.exp(-1 / (0.15 * fs));
    const gateC = 1 - Math.exp(-1 / (0.0015 * fs));
    const loadC = 1 - Math.exp(-1 / (0.05 * fs));
    const eA = 1 - Math.exp(-dt / (P.att / (Math.log(ENV_SUP / (ENV_SUP - ENV_TH)) * CE_NOM) * C.ce));
    const eD = 1 - Math.exp(-dt / (P.dec / (4 * CE_NOM) * C.ce));
    const eR = 1 - Math.exp(-dt / (P.rel / (4 * CE_NOM) * C.ce));

    const fxc = this.fxc, fxOn = fxc.fx.rat || fxc.fx.lex || fxc.fx.dly || fxc.fx.fold || fxc.fx.flg;
    if (fxOn) fxc.flush();
    for (let j = 0; j < n; j++) {
      if (this.running) {
        if (this.t >= this.nextStepAt) this.seqStep();
        if (this.gateOffAt >= 0 && this.t >= this.gateOffAt) { this.gateOff(); this.gateOffAt = -1; }
      }
      this.t++;
      if ((this.t & 7) === 0) { for (const k in sm) sm[k] += ((k in P ? P[k] : C[k]) - sm[k]) * smc; }

      // ---- power supply: battery -> internal R -> regulator with ~1.2 V dropout ----
      this.load += (0.11 + Math.abs(this.out) * 0.08 + this.ve * 0.004 - this.load) * loadC; // amps (~1 W total)
      const vIn = sm.vBatt - this.load * C.rBatt;
      this.rail = clamp((vIn - 0.6) / 5.4, 0.05, 1);   // [SM] DC/DC converter holds the rails down to ~6 V in
      const rail = this.rail;
      const Tk = 273.15 + sm.tempC, tsc = T0 / Tk;

      // ---- bridges: node voltages (previous sample) into injection points ----
      inj.fill(0);
      for (let b = 0; b < br.length; b++) { const x = br[b]; inj[x[1]] += node[x[0]] * x[2]; } // amps

      // ---- LFO: integrator + Schmitt trigger ----
      const vsat = 10 * rail;
      const kInt = P.lfoRate * 4 * 5 * (CL_NOM / C.cl);          // V/s for nominal hysteresis 5 V
      this.ltri += (this.lsq > 0 ? 1 : -1) * kInt * (vsat / 10) * dt + inj[7] / C.cl * dt;
      const hys = C.hys * rail;
      if (this.ltri > hys && this.lsq > 0) { this.ltri = hys; this.lsq = -1; if (this.clockedMode()) this.clockFall(); }
      else if ((this.ltri < -hys && this.lsq < 0) || this.clockPending) {
        this.clockPending = false;
        this.ltri = Math.max(this.ltri, -hys); this.lsq = 1; this.rnd = this.rand();
        if (this.clockedMode()) this.clockRise();
        else if (P.trig === 2 && this.gate) this.stage = 1;              // env retriggered by LFO
      }
      this.ltri = clamp(this.ltri, -vsat, vsat);
      this.lnoise += (this.rand() - this.lnoise) * 0.02;
      let lfo;
      switch (P.lfoWave) {
        case 0: lfo = this.ltri / 5; break;
        case 1: lfo = this.lsq * vsat / 10; break;
        case 2: lfo = this.rnd; break;
        default: lfo = clamp(this.lnoise * 4, -1, 1);
      }

      // ---- envelope: RC timing cap with attack comparator ----
      const Ce = C.ce;
      if (this.stage === 1) {
        this.ve += (ENV_SUP * rail - this.ve) * eA;
        if (this.ve >= C.envTh) this.stage = 2;
      } else if (this.stage === 2) {
        this.ve += (P.sus * ENV_TH - this.ve) * eD;
      } else if (this.stage === 3) {
        this.ve += (0 - this.ve) * eR;
      }
      this.ve += inj[6] / Ce * dt;
      this.ve = clamp(this.ve, -0.6, ENV_SUP * rail);
      const env = Math.max(0, this.ve) / ENV_TH;
      this.gateSm += ((this.gate ? 1 : 0) - this.gateSm) * gateC;

      // ---- accent sweep cap ----
      const accT = this.accOn * env;
      this.accCap += (accT - this.accCap) * (accT > this.accCap ? accUp : accDn);
      this.accBoost += (this.accOn * (this.gate ? 1 : 0) - this.accBoost) * gateC;

      // ---- portamento (RC on the key CV) ----
      this.pitch += (this.pitchT - this.pitch) * this.glideCoef;

      // ---- VCO control: summed CV in octaves, expo converter with Vt(T) ----
      if ((this.t & 255) === 0) this.driftT += (this.rand() * 0.6 - this.driftT) * 0.05;
      this.drift += (this.driftT - this.drift) * 0.0005;
      const lfoAmt = clamp(sm.vcoMod + sm.modPush * sm.lfoMod, 0, 2);
      const octCV = (this.pitch - 69) / 12 + P.range + sm.tune + lfo * lfoAmt * 0.5 + sm.lever * sm.bendVco + this.drift * P.drift * 0.0125
        + clamp(inj[1] * 100e3, -6, 6);
      // matched pair cancels Is; Vt scales the exponent around the trim point (C4)
      const octEff = octCV + Math.log2(1 + VCO_PPM * (sm.tempC - 27));
      const Ic = 442 * Math.pow(2, octEff) * CT_NOM * VTH * rail;  // amps
      const dV = clamp(Ic + inj[0], -I_CAP_MAX, I_CAP_MAX) / C.ct * dto;                      // volts per oversampled tick
      // PW reference voltage (pulse is high while saw > Vpw)
      let duty;
      if (P.pwmSrc === 0) duty = 0.5 - sm.pw * 0.5 * (lfo + 1) / 2;   // PWM 50% .. 0%
      else if (P.pwmSrc === 1) duty = 0.5 - sm.pw * 0.5;
      else duty = 0.5 - sm.pw * 0.5 * Math.min(1, env);
      let vpw = VTH * (1 - duty);
            vpw = clamp(vpw + inj[2] * 10e3, 0.05, VTH * 1.2);
      if (duty <= 0.004) vpw = VTH * 1.2;                           // 0% width: pulse silent
      const disTau = C.rDis * C.ct;
      const fastReset = C.tReset < dto * 0.5;
      const resid = fastReset ? VTH * Math.exp(-C.tReset / disTau) : 0;
      const decay1 = Math.exp(-dto / disTau);

      // ---- VCF control: expo converter for Iabc, per-stage cap sets each pole ----
      const fcOct = sm.cutoff * 10.966 - 6.644                          // 10 Hz .. 20 kHz re 1 kHz
        + sm.lever * sm.bendVcf * 4
        // Accent is not on a real 101 (it comes with the 303-style sequencer). Its filter push has its own
        // depth fader (ACC, up to +2 oct), so at 0 the IC18b summer only sees cutoff, ENV, KYBD, MOD and bender.
        + sm.vcfEnv * env * VCF_ENV_OCT + this.accCap * (P.accVcf || 0) * 2
        + lfo * ((Math.pow(10, 2 * sm.vcfMod) - 1) / 99) * VCF_MOD_OCT   // MOD pot is audio taper (100kA)
        + (this.pitch - 60) / 12 * sm.kybd
        + clamp(inj[3] * 100e3, -8, 8);
      const fcBase = 1000 * Math.pow(2, fcOct * (1 + (tsc - 1) * VCF_TC)) * rail;
      if ((this.t & 1) === 0 || Math.abs(fcBase - this.fcLast) > this.fcLast * 0.02) {
        this.fcLast = fcBase;
        for (let i = 0; i < 4; i++) { const w = Math.PI * Math.min(fcBase * CF_NOM / C.cf[i], fso * 0.25) / fso; g[i] = w < 0.3 ? w * (1 + w * w * (1 / 3 + w * w * 2 / 15)) : Math.tan(w); }
      }
      // The IR3109's OTAs run out of bandwidth near the top of the range (spec: 10 Hz..20 kHz), so the resonance
      // loop gain falls away there and the real filter stops self-oscillating. Without this roll-off, cutoff and
      // resonance at full put the oscillation above Nyquist, where it folded back as broadband 'sandpaper' noise.
      // The pole frequencies are also held below fs/2 of the output rate.
      const kFull = sm.reso * 4.3, kRoll = kFull / (1 + (fcBase / 20000) ** 4);
      const k0 = kRoll * (C.fbInv ? -1 : 1);
      // That bandwidth loss is in the OTA stages themselves, so it takes the forward gain down with the loop gain.
      // Rolling off only the feedback lifted the passband (gain 1/(1+k)) by up to ~4 dB in the last tenth of the
      // cutoff travel, so hold the passband where the full-loop filter has it. Not applied with the feedback inverted.
      const passComp = C.fbInv ? 1 : (1 + kRoll) / (1 + kFull);
      const att = (0.004 + sm.drive * 0.03) * passComp;                  // input divider into OTA
      const offN = C.otaOff / (2 * VT0);
      const c2inj = inj[5] * dto / (C.cf[1] * 2 * VT0) * 2;
      const vcfInj = inj[4] * 10e3 / (2 * VT0);

      // ---- VCA control ----
      const amp = (P.vcaMode === 0 ? env : this.gateSm) * (1 + this.accBoost * P.accent * 0.9) + inj[8] * 47e3 / 5;
      const gain = clamp(amp, 0, 3);
      const railV = 13.5 * rail;
      const lvSub = sm.sub, lvSaw = sm.saw, lvPul = sm.pulse, lvNoi = sm.noise;
      const subType = P.subType;
      const vdd = 5 * rail;

      let y = 0;
      for (let o = 0; o < 2; o++) {
        // ===== VCO core =====
        // naive values for this tick, plus BLEP corrections (1-tick delay)
        let ev = -1, evH = 0, evP = 0, evS = 0;
        const vPrev = this.vc;
        if (this.resetLeft > 0) {
          this.vc = this.vc * decay1 + dV;
          this.resetLeft -= dto;
        } else {
          this.vc += dV;
          if (this.vc >= VTH && dV > 0) {
            const over = this.vc - VTH, d = clamp(over / dV, 0, 1);
            const sPrev = subWave(subType, this.subC);
            this.subC = (this.subC + 1) & 3;
            const sNow = subWave(subType, this.subC);
            if (fastReset) {
              this.vc = resid + over;
              ev = d; evH = this.vc - (VTH + over);
            } else {
              this.resetLeft = C.tReset - d * dto;
              this.vc = VTH * Math.exp(-d * dto / disTau);
            }
            evS = (sNow - sPrev) * vdd;
            if (ev < 0) ev = d;
          }
        }
        if (this.vc < -0.6) this.vc = -0.6;                // clamp diode
        if (this.vc > 14) this.vc = 14;
        const vc = this.vc;
        // pulse comparator
        const cmpNow = vc > vpw ? 1 : 0;
        let dP = -1;
        if (cmpNow !== this.cmp) {
          if (cmpNow === 1) dP = clamp((vc - vpw) / Math.max(1e-9, vc - vPrev), 0, 1);
          else dP = ev >= 0 ? ev : 0.5;
          evP = (cmpNow - this.cmp) * V_PULSE * rail;
          this.cmp = cmpNow;
        }
        const subNow = subWave(subType, this.subC) * vdd;
        // apply BLEP residuals: before-sample (delayed output) and current
        let outSaw = this.oSaw + this.cSaw, outPul = this.oPul + this.cPul, outSub = this.oSub + this.cSub;
        this.cSaw = 0; this.cPul = 0; this.cSub = 0;
        if (ev >= 0) {
          const a = ev * ev * 0.5, b = (1 - ev) * (1 - ev) * 0.5;
          if (evH) { outSaw += evH * a; this.cSaw -= evH * b; }
          if (evS) { outSub += evS * a; this.cSub -= evS * b; }
        }
        if (dP >= 0) { outPul += evP * dP * dP * 0.5; this.cPul -= evP * (1 - dP) * (1 - dP) * 0.5; }
        this.oSaw = vc; this.oPul = cmpNow * V_PULSE * rail; this.oSub = subNow;

        // ===== noise (reverse-biased junction, amplified, pinked) =====
        this.pink = this.pink * 0.7 + this.rand() * 0.3;

        // ===== mixer: inverting summer, rails, coupling cap =====
        let mix = (outSaw - VTH / 2) * 0.5 * lvSaw + (outPul - V_PULSE * rail * 0.5) * (5 / V_PULSE) * lvPul + (outSub - vdd * 0.5) * lvSub + this.pink * 3 * lvNoi;
        mix = railV * tanh(-mix / railV);
        const hp = mix - this.hpx + 0.9997 * this.hpy; this.hpx = mix; this.hpy = hp;

        // ===== VCF: OTA-C ladder =====
        const xin = hp * att / (2 * VT0) + offN + vcfInj;
        const G0 = g[0] * tl[0], G1 = g[1] * tl[1], G2 = g[2] * tl[2], G3 = g[3] * tl[3];
        const a0 = G0 / (1 + G0), a1 = G1 / (1 + G1), a2 = G2 / (1 + G2), a3 = G3 / (1 + G3);
        const b0 = s[0] / (1 + G0), b1 = s[1] / (1 + G1), b2 = s[2] / (1 + G2), b3 = s[3] / (1 + G3);
        const A = a0 * a1 * a2 * a3, B = ((b0 * a1 + b1) * a2 + b2) * a3 + b3;
        const y4p = this.y4, kd = Math.abs(y4p) < 1e-4 ? 1 : RES_DIODE * tanh(y4p / RES_DIODE) / y4p;
        const k = k0 * kd;                                   // diode-limited resonance feedback
        const y4e = (A * xin + B) / (1 + k * A);
        const x0 = xin - k * y4e;
        const y1 = a0 * x0 + b0, y2 = a1 * y1 + b1, y3 = a2 * y2 + b2, y4 = a3 * y3 + b3;
        s[0] = clamp(2 * y1 - s[0], -30, 30); s[1] = clamp(2 * y2 - s[1] + c2inj, -30, 30);
        s[2] = clamp(2 * y3 - s[2], -30, 30); s[3] = clamp(2 * y4 - s[3], -30, 30);
        // re-linearise each OTA's tanh around the solved operating point
        let e;
        e = (x0 - y1) * tsc; tl[0] = Math.abs(e) < 1e-4 ? tsc : tsc * tanh(e) / e;
        e = (y1 - y2) * tsc; tl[1] = Math.abs(e) < 1e-4 ? tsc : tsc * tanh(e) / e;
        e = (y2 - y3) * tsc; tl[2] = Math.abs(e) < 1e-4 ? tsc : tsc * tanh(e) / e;
        e = (y3 - y4) * tsc; tl[3] = Math.abs(e) < 1e-4 ? tsc : tsc * tanh(e) / e;
        this.y2 = y2; this.y4 = y4;

        // ===== VCA: OTA =====
        // [SM] VCF out reaches the BA662 input through R130 150k into R139 1k (C53 couples it), so the OTA
        // sees VCFout/151; in OTA units (2Vt) that is y4 * OTA_DIV / 151. R140 47k loads the current output.
        const vcaIn = y4 * VCA_IN;
        const v = tanh(vcaIn * tsc) * gain * VCA_OUT;
        y = bq(this.dec2, bq(this.dec1, v));
      }
      // node voltages for bend bridges (volts)
      node[0] = this.oSaw; node[1] = this.oPul; node[2] = this.oSub; node[3] = this.pink;
      node[4] = this.ltri; node[5] = this.lsq * vsat; node[6] = this.ve;
      node[7] = this.y2 * 2 * VT0 * OTA_DIV; node[8] = this.y4 * 2 * VT0 * OTA_DIV; node[9] = this.out * 4;
      this.humPh += 50 / fs; if (this.humPh >= 1) this.humPh -= 1;
      node[10] = 0.4 * Math.sin(2 * Math.PI * this.humPh) + 0.12 * Math.sin(6 * Math.PI * this.humPh) + this.rand() * 0.05;

      // output coupling cap + level
      const dcOut = y - this.dcx + 0.9995 * this.dcy; this.dcx = y; this.dcy = dcOut;
      this.out = dcOut;
      if (fxOn) { fxc.run(dcOut * sm.level); L[j] = clamp(fxc.L, -1, 1); if (R) R[j] = clamp(fxc.R, -1, 1); }
      else { const o = clamp(dcOut * sm.level, -1, 1); L[j] = o; if (R) R[j] = o; }
    }
    this.meterAt += n;
    if (this.meterAt >= 2048) {
      this.meterAt = 0;
      this.port.postMessage({ type: 'meters', node: Array.from(node), rail: this.rail, vIn: this.C.vBatt - this.load * this.C.rBatt, env: this.ve, vc: this.vc });
    }
    return true;
  }
}
registerProcessor('kestrel-ms1', KestrelProcessor);
