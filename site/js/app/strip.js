// Shyoy: the performance strip (v0.18.0, Johnny's idea after the TB-303 app's always-on dial row): eight dials under the
// header, on view on every page. The menu under each dial picks which synth control it moves, from every continuous
// control on the Synth page, grouped by module. A strip dial and the same control on the Synth page are one value: moving
// either, a preset load or a MIDI CC updates both. The eight picks belong to the sound (v0.18.1, Johnny: "save per
// preset"): state.strip is saved with the sound in every preset, and a preset without one gets STRIP_DEF.
let stripLoad = () => {};
const STRIP_DEF = ['cutoff', 'reso', 'vcfEnv', 'decay', 'accent', 'drive', 'pw', 'lfoRate'];
const STRIP_NAME = { lfoRate: 'lfo rate', tune: 'tune', vcoMod: 'vco lfo', pw: 'pulse width', drift: 'drift', saw: 'saw', pulse: 'pulse', sub: 'sub', noise: 'noise',
  cutoff: 'cutoff', reso: 'reso', vcfEnv: 'env mod', vcfMod: 'vcf lfo', kybd: 'key track', drive: 'drive', accVcf: 'acc sweep',
  attack: 'attack', decay: 'decay', sustain: 'sustain', release: 'release', level: 'level', glide: 'porta', slide: 'slide', accent: 'accent' };
(() => {
  const ALL = [];   // every continuous rack control, in panel order
  for (const m of RACK) for (const it of m.items) if (it.f) ALL.push({ ...it, mod: m.name });
  const name = (a) => STRIP_NAME[a.f] || a.label.toLowerCase();
  const ok = (s) => Array.isArray(s) && s.length === 8 && s.every(id => ALL.some(a => a.f === id));
  if (!ok(state.strip)) {   // v0.18.0 kept one set in its own localStorage key: carry it over once
    let old = null; try { old = JSON.parse(localStorage.getItem('kestrel.strip')); localStorage.removeItem('kestrel.strip'); } catch (e) {}
    state.strip = ok(old) ? old : STRIP_DEF.slice();
  }
  const strip = document.getElementById('mstrip');
  const rackUi = {}; for (const a of ALL) rackUi[a.f] = ui[a.f];   // the Synth page's own setters
  const slots = [];
  // one value, two dials: refresh the Synth page copy and every strip dial on that control (without re-sending)
  const show = (id) => { const v = state.params[id]; rackUi[id](v); for (const s of slots) if (s.id === id) s.set(v); };
  for (const a of ALL) ui[a.f] = (v) => { rackUi[a.f](v); for (const s of slots) if (s.id === a.f) s.set(v); };
  onMove.push(show);
  const items = (() => { let h = '', last = '';
    ALL.forEach((a, t) => { if (a.mod !== last) { h += `<span class="mh" role="presentation">${a.mod}</span>`; last = a.mod; }
      h += `<button type="button" role="menuitemradio" aria-checked="false" data-t="${t}">${name(a)}</button>`; });
    return h; })();
  function draw(i) {
    const id = state.strip[i], def = ALL.find(a => a.f === id);
    const el = document.createElement('div'); el.className = 'mslot';
    const keep = ui[id]; dial(def, el); const set = ui[id]; ui[id] = keep;   // dial() registers itself in ui; the wrapper above stays
    const d = el.firstElementChild, kn = d.querySelector('.knob');
    d.querySelector('label').remove(); kn.id = 'mk-' + i; kn.setAttribute('aria-label', 'Dial ' + (i + 1) + ': ' + name(def));
    const menu = document.createElement('div'); menu.className = 'rmenu tmenu mpick'; menu.dataset.label = 'Dial ' + (i + 1) + ' controls';
    el.appendChild(menu);
    typeMenu(menu, (t) => { state.strip[i] = ALL[t].f; save(); draw(i); slots[i].el.querySelector('.rm-btn').focus(); });
    menu.lastElementChild.innerHTML = items;
    drawTypeMenu(menu, ALL.indexOf(def));
    if (slots[i]) slots[i].el.replaceWith(el); else strip.appendChild(el);
    slots[i] = { el, id, set };
  }
  for (let i = 0; i < 8; i++) draw(i);
  // a preset load (sounds.js applySound): its own eight, or the defaults for a preset saved without them
  stripLoad = (x) => { state.strip = ok(x) ? x.slice() : STRIP_DEF.slice(); for (let i = 0; i < 8; i++) draw(i); };
})();
