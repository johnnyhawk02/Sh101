// Shyoy 3D panel (v0.24.0, after FILTH's view3d.js): the whole synth as ONE flat panel in three.js.
//
// The 2D app keeps running underneath, hidden. This view never talks to the engine itself: every knob, key and switch
// goes through the 2D app's own setters (ctlRegs[id].set, the switch buttons, setLever, the preset
// menu's own buttons), so presets, MIDI and saving are the app's, and the sound is the same.
// It reads state (state.params...) every frame and draws only when something changed.
//
// Layout: an 18 x 5 grid, one control per column (C px), one module row per R px, boxed sections with their names
// printed on the panel. Everything printed (boxes, tags, labels, the logo) is one flat canvas over the panel face.
import * as THREE from 'three';
import { RoomEnvironment } from './../vendor/RoomEnvironment.js';

const C = 70, R = 150, M = 8, COLS = 18, ROWS = 4;   // v0.43.6 (Johnny: "the synth shouldn't have a border"): margin 24 -> 8
const SEQ_GH = 240;   // v0.43.10: the sequencer grid's height
const SEQ_TOOLS = 96 + SEQ_GH - 154;   // v0.42.4: the strip of keys under the sequencer's grid
const W = COLS * C + 2 * M, H = ROWS * R + SEQ_TOOLS + 2 * M;
const KR = 19, DEPTH = 18, S2 = 2;                 // knob radius, slab thickness, print pixels per panel px
const MONO = '"Geist Mono", ui-monospace, Menlo, Consolas, monospace', DISPLAY = '"Archivo Black", "Arial Black", sans-serif';
const root = document.documentElement;

// ---------------------------------------------------------------- the look
// v0.44.0 (Johnny, 22 Nov 2026: "that's the look, no options"): the panel's one look, fixed. No look options, no
// saved looks, no stickers.
const LOOK0 = { colour: '#b9bbb8', light: 'studio', bright: 1, finish: 'matt', lens: 0.4, tilt: 2.1, ksize: 1.25, kstyle: 'yamaha', knobAll: '', knobCol: {},
  oddOn: true, oddK: 26, ocd: 0.05, room: 0.26, barCol: '',
  lights: [{ col: '#ffffff', int: 1.7, az: 129, el: 55 }, { col: '#e6ecff', int: 0.4, az: 160, el: 35 }, { col: '#fff0dc', int: 0.35, az: 20, el: 35 }] };
const look = LOOK0;
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
for (const b of BENDER) DEF[b.f] = b;
const K = (id, label) => ({ t: 'knob', id, label });
const S = (id, label, opts, w = 1) => ({ t: 'sw', id, label, opts, w });
// v0.39.0 (Johnny: "simplify shyoy, remove fx") took out the FX rows, v0.40.0 the sequencer page: three rows of sliders
const ROW_VCF = 1, ROW_BENDER = 2;
const BOXES = [
  { r: 0, c: 0, s: 2, n: 'LFO', it: [K('lfoRate', 'RATE'), S('lfoWave', 'WAVE', ['TRI', 'SQR', 'RND', 'NOISE'])] },
  { r: 0, c: 2, s: 6, n: 'VCO', it: [S('range', 'RANGE', ["16'", "8'", "4'", "2'"]), K('tune', 'TUNE'), K('vcoMod', 'MOD'), K('pw', 'PW'), S('pwmSrc', 'PWM', ['LFO', 'MAN', 'ENV']), K('drift', 'DRIFT')] },
  { r: 0, c: 8, s: 6, n: 'MIXER', it: [K('saw', 'SAW'), K('pulse', 'PULSE'), K('sub', 'SUB'), K('noise', 'NOISE'), S('subType', 'SUB', ['-1 SQ', '-2 SQ', '-2 25%'])] },
  { r: ROW_VCF, c: 0, s: 8, n: 'VCF', it: [K('cutoff', 'CUTOFF'), K('reso', 'RES'), K('vcfEnv', 'ENV'), K('vcfMod', 'MOD'), K('kybd', 'KYBD'), K('drive', 'DRIVE'), K('accVcf', 'ACC')] },
  { r: ROW_VCF, c: 8, s: 7, n: 'ENVELOPE', it: [K('attack', 'A'), K('decay', 'D'), K('sustain', 'S'), K('release', 'R'), S('trig', 'TRIG', ['G+T', 'GATE', 'LFO'])] },
  { r: ROW_VCF, c: 15, s: 3, n: 'VCA', it: [S('vcaMode', 'MODE', ['ENV', 'GATE']), K('level', 'LEVEL')] },
  { r: ROW_BENDER, c: 7, s: 4, n: 'PERFORM', it: [K('glide', 'PORTA'), S('glideMode', 'MODE', ['OFF', 'AUTO', 'ON']), K('accent', 'ACCENT')] },
  { r: ROW_BENDER, c: 0, s: 7, n: 'BENDER', it: [K('bendVco', 'VCO'), K('bendVcf', 'VCF'), K('lfoMod', 'LFO MOD'), { t: 'lever', w: 2 }, { t: 'key', k: 'mod', label: 'MOD' }, S('transpose', 'OCTAVE', ['LOW', 'MID', 'HIGH'])] },
  { r: ROW_BENDER, c: 11, s: 7, n: 'PRESET', it: [{ t: 'preset', w: 7 }] },
  // v0.42.0 (Johnny: "a simple octave sequencer, note ons and octave and slides"): see seq.js
  { r: 3, c: 0, s: 18, h: R + SEQ_TOOLS, n: 'SEQUENCER', it: [{ t: 'seqrun' }, { t: 'grid', w: 17 }] },
];
let seqGrid = null;
const SPOT = '#ff2a14';   // the spot colour (the LEDs, and the OPTIONS sheet's highlights)
// v0.43.14 (Johnny: "make the drag bars a bit lighter than the panel colour"): the panel colour, a third of the way to white
const dragAuto = () => '#' + [1, 3, 5].map((i) => { const v = parseInt(look.colour.slice(i, i + 2), 16); return Math.round(v + (255 - v) * 0.35).toString(16).padStart(2, '0'); }).join('');
const SEQ_LANE_ROWS = [['o', 0, 3], ['on', 3, 1], ['s', 4, 1], ['a', 5, 1]];   // lane, first row, rows
const SEQ_ROWS = [['o', 2, '2'], ['o', 1, '1'], ['o', 0, '0'], ['on', 0, 'GATE'], ['s', 0, 'SLIDE'], ['a', 0, 'ACC']];
const TITLE = { x: M + 14 * C, y: M, w: 4 * C, h: R };

// ---------------------------------------------------------------- the app's own setters
const regOf = (id) => (ctlRegs[id] || []).find((r) => r.el.isConnected && r.el !== cv) || null;
function setKnob(id, v) {
  const r = regOf(id); if (r) r.set(Math.max(0, Math.min(1, v)));
}
const knobVal = (id) => state.params[id];
const knobBase = knobVal;
const knobText = (id, v) => String(DEF[id] && DEF[id].fmt ? DEF[id].fmt(v) : Math.round(v * 100));
const swVal = (id) => state.params[id] | 0;
function setSw(id, i) {
  boot();
  { const b = document.getElementById(`s-${id}-${i}`); if (b) b.click(); }
}

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
let CUTOFF_KI = -1; const oddKi = () => look.oddK >= 0 ? look.oddK : CUTOFF_KI;
const KNOB_BUMP = 4.5, PANEL_BUMP = 1.4, EDGE_BUMP = 1.5;   // wear depths (bump maps, below)
const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, DEPTH), [edgeMat, edgeMat, edgeMat, edgeMat, panelMat, edgeMat]);
slab.position.z = -DEPTH / 2; slab.receiveShadow = true; scene.add(slab);
// the synth page (the sequencer page of v0.25.0-v0.39.0 is gone)
const pages = { synth: new THREE.Group() }; scene.add(pages.synth);
const page = 'synth';   // v0.40.0 (Johnny: "remove the sequencer"): the sequencer page is gone
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
const wearOf = () => panelWear;
const edgeWear = wearTex(1024, 128, 202, { scuff: 0.5, dent: 0.3, tile: 8, big: [10, 10, 0.5], knocks: [22, 16], scratches: [30, 50] });
// knobs: four worn sets; each knob takes one, turned and shifted its own way, and a wear depth from barely to well used
panelMat.bumpMap = wearOf(page); panelMat.bumpScale = PANEL_BUMP; edgeMat.bumpMap = edgeWear; edgeMat.bumpScale = EDGE_BUMP; edgeWear.repeat.set(8, 1);
window.shyoyWearMaps = () => ({ panel: panelWear.image, edges: edgeWear.image, knobs: knobWear.map((t) => t.image) });   // to look at the bump maps (console)
print.material = new THREE.MeshStandardMaterial({ map: printTex, transparent: true, depthWrite: false, roughness: 0.45, metalness: 0, envMapIntensity: 0.7, bumpMap: wearOf(page), bumpScale: PANEL_BUMP * 1.6 });   // v0.31.3: the print is lit and carries the dents
print.receiveShadow = true;
const knobWear = [1, 2, 3, 4].map((i) => wearTex(512, 512, 300 + i, { scuff: 0.12 + 0.06 * i, dent: 0.25 + 0.1 * i, tile: 1, big: [2 + 2 * i, 14, 0.3 + 0.08 * i], scratches: [6 + 5 * i, 70] }));

// sliders (v0.40.0, Johnny: "use sliders instead of knobs"): every continuous control is a fader, as on a real 101: a
// printed slot with a scale beside it and a black cap with a white line across it, riding TRAVEL above and below the
// control's centre. The caps keep what the knobs had: their wear, a colour per section, the size and the pink spare.
const PLASTIC_MAX = 0.5;   // real plastic never reflects all the light: a picked cap colour is capped at this (linear)
const TRAVEL = 38, CAP = { w: 24, h: 13, d: 11 };
mat.pink = new THREE.MeshStandardMaterial({ color: 0xc23a74, roughness: 0.5, metalness: 0, envMapIntensity: 0.5 });
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
  const mBody = mat.knob.clone(), mTop = mat.knobTop.clone(), mPtr = mat.white.clone();
  mBody.bumpMap = mTop.bumpMap = wear; mBody.bumpScale = mTop.bumpScale = KNOB_BUMP * depth;
  // the slot and its scale, printed: ticks every tenth, long at 0, 5 and 10
  prints.push((x, ink) => {
    x.fillStyle = ink; x.beginPath(); x.roundRect ? x.roundRect(cx - 2.5, cy - TRAVEL - 5, 5, 2 * TRAVEL + 10, 2.5) : x.rect(cx - 2.5, cy - TRAVEL - 5, 5, 2 * TRAVEL + 10); x.fill();
    for (let i = 0; i <= 10; i++) { const ty = cy + TRAVEL - i * 2 * TRAVEL / 10, l = i % 5 ? 5 : 9; x.fillRect(cx - 17 - l / 2 + 4.5, ty - 0.6, l, 1.2); x.fillRect(cx + 17 - 4.5 - l / 2, ty - 0.6, l, 1.2); }
  });
  const cap = new THREE.Group(), std = new THREE.Group();
  const body = new THREE.Mesh(keyGeo(CAP.w, CAP.h, CAP.d), [mTop, mBody]); body.castShadow = true; body.receiveShadow = true;
  const line = new THREE.Mesh(new THREE.BoxGeometry(CAP.w - 6, 1.8, 0.4), mPtr); line.position.z = CAP.d + 0.2;
  std.add(body, line); cap.add(std); g.add(cap); grp.add(g);
  // v0.35.4 (Johnny): any control can be the replaced part (OPTIONS > KNOBS > REPLACED POT, look.oddOn / look.oddK): a pink cap
  let oddG = null, mp = null; const ki = knobs.length; if (o.odd) CUTOFF_KI = ki;
  const oddMake = () => {
    if (oddG) return oddG;
    mp = mat.pink.clone(); mp.bumpMap = wear; mp.bumpScale = KNOB_BUMP * depth * 0.4;
    const pb = new THREE.Mesh(keyGeo(CAP.w, CAP.h, CAP.d), mp); pb.castShadow = true; pb.receiveShadow = true;
    const pl = new THREE.Mesh(line.geometry, mat.white); pl.position.z = CAP.d + 0.2; oddG = new THREE.Group(); oddG.add(pb, pl); cap.add(oddG); return oddG;
  };
  const k = { kind: 'knob', cx, cy, g, cap, shown: NaN, tilt: () => {}, style: () => {}, size: (u) => cap.scale.set(u, u, 1),
    colour: () => { const c = look.knobCol[secKey] || look.knobAll;   // v0.35.8: a section's colour, else the global one
      mBody.color.set(c || mat.knob.color); mTop.color.set(c || mat.knobTop.color);
      if (c) { for (const m of [mBody, mTop]) { const mx = Math.max(m.color.r, m.color.g, m.color.b); if (mx > PLASTIC_MAX) m.color.multiplyScalar(PLASTIC_MAX / mx); }
        mTop.color.multiplyScalar(1.05); mBody.roughness = 0.55; mTop.roughness = 0.38; } else { mBody.roughness = mat.knob.roughness; mTop.roughness = mat.knobTop.roughness; }
      mPtr.color.set(c && lum(c) > 0.35 ? 0x111111 : 0xffffff); },   // a pale cap gets a black line
    clean: (c) => {   // OCD: c 0 = as found .. 1 = spotless
      mBody.bumpScale = mTop.bumpScale = KNOB_BUMP * depth * (1 - c); if (mp) mp.bumpScale = KNOB_BUMP * depth * 0.4 * (1 - c);
      const odd = look.oddOn && ki === oddKi(); if (odd) oddMake(); if (oddG) oddG.visible = odd; std.visible = !odd;
    }, ...o, rect: [cx - C / 2 + 2, cy - TRAVEL - 14, C - 4, 2 * TRAVEL + 28] };
  k.sync = () => {
    const id = k.cur(); g.visible = !!id; if (!id) return false;
    const v = knobVal(id); if (v === k.shown) return false;
    k.shown = v; cap.position.y = -TRAVEL + 2 * TRAVEL * v; shadowDirty = true; return true;
  };
  k.colour(); k.size(look.ksize); k.clean(look.ocd); addCtl(k); knobs.push(k); return k;
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
const printsBy = { synth: [], all: [] };   // functions (ctx, ink, paper) drawing one part, per page
let prints = printsBy.synth;
const addCtl = (c) => { c.page = c.page || buildPage; ctls.push(c); return c; };
const text = (x, s, tx, ty, size = 11, align = 'center', font = MONO, wgt = 600) => { x.font = `${wgt} ${size}px ${font}`; x.textAlign = align; x.textBaseline = 'middle'; if ('letterSpacing' in x) x.letterSpacing = '.6px'; x.fillText(s, tx, ty); };

const colX = (b, col, w = 1) => M + (b.c + col) * C + (w * C) / 2;
const rowY = (b) => M + b.r * R;
const KY = 72, LY = 134, KEYY = 98;   // control centre, label line, and the key line under a display, from the top of the row
const labelAt = (getText, cx, ly, opts = {}) => prints.push((x, ink) => {
  const t = getText(); if (!t) return;
  x.globalAlpha = opts.dim && opts.dim() ? 0.35 : 1;
  if (opts.slab && opts.slab()) {   // a label white on a black slab
    x.font = `600 11px ${MONO}`; const w = x.measureText(t).width + 10; x.fillStyle = ink; x.fillRect(cx - w / 2, ly - 8, w, 16); x.fillStyle = inkOf(ink); text(x, t, cx, ly + 0.5);
  } else { x.fillStyle = ink; text(x, t, cx, ly + 0.5); }
  x.globalAlpha = 1;
});
const inkOf = (ink) => ink === '#000000' ? '#ffffff' : '#000000';

for (const b of BOXES) {
  const y0 = rowY(b), bx = M + b.c * C + 6, by = y0 + 12, bw = b.s * C - 12, bh = (b.h || R) - 12;
  px.font = `400 13px ${DISPLAY}`; if ('letterSpacing' in px) px.letterSpacing = '.6px';
  const tagW = px.measureText(b.n).width + 16;
  BOXR.push({ page: 'synth', n: b.n, bx, by, bw, bh });
  prints.push((x, ink, paper) => {
    x.strokeStyle = ink; x.lineWidth = 1.6; x.strokeRect(bx, by, bw, bh);
    x.font = `400 13px ${DISPLAY}`; if ('letterSpacing' in x) x.letterSpacing = '.6px';
    x.fillStyle = ink; x.fillRect(bx + 10, by - 9, tagW, 18);
    x.fillStyle = paper; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(b.n, bx + 18, by + 0.5);
  });
  let col = 0; const spread = b.s / b.it.reduce((a, i) => a + (i.w || 1), 0);   // v0.41.1: a box wider than its controls spreads them evenly (no gaps)
  for (const it of b.it) {
    const w = it.w || 1, cx = M + b.c * C + (col + w / 2) * spread * C, cy = y0 + KY, ly = y0 + LY;
    if (it.t === 'knob') {
      makeKnob(cx, cy, { cur: () => it.id, base: () => knobBase(it.id), odd: it.id === 'cutoff' });   // the filter knob is a mismatched spare (Johnny)
      labelAt(() => it.label, cx, ly);
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
        on: it.k === 'mod' ? () => modHeld : () => false,
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
    } else if (it.t === 'seqrun') {
      makeKey(cx, y0 + KY, 24, 14, { on: () => seqOn, press: () => seqRun(), pad: 12, tag: 'play' });
      labelAt(() => 'PLAY', cx, y0 + 28 + SEQ_GH + 9);
    } else if (it.t === 'grid') {
      // v0.42.1 (Johnny: "use the note grid like the one we just got rid of"): a printed grid, rows top to bottom octave
      // 2, 1, 0, note on, slide, accent; one column per step. Press a cell to set it; drag to paint the same along a row
      const gx = M + b.c * C + col * spread * C + 40, gw = w * spread * C - 52 - 84 - 8, gy = y0 + 28, gh = SEQ_GH;
      // v0.43.6 (Johnny: "separate the lanes a bit"): a gap between lanes, with a strip of the spot colour along each lane's top
      const LGAP = 22, TOP = 13, rowH0 = (gh - TOP - 4 - LGAP * (SEQ_LANE_ROWS.length - 1)) / SEQ_ROWS.length;   // v0.43.8: more space
      const laneOf = (ri) => SEQ_LANE_ROWS.findIndex(([, r0, n]) => ri >= r0 && ri < r0 + n);
      seqGrid = { x: gx, y: gy, w: gw, h: gh, colW: gw / SEQ_N, rowH: rowH0, gap: LGAP, laneOf,
        rowY: (ri) => TOP + ri * rowH0 + laneOf(ri) * LGAP,   // a row's top, from the grid's top
        rowAt: (dy) => { for (let ri = 0; ri < SEQ_ROWS.length; ri++) { const t = TOP + ri * rowH0 + laneOf(ri) * LGAP; if (dy >= t - LGAP / 2 && dy < t + rowH0) return ri; } return -1; } };
      SEQ_ROWS.forEach((r, ri) => { const yy = gy + seqGrid.rowY(ri) + 0.5 * seqGrid.rowH;
        prints.push((x, ink) => { x.fillStyle = ink; text(x, r[2], gx - 14, yy + 0.5, 9.5, "right"); }); });
      for (let i = 0; i < SEQ_N; i++) labelAt(() => String(i + 1), gx + (i + 0.5) * seqGrid.colW, gy + gh + 9);
      makeSeqGrid();
      // v0.43.0 (Johnny: "a step length on the RHS for each lane - try a number box"): drag up or down, or press the
      // top half for one more and the bottom half for one fewer. The octave lane's box sits across its three rows
      const rh = seqGrid.rowH, nx = gx + gw + 18;   // v0.43.18: room for the wider draggers
      prints.push((x, ink) => { x.fillStyle = ink; text(x, 'LEN', nx + 15, gy - 6, 9, 'center'); text(x, 'RETRIG', nx + 54, gy - 6, 9, 'center'); });
      SEQ_LANE_ROWS.forEach(([k, r0, n]) => {
        const ly0 = gy + seqGrid.rowY(r0), by = ly0 + (n * rh - (rh - 3)) / 2, bh = rh - 3;
        if (n > 1) prints.push((x, ink) => { x.fillStyle = ink; x.fillRect(nx - 5, ly0 + 4, 1.2, n * rh - 8); });
        const d = makeDisplay(nx, by, 30, bh, () => String(state.seq.len[k]), { tag: 'len:' + k });
        let g0 = null; d.kind = 'roll';
        d.down = (p) => { g0 = { y: p ? p[1] : 0, v: state.seq.len[k], moved: false, top: p && p[1] < by + bh / 2 }; };
        d.move = (p) => { if (!g0 || !p) return; const dv = Math.round((g0.y - p[1]) / 8); if (dv) g0.moved = true; seqLen(k, g0.v + dv); };
        d.up = () => { if (g0 && !g0.moved) seqLen(k, state.seq.len[k] + (g0.top ? 1 : -1)); g0 = null; };
        // v0.43.1 (Johnny): its RETRIG tick, to the right
        makeKey(nx + 54, by + bh / 2, 15, 10, { on: () => !!state.seq.rt[k], press: () => { state.seq.rt[k] = !state.seq.rt[k]; seqSend(); }, pad: 3, tag: 'rt:' + k });
      });
      // v0.42.4 (Johnny): under the grid, nudge the pattern a step left or right, and randomise its gates, accents,
      // slides and octaves
      // v0.43.3: RANDOM printed once before its keys: ALL, GATES, ACC, SLIDES, OCTAVES, LENGTH, RETRIG
      const ty = y0 + 28 + SEQ_GH + 34, TK = [['◀', 'nudgeL', () => seqNudge(-1)], ['▶', 'nudgeR', () => seqNudge(1)], ['ALL', 'rndAll', () => seqRandom('all')],
        ['GATES', 'rndOn', () => seqRandom('on')], ['ACC', 'rndA', () => seqRandom('a')], ['SLIDES', 'rndS', () => seqRandom('s')],
        ['OCTAVES', 'rndO', () => seqRandom('o')], ['LENGTH', 'rndLen', () => seqRandom('len')], ['RETRIG', 'rndRt', () => seqRandom('rt')], ['RESET LOOPS', 'loopsReset', () => seqResetLoops()]];   // v0.43.16 (Johnny): every lane back to steps 1-16
      { const rx = gx + 12 + 2 * 62 + 4; prints.push((x, ink) => { x.fillStyle = ink; x.fillRect(rx, ty - 9, 64, 18); x.fillStyle = inkOf(ink); text(x, 'RANDOM', rx + 32, ty + 0.5, 10.5); }); }
      let tx = gx + 12, first = true;
      TK.forEach(([label, tag, press], k) => {
        makeKey(tx, ty, 24, 14, { on: () => false, press: () => { boot(); press(); }, pad: 6, tag });
        const tri = label === '◀' || label === '▶', lx = tx + 20;
        prints.push((x, ink) => { x.fillStyle = ink;
          if (tri) { const d = label === '◀' ? -1 : 1; x.beginPath(); x.moveTo(lx + 4 + d * 5, ty); x.lineTo(lx + 4 - d * 5, ty - 6); x.lineTo(lx + 4 - d * 5, ty + 6); x.closePath(); x.fill(); }
          else text(x, label, lx, ty + 0.5, 10.5, 'left'); });
        tx += tri ? 62 : (gw + 92 - 2 * 62 - 24 - 96 - 110) / 7; if (label === 'RETRIG') tx = gx + gw + 92 - 104; if (tri && label === '▶') tx += 96;
      });
    } else if (it.t === 'preset') {
      // v0.41.0 (Johnny: "tidy up - no blank spaces"): the name across the box, five keys spread under it: the preset
      // steps and browser, and the randomiser (rand.js) and its undo
      const dw = w * C - 40, dx = cx - dw / 2;
      makeDisplay(dx, y0 + 36, dw, 28, () => shyoyRand.reel || (document.querySelector('#prj-bar .pm-btn .cur') || {}).textContent || '', { press: () => openBrowser() });
      const PK = [['PREV', 'pre-', () => document.querySelector('#prj-bar .pm-step[data-d="-1"]').click()], ['NEXT', 'pre+', () => document.querySelector('#prj-bar .pm-step[data-d="1"]').click()],
        ['BROWSE', 'browse', () => openBrowser()], ['RANDOM', 'rand', () => shyoyRand.roll()], ['UNDO', 'undo', () => shyoyRand.back()]];
      PK.forEach(([label, tag, press], k) => { const kx = dx + dw * (k + 0.5) / PK.length;
        makeKey(kx, y0 + KEYY, 24, 14, { on: () => false, press, pad: 8, tag }); labelAt(() => label, kx, ly); });
    }
    col += w;
  }
}
let modHeld = false;
// ---- the sequencer's note grid (v0.42.1), drawn on its own layer over the print
function makeSeqGrid() {
  const G = seqGrid, PAD = 12, c = document.createElement('canvas'); c.width = Math.ceil((G.w + 2 * PAD) * 3); c.height = Math.ceil(G.h * 3); const x = c.getContext("2d");   // v0.43.18: PAD each side for the draggers
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(G.w + 2 * PAD, G.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.position.copy(P(G.x + G.w / 2, G.y + G.h / 2, 0.08)); m.renderOrder = 1; grp.add(m);
  let sig = '';
  const draw = () => {
    const ink = curInk, light = ink === '#000000', s2 = JSON.stringify(state.seq) + ink + look.barCol + look.colour + seqPos + JSON.stringify(seqLanePos); if (s2 === sig) return false; sig = s2;
    const tone = (a) => light ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`, cw = G.colW, rh = G.rowH;
    x.setTransform(3, 0, 0, 3, 3 * PAD, 0); x.clearRect(-PAD, 0, G.w + 2 * PAD, G.h);
    for (let i = 0; i < SEQ_N; i++) {
      const st = state.seq.steps[i], cx = i * cw;
      SEQ_ROWS.forEach(([t, v], ri) => {
        // v0.43.0: each lane has its own length (steps past it are faint) and its own playhead
        const y = G.rowY(ri), n = state.seq.len[t], a = state.seq.st[t]; x.globalAlpha = i >= a && i < a + n ? 1 : 0.1;   // v0.43.14 (Johnny): steps outside the loop fade nearly into the panel
        if (seqPos >= 0 && (seqLanePos ? seqLanePos[t] : a + seqPos % n) === i) { x.fillStyle = tone(0.16); x.fillRect(cx, y, cw, rh); }
        x.strokeStyle = tone(0.28); x.lineWidth = 1; x.strokeRect(cx + 1.5, y + 1.5, cw - 3, rh - 3);
        if (t === 'o' ? (st.o | 0) === v : !!st[t]) { x.fillStyle = ink; x.fillRect(cx + 3, y + 3, cw - 6, rh - 6); }
        x.globalAlpha = 1;
      });
      // v0.43.16: the bar-of-four dividers run only beside each lane, not through the gaps
      if (i % 4 === 3 && i < SEQ_N - 1) { x.fillStyle = tone(0.55); for (const [, r0, n] of SEQ_LANE_ROWS) x.fillRect(cx + cw - 0.75, G.rowY(r0), 1.5, n * rh); }
    }
    const DC = look.barCol || dragAuto(), grip = lum(DC) > 0.4 ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)';
    // v0.43.5 (Johnny): each lane's grab bar, at the end of its last step; drag it to set the lane's length
    for (const [k, r0, n] of SEQ_LANE_ROWS) {
      // v0.43.16 (Johnny: "tidy this up"): one solid frame, drawn as filled strips so the corners join: the thick top bar, a side bar at each end
      // centred on the cell boundary, a thin bottom edge; each side bar carries a grip handle centred on it
      const ly = G.rowY(r0), a = state.seq.st[k] * cw, b = (state.seq.st[k] + state.seq.len[k]) * cw;
      // v0.43.18 (Johnny: "make the draggers themselves wider"): each side is a 10 px dragger, 1.5 px inside the loop and the rest outside it
      const DW = 10, L = a + 1.5 - DW, R = b - 1.5 + DW, top = ly - 11, bot = ly + n * rh + 3, mid = ly + n * rh / 2;
      x.fillStyle = DC; x.fillRect(L, top, R - L, 8); x.fillRect(L, top, DW, bot - top); x.fillRect(R - DW, top, DW, bot - top); x.fillRect(L, bot - 2, R - L, 2);
      x.fillStyle = grip; for (let d = -6; d <= 6; d += 3) x.fillRect((L + R) / 2 + d - 0.5, top + 2, 1, 4);
      for (const hx of [L + DW / 2, R - DW / 2]) for (const d of [-4, 0, 4]) x.fillRect(hx - 2.5, mid + d - 0.5, 5, 1);
    }
    tex.needsUpdate = true; return true;
  };
  const at = (p) => { if (!p || p[0] < G.x || p[0] >= G.x + G.w || p[1] < G.y || p[1] >= G.y + G.h) return null;
    return { i: Math.min(SEQ_N - 1, Math.floor((p[0] - G.x) / G.colW)), r: SEQ_ROWS[Math.max(0, G.rowAt(p[1] - G.y))] }; };
  // what a press does: an octave cell picks that octave; the others toggle. A drag paints the same
  const apply = (h, paint) => {
    const st = state.seq.steps[h.i], [t, v] = h.r;
    if (t === 'o') { if (paint && paint.t !== 'o') return; if ((st.o | 0) === v) return; st.o = v; }
    else { const want = paint ? paint.v : !st[t]; if (paint && paint.t !== t) return; if (!!st[t] === want) return; st[t] = want; }
    seqSend();
  };
  let paint = null, lenDrag = null;
  // a press near a lane's grab bar takes the bar, not the cell under it
  const topAt = (p) => { if (!p) return null; const dy = p[1] - G.y, dx = p[0] - G.x;
    for (const [k, r0] of SEQ_LANE_ROWS) { const ly = G.rowY(r0), a = state.seq.st[k] * G.colW, b = a + state.seq.len[k] * G.colW;
      if (dy >= ly - 13 && dy < ly - 2 && dx >= a - 2 && dx <= b + 2) return k; } return null; };
  const barAt = (p) => { if (!p) return null; const ri = G.rowAt(p[1] - G.y);
    const ln = SEQ_LANE_ROWS.find(([, r0, n]) => ri >= r0 && ri < r0 + n); if (!ln) return null;
    const k = ln[0], ax = G.x + state.seq.st[k] * G.colW, bx = ax + state.seq.len[k] * G.colW;
    // v0.43.17 (Johnny: "make the left and right grab area bigger, mainly outside of the loop"): 4 px inside, about half a step outside
    const out = Math.max(14, G.colW * 0.5);
    if (p[0] >= bx - 4 && p[0] <= bx + out) return { k, end: true };
    if (p[0] >= ax - out && p[0] <= ax + 4) return { k, end: false }; return null; };
  addCtl({ kind: 'roll', rect: [G.x - 30, G.y, G.w + 46, G.h], sync: draw,
    down(p) { const tk = topAt(p); if (tk) { lenDrag = { k: tk, move: true, c0: (p[0] - G.x) / G.colW, a0: state.seq.st[tk] }; return; }
      const b = barAt(p); if (b) { lenDrag = b; return; }
      const h = at(p); if (!h) return; const [t] = h.r; apply(h); paint = { t, v: t === 'o' ? true : !!state.seq.steps[h.i][t] }; },
    move(p) { if (lenDrag) { if (p) { const c = Math.round((p[0] - G.x) / G.colW), k = lenDrag.k; if (lenDrag.move) seqShift(k, lenDrag.a0 + Math.round((p[0] - G.x) / G.colW - lenDrag.c0)); else if (lenDrag.end) seqLen(k, c - state.seq.st[k]); else seqStart(k, c); } return; }
      const h = at(p); if (h && paint) apply(h, paint); },
    up() { paint = null; lenDrag = null; } });
}
// the title: Johnny's logo, printed; tapping it opens OPTIONS. Under it, the page keys (on both pages)
buildPage = 'all'; grp = scene; prints = printsBy.all;
// v0.31.1: the logo is printed on its own lit layer over the title, carrying the panel's wear (the same bump map,
// cut to the title's patch of it), so the scuffs and dents run through it (Johnny). The rest of the print stays flat.
const LOGO_WEAR = [78, 26];   // wear-map level where the ink is gone, and the span over which it fades back to full
const logoCv = document.createElement('canvas'); logoCv.width = TITLE.w * S2; logoCv.height = TITLE.h * S2;
const logoTex = new THREE.CanvasTexture(logoCv); logoTex.colorSpace = THREE.SRGBColorSpace; logoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const logoWears = Object.fromEntries(['synth'].map((p) => { const t = wearOf(p).clone(); t.repeat.set(TITLE.w / W, TITLE.h / H); t.offset.set(TITLE.x / W, 1 - (TITLE.y + TITLE.h) / H); return [p, t]; }));
const logoWear = logoWears[page];
const logoMat = new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, depthWrite: false, roughness: 0.35, metalness: 0, envMapIntensity: 0.9, bumpMap: logoWear, bumpScale: PANEL_BUMP * 1.6 });
const logoLayer = new THREE.Mesh(new THREE.PlaneGeometry(TITLE.w, TITLE.h), logoMat);
// v0.44.2 (Johnny: "shyoy needs to float a bit higher off the grey plane"): 10 units up, casting a shadow of the letters
// (not of its square: the shadow pass cuts by the logo's alpha)
logoLayer.position.copy(P(TITLE.x + TITLE.w / 2, TITLE.y + TITLE.h / 2, 10)); logoLayer.renderOrder = 2; logoLayer.receiveShadow = true; logoLayer.castShadow = true;
logoMat.shadowSide = THREE.DoubleSide; logoMat.alphaTest = 0.04; scene.add(logoLayer);   // the shadow pass copies map + alphaTest, so it casts the letters
prints.push((x, ink) => {
  if (logo.naturalWidth) {
    const lw = 262, lh = lw * logo.naturalHeight / logo.naturalWidth, lx = (TITLE.w - lw) / 2, ly = 10;   // v0.44.0 (Johnny: "make the word shyoy bigger"): 196 -> 262
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
    logoTex.needsUpdate = true; shadowDirty = true;   // v0.44.2: the logo casts a shadow
  } else { x.fillStyle = ink; text(x, 'shyoy', TITLE.x + TITLE.w / 2, TITLE.y + 50, 64, 'center', DISPLAY, 400); }
  x.fillStyle = ink; text(x, 'v' + VER3D, TITLE.x + TITLE.w - 14, TITLE.y + 122, 10, 'right');
});
const VER3D = ((document.getElementById('ver') || {}).textContent || '').replace(/^v/, '');
// v0.44.0 (Johnny: "clicking shyoy randomizes the sound, the word wobbles in 3 dimensions"; "command click opens options"):
// a click on the word is a new random sound (rand.js) and the word wobbles; right-click or Shift-click steps back; Cmd/Ctrl-click opens OPTIONS
const LOGO_Z = logoLayer.position.z, logoWob = { t0: -1 };
// v0.44.1 (Johnny: "it does the same animation each time - randomise it"): each click draws its own wobble: how far it tips
// on each axis, how fast each axis swings and from where, how quickly it settles and how far it lifts
const wobbleLogo = () => { const U = (a, b) => a + Math.random() * (b - a), sg = () => (Math.random() < 0.5 ? -1 : 1);
  Object.assign(logoWob, { t0: performance.now(), ax: sg() * U(0.12, 0.5), ay: sg() * U(0.1, 0.45), az: sg() * U(0.02, 0.14),
    fx: U(10, 24), fy: U(8, 20), fz: U(12, 28), px: U(0, 6.3), py: U(0, 6.3), pz: U(0, 6.3), k: U(1.8, 3.6), lift: U(25, 70) }); dirty = true; };
function logoWobbleStep(now) {
  const w = logoWob, t = (now - w.t0) / 1000, e = Math.exp(-t * w.k) * (1 - Math.exp(-t * 25));   // eases in over ~0.1 s, then dies away
  if (t > 0.3 && e < 0.01 && !shyoyRand.spinning) { logoLayer.rotation.set(0, 0, 0); logoLayer.position.z = LOGO_Z; w.t0 = -1; shadowDirty = dirty = true; return; }
  logoLayer.rotation.set(Math.sin(t * w.fx + w.px) * w.ax * e, Math.sin(t * w.fy + w.py) * w.ay * e, Math.sin(t * w.fz + w.pz) * w.az * e);
  logoLayer.position.z = LOGO_Z + w.lift * e; shadowDirty = dirty = true;
}
const logoClick = (ev) => {
  if (ev && (ev.metaKey || ev.ctrlKey)) return openOptions3d();
  if (ev && ev.shiftKey) { if (shyoyRand.back()) wobbleLogo(); return; }
  shyoyRand.roll(); wobbleLogo();
};
addCtl({ kind: 'title', rect: [TITLE.x + 10, TITLE.y + 4, TITLE.w - 20, 104], press: logoClick, sync: () => false });

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
  // OCD (v0.32.6): 0 keeps every defect, 1 is spotless: wear depths, worn ink, tilt and the odd knob
  const cl = look.ocd, w = 1 - cl;
  panelMat.bumpScale = PANEL_BUMP * w; edgeMat.bumpScale = EDGE_BUMP * w; print.material.bumpScale = logoMat.bumpScale = PANEL_BUMP * 1.6 * w;
  for (const k of knobs) { k.colour(); k.tilt(look.tilt * w); k.size(look.ksize); k.clean(cl); }
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
// the print changes with the ink
const printSigNow = () => curInk;

// ---------------------------------------------------------------- camera: face on, fixed
function fit() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const small = Math.min(w, h) < 600, padX = small ? 4 : 10, padY = small ? 4 : 10;   // v0.43.13 (Johnny: "why do we have space above and below"): was 48 px each side
  const fx = (w - 2 * padX) / w, fy = (h - 2 * padY) / h, t = Math.tan(camera.fov * Math.PI / 360);
  const d = Math.max((H / 2) / (t * fy), (W / 2) / (t * camera.aspect * fx));
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
// a slider's full travel in screen pixels
const slotPx = (c) => { const a = P(c.cx, c.cy - TRAVEL, CAP.d).project(camera), b = P(c.cx, c.cy + TRAVEL, CAP.d).project(camera), r = cv.getBoundingClientRect();
  return Math.max(40, Math.hypot((a.x - b.x) / 2 * r.width, (a.y - b.y) / 2 * r.height)); };
cv.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  const c = pick(e); if (!c) return;
  e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  boot();
  const g = { c, x: e.clientX, y: e.clientY, moved: false };
  if (c.kind === 'knob') { g.id = c.cur(); g.v0 = knobBase(g.id); ro.show(c, knobText(g.id, g.v0)); }
  else if (c.kind === 'key') { c.down = true; if (c.hold) c.hold(true); else if (c.press) c.press(); }
  else if (c.kind === 'lever') { c.held = true; g.v0 = c.v; }
  else if (c.kind === 'roll') c.down(toPanel(e));
  grabs.set(e.pointerId, g); dirty = true;
});
cv.addEventListener('pointermove', (e) => {
  const g = grabs.get(e.pointerId); if (!g) return;
  if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 6) g.moved = true;
  const c = g.c;
  if (c.kind === 'knob') {   // the cap follows the finger along its slot (Shift: finer)
    const v = Math.max(0, Math.min(1, g.v0 + (g.y - e.clientY) / slotPx(c) * (e.shiftKey ? 0.2 : 1)));
    setKnob(g.id, v); ro.show(c, knobText(g.id, knobBase(g.id)));
  } else if (c.kind === 'lever') {
    const r = cv.getBoundingClientRect(), pxPerUnit = r.width / W * (camera.position.z > 0 ? 1 : 1);
    const v = Math.max(-1, Math.min(1, g.v0 + (e.clientX - g.x) / (c.half * pxPerUnit))); c.v = v; setLever(v);
  } else if (c.kind === 'roll') c.move(toPanel(e));
  dirty = true;
});
function release(e) {
  const g = grabs.get(e.pointerId); if (!g) return; grabs.delete(e.pointerId); clearTimeout(g.hold);
  const c = g.c;
  if (c.kind === 'knob') ro.hide();
  else if (c.kind === 'key') { c.down = false; if (c.hold) c.hold(false); }
  else if (c.kind === 'lever') { c.held = false; setLever(0); }
  else if (c.kind === 'roll') c.up();
  else if ((c.kind === 'display' || c.kind === 'title') && !g.moved && e.type === 'pointerup') c.press(e);
  dirty = true;
}
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); if (e.ctrlKey) return; const c = pick(e); if (c && c.kind === 'title' && shyoyRand.back()) wobbleLogo(); });
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
.v3d-sheet [hidden] { display: none !important; }
.v3d-sheet .f { margin: 0 0 14px; } .v3d-sheet .hint { margin: 6px 0 0; font-size: 9px; letter-spacing: .06em; opacity: .6; } .v3d-sheet .f > span { display: block; font-size: 11px; font-weight: 600; letter-spacing: .08em; margin-bottom: 6px; }
.v3d-sheet .row { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
.v3d-sheet button { font: 600 11px ${MONO}; letter-spacing: .06em; color: #fff; background: #0c0c0c; border: 0; border-radius: 3px; padding: 7px 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.v3d-sheet button i { width: 6px; height: 6px; border-radius: 50%; background: #3a0906; display: inline-block; }
.v3d-sheet button.lit i { background: #ff2a14; box-shadow: 0 0 6px #ff2a14; }
.v3d-sheet input[type=range] { flex: 1; min-width: 120px; accent-color: var(--v3d-ink); }
.v3d-sheet input[type=color] { width: 40px; height: 28px; border: 0; padding: 0; background: none; }
.v3d-sheet b.val { font-size: 11px; min-width: 42px; text-align: right; }
.v3d-sheet .list { max-height: 52dvh; overflow: auto; border-top: 1.5px solid var(--v3d-ink); }
.v3d-sheet .list h3 { margin: 10px 0 4px; font-size: 10px; letter-spacing: .1em; font-weight: 600; opacity: .7; }
.v3d-sheet .list button { width: 100%; justify-content: flex-start; margin: 0 0 4px; }
.v3d-sheet .list button.lit { box-shadow: inset 3px 0 0 #ff2a14; }
.v3d-sheet input[type=text] { flex: 1; font: 600 12px ${MONO}; padding: 6px 8px; border: 1.5px solid var(--v3d-ink); background: transparent; color: inherit; border-radius: 3px; min-width: 0; }
/* v0.25.0: the 2D app's Options (MIDI, about), drawn as a card of the panel */
html[data-view="3d"] dialog#options {
  --glass-rgb: var(--v3d-panel-rgb); --ink-rgb: var(--v3d-ink-rgb); --dirt: 0; --grain: 0; --glow: 0;
  --glass: rgb(var(--glass-rgb)); --ink: rgb(var(--ink-rgb)); --muted: rgb(var(--ink-rgb) / .62); --ghost: rgb(var(--ink-rgb) / .13);
  --tint: rgb(var(--ink-rgb) / .07); --lit: rgb(var(--glass-rgb) / .8); --line: rgb(var(--ink-rgb) / .42); --rule: 1px solid var(--line);
  --shadow: none; --acc: #ff2a14; --f-lcd: ${MONO}; --fs-xs: 12px; --fs-s: 13px; --fs: 14px; --fs-l: 16px; --fs-xl: 26px; --bezel: rgb(var(--ink-rgb));
  font-family: ${MONO}; letter-spacing: .03em; background-image: none; border: 0; border-radius: 0;
  box-shadow: inset 0 0 0 2px var(--ink), 0 20px 60px rgba(0,0,0,.55); }
html[data-view="3d"] dialog#options { width: min(860px, calc(100vw - 24px)); height: auto; max-height: min(600px, calc(100dvh - 24px)); inset: auto; left: 50%; top: 50%; margin: 0; transform: translate(-50%, -50%); }
html[data-view="3d"] dialog#options::backdrop { background: rgb(0 0 0 / .55); }
html[data-view="3d"] #otabs [data-sec=colours] { display: none; }
html[data-view="3d"] dialog#options :is(h2, h3, .otabs button) { text-transform: uppercase; }
html[data-view="3d"] dialog#options .btn { font-family: ${MONO}; text-transform: uppercase; }
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
// v0.44.0: no look options; OPTIONS keeps MIDI and ABOUT
opt.body.innerHTML = `<div class="f"><div class="row"><button id="o3-midi">MIDI</button><button id="o3-about">ABOUT</button></div></div>`;
const $o = (s) => opt.body.querySelector(s);
for (const [id, k] of [['#o3-midi', 'midi'], ['#o3-about', 'about']]) $o(id).onclick = () => { opt.close(); sheetVars(); showOptTab(k); openOptions(); };
function openOptions3d() { opt.open(); }

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
  if (logoWob.t0 >= 0) logoWobbleStep(performance.now());
  const sig = printSigNow(); if (sig !== printSig) { printSig = sig; printDirty = true; }
  if (printDirty) { printDirty = false; repaintPrint(); dirty = true; }
  if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; dirty = true; }
  if (drawn < WARM) renderer.shadowMap.needsUpdate = true;
  if (dirty || drawn < WARM) { renderer.render(scene, camera); dirty = false; if (drawn < WARM) drawn++; }
  if (drawn === WARM) { drawn = WARM + 1; window.shyoySplash && window.shyoySplash.done(); }
  requestAnimationFrame(frame);
}
applyLook(); printDirty = shadowDirty = dirty = true;
// v0.42.3 (Johnny: "some models come in without top parts while materializing"): every shader is built (in parallel
// where the browser can) and every texture sent to the GPU before the first frame, and the splash stays up for a few
// more frames, so the panel is whole when it shows rather than filling in as the GPU catches up
const WARM = 8;
try {
  repaintPrint();
  scene.traverse((o) => { for (const m of [].concat(o.material || [])) for (const k of ['map', 'bumpMap', 'roughnessMap', 'alphaMap']) if (m[k]) renderer.initTexture(m[k]); });
  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 4000))]);
} catch (e) { console.warn('3D warm-up', e); }
requestAnimationFrame(frame);

window.shyoy3d = {
  ready: true,
  show() { if (!live) { live = true; fit(); dirty = printDirty = shadowDirty = true; requestAnimationFrame(frame); } },
  hide() { live = false; opt.close(); pb.close(); },
  // for headless checks: where a control is on screen
  where(id) { const k = knobs.find((k) => k.cur() === id); if (!k) return null; const v = P(k.cx, k.cy - TRAVEL + 2 * TRAVEL * knobVal(id), CAP.d).project(camera); const r = cv.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
  tap(tag) { const c = ctls.find((c) => c.tag === tag); if (!c) return null; const [x, y, w, h] = c.rect; return this.at(x + w / 2, y + h / 2); },
  grid() { return seqGrid; },
  cell(i, ri) { const G = seqGrid; return this.at(G.x + (i + 0.5) * G.colW, G.y + G.rowY(ri) + 0.5 * G.rowH); },
  title() { return this.at(TITLE.x + TITLE.w / 2, TITLE.y + 50); },
  at(pxX, pxY) { const v = P(pxX, pxY, 8).project(camera); const r = cv.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
  ctls, W, H, look,
};
