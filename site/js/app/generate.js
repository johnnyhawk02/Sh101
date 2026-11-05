// Shyoy: Generate, new patterns from real acid basslines (ported from the TB-303 app's generate.js).
// The sources are PATTERN_BANK (patterns.js), turned into Shyoy steps: code = v >> 3 gives the key (code % 12) and the
// octave lane (code / 12 - 2); a rest keeps the pitch of the note before it. Patterns with no notes are skipped.
const GEN_SOURCES = [];
for (const [g, ps] of Object.entries(PATTERN_BANK)) for (const [n, [, raw]] of Object.entries(ps)) {
  if (!raw.some(v => v & 1)) continue;
  const first = raw.find(v => v & 1) >> 3;
  let last = first;
  const steps = raw.map(v => {
    const gate = !!(v & 1), code = gate ? v >> 3 : last; if (gate) last = code;
    return { n: code % 12, o: Math.max(-2, Math.min(2, Math.floor(code / 12) - 2)), m: gate ? 'N' : 'R', a: gate && !!(v & 2), s: gate && !!(v & 4) };
  });
  GEN_SOURCES.push({ name: `${g.replace(/^ABL3 /, '')} / ${n}`, steps });
}
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// Generate: a random source pattern, fitted to the length, then one to three of these moves
const GEN_MOVES = {
  // grab a few steps and loop them to the end
  loop(P) { const n = P.length, k = rint(2, Math.max(2, Math.min(8, n >> 1))), at = rint(0, n - k), from = rint(at + k, n - 1);
    const seg = P.slice(at, at + k); for (let i = from; i < n; i++) P[i] = { ...seg[(i - from) % k] }; return `looped steps ${at + 1}–${at + k} from step ${from + 1} to the end`; },
  reverse(P) { if (Math.random() < 0.5) { P.reverse(); return 'reversed'; }
    const h = P.length >> 1, back = P.slice(h).reverse(); P.splice(h, back.length, ...back); return 'reversed the second half'; },
  // a step plays twice in a row, pushing the rest along (the end drops off)
  dup(P) { const c = rint(1, Math.max(1, P.length >> 3)); for (let j = 0; j < c; j++) { const i = rint(0, P.length - 2); P.splice(i, 0, { ...P[i] }); P.pop(); } return `doubled ${c} step${c > 1 ? 's' : ''}`; },
  shuffle(P) { const n = P.length, b = n >= 8 && Math.random() < 0.5 ? 4 : 1, blocks = [];
    for (let i = 0; i < n; i += b) blocks.push(P.slice(i, i + b));
    const sw = rint(1, Math.max(1, blocks.length >> 2));
    for (let j = 0; j < sw; j++) { const x = rint(0, blocks.length - 1), y = rint(0, blocks.length - 1); [blocks[x], blocks[y]] = [blocks[y], blocks[x]]; }
    P.splice(0, n, ...blocks.flat()); return b > 1 ? `swapped ${sw} beat${sw > 1 ? 's' : ''}` : `swapped ${sw} step${sw > 1 ? 's' : ''}`; },
};
// build one bar (or the whole source if it is longer), move it, then later bars are the first one with one more move each
function generatePattern(len) {
  const src = GEN_SOURCES[Math.floor(Math.random() * GEN_SOURCES.length)], sp = src.steps;
  const barLen = Math.min(len, Math.max(16, sp.length));
  const P = Array.from({ length: barLen }, (_, i) => ({ ...sp[i % sp.length] }));
  const did = Object.keys(GEN_MOVES).sort(() => Math.random() - 0.5).slice(0, rint(1, 3)).map(m => GEN_MOVES[m](P));
  const out = [...P];
  while (out.length < len) {
    const seg = P.map(st => ({ ...st })), mv = Object.keys(GEN_MOVES); GEN_MOVES[mv[rint(0, mv.length - 1)]](seg);
    out.push(...seg.slice(0, len - out.length));
  }
  if (!out.some(st => st.m !== 'R')) out[0].m = 'N';
  // the moves reorder steps, so give each rest the pitch of the note before it again
  let pv = out.find(st => st.m !== 'R');
  for (const st of out) if (st.m === 'R') { st.n = pv.n; st.o = pv.o; } else pv = st;
  // the sources have no ties: about 1 in 10 notes that follow a note of the same pitch becomes one
  for (let i = 1; i < out.length; i++) {
    const st = out[i], pv = out[i - 1];
    if (st.m === 'N' && pv.m !== 'R' && pv.n === st.n && pv.o === st.o && Math.random() < 0.1) st.m = 'T';
  }
  return { steps: out.map(st => ({ ...st })), src: src.name, did };
}
