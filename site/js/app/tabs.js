// Shyoy: Tabs, and full screen + landscape lock on phones.
// ---------- tabs ----------
// Bridges was taken off the page in v0.16.5: its tab and panel stay in the HTML, hidden, and bend.js still builds the matrix.
// Bend board went the same way in v0.22.10 (Johnny): hidden in the HTML, bend.js still builds it and presets still apply it.
const TABS = [['tab-synth', null], ['tab-seq', 'pan-seq'], ['tab-fx', 'pan-fx'], ['tab-perf', null]];
const unitEl = document.getElementById('unit');
function showTab(id) {
  unitEl.dataset.view = id;
  for (const [t, p] of TABS) { const on = t === id; document.getElementById(t).setAttribute('aria-selected', on); if (p) document.getElementById(p).hidden = !on; }
  try { localStorage.setItem('kestrel-ms1-tab', id); } catch (e) {}
}
TABS.forEach(([t], i) => {
  const b = document.getElementById(t); b.onclick = () => showTab(t);
  b.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; const n = TABS[(i + d + TABS.length) % TABS.length][0]; showTab(n); document.getElementById(n).focus(); });
});
let firstTab = 'tab-synth';
try { const t = localStorage.getItem('kestrel-ms1-tab'); if (t && TABS.some(x => x[0] === t)) firstTab = t; } catch (e) {}
showTab(firstTab);

// ---------- phones: go full screen and hold landscape on the first touch ----------
const coarse = matchMedia('(pointer: coarse)').matches;
async function lockLandscape() {
  if (!coarse) return;
  try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) {}
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) {}
}
addEventListener('pointerdown', lockLandscape, { once: true, capture: true });
