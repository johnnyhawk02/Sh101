// Shyoy: fit the screen to the window (after the TB-303 app's fit.js, the Elixir Synth way).
// The screen is one fixed 1400 x 906 pane (the shape of Johnny's MacBook Pro display, 1.545:1), scaled as a whole to fill the
// window with the dark case round it, so every page reads the same at any window size and nothing moves when you switch tabs.
// Phones and iPads get the same screen, just smaller: there is no separate phone layout. The Options sheet scales with it.
// fitK() is the current scale, for drags that count pixels of travel rather than measuring the element.
const FIT_W = 1400, FIT_H = 906;
let fitScale = 1;
const fitK = () => fitScale;
(() => {
  const root = document.documentElement;
  root.classList.add('fit');
  if (!('HTMLDialogElement' in window)) root.classList.add('nodialog');   // older WebKit: no <dialog> (shyoy.css)
  const fit = () => {
    const vw = (window.visualViewport && visualViewport.width) || innerWidth, vh = (window.visualViewport && visualViewport.height) || innerHeight;
    const pad = Math.min(vw, vh) < 600 ? 4 : 64;   // a phone needs every pixel; on a desktop leave a clear dark margin so the window's shape shows
    fitScale = Math.max(0.1, Math.min((vw - pad) / FIT_W, (vh - pad) / FIT_H, 2.2));
    root.style.setProperty('--k', fitScale.toFixed(4));
  };
  addEventListener('resize', fit); addEventListener('orientationchange', fit);
  if (window.visualViewport) visualViewport.addEventListener('resize', fit);
  fit();
})();
