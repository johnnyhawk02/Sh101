// Shyoy: FX page: units, the reverb slot, recorded impulse responses, the drive slot.
// ---------- UI: effects ----------
const fxrow = document.getElementById('fxrow'), fxBox = {};
for (const u of FX) {
  const el = document.createElement('section'); el.className = 'fxu'; el.setAttribute('aria-label', u.name);
  const sw = u.id === 'cmp' ? '' : `<button class="onoff" id="fx-${u.id}-on" aria-pressed="false">off</button>`;
  if (u.rv) {
    el.classList.add('rv');
    el.innerHTML = `<div class="fxh">${sw}<b>${u.name}</b><span class="rv-type" role="radiogroup" aria-label="Reverb type">` +
      REV_TYPE_NAMES.map((n, i) => `<button data-t="${i}" role="radio" aria-checked="false">${n}</button>`).join('') +
      `</span><span class="rv-lcd" id="rvLcd" aria-live="polite"></span><small>${u.sub}</small></div>` +
      `<div class="rv-progs" id="rvProgs" role="radiogroup" aria-label="Program"></div><div class="ctrls"></div><p class="rv-note" id="rvNote"></p>`;
    const c = el.querySelector('.ctrls');
    for (const it of u.items) if (it.f) { fader(it, c); c.lastElementChild.dataset.rev = it.rev; }
  } else if (u.dv) {
    el.innerHTML = `<div class="fxh">${sw}<b>${u.name}</b><span class="rv-type dv-type" role="radiogroup" aria-label="Pedal">` +
      DRV_NAMES.map((n, i) => `<button data-t="${i}" role="radio" aria-checked="false">${n}</button>`).join('') + `</span><small id="dvSub">${u.sub}</small></div><div class="ctrls"></div>`;
    const c = el.querySelector('.ctrls');
    for (const it of u.items) if (it.f) { fader(it, c); c.lastElementChild.dataset.drv = it.drv; }
    el.querySelector('.dv-type').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (!b) return; boot(); const i = +b.dataset.t; state.params.drvtype = i; post({ type: 'param', id: 'drvtype', v: FX_SW.drvtype.val(i) }); save(); drawDrv(); });
  } else {
    el.innerHTML = `<div class="fxh">${sw}<b>${u.name}</b><small>${u.sub}</small></div><div class="ctrls"></div>`;
    const c = el.querySelector('.ctrls');
    for (const it of u.items) it.dial ? dial(it, c) : it.f ? fader(it, c) : switcher(it, c);
  }
  fxrow.appendChild(el); fxBox[u.id] = el;
  const b = el.querySelector('.onoff');
  if (b) b.onclick = () => { boot(); state.fx[u.id] = !state.fx[u.id]; post({ type: 'fx', name: u.id, on: state.fx[u.id] }); renderFx(); save(); };
}
// ---------- the reverb slot: type switch, program buttons, the selected unit's faders, the note ----------
const RV_PROG = {}; for (const it of FX.find(u => u.rv).items) if (it.prog) RV_PROG[it.rev] = it;
const rvProgs = document.getElementById('rvProgs');
let rvShown = '';
function setRev(id, i) { // a type or program button: these switch at once (like the 303 app, no slewing)
  const it = FX_SW[id]; state.params[id] = i; post({ type: 'param', id, v: it.val(i) }); save(); drawRev();
}
fxBox.lex.querySelector('.rv-type').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) { boot(); setRev('revtype', +b.dataset.t); } });
rvProgs.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) { boot(); setRev(RV_PROG[REV_IDS[state.params.revtype | 0] || 'lex'].s, +b.dataset.i); } });
const LEX_CHORUS_NAMES = { lexbass: 'Pair 1', lexmid: 'Pair 2', lexxover: 'Pair 3', lextreble: 'Pair 4', lexdepth: 'Wander' };
const fdrLabel = id => document.querySelector(`label[for="f-${id}"]`);
function revNote(T, i) {
  if (T === 'lex') {
    const P = LEX_PROGS[i];
    return i === 8 ? 'Eight voices, four a side, each delay wandering at random. The first four faders are the voice-pair levels; Diffusion acts on pairs 3 and 4. 20 kHz, 12-bit gain-ranging converters, 16-bit words.'
      : `Lexicon 224 (1978): 20 kHz, 12-bit gain-ranging converters, 16-bit words in a shared 32K-word memory. Predelay ${P[1]}–${P[2]} ms on this program. Names, ranges and specs follow Lexicon; the algorithms are estimates built on Dattorro's Griesinger-style plate.`;
  }
  if (T === 'plate') return `Jon Dattorro's published plate (JAES 1997): four input diffusers into a figure-eight tank with modulated allpasses. ${PLATE_PROGS[i][1]}: every delay scaled ×${PLATE_PROGS[i][2]}. Damping is the high cut inside the tank, Bandwidth the one before it.`;
  if (T === 'spring') return `A dispersive spring model after Välimäki, Parker and Abel (JAES 2010): each spring is a delay loop through ${SPRING_STAGES_UI} stretched allpasses, so every echo smears into the falling drip. ${SPRING_PROGS[i][1]}, transit ${SPRING_PROGS[i][2].join(' / ')} ms. Dwell drives the tank, Tension lengthens the chirp.`;
  const P = CNV_PROGS[i];
  if (P[2]) {
    const m = irMeta && irMeta.irs.find(x => x.id === P[2]);
    return (m ? `${m.character} ${m.credit}, ${m.licence}. ` : irFailed ? 'The impulse responses could not be loaded. ' : 'Recorded impulse response; it loads when audio starts. ') +
      'Length trims the response (full at the top). Partitioned FFT convolution, one 512-sample block late, which is the shortest predelay.';
  }
  return `Partitioned FFT convolution with a generated impulse response: seeded noise with the highs dying first${P[4] ? ', a build-up and early reflections' : ''}. ${P[3] ? 'Decay sets the gate length. ' : ''}The wet signal is one 512-sample block late, which is the shortest predelay.`;
}
function drawRev() {
  const t = Math.max(0, Math.min(3, state.params.revtype | 0)), T = REV_IDS[t], pit = RV_PROG[T], n = pit.opts.length;
  const sel = Math.max(0, Math.min(n - 1, state.params[pit.s] | 0));
  for (const b of fxBox.lex.querySelectorAll('.rv-type button')) b.setAttribute('aria-checked', +b.dataset.t === t);
  if (rvShown !== T) {
    rvShown = T;
    rvProgs.style.setProperty('--n', n);
    const full = T === 'lex' ? LEX_PROGS.map(p => p[3]) : T === 'plate' ? PLATE_PROGS.map(p => p[1]) : T === 'spring' ? SPRING_PROGS.map(p => p[1]) : CNV_PROGS.map(p => p[1]);
    rvProgs.innerHTML = pit.opts.map((o, i) => `<button data-i="${i}" role="radio" aria-checked="false" aria-label="${i + 1} ${full[i]}"><b>${i + 1}</b>${o}</button>`).join('');
    for (const f of fxBox.lex.querySelectorAll('.fdr[data-rev]')) f.hidden = f.dataset.rev !== T;
  }
  for (const b of rvProgs.children) b.setAttribute('aria-checked', +b.dataset.i === sel);
  const lcd = T === 'lex' ? `P${sel + 1} ${LEX_PROGS[sel][3]}` : `${sel + 1} ${(T === 'plate' ? PLATE_PROGS : T === 'spring' ? SPRING_PROGS : CNV_PROGS)[sel][1]}`;
  document.getElementById('rvLcd').textContent = lcd.toUpperCase();
  if (T === 'lex') for (const id in LEX_CHORUS_NAMES) fdrLabel(id).textContent = (sel === 8 ? LEX_CHORUS_NAMES[id] : FX.find(u => u.rv).items.find(x => x.f === id).label).toLowerCase();
  if (T === 'conv') { fdrLabel('cnvdecay').textContent = CNV_PROGS[sel][3] ? 'gate' : CNV_PROGS[sel][2] ? 'length' : 'decay'; if (!irFailed) { loadIRMeta(); loadIRs(); } }
  for (const it of FX.find(u => u.rv).items) if (it.f && it.rev === T) ui[it.f](state.params[it.f]); // readouts that depend on the program
  document.getElementById('rvNote').textContent = revNote(T, sel);
}
// recorded impulse responses for Conv (irs/irs.json, from the 303 app): the list loads when Conv is shown, the samples once
// audio is running, decoded at the audio rate here and handed to the engine
let irMeta = null, irFailed = false, irMetaP = null, irSentTo = null;
function loadIRMeta() {
  irMetaP ||= fetch('irs/irs.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(m => { irMeta = m; drawRev(); return m; }).catch(() => { irFailed = true; irMetaP = null; drawRev(); return null; });
  return irMetaP;
}
async function loadIRs() {
  if (!ctx || !node || irSentTo === ctx) return; irSentTo = ctx;
  const m = await loadIRMeta(); if (!m) { irSentTo = null; return; }
  for (const ir of m.irs) {
    try {
      const buf = await ctx.decodeAudioData(await (await fetch('irs/' + ir.file)).arrayBuffer());
      const L = buf.getChannelData(0).slice(), R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
      node.port.postMessage({ type: 'ir', id: ir.id, L, R }, [L.buffer, R.buffer]);
    } catch (e) { console.warn('IR', ir.id, e && e.message); }
  }
}
for (const id of ['revtype', 'lexprog', 'plateprog', 'sprprog', 'cnvprog']) ui[id] = () => drawRev(); // preset loads redraw the slot
// the drive slot: the pedal switch shows that pedal's three faders and its circuit in the strip
function drawDrv() {
  const t = Math.max(0, Math.min(2, state.params.drvtype | 0)), T = DRV_IDS[t];
  for (const b of fxBox.rat.querySelectorAll('.dv-type button')) b.setAttribute('aria-checked', +b.dataset.t === t);
  for (const f of fxBox.rat.querySelectorAll('.fdr[data-drv]')) f.hidden = f.dataset.drv !== T;
  document.getElementById('dvSub').textContent = DRV_SUBS[t];
}
ui.drvtype = () => drawDrv();
function renderFx() {
  for (const n of ['rat', 'dly', 'lex', 'fold']) { const b = document.getElementById(`fx-${n}-on`); b.setAttribute('aria-pressed', !!state.fx[n]); b.textContent = state.fx[n] ? 'on' : 'off'; fxBox[n].classList.toggle('on', !!state.fx[n]); }
  fxBox.cmp.classList.toggle('on', !!(state.fx.dly || state.fx.lex));
}
renderFx(); drawRev(); drawDrv();
