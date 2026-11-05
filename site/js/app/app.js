// Shyoy: Install app and Check for update (Options › About), auto-update.
// ---------- install as an app: no pop-up (Johnny: no messages). Install app in Options › About asks the browser, or
// says how beside the button when the browser can't be asked (from the TB-303 app's functions.js) ----------
let installEvt = null;
// installed app only: the first touch puts the page itself into fullscreen, which also matches display-mode
// fullscreen, so that case is not counted
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone
  || (matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement);
const mInstall = document.getElementById('mInstall'), installHow = document.getElementById('mInstallHow');
const installSay = (t) => { installHow.textContent = t; installHow.hidden = !t; };
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
if (standalone()) mInstall.hidden = true;
mInstall.onclick = async () => {
  if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  installSay(ios ? 'In Safari, tap Share, then Add to Home Screen.'
    : "Open the browser menu (⋮) and choose Install app or Add to Home screen.");
};
document.getElementById('mUpdate').onclick = async () => {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
  if (reg) { try { await reg.update(); } catch (e) {} }
  clearTimeout(saveT); try { localStorage.setItem('kestrel-ms1-v2', JSON.stringify(state)); } catch (e) {}
  location.reload();
};
addEventListener('appinstalled', () => { installEvt = null; mInstall.hidden = true; installSay(''); });
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
