// Shyoy: What a preset holds and how it loads; the built-in sounds and projects.
// ---------- Kestrel glue: what a preset holds and how it loads ----------
const clone = o => JSON.parse(JSON.stringify(o));
const cleanSteps = a => clone(a).slice(0, 64).map(st => ({ n: Math.max(0, Math.min(11, st.n | 0)), o: Math.max(-2, Math.min(2, st.o | 0)), m: 'NTR'.includes(st.m) ? st.m : 'N', a: !!st.a, s: !!st.s }));
function soundSnap() { return { params: clone(state.params), bend: clone(state.bend), br: clone(state.br), fx: clone(state.fx), strip: clone(state.strip) }; }
function patternSnap() { return { steps: clone(state.steps), s101: clone(state.s101 || []) }; }
function projectSnap() { storeSlot(); return { sound: soundSnap(), pattern: patternSnap(), bpm: state.bpm, slots: clone(state.slots), slot: state.slot, chain: [...state.chain] }; }
function applySound(x) {
  if (!x || typeof x !== 'object') return;
  state.params = { ...defaults, ...migrateCmp({ ...(x.params || {}) }) }; state.bend = { ...stockBend(), ...(x.bend || {}) };
  state.br = { ...(x.br || {}) }; state.fx = { ...FX_OFF(), ...(x.fx || {}) };
  for (const k in ui) ui[k](state.params[k]);
  for (const k in bui) bui[k](state.bend[k]);
  Object.values(cells).forEach(r => r()); renderFx();
  stripLoad(x.strip);   // the performance strip's eight picks (strip.js)
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
// Factory presets, in the shape of an Export all file's projectPresets ({ "Name": project, ... }): paste one in here.
// Each loads through applyPreset like a preset of your own, so anything saved before newer controls existed gets
// their defaults there. It starts with the four factory patches, exactly as PRESETS builds them.
const FACTORY_PRESETS = {
  "Acid line": {"sound":{"params":{"lfoRate":0.5,"lfoWave":0,"range":1,"tune":0.5,"vcoMod":0,"pw":0.3,"pwmSrc":1,"drift":0.25,"saw":0.85,"pulse":0,"sub":0.25,"noise":0,"subType":0,"cutoff":0.3,"reso":0.8,"vcfEnv":0.6,"vcfMod":0,"kybd":0.5,"drive":0.55,"accVcf":0.45,"attack":0,"decay":0.38,"sustain":0,"release":0.22,"trig":0,"vcaMode":0,"level":0.7,"glide":0.3,"glideMode":1,"slide":0.22,"accent":0.75,"bendVco":0.3,"bendVcf":0,"lfoMod":0.3,"transpose":1,"swing":0.12,"gateLen":0.5,"fldtimbre":0.5,"fldsym":0.5,"fldlevel":0.5,"drvtype":0,"dist":0.5,"filter":0.4,"ratvol":0.5,"dsdist":0.5,"dstone":0.5,"dslevel":0.5,"tsdrive":0.5,"tstone":0.5,"tslevel":0.5,"dlytime":0.7,"dlyfb":0.35,"dlylo":0.3,"dlyhi":0.55,"dlymix":0.35,"dlypp":1,"revtype":0,"lexprog":1,"lexbass":0.3,"lexmid":0.27,"lexxover":0.443,"lextreble":0.834,"lexdepth":0.5,"lexdiff":0.55,"lexpre":0.2,"lexme":0.5,"lexpitch":0.2,"lexmix":0.5,"plateprog":2,"platepre":0.2,"platedecay":0.45,"platedamp":0.6,"platebw":0.75,"platelo":0.35,"platediff":0.88,"platemod":0.5,"platemix":0.5,"sprprog":2,"sprdwell":0.4,"sprdecay":0.5,"sprtension":0.5,"sprtone":0.5,"sprlo":0.4,"sprmix":0.5,"cnvprog":0,"cnvpre":0.2,"cnvdecay":1,"cnvtone":0.7,"cnvlo":0.3,"cnvwidth":0.6666666666666666,"cnvmix":0.5,"cmpamt":0.3,"cmprel":0.5},"bend":{"ct":0.4945398173148403,"tReset":0,"rDis":0.08913683087845314,"cf0":0.42393753243288196,"cf1":0.42393753243288196,"cf2":0.42393753243288196,"cf3":0.42393753243288196,"otaOff":0.5,"fbInv":0,"ce":0.5,"envTh":0.24385633270321358,"cl":0.5,"hys":0.5294117647058824,"tempC":0.4111111111111111,"vBatt":0.6666666666666666,"rBatt":0.41470233384070704},"br":{},"fx":{"rat":false,"dly":false,"lex":false,"fold":false}},"pattern":{"steps":[{"n":0,"o":0,"m":"N","a":true,"s":false},{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":1,"m":"N","a":false,"s":true},{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":3,"o":0,"m":"N","a":true,"s":false},{"n":0,"o":0,"m":"R","a":false,"s":false},{"n":5,"o":0,"m":"N","a":false,"s":true},{"n":7,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"N","a":true,"s":false},{"n":0,"o":0,"m":"T","a":false,"s":false},{"n":10,"o":-1,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"N","a":false,"s":true},{"n":3,"o":1,"m":"N","a":true,"s":false},{"n":0,"o":1,"m":"N","a":false,"s":true},{"n":7,"o":0,"m":"N","a":false,"s":false},{"n":10,"o":0,"m":"N","a":true,"s":false}]},"bpm":126},
  "Sub bass": {"sound":{"params":{"lfoRate":0.5,"lfoWave":0,"range":0,"tune":0.5,"vcoMod":0,"pw":0.15,"pwmSrc":1,"drift":0.25,"saw":0.3,"pulse":0.55,"sub":0.85,"noise":0,"subType":0,"cutoff":0.34,"reso":0.25,"vcfEnv":0.35,"vcfMod":0,"kybd":0.5,"drive":0.6,"accVcf":0.25,"attack":0,"decay":0.45,"sustain":0.35,"release":0.2,"trig":0,"vcaMode":0,"level":0.7,"glide":0.3,"glideMode":1,"slide":0.25,"accent":0.4,"bendVco":0.3,"bendVcf":0,"lfoMod":0.3,"transpose":1,"swing":0.08,"gateLen":0.6,"fldtimbre":0.5,"fldsym":0.5,"fldlevel":0.5,"drvtype":0,"dist":0.5,"filter":0.4,"ratvol":0.5,"dsdist":0.5,"dstone":0.5,"dslevel":0.5,"tsdrive":0.5,"tstone":0.5,"tslevel":0.5,"dlytime":0.7,"dlyfb":0.35,"dlylo":0.3,"dlyhi":0.55,"dlymix":0.35,"dlypp":1,"revtype":0,"lexprog":1,"lexbass":0.3,"lexmid":0.27,"lexxover":0.443,"lextreble":0.834,"lexdepth":0.5,"lexdiff":0.55,"lexpre":0.2,"lexme":0.5,"lexpitch":0.2,"lexmix":0.5,"plateprog":2,"platepre":0.2,"platedecay":0.45,"platedamp":0.6,"platebw":0.75,"platelo":0.35,"platediff":0.88,"platemod":0.5,"platemix":0.5,"sprprog":2,"sprdwell":0.4,"sprdecay":0.5,"sprtension":0.5,"sprtone":0.5,"sprlo":0.4,"sprmix":0.5,"cnvprog":0,"cnvpre":0.2,"cnvdecay":1,"cnvtone":0.7,"cnvlo":0.3,"cnvwidth":0.6666666666666666,"cnvmix":0.5,"cmpamt":0.3,"cmprel":0.5},"bend":{"ct":0.4945398173148403,"tReset":0,"rDis":0.08913683087845314,"cf0":0.42393753243288196,"cf1":0.42393753243288196,"cf2":0.42393753243288196,"cf3":0.42393753243288196,"otaOff":0.5,"fbInv":0,"ce":0.5,"envTh":0.24385633270321358,"cl":0.5,"hys":0.5294117647058824,"tempC":0.4111111111111111,"vBatt":0.6666666666666666,"rBatt":0.41470233384070704},"br":{},"fx":{"rat":false,"dly":false,"lex":false,"fold":false}},"pattern":{"steps":[{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"R","a":false,"s":false},{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":1,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"R","a":false,"s":false},{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":10,"o":-1,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"R","a":false,"s":false},{"n":3,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"R","a":false,"s":false},{"n":0,"o":1,"m":"N","a":false,"s":true},{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":7,"o":-1,"m":"N","a":false,"s":false}]},"bpm":118},
  "PWM arp": {"sound":{"params":{"lfoRate":0.45,"lfoWave":0,"range":1,"tune":0.5,"vcoMod":0,"pw":0.7,"pwmSrc":0,"drift":0.25,"saw":0,"pulse":0.85,"sub":0.3,"noise":0,"subType":2,"cutoff":0.45,"reso":0.45,"vcfEnv":0.45,"vcfMod":0,"kybd":0.5,"drive":0.4,"accVcf":0.25,"attack":0,"decay":0.35,"sustain":0.3,"release":0.35,"trig":0,"vcaMode":0,"level":0.7,"glide":0.3,"glideMode":1,"slide":0.25,"accent":0.4,"bendVco":0.3,"bendVcf":0,"lfoMod":0.3,"transpose":1,"swing":0,"gateLen":0.45,"fldtimbre":0.5,"fldsym":0.5,"fldlevel":0.5,"drvtype":0,"dist":0.5,"filter":0.4,"ratvol":0.5,"dsdist":0.5,"dstone":0.5,"dslevel":0.5,"tsdrive":0.5,"tstone":0.5,"tslevel":0.5,"dlytime":0.7,"dlyfb":0.35,"dlylo":0.3,"dlyhi":0.55,"dlymix":0.35,"dlypp":1,"revtype":0,"lexprog":1,"lexbass":0.3,"lexmid":0.27,"lexxover":0.443,"lextreble":0.834,"lexdepth":0.5,"lexdiff":0.55,"lexpre":0.2,"lexme":0.5,"lexpitch":0.2,"lexmix":0.5,"plateprog":2,"platepre":0.2,"platedecay":0.45,"platedamp":0.6,"platebw":0.75,"platelo":0.35,"platediff":0.88,"platemod":0.5,"platemix":0.5,"sprprog":2,"sprdwell":0.4,"sprdecay":0.5,"sprtension":0.5,"sprtone":0.5,"sprlo":0.4,"sprmix":0.5,"cnvprog":0,"cnvpre":0.2,"cnvdecay":1,"cnvtone":0.7,"cnvlo":0.3,"cnvwidth":0.6666666666666666,"cnvmix":0.5,"cmpamt":0.3,"cmprel":0.5},"bend":{"ct":0.4945398173148403,"tReset":0,"rDis":0.08913683087845314,"cf0":0.42393753243288196,"cf1":0.42393753243288196,"cf2":0.42393753243288196,"cf3":0.42393753243288196,"otaOff":0.5,"fbInv":0,"ce":0.5,"envTh":0.24385633270321358,"cl":0.5,"hys":0.5294117647058824,"tempC":0.4111111111111111,"vBatt":0.6666666666666666,"rBatt":0.41470233384070704},"br":{},"fx":{"rat":false,"dly":false,"lex":false,"fold":false}},"pattern":{"steps":[{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":3,"o":0,"m":"N","a":false,"s":false},{"n":7,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":1,"m":"N","a":false,"s":false},{"n":3,"o":1,"m":"N","a":false,"s":false},{"n":7,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":1,"m":"N","a":false,"s":true},{"n":3,"o":1,"m":"N","a":false,"s":false},{"n":10,"o":-1,"m":"N","a":false,"s":false},{"n":2,"o":0,"m":"N","a":false,"s":false},{"n":5,"o":0,"m":"N","a":false,"s":false},{"n":10,"o":0,"m":"N","a":false,"s":false},{"n":2,"o":1,"m":"N","a":false,"s":false},{"n":5,"o":0,"m":"N","a":false,"s":false},{"n":10,"o":0,"m":"N","a":false,"s":true},{"n":2,"o":1,"m":"N","a":false,"s":false}]},"bpm":132},
  "Starved & bent": {"sound":{"params":{"lfoRate":0.35,"lfoWave":1,"range":1,"tune":0.5,"vcoMod":0,"pw":0.3,"pwmSrc":1,"drift":0.25,"saw":0.8,"pulse":0.3,"sub":0.4,"noise":0,"subType":0,"cutoff":0.4,"reso":0.7,"vcfEnv":0.45,"vcfMod":0,"kybd":0.4,"drive":0.6,"accVcf":0.375,"attack":0,"decay":0.4,"sustain":0.3,"release":0.3,"trig":0,"vcaMode":0,"level":0.7,"glide":0.3,"glideMode":1,"slide":0.25,"accent":0.6,"bendVco":0.3,"bendVcf":0,"lfoMod":0.3,"transpose":1,"swing":0.1,"gateLen":0.6,"fldtimbre":0.5,"fldsym":0.5,"fldlevel":0.5,"drvtype":0,"dist":0.5,"filter":0.4,"ratvol":0.5,"dsdist":0.5,"dstone":0.5,"dslevel":0.5,"tsdrive":0.5,"tstone":0.5,"tslevel":0.5,"dlytime":0.7,"dlyfb":0.35,"dlylo":0.3,"dlyhi":0.55,"dlymix":0.35,"dlypp":1,"revtype":0,"lexprog":1,"lexbass":0.3,"lexmid":0.27,"lexxover":0.443,"lextreble":0.834,"lexdepth":0.5,"lexdiff":0.55,"lexpre":0.2,"lexme":0.5,"lexpitch":0.2,"lexmix":0.5,"plateprog":2,"platepre":0.2,"platedecay":0.45,"platedamp":0.6,"platebw":0.75,"platelo":0.35,"platediff":0.88,"platemod":0.5,"platemix":0.5,"sprprog":2,"sprdwell":0.4,"sprdecay":0.5,"sprtension":0.5,"sprtone":0.5,"sprlo":0.4,"sprmix":0.5,"cnvprog":0,"cnvpre":0.2,"cnvdecay":1,"cnvtone":0.7,"cnvlo":0.3,"cnvwidth":0.6666666666666666,"cnvmix":0.5,"cmpamt":0.3,"cmprel":0.5},"bend":{"ct":0.4945398173148403,"tReset":0.5833858510646214,"rDis":0.4029549571542796,"cf0":0.42393753243288196,"cf1":0.6947217923548621,"cf2":0.42393753243288196,"cf3":0.42393753243288196,"otaOff":0.65,"fbInv":0,"ce":0.5,"envTh":0.24385633270321358,"cl":0.5,"hys":0.5294117647058824,"tempC":0.4111111111111111,"vBatt":0.28888888888888886,"rBatt":0.6962360309717192},"br":{"LFOTRI>VCOCV":0.2,"VCFOUT>VCOCV":0.55,"SAW>ENVCAP":0.3,"FINGER>VCFIN":0.3},"fx":{"rat":false,"dly":false,"lex":false,"fold":false}},"pattern":{"steps":[{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"T","a":false,"s":false},{"n":0,"o":1,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"R","a":false,"s":false},{"n":7,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"T","a":false,"s":true},{"n":0,"o":0,"m":"N","a":true,"s":false},{"n":0,"o":0,"m":"R","a":false,"s":false},{"n":3,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"T","a":false,"s":false},{"n":0,"o":1,"m":"N","a":false,"s":true},{"n":0,"o":0,"m":"N","a":false,"s":false},{"n":5,"o":0,"m":"N","a":false,"s":false},{"n":0,"o":0,"m":"T","a":false,"s":false},{"n":7,"o":0,"m":"N","a":false,"s":false},{"n":10,"o":0,"m":"N","a":false,"s":false}]},"bpm":104}
};
// the Factory folder: the four factory patches, then FACTORY_PRESETS (a same-named entry there replaces the patch)
const PROJECT_BUILTIN = {};
for (const name of Object.keys(PRESETS)) { const st = presetState(name); PROJECT_BUILTIN[name] = { sound: { params: st.params, bend: st.bend, br: st.br, fx: st.fx }, pattern: { steps: st.steps }, bpm: st.bpm }; }
for (const [name, x] of Object.entries(FACTORY_PRESETS)) if (x && typeof x === 'object') PROJECT_BUILTIN[name] = x;
const prjBar = presetBar('prj', 'projectPresets', PROJECT_BUILTIN, projectSnap, applyPreset, (taken) => NAMER(taken));
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
