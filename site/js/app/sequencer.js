// Shyoy: Sequencer piano roll, its side sliders, Randomise and Alter.
// ---------- UI: sequencer (piano roll) ----------
// A step is { n: key 0-11, o: octave -2..2, m: 'N' note | 'T' tie | 'R' rest, a: accent, s: slide }.
// Rows: step numbers, octave lanes, keys B..C, then tie, slide and accent. At least 32 columns show;
// columns past the pattern's end are dim, and pressing one grows the pattern to it (up to 64).
const roll = document.getElementById('roll');
const KEY_ROWS = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], OCT_ROWS = [2, 1, -1, -2], BLACK = new Set([1, 3, 6, 8, 10]);
const FLAG_ROWS = [['t', 'tie'], ['s', 'slide'], ['a', 'acc']];
const SEQ_SHOW = 32, SEQ_MAX = 64;
let selStep = -1, playStep = -1, seqCols = [], tail = [], playingSlot = -1, chainOffs = [];
const undoStack = []; // up to 30 changes back (the 303 app's pattern Undo)
const restStep = (st) => ({ n: st ? st.n : 0, o: st ? st.o : 0, m: 'R', a: false, s: false });
function renderSeq() {
  const P = state.steps, n = P.length, cols = Math.max(SEQ_SHOW, n);
  const focusId = document.activeElement && document.activeElement.closest && document.activeElement.closest('#roll') ? document.activeElement.id : '';
  const ghost = Array.from({ length: cols - n }, (_, j) => n + j);
  const bar = i => (i % 4 === 3 && i < cols - 1 ? ' bar' : '') + (i === n - 1 && n < cols ? ' end' : '');
  const gcell = (cls, t, v, i, lab) => `<button class="cell ghost${cls}${bar(i)}" data-gcol="${i}" data-gt="${t}" data-v="${v}" tabindex="-1" aria-label="Extend to step ${i + 1}, ${lab}"></button>`;
  let h = '<div class="rh">step</div>' + P.map((_, i) => `<button class="hd${bar(i)}${i === selStep ? ' sel' : ''}" data-col="${i}" data-h="${i}" id="sh-${i}" aria-label="Write step ${i + 1} from the keyboard" aria-pressed="${i === selStep}">${i % 4 === 0 ? i + 1 : ''}</button>`).join('')
    + ghost.map(i => `<div class="hd ghost${bar(i)}">${i % 4 === 0 ? i + 1 : ''}</div>`).join('');
  OCT_ROWS.forEach((o, r) => {
    const last = r === OCT_ROWS.length - 1 ? ' gap' : '', lab = (o > 0 ? '+' : '−') + Math.abs(o), ol = 'octave ' + lab;
    h += `<div class="rh${last}">${lab}</div>` + P.map((st, i) => {
      const on = st.o === o, lit = on && st.m !== 'R';
      return `<button class="cell${lit ? ' on' : on ? ' mem' : ''}${bar(i)}${last}" id="so${o}_${i}" data-col="${i}" data-t="o" data-v="${o}" aria-pressed="${on}" aria-label="Step ${i + 1} ${ol}"></button>`;
    }).join('') + ghost.map(i => gcell(last, 'o', o, i, ol)).join('');
  });
  KEY_ROWS.forEach((k, r) => {
    const cls = (BLACK.has(k) ? ' blk' : '') + (r === KEY_ROWS.length - 1 ? ' gap' : '');
    h += `<div class="rh${cls}">${NOTE[k].toLowerCase()}</div>` + P.map((st, i) => {
      const on = st.n === k, c = !on ? '' : st.m === 'N' ? ' on' : st.m === 'T' ? ' tie' : ' mem';
      return `<button class="cell${cls}${c}${bar(i)}" id="sk${k}_${i}" data-col="${i}" data-t="k" data-v="${k}" aria-pressed="${on && st.m !== 'R'}" aria-label="Step ${i + 1} ${NOTE[k]}${on && st.m === 'R' ? ' (rest)' : on && st.m === 'T' ? ' (tied)' : ''}"></button>`;
    }).join('') + ghost.map(i => gcell(cls, 'k', k, i, NOTE[k])).join('');
  });
  for (const [t, lab] of FLAG_ROWS) {
    h += `<div class="rh">${lab}</div>` + P.map((st, i) => {
      const on = t === 't' ? st.m === 'T' : st[t];
      return `<button class="cell${on ? ' on' : ''}${bar(i)}" id="s${t}_${i}" data-col="${i}" data-t="${t}" aria-pressed="${on}" aria-label="Step ${i + 1} ${lab}"></button>`;
    }).join('') + ghost.map(i => gcell('', t, 0, i, lab)).join('');
  }
  roll.innerHTML = h; roll.style.setProperty('--steps', cols);
  seqCols = P.map(() => []);
  for (const el of roll.querySelectorAll('[data-col]')) seqCols[+el.dataset.col].push(el);
  if (running && seqCols[playStep]) for (const el of seqCols[playStep]) el.classList.add('cur');
  if (focusId) { const f = document.getElementById(focusId); if (f) f.focus(); }
  renderSide();
}
function renderSide() {
  const P = state.steps, p = state.params;
  document.getElementById('o-len').textContent = P.length;
  document.getElementById('o-gate').textContent = Math.round((0.1 + p.gateLen * 0.85) * 100) + '%';
  { const g = Math.round((0.1 + p.gateLen * 0.85) * 100); document.getElementById('gm-val').textContent = g + '%';
    for (const b of document.querySelectorAll('#gm-menu [data-gate]')) b.setAttribute('aria-checked', String(+b.dataset.gate === g)); }
  document.getElementById('o-swing').textContent = Math.round(p.swing * 100) + '%';
  const sv = (a, v) => { const el = sideIn[a]; if (el && !el.matches(':active')) el.value = v; };
  sv('len', P.length); sv('gate', Math.round((0.1 + p.gateLen * 0.85) * 100)); sv('swing', Math.round(p.swing * 100));
  document.getElementById('p-undo').disabled = !undoStack.length;
}
function stepChanged() { storeSlot(); renderSeq(); post(seqMsg()); save(); renderBank(); }
function setPitch(st, v) { st.o = Math.max(-2, Math.min(2, Math.floor(v / 12))); st.n = Math.max(0, Math.min(11, v - 12 * st.o)); }
// one press: a key cell sets that note, or rests the step if it is already that note; octave lanes toggle;
// tie holds the note before it (and takes its pitch); slide and accent toggle
function applyCell(b) {
  const i = +b.dataset.col, st = state.steps[i], t = b.dataset.t, v = +b.dataset.v;
  if (t === 'k') { if (st.n === v && st.m !== 'R') st.m = 'R'; else { st.n = v; st.m = 'N'; preview(i); } }
  else if (t === 'o') { st.o = st.o === v ? 0 : v; if (st.m === 'N') preview(i); }
  else if (t === 't') { if (st.m === 'T') st.m = 'N'; else { const pv = state.steps[(i - 1 + state.steps.length) % state.steps.length]; st.n = pv.n; st.o = pv.o; st.m = 'T'; } }
  else st[t] = !st[t];
}
// press and drag paints: the first cell's new state is laid on every step the stroke crosses; in the key rows
// the stroke follows the pointer up and down, so a line can be drawn
let paint = null, paintedClick = false;
function paintCell(b) {
  const i = +b.dataset.col, st = state.steps[i]; if (!st) return false;
  const t = b.dataset.t, v = +b.dataset.v, before = JSON.stringify(st);
  if (paint.t === 'k') { if (t !== 'k') return false; if (paint.on) { st.n = v; st.o = paint.oct; st.m = 'N'; } else st.m = 'R'; }
  else if (paint.t === 'o') { if (t !== 'o') return false; st.o = paint.oct; }
  else if (paint.t === 't') { if (t !== 't') return false; if (paint.on) { const pv = state.steps[(i - 1 + state.steps.length) % state.steps.length]; st.n = pv.n; st.o = pv.o; st.m = 'T'; } else if (st.m === 'T') st.m = 'N'; }
  else { if (t !== paint.t) return false; st[t] = paint.on; }
  return before !== JSON.stringify(st);
}
function extendTo(len) { const P = state.steps; while (P.length < Math.min(SEQ_MAX, len)) P.push(tail.shift() || restStep(P[P.length - 1])); }
roll.addEventListener('pointerdown', e => {
  boot();
  const g = e.target.closest('button[data-gcol]');
  if (g && e.button <= 0) {
    e.preventDefault(); const i = +g.dataset.gcol, t = g.dataset.gt, v = g.dataset.v;
    extendTo(i + 1); renderSeq();
    const id = t === 'o' ? `so${v}_${i}` : t === 'k' ? `sk${v}_${i}` : `s${t}_${i}`, b = document.getElementById(id);
    if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: e.pointerId, button: 0, clientX: e.clientX, clientY: e.clientY }));
    else stepChanged();
    return;
  }
  const b = e.target.closest('button[data-t]'); if (!b || e.button > 0) return;
  e.preventDefault(); keepUndo(); applyCell(b); paintedClick = true;
  const st = state.steps[+b.dataset.col], t = b.dataset.t;
  paint = { t, id: e.pointerId, on: t === 'k' ? st.m !== 'R' : t === 'o' ? true : t === 't' ? st.m === 'T' : st[t], oct: st.o,
    x: e.clientX, y: e.clientY, dirty: false, raf: 0 };
  stepChanged();
});
// a fast stroke: every point between the last pointer position and this one (coalesced events included) is
// hit-tested, so no step the stroke crosses is skipped; the roll is redrawn and the engine told at most once a
// frame, and the slot, bank and save are done once when the stroke ends (one Undo for the whole stroke)
function paintAt(x, y) {
  const t = document.elementFromPoint(x, y), b = t && t.closest && t.closest('#roll button[data-t]');
  return b ? paintCell(b) : false;
}
function paintFrame() { if (!paint) return; paint.raf = 0; renderSeq(); post(seqMsg()); }
addEventListener('pointermove', e => {
  if (!paint || e.pointerId !== paint.id) return;
  const pts = (e.getCoalescedEvents && e.getCoalescedEvents()) || []; if (!pts.length) pts.push(e);
  const gap = 6 * fitK(); let ch = false;
  for (const q of pts) {
    const dx = q.clientX - paint.x, dy = q.clientY - paint.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / gap));
    for (let k = 1; k <= n; k++) if (paintAt(paint.x + dx * k / n, paint.y + dy * k / n)) ch = true;
    paint.x = q.clientX; paint.y = q.clientY;
  }
  if (ch) { paint.dirty = true; if (!paint.raf) paint.raf = requestAnimationFrame(paintFrame); }
});
const endPaint = e => {
  if (!paint || e.pointerId !== paint.id) return;
  const p = paint; paint = null; if (p.raf) cancelAnimationFrame(p.raf);
  if (p.dirty) stepChanged();
};
addEventListener('pointerup', endPaint); addEventListener('pointercancel', endPaint);
roll.addEventListener('click', e => {
  const h = e.target.closest('button[data-h]');
  if (h) { const i = +h.dataset.h; selStep = selStep === i ? -1 : i; renderSeq(); return; }
  if (paintedClick) { paintedClick = false; if (e.detail !== 0) return; }
  const b = e.target.closest('button[data-t]'); if (!b) return;
  applyCell(b); stepChanged();
});
roll.addEventListener('keydown', e => {
  const b = e.target.closest('button[data-t]'); if (!b) return;
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
  const cells = [...roll.querySelectorAll('button[data-t]')], n = state.steps.length, idx = cells.indexOf(b);
  const r = Math.floor(idx / n), c = idx % n, rows = cells.length / n;
  const t = cells[Math.min(rows - 1, Math.max(0, r + d[1])) * n + Math.min(n - 1, Math.max(0, c + d[0]))];
  if (t) { e.preventDefault(); t.focus(); }
});
let prevT;
function preview(i) {
  if (running || !node) return; const st = state.steps[i]; const n = 60 + st.n + 12 * st.o;
  post({ type: 'noteOn', n }); clearTimeout(prevT); prevT = setTimeout(() => post({ type: 'noteOff', n }), 160);
}
const keepUndo = () => { undoStack.push(JSON.stringify({ steps: state.steps, tail })); if (undoStack.length > 30) undoStack.shift(); };
// length (under the roll), gate and swing (up top) are plain sliders (the Shift and Transpose spring sliders gave way to the D-pad under the roll)
const sideIn = {}; for (const el of document.querySelectorAll('.sld input')) sideIn[el.dataset.a] = el;
document.querySelector('.sq-body').addEventListener('input', e => {
  const el = e.target.closest('input[data-a]'); if (!el) return;
  const v = +el.value, P = state.steps, p = state.params;
  switch (el.dataset.a) {
    case 'len': while (P.length > v && P.length > 1) tail.unshift(P.pop()); extendTo(v); break;
    case 'gate': p.gateLen = (v / 100 - 0.1) / 0.85; break;
    case 'swing': p.swing = v / 100; break;
  }
  stepChanged();
});
document.getElementById('p-dup').onclick = () => {
  const P = state.steps, n = P.length, to = [16, 32, 64].find(x => x > n);
  if (!to) return;
  keepUndo(); state.steps = Array.from({ length: to }, (_, i) => ({ ...P[i % n] })); tail = [];
  stepChanged();
};
// Shuffle (the TB-303 app's shuffleSteps, v164): whole beats when the length is a multiple of 4 and at least 8, else steps
document.getElementById('p-shuf').onclick = () => {
  const P = state.steps, n = P.length; if (n < 2) return;
  keepUndo();
  const b = n >= 8 && n % 4 === 0 ? 4 : 1, before = JSON.stringify(P);
  for (let tries = 0; tries < 8 && JSON.stringify(state.steps) === before; tries++) {
    const blocks = []; for (let i = 0; i < n; i += b) blocks.push(P.slice(i, i + b));
    for (let i = blocks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; }
    state.steps = blocks.flat().map(st => ({ ...st }));
  }
  const Q = state.steps;
  Q.forEach((st, i) => {
    if (st.s && Q[(i + 1) % n].m === 'R') st.s = false;
    const pv = Q[i - 1];
    if (st.m === 'T' && (!pv || pv.m === 'R' || pv.n !== st.n || pv.o !== st.o)) st.m = 'N';
  });
  tail = []; stepChanged();
};
// Generate (the TB-303 app's AcidLab-style generator in generate.js): a new riff with no stored patterns. It keeps the pattern's length but
// writes all 64 steps; the steps past the length go into tail, so lengthening the pattern brings in more of the riff.
document.getElementById('p-rnd').onclick = () => {
  keepUndo(); const g = generatePattern(SEQ_MAX, genDens), n = state.steps.length; rw.base = null; rw.jump = 0.25; rw.pn = []; rw.p = [];
  state.steps = g.steps.slice(0, n); tail = g.steps.slice(n); stepChanged();
};
// Move notes (Tools menu, ] [ ⇧] ⇧[ , . and the D-pad). A real transpose: B up a semitone becomes C one octave up, and
// ties and rests move with their notes. If any note would go past octave -2 C or octave +2 B, nothing moves.
function nudgeNotes(d) {
  const P = state.steps, pit = st => st.n + 12 * st.o, notes = P.filter(st => st.m !== 'R');
  if (!notes.length || notes.some(st => pit(st) + d < -24 || pit(st) + d > 35)) return;
  keepUndo();
  // the hidden tail (past the length) moves too, so lengthening afterwards stays in the new key
  for (const st of P.concat(tail)) setPitch(st, Math.max(-24, Math.min(35, pit(st) + d)));
  stepChanged();
}
// Shift a step: the first step goes to the end (k = -1), or the last comes to the front (k = 1)
function rotateSteps(k) {
  const P = state.steps, n = P.length; if (n < 2) return;
  keepUndo(); state.steps = P.map((_, i) => P[(i - k + n) % n]); stepChanged();
}
// the cross under the roll: up and down move every note a semitone (Shift-click for an octave), left and right shift a step
document.querySelector('.dpad').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.nudge) nudgeNotes(+b.dataset.nudge * (e.shiftKey ? 12 : 1));
  else if (b.dataset.rot) rotateSteps(+b.dataset.rot);
});
// Randomise accents, slides or octaves (the TB-303 app's randomise(), v164): the odds are Generate's. Accents lean on the
// beat; slides only where the next step plays, most across octave jumps; octaves pick one register for the riff, keep its
// most used key (the repeat note) there and jump the odd other note. Depth scales every chance (30% = the 303 app).
// Ties (Shyoy's own) are dealt again as wild as Depth.
const RND_OCT = [[-1, 3], [0, 5], [1, 2], [2, 0.4], [-2, 0.4]]; // octave, weight: mostly 0 and -1, some +1, a rare extreme
const rndOct = () => { let x = Math.random() * RND_OCT.reduce((a, [, w]) => a + w, 0); for (const [o, w] of RND_OCT) if ((x -= w) < 0) return o; return 0; };
// Ties take the pitch of the note before them, so repeated tie presses start again from the pattern before the first press.
const sqDepthEl = document.getElementById('sqRndDepth'), sqDepthOut = document.getElementById('o-sqRndDepth');
try { const d = localStorage.getItem('kestrel.sqRndDepth'); if (d != null) sqDepthEl.value = d; } catch (e) {}
const showSqDepth = () => { sqDepthOut.textContent = sqDepthEl.value + '%'; };
showSqDepth();
// Depth works on the pattern that is there too (v0.22.2, Johnny: "use weights"). Every step keeps a weight per lane
// (accents, slides, octave jumps): a roll from 0 to 1, and the lane is on where the roll is under the Randomise odds at
// the current Depth. Turning Depth up switches on the steps with the lowest rolls first, turning it down switches them
// off again in the reverse order, so a move there and back gives the same pattern. A roll that no longer fits the step
// (it was drawn, edited, generated or altered since) is drawn again inside the range that fits, so the pattern as it
// stands is always kept at the Depth it is at, and only what the move adds or takes away changes.
const rw = { a: [], s: [], o: [], p: [], pn: [], dir: [], base: null, jump: 0.25, sig: null };
let depthWas = +sqDepthEl.value, depthDrag = false;
function depthLive(from, to) {
  const P = state.steps, n = P.length, r = Math.random, pit = (st) => st.n + 12 * st.o;
  if (!P.some(st => st.m === 'N')) return false;
  const before = JSON.stringify(P), cap = (p, pct) => Math.min(0.95, p * pct / 30);
  // where a roll sits: under thr means on. A roll that disagrees with the step is drawn again on the right side of thr.
  const fit = (lane, i, on, thr) => { let u = rw[lane][i]; if (u == null || (u < thr) !== on) u = rw[lane][i] = on ? r() * thr : thr + r() * (1 - thr); return u; };
  // accents: struck notes, leaning on the beat
  const accP = (i) => i % 4 === 0 ? 0.42 : i % 2 ? 0.2 : 0.26;
  P.forEach((st, i) => { if (st.m !== 'N') return; st.a = fit('a', i, st.a, cap(accP(i), from)) < cap(accP(i), to); });
  const sldP = (i) => { const nx = P[(i + 1) % n]; if (nx.m === 'R') return 0; const d = Math.abs(pit(nx) - pit(P[i])); return d >= 12 ? 0.5 : d === 0 ? 0.12 : 0.22; };
  const sp0 = P.map((_, i) => sldP(i));
  // octave jumps: away from the riff's register, the repeat note a third as often
  const N = P.filter(st => st.m === 'N');
  // the register is kept while only Depth moves the pattern; anything else (an edit, a slot, Undo) works it out again
  if (rw.base == null || (rw.sig != null && rw.sig !== before)) {
    const oc = {}; for (const st of N) oc[st.o] = (oc[st.o] || 0) + 1;
    rw.base = +Object.keys(oc).sort((a, b) => oc[b] - oc[a])[0];
  }
  // a note the pitch lane has moved counts as the note it was, so the repeat note doesn't move with Depth
  if (rw.sig != null && rw.sig !== before) { rw.pn = []; rw.p = []; } // something else changed the notes: they are the base now
  const baseN = (st, i) => { const q = rw.pn[i]; return q && st.n === q.alt && q.alt !== q.base ? q.base : st.n; };
  const kc = {}; P.forEach((st, i) => { if (st.m === 'N') kc[baseN(st, i)] = (kc[baseN(st, i)] || 0) + 1; });
  const hold = +Object.keys(kc).sort((a, b) => kc[b] - kc[a])[0], base = rw.base;
  if (!rw.dir) rw.dir = [];
  P.forEach((st, i) => {
    if (st.m !== 'N') return;
    const j = rw.jump * (baseN(st, i) === hold ? 1 / 3 : 1), on = st.o !== base;
    if (on) rw.dir[i] = st.o - base; else if (!rw.dir[i]) rw.dir[i] = r() < 0.7 ? 1 : -1;
    if (Math.abs(base + rw.dir[i]) > 2) rw.dir[i] = -Math.sign(rw.dir[i]);
    st.o = Math.max(-2, Math.min(2, fit('o', i, on, cap(j, from)) < cap(j, to) ? base + rw.dir[i] : base));
  });
  // notes (v0.22.4): each note has a neighbour in the pattern's key, a scale step or two away inside its octave, or the
  // repeat note (as Alter whole pattern picks), and moves to it where its roll is under 15% of the odds x Depth / 30
  const pcs = Object.keys(kc).map(Number).map(k => (((k - hold) % 12) + 12) % 12);
  const scale = Object.values(GEN_SCALES).map(sc => [sc, pcs.filter(pc => sc.includes(pc)).length]).sort((a, b) => b[1] - a[1])[0][0];
  const keyN = scale.map(pc => (hold + pc) % 12).sort((a, b) => a - b);
  const nb = (k) => { let j = keyN.indexOf(k); if (j < 0) j = keyN.findIndex(x => x > k), j = j < 0 ? keyN.length - 1 : j;
    let t = j + (r() < 0.5 ? -1 : 1) * (r() < 0.7 ? 1 : 2); if (t < 0 || t >= keyN.length) t = j - (t - j);
    return keyN[Math.max(0, Math.min(keyN.length - 1, t))]; };
  P.forEach((st, i) => {
    if (st.m !== 'N') return;
    let q = rw.pn[i];
    if (!q || (st.n !== q.base && st.n !== q.alt)) { q = rw.pn[i] = { base: st.n, alt: null }; rw.p[i] = null; }
    if (q.alt == null || q.alt === q.base) { q.alt = st.n !== hold && r() < 0.35 ? hold : nb(st.n); if (q.alt === q.base) q.alt = nb(st.n); }
    if (q.alt === q.base) return;
    st.n = fit('p', i, st.n === q.alt, cap(0.15, from)) < cap(0.15, to) ? q.alt : q.base;
  });
  for (let i = 1; i < n; i++) if (P[i].m === 'T') { P[i].n = P[i - 1].n; P[i].o = P[i - 1].o; }
  // slides: only where the next step plays, most across an octave jump (one into a rest, which does nothing, is left be). The odds before the move are worked out on the
  // pitches as they were, the odds after on the pitches the octave move left, so a move there and back undoes itself.
  const sp = P.map((_, i) => sldP(i));
  P.forEach((st, i) => { if (st.m === 'R' || (!sp0[i] && !sp[i])) return; st.s = fit('s', i, st.s, cap(sp0[i], from)) < cap(sp[i], to); });
  rw.sig = JSON.stringify(P);
  return rw.sig !== before;
}
sqDepthEl.addEventListener('pointerdown', () => { depthDrag = false; });
sqDepthEl.addEventListener('input', e => {
  e.stopPropagation(); showSqDepth(); try { localStorage.setItem('kestrel.sqRndDepth', sqDepthEl.value); } catch (er) {}
  const to = +sqDepthEl.value, snap = JSON.stringify({ steps: state.steps, tail });
  if (depthLive(depthWas, to)) {
    // one Undo per drag: the pattern from before the drag started
    if (!depthDrag) { undoStack.push(snap); if (undoStack.length > 30) undoStack.shift(); depthDrag = true; }
    tail = []; stepChanged();
  }
  depthWas = to;
});
sqDepthEl.addEventListener('change', () => { depthDrag = false; });
let tieBase = null, tieOut = null;
function rndRow(kind) {
  const d = sqDepthEl.value / 100, P = state.steps, n = P.length, hit = (p) => Math.random() < p;
  if (P.every(st => st.m === 'R')) return;
  keepUndo();
  const f = sqDepthEl.value / 30, odds = (p) => Math.min(0.95, p * f), r = Math.random, pit = (st) => st.n + 12 * st.o;
  if (kind === 'a' || kind === 's' || kind === 'o') {
    const count = {}; for (const st of P) if (st.m === 'N') count[st.n] = (count[st.n] || 0) + 1;
    const hold = +Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    const base = Math.max(-1, Math.min(1, rndOct())), jump = (0.15 + r() * 0.2) * f;
    if (kind === 'o') { rw.base = base; rw.jump = jump / Math.max(f, 1e-6) || 0.25; rw.o = []; rw.dir = []; rw.sig = null; }
    P.forEach((st, i) => {
      if (st.m === 'R') return;
      if (kind === 'a') st.a = st.m === 'N' && r() < odds(i % 4 === 0 ? 0.42 : i % 2 ? 0.2 : 0.26);
      else if (kind === 's') {
        const nx = P[(i + 1) % n], d = Math.abs(pit(nx) - pit(st));
        st.s = nx.m !== 'R' && r() < odds(d >= 12 ? 0.5 : d === 0 ? 0.12 : 0.22);
      }
      else if (st.m === 'N') {
        let o = base; if (r() < (st.n === hold ? jump / 3 : jump)) o += r() < 0.7 ? 1 : -1;
        st.o = Math.max(-2, Math.min(2, o));
      }
    });
    // ties hold the note before them, so they follow its octave
    for (let i = 1; i < n; i++) if (P[i].m === 'T') P[i].o = P[i - 1].o;
  } else {
    const src = tieOut && tieBase && tieBase.length === n && JSON.stringify(P) === tieOut ? tieBase : clone(P);
    tieBase = src;
    const Q = src.map(st => ({ ...st }));
    for (let i = 0; i < n; i++) {
      const st = Q[i]; if (st.m === 'R') continue;
      if (st.m === 'T') st.m = 'N';
      if (i > 0 && Q[i - 1].m !== 'R' && hit(d)) { st.n = Q[i - 1].n; st.o = Q[i - 1].o; st.m = 'T'; }
    }
    state.steps = Q; tieOut = JSON.stringify(Q);
  }
  tail = []; stepChanged(); if (kind === 't') tieOut = JSON.stringify(state.steps);
}
// Alter accents, slides or octaves (the TB-303 app's alterLane(), v163): a variation, not a new roll. About a quarter of
// the notes at Depth 30% (at least one) get the change, picked by weight the way Generate places things.
function altLane(kind) { // kind 'a' | 's' | 'o'
  const d = sqDepthEl.value / 100, P = state.steps, n = P.length, r = Math.random, pit = (st) => st.n + 12 * st.o;
  const on = [...P.keys()].filter(i => kind === 's' ? P[i].m !== 'R' : P[i].m === 'N');
  if (!on.length) return;
  keepUndo();
  const tied = (i) => P[(i + 1) % n].m !== 'R'; // a slide only does something when the very next step plays
  const count = {}; for (const i of on) count[pit(P[i])] = (count[pit(P[i])] || 0) + 1;
  const hold = +Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  const weight = (i) => {
    const st = P[i], beat = i % 4 === 0;
    if (kind === 'a') return st.a ? (beat ? 0.4 : 1.6) : (beat ? 1.8 : i % 2 ? 0.8 : 1);
    if (kind === 's') {
      if (st.s) return tied(i) ? 0.6 : 3;
      if (!tied(i)) return 0.05;
      const jump = Math.abs(pit(P[(i + 1) % n]) - pit(st));
      return jump >= 12 ? 2.5 : jump === 0 ? 0.6 : 1;
    }
    return pit(st) === hold && Object.keys(count).length > 1 ? 0.25 : 1; // octave
  };
  const pool = on.map(i => ({ i, w: weight(i) })), pick = [];
  for (let k = Math.max(1, Math.round(on.length * d * 5 / 6)); k > 0 && pool.length; k--) {
    let x = r() * pool.reduce((s, p) => s + p.w, 0), j = 0;
    while (j < pool.length - 1 && (x -= pool[j].w) > 0) j++;
    pick.push(pool.splice(j, 1)[0].i);
  }
  for (const i of pick) {
    const st = P[i];
    if (kind === 'o') {
      const up = st.o < 2 && (st.o <= -2 || r() < 0.5); st.o += up ? 1 : -1;
      // Generate slides across most octave jumps: tie the note before into this one now and then
      if (i > 0 && P[i - 1].m !== 'R' && r() < 0.35) P[i - 1].s = true;
    }
    else if (kind === 'a') st.a = !st.a;
    else st.s = !st.s;
  }
  // ties hold the note before them, so they follow its octave
  for (let i = 1; i < n; i++) if (P[i].m === 'T') { P[i].n = P[i - 1].n; P[i].o = P[i - 1].o; }
  tail = []; stepChanged();
}
// Alter ties (Shyoy's own): Depth sets how many steps flip (about half the Randomise share, at least one).
// A new tie takes the pitch of the note before it, as in the roll.
function altRow(kind) {
  if (kind !== 't') return altLane(kind);
  const d = sqDepthEl.value / 100, P = state.steps, n = P.length;
  const ok = i => i > 0 && P[i].m !== 'R' && P[i - 1].m !== 'R';
  const idx = []; for (let i = 0; i < n; i++) if (ok(i)) idx.push(i);
  if (!idx.length) return;
  keepUndo();
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const k = Math.max(1, Math.round(idx.length * d * 0.5)), pick = idx.slice(0, k);
  for (const i of pick) {
    const st = P[i];
    if (st.m === 'T') st.m = 'N'; else { st.n = P[i - 1].n; st.o = P[i - 1].o; st.m = 'T'; }
  }
  // ties hold the note before them
  for (let i = 1; i < n; i++) if (P[i].m === 'T') { P[i].n = P[i - 1].n; P[i].o = P[i - 1].o; }
  tail = []; stepChanged();
}
// Alter whole pattern (the TB-303 app's FUNCTIONS.alter, v161): about a quarter of the steps change. New notes walk a
// scale step or two in the pattern's own key or snap back to its most used pitch (the repeat note), filled rests take the
// repeat note, rests land on off-beats and fills on the beat, and now and then every beat is made to play.
function alterAll() {
  const d = sqDepthEl.value / 100, P = state.steps, n = P.length, r = Math.random, pit = (st) => st.n + 12 * st.o;
  keepUndo();
  const used = P.filter(st => st.m === 'N').map(pit), pitches = [...new Set(used)].sort((a, b) => a - b);
  if (!pitches.length) pitches.push(0);
  const count = {}; for (const c of used) count[c] = (count[c] || 0) + 1;
  const hold = used.length ? +Object.keys(count).sort((a, b) => count[b] - count[a])[0] : pitches[0];
  // the key: the repeat note as root, with whichever of Generate's scales holds most of the notes the pattern uses
  const pcs = used.map(c => (((c - hold) % 12) + 12) % 12);
  const scale = Object.values(GEN_SCALES).map(sc => [sc, pcs.filter(pc => sc.includes(pc)).length]).sort((a, b) => b[1] - a[1])[0][0];
  const inKey = []; for (let k = -24; k <= 35; k++) if (scale.includes((((k - hold) % 12) + 12) % 12)) inKey.push(k);
  // a neighbouring note one or two scale steps up or down, so the line walks but stays in its key
  const walk = (c) => { let i = inKey.findIndex(k => k >= c); if (i < 0) i = inKey.length - 1;
    return inKey[Math.max(0, Math.min(inKey.length - 1, i + (r() < 0.5 ? -1 : 1) * (r() < 0.7 ? 1 : 2)))]; };
  const idx = [...Array(n).keys()].sort(() => r() - 0.5).slice(0, Math.max(1, Math.round(n * d * 5 / 6)));
  for (const i of idx) {
    const st = P[i], x = r(), beat = i % 4 === 0, off = i % 2 === 1, plays = st.m !== 'R';
    if (x < 0.4) {
      const was = pit(st); let to = was !== hold && r() < 0.35 ? hold : walk(was);
      if (to === was) to = walk(was);
      setPitch(st, to); st.m = 'N';
    }
    else if (x < 0.52) { const up = st.o < 2 && (st.o <= -2 || r() < 0.5); st.o += up ? 1 : -1; }
    else if (x < 0.66) st.a = !st.a;
    else if (x < 0.8) st.s = !st.s;
    // rests and fills lean towards the density dial: over it, notes become rests; under it, rests get filled
    else if (i > 0 && (() => { const now = P.filter(s => s.m !== 'R').length / n;
        return now > genDens + 0.05 ? plays && !beat : now < genDens - 0.05 ? !plays : (plays ? !beat && (off || r() < 0.4) : !off || r() < 0.5); })()) {
      if (plays) st.m = 'R'; else { setPitch(st, hold); st.m = 'N'; }
    }
    else st.a = !st.a;
  }
  // AcidLab's Mutate sometimes puts a note on every beat: here one press in eight, with the repeat note
  if (n >= 8 && r() < 0.125) for (let i = 0; i < n; i += 4) if (P[i].m === 'R') { setPitch(P[i], hold); P[i].m = 'N'; }
  // tidy up: accents only on struck notes, no slides on rests, ties hold the pitch of the note before them
  P.forEach((st, i) => {
    if (st.m !== 'N') st.a = false;
    if (st.m === 'R') st.s = false;
    if (st.m === 'T') { if (i === 0 || P[i - 1].m === 'R') st.m = 'N'; else { st.n = P[i - 1].n; st.o = P[i - 1].o; } }
  });
  tail = []; stepChanged();
}
document.getElementById('a-all').onclick = alterAll;
[['a-oct', 'o'], ['a-slide', 's'], ['a-acc', 'a'], ['a-tie', 't']].forEach(([id, k]) => { document.getElementById(id).onclick = () => altRow(k); });
[['r-oct', 'o'], ['r-slide', 's'], ['r-acc', 'a'], ['r-tie', 't']].forEach(([id, k]) => { document.getElementById(id).onclick = () => rndRow(k); });
document.getElementById('p-clr').onclick = () => { keepUndo(); state.steps = state.steps.map(() => restStep()); tail = []; stepChanged(); };
document.getElementById('p-undo').onclick = () => {
  if (!undoStack.length) return; const u = JSON.parse(undoStack.pop()); state.steps = u.steps; tail = u.tail; stepChanged();
};
renderSeq();
// Density works on the pattern that is there too (v0.22.4): turning it adds notes to rests or turns notes into rests until
// that share of the steps plays. Every step has a weight; the lowest weights play. Rests on the beat are filled first and
// notes off the beat go first, step 1 and a note that a tie holds stay longest, and a tie goes before the note it holds.
// A note that goes keeps its accent and slide for when it comes back, and a new note takes a pitch the pattern already
// uses. Weights that no longer fit the pattern (it was changed some other way) are drawn again, so turning the dial there
// and back gives the same pattern.
const dw = { k: [], note: [], rest: [], sig: null };
function densLive() {
  const P = state.steps, n = P.length, r = Math.random, plays = (st) => st.m !== 'R';
  const want = Math.max(1, Math.round(genDens * n)), on = P.filter(plays).length, before = JSON.stringify(P);
  if (want === on) return false;
  const order = () => [...P.keys()].sort((a, b) => dw.k[a] - dw.k[b]);
  const fits = dw.sig === before && dw.k.length === n && order().slice(0, on).every(i => plays(P[i]));
  if (!fits) {
    dw.note = []; dw.rest = [];
    const beat = (i) => (i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : 2);
    dw.k = P.map((st, i) => plays(st) ? (i === 0 ? -1 : P[(i + 1) % n].m === 'T' && i + 1 < n ? -0.5 : (beat(i) + r()) / 6)
                                      : 0.5 + (beat(i) + r()) / 6);
    for (let i = 1; i < n; i++) if (P[i].m === 'T') dw.k[i] = Math.max(dw.k[i], dw.k[i - 1] + 1e-3); // a tie after its note
  }
  const pitches = P.filter(st => st.m === 'N');
  const idx = order();
  idx.forEach((i, rank) => {
    const st = P[i], should = rank < want;
    if (should === plays(st)) return;
    if (should) { dw.rest[i] = { ...st }; const pk = pitches.length ? pitches[Math.floor(r() * pitches.length)] : st;
      P[i] = dw.note[i] ? { ...dw.note[i] } : { n: pk.n, o: pk.o, m: 'N', a: false, s: false }; }
    else { dw.note[i] = { ...st }; P[i] = dw.rest[i] ? { ...dw.rest[i] } : { ...st, m: 'R', a: false, s: false }; }
  });
  dw.sig = JSON.stringify(P);
  return dw.sig !== before;
}
// Density (TB-303 app v165), a slider beside Complexity since v0.22.9: 10-100% of the steps play when Generate or Refill
// writes a pattern, and moving it adds or removes notes in the current one (densLive), one Undo per drag
{
  const el = document.getElementById('sqDens'), out = document.getElementById('o-dens');
  const draw = () => { out.textContent = Math.round(genDens * 100) + '%'; };
  el.value = Math.round(genDens * 100); draw();
  let held = false;
  el.addEventListener('pointerdown', () => { held = false; });
  el.addEventListener('input', e => {
    e.stopPropagation(); const was = genDens; genDens = (+el.value) / 100;
    try { localStorage.setItem('kestrel.genDens', genDens); } catch (er) {} draw();
    if (genDens === was) return;
    const snap = JSON.stringify({ steps: state.steps, tail });
    if (densLive()) { if (!held) { undoStack.push(snap); if (undoStack.length > 30) undoStack.shift(); held = true; } tail = []; stepChanged(); }
  });
  el.addEventListener('change', () => { held = false; });
  el.addEventListener('dblclick', () => { el.value = 60; el.dispatchEvent(new Event('input')); held = false; });
}
// v0.22.8: RND beside Density and Complexity runs Generate with both (Johnny)
document.getElementById('sq-rnd').onclick = () => document.getElementById('p-rnd').click();
