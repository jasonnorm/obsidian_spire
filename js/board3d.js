// The table, the painted board of the Gloaming Reach, the plastic pieces
// and the Spire, rendered with three.js.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NODES, NODE_BY_ID, EDGES, PROVINCES, SHARDS, PLAYER_COLORS } from './data.js';
import * as M from './models3d.js';
import { mulberry32 } from './engine.js';

const TOP_R = 10.6; // painted top face radius
const TEX = 2048;
const SHARD_COLOR = Object.fromEntries(SHARDS.map((s) => [s.id, s.color]));
const TYPE_RING = { keep: null, market: '#d9a521', shrine: '#efe3c4', barrow: '#7d8a74', wilds: null };

function w2c(x, z) {
  return [((x / TOP_R + 1) / 2) * TEX, ((z / TOP_R + 1) / 2) * TEX];
}
const K = TEX / (2 * TOP_R); // pixels per world unit

// ---------------------------------------------------------------------------
// Board painting
// ---------------------------------------------------------------------------
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

function paintBoard(rng) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = TEX;
  const g = cv.getContext('2d');
  const C = TEX / 2;
  const R = (r) => r * K;
  const theta = (phiDeg) => Math.PI / 2 - (phiDeg * Math.PI) / 180;

  // Base.
  g.fillStyle = '#1b1410';
  g.fillRect(0, 0, TEX, TEX);

  // Province wedges.
  for (const pv of PROVINCES) {
    const a0 = pv.id * 60 - 30;
    const a1 = pv.id * 60 + 30;
    g.save();
    g.beginPath();
    g.moveTo(C, C);
    g.arc(C, C, R(10.02), theta(a1), theta(a0));
    g.closePath();
    g.clip();
    g.fillStyle = pv.color;
    g.fillRect(0, 0, TEX, TEX);
    // Mottling.
    for (let i = 0; i < 900; i++) {
      const phi = a0 + rng() * 60;
      const r = 4 + rng() * 6.2;
      const [x, y] = w2c(r * Math.sin((phi * Math.PI) / 180), r * Math.cos((phi * Math.PI) / 180));
      g.fillStyle = shade(pv.color, (rng() - 0.5) * 0.12);
      g.globalAlpha = 0.25 + rng() * 0.3;
      g.beginPath();
      g.ellipse(x, y, 8 + rng() * 40, 6 + rng() * 26, rng() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    paintTerrain(g, pv, a0, rng);
    g.restore();
  }

  // Province borders.
  g.strokeStyle = 'rgba(20,12,8,0.55)';
  g.lineWidth = 5;
  g.setLineDash([18, 12]);
  for (let i = 0; i < 6; i++) {
    const phi = ((i * 60 + 30) * Math.PI) / 180;
    const [x0, y0] = w2c(4.7 * Math.sin(phi), 4.7 * Math.cos(phi));
    const [x1, y1] = w2c(10 * Math.sin(phi), 10 * Math.cos(phi));
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  g.setLineDash([]);

  // The Ashlands around the Spire.
  const ash = g.createRadialGradient(C, C, R(1.5), C, C, R(4.9));
  ash.addColorStop(0, '#08060a');
  ash.addColorStop(0.45, '#1f1820');
  ash.addColorStop(0.85, '#3a3034');
  ash.addColorStop(1, 'rgba(58,48,52,0)');
  g.fillStyle = ash;
  g.beginPath();
  g.arc(C, C, R(4.95), 0, Math.PI * 2);
  g.fill();
  // Ash cracks glowing faintly violet.
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    let phi = rng() * Math.PI * 2;
    let r = 2.0 + rng() * 0.3;
    g.strokeStyle = `rgba(${150 + rng() * 60},${70 + rng() * 40},${200 + rng() * 55},${0.25 + rng() * 0.3})`;
    g.lineWidth = 1.5 + rng() * 2.5;
    g.beginPath();
    let [x, y] = w2c(r * Math.sin(phi), r * Math.cos(phi));
    g.moveTo(x, y);
    const steps = 4 + Math.floor(rng() * 6);
    for (let s = 0; s < steps; s++) {
      r += 0.25 + rng() * 0.35;
      phi += (rng() - 0.5) * 0.25;
      [x, y] = w2c(r * Math.sin(phi), r * Math.cos(phi));
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // Rim band with brass lettering.
  g.save();
  g.beginPath();
  g.arc(C, C, R(10.6), 0, Math.PI * 2);
  g.arc(C, C, R(10.02), 0, Math.PI * 2, true);
  g.fillStyle = '#2a1c13';
  g.fill('evenodd');
  g.restore();
  g.strokeStyle = '#b8924a';
  g.lineWidth = 4;
  for (const rr of [10.04, 10.55]) {
    g.beginPath();
    g.arc(C, C, R(rr), 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#c9a45c';
  g.font = `600 ${Math.round(R(0.3))}px "Cinzel", "Trajan Pro", Georgia, serif`;
  for (const pv of PROVINCES) {
    curvedText(g, pv.name.toUpperCase().split('').join(' '), pv.id * 60, 10.3, 0.3);
    // Rune studs between names.
    for (const off of [-30]) {
      const phi = ((pv.id * 60 + off) * Math.PI) / 180;
      const [x, y] = w2c(10.3 * Math.sin(phi), 10.3 * Math.cos(phi));
      g.beginPath();
      g.arc(x, y, R(0.09), 0, Math.PI * 2);
      g.fill();
    }
  }

  // Roads.
  for (const [a, b] of EDGES) road(g, NODE_BY_ID[a], NODE_BY_ID[b]);

  // Spaces and labels.
  for (const n of NODES) {
    if (n.type === 'spire') continue;
    space(g, n);
  }
  for (const n of NODES) {
    if (n.type === 'spire') continue;
    label(g, n);
  }

  // Inner ring around the Spire base.
  g.strokeStyle = 'rgba(184,146,74,0.75)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(C, C, R(2.05), 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([6, 10]);
  g.beginPath();
  g.arc(C, C, R(2.75), 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  return cv;

  function curvedText(ctx, text, phiCenter, r, size) {
    const chars = [...text];
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    const radPx = R(r);
    let phi = (phiCenter * Math.PI) / 180 - total / radPx / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    chars.forEach((ch, i) => {
      const half = widths[i] / 2 / radPx;
      phi += half;
      const th = Math.PI / 2 - phi;
      const [x, y] = [C + radPx * Math.cos(th), C + radPx * Math.sin(th)];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(th - Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      phi += half;
    });
  }
}

function paintTerrain(g, pv, a0, rng) {
  const pt = () => {
    const phi = ((a0 + 2 + rng() * 56) * Math.PI) / 180;
    const r = 4.9 + rng() * 5;
    return w2c(r * Math.sin(phi), r * Math.cos(phi));
  };
  const n = 260;
  switch (pv.terrain) {
    case 'heath':
      for (let i = 0; i < n; i++) {
        const [x, y] = pt();
        g.fillStyle = rng() < 0.6 ? 'rgba(142,90,122,0.55)' : 'rgba(170,150,80,0.45)';
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(x + (rng() - 0.5) * 16, y + (rng() - 0.5) * 16, 2 + rng() * 2.5, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    case 'marsh':
      g.lineWidth = 2.5;
      for (let i = 0; i < n; i++) {
        const [x, y] = pt();
        g.strokeStyle = rng() < 0.5 ? 'rgba(180,215,200,0.4)' : 'rgba(30,55,50,0.45)';
        g.beginPath();
        g.moveTo(x - 10, y);
        g.quadraticCurveTo(x, y - 4, x + 10, y);
        g.stroke();
        if (rng() < 0.3) {
          g.strokeStyle = 'rgba(40,60,35,0.6)';
          for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 4, y - 2); g.lineTo(x + k * 5, y - 14); g.stroke(); }
        }
      }
      break;
    case 'volcanic':
      g.lineCap = 'round';
      for (let i = 0; i < 70; i++) {
        let [x, y] = pt();
        g.strokeStyle = `rgba(255,${110 + rng() * 60},40,${0.35 + rng() * 0.35})`;
        g.lineWidth = 1.5 + rng() * 3;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < n; i++) {
        const [x, y] = pt();
        g.fillStyle = 'rgba(30,14,10,0.35)';
        g.beginPath();
        g.arc(x, y, 3 + rng() * 6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'snow':
      for (let i = 0; i < n * 1.4; i++) {
        const [x, y] = pt();
        g.fillStyle = rng() < 0.7 ? 'rgba(240,246,250,0.55)' : 'rgba(90,110,130,0.3)';
        g.beginPath();
        g.ellipse(x, y, 6 + rng() * 20, 3 + rng() * 8, rng() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'forest':
      for (let i = 0; i < n * 1.2; i++) {
        const [x, y] = pt();
        const r = 6 + rng() * 9;
        g.fillStyle = rng() < 0.5 ? 'rgba(20,38,20,0.6)' : 'rgba(80,120,60,0.4)';
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(120,160,90,0.25)';
        g.beginPath();
        g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'desert':
      g.lineWidth = 3;
      for (let i = 0; i < n; i++) {
        const [x, y] = pt();
        g.strokeStyle = rng() < 0.6 ? 'rgba(240,215,150,0.5)' : 'rgba(120,85,40,0.35)';
        g.beginPath();
        g.arc(x, y + 14, 18 + rng() * 10, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
      break;
    default:
  }
}

function road(g, a, b) {
  const trim = (n, toward) => {
    if (n.type !== 'spire') return [n.x, n.z];
    const d = Math.hypot(toward.x, toward.z);
    return [(toward.x / d) * 2.05, (toward.z / d) * 2.05];
  };
  const [ax, az] = trim(a, b);
  const [bx, bz] = trim(b, a);
  const [x0, y0] = w2c(ax, az);
  const [x1, y1] = w2c(bx, bz);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(28,18,10,0.85)';
  g.lineWidth = 0.34 * K;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = '#8a6a3e';
  g.lineWidth = 0.22 * K;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = '#ecd9a8';
  g.lineWidth = 0.07 * K;
  g.setLineDash([0.16 * K, 0.18 * K]);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.setLineDash([]);
}

function space(g, n) {
  const [x, y] = w2c(n.x, n.z);
  const r = 0.62 * K;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.arc(x + 4, y + 6, r, 0, Math.PI * 2); g.fill();
  const ring = n.type === 'keep' ? (n.wedge === 0 ? PLAYER_COLORS.crimson.hex : PLAYER_COLORS.azure.hex) : TYPE_RING[n.type];
  g.fillStyle = '#e6d6ae';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#2e1f13';
  g.stroke();
  if (ring) {
    g.lineWidth = 9;
    g.strokeStyle = ring;
    g.beginPath(); g.arc(x, y, r - 9, 0, Math.PI * 2); g.stroke();
  } else {
    // Wilds: a small printed compass star.
    g.fillStyle = 'rgba(70,48,28,0.55)';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.18 : r * 0.55;
      const a = (i * Math.PI) / 4;
      g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    g.closePath();
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(70,48,28,0.45)';
    g.beginPath(); g.arc(x, y, r * 0.78, 0, Math.PI * 2); g.stroke();
  }
}

function label(g, n) {
  const [x, y] = w2c(n.x, n.z);
  const size = Math.round(0.3 * K);
  g.font = `600 ${size}px "Cinzel", "Trajan Pro", Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = n.name;
  const w = g.measureText(text).width + size * 0.9;
  const ly = y + 0.95 * K;
  const h = size * 1.35;
  // Scroll-shaped label.
  g.fillStyle = 'rgba(236,222,186,0.92)';
  g.strokeStyle = 'rgba(46,31,19,0.9)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x - w / 2, ly - h / 2);
  g.lineTo(x + w / 2, ly - h / 2);
  g.lineTo(x + w / 2 - h * 0.22, ly);
  g.lineTo(x + w / 2, ly + h / 2);
  g.lineTo(x - w / 2, ly + h / 2);
  g.lineTo(x - w / 2 + h * 0.22, ly);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#2b1b10';
  g.fillText(text, x, ly + 1);
}

function paintTable() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const g = cv.getContext('2d');
  g.fillStyle = '#2a1a10';
  g.fillRect(0, 0, 1024, 1024);
  const rng = mulberry32(77);
  for (let i = 0; i < 520; i++) {
    const y = rng() * 1024;
    g.strokeStyle = `rgba(${rng() < 0.5 ? '10,5,2' : '90,58,34'},${0.08 + rng() * 0.18})`;
    g.lineWidth = 1 + rng() * 4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 64) g.lineTo(x, y + Math.sin(x * 0.01 + i) * (2 + rng() * 6));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
export class Board3D {
  constructor(canvas, { onNodeClick, onNodeHover } = {}) {
    this.canvas = canvas;
    this.onNodeClick = onNodeClick;
    this.onNodeHover = onNodeHover;
    this.tweens = [];
    this.pawns = {};
    this.pawnAt = {};
    this.highlighted = new Set();
    this.hover = null;
    this.clock = new THREE.Clock();
    this.mood = { color: new THREE.Color('#ffb347'), intensity: 1 };
  }

  async init() {
    try { await document.fonts.load('600 40px "Cinzel"'); } catch (e) { /* fall back to Georgia */ }
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c090b');
    scene.fog = new THREE.Fog('#0c090b', 34, 70);
    this.scene = scene;

    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    cam.position.set(0, 21, 16.5);
    this.camera = cam;
    const ctl = new OrbitControls(cam, this.canvas);
    ctl.target.set(0, 0.2, 0.6);
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.08;
    ctl.minDistance = 7;
    ctl.maxDistance = 38;
    ctl.maxPolarAngle = 1.3;
    ctl.minPolarAngle = 0.2;
    ctl.enablePan = true;
    ctl.screenSpacePanning = false;
    this.controls = ctl;

    // Lights.
    this.hemi = new THREE.HemisphereLight('#c5c9ff', '#2a1a10', 0.55);
    scene.add(this.hemi);
    const key = new THREE.DirectionalLight('#ffe0b5', 2.3);
    key.position.set(9, 20, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    this.key = key;
    const fill = new THREE.DirectionalLight('#8ea6ff', 0.45);
    fill.position.set(-12, 9, -8);
    scene.add(fill);
    this.fill = fill;

    // Table.
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ map: paintTable(), roughness: 0.7, metalness: 0 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.32;
    table.receiveShadow = true;
    scene.add(table);

    // Board body and printed top.
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(TOP_R, TOP_R + 0.12, 0.3, 128),
      new THREE.MeshStandardMaterial({ color: '#2a1c13', roughness: 0.6 }),
    );
    body.position.y = -0.155;
    body.receiveShadow = true;
    body.castShadow = true;
    scene.add(body);
    const rng = mulberry32(2024);
    const tex = new THREE.CanvasTexture(paintBoard(rng));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = r.capabilities.getMaxAnisotropy();
    const top = new THREE.Mesh(
      new THREE.CircleGeometry(TOP_R, 160),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.002;
    top.receiveShadow = true;
    scene.add(top);
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(TOP_R, 0.055, 8, 160),
      new THREE.MeshStandardMaterial({ color: '#b8924a', metalness: 0.8, roughness: 0.35 }),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.0;
    scene.add(trim);

    // Spire.
    this.spire = M.makeSpire();
    scene.add(this.spire);

    // Buildings.
    this.buildings = {};
    this.barrows = {};
    for (const n of NODES) {
      let m = null;
      if (n.type === 'keep') m = M.makeKeep(n.wedge === 0 ? PLAYER_COLORS.crimson.hex : PLAYER_COLORS.azure.hex);
      else if (n.type === 'market') m = M.makeMarket();
      else if (n.type === 'shrine') m = M.makeShrine();
      else if (n.type === 'barrow') { m = M.makeBarrow(); this.barrows[n.id] = m; m.userData.setSigil?.(null); }
      if (!m) continue;
      m.position.set(n.x, 0, n.z);
      // Face the outside of the board, where the players sit.
      m.rotation.y = Math.atan2(n.x, n.z);
      scene.add(m);
      this.buildings[n.id] = m;
    }

    this.scatterScenery(rng);
    this.buildHitAreas();

    // Pawns.
    this.pawns.p = M.makePawn(PLAYER_COLORS.crimson.hex);
    this.pawns.r = M.makePawn(PLAYER_COLORS.azure.hex);
    for (const pw of Object.values(this.pawns)) { pw.scale.setScalar(1.3); scene.add(pw); }

    // Active-turn marker: a bobbing chevron above the pawn.
    const chev = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.3, 4),
      new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9 }),
    );
    chev.rotation.x = Math.PI;
    this.chevron = chev;
    scene.add(chev);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.bindPointer();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement);
    this.titleMode = false;
  }

  scatterScenery(rng) {
    const kinds = {
      heath: ['oak', 'rock', 'oak', 'mushroom'],
      marsh: ['reeds', 'reeds', 'deadtree', 'rock'],
      volcanic: ['crystalrock', 'deadtree', 'rock', 'crystalrock'],
      snow: ['snowpine', 'snowpine', 'rock', 'snowpine'],
      forest: ['pine', 'pine', 'oak', 'mushroom'],
      desert: ['cactus', 'rock', 'cactus', 'rock'],
    };
    const roads = EDGES.map(([a, b]) => [NODE_BY_ID[a], NODE_BY_ID[b]]);
    const distSeg = (px, pz, a, b) => {
      const ax = a.type === 'spire' ? 0 : a.x; const az = a.type === 'spire' ? 0 : a.z;
      const vx = b.x - ax; const vz = b.z - az;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
      return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
    };
    const placed = [];
    const protos = {};
    for (const pv of PROVINCES) {
      let count = 0;
      for (let tries = 0; tries < 400 && count < 16; tries++) {
        const phi = ((pv.id * 60 - 28 + rng() * 56) * Math.PI) / 180;
        const r = 4.9 + rng() * 4.7;
        const x = r * Math.sin(phi);
        const z = r * Math.cos(phi);
        if (NODES.some((n) => Math.hypot(n.x - x, n.z - z) < 1.15)) continue;
        if (roads.some(([a, b]) => distSeg(x, z, a, b) < 0.42)) continue;
        if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.55)) continue;
        // Keep clear of the node labels printed below each space.
        if (NODES.some((n) => Math.abs(n.x - x) < 1.3 && z - n.z > 0.6 && z - n.z < 1.3)) continue;
        const kind = kinds[pv.terrain][Math.floor(rng() * 4)];
        if (!protos[kind]) protos[kind] = M.makeDecoration(kind);
        const d = protos[kind].clone();
        d.position.set(x, 0, z);
        d.rotation.y = rng() * Math.PI * 2;
        const s = 0.8 + rng() * 0.5;
        d.scale.setScalar(s);
        this.scene.add(d);
        placed.push([x, z]);
        count++;
      }
    }
  }

  buildHitAreas() {
    this.hits = [];
    this.rings = {};
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    for (const n of NODES) {
      const isSpire = n.type === 'spire';
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(isSpire ? 2.6 : 0.85, isSpire ? 2.6 : 0.85, isSpire ? 8 : 1.6, 24), hitMat);
      hit.position.set(n.x, isSpire ? 4 : 0.8, n.z);
      hit.userData.nodeId = n.id;
      this.scene.add(hit);
      this.hits.push(hit);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(isSpire ? 2.12 : 0.68, isSpire ? 2.42 : 0.86, 48),
        new THREE.MeshBasicMaterial({ color: '#ffcf6a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(n.x, 0.03, n.z);
      ring.visible = false;
      ring.renderOrder = 2;
      this.scene.add(ring);
      this.rings[n.id] = ring;
    }
  }

  bindPointer() {
    const el = this.canvas;
    let downAt = null;
    const pick = (e) => {
      const rect = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.hits, false)[0];
      return hit ? hit.object.userData.nodeId : null;
    };
    el.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 6) return;
      const id = pick(e);
      if (id) this.onNodeClick?.(id, e);
    });
    el.addEventListener('pointermove', (e) => {
      const id = pick(e);
      if (id !== this.hover) {
        this.hover = id;
        el.style.cursor = id && this.highlighted.has(id) ? 'pointer' : 'grab';
      }
      this.onNodeHover?.(id, e);
    });
    el.addEventListener('pointerleave', () => { this.hover = null; this.onNodeHover?.(null); });
  }

  resize() {
    const p = this.canvas.parentElement;
    const w = p.clientWidth;
    const h = p.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Pull the camera back on narrow screens so the whole board fits.
    const aspect = w / h;
    this.camera.fov = aspect >= 1.5 ? 38 : aspect >= 1.1 ? 44 : 52;
    this.camera.updateProjectionMatrix();
  }

  // ---------- pawns ----------
  slotPosition(pid, nodeId, other) {
    const n = NODE_BY_ID[nodeId];
    if (n.type === 'spire') {
      const a = ((pid === 'p' ? -16 : 16) * Math.PI) / 180;
      return new THREE.Vector3(2.45 * Math.sin(a), 0, 2.45 * Math.cos(a));
    }
    const radial = new THREE.Vector3(n.x, 0, n.z).normalize();
    const tangent = new THREE.Vector3(radial.z, 0, -radial.x);
    const pos = new THREE.Vector3(n.x, 0, n.z);
    const side = pid === 'p' ? -1 : 1;
    if (this.buildings[nodeId]) {
      pos.addScaledVector(tangent, side * 0.82).addScaledVector(radial, 0.22);
    } else if (other === nodeId) {
      pos.addScaledVector(tangent, side * 0.3);
    }
    return pos;
  }

  placePawns(players) {
    for (const p of players) {
      this.pawnAt[p.id] = p.node;
    }
    for (const p of players) {
      const other = players.find((q) => q !== p).node;
      const pos = this.slotPosition(p.id, p.node, other);
      this.pawns[p.id].position.copy(pos);
    }
  }

  movePawn(pid, path, { teleport = false, drift = false } = {}, onStep) {
    const pawn = this.pawns[pid];
    const otherId = pid === 'p' ? 'r' : 'p';
    return new Promise((resolve) => {
      const steps = teleport ? [path[path.length - 1]] : path.slice(1);
      let i = 0;
      const next = () => {
        if (i >= steps.length) {
          this.pawnAt[pid] = path[path.length - 1];
          // Nudge the other pawn if we now share a wilds space.
          const op = this.pawns[otherId];
          const opos = this.slotPosition(otherId, this.pawnAt[otherId], this.pawnAt[pid]);
          if (op.position.distanceTo(opos) > 0.01) this.tween(op, op.position.clone(), opos, 250, 0.2);
          resolve();
          return;
        }
        const to = steps[i++];
        const from = pawn.position.clone();
        const dest = this.slotPosition(pid, to, this.pawnAt[otherId]);
        const dur = teleport ? 900 : drift ? 900 : 380;
        const hop = teleport ? 3.5 : drift ? 0.25 : 0.55;
        this.tween(pawn, from, dest, dur, hop).then(() => { onStep?.(to); next(); });
      };
      next();
    });
  }

  tween(obj, from, to, dur, hop) {
    return new Promise((resolve) => {
      this.tweens.push({ obj, from, to, dur, hop, t0: performance.now(), resolve });
    });
  }

  setActive(pid) {
    this.activePid = pid;
    for (const [id, pw] of Object.entries(this.pawns)) pw.userData.setHighlight?.(id === pid);
  }

  // ---------- highlights ----------
  highlight(ids) {
    this.highlighted = new Set(ids || []);
    for (const [id, ring] of Object.entries(this.rings)) ring.visible = this.highlighted.has(id);
  }

  highlightHover(id) { this.hover = id; }

  syncBarrows(state) {
    const human = state.players[0];
    for (const [id, m] of Object.entries(this.barrows)) {
      const b = state.barrows[id];
      const key = `${b.revealed ? b.shard : '-'}|${human.looted[id] ? 1 : 0}`;
      if (m.userData._key === key) continue;
      m.userData._key = key;
      m.userData.setSigil?.(b.revealed ? b.shard : null, b.revealed ? SHARD_COLOR[b.shard] : undefined);
      m.userData.setLooted?.(!!human.looted[id]);
    }
  }

  // ---------- the Spire ----------
  setMood(color, mood) {
    const intensity = { idle: 0.85, good: 1, danger: 1.15, warn: 1, magic: 1.1, gloom: 0.7, victory: 1.5, rival: 0.9 }[mood] ?? 1;
    this.moodColor = color;
    this.moodIntensity = intensity;
    this.spire.userData.setGlow?.(color, intensity);
  }

  pulse() { this.spire.userData.pulse?.(); }

  flare() {
    this.spire.userData.setGlow?.(this.moodColor || '#ffb347', 1.5);
    this.spire.userData.pulse?.();
  }

  crownNote(shard) {
    this.spire.userData.setGlow?.(SHARD_COLOR[shard], 1.5);
    this.spire.userData.pulse?.();
    clearTimeout(this._noteT);
    this._noteT = setTimeout(() => this.spire.userData.setGlow?.(this.moodColor || '#c49bff', this.moodIntensity || 1), 380);
  }

  setGloom(g, max) {
    const t = Math.min(1, g / max);
    this.key.intensity = 2.3 - 1.0 * t;
    this.hemi.intensity = 0.55 - 0.2 * t;
    this.hemi.color.set('#c5c9ff').lerp(new THREE.Color('#8a5cc8'), t * 0.8);
    const bg = new THREE.Color('#0c090b').lerp(new THREE.Color('#1a0c24'), t);
    this.scene.background.copy(bg);
    this.scene.fog.color.copy(bg);
    this.scene.fog.near = 34 - 14 * t;
  }

  setTitleMode(on) {
    this.titleMode = on;
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 0.5;
    if (on) {
      this.camera.position.set(0, 7.5, 16);
      this.controls.target.set(0, 3, 0);
    }
  }

  resetView(animated = true) {
    const toPos = new THREE.Vector3(0, 21, 16.5);
    if (this.camera.aspect < 1.1) toPos.set(0, 20.5, 13);
    const toTarget = new THREE.Vector3(0, 0.2, 0.6);
    if (!animated) {
      this.camera.position.copy(toPos);
      this.controls.target.copy(toTarget);
      return;
    }
    this.camTween = { fromPos: this.camera.position.clone(), toPos, fromT: this.controls.target.clone(), toT: toTarget, t0: performance.now(), dur: 1600 };
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  frame() {
    const now = performance.now();
    const t = this.clock.getElapsedTime();
    // Tweens.
    this.tweens = this.tweens.filter((tw) => {
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      tw.obj.position.lerpVectors(tw.from, tw.to, e);
      tw.obj.position.y = Math.sin(Math.PI * k) * tw.hop;
      if (k >= 1) { tw.obj.position.y = 0; tw.resolve(); return false; }
      return true;
    });
    if (this.camTween) {
      const c = this.camTween;
      const k = Math.min(1, (now - c.t0) / c.dur);
      const e = 1 - (1 - k) ** 3;
      this.camera.position.lerpVectors(c.fromPos, c.toPos, e);
      this.controls.target.lerpVectors(c.fromT, c.toT, e);
      if (k >= 1) this.camTween = null;
    }
    // Model animation hooks.
    this.spire.userData.update?.(t);
    for (const m of Object.values(this.buildings)) m.userData.update?.(t);
    for (const p of Object.values(this.pawns)) p.userData.update?.(t);
    // Highlight rings pulse.
    for (const id of this.highlighted) {
      const ring = this.rings[id];
      const hov = this.hover === id;
      ring.material.opacity = (hov ? 0.95 : 0.45) + Math.sin(t * 5) * 0.2;
      ring.scale.setScalar(hov ? 1.12 : 1 + Math.sin(t * 3) * 0.03);
    }
    // Chevron over the active pawn.
    const pw = this.pawns[this.activePid];
    if (pw && !this.titleMode) {
      this.chevron.visible = true;
      this.chevron.position.set(pw.position.x, pw.position.y + 1.35 + Math.sin(t * 3) * 0.08, pw.position.z);
      this.chevron.rotation.y = t * 1.5;
      this.chevron.material.color.set(this.activePid === 'p' ? PLAYER_COLORS.crimson.light : PLAYER_COLORS.azure.light);
    } else this.chevron.visible = false;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // Screen position of a node, for tooltips.
  project(nodeId) {
    const n = NODE_BY_ID[nodeId];
    const v = new THREE.Vector3(n.x, n.type === 'spire' ? 7.8 : 1.4, n.z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height };
  }
}
