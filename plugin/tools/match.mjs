// Sample-match check: renders the same message scripts with the web app's engine (site/js/dsp/engine.js, run as the
// AudioWorklet would be, in blocks of 128) and with the plugin's C++ port (the shyoy_render tool), and compares them
// sample by sample.   node plugin/tools/match.mjs path/to/shyoy_render
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const renderBin = process.argv[2];
if (!renderBin) { console.error('usage: node plugin/tools/match.mjs path/to/shyoy_render'); process.exit(2); }
const dir = mkdtempSync(join(tmpdir(), 'shyoy-match-'));
const boot = JSON.parse(readFileSync(new URL('../src/DefaultPatch.h', import.meta.url), 'utf8').match(/R"SHYOY\((.*)\)SHYOY"/s)[1]).boot;

async function jsEngine(sr) {
  globalThis.sampleRate = sr;
  let Proc;
  globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: () => {}, onmessage: null }; } };
  globalThis.registerProcessor = (_, c) => { Proc = c; };
  const f = join(dir, `engine-${sr}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, readFileSync(new URL('../../site/js/dsp/engine.js', import.meta.url), 'utf8'));
  await import(pathToFileURL(f).href);
  return new Proc();
}
async function renderJs(script) {
  const p = await jsEngine(script.sr), out = new Float32Array(script.blocks * 128);
  let r = 0;
  for (let b = 0; b < script.blocks; b++) {
    while (r < script.events.length && script.events[r][0] <= b) p.onMsg(script.events[r++][1]);
    p.process([], [[out.subarray(b * 128, b * 128 + 128)]]);
  }
  return out;
}
function renderCpp(name, script) {
  const sf = join(dir, name + '.json'), of = join(dir, name + '.f32');
  writeFileSync(sf, JSON.stringify(script));
  execFileSync(renderBin, [sf, of]);
  const b = readFileSync(of); return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

const sec = (s, sr = 48000) => Math.round(s * sr / 128);
const riff = (startBlock, notes, len, sr) => notes.flatMap((n, i) => { const b = startBlock + sec(i * len, sr); return [[b, { type: 'noteOn', n, acc: i % 3 === 0 }], [b + sec(len * 0.6, sr), { type: 'noteOff', n }]]; });
const B = (msgs) => msgs.map((m) => [0, m]);
const SCRIPTS = {
  'default sound, played notes': { sr: 48000, blocks: sec(4), events: [...B(boot), ...riff(10, [48, 55, 60, 63, 51, 58, 46, 60], 0.4, 48000)] },
  'default sound, octave sequencer': { sr: 48000, blocks: sec(5), events: [...B(boot), [5, { type: 'run', on: true }], [sec(2), { type: 'noteOn', n: 53 }], [sec(2.2), { type: 'noteOff', n: 53 }], [sec(4), { type: 'run', on: false }]] },
  'square, PWM, LFO, glide, 44.1 kHz': { sr: 44100, blocks: sec(4, 44100), events: [...B(boot), [0, { type: 'params', p: { saw: 0, pulse: 1, sub: 0.6, subType: 2, pwmSrc: 0, pw: 0.8, lfoRate: 0.6, lfoWave: 1, vcoMod: 0.3, glideMode: 2, glide: 0.4, sustain: 0.6, attack: 0.3, release: 0.5, noise: 0.2, trig: 2 } }], ...riff(4, [36, 48, 43, 60, 39], 0.7, 44100)] },
  'self-oscillating filter, random LFO, noise': { sr: 48000, blocks: sec(3), events: [...B(boot), [0, { type: 'params', p: { saw: 0, sub: 0, noise: 0.6, cutoff: 0.6, reso: 1, vcaMode: 1, lfoWave: 2, lfoRate: 0.7, vcfMod: 0.5, kybd: 1 } }], [2, { type: 'noteOn', n: 60 }], [sec(1.5), { type: 'param', id: 'lever', v: 0.7 }], [sec(2), { type: 'param', id: 'bendVcf', v: 0.5 }]] },
  'bent circuit (Starved & bent bridges)': { sr: 48000, blocks: sec(3), events: [...B(boot), [0, { type: 'bend', b: { vBatt: 5.6, rBatt: 4, tReset: 0.00008, rDis: 900, cf: [240e-12, 680e-12, 240e-12, 240e-12], otaOff: 0.018 } }], [0, { type: 'bridges', br: { 'LFOTRI>VCOCV': .2, 'VCFOUT>VCOCV': .55, 'SAW>ENVCAP': .3, 'FINGER>VCFIN': .3 } }], ...riff(2, [48, 51, 55, 58], 0.6, 48000)] },
  'oversampling 1x, 44.1 kHz': { sr: 44100, blocks: sec(3, 44100), events: [...B(boot), [0, { type: 'os', n: 1 }], [0, { type: 'params', p: { noise: 0.3, reso: 0.95, pulse: 0.7, cutoff: 0.7 } }], ...riff(2, [36, 60, 72, 48], 0.6, 44100)] },
  'oversampling 4x, noise, resonance': { sr: 48000, blocks: sec(3), events: [...B(boot), [0, { type: 'os', n: 4 }], [0, { type: 'params', p: { noise: 0.5, reso: 1, cutoff: 0.8, drive: 1, vcaMode: 1 } }], ...riff(2, [40, 64, 52, 76], 0.6, 48000)] },
  'note list, lanes, cycle, retrig, nudged key': { sr: 48000, blocks: sec(7), events: [...B(boot), [0, { type: 'seq', seq: { len: { o: 5, on: 7, s: 3, a: 16 }, st: { o: 2, on: 0, s: 4, a: 1 }, rt: { o: true, on: true, s: false, a: false }, notes: [48, 51, 55, 58, 63], loop: 7, adv: 'gate', cyc: 11, bpm: 133 } }], [5, { type: 'run', on: true }], [sec(2.1), { type: 'noteOn', n: 53 }], [sec(2.3), { type: 'noteOff', n: 53 }], [sec(3.5), { type: 'seq', seq: { adv: 'step', loop: 0, cyc: 0 } }], [sec(4.4), { type: 'param', id: 'glide', v: 0.05 }], [sec(6.5), { type: 'run', on: false }]] },
  'hold, transpose, legato, 96 kHz': { sr: 96000, blocks: sec(3, 96000), events: [...B(boot), [0, { type: 'mode', hold: true }], [0, { type: 'param', id: 'transpose', v: 2 }], [1, { type: 'noteOn', n: 50 }], [sec(0.3, 96000), { type: 'noteOn', n: 57 }], [sec(0.6, 96000), { type: 'noteOff', n: 57 }], [sec(0.7, 96000), { type: 'noteOff', n: 50 }], [sec(2, 96000), { type: 'panic' }]] },
};

import { writeFileSync as wf } from "node:fs";
// The plugin computes Math.sin as V8's fdlibm does (as Node on Linux and Windows does). Node on macOS uses another
// sine (it differs in the last bit for about 3% of inputs). Only the hum on the FINGER bend node goes through Math.sin
// per sample, so on such a Node the bent-circuit test can drift apart without either engine being wrong: it is
// reported, not failed.
const SIN_PROBE = [[-7.3224671197493452, -0.86204044383781209], [-0.50812388628872895, -0.48653902076267852], [2.1740825697870587, 0.82347560932038955], [8.225251261414396, 0.93186747742004195], [-2.5688768091991596, -0.54191652785335864], [-0.95093536819670099, -0.81395923673833503]];
const fdlibmSin = SIN_PROBE.every(([x, y]) => Math.sin(x) === y);
if (!fdlibmSin) console.log("note: this Node's Math.sin is not V8's fdlibm one, so the FINGER (hum) test is informational here");
let worst = 0, fail = false;
for (const [name, script] of Object.entries(SCRIPTS)) {
  const a = await renderJs(script), b = renderCpp(name.replace(/\W+/g, '-'), script);
  if (process.env.DUMP) { wf(`/tmp/js-${name.replace(/\W+/g, "-")}.f32`, Buffer.from(a.buffer)); }
  if (a.length !== b.length) { console.log(`FAIL ${name}: lengths ${a.length} vs ${b.length}`); fail = true; continue; }
  let max = 0, at = -1, exact = 0, pk = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) { max = d; at = i; } if (d === 0) exact++; pk = Math.max(pk, Math.abs(a[i])); }
  const db = max > 0 ? (20 * Math.log10(max)).toFixed(1) + ' dBFS' : 'none';
  const usesSin = JSON.stringify(script.events).includes('FINGER>');
  const ok = max < 1e-5;   // -100 dBFS
  if (!ok && (fdlibmSin || !usesSin)) fail = true; worst = Math.max(worst, max);
  console.log(`${ok ? 'ok  ' : fdlibmSin || !usesSin ? 'FAIL' : 'info'} ${name}: ${a.length} samples, peak ${pk.toFixed(3)}, ${(100 * exact / a.length).toFixed(2)}% bit-identical, largest difference ${db}${at >= 0 && max > 0 ? ` at sample ${at}` : ''}`);
}
console.log(fail ? 'SAMPLE MATCH FAILED' : `sample match ok (largest difference ${worst ? (20 * Math.log10(worst)).toFixed(1) + ' dBFS' : 'none'})`);
process.exit(fail ? 1 : 0);
