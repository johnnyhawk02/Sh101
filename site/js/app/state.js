// Shyoy: Patterns, the saved state and the pattern slots data.
// ---------- patterns ----------
function parsePat(str) {
  return str.split(',').map(t => t.trim()).map(t => {
    if (t[0] === '.') return { n: 0, o: 0, m: 'R', a: false, s: false };
    const tie = t[0] === '_';
    const m = /^([A-G]#?)?([+-]?)\s*([as]*)$/.exec(tie ? t.slice(1).trim() : t) || [];
    const n = m[1] ? NOTE.indexOf(m[1]) : 0;
    return { n, o: m[2] === '+' ? 1 : m[2] === '-' ? -1 : 0, m: tie ? 'T' : 'N', a: (m[3] || '').includes('a'), s: (m[3] || '').includes('s') };
  });
}
const PRESETS = {
  'Acid line': { bpm: 126, p: { accVcf: 0.45, saw: .85, pulse: 0, sub: .25, noise: 0, cutoff: .3, reso: .8, drive: .55, vcfEnv: .6, kybd: .5, attack: 0, decay: .38, sustain: 0, release: .22, vcaMode: 0, accent: .75, slide: .22, glideMode: 1, range: 1, swing: .12, gateLen: .5 },
    pat: 'C a, C, C+ s, C, D# a, ., F s, G, C a, _, A#-, C s, D#+ a, C+ s, G, A# a' },
  'Sub bass': { bpm: 118, p: { accVcf: 0.25, saw: .3, pulse: .55, sub: .85, subType: 0, noise: 0, cutoff: .34, reso: .25, drive: .6, vcfEnv: .35, kybd: .5, attack: 0, decay: .45, sustain: .35, release: .2, vcaMode: 0, accent: .4, pw: .15, pwmSrc: 1, range: 0, swing: .08, gateLen: .6 },
    pat: 'C, ., C, C+, ., C, A#-, C, C, ., D#, C, ., C+ s, C, G-' },
  'PWM arp': { bpm: 132, p: { accVcf: 0.25, saw: 0, pulse: .85, sub: .3, subType: 2, noise: 0, cutoff: .45, reso: .45, drive: .4, vcfEnv: .45, kybd: .5, attack: 0, decay: .35, sustain: .3, release: .35, vcaMode: 0, accent: .4, pw: .7, pwmSrc: 0, lfoRate: .45, lfoWave: 0, range: 1, swing: 0, gateLen: .45 },
    pat: 'C, D#, G, C+, D#+, G, C+ s, D#+, A#-, D, F, A#, D+, F, A# s, D+' },
  'Starved & bent': { bpm: 104, p: { accVcf: 0.375, saw: .8, pulse: .3, sub: .4, noise: 0, cutoff: .4, reso: .7, drive: .6, vcfEnv: .45, kybd: .4, attack: 0, decay: .4, sustain: .3, release: .3, vcaMode: 0, accent: .6, lfoRate: .35, lfoWave: 1, range: 1, swing: .1, gateLen: .6 },
    bend: { vBatt: 5.6, rBatt: 4, tReset: 0.00008, rDis: 900, cf1: 680e-12, otaOff: 0.018 },
    br: { 'LFOTRI>VCOCV': .2, 'VCFOUT>VCOCV': .55, 'SAW>ENVCAP': .3, 'FINGER>VCFIN': .3 },
    pat: 'C, _, C+, ., G, _ s, C a, ., D#, _, C+ s, C, F, _, G, A#' },
};

// ---------- state ----------
const defaults = {};
for (const m of RACK) for (const it of m.items) defaults[it.f || it.s] = it.def;
for (const b of BENDER) defaults[b.f] = b.def; defaults.transpose = 1; defaults.swing = 0; defaults.gateLen = .5;
for (const u of FX) for (const it of u.items) defaults[it.f || it.s] = it.def;
let state;
function presetState(name) {
  const P = PRESETS[name];
  const bend = stockBend();
  for (const k in (P.bend || {})) { const b = BEND_ITEMS.find(x => x.id === k || x.sw === k); bend[k] = b.sw ? P.bend[k] : toNorm(b, P.bend[k]); }
  return { params: { ...defaults, ...P.p }, bend, br: { ...(P.br || {}) }, steps: parsePat(P.pat), bpm: P.bpm, preset: name, fx: { rat: false, dly: false, lex: false, fold: false, ...(P.fx || {}) } };
}
try { state = JSON.parse(localStorage.getItem('kestrel-ms1-v2')); } catch (e) { state = null; }
if (!state || state.v !== 2 || !state.params || !Array.isArray(state.steps) || !state.steps.length || state.steps.length > 64) state = presetState('Acid line');
if (state.len) { state.steps = state.steps.slice(0, Math.max(1, state.len)); delete state.len; }
for (const st of state.steps) { while (st.n >= 12) { st.n -= 12; st.o++; } st.o = Math.max(-2, Math.min(2, st.o | 0)); }
state.v = 2; state.bend = { ...stockBend(), ...(state.bend || {}) }; state.br = state.br || {};
state.params = { ...defaults, ...migrateCmp(state.params) };
state.fx = { rat: false, dly: false, lex: false, fold: false, ...(state.fx || {}) };
// pattern slots (from the 303 app's banks): 8 patterns, edits save to the selected slot, ctrl/right-click or long-press chains them
const SLOTS = 8;
const slotOf = st => ({ steps: JSON.parse(JSON.stringify(st.steps)), swing: st.params ? st.params.swing : 0, gateLen: st.params ? st.params.gateLen : .5 });
if (!Array.isArray(state.slots) || state.slots.length !== SLOTS) {
  const names = Object.keys(PRESETS);
  state.slots = Array.from({ length: SLOTS }, (_, i) => i === 0 ? slotOf(state) : names[i] ? slotOf(presetState(names[i])) : null);
  state.slot = 0; state.chain = [];
}
if (!(state.slot >= 0 && state.slot < SLOTS)) state.slot = 0;
state.chain = (state.chain || []).filter(k => k >= 0 && k < SLOTS);
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('kestrel-ms1-v2', JSON.stringify(state)); } catch (e) {} }, 300); }
