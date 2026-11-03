// Effects for Kestrel MS-1, ported from Johnny's tb303-circuit-model (tb303-model.js, commit 2b6e821):
// ProCo RAT pedal, tempo-synced digital delay, Lexicon 224 reverb and the Compactor sidechain on the returns.
// The classes below are copied from that file with only the wrapper (FxChain) new, so the two apps sound alike.
// Runs inside the AudioWorklet; no DOM use.

const FX_VT = 0.02585;
function audioTaper(p) { return p <= 0 ? 0 : Math.pow(p, 2.74); } // 'A' pot, ~15% at mid
const FX_PARTS = {
  RAT_CIN: 22e-9,
  RAT_RD: 100e3,
  RAT_CF: 100e-12,
  RAT_RG1: 47,
  RAT_CG1: 2.2e-6,
  RAT_RG2: 560,
  RAT_CG2: 4.7e-6,
  RAT_CC: 30e-12,
  RAT_GBW: 1e6,
  RAT_SR: 0.3,
  RAT_RCL: 1e3,
  RAT_VF: 0.6,
  RAT_RF: 1.5e3,
  RAT_CFLT: 3.3e-9,
  RAT_VS: 9,
  LEX_FS: 20000,
  LEX_BW: 9000,
  LEX_BITS: 12,
  LEX_RANGE: 24,
  LEX_GREL: 0.08,
  LEX_WORD: 16,
  LEX_MEM: 32768,
  LEX_XSAT: 1.6,
};

// ---------------------------------------------------------------------------
// Lexicon 224 digital reverb (1978, David Griesinger)
//
// What is documented (Lexicon 224 v4.4 manual, spec sheet, Dattorro 1997):
//   20 kHz sample rate, 20 Hz–8 kHz response, 12-bit DAC80 converters with
//   gain ranging for about 24 dB more range, 16-bit fixed-point words, 16K
//   words of delay memory at launch (soon 32K). Nine v4.4 programs (P1/P3 and
//   P2/P5 share algorithms). Controls: Bass and Mid decay (0.6–70 s) split at
//   Crossover (100 Hz–10.9 kHz), Treble decay (100 Hz–10.9 kHz), Depth (0–71,
//   close to far), Diffusion (0–63), Predelay (a per-program range), and Mode
//   Enhancement: random modulation of delay taps, Amount 1–16 (time between
//   tap updates, lower is stronger) and Pitch shift 1–16.
// What is estimated: the actual 224 microcode was never published. The core
// here is the "plate-class topology in the style of Griesinger" that Dattorro
// published (input allpass diffusers, then a figure-eight tank of two
// cross-coupled halves, each a modulated allpass, delay, decay filter,
// allpass, delay), with his delay lengths and output taps. The hall, chamber,
// room and constant-density variants, the depth mapping and the chorus voice
// timings are my estimates, shaped to the manual's descriptions.
//
// Like the hardware, all delay lines share one circular memory addressed by a
// single decrementing pointer, every write is rounded to the fixed-point word,
// and a program that does not fit in LEX_MEM is shrunk until it does.
const LEX_PROGRAMS = [
  { n: 1, name: 'Small Concert Hall B',     short: 'Small Hall B', alg: 'hallB',   size: 1.2,  pre: [24, 152] },
  { n: 2, name: 'Vocal Plate',              short: 'Vocal Plate',  alg: 'plate',   size: 1.0,  pre: [0, 107] },
  { n: 3, name: 'Large Concert Hall B',     short: 'Large Hall B', alg: 'hallB',   size: 1.85, pre: [24, 152] },
  { n: 4, name: 'Acoustic Chamber',         short: 'Chamber',      alg: 'chamber', size: 1.1,  pre: [25, 255] },
  { n: 5, name: 'Percussion Plate A',       short: 'Perc Plate',   alg: 'plate',   size: 0.75, pre: [0, 107] },
  { n: 6, name: 'Small Concert Hall A',     short: 'Small Hall A', alg: 'hallA',   size: 1.25, pre: [24, 152] },
  { n: 7, name: 'Room A',                   short: 'Room A',       alg: 'room',    size: 0.5,  pre: [24, 255] },
  { n: 8, name: 'Constant Density Plate A', short: 'CD Plate',     alg: 'cdplate', size: 1.0,  pre: [5, 185] },
  { n: 9, name: 'Chorus A',                 short: 'Chorus',       alg: 'chorus',  size: 1,    pre: [0, 253] },
];
// Dattorro's plate at 29761 Hz: tank lines [L modAP, L d1, L ap2, L d2, R modAP, R d1, R ap2, R d2]
const LEX_TANK = [672, 4453, 1800, 3720, 908, 4217, 2656, 3163];
// his output taps (Table 2): [line, position, sign]
const LEX_TAPS_L = [[5, 266, 1], [5, 2974, 1], [6, 1913, -1], [7, 1996, 1], [1, 1990, -1], [2, 187, -1], [3, 1066, -1]];
const LEX_TAPS_R = [[1, 353, 1], [1, 3627, 1], [2, 1228, -1], [3, 2673, 1], [5, 2111, -1], [6, 335, -1], [7, 121, -1]];
// algorithm shapes. Only 'plate' is Dattorro's published network; the rest are estimates.
const LEX_ALGS = {
  plate:   { ind: [142, 107, 379, 277], mul: [1, 1, 1, 1, 1, 1, 1, 1], ap3: null, dd1: 0.70, er: 0.25 },
  hallB:   { ind: [142, 107, 379, 277], mul: [1.13, 1.07, 0.93, 1.11, 1.09, 0.97, 1.12, 1.04], ap3: [1123, 1327], dd1: 0.65, er: 0.45 },
  hallA:   { ind: [233, 571], mul: [1.21, 1.03, 1.07, 0.95, 0.89, 1.11, 0.97, 1.08], ap3: [977, 1201], dd1: 0.60, er: 0.5 },
  chamber: { ind: [113, 163, 293], mul: [0.83, 0.91, 1.17, 0.88, 0.95, 0.86, 1.21, 0.93], ap3: null, dd1: 0.68, er: 0.7 },
  room:    { ind: [101, 271], mul: [1, 1, 1, 1, 1, 1, 1, 1], ap3: null, dd1: 0.62, er: 0.9 },
  cdplate: { ind: [142, 107, 379, 277, 199, 151], mul: [1, 0.97, 1, 1.03, 1, 1.02, 1, 0.98], ap3: [811, 947], dd1: 0.75, er: 0.15 },
};
const LEX_CHORUS_MS = [9, 14, 19, 25]; // base delay per voice pair (estimate)

// front-panel knobs (0..1) to the 224's own units
function lexParams(k) {
  const ex = (lo, hi, p) => lo * Math.pow(hi / lo, p);
  const prog = Math.max(0, Math.min(8, Math.round(k.lexprog * 8))), P = LEX_PROGRAMS[prog];
  return {
    prog, P,
    bass: ex(0.6, 70, k.lexbass), mid: ex(0.6, 70, k.lexmid),
    xover: ex(100, 10900, k.lexxover), treble: ex(100, 10900, k.lextreble),
    depth: Math.round(k.lexdepth * 71), diff: Math.round(k.lexdiff * 63),
    pre: P.pre[0] + (P.pre[1] - P.pre[0]) * k.lexpre,
    me: k.lexme < 0.03 ? 0 : 17 - Math.max(1, Math.min(16, Math.ceil(k.lexme * 16))),
    pitch: 1 + Math.round(k.lexpitch * 15),
    pairs: [k.lexbass, k.lexmid, k.lexxover, k.lextreble],
    wet: 2 * audioTaper(k.lexmix),
  };
}

function lexLowpass(fc, Q, fs) {
  const w = 2 * Math.PI * Math.min(fc, 0.45 * fs) / fs, al = Math.sin(w) / (2 * Q), cw = Math.cos(w), a0 = 1 + al;
  return { b0: (1 - cw) / 2 / a0, b1: (1 - cw) / a0, b2: (1 - cw) / 2 / a0, a1: -2 * cw / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function lexBiq(f, x) {
  for (const s of f) {
    const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2;
    s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y; x = y;
  }
  return x;
}

class Lexicon224 {
  constructor(fsHost) {
    this.fsHost = fsHost;
    this.F = 0; this.memWords = 0; this.prog = -1;
    this.seed = 22477; this.L = 0; this.R = 0; this.yl = 0; this.yr = 0;
    this.ph = 0; this.prev = 0; this.hx = 0; this.hxIn = 0;
    this.envIn = 0; this.envL = 0; this.envR = 0; this.zl = 0; this.zr = 0;
  }
  _rand() { this.seed = (this.seed * 1103515245 + 12345) >>> 0; return this.seed / 4294967296; }

  derive(c, k) {
    const q = lexParams(k), F = Math.round(c.LEX_FS), fh = this.fsHost;
    const layoutChanged = F !== this.F || Math.round(c.LEX_MEM) !== this.memWords || q.prog !== this.prog;
    if (F !== this.F || c.LEX_BW !== this.bw) {
      this.F = F; this.bw = c.LEX_BW; this.ratio = F / fh;
      const fc = Math.min(c.LEX_BW, 0.45 * F), Qs = [0.5176, 0.7071, 1.9319];
      this.aa = Qs.map(Qv => lexLowpass(fc, Qv, fh));
      this.rcL = Qs.map(Qv => lexLowpass(fc, Qv, fh));
      this.rcR = Qs.map(Qv => lexLowpass(fc, Qv, fh));
    }
    this.memWords = Math.round(c.LEX_MEM); this.prog = q.prog; this.q = q;
    if (layoutChanged) this._layout();
    // converters and word size
    this.adcQ = Math.pow(2, Math.round(c.LEX_BITS) - 1);
    this.steps = Math.max(0, Math.round(c.LEX_RANGE / 6));
    this.envRel = Math.exp(-1 / (c.LEX_GREL * F));
    this.wq = Math.pow(2, Math.round(c.LEX_WORD) - 1);
    this.xsat = c.LEX_XSAT;
    this.hxA = Math.exp(-2 * Math.PI * 12 / fh); // transformer low end, estimate
    this.wet = q.wet;
    // program parameters
    this.preD = Math.max(1, Math.round(q.pre * F / 1000));
    const g1 = Math.min(0.9, 0.75 * q.diff / 35);
    this.gIn = [g1, g1, g1 * 0.833, g1 * 0.833, g1 * 0.8, g1 * 0.8];
    this.dd2 = Math.min(0.7, 0.5 * q.diff / 35);
    const half = (o) => { let s = 0; for (let i = 0; i < 4; i++) s += this.len[o + i]; return s; };
    if (this.alg !== 'chorus') {
      const hL = half(0) + (this.ap3 ? this.ap3[0] : 0), hR = half(4) + (this.ap3 ? this.ap3[1] : 0);
      const g = (rt, h) => Math.pow(10, -3 * h / (rt * F));
      this.gB = [g(q.bass, hL), g(q.bass, hR)]; this.gM = [g(q.mid, hL), g(q.mid, hR)];
    }
    this.cx = 1 - Math.exp(-2 * Math.PI * q.xover / F);
    this.tb = q.treble >= F / 2 ? 1 : 1 - Math.exp(-2 * Math.PI * q.treble / F);
    this.depth = q.depth / 71;
    this.meT = q.me ? q.me * 32 : 0; // ticks between tap updates (estimate: 1.6–26 ms at 20 kHz)
    this.pitch = q.me ? q.pitch : 0;
    this.pairs = q.pairs;
    this.chDepth = q.depth / 71 * 0.008 * F;
    this.chT = Math.round((q.me || 8) * 0.04 * F);
  }

  _layout(fit = 1) {
    const P = LEX_PROGRAMS[this.prog], F = this.F, A = LEX_ALGS[P.alg];
    this.alg = P.alg;
    const maxPre = Math.ceil(P.pre[1] * F / 1000) + 2;
    let words = 0;
    const alloc = (len) => { const b = words; words += len + 2; return b; };
    this.preB = alloc(maxPre);
    if (P.alg === 'chorus') {
      this.chLen = Math.ceil(0.045 * F);
      this.chB = alloc(this.chLen);
      this.chAp = [0, 1, 2, 3].map(i => { const len = Math.round([0.0053, 0.0071, 0.0047, 0.0083][i] * F); return { b: alloc(len), len }; });
      this.chW = Array.from({ length: 8 }, () => ({ from: 0, to: 0, ctr: 1 + Math.floor(this._rand() * 2000) }));
      this.scale = 1;
    } else {
      const base = A.ind.reduce((a, b) => a + b, 0) + LEX_TANK.reduce((a, l, i) => a + l * A.mul[i], 0) + (A.ap3 ? A.ap3[0] + A.ap3[1] : 0);
      let sc = F / 29761 * P.size * fit;
      const room = this.memWords - maxPre - 3 * (A.ind.length + 12) - 80;
      if (base * sc > room) sc = Math.max(0.05, room / base);
      this.scale = sc / (F / 29761);
      const L = (n) => Math.max(2, Math.round(n * sc)) | 1;
      this.ind = A.ind.map(n => { const len = L(n); return { b: alloc(len), len }; });
      this.len = LEX_TANK.map((n, i) => L(n * A.mul[i]));
      this.tb_ = this.len.map((len, i) => alloc(len + ((i & 3) <= 1 ? 36 : 0)));
      this.ap3 = A.ap3 ? A.ap3.map(L) : null;
      this.ap3B = this.ap3 ? this.ap3.map(len => alloc(len)) : null;
      this.dd1 = A.dd1; this.er = A.er;
      const tap = (t, near) => { const [line, pos, sg] = t; return [line, Math.max(1, Math.round(pos / LEX_TANK[line] * this.len[line] * (near ? 0.3 : 1))), sg]; };
      this.tapsL = LEX_TAPS_L.map(t => tap(t)); this.tapsR = LEX_TAPS_R.map(t => tap(t));
      this.nearL = LEX_TAPS_L.map(t => tap(t, 1)); this.nearR = LEX_TAPS_R.map(t => tap(t, 1));
      this.walk = [0, 1, 2, 3].map(() => ({ from: 0, to: 0 })); this.meCtr = 1;
      this.lastL = 0; this.lastR = 0; this.xl = [0, 0]; this.tr = [0, 0];
    }
    this.words = words;
    if (words > this.memWords && fit > 0.5 && P.alg !== 'chorus') return this._layout(fit * (this.memWords - 8) / words);
    let size = 1024; while (size < words) size <<= 1;
    this.mem = new Float64Array(size); this.mask = size - 1; this.p = 0;
  }

  _w(a, v) { // write one fixed-point word, saturating. Magnitude truncation (estimate) lets tails die instead of limit-cycling.
    const q = this.wq; v = Math.trunc(v * q) / q;
    this.mem[a & this.mask] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  _r(a) { return this.mem[a & this.mask]; }
  _rf(a, d) { const i = Math.floor(d), f = d - i; return this._r(a + i) * (1 - f) + this._r(a + i + 1) * f; }
  _ap(b, len, g, x) { const p = this.p, vd = this._r(p + b + len), w = x + g * vd; this._w(p + b, w); return vd - g * w; }

  // gain-ranging 12-bit converter: the signal is boosted in 6 dB steps while it is small
  _conv(x, env) {
    let s = this.steps; while (s > 0 && env * (1 << s) >= 1) s--;
    const g = 1 << s; let y = x * g; y = y > 1 ? 1 : y < -1 ? -1 : y;
    return Math.round(y * this.adcQ) / this.adcQ / g;
  }

  _tick(x) {
    const p = this.p = (this.p - 1) & this.mask;
    this._w(p + this.preB, x);
    const u0 = this._r(p + this.preB + this.preD);
    if (this.alg === 'chorus') { this._chorus(u0); return; }
    // input diffusers
    let u = u0, uE = 0;
    for (let i = 0; i < this.ind.length; i++) { u = this._ap(this.ind[i].b, this.ind[i].len, this.gIn[i], u); if (i === this.ind.length - 2) uE = u; }
    // Mode Enhancement: each tap walks one sample at a time, at random, inside ±Pitch
    const W = this.walk;
    if (this.meT) {
      if (--this.meCtr <= 0) {
        this.meCtr = this.meT;
        for (const w of W) { w.from = w.to; let n = w.to + (this._rand() < 0.5 ? -1 : 1); if (Math.abs(n) > this.pitch) n = w.to - Math.sign(n - w.to); w.to = n; }
      }
    } else { this.meCtr = 1; for (const w of W) { w.from = w.to = 0; } }
    const ph = this.meT ? 1 - this.meCtr / this.meT : 0;
    const len = this.len, B = this.tb_;
    let out0 = 0, out1 = 0;
    for (let s = 0; s < 2; s++) {
      const o = s * 4;
      let a = u + (s ? this.lastL : this.lastR);
      // modulated allpass (decay diffusion 1)
      const vd = this._rf(p + B[o], len[o] + 16 + (W[s].from + (W[s].to - W[s].from) * ph)), g = -this.dd1, w = a + g * vd;
      this._w(p + B[o], w); a = vd - g * w;
      // delay 1, read through a wandering tap
      this._w(p + B[o + 1], a);
      let v = this._rf(p + B[o + 1], len[o + 1] + 16 + (W[2 + s].from + (W[2 + s].to - W[2 + s].from) * ph));
      // Bass / Mid decay split at Crossover, then Treble decay
      this.xl[s] += this.cx * (v - this.xl[s]);
      v = this.gB[s] * this.xl[s] + this.gM[s] * (v - this.xl[s]);
      this.tr[s] += this.tb * (v - this.tr[s]); v = this.tr[s];
      // allpass (decay diffusion 2), optional third allpass, delay 2
      v = this._ap(B[o + 2], len[o + 2], this.dd2, v);
      if (this.ap3) v = this._ap(this.ap3B[s], this.ap3[s], -this.dd2 * 0.8, v);
      this._w(p + B[o + 3], v);
      if (s) out1 = this._r(p + B[o + 3] + len[o + 3]); else out0 = this._r(p + B[o + 3] + len[o + 3]);
    }
    this.lastL = out0; this.lastR = out1;
    // output taps; Depth crossfades near taps (plus the diffused input) to the far ones
    const d = this.depth;
    this.yl = 0.6 * (d * this._sum(this.tapsL, p, B) + (1 - d) * (this._sum(this.nearL, p, B) + this.er * u));
    this.yr = 0.6 * (d * this._sum(this.tapsR, p, B) + (1 - d) * (this._sum(this.nearR, p, B) + this.er * uE));
  }
  _sum(T, p, B) { let y = 0; for (let i = 0; i < T.length; i++) { const t = T[i]; y += t[2] * this._r(p + B[t[0]] + t[1]); } return y;
  }

  // P9: eight voices, four per side, each delay wandering at random; diffusion on pairs 3 and 4
  _chorus(u) {
    const p = this.p; this._w(p + this.chB, u);
    const y = [0, 0];
    for (let v = 0; v < 8; v++) {
      const w = this.chW[v];
      if (--w.ctr <= 0) { w.from = w.to; w.to = this._rand() * 2 - 1; w.ctr = this.chT; }
      const t = 1 - w.ctr / this.chT, sm = w.from + (w.to - w.from) * (0.5 - 0.5 * Math.cos(Math.PI * t));
      const pair = v >> 1, side = v & 1;
      const dl = Math.min(this.chLen - 2, (LEX_CHORUS_MS[pair] + side * 1.3) * 0.001 * this.F + this.chDepth * sm);
      let s = this._rf(p + this.chB, Math.max(1, dl));
      if (pair >= 2) { const a = this.chAp[(pair - 2) * 2 + side]; s = this._ap(a.b, a.len, this.dd2 * 1.2, s); }
      y[side] += this.pairs[pair] * s;
    }
    this.yl = 0.5 * y[0]; this.yr = 0.5 * y[1];
  }

  // one host-rate sample in, sets this.L / this.R
  run(x) {
    // input transformer: low-end roll-off and soft saturation
    this.hx = this.hxA * (this.hx + x - this.hxIn); this.hxIn = x;
    let v = this.xsat * Math.tanh(this.hx / this.xsat);
    v = lexBiq(this.aa, v * 0.5); // anti-alias filter; converter full scale is about ±2 V
    this.ph += this.ratio;
    while (this.ph >= 1) {
      this.ph -= 1;
      const back = this.ph / this.ratio, xi = v - (v - this.prev) * Math.min(1, back);
      const a = Math.abs(xi); this.envIn = a > this.envIn ? a : this.envIn * this.envRel;
      this._tick(this._conv(xi, this.envIn)); const yl = this.yl, yr = this.yr;
      const al = Math.abs(yl), ar = Math.abs(yr);
      this.envL = al > this.envL ? al : this.envL * this.envRel; this.envR = ar > this.envR ? ar : this.envR * this.envRel;
      this.zl = this._conv(yl, this.envL); this.zr = this._conv(yr, this.envR); // DAC with zero-order hold
    }
    this.prev = v;
    this.L = lexBiq(this.rcL, this.zl) * 2; this.R = lexBiq(this.rcR, this.zr) * 2;
  }

  memoryUse() { return { words: this.words, of: this.memWords, scale: this.scale }; }
}


const RAT_OS = 2; // the RAT runs at 2x the voice rate (4x the host rate)

// Simple digital delay (outside the circuit): tempo-synced time, feedback, and a low cut and high cut
// inside the feedback loop, so every repeat gets thinner and darker. Clean digital repeats, no saturation.
// Ping-pong (default): the synth goes into the left line only and each line feeds the other, so repeats
// alternate left, right, left. Mono: one line, the same repeats on both sides.
const DLY_DIVS = [['1/32', 1 / 8], ['1/16T', 1 / 6], ['1/16', 1 / 4], ['1/8T', 1 / 3], ['1/16D', 3 / 8], ['1/8', 1 / 2], ['1/4T', 2 / 3], ['1/8D', 3 / 4], ['1/4', 1], ['1/4D', 3 / 2], ['1/2', 2]];
const dlyDiv = (p) => DLY_DIVS[Math.min(DLY_DIVS.length - 1, Math.round(p * (DLY_DIVS.length - 1)))];
const dlyLo = (p) => 20 * Math.pow(50, p);        // 20 Hz .. 1 kHz
const dlyHi = (p) => 1000 * Math.pow(20, p);      // 1 kHz .. 20 kHz
class DigitalDelay {
  constructor(fs) {
    this.fs = fs; this.buf = new Float32Array(Math.ceil(fs * 2.6)); this.bufR = new Float32Array(this.buf.length); this.w = 0;
    this.d = fs * 0.25; this.dT = this.d; this.lp = 0; this.hp = 0; this.hpIn = 0; this.lpR = 0; this.hpR = 0; this.hpInR = 0;
    this.l = 0; this.r = 0; this.pp = true;
  }
  derive(k, bpm) {
    const fs = this.fs;
    this.dT = Math.min(this.buf.length - 4, dlyDiv(k.dlytime)[1] * 60 / bpm * fs);
    this.fb = 0.95 * k.dlyfb;
    this.lpA = Math.exp(-2 * Math.PI * Math.min(dlyHi(k.dlyhi), 0.45 * fs) / fs);
    this.hpA = Math.exp(-2 * Math.PI * dlyLo(k.dlylo) / fs);
    this.mix = k.dlymix * k.dlymix * 1.2; // return level, roughly even in loudness
    this.slewA = 1 - Math.exp(-1 / (0.06 * fs)); // time changes glide over ~60 ms instead of clicking
    const pp = k.dlypp >= 0.5; if (pp !== this.pp) { this.pp = pp; this.bufR.fill(0); }
  }
  run(x) {
    const b = this.buf, B = this.bufR, N = b.length;
    this.d += (this.dT - this.d) * this.slewA;
    let r = this.w - this.d; if (r < 0) r += N;
    const i = Math.floor(r), f = r - i, j = i + 1 === N ? 0 : i + 1;
    let y = b[i] + (b[j] - b[i]) * f;
    // tone: one-pole low cut and high cut on what comes back
    this.hp = this.hpA * (this.hp + y - this.hpIn); this.hpIn = y; y = this.hp;
    this.lp = y + this.lpA * (this.lp - y); y = this.lp;
    if (this.pp) {
      let z = B[i] + (B[j] - B[i]) * f;
      this.hpR = this.hpA * (this.hpR + z - this.hpInR); this.hpInR = z; z = this.hpR;
      this.lpR = z + this.lpA * (this.lpR - z); z = this.lpR;
      b[this.w] = x + this.fb * z; B[this.w] = y; // left takes the input and the right's repeats; right takes the left's
      this.l = y * this.mix; this.r = z * this.mix;
    } else {
      b[this.w] = x + this.fb * y;
      this.l = this.r = y * this.mix;
    }
    this.w = this.w + 1 === N ? 0 : this.w + 1;
    return this.l;
  }
}

// Sidechain on the effect returns, after the Kilohearts Compactor (a limiter/ducker that works at sample
// level). The key is the dry synth. Threshold is the key level that ducks the returns to silence;
// Range shapes how the key maps onto that (below 100% quieter key levels are ignored, above 100% they
// duck harder, like a soft clipper on the key). Attack is lookahead: the returns are delayed by it and the
// ducking ramps in ahead of the transient. Hold keeps full ducking after the key drops, Release brings it
// back. Mode picks the detector: per-sample Peak, inter-sample peaks (ISP), or RMS. Mix blends in the
// unducked returns. With Attack and Release at 0 the gain follows the key waveform: ring-mod sidechaining.
// Our reading of the published control descriptions; Kilohearts does not publish its gain law.
const CMP_MODES = ['Peak', 'ISP', 'RMS'];
const cmpThrDb = (p) => -40 + 40 * p;
const cmpAtkMs = (p) => 10 * p;
const cmpHoldMs = (p) => 500 * p * p;
const cmpRelMs = (p) => 1000 * p * p;
class Compactor {
  constructor(fs) {
    this.fs = fs; this.L = new Float32Array(Math.ceil(fs * 0.011)); this.R = new Float32Array(this.L.length); this.w = 0;
    this.env = 0; this.hold = 0; this.ms = 0; this.k1 = 0; this.k2 = 0; this.k3 = 0; this.l = 0; this.r = 0; this.g = 1;
  }
  derive(k) {
    const fs = this.fs;
    this.thr = Math.pow(10, cmpThrDb(k.cmpthr) / 20);
    this.rng = 2 * k.cmprng;
    this.D = Math.min(this.L.length - 1, Math.round(cmpAtkMs(k.cmpatk) * 1e-3 * fs));
    this.atkA = this.D > 0 ? 1 - Math.exp(-3 / this.D) : 1;
    this.holdN = Math.round(cmpHoldMs(k.cmphold) * 1e-3 * fs);
    const rel = cmpRelMs(k.cmprel) * 1e-3 * fs;
    this.relA = rel > 0.5 ? Math.exp(-1 / rel) : 0;
    this.mode = Math.round(k.cmpmode * 2);
    this.rmsA = Math.exp(-1 / (0.01 * fs));
    this.mix = k.cmpmix;
  }
  // key -> duck amount 0..1 (1 = silence at threshold)
  _amount(det) {
    const x = det / this.thr, R = this.rng;
    let a;
    if (R <= 1) a = R > 0 ? (x - (1 - R)) / R : 0;
    else { const s = R - 1; a = (1 - s) * x + s * Math.tanh(3 * x) / 0.99505; }
    return a <= 0 ? 0 : a >= 1 ? 1 : a;
  }
  // key y, returns wl/wr: stores the delayed returns in l/r and gives the gain for them
  run(y, wl, wr) {
    let det;
    if (this.mode === 2) { this.ms = y * y + this.rmsA * (this.ms - y * y); det = Math.sqrt(this.ms * 2); } // sine peak = rms * sqrt 2
    else {
      det = Math.abs(y);
      if (this.mode === 1) { // inter-sample peak: Catmull-Rom midpoint between the last two samples
        const m = (-this.k3 + 9 * this.k2 + 9 * this.k1 - y) / 16; // Catmull-Rom midpoint of the previous two samples
        if (Math.abs(m) > det) det = Math.abs(m);
      }
      this.k3 = this.k2; this.k2 = this.k1; this.k1 = y;
    }
    const a = this._amount(det);
    if (a >= this.env) { this.env += (a - this.env) * this.atkA; this.hold = this.holdN; }
    else if (this.hold > 0) this.hold--;
    else this.env = a + (this.env - a) * this.relA;
    // lookahead: the returns come out D samples late, so the ramp lands on time
    const N = this.L.length; let ri = this.w - this.D; if (ri < 0) ri += N;
    this.L[this.w] = wl; this.R[this.w] = wr; this.l = this.L[ri]; this.r = this.R[ri]; this.w = this.w + 1 === N ? 0 : this.w + 1;
    this.g = 1 - this.mix * this.env;
    return this.g;
  }
}

// The chain after the Kestrel's output stage: RAT in series, then the 224 and the delay as parallel returns,
// both ducked by the Compactor keyed from the dry synth, then a soft clip. Same order as the 303 app.
const FX_KNOB_DEFS = { dist: 0.5, filter: 0.4, ratvol: 0.5,
  lexprog: 0.125, lexbass: 0.3, lexmid: 0.27, lexxover: 0.443, lextreble: 0.834, lexdepth: 0.5, lexdiff: 0.55, lexpre: 0.2, lexme: 0.5, lexpitch: 0.2, lexmix: 0.5,
  cmpthr: 0.5, cmprng: 0.5, cmpatk: 0.3, cmphold: 0, cmprel: 0.4, cmpmix: 0.7, cmpmode: 0,
  dlypp: 1, dlytime: 0.7, dlyfb: 0.35, dlylo: 0.3, dlyhi: 0.55, dlymix: 0.35 };
class FxChain {
  constructor(fs) {
    this.fs = fs; this.c = { ...FX_PARTS }; this.knobs = { ...FX_KNOB_DEFS };
    this.fx = { rat: false, lex: false, dly: false }; this.bpm = 120;
    this.lex = new Lexicon224(fs); this.dly = new DigitalDelay(fs); this.cmp = new Compactor(fs);
    this.rt = { hin: 0, xin: 0, h1: 0, h2: 0, x1: 0, fb: 0, y: 0, hc: 0, xc: 0, v: 0, f: 0, xp: 0, dco: 0, dci: 0 };
    this.L = 0; this.R = 0;
    this.derive();
  }
  setKnob(k, v) { if (k in this.knobs) { this.knobs[k] = v; this.derive(); } }
  setFx(n, on) { if (n in this.fx) this.fx[n] = !!on; }
  setBpm(b) { if (b !== this.bpm) { this.bpm = b; this.dly.derive(this.knobs, b); } }
  derive() {
    const c = this.c, k = this.knobs;
    this.cmp.derive(k); this.dly.derive(k, this.bpm);
    // RAT runs at RAT_OS x 2 the host rate here (the 303 voice is already 2x oversampled)
    const fs = this.fs * 2 * RAT_OS, e = (tau) => Math.exp(-1 / (Math.max(tau, 1e-12) * fs));
    this.ratN2 = 2 * RAT_OS;
    if (!this.ratLP) {
      const fc = 22000 / fs, w = 2 * Math.PI * fc, cs = Math.cos(w);
      this.ratLP = [0.5176, 0.7071, 1.9319].map(Q => { const al = Math.sin(w) / (2 * Q), a0 = 1 + al; return { b0: (1 - cs) / 2 / a0, b1: (1 - cs) / a0, b2: (1 - cs) / 2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 }; });
    }
    this.ratDcA = Math.exp(-2 * Math.PI * 5 / this.fs);
    const rd = c.RAT_RD * audioTaper(k.dist) + 1;
    this.ratRd = rd;
    this.ratInA = e(c.RAT_CIN * 1e6);
    this.ratA1 = e(c.RAT_RG1 * c.RAT_CG1); this.ratA2 = e(c.RAT_RG2 * c.RAT_CG2);
    this.ratFA = e(rd * c.RAT_CF);
    const comp = 30e-12 / c.RAT_CC;
    const gHf = 1 + rd * (1 / c.RAT_RG1 + 1 / c.RAT_RG2);
    this.ratK = Math.min(1, 2 * Math.PI * c.RAT_GBW * comp / gHf / fs);
    this.ratSlew = c.RAT_SR * 1e6 * comp / fs;
    this.ratRail = Math.max(c.RAT_VS / 2 - 1, 0.5);
    this.ratCA = e(4.7e-6 * (c.RAT_RCL + 1e3));
    this.ratN = 1.8 * FX_VT;
    this.ratIs = 1e-3 / Math.exp(c.RAT_VF / this.ratN);
    this.ratFltA = e((c.RAT_RF + 100e3 * k.filter) * c.RAT_CFLT);
    this.ratLevel = audioTaper(k.ratvol) * 6;
    this.lex.derive(c, k);
  }
  _rat(x) {
    const s = this.rt, x0 = s.xp, N = this.ratN2; s.xp = x;
    let y = 0;
    for (let i = 1; i <= N; i++) {
      let z = this._ratCore(x0 + (x - x0) * (i / N));
      for (const q of this.ratLP) { const o = q.b0 * z + q.b1 * q.x1 + q.b2 * q.x2 - q.a1 * q.y1 - q.a2 * q.y2; q.x2 = q.x1; q.x1 = z; q.y2 = q.y1; q.y1 = o; z = o; }
      y = z;
    }
    s.dco = this.ratDcA * (s.dco + y - s.dci); s.dci = y;
    return s.dco;
  }
  _ratCore(x) {
    const s = this.rt, c = this.c;
    s.hin = this.ratInA * (s.hin + x - s.xin); s.xin = x;
    const u = s.hin;
    // current through the two RC gain legs (inverting input follows u)
    s.h1 = this.ratA1 * (s.h1 + u - s.x1); s.h2 = this.ratA2 * (s.h2 + u - s.x1); s.x1 = u;
    const iv = (s.h1 / c.RAT_RG1 + s.h2 / c.RAT_RG2) * this.ratRd;
    s.fb = iv + this.ratFA * (s.fb - iv);                        // pot || 100p
    const target = u + s.fb;
    let dy = (target - s.y) * this.ratK;                         // gain-bandwidth limit
    if (dy > this.ratSlew) dy = this.ratSlew; else if (dy < -this.ratSlew) dy = -this.ratSlew; // slew limit
    s.y = Math.max(-this.ratRail, Math.min(this.ratRail, s.y + dy));
    s.hc = this.ratCA * (s.hc + s.y - s.xc); s.xc = s.y;         // 4.7µ output coupling
    // diode pair to ground through RAT_RCL: (w - v)/R = 2 Is sinh(v / nVt)
    const w = s.hc, R = c.RAT_RCL, n = this.ratN, Is = this.ratIs;
    // Safeguarded Newton: the root lies between 0 and w, so keep it bracketed and bisect whenever a Newton
    // step would leave the bracket. Plain Newton from the last sample could not follow a fast swing into
    // the diodes' exponential region in 4 steps and left v volts off, which was heard as spitting and fizz.
    let lo = w < 0 ? w : 0, hi = w < 0 ? 0 : w;
    let v = Math.min(hi, Math.max(lo, s.v));
    for (let i = 0; i < 40; i++) {
      const t = Math.min(Math.max(v / n, -80), 80), e = Math.exp(t), ei = 1 / e;
      const f = (w - v) / R - Is * (e - ei), df = -1 / R - Is * (e + ei) / n;
      if (f > 0) lo = v; else hi = v;
      let nv = v - f / df;
      if (!(nv > lo && nv < hi)) nv = 0.5 * (lo + hi);
      const dv = nv - v; v = nv;
      if (dv < 1e-7 && dv > -1e-7) break;
    }
    s.v = v;
    s.f = v + this.ratFltA * (s.f - v);                          // FILTER: (1.5k + pot) with 3.3n
    return s.f * this.ratLevel;
  }
  // one host-rate sample in; sets this.L / this.R
  run(x) {
    let y = this.fx.rat ? 0.95 * Math.tanh(this._rat(x) / 0.95) : x;
    if (!(this.fx.lex || this.fx.dly)) { this.L = this.R = y; return; }
    let wl = 0, wr = 0;
    if (this.fx.lex) { this.lex.run(y); wl += this.lex.wet * this.lex.L; wr += this.lex.wet * this.lex.R; }
    if (this.fx.dly) { this.dly.run(y); wl += this.dly.l; wr += this.dly.r; }
    const g = this.cmp.run(y, wl, wr);
    this.L = 0.98 * Math.tanh((y + this.cmp.l * g) / 0.98);
    this.R = 0.98 * Math.tanh((y + this.cmp.r * g) / 0.98);
  }
  flush() { fxFlushTiny(this, 0); fxFlushTiny(this.lex, 0); fxFlushTiny(this.dly, 0); fxFlushTiny(this.cmp, 0); }
}
const FX_FLUSH_SKIP = new Set(['c', 'knobs', 'fx', 'lex', 'mem', 'buf', 'bufR', 'L', 'R', 'dly', 'cmp']);
function fxFlushTiny(o, depth) {
  if (Array.isArray(o) || ArrayBuffer.isView(o)) {
    if (o.length > 64) return;
    for (let i = 0; i < o.length; i++) { const x = o[i]; if (typeof x === 'number') { if (x !== 0 && x < 1e-150 && x > -1e-150) o[i] = 0; } else if (x && typeof x === 'object' && depth < 2) fxFlushTiny(x, depth + 1); }
    return;
  }
  for (const k in o) {
    const x = o[k];
    if (typeof x === 'number') { if (x !== 0 && x < 1e-150 && x > -1e-150) o[k] = 0; }
    else if (x && typeof x === 'object' && depth < 2 && !FX_FLUSH_SKIP.has(k)) fxFlushTiny(x, depth + 1);
  }
}
