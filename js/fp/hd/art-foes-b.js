// Obsidian Spire - modern hi-res illustrations, foes set B.
// Painted as SVG: layered gradients for volume, a warm key light from the
// upper left (#ffd9a0), a cool rim light from behind on the right (#9fc4ff),
// a thin umber outline on the outer silhouette only and a fine grain clipped
// to the figure. Every frame is a standalone SVG string; every id carries the
// `<key>-<frame>-` prefix. Bright, saturated glows feed the game's bloom.
//
// ART_FOES_B[key] = { w, h, height (metres), frames: { idle, attack } }

const OUT = '#1a1210';
const KEY = '#ffd9a0';
const RIM = '#9fc4ff';

// ------------------------------------------------------------------ numbers
const r1 = (n) => Math.round(n * 10) / 10;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ------------------------------------------------------------------ colours
function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb2hex(c) {
  return '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(A.map((v, i) => v + (B[i] - v) * t));
}

// ------------------------------------------------------------------ geometry
// Points are [x, y] or [x, y, 1] (1 = sharp corner).
function pathD(pts, closed = true, ten = 1) {
  const n = pts.length;
  if (n < 2) return '';
  const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)]);
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const s1 = p1[2] ? 0 : ten, s2 = p2[2] ? 0 : ten;
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * s1, c1y = p1[1] + ((p2[1] - p0[1]) / 6) * s1;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * s2, c2y = p2[1] - ((p3[1] - p1[1]) / 6) * s2;
    d += `C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}
const polyD = (pts, closed = true) => 'M' + pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L') + (closed ? 'Z' : '');

// Open Catmull-Rom curve through control points, densely sampled.
function crSample(ctrl, per = 16) {
  const out = [];
  const n = ctrl.length;
  if (n === 1) return [ctrl[0].slice(0, 2)];
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push([ctrl[n - 1][0], ctrl[n - 1][1]]);
  return out;
}
function resample(pts, N) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  const out = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = (tot * k) / (N - 1);
    while (j < L.length - 2 && L[j + 1] < s) j++;
    const seg = L[j + 1] - L[j] || 1;
    const t = clamp((s - L[j]) / seg, 0, 1);
    out.push([lerp(pts[j][0], pts[j + 1][0], t), lerp(pts[j][1], pts[j + 1][1], t)]);
  }
  return out;
}
function radAt(rad, t) {
  if (typeof rad === 'function') return rad(t);
  if (typeof rad === 'number') return rad;
  if (Array.isArray(rad[0])) {
    for (let i = 0; i < rad.length - 1; i++) {
      const [ta, ra] = rad[i], [tb, rb] = rad[i + 1];
      if (t <= tb) return lerp(ra, rb, clamp((t - ta) / (tb - ta || 1), 0, 1));
    }
    return rad[rad.length - 1][1];
  }
  const f = t * (rad.length - 1), i = Math.min(rad.length - 2, Math.floor(f));
  return lerp(rad[i], rad[i + 1], f - i);
}
// A tapered tube along a spine: limbs, necks, tails, horns, claws.
function tube(ctrl, rad, o = {}) {
  const N = o.n || 36;
  const sp = resample(crSample(ctrl, 18), N);
  const tan = sp.map((p, i) => {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(N - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  });
  const nor = tan.map(([x, y]) => [-y, x]);
  const rs = sp.map((_, i) => radAt(rad, i / (N - 1)));
  const Lp = sp.map((p, i) => [p[0] + nor[i][0] * rs[i], p[1] + nor[i][1] * rs[i]]);
  const Rp = sp.map((p, i) => [p[0] - nor[i][0] * rs[i], p[1] - nor[i][1] * rs[i]]);
  const pts = [];
  const endR = rs[N - 1], startR = rs[0];
  const endTip = endR < 0.6;
  for (let i = 0; i < N - (endTip ? 1 : 0); i++) pts.push(Lp[i]);
  if (endTip) pts.push([sp[N - 1][0], sp[N - 1][1], 1]);
  else if (o.end !== 'flat') pts.push([sp[N - 1][0] + tan[N - 1][0] * endR * 0.85, sp[N - 1][1] + tan[N - 1][1] * endR * 0.85]);
  for (let i = N - 1 - (endTip ? 1 : 0); i >= 0; i--) pts.push(Rp[i]);
  if (startR < 0.6) { pts.shift(); pts.pop(); pts.unshift([sp[0][0], sp[0][1], 1]); }
  else if (o.start !== 'flat') pts.push([sp[0][0] - tan[0][0] * startR * 0.85, sp[0][1] - tan[0][1] * startR * 0.85]);
  return { d: pathD(pts), pts, sp, tan, nor, rs, L: Lp, R: Rp };
}
// Point on a tube at parameter t, offset across it by u (-1..1, + = left side)
function tubeAt(tb, t, u = 0) {
  const N = tb.sp.length, f = clamp(t, 0, 1) * (N - 1), i = Math.min(N - 2, Math.floor(f)), k = f - i;
  const p = [lerp(tb.sp[i][0], tb.sp[i + 1][0], k), lerp(tb.sp[i][1], tb.sp[i + 1][1], k)];
  const n = [lerp(tb.nor[i][0], tb.nor[i + 1][0], k), lerp(tb.nor[i][1], tb.nor[i + 1][1], k)];
  const r = lerp(tb.rs[i], tb.rs[i + 1], k);
  const tg = [lerp(tb.tan[i][0], tb.tan[i + 1][0], k), lerp(tb.tan[i][1], tb.tan[i + 1][1], k)];
  return { x: p[0] + n[0] * r * u, y: p[1] + n[1] * r * u, n, t: tg, r };
}

const mapPts = (pts, f) => pts.map((p) => { const q = f(p[0], p[1]); return p[2] ? [q[0], q[1], p[2]] : q; });
function rotAbout(cx, cy, deg) {
  const a = deg * D2R, c = Math.cos(a), s = Math.sin(a);
  return (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}
const place = (tx, ty, sx = 1, sy = sx) => (x, y) => [tx + x * sx, ty + y * sy];
// half outline from the top centre down the left side to the bottom centre
function sym(half, cx = 0) {
  const m = half.slice(1, -1).map((p) => (p[2] ? [2 * cx - p[0], p[1], p[2]] : [2 * cx - p[0], p[1]])).reverse();
  return half.concat(m);
}
const flipX = (pts, cx = 0) => pts.map((p) => (p[2] ? [2 * cx - p[0], p[1], p[2]] : [2 * cx - p[0], p[1]]));
function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// ellipse as points
function ell(cx, cy, rx, ry, n = 16, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * Math.cos(rot * D2R) - y * Math.sin(rot * D2R), cy + x * Math.sin(rot * D2R) + y * Math.cos(rot * D2R)]);
  }
  return out;
}
// curved spike from a base point in direction (deg, 0 = up) with given length and base radius
function spikeTube(x, y, deg, len, r, bend = 0.12) {
  const a = deg * D2R, dx = Math.sin(a), dy = -Math.cos(a);
  const px = -dy, py = dx;
  return tube([[x, y], [x + dx * len * 0.5 + px * len * bend, y + dy * len * 0.5 + py * len * bend], [x + dx * len, y + dy * len]], [[0, r], [0.6, r * 0.5], [1, 0]], { n: 20 });
}

// ------------------------------------------------------------------ painter
function stopsStr(stops) {
  return stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
}

class Art {
  constructor(key, frame, W, H, seed = 1) {
    this.p = `${key}-${frame}-`;
    this.W = W; this.H = H; this.seed = seed;
    this.defs = []; this.n = 0; this.cache = new Map();
    this.under = []; this.fig = []; this.over = []; this.union = [];
    this.cur = this.fig;
  }
  id(t = 'i') { return `${this.p}${t}${this.n++}`; }
  def(s) { this.defs.push(s); }
  once(k, make) { if (!this.cache.has(k)) this.cache.set(k, make()); return this.cache.get(k); }
  add(s) { this.cur.push(s); return s; }
  layer(name) { this.cur = this[name]; }
  lin(stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1, user = false) {
    const id = this.id('lg');
    this.def(`<linearGradient id="${id}" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"${user ? ' gradientUnits="userSpaceOnUse"' : ''}>${stopsStr(stops)}</linearGradient>`);
    return `url(#${id})`;
  }
  rad(stops, cx = 0.4, cy = 0.35, r = 0.75, fx = cx, fy = cy, user = false) {
    const id = this.id('rg');
    this.def(`<radialGradient id="${id}" cx="${r1(cx * 1000) / 1000}" cy="${r1(cy * 1000) / 1000}" r="${r1(r * 1000) / 1000}" fx="${r1(fx * 1000) / 1000}" fy="${r1(fy * 1000) / 1000}"${user ? ' gradientUnits="userSpaceOnUse"' : ''}>${stopsStr(stops)}</radialGradient>`);
    return `url(#${id})`;
  }
  // a material's body gradient: lit from the upper left
  matFill(m, cx = 0.36, cy = 0.3, r = 0.85) {
    return this.once(`mf${m.mid}${m.hi}${cx}${cy}${r}`, () => this.rad([[0, m.hi], [0.38, m.mid], [0.78, m.lo], [1, m.deep]], cx, cy, r));
  }
  blur(sd) {
    return this.once(`b${sd}`, () => {
      const id = this.id('bl');
      this.def(`<filter id="${id}" filterUnits="userSpaceOnUse" x="-200" y="-200" width="${this.W + 400}" height="${this.H + 400}"><feGaussianBlur stdDeviation="${sd}"/></filter>`);
      return `url(#${id})`;
    });
  }
  clip(d) {
    const id = this.id('cp');
    this.def(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return `url(#${id})`;
  }
  // Volume filter: core shadow on the lower right, warm key edge on the upper
  // left, cool rim on the right, and a soft occlusion shadow cast below.
  vol(o = {}) {
    const q = Object.assign({ k: 8, sb: 5, sc: '#1a0a10', so: 0.55, hk: 4, hb: 2.5, ho: 0.3, rk: 2.5, ro: 0.4, ao: 0.4, aox: 3, aoy: 6, aob: 7, aoc: '#100608' }, o);
    const key = 'v' + JSON.stringify(q);
    return this.once(key, () => {
      const id = this.id('vf');
      const W = this.W, H = this.H;
      this.def(`<filter id="${id}" filterUnits="userSpaceOnUse" x="-100" y="-100" width="${W + 200}" height="${H + 200}" color-interpolation-filters="sRGB">` +
        (q.ao > 0 ? `<feOffset in="SourceAlpha" dx="${q.aox}" dy="${q.aoy}" result="a1"/><feGaussianBlur in="a1" stdDeviation="${q.aob}" result="a2"/><feFlood flood-color="${q.aoc}" flood-opacity="${q.ao}"/><feComposite in2="a2" operator="in" result="ao"/>` : '') +
        (q.so > 0 ? `<feOffset in="SourceAlpha" dx="${-q.k}" dy="${-q.k}" result="s1"/><feComposite in="SourceAlpha" in2="s1" operator="out" result="s2"/><feGaussianBlur in="s2" stdDeviation="${q.sb}" result="s3"/><feFlood flood-color="${q.sc}" flood-opacity="${q.so}"/><feComposite in2="s3" operator="in"/><feComposite in2="SourceAlpha" operator="in" result="shade"/>` : '') +
        (q.ho > 0 ? `<feOffset in="SourceAlpha" dx="${q.hk}" dy="${q.hk}" result="h1"/><feComposite in="SourceAlpha" in2="h1" operator="out" result="h2"/><feGaussianBlur in="h2" stdDeviation="${q.hb}" result="h3"/><feFlood flood-color="${KEY}" flood-opacity="${q.ho}"/><feComposite in2="h3" operator="in"/><feComposite in2="SourceAlpha" operator="in" result="key"/>` : '') +
        (q.ro > 0 ? `<feOffset in="SourceAlpha" dx="${-q.rk}" dy="${r1(q.rk * 0.5)}" result="r1"/><feComposite in="SourceAlpha" in2="r1" operator="out" result="r2"/><feGaussianBlur in="r2" stdDeviation="0.7" result="r3"/><feFlood flood-color="${RIM}" flood-opacity="${q.ro}"/><feComposite in2="r3" operator="in"/><feComposite in2="SourceAlpha" operator="in" result="rim"/>` : '') +
        `<feMerge>${q.ao > 0 ? '<feMergeNode in="ao"/>' : ''}<feMergeNode in="SourceGraphic"/>${q.so > 0 ? '<feMergeNode in="shade"/>' : ''}${q.ho > 0 ? '<feMergeNode in="key"/>' : ''}${q.ro > 0 ? '<feMergeNode in="rim"/>' : ''}</feMerge></filter>`);
      return `url(#${id})`;
    });
  }
  // A painted part: base fill, optional inner detail clipped to it, volume filter.
  part(d, fill, o = {}, inner) {
    const f = o.vol === false ? '' : ` filter="${this.vol(o.vol || {})}"`;
    let s = `<g${f}${o.op !== undefined ? ` opacity="${o.op}"` : ''}><path d="${d}" fill="${fill}"/>`;
    if (inner) {
      const c = this.clip(d);
      const body = typeof inner === 'function' ? inner(c) : inner;
      if (body) s += `<g clip-path="${c}">${body}</g>`;
    }
    s += '</g>';
    this.cur.push(s);
    if (o.union !== false && this.cur === this.fig) this.union.push(d);
    return s;
  }
  // Soft painted stroke (for form shading inside a clipped part)
  soft(d, color, width, op = 0.5, sd = 3, cap = 'round') {
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="round" opacity="${op}" filter="${this.blur(sd)}"/>`;
  }
  blob(d, color, op = 0.5, sd = 4) {
    return `<path d="${d}" fill="${color}" opacity="${op}"${sd ? ` filter="${this.blur(sd)}"` : ''}/>`;
  }
  // Procedural texture: fractal noise mapped to one colour, alpha from noise.
  tex(x, y, w, h, o = {}) {
    const q = Object.assign({ f: '0.05', oct: 3, seed: 3, type: 'fractalNoise', color: '#000000', a: 4, b: -2, op: 1 }, o);
    const id = this.once('t' + JSON.stringify(q), () => {
      const id = this.id('tx');
      const [cr, cg, cb] = hex2rgb(q.color).map((v) => r1((v / 255) * 1000) / 1000);
      const ach = q.ch === 'g' ? `0 ${q.a} 0 0 ${q.b}` : q.ch === 'b' ? `0 0 ${q.a} 0 ${q.b}` : `${q.a} 0 0 0 ${q.b}`;
      this.def(`<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="${q.type}" baseFrequency="${q.f}" numOctaves="${q.oct}" seed="${q.seed}"/><feColorMatrix type="matrix" values="0 0 0 0 ${cr} 0 0 0 0 ${cg} 0 0 0 0 ${cb} ${ach}"/></filter>`);
      return id;
    });
    return `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="#000" filter="url(#${id})"${q.op !== 1 ? ` opacity="${q.op}"` : ''}${q.tf ? ` transform="${q.tf}"` : ''}/>`;
  }
  pattern(w, h, body, tf = '') {
    const id = this.id('pt');
    this.def(`<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"${tf ? ` patternTransform="${tf}"` : ''}>${body}</pattern>`);
    return `url(#${id})`;
  }
  // Glow: blurred halo layers and a bright core
  glow(d, core, halo, sizes = [[14, 0.45], [5, 0.85]]) {
    return sizes.map(([sd, op]) => `<path d="${d}" fill="${halo}" opacity="${op}" filter="${this.blur(sd)}"/>`).join('') + (core ? `<path d="${d}" fill="${core}"/>` : '');
  }
  svg() {
    const W = this.W, H = this.H;
    const fid = this.id('fig'), uid = this.id('un');
    const s = (this.seed % 97) + 3;
    const figF = `<filter id="${fid}" filterUnits="userSpaceOnUse" x="-20" y="-20" width="${W + 40}" height="${H + 40}" color-interpolation-filters="sRGB">` +
      `<feComponentTransfer in="SourceAlpha" result="th"><feFuncA type="linear" slope="2.5" intercept="-0.5"/></feComponentTransfer>` +
      `<feMorphology in="th" operator="dilate" radius="2.4" result="dl"/><feFlood flood-color="${OUT}"/><feComposite in2="dl" operator="in" result="ol"/>` +
      `<feOffset in="SourceAlpha" dx="-5" dy="3" result="rs"/><feComposite in="SourceAlpha" in2="rs" operator="out" result="ra"/><feGaussianBlur in="ra" stdDeviation="0.9" result="rb"/><feFlood flood-color="${RIM}" flood-opacity="0.75"/><feComposite in2="rb" operator="in"/><feComposite in2="SourceAlpha" operator="in" result="rim"/>` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${s}" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.08 0 0 0 0 0.05 0 0 0 0 0.04 0.46 0 0 0 -0.18" result="gd"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 0.94 0 0 0 0 0.84 0 0.42 0 0 -0.18" result="gl"/>` +
      `<feMerge result="gm"><feMergeNode in="gd"/><feMergeNode in="gl"/></feMerge><feComposite in="gm" in2="SourceAlpha" operator="in" result="grain"/>` +
      `<feMerge><feMergeNode in="ol"/><feMergeNode in="SourceGraphic"/><feMergeNode in="rim"/><feMergeNode in="grain"/></feMerge></filter>`;
    const un = `<clipPath id="${uid}">${this.union.map((d) => `<path d="${d}"/>`).join('')}</clipPath>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${figF}${un}${this.defs.join('')}</defs>` +
      `<g>${this.under.join('')}</g><g filter="url(#${fid})"><g clip-path="url(#${uid})">${this.fig.join('')}</g></g><g>${this.over.join('')}</g></svg>`;
  }
}

// ------------------------------------------------------------------ shared effects
// Fish-scale texture (overlapping scale edges), as a pattern fill.
function scalePattern(art, s, dark, light, tf = '', opD = 0.5, opL = 0.3) {
  const w = s, h = s * 0.72;
  const arc = (cx, cy) => `M${r1(cx - w / 2)} ${r1(cy)}Q${r1(cx)} ${r1(cy + h * 1.15)} ${r1(cx + w / 2)} ${r1(cy)}`;
  const centres = [[0, 0], [w, 0], [w / 2, -h / 2], [w / 2, h / 2], [0, h], [w, h]];
  let body = '';
  for (const [cx, cy] of centres) {
    body += `<path d="${arc(cx, cy)}" fill="none" stroke="${dark}" stroke-width="${r1(s * 0.11)}" opacity="${opD}"/>`;
    body += `<path d="${arc(cx, cy - s * 0.12)}" fill="none" stroke="${light}" stroke-width="${r1(s * 0.06)}" opacity="${opL}"/>`;
  }
  return art.pattern(w, h, body, tf);
}

// Plates across a strip between two edge polylines (sampled alike).
function plateStrip(Lp, Rp, count, bow, gap = 0.12) {
  const N = Lp.length;
  const at = (arr, t) => { const f = clamp(t, 0, 1) * (N - 1), i = Math.min(N - 2, Math.floor(f)), k = f - i; return [lerp(arr[i][0], arr[i + 1][0], k), lerp(arr[i][1], arr[i + 1][1], k)]; };
  const plates = [];
  for (let i = 0; i < count; i++) {
    const t0 = i / count, t1 = (i + 1 - gap) / count;
    const a = at(Lp, t0), b = at(Rp, t0), c = at(Rp, t1), d = at(Lp, t1);
    const dir0 = [at(Lp, Math.min(1, t0 + 0.02))[0] - a[0], at(Lp, Math.min(1, t0 + 0.02))[1] - a[1]];
    const dl = Math.hypot(dir0[0], dir0[1]) || 1;
    const ux = dir0[0] / dl, uy = dir0[1] / dl;
    const w0 = Math.hypot(b[0] - a[0], b[1] - a[1]), w1 = Math.hypot(c[0] - d[0], c[1] - d[1]);
    const m0 = [(a[0] + b[0]) / 2 + ux * bow * w0, (a[1] + b[1]) / 2 + uy * bow * w0];
    const m1 = [(c[0] + d[0]) / 2 + ux * bow * w1, (c[1] + d[1]) / 2 + uy * bow * w1];
    plates.push({ pts: [[a[0], a[1], 1], m0, [b[0], b[1], 1], [c[0], c[1], 1], m1, [d[0], d[1], 1]], a, b, c, d, m0, m1 });
  }
  return plates;
}

// Flames: a filled tongue-edged cone with turbulent displacement.
function flameFilter(art, scale = 34, f = '0.012 0.028', seed = 5) {
  return art.once(`ff${scale}${f}${seed}`, () => {
    const id = art.id('fl');
    art.def(`<filter id="${id}" filterUnits="userSpaceOnUse" x="-100" y="-100" width="${art.W + 200}" height="${art.H + 200}" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="3" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="1.6"/></filter>`);
    return `url(#${id})`;
  });
}
// Generic flame tongue shape along a spine (base -> tip), wavy edges
function tongue(ctrl, w, seed, wav = 0.35) {
  const R = rng(seed);
  const ph = R() * 6;
  return tube(ctrl, (t) => w * Math.pow(1 - t, 0.75) * (1 + wav * Math.sin(t * 9 + ph) * t) * (t < 0.08 ? 0.6 + t * 5 : 1), { n: 28 });
}
function sparks(art, R, n, box, dir, colors, len = [3, 14]) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = box.x + R() * box.w, y = box.y + R() * box.h;
    const L = lerp(len[0], len[1], R());
    const a = (dir + (R() - 0.5) * 50) * D2R;
    const dx = Math.sin(a) * L, dy = -Math.cos(a) * L;
    const c = colors[Math.floor(R() * colors.length)];
    const w = lerp(1.6, 3.6, R());
    s += `<path d="M${r1(x)} ${r1(y)}l${r1(dx)} ${r1(dy)}" stroke="${c}" stroke-width="${r1(w * 2.6)}" stroke-linecap="round" opacity="0.5" filter="${art.blur(2.5)}"/>`;
    s += `<path d="M${r1(x)} ${r1(y)}l${r1(dx)} ${r1(dy)}" stroke="${c}" stroke-width="${r1(w)}" stroke-linecap="round"/>`;
  }
  return s;
}
function smokeFilter(art, seed = 9) {
  return art.once('smf' + seed, () => {
    const id = art.id('sm');
    art.def(`<filter id="${id}" filterUnits="userSpaceOnUse" x="-100" y="-100" width="${art.W + 200}" height="${art.H + 200}" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.024" numOctaves="3" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="34" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="3.2"/></filter>`);
    return `url(#${id})`;
  });
}

// outward-pointing spike angle (deg, clockwise from up) on one side of a tube
function edgeSpike(tb, t, side, len, r, tilt = 0, bend = 0.12, u = 0.9) {
  const p = tubeAt(tb, t, side * u);
  const vx = p.n[0] * side, vy = p.n[1] * side;
  const ang = Math.atan2(vx, -vy) / D2R + tilt;
  return spikeTube(p.x, p.y, ang, len, r, bend);
}

// Rolling smoke: overlapping puffs along a curling path, displaced and blurred.
function smokePlume(art, ctrl, ra, rb, op0, seed, cols = ['#3e3440', '#8e8090', '#cfc2cc']) {
  const R = rng(seed);
  const pts = resample(crSample(ctrl, 16), Math.max(8, ctrl.length * 4));
  let s = '';
  pts.forEach((p, i) => {
    const t = i / (pts.length - 1);
    const r = lerp(ra, rb, t) * (0.85 + R() * 0.3);
    const op = op0 * (1 - t * 0.75);
    s += `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${r1(r)}" fill="${cols[0]}" opacity="${r1(op * 100) / 100}"/>`;
    s += `<circle cx="${r1(p[0] - r * 0.22)}" cy="${r1(p[1] - r * 0.28)}" r="${r1(r * 0.66)}" fill="${cols[1]}" opacity="${r1(op * 70) / 100}"/>`;
    s += `<circle cx="${r1(p[0] - r * 0.34)}" cy="${r1(p[1] - r * 0.4)}" r="${r1(r * 0.32)}" fill="${cols[2]}" opacity="${r1(op * 55) / 100}"/>`;
  });
  return `<g filter="${smokeFilter(art, seed)}">${s}</g>`;
}

// A jet or column of fire from (x, y) along ang (deg clockwise from up).
function fireJet(art, o) {
  const q = Object.assign({ len: 400, ang: 180, w0: 30, w1: 200, seed: 1, strands: 18, disp: 48, halo: 0.5, coreEnd: 0.62 }, o);
  const R = rng(q.seed);
  const a = q.ang * D2R, dx = Math.sin(a), dy = -Math.cos(a), nx = -dy, ny = dx;
  const at = (t, u) => [q.x + dx * q.len * t + nx * u, q.y + dy * q.len * t + ny * u];
  const cone = (f, tEnd, jit, sd) => {
    const RR = rng(sd + q.seed * 7);
    const L = [], Rr = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * tEnd;
      const hw = lerp(q.w0, q.w1, Math.pow(t, 0.8)) * f;
      const j1 = (RR() - 0.5) * jit * t * 2 + Math.sin(t * 14 + sd) * jit * t;
      const j2 = (RR() - 0.5) * jit * t * 2 + Math.sin(t * 12 + sd * 2) * jit * t;
      L.push(at(t, -hw - j1));
      Rr.push(at(t, hw + j2));
    }
    return pathD([at(-0.035 * f, 0), ...Rr, ...L.reverse()]);
  };
  const g = (stops) => art.lin(stops, q.x, q.y, q.x + dx * q.len, q.y + dy * q.len, true);
  let s = '';
  if (q.halo) s += `<path d="${cone(1.3, 1, 20, 1)}" fill="#ff4a0a" opacity="${q.halo}" filter="${art.blur(26)}"/>`;
  let f = `<path d="${cone(1, 1, 70, 2)}" fill="${g([[0, '#ff8a1a'], [0.45, '#f0400c'], [1, '#9a0e06']])}" opacity="0.95"/>`;
  for (let i = 0; i < q.strands; i++) {
    const u0 = (R() - 0.5) * q.w0 * 1.4, u1 = (R() - 0.5) * q.w1 * 2.3;
    const t1 = 0.55 + R() * 0.5;
    const wob = (R() - 0.5) * q.w1 * 0.5;
    const ctrl = [at(0.02, u0), at(0.3 * t1, lerp(u0, u1, 0.3) + wob * 0.4), at(0.65 * t1, lerp(u0, u1, 0.65) - wob), at(t1, u1)];
    const tg = tongue(ctrl, lerp(10, 26, R()) * (q.w1 / 220), 40 + i);
    const c = ['#ff5a10', '#ff7a14', '#ffa424', '#ffc43a'][Math.floor(R() * 4)];
    f += `<path d="${tg.d}" fill="${c}" opacity="0.85"/>`;
  }
  for (let i = 0; i < (q.billows ?? 7); i++) {
    const t = 0.55 + R() * 0.45, hw = lerp(q.w0, q.w1, Math.pow(t, 0.8));
    const c = at(t, (R() - 0.5) * hw * 1.7), rr = hw * lerp(0.22, 0.4, R());
    f += `<circle cx="${r1(c[0])}" cy="${r1(c[1])}" r="${r1(rr)}" fill="${R() > 0.5 ? '#ff6a14' : '#f24a0e'}" opacity="0.9"/><circle cx="${r1(c[0] - rr * 0.2)}" cy="${r1(c[1] - rr * 0.25)}" r="${r1(rr * 0.6)}" fill="#ffa22a" opacity="0.8"/>`;
  }
  f += `<path d="${cone(0.68, 0.95, 44, 3)}" fill="${g([[0, '#ffe070'], [0.4, '#ffaa22'], [1, '#ff6a10', 0.6]])}"/>`;
  f += `<path d="${cone(0.42, 0.85, 28, 4)}" fill="${g([[0, '#fffbe6'], [0.35, '#ffe468'], [1, '#ffb420', 0]])}"/>`;
  s += `<g filter="${flameFilter(art, q.disp, '0.011 0.026', q.seed + 3)}">${f}</g>`;
  s += `<path d="${cone(0.2, q.coreEnd, 8, 5)}" fill="${g([[0, '#ffffff'], [0.5, '#fffdf2'], [1, '#fff4c0', 0]])}" filter="${art.blur(4)}"/>`;
  return s;
}

// Darkening toward the lower right and the ground, inside the figure.
function figShade(art, op = 0.4, col = '#12040a', ground = 0.3) {
  const W = art.W, H = art.H;
  art.add(`<rect x="0" y="0" width="${W}" height="${H}" fill="${art.lin([[0, col, 0], [0.55, col, op * 0.35], [1, col, op]], 0, 0, W, H, true)}"/>`);
  if (ground) art.add(`<rect x="0" y="${H * 0.6}" width="${W}" height="${H * 0.4}" fill="${art.lin([[0, col, 0], [1, col, ground]], 0, H * 0.6, 0, H, true)}"/>`);
}

// ================================================================== DRAGON
// The Crown Dragon, final boss. 1024 x 768.
const DR = {
  sc: { hi: '#f87458', mid: '#b21a26', lo: '#5c0816', deep: '#2a030b' },
  gold: { hi: '#ffe8a4', mid: '#d89c40', lo: '#94561a', deep: '#441c06' },
  bone: { hi: '#fffaf0', mid: '#e8dac2', lo: '#a48e72', deep: '#4c3c30' },
  strut: { hi: '#8c6a70', mid: '#3e2229', lo: '#24121a', deep: '#14090e' },
};

function dragonFrame(frame) {
  const atk = frame === 'attack';
  const art = new Art('dragon', frame, 1024, 768, atk ? 11 : 7);
  const S = DR.sc, G = DR.gold, B = DR.bone, T = DR.strut;

  const scaleVol = { k: 14, sb: 9, sc: '#22020a', so: 0.66, hk: 6, hb: 4, ho: 0.3, rk: 3, ro: 0.45, ao: 0.55, aox: 4, aoy: 8, aob: 9, aoc: '#0e0206' };
  const smallVol = { k: 6, sb: 3.5, sc: '#22020a', so: 0.62, hk: 3, hb: 1.6, ho: 0.3, rk: 2, ro: 0.45, ao: 0.5, aox: 2, aoy: 4, aob: 4, aoc: '#0e0206' };
  const boneVol = { k: 5, sb: 3, sc: '#3a2418', so: 0.6, hk: 3, hb: 1.5, ho: 0.45, rk: 2, ro: 0.55, ao: 0.45, aox: 2, aoy: 4, aob: 4, aoc: '#120806' };
  const plateVol = { k: 7, sb: 4, sc: '#3a1404', so: 0.55, hk: 4, hb: 2, ho: 0.42, rk: 2, ro: 0.4, ao: 0.6, aox: 2, aoy: 6, aob: 5, aoc: '#1a0404' };
  const scaleFill = art.matFill(S);
  const boneFill = art.lin([[0, B.hi], [0.45, B.mid], [1, B.lo]], 0, 0, 1, 1);
  const clawFill = art.lin([[0, '#5a463a'], [0.4, '#cdbca2'], [1, '#fffaf0']], 0, 0, 1, 1);
  const hornFill = art.lin([[0, '#4a382c'], [0.3, '#9a8470'], [0.7, '#e6dbc4'], [1, '#fffaf0']], 0, 1, 0, 0);
  const plateFill = art.lin([[0, G.hi], [0.28, G.mid], [0.8, G.lo], [1, G.deep]], 0, 0, 0.2, 1);
  const scalesBig = scalePattern(art, 24, '#2e0410', '#ff8a6c', 'rotate(-4)', 0.45, 0.2);
  const scalesMid = scalePattern(art, 17, '#2e0410', '#ff8a6c', 'rotate(6)', 0.45, 0.2);
  const scalesSm = scalePattern(art, 11, '#2e0410', '#ff9a7c', '', 0.4, 0.18);
  const mottle = (x, y, w, h, seed) => art.tex(x, y, w, h, { f: '0.035', oct: 3, seed, color: '#2a0208', a: 2.2, b: -1.05 });
  const sampleOff = (tb, u, t0, t1, n) => { const out = []; for (let i = 0; i <= n; i++) { const p = tubeAt(tb, lerp(t0, t1, i / n), u); out.push([p.x, p.y]); } return out; };

  // ---------------------------------------------------------------- wings
  function wing(side) {
    const fx = (p) => (side < 0 ? p : [1024 - p[0], p[1], p[2]]);
    const Sh = [436, 304];
    const El = atk ? [322, 136] : [326, 192];
    const Wr = atk ? [214, 34] : [206, 84];
    const tips = atk ? [[84, 6], [12, 116], [8, 292], [90, 450]] : [[30, 32], [6, 206], [28, 384], [136, 524]];
    const hip = [410, 566];
    const pull = (a, b, k) => [lerp((a[0] + b[0]) / 2, Wr[0], k), lerp((a[1] + b[1]) / 2, Wr[1], k)];
    const sc = [0.27, 0.25, 0.22];
    const outline = [Sh, El, Wr, [...tips[0], 1]];
    for (let i = 0; i < 3; i++) { outline.push(pull(tips[i], tips[i + 1], sc[i])); outline.push([...tips[i + 1], 1]); }
    const hipPull = [lerp((tips[3][0] + hip[0]) / 2, Sh[0] - 40, 0.34), lerp((tips[3][1] + hip[1]) / 2, Sh[1], 0.34)];
    outline.push(hipPull, [...hip, 1], [Sh[0] + 30, Sh[1] + 120]);
    const memD = pathD(outline.map(fx));
    const W0 = fx(Wr);
    const memFill = art.rad([[0, '#2a0410'], [0.3, '#4a0a1c'], [0.62, '#5a1440'], [0.85, '#663090'], [1, '#7a44b0']], W0[0], W0[1], 600, W0[0], W0[1], true);
    art.part(memD, memFill, { vol: { k: 0, so: 0, hk: 8, hb: 6, ho: 0.16, rk: 3, ro: 0.55, ao: 0.4, aox: 4, aoy: 8, aob: 10 } }, () => {
      let s = '';
      const panels = [[Wr, tips[0], tips[1]], [Wr, tips[1], tips[2]], [Wr, tips[2], tips[3]], [Wr, tips[3], hip, Sh]];
      const tints = ['#7a3ab8', '#6a1232', '#7434a8', '#5a0e28'];
      panels.forEach((pp, i) => {
        const g = art.rad([[0, tints[i], 0], [0.5, tints[i], 0.3], [1, mix(tints[i], '#c690ff', 0.3), 0.7]], W0[0], W0[1], 580, W0[0], W0[1], true);
        s += `<path d="${polyD(pp.map(fx))}" fill="${g}"/>`;
      });
      // membrane sag ripples following each scallop
      for (let i = 0; i < 4; i++) {
        const a = tips[i], b = i < 3 ? tips[i + 1] : hip;
        const m = i < 3 ? pull(a, b, sc[i]) : hipPull;
        for (const [k, col, op, w] of [[0.18, '#e0b0ff', 0.32, 7], [0.32, '#14020c', 0.4, 18], [0.55, '#b070e0', 0.16, 10], [0.7, '#14020c', 0.3, 16]]) {
          const pts = [a, m, b].map((p) => [lerp(p[0], Wr[0], k), lerp(p[1], Wr[1], k)]);
          s += art.soft(pathD(pts.map(fx), false), col, w, op, w * 0.45);
        }
        const d = pathD([a, m, b].map(fx), false);
        s += art.soft(d, '#c890ff', 24, 0.4, 8);
        s += art.soft(d, '#ecc8ff', 5, 0.45, 2);
      }
      // veins
      const VR = rng(side < 0 ? 3 : 4);
      for (let i = 0; i < 4; i++) {
        const a = tips[i], b = i < 3 ? tips[i + 1] : hip;
        for (let k = 1; k <= 3; k++) {
          const t = k / 4;
          const p0 = [lerp(Wr[0], a[0], 0.2 + t * 0.55), lerp(Wr[1], a[1], 0.2 + t * 0.55)];
          const p2 = [lerp(Wr[0], b[0], 0.28 + t * 0.55), lerp(Wr[1], b[1], 0.28 + t * 0.55)];
          const p1 = [lerp(p0[0], p2[0], 0.5) + (VR() - 0.5) * 24, lerp(p0[1], p2[1], 0.5) + (VR() - 0.5) * 24];
          s += `<path d="${pathD([p0, p1, p2].map(fx), false)}" fill="none" stroke="#1e0410" stroke-width="2" opacity="0.4"/>`;
        }
      }
      // shadow cast by the arm and body
      s += art.soft(pathD([Sh, El, Wr].map((p) => fx([p[0] + 10, p[1] + 34])), false), '#0e0108', 60, 0.55, 18);
      s += art.blob(pathD([[Sh[0] + 10, Sh[1] - 20], [Sh[0] - 70, Sh[1] + 40], [hip[0] - 50, hip[1] - 30], [hip[0] + 30, hip[1]]].map(fx)), '#0e0108', 0.6, 22);
      return s;
    });
    // finger struts with a knuckle
    tips.forEach((tp, i) => {
      const mid = [lerp(Wr[0], tp[0], 0.45), lerp(Wr[1], tp[1], 0.45) - 5];
      const st = tube([Wr, mid, tp].map(fx), [[0, 12], [0.4, 7], [0.46, 9], [0.52, 6.5], [1, 1.4]], { n: 36 });
      art.part(st.d, art.lin([[0, T.hi], [0.5, T.mid], [1, T.lo]], 0, 0, 1, 1), { vol: { k: 4, sb: 2, sc: '#08030a', so: 0.6, hk: 2.5, hb: 1.2, ho: 0.5, rk: 1.8, ro: 0.6, ao: 0.5, aox: 2, aoy: 5, aob: 5 } });
      if (i === 0) {
        const c = fx(tp);
        art.part(spikeTube(c[0] + side * 4, c[1] + 8, side < 0 ? -38 : 38, 26, 6, -0.25 * side).d, clawFill, { vol: boneVol });
      }
    });
    // wing arm
    const arm = tube([Sh, [lerp(Sh[0], El[0], 0.5) - 8, lerp(Sh[1], El[1], 0.5) - 4], El, [lerp(El[0], Wr[0], 0.5), lerp(El[1], Wr[1], 0.5) - 6], Wr].map(fx), [[0, 34], [0.4, 20], [0.48, 24], [0.56, 19], [1, 14]], { n: 44 });
    art.part(arm.d, scaleFill, { vol: scaleVol }, () => `<rect x="0" y="0" width="1024" height="768" fill="${scalesMid}"/>` +
      art.soft(pathD(sampleOff(arm, side < 0 ? 0.5 : -0.5, 0.05, 0.95, 10), false), '#ff9a7c', 9, 0.32, 4));
    // thumb claw and leading-edge spikes
    art.part(spikeTube(W0[0] + side * 2, W0[1] - 8, side < 0 ? -14 : 14, 46, 10, side < 0 ? 0.2 : -0.2).d, clawFill, { vol: boneVol });
    for (let k = 1; k <= 4; k++) {
      art.part(edgeSpike(arm, 0.1 + k * 0.17, side < 0 ? 1 : -1, 24 - k * 2, 6.5, side * -28, 0.15 * -side).d, boneFill, { vol: boneVol });
    }
  }
  wing(1);
  wing(-1);

  // ---------------------------------------------------------------- tail
  const tail = tube([[600, 700], [690, 740], [790, 742], [872, 702], [906, 634], [876, 584], [828, 586], [810, 628], [834, 660], [868, 654], [876, 630]], [[0, 46], [0.35, 34], [0.7, 17], [0.92, 8], [1, 1]], { n: 80 });
  for (let k = 0; k < 10; k++) {
    art.part(edgeSpike(tail, 0.16 + k * 0.075, -1, 30 - k * 1.8, 8.5 - k * 0.5, -24, 0.1).d, boneFill, { vol: boneVol });
  }
  art.part(tail.d, scaleFill, { vol: scaleVol }, () => {
    let s = `<rect x="560" y="560" width="400" height="220" fill="${scalesMid}"/>` + mottle(560, 560, 400, 220, 4);
    const inner = sampleOff(tail, 0.96, 0, 0.97, 60), outer = sampleOff(tail, 0.42, 0, 0.97, 60);
    for (const pl of plateStrip(inner, outer, 18, 0.25, 0.2)) s += `<path d="${pathD(pl.pts)}" fill="${art.matFill(G, 0.4, 0.2, 0.9)}" opacity="0.9"/>`;
    s += art.soft(pathD(sampleOff(tail, -0.45, 0, 0.95, 18), false), '#ff9070', 10, 0.25, 5);
    return s;
  });

  // ---------------------------------------------------------------- torso
  const torsoD = pathD(sym([[512, 288], [452, 292], [406, 312], [376, 356], [364, 420], [374, 490], [394, 556], [408, 616], [444, 672], [512, 700]], 512));
  art.part(torsoD, art.matFill(S, 0.32, 0.26, 0.92), { vol: { ...scaleVol, k: 34, sb: 24, so: 0.7, hk: 10, hb: 8 } }, () => {
    let s = `<rect x="340" y="270" width="350" height="450" fill="${scalesBig}"/>` + mottle(340, 270, 350, 450, 9);
    // ribs and flank muscles
    for (let i = 0; i < 4; i++) {
      s += art.soft(pathD([[372, 430 + i * 34], [410, 446 + i * 34], [446, 470 + i * 30]], false), '#2a020a', 9, 0.45, 5);
      s += art.soft(pathD([[372, 422 + i * 34], [410, 438 + i * 34], [446, 462 + i * 30]], false), '#ff7a5c', 5, 0.18, 3);
      s += art.soft(pathD([[652, 430 + i * 34], [614, 446 + i * 34], [578, 470 + i * 30]], false), '#1a0208', 10, 0.55, 5);
    }
    s += art.blob(pathD(ell(430, 370, 64, 44, 14, -20)), '#ff7a5c', 0.22, 18);
    return s;
  });

  // ---------------------------------------------------------------- hind legs
  function hindLeg(side) {
    const fx = (pts) => (side < 0 ? pts : flipX(pts, 512).reverse());
    const fp = (p) => (side < 0 ? p : [1024 - p[0], p[1]]);
    // shin
    const shin = tube([fp([336, 660]), fp([332, 700]), fp([356, 734])], [[0, 32], [0.55, 21], [1, 23]], { n: 18 });
    art.part(shin.d, scaleFill, { vol: { ...scaleVol, k: 10, sb: 6 } }, () => `<rect x="0" y="600" width="1024" height="168" fill="${scalesSm}"/>` +
      art.soft(pathD([fp([322, 668]), fp([320, 704]), fp([336, 730])], false), '#ff8a68', 8, 0.3, 4));
    // spur at the back of the ankle
    const sp0 = fp([334, 722]);
    art.part(spikeTube(sp0[0], sp0[1], side * -112, 22, 6, 0.2 * side).d, clawFill, { vol: boneVol });
    // foot, toes splayed forward, talons biting the ground
    const foot = pathD(fx([[326, 722], [368, 714], [402, 726], [420, 750], [410, 768, 1], [304, 768, 1], [304, 744]]));
    art.part(foot, art.matFill(S, 0.35, 0.2, 0.9), { vol: smallVol }, () => `<rect x="0" y="690" width="1024" height="80" fill="${scalesSm}"/>`);
    for (const a of [-58, -24, 10, 42]) {
      const ar = a * D2R;
      const base = fp([362 + Math.sin(ar) * 16, 744]);
      const end = fp([362 + Math.sin(ar) * 52, 758 + Math.cos(ar) * 2]);
      art.part(tube([base, end], [[0, 13], [1, 10]], { n: 10 }).d, scaleFill, { vol: smallVol }, () => art.soft(pathD([base, end], false), '#2a020a', 4, 0.4, 2));
      const tip = fp([362 + Math.sin(ar) * 62, 772]);
      const mid = [lerp(end[0], tip[0], 0.5) + (end[0] < tip[0] ? 0 : 0), lerp(end[1], tip[1], 0.5) - 3];
      art.part(tube([end, mid, tip], [[0, 9.5], [1, 0.6]], { n: 14 }).d, clawFill, { vol: boneVol });
    }
    // thigh
    const thigh = pathD(fx([[476, 556], [440, 534], [394, 538], [352, 566], [322, 608], [312, 650], [326, 678], [358, 684], [402, 664], [446, 630], [478, 596]]));
    art.part(thigh, art.matFill(S, 0.3, 0.25, 0.92), { vol: { ...scaleVol, k: 24, sb: 16, so: 0.72 } }, () => {
      let s = `<rect x="0" y="520" width="1024" height="200" fill="${scalesBig}"/>` + mottle(280, 520, 470, 200, side < 0 ? 12 : 13);
      s += art.soft(pathD(fx([[340, 604], [384, 566], [440, 556]]), false), '#ff8a68', 22, 0.28, 11);
      s += art.soft(pathD(fx([[332, 670], [396, 660], [456, 620]]), false), '#140208', 24, 0.55, 10);
      s += art.soft(pathD(fx([[346, 640], [380, 612], [420, 600]]), false), '#140208', 8, 0.35, 5);
      return s;
    });
    const k = fp([324, 626]);
    art.part(spikeTube(k[0], k[1], side * -66, 36, 9, 0.15 * side).d, boneFill, { vol: boneVol });
  }
  hindLeg(-1);
  hindLeg(1);

  // ---------------------------------------------------------------- belly plates
  const bellyC = crSample([[504, 392], [508, 470], [512, 560], [512, 640], [512, 706]], 12);
  const bw = [46, 60, 64, 52, 30];
  const bellyL = [], bellyR = [];
  bellyC.forEach((p, i) => { const w = radAt(bw, i / (bellyC.length - 1)); bellyL.push([p[0] - w, p[1]]); bellyR.push([p[0] + w, p[1]]); });
  const bellySide = art.lin([[0, '#fff0c0', 0.22], [0.35, '#3a1404', 0], [1, '#2a0e04', 0.45]], 440, 0, 590, 0, true);
  for (const pl of plateStrip(bellyL, bellyR, 11, 0.2, 0.1)) {
    art.part(pathD(pl.pts), plateFill, { vol: plateVol }, () => `<rect x="420" y="380" width="200" height="340" fill="${bellySide}"/>` + art.soft(pathD([pl.a, pl.m0, pl.b], false), '#fff3c8', 4, 0.55, 1.6) +
      art.soft(pathD([pl.d, pl.m1, pl.c], false), '#3a1204', 6, 0.5, 2.5));
  }

  // ---------------------------------------------------------------- neck
  const neck = tube([[478, 440], [420, 372], [374, 290], [358, 200], [374, 122], [422, 72], [488, 62], [540, 96], [556, 152]], [[0, 62], [0.25, 47], [0.6, 39], [1, 35]], { n: 72 });
  for (let k = 0; k < 11; k++) art.part(edgeSpike(neck, 0.16 + k * 0.07, -1, 30 - k * 0.9, 8.5, -18, 0.18).d, boneFill, { vol: boneVol });
  art.part(neck.d, scaleFill, { vol: { ...scaleVol, k: 16, sb: 10 } }, () => {
    let s = `<rect x="320" y="40" width="300" height="460" fill="${scalesMid}"/>` + mottle(320, 40, 300, 460, 21);
    const inner = sampleOff(neck, 0.98, 0, 0.86, 50), outer = sampleOff(neck, 0.05, 0, 0.86, 50);
    for (const pl of plateStrip(inner, outer, 15, -0.16, 0.14)) s += `<g filter="${art.vol(plateVol)}"><path d="${pathD(pl.pts)}" fill="${plateFill}"/></g>`;
    s += art.soft(pathD(sampleOff(neck, -0.7, 0.05, 0.8, 14), false), '#ff9a7a', 14, 0.28, 7);
    return s;
  });

  // ---------------------------------------------------------------- forelegs
  function foreleg(side) {
    const fp = (p) => (side < 0 ? p : [1024 - p[0], p[1]]);
    const sh = [410, 352];
    const el = atk ? [316, 414] : [350, 454];
    const wr = atk ? [274, 334] : [402, 526];
    const upper = tube([sh, [lerp(sh[0], el[0], 0.45) - 8, lerp(sh[1], el[1], 0.45) + 2], el].map(fp), [[0, 42], [0.35, 40], [1, 28]], { n: 26 });
    const fore = tube([el, [lerp(el[0], wr[0], 0.5) + (atk ? -10 : 4), lerp(el[1], wr[1], 0.5) + 8], wr].map(fp), [[0, 30], [0.3, 30], [1, 19]], { n: 26 });
    art.part(upper.d, scaleFill, { vol: { ...scaleVol, k: 14, sb: 9 } }, () => `<rect x="0" y="0" width="1024" height="768" fill="${scalesMid}"/>` +
      art.soft(pathD(sampleOff(upper, side < 0 ? 0.45 : -0.45, 0.1, 0.8, 8), false), '#ff9070', 12, 0.3, 6));
    const e = fp(el);
    art.part(spikeTube(e[0] - side * 18, e[1] + 10, atk ? side * -150 : side * -120, 30, 8, 0.15 * side).d, boneFill, { vol: boneVol });
    art.part(fore.d, scaleFill, { vol: { ...scaleVol, k: 11, sb: 7 } }, () => `<rect x="0" y="0" width="1024" height="768" fill="${scalesSm}"/>`);
    const w = fp(wr);
    const hc = [w[0], w[1] + (atk ? -8 : 10)];
    art.part(pathD(ell(hc[0], hc[1], 29, 23, 12)), scaleFill, { vol: smallVol }, () => `<rect x="0" y="0" width="1024" height="768" fill="${scalesSm}"/>`);
    const dirs = atk ? [-86, -56, -26, 4] : [146, 166, 186, 206];
    dirs.forEach((dg) => {
      const a = (side < 0 ? dg : -dg) * D2R;
      const sx = Math.sin(a), sy = -Math.cos(a);
      const b0 = [hc[0] + sx * 16, hc[1] + sy * 14];
      const k1 = [b0[0] + sx * 24, b0[1] + sy * 24];
      art.part(tube([b0, [lerp(b0[0], k1[0], 0.5), lerp(b0[1], k1[1], 0.5)], k1], [[0, 11], [0.5, 10], [0.6, 11.5], [1, 9]], { n: 12 }).d, scaleFill, { vol: smallVol });
      const curl = (side < 0 ? 1 : -1) * (atk ? -0.55 : 0.5);
      const a2 = a + curl;
      const tip = [k1[0] + Math.sin(a2) * 38, k1[1] - Math.cos(a2) * 38];
      const mid = [lerp(k1[0], tip[0], 0.5) + Math.cos(a) * 4 * Math.sign(curl), lerp(k1[1], tip[1], 0.5) + Math.sin(a) * 4 * Math.sign(curl)];
      art.part(tube([k1, mid, tip], [[0, 8.5], [1, 0.3]], { n: 14 }).d, clawFill, { vol: boneVol });
    });
  }
  foreleg(-1);
  foreleg(1);

  // ---------------------------------------------------------------- head
  const hs = atk ? 1.16 : 1.12;
  const HX = 546, HY = atk ? 226 : 250;
  const fsh = atk ? 0.74 : 1; // the snout foreshortens as the head tilts up to breathe fire
  const H = (pts) => mapPts(pts, (x, y) => [HX + x * hs, HY + (y > 0 ? y * fsh : y) * hs]);
  const HD = (pts) => pathD(H(pts));
  const HJ = (pts) => mapPts(pts, place(HX, HY, hs));
  const HJD = (pts) => pathD(HJ(pts));
  const both = (half) => [half, flipX(half).reverse()];

  // horns
  for (const sx of [-1, 1]) {
    const c = [[-62, -40], [-110, -58], [-150, -86], [-170, -124], [-162, -162]].map(([x, y]) => [sx < 0 ? x : -x, y]);
    const hn = tube(H(c), [[0, 23 * hs], [0.5, 14 * hs], [1, 0]], { n: 44 });
    art.part(hn.d, hornFill, { vol: { ...boneVol, k: 8, sb: 5, ho: 0.4 } }, () => {
      let s = '';
      for (let i = 2; i < hn.L.length - 5; i += 3) {
        s += `<path d="M${r1(hn.L[i][0])} ${r1(hn.L[i][1])}Q${r1(hn.sp[i][0] + hn.tan[i][0] * 6)} ${r1(hn.sp[i][1] + hn.tan[i][1] * 6)} ${r1(hn.R[i][0])} ${r1(hn.R[i][1])}" fill="none" stroke="#2e2018" stroke-width="2.2" opacity="0.42"/>`;
      }
      return s;
    });
  }
  // cheek frills
  for (const sx of [-1, 1]) {
    const m = (pts) => (sx < 0 ? pts : flipX(pts));
    const tips = [[-152, -8], [-154, 30], [-130, 66]];
    const base = [[-88, -16], [-96, 16], [-86, 44]];
    const memb = [[-84, -24], [...tips[0], 1], [-124, 10], [...tips[1], 1], [-114, 46], [...tips[2], 1], [-74, 62]];
    art.part(HD(m(memb)), art.lin([[0, '#4a0818'], [1, '#6a2a80']], sx < 0 ? 1 : 0, 0, sx < 0 ? 0 : 1, 0), { vol: { k: 5, sb: 3, sc: '#12020a', so: 0.5, hk: 3, hb: 2, ho: 0.18, rk: 2, ro: 0.55, ao: 0.45, aox: 2, aoy: 4, aob: 5 } }, () =>
      tips.map((tp, i) => art.soft(HD(m([base[i], [lerp(base[i][0], tp[0], 0.6), lerp(base[i][1], tp[1], 0.6) + 8]])), '#c070e0', 10, 0.3, 4)).join(''));
    tips.forEach((tp, i) => {
      const f = tube(H(m([base[i], [lerp(base[i][0], tp[0], 0.5), lerp(base[i][1], tp[1], 0.5) - 4], tp])), [[0, 7.5 * hs], [1, 0.4]], { n: 16 });
      art.part(f.d, boneFill, { vol: boneVol });
    });
  }
  // lower jaw
  const jawHalf = atk ? [[0, 100], [-86, 36], [-98, 112], [-84, 184], [-54, 236], [0, 254]] : [[0, 90], [-80, 38], [-78, 88], [-60, 132], [-38, 160], [0, 170]];
  art.part(HJD(sym(jawHalf)), art.matFill(S, 0.4, 0.2, 0.9), { vol: smallVol }, () => {
    let s = `<rect x="300" y="200" width="460" height="300" fill="${scalesSm}"/>`;
    const y0 = atk ? 214 : 140, y1 = atk ? 250 : 168;
    for (let i = 0; i < 3; i++) {
      const ya = lerp(y0, y1, i / 3), yb = lerp(y0, y1, (i + 0.78) / 3), wv = 28 - i * 6;
      s += `<path d="${HJD([[-wv, ya, 1], [0, ya + 5], [wv, ya, 1], [wv - 4, yb, 1], [0, yb + 5], [-wv + 4, yb, 1]])}" fill="${plateFill}" opacity="0.85"/>`;
    }
    // shadow cast by the snout onto the jaw
    s += atk ? '' : art.blob(HJD(sym([[0, 80], [-70, 40], [-62, 110], [-30, 150], [0, 156]])), '#14020a', 0.6, 10);
    return s;
  });
  for (const sx of [-1, 1]) {
    const base = atk ? [[-90, 172], [-70, 216]] : [[-70, 112], [-54, 140]];
    base.forEach(([x, y], i) => {
      const p = HJ([[sx < 0 ? x : -x, y]])[0];
      art.part(spikeTube(p[0], p[1] - 4, sx * (128 + i * 14), (24 - i * 4) * hs, 6.5, 0.1 * sx).d, boneFill, { vol: boneVol });
    });
  }
  if (atk) {
    // gaping mouth: gullet glowing from the throat, rows of fangs
    art.part(HJD(sym([[0, 56], [-74, 30], [-84, 104], [-70, 168], [-42, 214], [0, 228]])), art.rad([[0, '#fff8d0'], [0.22, '#ffc232'], [0.5, '#e8460e'], [0.8, '#5a0810'], [1, '#2a0208']], 0.5, 0.64, 0.66), { vol: false }, () =>
      art.soft(HJD([[-70, 60], [-66, 120], [-44, 180]]), '#ff8a5a', 12, 0.45, 5) + art.soft(HJD([[70, 60], [66, 120], [44, 180]]), '#ff8a5a', 12, 0.45, 5) +
      art.blob(HJD(sym([[0, 168], [-34, 178], [-28, 214], [0, 222]])), '#8a0a14', 0.75, 5) + art.soft(HJD([[-28, 196], [0, 186], [28, 196]]), '#ff6a4a', 5, 0.5, 2));
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const x = lerp(-82, -30, t), y = lerp(160, 224, Math.pow(t, 0.8));
        const p = HJ([[sx < 0 ? x : -x, y]])[0];
        const L = (i === 3 ? 32 : 18) * hs;
        art.part(tube([[p[0], p[1] + 6], [p[0] + sx * 1.5, p[1] - L * 0.5], [p[0] + sx * 3, p[1] - L]], [[0, i === 3 ? 7.5 : 5], [1, 0.3]], { n: 10 }).d, boneFill, { vol: { ...boneVol, ao: 0.3 } });
      }
    }
  }
  // the head: a wedge narrowing to the snout, lowered toward the viewer
  const headHalf = [[0, -72], [-34, -70], [-62, -58], [-82, -40], [-92, -16], [-106, 8, 1], [-92, 26], [-74, 44], [-60, 66], [-50, 92], [-42, 116], [-32, 132], [-16, 142], [0, 145]];
  art.part(HD(sym(headHalf)), art.matFill(S, 0.38, 0.24, 0.9), { vol: { ...scaleVol, k: 16, sb: 10 } }, () => {
    let s = `<rect x="370" y="120" width="300" height="320" fill="${scalesSm}"/>` + mottle(370, 120, 300, 320, 31);
    // nasal ridge: lit top plane, shaded right flank, darker cheeks
    s += art.blob(HD(sym([[0, -16], [-20, -6], [-24, 50], [-26, 108], [-18, 134], [0, 140]])), '#ff8062', 0.34, 5);
    s += art.blob(HD([[14, 0], [30, 50], [34, 108], [24, 136], [10, 132], [8, 50]]), '#1e0208', 0.45, 6);
    s += art.blob(HD([[-36, 30], [-90, 26], [-74, 64], [-52, 110], [-34, 104]]), '#1e0208', 0.28, 10);
    s += art.blob(HD([[36, 26], [96, 20], [82, 64], [54, 116], [36, 104]]), '#1e0208', 0.58, 10);
    s += art.soft(HD([[-4, -10], [-6, 60], [-8, 120]]), '#ffb090', 4, 0.35, 2);
    // cheekbones
    for (const sx of [-1, 1]) s += art.soft(HD([[sx * 40, 20], [sx * 72, 14], [sx * 100, 8]]), sx < 0 ? '#ff9070' : '#ff7050', 8, sx < 0 ? 0.3 : 0.15, 4);
    // forehead plate & frown furrows
    s += art.blob(HD(sym([[0, -66], [-30, -62], [-36, -36], [-14, -18], [0, -14]])), '#ff8a6a', 0.22, 6);
    s += art.soft(HD([[-14, -40], [0, -16], [14, -40]]), '#1e0208', 6, 0.55, 2.5);
    s += art.soft(HD([[-6, -54], [0, -28], [6, -54]]), '#1e0208', 4, 0.4, 2);
    // deep eye sockets
    for (const sx of [-1, 1]) s += art.blob(HD(ell(sx * 50, 0, 42, 22, 14, sx * -14)), '#120004', 0.82, 7);
    // lip line
    s += art.soft(HD([[-100, 22], [-76, 50], [-60, 76], [-50, 104], [-40, 126], [-26, 140], [0, 145], [26, 140], [40, 126], [50, 104], [60, 76], [76, 50], [100, 22]]), '#1a0206', 5, 0.65, 2);
    // wrinkles under the eyes
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) s += art.soft(HD([[sx * (32 + i * 4), 22 + i * 9], [sx * (54 + i * 6), 27 + i * 10], [sx * (76 + i * 2), 22 + i * 12]]), '#1e0208', 3, 0.45, 1.5);
    // nostril bosses at the snout tip
    for (const sx of [-1, 1]) {
      s += art.blob(HD(ell(sx * 18, 122, 15, 10, 12, sx * 30)), '#ff8a6a', 0.32, 3);
      s += art.blob(HD(ell(sx * 20, 128, 13, 7, 12, sx * 30)), '#1e0208', 0.35, 3);
    }
    return s;
  });
  // nostril slits, angled outward
  for (const sx of [-1, 1]) art.add(`<path d="${HD([[sx * 10, 128, 1], [sx * 18, 121], [sx * 30, 118, 1], [sx * 22, 126]])}" fill="#140204"/>`);
  // fangs overhanging the lower jaw
  for (const sx of [-1, 1]) {
    const pts = atk ? [[-92, 34, 16], [-80, 58, 18], [-68, 84, 22], [-56, 108, 40], [-42, 128, 20], [-24, 140, 16]] : [[-58, 82, 10], [-50, 106, 24], [-40, 126, 12], [-26, 139, 9]];
    for (const [x, y, l] of pts) {
      const X = HX + (sx < 0 ? x : -x) * hs, Y = HY + y * fsh * hs;
      art.part(tube([[X, Y - 6], [X + sx * 1, Y + l * 0.5 * hs], [X + sx * 3, Y + l * hs]], [[0, l > 20 ? 6.5 : 4.5], [1, 0.3]], { n: 10 }).d, boneFill, { vol: { ...boneVol, ao: 0.3 } });
    }
  }
  // brow ridges
  const brow = [[-10, -6], [-28, -22], [-56, -32], [-98, -46, 1], [-84, -24], [-58, -14], [-34, -6], [-16, 4]];
  for (const p of both(brow)) art.part(HD(p), art.lin([[0, '#ff906c'], [0.35, S.mid], [1, S.deep]], 0, 0, 0, 1), { vol: { ...smallVol, k: 7, ao: 0.75, aoy: 6, aob: 5 } });
  // burning slit eyes
  const eyeHalf = [[-22, 8, 1], [-34, 0], [-54, -7], [-80, -15, 1], [-66, 2], [-46, 10]];
  for (const [i, pts] of both(eyeHalf).entries()) {
    const sx = i ? 1 : -1;
    const ed = HD(pts);
    art.layer('over');
    art.add(art.glow(ed, null, '#ffa010', [[18, 0.55], [7, 0.8]]));
    art.layer('fig');
    art.part(ed, art.rad([[0, '#fffff0'], [0.3, '#fff45a'], [0.7, '#ffb21c'], [1, '#d84008']], 0.5, 0.55, 0.6), { vol: { k: 4, sb: 2.5, sc: '#7a1000', so: 0.6, hk: 0, ho: 0, rk: 0, ro: 0, ao: 0 } }, () => {
      const c = H([[sx * 50, 1]])[0];
      return `<ellipse cx="${r1(c[0])}" cy="${r1(c[1])}" rx="${r1(3.6 * hs)}" ry="${r1(11 * hs)}" fill="#1a0400" transform="rotate(${sx * 12} ${r1(c[0])} ${r1(c[1])})"/>` +
        art.soft(HD([[sx * 22, 3], [sx * 46, -7], [sx * 80, -17]]), '#5a0800', 5, 0.7, 2) +
        `<ellipse cx="${r1(c[0] - 9 * hs)}" cy="${r1(c[1] - 2 * hs)}" rx="${r1(2.4 * hs)}" ry="${r1(1.8 * hs)}" fill="#ffffff"/>`;
    });
  }
  // crown of five bone spikes on the brow
  const crown = [[-50, -46, -30, 54, 10], [50, -46, 30, 54, 10], [-26, -55, -14, 70, 11.5], [26, -55, 14, 70, 11.5], [0, -58, 0, 86, 13.5]];
  for (const [x, y, a, l, r] of crown) {
    const p = H([[x, y]])[0];
    const sp = spikeTube(p[0], p[1], a, l * hs, r * hs, a === 0 ? 0.03 : (a < 0 ? -0.1 : 0.1));
    art.part(sp.d, art.lin([[0, '#fffaf0'], [0.45, B.mid], [1, '#7a604a']], 0, 0, 1, 0.25), { vol: { ...boneVol, ao: 0.65, aob: 5, aoy: 7 } }, () => {
      let s = '';
      for (let i = 4; i < sp.L.length - 6; i += 4) s += `<path d="M${r1(sp.L[i][0])} ${r1(sp.L[i][1])}L${r1(sp.R[i][0])} ${r1(sp.R[i][1])}" stroke="#4a3626" stroke-width="1.6" opacity="0.35"/>`;
      return s;
    });
  }

  // ---------------------------------------------------------------- shading, breath
  if (atk) art.add(`<rect x="0" y="0" width="1024" height="768" fill="${art.rad([[0, '#ffb040', 0.6], [0.45, '#ff6a10', 0.28], [1, '#ff4000', 0]], 520, 560, 420, 520, 560, true)}"/>`);
  figShade(art, 0.5, '#10020a', 0.4);
  art.layer('over');
  if (!atk) {
    for (const sx of [-1, 1]) {
      const n0 = H([[sx * 22, 124]])[0];
      const P = (pts) => pts.map(([x, y]) => [n0[0] + sx * x, n0[1] + y]);
      art.add(smokePlume(art, P([[2, 4], [18, 18], [48, 30], [92, 34], [134, 22], [162, -8], [170, -46], [158, -80], [140, -84], [136, -64]]), 4, 26, 0.62, sx < 0 ? 5 : 6));
      art.add(smokePlume(art, P([[4, 8], [26, 30], [70, 46], [124, 44], [170, 20], [196, -26], [200, -84], [222, -140], [214, -190]]), 5, 40, 0.42, sx < 0 ? 7 : 8));
      art.add(art.glow(HD([[sx * 12, 127, 1], [sx * 18, 122], [sx * 27, 119, 1], [sx * 21, 125]]), '#ffb050', '#ff5a10', [[7, 0.7], [2.5, 0.9]]));
    }
  } else {
    const m = HJ([[0, 150]])[0];
    art.add(fireJet(art, { x: m[0], y: m[1], len: 600, ang: 180, w0: 16, w1: 320, seed: 3, strands: 26, disp: 50 }));
    art.add(sparks(art, rng(77), 60, { x: 230, y: 400, w: 580, h: 370 }, 180, ['#fff6c0', '#ffd23a', '#ff9a1a', '#ff5a10'], [3, 12]));
    art.add(art.glow(HJD(ell(0, 150, 44, 44, 14)), null, '#ffb020', [[24, 0.6], [10, 0.45]]));
  }
  return art.svg();
}

// ================================================================== ASH WARDEN
// Horned knight in black spiked plate, ember trim, burning greatsword. 800 x 1040.
function ashwardenFrame(frame) {
  const atk = frame === 'attack';
  const art = new Art('ashwarden', frame, 800, 1040, atk ? 23 : 19);
  const CX = 400;
  const plateVol = { k: 10, sb: 6, sc: '#050306', so: 0.6, hk: 4, hb: 2.2, ho: 0.38, rk: 2.4, ro: 0.5, ao: 0.6, aox: 3, aoy: 7, aob: 7, aoc: '#050304' };
  const smallVol = { ...plateVol, k: 5, sb: 3, hk: 2.5, hb: 1.4, aoy: 4, aob: 4 };
  const steel = (ang = 0) => art.once('st' + ang, () => {
    const a = ang * D2R, dx = Math.sin(a) * 0.5, dy = Math.cos(a) * 0.5;
    return art.lin([[0, '#7c7888'], [0.2, '#34313c'], [0.42, '#16141a'], [0.54, '#4a4754'], [0.64, '#17151b'], [1, '#0c0b0e']], 0.5 - dx, 0.5 - dy, 0.5 + dx, 0.5 + dy);
  });
  const steelR = art.rad([[0, '#8a8694'], [0.22, '#3a3742'], [0.58, '#17151a'], [1, '#0a090c']], 0.34, 0.26, 0.85);
  const emberTrim = (d, w = 8) => `<path d="${d}" fill="none" stroke="#ff4a12" stroke-width="${w + 8}" opacity="0.18" filter="${art.blur(5)}"/><path d="${d}" fill="none" stroke="#7a1208" stroke-width="${w}"/><path d="${d}" fill="none" stroke="#e8501a" stroke-width="${r1(w * 0.3)}" opacity="0.85"/>`;
  const spec = (d, w = 3, op = 0.6) => art.soft(d, '#e4e8fa', w, op, 1.1);
  const keyHi = (d, w = 10, op = 0.22) => art.soft(d, KEY, w, op, w * 0.5);
  const dark = (d, w = 6, op = 0.7) => art.soft(d, '#040203', w, op, w * 0.3);
  const P = (pts) => pathD(pts);
  const mir = (pts) => flipX(pts, CX).reverse();
  const swordGlow = atk ? [170, 120] : [222, 780];
  const emberLight = art.rad([[0, '#ff6a1a', 0.5], [0.5, '#ff3a0a', 0.16], [1, '#ff2000', 0]], swordGlow[0], swordGlow[1], 400, swordGlow[0], swordGlow[1], true);

  // ---------------------------------------------------------------- cloak
  const cloakPts = [[262, 262], [538, 262], [618, 360], [664, 540], [694, 740], [712, 900], [698, 968], [668, 940], [646, 996], [608, 952], [574, 1004], [532, 968], [500, 990], [300, 990], [268, 966], [228, 1006], [194, 956], [156, 998], [130, 946], [100, 968], [92, 900], [110, 740], [138, 540], [182, 360]];
  art.part(P(cloakPts), art.lin([[0, '#2e2226'], [0.45, '#171113'], [1, '#0d090a']], 0, 0, 1, 1), { vol: { ...plateVol, k: 18, sb: 14, ho: 0.15, ro: 0.55, ao: 0 } }, () => {
    let s = '';
    const R = rng(5);
    for (let i = 0; i < 10; i++) {
      const x = lerp(120, 690, i / 9) + (R() - 0.5) * 16;
      s += art.soft(P([[lerp(x, CX, 0.6), 300], [lerp(x, CX, 0.3), 620], [x, 990]]), '#050304', 28, 0.65, 12);
      s += art.soft(P([[lerp(x + 26, CX, 0.6), 300], [lerp(x + 26, CX, 0.3), 620], [x + 26, 990]]), '#5e4a4e', 10, 0.42, 6);
    }
    // ember glow eating the frayed hem
    const hem = pathD(cloakPts.slice(5, 21), false);
    s += `<path d="${hem}" fill="none" stroke="#ff3a08" stroke-width="70" opacity="0.5" filter="${art.blur(18)}"/>`;
    s += `<path d="${hem}" fill="none" stroke="#ff7a1a" stroke-width="16" opacity="0.8" filter="${art.blur(5)}"/>`;
    s += `<path d="${hem}" fill="none" stroke="#ffd070" stroke-width="4" opacity="0.95" filter="${art.blur(1.2)}"/>`;
    return s;
  });

  // ---------------------------------------------------------------- attack: blade behind the shoulders
  let sw = null;

  // ---------------------------------------------------------------- legs
  function leg(f) {
    const cuisse = f([[306, 606, 1], [390, 596, 1], [396, 690], [388, 772, 1], [322, 778, 1], [302, 690]]);
    art.part(P(cuisse), steel(-25), { vol: plateVol }, () => spec(P(f([[314, 614], [308, 700], [326, 770]])), 3.5, 0.7) + keyHi(P(f([[324, 620], [318, 720]])), 22, 0.26) +
      dark(P(f([[360, 600], [362, 690], [356, 774]])), 5, 0.5) + spec(P(f([[354, 602], [356, 690], [350, 770]])), 2, 0.35) + dark(P(f([[316, 690], [394, 684]])), 6, 0.6));
    const greave = f([[318, 816, 1], [386, 816, 1], [394, 880], [382, 966, 1], [326, 966, 1], [312, 880]]);
    art.part(P(greave), steel(-20), { vol: plateVol }, () => spec(P(f([[324, 826], [318, 880], [330, 958]])), 3.5, 0.7) + keyHi(P(f([[328, 830], [324, 930]])), 20, 0.26) +
      dark(P(f([[358, 818], [362, 880], [356, 964]])), 5, 0.55) + spec(P(f([[352, 820], [356, 880], [350, 962]])), 2, 0.4) + emberTrim(P(f([[330, 962], [380, 962]])), 6));
    const sab = f([[300, 984], [330, 954, 1], [380, 954, 1], [404, 980], [416, 1040, 1], [284, 1040, 1], [286, 1006]]);
    art.part(P(sab), steelR, { vol: plateVol }, () => {
      let s = '';
      for (let i = 0; i < 3; i++) s += dark(P(f([[290, 990 + i * 17], [350, 980 + i * 17], [412, 990 + i * 17]])), 5, 0.65) + spec(P(f([[292, 986 + i * 17], [340, 977 + i * 17]])), 2, 0.4);
      return s;
    });
    // knee: poleyn with a side fan and a spike
    art.part(P(f([[310, 774], [284, 796, 1], [314, 814]])), steel(10), { vol: smallVol }, () => emberTrim(P(f([[284, 796], [314, 814]])), 4));
    const kn = f([[310, 766], [390, 762], [402, 792], [380, 826], [326, 828], [300, 796]]);
    art.part(P(kn), steelR, { vol: smallVol }, () => emberTrim(P(f([[308, 796], [330, 826], [376, 824], [396, 792]])), 6) + spec(P(f([[320, 780], [350, 770]])), 2.5, 0.6));
    const kp = f([[350, 800]])[0];
    art.part(spikeTube(kp[0], kp[1], kp[0] < CX ? -160 : 160, 40, 12, 0.08).d, steel(30), { vol: smallVol });
  }
  leg((p) => p);
  leg((p) => mir(p));

  // ---------------------------------------------------------------- faulds, tabard, belt
  art.part(P(sym([[CX, 526], [330, 526, 1], [306, 574], [290, 648, 1], [334, 660], [CX, 650]], CX)), steel(0), { vol: plateVol }, () => {
    let s = '';
    for (let i = 0; i < 4; i++) {
      const y = 556 + i * 26;
      s += dark(P([[296, y + 6 + i * 3], [CX, y], [504, y + 6 + i * 3]]), 6, 0.8) + spec(P([[302, y], [CX - 40, y - 5]]), 2.2, 0.45);
    }
    return s + emberTrim(P([[290, 648], [334, 660], [CX, 650], [466, 660], [510, 648]]), 7);
  });
  const tab = [[370, 520], [430, 520], [442, 700], [440, 816], [424, 792], [412, 828], [398, 796], [384, 826], [372, 794], [360, 816], [358, 700]];
  art.part(P(tab), art.lin([[0, '#7a1410'], [0.5, '#480a0a'], [1, '#260606']], 0, 0, 0.4, 1), { vol: { ...plateVol, ro: 0.35, ho: 0.25 } }, () =>
    art.soft(P([[384, 530], [380, 700], [372, 800]]), '#160404', 10, 0.6, 5) + art.soft(P([[420, 530], [424, 700], [430, 800]]), '#ff6a3a', 5, 0.18, 4) +
    `<path d="${P(tab.slice(3, 10))}" fill="none" stroke="#ff6a1a" stroke-width="9" opacity="0.85" filter="${art.blur(3)}"/>` +
    // ember sigil stitched on the tabard
    `<path d="M400 600L384 640L400 668L416 640Z" fill="none" stroke="#ff7a2a" stroke-width="3" opacity="0.8"/>`);
  art.part(P([[320, 494, 1], [480, 494, 1], [486, 532, 1], [314, 532, 1]]), art.lin([[0, '#3a2a24'], [0.5, '#1a1210'], [1, '#0e0a08']], 0, 0, 0, 1), { vol: smallVol }, () =>
    spec(P([[322, 498], [478, 498]]), 2, 0.3) + `<rect x="382" y="496" width="36" height="34" rx="4" fill="#2a1a14"/><rect x="389" y="503" width="22" height="20" rx="2" fill="#ff6a1a"/><rect x="394" y="508" width="12" height="10" fill="#ffd27a"/>`);

  // ---------------------------------------------------------------- torso
  const chestD = P(sym([[CX, 248], [360, 252], [322, 270], [302, 316], [300, 382], [312, 442], [338, 490], [370, 508], [CX, 512]], CX));
  art.part(chestD, steelR, { vol: { ...plateVol, k: 22, sb: 14 } }, () => {
    let s = '';
    s += art.blob(P([[326, 288], [392, 276], [394, 384], [330, 384]]), '#8a8698', 0.16, 14);
    s += art.blob(P([[410, 280], [478, 290], [474, 392], [408, 386]]), '#040203', 0.5, 14);
    // keel ridge
    s += dark(P([[CX + 4, 262], [CX + 4, 506]]), 7, 0.75) + spec(P([[CX - 3, 266], [CX - 3, 498]]), 2.5, 0.55);
    // pectoral plate edges
    s += dark(P([[306, 392], [350, 404], [CX, 396], [450, 404], [494, 392]]), 8, 0.75) + spec(P([[308, 386], [350, 397], [CX - 6, 390]]), 2.5, 0.5);
    s += spec(P([[326, 292], [352, 276], [388, 270]]), 3, 0.6);
    // abdomen lames
    for (const y of [438, 470]) s += dark(P([[316, y], [CX, y + 14], [484, y]]), 7, 0.75) + spec(P([[318, y - 6], [CX - 30, y + 4]]), 2.2, 0.4);
    s += emberTrim(P([[302, 316], [322, 270], [360, 252], [CX, 248], [440, 252], [478, 270], [498, 316]]), 8);
    s += `<rect x="280" y="240" width="240" height="300" fill="${emberLight}"/>`;
    return s;
  });
  // rune medallion
  art.part(P(ell(CX, 342, 30, 30, 16)), art.rad([[0, '#0c0806'], [0.8, '#1a1412'], [1, '#4a4450']], 0.5, 0.5, 0.5), { vol: { ...smallVol, ho: 0.5, ro: 0.6 } }, () => emberTrim(P(ell(CX, 342, 30, 30, 16)), 4));
  const rune = `M${CX} 318L${CX + 20} 352H${CX - 20}Z M${CX} 326V366 M${CX - 14} 334L${CX + 14} 334`;
  art.add(`<path d="${rune}" fill="none" stroke="#ffcf70" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>`);
  art.layer('over');
  art.add(`<path d="${rune}" fill="none" stroke="#ff6a14" stroke-width="9" opacity="0.8" stroke-linecap="round" filter="${art.blur(5)}"/><path d="${rune}" fill="none" stroke="#fff4c4" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`);
  art.layer('fig');
  // gorget
  art.part(P([[344, 232, 1], [CX, 222], [456, 232, 1], [478, 272], [CX, 286], [322, 272]]), steel(10), { vol: smallVol }, () =>
    spec(P([[336, 258], [372, 246]]), 2.5, 0.5) + dark(P([[330, 254], [CX, 266], [470, 254]]), 5, 0.6) + emberTrim(P([[322, 272], [CX, 286], [478, 272]]), 6));

  // ---------------------------------------------------------------- arms and shoulders
  function arm(sh, el, wr, only = 'all', lit = 0) {
    const side = sh[0] < CX ? -1 : 1;
    const fireLit = (tb) => lit ? art.soft(P([tubeAt(tb, 0.05, 0.75 * side * -1), tubeAt(tb, 0.95, 0.75 * side * -1)].map((p) => [p.x, p.y])), '#ff7a2a', 10, lit, 4) : '';
    const up = tube([sh, [lerp(sh[0], el[0], 0.5), lerp(sh[1], el[1], 0.5)], el], [[0, 40], [1, 33]], { n: 16, start: 'flat' });
    if (only !== 'fore') art.part(up.d, steel(side * 25), { vol: plateVol }, () => {
      let s = fireLit(up);
      for (let i = 1; i < 4; i++) { const p = tubeAt(up, i / 4, 1), q = tubeAt(up, i / 4 + 0.05, -1); s += dark(`M${r1(p.x)} ${r1(p.y)}L${r1(q.x)} ${r1(q.y)}`, 5, 0.65); }
      return s + spec(P([tubeAt(up, 0.08, 0.6 * -side), tubeAt(up, 0.92, 0.6 * -side)].map((p) => [p.x, p.y])), 3, 0.5);
    });
    const fo = tube([el, [lerp(el[0], wr[0], 0.5), lerp(el[1], wr[1], 0.5)], wr], [[0, 31], [0.6, 30], [1, 33]], { n: 16, end: 'flat' });
    if (only === 'upper') return;
    art.part(fo.d, steel(side * 15), { vol: plateVol }, () => fireLit(fo) + spec(P([tubeAt(fo, 0.1, 0.55 * -side), tubeAt(fo, 0.88, 0.55 * -side)].map((p) => [p.x, p.y])), 3, 0.55) +
      dark(P([tubeAt(fo, 0.45, 0.15), tubeAt(fo, 0.85, 0.15)].map((p) => [p.x, p.y])), 4, 0.5));
    // flared cuff
    const c0 = tubeAt(fo, 0.78, 1.15), c1 = tubeAt(fo, 0.78, -1.15), c2 = tubeAt(fo, 1, -1.45), c3 = tubeAt(fo, 1, 1.45);
    art.part(P([[c0.x, c0.y, 1], [c1.x, c1.y, 1], [c2.x, c2.y, 1], [c3.x, c3.y, 1]]), steel(side * 30), { vol: smallVol }, () => emberTrim(P([[c2.x, c2.y], [c3.x, c3.y]]), 4) + spec(P([[c0.x, c0.y], [c3.x, c3.y]]), 2, 0.5));
    // couter: elbow cop, fan and spike
    art.part(P([[el[0] + side * 26, el[1] - 26, 1], [el[0] + side * 52, el[1] + 2, 1], [el[0] + side * 24, el[1] + 30, 1]]), steel(side * 50), { vol: smallVol });
    art.part(P(ell(el[0], el[1], 32, 28, 12)), steelR, { vol: smallVol }, () => spec(P([[el[0] - 20, el[1] - 12], [el[0] - 2, el[1] - 22]]), 2.2, 0.6));
    art.part(spikeTube(el[0] + side * 18, el[1] + 2, side * 100, 36, 11, 0.1 * side).d, steel(40), { vol: smallVol });
  }
  // armoured fist: a cuffed block with knuckle plates
  function fist(cx, cy, rot, grip, lit = 0) {
    const tf = rotAbout(cx, cy, rot);
    const T = (pts) => mapPts(pts, tf);
    art.part(P(T([[cx - 26, cy - 24, 1], [cx + 24, cy - 26, 1], [cx + 30, cy + 6], [cx + 22, cy + 30, 1], [cx - 22, cy + 30, 1], [cx - 30, cy + 4]])), steelR, { vol: smallVol }, () => {
      let s = '';
      for (let i = 0; i < 4; i++) s += dark(P(T([[cx - 22 + i * 13, cy + 4], [cx - 22 + i * 13, cy + 28]])), 3, 0.6) + spec(P(T([[cx - 26 + i * 13, cy + 6], [cx - 26 + i * 13, cy + 16]])), 1.6, 0.45);
      s += spec(P(T([[cx - 20, cy - 18], [cx + 14, cy - 22]])), 2.4, 0.6) + dark(P(T([[cx - 28, cy + 2], [cx + 28, cy + 2]])), 4, 0.6);
      if (lit) s += art.soft(P(T([[cx - 30, cy + 10], [cx - 26, cy - 22], [cx + 20, cy - 28]])), '#ff8a30', 9, lit, 3);
      return s;
    });
    if (!grip) for (let i = 0; i < 3; i++) {
      const k = T([[cx - 13 + i * 13, cy + 30]])[0];
      art.part(spikeTube(k[0], k[1], 180 + rot, 10, 4, 0).d, steel(20), { vol: smallVol });
    }
  }
  function pauldron(f) {
    const L = f([[0, 0]])[0][0] === 0;
    for (const [x, y, a, l, r] of [[214, 262, -42, 84, 16], [258, 238, -18, 108, 19], [306, 232, 4, 80, 15]]) {
      const p = f([[x, y]])[0];
      const sp = spikeTube(p[0], p[1], L ? a : -a, l, r, L ? 0.08 : -0.08);
      art.part(sp.d, steel(L ? 30 : -30), { vol: smallVol }, () => spec(P(sp.L.slice(2, -4)), 2, 0.45));
    }
    for (let i = 1; i >= 0; i--) {
      const y = 350 + i * 20;
      art.part(P(f([[186, y - 10, 1], [244, y + 2], [300, y], [350, y - 12, 1], [346, y + 12, 1], [298, y + 22], [242, y + 24], [190, y + 10, 1]])), steel(L ? 20 : -20), { vol: smallVol }, () =>
        spec(P(f([[190, y - 7], [244, y + 5], [290, y + 3]])), 2, 0.5) + dark(P(f([[192, y + 8], [242, y + 22], [298, y + 20], [346, y + 10]])), 4, 0.6));
    }
    const dome = f([[170, 326, 1], [178, 282], [206, 246], [256, 222], [318, 222], [360, 246], [378, 292, 1], [356, 330], [300, 352], [236, 354], [192, 344]]);
    art.part(P(dome), steelR, { vol: { ...plateVol, k: 16, sb: 10 } }, () =>
      spec(P(f([[188, 304], [204, 266], [246, 238]])), 4, 0.7) + keyHi(P(f([[194, 300], [228, 256], [288, 236]])), 26, 0.22) +
      dark(P(f([[182, 316], [256, 276], [350, 270]])), 10, 0.6) + spec(P(f([[184, 309], [256, 268], [336, 262]])), 2.5, 0.5) +
      emberTrim(P(f([[170, 326], [192, 344], [236, 354], [300, 352], [356, 330], [378, 292]])), 6) + `<rect x="0" y="200" width="800" height="200" fill="${emberLight}"/>` +
      f([[190, 328], [232, 340], [276, 344], [318, 338], [354, 318]]).map(([x, y]) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="4" fill="#0a080a"/><circle cx="${r1(x - 1)}" cy="${r1(y - 1)}" r="2" fill="#b8b4c4"/>`).join(''));
    // raised haute-piece ridge
    art.part(P(f([[196, 266, 1], [252, 232], [334, 230, 1], [338, 246, 1], [256, 248], [206, 280, 1]])), steel(L ? 40 : -40), { vol: smallVol }, () => spec(P(f([[200, 266], [252, 234], [330, 232]])), 2, 0.6));
  }

  if (!atk) {
    arm([516, 338], [562, 456], [576, 556]);
    fist(578, 584, -6, false);
    pauldron((p) => mir(p));
    sw = sword(222, 630, 180);
    arm([284, 338], [256, 458], [226, 540]);
    pauldron((p) => p);
    fist(224, 572, 0, true);
  } else {
    // sword cocked high over the right shoulder, both hands on the grip
    arm([516, 336], [492, 410], [334, 274], 'upper');
    pauldron((p) => mir(p));
    arm([284, 340], [186, 384], [282, 246], 'upper');
    pauldron((p) => p);
    arm([284, 340], [186, 384], [282, 246], 'fore', 0.55);
  }

  // ---------------------------------------------------------------- helm
  for (const f of [(p) => p, (p) => flipX(p, CX)]) {
    const hn = tube(f([[352, 140], [306, 128], [266, 96], [248, 52], [260, 12]]), [[0, 22], [0.5, 13], [1, 0]], { n: 36 });
    const L = hn.sp[2][0] < CX;
    art.part(hn.d, art.lin([[0, '#a69888'], [0.35, '#4a3e38'], [1, '#16110e']], L ? 0 : 1, 0, L ? 0.7 : 0.3, 1), { vol: smallVol }, () => {
      let s = '';
      for (let i = 2; i < hn.L.length - 4; i += 3) s += `<path d="M${r1(hn.L[i][0])} ${r1(hn.L[i][1])}L${r1(hn.R[i][0])} ${r1(hn.R[i][1])}" stroke="#080404" stroke-width="2" opacity="0.5"/>`;
      return s + spec(P(hn.L.slice(4, -6)), 2, 0.35);
    });
  }
  const helmD = P(sym([[CX, 76], [374, 80], [354, 96], [342, 126], [336, 172], [338, 214], [346, 242], [370, 258], [CX, 264]], CX));
  art.part(helmD, steelR, { vol: { ...plateVol, k: 14, sb: 9 } }, () => {
    let s = '';
    s += art.blob(P([[412, 90], [458, 124], [464, 246], [412, 258]]), '#040203', 0.45, 12);
    s += spec(P([[354, 126], [362, 100], [388, 82]]), 3.5, 0.75) + keyHi(P([[352, 150], [356, 112], [380, 92]]), 18, 0.22);
    s += dark(P([[CX + 4, 80], [CX + 4, 258]]), 6, 0.7) + spec(P([[CX - 3, 84], [CX - 3, 162]]), 2.5, 0.6);
    // visor brow and face plate
    s += dark(P([[338, 160], [CX, 168], [462, 160]]), 12, 0.75) + spec(P([[340, 154], [384, 160]]), 2, 0.5);
    s += dark(P([[338, 200], [CX, 206], [462, 200]]), 6, 0.6);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (const sx of [-1, 1]) s += `<circle cx="${CX + sx * (14 + c * 13)}" cy="${218 + r * 12}" r="3.4" fill="#1a0402"/><circle cx="${CX + sx * (14 + c * 13)}" cy="${218 + r * 12}" r="1.9" fill="#ff5a14" opacity="0.85"/>`;
    s += emberTrim(P([[346, 242], [370, 258], [CX, 264], [430, 258], [454, 242]]), 6);
    return s;
  });
  // glowing visor slits, slanted into a scowl
  for (const sx of [-1, 1]) {
    art.add(`<path d="${P([[CX + sx * 56, 170, 1], [CX + sx * 10, 184], [CX + sx * 8, 192, 1], [CX + sx * 54, 180]])}" fill="#1a0402"/>`);
    art.layer('over');
    art.add(art.glow(P([[CX + sx * 52, 172, 1], [CX + sx * 12, 184], [CX + sx * 10, 189, 1], [CX + sx * 50, 178]]), '#fff2c0', '#ff5a10', [[14, 0.7], [5, 0.9], [2, 1]]));
    art.layer('fig');
  }


  if (atk) {
    sw = sword(268, 214, -52, 262);
    arm([516, 336], [492, 410], [334, 274], 'fore', 0.35);
    fist(294, 240, -52, true, 0.7);
    fist(324, 264, -52, true, 0.55);
    const pm = sw.at(-104, 0);
    art.part(P(ell(pm[0], pm[1], 17, 17, 12)), steelR, { vol: smallVol }, () => `<circle cx="${r1(pm[0])}" cy="${r1(pm[1])}" r="6" fill="#ff6a1a"/>`);
  }

  // ---------------------------------------------------------------- light, smoke, fire
  figShade(art, 0.32, '#060306', 0.22);
  art.add(`<rect x="0" y="0" width="800" height="1040" fill="${emberLight}"/>`);
  art.layer('under');
  const R = rng(atk ? 31 : 29);
  for (let i = 0; i < 8; i++) {
    const x = lerp(110, 700, i / 7), y = 960 + R() * 30, sd = x < CX ? -1 : 1;
    art.add(smokePlume(art, [[x, y], [x + sd * 34, y - 80], [x + sd * 80, y - 150], [x + sd * 66, y - 240], [x + sd * 100, y - 330]], 16, 52, 0.6, 50 + i, ['#141012', '#3a3236', '#6a5e62']));
  }
  art.layer('over');
  for (const [x, y, sd] of [[120, 970, -1], [690, 960, 1], [240, 1004, -1], [580, 1004, 1], [160, 1000, 1], [650, 1000, -1]]) {
    art.add(smokePlume(art, [[x, y], [x + sd * 26, y - 50], [x + sd * 56, y - 96], [x + sd * 44, y - 160], [x + sd * 60, y - 210]], 10, 34, 0.55, 70 + x, ['#1a1416', '#4a4044', '#7a6e72']));
  }
  art.add(sparks(art, R, 40, { x: 90, y: 760, w: 620, h: 270 }, 0, ['#ffe08a', '#ffb030', '#ff6a14'], [2, 9]));
  swordFire(sw, atk);
  return art.svg();

  function sword(gx, gy, ang, L = 392) {
    const a = ang * D2R, dx = Math.sin(a), dy = -Math.cos(a), nx = -dy, ny = dx;
    const at = (t, u) => [gx + dx * t + nx * u, gy + dy * t + ny * u];
    const bladeD = P([[...at(0, -26), 1], [...at(0, 26), 1], at(L * 0.8, 19), [...at(L, 0), 1], at(L * 0.8, -19)]);
    const bfill = art.lin([[0, '#5c5866'], [0.44, '#24222b'], [0.5, '#0e0c10'], [0.56, '#2c2a34'], [1, '#16141a']], ...at(0, -26), ...at(0, 26), true);
    art.part(bladeD, bfill, { vol: { ...smallVol, ao: 0.4 } }, () =>
      `<path d="${P([at(4, -23), at(L * 0.8, -17), at(L - 4, 0)])}" fill="none" stroke="#ff6a14" stroke-width="6" opacity="0.95"/>` +
      `<path d="${P([at(4, 23), at(L * 0.8, 17), at(L - 4, 0)])}" fill="none" stroke="#ffaa38" stroke-width="6" opacity="0.95"/>` +
      `<path d="${P([at(14, 0), at(L * 0.74, 0)])}" fill="none" stroke="#ff3a0a" stroke-width="13" opacity="0.85" filter="${art.blur(3)}"/>` +
      `<path d="${P([at(14, 0), at(L * 0.74, 0)])}" fill="none" stroke="#ffd070" stroke-width="3.2"/>` +
      `<path d="${P([at(30, -12), at(L * 0.7, -9)])}" fill="none" stroke="#c8ccdc" stroke-width="2" opacity="0.4"/>`);
    const cg = [at(-14, -82), at(-4, -62), at(0, -24), at(-2, 0), at(0, 24), at(-4, 62), at(-14, 84), [...at(14, 92), 1], at(8, 62), at(12, 26), at(16, 0), at(12, -26), at(8, -62), [...at(14, -90), 1]];
    art.part(P(cg), steel(ang), { vol: smallVol }, () => emberTrim(P([at(-2, -60), at(-8, 0), at(-2, 60)]), 4) + spec(P([at(-10, -70), at(-4, -30)]), 2, 0.5));
    art.part(tube([at(-16, 0), at(-94, 0)], [[0, 11], [1, 12]], { n: 12 }).d, art.lin([[0, '#3a2620'], [0.5, '#1a100c'], [1, '#0a0606']], 0, 0, 1, 0), { vol: smallVol }, () => {
      let s = '';
      for (let i = 0; i < 7; i++) s += `<path d="M${at(-22 - i * 11, -12).map(r1).join(' ')}L${at(-28 - i * 11, 12).map(r1).join(' ')}" stroke="#5a3a2a" stroke-width="3" opacity="0.7"/>`;
      return s;
    });
    if (!atk) {
      const pm = at(-104, 0);
      art.part(P(ell(pm[0], pm[1], 17, 17, 12)), steelR, { vol: smallVol }, () => `<circle cx="${r1(pm[0])}" cy="${r1(pm[1])}" r="6" fill="#ff6a1a"/>`);
    }
    return { at, L, bladeD };
  }

  function swordFire(sw, big) {
    art.layer('over');
    const { at, L } = sw;
    const FR = rng(big ? 91 : 83);
    art.add(`<path d="${sw.bladeD}" fill="none" stroke="#ff5a10" stroke-width="${big ? 110 : 80}" opacity="${big ? 0.5 : 0.32}" filter="${art.blur(big ? 32 : 22)}"/>`);
    let f = '';
    const n = big ? 24 : 16;
    for (let i = 0; i < n; i++) {
      const t = lerp(0.04, 0.97, i / (n - 1)) * L;
      const u = (i % 2 ? 1 : -1) * (big ? 18 + FR() * 14 : 26 + FR() * 10);
      const b = at(t, u);
      const h = big ? lerp(70, 150, FR()) * (0.6 + 0.6 * (1 - t / L)) : lerp(50, 120, FR()) * (0.5 + 0.7 * (1 - t / L));
      const lean = big ? 40 + FR() * 70 : (FR() - 0.5) * 30;
      const lx = big ? 0 : (u > 0 ? 1 : -1) * 14;
      const tg = tongue([b, [b[0] + lean * 0.3 + lx, b[1] - h * 0.4], [b[0] + lean * 0.7 + lx * 1.4 + (FR() - 0.5) * 20, b[1] - h * 0.75], [b[0] + lean + lx, b[1] - h]], (big ? 30 : 15) * (0.7 + FR() * 0.6), 60 + i);
      f += `<path d="${tg.d}" fill="${['#ff4a0e', '#ff7a14', '#ffa22a'][i % 3]}" opacity="0.86"/>`;
    }
    for (let i = 0; i < (big ? n : 8); i++) {
      const t = lerp(0.06, 0.95, FR()) * L;
      const b = at(t, big ? (FR() - 0.5) * 44 : (FR() > 0.5 ? 1 : -1) * (22 + FR() * 6));
      const h = (big ? 80 : 42) * (0.6 + FR() * 0.6);
      const lean = big ? 20 + FR() * 30 : (FR() - 0.5) * 14;
      const tg = tongue([b, [b[0] + lean * 0.4, b[1] - h * 0.5], [b[0] + lean, b[1] - h]], (big ? 18 : 11) * (0.7 + FR() * 0.5), 90 + i);
      f += `<path d="${tg.d}" fill="${['#ffd040', '#ffe880', '#ffc030'][i % 3]}" opacity="0.9"/>`;
    }
    let fade = '';
    if (big) {
      const mid = art.id('fm');
      art.def(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="${art.W}" height="${art.H}"><rect x="0" y="0" width="${art.W}" height="${art.H}" fill="${art.lin([[0, '#000'], [0.06, '#fff']], 0, 0, 0, art.H, true)}"/></mask>`);
      fade = ` mask="url(#${mid})"`;
    }
    art.add(`<g${fade}><g filter="${flameFilter(art, big ? 30 : 22, '0.02 0.035', big ? 12 : 9)}">${f}</g></g>`);
    if (big) art.add(`<path d="${P([at(16, 0), at(L * 0.8, 0)])}" fill="none" stroke="#fff6d0" stroke-width="12" opacity="0.55" filter="${art.blur(4)}"/>`);
    if (!big) {
      const p = at(L, 0);
      art.add(`<ellipse cx="${r1(p[0])}" cy="${r1(p[1] - 8)}" rx="60" ry="16" fill="#ff5a10" opacity="0.6" filter="${art.blur(8)}"/>`);
      art.add(sparks(art, FR, 26, { x: p[0] - 100, y: 560, w: 200, h: 460 }, 0, ['#ffe08a', '#ffb030', '#ff6a14'], [2, 10]));
    } else {
      art.add(sparks(art, FR, 56, { x: 0, y: 0, w: 520, h: 380 }, 20, ['#ffe08a', '#ffb030', '#ff6a14'], [3, 14]));
    }
    art.layer('fig');
  }
}

export const ART_FOES_B = {
  dragon: { w: 1024, h: 768, height: 6.0, frames: { idle: dragonFrame('idle'), attack: dragonFrame('attack') } },
  ashwarden: { w: 800, h: 1040, height: 3.6, frames: { idle: ashwardenFrame('idle'), attack: ashwardenFrame('attack') } },
};
