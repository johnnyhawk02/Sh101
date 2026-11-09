// Shyoy: MIDI CC moves the front-panel controls, from any input on any channel (from the TB-303 app's midi.js). Notes go
// to the engine like the computer keys: stopped they play, while the sequencer runs a note sets the pattern's root
// (key transpose, latched, middle C 60 = as written, cleared on Stop; the engine's keyOn does this). CC 1 onwards are the rack's continuous controls in panel order, left to right, then the bender's faders.
// The list is built from RACK and BENDER, so it follows the panel. Switches are not mapped.
// From every input: pitch bend moves the bender lever, channel aftertouch pushes the mod lever, CC 64 (sustain) holds notes.
// A Novation Bass Station II (found by its port name) gets its own map instead: each of its knobs and sliders moves the
// nearest Shyoy control (BS2_MAP below, from Novation's published CC list), its mod wheel pushes the mod lever and a
// hard key (velocity 100 or more) plays an accented note, and the arp Rhythm knob picks the pattern slot.
const MIDI_MAP = (() => {
  const all = [...RACK.flatMap(m => m.items.map(it => it.label)), ...BENDER.map(b => b.label)];
  const twice = (l) => all.filter(x => x === l).length > 1;
  const short = (m) => { const w = m.name.split(' ').pop(); return w[0].toUpperCase() + w.slice(1); }; // "Source mix" → "Mix"
  return [...RACK.flatMap(m => m.items.filter(it => it.f).map(it => ({ id: it.f, name: twice(it.label) ? short(m) + ' ' + it.label : it.label }))),
    ...BENDER.map(b => ({ id: b.f, name: 'Bender ' + b.label }))];
})();
document.getElementById('midi-map').innerHTML = MIDI_MAP.map((m, i) => `<li><b>CC ${i + 1}</b><span>${m.name}</span></li>`).join('');

// ---------- Bass Station II ----------
// x: the knob 0..1 (8-bit knobs send MSB then an LSB of 0 or 64 on cc + 32, both used); c: the same as a centre-detent
// knob, -1..1 with 64 = 0. A row: [cc, Bass Station II control, Shyoy control, (x, c, raw MSB) => what it sets].
const clamp01 = v => Math.max(0, Math.min(1, v));
const bs2Sw = (raw, base, n) => Math.max(0, Math.min(n - 1, raw >= base && raw < base + n ? raw - base : raw < n ? raw : Math.floor(raw * n / 128)));
const bs2Sub = { oct: 1, wave: 2 }; // BSII init patch: −1 oct, sine
const bs2SubType = () => bs2Sub.oct ? 0 : bs2Sub.wave === 1 ? 2 : 1; // −1 → '−1 sq'; −2 pulse → '−2 25%', else '−2 sq'
const BS2_MAP = [
  [16, 'Filter frequency', 'Cutoff', x => ({ cutoff: x })],
  [82, 'Resonance', 'Reso', x => ({ reso: x })],
  [85, 'Filter mod env', 'VCF Env (right of centre)', (x, c) => ({ vcfEnv: Math.max(0, c) })],
  [17, 'Filter LFO 2', 'VCF Mod (either side)', (x, c) => ({ vcfMod: Math.abs(c) })],
  [114, 'Overdrive', 'VCF Drive', x => ({ drive: x })],
  [94, 'Distortion', 'FX Drive pedal amount', x => ({ [['dist', 'dsdist', 'tsdrive'][state.params.drvtype | 0] || 'dist']: x })],
  [20, 'Osc 1 level', 'Saw', x => ({ saw: x })],
  [21, 'Osc 2 level', 'Pulse', x => ({ pulse: x })],
  [22, 'Sub osc level', 'Sub', x => ({ sub: x })],
  [23, 'Noise level', 'Noise', x => ({ noise: x })],
  [70, 'Osc 1 range', 'VCO Range', (x, c, r) => ({ range: bs2Sw(r, 63, 4) })],
  [26, 'Osc 1 fine', 'Tune', x => ({ tune: x })],
  [28, 'Osc 1 LFO 1 depth', 'VCO Mod (either side)', (x, c) => ({ vcoMod: Math.abs(c) })],
  [74, 'Osc 1 manual PW', 'PW, PWM Man', (x, c) => ({ pwmSrc: 1, pw: Math.abs(c) })],
  [73, 'Osc 1 LFO 2 PW', 'PW, PWM LFO', (x, c) => Math.abs(c) < .03 ? {} : { pwmSrc: 0, pw: Math.abs(c) }],
  [72, 'Osc 1 mod env PW', 'PW, PWM Env', (x, c) => Math.abs(c) < .03 ? {} : { pwmSrc: 2, pw: Math.abs(c) }],
  [81, 'Sub osc octave', 'Sub switch', (x, c, r) => { bs2Sub.oct = r & 1; return { subType: bs2SubType() }; }],
  [80, 'Sub osc wave', 'Sub switch', (x, c, r) => { bs2Sub.wave = bs2Sw(r, 63, 3); return { subType: bs2SubType() }; }],
  [18, 'LFO 1 speed', 'LFO Rate', x => ({ lfoRate: x })],
  [19, 'LFO 2 speed', 'LFO Rate', x => ({ lfoRate: x })],
  [88, 'LFO 1 wave', 'LFO Wave', (x, c, r) => ({ lfoWave: [0, 0, 1, 2][bs2Sw(r, 0, 4)] })], // tri, saw (→ tri), square, S&H (→ random)
  [89, 'LFO 2 wave', 'LFO Wave', (x, c, r) => ({ lfoWave: [0, 0, 1, 2][bs2Sw(r, 0, 4)] })],
  [90, 'Amp env attack', 'Env A', x => ({ attack: x })],
  [91, 'Amp env decay', 'Env D', x => ({ decay: x })],
  [92, 'Amp env sustain', 'Env S', x => ({ sustain: x })],
  [93, 'Amp env release', 'Env R', x => ({ release: x })],
  [102, 'Mod env attack', 'Env A', x => ({ attack: x })],
  [103, 'Mod env decay', 'Env D', x => ({ decay: x })],
  [104, 'Mod env sustain', 'Env S', x => ({ sustain: x })],
  [105, 'Mod env release', 'Env R', x => ({ release: x })],
  [5, 'Glide time', 'Porta', x => ({ glide: x })],
  [7, 'Patch volume', 'VCA Level', x => ({ level: x })],
  [107, 'Bend amount', 'Bender VCO', (x, c, r) => ({ bendVco: r >= 1 && r <= 12 ? r / 12 : x })],
];
const BS2_BY_CC = new Map(BS2_MAP.map(r => [r[0], r]));
const BS2_14 = new Set([16, 17, 18, 19, 20, 21, 22, 23, 26, 28]); // 8-bit knobs: LSB on cc + 32
// the MIDI tab's list (shorter than BS2_MAP: pairs that land on one control share a line)
const BS2_SHOW = [['Filter freq', 'Cutoff'], ['Resonance', 'Reso'], ['Filter env', 'VCF Env'], ['Filter LFO 2', 'VCF Mod'], ['Overdrive', 'VCF Drive'],
  ['Distortion', 'FX drive'], ['Osc 1 level', 'Saw'], ['Osc 2 level', 'Pulse'], ['Sub level', 'Sub'], ['Noise level', 'Noise'], ['Osc 1 range', 'Range'],
  ['Osc 1 fine', 'Tune'], ['Osc 1 LFO 1', 'VCO Mod'], ['Osc 1 PW', 'PW + PWM'], ['Sub oct, wave', 'Sub switch'], ['LFO 1/2 speed', 'LFO Rate'],
  ['LFO 1/2 wave', 'LFO Wave'], ['Amp/mod env', 'Env ADSR'], ['Glide time', 'Porta'], ['Volume', 'VCA Level'], ['Bend amount', 'Bender VCO'],
  ['Arp rhythm', 'Pattern 1-8'], ['Pitch wheel', 'Bender'], ['Mod wheel', 'Mod lever'], ['Aftertouch', 'Mod lever'], ['Velocity 100+', 'Accent'], ['Sustain', 'Hold']];
document.getElementById('midi-map-bs2').innerHTML = BS2_SHOW.map(r => `<li><b>${r[0]}</b><span>${r[1]}</span></li>`).join('');
const isBS2 = (inp) => /bass\s*station\s*(ii|2)\b/i.test(inp.name || '');

// a CC sets the control exactly as dragging it does: fader, readout, engine, saved state. One update per frame.
const midiSet = (id, v) => { if (cseqHand(id, v)) return; ui[id](v); state.params[id] = v; post({ type: 'param', id, v: state.params[id] }); save(); };
const midiPending = new Map(); let midiFrame = 0;
const midiLater = (key, fn) => { midiPending.set(key, fn); if (!midiFrame) midiFrame = requestAnimationFrame(() => { midiFrame = 0; for (const f of midiPending.values()) f(); midiPending.clear(); }); };
const midiHeld = new Set(), midiDown = new Set(); let midiSus = false;
const modIn = { wheel: 0, press: 0 };
const setMod = () => { const v = Math.max(modIn.wheel, modIn.press); modPush.classList.toggle('held', v > .02); post({ type: 'param', id: 'modPush', v }); };
const bs2Msb = {}; let bs2RhyWide = false;
function bs2CC(cc, val) {
  if (cc === 1 || cc === 0) { modIn.wheel = val / 127; midiLater('mod', setMod); return; }
  // the arp Rhythm knob picks the pattern slot: its 32 rhythms (0..31) spread over the slots, or 0..127 if that is what it sends
  if (cc === 119) { if (val > 31) bs2RhyWide = true; const k = Math.min(SLOTS - 1, Math.floor(val * SLOTS / (bs2RhyWide ? 128 : 32))); midiLater('rhythm', () => loadSlot(k)); return; }
  let base = cc, lsb = 0;
  if (cc >= 48 && cc < 64 && BS2_14.has(cc - 32)) { base = cc - 32; lsb = val; if (bs2Msb[base] == null) return; }
  const row = BS2_BY_CC.get(base); if (!row) return;
  if (base === cc) bs2Msb[base] = val;
  const raw = bs2Msb[base], f = raw + (BS2_14.has(base) ? lsb / 128 : 0);
  const x = clamp01(f / (BS2_14.has(base) ? 127.5 : 127)), c = Math.max(-1, Math.min(1, (f - 64) / 63));
  midiLater(base, () => { const o = row[3](x, c, raw); for (const id in o) if (state.params[id] !== o[id]) midiSet(id, o[id]); });
}
function onMidi(e, bs2) {
  const [st, cc, val] = e.data, t = st & 0xf0;
  if (t === 0x90 && val > 0) { boot(); midiDown.add(cc); midiHeld.add(cc); post(bs2 && val >= 100 ? { type: 'noteOn', n: cc, acc: 1 } : { type: 'noteOn', n: cc }); return; }
  if (t === 0x80 || t === 0x90) { midiDown.delete(cc); if (midiSus) return; if (midiHeld.delete(cc)) post({ type: 'noteOff', n: cc }); return; }
  if (t === 0xe0) { const v = (((val << 7) | cc) - 8192) / (val >= 64 ? 8191 : 8192); midiLater('bend', () => setLever(v)); return; }
  if (t === 0xd0) { modIn.press = cc / 127; midiLater('mod', setMod); return; }
  if (t !== 0xb0) return;
  if (cc === 64) { midiSus = val >= 64; if (!midiSus) for (const n of [...midiHeld]) if (!midiDown.has(n)) { midiHeld.delete(n); post({ type: 'noteOff', n }); } return; }
  if (bs2) { bs2CC(cc, val); return; }
  if (cc < 1 || cc > MIDI_MAP.length) return;
  const id = MIDI_MAP[cc - 1].id;
  midiLater(id, () => midiSet(id, val / 127));
}
// The status line in Options › MIDI is the app's only status text. Access is asked for on the first click or touch
// anywhere (as the audio boots), so the browser's permission prompt never appears before the page has been touched.
const midiStatus = document.getElementById('midi-status');
if (!navigator.requestMIDIAccess) midiStatus.textContent = 'This browser has no Web MIDI. Chrome and Edge have it.';
else addEventListener('pointerdown', () => {
  navigator.requestMIDIAccess().then((acc) => {
    const hook = () => { const ins = [...acc.inputs.values()]; for (const i of ins) { const b = isBS2(i); i.onmidimessage = e => onMidi(e, b); }
      const bs = ins.filter(isBS2).length;
      midiStatus.textContent = ins.length ? `Listening on ${ins.map(i => i.name).join(', ')}, all channels.${bs ? ' Bass Station II found: it uses its own map below.' : ''}` : 'No MIDI input connected. Plug one in and it is picked up straight away.'; };
    hook(); acc.onstatechange = hook;
  }, () => { midiStatus.textContent = 'MIDI access was refused or is not available here.'; });
}, { once: true, capture: true });
