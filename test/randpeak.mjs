// Plays N random sounds (rand.js draw + roll1 limits) through the engine, clip off, and reports the peak each would
// have at the Level rand.js gives it (dBFS before any soft clip). Run: node test/randpeak.mjs [N] [seed]
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
globalThis.sampleRate = 48000;
let Proc;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: () => {}, onmessage: null }; } };
globalThis.registerProcessor = (_, c) => { Proc = c; };
const dir = mkdtempSync(join(tmpdir(), 'rp-'));
writeFileSync(join(dir, 'e.mjs'), readFileSync(new URL('../site/js/dsp/engine.js', import.meta.url), 'utf8'));
await import(join(dir, 'e.mjs'));
const N = +process.argv[2] || 200;
let seed = +process.argv[3] || 1; Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const BASE = { saw: .85, pulse: 0, sub: 0, noise: 0, cutoff: 1, reso: 0, drive: 0, vcfEnv: 0, vcfMod: 0, vcoMod: 0, kybd: .5, accVcf: 0,
  attack: 0, decay: .4, sustain: 1, release: .1, trig: 0, vcaMode: 1, level: .7, glide: 0, glideMode: 0, accent: 0, range: 1, pw: .3, pwmSrc: 1, lfoRate: .5, lfoWave: 0, subType: 1 };
const el = () => ({ value: '', addEventListener() {}, dispatchEvent() {} });
const g = { document: { getElementById: el, querySelector: () => null }, state: { params: BASE, bend: {}, br: {}, strip: {} }, clone: structuredClone };
const rsrc = readFileSync(new URL('../site/js/app/rand.js', import.meta.url), 'utf8');
const R = new Function(...Object.keys(g), rsrc + '\nreturn shyoyRand;')(...Object.values(g));
function sound() {
  const p = R.sample().params;
  if (p.reso > 0.75) p.cutoff = Math.min(p.cutoff, 0.7);
  const m = Math.max(p.saw, p.pulse, p.sub); if (m < 0.5) { const k = ['saw', 'pulse', 'sub'].find((k) => p[k] === m); p[k] = 0.5; }
  return R.levelled({ params: p }).params;
}
// the sequencer on the straight pattern (gate every 16th, 120 bpm), a key held a while on each of several notes
function measure(p) {
  const pr = new Proc(), send = (m) => pr.port.onmessage({ data: m });
  send({ type: 'clip', on: false }); send({ type: 'params', p: { ...p, level: 0.02 } });
  const steps = Array.from({ length: 16 }, () => ({ on: true, o: 0, s: false, a: false }));
  send({ type: 'seq', seq: { steps, bpm: 120, len: { o: 16, on: 16, s: 16, a: 16 }, notes: [], loop: 0, adv: 'gate', cyc: 0 } });
  let pk = 0; const L = new Float32Array(128);
  const run = (sec) => { for (let i = 0; i < sec * 375; i++) { pr.process([], [[L]]); for (const v of L) { const a = Math.abs(v); if (a > pk) pk = a; } } };
  run(0.5); pk = 0;   // let the smoothed controls settle
  send({ type: 'run', on: true });
  for (const n of [36, 43, 48, 55, 60, 67, 72, 79]) { send({ type: 'noteOn', n }); run(0.75); send({ type: 'noteOff', n }); }
  send({ type: 'run', on: false });
  return 20 * Math.log10(pk / 0.02 * p.level);   // pre-clip peak at the sound's own Level
}
const out = [];
for (let i = 0; i < N; i++) { const p = sound(); out.push({ db: measure(p), p }); }
writeFileSync(process.env.OUT || '/dev/null', JSON.stringify(out));
const d = out.map((o) => o.db).sort((a, b) => a - b), q = (f) => d[Math.min(d.length - 1, Math.floor(f * d.length))].toFixed(1);
console.log(`n ${N}  min ${q(0)}  p10 ${q(.1)}  median ${q(.5)}  p90 ${q(.9)}  p99 ${q(.99)}  max ${d[d.length - 1].toFixed(1)}  over -6: ${d.filter((v) => v > -6).length}`);
