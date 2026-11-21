// Shyoy: the simple octave sequencer (v0.42.0, Johnny: "a simple octave sequencer, note ons and octave and slides").
// 16 steps, each { on, o: octave -1 / 0 / +1, s: slide }. Every step plays one note: C, or the last key played while it
// runs. The engine keeps time (see seqStep in engine.js); the 3D panel's SEQUENCER row edits state.seq.
const SEQ_N = 16;
const SEQ0 = () => ({ tempo: 0.43, steps: [1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1].map((on, i) => ({ on: !!on, o: [0, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, -1, 0][i], s: i === 4 || i === 12 })) });
if (!state.seq || !Array.isArray(state.seq.steps) || state.seq.steps.length !== SEQ_N) state.seq = SEQ0();
let seqOn = false, seqPos = -1;
const seqBpm = () => Math.round(60 + state.seq.tempo * 140);
const seqMsg = () => ({ type: 'seq', seq: { steps: state.seq.steps.map((s) => ({ on: s.on, o: s.o, s: s.s })), bpm: seqBpm() } });
function seqSend() { post(seqMsg()); save(); }
async function seqRun(on = !seqOn) { await boot(); seqOn = on; if (!on) seqPos = -1; post(seqMsg()); post({ type: 'run', on }); }
function seqStepSet(i, k, v) { const st = state.seq.steps[i]; st[k] = v; seqSend(); }
function seqTempo(v) { state.seq.tempo = Math.max(0, Math.min(1, v)); seqSend(); }
// the space bar starts and stops it
window.addEventListener('keydown', (e) => {
  if (e.key !== ' ' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches && e.target.matches('input, select, textarea, button')) return;
  e.preventDefault(); seqRun();
});
