// Obsidian Spire - modern illustrations, foes set A.
// Painted vector illustrations (SVG strings) for the modern first-person mode:
// brigand, dire wolf, Gloom Hound, wraith, barrow-wight, the Barrow King and the
// giant forest spider. They redraw the pixel-art characters of ../sprites-foes.js
// and ../sprites-beasts.js at high resolution.
//
// Shared style: warm key light from the upper left (#ffd9a0), a thin cool rim
// light on right-hand edges (#9fc4ff), a 2px dark umber outline on the outer
// silhouette only, soft volume shading per part and a fine grain clipped to the
// figure. Every id is prefixed with `<key>-<frame>-`.
//
// Export: ART_FOES_A = { key: { w, h, height, frames: { idle, attack } } } where
// each frame is a complete standalone SVG string.

const OUT = '#1a1210';
const KEY = '#ffd9a0';
const RIM = '#9fc4ff';

// ---------------------------------------------------------------- geometry
const r1 = (n) => Math.round(n * 10) / 10;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth path through points (Catmull-Rom as cubic Beziers). A point is
// [x, y] or [x, y, t]; t scales the tangent there (0 = sharp corner).
function sm(pts, closed = true) {
  const n = pts.length;
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const t1 = (p1[2] ?? 1) / 6, t2 = (p2[2] ?? 1) / 6;
    d += `C${r1(p1[0] + (p2[0] - p0[0]) * t1)} ${r1(p1[1] + (p2[1] - p0[1]) * t1)} ` +
      `${r1(p2[0] - (p3[0] - p1[0]) * t2)} ${r1(p2[1] - (p3[1] - p1[1]) * t2)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

// Straight polygon / polyline.
function poly(pts, closed = true) {
  return 'M' + pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L') + (closed ? 'Z' : '');
}

// A ribbon of varying width along a centre line [[x, y, width], ...]: limbs,
// tails, blades of cloth. A zero width at an end makes a point; otherwise the
// end is capped round (cap scales how far the cap bulges).
function rib(pts, cap0 = 1, cap1 = 1) { return sm(ribPts(pts, cap0, cap1), true); }
function ribPts(pts, cap0 = 1, cap1 = 1) {
  const n = pts.length;
  const L = [], R = [];
  const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m]; };
  for (let i = 0; i < n; i++) {
    const [tx, ty] = dir(pts[Math.max(0, i - 1)], pts[Math.min(n - 1, i + 1)]);
    const [x, y, w] = pts[i];
    const h = w / 2;
    if (w === 0) { L.push([x, y, 0]); R.push(null); continue; }
    L.push([x - ty * h, y + tx * h]);
    R.push([x + ty * h, y - tx * h]);
  }
  const out = [];
  const [ax, ay] = dir(pts[0], pts[1]);
  const [bx, by] = dir(pts[n - 2], pts[n - 1]);
  for (let i = 0; i < n; i++) out.push(L[i]);
  const e = pts[n - 1];
  if (e[2] > 0 && cap1) out.push([e[0] + bx * e[2] * 0.5 * cap1, e[1] + by * e[2] * 0.5 * cap1]);
  for (let i = n - 1; i >= 0; i--) if (R[i]) out.push(R[i]);
  const s = pts[0];
  if (s[2] > 0 && cap0) out.push([s[0] - ax * s[2] * 0.5 * cap0, s[1] - ay * s[2] * 0.5 * cap0]);
  return out;
}

// Tufted outline: a control polygon whose edges sprout pointed tufts. Point
// [x, y, t, amp] - amp is the tuft size on the edge from this point to the
// next (0 or missing = smooth edge). lean tilts tufts along the edge.
function tuft(pts, { n = 3, lean = 0.5, seed = 1, jit = 0.5, closed = true, def = 0 } = {}) {
  const R = rng(seed);
  const N = pts.length;
  let area = 0;
  for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; area += a[0] * b[1] - b[0] * a[1]; }
  const o = area > 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < (closed ? N : N - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % N];
    out.push([a[0], a[1], a[2] ?? 1]);
    const amp = a[3] ?? def;
    if (!amp) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const tx = dx / L, ty = dy / L, nx = ty * o, ny = -tx * o;
    const m = Math.max(1, Math.round((L / amp) * n / 3));
    let u = 0;
    for (let k = 0; k < m; k++) {
      const step = (1 / (m + 0.5)) * (0.6 + R() * 0.8);
      const ut = Math.min(0.97, u + step * (0.35 + R() * 0.3));
      const h = amp * (1 - jit + R() * jit) * (R() < 0.15 ? 1.5 : 1);
      const ln = lean * (0.6 + R() * 0.8);
      out.push([a[0] + dx * ut + nx * h + tx * ln * h, a[1] + dy * ut + ny * h + ty * ln * h, 0]);
      u = Math.min(0.98, u + step);
      if (k < m - 1 || u < 0.9) out.push([a[0] + dx * u - nx * h * 0.12, a[1] + dy * u - ny * h * 0.12, 0.7]);
      if (u >= 0.98) break;
    }
  }
  return closed ? sm(out, true) : sm(out, false);
}

// A ribbon with separate half-widths on each side: knots [x, y, left, right]
// (left is the side to the left of travel). Returns { d, pts }.
function rib2(pts) {
  const n = pts.length, L = [], R = [];
  const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m]; };
  for (let i = 0; i < n; i++) {
    const [tx, ty] = dir(pts[Math.max(0, i - 1)], pts[Math.min(n - 1, i + 1)]);
    const [x, y, l, r] = pts[i];
    L.push([x - ty * l, y + tx * l]);
    R.push([x + ty * r, y - tx * r]);
  }
  const [ax, ay] = dir(pts[0], pts[1]), [bx, by] = dir(pts[n - 2], pts[n - 1]);
  const e = pts[n - 1], s0 = pts[0];
  const out = [...L, [e[0] + bx * (e[2] + e[3]) * 0.35, e[1] + by * (e[2] + e[3]) * 0.35], ...R.reverse(), [s0[0] - ax * (s0[2] + s0[3]) * 0.3, s0[1] - ay * (s0[2] + s0[3]) * 0.3]];
  return { d: sm(out), pts: out };
}

// Ellipse as a path.
function ell(cx, cy, rx, ry, rot = 0) {
  const a = (rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    const x = Math.cos(t) * rx, y = Math.sin(t) * ry;
    pts.push([cx + x * ca - y * sa, cy + x * sa + y * ca, 1.1]);
  }
  return sm(pts, true);
}

// Rotate / move a point list.
function xf(pts, { dx = 0, dy = 0, rot = 0, cx = 0, cy = 0, sx = 1, sy = 1 } = {}) {
  const a = (rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  return pts.map(([x, y, ...rest]) => {
    const X = (x - cx) * sx, Y = (y - cy) * sy;
    return [cx + X * ca - Y * sa + dx, cy + X * sa + Y * ca + dy, ...rest];
  });
}
const lerp = (a, b, t) => a + (b - a) * t;
const mix2 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

// A near-black lifted toward warm umber (#2a1a12): shadows are never pure black.
function warmDark(hex) {
  const v = hex.length === 4 ? hex.slice(1).split('').map((ch) => parseInt(ch + ch, 16)) : [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const u = [0x2a, 0x1a, 0x12];
  return '#' + v.map((c, i) => Math.round(c * 0.35 + u[i] * 0.65).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- SVG context
class Ctx {
  constructor(key, frame, w, h, seed = 1) {
    this.p = `${key}-${frame}-`;
    this.w = w;
    this.h = h;
    this.defs = [];
    this.n = 0;
    this.cache = {};
    this.rand = rng(seed);
  }
  nid(s = 'd') { return `${this.p}${s}${this.n++}`; }
  stops(st) {
    return st.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('');
  }
  // Linear gradient in the shape's bounding box (default: upper left to lower right).
  lg(st, x1 = 0.2, y1 = 0, x2 = 0.8, y2 = 1) {
    const id = this.nid('lg');
    this.defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${this.stops(st)}</linearGradient>`);
    return `url(#${id})`;
  }
  lgU(st, x1, y1, x2, y2) {
    const id = this.nid('lu');
    this.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}">${this.stops(st)}</linearGradient>`);
    return `url(#${id})`;
  }
  rg(st, cx = 0.4, cy = 0.35, r = 0.75, fx = cx, fy = cy) {
    const id = this.nid('rg');
    this.defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}">${this.stops(st)}</radialGradient>`);
    return `url(#${id})`;
  }
  rgU(st, cx, cy, r, fx = cx, fy = cy) {
    const id = this.nid('ru');
    this.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fx="${r1(fx)}" fy="${r1(fy)}">${this.stops(st)}</radialGradient>`);
    return `url(#${id})`;
  }
  clip(d) {
    const id = this.nid('cp');
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return `url(#${id})`;
  }
  // Content clipped to a path.
  inside(d, content) { return `<g clip-path="${this.clip(d)}">${content}</g>`; }
  region() { return `filterUnits="userSpaceOnUse" x="${-this.w}" y="${-this.h}" width="${this.w * 3}" height="${this.h * 3}"`; }
  blur(s) {
    const k = `b${s}`;
    if (!this.cache[k]) {
      const id = `${this.p}blur${String(s).replace('.', '_')}`;
      this.defs.push(`<filter id="${id}" ${this.region()}><feGaussianBlur stdDeviation="${s}"/></filter>`);
      this.cache[k] = `url(#${id})`;
    }
    return this.cache[k];
  }
  // Volume for one part, painted: a warm core shadow on the lower-right side,
  // warm light reflected up into the underside, a key-light band on upper-left
  // edges and an optional mottled glaze of the material.
  vol({ k = 6, b = 4, sc = '#2a1a12', so = 0.55, hc = KEY, ho = 0.28, tex = 0, tf = 0.05, tc = '#2a1a12', seed = 3, rc = '#c8784a', ro = 0.2 } = {}) {
    if (/^#0|^#1[0-9a-f]/i.test(sc)) sc = warmDark(sc);
    if (/^#0|^#1[0-9a-f]/i.test(tc)) tc = warmDark(tc);
    const key = `v${k}|${b}|${sc}|${so}|${hc}|${ho}|${tex}|${tf}|${tc}|${seed}|${rc}|${ro}`;
    if (!this.cache[key]) {
      const id = this.nid('vol');
      let t = '';
      let tm = '';
      if (tex) {
        t = `<feTurbulence type="fractalNoise" baseFrequency="${r1(tf * 0.6 * 1000) / 1000}" numOctaves="2" seed="${seed}" result="tn"/>` +
          `<feColorMatrix in="tn" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.6 0 0 0 -1.15" result="ta"/>` +
          `<feFlood flood-color="${tc}" flood-opacity="${tex}"/><feComposite in2="ta" operator="in" result="tb"/>` +
          `<feComposite in="tb" in2="SourceAlpha" operator="in" result="tex"/>`;
        tm = '<feMergeNode in="tex"/>';
      }
      const rk = Math.max(3, k * 0.6);
      const kk = k * 1.6, so2 = Math.min(0.85, so * 1.25);
      this.defs.push(`<filter id="${id}" ${this.region()} color-interpolation-filters="sRGB">` +
        t +
        `<feOffset in="SourceAlpha" dx="${r1(-kk)}" dy="${r1(-kk)}" result="o1"/>` +
        `<feComposite in="SourceAlpha" in2="o1" operator="out" result="s1"/>` +
        `<feGaussianBlur in="s1" stdDeviation="${r1(b * 1.5)}" result="s2"/>` +
        `<feComposite in="s2" in2="SourceAlpha" operator="in" result="s3"/>` +
        `<feFlood flood-color="${sc}" flood-opacity="${r1(so2 * 100) / 100}"/><feComposite in2="s3" operator="in" result="sh"/>` +
        `<feOffset in="SourceAlpha" dx="0" dy="${-rk}" result="o3"/>` +
        `<feComposite in="SourceAlpha" in2="o3" operator="out" result="r1"/>` +
        `<feGaussianBlur in="r1" stdDeviation="${rk * 0.5}" result="r2"/>` +
        `<feComposite in="r2" in2="SourceAlpha" operator="in" result="r3"/>` +
        `<feFlood flood-color="${rc}" flood-opacity="${ro}"/><feComposite in2="r3" operator="in" result="rf"/>` +
        `<feOffset in="SourceAlpha" dx="${k * 0.8}" dy="${k * 0.9}" result="o2"/>` +
        `<feComposite in="SourceAlpha" in2="o2" operator="out" result="h1"/>` +
        `<feGaussianBlur in="h1" stdDeviation="${b * 0.75}" result="h2"/>` +
        `<feComposite in="h2" in2="SourceAlpha" operator="in" result="h3"/>` +
        `<feFlood flood-color="${hc}" flood-opacity="${ho}"/><feComposite in2="h3" operator="in" result="hi"/>` +
        `<feMerge><feMergeNode in="SourceGraphic"/>${tm}<feMergeNode in="sh"/><feMergeNode in="rf"/><feMergeNode in="hi"/></feMerge></filter>`);
      this.cache[key] = `url(#${id})`;
    }
    return this.cache[key];
  }
  // The whole-figure finish, painted rather than inked: no outline. A warm
  // point light from the upper left models the big value masses; edges turned
  // away from the light (lower right) dissolve softly while lit edges stay
  // crisp ("lost and found"); a cool rim from behind on the right, a warm key
  // band on upper-left edges, warm light bounced up from below and a faint
  // grain (the paint pass supplies texture).
  fx({ rim = 0.75, key = 0.24, grain = 0.03, seed = 7, lx = null, ly = null, lz = null, kd = 1.38, soft = 1.6, bounce = 0.16 } = {}) {
    const k = `fx${rim}|${key}|${grain}|${lx}|${ly}|${lz}|${kd}|${soft}|${bounce}`;
    if (!this.cache[k]) {
      const id = this.nid('fx');
      const LX = lx ?? -this.w * 0.2, LY = ly ?? -this.h * 0.25, LZ = lz ?? Math.max(this.w, this.h) * 0.72;
      this.defs.push(`<filter id="${id}" ${this.region()} color-interpolation-filters="sRGB">` +
        // big value design: warm light pooling on the upper left, warm umber falloff
        `<feDiffuseLighting in="SourceAlpha" surfaceScale="0" diffuseConstant="${kd}" lighting-color="#fff0dc" result="lt"><fePointLight x="${r1(LX)}" y="${r1(LY)}" z="${r1(LZ)}"/></feDiffuseLighting>` +
        `<feComponentTransfer in="lt" result="lt2"><feFuncR type="linear" slope="0.95" intercept="0.06"/><feFuncG type="linear" slope="1" intercept="0.02"/><feFuncB type="linear" slope="1.05" intercept="-0.04"/></feComponentTransfer>` +
        `<feBlend in="SourceGraphic" in2="lt2" mode="multiply" result="lit0"/>` +
        `<feColorMatrix in="lit0" type="saturate" values="1.15" result="lit1"/>` +
        `<feComponentTransfer in="lit1" result="lit2"><feFuncR type="gamma" amplitude="1.04" exponent="1.22" offset="0.005"/><feFuncG type="gamma" amplitude="1.02" exponent="1.25" offset="0"/><feFuncB type="gamma" amplitude="1" exponent="1.3" offset="0"/></feComponentTransfer>` +
        `<feComposite in="lit2" in2="SourceAlpha" operator="in" result="lit"/>` +
        // lost edges: the shadow-side contour band is replaced by a softened copy
        `<feOffset in="SourceAlpha" dx="-5" dy="-5" result="lo"/>` +
        `<feComposite in="SourceAlpha" in2="lo" operator="out" result="lb"/>` +
        `<feMorphology in="lb" operator="dilate" radius="2" result="lb2"/>` +
        `<feGaussianBlur in="lb2" stdDeviation="1.5" result="lmask"/>` +
        `<feGaussianBlur in="lit" stdDeviation="${soft}" result="lsoft"/>` +
        `<feComposite in="lsoft" in2="lmask" operator="in" result="lost"/>` +
        `<feComposite in="lit" in2="lmask" operator="out" result="found"/>` +
        `<feMerge result="body"><feMergeNode in="lost"/><feMergeNode in="found"/></feMerge>` +
        // cool rim from behind on the right
        `<feOffset in="SourceAlpha" dx="-4" dy="2" result="ro"/>` +
        `<feComposite in="SourceAlpha" in2="ro" operator="out" result="ra"/>` +
        `<feGaussianBlur in="ra" stdDeviation="1.4" result="rb"/>` +
        `<feComposite in="rb" in2="SourceAlpha" operator="in" result="rc"/>` +
        `<feFlood flood-color="${RIM}" flood-opacity="${rim}"/><feComposite in2="rc" operator="in" result="rim"/>` +
        // warm key band on the upper-left edges
        `<feOffset in="SourceAlpha" dx="9" dy="10" result="ko"/>` +
        `<feComposite in="SourceAlpha" in2="ko" operator="out" result="ka"/>` +
        `<feGaussianBlur in="ka" stdDeviation="4.5" result="kb"/>` +
        `<feComposite in="kb" in2="SourceAlpha" operator="in" result="kc"/>` +
        `<feFlood flood-color="${KEY}" flood-opacity="${key}"/><feComposite in2="kc" operator="in" result="key"/>` +
        // warm light reflected up from the ground into the undersides
        `<feOffset in="SourceAlpha" dx="0" dy="-7" result="bo"/>` +
        `<feComposite in="SourceAlpha" in2="bo" operator="out" result="ba"/>` +
        `<feGaussianBlur in="ba" stdDeviation="3" result="bb"/>` +
        `<feComposite in="bb" in2="SourceAlpha" operator="in" result="bc"/>` +
        `<feFlood flood-color="#d0844e" flood-opacity="${bounce}"/><feComposite in2="bc" operator="in" result="bnc"/>` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="${seed}" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.1  0 0 0 0 0.07  -4 0 0 0 2.1" result="nd"/>` +
        `<feComposite in="nd" in2="SourceAlpha" operator="in" result="nc"/>` +
        `<feComponentTransfer in="nc" result="grain"><feFuncA type="linear" slope="${grain}"/></feComponentTransfer>` +
        `<feMerge><feMergeNode in="body"/><feMergeNode in="key"/><feMergeNode in="bnc"/><feMergeNode in="rim"/><feMergeNode in="grain"/></feMerge></filter>`);
      this.cache[k] = `url(#${id})`;
    }
    return this.cache[k];
  }
  // Glazes: overlapping translucent irregular patches of the given colours,
  // softened, to be clipped to a part (`inside(part, c.glaze(...))`). Builds
  // form and colour variation the way layered oil glazes do.
  glaze({ x0, y0, x1, y1, n = 10, cols, op = 0.22, size = 40, b = 6, bias = null }) {
    const R = this.rand;
    let s = '';
    for (let i = 0; i < n; i++) {
      let x = lerp(x0, x1, R()), y = lerp(y0, y1, R());
      if (bias) [x, y] = bias(x, y, R);
      const r = size * (0.5 + R() * 0.8), m = 5 + Math.floor(R() * 3), pts = [];
      const rot = R() * Math.PI;
      for (let j = 0; j < m; j++) {
        const t = rot + (j / m) * Math.PI * 2, rr = r * (0.55 + R() * 0.6);
        pts.push([x + Math.cos(t) * rr, y + Math.sin(t) * rr * (0.6 + R() * 0.5)]);
      }
      s += `<path d="${sm(pts)}" fill="${cols[Math.floor(R() * cols.length)]}" opacity="${r1(op * (0.5 + R()) * 100) / 100}"/>`;
    }
    return `<g filter="${this.blur(b)}">${s}</g>`;
  }
  // Brush strokes: long tapered strokes following a direction field, at least
  // ~5px wide so they survive the paint pass.
  strokes(o) { return this.clumps({ w: 7, len: 34, lv: 0.6, spread: 10, bend: 0.2, op: 0.4, ...o }); }
  // Fine strands (fur, hair, bristles, fibres) scattered over a box, each a
  // short curved stroke at angle a (degrees) +- spread.
  strands({ x0, y0, x1, y1, n, a = 90, spread = 20, len = 14, lv = 0.4, w = 1.2, cols, op = 0.6, curl = 0.25, field }) {
    let s = '';
    const R = this.rand;
    for (let i = 0; i < n; i++) {
      const x = lerp(x0, x1, R()), y = lerp(y0, y1, R());
      let ang = a + (R() - 0.5) * 2 * spread;
      if (field) ang = field(x, y) + (R() - 0.5) * 2 * spread;
      const L = len * (1 - lv / 2 + R() * lv);
      const rad = (ang * Math.PI) / 180;
      const ex = x + Math.cos(rad) * L, ey = y + Math.sin(rad) * L;
      const cu = (R() - 0.5) * 2 * curl * L;
      const mx = (x + ex) / 2 - Math.sin(rad) * cu, my = (y + ey) / 2 + Math.cos(rad) * cu;
      const col = cols[Math.floor(R() * cols.length)];
      s += `<path d="M${r1(x)} ${r1(y)}Q${r1(mx)} ${r1(my)} ${r1(ex)} ${r1(ey)}" stroke="${col}" stroke-width="${r1(w * (0.7 + R() * 0.6))}" opacity="${r1(op * (0.5 + R() * 0.5) * 100) / 100}"/>`;
    }
    return `<g fill="none" stroke-linecap="round">${s}</g>`;
  }
  // Painterly fur clumps: tapered, slightly bent leaf strokes following an
  // angle (or a field(x, y) -> degrees), scattered over a box.
  clumps({ x0, y0, x1, y1, n, a = 90, spread = 15, len = 22, lv = 0.5, w = 7, cols, op = 0.5, bend = 0.25, field, keep }) {
    let s = '';
    const R = this.rand;
    for (let i = 0; i < n; i++) {
      const x = lerp(x0, x1, R()), y = lerp(y0, y1, R());
      if (keep && !keep(x, y)) { R(); R(); R(); R(); R(); continue; }
      const ang = ((field ? field(x, y) : a) + (R() - 0.5) * 2 * spread) * Math.PI / 180;
      const L = len * (1 - lv / 2 + R() * lv), W = w * (0.6 + R() * 0.7), b = (R() - 0.5) * 2 * bend;
      const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
      const tx = x + ux * L + vx * b * L, ty = y + uy * L + vy * b * L;
      const c1x = x + ux * L * 0.45 + vx * (W * 0.5 + b * L * 0.4), c1y = y + uy * L * 0.45 + vy * (W * 0.5 + b * L * 0.4);
      const c2x = x + ux * L * 0.45 + vx * (-W * 0.5 + b * L * 0.4), c2y = y + uy * L * 0.45 + vy * (-W * 0.5 + b * L * 0.4);
      const col = cols[Math.floor(R() * cols.length)];
      s += `<path d="M${r1(x + vx * W / 2)} ${r1(y + vy * W / 2)}Q${r1(c1x)} ${r1(c1y)} ${r1(tx)} ${r1(ty)}Q${r1(c2x)} ${r1(c2y)} ${r1(x - vx * W / 2)} ${r1(y - vy * W / 2)}Z" fill="${col}" opacity="${r1(op * (0.55 + R() * 0.45) * 100) / 100}"/>`;
    }
    return `<g>${s}</g>`;
  }
}

// Path helpers that return SVG elements.
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
const S = (d, stroke, w, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`;
const G = (content, extra = '') => `<g${extra ? ' ' + extra : ''}>${content}</g>`;

function wrapSvg(c, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}"><defs>${c.defs.join('')}</defs>${body}</svg>`;
  // no pure blacks: any colour darker than #141414 becomes a warm deep umber
  return svg.replace(/(fill|stroke|stop-color|flood-color)="(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})"/g, (m, attr, hex) => {
    const v = hex.length === 4 ? hex.slice(1).split('').map((ch) => parseInt(ch + ch, 16)) : [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(...v) < 0x14 ? `${attr}="${warmDark(hex)}"` : m;
  });
}

// A faint atmospheric halo (behind the head or shoulders), outside the figure.
function halo(c, x, y, rx, ry, col = '#ffd9a0', op = 0.18) {
  return `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${c.rg([[0, col, op], [0.55, col, op * 0.45], [1, col, 0]], 0.5, 0.5, 0.5)}"/>`;
}

// Soft shading blob clipped to a part: `inside(part, blob(...))`.
function blob(c, d, fill, b, op = 1) {
  return `<path d="${d}" fill="${fill}" filter="${c.blur(b)}"${op !== 1 ? ` opacity="${op}"` : ''}/>`;
}
function line(c, d, stroke, w, b, op = 1) {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"${b ? ` filter="${c.blur(b)}"` : ''}${op !== 1 ? ` opacity="${op}"` : ''}/>`;
}

// A metal blade between hilt point h and tip t (width w at the hilt): bevelled
// steel with a fuller, a bright edge and optional notches.
function blade(c, h, t, w, { notches = [], fuller = true, rust = 0, gleam = 0.5 } = {}) {
  const dx = t[0] - h[0], dy = t[1] - h[1], L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const at = (s, o) => [h[0] + ux * s + nx * o, h[1] + uy * s + ny * o];
  const half = w / 2;
  const left = [], right = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * L * 0.86;
    const wi = half * (1 - (i / steps) * 0.18);
    let cutL = 0, cutR = 0;
    for (const nt of notches) if (Math.abs(nt.s * L - s) < L / steps / 2) { if (nt.side < 0) cutL = nt.d; else cutR = nt.d; }
    left.push(at(s, wi - cutL));
    right.push(at(s, -wi + cutR));
  }
  const tip = at(L, 0);
  const outline = poly([...left, tip, ...right.reverse()]);
  const edgeL = poly([at(0, half * 0.15), ...left.slice(1).map((p, i) => at((i + 1) / steps * L * 0.86, half * 0.2)), tip], false);
  const gL = c.lgU([[0, '#f4f7f8'], [0.45, '#b9c3c9'], [0.55, '#5d6870'], [1, '#2c3238']], ...at(0, half), ...at(0, -half));
  let s = P(outline, gL);
  s += c.inside(outline,
    (fuller ? S(poly([at(L * 0.02, 0), at(L * 0.66, 0)], false), '#39424a', Math.max(1.5, w * 0.16), 'opacity="0.7"') +
      S(poly([at(L * 0.02, w * 0.1), at(L * 0.66, w * 0.08)], false), '#e9eef0', 1, 'opacity="0.6"') : '') +
    blob(c, poly([at(L * 0.55, half), at(L, 0), at(L * 0.55, -half)]), '#1d2328', 6, 0.35) +
    (rust ? c.strands({ x0: Math.min(h[0], t[0]) - w, y0: Math.min(h[1], t[1]) - w, x1: Math.max(h[0], t[0]) + w, y1: Math.max(h[1], t[1]) + w, n: Math.round(L / 6), a: 0, spread: 180, len: 6, w: 3, cols: ['#7a3d16', '#a0561c', '#5a2a10'], op: rust }) : '') +
    blob(c, poly([at(L * 0.12, half * 0.2), at(L * 0.35, half * 0.6), at(L * 0.28, half * 0.9)]), '#ffffff', 2, gleam));
  s += S(edgeL, '#ffffff', 1, 'opacity="0.5"');
  return s;
}

// Ambient occlusion: a blurred, offset copy of the caster, clipped to the receiver.
function ao(c, recv, cast, dx, dy, b, op = 0.6, col = '#0a0604') {
  return c.inside(recv, `<path d="${cast}" transform="translate(${dx} ${dy})" fill="${col}" filter="${c.blur(b)}" opacity="${op}"/>`);
}

// A gloved fist around a grip; ang = direction of the grip axis toward the blade.
function fist(c, [x, y], ang, side, cols = ['#9a6438', '#5e361a', '#22120a']) {
  const R = (pts) => xf(pts, { rot: ang - 90, sx: side }).map(([px, py, ...r]) => [px + x, py + y, ...r]);
  const g = () => c.lg([[0, cols[0]], [0.55, cols[1]], [1, cols[2]]]);
  const back = sm(R([[-16, -12], [-6, -17], [4, -15], [6, 14], [-6, 16], [-16, 8]]));
  let s = P(back, g(), `filter="${c.vol({ k: 4, b: 3, so: 0.6, ho: 0.3 })}"`);
  // four curled fingers stacked along the grip, then the thumb over the first
  const fv = c.vol({ k: 2.5, b: 1.8, so: 0.6, ho: 0.35 });
  [[-11, 8], [-3.6, 7.8], [3.6, 7.2], [10.4, 6.4]].forEach(([fy, w], i) => {
    const d = rib(R([[-4, fy, w], [8, fy + 0.5, w], [14.5 - i * 0.6, fy + 1.2, w * 0.9]]));
    s += P(d, g(), `filter="${fv}"`);
  });
  s += P(rib(R([[-14, -10, 9], [-3, -15, 8.5], [7, -14, 7]])), g(), `filter="${fv}"`);
  // stitched cuff seam on the back of the glove
  const [q1, q2] = R([[-15, -2], [2, -4]]);
  s += c.inside(back, S(`M${r1(q1[0])} ${r1(q1[1])}L${r1(q2[0])} ${r1(q2[1])}`, '#d6a470', 1, 'stroke-dasharray="2 2" opacity="0.5"'));
  return s;
}

// ---------------------------------------------------------------- brigand
// Hooded bandit: green dagged hood, red kerchief mask, leather jerkin, a short
// sword in his right hand and a dagger in his left. attack: lunging, sword raised.
function brigand(c, A) {
  // The torso, hood and head are drawn in idle coordinates and moved as one piece.
  const T = A ? { dx: 16, dy: 36, rot: 8, cx: 240, cy: 330 } : { dx: 0, dy: 0, rot: 0, cx: 240, cy: 330 };
  const tp = (x, y) => xf([[x, y]], T)[0];
  const tr = `translate(${T.dx} ${T.dy}) rotate(${T.rot} ${T.cx} ${T.cy})`;
  const leather = { k: 7, b: 5, so: 0.6, ho: 0.22, tex: 0.3, tf: 0.05, tc: '#1c0d05', seed: 4 };
  const cloth = { k: 8, b: 6, so: 0.55, ho: 0.2, tex: 0.2, tf: 0.03, tc: '#0d0806', seed: 9 };

  // ----- legs
  const legs = A
    ? { l: { hip: [222, 374], knee: [168, 482], ank: [118, 598] }, r: { hip: [284, 372], knee: [338, 462], ank: [348, 598] } }
    : { l: { hip: [214, 334], knee: [207, 470], ank: [199, 598] }, r: { hip: [266, 334], knee: [275, 470], ank: [285, 598] } };
  const trouserFill = () => c.lg([[0, '#5d72a2'], [0.45, '#34446e'], [1, '#141a30']], 0.1, 0, 0.9, 0.7);
  const bootFill = () => c.lg([[0, '#a06a3a'], [0.45, '#61381a'], [1, '#24130a']], 0.1, 0, 0.9, 0.7);
  const leg = ({ hip, knee, ank }, side) => {
    const thighMid = mix2(hip, knee, 0.5);
    const thigh = rib([[hip[0], hip[1] - 14, 76], [thighMid[0] + side * 2, thighMid[1], 66], [knee[0], knee[1] + 8, 52]]);
    let s = P(thigh, trouserFill(), `filter="${c.vol(cloth)}"`);
    s += c.inside(thigh,
      line(c, sm([[hip[0] - 18 * side, hip[1] + 36], [thighMid[0] - 6 * side, thighMid[1] + 14], [knee[0] + 12 * side, knee[1] - 4]], false), '#0c1124', 4, 3, 0.75) +
      line(c, sm([[hip[0] + 14 * side, hip[1] + 10], [thighMid[0] + 16 * side, thighMid[1] + 4], [knee[0] + 16 * side, knee[1] - 20]], false), '#0c1124', 3, 2.5, 0.5) +
      line(c, sm([[hip[0] - 8, hip[1] + 24], [thighMid[0] - 2, thighMid[1] + 4]], false), '#8fa4d0', 3, 3, 0.35));
    const top = [knee[0], knee[1] + 18];
    const shaft = rib([[top[0], top[1], 54], [lerp(top[0], ank[0], 0.5), lerp(top[1], ank[1], 0.5), 47], [ank[0], ank[1], 44]]);
    const ax = ank[0];
    const foot = (A && side < 0)
      ? sm([[ax + 22, 596], [ax + 24, 640, 0], [ax - 62, 640, 0], [ax - 64, 628], [ax - 50, 614], [ax - 22, 600], [ax, 590]])
      : sm([[ax - 28, 606], [ax - 16, 594], [ax + 2, 590], [ax + 20, 594], [ax + 30, 608], [ax + 34 + side * 4, 640, 0], [ax - 34 + side * 4, 640, 0]]);
    s += P(foot, bootFill(), `filter="${c.vol(leather)}"`);
    s += P(shaft, bootFill(), `filter="${c.vol(leather)}"`);
    s += c.inside(shaft,
      line(c, sm([[ank[0] - 16, ank[1] - 10], [ank[0] + 2, ank[1] - 2], [ank[0] + 18, ank[1] - 12]], false), '#1a0c05', 4, 2.5, 0.55) +
      line(c, sm([[ank[0] - 10, ank[1] - 40], [ank[0] + 6, ank[1] - 34], [ank[0] + 16, ank[1] - 44]], false), '#1a0c05', 3, 2.5, 0.35) +
      line(c, sm([[top[0] - 12, top[1] + 30], [lerp(top[0], ank[0], 0.5) - 13, lerp(top[1], ank[1], 0.5)], [ank[0] - 12, ank[1] - 24]], false), '#d8a66e', 5, 3.5, 0.32));
    s += c.inside(foot, `<rect x="${ax - 90}" y="631" width="180" height="12" fill="#170c06"/>` +
      blob(c, ell(ax - 8 + (A && side < 0 ? -34 : 0), 606, 14, 7), '#e0a870', 5, 0.45));
    // turned-down cuff
    const cw = 64, ky = knee[1];
    const cuff = sm([[knee[0] - cw / 2, ky + 2], [knee[0], ky - 4], [knee[0] + cw / 2, ky + 2], [knee[0] + cw / 2 + 3, ky + 26, 0.4], [knee[0] + cw / 4, ky + 29], [knee[0], ky + 32], [knee[0] - cw / 4, ky + 29], [knee[0] - cw / 2 - 3, ky + 26, 0.4]]);
    s += ao(c, thigh, cuff, 0, -4, 5, 0.6);
    s += P(cuff, c.lg([[0, '#b07a48'], [0.55, '#6e4020'], [1, '#2a1508']], 0, 0, 1, 1), `filter="${c.vol({ ...leather, k: 5, b: 3 })}"`);
    s += c.inside(cuff,
      S(sm([[knee[0] - cw / 2 + 4, ky + 22], [knee[0], ky + 27], [knee[0] + cw / 2 - 4, ky + 22]], false), '#e2bb88', 1.2, 'stroke-dasharray="3 4" opacity="0.55"') +
      line(c, sm([[knee[0] - cw / 2, ky + 4], [knee[0], ky - 1], [knee[0] + cw / 2, ky + 4]], false), '#f0c890', 2, 1.5, 0.45));
    return s;
  };
  const seat = A ? sm([[220, 362], [290, 362], [298, 404], [252, 428], [212, 404]]) : sm([[212, 330], [270, 330], [262, 388], [240, 396], [220, 388]]);
  let legsSvg = P(seat, '#1a2240', `filter="${c.vol(cloth)}"`) + leg(legs.l, -1) + leg(legs.r, 1);

  // ----- torso (idle coordinates)
  const jerkin = sm([[178, 150], [240, 146], [302, 150], [322, 166], [322, 200], [310, 244], [299, 284], [297, 318, 0.5], [240, 326], [183, 318, 0.5], [181, 284], [170, 244], [158, 200], [158, 166]]);
  const skirtL = sm([[184, 310], [243, 316], [245, 364, 0], [212, 362], [178, 357, 0], [178, 334]]);
  const skirtR = sm([[237, 316], [296, 310], [302, 334], [302, 357, 0], [268, 362], [235, 364, 0]]);
  const jerkinFill = () => c.lg([[0, '#b98250'], [0.35, '#8a5a2e'], [0.75, '#583218'], [1, '#2a160a']], 0.15, 0, 0.85, 1);
  let torso = '';
  for (const sk of [skirtL, skirtR]) {
    torso += P(sk, jerkinFill(), `filter="${c.vol(leather)}"`);
  }
  torso += c.inside(skirtL, line(c, 'M212 326L212 364', '#1a0c05', 3, 1.5, 0.6) + S('M184 354L242 358', '#e0b888', 1.2, 'stroke-dasharray="3 4" opacity="0.5"'));
  torso += c.inside(skirtR, line(c, 'M268 326L268 364', '#1a0c05', 3, 1.5, 0.6) + S('M238 358L298 354', '#e0b888', 1.2, 'stroke-dasharray="3 4" opacity="0.5"'));
  torso += P(jerkin, jerkinFill(), `filter="${c.vol({ ...leather, k: 9, b: 7 })}"`);
  torso += c.inside(jerkin,
    c.glaze({ x0: 160, y0: 150, x1: 320, y1: 320, n: 12, cols: ['#c8884a', '#4a2410', '#8a5a2a', '#6a3a1a'], op: 0.25, size: 34, b: 7 }) +
    blob(c, sm([[196, 176], [226, 172], [230, 250], [206, 280], [186, 240]]), '#d7a066', 16, 0.32) +
    blob(c, sm([[262, 186], [310, 182], [306, 290], [272, 296]]), '#170a03', 16, 0.5) +
    blob(c, sm([[190, 258], [290, 258], [296, 300], [184, 300]]), '#170a03', 12, 0.25) +
    line(c, sm([[206, 160], [200, 232], [208, 312]], false), '#2a1508', 3, 1.2, 0.7) +
    line(c, sm([[274, 160], [280, 232], [272, 312]], false), '#2a1508', 3, 1.2, 0.7) +
    S(sm([[211, 162], [205, 232], [213, 310]], false), '#ecc896', 1.2, 'stroke-dasharray="3 4" opacity="0.55"') +
    S(sm([[269, 162], [275, 232], [267, 310]], false), '#ecc896', 1.2, 'stroke-dasharray="3 4" opacity="0.38"') +
    line(c, 'M240 200L240 302', '#140802', 5, 1.5, 0.85) +
    (() => {
      let l = '';
      for (let y = 214; y < 296; y += 13) {
        l += S(`M233 ${y}L247 ${y + 11}`, '#dcb47e', 2.2) + S(`M247 ${y}L233 ${y + 11}`, '#9e7848', 2.2);
        l += `<circle cx="231" cy="${y}" r="2.2" fill="#e9c888"/><circle cx="249" cy="${y}" r="2.2" fill="#b28a50"/>`;
      }
      return l;
    })() +
    // scuffs and creases of worn leather
    line(c, 'M190 214Q200 220 214 214', '#e8b884', 2, 1.5, 0.35) + line(c, 'M286 236Q296 242 306 236', '#170a03', 2, 1.5, 0.45) +
    line(c, 'M192 274Q204 268 216 276', '#170a03', 2, 1.2, 0.4));
  const belt = sm([[172, 298, 0.4], [240, 306], [308, 298, 0.4], [310, 321, 0.4], [240, 330], [170, 321, 0.4]]);
  torso += ao(c, sm([[150, 300], [330, 300], [330, 380], [150, 380]]), belt, 0, 7, 5, 0.65);
  torso += P(belt, c.lg([[0, '#6a4224'], [0.5, '#3a2010'], [1, '#140904']], 0, 0, 0.4, 1), `filter="${c.vol({ k: 3, b: 2, so: 0.5, ho: 0.3 })}"`);
  torso += c.inside(belt, S('M174 303Q240 312 306 303', '#cf9a64', 1, 'stroke-dasharray="3 3" opacity="0.6"') + S('M174 318Q240 327 306 318', '#cf9a64', 1, 'stroke-dasharray="3 3" opacity="0.4"'));
  const pouch = sm([[272, 322], [306, 318], [311, 348], [304, 364], [278, 366], [268, 348]]);
  torso += P(pouch, c.lg([[0, '#a6703e'], [1, '#3a200e']]), `filter="${c.vol({ ...leather, k: 5, b: 3 })}"`);
  torso += c.inside(pouch, P(sm([[270, 320], [308, 316], [310, 338, 0.5], [289, 344], [270, 338, 0.5]]), c.lg([[0, '#9a6234'], [1, '#4e2c14']])) +
    line(c, 'M270 340Q289 348 310 339', '#1a0c05', 3, 1.5, 0.7) + `<circle cx="290" cy="336" r="3.2" fill="#ecc470"/>`);
  torso += `<rect x="226" y="305" width="28" height="25" rx="5" fill="none" stroke="${c.lgU([[0, '#fff2b8'], [0.4, '#e2b04e'], [1, '#6e440e']], 226, 305, 254, 330)}" stroke-width="5"/>` +
    S('M240 309L240 326', '#c89a40', 3) + `<circle cx="232.5" cy="309.5" r="1.8" fill="#fff8e0"/>`;

  // ----- hood, mantle and face (idle coordinates)
  const hood = sm([[240, 16], [264, 20], [283, 38], [293, 64], [295, 96], [300, 120], [322, 134], [342, 150], [350, 168, 0],
    [336, 172], [330, 192, 0], [315, 182], [303, 204, 0], [289, 194], [276, 216, 0], [260, 204], [240, 230, 0], [220, 204], [204, 216, 0],
    [191, 194], [177, 204, 0], [165, 182], [150, 192, 0], [144, 172], [130, 168, 0], [138, 150], [158, 134], [180, 120], [185, 96], [187, 64], [197, 38], [216, 20]]);
  const opening = sm([[240, 36], [258, 41], [271, 58], [275, 84], [272, 110], [260, 126], [240, 132], [220, 126], [208, 110], [205, 84], [209, 58], [222, 41]]);
  let head = '';
  head += P(hood, c.lg([[0, '#93c060'], [0.3, '#548436'], [0.7, '#2c5022'], [1, '#12240e']], 0.15, 0, 0.85, 1), `filter="${c.vol({ ...cloth, k: 10, b: 8, ho: 0.3, tex: 0.28 })}"`);
  head += c.inside(hood,
    c.glaze({ x0: 130, y0: 16, x1: 350, y1: 230, n: 14, cols: ['#a8d070', '#2a4a18', '#6a9a3a', '#5a6a20'], op: 0.25, size: 40, b: 8 }) +
    c.strokes({ x0: 130, y0: 120, x1: 350, y1: 220, n: 26, a: 95, len: 40, w: 6, cols: ['#183010', '#7aaa48'], op: 0.35, field: (x) => 90 + (x - 240) * 0.25 }) +
    line(c, sm([[260, 22], [284, 58], [292, 110]], false), '#b4d878', 4, 4, 0.3) +
    line(c, sm([[216, 24], [198, 52], [192, 100]], false), '#e0f4b0', 5, 4, 0.32) +
    line(c, sm([[182, 128], [172, 158], [164, 184]], false), '#0a1606', 5, 4, 0.6) +
    line(c, sm([[204, 146], [200, 174], [194, 196]], false), '#0a1606', 4, 3, 0.5) +
    line(c, sm([[280, 146], [288, 172], [296, 194]], false), '#0a1606', 4, 3, 0.55) +
    line(c, sm([[304, 128], [320, 156], [330, 186]], false), '#0a1606', 5, 4, 0.6) +
    line(c, sm([[226, 150], [224, 186], [226, 210]], false), '#a8d076', 3, 3, 0.3) +
    line(c, sm([[156, 148], [148, 168]], false), '#d4f0a0', 3, 3, 0.35) +
    blob(c, opening, '#050803', 7, 0.55) +
    S(sm([[136, 164], [152, 184], [172, 196], [190, 190], [206, 210], [240, 224], [274, 210], [292, 190], [314, 180], [332, 186], [346, 164]], false), '#d4e49a', 1.2, 'stroke-dasharray="3 4" opacity="0.32"'));
  head += P(opening, c.rg([[0, '#2a1a12'], [0.7, '#120a06'], [1, '#060403']], 0.5, 0.65, 0.6));
  // the hood's rolled, stitched edge round the face
  head += S(opening, c.lgU([[0, '#a8d070'], [0.45, '#4e7e32'], [1, '#16280e']], 200, 40, 280, 136), 7) + S(opening, '#0a1406', 1.5, 'opacity="0.5" transform="translate(1.5 2)"') +
    S(opening, '#d4e49a', 1, 'stroke-dasharray="3 4" opacity="0.35"');
  const face = sm([[240, 46], [256, 51], [266, 66], [268, 88], [263, 110], [251, 124], [240, 127], [229, 124], [217, 110], [212, 88], [214, 66], [224, 51]]);
  head += P(face, c.rg([[0, '#e2a882'], [0.45, '#b06e4a'], [0.85, '#6a3a26'], [1, '#3a1e0e']], 0.36, 0.62, 0.7));
  head += c.inside(face,
    // brow ridge, cheekbones and the shadow of the hood across the forehead
    blob(c, ell(222, 98, 10, 6), '#f4bc94', 4, 0.7) + blob(c, ell(226, 76, 12, 4), '#e8a880', 3, 0.5) +
    blob(c, ell(262, 99, 8, 5), '#4a2214', 4, 0.55) +
    blob(c, 'M237 82L243 82L244 100L236 100Z', '#f2c49c', 2.2, 0.5) +
    blob(c, ell(227, 86, 15, 9), '#2a120a', 3.5, 0.75) + blob(c, ell(253, 86, 15, 9), '#2a1208', 3.5, 0.85) +
    blob(c, 'M196 28L284 28L284 68Q262 60 240 64Q218 60 196 70Z', '#0c0503', 6, 0.82) +
    blob(c, 'M254 40L284 40L284 128L260 128Z', '#1a0a04', 9, 0.6) +
    // locks of dark hair falling from under the hood
    P(sm([[212, 50], [228, 46], [226, 54], [220, 68], [216, 82, 0], [213, 66]]), '#170b05') +
    P(sm([[268, 50], [250, 46], [254, 54], [260, 66], [265, 82, 0], [267, 64]]), '#120804') +
    P(sm([[226, 46], [246, 45], [238, 52], [230, 62, 0], [229, 52]]), '#1e0f07') +
    c.strands({ x0: 214, y0: 48, x1: 266, y1: 60, n: 30, a: 96, spread: 26, len: 12, w: 1.4, cols: ['#4a2c18', '#2a170c'], op: 0.7 }) +
    // weathered creases below the eyes
    line(c, 'M219 92Q227 95 235 92', '#5a2c18', 1.2, 0.5, 0.6) + line(c, 'M245 92Q253 95 261 92', '#4a2414', 1.2, 0.5, 0.6) +
    line(c, 'M216 88L212 86', '#4a2414', 1, 0.4, 0.5) + line(c, 'M264 88L268 86', '#4a2414', 1, 0.4, 0.5));
  // eyes sized to survive the paint pass: clear whites, a large amber iris,
  // a bold catchlight and a heavy upper lid
  const eye = (x, y, flip) => {
    const shape = sm([[x - 11, y + 1.5, 0.5], [x - 4, y - 5], [x + 5, y - 5], [x + 11, y - 0.5 * flip, 0.5], [x + 4, y + 4.4], [x - 4, y + 4.4]]);
    return P(shape, '#f0e2c8') + c.inside(shape,
      `<circle cx="${x + flip * 0.8}" cy="${y + 0.3}" r="4.4" fill="${c.rgU([[0, '#ffd070'], [0.5, '#c88a2a'], [1, '#4a2a0a']], x, y, 4.4)}"/>` +
      `<circle cx="${x + flip * 0.8}" cy="${y + 0.3}" r="1.9" fill="#1a0a04"/>` +
      blob(c, `M${x - 12} ${y - 7}L${x + 12} ${y - 7}L${x + 12} ${y - 3}L${x - 12} ${y - 3}Z`, '#3a1a0a', 1.2, 0.55)) +
      `<circle cx="${x - 1.8}" cy="${y - 1.4}" r="2.4" fill="#ffffff"/>` +
      S(sm([[x - 12, y + 1], [x - 4, y - 5.6], [x + 5, y - 5.6], [x + 12, y - 0.3]], false), '#1a0a04', 2.4);
  };
  head += eye(227, 86, 1) + eye(253, 86, -1);
  if (A) {
    // knitted, furious brows for the lunge
    head += P(sm([[212, 74, 0], [224, 74], [237, 81], [237, 84.5, 0], [224, 78.5], [213, 77.5, 0]]), '#1a0d06');
    head += P(sm([[243, 81.5, 0], [256, 74], [268, 73.5], [267, 77, 0], [256, 78], [243, 85, 0]]), '#140a05');
    head += line(c, 'M237 80L239 74', '#3a180c', 1.2, 0.5, 0.7) + line(c, 'M243 80L241 74', '#3a180c', 1.2, 0.5, 0.7);
  } else {
    head += P(sm([[213, 79, 0], [222, 73.5], [236, 78], [237, 81.5, 0], [224, 78], [214, 81.5, 0]]), '#1a0d06');
    head += P(sm([[243, 78.5, 0], [257, 73.5], [267, 77], [266, 80.5, 0], [256, 78], [243, 82, 0]]), '#140a05');
  }
  head += blob(c, 'M236 79L244 79L242 87L238 87Z', '#3a180c', 1.5, 0.6);
  // the kerchief: tented over the nose, gathered under the chin, a hanging point
  const kerchief = sm([[207, 101], [222, 97], [240, 90], [258, 97], [273, 101], [276, 116], [267, 132], [253, 146], [241, 166, 0], [228, 147], [214, 132], [204, 116]]);
  head += P(kerchief, c.lg([[0, '#ea6446'], [0.3, '#b8352a'], [0.7, '#741818'], [1, '#360909']], 0.2, 0, 0.8, 1), `filter="${c.vol({ ...cloth, k: 5, b: 4, so: 0.5, ho: 0.25, tex: 0.25 })}"`);
  head += c.inside(kerchief,
    // folds radiating from the nose and pulled towards the knot behind the ears
    line(c, sm([[240, 92], [237, 108], [231, 126], [234, 146]], false), '#3e0808', 3, 1.8, 0.65) +
    line(c, sm([[243, 95], [252, 112], [256, 130], [248, 150]], false), '#3e0808', 3, 2.2, 0.55) +
    line(c, sm([[236, 94], [222, 112], [214, 126]], false), '#ff9070', 3, 2.5, 0.45) +
    line(c, sm([[208, 106], [222, 118], [230, 138]], false), '#ff8a66', 2, 2, 0.35) +
    line(c, sm([[262, 104], [270, 118]], false), '#3e0808', 2.5, 2, 0.5) +
    line(c, sm([[214, 128], [240, 140], [266, 128]], false), '#3a0606', 3, 2.5, 0.5) +
    line(c, sm([[222, 134], [236, 152], [240, 162]], false), '#ff8a66', 2, 2, 0.3) +
    blob(c, 'M256 96L282 96L282 150L250 150Z', '#2a0505', 8, 0.45) +
    S(sm([[204, 108], [207, 102], [222, 98], [240, 92], [258, 98], [273, 102], [276, 112]], false), '#ffb090', 1.4, 'opacity="0.5"') +
    S(sm([[213, 129], [228, 146], [241, 163], [253, 146], [266, 131]], false), '#ffc0a0', 1, 'stroke-dasharray="2 3" opacity="0.35"'));
  // the hood's dagged mantle casts a soft shadow onto the jerkin
  const torsoAO = ao(c, jerkin, hood, 0, 9, 7, 0.65);

  // ----- arms
  const armSvg = (sh, el, wr, side) => {
    const upper = rib([[sh[0], sh[1], 48], [lerp(sh[0], el[0], 0.45), lerp(sh[1], el[1], 0.45), 45], [el[0], el[1], 36]]);
    const fore = rib([[el[0], el[1], 36], [lerp(el[0], wr[0], 0.35), lerp(el[1], wr[1], 0.35), 40], [wr[0], wr[1], 29]]);
    let s = P(upper, c.lg([[0, '#a39c90'], [0.4, '#68625a'], [1, '#26221f']], 0.1, 0, 0.9, 1), `filter="${c.vol(cloth)}"`);
    const at = (t, o) => { const p = mix2(sh, el, t); return [p[0] + o, p[1]]; };
    s += c.inside(upper,
      line(c, sm([at(0.25, -14), at(0.45, 2), at(0.55, 14)], false), '#221e1a', 3, 2.2, 0.55) +
      line(c, sm([at(0.55, -16), at(0.72, 0), at(0.85, 12)], false), '#221e1a', 3, 2.2, 0.5) +
      line(c, sm([at(0.35, -12), at(0.5, 0)], false), '#e2dccf', 2.5, 2, 0.35));
    s += ao(c, upper, fore, 0, -3, 4, 0.5);
    s += P(fore, c.lg([[0, '#a8703e'], [0.5, '#6a3e1c'], [1, '#26140a']], 0.1, 0, 0.9, 1), `filter="${c.vol(leather)}"`);
    const ring = [0.22, 0.58, 0.93].map((t) => mix2(el, wr, t));
    const dx = wr[0] - el[0], dy = wr[1] - el[1], m = Math.hypot(dx, dy), nx = -dy / m, ny = dx / m;
    s += c.inside(fore,
      ring.map((p) => line(c, `M${r1(p[0] - nx * 24)} ${r1(p[1] - ny * 24)}L${r1(p[0] + nx * 24)} ${r1(p[1] + ny * 24)}`, '#170a04', 2.5, 1, 0.6)).join('') +
      ring.slice(0, 2).map((p) => `<circle cx="${r1(p[0] + nx * 7 * side + dx / m * 9)}" cy="${r1(p[1] + ny * 7 * side + dy / m * 9)}" r="2" fill="#e0b878"/>`).join('') +
      line(c, `M${r1(el[0] - nx * 8)} ${r1(el[1] - ny * 8)}L${r1(wr[0] - nx * 6)} ${r1(wr[1] - ny * 6)}`, '#d8a470', 4, 3, 0.3));
    return s;
  };

  // ----- weapons
  const sword = (pommel, guard, tip, wid = 18) => {
    const dx = tip[0] - guard[0], dy = tip[1] - guard[1], L = Math.hypot(dx, dy), gx = -dy / L, gy = dx / L;
    let s = blade(c, guard, tip, wid, { gleam: 0.7 });
    const cg = rib([[guard[0] + gx * 30, guard[1] + gy * 30, 7], [guard[0], guard[1], 10], [guard[0] - gx * 30, guard[1] - gy * 30, 7]]);
    s += P(cg, c.lg([[0, '#f4da94'], [0.4, '#a87a2e'], [1, '#3a2206']]), `filter="${c.vol({ k: 2, b: 1.5, so: 0.5, ho: 0.4 })}"`);
    s += S(`M${r1(guard[0])} ${r1(guard[1])}L${r1(pommel[0])} ${r1(pommel[1])}`, '#3a2010', 9);
    s += `<circle cx="${r1(pommel[0])}" cy="${r1(pommel[1])}" r="7" fill="${c.rg([[0, '#fff2bc'], [0.5, '#c0902e'], [1, '#4a2e08']], 0.35, 0.3, 0.8)}"/>`;
    return s;
  };
  const dagger = (pommel, guard, tip) => {
    let s = blade(c, guard, tip, 11, { fuller: false, gleam: 0.8 });
    const dx = tip[0] - guard[0], dy = tip[1] - guard[1], L = Math.hypot(dx, dy), gx = -dy / L, gy = dx / L;
    s += S(`M${r1(guard[0] + gx * 15)} ${r1(guard[1] + gy * 15)}L${r1(guard[0] - gx * 15)} ${r1(guard[1] - gy * 15)}`, c.lgU([[0, '#e6e9ea'], [1, '#4a5056']], guard[0] - 10, guard[1] - 10, guard[0] + 10, guard[1] + 10), 6);
    s += S(`M${r1(guard[0])} ${r1(guard[1])}L${r1(pommel[0])} ${r1(pommel[1])}`, '#2a160a', 7);
    s += `<circle cx="${r1(pommel[0])}" cy="${r1(pommel[1])}" r="5" fill="${c.rg([[0, '#f0f2f2'], [0.6, '#808890'], [1, '#2a2e32']], 0.35, 0.3)}"/>`;
    return s;
  };
  const ang = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

  let back = '', front = '';
  if (!A) {
    const rs = [176, 176], re = [160, 266], rw = [150, 338], rf = [148, 354];
    const ls = [304, 176], le = [324, 262], lw = [336, 318], lf = [338, 334];
    front += armSvg(rs, re, rw, -1) + armSvg(ls, le, lw, 1);
    front += sword([151, 334], [146, 374], [114, 594], 18) + fist(c, rf, ang([151, 334], [146, 374]), -1);
    front += dagger([336, 354], [342, 316], [372, 234]) + fist(c, lf, ang([336, 354], [342, 316]), 1);
  } else {
    const rs = tp(176, 176), ls = tp(304, 176);
    const re = [124, 134], rw = [154, 68], rf = [160, 54];
    const le = [352, 270], lw = [330, 318], lf = [318, 328];
    back += armSvg(rs, re, rw, -1);
    back += sword([146, 66], [182, 44], [412, 32], 20) + fist(c, rf, ang([146, 66], [182, 44]), -1);
    front += armSvg(ls, le, lw, 1);
    front += dagger([334, 344], [304, 312], [258, 250]) + fist(c, lf, ang([334, 344], [304, 312]), 1);
  }
  // order: legs, raised arm, torso, arms, hood and head
  const body = legsSvg + back + G(torso + torsoAO, `transform="${tr}"`) + front + G(head, `transform="${tr}"`);
  return `${halo(c, 240 + T.dx * 0.6, 126 + T.dy * 0.6, 150, 112, '#ffcf90', 0.2)}<g filter="${c.fx()}">${body}</g>`;
}

// ---------------------------------------------------------------- wolf
// The dire wolf's head in local coordinates: (0, 0) between the eyes, turned a
// little to the viewer's left. jaw: 0.14 = snarling, 1 = jaws wide.
function wolfHead(c, jaw, pal) {
  const J = jaw * 96;
  const furV = c.vol({ k: 6, b: 5, so: 0.5, ho: 0.22, tex: 0.3, tf: 0.07, tc: '#0c0c10', seed: 12 });
  const furVs = c.vol({ k: 3, b: 2.5, so: 0.5, ho: 0.25 });
  const DK = ['#1a1b1f', '#2a2b30', '#3a3b40'], LT = ['#c9c6c0', '#e4e0d8', '#a6a4a0'];
  let s = '';
  // ears, pricked and turned a little back
  for (const sd of [-1, 1]) {
    const ear = sm([[80 * sd, -14], [98 * sd, -74], [90 * sd, -136, 0], [62 * sd, -100], [30 * sd, -56]]);
    const inner = sm([[74 * sd, -34], [86 * sd, -80], [84 * sd, -120, 0], [62 * sd, -92], [44 * sd, -62]]);
    s += P(ear, sd < 0 ? pal.grey() : pal.dark(), `filter="${furV}"`);
    s += c.inside(ear, P(inner, c.lg([[0, '#82504e'], [0.6, '#40222a'], [1, '#1a0e12']])) +
      blob(c, inner, '#120808', 5, 0.45) +
      c.strands({ x0: 50 * sd - 22, y0: -90, x1: 50 * sd + 22, y1: -36, n: 60, a: -90 + 22 * sd, spread: 18, len: 24, w: 1.1, cols: ['#ece6da', '#c8c0b4'], op: 0.55 }) +
      c.clumps({ x0: 80 * sd - 20, y0: -130, x1: 80 * sd + 20, y1: -20, n: 26, a: -95 + 8 * sd, spread: 10, len: 14, w: 3, cols: DK, op: 0.4 }));
  }
  const head = tuft([[0, -60], [28, -58], [52, -46], [70, -26, 1, 6], [84, 0, 1, 9], [96, 30, 1, 12], [96, 62, 1, 12], [84, 92, 1, 10], [60, 114, 1, 8],
    [34, 126 + J * 0.5], [0, 132 + J], [-34, 124 + J * 0.5, 1, 8], [-58, 110, 1, 10], [-80, 88, 1, 12], [-90, 58, 1, 12], [-90, 28, 1, 10], [-80, 0, 1, 7], [-66, -26], [-48, -46], [-26, -58]], { seed: 21, n: 2.6, lean: 0.35, jit: 0.7 });
  s += P(head, pal.grey(), `filter="${furV}"`);
  s += c.inside(head,
    blob(c, ell(-66, 64, 26, 42, -10), '#ebe6da', 10, 0.8) + blob(c, ell(68, 62, 28, 44, 10), '#b6b0a4', 10, 0.6) +
    blob(c, ell(0, -40, 44, 24), '#26272c', 12, 0.65) +
    blob(c, ell(66, 30, 26, 60), '#141418', 14, 0.45) +
    c.clumps({ x0: -96, y0: -60, x1: 96, y1: 132, n: 150, len: 20, lv: 0.5, w: 6, cols: ['#2e2f34', '#3c3d42', '#4c4d52'], op: 0.42, spread: 10, field: (x, y) => (Math.atan2(y - 40, x) * 180) / Math.PI }) +
    c.clumps({ x0: -96, y0: -50, x1: 10, y1: 120, n: 50, len: 18, lv: 0.5, w: 5.5, cols: ['#e6e0d4', '#c8c2b6'], op: 0.4, spread: 10, field: (x, y) => (Math.atan2(y - 40, x) * 180) / Math.PI }));
  // lower jaw
  const jawD = sm([[-58, 100], [-46, 118 + J * 0.85], [-24, 130 + J], [-6, 134 + J], [16, 130 + J], [38, 116 + J * 0.85], [46, 98], [24, 102 + J * 0.6], [-30, 104 + J * 0.6]]);
  s += P(jawD, pal.cream(), `filter="${furVs}"`);
  s += c.inside(jawD, blob(c, ell(20, 132 + J, 30, 10), '#2a2a2e', 6, 0.5));
  // mouth
  const upper = [[-58, 102], [-48, 90], [-36, 84], [-22, 90], [-8, 94], [8, 88], [22, 84], [36, 90], [46, 100]];
  const lower = [[46, 100], [36, 112 + J * 0.8], [18, 120 + J], [-6, 124 + J], [-26, 122 + J], [-46, 114 + J * 0.8]];
  const mouth = sm([...upper.map((p, i) => [p[0], p[1], i === 0 || i === upper.length - 1 ? 0.3 : 1]), ...lower.slice(1)]);
  s += P(mouth, c.lg([[0, '#5a0e14'], [0.6, '#2a0508'], [1, '#120204']], 0.5, 0, 0.5, 1));
  let teeth = P(sm([...upper.slice(1, -1).map(([x, y]) => [x, y - 2]), ...upper.slice(1, -1).reverse().map(([x, y]) => [x, y + 9])]), c.lg([[0, '#c84e58'], [1, '#7a1820']], 0, 0, 0, 1));
  if (J > 20) {
    // palate ridges, the throat, and the tongue lying in the lower jaw
    for (let k = 0; k < 4; k++) teeth += line(c, `M-30 ${106 + k * 9}Q-6 ${98 + k * 9} 20 ${106 + k * 9}`, '#8a2a32', 2.4, 1.2, 0.55);
    teeth += blob(c, ell(-6, 100 + J * 0.55, 26, 16), '#080102', 8, 0.85);
    const tg = sm([[-40, 112 + J * 0.8], [-20, 100 + J * 0.74], [-6, 104 + J * 0.74], [10, 100 + J * 0.74], [30, 110 + J * 0.8], [26, 118 + J * 0.92], [-6, 122 + J * 0.96], [-36, 120 + J * 0.92]]);
    teeth += P(tg, c.lg([[0, '#e27a80'], [0.5, '#b0404a'], [1, '#5a1018']], 0.3, 0, 0.6, 1));
    teeth += c.inside(tg, line(c, `M-6 ${104 + J * 0.74}L-6 ${118 + J * 0.92}`, '#6a1420', 2.4, 1.4, 0.7) + blob(c, ell(-18, 106 + J * 0.76, 10, 3), '#ffc8c8', 2, 0.6));
  }
  const tooth = (b, t, w, hi = 0.7) => {
    const d = rib([[b[0], b[1], w], [lerp(b[0], t[0], 0.55) + (t[0] - b[0]) * 0.15, lerp(b[1], t[1], 0.55), w * 0.75], [t[0], t[1], 0]], 0.4);
    return P(d, c.lg([[0, '#fffaf0'], [0.5, '#e8dcc2'], [1, '#9c8c6c']], 0, 0, 1, 1)) + c.inside(d, blob(c, ell(b[0] - w * 0.2, lerp(b[1], t[1], 0.3), w * 0.18, Math.abs(t[1] - b[1]) * 0.25), '#ffffff', 1, hi));
  };
  for (let k = 0; k < 6; k++) { const x = -19 + k * 5.2; teeth += tooth([x, 123 + J], [x + 0.5, 115 + J], 4.6); }
  teeth += tooth([-28, 126 + J], [-24, 102 + J * 0.62], 9.5) + tooth([14, 124 + J], [11, 100 + J * 0.62], 9.5);
  teeth += tooth([-49, 108 + J * 0.78], [-47, 99 + J * 0.68], 6) + tooth([36, 106 + J * 0.78], [34, 97 + J * 0.68], 6);
  for (let k = 0; k < 6; k++) { const x = -21 + k * 5.8; teeth += tooth([x, 95], [x + 0.6, 105], 5.4); }
  teeth += tooth([-47, 94], [-47, 104], 6) + tooth([-53, 98], [-53, 106], 5) + tooth([35, 94], [35, 104], 6) + tooth([41, 97], [41, 105], 5);
  teeth += tooth([-35, 90], [-31, 130], 11.5, 0.85) + tooth([23, 90], [20, 128], 11.5, 0.75);
  s += c.inside(mouth, teeth + blob(c, ell(-6, 94, 54, 6), '#200406', 3, 0.5));
  s += S(sm(lower, false), '#18080a', 2.5) + S(sm(upper, false), '#1a0a0c', 2.2);
  // muzzle, long and foreshortened, wrinkled in the snarl
  const muzzle = sm([[-14, -14], [6, -16], [14, 10], [19, 40], [22, 60], [32, 78], [44, 92], [46, 100, 0.3], [36, 90], [22, 84], [8, 88], [-8, 94], [-22, 90], [-36, 84], [-48, 90], [-58, 102, 0.3], [-54, 90], [-42, 76], [-33, 58], [-28, 36], [-24, 8]]);
  s += P(muzzle, c.lg([[0, '#cbc5b9'], [0.35, '#908e8a'], [0.75, '#5a5a5e'], [1, '#2a2a2e']], 0.15, 0, 0.85, 1), `filter="${c.vol({ k: 5, b: 4, so: 0.5, ho: 0.25, tex: 0.25, tf: 0.09, tc: '#0c0c10', seed: 14 })}"`);
  s += c.inside(muzzle,
    blob(c, ell(-6, 8, 10, 26), '#2a2a2e', 6, 0.65) +
    blob(c, ell(-40, 86, 14, 10), '#f0ebe0', 5, 0.75) + blob(c, ell(32, 84, 14, 10), '#cbc5b8', 5, 0.55) +
    blob(c, ell(16, 46, 8, 30), '#1a1a1e', 7, 0.5) +
    [20, 30, 40, 50].map((y, i) => line(c, `M${-24 + i * 2} ${y}Q-6 ${y - 8 + i} ${13 - i} ${y}`, '#16161a', 2.2, 1.1, 0.7) + line(c, `M${-22 + i * 2} ${y - 4}Q-6 ${y - 12 + i} ${11 - i} ${y - 4}`, '#dcd6ca', 1.4, 1, 0.4)).join('') +
    line(c, 'M-26 66Q-38 72 -46 86', '#16161a', 2.2, 1, 0.6) + line(c, 'M10 64Q22 70 32 84', '#16161a', 2.2, 1, 0.6) +
    [[-40, 80], [-34, 84], [-44, 86], [26, 78], [32, 82], [22, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#2a2a2e" opacity="0.7"/>`).join('') +
    c.clumps({ x0: -60, y0: -14, x1: 52, y1: 100, n: 90, len: 9, w: 2.6, cols: ['#2a2b30', '#3a3b40', '#d8d2c6'], op: 0.45, spread: 10, field: (x, y) => (Math.atan2(y - 70, x + 9) * 180) / Math.PI + 180 }));
  const nose = sm([[-24, 64], [-8, 59.5], [8, 63], [12.5, 71], [6, 79], [-8, 83], [-22, 79], [-27, 71]]);
  s += P(nose, c.lg([[0, '#5a585c'], [0.4, '#1e1c20'], [1, '#08080a']]));
  s += c.inside(nose, P(sm([[-19, 72], [-13, 69.5], [-11, 76], [-17, 77.5]]), '#030304') + P(sm([[4, 71], [-2, 68.5], [-4, 75], [2, 76.5]]), '#030304') +
    blob(c, ell(-11, 62.5, 8, 3), '#d8dce4', 2, 0.8) + blob(c, ell(-22, 68, 2.2, 3), '#9aa0aa', 1.5, 0.5) + line(c, 'M-8 76L-8 84', '#000', 1.4, 0.5, 0.8));
  s += line(c, 'M-8 84L-8 94', '#18080a', 1.6, 0.5, 0.8);
  // eyes
  for (const sd of [-1, 1]) {
    const cx = sd < 0 ? -36 : 31, cy = sd < 0 ? 4 : 1, k = sd < 0 ? 0.92 : 1;
    const eye = sm([[cx + 16 * sd * k, cy - 6, 0.4], [cx + 5 * sd * k, cy - 7], [cx - 7 * sd * k, cy - 3], [cx - 14 * sd * k, cy + 6, 0.4], [cx - 3 * sd * k, cy + 8], [cx + 9 * sd * k, cy + 3]]);
    s += P(sm([[cx + 21 * sd * k, cy - 9], [cx + 5 * sd * k, cy - 11], [cx - 11 * sd * k, cy - 6], [cx - 19 * sd * k, cy + 8], [cx - 3 * sd * k, cy + 12], [cx + 13 * sd * k, cy + 6]]), '#0c0b0e');
    s += P(eye, c.rgU([[0, '#fff3a6'], [0.35, '#f7c63c'], [0.75, '#d27c10'], [1, '#6a3404']], cx - 1 * sd, cy + 1, 12));
    s += c.inside(eye, `<ellipse cx="${cx - 1 * sd}" cy="${cy + 1}" rx="3.4" ry="4.4" fill="#050405"/>` +
      blob(c, `M${cx - 22} ${cy - 15}L${cx + 22} ${cy - 15}L${cx + 22} ${cy - 3}L${cx - 22} ${cy - 3}Z`, '#2a1404', 2, 0.75));
    s += `<circle cx="${cx - 2.6}" cy="${cy - 1.6}" r="1.5" fill="#ffffff"/><circle cx="${cx + 2.5 * sd}" cy="${cy + 3.6}" r="0.7" fill="#fff6c8" opacity="0.8"/>`;
    s += P(sm([[cx + 23 * sd * k, cy - 13, 0], [cx + 5 * sd * k, cy - 17], [cx - 14 * sd * k, cy - 10], [cx - 20 * sd * k, cy - 4, 0], [cx - 9 * sd * k, cy - 11], [cx + 7 * sd * k, cy - 13]]), sd < 0 ? '#e6e1d6' : '#aaa69e', 'opacity="0.85"');
  }
  s += line(c, 'M-8 -22L-5 -6', '#16161a', 2.3, 1, 0.7) + line(c, 'M3 -24L0 -6', '#16161a', 2.3, 1, 0.7) + line(c, 'M-2 -30L-2 -8', '#d0cabe', 1.4, 1, 0.4);
  return s;
}

// Huge grey dire wolf facing left, body in profile and the head turned to the
// viewer, hackles up. attack: crouched, jaws wide mid-snap, near forepaw raised.
function wolf(c, A) {
  const pal = {
    grey: () => c.lg([[0, '#bdbcb8'], [0.3, '#86878b'], [0.7, '#4e4f55'], [1, '#232428']], 0.1, 0, 0.9, 1),
    dark: () => c.lg([[0, '#6e6f74'], [0.5, '#3e3f45'], [1, '#16171a']], 0.1, 0, 0.9, 1),
    cream: () => c.lg([[0, '#f2ece0'], [0.5, '#c4bdae'], [1, '#6a665e']], 0.2, 0, 0.8, 1),
  };
  const fur = c.vol({ k: 12, b: 10, so: 0.55, ho: 0.2, tex: 0.35, tf: 0.05, tc: '#0c0c10', seed: 5 });
  const furS = c.vol({ k: 6, b: 4, so: 0.55, ho: 0.22, tex: 0.3, tf: 0.07, tc: '#0c0c10', seed: 6 });
  const DK = ['#1c1d21', '#26272b', '#303136'];
  const MD = ['#5a5b60', '#6c6d72'];
  const LT = ['#a8a6a0', '#96948f', '#b8b5ae'];
  const cl = (o) => c.clumps({ op: 0.4, w: 5.5, len: 24, spread: 10, lv: 0.6, ...o, n: Math.round((o.n || 40) * 0.6) });
  const d = A ? 16 : 0; // crouch

  const paw = (x, y, w, dark) => {
    const pd = sm([[x - w / 2, y + 12, 0], [x - w / 2 - 2, y - 2], [x - w / 3, y - 16], [x + w / 6, y - 20], [x + w / 2, y - 10], [x + w / 2 + 3, y + 12, 0]]);
    let s = P(pd, dark ? pal.dark() : pal.grey(), `filter="${furS}"`);
    s += c.inside(pd,
      [-0.36, -0.12, 0.12, 0.36].map((t) => P(ell(x + t * w, y + 5, w * 0.13, 8), dark ? '#4a4b50' : '#9a9a98', `filter="${c.blur(1.5)}"`)).join('') +
      [-0.24, 0, 0.24].map((t) => line(c, `M${r1(x + t * w)} ${y - 4}L${r1(x + t * w * 1.1)} ${y + 12}`, '#0a0a0c', 2.2, 1, 0.8)).join('') +
      blob(c, ell(x - w * 0.15, y - 14, w * 0.3, 5), '#ece8e0', 4, dark ? 0.12 : 0.4) + `<rect x="${x - w}" y="${y + 9}" width="${w * 2}" height="6" fill="#0a0a0c" opacity="0.6"/>`);
    for (const t of [-0.36, -0.12, 0.12, 0.36]) s += P(sm([[x + t * w - 2.5, y + 8], [x + t * w + 2.5, y + 8], [x + t * w * 1.1 - 1, y + 13, 0]]), dark ? '#7a756c' : '#d8d0c0');
    return s;
  };
  const leg = (pts, dark, flow = 95, back = 1) => {
    const rp = ribPts(pts);
    const half = Math.floor(rp.length / 2);
    const ld = tuft(rp.map((p, i) => [p[0], p[1], p[2] ?? 1, (back > 0 ? i > half : i < half) && i !== rp.length - 1 ? 6 : 0]), { seed: 77 + pts[0][0], lean: 1.2, n: 2, jit: 0.8 });
    let s = P(ld, dark ? pal.dark() : pal.grey(), `filter="${furS}"`);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    s += c.inside(ld, cl({ x0: Math.min(...xs) - 30, y0: Math.min(...ys) - 10, x1: Math.max(...xs) + 30, y1: Math.max(...ys), n: 60, a: flow, len: 14, w: 3.5, cols: dark ? DK : [...DK, ...MD, ...LT] }) +
      blob(c, sm(pts.map((p) => [p[0] - p[2] * 0.22, p[1], 1]), false), dark ? '#5a5b60' : '#dcd8d0', 5, dark ? 0.22 : 0.42) +
      blob(c, sm(pts.map((p) => [p[0] + p[2] * 0.4, p[1], 1]), false), '#0a0a0c', 5, 0.4));
    return s;
  };

  let s = '';
  // far legs, in shadow
  s += leg([[292, 236 + d, 50], [296, 292 + d, 38], [296, 344 + d * 0.6, 28], [294, 390, 24], [292, 412, 24]], true) + paw(290, 424, 40, true);
  s += leg(A ? [[570, 276 + d, 40], [596, 324 + d, 28], [608, 358 + d * 0.5, 22], [598, 394, 19], [592, 412, 19]] : [[574, 272, 40], [596, 322, 28], [606, 358, 21], [598, 394, 19], [592, 412, 19]], true) + paw(590, 424, 34, true);
  // near legs (their tops disappear under the body fur)
  s += leg(A ? [[530, 270 + d, 52], [556, 326 + d, 32], [572, 362 + d * 0.5, 24], [560, 396, 21], [548, 414, 21]] : [[528, 266, 52], [554, 322, 32], [568, 358, 24], [556, 396, 21], [546, 414, 21]], false, 100) + paw(542, 426, 40, false);
  if (!A) s += leg([[236, 232, 60], [240, 290, 44], [236, 342, 32], [230, 390, 28], [224, 412, 28]], false) + paw(220, 426, 44, false);
  // tail, raised and bristling
  const tail = A ? [[550, 146 + d, 44], [572, 112 + d, 52], [588, 80 + d, 48], [600, 50 + d, 30], [608, 26 + d, 0]] : [[550, 142, 44], [574, 106, 52], [590, 72, 48], [601, 42, 30], [606, 16, 0]];
  const tailD = tuft(ribPts(tail).map((p) => [p[0], p[1], p[2] ?? 1, 10]), { seed: 31, lean: 0.9, n: 2.4, jit: 0.7 });
  s += P(tailD, pal.grey(), `filter="${fur}"`);
  s += c.inside(tailD, cl({ x0: 540, y0: 0, x1: 640, y1: 200, n: 140, a: -62, len: 24, cols: [...DK, ...MD, ...LT] }) + blob(c, ell(604, 34 + d, 16, 30), '#0e0e12', 10, 0.75) + blob(c, ell(592, 120, 20, 60), '#0e0e12', 14, 0.5));
  // one silhouette for the neck ruff, back, croup and haunch; hackles raised
  const body = tuft([[122, 178], [118, 126, 1, 14], [148, 84, 1, 18], [198, 58, 1, 22], [258, 50, 1, 22], [314, 58 + d * 0.6, 1, 20], [372, 76 + d, 1, 15], [428, 92 + d, 1, 10], [488, 100 + d, 1, 8], [536, 106 + d, 1, 6], [566, 122 + d],
    [588, 152 + d, 1, 8], [597, 202 + d, 1, 10], [588, 252 + d, 1, 9], [568, 290 + d, 1, 6], [542, 302 + d], [516, 288 + d, 1, 8], [496, 238 + d, 1, 9], [440, 246 + d, 1, 10], [380, 266 + d, 1, 12], [320, 286 + d, 1, 12], [270, 294 + d], [236, 270], [222, 240], [140, 236]], { seed: 41, lean: 1, n: 2.6, jit: 0.75 });
  s += P(body, pal.grey(), `filter="${fur}"`);
  s += c.inside(body,
    // dark saddle, pale underside
    blob(c, sm([[250, 40], [520, 90], [590, 130], [520, 160], [380, 146], [270, 126]]), '#141519', 18, 0.7) +
    blob(c, sm([[300, 270], [440, 240], [500, 240], [440, 280], [320, 300]]), '#d8d2c6', 12, 0.5) +
    // shoulder, rib cage and haunch masses
    blob(c, ell(318, 180, 34, 60, 8), '#c8c6c0', 20, 0.45) +
    line(c, 'M346 110Q362 190 344 270', '#0e0e12', 12, 10, 0.4) +
    blob(c, ell(410, 190, 50, 42), '#a8a6a0', 24, 0.35) +
    blob(c, ell(530, 196 + d, 30, 50, 10), '#d0ccc4', 16, 0.5) +
    line(c, `M494 ${146 + d}Q484 ${210 + d} 510 ${284 + d}`, '#0e0e12', 10, 8, 0.45) +
    blob(c, ell(580, 236 + d, 24, 56), '#0c0c10', 14, 0.6) +
    // neck ruff darkens behind the head
    blob(c, ell(290, 170, 40, 84), '#0c0c10', 18, 0.45) +
    cl({ x0: 110, y0: 36, x1: 340, y1: 280, n: 360, len: 24, cols: [...DK, ...DK, ...MD], field: (x, y) => (Math.atan2(y - 200, x - 200) * 180) / Math.PI }) +
    cl({ x0: 120, y0: 40, x1: 300, y1: 160, n: 90, len: 22, cols: LT, field: (x, y) => (Math.atan2(y - 200, x - 200) * 180) / Math.PI }) +
    cl({ x0: 330, y0: 50 + d, x1: 600, y1: 340 + d, n: 560, cols: [...DK, ...DK, ...MD], field: (x, y) => (y < 140 + d ? -14 + (x - 300) * 0.03 : (x > 480 ? 70 + (x - 530) * 0.4 : 45 + (y - 140) * 0.2)) }) +
    cl({ x0: 280, y0: 130 + d, x1: 560, y1: 300 + d, n: 170, cols: LT, op: 0.32, keep: (x, y) => (x < 380 || (x > 490 && x < 545 && y < 260 + d)), field: (x, y) => (x > 480 ? 70 + (x - 530) * 0.4 : 45 + (y - 140) * 0.2) }) +
    cl({ x0: 240, y0: 40 + d, x1: 560, y1: 130 + d, n: 140, a: -35, len: 26, cols: ['#0a0a0d', '#1c1d21'], op: 0.6 }));
  // pale chest ruff
  const chest = tuft([[148, 222], [214, 212], [290, 230], [302, 268, 1, 10], [286, 302 + d * 0.5, 1, 11], [244, 314 + d * 0.5, 1, 11], [200, 304 + d * 0.5, 1, 11], [160, 278, 1, 9]], { seed: 71, lean: 0.4, n: 2.6, jit: 0.7 });
  s += P(chest, pal.cream(), `filter="${furS}"`);
  s += c.inside(chest, cl({ x0: 140, y0: 200, x1: 310, y1: 330, n: 200, a: 95, len: 20, cols: ['#8e8a82', '#f4f0e6', '#b0aa9e', '#6e6b66'], spread: 18, op: 0.45 }) + blob(c, ell(296, 280, 30, 50), '#26262a', 14, 0.6) + blob(c, ell(200, 220, 60, 14), '#2a2a2e', 10, 0.5));
  if (A) {
    // the near forepaw raised toward the viewer, claws out
    let fore = leg([[222, 250, 58], [198, 292, 44], [166, 322, 34], [138, 326, 30]], false, 160, -1);
    // claws first, hooked out of the fur
    for (const [x, y, a] of [[100, 310, -150], [111, 300, -120], [127, 297, -90], [143, 302, -60]]) {
      const rad = (a * Math.PI) / 180, ex = x + Math.cos(rad) * 22, ey = y + Math.sin(rad) * 22;
      const mx = lerp(x, ex, 0.55) + Math.cos(rad + 1.2) * 4, my = lerp(y, ey, 0.55) + Math.sin(rad + 1.2) * 4;
      fore += P(rib([[x, y, 6.5], [mx, my, 4.5], [ex, ey, 0]], 0.5), c.lg([[0, '#d8ccb8'], [0.5, '#6a6050'], [1, '#1a1612']]));
    }
    const rp = tuft([[92, 316, 1, 5], [108, 298, 1, 4], [134, 294, 1, 4], [152, 312, 1, 5], [148, 344], [122, 354], [96, 344, 1, 5]], { seed: 141, lean: 0.4, n: 2.5, jit: 0.8 });
    fore += P(rp, pal.grey(), `filter="${furS}"`);
    const pad = (x, y, rx, ry) => P(ell(x, y, rx, ry), c.rgU([[0, '#5a4a4c'], [0.5, '#241a1c'], [1, '#0a0608']], x - rx * 0.3, y - ry * 0.4, rx * 1.3)) + `<ellipse cx="${r1(x - rx * 0.3)}" cy="${r1(y - ry * 0.4)}" rx="${r1(rx * 0.3)}" ry="${r1(ry * 0.2)}" fill="#c8c0c8" opacity="0.45"/>`;
    fore += c.inside(rp, blob(c, ell(122, 326, 24, 22), '#0a0a0c', 6, 0.55) + pad(123, 332, 12, 9) + [[103, 314], [114, 305], [129, 303], [143, 309]].map(([x, y]) => pad(x + 2, y + 7, 5, 4.2)).join('') +
      cl({ x0: 92, y0: 292, x1: 152, y1: 354, n: 50, len: 10, w: 3, cols: [...DK, ...MD], field: (x, y) => (Math.atan2(y - 326, x - 122) * 180) / Math.PI }) + blob(c, ell(112, 298, 14, 5), '#e2ded6', 4, 0.4));
    s += fore;
  }
  const hx = A ? 172 : 190, hy = A ? 168 : 158, hs = A ? 0.82 : 0.76, hr = A ? -8 : -3;
  s += G(wolfHead(c, A ? 1 : 0.14, pal), `transform="translate(${hx} ${hy}) rotate(${hr}) scale(${hs})"`);
  return `${halo(c, A ? 180 : 196, A ? 190 : 176, 170, 150, '#ffcf90', 0.18)}<g filter="${c.fx({ seed: 9 })}">${s}</g>`;
}

// ---------------------------------------------------------------- hound
// A trailing wisp of spectral smoke: a wavering ribbon that fades along its length.
function wisp(c, pts, col = '#9a72ff', op = 0.7, b = 1.5) {
  const a = pts[0], z = pts[pts.length - 1];
  const g = c.lgU([[0, col, op], [0.45, col, op * 0.6], [1, col, 0]], a[0], a[1], z[0], z[1]);
  const g2 = c.lgU([[0, '#ffffff', op * 0.5], [0.4, col, op * 0.2], [1, col, 0]], a[0], a[1], z[0], z[1]);
  const core = pts.map(([x, y, w]) => [x, y, w * 0.3]);
  return `<path d="${rib(pts, 1, 0)}" fill="${g}" filter="${c.blur(b)}"/><path d="${rib(core, 1, 0)}" fill="${g2}" filter="${c.blur(b * 0.6)}"/>`;
}

// The Gloom Hound's head, three-quarter toward the viewer and turned to the
// right: (0, 0) between the eyes. jaw opens the lower jaw (degrees); blaze
// fills the mouth with fire.
function houndHead(c, jaw, blaze) {
  const v = c.vol({ k: 4, b: 3, sc: '#020105', so: 0.65, hc: '#b898ff', ho: 0.28, tex: 0.3, tf: 0.08, tc: '#000', seed: 33 });
  const hide = () => c.lg([[0, '#3c2e68'], [0.35, '#1e163a'], [0.75, '#0c0818'], [1, '#040308']], 0.1, 0, 0.9, 1);
  let s = '';
  const ear = (base0, tip, base1, far) => {
    const d = tuft([[...base0, 1, 4], [tip[0], tip[1], 0, 4], [...base1, 1, 0]], { seed: 88 + tip[0], lean: 0.3, n: 2, jit: 0.8 });
    let e = P(d, far ? '#0c0818' : hide(), `filter="${v}"`);
    if (!far) e += c.inside(d, P(sm([[base0[0] + 8, base0[1] - 4], [tip[0] + 4, tip[1] + 18, 0], [base1[0] - 6, base1[1] - 2]]), c.lg([[0, '#4a2238'], [1, '#12060e']])) +
      c.strands({ x0: tip[0] - 10, y0: tip[1] + 10, x1: base1[0], y1: base1[1], n: 24, a: -95, spread: 12, len: 16, w: 0.9, cols: ['#9a7ae0'], op: 0.5 }));
    return e;
  };
  s += ear([8, -46], [40, -122], [34, -30], true);
  // lower jaw, hinged near the mouth corner
  const J = jaw;
  const jawD = sm([[-36, 52], [-14, 70], [16, 84], [44, 92], [60, 86], [52, 80], [24, 74], [-6, 64], [-28, 50]]);
  const jawTop = xf([[52, 80], [24, 74], [-6, 64], [-28, 50]], { rot: jaw, cx: -34, cy: 50 });
  const mouthIn = sm([[-36, 56, 0.3], [-16, 60], [6, 62], [28, 61], [46, 62], [60, 70], [70, 72, 0.3], [jawTop[0][0] + 10, jawTop[0][1] + 4], ...jawTop.slice(0, 3), [-34, 52, 0.3]]);
  s += P(mouthIn, blaze ? c.rgU([[0, '#fffbe6'], [0.3, '#ffe36a'], [0.65, '#ff9a1e'], [1, '#b8300a']], 22, 82, 56) : c.lg([[0, '#5a1408'], [1, '#160302']], 0, 0, 0, 1));
  let jw = P(jawD, hide(), `filter="${v}"`);
  for (let k = 0; k < 7; k++) {
    const t = k / 6, x = lerp(-18, 50, t), y = lerp(64, 84, t) - 2, h = [7, 10, 8, 11, 9, 20, 8][k], w = k === 5 ? 4.2 : 2.6;
    jw += P(sm([[x - w, y + 2], [x + w, y + 3], [x + 0.6, y - h, 0]]), c.lg([[0, '#f4ecd8'], [0.6, '#c8b894'], [1, '#6a5a40']], 0, 1, 0, 0));
  }
  jw += c.inside(jawD, line(c, 'M-20 64Q20 86 56 88', '#9a7ae0', 1.5, 1, 0.5));
  s += G(jw, `transform="rotate(${J} -34 50)"`);
  // skull: narrow, gaunt, sunken
  const skull = tuft([[-12, -52], [14, -50], [34, -38], [44, -18], [50, 6], [60, 30], [70, 50], [76, 62], [70, 74], [60, 72], [46, 63], [28, 62], [6, 63], [-16, 61], [-36, 57, 1, 5], [-52, 34, 1, 6], [-58, 10, 1, 5], [-54, -16], [-36, -42]], { seed: 83, lean: -0.6, n: 2, jit: 0.8 });
  s += P(skull, hide(), `filter="${v}"`);
  s += c.inside(skull,
    blob(c, ell(-22, -1, 17, 12, 12), '#000000', 5, 0.85) + blob(c, ell(26, -6, 12, 10, -10), '#000000', 4, 0.8) +
    blob(c, sm([[-50, 18], [-26, 22], [-6, 30], [-20, 44], [-44, 40]]), '#7a5cc8', 7, 0.45) +
    line(c, 'M-44 -16Q-24 -22 -4 -12', '#a888f0', 2.2, 1.5, 0.5) +
    line(c, 'M0 -12Q34 18 64 52', '#b898ff', 3, 2.5, 0.45) +
    blob(c, ell(40, 34, 12, 26, -30), '#020105', 6, 0.6) +
    [22, 32, 42].map((y, i) => line(c, `M${18 + i * 8} ${y - 10}Q${30 + i * 8} ${y - 4} ${34 + i * 8} ${y + 6}`, '#020105', 1.8, 0.8, 0.7)).join('') +
    c.strands({ x0: -58, y0: -52, x1: 50, y1: 60, n: 80, a: 150, spread: 30, len: 12, w: 1, cols: ['#5a44a0', '#020105'], op: 0.45 }));
  // upper teeth under the drawn-back lip
  const lip = [[-36, 57], [-16, 61], [6, 63], [28, 62], [46, 63], [60, 72], [70, 74]];
  const lipY = (x) => { for (let i = 0; i < lip.length - 1; i++) if (x <= lip[i + 1][0]) return lerp(lip[i][1], lip[i + 1][1], (x - lip[i][0]) / (lip[i + 1][0] - lip[i][0])); return lip[lip.length - 1][1]; };
  // gums under the drawn-back lip, then needle teeth and long canines
  s += P(sm([...lip.map(([x, y]) => [x, y - 3]), ...lip.slice().reverse().map(([x, y]) => [x, y + 4])]), c.lg([[0, '#6a1a2a'], [1, '#2a0610']], 0, 0, 0, 1));
  const H2 = [8, 11, 8, 12, 10, 12, 28, 10];
  for (let k = 0; k < 8; k++) {
    const t = (k + 0.5) / 8, x = lerp(-28, 64, t), y = lipY(x) + 2, h = H2[k], w = k === 6 ? 4.6 : 2.6;
    s += P(sm([[x - w, y - 2], [x + w, y - 1], [x + w * 0.2 + (k === 6 ? -2 : 0.5), y + h, 0]]), c.lg([[0, '#f4ecd8'], [0.6, '#c8b894'], [1, '#6a5a40']], 0, 0, 0, 1));
  }
  s += S(sm(lip, false), '#020105', 2.4);
  // snarl creases above the lip
  s += line(c, 'M14 50Q34 46 50 54', '#020105', 2, 1, 0.75) + line(c, 'M18 42Q36 38 54 48', '#020105', 1.6, 1, 0.55) + line(c, 'M16 46Q35 42 52 51', '#8a6ad8', 1.2, 0.8, 0.4) + line(c, 'M-30 48Q-10 54 6 56', '#020105', 1.8, 1, 0.6);
  // nose
  s += P(ell(70, 63, 11, 8, 28), c.lg([[0, '#6a5a8a'], [0.5, '#1a1428'], [1, '#020105']])) + `<ellipse cx="66" cy="58" rx="4" ry="2" fill="#e0d4ff" opacity="0.6" transform="rotate(28 66 58)"/>` + P(ell(73, 67, 3, 2, 28), '#000');
  // burning eyes under heavy brows
  const eye = (cx, cy, w, h, sd) => {
    const d = sm([[cx - w * 0.5, cy + h * 0.25 * sd, 0.4], [cx - w * 0.1, cy - h * 0.55], [cx + w * 0.35, cy - h * 0.4], [cx + w * 0.5, cy - h * 0.1 * sd, 0.4], [cx + w * 0.1, cy + h * 0.5], [cx - w * 0.3, cy + h * 0.45]]);
    return P(d, c.rgU([[0, '#ffffff'], [0.3, '#fff3a0'], [0.65, '#ffc21e'], [1, '#d85a06']], cx, cy, w * 0.6)) +
      P(sm([[cx - w * 0.62, cy - h * 0.45, 0], [cx, cy - h * 1.05], [cx + w * 0.62, cy - h * 0.55, 0], [cx, cy - h * 0.62]]), '#020105');
  };
  s += eye(-22, -2, 28, 11, 1) + eye(26, -7, 19, 9, -1);
  s += line(c, 'M-4 -20L2 -6', '#020105', 2, 1, 0.7) + line(c, 'M6 -22L8 -8', '#020105', 2, 1, 0.6);
  s += ear([-50, -18], [-62, -120], [-18, -46], false);
  return s;
}

// Painted smoke: soft translucent puffs swelling and fading along a path, with
// a few paler curling strokes through them. pts = [[x, y], ...].
function smoke(c, pts, { cols = ['#6a48d0', '#3ab0c0'], size = 14, grow = 2.2, op = 0.5, seed = 1, b = 5 } = {}) {
  const R = rng(seed);
  let s = '';
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < 3; k++) {
      const t = (i + k / 3) / (n - 1), a = pts[i], z = pts[i + 1], u = k / 3;
      const x = lerp(a[0], z[0], u) + (R() - 0.5) * size, y = lerp(a[1], z[1], u) + (R() - 0.5) * size;
      const r = size * 1.5 * (0.7 + t * grow) * (0.7 + R() * 0.6), m = 6, q = [];
      for (let j = 0; j < m; j++) { const th = (j / m) * Math.PI * 2 + R(), rr = r * (0.6 + R() * 0.5); q.push([x + Math.cos(th) * rr, y + Math.sin(th) * rr * 0.7]); }
      s += `<path d="${sm(q)}" fill="${cols[(i + k) % cols.length]}" opacity="${r1(Math.min(0.9, op * 1.3 * (1 - t * 0.8) * (0.6 + R() * 0.5)) * 100) / 100}"/>`;
    }
  }
  // paler curling strokes through the smoke
  const core = pts.map(([x, y], i) => [x, y, Math.max(0, size * 0.9 * (1 - i / (n - 1)))]);
  const g = c.lgU([[0, '#e0d0ff', op * 0.45], [0.6, '#b49aff', op * 0.15], [1, '#9a7aff', 0]], pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
  return `<g filter="${c.blur(b)}">${s}</g><path d="${rib(core, 1, 0)}" fill="${g}" filter="${c.blur(4)}"/>`;
}

// Gloom Hound: a gaunt spectral black-violet hound facing right with its head
// turned to the viewer, violet ribs glowing through the hide, burning yellow
// eyes and smoke pouring off it. attack: leaping, mouth blazing.
function hound(c, A) {
  const v = c.vol({ k: 8, b: 6, sc: '#1a1020', so: 0.7, hc: '#b898ff', ho: 0.22, tex: 0.3, tf: 0.05, tc: '#1a1020', seed: 34, rc: '#8a5ac0', ro: 0.25 });
  const vs = c.vol({ k: 5, b: 4, sc: '#1a1020', so: 0.7, hc: '#c8a8ff', ho: 0.3, rc: '#8a5ac0', ro: 0.25 });
  const hide = () => c.lg([[0, '#5a46a0'], [0.3, '#2e2258'], [0.7, '#160f2a'], [1, '#0e0a16']], 0.1, 0, 0.9, 1);
  const far = () => c.lg([[0, '#261c44'], [0.5, '#140e26'], [1, '#0e0a14']], 0.1, 0, 0.9, 1);
  const T = A ? { rot: -18, cx: 320, cy: 240, dx: 14, dy: -36 } : { rot: 0, cx: 0, cy: 0, dx: 0, dy: 0 };
  const tp = (x, y) => xf([[x, y]], T)[0];
  const tr = `translate(${T.dx} ${T.dy}) rotate(${T.rot} ${T.cx} ${T.cy})`;

  // a paw: long toes and hooked claws, pointing along ang (degrees, 0 = right)
  const paw = (x, y, ang, w, dark) => {
    const R = (pts) => xf(pts, { rot: ang }).map(([px, py, ...r]) => [px + x, py + y, ...r]);
    const d = sm(R([[-w * 0.5, -12], [w * 0.15, -14], [w * 0.6, -4], [w * 0.72, 6], [w * 0.4, 10, 0], [-w * 0.55, 10, 0]]));
    let s = P(d, dark ? far() : hide(), `filter="${vs}"`);
    s += c.inside(d, [0.02, 0.3, 0.55].map((t) => { const [p, q] = R([[w * t, -8], [w * t + 3, 8]]); return line(c, `M${r1(p[0])} ${r1(p[1])}L${r1(q[0])} ${r1(q[1])}`, '#1a1020', 3, 1.2, 0.7); }).join('') +
      blob(c, ell(...R([[0, -10]])[0], w * 0.4, 5), '#8a6ad8', 3, dark ? 0.2 : 0.45));
    for (const t of [0.12, 0.4, 0.66]) {
      const cl = sm(R([[w * t - 1, 3], [w * t + 7, 2], [w * t + 15, 13, 0], [w * t + 3, 9]]));
      s += P(cl, c.lg([[0, '#efe4d0'], [1, '#6a5a48']]));
    }
    return s;
  };
  // a leg from asymmetric knots [x, y, back half-width, front half-width]:
  // muscle bellies bulge, joints pinch, sinew and bone show under thin hide
  const leg = (pts, dark, seed) => {
    const d0 = rib2(pts);
    const rp = d0.pts;
    const d = tuft(rp.map((p, i) => [p[0], p[1], p[2] ?? 1, i > 0 && i < pts.length - 2 ? 6 : 0]), { seed, lean: 1.4, n: 2, jit: 0.85 });
    let s = P(d, dark ? far() : hide(), `filter="${vs}"`);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const lit = sm(pts.map((p) => [p[0] + (p[3] - p[2]) * 0.2 - Math.min(p[2], p[3]) * 0.3, p[1], 1]), false);
    s += c.inside(d,
      c.glaze({ x0: Math.min(...xs) - 20, y0: Math.min(...ys), x1: Math.max(...xs) + 20, y1: Math.max(...ys), n: 8, cols: dark ? ['#3a2c66', '#0e0a16'] : ['#6a4ab8', '#1a1030', '#9a7ae8'], op: 0.25, size: 20, b: 5 }) +
      line(c, lit, dark ? '#5a46a0' : '#a888f0', 6, 4, dark ? 0.3 : 0.5) +
      blob(c, ell(pts[2][0] - 2, pts[2][1], (pts[2][2] + pts[2][3]) * 0.45, (pts[2][2] + pts[2][3]) * 0.5), dark ? '#4a3a80' : '#b498ff', 5, 0.3) +
      c.strokes({ x0: Math.min(...xs) - 20, y0: Math.min(...ys), x1: Math.max(...xs) + 20, y1: Math.max(...ys), n: 14, a: 100, len: 26, w: 5, cols: ['#0e0a16', '#3a2c66'], op: 0.45 }));
    return s;
  };

  // legs: [x, y, back, front] knots from the top of the limb down to the paw
  let farLegs, nearLegs;
  if (!A) {
    farLegs = leg([[470, 190, 28, 28], [462, 256, 26, 28], [452, 306, 16, 16], [456, 346, 13, 14], [462, 404, 9, 9], [466, 430, 8, 9], [472, 456, 9, 9]], true, 911) + paw(478, 464, 0, 30, true) +
      leg([[262, 190, 32, 32], [274, 256, 28, 32], [282, 306, 16, 16], [262, 344, 20, 11], [244, 380, 14, 8], [240, 416, 8, 8], [240, 452, 8, 8]], true, 912) + paw(246, 464, 0, 28, true);
    nearLegs = leg([[444, 176, 36, 36], [438, 250, 34, 40], [428, 306, 24, 18], [432, 346, 17, 18], [438, 402, 11, 10], [442, 430, 10, 10], [448, 458, 10, 11]], false, 913) + paw(456, 468, 0, 34, false) +
      leg([[214, 180, 40, 36], [226, 250, 44, 34], [248, 310, 18, 17], [230, 348, 23, 12], [210, 384, 15, 9], [208, 418, 9, 9], [210, 454, 9, 9]], false, 914) + paw(218, 468, 0, 32, false);
  } else {
    const nf = tp(444, 176), ff = tp(470, 190), nh = tp(214, 180), fh = tp(262, 190);
    farLegs = leg([[ff[0], ff[1], 28, 28], [504, 214, 24, 26], [540, 234, 15, 15], [560, 238, 11, 12], [582, 236, 9, 9]], true, 921) + paw(588, 236, -6, 30, true) +
      leg([[fh[0], fh[1], 32, 32], [214, 256, 28, 32], [196, 308, 16, 16], [164, 344, 18, 11], [140, 394, 10, 8], [128, 440, 8, 8]], true, 922) + paw(126, 458, 40, 28, true);
    nearLegs = leg([[nf[0], nf[1], 36, 36], [492, 236, 32, 38], [526, 270, 20, 18], [550, 282, 14, 15], [576, 286, 10, 10]], false, 923) + paw(584, 288, 4, 34, false) +
      leg([[nh[0], nh[1], 40, 36], [168, 254, 44, 34], [158, 310, 18, 17], [124, 348, 22, 12], [96, 394, 12, 9], [82, 440, 9, 9]], false, 924) + paw(80, 460, 46, 32, false);
  }

  // body: hollow flanks, ribs and hip bones; ragged hide trailing backward
  const bodyD = tuft([[452, 148], [420, 126, 1, 5], [386, 132, 1, 6], [348, 144, 1, 6], [310, 148, 1, 6], [272, 142, 1, 7], [238, 136, 1, 7], [206, 144, 1, 8], [178, 156, 1, 8], [158, 176, 1, 8], [150, 208, 1, 7], [156, 242], [178, 270], [212, 290], [246, 292], [256, 266, 1, 5], [266, 238, 1, 5], [294, 224, 1, 6], [332, 246, 1, 6], [372, 278, 1, 6], [410, 298, 1, 6], [440, 304], [464, 270], [470, 226]], { seed: 91, lean: -1.4, n: 2.2, jit: 0.8 });
  let bd = P(bodyD, hide(), `filter="${v}"`);
  // ribs: each one different in spacing, length, curve and glow
  const Rr = rng(77);
  let ribs = '', ribGlow = '';
  let x0 = 318;
  for (let k = 0; k < 7; k++) {
    x0 += 13 + Rr() * 7;
    const y0 = 154 + k * 1.2 + (Rr() - 0.5) * 4, yb = 254 + k * 6 - (k > 4 ? (k - 4) * 9 : 0) + (Rr() - 0.5) * 10;
    const bow = 24 + Rr() * 14, lean = -8 + k * 2 + (Rr() - 0.5) * 6, w = 7 + Rr() * 3;
    const d = `M${r1(x0)} ${r1(y0)}C${r1(x0 - bow)} ${r1(y0 + 34)} ${r1(x0 - bow)} ${r1(yb - 40)} ${r1(x0 + lean)} ${r1(yb)}`;
    const g = `M${r1(x0 + 9)} ${r1(y0 + 4)}C${r1(x0 - bow + 10)} ${r1(y0 + 38)} ${r1(x0 - bow + 10)} ${r1(yb - 36)} ${r1(x0 + lean + 9)} ${r1(yb + 2)}`;
    ribs += line(c, g, '#140c1c', w + 3, 4, 0.8) + line(c, d, '#7a52e0', w, 2.5, 0.6 + Rr() * 0.2) + line(c, d, '#c4a4ff', w * 0.45, 1.4, 0.75 + Rr() * 0.2);
    ribGlow += line(c, d, '#9a6aff', w * 2.4, 7, 0.22 + Rr() * 0.1);
  }
  ribs += blob(c, sm([[300, 250], [440, 270], [430, 310], [300, 300]]), '#140c1c', 12, 0.6);
  let spine = '';
  for (let k = 0; k < 11; k++) { const x = 230 + k * 18 + (Rr() - 0.5) * 5, y = 142 + Math.sin(k * 0.5) * 3; spine += P(ell(x, y + 6, 7 + Rr() * 2, 5), '#9a7ae8', `filter="${c.blur(2.5)}" opacity="${r1((0.4 + Rr() * 0.25) * 100) / 100}"`); }
  bd += c.inside(bodyD,
    c.glaze({ x0: 150, y0: 130, x1: 470, y1: 300, n: 18, cols: ['#4a3488', '#160e24', '#2a1c50', '#6a2a6a'], op: 0.3, size: 46, b: 9 }) +
    blob(c, sm([[260, 224], [300, 226], [334, 252], [300, 270], [262, 262]]), '#140c1c', 10, 0.6) +
    ribs + spine +
    // haunch, shoulder blade, hip bone
    blob(c, ell(206, 200, 36, 54, -20), '#3a2c66', 12, 0.55) + blob(c, ell(212, 164, 18, 11), '#b498ff', 6, 0.55) +
    line(c, 'M234 172Q246 230 250 284', '#140c1c', 10, 6, 0.55) + line(c, 'M190 186Q204 236 224 280', '#8a6ad8', 6, 4, 0.4) +
    line(c, 'M452 160Q440 220 446 292', '#140c1c', 10, 6, 0.55) + blob(c, ell(410, 176, 24, 32, 20), '#3a2c66', 10, 0.55) + line(c, 'M396 150Q420 170 430 210', '#b498ff', 6, 4, 0.4) +
    c.strokes({ x0: 150, y0: 126, x1: 470, y1: 306, n: 70, a: 172, len: 30, w: 5, cols: ['#0e0a16', '#3a2c66', '#140c1c'], op: 0.4 }));
  const tail = A ? [[170, 162, 18], [134, 160, 13], [100, 150, 9], [70, 134, 6], [46, 116, 0]] : [[166, 166, 18], [134, 184, 13], [102, 194, 9], [72, 188, 6], [46, 172, 0]];
  bd = P(tuft(ribPts(tail, 1, 0).map((p) => [p[0], p[1], p[2] ?? 1, 5]), { seed: 97, lean: -1, n: 2 }), hide(), `filter="${vs}"`) + bd;
  const neck = rib([[470, 134, 58], [450, 178, 68], [436, 222, 76]]);
  bd += P(neck, hide(), `filter="${v}"`) + c.inside(neck, line(c, 'M484 142Q466 182 458 228', '#140c1c', 8, 5, 0.55) + line(c, 'M452 138Q438 172 430 212', '#9a7ae8', 6, 4, 0.45) + c.strokes({ x0: 420, y0: 120, x1: 500, y1: 240, n: 16, a: 110, len: 28, w: 5, cols: ['#0e0a16', '#4a3a80'], op: 0.45 }));

  let s = farLegs + G(bd, `transform="${tr}"`) + nearLegs;
  const H = A ? [500, 126] : tp(488, 120);
  const hs = A ? 0.9 : 0.86, hr = A ? -8 : 6;
  s += G(houndHead(c, A ? 30 : 3, A), `transform="translate(${r1(H[0])} ${r1(H[1])}) rotate(${hr}) scale(${hs})"`);

  // smoke pouring off the back and unravelling from the tail and hocks
  const W = (pts) => pts.map(([x, y]) => tp(x, y));
  let back = halo(c, H[0] - 10, H[1] - 10, 120, 100, '#7a5ad0', 0.22);
  const tt = A ? [46, 116] : [46, 172];
  back += smoke(c, W([[240, 140], [200, 116], [166, 104], [134, 102], [116, 108]]), { cols: ['#5a3cc0', '#2a1a60', '#3ab0c0'], size: 15, grow: 1.4, op: 0.55, seed: 3, b: 6 });
  back += smoke(c, W([[330, 140], [294, 112], [254, 94], [214, 84]]), { cols: ['#3a8ab0', '#4a30a0'], size: 13, grow: 1.6, op: 0.45, seed: 4, b: 6 });
  back += smoke(c, W([[420, 128], [404, 100], [384, 80], [362, 68]]), { cols: ['#6a48d0', '#2a1a60'], size: 10, grow: 1.4, op: 0.4, seed: 5, b: 5 });
  let front = smoke(c, W([[tt[0] + 6, tt[1]], [tt[0] + 8, tt[1] - 12], [tt[0] + 16, tt[1] - 24], [tt[0] + 28, tt[1] - 36]]), { cols: ['#9a72ff', '#3ab0c0'], size: 9, grow: 1.4, op: 0.6, seed: 6, b: 3 });
  front += smoke(c, W([[160, 240], [134, 252], [112, 258], [96, 258]]), { cols: ['#6a48d0', '#3ab0c0'], size: 11, grow: 1.5, op: 0.45, seed: 7, b: 5 });
  front += smoke(c, W([[300, 286], [262, 304], [222, 312]]), { cols: ['#3ab0c0', '#6a48d0'], size: 9, op: 0.35, seed: 8, b: 4 });
  if (!A) {
    front += smoke(c, [[206, 380], [176, 392], [146, 398], [116, 396]], { cols: ['#3ab0c0', '#6a48d0'], size: 8, op: 0.4, seed: 9, b: 4 });
    front += smoke(c, [[436, 340], [410, 356], [384, 364]], { cols: ['#6a48d0'], size: 7, op: 0.35, seed: 10, b: 4 });
  } else {
    front += smoke(c, [[118, 360], [102, 364], [88, 364], [78, 360]], { cols: ['#3ab0c0', '#6a48d0'], size: 8, op: 0.45, seed: 9, b: 4 });
    front += smoke(c, [[150, 300], [112, 292], [70, 286]], { cols: ['#6a48d0'], size: 9, op: 0.4, seed: 10, b: 5 });
  }

  // glows: eyes, ribs, the blazing mouth
  const hp = (x, y) => { const a = (hr * Math.PI) / 180; return [H[0] + (x * Math.cos(a) - y * Math.sin(a)) * hs, H[1] + (x * Math.sin(a) + y * Math.cos(a)) * hs]; };
  const [ex, ey] = hp(-22, -2), [fx, fy] = hp(26, -7);
  let glow = `<g transform="${tr}">${ribGlow}</g>`;
  glow += `<circle cx="${r1(ex)}" cy="${r1(ey)}" r="22" fill="#ffaa18" opacity="0.5" filter="${c.blur(9)}"/><circle cx="${r1(fx)}" cy="${r1(fy)}" r="17" fill="#ffaa18" opacity="0.45" filter="${c.blur(8)}"/>`;
  glow += `<ellipse cx="${r1(ex)}" cy="${r1(ey)}" rx="10" ry="6" fill="#fff8d0" opacity="0.75" filter="${c.blur(2.5)}"/><ellipse cx="${r1(fx)}" cy="${r1(fy)}" rx="7" ry="5" fill="#fff8d0" opacity="0.65" filter="${c.blur(2)}"/>`;
  if (A) {
    const [mx, my] = hp(26, 86);
    glow += `<ellipse cx="${r1(mx)}" cy="${r1(my)}" rx="74" ry="52" fill="#ff8a10" opacity="0.45" filter="${c.blur(18)}"/><ellipse cx="${r1(mx)}" cy="${r1(my)}" rx="32" ry="24" fill="#ffe680" opacity="0.65" filter="${c.blur(8)}"/>`;
    const Rf = rng(5);
    for (const [x, y, a, L] of [[40, 96, 40, 44], [20, 100, 70, 48], [56, 90, 20, 50], [0, 92, 95, 36], [64, 96, 0, 40]]) {
      const [X, Y] = hp(x, y); const rad = ((a + hr) * Math.PI) / 180;
      const pts = [[X, Y, 16], [X + Math.cos(rad) * L * 0.5 + 4, Y + Math.sin(rad) * L * 0.5, 11], [X + Math.cos(rad) * L - 6, Y + Math.sin(rad) * L - 10, 0]];
      glow += `<path d="${rib(pts, 1, 0)}" fill="${c.lgU([[0, '#fff2a0', 0.95], [0.5, '#ffb020', 0.8], [1, '#ff5010', 0]], pts[0][0], pts[0][1], pts[2][0], pts[2][1])}" filter="${c.blur(2.5)}"/>`;
    }
    // embers
    for (let k = 0; k < 9; k++) {
      const [X, Y] = hp(70 + Rf() * 90, 40 + Rf() * 90);
      glow += `<circle cx="${r1(Math.min(618, X))}" cy="${r1(Math.max(14, Y))}" r="${r1(2.5 + Rf() * 2.5)}" fill="#ffd060" opacity="${r1((0.5 + Rf() * 0.4) * 100) / 100}" filter="${c.blur(1.2)}"/>`;
    }
  }
  return `${back}<g filter="${c.fx({ seed: 13, rim: 0.85 })}">${s}</g>${front}${glow}`;
}

// ---------------------------------------------------------------- wraith
// A long bony clawed hand: wrist at (x, y), pointing along ang (degrees), the
// fingers fanned by spread and bent by curl (degrees per joint). side mirrors
// the thumb.
function clawHand(c, x, y, ang, { spread = 1, curl = 10, size = 1, side = 1, skin = ['#e4e8ee', '#9aa2b2', '#3a4050'], claw = '#141018' } = {}) {
  const R = (pts) => xf(pts, { rot: ang, sy: side }).map(([px, py, ...r]) => [px * size + x, py * size + y, ...r]);
  const g = () => c.lg([[0, skin[0]], [0.5, skin[1]], [1, skin[2]]], 0.1, 0, 0.9, 1);
  const v = c.vol({ k: 3, b: 2, so: 0.6, ho: 0.3, sc: '#0a0c14' });
  let s = '';
  const finger = (bx, by, a0, lens, ws) => {
    const pts = [[bx, by, ws[0]]];
    let px = bx, py = by, a = a0;
    lens.forEach((L, i) => {
      a += curl * (i + 1) * 0.6;
      const rad = (a * Math.PI) / 180;
      px += Math.cos(rad) * L; py += Math.sin(rad) * L;
      pts.push([px, py, ws[i + 1]]);
    });
    const d = rib(R(pts));
    let f = P(d, g(), `filter="${v}"`);
    // knuckle bumps
    f += c.inside(d, pts.slice(1, -1).map(([kx, ky, kw]) => { const [[X, Y]] = R([[kx, ky]]); return `<circle cx="${r1(X)}" cy="${r1(Y)}" r="${r1(kw * size * 0.55)}" fill="#ffffff" opacity="0.18" filter="${c.blur(1)}"/>` + line(c, `M${r1(X - 2)} ${r1(Y - 2)}L${r1(X + 2)} ${r1(Y + 2)}`, '#2a3040', 1.2, 0.5, 0.5); }).join(''));
    // the claw
    a += curl * 1.2;
    const rad = (a * Math.PI) / 180;
    const [tx, ty] = [px + Math.cos(rad) * 16, py + Math.sin(rad) * 16];
    const cd = rib(R([[px - Math.cos(rad) * 2, py - Math.sin(rad) * 2, ws[ws.length - 1] * 0.95], [lerp(px, tx, 0.5), lerp(py, ty, 0.5), ws[ws.length - 1] * 0.6], [tx, ty, 0]]), 0.5);
    f += P(cd, c.lg([[0, '#5a5060'], [0.5, claw], [1, '#000000']])) + c.inside(cd, blob(c, cd, '#c8c0d8', 1, 0.25));
    return f;
  };
  // palm
  const palm = sm(R([[-4, -9], [16, -13], [34, -12], [38, 0], [34, 12], [16, 13], [-4, 9]]));
  const fs = [[-11, -22 * spread, [26, 20, 15], [7, 6.4, 5.2, 4.4]], [-3.5, -7 * spread, [30, 22, 17], [7.4, 6.8, 5.6, 4.6]], [4, 8 * spread, [28, 21, 16], [7.2, 6.6, 5.4, 4.4]], [11, 22 * spread, [22, 17, 13], [6.4, 5.8, 4.8, 4]]];
  // fingers behind palm on the far side first
  s += P(palm, g(), `filter="${v}"`);
  s += c.inside(palm, [-7, 0, 7].map((o) => { const [[a1, b1], [a2, b2]] = R([[8, o * 0.6], [30, o]]); return line(c, `M${r1(a1)} ${r1(b1)}L${r1(a2)} ${r1(b2)}`, '#ffffff', 2, 1, 0.3); }).join(''));
  for (const [oy, a, lens, ws] of fs) s += finger(33, oy, a, lens, ws);
  // thumb
  s += finger(8, -11, -58 * spread, [18, 14], [8, 6.5, 5]);
  return s;
}

// Ragged hem points from right (x1) to left (x0) at height y: hanging strips of
// uneven length with sharp tips. Returned for splicing into an outline.
function ragHem(x1, x0, y, n, minL, maxL, seed, sway = 10) {
  const R = rng(seed);
  const out = [];
  for (let k = 0; k < n; k++) {
    const xa = lerp(x1, x0, k / n), xm = lerp(x1, x0, (k + 0.45 + R() * 0.1) / n);
    out.push([xa, y + (R() - 0.5) * 22 - R() * 10, 0.8]);
    const L = lerp(minL, maxL, Math.pow(R(), 1.3));
    out.push([xm + (R() - 0.5) * 2 * sway, y + L, 0]);
  }
  out.push([x0, y, 0.8]);
  return out;
}

// Hooded floating wraith in tattered navy and teal rags, an empty hood with two
// pale eyes, long clawed hands, its hem unravelling into mist. attack: arms
// flung wide, claws spread, eyes flaring.
function wraith(c, A) {
  const cloth = c.vol({ k: 10, b: 8, sc: '#02030a', so: 0.6, hc: '#9fd0ff', ho: 0.16, tex: 0.3, tf: 0.03, tc: '#000', seed: 44 });
  const clothS = c.vol({ k: 6, b: 5, sc: '#02030a', so: 0.6, hc: '#9fd0ff', ho: 0.2, tex: 0.3, tf: 0.04, tc: '#000', seed: 45 });
  const robe = () => c.lg([[0, '#4a68b8'], [0.25, '#26397a'], [0.6, '#141f48'], [1, '#060a1c']], 0.15, 0, 0.85, 1);
  const robeDark = () => c.lg([[0, '#1e3068'], [0.5, '#0e1636'], [1, '#03050c']], 0.15, 0, 0.85, 1);
  const teal = () => c.lg([[0, '#3ab8c0'], [0.5, '#16707e'], [1, '#062a34']], 0.15, 0, 0.85, 1);
  let s = '', mist = '', glow = '';
  const hem = 560;
  // teal-lined rags hanging behind, longer than the robe
  const backHem = ragHem(418, 142, hem - 20, 8, 30, 110, A ? 211 : 201, 16);
  const backD = sm([[180, 220, 1], [380, 220, 1], [414, 360], [418, hem - 40], ...backHem, [142, hem - 40], [146, 360]]);
  s += P(backD, teal(), `filter="${cloth}"`);
  s += c.inside(backD, blob(c, ell(280, 420, 130, 200), '#02060c', 30, 0.7));
  // main robe tapering to long uneven rags
  const bodyHem = ragHem(374, 186, hem, 7, 20, 90, A ? 223 : 213, 12);
  const body = sm([[280, 186], [346, 194], [384, 222], [402, 270], [404, 330], [398, 410], [386, 490], [374, hem], ...bodyHem, [174, 490], [162, 410], [156, 330], [158, 270], [176, 222], [214, 194]]);
  s += P(body, robe(), `filter="${cloth}"`);
  let folds = '';
  [170, 200, 230, 262, 296, 328, 360, 390].forEach((x, i) => {
    const top = 222 + Math.abs(x - 280) * 0.1, spreadX = (x - 280) * 0.06;
    folds += line(c, `M${x} ${top}Q${x + spreadX * 0.5} ${top + 180} ${x + spreadX} ${hem + 90}`, '#02040c', 13, 8, 0.6);
    folds += line(c, `M${x + 13} ${top + 10}Q${x + 13 + spreadX * 0.5} ${top + 180} ${x + 13 + spreadX} ${hem + 80}`, i < 4 ? '#5aa8d8' : '#2a9aa6', 3.5, 3, i < 4 ? 0.5 : 0.38);
  });
  // tears in the cloth
  const tear = (x, y, w, h, sd) => { const d = tuft([[x - w, y], [x, y - h], [x + w, y + 4], [x + 2, y + h]], { def: 5, seed: sd, n: 2, jit: 0.9 }); return P(d, '#02030a', 'opacity="0.85"') + S(d, '#4a7ac0', 1.2, 'opacity="0.35"'); };
  s += c.inside(body, folds +
    blob(c, ell(370, 420, 70, 200), '#02030a', 30, 0.5) + blob(c, ell(200, 300, 50, 110), '#6a8ad8', 30, 0.22) +
    c.glaze({ x0: 140, y0: 200, x1: 420, y1: 620, n: 16, cols: ['#2a4a9a', '#0e1838', '#1a6a7a', '#3a2a6a'], op: 0.28, size: 60, b: 12 }) +
    c.strokes({ x0: 140, y0: 200, x1: 420, y1: 640, n: 60, a: 90, spread: 5, len: 60, w: 6, cols: ['#0a1020', '#3a5aa8', '#1a7a86'], op: 0.35 }) +
    line(c, 'M150 336Q280 360 410 336', '#070b1a', 15, 3, 0.9) + line(c, 'M150 330Q280 354 410 330', '#4a7ab0', 3, 2, 0.5));
  s += P(ell(276, 350, 13, 10), c.lg([[0, '#3a5a90'], [1, '#0a0f22']]), `filter="${clothS}"`) +
    P(rib([[272, 358, 9], [266, 410, 7], [270, 452, 5], [262, 476, 0]]), c.lg([[0, '#2a4a80'], [1, '#080c1c']]), `filter="${clothS}"`) +
    P(rib([[282, 358, 9], [292, 404, 7], [290, 444, 0]]), c.lg([[0, '#2a4a80'], [1, '#080c1c']]), `filter="${clothS}"`);

  // sleeves: long bell sleeves whose rags hang below the arm
  const sleeve = (side) => {
    const m = (pts) => (side > 0 ? pts : pts.map(([x, y, ...r]) => [560 - x, y, ...r]));
    let d, hand, crease, lit;
    if (!A) {
      d = sm(m([[160, 202], [212, 212], [232, 290], [244, 376], [250, 404, 0.5], ...ragHem(250, 150, 404, 4, 26, 74, 241 + side, 6), [138, 380], [136, 300], [144, 240]]));
      hand = side > 0 ? [214, 398, 78, 0.75, 20] : [346, 398, 102, 0.75, 20];
      crease = m([[196, 222], [206, 310], [214, 400]]); lit = m([[160, 230], [158, 310], [160, 390]]);
    } else {
      d = sm(m([[150, 206], [206, 222], [192, 196], [150, 166], [116, 140, 0.5], [86, 172, 0.5], ...ragHem(86, 196, 210, 5, 30, 110, 251 + side, 10).map(([x, y, t]) => [x, y + (196 - x) * 0.5, t]), [184, 262]]));
      hand = side > 0 ? [108, 158, -110, 1.3, -4] : [452, 158, -70, 1.3, -4];
      crease = m([[190, 214], [150, 182], [110, 160]]); lit = m([[176, 204], [140, 168], [104, 146]]);
    }
    let sv = P(d, robe(), `filter="${clothS}"`);
    sv += c.inside(d, line(c, sm(crease, false), '#02040c', 12, 7, 0.6) + line(c, sm(lit, false), side > 0 ? '#6ab8e0' : '#2a9aa6', 4, 3.5, 0.45) +
      blob(c, ell(...m([A ? [104, 156] : [200, 404]])[0], 40, 16, A ? -60 * side : 0), '#000000', 9, 0.75));
    const [hx, hy, ha, hsp, hc] = hand;
    return { sv, hand: clawHand(c, hx, hy, ha, { spread: hsp, curl: hc, size: A ? 1.2 : 1.05, side: (side > 0) === !A ? 1 : -1 }) };
  };
  const L = sleeve(1), Rr = sleeve(-1);
  if (A) s += L.hand + Rr.hand + L.sv + Rr.sv; else s += L.sv + Rr.sv + L.hand + Rr.hand;

  // hood and its empty dark opening
  const hood = tuft([[280, 22], [304, 30], [330, 52], [346, 86], [354, 128], [360, 170], [384, 196], [400, 222], [340, 236], [280, 244], [220, 236], [160, 222], [176, 196], [200, 170], [206, 128], [214, 86], [230, 52], [256, 30]], { seed: 131, lean: 0.2, n: 1.6, jit: 0.8 });
  s += P(hood, robe(), `filter="${cloth}"`);
  const opening = sm([[280, 66], [310, 74], [328, 100], [334, 140], [326, 180], [304, 206], [280, 212], [256, 206], [234, 180], [226, 140], [232, 100], [250, 74]]);
  s += c.inside(hood, line(c, 'M300 32Q340 70 346 150', '#7ab8f0', 5, 5, 0.35) + line(c, 'M250 38Q222 80 220 150', '#9fd0ff', 4, 4, 0.3) +
    line(c, 'M210 190Q240 222 280 228Q320 222 350 190', '#02040c', 10, 6, 0.6) + blob(c, opening, '#0a1030', 6, 0.9) +
    c.strands({ x0: 200, y0: 30, x1: 360, y1: 240, n: 60, a: 100, spread: 20, len: 30, w: 1, cols: ['#02040c', '#5a88c8'], op: 0.3 }));
  s += P(opening, c.rgU([[0, '#0c1828'], [0.6, '#03050c'], [1, '#000000']], 280, 150, 80));
  s += S(sm([[234, 180], [226, 140], [232, 100], [250, 74], [280, 66], [310, 74], [328, 100], [334, 140], [326, 180]], false), c.lgU([[0, '#6a98d8'], [1, '#14204a']], 230, 70, 330, 190), 6, 'opacity="0.85"');
  const er = A ? 1.35 : 1;
  for (const [ex, ey] of [[258, 136], [302, 136]]) {
    s += P(sm([[ex - 9 * er, ey + 1], [ex - 2, ey - 4.5 * er], [ex + 8 * er, ey - 2], [ex + 9 * er, ey + 1.5], [ex, ey + 4 * er]]), c.rgU([[0, '#ffffff'], [0.5, '#d8f0ff'], [1, '#7ac8f0']], ex, ey, 10 * er));
    glow += `<ellipse cx="${ex}" cy="${ey}" rx="${18 * er}" ry="${10 * er}" fill="#8fd4ff" opacity="${A ? 0.75 : 0.5}" filter="${c.blur(A ? 9 : 6)}"/>`;
    if (A) glow += `<ellipse cx="${ex}" cy="${ey}" rx="40" ry="16" fill="#bfe6ff" opacity="0.35" filter="${c.blur(14)}"/>` + `<path d="M${ex - 30} ${ey}L${ex + 30} ${ey}" stroke="#e8f6ff" stroke-width="2" opacity="0.6" filter="${c.blur(1.5)}"/>`;
  }
  glow += `<ellipse cx="280" cy="150" rx="46" ry="54" fill="#2a6a9a" opacity="0.18" filter="${c.blur(18)}"/>`;

  // mist: every rag tip unravels into a fading strip; a faint glow below
  const R = rng(A ? 7 : 5);
  let fade = '';
  const unravel = (pts, cols, wide) => {
    pts.forEach(([x, y, t], i) => {
      if (t !== 0) return;
      const len = 40 + R() * 46, sway = (R() - 0.5) * 26, w = wide * (0.7 + R() * 0.5);
      const y0 = y - 34, y1 = Math.min(y + len, 688);
      const q = [[x - sway * 0.2, y0, w], [x, y - 6, w * 0.8], [x + sway * 0.5, lerp(y, y1, 0.5), w * 0.55], [x + sway, y1, 0]];
      const col = cols[i % cols.length];
      fade += `<path d="${rib(q, 1, 0)}" fill="${c.lgU([[0, col, 0], [0.2, col, 0.92], [0.55, col, 0.55], [1, col, 0]], x, y0, x + sway, y1)}" filter="${c.blur(1.6)}"/>`;
      fade += `<path d="${rib(q.map(([a, b, ww]) => [a, b, ww * 0.25]), 1, 0)}" fill="${c.lgU([[0, '#7ab8e8', 0], [0.3, '#7ab8e8', 0.22], [1, '#7ab8e8', 0]], x, y0, x + sway, y1)}" filter="${c.blur(1.2)}"/>`;
    });
  };
  unravel(backHem, ['#0f4650', '#0c3a44'], 20);
  unravel(bodyHem, ['#0e1a40', '#13224e', '#0e1a40'], 26);
  for (let k = 0; k < 5; k++) {
    const x = 190 + k * 45 + (R() - 0.5) * 20, y = hem + 80 + R() * 20;
    mist += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(34 + R() * 20)}" ry="${r1(9 + R() * 6)}" fill="${k % 2 ? '#3aa6b8' : '#2a3c88'}" opacity="${r1(0.12 + R() * 0.08)}" filter="${c.blur(10)}"/>`;
  }
  return `${halo(c, 280, 150, 150, 140, '#5aa0e0', 0.22)}${mist}<g filter="${c.fx({ seed: 17, rim: 0.85 })}">${s}</g>${fade}${glow}`;
}

// ---------------------------------------------------------------- undead kit
const BONE = ['#ece4cc', '#b8ae94', '#6a604c', '#2e281e'];
const boneFill = (c) => c.lg([[0, BONE[0]], [0.4, BONE[1]], [0.8, BONE[2]], [1, BONE[3]]], 0.1, 0, 0.9, 1);
// A long bone between a and b: knobbly ends, a slimmer shaft.
function bone(c, a, b, w, { w1 = w, dark = 0 } = {}) {
  const m1 = mix2(a, b, 0.2), m2 = mix2(a, b, 0.8), mid = mix2(a, b, 0.5);
  const d = rib([[a[0], a[1], w * 1.35], [m1[0], m1[1], w * 0.8], [mid[0], mid[1], (w + w1) * 0.33], [m2[0], m2[1], w1 * 0.8], [b[0], b[1], w1 * 1.35]]);
  const f = dark ? c.lg([[0, '#8a8068'], [0.5, '#5a5242'], [1, '#1e1a14']], 0.1, 0, 0.9, 1) : boneFill(c);
  return P(d, f, `filter="${c.vol({ k: 3, b: 2.2, sc: '#140e08', so: 0.6, ho: 0.3, tex: 0.3, tf: 0.12, tc: '#2a2010', seed: 52 })}"`) +
    c.inside(d, line(c, `M${r1(m1[0] - 2)} ${r1(m1[1])}L${r1(m2[0] - 2)} ${r1(m2[1])}`, '#fffbe8', 1.4, 0.8, dark ? 0.15 : 0.45));
}
// Chain mail, painted: dark steel glazed with rust, the rings suggested by
// broken rows of highlight dabs that catch the key light (denser and brighter
// toward the upper left, fading into the shadow side), never a repeat pattern.
function mail(c, d, { rust = 0.5, seed = 1, dark = 0 } = {}) {
  const nums = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) { x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]); y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]); }
  const R = rng(seed * 31 + 7);
  const lightAt = (x, y) => 1 - Math.min(1, Math.max(0, ((x - x0) / (x1 - x0 || 1)) * 0.55 + ((y - y0) / (y1 - y0 || 1)) * 0.45));
  let dabs = '';
  for (let y = y0 + 4; y < y1; y += 8 + R() * 3) {
    const sh = (R() - 0.5) * 6;
    for (let x = x0 + sh; x < x1; x += 9 + R() * 6) {
      const L = lightAt(x, y);
      if (R() > 0.25 + L * 0.6) continue;
      const w = 6 + R() * 4, bend = 2 + R() * 2;
      const col = L > 0.55 ? (R() < 0.3 ? '#f0d8b0' : '#c8ccd0') : (R() < 0.5 ? '#7a7e86' : '#8a6a50');
      dabs += `<path d="M${r1(x - w / 2)} ${r1(y)}Q${r1(x)} ${r1(y - bend)} ${r1(x + w / 2)} ${r1(y + 1)}" stroke="${col}" stroke-width="${r1(2.6 + R() * 1.6)}" opacity="${r1((0.35 + L * 0.55) * (0.6 + R() * 0.4) * 100) / 100}"/>`;
      if (R() < 0.35) dabs += `<path d="M${r1(x - 3)} ${r1(y + 4)}l${r1(6 + R() * 3)} ${r1(R() * 2)}" stroke="#1e1a18" stroke-width="3" opacity="0.5"/>`;
    }
  }
  const base = c.lg([[0, '#6a6c70'], [0.35, '#44464a'], [0.75, '#2a2624'], [1, '#1e1814']], 0.15, 0, 0.85, 1);
  return G(P(d, base) + c.inside(d,
    c.glaze({ x0, y0, x1, y1, n: Math.max(6, Math.round(((x1 - x0) * (y1 - y0)) / 2500)), cols: ['#8a4a1c', '#5a2e10', '#3a3c40', '#a05a22'], op: rust * 0.45, size: 26, b: 6 }) +
    `<g fill="none" stroke-linecap="round">${dabs}</g>` +
    `<rect x="${r1(x0 - 10)}" y="${r1(y0 - 10)}" width="${r1(x1 - x0 + 20)}" height="${r1(y1 - y0 + 20)}" fill="${c.lgU([[0, '#ffe0b0', 0.12], [0.5, '#000000', 0], [1, '#2a1a12', 0.35 + dark * 0.25]], x0, y0, x1, y1)}"/>`),
    `filter="${c.vol({ k: 8, b: 6, sc: '#2a1a12', so: 0.6, ho: 0.25, tex: 0.3, tf: 0.05, tc: '#4a200a', seed: 53 })}"`);
}
// Rusted iron: mottled orange-brown with pitting.
const rustFill = (c) => c.lg([[0, '#e09048'], [0.3, '#a4561e'], [0.7, '#5e2c0e'], [1, '#241006']], 0.15, 0, 0.85, 1);
const rustVol = (c) => c.vol({ k: 6, b: 4, sc: '#120804', so: 0.6, ho: 0.3, tex: 0.6, tf: 0.09, tc: '#2a1206', seed: 54 });
// Skeletal hand gripping something at (x, y); ang = grip axis.
function boneFist(c, x, y, ang, side) {
  const R = (pts) => xf(pts, { rot: ang - 90, sx: side }).map(([px, py, ...r]) => [px + x, py + y, ...r]);
  let s = P(sm(R([[-12, -14], [4, -15], [6, 12], [-12, 12]])), boneFill(c), `filter="${c.vol({ k: 2.5, b: 2, sc: '#140e08', so: 0.6, ho: 0.3 })}"`);
  [-9, -3, 3, 9].forEach((fy) => {
    const d = rib(R([[-4, fy, 5.5], [6, fy, 5], [13, fy + 1, 4.5], [12, fy + 4, 3.5]]));
    s += P(d, boneFill(c), `filter="${c.vol({ k: 2, b: 1.5, sc: '#140e08', so: 0.6, ho: 0.35 })}"`);
  });
  s += P(rib(R([[-12, -10, 6], [-2, -16, 5], [8, -15, 4]])), boneFill(c), `filter="${c.vol({ k: 2, b: 1.5, sc: '#140e08', so: 0.6, ho: 0.35 })}"`);
  return s;
}

// ---------------------------------------------------------------- wight
// Barrow-wight: a skeletal warrior in rotted mail and a rusted nasal helm, cold
// blue eye-lights, a round shield of bone, a notched sword. attack: sword raised.
function wight(c, A) {
  let s = '', glow = '';
  const T = A ? { dx: 6, dy: 8, rot: 3, cx: 240, cy: 420 } : { dx: 0, dy: 0, rot: 0, cx: 240, cy: 420 };
  const tp = (x, y) => xf([[x, y]], T)[0];
  const tr = `translate(${T.dx} ${T.dy}) rotate(${T.rot} ${T.cx} ${T.cy})`;
  const maroon = () => c.lg([[0, '#9a2a2a'], [0.4, '#681616'], [1, '#240606']], 0.15, 0, 0.85, 1);
  const cloth = c.vol({ k: 6, b: 5, so: 0.6, ho: 0.2, tex: 0.35, tf: 0.05, tc: '#0a0202', seed: 55 });
  const leather = c.vol({ k: 5, b: 4, so: 0.6, ho: 0.22, tex: 0.4, tf: 0.07, tc: '#120602', seed: 56 });

  // ----- legs: bare bones between the rotted skirt and the boots
  const legs = A ? { l: [[214, 420], [196, 520], [184, 604]], r: [[266, 420], [292, 516], [300, 604]] } : { l: [[214, 420], [206, 520], [202, 604]], r: [[266, 420], [274, 520], [278, 604]] };
  let lg = '';
  for (const [hip, knee, ank] of [legs.l, legs.r]) {
    lg += bone(c, [hip[0], hip[1] + 10], knee, 17, { w1: 15 });
    lg += bone(c, [knee[0] + 5, knee[1] + 8], [ank[0] + 6, ank[1]], 9, { dark: 1 });
    lg += bone(c, [knee[0] - 3, knee[1] + 6], [ank[0] - 3, ank[1]], 13, { w1: 11 });
    lg += P(ell(knee[0], knee[1] + 2, 12, 10), boneFill(c), `filter="${c.vol({ k: 3, b: 2, sc: '#140e08', so: 0.6, ho: 0.35 })}"`);
    // rotted wrappings round the shin
    {
      const p = mix2(knee, ank, 0.62);
      lg += P(sm([[p[0] - 16, p[1] - 6], [p[0] + 14, p[1] - 12], [p[0] + 16, p[1] + 4], [p[0] + 4, p[1] + 26, 0], [p[0] - 2, p[1] + 6], [p[0] - 15, p[1] + 8]]), c.lg([[0, '#6a4a2c'], [1, '#1e1208']]), `filter="${leather}"`);
    }
    // boots
    const bx = ank[0];
    const sd = bx < 240 ? -1 : 1;
    const boot = sm([[bx - 20, 596], [bx - 2, 588], [bx + 20, 594], [bx + 22, 630], [bx + 28 + sd * 6, 652], [bx + 32 + sd * 8, 680, 0], [bx - 32 + sd * 8, 680, 0], [bx - 28 + sd * 4, 652], [bx - 22, 630]]);
    lg += P(boot, c.lg([[0, '#8a5a34'], [0.5, '#4e2c14'], [1, '#1a0c04']]), `filter="${leather}"`);
    lg += c.inside(boot, `<rect x="${bx - 50}" y="670" width="100" height="12" fill="#120804"/>` + line(c, `M${bx - 26} 612Q${bx} 606 ${bx + 26} 612`, '#120804', 3, 1.5, 0.6) +
      line(c, `M${bx - 24} 624L${bx - 30} 660`, '#c08a5a', 3, 2.5, 0.3) + blob(c, ell(bx + 8, 648, 10, 14), '#0a0402', 6, 0.5));
  }
  s += lg;

  // ----- torso
  let tor = '';
  // rotted maroon skirt under the mail
  const skirt = sm([[168, 370], [312, 370], [322, 404], ...ragHem(330, 152, 430, 7, 10, 40, 61, 4), [158, 404]]);
  tor += P(skirt, maroon(), `filter="${cloth}"`);
  tor += c.inside(skirt, [190, 222, 258, 290].map((x) => line(c, `M${x} 380L${x + (x - 240) * 0.1} 470`, '#1a0404', 6, 4, 0.6)).join(''));
  // hauberk with a torn hole that shows the ribs inside
  const hauberk = sm([[176, 170], [240, 164], [304, 170], [322, 196], [316, 250], [302, 296], [310, 340], [324, 392, 0.5], ...ragHem(324, 156, 396, 9, 4, 20, 62, 3), [156, 392, 0.5], [170, 340], [178, 296], [164, 250], [158, 196]]);
  tor += mail(c, hauberk, { rust: 0.55, seed: 7 });
  const hole = tuft([[196, 214], [228, 206], [246, 230], [238, 270], [210, 278], [192, 252]], { def: 4, seed: 63, n: 2.5, jit: 0.9 });
  let cav = P(hole, '#050304');
  for (let k = 0; k < 4; k++) cav += c.inside(hole, bone(c, [246, 216 + k * 15], [196, 228 + k * 15], 6, { w1: 5 }));
  cav += c.inside(hole, bone(c, [240, 206], [242, 280], 9));
  cav += c.inside(hole, blob(c, ell(204, 220, 30, 20), '#000', 6, 0.7) + blob(c, ell(244, 260, 16, 26), '#000', 6, 0.5));
  tor += cav + S(hole, '#8a8e94', 2.4, 'stroke-dasharray="2 2" opacity="0.8"') + S(hole, '#4a2a12', 1, 'opacity="0.7"');
  // belt
  // a cracked leather belt: flat strap, rivets, a rusted buckle and a hanging tongue
  const belt = sm([[178, 302, 0], [240, 309], [302, 302, 0], [302, 318, 0], [240, 325], [178, 318, 0]]);
  tor += ao(c, sm([[150, 296], [330, 296], [330, 350], [150, 350]]), belt, 0, 6, 4, 0.6);
  tor += P(belt, c.lg([[0, '#5a3a22'], [0.5, '#3a2212'], [1, '#160a04']], 0, 0, 0, 1), `filter="${c.vol({ k: 2, b: 1.5, so: 0.5, ho: 0.25, tex: 0.5, tf: 0.12, tc: '#0a0402', seed: 66 })}"`);
  tor += c.inside(belt, line(c, 'M178 306Q240 313 302 306', '#c08a5a', 1.2, 0.4, 0.45) + line(c, 'M196 304L199 322', '#0a0402', 1.4, 0.4, 0.8) + line(c, 'M286 304L283 321', '#0a0402', 1.2, 0.4, 0.7) +
    [186, 206, 270, 292].map((x) => `<circle cx="${x}" cy="${r1(311 + Math.abs(x - 240) * -0.06 + 0.5)}" r="1.8" fill="#c88a4a"/>`).join(''));
  tor += P(sm([[192, 318, 0], [204, 318, 0], [203, 352, 0.6], [197, 358, 0], [191, 350, 0.6]]), c.lg([[0, '#4a2c18'], [1, '#140802']], 0, 0, 1, 1), `filter="${leather}"`);
  tor += P(sm([[229, 303], [253, 303], [253, 331], [229, 331]].map((q) => [...q, 0.3])), rustFill(c), `filter="${rustVol(c)}"`) + P(sm([[234, 308, 0], [248, 308, 0], [248, 326, 0], [234, 326, 0]]), '#1a0c06');
  // spine of the neck
  for (let k = 0; k < 3; k++) tor += P(ell(240, 150 + k * 9, 9 - k, 4.5), boneFill(c), `filter="${c.blur(0.5)}"`);
  // rusted pauldrons
  for (const sd of [-1, 1]) {
    const x = 240 + sd * 70;
    const pd = sm([[x - 40 * sd, 168], [x + 4 * sd, 160], [x + 36 * sd, 176], [x + 42 * sd, 206], [x + 26 * sd, 222], [x - 20 * sd, 210]]);
    tor += P(pd, rustFill(c), `filter="${rustVol(c)}"`);
    tor += c.inside(pd, line(c, `M${x - 30 * sd} 196Q${x + 8 * sd} 184 ${x + 40 * sd} 204`, '#1a0a04', 3, 1.5, 0.7) + line(c, `M${x - 30 * sd} 192Q${x + 8 * sd} 180 ${x + 40 * sd} 200`, '#f0a868', 1.5, 1, 0.5) +
      [0.2, 0.5, 0.8].map((t) => `<circle cx="${r1(lerp(x - 30 * sd, x + 36 * sd, t))}" cy="${r1(186 + Math.sin(t * 3) * 6)}" r="2.5" fill="#3a1a08"/>`).join(''));
  }
  // ----- head: rusted nasal helm, mail aventail, the skull, blue eye-lights
  const aventail = sm([[194, 94], [286, 94], [292, 132], [304, 168], [278, 176], [266, 150], [214, 150], [202, 176], [176, 168], [188, 132]]);
  tor += mail(c, aventail, { rust: 0.6, seed: 9, dark: 1 });
  const skull = sm([[208, 94], [272, 94], [277, 116], [271, 134], [262, 145], [218, 145], [209, 134], [203, 116]]);
  const jawGap = A ? 9 : 3;
  // the dark mouth behind the teeth, then the mandible
  tor += P(sm([[218, 140], [262, 140], [260, 156 + jawGap], [220, 156 + jawGap]]), '#070403');
  const jaw = sm([[212, 146], [268, 146], [266, 160 + jawGap], [256, 171 + jawGap], [240, 174 + jawGap], [224, 171 + jawGap], [214, 160 + jawGap]]);
  tor += P(jaw, c.lg([[0, '#d8ceb2'], [0.45, '#9a8e72'], [1, '#2e281c']], 0.2, 0, 0.6, 1), `filter="${c.vol({ k: 3, b: 2.5, sc: '#140e08', so: 0.65, ho: 0.3, tex: 0.3, tf: 0.12, tc: '#2a2010', seed: 59 })}"`);
  tor += c.inside(jaw, blob(c, ell(262, 162, 12, 14), '#1a1208', 4, 0.7) + blob(c, ell(240, 178, 30, 6), '#140e08', 4, 0.6) + line(c, 'M222 168Q240 175 258 168', '#fffbe8', 1.2, 0.8, 0.35));
  tor += P(skull, boneFill(c), `filter="${c.vol({ k: 4, b: 3, sc: '#140e08', so: 0.65, ho: 0.35, tex: 0.35, tf: 0.1, tc: '#2a2010', seed: 57 })}"`);
  tor += c.inside(skull,
    // temples and stained hollows
    blob(c, ell(206, 108, 8, 20), '#1a1208', 5, 0.7) + blob(c, ell(274, 112, 9, 26), '#1a1208', 5, 0.8) +
    blob(c, ell(230, 136, 26, 8), '#6a5a3c', 6, 0.35) + blob(c, ell(258, 100, 14, 6), '#5a4a30', 5, 0.4) +
    // deep sockets with soft rims
    blob(c, ell(225, 112, 15, 13), '#2a2010', 3, 0.85) + blob(c, ell(255, 112, 15, 13), '#2a2010', 3, 0.9) +
    P(sm([[213, 111], [223, 102], [236, 106], [236, 119], [225, 124], [214, 120]]), '#030201') + P(sm([[267, 111], [257, 102], [244, 106], [244, 119], [255, 124], [266, 120]]), '#030201') +
    // nasal cavity either side of the nasal bar
    P(sm([[240, 122, 0], [247, 132], [244, 138], [240, 136, 0], [236, 138], [233, 132]]), '#060403') +
    // cheekbones: lit on the left, shadowed on the right
    blob(c, ell(213, 128, 8, 5, -20), '#fffbe8', 3, 0.6) + blob(c, ell(266, 130, 7, 5, 20), '#3a3020', 3, 0.6) +
    line(c, 'M250 96L254 103L250 109L253 114', '#3a3020', 1.1, 0.3, 0.75) + line(c, 'M212 134L218 140', '#3a3020', 1, 0.3, 0.6));
  // irregular, yellowed teeth (one missing)
  let teeth = '';
  [0, 1, 2, 4, 5, 6, 7].forEach((k) => { const x = 223 + k * 4.9, h = [7, 8, 8.5, 0, 8.5, 8, 7.5, 6.5][k]; teeth += P(sm([[x - 2.3, 140], [x + 2.3, 140], [x + 2, 140 + h, 0.5], [x - 2, 140 + h - 0.6, 0.5]]), c.lg([[0, '#d8caa0'], [0.6, '#a8966c'], [1, '#4a3c24']], 0, 0, 0, 1)); });
  [0, 1, 2, 3, 4, 5, 6].forEach((k) => { const x = 225 + k * 5, h = [6, 7, 7.5, 7.5, 7, 6.5, 6][k]; teeth += P(sm([[x - 2.2, 155 + jawGap], [x + 2.2, 155 + jawGap], [x + 2, 155 + jawGap - h, 0.5], [x - 2, 155 + jawGap - h + 0.5, 0.5]]), c.lg([[0, '#4a3c24'], [0.45, '#a8966c'], [1, '#cfc098']], 0, 0, 0, 1)); });
  tor += teeth;
  // helm: conical, rusted, with brim band and nasal
  const helm = sm([[194, 102], [196, 72], [212, 42], [240, 20, 0.6], [268, 42], [284, 72], [286, 102], [240, 98]]);
  tor += P(helm, rustFill(c), `filter="${rustVol(c)}"`);
  tor += c.inside(helm, line(c, 'M240 22L240 98', '#2a1206', 4, 1.5, 0.6) + line(c, 'M236 24L232 96', '#f4b070', 2.5, 2, 0.45) +
    blob(c, ell(214, 58, 10, 26, 20), '#ffc890', 8, 0.35) + blob(c, ell(270, 70, 12, 30), '#120602', 8, 0.5) +
    c.strands({ x0: 194, y0: 20, x1: 286, y1: 102, n: 70, a: 0, spread: 180, len: 3, w: 3, cols: ['#2a1206', '#3e1a08', '#d08040'], op: 0.6 }));
  const band = sm([[192, 88, 0.5], [240, 84], [288, 88, 0.5], [288, 102, 0.5], [240, 98], [192, 102, 0.5]]);
  tor += P(band, rustFill(c), `filter="${rustVol(c)}"`) + [204, 220, 260, 276].map((x) => `<circle cx="${x}" cy="94" r="2.6" fill="#2a1206"/><circle cx="${x - 0.7}" cy="93.3" r="1" fill="#f0a060"/>`).join('');
  const nasal = sm([[234, 90, 0.5], [246, 90, 0.5], [245, 132, 0.6], [240, 138, 0], [235, 132, 0.6]]);
  tor += P(nasal, rustFill(c), `filter="${rustVol(c)}"`);
  // cold blue eye-lights
  for (const ex of [226, 254]) tor += `<circle cx="${ex}" cy="113" r="4.6" fill="${c.rgU([[0, '#ffffff'], [0.4, '#c8ecff'], [1, '#2a8aff']], ex, 113, 4.6)}"/>`;
  for (const ex of [226, 254]) { const [gx, gy] = tp(ex, 113); glow += `<circle cx="${r1(gx)}" cy="${r1(gy)}" r="${A ? 14 : 11}" fill="#4aa8ff" opacity="${A ? 0.6 : 0.5}" filter="${c.blur(A ? 6 : 5)}"/><circle cx="${r1(gx)}" cy="${r1(gy)}" r="3.4" fill="#ffffff" opacity="0.95" filter="${c.blur(1)}"/>`; }
  s += G(tor, `transform="${tr}"`);

  // ----- arms
  const arm = (sh, el, wr, side, hidden) => {
    let a = '';
    // mail sleeve to the elbow
    const sleeve = rib([[sh[0], sh[1], 46], [lerp(sh[0], el[0], 0.55), lerp(sh[1], el[1], 0.55), 40], [el[0], el[1], 32]]);
    a += mail(c, sleeve, { rust: 0.5, seed: 11 + side });
    a += c.inside(sleeve, `<path d="${sm(ragHem(el[0] + 30, el[0] - 30, el[1] - 4, 5, 4, 12, 64 + side, 2).map(([x, y]) => [x, y]), false)}" fill="none" stroke="#0a0604" stroke-width="3" opacity="0.6"/>`);
    if (hidden) return a;
    // forearm bones and a rotted leather bracer
    a += bone(c, [el[0] + 4 * side, el[1]], [wr[0] + 3 * side, wr[1]], 8, { dark: 1 });
    a += bone(c, [el[0] - 3 * side, el[1]], [wr[0] - 3 * side, wr[1]], 11, { w1: 9 });
    const br = rib([[lerp(el[0], wr[0], 0.45), lerp(el[1], wr[1], 0.45), 30], [lerp(el[0], wr[0], 0.8), lerp(el[1], wr[1], 0.8), 26]], 0.4, 0.4);
    a += P(br, c.lg([[0, '#8a5a34'], [1, '#2a160a']]), `filter="${leather}"`);
    return a;
  };
  const sword = (pommel, guard, tip) => {
    const notches = [{ s: 0.3, side: 1, d: 4 }, { s: 0.55, side: -1, d: 5 }, { s: 0.68, side: 1, d: 3 }];
    let w = blade(c, guard, tip, 20, { notches, rust: 0.55, gleam: 0.45 });
    const dx = tip[0] - guard[0], dy = tip[1] - guard[1], L = Math.hypot(dx, dy), gx = -dy / L, gy = dx / L;
    const cg = rib([[guard[0] + gx * 30, guard[1] + gy * 30, 8], [guard[0], guard[1], 11], [guard[0] - gx * 30, guard[1] - gy * 30, 8]]);
    w += P(cg, rustFill(c), `filter="${rustVol(c)}"`);
    w += S(`M${r1(guard[0])} ${r1(guard[1])}L${r1(pommel[0])} ${r1(pommel[1])}`, '#2a1a10', 9);
    w += `<circle cx="${r1(pommel[0])}" cy="${r1(pommel[1])}" r="8" fill="${c.rg([[0, '#e09048'], [0.5, '#7a3a12'], [1, '#2a1206']], 0.35, 0.3, 0.8)}"/>`;
    return w;
  };
  // the bone shield: pale lashed plates, a rusted rim and boss, rust weeping down
  const shield = (cx, cy, r) => {
    const d = ell(cx, cy, r, r * 0.98);
    let sh = P(d, c.rgU([[0, '#f2ead2'], [0.5, '#c2b89c'], [0.85, '#7a6e56'], [1, '#3a3226']], cx - r * 0.35, cy - r * 0.35, r * 1.5), `filter="${c.vol({ k: 10, b: 8, sc: '#140e08', so: 0.6, ho: 0.25, tex: 0.4, tf: 0.05, tc: '#2a2010', seed: 58 })}"`);
    let inner = '';
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.2;
      inner += line(c, `M${r1(cx + Math.cos(a) * r * 0.22)} ${r1(cy + Math.sin(a) * r * 0.22)}L${r1(cx + Math.cos(a) * r)} ${r1(cy + Math.sin(a) * r)}`, '#4a3e2c', 2.4, 0.8, 0.7) +
        line(c, `M${r1(cx + Math.cos(a + 0.04) * r * 0.24)} ${r1(cy + Math.sin(a + 0.04) * r * 0.24)}L${r1(cx + Math.cos(a + 0.03) * r)} ${r1(cy + Math.sin(a + 0.03) * r)}`, '#fffbe8', 1.2, 0.6, 0.4);
    }
    // cracks and rust streaks
    inner += line(c, `M${cx - r * 0.5} ${cy - r * 0.3}L${cx - r * 0.3} ${cy - r * 0.15}L${cx - r * 0.35} ${cy + r * 0.05}`, '#2a2010', 1.5, 0.4, 0.8);
    for (const [ox, len] of [[-0.3, 0.6], [0.05, 0.75], [0.35, 0.5], [-0.1, 0.5]]) inner += line(c, `M${cx + ox * r} ${cy + r * 0.15}L${cx + ox * r + 3} ${cy + r * (0.15 + len)}`, '#8a3e10', 5, 3, 0.55);
    sh += c.inside(d, inner);
    sh += `<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="none" stroke="${c.lgU([[0, '#e09048'], [0.5, '#7a3a12'], [1, '#2a1206']], cx - r, cy - r, cx + r, cy + r)}" stroke-width="9"/>`;
    sh += [0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = (k / 8) * Math.PI * 2; return `<circle cx="${r1(cx + Math.cos(a) * (r - 4))}" cy="${r1(cy + Math.sin(a) * (r - 4))}" r="2.6" fill="#2a1206"/>`; }).join('');
    const boss = ell(cx, cy, r * 0.24, r * 0.24);
    sh += P(boss, c.rgU([[0, '#f4b070'], [0.35, '#b0601e'], [0.8, '#4a1e08'], [1, '#1a0a04']], cx - r * 0.08, cy - r * 0.08, r * 0.3), `filter="${rustVol(c)}"`);
    sh += c.inside(boss, c.strands({ x0: cx - r * 0.25, y0: cy - r * 0.25, x1: cx + r * 0.25, y1: cy + r * 0.25, n: 30, a: 0, spread: 180, len: 3, w: 3, cols: ['#2a1206', '#d08040'], op: 0.6 }));
    return sh;
  };

  const rs = tp(176, 196), ls = tp(304, 196);
  if (!A) {
    s += arm(rs, [156, 290], [150, 368], -1);
    s += sword([152, 352], [148, 392], [106, 628]) + boneFist(c, 150, 374, 95, -1);
    s += arm(ls, [330, 276], [320, 304], 1, true);
    s += shield(330, 302, 92);
  } else {
    s += arm(rs, [134, 126], [162, 60], -1);
    s += sword([150, 70], [176, 44], [412, 18]) + boneFist(c, 164, 56, (Math.atan2(-26, 26) * 180) / Math.PI, -1);
    s += arm(ls, [324, 268], [300, 290], 1, true);
    s += shield(306, 290, 92);
  }
  // grave-dust: a cold haze behind the head, dust stirred round the boots and
  // motes drifting up through the light
  const Rd = rng(A ? 19 : 18);
  let dustBack = halo(c, 240 + T.dx, 116 + T.dy, 120, 100, '#7ab0e0', 0.2), dust = '';
  for (let k = 0; k < 9; k++) {
    const x = 150 + k * 22 + (Rd() - 0.5) * 20, y = 646 + (Rd() - 0.5) * 22, rx = 34 + Rd() * 26, ry = 12 + Rd() * 8;
    const q = [];
    for (let j = 0; j < 6; j++) { const th = (j / 6) * Math.PI * 2 + Rd(), rr = 0.7 + Rd() * 0.4; q.push([x + Math.cos(th) * rx * rr, y + Math.sin(th) * ry * rr]); }
    const puff = `<path d="${sm(q)}" fill="${k % 3 ? '#b8a890' : '#8a96a8'}" opacity="${r1((0.22 + Rd() * 0.16) * 100) / 100}"/>`;
    if (k % 2) dustBack += `<g filter="${c.blur(9)}">${puff}</g>`; else dust += `<g filter="${c.blur(7)}">${puff}</g>`;
  }
  for (let k = 0; k < 6; k++) {
    const x = 150 + Rd() * 200, y = 540 + Rd() * 110;
    dust += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(4.5 + Rd() * 2.5)}" fill="#e0d4bc" opacity="${r1((0.25 + Rd() * 0.25) * 100) / 100}" filter="${c.blur(2.5)}"/>`;
  }
  return `${dustBack}<g filter="${c.fx({ seed: 19 })}">${s}</g>${dust}${glow}`;
}

// ---------------------------------------------------------------- barrow king
const goldFill = (c) => c.lg([[0, '#fff2b0'], [0.3, '#e8b440'], [0.7, '#9a6a14'], [1, '#3e2604']], 0.2, 0, 0.8, 1);
const goldVol = (c) => c.vol({ k: 3, b: 2, sc: '#2a1802', so: 0.55, ho: 0.45, tex: 0.25, tf: 0.15, tc: '#3a2404', seed: 71 });
// A twisted gold torc: an open ring (ellipse arc) with knobbed terminals.
function torc(c, cx, cy, rx, ry, w = 9, gap = 0.35) {
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = gap + (i / 16) * (Math.PI * 2 - gap * 2) + Math.PI / 2; pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, w]); }
  const d = rib(pts);
  let s = P(d, goldFill(c), `filter="${goldVol(c)}"`);
  // twist: diagonal grooves
  s += c.inside(d, pts.slice(1, -1).map(([x, y]) => line(c, `M${r1(x - 3)} ${r1(y - w * 0.5)}L${r1(x + 3)} ${r1(y + w * 0.5)}`, '#5a3a06', 1.6, 0.5, 0.7)).join(''));
  for (const p of [pts[0], pts[pts.length - 1]]) s += `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${w * 0.85}" fill="${c.rg([[0, '#fff6c8'], [0.5, '#d8a030'], [1, '#4a2e06']], 0.35, 0.3, 0.8)}"/>`;
  return s;
}
// A skull with a jaw (local coordinates: (0, 0) between the eyes, ~76px wide).
function skullFace(c, jawGap, seed) {
  const vb = (k, b) => c.vol({ k, b, sc: '#140e08', so: 0.65, ho: 0.35, tex: 0.35, tf: 0.1, tc: '#2a2010', seed });
  let s = P(sm([[-26, 26], [26, 26], [24, 46 + jawGap], [-24, 46 + jawGap]]), '#070403');
  const jaw = sm([[-32, 30], [32, 30], [30, 48 + jawGap], [18, 62 + jawGap], [0, 66 + jawGap], [-18, 62 + jawGap], [-30, 48 + jawGap]]);
  s += P(jaw, c.lg([[0, '#d8ceb2'], [0.45, '#9a8e72'], [1, '#2e281c']], 0.2, 0, 0.6, 1), `filter="${vb(3, 2.5)}"`);
  s += c.inside(jaw, blob(c, ell(26, 50, 12, 16), '#1a1208', 4, 0.7) + blob(c, ell(0, 70, 34, 6), '#140e08', 4, 0.6));
  const sk = sm([[-38, -40], [0, -50], [38, -40], [44, -6], [38, 18], [28, 30], [-28, 30], [-38, 18], [-44, -6]]);
  s += P(sk, boneFill(c), `filter="${vb(4, 3)}"`);
  s += c.inside(sk,
    blob(c, ell(-42, -6, 9, 22), '#1a1208', 5, 0.7) + blob(c, ell(42, -2, 10, 26), '#1a1208', 5, 0.8) +
    blob(c, ell(-16, -2, 18, 15), '#2a2010', 3, 0.85) + blob(c, ell(16, -2, 18, 15), '#2a2010', 3, 0.9) +
    P(sm([[-30, -2], [-18, -13], [-3, -8], [-3, 7], [-16, 12], [-29, 7]]), '#030201') + P(sm([[30, -2], [18, -13], [3, -8], [3, 7], [16, 12], [29, 7]]), '#030201') +
    P(sm([[0, 10, 0], [7, 20], [4, 26], [0, 24, 0], [-4, 26], [-7, 20]]), '#060403') +
    blob(c, ell(-30, 18, 9, 5, -20), '#fffbe8', 3, 0.6) + blob(c, ell(30, 20, 8, 5, 20), '#3a3020', 3, 0.6) +
    blob(c, ell(-14, -34, 16, 8), '#fffbe8', 6, 0.4) +
    line(c, 'M14 -44L18 -36L14 -30L17 -24', '#3a3020', 1.2, 0.3, 0.75));
  let teeth = '';
  for (let k = 0; k < 8; k++) { if (k === 5) continue; const x = -17.5 + k * 5; teeth += P(sm([[x - 2.3, 26], [x + 2.3, 26], [x + 2, 34, 0.5], [x - 2, 33.4, 0.5]]), c.lg([[0, '#d8caa0'], [0.6, '#a8966c'], [1, '#4a3c24']], 0, 0, 0, 1)); }
  for (let k = 0; k < 7; k++) { const x = -15 + k * 5; teeth += P(sm([[x - 2.2, 44 + jawGap], [x + 2.2, 44 + jawGap], [x + 2, 37 + jawGap, 0.5], [x - 2, 37.5 + jawGap, 0.5]]), c.lg([[0, '#4a3c24'], [0.45, '#a8966c'], [1, '#cfc098']], 0, 0, 0, 1)); }
  return s + teeth;
}

// The Barrow King: a tall crowned skeleton king in a tattered maroon burial
// cloak, gold torcs and violet eye-lights, a long sword held point-down in both
// hands. attack: the sword swung high.
function barrowking(c, A) {
  let s = '', glow = '';
  const maroon = () => c.lg([[0, '#b03040'], [0.3, '#7a1a28'], [0.7, '#42080f'], [1, '#160205']], 0.15, 0, 0.85, 1);
  const lining = () => c.lg([[0, '#3a0a12'], [1, '#0c0204']], 0.2, 0, 0.8, 1);
  const cloth = c.vol({ k: 12, b: 10, sc: '#080102', so: 0.6, ho: 0.18, tex: 0.35, tf: 0.03, tc: '#000', seed: 72 });
  const clothS = c.vol({ k: 7, b: 5, sc: '#080102', so: 0.6, ho: 0.2, tex: 0.35, tf: 0.04, tc: '#000', seed: 73 });
  const iron = () => c.lg([[0, '#9aa0a8'], [0.35, '#5a5e66'], [0.75, '#26292e'], [1, '#0c0d10']], 0.15, 0, 0.85, 1);
  const ironV = c.vol({ k: 5, b: 4, sc: '#050506', so: 0.6, ho: 0.3, tex: 0.4, tf: 0.08, tc: '#3a1a08', seed: 74 });
  const op = A ? 1 : 0; // the cloak opens wider in the attack

  const dropY = A ? 20 : 0; // the King sinks onto bent knees for the swing
  let glowBack = '';
  const U = (x) => (A ? G(x, `transform="translate(0 ${dropY})"`) : x);
  let up = '';
  // high collar and the cloak's dark inside, behind everything
  up += P(sm([[236, 214], [222, 120], [262, 150], [320, 136], [378, 150], [418, 120], [404, 214]]), maroon(), `filter="${clothS}"`);
  const back = sm([[214, 196], [426, 196], [478 + op * 30, 270], [512 + op * 40, 440], [536 + op * 30, 640], [548 + op * 20, 800], ...ragHem(552 + op * 20, 88 - op * 20, 822, 12, 8, 18, 81, 4), [92 - op * 20, 800], [104 - op * 30, 640], [128 - op * 40, 440], [162 - op * 30, 270]]);
  up += P(back, lining(), `filter="${cloth}"`);
  up += c.inside(back, blob(c, ell(320, 520, 150, 300), '#000', 40, 0.6) + [170, 230, 410, 470].map((x) => line(c, `M${x} 260Q${x + (x - 320) * 0.15} 520 ${x + (x - 320) * 0.3} 830`, '#5a1220', 8, 8, 0.5)).join(''));

  s += U(up);
  // legs: femurs, iron greaves banded in gold, armoured feet
  const legs = A ? [[[288, 470 + dropY], [252, 616], [252, 762]], [[352, 470 + dropY], [392, 612], [390, 762]]] : [[[290, 470], [282, 610], [276, 762]], [[350, 470], [358, 610], [364, 762]]];
  for (const [hip, knee, ank] of legs) {
    s += bone(c, hip, knee, 22, { w1: 19 });
    s += P(ell(knee[0], knee[1], 15, 13), boneFill(c), `filter="${c.vol({ k: 3, b: 2, sc: '#140e08', so: 0.6, ho: 0.35 })}"`);
    const gr = rib([[knee[0], knee[1] + 18, 46], [lerp(knee[0], ank[0], 0.45), lerp(knee[1], ank[1], 0.45), 44], [ank[0], ank[1], 36]]);
    s += P(gr, iron(), `filter="${ironV}"`);
    s += c.inside(gr, line(c, `M${knee[0] - 8} ${knee[1] + 20}L${ank[0] - 8} ${ank[1]}`, '#d8dce4', 3, 2.5, 0.35) + line(c, `M${knee[0] + 12} ${knee[1] + 24}L${ank[0] + 10} ${ank[1]}`, '#000', 5, 3, 0.5));
    for (const t of [0.1, 0.55, 0.92]) { const p = mix2([knee[0], knee[1] + 18], ank, t); s += P(rib([[p[0] - 24, p[1] - 2, 8], [p[0], p[1] + 2, 9], [p[0] + 24, p[1] - 2, 8]], 0.3, 0.3), goldFill(c), `filter="${goldVol(c)}"`); }
    const ax = ank[0], sd = ax < 320 ? -1 : 1;
    const foot = sm([[ax - 22, 770], [ax, 756], [ax + 22, 768], [ax + 28 + sd * 8, 806], [ax + 34 + sd * 10, 840, 0], [ax - 34 + sd * 10, 840, 0], [ax - 28 + sd * 4, 806]]);
    s += P(foot, iron(), `filter="${ironV}"`);
    s += c.inside(foot, [790, 812].map((y) => line(c, `M${ax - 40} ${y}Q${ax} ${y - 6} ${ax + 40} ${y}`, '#000', 3, 1.5, 0.6) + line(c, `M${ax - 40} ${y - 3}Q${ax} ${y - 9} ${ax + 40} ${y - 3}`, '#c8ccd4', 1.5, 1, 0.4)).join('') + `<rect x="${ax - 60}" y="832" width="120" height="10" fill="#050506"/>`);
  }
  // pelvis and spine
  let torso = '';
  const pelvis = sm([[264, 420], [296, 404], [320, 418], [344, 404], [376, 420], [384, 450], [360, 470], [336, 462], [320, 478], [304, 462], [280, 470], [256, 450]]);
  torso += P(pelvis, boneFill(c), `filter="${c.vol({ k: 4, b: 3, sc: '#140e08', so: 0.6, ho: 0.35, tex: 0.3, tf: 0.1, tc: '#2a2010', seed: 75 })}"`);
  torso += c.inside(pelvis, P(ell(298, 452, 6, 8), '#0a0604') + P(ell(342, 452, 6, 8), '#0a0604') + blob(c, ell(320, 440, 10, 20), '#2a2010', 4, 0.6) + blob(c, ell(280, 420, 14, 8), '#fffbe8', 4, 0.4));
  for (let k = 0; k < 6; k++) torso += P(ell(320, 352 + k * 11, 11 - k * 0.3, 5.5), boneFill(c), `filter="${c.vol({ k: 2, b: 1.5, sc: '#140e08', so: 0.6, ho: 0.35 })}"`);
  // rib cage
  let ribs = P(sm([[262, 222], [378, 222], [394, 280], [380, 340], [320, 352], [260, 340], [246, 280]]), '#060303');
  // ribs: every one different in spacing, sweep, droop and thickness; two
  // are broken off short
  const Rb = rng(A ? 61 : 60);
  let ry = 230;
  for (let k = 0; k < 6; k++) {
    for (const sd of [-1, 1]) {
      const y = ry + (Rb() - 0.5) * 5, w = 56 + Math.sin(((k + 1) / 7) * Math.PI) * 18 + (Rb() - 0.5) * 10;
      const droop = 22 + Rb() * 12 + k * 1.5, th = 7 + Rb() * 3.5, broken = (k === 2 && sd > 0) || (k === 4 && sd < 0);
      const pts = [[320 + sd * 8, y, th], [320 + sd * w * 0.58, y - 3 + Rb() * 3, th + 1.5], [320 + sd * w, y + droop * 0.4, th], [320 + sd * (w - 6 - Rb() * 4), y + droop, th * 0.7]];
      const use = broken ? [pts[0], pts[1], [lerp(pts[1][0], pts[2][0], 0.6), lerp(pts[1][1], pts[2][1], 0.6), th * 0.8]] : pts;
      ribs += P(rib(use, 1, broken ? 0.2 : 1), boneFill(c), `filter="${c.vol({ k: 3, b: 2.5, sc: '#2a1a12', so: 0.65, ho: 0.35, rc: '#c88a5a', ro: 0.25 })}"`);
    }
    ry += 17 + Rb() * 5;
  }
  ribs += P(rib([[320, 220, 14], [320, 290, 12], [320, 330, 9]]), boneFill(c), `filter="${c.vol({ k: 2.5, b: 2, sc: '#140e08', so: 0.6, ho: 0.35 })}"`);
  torso += ribs;
  // collarbones
  torso += bone(c, [252, 214], [310, 222], 8) + bone(c, [330, 222], [388, 214], 8);
  s += U(torso);

  // the sword: a long blade, gold guard and pommel
  const swordSvg = (pommel, guard, tip, gl = 64) => {
    let w = blade(c, guard, tip, 34, { notches: [{ s: 0.42, side: 1, d: 4 }, { s: 0.7, side: -1, d: 5 }], gleam: 0.55 });
    const dx = tip[0] - guard[0], dy = tip[1] - guard[1], L = Math.hypot(dx, dy), gx = -dy / L, gy = dx / L, ux = dx / L, uy = dy / L;
    const cg = rib([[guard[0] + gx * gl - ux * 8, guard[1] + gy * gl - uy * 8, 10], [guard[0] + gx * gl * 0.47, guard[1] + gy * gl * 0.47, 13], [guard[0], guard[1], 16], [guard[0] - gx * gl * 0.47, guard[1] - gy * gl * 0.47, 13], [guard[0] - gx * gl - ux * 8, guard[1] - gy * gl - uy * 8, 10]]);
    w += P(cg, goldFill(c), `filter="${goldVol(c)}"`);
    w += `<circle cx="${r1(guard[0])}" cy="${r1(guard[1])}" r="7" fill="${c.rg([[0, '#c8fff4'], [0.4, '#2ac0b8'], [1, '#04403e']], 0.35, 0.3, 0.8)}"/>`;
    w += S(`M${r1(guard[0] - ux * 8)} ${r1(guard[1] - uy * 8)}L${r1(pommel[0])} ${r1(pommel[1])}`, '#2a1608', 14);
    w += S(`M${r1(guard[0] - ux * 8)} ${r1(guard[1] - uy * 8)}L${r1(pommel[0])} ${r1(pommel[1])}`, '#c89a40', 2.5, 'stroke-dasharray="4 5" opacity="0.8"');
    w += P(ell(pommel[0], pommel[1], 13, 13), goldFill(c), `filter="${goldVol(c)}"`);
    return w;
  };
  // the cloak's front panels with gold-embroidered edges
  const panel = (sd) => {
    const m = (pts) => (sd < 0 ? pts : pts.map(([x, y, ...r]) => [640 - x, y, ...r]));
    const o = op * 26;
    const d = sm(m([[212, 200], [262, 208], [254, 300], [242 - o, 440], [232 - o, 620], [226 - o, 800], ...ragHem(226 - o, 104 - op * 18, 818, 5, 10, 24, 91 + sd, 5), [104 - op * 18, 800], [118 - op * 24, 620], [136 - op * 30, 440], [164 - op * 26, 270]]));
    let p = P(d, maroon(), `filter="${cloth}"`);
    p += c.inside(d, [150, 186, 216].map((x, i) => { const X = sd < 0 ? x : 640 - x; return line(c, `M${X} 250Q${X - sd * (8 + i * 4)} 540 ${X - sd * (14 + i * 6) - sd * o} 830`, '#14020a', 10, 8, 0.6) + line(c, `M${X + 12 * -sd} 260Q${X + 12 * -sd - sd * (8 + i * 4)} 540 ${X + 12 * -sd - sd * (14 + i * 6) - sd * o} 820`, '#d05060', 3, 3, sd < 0 ? 0.35 : 0.2); }).join('') +
      c.strands({ x0: 100, y0: 200, x1: 540, y1: 830, n: 120, a: 92, spread: 4, len: 50, w: 1.1, cols: ['#14020a', '#a03040'], op: 0.3 }));
    const edge = m([[258, 210], [250, 300], [238 - o, 440], [229 - o, 620], [224 - o, 800]]);
    p += S(sm(edge, false), c.lgU([[0, '#fff0a0'], [0.4, '#c89030'], [1, '#5a3a08']], 200, 200, 300, 820), 9) + S(sm(edge, false), '#5a3a08', 2, 'stroke-dasharray="3 7" opacity="0.8"');
    return p;
  };
  const arm = (sh, el, wr, side) => {
    // rotted sleeve of the burial tunic over the upper arm, frayed at the end
    const dx = el[0] - sh[0], dy = el[1] - sh[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    const e = mix2(sh, el, 0.8);
    const sl = tuft([[sh[0] - dx / L * 18, sh[1] - dy / L * 18], [sh[0] + nx * 26, sh[1] + ny * 26], [e[0] + nx * 22, e[1] + ny * 22, 1, 7], [e[0] - nx * 22, e[1] - ny * 22], [sh[0] - nx * 26, sh[1] - ny * 26]], { seed: 95 + side, lean: 0, n: 2.5, jit: 0.8 });
    let a = bone(c, mix2(sh, el, 0.5), el, 15, { w1: 14 });
    a += P(sl, c.lg([[0, '#6a1a24'], [0.5, '#34080e'], [1, '#100204']], 0.1, 0, 0.9, 1), `filter="${clothS}"`);
    a += c.inside(sl, line(c, `M${r1(sh[0] + nx * 10)} ${r1(sh[1] + ny * 10)}L${r1(el[0] + nx * 8)} ${r1(el[1] + ny * 8)}`, '#000', 6, 4, 0.5) + line(c, `M${r1(sh[0] - nx * 14)} ${r1(sh[1] - ny * 14)}L${r1(el[0] - nx * 12)} ${r1(el[1] - ny * 12)}`, '#c04050', 3, 3, 0.35));
    a += torc(c, lerp(sh[0], el[0], 0.5), lerp(sh[1], el[1], 0.5), 24, 8, 8, 0.5);
    a += bone(c, [el[0] + 3 * side, el[1] + 2], [wr[0] + 3 * side, wr[1]], 8, { dark: 1 });
    a += bone(c, [el[0] - 3 * side, el[1]], [wr[0] - 3 * side, wr[1]], 11, { w1: 9 });
    a += P(ell(el[0], el[1], 11, 10), boneFill(c), `filter="${c.vol({ k: 3, b: 2, sc: '#140e08', so: 0.6, ho: 0.35 })}"`);
    a += torc(c, lerp(el[0], wr[0], 0.82), lerp(el[1], wr[1], 0.82), 12, 5, 6, 0.6);
    return a;
  };

  if (!A) {
    s += swordSvg([320, 306], [320, 384], [320, 812]);
    s += panel(-1) + panel(1);
    s += arm([228, 232], [204, 318], [300, 344], -1) + arm([412, 232], [436, 318], [340, 360], 1);
    s += boneFist(c, 314, 338, 90, 1) + boneFist(c, 326, 362, 90, -1);
  } else {
    s += U(panel(-1) + panel(1));
    // the blade cocked over his left shoulder, raised diagonally behind the
    // crown, both hands on the grip, a faint trail of the upswing behind it
    const guard = [424, 236], tip = [92, 30];
    const L = Math.hypot(guard[0] - tip[0], guard[1] - tip[1]), u = [(guard[0] - tip[0]) / L, (guard[1] - tip[1]) / L];
    const at = (d) => [guard[0] + u[0] * d, guard[1] + u[1] * d];
    const ga = (Math.atan2(-u[1], -u[0]) * 180) / Math.PI;
    let trail = [];
    // a broad, soft smear of the upswing sweeping in from the left
    for (let k = 0; k <= 8; k++) { const th = ((210 - k * 4.5) * Math.PI) / 180, rr = 300 + 70 * Math.sin((k / 8) * Math.PI) * 0.3; trail.push([452 + Math.cos(th) * rr, 254 + Math.sin(th) * rr, 90 * (1 - k / 8) + 10]); }
    glowBack += `<path d="${rib(trail, 1, 0)}" fill="${c.lgU([[0, '#d8c8ff', 0.28], [0.6, '#a080ff', 0.1], [1, '#a080ff', 0]], trail[0][0], trail[0][1], trail[8][0], trail[8][1])}" filter="${c.blur(14)}"/>`;
    s += swordSvg(at(76), guard, tip, 52);
    s += arm([412, 232 + dropY], [506, 312], [470, 268], 1) + arm([228, 232 + dropY], [318, 320], [440, 252], -1);
    s += boneFist(c, ...at(46), ga, -1) + boneFist(c, ...at(18), ga, 1);
  }
  // neck torc, skull and crown
  const hx = A ? 314 : 320, hy = 114 + dropY, hr = A ? -5 : 0;
  s += U(P(rib([[316, 150, 14], [320, 196, 16]]), boneFill(c), `filter="${c.vol({ k: 2.5, b: 2, sc: '#140e08', so: 0.6, ho: 0.35 })}"`) + torc(c, 320, 200, 52, 16, 11, 0.42));
  let head = skullFace(c, A ? 8 : 2, 76);
  // the crown: a gold band with tall points and a teal gem
  const crown = sm([[-46, -24, 0.6], [-48, -64, 0], [-34, -50, 0], [-24, -82, 0], [-12, -56, 0], [0, -94, 0], [12, -56, 0], [24, -82, 0], [34, -50, 0], [48, -64, 0], [46, -24, 0.6], [0, -16]]);
  head += P(crown, goldFill(c), `filter="${goldVol(c)}"`);
  head += c.inside(crown, P(sm([[-48, -46, 0.5], [0, -40], [48, -46, 0.5], [48, -26, 0.5], [0, -18], [-48, -26, 0.5]]), c.lg([[0, '#f8d870'], [0.5, '#a87418'], [1, '#4a2e06']], 0, 0, 0, 1)) +
    line(c, 'M-46 -44Q0 -36 46 -44', '#fff6c8', 1.6, 0.8, 0.7) + line(c, 'M-46 -28Q0 -20 46 -28', '#3a2404', 2, 1, 0.7) +
    [-30, 30].map((x) => `<circle cx="${x}" cy="-33" r="4" fill="${c.rg([[0, '#ffd0e0'], [0.5, '#c02040'], [1, '#400810']], 0.35, 0.3, 0.8)}"/>`).join(''));
  head += P(sm([[0, -46], [9, -34], [0, -22], [-9, -34]]), c.rg([[0, '#e0fffa'], [0.35, '#40e0d0'], [0.8, '#0a7070'], [1, '#033030']], 0.35, 0.3, 0.8)) + `<circle cx="-3" cy="-38" r="2" fill="#ffffff" opacity="0.9"/>`;
  // violet eye-lights
  for (const ex of [-16, 16]) head += `<circle cx="${ex}" cy="-1" r="5.5" fill="${c.rgU([[0, '#ffffff'], [0.4, '#ecd0ff'], [1, '#a040ff']], ex, -1, 5.5)}"/>`;
  s += G(head, `transform="translate(${hx} ${hy}) rotate(${hr}) scale(1.08)"`);
  const hpt = (x, y) => { const a = (hr * Math.PI) / 180; return [hx + (x * Math.cos(a) - y * Math.sin(a)) * 1.08, hy + (x * Math.sin(a) + y * Math.cos(a)) * 1.08]; };
  for (const ex of [-16, 16]) {
    const [gx, gy] = hpt(ex, -1);
    glow += `<circle cx="${r1(gx)}" cy="${r1(gy)}" r="${A ? 15 : 12}" fill="#a050ff" opacity="${A ? 0.6 : 0.5}" filter="${c.blur(A ? 7 : 6)}"/><circle cx="${r1(gx)}" cy="${r1(gy)}" r="4" fill="#ffffff" opacity="0.9" filter="${c.blur(1.2)}"/>`;
  }
  const [gmx, gmy] = hpt(0, -34);
  glow += `<circle cx="${r1(gmx)}" cy="${r1(gmy)}" r="10" fill="#40f0e0" opacity="0.5" filter="${c.blur(5)}"/>`;
  const behind = halo(c, hx, hy - 4, 150, 104, '#8a70d0', 0.22) + glowBack;
  return `${behind}<g filter="${c.fx({ seed: 23 })}">${s}</g>${glow}`;
}

// ---------------------------------------------------------------- spider
// Giant forest spider, front-on: eight jointed bristly legs, a dark abdomen with
// a violet diamond, a cluster of glinting red eyes, dripping fangs. attack:
// front legs reared high, fangs spread wide.
function spider(c, A) {
  const legV = c.vol({ k: 4, b: 3, sc: '#0c0402', so: 0.6, ho: 0.3, tex: 0.35, tf: 0.1, tc: '#140602', seed: 81 });
  const bodyV = c.vol({ k: 10, b: 8, sc: '#020104', so: 0.6, ho: 0.2, tex: 0.4, tf: 0.05, tc: '#000', seed: 82 });
  const legFill = (dark) => (dark ? c.lg([[0, '#7a3e1a'], [0.5, '#4a200c'], [1, '#160804']], 0.1, 0, 0.9, 1) : c.lg([[0, '#b8804e'], [0.35, '#7e4a26'], [0.75, '#4a2412'], [1, '#22120a']], 0.1, 0, 0.9, 1));
  let s = '', drips = '', glow = '';
  const dy = A ? -14 : 0;
  // one jointed leg: knots [x, y] from the body out to the tip, widths per knot
  const leg = (pts, ws, dark, seed) => {
    const m = (p) => p;
    let out = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = m(pts[i]), b = m(pts[i + 1]), mid = mix2(a, b, 0.5);
      const d = rib([[a[0], a[1], ws[i] * 0.9], [mid[0], mid[1], (ws[i] + ws[i + 1]) * 0.55], [b[0], b[1], i === pts.length - 2 ? 0 : ws[i + 1] * 0.85]], 1, 0.6);
      out += P(d, legFill(dark), `filter="${legV}"`);
      // bristles along the segment, swept toward the tip
      const dx = b[0] - a[0], dyy = b[1] - a[1], L = Math.hypot(dx, dyy), ux = dx / L, uy = dyy / L;
      const ang = (Math.atan2(uy, ux) * 180) / Math.PI;
      let br = '';
      const R = rng(seed + i * 7);
      const n = Math.round(L / 7);
      for (let k = 0; k < n; k++) {
        const t = R(), sd = R() < 0.5 ? -1 : 1, w = lerp(ws[i], ws[i + 1], t) * 0.5;
        const x = a[0] + dx * t - uy * w * sd * 0.9, y = a[1] + dyy * t + ux * w * sd * 0.9;
        const aa = ((ang + sd * (30 + R() * 22)) * Math.PI) / 180, len = 8 + R() * 7;
        br += `<path d="M${r1(x)} ${r1(y)}l${r1(Math.cos(aa) * len)} ${r1(Math.sin(aa) * len)}" stroke="${R() < 0.25 && !dark ? '#e0a060' : '#120604'}" stroke-width="${r1(2.2 + R() * 1.2)}" opacity="${r1(0.6 + R() * 0.4)}"/>`;
      }
      out += `<g fill="none" stroke-linecap="round">${br}</g>`;
      out += c.inside(d, line(c, `M${r1(a[0] - uy * ws[i] * 0.25)} ${r1(a[1] + ux * ws[i] * 0.25)}L${r1(b[0] - uy * ws[i + 1] * 0.25)} ${r1(b[1] + ux * ws[i + 1] * 0.25)}`, dark ? '#a0602a' : '#f0b070', 2.4, 1.6, dark ? 0.3 : 0.55) +
        blob(c, ell(b[0], b[1], ws[i] * 0.7, ws[i] * 0.7), '#1a0604', 4, 0.6));
      // joint knob with a darker band
      if (i < pts.length - 2) out += P(ell(b[0], b[1], ws[i + 1] * 0.62, ws[i + 1] * 0.62), dark ? '#2a0e06' : c.rg([[0, '#9a4a1e'], [0.7, '#3a1406'], [1, '#160602']], 0.35, 0.3, 0.8));
    }
    return out;
  };
  const mir = (pts) => pts.map(([x, y]) => [640 - x, y]);
  const pairs = [
    // back pairs behind the body (darker), then the second pair, then the front pair
    { p: [[292, 214 + dy], [214, 74], [156, 232], [140, 404]], w: [18, 15, 11, 6], dark: true },
    { p: [[286, 230 + dy], [172, 96], [96, 270], [76, 430]], w: [21, 17, 12, 6], dark: true },
    { p: [[282, 252 + dy], [124, 140], [46, 310], [28, 474]], w: [24, 19, 13, 7], dark: false },
    A ? { p: [[284, 278 + dy], [184, 176], [182, 64], [236, 22]], w: [27, 21, 14, 7], dark: false, front: true }
      : { p: [[284, 282 + dy], [182, 206], [168, 368], [208, 478]], w: [27, 21, 14, 7], dark: false, front: true },
  ];
  // back legs, abdomen, second pair, head, front pair
  let backLegs = '';
  pairs.slice(0, 2).forEach((L, i) => { backLegs += leg(L.p, L.w, L.dark, 300 + i * 10) + leg(mir(L.p), L.w, L.dark, 400 + i * 10); });
  s += backLegs;
  // abdomen: rising behind the head, banded with a violet diamond
  const abd = tuft([[320, 50 + dy], [404, 66 + dy], [458, 118 + dy], [462, 182 + dy], [420, 232 + dy], [320, 250 + dy], [220, 232 + dy], [178, 182 + dy], [182, 118 + dy], [236, 66 + dy]].map((p) => [...p, 1, 4]), { seed: 501, lean: 0.2, n: 3, jit: 0.8 });
  s += P(abd, c.lg([[0, '#3e3470'], [0.3, '#1e1a3c'], [0.7, '#0c0a1a'], [1, '#030206']], 0.2, 0, 0.8, 1), `filter="${bodyV}"`);
  const dia = sm([[320, 82 + dy, 0.3], [356, 140 + dy, 0.4], [320, 206 + dy, 0.3], [284, 140 + dy, 0.4]]);
  s += c.inside(abd,
    blob(c, ell(270, 100 + dy, 60, 30, -20), '#6a5aa8', 16, 0.45) +
    // chevrons and spots around the diamond
    [[-1, 0], [1, 0]].map(([sd]) => [0, 1, 2].map((k) => line(c, `M${320 + sd * (52 + k * 22)} ${110 + k * 16 + dy}L${320 + sd * (70 + k * 22)} ${132 + k * 16 + dy}L${320 + sd * (52 + k * 22)} ${154 + k * 16 + dy}`, '#2a2a6a', 5, 2, 0.6)).join('')).join('') +
    [[262, 112], [378, 112], [240, 160], [400, 160], [282, 196], [358, 196]].map(([x, y]) => `<ellipse cx="${x}" cy="${y + dy}" rx="7" ry="5" fill="#3a6ad0" opacity="0.75" filter="${c.blur(1.2)}"/>`).join('') +
    P(dia, c.lg([[0, '#e0c0ff'], [0.35, '#a060ff'], [0.75, '#6a28c8'], [1, '#2a0a60']], 0.2, 0, 0.8, 1)) +
    P(sm([[320, 112 + dy, 0.3], [334, 140 + dy, 0.4], [320, 172 + dy, 0.3], [306, 140 + dy, 0.4]]), c.lg([[0, '#3a1480'], [1, '#0c0420']], 0, 0, 0, 1)) +
    blob(c, dia, '#c890ff', 10, 0.35) +
    c.glaze({ x0: 180, y0: 50 + dy, x1: 460, y1: 250 + dy, n: 14, cols: ['#2a2260', '#4a3a90', '#140c24', '#3a1a50'], op: 0.3, size: 50, b: 10 }) +
    c.strokes({ x0: 180, y0: 50 + dy, x1: 460, y1: 250 + dy, n: 90, len: 16, w: 5, cols: ['#0c0a18', '#4a4280', '#0c0a18'], op: 0.4, field: (x, y) => (Math.atan2(y - 260, x - 320) * 180) / Math.PI }) +
    blob(c, ell(320, 230 + dy, 150, 40), '#000', 18, 0.55) + blob(c, ell(250, 86 + dy, 40, 12, -25), '#d8d0ff', 8, 0.35));
  // second pair of legs
  s += leg(pairs[2].p, pairs[2].w, false, 320) + leg(mir(pairs[2].p), pairs[2].w, false, 420);
  // cephalothorax
  const ceph = tuft([[320, 206 + dy], [374, 216 + dy], [398, 250 + dy], [392, 292 + dy], [360, 316 + dy], [320, 322 + dy], [280, 316 + dy], [248, 292 + dy], [242, 250 + dy], [266, 216 + dy]].map((p) => [...p, 1, 3]), { seed: 511, lean: 0.3, n: 3, jit: 0.8 });
  s += P(ceph, c.lg([[0, '#6a3a26'], [0.35, '#3a1a10'], [0.75, '#160806'], [1, '#050202']], 0.2, 0, 0.8, 1), `filter="${bodyV}"`);
  s += c.inside(ceph, line(c, `M320 ${214 + dy}L320 ${236 + dy}`, '#000', 4, 2, 0.6) + blob(c, ell(290, 226 + dy, 30, 12, -15), '#b07040', 10, 0.35) +
    c.strokes({ x0: 240, y0: 206 + dy, x1: 400, y1: 322 + dy, n: 50, len: 14, w: 5, cols: ['#140804', '#8a5432'], op: 0.45, field: (x, y) => (Math.atan2(y - 250 - dy, x - 320) * 180) / Math.PI }));
  // front pair (in front of the body)
  s += leg(pairs[3].p, pairs[3].w, false, 330) + leg(mir(pairs[3].p), pairs[3].w, false, 430);
  // pedipalps
  for (const sd of [-1, 1]) {
    const pp = [[320 + sd * 30, 300 + dy], [320 + sd * 56, 318 + dy], [320 + sd * 54, 352 + dy], [320 + sd * 42, 370 + dy]];
    s += leg(pp, [12, 11, 9, 6], false, 600 + sd);
  }
  // chelicerae and fangs
  const spread = A ? 14 : 0;
  for (const sd of [-1, 1]) {
    const cx = 320 + sd * (22 + spread * 0.6), cy = 334 + dy;
    const ch = tuft([[cx - 21, cy - 26], [cx + 21, cy - 26], [cx + 24, cy + 8, 1, 3], [cx + 12 * sd, cy + 36], [cx - 12 * sd, cy + 36], [cx - 24, cy + 8, 1, 3]].map((p) => [p[0], p[1], p[2] ?? 1, p[3] ?? 0]), { seed: 521 + sd, n: 3, jit: 0.8 });
    s += P(ch, c.lg([[0, '#8a4a2a'], [0.4, '#4a2010'], [1, '#100402']], 0.2, 0, 0.8, 1), `filter="${c.vol({ k: 5, b: 4, sc: '#050202', so: 0.6, ho: 0.3, tex: 0.4, tf: 0.1, tc: '#000', seed: 83 })}"`);
    s += c.inside(ch, c.strands({ x0: cx - 22, y0: cy - 24, x1: cx + 22, y1: cy + 32, n: 50, a: 95, spread: 25, len: 7, w: 1, cols: ['#000', '#a06a3a'], op: 0.6 }));
    // the fang: glossy black curving to a pale point
    const base = [cx + sd * 2, cy + 28];
    const tip = A ? [cx + sd * 34, cy + 76] : [cx - sd * 12, cy + 70];
    const ctrl = A ? [cx + sd * 28, cy + 46] : [cx + sd * 8, cy + 56];
    const fang = rib([[base[0], base[1], 14], [ctrl[0], ctrl[1], 10], [lerp(ctrl[0], tip[0], 0.6), lerp(ctrl[1], tip[1], 0.6), 5.5], [tip[0], tip[1], 0]], 0.6);
    s += P(fang, c.lg([[0, '#2a2420'], [0.5, '#0a0806'], [0.85, '#8a8070'], [1, '#e8e0d0']], 0, 0, 0.3, 1));
    s += c.inside(fang, line(c, `M${r1(base[0] - 2)} ${r1(base[1] + 2)}Q${r1(ctrl[0] - 2)} ${r1(ctrl[1])} ${r1(lerp(ctrl[0], tip[0], 0.6) - 1)} ${r1(lerp(ctrl[1], tip[1], 0.6))}`, '#ffffff', 1.6, 0.6, 0.7));
    // venom drip: a bead at the tip and a falling strand
    const dl = A ? 26 : 34;
    drips += `<path d="${rib([[tip[0], tip[1] - 1, 6], [tip[0] + sd * 0.5, tip[1] + dl * 0.5, 4.5], [tip[0], tip[1] + dl, 8]], 0.4, 1.2)}" fill="${c.lgU([[0, '#d8ff70', 0.9], [0.6, '#8ae020', 0.85], [1, '#4aa010', 0.95]], tip[0], tip[1], tip[0], tip[1] + dl)}"/>` +
      `<circle cx="${r1(tip[0] - 2)}" cy="${r1(tip[1] + dl - 2)}" r="2.6" fill="#f4ffd0" opacity="0.9"/>` +
      `<ellipse cx="${r1(tip[0] + sd * 8)}" cy="${r1(tip[1] + dl + 26)}" rx="5" ry="7" fill="#9ae830" opacity="0.8" filter="${c.blur(1)}"/>`;
    glow += `<circle cx="${r1(tip[0])}" cy="${r1(tip[1] + dl * 0.6)}" r="18" fill="#8ae020" opacity="0.35" filter="${c.blur(8)}"/>`;
  }
  // the eyes: a cluster of glossy red beads
  const eyes = [[304, 254, 12.5], [336, 254, 12.5], [289, 233, 7.5], [351, 233, 7.5], [275, 252, 6.5], [365, 252, 6.5], [310, 226, 4.6], [330, 226, 4.6]];
  for (const [x, y0, r] of eyes) {
    const y = y0 + dy;
    s += `<circle cx="${x}" cy="${y}" r="${r + 2}" fill="#050202"/>`;
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c.rgU([[0, '#ff6a50'], [0.35, '#d01818'], [0.75, '#6a0404'], [1, '#200000']], x - r * 0.3, y - r * 0.3, r * 1.2)}"/>`;
    s += `<ellipse cx="${r1(x - r * 0.35)}" cy="${r1(y - r * 0.4)}" rx="${r1(r * 0.32)}" ry="${r1(r * 0.22)}" fill="#ffffff" opacity="0.95" transform="rotate(-30 ${r1(x - r * 0.35)} ${r1(y - r * 0.4)})"/>`;
    s += `<path d="M${r1(x + r * 0.2)} ${r1(y + r * 0.75)}A${r * 0.8} ${r * 0.8} 0 0 0 ${r1(x + r * 0.78)} ${r1(y + r * 0.1)}" fill="none" stroke="#9fc4ff" stroke-width="${r1(Math.max(1, r * 0.12))}" opacity="0.6"/>`;
    glow += `<circle cx="${x}" cy="${y}" r="${r * 1.6}" fill="#ff2a10" opacity="${A ? 0.4 : 0.28}" filter="${c.blur(r * 0.7)}"/>`;
  }
  return `${halo(c, 320, 170 + dy, 230, 160, '#b070d0', 0.16)}<g filter="${c.fx({ seed: 29 })}">${s}</g>${drips}${glow}`;
}

// ---------------------------------------------------------------- registry
const SPECS = {
  brigand: { w: 480, h: 640, height: 1.8, draw: brigand, seed: 11 },
  wolf: { w: 640, h: 440, height: 1.1, draw: wolf, seed: 23 },
  hound: { w: 640, h: 480, height: 1.25, draw: hound, seed: 37 },
  wraith: { w: 560, h: 720, height: 2.2, draw: wraith, seed: 41 },
  wight: { w: 480, h: 680, height: 1.9, draw: wight, seed: 43 },
  barrowking: { w: 640, h: 840, height: 2.5, draw: barrowking, seed: 47 },
  spider: { w: 640, h: 480, height: 1.3, draw: spider, seed: 53 },
};

function build() {
  const out = {};
  for (const [key, s] of Object.entries(SPECS)) {
    const frames = {};
    for (const frame of ['idle', 'attack']) {
      const c = new Ctx(key, frame, s.w, s.h, s.seed);
      const body = s.draw(c, frame === 'attack');
      frames[frame] = wrapSvg(c, body);
    }
    out[key] = { w: s.w, h: s.h, height: s.height, frames };
  }
  return out;
}

export const ART_FOES_A = build();
