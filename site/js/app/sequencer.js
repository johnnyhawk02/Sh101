// Shyoy: Sequencer piano roll, its side sliders, Randomise and Alter.
// ---------- UI: sequencer (piano roll) ----------
// A step is { n: key 0-11, o: octave -2..2, m: 'N' note | 'T' tie | 'R' rest, a: accent, s: slide }.
// Rows: step numbers, octave lanes, keys B..C, then tie, slide and accent. At least 32 columns show;
// columns past the pattern's end are dim, and pressing one grows the pattern to it (up to 64).
const roll = document.getElementById('roll'), sqMsg = document.getElementById('sq-msg');
const KEY_ROWS = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], OCT_ROWS = [2, 1, -1, -2], BLACK = new Set([1, 3, 6, 8, 10]);
const FLAG_ROWS = [['t', 'tie'], ['s', 'slide'], ['a', 'acc']];
const SEQ_SHOW = 32, SEQ_MAX = 64;
let selStep = -1, playStep = -1, seqCols = [], tail = [], undoBuf = null, playingSlot = -1, chainOffs = [];
const restStep = (st) => ({ n: st ? st.n : 0, o: st ? st.o : 0, m: 'R', a: false, s: false });
const say = t => { sqMsg.textContent = t; };
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
  if (h) { const i = +h.dataset.h; selStep = selStep === i ? -1 : i; renderSeq(); if (selStep >= 0) say(`Writing from step ${i + 1}: play keys to fill steps in turn. Tap the number again to stop.`); return; }
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
// length, gate and swing are plain sliders; shift and transpose are spring-loaded:
// they act relative to the pattern as it was when the drag began, then snap back to 0
const sideIn = {}; for (const el of document.querySelectorAll('.sld input')) sideIn[el.dataset.a] = el;
let sprBase = null;
const sprReset = () => { sprBase = null; for (const a of ['shift', 'tr']) { sideIn[a].value = 0; document.getElementById('o-' + a).textContent = '0'; } };
for (const a of ['shift', 'tr']) {
  const el = sideIn[a];
  el.addEventListener('pointerdown', () => { sprBase = state.steps.map(st => ({ ...st })); });
  el.addEventListener('focus', () => { if (!sprBase) sprBase = state.steps.map(st => ({ ...st })); });
  el.addEventListener('change', () => { if (el.matches(':focus-visible')) return; sprReset(); });
  el.addEventListener('pointerup', sprReset); el.addEventListener('pointercancel', sprReset); el.addEventListener('blur', sprReset);
}
document.querySelector('.sq-side').addEventListener('input', e => {
  const el = e.target.closest('input[data-a]'); if (!el) return;
  const v = +el.value, P = state.steps, p = state.params;
  switch (el.dataset.a) {
    case 'len': while (P.length > v && P.length > 1) tail.unshift(P.pop()); extendTo(v); break;
    case 'gate': p.gateLen = (v / 100 - 0.1) / 0.85; break;
    case 'swing': p.swing = v / 100; break;
    case 'shift': {
      if (!sprBase || sprBase.length !== P.length) sprBase = P.map(st => ({ ...st }));
      const n = sprBase.length, k = ((v % n) + n) % n;
      state.steps = sprBase.map((_, i) => ({ ...sprBase[(i - k + n) % n] }));
      document.getElementById('o-shift').textContent = (v > 0 ? '+' : '') + v; break;
    }
    case 'tr': {
      if (!sprBase || sprBase.length !== P.length) sprBase = P.map(st => ({ ...st }));
      const pit = sprBase.map(st => st.n + 12 * st.o), lo = Math.min(...pit), hi = Math.max(...pit);
      const d = Math.max(-24 - lo, Math.min(35 - hi, v));
      state.steps = sprBase.map(st => { const c = { ...st }; setPitch(c, st.n + 12 * st.o + d); return c; });
      document.getElementById('o-tr').textContent = (d > 0 ? '+' : '') + d; break;
    }
  }
  stepChanged();
});
document.getElementById('p-dup').onclick = () => {
  const P = state.steps, n = P.length, to = [16, 32, 64].find(x => x > n);
  if (!to) { say('Already at the 64-step maximum.'); return; }
  keepUndo(); state.steps = Array.from({ length: to }, (_, i) => ({ ...P[i % n] })); tail = [];
  stepChanged(); say(`Repeated ${n} step${n === 1 ? '' : 's'} out to ${to}.`);
};
document.getElementById('p-shuf').onclick = () => {
  const P = state.steps; if (P.length < 2) return; keepUndo();
  for (let i = P.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < P.length; i++) if (P[i].m === 'T' && i === 0) P[i].m = 'N';
  tail = []; stepChanged(); say('Shuffled. Tap again for another order.');
};
// Random: a minor-pentatonic line around the root, mostly notes, some rests and ties, accents on strong beats
document.getElementById('p-rnd').onclick = () => {
  keepUndo(); const len = Math.max(16, Math.ceil(state.steps.length / 16) * 16), scale = [0, 3, 5, 7, 10];
  const P = []; let prev = null;
  for (let i = 0; i < len; i++) {
    const r = Math.random(), m = i > 0 && r < 0.12 ? 'T' : r < 0.25 ? 'R' : 'N';
    let v = scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.2 ? 12 : Math.random() < 0.12 ? -12 : 0);
    if (i % 4 === 0 && Math.random() < 0.5) v = 0;
    const st = { n: 0, o: 0, m, a: (i % 4 === 0 ? 0.45 : 0.18) > Math.random(), s: Math.random() < 0.15 };
    if (m === 'T' && prev) { st.n = prev.n; st.o = prev.o; } else setPitch(st, v);
    P.push(st); if (m !== 'R') prev = st;
  }
  state.steps = P; tail = []; stepChanged(); say(`New ${len}-step line. Undo brings the last one back.`);
};
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
  if (P.every(st => st.m === 'R')) { say('No notes to randomise yet.'); return; }
  keepUndo(); let c = 0;
  if (kind === 'o') {
    // octave jumps on played notes; ties follow the note they hold
    for (let i = 0; i < n; i++) {
      const st = P[i];
      if (st.m === 'T') { const pv = P[(i - 1 + n) % n]; st.o = pv.o; continue; }
      if (st.m === 'R') continue;
      st.o = !hit(d) ? 0 : hit(0.15 + 0.35 * d) ? (hit(0.5) ? 2 : -2) : (hit(0.6) ? 1 : -1);
      if (st.o) c++;
    }
    say(`${c} note${c === 1 ? '' : 's'} moved up or down an octave.`);
  } else if (kind === 's' || kind === 'a') {
    for (let i = 0; i < n; i++) {
      const st = P[i];
      // accents only sound on struck notes, and lean to the downbeats like the Random pattern
      const ok = kind === 'a' ? st.m === 'N' : st.m !== 'R';
      st[kind] = ok && hit(kind === 'a' ? Math.min(1, d * (i % 4 === 0 ? 1.6 : 0.8)) : d);
      if (st[kind]) c++;
    }
    say(`${c} ${kind === 'a' ? 'accent' : 'slide'}${c === 1 ? '' : 's'}.`);
  } else {
    const src = tieOut && tieBase && tieBase.length === n && JSON.stringify(P) === tieOut ? tieBase : clone(P);
    tieBase = src;
    const Q = src.map(st => ({ ...st }));
    for (let i = 0; i < n; i++) {
      const st = Q[i]; if (st.m === 'R') continue;
      if (st.m === 'T') st.m = 'N';
      if (i > 0 && Q[i - 1].m !== 'R' && hit(d)) { st.n = Q[i - 1].n; st.o = Q[i - 1].o; st.m = 'T'; c++; }
    }
    state.steps = Q; tieOut = JSON.stringify(Q);
    say(`${c} tie${c === 1 ? '' : 's'}. Press again for another set; Undo brings back the last one.`);
  }
  tail = []; stepChanged(); if (kind === 't') tieOut = JSON.stringify(state.steps);
}
// Alter one row: nudge the pattern instead of re-dealing it. Depth sets how many steps flip (about half the
// Randomise share, at least one). Notes stay; a new tie takes the pitch of the note before it, as in the roll.
function altRow(kind) {
  const d = sqDepthEl.value / 100, P = state.steps, n = P.length;
  const ok = i => kind === 'a' ? P[i].m === 'N' : kind === 't' ? i > 0 && P[i].m !== 'R' && P[i - 1].m !== 'R' : P[i].m !== 'R' && !(kind === 'o' && P[i].m === 'T');
  const idx = []; for (let i = 0; i < n; i++) if (ok(i)) idx.push(i);
  if (!idx.length) { say('Nothing in that row to alter yet.'); return; }
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
  const name = { o: 'octave', s: 'slide', a: 'accent', t: 'tie' }[kind];
  tail = []; stepChanged(); say(`Altered ${k} ${name}${k === 1 ? '' : 's'}. Tap again to keep nudging; Undo steps back.`);
}
[['a-oct', 'o'], ['a-slide', 's'], ['a-acc', 'a'], ['a-tie', 't']].forEach(([id, k]) => { document.getElementById(id).onclick = () => altRow(k); });
[['r-oct', 'o'], ['r-slide', 's'], ['r-acc', 'a'], ['r-tie', 't']].forEach(([id, k]) => { document.getElementById(id).onclick = () => rndRow(k); });
document.getElementById('p-clr').onclick = () => { keepUndo(); state.steps = state.steps.map(() => restStep()); tail = []; stepChanged(); say('Cleared. Undo brings it back.'); };
document.getElementById('p-undo').onclick = () => {
  if (!undoBuf) return; const u = JSON.parse(undoBuf); undoBuf = null; state.steps = u.steps; tail = u.tail; stepChanged(); say('Undone.');
};
renderSeq();
