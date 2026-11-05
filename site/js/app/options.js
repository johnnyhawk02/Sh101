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
function setLcd(t, m) { lcdTheme = t; lcdMode = m; store.set('lcdTheme', t); store.set('lcdMode', m); showLcd(); }
showLcd();
lcdSeg.forEach(b => b.onclick = () => setLcd(lcdTheme, b.dataset.m));
lcdBtns.forEach(b => b.onclick = () => setLcd(b.dataset.t, lcdMode));
lcdSws.addEventListener('keydown', (e) => {
  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
  e.preventDefault(); e.stopPropagation();
  const i = (LCD_T.indexOf(lcdTheme) + d + LCD_T.length) % LCD_T.length; setLcd(LCD_T[i], lcdMode); lcdBtns[i].focus();
});
