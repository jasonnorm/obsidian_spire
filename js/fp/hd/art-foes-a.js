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
function rib(pts, cap0 = 1, cap1 = 1) {
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
  return sm(out, true);
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
function fist(c, [x, y], ang, side, cols = ['#8e5a32', '#5a3218', '#22120a']) {
  const loc = [[-14, -13], [0, -16], [13, -12], [16, 2], [10, 14], [-8, 15], [-16, 3]];
  const R = (pts) => xf(pts, { rot: ang - 90, sx: side }).map(([px, py, ...r]) => [px + x, py + y, ...r]);
  const d = sm(R(loc));
  let s = P(d, c.lg([[0, cols[0]], [0.5, cols[1]], [1, cols[2]]]), `filter="${c.vol({ k: 4, b: 3, so: 0.6, ho: 0.3 })}"`);
  const seg = (a, b) => { const [p, q] = R([a, b]); return `M${r1(p[0])} ${r1(p[1])}L${r1(q[0])} ${r1(q[1])}`; };
  s += c.inside(d,
    line(c, seg([0, -5], [15, -4]), '#140904', 1.8, 0.7, 0.7) +
    line(c, seg([0, 2], [15, 3]), '#140904', 1.8, 0.7, 0.7) +
    line(c, seg([-2, 9], [12, 10]), '#140904', 1.8, 0.7, 0.6) +
    line(c, seg([6, -10], [6, 12]), '#c89060', 2.2, 1.2, 0.45));
  // thumb wrapped over the grip
  const th = rib(R([[-13, -10, 11], [-2, -15, 10], [6, -15, 8]]));
  s += P(th, c.lg([[0, cols[0]], [1, cols[1]]]), `filter="${c.vol({ k: 3, b: 2, so: 0.5, ho: 0.35 })}"`);
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
  head += P(face, c.rg([[0, '#e6ae86'], [0.45, '#b97650'], [0.85, '#74402a'], [1, '#42220f']], 0.36, 0.55, 0.72));
  head += c.inside(face,
    blob(c, 'M196 30L284 30L284 70Q240 58 196 72Z', '#0e0604', 7, 0.88) +
    blob(c, 'M258 40L280 40L280 128L262 128Z', '#1e0c06', 8, 0.6) +
    c.strands({ x0: 214, y0: 50, x1: 228, y1: 76, n: 22, a: 100, spread: 14, len: 18, w: 2.2, cols: ['#24140a', '#3a2212', '#120804'], op: 0.9 }) +
    c.strands({ x0: 254, y0: 50, x1: 268, y1: 76, n: 22, a: 80, spread: 14, len: 18, w: 2.2, cols: ['#24140a', '#1a0c06', '#120804'], op: 0.9 }) +
    c.strands({ x0: 222, y0: 48, x1: 258, y1: 54, n: 26, a: 95, spread: 30, len: 12, w: 2, cols: ['#2a170c', '#1a0d06'], op: 0.85 }) +
    blob(c, ell(228, 85, 11, 6.5), '#3e1c10', 3.5, 0.75) + blob(c, ell(252, 85, 11, 6.5), '#2e140a', 3.5, 0.8) +
    blob(c, 'M238 84L242 84L243 100L237 100Z', '#f2c49c', 2, 0.55) +
    blob(c, ell(222, 99, 8, 4), '#f0b890', 4, 0.5) +
    blob(c, ell(260, 99, 7, 4), '#4a2214', 4, 0.5));
  const eye = (x, y, flip) => {
    const shape = sm([[x - 8, y + 1, 0.5], [x - 3, y - 3.2], [x + 4, y - 3.2], [x + 8, y - 0.5 * flip, 0.5], [x + 3, y + 2.6], [x - 3, y + 2.6]]);
    return P(shape, '#cdbdab') + c.inside(shape,
      `<circle cx="${x + flip * 0.6}" cy="${y - 0.2}" r="3.7" fill="${c.rgU([[0, '#b08a40'], [0.55, '#6a4818'], [1, '#22140a']], x, y, 3.7)}"/>` +
      `<circle cx="${x + flip * 0.6}" cy="${y - 0.2}" r="1.7" fill="#0a0503"/>` +
      blob(c, `M${x - 9} ${y - 5}L${x + 9} ${y - 5}L${x + 9} ${y - 1}L${x - 9} ${y - 1}Z`, '#1e0c06', 1.1, 0.75)) +
      `<circle cx="${x - 1.2}" cy="${y - 1.3}" r="1" fill="#fff8ee"/>` +
      S(sm([[x - 9, y + 0.8], [x - 3, y - 3.7], [x + 4, y - 3.7], [x + 9, y - 0.3]], false), '#160904', 1.7) +
      line(c, sm([[x - 6, y + 3.6], [x + 6, y + 3.4]], false), '#4a2414', 1, 0.6, 0.6);
  };
  head += eye(228, 85, 1) + eye(252, 85, -1);
  head += P(sm([[214, 77, 0], [224, 72.5], [236, 77.5], [236, 80.5, 0], [224, 77], [214, 80, 0]]), '#1e1008');
  head += P(sm([[244, 77.5, 0], [256, 72.5], [266, 76], [266, 79, 0], [256, 76.5], [244, 80.5, 0]]), '#160b06');
  head += blob(c, 'M236 78L244 78L242 86L238 86Z', '#4a2214', 1.5, 0.6);
  const kerchief = sm([[207, 100], [222, 96], [240, 90], [258, 96], [273, 100], [275, 116], [266, 132], [252, 146], [240, 164, 0], [228, 146], [214, 132], [205, 116]]);
  head += P(kerchief, c.lg([[0, '#e65e42'], [0.35, '#b2322a'], [0.75, '#741818'], [1, '#3a0a0a']], 0.2, 0, 0.8, 1), `filter="${c.vol({ ...cloth, k: 5, b: 4, so: 0.5, ho: 0.25, tex: 0.22 })}"`);
  head += c.inside(kerchief,
    line(c, sm([[240, 92], [236, 110], [228, 128]], false), '#4a0a0a', 3, 2, 0.6) +
    line(c, sm([[244, 96], [254, 116], [258, 132]], false), '#4a0a0a', 3, 2.5, 0.5) +
    line(c, sm([[214, 104], [222, 120], [232, 142]], false), '#ff8a66', 2.5, 2.5, 0.42) +
    line(c, sm([[207, 104], [240, 96], [273, 104]], false), '#ff9a76', 2, 1.5, 0.35) +
    line(c, sm([[212, 126], [240, 140], [268, 126]], false), '#3a0808', 3, 2.5, 0.5) +
    blob(c, 'M255 96L280 96L280 150L250 150Z', '#2a0606', 8, 0.45));
  // the hood's dagged mantle casts a soft shadow onto the jerkin
  const torsoAO = ao(c, jerkin, hood, 0, 9, 7, 0.65);

  // ----- arms
  const armSvg = (sh, el, wr, side) => {
    const upper = rib([[sh[0], sh[1], 48], [lerp(sh[0], el[0], 0.45), lerp(sh[1], el[1], 0.45), 45], [el[0], el[1], 36]]);
    const fore = rib([[el[0], el[1], 36], [lerp(el[0], wr[0], 0.35), lerp(el[1], wr[1], 0.35), 40], [wr[0], wr[1], 29]]);
    let s = P(upper, c.lg([[0, '#b8b2a6'], [0.45, '#77716a'], [1, '#2e2a27']], 0.1, 0, 0.9, 1), `filter="${c.vol(cloth)}"`);
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

// ---------------------------------------------------------------- registry
const SPECS = {
  brigand: { w: 480, h: 640, height: 1.8, draw: brigand, seed: 11 },
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
