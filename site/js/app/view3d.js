// Shyoy 3D panel (v0.24.0, after FILTH's view3d.js): the whole synth as ONE flat panel in three.js.
//
// The 2D app keeps running underneath, hidden. This view never talks to the engine itself: every knob, key and switch
// goes through the 2D app's own setters (ctlRegs[id].set, the switch buttons, setFxSw, setRev, setLever, the preset
// menu's own buttons), so presets, MIDI, the control step sequencers and saving are the app's, and the sound is the same.
// It reads state (state.params, state.fx, running, playStep...) every frame and draws only when something changed.
//
// Layout: an 18 x 5 grid, one control per column (C px), one module row per R px, boxed sections with their names
// printed on the panel. Everything printed (boxes, tags, labels, the logo) is one flat canvas over the panel face.
import * as THREE from 'three';
import { RoomEnvironment } from './../vendor/RoomEnvironment.js';

const C = 72, R = 122, M = 24, COLS = 18, ROWS = 5;
const W = COLS * C + 2 * M, H = ROWS * R + 2 * M;
const KR = 19, DEPTH = 18, S2 = 2;                 // knob radius, slab thickness, print pixels per panel px
const MONO = '"Geist Mono", ui-monospace, Menlo, Consolas, monospace', DISPLAY = '"Archivo Black", "Arial Black", sans-serif';
const root = document.documentElement;

// ---------------------------------------------------------------- look (Options): panel colour, lighting, finish, lens
const LOOK_KEY = 'shyoy.look3d';
// defaults (v0.31.8): Johnny's own look from 16 Nov 2026 — grey panel, metal finish, white key light with magenta and
// aqua lights, bigger knobs, longer lens
const LOOK0 = { colour: '#b9bbb8', light: 'studio', bright: 1.49, finish: 'metal', lens: Math.log(25 / 6) / Math.log(8), tilt: 3.5, ksize: 1.14, kstyle: 'yamaha', knobCol: {}, ocd: 0, stickers: ['smile'], stkOn: true, stk: {}, lv: 2,
  lights: [{ col: '#ffffff', int: 1.47, az: 45, el: 47 }, { col: '#fc2ddb', int: 1.89, az: 65, el: 48 }, { col: '#31fcc0', int: 1.59, az: 36, el: 44 }] };   // + lights (v0.31.0), filled from the preset
const look = { ...LOOK0, lights: LOOK0.lights.map((l) => ({ ...l })) };
// saved looks (v0.32.0): four slots in OPTIONS. 1 = the default above, 2 = the cream satin look of v0.31.3 (Johnny);
// 3 and 4 start empty. SAVE then a slot stores the current look there (localStorage shyoy.looks3d).
const copyLook = (l) => JSON.parse(JSON.stringify(l));
const LOOK_SLOTS0 = [copyLook(LOOK0), { colour: '#e4e2da', light: 'studio', bright: 1, finish: 'satin', lens: 0.4, tilt: 0, ksize: 1, lv: 2,
  lights: [{ col: '#ffffff', int: 1.7, az: 129, el: 55 }, { col: '#cfdcff', int: 0.35, az: 309, el: 30 }, { col: '#ffe2c0', int: 0.25, az: 39, el: 12 }] },
  // factory LOOK 3 (v0.32.8, Johnny's screenshot): black panel, metal, warm peach side light
  { colour: '#202122', light: 'studio', bright: 0.8, finish: 'metal', lens: Math.log(14 / 6) / Math.log(8), tilt: 2.1, ksize: 1.12, ocd: 0, stickers: ['smile'], lv: 2,
    lights: [{ col: '#ffffff', int: 1.2, az: 129, el: 68 }, { col: '#d0dcfe', int: 0.2, az: 309, el: 55 }, { col: '#fee2c2', int: 1.38, az: 39, el: 43 }] }, null];
const LOOKS_KEY = 'shyoy.looks3d';
let lookSlots = LOOK_SLOTS0.map((l) => l && copyLook(l));
try { const st = JSON.parse(localStorage.getItem(LOOKS_KEY) || 'null'); if (Array.isArray(st) && st.length === 4) lookSlots = st.map((l, i) => l || (LOOK_SLOTS0[i] && copyLook(LOOK_SLOTS0[i]))); } catch (e) {}
const saveSlots = () => { try { localStorage.setItem(LOOKS_KEY, JSON.stringify(lookSlots)); } catch (e) {} };
let lookSaving = false;
try { Object.assign(look, JSON.parse(localStorage.getItem(LOOK_KEY) || '{}')); } catch (e) {}
if (typeof look.tilt !== 'number') look.tilt = LOOK0.tilt;
if (typeof look.ksize !== 'number') look.ksize = LOOK0.ksize;
if (typeof look.kstyle !== 'string') look.kstyle = 'yamaha';
delete look.boxCol;   // v0.35.0's section backgrounds, dropped (Johnny meant knob colours)
if (!look.knobCol || typeof look.knobCol !== 'object') look.knobCol = {};
// v0.33.4 (Johnny): KNOB SIZE runs 0-100 over the real scale 0.9-1.5 (was 60-135%)
const KSIZE = [0.9, 1.5], ksizeToUI = (k) => Math.max(0, Math.min(100, (k - KSIZE[0]) / (KSIZE[1] - KSIZE[0]) * 100));
look.ksize = Math.max(KSIZE[0], Math.min(KSIZE[1], look.ksize));
if (typeof look.ocd !== 'number') look.ocd = 0;
if (!Array.isArray(look.stickers)) look.stickers = ['smile'];
if (!look.stk || typeof look.stk !== 'object') look.stk = {};
if (typeof look.stkOn !== 'boolean') look.stkOn = true;   // v0.33.1: SHOW STICKERS, on its own, OCD no longer takes them off   // v0.33.0: per-sticker { x, y (panel units), s (scale), r (degrees) }
// three lights (v0.31.0): each { col, int, az (orbit round the panel, degrees, 0 = from the right, 90 = from the top),
// el (height above the panel, degrees) }. All three cast shadows; 2 and 3 start low from the left and right. A lighting preset sets all three; then each
// can be changed in OPTIONS. Older saved looks get theirs from their preset.
const deg = (r) => Math.round(r * 180 / Math.PI);
function presetLights(name) {
  const L = LIGHTS[name] || LIGHTS.studio, [x, y, z] = L.dir, az = deg(Math.atan2(y, x)), hex = (c) => '#' + c.toString(16).padStart(6, '0');
  return [
    { col: hex(L.col), int: L.key, az: (az + 360) % 360, el: deg(Math.atan2(z, Math.hypot(x, y))) },
    { col: L.fill || '#e6ecff', int: 0.4, az: 160, el: 35 },   // v0.31.4: from the left side, low, with its own shadows
    { col: L.rim || '#fff0dc', int: 0.35, az: 20, el: 35 },      // and from the right (Johnny)
  ];
}
const saveLook = () => { try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) {} };
const SWATCHES = ['#e4e2da', '#f4f3ef', '#b9bbb8', '#6c6e70', '#202122', '#c4352b', '#df7a2c', '#e6c24a', '#4e7b56', '#2f5c88', '#ef9fbf'];
const LIGHTS = {
  studio: { name: 'STUDIO', dir: [-0.45, 0.55, 1], col: 0xffffff, key: 1.7, hemi: 0.75 },
  warm: { name: 'WARM', dir: [0.5, 0.6, 1], col: 0xffd2a0, key: 1.7, hemi: 0.7, hemiCol: 0xfff0dc },
  cool: { name: 'COOL', dir: [-0.3, 0.7, 1], col: 0xcfe0ff, key: 1.6, hemi: 0.75, hemiCol: 0xe6eeff },
  raking: { name: 'LOW SUN', dir: [-1, 0.22, 0.42], col: 0xfff3e2, key: 2.4, hemi: 0.45 },
  top: { name: 'OVERHEAD', dir: [0, 1, 0.6], col: 0xffffff, key: 1.8, hemi: 0.65 },
};
if (!Array.isArray(look.lights) || look.lights.length !== 3 || look.lv !== 2) { look.lights = presetLights(look.light); look.lv = 2; }   // lv 2: side lights
const FINISH = { matt: { name: 'MATT', r: 0.95, m: 0, e: 0.25 }, satin: { name: 'SATIN', r: 0.55, m: 0, e: 0.6 }, metal: { name: 'METAL', r: 0.42, m: 0.7, e: 1.1, brushed: true } };
const lensFov = (u) => 6 * Math.pow(8, Math.max(0, Math.min(1, u)));   // 6° (flat) .. 48° (wide)

// ---------------------------------------------------------------- what the panel holds
const DEF = {}; for (const m of RACK) for (const it of m.items) DEF[it.f || it.s] = it;
for (const b of BENDER) DEF[b.f] = b; for (const u of FX) for (const it of u.items) DEF[it.f || it.s] = it;
const K = (id, label) => ({ t: 'knob', id, label });
const S = (id, label, opts, w = 1) => ({ t: 'sw', id, label, opts, w });
const squeeze = (k, bs) => bs.map((b) => ({ ...b, c: b.c * k, s: b.s * k, it: b.it.map((it) => ({ ...it, w: (it.w || 1) * k })) }));
const BOXES = [
  { r: 0, c: 0, s: 2, n: 'LFO', it: [K('lfoRate', 'RATE'), S('lfoWave', 'WAVE', ['TRI', 'SQR', 'RND', 'NOISE'])] },
  { r: 0, c: 2, s: 6, n: 'VCO', it: [S('range', 'RANGE', ["16'", "8'", "4'", "2'"]), K('tune', 'TUNE'), K('vcoMod', 'MOD'), K('pw', 'PW'), S('pwmSrc', 'PWM', ['LFO', 'MAN', 'ENV']), K('drift', 'DRIFT')] },
  { r: 0, c: 8, s: 5, n: 'MIXER', it: [K('saw', 'SAW'), K('pulse', 'PULSE'), K('sub', 'SUB'), K('noise', 'NOISE'), S('subType', 'SUB', ['-1 SQ', '-2 SQ', '-2 25%'])] },
  { r: 1, c: 0, s: 7, n: 'VCF', it: [K('cutoff', 'CUTOFF'), K('reso', 'RES'), K('vcfEnv', 'ENV'), K('vcfMod', 'MOD'), K('kybd', 'KYBD'), K('drive', 'DRIVE'), K('accVcf', 'ACC')] },
  { r: 1, c: 7, s: 5, n: 'ENVELOPE', it: [K('attack', 'A'), K('decay', 'D'), K('sustain', 'S'), K('release', 'R'), S('trig', 'TRIG', ['G+T', 'GATE', 'LFO'])] },
  { r: 1, c: 12, s: 2, n: 'VCA', it: [S('vcaMode', 'MODE', ['ENV', 'GATE']), K('level', 'LEVEL')] },
  { r: 1, c: 14, s: 4, n: 'PERFORM', it: [K('glide', 'PORTA'), S('glideMode', 'MODE', ['OFF', 'AUTO', 'ON']), K('slide', 'SLIDE'), K('accent', 'ACCENT')] },
  // row 2 holds 19 columns of controls since the drive's Mix (v0.26.0): its boxes and columns are 18/19 of the grid
  ...squeeze(18 / 19, [
  { r: 2, c: 0, s: 3, n: 'FOLDER', on: 'fold', it: [K('fldtimbre', 'TIMBRE'), K('fldsym', 'SYMM'), K('fldlevel', 'LEVEL')] },
  { r: 2, c: 3, s: 5, n: 'DRIVE', on: 'rat', it: [S('drvtype', 'PEDAL', ['RAT', 'DS-1', 'TS808']), { t: 'slot', g: 'drv', k: 0 }, { t: 'slot', g: 'drv', k: 1 }, { t: 'slot', g: 'drv', k: 2 }, K('drvmix', 'MIX')] },
  { r: 2, c: 8, s: 5, n: 'FLANGER', on: 'flg', it: [S('flgmode', 'MODE', ['FLANGE', 'CHORUS']), K('flgman', 'MANUAL'), K('flgdep', 'DEPTH'), K('flgrate', 'RATE'), K('flgres', 'RES')] },
  { r: 2, c: 13, s: 6, n: 'DELAY', on: 'dly', it: [K('dlytime', 'TIME'), K('dlyfb', 'FDBK'), K('dlylo', 'LO CUT'), K('dlyhi', 'HI CUT'), K('dlymix', 'RETURN'), S('dlypp', 'MODE', ['MONO', 'PING'])] }]),
  { r: 3, c: 0, s: 13, n: 'REVERB', on: 'lex', it: [S('revtype', 'TYPE', ['224', 'PLATE', 'SPRING', 'CONV']), { t: 'prog', w: 2 },
    ...Array.from({ length: 10 }, (_, k) => ({ t: 'slot', g: 'rev', k }))] },
  { r: 3, c: 13, s: 2, n: 'COMPACTOR', it: [K('cmpamt', 'AMOUNT'), K('cmprel', 'RELEASE')] },
  { r: 3, c: 15, s: 3, n: 'ROUTING', it: [S('fxorder', 'ORDER', ['FOLD>DRV', 'DRV>FOLD'], 1.5), S('fxret', 'RETURNS', ['PARALLEL', 'DLY>REV', 'REV>DLY'], 1.5)] },
  { r: 4, c: 0, s: 7, n: 'BENDER', it: [K('bendVco', 'VCO'), K('bendVcf', 'VCF'), K('lfoMod', 'LFO MOD'), { t: 'lever', w: 2 }, { t: 'key', k: 'mod', label: 'MOD' }, S('transpose', 'OCTAVE', ['LOW', 'MID', 'HIGH'])] },
  { r: 4, c: 7, s: 8, n: 'SEQUENCER', it: [{ t: 'key', k: 'run', label: 'RUN' }, { t: 'knob', id: 'bpm', label: 'TEMPO' }, { t: 'pattern', w: 4 }, { t: 'key', k: 'gen', label: 'GENERATE' }, { t: 'key', k: 'edit', label: 'EDIT' }] },
  { r: 4, c: 15, s: 3, n: 'PRESET', it: [{ t: 'preset', w: 3 }] },
];
const TITLE = { x: M + 13 * C, y: M, w: 5 * C, h: R };

// ---------------------------------------------------------------- the app's own setters
const regOf = (id) => (ctlRegs[id] || []).find((r) => r.el.isConnected && r.el !== cv) || null;
// the sequencer page's own knobs, each through the 2D control it stands for
const SQK = {
  len: { el: () => document.querySelector('input[data-a=len]'), lo: 1, hi: 64, text: (n) => n + (n === 1 ? ' STEP' : ' STEPS'), get: () => state.steps.length },
  dens: { el: () => document.getElementById('sqDens'), lo: 10, hi: 100, text: (n) => n + '%', get: () => Math.round(genDens * 100) },
  cplx: { el: () => document.getElementById('sqRndDepth'), lo: 0, hi: 100, text: (n) => n + '%', get: () => +document.getElementById('sqRndDepth').value },
};
function setKnob(id, v) {
  if (SQK[id]) { const q = SQK[id], n = Math.round(q.lo + (q.hi - q.lo) * Math.max(0, Math.min(1, v))); if (n !== q.get()) { const el = q.el(); el.value = n; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
  if (id === 'bpm') { const b = Math.round(40 + 200 * Math.max(0, Math.min(1, v))); if (b !== state.bpm) { bpmEl.value = b; bpmEl.onchange(); } return; }
  const r = regOf(id); if (r) r.set(Math.max(0, Math.min(1, v)));
}
const sqU = (id) => { const q = SQK[id]; return (q.get() - q.lo) / (q.hi - q.lo); };
const knobVal = (id) => SQK[id] ? sqU(id) : id === 'bpm' ? (state.bpm - 40) / 200 : (cseqLive[id] ? cseqHeard(id) : state.params[id]);
const knobBase = (id) => SQK[id] ? sqU(id) : id === 'bpm' ? (state.bpm - 40) / 200 : state.params[id];
const knobText = (id, v) => SQK[id] ? SQK[id].text(SQK[id].get()) : id === 'bpm' ? state.bpm + ' BPM' : String(DEF[id] && DEF[id].fmt ? DEF[id].fmt(v) : Math.round(v * 100));
const swVal = (id) => state.params[id] | 0;
function setSw(id, i) {
  boot();
  if (id === 'drvtype') { setFxSw('drvtype', i); drawDrv(); }
  else if (id === 'revtype') setRev('revtype', i);
  else if (id === 'flgmode') fgModeEl.querySelector(`[data-t="${i}"]`).click();
  else if (id === 'dlypp') dlyModeEl.querySelector(`[data-t="${i}"]`).click();
  else if (id === 'fxorder' || id === 'fxret') routeSegs[id].querySelector(`[data-i="${i}"]`).click();
  else { const b = document.getElementById(`s-${id}-${i}`); if (b) b.click(); }
}
const revItems = () => FX.find((u) => u.rv).items.filter((it) => it.f && it.rev === REV_IDS[Math.max(0, Math.min(3, state.params.revtype | 0))]);
const drvItems = () => FX.find((u) => u.dv).items.filter((it) => it.f && it.drv === DRV_IDS[Math.max(0, Math.min(2, state.params.drvtype | 0))]);
const slotItem = (g, k) => (g === 'rev' ? revItems() : drvItems())[k] || null;
// a control's label as the 2D page shows it (the reverb renames some for its programs)
const domLabel = (id) => { const l = document.querySelector(`label[for="f-${id}"]`); return l ? l.textContent.trim().toUpperCase() : (DEF[id] ? DEF[id].label.toUpperCase() : id); };
const progOf = () => RV_PROG[REV_IDS[Math.max(0, Math.min(3, state.params.revtype | 0))]];

// ---------------------------------------------------------------- renderer, scene
await Promise.race([Promise.all([document.fonts.load(`600 12px ${MONO}`), document.fonts.load(`400 14px ${DISPLAY}`)]), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
const logo = new Image(); logo.src = 'icons/logo.png';
await Promise.race([logo.decode().catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
const cv = renderer.domElement; cv.id = 'v3d';
document.body.appendChild(cv);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(15, 1, 10, 100000);
const hemi = new THREE.HemisphereLight(0xffffff, 0x303030, 1); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.5; key.shadow.radius = 4;
Object.assign(key.shadow.camera, { left: -W * 0.62, right: W * 0.62, top: H * 0.75, bottom: -H * 0.75, near: 10, far: 6000 });
scene.add(key, key.target);
const lamps = [key, new THREE.DirectionalLight(0xffffff, 0), new THREE.DirectionalLight(0xffffff, 0)];   // all three cast shadows (v0.31.4)
for (const l of lamps.slice(1)) {
  l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = key.shadow.bias; l.shadow.normalBias = key.shadow.normalBias; l.shadow.radius = 5;
  Object.assign(l.shadow.camera, { left: -W * 0.62, right: W * 0.62, top: H * 0.75, bottom: -H * 0.75, near: 10, far: 6000 }); scene.add(l, l.target);
}

const P = (px, py, z = 0) => new THREE.Vector3(px - W / 2, H / 2 - py, z);   // panel px (y down) -> world
const panelMat = new THREE.MeshStandardMaterial({ color: 0xe4e2da, roughness: 0.6 });
const edgeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
const KNOB_BUMP = 4.5, PANEL_BUMP = 1.4, EDGE_BUMP = 1.5;   // wear depths (bump maps, below)
const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, DEPTH), [edgeMat, edgeMat, edgeMat, edgeMat, panelMat, edgeMat]);
slab.position.z = -DEPTH / 2; slab.receiveShadow = true; scene.add(slab);
// two pages on the one panel (v0.25.0): the synth, and the sequencer; the logo and the page keys are on both
const pages = { synth: new THREE.Group(), seq: new THREE.Group() }; scene.add(pages.synth, pages.seq);
let page = 'synth'; try { if (localStorage.getItem('shyoy.page3d') === 'seq') page = 'seq'; } catch (e) {}
let grp = pages.synth, buildPage = 'synth';
// brushed streaks for the metal finish
const brushed = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) { const v = 90 + Math.random() * 90 | 0; x.fillStyle = `rgba(${v},${v},${v},.35)`; x.fillRect(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 220, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2); return t;
})();

// the print: one flat canvas over the face (lettering is flat black or white, never lit or shaded)
const pc = document.createElement('canvas'); pc.width = W * S2; pc.height = H * S2;
const px = pc.getContext('2d'); px.scale(S2, S2);
const printTex = new THREE.CanvasTexture(pc); printTex.colorSpace = THREE.SRGBColorSpace; printTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const print = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: printTex, transparent: true, depthWrite: false }));
print.position.z = 0.05; print.renderOrder = 1; scene.add(print);

const mat = {
  knob: new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.7, metalness: 0, envMapIntensity: 0.5 }),
  knobTop: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.45, metalness: 0, envMapIntensity: 0.8 }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  keyTop: new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.42, metalness: 0, envMapIntensity: 0.9 }),
  keySide: new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.5, metalness: 0, envMapIntensity: 0.7 }),
  ledOn: new THREE.MeshBasicMaterial({ color: 0xff2a14 }),
  ledOff: new THREE.MeshStandardMaterial({ color: 0x3a0906, roughness: 0.35, metalness: 0, envMapIntensity: 1 }),
  glow: new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,60,30,.9)'); g.addColorStop(0.35, 'rgba(255,40,20,.35)'); g.addColorStop(1, 'rgba(255,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
};
// ---------------------------------------------------------------- wear (v0.30.0): scuffs, dents and knocks
// Bump maps built on canvases from two CC0 ambientCG height maps (site/textures/SOURCES.txt): SurfaceImperfections014
// for fine scuffing, Metal049C for small dents; bigger dents, knocks and scratches are drawn on top. A seeded random, so
// the same knob keeps the same marks on every load.
const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const loadImg = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = new URL(u, import.meta.url).href; });
const [scuffImg, dentImg] = await Promise.all([loadImg('../../textures/scuffs.jpg'), loadImg('../../textures/dents.jpg')]);
// w x h canvas, mid grey = untouched; o: scuff/dent image strength, tile (image repeats across), big dents [n, size, depth],
// scratches [n, length], knocks [n, size] crowded to the edges (for the case)
function wearTex(w, h, seed, o) {
  const R = rng(seed), c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
  const tiled = (img, alpha, tile) => {
    if (!img || !alpha) return; x.globalAlpha = alpha; const tw = w / tile, ox = R() * tw, oy = R() * tw;
    for (let ty = -oy; ty < h; ty += tw) for (let tx = -ox; tx < w; tx += tw) x.drawImage(img, tx, ty, tw, tw);
    x.globalAlpha = 1;
  };
  tiled(scuffImg, o.scuff, o.tile || 1); tiled(dentImg, o.dent, (o.tile || 1) * 1.5);
  const wrap = (fn) => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) fn(dx, dy); };
  const dent = (px, py, r, d) => wrap((dx, dy) => {
    const g = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, r);
    g.addColorStop(0, `rgba(0,0,0,${d})`); g.addColorStop(0.55, `rgba(0,0,0,${d * 0.45})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(px + dx, py + dy, r, r * (0.6 + 0.4 * R()), 0, 0, 7); x.fill();
  });
  const [bn = 0, bs = 0, bd = 0] = o.big || [];
  for (let i = 0; i < bn; i++) dent(R() * w, R() * h, bs * (0.4 + R()), bd * (0.4 + 0.6 * R()));
  const [kn = 0, ks = 0] = o.knocks || [];
  for (let i = 0; i < kn; i++) {   // knocks: near an edge or a corner, a dent with a chipped, raised lip
    const e = R() * 4 | 0, t = R(), m = R() * R() * ks * 1.5;
    const px = e === 0 ? m : e === 1 ? w - m : t * w, py = e === 2 ? m : e === 3 ? h - m : t * h, r = ks * (0.4 + R());
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = r * 0.25; x.beginPath(); x.arc(px, py, r * 0.9, 0, 7); x.stroke();
    dent(px, py, r, 0.55 + 0.4 * R());
  }
  const [sn = 0, sl = 0] = o.scratches || [];
  x.lineCap = 'round';
  for (let i = 0; i < sn; i++) {
    const px = R() * w, py = R() * h, a = R() * Math.PI, l = sl * (0.3 + R()), bend = (R() - 0.5) * l * 0.3;
    x.strokeStyle = `rgba(0,0,0,${0.25 + 0.4 * R()})`; x.lineWidth = 0.6 + R() * 1.4;
    wrap((dx, dy) => { x.beginPath(); x.moveTo(px + dx, py + dy); x.quadraticCurveTo(px + dx + Math.cos(a) * l / 2 - Math.sin(a) * bend, py + dy + Math.sin(a) * l / 2 + Math.cos(a) * bend, px + dx + Math.cos(a) * l, py + dy + Math.sin(a) * l); x.stroke(); });
  }
  if (o.edge) {   // [middle, at the edge, reach px]: the wear's depth, from barely there in the middle to deep at the edges
    const [mid, rim, reach] = o.edge, img = x.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0, i = 0; y < h; y++) for (let xx = 0; xx < w; xx++, i += 4) {
      const t = Math.min(1, Math.min(xx, y, w - 1 - xx, h - 1 - y) / reach), f = mid + (rim - mid) * Math.pow(1 - t, 1.6);
      const v = Math.max(0, Math.min(255, 128 + (d[i] - 128) * f)); d[i] = d[i + 1] = d[i + 2] = v;
    }
    x.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
// the case: the face, and the black edges round it
const PANEL_WEAR = { scuff: 0.35, dent: 0.35, tile: 4, big: [26, 22, 0.35], knocks: [22, 30], scratches: [90, 120], edge: [0.12, 1.6, 260] };   // v0.31.6: faint round the knobs, deep at the edges (Johnny)
const panelWear = wearTex(2048, 1024, 101, PANEL_WEAR);
const seqWear = wearTex(2048, 1024, 909, PANEL_WEAR);   // v0.32.1: the sequencer page has its own marks (Johnny)
const wearOf = (p) => p === 'seq' ? seqWear : panelWear;
const edgeWear = wearTex(1024, 128, 202, { scuff: 0.5, dent: 0.3, tile: 8, big: [10, 10, 0.5], knocks: [22, 16], scratches: [30, 50] });
// knobs: four worn sets; each knob takes one, turned and shifted its own way, and a wear depth from barely to well used
panelMat.bumpMap = wearOf(page); panelMat.bumpScale = PANEL_BUMP; edgeMat.bumpMap = edgeWear; edgeMat.bumpScale = EDGE_BUMP; edgeWear.repeat.set(8, 1);
window.shyoyWearMaps = () => ({ panel: panelWear.image, seq: seqWear.image, edges: edgeWear.image, knobs: knobWear.map((t) => t.image) });   // to look at the bump maps (console)
print.material = new THREE.MeshStandardMaterial({ map: printTex, transparent: true, depthWrite: false, roughness: 0.45, metalness: 0, envMapIntensity: 0.7, bumpMap: wearOf(page), bumpScale: PANEL_BUMP * 1.6 });   // v0.31.3: the print is lit and carries the dents
print.receiveShadow = true;
const knobWear = [1, 2, 3, 4].map((i) => wearTex(512, 512, 300 + i, { scuff: 0.12 + 0.06 * i, dent: 0.25 + 0.1 * i, tile: 1, big: [2 + 2 * i, 14, 0.3 + 0.08 * i], scratches: [6 + 5 * i, 70] }));

// the knob (v0.30.0): Johnny's Yamaha CS1x/CS2x/AN1x knob STL: a fluted, tapered cap on a flared skirt with a pointed
// nub, and a triangle on top. The 50k-triangle original is simplified to ~5.6k offline (its top's shallow triangle
// recess flattened first, and drawn back here as a white inlay). Smooth-shaded with creases kept, squashed to SQ of
// its height, scaled so the skirt is KR + 2 across. Its pointer lies along +y, so the value-to-angle mapping is unchanged.
const KNOB = await (async () => {
  const buf = await (await fetch(new URL('../../models/yamaha-knob.stl', import.meta.url))).arrayBuffer();
  const dv = new DataView(buf), n = dv.getUint32(80, true), SQ = 0.7, TRI = [[0, 3.03], [-2.02, -3.03], [2.02, -3.03]];
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let j = 0; j < 9; j++) pos[i * 9 + j] = dv.getFloat32(84 + 50 * i + 12 + 4 * j, true);
  let zTop = 0; for (let i = 2; i < pos.length; i += 3) zTop = Math.max(zTop, pos[i]);
  const s = (KR + 2) / 9.9, sets = { body: [], top: [] };
  for (let i = 0; i < n; i++) {
    const p = [0, 1, 2].map((j) => [pos[i * 9 + j * 3], pos[i * 9 + j * 3 + 1], pos[i * 9 + j * 3 + 2]]);
    const e1 = p[1].map((v, k) => v - p[0][k]), e2 = p[2].map((v, k) => v - p[0][k]);
    const nz = (e1[0] * e2[1] - e1[1] * e2[0]) / (Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) || 1);
    sets[nz > 0.9 && p.every(([, , z]) => z > zTop - 0.2) ? 'top' : 'body'].push(...p.flat());
  }
  // smooth normals, but only across edges under CREASE: the flutes and the skirt's rim stay sharp
  const CREASE = Math.cos(35 * Math.PI / 180);
  function geo(a, sc) {
    const g = new THREE.BufferGeometry(), m = a.length / 9, fn = [], at = new Map(), key = (i) => a[i].toFixed(3) + ',' + a[i + 1].toFixed(3) + ',' + a[i + 2].toFixed(3);
    for (let f = 0; f < m; f++) {
      const o = f * 9, u = [a[o + 3] - a[o], a[o + 4] - a[o + 1], a[o + 5] - a[o + 2]], v = [a[o + 6] - a[o], a[o + 7] - a[o + 1], a[o + 8] - a[o + 2]];
      const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...c) || 1;
      fn.push([c[0] / l, c[1] / l, c[2] / l, l]);
      for (let j = 0; j < 3; j++) { const k = key(o + j * 3); (at.get(k) || at.set(k, []).get(k)).push(f); }
    }
    const nor = new Float32Array(a.length), uv = new Float32Array(m * 6);
    for (let f = 0; f < m; f++) {
      const N = fn[f], us = [];
      for (let j = 0; j < 3; j++) {
        const o = f * 9 + j * 3; let x = 0, y = 0, z = 0;
        for (const g of at.get(key(o))) { const M = fn[g]; if (M[0] * N[0] + M[1] * N[1] + M[2] * N[2] > CREASE) { x += M[0] * M[3]; y += M[1] * M[3]; z += M[2] * M[3]; } }
        const l = Math.hypot(x, y, z) || 1; nor[o] = x / l; nor[o + 1] = y / l; nor[o + 2] = z / l;
        // texture: wrapped round the sides (one turn = one texture width), straight down on anything facing up
        const X = a[o], Y = a[o + 1], Z = a[o + 2];
        us.push(Math.abs(N[2]) > 0.7 ? [X / 50 + 0.5, Y / 50 + 0.5, 1] : [Math.atan2(Y, X) / (2 * Math.PI) + 0.5, Z / 50, 0]);
      }
      if (!us[0][2]) { const lo = Math.min(...us.map((q) => q[0])); for (const q of us) if (q[0] - lo > 0.5) q[0] -= 1; }   // across the seam
      us.forEach((q, j) => { uv[f * 6 + j * 2] = q[0]; uv[f * 6 + j * 2 + 1] = q[1]; });
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.scale(s, s, s * sc); return g;
  }
  const z = zTop + 0.03, tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute(TRI.flatMap(([x, y]) => [x, y, z]), 3)); tri.computeVertexNormals(); tri.scale(s, s, s * SQ);
  return { body: geo(sets.body, SQ), top: geo(sets.top, SQ), ptr: tri, h: z * s * SQ };
})();
// the odd one out (v0.32.3, Johnny): the filter knob is a mismatched spare, a pink standard round knob: a thin skirt,
// a knurled grip, a bevelled, slightly domed top and a white line. Its line points along +y like the others.
mat.pink = new THREE.MeshStandardMaterial({ color: 0xc23a74, roughness: 0.5, metalness: 0, envMapIntensity: 0.5 });
const PINK = (() => {
  const prof = [[0, 0], [19.5, 0], [19.5, 2.4], [17.2, 3.4], [17.2, 15.2], [16, 16.8], [14.5, 17.5], [8, 17.9], [0, 18]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 144), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {   // knurling: 36 ridges round the grip
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (y > 3.6 && y < 15.0 && r > 16) { const a = Math.atan2(z, x), k = 1 + 0.045 * Math.max(0, Math.cos(36 * a)); p.setX(i, x * k); p.setZ(i, z * k); }
  }
  g.rotateX(Math.PI / 2); g.computeVertexNormals();
  const ptr = new THREE.BoxGeometry(2, 11.5, 0.5); ptr.translate(0, 3 + 11.5 / 2, 18.05);
  return { body: g, ptr };
})();
// knob styles (v0.35.0, Johnny: "a choice of knobs for the whole synth", OPTIONS > KNOBS > STYLE, look.kstyle):
// YAMAHA (the CS1x/AN1x STL above), POT (Johnny's pot-knob5.stl as it was in v0.29.1), ROUND (a black standard
// knurled knob, the pink spare's shape), CHICKEN (a chicken-head pointer) and SKIRT (a fluted cap on a wide skirt).
// Every style: { body, top?, ptr, h }, pointer along +y, sat on z 0. The cutoff's pink spare stays whatever the style.
const planarUV = (g) => { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 50 + 0.5; uv[i * 2 + 1] = p.getY(i) / 50 + 0.5 + p.getZ(i) / 50; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; };
const POT = await (async () => {
  const buf = await (await fetch(new URL('../../models/pot-knob5.stl', import.meta.url))).arrayBuffer();
  const dv = new DataView(buf), n = dv.getUint32(80, true), sets = { body: [], top: [], ptr: [] };
  const read = (o) => [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, zTop = 0; const tris = [];
  for (let i = 0; i < n; i++) { const o = 84 + 50 * i, t = [read(o + 12), read(o + 24), read(o + 36)]; tris.push(t); for (const [x, y] of t) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = (x1 - x0) / 2;
  for (const t of tris) for (const [x, y, z] of t) if (Math.hypot(x - cx, y - cy) > r * 0.99) zTop = Math.max(zTop, z);
  const SQ = 0.5, BEV = 1.1, PW = 0.5, zT = zTop * SQ, near = (v, w) => Math.abs(v - w) < 1e-3;
  const ring = (x, y, rr) => { const h = Math.hypot(x, y); return [x * rr / h, y * rr / h]; };
  const edges = new Map();
  for (const t of tris) {
    const p = t.map(([x, y, z]) => [x - cx, y - cy, z]);
    const isPtr = p.every(([x, y]) => Math.abs(x) < r * 0.2 && y > -r * 0.3) && p.some(([, , z]) => z > zTop + 1e-3);
    const isTop = !isPtr && p.every(([, , z]) => near(z, zTop));
    if (!isPtr && p.every(([x, y]) => Math.hypot(x, y) < r * 0.6)) continue;
    if (isPtr) { sets.ptr.push(...p.flatMap(([x, y, z]) => [x * PW, Math.min(y, r - BEV - 0.35), z - zTop + zT])); continue; }
    const out = p.map(([x, y, z]) => { const rim = near(z, zTop) && Math.hypot(x, y) > r * 0.99; if (rim && isTop) return [...ring(x, y, r - BEV), zT]; if (rim) return [x, y, zT - BEV]; return [x, y, z * SQ]; });
    if (!isTop) { const top = p.filter(([x, y, z]) => near(z, zTop) && Math.hypot(x, y) > r * 0.99); if (top.length === 2) edges.set(top.map(([x, y]) => x.toFixed(3) + ',' + y.toFixed(3)).sort().join('|'), top); }
    sets[isTop ? 'top' : 'body'].push(...out.flat());
  }
  for (const [[ax, ay], [bx, by]] of edges.values()) {
    const lo = (x, y) => [x, y, zT - BEV], hi = (x, y) => [...ring(x, y, r - BEV), zT];
    const ccw = ax * by - ay * bx > 0, [p, q] = ccw ? [[ax, ay], [bx, by]] : [[bx, by], [ax, ay]];
    sets.top.push(...lo(...p), ...lo(...q), ...hi(...q), ...lo(...p), ...hi(...q), ...hi(...p));
  }
  const s = (KR + 1) / r, geo = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); g.scale(s, s, s); g.computeVertexNormals(); return planarUV(g); };
  return { body: geo(sets.body), top: geo(sets.top), ptr: geo(sets.ptr), h: Math.max(...sets.ptr.filter((_, i) => i % 3 === 2)) * s };
})();
const lathe = (pts, seg, fn) => {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), p = g.attributes.position;
  if (fn) for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = fn(Math.atan2(z, x), y, Math.hypot(x, z)); p.setX(i, x * k); p.setZ(i, z * k); }
  g.rotateX(Math.PI / 2); g.computeVertexNormals(); return g;
};
const line = (w, l, y0, z) => { const b = new THREE.BoxGeometry(w, l, 0.5); b.translate(0, y0 + l / 2, z); return b; };
const ROUND = { body: PINK.body, ptr: PINK.ptr, h: 18 };
const CHICKEN = (() => {
  const base = lathe([[0, 0], [18, 0], [18, 1.8], [16.8, 3.2], [0, 3.2]], 96);
  const sh = new THREE.Shape(); sh.moveTo(0, 22); sh.bezierCurveTo(3, 14, 10, 6, 10, -3); sh.bezierCurveTo(10, -12, -10, -12, -10, -3); sh.bezierCurveTo(-10, 6, -3, 14, 0, 22);
  const head = new THREE.ExtrudeGeometry(sh, { depth: 11, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.4, bevelSegments: 3, curveSegments: 24 });
  head.translate(0, 0, 4.6); planarUV(head);
  const body = mergeGeos([base, head]);
  return { body, ptr: line(1.4, 12, 6, 17.3), h: 17.3 };
})();
const SKIRT = (() => {
  const body = lathe([[0, 0], [22, 0], [22, 1.6], [20.5, 3.4], [12.5, 3.8], [12.5, 15.5], [11.6, 16.8], [6, 17.3], [0, 17.4]], 160,
    (a, y, r) => (y > 4 && y < 15.6 && r > 12) ? 1 + 0.06 * Math.pow(Math.max(0, Math.cos(18 * a)), 3) : 1);
  return { body, ptr: mergeGeos([line(1.6, 7, 13, 3.95), line(1.4, 7.5, 2.5, 17.45)]), h: 17.4 };
})();
function mergeGeos(gs) {   // non-indexed position/normal/uv merge
  const parts = gs.map((g) => g.index ? g.toNonIndexed() : g), cat = (k, n) => { const out = []; for (const g of parts) { const a = g.attributes[k]; if (a) out.push(...a.array); else out.push(...new Array(g.attributes.position.count * n).fill(0)); } return new Float32Array(out); };
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(cat('position', 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(cat('normal', 3), 3)); g.setAttribute('uv', new THREE.BufferAttribute(cat('uv', 2), 2)); return g;
}
const KSTYLES = { yamaha: { name: 'YAMAHA', g: KNOB }, pot: { name: 'POT', g: POT }, round: { name: 'ROUND', g: ROUND }, chicken: { name: 'CHICKEN', g: CHICKEN }, skirt: { name: 'SKIRT', g: SKIRT } };
const kstyle = () => KSTYLES[look.kstyle] ? look.kstyle : 'yamaha';
const ledGeo = new THREE.CylinderGeometry(2.2, 2.2, 1.4, 20); ledGeo.rotateX(Math.PI / 2);
const keyGeos = {};
function keyGeo(w, h, d) {
  const k = [w, h, d].join(); if (keyGeos[k]) return keyGeos[k];
  const B = 1.4, r = 2, x0 = -w / 2 + B, y0 = -h / 2 + B, x1 = w / 2 - B, y1 = h / 2 - B, s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return keyGeos[k] = new THREE.ExtrudeGeometry(s, { depth: d - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 3, curveSegments: 4 }).translate(0, 0, B);
}

// ---------------------------------------------------------------- building the controls
const ctls = [];            // every control: { kind, rect (panel px hit area), ... , sync() -> true when it changed }
const knobs = [];
let dirty = true, shadowDirty = true, printDirty = true;
function makeKnob(cx, cy, o) {
  const g = new THREE.Group(); g.position.copy(P(cx, cy, 0));
  // its own wear: one of the worn sets, turned and shifted, at a depth from barely marked to well knocked about
  const R = rng(knobs.length * 7919 + 13), wear = knobWear[R() * knobWear.length | 0].clone();
  wear.offset.set(R(), R()); wear.rotation = R() * Math.PI * 2; const depth = 0.15 + 0.85 * Math.pow(R(), 1.8);
  const sec = BOXR[BOXR.length - 1]; if (sec) sec.knobs = true; const secKey = sec ? boxKey(sec) : '';
  const mBody = mat.knob.clone(), mTop = mat.knobTop.clone(), mPtr = mat.white.clone(); mBody.bumpMap = mTop.bumpMap = wear; mBody.bumpScale = mTop.bumpScale = KNOB_BUMP * depth;
  // the usual knob, and for the filter knob (o.odd) also the mismatched pink spare (v0.32.3), shown unless OCD is past 50
  const std = new THREE.Group(), styles = {};
  const styleG = (id) => {   // v0.35.0: built the first time a style is picked, then kept
    if (styles[id]) return styles[id]; const G = KSTYLES[id].g, sg = new THREE.Group();
    const body = new THREE.Mesh(G.body, mBody); body.castShadow = true; body.receiveShadow = true; sg.add(body);
    if (G.top) { const top = new THREE.Mesh(G.top, mTop); top.castShadow = true; sg.add(top); }
    const ptr = new THREE.Mesh(G.ptr, mPtr); sg.add(ptr); return styles[id] = sg;
  };
  let curStyle = null; const setStyle = (id) => { if (id === curStyle) return; if (curStyle) std.remove(styles[curStyle]); std.add(styleG(id)); curStyle = id; };
  setStyle(kstyle());
  let oddG = null, mp = null;
  if (o.odd) {
    mp = mat.pink.clone(); mp.bumpMap = wear; mp.bumpScale = KNOB_BUMP * depth * 0.4;
    const pb = new THREE.Mesh(PINK.body, mp); pb.castShadow = true; pb.receiveShadow = true;
    const pp = new THREE.Mesh(PINK.ptr, mat.white); pp.castShadow = true; oddG = new THREE.Group(); oddG.add(pb, pp);
  }
  // a pot's shaft is never quite square to the panel (v0.31.5): each leans its own way, by up to look.tilt degrees
  const tiltG = new THREE.Group(), tiltDir = R() * Math.PI * 2, tiltAmt = 0.35 + 0.65 * R();
  const spin = new THREE.Group(); spin.add(std); if (oddG) spin.add(oddG); tiltG.add(spin); g.add(tiltG); grp.add(g);
  const k = { kind: 'knob', cx, cy, g, spin, shown: NaN, tilt: (deg) => { const a = deg * tiltAmt * Math.PI / 180; tiltG.quaternion.setFromAxisAngle(new THREE.Vector3(Math.cos(tiltDir), Math.sin(tiltDir), 0), a); }, size: (u) => tiltG.scale.setScalar(u), style: setStyle,
    colour: () => { const c = look.knobCol[secKey]; mBody.color.set(c || mat.knob.color); mTop.color.set(c || mat.knobTop.color); if (c) mTop.color.multiplyScalar(1.08);
      mPtr.color.set(c && lum(c) > 0.35 ? 0x111111 : 0xffffff); },   // a pale knob gets a black line
    clean: (c) => {   // OCD: c 0 = as found .. 1 = spotless
    mBody.bumpScale = mTop.bumpScale = KNOB_BUMP * depth * (1 - c); if (mp) mp.bumpScale = KNOB_BUMP * depth * 0.4 * (1 - c);
    if (oddG) { oddG.visible = c < 0.5; std.visible = !oddG.visible; }
  },  ...o, rect: [cx - C / 2 + 2, cy - 40, C - 4, 84] };
  k.sync = () => {
    const id = k.cur(); g.visible = !!id; if (!id) return false;
    const v = knobVal(id); if (v === k.shown) return false;
    k.shown = v; spin.rotation.z = -(-135 + 270 * v) * Math.PI / 180; shadowDirty = true; return true;   // the skirt's nub turns, so its shadow must too
  };
  k.colour(); k.tilt(look.tilt * (1 - look.ocd)); k.size(look.ksize); k.clean(look.ocd); addCtl(k); knobs.push(k); return k;
}
function makeKey(cx, cy, w, h, o) {
  const g = new THREE.Group(); g.position.copy(P(cx, cy, 0));
  const m = new THREE.Mesh(keyGeo(w, h, 6), [mat.keyTop, mat.keySide]); m.castShadow = true; m.receiveShadow = true;
  const led = new THREE.Mesh(ledGeo, mat.ledOff); led.position.set(o.ledX || 0, o.ledY || 0, 6.5); if (h < 12) led.scale.setScalar(0.8);
  const glow = new THREE.Sprite(mat.glow); glow.scale.set(16, 16, 1); glow.position.set(led.position.x, led.position.y, 10); glow.visible = false;
  g.add(m, led, glow); grp.add(g);
  const k = { kind: 'key', g, led, glow, lit: null, down: false, z: 0, rect: [cx - w / 2 - (o.pad ?? 6), cy - h / 2 - (o.pad ?? 6), w + 2 * (o.pad ?? 6), h + 2 * (o.pad ?? 6)], ...o };
  k.sync = () => {
    let ch = false; const on = !!k.on();
    if (on !== k.lit) { k.lit = on; led.material = on ? mat.ledOn : mat.ledOff; glow.visible = on; ch = true; }
    const z = k.down ? -2.2 : 0; if (z !== k.z) { k.z = z; g.position.z = z; shadowDirty = true; ch = true; }
    return ch;
  };
  addCtl(k); return k;
}
// an LED on a printed tag (an effect's ON): no key of its own, the tag is what you press
function makeLed(cx, cy, o) {
  const led = new THREE.Mesh(ledGeo, mat.ledOff); led.position.copy(P(cx, cy, 0.8));
  const glow = new THREE.Sprite(mat.glow); glow.scale.set(16, 16, 1); glow.position.copy(P(cx, cy, 2.5)); glow.visible = false; grp.add(led, glow);
  const k = { kind: 'key', lit: null, down: false, ...o };
  k.sync = () => { const on = !!k.on(); if (on === k.lit) return false; k.lit = on; led.material = on ? mat.ledOn : mat.ledOff; glow.visible = on; return true; };
  addCtl(k); return k;
}
// a black window with white text (preset name, reverb program)
function makeDisplay(x, y, w, h, text, o = {}) {
  const c = document.createElement('canvas'); c.width = w * 3; c.height = h * 3; const x2 = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.copy(P(x + w / 2, y + h / 2, 0.4)); grp.add(m);
  const d = { kind: 'display', rect: [x, y, w, h], shown: null, ...o };
  d.sync = () => {
    const t = text(); if (t === d.shown) return false; d.shown = t;
    x2.setTransform(3, 0, 0, 3, 0, 0); x2.fillStyle = '#0a0a0a'; x2.fillRect(0, 0, w, h);
    x2.fillStyle = '#fff'; x2.textBaseline = 'middle'; x2.textAlign = 'left';
    let fsz = 12.5; x2.font = `600 ${fsz}px ${MONO}`;
    let s = t.toUpperCase(); while (x2.measureText(s).width > w - 14 && s.length > 3) s = s.slice(0, -2) + '…';
    x2.fillText(s, 7, h / 2 + 0.5); tex.needsUpdate = true; return true;
  };
  addCtl(d); return d;
}
// the print: what's drawn on the face, refreshed whenever a label or the ink colour changes
// v0.35.1 (Johnny): the knobs in each boxed section can have their own colour (OPTIONS > COLOURS, look.knobCol
// { 'page:NAME': '#hex' }); a knob takes the section it is built in (the last box made). The pink spare stays pink.
const BOXR = [], boxKey = (b) => b.page + ':' + b.n;
const printsBy = { synth: [], seq: [], all: [] };   // functions (ctx, ink, paper) drawing one part, per page
let prints = printsBy.synth;
const addCtl = (c) => { c.page = c.page || buildPage; ctls.push(c); return c; };
const text = (x, s, tx, ty, size = 11, align = 'center', font = MONO, wgt = 600) => { x.font = `${wgt} ${size}px ${font}`; x.textAlign = align; x.textBaseline = 'middle'; if ('letterSpacing' in x) x.letterSpacing = '.6px'; x.fillText(s, tx, ty); };

const colX = (b, col, w = 1) => M + (b.c + col) * C + (w * C) / 2;
const rowY = (b) => M + b.r * R;
const KY = 60, LY = 106, KEYY = 72;   // knob centre, label line, and the key line under a display   // knob centre and label line, from the top of the row
const labelAt = (getText, cx, ly, opts = {}) => prints.push((x, ink) => {
  const t = getText(); if (!t) return;
  x.globalAlpha = opts.dim && opts.dim() ? 0.35 : 1;
  if (opts.slab && opts.slab()) {   // a control with a running step sequencer: its label white on a black slab
    x.font = `600 11px ${MONO}`; const w = x.measureText(t).width + 10; x.fillStyle = ink; x.fillRect(cx - w / 2, ly - 8, w, 16); x.fillStyle = inkOf(ink); text(x, t, cx, ly + 0.5);
  } else { x.fillStyle = ink; text(x, t, cx, ly + 0.5); }
  x.globalAlpha = 1;
});
const inkOf = (ink) => ink === '#000000' ? '#ffffff' : '#000000';
const cseqOn = (id) => !!(state.cseq && state.cseq[id] && state.cseq[id].on);

for (const b of BOXES) {
  const y0 = rowY(b), bx = M + b.c * C + 6, by = y0 + 12, bw = b.s * C - 12, bh = R - 12;
  px.font = `400 13px ${DISPLAY}`; if ('letterSpacing' in px) px.letterSpacing = '.6px';
  const tagW = px.measureText(b.n).width + 16;
  BOXR.push({ page: 'synth', n: b.n, bx, by, bw, bh });
  prints.push((x, ink, paper) => {
    x.strokeStyle = ink; x.lineWidth = 1.6; x.strokeRect(bx, by, bw, bh);
    x.font = `400 13px ${DISPLAY}`; if ('letterSpacing' in x) x.letterSpacing = '.6px';
    x.fillStyle = ink; x.fillRect(bx + 10, by - 9, tagW, 18);
    x.fillStyle = paper; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(b.n, bx + 18, by + 0.5);
    // an effect's on switch: a second tag beside the name, its LED and ON (as FILTH's SYNC)
    if (b.on) { x.fillStyle = ink; text(x, 'ON', bx + bw - 26, by + 12.5, 10, 'right'); }   // an effect's on key: inside the box, top right
  });
  if (b.on) makeKey(bx + bw - 14, by + 12, 15, 10, { on: () => state.fx[b.on], press: () => document.getElementById(`fx-${b.on}-on`).click(), pad: 4, tag: 'on:' + b.on });
  let col = 0;
  for (const it of b.it) {
    const w = it.w || 1, cx = colX(b, col, w), cy = y0 + KY, ly = y0 + LY;
    if (it.t === 'knob') {
      makeKnob(cx, cy, { cur: () => it.id, base: () => knobBase(it.id), odd: it.id === 'cutoff' });   // the filter knob is a mismatched spare (Johnny)
      labelAt(() => it.label, cx, ly, { slab: () => cseqOn(it.id), dim: () => it.id === 'flgres' && (state.params.flgmode | 0) === 1 });
    } else if (it.t === 'slot') {
      const cur = () => { const d = slotItem(it.g, it.k); return d ? d.f : null; };
      makeKnob(cx, cy, { cur });
      labelAt(() => { const id = cur(); return id ? domLabel(id) : ''; }, cx, ly, { slab: () => { const id = cur(); return id && cseqOn(id); } });
    } else if (it.t === 'sw') {
      px.font = `600 10.5px ${MONO}`; const tw = Math.max(...it.opts.map((o) => px.measureText(o).width + o.length * 0.6));
      const n = it.opts.length, pitch = 16, top = cy - (n - 1) * pitch / 2, kx = Math.max(bx + 14, Math.min(cx - 18, cx + C * w / 2 - 14 - tw - 14));   // the same place in every column, inside the box
      it.opts.forEach((o, i) => {
        const ky = top + i * pitch;
        makeKey(kx, ky, 15, 10, { on: () => swVal(it.id) === i, press: () => setSw(it.id, i), pad: 2, tag: it.id + ':' + i });
        const k = ctls[ctls.length - 1]; k.rect = [kx - 12, ky - pitch / 2, (cx + C * w / 2 - 4) - (kx - 12), pitch];   // the key and its word
        prints.push((x, ink) => { x.fillStyle = ink; text(x, o, kx + 12, ky + 0.5, 10.5, 'left'); });
      });
      labelAt(() => it.label, cx, ly);
    } else if (it.t === 'key') {
      const k = makeKey(cx, it.k === 'mod' ? cy : y0 + KEYY, 24, 14, {
        on: it.k === 'run' ? () => running : it.k === 'mod' ? () => modHeld : () => false,
        press: it.k === 'run' ? () => setRun(!running) : it.k === 'gen' ? () => document.getElementById('sq-rnd').click() : it.k === 'edit' ? () => setPage('seq') : null,
        hold: it.k === 'mod' ? (on) => { modHeld = on; push(on); } : null, pad: 10, tag: it.k });
      labelAt(() => it.label, cx, ly);
    } else if (it.t === 'lever') {
      const sw = w * C - 26, sx = cx - sw / 2;
      prints.push((x, ink) => { x.fillStyle = ink; x.beginPath(); x.roundRect ? x.roundRect(sx, cy - 4, sw, 8, 4) : x.rect(sx, cy - 4, sw, 8); x.fill();
        x.fillRect(cx - 0.75, cy - 15, 1.5, 7); x.fillRect(cx - 0.75, cy + 8, 1.5, 7); });
      const g = new THREE.Group(); grp.add(g);
      const h = new THREE.Mesh(keyGeo(16, 30, 14), [mat.keyTop, mat.keySide]); h.castShadow = true; g.add(h);
      const line = new THREE.Mesh(new THREE.BoxGeometry(2, 20, 0.6), mat.white); line.position.z = 14.2; g.add(line);
      const half = sw / 2 - 10;
      const lev = { kind: 'lever', v: 0, target: 0, shown: NaN, cx, half, rect: [sx - 6, cy - 34, sw + 12, 68] };
      lev.sync = () => {
        if (!lev.held) lev.v += (0 - lev.v) * 0.35; if (Math.abs(lev.v) < 0.002) lev.v = 0;
        if (lev.v === lev.shown) return false; lev.shown = lev.v; g.position.copy(P(cx + lev.v * half, cy, 0)); shadowDirty = true; return true;
      };
      addCtl(lev);
      labelAt(() => 'BEND', cx, ly);
    } else if (it.t === 'prog') {
      const dw = w * C - 16, dx = cx - dw / 2, k0 = colX(b, col), k1 = colX(b, col + 1);
      makeDisplay(dx, y0 + 26, dw, 24, () => (revProgEl.firstElementChild.textContent || '').trim(), { press: () => stepProg(1) });
      makeKey(k0, y0 + KEYY, 24, 14, { on: () => false, press: () => stepProg(-1), pad: 8, tag: 'prog-' });
      makeKey(k1, y0 + KEYY, 24, 14, { on: () => false, press: () => stepProg(1), pad: 8, tag: 'prog+' });
      labelAt(() => 'PREV', k0, ly); labelAt(() => 'NEXT', k1, ly);
    } else if (it.t === 'pattern') {
      const span = w * C - 16, x0 = cx - span / 2, sp = span / 16, kp = span / 8;
      for (let i = 0; i < 16; i++) {   // the playhead: one LED per step of the 16 being played
        const lx = x0 + kp * ((i >> 1) + 0.5) + (i & 1 ? 6 : -6), ly2 = y0 + 32, led = new THREE.Mesh(ledGeo, mat.ledOff); led.position.copy(P(lx, ly2, 0.8)); grp.add(led);
        const glow = new THREE.Sprite(mat.glow); glow.scale.set(14, 14, 1); glow.position.copy(P(lx, ly2, 2.5)); glow.visible = false; grp.add(glow);
        const o = { kind: 'led', lit: false, rect: null };
        o.sync = () => { const on = running && playStep >= 0 && playStep % 16 === i; if (on === o.lit) return false; o.lit = on; led.material = on ? mat.ledOn : mat.ledOff; glow.visible = on; return true; };
        addCtl(o);
      }
      for (let n = 0; n < 8; n++) {
        const kx = x0 + kp * (n + 0.5);
        makeKey(kx, y0 + KEYY, kp - 16, 14, { on: () => state.slot === n, press: () => slotsEl.querySelector(`[data-n="${n}"]`).click(), pad: 4, tag: 'pat:' + n });
        prints.push((x, ink) => { x.fillStyle = ink; text(x, String(n + 1), kx, y0 + KEYY + 18, 10); });
      }
      labelAt(() => 'PATTERN', cx, ly);
    } else if (it.t === 'preset') {
      const dw = w * C - 16, dx = cx - dw / 2, ks = [0, 1, 2].map((k) => colX(b, col + k));
      makeDisplay(dx, y0 + 26, dw, 24, () => (document.querySelector('#prj-bar .pm-btn .cur') || {}).textContent || '', { press: () => openBrowser() });
      makeKey(ks[0], y0 + KEYY, 24, 14, { on: () => false, press: () => document.querySelector('#prj-bar .pm-step[data-d="-1"]').click(), pad: 8, tag: 'pre-' });
      makeKey(ks[1], y0 + KEYY, 24, 14, { on: () => false, press: () => openBrowser(), pad: 8, tag: 'browse' });
      makeKey(ks[2], y0 + KEYY, 24, 14, { on: () => false, press: () => document.querySelector('#prj-bar .pm-step[data-d="1"]').click(), pad: 8, tag: 'pre+' });
      labelAt(() => 'PREV', ks[0], ly); labelAt(() => 'BROWSE', ks[1], ly); labelAt(() => 'NEXT', ks[2], ly);
    }
    col += w;
  }
}
let modHeld = false;
function stepProg(d) { const pit = progOf(), n = pit.opts.length, cur = Math.max(0, Math.min(n - 1, state.params[pit.s] | 0)); boot(); setRev(pit.s, (cur + d + n) % n); }
// the title: Johnny's logo, printed; tapping it opens OPTIONS. Under it, the page keys (on both pages)
buildPage = 'all'; grp = scene; prints = printsBy.all;
// v0.31.1: the logo is printed on its own lit layer over the title, carrying the panel's wear (the same bump map,
// cut to the title's patch of it), so the scuffs and dents run through it (Johnny). The rest of the print stays flat.
const LOGO_WEAR = [78, 26];   // wear-map level where the ink is gone, and the span over which it fades back to full
const logoCv = document.createElement('canvas'); logoCv.width = TITLE.w * S2; logoCv.height = TITLE.h * S2;
const logoTex = new THREE.CanvasTexture(logoCv); logoTex.colorSpace = THREE.SRGBColorSpace; logoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const logoWears = Object.fromEntries(['synth', 'seq'].map((p) => { const t = wearOf(p).clone(); t.repeat.set(TITLE.w / W, TITLE.h / H); t.offset.set(TITLE.x / W, 1 - (TITLE.y + TITLE.h) / H); return [p, t]; }));
const logoWear = logoWears[page];
const logoMat = new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, depthWrite: false, roughness: 0.35, metalness: 0, envMapIntensity: 0.9, bumpMap: logoWear, bumpScale: PANEL_BUMP * 1.6 });
const logoLayer = new THREE.Mesh(new THREE.PlaneGeometry(TITLE.w, TITLE.h), logoMat);
logoLayer.position.copy(P(TITLE.x + TITLE.w / 2, TITLE.y + TITLE.h / 2, 0.08)); logoLayer.renderOrder = 2; logoLayer.receiveShadow = true; scene.add(logoLayer);
// stickers (v0.32.7, Johnny: the tape came off, a yellow smiley went on): vinyl stickers with a white die-cut border,
// a bit glossy and a bit scuffed, each with its own spot on the panel, cut off where they run over an edge.
// OPTIONS > STICKERS turns each on or off (look.stickers); OCD peels them off.
const STICKER_BUMP = PANEL_BUMP * 1.6;
const STICKERS = [
  // v0.33.3 (Johnny): all about half as big again
  { id: 'smile', name: 'SMILEY', cx: W - 58, cy: 58, size: 100, rot: 12 },
  { id: 'wink', name: 'WINK', cx: 30, cy: H - 26, size: 76, rot: -18 },
  { id: 'dizzy', name: 'DIZZY', cx: W - 22, cy: H * 0.56, size: 70, rot: 25 },
  { id: 'heart', name: 'HEART', cx: W * 0.43, cy: H - 12, size: 66, rot: -10 },
  { id: 'star', name: 'STAR', cx: 20, cy: 136, size: 70, rot: 8 },
];
function drawSticker(x, id, n, R) {   // on an n x n canvas
  const c = n / 2, r = n * 0.40;
  const face = (fill) => { x.fillStyle = '#ffffff'; x.beginPath(); x.arc(c, c, r + n * 0.055, 0, 7); x.fill(); x.fillStyle = fill; x.beginPath(); x.arc(c, c, r, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineWidth = n * 0.012; x.stroke(); };
  const ink = () => { x.fillStyle = x.strokeStyle = '#111'; x.lineWidth = n * 0.035; x.lineCap = 'round'; };
  const smile = () => { x.beginPath(); x.arc(c, c + r * 0.05, r * 0.6, 0.18 * Math.PI, 0.82 * Math.PI); x.stroke(); };
  const eye = (ex) => { x.beginPath(); x.ellipse(ex, c - r * 0.25, r * 0.09, r * 0.2, 0, 0, 7); x.fill(); };
  if (id === 'smile') { face('#ffd400'); ink(); eye(c - r * 0.32); eye(c + r * 0.32); smile(); }
  if (id === 'wink') { face('#ffd400'); ink(); eye(c - r * 0.32); x.beginPath(); x.arc(c + r * 0.32, c - r * 0.18, r * 0.16, 1.1 * Math.PI, 1.9 * Math.PI); x.stroke(); smile(); }
  if (id === 'dizzy') {
    face('#ffd400'); ink();
    for (const ex of [c - r * 0.32, c + r * 0.32]) { const ey = c - r * 0.25, d = r * 0.13; x.beginPath(); x.moveTo(ex - d, ey - d); x.lineTo(ex + d, ey + d); x.moveTo(ex + d, ey - d); x.lineTo(ex - d, ey + d); x.stroke(); }
    x.beginPath(); x.moveTo(c - r * 0.45, c + r * 0.38); for (let i = 0; i <= 12; i++) x.lineTo(c - r * 0.45 + i * r * 0.075, c + r * 0.38 + (i % 2 ? -1 : 1) * r * 0.07); x.stroke();
  }
  const shape = (path, fill) => { path(); x.strokeStyle = '#fff'; x.lineWidth = n * 0.11; x.lineJoin = 'round'; x.stroke(); path(); x.fillStyle = fill; x.fill(); x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = n * 0.012; x.stroke(); };
  if (id === 'heart') shape(() => { x.beginPath(); x.moveTo(c, c + r * 0.85); x.bezierCurveTo(c - r * 1.25, c + r * 0.05, c - r * 0.75, c - r * 0.95, c, c - r * 0.35); x.bezierCurveTo(c + r * 0.75, c - r * 0.95, c + r * 1.25, c + r * 0.05, c, c + r * 0.85); x.closePath(); }, '#ff4f9a');
  if (id === 'star') shape(() => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; x.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); } x.closePath(); }, '#ff7a1a');
  // a shine and some scuffing
  x.save(); x.globalCompositeOperation = 'source-atop';
  const g = x.createLinearGradient(0, 0, n, n); g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(0.4, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, n, n);
  for (let i = 0; i < 14; i++) { x.strokeStyle = `rgba(255,255,255,${0.15 + R() * 0.25})`; x.lineWidth = 1 + R() * 1.5; const px = R() * n, py = R() * n, a = R() * Math.PI, l = n * (0.05 + R() * 0.2); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.08})`; x.fillRect(R() * n, R() * n, 2, 2); }
  x.restore();
}
// v0.32.9 (Johnny): stickers wear too. The panel's own dents and scratches show through the vinyl (each sticker's
// bump map is the page's wear map sampled under it, so it changes with the page), and each sticker has its own
// wear and tear: nicked edges, sun-faded patches, ink rubbed thin, a crease and one edge lifting off the panel.
const panelWearData = {};
const wearData = (p) => panelWearData[p] || (panelWearData[p] = (() => { const c = wearOf(p).image; return { w: c.width, h: c.height, d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data }; })());
function stickerWear(x, n, R) {   // own wear on the colour canvas x; returns the sticker's own bump canvas
  const c = n / 2, img0 = x.getImageData(0, 0, n, n).data, A = (u, v) => (u < 0 || v < 0 || u >= n || v >= n) ? 0 : img0[((v | 0) * n + (u | 0)) * 4 + 3];
  const rim = (a) => { let r = 0; while (r < c && A(c + Math.cos(a) * r, c + Math.sin(a) * r) > 8) r++; return r; };   // distance to the die-cut edge
  const b = document.createElement('canvas'); b.width = b.height = n; const bx = b.getContext('2d');
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, n, n);
  if (scuffImg) { bx.globalAlpha = 0.45; bx.drawImage(scuffImg, R() * 600, R() * 600, 420, 420, 0, 0, n, n); bx.globalAlpha = 1; }
  // nicks: little bites out of the edge
  x.save(); x.globalCompositeOperation = 'destination-out';
  for (let i = 0, k = 2 + (R() * 4 | 0); i < k; i++) {
    const a = R() * 7, r = rim(a), s = n * (0.012 + R() * 0.025); x.beginPath();
    for (let j = 0; j < 7; j++) { const t = j / 7 * 7, rr = s * (0.6 + R() * 0.7); x.lineTo(c + Math.cos(a) * r + Math.cos(t) * rr, c + Math.sin(a) * r + Math.sin(t) * rr); }
    x.fill();
  }
  x.restore();
  x.save(); x.globalCompositeOperation = 'source-atop';
  // sun-faded patches
  for (let i = 0, k = 2 + (R() * 3 | 0); i < k; i++) {
    const px = c + (R() - 0.5) * n * 0.7, py = c + (R() - 0.5) * n * 0.7, r = n * (0.12 + R() * 0.2), g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(255,250,235,${0.18 + R() * 0.2})`); g.addColorStop(1, 'rgba(255,250,235,0)'); x.fillStyle = g; x.fillRect(0, 0, n, n);
  }
  // ink rubbed thin by fingers, mostly round the edge
  for (let i = 0; i < 40; i++) {
    const a = R() * 7, r = rim(a) * (0.55 + R() * 0.45), px = c + Math.cos(a) * r, py = c + Math.sin(a) * r, s = n * (0.008 + R() * 0.03);
    x.fillStyle = `rgba(255,255,255,${0.12 + R() * 0.3})`; x.beginPath(); x.ellipse(px, py, s, s * (0.3 + R() * 0.5), R() * 3, 0, 7); x.fill();
  }
  // grime along the edge
  const gr = x.createRadialGradient(c, c, n * 0.3, c, c, n * 0.5); gr.addColorStop(0, 'rgba(60,50,30,0)'); gr.addColorStop(1, 'rgba(60,50,30,.22)'); x.fillStyle = gr; x.fillRect(0, 0, n, n);
  // a crease: a dark/light pair in the bump, a faint pale line in the colour
  { const a = R() * 3, px = c + (R() - 0.5) * n * 0.4, py = c + (R() - 0.5) * n * 0.4, l = n * (0.25 + R() * 0.3), dx = Math.cos(a) * l / 2, dy = Math.sin(a) * l / 2;
    bx.lineCap = 'round'; bx.lineWidth = n * 0.008;
    for (const [o, col] of [[-1, 'rgba(255,255,255,.6)'], [1, 'rgba(0,0,0,.6)']]) { bx.strokeStyle = col; bx.beginPath(); bx.moveTo(px - dx - o * dy * 0.02, py - dy + o * dx * 0.02); bx.lineTo(px + dx - o * dy * 0.02, py + dy + o * dx * 0.02); bx.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = n * 0.006; x.beginPath(); x.moveTo(px - dx, py - dy); x.lineTo(px + dx, py + dy); x.stroke(); }
  // one edge lifting: a raised ramp in the bump, and dirt caught under it
  { const a = R() * 7, r = rim(a), px = c + Math.cos(a) * r, py = c + Math.sin(a) * r, s = n * (0.12 + R() * 0.08);
    const g = bx.createRadialGradient(px, py, 0, px, py, s); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); bx.fillStyle = g; bx.fillRect(0, 0, n, n);
    const g2 = x.createRadialGradient(px, py, 0, px, py, s * 0.55); g2.addColorStop(0, 'rgba(40,32,20,.45)'); g2.addColorStop(1, 'rgba(40,32,20,0)'); x.fillStyle = g2; x.fillRect(0, 0, n, n); }
  x.restore();
  return b;
}
function stickerBump(st, own, p) {   // the page's wear under the sticker plus the sticker's own; st = placement { cx, cy, size, rot }
  const n = own.width, a = -st.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), S = n / st.size, wd = wearData(p);
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
  const o = own.getContext('2d').getImageData(0, 0, n, n).data, img = x.createImageData(n, n), d = img.data;
  for (let v = 0, i = 0; v < n; v++) for (let u = 0; u < n; u++, i += 4) {
    const lx = u / S - st.size / 2, ly = v / S - st.size / 2, px = st.cx + lx * ca + ly * sa, py = st.cy - (lx * sa - ly * ca);
    const wx = Math.max(0, Math.min(wd.w - 1, px / W * wd.w | 0)), wy = Math.max(0, Math.min(wd.h - 1, py / H * wd.h | 0));
    const val = Math.max(0, Math.min(255, wd.d[(wy * wd.w + wx) * 4] + (o[i] - 128) * 0.9));
    d[i] = d[i + 1] = d[i + 2] = val; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
// v0.33.0: each sticker can be resized, moved and turned in OPTIONS > STICKERS (look.stk); a move re-cuts it at the panel
// edge and re-samples the wear under it.
const stkPlace = (st) => { const q = look.stk[st.id] || {}; return { cx: q.x ?? st.cx, cy: q.y ?? st.cy, size: st.size * (q.s ?? 1), rot: q.r ?? st.rot }; };
const stickers = STICKERS.map((st, k) => {
  const n = 384, src = document.createElement('canvas'); src.width = src.height = n; const sx = src.getContext('2d');
  const R = rng(777 + k); drawSticker(sx, st.id, n, R); const own = stickerWear(sx, n, R);
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.32, metalness: 0, envMapIntensity: 0.9, bumpScale: STICKER_BUMP }));
  m.renderOrder = 3; m.receiveShadow = true; scene.add(m);
  const o = { id: st.id, m, bumps: null, key: '' };
  o.place = () => {
    const q = stkPlace(st), key = JSON.stringify(q); if (key === o.key) return; o.key = key;
    x.clearRect(0, 0, n, n); x.drawImage(src, 0, 0);
    const a = -q.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), img = x.getImageData(0, 0, n, n), d = img.data, S = n / q.size;
    for (let v = 0, i = 0; v < n; v++) for (let u = 0; u < n; u++, i += 4) {   // cut off past the panel's edge
      const lx = u / S - q.size / 2, ly = v / S - q.size / 2, px2 = q.cx + lx * ca + ly * sa, py2 = q.cy - (lx * sa - ly * ca);
      if (px2 < 0.5 || py2 < 0.5 || px2 > W - 0.5 || py2 > H - 0.5) d[i + 3] = 0;
    }
    x.putImageData(img, 0, 0); map.needsUpdate = true;
    if (o.bumps) { o.bumps.synth.dispose(); o.bumps.seq.dispose(); }
    o.bumps = { synth: stickerBump(q, own, 'synth'), seq: stickerBump(q, own, 'seq') }; m.material.bumpMap = o.bumps[page]; m.material.needsUpdate = true;
    m.position.copy(P(q.cx, q.cy, 0.25 + k * 0.01)); m.rotation.z = -q.rot * Math.PI / 180; m.scale.set(q.size, q.size, 1);
  };
  o.place(); return o;
});
// v0.34.0 (Johnny): clicking a sticker randomises the sound (rand.js); right-click or Shift-click steps back.
// A hit is inside the die-cut circle of a shown sticker, top one first; the sticker gives a little wobble.
function stickerAt(p) {
  if (!p) return null;
  for (let k = stickers.length - 1; k >= 0; k--) {
    const st = stickers[k]; if (!st.m.visible) continue;
    const q = stkPlace(STICKERS[k]); if (Math.hypot(p[0] - q.cx, p[1] - q.cy) < q.size * 0.42) return st;
  }
  return null;
}
const wobbles = new Map();
const wobble = (st) => { wobbles.set(st, performance.now()); dirty = true; };
function wobbleStep(now) {
  for (const [st, t0] of wobbles) {
    const k = STICKERS.findIndex((t) => t.id === st.id), base = -stkPlace(STICKERS[k]).rot * Math.PI / 180, t = (now - t0) / 1000;
    if (t > 0.7) { st.m.rotation.z = base; wobbles.delete(st); } else st.m.rotation.z = base + Math.sin(t * 34) * Math.exp(-t * 6) * 0.16;
    dirty = true;
  }
}
prints.push((x, ink) => {
  if (logo.naturalWidth) {
    const lw = 196, lh = lw * logo.naturalHeight / logo.naturalWidth, lx = (TITLE.w - lw) / 2, ly = 10;
    const lx2 = logoCv.getContext('2d'); lx2.setTransform(1, 0, 0, 1, 0, 0); lx2.globalCompositeOperation = 'source-over'; lx2.clearRect(0, 0, logoCv.width, logoCv.height);
    lx2.drawImage(logo, lx * S2, ly * S2, lw * S2, lh * S2); lx2.globalCompositeOperation = 'source-in'; lx2.fillStyle = ink; lx2.fillRect(0, 0, logoCv.width, logoCv.height);
    // worn ink (v0.31.2): where the wear map dips (scuffs, scratches, dents) the ink is rubbed thin or through to the
    // panel, so the wear reads on a black logo too
    const wc = wearOf(page).image, sx = wc.width / W, sy = wc.height / H, pw = TITLE.w * sx | 0, ph = TITLE.h * sy | 0;
    const patch = document.createElement('canvas'); patch.width = logoCv.width; patch.height = logoCv.height;
    const pc2 = patch.getContext('2d'); pc2.drawImage(wc, TITLE.x * sx, TITLE.y * sy, pw, ph, 0, 0, patch.width, patch.height);
    const wv = pc2.getImageData(0, 0, patch.width, patch.height).data, img = lx2.getImageData(0, 0, logoCv.width, logoCv.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const v = wv[i]; const f = Math.max(0, Math.min(1, (v - LOGO_WEAR[0]) / LOGO_WEAR[1])); d[i + 3] *= f + (1 - f) * look.ocd; }
    lx2.putImageData(img, 0, 0);
    logoTex.needsUpdate = true;
  } else { x.fillStyle = ink; text(x, 'shyoy', TITLE.x + TITLE.w / 2, TITLE.y + 50, 64, 'center', DISPLAY, 400); }
  x.fillStyle = ink; text(x, 'v' + VER3D, TITLE.x + TITLE.w - 14, TITLE.y + 98, 10, 'right');
});
const VER3D = ((document.getElementById('ver') || {}).textContent || '').replace(/^v/, '');
addCtl({ kind: 'title', rect: [TITLE.x + 60, TITLE.y + 4, TITLE.w - 120, 78], press: () => openOptions3d(), sync: () => false });
[['synth', 'SYNTH'], ['seq', 'SEQUENCER']].forEach(([k, t], i) => {
  const kx = TITLE.x + 22 + i * 96, ky = TITLE.y + 98;
  makeKey(kx, ky, 15, 10, { on: () => page === k, press: () => setPage(k), pad: 4, tag: 'page:' + k });
  ctls[ctls.length - 1].rect = [kx - 12, ky - 10, 90, 20];
  prints.push((x, ink) => { x.fillStyle = ink; text(x, t, kx + 12, ky + 0.5, 10.5, 'left'); });
});
function setPage(k) {
  page = k; try { localStorage.setItem('shyoy.page3d', k); } catch (e) {}
  pages.synth.visible = k === 'synth'; pages.seq.visible = k === 'seq'; ro.hide();
  panelMat.bumpMap = print.material.bumpMap = wearOf(k); logoMat.bumpMap = logoWears[k];   // each page its own wear
  for (const st of stickers) st.m.material.bumpMap = st.bumps[k];
  printDirty = shadowDirty = dirty = true;
}

// ================================================================ the sequencer page (v0.25.0)
// The same panel, a second page: transport and pattern keys, length, gate, the generator, the piano roll as one printed
// grid you draw on, and the Randomise and Tools menus as rows of keys. Every press goes through the 2D sequencer's own
// functions (applyCell, paintCell, extendTo, keepUndo, stepChanged) and its menu buttons, so the pattern and what the
// engine is sent are the same as from the 2D roll.
buildPage = 'seq'; grp = pages.seq; prints = printsBy.seq;
const box = (c, r, s, h, n) => { const bx = M + c * C + 6, by = M + r * R + 12, bw = s * C - 12, bh = h * R - 12; BOXR.push({ page: 'seq', n, bx, by, bw, bh });
  px.font = `400 13px ${DISPLAY}`; if ('letterSpacing' in px) px.letterSpacing = '.6px'; const tagW = px.measureText(n).width + 16;
  prints.push((x, ink, paper) => { x.strokeStyle = ink; x.lineWidth = 1.6; x.strokeRect(bx, by, bw, bh);
    x.font = `400 13px ${DISPLAY}`; if ('letterSpacing' in x) x.letterSpacing = '.6px'; x.fillStyle = ink; x.fillRect(bx + 10, by - 9, tagW, 18);
    x.fillStyle = paper; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(n, bx + 18, by + 0.5); });
  return { bx, by, bw, bh, cx: (k, w = 1) => M + (c + k) * C + w * C / 2, y0: M + r * R };
};
{ // row 0: transport, patterns, length and gate, the generator
  const t = box(0, 0, 2, 1, 'TRANSPORT');
  makeKey(t.cx(0), t.y0 + KEYY, 24, 14, { on: () => running, press: () => setRun(!running), pad: 10, tag: 'run2' }); labelAt(() => 'RUN', t.cx(0), t.y0 + LY);
  makeKnob(t.cx(1), t.y0 + KY, { cur: () => 'bpm' }); labelAt(() => 'TEMPO', t.cx(1), t.y0 + LY);
  const pt = box(2, 0, 5, 1, 'PATTERN'), span = 5 * C - 24, x0 = pt.cx(0, 5) - span / 2, kp = span / 8;
  for (let n = 0; n < 8; n++) {
    const kx = x0 + kp * (n + 0.5);
    makeKey(kx, pt.y0 + KEYY, kp - 16, 14, { on: () => state.slot === n, press: () => slotsEl.querySelector(`[data-n="${n}"]`).click(), pad: 4, tag: 'pat2:' + n });
    // its number on the label line, dimmed while the slot is empty
    prints.push((x, ink) => { const u = state.slots[n] && state.slots[n].steps && state.slots[n].steps.some((st) => st.m !== 'R'); x.globalAlpha = u || state.slot === n ? 1 : 0.4; x.fillStyle = ink; text(x, String(n + 1), kx, pt.y0 + LY, 11); x.globalAlpha = 1; });
  }
  const lg = box(7, 0, 2, 1, 'STEPS');
  makeKnob(lg.cx(0), lg.y0 + KY, { cur: () => 'len' }); labelAt(() => 'LENGTH', lg.cx(0), lg.y0 + LY);
  const GATES = [10, 25, 50, 75, 95], gNow = () => Math.round((0.1 + state.params.gateLen * 0.85) * 100);
  GATES.forEach((g, i) => { const kx = lg.cx(1) - 18, ky = lg.y0 + KY - 2 * 14 + i * 14;
    makeKey(kx, ky, 15, 10, { on: () => GATES.reduce((m, q) => Math.abs(q - gNow()) < Math.abs(m - gNow()) ? q : m) === g, press: () => document.querySelector(`#gm-menu [data-gate="${g}"]`).click(), pad: 2, tag: 'gate:' + g });
    ctls[ctls.length - 1].rect = [kx - 12, ky - 7, 60, 14];
    prints.push((x, ink) => { x.fillStyle = ink; text(x, g + '%', kx + 12, ky + 0.5, 10.5, 'left'); }); });
  labelAt(() => 'GATE', lg.cx(1), lg.y0 + LY);
  const gn = box(9, 0, 4, 1, 'GENERATE');
  makeKnob(gn.cx(0), gn.y0 + KY, { cur: () => 'dens' }); labelAt(() => 'DENSITY', gn.cx(0), gn.y0 + LY);
  makeKnob(gn.cx(1), gn.y0 + KY, { cur: () => 'cplx' }); labelAt(() => 'COMPLEX', gn.cx(1), gn.y0 + LY);
  makeKey(gn.cx(2), gn.y0 + KEYY, 24, 14, { on: () => false, press: () => document.getElementById('sq-rnd').click(), pad: 10, tag: 'rnd' }); labelAt(() => 'NEW', gn.cx(2), gn.y0 + LY);
  makeKey(gn.cx(3), gn.y0 + KEYY, 24, 14, { on: () => false, press: () => document.getElementById('p-undo').click(), pad: 10, tag: 'undo' });
  labelAt(() => 'UNDO', gn.cx(3), gn.y0 + LY, { dim: () => document.getElementById('p-undo').disabled });
}
// the menus as rows of keys: one column per group, [heading, entry...]; an entry is [label, id of the 2D button it clicks] or
// { t: label or () => label, press, on, tag }. The rows spread evenly down the box, every column on the same row lines
// (v0.27.1 tidy); ws: the columns' widths as shares of the box
const keyList = (b, colsDef, ws) => {
  const n = Math.max(...colsDef.map((l) => l.length - 1)), inner = b.bw - 28;
  const W = ws || colsDef.map(() => 1), sum = W.reduce((p, q) => p + q, 0);
  const top = b.by + 30, pitch = Math.min(30, (b.by + b.bh - 18 - top) / n);
  let x0 = b.bx + 22;
  colsDef.forEach(([head, ...list], ci) => {
    const kx = x0, cw = inner * W[ci] / sum; x0 += cw;
    prints.push((x, ink) => { x.fillStyle = ink; x.globalAlpha = 0.6; text(x, head, kx - 8, top, 9.5, 'left'); x.globalAlpha = 1; });
    list.forEach((en, ri) => {
      const ky = top + pitch * (ri + 1);
      const e = Array.isArray(en) ? { t: en[0], el: () => document.getElementById(en[1]), tag: 'm:' + en[1] } : en;
      const press = e.press || (() => { const d = e.el(); if (d && !d.disabled) d.click(); });
      const k = makeKey(kx, ky, 15, 10, { on: e.on || (() => k.down), press, pad: 2, tag: e.tag });
      k.rect = [kx - 12, ky - pitch / 2, cw - 4, pitch];
      prints.push((x, ink) => { x.globalAlpha = e.el && e.el() && e.el().disabled ? 0.35 : 1; x.fillStyle = ink; text(x, typeof e.t === 'function' ? e.t() : e.t, kx + 13, ky + 0.5, 10.5, 'left'); x.globalAlpha = 1; });
    });
  });
};
keyList(box(13, 1, 5, 2, 'RANDOMISE'), [
  ['RANDOMISE', ['ACCENTS', 'r-acc'], ['SLIDES', 'r-slide'], ['OCTAVES', 'r-oct'], ['TIES', 'r-tie']],
  ['ALTER', ['ACCENTS', 'a-acc'], ['SLIDES', 'a-slide'], ['OCTAVES', 'a-oct'], ['TIES', 'a-tie'], ['WHOLE', 'a-all']],
  ['PATTERN', ['SHUFFLE', 'p-shuf'], ['GENERATE', 'p-rnd'], ['REFILL', 'p-refill']]]);
// TOOLS: the pattern and note commands, and Johnny's scale (v0.28.0): the first scale key steps the scale, the second
// ticks Apply scale on MIDI note
keyList(box(13, 3, 5, 2, 'TOOLS'), [
  ['PATTERN', ['COPY', 'p-copy'], ['PASTE', 'p-paste'], ['DOUBLE', 'p-dup'], ['CLEAR', 'p-clr'], ['UNDO', 'p-undo'], ['JOIN', 'p-join']],
  ['NOTES', ['SEMI UP', 'nu-up'], ['SEMI DN', 'nu-dn'], ['OCT UP', 'nu-oup'], ['OCT DN', 'nu-odn'], ['SHIFT L', 'rot-l'], ['SHIFT R', 'rot-r']],
  ['SCALE', { t: () => SCALE_LIST[state.scale.i].name.toUpperCase(), press: () => setScale({ i: (state.scale.i + 1) % SCALE_LIST.length }), on: () => false, tag: 'scale0' },
    { t: 'ON MIDI NOTE', press: () => setScale({ on: !state.scale.on }), on: () => state.scale.on, tag: 'scale1' }]], [0.85, 0.95, 1.4]);
// ---- the roll: one printed grid, redrawn when the pattern, the playhead or the page of steps changes
const RB = box(0, 1, 13, 4, 'PATTERN EDIT');
const RL = { x: RB.bx + 46, y: RB.by + 26, w: RB.bw - 56 };
const ROWS_DEF = [['h'], ...[2, 1, -1, -2].map((o) => ['o', o, (o > 0 ? '+' : '-') + Math.abs(o)]), ['gap'],
  ...[11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((k) => ['k', k, NOTE[k]]), ['gap'], ['t', 0, 'TIE'], ['s', 0, 'SLIDE'], ['a', 0, 'ACC']];
const RH = { h: 16, gap: 8 }, rowH = (RB.by + RB.bh - 12 - RL.y - RH.h - 2 * RH.gap) / 19;
let ry = RL.y; const rowsY = ROWS_DEF.map((r) => { const y = ry; ry += RH[r[0]] || rowH; return y; });
RL.h = ry - RL.y;
let rollPage = 0;   // 0: steps 1-32, 1: steps 33-64
const SHOW = 32, colW = RL.w / SHOW;
const rc = document.createElement('canvas'); rc.width = Math.ceil(RL.w * 3); rc.height = Math.ceil(RL.h * 3); const rx = rc.getContext('2d');
const rollTex = new THREE.CanvasTexture(rc); rollTex.colorSpace = THREE.SRGBColorSpace; rollTex.anisotropy = 4;
const rollMesh = new THREE.Mesh(new THREE.PlaneGeometry(RL.w, RL.h), new THREE.MeshBasicMaterial({ map: rollTex, transparent: true, depthWrite: false }));
rollMesh.position.copy(P(RL.x + RL.w / 2, RL.y + RL.h / 2, 0.08)); rollMesh.renderOrder = 1; grp.add(rollMesh);
// row names, printed beside the grid
ROWS_DEF.forEach((r, i) => { if (r[2] == null) return; const yy = rowsY[i] + rowH / 2;
  prints.push((x, ink) => { x.fillStyle = ink; text(x, String(r[2]).toUpperCase(), RL.x - 8, yy + 0.5, 9.5, 'right'); }); });
prints.push((x, ink) => { x.fillStyle = ink; text(x, 'STEP', RL.x - 8, RL.y + RH.h / 2, 9.5, 'right'); });
// steps 1-32 / 33-64, top right inside the box
[['1-32', 0], ['33-64', 1]].forEach(([t, k], i) => { const kx = RB.bx + RB.bw - 130 + i * 64, ky = RB.by + 12;
  makeKey(kx, ky, 15, 10, { on: () => rollPage === k, press: () => { rollPage = k; }, pad: 4, tag: 'rpage:' + k });
  ctls[ctls.length - 1].rect = [kx - 12, ky - 9, 60, 18];
  prints.push((x, ink) => { x.fillStyle = ink; text(x, t, kx + 12, ky + 0.5, 10, 'left'); }); });
let rollSig = '';
function drawRoll() {
  const P2 = state.steps, n = P2.length, off = rollPage * SHOW, ink = curInk, light = ink === '#000000';
  const sig = JSON.stringify(P2) + '|' + n + off + ink + (running ? playStep : -1) + '|' + selStep;
  if (sig === rollSig) return false; rollSig = sig;
  rx.setTransform(3, 0, 0, 3, 0, 0); rx.clearRect(0, 0, RL.w, RL.h);
  const tone = (a) => light ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
  ROWS_DEF.forEach((r, ri) => { if (r[0] === 'k' && BLACK.has(r[1])) { rx.fillStyle = tone(0.07); rx.fillRect(0, rowsY[ri] - RL.y, RL.w, rowH); } });
  for (let c = 0; c < SHOW; c++) {
    const i = off + c, x = c * colW, ghost = i >= n;
    if (running && playStep === i) { rx.fillStyle = tone(0.16); rx.fillRect(x, 0, colW, RL.h); }
    if (i === selStep) { rx.fillStyle = ink; rx.fillRect(x + 1, 0, colW - 2, RH.h); }
    rx.globalAlpha = ghost ? 0.3 : 1;
    if (i % 4 === 0) { rx.fillStyle = i === selStep ? inkOf(ink) : ink; text(rx, String(i + 1), x + colW / 2, RH.h / 2 + 1, 9.5); }
    const st = P2[i];
    ROWS_DEF.forEach((r, ri) => {
      const [t, v] = r; if (t === 'h' || t === 'gap') return; const y = rowsY[ri] - RL.y;
      rx.strokeStyle = tone(0.28); rx.lineWidth = 1; rx.strokeRect(x + 1.5, y + 1.5, colW - 3, rowH - 3);
      if (!st) return;
      let on = false, mem = false;
      if (t === 'o') { on = st.o === v && st.m !== 'R'; mem = st.o === v && st.m === 'R'; }
      else if (t === 'k') { on = st.n === v && st.m !== 'R'; mem = st.n === v && st.m === 'R'; }
      else if (t === 't') on = st.m === 'T'; else on = !!st[t];
      if (on) { rx.fillStyle = ink; rx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);
        if (t === 'k' && st.m === 'T') { rx.fillStyle = inkOf(ink); rx.fillRect(x + 3, y + rowH / 2 - 1, 5, 2); } }
      else if (mem) { rx.strokeStyle = ink; rx.lineWidth = 1.5; rx.strokeRect(x + 4, y + 4, colW - 8, rowH - 8); }
    });
    rx.globalAlpha = 1;
    if (i % 4 === 3 && c < SHOW - 1) { rx.fillStyle = tone(0.55); rx.fillRect(x + colW - 0.75, RH.h, 1.5, RL.h - RH.h); }
    if (i === n - 1) { rx.fillStyle = ink; rx.fillRect(x + colW - 1.25, 0, 2.5, RL.h); }
  }
  rollTex.needsUpdate = true; return true;
}
// a point on the panel -> { col, row } in the roll (row = index in ROWS_DEF), or null
function rollAt(p) {
  if (!p || p[0] < RL.x || p[0] > RL.x + RL.w || p[1] < RL.y || p[1] > RL.y + RL.h) return null;
  const c = Math.min(SHOW - 1, Math.floor((p[0] - RL.x) / colW)); let ri = -1;
  for (let i = 0; i < ROWS_DEF.length; i++) if (p[1] >= rowsY[i] && p[1] < rowsY[i] + (RH[ROWS_DEF[i][0]] || rowH)) ri = i;
  return ri < 0 ? null : { i: rollPage * SHOW + c, r: ROWS_DEF[ri] };
}
const cellOf = (i, r) => ({ dataset: { col: String(i), t: r[0], v: String(r[1]) } });   // what the 2D roll's buttons carry
addCtl({ kind: 'roll', rect: [RL.x, RL.y, RL.w, RL.h], sync: () => page === 'seq' && drawRoll() });
const rollGrab = {
  down(p) {
    const h = rollAt(p); if (!h) return false; const { i, r } = h;
    if (r[0] === 'h') { if (i < state.steps.length) { selStep = selStep === i ? -1 : i; renderSeq(); } return true; }
    if (r[0] === 'gap') return true;
    if (i >= state.steps.length) { extendTo(i + 1); renderSeq(); }
    if (i >= state.steps.length) return true;
    keepUndo(); const b = cellOf(i, r); applyCell(b);
    const st = state.steps[i], t = r[0];
    paint = { t, id: -1, on: t === 'k' ? st.m !== 'R' : t === 'o' ? true : t === 't' ? st.m === 'T' : st[t], oct: st.o, x: 0, y: 0, dirty: false, raf: 0 };
    rollGrab.last = p; stepChanged(); return true;
  },
  move(p) {
    if (!paint || paint.id !== -1 || !rollGrab.last) return;
    const [x0, y0] = rollGrab.last, dx = p[0] - x0, dy = p[1] - y0, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4)); let ch = false;
    for (let k = 1; k <= n; k++) { const h = rollAt([x0 + dx * k / n, y0 + dy * k / n]); if (h && h.i < state.steps.length && h.r[0] !== 'h' && h.r[0] !== 'gap' && paintCell(cellOf(h.i, h.r))) ch = true; }
    rollGrab.last = p;
    if (ch) { paint.dirty = true; if (!paint.raf) paint.raf = requestAnimationFrame(paintFrame); }
  },
  up() { if (!paint || paint.id !== -1) return; const q = paint; paint = null; rollGrab.last = null; if (q.raf) cancelAnimationFrame(q.raf); if (q.dirty) stepChanged(); },
};
buildPage = 'synth'; grp = pages.synth; prints = printsBy.synth;
// the readout while a knob turns: the value on a black slab where its label is
const ro = (() => {
  const w = 84, h = 17, c = document.createElement('canvas'); c.width = w * 3; c.height = h * 3; const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); m.visible = false; m.renderOrder = 2; scene.add(m);
  return { show(k, t) {
    x.setTransform(3, 0, 0, 3, 0, 0); x.clearRect(0, 0, w, h); x.font = `600 11px ${MONO}`; const tw = Math.min(w, x.measureText(t).width + 12);
    x.fillStyle = curInk; x.fillRect((w - tw) / 2, 0, tw, h); x.fillStyle = inkOf(curInk); text(x, t, w / 2, h / 2 + 0.5);
    tex.needsUpdate = true; m.position.copy(P(k.cx, k.cy + (LY - KY), 0.3)); m.visible = true; dirty = true;
  }, hide() { if (m.visible) { m.visible = false; dirty = true; } } };
})();

// ---------------------------------------------------------------- look
let curInk = '#000000', printSig = '';
function lum(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }   // linear
function applyLook() {
  panelMat.color.set(look.colour);
  const F = FINISH[look.finish] || FINISH.satin;
  panelMat.roughness = F.r; panelMat.metalness = F.m; panelMat.envMapIntensity = F.e;
  const rm = F.brushed ? brushed : null; if (panelMat.roughnessMap !== rm) { panelMat.roughnessMap = rm; panelMat.needsUpdate = true; }
  const L = LIGHTS[look.light] || LIGHTS.studio, b = look.bright;
  hemi.intensity = L.hemi * b; hemi.color.set(L.hemiCol || 0xffffff); hemi.groundColor.set(0x404040);
  look.lights.forEach((l, i) => {
    const a = l.az * Math.PI / 180, e = l.el * Math.PI / 180, lamp = lamps[i];
    lamp.color.set(l.col); lamp.intensity = l.int * b;
    lamp.position.set(Math.cos(a) * Math.cos(e) * 2500, Math.sin(a) * Math.cos(e) * 2500, Math.sin(e) * 2500); lamp.target.position.set(0, 0, 0);
  });
  curInk = lum(look.colour) < 0.2 ? '#ffffff' : '#000000';
  // OCD (v0.32.6): 0 keeps every defect, 1 is spotless: wear depths, worn ink, tilt, the stickers and the odd knob
  const cl = look.ocd, w = 1 - cl;
  panelMat.bumpScale = PANEL_BUMP * w; edgeMat.bumpScale = EDGE_BUMP * w; print.material.bumpScale = logoMat.bumpScale = PANEL_BUMP * 1.6 * w;
  // v0.33.1 (Johnny): stickers have their own SHOW STICKERS checkbox; OCD only smooths them (the odd knob still goes at 50)
  for (const st of stickers) { st.place(); st.m.material.bumpScale = STICKER_BUMP * w; st.m.visible = look.stkOn && look.stickers.includes(st.id); }
  for (const k of knobs) { k.style(kstyle()); k.colour(); k.tilt(look.tilt * w); k.size(look.ksize); k.clean(cl); }
  camera.fov = lensFov(look.lens); fit();
  const bg = new THREE.Color(look.colour).multiplyScalar(0.28);
  document.body.style.setProperty('--v3d-bg', `radial-gradient(120% 90% at 50% 40%, #${bg.getHexString()} 0%, #0b0b0b 78%)`);
  printDirty = shadowDirty = dirty = true;
}
const pMasks = {};
function printMask() {   // alpha: 1 where the ink holds, fading to 0 where the wear map is lowest (same thresholds as the logo)
  if (pMasks[page]) return pMasks[page];
  const pMask = pMasks[page] = document.createElement('canvas'); pMask.width = pc.width; pMask.height = pc.height; const m = pMask.getContext('2d');
  m.drawImage(wearOf(page).image, 0, 0, pc.width, pc.height); const img = m.getImageData(0, 0, pc.width, pc.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i + 3] = 255 * Math.max(0, Math.min(1, (d[i] - LOGO_WEAR[0]) / LOGO_WEAR[1])); d[i] = d[i + 1] = d[i + 2] = 0; }
  m.putImageData(img, 0, 0); return pMask;
}
let inkSig = '', inkCv = null;
function inkMask() {   // the worn-ink mask, lifted towards solid ink by OCD
  const sig = page + '|' + look.ocd; if (sig === inkSig) return inkCv;
  const m = printMask(); inkCv = inkCv || document.createElement('canvas'); inkCv.width = m.width; inkCv.height = m.height;
  const x = inkCv.getContext('2d'); x.clearRect(0, 0, m.width, m.height); x.drawImage(m, 0, 0); x.fillStyle = `rgba(0,0,0,${look.ocd})`; x.fillRect(0, 0, m.width, m.height);
  inkSig = sig; return inkCv;
}
function repaintPrint() {
  const ink = curInk, paper = inkOf(ink);
  px.clearRect(0, 0, W, H);
  for (const f of [...printsBy.all, ...printsBy[page]]) f(px, ink, paper);
  // worn ink (v0.31.3): the whole print is rubbed through where the panel's wear map dips, like the logo
  px.save(); px.setTransform(1, 0, 0, 1, 0, 0); px.globalCompositeOperation = 'destination-in'; px.drawImage(inkMask(), 0, 0); px.restore();
  printTex.needsUpdate = true;
}
// the print's labels that can change: the reverb and drive slots, the dimmed Res, the step-sequencer slabs
const printSigNow = () => curInk + '|' + (state.params.revtype | 0) + (state.params.drvtype | 0) + (state.params.flgmode | 0) + (state.params.lexprog | 0) + (state.params.cnvprog | 0)
  + '|' + Object.keys(state.cseq || {}).filter(cseqOn).join() + '|' + page
  + '|' + (page === 'seq' ? ['p-paste', 'p-undo'].map((id) => +document.getElementById(id).disabled).join() + state.slots.map((x) => +!!(x && x.steps && x.steps.some((st) => st.m !== 'R'))).join('') + state.slot + '|' + state.scale.i + state.scale.on : '');

// ---------------------------------------------------------------- camera: face on, fixed
function fit() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const small = Math.min(w, h) < 600, padX = small ? 6 : 48, padY = small ? 6 : 48;
  const fx = (w - 2 * padX) / w, fy = (h - 2 * padY) / h, t = Math.tan(camera.fov * Math.PI / 360);
  const d = Math.max((H / 2) / (t * fy), (W / 2) / (t * camera.aspect * fx)) + 20;
  camera.near = d / 20; camera.far = d * 4;
  camera.position.set(0, 0, d); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  shadowDirty = dirty = true;
}
addEventListener('resize', fit); if (window.visualViewport) visualViewport.addEventListener('resize', fit);

// ---------------------------------------------------------------- pointer (mouse and touch the same)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -8), hitP = new THREE.Vector3();
function toPanel(e) {
  const r = cv.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); if (!ray.ray.intersectPlane(plane, hitP)) return null;
  return [hitP.x + W / 2, H / 2 - hitP.y];
}
function pick(e) {
  const p = toPanel(e); if (!p) return null; let best = null, bd = Infinity;
  for (const c of ctls) {
    if (!c.rect || (c.page !== page && c.page !== 'all') || (c.kind === 'knob' && !c.cur())) continue;
    const [x, y, w, h] = c.rect; if (p[0] < x || p[0] > x + w || p[1] < y || p[1] > y + h) continue;
    const d = Math.hypot(p[0] - (x + w / 2), p[1] - (y + h / 2)); if (d < bd) { bd = d; best = c; }
  }
  return best;
}
const grabs = new Map();
const dragRange = () => Math.max(140, Math.min(220, innerHeight * 0.38));
cv.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  const sk = stickerAt(toPanel(e));
  if (sk) { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) {} grabs.set(e.pointerId, { c: { kind: 'sticker', st: sk }, x: e.clientX, y: e.clientY, moved: false, back: e.shiftKey }); return; }
  const c = pick(e); if (!c) return;
  e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  boot();
  const g = { c, x: e.clientX, y: e.clientY, moved: false };
  if (c.kind === 'roll') { rollGrab.down(toPanel(e)); }
  else if (c.kind === 'knob') {
    g.id = c.cur(); g.v0 = knobBase(g.id); ro.show(c, knobText(g.id, g.v0));
    if (g.id !== 'bpm' && !SQK[g.id]) g.hold = setTimeout(() => { if (!g.moved && grabs.get(e.pointerId) === g) { grabs.delete(e.pointerId); ro.hide(); setKnob(g.id, g.v0); sheetVars(); cseqOpen(g.id); } }, 550);
  } else if (c.kind === 'key') { c.down = true; if (c.hold) c.hold(true); else if (c.press) c.press(); }
  else if (c.kind === 'lever') { c.held = true; g.v0 = c.v; }
  grabs.set(e.pointerId, g); dirty = true;
});
cv.addEventListener('pointermove', (e) => {
  const g = grabs.get(e.pointerId); if (!g) return;
  if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 6) g.moved = true;
  const c = g.c;
  if (c.kind === 'roll') rollGrab.move(toPanel(e));
  else if (c.kind === 'knob') {
    const v = Math.max(0, Math.min(1, g.v0 + (g.y - e.clientY) / dragRange() * (e.shiftKey ? 0.2 : 1)));
    setKnob(g.id, v); ro.show(c, knobText(g.id, knobBase(g.id)));
  } else if (c.kind === 'lever') {
    const r = cv.getBoundingClientRect(), pxPerUnit = r.width / W * (camera.position.z > 0 ? 1 : 1);
    const v = Math.max(-1, Math.min(1, g.v0 + (e.clientX - g.x) / (c.half * pxPerUnit))); c.v = v; setLever(v);
  }
  dirty = true;
});
function release(e) {
  const g = grabs.get(e.pointerId); if (!g) return; grabs.delete(e.pointerId); clearTimeout(g.hold);
  const c = g.c;
  if (c.kind === 'knob') ro.hide();
  else if (c.kind === 'roll') rollGrab.up();
  else if (c.kind === 'key') { c.down = false; if (c.hold) c.hold(false); }
  else if (c.kind === 'lever') { c.held = false; setLever(0); }
  else if ((c.kind === 'display' || c.kind === 'title') && !g.moved && e.type === 'pointerup') c.press();
  else if (c.kind === 'sticker' && !g.moved && e.type === 'pointerup') { if (g.back) shyoyRand.back(); else shyoyRand.roll(); wobble(c.st); printDirty = true; }
  dirty = true;
}
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); const sk = stickerAt(toPanel(e)); if (sk) { if (shyoyRand.back()) wobble(sk); return; } const c = pick(e); if (c && c.kind === 'knob' && c.cur() !== 'bpm' && !SQK[c.cur()]) { sheetVars(); cseqOpen(c.cur()); } });
cv.addEventListener('wheel', (e) => {
  const c = pick(e); if (!c || c.kind !== 'knob') return; e.preventDefault(); boot();
  const id = c.cur(); setKnob(id, knobBase(id) - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.02));
}, { passive: false });

// ---------------------------------------------------------------- overlays: OPTIONS and the preset browser
const css = document.createElement('style');
css.textContent = `
#v3d { position: fixed; inset: 0; width: 100vw; height: 100dvh; display: block; touch-action: none; z-index: 1; }
html[data-view="3d"] body { background: var(--v3d-bg, #111) !important; }
html[data-view="2d"] #v3d, html[data-view="2d"] .v3d-sheet { display: none !important; }
.v3d-sheet { position: fixed; inset: 0; z-index: 30; display: none; align-items: center; justify-content: center; font-family: ${MONO}; }
.v3d-sheet.open { display: flex; }
.v3d-sheet .win { position: relative; width: min(560px, 94vw); max-height: 88dvh; overflow: auto; background: var(--v3d-panel); color: var(--v3d-ink);
  box-shadow: inset 0 0 0 2px var(--v3d-ink), 0 20px 60px rgba(0,0,0,.55); padding: 34px 22px 16px; box-sizing: border-box; }
.v3d-sheet h2 { position: absolute; top: 8px; left: 14px; margin: 0; font: 400 15px/1 ${DISPLAY}; letter-spacing: .04em; color: var(--v3d-paper); background: var(--v3d-ink); padding: 4px 9px 3px; }
.v3d-sheet .x { position: absolute; top: 6px; right: 10px; width: 30px; height: 26px; }
.v3d-sheet .lamp { display: grid; grid-template-columns: 16px 34px repeat(3, 1fr); gap: 4px 10px; align-items: center; margin: 0 0 8px; font-size: 10px; letter-spacing: .06em; }
.v3d-sheet .lamp input[type=color] { width: 34px; height: 24px; padding: 0; border: 0; background: none; }
.v3d-sheet .lamp label { display: grid; grid-template-columns: 1fr auto; gap: 0 4px; } .v3d-sheet .lamp label input { grid-column: 1 / -1; width: 100%; margin: 2px 0 0; min-width: 0; }
.v3d-sheet .lamp label i { font-style: normal; grid-row: 1; grid-column: 2; }
.v3d-sheet .otab3 { display: flex; flex-wrap: wrap; gap: 0; margin: 4px 0 16px; border-bottom: 2px solid var(--v3d-ink); }
.v3d-sheet .otab3 button { background: none; color: var(--v3d-ink); border-radius: 3px 3px 0 0; padding: 8px 12px 7px; opacity: .6; }
.v3d-sheet .otab3 button.lit { background: var(--v3d-ink); color: var(--v3d-paper); opacity: 1; }
.v3d-sheet .stk { display: grid; grid-template-columns: 96px repeat(4, 1fr); gap: 4px 10px; align-items: center; margin: 0 0 10px; font-size: 10px; letter-spacing: .06em; }
.v3d-sheet .stk.off label { opacity: .4; }
.v3d-sheet .stk label { display: grid; grid-template-columns: 1fr auto; gap: 0 4px; } .v3d-sheet .stk label input { grid-column: 1 / -1; width: 100%; margin: 2px 0 0; min-width: 0; }
.v3d-sheet .stk label i { font-style: normal; grid-row: 1; grid-column: 2; }
.v3d-sheet [hidden] { display: none !important; }
.v3d-sheet .bxc { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 10px; }
.v3d-sheet .bxc label { display: flex; align-items: center; gap: 7px; font-size: 10.5px; letter-spacing: .06em; cursor: pointer; }
.v3d-sheet .bxc input[type=color] { width: 30px; height: 22px; flex: none; } .v3d-sheet .bxc span { flex: 1; }
.v3d-sheet .bxc .clr { padding: 3px 7px; visibility: hidden; } .v3d-sheet .bxc .set .clr { visibility: visible; }
.v3d-sheet .chk { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: .08em; cursor: pointer; }
.v3d-sheet .chk input { width: 18px; height: 18px; accent-color: var(--v3d-ink); margin: 0; }
.v3d-sheet .f { margin: 0 0 14px; } .v3d-sheet .hint { margin: 6px 0 0; font-size: 9px; letter-spacing: .06em; opacity: .6; } .v3d-sheet .f > span { display: block; font-size: 11px; font-weight: 600; letter-spacing: .08em; margin-bottom: 6px; }
.v3d-sheet .row { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
.v3d-sheet button { font: 600 11px ${MONO}; letter-spacing: .06em; color: #fff; background: #0c0c0c; border: 0; border-radius: 3px; padding: 7px 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.v3d-sheet button i { width: 6px; height: 6px; border-radius: 50%; background: #3a0906; display: inline-block; }
.v3d-sheet button.lit i { background: #ff2a14; box-shadow: 0 0 6px #ff2a14; }
.v3d-sheet button.arm { outline: 2px dashed #ff2a14; outline-offset: 1px; }
.v3d-sheet .sw { width: 28px; height: 28px; padding: 0; border-radius: 3px; box-shadow: inset 0 0 0 1.5px rgba(0,0,0,.35); }
.v3d-sheet .sw.lit { outline: 2px solid var(--v3d-ink); outline-offset: 2px; }
.v3d-sheet input[type=range] { flex: 1; min-width: 120px; accent-color: var(--v3d-ink); }
.v3d-sheet input[type=color] { width: 40px; height: 28px; border: 0; padding: 0; background: none; }
.v3d-sheet b.val { font-size: 11px; min-width: 42px; text-align: right; }
.v3d-sheet .list { max-height: 52dvh; overflow: auto; border-top: 1.5px solid var(--v3d-ink); }
.v3d-sheet .list h3 { margin: 10px 0 4px; font-size: 10px; letter-spacing: .1em; font-weight: 600; opacity: .7; }
.v3d-sheet .list button { width: 100%; justify-content: flex-start; margin: 0 0 4px; }
.v3d-sheet .list button.lit { box-shadow: inset 3px 0 0 #ff2a14; }
.v3d-sheet input[type=text] { flex: 1; font: 600 12px ${MONO}; padding: 6px 8px; border: 1.5px solid var(--v3d-ink); background: transparent; color: inherit; border-radius: 3px; min-width: 0; }
/* v0.25.0: the 2D app's Options (MIDI, sequencer, about) and the per-control step sequencer, drawn as cards of the panel */
html[data-view="3d"] dialog#options, html[data-view="3d"] dialog#cseq {
  --glass-rgb: var(--v3d-panel-rgb); --ink-rgb: var(--v3d-ink-rgb); --dirt: 0; --grain: 0; --glow: 0;
  --glass: rgb(var(--glass-rgb)); --ink: rgb(var(--ink-rgb)); --muted: rgb(var(--ink-rgb) / .62); --ghost: rgb(var(--ink-rgb) / .13);
  --tint: rgb(var(--ink-rgb) / .07); --lit: rgb(var(--glass-rgb) / .8); --line: rgb(var(--ink-rgb) / .42); --rule: 1px solid var(--line);
  --shadow: none; --acc: #ff2a14; --f-lcd: ${MONO}; --fs-xs: 12px; --fs-s: 13px; --fs: 14px; --fs-l: 16px; --fs-xl: 26px; --bezel: rgb(var(--ink-rgb));
  font-family: ${MONO}; letter-spacing: .03em; background-image: none; border: 0; border-radius: 0;
  box-shadow: inset 0 0 0 2px var(--ink), 0 20px 60px rgba(0,0,0,.55); }
html[data-view="3d"] dialog#options { width: min(860px, calc(100vw - 24px)); height: auto; max-height: min(600px, calc(100dvh - 24px)); inset: auto; left: 50%; top: 50%; margin: 0; transform: translate(-50%, -50%); }
html[data-view="3d"] dialog#cseq { width: min(620px, calc(100vw - 24px)); inset: auto; left: 50%; top: 50%; margin: 0; transform: translate(-50%, -50%); }
html[data-view="3d"] dialog#options::backdrop, html[data-view="3d"] dialog#cseq::backdrop { background: rgb(0 0 0 / .55); }
html[data-view="3d"] #otabs [data-sec=colours] { display: none; }
html[data-view="3d"] dialog#options :is(h2, h3, .otabs button), html[data-view="3d"] dialog#cseq h2 { text-transform: uppercase; }
html[data-view="3d"] dialog#options .btn, html[data-view="3d"] dialog#cseq .btn { font-family: ${MONO}; text-transform: uppercase; }
#v3d-splash { position: fixed; inset: 0; z-index: 100; background: #0b0b0b; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; transition: opacity .35s; }
`;
document.head.appendChild(css);
function sheetVars() {
  const s = root.style; s.setProperty('--v3d-panel', look.colour); s.setProperty('--v3d-ink', curInk); s.setProperty('--v3d-paper', inkOf(curInk));
  const trip = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
  s.setProperty('--v3d-panel-rgb', trip(look.colour)); s.setProperty('--v3d-ink-rgb', trip(curInk));
}
function sheet(title) {
  const el = document.createElement('div'); el.className = 'v3d-sheet';
  el.innerHTML = `<div class="win" role="dialog" aria-label="${title}"><h2>${title}</h2><button class="x" aria-label="Close">✕</button><div class="body"></div></div>`;
  document.body.appendChild(el);
  const close = () => el.classList.remove('open');
  el.querySelector('.x').onclick = close;
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return { el, body: el.querySelector('.body'), open() { sheetVars(); el.classList.add('open'); }, close };
}
const opt = sheet('OPTIONS');
// v0.33.0 (Johnny): OPTIONS in tabs
const OPT_TABS = [['look', 'LOOK'], ['light', 'LIGHT'], ['colours', 'COLOURS'], ['knobs', 'KNOBS'], ['stickers', 'STICKERS'], ['wear', 'WEAR'], ['more', 'MORE']];
let optTab = 'look'; try { optTab = localStorage.getItem('shyoy.opttab3d') || 'look'; } catch (e) {}
opt.body.innerHTML = `
  <div class="otab3">${OPT_TABS.map(([k, n]) => `<button data-tab="${k}">${n}</button>`).join('')}</div>
  <div class="pane" data-pane="look">
  <div class="f"><span>LOOKS</span><div class="row" id="o3-looks">${[0, 1, 2, 3].map((i) => `<button data-look="${i}"><i></i>LOOK ${i + 1}</button>`).join('')}<button id="o3-lsave">SAVE…</button></div></div>
  <div class="f"><span>PANEL COLOUR</span><div class="row" id="o3-sw">${SWATCHES.map((c) => `<button class="sw" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}<input type="color" id="o3-col" aria-label="Any colour"></div></div>
  <div class="f"><span>FINISH</span><div class="row" id="o3-fin">${Object.entries(FINISH).map(([k, f]) => `<button data-f="${k}"><i></i>${f.name}</button>`).join('')}</div></div>
  </div>
  <div class="pane" data-pane="light">
  <div class="f"><span>LIGHTING</span><div class="row" id="o3-light">${Object.entries(LIGHTS).map(([k, l]) => `<button data-l="${k}"><i></i>${l.name}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><input type="range" min="40" max="160" id="o3-bright" aria-label="Brightness"><b class="val" id="o3-brightv"></b></div></div>
  <div class="f"><span>LIGHTS</span>${[0, 1, 2].map((i) => `<div class="lamp" data-i="${i}"><b class="n">${i + 1}</b><input type="color" data-k="col" aria-label="Light ${i + 1} colour">
    <label>LEVEL<input type="range" data-k="int" min="0" max="300" aria-label="Light ${i + 1} intensity"><i></i></label>
    <label>ORBIT<input type="range" data-k="az" min="0" max="359" aria-label="Light ${i + 1} orbit"><i></i></label>
    <label>HEIGHT<input type="range" data-k="el" min="3" max="90" aria-label="Light ${i + 1} height"><i></i></label></div>`).join('')}</div>
  <div class="f"><span>LENS / DEPTH</span><div class="row"><input type="range" min="0" max="100" id="o3-lens" aria-label="Lens, long to wide"><b class="val" id="o3-lensv"></b></div></div>
  </div>
  <div class="pane" data-pane="colours">
  ${['synth', 'seq'].map((pg) => `<div class="f"><span>${pg === 'synth' ? 'SYNTH PAGE' : 'SEQUENCER PAGE'}</span><div class="bxc">${BOXR.filter((b) => b.page === pg && b.knobs).map((b) => `<label data-bk="${boxKey(b)}"><input type="color" aria-label="${b.n} colour"><span>${b.n}</span><button class="clr" aria-label="Clear ${b.n}">×</button></label>`).join('')}</div></div>`).join('')}
  <div class="row"><button id="o3-bxall">ALL BLACK</button></div>
  </div>
  <div class="pane" data-pane="knobs">
  <div class="f"><span>KNOB STYLE</span><div class="row">${Object.entries(KSTYLES).map(([k, st]) => `<button data-ks="${k}"><i></i>${st.name}</button>`).join('')}</div></div>
  <div class="f"><span>KNOB SIZE</span><div class="row"><input type="range" min="0" max="100" id="o3-ksize" aria-label="Knob size"><b class="val" id="o3-ksizev"></b></div></div>
  <div class="f"><span>KNOB TILT</span><div class="row"><input type="range" min="0" max="80" id="o3-tilt" aria-label="Knob tilt"><b class="val" id="o3-tiltv"></b></div></div>
  </div>
  <div class="pane" data-pane="stickers">
  <div class="f"><label class="chk"><input type="checkbox" id="o3-stkon"> SHOW STICKERS</label></div>
  <div class="f"><span>RANDOM AMOUNT</span><div class="row"><input type="range" min="0" max="100" id="o3-rnd" aria-label="How far a sticker click moves the sound"><b class="val" id="o3-rndv"></b></div>
    <p class="hint">CLICK A STICKER FOR A NEW SOUND. RIGHT-CLICK OR SHIFT-CLICK ONE TO GO BACK.</p></div>
  <div class="f" id="o3-stklist"><span>STICKERS</span>${STICKERS.map((st) => `<div class="stk" data-sk="${st.id}"><button data-st="${st.id}"><i></i>${st.name}</button>
    <label>SIZE<input type="range" data-k="s" min="40" max="300" aria-label="${st.name} size"><i></i></label>
    <label>ACROSS<input type="range" data-k="x" min="0" max="${W}" aria-label="${st.name} across"><i></i></label>
    <label>HEIGHT<input type="range" data-k="y" min="0" max="${H}" aria-label="${st.name} up or down"><i></i></label>
    <label>TURN<input type="range" data-k="r" min="-180" max="180" aria-label="${st.name} turn"><i></i></label></div>`).join('')}
    <div class="row"><button id="o3-stkreset">RESET PLACES</button></div></div>
  </div>
  <div class="pane" data-pane="wear">
  <div class="f"><span>OCD</span><div class="row"><input type="range" min="0" max="100" id="o3-ocd" aria-label="OCD: 0 every defect, 100 spotless"><b class="val" id="o3-ocdv"></b></div></div>
  </div>
  <div class="pane" data-pane="more">
  <div class="f"><span>MORE</span><div class="row"><button id="o3-midi">MIDI</button><button id="o3-seqo">SEQUENCER</button><button id="o3-about">ABOUT</button><button id="o3-reset">RESET LOOK</button></div></div>
  </div>`;
const $o = (s) => opt.body.querySelector(s);
const LOOK_CMP = ['colour', 'light', 'bright', 'finish', 'lens', 'tilt', 'ksize', 'kstyle', 'knobCol', 'lights', 'stickers', 'stkOn', 'stk'];
function drawOpt() {
  const same = (a, b) => !!a && JSON.stringify(LOOK_CMP.map((k) => a[k] ?? LOOK0[k])) === JSON.stringify(LOOK_CMP.map((k) => b[k] ?? LOOK0[k]));
  opt.body.querySelectorAll('[data-look]').forEach((b) => { const sl = lookSlots[+b.dataset.look]; b.classList.toggle('lit', same(sl, look)); b.style.opacity = sl || lookSaving ? '' : '.45'; b.classList.toggle('arm', lookSaving); });
  $o('#o3-lsave').classList.toggle('lit', lookSaving); $o('#o3-lsave').textContent = lookSaving ? 'PICK A SLOT' : 'SAVE…';
  opt.body.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('lit', b.dataset.c.toLowerCase() === look.colour.toLowerCase()));
  opt.body.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('lit', b.dataset.l === look.light));
  opt.body.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('lit', b.dataset.f === look.finish));
  $o('#o3-col').value = look.colour; $o('#o3-bright').value = Math.round(look.bright * 100); $o('#o3-brightv').textContent = Math.round(look.bright * 100) + '%';
  opt.body.querySelectorAll('.lamp').forEach((d) => {
    const l = look.lights[+d.dataset.i];
    d.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k; inp.value = k === 'int' ? Math.round(l.int * 100) : l[k];
      if (inp.type === 'range') inp.nextElementSibling.textContent = k === 'int' ? Math.round(l.int * 100) + '%' : l[k] + '°';
    });
  });
  opt.body.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('lit', b.dataset.tab === optTab));
  opt.body.querySelectorAll('[data-pane]').forEach((d) => { d.hidden = d.dataset.pane !== optTab; });
  opt.body.querySelectorAll('[data-st]').forEach((b) => b.classList.toggle('lit', look.stickers.includes(b.dataset.st)));
  $o('#o3-stkon').checked = look.stkOn; $o('#o3-stklist').style.opacity = look.stkOn ? '' : '.45';
  opt.body.querySelectorAll('.stk').forEach((d) => {
    const st = STICKERS.find((t) => t.id === d.dataset.sk), q = stkPlace(st), on = look.stickers.includes(st.id); d.classList.toggle('off', !on);
    const vals = { s: Math.round(q.size / st.size * 100), x: Math.round(q.cx), y: Math.round(H - q.cy), r: Math.round(q.rot) };
    d.querySelectorAll('[data-k]').forEach((inp) => { inp.value = vals[inp.dataset.k]; inp.nextElementSibling.textContent = inp.dataset.k === 's' ? vals.s + '%' : inp.dataset.k === 'r' ? vals.r + '°' : vals[inp.dataset.k]; });
  });
  $o('#o3-ocd').value = Math.round(look.ocd * 100); $o('#o3-ocdv').textContent = Math.round(look.ocd * 100);
  $o('#o3-rnd').value = Math.round(shyoyRand.amount * 100); $o('#o3-rndv').textContent = Math.round(shyoyRand.amount * 100);
  opt.body.querySelectorAll('[data-ks]').forEach((b) => b.classList.toggle('lit', b.dataset.ks === kstyle()));
  opt.body.querySelectorAll('[data-bk]').forEach((l) => { const c = look.knobCol[l.dataset.bk]; l.querySelector('input').value = c || '#0e0e0e'; l.classList.toggle('set', !!c); });
  $o('#o3-ksize').value = Math.round(ksizeToUI(look.ksize)); $o('#o3-ksizev').textContent = Math.round(ksizeToUI(look.ksize));
  $o('#o3-tilt').value = Math.round(look.tilt * 10); $o('#o3-tiltv').textContent = look.tilt.toFixed(1) + '°';
  $o('#o3-lens').value = Math.round(look.lens * 100); $o('#o3-lensv').textContent = Math.round(lensFov(look.lens)) + '°';
  sheetVars();
}
const setLook = (k, v) => { look[k] = v; saveLook(); applyLook(); drawOpt(); };
opt.body.querySelectorAll('[data-look]').forEach((b) => b.onclick = () => {
  const i = +b.dataset.look;
  if (lookSaving) { lookSlots[i] = copyLook(look); saveSlots(); lookSaving = false; drawOpt(); return; }
  if (!lookSlots[i]) return;
  // v0.33.2 (Johnny): a look carries its stickers (which, shown or not, size/place/turn); older saved looks get the defaults
  Object.assign(look, { stickers: ['smile'], stkOn: true, stk: {}, kstyle: 'yamaha', knobCol: {} }, copyLook(lookSlots[i])); delete look.boxCol; saveLook(); applyLook(); drawOpt();
});
$o('#o3-lsave').onclick = () => { lookSaving = !lookSaving; drawOpt(); };
opt.body.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => setLook('colour', b.dataset.c));
$o('#o3-col').oninput = (e) => setLook('colour', e.target.value);
opt.body.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { look.lights = presetLights(b.dataset.l); setLook('light', b.dataset.l); });
opt.body.querySelectorAll('.lamp [data-k]').forEach((inp) => inp.oninput = () => {
  const l = look.lights[+inp.closest('.lamp').dataset.i], k = inp.dataset.k;
  l[k] = k === 'col' ? inp.value : k === 'int' ? inp.value / 100 : +inp.value; setLook('lights', look.lights);
});
opt.body.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => setLook('finish', b.dataset.f));
$o('#o3-bright').oninput = (e) => setLook('bright', e.target.value / 100);
$o('#o3-lens').oninput = (e) => setLook('lens', e.target.value / 100);
opt.body.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { const id = b.dataset.st, on = look.stickers.includes(id); setLook('stickers', on ? look.stickers.filter((x) => x !== id) : [...look.stickers, id]); });
opt.body.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { optTab = b.dataset.tab; try { localStorage.setItem('shyoy.opttab3d', optTab); } catch (e) {} drawOpt(); });
opt.body.querySelectorAll('.stk [data-k]').forEach((inp) => inp.oninput = () => {
  const id = inp.closest('.stk').dataset.sk, k = inp.dataset.k, q = { ...(look.stk[id] || {}) };
  q[k] = k === 's' ? inp.value / 100 : k === 'y' ? H - inp.value : +inp.value; look.stk = { ...look.stk, [id]: q };
  if (!look.stickers.includes(id)) look.stickers = [...look.stickers, id];
  setLook('stk', look.stk);
});
$o('#o3-rnd').oninput = (e) => { shyoyRand.amount = e.target.value / 100; $o('#o3-rndv').textContent = e.target.value; };
$o('#o3-stkon').onchange = (e) => setLook('stkOn', e.target.checked);
$o('#o3-stkreset').onclick = () => setLook('stk', {});
$o('#o3-ocd').oninput = (e) => setLook('ocd', e.target.value / 100);
opt.body.querySelectorAll('[data-bk]').forEach((l) => {
  l.querySelector('input').oninput = (e) => setLook('knobCol', { ...look.knobCol, [l.dataset.bk]: e.target.value });
  l.querySelector('.clr').onclick = (e) => { e.preventDefault(); const c = { ...look.knobCol }; delete c[l.dataset.bk]; setLook('knobCol', c); };
});
$o('#o3-bxall').onclick = () => setLook('knobCol', {});
opt.body.querySelectorAll('[data-ks]').forEach((b) => b.onclick = () => setLook('kstyle', b.dataset.ks));
$o('#o3-ksize').oninput = (e) => setLook('ksize', KSIZE[0] + (KSIZE[1] - KSIZE[0]) * e.target.value / 100);
$o('#o3-tilt').oninput = (e) => setLook('tilt', e.target.value / 10);
for (const [id, k] of [['#o3-midi', 'midi'], ['#o3-seqo', 'seq'], ['#o3-about', 'about']]) $o(id).onclick = () => { opt.close(); sheetVars(); showOptTab(k); openOptions(); };
$o('#o3-reset').onclick = () => { Object.assign(look, LOOK0, { lights: LOOK0.lights.map((l) => ({ ...l })) }); saveLook(); applyLook(); drawOpt(); };
function openOptions3d() { drawOpt(); opt.open(); }

// the preset browser: the app's own preset list (the hidden select), its prev/next and its save bar
const pb = sheet('PRESETS');
pb.body.innerHTML = `<div class="f"><div class="row"><input type="text" id="pb-name" maxlength="40" placeholder="SAVE AS…" aria-label="Preset name"><button id="pb-roll" aria-label="Suggest another name">🎲</button><button id="pb-save">SAVE</button></div></div><div class="list" id="pb-list"></div>`;
pb.body.querySelector('#pb-roll').onclick = () => {
  prjBar.suggest(true);
  pb.body.querySelector('#pb-name').value = document.getElementById('prj-name').value || '';
};
const prjSel = document.getElementById('prj-preset');
function drawBrowser() {
  let h = '';
  for (const g of prjSel.querySelectorAll('optgroup')) {
    h += `<h3>${g.label.toUpperCase()}</h3>`;
    for (const o of g.querySelectorAll('option')) h += `<button data-v="${o.value.replace(/"/g, '&quot;')}" class="${o.value === prjSel.value ? 'lit' : ''}">${o.textContent.replace(/</g, '&lt;')}</button>`;
  }
  pb.body.querySelector('#pb-list').innerHTML = h;
}
pb.body.querySelector('#pb-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]'); if (!b) return;
  prjSel.value = b.dataset.v; prjSel.dispatchEvent(new Event('change')); prjSel.dispatchEvent(new Event('sync'));
  drawBrowser(); dirty = true;
});
pb.body.querySelector('#pb-save').onclick = () => {
  const n = pb.body.querySelector('#pb-name').value.trim(); const ne = document.getElementById('prj-name');
  if (n) ne.value = n; document.getElementById('prj-save').click(); pb.body.querySelector('#pb-name').value = ''; drawBrowser(); dirty = true;
};
// the auto-namer (prjBar, from sounds.js) suggests a name in the save box, as the 2D preset bar does
function openBrowser() {
  drawBrowser();
  const pn = pb.body.querySelector('#pb-name');
  if (typeof prjBar !== 'undefined') prjBar.suggest(false);
  pn.value = document.getElementById('prj-name').value || '';
  pn.placeholder = 'SAVE AS…';
  pb.open();
}

// ---------------------------------------------------------------- frame loop: draw only when something changed
let live = true, drawn = 0;
function frame() {
  if (!live) return;
  for (const c of ctls) if (c.sync()) dirty = true;
  if (wobbles.size) wobbleStep(performance.now());
  const sig = printSigNow(); if (sig !== printSig) { printSig = sig; printDirty = true; }
  if (printDirty) { printDirty = false; repaintPrint(); dirty = true; }
  if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; dirty = true; }
  if (dirty || drawn < 3) { renderer.render(scene, camera); dirty = false; if (drawn < 3) drawn++; }
  if (drawn === 3) { drawn = 4; window.shyoySplash && window.shyoySplash.done(); }
  requestAnimationFrame(frame);
}
// the 2D view's own knob markers: a 3D knob is a registered copy of its control, so the step sequencer's
// heard value reaches it (the frame loop reads it anyway; this keeps cseqOpen's checks happy for every control)
applyLook(); setPage(page);
requestAnimationFrame(frame);

window.shyoy3d = {
  ready: true,
  show() { if (!live) { live = true; fit(); dirty = printDirty = shadowDirty = true; requestAnimationFrame(frame); } },
  hide() { live = false; opt.close(); pb.close(); },
  // for headless checks: where a control is on screen
  where(id) { const k = knobs.find((k) => k.cur() === id); if (!k) return null; const v = P(k.cx, k.cy, KSTYLES[kstyle()].g.h * look.ksize).project(camera); const r = cv.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
  tap(tag) { const c = ctls.find((c) => c.tag === tag); if (!c) return null; const [x, y, w, h] = c.rect; return this.at(x + w / 2, y + h / 2); },
  title() { return this.at(TITLE.x + TITLE.w / 2, TITLE.y + 50); },
  rollCell(i, key) { const ri = ROWS_DEF.findIndex((r) => r[0] + r[1] === key); return this.at(RL.x + (i - rollPage * SHOW + 0.5) * colW, rowsY[ri] + rowH / 2); },
  at(pxX, pxY) { const v = P(pxX, pxY, 8).project(camera); const r = cv.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
  ctls, W, H, look,
};
