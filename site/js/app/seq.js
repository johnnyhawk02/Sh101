// Shyoy: the simple octave sequencer (v0.42.0, Johnny: "a simple octave sequencer, note ons and octave and slides").
// 16 steps, each { on, o: octaves above the current note 0 / 1 / 2, s: slide, a: accent }. Every step plays one note: C3, or the last key played while it
// runs. The engine keeps time (see seqStep in engine.js); the 3D panel's SEQUENCER row edits state.seq.
const SEQ_N = 16;
// v0.42.1 (Johnny: "remove the tempo, as it'll soon be a VST"): a fixed 120 BPM here; the host will set it. Steps gain accent (a)
const SEQ0 = () => ({ steps: [1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1].map((on, i) => ({ on: !!on, o: [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1][i], s: i === 4 || i === 12, a: i % 4 === 0 })) });
if (!state.seq || !Array.isArray(state.seq.steps) || state.seq.steps.length !== SEQ_N) state.seq = SEQ0();
// v0.43.0 (Johnny): each lane (octave, note, slide, accent) has its own length, 1-16
const SEQ_LANES = ['o', 'on', 's', 'a'];
state.seq.len = Object.assign({ o: SEQ_N, on: SEQ_N, s: SEQ_N, a: SEQ_N }, state.seq.len || {});
// v0.43.1 (Johnny): a RETRIG tick per lane: a key played while it runs starts that lane again from step 1
state.seq.rt = Object.assign({ o: false, on: false, s: false, a: false }, state.seq.rt || {});
// v0.42.2 (Johnny: "octave should be current note +1 and +2"): octaves are 0, 1, 2 above the current note; a v0.42.0-1 pattern (-1..1) moves up one
if (state.seq.steps.some((s) => s.o < 0)) state.seq.steps.forEach((s) => { s.o = (s.o | 0) + 1; });
let seqOn = false, seqPos = -1, seqLanePos = null;
const seqBpm = () => 120;
const seqMsg = () => ({ type: 'seq', seq: { steps: state.seq.steps.map((s) => ({ on: s.on, o: s.o, s: s.s, a: s.a })), bpm: seqBpm(), len: { ...state.seq.len }, rt: { ...state.seq.rt } } });
function seqSend() { post(seqMsg()); save(); }
async function seqRun(on = !seqOn) { await boot(); seqOn = on; if (!on) { seqPos = -1; seqLanePos = null; } post(seqMsg()); post({ type: 'run', on }); }
// v0.42.4 (Johnny): nudge the whole pattern a step (d -1 = left, 1 = right), and randomise one part of every step
// v0.43.0: each lane turns round within its own length
function seqNudge(d) {
  for (const k of SEQ_LANES) { const n = state.seq.len[k], S = state.seq.steps, v = S.slice(0, n).map((s) => s[k]);
    if (d < 0) v.push(v.shift()); else v.unshift(v.pop()); v.forEach((x, i) => { S[i][k] = x; }); }
  seqSend();
}
function seqLen(k, n) { n = Math.max(1, Math.min(SEQ_N, n | 0)); if (state.seq.len[k] === n) return; state.seq.len[k] = n; seqSend(); }
function seqRandom(k) {
  if (k === 'all') { for (const l of SEQ_LANES) seqRandom(l); return; }
  const r = Math.random;
  for (const st of state.seq.steps) {
    if (k === 'on') st.on = r() < 0.7;
    else if (k === 'a') st.a = r() < 0.25;
    else if (k === 's') st.s = r() < 0.2;
    else if (k === 'o') { const x = r(); st.o = x < 0.6 ? 0 : x < 0.88 ? 1 : 2; }
  }
  seqSend();
}
function seqStepSet(i, k, v) { const st = state.seq.steps[i]; st[k] = v; seqSend(); }
// the space bar starts and stops it
window.addEventListener('keydown', (e) => {
  if (e.key !== ' ' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches && e.target.matches('input, select, textarea, button')) return;
  e.preventDefault(); seqRun();
});
