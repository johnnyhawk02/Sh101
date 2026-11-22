// Shyoy: the simple octave sequencer (v0.42.0, Johnny: "a simple octave sequencer, note ons and octave and slides").
// 16 steps, each { on, o: octaves above the current note 0 / 1 / 2, s: slide, a: accent }. Every step plays one note: C3, or the last key played while it
// runs. The engine keeps time (see seqStep in engine.js); the 3D panel's SEQUENCER row edits state.seq.
const SEQ_N = 16;
// v0.42.1 (Johnny: "remove the tempo, as it'll soon be a VST"): a fixed 120 BPM here; the host will set it. Steps gain accent (a)
const SEQ0 = () => ({ steps: [1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1].map((on, i) => ({ on: !!on, o: [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1][i], s: i === 4 || i === 12, a: i % 4 === 0 })) });
// v0.47.0 (Johnny: "add the classic sh101 sequencer in there - press record and tap in the notes - the gate seq plays them in order"):
// RECORD clears the note list and every key played (computer keys or MIDI) adds one, until RECORD or PLAY is pressed again. While
// it runs, each GATE step plays the next note in the list (round and round), the octave lane on top; a key played then moves
// the whole list (the list's first note = as recorded). With no notes, a gate plays the last key, as before
const SEQ_NOTES_MAX = 100;
let seqRec = false, seqNoteAt = -1;
// v0.43.0 (Johnny): each lane (octave, note, slide, accent) has its own length, 1-16
const SEQ_LANES = ['o', 'on', 's', 'a'];
// a pattern as saved (the session, or a preset since v0.46.0), checked and filled in
function seqTidy(q) {
  q = q && typeof q === 'object' && Array.isArray(q.steps) && q.steps.length === SEQ_N ? JSON.parse(JSON.stringify(q)) : SEQ0();
  q.steps = q.steps.map((s) => ({ on: !!(s && s.on), o: Math.max(0, Math.min(2, (s && s.o) | 0)), s: !!(s && s.s), a: !!(s && s.a) }));
  q.len = Object.assign({ o: SEQ_N, on: SEQ_N, s: SEQ_N, a: SEQ_N }, q.len || {});
  // v0.43.1 (Johnny): a RETRIG tick per lane: a key played while it runs starts that lane again from step 1
  // v0.43.9 (Johnny: "a dragger at the front of the boxes too"): each lane also has a start step, so it loops from st to st + len - 1
  q.st = Object.assign({ o: 0, on: 0, s: 0, a: 0 }, q.st || {});
  for (const k of SEQ_LANES) { q.st[k] = Math.max(0, Math.min(SEQ_N - 1, q.st[k] | 0)); q.len[k] = Math.max(1, Math.min(SEQ_N - q.st[k], q.len[k] | 0)); }
  q.rt = Object.assign({ o: false, on: false, s: false, a: false }, q.rt || {});
  // v0.47.0: the recorded note list (MIDI note numbers, before OCTAVE); empty = every gate plays the last key
  q.notes = Array.isArray(q.notes) ? q.notes.filter((n) => Number.isFinite(n)).map((n) => Math.max(0, Math.min(127, n | 0))).slice(0, SEQ_NOTES_MAX) : [];
  return q;
}
// v0.42.2: a v0.42.0-1 pattern (octaves -1..1) moves up one before it's tidied
if (state.seq && Array.isArray(state.seq.steps) && state.seq.steps.some((s) => s && s.o < 0)) state.seq.steps.forEach((s) => { s.o = (s.o | 0) + 1; });
state.seq = seqTidy(state.seq);
// v0.46.0: a preset's pattern (sounds.js applyPreset); the playheads carry on where they are
function seqLoad(q) { state.seq = seqTidy(q); seqSend(); }
// v0.42.2 (Johnny: "octave should be current note +1 and +2"): octaves are 0, 1, 2 above the current note
let seqOn = false, seqPos = -1, seqLanePos = null;
const seqBpm = () => 120;
const seqMsg = () => ({ type: 'seq', seq: { steps: state.seq.steps.map((s) => ({ on: s.on, o: s.o, s: s.s, a: s.a })), bpm: seqBpm(), len: { ...state.seq.len }, st: { ...state.seq.st }, rt: { ...state.seq.rt }, notes: [...state.seq.notes] } });
function seqSend() { post(seqMsg()); save(); }
async function seqRun(on = !seqOn) { await boot(); seqRec = false; seqOn = on; if (!on) { seqPos = -1; seqLanePos = null; seqNoteAt = -1; } post(seqMsg()); post({ type: 'run', on }); }
function seqRecord(on = !seqRec) { boot(); seqRec = on; if (on) { state.seq.notes = []; seqNoteAt = -1; seqSend(); } }
// a key while RECORD is on: add it to the list. True when the key shouldn't also go to the engine (it would move the running pattern)
function seqRecNote(n) { if (!seqRec) return false; if (state.seq.notes.length < SEQ_NOTES_MAX) { state.seq.notes.push(n); seqSend(); } return seqOn; }
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n) => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
// v0.42.4 (Johnny): nudge the whole pattern a step (d -1 = left, 1 = right), and randomise one part of every step
// v0.43.0: each lane turns round within its own length
function seqNudge(d) {
  for (const k of SEQ_LANES) { const n = state.seq.len[k], a = state.seq.st[k], S = state.seq.steps, v = S.slice(a, a + n).map((s) => s[k]);
    if (d < 0) v.push(v.shift()); else v.unshift(v.pop()); v.forEach((x, i) => { S[a + i][k] = x; }); }
  seqSend();
}
function seqLen(k, n) { n = Math.max(1, Math.min(SEQ_N - state.seq.st[k], n | 0)); if (state.seq.len[k] === n) return; state.seq.len[k] = n; seqSend(); }
// move a lane's start, keeping its end where it is
function seqStart(k, a) { const e = state.seq.st[k] + state.seq.len[k]; a = Math.max(0, Math.min(e - 1, a | 0)); if (a === state.seq.st[k]) return; state.seq.st[k] = a; state.seq.len[k] = e - a; seqSend(); }
// v0.43.10: slide a lane's whole loop, keeping its length
function seqShift(k, a) { a = Math.max(0, Math.min(SEQ_N - state.seq.len[k], a | 0)); if (a === state.seq.st[k]) return; state.seq.st[k] = a; seqSend(); }
// v0.43.16 (Johnny: "a reset loops button to set them all to 16 steps")
function seqResetLoops() { for (const l of SEQ_LANES) { state.seq.st[l] = 0; state.seq.len[l] = SEQ_N; } seqSend(); }
function seqRandom(k) {
  const r = Math.random;
  if (k === 'all') { for (const l of SEQ_LANES) seqRandom(l); seqRandom('len'); seqRandom('rt'); return; }
  // v0.43.3 (Johnny): lane lengths (16 about a third of the time, else a short loop that runs against it) and retrig ticks
  // v0.43.15 (Johnny: "randomise all rnd the start of the draggable boxes"): each loop also starts somewhere random
  if (k === 'len') { for (const l of SEQ_LANES) { const n = r() < 0.35 ? SEQ_N : [3, 4, 5, 6, 7, 8, 12][Math.floor(r() * 7)]; state.seq.len[l] = n; state.seq.st[l] = Math.floor(r() * (SEQ_N - n + 1)); } return seqSend(); }
  if (k === 'rt') { for (const l of SEQ_LANES) state.seq.rt[l] = r() < 0.35; return seqSend(); }
  for (const st of state.seq.steps) {
    if (k === 'on') st.on = r() < 0.7;
    else if (k === 'a') st.a = r() < 0.25;
    else if (k === 's') st.s = r() < 0.2;
    else if (k === 'o') { const x = r(); st.o = x < 0.6 ? 0 : x < 0.88 ? 1 : 2; }
  }
  seqSend();
}
// v0.48.0 (Johnny: "make all the seq randomiser into a menu - have shortkeys for them"): the RANDOM menu's rows (view3d.js) and their
// keys: the number keys, clear of the note keys (A-; and the black keys above) and Z/X (octave)
const SEQ_RND = [['RANDOM ALL', '1', () => seqRandom('all')], ['RANDOM GATES', '2', () => seqRandom('on')], ['RANDOM ACCENTS', '3', () => seqRandom('a')],
  ['RANDOM SLIDES', '4', () => seqRandom('s')], ['RANDOM OCTAVES', '5', () => seqRandom('o')], ['RANDOM LENGTHS', '6', () => seqRandom('len')],
  ['RANDOM RETRIGS', '7', () => seqRandom('rt')], ['RESET LOOPS', '0', () => seqResetLoops()]];
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || (e.target.matches && e.target.matches('input, select, textarea'))) return;
  const r = SEQ_RND.find(([, k]) => k === e.key); if (r) { e.preventDefault(); r[2](); }
});
function seqStepSet(i, k, v) { const st = state.seq.steps[i]; st[k] = v; seqSend(); }
// the space bar starts and stops it
window.addEventListener('keydown', (e) => {
  if (e.key !== ' ' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches && e.target.matches('input, select, textarea, button')) return;
  e.preventDefault(); seqRun();
});
