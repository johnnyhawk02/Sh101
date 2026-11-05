// Shyoy: Sequencer piano roll, its side sliders, Randomise and Alter.
// ---------- UI: sequencer (piano roll) ----------
// A step is { n: key 0-11, o: octave -2..2, m: 'N' note | 'T' tie | 'R' rest, a: accent, s: slide }.
// Rows: step numbers, octave lanes, keys B..C, then tie, slide and accent. At least 32 columns show;
// columns past the pattern's end are dim, and pressing one grows the pattern to it (up to 64).
const roll = document.getElementById('roll');
const KEY_ROWS = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], OCT_ROWS = [2, 1, -1, -2], BLACK = new Set([1, 3, 6, 8, 10]);
const FLAG_ROWS = [['t', 'tie'], ['s', 'slide'], ['a', 'acc']];
const SEQ_SHOW = 32, SEQ_MAX = 64;
let selStep = -1, playStep = -1, seqCols = [], tail = [], undoBuf = null, playingSlot = -1, chainOffs = [];
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
  document.getElementById('p-undo').disabled = !undoBuf;
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
  e.preventDefault(); applyCell(b); paintedClick = true;
  const st = state.steps[+b.dataset.col], t = b.dataset.t;
  paint = { t, id: e.pointerId, on: t === 'k' ? st.m !== 'R' : t === 'o' ? true : t === 't' ? st.m === 'T' : st[t], oct: st.o };
  stepChanged();
});
addEventListener('pointermove', e => {
  if (!paint || e.pointerId !== paint.id) return;
  const t = document.elementFromPoint(e.clientX, e.clientY), b = t && t.closest && t.closest('#roll button[data-t]'); if (!b) return;
  if (paintCell(b)) stepChanged();
});
const endPaint = e => { if (paint && e.pointerId === paint.id) paint = null; };
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
const keepUndo = () => { undoBuf = JSON.stringify({ steps: state.steps, tail }); };
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
document.getElementById('p-shuf').onclick = () => {
  const P = state.steps; if (P.length < 2) return; keepUndo();
  for (let i = P.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < P.length; i++) if (P[i].m === 'T' && i === 0) P[i].m = 'N';
  tail = []; stepChanged();
};
// Generate (from the TB-303 app): a new riff from the real acid basslines in patterns.js. It keeps the pattern's length but
// writes all 64 steps; the steps past the length go into tail, so lengthening the pattern brings in more of the riff.
document.getElementById('p-rnd').onclick = () => {
  keepUndo(); const g = generatePattern(SEQ_MAX), n = state.steps.length;
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
// Randomise one row (oct / slide / acc / tie): the notes stay, only that row is dealt again, as wild as Rnd depth.
// Ties take the pitch of the note before them, so repeated tie presses start again from the pattern before the first press.
const sqDepthEl = document.getElementById('sqRndDepth'), sqDepthOut = document.getElementById('o-sqRndDepth');
try { const d = localStorage.getItem('kestrel.sqRndDepth'); if (d != null) sqDepthEl.value = d; } catch (e) {}
const showSqDepth = () => { sqDepthOut.textContent = sqDepthEl.value + '%'; };
showSqDepth();
sqDepthEl.addEventListener('input', e => { e.stopPropagation(); showSqDepth(); try { localStorage.setItem('kestrel.sqRndDepth', sqDepthEl.value); } catch (er) {} });
let tieBase = null, tieOut = null;
function rndRow(kind) {
  const d = sqDepthEl.value / 100, P = state.steps, n = P.length, hit = (p) => Math.random() < p;
  if (P.every(st => st.m === 'R')) return;
  keepUndo();
  if (kind === 'o') {
    // octave jumps on played notes; ties follow the note they hold
    for (let i = 0; i < n; i++) {
      const st = P[i];
      if (st.m === 'T') { const pv = P[(i - 1 + n) % n]; st.o = pv.o; continue; }
      if (st.m === 'R') continue;
      st.o = !hit(d) ? 0 : hit(0.15 + 0.35 * d) ? (hit(0.5) ? 2 : -2) : (hit(0.6) ? 1 : -1);
    }
  } else if (kind === 's' || kind === 'a') {
    for (let i = 0; i < n; i++) {
      const st = P[i];
      // accents only sound on struck notes, and lean to the downbeats like the Random pattern
      const ok = kind === 'a' ? st.m === 'N' : st.m !== 'R';
      st[kind] = ok && hit(kind === 'a' ? Math.min(1, d * (i % 4 === 0 ? 1.6 : 0.8)) : d);
    }
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
// Alter one row: nudge the pattern instead of re-dealing it. Depth sets how many steps flip (about half the
// Randomise share, at least one). Notes stay; a new tie takes the pitch of the note before it, as in the roll.
function altRow(kind) {
  const d = sqDepthEl.value / 100, P = state.steps, n = P.length;
  const ok = i => kind === 'a' ? P[i].m === 'N' : kind === 't' ? i > 0 && P[i].m !== 'R' && P[i - 1].m !== 'R' : P[i].m !== 'R' && !(kind === 'o' && P[i].m === 'T');
  const idx = []; for (let i = 0; i < n; i++) if (ok(i)) idx.push(i);
  if (!idx.length) return;
  keepUndo();
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const k = Math.max(1, Math.round(idx.length * d * 0.5)), pick = idx.slice(0, k);
  for (const i of pick) {
    const st = P[i];
    if (kind === 'o') st.o = st.o === 0 ? (Math.random() < 0.5 ? 1 : -1) : Math.random() < 0.6 ? 0 : Math.max(-2, Math.min(2, st.o + Math.sign(st.o)));
    else if (kind === 't') { if (st.m === 'T') st.m = 'N'; else { st.n = P[i - 1].n; st.o = P[i - 1].o; st.m = 'T'; } }
    else st[kind] = !st[kind];
  }
  // ties hold the note before them, so they follow its octave
  if (kind === 'o' || kind === 't') for (let i = 1; i < n; i++) if (P[i].m === 'T') { P[i].n = P[i - 1].n; P[i].o = P[i - 1].o; }
  tail = []; stepChanged();
}
[['a-oct', 'o'], ['a-slide', 's'], ['a-acc', 'a'], ['a-tie', 't']].forEach(([id, k]) => { document.getElementById(id).onclick = () => altRow(k); });
[['r-oct', 'o'], ['r-slide', 's'], ['r-acc', 'a'], ['r-tie', 't']].forEach(([id, k]) => { document.getElementById(id).onclick = () => rndRow(k); });
document.getElementById('p-clr').onclick = () => { keepUndo(); state.steps = state.steps.map(() => restStep()); tail = []; stepChanged(); };
document.getElementById('p-undo').onclick = () => {
  if (!undoBuf) return; const u = JSON.parse(undoBuf); undoBuf = null; state.steps = u.steps; tail = u.tail; stepChanged();
};
renderSeq();
