// Shyoy: MIDI CC moves the front-panel controls, from any input on any channel (from the TB-303 app's midi.js). Notes go
// to the engine like the computer keys: stopped they play, while the sequencer runs a note sets the pattern's root
// (key transpose, latched, middle C 60 = as written, cleared on Stop; the engine's keyOn does this). CC 1 onwards are the rack's continuous controls in panel order, left to right, then the bender's faders.
// The list is built from RACK and BENDER, so it follows the panel. Switches are not mapped.
const MIDI_MAP = (() => {
  const all = [...RACK.flatMap(m => m.items.map(it => it.label)), ...BENDER.map(b => b.label)];
  const twice = (l) => all.filter(x => x === l).length > 1;
  const short = (m) => { const w = m.name.split(' ').pop(); return w[0].toUpperCase() + w.slice(1); }; // "Source mix" → "Mix"
  return [...RACK.flatMap(m => m.items.filter(it => it.f).map(it => ({ id: it.f, name: twice(it.label) ? short(m) + ' ' + it.label : it.label }))),
    ...BENDER.map(b => ({ id: b.f, name: 'Bender ' + b.label }))];
})();
document.getElementById('midi-map').innerHTML = MIDI_MAP.map((m, i) => `<li><b>CC ${i + 1}</b><span>${m.name}</span></li>`).join('');
// a CC sets the control exactly as dragging it does: fader, readout, engine, saved state. One update per frame.
const midiSet = (id, v) => { if (cseqHand(id, v)) return; ui[id](v); post({ type: 'param', id, v: state.params[id] }); save(); };
const midiPending = new Map(); let midiFrame = 0;
const midiHeld = new Set();
function onMidi(e) {
  const [st, cc, val] = e.data, t = st & 0xf0;
  if (t === 0x90 && val > 0) { boot(); midiHeld.add(cc); post({ type: 'noteOn', n: cc }); return; }
  if (t === 0x80 || t === 0x90) { if (midiHeld.delete(cc)) post({ type: 'noteOff', n: cc }); return; }
  if ((st & 0xf0) !== 0xb0 || cc < 1 || cc > MIDI_MAP.length) return;
  midiPending.set(cc, val / 127);
  if (!midiFrame) midiFrame = requestAnimationFrame(() => { midiFrame = 0; for (const [c, t] of midiPending) midiSet(MIDI_MAP[c - 1].id, t); midiPending.clear(); });
}
// The status line in Options › MIDI is the app's only status text. Access is asked for on the first click or touch
// anywhere (as the audio boots), so the browser's permission prompt never appears before the page has been touched.
const midiStatus = document.getElementById('midi-status');
if (!navigator.requestMIDIAccess) midiStatus.textContent = 'This browser has no Web MIDI. Chrome and Edge have it.';
else addEventListener('pointerdown', () => {
  navigator.requestMIDIAccess().then((acc) => {
    const hook = () => { const ins = [...acc.inputs.values()]; for (const i of ins) i.onmidimessage = onMidi;
      midiStatus.textContent = ins.length ? `Listening on ${ins.map(i => i.name).join(', ')}, all channels.` : 'No MIDI input connected. Plug one in and it is picked up straight away.'; };
    hook(); acc.onstatechange = hook;
  }, () => { midiStatus.textContent = 'MIDI access was refused or is not available here.'; });
}, { once: true, capture: true });
