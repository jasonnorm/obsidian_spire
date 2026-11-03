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
    c.clumps({ x0: -96, y0: -60, x1: 96, y1: 132, n: 380, len: 13, lv: 0.5, w: 3, cols: ['#2e2f34', '#3c3d42', '#4c4d52'], op: 0.4, spread: 10, field: (x, y) => (Math.atan2(y - 40, x) * 180) / Math.PI }) +
    c.clumps({ x0: -96, y0: -50, x1: 10, y1: 120, n: 120, len: 12, lv: 0.5, w: 2.6, cols: ['#d6d2c8', '#bdb9b0'], op: 0.35, spread: 10, field: (x, y) => (Math.atan2(y - 40, x) * 180) / Math.PI }));
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
  const cl = (o) => c.clumps({ op: 0.34, w: 3.6, len: 18, spread: 10, lv: 0.6, ...o });
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
  const tail = A ? [[556, 146 + d, 44], [582, 112 + d, 54], [602, 80 + d, 50], [618, 50 + d, 32], [630, 26 + d, 0]] : [[556, 142, 44], [584, 106, 54], [604, 72, 50], [618, 42, 32], [626, 14, 0]];
  const tailD = tuft(ribPts(tail).map((p) => [p[0], p[1], p[2] ?? 1, 10]), { seed: 31, lean: 0.9, n: 2.4, jit: 0.7 });
  s += P(tailD, pal.grey(), `filter="${fur}"`);
  s += c.inside(tailD, cl({ x0: 540, y0: 0, x1: 640, y1: 200, n: 140, a: -62, len: 24, cols: [...DK, ...MD, ...LT] }) + blob(c, ell(624, 34 + d, 16, 30), '#0e0e12', 10, 0.75) + blob(c, ell(610, 120, 20, 60), '#0e0e12', 14, 0.5));
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
    const rp = sm([[94, 314], [110, 296], [134, 294], [150, 312], [146, 342], [122, 352], [98, 342]]);
    fore += P(rp, pal.grey(), `filter="${furS}"`);
    fore += c.inside(rp, P(ell(124, 330, 13, 10), c.lg([[0, '#4a3a3e'], [1, '#141014']])) + [[102, 312], [113, 303], [128, 301], [142, 307]].map(([x, y]) => P(ell(x + 2, y + 7, 6, 5), c.lg([[0, '#4a3a3e'], [1, '#1a1216']]))).join('') + blob(c, ell(112, 298, 14, 5), '#e2ded6', 4, 0.5));
    for (const [x, y, a] of [[100, 308, -150], [111, 298, -118], [127, 295, -88], [143, 300, -58]]) {
      const rad = (a * Math.PI) / 180, ex = x + Math.cos(rad) * 15, ey = y + Math.sin(rad) * 15;
      fore += P(rib([[x, y, 5], [lerp(x, ex, 0.5), lerp(y, ey, 0.5), 3.5], [ex, ey, 0]], 0.5), c.lg([[0, '#f4ecdc'], [1, '#8a8070']]));
    }
    s += fore;
  }
  const hx = A ? 172 : 190, hy = A ? 168 : 158, hs = A ? 0.82 : 0.76, hr = A ? -8 : -3;
  s += G(wolfHead(c, A ? 1 : 0.14, pal), `transform="translate(${hx} ${hy}) rotate(${hr}) scale(${hs})"`);
  return `<g filter="${c.fx({ seed: 9 })}">${s}</g>`;
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
  const mouthIn = sm([[-36, 50, 0.3], [-16, 56], [6, 64], [30, 70], [56, 72], [70, 72, 0.3], [jawTop[0][0] + 10, jawTop[0][1] + 4], ...jawTop.slice(0, 3), [-34, 52, 0.3]]);
  s += P(mouthIn, blaze ? c.rgU([[0, '#fffbe6'], [0.3, '#ffe36a'], [0.65, '#ff9a1e'], [1, '#b8300a']], 22, 82, 56) : c.lg([[0, '#5a1408'], [1, '#160302']], 0, 0, 0, 1));
  let jw = P(jawD, hide(), `filter="${v}"`);
  for (let k = 0; k < 7; k++) {
    const t = k / 6, x = lerp(-18, 50, t), y = lerp(64, 84, t) - 2, h = k === 5 ? 16 : 8;
    jw += P(sm([[x - 3, y + 2], [x + 3, y + 3], [x + 1, y - h, 0]]), c.lg([[0, '#fffbe8'], [1, '#a89878']], 0, 1, 0, 0));
  }
  jw += c.inside(jawD, line(c, 'M-20 64Q20 86 56 88', '#9a7ae0', 1.5, 1, 0.5));
  s += G(jw, `transform="rotate(${J} -34 50)"`);
  // skull: narrow, gaunt, sunken
  const skull = tuft([[-12, -52], [14, -50], [34, -38], [44, -18], [50, 6], [60, 30], [70, 50], [76, 62], [70, 74], [56, 78], [30, 74], [6, 66], [-16, 58], [-36, 50, 1, 5], [-52, 34, 1, 6], [-58, 10, 1, 5], [-54, -16], [-36, -42]], { seed: 83, lean: -0.6, n: 2, jit: 0.8 });
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
  const lip = [[-36, 50], [-16, 58], [6, 66], [30, 74], [56, 78], [70, 74]];
  for (let k = 0; k < 8; k++) {
    const t = (k + 0.5) / 8, x = lerp(-28, 64, t), y = lerp(54, 78, t) - (t > 0.8 ? 2 : 0), h = k === 6 ? 22 : 10;
    s += P(sm([[x - 3.2, y - 2], [x + 3.2, y - 1], [x + 0.5, y + h, 0]]), c.lg([[0, '#fffbe8'], [1, '#a89878']], 0, 0, 0, 1));
  }
  s += S(sm(lip, false), '#020105', 2.4);
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

// Gloom Hound: a gaunt spectral black-violet hound facing right with its head
// turned to the viewer, violet ribs showing through, burning yellow eyes and
// smoke trailing. attack: leaping, mouth blazing.
function hound(c, A) {
  const v = c.vol({ k: 8, b: 6, sc: '#010003', so: 0.65, hc: '#b898ff', ho: 0.2, tex: 0.35, tf: 0.05, tc: '#000', seed: 34 });
  const vs = c.vol({ k: 4, b: 3, sc: '#010003', so: 0.65, hc: '#b898ff', ho: 0.24 });
  const hide = () => c.lg([[0, '#3a2c66'], [0.3, '#1c1536'], [0.7, '#0c0818'], [1, '#040307']], 0.1, 0, 0.9, 1);
  const far = () => c.lg([[0, '#1e1636'], [0.5, '#0c0818'], [1, '#030206']], 0.1, 0, 0.9, 1);
  const T = A ? { rot: -18, cx: 320, cy: 240, dx: 14, dy: -36 } : { rot: 0, cx: 0, cy: 0, dx: 0, dy: 0 };
  const tp = (x, y) => xf([[x, y]], T)[0];
  const tr = `translate(${T.dx} ${T.dy}) rotate(${T.rot} ${T.cx} ${T.cy})`;

  // a paw: long toes and claws, pointing along ang (degrees, 0 = right)
  const paw = (x, y, ang, w, dark) => {
    const R = (pts) => xf(pts, { rot: ang }).map(([px, py, ...r]) => [px + x, py + y, ...r]);
    const d = sm(R([[-w * 0.45, -9], [w * 0.2, -10], [w * 0.62, -2], [w * 0.7, 6], [w * 0.4, 9, 0], [-w * 0.5, 9, 0]]));
    let s = P(d, dark ? far() : hide(), `filter="${vs}"`);
    s += c.inside(d, [0.05, 0.3, 0.52].map((t) => { const [p, q] = R([[w * t, -6], [w * t + 2, 8]]); return line(c, `M${r1(p[0])} ${r1(p[1])}L${r1(q[0])} ${r1(q[1])}`, '#000', 1.6, 0.8, 0.8); }).join(''));
    for (const t of [0.18, 0.42, 0.64]) {
      const cl = sm(R([[w * t, 4], [w * t + 5, 3], [w * t + 12, 11, 0], [w * t + 3, 8]]));
      s += P(cl, c.lg([[0, '#e8dcc8'], [1, '#6a6050']]));
    }
    return s;
  };
  // a jointed leg along [x, y, width] knots, sinew and bone under thin hide
  const leg = (pts, dark) => {
    const d = sm(ribPts(pts));
    let s = P(d, dark ? far() : hide(), `filter="${vs}"`);
    const hi = sm(pts.map((p) => [p[0] - p[2] * 0.22, p[1], 1]), false);
    s += c.inside(d, line(c, hi, dark ? '#3a2c66' : '#8a6ad8', 2.2, 1.6, dark ? 0.4 : 0.6) +
      pts.slice(1, -1).map((p) => blob(c, ell(p[0] - p[2] * 0.15, p[1], p[2] * 0.3, p[2] * 0.25), dark ? '#4a3a80' : '#a888f0', 2, 0.4)).join(''));
    return s;
  };

  let farLegs, nearLegs;
  if (!A) {
    farLegs = leg([[458, 276, 34], [464, 318, 24], [468, 372, 14], [472, 384, 15], [476, 420, 12], [480, 452, 11]], true) + paw(486, 466, 0, 26, true) +
      leg([[268, 272, 40], [254, 316, 26], [234, 356, 15], [228, 368, 16], [232, 412, 11], [236, 452, 10]], true) + paw(240, 466, 0, 24, true);
    nearLegs = leg([[434, 270, 42], [438, 316, 28], [442, 370, 16], [445, 384, 17], [448, 420, 14], [452, 452, 13]], false) + paw(458, 470, 0, 30, false) +
      leg([[242, 262, 46], [226, 310, 30], [204, 354, 17], [198, 368, 18], [202, 412, 12], [206, 452, 12]], false) + paw(212, 470, 0, 28, false);
  } else {
    const nf = tp(434, 274), ff = tp(458, 280), nh = tp(240, 268), fh = tp(266, 278);
    farLegs = leg([[ff[0], ff[1], 30], [520, 262, 18], [560, 250, 13], [590, 244, 11]], true) + paw(598, 242, -12, 26, true) +
      leg([[fh[0], fh[1], 34], [196, 318, 20], [158, 362, 13], [142, 412, 11], [138, 450, 10]], true) + paw(142, 466, 12, 24, true);
    nearLegs = leg([[nf[0], nf[1], 38], [500, 290, 22], [544, 292, 16], [576, 290, 13]], false) + paw(584, 290, -4, 30, false) +
      leg([[nh[0], nh[1], 40], [170, 316, 24], [128, 354, 15], [104, 408, 12], [92, 450, 12]], false) + paw(94, 468, 18, 28, false);
  }
  // body: hollow flanks, ribs and hip bones; ragged hide trailing backward
  const bodyD = tuft([[452, 148], [420, 126, 1, 5], [386, 132, 1, 6], [348, 144, 1, 6], [310, 148, 1, 6], [272, 142, 1, 7], [238, 136, 1, 7], [206, 144, 1, 8], [178, 156, 1, 8], [158, 176, 1, 8], [150, 208, 1, 7], [156, 242], [178, 270], [212, 290], [246, 292], [256, 266, 1, 5], [266, 238, 1, 5], [294, 224, 1, 6], [332, 246, 1, 6], [372, 278, 1, 6], [410, 298, 1, 6], [440, 304], [464, 270], [470, 226]], { seed: 91, lean: -1.4, n: 2.2, jit: 0.8 });
  let bd = P(bodyD, hide(), `filter="${v}"`);
  let ribs = '';
  for (let k = 0; k < 7; k++) {
    const x0 = 318 + k * 17, y0 = 158 + k * 1.5;
    const d = `M${x0} ${y0}Q${x0 - 18 + k * 2} ${y0 + 60} ${x0 + 6 + k * 4} ${266 + k * 4 - (k > 4 ? (k - 4) * 6 : 0)}`;
    ribs += line(c, d, '#000000', 10, 3.5, 0.75) + line(c, d, '#9a6cff', 3.4, 1.4, 0.9) + line(c, d, '#e6d8ff', 1.1, 0.5, 0.55);
  }
  let spine = '';
  for (let k = 0; k < 12; k++) { const x = 228 + k * 17, y = 142 + Math.sin(k * 0.5) * 3 + (k < 3 ? 2 : 0); spine += P(ell(x, y + 6, 6, 3.5), '#8a6ad8', `filter="${c.blur(1.5)}" opacity="0.55"`); }
  bd += c.inside(bodyD,
    blob(c, sm([[260, 224], [300, 226], [334, 252], [300, 270], [262, 262]]), '#000', 10, 0.6) +
    ribs + spine +
    // haunch and shoulder blade
    blob(c, ell(206, 200, 34, 52, -20), '#2e2454', 12, 0.6) + blob(c, ell(214, 166, 16, 10), '#a080f0', 5, 0.55) +
    line(c, 'M234 172Q246 230 250 284', '#000', 9, 5, 0.6) + line(c, 'M190 186Q204 236 224 280', '#7a5cc8', 2.5, 2, 0.45) +
    line(c, 'M452 160Q440 220 446 292', '#000', 10, 6, 0.6) + blob(c, ell(410, 176, 22, 30, 20), '#2e2454', 10, 0.6) + line(c, 'M396 150Q420 170 430 210', '#a080f0', 2.5, 2, 0.4) +
    c.strands({ x0: 150, y0: 126, x1: 470, y1: 306, n: 300, a: 172, spread: 12, len: 18, w: 1.1, cols: ['#000', '#2e2454', '#05030a'], op: 0.55 }));
  const tail = A ? [[170, 162, 18], [130, 160, 13], [92, 148, 9], [58, 130, 6], [30, 110, 0]] : [[166, 166, 18], [132, 184, 13], [98, 194, 9], [64, 188, 6], [32, 172, 0]];
  bd = P(tuft(ribPts(tail, 1, 0).map((p) => [p[0], p[1], p[2] ?? 1, 4]), { seed: 97, lean: -1, n: 2 }), hide(), `filter="${vs}"`) + bd;
  const neck = rib([[470, 134, 58], [450, 178, 68], [436, 222, 76]]);
  bd += P(neck, hide(), `filter="${v}"`) + c.inside(neck, line(c, 'M484 142Q466 182 458 228', '#000', 6, 4, 0.6) + line(c, 'M452 138Q438 172 430 212', '#8a6ad8', 2.5, 2.5, 0.45) + line(c, 'M462 150Q452 190 446 226', '#000', 2, 1.5, 0.5));

  let s = farLegs + G(bd, `transform="${tr}"`) + nearLegs;
  const H = A ? [500, 108] : tp(488, 120);
  const hs = A ? 0.9 : 0.86, hr = A ? -8 : 6;
  s += G(houndHead(c, A ? 30 : 3, A), `transform="translate(${r1(H[0])} ${r1(H[1])}) rotate(${hr}) scale(${hs})"`);

  // smoke rising off the hide and unravelling from the tail (no outline)
  let wisps = '', back = '';
  // resample a wisp into many knots with a travelling wave and swelling width
  const wave = (pts, amp, ph) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < 4; k++) {
        const t = k / 4, a = pts[i], b = pts[i + 1], j = i * 4 + k;
        out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) + Math.sin(j * 0.9 + ph) * amp * (j / (pts.length * 4)) * 2, lerp(a[2], b[2], t) * (1 + 0.35 * Math.sin(j * 1.3 + ph))]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  const W = (pts, col, op, b, behind) => { const q = wave(pts.map(([x, y, w]) => { const [X, Y] = tp(x, y); return [X, Y, w]; }), 6, pts[0][0] * 0.1); const w = wisp(c, q, col, op, b); if (behind) back += w; else wisps += w; };
  const tt = A ? [30, 110] : [32, 172];
  W([[tt[0] + 14, tt[1] + 2, 10], [tt[0] - 6, tt[1] - 6, 14], [tt[0] - 26, tt[1] - 10, 10], [tt[0] - 40, tt[1] - 20, 0]], '#9a72ff', 0.85, 2);
  W([[tt[0] + 30, tt[1] + 8, 8], [tt[0], tt[1] + 18, 12], [tt[0] - 30, tt[1] + 26, 0]], '#48d6e0', 0.7, 2);
  for (let k = 0; k < 4; k++) {
    const x = 214 + k * 64, y = 146 - (k > 2 ? 4 : 0);
    W([[x, y + 10, 10], [x - 34, y - 6, 18], [x - 74, y - 16, 16], [x - 120, y - 22, 0]], k % 2 ? '#48d6e0' : '#9a70ff', 0.55, 3);
  }
  W([[160, 236, 12], [116, 250, 20], [70, 254, 16], [20, 250, 0]], '#8c64ff', 0.55, 3.5);
  W([[256, 286, 10], [214, 302, 16], [170, 310, 0]], '#48d6e0', 0.45, 3);
  W([[200, 150, 22], [140, 124, 30], [80, 108, 26], [10, 100, 0]], '#5a3cc0', 0.5, 6, true);
  W([[300, 146, 18], [240, 116, 26], [180, 100, 18], [110, 92, 0]], '#3ab0c0', 0.35, 6, true);
  if (!A) { W([[198, 372, 8], [168, 380, 10], [136, 384, 0]], '#48d6e0', 0.5, 2.5); W([[232, 374, 6], [206, 388, 8], [180, 394, 0]], '#8c64ff', 0.45, 2.5); W([[446, 380, 6], [420, 392, 8], [396, 398, 0]], '#8c64ff', 0.4, 2.5); }
  else { W([[150, 360, 8], [110, 366, 10], [70, 368, 0]], '#48d6e0', 0.55, 2.5); W([[176, 320, 10], [130, 314, 12], [84, 306, 0]], '#8c64ff', 0.5, 3); }

  // glows: eyes, ribs, the blazing mouth
  const hp = (x, y) => { const a = (hr * Math.PI) / 180; return [H[0] + (x * Math.cos(a) - y * Math.sin(a)) * hs, H[1] + (x * Math.sin(a) + y * Math.cos(a)) * hs]; };
  const [ex, ey] = hp(-22, -2), [fx, fy] = hp(26, -7);
  let glow = `<circle cx="${r1(ex)}" cy="${r1(ey)}" r="18" fill="#ffaa18" opacity="0.5" filter="${c.blur(8)}"/><circle cx="${r1(fx)}" cy="${r1(fy)}" r="14" fill="#ffaa18" opacity="0.45" filter="${c.blur(7)}"/>`;
  glow += `<ellipse cx="${r1(ex)}" cy="${r1(ey)}" rx="9" ry="5" fill="#fff8d0" opacity="0.7" filter="${c.blur(2.5)}"/><ellipse cx="${r1(fx)}" cy="${r1(fy)}" rx="6" ry="4" fill="#fff8d0" opacity="0.6" filter="${c.blur(2)}"/>`;
  const ribGlow = sm(xf([[320, 200], [380, 230], [430, 270], [400, 290], [330, 250]], T));
  glow += `<path d="${ribGlow}" fill="#8c5cff" opacity="0.22" filter="${c.blur(16)}"/>`;
  if (A) {
    const [mx, my] = hp(26, 86);
    glow += `<ellipse cx="${r1(mx)}" cy="${r1(my)}" rx="66" ry="46" fill="#ff8a10" opacity="0.45" filter="${c.blur(16)}"/><ellipse cx="${r1(mx)}" cy="${r1(my)}" rx="30" ry="22" fill="#ffe680" opacity="0.6" filter="${c.blur(7)}"/>`;
    for (const [x, y, a, L] of [[40, 96, 40, 40], [20, 100, 70, 44], [56, 90, 20, 46], [0, 92, 95, 34]]) {
      const [X, Y] = hp(x, y); const rad = ((a + hr) * Math.PI) / 180;
      const pts = [[X, Y, 14], [X + Math.cos(rad) * L * 0.5 + 4, Y + Math.sin(rad) * L * 0.5, 10], [X + Math.cos(rad) * L - 6, Y + Math.sin(rad) * L - 8, 0]];
      glow += `<path d="${rib(pts, 1, 0)}" fill="${c.lgU([[0, '#fff2a0', 0.95], [0.5, '#ffb020', 0.8], [1, '#ff5010', 0]], pts[0][0], pts[0][1], pts[2][0], pts[2][1])}" filter="${c.blur(1.5)}"/>`;
    }
  }
  return `${back}<g filter="${c.fx({ seed: 13, rim: 0.85 })}">${s}</g>${wisps}${glow}`;
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
  const backD = sm([[180, 220, 1], [380, 220, 1], [414, 360], [418, hem - 40], ...ragHem(418, 142, hem - 20, 8, 40, 150, A ? 211 : 201, 16), [142, hem - 40], [146, 360]]);
  s += P(backD, teal(), `filter="${cloth}"`);
  s += c.inside(backD, blob(c, ell(280, 420, 130, 200), '#02060c', 30, 0.7));
  // main robe tapering to long uneven rags
  const body = sm([[280, 186], [346, 194], [384, 222], [402, 270], [404, 330], [398, 410], [386, 490], [374, hem], ...ragHem(374, 186, hem, 7, 24, 120, A ? 223 : 213, 12), [174, 490], [162, 410], [156, 330], [158, 270], [176, 222], [214, 194]]);
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
    c.strands({ x0: 140, y0: 200, x1: 420, y1: 660, n: 180, a: 90, spread: 5, len: 46, w: 1.1, cols: ['#02040c', '#3a5aa8', '#1a8a96'], op: 0.35 }) +
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
  const hood = tuft([[280, 22], [304, 30], [330, 52], [346, 86], [354, 128], [360, 170], [384, 196, 1, 10], [400, 222], [340, 236], [280, 244], [220, 236], [160, 222, 1, 10], [176, 196], [200, 170], [206, 128], [214, 86], [230, 52], [256, 30]], { seed: 131, lean: 0.2, n: 1.6, jit: 0.8 });
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

  // mist: the rags trail off into fading strips and a low glow
  const R = rng(A ? 7 : 5);
  for (let k = 0; k < 13; k++) {
    const x = 150 + k * 21 + (R() - 0.5) * 12, y0 = hem + 20 + R() * 40, len = 50 + R() * 50;
    const sway = (R() - 0.5) * 34;
    const pts = [[x, y0, 16 + R() * 8], [x + sway * 0.4, y0 + len * 0.4, 12 + R() * 6], [x + sway * 0.8, y0 + len * 0.75, 6], [x + sway, Math.min(y0 + len, 690), 0]];
    const g = c.lgU([[0, k % 3 === 0 ? '#2a8a9a' : '#1c2c66', 0.9], [0.5, '#16245a', 0.5], [1, '#0e1a40', 0]], x, y0, x + sway, y0 + len);
    mist += `<path d="${rib(pts, 1, 0)}" fill="${g}" filter="${c.blur(2)}"/>`;
  }
  for (let k = 0; k < 7; k++) {
    const x = 170 + k * 36 + (R() - 0.5) * 20, y = hem + 70 + R() * 30;
    mist += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(30 + R() * 20)}" ry="${r1(10 + R() * 8)}" fill="${k % 2 ? '#3aa6b8' : '#2a3c88'}" opacity="${r1(0.16 + R() * 0.12)}" filter="${c.blur(10)}"/>`;
  }
  return `${mist}<g filter="${c.fx({ seed: 17, rim: 0.85 })}">${s}</g>${glow}`;
}

// ---------------------------------------------------------------- registry
const SPECS = {
  brigand: { w: 480, h: 640, height: 1.8, draw: brigand, seed: 11 },
  wolf: { w: 640, h: 440, height: 1.1, draw: wolf, seed: 23 },
  hound: { w: 640, h: 480, height: 1.25, draw: hound, seed: 37 },
  wraith: { w: 560, h: 720, height: 2.2, draw: wraith, seed: 41 },
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
