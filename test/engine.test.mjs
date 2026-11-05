// Runs Shyoy's AudioWorklet engine (site/js/dsp: the effects, then the circuit model, joined as the page joins them)
// headless in Node and checks pitch, stability, the bend paths and the effects.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

globalThis.sampleRate = 48000;
let Proc;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: (m) => this._last = m, onmessage: null }; } };
globalThis.registerProcessor = (_, c) => { Proc = c; };
const dir = mkdtempSync(join(tmpdir(), 'kestrel-'));
const src = (f) => readFileSync(new URL(`../site/js/dsp/${f}`, import.meta.url), 'utf8');
writeFileSync(join(dir, 'dsp.mjs'), [src('fx.js'), src('engine.js')].join('\n'));
await import(join(dir, 'dsp.mjs'));

const make = () => { const p = new Proc(); return [p, (m) => p.port.onmessage({ data: m })]; };
function render(p, sec) {
  const out = new Float32Array(Math.floor(48000 * sec / 128) * 128);
  for (let o = 0; o < out.length; o += 128) { const L = out.subarray(o, o + 128); p.process([], [[L]]); }
  return out;
}
function hz(buf) {
  const a = buf.subarray(buf.length - 24000); let c = 0, first = -1, last = 0;
  for (let i = 1; i < a.length; i++) if (a[i - 1] < 0 && a[i] >= 0) { if (first < 0) first = i; last = i; c++; }
  return (c - 1) * 48000 / (last - first);
}
const finite = (b) => b.every(Number.isFinite);
const peak = (b) => b.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

// pitch tracks 1 V/oct at the calibration temperature
{
  const [p, send] = make();
  send({ type: 'params', p: { saw: 1, sub: 0, cutoff: 1, reso: 0, vcaMode: 1, kybd: 0, vcfEnv: 0, drift: 0 } });
  for (const n of [48, 60, 69, 81]) {
    send({ type: 'noteOn', n: n + 12 }); const b = render(p, 1); send({ type: 'noteOff', n: n + 12 });
    const want = 440 * 2 ** ((n - 69) / 12), got = hz(b);
    assert.ok(finite(b));
    assert.ok(Math.abs(1200 * Math.log2(got / want)) < 10, `note ${n}: ${got.toFixed(1)} Hz vs ${want.toFixed(1)}`);
  }
  // the CEM3340 cancels its own tempco, so a hot chip drifts only a little
  send({ type: 'noteOn', n: 93 }); const cold = hz(render(p, 1));
  send({ type: 'bend', b: { tempC: 60 } }); const hot = hz(render(p, 1));
  assert.ok(hot !== cold && Math.abs(1200 * Math.log2(hot / cold)) < 30, `hot expo converter: ${cold.toFixed(1)} -> ${hot.toFixed(1)} Hz`);
}
// filter self-oscillates at full resonance
{
  const [p, send] = make();
  send({ type: 'params', p: { saw: 0, sub: 0, cutoff: .55, reso: 1, vcaMode: 1, vcfEnv: 0, kybd: 0 } });
  send({ type: 'noteOn', n: 60 }); const b = render(p, 1);
  assert.ok(finite(b)); assert.ok(peak(b) > 0.1, 'expected self-oscillation');
}
// sequencer + heavy bending stays finite and bounded
{
  const [p, send] = make();
  const steps = Array.from({ length: 16 }, (_, i) => ({ n: i % 5 * 2, o: i % 3 - 1, m: i % 7 === 3 ? 'T' : i % 5 === 4 ? 'R' : 'N', a: i % 3 === 0, s: i % 4 === 1 }));
  send({ type: 'seq', seq: { steps, length: 16, bpm: 126, swing: .1, gateLen: .5 } }); send({ type: 'run', on: true });
  assert.ok(finite(render(p, 2)));
  send({ type: 'bend', b: { vBatt: 5, rBatt: 10, tReset: 3e-3, rDis: 200e3, fbInv: 1, cf: [1e-9, 100e-9, 2e-9, 50e-9], otaOff: 0.06, ce: 1e-7, hys: 9, tempC: 80 } });
  const br = {}; for (const s of ['SAW', 'LFOSQ', 'VCFOUT', 'FINGER', 'VCAOUT']) for (const d of ['VCOCAP', 'VCOCV', 'VCFIN', 'VCFC2', 'ENVCAP', 'VCACV']) br[`${s}>${d}`] = 1;
  send({ type: 'bridges', br });
  const b = render(p, 3);
  assert.ok(finite(b), 'bent circuit produced NaN'); assert.ok(peak(b) <= 1);
}
// every effect on (each drive pedal, each reverb) stays finite and bounded
for (const [drvtype, revtype] of [[0, 0], [1, 1 / 3], [2, 2 / 3], [0, 1]]) {
  const [p, send] = make();
  for (const name of ['rat', 'dly', 'lex', 'fold']) send({ type: 'fx', name, on: true });
  send({ type: 'fxknobs', k: { drvtype, revtype } });
  const steps = Array.from({ length: 16 }, (_, i) => ({ n: i * 7 % 12, o: 0, m: 'N', a: i % 4 === 0, s: false }));
  send({ type: 'seq', seq: { steps, length: 16, bpm: 130, swing: 0, gateLen: .5 } }); send({ type: 'run', on: true });
  const b = render(p, 2);
  assert.ok(finite(b), `effects ${drvtype}/${revtype} produced NaN`); assert.ok(peak(b) > 0.01 && peak(b) <= 1.5, `effects ${drvtype}/${revtype} peak ${peak(b)}`);
}
// routing: an impulse train through the FX chain alone (fxc.run), so each route can be compared exactly
{
  const chain = (k, fx) => {
    const [p] = make(), c = p.fxc; Object.assign(c.knobs, k); c.derive(); for (const n in fx) c.setFx(n, fx[n]);
    const L = new Float64Array(96000), R = new Float64Array(96000);
    for (let i = 0; i < L.length; i++) { c.run(i < 48000 && i % 12000 < 40 ? 0.5 * Math.sin(i * 0.3) : 0); L[i] = c.L; R[i] = c.R; if ((i & 127) === 0) c.flush(); }
    return [L, R];
  };
  const same = (a, b) => a[0].every((v, i) => v === b[0][i]) && a[1].every((v, i) => v === b[1][i]);
  const both = { lex: true, dly: true }, big = { revtype: 1 / 3, platedecay: 0.9, platemix: 0.8, dlymix: 0.6, cmpamt: 0 };
  const par = chain(big, both), d2r = chain({ ...big, fxret: 0.5 }, both), r2d = chain({ ...big, fxret: 1 }, both);
  assert.ok(!same(par, d2r) && !same(par, r2d) && !same(d2r, r2d), 'the three return modes should differ');
  for (const r of [par, d2r, r2d]) assert.ok(finite(r[0]) && finite(r[1]) && peak(r[0]) <= 1);
  // with only one return on, the return mode does nothing
  assert.ok(same(chain(big, { lex: true }), chain({ ...big, fxret: 1 }, { lex: true })));
  assert.ok(same(chain(big, { dly: true }), chain({ ...big, fxret: 0.5 }, { dly: true })));
  // the order of the folder and the drive matters only when both are on
  const pre = { fold: true, rat: true };
  assert.ok(!same(chain({}, pre), chain({ fxorder: 1 }, pre)), 'drive → fold should differ from fold → drive');
  assert.ok(same(chain({}, { fold: true }), chain({ fxorder: 1 }, { fold: true })));
  // the flanger: on changes the sound, chorus differs from flanger, both stay bounded
  const fl = chain({}, { flg: true }), ch = chain({ flgmode: 1 }, { flg: true }), dry = chain({}, {});
  assert.ok(!same(fl, dry) && !same(fl, ch) && finite(fl[0]) && finite(ch[0]) && peak(fl[0]) <= 1 && peak(ch[0]) <= 1);
}
// the flanger sweeps: the BBD delay follows the triangle LFO between its Manual and Depth limits
{
  const [p] = make(), f = p.fxc.flg; Object.assign(p.fxc.knobs, { flgman: 0.5, flgdep: 1, flgrate: 0.5 }); p.fxc.derive();
  let lo = Infinity, hi = 0; const n = 48000 * 2;
  for (let i = 0; i < n; i++) { f.run(0); const tri = f.ph < 0.5 ? 4 * f.ph - 1 : 3 - 4 * f.ph, v = Math.max(0, Math.min(1, f.man + 0.5 * f.dep * tri)); const ms = 1000 * 1024 / (2 * (500e3 - v * 460e3)); lo = Math.min(lo, ms); hi = Math.max(hi, ms); }
  assert.ok(lo < 1.6 && hi > 4, `flanger sweep ${lo.toFixed(2)}-${hi.toFixed(2)} ms`);
}
console.log('engine tests passed');
