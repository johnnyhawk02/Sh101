// Shyoy: Install prompt, the menu, Colours, auto-update.
// ---------- install as an app (Chrome on Android shows its own prompt when we ask) ----------
const installEl = document.getElementById('install');
let installEvt = null;
// installed app only: the first touch puts the page itself into fullscreen, which also matches display-mode
// fullscreen, so that case is not counted (it was hiding the install pop-up in the browser)
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone
  || (matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement);
const snoozed = () => Date.now() - (store.get('installNo', 0) || 0) < 7 * 864e5;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); installEvt = e;
  if (!standalone() && !snoozed()) { installTxt.textContent = INSTALL_TXT; installGo.hidden = false; installEl.hidden = false; }
});
const installTxt = document.getElementById('installTxt'), installGo = document.getElementById('installGo');
const INSTALL_TXT = installTxt.textContent;
document.getElementById('installGo').onclick = async () => {
  installEl.hidden = true; if (!installEvt) return;
  installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null;
};
// the menu: Install app is always there, because the browser's own prompt can be held back (after a "Not now",
// or for a while after the app was removed) and then the pop-up never appears
const menuBtn = document.getElementById('menuBtn'), menuPop = document.getElementById('menuPop');
const closeMenu = () => { menuPop.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
menuBtn.onclick = (e) => { e.stopPropagation(); const open = menuPop.hidden; menuPop.hidden = !open; menuBtn.setAttribute('aria-expanded', open); if (open) menuPop.querySelector('button').focus(); };
document.addEventListener('click', (e) => { if (!menuPop.hidden && !menuPop.contains(e.target)) closeMenu(); });
menuPop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); menuBtn.focus(); } });
// Colours…: Mono (one ink on the swatch's glass) or Grey + colour (grey glass, the swatch as one spot colour); applies at once
const LCD_T = ['green', 'orange', 'amber', 'blue', 'red', 'grey'];
const lcdPop = document.getElementById('lcdPop'), lcdSws = document.getElementById('lcdSws'), lcdSeg = lcdPop.querySelectorAll('.lcd-seg button');
const rootEl = document.documentElement;
let lcdTheme = LCD_T.includes(rootEl.dataset.lcd) ? rootEl.dataset.lcd : 'green', lcdMode = rootEl.dataset.lcdmode === 'mono' ? 'mono' : 'colour';
lcdSws.innerHTML = LCD_T.map(t => `<button class="lcd-sw" role="radio" data-t="${t}"><span class="bars" aria-hidden="true">${[.45, .8, .6, 1, .3].map(b => `<i style="--b:${b * 100}%"></i>`).join('')}</span>${t}</button>`).join('');
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
const closeLcd = () => { lcdPop.hidden = true; };
document.getElementById('mColours').onclick = (e) => {
  e.stopPropagation(); closeMenu(); lcdPop.hidden = false; lcdBtns[LCD_T.indexOf(lcdTheme)].focus();
};
document.addEventListener('pointerdown', (e) => { if (!lcdPop.hidden && !lcdPop.contains(e.target)) closeLcd(); }, true);
lcdPop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeLcd(); menuBtn.focus(); } });
document.getElementById('mInstall').onclick = async () => {
  closeMenu(); store.set('installNo', 0);
  if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  installTxt.textContent = standalone() ? 'You are already running the installed app.'
    : ios ? 'In Safari, tap Share, then Add to Home Screen.'
    : "Your browser hasn't offered the install yet. Open the browser menu (⋮) and choose Install app or Add to Home screen.";
  installGo.hidden = true; installEl.hidden = false;
};
document.getElementById('mUpdate').onclick = async () => {
  closeMenu();
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
  if (reg) { try { await reg.update(); } catch (e) {} }
  clearTimeout(saveT); try { localStorage.setItem('kestrel-ms1-v2', JSON.stringify(state)); } catch (e) {}
  location.reload();
};
document.getElementById('installNo').onclick = () => { installEl.hidden = true; store.set('installNo', Date.now()); };
addEventListener('appinstalled', () => { installEl.hidden = true; installEvt = null; });
// Auto-update: check for a new build on launch, whenever the app comes back to the front, and every 15 minutes.
// A new build activates straight away (skipWaiting + clients.claim) and the page reloads itself, but never mid-pattern:
// if the sequencer is running it waits until you stop or switch away. Patch and pattern are saved, so nothing is lost.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadSW = !!navigator.serviceWorker.controller;
  let reloadDue = false;
  const tryReload = () => { if (reloadDue && (!running || document.hidden)) { reloadDue = false; clearTimeout(saveT); try { localStorage.setItem('kestrel-ms1-v2', JSON.stringify(state)); } catch (e) {} location.reload(); } };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadSW) { reloadDue = true; tryReload(); } });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    const check = () => reg.update().catch(() => {});
    check(); setInterval(check, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) tryReload(); else check(); });
    addEventListener('focus', check);
  }).catch(() => {});
  playBtn.addEventListener('click', () => setTimeout(tryReload, 0));
}

window.__kestrel = { state, boot, setRun };
