// Shyoy: Panel definitions: bend-board component values, the synth rack layout and the effect units.
const NODES = ['SAW', 'PULSE', 'SUB', 'NOISE', 'LFOTRI', 'LFOSQ', 'ENVCAP', 'VCF2', 'VCFOUT', 'VCAOUT', 'FINGER'];
const NODE_NAME = { SAW: 'VCO timing cap (saw)', PULSE: 'Pulse comparator', SUB: 'Sub flip-flop', NOISE: 'Noise transistor', LFOTRI: 'LFO integrator', LFOSQ: 'LFO Schmitt out', ENVCAP: 'Envelope cap', VCF2: 'VCF stage 2', VCFOUT: 'VCF output', VCAOUT: 'VCA output', FINGER: 'Your finger (hum)' };
const NODE_COLOR = { SAW: 'var(--cable-key)', PULSE: 'var(--cable-key)', SUB: 'var(--cable-key)', NOISE: 'var(--cable-mod)', LFOTRI: 'var(--cable-lfo)', LFOSQ: 'var(--cable-lfo)', ENVCAP: 'var(--cable-env)', VCF2: 'var(--cable-rnd)', VCFOUT: 'var(--cable-rnd)', VCAOUT: 'var(--cable-acc)', FINGER: 'var(--hot)' };
const INJ = ['VCOCAP', 'VCOCV', 'PWREF', 'VCFCV', 'VCFIN', 'VCFC2', 'ENVCAP', 'LFOINT', 'VCACV'];
const INJ_NAME = { VCOCAP: 'VCO cap', VCOCV: 'VCO CV', PWREF: 'PW ref', VCFCV: 'VCF CV', VCFIN: 'VCF in', VCFC2: 'VCF C2', ENVCAP: 'Env cap', LFOINT: 'LFO int', VCACV: 'VCA CV' };
const ohms = r => r >= 1e6 ? (r / 1e6).toFixed(r < 1e7 ? 1 : 0) + 'M' : r >= 1e3 ? (r / 1e3).toFixed(r < 1e4 ? 1 : 0) + 'k' : r.toFixed(0) + 'Ω';
const farads = c => c >= 1e-6 ? (c * 1e6).toFixed(c < 1e-5 ? 2 : 1) + 'µF' : c >= 1e-9 ? (c * 1e9).toFixed(c < 1e-8 ? 2 : 1) + 'nF' : (c * 1e12).toFixed(0) + 'pF';
const secs = t => t >= 1e-3 ? (t * 1e3).toFixed(t < 1e-2 ? 2 : 1) + 'ms' : (t * 1e6).toFixed(1) + 'µs';
// Component values on the bend board: physical range, stock value, unit.
const BEND = [
  { grp: 'VCO core', items: [
    { id: 'ct', label: 'C41 timing', min: 220e-12, max: 4.7e-9, log: true, nom: 1e-9, fmt: farads },
    { id: 'tReset', label: 'Reset pulse', min: 0.5e-6, max: 3e-3, log: true, nom: 0.5e-6, fmt: secs },
    { id: 'rDis', label: 'Reset R', min: 22, max: 220e3, log: true, nom: 50, fmt: ohms } ] },
  { grp: 'VCF ladder', items: [
    { id: 'cf0', label: 'C47', min: 47e-12, max: 2.2e-9, log: true, nom: 240e-12, fmt: farads },
    { id: 'cf1', label: 'C48', min: 47e-12, max: 2.2e-9, log: true, nom: 240e-12, fmt: farads },
    { id: 'cf2', label: 'C50', min: 47e-12, max: 2.2e-9, log: true, nom: 240e-12, fmt: farads },
    { id: 'cf3', label: 'C51', min: 47e-12, max: 2.2e-9, log: true, nom: 240e-12, fmt: farads },
    { id: 'otaOff', label: 'OTA offset', min: -0.06, max: 0.06, nom: 0, fmt: v => (v * 1000).toFixed(0) + 'mV' },
    { sw: 'fbInv', label: 'Res loop', opts: ['Normal', 'Flipped'], nom: 0 } ] },
  { grp: 'Envelope & LFO', items: [
    { id: 'ce', label: 'C58 env', min: 1e-6, max: 100e-6, log: true, nom: 10e-6, fmt: farads },
    { id: 'envTh', label: 'Atk comp', min: 1.5, max: 13, nom: 15 * 33 / 115, fmt: v => v.toFixed(2) + 'V' },
    { id: 'cl', label: 'C9 LFO', min: 10e-9, max: 1e-6, log: true, nom: 0.1e-6, fmt: farads },
    { id: 'hys', label: 'Schmitt', min: 0.5, max: 9, nom: 5, fmt: v => '±' + v.toFixed(1) + 'V' } ] },
  { grp: 'Environment', items: [
    { id: 'tempC', label: 'Temp', min: -10, max: 80, nom: 27, fmt: v => v.toFixed(0) + '°C' },
    { id: 'vBatt', label: 'Battery', min: 3, max: 12, nom: 9, fmt: v => v.toFixed(2) + 'V' },
    { id: 'rBatt', label: 'Batt R', min: 0.1, max: 20, log: true, nom: 0.9, fmt: v => v.toFixed(1) + 'Ω' } ] },
];
const BEND_ITEMS = BEND.flatMap(g => g.items);
const toNorm = (b, x) => b.log ? Math.log(x / b.min) / Math.log(b.max / b.min) : (x - b.min) / (b.max - b.min);
const fromNorm = (b, v) => b.log ? b.min * Math.pow(b.max / b.min, v) : b.min + (b.max - b.min) * v;
const stockBend = () => Object.fromEntries(BEND_ITEMS.map(b => [b.id || b.sw, b.sw ? b.nom : toNorm(b, b.nom)]));
function bendPhysical(bn) {
  const o = {};
  for (const b of BEND_ITEMS) { if (b.sw) o[b.sw] = bn[b.sw] | 0; else o[b.id] = fromNorm(b, bn[b.id]); }
  o.cf = [o.cf0, o.cf1, o.cf2, o.cf3];
  return o;
}
const bridgeR = v => 10e6 * Math.pow(1e-4, v);
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ms = (s) => s < 1 ? (s * 1000).toFixed(s < 0.01 ? 1 : 0) + 'ms' : s.toFixed(2) + 's';
const pct = v => Math.round(v * 100);
// Panel layout: modules in signal-flow order.
const RACK = [
  { id: 'lfo', name: 'LFO', sub: 'tri / sq / s&h / noise', items: [
    { f: 'lfoRate', label: 'Rate', def: .5, fmt: v => { const hz = Math.pow(2, -3.32 + v * 8.23); return hz < 10 ? hz.toFixed(2) + 'Hz' : hz.toFixed(1) + 'Hz'; } },
    { s: 'lfoWave', label: 'Wave', opts: ['Tri', 'Square', 'Random', 'Noise'], def: 0 } ] },
  { id: 'vco', name: 'VCO', sub: 'expo + timing cap', items: [
    { s: 'range', label: 'Range', opts: ["16'", "8'", "4'", "2'"], def: 1 },
    { f: 'tune', label: 'Tune', def: .5, fmt: v => ((v - .5) * 100).toFixed(0) + 'c' },
    { f: 'vcoMod', label: 'Mod', def: 0, fmt: pct },
    { f: 'pw', label: 'PW', def: .3, fmt: v => (50 - v * 50).toFixed(0) + '%' },
    { s: 'pwmSrc', label: 'PWM', opts: ['LFO', 'Man', 'Env'], def: 1 },
    { f: 'drift', label: 'Drift', def: .25, fmt: pct } ] },
  { id: 'mix', name: 'Source mix', sub: 'summing amp', items: [
    { f: 'saw', label: 'Saw', def: .8, fmt: pct }, { f: 'pulse', label: 'Pulse', def: 0, fmt: pct },
    { f: 'sub', label: 'Sub', def: .4, fmt: pct }, { f: 'noise', label: 'Noise', def: 0, fmt: pct },
    { s: 'subType', label: 'Sub', opts: ['−1 sq', '−2 sq', '−2 25%'], def: 0 } ] },
  { id: 'vcf', name: 'VCF', sub: '4 × OTA-C', items: [
    { f: 'cutoff', label: 'Cutoff', def: .35, fmt: v => { const hz = 1000 * Math.pow(2, v * 10.966 - 6.644); return hz < 1000 ? hz.toFixed(0) + 'Hz' : (hz / 1000).toFixed(1) + 'k'; } },
    { f: 'reso', label: 'Reso', def: .6, fmt: pct },
    { f: 'vcfEnv', label: 'Env', def: .5, fmt: pct },
    { f: 'vcfMod', label: 'Mod', def: 0, fmt: pct },
    { f: 'kybd', label: 'Kybd', def: .5, fmt: pct },
    { f: 'drive', label: 'Drive', def: .4, fmt: pct },
    { f: 'accVcf', label: 'Acc', def: 0, fmt: v => v < .005 ? 'off' : '+' + (v * 2).toFixed(1) + 'oct' } ] },
  { id: 'env', name: 'Envelope', sub: 'RC ADSR', items: [
    { f: 'attack', label: 'A', def: 0, fmt: v => ms(0.0015 * Math.pow(4 / 0.0015, v)) },
    { f: 'decay', label: 'D', def: .4, fmt: v => ms(0.002 * Math.pow(5000, v)) },
    { f: 'sustain', label: 'S', def: 0, fmt: pct },
    { f: 'release', label: 'R', def: .3, fmt: v => ms(0.002 * Math.pow(5000, v)) },
    { s: 'trig', label: 'Trig', opts: ['Gate+trig', 'Gate', 'LFO'], def: 0 } ] },
  { id: 'vca', name: 'VCA', sub: 'OTA', items: [
    { s: 'vcaMode', label: 'Mode', opts: ['Env', 'Gate'], def: 0 },
    { f: 'level', label: 'Level', def: .7, fmt: pct } ] },
  { id: 'perf', name: 'Perform', sub: 'glide · accent', items: [
    { f: 'glide', label: 'Porta', def: .3, fmt: v => v < .01 ? 'off' : ms(0.003 * Math.pow(5 / 0.003, v)) },
    { s: 'glideMode', label: 'Porta', opts: ['Off', 'Auto', 'On'], def: 1 },
    { f: 'slide', label: 'Slide', def: .25, fmt: v => ((0.02 + v * 0.28) * 1000).toFixed(0) + 'ms' },
    { f: 'accent', label: 'Accent', def: .6, fmt: pct } ] },
];
const BENDER = [
  { f: 'bendVco', label: 'VCO', def: .3, fmt: v => '±' + (v * 12).toFixed(1) + 'st' },
  { f: 'bendVcf', label: 'VCF', def: 0, fmt: v => '±' + (v * 4).toFixed(1) + 'oct' },
  { f: 'lfoMod', label: 'LFO mod', def: .3, fmt: pct } ];

// ---------- effects (the 303 app's RAT, delay, Lexicon 224 and Compactor) ----------
const DRV_NAMES = ['RAT', 'DS-1', 'TS808'], DRV_IDS = ['rat', 'ds', 'ts'], DRV_SUBS = ['LM308 + diodes', 'op-amp into diodes to ground', 'JRC4558, diodes in the feedback'];
const DLY_DIV_NAMES = ['1/32', '1/16T', '1/16', '1/8T', '1/16D', '1/8', '1/4T', '1/8D', '1/4', '1/4D', '1/2'];
// the reverb slot's programs, mirrored from the engine's tables (LEX_PROGRAMS, PLATE_PROGRAMS, SPRING_PROGRAMS, CNV_PROGRAMS)
const REV_TYPE_NAMES = ['224', 'Plate', 'Spring', 'Conv'], REV_IDS = ['lex', 'plate', 'spring', 'conv'];
const LEX_PROGS = [['Small Hall B', 24, 152, 'Small Concert Hall B'], ['Vocal Plate', 0, 107, 'Vocal Plate'], ['Large Hall B', 24, 152, 'Large Concert Hall B'],
  ['Chamber', 25, 255, 'Acoustic Chamber'], ['Perc Plate', 0, 107, 'Percussion Plate A'], ['Small Hall A', 24, 152, 'Small Concert Hall A'],
  ['Room A', 24, 255, 'Room A'], ['CD Plate', 5, 185, 'Constant Density Plate A'], ['Chorus', 0, 253, 'Chorus A']];
const PLATE_PROGS = [['Tiny', 'Tiny plate', 0.5], ['Small', 'Small plate', 0.72], ['Medium', 'Medium plate (Dattorro)', 1], ['Large', 'Large plate', 1.3], ['Huge', 'Huge plate', 1.65]];
const SPRING_PROGS = [['1 spring', 'One spring', [36]], ['2 springs', 'Two springs', [31.5, 37.3]], ['3 springs', 'Three springs', [33.1, 37.7, 41.9]], ['Long tank', 'Long tank', [44.3, 51.1, 58.7]]];
// [short, name, recorded IR id, gated, early reflections]
const CNV_PROGS = [['Plate 140', 'EMT 140 plate', 'plate140'], ['Plate 140 Br', 'EMT 140 plate, bright', 'plate140b'], ['Drum room', 'Drum room', 'drumroom'],
  ['Silo', 'Grain silo', 'silo'], ['Garage', 'Concrete garage', 'garage'], ['Musikverein', 'Musikverein, Vienna', 'musikverein'], ['On a Star', 'On a Star', 'star'],
  ['Church', 'Church (generated)', null, false, true], ['Gated', 'Gated, 1980s (generated)', null, true, false]];
const SPRING_STAGES_UI = 48;
// the BF-2's bucket brigade, mirrored from the engine (FLG_*): 1024 stages clocked 500 kHz down to 40 kHz
const FLG_MODE_NAMES = ['Flanger', 'Chorus'];
const flgRate = (p) => 0.1 * Math.pow(100, p); // 0.1-10 Hz
const flgMs = (v) => 1000 * 1024 / (2 * (500e3 - v * (500e3 - 40e3)));
const exr = (lo, hi, p) => lo * Math.pow(hi / lo, p);
const hz = f => f >= 1000 ? (f / 1000).toFixed(f < 10000 ? 2 : 1) + 'k' : f.toFixed(0) + 'Hz';
const sec = t => t < 10 ? t.toFixed(1) + 's' : t.toFixed(0) + 's';
// Compactor defaults for a new or init sound (Johnny, v0.17.0): Amount 30%, Release 250 ms (the knob is 1000 ms × p², so p = √0.25).
// A sound saved before the two-dial Compactor still migrates to the old 40% / 20 ms, so saved sounds don't change.
const CMP_AMT_DEF = 0.3, CMP_REL_DEF = Math.sqrt(0.25), CMP_AMT_MIG = 0.4, CMP_REL_MIG = Math.sqrt(0.02);
const CMP_OLD = ['cmpthr', 'cmprng', 'cmpatk', 'cmphold', 'cmpmix', 'cmpmode'];
// a sound saved before the two-dial Compactor gets 40% / 20 ms; its old settings are dropped, not mapped
function migrateCmp(p) {
  if (!p || typeof p !== 'object') return p;
  if (!('cmpamt' in p)) { p.cmpamt = CMP_AMT_MIG; p.cmprel = CMP_REL_MIG; }
  for (const k of CMP_OLD) delete p[k];
  return p;
}
const FX = [
  // the Buchla 259 timbre folder, ahead of the drive slot
  { id: 'fold', name: 'Folder', sub: 'Buchla 259', items: [
    { f: 'fldtimbre', label: 'Timbre', def: .5, fmt: v => (0.5 + 9.5 * v * v).toFixed(1) + 'V' },
    { f: 'fldsym', label: 'Symmetry', def: .5, fmt: v => { const o = (v - .5) * 4; return (o > 0.05 ? '+' : '') + o.toFixed(1) + 'V'; } },
    { f: 'fldlevel', label: 'Level', def: .5, fmt: pct } ] },
  // the drive slot: one switch picks the pedal (fx.rat still switches the slot on, so older sounds keep their RAT);
  // drv: which pedal a fader belongs to
  { id: 'rat', name: 'Drive', sub: 'LM308 + diodes', dv: true, items: [
    { s: 'drvtype', label: 'Pedal', opts: DRV_NAMES, def: 0, val: i => i / 2 },
    { f: 'dist', drv: 'rat', label: 'Distortion', def: .5, fmt: pct }, { f: 'filter', drv: 'rat', label: 'Filter', def: .4, fmt: pct }, { f: 'ratvol', drv: 'rat', label: 'Volume', def: .5, fmt: pct },
    { f: 'dsdist', drv: 'ds', label: 'Dist', def: .5, fmt: pct }, { f: 'dstone', drv: 'ds', label: 'Tone', def: .5, fmt: pct }, { f: 'dslevel', drv: 'ds', label: 'Level', def: .5, fmt: pct },
    { f: 'tsdrive', drv: 'ts', label: 'Drive', def: .5, fmt: pct }, { f: 'tstone', drv: 'ts', label: 'Tone', def: .5, fmt: pct }, { f: 'tslevel', drv: 'ts', label: 'Level', def: .5, fmt: pct } ] },
  { id: 'dly', name: 'Delay', sub: 'tempo synced', items: [
    { f: 'dlytime', label: 'Time', def: .7, fmt: v => DLY_DIV_NAMES[Math.round(v * 10)] }, { f: 'dlyfb', label: 'Feedback', def: .35, fmt: v => Math.round(v * 95) + '%' },
    { f: 'dlylo', label: 'Low cut', def: .3, fmt: v => hz(20 * Math.pow(50, v)) }, { f: 'dlyhi', label: 'High cut', def: .55, fmt: v => hz(1000 * Math.pow(20, v)) },
    { f: 'dlymix', label: 'Return', def: .35, fmt: pct }, { s: 'dlypp', label: 'Mode', opts: ['Mono', 'Ping-pong'], def: 1, val: i => i } ] },
  // the reverb slot (from the 303 app): one switch picks the unit, each unit has its program buttons and its own faders.
  // rev: which unit an item belongs to; prog: the program buttons (stored as an index, sent as 0..1 like the 303's knobs).
  { id: 'lex', name: 'Reverb', sub: 'four units, one slot', rv: true, items: [
    { s: 'revtype', label: 'Reverb', opts: REV_TYPE_NAMES, def: 0, val: i => i / 3, rvType: true },
    { s: 'lexprog', label: 'Program', rev: 'lex', prog: true, opts: LEX_PROGS.map(p => p[0]), def: 1, val: i => i / 8 },
    { f: 'lexbass', rev: 'lex', label: 'Bass', def: .3, fmt: v => sec(exr(0.6, 70, v)) }, { f: 'lexmid', rev: 'lex', label: 'Mid', def: .27, fmt: v => sec(exr(0.6, 70, v)) },
    { f: 'lexxover', rev: 'lex', label: 'X-over', def: .443, fmt: v => hz(exr(100, 10900, v)) }, { f: 'lextreble', rev: 'lex', label: 'Treble', def: .834, fmt: v => hz(exr(100, 10900, v)) },
    { f: 'lexdepth', rev: 'lex', label: 'Depth', def: .5, fmt: v => Math.round(v * 71) }, { f: 'lexdiff', rev: 'lex', label: 'Diff', def: .55, fmt: v => Math.round(v * 63) },
    { f: 'lexpre', rev: 'lex', label: 'Pre', def: .2, fmt: v => { const P = LEX_PROGS[state.params.lexprog | 0] || LEX_PROGS[1]; return Math.round(P[1] + (P[2] - P[1]) * v) + 'ms'; } },
    { f: 'lexme', rev: 'lex', label: 'Mode enh', def: .5, fmt: v => v < .03 ? 'off' : 17 - Math.max(1, Math.min(16, Math.ceil(v * 16))) },
    { f: 'lexpitch', rev: 'lex', label: 'Pitch', def: .2, fmt: v => 1 + Math.round(v * 15) }, { f: 'lexmix', rev: 'lex', label: 'Return', def: .5, fmt: pct },
    { s: 'plateprog', label: 'Size', rev: 'plate', prog: true, opts: PLATE_PROGS.map(p => p[0]), def: 2, val: i => i / 4 },
    { f: 'platepre', rev: 'plate', label: 'Pre', def: .2, fmt: v => Math.round(250 * v * v) + 'ms' },
    { f: 'platedecay', rev: 'plate', label: 'Decay', def: .45, fmt: v => sec(exr(0.3, 20, v)) },
    { f: 'platedamp', rev: 'plate', label: 'Damping', def: .6, fmt: v => hz(exr(1000, 20000, v)) },
    { f: 'platebw', rev: 'plate', label: 'Bandw', def: .75, fmt: v => hz(exr(1000, 20000, v)) },
    { f: 'platelo', rev: 'plate', label: 'Lo cut', def: .35, fmt: v => hz(exr(20, 1000, v)) },
    { f: 'platediff', rev: 'plate', label: 'Diff', def: .88, fmt: pct },
    { f: 'platemod', rev: 'plate', label: 'Mod', def: .5, fmt: v => Math.round(200 * v) + '%' },
    { f: 'platemix', rev: 'plate', label: 'Return', def: .5, fmt: pct },
    { s: 'sprprog', label: 'Tank', rev: 'spring', prog: true, opts: SPRING_PROGS.map(p => p[0]), def: 2, val: i => i / 3 },
    { f: 'sprdwell', rev: 'spring', label: 'Dwell', def: .4, fmt: v => '×' + exr(0.5, 8, v).toFixed(1) },
    { f: 'sprdecay', rev: 'spring', label: 'Decay', def: .5, fmt: v => sec(exr(0.4, 6, v)) },
    { f: 'sprtension', rev: 'spring', label: 'Tension', def: .5, fmt: pct },
    { f: 'sprtone', rev: 'spring', label: 'Tone', def: .5, fmt: v => hz(exr(1500, 6000, v)) },
    { f: 'sprlo', rev: 'spring', label: 'Lo cut', def: .4, fmt: v => hz(exr(50, 1000, v)) },
    { f: 'sprmix', rev: 'spring', label: 'Return', def: .5, fmt: pct },
    { s: 'cnvprog', label: 'IR', rev: 'conv', prog: true, opts: CNV_PROGS.map(p => p[0]), def: 0, val: i => i / 8 },
    { f: 'cnvpre', rev: 'conv', label: 'Pre', def: .2, fmt: v => Math.round(Math.max(250 * v * v, 512000 / (ctx ? ctx.sampleRate : 48000))) + 'ms' },
    { f: 'cnvdecay', rev: 'conv', label: 'Decay', def: 1, fmt: v => { const P = CNV_PROGS[state.params.cnvprog | 0] || CNV_PROGS[0]; return P[2] ? (v >= .99 ? 'full' : sec(exr(0.2, 3, v))) : sec(P[3] ? exr(0.12, 1, v) : exr(0.2, 4, v)); } },
    { f: 'cnvtone', rev: 'conv', label: 'Tone', def: .7, fmt: v => hz(exr(1000, 20000, v)) },
    { f: 'cnvlo', rev: 'conv', label: 'Lo cut', def: .3, fmt: v => hz(exr(20, 1000, v)) },
    { f: 'cnvwidth', rev: 'conv', label: 'Width', def: 2 / 3, fmt: v => Math.round(150 * v) + '%' },
    { f: 'cnvmix', rev: 'conv', label: 'Return', def: .5, fmt: pct } ] },
  // the BF-2 flanger (from the 303 app), after the folder and drive and ahead of the returns and the dry path.
  // flgmode: flanger or chorus (the switch in its header; chorus has no feedback, so Res dims)
  { id: 'flg', name: 'Flanger', sub: 'BF-2 · 1024-stage BBD', fg: true, items: [
    { s: 'flgmode', label: 'Mode', opts: FLG_MODE_NAMES, def: 0, val: i => i },
    { f: 'flgman', label: 'Manual', dial: true, def: .5, fmt: v => flgMs((state.params.flgmode | 0) ? 0.55 + 0.45 * v : v).toFixed(1) + ' ms' },
    { f: 'flgdep', label: 'Depth', dial: true, def: .5, fmt: v => pct(v) + '%' },
    { f: 'flgrate', label: 'Rate', dial: true, def: .3, fmt: v => { const f = flgRate(v); return (f < 1 ? f.toFixed(2) : f.toFixed(1)) + ' Hz'; } },
    { f: 'flgres', label: 'Res', dial: true, def: .5, fmt: v => pct(v) + '%' } ] },
  // two dials, as in the 303 app: Amount (depth and sensitivity, 0 = off) and Release
  { id: 'cmp', name: 'Compactor', sub: 'ducks the returns', items: [
    { f: 'cmpamt', label: 'Amount', dial: true, def: CMP_AMT_DEF, fmt: v => v <= 0 ? 'off' : Math.round(100 * v) + '%' },
    { f: 'cmprel', label: 'Release', dial: true, def: CMP_REL_DEF, fmt: v => Math.round(1000 * v * v) + ' ms' } ] },
];
// routing (the strip under the FX units): fxorder swaps the folder and the drive slot; fxret connects the delay and the
// reverb in parallel, or one into the other. Stored as indices, sent as 0..1 like the 303 app's knobs; a sound saved
// without them loads at 0 and 0, the routing every sound had before.
const FX_ROUTE = [
  { s: 'fxorder', label: 'Folder and drive order', opts: ['fold → drive', 'drive → fold'], def: 0, val: i => i },
  { s: 'fxret', label: 'Delay and reverb routing', opts: ['parallel', 'dly → rev', 'rev → dly'], def: 0, val: i => i / 2 } ];
const FX_SW = {}; for (const u of FX) for (const it of u.items) if (it.s) FX_SW[it.s] = it;
for (const it of FX_ROUTE) FX_SW[it.s] = it;
// the engine takes every effect control as a 0..1 knob; switches are stored as their index
const fxKnobs = p => { const k = {}; for (const it of [...FX.flatMap(u => u.items), ...FX_ROUTE]) { const id = it.f || it.s; k[id] = it.s ? it.val(p[id] | 0) : p[id]; } return k; };
const FX_UNITS = ['fold', 'rat', 'flg', 'dly', 'lex'], FX_OFF = () => ({ rat: false, dly: false, lex: false, fold: false, flg: false });
