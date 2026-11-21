// Shyoy: Engine feedback, the computer keyboard and the bender.
// ---------- engine feedback ----------
function onEngineMsg(e) {
  const m = e.data;
  if (m.type === 'step') { seqPos = m.i; return; }
  if (m.type === 'meters') {
    NODES.forEach((n, i) => { volts[n].textContent = (m.node[i] >= 0 ? '+' : '') + m.node[i].toFixed(2) + 'V'; });
    document.getElementById('psu').textContent = `Battery ${m.vIn.toFixed(2)} V · rail ${Math.round(m.rail * 100)}%`;
  }
}

// ---------- keyboard: 32 keys, F to C ----------
// notes come from the computer keyboard (and MIDI); the on-screen keyboard was removed at Johnny's request
const LOW_F = 53;
const keyEls = {};
const held = new Set();
async function noteOn(rel) {
  await boot(); const n = LOW_F + rel; if (held.has(n)) return;
  held.add(n);
  keyEls[rel] && keyEls[rel].classList.add('down');
  post({ type: 'noteOn', n });
}
function noteOff(rel) { const n = LOW_F + rel; if (!held.has(n)) return; held.delete(n); keyEls[rel] && keyEls[rel].classList.remove('down'); post({ type: 'noteOff', n }); }
// computer keys: A = the C in the middle of the keyboard
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
const KEY_C = 7;
const allOff = () => { for (const n of [...held]) noteOff(n - LOW_F); };
const setTranspose = d => { allOff(); const v = Math.max(0, Math.min(2, (state.params.transpose | 0) + d)); ui.transpose(v); state.params.transpose = v; post({ type: 'param', id: 'transpose', v }); save(); };

// bender lever (springs back) and mod push
const lever = document.getElementById('lever'), knob = lever.querySelector('i'), modPush = document.getElementById('modPush');
const setLever = v => { v = Math.max(-1, Math.min(1, v)); knob.style.left = `calc(${50 + v * 40}% - 11px)`; lever.setAttribute('aria-valuenow', Math.round(v * 100)); post({ type: 'param', id: 'lever', v }); };
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
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k in KEYMAP) noteOff(KEY_C + KEYMAP[k]); });
window.addEventListener('blur', allOff);
