// Shyoy planning mockup: the Synth page as a strip that is always on view at the top (like the TB-303 app),
// with Sequencer, Bend board, FX and Perform as tabs under it. Runs after the real app; it only rebuilds the rack.
//   ?v=a  everything in one row: dials, each switch a single box that steps through its choices
//   ?v=b  one row: the Perform module (porta, slide, accent) moves to the Perform tab, so the rest gets room
//   ?v=c  two rows of dials, switches kept as lists
(() => {
  const v = (new URLSearchParams(location.search).get('v') || 'a').toLowerCase();
  document.documentElement.dataset.mock = v;

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
