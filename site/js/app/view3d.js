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
const LOOK0 = { colour: '#e4e2da', light: 'studio', bright: 1, finish: 'satin', lens: 0.4 };
const look = { ...LOOK0 };
try { Object.assign(look, JSON.parse(localStorage.getItem(LOOK_KEY) || '{}')); } catch (e) {}
const saveLook = () => { try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) {} };
const SWATCHES = ['#e4e2da', '#f4f3ef', '#b9bbb8', '#6c6e70', '#202122', '#c4352b', '#df7a2c', '#e6c24a', '#4e7b56', '#2f5c88', '#ef9fbf'];
const LIGHTS = {
  studio: { name: 'STUDIO', dir: [-0.45, 0.55, 1], col: 0xffffff, key: 1.7, hemi: 0.75 },
  warm: { name: 'WARM', dir: [0.5, 0.6, 1], col: 0xffd2a0, key: 1.7, hemi: 0.7, hemiCol: 0xfff0dc },
  cool: { name: 'COOL', dir: [-0.3, 0.7, 1], col: 0xcfe0ff, key: 1.6, hemi: 0.75, hemiCol: 0xe6eeff },
  raking: { name: 'LOW SUN', dir: [-1, 0.22, 0.42], col: 0xfff3e2, key: 2.4, hemi: 0.45 },
  top: { name: 'OVERHEAD', dir: [0, 1, 0.6], col: 0xffffff, key: 1.8, hemi: 0.65 },
};
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

const P = (px, py, z = 0) => new THREE.Vector3(px - W / 2, H / 2 - py, z);   // panel px (y down) -> world
const panelMat = new THREE.MeshStandardMaterial({ color: 0xe4e2da, roughness: 0.6 });
const edgeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
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
  knob: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.85, metalness: 0, envMapIntensity: 0.3 }),
  knobTop: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.45, metalness: 0, envMapIntensity: 0.8 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb4b4b4, roughness: 0.3, metalness: 1, envMapIntensity: 0.5 }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  keyTop: new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.42, metalness: 0, envMapIntensity: 0.9 }),
  keySide: new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.5, metalness: 0, envMapIntensity: 0.7 }),
  ledOn: new THREE.MeshBasicMaterial({ color: 0xff2a14 }),
  ledOff: new THREE.MeshStandardMaterial({ color: 0x3a0906, roughness: 0.35, metalness: 0, envMapIntensity: 1 }),
  glow: new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,60,30,.9)'); g.addColorStop(0.35, 'rgba(255,40,20,.35)'); g.addColorStop(1, 'rgba(255,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
};
const knobGeo = (() => {
  const p = [[0, 0], [KR + 2.6, 0], [KR + 2.6, 2.4], [KR + 0.6, 4.2], [KR, 12], [KR - 1.5, 15], [KR - 3.2, 15.9], [0, 15.9]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(p, 48); g.rotateX(Math.PI / 2); return g;
})();
const rimGeo = (() => { const p = [[KR + 0.05, 11], [KR - 0.2, 13], [KR - 1.4, 15], [KR - 3, 15.92]].map(([r, y]) => new THREE.Vector2(r, y)); const g = new THREE.LatheGeometry(p, 48); g.rotateX(Math.PI / 2); return g; })();
const pointerGeo = new THREE.BoxGeometry(2.6, KR - 5, 0.8); pointerGeo.translate(0, 3 + (KR - 5) / 2, 16.2);
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
  const body = new THREE.Mesh(knobGeo, mat.knob); body.castShadow = true; body.receiveShadow = true;
  const rim = new THREE.Mesh(rimGeo, mat.rim);
  const top = new THREE.Mesh(new THREE.CircleGeometry(KR - 3.2, 40), mat.knobTop); top.position.z = 15.95;
  const ptr = new THREE.Mesh(pointerGeo, mat.white);
  const spin = new THREE.Group(); spin.add(body, rim, top, ptr); g.add(spin); grp.add(g);
  const k = { kind: 'knob', cx, cy, g, spin, shown: NaN, ...o, rect: [cx - C / 2 + 2, cy - 40, C - 4, 84] };
  k.sync = () => {
    const id = k.cur(); g.visible = !!id; if (!id) return false;
    const v = knobVal(id); if (v === k.shown) return false;
    k.shown = v; spin.rotation.z = -(-135 + 270 * v) * Math.PI / 180; return true;
  };
  addCtl(k); knobs.push(k); return k;
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
      makeKnob(cx, cy, { cur: () => it.id, base: () => knobBase(it.id) });
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
prints.push((x, ink) => {
  if (logo.naturalWidth) {
    const lw = 196, lh = lw * logo.naturalHeight / logo.naturalWidth, lx = TITLE.x + (TITLE.w - lw) / 2, ly = TITLE.y + 10;
    const t = document.createElement('canvas'); t.width = lw * S2; t.height = lh * S2; const tx = t.getContext('2d');
    tx.drawImage(logo, 0, 0, t.width, t.height); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = ink; tx.fillRect(0, 0, t.width, t.height);
    x.drawImage(t, lx, ly, lw, lh);
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
  printDirty = shadowDirty = dirty = true;
}

// ================================================================ the sequencer page (v0.25.0)
// The same panel, a second page: transport and pattern keys, length, gate, the generator, the piano roll as one printed
// grid you draw on, and the Randomise and Tools menus as rows of keys. Every press goes through the 2D sequencer's own
// functions (applyCell, paintCell, extendTo, keepUndo, stepChanged) and its menu buttons, so the pattern and what the
// engine is sent are the same as from the 2D roll.
buildPage = 'seq'; grp = pages.seq; prints = printsBy.seq;
const box = (c, r, s, h, n) => { const bx = M + c * C + 6, by = M + r * R + 12, bw = s * C - 12, bh = h * R - 12;
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
    prints.push((x, ink) => { x.fillStyle = ink; text(x, String(n + 1), kx, pt.y0 + KEYY + 18, 10); });
    // a used slot: a small mark over its key
    prints.push((x, ink) => { const u = state.slots[n] && state.slots[n].steps && state.slots[n].steps.some((st) => st.m !== 'R'); if (u) { x.fillStyle = ink; x.fillRect(kx - 6, pt.y0 + 44, 12, 2); } });
  }
  labelAt(() => 'PATTERN', pt.cx(0, 5), pt.y0 + LY);
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
  // the scale: SCALE steps through the list (its name under the key), APPLY ticks Apply scale on MIDI note
  const sc = box(13, 0, 5, 1, 'SCALE');
  makeKey(sc.cx(1), sc.y0 + KEYY, 24, 14, { on: () => false, press: () => setScale({ i: (state.scale.i + 1) % SCALE_LIST.length }), pad: 10, tag: 'scale' });
  labelAt(() => SCALE_LIST[state.scale.i].label, sc.cx(1), sc.y0 + LY);
  makeKey(sc.cx(3), sc.y0 + KEYY, 24, 14, { on: () => state.scale.on, press: () => setScale({ on: !state.scale.on }), pad: 10, tag: 'scaleOn' });
  labelAt(() => 'APPLY', sc.cx(3), sc.y0 + LY);
}
// the menus as rows of keys: [heading, [label, id]...] per column
const keyList = (b, colsDef) => colsDef.forEach((list, ci) => {
  let y = b.by + 26; const kx = b.bx + 18 + ci * (b.bw / 2);
  for (const row of list) {
    if (typeof row === 'string') { const yy = y; prints.push((x, ink) => { x.fillStyle = ink; x.globalAlpha = 0.6; text(x, row, kx - 7, yy + 4, 9.5, 'left'); x.globalAlpha = 1; }); y += 17; continue; }
    const [t, id] = row, ky = y + 4, el = () => document.getElementById(id);
    const k = makeKey(kx, ky, 15, 10, { on: () => k.down, press: () => { const b = el(); if (b && !b.disabled) b.click(); }, pad: 2, tag: 'm:' + id });
    k.rect = [kx - 12, ky - 8, b.bw / 2 - 12, 16];
    prints.push((x, ink) => { x.globalAlpha = el() && el().disabled ? 0.35 : 1; x.fillStyle = ink; text(x, t, kx + 12, ky + 0.5, 10.5, 'left'); x.globalAlpha = 1; });
    y += 18;
  }
});
keyList(box(14, 1, 4, 2, 'RANDOMISE'), [
  ['RANDOMISE', ['ACCENTS', 'r-acc'], ['SLIDES', 'r-slide'], ['OCTAVES', 'r-oct'], ['TIES', 'r-tie'], 'PATTERN', ['SHUFFLE', 'p-shuf'], ['GENERATE', 'p-rnd'], ['REFILL', 'p-refill']],
  ['ALTER', ['ACCENTS', 'a-acc'], ['SLIDES', 'a-slide'], ['OCTAVES', 'a-oct'], ['TIES', 'a-tie'], ['WHOLE', 'a-all']]]);
keyList(box(14, 3, 4, 2, 'TOOLS'), [
  ['PATTERN', ['COPY', 'p-copy'], ['PASTE', 'p-paste'], ['DOUBLE', 'p-dup'], ['CLEAR', 'p-clr'], ['UNDO', 'p-undo'], ['JOIN CHAIN', 'p-join']],
  ['NOTES', ['SEMI UP', 'nu-up'], ['SEMI DOWN', 'nu-dn'], ['OCT UP', 'nu-oup'], ['OCT DOWN', 'nu-odn'], ['SHIFT LEFT', 'rot-l'], ['SHIFT RIGHT', 'rot-r']]]);
// ---- the roll: one printed grid, redrawn when the pattern, the playhead or the page of steps changes
const RB = box(0, 1, 14, 4, 'PATTERN EDIT');
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
  key.color.set(L.col); key.intensity = L.key * b; hemi.intensity = L.hemi * b; hemi.color.set(L.hemiCol || 0xffffff); hemi.groundColor.set(0x404040);
  key.position.set(L.dir[0] * 2500, L.dir[1] * 2500, L.dir[2] * 2500); key.target.position.set(0, 0, 0);
  curInk = lum(look.colour) < 0.2 ? '#ffffff' : '#000000';
  camera.fov = lensFov(look.lens); fit();
  const bg = new THREE.Color(look.colour).multiplyScalar(0.28);
  document.body.style.setProperty('--v3d-bg', `radial-gradient(120% 90% at 50% 40%, #${bg.getHexString()} 0%, #0b0b0b 78%)`);
  printDirty = shadowDirty = dirty = true;
}
function repaintPrint() {
  const ink = curInk, paper = inkOf(ink);
  px.clearRect(0, 0, W, H);
  for (const f of [...printsBy.all, ...printsBy[page]]) f(px, ink, paper);
  printTex.needsUpdate = true;
}
// the print's labels that can change: the reverb and drive slots, the dimmed Res, the step-sequencer slabs
const printSigNow = () => curInk + '|' + (state.params.revtype | 0) + (state.params.drvtype | 0) + (state.params.flgmode | 0) + (state.params.lexprog | 0) + (state.params.cnvprog | 0)
  + '|' + Object.keys(state.cseq || {}).filter(cseqOn).join() + '|' + page
  + '|' + (page === 'seq' ? ['p-paste', 'p-undo'].map((id) => +document.getElementById(id).disabled).join() + state.slots.map((x) => +!!(x && x.steps && x.steps.some((st) => st.m !== 'R'))).join('') + '|' + state.scale.i + state.scale.on : '');

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
  dirty = true;
}
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); const c = pick(e); if (c && c.kind === 'knob' && c.cur() !== 'bpm' && !SQK[c.cur()]) { sheetVars(); cseqOpen(c.cur()); } });
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
.v3d-sheet .f { margin: 0 0 14px; } .v3d-sheet .f > span { display: block; font-size: 11px; font-weight: 600; letter-spacing: .08em; margin-bottom: 6px; }
.v3d-sheet .row { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
.v3d-sheet button { font: 600 11px ${MONO}; letter-spacing: .06em; color: #fff; background: #0c0c0c; border: 0; border-radius: 3px; padding: 7px 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.v3d-sheet button i { width: 6px; height: 6px; border-radius: 50%; background: #3a0906; display: inline-block; }
.v3d-sheet button.lit i { background: #ff2a14; box-shadow: 0 0 6px #ff2a14; }
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
opt.body.innerHTML = `
  <div class="f"><span>PANEL COLOUR</span><div class="row" id="o3-sw">${SWATCHES.map((c) => `<button class="sw" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}<input type="color" id="o3-col" aria-label="Any colour"></div></div>
  <div class="f"><span>LIGHTING</span><div class="row" id="o3-light">${Object.entries(LIGHTS).map(([k, l]) => `<button data-l="${k}"><i></i>${l.name}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><input type="range" min="40" max="160" id="o3-bright" aria-label="Brightness"><b class="val" id="o3-brightv"></b></div></div>
  <div class="f"><span>FINISH</span><div class="row" id="o3-fin">${Object.entries(FINISH).map(([k, f]) => `<button data-f="${k}"><i></i>${f.name}</button>`).join('')}</div></div>
  <div class="f"><span>LENS / DEPTH</span><div class="row"><input type="range" min="0" max="100" id="o3-lens" aria-label="Lens, long to wide"><b class="val" id="o3-lensv"></b></div></div>
  <div class="f"><span>MORE</span><div class="row"><button id="o3-midi">MIDI</button><button id="o3-seqo">SEQUENCER</button><button id="o3-about">ABOUT</button><button id="o3-2d">2D VIEW</button><button id="o3-reset">RESET LOOK</button></div></div>`;
const $o = (s) => opt.body.querySelector(s);
function drawOpt() {
  opt.body.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('lit', b.dataset.c.toLowerCase() === look.colour.toLowerCase()));
  opt.body.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('lit', b.dataset.l === look.light));
  opt.body.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('lit', b.dataset.f === look.finish));
  $o('#o3-col').value = look.colour; $o('#o3-bright').value = Math.round(look.bright * 100); $o('#o3-brightv').textContent = Math.round(look.bright * 100) + '%';
  $o('#o3-lens').value = Math.round(look.lens * 100); $o('#o3-lensv').textContent = Math.round(lensFov(look.lens)) + '°';
  sheetVars();
}
const setLook = (k, v) => { look[k] = v; saveLook(); applyLook(); drawOpt(); };
opt.body.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => setLook('colour', b.dataset.c));
$o('#o3-col').oninput = (e) => setLook('colour', e.target.value);
opt.body.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => setLook('light', b.dataset.l));
opt.body.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => setLook('finish', b.dataset.f));
$o('#o3-bright').oninput = (e) => setLook('bright', e.target.value / 100);
$o('#o3-lens').oninput = (e) => setLook('lens', e.target.value / 100);
for (const [id, k] of [['#o3-midi', 'midi'], ['#o3-seqo', 'seq'], ['#o3-about', 'about']]) $o(id).onclick = () => { opt.close(); sheetVars(); showOptTab(k); openOptions(); };
$o('#o3-2d').onclick = () => { opt.close(); window.shyoyView('2d'); };
$o('#o3-reset').onclick = () => { Object.assign(look, LOOK0); saveLook(); applyLook(); drawOpt(); };
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
  where(id) { const k = knobs.find((k) => k.cur() === id); if (!k) return null; const v = P(k.cx, k.cy, 16).project(camera); const r = cv.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
  tap(tag) { const c = ctls.find((c) => c.tag === tag); if (!c) return null; const [x, y, w, h] = c.rect; return this.at(x + w / 2, y + h / 2); },
  title() { return this.at(TITLE.x + TITLE.w / 2, TITLE.y + 50); },
  rollCell(i, key) { const ri = ROWS_DEF.findIndex((r) => r[0] + r[1] === key); return this.at(RL.x + (i - rollPage * SHOW + 0.5) * colW, rowsY[ri] + rowH / 2); },
  at(pxX, pxY) { const v = P(pxX, pxY, 8).project(camera); const r = cv.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
  ctls, W, H, look,
};
