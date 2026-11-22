// Runs Shyoy's AudioWorklet engine (site/js/dsp/engine.js, the circuit model) headless in Node and checks pitch,
// stability and the bend paths.
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
writeFileSync(join(dir, 'dsp.mjs'), src('engine.js'));
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
// played notes + heavy bending stays finite and bounded
{
  const [p, send] = make();
  for (const n of [48, 55, 60, 63]) { send({ type: 'noteOn', n, acc: n === 60 }); render(p, .3); send({ type: 'noteOff', n }); }
  send({ type: 'noteOn', n: 48 }); assert.ok(finite(render(p, 2)));
  send({ type: 'bend', b: { vBatt: 5, rBatt: 10, tReset: 3e-3, rDis: 200e3, fbInv: 1, cf: [1e-9, 100e-9, 2e-9, 50e-9], otaOff: 0.06, ce: 1e-7, hys: 9, tempC: 80 } });
  const br = {}; for (const s of ['SAW', 'LFOSQ', 'VCFOUT', 'FINGER', 'VCAOUT']) for (const d of ['VCOCAP', 'VCOCV', 'VCFIN', 'VCFC2', 'ENVCAP', 'VCACV']) br[`${s}>${d}`] = 1;
  send({ type: 'bridges', br });
  const b = render(p, 3);
  assert.ok(finite(b), 'bent circuit produced NaN'); assert.ok(peak(b) <= 1);
}
console.log('engine tests passed');
// last-note priority: letting go of an older key under a newer one changes nothing
{
  const [p, send] = make();
  send({ type: 'params', p: { trig: 0, attack: 0, decay: .2, sustain: .5 } });
  send({ type: 'noteOn', n: 60 }); render(p, .3);
  send({ type: 'noteOn', n: 65 }); render(p, .3);
  const st = p.stage, pt = p.pitchT;
  assert.ok(st !== 1, 'expected decay/sustain after 0.3 s');
  send({ type: 'noteOff', n: 60 });
  assert.equal(p.stage, st, 'releasing an older key retriggered the envelope');
  assert.equal(p.pitchT, pt, 'releasing an older key moved the pitch');
  send({ type: 'noteOn', n: 60 }); render(p, .3);
  send({ type: 'noteOff', n: 60 });
  assert.equal(p.pitchT, pt, 'releasing the newest key should fall back to the held one');
}
console.log('key priority ok');

// v0.42.0: the octave sequencer steps on time, plays C in each step's octave, rests on off steps, follows a played key
{
  const [p, send] = make(), steps = [{ on: true, o: 0 }, { on: true, o: 1 }, { on: false, o: 0 }, { on: true, o: 2 }];
  send({ type: 'seq', seq: { steps, bpm: 120 } }); send({ type: 'run', on: true });
  const at = []; render(p, 0.03); for (let k = 0; k < 4; k++) { at.push([p.pitchT, p.gate]); render(p, 0.125); }
  assert.equal(at[1][0] - at[0][0], 12, 'step 2 should be an octave above step 1');
  assert.equal(at[2][1], false, 'an off step rests');
  send({ type: 'noteOn', n: 62 }); render(p, 0.25);
  assert.equal(p.root, 62 + 12 * p.P.transpose - 12, 'a key played while running moves the root');
  send({ type: 'run', on: false }); assert.equal(p.gate, false);
}
{
  const [p, send] = make(), steps = Array.from({ length: 16 }, (_, i) => ({ on: true, o: i % 3, s: false, a: false }));
  send({ type: 'seq', seq: { steps, bpm: 120, len: { o: 3, on: 16, s: 16, a: 16 } } }); send({ type: 'run', on: true });
  const at = []; render(p, 0.03); for (let k = 0; k < 6; k++) { at.push(p.pitchT); render(p, 0.125); }
  assert.equal(at[3], at[0], 'a 3-step octave lane repeats every 3 steps'); assert.equal(at[4] - at[0], 12);
}
// v0.47.0: a recorded note list: each gate plays the next note (rests don't use one up); a key moves the list
{
  const [p, send] = make(), steps = Array.from({ length: 16 }, (_, i) => ({ on: i !== 1, o: 0, s: false, a: false }));
  send({ type: 'seq', seq: { steps, bpm: 120, notes: [48, 52, 55] } }); send({ type: 'run', on: true });
  const at = []; render(p, 0.03); for (let k = 0; k < 6; k++) { at.push(p.gate ? p.pitchT : null); render(p, 0.125); }
  const T = 12 * p.P.transpose - 12;
  assert.deepEqual(at, [48 + T, null, 52 + T, 55 + T, 48 + T, 52 + T], 'gates step through the note list, rests skip none');
  send({ type: 'noteOn', n: 50 }); render(p, 0.125 * 3);
  assert.equal((p.pitchT - T - 48) % 1, 0); assert.ok([50, 54, 57].includes(p.pitchT - T), 'a key moves the list by its distance from the first note');
}
// v0.50.0: LOOP plays only the first notes; adv 'step' moves on every step, rests included
{
  const [p, send] = make(), steps = Array.from({ length: 16 }, (_, i) => ({ on: i !== 1, o: 0, s: false, a: false }));
  send({ type: 'seq', seq: { steps, bpm: 120, notes: [48, 52, 55], loop: 2, adv: 'step' } }); send({ type: 'run', on: true });
  const at = []; render(p, 0.03); for (let k = 0; k < 5; k++) { at.push(p.gate ? p.pitchT : null); render(p, 0.125); }
  const T = 12 * p.P.transpose - 12;
  assert.deepEqual(at, [48 + T, null, 48 + T, 52 + T, 48 + T], 'loop 2 by steps: the rest uses up note 2');
  const [q, sq] = make(), on = Array.from({ length: 16 }, () => ({ on: true, o: 0, s: false, a: false }));
  sq({ type: 'seq', seq: { steps: on, bpm: 120, notes: [48, 52, 55], loop: 5 } }); sq({ type: 'run', on: true });
  const b2 = []; render(q, 0.03); for (let k = 0; k < 7; k++) { b2.push(q.pitchT - T); render(q, 0.125); }
  assert.deepEqual(b2, [48, 52, 55, 48, 52, 48, 52], 'loop 5 over 3 notes: round the notes, back to note 1 after 5');
}
console.log('sequencer ok');
