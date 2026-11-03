// Runs the AudioWorklet engine headless in Node and checks pitch, stability and the bend paths.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

globalThis.sampleRate = 48000;
let Proc;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: (m) => this._last = m, onmessage: null }; } };
globalThis.registerProcessor = (_, c) => { Proc = c; };
const dir = mkdtempSync(join(tmpdir(), 'kestrel-'));
writeFileSync(join(dir, 'dsp.mjs'), readFileSync(new URL('../src/fx.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../src/dsp.js', import.meta.url), 'utf8'));
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

// pitch tracks 1 V/oct at the calibration temperature, A4 = 442 Hz like the factory trim
{
  const [p, send] = make();
  send({ type: 'params', p: { saw: 1, sub: 0, cutoff: 1, reso: 0, vcaMode: 1, kybd: 0, vcfEnv: 0, drift: 0 } });
  for (const n of [48, 60, 69, 81]) {
    send({ type: 'noteOn', n: n + 12 }); const b = render(p, 1); send({ type: 'noteOff', n: n + 12 });
    const want = 442 * 2 ** ((n - 69) / 12), got = hz(b);
    assert.ok(finite(b));
    assert.ok(Math.abs(1200 * Math.log2(got / want)) < 10, `note ${n}: ${got.toFixed(1)} Hz vs ${want.toFixed(1)}`);
  }
  // heat: the CEM3340 compensates on chip (~50 ppm/C), so a 33 C rise barely moves pitch
  send({ type: 'bend', b: { tempC: 60 } }); send({ type: 'noteOn', n: 93 });
  const cents = 1200 * Math.log2(hz(render(p, 1)) / 884);
  assert.ok(Math.abs(cents) < 6, `hot VCO drift ${cents.toFixed(1)} cents`);
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
// LFO-clocked arpeggiator walks held notes up and down
{
  const [p, send] = make(); const seen = [];
  p.port.postMessage = (m) => { if (m.type === 'arp') seen.push(m.i); };
  send({ type: 'params', p: { lfoRate: .6 } }); send({ type: 'mode', arp: 2 });
  for (const n of [60, 64, 67]) send({ type: 'noteOn', n });
  const b = render(p, 3);
  assert.ok(finite(b));
  assert.ok(seen.length > 8, `arp only stepped ${seen.length} times`);
  assert.deepEqual(seen.slice(0, 6), [0, 1, 2, 1, 0, 1]);
}
// 100-step sequencer plays rests and legato steps
{
  const [p, send] = make(); const seen = [];
  p.port.postMessage = (m) => { if (m.type === 's101') seen.push(m.i); };
  send({ type: 'params', p: { lfoRate: .6 } });
  send({ type: 'seq101', steps: [{ n: 60 }, { n: 63, l: true }, { r: true }, { n: 67 }] });
  send({ type: 'mode', seq: 2 });
  assert.ok(finite(render(p, 2)));
  assert.deepEqual(seen.slice(0, 6), [0, 1, 2, 3, 0, 1]);
}
console.log('engine tests passed');

// effects from the 303 app: RAT, delay and 224 all on stay finite, make a stereo tail after the note, and keep up
{
  const [p, send] = make();
  send({ type: 'params', p: { saw: 1, cutoff: .5, reso: .5, vcaMode: 1 } });
  for (const name of ['rat', 'dly', 'lex']) send({ type: 'fx', name, on: true });
  send({ type: 'param', id: 'lexmix', v: .8 }); send({ type: 'param', id: 'dlymix', v: .6 });
  send({ type: 'noteOn', n: 60 });
  const L = new Float32Array(48000), R = new Float32Array(48000), t0 = performance.now();
  for (let o = 0; o < 24000; o += 128) p.process([], [[L.subarray(o, o + 128), R.subarray(o, o + 128)]]);
  send({ type: 'noteOff', n: 60 });
  for (let o = 24000; o < 48000; o += 128) p.process([], [[L.subarray(o, o + 128), R.subarray(o, o + 128)]]);
  const ms = performance.now() - t0;
  assert.ok(finite(L) && finite(R), 'fx output finite');
  const tail = (b) => peak(b.subarray(36000));
  assert.ok(tail(L) > 1e-3 && tail(R) > 1e-3, 'reverb and delay leave a tail after the note');
  let diff = 0; for (let i = 0; i < L.length; i++) diff = Math.max(diff, Math.abs(L[i] - R[i]));
  assert.ok(diff > 1e-3, 'returns are stereo');
  console.log(`fx chain: 1 s rendered in ${ms.toFixed(0)} ms`);
}
