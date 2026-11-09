// Shyoy: per-control step sequencers (v0.21.0), from Elixir Mobile's fader sequencers (app/mobile-seq.js), as a pop-up.
// Holding any fader or dial for half a second, or right-clicking it, opens its own sequencer: 2 to 64 steps (edited a
// page of 16 at a time), each an OFFSET from the control's setting, up or down by up to `depth` of its range. While the
// pattern runs the control takes setting + offset; moving the control (by hand or MIDI CC) moves its setting, the base
// the steps play around. Stopping, or switching the sequencer off, puts the control back to its setting.
// A step is the bar's 16th counted from the start, divided by the speed (a 16th up to 8 bars) and wrapped at the length,
// so short ones run against the bar. Slew glides to the next offset over that share of a step. With swing, a step lands
// on its swung 16th unless Options › Sequencer says otherwise. A control with one switched on is marked; the sequencers
// belong to the sound and save with every preset (state.cseq, soundSnap).
const CSEQ_MAX = 64;
const CSEQ_STEPS = [1, 2, 4, 8, 16, 32, 64, 128];   // speed: how long each step lasts, in 16ths
const cseqStepName = (v) => (v < 16 ? `1/${16 / v}` : v === 16 ? '1 bar' : `${v / 16} bars`);
const cseqOff = (x) => Math.round(Math.max(-1, Math.min(1, x)) * 20) / 20;   // an offset, -1..1 of depth, in twentieths
const cseqNew = () => ({ on: true, len: 16, slew: 0, step: 1, depth: 50, vals: new Array(CSEQ_MAX).fill(0) });
// a saved one, checked (a preset from elsewhere may hold anything)
const cseqClean = (q) => ({ on: !!q.on, len: Math.max(2, Math.min(CSEQ_MAX, q.len | 0)), slew: Math.max(0, Math.min(100, Math.round((+q.slew || 0) / 5) * 5)),
  step: CSEQ_STEPS.includes(q.step) ? q.step : 1, depth: typeof q.depth === 'number' ? Math.max(0, Math.min(100, Math.round(q.depth / 5) * 5)) : 50,
  vals: Array.from({ length: CSEQ_MAX }, (_, i) => (Array.isArray(q.vals) && Number.isFinite(q.vals[i]) ? cseqOff(q.vals[i]) : 0)) });
const cseqLoad = (x) => { const out = {}; if (x && typeof x === 'object') for (const k in x) if (ctlRegs[k] && x[k] && typeof x[k] === 'object') out[k] = cseqClean(x[k]); return out; };
state.cseq = cseqLoad(state.cseq);

// what a control is called in the pop-up's title
const CSEQ_NAME = (() => {
  const n = {};
  for (const m of RACK) for (const it of m.items) if (it.f) n[it.f] = STRIP_NAME[it.f] || it.label;
  for (const b of BENDER) n[b.f] = 'bender ' + b.label;
  for (const u of FX) for (const it of u.items) if (it.f) n[it.f] = u.name + ' ' + it.label;
  for (const b of BEND_ITEMS) if (b.id) n['b:' + b.id] = b.label;
  return n;
})();

// ---------- running: live[key] = { off, glide } while a sequencer is moving its control ----------
const cseqLive = {};
const cseqIsBend = (key) => key.startsWith('b:');
const cseqBase = (key) => (cseqIsBend(key) ? state.bend[key.slice(2)] : state.params[key]);
const cseqHeard = (key) => { const L = cseqLive[key], q = state.cseq[key], b = cseqBase(key);
  return L && q ? Math.max(0, Math.min(1, b + L.off * q.depth / 100)) : b; };
// a control shows its setting (fill, ring, readout) and, while its sequencer runs, the value heard as a marker
const cseqPaint = (key) => { const b = cseqBase(key), h = cseqLive[key] ? cseqHeard(key) : null;
  for (const r of ctlRegs[key] || []) if (r.el.isConnected) { r.paint(b); r.mod(h); } };
function cseqSend(key) {
  if (!cseqIsBend(key)) { post({ type: 'param', id: key, v: cseqHeard(key) }); return; }
  const b = { ...state.bend }; for (const k in cseqLive) if (cseqIsBend(k)) b[k.slice(2)] = cseqHeard(k);
  post({ type: 'bend', b: bendPhysical(b) });
}
// the value heard: the setting moved by the current offset
function cseqApply(key) { cseqPaint(key); cseqSend(key); }
// back to the setting, the sequencer let go
function cseqRelease(key) {
  if (!cseqLive[key]) return;
  delete cseqLive[key]; cseqPaint(key); cseqSend(key);
}
const cseqReleaseAll = () => { for (const k of Object.keys(cseqLive)) cseqRelease(k); };
// a hand (or MIDI) move of a control whose sequencer is running: it moves the setting, and the steps play round it
cseqHand = (key, v) => {
  if (!cseqLive[key]) return false;
  if (cseqIsBend(key)) state.bend[key.slice(2)] = v; else state.params[key] = v;
  save(); cseqApply(key); return true;
};
const cseqMarks = () => { for (const k in ctlRegs) for (const r of ctlRegs[k]) r.el.classList.toggle('cseq', !!(state.cseq[k] && state.cseq[k].on)); };

// the glides, a frame at a time while any is moving
let cseqGliding = false;
function cseqGlideRun() {
  if (cseqGliding) return;
  cseqGliding = true;
  const tick = () => {
    const now = performance.now(); let any = false;
    for (const k in cseqLive) {
      const L = cseqLive[k], g = L.glide; if (!g) continue;
      const f = Math.min(1, (now - g.t0) / g.ms);
      L.off = g.from + (g.to - g.from) * f; cseqApply(k);
      if (f < 1) any = true; else L.glide = null;
    }
    if (any) requestAnimationFrame(tick); else cseqGliding = false;
  };
  requestAnimationFrame(tick);
}
// one step of a control's sequencer (i: steps counted from the start): its offset, jumped to or, with slew, glided to
// over that share of the step (ms)
function cseqStep(key, i, ms) {
  const q = state.cseq[key], k = Math.floor(i) % q.len, to = q.vals[k] || 0;
  const L = cseqLive[key] || (cseqLive[key] = { off: 0, glide: null });
  if (q.slew) { L.glide = { from: L.off, to, t0: performance.now(), ms: Math.max(1, q.slew / 100 * ms) }; cseqGlideRun(); }
  else { L.glide = null; L.off = to; cseqApply(key); }
  if (key === csKey) { csNow = k; csDrawNow(); }
}
function cseqStepAll(n, ms16) {
  for (const k in state.cseq) { const q = state.cseq[k]; if (q.on && n % q.step === 0) cseqStep(k, n / q.step, ms16 * q.step); }
}
// Options › Sequencer: steps land on the swung 16ths (on) or on the grid (off). Kept in this browser.
let cseqSwing = store.get('cseqSwing', true);
let cseqLastN = -2, cseqCount = -1, cseqTimers = [];
// on each 16th (as the engine reaches it, ahead of the output), every running sequencer steps its control
const cseqEngineMsg = onEngineMsg;
onEngineMsg = function (e) {
  const m = e.data;
  if (m && m.type === 'step' && running) {
    const n = Number.isFinite(m.n) ? m.n : ++cseqCount, ms16 = 60000 / (m.bpm || state.bpm) / 4, fresh = n !== cseqLastN + 1;
    cseqLastN = n;
    if (cseqSwing || n % 2 === 0 || fresh) cseqStepAll(n, ms16);
    // on the grid: the odd 16th is booked from the even one, a 16th later, rather than waiting for its swung step
    if (!cseqSwing && n % 2 === 0) cseqTimers.push(setTimeout(() => { cseqTimers.shift(); if (running && cseqLastN === n) cseqStepAll(n + 1, ms16); }, ms16));
  }
  return cseqEngineMsg(e);
};
// stopping puts every control back to its setting
const cseqSetRun = setRun;
setRun = async function (on) {
  const was = running, r = await cseqSetRun(on);
  if (!on) { cseqReleaseAll(); for (const t of cseqTimers) clearTimeout(t); cseqTimers = []; csNow = -1; csDrawNow(); }
  if (!on || !was) { cseqLastN = -2; cseqCount = -1; }
  return r;
};
// presets: the sound carries its sequencers; a preset without any clears them
const cseqSoundSnap = soundSnap, cseqApplySound = applySound;
soundSnap = function () { return { ...cseqSoundSnap(), cseq: JSON.parse(JSON.stringify(state.cseq)) }; };
applySound = function (x) {
  cseqReleaseAll();
  cseqApplySound(x);
  if (!x || typeof x !== 'object') return;
  state.cseq = cseqLoad(x.cseq); cseqMarks();
  if (csKey) { if (state.cseq[csKey]) csDraw(); else csClose(); }
};

// ---------- the pop-up ----------
const csDlg = document.getElementById('cseq');
const csStepsEl = document.getElementById('cs-steps'), csPagesEl = document.getElementById('cs-pages');
const csCells = Array.from({ length: 16 }, (_, i) => { const c = document.createElement('i'); c.dataset.i = i; c.innerHTML = '<b></b><em></em>'; csStepsEl.append(c); return c; });
const csPageBtns = Array.from({ length: CSEQ_MAX / 16 }, (_, p) => {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = `${p * 16 + 1}-${p * 16 + 16}`;
  b.addEventListener('click', () => { csPage = p; if ((csSel >> 4) !== p) csSel = p * 16; csDraw(); }); csPagesEl.append(b); return b;
});
let csKey = null, csPage = 0, csSel = 0, csNow = -1, csFresh = false;
// the kinds of randomise, each making the steps over the length (and on past it, so a longer length carries on):
// random: any offset each step; drunk: a walk, a small step up or down from the last; wobbly: two slow waves together,
// a smooth wander that comes back round at the length; ramp: a rise or fall over the length; s&h: a new random
// offset held for 2 to 4 steps; sparse: mostly none, now and then a spike
const csRR = () => Math.random() * 2 - 1;
const CSEQ_RAND = [
  ['random', () => Array.from({ length: CSEQ_MAX }, csRR)],
  ['drunk', () => { let v = csRR() * 0.5; return Array.from({ length: CSEQ_MAX }, () => { v += csRR() * 0.3; if (v > 1 || v < -1) v = Math.sign(v) * 2 - v; return v; }); }],
  ['wobbly', (n) => { const a = 1 + Math.floor(Math.random() * 2), b = 2 + Math.floor(Math.random() * 3), pa = Math.random() * 6.3, pb = Math.random() * 6.3, mix = 0.3 + Math.random() * 0.4;
    return Array.from({ length: CSEQ_MAX }, (_, i) => (1 - mix) * Math.sin(2 * Math.PI * a * i / n + pa) + mix * Math.sin(2 * Math.PI * b * i / n + pb)); }],
  ['ramp', (n) => { const up = Math.random() < 0.5; return Array.from({ length: CSEQ_MAX }, (_, i) => { const x = (i % n) / Math.max(1, n - 1) * 2 - 1; return up ? x : -x; }); }],
  ['s&h', () => { const hold = 2 + Math.floor(Math.random() * 3); let v = 0; return Array.from({ length: CSEQ_MAX }, (_, i) => { if (i % hold === 0) v = csRR(); return v; }); }],
  ['sparse', () => Array.from({ length: CSEQ_MAX }, () => (Math.random() < 0.22 ? csRR() : 0))],
];
let csKind = Math.max(0, CSEQ_RAND.findIndex(([n]) => n === store.get('cseqKind', 'random')));
const csFmt = (o, q) => `${o > 0 ? '+' : o < 0 ? '−' : '±'}${Math.round(Math.abs(o) * q.depth)}%`;
const csReadout = () => { const q = state.cseq[csKey]; document.getElementById('cs-val').textContent = `step ${csSel + 1} ${csFmt(q.vals[csSel], q)}`; };
function csDraw() {
  const q = state.cseq[csKey], at = csPage * 16;
  csCells.forEach((c, i) => {
    const v = q.vals[at + i];
    c.style.setProperty('--up', Math.max(0, v)); c.style.setProperty('--dn', Math.max(0, -v));
    c.classList.toggle('off', at + i >= q.len); c.classList.toggle('sel', at + i === csSel);
    c.lastElementChild.textContent = at + i + 1;
  });
  csPageBtns.forEach((b, p) => { const on = p === csPage; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; b.classList.toggle('past', p * 16 >= q.len); });
  csBars.forEach((b) => b.draw(q));
  const on = document.getElementById('cs-on'); on.setAttribute('aria-pressed', q.on); on.textContent = q.on ? 'on' : 'off';
  document.getElementById('cs-kind').textContent = CSEQ_RAND[csKind][0];
  csStepsEl.setAttribute('aria-valuetext', `step ${csSel + 1}, ${csFmt(q.vals[csSel], q)}`);
  csReadout(); csDrawNow(); cseqMarks();
}
// the step playing: outlined, and its page marked
function csDrawNow() {
  if (!csKey) return;
  csCells.forEach((c, j) => c.classList.toggle('now', running && csPage * 16 + j === csNow));
  csPageBtns.forEach((b, p) => b.classList.toggle('now', running && csNow >= 0 && p === csNow >> 4));
}
cseqOpen = (key) => {
  if (!ctlRegs[key]) return;
  boot();
  csFresh = !state.cseq[key];
  if (csFresh) state.cseq[key] = cseqNew();
  csKey = key; csPage = 0; csSel = 0; csNow = -1;
  document.getElementById('cs-name').textContent = (CSEQ_NAME[key] || key).toLowerCase();
  csDraw();
  if (!csDlg.open) { if (csDlg.showModal) csDlg.showModal(); else csDlg.setAttribute('open', ''); }
  csStepsEl.focus();
};
function csClose() {
  // opened and left untouched: nothing was made, so nothing is kept (and the control isn't marked)
  const q = csKey && state.cseq[csKey];
  if (q && csFresh && q.vals.every(v => v === 0)) { cseqRelease(csKey); delete state.cseq[csKey]; }
  csKey = null; cseqMarks(); save();
  if (csDlg.open) { if (csDlg.close) csDlg.close(); else csDlg.removeAttribute('open'); }
}
csDlg.addEventListener('cancel', (e) => { e.preventDefault(); csClose(); });
csDlg.addEventListener('click', (e) => { if (e.target === csDlg) csClose(); });
document.getElementById('cs-done').onclick = csClose;
// a change made in the pop-up: fresh no more, saved
const csTouch = () => { const q = state.cseq[csKey]; csFresh = false; if (csSel >= q.len) { csSel = q.len - 1; csPage = csSel >> 4; } save(); csDraw(); };
document.getElementById('cs-on').onclick = () => { const q = state.cseq[csKey]; q.on = !q.on; if (!q.on) cseqRelease(csKey); csTouch(); };
document.getElementById('cs-kind').onclick = () => { csKind = (csKind + 1) % CSEQ_RAND.length; store.set('cseqKind', CSEQ_RAND[csKind][0]); csDraw(); };
const csRandomise = () => { const q = state.cseq[csKey]; q.vals = CSEQ_RAND[csKind][1](q.len).map(cseqOff); q.on = true; csTouch(); };
document.getElementById('cs-rand').onclick = csRandomise;

// painting: a step takes the offset at the pointer's height (the middle is none); dragging across paints the steps it passes
{
  let painting = false;
  const paint = (e) => {
    const r = csStepsEl.getBoundingClientRect();
    const col = Math.max(0, Math.min(7, Math.floor((e.clientX - r.left) / r.width * 8)));
    const row = Math.max(0, Math.min(1, Math.floor((e.clientY - r.top) / r.height * 2)));
    const c = csCells[row * 8 + col], cr = c.getBoundingClientRect(), i = csPage * 16 + row * 8 + col, q = state.cseq[csKey];
    if (i >= q.len) return;
    q.vals[i] = cseqOff(1 - 2 * (e.clientY - cr.top) / cr.height); csSel = i; csFresh = false; csDraw();
  };
  csStepsEl.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; csStepsEl.setPointerCapture(e.pointerId); painting = true; paint(e); });
  csStepsEl.addEventListener('pointermove', (e) => { if (painting) paint(e); });
  const stop = () => { if (painting) save(); painting = false; };
  csStepsEl.addEventListener('pointerup', stop); csStepsEl.addEventListener('pointercancel', stop);
}
// length (2 at the left to 64 at the right), slew (off to a whole step), speed (a 16th to 8 bars), depth (±0 to 100%):
// horizontal bars of LCD segments; drag, or arrows / Home / End when focused
const csBar = (id, frac, out, set, steps) => {
  const el = document.getElementById(id), o = el.parentNode.querySelector('output');
  const at = (e) => { const r = el.getBoundingClientRect(); set(state.cseq[csKey], Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); csTouch(); };
  let held = false;
  el.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; el.setPointerCapture(e.pointerId); held = true; at(e); });
  el.addEventListener('pointermove', (e) => { if (held) at(e); });
  el.addEventListener('pointerup', () => { held = false; }); el.addEventListener('pointercancel', () => { held = false; });
  el.addEventListener('keydown', (e) => {
    const q = state.cseq[csKey], d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 4, PageDown: -4 }[e.key];
    const f = d ? frac(q) + d / steps : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : null;
    if (f === null) return;
    e.preventDefault(); e.stopPropagation(); set(q, Math.max(0, Math.min(1, f + 1e-6))); csTouch();
  });
  return { draw: (q) => { const f = frac(q), t = out(q); el.style.setProperty('--v', f); o.textContent = t; el.setAttribute('aria-valuetext', t); el.setAttribute('aria-valuenow', Math.round(f * 100)); } };
};
const csBars = [
  csBar('cs-len', (q) => (q.len - 2) / (CSEQ_MAX - 2), (q) => `${q.len} steps`, (q, x) => { q.len = 2 + Math.round(x * (CSEQ_MAX - 2)); }, CSEQ_MAX - 2),
  csBar('cs-slew', (q) => q.slew / 100, (q) => (q.slew ? `${q.slew}%` : 'off'), (q, x) => { q.slew = Math.round(x * 20) * 5; }, 20),
  csBar('cs-speed', (q) => CSEQ_STEPS.indexOf(q.step) / (CSEQ_STEPS.length - 1), (q) => cseqStepName(q.step),
    (q, x) => { q.step = CSEQ_STEPS[Math.round(x * (CSEQ_STEPS.length - 1))]; }, CSEQ_STEPS.length - 1),
  csBar('cs-depth', (q) => q.depth / 100, (q) => `±${q.depth}%`, (q, x) => { q.depth = Math.round(x * 20) * 5; if (cseqLive[csKey]) cseqApply(csKey); }, 20),
];
// keys: Left / Right pick a step, Up / Down nudge it (Shift: a quarter), 1-4 pick the page, R randomises, Esc closes.
// Tab stays inside the pop-up.
csDlg.addEventListener('keydown', (e) => {
  if (!csKey || e.metaKey || e.ctrlKey || e.altKey) return;
  const q = state.cseq[csKey];
  if (e.key === 'Tab') {
    const f = [...csDlg.querySelectorAll('button, [tabindex="0"]')].filter(x => !x.disabled && x.offsetParent);
    const i = f.indexOf(document.activeElement), n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length;
    f[n].focus(); e.preventDefault(); return;
  }
  const lr = { ArrowLeft: -1, ArrowRight: 1 }[e.key], ud = { ArrowUp: 1, ArrowDown: -1 }[e.key];
  if (lr && !e.target.matches('[role=tab]')) { csSel = (csSel + lr + q.len) % q.len; csPage = csSel >> 4; csDraw(); }
  else if (lr) { csPage = (csPage + lr + 4) % 4; csSel = Math.min(csPage * 16, q.len - 1); csDraw(); csPageBtns[csPage].focus(); }
  else if (ud) { q.vals[csSel] = cseqOff(q.vals[csSel] + ud * (e.shiftKey ? .25 : .05)); csTouch(); }
  else if (/^[1-4]$/.test(e.key)) { csPage = +e.key - 1; if ((csSel >> 4) !== csPage) csSel = Math.min(csPage * 16, q.len - 1); csDraw(); }
  else if (e.key === 'r' || e.key === 'R') csRandomise();
  else return;
  e.preventDefault(); e.stopPropagation();
});
csDlg.addEventListener('keyup', (e) => { if (/^[1-4rR]$/.test(e.key)) e.stopPropagation(); });
// on a phone the first touch also goes full screen (tabs.js), which would cover the pop-up: open it again on top
document.addEventListener('fullscreenchange', () => { if (csDlg.open && csDlg.showModal) { csDlg.close(); csDlg.showModal(); } });

// Options › Sequencer: follow the swing
{
  const sw = document.getElementById('cseq-swing');
  sw.checked = cseqSwing;
  sw.onchange = () => { cseqSwing = sw.checked; store.set('cseqSwing', cseqSwing); };
}
cseqMarks();
