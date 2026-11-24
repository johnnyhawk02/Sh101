// Shyoy: The factory sounds and the saved state.
// v0.58.0 (Johnny: "remove the presets and replace with a straight edged sound"): one factory sound, a plain saw with the
// filter wide open, no resonance, drive, envelope, LFO, glide or accent, the VCA on the gate (about -26 dB, the randomiser's level)
const PRESETS = {
  'Straight': { p: { saw: .85, pulse: 0, sub: 0, noise: 0, cutoff: 1, reso: 0, drive: 0, vcfEnv: 0, vcfMod: 0, vcoMod: 0, kybd: .5, accVcf: 0,
    attack: 0, decay: .4, sustain: 1, release: .1, trig: 0, vcaMode: 1, level: .7, glide: 0, glideMode: 0, accent: 0, range: 1, pw: .3, pwmSrc: 1 } },
};

// ---------- state ----------
const defaults = {};
for (const m of RACK) for (const it of m.items) defaults[it.f || it.s] = it.def;
for (const b of BENDER) defaults[b.f] = b.def; defaults.transpose = 1;
// v0.39.0 (Johnny: "simplify shyoy, remove fx"): the effects are gone; a saved sound keeps only the controls that still exist
const knownParams = (p) => { const o = {}; for (const k in (p || {})) if (k in defaults) o[k] = p[k]; return o; };
let state;
function presetState(name) {
  const P = PRESETS[name];
  const bend = stockBend();
  for (const k in (P.bend || {})) { const b = BEND_ITEMS.find(x => x.id === k || x.sw === k); bend[k] = b.sw ? P.bend[k] : toNorm(b, P.bend[k]); }
  return { params: { ...defaults, ...knownParams(P.p) }, bend, br: { ...(P.br || {}) }, preset: name };
}
try { state = JSON.parse(localStorage.getItem('kestrel-ms1-v2')); } catch (e) { state = null; }
if (!state || state.v !== 2 || !state.params) state = presetState('Straight');
// v0.40.0 (Johnny: "remove the sequencer"): a saved session's pattern, slots, tempo, scale and control sequencers are dropped
for (const k of ['steps', 'len', 'bpm', 'slots', 'slot', 'chain', 'scale', 'cseq', 's101']) delete state[k];
state.v = 2; state.bend = { ...stockBend(), ...(state.bend || {}) }; state.br = state.br || {};
state.params = { ...defaults, ...knownParams(state.params) }; delete state.fx;
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('kestrel-ms1-v2', JSON.stringify(state)); } catch (e) {} }, 300); }
