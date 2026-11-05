// Shyoy: Bend board and Bridges matrix, with Randomise and Clear.
// ---------- UI: bend board ----------
const bendVals = document.getElementById('bendVals');
for (const g of BEND) {
  const el = document.createElement('div'); el.className = 'bend-grp';
  el.innerHTML = `<h3>${g.grp}</h3><div class="ctrls"></div>`;
  const c = el.querySelector('.ctrls');
  for (const b of g.items) {
    if (b.sw) switcher({ s: b.sw, label: b.label, opts: b.opts, def: b.nom, bend: true }, c);
    else fader({ f: b.id, label: b.label, def: toNorm(b, b.nom), fmt: v => b.fmt(fromNorm(b, v)), bend: true }, c);
  }
  bendVals.appendChild(el);
}
document.getElementById('bendStock').onclick = () => { boot(); state.bend = stockBend(); for (const k in bui) bui[k](state.bend[k]); post({ type: 'bend', b: bendPhysical(state.bend) }); save(); };

const mx = document.getElementById('mx'); const volts = {}; const cells = {};
function buildMatrix() {
  let h = '<thead><tr><th class="src">Tap node</th>' + INJ.map(d => `<th scope="col">${INJ_NAME[d]}</th>`).join('') + '</tr></thead><tbody>';
  for (const s of NODES) {
    h += `<tr style="--c:${NODE_COLOR[s]}"><th class="src" scope="row"><span class="jack"></span>${NODE_NAME[s]}<span class="volt" id="v-${s}">0.00V</span></th>`;
    for (const d of INJ) h += `<td><div class="cell bridge" role="slider" tabindex="0" id="c-${s}-${d}" data-k="${s}>${d}" aria-label="Bridge ${NODE_NAME[s]} to ${INJ_NAME[d]}" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div><span>·</span></div></td>`;
    h += '</tr>';
  }
  h += '</tbody>';
  mx.innerHTML = h;
  for (const s of NODES) volts[s] = document.getElementById('v-' + s);
  mx.querySelectorAll('.cell').forEach(c => {
    const k = c.dataset.k;
    const fill = c.querySelector('.fill'), lab = c.querySelector('span');
    const render = () => {
      const v = state.br[k] || 0;
      c.classList.toggle('active', v > 0);
      fill.style.left = '0'; fill.style.width = (v * 100) + '%';
      lab.textContent = v > 0 ? ohms(bridgeR(v)) : '∞';
      c.setAttribute('aria-valuenow', Math.round(v * 100)); c.setAttribute('aria-valuetext', v > 0 ? ohms(bridgeR(v)) + ' bridge' : 'open');
    };
    const set = v => { v = Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000; if (v < 0.004) v = 0; if (v) state.br[k] = v; else delete state.br[k]; render(); post({ type: 'bridges', br: state.br }); save(); };
    let drag = null;
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); boot(); drag = { y: e.clientY, v: state.br[k] || 0 }; });
    c.addEventListener('pointermove', e => { if (drag) set(drag.v - (e.clientY - drag.y) / fitK() * (e.shiftKey ? .001 : .005)); });
    c.addEventListener('pointerup', () => drag = null); c.addEventListener('pointercancel', () => drag = null);
    c.addEventListener('dblclick', () => set(0));
    c.addEventListener('wheel', e => { e.preventDefault(); set((state.br[k] || 0) - Math.sign(e.deltaY) * (e.shiftKey ? .005 : .02)); }, { passive: false });
    c.addEventListener('keydown', e => {
      const st = e.shiftKey ? .1 : .01, v = state.br[k] || 0;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { set(v + st); e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { set(v - st); e.preventDefault(); }
      else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') set(0);
    });
    cells[k] = render; render();
  });
}
buildMatrix();

// Randomise: depth sets how many bridges (1 at 0%, 8 at 100%) and how strong they can be (lower resistance)
const brDepthEl = document.getElementById('brDepth'), brDepthOut = document.getElementById('o-brDepth');
try { const d = localStorage.getItem('kestrel.brDepth'); if (d != null) brDepthEl.value = d; } catch (e) {}
const showBrDepth = () => { brDepthOut.textContent = brDepthEl.value + '%'; };
showBrDepth();
brDepthEl.oninput = () => { showBrDepth(); try { localStorage.setItem('kestrel.brDepth', brDepthEl.value); } catch (e) {} };
document.getElementById('mxRand').onclick = () => {
  boot();
  const d = brDepthEl.value / 100, keys = Object.keys(cells), n = 1 + Math.round(d * 7);
  state.br = {};
  for (let i = 0; i < n && keys.length; i++) {
    const k = keys.splice(Math.floor(Math.random() * keys.length), 1)[0];
    state.br[k] = Math.round((0.05 + Math.random() * (0.15 + 0.8 * d)) * 1000) / 1000;
  }
  Object.values(cells).forEach(r => r()); post({ type: 'bridges', br: state.br }); save();
};
document.getElementById('mxClear').onclick = () => { state.br = {}; Object.values(cells).forEach(r => r()); post({ type: 'bridges', br: state.br }); save(); };
