// Shyoy: Audio engine: boots the AudioWorklet and sends it the patch, effects and sequence.
// ---------- audio engine ----------
// The engine runs in an AudioWorklet built from two files: the effects, then the circuit model. They are fetched as text
// when the page loads, joined and handed over as one module, so every class sees the others (as when they were inline).
const DSP_FILES = ['js/dsp/fx.js', 'js/dsp/engine.js'];
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
    if ((state.params.revtype | 0) === 3) { irFailed = false; loadIRs(); } // a failed list gets one more try when audio starts
    if (ctx.state !== 'running') await ctx.resume();
  })();
  return booting;
}
const post = (m) => { if (node) node.port.postMessage(m); };
function seqMsg() {
  const p = state.params;
  let steps = state.steps; chainOffs = [];
  if (state.chain && state.chain.length >= 2) {
    steps = [];
    for (const k of state.chain) { chainOffs.push(steps.length); steps = steps.concat(k === state.slot ? state.steps : slotSteps(k)); }
    chainOffs.push(steps.length);
  }
  return { type: 'seq', seq: { steps, length: steps.length, bpm: state.bpm, swing: p.swing, gateLen: 0.1 + p.gateLen * 0.85 } };
}
function pushFx() { post({ type: 'fxknobs', k: fxKnobs(state.params) }); for (const n of ['rat', 'dly', 'lex', 'fold']) post({ type: 'fx', name: n, on: !!state.fx[n] }); }
function pushAll() { pushFx(); post({ type: 'seq101', steps: state.s101 || [] }); post({ type: 'params', p: state.params }); post({ type: 'bend', b: bendPhysical(state.bend) }); post({ type: 'bridges', br: state.br }); post(seqMsg()); }
