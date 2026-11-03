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
  // Volume shading for a part: a soft shadow band on lower-right edges, a warm
  // highlight band on upper-left edges and an optional material mottle.
  vol({ k = 6, b = 4, sc = '#120a14', so = 0.55, hc = KEY, ho = 0.28, tex = 0, tf = 0.05, tc = '#000', seed = 3 } = {}) {
    const key = `v${k}|${b}|${sc}|${so}|${hc}|${ho}|${tex}|${tf}|${tc}|${seed}`;
    if (!this.cache[key]) {
      const id = this.nid('vol');
      let t = '';
      let tm = '';
      if (tex) {
        t = `<feTurbulence type="fractalNoise" baseFrequency="${tf}" numOctaves="3" seed="${seed}" result="tn"/>` +
          `<feColorMatrix in="tn" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.6 0 0 0 -1.15" result="ta"/>` +
          `<feFlood flood-color="${tc}" flood-opacity="${tex}"/><feComposite in2="ta" operator="in" result="tb"/>` +
          `<feComposite in="tb" in2="SourceAlpha" operator="in" result="tex"/>`;
        tm = '<feMergeNode in="tex"/>';
      }
      this.defs.push(`<filter id="${id}" ${this.region()} color-interpolation-filters="sRGB">` +
        t +
        `<feOffset in="SourceAlpha" dx="${-k}" dy="${-k}" result="o1"/>` +
        `<feComposite in="SourceAlpha" in2="o1" operator="out" result="s1"/>` +
        `<feGaussianBlur in="s1" stdDeviation="${b}" result="s2"/>` +
        `<feComposite in="s2" in2="SourceAlpha" operator="in" result="s3"/>` +
        `<feFlood flood-color="${sc}" flood-opacity="${so}"/><feComposite in2="s3" operator="in" result="sh"/>` +
        `<feOffset in="SourceAlpha" dx="${k * 0.8}" dy="${k * 0.9}" result="o2"/>` +
        `<feComposite in="SourceAlpha" in2="o2" operator="out" result="h1"/>` +
        `<feGaussianBlur in="h1" stdDeviation="${b * 0.75}" result="h2"/>` +
        `<feComposite in="h2" in2="SourceAlpha" operator="in" result="h3"/>` +
        `<feFlood flood-color="${hc}" flood-opacity="${ho}"/><feComposite in2="h3" operator="in" result="hi"/>` +
        `<feMerge><feMergeNode in="SourceGraphic"/>${tm}<feMergeNode in="sh"/><feMergeNode in="hi"/></feMerge></filter>`);
      this.cache[key] = `url(#${id})`;
    }
    return this.cache[key];
  }
  // The whole-figure finish: outline on the outer silhouette, rim light on the
  // right-hand edges, a soft warm key on upper-left edges, and fine grain.
  fx({ rim = 0.7, key = 0.2, grain = 0.1, ol = 2, seed = 7, lx = null, ly = null, lz = null, kd = 1.08 } = {}) {
    const k = `fx${rim}|${key}|${grain}|${ol}|${lx}|${ly}|${lz}|${kd}`;
    if (!this.cache[k]) {
      const id = this.nid('fx');
      // a point light above the upper-left corner: brighter head and shoulders, darker feet
      const LX = lx ?? -this.w * 0.15, LY = ly ?? -this.h * 0.2, LZ = lz ?? Math.max(this.w, this.h) * 1.05;
      this.defs.push(`<filter id="${id}" ${this.region()} color-interpolation-filters="sRGB">` +
        `<feDiffuseLighting in="SourceAlpha" surfaceScale="0" diffuseConstant="${kd}" lighting-color="#ffffff" result="lt"><fePointLight x="${r1(LX)}" y="${r1(LY)}" z="${r1(LZ)}"/></feDiffuseLighting>` +
        `<feBlend in="SourceGraphic" in2="lt" mode="multiply" result="lit0"/>` +
        `<feComposite in="lit0" in2="SourceAlpha" operator="in" result="lit"/>` +
        `<feMorphology in="SourceAlpha" operator="dilate" radius="${ol}" result="dl"/>` +
        `<feFlood flood-color="${OUT}"/><feComposite in2="dl" operator="in" result="ol"/>` +
        `<feOffset in="SourceAlpha" dx="-2.5" dy="1.5" result="ro"/>` +
        `<feComposite in="SourceAlpha" in2="ro" operator="out" result="ra"/>` +
        `<feGaussianBlur in="ra" stdDeviation="1.1" result="rb"/>` +
        `<feComposite in="rb" in2="SourceAlpha" operator="in" result="rc"/>` +
        `<feFlood flood-color="${RIM}" flood-opacity="${rim}"/><feComposite in2="rc" operator="in" result="rim"/>` +
        `<feOffset in="SourceAlpha" dx="8" dy="9" result="ko"/>` +
        `<feComposite in="SourceAlpha" in2="ko" operator="out" result="ka"/>` +
        `<feGaussianBlur in="ka" stdDeviation="4" result="kb"/>` +
        `<feComposite in="kb" in2="SourceAlpha" operator="in" result="kc"/>` +
        `<feFlood flood-color="${KEY}" flood-opacity="${key}"/><feComposite in2="kc" operator="in" result="key"/>` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed}" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.06  0 0 0 0 0.05  -4 0 0 0 2.1" result="nd"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.92  0 0 0 0 0.82  3 0 0 0 -1.75" result="nl"/>` +
        `<feMerge result="nm"><feMergeNode in="nd"/><feMergeNode in="nl"/></feMerge>` +
        `<feComposite in="nm" in2="SourceAlpha" operator="in" result="nc"/>` +
        `<feComponentTransfer in="nc" result="grain"><feFuncA type="linear" slope="${grain}"/></feComponentTransfer>` +
        `<feMerge><feMergeNode in="ol"/><feMergeNode in="lit"/><feMergeNode in="key"/><feMergeNode in="rim"/><feMergeNode in="grain"/></feMerge></filter>`);
      this.cache[k] = `url(#${id})`;
    }
    return this.cache[k];
  }
  // A soft glow (for eyes, embers): blurred copy under a sharp core.
  glow(s = 6) {
    const k = `g${s}`;
    if (!this.cache[k]) {
      const id = `${this.p}glow${String(s).replace('.', '_')}`;
      this.defs.push(`<filter id="${id}" ${this.region()}><feGaussianBlur stdDeviation="${s}" result="g"/>` +
        `<feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
      this.cache[k] = `url(#${id})`;
    }
    return this.cache[k];
  }
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}"><defs>${c.defs.join('')}</defs>${body}</svg>`;
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
  const face = sm([[240, 46], [256, 51], [266, 66], [268, 88], [263, 110], [251, 124], [240, 127], [229, 124], [217, 110], [212, 88], [214, 66], [224, 51]]);
  head += P(face, c.rg([[0, '#e2a882'], [0.45, '#b06e4a'], [0.85, '#6a3a26'], [1, '#3a1e0e']], 0.36, 0.62, 0.7));
  head += c.inside(face,
    // brow ridge, cheekbones and the shadow of the hood across the forehead
    blob(c, ell(222, 98, 9, 5), '#f0b48c', 4, 0.55) +
    blob(c, ell(262, 99, 8, 5), '#4a2214', 4, 0.55) +
    blob(c, 'M237 82L243 82L244 100L236 100Z', '#f2c49c', 2.2, 0.5) +
    blob(c, ell(228, 86, 11, 6.5), '#3a180c', 3.5, 0.8) + blob(c, ell(252, 86, 11, 6.5), '#2a1208', 3.5, 0.85) +
    blob(c, 'M196 28L284 28L284 74Q262 66 240 70Q218 66 196 76Z', '#0c0503', 6, 0.9) +
    blob(c, 'M254 40L284 40L284 128L260 128Z', '#1a0a04', 9, 0.6) +
    // locks of dark hair falling from under the hood
    P(sm([[212, 50], [228, 46], [226, 54], [220, 68], [216, 82, 0], [213, 66]]), '#170b05') +
    P(sm([[268, 50], [250, 46], [254, 54], [260, 66], [265, 82, 0], [267, 64]]), '#120804') +
    P(sm([[226, 46], [246, 45], [238, 52], [230, 62, 0], [229, 52]]), '#1e0f07') +
    c.strands({ x0: 214, y0: 48, x1: 266, y1: 60, n: 30, a: 96, spread: 26, len: 12, w: 1.4, cols: ['#4a2c18', '#2a170c'], op: 0.7 }) +
    // weathered creases below the eyes
    line(c, 'M219 92Q227 95 235 92', '#5a2c18', 1.2, 0.5, 0.6) + line(c, 'M245 92Q253 95 261 92', '#4a2414', 1.2, 0.5, 0.6) +
    line(c, 'M216 88L212 86', '#4a2414', 1, 0.4, 0.5) + line(c, 'M264 88L268 86', '#4a2414', 1, 0.4, 0.5));
  const eye = (x, y, flip) => {
    const shape = sm([[x - 8, y + 1, 0.5], [x - 3, y - 3], [x + 4, y - 3], [x + 8, y - 0.5 * flip, 0.5], [x + 3, y + 2.4], [x - 3, y + 2.4]]);
    return P(shape, '#c2b09c') + c.inside(shape,
      `<circle cx="${x + flip * 0.6}" cy="${y - 0.2}" r="3.7" fill="${c.rgU([[0, '#c49a48'], [0.55, '#6e4a18'], [1, '#22140a']], x, y, 3.7)}"/>` +
      `<circle cx="${x + flip * 0.6}" cy="${y - 0.2}" r="1.7" fill="#0a0503"/>` +
      blob(c, `M${x - 9} ${y - 5}L${x + 9} ${y - 5}L${x + 9} ${y - 0.5}L${x - 9} ${y - 0.5}Z`, '#1a0a04', 1.1, 0.8)) +
      `<circle cx="${x - 1.2}" cy="${y - 1.1}" r="1.05" fill="#fffaf0"/>` +
      S(sm([[x - 9, y + 0.8], [x - 3, y - 3.6], [x + 4, y - 3.6], [x + 9, y - 0.3]], false), '#120704', 1.8);
  };
  head += eye(228, 86, 1) + eye(252, 86, -1);
  head += P(sm([[213, 79, 0], [222, 73.5], [236, 78], [237, 81.5, 0], [224, 78], [214, 81.5, 0]]), '#1a0d06');
  head += P(sm([[243, 78.5, 0], [257, 73.5], [267, 77], [266, 80.5, 0], [256, 78], [243, 82, 0]]), '#140a05');
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
    const re = [124, 128], rw = [154, 62], rf = [160, 48];
    const le = [352, 270], lw = [330, 318], lf = [318, 328];
    back += armSvg(rs, re, rw, -1);
    back += sword([146, 60], [182, 38], [412, 26], 20) + fist(c, rf, ang([146, 60], [182, 38]), -1);
    front += armSvg(ls, le, lw, 1);
    front += dagger([334, 344], [304, 312], [258, 250]) + fist(c, lf, ang([334, 344], [304, 312]), 1);
  }
  // order: legs, raised arm, torso, arms, hood and head
  const body = legsSvg + back + G(torso + torsoAO, `transform="${tr}"`) + front + G(head, `transform="${tr}"`);
  return `<g filter="${c.fx()}">${body}</g>`;
}

// ---------------------------------------------------------------- wolf
// The dire wolf's head in local coordinates: (0, 0) between the eyes, about
// 200px across the cheek ruff. jaw: 0.15 = snarling, 1 = jaws wide.
function wolfHead(c, jaw, pal) {
  const J = jaw * 92;
  const furV = c.vol({ k: 6, b: 5, so: 0.5, ho: 0.22, tex: 0.3, tf: 0.07, tc: '#0c0c10', seed: 12 });
  const furVs = c.vol({ k: 3, b: 2.5, so: 0.5, ho: 0.25 });
  let s = '';
  // ears, laid back
  for (const sd of [-1, 1]) {
    const ear = sm([[82 * sd, -18], [102 * sd, -80], [94 * sd, -132, 0], [64 * sd, -98], [34 * sd, -58]]);
    const inner = sm([[76 * sd, -36], [90 * sd, -82], [88 * sd, -118, 0], [64 * sd, -90], [46 * sd, -62]]);
    s += P(ear, sd < 0 ? pal.grey() : pal.dark(), `filter="${furV}"`);
    s += c.inside(ear, P(inner, c.lg([[0, '#7a4a4c'], [0.6, '#3e2224'], [1, '#1c1012']])) +
      blob(c, inner, '#120808', 5, 0.5) +
      c.strands({ x0: 46 * sd - 30, y0: -100, x1: 46 * sd + 30, y1: -40, n: 40, a: -90 + 20 * sd, spread: 20, len: 20, w: 1.4, cols: ['#e6e0d4', '#b8b2a8'], op: 0.75 }) +
      c.strands({ x0: 60 * sd - 50, y0: -134, x1: 60 * sd + 50, y1: -30, n: 30, a: -95 + 10 * sd, spread: 15, len: 14, w: 1.6, cols: ['#2a2a2e', '#55565c'], op: 0.6 }));
  }
  // skull and cheek ruff
  const head = tuft([[0, -66], [30, -63], [56, -50], [74, -28, 1, 7], [90, 0, 1, 10], [101, 32, 1, 12], [98, 64, 1, 12], [86, 94, 1, 10], [62, 116, 1, 8],
    [34, 128 + J * 0.5], [0, 134 + J], [-34, 128 + J * 0.5, 1, 8], [-62, 116, 1, 10], [-86, 94, 1, 12], [-98, 64, 1, 12], [-101, 32, 1, 10], [-90, 0, 1, 7], [-74, -28], [-56, -50], [-30, -63]], { seed: 21, n: 2.4, lean: 0.25 });
  s += P(head, pal.grey(), `filter="${furV}"`);
  s += c.inside(head,
    // pale cheeks, darker crown and the mask round the eyes
    blob(c, ell(-74, 62, 30, 44, -10), '#e6e0d2', 10, 0.75) + blob(c, ell(74, 60, 30, 44, 10), '#b6b0a4', 10, 0.6) +
    blob(c, ell(0, -40, 46, 26), '#2c2d32', 12, 0.65) +
    blob(c, ell(-36, -14, 22, 8, -18), '#e8e2d6', 4, 0.55) + blob(c, ell(36, -16, 22, 8, 18), '#cfc9bc', 4, 0.45) +
    blob(c, ell(70, 30, 30, 60), '#16161a', 14, 0.45) +
    c.strands({ x0: -100, y0: -66, x1: 100, y1: 130, n: 260, len: 14, w: 1.3, cols: ['#2e2f34', '#4a4b50', '#d8d4ca', '#9c9b98'], op: 0.55, spread: 18,
      field: (x, y) => (Math.atan2(y - 50, x) * 180) / Math.PI }));
  // lower jaw
  const jawD = sm([[-60, 98], [-46, 116 + J * 0.85], [-22, 128 + J], [0, 132 + J], [22, 128 + J], [44, 114 + J * 0.85], [56, 96], [30, 100 + J * 0.6], [-30, 102 + J * 0.6]]);
  s += P(jawD, pal.cream(), `filter="${furVs}"`);
  s += c.inside(jawD, blob(c, ell(20, 130 + J, 30, 10), '#2a2a2e', 6, 0.5));
  // mouth: the lifted upper lip and the lower lip
  const upper = [[-60, 100], [-48, 90], [-34, 84], [-18, 88], [-4, 92], [12, 88], [28, 82], [44, 88], [56, 98]];
  const lower = [[56, 98], [44, 110 + J * 0.8], [24, 118 + J], [0, 122 + J], [-20, 120 + J], [-44, 112 + J * 0.8]];
  const mouth = sm([...upper.map((p, i) => [p[0], p[1], i === 0 || i === upper.length - 1 ? 0.3 : 1]), ...lower.slice(1)]);
  s += P(mouth, c.lg([[0, '#5a0e14'], [0.6, '#2a0508'], [1, '#120204']], 0.5, 0, 0.5, 1));
  let teeth = '';
  // gums
  teeth += P(sm([...upper.slice(1, -1).map(([x, y]) => [x, y - 2]), ...upper.slice(1, -1).reverse().map(([x, y]) => [x, y + 9])]), c.lg([[0, '#c24a52'], [1, '#7a1820']], 0, 0, 0, 1));
  if (J > 20) {
    teeth += P(ell(-4, 100 + J * 0.8, 34, 16), c.lg([[0, '#d0606a'], [0.6, '#9a3038'], [1, '#4a0c14']], 0.3, 0, 0.6, 1));
    teeth += line(c, `M-4 ${96 + J * 0.7}L-4 ${110 + J * 0.85}`, '#5a1018', 2, 1.5, 0.7);
    for (let k = 0; k < 4; k++) teeth += line(c, `M-30 ${102 + k * 8}Q-4 ${96 + k * 8} 24 ${102 + k * 8}`, '#7a2028', 2, 1, 0.5);
  }
  const tooth = (b, t, w, hi = 0.7) => {
    const d = rib([[b[0], b[1], w], [lerp(b[0], t[0], 0.55) + (t[0] - b[0]) * 0.15, lerp(b[1], t[1], 0.55), w * 0.75], [t[0], t[1], 0]], 0.4);
    return P(d, c.lg([[0, '#fffaf0'], [0.5, '#e8dcc2'], [1, '#9c8c6c']], 0, 0, 1, 1)) + c.inside(d, blob(c, ell(b[0] - w * 0.2, lerp(b[1], t[1], 0.3), w * 0.18, Math.abs(t[1] - b[1]) * 0.25), '#ffffff', 1, hi));
  };
  // lower teeth first (behind the upper canines)
  for (let k = 0; k < 6; k++) { const x = -16 + k * 5.6; teeth += tooth([x, 121 + J], [x + 0.5, 113 + J], 5); }
  teeth += tooth([-26, 124 + J], [-21, 100 + J * 0.62], 10) + tooth([20, 122 + J], [16, 98 + J * 0.62], 10);
  teeth += tooth([-52, 104 + J * 0.7], [-50, 96 + J * 0.6], 6) + tooth([47, 102 + J * 0.7], [45, 94 + J * 0.6], 6);
  // upper teeth
  for (let k = 0; k < 6; k++) { const x = -19 + k * 6.6; teeth += tooth([x, 93], [x + 0.6, 104], 6.2); }
  teeth += tooth([-50, 94], [-50, 104], 6) + tooth([-57, 98], [-57, 106], 5) + tooth([46, 92], [46, 102], 6) + tooth([52, 96], [52, 104], 5);
  teeth += tooth([-36, 90], [-31, 130], 12.5, 0.85) + tooth([31, 88], [27, 128], 12.5, 0.75);
  s += c.inside(mouth, teeth + blob(c, ell(-4, 92, 60, 6), '#200406', 3, 0.5));
  // wet lip edges
  s += S(sm(lower, false), '#18080a', 2.5) + S(sm(upper, false), '#1a0a0c', 2.2);
  // muzzle with the snarl wrinkles
  const muzzle = sm([[-14, -14], [12, -16], [24, 6], [34, 34], [44, 56], [54, 76], [60, 92], [56, 98, 0.3], [44, 88], [28, 82], [12, 88], [-4, 92], [-18, 88], [-34, 84], [-48, 90], [-60, 100, 0.3], [-62, 90], [-52, 72], [-42, 52], [-34, 28], [-26, 4]]);
  s += P(muzzle, c.lg([[0, '#c8c2b6'], [0.35, '#8e8c88'], [0.75, '#5a5a5e'], [1, '#2a2a2e']], 0.15, 0, 0.85, 1), `filter="${c.vol({ k: 5, b: 4, so: 0.5, ho: 0.25, tex: 0.25, tf: 0.09, tc: '#0c0c10', seed: 14 })}"`);
  s += c.inside(muzzle,
    blob(c, ell(-6, 4, 12, 22), '#2a2a2e', 6, 0.7) +
    blob(c, ell(-44, 84, 18, 12), '#f0ebe0', 5, 0.7) + blob(c, ell(42, 82, 18, 12), '#cbc5b8', 5, 0.55) +
    [18, 28, 38, 48].map((y, i) => line(c, `M${-30 + i * 2} ${y}Q-6 ${y - 8 + i} ${24 - i} ${y}`, '#16161a', 2.6, 1.2, 0.75) + line(c, `M${-28 + i * 2} ${y - 4}Q-6 ${y - 12 + i} ${22 - i} ${y - 4}`, '#dcd6ca', 1.6, 1, 0.45)).join('') +
    line(c, 'M-34 60Q-46 66 -54 80', '#16161a', 2.2, 1, 0.6) + line(c, 'M24 58Q38 64 46 78', '#16161a', 2.2, 1, 0.6) +
    // whisker spots
    [[-44, 76], [-38, 80], [-48, 82], [36, 74], [42, 78], [32, 80]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#2a2a2e" opacity="0.7"/>`).join('') +
    c.strands({ x0: -60, y0: -14, x1: 60, y1: 100, n: 110, len: 8, w: 1, cols: ['#2a2b30', '#d8d2c6'], op: 0.4, spread: 12, field: (x, y) => (Math.atan2(y - 66, x + 6) * 180) / Math.PI + 180 }));
  // nose
  const nose = sm([[-30, 57], [-6, 51], [18, 55], [27, 66], [18, 80], [-6, 86], [-28, 80], [-37, 68]]);
  s += P(nose, c.lg([[0, '#5a585c'], [0.4, '#1e1c20'], [1, '#08080a']]));
  s += c.inside(nose, P(sm([[-24, 70], [-15, 67], [-12, 76], [-20, 78]]), '#030304') + P(sm([[12, 69], [3, 66], [0, 75], [8, 77]]), '#030304') +
    blob(c, ell(-12, 59, 12, 4), '#d8dce4', 2.5, 0.75) + blob(c, ell(-26, 66, 3, 4), '#9aa0aa', 2, 0.5) + line(c, 'M-6 76L-5 86', '#000', 1.5, 0.6, 0.8));
  s += line(c, 'M-5 86L-4 92', '#18080a', 1.6, 0.5, 0.8);
  // eyes: slanted amber eyes under furrowed brows
  for (const sd of [-1, 1]) {
    const cx = 37 * sd, cy = 2 - sd;
    const eye = sm([[cx + 19 * sd, cy - 7, 0.4], [cx + 6 * sd, cy - 8], [cx - 8 * sd, cy - 3], [cx - 16 * sd, cy + 7, 0.4], [cx - 4 * sd, cy + 9], [cx + 10 * sd, cy + 4]]);
    s += P(sm([[cx + 24 * sd, cy - 10], [cx + 6 * sd, cy - 12], [cx - 12 * sd, cy - 6], [cx - 21 * sd, cy + 9], [cx - 4 * sd, cy + 13], [cx + 14 * sd, cy + 7]]), '#0c0b0e');
    s += P(eye, c.rgU([[0, '#fff2a0'], [0.35, '#f5c33a'], [0.75, '#d07a10'], [1, '#6a3404']], cx - 2 * sd, cy + 1, 14));
    s += c.inside(eye, `<ellipse cx="${cx - 1 * sd}" cy="${cy + 1}" rx="4" ry="5" fill="#050405"/>` +
      blob(c, `M${cx - 24} ${cy - 16}L${cx + 24} ${cy - 16}L${cx + 24} ${cy - 3}L${cx - 24} ${cy - 3}Z`, '#2a1404', 2.2, 0.75));
    s += `<circle cx="${cx - 3}" cy="${cy - 2}" r="1.6" fill="#ffffff"/><circle cx="${cx + 3 * sd}" cy="${cy + 4}" r="0.8" fill="#fff6c8" opacity="0.8"/>`;
    // furrowed brow
    s += P(sm([[cx + 26 * sd, cy - 14, 0], [cx + 6 * sd, cy - 18], [cx - 16 * sd, cy - 10], [cx - 22 * sd, cy - 4, 0], [cx - 10 * sd, cy - 12], [cx + 8 * sd, cy - 14]]), sd < 0 ? '#e4dfd4' : '#a8a49c', 'opacity="0.85"');
  }
  s += line(c, 'M-6 -22L-3 -6', '#16161a', 2.4, 1, 0.7) + line(c, 'M6 -24L3 -6', '#16161a', 2.4, 1, 0.7) + line(c, 'M0 -30L0 -8', '#d0cabe', 1.4, 1, 0.4);
  return s;
}

// Huge grey dire wolf, three-quarter toward the viewer, head on the left and
// hackles up. attack: jaws wide mid-snap, near forepaw raised.
function wolf(c, A) {
  const pal = {
    grey: () => c.lg([[0, '#bdbcb8'], [0.3, '#86878b'], [0.7, '#4e4f55'], [1, '#232428']], 0.1, 0, 0.9, 1),
    dark: () => c.lg([[0, '#76777c'], [0.5, '#45464c'], [1, '#18191c']], 0.1, 0, 0.9, 1),
    cream: () => c.lg([[0, '#f2ece0'], [0.5, '#c4bdae'], [1, '#6a665e']], 0.2, 0, 0.8, 1),
  };
  const fur = c.vol({ k: 10, b: 8, so: 0.55, ho: 0.18, tex: 0.35, tf: 0.05, tc: '#0c0c10', seed: 5 });
  const furS = c.vol({ k: 6, b: 4, so: 0.55, ho: 0.2, tex: 0.3, tf: 0.07, tc: '#0c0c10', seed: 6 });
  const dy = A ? 18 : 0; // crouch
  const furStr = (x0, y0, x1, y1, n, a, cols, len = 16, op = 0.55, spread = 16, field) => c.strands({ x0, y0, x1, y1, n, a, spread, len, w: 1.5, cols, op, field });
  const DARK = ['#1c1d21', '#2c2d32', '#3e3f44'];
  const LIGHT = ['#c9c8c4', '#a9a8a6', '#e2dfd8'];
  const paw = (x, y, w, dark) => {
    const d = tuft([[x - w / 2, y - 14], [x - w / 4, y - 22], [x + w / 4, y - 22], [x + w / 2, y - 12], [x + w / 2 + 2, y + 2], [x - w / 2 - 2, y + 2]], { def: 0 });
    let s = P(d, dark ? pal.dark() : pal.grey(), `filter="${furS}"`);
    s += c.inside(d, [-0.3, -0.1, 0.1, 0.3].map((t) => line(c, `M${r1(x + t * w)} ${y - 14}L${r1(x + t * w * 1.2)} ${y + 2}`, '#141418', 2, 1.2, 0.7)).join('') +
      blob(c, ell(x - w * 0.15, y - 16, w * 0.3, 5), '#e8e4dc', 4, dark ? 0.2 : 0.5));
    // claws
    for (const t of [-0.32, -0.11, 0.11, 0.32]) s += P(sm([[x + t * w - 3, y - 2], [x + t * w + 3, y - 2], [x + t * w * 1.25, y + 2, 0]]), '#d8d0c0');
    return s;
  };
  const leg = (pts, dark, side = 0) => {
    const d = sm(ribPts(pts));
    let s = P(d, dark ? pal.dark() : pal.grey(), `filter="${furS}"`);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    s += c.inside(d, furStr(Math.min(...xs) - 30, Math.min(...ys), Math.max(...xs) + 30, Math.max(...ys), 70, 95, dark ? DARK : [...DARK, ...LIGHT], 14, 0.5, 12) +
      blob(c, ell(xs[0] - 10, (ys[0] + ys[ys.length - 1]) / 2, 8, 60), dark ? '#5a5b60' : '#d4d0c8', 8, dark ? 0.3 : 0.45));
    return s;
  };

  let s = '';
  // far legs, in shadow
  s += leg([[284, 262 + dy, 46], [289, 312 + dy, 36], [292, 352 + dy, 28], [294, 392, 25], [295, 414, 25]], true) + paw(298, 426, 44, true);
  s += leg([[568, 280 + dy, 42], [592, 336 + dy, 28], [600, 370, 22], [590, 400, 20], [584, 418, 20]], true) + paw(580, 428, 38, true);
  // tail, raised
  const tail = A ? [[560, 150 + dy, 46], [586, 116 + dy, 54], [604, 84 + dy, 50], [620, 56 + dy, 34], [632, 36 + dy, 0]] : [[560, 146, 46], [588, 110, 54], [606, 76, 50], [620, 46, 34], [628, 20, 0]];
  const tailD = tuft(ribPts(tail).map((p) => [p[0], p[1], p[2] ?? 1, 9]), { seed: 31, lean: 0.8, n: 2.2 });
  s += P(tailD, pal.grey(), `filter="${fur}"`);
  s += c.inside(tailD, furStr(550, 10, 640, 200, 120, -60, [...DARK, ...LIGHT], 22, 0.6, 18) + blob(c, ell(630, 40, 16, 30), '#141418', 10, 0.7));
  // body
  const body = tuft([[236, 120], [282, 76, 1, 14], [336, 62 + dy, 1, 16], [400, 84 + dy, 1, 12], [462, 104 + dy, 1, 10], [522, 114 + dy, 1, 6], [562, 128 + dy], [588, 160 + dy], [594, 204 + dy], [586, 252 + dy, 1, 8],
    [562, 292 + dy, 1, 7], [520, 300 + dy, 1, 8], [470, 300 + dy, 1, 9], [400, 316 + dy, 1, 10], [330, 334 + dy, 1, 10], [270, 330 + dy], [226, 300]], { seed: 41, lean: 0.9, n: 2.4 });
  s += P(body, pal.grey(), `filter="${fur}"`);
  s += c.inside(body,
    // darker saddle along the back, pale belly
    blob(c, sm([[280, 60], [520, 100], [580, 140], [520, 170], [380, 150], [290, 130]]), '#1e1f24', 18, 0.75) +
    blob(c, sm([[300, 300], [460, 290], [520, 300], [460, 330], [320, 350]]), '#d6d0c4', 14, 0.55) +
    blob(c, sm([[420, 160], [560, 150], [590, 260], [500, 300], [430, 260]]), '#121216', 24, 0.45) +
    furStr(230, 50, 600, 340, 520, 12, [...DARK, ...DARK, ...LIGHT], 20, 0.55, 16, (x, y) => (y < 150 ? -20 + (x - 300) * 0.02 : 30)) +
    furStr(260, 50, 560, 140, 140, -40, ['#0e0e12', '#26272c'], 22, 0.7, 20));
  // near hind leg
  const thigh = tuft([[478, 168 + dy], [540, 156 + dy, 1, 0], [580, 196 + dy, 1, 8], [586, 256 + dy, 1, 9], [564, 306 + dy, 1, 8], [528, 324 + dy], [494, 298 + dy], [478, 236 + dy]], { seed: 51, lean: 0.9 });
  s += leg([[542, 300 + dy, 48], [558, 340, 32], [562, 372, 26], [542, 404, 22], [522, 420, 22]], false) + paw(516, 430, 44, false);
  s += P(thigh, pal.grey(), `filter="${fur}"`);
  s += c.inside(thigh, blob(c, ell(510, 220 + dy, 20, 40), '#d6d2ca', 12, 0.45) + blob(c, ell(570, 260 + dy, 26, 60), '#141418', 14, 0.55) +
    furStr(470, 150 + dy, 590, 330 + dy, 170, 100, [...DARK, ...LIGHT], 18, 0.55, 18, (x, y) => 70 + (x - 530) * 0.4));
  // hackles and neck ruff behind the head
  const ruff = tuft([[118, 180], [116, 124, 1, 14], [146, 84, 1, 18], [196, 60, 1, 20], [256, 52, 1, 20], [306, 60 + dy * 0.5, 1, 0], [338, 120 + dy], [320, 236 + dy], [220, 262 + dy], [140, 236]], { seed: 61, lean: 0.6, n: 2.6, jit: 0.6 });
  s += P(ruff, pal.grey(), `filter="${fur}"`);
  s += c.inside(ruff, furStr(110, 40, 340, 270, 380, 0, [...DARK, ...DARK, ...LIGHT], 22, 0.6, 14, (x, y) => (Math.atan2(y - 190, x - 210) * 180) / Math.PI) +
    blob(c, ell(290, 170, 40, 80), '#121216', 18, 0.5));
  // near foreleg, then the pale chest ruff over its top
  let fore = '';
  if (A) {
    const fl = [[200, 262, 54], [178, 306, 42], [150, 334, 34], [128, 330, 30]];
    fore += leg(fl, false);
    // raised paw toward the viewer, claws out
    const rp = tuft([[96, 316], [112, 300], [134, 300], [148, 316], [144, 344], [122, 352], [100, 342]], { def: 0 });
    fore += P(rp, pal.grey(), `filter="${furS}"`);
    fore += c.inside(rp, P(ell(122, 330, 14, 11), c.lg([[0, '#3a3236'], [1, '#141014']])) + [[102, 314], [112, 306], [126, 304], [140, 310]].map(([x, y]) => P(ell(x + 2, y + 6, 6, 5), '#2a2226')).join('') + blob(c, ell(112, 304, 14, 6), '#e2ded6', 4, 0.5));
    for (const [x, y, a] of [[100, 310, -150], [110, 300, -120], [126, 297, -90], [142, 302, -60]]) {
      const rad = (a * Math.PI) / 180, ex = x + Math.cos(rad) * 14, ey = y + Math.sin(rad) * 14;
      fore += P(rib([[x, y, 5], [lerp(x, ex, 0.5), lerp(y, ey, 0.5), 3.5], [ex, ey, 0]], 0.5), c.lg([[0, '#f4ecdc'], [1, '#8a8070']]));
    }
  } else {
    fore += leg([[198, 262, 54], [188, 312, 42], [182, 352, 33], [176, 392, 29], [172, 414, 29]], false) + paw(168, 428, 50, false);
  }
  const chest = tuft([[146, 236], [212, 226], [290, 240], [304, 292, 1, 9], [284, 334 + dy * 0.5, 1, 10], [240, 350 + dy * 0.5, 1, 10], [196, 338 + dy * 0.5, 1, 10], [156, 300, 1, 9]], { seed: 71, lean: 0.4, n: 2.6 });
  s += fore.length && A ? '' : '';
  s += P(chest, pal.cream(), `filter="${fur}"`);
  s += c.inside(chest, furStr(140, 220, 310, 360, 220, 95, ['#8e8a82', '#f4f0e6', '#b0aa9e', '#5e5b56'], 18, 0.6, 18) + blob(c, ell(290, 300, 30, 50), '#2a2a2e', 14, 0.5));
  s += fore;
  // head
  const hx = A ? 176 : 192, hy = A ? 172 : 160, hs = A ? 0.8 : 0.74, hr = A ? -8 : -3;
  s += G(wolfHead(c, A ? 1 : 0.14, pal), `transform="translate(${hx} ${hy}) rotate(${hr}) scale(${hs})"`);
  return `<g filter="${c.fx({ seed: 9 })}">${s}</g>`;
}

// ---------------------------------------------------------------- registry
const SPECS = {
  brigand: { w: 480, h: 640, height: 1.8, draw: brigand, seed: 11 },
  wolf: { w: 640, h: 440, height: 1.1, draw: wolf, seed: 23 },
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
