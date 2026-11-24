// Shyoy: What a preset holds and how it loads; the built-in sounds and projects.
// ---------- Kestrel glue: what a preset holds and how it loads ----------
const clone = o => JSON.parse(JSON.stringify(o));
function soundSnap() { return { params: clone(state.params), bend: clone(state.bend), br: clone(state.br), strip: clone(state.strip) }; }
// v0.40.0 (Johnny: "remove the sequencer"): a preset is the sound alone; one saved with a pattern loads its sound
// v0.46.0 (Johnny: "the sequencer needs to be saved with the presets"): it holds the octave sequencer's pattern too (seq.js):
// every step, each lane's start, length and RETRIG. A preset saved without one (the factory ones) leaves the pattern as it is
function projectSnap() { return { sound: soundSnap(), seq: clone(state.seq) }; }
// v0.56.0 (Johnny: "modify old presets to include the seq on straight settings"): a preset saved before presets held a pattern (the
// factory ones, older ones of your own, imports) gets a straight one: a gate on every step, octave 0, no slides or accents, every
// lane looping 1-16, no RETRIG, no recorded notes, no cycles
const SEQ_STRAIGHT = () => ({ steps: Array.from({ length: 16 }, () => ({ on: true, o: 0, s: false, a: false })), len: { o: 16, on: 16, s: 16, a: 16 },
  st: { o: 0, on: 0, s: 0, a: 0 }, rt: { o: false, on: false, s: false, a: false }, notes: [], loop: 0, adv: 'gate', cyc: 0 });
function applySound(x) {
  if (!x || typeof x !== 'object') return;
  state.params = { ...defaults, ...knownParams(x.params) }; state.bend = { ...stockBend(), ...(x.bend || {}) };
  state.br = { ...(x.br || {}) };
  for (const k in ui) ui[k](state.params[k]);
  for (const k in bui) bui[k](state.bend[k]);
  Object.values(cells).forEach(r => r());
  stripLoad(x.strip);   // the performance strip's eight picks (strip.js)
}
function applyPreset(x) {
  if (!x || typeof x !== 'object') return;
  boot();
  if (x.sound) applySound(x.sound);
  seqLoad(x.seq || SEQ_STRAIGHT());
  pushAll(); save();
}
// Factory presets, in the shape of an Export all file's projectPresets ({ "Name": project, ... }): paste one in here.
// v0.58.0: empty; the Factory folder holds only the Straight sound from PRESETS (state.js)
const FACTORY_PRESETS = {};
// the Factory folder: the factory patch (Straight), then FACTORY_PRESETS (a same-named entry there replaces the patch)
const PROJECT_BUILTIN = {};
for (const name of Object.keys(PRESETS)) { const st = presetState(name); PROJECT_BUILTIN[name] = { sound: { params: st.params, bend: st.bend, br: st.br } }; }
for (const [name, x] of Object.entries(FACTORY_PRESETS)) if (x && typeof x === 'object') PROJECT_BUILTIN[name] = x;
for (const x of Object.values(PROJECT_BUILTIN)) if (!x.seq) x.seq = SEQ_STRAIGHT();
const prjBar = presetBar('prj', 'projectPresets', PROJECT_BUILTIN, projectSnap, applyPreset, (taken) => NAMER(taken));
{ let n = 0; for (const x of Object.values(prjBar.user)) if (x && typeof x === 'object' && !x.seq) { x.seq = SEQ_STRAIGHT(); n++; } if (n) prjBar.save(); }
const download = (name, obj) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
// Export all: every preset of your own in one file; with none saved yet, the current sound as one project file
document.getElementById('prj-export').onclick = () => {
  if (!Object.keys(prjBar.user).length) {
    const nm = (document.getElementById('prj-name').value.trim() || 'shyoy-preset').replace(/[^\w .-]+/g, '_');
    download(nm + '.json', { app: 'kestrel-ms1', kind: 'project', version: 1, project: projectSnap() });
    return;
  }
  download('shyoy-presets.json', { app: 'kestrel-ms1', kind: 'presets', version: 1, projectPresets: { ...prjBar.user } });
};
// Export favourites: every starred preset, factory and your own, in the Export all format
document.getElementById('prj-exfav').onclick = () => {
  const out = {};
  for (const v of store.get('fav.prj', [])) {
    const nm = String(v).slice(2), x = v[0] === 'u' ? prjBar.user[nm] : v[0] === 'b' ? PROJECT_BUILTIN[nm] : null;
    if (x && !(nm in out)) out[nm] = x;
  }
  if (!Object.keys(out).length) return;
  download('shyoy-favourites.json', { app: 'kestrel-ms1', kind: 'presets', version: 1, projectPresets: out });
};
// Import file takes an Export all or favourites file (adds them all to My presets, the sound stays as it is), one
// project file (loads it and saves it under the file's name), or the older export (project plus presets)
const prjFile = document.getElementById('prj-file');
document.getElementById('prj-import').onclick = () => prjFile.click();
prjFile.addEventListener('change', async () => {
  const f = prjFile.files[0]; prjFile.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!j || j.app !== 'kestrel-ms1') throw 0;
    const list = j.kind === 'presets' ? j.projectPresets : j.presets;
    let n = 0;
    if (list && typeof list === 'object') for (const [k, v] of Object.entries(list)) { const nm = k.trim().slice(0, 40); if (nm && v && typeof v === 'object') { prjBar.user[nm] = v; n++; } }
    if (j.kind !== 'presets' && j.project && typeof j.project === 'object') {
      applyPreset(j.project);
      const nm = f.name.replace(/\.json$/i, '').trim().slice(0, 40) || 'Imported';
      prjBar.user[nm] = projectSnap(); prjBar.save(); prjBar.render('u:' + nm);
    } else if (n) { prjBar.save(); prjBar.render(document.getElementById('prj-preset').value); }
  } catch (e) {}
});
if (PROJECT_BUILTIN[state.preset]) prjBar.render('b:' + state.preset);
for (const el of document.querySelectorAll('.pm')) presetMenu(el);
document.getElementById('prj-roll').onclick = () => prjBar.suggest(true);
document.querySelector('#prj-bar .pm-btn').addEventListener('click', () => prjBar.suggest(false));
