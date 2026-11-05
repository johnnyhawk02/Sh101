// Shyoy: Run/stop and tempo.
// ---------- transport ----------
const playBtn = document.getElementById('play');
async function setRun(on) {
  await boot(); running = on; post({ type: 'run', on });
  playBtn.classList.toggle('on', on); document.getElementById('playLab').textContent = on ? 'Stop' : 'Run';
  if (!on) { for (const el of seqCols[playStep] || []) el.classList.remove('cur'); playStep = -1; playingSlot = -1; }
  renderChain();
}
playBtn.onclick = () => setRun(!running);
const bpmEl = document.getElementById('bpm');
bpmEl.value = state.bpm;
bpmEl.onchange = () => { state.bpm = Math.max(40, Math.min(240, +bpmEl.value || 120)); bpmEl.value = state.bpm; post(seqMsg()); save(); };
