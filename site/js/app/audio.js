// Shyoy: Audio engine: boots the AudioWorklet and sends it the patch and sequence.
// ---------- audio engine ----------
// The engine runs in an AudioWorklet built from the circuit model (v0.39.0: the effects are gone). The file is fetched as
// text when the page loads and handed over as one module.
const DSP_FILES = ['js/dsp/engine.js'];
const loadDsp = () => Promise.all(DSP_FILES.map(f => fetch(f).then(r => { if (!r.ok) throw new Error(f + ': ' + r.status); return r.text(); }))).then(t => t.join('\n'));
let dspCode = loadDsp(); dspCode.catch(() => {});
let ctx = null, node = null, running = false, booting = null;
async function boot() {
  if (node) { if (ctx.state !== 'running') await ctx.resume(); return; }
  if (booting) return booting;
  booting = (async () => {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    let code; try { code = await dspCode; } catch (e) { code = await (dspCode = loadDsp()); }
    const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    try { await ctx.audioWorklet.addModule(url); }
    catch (e) { await ctx.audioWorklet.addModule('data:application/javascript;base64,' + btoa(unescape(encodeURIComponent(code)))); }
    node = new AudioWorkletNode(ctx, 'kestrel-ms1', { numberOfInputs: 0, outputChannelCount: [2] });
    node.connect(ctx.destination);
    node.port.onmessage = onEngineMsg;
    pushAll();
    if (ctx.state !== 'running') await ctx.resume();
  })();
  return booting;
}
const post = (m) => { if (node) node.port.postMessage(m); };
const osFactor = () => { const n = typeof store === 'object' ? store.get('os', 2) : 2; return n === 1 || n === 4 ? n : 2; };   // Options › Audio
const softClipOn = () => (typeof store === 'object' ? store.get('clip', true) : true) !== false;   // Options › Audio, on by default
function pushAll() { post({ type: 'os', n: osFactor() }); post({ type: 'clip', on: softClipOn() }); post({ type: 'params', p: state.params }); post({ type: 'bend', b: bendPhysical(state.bend) }); post({ type: 'bridges', br: state.br }); if (typeof seqMsg === 'function') post(seqMsg()); }
