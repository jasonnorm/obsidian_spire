// Procedural pixel textures for the first-person view, plus the mountain
// backdrop. Every texture is built from a seeded RNG, so each call gives the
// same picture, and every pixel is written straight into ImageData as one of
// the sixteen palette colours (no antialiased canvas drawing anywhere).
// Tiling textures wrap all their noise, stamps and strokes, so they repeat
// without seams in both directions.

import { PAL_RGB } from './palette.js';

export const TEXTURE_SPECS = {
  heath: { w: 64, h: 64, tile: true },
  marsh: { w: 64, h: 64, tile: true },
  volcanic: { w: 64, h: 64, tile: true },
  snow: { w: 64, h: 64, tile: true },
  forest: { w: 64, h: 64, tile: true },
  desert: { w: 64, h: 64, tile: true },
  ash: { w: 64, h: 64, tile: true },
  road: { w: 64, h: 64, tile: true },
  cobble: { w: 64, h: 64, tile: true },
  stonewall: { w: 64, h: 64, tile: true },
  barrowwall: { w: 64, h: 64, tile: true },
  barrowfloor: { w: 64, h: 64, tile: true },
  barrowceil: { w: 64, h: 64, tile: true },
  obsidian: { w: 64, h: 64, tile: true },
  spirewall: { w: 64, h: 64, tile: true },
  spirefloor: { w: 64, h: 64, tile: true },
  wood: { w: 64, h: 64, tile: true },
  door: { w: 64, h: 96, tile: false },
  thatch: { w: 64, h: 64, tile: true },
  rooftile: { w: 64, h: 64, tile: true },
  canvas: { w: 64, h: 64, tile: true },
  marble: { w: 64, h: 64, tile: true },
  grassmound: { w: 64, h: 64, tile: true },
  runeband: { w: 128, h: 32, tile: true },
  water: { w: 64, h: 64, tile: true },
  gold: { w: 64, h: 64, tile: true },
};

// Palette indices by name, to keep the recipes readable.
const K = 0; const NAVY = 1; const BLUE = 2; const SKY = 3; const DKGRN = 4; const GRN = 5; const TEAL = 6;
const MAROON = 7; const RED = 8; const BROWN = 9; const SAND = 10; const YEL = 11; const DKGRY = 12;
const LTGRY = 13; const WHITE = 14; const VIOLET = 15;
const CLEAR = 255;

/* ------------------------------------------------------------ utilities */

function hash(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mod = (a, n) => ((a % n) + n) % n;

// v in 0..1 picks a tone; halfway steps are a checkerboard of the two neighbours.
function ramp(v, tones, x, y) {
  const n = tones.length;
  const lv = 2 * n - 1;
  let i = Math.floor(v * lv);
  if (i < 0) i = 0;
  if (i > lv - 1) i = lv - 1;
  if ((i & 1) === 0) return tones[i >> 1];
  return (x + y) & 1 ? tones[(i + 1) >> 1] : tones[(i - 1) >> 1];
}

class Pix {
  constructor(w, h, fill = 0) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h).fill(fill);
  }
  get(x, y) { return this.d[mod(Math.floor(y), this.h) * this.w + mod(Math.floor(x), this.w)]; }
  set(x, y, c) { if (c === null || c === undefined) return; this.d[mod(Math.floor(y), this.h) * this.w + mod(Math.floor(x), this.w)] = c; }
  fill(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = fn(x, y, this.d[y * this.w + x]);
      if (c !== null && c !== undefined) this.d[y * this.w + x] = c;
    }
    return this;
  }
  // wrapped Bresenham line
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0); const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, typeof c === 'function' ? c(x0, y0, this.get(x0, y0)) : c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // rows of hex characters, '.' skipped
  stamp(rows, x0, y0) {
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch !== '.') this.set(x0 + i, y0 + j, parseInt(ch, 16));
    }
  }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const g = cv.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    for (let i = 0; i < this.d.length; i++) {
      const c = this.d[i];
      const o = i * 4;
      if (c === CLEAR) { img.data[o + 3] = 0; continue; }
      const [r, gg, b] = PAL_RGB[c];
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
}

// Periodic value noise: `cells` lattice cells across the width; height gets
// cells in proportion, so the noise wraps on both axes.
function vnoise(t, x, y, cells, seed) {
  const cx = cells;
  const cy = Math.max(1, Math.round((cells * t.h) / t.w));
  const u = (x / t.w) * cx; const v = (y / t.h) * cy;
  const x0 = Math.floor(u); const y0 = Math.floor(v);
  const fx = u - x0; const fy = v - y0;
  const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => hash(mod(i, cx), mod(j, cy), seed);
  const a = h(x0, y0); const b = h(x0 + 1, y0); const c = h(x0, y0 + 1); const d = h(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(t, x, y, cells, oct, seed) {
  let s = 0; let n = 0; let a = 1;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(t, x, y, cells << o, seed + o * 101);
    n += a;
    a *= 0.5;
  }
  return s / n;
}

// Wrapped Voronoi: nearest and second-nearest seed.
function voronoi(t, seeds, x, y) {
  let b1 = Infinity; let b2 = Infinity; let id = 0; let id2 = 0;
  for (let i = 0; i < seeds.length; i++) {
    let dx = Math.abs(x - seeds[i][0]); let dy = Math.abs(y - seeds[i][1]);
    if (dx > t.w / 2) dx = t.w - dx;
    if (dy > t.h / 2) dy = t.h - dy;
    const d = dx * dx + dy * dy;
    if (d < b1) { b2 = b1; id2 = id; b1 = d; id = i; } else if (d < b2) { b2 = d; id2 = i; }
  }
  return { id, id2, d1: Math.sqrt(b1), edge: Math.sqrt(b2) - Math.sqrt(b1) };
}

function jitterGrid(nx, ny, w, h, jit, seed, rowShift = 0) {
  const r = rng(seed);
  const out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    out.push([mod((i + 0.5 + (j % 2) * rowShift + (r() - 0.5) * jit) * (w / nx), w), mod((j + 0.5 + (r() - 0.5) * jit) * (h / ny), h)]);
  }
  return out;
}

// Wrapped random walk, used for cracks, roots and veins.
function walk(t, x, y, steps, dirFn, paint) {
  for (let i = 0; i < steps; i++) {
    paint(Math.floor(x), Math.floor(y), i);
    const [dx, dy] = dirFn(i);
    x += dx; y += dy;
  }
  return [x, y];
}

// Bevelled blocks: id(x, y) names the block; returns 'top', 'left', 'bottom', 'right' or 'in'.
function blockEdge(id, x, y) {
  const b = id(x, y);
  if (id(x, y - 1) !== b) return 'top';
  if (id(x - 1, y) !== b) return 'left';
  if (id(x, y + 1) !== b) return 'bottom';
  if (id(x + 1, y) !== b) return 'right';
  return 'in';
}

// Courses of blocks: given course heights, each course gets random block
// widths (summing to the width) and a random offset. Returns the block id and
// the pixel's place inside its block.
function courseCells(t, heights, seed, minW, maxW) {
  const r = rng(seed);
  const rows = [];
  let y = 0;
  for (const h of heights) {
    const widths = [];
    let left = t.w;
    while (left > 0) {
      let wv = Math.round(minW + r() * (maxW - minW));
      if (left - wv < minW) wv = left;
      widths.push(wv);
      left -= wv;
    }
    rows.push({ y, h, widths, off: Math.floor(r() * t.w) });
    y += h;
  }
  return (x, yy) => {
    yy = mod(yy, t.h);
    let ri = 0;
    while (ri < rows.length - 1 && yy >= rows[ri].y + rows[ri].h) ri++;
    const row = rows[ri];
    let xx = mod(x - row.off, t.w);
    let bi = 0;
    while (xx >= row.widths[bi]) { xx -= row.widths[bi]; bi++; }
    return { id: ri * 100 + bi, lx: xx, ly: yy - row.y, cw: row.widths[bi], ch: row.h };
  };
}

/* ------------------------------------------------------------ ground */

function grassTufts(t, n, seed, { tip = GRN, base = DKGRN, shadow = K, tall = 3 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * t.w); const y = Math.floor(r() * t.h);
    const blades = 2 + Math.floor(r() * 3);
    for (let b = 0; b < blades; b++) {
      const lean = b - (blades - 1) / 2;
      const h = 2 + Math.floor(r() * tall);
      for (let k = 0; k < h; k++) t.set(x + Math.round((lean * k) / h), y - k, k === 0 ? base : tip);
    }
    t.set(x, y + 1, shadow);
    t.set(x + 1, y + 1, shadow);
  }
}

function heath() {
  const t = new Pix(64, 64);
  t.fill((x, y) => {
    const n = fbm(t, x, y, 4, 3, 11);
    let v = 0.3 + n * 0.45 + (vnoise(t, x, y, 16, 12) - 0.5) * 0.25 + (hash(x, y, 13) - 0.5) * 0.14;
    const bare = vnoise(t, x, y, 8, 14);
    if (bare > 0.72 && hash(x, y, 17) < 0.8) return ramp(0.45 + (hash(x, y, 18) - 0.5) * 0.5, [K, MAROON, BROWN], x, y);
    return ramp(v, [K, DKGRN, GRN], x, y);
  });
  grassTufts(t, 56, 15);
  // heather: violet florets on a dark stem, a few with a pale bloom
  const r = rng(16);
  for (let i = 0; i < 36; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    t.set(x, y + 2, K);
    t.set(x - 1, y + 1, NAVY); t.set(x + 1, y + 1, NAVY); t.set(x, y + 1, NAVY);
    t.set(x, y, VIOLET); t.set(x - 1, y, VIOLET); t.set(x + 1, y - 1, VIOLET);
    if (r() < 0.5) { t.set(x - 2, y - 1, VIOLET); t.set(x - 1, y - 1, r() < 0.3 ? WHITE : VIOLET); }
    if (r() < 0.4) t.set(x + 2, y, VIOLET);
  }
  return t;
}

function marsh() {
  const t = new Pix(64, 64);
  const wet = (x, y) => fbm(t, x, y, 4, 3, 21) + (vnoise(t, x, y, 16, 22) - 0.5) * 0.08;
  t.fill((x, y) => {
    const w = wet(x, y);
    if (w < 0.44) {
      if (wet(x, y - 1) >= 0.44 || wet(x - 1, y) >= 0.44) return K;
      if (wet(x, y - 2) >= 0.44) return BLUE;
      const depth = clamp((0.44 - w) * 5);
      const rip = Math.sin((y + 1.6 * Math.sin((x * Math.PI * 2) / 32)) * (Math.PI / 3));
      if (rip > 0.86 && hash(x >> 2, y, 23) < 0.6) return hash(x, y, 24) < 0.15 ? WHITE : SKY;
      return ramp(0.95 - depth * 0.75 + (hash(x, y, 27) - 0.5) * 0.1, [NAVY, BLUE, TEAL], x, y);
    }
    let v = 0.4 + (w - 0.44) * 0.8 + (hash(x, y, 25) - 0.5) * 0.25;
    if (wet(x, y + 1) < 0.44) v -= 0.25;
    return ramp(v, [K, DKGRN, GRN], x, y);
  });
  const r = rng(26);
  for (let i = 0; i < 28; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    if (wet(x, y) < 0.47) continue;
    for (let b = -1; b <= 1; b++) {
      const h = 3 + Math.floor(r() * 4);
      for (let k = 0; k < h; k++) t.set(x + b * 2 + (k > 2 ? b : 0), y - k, k === h - 1 ? (r() < 0.3 ? SAND : GRN) : k === 0 ? DKGRN : GRN);
    }
    t.set(x, y + 1, K); t.set(x - 1, y + 1, K); t.set(x + 1, y + 1, K);
    if (r() < 0.35) { t.set(x + 1, y - 5, BROWN); t.set(x + 1, y - 6, BROWN); t.set(x + 1, y - 7, SAND); }
  }
  return t;
}

function volcanic() {
  const t = new Pix(64, 64);
  const seeds = jitterGrid(5, 5, 64, 64, 0.8, 31, 0.5);
  t.fill((x, y) => {
    const { id, id2, edge } = voronoi(t, seeds, x + 0.5, y + 0.5);
    const glow = hash(Math.min(id, id2), Math.max(id, id2), 32) < 0.45;
    if (glow) {
      if (edge < 0.5) return YEL;
      if (edge < 1.3) return (x + y) & 1 && edge < 0.9 ? YEL : RED;
      if (edge < 2.2) return (x + y) & 1 ? RED : MAROON;
      if (edge < 3) return (x + y) & 1 ? MAROON : K;
    } else if (edge < 1.1) return K;
    const s = seeds[id];
    let dx = x + 0.5 - s[0]; let dy = y + 0.5 - s[1];
    if (dx > 32) dx -= 64; if (dx < -32) dx += 64; if (dy > 32) dy -= 64; if (dy < -32) dy += 64;
    let v = 0.3 + hash(id, 0, 33) * 0.16 - (dx + dy) * 0.008 + (vnoise(t, x, y, 16, 34) - 0.5) * 0.22;
    if (edge < 2.2 && !glow) v += dx + dy < 0 ? 0.2 : -0.15;
    if (hash(x, y, 35) < 0.03) v += 0.3;
    return ramp(v, [K, DKGRY, LTGRY], x, y);
  });
  return t;
}

function snow() {
  const t = new Pix(64, 64);
  const hgt = (x, y) => fbm(t, x, y, 4, 3, 41) * 0.7 + vnoise(t, x * 1.0, y, 8, 42) * 0.3;
  t.fill((x, y) => {
    const gx = hgt(x + 1, y) - hgt(x - 1, y);
    const gy = hgt(x, y + 1) - hgt(x, y - 1);
    const v = 0.84 - (gx + gy) * 4.5 + (hash(x, y, 43) - 0.5) * 0.06;
    return ramp(v, [BLUE, SKY, LTGRY, WHITE], x, y);
  });
  const r = rng(45);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    if (i < 5) { t.set(x, y, DKGRY); t.set(x + 1, y, LTGRY); t.set(x, y + 1, SKY); }
    else { t.set(x, y, SKY); t.set(x + 1, y, WHITE); }
  }
  return t;
}

function forest() {
  const t = new Pix(64, 64);
  t.fill((x, y) => {
    const n = fbm(t, x, y, 4, 3, 51);
    const v = 0.22 + n * 0.5 + (hash(x, y, 52) - 0.5) * 0.18;
    return ramp(v, [K, DKGRN, GRN], x, y);
  });
  const r = rng(53);
  // moss cushions
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    t.stamp(['.55.', '5554', '.444', '..0.'], x, y);
  }
  for (let i = 0; i < 9; i++) {
    const x = r() * 64; const y = r() * 64; const a = r() * Math.PI; const len = 4 + r() * 6;
    const x1 = x + Math.cos(a) * len; const y1 = y + Math.sin(a) * len;
    t.line(x, y + 1, x1, y1 + 1, K);
    t.line(x, y, x1, y1, BROWN);
    if (r() < 0.6) t.line(x1, y1, x1 + 2, y1 - 2, BROWN);
  }
  const leaves = [
    ['..a9', '.a97', 'a97.', '07..'], ['9a..', '79a.', '.79a', '..70'], ['.a.', 'a97', '.97', '..0'],
    ['a9.', '997', '.70'], ['.88', '887', '870'], ['.a9', 'aa9', '997'],
  ];
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    t.stamp(leaves[Math.floor(r() * (r() < 0.2 ? leaves.length : leaves.length - 2))], x, y);
  }
  return t;
}

function desert() {
  const t = new Pix(64, 64);
  const ph = (x, y) => (y + 2.4 * Math.sin(((x * Math.PI * 2) / 64) * 2 + 1) + 0.9 * Math.sin(((x * Math.PI * 2) / 64) * 3) + (fbm(t, x, y, 4, 2, 61) - 0.5) * 4) / 8;
  t.fill((x, y) => {
    const p = ph(x + 0.5, y + 0.5);
    const f = p - Math.floor(p);
    let v = 0.5 + (fbm(t, x, y, 8, 2, 62) - 0.5) * 0.18;
    if (f < 0.1) v = 0.7;
    else if (f < 0.24) v = 0.3;
    v += (hash(x, y, 63) - 0.5) * 0.08;
    return ramp(v, [BROWN, SAND, YEL], x, y);
  });
  const r = rng(64);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    t.set(x, y, r() < 0.5 ? MAROON : BROWN); t.set(x + 1, y, BROWN); t.set(x, y - 1, YEL);
  }
  return t;
}

function ash() {
  const t = new Pix(64, 64);
  t.fill((x, y) => {
    const n = fbm(t, x, y, 4, 3, 71);
    let v = 0.36 + (n - 0.5) * 0.4 + (hash(x, y, 72) - 0.5) * 0.16;
    if (hash(x, y, 73) < 0.025) v += 0.35;
    return ramp(v, [K, DKGRY, LTGRY], x, y);
  });
  const r = rng(74);
  for (let c = 0; c < 4; c++) {
    let dir = r() * Math.PI * 2;
    walk(t, r() * 64, r() * 64, 26 + Math.floor(r() * 20), () => { dir += (r() - 0.5) * 1.1; return [Math.cos(dir), Math.sin(dir)]; }, (x, y, i) => {
      t.set(x, y, i % 4 === 3 ? NAVY : VIOLET);
      if (hash(x, y, 75) < 0.5) t.set(x + 1, y, NAVY);
    });
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    t.set(x, y, K); t.set(x + 1, y, K); t.set(x, y + 1, K);
    if (r() < 0.5) t.set(x + 1, y + 1, K);
    t.set(x, y - 1, r() < 0.15 ? MAROON : LTGRY);
  }
  return t;
}

function road() {
  const t = new Pix(64, 64);
  const ruts = [(y) => 19 + 1.6 * Math.sin((y * Math.PI * 2) / 64), (y) => 45 + 1.6 * Math.sin((y * Math.PI * 2) / 64 + 1.3)];
  t.fill((x, y) => {
    let v = 0.62 + (fbm(t, x, y, 4, 3, 81) - 0.5) * 0.3 + (hash(x, y, 82) - 0.5) * 0.14;
    for (const rc of ruts) {
      const d = x + 0.5 - rc(y);
      if (Math.abs(d) < 3.2) {
        v = 0.44 + (hash(x, y, 83) - 0.5) * 0.12;
        if (d < -2.2) v = 0.24;
        else if (d > 2.2) v = 0.8;
        else if (Math.abs(d) < 0.8 && hash(x, y >> 1, 84) < 0.5) v = 0.34;
      } else if (Math.abs(d) < 4.4) v += d < 0 ? 0.16 : -0.1;
    }
    return ramp(v, [K, MAROON, BROWN, SAND], x, y);
  });
  const r = rng(85);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    const big = r() < 0.4;
    t.set(x, y, LTGRY);
    if (big) { t.set(x + 1, y, DKGRY); t.set(x, y - 1, WHITE); t.set(x + 1, y + 1, MAROON); }
    t.set(x, y + 1, MAROON);
  }
  const g = rng(86);
  for (let i = 0; i < 7; i++) {
    const x = 29 + Math.floor(g() * 6); const y = Math.floor(g() * 64);
    t.set(x, y, GRN); t.set(x + 1, y - 1, GRN); t.set(x - 1, y - 1, DKGRN); t.set(x, y + 1, MAROON);
  }
  return t;
}

function cobble() {
  const t = new Pix(64, 64);
  const seeds = jitterGrid(8, 8, 64, 64, 0.45, 91, 0.5);
  t.fill((x, y) => {
    const { id, edge } = voronoi(t, seeds, x + 0.5, y + 0.5);
    if (edge < 1.3) return hash(x, y, 92) < 0.12 ? DKGRN : K;
    const s = seeds[id];
    let dx = x + 0.5 - s[0]; let dy = y + 0.5 - s[1];
    if (dx > 32) dx -= 64; if (dx < -32) dx += 64; if (dy > 32) dy -= 64; if (dy < -32) dy += 64;
    const nx = clamp(dx / 4.2, -1, 1); const ny = clamp(dy / 4.2, -1, 1);
    let v = 0.56 - 0.2 * nx - 0.22 * ny + (hash(id, 1, 94) - 0.5) * 0.16 + (hash(x, y, 95) - 0.5) * 0.06;
    if (edge < 2.2) v += nx + ny < 0 ? 0.16 : -0.22;
    const brown = hash(id, 2, 96) < 0.12;
    return ramp(v, brown ? [K, MAROON, BROWN, SAND] : [K, DKGRY, LTGRY, WHITE], x, y);
  });
  return t;
}

function stonewall() {
  const t = new Pix(64, 64);
  const cell = courseCells(t, [16, 16, 16, 16], 101, 14, 30);
  t.fill((x, y) => {
    const { id, lx, ly, cw, ch } = cell(x, y);
    if (lx === 0 || ly === 0) return K;
    const tone = hash(id, 0, 102);
    let v = tone < 0.4 ? 0.36 : tone < 0.75 ? 0.62 : 0.5;
    v += (vnoise(t, x, y, 16, 103) - 0.5) * 0.12 + (hash(x, y, 104) - 0.5) * 0.06;
    if (ly === 1 || lx === 1) v += 0.26;
    else if (ly === ch - 1 || lx === cw - 1) v -= 0.26;
    if (hash(x >> 1, y >> 1, 105 + id) < 0.03) v -= 0.22;
    return ramp(v, [K, DKGRY, LTGRY, WHITE], x, y);
  });
  const r = rng(106);
  for (let i = 0; i < 3; i++) {
    let dir = Math.PI / 2 + (r() - 0.5);
    walk(t, r() * 64, r() * 64, 6 + Math.floor(r() * 5), () => { dir += (r() - 0.5) * 0.9; return [Math.cos(dir), Math.sin(dir)]; }, (x, y) => {
      if (t.get(x, y) !== K) { t.set(x, y, K); if (t.get(x + 1, y) !== K) t.set(x + 1, y, LTGRY); }
    });
  }
  return t;
}

function barrowwall() {
  const t = new Pix(64, 64);
  const r = rng(111);
  const heights = [];
  let left = 64;
  while (left > 0) { let h = 6 + Math.floor(r() * 5); if (left - h < 6) h = left; heights.push(h); left -= h; }
  const cell = courseCells(t, heights, 112, 8, 20);
  t.fill((x, y) => {
    const { id, lx, ly, cw, ch } = cell(x, y);
    const dl = lx; const dr = cw - 2 - lx; const dt = ly; const db = ch - 2 - ly;
    const corner = 1 + Math.floor(hash(id, 4, 113) * 2.5);
    const sag = hash(id, 5, 114) < 0.5 && dt === 0 && (lx < 2 || lx > cw - 4);
    if (dr < 0 || db < 0 || Math.min(dl, dr) + Math.min(dt, db) < corner || sag) {
      return ramp(0.3 + (hash(x, y, 115) - 0.5) * 0.5, [K, MAROON, BROWN], x, y);
    }
    const kind = hash(id, 0, 117);
    let v = 0.48 + hash(id, 1, 118) * 0.14 + (hash(x, y, 119) - 0.5) * 0.12;
    if (dt === 0) v += 0.26; else if (dl === 0) v += 0.12;
    if (db === 0) v -= 0.28; else if (dr === 0) v -= 0.16;
    if (dt === 0 && hash(id, 3, 120) < 0.3 && hash(x, 0, 121) < 0.75) return hash(x, y, 122) < 0.4 ? GRN : DKGRN;
    if (dt === 1 && hash(id, 3, 120) < 0.3 && hash(x, 1, 123) < 0.4) return DKGRN;
    return ramp(v, kind < 0.2 ? [K, MAROON, BROWN] : [K, DKGRY, LTGRY], x, y);
  });
  // roots worming down through the wall
  for (let i = 0; i < 4; i++) {
    let x = r() * 64; let y = r() * 64;
    let dir = Math.PI / 2 + (r() - 0.5) * 0.4;
    const len = 26 + Math.floor(r() * 26);
    for (let k = 0; k < len; k++) {
      t.set(x, y, k % 7 === 0 ? SAND : BROWN);
      t.set(x + 1, y, MAROON);
      if (r() < 0.07) { const s = r() < 0.5 ? -1 : 1; t.set(x + s, y + 1, BROWN); t.set(x + 2 * s, y + 2, MAROON); }
      dir += (r() - 0.5) * 0.6;
      dir = clamp(dir, Math.PI * 0.3, Math.PI * 0.7);
      x += Math.cos(dir) * 0.8; y += Math.sin(dir);
    }
  }
  return t;
}

function barrowfloor() {
  const t = new Pix(64, 64);
  const seeds = jitterGrid(4, 4, 64, 64, 0.5, 131, 0.5);
  const cheb = (x, y) => {
    let b1 = Infinity; let b2 = Infinity; let id = 0;
    for (let i = 0; i < seeds.length; i++) {
      let dx = Math.abs(x - seeds[i][0]); let dy = Math.abs(y - seeds[i][1]);
      if (dx > 32) dx = 64 - dx; if (dy > 32) dy = 64 - dy;
      const d = Math.max(dx, dy * 1.1) + Math.min(dx, dy) * 0.25;
      if (d < b1) { b2 = b1; b1 = d; id = i; } else if (d < b2) b2 = d;
    }
    return { id, edge: b2 - b1 };
  };
  t.fill((x, y) => {
    const { id, edge } = cheb(x + 0.5, y + 0.5);
    const earth = hash(id, 0, 133) < 0.18;
    if (earth || edge < 1.6) {
      const v = 0.5 + (fbm(t, x, y, 8, 2, 134) - 0.5) * 0.4 + (hash(x, y, 135) - 0.5) * 0.3 - (edge < 1.6 && !earth ? 0.12 : 0);
      return ramp(v, [K, MAROON, BROWN], x, y);
    }
    const s = seeds[id];
    let dx = x + 0.5 - s[0]; let dy = y + 0.5 - s[1];
    if (dx > 32) dx -= 64; if (dx < -32) dx += 64; if (dy > 32) dy -= 64; if (dy < -32) dy += 64;
    let v = 0.48 + hash(id, 1, 136) * 0.16 + (fbm(t, x, y, 8, 2, 137) - 0.5) * 0.18 + (hash(x, y, 138) - 0.5) * 0.06;
    if (edge < 2.6) v += dx + dy < 0 ? 0.3 : -0.2;
    return ramp(v, [K, DKGRY, LTGRY], x, y);
  });
  const r = rng(139);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    const c = t.get(x, y);
    if (c === BROWN || c === MAROON) { t.set(x, y, LTGRY); t.set(x, y + 1, K); }
  }
  for (let i = 0; i < 4; i++) {
    let dir = r() * Math.PI * 2;
    walk(t, r() * 64, r() * 64, 7, () => { dir += (r() - 0.5) * 1.2; return [Math.cos(dir), Math.sin(dir)]; }, (x, y) => {
      const c = t.get(x, y);
      if (c === LTGRY || c === DKGRY) t.set(x, y, K);
    });
  }
  return t;
}

function barrowceil() {
  const t = new Pix(64, 64);
  t.fill((x, y) => {
    const n = fbm(t, x, y, 4, 3, 141);
    const v = 0.36 + (n - 0.5) * 0.5 + (hash(x, y, 142) - 0.5) * 0.2;
    return ramp(v, [K, MAROON, BROWN], x, y);
  });
  const r = rng(143);
  for (let i = 0; i < 7; i++) {
    let dir = r() * Math.PI * 2;
    walk(t, r() * 64, r() * 64, 24 + Math.floor(r() * 24), () => { dir += (r() - 0.5) * 0.8; return [Math.cos(dir), Math.sin(dir)]; }, (x, y, k) => {
      t.set(x, y + 1, K);
      t.set(x, y, k % 6 === 0 ? SAND : BROWN);
    });
  }
  // a beam across the tile, casting shadow either side
  const by = 26; const bh = 12;
  t.fill((x, y, c) => {
    if (y === by - 1 || y === by + bh) return K;
    if (y === by - 2 || y === by + bh + 1) return (x + y) & 1 ? K : c;
    if (y < by || y >= by + bh) return null;
    const ly = y - by;
    let v = 0.62 + (ly === 0 ? 0.25 : ly === 1 ? 0.12 : ly >= bh - 2 ? -0.3 : 0);
    const grain = Math.sin(((x * Math.PI * 2) / 64) * 3 + ly * 1.3 + Math.sin(x * 0.4) * 0.8);
    if (grain > 0.8 && ly > 1 && ly < bh - 2) v -= 0.24;
    if (mod(x - 30, 64) === 0) v = 0;
    if (mod(x - 31, 64) === 0) v += 0.2;
    v += (hash(x, y, 144) - 0.5) * 0.06;
    return ramp(v, [K, MAROON, BROWN, SAND], x, y);
  });
  for (const x of [10, 50]) { t.set(x, by + 3, LTGRY); t.set(x + 1, by + 3, DKGRY); t.set(x, by + 4, DKGRY); t.set(x + 1, by + 4, K); }
  return t;
}

/* ------------------------------------------------------------ the Spire */

function obsidian() {
  const t = new Pix(64, 64);
  const info = (x, y) => {
    const yy = mod(y, 64); const row = Math.floor(yy / 16);
    const sx = mod(x + (row % 2) * 16, 64);
    return { b: row * 10 + Math.floor(sx / 32), lx: sx % 32, ly: yy % 16 };
  };
  t.fill((x, y) => {
    const { b, lx, ly } = info(x, y);
    if (lx === 0 || ly === 0) return K;
    const r = (k) => hash(b, k, 151);
    if (ly === 1 && lx < 30) return lx < 3 + r(9) * 6 ? VIOLET : NAVY;
    if (lx === 1) return ly < 4 ? NAVY : (ly & 1 ? NAVY : K);
    if (lx === 31 || ly === 15) return K;
    // conchoidal ripples round a fracture point
    const fx = 3 + r(1) * 26; const fy = 3 + r(2) * 10;
    const d = Math.hypot(lx - fx, (ly - fy) * 1.7);
    const ring = Math.sin(d * 1.1 + r(3) * 6);
    let v = 0.12 + (vnoise(t, x, y, 8, 152) - 0.5) * 0.12;
    if (ring > 0.8 && d < 12) v += 0.24;
    // one sharp specular streak per block
    const sx0 = 3 + r(4) * 16; const sy0 = 6 + r(5) * 7; const len = 6 + r(6) * 9;
    const k = lx - sx0;
    if (k >= 0 && k <= len && Math.abs((ly - sy0) + k * 0.5) < 0.5) {
      if (Math.abs(k - len * 0.3) < 0.8) return WHITE;
      return k > len * 0.75 ? VIOLET : BLUE;
    }
    return ramp(v, [K, NAVY, BLUE], x, y);
  });
  return t;
}

function spirewall() {
  const t = new Pix(64, 64);
  const id = (x, y) => {
    const row = Math.floor(mod(y, 64) / 8);
    return row * 10 + Math.floor(mod(x + (row % 2) * 8, 64) / 16);
  };
  t.fill((x, y) => {
    const b = id(x, y);
    if (id(x - 1, y) !== b || mod(y, 8) === 0) return K;
    let v = (hash(b, 0, 161) < 0.3 ? 0.32 : 0.46) + (hash(x, y, 162) - 0.5) * 0.1;
    if (mod(y, 8) === 1) v += 0.24;
    else if (id(x - 2, y) !== b) v += 0.12;
    if (mod(y, 8) === 7 || id(x + 1, y) !== b) v -= 0.22;
    return ramp(v, [K, NAVY, BLUE], x, y);
  });
  // rune veins: right-angled glowing threads with bright knots
  const r = rng(163);
  for (let i = 0; i < 4; i++) {
    let x = Math.floor(r() * 64); let y = Math.floor(r() * 64);
    let horiz = r() < 0.5;
    for (let s = 0; s < 6; s++) {
      const len = 3 + Math.floor(r() * 8);
      const sg = r() < 0.5 ? -1 : 1;
      for (let k = 0; k < len; k++) {
        t.set(x, y, k % 4 === 3 ? NAVY : VIOLET);
        if (horiz) x += sg; else y += sg;
      }
      if (r() < 0.45) {
        t.set(x, y, WHITE); t.set(x - 1, y, VIOLET); t.set(x + 1, y, VIOLET); t.set(x, y - 1, VIOLET); t.set(x, y + 1, VIOLET);
      }
      horiz = !horiz;
    }
  }
  return t;
}

function spirefloor() {
  const t = new Pix(64, 64);
  t.fill((x, y) => {
    const lx = mod(x, 32); const ly = mod(y, 32);
    const q = (Math.floor(mod(x, 64) / 32) + Math.floor(mod(y, 64) / 32)) & 1;
    const gx = mod(x, 64); const gy = mod(y, 64);
    // gold inlay along the tile's border lines
    if (gx === 0 || gy === 0) return gx === 0 && gy === 0 ? WHITE : YEL;
    if (gx === 1 || gy === 1) return BROWN;
    if (gx === 63 || gy === 63) return SAND;
    if (lx === 0 || ly === 0) return K;
    const m = fbm(t, x, y, 8, 2, 171);
    let v = (q ? 0.5 : 0.3) + (m - 0.5) * 0.3 + (hash(x, y, 172) - 0.5) * 0.06;
    if (lx === 1 || ly === 1 || (lx === 2 && gx !== 2) || (ly === 2 && gy !== 2)) v += 0.2;
    if (lx === 31 || ly === 31 || lx === 30 || ly === 30) v -= 0.22;
    return ramp(v, q ? [K, NAVY, VIOLET] : [K, NAVY, BLUE], x, y);
  });
  // small gold lozenges where the inlay meets the flag joints
  for (const [cx, cy] of [[32, 0], [0, 32]]) {
    t.set(cx, cy - 1, YEL); t.set(cx - 1, cy, YEL); t.set(cx + 1, cy, YEL); t.set(cx, cy + 1, YEL); t.set(cx, cy, WHITE);
  }
  return t;
}

/* ------------------------------------------------------------ buildings */

function wood() {
  const t = new Pix(64, 64);
  const r = rng(181);
  const joints = Array.from({ length: 8 }, () => Math.floor(r() * 64));
  const tone = Array.from({ length: 8 }, () => (r() - 0.5) * 0.1);
  const knots = Array.from({ length: 3 }, () => [Math.floor(r() * 64), Math.floor(r() * 8) * 8 + 3]);
  t.fill((x, y) => {
    const p = Math.floor(y / 8); const ly = y % 8;
    if (ly === 7) return K;
    if (mod(x - joints[p], 64) === 0) return K;
    let v = 0.62 + tone[p];
    if (ly === 0) v += 0.22;
    if (ly === 6) v -= 0.26;
    if (mod(x - joints[p], 64) === 1) v += 0.16;
    const g = Math.sin(((x * Math.PI * 2) / 64) * 2 + p * 1.7 + ly * 1.1 + Math.sin(((x * Math.PI * 2) / 64) * 5 + p) * 0.9);
    if (g > 0.82 && ly > 0 && ly < 6) v -= 0.26;
    for (const [kx, ky] of knots) {
      let dx = x - kx; if (dx > 32) dx -= 64; if (dx < -32) dx += 64;
      const d = Math.hypot(dx / 2, y - ky);
      if (d < 0.9) v = 0.1;
      else if (d < 1.9 && ly > 0 && ly < 6) v = 0.3;
    }
    v += (hash(x, y, 182) - 0.5) * 0.05;
    return ramp(v, [K, MAROON, BROWN, SAND], x, y);
  });
  for (let p = 0; p < 8; p++) for (const dx of [-2, 2]) {
    const x = joints[p] + dx; const y = p * 8 + 3;
    t.set(x, y, LTGRY); t.set(x + 1, y + 1, K);
  }
  return t;
}

function door() {
  const t = new Pix(64, 96);
  const cx = 31.5; const ay = 33; const R = 21.5; const x0 = 10; const x1 = 53;
  const inOpen = (px, py) => px >= x0 && px < x1 + 1 && (py >= ay || Math.hypot(px - cx, py - ay) <= R);
  const stoneId = (x, y) => {
    const px = x + 0.5; const py = y + 0.5;
    const d = Math.hypot(px - cx, py - ay);
    if (py < ay + 1 && d <= R + 7) {
      const a = Math.atan2(py - ay, px - cx);
      return 'v' + Math.floor((a + Math.PI) / (Math.PI / 9));
    }
    const row = Math.floor(y / 8);
    return 'j' + row + '_' + Math.floor((x + (row % 2) * 6) / 12);
  };
  const strHash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  t.fill((x, y) => {
    if (y >= 92) {
      let v = 0.5 + (y === 92 ? 0.3 : 0) + (hash(x, y, 191) - 0.5) * 0.1;
      if (mod(x, 21) === 0) v = 0;
      return ramp(v, [K, DKGRY, LTGRY], x, y);
    }
    if (!inOpen(x + 0.5, y + 0.5)) {
      const s = stoneId(x, y);
      const e = blockEdge(stoneId, x, y);
      if (e === 'left' || e === 'top') return K;
      let v = 0.36 + hash(strHash(s), 0, 192) * 0.2 + (hash(x, y, 193) - 0.5) * 0.1;
      if (stoneId(x - 1, y) !== stoneId(x - 2, y) || stoneId(x, y - 1) !== stoneId(x, y - 2)) v += 0.22;
      if (e === 'bottom' || e === 'right') v -= 0.2;
      if (inOpen(x - 1.5, y + 0.5) || inOpen(x + 2.5, y + 0.5) || inOpen(x + 0.5, y + 2.5)) v -= 0.16;
      return ramp(v, [K, DKGRY, LTGRY], x, y);
    }
    const di = Math.floor((x - x0) / 7.4);
    const lx = x + 0.5 - (x0 + di * 7.4);
    if (lx < 1) return K;
    let v = 0.6 + (lx < 2 ? 0.2 : lx > 6.2 ? -0.24 : 0) + (hash(di, 0, 194) - 0.5) * 0.1;
    const g = Math.sin(y * 0.21 + di * 2 + Math.sin(y * 0.07 + di) * 2 + lx * 1.4);
    if (g > 0.86) v -= 0.26;
    if (!inOpen(x + 0.5, y - 1.5) || !inOpen(x - 1.5, y + 0.5)) v -= 0.32;
    v += (hash(x, y, 195) - 0.5) * 0.05;
    return ramp(v, [K, MAROON, BROWN, SAND], x, y);
  });
  for (const by of [28, 56, 82]) {
    for (let x = x0; x <= x1; x++) {
      if (!inOpen(x + 0.5, by + 0.5)) continue;
      t.set(x, by, x < 32 ? LTGRY : DKGRY);
      t.set(x, by + 1, DKGRY);
      t.set(x, by + 2, K);
      if (mod(x - x0, 7) === 3) { t.set(x, by + 1, WHITE); t.set(x + 1, by + 1, K); }
    }
    t.stamp(['.dd.', 'dccd', 'cc0.', '0...'], x1 - 3, by - 1);
  }
  t.stamp(['.dc.', 'dcc0', 'c00c', '.c0.'], 42, 59);
  t.stamp([
    '.ddc.',
    'd0..c',
    'd...c',
    'd...0',
    '.cc0.',
  ], 41, 63);
  t.stamp(['cdc', 'c0c', 'c0c', 'cc0'], 43, 70);
  return t;
}

function thatch() {
  const t = new Pix(64, 64);
  t.fill((x, y) => ((x + y) & 1 ? K : MAROON));
  for (let row = 8; row >= 0; row--) {
    for (let x = 0; x < 64; x++) {
      const len = 7 + Math.floor(hash(x, row & 7, 201) * 4);
      const tone = hash(x, row & 7, 203);
      const lean = hash(x >> 2, row & 7, 204) < 0.5 ? 0 : 1;
      for (let ly = 0; ly < len; ly++) {
        const y = row * 8 + ly - 2;
        const xx = x + (ly > 4 ? lean : 0);
        let v = 0.12 + (ly / len) * 0.62 + (tone - 0.5) * 0.3;
        if (mod(x, 3) === 0) v -= 0.12;
        if (ly === len - 1 && tone > 0.75) v = 0.95;
        t.set(xx, y, ramp(v, [MAROON, BROWN, SAND, YEL], xx, y));
      }
    }
  }
  for (let y = 4; y < 64; y += 16) for (let x = 0; x < 64; x++) if (mod(x, 16) < 2) t.set(x, y, mod(x, 16) === 0 ? K : MAROON);
  return t;
}

function rooftile() {
  const t = new Pix(64, 64);
  const lip = (lx) => 2.2 * Math.sqrt(Math.max(0, 1 - ((lx - 3.5) / 4) ** 2));
  t.fill((x, y) => {
    const r = Math.floor(y / 8); const ly = y % 8;
    const lxp = mod(x + ((r - 1) & 1) * 4, 8);
    const offR = (r & 1) * 4; const lx = mod(x + offR, 8);
    if (ly < lip(lxp)) {
      if (lxp === 7) return K;
      if (ly + 1 >= lip(lxp)) return lxp < 2 ? MAROON : K;
      return lxp < 2 ? SAND : lxp > 5 ? MAROON : RED;
    }
    let v = 0.66 - 0.28 * ((lx - 3.5) / 4) + (hash(Math.floor((x + offR) / 8), r, 211) - 0.5) * 0.1;
    if (ly - lip(lxp) < 1.2) v -= 0.4;
    if (lx === 7) v = 0.05;
    if (lx === 0) v += 0.1;
    v += (hash(x, y, 212) - 0.5) * 0.04;
    return ramp(v, [K, MAROON, RED, SAND], x, y);
  });
  return t;
}

function canvasTex() {
  const t = new Pix(64, 64);
  t.fill((x, y) => {
    const s = mod(x, 16);
    const red = s < 8;
    let v = 0.75 + 0.2 * Math.sin((y * Math.PI * 2) / 32);
    if ((x & 1) === 0 && y % 4 === 0) v -= 0.3;
    if (s === 0 || s === 8) v = 0.2;
    if (s === 1 || s === 9) v -= 0.12;
    v += (hash(x, y, 221) - 0.5) * 0.04;
    return red ? ramp(v, [MAROON, RED], x, y) : ramp(v, [SAND, YEL], x, y);
  });
  return t;
}

function marble() {
  const t = new Pix(64, 64);
  t.fill((x, y) => {
    const lx = x % 32; const ly = y % 32;
    if (lx === 31 || ly === 31) return DKGRY;
    const b = Math.floor(x / 32) + Math.floor(y / 32) * 2;
    const flip = b % 2 ? -1 : 1;
    const warp = fbm(t, x, y, 4, 3, 231 + b) * 6;
    const m = Math.sin((((lx * flip) + ly * (1 + (b % 3) * 0.5)) * Math.PI) / 24 + warp);
    const cloud = fbm(t, x, y, 8, 2, 236);
    let v = 0.86 + (cloud - 0.5) * 0.4 + (hash(x, y, 237) - 0.5) * 0.04;
    if (Math.abs(m) < 0.07) v = 0.3;
    else if (Math.abs(m) < 0.18) v = Math.min(v, 0.68);
    if (lx === 0 || ly === 0) v = 1;
    if (lx === 30 || ly === 30) v = 0.5;
    return ramp(v, [DKGRY, LTGRY, WHITE], x, y);
  });
  return t;
}

function grassmound() {
  const t = new Pix(64, 64);
  const hgt = (x, y) => fbm(t, x, y, 8, 2, 241);
  t.fill((x, y) => {
    const gx = hgt(x + 1, y) - hgt(x - 1, y);
    const gy = hgt(x, y + 1) - hgt(x, y - 1);
    const v = 0.46 - (gx + gy) * 4 + (hash(x, y, 242) - 0.5) * 0.2;
    if (vnoise(t, x, y, 8, 243) > 0.8 && hash(x, y, 246) < 0.7) return ramp(v - 0.15, [K, MAROON, BROWN], x, y);
    return ramp(v, [K, DKGRN, GRN], x, y);
  });
  grassTufts(t, 44, 244, { tip: GRN, base: DKGRN, shadow: K, tall: 2 });
  const r = rng(245);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    t.set(x, y, r() < 0.5 ? YEL : WHITE); t.set(x, y + 1, DKGRN);
  }
  return t;
}

// An original rune alphabet: strokes on a 5 x 9 grid.
const RUNES = [
  [[2, 0, 2, 8], [2, 2, 4, 0], [2, 4, 0, 2], [2, 6, 4, 4]],
  [[2, 0, 2, 8], [2, 2, 0, 4], [0, 4, 2, 6], [2, 2, 4, 4], [4, 4, 2, 6]],
  [[0, 0, 0, 8], [4, 0, 4, 8], [0, 3, 4, 5], [0, 5, 4, 3]],
  [[2, 0, 2, 8], [0, 2, 2, 0], [2, 0, 4, 2], [0, 8, 4, 8]],
  [[0, 0, 2, 2], [4, 0, 2, 2], [2, 2, 2, 8], [0, 8, 4, 6]],
  [[2, 0, 2, 8], [0, 2, 2, 4], [4, 2, 2, 4], [0, 5, 2, 7], [4, 5, 2, 7]],
  [[0, 1, 4, 1], [2, 1, 2, 8], [0, 6, 2, 4], [4, 6, 2, 4]],
  [[4, 0, 0, 4], [0, 4, 4, 4], [4, 4, 0, 8]],
];

function runeband() {
  const t = new Pix(128, 32, K);
  for (let x = 0; x < 128; x++) {
    t.set(x, 2, VIOLET); t.set(x, 29, VIOLET);
    t.set(x, 1, (x & 1) ? NAVY : K); t.set(x, 30, (x & 1) ? NAVY : K);
    t.set(x, 3, NAVY); t.set(x, 28, NAVY);
    if (mod(x, 8) === 4) { t.set(x, 4, VIOLET); t.set(x, 27, VIOLET); }
  }
  for (let i = 0; i < 8; i++) {
    const g = new Pix(128, 32, 0);
    const ox = i * 16 + 4; const oy = 7;
    for (const [a, b, c, d] of RUNES[i]) g.line(ox + a * 2, oy + b * 2, ox + c * 2, oy + d * 2, 1);
    const yellow = (i & 1) === 0;
    for (let y = 5; y < 27; y++) for (let x = i * 16; x < i * 16 + 16; x++) {
      if (g.get(x, y)) { t.set(x, y, yellow ? YEL : VIOLET); continue; }
      let near = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!g.get(x + dx, y + dy)) continue;
        near = Math.max(near, Math.abs(dx) + Math.abs(dy) <= 1 ? 2 : Math.max(Math.abs(dx), Math.abs(dy)) <= 1 ? 1.5 : 1);
      }
      if (near === 2) t.set(x, y, yellow ? SAND : VIOLET);
      else if (near === 1.5) t.set(x, y, yellow ? BROWN : NAVY);
      else if (near === 1 && ((x + y) & 1)) t.set(x, y, yellow ? MAROON : NAVY);
    }
    const [a, b] = RUNES[i][0];
    t.set(ox + a * 2, oy + b * 2, WHITE);
    const sx = i * 16 + 15; t.set(sx, 15, VIOLET); t.set(sx, 16, VIOLET);
  }
  return t;
}

function water() {
  const t = new Pix(64, 64);
  t.fill((x, y) => {
    const n = fbm(t, x, y, 4, 2, 251);
    const w1 = Math.sin(((x + 2 * y) * Math.PI * 2) / 64 * 2 + n * 5);
    const w2 = Math.sin(((3 * x - y) * Math.PI * 2) / 64 + n * 3);
    const v = 0.56 + 0.22 * w1 + 0.14 * w2 + (hash(x, y, 252) - 0.5) * 0.08;
    const rip = Math.sin((y + 2 * Math.sin((x * Math.PI * 2) / 32 + Math.floor(y / 8))) * (Math.PI / 4));
    if (rip > 0.92 && vnoise(t, x, y, 8, 253) > 0.45) return hash(x, y, 254) < 0.2 ? WHITE : SKY;
    if (rip < -0.95 && vnoise(t, x, y, 8, 255) > 0.5) return NAVY;
    return ramp(v, [NAVY, BLUE, TEAL], x, y);
  });
  return t;
}

function gold() {
  const t = new Pix(64, 64);
  t.fill((x, y) => ramp(0.3 + (hash(x, y, 261) - 0.5) * 0.4, [K, MAROON, BROWN], x, y));
  const r = rng(262);
  const coins = [];
  for (let i = 0; i < 150; i++) coins.push([r() * 64, r() * 64, r()]);
  coins.sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, k] of coins) {
    const upright = k < 0.12;
    const rx = upright ? 1.6 : 3.6; const ry = upright ? 3.4 : 2.4;
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx; const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      let c;
      if (d > 0.55) c = dy > 0.3 || dx > 0.6 ? BROWN : dx + dy < -0.5 ? YEL : SAND;
      else if (d > 0.3) c = dx + dy < 0 ? SAND : YEL;
      else c = YEL;
      t.set(x, y, c);
    }
    t.set(cx + rx * 0.2, cy + ry + 0.2, MAROON);
    if (k > 0.82) { t.set(cx - 1, cy - 1, WHITE); t.set(cx - 2, cy - 1, YEL); }
  }
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(r() * 64); const y = Math.floor(r() * 64);
    const g = (i % 2 ? RED : BLUE).toString(16);
    t.stamp([`.${g}.`, `${g}e${g}`, `${g}${g}0`, '.0.'], x, y);
  }
  return t;
}

const MAKERS = {
  heath, marsh, volcanic, snow, forest, desert, ash, road, cobble, stonewall, barrowwall, barrowfloor,
  barrowceil, obsidian, spirewall, spirefloor, wood, door, thatch, rooftile, canvas: canvasTex, marble,
  grassmound, runeband, water, gold,
};

export function makeTexture(name) {
  const make = MAKERS[name];
  if (!make) throw new Error(`makeTexture: unknown texture '${name}'`);
  const t = make();
  const spec = TEXTURE_SPECS[name];
  if (t.w !== spec.w || t.h !== spec.h) throw new Error(`makeTexture: ${name} is ${t.w}x${t.h}`);
  return t.toCanvas();
}

/* ------------------------------------------------------------ backdrop */

// Distant mountains: a paler far range behind a darker near range. Each peak
// is a cone drawn back to front: lit on its left face, shadowed on its right,
// with rock ribs running down the slopes and a ragged snow cap. Clear above
// the ridge line, solid below, and the left and right edges meet.
export function makeBackdrop() {
  const W = 1024; const H = 192;
  const t = new Pix(W, H, CLEAR);
  const wrapDx = (a, b) => { let d = a - b; if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };
  const n1 = (u, seed, cells) => vnoise(t, mod(u, W), 0, cells, seed);
  const ranges = [
    { seed: 301, count: 13, yMin: 20, yMax: 76, sl: [0.75, 1.15], far: true },
    { seed: 302, count: 17, yMin: 64, yMax: 116, sl: [0.6, 0.95], far: false },
  ];
  for (const R of ranges) {
    const r = rng(R.seed);
    const peaks = [];
    for (let i = 0; i < R.count; i++) {
      peaks.push({
        x: ((i + 0.15 + r() * 0.7) / R.count) * W,
        y: R.yMin + r() * (R.yMax - R.yMin),
        sl: R.sl[0] + r() * (R.sl[1] - R.sl[0]),
        sr: R.sl[0] + r() * (R.sl[1] - R.sl[0]),
        snow: 9 + r() * 15,
        lean: (r() - 0.5) * 0.5,
        s: 1 + Math.floor(r() * 9000),
      });
    }
    peaks.sort((a, b) => a.y - b.y);
    for (const p of peaks) {
      for (let x = 0; x < W; x++) {
        const dx = wrapDx(x + 0.5, p.x);
        const ax = Math.abs(dx);
        const edge = p.y + ax * (dx < 0 ? p.sl : p.sr) + (n1(x, p.s, 160) - 0.5) * 7 * Math.min(1, ax / 5) + (n1(x, p.s + 1, 400) - 0.5) * 3;
        if (edge >= H) continue;
        for (let y = Math.max(0, Math.ceil(edge)); y < H; y++) {
          const dy = y - p.y;
          const ridge = p.lean * dy + (n1(y, p.s + 2, 100) - 0.5) * 9 * Math.min(1, dy / 14);
          const lit = dx < ridge;
          // ribs and gullies fan out down the fall line from the summit
          const rib = n1((dx / (dy + 8)) * 90 + 512, p.s + 3, 300) * 0.75 + n1(x, p.s + 5, 300) * 0.25;
          const snowLine = p.y + p.snow + (n1(x, p.s + 4, 128) - 0.5) * 10;
          const isSnow = y < snowLine || (rib > 0.66 && y < p.y + p.snow * 2.3 && y < snowLine + 12);
          const top = y - edge < 1;
          let c;
          if (R.far) {
            if (isSnow) c = lit ? ramp(0.75 + (rib - 0.5) * 0.6, [SKY, LTGRY, WHITE], x, y) : ramp(0.3 + (rib - 0.5) * 0.5, [BLUE, SKY, LTGRY], x, y);
            else if (lit) c = ramp(0.5 + (rib - 0.5) * 0.7 - Math.max(0, y - 110) * 0.006, [NAVY, BLUE, SKY], x, y);
            else c = ramp(0.38 + (rib - 0.5) * 0.5 - Math.max(0, y - 110) * 0.006, [NAVY, BLUE, DKGRY], x, y);
            if (top) c = lit ? (isSnow ? WHITE : SKY) : (isSnow ? SKY : BLUE);
          } else {
            const fade = clamp((y - 140) / 44);
            if (isSnow) c = lit ? ramp(0.8 + (rib - 0.5) * 0.5, [VIOLET, LTGRY, WHITE], x, y) : ramp(0.35 + (rib - 0.5) * 0.5, [NAVY, VIOLET, LTGRY], x, y);
            else if (lit) c = ramp(0.55 + (rib - 0.5) * 0.7 - fade * 0.55, [K, NAVY, DKGRY, VIOLET], x, y);
            else c = ramp(0.42 + (rib - 0.5) * 0.5 - fade * 0.4, [K, NAVY, DKGRY], x, y);
            if (top) c = lit ? (isSnow ? WHITE : VIOLET) : (isSnow ? LTGRY : NAVY);
          }
          t.set(x, y, c);
        }
      }
    }
  }
  t.fill((x, y, c) => {
    if (y > 184) return K;
    if (y > 176) return (x + y) & 1 ? K : NAVY;
    return c === CLEAR && y > 150 ? K : null;
  });
  return t.toCanvas();
}
