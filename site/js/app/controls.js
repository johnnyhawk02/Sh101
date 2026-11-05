// Every .sld slider shows its value as lit LCD segments: --v (0..1) drives the track fill in shyoy.css. The value setter
// is wrapped per slider so values set from code (preset loads, pattern changes, saved looks) light the right segments too.
for (const el of document.querySelectorAll('.sld input[type=range]')) {
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const fill = () => { const lo = +el.min || 0, hi = +el.max || 100; el.style.setProperty('--v', (d.get.call(el) - lo) / (hi - lo)); };
  Object.defineProperty(el, 'value', { get() { return d.get.call(el); }, set(v) { d.set.call(el, v); fill(); }, configurable: true });
  el.addEventListener('input', fill); fill();
}
// Shyoy: Faders, dials and switches, and the synth rack built from them.
// ---------- UI: faders ----------
const ui = {};
// called with (id) whenever a fader or dial is moved by hand; the performance strip (strip.js) uses it to keep both copies in step
const onMove = [];
// ---------- per-control step sequencers (cseq.js) ----------
// Every fader and dial registers under its key (its param id; 'b:' + id on the bend board), so the sequencer can show the
// value heard on every copy of a control (the Synth page and the strip) without changing its setting. Holding a control
// still for 500 ms (cancelled by a move of more than 6 px), or a right-click, opens its sequencer.
const ctlRegs = {};   // key -> [{ el, paint, get, set }]
let cseqHand = () => false, cseqOpen = () => {};
function ctlReg(key, el, c) {
  (ctlRegs[key] = (ctlRegs[key] || []).filter(r => r.el.isConnected)).push({ el, ...c });
  el.classList.toggle('cseq', !!(state.cseq && state.cseq[key] && state.cseq[key].on));
  const t = c.target; let hold = 0, x0 = 0, y0 = 0, v0 = 0;
  // (capture: the setting is read before the press moves it)
  t.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; x0 = e.clientX; y0 = e.clientY; v0 = c.get(); clearTimeout(hold);
    hold = setTimeout(() => { c.cancel(); if (c.get() !== v0) c.set(v0); cseqOpen(key); }, 500);
  }, true);
  t.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 6) clearTimeout(hold); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) t.addEventListener(ev, () => clearTimeout(hold));
  t.addEventListener('contextmenu', e => { e.preventDefault(); clearTimeout(hold); c.cancel(); cseqOpen(key); });
}
function fader(def, mount) {
  const id = def.f, store = def.bend ? state.bend : null;
  const get = () => (def.bend ? state.bend : state.params)[id];
  const el = document.createElement('div'); el.className = 'fdr' + (def.bend ? ' bend' : '');
  el.innerHTML = `<div class="track" role="slider" tabindex="0" id="f-${id}" aria-label="${def.label}" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div><div class="sqm"></div><div class="ticks"></div><div class="cap"></div></div><label for="f-${id}">${def.label}</label><output></output>`;
  const tr = el.querySelector('.track'), cap = el.querySelector('.cap'), out = el.querySelector('output');
  const key = def.bend ? 'b:' + id : id;
  // paint: what the fader shows (its setting, or the value heard while its step sequencer runs)
  const paint = (v) => {
    cap.style.top = (9 + (1 - v) * (112 - 18)) + 'px'; tr.style.setProperty('--v', v);
    tr.setAttribute('aria-valuenow', Math.round(v * 100)); const t = def.fmt(v); out.textContent = t; tr.setAttribute('aria-valuetext', t);
    if (def.bend) out.classList.toggle('off', Math.abs(v - def.def) > 0.004);
  };
  const set = (v, send = true) => {
    v = Math.max(0, Math.min(1, v));
    if (send && cseqHand(key, v)) return;   // its step sequencer is running: the move sets the base it plays around
    (def.bend ? state.bend : state.params)[id] = v; paint(v);
    if (send) { if (def.bend) post({ type: 'bend', b: bendPhysical(state.bend) }); else if (def.seq) post(seqMsg()); else post({ type: 'param', id, v }); save(); if (!def.bend) for (const h of onMove) h(id); }
  };
  const fromY = (e) => { const r = tr.getBoundingClientRect(); return 1 - (e.clientY - r.top) / r.height; };
  let drag = null;
  tr.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;   // a right-click opens the step sequencer (ctlReg)
    tr.setPointerCapture(e.pointerId); boot();
    const cr = cap.getBoundingClientRect();
    if (e.clientY >= cr.top - 4 && e.clientY <= cr.bottom + 4) drag = { y: e.clientY, v: get() };
    else { set(fromY(e)); drag = { y: e.clientY, v: get() }; }
  });
  tr.addEventListener('pointermove', e => { if (!drag) return; const r = tr.getBoundingClientRect(); set(drag.v - (e.clientY - drag.y) / r.height * (e.shiftKey ? .2 : 1)); });
  tr.addEventListener('pointerup', () => drag = null); tr.addEventListener('pointercancel', () => drag = null);
  tr.addEventListener('dblclick', () => set(def.def));
  tr.addEventListener('wheel', e => { e.preventDefault(); set(get() - Math.sign(e.deltaY) * (e.shiftKey ? .005 : .02)); }, { passive: false });
  tr.addEventListener('keydown', e => {
    const st = e.shiftKey ? .1 : .01;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { set(get() + st); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { set(get() - st); e.preventDefault(); }
    else if (e.key === 'Home') set(0); else if (e.key === 'End') set(1);
  });
  mount.appendChild(el);
  (def.bend ? bui : ui)[id] = v => set(v, false);
  set(get(), false);
  // the step sequencer's value heard, a marker across the track (null: none)
  const mod = (v) => { tr.classList.toggle('sq', v != null); if (v != null) tr.style.setProperty('--m', v); };
  ctlReg(key, el, { paint, mod, target: tr, cancel: () => { drag = null; }, get, set });
}
// A dial (the 303 app's look): a ring of wedge segments lit up to the value, readout above, label below.
// Vertical drag (Shift = fine), arrows / Page keys, Home/End, double-click resets.
const DIAL_A0 = -150, DIAL_SWEEP = 300, DIAL_SEGS = 24, DIAL_RI = 17.5, DIAL_RO = 28.5, DIAL_GAP = 2.6;
const dialSeg = (i) => {
  const w = DIAL_SWEEP / DIAL_SEGS, a0 = DIAL_A0 + i * w + DIAL_GAP / 2, a1 = DIAL_A0 + (i + 1) * w - DIAL_GAP / 2;
  const pt = (deg, r) => { const t = (deg - 90) * Math.PI / 180; return `${(32 + r * Math.cos(t)).toFixed(2)} ${(32 + r * Math.sin(t)).toFixed(2)}`; };
  return `M${pt(a0, DIAL_RO)}A${DIAL_RO} ${DIAL_RO} 0 0 1 ${pt(a1, DIAL_RO)}L${pt(a1, DIAL_RI)}A${DIAL_RI} ${DIAL_RI} 0 0 0 ${pt(a0, DIAL_RI)}Z`;
};
const DIAL_ALL = Array.from({ length: DIAL_SEGS }, (_, i) => dialSeg(i));
const DIAL_LIT = DIAL_ALL.map((_, i) => DIAL_ALL.slice(0, i + 1).join(''));
function dial(def, mount) {
  const id = def.f, get = () => state.params[id];
  const el = document.createElement('div'); el.className = 'dial';
  el.innerHTML = `<output></output><div class="knob" role="slider" tabindex="0" id="f-${id}" aria-label="${def.label}" aria-valuemin="0" aria-valuemax="100">` +
    `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="trk" d="${DIAL_ALL.join('')}"/><path class="arc" d=""/><path class="sqm" d=""/></svg></div><label for="f-${id}">${def.label}</label>`;
  const kn = el.querySelector('.knob'), arc = el.querySelector('.arc'), out = el.querySelector('output');
  const paint = (v) => {
    const n = Math.round(v * DIAL_SEGS); arc.setAttribute('d', n ? DIAL_LIT[n - 1] : '');
    kn.setAttribute('aria-valuenow', Math.round(v * 100)); const t = def.fmt(v); out.textContent = t; kn.setAttribute('aria-valuetext', t);
  };
  const set = (v, send = true) => {
    v = Math.max(0, Math.min(1, v));
    if (send && cseqHand(id, v)) return;
    state.params[id] = v; paint(v);
    if (send) { post({ type: 'param', id, v }); save(); for (const h of onMove) h(id); }
  };
  let drag = null;
  const end = () => { drag = null; el.classList.remove('active'); };
  kn.addEventListener('pointerdown', e => { if (e.button !== 0) return; kn.setPointerCapture(e.pointerId); boot(); drag = { y: e.clientY, v: get(), id: e.pointerId }; el.classList.add('active'); });
  kn.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { end(); return; }
    set(drag.v + (drag.y - e.clientY) / fitK() / (e.shiftKey ? 600 : 160));
  });
  kn.addEventListener('pointerup', end); kn.addEventListener('pointercancel', end); kn.addEventListener('lostpointercapture', end);
  kn.addEventListener('dblclick', () => set(def.def));
  kn.addEventListener('keydown', e => {
    const d = { ArrowUp: .02, ArrowRight: .02, ArrowDown: -.02, ArrowLeft: -.02, PageUp: .1, PageDown: -.1 }[e.key];
    if (d) { e.preventDefault(); set(get() + (e.shiftKey ? d / 4 : d)); }
    else if (e.key === 'Home') set(0); else if (e.key === 'End') set(1);
  });
  mount.appendChild(el);
  ui[id] = v => set(v, false);
  set(get(), false);
  // the step sequencer's value heard: a pointer across the ring (null: none)
  const sqm = el.querySelector('.sqm');
  const mod = (v) => {
    if (v == null) { sqm.setAttribute('d', ''); return; }
    const a = (DIAL_A0 + v * DIAL_SWEEP - 90) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), w = 2.1;
    const p = (r, d) => `${(32 + r * c - d * s).toFixed(2)} ${(32 + r * s + d * c).toFixed(2)}`;
    sqm.setAttribute('d', `M${p(13, -w)}L${p(35, -w)}L${p(35, w)}L${p(13, w)}Z`);
  };
  ctlReg(id, el, { paint, mod, target: kn, cancel: end, get, set });
}
const bui = {};
function switcher(def, mount) {
  const id = def.s, bucket = () => def.bend ? state.bend : state.params;
  const el = document.createElement('div'); el.className = 'sw'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', def.label);
  el.innerHTML = `<span class="lab">${def.label}</span>` + def.opts.map((o, i) => `<button data-i="${i}" id="s-${id}-${i}"><span class="led"></span>${o}</button>`).join('');
  const btns = [...el.querySelectorAll('button')];
  const set = (v, send = true) => {
    bucket()[id] = v; btns.forEach((b, i) => b.setAttribute('aria-pressed', i === v ? 'true' : 'false'));
    if (send) { if (def.bend) post({ type: 'bend', b: bendPhysical(state.bend) }); else post({ type: 'param', id, v: def.val ? def.val(v) : v }); save(); }
    if (def.onSet) def.onSet(v);
  };
  btns.forEach(b => b.addEventListener('click', () => { boot(); set(+b.dataset.i); }));
  mount.appendChild(el);
  (def.bend ? bui : ui)[id] = v => set(v, false);
  set(bucket()[id], false);
}
const rack = document.getElementById('rack');
for (const m of RACK) {
  const sec = document.createElement('section'); sec.className = 'mod'; sec.setAttribute('aria-label', m.name);
  sec.innerHTML = `<h2>${m.name}<small>${m.sub}</small></h2><div class="ctrls"></div>`;
  const c = sec.querySelector('.ctrls');
  for (const it of m.items) it.f ? fader(it, c) : switcher(it, c);
  rack.appendChild(sec);
}
for (const b of BENDER) fader(b, document.getElementById('benderSlot'));
switcher({ s: 'transpose', label: 'Transpose', opts: ['Low', 'Mid', 'High'], def: 1 }, document.getElementById('trSw'));
