// Shyoy: the Options sheet (MIDI, Colours, About), opened by the gear at the right of the top bar. From the TB-303 app's
// options.js: a modal <dialog> that closes with ×, Escape or a click on the backdrop. The last tab used is saved (optTab).
const optDlg = document.getElementById('options');
const openOptions = () => { if (optDlg.showModal) optDlg.showModal(); else optDlg.setAttribute('open', ''); };
const closeOptions = () => { if (optDlg.close) optDlg.close(); else optDlg.removeAttribute('open'); };
document.getElementById('open-options').onclick = openOptions;
document.getElementById('close-options').onclick = closeOptions;
optDlg.addEventListener('click', (e) => { if (e.target === optDlg) closeOptions(); });
// on a phone the first touch also puts the page into full screen (tabs.js), which lands in the top layer after the sheet
// and would cover it: open the sheet again on top
document.addEventListener('fullscreenchange', () => { if (optDlg.open && optDlg.showModal) { optDlg.close(); optDlg.showModal(); } });
const otabs = document.getElementById('otabs');
function showOptTab(k, focus) {
  for (const b of otabs.querySelectorAll('[role=tab]')) { const on = b.dataset.sec === k; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); }
  for (const sec of optDlg.querySelectorAll('.osec')) sec.hidden = sec.id !== 'osec-' + k;
  optDlg.querySelector('.opt-body').scrollTop = 0; store.set('optTab', k);
}
otabs.addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) showOptTab(b.dataset.sec, true); });
otabs.addEventListener('keydown', (e) => {
  const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key]; if (!d) return;
  const t = [...otabs.querySelectorAll('[role=tab]')], i = t.findIndex(b => b.getAttribute('aria-selected') === 'true');
  showOptTab(t[(i + d + t.length) % t.length].dataset.sec, true); e.preventDefault(); e.stopPropagation();
});
{ const k = store.get('optTab', 'midi'); showOptTab(document.getElementById('osec-' + k) ? k : 'midi'); }

// ---------- Options › Colours (was the Colours… pop-up): Mono (one ink on the swatch's glass) or Grey + colour (grey
// glass, the swatch as one spot colour); applies at once. Saved as kestrel.lcdTheme / kestrel.lcdMode, which the
// script in <head> puts back before first paint ----------
const LCD_T = ['green', 'orange', 'amber', 'blue', 'red', 'grey'];
const lcdSws = document.getElementById('lcdSws'), lcdSeg = optDlg.querySelectorAll('.lcd-seg button');
const rootEl = document.documentElement;
let lcdTheme = LCD_T.includes(rootEl.dataset.lcd) ? rootEl.dataset.lcd : 'green', lcdMode = rootEl.dataset.lcdmode === 'mono' ? 'mono' : 'colour';
lcdSws.innerHTML = LCD_T.map(t => `<button type="button" class="lcd-sw" role="radio" data-t="${t}"><span class="bars" aria-hidden="true">${[.45, .8, .6, 1, .3].map(b => `<i style="--b:${b * 100}%"></i>`).join('')}</span>${t}</button>`).join('');
const lcdBtns = [...lcdSws.children];
function showLcd() {
  rootEl.dataset.lcd = lcdTheme; rootEl.dataset.lcdmode = lcdMode;
  lcdSeg.forEach(b => b.setAttribute('aria-pressed', b.dataset.m === lcdMode));
  lcdBtns.forEach(b => { const on = b.dataset.t === lcdTheme; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
}
function setLcd(t, m) { lcdTheme = t; lcdMode = m; store.set('lcdTheme', t); store.set('lcdMode', m); showLcd(); applyLook(); }
showLcd();
lcdSeg.forEach(b => b.onclick = () => setLcd(lcdTheme, b.dataset.m));
lcdBtns.forEach(b => b.onclick = () => setLcd(b.dataset.t, lcdMode));
lcdSws.addEventListener('keydown', (e) => {
  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
  e.preventDefault(); e.stopPropagation();
  const i = (LCD_T.indexOf(lcdTheme) + d + LCD_T.length) % LCD_T.length; setLcd(LCD_T[i], lcdMode); lcdBtns[i].focus();
});

// Brightness, Saturation, Dirt, Grain, Glow (from the TB-303 app's options.js): saved as kestrel.lcdLook (the slider values)
// and kestrel.lcdVars (the CSS variables they make, which the head script puts back before first paint). At the stock
// values nothing is set. Brightness and Saturation move the glass in HSL, Dirt scales the shade at the top and in the
// corners, Grain the pixel grid, Glow the ink's shadow. Stock Dirt is 100% here, so Shyoy looks as it did.
const LOOK0 = { bright: 0, sat: 100, dirt: 100, grain: 100, glow: 100 };
const look = { ...LOOK0, ...(store.get('lcdLook', {}) || {}) };
const LOOK_VARS = ['--glass-rgb', '--dirt', '--grain', '--glow'];
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)), h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map(v => Math.round((v + m) * 255));
}
function applyLook() {
  for (const v of LOOK_VARS) rootEl.style.removeProperty(v);
  const vars = {};
  if (look.bright !== 0 || look.sat !== 100) {
    const [h, s0, l0] = rgb2hsl(...getComputedStyle(rootEl).getPropertyValue('--glass-rgb').trim().split(/\s+/).map(Number));
    const b = look.bright / 100, s = Math.min(1, s0 * look.sat / 100), l = b > 0 ? l0 + (1 - l0) * b * .8 : l0 * (1 + b * .8);
    vars['--glass-rgb'] = hsl2rgb(h, s, l).join(' ');
  }
  for (const k of ['dirt', 'grain', 'glow']) if (look[k] !== LOOK0[k]) vars['--' + k] = String(look[k] / 100);
  for (const k in vars) rootEl.style.setProperty(k, vars[k]);
  store.set('lcdLook', look); store.set('lcdVars', vars);
}
const lookBox = document.getElementById('lcd-look');
const showLook = () => { for (const i of lookBox.querySelectorAll('input')) { const k = i.dataset.look; i.value = look[k]; i.nextElementSibling.textContent = k === 'bright' ? (look[k] > 0 ? '+' : '') + look[k] : look[k] + '%'; } };
lookBox.addEventListener('input', (e) => { const i = e.target; if (!i.dataset?.look) return; look[i.dataset.look] = +i.value; applyLook(); showLook(); });
document.getElementById('lcd-look-reset').onclick = () => { Object.assign(look, LOOK0); applyLook(); showLook(); };
showLook(); applyLook();
