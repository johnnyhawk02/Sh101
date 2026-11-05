// Shyoy: What a preset holds and how it loads; the built-in sounds and projects.
// ---------- Kestrel glue: what a preset holds and how it loads ----------
const clone = o => JSON.parse(JSON.stringify(o));
const cleanSteps = a => clone(a).slice(0, 64).map(st => ({ n: Math.max(0, Math.min(11, st.n | 0)), o: Math.max(-2, Math.min(2, st.o | 0)), m: 'NTR'.includes(st.m) ? st.m : 'N', a: !!st.a, s: !!st.s }));
function soundSnap() { return { params: clone(state.params), bend: clone(state.bend), br: clone(state.br), fx: clone(state.fx) }; }
function patternSnap() { return { steps: clone(state.steps), s101: clone(state.s101 || []) }; }
function projectSnap() { storeSlot(); return { sound: soundSnap(), pattern: patternSnap(), bpm: state.bpm, slots: clone(state.slots), slot: state.slot, chain: [...state.chain] }; }
function applySound(x) {
  if (!x || typeof x !== 'object') return;
  state.params = { ...defaults, ...migrateCmp({ ...(x.params || {}) }) }; state.bend = { ...stockBend(), ...(x.bend || {}) };
  state.br = { ...(x.br || {}) }; state.fx = { rat: false, dly: false, lex: false, fold: false, ...(x.fx || {}) };
  for (const k in ui) ui[k](state.params[k]);
  for (const k in bui) bui[k](state.bend[k]);
  Object.values(cells).forEach(r => r()); renderFx();
}
function applyPattern(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.steps) || !x.steps.length) return;
  state.steps = cleanSteps(x.steps);
  if (Array.isArray(x.s101)) state.s101 = clone(x.s101).slice(0, 100);
  tail = []; undoBuf = null; renderSeq();
}
const sndOnlyEl = document.getElementById('prj-sndonly');
sndOnlyEl.checked = !!store.get('prjSoundOnly', false);
sndOnlyEl.onchange = () => store.set('prjSoundOnly', sndOnlyEl.checked);
// as in the 303 app, loading a preset keeps the current tempo
function applyPreset(x) {
  if (!x || typeof x !== 'object') return;
  boot();
  if (x.sound) applySound(x.sound);
  if (!sndOnlyEl.checked) {
    if (Array.isArray(x.slots) && x.slots.length) {
      // a saved project brings all 8 pattern slots and the chain, as the 303's projects bring all their banks
      state.slots = Array.from({ length: SLOTS }, (_, i) => { const v = x.slots[i]; return v && Array.isArray(v.steps) && v.steps.length ? { steps: cleanSteps(v.steps), swing: +v.swing || 0, gateLen: v.gateLen ?? .5 } : null; });
      state.slot = x.slot >= 0 && x.slot < SLOTS ? x.slot | 0 : 0;
      state.chain = Array.isArray(x.chain) ? x.chain.filter(k => k >= 0 && k < SLOTS) : [];
      playingSlot = -1; loadSlotData();
    } else if (x.pattern) { applyPattern(x.pattern); storeSlot(); }
    renderBank();
  }
  pushAll(); save();
}
// the four factory patches become the built-in presets
const PROJECT_BUILTIN = {};
for (const name of Object.keys(PRESETS)) { const st = presetState(name); PROJECT_BUILTIN[name] = { sound: { params: st.params, bend: st.bend, br: st.br, fx: st.fx }, pattern: { steps: st.steps }, bpm: st.bpm }; }
const prjBar = presetBar('prj', 'projectPresets', PROJECT_BUILTIN, projectSnap, applyPreset, (taken) => NAMER(taken));
const download = (name, obj) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
document.getElementById('prj-export').onclick = () => {
  const nm = (document.getElementById('prj-name').value.trim() || 'shyoy-preset').replace(/[^\w .-]+/g, '_');
  download(nm + '.json', { app: 'kestrel-ms1', kind: 'project', version: 1, project: projectSnap(), presets: prjBar.user });
};
const prjFile = document.getElementById('prj-file');
document.getElementById('prj-import').onclick = () => prjFile.click();
prjFile.addEventListener('change', async () => {
  const f = prjFile.files[0]; prjFile.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!j || j.app !== 'kestrel-ms1' || !j.project) throw 0;
    if (j.presets && typeof j.presets === 'object') for (const [k, v] of Object.entries(j.presets)) { const nm = k.trim().slice(0, 40); if (nm && v && typeof v === 'object') prjBar.user[nm] = v; }
    applyPreset(j.project);
    const nm = f.name.replace(/\.json$/i, '').trim().slice(0, 40) || 'Imported';
    prjBar.user[nm] = projectSnap(); prjBar.save(); prjBar.render('u:' + nm);
  } catch (e) {}
});
if (PROJECT_BUILTIN[state.preset]) prjBar.render('b:' + state.preset);
for (const el of document.querySelectorAll('.pm')) presetMenu(el);
document.getElementById('prj-roll').onclick = () => prjBar.suggest(true);
document.querySelector('#prj-bar .pm-btn').addEventListener('click', () => prjBar.suggest(false));
