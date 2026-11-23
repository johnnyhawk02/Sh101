// Shyoy plugin bridge. The plugin serves the web app (site/) unchanged to its web view and puts this script first in
// <head>. It stands in for the browser parts the plugin replaces, so the page's own code needs no plugin version:
//  - AudioContext / AudioWorkletNode: the engine runs in the plugin (a C++ port of js/dsp/engine.js), so the node's
//    port sends each engine message to the plugin, and what the engine says (step, meters) comes back the same way.
//  - localStorage: the sound is saved in the host's project; looks, presets and options are shared by every Shyoy
//    instance (a file kept by the plugin), as one browser shares them.
//  - Web MIDI and the service worker are switched off: MIDI comes from the host, the files come from the plugin.
(() => {
  const J = window.__JUCE__, backend = J && J.backend;
  const init = (J && J.initialisationData) || {};
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const send = (o) => { try { backend.emitEvent('shyoy', o); } catch (e) {} };
  window.shyoyPlugin = { version: first(init.version) || '' };
  // page errors and console warnings go to the plugin (printed when SHYOY_LOG is set)
  const log = (t) => send({ kind: 'log', text: String(t) });
  addEventListener('error', (e) => log(`error: ${e.message} ${e.filename}:${e.lineno}`));
  addEventListener('unhandledrejection', (e) => log(`rejection: ${e.reason && (e.reason.stack || e.reason)}`));
  for (const k of ['warn', 'error']) { const f = console[k].bind(console); console[k] = (...a) => { log(`${k}: ${a.join(' ')}`); f(...a); }; }
  document.documentElement.classList.add('plugin');

  // ---- localStorage ----
  let start = {}; try { start = JSON.parse(first(init.store) || '{}') || {}; } catch (e) {}
  const mem = new Map(Object.entries(start).map(([k, v]) => [k, String(v)]));
  const store = {
    getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
    setItem: (k, v) => { k = String(k); v = String(v); if (mem.get(k) === v) return; mem.set(k, v); send({ kind: 'store', k, v }); },
    removeItem: (k) => { k = String(k); if (!mem.has(k)) return; mem.delete(k); send({ kind: 'store', k }); },
    clear: () => { for (const k of [...mem.keys()]) store.removeItem(k); },
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  let shimmed = false;
  try { Object.defineProperty(window, 'localStorage', { configurable: true, enumerable: true, get: () => store }); shimmed = window.localStorage === store; } catch (e) {}
  if (!shimmed) {
    // this web view won't let localStorage be replaced: use the real one, filled from the plugin and mirrored back
    try {
      const ls = window.localStorage, P = Storage.prototype, set = P.setItem, rem = P.removeItem, clr = P.clear;
      clr.call(ls); for (const [k, v] of mem) set.call(ls, k, v);
      P.setItem = function (k, v) { set.call(this, k, v); if (this === ls) send({ kind: 'store', k: String(k), v: String(v) }); };
      P.removeItem = function (k) { rem.call(this, k); if (this === ls) send({ kind: 'store', k: String(k) }); };
      P.clear = function () { if (this === ls) for (let i = ls.length - 1; i >= 0; i--) send({ kind: 'store', k: ls.key(i) }); clr.call(this); };
    } catch (e) {}
  }

  // ---- no Web MIDI, no service worker, no install ----
  try { delete Navigator.prototype.requestMIDIAccess; } catch (e) {}
  try { Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: undefined }); } catch (e) {}
  try { delete Navigator.prototype.serviceWorker; } catch (e) {}

  // ---- the audio engine ----
  let theNode = null;
  class PluginAudioContext {
    constructor() { this.state = 'running'; this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; this.audioWorklet = { addModule: () => Promise.resolve() }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  class PluginWorkletNode {
    constructor() { this.port = { onmessage: null, postMessage: (m) => send({ kind: 'msg', json: JSON.stringify(m) }) }; theNode = this; }
    connect() {} disconnect() {}
  }
  window.AudioContext = PluginAudioContext; window.webkitAudioContext = PluginAudioContext; window.AudioWorkletNode = PluginWorkletNode;

  // what the plugin says: engine messages for the page (as the worklet's port would), and MIDI from the host that
  // moved a control (the plugin has already played it; this moves the control on screen, as midi.js does)
  const fromEngine = (m) => { if (theNode && theNode.port.onmessage) theNode.port.onmessage({ data: m }); };
  const onPlugin = (m) => {
    try {
      if (m.type === 'step' || m.type === 'meters') { fromEngine(m); return; }
      if (m.type === 'running') { seqOn = !!m.on; if (!seqOn) { seqPos = -1; seqLanePos = null; seqNoteAt = -1; } return; }
      if (m.type === 'recnote') { seqRecNote(m.n); return; }   // a host note while RECORD is on (the plugin played it only if the sequencer is stopped)
      if (m.type === 'cc') {
        const id = MIDI_MAP[m.i] && MIDI_MAP[m.i].id; if (!id) return;
        if (ui[id]) ui[id](m.v); state.params[id] = m.v; save(); return;
      }
      if (m.type === 'bend') { knob.style.left = `calc(${50 + m.v * 40}% - 11px)`; lever.setAttribute('aria-valuenow', Math.round(m.v * 100)); return; }   // setLever without the send
      if (m.type === 'press') { modPush.classList.toggle('held', m.v > 0.02); return; }
    } catch (e) { console.warn('shyoy plugin', e); }
  };
  if (backend) backend.addEventListener('engine', onPlugin);

  // once the page has run: start the engine link (no click needed in a plugin), tell the plugin the CC map, and show
  // a running sequencer as running
  addEventListener('DOMContentLoaded', () => {
    try {
      if (first(init.running)) seqOn = true;
      boot();
      log(`page booted, localStorage ${shimmed ? 'replaced' : 'mirrored'}`);
      send({ kind: 'msg', json: JSON.stringify({ type: 'ccmap', ids: MIDI_MAP.map((x) => x.id) }) });
      const st = document.getElementById('midi-status'); if (st) st.textContent = 'MIDI comes from the host.';
      // RECORD: the plugin sends host notes here instead of playing them while the sequencer runs, as midi.js does
      let rec = false; setInterval(() => { if (seqRec !== rec) { rec = seqRec; send({ kind: 'rec', on: rec }); } }, 50);
      for (const id of ['mInstall', 'mUpdate', 'mInstallHow']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    } catch (e) { console.warn('shyoy plugin', e); }
  });
})();
