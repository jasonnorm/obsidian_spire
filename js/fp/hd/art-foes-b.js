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
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.08 0 0 0 0 0.05 0 0 0 0 0.04 0.6 0 0 0 -0.23" result="gd"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 0.94 0 0 0 0 0.84 0 0.55 0 0 -0.23" result="gl"/>` +
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
    art.def(`<filter id="${id}" filterUnits="userSpaceOnUse" x="-100" y="-100" width="${art.W + 200}" height="${art.H + 200}" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="3" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="1.2"/></filter>`);
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
    art.def(`<filter id="${id}" filterUnits="userSpaceOnUse" x="-100" y="-100" width="${art.W + 200}" height="${art.H + 200}" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.024" numOctaves="3" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="2.4"/></filter>`);
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
  sc: { hi: '#ff7a5c', mid: '#c01c28', lo: '#6c0a1a', deep: '#30040c' },
  gold: { hi: '#ffeaa6', mid: '#dca03a', lo: '#9a5a18', deep: '#4a2008' },
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
    // foot and talons
    const foot = pathD(fx([[300, 730], [340, 716], [386, 722], [414, 744], [424, 768, 1], [290, 768, 1], [288, 748]]));
    for (const [x, a] of [[300, -26], [338, -10], [376, 4], [412, 18]]) {
      const b = fp([x, 742]);
      const toe = tube([b, fp([x + a * 0.3, 752])], [[0, 13], [1, 10]], { n: 8 });
      art.part(toe.d, scaleFill, { vol: smallVol });
      const c = tube([fp([x + a * 0.3, 750]), fp([x + a * 0.6, 760]), fp([x + a * 0.9, 768])], [[0, 9], [1, 0.6]], { n: 14 });
      art.part(c.d, clawFill, { vol: boneVol });
    }
    art.part(foot, art.matFill(S, 0.35, 0.2, 0.9), { vol: smallVol }, () => `<rect x="0" y="690" width="1024" height="80" fill="${scalesSm}"/>`);
    // shin
    const shin = tube([fp([338, 654]), fp([328, 698]), fp([348, 738])], [[0, 30], [0.6, 21], [1, 24]], { n: 18 });
    art.part(shin.d, scaleFill, { vol: { ...scaleVol, k: 10, sb: 6 } }, () => `<rect x="0" y="600" width="1024" height="168" fill="${scalesSm}"/>`);
    // thigh
    const thigh = pathD(fx([[466, 546], [424, 538], [384, 552], [346, 590], [322, 632], [326, 668], [352, 684], [396, 672], [440, 646], [474, 606], [486, 572]]));
    art.part(thigh, art.matFill(S, 0.3, 0.25, 0.92), { vol: { ...scaleVol, k: 24, sb: 16, so: 0.7 } }, () => {
      let s = `<rect x="0" y="520" width="1024" height="200" fill="${scalesBig}"/>` + mottle(280, 520, 470, 200, side < 0 ? 12 : 13);
      s += art.soft(pathD(fx([[350, 600], [392, 568], [446, 566]]), false), '#ff8a68', 24, 0.28, 12);
      s += art.soft(pathD(fx([[340, 668], [400, 664], [460, 630]]), false), '#1a0208', 22, 0.5, 10);
      return s;
    });
    const k = fp([326, 628]);
    art.part(spikeTube(k[0], k[1], side * -64, 36, 9, 0.15 * side).d, boneFill, { vol: boneVol });
  }
  hindLeg(-1);
  hindLeg(1);

  // ---------------------------------------------------------------- belly plates
  const bellyC = crSample([[504, 392], [508, 470], [512, 560], [512, 640], [512, 706]], 12);
  const bw = [46, 60, 64, 52, 30];
  const bellyL = [], bellyR = [];
  bellyC.forEach((p, i) => { const w = radAt(bw, i / (bellyC.length - 1)); bellyL.push([p[0] - w, p[1]]); bellyR.push([p[0] + w, p[1]]); });
  for (const pl of plateStrip(bellyL, bellyR, 11, 0.13, 0.1)) {
    art.part(pathD(pl.pts), plateFill, { vol: plateVol }, () => art.soft(pathD([pl.a, pl.m0, pl.b], false), '#fff3c8', 4, 0.55, 1.6) +
      art.soft(pathD([pl.d, pl.m1, pl.c], false), '#3a1204', 6, 0.5, 2.5));
  }

  // ---------------------------------------------------------------- neck
  const neck = tube([[486, 430], [440, 362], [410, 284], [408, 204], [430, 146], [474, 116], [524, 124], [548, 156]], [[0, 62], [0.3, 48], [0.7, 39], [1, 36]], { n: 64 });
  for (let k = 0; k < 9; k++) art.part(edgeSpike(neck, 0.22 + k * 0.08, -1, 32 - k * 1.2, 8.5, -16, 0.18).d, boneFill, { vol: boneVol });
  art.part(neck.d, scaleFill, { vol: { ...scaleVol, k: 16, sb: 10 } }, () => {
    let s = `<rect x="320" y="40" width="300" height="460" fill="${scalesMid}"/>` + mottle(320, 40, 300, 460, 21);
    const inner = sampleOff(neck, 0.98, 0, 0.62, 40), outer = sampleOff(neck, -0.3, 0, 0.62, 40);
    for (const pl of plateStrip(inner, outer, 10, -0.16, 0.14)) s += `<g filter="${art.vol(plateVol)}"><path d="${pathD(pl.pts)}" fill="${plateFill}"/></g>`;
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
    art.part(pathD(ell(hc[0], hc[1], 24, 20, 12)), scaleFill, { vol: smallVol });
    const dirs = atk ? [-82, -52, -22, 8] : [150, 168, 186, 204];
    dirs.forEach((dg) => {
      const a = (side < 0 ? dg : -dg) * D2R;
      const sx = Math.sin(a), sy = -Math.cos(a);
      const b0 = [hc[0] + sx * 14, hc[1] + sy * 12];
      const k1 = [b0[0] + sx * 20, b0[1] + sy * 20];
      art.part(tube([b0, k1], [[0, 9.5], [1, 8]], { n: 10 }).d, scaleFill, { vol: smallVol });
      const curl = (side < 0 ? 1 : -1) * (atk ? -0.55 : 0.5);
      const a2 = a + curl;
      const tip = [k1[0] + Math.sin(a2) * 30, k1[1] - Math.cos(a2) * 30];
      const mid = [lerp(k1[0], tip[0], 0.5) + Math.cos(a) * 4 * Math.sign(curl), lerp(k1[1], tip[1], 0.5) + Math.sin(a) * 4 * Math.sign(curl)];
      art.part(tube([k1, mid, tip], [[0, 7.5], [1, 0.3]], { n: 14 }).d, clawFill, { vol: boneVol });
    });
  }
  foreleg(-1);
  foreleg(1);

  // ---------------------------------------------------------------- head
  const hs = atk ? 1.16 : 1.12;
  const HX = 520, HY = atk ? 222 : 236;
  const H = (pts) => mapPts(pts, place(HX, HY, hs));
  const HD = (pts) => pathD(H(pts));
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
  const jawHalf = atk ? [[0, 120], [-84, 46], [-92, 116], [-76, 176], [-48, 218], [0, 232]] : [[0, 90], [-80, 38], [-78, 88], [-60, 132], [-38, 160], [0, 170]];
  art.part(HD(sym(jawHalf)), art.matFill(S, 0.4, 0.2, 0.9), { vol: smallVol }, () => {
    let s = `<rect x="300" y="200" width="460" height="300" fill="${scalesSm}"/>`;
    const y0 = atk ? 184 : 140, y1 = atk ? 228 : 168;
    for (let i = 0; i < 3; i++) {
      const ya = lerp(y0, y1, i / 3), yb = lerp(y0, y1, (i + 0.78) / 3), wv = 28 - i * 6;
      s += `<path d="${HD([[-wv, ya, 1], [0, ya + 5], [wv, ya, 1], [wv - 4, yb, 1], [0, yb + 5], [-wv + 4, yb, 1]])}" fill="${plateFill}" opacity="0.85"/>`;
    }
    // shadow cast by the snout onto the jaw
    s += art.blob(HD(sym([[0, 80], [-70, 40], [-62, 110], [-30, 150], [0, 156]])), '#14020a', 0.6, 10);
    return s;
  });
  for (const sx of [-1, 1]) {
    const base = atk ? [[-84, 150], [-66, 192]] : [[-70, 112], [-54, 140]];
    base.forEach(([x, y], i) => {
      const p = H([[sx < 0 ? x : -x, y]])[0];
      art.part(spikeTube(p[0], p[1] - 4, sx * (128 + i * 14), (24 - i * 4) * hs, 6.5, 0.1 * sx).d, boneFill, { vol: boneVol });
    });
  }
  if (atk) {
    // gaping mouth: gullet glowing from the throat, rows of fangs
    art.part(HD(sym([[0, 100], [-72, 52], [-74, 112], [-60, 162], [-34, 198], [0, 210]])), art.rad([[0, '#fff1a0'], [0.2, '#ffb21a'], [0.48, '#d0300c'], [0.8, '#4a0410'], [1, '#22020a']], 0.5, 0.48, 0.6), { vol: false }, () =>
      art.soft(HD([[-62, 70], [-50, 110], [-30, 140]]), '#ff8a5a', 10, 0.45, 5) + art.soft(HD([[62, 70], [50, 110], [30, 140]]), '#ff8a5a', 10, 0.45, 5) +
      art.blob(HD(sym([[0, 150], [-30, 160], [-24, 196], [0, 204]])), '#8a0a14', 0.7, 5));
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const x = lerp(-74, -26, t), y = lerp(150, 206, Math.pow(t, 0.8));
        const p = H([[sx < 0 ? x : -x, y]])[0];
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
    const pts = atk ? [[-90, 40, 12], [-80, 62, 14], [-68, 86, 16], [-58, 108, 30], [-44, 126, 15], [-26, 138, 12]] : [[-58, 82, 10], [-50, 106, 24], [-40, 126, 12], [-26, 139, 9]];
    for (const [x, y, l] of pts) {
      const X = HX + (sx < 0 ? x : -x) * hs, Y = HY + y * hs;
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
  figShade(art, 0.42, '#10020a', 0.35);
  art.layer('over');
  if (!atk) {
    for (const sx of [-1, 1]) {
      const n0 = H([[sx * 22, 124]])[0];
      const P = (pts) => pts.map(([x, y]) => [n0[0] + sx * x, n0[1] + y]);
      art.add(smokePlume(art, P([[4, 4], [30, 16], [70, 14], [104, -16], [104, -52], [80, -64], [70, -46]]), 7, 20, 0.62, sx < 0 ? 5 : 6));
      art.add(smokePlume(art, P([[8, 8], [40, 30], [90, 30], [130, 4], [150, -40], [150, -96], [170, -140]]), 8, 30, 0.42, sx < 0 ? 7 : 8));
      art.add(art.glow(HD([[sx * 12, 127, 1], [sx * 18, 122], [sx * 27, 119, 1], [sx * 21, 125]]), '#ffb050', '#ff5a10', [[7, 0.7], [2.5, 0.9]]));
    }
  } else {
    const m = H([[0, 176]])[0];
    art.add(fireJet(art, { x: m[0], y: m[1], len: 560, ang: 180, w0: 22, w1: 300, seed: 3, strands: 26, disp: 50 }));
    art.add(sparks(art, rng(77), 60, { x: 230, y: 400, w: 580, h: 370 }, 180, ['#fff6c0', '#ffd23a', '#ff9a1a', '#ff5a10'], [3, 12]));
    art.add(art.glow(HD(ell(0, 160, 34, 30, 14)), null, '#ffb020', [[22, 0.55], [9, 0.45]]));
  }
  return art.svg();
}

export const ART_FOES_B = {
  dragon: { w: 1024, h: 768, height: 6.0, frames: { idle: dragonFrame('idle'), attack: dragonFrame('attack') } },
};
