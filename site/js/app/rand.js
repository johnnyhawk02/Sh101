// Shyoy: the randomiser (v0.34.0 on the stickers; v0.44.0, Johnny: "clicking shyoy randomizes the sound", the stickers
// are gone). One click on the shyoy word (or PRESET > RANDOM) = a whole new synth voice, drawn from musical ranges. Tuning, accent, the bender,
// the bend board and the bridges never change; the VCA Level is set to keep it as loud as a plain sound (below). It loads like a preset does (applySound + pushAll), so the engine
// gets nothing it doesn't already get from a preset load. Each click keeps the sound before it (20 back) for undo.
const shyoyRand = (() => {
  const U = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (w) => { let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i; return w.length - 1; };
  const chance = (p) => Math.random() < p;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  let amount = 1;   // v0.44.0: always a whole new sound (the RANDOM AMOUNT option went with the stickers)
  // a whole new sound: { f: knob targets, s: switch targets }
  function draw() {
    const f = {}, s = {};
    // VCO and source mix: one main source loud, the others sometimes; noise rare
    s.range = pick([4, 4.5, 1.5, 0]); f.pw = U(0, 0.85); s.pwmSrc = pick([3, 5, 2]);
    const src = ['saw', 'pulse', 'sub'], main = src[pick([4, 3, 3])];
    for (const k of src) f[k] = k === main ? U(0.6, 0.95) : chance(0.5) ? U(0.1, 0.7) : 0;
    f.noise = chance(0.2) ? U(0.05, 0.25) : 0; s.subType = pick([1, 1, 1]);
    // VCF
    f.cutoff = U(0.2, 0.85); f.reso = U(0, 0.9); f.vcfEnv = U(0.15, 0.85); f.kybd = U(0.2, 0.8); f.drive = U(0.2, 0.75);
    f.accVcf = chance(0.5) ? U(0, 0.5) : 0;
    // envelope, VCA, glide: a sequenced bass synth, so attack is mostly 0 and the tails lean short
    f.attack = chance(0.75) ? 0 : U(0, 0.35); f.decay = U(0.35, 0.75); f.sustain = chance(0.35) ? 0 : U(0.15, 0.7); f.release = U(0.3, 0.6);
    // v0.37.2 (Johnny: a lot of sounds are very blippy): decay 40 ms-1.2 s (was 7-500 ms), sustain on about 2 in 3,
    // release 26-330 ms; v0.36.7 (Johnny: the releases were all very short): 4 in 10 get a long tail, about 0.3-3 s, held at a level it can
    // be heard from (a release only sounds if the note is still up when the gate closes)
    if (chance(0.4)) { f.release = U(0.6, 0.87); if (f.sustain < 0.2) f.sustain = U(0.2, 0.6); }
    s.trig = pick([6, 4]); s.vcaMode = pick([8, 2]);   // v0.38.2 (Johnny): trig Gate+Trig or Gate only, never LFO
    f.glide = U(0, 0.4); s.glideMode = pick([2, 6, 2]);
    // a little movement now and then (1 in 4): vibrato or a filter wobble
    if (chance(0.25)) {
      f.lfoRate = U(0.3, 0.75); s.lfoWave = pick([4, 2, 3, 1]);
      if (chance(0.5)) { f.vcoMod = U(0.02, 0.12); f.vcfMod = 0; } else { f.vcoMod = 0; f.vcfMod = U(0.1, 0.4); }
    } else { f.vcoMod = 0; f.vcfMod = 0; }
    // the output level starts from noon each time (levelled sets it after)
    f.level = 0.7;
    return { f, s };
  }
  // ---- loudness ----
  // v0.43.2 (Johnny: "do we need the auto leveller? ... surely you can work out roughly what the level should be"):
  // a sound's loudness follows a handful of controls, so Level is worked out from them straight away, no measuring.
  // v0.61.0 (Johnny: "make sure randomiser makes sounds around -6 at most"): the formula now gives the PEAK, in dBFS
  // at Level 0.7, before the soft clipper. Fitted to 2,400 random sounds played through the engine (test/randpeak.mjs:
  // the straight pattern at 120 bpm, a key held on 8 notes from C2 to G5): within 1.2 dB typically, 3 dB for 199 in 200.
  const estDb = (p) => -21.51 + 7.04 * p.saw + 8.41 * p.pulse + 9.49 * p.sub + 0.55 * p.noise
    - 2.88 * p.saw * p.pulse - 3.67 * p.sub * p.saw - 5.81 * p.sub * p.pulse
    - 0.98 * p.reso + 7.95 * p.reso ** 2 - 0.22 * p.reso ** 3 + 26.31 * p.drive - 15.08 * p.drive ** 2 - 1.27 * p.drive * p.reso
    + 26.57 * p.cutoff - 12.31 * p.cutoff ** 2 - 13.62 * p.cutoff * p.reso + 11.43 * p.vcfEnv - 5.53 * p.vcfEnv * p.reso - 16.21 * p.cutoff * p.vcfEnv
    + 2.20 * p.decay + 0.76 * p.sustain + 0.16 * p.release + 0.24 * p.attack + 1.01 * (p.vcaMode | 0)
    - 0.13 * p.kybd - 0.43 * p.pw - 0.36 * p.range - 0.24 * p.accVcf;
  // aim 3 dB under -6 dBFS, the formula's error for 199 in 200, so a random sound peaks at -6 at most (a typical one near -9)
  const PEAK_MAX = -6, MARGIN = 3, TARGET_DB = PEAK_MAX - MARGIN;
  function levelled(snap) {
    const p = snap.params, est = estDb(p);
    p.level = Math.max(0.03, Math.min(1, 0.7 * 10 ** ((TARGET_DB - est) / 20)));
    last = { est, level: p.level };
    return snap;
  }
  let last = null, busy = false, pend = false;
  const undo = [];
  let name = '';
  const prjSel = document.getElementById('prj-preset'), nameEl = document.getElementById('prj-name');
  const curEl = () => document.querySelector('#prj-bar .pm-btn .cur');
  function load(snap) { applySound(snap); pushAll(); save(); }
  async function roll() {
    if (busy) return; busy = true; pend = true;
    try { await boot(); await roll1(); } finally { busy = false; pend = false; }
  }
  async function roll1() {
    const before = soundSnap(), entry = { snap: before, name, sel: prjSel.value }; undo.push(entry); if (undo.length > 20) undo.shift();
    const a = amount, t = draw(), p = clone(state.params);
    for (const k in t.f) p[k] = clamp(p[k] + (t.f[k] - p[k]) * a);
    for (const k in t.s) if (chance(a)) p[k] = t.s[k];
    // the musical limits hold however far it moved
    if (p.reso > 0.75) p.cutoff = Math.min(p.cutoff, 0.7);
    const m = Math.max(p.saw, p.pulse, p.sub); if (m < 0.5) { const k = ['saw', 'pulse', 'sub'].find((k) => p[k] === m); p[k] = 0.5; }
    // v0.43.4 (Johnny: "it still drops the level to 0 then fades up?"): the Level is known before the sound goes on, so
    // it goes on at that Level at once (the dip to 0 and fade up of v0.36.6-v0.43.3 were only there to hide the wait
    // while each sound was measured)
    const snap = levelled({ params: p, bend: clone(state.bend), br: clone(state.br), strip: clone(state.strip) });
    load(snap);
    // a new name from the namer, shown unsaved; SAVE stores it under that name
    name = NAMER(prjBar.user); nameEl.value = name;
    prjSel.value = ''; prjSel.dispatchEvent(new Event('sync')); const c = curEl(); if (c) c.textContent = name + ' *';
  }
  function back() {
    const u = undo.pop(); if (!u) return false;
    boot(); load(u.snap);
    name = u.name;
    prjSel.value = u.sel; prjSel.dispatchEvent(new Event('sync'));
    nameEl.value = u.name; const c = curEl(); if (c && u.name) c.textContent = u.name + ' *';
    return true;
  }
  // picking a preset starts a new history
  prjSel.addEventListener('change', () => { undo.length = 0; name = ''; });
  return {
    roll, back,
    get amount() { return amount; },
    set amount(v) { amount = clamp(v); },
    get depth() { return undo.length; },
    get last() { return last; },
    get working() { return false; },
    get spinning() { return pend; },   // from the click until the audio is running
    get reel() { return null; },
    // for tests: a whole new sound, drawn but not played
    levelled,
    sample() { const t = draw(), p = clone(state.params); Object.assign(p, t.f, t.s); return { params: p, bend: clone(state.bend), br: clone(state.br), strip: clone(state.strip) }; },
    estDb,
  };
})();
