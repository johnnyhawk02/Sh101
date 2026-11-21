// Shyoy: The factory sounds and the saved state.
const PRESETS = {
  'Acid line': { p: { accVcf: 0.45, saw: .85, pulse: 0, sub: .25, noise: 0, cutoff: .3, reso: .8, drive: .55, vcfEnv: .6, kybd: .5, attack: 0, decay: .38, sustain: 0, release: .22, vcaMode: 0, accent: .75, slide: .22, glideMode: 1, range: 1, swing: .12, gateLen: .5 } },
  'Sub bass': { p: { accVcf: 0.25, saw: .3, pulse: .55, sub: .85, subType: 0, noise: 0, cutoff: .34, reso: .25, drive: .6, vcfEnv: .35, kybd: .5, attack: 0, decay: .45, sustain: .35, release: .2, vcaMode: 0, accent: .4, pw: .15, pwmSrc: 1, range: 0, swing: .08, gateLen: .6 } },
  'PWM arp': { p: { accVcf: 0.25, saw: 0, pulse: .85, sub: .3, subType: 2, noise: 0, cutoff: .45, reso: .45, drive: .4, vcfEnv: .45, kybd: .5, attack: 0, decay: .35, sustain: .3, release: .35, vcaMode: 0, accent: .4, pw: .7, pwmSrc: 0, lfoRate: .45, lfoWave: 0, range: 1, swing: 0, gateLen: .45 } },
  'Starved & bent': { p: { accVcf: 0.375, saw: .8, pulse: .3, sub: .4, noise: 0, cutoff: .4, reso: .7, drive: .6, vcfEnv: .45, kybd: .4, attack: 0, decay: .4, sustain: .3, release: .3, vcaMode: 0, accent: .6, lfoRate: .35, lfoWave: 1, range: 1, swing: .1, gateLen: .6 },
    bend: { vBatt: 5.6, rBatt: 4, tReset: 0.00008, rDis: 900, cf1: 680e-12, otaOff: 0.018 },
    br: { 'LFOTRI>VCOCV': .2, 'VCFOUT>VCOCV': .55, 'SAW>ENVCAP': .3, 'FINGER>VCFIN': .3 } },
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
if (!state || state.v !== 2 || !state.params) state = presetState('Acid line');
// v0.40.0 (Johnny: "remove the sequencer"): a saved session's pattern, slots, tempo, scale and control sequencers are dropped
for (const k of ['steps', 'len', 'bpm', 'slots', 'slot', 'chain', 'scale', 'cseq', 's101']) delete state[k];
state.v = 2; state.bend = { ...stockBend(), ...(state.bend || {}) }; state.br = state.br || {};
state.params = { ...defaults, ...knownParams(state.params) }; delete state.fx;
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('kestrel-ms1-v2', JSON.stringify(state)); } catch (e) {} }, 300); }
