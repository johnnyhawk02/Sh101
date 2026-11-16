// Shyoy: the sticker randomiser (v0.34.0, Johnny: clicking a sticker randomises the sound; every sticker does the same).
// One click = a new synth voice and a new FX chain, drawn from musical ranges, at the RANDOM AMOUNT set in
// OPTIONS > STICKERS (0 = no change, 1 = a whole new sound; in between each knob moves that far towards its new value
// and each switch flips with that chance). Volume, tuning, accent, tempo, the sequence, the Compactor, the bender,
// the bend board and the bridges never change. It loads like a preset does (applySound + pushAll), so the engine
// gets nothing it doesn't already get from a preset load. Each click keeps the sound before it (20 back) for undo.
const shyoyRand = (() => {
  const U = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (w) => { let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i; return w.length - 1; };
  const chance = (p) => Math.random() < p;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  let amount = clamp(store.get('rndAmount', 1));
  // a whole new sound: { f: knob targets, s: switch targets, fx: units on }
  function draw() {
    const f = {}, s = {};
    // VCO and source mix: one main source loud, the others sometimes; noise rare
    s.range = pick([4, 4.5, 1.5, 0]); f.pw = U(0, 0.85); s.pwmSrc = pick([3, 5, 2]);
    const src = ['saw', 'pulse', 'sub'], main = src[pick([4, 3, 3])];
    for (const k of src) f[k] = k === main ? U(0.6, 0.95) : chance(0.5) ? U(0.1, 0.7) : 0;
    f.noise = chance(0.2) ? U(0.05, 0.25) : 0; s.subType = pick([1, 1, 1]); f.drift = U(0, 0.3);
    // VCF
    f.cutoff = U(0.2, 0.85); f.reso = U(0, 0.9); f.vcfEnv = U(0.15, 0.85); f.kybd = U(0.2, 0.8); f.drive = U(0.2, 0.75);
    f.accVcf = chance(0.5) ? U(0, 0.5) : 0;
    // envelope, VCA, glide: a sequenced bass synth, so attack is mostly 0 and the tails lean short
    f.attack = chance(0.75) ? 0 : U(0, 0.35); f.decay = U(0.15, 0.65); f.sustain = chance(0.5) ? 0 : U(0.1, 0.7); f.release = U(0.1, 0.5);
    s.trig = pick([6, 3, 1]); s.vcaMode = pick([8, 2]);
    f.glide = U(0, 0.4); s.glideMode = pick([2, 6, 2]); f.slide = U(0.1, 0.5);
    // a little movement now and then (1 in 4): vibrato or a filter wobble
    if (chance(0.25)) {
      f.lfoRate = U(0.3, 0.75); s.lfoWave = pick([4, 2, 3, 1]);
      if (chance(0.5)) { f.vcoMod = U(0.02, 0.12); f.vcfMod = 0; } else { f.vcoMod = 0; f.vcfMod = U(0.1, 0.4); }
    } else { f.vcoMod = 0; f.vcfMod = 0; }
    // FX: one to three units, never folder + drive + flanger together
    const fx = FX_OFF(), W = { fold: 2, rat: 4, flg: 2.5, dly: 5, lex: 5 };
    for (const u of FX_UNITS) fx[u] = chance(W[u] / 10);
    let on = FX_UNITS.filter((u) => fx[u]);
    while (on.length > 3 || (fx.fold && fx.rat && fx.flg)) { const u = on[Math.floor(Math.random() * on.length)]; fx[u] = false; on = on.filter((x) => x !== u); }
    if (!on.length) fx[['dly', 'lex', 'rat'][pick([4, 4, 2])]] = true;
    f.fldtimbre = U(0.1, 0.7); f.fldsym = U(0.3, 0.7);
    s.drvtype = pick([1, 1, 1]); f.dist = U(0.2, 0.8); f.filter = U(0.2, 0.7); f.dsdist = U(0.2, 0.8); f.dstone = U(0.3, 0.7);
    f.tsdrive = U(0.2, 0.8); f.tstone = U(0.3, 0.7); f.drvmix = U(0.4, 1);
    s.flgmode = pick([1, 1]); f.flgman = U(0.2, 0.8); f.flgdep = U(0.2, 0.8); f.flgrate = U(0, 0.6); f.flgres = U(0.2, 0.8);
    f.dlytime = [2, 5, 7, 8][pick([2, 4, 3, 2])] / 10; f.dlyfb = U(0.15, 0.6); f.dlylo = U(0.1, 0.5); f.dlyhi = U(0.3, 0.8); f.dlymix = U(0.15, 0.45); s.dlypp = pick([1, 1]);
    s.revtype = pick([3, 3, 2, 3]);
    for (const it of FX.find((u) => u.rv).items) {
      if (it.prog) s[it.s] = Math.floor(Math.random() * it.opts.length);
      else if (it.f) f[it.f] = /mix$/.test(it.f) ? U(0.15, 0.45) : U(0.2, 0.8);
    }
    s.fxorder = pick([1, 1]); s.fxret = pick([5, 3, 2]);
    return { f, s, fx };
  }
  const undo = [];
  let name = '';
  const prjSel = document.getElementById('prj-preset'), nameEl = document.getElementById('prj-name');
  const curEl = () => document.querySelector('#prj-bar .pm-btn .cur');
  function load(snap) { applySound(snap); pushAll(); save(); }
  function roll() {
    boot();
    const before = soundSnap(); undo.push({ snap: before, name, sel: prjSel.value, label: (curEl() || {}).textContent || '' }); if (undo.length > 20) undo.shift();
    const a = amount, t = draw(), p = clone(state.params);
    for (const k in t.f) p[k] = clamp(p[k] + (t.f[k] - p[k]) * a);
    for (const k in t.s) if (chance(a)) p[k] = t.s[k];
    const fx = { ...state.fx }; for (const u of FX_UNITS) if (chance(a)) fx[u] = t.fx[u];
    // the musical limits hold however far it moved
    if (p.reso > 0.75) p.cutoff = Math.min(p.cutoff, 0.7);
    const m = Math.max(p.saw, p.pulse, p.sub); if (m < 0.5) { const k = ['saw', 'pulse', 'sub'].find((k) => p[k] === m); p[k] = 0.5; }
    load({ params: p, bend: clone(state.bend), br: clone(state.br), fx, strip: clone(state.strip) });
    // a new name from the namer, shown unsaved; SAVE stores it under that name
    name = NAMER(prjBar.user); nameEl.value = name;
    prjSel.value = ''; prjSel.dispatchEvent(new Event('sync')); const c = curEl(); if (c) c.textContent = name + ' *';
  }
  function back() {
    const u = undo.pop(); if (!u) return false;
    boot(); load(u.snap); name = u.name;
    prjSel.value = u.sel; prjSel.dispatchEvent(new Event('sync'));
    nameEl.value = u.name; const c = curEl(); if (c && u.name) c.textContent = u.name + ' *';
    return true;
  }
  // picking a preset starts a new history
  prjSel.addEventListener('change', () => { undo.length = 0; name = ''; });
  return {
    roll, back,
    get amount() { return amount; },
    set amount(v) { amount = clamp(v); store.set('rndAmount', amount); },
    get depth() { return undo.length; },
  };
})();
