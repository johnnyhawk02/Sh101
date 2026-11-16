// Shyoy: the pocket screen (v0.37.0, Johnny: "in phone mode, just have a screen with randomise and save, and also
// generate new pattern and pattern density"). On a phone (short side under 600 px, touch) the app opens on this one
// plain page instead of the panel: the sound's name, a big sticker that randomises the sound (rand.js, the same as
// clicking a sticker on the 3D panel; UNDO steps back), SAVE, and for the pattern RUN, GENERATE and DENSITY. Every
// button (and 🎲, another invented name for the save) works through the app's own controls (#prj-save, #play via setRun, #sq-rnd, #sqDens), so nothing new reaches
// the engine. FULL PANEL goes to the panel and a small POCKET key comes back; the choice is kept (shyoy.pocket).
// Open it anywhere with ?pocket=1 (and ?pocket=0 to stay off).
(() => {
  const isPhone = () => Math.min(innerWidth, innerHeight) < 600 && matchMedia('(pointer: coarse)').matches;
  const q = new URLSearchParams(location.search).get('pocket');
  let pref = null; try { pref = localStorage.getItem('shyoy.pocket'); } catch (e) {}
  const wanted = () => q === '1' || (q !== '0' && pref !== 'off' && isPhone());
  const css = document.createElement('style');
  css.textContent = `
#pocket { position: fixed; inset: 0; z-index: 200; display: none; overflow-y: auto; -webkit-overflow-scrolling: touch;
  background: #b9bbb8; color: #141414; font: 600 13px "Geist Mono", ui-monospace, Menlo, monospace; letter-spacing: .06em;
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)); box-sizing: border-box; }
html.pocket #pocket { display: block; }
#pocket * { box-sizing: border-box; }
#pocket .pk-in { max-width: 460px; min-height: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
#pocket .pk-top { display: flex; align-items: flex-end; justify-content: space-between; }
#pocket .pk-logo { width: 120px; aspect-ratio: 547 / 200; background: #141414; -webkit-mask: url(icons/logo.png) center / contain no-repeat; mask: url(icons/logo.png) center / contain no-repeat; }
#pocket .pk-ver { font-size: 11px; opacity: .55; }
#pocket .pk-lcd { background: #0a0a0a; color: #f2f2f2; border-radius: 4px; padding: 12px 14px; font-size: 17px; letter-spacing: .08em; text-transform: uppercase;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 46px; box-shadow: inset 0 2px 6px rgba(0,0,0,.6); }
#pocket .pk-box { border: 2px solid #141414; border-radius: 6px; padding: 20px 14px 14px; position: relative; display: flex; flex-direction: column; gap: 14px; }
#pocket .pk-box > h2 { position: absolute; top: -11px; left: 12px; margin: 0; background: #141414; color: #b9bbb8; font: 400 13px "Archivo Black", "Arial Black", sans-serif; letter-spacing: .1em; padding: 2px 8px; border-radius: 3px; }
#pocket .pk-rnd { align-self: center; width: min(42vw, 30vh, 190px); aspect-ratio: 1; border: 0; padding: 0; background: none; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
#pocket .pk-rnd svg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 4px 6px rgba(0,0,0,.35)); transition: transform .12s; }
#pocket .pk-rnd:active svg { transform: scale(.94); }
#pocket .pk-rnd.spin svg { animation: pk-spin .55s linear infinite; }
@keyframes pk-spin { to { transform: rotate(-360deg); } }
#pocket .pk-cap { text-align: center; font-size: 11px; opacity: .7; margin-top: -6px; }
#pocket .pk-row { display: flex; gap: 10px; align-items: center; }
#pocket .pk-key { flex: 1; min-height: 48px; border: 0; border-radius: 5px; background: #1c1c1c; color: #eee; font: inherit; font-size: 14px; letter-spacing: .1em;
  box-shadow: 0 3px 0 #000, inset 0 1px 0 rgba(255,255,255,.12); display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
#pocket .pk-key:active { transform: translateY(2px); box-shadow: 0 1px 0 #000; }
#pocket .pk-key.small { flex: 0 0 auto; min-height: 40px; padding: 0 16px; font-size: 12px; }
#pocket .pk-key i { width: 9px; height: 9px; border-radius: 50%; background: #4a1810; box-shadow: inset 0 1px 1px rgba(0,0,0,.6); }
#pocket .pk-key.on i { background: #ff4a2a; box-shadow: 0 0 8px #ff4a2a; }
#pocket .pk-name { flex: 1; min-width: 0; height: 48px; border: 2px solid #141414; border-radius: 5px; background: #d6d7d4; color: #141414; font: inherit; font-size: 16px; padding: 0 12px; letter-spacing: .04em; }
#pocket .pk-sld { display: grid; grid-template-columns: auto 1fr 52px; gap: 12px; align-items: center; }
#pocket .pk-sld input { width: 100%; accent-color: #141414; height: 32px; }
#pocket .pk-sld b { text-align: right; font-weight: 600; }
#pocket .pk-full { margin-top: auto; align-self: center; background: none; border: 0; color: #141414; font: inherit; font-size: 12px; text-decoration: underline; opacity: .7; padding: 10px; cursor: pointer; }
#pk-back { position: fixed; z-index: 150; right: 10px; top: max(10px, env(safe-area-inset-top)); display: none; border: 0; border-radius: 16px; background: #141414; color: #eee;
  font: 600 12px "Geist Mono", ui-monospace, monospace; letter-spacing: .08em; padding: 9px 14px; box-shadow: 0 2px 8px rgba(0,0,0,.5); }
html.pocket-able:not(.pocket) #pk-back { display: block; }`;
  document.head.appendChild(css);
  // the smiley, drawn as on the panel's sticker: yellow face on a white die-cut border
  const SMILE = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#fff"/><circle cx="50" cy="50" r="41" fill="#ffd400" stroke="rgba(0,0,0,.8)" stroke-width="1.2"/>
<ellipse cx="37" cy="40" rx="3.8" ry="8" fill="#151515"/><ellipse cx="63" cy="40" rx="3.8" ry="8" fill="#151515"/>
<path d="M27 57 A24 24 0 0 0 73 57" fill="none" stroke="#151515" stroke-width="4" stroke-linecap="round"/>
<path d="M18 30 A38 38 0 0 1 40 13" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="4" stroke-linecap="round"/></svg>`;
  const el = document.createElement('div'); el.id = 'pocket'; el.setAttribute('role', 'main');
  el.innerHTML = `<div class="pk-in">
  <div class="pk-top"><span class="pk-logo" role="img" aria-label="Shyoy"></span><span class="pk-ver"></span></div>
  <div class="pk-lcd" aria-live="polite"></div>
  <section class="pk-box"><h2>SOUND</h2>
    <button class="pk-rnd" aria-label="Randomise the sound">${SMILE}</button>
    <div class="pk-cap">TAP FOR A NEW SOUND</div>
    <div class="pk-row"><button class="pk-key small" data-k="undo">UNDO</button><input class="pk-name" type="text" maxlength="40" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" placeholder="NAME…" aria-label="Preset name"><button class="pk-key small" data-k="name" aria-label="Another name">🎲</button></div>
    <div class="pk-row"><button class="pk-key" data-k="save">SAVE</button></div>
  </section>
  <section class="pk-box"><h2>PATTERN</h2>
    <div class="pk-row"><button class="pk-key" data-k="run"><i></i><span>RUN</span></button><button class="pk-key" data-k="gen">GENERATE</button></div>
    <label class="pk-sld"><span>DENSITY</span><input type="range" min="10" max="100" step="1" aria-label="Pattern density"><b></b></label>
  </section>
  <button class="pk-full">FULL PANEL</button>
</div>`;
  document.body.appendChild(el);
  const back = document.createElement('button'); back.id = 'pk-back'; back.textContent = 'POCKET'; document.body.appendChild(back);
  const $ = (s) => el.querySelector(s);
  const lcd = $('.pk-lcd'), rnd = $('.pk-rnd'), nameIn = $('.pk-name'), runK = $('[data-k=run]'), dens = $('.pk-sld input'), densV = $('.pk-sld b');
  $('.pk-ver').textContent = (document.getElementById('ver') || {}).textContent || '';
  const prjName = document.getElementById('prj-name'), sqDens = document.getElementById('sqDens');
  const curName = () => (document.querySelector('#prj-bar .pm-btn .cur') || {}).textContent || '';
  rnd.onclick = () => shyoyRand.roll();
  $('[data-k=undo]').onclick = () => shyoyRand.back();
  $('[data-k=save]').onclick = () => {
    const n = nameIn.value.trim(); if (n) prjName.value = n;
    document.getElementById('prj-save').click(); nameIn.blur();
  };
  // Johnny: a randomise for the preset name too (the namer, as the panel's 🎲)
  $('[data-k=name]').onclick = () => { prjBar.suggest(true); nameIn.value = prjName.value; };
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-k=save]').click(); });
  runK.onclick = () => setRun(!running);
  $('[data-k=gen]').onclick = () => { boot(); document.getElementById('sq-rnd').click(); };
  dens.oninput = () => { sqDens.value = dens.value; sqDens.dispatchEvent(new Event('input', { bubbles: true })); sqDens.dispatchEvent(new Event('change', { bubbles: true })); };
  // keeps the page in step with the app (randomise, a save, a preset loaded elsewhere)
  function sync() {
    if (!document.documentElement.classList.contains('pocket')) return;
    const t = shyoyRand.reel || curName(); if (lcd.textContent !== t) lcd.textContent = t;
    rnd.classList.toggle('spin', shyoyRand.spinning);
    if (document.activeElement !== nameIn && nameIn.value !== prjName.value) nameIn.value = prjName.value;
    runK.classList.toggle('on', !!running); runK.querySelector('span').textContent = running ? 'STOP' : 'RUN';
    if (document.activeElement !== dens && dens.value !== sqDens.value) dens.value = sqDens.value;
    densV.textContent = dens.value + '%';
  }
  setInterval(sync, 90);
  // the panel behind is put to sleep while the pocket page is up (the 3D view draws nothing then)
  const quiet = () => { if (window.shyoy3d && window.shyoy3d.ready && document.documentElement.dataset.view === '3d') window.shyoy3d.hide(); };
  function show(on, keep) {
    const root = document.documentElement; root.classList.toggle('pocket', on);
    if (keep) { pref = on ? null : 'off'; try { on ? localStorage.removeItem('shyoy.pocket') : localStorage.setItem('shyoy.pocket', 'off'); } catch (e) {} }
    if (on) { quiet(); if (window.shyoySplash) window.shyoySplash.done(); sync(); }
    else if (window.shyoyView) window.shyoyView(root.dataset.view || '3d');
  }
  $('.pk-full').onclick = () => show(false, true);
  back.onclick = () => show(true, true);
  const able = () => { const a = q === '1' || isPhone(); document.documentElement.classList.toggle('pocket-able', a); return a; };
  able(); addEventListener('resize', able);
  if (wanted()) {
    show(true);
    // the 3D view may still be loading: put it to sleep as soon as it is up
    const t = setInterval(() => { if (window.shyoy3d && window.shyoy3d.ready) { clearInterval(t); if (document.documentElement.classList.contains('pocket')) quiet(); } }, 300);
    setTimeout(() => clearInterval(t), 30000);
  }
})();
