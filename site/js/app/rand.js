// Shyoy: the sticker randomiser (v0.34.0, Johnny: clicking a sticker randomises the sound; every sticker does the same).
// One click = a new synth voice, drawn from musical ranges, at the RANDOM AMOUNT set in
// OPTIONS > STICKERS (0 = no change, 1 = a whole new sound; in between each knob moves that far towards its new value
// and each switch flips with that chance). Tuning, accent, tempo, the sequence, the bender,
// the bend board and the bridges never change; the VCA Level is set to keep it as loud as a plain sound (below). It loads like a preset does (applySound + pushAll), so the engine
// gets nothing it doesn't already get from a preset load. Each click keeps the sound before it (20 back) for undo.
const shyoyRand = (() => {
  const U = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (w) => { let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i; return w.length - 1; };
  const chance = (p) => Math.random() < p;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  let amount = clamp(store.get('rndAmount', 1));
  // a whole new sound: { f: knob targets, s: switch targets }
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
    f.attack = chance(0.75) ? 0 : U(0, 0.35); f.decay = U(0.35, 0.75); f.sustain = chance(0.35) ? 0 : U(0.15, 0.7); f.release = U(0.3, 0.6);
    // v0.37.2 (Johnny: a lot of sounds are very blippy): decay 40 ms-1.2 s (was 7-500 ms), sustain on about 2 in 3,
    // release 26-330 ms; v0.36.7 (Johnny: the releases were all very short): 4 in 10 get a long tail, about 0.3-3 s, held at a level it can
    // be heard from (a release only sounds if the note is still up when the gate closes)
    if (chance(0.4)) { f.release = U(0.6, 0.87); if (f.sustain < 0.2) f.sustain = U(0.2, 0.6); }
    s.trig = pick([6, 4]); s.vcaMode = pick([8, 2]);   // v0.38.2 (Johnny): trig Gate+Trig or Gate only, never LFO
    f.glide = U(0, 0.4); s.glideMode = pick([2, 6, 2]); f.slide = U(0.1, 0.5);
    // a little movement now and then (1 in 4): vibrato or a filter wobble
    if (chance(0.25)) {
      f.lfoRate = U(0.3, 0.75); s.lfoWave = pick([4, 2, 3, 1]);
      if (chance(0.5)) { f.vcoMod = U(0.02, 0.12); f.vcfMod = 0; } else { f.vcoMod = 0; f.vcfMod = U(0.1, 0.4); }
    } else { f.vcoMod = 0; f.vcfMod = 0; }
    // the output level starts from noon each time (levelled sets it after)
    f.level = 0.7;
    return { f, s };
  }
  // ---- loudness (v0.34.1, Johnny: randomised sounds came out very loud) ----
  // Before a new sound goes on, a copy of the engine (the same worklet code, run in a Web Worker, so the page doesn't
  // stall and nothing is heard) plays the current pattern with it for 2 s, and with a plain reference sound. The VCA
  // sound's output is then trimmed to match the reference (see levelled). The live engine is not changed; it only gets
  // the finished sound, as from a preset.
  const REF = { saw: 0.8, pulse: 0, sub: 0.4, noise: 0, range: 1, cutoff: 0.35, reso: 0.6, vcfEnv: 0.5, drive: 0.4, decay: 0.4, sustain: 0, release: 0.3, attack: 0, level: 0.7 };
  const TRIMS = ['level'];
  let worker = null, jobs = 0; const waiting = new Map();
  async function meterWorker() {
    if (worker) return worker;
    const code = await dspCode;
    const src = `let Proc; class AudioWorkletProcessor { constructor() { this.port = { postMessage() {}, onmessage: null }; } }
const registerProcessor = (_, c) => { Proc = c; }; const sampleRate = 48000;
${code}
onmessage = (e) => { const { id, msgs, sec } = e.data; const out = [];
  for (const ms of msgs) {
    const p = new Proc(); for (const m of ms) p.onMsg(m);
    const L = new Float32Array(128), R = new Float32Array(128), n = Math.floor(48000 * sec / 128), skip = Math.floor(48000 * 0.3 / 128);
    let ss = 0, cnt = 0, pk = 0;
    for (let b = 0; b < n; b++) { p.process([], [[L, R]]); if (b < skip) continue; for (let j = 0; j < 128; j++) { const v = (L[j] + R[j]) / 2; ss += v * v; const a = Math.max(Math.abs(L[j]), Math.abs(R[j])); if (a > pk) pk = a; } cnt += 128; }
    out.push({ rms: Math.sqrt(ss / Math.max(1, cnt)), peak: pk });
  }
  postMessage({ id, out }); };`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
    worker.onmessage = (e) => { const r = waiting.get(e.data.id); if (r) { waiting.delete(e.data.id); r(e.data.out); } };
    return worker;
  }
  // what the engine is sent for a sound, then the pattern, then Run (as pushAll + Play do)
  const msgsFor = (snap, seq) => [{ type: 'params', p: snap.params }, { type: 'bend', b: bendPhysical(snap.bend) }, { type: 'bridges', br: snap.br }, seq, { type: 'run', on: true }];
  async function meter(snaps) {
    const w = await meterWorker(), id = ++jobs;
    // the current pattern; an empty one gets a plain eighth-note riff so there is something to hear
    let seq = seqMsg(); if (!seq.seq.steps.some((st) => st.m === 'N')) seq = { type: 'seq', seq: { ...seq.seq, steps: Array.from({ length: 16 }, (_, i) => ({ n: [0, 0, 7, 0, 3, 0, 10, 5][i % 8], o: 0, m: i % 2 ? 'R' : 'N', a: i % 4 === 0, s: false })), length: 16 } };
    return new Promise((res) => { waiting.set(id, res); w.postMessage({ id, sec: 2, msgs: snaps.map((s) => msgsFor(s, seq)) }); });
  }
  // the reference: a plain saw + sub patch, played with the same pattern, tempo, transpose and accent
  const refSnap = () => { const q = state.params, p = { ...defaults, ...REF, transpose: q.transpose, tune: q.tune, accent: q.accent, swing: q.swing, gateLen: q.gateLen }; return { params: p, bend: stockBend(), br: {} }; };
  const dB = (r) => 20 * Math.log10(Math.max(1e-6, r));
  // the VCA Level (0.1-1) moves, found by halving (six tries at most, stopping within 1 dB)
  async function trim(snap, knob, lo, hi, ref, m) {
    const p = snap.params; let best = { e: dB(ref.rms / m.rms), v: p[knob], m };
    if (Math.abs(best.e) < 1) return best;
    let L = lo, H = hi; if (best.e < 0) H = p[knob]; else L = p[knob];
    for (let i = 0; i < 6; i++) {
      const v = (L + H) / 2; p[knob] = v; const [r] = await meter([snap]); const e = dB(ref.rms / Math.max(1e-9, r.rms));
      if (Math.abs(e) < Math.abs(best.e)) best = { e, v, m: r };
      if (Math.abs(e) < 1) break; if (e < 0) H = v; else L = v;
    }
    p[knob] = best.v; return best;
  }
  async function levelled(snap) {
    try {
      const [ref, first] = await meter([refSnap(), snap]);
      if (ref.rms < 1e-4 || first.rms < 1e-5) return snap;
      let r = { e: dB(ref.rms / first.rms), m: first };
      if (Math.abs(r.e) >= 1.5) r = await trim(snap, 'level', 0.1, 1, ref, r.m);
      last = { ref: dB(ref.rms), got: dB(first.rms), now: dB(r.m.rms), level: snap.params.level };
    } catch (e) { console.warn('sticker loudness', e); }
    return snap;
  }
  // the fade (Johnny: fade low, then bring it up): the new sound goes on with Level at 0 while it is measured, then
  // Level rises to the matched value
  let fadeTok = 0, curP = null, reel = [], reelTok = 0, pend = false;
  const hush = () => { post({ type: 'param', id: 'level', v: 0 }); return new Promise((r) => setTimeout(r, 90)); };
  function fadeTo(tok, id, to) {
    const from = state.params[id], t0 = performance.now(), T = 700;
    const step = () => {
      if (tok !== fadeTok) return;
      const u = Math.min(1, (performance.now() - t0) / T), v = from + (to - from) * u * u;
      state.params[id] = v; post({ type: 'param', id, v });
      if (u < 1) setTimeout(step, 25); else { if (ui[id]) ui[id](to); save(); }
    };
    step();
  }
  let last = null, busy = false;
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
    // clicked again before the last sound finished fading in: its undo copy gets the level it was heading for
    if (curP) curP.then((f) => { for (const q of TRIMS) before.params[q] = f.params[q]; });
    const a = amount, t = draw(), p = clone(state.params);
    for (const k in t.f) p[k] = clamp(p[k] + (t.f[k] - p[k]) * a);
    for (const k in t.s) if (chance(a)) p[k] = t.s[k];
    // the musical limits hold however far it moved
    if (p.reso > 0.75) p.cutoff = Math.min(p.cutoff, 0.7);
    const m = Math.max(p.saw, p.pulse, p.sub); if (m < 0.5) { const k = ['saw', 'pulse', 'sub'].find((k) => p[k] === m); p[k] = 0.5; }
    const snap = { params: p, bend: clone(state.bend), br: clone(state.br), strip: clone(state.strip) }, tok = ++fadeTok;
    // v0.36.6 (Johnny: loud blips before the volume changes): the engine glides the VCA Level over ~10 ms but switches
    // change at once, so the old sound is first taken to silence, and only then does the new one go on, still at Level 0,
    // and Level fades up
    const trim = 'level'; await hush(); if (tok !== fadeTok) return;
    load({ ...snap, params: { ...p, level: 0 } });
    // a new name from the namer, shown unsaved; SAVE stores it under that name
    name = NAMER(prjBar.user); nameEl.value = name;
    prjSel.value = ''; prjSel.dispatchEvent(new Event('sync')); const c = curEl(); if (c) c.textContent = name + ' *';
    // while it is measured the PRESET display runs names past like a slot machine (v0.36.5, Johnny: show something is
    // going on); view3d.js reads shyoyRand.reel and spins the sticker while shyoyRand.working
    reel = [name, ...Array.from({ length: 11 }, () => NAMER(prjBar.user))]; reelTok = tok; pend = false;
    busy = false;   // a new click may start now; this one's fade is dropped if so
    const P = curP = levelled(clone(snap)), fin = await P; if (curP === P) curP = null; if (tok !== fadeTok) return;
    reelTok = 0;
    for (const q of TRIMS) if (q !== trim && fin.params[q] !== state.params[q]) { state.params[q] = fin.params[q]; post({ type: 'param', id: q, v: fin.params[q] }); if (ui[q]) ui[q](fin.params[q]); }
    fadeTo(tok, trim, fin.params[trim]);
  }
  function back() {
    const u = undo.pop(); if (!u) return false;
    const tok = ++fadeTok; curP = null; boot(); const lv = u.snap.params.level;
    hush().then(() => { if (tok !== fadeTok) return; load({ ...u.snap, params: { ...u.snap.params, level: 0 } }); fadeTo(tok, 'level', lv); });
    name = u.name;
    prjSel.value = u.sel; prjSel.dispatchEvent(new Event('sync'));
    nameEl.value = u.name; const c = curEl(); if (c && u.name) c.textContent = u.name + ' *';
    return true;
  }
  // picking a preset starts a new history
  prjSel.addEventListener('change', () => { undo.length = 0; name = ''; fadeTok++; });
  return {
    roll, back,
    get amount() { return amount; },
    set amount(v) { amount = clamp(v); store.set('rndAmount', amount); },
    get depth() { return undo.length; },
    get last() { return last; }, meter,
    get working() { return reelTok !== 0 && reelTok === fadeTok; },
    get spinning() { return pend || this.working; },   // from the click (audio may still be starting) to the fade
    get reel() { return this.working ? reel[Math.floor(performance.now() / 85) % reel.length] : null; },
    // for tests: a whole new sound, drawn but not played
    sample() { const t = draw(), p = clone(state.params); Object.assign(p, t.f, t.s); return { params: p, bend: clone(state.bend), br: clone(state.br), strip: clone(state.strip) }; },
    refSnap,
  };
})();
