// Shyoy planning mockup: the Synth page as a strip that is always on view at the top (like the TB-303 app),
// with Sequencer, Bend board, FX and Perform as tabs under it. Runs after the real app; it only rebuilds the rack.
//   ?v=a  everything in one row: dials, each switch a single box that steps through its choices
//   ?v=b  one row: the Perform module (porta, slide, accent) moves to the Perform tab, so the rest gets room
//   ?v=c  two rows of dials, switches kept as lists
//   ?v=d  Johnny's idea: a performance strip of 8 dials at the top, each assignable to any synth control from a menu
//         under it; the Synth page stays a tab (the full rack). The 8 picks are kept in this browser (mockup only).
(() => {
  const v = (new URLSearchParams(location.search).get('v') || 'a').toLowerCase();
  document.documentElement.dataset.mock = v;
  if (v === 'd') { macroStrip(); const want = new URLSearchParams(location.search).get('tab'); if (want) showTab('tab-' + want); return; }

  // a switch drawn as one box showing the current choice; a click steps to the next (same state, engine message and save as switcher())
  function stepper(def, mount) {
    const id = def.s;
    const el = document.createElement('div'); el.className = 'stp';
    el.innerHTML = `<span class="lab">${def.label}</span><button type="button" class="btn" aria-label="${def.label}"></button>`;
    const b = el.querySelector('button');
    const set = (x, send = true) => {
      state.params[id] = x; b.textContent = def.opts[x];
      if (send) { post({ type: 'param', id, v: def.val ? def.val(x) : x }); save(); }
      if (def.onSet) def.onSet(x);
    };
    b.addEventListener('click', () => { boot(); set((state.params[id] + 1) % def.opts.length); });
    mount.appendChild(el);
    ui[id] = x => set(x, false);
    set(state.params[id], false);
  }

  const mods = v === 'b' ? RACK.filter(m => m.id !== 'perf') : RACK;
  rack.innerHTML = '';
  for (const m of mods) {
    const sec = document.createElement('section'); sec.className = 'mod m-' + m.id; sec.setAttribute('aria-label', m.name);
    sec.innerHTML = `<h2>${m.name}<small>${m.sub}</small></h2><div class="ctrls"></div>`;
    const c = sec.querySelector('.ctrls');
    for (const it of m.items) it.f ? dial(it, c) : (v === 'c' ? switcher(it, c) : stepper(it, c));
    rack.appendChild(sec);
  }
  if (v === 'b') {   // Perform tab: bender + transpose as now, plus the glide / accent module
    const p = RACK.find(m => m.id === 'perf');
    const g = document.createElement('div'); g.className = 'grp mk-perf';
    g.innerHTML = `<h3>${p.name}<small>${p.sub}</small></h3><div class="ctrls"></div>`;
    const c = g.querySelector('.ctrls');
    for (const it of p.items) it.f ? dial(it, c) : switcher(it, c);
    document.getElementById('perf101').prepend(g);
  }

  // Synth is no longer a tab
  document.getElementById('tab-synth').hidden = true;
  if (unitEl.dataset.view === 'tab-synth') showTab('tab-seq');
  const want = new URLSearchParams(location.search).get('tab');
  if (want) showTab('tab-' + want);
})();

// ---------- D: the 8 assignable dials ----------
function macroStrip() {
  const KEY = 'shyoy.mock.strip';
  const ALL = [];   // every continuous rack control, in panel order, with its module name
  for (const m of RACK) for (const it of m.items) if (it.f) ALL.push({ ...it, mod: m.name });
  const NAME = { lfoRate: 'lfo rate', tune: 'tune', vcoMod: 'vco lfo', pw: 'pulse width', drift: 'drift', saw: 'saw', pulse: 'pulse', sub: 'sub', noise: 'noise',
    cutoff: 'cutoff', reso: 'reso', vcfEnv: 'env mod', vcfMod: 'vcf lfo', kybd: 'key track', drive: 'drive', accVcf: 'acc sweep',
    attack: 'attack', decay: 'decay', sustain: 'sustain', release: 'release', level: 'level', glide: 'porta', slide: 'slide', accent: 'accent' };
  const nm = (a) => NAME[a.f] || a.label.toLowerCase();
  const DEF = ['cutoff', 'reso', 'vcfEnv', 'decay', 'accent', 'drive', 'pw', 'lfoRate'];
  let picks = DEF.slice();
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(s) && s.length === 8 && s.every(id => ALL.some(a => a.f === id))) picks = s; } catch (e) {}
  const strip = document.createElement('section'); strip.className = 'mstrip'; strip.setAttribute('aria-label', 'Performance dials');
  document.querySelector('.top').after(strip);
  const slots = [];
  const draw = (i) => {
    const old = slots[i]; if (old) old.el.remove();
    const id = picks[i], def = ALL.find(a => a.f === id);
    const el = document.createElement('div'); el.className = 'mslot';
    const host = document.createElement('div'); el.appendChild(host);
    const rackSet = ui[id]; dial(def, host); const mine = ui[id]; ui[id] = rackSet;   // keep the rack's own setter in ui
    host.firstElementChild.querySelector('label').remove();
    const menu = document.createElement('div'); menu.className = 'rmenu tmenu mpick'; menu.dataset.label = 'Dial ' + (i + 1) + ' controls';
    el.appendChild(menu);
    typeMenu(menu, (t) => { picks[i] = ALL[t].f; try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch (e) {} draw(i); });
    let html = '', last = '';
    ALL.forEach((a, t) => { if (a.mod !== last) { html += `<span class="mh" role="presentation">${a.mod}</span>`; last = a.mod; } html += `<button type="button" role="menuitemradio" aria-checked="false" data-t="${t}">${nm(a)}</button>`; });
    menu.lastElementChild.innerHTML = html;
    drawTypeMenu(menu, ALL.indexOf(def));
    const before = slots[i + 1] && slots[i + 1].el; strip.insertBefore(el, before && before.parentNode === strip ? before : null);
    slots[i] = { el, id, set: mine, last: state.params[id] };
  };
  for (let i = 0; i < 8; i++) draw(i);
  // keep the strip and the rack in step: whichever moved, the other follows
  (function sync() {
    for (const s of slots) { const x = state.params[s.id]; if (x !== s.last) { s.last = x; s.set(x); if (ui[s.id]) ui[s.id](x); } }
    requestAnimationFrame(sync);
  })();
}
