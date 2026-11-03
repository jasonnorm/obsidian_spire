// Obsidian Spire: hi-res scenery and prop kit for the modern first-person mode.
//
// Stylised-realism models built procedurally from primitives, canvas-painted
// PBR textures (colour + normal maps) and baked vertex colours (ambient
// occlusion, tint). Units are metres, y is up, origin at ground centre.
//
//   makeVegetation(kind) -> [{ geometry, material }]  one merged geometry per
//                           material, all sharing one local origin, ready for
//                           THREE.InstancedMesh. Geometry is cached per kind.
//   makeProp(kind)       -> THREE.Group. Animated props carry
//                           userData.update(t) and, when lit, userData.light.
//   makeShard(id)        -> THREE.Group, 'sun' | 'moon' | 'star'.
//
// Lights flicker through light.color, never light.intensity, so a caller may
// dim or switch a light off (intensity = 0) without update(t) undoing it.
// Fire, spark and glow meshes set castShadow = false and userData.noShadow.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const VEGETATION = ['pine', 'snowpine', 'oak', 'deadtree', 'cactus', 'reeds', 'mushroom', 'rock', 'boulder', 'standingstone', 'grasstuft', 'bush'];
export const PROPS = ['campfire', 'torch', 'chest', 'chestopen', 'altar', 'signpost', 'crate', 'barrel', 'bannerCrimson', 'bannerAzure', 'well', 'cart', 'bones', 'brazier'];
export const SHARDS = ['sun', 'moon', 'star'];

/* ================================================================== maths */

const TAU = Math.PI * 2;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Permutation-table value noise: fast, allocation-free and deterministic.
const PERM = new Uint16Array(1024);
const VAL = new Float32Array(256);
{
  const r = mulberry32(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 1024; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) VAL[i] = r();
}

// Integer hash in [0, 1).
function hash(x, y, z, s) {
  return VAL[PERM[PERM[PERM[(x + s * 59) & 255] + ((y + s * 101) & 255)] + ((z + s * 37) & 255)]];
}

function noise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let u = x - xi, v = y - yi, w = z - zi;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
  const X = (xi + s * 59) & 255, Y = (yi + s * 101) & 255, Z = (zi + s * 37) & 255;
  const A = PERM[X] + Y, B = PERM[X + 1] + Y;
  const AA = PERM[A] + Z, AB = PERM[A + 1] + Z, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  const a0 = VAL[PERM[AA]], b0 = VAL[PERM[BA]], c0 = VAL[PERM[AB]], d0 = VAL[PERM[BB]];
  const a1 = VAL[PERM[AA + 1]], b1 = VAL[PERM[BA + 1]], c1 = VAL[PERM[AB + 1]], d1 = VAL[PERM[BB + 1]];
  const x00 = a0 + (b0 - a0) * u, x10 = c0 + (d0 - c0) * u, x01 = a1 + (b1 - a1) * u, x11 = c1 + (d1 - c1) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

function fbm3(x, y, z, oct = 4, s = 0) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) { sum += amp * noise3(x * f, y * f, z * f, s + i * 31); norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}

// Value noise on a periodic lattice, for seamless textures.
function tnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let u = x - xi, v = y - yi;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  let x0 = xi % px; if (x0 < 0) x0 += px;
  let y0 = yi % py; if (y0 < 0) y0 += py;
  const x1 = x0 + 1 === px ? 0 : x0 + 1, y1 = y0 + 1 === py ? 0 : y0 + 1;
  const sx = (s * 59) & 255, sy = (s * 101) & 255;
  const r0 = PERM[(y0 + sy) & 255] + sx, r1 = PERM[(y1 + sy) & 255] + sx;
  const a = VAL[PERM[(r0 + x0) & 1023]], b = VAL[PERM[(r0 + x1) & 1023]], c = VAL[PERM[(r1 + x0) & 1023]], d = VAL[PERM[(r1 + x1) & 1023]];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function tfbm(u, v, px, py, oct, s) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * tnoise(u * px, v * py, px, py, s + i * 13); norm += amp; amp *= 0.5; px *= 2; py *= 2; }
  return sum / norm;
}
// fbm clusters round 0.5; stretch it to use the whole 0..1 range.
const contrast = (n, k = 2.2) => clamp01(0.5 + (n - 0.5) * k);
const ridge = (n) => 1 - Math.abs(n * 2 - 1);

/* =============================================================== textures */
//
// Every texture is computed on the CPU into typed arrays and uploaded as a
// DataTexture. Nothing here touches a GPU-backed canvas: in the game the GPU
// is busy rendering, and canvas-2D draws or read-backs routed through it
// stall for seconds. The few vector shapes (banner devices, carvings, runes)
// are drawn on CPU-only canvases (willReadFrequently) and read once.

const _tex = new Map();
const cachedTex = (key, make) => { if (!_tex.has(key)) _tex.set(key, make()); return _tex.get(key); };

function dataTex(bytes, w, h, { srgb = true, repeat = true } = {}) {
  const t = new THREE.DataTexture(bytes, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

// Pixel buffers are filled top row first, like a canvas, and stored bottom row
// first so that the top of the picture is v = 1.
function rgbTex(rgb, w, h, opts) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = y * w * 3, dst = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++) {
      const s = src + x * 3, d = dst + x * 4;
      out[d] = rgb[s] * 255; out[d + 1] = rgb[s + 1] * 255; out[d + 2] = rgb[s + 2] * 255; out[d + 3] = 255;
    }
  }
  return dataTex(new Uint8Array(out.buffer), w, h, opts);
}

function bytesTex(rgba, w, h, opts) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
  return dataTex(out, w, h, opts);
}

// Per-pixel painter: fn(u, v, out, x, y) fills out.r/g/b (0..1) and out.h (height).
function field(w, h, fn) {
  const rgb = new Float32Array(w * h * 3), H = new Float32Array(w * h);
  const o = { r: 1, g: 1, b: 1, h: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      o.h = 0;
      fn((x + 0.5) / w, (y + 0.5) / h, o, x, y);
      const i = y * w + x;
      H[i] = o.h;
      rgb[i * 3] = o.r; rgb[i * 3 + 1] = o.g; rgb[i * 3 + 2] = o.b;
    }
  }
  return { rgb, H, w, h };
}

// Tangent-space normal map (OpenGL convention, as three.js expects) from a height field.
function normalTex(H, w, h, k, wrap = true) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ym = wrap ? (y - 1 + h) % h : Math.max(0, y - 1), yp = wrap ? (y + 1) % h : Math.min(h - 1, y + 1);
    const dst = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++) {
      const xm = wrap ? (x - 1 + w) % w : Math.max(0, x - 1), xp = wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
      const dx = (H[y * w + xp] - H[y * w + xm]) * k, dy = (H[yp * w + x] - H[ym * w + x]) * k;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + 1), d = dst + x * 4;
      out[d] = (-dx * il * 0.5 + 0.5) * 255;
      out[d + 1] = (dy * il * 0.5 + 0.5) * 255;
      out[d + 2] = (il * 0.5 + 0.5) * 255;
      out[d + 3] = 255;
    }
  }
  return dataTex(new Uint8Array(out.buffer), w, h, { srgb: false, repeat: wrap });
}

const pair = (f, k, wrap = true) => ({ map: rgbTex(f.rgb, f.w, f.h, { repeat: wrap }), normalMap: normalTex(f.H, f.w, f.h, k, wrap) });

// Separable box blur, two passes (close to a Gaussian), clamped at the edges, in place.
function blur(A, w, h, r) {
  const tmp = new Float32Array(A.length), inv = 1 / (2 * r + 1);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      for (let k = -r; k <= r; k++) s += A[row + (k < 0 ? 0 : k > w - 1 ? w - 1 : k)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s * inv;
        const add = x + r + 1, sub = x - r;
        s += A[row + (add > w - 1 ? w - 1 : add)] - A[row + (sub < 0 ? 0 : sub)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[(k < 0 ? 0 : k > h - 1 ? h - 1 : k) * w + x];
      for (let y = 0; y < h; y++) {
        A[y * w + x] = s * inv;
        const add = y + r + 1, sub = y - r;
        s += tmp[(add > h - 1 ? h - 1 : add) * w + x] - tmp[(sub < 0 ? 0 : sub) * w + x];
      }
    }
  }
  return A;
}

// Vector drawing on a CPU-only canvas; returns its RGBA bytes (top row first).
function drawBytes(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  draw(ctx, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}
function channel(bytes, k) {
  const out = new Float32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = bytes[i * 4 + k] / 255;
  return out;
}

// Alpha-blend a colour into an rgb buffer at a wrapped pixel.
function blend(rgb, w, h, x, y, r, g, b, a) {
  const i = (mod(Math.floor(y), h) * w + mod(Math.floor(x), w)) * 3;
  rgb[i] += (r - rgb[i]) * a; rgb[i + 1] += (g - rgb[i + 1]) * a; rgb[i + 2] += (b - rgb[i + 2]) * a;
}

// Vertical colour ramp, stops [[t, [r, g, b]]] with t = 0 at v = 0.
function rampTex(stops, n = 128, srgb = true) {
  const out = new Uint8Array(4 * n * 4);
  for (let r = 0; r < n; r++) {
    const t = (r + 0.5) / n;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k], [t1, c1] = stops[k + 1], f = clamp01((t - t0) / (t1 - t0));
    for (let x = 0; x < 4; x++) {
      const d = (r * 4 + x) * 4;
      out[d] = lerp(c0[0], c1[0], f); out[d + 1] = lerp(c0[1], c1[1], f); out[d + 2] = lerp(c0[2], c1[2], f); out[d + 3] = 255;
    }
  }
  return dataTex(out, 4, n, { srgb, repeat: false });
}

const TEX = {
  bark: () => cachedTex('bark', () => pair(field(256, 256, (u, v, o) => {
    const crev = smooth(0.8, 0.97, ridge(tfbm(u, v, 7, 2, 3, 11)));
    const fib = tfbm(u, v, 48, 6, 2, 17);
    const plate = contrast(tfbm(u, v, 5, 3, 3, 19), 1.6);
    const h = (1 - crev) * 0.7 + fib * 0.2 + plate * 0.1;
    const L = 0.5 + 0.48 * h * (0.75 + 0.5 * plate);
    o.h = h; o.r = L; o.g = L * 0.95; o.b = L * 0.9;
  }), 5)),

  needles: () => cachedTex('needles', () => pair(field(128, 128, (u, v, o) => {
    const s1 = tnoise(u * 64, v * 6, 64, 6, 31), s2 = tnoise(u * 24, v * 3, 24, 3, 37);
    const h = s1 * 0.65 + s2 * 0.35;
    const L = 0.6 + 0.5 * contrast(h, 1.6);
    o.h = h; o.r = L * 0.96; o.g = L; o.b = L * 0.92;
  }), 4)),

  leaves: () => cachedTex('leaves', () => {
    // Overlapping lens-shaped leaves, rasterised directly (later leaves sit on top).
    const S = 256, rgb = new Float32Array(S * S * 3).fill(0.36), H = new Float32Array(S * S);
    const rnd = mulberry32(17), N = 1100;
    for (let i = 0; i < N; i++) {
      const x = rnd() * S, y = rnd() * S, a = rnd() * TAU, len = 6 + rnd() * 7, wid = len * (0.36 + rnd() * 0.16) * 0.7;
      const L = (150 + rnd() * 90) / 255, tint = rnd();
      const cr = L * (0.88 + tint * 0.14), cg = L, cb = L * (0.7 + (1 - tint) * 0.18);
      const hv = (50 + 205 * (i / N)) / 255;
      const ca = Math.cos(a), sa = Math.sin(a), e = Math.ceil(len);
      for (let py = Math.floor(y) - e; py <= Math.floor(y) + e; py++) {
        for (let px = Math.floor(x) - e; px <= Math.floor(x) + e; px++) {
          const dx = px + 0.5 - x, dy = py + 0.5 - y;
          const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca, q = lx / len;
          if (q <= -1 || q >= 1) continue;
          const half = wid * (1 - q * q), cov = clamp01(half - Math.abs(ly) + 0.5);
          if (cov <= 0) continue;
          const j = mod(py, S) * S + mod(px, S);
          const rib = Math.abs(ly) < 0.55 && Math.abs(q) < 0.85 ? 0.75 : 1;
          rgb[j * 3] += (cr * rib - rgb[j * 3]) * cov;
          rgb[j * 3 + 1] += (cg * rib - rgb[j * 3 + 1]) * cov;
          rgb[j * 3 + 2] += (cb * rib - rgb[j * 3 + 2]) * cov;
          const hh = hv * (1 - 0.45 * Math.min(1, Math.hypot(lx, ly) / len));
          H[j] += (hh - H[j]) * cov;
        }
      }
    }
    return { map: rgbTex(rgb, S, S), normalMap: normalTex(H, S, S, 3) };
  }),

  rock: () => cachedTex('rock', () => pair(field(256, 256, (u, v, o) => {
    const n = tfbm(u, v, 4, 4, 5, 41);
    const sp = tnoise(u * 128, v * 128, 128, 128, 43);
    const cr = smooth(0.9, 0.985, ridge(tfbm(u, v, 5, 5, 3, 47)));
    const strata = tfbm(u, v, 2, 12, 2, 49);
    o.h = n * 0.75 + sp * 0.12 + strata * 0.13 - cr * 0.3;
    const L = 0.72 + (contrast(n, 2) - 0.5) * 0.45 + (sp - 0.5) * 0.16 - cr * 0.32 + (strata - 0.5) * 0.12;
    const warm = tfbm(u, v, 3, 3, 2, 53) - 0.5;
    o.r = L * (1.0 + warm * 0.12); o.g = L * 0.985; o.b = L * (0.95 - warm * 0.1);
  }), 4)),

  moss: () => cachedTex('moss', () => pair(field(128, 128, (u, v, o) => {
    const n = tfbm(u, v, 8, 8, 4, 61), f = tnoise(u * 64, v * 64, 64, 64, 63);
    o.h = n * 0.5 + f * 0.5;
    const L = 0.6 + 0.55 * (contrast(n, 2) - 0.5) + (f - 0.5) * 0.3;
    o.r = L * 1.02; o.g = L; o.b = L * 0.85;
  }), 3)),

  wood: () => cachedTex('wood', () => pair(field(256, 256, (u, v, o) => {
    const g1 = tfbm(u, v, 2, 16, 4, 71), s = tnoise(u * 8, v * 128, 8, 128, 73);
    const rings = 0.5 + 0.5 * Math.sin((v * 12 + g1 * 4) * TAU);
    const h = 0.45 * g1 + 0.3 * s + 0.25 * rings;
    const L = 0.66 + (h - 0.5) * 0.55;
    o.h = h; o.r = L; o.g = L * 0.93; o.b = L * 0.84;
  }), 2.5)),

  endgrain: () => cachedTex('endgrain', () => pair(field(128, 128, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2;
    const n = fbm3(u * 6, v * 6, 0, 3, 77);
    const rings = 0.5 + 0.5 * Math.sin((r * 9 + n * 1.4) * TAU);
    const crack = smooth(0.012, 0.0, Math.abs(Math.atan2(dy, dx) - 0.7)) * smooth(0.15, 0.5, r);
    const bark = smooth(0.86, 0.92, r);
    const h = rings * 0.4 - crack * 0.5;
    const L = (0.78 + rings * 0.14 - crack * 0.4) * (1 - bark * 0.55);
    o.h = h; o.r = L; o.g = L * 0.88; o.b = L * 0.72;
  }), 2, false)),

  dressed: () => cachedTex('dressed', () => pair(field(256, 256, (u, v, o, x, y) => {
    // Fine-grained dressed sandstone with faint tooling.
    const n = tfbm(u, v, 6, 6, 4, 181), sp = hash(x, y, 0, 183);
    const marks = 0.5 + 0.5 * Math.sin(v * 180 + n * 9);
    const pit = smooth(0.06, 0.0, sp) * 0.6;
    o.h = n * 0.6 + marks * 0.15 + sp * 0.12 - pit;
    const L = 0.8 + (n - 0.5) * 0.22 + (sp - 0.5) * 0.06 - pit * 0.3;
    o.r = L * 1.01; o.g = L * 0.98; o.b = L * 0.92;
  }), 3)),

  planks: () => cachedTex('planks', () => planksField(false)),
  staves: () => cachedTex('staves', () => planksField(true)),

  iron: () => cachedTex('iron', () => pair(field(128, 128, (u, v, o) => {
    const n = tfbm(u, v, 6, 6, 3, 81), dents = tnoise(u * 14, v * 14, 14, 14, 85);
    const rust = smooth(0.58, 0.72, tfbm(u, v, 4, 4, 3, 87));
    o.h = n * 0.5 + dents * 0.5;
    const L = 0.8 + 0.3 * (n - 0.5);
    o.r = L * (1 + rust * 0.45); o.g = L * (1 + rust * 0.08); o.b = L * (1 - rust * 0.25);
  }), 3)),

  shingles: () => cachedTex('shingles', () => pair(field(256, 256, (u, v, o) => {
    const rows = 5, row = Math.floor(v * rows), lv = v * rows - row;
    const su = u * 4 + (row % 2) * 0.5, sx = Math.floor(su), lx = su - sx;
    const gap = lx < 0.035 || lx > 0.985;
    const tone = 0.82 + hash(sx & 3, row, 0, 91) * 0.3;
    const grain = tnoise(u * 64, v * 6, 64, 6, 93);
    o.h = gap ? 0 : lv * 0.85 + grain * 0.15;
    const L = gap ? 0.18 : tone * (0.6 + 0.3 * lv + grain * 0.15) * (lv > 0.94 ? 0.7 : 1);
    o.r = L; o.g = L * 0.9; o.b = L * 0.8;
  }), 6)),

  burlap: () => cachedTex('burlap', () => pair(field(128, 128, (u, v, o) => {
    const k = 32, cu = Math.floor(u * k), cv = Math.floor(v * k);
    const a = Math.sin(Math.PI * u * k) ** 2, b = Math.sin(Math.PI * v * k) ** 2;
    const over = (cu + cv) % 2 === 0;
    const n = tnoise(u * 16, v * 16, 16, 16, 97);
    o.h = over ? b : a;
    const L = 0.58 + 0.32 * o.h + (n - 0.5) * 0.25;
    o.r = L; o.g = L * 0.92; o.b = L * 0.78;
  }), 3)),

  cap: () => cachedTex('cap', () => {
    // Toadstool cap, mapped on a lathe: u around, v from underside (0) through the rim (0.5) to the crown (1).
    const rnd = mulberry32(23), spots = [];
    for (let i = 0; i < 26; i++) spots.push([rnd(), 0.56 + rnd() * 0.42, 0.02 + rnd() * 0.035]);
    const f = field(256, 128, (u, vv, o) => {
      const v = 1 - vv;
      if (v > 0.5) {
        const t = (v - 0.5) / 0.5;
        const n = tfbm(u, v, 8, 4, 3, 101);
        let r = lerp(0.92, 0.66, t) + (n - 0.5) * 0.12, g = lerp(0.24, 0.1, t) + (n - 0.5) * 0.06, b = lerp(0.12, 0.06, t);
        let h = 0.2;
        const ring = Math.max(0.12, 1 - t);
        for (const [su, sv, sr] of spots) {
          if (Math.abs(v - sv) > sr * 1.25) continue;
          let du = Math.abs(u - su); du = Math.min(du, 1 - du);
          const d = Math.hypot(du * ring * 3.2, v - sv) / sr;
          if (d < 1.25) {
            const k = smooth(1.15, 0.7, d);
            r = lerp(r, 0.95, k); g = lerp(g, 0.92, k); b = lerp(b, 0.82, k);
            h = Math.max(h, 0.2 + 0.8 * smooth(1.2, 0.2, d));
          }
        }
        if (v < 0.53) { const k = smooth(0.53, 0.5, v); r = lerp(r, 0.95, k * 0.6); g = lerp(g, 0.78, k * 0.6); b = lerp(b, 0.6, k * 0.6); }
        o.r = r; o.g = g; o.b = b; o.h = h;
      } else {
        const gill = 0.5 + 0.5 * Math.sin(u * 140 * Math.PI);
        const L = 0.86 + gill * 0.12 - smooth(0.25, 0.0, v) * 0.18;
        o.r = L; o.g = L * 0.92; o.b = L * 0.78; o.h = gill * 0.4;
      }
    });
    return pair(f, 3);
  }),

  cactus: () => cachedTex('cactus', () => {
    // u wraps once round the stem with ten ribs (peaks at u = k/10); v tiles along it.
    const S = 256;
    const f = field(S, S, (u, v, o) => {
      const ph = mod(u * 10, 1), valley = 0.5 + 0.5 * Math.cos(ph * TAU);
      const streak = tnoise(u * 80, v * 6, 80, 6, 111);
      const L = 0.55 + 0.35 * valley + (streak - 0.5) * 0.18;
      o.r = 0.36 * L; o.g = 0.56 * L; o.b = 0.3 * L;
    });
    const rnd = mulberry32(113);
    for (let k = 0; k < 10; k++) {
      for (let j = 0; j < 7; j++) {
        const x = (k / 10) * S + (rnd() - 0.5) * 2, y = ((j + (k % 2) * 0.5) / 7) * S;
        // Spines first, then the felted areole over their roots.
        for (let s = 0; s < 5; s++) {
          const a = rnd() * TAU, l = 5 + rnd() * 6;
          for (let t = 0; t <= l; t += 0.5) blend(f.rgb, S, S, x + Math.cos(a) * t, y + Math.sin(a) * t, 0.92, 0.88, 0.75, 0.8);
        }
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const d = Math.hypot(dx, dy);
          if (d < 3) blend(f.rgb, S, S, x + dx, y + dy, 0.8, 0.76, 0.63, 0.95 * clamp01(2.8 - d));
        }
      }
    }
    return { map: rgbTex(f.rgb, S, S), normalMap: null };
  }),

  ember: () => cachedTex('ember', () => {
    const W = 128, em = new Float32Array(W * W * 3);
    const f = field(W, W, (u, v, o, x, y) => {
      const n = tfbm(u, v, 6, 6, 4, 121);
      const cr = smooth(0.8, 0.96, ridge(tfbm(u, v, 5, 5, 3, 123)));
      const glow = clamp01(cr * 1.1 + smooth(0.6, 0.72, n) * 0.9);
      const ash = smooth(0.42, 0.34, n);
      const L = 0.07 + 0.1 * n + ash * 0.35;
      o.r = L; o.g = L * 0.95; o.b = L * 0.9; o.h = n - cr * 0.3;
      const i = (y * W + x) * 3, g2 = glow * glow;
      em[i] = glow; em[i + 1] = glow * 0.42 + g2 * 0.4; em[i + 2] = glow * 0.08 + g2 * g2 * 0.2;
    });
    return { ...pair(f, 3), emissiveMap: rgbTex(em, W, W) };
  }),

  flame: () => cachedTex('flame', () => ({
    // Lathe uv: v = 0 at the flame's root, 1 at its tip.
    outer: rampTex([[0, [255, 210, 122]], [0.25, [255, 154, 46]], [0.6, [240, 90, 20]], [1, [160, 30, 8]]]),
    core: rampTex([[0, [255, 246, 216]], [0.35, [255, 227, 154]], [0.7, [255, 176, 74]], [1, [255, 112, 32]]]),
    alpha: rampTex([[0, [32, 32, 32]], [0.1, [224, 224, 224]], [0.45, [255, 255, 255]], [0.8, [96, 96, 96]], [1, [0, 0, 0]]], 128, false),
  })),

  coins: () => cachedTex('coins', () => {
    const S = 128, rgb = new Float32Array(S * S * 3), H = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) { rgb[i * 3] = 0.42; rgb[i * 3 + 1] = 0.31; rgb[i * 3 + 2] = 0.13; }
    const rnd = mulberry32(131), N = 110;
    for (let i = 0; i < N; i++) {
      const x = rnd() * S, y = rnd() * S, r = 7 + rnd() * 3, sq = 0.55 + rnd() * 0.45, a = rnd() * TAU;
      const L = (170 + rnd() * 85) / 255, hv = (60 + 195 * (i / N)) / 255;
      const ca = Math.cos(a), sa = Math.sin(a), e = Math.ceil(r);
      for (let py = Math.floor(y) - e; py <= Math.floor(y) + e; py++) {
        for (let px = Math.floor(x) - e; px <= Math.floor(x) + e; px++) {
          const dx = px + 0.5 - x, dy = py + 0.5 - y;
          const lx = dx * ca + dy * sa, ly = (-dx * sa + dy * ca) / sq, d = Math.hypot(lx, ly);
          const cov = clamp01(r - d + 0.5);
          if (cov <= 0) continue;
          const rim = smooth(2.2, 1.0, Math.abs(d - (r - 1.4)));
          const j = mod(py, S) * S + mod(px, S), k = 1 - 0.3 * rim;
          rgb[j * 3] += (L * k - rgb[j * 3]) * cov;
          rgb[j * 3 + 1] += (L * 0.82 * (1 - 0.35 * rim) - rgb[j * 3 + 1]) * cov;
          rgb[j * 3 + 2] += (L * 0.45 * (1 - 0.45 * rim) - rgb[j * 3 + 2]) * cov;
          H[j] += (hv + rim * 0.16 - H[j]) * cov;
        }
      }
    }
    return { map: rgbTex(rgb, S, S), normalMap: normalTex(H, S, S, 4) };
  }),

  carved: () => cachedTex('carved', () => {
    // A relief panel: raised frame, sunken field, a pointed arch round a sword-and-rune device.
    const S = 256;
    const bytes = drawBytes(S, S, (h) => {
      h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
      h.fillStyle = '#c8c8c8'; h.fillRect(8, 8, S - 16, S - 16);
      h.fillStyle = '#505050'; h.fillRect(24, 24, S - 48, S - 48);
      h.strokeStyle = '#d0d0d0'; h.lineWidth = 9; h.lineJoin = 'round'; h.lineCap = 'round';
      h.beginPath(); h.moveTo(60, 214); h.lineTo(60, 112); h.quadraticCurveTo(64, 62, 128, 40); h.quadraticCurveTo(192, 62, 196, 112); h.lineTo(196, 214); h.stroke();
      h.lineWidth = 7;
      h.beginPath(); h.moveTo(128, 70); h.lineTo(128, 196); h.stroke();
      h.beginPath(); h.moveTo(100, 168); h.lineTo(156, 168); h.stroke();
      h.beginPath(); h.moveTo(128, 120); h.lineTo(100, 92); h.moveTo(128, 120); h.lineTo(156, 92); h.stroke();
      h.beginPath(); h.arc(128, 202, 8, 0, TAU); h.stroke();
      h.fillStyle = '#c0c0c0';
      for (const x of [86, 170]) { h.beginPath(); h.arc(x, 196, 7, 0, TAU); h.fill(); }
    });
    const H = blur(channel(bytes, 0), S, S, 1);
    const f = field(S, S, (u, v, o, x, y) => {
      const hh = H[y * S + x], n = tfbm(u, v, 9, 9, 3, 133);
      const L = (0.66 + (n - 0.5) * 0.5) * (0.62 + 0.45 * hh);
      o.r = L * 1.02; o.g = L; o.b = L * 0.93; o.h = hh + n * 0.08;
    });
    return pair(f, 7, false);
  }),

  menhir: () => cachedTex('menhir', () => {
    // Atlas for the standing stone: left half the carved face, right half the plain sides.
    const W = 320, Hh = 640, half = W / 2, px = W / 512;
    const X = (xm) => (xm + 0.5) * half, Y = (ym) => (1 - (ym + 0.25) / 3.5) * Hh;
    const bytes = drawBytes(W, Hh, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
      const spiral = (cx, cy, turns, rMax, dir, width) => {
        g.lineWidth = width * px; g.beginPath();
        for (let i = 0; i <= 200; i++) {
          const t = i / 200, a = dir * t * turns * TAU, r = 0.015 + rMax * t;
          const sx = X(cx + Math.cos(a) * r), sy = Y(cy + Math.sin(a) * r);
          if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
        }
        g.stroke();
      };
      spiral(0, 2.1, 3.1, 0.27, 1, 11);
      spiral(-0.04, 1.36, 2.1, 0.16, -1, 10);
      g.lineWidth = 10 * px; g.beginPath(); g.moveTo(X(0.12), Y(1.52)); g.quadraticCurveTo(X(0.22), Y(1.75), X(0.24), Y(1.9)); g.stroke();
      g.fillStyle = '#fff';
      for (const [x, y, r] of [[0.28, 2.62, 0.03], [-0.27, 2.55, 0.025], [0.22, 1.12, 0.028], [-0.24, 0.98, 0.022]]) {
        g.beginPath(); g.ellipse(X(x), Y(y), r * half, r * Hh / 3.5, 0, 0, TAU); g.fill();
      }
    });
    const G = blur(channel(bytes, 0), W, Hh, 2);
    const f = field(W, Hh, (u, v, o, x, y) => {
      // Both halves sample their own patch of one 2D lattice (2 x 7 cells per metre-ish).
      const side = u >= 0.5 ? 0.5 : 0;
      const n = tfbm(u, v, 8, 14, 4, 141 + side * 10);
      const sp = hash(x, y, 0, 143);
      const groove = G[y * W + x];
      const lich = smooth(0.64, 0.7, tfbm(u + 0.31, v, 10, 18, 2, 147)) * 0.7;
      const lich2 = smooth(0.69, 0.73, tfbm(u, v + 0.17, 14, 24, 2, 149)) * 0.8;
      o.h = n * 0.85 + sp * 0.06 - groove * 0.55;
      let L = 0.6 + (contrast(n, 2) - 0.5) * 0.3 + (sp - 0.5) * 0.08;
      L *= 1 - groove * 0.5;
      let r = L * 0.97, gg = L * 0.97, bb = L * 0.95;
      r = lerp(r, 0.62, lich * 0.6); gg = lerp(gg, 0.66, lich * 0.6); bb = lerp(bb, 0.38, lich * 0.6);
      r = lerp(r, 0.78, lich2 * 0.5); gg = lerp(gg, 0.55, lich2 * 0.5); bb = lerp(bb, 0.26, lich2 * 0.5);
      o.r = r; o.g = gg; o.b = bb;
    });
    return pair(f, 5, false);
  }),

  sign: () => cachedTex('sign', () => {
    const W = 256, Hs = 64;
    const f = field(W, Hs, (u, v, o) => {
      const g1 = tfbm(u, v, 2, 4, 4, 151), s = tnoise(u * 16, v * 32, 16, 32, 153);
      const h = 0.5 * g1 + 0.5 * s;
      const L = 0.7 + (h - 0.5) * 0.5;
      o.h = h; o.r = L; o.g = L * 0.92; o.b = L * 0.82;
    });
    // Burnt-in runes.
    const rnd = mulberry32(157);
    const runes = drawBytes(W, Hs, (ctx) => {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x = 40 + i * 26, y0 = 16, y1 = 48;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1);
        const k = Math.floor(rnd() * 5);
        if (k === 0) { ctx.moveTo(x, y0 + 4); ctx.lineTo(x + 10, y0 + 12); }
        if (k === 1) { ctx.moveTo(x, y0 + 4); ctx.lineTo(x + 10, y0 + 12); ctx.moveTo(x, y0 + 14); ctx.lineTo(x + 10, y0 + 22); }
        if (k === 2) { ctx.moveTo(x - 8, y0 + 4); ctx.lineTo(x, y0 + 14); ctx.lineTo(x + 8, y0 + 4); }
        if (k === 3) { ctx.moveTo(x, y0 + 2); ctx.lineTo(x + 9, y0 + 9); ctx.lineTo(x, y0 + 16); }
        if (k === 4) { ctx.moveTo(x - 7, y0 + 8); ctx.lineTo(x + 7, y0 + 20); }
        ctx.stroke();
      }
    });
    for (let i = 0; i < W * Hs; i++) {
      const a = (runes[i * 4] / 255) * 0.9;
      f.rgb[i * 3] = lerp(f.rgb[i * 3], 0.16, a); f.rgb[i * 3 + 1] = lerp(f.rgb[i * 3 + 1], 0.09, a); f.rgb[i * 3 + 2] = lerp(f.rgb[i * 3 + 2], 0.04, a);
      f.H[i] = f.H[i] * (1 - a * 0.8);
    }
    return pair(f, 3, false);
  }),

  banner: (kind) => cachedTex('banner:' + kind, () => {
    const W = 256, H = 512;
    const crimson = kind === 'crimson';
    const notch = BANNER.notch / BANNER.len;
    const bytes = drawBytes(W, H, (x) => {
      const outline = (inset) => {
        x.beginPath();
        x.moveTo(inset, inset * 0.5); x.lineTo(W - inset, inset * 0.5);
        x.lineTo(W - inset, H - inset * 1.6);
        x.lineTo(W / 2, H * (1 - notch) - inset * 1.2);
        x.lineTo(inset, H - inset * 1.6);
        x.closePath();
      };
      const field = () => { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, crimson ? '#b0202c' : '#2e64b8'); g.addColorStop(1, crimson ? '#7a101c' : '#1a3f84'); return g; };
      x.fillStyle = crimson ? '#4a0a10' : '#0c2448'; x.fillRect(0, 0, W, H);
      outline(0); x.fillStyle = field(); x.fill();
      const trim = crimson ? '#e6b54a' : '#eeeee6';
      x.strokeStyle = crimson ? 'rgba(60,8,12,0.7)' : 'rgba(8,24,60,0.7)'; x.lineWidth = 2; outline(24); x.stroke();
      // Sleeve band at the top where the cloth wraps the crossbar.
      x.fillStyle = crimson ? '#5e0c14' : '#102c5c'; x.fillRect(0, 0, W, 22);
      x.fillStyle = trim; x.fillRect(0, 22, W, 4);
      x.fillStyle = trim; x.strokeStyle = trim;
      const cx = W / 2, cy = 210;
      if (crimson) {
        // Gold sun in splendour over a chevron.
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU, r0 = 46, r1 = i % 2 ? 76 : 92, w = i % 2 ? 0.1 : 0.13;
          x.beginPath();
          x.moveTo(cx + Math.cos(a - w) * r0, cy + Math.sin(a - w) * r0);
          x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          x.lineTo(cx + Math.cos(a + w) * r0, cy + Math.sin(a + w) * r0);
          x.fill();
        }
        x.beginPath(); x.arc(cx, cy, 50, 0, TAU); x.fill();
        x.fillStyle = '#b07a1c'; x.beginPath(); x.arc(cx, cy, 38, 0, TAU); x.fill();
        x.fillStyle = trim; x.beginPath(); x.arc(cx, cy, 31, 0, TAU); x.fill();
        x.lineWidth = 16; x.lineJoin = 'miter';
        x.beginPath(); x.moveTo(52, 380); x.lineTo(cx, 330); x.lineTo(W - 52, 380); x.stroke();
      } else {
        // White crescent and star over waves: the crescent is a disc with a field-coloured disc bitten out.
        x.beginPath(); x.arc(cx - 6, cy, 66, 0, TAU); x.fill();
        x.fillStyle = field(); x.beginPath(); x.arc(cx + 22, cy - 12, 56, 0, TAU); x.fill();
        x.fillStyle = trim;
        const sx = cx + 30, sy = cy - 6;
        x.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU - Math.PI / 2, r = i % 2 ? 9 : 30;
          x.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        }
        x.closePath(); x.fill();
        x.lineWidth = 8;
        for (const yy of [356, 384]) {
          x.beginPath();
          for (let i = 0; i <= 20; i++) x.lineTo(50 + i * 7.8, yy + Math.sin(i * 0.9) * 7);
          x.stroke();
        }
      }
      x.strokeStyle = trim; x.lineWidth = 9; outline(16); x.stroke();
    });
    // Cloth weave and soft folds.
    for (let py = 0; py < H; py++) {
      const sy = Math.sin(py * 2.4);
      for (let px = 0; px < W; px++) {
        const i = (py * W + px) * 4;
        const k = (0.93 + 0.05 * Math.sin(px * 2.4) * sy + (hash(px, py, 0, 161) - 0.5) * 0.06) * (0.94 + 0.06 * Math.sin((px / W) * 9.0 + 0.6));
        bytes[i] *= k; bytes[i + 1] *= k; bytes[i + 2] *= k;
      }
    }
    return bytesTex(bytes, W, H, { repeat: false });
  }),
};

function planksField(vertical) {
  // Four boards per tile with dark joints, per-board tone and an occasional butt joint.
  const f = field(256, 256, (uu, vv, o) => {
    const u = vertical ? vv : uu, v = vertical ? uu : vv;
    const nb = vertical ? 8 : 4;
    const b = Math.floor(v * nb), lv = v * nb - b;
    const joint = (hash(b, 3, 0, 171) * 0.8 + 0.1);
    const gapH = lv < 0.04 || lv > 0.97;
    const gapV = !vertical && Math.abs(u - joint) < 0.006;
    const g1 = tfbm(u + b * 0.37, v, 2, 16 * (nb / 4), 4, 173), s = tnoise(u * 8, v * 128, 8, 128, 175);
    const tone = 0.84 + hash(b, 7, 0, 177) * 0.3;
    const edge = smooth(0.0, 0.12, Math.min(lv, 1 - lv));
    o.h = gapH || gapV ? 0 : 0.35 + 0.4 * edge + 0.15 * g1 + 0.1 * s;
    const L = gapH || gapV ? 0.16 : tone * (0.6 + 0.28 * g1 + 0.12 * s) * (0.85 + 0.15 * edge);
    o.r = L; o.g = L * 0.9; o.b = L * 0.78;
  });
  return pair(f, 4);
}

/* ============================================================== materials */

const _mat = new Map();

function std(p) {
  const { normalScale, ...rest } = p;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...rest });
  if (normalScale !== undefined) m.normalScale.set(normalScale, normalScale);
  return m;
}

const MATS = {
  bark: () => std({ color: '#76665a', ...TEX.bark(), normalScale: 1.4, roughness: 0.95 }),
  barkAsh: () => std({ color: '#9a9a98', ...TEX.bark(), normalScale: 1.7, roughness: 0.9 }),
  needles: () => std({ ...TEX.needles(), normalScale: 0.8, roughness: 0.82 }),
  snow: () => std({ color: '#f4f7fc', normalMap: TEX.moss().normalMap, normalScale: 0.35, roughness: 0.62 }),
  leaves: () => std({ ...TEX.leaves(), normalScale: 1.1, roughness: 0.78 }),
  cactus: () => std({ map: TEX.cactus().map, roughness: 0.62 }),
  reed: () => std({ roughness: 0.72 }),
  bulrush: () => std({ color: '#ffffff', map: TEX.moss().map, roughness: 1 }),
  grass: () => std({ roughness: 0.78 }),
  cap: () => std({ ...TEX.cap(), normalScale: 1.2, roughness: 0.42 }),
  stem: () => std({ color: '#f2ead8', map: TEX.moss().map, roughness: 0.75 }),
  rock: () => std({ ...TEX.rock(), normalScale: 1.25, roughness: 0.92 }),
  moss: () => std({ color: '#6c8a38', ...TEX.moss(), normalScale: 1.4, roughness: 1 }),
  menhir: () => std({ ...TEX.menhir(), normalScale: 1.5, roughness: 0.9 }),
  berry: () => std({ roughness: 0.3 }),
  wood: () => std({ color: '#a8835e', ...TEX.wood(), normalScale: 0.7, roughness: 0.8 }),
  woodDark: () => std({ color: '#6e5442', ...TEX.wood(), normalScale: 0.8, roughness: 0.85 }),
  endgrain: () => std({ color: '#c9a173', ...TEX.endgrain(), roughness: 0.85 }),
  planks: () => std({ color: '#a37c56', ...TEX.planks(), normalScale: 1.0, roughness: 0.84 }),
  staves: () => std({ color: '#9a7350', ...TEX.staves(), normalScale: 1.0, roughness: 0.8 }),
  iron: () => std({ color: '#5f5b57', ...TEX.iron(), normalScale: 0.6, metalness: 0.7, roughness: 0.48 }),
  gold: () => std({ color: '#f2bd52', metalness: 0.78, roughness: 0.28, emissive: '#5a3a06', emissiveIntensity: 0.5 }),
  coinHeap: () => std({ color: '#f2bd52', ...TEX.coins(), normalScale: 1.2, metalness: 0.78, roughness: 0.32, emissive: '#5a3a06', emissiveIntensity: 0.5 }),
  gem: () => std({ color: '#e0203a', emissive: '#6a0014', emissiveIntensity: 0.8, roughness: 0.12, metalness: 0.1, flatShading: true }),
  stone: () => std({ color: '#d6cebf', ...TEX.rock(), normalScale: 0.55, roughness: 0.86 }),
  dressed: () => std({ color: '#cfc6b6', ...TEX.dressed(), normalScale: 0.8, roughness: 0.84 }),
  carved: () => std({ color: '#d6cebf', ...TEX.carved(), normalScale: 1.4, roughness: 0.86 }),
  shingles: () => std({ color: '#86664c', ...TEX.shingles(), normalScale: 1.2, roughness: 0.9 }),
  burlap: () => std({ color: '#c9ad80', ...TEX.burlap(), normalScale: 1.0, roughness: 1 }),
  rope: () => std({ color: '#bba273', ...TEX.burlap(), normalScale: 0.8, roughness: 0.95 }),
  bone: () => std({ color: '#e8dfc8', map: TEX.moss().map, normalMap: TEX.rock().normalMap, normalScale: 0.35, roughness: 0.62 }),
  pitch: () => std({ color: '#4a382a', ...TEX.burlap(), normalScale: 1.2, roughness: 0.95 }),
  water: () => std({ color: '#0e1c20', roughness: 0.06, metalness: 0.2, vertexColors: false }),
  sign: () => std({ color: '#b48d64', ...TEX.sign(), normalScale: 1.0, roughness: 0.84 }),
  ember: () => {
    const t = TEX.ember();
    return std({ map: t.map, normalMap: t.normalMap, emissive: '#ffffff', emissiveMap: t.emissiveMap, emissiveIntensity: 2.4, roughness: 1 });
  },
  flame: () => flameMat(false),
  flameCore: () => flameMat(true),
  spark: () => new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffb45a', emissiveIntensity: 5, fog: false, roughness: 1 }),
  clothCrimson: () => std({ map: TEX.banner('crimson'), side: THREE.DoubleSide, roughness: 0.82, vertexColors: false }),
  clothAzure: () => std({ map: TEX.banner('azure'), side: THREE.DoubleSide, roughness: 0.82, vertexColors: false }),
};

function flameMat(core) {
  const t = TEX.flame();
  return new THREE.MeshStandardMaterial({
    color: '#000000', emissive: '#ffffff', emissiveMap: core ? t.core : t.outer, emissiveIntensity: core ? 2.2 : 1.6,
    alphaMap: t.alpha, transparent: true, opacity: core ? 0.9 : 0.75, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, roughness: 1, metalness: 0,
  });
}

function M(key) {
  let m = _mat.get(key);
  if (!m) {
    m = MATS[key]();
    m.name = 'hd:' + key;
    _mat.set(key, m);
  }
  return m;
}

/* ===================================================== geometry plumbing */

const KEEP = ['position', 'normal', 'uv', 'color'];

// Normalise a geometry for merging: non-indexed, position/normal/uv/color only.
function finish(g) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

const _p = v3(), _n = v3(), _c = new THREE.Color();
// Vertex colours: fn(position, normal, colour) edits the colour in place (it starts as the current one).
function paint(g, fn) {
  g = finish(g);
  const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
  for (let i = 0; i < P.count; i++) {
    _p.fromBufferAttribute(P, i); _n.fromBufferAttribute(N, i);
    _c.setRGB(C.getX(i), C.getY(i), C.getZ(i));
    fn(_p, _n, _c, i);
    C.setXYZ(i, _c.r, _c.g, _c.b);
  }
  return g;
}

// Blend normals toward dirFn(p, out) — the soft, painterly shading foliage needs.
function soften(g, dirFn, k) {
  const P = g.attributes.position, N = g.attributes.normal, d = v3();
  for (let i = 0; i < P.count; i++) {
    _p.fromBufferAttribute(P, i); _n.fromBufferAttribute(N, i);
    dirFn(_p, d); d.normalize();
    _n.multiplyScalar(1 - k).addScaledVector(d, k).normalize();
    N.setXYZ(i, _n.x, _n.y, _n.z);
  }
  return g;
}

function flip(g) {
  g = finish(g);
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color;
  for (let i = 0; i < P.count; i += 3) {
    for (const A of [P, N, U, C]) {
      for (let c = 0; c < A.itemSize; c++) {
        const a = A.array[(i + 1) * A.itemSize + c];
        A.array[(i + 1) * A.itemSize + c] = A.array[(i + 2) * A.itemSize + c];
        A.array[(i + 2) * A.itemSize + c] = a;
      }
    }
  }
  for (let i = 0; i < N.array.length; i++) N.array[i] = -N.array[i];
  return g;
}

function M4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(v3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), v3(sx, sy, sz));
}

const C = (hex) => new THREE.Color(hex);

class Kit {
  constructor() { this.parts = new Map(); }
  add(key, g, m = null, fn = null) {
    g = finish(g);
    if (m) g.applyMatrix4(m);
    if (fn) paint(g, fn);
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(g);
    return g;
  }
  build() {
    const out = [];
    for (const [key, list] of this.parts) {
      const g = mergeGeometries(list, false);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      g.name = 'hd:' + key;
      out.push({ geometry: g, material: M(key) });
    }
    return out;
  }
}

// Triangle-builder for hand-made meshes.
class MB {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; }
  v(p, n, c, u = 0, w = 0) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.c.push(c.r, c.g, c.b); this.uv.push(u, w); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

const curve = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : v3(...p))));
const steps = (n, a = 0, b = 1) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
// Ring parameters bunched toward the end, for rounded tips.
const capSteps = (tc, n) => Array.from({ length: n }, (_, i) => tc + (1 - tc) * Math.sin(((i + 1) / n) * Math.PI / 2));

// A tube along a curve; rfn(t, theta) gives the radius so it can taper, flare and rib.
function tube(cv, ts, rfn, segs, { uRep = 1, vScale = 1 } = {}) {
  const L = cv.getLength(), n = ts.length;
  const P = ts.map((t) => cv.getPointAt(t)), T = ts.map((t) => cv.getTangentAt(t).normalize());
  const ax = Math.abs(T[0].y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  const nn = v3().crossVectors(T[0], ax).normalize();
  const Ns = [], Bs = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const axis = v3().crossVectors(T[i - 1], T[i]), len = axis.length();
      if (len > 1e-6) nn.applyAxisAngle(axis.divideScalar(len), Math.acos(Math.max(-1, Math.min(1, T[i - 1].dot(T[i])))));
    }
    Ns.push(nn.clone());
    Bs.push(v3().crossVectors(T[i], nn).normalize());
  }
  const pos = [], nor = [], uv = [], idx = [];
  const e = 1e-3, D = v3(), Tg = v3(), a = v3(), b = v3(), nr = v3();
  for (let i = 0; i < n; i++) {
    const t = ts[i];
    const t0 = Math.max(0, t - e), t1 = Math.min(1, t + e);
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * TAU, cs = Math.cos(th), sn = Math.sin(th);
      const r = rfn(t, th);
      const rth = (rfn(t, th + e) - rfn(t, th - e)) / (2 * e);
      const rs = (rfn(t1, th) - rfn(t0, th)) / ((t1 - t0) * L);
      D.copy(Ns[i]).multiplyScalar(cs).addScaledVector(Bs[i], sn);
      Tg.copy(Ns[i]).multiplyScalar(-sn).addScaledVector(Bs[i], cs);
      pos.push(P[i].x + D.x * r, P[i].y + D.y * r, P[i].z + D.z * r);
      a.copy(D).multiplyScalar(rth).addScaledVector(Tg, r);
      b.copy(T[i]).addScaledVector(D, rs);
      nr.crossVectors(a, b);
      if (nr.lengthSq() < 1e-12) nr.copy(T[i]);
      nr.normalize();
      nor.push(nr.x, nr.y, nr.z);
      uv.push((j / segs) * uRep, t * L * vScale);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a0 = i * (segs + 1) + j, b0 = a0 + segs + 1;
      idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const lathe = (pts, segs, phase = 0) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), segs, phase);

// A chamfered box, centred.
function bbox(w, h, d, b = 0.012) {
  b = Math.max(0, Math.min(b, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  const s = new THREE.Shape(), x = w / 2 - b, y = h / 2 - b;
  s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(d - 2 * b) / 2);
  return g;
}

// Box-projected UVs in metres (times s), with u along the `long` axis where it can be.
function boxUV(g, s = 1, long = 'x', off = 0) {
  g = finish(g);
  const P = g.attributes.position, U = g.attributes.uv;
  const a = v3(), b = v3(), c = v3(), n = v3(), q = v3();
  for (let i = 0; i < P.count; i += 3) {
    a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
    n.subVectors(b, a).cross(q.subVectors(c, a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    let A, B;
    if (ax >= ay && ax >= az) { A = 'z'; B = 'y'; } else if (ay >= az) { A = 'x'; B = 'z'; } else { A = 'x'; B = 'y'; }
    if (B === long) [A, B] = [B, A];
    for (let k = 0; k < 3; k++) {
      q.fromBufferAttribute(P, i + k);
      U.setXY(i + k, q[A] * s + off, q[B] * s + off * 0.37);
    }
  }
  return g;
}

// Map x/y extents of a geometry onto 0..1.
function planarUV(g, x0, x1, y0, y1) {
  g = finish(g);
  const P = g.attributes.position, U = g.attributes.uv;
  for (let i = 0; i < P.count; i++) U.setXY(i, (P.getX(i) - x0) / (x1 - x0), (P.getY(i) - y0) / (y1 - y0));
  return g;
}

// A faceted rock: displaced icosphere, chiselled by random planes.
function rockGeo(r, detail, seed, { amp = 0.5, freq = 1.3, cuts = 6, cutDepth = [0.7, 0.9], squash = [1, 0.72, 0.92], sink = 0.15 } = {}) {
  const rnd = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(r, detail);
  const P = g.attributes.position;
  const planes = [];
  for (let k = 0; k < cuts; k++) {
    const n = v3(rnd() * 2 - 1, rnd() * 1.5 - 0.35, rnd() * 2 - 1).normalize();
    planes.push([n, r * lerp(cutDepth[0], cutDepth[1], rnd())]);
  }
  const p = v3(), o = seed * 0.37;
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i);
    const d = fbm3(p.x * freq / r + o, p.y * freq / r, p.z * freq / r, 4, seed);
    p.multiplyScalar(1 + amp * (contrast(d, 1.8) - 0.5));
    for (const [n, dd] of planes) { const e = p.dot(n) - dd; if (e > 0) p.addScaledVector(n, -e * 0.94); }
    p.set(p.x * squash[0], p.y * squash[1], p.z * squash[2]);
    P.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y - sink * r * squash[1] * 2, 0);
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

function rockPaint(scale, tint = '#ffffff', seed = 0) {
  const t = C(tint);
  return (p, n, c) => {
    const ao = 0.42 + 0.58 * smooth(-0.05 * scale, 0.55 * scale, p.y);
    const v = 0.82 + 0.36 * fbm3(p.x * 2.2 / scale, p.y * 2.2 / scale, p.z * 2.2 / scale, 3, 7 + seed);
    const up = 0.92 + 0.12 * Math.max(0, n.y);
    c.copy(t).multiplyScalar(ao * v * up);
  };
}

/* ============================================================ vegetation */

function pineTier(R, h, n, rnd, droop, pal, snow) {
  const m = n * 2;
  const apex = v3(0, h, 0), under = v3(0, h * 0.16, 0);
  const mid = [], rim = [], isTip = [];
  const rot = rnd() * TAU;
  for (let i = 0; i < m; i++) {
    const a = rot + (i / m) * TAU + (rnd() - 0.5) * 0.2;
    const tip = i % 2 === 0;
    const rr = tip ? R * (0.84 + rnd() * 0.3) : R * (0.58 + rnd() * 0.12);
    const ry = tip ? -droop * R * (0.45 + rnd() * 0.6) : h * (0.04 + rnd() * 0.08);
    rim.push(v3(Math.cos(a) * rr, ry, Math.sin(a) * rr));
    const mr = R * (tip ? 0.5 : 0.4), my = h * (0.46 + (rnd() - 0.5) * 0.1) - (tip ? 0.03 : 0);
    mid.push(v3(Math.cos(a) * mr, my, Math.sin(a) * mr));
    isTip.push(tip);
  }
  const dark = C(pal.dark), midc = C(pal.mid), light = C(pal.light);
  const shade = (s) => (s < 0.5 ? dark.clone().lerp(midc, s * 2) : midc.clone().lerp(light, (s - 0.5) * 2));
  const mb = new MB(), z = v3(0, 1, 0);
  const uvOf = (p) => [(Math.atan2(p.z, p.x) / TAU) * 6, Math.hypot(p.x, p.z) * 1.4];
  const tri = (a, b, c, sa, sb, sc) => {
    for (const [p, s] of [[a, sa], [b, sb], [c, sc]]) { const [u, w] = uvOf(p); mb.v(p, z, shade(s), u, w); }
  };
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const st = (k) => (isTip[k] ? 1 : 0.35);
    tri(apex, mid[j], mid[i], 0.8, 0.62, 0.62);
    tri(mid[i], rim[j], rim[i], 0.62, st(j), st(i));
    tri(mid[i], mid[j], rim[j], 0.62, 0.62, st(j));
    tri(under, rim[i], rim[j], 0.0, isTip[i] ? 0.3 : 0.12, isTip[j] ? 0.3 : 0.12);
  }
  const g = mb.geo();
  g.computeVertexNormals();
  soften(g, (p, d) => d.set(p.x, p.y + h * 0.9, p.z), 0.55);
  let cap = null;
  if (snow) {
    const sb = new MB(), white = C('#ffffff'), blue = C('#b9c6da');
    const lift = 0.05;
    const top = apex.clone().add(v3(0, lift, 0));
    const m2 = mid.map((p) => p.clone().add(v3(0, lift + 0.01, 0)));
    const c2 = mid.map((p, i) => p.clone().lerp(rim[i], isTip[i] ? 0.45 + rnd() * 0.3 : 0.12 + rnd() * 0.1).add(v3(0, lift, 0)));
    const lip = c2.map((p) => p.clone().multiplyScalar(0.93).add(v3(0, -0.06, 0)));
    const st = (p, c) => { const [u, w] = uvOf(p); sb.v(p, z, c, u, w); };
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      st(top, white); st(m2[j], white); st(m2[i], white);
      st(m2[i], white); st(c2[j], white); st(c2[i], white);
      st(m2[i], white); st(m2[j], white); st(c2[j], white);
      st(c2[i], white); st(c2[j], blue); st(lip[i], blue);
      st(c2[j], white); st(lip[j], blue); st(lip[i], blue);
    }
    cap = sb.geo();
    cap.computeVertexNormals();
    soften(cap, (p, d) => d.set(p.x * 0.3, 1, p.z * 0.3), 0.6);
  }
  return { tier: g, cap };
}

function buildPine(snow) {
  const kit = new Kit(), rnd = mulberry32(snow ? 4242 : 4141);
  const pal = snow ? { dark: '#0d1a16', mid: '#1d3a30', light: '#3d5c4c' } : { dark: '#0e1d10', mid: '#24412a', light: '#557038' };
  const trunk = tube(curve([[0, -0.3, 0], [0.04, 2.2, 0.02], [-0.03, 4.6, 0.04], [0.02, 6.6, 0]]), steps(8),
    (t, th) => (0.27 * (1 - t) + 0.035) * (1 + 0.9 * Math.exp(-t * 18) * (0.55 + 0.45 * Math.cos(5 * th))), 8, { uRep: 2, vScale: 0.55 });
  kit.add('bark', trunk, null, (p, n, c) => c.setScalar(0.5 + 0.5 * smooth(-0.2, 1.4, p.y)));
  const tiers = 8;
  for (let k = 0; k < tiers; k++) {
    const f = k / (tiers - 1);
    const R = 0.42 + 1.9 * Math.pow(1 - f, 1.1), h = 1.2 + 0.35 * (1 - f), y = 1.25 + f * 4.75;
    const lum = 0.75 + 0.35 * f;
    const { tier, cap } = pineTier(R, h, k < 3 ? 9 : k < 6 ? 8 : 7, rnd, 0.3, pal, snow);
    const m = M4((rnd() - 0.5) * 0.12, y, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.06, 0, (rnd() - 0.5) * 0.06);
    kit.add('needles', tier, m, (p, n, c) => c.multiplyScalar(lum));
    if (cap) kit.add('snow', cap, m);
  }
  const { tier, cap } = pineTier(0.36, 1.05, 6, rnd, 0.2, pal, snow);
  kit.add('needles', tier, M4(0, 6.05, 0), (p, n, c) => c.multiplyScalar(1.12));
  if (cap) kit.add('snow', cap, M4(0, 6.05, 0));
  return kit.build();
}

function clump(r, detail, seed, amp = 0.3, freq = 1.1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const P = g.attributes.position, p = v3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i);
    const d = fbm3(p.x * freq + seed, p.y * freq, p.z * freq, 3, seed);
    p.multiplyScalar(1 + amp * (contrast(d, 2) - 0.5) * 2);
    P.setXYZ(i, p.x, p.y, p.z);
  }
  const U = g.attributes.uv, su = (TAU * r) / 1.2, sv = (Math.PI * r) / 1.2;
  for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * su, U.getY(i) * sv);
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

function foliage(kit, clumps, centre, pal, { soft = 0.55, stretch = 1.25, seed = 0 } = {}) {
  const dark = C(pal.dark), midc = C(pal.mid), light = C(pal.light);
  let top = -Infinity, bot = Infinity;
  for (const [, y, , r] of clumps) { top = Math.max(top, y + r); bot = Math.min(bot, y - r); }
  clumps.forEach(([x, y, z, r, det], i) => {
    const g = clump(r, det, seed + i * 7.1, 0.32, 1.25 / Math.max(0.4, r) * 0.9);
    g.translate(x, y, z);
    soften(g, (p, d) => d.set(p.x - centre.x, (p.y - centre.y) * stretch, p.z - centre.z).normalize().add(v3((p.x - x) * 0.6 / r, (p.y - y) * 0.6 / r, (p.z - z) * 0.6 / r)), soft);
    kit.add('leaves', g, null, (p, n, c) => {
      const hgt = smooth(bot, top, p.y);
      const outer = clamp01(Math.hypot(p.x - centre.x, (p.y - centre.y) * 0.8, p.z - centre.z) / (r + Math.hypot(x - centre.x, z - centre.z)));
      const s = clamp01(0.15 + hgt * 0.55 + outer * 0.35 + (n.y > 0 ? n.y * 0.15 : n.y * 0.3));
      const v = 0.85 + 0.3 * fbm3(p.x * 1.7, p.y * 1.7, p.z * 1.7, 2, seed + 5);
      (s < 0.5 ? c.copy(dark).lerp(midc, s * 2) : c.copy(midc).lerp(light, (s - 0.5) * 2)).multiplyScalar(v);
    });
  });
}

function buildOak() {
  const kit = new Kit(), rnd = mulberry32(5150);
  const trunkC = curve([[0, -0.35, 0], [0.04, 1.2, 0.02], [0.16, 2.4, 0.06], [0.22, 3.2, 0.04]]);
  kit.add('bark', tube(trunkC, steps(8), (t, th) => {
    const base = 0.38 - 0.13 * t;
    const roots = 1 + 1.15 * Math.exp(-t * 9) * Math.pow(0.5 + 0.5 * Math.cos(5 * th + 0.4), 3);
    return base * roots * (1 + 0.05 * Math.sin(th * 3 + t * 9));
  }, 9, { uRep: 2, vScale: 0.6 }), null, (p, n, c) => c.setScalar(0.5 + 0.5 * smooth(-0.2, 1.6, p.y) - 0.25 * smooth(2.8, 3.8, p.y)));
  const limbs = [[1.55, 4.2, 0.5], [-1.45, 4.3, -0.2], [0.3, 4.4, 1.5], [-0.3, 4.3, -1.5], [0.15, 5.1, 0.1]];
  for (const [x, y, z] of limbs) {
    const s = v3(0.18 + (rnd() - 0.5) * 0.1, 2.6 + rnd() * 0.4, 0.04);
    const e = v3(x * 0.8, y - 0.3, z * 0.8);
    const mdl = s.clone().lerp(e, 0.5).add(v3((rnd() - 0.5) * 0.3, 0.35, (rnd() - 0.5) * 0.3));
    kit.add('bark', tube(curve([s, mdl, e]), steps(4), (t) => 0.16 * (1 - t) + 0.05, 6, { uRep: 1, vScale: 0.8 }), null,
      (p, n, c) => c.setScalar(0.55 - 0.15 * smooth(3.5, 4.5, p.y)));
  }
  foliage(kit, [
    [0, 4.65, 0, 1.75, 2], [1.55, 4.2, 0.45, 1.3, 2], [-1.5, 4.3, -0.25, 1.35, 2], [0.35, 4.1, 1.55, 1.25, 2], [-0.3, 4.3, -1.55, 1.3, 2],
    [0.85, 5.35, -0.55, 1.05, 1], [-0.85, 5.3, 0.65, 1.1, 1], [1.0, 3.75, -1.0, 0.95, 1],
  ], v3(0, 4.5, 0), { dark: '#16280f', mid: '#2f4d1c', light: '#62843a' }, { seed: 11 });
  const parts = kit.build();
  for (const p of parts) { p.geometry.scale(0.88, 0.88, 0.88); p.geometry.computeBoundingSphere(); p.geometry.computeBoundingBox(); }
  return parts;
}

function buildDeadTree() {
  const kit = new Kit(), rnd = mulberry32(666);
  const ao = (p, n, c) => c.setScalar(0.55 + 0.45 * smooth(-0.2, 1.5, p.y));
  function branch(p0, dir, len, r0, depth) {
    const pts = [p0.clone()];
    let p = p0.clone();
    const d = dir.clone();
    for (let i = 0; i < 3; i++) {
      d.add(v3(rnd() - 0.5, (rnd() - 0.5) * 0.4 + 0.06, rnd() - 0.5).multiplyScalar(depth === 0 ? 0.35 : 0.6)).normalize();
      p = p.clone().addScaledVector(d, len / 3);
      pts.push(p);
    }
    const cv = curve(pts);
    const r1 = depth >= 3 ? 0.006 : r0 * 0.5;
    const segs = [8, 6, 5, 4][depth], rings = [8, 5, 4, 3][depth];
    const tw = rnd() * 10;
    const rf = (t, th) => (r0 + (r1 - r0) * Math.pow(t, 0.8)) * (1 + (depth === 0 ? 1.0 * Math.exp(-t * 11) * Math.pow(0.5 + 0.5 * Math.cos(4 * th + tw), 2) : 0) + 0.06 * Math.sin(th * 2 + t * 12 + tw));
    kit.add('barkAsh', tube(cv, steps(rings), rf, segs, { uRep: 1, vScale: 0.9 }), null, ao);
    if (depth < 3) {
      const kids = depth === 0 ? 3 : 2 + (rnd() < 0.35 ? 1 : 0);
      const az0 = rnd() * TAU;
      for (let k = 0; k < kids; k++) {
        const t = depth === 0 ? 0.5 + k * 0.17 + rnd() * 0.06 : 0.35 + rnd() * 0.6;
        const at = cv.getPointAt(t), tan = cv.getTangentAt(t);
        const az = az0 + (k / kids) * TAU + (rnd() - 0.5) * 0.8;
        const cd = tan.clone().multiplyScalar(0.5).add(v3(Math.cos(az), 0.3 + rnd() * 0.3, Math.sin(az)).multiplyScalar(0.85)).normalize();
        const rr = (r0 + (r1 - r0) * Math.pow(t, 0.8)) * 0.6;
        branch(at, cd, len * (0.55 + rnd() * 0.15), rr, depth + 1);
      }
    }
  }
  branch(v3(0, -0.3, 0), v3(0.12, 1, 0.05).normalize(), 3.2, 0.25, 0);
  // A snapped-off stub low on the trunk.
  kit.add('barkAsh', tube(curve([[0.05, 1.3, 0], [0.32, 1.52, 0.1], [0.48, 1.6, 0.15]]), steps(3), (t) => 0.1 - t * 0.04, 6, { vScale: 0.9 }), null, ao);
  return kit.build();
}

function buildCactus() {
  const kit = new Kit();
  const ribbed = (R, ribs, tc) => (t, th) => {
    let r = R;
    if (t > tc) { const q = (t - tc) / (1 - tc); r *= Math.sqrt(Math.max(0, 1 - q * q)); }
    return Math.max(r, 0.003) * (1 + 0.075 * Math.cos(ribs * th)) * (t < 0.04 ? 0.9 + t * 2.5 : 1);
  };
  const paintC = (p, n, c) => c.setScalar(0.62 + 0.38 * smooth(-0.1, 0.7, p.y));
  const main = curve([[0, -0.15, 0], [0.02, 0.8, 0], [0, 1.6, 0.02], [-0.02, 2.45, 0]]);
  const tc = 1 - 0.21 / main.getLength();
  kit.add('cactus', tube(main, [...steps(8, 0, tc), ...capSteps(tc, 4)], ribbed(0.21, 10, tc), 20, { uRep: 1, vScale: 1.6 }), null, paintC);
  const arms = [[0.95, 0.3, 0.46, 0.8, 0.13], [1.3, 0.3 + Math.PI, 0.4, 0.62, 0.12], [1.62, 1.95, 0.3, 0.34, 0.095]];
  for (const [y, az, out, up, r] of arms) {
    const d = v3(Math.cos(az), 0, Math.sin(az));
    const pts = [d.clone().multiplyScalar(0.05).setY(y), d.clone().multiplyScalar(0.28).setY(y + 0.02), d.clone().multiplyScalar(out).setY(y + 0.13),
      d.clone().multiplyScalar(out + 0.03).setY(y + 0.36), d.clone().multiplyScalar(out + 0.02).setY(y + up)];
    const cv = curve(pts);
    const tca = 1 - r / cv.getLength();
    kit.add('cactus', tube(cv, [...steps(8, 0, tca), ...capSteps(tca, 3)], ribbed(r, 8, tca), 16, { uRep: 0.8, vScale: 1.6 }), null, paintC);
  }
  return kit.build();
}

// A grass or reed blade, two-sided, with up-leaning normals so both faces light like the ground.
function blade(mb, base, az, lean, len, w, segs, cBase, cTip, twist = 0) {
  const out = v3(Math.cos(az), 0, Math.sin(az));
  const side = v3(-Math.sin(az + twist), 0, Math.cos(az + twist));
  const nrm = out.clone().multiplyScalar(0.55).add(v3(0, 1, 0)).normalize();
  const L = [], R = [], cols = [];
  for (let k = 0; k <= segs; k++) {
    const s = k / segs;
    const c = base.clone().addScaledVector(out, lean * len * s * s).add(v3(0, len * s * (1 - 0.18 * lean * s * s), 0));
    const wd = w * Math.pow(1 - s, 0.7) * 0.5;
    L.push(c.clone().addScaledVector(side, -wd)); R.push(c.clone().addScaledVector(side, wd));
    cols.push(cBase.clone().lerp(cTip, Math.pow(s, 0.8)));
  }
  for (let k = 0; k < segs; k++) {
    const quad = [[L[k], k, 0], [R[k], k, 1], [L[k + 1], k + 1, 0], [R[k], k, 1], [R[k + 1], k + 1, 1], [L[k + 1], k + 1, 0]];
    for (const [p, kk, u] of quad) mb.v(p, nrm, cols[kk], u, kk / segs);
    for (const [p, kk, u] of [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]]) mb.v(p, nrm, cols[kk], u, kk / segs);
  }
}

function buildReeds() {
  const kit = new Kit(), rnd = mulberry32(808), mb = new MB();
  const base = C('#2c3818'), mid = C('#5f7030'), straw = C('#b4a468'), dry = C('#8f7f4e');
  for (let i = 0; i < 32; i++) {
    const r = Math.sqrt(rnd()) * 0.24, a = rnd() * TAU;
    const p = v3(Math.cos(a) * r, -0.02, Math.sin(a) * r);
    const isDry = rnd() < 0.25;
    blade(mb, p, a + (rnd() - 0.5) * 1.2, 0.08 + rnd() * 0.4, 0.8 + rnd() * 0.65, 0.022 + rnd() * 0.012, 4,
      isDry ? dry : base, isDry ? straw : mid.clone().lerp(straw, rnd() * 0.6), (rnd() - 0.5) * 0.8);
  }
  kit.add('reed', mb.geo());
  const stemC = C('#55652c');
  for (let i = 0; i < 6; i++) {
    const r = Math.sqrt(rnd()) * 0.16, a = rnd() * TAU;
    const p0 = v3(Math.cos(a) * r, -0.02, Math.sin(a) * r);
    const hgt = 1.05 + rnd() * 0.38, lean = v3(Math.cos(a) * (0.05 + rnd() * 0.12), 0, Math.sin(a) * (0.05 + rnd() * 0.12));
    const top = p0.clone().add(v3(0, hgt, 0)).add(lean);
    const cv = curve([p0, p0.clone().lerp(top, 0.5).add(lean.clone().multiplyScalar(-0.3)), top]);
    kit.add('reed', tube(cv, steps(3), (t) => 0.0075 - t * 0.003, 4), null, (p, n, c) => c.copy(stemC).multiplyScalar(0.6 + 0.4 * p.y / hgt));
    const hp = cv.getPointAt(0.86), ht = cv.getTangentAt(0.86);
    const hc = curve([hp.clone().addScaledVector(ht, -0.08), hp.clone().addScaledVector(ht, 0.08)]);
    kit.add('bulrush', tube(hc, [0, 0.12, 0.3, 0.5, 0.7, 0.88, 1], (t) => 0.024 * Math.sqrt(Math.max(0.02, 1 - Math.pow(2 * t - 1, 6))), 7), null,
      (p, n, c) => c.set('#6a4026').multiplyScalar(0.8 + 0.2 * Math.max(0, n.y)));
  }
  return kit.build();
}

function buildGrassTuft() {
  const kit = new Kit(), rnd = mulberry32(909), mb = new MB();
  const base = C('#22331a'), tip = C('#8fa44a'), yel = C('#b8b060');
  for (let i = 0; i < 40; i++) {
    const r = Math.sqrt(rnd()) * 0.08, a = rnd() * TAU;
    blade(mb, v3(Math.cos(a) * r, -0.01, Math.sin(a) * r), a + (rnd() - 0.5) * 0.9, 0.2 + rnd() * 0.6, 0.18 + rnd() * 0.26,
      0.018 + rnd() * 0.012, 3, base, rnd() < 0.2 ? yel : tip.clone().multiplyScalar(0.8 + rnd() * 0.35), (rnd() - 0.5) * 0.6);
  }
  kit.add('grass', mb.geo());
  return kit.build();
}

function buildBush() {
  const kit = new Kit(), rnd = mulberry32(1212);
  const cl = [[0, 0.62, 0, 0.62, 2], [0.5, 0.42, 0.25, 0.5, 1], [-0.52, 0.44, -0.12, 0.52, 1], [0.12, 0.4, -0.52, 0.48, 1], [-0.2, 0.42, 0.52, 0.5, 1], [0.12, 0.9, 0.06, 0.42, 1]];
  foliage(kit, cl, v3(0, 0.45, 0), { dark: '#142410', mid: '#30501e', light: '#6c8c3c' }, { soft: 0.5, stretch: 1.4, seed: 23 });
  const berry = C('#b0182a');
  for (let i = 0; i < 14; i++) {
    const [x, y, z, r] = cl[Math.floor(rnd() * cl.length)];
    const d = v3(rnd() - 0.5, rnd() * 0.8, rnd() - 0.5).normalize().multiplyScalar(r * 1.02);
    kit.add('berry', new THREE.OctahedronGeometry(0.034, 0), M4(x + d.x, y + d.y, z + d.z, rnd(), rnd(), 0), (p, n, c) => c.copy(berry).multiplyScalar(0.7 + 0.4 * Math.max(0, n.y)));
  }
  const parts = kit.build();
  for (const p of parts) { p.geometry.scale(0.78, 0.78, 0.78); p.geometry.computeBoundingSphere(); p.geometry.computeBoundingBox(); }
  return parts;
}

function buildMushrooms() {
  const kit = new Kit(), rnd = mulberry32(1313);
  const list = [[0, 0, 1, 10], [0.17, 0.08, 0.72, 12], [-0.14, 0.12, 0.58, 12], [0.05, -0.18, 0.5, 10], [-0.2, -0.12, 0.38, 10], [0.24, -0.15, 0.24, 8]];
  for (const [x, z, s, segs] of list) {
    const h = 0.4 * s, R = 0.17 * s;
    const tilt = v3(rnd() - 0.5, 0, rnd() - 0.5).multiplyScalar(0.35);
    const m = M4(x, 0, z, tilt.x, rnd() * TAU, tilt.z);
    const stemPts = [[0.05 * s, -0.02], [0.06 * s, 0.03 * s], [0.046 * s, 0.11 * s], [0.037 * s, 0.26 * s], [0.031 * s, h]];
    kit.add('stem', lathe(stemPts, 7), m, (p, n, c) => c.setScalar(0.55 + 0.45 * smooth(0, 0.16 * s, p.y)));
    const capPts = [[0.03 * s, h - 0.02 * s], [0.45 * R, h - 0.036 * s], [0.85 * R, h - 0.03 * s], [R, h - 0.004 * s], [0.95 * R, h + 0.3 * R], [0.66 * R, h + 0.55 * R], [0.0005, h + 0.64 * R]];
    kit.add('cap', lathe(capPts, segs + 2), m, (p, n, c) => c.setScalar(n.y < 0 ? 0.62 : 1));
  }
  return kit.build();
}

function buildRock() {
  const kit = new Kit();
  kit.add('rock', rockGeo(0.42, 3, 77, { amp: 0.4, cuts: 9, cutDepth: [0.6, 0.86], squash: [1.12, 0.82, 0.95], sink: 0.1 }), null, rockPaint(0.6, '#a5a29c', 1));
  return kit.build();
}

function buildBoulder() {
  const kit = new Kit();
  const g = rockGeo(1.15, 4, 191, { amp: 0.42, cuts: 12, cutDepth: [0.66, 0.9], squash: [1.05, 0.84, 0.92], sink: 0.08 });
  const side = rockGeo(0.45, 2, 193, { amp: 0.42, cuts: 7, cutDepth: [0.62, 0.86], squash: [1.1, 0.74, 1], sink: 0.15 });
  side.translate(1.05, 0, 0.55);
  const rp = rockPaint(1.9, '#a29f99', 3);
  kit.add('rock', g, null, rp);
  kit.add('rock', side, null, rockPaint(0.8, '#a29f99', 4));
  // Moss: copy the up-facing facets (with a noisy threshold) just above the stone.
  const mossGeo = (src) => {
    const s = finish(src), P = s.attributes.position, out = [], nrm = [], uvs = [];
    const a = v3(), b = v3(), c = v3(), n = v3(), cen = v3(), q = v3();
    for (let i = 0; i < P.count; i += 3) {
      a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
      n.subVectors(b, a).cross(q.subVectors(c, a)).normalize();
      cen.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      const k = n.y + (fbm3(cen.x * 1.6, cen.y * 1.6, cen.z * 1.6, 3, 197) - 0.5) * 1.1;
      if (k < 0.42) continue;
      for (const p of [a, b, c]) { const pp = p.clone().addScaledVector(n, 0.022); out.push(pp.x, pp.y, pp.z); nrm.push(n.x, n.y, n.z); uvs.push(pp.x * 1.3, pp.z * 1.3); }
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    g2.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g2.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return g2;
  };
  const mossC = C('#ffffff');
  const mp = (p, n, c) => c.copy(mossC).multiplyScalar(0.7 + 0.5 * fbm3(p.x * 3, p.y * 3, p.z * 3, 3, 199));
  kit.add('moss', mossGeo(g), null, mp);
  kit.add('moss', mossGeo(side), null, mp);
  return kit.build();
}

function buildStandingStone() {
  const kit = new Kit();
  const W = 1.0, H = 3.5, Dp = 0.62;
  let g = new THREE.BoxGeometry(W, H, Dp, 4, 14, 2).toNonIndexed();
  g.translate(0, H / 2 - 0.25, 0);
  const P = g.attributes.position, U = g.attributes.uv;
  const a = v3(), b = v3(), c = v3(), n = v3(), q = v3();
  // Atlas UVs from the undisplaced box: front (+z) gets the carved half.
  for (let i = 0; i < P.count; i += 3) {
    a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
    n.subVectors(b, a).cross(q.subVectors(c, a)).normalize();
    for (let k = 0; k < 3; k++) {
      q.fromBufferAttribute(P, i + k);
      const v = (q.y + 0.25) / H;
      let u;
      if (n.z > 0.5) u = (q.x / W + 0.5) * 0.5;
      else if (n.z < -0.5) u = 0.5 + (0.5 - q.x / W) * 0.25;
      else if (Math.abs(n.x) > 0.5) u = 0.75 + (q.z / Dp + 0.5) * 0.25 * 0.9;
      else u = 0.5 + (q.x / W + 0.5) * 0.45;
      U.setXY(i + k, u, Math.abs(n.y) > 0.5 ? 0.97 + q.z * 0.03 : v);
    }
  }
  const p = v3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i);
    const t = clamp01((p.y + 0.25) / H);
    // Taper, round the crown, lean, and weather.
    let sx = 1 - 0.22 * t, sz = 1 - 0.3 * t;
    const nx = p.x / (W / 2), nz = p.z / (Dp / 2);
    if (t > 0.82) { const k = (t - 0.82) / 0.18; sx *= 1 - 0.25 * k * k; sz *= 1 - 0.3 * k * k; }
    p.x *= sx; p.z *= sz;
    if (t > 0.9) p.y -= (nx * nx * 0.3 + nz * nz * 0.12) * (t - 0.9) / 0.1 * 0.5;
    p.y -= (nx + 1) * 0.24 * t ** 4;
    const d = fbm3(p.x * 2.2, p.y * 1.4, p.z * 2.2, 3, 211) - 0.5;
    const big = fbm3(p.x * 0.8 + 5, p.y * 0.6, p.z * 0.8, 2, 213) - 0.5;
    const len = Math.hypot(nx * sx, nz * sz) || 1;
    p.x += (nx * sx / len) * (d * 0.08 + big * 0.3) + p.y * 0.035;
    p.z += (nz * sz / len) * (d * 0.06 + big * 0.18);
    P.setXYZ(i, p.x, p.y, p.z);
  }
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  kit.add('menhir', g, null, (pp, nn, cc) => cc.setScalar(0.55 + 0.45 * smooth(-0.25, 0.6, pp.y)).multiply(C('#ffffff').lerp(C('#9aa070'), 0.4 * smooth(0.5, -0.2, pp.y))));
  return kit.build();
}

const VEG_BUILDERS = {
  pine: () => buildPine(false), snowpine: () => buildPine(true), oak: buildOak, deadtree: buildDeadTree, cactus: buildCactus,
  reeds: buildReeds, mushroom: buildMushrooms, rock: buildRock, boulder: buildBoulder, standingstone: buildStandingStone,
  grasstuft: buildGrassTuft, bush: buildBush,
};
const _veg = new Map();

export function makeVegetation(kind) {
  if (!VEG_BUILDERS[kind]) throw new Error(`props-hd: unknown vegetation '${kind}'`);
  if (!_veg.has(kind)) _veg.set(kind, VEG_BUILDERS[kind]());
  return _veg.get(kind).slice();
}

/* ================================================================== fire */

const _flameGeo = [];
function flameGeo(i) {
  const k = i % 3;
  if (!_flameGeo[k]) {
    const prof = [[0.0005, 0], [0.26, 0.05], [0.42, 0.17], [0.42, 0.34], [0.32, 0.54], [0.18, 0.74], [0.07, 0.9], [0.0005, 1]];
    const g = lathe(prof, 9);
    const P = g.attributes.position, bend = [0.12, -0.08, 0.2][k], tw = [1.2, -0.9, 0.6][k];
    for (let j = 0; j < P.count; j++) {
      const y = P.getY(j), x = P.getX(j), z = P.getZ(j), a = tw * y * y;
      const cs = Math.cos(a), sn = Math.sin(a);
      P.setXYZ(j, x * cs - z * sn + bend * y * y, y, x * sn + z * cs + 0.4 * bend * y * y * y);
    }
    g.computeVertexNormals();
    _flameGeo[k] = g;
  }
  return _flameGeo[k];
}
let _sparkGeo = null;
const sparkGeo = () => _sparkGeo || (_sparkGeo = new THREE.OctahedronGeometry(0.012, 0));

let _phase = 0;
const wobble = (t, p) => 0.5 * Math.sin(t * 7.3 + p) + 0.3 * Math.sin(t * 13.1 + p * 2.1) + 0.2 * Math.sin(t * 23.7 + p * 3.7);

function noShadow(o) { o.castShadow = false; o.receiveShadow = false; o.userData.noShadow = true; return o; }

// Flames, sparks and a flickering light. Returns { group, light, update }.
function makeFire({ scale = 1, n = 5, cores = 2, sparks = 6, light = { color: '#ff8c40', intensity: 10, distance: 9 }, lightY = 0.45 }) {
  const grp = new THREE.Group();
  grp.name = 'fire';
  const rnd = mulberry32(1000 + _phase * 17), ph0 = _phase++ * 2.39;
  const flames = [];
  for (let i = 0; i < n + cores; i++) {
    const core = i >= n;
    const f = noShadow(new THREE.Mesh(flameGeo(i), M(core ? 'flameCore' : 'flame')));
    const a = (i / n) * TAU + rnd() * 0.5, r = core ? 0.02 * scale : (0.07 + rnd() * 0.05) * scale;
    f.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    f.userData.base = {
      w: (core ? 0.15 : 0.22 + rnd() * 0.08) * scale, h: (core ? 0.42 : 0.55 + rnd() * 0.35) * scale,
      ph: ph0 + rnd() * 10, rot: rnd() * TAU, spin: (rnd() - 0.5) * 1.6, x: f.position.x, z: f.position.z,
    };
    f.renderOrder = 2;
    grp.add(f);
    flames.push(f);
  }
  const sp = [];
  for (let i = 0; i < sparks; i++) {
    const s = noShadow(new THREE.Mesh(sparkGeo(), M('spark')));
    s.userData.base = { ph: rnd(), speed: 0.45 + rnd() * 0.4, a: rnd() * TAU, r: 0.04 + rnd() * 0.12 };
    grp.add(s);
    sp.push(s);
  }
  const L = new THREE.PointLight(light.color, light.intensity, light.distance, 2);
  L.position.set(0, lightY * scale, 0);
  L.userData.base = light.intensity;
  L.userData.baseColor = new THREE.Color(light.color);
  grp.add(L);
  const update = (t) => {
    for (const f of flames) {
      const b = f.userData.base;
      const s1 = wobble(t, b.ph), s2 = wobble(t * 1.13, b.ph + 1.7), s3 = wobble(t * 0.87, b.ph + 3.1);
      f.scale.set(b.w * (1 + 0.12 * s1), b.h * (1 + 0.24 * s2), b.w * (1 + 0.12 * s3));
      f.rotation.set(0.12 * s3, b.rot + t * b.spin, 0.14 * s1);
      f.position.set(b.x + 0.012 * s2 * scale, 0, b.z + 0.012 * s3 * scale);
    }
    for (const s of sp) {
      const b = s.userData.base, k = mod(t * b.speed + b.ph, 1);
      const a = b.a + k * 3 + Math.sin(t * 3 + b.ph * 9) * 0.5;
      s.position.set(Math.cos(a) * b.r * (1 + k), (0.15 + k * 1.3) * scale, Math.sin(a) * b.r * (1 + k));
      s.scale.setScalar(Math.max(0.001, (1 - k) * scale));
    }
    const f = 0.84 + 0.1 * wobble(t * 0.9, ph0) + 0.06 * Math.sin(t * 31 + ph0);
    L.color.copy(L.userData.baseColor).multiplyScalar(f);
    L.position.set(0.02 * Math.sin(t * 5.3 + ph0) * scale, lightY * scale + 0.02 * Math.sin(t * 7.1 + ph0), 0.02 * Math.cos(t * 4.7 + ph0) * scale);
  };
  update(0);
  return { group: grp, light: L, update };
}

/* ================================================================= props */

function rivet(kit, x, y, z, ry = 0, rx = 0, r = 0.008) {
  kit.add('iron', new THREE.SphereGeometry(r, 6, 3, 0, TAU, 0, Math.PI / 2), M4(x, y, z, rx + Math.PI / 2, ry, 0));
}

function logGeo(kit, len, r, m, charred = 0) {
  const lg = tube(curve([[-len / 2, 0, 0], [0, 0.01, 0], [len / 2, 0, 0]]), steps(3), (t, th) => r * (1 + 0.06 * Math.sin(th * 3 + t * 5)), 8, { uRep: 1, vScale: 0.8 });
  const burnt = (p, n, c) => c.setScalar(charred ? lerp(1, 0.16, smooth(0.15, 0.8, p.y / charred)) : 0.9);
  kit.add('bark', lg, m, burnt);
  for (const s of [-1, 1]) {
    const cap = new THREE.CircleGeometry(r * 0.97, 8);
    kit.add('endgrain', cap, new THREE.Matrix4().multiplyMatrices(m, M4((s * len) / 2, 0, 0, 0, s * Math.PI / 2, 0)), burnt);
  }
}

function buildCampfire() {
  const kit = new Kit(), rnd = mulberry32(2020);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + (rnd() - 0.5) * 0.2, r = 0.56 + (rnd() - 0.5) * 0.05, s = 0.12 + rnd() * 0.05;
    kit.add('rock', rockGeo(s, 1, 2100 + i, { amp: 0.5, cuts: 3, squash: [1.3, 0.8, 1], sink: 0.2 }), M4(Math.cos(a) * r, 0, Math.sin(a) * r, 0, -a, 0), rockPaint(0.25, '#a9a29a', i));
  }
  kit.add('ember', lathe([[0.48, -0.01], [0.36, 0.03], [0.2, 0.06], [0.0005, 0.07]], 14), null, (p, n, c) => c.setScalar(1));
  // Ash ring, scorched earth.
  // Scorched earth: its rim dips below ground level so it blends into whatever the fire stands on.
  kit.add('rock', lathe([[0.8, -0.03], [0.62, 0.004], [0.42, 0.012]], 18), null, (p, n, c) => c.setScalar(lerp(0.05, 0.3, smooth(0.45, 0.8, Math.hypot(p.x, p.z)))));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3, r0 = 0.44, r1 = 0.06;
    const base = v3(Math.cos(a) * r0, 0.04, Math.sin(a) * r0), top = v3(Math.cos(a) * r1, 0.44, Math.sin(a) * r1);
    const len = base.distanceTo(top);
    const mid = base.clone().lerp(top, 0.5);
    const dir = top.clone().sub(base).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(v3(1, 0, 0), dir);
    const m = new THREE.Matrix4().compose(mid, q, v3(1, 1, 1));
    logGeo(kit, len + 0.06, 0.05 + rnd() * 0.012, m, 0.45);
  }
  logGeo(kit, 0.9, 0.065, M4(0.1, 0.07, 0.42, 0, 0.35, 0.05));
  logGeo(kit, 0.8, 0.06, M4(-0.38, 0.065, -0.2, 0, 2.1, -0.04));
  return kit.build();
}

function buildTorch() {
  const kit = new Kit();
  // Wall plate on the z = 0 wall plane; the torch leans out toward +z.
  kit.add('iron', boxUV(bbox(0.13, 0.3, 0.022, 0.006), 3), M4(0, 0.25, 0.011));
  for (const [x, y] of [[-0.04, 0.14], [0.04, 0.14], [-0.04, 0.36], [0.04, 0.36]]) rivet(kit, x, y, 0.022);
  const arm = tube(curve([[0, 0.3, 0.02], [0, 0.31, 0.1], [0, 0.36, 0.15], [0, 0.42, 0.16]]), steps(5), () => 0.011, 6);
  kit.add('iron', arm);
  kit.add('iron', tube(curve([[0, 0.15, 0.02], [0, 0.2, 0.09], [0, 0.29, 0.15]]), steps(3), () => 0.009, 6));
  const tilt = 0.2;
  const ringM = M4(0, 0.42, 0.165, tilt, 0, 0);
  kit.add('iron', new THREE.TorusGeometry(0.036, 0.008, 5, 14), new THREE.Matrix4().multiplyMatrices(ringM, M4(0, 0, 0, Math.PI / 2, 0, 0)));
  kit.add('iron', new THREE.TorusGeometry(0.034, 0.007, 5, 14), new THREE.Matrix4().multiplyMatrices(ringM, M4(0, -0.1, 0, Math.PI / 2, 0, 0)));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    kit.add('iron', bbox(0.008, 0.12, 0.008, 0.002), new THREE.Matrix4().multiplyMatrices(ringM, M4(Math.cos(a) * 0.036, -0.05, Math.sin(a) * 0.036)));
  }
  // The torch: a tapering haft wrapped in pitch-soaked cloth at the head.
  const tm = M4(0, 0.42, 0.165, tilt, 0, 0);
  kit.add('woodDark', tube(curve([[0, -0.2, 0], [0, 0.1, 0], [0, 0.4, 0]]), steps(3), (t) => 0.022 + t * 0.01, 7, { vScale: 1.2 }), tm);
  const head = lathe([[0.03, 0.34], [0.046, 0.36], [0.05, 0.42], [0.047, 0.48], [0.052, 0.5], [0.044, 0.54], [0.03, 0.56], [0.0005, 0.565]], 9);
  kit.add('pitch', head, tm, (p, n, c) => {
    const band = 0.5 + 0.5 * Math.sin(p.y * 150 + Math.atan2(p.x, p.z - 0.2) * 2);
    c.setScalar((0.5 + 0.45 * smooth(0.3, 0.7, band)) * (1 - 0.65 * smooth(0.9, 0.98, p.y)));
  });
  return kit.build();
}
const TORCH_TOP = (() => { const p = v3(0, 0.56, 0).applyMatrix4(M4(0, 0.42, 0.165, 0.2, 0, 0)); return p; })();

function chestDims() { return { W: 0.92, D: 0.58, Hb: 0.46, R: 0.29, ky: 0.58 }; }

function buildChest(open) {
  const kit = new Kit(), rnd = mulberry32(open ? 3031 : 3030);
  const { W, D, Hb, R, ky } = chestDims();
  const t = 0.045;
  const centre = v3(0, Hb / 2, 0);
  const inner = (p, n, c) => {
    const toC = v3(centre.x - p.x, 0, centre.z - p.z);
    const inside = toC.lengthSq() > 0 && n.dot(toC.normalize()) > 0.5;
    c.setScalar(inside ? 0.32 : 1);
  };
  kit.add('planks', boxUV(bbox(W, Hb, t, 0.006), 2.2, 'x'), M4(0, Hb / 2, D / 2 - t / 2), inner);
  kit.add('planks', boxUV(bbox(W, Hb, t, 0.006), 2.2, 'x', 0.3), M4(0, Hb / 2, -D / 2 + t / 2), inner);
  for (const s of [-1, 1]) kit.add('planks', boxUV(bbox(t, Hb, D - 2 * t, 0.006), 2.2, 'z', 0.6), M4(s * (W / 2 - t / 2), Hb / 2, 0), inner);
  kit.add('planks', boxUV(bbox(W - 2 * t, 0.04, D - 2 * t, 0.004), 2.2, 'x'), M4(0, 0.03, 0), (p, n, c) => c.setScalar(0.3));
  // Iron: straps, base and rim bands, corner plates, lock.
  const ironC = () => { const k = 0.85 + 0.15 * rnd(); return (p, n, c) => c.setScalar(k); };
  for (const x of [-0.3, 0.3]) {
    kit.add('iron', boxUV(bbox(0.06, Hb + 0.004, 0.012, 0.003), 3), M4(x, Hb / 2, D / 2 + 0.006), ironC());
    kit.add('iron', boxUV(bbox(0.06, Hb + 0.004, 0.012, 0.003), 3), M4(x, Hb / 2, -D / 2 - 0.006), ironC());
    for (const y of [0.08, 0.22, 0.36]) { rivet(kit, x, y, D / 2 + 0.012); rivet(kit, x, y, -D / 2 - 0.012, Math.PI); }
  }
  for (const y of [0.04, Hb - 0.03]) {
    for (const s of [-1, 1]) {
      kit.add('iron', boxUV(bbox(W + 0.02, 0.045, 0.01, 0.003), 3), M4(0, y, s * (D / 2 + 0.005)), ironC());
      kit.add('iron', boxUV(bbox(0.01, 0.045, D + 0.02, 0.003), 3), M4(s * (W / 2 + 0.005), y, 0), ironC());
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.add('iron', boxUV(bbox(0.075, Hb + 0.01, 0.014, 0.003), 3), M4(sx * (W / 2 - 0.03), Hb / 2, sz * (D / 2 + 0.008)));
    kit.add('iron', boxUV(bbox(0.014, Hb + 0.01, 0.075, 0.003), 3), M4(sx * (W / 2 + 0.008), Hb / 2, sz * (D / 2 - 0.03)));
  }
  kit.add('iron', boxUV(bbox(0.13, 0.15, 0.016, 0.004), 3), M4(0, Hb - 0.1, D / 2 + 0.012));
  kit.add('iron', bbox(0.018, 0.04, 0.01, 0.002), M4(0, Hb - 0.11, D / 2 + 0.021), (p, n, c) => c.setScalar(0.05));
  // Handles on the ends.
  for (const s of [-1, 1]) kit.add('iron', new THREE.TorusGeometry(0.05, 0.008, 5, 12, Math.PI), M4(s * (W / 2 + 0.02), Hb * 0.72, 0, Math.PI, s * Math.PI / 2, 0));
  // Lid: a barrel-vaulted shell hinged along the back top edge.
  const lid = new Kit();
  const shell = (r, open_) => {
    const g = new THREE.CylinderGeometry(r, r, W, 12, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    g.scale(1, ky, 1);
    return open_ ? flip(g) : g;
  };
  lid.add('planks', boxUV(shell(R, false), 2.2, 'x'), M4(0, 0, D / 2));
  lid.add('planks', boxUV(shell(R - 0.03, true), 2.2, 'x'), M4(0, 0, D / 2), (p, n, c) => c.setScalar(0.35));
  for (const s of [-1, 1]) {
    const cap = new THREE.CircleGeometry(R, 12, 0, Math.PI);
    cap.scale(1, ky, 1);
    lid.add('planks', boxUV(cap, 2.2, 'z'), M4(s * W / 2, 0, D / 2, 0, s * Math.PI / 2, 0));
  }
  for (const x of [-0.3, 0.3]) {
    const band = new THREE.CylinderGeometry(R + 0.008, R + 0.008, 0.06, 12, 1, true, 0, Math.PI);
    band.rotateZ(Math.PI / 2); band.scale(1, ky * (R + 0.012) / (R + 0.008), 1);
    lid.add('iron', band, M4(x, 0, D / 2));
  }
  for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) {
    const band = new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.05, 12, 1, true, 0, Math.PI);
    band.rotateZ(Math.PI / 2); band.scale(1, ky * (R + 0.01) / (R + 0.006), 1);
    lid.add('iron', band, M4(x, 0, D / 2));
  }
  lid.add('iron', bbox(0.05, 0.11, 0.012, 0.003), M4(0, -0.035, D + 0.012));
  const lidAngle = open ? -1.95 : 0;
  const lm = M4(0, Hb, -D / 2, lidAngle, 0, 0);
  for (const [key, list] of lid.parts) for (const g of list) kit.add(key, g, lm);
  if (open) {
    // A heap of coins inside and a spill over the lip.
    const heap = new THREE.SphereGeometry(1, 16, 6, 0, TAU, 0, Math.PI / 2);
    const P = heap.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      P.setY(i, y * (1 + 0.25 * (fbm3(x * 3, y * 3, z * 3, 2, 31) - 0.5)));
    }
    heap.computeVertexNormals();
    kit.add('coinHeap', heap, M4(0, Hb - 0.1, 0.01, 0, 0, 0, W / 2 - 0.06, 0.13, D / 2 - 0.06), (p, n, c) => c.setScalar(0.75 + 0.25 * smooth(Hb - 0.1, Hb + 0.03, p.y)));
    const coin = () => new THREE.CylinderGeometry(0.022, 0.022, 0.004, 12);
    const spots = [];
    const heapY = (x, z) => Hb - 0.1 + 0.13 * Math.sqrt(Math.max(0, 1 - (x / (W / 2 - 0.06)) ** 2 - (z / (D / 2 - 0.06)) ** 2)) + 0.002;
    for (let i = 0; i < 12; i++) { const x = (rnd() - 0.5) * 0.66, z = (rnd() - 0.5) * 0.36; spots.push([x, heapY(x, z), z, 0.45]); }
    for (let i = 0; i < 9; i++) spots.push([(rnd() - 0.5) * 0.6, 0.004, D / 2 + 0.05 + rnd() * 0.35, 0.15]);
    for (let i = 0; i < 4; i++) spots.push([0.12 + i * 0.004, 0.002 + i * 0.0042, D / 2 + 0.22, 0.02]);
    spots.push([-0.1, Hb + 0.01, D / 2 + 0.01, 1.2]);
    spots.push([0.18, 0.2, D / 2 + 0.04, 1.45]);
    for (const [x, y, z, tl] of spots) { const k = 0.8 + 0.2 * rnd(); kit.add('gold', coin(), M4(x, y, z, (rnd() - 0.5) * tl, rnd() * TAU, (rnd() - 0.5) * tl), (p, n, c) => c.setScalar(k)); }
    // A chalice and a few gems.
    kit.add('gold', lathe([[0.04, 0], [0.012, 0.012], [0.009, 0.06], [0.02, 0.075], [0.045, 0.1], [0.05, 0.14], [0.044, 0.142], [0.04, 0.105], [0.0005, 0.09]], 12), M4(-0.24, Hb - 0.035, -0.05, 0.25, 0, -0.3));
    for (const [x, y, z, s] of [[0.15, Hb + 0.025, -0.05, 0.03], [-0.04, Hb + 0.03, 0.08, 0.024], [0.28, Hb + 0.01, 0.1, 0.022]]) kit.add('gem', new THREE.OctahedronGeometry(s, 0), M4(x, y, z, rnd(), rnd(), 0, 1, 1.3, 1));
  }
  return kit.build();
}

function buildAltar() {
  const kit = new Kit();
  const ao = (p, n, c) => c.setScalar(0.62 + 0.38 * smooth(0.0, 0.5, p.y));
  kit.add('dressed', boxUV(bbox(2.4, 0.18, 1.18, 0.035), 0.9), M4(0, 0.09, 0), ao);
  kit.add('dressed', boxUV(bbox(2.1, 0.74, 0.92, 0.02), 0.9, 'x', 0.4), M4(0, 0.18 + 0.37, 0), ao);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add('dressed', boxUV(bbox(0.15, 0.76, 0.15, 0.02), 0.9, 'y'), M4(sx * 1.03, 0.18 + 0.38, sz * 0.44), ao);
  // Carved panels: three down each side, one on each end (BoxGeometry faces carry 0..1 uvs).
  const panel = (w, h) => new THREE.BoxGeometry(w, h, 0.03);
  for (const s of [-1, 1]) {
    for (const x of [-0.64, 0, 0.64]) kit.add('carved', panel(0.56, 0.54), M4(x, 0.56, s * 0.465, 0, s > 0 ? 0 : Math.PI, 0), ao);
    kit.add('carved', panel(0.62, 0.54), M4(s * 1.055, 0.56, 0, 0, s * Math.PI / 2, 0), ao);
  }
  // Moulding under the lid and the lid itself, with a ridge and a sword in relief.
  kit.add('dressed', boxUV(bbox(2.2, 0.06, 1.0, 0.02), 0.9), M4(0, 0.95, 0));
  kit.add('dressed', boxUV(bbox(2.3, 0.15, 1.08, 0.04), 0.9, 'x', 0.2), M4(0, 1.05, 0));
  kit.add('dressed', boxUV(bbox(2.05, 0.07, 0.82, 0.03), 0.9, 'x', 0.7), M4(0, 1.155, 0));
  const sw = new THREE.Shape();
  sw.moveTo(-0.68, 0); sw.lineTo(-0.58, -0.04); sw.lineTo(0.3, -0.035); sw.lineTo(0.3, -0.16); sw.lineTo(0.35, -0.16); sw.lineTo(0.35, -0.025);
  sw.lineTo(0.5, -0.022); sw.lineTo(0.5, 0.022); sw.lineTo(0.35, 0.025); sw.lineTo(0.35, 0.16); sw.lineTo(0.3, 0.16); sw.lineTo(0.3, 0.035); sw.lineTo(-0.58, 0.04);
  const sword = new THREE.ExtrudeGeometry(sw, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
  sword.rotateX(-Math.PI / 2);
  kit.add('dressed', boxUV(sword, 0.9), M4(-0.05, 1.19, 0));
  kit.add('dressed', new THREE.SphereGeometry(0.045, 10, 6), M4(0.5, 1.19, 0, 0, 0, 0, 1, 0.55, 1));
  return kit.build();
}

function buildSignpost() {
  const kit = new Kit(), rnd = mulberry32(4040);
  kit.add('wood', boxUV(bbox(0.13, 2.4, 0.13, 0.018), 1.2, 'y'), M4(0, 1.1, 0, 0, 0.1, 0.015), (p, n, c) => c.setScalar(0.55 + 0.45 * smooth(-0.1, 0.8, p.y)));
  kit.add('woodDark', new THREE.ConeGeometry(0.13, 0.13, 4), M4(0.018, 2.36, 0, 0, Math.PI / 4 + 0.1, 0.015));
  const arrow = new THREE.Shape();
  arrow.moveTo(0, -0.1); arrow.lineTo(0.74, -0.1); arrow.lineTo(0.88, 0); arrow.lineTo(0.74, 0.1); arrow.lineTo(0, 0.1);
  const board = () => planarUV(new THREE.ExtrudeGeometry(arrow, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 }), -0.006, 0.886, -0.106, 0.106);
  const b1 = board(); b1.translate(-0.12, 0, 0.07);
  kit.add('sign', b1, M4(0.012, 1.95, 0, 0, 0.35, -0.03));
  const b2 = board(); b2.translate(-0.12, 0, 0.07);
  kit.add('sign', b2, M4(0.006, 1.62, 0, 0, Math.PI + 0.55, 0.05));
  for (const [y, ry] of [[1.95, 0.35], [1.62, Math.PI + 0.55]]) {
    for (const yy of [-0.05, 0.05]) {
      const p = v3(0.0, yy, 0.105).applyMatrix4(M4(0, y, 0, 0, ry, 0));
      rivet(kit, p.x, p.y, p.z, ry);
    }
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rnd(), r = 0.16 + rnd() * 0.06;
    kit.add('rock', rockGeo(0.09 + rnd() * 0.04, 1, 4100 + i, { amp: 0.5, cuts: 3, squash: [1.2, 0.75, 1], sink: 0.2 }), M4(Math.cos(a) * r, 0, Math.sin(a) * r, 0, rnd() * TAU, 0), rockPaint(0.2, '#b0a89c', i));
  }
  return kit.build();
}

function crateInto(kit, m, S = 0.8) {
  const t = 0.07, add = (key, g, mm, fn) => kit.add(key, g, new THREE.Matrix4().multiplyMatrices(m, mm), fn);
  const ao = (p, n, c) => c.setScalar(0.7 + 0.3 * smooth(0, S, p.y));
  add('planks', boxUV(bbox(S - 0.03, S - 0.03, S - 0.03, 0.005), 1.6, 'x'), M4(0, S / 2, 0));
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) add('woodDark', boxUV(bbox(S, t, t, 0.01), 1.5, 'x'), M4(0, S / 2 + sy * (S / 2 - t / 2), sz * (S / 2 - t / 2)), ao);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('woodDark', boxUV(bbox(t, S - 2 * t, t, 0.01), 1.5, 'y', 0.3), M4(sx * (S / 2 - t / 2), S / 2, sz * (S / 2 - t / 2)), ao);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) add('woodDark', boxUV(bbox(t, t, S - 2 * t, 0.01), 1.5, 'z', 0.6), M4(sx * (S / 2 - t / 2), S / 2 + sy * (S / 2 - t / 2), 0), ao);
  const diag = Math.SQRT2 * (S - 2 * t);
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2;
    add('woodDark', boxUV(bbox(diag, t * 0.85, 0.022, 0.006), 1.5, 'x', f * 0.2), new THREE.Matrix4().multiplyMatrices(M4(0, S / 2, 0, 0, ry, 0), M4(0, 0, S / 2 - 0.004, 0, 0, f % 2 ? Math.PI / 4 : -Math.PI / 4)), ao);
  }
}

function buildCrate() {
  const kit = new Kit();
  crateInto(kit, new THREE.Matrix4());
  return kit.build();
}

function barrelInto(kit, m) {
  const H = 0.95, Rm = 0.36, Re = 0.29, add = (key, g, mm, fn) => kit.add(key, g, new THREE.Matrix4().multiplyMatrices(m, mm), fn);
  const rAt = (y) => Re + (Rm - Re) * Math.sin(Math.PI * y / H);
  const prof = [];
  for (let i = 0; i <= 10; i++) { const y = (i / 10) * H; prof.push([rAt(y), y]); }
  prof.push([Re - 0.022, H], [Re - 0.022, H - 0.03]);
  const body = lathe(prof, 20);
  const U = body.attributes.uv, P = body.attributes.position;
  for (let i = 0; i < U.count; i++) U.setY(i, P.getY(i) / H);
  add('staves', body, M4(), (p, n, c) => c.setScalar(p.y > H - 0.005 && n.y < 0.5 && Math.hypot(p.x, p.z) < Re - 0.01 ? 0.45 : 0.6 + 0.4 * smooth(0, 0.35, p.y)));
  for (const y0 of [0.08, 0.26, H - 0.26, H - 0.08]) {
    const r = rAt(y0);
    add('iron', lathe([[r - 0.002, y0 - 0.032], [r + 0.011, y0 - 0.03], [r + 0.012, y0 + 0.03], [r - 0.002, y0 + 0.032]], 20), M4());
  }
  const lid = new THREE.CircleGeometry(Re - 0.022, 20);
  lid.rotateX(-Math.PI / 2);
  add('planks', boxUV(lid, 2.4, 'x'), M4(0, H - 0.03, 0), (p, n, c) => c.setScalar(0.8));
  add('woodDark', new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8), M4(0.09, H - 0.02, 0.05));
}

function buildBarrel() {
  const kit = new Kit();
  barrelInto(kit, new THREE.Matrix4());
  return kit.build();
}

// Banner cloth: a grid hanging from y = 0 down to y = -len, with a swallowtail notch.
const BANNER = { w: 0.8, len: 1.55, notch: 0.32, cols: 10, rows: 16 };

function bannerCloth() {
  const { w, len, notch, cols, rows } = BANNER;
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const u = c / cols, depth = len - notch * (1 - Math.abs(2 * u - 1));
      const y = -(r / rows) * depth;
      pos.push((u - 0.5) * w, y, 0);
      uv.push(u, 1 + y / len);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + cols + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.rest = Float32Array.from(pos);
  return g;
}

function buildBannerPole() {
  const kit = new Kit(), rnd = mulberry32(5050);
  kit.add('woodDark', tube(curve([[0, -0.1, 0], [0, 1.5, 0], [0, 2.86, 0]]), steps(3), () => 0.042, 8, { vScale: 0.8 }), null, (p, n, c) => c.setScalar(0.6 + 0.4 * smooth(0, 0.6, p.y)));
  kit.add('iron', lathe([[0.046, 2.82], [0.05, 2.86], [0.03, 2.9], [0.012, 2.92], [0.04, 2.98], [0.045, 3.0], [0.006, 3.12], [0.0005, 3.13]], 8));
  kit.add('woodDark', tube(curve([[-0.52, 2.68, 0], [0, 2.68, 0], [0.52, 2.68, 0]]), steps(2), () => 0.024, 7, { vScale: 0.8 }));
  for (const s of [-1, 1]) kit.add('iron', new THREE.SphereGeometry(0.034, 8, 6), M4(s * 0.54, 2.68, 0));
  kit.add('iron', lathe([[0.05, 2.62], [0.055, 2.66], [0.055, 2.7], [0.05, 2.74]], 8));
  kit.add('iron', lathe([[0.05, 0.0], [0.058, 0.02], [0.058, 0.3], [0.05, 0.32]], 8));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rnd(), r = 0.13 + rnd() * 0.06;
    kit.add('rock', rockGeo(0.08 + rnd() * 0.04, 1, 5100 + i, { amp: 0.5, cuts: 3, squash: [1.2, 0.8, 1], sink: 0.2 }), M4(Math.cos(a) * r, 0, Math.sin(a) * r, 0, rnd() * TAU, 0), rockPaint(0.2, '#b0a89c', i));
  }
  return kit.build();
}

function buildWell() {
  const kit = new Kit(), rnd = mulberry32(6060);
  const Ro = 0.8, Ri = 0.56, Rm = (Ro + Ri) / 2;
  const block = (w, h, d, seed) => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const P = g.attributes.position, p = v3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i);
      p.x = Math.max(-1, Math.min(1, p.x * 1.32)) * w / 2;
      p.y = Math.max(-1, Math.min(1, p.y * 1.32)) * h / 2;
      p.z = Math.max(-1, Math.min(1, p.z * 1.32)) * d / 2;
      p.multiplyScalar(1 + (fbm3(p.x * 6 + seed, p.y * 6, p.z * 6, 2, 61) - 0.5) * 0.12);
      P.setXYZ(i, p.x, p.y, p.z);
    }
    g.deleteAttribute('normal');
    g.computeVertexNormals();
    return boxUV(g, 1.4, 'x', seed * 0.13);
  };
  const courses = 3, per = 11, bh = 0.22;
  for (let k = 0; k < courses; k++) {
    for (let i = 0; i < per; i++) {
      const a = ((i + (k % 2) * 0.5) / per) * TAU;
      const w = (TAU * Rm / per) * 0.97;
      const s = 0.92 + rnd() * 0.12;
      kit.add('stone', block(w, bh * 0.95 * s, (Ro - Ri) * (0.95 + rnd() * 0.08), k * 20 + i), M4(Math.cos(a) * Rm, 0.11 + k * bh, Math.sin(a) * Rm, 0, -a + Math.PI / 2, 0), rockPaint(0.9, '#c9c0b2', k * 20 + i));
    }
  }
  const per2 = 12;
  for (let i = 0; i < per2; i++) {
    const a = ((i + 0.25) / per2) * TAU;
    kit.add('stone', block((TAU * (Rm + 0.02) / per2) * 0.98, 0.11, Ro - Ri + 0.1, 99 + i), M4(Math.cos(a) * (Rm + 0.02), 0.71, Math.sin(a) * (Rm + 0.02), 0, -a + Math.PI / 2, 0), rockPaint(0.9, '#d4ccbf', 99 + i));
  }
  const shaft = flip(new THREE.CylinderGeometry(Ri + 0.02, Ri + 0.02, 0.86, 16, 1, true));
  kit.add('rock', shaft, M4(0, 0.33, 0), (p, n, c) => c.setScalar(0.08 + 0.3 * smooth(-0.1, 0.75, p.y)));
  const water = new THREE.CircleGeometry(Ri + 0.03, 18);
  water.rotateX(-Math.PI / 2);
  kit.add('water', water, M4(0, 0.06, 0));
  // Posts, roof, windlass, rope and bucket.
  const postX = Ro + 0.04;
  for (const s of [-1, 1]) {
    kit.add('wood', boxUV(bbox(0.12, 2.1, 0.12, 0.016), 1.2, 'y', s), M4(s * postX, 1.05, 0), (p, n, c) => c.setScalar(0.6 + 0.4 * smooth(0, 0.8, p.y)));
    kit.add('wood', boxUV(bbox(0.08, 0.5, 0.08, 0.01), 1.2, 'y'), M4(s * (postX - 0.2), 1.92, 0, 0, 0, s * 0.8));
  }
  const ridgeY = 2.42, slope = 0.62, panelW = 0.86;
  for (const side of [0, 1]) {
    const pm = M4(0, 0, 0, 0, side * Math.PI, 0).multiply(M4(0, ridgeY - Math.sin(slope) * panelW / 2 - 0.02, Math.cos(slope) * panelW / 2, slope, 0, 0));
    const pg = finish(bbox(2.15, 0.05, panelW, 0.012));
    const U = pg.attributes.uv, P = pg.attributes.position;
    for (let i = 0; i < P.count; i++) U.setXY(i, P.getX(i) * 0.9, -P.getZ(i) * 1.1);
    kit.add('shingles', pg, pm, (p, n, c) => c.setScalar(n.y < 0 ? 0.4 : 1));
  }
  kit.add('woodDark', boxUV(bbox(2.25, 0.1, 0.1, 0.012), 1.2), M4(0, ridgeY, 0, Math.PI / 4, 0, 0));
  kit.add('woodDark', boxUV(bbox(2.0, 0.1, 0.1, 0.012), 1.2), M4(0, 2.06, 0));
  kit.add('wood', tube(curve([[-postX, 1.38, 0], [0, 1.38, 0], [postX + 0.1, 1.38, 0]]), steps(2), () => 0.065, 10), null, (p, n, c) => c.setScalar(0.85));
  kit.add('rope', tube(curve([[-0.18, 1.38, 0], [0, 1.38, 0], [0.18, 1.38, 0]]), steps(2), () => 0.085, 12, { uRep: 3, vScale: 6 }));
  kit.add('iron', tube(curve([[postX + 0.1, 1.38, 0], [postX + 0.14, 1.38, 0], [postX + 0.14, 1.2, 0.02], [postX + 0.14, 1.12, 0.03]]), steps(4), () => 0.012, 6));
  kit.add('woodDark', tube(curve([[postX + 0.14, 1.13, 0.03], [postX + 0.26, 1.13, 0.03]]), steps(1), () => 0.018, 6));
  kit.add('rope', tube(curve([[0, 1.31, 0.075], [0.005, 1.2, 0.08], [0.01, 1.12, 0.08]]), steps(3), () => 0.011, 5, { uRep: 1, vScale: 8 }));
  const bm = M4(0.01, 0.78, 0.08, 0.05, 0.4, 0);
  kit.add('staves', lathe([[0.1, 0], [0.13, 0.22], [0.115, 0.22], [0.088, 0.02]], 14), bm, (p, n, c) => c.setScalar(0.85));
  kit.add('woodDark', new THREE.CircleGeometry(0.1, 12), new THREE.Matrix4().multiplyMatrices(bm, M4(0, 0.02, 0, -Math.PI / 2, 0, 0)), (p, n, c) => c.setScalar(0.4));
  for (const y of [0.04, 0.18]) kit.add('iron', lathe([[0.104 + y * 0.135, y - 0.012], [0.11 + y * 0.135, y - 0.01], [0.11 + y * 0.135, y + 0.01], [0.104 + y * 0.135, y + 0.012]], 14), bm);
  kit.add('iron', new THREE.TorusGeometry(0.13, 0.006, 4, 14, Math.PI), new THREE.Matrix4().multiplyMatrices(bm, M4(0, 0.22, 0)));
  return kit.build();
}

function buildCart() {
  const kit = new Kit(), rnd = mulberry32(7070);
  const wheelR = 0.48, axleY = wheelR, bedY = axleY + 0.16;
  const body = M4(0, bedY, 0);
  const add = (key, g, m, fn) => kit.add(key, g, new THREE.Matrix4().multiplyMatrices(body, m), fn);
  add('planks', boxUV(bbox(1.7, 0.06, 1.06, 0.008), 1.8, 'x'), M4(0, 0, 0));
  for (const s of [-1, 1]) {
    add('planks', boxUV(bbox(1.7, 0.26, 0.04, 0.008), 1.8, 'x', s * 0.3), M4(0, 0.16, s * 0.51));
    add('planks', boxUV(bbox(0.04, 0.26, 1.0, 0.008), 1.8, 'z', 0.5), M4(s * 0.83, 0.16, 0));
    add('woodDark', boxUV(bbox(2.95, 0.085, 0.085, 0.012), 1.4, 'x'), M4(0.62, -0.075, s * 0.42), (p, n, c) => c.setScalar(0.75));
    for (const x of [-0.82, 0, 0.82]) add('woodDark', boxUV(bbox(0.06, 0.38, 0.06, 0.01), 1.4, 'y'), M4(x, 0.17, s * 0.535));
  }
  add('woodDark', boxUV(bbox(0.08, 0.06, 0.9, 0.01), 1.4, 'z'), M4(2.0, -0.075, 0));
  add('woodDark', boxUV(bbox(0.07, bedY - 0.02, 0.07, 0.01), 1.4, 'y'), M4(1.55, -bedY / 2 - 0.02, 0.42, 0, 0, 0.05));
  add('woodDark', boxUV(bbox(0.07, bedY - 0.02, 0.07, 0.01), 1.4, 'y'), M4(1.55, -bedY / 2 - 0.02, -0.42, 0, 0, 0.05));
  add('iron', new THREE.CylinderGeometry(0.035, 0.035, 1.38, 8), M4(-0.1, -0.16, 0, Math.PI / 2, 0, 0));
  // Wheels.
  for (const s of [-1, 1]) {
    const wm = M4(-0.1, axleY, s * 0.64, Math.PI / 2, 0, 0);
    const wadd = (key, g, m, fn) => kit.add(key, g, new THREE.Matrix4().multiplyMatrices(wm, m), fn);
    wadd('wood', lathe([[0.4, -0.032], [0.462, -0.032], [0.462, 0.032], [0.4, 0.032], [0.4, -0.032]], 24), M4(), (p, n, c) => c.setScalar(0.85));
    wadd('iron', lathe([[0.462, -0.034], [0.478, -0.03], [0.478, 0.03], [0.462, 0.034]], 24), M4());
    wadd('woodDark', lathe([[0.04, -0.09], [0.075, -0.07], [0.085, 0], [0.075, 0.07], [0.04, 0.09]], 10), M4());
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      wadd('wood', boxUV(bbox(0.036, 0.34, 0.03, 0.006), 1.4, 'y'), M4(Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24, 0, -a, Math.PI / 2));
    }
  }
  // Cargo: sacks, a small crate and a barrel lying on its side.
  const sack = (seed) => {
    const g = new THREE.SphereGeometry(1, 14, 10);
    const P = g.attributes.position, p = v3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i);
      const neck = smooth(0.55, 0.95, p.y);
      p.x *= 1 - neck * 0.75; p.z *= 1 - neck * 0.75;
      if (p.y < -0.5) p.y = -0.5 - (p.y + 0.5) * 0.25;
      p.multiplyScalar(1 + (fbm3(p.x * 2.5 + seed, p.y * 2.5, p.z * 2.5, 3, 71) - 0.5) * 0.25);
      P.setXYZ(i, p.x, p.y, p.z);
    }
    g.computeVertexNormals();
    return g;
  };
  const sacks = [[-0.45, 0.25, -0.22, 0.26, 0.3, 0.2, 0.1], [-0.42, 0.25, 0.22, 0.25, 0.28, 0.22, -0.15], [0.05, 0.24, -0.25, 0.24, 0.27, 0.22, 0.3], [-0.2, 0.47, 0.0, 0.22, 0.25, 0.2, 1.2]];
  sacks.forEach(([x, y, z, sx, sy, sz, rz], i) => {
    const m = M4(x, y, z, 0, rnd() * TAU, rz, sx, sy, sz);
    add('burlap', boxUV(sack(i), 4, 'y'), m, (p, n, c) => c.setScalar(0.75 + 0.25 * Math.max(0, n.y)));
    const tie = new THREE.TorusGeometry(0.27, 0.06, 5, 10);
    tie.rotateX(Math.PI / 2);
    add('rope', tie, new THREE.Matrix4().multiplyMatrices(m, M4(0, 0.82, 0)));
  });
  crateInto(kit, new THREE.Matrix4().multiplyMatrices(body, M4(0.45, 0.03, 0.18, 0, 0.25, 0)), 0.45);
  return kit.build();
}

function buildBones() {
  const kit = new Kit(), rnd = mulberry32(8080);
  const dark = (p, n, c) => c.setScalar(0.04);
  const boneC = (p, n, c) => c.setScalar(0.72 + 0.28 * smooth(0, 0.08, p.y));
  // Skull, lying a little askew.
  const sk = M4(0, 0, 0, -0.12, 0.5, 0.18);
  const sadd = (key, g, m, fn) => kit.add(key, g, new THREE.Matrix4().multiplyMatrices(sk, m), fn);
  const cran = new THREE.SphereGeometry(0.1, 18, 12);
  const P = cran.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const brow = Math.exp(-((y + 0.005) ** 2) / 0.0004) * smooth(0.04, 0.08, z) * 0.012;
    P.setXYZ(i, x * 0.8 * (1 - 0.08 * smooth(0.0, -0.06, y)), y * 0.84, z + brow);
  }
  cran.computeVertexNormals();
  sadd('bone', cran, M4(0, 0.1, -0.012), boneC);
  sadd('bone', new THREE.SphereGeometry(0.052, 12, 8), M4(0, 0.045, 0.058, 0, 0, 0, 1.05, 0.85, 0.85), boneC);
  for (const s of [-1, 1]) {
    sadd('bone', new THREE.SphereGeometry(0.024, 8, 6), M4(s * 0.05, 0.058, 0.06), boneC);
    sadd('bone', new THREE.SphereGeometry(0.025, 10, 6), M4(s * 0.033, 0.077, 0.071, 0, 0, s * 0.3, 1.0, 0.82, 0.5), dark);
  }
  sadd('bone', new THREE.SphereGeometry(0.012, 6, 4), M4(0, 0.05, 0.096, 0, 0, 0, 0.8, 1.3, 0.5), dark);
  for (let i = 0; i < 8; i++) {
    const a = ((i - 3.5) / 7) * 1.5;
    sadd('bone', bbox(0.011, 0.016, 0.009, 0.002), M4(Math.sin(a) * 0.04, 0.018, 0.05 + Math.cos(a) * 0.04, 0, a, 0), (p, n, c) => c.setScalar(0.95));
  }
  sadd('bone', tube(curve([[-0.045, 0.035, 0.0], [-0.042, 0.004, 0.045], [0, -0.002, 0.082], [0.042, 0.004, 0.045], [0.045, 0.035, 0.0]]), steps(8), () => 0.011, 6), M4(0, 0, 0.005), boneC);
  // Long bones with knobbled ends.
  const longBone = (len, r) => tube(curve([[-len / 2, 0, 0], [0, 0, 0], [len / 2, 0, 0]]), [0, 0.03, 0.08, 0.15, 0.3, 0.5, 0.7, 0.85, 0.92, 0.97, 1], (t, th) => {
    const e = Math.exp(-((t / 0.07) ** 2)) + Math.exp(-(((1 - t) / 0.07) ** 2));
    const end = (t < 0.02 || t > 0.98) ? 0.55 : 1;
    return r * (1 + 0.9 * e * (1 + 0.35 * Math.cos(2 * th))) * end;
  }, 8);
  kit.add('bone', longBone(0.44, 0.017), M4(0.3, 0.03, 0.12, 0, 1.0, 0), boneC);
  kit.add('bone', longBone(0.36, 0.014), M4(0.22, 0.05, -0.12, 0.05, -0.5, 0.06), boneC);
  kit.add('bone', longBone(0.26, 0.011), M4(-0.28, 0.02, 0.2, 0, 0.3, 0), boneC);
  // Ribs.
  for (let i = 0; i < 4; i++) {
    const rib = tube(curve([[0, 0, 0], [0.09, 0.0, 0.08], [0.2, 0.0, 0.09], [0.28, 0, 0.03]]), steps(6), (t, th) => 0.008 * (1 + 0.45 * Math.cos(2 * th)) * (1 - t * 0.3), 5);
    kit.add('bone', rib, M4(-0.32 + i * 0.05, 0.012, -0.1 - i * 0.07, 0.05, 0.6 + i * 0.15, 0.03), boneC);
  }
  // A couple of vertebrae.
  for (let i = 0; i < 3; i++) {
    kit.add('bone', lathe([[0.02, 0], [0.026, 0.008], [0.022, 0.02], [0.026, 0.032], [0.02, 0.04]], 8), M4(-0.05 + i * 0.045, 0.018, 0.3 - i * 0.02, Math.PI / 2, rnd(), 0), boneC);
  }
  return kit.build();
}

function buildBrazier() {
  const kit = new Kit();
  kit.add('iron', lathe([[0.0005, 0.6], [0.12, 0.6], [0.26, 0.66], [0.35, 0.77], [0.4, 0.85], [0.43, 0.87], [0.42, 0.885], [0.39, 0.865], [0.33, 0.79], [0.24, 0.7], [0.0005, 0.67]], 20));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    kit.add('iron', new THREE.ConeGeometry(0.018, 0.09, 5), M4(Math.cos(a) * 0.425, 0.92, Math.sin(a) * 0.425, 0, -a, 0.2));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU, d = v3(Math.cos(a), 0, Math.sin(a));
    const pt = (r, y) => d.clone().multiplyScalar(r).setY(y);
    kit.add('iron', tube(curve([pt(0.16, 0.66), pt(0.26, 0.5), pt(0.33, 0.25), pt(0.39, 0.05), pt(0.46, 0.04), pt(0.47, 0.1)]), steps(10), () => 0.02, 6));
    kit.add('iron', new THREE.SphereGeometry(0.035, 8, 5), M4(d.x * 0.4, 0.025, d.z * 0.4, 0, 0, 0, 1.4, 0.6, 1.4));
  }
  const ring = new THREE.TorusGeometry(0.315, 0.012, 5, 28);
  ring.rotateX(Math.PI / 2);
  kit.add('iron', ring, M4(0, 0.3, 0));
  const coal = new THREE.SphereGeometry(0.34, 18, 6, 0, TAU, 0, Math.PI / 2);
  const P = coal.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    P.setY(i, y * (1 + 0.6 * (fbm3(x * 9, y * 9, z * 9, 2, 5) - 0.5)));
  }
  coal.computeVertexNormals();
  kit.add('ember', coal, M4(0, 0.76, 0, 0, 0, 0, 1, 0.32, 1));
  return kit.build();
}

const PROP_BUILDERS = {
  campfire: buildCampfire, torch: buildTorch, chest: () => buildChest(false), chestopen: () => buildChest(true), altar: buildAltar,
  signpost: buildSignpost, crate: buildCrate, barrel: buildBarrel, bannerCrimson: buildBannerPole, bannerAzure: buildBannerPole,
  well: buildWell, cart: buildCart, bones: buildBones, brazier: buildBrazier,
};
const _props = new Map();

function staticGroup(kind) {
  const cacheKey = kind === 'bannerAzure' ? 'bannerCrimson' : kind;
  if (!_props.has(cacheKey)) _props.set(cacheKey, PROP_BUILDERS[kind]());
  const g = new THREE.Group();
  g.name = kind;
  for (const { geometry, material } of _props.get(cacheKey)) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

export function makeProp(kind) {
  if (!PROP_BUILDERS[kind]) throw new Error(`props-hd: unknown prop '${kind}'`);
  const g = staticGroup(kind);
  if (kind === 'campfire') {
    const fire = makeFire({ scale: 1, n: 6, cores: 2, sparks: 8, light: { color: '#ff8a3a', intensity: 14, distance: 11 }, lightY: 0.55 });
    fire.group.position.y = 0.05;
    g.add(fire.group);
    g.userData.light = fire.light;
    g.userData.update = fire.update;
  } else if (kind === 'brazier') {
    const fire = makeFire({ scale: 0.95, n: 6, cores: 2, sparks: 6, light: { color: '#ff8a3a', intensity: 12, distance: 10 }, lightY: 0.5 });
    fire.group.position.y = 0.8;
    g.add(fire.group);
    g.userData.light = fire.light;
    g.userData.update = fire.update;
  } else if (kind === 'torch') {
    // The sconce and haft sit right under the flame, so they must not shadow the torch's own light.
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } });
    const fire = makeFire({ scale: 0.42, n: 4, cores: 1, sparks: 3, light: { color: '#ff9445', intensity: 10, distance: 8 }, lightY: 0.5 });
    fire.group.position.copy(TORCH_TOP).add(v3(0, -0.04, 0));
    g.add(fire.group);
    g.userData.light = fire.light;
    g.userData.update = fire.update;
  } else if (kind === 'bannerCrimson' || kind === 'bannerAzure') {
    const geo = bannerCloth();
    const cloth = new THREE.Mesh(geo, M(kind === 'bannerCrimson' ? 'clothCrimson' : 'clothAzure'));
    cloth.castShadow = true;
    cloth.receiveShadow = true;
    cloth.position.set(0, 2.66, 0.07);
    g.add(cloth);
    const rest = geo.userData.rest, P = geo.attributes.position, ph = _phase++ * 1.7;
    g.userData.update = (t) => {
      for (let i = 0; i < P.count; i++) {
        const x = rest[i * 3], y = rest[i * 3 + 1];
        const d = -y, u = x / BANNER.w + 0.5, f = Math.pow(d / BANNER.len, 1.15);
        const z = f * (0.07 + 0.065 * Math.sin(2.6 * d - 2.1 * t + 2.4 * u + ph) + 0.04 * Math.sin(1.1 * t + ph + 0.8 * u)) + 0.012 * Math.sin(x * 9 + t * 1.7 + ph) * f;
        P.setXYZ(i, x + f * 0.025 * Math.sin(1.7 * t + d * 2 + ph), y + f * f * 0.02 * Math.cos(2.1 * t + u * 3 + ph), z);
      }
      P.needsUpdate = true;
      geo.computeVertexNormals();
    };
    g.userData.update(0);
  }
  return g;
}

/* ================================================================ shards */

const SHARD_SPEC = {
  sun: { color: '#ffc04a', emissive: '#ff9c1e', core: '#ffd27a', light: '#ffb347' },
  moon: { color: '#c4d8ff', emissive: '#6f9cff', core: '#dce8ff', light: '#a8c4ff' },
  star: { color: '#c39cff', emissive: '#8a4cff', core: '#d8b8ff', light: '#b07cff' },
};

function crystalGeo(seed, k = 7) {
  const rnd = mulberry32(seed);
  const rings = [[0.07, -0.17], [0.12, -0.05], [0.115, 0.12], [0.055, 0.24]];
  const R = rings.map(([r, y], ri) => Array.from({ length: k }, (_, i) => {
    const a = ((i + (ri % 2) * 0.5) / k) * TAU + (rnd() - 0.5) * 0.25, rr = r * (0.85 + rnd() * 0.3);
    return v3(Math.cos(a) * rr, y + (rnd() - 0.5) * 0.03, Math.sin(a) * rr);
  }));
  const bot = v3(0.004, -0.28, -0.005), top = v3(0.012, 0.31, 0.006);
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    tri(bot, R[0][i], R[0][j]);
    for (let r = 0; r < rings.length - 1; r++) {
      const A = R[r], B = R[r + 1];
      tri(A[i], B[i], A[j]);
      tri(A[j], B[i], B[j]);
    }
    const T = R[rings.length - 1];
    tri(T[i], top, T[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // Fix winding if the first face points inward.
  const n = v3(g.attributes.normal.getX(0), g.attributes.normal.getY(0), g.attributes.normal.getZ(0));
  const c = v3(pos[0] + pos[3] + pos[6], pos[1] + pos[4] + pos[7], pos[2] + pos[5] + pos[8]).multiplyScalar(1 / 3);
  return n.dot(c) < 0 ? flip(g) : finish(g);
}

const _shardMat = new Map();
function shardMats(id) {
  if (!_shardMat.has(id)) {
    const s = SHARD_SPEC[id];
    _shardMat.set(id, {
      shell: new THREE.MeshStandardMaterial({ color: s.color, emissive: s.emissive, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.8, flatShading: true, name: 'hd:shard:' + id }),
      core: new THREE.MeshStandardMaterial({ color: '#000000', emissive: s.core, emissiveIntensity: 3.2, roughness: 1, flatShading: true, name: 'hd:shardcore:' + id }),
    });
  }
  return _shardMat.get(id);
}
let _crystal = null;

export function makeShard(id) {
  if (!SHARD_SPEC[id]) id = 'sun';
  const spec = SHARD_SPEC[id], mats = shardMats(id);
  if (!_crystal) _crystal = { main: crystalGeo(9001), core: crystalGeo(9002, 6), chip: crystalGeo(9003, 5) };
  const g = new THREE.Group();
  g.name = 'shard-' + id;
  const pivot = new THREE.Group();
  pivot.position.y = 0.55;
  g.add(pivot);
  const shell = new THREE.Mesh(_crystal.main, mats.shell);
  shell.castShadow = true;
  shell.receiveShadow = true;
  shell.renderOrder = 1;
  pivot.add(shell);
  const core = noShadow(new THREE.Mesh(_crystal.core, mats.core));
  core.scale.set(0.45, 0.62, 0.45);
  pivot.add(core);
  const chips = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(_crystal.chip, mats.shell);
    c.castShadow = true;
    c.scale.setScalar(0.2 + i * 0.03);
    c.userData.a = (i / 3) * TAU;
    g.add(c);
    chips.push(c);
  }
  const light = new THREE.PointLight(spec.light, 3, 5, 2);
  light.position.y = 0.55;
  light.userData.base = 3;
  light.userData.baseColor = new THREE.Color(spec.light);
  g.add(light);
  g.userData.light = light;
  const ph = _phase++ * 1.3;
  g.userData.update = (t) => {
    pivot.rotation.y = t * 0.55 + ph;
    pivot.rotation.z = 0.06 * Math.sin(t * 0.7 + ph);
    pivot.position.y = 0.55 + 0.05 * Math.sin(t * 1.6 + ph);
    for (const c of chips) {
      const a = c.userData.a + t * 0.9 + ph;
      c.position.set(Math.cos(a) * 0.24, 0.5 + 0.08 * Math.sin(t * 1.3 + c.userData.a * 2), Math.sin(a) * 0.24);
      c.rotation.set(t * 1.1 + c.userData.a, t * 0.7, 0);
    }
    light.position.y = pivot.position.y;
    light.color.copy(light.userData.baseColor).multiplyScalar(0.88 + 0.12 * Math.sin(t * 2.2 + ph));
  };
  g.userData.update(0);
  return g;
}
