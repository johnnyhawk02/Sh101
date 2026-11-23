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
    { s: 'pwmSrc', label: 'PWM', opts: ['LFO', 'Man', 'Env'], def: 1 } ] },   // v0.57.0: Drift gone (Johnny: "get rid of it")
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
    { f: 'accent', label: 'Accent', def: .6, fmt: pct } ] },
];
const BENDER = [
  { f: 'bendVco', label: 'VCO', def: .3, fmt: v => '±' + (v * 12).toFixed(1) + 'st' },
  { f: 'bendVcf', label: 'VCF', def: 0, fmt: v => '±' + (v * 4).toFixed(1) + 'oct' },
  { f: 'lfoMod', label: 'LFO mod', def: .3, fmt: pct } ];

