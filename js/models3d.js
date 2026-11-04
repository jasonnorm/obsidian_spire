// Obsidian Spire: procedural 3D asset kit.
//
// Every piece is built from three.js primitives at runtime: no model or
// texture files. The look is 1981 injection-moulded toy plastic: glossy,
// chunky, bevelled. Geometry for each model is built once, merged per
// material and cached, so placing twenty buildings costs a handful of
// draw calls each. Materials are shared and cached by colour, except where
// a model animates its own material (pawn highlight, shrine flame, spire).
//
// Conventions: y is up, board top is y = 0, every model's origin is the
// centre of its footprint on the board.

import * as THREE from 'three';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hexOf(c) {
  return '#' + new THREE.Color(c).getHexString();
}

// Darken / lighten in linear space and return an sRGB hex string.
function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

function desaturate(hex, amount, dim = 1) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * (1 - amount), hsl.l * dim);
  return '#' + c.getHexString();
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

// Recompute normals so faces meeting at less than `creaseDeg` are smoothed
// and sharper edges stay crisp. Returns a non-indexed geometry.
function creaseNormals(geo, creaseDeg = 32) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const n = pos.count;
  const fn = new Float32Array(n); // unit face normal per triangle (3 floats per tri)
  const fa = new Float32Array(n); // area-weighted face normal
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < n / 3; t++) {
    a.fromBufferAttribute(pos, 3 * t);
    b.fromBufferAttribute(pos, 3 * t + 1);
    c.fromBufferAttribute(pos, 3 * t + 2);
    c.sub(b);
    a.sub(b);
    c.cross(a);
    fa[3 * t] = c.x;
    fa[3 * t + 1] = c.y;
    fa[3 * t + 2] = c.z;
    const len = c.length();
    if (len > 1e-12) {
      fn[3 * t] = c.x / len;
      fn[3 * t + 1] = c.y / len;
      fn[3 * t + 2] = c.z / len;
    }
  }
  const groups = new Map();
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    keys[i] = k;
    let arr = groups.get(k);
    if (!arr) groups.set(k, (arr = []));
    arr.push(i);
  }
  const cosT = Math.cos(creaseDeg * DEG);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = (i / 3) | 0;
    const nx = fn[3 * t], ny = fn[3 * t + 1], nz = fn[3 * t + 2];
    let sx = 0, sy = 0, sz = 0;
    for (const j of groups.get(keys[i])) {
      const u = (j / 3) | 0;
      const d = fn[3 * u] * nx + fn[3 * u + 1] * ny + fn[3 * u + 2] * nz;
      if (d >= cosT) {
        sx += fa[3 * u];
        sy += fa[3 * u + 1];
        sz += fa[3 * u + 2];
      }
    }
    let len = Math.hypot(sx, sy, sz);
    if (len < 1e-12) {
      sx = nx; sy = ny; sz = nz;
      len = Math.hypot(sx, sy, sz) || 1;
    }
    out[3 * i] = sx / len;
    out[3 * i + 1] = sy / len;
    out[3 * i + 2] = sz / len;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

// Merge a list of geometries into one non-indexed geometry
// (position + normal, plus colour if any part carries vertex colours).
function mergeGeos(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const withColor = geos.some((g) => g.getAttribute('color'));
  let total = 0;
  for (const g of geos) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    total += g.getAttribute('position').count;
  }
  const P = new Float32Array(total * 3);
  const N = new Float32Array(total * 3);
  const C = withColor ? new Float32Array(total * 3).fill(1) : null;
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const nm = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      P[(o + i) * 3] = p.getX(i);
      P[(o + i) * 3 + 1] = p.getY(i);
      P[(o + i) * 3 + 2] = p.getZ(i);
      N[(o + i) * 3] = nm.getX(i);
      N[(o + i) * 3 + 1] = nm.getY(i);
      N[(o + i) * 3 + 2] = nm.getZ(i);
    }
    const col = g.getAttribute('color');
    if (C && col) {
      for (let i = 0; i < p.count; i++) {
        C[(o + i) * 3] = col.getX(i);
        C[(o + i) * 3 + 1] = col.getY(i);
        C[(o + i) * 3 + 2] = col.getZ(i);
      }
    }
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (C) out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// Bake a flat vertex colour into a geometry (for multi-colour merged parts).
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

// Transform a geometry in place. Rotation order YXZ: tilt (x, z) first,
// then spin about the vertical axis; translation is in parent space.
function xf(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m4);
  return g;
}

// Place a geometry built facing +z onto a ring at angle phi (0 = +z, 90deg = +x).
function onRing(g, phi, radius, y, tilt = 0) {
  return xf(g, radius * Math.sin(phi), y, radius * Math.cos(phi), tilt, phi, 0);
}

// Lathe from [[r, y], ...] (bottom to top, outward first) with crease normals.
function lathe(profile, segs, phiStart = 0, crease = 30) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart);
  return creaseNormals(g, crease);
}

// Octagon lathe with a flat face centred on +z (and every 45 degrees).
const OCT_PHI = Math.PI / 8;
const OCT_K = Math.cos(Math.PI / 8); // apothem / vertex radius
function oct(profile) {
  return lathe(profile, 8, OCT_PHI, 30);
}

function extrude(shape, depth, bevel = 0.02, bevelSegments = 1, curveSegments = 6, crease = 35) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
    curveSegments,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  return creaseNormals(g, crease);
}

// A box with chamfered edges on all twelve edges. Centred at origin.
function chamferBox(w, h, d, c = 0.02, segs = 1) {
  c = Math.min(c, w / 4, h / 4, d / 4);
  const hw = w / 2 - c;
  const hh = h / 2 - c;
  const k = Math.min(c * 0.9, hw * 0.5, hh * 0.5);
  const s = new THREE.Shape();
  s.moveTo(-hw + k, -hh);
  s.lineTo(hw - k, -hh);
  s.lineTo(hw, -hh + k);
  s.lineTo(hw, hh - k);
  s.lineTo(hw - k, hh);
  s.lineTo(-hw + k, hh);
  s.lineTo(-hw, hh - k);
  s.lineTo(-hw, -hh + k);
  s.closePath();
  return extrude(s, d - 2 * c, c, segs, 1, 30);
}

// Pointed (gothic) arch outline: bottom at y = 0, springing at hs, apex at ha.
function archShape(w, hs, ha) {
  const s = new THREE.Shape();
  const hw = w / 2;
  const cy = hs + (ha - hs) * 0.6;
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  s.lineTo(hw, hs);
  s.quadraticCurveTo(hw, cy, 0, ha);
  s.quadraticCurveTo(-hw, cy, -hw, hs);
  s.closePath();
  return s;
}

// U-shaped arch frame (outer arch minus inner opening, open at the bottom).
function archFrameShape(ow, os, oa, iw, is, ia) {
  const s = new THREE.Shape();
  const icy = is + (ia - is) * 0.6;
  const ocy = os + (oa - os) * 0.6;
  s.moveTo(-ow / 2, 0);
  s.lineTo(-iw / 2, 0);
  s.lineTo(-iw / 2, is);
  s.quadraticCurveTo(-iw / 2, icy, 0, ia);
  s.quadraticCurveTo(iw / 2, icy, iw / 2, is);
  s.lineTo(iw / 2, 0);
  s.lineTo(ow / 2, 0);
  s.lineTo(ow / 2, os);
  s.quadraticCurveTo(ow / 2, ocy, 0, oa);
  s.quadraticCurveTo(-ow / 2, ocy, -ow / 2, os);
  s.closePath();
  return s;
}

// Faceted crystal / gem: bottom apex, a prism belt, top apex. Lower belt ring at y = 0.
function crystalGeo(r, bot, belt, top, sides = 6, seed = 7, jitter = 0.08, twist = 0) {
  const rand = mulberry32(seed);
  const L = [];
  const U = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU;
    const rr = r * (1 + (rand() - 0.5) * jitter);
    L.push([Math.sin(a) * rr, (rand() - 0.5) * jitter * belt * 0.5, Math.cos(a) * rr]);
    const a2 = a + twist;
    const ru = rr * (0.94 + (rand() - 0.5) * jitter * 0.5);
    U.push([Math.sin(a2) * ru, belt + (rand() - 0.5) * jitter * belt * 0.5, Math.cos(a2) * ru]);
  }
  const B = [(rand() - 0.5) * r * jitter, -bot, (rand() - 0.5) * r * jitter];
  const T = [(rand() - 0.5) * r * jitter, belt + top, (rand() - 0.5) * r * jitter];
  const v = [];
  const tri = (p, q, s) => v.push(...p, ...q, ...s);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    tri(B, L[j], L[i]);
    tri(L[i], L[j], U[j]);
    tri(L[i], U[j], U[i]);
    tri(U[i], U[j], T);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// Tube along a smooth curve whose radius tapers from r0 to r1.
function taperTube(points, r0, r1, tubSeg = 8, radSeg = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, tubSeg, 1, radSeg, false);
  const pos = g.getAttribute('position');
  const P = new THREE.Vector3();
  const V = new THREE.Vector3();
  for (let i = 0; i <= tubSeg; i++) {
    const t = i / tubSeg;
    curve.getPointAt(t, P);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radSeg; j++) {
      const idx = i * (radSeg + 1) + j;
      V.fromBufferAttribute(pos, idx).sub(P).multiplyScalar(r).add(P);
      pos.setXYZ(idx, V.x, V.y, V.z);
    }
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// Lumpy low-poly rock (deterministic).
function rockGeo(r, seed, detail = 1, sy = 0.65, amp = 0.22) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.getAttribute('position');
  const rand = mulberry32(seed);
  const o1 = rand() * 10, o2 = rand() * 10, o3 = rand() * 10;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 9.1 + o1) * Math.sin(y * 7.3 + o2) * Math.sin(z * 8.7 + o3);
    const n2 = Math.sin(x * 17.0 + o3) * Math.sin(z * 15.0 + o1);
    const f = 1 + amp * n + amp * 0.4 * n2;
    pos.setXYZ(i, x * f, y * f * sy, z * f * (0.85 + 0.15 * Math.sin(o2)));
  }
  return creaseNormals(g, 12);
}

/* ------------------------------------------------------------------ */
/* Kit: collect parts by material role, merge, cache                   */
/* ------------------------------------------------------------------ */

class Kit {
  constructor() {
    this.parts = {};
  }
  add(role, geo) {
    (this.parts[role] || (this.parts[role] = [])).push(geo);
    return geo;
  }
  build() {
    const out = {};
    for (const role of Object.keys(this.parts)) out[role] = mergeGeos(this.parts[role]);
    return out;
  }
}

const GEO_CACHE = new Map();
function cachedGeos(key, builder) {
  if (!GEO_CACHE.has(key)) GEO_CACHE.set(key, builder());
  return GEO_CACHE.get(key);
}

function mesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/* ------------------------------------------------------------------ */
/* Environment + materials                                             */
/* ------------------------------------------------------------------ */

// A tiny procedural "photo studio" cube map (warm softbox overhead, a
// window on the key side, a strip light behind the camera). It gives the
// clearcoat something to reflect so black plastic reads as glossy black
// rather than flat. Built once from canvases; three.js PMREMs it itself.
let ENV;
function studioEnv() {
  if (ENV !== undefined) return ENV;
  if (typeof document === 'undefined') return (ENV = null);
  const S = 128;
  const face = (fn) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    fn(c.getContext('2d'), S);
    return c;
  };
  const wall = (g, s, panels = []) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, '#5e5650');
    gr.addColorStop(0.45, '#2f2a26');
    gr.addColorStop(0.62, '#1a1512');
    gr.addColorStop(1, '#0c0907');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    g.filter = 'blur(3px)';
    for (const p of panels) {
      g.globalAlpha = p.a == null ? 1 : p.a;
      g.fillStyle = p.c;
      g.fillRect(p.x * s, p.y * s, p.w * s, p.h * s);
    }
    g.globalAlpha = 1;
    g.filter = 'none';
  };
  const px = face((g, s) => wall(g, s, [{ c: '#ffe2bd', x: 0.28, y: 0.1, w: 0.44, h: 0.42 }]));
  const nx = face((g, s) => wall(g, s, [{ c: '#8fa8e8', x: 0.32, y: 0.16, w: 0.36, h: 0.3, a: 0.55 }]));
  const py = face((g, s) => {
    g.fillStyle = '#3c3631';
    g.fillRect(0, 0, s, s);
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.48);
    r.addColorStop(0, '#f6ece0');
    r.addColorStop(0.3, '#d8cbb8');
    r.addColorStop(0.7, 'rgba(110,100,90,0.5)');
    r.addColorStop(1, 'rgba(60,54,49,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
  const ny = face((g, s) => {
    g.fillStyle = '#140d09';
    g.fillRect(0, 0, s, s);
  });
  const pz = face((g, s) => wall(g, s, [{ c: '#fff1de', x: 0.1, y: 0.16, w: 0.8, h: 0.2, a: 0.8 }]));
  const nz = face((g, s) => wall(g, s, [{ c: '#ffd7a8', x: 0.4, y: 0.12, w: 0.2, h: 0.5, a: 0.5 }]));
  const tex = new THREE.CubeTexture([px, nx, py, ny, pz, nz]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  ENV = tex;
  return ENV;
}

const MAT_CACHE = new Map();
function cachedMat(key, make) {
  if (!MAT_CACHE.has(key)) MAT_CACHE.set(key, make());
  return MAT_CACHE.get(key);
}

// Glossy injection-moulded plastic.
function plasticParams(hex, o = {}) {
  return {
    color: new THREE.Color(hex),
    roughness: 0.38,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.35,
    sheen: 0,
    envMap: studioEnv(),
    envMapIntensity: 0.75,
    ...o,
  };
}
function plastic(hex, o = {}) {
  return cachedMat(`plastic${hexOf(hex)}${JSON.stringify(o)}`, () => new THREE.MeshPhysicalMaterial(plasticParams(hex, o)));
}

// Matte painted-terrain plastic for scenery.
function matte(hex, o = {}) {
  return cachedMat(`matte${hexOf(hex)}${JSON.stringify(o)}`, () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: 0.82,
      metalness: 0,
      envMap: studioEnv(),
      envMapIntensity: 0.4,
      ...o,
    }),
  );
}

function matteVC(o = {}) {
  return cachedMat(`matteVC${JSON.stringify(o)}`, () =>
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.82, metalness: 0, envMap: studioEnv(), envMapIntensity: 0.4, ...o }),
  );
}

function glowMat(baseHex, emissiveHex, intensity, o = {}) {
  return cachedMat(`glow${hexOf(baseHex)}${hexOf(emissiveHex)}${intensity}${JSON.stringify(o)}`, () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseHex),
      emissive: new THREE.Color(emissiveHex),
      emissiveIntensity: intensity,
      roughness: 0.45,
      metalness: 0,
      envMap: studioEnv(),
      envMapIntensity: 0.4,
      ...o,
    }),
  );
}

// Soft radial glow sprite texture (shared).
let GLOW_TEX;
function glowTexture() {
  if (GLOW_TEX !== undefined) return GLOW_TEX;
  if (typeof document === 'undefined') return (GLOW_TEX = null);
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.14)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, S, S);
  GLOW_TEX = new THREE.CanvasTexture(c);
  GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
  return GLOW_TEX;
}

function makeHalo(hex, size, opacity, depthTest = true) {
  const tex = glowTexture();
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: new THREE.Color(hex),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.renderOrder = 2;
  return s;
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const PAL = {
  obsidian: '#141118',
  obsidianSheen: '#5b2f8a',
  brass: '#b8924a',
  brassDull: '#9c7d45',
  amber: '#ff8a2a',
  led: '#ff2a1a',
  panel: '#1d1b22',
  mustard: '#d9a521',
  cream: '#efe3c4',
  ivory: '#ece4d0',
  flame: '#ffd27a',
  barrow: '#7d8a74',
  barrowDoor: '#3b4038',
};

/* ------------------------------------------------------------------ */
/* THE SPIRE                                                           */
/* ------------------------------------------------------------------ */

const SPIRE_SHAFT_Y0 = 1.25;
const SPIRE_SHAFT_R0 = 1.08;
const SPIRE_TAPER = 0.1; // vertex radius lost per unit height
const shaftR = (y) => SPIRE_SHAFT_R0 - SPIRE_TAPER * (y - SPIRE_SHAFT_Y0);
const shaftA = (y) => shaftR(y) * OCT_K;
const SHAFT_TILT = Math.atan(SPIRE_TAPER * OCT_K);
const CRYSTAL_Y = 6.86;
const WHITE = new THREE.Color(1, 1, 1);

// Rune strokes in a unit cell [-0.5, 0.5]^2: [x0, y0, x1, y1].
const RUNES = [
  [[0, -0.5, 0, 0.5], [0, 0.5, 0.45, 0.18], [0, 0.12, 0.45, -0.2]],
  [[0, -0.5, 0, 0.5], [0, 0.1, -0.45, 0.5], [0, 0.1, 0.45, 0.5]],
  [[0, -0.5, 0, 0.5], [-0.45, 0.12, 0, 0.5], [0, 0.5, 0.45, 0.12]],
  [[-0.4, -0.5, -0.4, 0.5], [0.4, -0.5, 0.4, 0.5], [-0.4, 0.5, 0.4, -0.5], [-0.4, -0.5, 0.4, 0.5]],
  [[0, -0.5, 0, 0.5], [-0.42, 0.28, 0.42, -0.28]],
  [[-0.32, -0.5, -0.32, 0.5], [-0.32, 0.5, 0.38, 0.18], [0.38, 0.18, -0.32, -0.02], [-0.32, -0.02, 0.38, -0.5]],
  [[0, 0.5, -0.42, 0], [-0.42, 0, 0, -0.5], [0, -0.5, 0.42, 0], [0.42, 0, 0, 0.5]],
  [[-0.38, -0.5, -0.38, 0.5], [0.38, -0.5, 0.38, 0.5], [-0.38, 0.5, 0.38, 0.0], [0.38, 0.5, -0.38, 0.0]],
];

function runeStrokes(kit, role, rune, cx, cy, w, h, thick, depth) {
  for (const [x0, y0, x1, y1] of rune) {
    const ax = cx + x0 * w, ay = cy + y0 * h, bx = cx + x1 * w, by = cy + y1 * h;
    const len = Math.hypot(bx - ax, by - ay);
    const g = new THREE.BoxGeometry(len + thick * 0.9, thick, depth);
    xf(g, (ax + bx) / 2, (ay + by) / 2, depth / 2, 0, 0, Math.atan2(by - ay, bx - ax));
    kit.add(role, g);
  }
}

function buildSpireGeos() {
  const k = new Kit();
  const O = 'obsidian', B = 'brass', D = 'panel', R = 'rune', L = 'led', G = 'gate';

  /* --- stepped base drum --- */
  k.add(O, oct([[0, 0], [1.85, 0], [1.9, 0.045], [1.9, 0.15], [1.85, 0.2], [0, 0.2]]));
  k.add(O, oct([[0, 0.2], [1.71, 0.2], [1.72, 0.21], [1.72, 0.34], [1.68, 0.38], [0, 0.38]]));
  k.add(O, oct([[0, 0.38], [1.56, 0.38], [1.56, 0.84], [1.45, 0.84]]));
  // brass cornice
  k.add(B, oct([[1.45, 0.79], [1.6, 0.79], [1.67, 0.84], [1.67, 0.91], [1.62, 0.955], [1.4, 0.955]]));
  // brass ring at plinth lip
  k.add(B, oct([[1.8, 0.16], [1.88, 0.16], [1.905, 0.175], [1.905, 0.2], [1.8, 0.2]]));
  // collar sloping up to the shaft
  k.add(O, oct([[1.42, 0.94], [1.43, 0.99], [1.16, 1.25], [0, 1.25]]));
  // brass ring at shaft foot
  k.add(B, oct([[1.0, 1.22], [1.13, 1.22], [1.155, 1.245], [1.155, 1.33], [1.12, 1.355], [1.0, 1.355]]));

  /* --- tall tapering octagonal shaft --- */
  const yTop = 5.66;
  k.add(O, oct([[0, SPIRE_SHAFT_Y0], [SPIRE_SHAFT_R0, SPIRE_SHAFT_Y0], [shaftR(yTop), yTop], [0, yTop]]));
  // corner ribs along the eight vertical edges: catch highlights on the black
  for (let i = 0; i < 8; i++) {
    const phi = OCT_PHI + (i * TAU) / 8;
    const y0 = 1.36, y1 = 4.78;
    const r0 = shaftR(y0), r1 = shaftR(y1);
    const len = Math.hypot(y1 - y0, r0 - r1);
    const g = chamferBox(0.075, len, 0.075, 0.018);
    // lean inward to follow the taper, rotate 45 deg so it sits as a diamond on the edge
    xf(g, 0, 0, 0, 0, Math.PI / 4, 0);
    const lean = Math.atan2(r0 - r1, y1 - y0);
    xf(g, 0, 0, 0, -lean, 0, 0);
    onRing(g, phi, (r0 + r1) / 2 + 0.005, (y0 + y1) / 2);
    k.add(O, g);
  }
  // mid string course (brass)
  {
    const y = 2.95;
    const r = shaftR(y);
    k.add(B, oct([[r - 0.05, y - 0.05], [r + 0.045, y - 0.05], [r + 0.065, y - 0.03], [r + 0.065, y + 0.03], [r + 0.045, y + 0.05], [r - 0.05, y + 0.05]]));
  }

  /* --- console on the +z face --- */
  {
    const cs = new THREE.Shape();
    cs.moveTo(1.34, 0.19);
    cs.lineTo(1.74, 0.19);
    cs.lineTo(1.74, 0.4);
    cs.lineTo(1.4, 0.86);
    cs.lineTo(1.34, 0.86);
    cs.closePath();
    const g = extrude(cs, 0.86, 0.03, 2, 1, 30);
    xf(g, 0, 0, 0, 0, -Math.PI / 2, 0);
    k.add(O, g);
    // panel frame on the slope
    const dz = 1.4 - 1.74, dy = 0.86 - 0.4;
    const len = Math.hypot(dz, dy);
    const nz = dy / len, ny = -dz / len;
    const tilt = -Math.atan2(ny, nz);
    const cz = (1.74 + 1.4) / 2 + nz * 0.03;
    const cy = (0.4 + 0.86) / 2 + ny * 0.03;
    const place = (g2, x, y, z) => {
      xf(g2, x, y, z);
      xf(g2, 0, 0, 0, tilt, 0, 0);
      xf(g2, 0, cy, cz);
      return g2;
    };
    const fw = 0.7, fh = 0.5, bar = 0.05, ft = 0.04;
    k.add(B, place(chamferBox(fw, bar, ft, 0.012), 0, fh / 2 - bar / 2, ft / 2));
    k.add(B, place(chamferBox(fw, bar, ft, 0.012), 0, -fh / 2 + bar / 2, ft / 2));
    k.add(B, place(chamferBox(bar, fh - 2 * bar + 0.01, ft, 0.012), fw / 2 - bar / 2, 0, ft / 2));
    k.add(B, place(chamferBox(bar, fh - 2 * bar + 0.01, ft, 0.012), -fw / 2 + bar / 2, 0, ft / 2));
    k.add(D, place(new THREE.BoxGeometry(fw - 0.06, fh - 0.06, 0.012), 0, 0, 0.006));
    // 3x3 key studs
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const stud = lathe([[0, 0], [0.034, 0], [0.034, 0.02], [0.026, 0.032], [0, 0.034]], 10, 0, 40);
        xf(stud, 0, 0, 0, Math.PI / 2, 0, 0);
        k.add(B, place(stud, (i - 1) * 0.1, -0.135 + j * 0.088, 0.012));
      }
    }
    // LED window with a little bezel, and a dark readout slot
    k.add(B, place(chamferBox(0.13, 0.06, 0.02, 0.006), 0.2, 0.15, 0.012));
    k.add(L, place(new THREE.BoxGeometry(0.09, 0.03, 0.02), 0.2, 0.15, 0.016));
    k.add(B, place(chamferBox(0.26, 0.06, 0.02, 0.006), -0.12, 0.15, 0.012));
    k.add(D, place(new THREE.BoxGeometry(0.22, 0.032, 0.02), -0.12, 0.15, 0.016));
    // small brass foot plate where the console meets the plinth
    k.add(B, xf(chamferBox(0.96, 0.04, 0.08, 0.012), 0, 0.2, 1.72));
  }

  /* --- gates on the sides and back --- */
  {
    const a = 1.56 * OCT_K;
    for (const phi of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const frame = extrude(archFrameShape(0.66, 0.26, 0.6, 0.42, 0.22, 0.46), 0.08, 0.022, 2, 5);
      k.add(O, onRing(frame, phi, a + 0.035, 0.38));
      const recess = extrude(archShape(0.44, 0.22, 0.47), 0.02, 0, 1, 5);
      k.add(G, onRing(recess, phi, a + 0.005, 0.38));
      // portcullis
      for (const x of [-0.15, -0.05, 0.05, 0.15]) {
        const h = 0.44 - Math.abs(x) * 0.75;
        const bar = chamferBox(0.028, h, 0.028, 0.008);
        xf(bar, x, h / 2, 0);
        k.add(B, onRing(bar, phi, a + 0.03, 0.38));
      }
      for (const y of [0.12, 0.25]) {
        const bar = chamferBox(0.42, 0.026, 0.026, 0.008);
        xf(bar, 0, y, 0);
        k.add(B, onRing(bar, phi, a + 0.045, 0.38));
      }
      // threshold step
      const step = chamferBox(0.6, 0.05, 0.14, 0.015);
      k.add(O, onRing(step, phi, a + 0.1, 0.405));
    }
    // brass medallions with a glowing eye on the diagonal faces
    for (const phi of [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
      const med = lathe([[0, 0], [0.13, 0], [0.135, 0.012], [0.12, 0.03], [0.09, 0.034], [0.075, 0.026], [0, 0.026]], 16, 0, 35);
      xf(med, 0, 0, 0, Math.PI / 2, 0, 0);
      k.add(B, onRing(med, phi, a, 0.6));
      const eye = new THREE.SphereGeometry(0.05, 10, 6);
      xf(eye, 0, 0, 0, 0, 0, 0, 1, 0.5, 0.35);
      k.add(R, onRing(eye, phi, a + 0.03, 0.6));
    }
  }

  /* --- flying buttresses on the diagonals --- */
  {
    const bs = new THREE.Shape();
    bs.moveTo(0.62, 0.95);
    bs.lineTo(1.52, 0.95);
    bs.lineTo(1.52, 1.64);
    bs.lineTo(1.3, 1.64);
    bs.quadraticCurveTo(1.16, 2.75, 0.68, 3.78);
    bs.lineTo(0.56, 3.78);
    bs.closePath();
    const hole = new THREE.Path();
    hole.moveTo(0.82, 1.34);
    hole.lineTo(1.27, 1.34);
    hole.lineTo(1.27, 1.6);
    hole.quadraticCurveTo(1.24, 2.0, 0.82, 2.48);
    hole.closePath();
    bs.holes.push(hole);
    for (const phi of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      const g = extrude(bs, 0.16, 0.03, 2, 10, 35);
      xf(g, 0, 0, 0, 0, phi - Math.PI / 2, 0);
      k.add(O, g);
      // brass spine following the flying arch
      const spine = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const u = (1 - t) * (1 - t) * 1.3 + 2 * (1 - t) * t * 1.16 + t * t * 0.68;
        const v = (1 - t) * (1 - t) * 1.64 + 2 * (1 - t) * t * 2.75 + t * t * 3.78;
        // nudge outward along the curve normal so it sits on top of the bevel
        spine.push([u + 0.03, v + 0.012, 0]);
      }
      const sp = taperTube(spine, 0.034, 0.018, 12, 6);
      xf(sp, 0, 0, 0, 0, phi - Math.PI / 2, 0);
      k.add(B, sp);
      // pier cap + pinnacle
      const cap = chamferBox(0.3, 0.05, 0.22, 0.014);
      k.add(B, onRing(cap, phi, 1.41, 1.665));
      const pin = new THREE.ConeGeometry(0.11, 0.42, 4, 1);
      xf(pin, 0, 0.21, 0, 0, Math.PI / 4, 0);
      k.add(O, onRing(creaseNormals(pin, 20), phi, 1.41, 1.69));
      const knob = new THREE.SphereGeometry(0.03, 8, 6);
      k.add(B, onRing(knob, phi, 1.41, 2.11));
    }
  }

  /* --- glowing gothic window slits --- */
  {
    const win = (phi, y) => {
      const a = shaftA(y); // pivot at the window foot; the tilt keeps it on the face
      const frame = extrude(archFrameShape(0.21, 0.3, 0.46, 0.1, 0.26, 0.36), 0.05, 0.016, 1, 4);
      k.add(O, onRing(frame, phi, a + 0.02, y, -SHAFT_TILT));
      const glass = extrude(archShape(0.11, 0.26, 0.37), 0.02, 0, 1, 4);
      k.add(R, onRing(glass, phi, a + 0.004, y, -SHAFT_TILT));
      const sill = chamferBox(0.25, 0.035, 0.1, 0.01);
      k.add(B, onRing(sill, phi, a + 0.03, y - 0.01, -SHAFT_TILT));
    };
    for (const phi of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      win(phi, 1.75);
      win(phi, 3.35);
    }
    for (const phi of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) win(phi, 4.12);
  }

  /* --- glowing rune band about two thirds up --- */
  {
    const yb = 4.8, yt = 5.2;
    const rb = shaftR(yb) + 0.075;
    const rt = shaftR(yt) + 0.075;
    k.add(B, oct([[rb - 0.1, yb], [rb - 0.01, yb], [rb + 0.005, yb + 0.015], [rb + 0.005, yb + 0.06], [rb - 0.01, yb + 0.075], [rb - 0.1, yb + 0.075]]));
    k.add(B, oct([[rt - 0.1, yt - 0.075], [rt - 0.01, yt - 0.075], [rt + 0.005, yt - 0.06], [rt + 0.005, yt - 0.015], [rt - 0.01, yt], [rt - 0.1, yt]]));
    const rm = shaftR(5.0) + 0.035;
    k.add(O, oct([[rm - 0.1, yb + 0.07], [rm, yb + 0.07], [rm, yt - 0.07], [rm - 0.1, yt - 0.07]]));
    // thin glowing lines just inside the brass rings
    k.add(R, oct([[rm - 0.05, yb + 0.072], [rm + 0.012, yb + 0.072], [rm + 0.012, yb + 0.092], [rm - 0.05, yb + 0.092]]));
    k.add(R, oct([[rm - 0.05, yt - 0.092], [rm + 0.012, yt - 0.092], [rm + 0.012, yt - 0.072], [rm - 0.05, yt - 0.072]]));
    const apo = rm * OCT_K;
    let n = 0;
    for (let f = 0; f < 8; f++) {
      const phi = (f * TAU) / 8;
      for (let i = -1; i <= 1; i++) {
        const tk = new Kit();
        runeStrokes(tk, 'r', RUNES[(n * 5 + 3) % RUNES.length], i * 0.19, 0, 0.1, 0.17, 0.024, 0.022);
        n++;
        for (const g of tk.parts.r) k.add(R, onRing(g, phi, apo - 0.004, 5.0));
      }
    }
  }

  /* --- flared parapet with spikes --- */
  k.add(O, oct([[0.5, 5.6], [0.7, 5.6], [0.88, 5.7], [0.88, 5.77], [1.04, 5.93], [1.08, 5.97], [1.08, 6.16], [1.045, 6.2], [0.955, 6.2], [0.92, 6.165], [0.92, 6.06], [0, 6.06]]));
  k.add(B, oct([[1.0, 6.02], [1.095, 6.02], [1.115, 6.04], [1.115, 6.09], [1.095, 6.11], [1.0, 6.11]]));
  for (let i = 0; i < 8; i++) {
    const phi = (i * TAU) / 8;
    const sp = new THREE.ConeGeometry(0.085, 0.36, 4, 1);
    xf(sp, 0, 0.18, 0, 0, Math.PI / 4, 0);
    k.add(O, onRing(creaseNormals(sp, 20), phi, 1.0 * OCT_K, 6.18));
  }

  /* --- the crown: cup and six claws --- */
  k.add(O, lathe([[0, 6.05], [0.5, 6.05], [0.53, 6.08], [0.48, 6.19], [0.39, 6.27], [0.34, 6.29], [0, 6.29]], 18, 0, 35));
  k.add(B, lathe([[0.55, 6.04], [0.74, 6.04], [0.76, 6.07], [0.76, 6.13], [0.73, 6.16], [0.55, 6.16]], 18, 0, 35));
  {
    const c = new THREE.Shape();
    c.moveTo(0.42, 6.08);
    c.lineTo(0.64, 6.08);
    c.bezierCurveTo(0.88, 6.42, 0.82, 7.08, 0.29, 7.36);
    c.bezierCurveTo(0.58, 7.02, 0.63, 6.45, 0.42, 6.08);
    for (let i = 0; i < 6; i++) {
      const phi = Math.PI / 6 + (i * TAU) / 6;
      const g = extrude(c, 0.07, 0.026, 2, 12, 40);
      xf(g, 0, 0, 0, 0, phi - Math.PI / 2, 0);
      k.add(O, g);
      // brass knuckle where each claw rises from the ring
      const kn = new THREE.SphereGeometry(0.075, 10, 6);
      xf(kn, 0, 0, 0, 0, 0, 0, 1, 0.8, 1);
      k.add(B, onRing(kn, phi, 0.68, 6.24));
    }
  }

  return k.build();
}

function makeRuneMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3a1a06'),
    emissive: new THREE.Color(PAL.amber),
    emissiveIntensity: 1.6,
    roughness: 0.35,
    metalness: 0,
  });
  const uniforms = { uTime: { value: 0 } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRunePos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRunePos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRunePos;\nuniform float uTime;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
          'float runeAng = atan(vRunePos.x, vRunePos.z);\n' +
          'float runeSh = 0.72 + 0.28 * sin(runeAng * 3.0 - uTime * 1.7 + vRunePos.y * 3.0);\n' +
          'runeSh *= 0.92 + 0.08 * sin(uTime * 9.0 + vRunePos.y * 40.0 + runeAng * 7.0);\n' +
          'totalEmissiveRadiance *= runeSh;',
      );
  };
  mat.customProgramCacheKey = () => 'spire-rune-shimmer';
  return mat;
}

export function makeSpire() {
  const geos = cachedGeos('spire', buildSpireGeos);
  const group = new THREE.Group();
  group.name = 'Spire';

  const obsidian = cachedMat('spire-obsidian', () =>
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(PAL.obsidian),
      roughness: 0.28,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
      sheen: 0.5,
      sheenColor: new THREE.Color(PAL.obsidianSheen),
      sheenRoughness: 0.4,
      envMap: studioEnv(),
      envMapIntensity: 0.6,
    }),
  );
  const brass = cachedMat('spire-brass', () =>
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(PAL.brass),
      roughness: 0.5,
      metalness: 0.35,
      clearcoat: 0.25,
      clearcoatRoughness: 0.45,
      envMap: studioEnv(),
      envMapIntensity: 0.7,
    }),
  );
  const panel = cachedMat('spire-panel', () =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.panel), roughness: 0.7, metalness: 0, envMap: studioEnv(), envMapIntensity: 0.3 }),
  );
  const gate = cachedMat('spire-gate', () =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d0a0c'), emissive: new THREE.Color('#ff5a18'), emissiveIntensity: 0.18, roughness: 0.8 }),
  );
  // Per-instance animated materials.
  const runeMaterial = makeRuneMaterial();
  const ledMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#300404'), emissive: new THREE.Color(PAL.led), emissiveIntensity: 1.1, roughness: 0.3 });

  group.add(mesh(geos.obsidian, obsidian));
  group.add(mesh(geos.brass, brass));
  group.add(mesh(geos.panel, panel));
  group.add(mesh(geos.gate, gate, false, true));
  group.add(mesh(geos.rune, runeMaterial, false, false));
  group.add(mesh(geos.led, ledMat, false, false));

  // Crystal: faceted, translucent-looking (emissive + slight transparency), with a bright core.
  const crystalGeom = cachedGeos('spire-crystal', () => {
    const g = crystalGeo(0.37, 0.34, 0.5, 0.52, 6, 11, 0.1, 0.12);
    g.translate(0, -0.3, 0);
    return g;
  });
  const coreGeom = cachedGeos('spire-crystal-core', () => {
    const g = crystalGeo(0.19, 0.22, 0.34, 0.3, 6, 5, 0.12, 0.3);
    g.translate(0, -0.2, 0);
    return g;
  });
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(PAL.amber).multiplyScalar(0.3),
    emissive: new THREE.Color(PAL.amber),
    emissiveIntensity: 1.0,
    roughness: 0.18,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.8,
    envMap: studioEnv(),
    envMapIntensity: 0.45,
  });
  const crystal = mesh(crystalGeom, crystalMat, true, false);
  crystal.position.y = CRYSTAL_Y;
  crystal.renderOrder = 1;
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0') });
  const core = mesh(coreGeom, coreMat, false, false);
  crystal.add(core);
  group.add(crystal);

  const crystalLight = new THREE.PointLight(new THREE.Color(PAL.amber), 10, 14, 1.25);
  crystalLight.position.set(0, CRYSTAL_Y, 0);
  crystalLight.castShadow = false;
  group.add(crystalLight);

  const halo = makeHalo(PAL.amber, 2.6, 0.5, false);
  halo.position.set(0, CRYSTAL_Y, 0);
  group.add(halo);

  // Glow state and animation hooks.
  const glowColor = new THREE.Color(PAL.amber);
  const runeColor = new THREE.Color(PAL.amber);
  const state = { level: 1, runeLevel: 1, pulseReq: false, pulseT0: -10, t: 0, lightBase: 10 };

  const apply = (t) => {
    const breath = 1 + 0.1 * Math.sin(t * 1.9) + 0.04 * Math.sin(t * 3.7 + 1.3);
    const dt = t - state.pulseT0;
    const flare = dt >= 0 && dt < 0.6 ? Math.pow(1 - dt / 0.6, 2) * 1.6 : 0;
    const lvl = state.level * breath + flare;
    crystalMat.emissive.copy(glowColor);
    crystalMat.emissiveIntensity = 1.05 * lvl;
    crystalMat.color.copy(glowColor).multiplyScalar(0.12 + 0.12 * Math.min(1, state.level));
    coreMat.color.copy(glowColor).lerp(WHITE, 0.4).multiplyScalar(0.2 + 2.2 * lvl);
    crystalLight.color.copy(glowColor);
    crystalLight.intensity = state.lightBase * lvl;
    halo.material.color.copy(glowColor);
    halo.material.opacity = clamp(0.62 * lvl, 0, 1);
    halo.scale.setScalar(2.6 + 1.3 * Math.min(lvl, 2.5));
    runeMaterial.emissive.copy(runeColor);
    runeMaterial.emissiveIntensity = state.runeLevel * (1.55 + 0.12 * Math.sin(t * 2.3)) + 0.8 * flare;
    runeMaterial.userData.uniforms.uTime.value = t;
  };

  group.userData = {
    kind: 'spire',
    crystal,
    crystalCore: core,
    crystalLight,
    halo,
    runeMaterial,
    ledMaterial: ledMat,
    setGlow(colorHex, intensity = 1) {
      glowColor.set(colorHex);
      state.level = clamp(intensity, 0, 1.5);
      apply(state.t);
    },
    // Extra: tint / dim the rune band and window slits (0..1.5).
    setRuneGlow(colorHex, intensity = 1) {
      runeColor.set(colorHex);
      state.runeLevel = clamp(intensity, 0, 1.5);
      apply(state.t);
    },
    pulse() {
      state.pulseReq = true;
    },
    update(time) {
      state.t = time;
      if (state.pulseReq) {
        state.pulseT0 = time;
        state.pulseReq = false;
      }
      crystal.rotation.y = time * 0.25;
      core.rotation.y = -time * 0.6;
      ledMat.emissiveIntensity = Math.sin(time * 4.2) > -0.2 ? 1.15 : 0.25;
      apply(time);
    },
  };
  apply(0);
  return group;
}

/* ------------------------------------------------------------------ */
/* KEEP                                                                */
/* ------------------------------------------------------------------ */

function buildKeepGeos() {
  const k = new Kit();
  const C = 'body', Dk = 'base', G = 'gate';
  // octagonal plinth
  k.add(Dk, lathe([[0, 0], [0.64, 0], [0.665, 0.02], [0.665, 0.05], [0.64, 0.075], [0, 0.075]], 8, OCT_PHI, 30));

  // main block
  const mz = -0.06;
  k.add(C, xf(chamferBox(0.56, 0.64, 0.5, 0.028, 2), 0, 0.075 + 0.32, mz));
  // string course
  k.add(C, xf(chamferBox(0.585, 0.03, 0.525, 0.01), 0, 0.47, mz));
  // battered foot
  k.add(C, xf(chamferBox(0.6, 0.07, 0.54, 0.02), 0, 0.11, mz));
  // parapet + merlons
  k.add(C, xf(chamferBox(0.64, 0.06, 0.58, 0.018), 0, 0.745, mz));
  const mer = (x, z, s = 0.12, h = 0.11, y = 0.775) => k.add(C, xf(chamferBox(s, h, s, 0.012), x, y + h / 2, z));
  for (const x of [-0.26, 0, 0.26]) {
    mer(x, mz + 0.23);
    mer(x, mz - 0.23);
  }
  mer(-0.26, mz);
  mer(0.26, mz);

  // donjon on top
  const uz = -0.1;
  k.add(C, xf(chamferBox(0.3, 0.38, 0.28, 0.022, 2), 0, 0.775 + 0.19, uz));
  k.add(C, xf(chamferBox(0.36, 0.05, 0.34, 0.015), 0, 1.17, uz));
  for (const [x, z] of [[-0.135, -0.125], [0.135, -0.125], [-0.135, 0.125], [0.135, 0.125]]) {
    k.add(C, xf(chamferBox(0.085, 0.085, 0.085, 0.01), x, 1.235, uz + z));
  }
  // flag pole
  k.add(C, xf(new THREE.CylinderGeometry(0.012, 0.014, 0.5, 6), 0, 1.195 + 0.25, uz));
  k.add(C, xf(new THREE.SphereGeometry(0.026, 8, 6), 0, 1.705, uz));
  // donjon window
  k.add(G, xf(extrude(archShape(0.07, 0.08, 0.13), 0.02, 0, 1, 3), 0, 0.88, uz + 0.142));
  k.add(C, xf(extrude(archFrameShape(0.12, 0.1, 0.18, 0.07, 0.08, 0.13), 0.025, 0.008, 1, 3), 0, 0.875, uz + 0.148));

  // two front turrets with conical roofs
  for (const sx of [-1, 1]) {
    const tx = 0.3 * sx, tz = 0.17;
    const body = lathe([[0, 0.075], [0.155, 0.075], [0.15, 0.13], [0.135, 0.2], [0.135, 0.8], [0.165, 0.83], [0.17, 0.86], [0.17, 0.92], [0, 0.92]], 14, 0, 35);
    k.add(C, xf(body, tx, 0, tz));
    const roof = lathe([[0, 0.9], [0.205, 0.9], [0.21, 0.925], [0.15, 1.0], [0.09, 1.1], [0.045, 1.22], [0, 1.33]], 14, 0, 35);
    k.add(C, xf(roof, tx, 0, tz));
    k.add(C, xf(new THREE.SphereGeometry(0.025, 8, 6), tx, 1.335, tz));
    // arrow slit facing outward-front
    const ang = Math.atan2(tx, tz);
    const slit = chamferBox(0.035, 0.13, 0.02, 0.006);
    k.add(G, xf(slit, tx + Math.sin(ang) * 0.13, 0.58, tz + Math.cos(ang) * 0.13, 0, ang, 0));
    const slit2 = chamferBox(0.035, 0.1, 0.02, 0.006);
    k.add(G, xf(slit2, tx + Math.sin(ang) * 0.13, 0.33, tz + Math.cos(ang) * 0.13, 0, ang, 0));
  }

  // gate: dark recess, raised arch frame, portcullis, ramp
  const fz = mz + 0.25;
  k.add(G, xf(extrude(archShape(0.17, 0.15, 0.27), 0.02, 0, 1, 5), 0, 0.075, fz + 0.002));
  k.add(C, xf(extrude(archFrameShape(0.27, 0.17, 0.36, 0.17, 0.15, 0.27), 0.05, 0.012, 1, 5), 0, 0.075, fz + 0.02));
  for (const x of [-0.05, 0, 0.05]) {
    const h = x === 0 ? 0.24 : 0.2;
    k.add(Dk, xf(chamferBox(0.016, h, 0.016, 0.004), x, 0.075 + h / 2 + 0.03, fz + 0.012));
  }
  k.add(Dk, xf(chamferBox(0.17, 0.016, 0.016, 0.004), 0, 0.2, fz + 0.016));
  k.add(Dk, xf(chamferBox(0.2, 0.035, 0.16, 0.01), 0, 0.075, fz + 0.09, 0.12, 0, 0));
  // window above the gate
  k.add(G, xf(extrude(archShape(0.07, 0.08, 0.13), 0.02, 0, 1, 3), 0, 0.53, fz + 0.002));
  k.add(C, xf(extrude(archFrameShape(0.12, 0.1, 0.18, 0.07, 0.08, 0.13), 0.025, 0.008, 1, 3), 0, 0.525, fz + 0.012));
  // corner quoins on the back corners (sculpted stonework)
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const y = 0.2 + i * 0.13;
      const wide = i % 2 === 0;
      k.add(C, xf(chamferBox(wide ? 0.13 : 0.08, 0.075, wide ? 0.08 : 0.13, 0.014), sx * 0.27, y, mz - 0.235));
    }
  }
  return k.build();
}

export function makeKeep(colorHex = '#c8262f') {
  const geos = cachedGeos('keep', buildKeepGeos);
  const col = hexOf(colorHex);
  const group = new THREE.Group();
  group.name = 'Keep';
  group.add(mesh(geos.body, plastic(col)));
  group.add(mesh(geos.base, plastic(shade(col, 0.55))));
  group.add(mesh(geos.gate, plastic(shade(col, 0.1), { roughness: 0.7, clearcoat: 0.1 })));

  // Swallowtail pennant: a small segmented plane so it can wave.
  const W = 0.27, H = 0.15, notch = 0.07;
  const fg = new THREE.PlaneGeometry(W, H, 8, 2);
  fg.translate(W / 2, 0, 0);
  const fp = fg.getAttribute('position');
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), y = fp.getY(i);
    const u = x / W;
    // taper slightly and cut the swallowtail notch into the middle row
    let ny = y * (1 - 0.25 * u);
    let nx = Math.abs(y) < 1e-6 ? x - notch * u : x;
    fp.setXYZ(i, nx, ny, 0);
  }
  fg.deleteAttribute('uv');
  fg.computeVertexNormals();
  const base = Float32Array.from(fp.array);
  const flag = mesh(fg, plastic(col, { side: THREE.DoubleSide }));
  flag.position.set(0.006, 1.6, -0.1);
  group.add(flag);
  const phase = Math.random() * TAU;

  group.userData = {
    kind: 'keep',
    color: col,
    flag,
    update(t) {
      for (let i = 0; i < fp.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        const u = x / W;
        fp.setXYZ(i, x - 0.01 * u * u, y - 0.012 * u * u, 0.03 * u * Math.sin(t * 5.2 + phase - u * 5.5));
      }
      fp.needsUpdate = true;
      fg.computeVertexNormals();
    },
  };
  return group;
}

/* ------------------------------------------------------------------ */
/* MARKET                                                              */
/* ------------------------------------------------------------------ */

function buildMarketGeos() {
  const k = new Kit();
  const M = 'mustard', Dm = 'dark', Cr = 'cream', V = 'roof';
  const HEX_PHI = Math.PI / 6;
  // hexagonal platform + deck
  k.add(Dm, lathe([[0, 0], [0.6, 0], [0.628, 0.025], [0.628, 0.07], [0.6, 0.095], [0, 0.095]], 6, HEX_PHI, 30));
  k.add(M, lathe([[0, 0.09], [0.56, 0.09], [0.56, 0.11], [0.545, 0.125], [0, 0.125]], 6, HEX_PHI, 30));
  // six posts
  for (let i = 0; i < 6; i++) {
    const phi = HEX_PHI + (i * TAU) / 6;
    const post = lathe([[0, 0.12], [0.038, 0.12], [0.038, 0.15], [0.025, 0.17], [0.023, 0.6], [0, 0.62]], 8, 0, 40);
    k.add(Dm, xf(post, 0.4 * Math.sin(phi), 0, 0.4 * Math.cos(phi)));
  }
  // centre pole
  k.add(Dm, xf(new THREE.CylinderGeometry(0.028, 0.034, 0.6, 8), 0, 0.42, 0));

  // striped tent roof: 12 flat panels, alternating mustard and cream
  const segs = 12;
  const roof = new THREE.LatheGeometry(
    [[0, 0.68], [0.47, 0.555], [0.5, 0.55], [0.505, 0.62], [0.42, 0.69], [0.3, 0.79], [0.17, 0.9], [0.07, 0.99], [0, 1.04]].map(
      ([r, y]) => new THREE.Vector2(r, y),
    ),
    segs,
    0,
  );
  const roofG = creaseNormals(roof, 22);
  const cm = new THREE.Color(PAL.mustard), cc = new THREE.Color(PAL.cream);
  {
    const pos = roofG.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    for (let t = 0; t < pos.count / 3; t++) {
      let sx = 0, sz = 0;
      for (let j = 0; j < 3; j++) {
        sx += pos.getX(3 * t + j);
        sz += pos.getZ(3 * t + j);
      }
      let ang = Math.atan2(sx, sz);
      if (ang < 0) ang += TAU;
      const c = Math.floor((ang / TAU) * segs) % 2 ? cc : cm;
      for (let j = 0; j < 3; j++) {
        cols[(3 * t + j) * 3] = c.r;
        cols[(3 * t + j) * 3 + 1] = c.g;
        cols[(3 * t + j) * 3 + 2] = c.b;
      }
    }
    roofG.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  k.add(V, roofG);
  // scalloped valance, one scallop per panel in the panel's colour
  for (let i = 0; i < segs; i++) {
    const phi = ((i + 0.5) * TAU) / segs;
    const s = new THREE.Shape();
    s.moveTo(-0.12, 0);
    s.lineTo(0.12, 0);
    s.quadraticCurveTo(0.11, -0.055, 0, -0.07);
    s.quadraticCurveTo(-0.11, -0.055, -0.12, 0);
    const flap = extrude(s, 0.01, 0.005, 1, 4, 40);
    const r = 0.505 * Math.cos(Math.PI / segs) + 0.006;
    k.add(V, paint(onRing(flap, phi, r, 0.57, 0.05), i % 2 ? PAL.cream : PAL.mustard));
  }
  // finial with pennant
  k.add(Cr, paint(xf(new THREE.SphereGeometry(0.04, 10, 8), 0, 1.05, 0), PAL.cream));
  k.add(Dm, xf(new THREE.CylinderGeometry(0.008, 0.01, 0.16, 6), 0, 1.12, 0));
  {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.13, -0.025);
    s.lineTo(0, -0.06);
    s.closePath();
    k.add(M, xf(extrude(s, 0.008, 0.004, 1, 1, 30), 0.005, 1.2, 0, 0, 0.35, 0));
  }

  // counter at the front, poking out from under the awning, with wares
  k.add(Dm, xf(chamferBox(0.36, 0.15, 0.12, 0.018), 0, 0.2, 0.42));
  k.add(M, xf(chamferBox(0.4, 0.025, 0.15, 0.008), 0, 0.285, 0.42));
  const wares = [[-0.13, 0.03, PAL.cream], [-0.06, 0.03, '#b4462a'], [0.01, 0.028, '#b4462a'], [0.09, 0.033, PAL.cream], [-0.1, 0.025, '#6f8a3a'], [0.14, 0.026, '#6f8a3a']];
  wares.forEach(([x, r, c], i) => {
    k.add(Cr, paint(xf(new THREE.SphereGeometry(r, 8, 6), x, 0.3 + r * 0.8, 0.395 + (i % 2) * 0.045), c));
  });
  // crates stacked on the right, barrels and a sack on the left
  const crate = (x, y, z, s, ry) => {
    k.add(Dm, xf(chamferBox(s, s, s, 0.012), x, y + s / 2, z, 0, ry, 0));
    for (const face of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const brace = chamferBox(s * 1.2, 0.018, 0.012, 0.004);
      xf(brace, 0, 0, s / 2 + 0.004, 0, 0, Math.PI / 4);
      xf(brace, 0, 0, 0, 0, face, 0);
      xf(brace, x, y + s / 2, z, 0, ry, 0);
      k.add(M, brace);
    }
  };
  crate(0.5, 0.095, 0.12, 0.15, 0.25);
  crate(0.5, 0.245, 0.11, 0.11, 0.85);
  crate(0.47, 0.095, -0.12, 0.12, -0.2);
  const barrel = (x, z) => {
    const b = lathe([[0, 0], [0.058, 0], [0.07, 0.04], [0.073, 0.08], [0.07, 0.12], [0.058, 0.16], [0, 0.16]], 12, 0, 50);
    k.add(M, xf(b, x, 0.095, z));
    for (const y of [0.03, 0.13]) k.add(Dm, xf(new THREE.TorusGeometry(0.069, 0.008, 4, 12), x, 0.095 + y, z, Math.PI / 2, 0, 0));
  };
  barrel(-0.5, 0.14);
  barrel(-0.46, -0.04);
  k.add(Cr, paint(xf(rockGeo(0.07, 31, 1, 0.75, 0.1), -0.33, 0.15, 0.34), PAL.cream));
  return k.build();
}

export function makeMarket() {
  const geos = cachedGeos('market', buildMarketGeos);
  const group = new THREE.Group();
  group.name = 'Market';
  group.add(mesh(geos.mustard, plastic(PAL.mustard)));
  group.add(mesh(geos.dark, plastic(shade(PAL.mustard, 0.5))));
  group.add(mesh(geos.cream, cachedMat('market-cream-vc', () => new THREE.MeshPhysicalMaterial({ ...plasticParams('#ffffff'), vertexColors: true }))));
  group.add(mesh(geos.roof, cachedMat('market-roof-vc', () => new THREE.MeshPhysicalMaterial({ ...plasticParams('#ffffff'), vertexColors: true, side: THREE.DoubleSide }))));
  group.userData = { kind: 'market' };
  return group;
}

/* ------------------------------------------------------------------ */
/* SHRINE                                                              */
/* ------------------------------------------------------------------ */

function buildShrineGeos() {
  const k = new Kit();
  const I = 'ivory';
  // three round steps
  k.add(I, lathe([[0, 0], [0.6, 0], [0.62, 0.02], [0.62, 0.045], [0.6, 0.06], [0, 0.06]], 28, 0, 35));
  k.add(I, lathe([[0, 0.06], [0.53, 0.06], [0.55, 0.075], [0.55, 0.105], [0.53, 0.12], [0, 0.12]], 28, 0, 35));
  k.add(I, lathe([[0, 0.12], [0.46, 0.12], [0.48, 0.135], [0.48, 0.165], [0.46, 0.18], [0, 0.18]], 28, 0, 35));
  // six columns
  for (let i = 0; i < 6; i++) {
    const phi = Math.PI / 6 + (i * TAU) / 6;
    const col = lathe(
      [[0, 0.18], [0.068, 0.18], [0.068, 0.205], [0.058, 0.215], [0.06, 0.232], [0.045, 0.245], [0.043, 0.5], [0.038, 0.83], [0.05, 0.845], [0.062, 0.865], [0.07, 0.87], [0.07, 0.895], [0, 0.895]],
      12, 0, 38,
    );
    k.add(I, xf(col, 0.38 * Math.sin(phi), 0, 0.38 * Math.cos(phi)));
  }
  // entablature ring (closed profile so the underside exists)
  k.add(I, lathe([[0.3, 0.89], [0.47, 0.89], [0.49, 0.905], [0.49, 0.955], [0.47, 0.97], [0.3, 0.97], [0.3, 0.89]], 28, 0, 35));
  // dome
  const dome = [];
  dome.push([0, 0.955], [0.44, 0.955], [0.445, 0.985]);
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    dome.push([0.41 * Math.cos(a), 0.985 + 0.23 * Math.sin(a)]);
  }
  k.add(I, lathe(dome, 28, 0, 40));
  // dome ribs
  for (let i = 0; i < 6; i++) {
    const phi = (i * TAU) / 6;
    const pts = [];
    for (let j = 0; j <= 6; j++) {
      const a = (j / 6) * (Math.PI / 2) * 0.86;
      const r = 0.415 * Math.cos(a);
      pts.push([r * Math.sin(phi), 0.985 + 0.235 * Math.sin(a), r * Math.cos(phi)]);
    }
    k.add(I, taperTube(pts, 0.018, 0.012, 8, 5));
  }
  // finial
  k.add(I, lathe([[0, 1.2], [0.06, 1.2], [0.06, 1.22], [0.035, 1.235], [0.04, 1.255], [0.045, 1.275], [0.035, 1.295], [0.01, 1.3], [0.008, 1.34], [0, 1.37]], 10, 0, 40));
  // altar / brazier
  k.add(I, lathe([[0, 0.18], [0.1, 0.18], [0.1, 0.2], [0.06, 0.215], [0.04, 0.24], [0.04, 0.27], [0.085, 0.295], [0.1, 0.32], [0.09, 0.325], [0, 0.31]], 14, 0, 40));
  return k.build();
}

export function makeShrine() {
  const geos = cachedGeos('shrine', buildShrineGeos);
  const group = new THREE.Group();
  group.name = 'Shrine';
  group.add(mesh(geos.ivory, plastic(PAL.ivory, { clearcoat: 0.7, roughness: 0.34 })));

  const flameGeo = cachedGeos('shrine-flame', () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const y = t * 0.24;
      const r = 0.068 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.25)), 0.8) * (1 - t * 0.55);
      pts.push([Math.max(0, r), y]);
    }
    pts[pts.length - 1][0] = 0;
    return lathe(pts, 10, 0, 60);
  });
  const flameMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ff8a1a'),
    emissive: new THREE.Color('#ffb84a'),
    emissiveIntensity: 1.0,
    roughness: 0.4,
    transparent: true,
    opacity: 0.88,
  });
  const flame = mesh(flameGeo, flameMat, false, false);
  flame.position.y = 0.3;
  flame.renderOrder = 1;
  group.add(flame);
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.flame) });
  const core = mesh(cachedGeos('shrine-orb', () => new THREE.SphereGeometry(0.036, 12, 8)), coreMat, false, false);
  core.position.y = 0.35;
  core.scale.set(1, 1.4, 1);
  group.add(core);
  // warm pool of light on the floor under the flame (fake bounce light)
  const pool = new THREE.Mesh(
    cachedGeos('shrine-pool', () => new THREE.CircleGeometry(0.46, 24).rotateX(-Math.PI / 2)),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color('#ff9a2e'), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  pool.position.y = 0.183;
  pool.renderOrder = 2;
  group.add(pool);
  const halo = makeHalo('#ffa83a', 0.9, 0.6);
  halo.position.y = 0.38;
  group.add(halo);
  const phase = Math.random() * TAU;

  group.userData = {
    kind: 'shrine',
    flame,
    halo,
    update(t) {
      const f = 1 + 0.08 * Math.sin(t * 7.3 + phase) + 0.05 * Math.sin(t * 13.1 + phase * 2);
      flame.scale.set(1 / Math.sqrt(f), f, 1 / Math.sqrt(f));
      flame.rotation.y = t * 0.8;
      flame.rotation.z = 0.06 * Math.sin(t * 3.1 + phase);
      flameMat.emissiveIntensity = 1.0 * f;
      halo.material.opacity = 0.6 * f;
      pool.material.opacity = 0.42 * f;
    },
  };
  return group;
}

/* ------------------------------------------------------------------ */
/* BARROW                                                              */
/* ------------------------------------------------------------------ */

const MOUND_TOP = 0.56;

function buildBarrowGeos() {
  const k = new Kit();
  const M = 'mound', S = 'stone', Dd = 'door';
  // broad tumulus (superellipse profile) with gentle lumps and a forecourt
  // scooped out of the front (+z) for the doorway
  const R = 0.7;
  const prof = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 at the rim, 1 at the top
    const r = R * Math.cos((t * Math.PI) / 2);
    const y = MOUND_TOP * Math.pow(1 - Math.pow(r / R, 2.4), 1 / 2.4);
    prof.push(new THREE.Vector2(Math.max(r, 0), y));
  }
  prof.unshift(new THREE.Vector2(0, 0));
  const g = new THREE.LatheGeometry(prof, 28, 0);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rxz = Math.hypot(x, z) / R;
    const th = Math.atan2(x, z);
    const h = y / MOUND_TOP;
    const lump = 1 + 0.05 * Math.sin(2 * th + 0.7) * Math.sin(h * 3 + 0.4) + 0.03 * Math.sin(3 * th + 2.1) * rxz;
    const front = Math.exp(-Math.pow(th / 0.5, 2));
    const cut = 1 - 0.38 * front * (1 - 0.6 * h * h);
    const ny = y * (1 + 0.06 * rxz * rxz * Math.sin(2 * th + 1.2));
    pos.setXYZ(i, x * lump * cut, ny, z * 0.97 * lump * cut);
  }
  k.add(M, creaseNormals(g, 60));
  // trilithon doorway at the front of the forecourt
  const dz = 0.5;
  k.add(Dd, xf(chamferBox(0.22, 0.33, 0.3, 0.01), 0, 0.165, dz - 0.14));
  k.add(S, xf(chamferBox(0.1, 0.36, 0.11, 0.022, 2), -0.155, 0.18, dz, 0, 0.05, 0.035));
  k.add(S, xf(chamferBox(0.1, 0.36, 0.11, 0.022, 2), 0.155, 0.18, dz, 0, -0.05, -0.035));
  k.add(S, xf(chamferBox(0.46, 0.095, 0.14, 0.024, 2), 0, 0.395, dz + 0.005, 0, 0, 0.02));
  k.add(S, xf(chamferBox(0.38, 0.03, 0.16, 0.01), 0, 0.012, dz + 0.1));
  // forecourt walls: stepped kerb stones flanking the door
  k.add(S, xf(chamferBox(0.13, 0.25, 0.1, 0.022), -0.29, 0.12, dz - 0.04, 0, 0.55, 0.05));
  k.add(S, xf(chamferBox(0.12, 0.17, 0.1, 0.022), -0.4, 0.08, dz - 0.12, 0, 0.85, 0.03));
  k.add(S, xf(chamferBox(0.13, 0.23, 0.1, 0.022), 0.29, 0.11, dz - 0.04, 0, -0.55, -0.05));
  k.add(S, xf(chamferBox(0.12, 0.16, 0.1, 0.022), 0.4, 0.075, dz - 0.12, 0, -0.85, -0.03));
  // standing stones
  k.add(S, xf(chamferBox(0.11, 0.44, 0.085, 0.025, 2), -0.55, 0.21, 0.38, 0.06, 0.6, 0.09));
  k.add(S, xf(chamferBox(0.1, 0.33, 0.08, 0.025, 2), 0.57, 0.155, 0.34, -0.05, -0.7, -0.12));
  k.add(S, xf(chamferBox(0.2, 0.06, 0.09, 0.02), 0.62, 0.03, 0.06, 0, 1.1, 0));
  // ring of low kerb stones around the foot of the mound (back half)
  for (let i = 0; i < 9; i++) {
    const th = Math.PI * 0.42 + (i / 8) * Math.PI * 1.16;
    const r = 0.69;
    k.add(S, xf(rockGeo(0.055 + (i % 3) * 0.01, 200 + i, 0, 0.75, 0.18), Math.sin(th) * r * 1.02, 0.015, Math.cos(th) * r * 0.98, 0, th, 0));
  }
  // little cairn on top
  k.add(S, xf(rockGeo(0.065, 51, 0, 0.8, 0.15), 0.02, MOUND_TOP - 0.01, -0.06));
  k.add(S, xf(rockGeo(0.05, 52, 0, 0.8, 0.15), -0.07, MOUND_TOP - 0.025, 0.0));
  k.add(S, xf(rockGeo(0.045, 53, 0, 0.9, 0.15), 0.03, MOUND_TOP + 0.045, -0.04));
  return k.build();
}

function gemMaterial(hex, looted = false) {
  const col = hexOf(hex);
  const c = looted ? desaturate(col, 0.75, 0.6) : col;
  return cachedMat(`gem${col}${looted}`, () =>
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(c),
      emissive: new THREE.Color(c),
      emissiveIntensity: looted ? 0.12 : 0.65,
      roughness: 0.15,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMap: studioEnv(),
      envMapIntensity: 1.2,
      flatShading: true,
    }),
  );
}

function gemGeometry() {
  return cachedGeos('shard-gem', () => crystalGeo(0.11, 0.17, 0.05, 0.13, 6, 21, 0.12, 0.2));
}

export function makeBarrow() {
  const geos = cachedGeos('barrow', buildBarrowGeos);
  const group = new THREE.Group();
  group.name = 'Barrow';
  const moundMat = plastic(PAL.barrow, { roughness: 0.48, clearcoat: 0.35 });
  const moundLooted = plastic(desaturate(PAL.barrow, 0.45, 0.72), { roughness: 0.55, clearcoat: 0.25 });
  const stoneMat = plastic(shade(PAL.barrow, 1.22), { roughness: 0.45, clearcoat: 0.4 });
  const stoneLooted = plastic(desaturate(shade(PAL.barrow, 1.22), 0.45, 0.75), { roughness: 0.55, clearcoat: 0.3 });
  const doorMat = plastic(PAL.barrowDoor, { roughness: 0.8, clearcoat: 0.05 });
  const doorLooted = plastic('#141612', { roughness: 0.9, clearcoat: 0.0 });
  const mound = mesh(geos.mound, moundMat);
  const stones = mesh(geos.stone, stoneMat);
  const door = mesh(geos.door, doorMat);
  group.add(mound, stones, door);

  // floating sigil
  const sigil = new THREE.Group();
  sigil.position.y = MOUND_TOP + 0.5;
  group.add(sigil);
  const unknownMat = cachedMat('sigil-unknown', () =>
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#4a4852'),
      emissive: new THREE.Color('#6a5a8a'),
      emissiveIntensity: 0.12,
      roughness: 0.45,
      clearcoat: 0.5,
      envMap: studioEnv(),
      envMapIntensity: 0.8,
      flatShading: true,
    }),
  );
  const unknown = mesh(cachedGeos('sigil-octa', () => new THREE.OctahedronGeometry(0.12, 0)), unknownMat, true, false);
  unknown.scale.set(0.85, 1.25, 0.85);
  const gem = mesh(gemGeometry(), gemMaterial('#ffffff'), true, false);
  gem.position.y = -0.1;
  const halo = makeHalo('#ffffff', 0.7, 0.4);
  sigil.add(unknown, gem, halo);

  const state = { shardId: null, color: '#ffffff', looted: false };
  const phase = Math.random() * TAU;
  const refresh = () => {
    const known = state.shardId != null;
    unknown.visible = !known;
    gem.visible = known;
    halo.visible = known && !state.looted;
    if (known) {
      gem.material = gemMaterial(state.color, state.looted);
      halo.material.color.set(state.color);
    }
    mound.material = state.looted ? moundLooted : moundMat;
    stones.material = state.looted ? stoneLooted : stoneMat;
    door.material = state.looted ? doorLooted : doorMat;
  };

  group.userData = {
    kind: 'barrow',
    sigil,
    setSigil(shardId, colorHex) {
      state.shardId = shardId == null ? null : shardId;
      if (colorHex != null) state.color = hexOf(colorHex);
      refresh();
    },
    setLooted(b) {
      state.looted = !!b;
      refresh();
    },
    update(t) {
      sigil.position.y = MOUND_TOP + 0.5 + 0.05 * Math.sin(t * 1.6 + phase);
      sigil.rotation.y = t * 0.9 + phase;
      unknown.rotation.x = 0.25 * Math.sin(t * 0.7 + phase);
    },
  };
  refresh();
  return group;
}

/* ------------------------------------------------------------------ */
/* PAWN                                                                */
/* ------------------------------------------------------------------ */

function buildPawnGeos() {
  const k = new Kit();
  const Bd = 'body', Bs = 'base', P = 'pennant';
  // bevelled base disc
  k.add(Bs, lathe([[0, 0], [0.27, 0], [0.288, 0.015], [0.288, 0.05], [0.272, 0.066], [0.21, 0.072], [0, 0.076]], 32, 0, 35));
  // cloaked body with sculpted drapery folds
  const prof = [[0, 0.07], [0.2, 0.07], [0.212, 0.085], [0.205, 0.11], [0.18, 0.17], [0.155, 0.26], [0.135, 0.35], [0.12, 0.43], [0.118, 0.47], [0.125, 0.52], [0.133, 0.57], [0.136, 0.6], [0.125, 0.635], [0.095, 0.66], [0.06, 0.675], [0.045, 0.69], [0, 0.7]];
  const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28, 0);
  {
    const pos = body.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const th = Math.atan2(x, z);
      const amp = 0.075 * (1 - smoothstep(0.1, 0.46, y)) + 0.012;
      // folds, deeper at the back; a front opening of the cloak
      const fold = Math.sin(7 * th + 0.4) * amp * (0.7 + 0.3 * Math.cos(th + Math.PI));
      const f = 1 + fold;
      pos.setXYZ(i, x * f, y, z * f * 0.86);
    }
  }
  k.add(Bd, creaseNormals(body, 55));
  // belt
  k.add(Bd, xf(new THREE.TorusGeometry(0.12, 0.013, 6, 24), 0, 0.45, 0, Math.PI / 2, 0, 0, 1, 0.86, 1));
  k.add(Bd, xf(chamferBox(0.05, 0.04, 0.02, 0.006), 0, 0.45, 0.105));
  // cloak collar
  k.add(Bd, xf(new THREE.TorusGeometry(0.075, 0.02, 6, 18), 0, 0.665, 0, Math.PI / 2, 0, 0, 1, 0.9, 1));
  // pauldrons
  for (const sx of [-1, 1]) {
    const p = new THREE.SphereGeometry(0.062, 12, 8, 0, TAU, 0, Math.PI * 0.6);
    k.add(Bd, xf(p, sx * 0.112, 0.6, 0, 0, 0, sx * -0.35, 1, 0.8, 1));
  }
  // right arm (figure's right is -x when facing +z) raised to hold the spear
  const capsule = (a, b, r) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const g = new THREE.CapsuleGeometry(r, len, 3, 8);
    const dir = B.clone().sub(A).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.applyQuaternion(q);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    return g;
  };
  k.add(Bd, capsule([-0.12, 0.58, 0], [-0.165, 0.48, 0.03], 0.034));
  k.add(Bd, capsule([-0.165, 0.48, 0.03], [-0.178, 0.49, 0.075], 0.03));
  k.add(Bd, xf(new THREE.SphereGeometry(0.033, 10, 8), -0.178, 0.49, 0.08));
  // left arm with a round shield
  k.add(Bd, capsule([0.12, 0.58, 0], [0.16, 0.44, 0.04], 0.032));
  {
    const sh = lathe([[0, 0.035], [0.035, 0.034], [0.04, 0.026], [0.1, 0.018], [0.112, 0.008], [0.112, 0], [0.1, -0.004], [0, -0.004]], 20, 0, 40);
    xf(sh, 0, 0, 0, Math.PI / 2, 0, 0);
    k.add(Bd, xf(sh, 0.185, 0.43, 0.06, 0, 0.75, 0));
    const boss = new THREE.SphereGeometry(0.03, 10, 6, 0, TAU, 0, Math.PI / 2);
    xf(boss, 0, 0, 0, Math.PI / 2, 0, 0);
    k.add(Bd, xf(boss, 0.185 + 0.035 * Math.sin(0.75), 0.43, 0.06 + 0.035 * Math.cos(0.75), 0, 0.75, 0));
  }
  // head and helm
  k.add(Bd, xf(new THREE.SphereGeometry(0.073, 16, 12), 0, 0.76, 0));
  k.add(Bd, xf(new THREE.SphereGeometry(0.081, 16, 8, 0, TAU, 0, Math.PI * 0.55), 0, 0.77, -0.004));
  k.add(Bd, xf(new THREE.TorusGeometry(0.079, 0.009, 4, 20), 0, 0.763, -0.004, Math.PI / 2 + 0.12, 0, 0));
  // crest
  {
    const s = new THREE.Shape();
    s.moveTo(-0.075, 0.0);
    s.quadraticCurveTo(-0.07, 0.07, 0.0, 0.085);
    s.quadraticCurveTo(0.06, 0.08, 0.075, 0.03);
    s.lineTo(0.06, 0.0);
    s.closePath();
    const crest = extrude(s, 0.016, 0.006, 1, 6, 40);
    xf(crest, 0, 0, 0, 0, Math.PI / 2, 0);
    k.add(Bd, xf(crest, 0, 0.808, -0.005));
  }
  k.add(Bd, xf(chamferBox(0.016, 0.06, 0.02, 0.005), 0, 0.75, 0.077));
  // spear: shaft, collar, leaf-shaped head
  const sx = -0.178, sz = 0.08;
  k.add(Bd, xf(new THREE.CylinderGeometry(0.011, 0.012, 0.8, 6), sx, 0.07 + 0.4, sz));
  k.add(Bd, xf(new THREE.CylinderGeometry(0.018, 0.016, 0.03, 8), sx, 0.865, sz));
  {
    const head = lathe([[0, 0.875], [0.016, 0.88], [0.03, 0.91], [0.024, 0.94], [0, 0.98]], 4, 0, 20);
    xf(head, 0, 0, 0, 0, Math.PI / 4, 0, 1, 1, 0.55);
    k.add(Bd, xf(head, sx, 0, sz));
  }
  // pennant (bent triangular streamer) streaming outward from the shaft
  {
    const v = [];
    const n = 5;
    const L = 0.135, H = 0.065;
    const pt = (u, s) => {
      const x = -u * L;
      const y = 0.82 - H / 2 + s * H * (1 - u) + (H / 2) * u - 0.015 * u;
      const z = 0.018 * Math.sin(u * Math.PI * 1.4);
      return [sx + x, y, sz + z];
    };
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      const a = pt(u0, 0), b = pt(u1, 0), c = pt(u1, 1), d = pt(u0, 1);
      v.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    k.add(P, creaseNormals(g, 60));
  }
  return k.build();
}

export function makePawn(colorHex = '#c8262f') {
  const geos = cachedGeos('pawn', buildPawnGeos);
  const col = hexOf(colorHex);
  const group = new THREE.Group();
  group.name = 'Pawn';
  // per-instance materials so highlighting one pawn never touches another
  const bodyMat = new THREE.MeshPhysicalMaterial(plasticParams(col, { roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.3 }));
  const baseMat = new THREE.MeshPhysicalMaterial(plasticParams(shade(col, 0.5), { roughness: 0.36, clearcoat: 0.7 }));
  const penMat = new THREE.MeshPhysicalMaterial(plasticParams(col, { side: THREE.DoubleSide }));
  group.add(mesh(geos.body, bodyMat));
  group.add(mesh(geos.base, baseMat));
  group.add(mesh(geos.pennant, penMat));
  const mats = [bodyMat, baseMat, penMat];
  group.userData = {
    kind: 'pawn',
    color: col,
    highlighted: false,
    setHighlight(on) {
      group.userData.highlighted = !!on;
      for (const m of mats) {
        m.emissive.set(on ? col : '#000000');
        m.emissiveIntensity = on ? 0.35 : 0;
      }
    },
  };
  return group;
}

/* ------------------------------------------------------------------ */
/* DECORATIONS                                                         */
/* ------------------------------------------------------------------ */

const DECOR = {
  trunk: '#5e4632',
  pine: '#3c6440',
  pineSnow: '#355a47',
  snow: '#eef2f4',
  oak: '#58803f',
  oakDark: '#486c34',
  dead: '#8c8781',
  reed: '#7c8a4b',
  reedLeaf: '#66783e',
  cattail: '#5b3b23',
  mud: '#4d4a3a',
  rock: '#7e7b74',
  darkRock: '#3a302d',
  ember: '#ff8a2a',
  cactus: '#5f8046',
  sand: '#b8996a',
  capRed: '#a83c2e',
  stem: '#e5dbc3',
};

function decoTrunk(k, role, h, r0, r1) {
  k.add(role, lathe([[0, -0.01], [r0 * 1.35, -0.01], [r0 * 1.1, 0.03], [r0, 0.06], [r1, h], [0, h]], 7, 0, 50));
}

const DECOR_BUILDERS = {
  pine() {
    const k = new Kit();
    decoTrunk(k, 'trunk', 0.16, 0.04, 0.03);
    const tiers = [[0.25, 0.3, 0.09], [0.2, 0.27, 0.25], [0.14, 0.24, 0.41]];
    tiers.forEach(([r, h, y], i) => {
      const c = new THREE.ConeGeometry(r, h, 8, 1);
      xf(c, 0.004 * i, y + h / 2, 0, 0, i * 0.4, 0);
      k.add('green', creaseNormals(c, 30));
    });
    return k.build();
  },
  snowpine() {
    const k = new Kit();
    decoTrunk(k, 'trunk', 0.16, 0.04, 0.03);
    const tiers = [[0.25, 0.3, 0.09], [0.2, 0.27, 0.25], [0.14, 0.24, 0.41]];
    const green = new THREE.Color(DECOR.pineSnow), white = new THREE.Color(DECOR.snow);
    tiers.forEach(([r, h, y], i) => {
      const c = creaseNormals(new THREE.ConeGeometry(r, h, 8, 3), 30);
      const pos = c.getAttribute('position');
      const cols = new Float32Array(pos.count * 3);
      for (let t = 0; t < pos.count / 3; t++) {
        let cy = 0, cx = 0, cz = 0;
        for (let j = 0; j < 3; j++) {
          cx += pos.getX(3 * t + j) / 3;
          cy += pos.getY(3 * t + j) / 3;
          cz += pos.getZ(3 * t + j) / 3;
        }
        const seg = Math.floor(((Math.atan2(cx, cz) + Math.PI) / TAU) * 8);
        const thresh = -h * 0.08 + (seg % 2 ? 0.0 : -h * 0.22);
        const c2 = cy > thresh || (cy > -h * 0.5 && Math.abs(Math.hypot(cx, cz)) < 0.001) ? white : green;
        for (let j = 0; j < 3; j++) {
          cols[(3 * t + j) * 3] = c2.r;
          cols[(3 * t + j) * 3 + 1] = c2.g;
          cols[(3 * t + j) * 3 + 2] = c2.b;
        }
      }
      c.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      xf(c, 0.004 * i, y + h / 2, 0, 0, i * 0.4, 0);
      k.add('vc', c);
    });
    // snow on the ground
    k.add('snow', xf(rockGeo(0.12, 77, 1, 0.25, 0.1), 0.08, 0.0, 0.06));
    return k.build();
  },
  oak() {
    const k = new Kit();
    k.add('trunk', lathe([[0, -0.01], [0.075, -0.01], [0.055, 0.03], [0.042, 0.08], [0.036, 0.24], [0.05, 0.3], [0, 0.32]], 8, 0, 50));
    k.add('trunk', taperTube([[0.0, 0.2, 0], [0.07, 0.28, 0.02], [0.12, 0.33, 0.03]], 0.025, 0.012, 4, 5));
    const blobs = [[0, 0.46, 0, 0.19, 1], [0.12, 0.4, 0.05, 0.13, 2], [-0.12, 0.41, 0.04, 0.14, 3], [0.02, 0.4, -0.11, 0.14, 4], [0.04, 0.56, 0.02, 0.12, 5]];
    for (const [x, y, z, r, s] of blobs) {
      const g = new THREE.IcosahedronGeometry(r, 1);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
        const f = 1 + 0.12 * Math.sin(px * 31 + s) * Math.sin(py * 27 + s * 2) * Math.sin(pz * 29 + s * 3);
        pos.setXYZ(i, px * f, py * f * 0.85, pz * f);
      }
      k.add(s % 2 ? 'green' : 'green2', xf(creaseNormals(g, 48), x, y, z));
    }
    return k.build();
  },
  deadtree() {
    const k = new Kit();
    k.add('wood', taperTube([[0, -0.02, 0], [0.02, 0.15, 0.01], [-0.02, 0.3, -0.01], [0.03, 0.45, 0.0], [0.02, 0.56, 0.02]], 0.05, 0.012, 10, 6));
    k.add('wood', lathe([[0, -0.01], [0.09, -0.01], [0.05, 0.04], [0, 0.07]], 6, 0.3, 50));
    const br = [
      [[0.0, 0.26, 0], [0.09, 0.33, 0.02], [0.17, 0.42, 0.0], [0.2, 0.5, -0.02]],
      [[0.0, 0.34, 0], [-0.08, 0.4, 0.03], [-0.15, 0.46, 0.06], [-0.2, 0.47, 0.08]],
      [[0.01, 0.42, 0], [0.0, 0.5, -0.08], [-0.04, 0.58, -0.12]],
      [[-0.01, 0.17, 0], [-0.08, 0.23, -0.04], [-0.12, 0.3, -0.04]],
    ];
    br.forEach((pts, i) => k.add('wood', taperTube(pts, 0.022 - i * 0.002, 0.005, 6, 5)));
    // twigs
    k.add('wood', taperTube([[0.17, 0.42, 0.0], [0.22, 0.43, 0.04], [0.26, 0.42, 0.05]], 0.01, 0.003, 3, 4));
    k.add('wood', taperTube([[-0.15, 0.46, 0.06], [-0.16, 0.53, 0.04], [-0.15, 0.58, 0.05]], 0.009, 0.003, 3, 4));
    return k.build();
  },
  reeds() {
    const k = new Kit();
    k.add('mud', xf(rockGeo(0.2, 9, 1, 0.22, 0.1), 0, 0, 0));
    const rand = mulberry32(42);
    for (let i = 0; i < 11; i++) {
      const a = rand() * TAU;
      const r = 0.03 + rand() * 0.13;
      const h = 0.32 + rand() * 0.22;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const tx = Math.sin(a) * 0.12 + (rand() - 0.5) * 0.1;
      const tz = Math.cos(a) * 0.12 + (rand() - 0.5) * 0.1;
      const stalk = new THREE.ConeGeometry(0.011, h, 4, 1);
      xf(stalk, 0, h / 2, 0);
      xf(stalk, x, 0.01, z, tz * 1.2, 0, -tx * 1.2);
      k.add(i % 3 === 0 ? 'leaf' : 'stalk', stalk);
      if (i % 3 === 1) {
        const head = new THREE.CapsuleGeometry(0.019, 0.06, 2, 6);
        xf(head, 0, h * 0.82, 0);
        xf(head, x, 0.01, z, tz * 1.2, 0, -tx * 1.2);
        k.add('head', head);
      }
    }
    // a couple of broad leaves
    for (const [a, h] of [[0.6, 0.28], [2.6, 0.24], [4.4, 0.3]]) {
      const leaf = new THREE.ConeGeometry(0.03, h, 3, 1);
      xf(leaf, 0, h / 2, 0, 0, 0, 0, 1, 1, 0.3);
      xf(leaf, Math.sin(a) * 0.06, 0, Math.cos(a) * 0.06, Math.cos(a) * 0.35, a, 0);
      k.add('leaf', creaseNormals(leaf, 20));
    }
    return k.build();
  },
  rock() {
    const k = new Kit();
    k.add('rock', xf(rockGeo(0.2, 3, 1, 0.95, 0.2), -0.02, 0.13, -0.02));
    k.add('rock', xf(rockGeo(0.11, 8, 0, 0.8, 0.2), 0.17, 0.04, 0.12));
    k.add('rock', xf(rockGeo(0.065, 13, 0, 0.75, 0.2), -0.17, 0.025, 0.14));
    return k.build();
  },
  crystalrock() {
    const k = new Kit();
    k.add('rock', xf(rockGeo(0.19, 17, 1, 0.65, 0.25), 0, 0.06, 0));
    k.add('rock', xf(rockGeo(0.09, 19, 0, 0.7, 0.2), 0.17, 0.02, -0.1));
    const cr = [[0.0, 0.1, 0.0, 0.05, 0.16, 0.12, 0.1], [0.08, 0.08, 0.06, 0.035, 0.11, -0.5, 0.4], [-0.08, 0.07, 0.04, 0.03, 0.1, 0.4, 0.7], [0.02, 0.06, -0.09, 0.03, 0.09, -0.6, -0.3], [0.17, 0.06, -0.1, 0.022, 0.07, -0.3, 0.6]];
    cr.forEach(([x, y, z, r, h, rz, rx], i) => {
      const g = crystalGeo(r, r * 0.6, h, r * 1.6, 6, 60 + i, 0.15, 0.1);
      k.add('crystal', xf(g, x, y, z, rx, i * 0.7, rz));
    });
    return k.build();
  },
  cactus() {
    const k = new Kit();
    k.add('sand', xf(rockGeo(0.16, 23, 1, 0.2, 0.08), 0, 0.0, 0));
    const ribbed = (h, r) => {
      const prof = [[0, 0], [r, 0], [r, (h - r) * 0.5], [r, h - r]];
      for (let i = 1; i <= 5; i++) {
        const a = (i / 5) * (Math.PI / 2);
        prof.push([Math.max(r * Math.cos(a), 0.0), h - r + r * Math.sin(a)]);
      }
      const g = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 16, 0);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const f = 1 + 0.13 * Math.cos(8 * Math.atan2(x, z));
        pos.setXYZ(i, x * f, y, z * f);
      }
      return creaseNormals(g, 50);
    };
    k.add('green', ribbed(0.58, 0.062));
    const arm = (sx, y0, y1, out) => {
      k.add('green', taperTube([[0, y0, 0], [sx * out * 0.7, y0 + 0.01, 0], [sx * out, y0 + 0.07, 0], [sx * out, y1, 0]], 0.043, 0.04, 8, 8));
      k.add('green', xf(new THREE.SphereGeometry(0.04, 10, 6, 0, TAU, 0, Math.PI / 2), sx * out, y1, 0));
    };
    arm(1, 0.22, 0.42, 0.14);
    arm(-1, 0.3, 0.45, 0.12);
    return k.build();
  },
  mushroom() {
    const k = new Kit();
    const shroom = (x, z, s, tilt) => {
      const stem = lathe([[0, 0], [0.05, 0], [0.042, 0.03], [0.034, 0.12], [0.03, 0.2], [0, 0.2]], 8, 0, 50);
      const capTop = [];
      for (let i = 0; i <= 5; i++) {
        const a = (i / 5) * (Math.PI / 2);
        capTop.push([0.15 * Math.cos(a), 0.19 + 0.1 * Math.sin(a)]);
      }
      const cap = lathe([[0.155, 0.175], ...capTop], 14, 0, 45);
      const under = lathe([[0, 0.205], [0.035, 0.2], [0.15, 0.178], [0.155, 0.176]], 14, 0, 60);
      // spots
      const spots = [];
      for (let i = 0; i < (s > 0.8 ? 6 : 3); i++) {
        const a = i * 1.9 + 0.3;
        const el = 0.35 + (i % 3) * 0.32;
        const r = 0.15 * Math.cos(el);
        const y = 0.19 + 0.1 * Math.sin(el);
        const sp = new THREE.SphereGeometry(0.02 + (i % 2) * 0.008, 6, 3);
        xf(sp, 0, 0, 0, 0, 0, 0, 1, 0.35, 1);
        xf(sp, 0, 0, 0, -(Math.PI / 2 - el) * 0.9, 0, 0);
        spots.push(xf(sp, r * Math.sin(a), y, r * Math.cos(a), 0, a, 0));
      }
      for (const [role, g] of [['stem', stem], ['cap', cap], ['stem', under], ...spots.map((g) => ['stem', g])]) {
        k.add(role, xf(g, x, 0, z, tilt, 0, tilt * 0.5, s));
      }
    };
    shroom(0, 0, 1.05, 0.0);
    shroom(0.15, 0.1, 0.55, 0.2);
    shroom(-0.12, 0.12, 0.42, -0.25);
    k.add('moss', xf(rockGeo(0.16, 91, 1, 0.18, 0.1), 0.02, 0, 0.04));
    return k.build();
  },
};

const DECOR_MATS = {
  pine: { trunk: DECOR.trunk, green: DECOR.pine },
  snowpine: { trunk: DECOR.trunk, vc: 'vc', snow: DECOR.snow },
  oak: { trunk: DECOR.trunk, green: DECOR.oak, green2: DECOR.oakDark },
  deadtree: { wood: DECOR.dead },
  reeds: { mud: DECOR.mud, stalk: DECOR.reed, leaf: DECOR.reedLeaf, head: DECOR.cattail },
  rock: { rock: DECOR.rock },
  crystalrock: { rock: DECOR.darkRock, crystal: 'ember' },
  cactus: { sand: DECOR.sand, green: DECOR.cactus },
  mushroom: { stem: DECOR.stem, cap: DECOR.capRed, moss: '#4f6a3a' },
};

export function makeDecoration(kind) {
  if (!DECOR_BUILDERS[kind]) {
    console.warn(`makeDecoration: unknown kind "${kind}", using rock`);
    kind = 'rock';
  }
  const geos = cachedGeos(`decor-${kind}`, DECOR_BUILDERS[kind]);
  const mats = DECOR_MATS[kind];
  const group = new THREE.Group();
  group.name = `Decoration:${kind}`;
  for (const role of Object.keys(geos)) {
    const spec = mats[role];
    let mat;
    if (spec === 'vc') mat = matteVC();
    else if (spec === 'ember') mat = glowMat('#5a2410', DECOR.ember, 1.3, { roughness: 0.25, flatShading: true });
    else mat = matte(spec);
    group.add(mesh(geos[role], mat));
  }
  group.userData = { kind: 'decoration', decoration: kind };
  return group;
}

/* ------------------------------------------------------------------ */
/* SHARD GEM                                                           */
/* ------------------------------------------------------------------ */

export function makeShardGem(colorHex = '#f2b632') {
  const group = new THREE.Group();
  group.name = 'ShardGem';
  const gem = mesh(gemGeometry(), gemMaterial(colorHex), true, false);
  gem.position.y = 0.17; // bottom tip rests on y = 0, top at ~0.35
  group.add(gem);
  group.userData = {
    kind: 'gem',
    gem,
    update(t) {
      gem.rotation.y = t * 0.8;
    },
  };
  return group;
}

// A border watch-post: a squat stone tower beside the road where it leaves
// one province for the next, flying a pennant in both provinces' colours.
export function makeBorderPost(colorA, colorB) {
  const geos = cachedGeos('borderpost', () => {
    const tower = new THREE.CylinderGeometry(0.105, 0.13, 0.36, 8);
    tower.translate(0, 0.18, 0);
    const cap = new THREE.CylinderGeometry(0.15, 0.14, 0.06, 8);
    cap.translate(0, 0.39, 0);
    const merlons = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.BoxGeometry(0.06, 0.06, 0.06);
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      m.translate(Math.sin(a) * 0.115, 0.45, Math.cos(a) * 0.115);
      merlons.push(m);
    }
    const door = new THREE.BoxGeometry(0.06, 0.1, 0.02);
    door.translate(0, 0.05, 0.123);
    const pole = new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5);
    pole.translate(0, 0.6, 0);
    const half = (y0, y1) => {
      const s = new THREE.Shape();
      // The pennant tapers from the pole to a point at x = 0.22.
      const w = (y) => 0.22 * (1 - Math.abs(y - 0.7) / 0.07);
      s.moveTo(0, y0);
      s.lineTo(w(y0), y0);
      s.lineTo(w(y1), y1);
      s.lineTo(0, y1);
      s.closePath();
      return new THREE.ShapeGeometry(s);
    };
    return { stone: mergeGeos([tower, cap, ...merlons]), door, pole, top: half(0.7, 0.77), bottom: half(0.63, 0.7) };
  });
  const group = new THREE.Group();
  group.name = 'BorderPost';
  group.add(mesh(geos.stone, plastic('#8d8576', { roughness: 0.62, clearcoat: 0.2 })));
  group.add(mesh(geos.door, plastic('#2a1c13', { roughness: 0.7 }), false));
  group.add(mesh(geos.pole, plastic(PAL.brass, { roughness: 0.3, metalness: 0.6 })));
  const flag = (geo, hex) => {
    const m = mesh(geo, new THREE.MeshPhysicalMaterial({ ...plasticParams(hex, { roughness: 0.5 }), side: THREE.DoubleSide }), true, false);
    return m;
  };
  const pennant = new THREE.Group();
  pennant.add(flag(geos.top, colorA), flag(geos.bottom, colorB));
  group.add(pennant);
  group.userData.update = (t) => { pennant.rotation.y = Math.sin(t * 1.7 + group.position.x) * 0.25; };
  return group;
}
