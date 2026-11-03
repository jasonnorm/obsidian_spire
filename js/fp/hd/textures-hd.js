// High-resolution procedural textures for the modern first-person mode.
//
// Every texture is painted from scratch at runtime into typed arrays: a colour
// buffer and a height field, plus an emissive buffer for the glowing ones.
// The height field is turned into a tangent-space normal map (OpenGL
// convention, +Y up, flat = 128,128,255) with a wrap-around Sobel filter, and
// the colour gets a little cavity shading from the same heights so the relief
// reads even under flat light. All noise (gradient fBm, ridged, Worley) and
// every brush stroke wraps, so the `tile: true` textures repeat seamlessly.
//
// Everything comes from seeded generators: the same name always gives the
// same pixels. Results are cached, so a second makeHD(name) call is free.
//
// No three.js in here: callers wrap the canvases themselves. Use
// SRGBColorSpace for `map` and `emissive`, and linear (NoColorSpace) for
// `normal`.

/* ================================================================ specs */

const S512 = [512, 512];

export const HD_SPECS = {
  heath: { size: S512, tile: true, metres: 6, roughness: 0.95, metalness: 0 },
  marsh: { size: S512, tile: true, metres: 6, roughness: 0.62, metalness: 0 },
  volcanic: { size: S512, tile: true, metres: 6, roughness: 0.82, metalness: 0 },
  snow: { size: S512, tile: true, metres: 6, roughness: 0.72, metalness: 0 },
  forest: { size: S512, tile: true, metres: 6, roughness: 0.95, metalness: 0 },
  desert: { size: S512, tile: true, metres: 6, roughness: 0.93, metalness: 0 },
  ash: { size: S512, tile: true, metres: 6, roughness: 0.96, metalness: 0 },
  road: { size: S512, tile: true, metres: 4, roughness: 0.92, metalness: 0 },
  cobble: { size: S512, tile: true, metres: 3, roughness: 0.78, metalness: 0 },
  stonewall: { size: S512, tile: true, metres: 3, roughness: 0.88, metalness: 0 },
  barrowwall: { size: S512, tile: true, metres: 3, roughness: 0.9, metalness: 0 },
  barrowfloor: { size: S512, tile: true, metres: 3, roughness: 0.8, metalness: 0 },
  barrowceil: { size: S512, tile: true, metres: 3, roughness: 0.94, metalness: 0 },
  obsidian: { size: S512, tile: true, metres: 6, roughness: 0.2, metalness: 0 },
  spirewall: { size: S512, tile: true, metres: 3, roughness: 0.3, metalness: 0 },
  spirefloor: { size: S512, tile: true, metres: 3, roughness: 0.24, metalness: 0 },
  wood: { size: S512, tile: true, metres: 2, roughness: 0.85, metalness: 0 },
  thatch: { size: S512, tile: true, metres: 2, roughness: 0.96, metalness: 0 },
  rooftile: { size: S512, tile: true, metres: 2, roughness: 0.74, metalness: 0 },
  canvas: { size: S512, tile: true, metres: 2, roughness: 0.92, metalness: 0 },
  marble: { size: S512, tile: true, metres: 3, roughness: 0.22, metalness: 0 },
  grassmound: { size: S512, tile: true, metres: 6, roughness: 0.95, metalness: 0 },
  water: { size: S512, tile: true, metres: 6, roughness: 0.06, metalness: 0 },
  gold: { size: S512, tile: true, metres: 1, roughness: 0.32, metalness: 1 },
  // Not tiled: the whole canvas is one doorway, 4.2 m wide by 6.3 m tall.
  door: { size: [512, 768], tile: false, metres: 4.2, roughness: 0.78, metalness: 0 },
  // Seamless in both directions, but meant to repeat horizontally only:
  // one tile is 12.8 m long by 3.2 m tall.
  runeband: { size: [1024, 256], tile: true, metres: 12.8, roughness: 0.38, metalness: 0 },
};

/* ================================================================ maths */

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => {
  let t = (v - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};
const fract = (v) => v - Math.floor(v);
const wrap = (v, n) => {
  v %= n;
  return v < 0 ? v + n : v;
};

function rng(seed) {
  let a = (Math.imul(seed | 0, 2654435761) ^ 0x5bd1e995) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash of a pixel index, 0..1. Used for per-pixel grain.
function hash1(i, s) {
  let h = Math.imul(i ^ Math.imul(s, 0x27d4eb2d), 0x2c1b3c6d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function C(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

// A 256-entry colour ramp from [[t, '#hex'], ...] stops.
function ramp(stops) {
  const s = stops.map(([t, c]) => [t, C(c)]);
  const lut = new Float32Array(256 * 3);
  for (let k = 0; k < 256; k++) {
    const v = k / 255;
    let j = 0;
    while (j < s.length - 2 && v > s[j + 1][0]) j++;
    const [t0, c0] = s[j];
    const [t1, c1] = s[j + 1];
    const f = clamp((v - t0) / (t1 - t0 || 1));
    for (let c = 0; c < 3; c++) lut[k * 3 + c] = c0[c] + (c1[c] - c0[c]) * f;
  }
  return lut;
}
const lutIdx = (v) => ((v < 0 ? 0 : v > 1 ? 255 : (v * 255) | 0) * 3);

/* ================================================================ scratch */

// Full-size scratch fields come from an arena that is recycled for every
// texture, so generating the whole set does not churn hundreds of megabytes
// through the garbage collector. The arena is dropped shortly after the last
// call, so it does not sit in memory for the rest of the game.
const POOL = new Map();
let poolTimer = 0;

function f32(n) {
  let p = POOL.get(n);
  if (!p) POOL.set(n, (p = { f: [], fu: 0, i: [], iu: 0 }));
  if (p.fu < p.f.length) {
    const a = p.f[p.fu++];
    a.fill(0);
    return a;
  }
  const a = new Float32Array(n);
  p.f.push(a);
  p.fu++;
  return a;
}

function i32(n) {
  let p = POOL.get(n);
  if (!p) POOL.set(n, (p = { f: [], fu: 0, i: [], iu: 0 }));
  if (p.iu < p.i.length) return p.i[p.iu++];
  const a = new Int32Array(n);
  p.i.push(a);
  p.iu++;
  return a;
}

function arenaReset() {
  for (const p of POOL.values()) {
    p.fu = 0;
    p.iu = 0;
  }
  clearTimeout(poolTimer);
  poolTimer = setTimeout(() => POOL.clear(), 2000);
}

/* ================================================================ noise */

// Tileable gradient noise added into `out`: cx by cy lattice cells across
// the w x h tile. Roughly -1..1 before scaling by amp. The four corner
// gradients are folded into per-row, per-cell constants, so the inner loop
// is a handful of multiply-adds.
function perlinInto(out, w, h, cx, cy, seed, amp) {
  const r = rng(seed);
  const n = cx * cy;
  const GX = new Float32Array(n);
  const GY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    GX[i] = Math.cos(a);
    GY[i] = Math.sin(a);
  }
  const FX = new Float32Array(w);
  const UX = new Float32Array(w);
  const XS = new Int32Array(cx + 1);
  XS.fill(w);
  for (let x = w - 1; x >= 0; x--) {
    const p = ((x + 0.5) * cx) / w;
    const i = Math.floor(p);
    const f = p - i;
    FX[x] = f;
    UX[x] = f * f * f * (f * (f * 6 - 15) + 10);
    XS[i] = x;
  }
  for (let c = cx - 1; c >= 0; c--) if (XS[c] > XS[c + 1]) XS[c] = XS[c + 1];
  const k = amp * 1.45;
  for (let y = 0; y < h; y++) {
    const p = ((y + 0.5) * cy) / h;
    const j = Math.floor(p);
    const fy = p - j;
    const fy1 = fy - 1;
    const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const vy = 1 - uy;
    const r0 = (j % cy) * cx;
    const r1 = ((j + 1) % cy) * cx;
    const o = y * w;
    for (let c = 0; c < cx; c++) {
      const x0 = XS[c];
      const x1 = XS[c + 1];
      if (x0 >= x1) continue;
      const c1 = c + 1 === cx ? 0 : c + 1;
      const a = r0 + c;
      const b = r0 + c1;
      const cc = r1 + c;
      const d = r1 + c1;
      const ka = (vy * GX[a] + uy * GX[cc]) * k;
      const kb = (vy * GY[a] * fy + uy * GY[cc] * fy1) * k;
      const kc = (vy * GX[b] + uy * GX[d]) * k;
      const kd = (vy * GY[b] * fy + uy * GY[d] * fy1) * k;
      for (let x = x0; x < x1; x++) {
        const fx = FX[x];
        const t0 = ka * fx + kb;
        out[o + x] += t0 + (kc * (fx - 1) + kd - t0) * UX[x];
      }
    }
  }
  return out;
}

// Tileable fBm, roughly -1..1 (mostly within +-0.6). Octaves whose cells
// are 16 px or wider are evaluated at half resolution and upsampled once
// (they are smooth enough that nothing is lost), the rest at full size.
function fbm(w, h, cx, cy, oct, seed, gain = 0.5) {
  const out = f32(w * h);
  let lowN = 0;
  let used = 0;
  let sum = 0;
  for (let k = 0, a = 1; k < oct; k++, a *= gain) {
    const ax = cx << k;
    const ay = cy << k;
    if (k > 0 && (ax > w / 2 || ay > h / 2)) break;
    // broad fields stop at 64 cells; finer grain comes from dedicated fields
    if (k >= 3 && Math.max(ax * (512 / w), ay * (512 / h)) > 64) break;
    if (w / ax >= 16 && h / ay >= 16) lowN++;
    used++;
    sum += a;
  }
  // amplitudes are normalised up front, so there is no final rescale pass
  let amp = 1 / sum;
  let o = 0;
  if (lowN >= 2 && !(w & 1) && !(h & 1)) {
    const w2 = w >> 1;
    const h2 = h >> 1;
    const lo = f32(w2 * h2);
    for (; o < lowN; o++, amp *= gain) perlinInto(lo, w2, h2, cx << o, cy << o, seed * 31 + o * 1013, amp);
    upsample2(lo, w2, h2, out, true);
  }
  for (; o < used; o++, amp *= gain) perlinInto(out, w, h, cx << o, cy << o, seed * 31 + o * 1013, amp);
  return out;
}

// Bilinear 2x upsample of a half-size field into `out` (adds); the edges
// wrap for tiling fields and clamp otherwise. At exactly 2x the bilinear
// weights are always 1/4 and 3/4, so each output row is one vertical lerp
// into a row buffer and a fixed-weight horizontal pass.
function upsample2(lo, w2, h2, out, wrapIt) {
  const w = w2 * 2;
  const h = h2 * 2;
  const t = new Float32Array(w2 + 2);
  for (let y = 0; y < h; y++) {
    const j = y >> 1;
    let ja = y & 1 ? j : j - 1;
    let jb = ja + 1;
    const fy = y & 1 ? 0.25 : 0.75;
    if (wrapIt) {
      ja = (ja + h2) % h2;
      jb %= h2;
    } else {
      ja = ja < 0 ? 0 : ja;
      jb = jb >= h2 ? h2 - 1 : jb;
    }
    const ra = ja * w2;
    const rb = jb * w2;
    for (let i = 0; i < w2; i++) {
      const a = lo[ra + i];
      t[i + 1] = a + (lo[rb + i] - a) * fy;
    }
    t[0] = wrapIt ? t[w2] : t[1];
    t[w2 + 1] = wrapIt ? t[1] : t[w2];
    const o = y * w;
    for (let i = 0; i < w2; i++) {
      const c = t[i + 1] * 0.75;
      out[o + 2 * i] += t[i] * 0.25 + c;
      out[o + 2 * i + 1] += c + t[i + 2] * 0.25;
    }
  }
}

// Ridged fBm, 0..1 with sharp crests at 1.
function ridged(w, h, cx, cy, oct, seed, gain = 0.5) {
  const out = f32(w * h);
  const tmp = f32(w * h);
  let amp = 1;
  let sum = 0;
  for (let o = 0; o < oct; o++) {
    const ax = cx << o;
    const ay = cy << o;
    if (o > 0 && (ax > w / 2 || ay > h / 2)) break;
    tmp.fill(0);
    perlinInto(tmp, w, h, ax, ay, seed * 37 + o * 977, 1);
    for (let i = 0; i < out.length; i++) {
      const v = 1 - Math.abs(tmp[i]);
      out[i] += v * v * amp;
    }
    sum += amp;
    amp *= gain;
  }
  const inv = 1 / sum;
  for (let i = 0; i < out.length; i++) out[i] *= inv;
  return out;
}

// Rescale a field to 0..1.
function norm(f) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < f.length; i++) {
    if (f[i] < lo) lo = f[i];
    if (f[i] > hi) hi = f[i];
  }
  const k = 1 / (hi - lo || 1);
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * k;
  return f;
}

// Periodic 1D value-noise fBm of length len, roughly -1..1.
function noise1(len, cells, oct, seed) {
  const out = new Float32Array(len);
  let amp = 1;
  let sum = 0;
  for (let o = 0; o < oct; o++) {
    const c = cells << o;
    if (o > 0 && c > len / 2) break;
    const r = rng(seed * 13 + o * 7919);
    const lat = new Float32Array(c);
    for (let k = 0; k < c; k++) lat[k] = r() * 2 - 1;
    for (let x = 0; x < len; x++) {
      const p = ((x + 0.5) * c) / len;
      const i = Math.floor(p);
      const f = p - i;
      const u = f * f * (3 - 2 * f);
      const a = lat[i % c];
      out[x] += amp * (a + (lat[(i + 1) % c] - a) * u);
    }
    sum += amp;
    amp *= 0.5;
  }
  for (let x = 0; x < len; x++) out[x] /= sum;
  return out;
}

// Bilinear sample of a w x h field at a continuous position, wrapping.
function sample(f, w, h, x, y) {
  x -= 0.5;
  y -= 0.5;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  let xa = xi % w;
  if (xa < 0) xa += w;
  let ya = yi % h;
  if (ya < 0) ya += h;
  const xb = xa + 1 === w ? 0 : xa + 1;
  const yb = (ya + 1 === h ? 0 : ya + 1) * w;
  ya *= w;
  const a = f[ya + xa];
  const b = f[ya + xb];
  const c = f[yb + xa];
  const d = f[yb + xb];
  return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
}

// Separable box blur, `passes` times (2 passes is close to a Gaussian).
// Both passes walk memory row by row; the vertical one keeps a running sum
// per column.
function blur(src, w, h, rad, passes = 2, wrapIt = true) {
  const a = f32(w * h);
  a.set(src);
  const b = f32(w * h);
  const inv = 1 / (2 * rad + 1);
  const pad = rad + 1;
  const XI = new Int32Array(w + 2 * pad + 1);
  const YI = new Int32Array(h + 2 * pad + 1);
  for (let k = -pad; k <= w + pad; k++) XI[k + pad] = wrapIt ? wrap(k, w) : clamp(k, 0, w - 1);
  for (let k = -pad; k <= h + pad; k++) YI[k + pad] = (wrapIt ? wrap(k, h) : clamp(k, 0, h - 1)) * w;
  const sums = new Float64Array(w);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let s = 0;
      for (let k = -rad; k <= rad; k++) s += a[o + XI[k + pad]];
      for (let x = 0; x < w; x++) {
        b[o + x] = s * inv;
        s += a[o + XI[x + rad + 1 + pad]] - a[o + XI[x - rad + pad]];
      }
    }
    sums.fill(0);
    for (let k = -rad; k <= rad; k++) {
      const row = YI[k + pad];
      for (let x = 0; x < w; x++) sums[x] += b[row + x];
    }
    for (let y = 0; y < h; y++) {
      const o = y * w;
      const add = YI[y + rad + 1 + pad];
      const sub = YI[y - rad + pad];
      for (let x = 0; x < w; x++) {
        a[o + x] = sums[x] * inv;
        sums[x] += b[add + x] - b[sub + x];
      }
    }
  }
  return a;
}

// A blur for AO-sized radii: small ones directly, large ones at half
// resolution and upsampled (same result to the eye, a quarter of the work).
function smoothField(src, w, h, rad, wrapIt) {
  if (rad < 6 || (w & 1) || (h & 1)) return blur(src, w, h, rad, rad <= 3 ? 1 : 2, wrapIt);
  const w2 = w >> 1;
  const h2 = h >> 1;
  const s = f32(w2 * h2);
  for (let y = 0; y < h2; y++) {
    const r0 = y * 2 * w;
    const r1 = r0 + w;
    for (let x = 0; x < w2; x++) s[y * w2 + x] = (src[r0 + x * 2] + src[r0 + x * 2 + 1] + src[r1 + x * 2] + src[r1 + x * 2 + 1]) * 0.25;
  }
  const b = blur(s, w2, h2, rad >> 1, 2, wrapIt);
  const out = f32(w * h);
  upsample2(b, w2, h2, out, wrapIt);
  return out;
}

/* ---------------------------------------------------------------- Worley */

// Jittered-grid cellular noise that wraps. `shift` offsets odd rows by half
// a cell (a hexagonal-ish packing; ny must be even).
function makeWorley(w, h, nx, ny, seed, jitter = 0.9, shift = false) {
  const r = rng(seed);
  const n = nx * ny;
  const cw = w / nx;
  const ch = h / ny;
  const OX = new Float32Array(n);
  const OY = new Float32Array(n);
  const RA = new Float32Array(n);
  const RB = new Float32Array(n);
  const RC = new Float32Array(n);
  const RD = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    OX[k] = (0.5 + (r() - 0.5) * jitter) * cw;
    OY[k] = (0.5 + (r() - 0.5) * jitter) * ch;
    RA[k] = r();
    RB[k] = r();
    RC[k] = r();
    RD[k] = r();
  }
  return { w, h, nx, ny, cw, ch, OX, OY, RA, RB, RC, RD, shift };
}

const WCX = new Float64Array(9);
const WCY = new Float64Array(9);
const WCK = new Int32Array(9);
// Query results live in typed arrays: module-level `let` doubles would be
// boxed on every write and flood the garbage collector.
const WQ = new Float64Array(7);

// Query the point (WQ[5], WQ[6]): nearest feature distance WQ[0], distance
// to the cell border WQ[1], feature index WQ[2] and vector to the feature
// WQ[3], WQ[4]. (Coordinates go in through the array too: doubles passed to
// a call that is not inlined would be boxed on every pixel.) `round` > 0 rounds the
// cell corners off by that many pixels.
function wq(W, round, edge) {
  const { nx, ny, cw, ch, OX, OY, shift } = W;
  const x = WQ[5];
  const y = WQ[6];
  const cj = Math.floor(y / ch);
  let m = 0;
  let best = 1e18;
  let bm = 0;
  for (let dj = -1; dj <= 1; dj++) {
    const jj = cj + dj;
    let jw = jj % ny;
    if (jw < 0) jw += ny;
    const sh = shift && jw & 1 ? cw * 0.5 : 0;
    const ci = Math.floor((x - sh) / cw);
    for (let di = -1; di <= 1; di++, m++) {
      const ii = ci + di;
      let iw = ii % nx;
      if (iw < 0) iw += nx;
      const k = jw * nx + iw;
      const vx = ii * cw + sh + OX[k] - x;
      const vy = jj * ch + OY[k] - y;
      WCX[m] = vx;
      WCY[m] = vy;
      WCK[m] = k;
      const d2 = vx * vx + vy * vy;
      if (d2 < best) {
        best = d2;
        bm = m;
      }
    }
  }
  const bx = WCX[bm];
  const by = WCY[bm];
  WQ[0] = Math.sqrt(best);
  WQ[2] = WCK[bm];
  WQ[3] = bx;
  WQ[4] = by;
  if (!edge) return;
  let d1 = 1e9;
  let d2 = 1e9;
  for (let j = 0; j < 9; j++) {
    if (j === bm) continue;
    const vx = WCX[j];
    const vy = WCY[j];
    const ex = vx - bx;
    const ey = vy - by;
    const l = Math.sqrt(ex * ex + ey * ey);
    if (l < 1e-6) continue;
    const d = ((vx + bx) * 0.5 * ex + (vy + by) * 0.5 * ey) / l;
    if (d < d1) {
      d2 = d1;
      d1 = d;
    } else if (d < d2) d2 = d;
  }
  if (round > 0) {
    const hh = Math.max(round - Math.abs(d1 - d2), 0) / round;
    d1 -= hh * hh * round * 0.25;
  }
  WQ[1] = d1 < 0 ? 0 : d1;
}

// Nearest-feature distance and index only, by splatting every feature over
// the pixels within reach of it (much cheaper than querying each pixel).
function worleyF1(W) {
  const { w, h, nx, ny, cw, ch, OX, OY, shift } = W;
  const n = w * h;
  const d2 = f32(n).fill(1e18);
  const id = i32(n);
  const R = Math.ceil(Math.hypot(cw, ch) * 1.05) + 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const px = i * cw + (shift && j & 1 ? cw * 0.5 : 0) + OX[k];
      const py = j * ch + OY[k];
      const y0 = Math.floor(py - R);
      const y1 = Math.ceil(py + R);
      const x0 = Math.floor(px - R);
      const x1 = Math.ceil(px + R);
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - py;
        const dy2 = dy * dy;
        const row = (((y % h) + h) % h) * w;
        let xx = ((x0 % w) + w) % w;
        for (let x = x0; x <= x1; x++, xx++) {
          if (xx === w) xx = 0;
          const dx = x + 0.5 - px;
          const q = dx * dx + dy2;
          const o = row + xx;
          if (q < d2[o]) {
            d2[o] = q;
            id[o] = k;
          }
        }
      }
    }
  }
  for (let o = 0; o < n; o++) d2[o] = Math.sqrt(d2[o]);
  return { f1: d2, id, edge: null, vx: null, vy: null };
}

// Fill whole-tile Worley fields, optionally domain-warped.
function worleyFill(W, { round = 0, wx = null, wy = null, amt = 0, vec = false, edges = false } = {}) {
  const { w, h } = W;
  if (!edges && !vec && !wx) return worleyF1(W);
  const n = w * h;
  const f1 = f32(n);
  const edge = edges ? f32(n) : null;
  const id = i32(n);
  const vx = vec ? f32(n) : null;
  const vy = vec ? f32(n) : null;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      let px = x + 0.5;
      let py = y + 0.5;
      if (wx) {
        px += wx[i] * amt;
        py += wy[i] * amt;
      }
      WQ[5] = px;
      WQ[6] = py;
      wq(W, round, edges);
      f1[i] = WQ[0];
      if (edges) edge[i] = WQ[1];
      id[i] = WQ[2];
      if (vec) {
        vx[i] = WQ[3];
        vy[i] = WQ[4];
      }
    }
  }
  return { f1, edge, id, vx, vy };
}

/* ---------------------------------------------------------------- bonds */

// Courses of blocks in a running bond with random widths. Integer layout so
// it tiles exactly; every row starts at a random offset and wraps.
function bondLayout(w, h, rowH, seed, minW, maxW) {
  const r = rng(seed);
  const rows = [];
  const rowOf = new Int32Array(h);
  let y = 0;
  let id = 0;
  for (let j = 0; j < rowH.length; j++) {
    const rh = rowH[j];
    for (let k = y; k < y + rh && k < h; k++) rowOf[k] = j;
    const start = Math.floor(r() * w);
    const blocks = [];
    const blockOf = new Int32Array(w);
    let x = 0;
    while (x < w) {
      let bw = Math.round(minW + (maxW - minW) * r());
      if (w - x - bw < minW * 0.7) bw = w - x;
      const b = { id: id++, x0: start + x, w: bw, y0: y, h: rh, row: j, r1: r(), r2: r(), r3: r(), r4: r(), r5: r(), r6: r() };
      for (let k = 0; k < bw; k++) blockOf[(start + x + k) % w] = blocks.length;
      blocks.push(b);
      x += bw;
    }
    rows.push({ y0: y, h: rh, blocks, blockOf });
    y += rh;
  }
  return { w, h, rows, rowOf, count: id };
}

function rowHeights(total, choices, r) {
  const out = [];
  const lo = Math.min(...choices);
  let s = 0;
  while (s < total) {
    let v = choices[(r() * choices.length) | 0];
    if (total - s - v < lo) v = total - s;
    out.push(v);
    s += v;
  }
  return out;
}

let QB = null;
const BQ = new Float64Array(4);

// Block under a continuous point: QB, local position BQ[0], BQ[1], and
// distances to the nearest vertical and horizontal joint BQ[2], BQ[3].
function bondAt(L, x, y) {
  let yy = y % L.h;
  if (yy < 0) yy += L.h;
  let xx = x % L.w;
  if (xx < 0) xx += L.w;
  const row = L.rows[L.rowOf[yy | 0]];
  const b = row.blocks[row.blockOf[xx | 0]];
  let lx = xx - b.x0;
  if (lx < 0) lx += L.w;
  else if (lx >= L.w) lx -= L.w;
  if (lx < 0) lx += L.w;
  const ly = yy - row.y0;
  QB = b;
  BQ[0] = lx;
  BQ[1] = ly;
  BQ[2] = Math.min(lx, b.w - lx);
  BQ[3] = Math.min(ly, row.h - ly);
}

// Inside distance of a rounded-rectangle corner.
function rrect(dx, dy, rad) {
  if (dx < rad && dy < rad) {
    const a = rad - dx;
    const b = rad - dy;
    return rad - Math.sqrt(a * a + b * b);
  }
  return dx < dy ? dx : dy;
}

/* ================================================================ buffer */

class Tex {
  constructor(w, h, tile = true) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    this.tile = tile;
    this.R = f32(this.n);
    this.G = f32(this.n);
    this.B = f32(this.n);
    this.H = f32(this.n);
    this.E = null;
  }

  em() {
    if (!this.E) this.E = [f32(this.n), f32(this.n), f32(this.n)];
    return this.E;
  }

  at(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.tile) return wrap(y, this.h) * this.w + wrap(x, this.w);
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x >= this.w) x = this.w - 1;
    if (y >= this.h) y = this.h - 1;
    return y * this.w + x;
  }

  blend(i, c, a) {
    this.R[i] += (c[0] - this.R[i]) * a;
    this.G[i] += (c[1] - this.G[i]) * a;
    this.B[i] += (c[2] - this.B[i]) * a;
  }

  blend3(i, r, g, b, a) {
    this.R[i] += (r - this.R[i]) * a;
    this.G[i] += (g - this.G[i]) * a;
    this.B[i] += (b - this.B[i]) * a;
  }

  mul(i, k) {
    this.R[i] *= k;
    this.G[i] *= k;
    this.B[i] *= k;
  }
}

/* ---------------------------------------------------------------- brushes */

// A tapered capsule from (x0,y0) radius r0 to (x1,y1) radius r1. Colour runs
// c0 -> c1 and height h0 -> h1 along it, plus a rounded cross-section `dome`.
// `shade` darkens toward the rim. With `ztest` the stroke only paints where it
// is higher than what is already there (so blades and straws overlap
// properly); otherwise it paints over and raises the height to its own.
function seg(T, x0, y0, x1, y1, r0, r1, c0, c1, h0, h1, dome, shade, ztest) {
  const { w, h, R, G, B, H, tile } = T;
  const rm = Math.max(r0, r1) + 0.5;
  const minx = Math.floor(Math.min(x0, x1) - rm);
  const maxx = Math.ceil(Math.max(x0, x1) + rm);
  const miny = Math.floor(Math.min(y0, y1) - rm);
  const maxy = Math.ceil(Math.max(y0, y1) + rm);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L2 = dx * dx + dy * dy + 1e-9;
  const il = 1 / Math.sqrt(L2);
  for (let py = miny; py <= maxy; py++) {
    let yy = py;
    if (tile) {
      yy %= h;
      if (yy < 0) yy += h;
    } else if (yy < 0 || yy >= h) continue;
    const row = yy * w;
    const qy = py + 0.5 - y0;
    for (let px = minx; px <= maxx; px++) {
      const qx = px + 0.5 - x0;
      const perp = (qx * dy - qy * dx) * il;
      if (perp > rm || perp < -rm) continue;
      let t = (qx * dx + qy * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = qx - dx * t;
      const ey = qy - dy * t;
      const d2 = ex * ex + ey * ey;
      const r = r0 + (r1 - r0) * t;
      const ro = r + 0.5;
      if (d2 >= ro * ro) continue;
      let xx = px;
      if (tile) {
        xx %= w;
        if (xx < 0) xx += w;
      } else if (xx < 0 || xx >= w) continue;
      const i = row + xx;
      const d = Math.sqrt(d2);
      let a = ro - d;
      if (a > 1) a = 1;
      if (r < 0.5) a *= r * 2;
      const q = d < r ? Math.sqrt(1 - d2 / (r * r)) : 0;
      const z = h0 + (h1 - h0) * t + dome * q;
      if (ztest && z < H[i]) continue;
      const s = 1 - shade * (1 - q);
      R[i] += ((c0[0] + (c1[0] - c0[0]) * t) * s - R[i]) * a;
      G[i] += ((c0[1] + (c1[1] - c0[1]) * t) * s - G[i]) * a;
      B[i] += ((c0[2] + (c1[2] - c0[2]) * t) * s - B[i]) * a;
      if (ztest || z > H[i]) H[i] += (z - H[i]) * a;
    }
  }
}

// A polyline through flat points [x0,y0,x1,y1,...]; radius, colour and
// height are interpolated along its length.
function poly(T, pts, r0, r1, c0, c1, h0, h1, dome, shade, ztest) {
  const m = pts.length / 2;
  let total = 0;
  const cum = [0];
  for (let k = 1; k < m; k++) {
    total += Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]);
    cum.push(total);
  }
  total = total || 1;
  for (let k = 1; k < m; k++) {
    const ta = cum[k - 1] / total;
    const tb = cum[k] / total;
    const ca = [lerp(c0[0], c1[0], ta), lerp(c0[1], c1[1], ta), lerp(c0[2], c1[2], ta)];
    const cb = [lerp(c0[0], c1[0], tb), lerp(c0[1], c1[1], tb), lerp(c0[2], c1[2], tb)];
    seg(T, pts[k * 2 - 2], pts[k * 2 - 1], pts[k * 2], pts[k * 2 + 1], lerp(r0, r1, ta), lerp(r0, r1, tb), ca, cb,
      lerp(h0, h1, ta), lerp(h0, h1, tb), dome, shade, ztest);
  }
}

// A wandering path: `steps` points `step` px apart, turning smoothly.
function wander(r, x, y, ang, steps, step, turn, pull = null) {
  const pts = [x, y];
  let da = 0;
  for (let k = 0; k < steps; k++) {
    da = da * 0.6 + (r() - 0.5) * turn;
    ang += da;
    if (pull) ang += pull(ang);
    x += Math.cos(ang) * step;
    y += Math.sin(ang) * step;
    pts.push(x, y);
  }
  return pts;
}

// Visit every pixel of a rotated ellipse (with an optional wobbly outline).
// fn(i, d, u, v, cov): d is 0 at the centre and 1 on the outline, u/v are
// the ellipse-local coordinates, cov is antialiased coverage.
function stamp(T, cx, cy, rx, ry, ang, wob, fn) {
  const { w, h, tile } = T;
  const ext = Math.max(rx, ry) * (1 + (wob ? wob[0] + wob[2] + wob[4] : 0)) + 2;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const mr = Math.min(rx, ry);
  for (let py = Math.floor(cy - ext); py <= Math.ceil(cy + ext); py++) {
    let yy = py;
    if (tile) yy = wrap(yy, h);
    else if (yy < 0 || yy >= h) continue;
    for (let px = Math.floor(cx - ext); px <= Math.ceil(cx + ext); px++) {
      let xx = px;
      if (tile) xx = wrap(xx, w);
      else if (xx < 0 || xx >= w) continue;
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      const u = (dx * ca + dy * sa) / rx;
      const v = (-dx * sa + dy * ca) / ry;
      let d = Math.sqrt(u * u + v * v);
      if (wob) {
        const th = Math.atan2(v, u);
        d /= 1 + wob[0] * Math.sin(2 * th + wob[1]) + wob[2] * Math.sin(3 * th + wob[3]) + wob[4] * Math.sin(5 * th + wob[5]);
      }
      const cov = (1 - d) * mr + 0.5;
      if (cov <= 0) continue;
      fn(yy * w + xx, d, u, v, cov > 1 ? 1 : cov);
    }
  }
}

function wobble(r, a = 1) {
  return [(0.06 + r() * 0.1) * a, r() * TAU, (0.04 + r() * 0.06) * a, r() * TAU, (0.02 + r() * 0.03) * a, r() * TAU];
}

// An embedded stone: domed, mottled, partly sunk into whatever is there.
function rock(T, cx, cy, rx, ry, ang, base, hgt, r, mott, opt = {}) {
  const { R, G, B, H } = T;
  const wob = wobble(r, opt.wob ?? 1);
  const g0 = H[T.at(cx, cy)] - hgt * (opt.sink ?? 0.35);
  const lich = opt.lichen || 0;
  const lc = opt.lichenCol || C('#9a9c6a');
  const tint = 0.85 + r() * 0.3;
  const flat = opt.flat ?? 0.6;
  const s = (r() * 1e6) | 0;
  stamp(T, cx, cy, rx, ry, ang, wob, (i, d, u, v, a) => {
    const dd = d > 1 ? 1 : d;
    const dome = Math.pow(1 - dd * dd, flat);
    const z = g0 + hgt * dome + mott[i] * hgt * 0.15;
    if (z <= H[i]) return;
    const gr = hash1(i, s) - 0.5;
    let k = tint * (0.72 + 0.28 * dome + mott[i] * 0.4 + gr * 0.12);
    let cr = base[0] * k;
    let cg = base[1] * k;
    let cb = base[2] * k;
    if (lich > 0) {
      const l = sstep(0.35 - lich, 0.45 - lich, mott[(i * 7 + s) % mott.length] + dome * 0.2);
      cr = lerp(cr, lc[0] * k, l * 0.8);
      cg = lerp(cg, lc[1] * k, l * 0.8);
      cb = lerp(cb, lc[2] * k, l * 0.8);
    }
    R[i] += (cr - R[i]) * a;
    G[i] += (cg - G[i]) * a;
    B[i] += (cb - B[i]) * a;
    H[i] += (z - H[i]) * a;
  });
}

// Short grass blades: two-segment curved strokes, dark at the root and
// light at the tip, z-tested so tips lie over roots.
function blades(T, count, seed, o) {
  const r = rng(seed);
  const { w, h, H } = T;
  const base = o.base.map(C);
  const tips = o.tip.map(C);
  const ca = [0, 0, 0];
  const cm = [0, 0, 0];
  const ct = [0, 0, 0];
  const zk = o.zk ?? 0.5;
  const spread = o.spread ?? Math.PI;
  for (let k = 0; k < count; k++) {
    const x = r() * w;
    const y = r() * h;
    const i = T.at(x, y);
    if (o.keep && r() > o.keep[i]) continue;
    const L = o.len[0] + (o.len[1] - o.len[0]) * Math.pow(r(), 0.8);
    const wd = o.wid[0] + (o.wid[1] - o.wid[0]) * r();
    let a = (o.dir ?? 0) + (r() * 2 - 1) * spread;
    const bend = (r() - 0.5) * (o.bend ?? 1);
    const b = base[(r() * base.length) | 0];
    const t1 = tips[(r() * tips.length) | 0];
    const t2 = tips[(r() * tips.length) | 0];
    const mv = r();
    const sh = 0.8 + r() * 0.35;
    for (let c = 0; c < 3; c++) {
      ct[c] = (t1[c] + (t2[c] - t1[c]) * mv) * sh;
      ca[c] = b[c];
      cm[c] = (b[c] + ct[c]) * 0.5;
    }
    const g = H[i] + (o.lift ?? 0);
    const mx = x + Math.cos(a) * L * 0.5;
    const my = y + Math.sin(a) * L * 0.5;
    a += bend;
    const tx = mx + Math.cos(a) * L * 0.5;
    const ty = my + Math.sin(a) * L * 0.5;
    seg(T, x, y, mx, my, wd, wd * 0.8, ca, cm, g, g + L * zk * 0.5, wd * 0.5, 0.3, true);
    seg(T, mx, my, tx, ty, wd * 0.8, 0.18, cm, ct, g + L * zk * 0.5, g + L * zk, wd * 0.45, 0.3, true);
  }
}

// Glowing line work: max-composited core coverage M and soft halo Gl.
function glowLine(T, M, Gl, x0, y0, x1, y1, core, sigma) {
  const { w, h, tile } = T;
  const ext = core + sigma * 2.6 + 1;
  const minx = Math.floor(Math.min(x0, x1) - ext);
  const maxx = Math.ceil(Math.max(x0, x1) + ext);
  const miny = Math.floor(Math.min(y0, y1) - ext);
  const maxy = Math.ceil(Math.max(y0, y1) + ext);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L2 = dx * dx + dy * dy + 1e-9;
  const is2 = 1 / (sigma * sigma);
  for (let py = miny; py <= maxy; py++) {
    let yy = py;
    if (tile) yy = wrap(yy, h);
    else if (yy < 0 || yy >= h) continue;
    const qy = py + 0.5 - y0;
    for (let px = minx; px <= maxx; px++) {
      let xx = px;
      if (tile) xx = wrap(xx, w);
      else if (xx < 0 || xx >= w) continue;
      const qx = px + 0.5 - x0;
      let t = (qx * dx + qy * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = qx - dx * t;
      const ey = qy - dy * t;
      const d2 = ex * ex + ey * ey;
      const i = yy * w + xx;
      const d = Math.sqrt(d2);
      const c = clamp(core - d + 0.5);
      if (c > M[i]) M[i] = c;
      const g = Math.exp(-d2 * is2);
      if (g > Gl[i]) Gl[i] = g;
    }
  }
}

/* ---------------------------------------------------------------- output */

function mkCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

function rgbCanvas(R, G, B, w, h) {
  const cv = mkCanvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    d[o] = R[i] * 255;
    d[o + 1] = G[i] * 255;
    d[o + 2] = B[i] * 255;
    d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// Tangent-space normals from a height field (in pixel units) with a 3x3
// Sobel filter that wraps on tiling textures. OpenGL convention: the canvas
// is uploaded with flipY, so canvas-down is -V and green points up the image.
function normalCanvas(Hf, w, h, k, wrapIt) {
  const cv = mkCanvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const s = k / 8;
  const XM = new Int32Array(w);
  const XP = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    XM[x] = wrapIt ? (x - 1 + w) % w : Math.max(0, x - 1);
    XP[x] = wrapIt ? (x + 1) % w : Math.min(w - 1, x + 1);
  }
  for (let y = 0; y < h; y++) {
    const ym = (wrapIt ? (y - 1 + h) % h : Math.max(0, y - 1)) * w;
    const yp = (wrapIt ? (y + 1) % h : Math.min(h - 1, y + 1)) * w;
    const y0 = y * w;
    for (let x = 0; x < w; x++) {
      const a = XM[x];
      const c = XP[x];
      const tl = Hf[ym + a];
      const tr = Hf[ym + c];
      const bl = Hf[yp + a];
      const br = Hf[yp + c];
      const gx = tr + 2 * Hf[y0 + c] + br - (tl + 2 * Hf[y0 + a] + bl);
      const gy = bl + 2 * Hf[yp + x] + br - (tl + 2 * Hf[ym + x] + tr);
      const nx = -gx * s;
      const ny = gy * s;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y0 + x) * 4;
      d[o] = (nx * l * 0.5 + 0.5) * 255;
      d[o + 1] = (ny * l * 0.5 + 0.5) * 255;
      d[o + 2] = (l * 0.5 + 0.5) * 255;
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// Cavity shading from the height field: crevices darker, crests a touch
// lighter. Each pass is [radius px, darkening, lightening] per height unit;
// all passes are applied in one sweep.
function cavity(T, passes) {
  const { R, G, B, H, n } = T;
  const fields = passes.map(([rad]) => smoothField(H, T.w, T.h, rad, T.tile));
  const m = passes.length;
  const kLo = passes.map((p) => p[1]);
  const kHi = passes.map((p) => p[2]);
  const f0 = fields[0];
  const f1 = m > 1 ? fields[1] : null;
  const lo0 = kLo[0];
  const hi0 = kHi[0];
  const lo1 = m > 1 ? kLo[1] : 0;
  const hi1 = m > 1 ? kHi[1] : 0;
  for (let i = 0; i < n; i++) {
    const d0 = H[i] - f0[i];
    let f = d0 < 0 ? 1 + d0 * lo0 : 1 + d0 * hi0;
    if (f1) {
      const d1 = H[i] - f1[i];
      f *= d1 < 0 ? 1 + d1 * lo1 : 1 + d1 * hi1;
    }
    f = f < 0.3 ? 0.3 : f > 1.3 ? 1.3 : f;
    R[i] *= f;
    G[i] *= f;
    B[i] *= f;
  }
}

function finish(T, nrm, aos) {
  if (aos.length) cavity(T, aos);
  const out = {
    map: rgbCanvas(T.R, T.G, T.B, T.w, T.h),
    normal: normalCanvas(T.H, T.w, T.h, nrm, T.tile),
  };
  if (T.E) out.emissive = rgbCanvas(T.E[0], T.E[1], T.E[2], T.w, T.h);
  return out;
}


/* ================================================================ ground */

function heath() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const zone = norm(fbm(w, h, 3, 3, 4, 101));
  const lump = fbm(w, h, 10, 10, 4, 102);
  const fine = fbm(w, h, 72, 72, 2, 103);
  const soil = ramp([[0, '#2a2616'], [0.45, '#433f22'], [0.75, '#5c552e'], [1, '#746838']]);
  for (let i = 0; i < n; i++) {
    const k = lutIdx(0.55 + lump[i] * 0.7 + fine[i] * 0.35);
    const z = zone[i];
    R[i] = soil[k] * (0.9 + z * 0.25);
    G[i] = soil[k + 1] * (0.95 + z * 0.12);
    B[i] = soil[k + 2] * (0.95 - z * 0.12);
    H[i] = lump[i] * 5 + fine[i];
  }
  // Pale stones, half sunk in the turf.
  const r = rng(107);
  const mott = fbm(w, h, 40, 40, 3, 108);
  for (let s = 0; s < 5; s++) {
    const rx = 12 + r() * 13;
    rock(T, r() * w, r() * h, rx, rx * (0.55 + r() * 0.3), r() * TAU, C('#a29e94'), 4 + rx * 0.3, r, mott, { lichen: 0.12, lichenCol: C('#9c9a76'), sink: 0.45 });
  }
  // Heather clumps: raised woody mats, dusky purple where they flower.
  const hm = norm(fbm(w, h, 5, 5, 5, 104));
  const hn = fbm(w, h, 24, 24, 3, 105);
  const hf = fbm(w, h, 128, 128, 1, 106);
  const keep = f32(n);
  const mask = f32(n);
  const wood = C('#231d0e');
  const bloom = C('#42263e');
  for (let i = 0; i < n; i++) {
    const m = sstep(0.56, 0.66, hm[i] + hf[i] * 0.05 + hn[i] * 0.04);
    mask[i] = m;
    keep[i] = 1 - m * 0.92;
    if (m <= 0) continue;
    const fl = clamp(0.4 + hn[i] * 1.3 + hf[i] * 0.4);
    const tone = 0.8 + hf[i] * 0.5;
    T.blend3(i, lerp(wood[0], bloom[0], fl) * tone, lerp(wood[1], bloom[1], fl) * tone, lerp(wood[2], bloom[2], fl) * tone, m);
    H[i] += m * (5 + hn[i] * 3) + hf[i] * 1.4 * m;
  }
  // Sprigs: woody stems with small bells toward the tips, flowering unevenly.
  const florets = ['#5e3058', '#6c3a66', '#7a4472', '#52284c', '#86507e', '#4a2644'].map(C);
  const leafy = ['#3a3a1e', '#46442a', '#2e3018'].map(C);
  const stem0 = C('#241c10');
  const stem1 = C('#3e3420');
  const fc = [0, 0, 0];
  for (let k = 0; k < 7000; k++) {
    const x = r() * w;
    const y = r() * h;
    const i = T.at(x, y);
    if (r() > mask[i]) continue;
    const a = r() * TAU;
    const L = 4 + r() * 6;
    const g = H[i] + 1;
    const tx = x + Math.cos(a) * L;
    const ty = y + Math.sin(a) * L;
    seg(T, x, y, tx, ty, 0.7, 0.4, stem0, stem1, g, g + 3, 0.3, 0.3, true);
    const flowering = hn[i] + (r() - 0.5) * 0.3 > -0.12;
    const nf = 2 + ((r() * 3) | 0);
    for (let f = 0; f < nf; f++) {
      const t = 0.45 + r() * 0.6;
      const fx = x + Math.cos(a) * L * t + (r() - 0.5) * 2.5;
      const fy = y + Math.sin(a) * L * t + (r() - 0.5) * 2.5;
      const col = flowering ? florets[(r() * florets.length) | 0] : leafy[(r() * leafy.length) | 0];
      const sh = 0.8 + r() * 0.35;
      fc[0] = col[0] * sh;
      fc[1] = col[1] * sh;
      fc[2] = col[2] * sh;
      const fr = 0.75 + r() * 0.6;
      seg(T, fx, fy, fx + 0.3, fy + 0.3, fr, fr * 0.8, fc, fc, g + 2 + t * 2, g + 2 + t * 2, fr * 0.8, 0.45, true);
    }
  }
  blades(T, 15500, 109, {
    keep, len: [4, 11], wid: [0.55, 0.95], zk: 0.45,
    base: ['#33301a', '#423d20', '#3a3a1e'],
    tip: ['#7a7436', '#9a8a46', '#b4a464', '#6a6a30', '#8c7c3c', '#a49650', '#5e6630'],
  });
  return finish(T, 1.1, [[2, 0.08, 0.035], [10, 0.035, 0.015]]);
}

function grassmound() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const zone = norm(fbm(w, h, 3, 3, 4, 201));
  const lump = fbm(w, h, 8, 8, 4, 202);
  const fine = fbm(w, h, 64, 64, 2, 203);
  const soil = ramp([[0, '#141a0c'], [0.5, '#223016'], [1, '#34461e']]);
  for (let i = 0; i < n; i++) {
    const k = lutIdx(0.5 + lump[i] * 0.7 + fine[i] * 0.3);
    R[i] = soil[k];
    G[i] = soil[k + 1];
    B[i] = soil[k + 2];
    H[i] = lump[i] * 6 + fine[i] * 0.8;
  }
  const keep = f32(n).fill(1);
  blades(T, 27000, 204, {
    keep, len: [7, 16], wid: [0.6, 1.05], zk: 0.55, bend: 1.3,
    base: ['#16200c', '#1c2a10', '#223012'],
    tip: ['#3e6a22', '#4e7a2a', '#5a8a30', '#36601e', '#6a9234', '#46702a', '#5a7a2a'],
  });
  // Lighter, sun-caught tips in drifts and a sprinkle of clover and flowers.
  for (let i = 0; i < n; i++) {
    const z = zone[i];
    R[i] *= 0.88 + z * 0.24;
    G[i] *= 0.92 + z * 0.16;
  }
  const r = rng(205);
  const clover = C('#4a7a32');
  for (let k = 0; k < 90; k++) {
    const cx = r() * w;
    const cy = r() * h;
    for (let l = 0; l < 3; l++) {
      const a = (l / 3) * TAU + r();
      const lx = cx + Math.cos(a) * 2.6;
      const ly = cy + Math.sin(a) * 2.6;
      const g = H[T.at(cx, cy)] + 1;
      stamp(T, lx, ly, 2.6, 2.6, 0, null, (i, d, u, v, a2) => {
        const z = g + (1 - d) * 1.2;
        if (z < H[i]) return;
        T.blend3(i, clover[0] * (0.8 + (1 - d) * 0.4), clover[1] * (0.8 + (1 - d) * 0.4), clover[2], a2);
        H[i] = Math.max(H[i], z);
      });
    }
  }
  const petals = ['#e8e4d0', '#e8d060', '#d8c8e8'].map(C);
  for (let k = 0; k < 70; k++) {
    const cx = r() * w;
    const cy = r() * h;
    const col = petals[(r() * 3) | 0];
    const g = H[T.at(cx, cy)] + 0.5;
    stamp(T, cx, cy, 1.4, 1.4, 0, null, (i, d, u, v, a) => {
      T.blend(i, col, a);
      H[i] = Math.max(H[i], g + (1 - d));
    });
  }
  return finish(T, 1.1, [[2, 0.07, 0.03], [10, 0.035, 0.012]]);
}

function marsh() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const low = norm(fbm(w, h, 4, 4, 5, 301));
  const mud = fbm(w, h, 16, 16, 4, 302);
  const fine = fbm(w, h, 96, 96, 2, 303);
  const mossN = norm(fbm(w, h, 6, 6, 4, 304));
  const refl = fbm(w, h, 2, 6, 3, 305);
  const mudL = ramp([[0, '#17120c'], [0.45, '#282015'], [0.75, '#372d1e'], [1, '#463c2a']]);
  const mossL = ramp([[0, '#23300f'], [0.5, '#3e4f1a'], [1, '#5e702a']]);
  const deep = C('#0a2024');
  const shal = C('#1a3e3c');
  const sky = C('#4a7e7a');
  const WL = 0.38;
  for (let i = 0; i < n; i++) {
    let ground = (low[i] - WL) * 22 + mud[i] * 3.5 + fine[i] * 0.8;
    const wet = sstep(4, 0, ground);
    const k = lutIdx((0.55 + mud[i] * 0.9 + fine[i] * 0.45) * (1 - wet * 0.3));
    let cr = mudL[k];
    let cg = mudL[k + 1];
    let cb = mudL[k + 2];
    const mm = sstep(0.55, 0.68, mossN[i] + fine[i] * 0.05) * sstep(0.6, 3, ground);
    if (mm > 0) {
      const mk = lutIdx(0.5 + fine[i] * 1.3 + mud[i] * 0.5);
      cr = lerp(cr, mossL[mk], mm);
      cg = lerp(cg, mossL[mk + 1], mm);
      cb = lerp(cb, mossL[mk + 2], mm);
      ground += mm * (1.2 + fine[i] * 1.6);
    }
    // a wet, darker sheen along the water's edge
    const sheen = sstep(2.2, 0, ground) * 0.3;
    cr = lerp(cr, 0.09, sheen);
    cg = lerp(cg, 0.12, sheen);
    cb = lerp(cb, 0.11, sheen);
    if (ground < 0.6) {
      const depth = clamp(-ground / 4);
      const sw = sstep(0.6, -0.6, ground);
      const rf = sstep(-0.05, 0.35, refl[i]) * 0.5 + fine[i] * 0.04;
      let wr = lerp(shal[0], deep[0], depth);
      let wg = lerp(shal[1], deep[1], depth);
      let wb = lerp(shal[2], deep[2], depth);
      wr = lerp(wr, sky[0], rf);
      wg = lerp(wg, sky[1], rf);
      wb = lerp(wb, sky[2], rf);
      const see = (1 - depth) * 0.4;
      wr = lerp(wr, cr, see);
      wg = lerp(wg, cg, see);
      wb = lerp(wb, cb, see);
      cr = lerp(cr, wr, sw);
      cg = lerp(cg, wg, sw);
      cb = lerp(cb, wb, sw);
      ground = lerp(ground, 0, sw);
    }
    R[i] = cr;
    G[i] = cg;
    B[i] = cb;
    H[i] = ground;
  }
  // A few floating and fallen reed straws.
  const r = rng(306);
  const straw = ['#6e6040', '#857650', '#5a4c30'].map(C);
  for (let k = 0; k < 55; k++) {
    const x = r() * w;
    const y = r() * h;
    const a = r() * TAU;
    const L = 10 + r() * 22;
    const c = straw[(r() * straw.length) | 0];
    const g = Math.max(0, H[T.at(x, y)]) + 0.5;
    seg(T, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, 0.6, 0.5, c, c, g, g, 0.4, 0.35, false);
  }
  // Reed tussocks: a dark crown bristling with short broken stubble.
  const crown = C('#1e1b0e');
  const reed = ['#6e6436', '#8a7c48', '#4e5424', '#5e6a2a', '#3e3e1c', '#9a8a54'].map(C);
  const ct = [0, 0, 0];
  const cb0 = [0, 0, 0];
  for (let k = 0; k < 40; k++) {
    const cx = r() * w;
    const cy = r() * h;
    const cr = 5 + r() * 5;
    const g = Math.max(0, H[T.at(cx, cy)]);
    stamp(T, cx, cy, cr * 1.2, cr * 1.2, 0, wobble(r, 1.5), (i, d, u, v, a) => {
      const z = g + 2.5 * (1 - d * d);
      if (z > H[i]) {
        T.blend(i, crown, a * 0.85);
        H[i] = z;
      }
    });
    const m = 45 + ((r() * 40) | 0);
    for (let s = 0; s < m; s++) {
      const rr = Math.sqrt(r()) * cr;
      const ra = r() * TAU;
      const x = cx + Math.cos(ra) * rr;
      const y = cy + Math.sin(ra) * rr;
      const a = ra + (r() - 0.5) * 2.2;
      const L = r() < 0.8 ? 1.5 + r() * 4 : 5 + r() * 6;
      const c = reed[(r() * reed.length) | 0];
      const sh = 0.75 + r() * 0.45;
      for (let j = 0; j < 3; j++) {
        ct[j] = c[j] * sh;
        cb0[j] = c[j] * sh * 0.45;
      }
      seg(T, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, 0.95, 0.75, cb0, ct, g + 3, g + 5 + L * 0.4, 0.6, 0.35, true);
    }
  }
  return finish(T, 1.0, [[2, 0.06, 0.03], [10, 0.03, 0.012]]);
}

function volcanic() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const E = T.em();
  const wx = fbm(w, h, 6, 6, 3, 401);
  const wy = fbm(w, h, 6, 6, 3, 402);
  const PW = makeWorley(w, h, 7, 7, 403, 0.85);
  const P = worleyFill(PW, { wx, wy, amt: 14, vec: true, edges: true });
  const P2 = worleyFill(makeWorley(w, h, 18, 18, 404, 0.9), { wx, wy, amt: 8, edges: true });
  const cw = norm(fbm(w, h, 8, 8, 3, 405));
  const surf = fbm(w, h, 20, 20, 4, 406);
  const fine = fbm(w, h, 128, 128, 1, 407);
  const lavaN = fbm(w, h, 32, 32, 3, 408);
  const ves = worleyFill(makeWorley(w, h, 72, 72, 409, 1));
  const rock = ramp([[0, '#0c0b0c'], [0.4, '#191617'], [0.75, '#262120'], [1, '#383030']]);
  const lava = ramp([[0, '#4a0c04'], [0.3, '#a82808'], [0.6, '#f0601a'], [0.85, '#ffa63a'], [1, '#ffe08a']]);
  for (let i = 0; i < n; i++) {
    const e = P.edge[i];
    const k = P.id[i];
    const half = 0.9 + cw[i] * 3.2;
    // each plate is a slightly tilted slab with rounded rims
    const tx = (PW.RA[k] - 0.5) * 0.12;
    const ty = (PW.RB[k] - 0.5) * 0.12;
    let hp = 12 + PW.RC[k] * 4 - tx * P.vx[i] - ty * P.vy[i] + surf[i] * 3 + fine[i] * 0.4;
    hp -= (1 - sstep(0, 10, e - half)) * 5;
    const hair = P2.edge[i] < 1.1 ? 1 - P2.edge[i] / 1.1 : 0;
    hp -= hair * 2.2 * sstep(6, 14, e);
    const pit = ves.f1[i] < 1.8 && ves.id[i] % 3 === 0 ? 1 - ves.f1[i] / 1.8 : 0;
    hp -= pit * 1.5;
    let ck = lutIdx(0.5 + surf[i] * 0.6 + fine[i] * 0.4 - pit * 0.4 - hair * 0.3);
    let cr = rock[ck];
    let cg = rock[ck + 1];
    let cb = rock[ck + 2];
    // heat-scorched rims
    const halo = Math.exp(-Math.max(0, e - half) / 6);
    cr = lerp(cr, 0.32, halo * 0.35);
    cg = lerp(cg, 0.08, halo * 0.3);
    cb = lerp(cb, 0.03, halo * 0.3);
    const lv = sstep(half + 0.9, half - 1.1, e);
    const core = clamp(1 - e / (half + 0.5));
    const crust = sstep(-0.05, -0.3, lavaN[i]);
    const heat = clamp(core * (0.65 + lavaN[i] * 0.8) + 0.25) * (1 - crust * 0.7);
    const lk = lutIdx(heat);
    R[i] = lerp(cr, lava[lk], lv);
    G[i] = lerp(cg, lava[lk + 1], lv);
    B[i] = lerp(cb, lava[lk + 2], lv);
    H[i] = lerp(hp, 1 + (1 - core) * 2 + crust * 1.5, lv);
    const glow = lv * (0.35 + heat * 0.9);
    const hg = halo * 0.12;
    E[0][i] = clamp(lava[lk] * glow + hg);
    E[1][i] = clamp(lava[lk + 1] * glow + hg * 0.25);
    E[2][i] = clamp(lava[lk + 2] * glow);
  }
  return finish(T, 1.0, [[2, 0.07, 0.04], [9, 0.03, 0.015]]);
}

function snow() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const wx = fbm(w, h, 4, 4, 3, 501);
  const wy = fbm(w, h, 4, 4, 3, 502);
  const drift = fbm(w, h, 2, 4, 4, 503);
  const sas = ridged(w, h, 5, 28, 3, 504);
  const fine = fbm(w, h, 128, 128, 1, 505);
  const tint = fbm(w, h, 3, 3, 3, 506);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const sx = x + 0.5 + wx[i] * 40;
      const sy = y + 0.5 + wy[i] * 40;
      const s = sample(sas, w, h, sx, sy);
      const dr = sample(drift, w, h, sx, sy);
      H[i] = dr * 22 + s * s * 3.5 * sstep(-0.2, 0.3, wx[i] + 0.1) + fine[i] * 0.3;
    }
  }
  const bl = smoothField(H, w, h, 10, true);
  const bl2 = blur(H, w, h, 3, 1);
  const lit = C('#eef2f8');
  const mid = C('#d2dae8');
  const shade = C('#97a7cf');
  for (let i = 0; i < n; i++) {
    const cav = clamp(0.5 + (H[i] - bl[i]) * 0.09 + (H[i] - bl2[i]) * 0.12 + tint[i] * 0.25);
    const sp = hash1(i, 509) > 0.9965 ? 0.08 : 0;
    if (cav < 0.5) {
      R[i] = lerp(shade[0], mid[0], cav * 2) + sp;
      G[i] = lerp(shade[1], mid[1], cav * 2) + sp;
      B[i] = lerp(shade[2], mid[2], cav * 2) + sp;
    } else {
      R[i] = lerp(mid[0], lit[0], cav * 2 - 1) + sp;
      G[i] = lerp(mid[1], lit[1], cav * 2 - 1) + sp;
      B[i] = lerp(mid[2], lit[2], cav * 2 - 1) + sp;
    }
  }
  // Grey stones breaking through the crust, snow lying on their tops and
  // drifted up against their sides.
  const r = rng(507);
  const mott = fbm(w, h, 32, 32, 3, 508);
  const stone = C('#7c7874');
  const lichen = C('#7c7c62');
  for (let s = 0; s < 6; s++) {
    const rx = 11 + r() * 15;
    const cx = r() * w;
    const cy = r() * h;
    const g0 = H[T.at(cx, cy)] - rx * 0.05;
    const hgt = rx * 0.65;
    const tone = 0.8 + r() * 0.35;
    const sd = (r() * 1e6) | 0;
    stamp(T, cx, cy, rx, rx * (0.55 + r() * 0.35), r() * TAU, wobble(r, 1.3), (i, d, u, v, a) => {
      const dd = d > 1 ? 1 : d;
      const dome = Math.sqrt(1 - dd * dd);
      const z = g0 + hgt * dome + mott[i] * 3;
      if (z <= H[i]) return;
      const emerge = clamp((z - H[i]) / 2.5) * a;
      let k = tone * (0.68 + dome * 0.3 + mott[i] * 0.35) + (hash1(i, sd) - 0.5) * 0.08;
      let cr = stone[0] * k;
      let cg = stone[1] * k;
      let cb = stone[2] * k;
      const lc = sstep(0.15, 0.3, mott[(i * 13) & (n - 1)]) * 0.5;
      cr = lerp(cr, lichen[0] * k, lc);
      cg = lerp(cg, lichen[1] * k, lc);
      cb = lerp(cb, lichen[2] * k, lc);
      const dust = sstep(0.82, 0.95, dome * 0.75 + mott[i] * 1.1 + 0.18) * 0.9;
      cr = lerp(cr, lit[0] * 0.95, dust);
      cg = lerp(cg, lit[1] * 0.95, dust);
      cb = lerp(cb, lit[2] * 0.97, dust);
      R[i] += (cr - R[i]) * emerge;
      G[i] += (cg - G[i]) * emerge;
      B[i] += (cb - B[i]) * emerge;
      H[i] += (z - H[i]) * a;
    });
  }
  return finish(T, 0.9, [[3, 0.03, 0.01], [12, 0.012, 0.004]]);
}

function forest() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const lump = fbm(w, h, 12, 12, 4, 601);
  const fine = fbm(w, h, 96, 96, 2, 602);
  const mossN = norm(fbm(w, h, 5, 5, 4, 603));
  const cush = worleyFill(makeWorley(w, h, 56, 56, 604, 0.9));
  const soil = ramp([[0, '#140f09'], [0.45, '#22190f'], [0.75, '#322416'], [1, '#43301e']]);
  const moss = ramp([[0, '#162210'], [0.4, '#253714'], [0.75, '#3a5018'], [1, '#56682a']]);
  const keep = f32(n);
  for (let i = 0; i < n; i++) {
    let k = lutIdx(0.5 + lump[i] * 0.7 + fine[i] * 0.4);
    let cr = soil[k];
    let cg = soil[k + 1];
    let cb = soil[k + 2];
    let z = lump[i] * 4 + fine[i] * 0.8;
    const m = sstep(0.5, 0.6, mossN[i] + fine[i] * 0.06);
    if (m > 0) {
      const cu = clamp(1 - cush.f1[i] / 7);
      k = lutIdx(0.25 + cu * 0.5 + fine[i] * 0.5 + lump[i] * 0.3);
      cr = lerp(cr, moss[k], m);
      cg = lerp(cg, moss[k + 1], m);
      cb = lerp(cb, moss[k + 2], m);
      z += m * (2 + cu * 2.2);
    }
    R[i] = cr;
    G[i] = cg;
    B[i] = cb;
    H[i] = z;
    keep[i] = 1 - m * 0.75;
  }
  const r = rng(605);
  // Roots: tapering, wandering, with side roots.
  const bark0 = C('#2a1f16');
  const bark1 = C('#5a4634');
  for (let k = 0; k < 4; k++) {
    const pts = wander(r, r() * w, r() * h, r() * TAU, 40, 9, 0.5);
    const rad = 4.5 + r() * 2.5;
    poly(T, pts, rad, 1.2, bark1, bark0, 7, 5, rad * 0.9, 0.55, false);
    for (let b = 0; b < 3; b++) {
      const j = 2 * (4 + ((r() * 30) | 0));
      const sp = wander(r, pts[j], pts[j + 1], r() * TAU, 10 + ((r() * 8) | 0), 7, 0.7);
      poly(T, sp, rad * 0.45, 0.6, bark1, bark0, 6, 4, rad * 0.4, 0.5, false);
    }
  }
  // Needles.
  const needle = ['#6e3e1c', '#7e522a', '#4a2e18', '#94744a', '#5e4a36', '#8a4e22'].map(C);
  for (let k = 0; k < 8000; k++) {
    const x = r() * w;
    const y = r() * h;
    const i = T.at(x, y);
    if (r() > keep[i]) continue;
    const a = r() * TAU;
    const L = 5 + r() * 6;
    const x1 = x + Math.cos(a) * L;
    const y1 = y + Math.sin(a) * L;
    const c = needle[(r() * needle.length) | 0];
    seg(T, x, y, x1, y1, 0.55, 0.45, c, c, H[i] + 0.6, H[T.at(x1, y1)] + 0.6, 0.5, 0.3, true);
  }
  // Leaves: pointed ovals with a midrib, curled up at the edges.
  const leafC = ['#9a6c26', '#6a3e1e', '#7a2e16', '#ae8c34', '#3e2a16', '#5e4632', '#8a5a22'].map(C);
  for (let k = 0; k < 420; k++) {
    const cx = r() * w;
    const cy = r() * h;
    const len = 5 + r() * 5;
    const c = leafC[(r() * leafC.length) | 0];
    const g = H[T.at(cx, cy)] + 1;
    const decay = r();
    const s = (r() * 1e6) | 0;
    stamp(T, cx, cy, len, len * (0.4 + r() * 0.15), r() * TAU, null, (i, d, u, v, a) => {
      const wdt = Math.sqrt(Math.max(0, 1 - u * u)) * (u > 0 ? 1 - u * 0.35 : 1);
      const av = Math.abs(v);
      if (av > wdt) return;
      const cov = clamp((wdt - av) * len * 0.45 + 0.3) * a;
      const z = g + av * av * 1.6 + (1 - Math.abs(u)) * 0.6;
      if (z < H[i]) return;
      let k2 = 0.85 + (wdt - av) * 0.25 + (hash1(i, s) - 0.5) * 0.1;
      if (av < 0.07) k2 *= 0.72;
      const vein = fract(Math.abs(u) * 4 + av * 3);
      if (vein < 0.1) k2 *= 0.88;
      if (decay > 0.75 && hash1(i >> 2, s) > 0.8) k2 *= 0.55;
      T.blend3(i, c[0] * k2, c[1] * k2, c[2] * k2, cov);
      H[i] += (z - H[i]) * cov;
    });
  }
  // Twigs.
  const twig0 = C('#3a2e22');
  const twig1 = C('#5e5040');
  for (let k = 0; k < 45; k++) {
    const pts = wander(r, r() * w, r() * h, r() * TAU, 5 + ((r() * 5) | 0), 8, 0.5);
    const rad = 1.1 + r() * 0.8;
    const g = H[T.at(pts[0], pts[1])] + 1.2;
    poly(T, pts, rad, rad * 0.6, twig1, twig0, g + 1, g + 0.5, rad * 0.8, 0.45, false);
    if (r() < 0.7) {
      const j = 2 * (1 + ((r() * 3) | 0));
      const sp = wander(r, pts[j], pts[j + 1], r() * TAU, 2, 6, 0.4);
      poly(T, sp, rad * 0.6, 0.4, twig1, twig0, g + 1, g + 0.6, rad * 0.5, 0.4, false);
    }
  }
  return finish(T, 1.05, [[2, 0.08, 0.035], [10, 0.04, 0.012]]);
}

function desert() {
  const T = new Tex(512, 512);
  const { w, h, R, G, B, H } = T;
  const dune = fbm(w, h, 2, 2, 3, 701);
  const warp = fbm(w, h, 3, 3, 3, 702);
  const warp2 = fbm(w, h, 8, 8, 2, 703);
  const ampN = fbm(w, h, 3, 3, 3, 704);
  const zone = norm(fbm(w, h, 4, 4, 4, 705));
  const grain = fbm(w, h, 128, 128, 1, 706);
  const sand = ramp([[0, '#8a5c32'], [0.35, '#a8784a'], [0.65, '#c4925e'], [1, '#dcb07a']]);
  const red = C('#a8603a');
  const pale = C('#dcc08e');
  const KX = 9;
  const KY = 44;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const ph = (KX * x + KY * y) / 512 + warp[i] * 2.2 + warp2[i] * 0.35;
      const p = fract(ph);
      const rp = p < 0.7 ? p / 0.7 : (1 - p) / 0.3;
      const rr = rp * rp * (3 - 2 * rp);
      const amp = 1.5 * sstep(-0.35, 0.25, ampN[i]);
      H[i] = dune[i] * 14 + rr * amp + grain[i] * 0.25;
      let v = 0.5 + dune[i] * 0.55 + (rr - 0.5) * 0.3 * (amp / 1.5) + grain[i] * 0.2;
      // coarse dark grains settle in the troughs
      if (hash1(i, 707) > 0.965 - (1 - rr) * 0.03) v -= 0.18;
      const k = lutIdx(v);
      const z = zone[i];
      R[i] = lerp(lerp(sand[k], red[0], sstep(0.6, 0.9, z) * 0.35), pale[0], sstep(0.35, 0.05, z) * 0.3);
      G[i] = lerp(lerp(sand[k + 1], red[1], sstep(0.6, 0.9, z) * 0.35), pale[1], sstep(0.35, 0.05, z) * 0.3);
      B[i] = lerp(lerp(sand[k + 2], red[2], sstep(0.6, 0.9, z) * 0.35), pale[2], sstep(0.35, 0.05, z) * 0.3);
    }
  }
  const r = rng(708);
  const mott = fbm(w, h, 48, 48, 2, 709);
  const pebC = ['#7a6e64', '#8a5a3a', '#5a4a40', '#c8b48c', '#9a8a7a', '#6a4030', '#3e3632'].map(C);
  for (let k = 0; k < 170; k++) {
    const rx = 1.5 + Math.pow(r(), 2.2) * 6;
    rock(T, r() * w, r() * h, rx, rx * (0.6 + r() * 0.4), r() * TAU, pebC[(r() * pebC.length) | 0], 1 + rx * 0.5, r, mott, { sink: 0.3 });
  }
  return finish(T, 1.0, [[2, 0.07, 0.03], [8, 0.03, 0.01]]);
}

function ash() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const E = T.em();
  const dune = fbm(w, h, 3, 3, 4, 801);
  const lump = fbm(w, h, 14, 14, 3, 802);
  const fine = fbm(w, h, 128, 128, 1, 803);
  const zone = norm(fbm(w, h, 4, 4, 3, 804));
  const rip = fbm(w, h, 4, 4, 2, 812);
  const ashL = ramp([[0, '#121114'], [0.4, '#222024'], [0.7, '#333036'], [1, '#4a464e']]);
  const warm = C('#3a2e2a');
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      // faint wind ripples in the powder
      const p = fract((5 * x + 30 * y) / 512 + rip[i] * 2.5);
      const rp = p < 0.65 ? p / 0.65 : (1 - p) / 0.35;
      const ra = sstep(-0.1, 0.4, dune[i]) * 0.8;
      const k = lutIdx(0.5 + lump[i] * 0.6 + fine[i] * 0.35 + dune[i] * 0.4 + (rp - 0.5) * ra * 0.15);
      const z = sstep(0.55, 0.9, zone[i]) * 0.4;
      R[i] = lerp(ashL[k], warm[0], z);
      G[i] = lerp(ashL[k + 1], warm[1], z);
      B[i] = lerp(ashL[k + 2], warm[2], z);
      H[i] = dune[i] * 10 + lump[i] * 2.2 + fine[i] * 0.35 + rp * ra;
      if (hash1(i, 813) > 0.97) {
        R[i] *= 0.6;
        G[i] *= 0.6;
        B[i] *= 0.6;
      }
    }
  }
  // Cinders: porous clinker lumps of every size, a few still ember-brown.
  const r = rng(805);
  const pore = fbm(w, h, 64, 64, 2, 806);
  const cin = ['#141012', '#1c1618', '#241c1c', '#2a2222', '#1a1414'].map(C);
  const ember = C('#3e1c14');
  for (let k = 0; k < 340; k++) {
    const rx = 1.4 + Math.pow(r(), 2.4) * 7;
    const col = r() < 0.12 ? ember : cin[(r() * cin.length) | 0];
    rock(T, r() * w, r() * h, rx, rx * (0.6 + r() * 0.4), r() * TAU, col, 1 + rx * 0.45, r, pore, { sink: 0.3, wob: 1.8, flat: 0.8 });
  }
  // Faint violet fissures along broken cell borders.
  const wx = fbm(w, h, 5, 5, 3, 807);
  const wy = fbm(w, h, 5, 5, 3, 808);
  const F = worleyFill(makeWorley(w, h, 4, 4, 809, 1), { wx, wy, amt: 45, edges: true });
  const brk = fbm(w, h, 6, 6, 3, 810);
  const wid = fbm(w, h, 12, 12, 2, 811);
  const core = C('#b48cff');
  const glowC = C('#7a3cff');
  for (let i = 0; i < n; i++) {
    const bm = sstep(-0.05, 0.15, brk[i]);
    if (bm <= 0) continue;
    const e = F.edge[i];
    const half = (0.7 + (wid[i] + 0.5) * 1.3) * bm;
    const c = sstep(half + 0.7, half - 0.5, e) * bm;
    const g = Math.exp(-(e * e) / 30) * bm;
    const scorch = Math.exp(-e / 7) * bm;
    T.mul(i, 1 - scorch * 0.45);
    T.blend3(i, core[0] * 0.8, core[1] * 0.8, core[2] * 0.8, c * 0.85);
    T.blend3(i, glowC[0] * 0.3, glowC[1] * 0.3, glowC[2] * 0.3, g * 0.25);
    H[i] -= (sstep(half + 3, 0, e) * 3 + c * 1.5) * bm;
    const it = c * 0.75 + g * 0.2;
    E[0][i] = glowC[0] * it + core[0] * c * 0.2;
    E[1][i] = glowC[1] * it + core[1] * c * 0.2;
    E[2][i] = glowC[2] * it + core[2] * c * 0.2;
  }
  return finish(T, 0.9, [[2, 0.06, 0.03], [10, 0.03, 0.01]]);
}

function road() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const off = noise1(h, 3, 3, 901);
  const off2 = noise1(h, 5, 2, 902);
  const eL = noise1(h, 6, 4, 903);
  const eR = noise1(h, 6, 4, 904);
  const lump = fbm(w, h, 10, 10, 4, 905);
  const fine = fbm(w, h, 96, 96, 2, 906);
  const streak = fbm(w, h, 48, 3, 3, 907);
  const zone = norm(fbm(w, h, 3, 3, 3, 908));
  const dirt = ramp([[0, '#3e3020'], [0.35, '#5a4a32'], [0.65, '#76623f'], [1, '#927c54']]);
  const damp = C('#3a2e22');
  const verge = C('#3a3a1c');
  const keepG = f32(n);
  const keepP = f32(n);
  for (let y = 0, i = 0; y < h; y++) {
    const c1 = 168 + off[y] * 16 + off2[y] * 3;
    const c2 = 344 + off[y] * 16 - off2[y] * 3;
    const gl = 40 + eL[y] * 26;
    const gr = 472 + eR[y] * 26;
    for (let x = 0; x < w; x++, i++) {
      const px = x + 0.5;
      const d1 = Math.abs(px - c1);
      const d2 = Math.abs(px - c2);
      const dr = Math.min(d1, d2);
      const rw = 13 + lump[i] * 4;
      const rut = Math.exp(-(dr * dr) / (rw * rw));
      const berm = Math.exp(-((dr - rw * 1.5) ** 2) / (rw * rw * 0.5));
      const g = sstep(gl + 8, gl - 6, px + fine[i] * 8) + sstep(gr - 8, gr + 6, px + fine[i] * 8);
      const centre = Math.exp(-((px - (c1 + c2) / 2) ** 2) / 900);
      let z = 6 - rut * 5 + berm * 1.4 + centre * 1.2 + lump[i] * 2.5 + fine[i] * 0.6 + g * 3;
      z += rut * streak[i] * 0.9;
      let v = 0.55 + lump[i] * 0.55 + fine[i] * 0.35 + berm * 0.12 + centre * 0.08 - rut * 0.12;
      v += rut * streak[i] * 0.35;
      const k = lutIdx(v);
      let cr = dirt[k];
      let cg = dirt[k + 1];
      let cb = dirt[k + 2];
      const dz = rut * 0.6 * (0.6 + zone[i] * 0.6);
      cr = lerp(cr, damp[0], dz);
      cg = lerp(cg, damp[1], dz);
      cb = lerp(cb, damp[2], dz);
      cr = lerp(cr, verge[0] * (0.8 + fine[i]), g);
      cg = lerp(cg, verge[1] * (0.8 + fine[i]), g);
      cb = lerp(cb, verge[2] * (0.8 + fine[i]), g);
      // loose grit: pale and dark grains, fewer in the ruts
      const gh = hash1(i, 912);
      const gk = gh > 0.972 + rut * 0.02 ? 1.22 : gh < 0.03 ? 0.72 : 1;
      R[i] = cr * gk;
      G[i] = cg * gk;
      B[i] = cb * gk;
      H[i] = z + (gk !== 1 ? 0.5 : 0);
      keepG[i] = g + centre * 0.2 * (1 - rut);
      keepP[i] = (1 - rut * 0.85) * (1 - g * 0.7);
    }
  }
  const r = rng(909);
  const mott = fbm(w, h, 48, 48, 2, 910);
  const pebC = ['#7a7066', '#8a7a62', '#5e554a', '#a89a80', '#6a5e50', '#948a7c'].map(C);
  for (let k = 0; k < 420; k++) {
    const x = r() * w;
    const y = r() * h;
    if (r() > keepP[T.at(x, y)]) continue;
    const rx = 1.4 + Math.pow(r(), 2) * 5;
    rock(T, x, y, rx, rx * (0.6 + r() * 0.4), r() * TAU, pebC[(r() * pebC.length) | 0], 1 + rx * 0.55, r, mott, { sink: 0.35 });
  }
  blades(T, 16000, 911, {
    keep: keepG, len: [5, 13], wid: [0.55, 1.0], zk: 0.5,
    base: ['#2a2c14', '#33341a'],
    tip: ['#6a7a30', '#7a8a3a', '#8a8a42', '#5a6a28', '#9a9450', '#728036'],
  });
  return finish(T, 1.0, [[2, 0.07, 0.03], [10, 0.035, 0.012]]);
}

/* ================================================================ masonry */

function cobble() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const W = makeWorley(w, h, 20, 20, 1001, 0.5, true);
  const wx = fbm(w, h, 16, 16, 2, 1002);
  const wy = fbm(w, h, 16, 16, 2, 1003);
  const F = worleyFill(W, { round: 5, wx, wy, amt: 3, vec: true, edges: true });
  const gapN = fbm(w, h, 24, 24, 2, 1004);
  const surf = fbm(w, h, 32, 32, 3, 1005);
  const fine = fbm(w, h, 128, 128, 1, 1006);
  const mossN = fbm(w, h, 8, 8, 3, 1007);
  const pal = ['#77736c', '#686a6e', '#7e766a', '#5c5854', '#857c70', '#6e665c', '#726a62', '#72767a'].map(C);
  const soil = C('#1e1a15');
  const moss = C('#2e3a18');
  for (let i = 0; i < n; i++) {
    const k = F.id[i];
    const e = F.edge[i];
    const gap = 1.6 + (gapN[i] + 0.5) * 1.2;
    const s = sstep(gap - 0.6, gap + 0.6, e);
    const rad = W.cw * 0.42;
    const dome = Math.pow(clamp((e - gap) / rad), 0.55);
    const tilt = (W.RA[k] - 0.5) * 0.1 * F.vx[i] + (W.RB[k] - 0.5) * 0.1 * F.vy[i];
    const zs = 3 + dome * 7 + W.RC[k] * 2 + tilt + surf[i] * 1.2 + fine[i] * 0.3;
    const zg = 1 + fine[i] * 0.4;
    const c = pal[(W.RD[k] * pal.length) | 0];
    const kk = (0.8 + W.RA[k] * 0.3) * (0.78 + dome * 0.3 + surf[i] * 0.35) + (hash1(i, 1008) - 0.5) * 0.1;
    const mm = sstep(0.05, 0.25, mossN[i] + fine[i] * 0.2);
    const gr = lerp(soil[0], moss[0], mm) * (0.8 + fine[i]);
    const gg = lerp(soil[1], moss[1], mm) * (0.8 + fine[i]);
    const gb = lerp(soil[2], moss[2], mm) * (0.8 + fine[i]);
    R[i] = lerp(gr, c[0] * kk, s);
    G[i] = lerp(gg, c[1] * kk, s);
    B[i] = lerp(gb, c[2] * kk, s);
    H[i] = lerp(zg, zs, s);
  }
  return finish(T, 1.0, [[2, 0.08, 0.03], [8, 0.04, 0.01]]);
}

function stonewall() {
  const T = new Tex(512, 512);
  const { w, h, R, G, B, H } = T;
  const r = rng(1101);
  const L = bondLayout(w, h, rowHeights(512, [56, 64, 64, 72, 80, 48], r), 1102, 90, 200);
  const wx = fbm(w, h, 16, 16, 2, 1103);
  const wy = fbm(w, h, 16, 16, 2, 1104);
  const chip = fbm(w, h, 32, 32, 3, 1105);
  const face = fbm(w, h, 8, 8, 5, 1106);
  const fine = fbm(w, h, 128, 128, 1, 1107);
  const pit = fbm(w, h, 64, 64, 2, 1112);
  const streak = fbm(w, h, 48, 2, 3, 1108);
  const lichen = norm(fbm(w, h, 14, 14, 4, 1109));
  const tool = fbm(w, h, 64, 6, 2, 1110);
  const pal = ['#8a8478', '#9a9080', '#7a7670', '#a39a88', '#6f6a64', '#948a7a', '#837a6c'].map(C);
  const mortar = C('#8a8274');
  const lc = C('#8e8e6a');
  const grime = C('#3a3630');
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      bondAt(L, x + 0.5 + wx[i] * 1.5, y + 0.5 + wy[i] * 1.5);
      const QLX = BQ[0];
      const QLY = BQ[1];
      const b = QB;
      const e = rrect(BQ[2], BQ[3], 3) - 1.6 - Math.max(0, chip[i]) * 4;
      const s = sstep(-0.5, 0.5, e);
      const bevel = sstep(0, 5, e);
      const u = QLX / b.w - 0.5;
      const v = QLY / b.h - 0.5;
      const pt = pit[i] < -0.18 ? (pit[i] + 0.18) * 4 : 0;
      const zb = 10 + bevel * 3 + face[i] * 2.2 + fine[i] * 0.45 + tool[i] * 0.4 + pt + (b.r1 - 0.5) * 2 + u * (b.r2 - 0.5) * 3 + v * (b.r3 - 0.5) * 2;
      const zm = 5 + fine[i] * 0.6 + face[i] * 0.6;
      const c = pal[(b.r4 * pal.length) | 0];
      let kk = (0.88 + b.r5 * 0.22) * (0.86 + face[i] * 0.3 + fine[i] * 0.14 + tool[i] * 0.05 + pt * 0.12) + (hash1(i, 1111) - 0.5) * 0.07;
      kk *= 1 + (1 - bevel) * 0.1;
      let cr = c[0] * kk;
      let cg = c[1] * kk;
      let cb = c[2] * kk;
      // rain streaks running down from each course top, grime toward the bottom
      const st = sstep(0.05, 0.3, streak[i]) * (1 - (QLY / b.h) * 0.5);
      const gm = st * 0.4 + sstep(0.15, 0.5, v) * 0.12;
      cr = lerp(cr, grime[0], gm);
      cg = lerp(cg, grime[1], gm);
      cb = lerp(cb, grime[2], gm);
      // soft lichen, mostly low on the blocks and along the joints
      const lch = sstep(0.62, 0.82, lichen[i] + fine[i] * 0.12 + v * 0.12 + (1 - bevel) * 0.08) * 0.38;
      cr = lerp(cr, lc[0] * kk, lch);
      cg = lerp(cg, lc[1] * kk, lch);
      cb = lerp(cb, lc[2] * kk, lch);
      const mk = 0.8 + fine[i] * 0.3;
      R[i] = lerp(mortar[0] * mk, cr, s);
      G[i] = lerp(mortar[1] * mk, cg, s);
      B[i] = lerp(mortar[2] * mk, cb, s);
      H[i] = lerp(zm, zb, s);
    }
  }
  return finish(T, 1.0, [[2, 0.08, 0.04], [9, 0.035, 0.012]]);
}

function barrowwall() {
  const T = new Tex(512, 512);
  const { w, h, R, G, B, H } = T;
  const r = rng(1201);
  const L = bondLayout(w, h, rowHeights(512, [18, 22, 26, 30, 34, 40], r), 1202, 34, 150);
  const wx = fbm(w, h, 12, 12, 3, 1203);
  const wy = fbm(w, h, 12, 12, 3, 1204);
  const edgeN = fbm(w, h, 40, 40, 3, 1205);
  const edgeB = fbm(w, h, 16, 16, 2, 1211);
  const face = fbm(w, h, 10, 10, 4, 1206);
  const fine = fbm(w, h, 128, 128, 1, 1207);
  const earthN = fbm(w, h, 24, 24, 3, 1208);
  const lichen = norm(fbm(w, h, 16, 16, 3, 1209));
  const pal = ['#5a554c', '#6a6254', '#4a4642', '#726a5c', '#5e5a52', '#665e50', '#504a42'].map(C);
  const earth = ramp([[0, '#1a120b'], [0.5, '#2c2014'], [1, '#43321f']]);
  const lc = C('#7c8462');
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      bondAt(L, x + 0.5 + wx[i] * 3, y + 0.5 + wy[i] * 2);
      const QLY = BQ[1];
      const b = QB;
      const gap = 2 + b.r1 * 3.5;
      const e = rrect(BQ[2], BQ[3], Math.min(7, b.h * 0.35)) - gap - edgeN[i] * 3 - edgeB[i] * 6;
      const s = sstep(-0.6, 0.6, e);
      const bulge = Math.sqrt(clamp(e / (b.h * 0.42)));
      const zs = 6 + bulge * 6 + face[i] * 2 + fine[i] * 0.45 + (b.r2 - 0.5) * 4;
      const ek = lutIdx(0.5 + earthN[i] * 0.9 + fine[i] * 0.3);
      const ze = earthN[i] * 1.5 + fine[i] * 0.4;
      const c = pal[(b.r3 * pal.length) | 0];
      const kk = (0.82 + b.r4 * 0.3) * (0.8 + face[i] * 0.35 + bulge * 0.15 + fine[i] * 0.1) * (1 - sstep(0.6, 1, QLY / b.h) * 0.15) + (hash1(i, 1210) - 0.5) * 0.07;
      let cr = c[0] * kk;
      let cg = c[1] * kk;
      let cb = c[2] * kk;
      const lch = sstep(0.66, 0.84, lichen[i] + fine[i] * 0.15) * 0.35;
      cr = lerp(cr, lc[0] * kk * 1.1, lch);
      cg = lerp(cg, lc[1] * kk * 1.1, lch);
      cb = lerp(cb, lc[2] * kk * 1.1, lch);
      R[i] = lerp(earth[ek], cr, s);
      G[i] = lerp(earth[ek + 1], cg, s);
      B[i] = lerp(earth[ek + 2], cb, s);
      H[i] = lerp(ze, zs, s);
    }
  }
  // Roots hanging down through the joints.
  const root0 = C('#2a1e12');
  const root1 = C('#6a5236');
  const down = (a) => (Math.PI / 2 - a) * 0.12;
  for (let k = 0; k < 24; k++) {
    const x = r() * w;
    const y = r() * h;
    const steps = 8 + ((r() * 14) | 0);
    const pts = wander(r, x, y, Math.PI / 2 + (r() - 0.5) * 0.6, steps, 7, 0.5, down);
    const rad = 1.4 + r() * 1.4;
    poly(T, pts, rad, 0.35, root1, root0, 22, 20, rad, 0.5, false);
    for (let b = 0; b < 3; b++) {
      if (r() < 0.4) continue;
      const j = 2 * (1 + ((r() * (steps - 2)) | 0));
      const sp = wander(r, pts[j], pts[j + 1], Math.PI / 2 + (r() - 0.5) * 1.6, 2 + ((r() * 3) | 0), 5, 0.8, down);
      poly(T, sp, rad * 0.45, 0.25, root1, root0, 21, 20, rad * 0.4, 0.4, false);
    }
  }
  return finish(T, 1.0, [[2, 0.08, 0.035], [9, 0.04, 0.012]]);
}

function barrowfloor() {
  const T = new Tex(512, 512);
  const { w, h, R, G, B, H } = T;
  const r = rng(1301);
  const L = bondLayout(w, h, rowHeights(512, [84, 96, 110, 120, 128], r), 1302, 90, 210);
  const wx = fbm(w, h, 6, 6, 3, 1303);
  const wy = fbm(w, h, 6, 6, 3, 1304);
  const edgeN = fbm(w, h, 40, 40, 3, 1305);
  const face = fbm(w, h, 8, 8, 5, 1306);
  const fine = fbm(w, h, 128, 128, 1, 1307);
  const dampN = fbm(w, h, 4, 4, 4, 1308);
  const mossN = fbm(w, h, 10, 10, 3, 1309);
  const CR = worleyFill(makeWorley(w, h, 5, 5, 1310, 1), { wx, wy, amt: 30, edges: true });
  const pal = ['#6c665c', '#5e5a52', '#787064', '#545048', '#6a6052', '#625c54'].map(C);
  const earth = ramp([[0, '#1c140c'], [0.5, '#2e2216'], [1, '#463420']]);
  const moss = C('#34401c');
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      bondAt(L, x + 0.5 + wx[i] * 8, y + 0.5 + wy[i] * 8);
      const QLX = BQ[0];
      const QLY = BQ[1];
      const QDX = BQ[2];
      const QDY = BQ[3];
      const b = QB;
      const gap = 2.5 + b.r1 * 2.5;
      const e = rrect(QDX, QDY, 10) - gap - edgeN[i] * 2.5;
      const s = sstep(-0.6, 0.6, e);
      const u = QLX / b.w - 0.5;
      const v = QLY / b.h - 0.5;
      const dish = (1 - (u * u + v * v) * 2.5) * 1.6 * b.r2;
      let zs = 8 + sstep(0, 12, e) * 3 - dish + face[i] * 2 + fine[i] * 0.35 + (b.r3 - 0.5) * 2 + u * (b.r4 - 0.5) * 3;
      const crack = b.r5 < 0.4 && CR.edge[i] < 1 ? 1 - CR.edge[i] : 0;
      zs -= crack * 2.5;
      const c = pal[(b.r6 * pal.length) | 0];
      let kk = (0.85 + b.r4 * 0.25) * (0.85 + face[i] * 0.3 + fine[i] * 0.1) + (hash1(i, 1311) - 0.5) * 0.05;
      kk *= 1 - Math.max(0, dampN[i]) * 0.35;
      kk *= 1 + dish * 0.03;
      kk *= 1 - crack * 0.5;
      // earth smeared onto the stone near the joints
      const smear = sstep(8, 0, e) * 0.35;
      const ek = lutIdx(0.5 + face[i] * 0.6 + fine[i] * 0.5);
      const m = sstep(0.1, 0.3, mossN[i] + fine[i] * 0.2) * 0.8;
      const er = lerp(earth[ek], moss[0], m);
      const eg = lerp(earth[ek + 1], moss[1], m);
      const eb = lerp(earth[ek + 2], moss[2], m);
      const cr = lerp(c[0] * kk, er, smear);
      const cg = lerp(c[1] * kk, eg, smear);
      const cb = lerp(c[2] * kk, eb, smear);
      R[i] = lerp(er, cr, s);
      G[i] = lerp(eg, cg, s);
      B[i] = lerp(eb, cb, s);
      H[i] = lerp(2 + fine[i] * 0.6 + face[i] * 0.6, zs, s);
    }
  }
  return finish(T, 1.0, [[2, 0.08, 0.03], [9, 0.035, 0.012]]);
}

function barrowceil() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const lump = fbm(w, h, 8, 8, 4, 1401);
  const fine = fbm(w, h, 96, 96, 2, 1402);
  const clod = worleyFill(makeWorley(w, h, 30, 30, 1403, 0.9));
  const earth = ramp([[0, '#140e08'], [0.4, '#22180f'], [0.7, '#33251a'], [1, '#4a3826']]);
  for (let i = 0; i < n; i++) {
    const cl = clamp(1 - clod.f1[i] / 11);
    const k = lutIdx(0.45 + lump[i] * 0.6 + fine[i] * 0.4 + cl * 0.25);
    R[i] = earth[k];
    G[i] = earth[k + 1];
    B[i] = earth[k + 2];
    H[i] = lump[i] * 6 + cl * 2.5 + fine[i] * 0.7;
  }
  const r = rng(1404);
  const mott = fbm(w, h, 40, 40, 2, 1405);
  const stC = ['#4a4036', '#3e362e', '#55493c'].map(C);
  for (let k = 0; k < 26; k++) {
    const rx = 3 + r() * 7;
    rock(T, r() * w, r() * h, rx, rx * (0.6 + r() * 0.4), r() * TAU, stC[(r() * 3) | 0], 2 + rx * 0.4, r, mott, { sink: 0.4 });
  }
  const root0 = C('#2a1d12');
  const root1 = C('#6e5438');
  const roots = (count, lift) => {
    for (let k = 0; k < count; k++) {
      const pts = wander(r, r() * w, r() * h, r() * TAU, 18 + ((r() * 30) | 0), 8, 0.55);
      const rad = 1.2 + Math.pow(r(), 2) * 3.5;
      poly(T, pts, rad, 0.5, root1, root0, lift, lift, rad, 0.55, false);
      for (let b = 0; b < 3; b++) {
        const j = 2 * (2 + ((r() * 12) | 0));
        const sp = wander(r, pts[j], pts[j + 1], r() * TAU, 4 + ((r() * 6) | 0), 6, 0.8);
        poly(T, sp, rad * 0.5, 0.3, root1, root0, lift - 0.5, lift - 0.5, rad * 0.4, 0.5, false);
      }
    }
  };
  roots(20, 9);
  // Rough-hewn timber lintels running across the tile.
  const grainA = fbm(w, h, 4, 64, 3, 1406);
  const grainB = fbm(w, h, 2, 24, 3, 1407);
  const crk = fbm(w, h, 3, 96, 2, 1408);
  const adzeN = fbm(w, h, 24, 6, 2, 1409);
  const wood = ramp([[0, '#1e160e'], [0.35, '#382a1c'], [0.65, '#4e3c2a'], [1, '#685440']]);
  const beams = [
    { y0: 150, y1: 262, t: noise1(w, 8, 3, 1410), b: noise1(w, 8, 3, 1411) },
    { y0: 390, y1: 462, t: noise1(w, 8, 3, 1412), b: noise1(w, 8, 3, 1413) },
  ];
  for (const bm of beams) {
    for (let y = bm.y0 - 12; y < bm.y1 + 12; y++) {
      for (let x = 0; x < w; x++) {
        const i = T.at(x, y);
        const top = bm.y0 + bm.t[x] * 10;
        const bot = bm.y1 + bm.b[x] * 10;
        const e = Math.min(y + 0.5 - top, bot - y - 0.5);
        const s = sstep(-0.6, 0.6, e);
        if (s <= 0) continue;
        const mid = (top + bot) / 2;
        const ring = fract((y - mid) * 0.13 + grainB[i] * 3);
        const line = sstep(0.75, 0.95, ring);
        const adze = Math.cos(fract(x / (512 / 22) + adzeN[i] * 0.4) * TAU) * 0.5 + 0.5;
        const ck = crk[i] > 0.0 && crk[i] < 0.02 ? 1 : 0;
        let v = 0.5 + grainA[i] * 0.8 - line * 0.18 + adze * 0.08 - ck * 0.4 + fine[i] * 0.1;
        v -= sstep(14, 0, e) * 0.15;
        const k = lutIdx(v);
        T.blend3(i, wood[k], wood[k + 1], wood[k + 2], s);
        const z = 16 + sstep(0, 12, e) * 5 + grainA[i] * 1.2 - line * 0.6 - adze * 1.4 - ck * 2.5;
        H[i] = lerp(H[i], z, s);
      }
    }
  }
  roots(5, 24);
  return finish(T, 1.0, [[2, 0.08, 0.035], [10, 0.045, 0.012]]);
}

/* ================================================================ the Spire */

function obsidian() {
  const T = new Tex(512, 512);
  const { w, h, R, G, B, H } = T;
  const L = bondLayout(w, h, [128, 128, 128, 128], 1501, 150, 300);
  const und = fbm(w, h, 6, 6, 4, 1502);
  const fine = fbm(w, h, 128, 128, 1, 1503);
  const chipW = worleyFill(makeWorley(w, h, 48, 48, 1504, 0.9));
  const flow = fbm(w, h, 2, 20, 3, 1509);
  const vx = fbm(w, h, 4, 4, 3, 1505);
  const vy = fbm(w, h, 4, 4, 3, 1506);
  const vein = ridged(w, h, 3, 3, 4, 1507);
  const glass = ramp([[0, '#08070c'], [0.4, '#121019'], [0.7, '#201c2a'], [1, '#3a3448']]);
  const violet = C('#6a3aa0');
  const r = rng(1508);
  // Conchoidal scars: shell-shaped chips struck out of each block's edges,
  // rippled with rings that widen away from the point of impact.
  const scars = [];
  for (let k = 0; k < L.count; k++) {
    const list = [];
    const m = 1 + ((r() * 2.6) | 0);
    for (let j = 0; j < m; j++) {
      const side = (r() * 4) | 0;
      const t = 0.1 + r() * 0.8;
      list.push([side, t, 20 + r() * 34, 2.2 + r() * 1.5, r() * TAU]);
    }
    scars.push(list);
  }
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      bondAt(L, x + 0.5, y + 0.5);
      const QLX = BQ[0];
      const QLY = BQ[1];
      const QDX = BQ[2];
      const QDY = BQ[3];
      const b = QB;
      const chip = clamp(1 - chipW.f1[i] / 6) * 3;
      const e = rrect(QDX, QDY, 4) - 1.3 - chip * sstep(10, 2, Math.min(QDX, QDY));
      const s = sstep(-0.5, 0.5, e);
      const bev = sstep(0, 6, e);
      let dish = 0;
      let ripple = 0;
      let rim = 0;
      for (const sc of scars[b.id]) {
        const side = sc[0];
        const cx = side === 0 ? sc[1] * b.w : side === 1 ? b.w : side === 2 ? sc[1] * b.w : 0;
        const cy = side === 0 ? 0 : side === 1 ? sc[1] * b.h : side === 2 ? b.h : sc[1] * b.h;
        const dx = QLX - cx;
        const dy = QLY - cy;
        const d = Math.sqrt(dx * dx + dy * dy) * (1 + und[i] * 0.25);
        const R0 = sc[2];
        if (d < R0 * 1.1) {
          const t = d / R0;
          if (t < 1) {
            dish += (1 - t * t) * R0 * 0.1;
            ripple += Math.sin(Math.sqrt(d) * sc[3] * 2 + sc[4]) * (1 - t) * 0.6;
          }
          rim += Math.exp(-((t - 1) * (t - 1)) / 0.004);
        }
      }
      const u = QLX / b.w - 0.5;
      const v = QLY / b.h - 0.5;
      const zb = 12 + bev * 3 + und[i] * 2.5 - dish + ripple * 0.5 + rim * 0.4 + (b.r1 - 0.5) * 2 + u * (b.r2 - 0.5) * 10 + v * (b.r3 - 0.5) * 6 + fine[i] * 0.08;
      const fl = sstep(0.1, 0.35, flow[i]) * 0.12;
      const tone = 0.36 + und[i] * 0.4 + ripple * 0.16 + rim * 0.35 + dish * 0.02 + (b.r4 - 0.5) * 0.14 + (1 - bev) * 0.3 + fl;
      const vv = sample(vein, w, h, x + 0.5 + vx[i] * 60, y + 0.5 + vy[i] * 60);
      const vl = sstep(0.88, 0.97, vv) * (0.6 + b.r5 * 0.4);
      const k = lutIdx(tone);
      let cr = glass[k];
      let cg = glass[k + 1];
      let cb = glass[k + 2];
      cr = lerp(cr, violet[0], vl * 0.6);
      cg = lerp(cg, violet[1], vl * 0.6);
      cb = lerp(cb, violet[2], vl * 0.6);
      R[i] = lerp(0.02, cr, s);
      G[i] = lerp(0.018, cg, s);
      B[i] = lerp(0.028, cb, s);
      H[i] = lerp(6, zb, s);
    }
  }
  return finish(T, 1.0, [[2, 0.06, 0.03], [10, 0.02, 0.01]]);
}

// An original rune alphabet: strokes on a 4 x 8 grid.
const RUNES = [
  [[2, 0, 2, 8], [2, 1, 4, 3], [2, 3, 4, 5]],
  [[1, 0, 1, 8], [3, 0, 3, 8], [1, 5, 3, 3]],
  [[2, 0, 2, 8], [0, 2, 4, 6], [4, 2, 0, 6]],
  [[2, 0, 0, 2], [0, 2, 2, 4], [2, 4, 4, 2], [4, 2, 2, 0], [2, 4, 2, 8]],
  [[0, 0, 4, 0], [2, 0, 2, 8], [2, 5, 4, 7]],
  [[0, 0, 2, 3], [4, 0, 2, 3], [2, 3, 2, 8], [0, 8, 2, 6], [4, 8, 2, 6]],
  [[2, 0, 2, 8], [0, 1, 2, 3], [4, 1, 2, 3], [0, 5, 2, 7], [4, 5, 2, 7]],
  [[1, 0, 1, 8], [1, 2, 4, 4], [4, 4, 1, 6], [3, 0, 4, 1]],
  [[0, 0, 4, 4], [4, 4, 0, 8], [2, 2, 2, 6]],
  [[2, 0, 2, 8], [0, 3, 2, 1], [2, 1, 4, 3], [0, 7, 4, 5]],
  [[0, 2, 2, 0], [2, 0, 4, 2], [2, 0, 2, 8], [0, 6, 4, 6]],
  [[1, 0, 3, 0], [2, 0, 2, 5], [0, 5, 4, 5], [0, 5, 2, 8], [4, 5, 2, 8]],
  [[1, 0, 1, 8], [1, 4, 4, 1], [4, 1, 4, 5]],
  [[2, 0, 2, 8], [0, 4, 2, 2], [2, 2, 4, 4], [0, 4, 2, 6], [2, 6, 4, 4]],
  [[0, 0, 2, 2], [4, 0, 2, 2], [2, 2, 2, 8], [0, 8, 4, 6]],
  [[1, 0, 1, 6], [1, 6, 3, 8], [3, 8, 3, 2], [3, 2, 1, 0]],
];

function runeStrokes(T, M, Gl, idx, ox, oy, sx, sy, core, sigma) {
  for (const [a, b, c, d] of RUNES[idx % RUNES.length]) glowLine(T, M, Gl, ox + a * sx, oy + b * sy, ox + c * sx, oy + d * sy, core, sigma);
}

function spirewall() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const E = T.em();
  const L = bondLayout(w, h, [64, 64, 64, 64, 64, 64, 64, 64], 1601, 112, 220);
  const smk = fbm(w, h, 6, 6, 5, 1602);
  const swx = fbm(w, h, 4, 4, 3, 1603);
  const fine = fbm(w, h, 128, 128, 1, 1604);
  const vn = veins(w, h, 1607, 4, 60, 0.6, 0);
  const stone = ramp([[0, '#07060a'], [0.45, '#100e15'], [0.75, '#1b1823'], [1, '#2c2738']]);
  const M = f32(n);
  const Gl = f32(n);
  const r = rng(1605);
  // Jagged rune-veins: cracks that glow, running with sharp turns and
  // branching, now and then passing through a cut rune.
  const crack = (x, y, a, steps, core, depth) => {
    for (let s = 0; s < steps; s++) {
      a += (r() - 0.5) * 0.9;
      if (r() < 0.12) a += (r() < 0.5 ? 1 : -1) * 0.9;
      const len = 4 + r() * 7;
      const nx = x + Math.cos(a) * len;
      const ny = y + Math.sin(a) * len;
      const c = core * (1 - (s / steps) * 0.45);
      glowLine(T, M, Gl, x, y, nx, ny, c, 3.2);
      if (depth < 2 && r() < 0.14) crack(nx, ny, a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), 3 + ((r() * 6) | 0), c * 0.75, depth + 1);
      x = nx;
      y = ny;
    }
  };
  for (let v = 0; v < 14; v++) crack(r() * w, r() * h, r() * TAU, 10 + ((r() * 14) | 0), 0.85, 0);
  for (const row of L.rows) {
    for (const b of row.blocks) {
      if (b.r6 >= 0.28) continue;
      const cx = b.x0 + b.w * (0.3 + b.r5 * 0.4);
      const cy = b.y0 + b.h / 2;
      runeStrokes(T, M, Gl, (b.r4 * 16) | 0, cx - 8, cy - 18, 4, 4.5, 0.85, 3);
      // a hairline crack leading out of the rune
      crack(cx + 2, cy + 18, Math.PI / 2 + (r() - 0.5), 3 + ((r() * 4) | 0), 0.6, 1);
    }
  }
  const vio = C('#c7a4ff');
  const glow = C('#8a4aff');
  const hot = C('#f0e2ff');
  const vline = C('#2c2638');
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      bondAt(L, x + 0.5, y + 0.5);
      const b = QB;
      const e = rrect(BQ[2], BQ[3], 2.5) - 1.6;
      const s = sstep(-0.5, 0.5, e);
      const bev = sstep(0, 3.5, e);
      const sm = sample(smk, w, h, x + 0.5 + swx[i] * 50 + b.r1 * 200, y + 0.5);
      const tone = 0.4 + sm * 0.7 + fine[i] * 0.06 + (b.r1 - 0.5) * 0.22 + (1 - bev) * 0.35;
      const k = lutIdx(tone);
      let cr = stone[k];
      let cg = stone[k + 1];
      let cb = stone[k + 2] * (1 + b.r2 * 0.15);
      const vl = vn[i] * 0.5;
      cr = lerp(cr, vline[0], vl);
      cg = lerp(cg, vline[1], vl);
      cb = lerp(cb, vline[2], vl);
      if (hash1(i, 1606) > 0.997) {
        cr += 0.1;
        cg += 0.09;
        cb += 0.13;
      }
      const m = M[i];
      const g = Gl[i];
      cr = lerp(cr, vio[0], m * 0.9) + glow[0] * g * 0.08;
      cg = lerp(cg, vio[1], m * 0.9) + glow[1] * g * 0.08;
      cb = lerp(cb, vio[2], m * 0.9) + glow[2] * g * 0.08;
      R[i] = lerp(0.015, cr, s);
      G[i] = lerp(0.012, cg, s);
      B[i] = lerp(0.02, cb, s);
      H[i] = lerp(6, 10 + bev * 2.2 + sm * 0.5 + fine[i] * 0.05 + (b.r3 - 0.5) * 0.8, s) - m * 1.2;
      const it = m + g * 0.32;
      E[0][i] = clamp(glow[0] * it + hot[0] * m * m * 0.35);
      E[1][i] = clamp(glow[1] * it + hot[1] * m * m * 0.35);
      E[2][i] = clamp(glow[2] * it + hot[2] * m * m * 0.35);
    }
  }
  return finish(T, 1.0, [[2, 0.07, 0.03], [8, 0.02, 0.01]]);
}

// Marble veins: the zero-crossings of a domain-warped fBm, drawn at a
// width in pixels by dividing the value by its local gradient. The width
// swells and thins along each vein and some stretches fade out. `halo` > 0
// also returns a soft falloff around the lines.
function veins(w, h, seed, cells, warpAmt, width, halo) {
  const base = fbm(w, h, cells, cells, 3, seed);
  const wx = fbm(w, h, 2, 2, 4, seed + 1);
  const wy = fbm(w, h, 2, 2, 4, seed + 2);
  const wm = fbm(w, h, 5, 5, 3, seed + 3);
  const out = f32(w * h);
  const hl = halo > 0 ? f32(w * h) : null;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const sx = x + 0.5 + wx[i] * warpAmt;
      const sy = y + 0.5 + wy[i] * warpAmt;
      const v = sample(base, w, h, sx, sy);
      const gx = sample(base, w, h, sx + 1, sy) - v;
      const gy = sample(base, w, h, sx, sy + 1) - v;
      const d = Math.abs(v) / (Math.sqrt(gx * gx + gy * gy) + 1e-6);
      const m = wm[i];
      const wd = width * (0.35 + 1.6 * clamp(m + 0.5));
      const fade = sstep(-0.42, 0.05, m);
      out[i] = (1 - sstep(wd - 0.6, wd + 0.6, d)) * fade;
      if (hl) hl[i] = Math.exp(-d / (halo * (0.6 + clamp(m + 0.5)))) * (0.3 + fade * 0.7);
    }
  }
  return hl ? { line: out, halo: hl } : out;
}

function spirefloor() {
  const T = new Tex(512, 512);
  const { w, h, R, G, B, H } = T;
  const V1 = veins(w, h, 1701, 3, 70, 1.1, 7);
  const v1 = V1.line;
  const vh = V1.halo;
  const v2 = veins(w, h, 1704, 7, 40, 0.5, 0);
  const cloud = fbm(w, h, 5, 5, 4, 1707);
  const fine = fbm(w, h, 128, 128, 1, 1708);
  const goldN = fbm(w, h, 64, 64, 2, 1709);
  const r = rng(1710);
  const offs = [];
  for (let k = 0; k < 16; k++) offs.push([Math.floor(r() * 512), Math.floor(r() * 512), r(), r()]);
  const blk = ramp([[0, '#060508'], [0.5, '#0e0c12'], [1, '#1c1822']]);
  const vio = ramp([[0, '#110818'], [0.5, '#1e0f29'], [1, '#32183e']]);
  const bVein = C('#7a7286');
  const vVein = C('#9a6ab8');
  const gold = C('#c89a3a');
  const goldHi = C('#ecc66a');
  const gem = C('#7a3ab8');
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const ti = x >> 7;
      const tj = y >> 7;
      const tx = (x & 127) + 0.5;
      const ty = (y & 127) + 0.5;
      const dx = Math.min(tx, 128 - tx);
      const dy = Math.min(ty, 128 - ty);
      const e = Math.min(dx, dy);
      const ck = (ti + tj) & 1;
      const o = offs[tj * 4 + ti];
      const j = ((y + o[1]) & 511) * 512 + ((x + o[0]) & 511);
      const a = v1[j];
      const hb = vh[j];
      const b = v2[j];
      const cl = cloud[j];
      const k = lutIdx(0.5 + cl * 0.7 + fine[i] * 0.06 + hb * 0.18);
      let cr;
      let cg;
      let cb;
      if (ck) {
        cr = lerp(vio[k], vVein[0], a * 0.8 + b * 0.3);
        cg = lerp(vio[k + 1], vVein[1], a * 0.8 + b * 0.3);
        cb = lerp(vio[k + 2], vVein[2], a * 0.8 + b * 0.3);
      } else {
        cr = lerp(blk[k], bVein[0], a * 0.75 + b * 0.28);
        cg = lerp(blk[k + 1], bVein[1], a * 0.75 + b * 0.28);
        cb = lerp(blk[k + 2], bVein[2], a * 0.75 + b * 0.28);
      }
      let z = 8 + (o[2] - 0.5) * 0.6 + cl * 0.15;
      // gold inlay along the joints, a groove either side, diamonds at corners
      const g = sstep(2.1, 1.2, e);
      const groove = sstep(3.3, 2.5, e) * (1 - g);
      const cd = dx + dy;
      const dia = sstep(11, 10, cd);
      const gemM = sstep(5, 4, cd);
      const gm = Math.max(g, dia * (1 - gemM));
      const gt = 0.75 + goldN[i] * 0.5 + fine[i] * 0.15;
      const gr = lerp(gold[0], goldHi[0], clamp(goldN[i] + 0.5)) * gt;
      const gg = lerp(gold[1], goldHi[1], clamp(goldN[i] + 0.5)) * gt;
      const gb = lerp(gold[2], goldHi[2], clamp(goldN[i] + 0.5)) * gt;
      cr = lerp(cr * (1 - groove * 0.6), gr, gm);
      cg = lerp(cg * (1 - groove * 0.6), gg, gm);
      cb = lerp(cb * (1 - groove * 0.6), gb, gm);
      cr = lerp(cr, gem[0], gemM);
      cg = lerp(cg, gem[1], gemM);
      cb = lerp(cb, gem[2], gemM);
      z = z - groove * 1.4 - gm * 0.3 + gemM * 0.4;
      R[i] = cr;
      G[i] = cg;
      B[i] = cb;
      H[i] = z;
    }
  }
  return finish(T, 1.2, [[1, 0.1, 0.03]]);
}

/* ================================================================ village */

function wood() {
  const T = new Tex(512, 512);
  const { w, h, R, G, B, H } = T;
  const L = bondLayout(w, h, [64, 64, 64, 64, 64, 64, 64, 64], 1801, 200, 470);
  const fib = fbm(w, h, 6, 96, 3, 1802);
  const warp = fbm(w, h, 3, 12, 3, 1803);
  const weather = norm(fbm(w, h, 5, 5, 4, 1804));
  const fine = fbm(w, h, 128, 128, 1, 1805);
  const crackN = fbm(w, h, 4, 80, 2, 1806);
  const woodL = ramp([[0, '#2a221a'], [0.3, '#433629'], [0.55, '#5f4f3e'], [0.8, '#7a6852'], [1, '#93826a']]);
  const grey = C('#8a857c');
  const r = rng(1807);
  const knots = [];
  for (let k = 0; k < L.count; k++) {
    const ks = [];
    const nk = r() < 0.6 ? 1 + ((r() * 2) | 0) : 0;
    for (let j = 0; j < nk; j++) ks.push([0.15 + r() * 0.7, 18 + r() * 28, 3 + r() * 5]);
    knots.push(ks);
  }
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      bondAt(L, x + 0.5, y + 0.5);
      const QLX = BQ[0];
      const QLY = BQ[1];
      const QDX = BQ[2];
      const QDY = BQ[3];
      const b = QB;
      const ex = QDX - 1.0;
      const ey = QDY - 1.4;
      const e = Math.min(ex, ey);
      const s = sstep(-0.5, 0.5, e);
      let rc = (QLY - 32) * (0.8 + b.r1 * 0.5) + b.r2 * 40 + warp[i] * 14;
      let kd = 9;
      const kn = knots[b.id];
      for (let q = 0; q < kn.length; q++) {
        const ku = kn[q][0];
        const kv = kn[q][1];
        const kr = kn[q][2];
        const dx = QLX - ku * b.w;
        const dy = QLY - kv;
        const g = Math.exp(-((dx * dx) / (kr * kr * 14) + (dy * dy) / (kr * kr * 2.2)));
        rc += g * kr * 2 * (dy < 0 ? -1 : 1);
        const ex = dx / kr;
        const ey = dy / (kr * 0.8);
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d < kd) kd = d;
      }
      const sp = 5 + b.r3 * 4;
      const ring = fract(rc / sp);
      const line = sstep(0.7, 0.9, ring) * (1 - sstep(0.9, 1, ring) * 0.5);
      const ck = b.r4 < 0.35 && Math.abs(crackN[i]) < 0.007 ? sstep(0.35, 0.65, weather[i]) : 0;
      let v = 0.55 + fib[i] * 0.6 - line * 0.22 + fine[i] * 0.1 + (b.r5 - 0.5) * 0.2 - ck * 0.5;
      const knot = kd < 1 ? 1 - kd : 0;
      if (kd < 1.4) v -= sstep(1.4, 0.8, kd) * 0.25 + (fract(kd * 3) < 0.3 ? 0.08 : 0);
      v -= (1 - sstep(0, 3, e)) * 0.15;
      const k = lutIdx(v);
      const gw = weather[i] * 0.55 + b.r6 * 0.25;
      let cr = lerp(woodL[k], grey[0] * (0.7 + v * 0.5), gw);
      let cg = lerp(woodL[k + 1], grey[1] * (0.7 + v * 0.5), gw);
      let cb = lerp(woodL[k + 2], grey[2] * (0.7 + v * 0.5), gw);
      const cup = (QLY - 32) / 32;
      const z = 8 + sstep(0, 3.5, e) * 2.2 + fib[i] * 0.7 - line * 0.5 - ck * 2 - cup * cup * 0.8 + knot * 0.6 + fine[i] * 0.15;
      R[i] = lerp(0.06, cr, s);
      G[i] = lerp(0.05, cg, s);
      B[i] = lerp(0.04, cb, s);
      H[i] = lerp(2, z, s);
    }
  }
  // Nails: over each joist (every 128 px) and near the board ends.
  const nailC = C('#2c2826');
  const rust = C('#6a3a1c');
  const nail = (cx, cy) => {
    stamp(T, cx, cy, 8, 8, 0, null, (i, d) => {
      const st = clamp(1 - d) * 0.35;
      T.blend(i, rust, st);
    });
    const g = H[T.at(cx, cy)];
    stamp(T, cx, cy, 3.1, 3.1, 0, null, (i, d, u, v, a) => {
      const dome = Math.sqrt(Math.max(0, 1 - d * d));
      const k = 0.7 + dome * 0.6 + (hash1(i, 1808) - 0.5) * 0.2;
      T.blend3(i, nailC[0] * k + 0.04, nailC[1] * k + 0.03, nailC[2] * k + 0.02, a);
      H[i] = lerp(H[i], g + 0.6 + dome * 1.4, a);
    });
  };
  for (const row of L.rows) {
    for (const b of row.blocks) {
      for (let jx = 64; jx < 512; jx += 128) {
        let lx = jx - b.x0;
        lx = wrap(lx, 512);
        if (lx > 10 && lx < b.w - 10) {
          nail(jx + (r() - 0.5) * 3, b.y0 + 15 + (r() - 0.5) * 3);
          nail(jx + (r() - 0.5) * 3, b.y0 + 49 + (r() - 0.5) * 3);
        }
      }
      nail(b.x0 + 6, b.y0 + 16 + (r() - 0.5) * 3);
      nail(b.x0 + 6, b.y0 + 48 + (r() - 0.5) * 3);
      nail(b.x0 + b.w - 6, b.y0 + 16 + (r() - 0.5) * 3);
      nail(b.x0 + b.w - 6, b.y0 + 48 + (r() - 0.5) * 3);
    }
  }
  return finish(T, 1.0, [[2, 0.08, 0.035], [8, 0.03, 0.01]]);
}

function thatch() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const under = C('#1e170e');
  for (let i = 0; i < n; i++) {
    R[i] = under[0];
    G[i] = under[1];
    B[i] = under[2];
    H[i] = 0;
  }
  const r = rng(1901);
  const straw = ['#9a8350', '#b0945a', '#c4a464', '#8a7650', '#a89878', '#d0b070', '#7a6a48', '#bca070'].map(C);
  const sway = noise1(w, 8, 3, 1902);
  const c0 = [0, 0, 0];
  const c1 = [0, 0, 0];
  const cm = [0, 0, 0];
  for (let c = 0; c < 8; c++) {
    const y0 = c * 64;
    for (let k = 0; k < 1550; k++) {
      const x = r() * w;
      const ys = y0 + (r() - 0.35) * 14;
      const L = 56 + r() * 32;
      const a = Math.PI / 2 + (r() - 0.5) * 0.2 + sway[(x | 0) % w] * 0.25;
      const bend = (r() - 0.5) * 0.08;
      const rad = 0.7 + r() * 0.55;
      const col = straw[(r() * straw.length) | 0];
      const sh = 0.8 + r() * 0.35;
      for (let j = 0; j < 3; j++) {
        c0[j] = col[j] * sh * 0.5;
        cm[j] = col[j] * sh * 0.8;
        c1[j] = col[j] * sh * 1.05;
      }
      const z0 = 2 + r() * 1.5;
      const z1 = 13 + r() * 2;
      const mx = x + Math.cos(a) * L * 0.5;
      const my = ys + Math.sin(a) * L * 0.5;
      const tx = mx + Math.cos(a + bend) * L * 0.5;
      const ty = my + Math.sin(a + bend) * L * 0.5;
      seg(T, x, ys, mx, my, rad, rad, c0, cm, z0, (z0 + z1) / 2, rad * 0.6, 0.35, true);
      seg(T, mx, my, tx, ty, rad, rad * 0.9, cm, c1, (z0 + z1) / 2, z1, rad * 0.6, 0.35, true);
    }
  }
  // Weathering: mossy dark patches and sun-bleached grey.
  const mossN = fbm(w, h, 5, 5, 4, 1903);
  const bleach = fbm(w, h, 4, 4, 3, 1904);
  const fine = fbm(w, h, 96, 96, 1, 1905);
  const moss = C('#3e4226');
  const grey = C('#a49c8a');
  for (let i = 0; i < n; i++) {
    const m = sstep(0.15, 0.4, mossN[i] + fine[i] * 0.2) * 0.4;
    const g = sstep(0.05, 0.35, bleach[i]) * 0.35;
    const l = R[i] + G[i] + B[i];
    R[i] = lerp(lerp(R[i], moss[0] * l * 1.4, m), grey[0] * l * 0.6, g);
    G[i] = lerp(lerp(G[i], moss[1] * l * 1.4, m), grey[1] * l * 0.6, g);
    B[i] = lerp(lerp(B[i], moss[2] * l * 1.4, m), grey[2] * l * 0.6, g);
  }
  return finish(T, 1.0, [[2, 0.05, 0.02], [8, 0.03, 0.008]]);
}

function rooftile() {
  const T = new Tex(512, 512);
  const { w, h, R, G, B, H } = T;
  const COLS = 8;
  const ROWS = 6;
  const cw = w / COLS;
  const rh = h / ROWS;
  const r = rng(2001);
  const rowOff = [];
  for (let j = 0; j < ROWS; j++) rowOff.push((r() - 0.5) * 8);
  const tiles = [];
  for (let k = 0; k < COLS * ROWS; k++) tiles.push([r(), r(), r(), r(), r() * TAU]);
  const mott = fbm(w, h, 16, 16, 4, 2002);
  const fine = fbm(w, h, 128, 128, 1, 2003);
  const patina = fbm(w, h, 4, 4, 3, 2004);
  const lzone = fbm(w, h, 6, 6, 3, 2006);
  const LW = makeWorley(w, h, 56, 56, 2005, 1);
  const lich = worleyFill(LW);
  const pal = ['#b0583a', '#9a4a30', '#c06a42', '#8a3e2a', '#a85a3a', '#b86848'].map(C);
  const dark = C('#4a3a34');
  const lc1 = C('#b4a058');
  const lc2 = C('#909a80');
  for (let y = 0, i = 0; y < h; y++) {
    const j = Math.floor(y / rh);
    for (let x = 0; x < w; x++, i++) {
      const xx = wrap(x + 0.5 - rowOff[j], w);
      const ci = Math.floor(xx / cw);
      const u = (xx - ci * cw) / cw;
      const t = tiles[j * COLS + ci];
      // a slightly wavy lower lip per tile
      const lip = rh - 2 - Math.sin(u * Math.PI * 2 + t[4]) * 1.2;
      const ly = y + 0.5 - j * rh;
      const v = ly / lip;
      const cross = Math.pow(Math.sin(Math.PI * clamp(u * 1.06 - 0.03)), 0.55);
      let z = 2 + Math.min(v, 1) * 8 + cross * 9 + mott[i] * 0.6 + fine[i] * 0.2;
      if (ly > lip) z = 2 + (1 - (ly - lip) / 3) * 6 + cross * 3;
      z = lerp(z, 2 + cross * 3, sstep(0.95, 1.02, v));
      const c = pal[(t[0] * pal.length) | 0];
      let kk = (0.82 + t[1] * 0.3) * (0.85 + mott[i] * 0.35 + fine[i] * 0.12) * (0.5 + cross * 0.55);
      kk *= 0.5 + 0.5 * sstep(0, 0.22, v);
      let cr = c[0] * kk;
      let cg = c[1] * kk;
      let cb = c[2] * kk;
      const p = sstep(0.05, 0.35, patina[i] + (t[2] - 0.5) * 0.4) * 0.5;
      cr = lerp(cr, dark[0] * kk * 1.4, p);
      cg = lerp(cg, dark[1] * kk * 1.4, p);
      cb = lerp(cb, dark[2] * kk * 1.4, p);
      // lichen in clustered, ragged rosettes
      const lk = lich.id[i];
      const zone = sstep(0.05, 0.3, lzone[i]);
      if (zone > 0 && LW.RA[lk] < 0.35) {
        const rad = (1.5 + LW.RB[lk] * 4) * (0.8 + mott[i] * 0.6 + fine[i] * 0.5);
        if (lich.f1[i] < rad) {
          const lcol = LW.RC[lk] < 0.6 ? lc1 : lc2;
          const a = clamp(rad - lich.f1[i]) * 0.7 * zone;
          cr = lerp(cr, lcol[0] * (0.8 + fine[i]), a);
          cg = lerp(cg, lcol[1] * (0.8 + fine[i]), a);
          cb = lerp(cb, lcol[2] * (0.8 + fine[i]), a);
          z += a * 0.4;
        }
      }
      R[i] = cr;
      G[i] = cg;
      B[i] = cb;
      H[i] = z;
    }
  }
  return finish(T, 1.0, [[2, 0.07, 0.03], [8, 0.035, 0.01]]);
}

function canvasTex() {
  const T = new Tex(512, 512);
  const { w, h, R, G, B, H } = T;
  const STR = 12;
  const sw = w / STR;
  const fold = fbm(w, h, 4, 2, 3, 2101);
  const crease = fbm(w, h, 10, 3, 2, 2102);
  const fade = fbm(w, h, 3, 3, 4, 2103);
  const stain = norm(fbm(w, h, 6, 6, 4, 2104));
  const fine = fbm(w, h, 128, 128, 1, 2105);
  const r = rng(2106);
  const warpT = new Float32Array(128);
  const weftT = new Float32Array(128);
  for (let k = 0; k < 128; k++) {
    warpT[k] = (r() - 0.5) * 0.12;
    weftT[k] = (r() - 0.5) * 0.12;
  }
  const red = C('#9c3a30');
  const redF = C('#b87266');
  const cream = C('#d4c6a6');
  const creamF = C('#e0d8c6');
  const dirt = C('#5a4632');
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const px = x + 0.5;
      const sp = px / sw;
      const si = Math.floor(sp);
      const fr = sp - si;
      // soft one-pixel edge between stripes
      const edge = Math.min(fr, 1 - fr) * sw;
      const isRed = (si & 1) === 0;
      const mixE = edge < 1 ? 0.5 - edge * 0.5 : 0;
      const f = sstep(-0.1, 0.4, fade[i]) * 0.6;
      const ar = isRed ? lerp(red[0], redF[0], f) : lerp(cream[0], creamF[0], f);
      const ag = isRed ? lerp(red[1], redF[1], f) : lerp(cream[1], creamF[1], f);
      const ab = isRed ? lerp(red[2], redF[2], f) : lerp(cream[2], creamF[2], f);
      const br = !isRed ? lerp(red[0], redF[0], f) : lerp(cream[0], creamF[0], f);
      const bg = !isRed ? lerp(red[1], redF[1], f) : lerp(cream[1], creamF[1], f);
      const bb = !isRed ? lerp(red[2], redF[2], f) : lerp(cream[2], creamF[2], f);
      let cr = lerp(ar, br, mixE);
      let cg = lerp(ag, bg, mixE);
      let cb = lerp(ab, bb, mixE);
      // plain weave, four pixels per thread
      const ix = x >> 2;
      const iy = y >> 2;
      const fx = ((x & 3) + 0.5) / 4;
      const fy = ((y & 3) + 0.5) / 4;
      const over = (ix + iy) & 1;
      const prof = over ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy);
      const th = over ? warpT[ix] : weftT[iy];
      const k = (0.8 + prof * 0.25 + th) * (1 + fine[i] * 0.08);
      cr *= k;
      cg *= k;
      cb *= k;
      const st = sstep(0.68, 0.82, stain[i]) * 0.3;
      cr = lerp(cr, dirt[0], st);
      cg = lerp(cg, dirt[1], st);
      cb = lerp(cb, dirt[2], st);
      R[i] = cr;
      G[i] = cg;
      B[i] = cb;
      H[i] = fold[i] * 9 + crease[i] * 1.6 + prof * 0.7;
    }
  }
  return finish(T, 1.0, [[1, 0.06, 0.02], [10, 0.02, 0.008]]);
}

function marble() {
  const T = new Tex(512, 512);
  const { w, h, R, G, B, H } = T;
  const L = bondLayout(w, h, [128, 128, 128, 128], 2201, 190, 330);
  const V1 = veins(w, h, 2202, 3, 80, 1.2, 6);
  const v2 = veins(w, h, 2205, 7, 40, 0.7, 0);
  const cloud = fbm(w, h, 5, 5, 4, 2208);
  const fine = fbm(w, h, 128, 128, 1, 2209);
  const base = C('#e6e2da');
  const warm = C('#ddd2c0');
  const vd = C('#74727e');
  const vl = C('#a6a4ac');
  const stainC = C('#bca480');
  const joint = C('#b8b2a6');
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      bondAt(L, x + 0.5, y + 0.5);
      const b = QB;
      const e = rrect(BQ[2], BQ[3], 2) - 1.1;
      const s = sstep(-0.5, 0.5, e);
      const j = ((y + ((b.r2 * 512) | 0)) & 511) * 512 + ((x + ((b.r1 * 512) | 0)) & 511);
      const a = V1.line[j];
      const hb = V1.halo[j];
      const c2 = v2[j];
      const cl = cloud[j];
      const tw = b.r3 * 0.5 + cl * 0.4;
      const kk = 0.97 + cl * 0.08 + fine[i] * 0.02 - hb * 0.13;
      let cr = lerp(base[0], warm[0], tw) * kk;
      let cg = lerp(base[1], warm[1], tw) * kk;
      let cb = lerp(base[2], warm[2], tw) * kk;
      cr = lerp(cr, stainC[0], hb * 0.22 * b.r4);
      cg = lerp(cg, stainC[1], hb * 0.22 * b.r4);
      cb = lerp(cb, stainC[2], hb * 0.22 * b.r4);
      cr = lerp(cr, vl[0], c2 * 0.55);
      cg = lerp(cg, vl[1], c2 * 0.55);
      cb = lerp(cb, vl[2], c2 * 0.55);
      cr = lerp(cr, vd[0], a * 0.65);
      cg = lerp(cg, vd[1], a * 0.65);
      cb = lerp(cb, vd[2], a * 0.65);
      R[i] = lerp(joint[0], cr, s);
      G[i] = lerp(joint[1], cg, s);
      B[i] = lerp(joint[2], cb, s);
      H[i] = lerp(4, 7 + sstep(0, 2.5, e) * 1.2 + cl * 0.2 - a * 0.1, s);
    }
  }
  return finish(T, 1.0, [[1, 0.08, 0.02], [6, 0.02, 0.005]]);
}

/* ================================================================ water, gold */

function water() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const r = rng(2301);
  const sum = f32(n);
  const Sx = new Float32Array(w);
  const Cx = new Float32Array(w);
  const Sy = new Float32Array(h);
  const Cy = new Float32Array(h);
  // Wind ripples: a spread of travelling waves, all with whole numbers of
  // cycles across the tile so they wrap, longer ones stronger.
  for (let k = 0; k < 22; k++) {
    const ang = 0.6 + (r() - 0.5) * 2.4;
    const f = 4 + Math.pow(r(), 1.4) * 52;
    const kx = Math.round(Math.cos(ang) * f);
    const ky = Math.round(Math.sin(ang) * f);
    if (kx === 0 && ky === 0) continue;
    const amp = 1 / Math.pow(Math.hypot(kx, ky), 0.8);
    const ph = r() * TAU;
    for (let x = 0; x < w; x++) {
      Sx[x] = Math.sin((TAU * kx * x) / w + ph);
      Cx[x] = Math.cos((TAU * kx * x) / w + ph);
    }
    for (let y = 0; y < h; y++) {
      Sy[y] = Math.sin((TAU * ky * y) / h);
      Cy[y] = Math.cos((TAU * ky * y) / h);
    }
    for (let y = 0, i = 0; y < h; y++) {
      const sy = Sy[y];
      const cy = Cy[y];
      for (let x = 0; x < w; x++, i++) sum[i] += amp * (Sx[x] * cy + Cx[x] * sy);
    }
  }
  const chop = fbm(w, h, 24, 24, 3, 2302);
  const swell = fbm(w, h, 3, 3, 3, 2304);
  const refl = fbm(w, h, 2, 5, 3, 2303);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    // ripples gather in patches (cat's-paws) where the wind touches down
    const v = sum[i] * (0.55 + sstep(-0.3, 0.3, swell[i]) * 0.65) + chop[i] * 0.35;
    sum[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const deep = C('#0a1f22');
  const mid = C('#10292b');
  const crest = C('#1d4444');
  const sky = C('#2f5c5c');
  for (let i = 0; i < n; i++) {
    const t = (sum[i] - lo) / (hi - lo);
    const c = t * t * (3 - 2 * t);
    let cr = lerp(deep[0], mid[0], c);
    let cg = lerp(deep[1], mid[1], c);
    let cb = lerp(deep[2], mid[2], c);
    const cs = sstep(0.55, 1, t) * 0.25;
    cr = lerp(cr, crest[0], cs);
    cg = lerp(cg, crest[1], cs);
    cb = lerp(cb, crest[2], cs);
    const rf = sstep(0, 0.45, refl[i]) * 0.22;
    R[i] = lerp(cr, sky[0], rf);
    G[i] = lerp(cg, sky[1], rf);
    B[i] = lerp(cb, sky[2], rf);
    H[i] = c * 6;
  }
  return finish(T, 1.6, []);
}

function gold() {
  const T = new Tex(512, 512);
  const { w, h, n, R, G, B, H } = T;
  const L = bondLayout(w, h, [43, 43, 42, 43, 43, 42, 43, 43, 42, 43, 43, 42], 2401, 36, 50);
  const ham = worleyFill(makeWorley(w, h, 30, 30, 2402, 0.9));
  const brush = fbm(w, h, 2, 96, 2, 2403);
  const tone = fbm(w, h, 3, 3, 4, 2404);
  const wear = norm(fbm(w, h, 5, 5, 5, 2405));
  const fine = fbm(w, h, 128, 128, 1, 2406);
  const wob = fbm(w, h, 24, 24, 2, 2407);
  const goldL = ramp([[0, '#5e3e14'], [0.3, '#9a7028'], [0.55, '#c49640'], [0.8, '#e0b862'], [1, '#f2d690']]);
  const bronze = C('#7a5426');
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      bondAt(L, x + 0.5 + wob[i] * 2, y + 0.5 + wob[(i + 4099) & (n - 1)] * 2);
      const b = QB;
      // each leaf overlaps its neighbours along its top and left edges
      const lap = Math.min(BQ[0], BQ[1]);
      const seam = Math.exp(-lap * lap * 0.9);
      const dimple = clamp(ham.f1[i] / 11);
      const dd = dimple * dimple;
      const shadow = Math.exp(-((BQ[0] - b.w) ** 2) * 0.5) + Math.exp(-((BQ[1] - b.h) ** 2) * 0.5);
      let v = 0.64 + tone[i] * 0.22 + brush[i] * 0.08 + (b.r1 - 0.5) * 0.1 - dd * 0.05 + fine[i] * 0.03 + seam * 0.05 - shadow * 0.06;
      const wr = sstep(0.86, 0.97, wear[i] + fine[i] * 0.05) * 0.3;
      v -= wr * 0.15;
      const k = lutIdx(v);
      R[i] = lerp(goldL[k], bronze[0], wr);
      G[i] = lerp(goldL[k + 1], bronze[1], wr);
      B[i] = lerp(goldL[k + 2], bronze[2], wr);
      H[i] = tone[i] * 1.5 - dd * 1.1 + brush[i] * 0.2 + seam * 0.45 - wr * 0.4;
    }
  }
  return finish(T, 1.0, [[2, 0.05, 0.02], [10, 0.025, 0.008]]);
}

/* ================================================================ door */

function door() {
  const W = 512;
  const HH = 768;
  const T = new Tex(W, HH, false);
  const { R, G, B, H } = T;
  const CX = 256;
  const SPRING = 330;
  const RIN = 150;
  const ROUT = 226;
  const X0 = CX - RIN;
  const X1 = CX + RIN;
  const r = rng(2501);
  const wall = bondLayout(W, HH, rowHeights(HH, [44, 48, 52], r), 2502, 60, 130);
  const face = fbm(W, HH, 8, 12, 4, 2503);
  const fine = fbm(W, HH, 128, 192, 1, 2504);
  const chip = fbm(W, HH, 32, 48, 3, 2505);
  const grainW = fbm(W, HH, 64, 4, 3, 2506);
  const grainR = fbm(W, HH, 12, 3, 3, 2507);
  const weather = fbm(W, HH, 4, 6, 3, 2508);
  const streak = fbm(W, HH, 40, 3, 3, 2509);
  const stPal = ['#8a8274', '#9a9080', '#7c766c', '#a09684', '#8e8576'].map(C);
  const surPal = ['#a49478', '#9a8a70', '#ae9e82', '#94866c'].map(C);
  const mortar = C('#6a6458');
  const oak = ramp([[0, '#1e130b'], [0.3, '#34210f'], [0.55, '#4a311c'], [0.8, '#5e4228'], [1, '#745436']]);
  const NV = 11;
  const PLANKS = 5;
  const pw = (X1 - X0) / PLANKS;
  const prand = [];
  for (let k = 0; k < PLANKS; k++) prand.push([r(), r(), r()]);
  const vrand = [];
  for (let k = 0; k <= NV; k++) vrand.push([r(), r(), r()]);
  const jrand = [];
  for (let k = 0; k < 12; k++) jrand.push([r(), r(), r()]);
  for (let y = 0, i = 0; y < HH; y++) {
    for (let x = 0; x < W; x++, i++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dx = px - CX;
      const dy = py - SPRING;
      const rr = Math.sqrt(dx * dx + dy * dy);
      // signed distance into the opening (positive inside)
      const dOpen = dy >= 0 ? Math.min(px - X0, X1 - px) : RIN - rr;
      if (dOpen > -0.5) {
        // ---- the door: vertical oak planks
        const pi = clamp(Math.floor((px - X0) / pw), 0, PLANKS - 1);
        const lx = px - X0 - pi * pw;
        const pe = Math.min(lx, pw - lx) - 1.1;
        const pr = prand[pi];
        const ring = fract((lx - pw / 2) * (0.16 + pr[0] * 0.08) + grainR[i] * 3 + pr[1] * 5);
        const line = sstep(0.72, 0.92, ring);
        let v = 0.5 + grainW[i] * 0.7 - line * 0.2 + fine[i] * 0.08 + (pr[2] - 0.5) * 0.16;
        v -= sstep(560, 768, py) * 0.12 * (1 + weather[i]);
        v -= (1 - sstep(0, 3, pe)) * 0.25;
        const k = lutIdx(v);
        const s = sstep(-0.5, 0.5, pe);
        R[i] = lerp(0.04, oak[k], s);
        G[i] = lerp(0.03, oak[k + 1], s);
        B[i] = lerp(0.02, oak[k + 2], s);
        H[i] = lerp(2, 6 + sstep(0, 3, pe) * 1.5 + grainW[i] * 0.6 - line * 0.4, s);
        // shadow of the reveal around the door edge
        const rv = sstep(14, 0, dOpen);
        T.mul(i, 1 - rv * 0.55);
        if (dOpen < 0.5) {
          const a = clamp(dOpen + 0.5);
          T.mul(i, a);
        }
        if (dOpen > 0.5) continue;
      }
      // ---- masonry: voussoirs, jambs or the wall behind
      let e = 0;
      let found = false;
      let pal = stPal;
      let rn0 = 0;
      let rn1 = 0;
      let rn2 = 0;
      let zBase;
      if (dy < 0 && rr < ROUT + (Math.abs(dx) < 22 ? 18 : 0) && rr >= RIN - 1) {
        const phi = Math.atan2(-dy, dx);
        const wedge = Math.PI / NV;
        const kv = clamp(Math.floor(phi / wedge), 0, NV - 1);
        const a0 = kv * wedge;
        const outer = ROUT + (kv === (NV >> 1) ? 18 : 0);
        const da = Math.min(phi - a0, a0 + wedge - phi) * rr;
        e = Math.min(da, rr - RIN, outer - rr);
        found = true;
        pal = surPal;
        rn0 = vrand[kv][0];
        rn1 = vrand[kv][1];
        rn2 = vrand[kv][2];
        zBase = 22;
      } else if (dy >= 0 && ((px >= X0 - 100 && px < X0) || (px >= X1 && px < X1 + 100))) {
        const course = Math.floor(dy / 62);
        const jw = course & 1 ? 66 : 96;
        const ex = px < X0 ? X0 - px : px - X1;
        if (ex < jw) {
          const ly = dy - course * 62;
          e = Math.min(ly, 62 - ly, jw - ex, ex);
          found = true;
          pal = surPal;
          const jr = jrand[(course * 2 + (px < X0 ? 0 : 1)) % 12];
          rn0 = jr[0];
          rn1 = jr[1];
          rn2 = jr[2];
          zBase = 22;
        }
      }
      if (!found) {
        bondAt(wall, px, py);
        const QDX = BQ[2];
        const QDY = BQ[3];
        e = rrect(QDX, QDY, 3);
        pal = stPal;
        rn0 = QB.r1;
        rn1 = QB.r2;
        rn2 = QB.r3;
        zBase = 14;
      }
      e -= 1.5 + Math.max(0, chip[i]) * 2.5;
      const s = sstep(-0.5, 0.5, e);
      const bev = sstep(0, 6, e);
      const c = pal[(rn0 * pal.length) | 0];
      let kk = (0.86 + rn1 * 0.24) * (0.86 + face[i] * 0.3 + fine[i] * 0.1) + (hash1(i, 2510) - 0.5) * 0.06;
      kk *= 1 - Math.max(0, streak[i]) * 0.3;
      const mk = 0.8 + fine[i] * 0.3;
      const sr = lerp(mortar[0] * mk, c[0] * kk, s);
      const sg = lerp(mortar[1] * mk, c[1] * kk, s);
      const sb = lerp(mortar[2] * mk, c[2] * kk, s);
      const zs = lerp(zBase - 8, zBase + bev * 3 + face[i] * 2 + (rn2 - 0.5) * 2, s);
      if (dOpen > -0.5) {
        const a = clamp(0.5 - dOpen);
        R[i] = lerp(R[i], sr, a);
        G[i] = lerp(G[i], sg, a);
        B[i] = lerp(B[i], sb, a);
        H[i] = lerp(H[i], zs, a);
      } else {
        R[i] = sr;
        G[i] = sg;
        B[i] = sb;
        H[i] = zs;
      }
    }
  }
  // ---- ironwork
  const iron = C('#26262a');
  const ironHi = C('#4a4a50');
  const rust = C('#6a3a1e');
  const rustN = fbm(W, HH, 16, 24, 2, 2511);
  const ham = worleyFill(makeWorley(W, HH, 64, 96, 2512, 0.9));
  const ironPx = (i, z, a, hiK) => {
    const rs = sstep(0.12, 0.3, rustN[i] + fine[i] * 0.2) * 0.75;
    const dim = clamp(ham.f1[i] / 5) * 0.12;
    const k = 0.85 + dim + (hash1(i, 2513) - 0.5) * 0.1;
    const cr = lerp(lerp(iron[0], ironHi[0], hiK), rust[0], rs) * k;
    const cg = lerp(lerp(iron[1], ironHi[1], hiK), rust[1], rs) * k;
    const cb = lerp(lerp(iron[2], ironHi[2], hiK), rust[2], rs) * k;
    T.blend3(i, cr, cg, cb, a);
    H[i] = lerp(H[i], z - dim * 3, a);
  };
  const stud = (cx, cy, rad) => {
    stamp(T, cx, cy, rad + 3, rad + 3, 0, null, (i, d) => T.mul(i, 1 - clamp(1 - d) * 0.25));
    stamp(T, cx, cy, rad, rad, 0, null, (i, d, u, v, a) => {
      const dome = Math.sqrt(Math.max(0, 1 - d * d));
      ironPx(i, 12 + dome * rad * 0.9, a, dome * 0.6 + clamp(-u - v) * 0.3);
    });
  };
  const straps = [292, 455, 640];
  for (const sy of straps) {
    const half = 13;
    const xa = X0 - 6;
    const xe = 372;
    const yTop = sy - half;
    // rust weeping down the planks below each strap
    for (let y = sy + half; y < sy + 60; y++) {
      for (let x = xa; x < xe; x++) {
        const i = T.at(x, y);
        const k = Math.max(0, streak[i] + 0.1) * (1 - (y - sy - half) / 60) * 0.6;
        T.blend(i, rust, k * 0.5);
      }
    }
    for (let y = yTop - 16; y < sy + half + 16; y++) {
      for (let x = xa; x < xe + 40; x++) {
        if (x < 0 || x >= W) continue;
        const px = x + 0.5;
        const py = y + 0.5;
        // strap body then a tapering spear tip with a round boss before it
        let half2 = half;
        if (px > xe - 30) half2 = half + 4 * Math.sin(clamp((px - (xe - 30)) / 30) * Math.PI);
        if (px > xe) half2 = (half + 2) * (1 - (px - xe) / 38);
        const ey = half2 - Math.abs(py - sy);
        const ex = Math.min(px - xa, xe + 38 - px);
        const e = Math.min(ey, ex);
        if (e < -0.5 || half2 <= 0) continue;
        const i = y * W + x;
        const a = clamp(e + 0.5);
        const bev = sstep(0, 4, e);
        const hiK = py < sy ? (1 - bev) * 0.8 : 0;
        ironPx(i, 10 + bev * 2.5, a, hiK);
      }
    }
    for (let x = xa + 22; x < xe - 10; x += 38) {
      stud(x, sy - 6, 3.6);
      stud(x + 19, sy + 6, 3.6);
    }
    stud(xe - 15, sy, 6.5);
    // pintle on the jamb
    for (let y = sy - 10; y < sy + 10; y++) {
      for (let x = X0 - 22; x < X0 - 4; x++) {
        const i = y * W + x;
        const e = Math.min(y + 0.5 - (sy - 10), sy + 10 - y - 0.5, x + 0.5 - (X0 - 22), X0 - 4 - x - 0.5);
        ironPx(i, 26 + sstep(0, 4, e) * 2, clamp(e + 0.5), e < 2 ? 0.6 : 0);
      }
    }
  }
  // studs around the inside of the arch and along the jambs
  for (let a = 0.12; a < Math.PI - 0.1; a += 0.21) stud(CX + Math.cos(a) * (RIN - 13), SPRING - Math.sin(a) * (RIN - 13), 4.2);
  for (let y = SPRING + 30; y < 760; y += 38) {
    stud(X0 + 13, y, 4.2);
    stud(X1 - 13, y, 4.2);
  }
  // ring handle on a scalloped boss, and a keyhole plate
  const RX = 336;
  const RY = 548;
  stamp(T, RX, RY, 25, 25, 0, null, (i, d, u, v) => {
    const th = Math.atan2(v, u);
    const rr2 = 20 + 3 * Math.cos(th * 8);
    const dd = d * 25;
    if (dd > rr2 + 0.5) return;
    const a = clamp(rr2 - dd + 0.5);
    const dome = clamp(1 - dd / rr2);
    ironPx(i, 11 + Math.sqrt(dome) * 3, a, clamp(-u - v) * 0.4);
  });
  stud(RX, RY, 6);
  stamp(T, RX, RY + 34, 36, 36, 0, null, (i, d, u, v) => {
    const dd = d * 36;
    const tr = Math.abs(dd - 29);
    if (tr > 6.5) {
      if (tr < 9 && v > 0) T.mul(i, 0.8);
      return;
    }
    const a = clamp(6.5 - tr);
    const prof = Math.sqrt(Math.max(0, 1 - (tr / 6) ** 2));
    ironPx(i, 16 + prof * 5, a, prof * 0.4 + clamp(-v) * 0.3);
  });
  for (let y = 676; y < 724; y++) {
    for (let x = RX - 13; x < RX + 13; x++) {
      const i = y * W + x;
      const e = Math.min(y + 0.5 - 676, 724 - y - 0.5, x + 0.5 - (RX - 13), RX + 13 - x - 0.5);
      ironPx(i, 10 + sstep(0, 3, e) * 1.5, clamp(e + 0.5), e < 2 ? 0.5 : 0);
      const kd = Math.sqrt((x + 0.5 - RX) ** 2 + (y + 0.5 - 692) ** 2);
      const slot = Math.abs(x + 0.5 - RX) < 2 && y > 692 && y < 712;
      if (kd < 4.5 || slot) {
        T.blend3(i, 0.02, 0.02, 0.02, 0.95);
        H[i] = 6;
      }
    }
  }
  stud(RX, 682, 2.5);
  stud(RX, 718, 2.5);
  return finish(T, 1.0, [[2, 0.07, 0.03], [10, 0.03, 0.01]]);
}

/* ================================================================ rune band */

function runeband() {
  const W = 1024;
  const HH = 256;
  const T = new Tex(W, HH);
  const { n, R, G, B, H } = T;
  const E = T.em();
  const smk = fbm(W, HH, 8, 2, 5, 2601);
  const fine = fbm(W, HH, 256, 64, 1, 2602);
  const goldN = fbm(W, HH, 64, 16, 2, 2603);
  const stone = ramp([[0, '#08070b'], [0.5, '#121017'], [0.8, '#1c1924'], [1, '#2a2634']]);
  const gold = C('#c89a3a');
  const goldHi = C('#f0cc72');
  const MG = f32(n);
  const GG = f32(n);
  const MV = f32(n);
  const GV = f32(n);
  const N = 12;
  const sp = W / N;
  const order = [0, 6, 3, 9, 13, 2, 10, 5, 14, 7, 11, 15];
  for (let k = 0; k < N; k++) {
    const cx = (k + 0.5) * sp;
    const isGold = (k & 1) === 0;
    const M = isGold ? MG : MV;
    const Gl = isGold ? GG : GV;
    runeStrokes(T, M, Gl, order[k], cx - 26, 64, 13, 16, 3.4, 7);
    // separator: a small violet lozenge
    const sx = k * sp;
    glowLine(T, MV, GV, sx, 118, sx + 6, 128, 1.6, 4);
    glowLine(T, MV, GV, sx + 6, 128, sx, 138, 1.6, 4);
    glowLine(T, MV, GV, sx, 138, sx - 6, 128, 1.6, 4);
    glowLine(T, MV, GV, sx - 6, 128, sx, 118, 1.6, 4);
  }
  const gC = C('#ffd27a');
  const gE = C('#ff9a2a');
  const vC = C('#cfa6ff');
  const vE = C('#8a44ff');
  for (let y = 0, i = 0; y < HH; y++) {
    const py = y + 0.5;
    // mouldings: rounded edges top and bottom, gold fillets inside them
    const dEdge = Math.min(py, HH - py);
    const mould = sstep(0, 14, dEdge);
    const fil = Math.min(Math.abs(py - 26), Math.abs(py - (HH - 26)));
    const gf = sstep(5.2, 4.2, fil);
    const bead = Math.min(Math.abs(py - 40), Math.abs(py - (HH - 40)));
    for (let x = 0; x < W; x++, i++) {
      const jx = Math.abs(fract((x + 0.5) / 256 + 0.5) - 0.5) * 256;
      const joint = sstep(1.6, 0.6, jx) * (dEdge > 30 ? 1 : 0);
      let tone = 0.45 + smk[i] * 0.6 + fine[i] * 0.05 + (1 - mould) * 0.3;
      const k = lutIdx(tone);
      let cr = stone[k];
      let cg = stone[k + 1];
      let cb = stone[k + 2];
      let z = 6 + mould * 5 + smk[i] * 0.3 - joint * 2;
      cr *= 1 - joint * 0.6;
      cg *= 1 - joint * 0.6;
      cb *= 1 - joint * 0.6;
      // gold fillet with notched beading
      const notch = Math.abs(fract((x + 0.5) / 16) - 0.5) < 0.08 ? 1 : 0;
      const gt = (0.75 + goldN[i] * 0.6) * (1 - notch * 0.45);
      const gpr = Math.sqrt(Math.max(0, 1 - (fil / 5) ** 2));
      cr = lerp(cr, lerp(gold[0], goldHi[0], gpr) * gt, gf);
      cg = lerp(cg, lerp(gold[1], goldHi[1], gpr) * gt, gf);
      cb = lerp(cb, lerp(gold[2], goldHi[2], gpr) * gt, gf);
      z += gf * (2 + gpr * 1.5 - notch);
      // a thin incised line inside each fillet
      const inc = sstep(1.3, 0.4, bead);
      cr *= 1 - inc * 0.5;
      cg *= 1 - inc * 0.5;
      cb *= 1 - inc * 0.5;
      z -= inc;
      const mg = MG[i];
      const mv = MV[i];
      const m = Math.max(mg, mv);
      cr = lerp(cr, mg >= mv ? gC[0] : vC[0], m * 0.92) + GG[i] * 0.05 + GV[i] * 0.04;
      cg = lerp(cg, mg >= mv ? gC[1] : vC[1], m * 0.92) + GG[i] * 0.03 + GV[i] * 0.02;
      cb = lerp(cb, mg >= mv ? gC[2] : vC[2], m * 0.92) + GV[i] * 0.07;
      z -= m * 2.5;
      R[i] = cr;
      G[i] = cg;
      B[i] = cb;
      H[i] = z;
      const ig = mg + GG[i] * 0.4;
      const iv = mv + GV[i] * 0.4;
      E[0][i] = clamp(gE[0] * ig * 0.9 + vE[0] * iv + (mg * mg + mv * mv) * 0.2);
      E[1][i] = clamp(gE[1] * ig * 0.8 + vE[1] * iv + mg * mg * 0.1 + mv * mv * 0.2);
      E[2][i] = clamp(gE[2] * ig + vE[2] * iv + (mg * mg * 0.04 + mv * mv) * 0.25);
    }
  }
  return finish(T, 1.0, [[2, 0.07, 0.03], [8, 0.02, 0.01]]);
}

/* ================================================================ API */

const MAKERS = {
  heath, marsh, volcanic, snow, forest, desert, ash, road, cobble, stonewall, barrowwall, barrowfloor,
  barrowceil, obsidian, spirewall, spirefloor, wood, thatch, rooftile, canvas: canvasTex, marble,
  grassmound, water, gold, door, runeband,
};

const CACHE = new Map();

export function makeHD(name) {
  const hit = CACHE.get(name);
  if (hit) return hit;
  const make = MAKERS[name];
  if (!make) throw new Error(`makeHD: unknown texture '${name}'`);
  arenaReset();
  const out = make();
  const [w, h] = HD_SPECS[name].size;
  if (out.map.width !== w || out.map.height !== h) throw new Error(`makeHD: ${name} is ${out.map.width}x${out.map.height}`);
  CACHE.set(name, out);
  return out;
}

/* ================================================================ backdrop */

let BACKDROP = null;

// 2D value noise over a 256 x 256 table that wraps.
function vnoise(tab, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = xi & 255;
  const x1 = (xi + 1) & 255;
  const y0 = (yi & 255) << 8;
  const y1 = ((yi + 1) & 255) << 8;
  const a = tab[y0 + x0];
  const b = tab[y0 + x1];
  const c = tab[y1 + x0];
  const d = tab[y1 + x1];
  return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
}

const COS_N = 2048;
const COS_LO = -6;
const COS_K = COS_N / 14;
const COS = new Float32Array(COS_N + 1);
for (let k = 0; k <= COS_N; k++) COS[k] = Math.cos(COS_LO + k / COS_K);

// Shade one column of one range, front to back under what is already there.
function bdColumn(S, x) {
  const { W, HH, peaks, solid, ce, cp, tab, BUF, Rg } = S;
  let m = 0;
  const px = x + 0.5;
  const bg = 1 - Math.abs(S.big[x]) * 2.2;
  const jg = -bg * Rg.big + S.jag[x] * Rg.jag + S.fineJ[x] * Rg.jag * 0.35;
  const sol = solid[x];
  for (let k = 0; k < peaks.length; k++) {
    const p = peaks[k];
    let dx = px - p.x;
    dx -= Math.round(dx / W) * W;
    const ax = dx < 0 ? -dx : dx;
    // steep near the summit, flaring onto broad shoulders
    const e = p.y + (dx < 0 ? p.sl : p.sr) * (ax * 0.75 + 70 * (1 - Math.exp(-ax / 70))) + jg * Math.min(1, ax / 70);
    if (e >= sol) continue;
    let j = m++;
    while (j > 0 && ce[j - 1] > e) {
      ce[j] = ce[j - 1];
      cp[j] = cp[j - 1];
      j--;
    }
    ce[j] = e;
    cp[j] = k;
  }
  if (m === 0) return;
  const top = ce[0];
  const yTop = Math.max(0, Math.floor(top));
  const yMin = Rg.top[0];
  const ySpan = Rg.base - Rg.top[0];
  const haze = Rg.haze;
  const mist = Rg.mist;
  const sh = Rg.shadow;
  const rk = Rg.rock;
  const lt = Rg.lit;
  const ss = Rg.snowSh;
  const sl0 = Rg.snowLit;
  const hz = Rg.hazeCol;
  const ms = Rg.mistCol;
  const rm = Rg.rim;
  let ci = 0;
  let p = peaks[cp[0]];
  let pi = -1;
  let frontE = 0;
  let dxc = 0;
  let py0 = 0;
  let pox = 0;
  let poy = 0;
  let pk = 0;
  let psnow = 0;
  let psl = 0;
  let psr = 0;
  let sp = p.sp;
  const crx = px * 0.0625;
  for (let y = yTop; y < sol; y++) {
    while (ci < m && ce[ci] <= y + 1) {
      const q = peaks[cp[ci]];
      if (pi < 0 || q.y > py0) {
        p = q;
        pi = cp[ci];
        frontE = ce[ci];
        py0 = q.y;
        pox = q.ox;
        poy = q.oy;
        pk = q.ribK;
        psnow = q.snow;
        psl = q.sl;
        psr = q.sr;
        sp = q.sp;
        dxc = px - q.x;
        dxc -= Math.round(dxc / W) * W;
      }
      ci++;
    }
    const py = y + 0.5;
    const dy = py - py0 > 0.5 ? py - py0 : 0.5;
    const sx = dxc - sp[dy | 0];
    const slope = sx < 0 ? psl : psr;
    let q = (sx * slope * 1.1) / (dy + 2);
    q = q < -1 ? -1 : q > 1 ? 1 : q;
    // ribs fan out down the fall line from the summit
    // (value noise written out inline: four lookups per pixel)
    let rib;
    {
      const nx = q * pk + pox;
      const ny = Math.sqrt(dy) * 0.32 + poy;
      const xi = Math.floor(nx);
      const yi = Math.floor(ny);
      let fx = nx - xi;
      let fy = ny - yi;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const r0 = (yi & 255) << 8;
      const r1 = ((yi + 1) & 255) << 8;
      const a0 = tab[r0 + (xi & 255)];
      const b0 = tab[r0 + ((xi + 1) & 255)];
      const c0 = tab[r1 + (xi & 255)];
      const d0 = tab[r1 + ((xi + 1) & 255)];
      rib = a0 + (b0 - a0) * fx + (c0 - a0 + (d0 - c0 - b0 + a0) * fx) * fy;
    }
    let rib2;
    {
      const nx = q * pk * 3.2 + pox + 50;
      const ny = dy * 0.014 + poy;
      const xi = Math.floor(nx);
      const yi = Math.floor(ny);
      let fx = nx - xi;
      let fy = ny - yi;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const r0 = (yi & 255) << 8;
      const r1 = ((yi + 1) & 255) << 8;
      const a0 = tab[r0 + (xi & 255)];
      const b0 = tab[r0 + ((xi + 1) & 255)];
      const c0 = tab[r1 + (xi & 255)];
      const d0 = tab[r1 + ((xi + 1) & 255)];
      rib2 = a0 + (b0 - a0) * fx + (c0 - a0 + (d0 - c0 - b0 + a0) * fx) * fy;
    }
    let crag;
    {
      const nx = crx;
      const ny = py * 0.0625 + poy;
      const xi = Math.floor(nx);
      const yi = Math.floor(ny);
      let fx = nx - xi;
      let fy = ny - yi;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const r0 = (yi & 255) << 8;
      const r1 = ((yi + 1) & 255) << 8;
      const a0 = tab[r0 + (xi & 255)];
      const b0 = tab[r0 + ((xi + 1) & 255)];
      const c0 = tab[r1 + (xi & 255)];
      const d0 = tab[r1 + ((xi + 1) & 255)];
      crag = a0 + (b0 - a0) * fx + (c0 - a0 + (d0 - c0 - b0 + a0) * fx) * fy;
    }
    let grit;
    {
      const nx = crx * 4 + 17;
      const ny = py * 0.25 + poy * 3;
      const xi = Math.floor(nx);
      const yi = Math.floor(ny);
      let fx = nx - xi;
      let fy = ny - yi;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const r0 = (yi & 255) << 8;
      const r1 = ((yi + 1) & 255) << 8;
      const a0 = tab[r0 + (xi & 255)];
      const b0 = tab[r0 + ((xi + 1) & 255)];
      const c0 = tab[r1 + (xi & 255)];
      const d0 = tab[r1 + ((xi + 1) & 255)];
      grit = a0 + (b0 - a0) * fx + (c0 - a0 + (d0 - c0 - b0 + a0) * fx) * fy;
    }
    // facing angle across the cone, bent by the ribs; the sun is low on the left
    const th = q * (1.1 + 0.5 * q * q) + (rib - 0.5) * 1.25 + (rib2 - 0.5) * 0.75 + (crag - 0.5) * 0.4 + (grit - 0.5) * 0.35;
    let cf = (th + 1.318 - COS_LO) * COS_K;
    cf = cf < 0 ? 0 : cf > COS_N - 1 ? COS_N - 1 : cf;
    const ck = cf | 0;
    let lit = 0.878 * (COS[ck] + (COS[ck + 1] - COS[ck]) * (cf - ck)) + 0.1;
    lit = lit < 0 ? 0 : lit > 1 ? 1 : lit;
    // faceted: faces snap toward lit or shadowed with crisp edges
    let fs = (lit - 0.2) * 4;
    fs = fs < 0 ? 0 : fs > 1 ? 1 : fs;
    lit = lit * 0.45 + fs * fs * (3 - 2 * fs) * 0.55;
    const l2 = lit * lit;
    const lm = lit * 1.7 > 1 ? 1 : lit * 1.7;
    const kr = 0.78 + crag * 0.3 + grit * 0.16;
    let cr = (sh[0] + (rk[0] + (lt[0] - rk[0]) * l2 - sh[0]) * lm) * kr;
    let cg = (sh[1] + (rk[1] + (lt[1] - rk[1]) * l2 - sh[1]) * lm) * kr;
    let cb = (sh[2] + (rk[2] + (lt[2] - rk[2]) * l2 - sh[2]) * lm) * kr;
    // a snow cap that reaches down the gullies in long tongues
    const sline = psnow * (0.55 + rib2 * 1.1 + (rib - 0.5) * 0.5) + (grit - 0.5) * 6;
    let snow = (sline + 5 - dy) / 10;
    snow = snow < 0 ? 0 : snow > 1 ? 1 : snow;
    snow *= snow * (3 - 2 * snow);
    if (snow > 0) {
      const sk = 0.88 + crag * 0.16 + grit * 0.08;
      cr += ((ss[0] + (sl0[0] - ss[0]) * lit) * sk - cr) * snow;
      cg += ((ss[1] + (sl0[1] - ss[1]) * lit) * sk - cg) * snow;
      cb += ((ss[2] + (sl0[2] - ss[2]) * lit) * sk - cb) * snow;
    }
    // warm rim light along left-facing ridges
    const de = py - frontE;
    if (de < 7 && sx < 0) {
      let rr = (1 - de / 7) * 0.6 * (-q * 3 > 1 ? 1 : -q * 3);
      if (rr < 0) rr = 0;
      cr += (rm[0] - cr) * rr;
      cg += (rm[1] - cg) * rr;
      cb += (rm[2] - cb) * rr;
    }
    // haze, thickening into valley mist toward the foot of the range
    let t = (py - yMin) / ySpan;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const mt = mist * t * t;
    cr += (hz[0] - cr) * haze;
    cg += (hz[1] - cg) * haze;
    cb += (hz[2] - cb) * haze;
    cr += (ms[0] - cr) * mt;
    cg += (ms[1] - cg) * mt;
    cb += (ms[2] - cb) * mt;
    let cov = y === yTop ? y + 1 - top : 1;
    cov = cov < 0 ? 0 : cov > 1 ? 1 : cov;
    // column-major RGBA, so walking down a column stays in cache
    const o = (x * HH + y) * 4;
    const al = cov * (1 - BUF[o + 3]);
    BUF[o] += cr * al;
    BUF[o + 1] += cg * al;
    BUF[o + 2] += cb * al;
    BUF[o + 3] += al;
  }
  solid[x] = Math.min(sol, yTop + 1);
}

// A 4096 x 768 mountain panorama for the horizon ring: three ranges, far to
// near, each a crowd of peaks with steep summits on broad shoulders. Faces
// are shaded from a low sun on the left and carved into ribs and gullies that
// fan down from each summit; snow lies on the upper ribs and streaks down the
// gullies, and each range fades into haze and valley mist toward its foot,
// the far ones paler and bluer. Transparent above the ridge line, opaque
// below, and the left and right edges meet.
export function makeHDBackdrop() {
  if (BACKDROP) return BACKDROP;
  const W = 4096;
  const HH = 768;
  const N = W * HH;
  const BUF = new Float32Array(N * 4);
  const tab = new Float32Array(65536);
  {
    const r = rng(9001);
    for (let k = 0; k < tab.length; k++) tab[k] = r();
  }
  const ranges = [
    {
      seed: 3, count: 30, top: [440, 600], slope: [0.42, 0.8], snow: [10, 34], snowTop: 490, jag: 7, big: 26, base: HH,
      haze: 0.04, hazeCol: C('#30324a'), mist: 0.55, mistCol: C('#3c3c58'),
      shadow: C('#0d0e16'), rock: C('#1f1e28'), lit: C('#5c4440'), snowSh: C('#525e88'), snowLit: C('#f0c4ac'), rim: C('#ffa86e'),
    },
    {
      seed: 2, count: 21, top: [300, 470], slope: [0.42, 0.85], snow: [26, 90], snowTop: 440, jag: 8, big: 34, base: 660,
      haze: 0.26, hazeCol: C('#545e88'), mist: 0.55, mistCol: C('#6c72a0'),
      shadow: C('#191c30'), rock: C('#34364a'), lit: C('#8c6c6c'), snowSh: C('#7482b4'), snowLit: C('#ffd6c0'), rim: C('#ffba86'),
    },
    {
      seed: 1, count: 14, top: [120, 320], slope: [0.36, 0.72], snow: [60, 160], snowTop: 340, jag: 8, big: 44, base: 590,
      haze: 0.5, hazeCol: C('#8c92bc'), mist: 0.5, mistCol: C('#a6a8ca'),
      shadow: C('#363a5a'), rock: C('#565672'), lit: C('#bc8e86'), snowSh: C('#8896c4'), snowLit: C('#ffe0cc'), rim: C('#ffc8a0'),
    },
  ];
  const solid = new Int32Array(W).fill(HH);
  const ce = new Float64Array(128);
  const cp = new Int32Array(128);
  for (const Rg of ranges) {
    const r = rng(Rg.seed * 101);
    const peaks = [];
    for (let k = 0; k < Rg.count; k++) {
      const y = lerp(Rg.top[0], Rg.top[1], Math.pow(r(), 0.8));
      const p = {
        x: ((k + 0.15 + r() * 0.7) / Rg.count) * W,
        y,
        sl: lerp(Rg.slope[0], Rg.slope[1], r()),
        sr: lerp(Rg.slope[0], Rg.slope[1], r()),
        snow: lerp(Rg.snow[0], Rg.snow[1], r()) * sstep(Rg.snowTop + 50, Rg.snowTop - 50, y),
        ox: r() * 200,
        oy: r() * 200,
        ribK: 3 + r() * 3,
        sp: new Float32Array(HH),
      };
      // the spine (where the lit and shadowed faces meet) leans and wanders
      const lean = (r() - 0.5) * 0.6;
      for (let d = 0; d < HH; d++) p.sp[d] = lean * d + (vnoise(tab, d * 0.018 + p.ox, p.oy) - 0.5) * d * 0.45;
      peaks.push(p);
    }
    // silhouette detail shared by the range: ridged shoulders, then crags
    const S = {
      W, HH, peaks, solid, ce, cp, tab, BUF, Rg,
      big: noise1(W, 18, 3, Rg.seed * 7 + 1),
      jag: noise1(W, 96, 4, Rg.seed * 7 + 2),
      fineJ: noise1(W, 512, 2, Rg.seed * 7 + 3),
    };
    for (let x = 0; x < W; x++) bdColumn(S, x);
  }
  const cv = mkCanvas(W, HH);
  const g = cv.getContext('2d');
  const img = g.createImageData(W, HH);
  const d = img.data;
  // transpose back to rows in strips of 16 columns
  for (let x0 = 0; x0 < W; x0 += 16) {
    for (let y = 0; y < HH; y++) {
      for (let x = x0; x < x0 + 16; x++) {
        const s = (x * HH + y) * 4;
        const a = BUF[s + 3];
        if (a <= 0) continue;
        const o = (y * W + x) * 4;
        const ia = 255 / a;
        d[o] = BUF[s] * ia;
        d[o + 1] = BUF[s + 1] * ia;
        d[o + 2] = BUF[s + 2] * ia;
        d[o + 3] = a * 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  BACKDROP = cv;
  return cv;
}
