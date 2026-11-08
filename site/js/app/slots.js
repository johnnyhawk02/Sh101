// Shyoy: Pattern slots and chains.
// ---------- pattern slots ----------
let clip = null; try { clip = JSON.parse(localStorage.getItem('kestrel.clip')); } catch (e) {}
const slotsEl = document.getElementById('slots');
const blankSteps = (len = 16) => Array.from({ length: len }, () => restStep());
function slotSteps(k) { const x = state.slots[k]; return x && x.steps && x.steps.length ? x.steps : blankSteps(); }
// a slot that Generate filled by itself is marked auto; the mark goes as soon as its steps are edited (as in the 303 app's banks)
function storeSlot() {
  const old = state.slots[state.slot], steps = clone(state.steps), same = old && old.auto && JSON.stringify(old.steps) === JSON.stringify(steps);
  state.slots[state.slot] = { steps, swing: state.params.swing, gateLen: state.params.gateLen, ...(same ? { auto: true } : {}) };
}
// every empty slot (and with force, every auto one) gets a fresh 16-step generated pattern; never the one you're on
function fillSlots(force) {
  let n = 0;
  for (let k = 0; k < SLOTS; k++) {
    const x = state.slots[k], empty = !x || !Array.isArray(x.steps) || !x.steps.some(st => st.m !== 'R');
    if (k === state.slot || !(empty || (force && x.auto))) continue;
    state.slots[k] = { steps: generatePattern(16, genDens).steps, swing: x ? x.swing ?? 0 : 0, gateLen: x ? x.gateLen ?? .5 : .5, auto: true }; n++;
  }
  return n;
}
function loadSlotData() {
  const x = state.slots[state.slot];
  state.steps = x && x.steps && x.steps.length ? cleanSteps(x.steps) : blankSteps();
  if (x) { state.params.swing = x.swing ?? state.params.swing; state.params.gateLen = x.gateLen ?? state.params.gateLen; }
  tail = []; undoStack.length = 0; selStep = -1;
}
function loadSlot(n) {
  if (n === state.slot) return;
  storeSlot(); state.slot = n; loadSlotData();
  renderSeq(); post(seqMsg()); save(); renderBank();
}
function renderBank() {
  for (const b of slotsEl.children) {
    const n = +b.dataset.n, x = state.slots[n];
    b.setAttribute('aria-pressed', n === state.slot);
    b.classList.toggle('used', !!(x && x.steps && x.steps.some(st => st.m !== 'R')));
    b.setAttribute('aria-label', `Pattern ${n + 1}`);
  }
  document.getElementById('p-paste').disabled = !clip;
  renderChain();
}
function renderChain() {
  const el = document.getElementById('chain-read'), on = state.chain.length >= 2;
  el.hidden = !on;
  el.querySelector('.ch-list').innerHTML = state.chain.map(k => `<span class="${on && running && k === playingSlot ? 'now' : ''}">${k + 1}</span>`).join('<span class="arr">›</span>');
  for (const b of slotsEl.children) {
    const k = +b.dataset.n, pos = state.chain.indexOf(k);
    b.dataset.ch = on && pos >= 0 ? pos + 1 : '';
    b.classList.toggle('playing', on && running && k === playingSlot);
  }
}
function toggleChain(k) {
  const pos = state.chain.indexOf(k);
  if (pos >= 0) state.chain.splice(pos, 1);
  else { if (!state.chain.length && k !== state.slot) state.chain.push(state.slot); state.chain.push(k); }
  if (state.chain.length === 1) state.chain = [];
  storeSlot(); post(seqMsg()); save(); renderBank();
}
// tap a slot to load it; ctrl/cmd-click, right-click or long-press adds it to the chain (as in the 303 app)
let lpT = null, lpFired = false;
slotsEl.addEventListener('pointerdown', e => {
  const b = e.target.closest('button'); if (!b) return; lpFired = false;
  clearTimeout(lpT); lpT = setTimeout(() => { lpFired = true; toggleChain(+b.dataset.n); if (navigator.vibrate) navigator.vibrate(15); }, 500);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) slotsEl.addEventListener(ev, () => clearTimeout(lpT));
slotsEl.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (lpFired) { lpFired = false; return; }
  if (e.metaKey || e.ctrlKey) toggleChain(+b.dataset.n); else loadSlot(+b.dataset.n);
});
slotsEl.addEventListener('contextmenu', e => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); if (!lpFired) toggleChain(+b.dataset.n); });
document.getElementById('chain-clear').onclick = () => { state.chain = []; playingSlot = -1; post(seqMsg()); save(); renderBank(); };
document.getElementById('p-copy').onclick = () => { clip = { steps: clone(state.steps), swing: state.params.swing, gateLen: state.params.gateLen }; try { localStorage.setItem('kestrel.clip', JSON.stringify(clip)); } catch (e) {} renderBank(); };
document.getElementById('p-paste').onclick = () => {
  if (!clip || !Array.isArray(clip.steps)) return; keepUndo();
  state.steps = cleanSteps(clip.steps); state.params.swing = clip.swing ?? state.params.swing; state.params.gateLen = clip.gateLen ?? state.params.gateLen;
  tail = []; stepChanged();
};
// Refill slots (Randomise): new generated patterns for the auto and empty slots. Undo doesn't cover it.
document.getElementById('p-refill').onclick = () => { fillSlots(true); post(seqMsg()); save(); renderBank(); };
// Join chain and copy (Tools): every chained pattern in chain order, as one of up to 64 steps, with the first slot's swing and
// gate length, onto the Copy/Paste clipboard (and the system clipboard as JSON where the browser allows). No chain: the current slot.
document.getElementById('p-join').onclick = () => {
  storeSlot();
  const keys = state.chain.length >= 2 ? state.chain : [state.slot], first = state.slots[keys[0]] || {};
  const steps = keys.flatMap(k => clone(slotSteps(k))).slice(0, SEQ_MAX);
  clip = { steps, swing: first.swing ?? state.params.swing, gateLen: first.gateLen ?? state.params.gateLen };
  try { localStorage.setItem('kestrel.clip', JSON.stringify(clip)); } catch (e) {}
  try { navigator.clipboard?.writeText(JSON.stringify({ app: 'kestrel-ms1', steps })).catch(() => {}); } catch (e) {}
  renderBank();
};
// on load every empty slot except the current one gets a generated pattern, so a first-time user finds 8 ready to play
if (fillSlots(false)) save();
