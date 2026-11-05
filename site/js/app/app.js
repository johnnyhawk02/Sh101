// Shyoy: Install prompt, Install app and Check for update (Options › About), auto-update.
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
// Options › About: Install app is always there, because the browser's own prompt can be held back (after a "Not now",
// or for a while after the app was removed) and then the pop-up never appears
document.getElementById('mInstall').onclick = async () => {
  store.set('installNo', 0);
  if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  installTxt.textContent = standalone() ? 'You are already running the installed app.'
    : ios ? 'In Safari, tap Share, then Add to Home Screen.'
    : "Your browser hasn't offered the install yet. Open the browser menu (⋮) and choose Install app or Add to Home screen.";
  installGo.hidden = true; closeOptions(); installEl.hidden = false;
};
document.getElementById('mUpdate').onclick = async () => {
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
