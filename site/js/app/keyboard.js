// Shyoy: Engine feedback, the computer keyboard, bender and the Space key.
// ---------- engine feedback ----------
function onEngineMsg(e) {
  const m = e.data;
  if (m.type === 'step') {
    let i = m.i;
    if (state.chain.length >= 2 && chainOffs.length) {
      let c = 0; while (c < state.chain.length - 1 && i >= chainOffs[c + 1]) c++;
      const k = state.chain[c]; i = k === state.slot ? i - chainOffs[c] : -1;
      if (k !== playingSlot) { playingSlot = k; requestAnimationFrame(renderChain); }
    }
    playStep = i; requestAnimationFrame(renderPlayLed);
  }
  else if (m.type === 's101') renderS101(m.i);
  else if (m.type === 'meters') {
    NODES.forEach((n, i) => { volts[n].textContent = (m.node[i] >= 0 ? '+' : '') + m.node[i].toFixed(2) + 'V'; });
    document.getElementById('psu').textContent = `Battery ${m.vIn.toFixed(2)} V · rail ${Math.round(m.rail * 100)}%`;
  }
}
let lastLed = -1;
function renderPlayLed() {
  for (const el of seqCols[lastLed] || []) el.classList.remove('cur');
  lastLed = -1;
  if (playStep >= 0 && running && seqCols[playStep]) { for (const el of seqCols[playStep]) el.classList.add('cur'); lastLed = playStep; }
}



// ---------- keyboard: 32 keys, F to C ----------
// notes come from the computer keyboard (and the sequencers); the on-screen keyboard was removed at Johnny's request
const LOW_F = 53;
const keyEls = {};
const held = new Set();
const mode101 = { arp: 0, seq: 0, hold: false };
state.s101 = Array.isArray(state.s101) ? state.s101 : [{ n: 48 }, { n: 48 }, { n: 60 }, { r: true }, { n: 55 }, { n: 58, l: true }, { n: 60 }, { n: 63 }];
const s101Read = document.getElementById('s101Read');
const renderS101 = (i) => { if (!s101Read) return; s101Read.textContent = mode101.seq === 1 ? `Load ${state.s101.length}/100` : mode101.seq === 2 ? `Play ${i == null ? '–' : i + 1}/${state.s101.length}` : `Seq ${state.s101.length}/100`; };
const pushS101 = () => { post({ type: 'seq101', steps: state.s101 }); renderS101(); save(); };
const trOff = () => ((state.params.transpose | 0) - 1) * 12;
async function noteOn(rel) {
  await boot(); const n = LOW_F + rel; if (held.has(n)) return;
  const legato = held.size > 0; held.add(n);
  keyEls[rel] && keyEls[rel].classList.add('down');
  if (selStep >= 0 && !running) {
    const st = state.steps[selStep]; setPitch(st, Math.max(-24, Math.min(35, n - 60))); st.m = 'N';
    selStep = (selStep + 1) % state.steps.length; stepChanged();
  }
  if (mode101.seq === 1 && state.s101.length < 100) { state.s101.push(legato ? { n: n + trOff(), l: true } : { n: n + trOff() }); pushS101(); }
  post({ type: 'noteOn', n });
}
function noteOff(rel) { const n = LOW_F + rel; if (!held.has(n)) return; held.delete(n); keyEls[rel] && keyEls[rel].classList.remove('down'); post({ type: 'noteOff', n }); }
// computer keys: A = the C in the middle of the keyboard
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
const KEY_C = 7;
const allOff = () => { for (const n of [...held]) noteOff(n - LOW_F); };
const setTranspose = d => { allOff(); const v = Math.max(0, Math.min(2, (state.params.transpose | 0) + d)); ui.transpose(v); state.params.transpose = v; post({ type: 'param', id: 'transpose', v }); save(); };

// arpeggio / 100-step sequencer / hold: the engine still has them (mode messages, seq101 steps), but since v0.13.2
// there are no buttons for them, so mode101 stays at arp off, seq off, hold off and the keys just play.

// bender lever (springs back) and mod push
const lever = document.getElementById('lever'), knob = lever.querySelector('i'), modPush = document.getElementById('modPush');
const setLever = v => { v = Math.max(-1, Math.min(1, v)); knob.style.left = `calc(${50 + v * 40}% - 9px)`; lever.setAttribute('aria-valuenow', Math.round(v * 100)); post({ type: 'param', id: 'lever', v }); };
let levDrag = false;
const levFromX = e => { const r = lever.getBoundingClientRect(); return ((e.clientX - r.left) / r.width - 0.5) / 0.4; };
lever.addEventListener('pointerdown', e => { boot(); lever.setPointerCapture(e.pointerId); levDrag = true; setLever(levFromX(e)); });
lever.addEventListener('pointermove', e => { if (levDrag) setLever(levFromX(e)); });
const levUp = () => { levDrag = false; setLever(0); };
lever.addEventListener('pointerup', levUp); lever.addEventListener('pointercancel', levUp);
lever.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') setLever(-1); if (e.key === 'ArrowRight') setLever(1); });
lever.addEventListener('keyup', () => setLever(0));
const push = on => { modPush.classList.toggle('held', on); post({ type: 'param', id: 'modPush', v: on ? 1 : 0 }); };
modPush.addEventListener('pointerdown', e => { boot(); modPush.setPointerCapture(e.pointerId); push(true); });
modPush.addEventListener('pointerup', () => push(false)); modPush.addEventListener('pointercancel', () => push(false));

window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.target.matches && e.target.matches('input, select')) return;
  const k = e.key.toLowerCase();
  if (k in KEYMAP) { noteOn(KEY_C + KEYMAP[k]); e.preventDefault(); }
  else if (k === 'z') setTranspose(-1); else if (k === 'x') setTranspose(1);
});
// Space is run/stop wherever focus is (buttons, sliders, faders, menus), except while typing text.
// Caught first, in the capture phase, so a focused button or slider never gets it (buttons click on Space keyup).
const typing = t => t && t.matches && (t.matches('textarea, [contenteditable=""], [contenteditable="true"]') || (t.matches('input') && !t.matches('[type=range], [type=number], [type=checkbox], [type=radio], [type=button], [type=file]')));
addEventListener('keydown', e => {
  if (e.code !== 'Space' && e.key !== ' ') return;
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
  e.preventDefault(); e.stopPropagation();
  if (!e.repeat) setRun(!running);
}, true);
addEventListener('keyup', e => { if ((e.code === 'Space' || e.key === ' ') && !typing(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k in KEYMAP) noteOff(KEY_C + KEYMAP[k]); });
window.addEventListener('blur', allOff);
