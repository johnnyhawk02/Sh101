// Shyoy: Faders, dials and switches, and the synth rack built from them.
// ---------- UI: faders ----------
const ui = {};
function fader(def, mount) {
  const id = def.f, store = def.bend ? state.bend : null;
  const get = () => (def.bend ? state.bend : state.params)[id];
  const el = document.createElement('div'); el.className = 'fdr' + (def.bend ? ' bend' : '');
  el.innerHTML = `<div class="track" role="slider" tabindex="0" id="f-${id}" aria-label="${def.label}" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div><div class="ticks"></div><div class="cap"></div></div><label for="f-${id}">${def.label}</label><output></output>`;
  const tr = el.querySelector('.track'), cap = el.querySelector('.cap'), out = el.querySelector('output');
  const set = (v, send = true) => {
    v = Math.max(0, Math.min(1, v)); (def.bend ? state.bend : state.params)[id] = v;
    cap.style.top = (9 + (1 - v) * (112 - 18)) + 'px'; tr.style.setProperty('--v', v);
    tr.setAttribute('aria-valuenow', Math.round(v * 100)); const t = def.fmt(v); out.textContent = t; tr.setAttribute('aria-valuetext', t);
    if (def.bend) out.classList.toggle('off', Math.abs(v - def.def) > 0.004);
    if (send) { if (def.bend) post({ type: 'bend', b: bendPhysical(state.bend) }); else if (def.seq) post(seqMsg()); else post({ type: 'param', id, v }); save(); }
  };
  const fromY = (e) => { const r = tr.getBoundingClientRect(); return 1 - (e.clientY - r.top) / r.height; };
  let drag = null;
  tr.addEventListener('pointerdown', e => {
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
    `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="trk" d="${DIAL_ALL.join('')}"/><path class="arc" d=""/></svg></div><label for="f-${id}">${def.label}</label>`;
  const kn = el.querySelector('.knob'), arc = el.querySelector('.arc'), out = el.querySelector('output');
  const set = (v, send = true) => {
    v = Math.max(0, Math.min(1, v)); state.params[id] = v;
    const n = Math.round(v * DIAL_SEGS); arc.setAttribute('d', n ? DIAL_LIT[n - 1] : '');
    kn.setAttribute('aria-valuenow', Math.round(v * 100)); const t = def.fmt(v); out.textContent = t; kn.setAttribute('aria-valuetext', t);
    if (send) { post({ type: 'param', id, v }); save(); }
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
