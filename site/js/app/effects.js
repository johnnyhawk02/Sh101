// Shyoy: FX page: units, the reverb slot, recorded impulse responses, the drive slot.
// ---------- UI: effects ----------
// Laid out like the TB-303 app's FX page (Johnny): three bands with no boxes (folder, drive, delay, compactor; the reverb
// and the flanger; the routing strip), each unit a one-row header on the glass (On / Off, its name, its own selectors) over
// one row of dials. The pedal, the reverb type and its program are picked from dropdown menus.
const fxrow = document.getElementById('fxrow'), fxBox = {};
const fxRows = [0, 1].map(i => { const r = document.createElement('div'); r.className = 'fxr fxr' + i; fxrow.appendChild(r); return r; });
// a small segmented switch in a unit's header (delay mode, flanger mode)
const fxSeg = (cls, label, names) => `<span class="fx-seg ${cls}" role="radiogroup" aria-label="${label}">` +
  names.map((n, i) => `<button type="button" data-t="${i}" role="radio" aria-checked="false">${n}</button>`).join('') + `</span>`;
const fxName = (u) => `<span class="fxname">${u.name.toLowerCase()}</span>`;
for (const u of FX) {
  const el = document.createElement('section'); el.className = 'fxu fx-' + u.id; el.setAttribute('aria-label', u.name);
  const sw = u.id === 'cmp' ? '' : `<button type="button" class="onoff" id="fx-${u.id}-on" aria-pressed="false">Off</button>`;
  let head = fxName(u);
  if (u.rv) { el.classList.add('rv'); head += `<div class="rmenu tmenu" id="rev-type" data-label="Reverb type"></div><div class="rmenu tmenu" id="rev-prog" data-label="Program"></div>`; }
  else if (u.dv) head += `<div class="rmenu tmenu" id="drv-type" data-label="Drive pedal"></div>`;
  else if (u.id === 'dly') head += fxSeg('dly-mode', 'Delay mode', FX_SW.dlypp.opts);
  else if (u.fg) { el.classList.add('fg'); head = fxSeg('fg-mode', 'Flanger mode', FLG_MODE_NAMES); }
  el.innerHTML = `<div class="fxh">${sw}${head}</div><div class="ctrls"></div>`;
  const c = el.querySelector('.ctrls');
  for (const it of u.items) if (it.f) { // every continuous control is a dial; the switches live in the header
    dial(it, c); const d = c.lastElementChild;
    if (it.rev) d.dataset.rev = it.rev; if (it.drv) d.dataset.drv = it.drv;
  }
  fxRows[u.rv || u.fg ? 1 : 0].appendChild(el); fxBox[u.id] = el; // the reverb and the flanger share the second row
  const b = el.querySelector('.onoff');
  if (b) b.onclick = () => { boot(); state.fx[u.id] = !state.fx[u.id]; post({ type: 'fx', name: u.id, on: state.fx[u.id] }); renderFx(); save(); };
}
// a switch stored as an index and sent as 0..1, as the old button rows did
function setFxSw(id, i) { const it = FX_SW[id]; state.params[id] = i; post({ type: 'param', id, v: it.val(i) }); save(); }
// ---------- type menus (the 303 app's drawTypeMenu): a button showing the current choice and ▾, a menu below it with
// a ✓ by the current one. Arrow keys move, Enter picks, Escape or a click outside closes. Picking switches at once.
function typeMenu(el, pick) {
  el.innerHTML = `<button type="button" class="rm-btn" aria-haspopup="menu" aria-expanded="false" aria-label="${el.dataset.label}"></button><div class="fn-menu" role="menu" hidden></div>`;
  const btn = el.firstElementChild, menu = el.lastElementChild;
  const open = (on) => {
    menu.hidden = !on; btn.setAttribute('aria-expanded', on);
    if (on) (menu.querySelector('[aria-checked=true]') || menu.querySelector('button')).focus();
  };
  btn.onclick = () => { for (const m of document.querySelectorAll('.tmenu .fn-menu:not([hidden])')) if (m !== menu) m.parentElement.firstElementChild.click(); open(menu.hidden); };
  menu.addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (!b) return; open(false); boot(); pick(+b.dataset.t); btn.focus(); });
  menu.addEventListener('keydown', (e) => {
    const bs = [...menu.querySelectorAll('button')], j = bs.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open(false); btn.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); bs[(j + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !el.contains(e.target)) open(false); });
}
function setTypeItems(el, names) {
  el.lastElementChild.innerHTML = names.map((n, i) => `<button type="button" role="menuitemradio" aria-checked="false" data-t="${i}">${n}</button>`).join('');
}
function drawTypeMenu(el, t) {
  const items = el.querySelectorAll('.fn-menu button');
  for (const b of items) b.setAttribute('aria-checked', +b.dataset.t === t);
  if (items[t]) el.firstElementChild.textContent = items[t].textContent;
}
// ---------- the reverb slot: type and program menus, the selected unit's dials ----------
const RV_PROG = {}; for (const it of FX.find(u => u.rv).items) if (it.prog) RV_PROG[it.rev] = it;
const revTypeEl = document.getElementById('rev-type'), revProgEl = document.getElementById('rev-prog');
let rvShown = '';
function setRev(id, i) { setFxSw(id, i); drawRev(); } // a type or program: these switch at once (like the 303 app, no slewing)
typeMenu(revTypeEl, (i) => setRev('revtype', i)); setTypeItems(revTypeEl, REV_TYPE_NAMES);
typeMenu(revProgEl, (i) => setRev(RV_PROG[REV_IDS[state.params.revtype | 0] || 'lex'].s, i));
const LEX_CHORUS_NAMES = { lexbass: 'Pair 1', lexmid: 'Pair 2', lexxover: 'Pair 3', lextreble: 'Pair 4', lexdepth: 'Wander' };
const fdrLabel = id => document.querySelector(`label[for="f-${id}"]`);
function drawRev() {
  const t = Math.max(0, Math.min(3, state.params.revtype | 0)), T = REV_IDS[t], pit = RV_PROG[T], n = pit.opts.length;
  const sel = Math.max(0, Math.min(n - 1, state.params[pit.s] | 0));
  drawTypeMenu(revTypeEl, t);
  if (rvShown !== T) {
    rvShown = T;
    const full = T === 'lex' ? LEX_PROGS.map(p => p[3]) : T === 'plate' ? PLATE_PROGS.map(p => p[1]) : T === 'spring' ? SPRING_PROGS.map(p => p[1]) : CNV_PROGS.map(p => p[1]);
    setTypeItems(revProgEl, full.map((f, i) => `${T === 'lex' ? 'P' : ''}${i + 1} ${f}`));
    for (const d of fxBox.lex.querySelectorAll('.dial[data-rev]')) d.hidden = d.dataset.rev !== T;
  }
  drawTypeMenu(revProgEl, sel);
  if (T === 'lex') for (const id in LEX_CHORUS_NAMES) fdrLabel(id).textContent = (sel === 8 ? LEX_CHORUS_NAMES[id] : FX.find(u => u.rv).items.find(x => x.f === id).label).toLowerCase();
  if (T === 'conv') { fdrLabel('cnvdecay').textContent = CNV_PROGS[sel][3] ? 'gate' : CNV_PROGS[sel][2] ? 'length' : 'decay'; if (!irFailed) { loadIRMeta(); loadIRs(); } }
  for (const it of FX.find(u => u.rv).items) if (it.f && it.rev === T) ui[it.f](state.params[it.f]); // readouts that depend on the program
  drawRoute();
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
// the drive slot: the pedal menu shows that pedal's three dials and its circuit in the strip
const drvTypeEl = document.getElementById('drv-type');
typeMenu(drvTypeEl, (i) => { setFxSw('drvtype', i); drawDrv(); }); setTypeItems(drvTypeEl, DRV_NAMES);
function drawDrv() {
  const t = Math.max(0, Math.min(2, state.params.drvtype | 0)), T = DRV_IDS[t];
  drawTypeMenu(drvTypeEl, t);
  for (const d of fxBox.rat.querySelectorAll('.dial[data-drv]')) d.hidden = d.dataset.drv !== T;
  drawRoute();
}
ui.drvtype = () => drawDrv();
// the flanger's mode: Flanger or Chorus; chorus has no feedback, so Res dims, and Manual reads the chorus delay
const fgModeEl = fxBox.flg.querySelector('.fg-mode');
fgModeEl.addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (!b) return; boot(); setFxSw('flgmode', +b.dataset.t); drawFlg(); });
function drawFlg() {
  const m = (state.params.flgmode | 0) ? 1 : 0;
  for (const b of fgModeEl.children) b.setAttribute('aria-checked', +b.dataset.t === m);
  document.getElementById('f-flgres').closest('.dial').classList.toggle('dim', m === 1);
  ui.flgman(state.params.flgman);
  drawRoute();
}
// the delay's mode: Mono or Ping-pong
const dlyModeEl = fxBox.dly.querySelector('.dly-mode');
dlyModeEl.addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (!b) return; boot(); setFxSw('dlypp', +b.dataset.t); drawDly(); });
function drawDly() { const m = (state.params.dlypp | 0) ? 1 : 0; for (const b of dlyModeEl.children) b.setAttribute('aria-checked', +b.dataset.t === m); }
ui.dlypp = () => drawDly();
ui.flgmode = () => drawFlg();
function renderFx() {
  for (const n of FX_UNITS) { const b = document.getElementById(`fx-${n}-on`); b.setAttribute('aria-pressed', !!state.fx[n]); b.textContent = state.fx[n] ? 'On' : 'Off'; fxBox[n].classList.toggle('on', !!state.fx[n]); }
  fxBox.cmp.classList.toggle('on', !!(state.fx.dly || state.fx.lex));
  drawRoute();
}
// ---------- routing: a block diagram of the signal path, and the two switches that change it (the 303 app's strip) ----------
// Click a block (or Enter / Space on it) to switch that unit on or off: it clicks the unit's own on/off button.
const routeEl = document.createElement('section'); routeEl.className = 'fx-route'; routeEl.setAttribute('aria-label', 'FX routing');
routeEl.innerHTML = `<svg class="route-dia" id="routeDia" viewBox="0 0 586 64" role="group" aria-label="Signal path through the effects"></svg><div class="route-ctl"></div>`;
document.getElementById('pan-fx').appendChild(routeEl);
const routeDia = routeEl.querySelector('.route-dia'), routeSegs = {};
for (const it of FX_ROUTE) {
  const g = document.createElement('div'); g.className = 'lcd-seg'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', it.label);
  g.innerHTML = it.opts.map((o, i) => `<button type="button" data-i="${i}" aria-pressed="false">${o}</button>`).join('');
  g.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (!b) return; boot(); const i = +b.dataset.i; state.params[it.s] = i; post({ type: 'param', id: it.s, v: it.val(i) }); save(); drawRoute(); });
  routeEl.querySelector('.route-ctl').appendChild(g); routeSegs[it.s] = g;
  ui[it.s] = () => drawRoute(); // preset loads
}
function drawRoute() {
  const p = state.params, fx = state.fx, swap = (p.fxorder | 0) === 1, ret = Math.max(0, Math.min(2, p.fxret | 0));
  for (const it of FX_ROUTE) for (const b of routeSegs[it.s].children) b.setAttribute('aria-pressed', +b.dataset.i === (it.s === 'fxorder' ? (swap ? 1 : 0) : ret));
  const drv = DRV_NAMES[Math.max(0, Math.min(2, p.drvtype | 0))].toLowerCase(), rev = REV_TYPE_NAMES[Math.max(0, Math.min(3, p.revtype | 0))].toLowerCase();
  const W = 62, H = 18, Y = 24, X0 = 26; // block size, main row centre, shift for the 'shyoy' label
  const blk = (unit, label, x, y, on, name) => `<g class="rb${on ? ' on' : ''}"${unit ? ` data-u="${unit}" role="button" tabindex="0" aria-pressed="${!!on}" aria-label="${name}"` : ''}>` +
    `<rect x="${x}" y="${y - H / 2}" width="${W}" height="${H}" rx="2"/><text x="${x + W / 2}" y="${y + 4.5}">${label}</text></g>`;
  const ln = (pts) => `<polyline class="rw" points="${pts.map(q => q.join(',')).join(' ')}"/>`;
  const arr = (x, y) => `<path class="ra" d="M${x - 5} ${y - 3.5} L${x} ${y} L${x - 5} ${y + 3.5}Z"/>`;
  const pre = swap ? [['rat', drv, fx.rat, 'Drive'], ['fold', 'folder', fx.fold, 'Folder']] : [['fold', 'folder', fx.fold, 'Folder'], ['rat', drv, fx.rat, 'Drive']];
  pre.push(['flg', (p.flgmode | 0) ? 'chorus' : 'flanger', fx.flg, 'Flanger']);
  let h = `<text class="rt" x="0" y="${Y + 4.5}">shyoy</text>`;
  pre.forEach(([u, label, on, name], i) => { const x = X0 + 36 + i * 74; h += ln([[x - 10, Y], [x, Y]]) + arr(x, Y) + blk(u, label, x, Y, on, name); });
  const sx = X0 + 270, cx = X0 + 428, ox = X0 + 506; // split, Compactor, sum
  h += ln([[X0 + 246, Y], [sx, Y]]) + `<circle class="rn" cx="${sx}" cy="${Y}" r="2.5"/>`;
  const dlyB = (x, y) => blk('dly', 'delay', x, y, fx.dly, 'Delay'), revB = (x, y) => blk('lex', rev, x, y, fx.lex, 'Reverb');
  if (ret === 0) { // side by side
    const yt = 12, yb = 46, x = sx + 34, mx = sx + 120;
    h += ln([[sx, Y], [sx + 14, Y], [sx + 14, yt], [x, yt]]) + arr(x, yt) + ln([[sx + 14, Y], [sx + 14, yb], [x, yb]]) + arr(x, yb);
    h += dlyB(x, yt) + revB(x, yb);
    h += ln([[x + W, yt], [mx, yt], [mx, Y], [cx, Y]]) + ln([[x + W, yb], [mx, yb], [mx, Y]]) + arr(cx, Y);
  } else { // one into the other
    const [a, b] = ret === 1 ? [dlyB, revB] : [revB, dlyB], x1 = sx + 10, x2 = sx + 82;
    h += ln([[sx, Y], [x1, Y]]) + arr(x1, Y) + a(x1, Y) + ln([[x1 + W, Y], [x2, Y]]) + arr(x2, Y) + b(x2, Y) + ln([[x2 + W, Y], [cx, Y]]) + arr(cx, Y);
  }
  h += blk('', 'cmp', cx, Y, fx.lex || fx.dly, 'Compactor');
  h += ln([[cx + W, Y], [ox - 7, Y]]) + arr(ox - 7, Y);
  // the dry signal, under the returns, into the sum
  const dy = ret === 0 ? 60 : 50;
  h += ln([[sx, Y], [sx, dy], [ox, dy], [ox, Y + 7]]) + `<path class="ra" d="M${ox - 3.5} ${Y + 12} L${ox} ${Y + 7} L${ox + 3.5} ${Y + 12}Z"/>`;
  h += `<text class="rt rs" x="${ox - 30}" y="${dy - 3}">dry</text>`;
  h += `<circle class="rsum" cx="${ox}" cy="${Y}" r="7"/><path class="rw" d="M${ox - 4} ${Y} H${ox + 4} M${ox} ${Y - 4} V${Y + 4}"/>`;
  h += ln([[ox + 7, Y], [ox + 20, Y]]) + arr(ox + 20, Y) + `<text class="rt" x="${ox + 24}" y="${Y + 4.5}">out</text>`;
  routeDia.innerHTML = h;
}
{
  const hit = (e) => { const g = e.target.closest('[data-u]'); if (g) { document.getElementById('fx-' + g.dataset.u + '-on').click(); const n = routeDia.querySelector(`[data-u="${g.dataset.u}"]`); if (n && e.type === 'keydown') n.focus(); } };
  routeDia.addEventListener('click', hit);
  routeDia.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit(e); } });
}
renderFx(); drawRev(); drawDrv(); drawFlg(); drawDly();
