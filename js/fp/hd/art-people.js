// Obsidian Spire, modern first-person mode: painted illustrations of the
// people met on the road, as standalone SVG strings. Each one is rasterised
// once (Image -> canvas), run through the shared oil-paint pass (paint.js)
// and stood in the scene as a lit billboard; `hand` is the player's own
// sword hand, a screen overlay for the bottom-right corner (no world
// height), and there `attack` is the mid-swing frame. For people `attack`
// is a gesture.
//
// Shared style: painted, not inked. A warm key light from the upper left
// (#ffd9a0), deep warm shadows (#2a1a12) with warm light reflected from
// below, a cool rim from behind on the right (#9fc4ff), and lost-and-found
// edges: shadow-side contours dissolve, lit contours stay crisp. Forms are
// glazed from overlapping semi-transparent shapes and tapered brush strokes
// that follow folds, hair and feathers. Every id is prefixed `<key>-<frame>-`.

const OUT = '#1a1210';
const KEY = '#ffd9a0';
const RIM = '#9fc4ff';
const DEEP = '#2a1a12';

// ---------------------------------------------------------------- colour
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rgbOf(h) {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
function hexOf(c) {
  return `#${c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}
function mix(a, b, t) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return hexOf(A.map((v, i) => v + (B[i] - v) * t));
}
const lit = (c, t) => mix(c, KEY, t);
const dk = (c, t) => mix(c, DEEP, t);
const rimc = (c, t) => mix(c, RIM, t);
const f2 = (n) => (Math.round(n * 100) / 100).toString();

// ---------------------------------------------------------------- context
// One context per frame: collects <defs> and hands out prefixed ids.
function ctx(key, frame, w, h) {
  const pre = `${key}-${frame}-`;
  const defs = [];
  const seen = new Set();
  let n = 0;
  return {
    key, frame, w, h, defs,
    id: (s) => pre + s,
    uid: (p = 'u') => `${p}${n++}`,
    def(name, body) {
      if (!seen.has(name)) {
        seen.add(name);
        defs.push(body.replace(/@ID/g, pre + name));
      }
      return `url(#${pre}${name})`;
    },
  };
}

const stopStr = (stops) => stops.map(([o, col, op]) =>
  `<stop offset="${o}" stop-color="${col}"${op != null && op !== 1 ? ` stop-opacity="${op}"` : ''}/>`).join('');

// Linear gradient. v = [x1, y1, x2, y2] in bounding-box units unless user.
function L(c, v, stops, user = false) {
  const n = c.uid('g');
  return c.def(n, `<linearGradient id="@ID" x1="${v[0]}" y1="${v[1]}" x2="${v[2]}" y2="${v[3]}"${user ? ' gradientUnits="userSpaceOnUse"' : ''}>${stopStr(stops)}</linearGradient>`);
}
// Radial gradient. v = [cx, cy, r, fx, fy].
function R(c, v, stops, user = false) {
  const n = c.uid('g');
  const [cx, cy, r, fx = cx, fy = cy] = v;
  return c.def(n, `<radialGradient id="@ID" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}"${user ? ' gradientUnits="userSpaceOnUse"' : ''}>${stopStr(stops)}</radialGradient>`);
}

// Material gradients, all lit from the upper left.
function cyl(c, base, v = [0, 0.15, 1, 0.45], k = 1) {
  return L(c, v, [
    [0, dk(base, 0.25 * k)], [0.14, lit(base, 0.36 * k)], [0.34, lit(base, 0.12 * k)], [0.52, base],
    [0.66, dk(base, 0.36 * k)], [0.86, dk(base, 0.6 * k)], [1, rimc(dk(base, 0.45 * k), 0.45)],
  ]);
}
function ball(c, base, k = 1, f = [0.34, 0.3]) {
  return R(c, [0.5, 0.5, 0.62, f[0], f[1]], [
    [0, lit(base, 0.45 * k)], [0.38, lit(base, 0.1 * k)], [0.72, dk(base, 0.22 * k)], [1, dk(base, 0.58 * k)],
  ]);
}
function flat(c, base, v = [0, 0, 1, 1], k = 1) {
  return L(c, v, [[0, lit(base, 0.25 * k)], [0.5, base], [1, dk(base, 0.45 * k)]]);
}
// Polished steel: sky reflection above, dark horizon band, warm ground below.
function steel(c, v = [0, 0, 1, 1], k = 1) {
  return L(c, v, [
    [0, '#e9eef5'], [0.16, '#c3cbd6'], [0.34, mix('#7d8796', '#6d7684', 1 - k)], [0.46, '#3c4250'],
    [0.56, '#8a8f99'], [0.74, '#b9b2a8'], [0.9, '#6a6670'], [1, '#9db4d6'],
  ]);
}

// Filters: soft blur for painted shading (user-space region, so thin strokes survive).
function blur(c, sd) {
  const n = `b${String(sd).replace('.', '_')}`;
  return c.def(n, `<filter id="@ID" filterUnits="userSpaceOnUse" x="-600" y="-600" width="2200" height="2200"><feGaussianBlur stdDeviation="${sd}"/></filter>`);
}
function clipD(c, d, tf = '') {
  const n = c.uid('k');
  return c.def(n, `<clipPath id="@ID"><path d="${d}"${tf ? ` transform="${tf}"` : ''}/></clipPath>`);
}

// The figure filter. In order: the key light's falloff across the figure
// (a flat plane lit by a point light, multiplied in); form light that rounds
// the silhouette (a blurred-alpha height map lit from the upper left);
// warm light reflected up from the ground; lost edges (the shadow-side
// contours, lower right, are swapped for a softened copy while lit
// contours stay crisp); a cool rim on right-hand edges; a warm catch on
// upper-left edges; a faint grain. No outline. The region overhangs the
// canvas so figures cropped by its edges (the hand) keep a clean cut.
function figFilter(c, o = {}) {
  const { w, h } = c;
  const lx = o.lx ?? w * 0.2;
  const ly = o.ly ?? -h * 0.15;
  const lz = o.lz ?? h * 0.4;
  const kd = o.kd ?? 1.48;
  const fr = o.formBlur ?? 9;
  const fs = o.formScale ?? 7;
  const pad = 140;
  return c.def('fx', `<filter id="@ID" filterUnits="userSpaceOnUse" x="${-pad}" y="${-pad}" width="${w + 2 * pad}" height="${h + 2 * pad}" color-interpolation-filters="sRGB">
<feDiffuseLighting in="SourceAlpha" surfaceScale="0" diffuseConstant="${kd}" lighting-color="#fff2e2" result="lt"><fePointLight x="${lx}" y="${ly}" z="${lz}"/></feDiffuseLighting>
<feGaussianBlur in="SourceAlpha" stdDeviation="${fr}" result="hb"/>
<feDiffuseLighting in="hb" surfaceScale="${fs}" diffuseConstant="1.18" lighting-color="#fff0e0" result="fl"><feDistantLight azimuth="225" elevation="44"/></feDiffuseLighting>
<feComposite in="SourceGraphic" in2="lt" operator="arithmetic" k1="1" result="s1"/>
<feComposite in="s1" in2="fl" operator="arithmetic" k1="${o.formGain ?? 1.2}" result="s2"/>
<feDiffuseLighting in="SourceAlpha" surfaceScale="0" diffuseConstant="${o.bounce ?? 0.55}" lighting-color="#ff9a52" result="rl"><fePointLight x="${w * 0.55}" y="${h * 1.08}" z="${h * 0.16}"/></feDiffuseLighting>
<feComposite in="rl" in2="SourceAlpha" operator="in" result="rl2"/>
<feComposite in="s2" in2="rl2" operator="arithmetic" k2="1" k3="0.2" result="lit"/>
<feOffset in="SourceAlpha" dx="-3.5" dy="-3" result="ao"/>
<feComposite in="SourceAlpha" in2="ao" operator="out" result="band0"/>
<feGaussianBlur in="band0" stdDeviation="2.2" result="band"/>
<feGaussianBlur in="lit" stdDeviation="${o.lost ?? 1.7}" result="soft"/>
<feComposite in="lit" in2="band" operator="out" result="crisp"/>
<feComposite in="soft" in2="band" operator="in" result="softb"/>
<feComposite in="crisp" in2="softb" operator="arithmetic" k2="1" k3="1" result="lost"/>
<feOffset in="SourceAlpha" dx="-4" dy="1" result="o1"/>
<feComposite in="SourceAlpha" in2="o1" operator="out" result="r1"/>
<feGaussianBlur in="r1" stdDeviation="1.4" result="r2"/>
<feFlood flood-color="${RIM}" flood-opacity="${o.rim ?? 0.7}"/><feComposite in2="r2" operator="in" result="rim"/>
<feOffset in="SourceAlpha" dx="3" dy="3" result="o2"/>
<feComposite in="SourceAlpha" in2="o2" operator="out" result="k1"/>
<feGaussianBlur in="k1" stdDeviation="1.2" result="k2"/>
<feFlood flood-color="${KEY}" flood-opacity="0.34"/><feComposite in2="k2" operator="in" result="keyl"/>
<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="nz"/>
<feColorMatrix in="nz" type="matrix" values="1.7 0 0 0 -0.32  1.7 0 0 0 -0.34  1.7 0 0 0 -0.36  0 0 0 0 ${o.grain ?? 0.025}" result="gr"/>
<feComposite in="gr" in2="SourceAlpha" operator="in" result="grain"/>
<feComposite in="rim" in2="SourceAlpha" operator="in" result="rim2"/>
<feComposite in="keyl" in2="SourceAlpha" operator="in" result="key2"/>
<feMerge><feMergeNode in="lost"/><feMergeNode in="key2"/><feMergeNode in="rim2"/><feMergeNode in="grain"/></feMerge>
</filter>`);
}

function wrap(c, fig, { under = '', over = '', fx: fo = {} } = {}) {
  const fx = figFilter(c, fo);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}"><defs>${c.defs.join('')}</defs>${under}<g filter="${fx}">${fig}</g>${over}</svg>`;
}

// ---------------------------------------------------------------- primitives
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
// Soft painted shape (fill, opacity, blur).
function S(c, d, col, op = 1, b = 0) {
  return `<path d="${d}" fill="${col}"${op !== 1 ? ` opacity="${op}"` : ''}${b ? ` filter="${blur(c, b)}"` : ''}/>`;
}
function E(c, cx, cy, rx, ry, col, op = 1, b = 0, rot = 0) {
  return `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(ry)}" fill="${col}"${op !== 1 ? ` opacity="${op}"` : ''}${b ? ` filter="${blur(c, b)}"` : ''}${rot ? ` transform="rotate(${rot} ${f2(cx)} ${f2(cy)})"` : ''}/>`;
}
// Stroke line.
function Ln(c, d, col, w = 1, op = 1, b = 0, extra = '') {
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${op !== 1 ? ` opacity="${op}"` : ''}${b ? ` filter="${blur(c, b)}"` : ''}${extra}/>`;
}
// Base shape + shading clipped to it.
function part(c, d, fill, shade = '', extra = '') {
  return P(d, fill, extra) + (shade ? `<g clip-path="${clipD(c, d)}">${shade}</g>` : '');
}
const G = (tf, inner, extra = '') => `<g transform="${tf}"${extra}>${inner}</g>`;

// A closed path symmetric about x=0: the right half as cubic segments from
// `start`, then the same segments mirrored back.
function mirrorPath(start, segs) {
  let d = `M${f2(start[0])} ${f2(start[1])}`;
  for (const q of segs) d += ` C${q.map(f2).join(' ')}`;
  const pts = [start, ...segs.map((q) => [q[4], q[5]])];
  for (let i = segs.length - 1; i >= 0; i--) {
    const q = segs[i];
    const p0 = pts[i];
    d += ` C${f2(-q[2])} ${f2(q[3])} ${f2(-q[0])} ${f2(q[1])} ${f2(-p0[0])} ${f2(p0[1])}`;
  }
  return `${d}Z`;
}

// ---------------------------------------------------------------- faces
// A head in local coordinates: crown y=-46, eye line y=0, chin y=+47,
// cheekbones at x=+-36. Options pick skin, eyes, expression and age.
// A painted eye, side 1 = the figure's left (viewer's right). Built to
// survive the paint pass: a dark socket mass, a dim eye opening mostly
// filled by a large iris, a heavy upper lid with its cast shadow, and a
// catchlight big enough to keep.
function eyeShape(c, side, o) {
  const op = o.open ?? 1;
  const lo = o.low ?? 1;
  const iris = o.iris;
  const gz = (o.gaze ?? 0) * side;
  const sk = o.skin;
  const shade = side > 0 ? 1 : 0.8;
  const white = `M-9 1 C-6 ${f2(-4.8 * op)} 3 ${f2(-6.2 * op)} 9.6 0.4 C5 ${f2(3.6 * lo)} -3 ${f2(4.2 * lo)} -9 1Z`;
  const ck = clipD(c, white);
  const ir = 4.9 * (o.irisR ?? 1);
  let s = '';
  // socket: brow ridge shadow and the hollow around the eye
  s += E(c, 0.5, -1.5, 13.5, 9.5, dk(sk, 0.62), 0.5 * shade, 2.6);
  s += E(c, 1, -2.5, 10.5, 6.5, dk(sk, 0.75), 0.45 * shade, 1.6);
  // eye opening: a dim, warm white, darker under the lid
  s += P(white, L(c, [0, 0, 0, 1], [[0, mix(sk, '#6a5a52', 0.5)], [0.55, mix('#d6cabd', sk, 0.25)], [1, mix('#e0d6c8', sk, 0.2)]]));
  s += `<g clip-path="${ck}">`;
  s += `<circle cx="${f2(gz)}" cy="-0.2" r="${f2(ir)}" fill="${R(c, [0.5, 0.5, 0.5, 0.55, 0.75], [[0, lit(iris, 0.35)], [0.55, dk(iris, 0.1)], [0.85, dk(iris, 0.55)], [1, dk(iris, 0.8)]])}"/>`;
  s += `<circle cx="${f2(gz)}" cy="-0.2" r="${f2(ir * 0.45)}" fill="#160c0a"/>`;
  s += S(c, `M-11 -9 L11 -9 L11 ${f2(-0.6 * op)} C3 ${f2(-2.6 * op)} -4 ${f2(-1.8 * op)} -11 1.2Z`, dk(sk, 0.75), 0.7, 1);
  s += `</g>`;
  // heavy upper lid and its crease
  s += Ln(c, `M-9.4 1.2 C-6 ${f2(-5.2 * op)} 3 ${f2(-6.8 * op)} 10 0.6`, mix(dk(sk, 0.85), '#1c0e0a', 0.5), 2.8);
  s += Ln(c, `M-8 ${f2(-6.4 * op - 2.4)} C-3 ${f2(-9.8 * op - 2.4)} 4 ${f2(-10.2 * op - 2.4)} 9.6 ${f2(-4.6 * op - 2)}`, dk(sk, 0.6), 2.2, 0.5, 0.8);
  // lit lid skin above the crease, catching the key light
  s += E(c, -1, -9.5 * op - 2, 7, 2.6, lit(sk, 0.45), 0.5 * (2 - shade), 1.4);
  // catchlight and lit lower lid rim
  s += `<circle cx="${f2(gz - 1.8 * side)}" cy="-2" r="2" fill="#fff6e8" opacity="0.95"/>`;
  s += Ln(c, `M-6 3.4 C-2 ${f2(5.2 * lo)} 4 ${f2(5 * lo)} 8 2`, lit(sk, 0.35), 1.6, 0.45, 0.4);
  s += Ln(c, `M-5 ${f2(6 * lo + 1.5)} C-1 ${f2(7.8 * lo + 1.5)} 4 ${f2(7.4 * lo + 1.5)} 7.4 ${f2(4.6 * lo + 1.5)}`, dk(sk, 0.4), 2, 0.25 + 0.35 * (o.age ?? 0), 1);
  return s;
}

function brow(c, o, rot) {
  const t = o.browW ?? 1;
  const d = `M-10 ${f2(-8 + 1.5 * (t - 1))} C-5 ${f2(-12.5 - 1.5 * t)} 4 ${f2(-13 - t)} 12 -9 C5 ${f2(-10.4 - 0.4 * t)} -3 -10.2 -10 ${f2(-7 + 2.2 * (t - 1))}Z`;
  let s = S(c, d, o.brow, 1, 0.35) + S(c, d, o.brow, 0.6, 1.2);
  if (t > 1.2) {
    for (let i = 0; i < 7; i++) {
      const x = -9 + i * 3;
      s += Ln(c, `M${x} ${-9 - t} q${2.5} ${-2 - (i % 2)} ${5} ${-0.5}`, lit(o.brow, 0.25), 0.9, 0.7);
    }
  }
  return G(`rotate(${rot} 0 -10)`, s);
}

function face(c, o) {
  const skin = o.skin;
  const Sd = dk(skin, 0.38);
  const Sdd = dk(skin, 0.6);
  const Sl = lit(skin, 0.42);
  const jw = 30 * (o.jaw ?? 1);
  const cw = 36 * (o.cheek ?? 1);
  const cl = o.chin ?? 47;
  const sq = o.square ?? 0;
  const cwd = 8 + 6 * sq;
  const head = mirrorPath([0, -46], [
    [20, -46, cw, -36, cw, -18], [cw, -6, cw - 0.5, 4, cw - 1.6, 11], [cw - 2.6, 19, jw + 2, 25, jw, 31 - 2 * sq],
    [jw - 2 - 3 * sq, 38 + 2 * sq, cwd + 9, cl - 3, cwd, cl - 0.6], [cwd - 4, cl, 2, cl, 0, cl]]);
  const expr = o.expr || 'neutral';
  let s = '';
  // ears
  if (o.ears !== false) {
    for (const side of [-1, 1]) {
      const ear = `M${side * (cw - 3)} -7 C${side * (cw + 6)} -13 ${side * (cw + 10)} -2 ${side * (cw + 7)} 9 C${side * (cw + 5)} 18 ${side * (cw + 1)} 21 ${side * (cw - 3)} 18Z`;
      s += part(c, ear, side < 0 ? lit(skin, 0.1) : dk(skin, 0.25),
        E(c, side * (cw + 3.5), 3, 2.6, 6.5, Sdd, 0.55, 1.2) + E(c, side * (cw + 6), -3, 2, 4, Sl, side < 0 ? 0.5 : 0.15, 1));
    }
  }
  // head base and painted shading
  let sh = '';
  sh += E(c, cw * 0.98, 4, 19, 58, Sdd, o.shadow ?? 0.62, 6);
  sh += E(c, -cw * 1.02, -6, 8, 30, Sd, 0.35, 5);
  sh += E(c, -cw * 0.45, -28, 18, 10, Sl, 0.5, 6);
  sh += E(c, -14, -3, 13, 7.5, Sd, 0.5, 2.6);
  sh += E(c, 14, -3, 13, 7.5, Sd, 0.6, 2.6);
  sh += E(c, -21, 8, 9, 5, Sl, 0.4, 3);
  sh += E(c, 22, 8, 7, 4, Sl, 0.14, 3);
  sh += E(c, 25, 24, 8, 12, Sdd, 0.3, 5);
  sh += E(c, -31, -16, 6, 10, Sd, 0.25, 4);
  sh += E(c, -19, 13, 9, 6, o.blushCol || '#c95a4a', o.blush ?? 0.2, 3.5);
  sh += E(c, 19, 13, 9, 6, o.blushCol || '#c95a4a', (o.blush ?? 0.2) * 0.8, 3.5);
  sh += E(c, -3, cl - 6, 8, 3.5, Sl, 0.3, 2);
  sh += E(c, 0, 37, 7, 2.2, Sdd, 0.3, 1.5);
  sh += E(c, 0, cl + 2, jw * 0.9, 6, Sdd, 0.45, 4);
  if (o.age) {
    const a = o.age;
    sh += Ln(c, 'M-16 -29 C-6 -31.5 6 -31.5 16 -29', Sd, 1, 0.35 * a, 0.5);
    sh += Ln(c, 'M-13 -24 C-5 -26 5 -26 13 -24', Sd, 0.9, 0.3 * a, 0.5);
    sh += Ln(c, 'M-24 0 l-4 -2 M-24 3 l-4.5 0.5 M24 0 l4 -2 M24 3 l4.5 0.5', Sd, 0.8, 0.45 * a, 0.3);
    sh += Ln(c, 'M-12 6 C-8 8.5 -3 8 -1 6.5 M12 6 C8 8.5 3 8 1 6.5', Sd, 1, 0.35 * a, 0.6);
  }
  if (o.stubble) {
    const sd = `M-${jw + 3} 10 C-${jw - 2} 36 -12 ${cl + 2} 0 ${cl + 2} C12 ${cl + 2} ${jw - 2} 36 ${jw + 3} 10 C${jw - 4} 22 16 19 9 21 C5 24.5 -5 24.5 -9 21 C-16 19 -${jw - 4} 22 -${jw + 3} 10Z`;
    const dots = c.def('stub', `<pattern id="@ID" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.55" fill="${o.stubble}"/><circle cx="3.6" cy="2.4" r="0.5" fill="${o.stubble}"/><circle cx="2" cy="4" r="0.45" fill="${o.stubble}"/><circle cx="4.4" cy="4.6" r="0.4" fill="${o.stubble}"/></pattern>`);
    sh += S(c, sd, o.stubble, 0.4, 1.8) + S(c, sd, dots, 0.75, 0.3);
  }
  if (o.scar) sh += Ln(c, 'M-24 -16 C-21 -6 -19 6 -15 20', '#e9b4a0', 1.6, 0.85) + Ln(c, 'M-23 -15 C-20 -5 -18 7 -14.4 20', '#7a3a32', 0.8, 0.6);
  if (o.glow) sh += E(c, o.glow[0], o.glow[1], o.glow[2], o.glow[2] * 1.3, o.glow[3], o.glow[4], 10);
  s += part(c, head, R(c, [0.42, 0.42, 0.68, 0.32, 0.28], [[0, lit(skin, 0.5)], [0.36, skin], [0.72, dk(skin, 0.22)], [1, dk(skin, 0.5)]]), sh);
  // eyes
  const open = { neutral: 0.95, kind: 0.86, grin: 0.66, stern: 0.74, shout: 0.95, smile: 0.78 }[expr] ?? 1;
  const low = { grin: 0.62, smile: 0.72, kind: 0.85 }[expr] ?? 1;
  const eo = { skin, iris: o.iris, open: o.open ?? open, low, gaze: o.gaze, lash: o.lash, lashes: o.lashes, age: o.age };
  s += G('translate(-14.5 0) scale(-1.1 1.1)', eyeShape(c, -1, eo));
  s += G('translate(14.5 0) scale(1.1)', eyeShape(c, 1, eo));
  // brows
  const br = { neutral: 0, kind: 7, grin: 6, stern: -12, shout: -20, smile: 4 }[expr] ?? 0;
  const by = { grin: -2.5, smile: -1.5, kind: -1, shout: 2.4, stern: 1.2 }[expr] ?? 0;
  const bo = { brow: o.brow, browW: o.browW };
  s += G(`translate(-14 ${by}) scale(-1 1)`, brow(c, bo, br + (o.browTilt || 0)));
  s += G(`translate(14 ${by})`, brow(c, bo, br - (o.browTilt || 0)));
  if (expr === 'stern' || expr === 'shout') s += Ln(c, 'M-3.4 -13 L-2 -6 M3.4 -13 L2 -6', Sdd, 1.3, expr === 'shout' ? 0.7 : 0.5, 0.6) + Ln(c, 'M-10 -21 C-4 -23 4 -23 10 -21', Sd, 1, expr === 'shout' ? 0.5 : 0.25, 0.5);
  // nose
  const nw = o.noseW ?? 1;
  const nose = o.noseCol || skin;
  const nd = `M-3 -6 C-3.4 2 -4.6 8 ${f2(-6.2 * nw)} 13 C${f2(-9 * nw)} 14.5 ${f2(-9.6 * nw)} 19 ${f2(-6.6 * nw)} 20.6 C${f2(-4.6 * nw)} 22.6 -2 21.8 0 22.4 C2 21.8 ${f2(4.6 * nw)} 22.6 ${f2(6.6 * nw)} 20.6 C${f2(9.6 * nw)} 19 ${f2(9 * nw)} 14.5 ${f2(6.2 * nw)} 13 C4.6 8 3.4 2 3 -6Z`;
  s += S(c, nd, L(c, [0, 0, 1, 0.25], [[0, lit(nose, 0.3)], [0.35, nose], [0.62, dk(nose, 0.2)], [1, dk(nose, 0.5)]]), 0.9, 0.7);
  s += E(c, 0, 15.5, 5 * nw, 4.4, R(c, [0.5, 0.5, 0.6, 0.35, 0.3], [[0, lit(nose, 0.35)], [0.6, nose], [1, dk(nose, 0.3)]]), 1, 0.4);
  s += E(c, -5.4 * nw, 18.6, 3.2 * nw, 2.7, dk(nose, 0.08)) + E(c, 5.4 * nw, 18.6, 3.2 * nw, 2.7, dk(nose, 0.22));
  s += Ln(c, `M3 -5 C5 3 5.6 9 ${f2(6.8 * nw)} 14.6 C${f2(5.4 * nw)} 18.6 3.6 19.4 2.4 19.6`, Sdd, 4.2, 0.6, 1.6);
  s += Ln(c, `M-4.4 -4 C-5.4 3 -6 8 ${f2(-6.4 * nw)} 13`, Sd, 2.4, 0.35, 1.4);
  s += Ln(c, 'M-1.4 -4 C-2 4 -2.3 9.5 -1.8 13.5', Sl, 2.6, 0.65, 1);
  s += Ln(c, `M${f2(-8.4 * nw)} 17 C${f2(-8.8 * nw)} 20 ${f2(-7 * nw)} 22 ${f2(-4 * nw)} 21.6 M${f2(8.4 * nw)} 17 C${f2(8.8 * nw)} 20 ${f2(7 * nw)} 22 ${f2(4 * nw)} 21.6`, Sdd, 1.1, 0.6, 0.4);
  s += E(c, -1.4, 14.2, 1.9, 1.4, '#fff3de', 0.6, 0.6);
  s += E(c, 1.4, 23, 8 * nw, 2.8, Sdd, 0.7, 1.4);
  s += E(c, -4 * nw, 20.4, 2 * nw, 1.1, '#3a1a14', 0.8) + E(c, 4 * nw, 20.4, 2 * nw, 1.1, '#3a1a14', 0.85);
  // mouth
  const lip = o.lip || mix(skin, '#b0504a', 0.45);
  const ml = '#4a1c16';
  if (expr === 'grin') {
    const out = 'M-14 28 C-6 30.6 6 30.6 14 28 C11 37.5 5.4 41.5 0 41.5 C-5.4 41.5 -11 37.5 -14 28Z';
    s += P(out, '#3a1012');
    s += `<g clip-path="${clipD(c, out)}">`;
    s += P('M-13 28.4 C-6 31 6 31 13 28.4 L12 32.6 C6 34.6 -6 34.6 -12 32.6Z', L(c, [0, 0, 0, 1], [[0, '#fbf3e4'], [1, '#cdbfae']]));
    s += Ln(c, 'M-6 30.4 L-6.2 33.8 M-2 30.9 L-2 34.3 M2 30.9 L2 34.3 M6 30.4 L6.2 33.8', '#a89684', 0.5, 0.6);
    s += E(c, 0, 40, 7, 3, '#a6383c');
    s += '</g>';
    s += S(c, 'M-11 37 C-6 43.6 6 43.6 11 37 C6 41.6 -6 41.6 -11 37Z', lip);
    s += Ln(c, 'M-15 27.4 C-15.6 25 -17.4 23 -19 22 M15 27.4 C15.6 25 17.4 23 19 22', Sd, 1.3, 0.6, 0.6);
    s += Ln(c, 'M-12 21 C-16 24 -17.5 28 -16 32 M12 21 C16 24 17.5 28 16 32', Sd, 1.6, 0.35, 1);
    s += E(c, -19, 17, 6, 4, Sl, 0.4, 2) + E(c, 19, 17, 6, 4, Sl, 0.25, 2);
  } else if (expr === 'shout') {
    const out = 'M-13 29.4 C-7 26 7 26 13 29.4 C13.6 33 12.4 38 11 41.4 C7 43.6 -7 43.6 -11 41.4 C-12.4 38 -13.6 33 -13 29.4Z';
    s += P(out, R(c, [0.5, 0.65, 0.65], [[0, '#1a0606'], [1, '#4a1414']]));
    s += `<g clip-path="${clipD(c, out)}">`;
    s += P('M-12 27.6 C-6 25.8 6 25.8 12 27.6 L11 31.2 C6 32.4 -6 32.4 -11 31.2Z', L(c, [0, 0, 0, 1], [[0, '#f2e8d6'], [1, '#bfae9a']]));
    s += Ln(c, 'M-6.4 26.6 L-6.6 32 M-2.2 26.2 L-2.2 32.4 M2.2 26.2 L2.2 32.4 M6.4 26.6 L6.6 32', '#8a7866', 0.5, 0.6);
    s += P('M-11 43 C-7 39.4 7 39.4 11 43 L11 46 L-11 46Z', L(c, [0, 0, 0, 1], [[0, '#d8cab4'], [1, '#9a8a76']]));
    s += E(c, 0, 39.6, 6, 2.2, '#7a2a2e', 0.8);
    s += '</g>';
    s += S(c, 'M-14 28.6 C-7 24.4 7 24.4 14 28.6 C7 26 -7 26 -14 28.6Z', dk(lip, 0.2));
    s += S(c, 'M-10 41.6 C-5 45.6 5 45.6 10 41.6 C5 43.4 -5 43.4 -10 41.6Z', lip);
    s += Ln(c, 'M-11 19 C-16 23 -17.6 29 -15 35 M11 19 C16 23 17.6 29 15 35', Sdd, 1.8, 0.55, 0.9);
    s += Ln(c, 'M-15 37 C-12 44 -8 48 -3 50 M15 37 C12 44 8 48 3 50', Sd, 1.4, 0.35, 1);
  } else {
    const up = { smile: 2.2, kind: 1, stern: -1, neutral: 0 }[expr] ?? 0;
    s += S(c, 'M-10 31 C-6 28.4 -2 28.6 0 29.5 C2 28.6 6 28.4 10 31 C5 31.8 -5 31.8 -10 31Z', dk(lip, 0.2), 1, 0.3);
    s += S(c, 'M-8.4 31.6 C-4 36 4 36 8.4 31.6 C4 32.6 -4 32.6 -8.4 31.6Z', lip, 1, 0.3);
    s += E(c, -1, 33.6, 3.6, 1, Sl, 0.45, 0.5);
    s += Ln(c, `M-10.6 ${f2(31 - up)} C-5 ${f2(32 + up * 0.5)} 5 ${f2(32 + up * 0.5)} 10.6 ${f2(31 - up)}`, ml, 1.3, 0.9);
    if (up > 0) s += Ln(c, 'M-11 21 C-14.5 24 -15.5 28 -14 31.5 M11 21 C14.5 24 15.5 28 14 31.5', Sd, 1.3, 0.3, 0.9);
  }
  // chiaroscuro: a shadow plane with a defined terminator down the far side
  // of the face, the nose's cast shadow, warm reflected light under the jaw,
  // and the lit planes of brow, cheekbone and chin.
  let cs = '';
  const term = `M${f2(cw * 0.3)} -48 C${f2(cw * 0.18)} -30 ${f2(cw * 0.32)} -14 8 -4 C10 6 9 14 11 22 C13 30 ${f2(jw * 0.5)} 40 ${f2(jw * 0.3)} ${cl + 4} L${cw + 12} ${cl + 4} L${cw + 12} -48Z`;
  cs += S(c, term, mix(dk(skin, 0.6), '#3a1c10', 0.3), o.plane ?? 0.42, 2.4);
  cs += S(c, 'M4 18 C10 21 14 24 15 30 C10 28 6 25 3 22Z', dk(skin, 0.7), 0.4, 1.6);
  cs += E(c, cw * 0.62, 30, 10, 9, '#ff9a60', 0.16, 4);
  cs += E(c, -cw * 0.52, -30, 15, 9, lit(skin, 0.7), 0.3, 4);
  cs += E(c, -cw * 0.58, 6, 9, 6, lit(skin, 0.6), 0.32, 3);
  cs += E(c, -4, cl - 7, 7, 4, lit(skin, 0.6), 0.26, 2);
  cs += E(c, 0, -14, 9, 3, lit(skin, 0.5), 0.25, 2);
  s += `<g clip-path="${clipD(c, head)}">${cs}</g>`;
  return s;
}

// Simple painted hand pieces.
function finger(c, x1, y1, x2, y2, w, skin) {
  const d = `M${f2(x1)} ${f2(y1)} L${f2(x2)} ${f2(y2)}`;
  return Ln(c, d, dk(skin, 0.35), w + 1.2) + Ln(c, d, skin, w) + Ln(c, d, lit(skin, 0.35), w * 0.35, 0.55, 0.5);
}

// Gold coin with a raised rim and a little crown device.
function coin(c, x, y, r, tilt = 0.86) {
  let s = '';
  s += E(c, x, y, r, r * tilt, R(c, [0.5, 0.5, 0.6, 0.35, 0.3], [[0, '#fff3b0'], [0.4, '#f0c040'], [0.8, '#b07818'], [1, '#6a4008']]));
  s += E(c, x, y, r * 0.74, r * 0.74 * tilt, R(c, [0.5, 0.5, 0.6, 0.65, 0.7], [[0, '#ffe68a'], [0.6, '#d9a02c'], [1, '#8a5a10']]));
  s += Ln(c, `M${f2(x - r * 0.34)} ${f2(y + r * 0.18)} l${f2(r * 0.1)} ${f2(-r * 0.36)} l${f2(r * 0.16)} ${f2(r * 0.2)} l${f2(r * 0.16)} ${f2(-r * 0.3)} l${f2(r * 0.16)} ${f2(r * 0.3)} l${f2(r * 0.16)} ${f2(-r * 0.2)} l${f2(r * 0.1)} ${f2(r * 0.36)}z`, '#8a5a12', r * 0.08, 0.8);
  s += E(c, x - r * 0.38, y - r * 0.4 * tilt, r * 0.28, r * 0.14, '#fffbe0', 0.85, r * 0.06, -35);
  return s;
}

// Four-point glint, drawn outside the figure filter.
function glint(x, y, r, col = '#fff6d8', op = 0.95) {
  return `<path d="M${x} ${y - r} Q${x + r * 0.12} ${y - r * 0.12} ${x + r} ${y} Q${x + r * 0.12} ${y + r * 0.12} ${x} ${y + r} Q${x - r * 0.12} ${y + r * 0.12} ${x - r} ${y} Q${x - r * 0.12} ${y - r * 0.12} ${x} ${y - r}Z" fill="${col}" opacity="${op}"/>`;
}


// A beard (or long hair) built from overlapping tapered locks. Outer locks
// are drawn first so the centre ones sit on top.
function beardLocks(c, o) {
  const { cx, y0, y1, w, n = 9, seed = 1, curl = 1 } = o;
  const [hi, mid, lo] = o.cols;
  let s = '';
  const idx = [...Array(n).keys()].sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
  for (const i of idx) {
    const t = i / (n - 1) - 0.5;
    const xt = cx + t * 2 * w;
    const yt = y0 + Math.abs(t) * (o.drop ?? 8);
    const lw = ((2 * w) / n) * 2.1;
    const xb = cx + t * 2 * w * (o.taper ?? 0.45) + Math.sin(i * 2.3 + seed) * 3 * curl;
    const yb = y1 - Math.abs(t) * 2 * (y1 - y0) * (o.short ?? 0.4) + Math.cos(i * 1.7 + seed) * 5;
    const bl = t * 18 * curl;
    const h = yb - yt;
    const d = `M${f2(xt - lw / 2)} ${f2(yt)} C${f2(xt - lw / 2 + bl)} ${f2(yt + h * 0.5)} ${f2(xb - lw * 0.3)} ${f2(yb - h * 0.2)} ${f2(xb)} ${f2(yb)} C${f2(xb + lw * 0.25)} ${f2(yb - h * 0.25)} ${f2(xt + lw / 2 + bl)} ${f2(yt + h * 0.5)} ${f2(xt + lw / 2)} ${f2(yt)}Z`;
    const shade = t > 0.1 ? lo : mid;
    s += part(c, d, L(c, [0, 0, 1, 1], [[0, hi], [0.55, shade], [1, lo]]),
      Ln(c, `M${f2(xt - lw * 0.15)} ${f2(yt + 6)} C${f2(xt - lw * 0.15 + bl)} ${f2(yt + h * 0.5)} ${f2(xb - lw * 0.2)} ${f2(yb - h * 0.25)} ${f2(xb - 1)} ${f2(yb - 6)}`, hi, 1.3, 0.7) +
      Ln(c, `M${f2(xt + lw * 0.3)} ${f2(yt + 4)} C${f2(xt + lw * 0.3 + bl)} ${f2(yt + h * 0.5)} ${f2(xb + lw * 0.1)} ${f2(yb - h * 0.3)} ${f2(xb + 1)} ${f2(yb - 10)}`, lo, 1.4, 0.6, 0.6));
  }
  return s;
}

// Catmull-Rom samples through points, and a tapered ribbon along them
// (width from a function of t in 0..1): feathers, plumes, streaks.
function spline(pts, n = 12) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function ribbon(pts, wfn, n = 12) {
  const c = spline(pts, n);
  const A = [];
  const B = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(c.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const w = wfn(i / (c.length - 1)) / 2;
    A.push([c[i][0] - dy * w, c[i][1] + dx * w]);
    B.push([c[i][0] + dy * w, c[i][1] - dx * w]);
  }
  return `M${A.map((p) => p.map(f2).join(' ')).join(' L')} L${B.reverse().map((p) => p.map(f2).join(' ')).join(' L')}Z`;
}
const polyD = (pts) => `M${pts.map((p) => p.map(f2).join(' ')).join(' L')}`;

// ---------------------------------------------------------------- brushwork
// A small seeded random generator so the brushwork is stable between loads.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// One tapered brush stroke through points (wider in the middle).
function brush(c, pts, w, col, op = 0.5, b = 0.8) {
  return S(c, ribbon(pts, (t) => w * Math.sin(Math.PI * (0.08 + 0.84 * t)) ** 0.7, 5), col, op, b);
}
// An irregular glaze patch: a lumpy blob of semi-transparent colour.
function glazeBlob(c, cx, cy, rx, ry, col, op, seed, b = 3) {
  const r = rng(seed);
  const n = 9;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.72 + r() * 0.5;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  pts.push(pts[0], pts[1], pts[2]);
  return S(c, `${polyD(spline(pts, 4).slice(4, 4 + n * 4))}Z`, col, op, b);
}
// Drapery brushwork over a box: strokes running down the folds (angle in
// degrees from vertical), lights on the lit side, darks toward the right,
// plus a few glaze patches. Meant to be clipped to a cloth shape.
function drape(c, box, base, seed, o = {}) {
  const [x0, y0, x1, y1] = box;
  const r = rng(seed);
  const n = o.n ?? Math.round(((x1 - x0) * (y1 - y0)) / 1800);
  const ang = ((o.angle ?? 0) * Math.PI) / 180;
  const len = o.len ?? (y1 - y0) * 0.45;
  let s = '';
  for (let i = 0; i < Math.round(n * 0.35); i++) {
    const cx = x0 + r() * (x1 - x0);
    const cy = y0 + r() * (y1 - y0);
    const t = (cx - x0) / (x1 - x0);
    s += glazeBlob(c, cx, cy, 14 + r() * 22, 18 + r() * 30, t < 0.45 ? lit(base, 0.35) : dk(base, 0.45), 0.16 + r() * 0.12, seed * 31 + i, 4);
  }
  for (let i = 0; i < n; i++) {
    const cx = x0 + r() * (x1 - x0);
    const cy = y0 + r() * (y1 - y0);
    const t = (cx - x0) / (x1 - x0);
    const l = len * (0.5 + r() * 0.7);
    const a = ang + (r() - 0.5) * 0.25 + (o.fan ?? 0) * (t - 0.5);
    const bend = (r() - 0.5) * 12;
    const dx = Math.sin(a) * l * 0.5;
    const dy = Math.cos(a) * l * 0.5;
    const pts = [[cx - dx, cy - dy], [cx + bend, cy], [cx + dx, cy + dy]];
    const light = r() < 0.75 - t * 0.6;
    const col = light ? lit(base, 0.3 + r() * 0.35) : dk(base, 0.3 + r() * 0.4);
    s += brush(c, pts, (o.w ?? 7) * (0.7 + r() * 0.7), col, light ? 0.22 + r() * 0.2 : 0.25 + r() * 0.2, 0.9);
  }
  return s;
}

// A fist around a vertical pole through (0,0), knuckles toward the viewer:
// four finger rolls stacked down, the thumb wrapped over the top.
function gripFist(c, base, o = {}) {
  let s = '';
  const sh = o.metal ? 0.6 : 0.45;
  s += part(c, 'M-15 -15 C-17 0 -16 14 -12 23 L11 23 C15 14 16 0 15 -15Z', dk(base, 0.4));
  const bands = [[-14, 14, -9, 9.6], [-15, 15, 0.2, 9.6], [-14.5, 14, 9.2, 9.2], [-12.5, 11.5, 17.6, 8]];
  for (const [x1, x2, y, h] of bands) {
    const t = y - h / 2;
    const b = y + h / 2;
    const d = `M${x1} ${f2(t)} C${x1 + 8} ${f2(t - 2)} ${x2 - 8} ${f2(t - 2)} ${x2} ${f2(t)} C${x2 + 3} ${f2(y)} ${x2 + 2} ${f2(b)} ${x2 - 2} ${f2(b)} L${x1 + 2} ${f2(b)} C${x1 - 2} ${f2(b)} ${x1 - 3} ${f2(y)} ${x1} ${f2(t)}Z`;
    s += part(c, d, L(c, [0, 0, 0.25, 1], [[0, lit(base, 0.4)], [0.45, base], [1, dk(base, sh)]]),
      E(c, x2 - 1, y + 1, 6, h * 0.9, DEEP, 0.45, 2) + E(c, x1 + 7, t + 2, 5, 1.6, lit(base, 0.7), o.metal ? 0.9 : 0.5, 0.8));
  }
  s += part(c, 'M-18 -13 C-19 -20 -12 -23 -4 -20.5 L8 -17 C13 -15 13 -8.5 7.5 -7.5 L-10 -8.2 C-15.5 -8.4 -17.8 -10.6 -18 -13Z', cyl(c, base, [0, 0, 0, 1]),
    E(c, -6, -18, 8, 2, lit(base, 0.7), o.metal ? 0.9 : 0.5, 1));
  return s;
}

// A steel gauntlet gripping a vertical pole through (0,0): articulated
// finger lames with rivets, the thumb over the top, a flared cuff above.
function gauntletGrip(c, cuffRot = 0) {
  const sv = L(c, [0, 0, 0, 1], [[0, '#f6f8fc'], [0.2, '#c4ccd8'], [0.45, '#6e7686'], [0.62, '#323744'], [0.82, '#7e8494'], [0.94, '#c8b0a0'], [1, '#9db4d8']]);
  let s = '';
  // cuff flaring up toward the forearm
  s += G(`rotate(${cuffRot})`, part(c, 'M-16 -14 C-18 -24 -22 -34 -27 -44 L27 -44 C22 -34 18 -24 16 -14Z', plate(c), Ln(c, 'M-20 -30 L20 -30', '#1e2028', 1.4, 0.7) + Ln(c, 'M-26 -42 L26 -42', '#e8b844', 2.4)));
  s += part(c, 'M-15 -15 C-17 0 -16 14 -12 23 L11 23 C15 14 16 0 15 -15Z', '#2a2e38');
  const bands = [[-14, 14, -9, 9.6], [-15, 15, 0.2, 9.6], [-14.5, 14, 9.2, 9.2], [-12.5, 11.5, 17.6, 8]];
  for (const [x1, x2, y, h] of bands) {
    const t = y - h / 2;
    const b = y + h / 2;
    for (const [a0, a1] of [[x1, x1 + (x2 - x1) * 0.42], [x1 + (x2 - x1) * 0.38, x2]]) {
      const d = `M${f2(a0 + 2)} ${f2(t)} L${f2(a1 - 2)} ${f2(t)} C${f2(a1 + 1)} ${f2(t)} ${f2(a1 + 1)} ${f2(b)} ${f2(a1 - 2)} ${f2(b)} L${f2(a0 + 2)} ${f2(b)} C${f2(a0 - 1)} ${f2(b)} ${f2(a0 - 1)} ${f2(t)} ${f2(a0 + 2)} ${f2(t)}Z`;
      s += part(c, d, sv, Ln(c, `M${f2(a0 + 2)} ${f2(t + 2)} L${f2(a1 - 2)} ${f2(t + 2)}`, '#ffffff', 1.2, 0.85, 0.4) + E(c, (a0 + a1) / 2, b - 1, (a1 - a0) * 0.6, 1.8, DEEP, 0.6, 1));
    }
    s += E(c, x1 + (x2 - x1) * 0.4, y, 1.3, 1.3, '#e8b844');
  }
  s += part(c, 'M-18 -13 C-19 -20 -12 -23 -4 -20.5 L8 -17 C13 -15 13 -8.5 7.5 -7.5 L-10 -8.2 C-15.5 -8.4 -17.8 -10.6 -18 -13Z', sv,
    Ln(c, 'M-14 -18 C-8 -21 0 -20 6 -17', '#ffffff', 1.4, 0.9, 0.4) + Ln(c, 'M-4 -21 L-3 -8', '#1e2028', 1, 0.6));
  return s;
}

// A small brass lantern hanging from a ring at (0,0); lit makes it glow.
function lantern(c, on, k = 1) {
  const brass = '#b8862e';
  let s = '';
  s += `<circle cx="0" cy="0" r="${4 * k}" fill="none" stroke="${brass}" stroke-width="${2 * k}"/>`;
  s += part(c, `M${-8 * k} ${12 * k} C${-8 * k} ${5 * k} ${-4 * k} ${3 * k} 0 ${3 * k} C${4 * k} ${3 * k} ${8 * k} ${5 * k} ${8 * k} ${12 * k}Z`, ball(c, brass));
  s += part(c, `M${-12 * k} ${12 * k} L${12 * k} ${12 * k} L${10 * k} ${17 * k} L${-10 * k} ${17 * k}Z`, cyl(c, brass, [0, 0, 1, 0]));
  const glass = `M${-10 * k} ${17 * k} L${10 * k} ${17 * k} L${11 * k} ${42 * k} L${-11 * k} ${42 * k}Z`;
  if (on) {
    s += part(c, glass, R(c, [0.5, 0.6, 0.7], [[0, '#fffbe8'], [0.35, '#ffe9a0'], [0.75, '#ffb640'], [1, '#e07818']]),
      S(c, `M0 ${24 * k} C${-5 * k} ${31 * k} ${-4 * k} ${37 * k} 0 ${38 * k} C${4 * k} ${37 * k} ${5 * k} ${31 * k} 0 ${24 * k}Z`, '#ffffff', 0.9, 0.8 * k));
  } else {
    s += part(c, glass, L(c, [0, 0, 1, 1], [[0, '#4a4a5a'], [0.4, '#22222e'], [1, '#14121a']]),
      E(c, 0, 37 * k, 3 * k, 2 * k, '#ff8a30', 0.8, 1.2 * k) + S(c, `M${-8 * k} ${18 * k} L${-5 * k} ${18 * k} L${-6 * k} ${40 * k} L${-9 * k} ${40 * k}Z`, '#9aa4c0', 0.5));
  }
  for (const x of [-11, 0, 11]) s += Ln(c, `M${x * 0.9 * k} ${17 * k} L${x * k} ${42 * k}`, x > 0 ? dk(brass, 0.4) : brass, 2 * k);
  s += part(c, `M${-13 * k} ${42 * k} L${13 * k} ${42 * k} L${10 * k} ${48 * k} L${-10 * k} ${48 * k}Z`, cyl(c, brass, [0, 0, 1, 0]));
  s += E(c, 0, 50 * k, 4 * k, 2.5 * k, ball(c, brass));
  return s;
}

// Halo for a light, drawn outside the figure filter. Peak alpha stays below
// the billboard's alpha test, so in the scene only bloom shows it.
function halo(c, x, y, r, col = '#ffc860', op = 0.38) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${R(c, [0.5, 0.5, 0.5], [[0, col, op], [0.35, col, op * 0.45], [1, col, 0]])}"/>`;
}

// Sandalled toes peeking from under a hem at (x, y).
function toes(c, x, y, skin, strap = '#5a3418') {
  let s = '';
  s += part(c, `M${x - 17} ${y} C${x - 18} ${y + 10} ${x - 14} ${y + 18} ${x - 6} ${y + 20} L${x + 8} ${y + 20} C${x + 16} ${y + 18} ${x + 19} ${y + 10} ${x + 17} ${y}Z`, ball(c, skin, 1, [0.35, 0.2]));
  for (const t of [-10, -3.5, 3, 9]) s += E(c, x + t, y + 16, 3, 3.4, lit(skin, 0.2)) + E(c, x + t - 0.6, y + 14.5, 1.4, 1.1, lit(skin, 0.7), 0.6);
  s += Ln(c, `M${x - 17} ${y + 7} L${x + 17} ${y + 7}`, strap, 3.4) + E(c, x, y + 20, 18, 2, DEEP, 0.6, 1);
  return s;
}

// ================================================================ merchant
function merchant(frame) {
  const c = ctx('merchant', frame, 480, 640);
  const g = frame === 'attack';
  const skin = '#d4956a';
  const green = '#3d7a33';
  const leather = '#7a4824';
  const blue = '#2d4a88';
  const boot = '#5a3216';
  const hair = '#1f1714';
  const fold = (d, w = 3, op = 0.45, b = 2.2, col = DEEP) => Ln(c, d, col, w, op, b);
  let s = '';

  // trousers and boots
  const legs = [
    'M180 440 C178 490 184 550 190 598 L236 598 C238 550 241 490 241 440Z',
    'M239 440 C239 490 242 550 244 598 L290 598 C296 550 302 490 300 440Z',
  ];
  legs.forEach((d, i) => {
    const x = i ? 268 : 212;
    s += part(c, d, cyl(c, blue, [0, 0, 1, 0.1]),
      E(c, x, 494, 40, 22, DEEP, 0.75, 7) +
      fold(`M${x - 16} 530 q 12 8 28 2 M${x - 16} 556 q 12 7 26 -1 M${x - 14} 580 q 10 5 24 0`, 3, 0.5, 1.6) +
      fold(`M${x - 14} 535 q 10 6 24 1`, 1.4, 0.35, 0.8, lit(blue, 0.6)) + E(c, x - 10, 540, 6, 30, lit(blue, 0.4), 0.35, 5));
  });
  const boots = [
    'M186 584 L238 584 C240 600 241 614 242 624 C243 634 238 640 228 640 L176 640 C166 640 162 633 167 625 C174 615 182 604 186 584Z',
    'M242 584 L294 584 C298 604 306 615 313 625 C318 633 314 640 304 640 L252 640 C242 640 237 634 238 624 C239 614 240 600 242 584Z',
  ];
  boots.forEach((d, i) => {
    const x = i ? 272 : 208;
    s += part(c, d, cyl(c, boot, [0, 0, 1, 0.3]),
      E(c, x - 6 + i * 14, 624, 18, 7, lit(boot, 0.55), 0.55, 4) +
      E(c, x, 638, 48, 4, DEEP, 0.8, 1.5) +
      fold(`M${x - 22} 608 q 22 6 44 0`, 2, 0.45, 1.2));
    s += part(c, `M${x - 30} 578 C${x - 20} 570 ${x + 20} 570 ${x + 30} 578 L${x + 28} 598 C${x + 10} 604 ${x - 10} 604 ${x - 28} 598Z`, cyl(c, lit(boot, 0.1), [0, 0, 1, 0.3]),
      Ln(c, `M${x - 28} 579 L${x + 28} 579`, lit(boot, 0.5), 1.4, 0.5) + E(c, x, 598, 30, 4, DEEP, 0.5, 2));
  });

  // neck
  s += part(c, 'M212 126 L268 126 L272 184 L208 184Z', cyl(c, dk(skin, 0.1), [0, 0, 1, 0]), E(c, 240, 140, 40, 18, dk(skin, 0.6), 0.75, 6));

  // tunic
  const tunic = 'M210 160 C192 164 170 170 154 178 C140 184 128 196 124 214 C118 240 118 262 122 280 C112 310 110 350 120 384 C130 412 170 430 240 430 C310 430 350 412 360 384 C370 350 368 310 358 280 C362 262 362 240 356 214 C352 196 340 184 326 178 C310 170 288 164 270 160Z';
  s += part(c, tunic, cyl(c, green, [0, 0.1, 1, 0.3]), drape(c, [112, 160, 368, 430], green, 72, { w: 7 }) +
    E(c, 176, 226, 44, 44, lit(green, 0.55), 0.4, 14) +
    E(c, 340, 300, 26, 100, DEEP, 0.4, 12) +
    fold('M134 386 C150 408 176 418 200 420 M346 386 C330 408 304 418 280 420', 4, 0.5, 3) +
    fold('M150 230 C156 250 158 270 156 290', 3, 0.35, 3));
  // open collar
  s += part(c, 'M216 160 L264 160 L255 202 L240 218 L225 202Z', R(c, [0.5, 0.1, 0.9], [[0, dk(skin, 0.15)], [1, dk(skin, 0.55)]]),
    Ln(c, 'M230 192 q3 6 0 10 M244 186 q4 5 1 12 M236 204 q4 3 8 0 M226 180 q3 4 1 8 M250 176 q2 5 -1 9', hair, 1.1, 0.7));
  s += part(c, 'M210 158 C217 168 224 188 231 208 L240 218 L227 158Z', cyl(c, lit(green, 0.15), [0, 0, 1, 0]));
  s += part(c, 'M270 158 C263 168 256 188 249 208 L240 218 L253 158Z', dk(green, 0.3));

  // belt, ties, purse
  s += part(c, 'M118 296 C170 310 310 310 362 296 L364 320 C310 334 170 334 116 320Z', cyl(c, '#3a2212', [0, 0, 1, 0.1]),
    Ln(c, 'M120 301 C170 315 310 315 360 301', lit('#3a2212', 0.4), 1, 0.6));
  s += Ln(c, 'M120 312 C130 312 140 310 148 308', '#c8b088', 4) + Ln(c, 'M360 312 C350 312 340 310 332 308', '#a08868', 4);

  // apron
  const apron = 'M200 200 C214 197 266 197 280 200 C282 230 284 262 290 288 C322 296 346 318 352 352 C358 394 354 440 342 482 C338 492 328 496 314 496 C270 500 210 500 166 496 C152 496 142 492 138 482 C126 440 122 394 128 352 C134 318 158 296 190 288 C196 262 198 230 200 200Z';
  let ash = '';
  ash += E(c, 196, 352, 60, 74, lit(leather, 0.6), 0.45, 18);
  ash += E(c, 172, 250, 20, 50, lit(leather, 0.4), 0.3, 10);
  ash += E(c, 342, 400, 34, 120, DEEP, 0.55, 16);
  ash += E(c, 240, 462, 120, 16, DEEP, 0.4, 9);
  ash += E(c, 240, 293, 56, 9, DEEP, 0.5, 5);
  ash += Ln(c, 'M194 300 C214 310 266 310 286 300', lit(leather, 0.55), 2, 0.45, 1.5);
  ash += fold('M158 444 C164 464 170 482 172 500 M304 444 C310 464 308 482 310 500 M232 466 L230 500', 4, 0.45, 3);
  ash += fold('M162 448 C167 466 172 484 174 500', 1.5, 0.3, 1, lit(leather, 0.6));
  for (let i = 0; i < 26; i++) {
    const x = 145 + ((i * 53) % 190);
    const y = 220 + ((i * 97) % 290);
    ash += Ln(c, `M${x} ${y} q ${4 + (i % 3) * 3} ${-2 + (i % 2) * 4} ${9 + (i % 4) * 3} ${i % 2 ? 2 : -1}`, i % 3 ? lit(leather, 0.55) : DEEP, 1.2, 0.22, 0.4);
  }
  const stitch = (d) => Ln(c, d, '#e2c294', 1.2, 0.6, 0, ' stroke-dasharray="4 3"');
  ash += stitch('M204 206 C203 236 201 262 196 290 M276 206 C277 236 279 262 284 290');
  ash += stitch('M143 480 C131 440 128 400 134 354 M337 480 C349 440 352 400 346 354 M168 490 C210 494 270 494 312 490');
  s += part(c, apron, flat(c, leather, [0, 0, 1, 0.8]), drape(c, [126, 200, 356, 500], leather, 71, { w: 8, len: 70, fan: 0.6 }) + ash + `<rect x="120" y="190" width="240" height="320" fill="${L(c, [0, 0, 1, 0], [[0, DEEP, 0.6], [0.16, KEY, 0.12], [0.36, KEY, 0.2], [0.55, KEY, 0], [0.8, DEEP, 0.4], [1, DEEP, 0.78]])}"/>` + E(c, 214, 360, 60, 70, KEY, 0.16, 18) + E(c, 240, 486, 130, 22, DEEP, 0.45, 10));
  // straps and rivets
  s += part(c, 'M200 202 L210 201 L226 160 L215 157Z', cyl(c, leather, [0, 0, 1, 0]));
  s += part(c, 'M280 202 L270 201 L254 160 L265 157Z', dk(leather, 0.3));
  s += E(c, 205, 206, 4.2, 4.2, ball(c, '#d4a845')) + E(c, 275, 206, 4.2, 4.2, ball(c, '#c09038'));
  // pocket with a rolled bill and a stylus
  s += part(c, 'M196 380 L200 356 L222 356 L226 380Z', cyl(c, '#e8dcc0', [0, 0, 1, 0]), E(c, 211, 356, 11, 3, '#b8a888', 0.9));
  s += part(c, 'M258 380 L266 344 L271 345 L265 380Z', cyl(c, '#3a2a1a', [0, 0, 1, 0]));
  const pocket = 'M178 376 L302 376 L299 446 C299 454 294 458 286 458 L194 458 C186 458 181 454 181 446Z';
  s += part(c, pocket, flat(c, dk(leather, 0.06), [0, 0, 1, 1]),
    E(c, 240, 378, 70, 7, DEEP, 0.6, 4) + Ln(c, 'M240 380 L240 458', DEEP, 2.2, 0.6, 0.8) +
    E(c, 210, 410, 30, 26, lit(leather, 0.5), 0.3, 10) + Ln(c, 'M182 381 L298 381', lit(leather, 0.65), 1.4, 0.55));
  s += stitch('M185 385 L185 446 C185 451 189 453 194 453 L286 453 C291 453 295 451 295 446 L295 385 M240 385 L240 453');
  // purse
  s += Ln(c, 'M346 316 C344 324 344 330 342 336 M354 316 C356 324 357 330 358 334', '#2a180c', 3);
  const purse = 'M338 334 C324 346 320 370 326 390 C332 410 352 416 367 411 C383 405 390 384 385 364 C381 346 371 336 359 333Z';
  s += part(c, purse, ball(c, '#8c4a26', 1.1, [0.3, 0.35]),
    Ln(c, 'M329 360 C346 369 366 369 387 360', '#d8a040', 2.6) + Ln(c, 'M329 365 C346 374 366 374 386 365', '#6a3a0c', 1, 0.6) +
    E(c, 343, 384, 9, 15, lit('#8c4a26', 0.6), 0.4, 5) + Ln(c, 'M352 392 C356 400 360 404 364 406', DEEP, 2, 0.4, 1));
  s += part(c, 'M335 337 C342 329 360 327 367 334 L362 343 C356 338 344 338 340 343Z', cyl(c, '#6a3418'));
  s += coin(c, 349, 330, 7, 0.4) + coin(c, 362, 331, 6, 0.4);
  s += E(c, 352, 345, 4.5, 4.5, ball(c, '#e0b040'));
  for (const t of [-1, 1]) s += Ln(c, `M352 349 q ${t * 4} 10 ${t * 2} 18`, '#c89a3a', 1.6);

  // head: scarf tails, temples, face, beard, scarf (scaled up as a group)
  const hx = 240;
  const hy = 104;
  const body = s;
  s = '';
  const tail = (d, d2, col) => part(c, d, cyl(c, col, [0, 0, 1, 0.3]), Ln(c, d2, '#e8b030', 5) + Ln(c, d2, '#fff0b0', 1.2, 0.5));
  s += tail(`M${hx + 30} 96 C${hx + 46} 110 ${hx + 54} 140 ${hx + 50} 180 L${hx + 68} 174 C${hx + 72} 140 ${hx + 62} 108 ${hx + 40} 88Z`, `M${hx + 39} 98 C${hx + 52} 120 ${hx + 59} 150 ${hx + 58} 177`, '#9c1e1a');
  s += tail(`M${hx + 34} 96 C${hx + 56} 112 ${hx + 72} 136 ${hx + 78} 164 L${hx + 90} 154 C${hx + 84} 124 ${hx + 66} 100 ${hx + 42} 86Z`, `M${hx + 43} 94 C${hx + 62} 112 ${hx + 76} 134 ${hx + 83} 158`, '#b8261e');
  s += S(c, `M${hx - 39} 86 C${hx - 44} 100 ${hx - 42} 112 ${hx - 36} 122 L${hx - 31} 100Z`, hair);
  s += S(c, `M${hx + 39} 86 C${hx + 44} 100 ${hx + 42} 112 ${hx + 36} 122 L${hx + 31} 100Z`, hair);
  s += G(`translate(${hx} ${hy})`, face(c, {
    skin, iris: '#4a2c18', brow: hair, browW: 1.5, jaw: 1.2, cheek: 1.06, chin: 50, expr: g ? 'grin' : 'smile',
    blush: 0.32, noseW: 1.3, noseCol: '#d68866', age: 0.45, gaze: g ? -0.9 : 0,
  }));
  const beard = `M${hx - 37} 114 C${hx - 36} 142 ${hx - 22} 164 ${hx} 166 C${hx + 22} 164 ${hx + 36} 142 ${hx + 37} 114 C${hx + 31} 128 ${hx + 23} 137 ${hx + 14} 141 C${hx + 8} 143 ${hx - 8} 143 ${hx - 14} 141 C${hx - 23} 137 ${hx - 31} 128 ${hx - 37} 114Z`;
  let bsh = '';
  for (let i = 0; i < 18; i++) {
    const x = hx - 32 + i * 3.8;
    const k = i - 8.5;
    bsh += Ln(c, `M${f2(x)} ${f2(124 - Math.abs(k) * 0.9)} q ${f2(k * 0.5)} 14 ${f2(k * 0.35)} 26`, i % 2 ? '#5e4c46' : '#3a2e2a', 1, 0.6);
  }
  bsh += E(c, hx + 22, 150, 18, 18, DEEP, 0.5, 5) + E(c, hx - 18, 146, 10, 10, '#6a5a52', 0.3, 4);
  s += part(c, beard, R(c, [0.4, 0.3, 0.8], [[0, '#3a2c28'], [1, '#141012']]), bsh);
  const mo = g
    ? `M${hx} 129 C${hx - 8} 125 ${hx - 20} 124 ${hx - 27} 130 C${hx - 31} 134 ${hx - 33} 140 ${hx - 31} 147 C${hx - 27} 139 ${hx - 20} 134 ${hx - 12} 134 C${hx - 6} 134 ${hx} 132 ${hx} 132 C${hx} 132 ${hx + 6} 134 ${hx + 12} 134 C${hx + 20} 134 ${hx + 27} 139 ${hx + 31} 147 C${hx + 33} 140 ${hx + 31} 134 ${hx + 27} 130 C${hx + 20} 124 ${hx + 8} 125 ${hx} 129Z`
    : `M${hx} 127 C${hx - 8} 123 ${hx - 20} 123 ${hx - 25} 130 C${hx - 28} 135 ${hx - 29} 142 ${hx - 26} 149 C${hx - 22} 141 ${hx - 18} 137 ${hx - 10} 137 C${hx - 4} 137 ${hx} 135 ${hx} 135 C${hx} 135 ${hx + 4} 137 ${hx + 10} 137 C${hx + 18} 137 ${hx + 22} 141 ${hx + 26} 149 C${hx + 29} 142 ${hx + 28} 135 ${hx + 25} 130 C${hx + 20} 123 ${hx + 8} 123 ${hx} 127Z`;
  s += part(c, mo, L(c, [0, 0, 0.3, 1], [[0, '#4e3e36'], [1, '#141012']]),
    Ln(c, `M${hx - 4} 129 C${hx - 12} 128 ${hx - 20} 130 ${hx - 24} 138 M${hx + 4} 129 C${hx + 12} 128 ${hx + 20} 130 ${hx + 24} 138`, '#7a6a62', 1, 0.6));
  const scarf = `M${hx - 42} 97 C${hx - 46} 64 ${hx - 25} 45 ${hx} 45 C${hx + 27} 45 ${hx + 46} 62 ${hx + 43} 97 C${hx + 34} 84 ${hx + 16} 78 ${hx} 78 C${hx - 16} 78 ${hx - 33} 84 ${hx - 42} 97Z`;
  let ssh = '';
  for (let i = 0; i < 7; i++) {
    const y = 39 + i * 9;
    ssh += Ln(c, `M${hx - 52} ${y + 25} C${hx - 26} ${y - 4} ${hx + 26} ${y - 4} ${hx + 52} ${y + 25}`, '#e6ae2e', 4.4);
  }
  ssh += E(c, hx - 18, 57, 20, 10, '#fff0c0', 0.45, 6);
  ssh += E(c, hx + 40, 80, 14, 30, DEEP, 0.6, 7);
  ssh += fold(`M${hx - 30} 70 C${hx - 26} 62 ${hx - 18} 56 ${hx - 8} 54 M${hx + 12} 60 C${hx + 20} 64 ${hx + 26} 72 ${hx + 30} 80`, 2, 0.4, 1.5);
  ssh += Ln(c, `M${hx - 41} 93 C${hx - 30} 83 ${hx - 14} 79 ${hx} 79 C${hx + 16} 79 ${hx + 32} 85 ${hx + 42} 95`, DEEP, 4, 0.4, 2);
  s += part(c, scarf, cyl(c, '#ae2420', [0, 0, 1, 0.4]), ssh);
  s += part(c, `M${hx + 31} 82 C${hx + 42} 72 ${hx + 56} 79 ${hx + 54} 92 C${hx + 52} 103 ${hx + 38} 103 ${hx + 33} 96Z`, ball(c, '#b8261e'),
    Ln(c, `M${hx + 36} 83 C${hx + 45} 86 ${hx + 50} 92 ${hx + 47} 99`, '#e8b030', 3.4) + E(c, hx + 50, 96, 6, 5, DEEP, 0.5, 2));
  s = body + G(`translate(${hx} ${hy + 16}) scale(1.16) translate(${-hx} ${-hy})`, s);

  // arms
  const sleeveL = 'M158 176 C132 176 112 190 106 214 C100 240 98 272 102 300 C110 314 134 318 152 306 C150 282 151 256 154 234 C157 212 166 190 158 176Z';
  const sleeveR = 'M322 176 C348 176 368 190 374 214 C380 240 382 272 378 300 C370 314 346 318 328 306 C330 282 329 256 326 234 C323 212 314 190 322 176Z';
  const sleeveShade = (x, sgn) => E(c, x + sgn * 10, 250, 12, 60, DEEP, sgn > 0 ? 0.55 : 0.4, 8) +
    fold(`M${x - sgn * 18} 262 C${x - sgn * 10} 272 ${x} 280 ${x + sgn * 14} 284 M${x - sgn * 20} 280 C${x - sgn * 8} 288 ${x + sgn * 4} 292 ${x + sgn * 16} 294`, 3, 0.45, 2) +
    E(c, x - 14, 206, 14, 20, lit(green, 0.6), sgn < 0 ? 0.45 : 0.15, 8);
  const cuff = (d, d2, col) => part(c, d, cyl(c, col, [0, 0, 0, 1]), Ln(c, d2, DEEP, 2, 0.45, 1) + Ln(c, d2.replace(/(\d+) (\d+)/, '$1 $2'), lit(col, 0.5), 1, 0.3));
  const hairs = (x, y, n, sgn) => {
    let h = '';
    for (let i = 0; i < n; i++) h += `M${x + i * 9 * sgn} ${y + (i % 3) * 4} l${6 * sgn} ${1 + (i % 2)}`;
    return Ln(c, h, '#4a2818', 0.9, 0.6);
  };
  if (!g) {
    s += part(c, sleeveL, cyl(c, green, [0, 0, 1, 0.2]), sleeveShade(128, -1));
    s += part(c, sleeveR, cyl(c, green, [0, 0, 1, 0.2]), sleeveShade(352, 1));
    s += part(c, 'M106 300 C112 324 132 340 160 344 C178 346 194 346 210 346 L212 320 C194 318 176 314 160 308 C140 302 124 296 108 286Z', cyl(c, skin, [0, 0, 0, 1]),
      E(c, 160, 342, 46, 6, DEEP, 0.4, 3) + E(c, 150, 312, 30, 5, lit(skin, 0.5), 0.4, 3) + hairs(136, 314, 7, 1));
    s += part(c, 'M374 300 C368 324 348 340 320 344 C302 346 296 346 286 346 L284 320 C298 318 304 314 320 308 C340 302 356 296 372 286Z', cyl(c, dk(skin, 0.12), [0, 0, 0, 1]),
      E(c, 320, 342, 46, 6, DEEP, 0.5, 3) + E(c, 330, 312, 30, 5, lit(skin, 0.4), 0.25, 3) + hairs(344, 314, 6, -1));
    s += cuff('M100 286 C110 302 130 310 150 310 L156 290 C136 290 120 282 110 266Z', 'M104 282 C116 296 134 300 152 300', lit(green, 0.15));
    s += cuff('M380 286 C370 302 350 310 330 310 L324 290 C344 290 360 282 370 266Z', 'M376 282 C364 296 346 300 328 300', green);
    // under hand (left) and the right hand laid over it
    s += part(c, 'M204 320 C214 314 232 314 244 320 L246 348 C232 354 214 352 204 346Z', cyl(c, dk(skin, 0.05), [0, 0, 0, 1]), E(c, 220, 320, 14, 4, lit(skin, 0.5), 0.5, 2));
    const back = 'M292 320 C282 310 258 308 244 313 C233 318 230 331 234 341 C246 351 270 353 290 345Z';
    s += part(c, back, ball(c, skin, 1, [0.45, 0.25]),
      E(c, 266, 314, 18, 5, lit(skin, 0.6), 0.5, 2.5) + Ln(c, 'M282 322 L250 318 M282 330 L248 328 M282 338 L250 338', dk(skin, 0.3), 1.2, 0.35, 1));
    const fing = [['M244 317 C232 317 224 319 216 324', 9], ['M242 326 C230 327 220 330 212 335', 9.4], ['M242 335 C231 337 221 340 214 345', 9], ['M244 343 C235 346 228 349 221 352', 7.6]];
    for (const [d, w] of fing) {
      s += Ln(c, d, dk(skin, 0.45), w + 1.4) + Ln(c, d, skin, w) + Ln(c, d, lit(skin, 0.45), w * 0.3, 0.6, 0.6);
    }
    s += E(c, 218, 323, 3, 2.4, '#f0c8b0', 0.8) + E(c, 214, 334, 3, 2.4, '#f0c8b0', 0.8) + E(c, 216, 344, 3, 2.2, '#f0c8b0', 0.8);
    s += Ln(c, 'M272 312 C260 305 248 304 238 309', dk(skin, 0.35), 10) + Ln(c, 'M272 312 C260 305 248 304 238 309', lit(skin, 0.1), 8.4) + Ln(c, 'M268 309 C258 304 248 304 240 307', lit(skin, 0.5), 2.4, 0.6, 0.6);
  } else {
    // raised arm holding up a coin
    s += part(c, 'M168 176 C146 168 116 172 94 184 C72 196 58 214 62 236 C70 250 92 250 110 240 C126 232 142 228 158 230 C170 222 176 190 168 176Z', cyl(c, green, [0, 0, 0.25, 1]),
      fold('M92 200 C106 212 122 216 142 214 M82 222 C98 230 114 232 130 228', 3.4, 0.5, 2.2) + E(c, 124, 184, 34, 9, lit(green, 0.6), 0.45, 6) + E(c, 110, 236, 40, 8, DEEP, 0.5, 5));
    s += part(c, 'M62 228 C56 196 66 160 82 130 L118 138 C110 168 108 198 112 228Z', cyl(c, skin, [0, 0, 1, 0.1]),
      hairs(74, 160, 4, 1) + hairs(70, 192, 3, 1) + E(c, 108, 190, 7, 48, DEEP, 0.5, 4) + E(c, 74, 172, 5, 34, lit(skin, 0.55), 0.5, 3) +
      fold('M78 152 C84 170 86 190 84 210', 3, 0.25, 3));
    s += part(c, 'M54 240 C52 222 60 208 74 204 L116 214 C118 230 114 244 106 252 C88 256 68 252 54 240Z', cyl(c, lit(green, 0.15), [0, 0, 1, 0.5]),
      Ln(c, 'M58 228 C76 236 96 238 112 232', DEEP, 2.2, 0.45, 1) + Ln(c, 'M58 222 C76 230 96 232 112 226', lit(green, 0.6), 1.2, 0.4));
    // hand: curled fingers, forefinger and thumb pinch the coin
    s += part(c, 'M86 138 C79 124 80 106 88 98 C98 90 116 92 122 102 C127 112 125 128 116 138Z', ball(c, skin, 1, [0.35, 0.3]));
    for (const [y, x2] of [[106, 120], [116, 121], [126, 117]]) {
      const d = `M86 ${y} C96 ${y - 3} ${x2 - 10} ${y - 3} ${x2} ${y + 1}`;
      s += Ln(c, d, dk(skin, 0.45), 10.4) + Ln(c, d, skin, 9) + Ln(c, `M88 ${y - 2} C96 ${y - 4} ${x2 - 12} ${y - 4} ${x2 - 4} ${y - 2}`, lit(skin, 0.5), 2.4, 0.6, 0.6);
    }
    s += finger(c, 113, 100, 116, 80, 9, skin);
    s += coin(c, 107, 74, 18, 0.94);
    s += finger(c, 92, 104, 100, 84, 9, lit(skin, 0.08));
    s += E(c, 100, 83, 3, 2.4, '#f2cdb4', 0.85) + E(c, 116, 80, 3, 2.4, '#f2cdb4', 0.85);
    // other arm: hand on the belly
    s += part(c, sleeveR, cyl(c, green, [0, 0, 1, 0.2]), sleeveShade(352, 1));
    s += part(c, 'M374 300 C368 324 348 340 320 344 C302 346 296 346 290 346 L288 320 C298 318 304 314 320 308 C340 302 356 296 372 286Z', cyl(c, dk(skin, 0.12), [0, 0, 0, 1]),
      E(c, 320, 342, 46, 6, DEEP, 0.5, 3) + hairs(344, 314, 6, -1));
    s += cuff('M380 286 C370 302 350 310 330 310 L324 290 C344 290 360 282 370 266Z', 'M376 282 C364 296 346 300 328 300', green);
    const back = 'M296 320 C286 310 262 308 248 313 C237 318 234 331 238 341 C250 351 274 353 294 345Z';
    s += part(c, back, ball(c, skin, 1, [0.45, 0.25]), E(c, 270, 314, 18, 5, lit(skin, 0.6), 0.5, 2.5));
    const fing = [['M248 317 C236 318 228 322 222 328', 9], ['M246 326 C234 328 226 332 220 338', 9.4], ['M246 335 C236 338 228 342 222 347', 9], ['M248 343 C240 346 234 350 228 353', 7.6]];
    for (const [d, w] of fing) s += Ln(c, d, dk(skin, 0.45), w + 1.4) + Ln(c, d, skin, w) + Ln(c, d, lit(skin, 0.45), w * 0.3, 0.6, 0.6);
    s += Ln(c, 'M276 312 C264 305 252 304 242 309', dk(skin, 0.35), 10) + Ln(c, 'M276 312 C264 305 252 304 242 309', lit(skin, 0.1), 8.4);
  }
  const over = g ? glint(95, 61, 15) + glint(128, 86, 6, '#fff6d8', 0.8) : '';
  return wrap(c, s, { over });
}


// ================================================================ priest
function priest(frame) {
  const c = ctx('priest', frame, 480, 680);
  const g = frame === 'attack';
  const skin = '#dfa982';
  const vio = '#6a3aae';
  const gold = '#d8a838';
  const wood = '#7a4a24';
  const white = (v = [0, 0.1, 1, 0.3]) => L(c, v, [[0, '#cfc6cc'], [0.14, '#fff7e8'], [0.36, '#f0e9dd'], [0.56, '#d6cfd6'], [0.74, '#9a90ac'], [0.92, '#6e6486'], [1, '#a6b8e0']]);
  const fold = (d, w = 8, op = 0.35, b = 5) => Ln(c, d, '#5a4e72', w, op, b);
  const hil = (d, w = 4, op = 0.55, b = 3) => Ln(c, d, '#fffaf0', w, op, b);
  const cx = 226;
  let s = '';

  // staff (behind the hand)
  const staff = 'M341 678 L340 120 C340 96 342 76 348 62 C356 44 376 38 392 44 C406 50 410 66 404 78 C400 87 390 90 384 86 L388 80 C394 80 398 74 396 66 C392 56 380 54 370 58 C360 64 354 80 352 104 L352 678Z';
  s += part(c, staff, cyl(c, wood, [0, 0, 1, 0]),
    Ln(c, 'M344 660 L344 130 C344 100 348 76 356 62 C364 50 380 46 392 50', lit(wood, 0.5), 2, 0.6, 1) +
    Ln(c, 'M346 300 l2 6 M345 420 l3 5 M346 540 l2 7 M345 200 l2 5', dk(wood, 0.6), 1.4, 0.7));
  if (!g) s += G('translate(386 86)', Ln(c, 'M0 0 L0 10', '#8a7a5a', 1.6) + G('translate(0 10)', lantern(c, false, 1.25)));


  // robe
  const robe = 'M196 196 C176 200 158 206 148 220 C136 240 134 280 134 320 C130 400 120 500 108 600 C104 630 102 648 104 664 C150 676 300 676 348 664 C350 648 348 630 344 600 C334 500 324 400 320 320 C320 280 316 240 306 220 C296 206 276 200 256 196Z';
  let rsh = '';
  for (const [x0, x1, k] of [[160, 132, 1], [190, 176, 0.8], [212, 214, 0.6], [252, 262, 0.9], [282, 306, 1], [308, 334, 1.2]]) {
    rsh += fold(`M${x0} 380 C${x0 - 2} 470 ${(x0 + x1) / 2} 560 ${x1} 668`, 9 * k, 0.32 + 0.1 * k, 5);
    rsh += hil(`M${x0 - 11} 390 C${x0 - 13} 480 ${(x0 + x1) / 2 - 11} 570 ${x1 - 11} 668`, 4, 0.45, 3);
  }
  rsh += E(c, 330, 460, 30, 220, '#3e3456', 0.45, 18);
  rsh += E(c, 160, 300, 40, 90, '#fffaf0', 0.4, 18);
  rsh += Ln(c, 'M104 660 C150 674 300 674 348 660', vio, 22) + Ln(c, 'M106 650 C150 662 300 662 346 650', gold, 2.2);
  rsh += Ln(c, 'M104 666 C150 678 300 678 348 666', '#2a1450', 6, 0.6, 2);
  s += part(c, robe, white(), drape(c, [104, 200, 350, 672], '#e8e0dc', 61, { w: 8 }) + rsh);
  s += toes(c, 198, 660, skin) + toes(c, 256, 660, dk(skin, 0.12));

  // front panel (orphrey) with gold suns
  const panel = 'M212 236 L240 236 L252 662 L200 662Z';
  let psh = E(c, 240, 450, 14, 220, '#1a0a30', 0.4, 8) + E(c, 214, 400, 8, 200, '#a878f0', 0.35, 6);
  for (const y of [300, 420, 540]) {
    const x = cx + (y - 236) * 0.0;
    psh += `<circle cx="${x}" cy="${y}" r="7" fill="${gold}"/>` + Ln(c, `M${x - 12} ${y} L${x + 12} ${y} M${x} ${y - 12} L${x} ${y + 12} M${x - 8} ${y - 8} L${x + 8} ${y + 8} M${x + 8} ${y - 8} L${x - 8} ${y + 8}`, gold, 1.6);
    psh += `<circle cx="${x - 2}" cy="${y - 2}" r="2.6" fill="#fff0b0"/>`;
  }
  psh += Ln(c, 'M213 240 L201 662 M239 240 L251 662', gold, 2.4);
  s += part(c, panel, L(c, [0, 0, 1, 0], [[0, lit(vio, 0.3)], [0.5, vio], [1, dk(vio, 0.4)]]), psh);
  for (const [x0, x1] of [[200, 252]]) s += Ln(c, `M${x0} 650 C220 655 240 655 ${x1} 650`, '#fff', 0);

  // cord belt
  s += Ln(c, 'M150 352 C190 364 262 364 316 352', dk(gold, 0.5), 9) + Ln(c, 'M150 350 C190 362 262 362 316 350', gold, 6.5) + Ln(c, 'M152 348 C190 359 262 359 314 348', '#fff0b8', 1.6, 0.7);
  s += E(c, 202, 362, 9, 7, ball(c, gold));
  for (const [x, l] of [[198, 74], [207, 58]]) {
    s += Ln(c, `M${x} 366 C${x - 2} ${366 + l * 0.4} ${x - 1} ${366 + l * 0.8} ${x} ${366 + l}`, gold, 3.4) + Ln(c, `M${x - 0.6} 368 C${x - 2.4} ${366 + l * 0.4} ${x - 1.4} ${366 + l * 0.8} ${x - 0.6} ${366 + l}`, '#fff0b8', 1, 0.6);
    s += part(c, `M${x - 5} ${366 + l} L${x + 5} ${366 + l} L${x + 7} ${380 + l} L${x - 7} ${380 + l}Z`, cyl(c, gold, [0, 0, 1, 0]), Ln(c, `M${x - 4} ${372 + l} L${x - 5} ${380 + l} M${x} ${372 + l} L${x} ${380 + l} M${x + 4} ${372 + l} L${x + 5} ${380 + l}`, dk(gold, 0.5), 0.8));
  }

  // arms
  // staff arm (viewer's right): sleeve, hand gripping the staff
  const sleeveR = 'M300 218 C318 230 326 260 328 296 C330 316 334 330 346 342 C354 370 352 404 344 428 C326 438 300 436 284 424 C282 396 284 364 290 336 C294 300 294 260 300 218Z';
  s += part(c, sleeveR, white([0, 0, 1, 0.2]),
    fold('M304 300 C302 340 300 380 300 420 M326 350 C330 380 330 410 326 432', 8, 0.4, 5) + hil('M292 330 C290 370 290 400 292 424', 4, 0.5, 3) +
    Ln(c, 'M284 424 C300 436 326 438 344 428 C352 404 354 370 346 342 C340 334 334 330 328 326', vio, 10) + Ln(c, 'M285 417 C300 429 326 431 338 422 C345 400 346 372 340 348', gold, 1.6) +
    E(c, 336, 346, 12, 20, '#1e1036', 0.6, 4));
  s += G('translate(346 348)', gripFist(c, skin));

  if (!g) {
    // free arm: forearm across to the belt, holding prayer beads
    const sleeveL = 'M152 220 C136 232 128 262 126 300 C124 340 124 384 130 424 C146 436 172 436 190 424 C192 404 196 386 206 370 L194 342 C176 338 164 326 160 306 C156 278 160 248 152 220Z';
    s += part(c, sleeveL, white([0, 0, 1, 0.2]),
      fold('M150 300 C148 340 150 380 156 420 M176 350 C176 380 178 404 182 428', 8, 0.35, 5) + hil('M136 300 C134 340 134 380 138 420', 5, 0.55, 3) +
      Ln(c, 'M130 424 C146 436 172 436 190 424 C192 404 196 386 206 370 C204 358 200 348 194 342', vio, 10) + Ln(c, 'M131 417 C146 429 170 429 185 418 C187 400 190 384 200 368', gold, 1.6) +
      E(c, 196, 360, 10, 18, '#1e1036', 0.55, 4));
    s += part(c, 'M194 344 C204 338 220 340 228 348 C232 358 228 370 218 374 C208 378 198 374 194 366Z', ball(c, skin, 1, [0.3, 0.3]),
      Ln(c, 'M206 350 C214 350 222 352 226 356 M204 358 C212 359 220 361 224 364 M204 366 C210 368 216 369 220 371', dk(skin, 0.4), 1.4, 0.6, 0.6));
    let beads = '';
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = 214 + Math.sin(t * Math.PI) * 10 - t * 6;
      const y = 374 + t * 50;
      beads += E(c, x, y, 3.4, 3.4, ball(c, '#7a3a2a'));
    }
    s += beads + `<circle cx="208" cy="430" r="6" fill="none" stroke="${gold}" stroke-width="2.4"/>`;
  }
  // hood and capelet
  const hy = 124;
  const cape = `M150 212 C132 228 120 258 120 292 C128 300 140 302 152 298 C170 310 196 318 226 318 C256 318 282 310 300 298 C312 302 324 300 332 292 C332 258 320 228 302 212 C282 200 252 194 226 194 C200 194 170 200 150 212Z`;
  const capeHem = 'M120 292 C128 300 140 302 152 298 C170 310 196 318 226 318 C256 318 282 310 300 298 C312 302 324 300 332 292';
  s += part(c, cape, white([0, 0, 1, 0.5]),
    fold('M188 232 C184 260 182 284 186 314 M266 232 C270 260 272 284 268 314 M150 240 C144 260 144 280 150 298 M304 240 C310 260 310 280 302 298', 7, 0.32, 4) +
    hil('M174 226 C168 252 166 278 170 306 M134 250 C128 266 126 280 126 292', 5, 0.5, 4) + E(c, 300, 260, 26, 50, '#3e3456', 0.4, 10) +
    Ln(c, capeHem, vio, 16) + Ln(c, capeHem.replace(/(\d+) (\d+)/g, (m, x, y) => `${x} ${+y - 7}`), gold, 1.8));
  const hood = `M${cx} 40 C${cx + 28} 40 ${cx + 52} 58 ${cx + 60} 88 C${cx + 68} 118 ${cx + 66} 156 ${cx + 76} 190 C${cx + 80} 204 ${cx + 72} 214 ${cx + 60} 216 L${cx - 60} 216 C${cx - 72} 214 ${cx - 80} 204 ${cx - 76} 190 C${cx - 66} 156 ${cx - 68} 118 ${cx - 60} 88 C${cx - 52} 58 ${cx - 28} 40 ${cx} 40Z`;
  s += part(c, hood, white([0, 0, 1, 0.4]),
    fold(`M${cx + 44} 70 C${cx + 56} 110 ${cx + 58} 160 ${cx + 66} 206`, 10, 0.4, 6) + hil(`M${cx - 40} 64 C${cx - 52} 100 ${cx - 56} 150 ${cx - 64} 200`, 6, 0.55, 4) +
    E(c, cx - 20, 52, 24, 10, '#fffaf0', 0.5, 6));
  const open = `M${cx} 66 C${cx + 26} 66 ${cx + 44} 86 ${cx + 46} 118 C${cx + 48} 150 ${cx + 38} 180 ${cx + 20} 196 C${cx + 10} 204 ${cx - 10} 204 ${cx - 20} 196 C${cx - 38} 180 ${cx - 48} 150 ${cx - 46} 118 C${cx - 44} 86 ${cx - 26} 66 ${cx} 66Z`;
  s += part(c, open, L(c, [0, 0, 1, 0.3], [[0, lit(vio, 0.35)], [0.3, vio], [1, dk(vio, 0.55)]]),
    E(c, cx, 140, 34, 60, '#160a26', 0.75, 10));
  // neck and face
  s += part(c, `M${cx - 20} 160 L${cx + 20} 160 L${cx + 22} 206 L${cx - 22} 206Z`, dk(skin, 0.35));
  const fo = { skin, iris: '#56708c', brow: '#6a4a36', browW: 0.9, lashes: true, expr: g ? 'smile' : 'kind', blush: 0.24, age: 0.3, jaw: 0.94, cheek: 0.98, shadow: 0.55 };
  if (g) fo.glow = [-34, 0, 30, '#ffc860', 0.45];
  s += G(`translate(${cx} ${hy}) scale(1.06)`, face(c, fo));
  // hair under the hood, and the hood's shadow on the face
  s += S(c, `M${cx - 40} 108 C${cx - 38} 86 ${cx - 20} 74 ${cx} 74 C${cx + 20} 74 ${cx + 38} 86 ${cx + 40} 108 C${cx + 30} 90 ${cx + 14} 84 ${cx + 2} 86 C${cx - 6} 90 ${cx - 12} 94 ${cx - 18} 92 C${cx - 26} 90 ${cx - 34} 96 ${cx - 40} 108Z`, L(c, [0, 0, 1, 0.5], [[0, '#8a6448'], [1, '#3a2418']]), 1, 0.5);
  s += `<g clip-path="${clipD(c, open)}">${Ln(c, open, '#1a0c28', 16, 0.55, 7)}${E(c, cx + 40, 140, 16, 60, '#1a0c28', 0.45, 8)}${g ? E(c, cx - 40, 130, 18, 50, '#ffc860', 0.35, 8) : ''}</g>`;
  // inner hood edge with violet lining showing
  const rimHood = `${hood} ${open.replace(/Z$/, 'Z')}`;
  s += `<path d="${rimHood}" fill-rule="evenodd" fill="none"/>`;
  s += Ln(c, open, lit(vio, 0.15), 5) + Ln(c, `M${cx - 30} 72 C${cx - 44} 86 ${cx - 50} 110 ${cx - 50} 140`, '#fffaf0', 3, 0.6, 2);

  if (g) {
    // free arm raised, holding up the lit lantern
    s += part(c, 'M154 220 C130 228 112 246 104 268 C96 292 100 318 112 332 C130 340 156 330 168 314 C176 292 176 260 170 240 C166 230 162 224 154 220Z', white([0, 0, 1, 0.4]),
      fold('M118 270 C122 296 132 314 150 322', 8, 0.4, 5) + hil('M110 262 C104 286 106 310 116 326', 4, 0.55, 3) + E(c, 112, 268, 26, 40, '#ffc860', 0.35, 12));
    s += part(c, 'M108 262 C102 230 104 196 108 150 L136 152 C132 196 132 228 140 256Z', cyl(c, skin, [0, 0, 1, 0.1]),
      E(c, 110, 210, 10, 40, '#ffd890', 0.55, 6));
    s += part(c, 'M98 280 C92 258 98 236 112 226 C126 230 138 240 146 256 C142 276 128 290 112 292Z', white([0, 0, 1, 0.6]),
      Ln(c, 'M100 276 C106 252 118 238 140 248', vio, 10) + Ln(c, 'M103 270 C109 250 120 240 138 246', gold, 1.6));
    s += G('translate(122 140) rotate(-6)', `<g transform="scale(-1 1)">${gripFist(c, skin)}</g>`);
    s += G('translate(118 158)', lantern(c, true, 1.35));
    }
  const over = g ? halo(c, 118, 200, 104, '#ffc860', 0.36) + halo(c, 118, 198, 26, '#fff4c8', 0.38) : '';
  return wrap(c, s, { over });
}


// ================================================================ steward
// The keep-and-flame device of Hearthmoor, centred on (0,0), about 40 px.
function keepDevice(c, k = 1) {
  const gold = '#e2b23e';
  let s = '';
  const keep = 'M-15 18 L-15 -4 L-19 -4 L-19 -12 L-14 -12 L-14 -8 L-9 -8 L-9 -12 L-4 -12 L-4 -8 L4 -8 L4 -12 L9 -12 L9 -8 L14 -8 L14 -12 L19 -12 L19 -4 L15 -4 L15 18Z';
  s += part(c, keep, L(c, [0, 0, 1, 1], [[0, '#fff0a8'], [0.45, gold], [1, '#8a5a14']]),
    S(c, 'M-5 18 L-5 8 C-5 4 5 4 5 8 L5 18Z', '#5a1010') + Ln(c, 'M-15 2 L15 2 M-15 10 L15 10', '#9a6a18', 0.8, 0.6));
  s += S(c, 'M0 -13 C-11 -18 -11 -30 -4 -40 C-3 -32 2 -31 1 -38 C12 -30 12 -18 0 -13Z', L(c, [0, 1, 0, 0], [[0, '#e05a10'], [0.5, '#ffb030'], [1, '#fff3b0']]));
  s += S(c, 'M0 -14 C-4 -18 -4 -24 -1 -28 C0 -24 3 -22 3 -26 C5 -21 4 -16 0 -14Z', '#fff8d8', 0.9);
  return G(`scale(${k})`, s);
}

// A small iron key ring with three keys, hanging from (0,0).
function keyRing(c) {
  const iron = '#8a8c94';
  let s = '';
  s += `<circle cx="0" cy="10" r="9" fill="none" stroke="${dk(iron, 0.3)}" stroke-width="3.4"/><circle cx="0" cy="10" r="9" fill="none" stroke="${lit(iron, 0.3)}" stroke-width="1.2" stroke-dasharray="6 20"/>`;
  const key = (rot, len) => G(`rotate(${rot} 0 18)`,
    `<circle cx="0" cy="22" r="4.6" fill="none" stroke="${iron}" stroke-width="2.6"/>` +
    Ln(c, `M0 27 L0 ${27 + len}`, iron, 3) + Ln(c, `M0 ${21 + len} l5 0 M0 ${25 + len} l4 0`, iron, 2.6) + Ln(c, `M-0.8 28 L-0.8 ${25 + len}`, '#e0e4ec', 0.9, 0.7));
  s += key(24, 26) + key(-4, 32) + key(-30, 22);
  return s;
}

function steward(frame) {
  const c = ctx('steward', frame, 480, 640);
  const g = frame === 'attack';
  const skin = '#dca486';
  const crim = '#9c1c22';
  const blue = '#22408e';
  const gold = '#d8a838';
  const hose = '#5c5a62';
  const ledger = '#5e3418';
  const fold = (d, w = 4, op = 0.4, b = 3, col = DEEP) => Ln(c, d, col, w, op, b);
  let s = '';
  const cx = 240;

  const fur = '#6a4a30';
  // fur: a soft mass with tapered tufts along its edges
  const furMass = (d, box, seed, base = fur) => {
    const r = rng(seed);
    let t = drape(c, box, base, seed, { w: 6, len: 22, n: 26, angle: 15 });
    for (let i = 0; i < 18; i++) {
      const x = box[0] + r() * (box[2] - box[0]);
      const y = box[1] + r() * (box[3] - box[1]);
      t += brush(c, [[x, y], [x + 3 + r() * 4, y + 8], [x + 2 + r() * 6, y + 16]], 5 + r() * 3, r() < 0.5 ? lit(base, 0.55) : dk(base, 0.55), 0.35, 0.6);
    }
    return part(c, d, cyl(c, base, [0, 0, 1, 0.3]), t);
  };
  // hose and shoes
  for (const [x, i] of [[216, 0], [264, 1]]) {
    s += part(c, `M${x - 19} 540 C${x - 20} 570 ${x - 19} 595 ${x - 17} 612 L${x + 17} 612 C${x + 19} 595 ${x + 20} 570 ${x + 19} 540Z`, cyl(c, hose, [0, 0, 1, 0]),
      E(c, x, 548, 26, 14, DEEP, 0.75, 6));
    const sx = x + (i ? 6 : -6);
    s += part(c, `M${sx - 20} 604 L${sx + 20} 604 C${sx + 24} 616 ${sx + 28 + (i ? 6 : -2)} 628 ${sx + 26 + (i ? 4 : -2)} 640 L${sx - 26 + (i ? 2 : -4)} 640 C${sx - 28 + (i ? 2 : -6)} 628 ${sx - 24} 616 ${sx - 20} 604Z`, cyl(c, '#4a2614', [0, 0, 1, 0.3]),
      E(c, sx - 4, 622, 12, 6, lit('#4a2614', 0.6), 0.55, 3) + E(c, sx, 638, 30, 3, DEEP, 0.7, 1.2));
  }

  // the long blue robe, flaring to a fur-trimmed hem
  const robe = 'M206 160 C184 162 164 168 152 180 C140 194 138 220 140 250 C140 330 132 430 120 556 C170 572 310 572 360 556 C348 430 340 330 340 250 C342 220 340 194 328 180 C316 168 296 162 274 160Z';
  s += part(c, robe, cyl(c, blue, [0, 0.1, 1, 0.3]),
    drape(c, [120, 180, 360, 566], blue, 11, { w: 8, fan: 0.3 }) +
    fold('M160 330 C154 420 146 490 136 556 M326 330 C330 420 336 490 346 556', 10, 0.45, 6) + E(c, 340, 400, 22, 150, DEEP, 0.5, 14));
  s += furMass('M120 548 C170 566 310 566 360 548 L362 566 C310 586 170 586 118 566Z', [116, 544, 364, 586], 21);

  // crimson tabard in the robe's open front
  const tab = 'M194 176 C212 170 268 170 286 176 L294 528 C292 536 286 540 278 540 L202 540 C194 540 188 536 186 528Z';
  let tsh = '';
  tsh += drape(c, [186, 180, 294, 540], crim, 12, { w: 7 });
  tsh += E(c, 290, 360, 16, 170, DEEP, 0.55, 12);
  tsh += Ln(c, 'M190 528 L190 186 M290 528 L290 186 M190 536 L290 536', gold, 6) + Ln(c, 'M188.6 528 L188.6 188 M188 534 L292 534', '#fff0b0', 1.4, 0.6);
  s += part(c, tab, flat(c, crim, [0, 0, 1, 0.7]), tsh);
  s += G('translate(240 300) scale(1.3)', keepDevice(c));
  // the robe's front edges, fur-faced, over the tabard
  s += furMass('M182 178 C190 260 192 400 186 546 L170 548 C176 400 172 260 162 186Z', [160, 176, 194, 550], 23);
  s += furMass('M298 178 C290 260 288 400 294 546 L310 548 C304 400 308 260 318 186Z', [286, 176, 320, 550], 24, dk(fur, 0.2));
  // belt with keys
  s += part(c, 'M150 376 C190 386 290 386 330 376 L332 396 C290 406 190 406 148 396Z', cyl(c, '#3a2010', [0, 0, 1, 0.1]),
    Ln(c, 'M152 381 C190 391 290 391 328 381', lit('#3a2010', 0.4), 1.4, 0.6));
  s += `<rect x="226" y="378" width="28" height="24" rx="3" fill="none" stroke="${gold}" stroke-width="5"/>`;
  s += Ln(c, 'M240 382 L240 398', '#b88a2a', 3);
  s += G('translate(176 396) scale(1.3)', keyRing(c));

  // fur mantle over the shoulders
  s += furMass('M150 186 C170 166 206 156 240 156 C274 156 310 166 330 186 C338 204 336 222 326 234 C300 222 272 216 240 216 C208 216 180 222 154 234 C144 222 142 204 150 186Z', [140, 152, 340, 238], 25);
  // gold chain of office with a medallion
  let chain = '';
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = 176 + t * 128;
    const y = 214 + Math.sin(t * Math.PI) * 50;
    chain += E(c, x, y, 6, 4.4, ball(c, gold, 1.1), 1, 0, (t - 0.5) * 70);
  }
  chain += G('translate(240 278)', `<circle r="15" fill="${ball(c, gold, 1.2)}"/>` + `<circle r="9" fill="${R(c, [0.5, 0.5, 0.5, 0.35, 0.3], [[0, '#ff8a80'], [0.5, '#a81820'], [1, '#3a0408']])}"/>` + `<circle cx="-3" cy="-3" r="2.6" fill="#fff4e0"/>`);
  s += chain;

  // head: bald crown, grey side hair, great beard
  const hx = 240;
  const hy = 100;
  const hs = [];
  hs.push(part(c, `M${hx - 22} 124 L${hx + 22} 124 L${hx + 24} 168 L${hx - 24} 168Z`, dk(skin, 0.4)));
  // side hair behind ears
  for (const sd of [-1, 1]) {
    hs.push(S(c, `M${hx + sd * 30} 70 C${hx + sd * 46} 78 ${hx + sd * 50} 100 ${hx + sd * 46} 124 C${hx + sd * 42} 132 ${hx + sd * 36} 128 ${hx + sd * 34} 116Z`, sd < 0 ? '#d8d4d0' : '#9a96a0', 1, 0.6));
  }
  hs.push(G(`translate(${hx} ${hy})`, face(c, {
    skin, iris: '#4a5a6c', brow: '#e6e2dc', browW: 2.4, jaw: 0.96, cheek: 0.98, expr: g ? 'kind' : 'stern', browTilt: g ? 0 : -6, age: 1, blush: 0.32, noseW: 1.25, noseCol: '#d88a70', gaze: g ? 0.6 : -0.5, open: g ? 0.62 : 0.8, plane: 0.5,
  })));
  // bald crown sheen
  hs.push(E(c, hx - 12, 66, 12, 6, '#fff2e0', 0.55, 3));
  // side tufts over the ears
  for (const sd of [-1, 1]) {
    const d = `M${hx + sd * 33} 76 C${hx + sd * 46} 82 ${hx + sd * 49} 100 ${hx + sd * 44} 118 C${hx + sd * 40} 112 ${hx + sd * 38} 104 ${hx + sd * 35} 98 C${hx + sd * 38} 92 ${hx + sd * 36} 84 ${hx + sd * 33} 76Z`;
    let t = '';
    for (let i = 0; i < 6; i++) t += Ln(c, `M${hx + sd * (35 + i * 2)} ${78 + i * 2} q ${sd * 6} 14 ${sd * 2} ${30 - i * 2}`, '#ffffff', 1, 0.5);
    hs.push(part(c, d, sd < 0 ? '#e2deda' : '#a8a4ac', t));
  }
  // beard
  const beard = `M${hx - 36} 104 C${hx - 40} 136 ${hx - 34} 176 ${hx - 18} 206 C${hx - 10} 220 ${hx - 4} 226 ${hx} 228 C${hx + 4} 226 ${hx + 10} 220 ${hx + 18} 206 C${hx + 34} 176 ${hx + 40} 136 ${hx + 36} 104 C${hx + 32} 120 ${hx + 24} 130 ${hx + 14} 132 C${hx + 8} 133 ${hx - 8} 133 ${hx - 14} 132 C${hx - 24} 130 ${hx - 32} 120 ${hx - 36} 104Z`;
  hs.push(part(c, beard, L(c, [0, 0, 1, 1], [[0, '#d8d4d0'], [0.5, '#a09ca4'], [1, '#4e4858']])));
  hs.push(beardLocks(c, { cx: hx, y0: 128, y1: 232, w: 34, n: 11, seed: 5, cols: ['#ffffff', '#c6c2c6', '#5e5868'] }));
  // moustache
  const mo = `M${hx} 127 C${hx - 8} 122 ${hx - 22} 122 ${hx - 28} 132 C${hx - 31} 140 ${hx - 30} 150 ${hx - 27} 158 C${hx - 24} 146 ${hx - 18} 138 ${hx - 9} 137 C${hx - 4} 137 ${hx} 135 ${hx} 135 C${hx} 135 ${hx + 4} 137 ${hx + 9} 137 C${hx + 18} 138 ${hx + 24} 146 ${hx + 27} 158 C${hx + 30} 150 ${hx + 31} 140 ${hx + 28} 132 C${hx + 22} 122 ${hx + 8} 122 ${hx} 127Z`;
  hs.push(part(c, mo, L(c, [0, 0, 0.6, 1], [[0, '#ffffff'], [0.6, '#cfcbcb'], [1, '#7a7484']]),
    Ln(c, `M${hx - 3} 128 C${hx - 12} 127 ${hx - 22} 132 ${hx - 26} 146 M${hx + 3} 128 C${hx + 12} 127 ${hx + 22} 132 ${hx + 26} 146`, '#8a8494', 1, 0.6)));
  s += G(`translate(${hx} ${hy + 14}) scale(1.12) translate(${-hx} ${-hy})`, hs.join(''));

  // arms
  const sleeve = (d, x, sgn) => part(c, d, cyl(c, blue, [0, 0, 1, 0.2]),
    drape(c, [x - 40, 180, x + 40, 400], blue, 30 + sgn, { w: 7, len: 40 }) +
    fold(`M${x - sgn * 10} 260 C${x} 268 ${x + sgn * 8} 276 ${x + sgn * 14} 280 M${x - sgn * 12} 300 C${x} 306 ${x + sgn * 8} 312 ${x + sgn * 14} 314`, 5, 0.45, 3) +
    E(c, x - 10, 214, 12, 24, lit(blue, 0.6), sgn < 0 ? 0.45 : 0.15, 7) + E(c, x + 14, 280, 10, 60, DEEP, sgn > 0 ? 0.55 : 0.3, 7));
  const cuff = (x, y, rot) => G(`translate(${x} ${y}) rotate(${rot})`, furMass('M-24 -9 C-8 -13 8 -13 24 -9 L25 9 C8 13 -8 13 -25 9Z', [-26, -14, 26, 14], 40 + Math.round(x)));
  const book = (open) => {
    if (!open) {
      let b = '';
      b += part(c, 'M0 0 L56 6 L52 86 L-4 80Z', L(c, [0, 0, 1, 1], [[0, lit(ledger, 0.35)], [0.5, ledger], [1, dk(ledger, 0.5)]]),
        Ln(c, 'M6 6 L48 11 L45 78 L2 73Z', '#c89838', 1.4, 0.7) + E(c, 24, 40, 8, 10, '#c89838', 0.7) + E(c, 18, 24, 18, 14, lit(ledger, 0.5), 0.3, 6));
      b += part(c, 'M52 86 L56 6 L62 8 L58 88Z', L(c, [0, 0, 1, 0], [[0, '#efe2c4'], [1, '#b8a888']]), Ln(c, 'M57 12 L54 84 M59 14 L56 86', '#9a8a6a', 0.5, 0.7));
      return b;
    }
    let b = '';
    b += part(c, 'M-62 -6 C-40 -12 -12 -10 0 -2 C12 -10 40 -12 62 -6 L66 50 C42 44 14 46 0 54 C-14 46 -42 44 -66 50Z', ledger);
    const pageL = 'M-58 -8 C-38 -14 -12 -12 -1 -4 L-1 48 C-14 40 -38 38 -60 42Z';
    const pageR = 'M58 -8 C38 -14 12 -12 1 -4 L1 48 C14 40 38 38 60 42Z';
    let lines = '';
    for (let i = 0; i < 9; i++) {
      const y = -2 + i * 5;
      lines += `M-52 ${y - 2 + i * 0.1} C-36 ${y - 6} -16 ${y - 4} -8 ${y + 1}`;
      lines += `M8 ${y + 1} C16 ${y - 4} 36 ${y - 6} ${i % 3 === 2 ? 34 : 52} ${y - 2}`;
    }
    b += part(c, pageL, L(c, [0, 0, 1, 0], [[0, '#fff4dc'], [0.8, '#e8dcc0'], [1, '#b8a888']]), Ln(c, lines, '#4a3a5a', 0.8, 0.55));
    b += part(c, pageR, L(c, [0, 0, 1, 0], [[0, '#a89878'], [0.15, '#e6dac0'], [1, '#f6ecd4']]), Ln(c, lines, '#4a3a5a', 0.8, 0.55) + E(c, 50, 20, 14, 30, DEEP, 0.2, 8));
    b += Ln(c, 'M0 -3 L0 50', '#8a7a5a', 1.4, 0.8);
    b += Ln(c, 'M20 6 L20 64', crim, 3) + S(c, 'M17 64 L23 64 L23 72 L20 69 L17 72Z', crim);
    return b;
  };
  if (!g) {
    // left arm hangs, hand at the side; right arm holds the ledger against the body
    s += sleeve('M160 178 C138 182 124 200 122 228 C120 270 122 320 126 360 C134 366 150 366 158 360 C158 320 158 270 162 236 C166 206 172 186 160 178Z', 140, -1);
    s += cuff(142, 364, 4);
    s += part(c, 'M128 370 C126 386 128 400 134 408 C142 414 154 410 158 400 C162 388 160 376 156 368Z', ball(c, skin, 1, [0.35, 0.3]),
      Ln(c, 'M134 392 C140 396 148 396 154 392 M132 400 C138 404 146 404 152 400', dk(skin, 0.4), 1.2, 0.55, 0.5));
    s += G('translate(328 252) rotate(4)', book(false));
    s += sleeve('M320 178 C342 182 356 200 358 228 C362 260 364 290 360 320 C352 330 336 330 324 322 C324 290 322 260 318 236 C314 206 308 186 320 178Z', 340, 1);
    s += part(c, 'M326 318 C310 326 296 328 286 324 C276 318 276 306 286 300 C298 296 312 296 324 300Z', ball(c, skin, 1, [0.4, 0.3]),
      Ln(c, 'M290 306 C298 304 306 304 312 306 M288 314 C296 312 304 312 312 314', dk(skin, 0.4), 1.2, 0.55, 0.5));
    s += cuff(330, 316, -70);
  } else {
    // both forearms forward holding the open ledger at chest height
    s += sleeve('M162 178 C140 182 126 200 124 228 C120 256 122 284 130 300 C142 316 168 320 186 318 L186 296 C172 292 162 286 158 270 C156 250 162 220 162 178Z', 142, -1);
    s += sleeve('M318 178 C340 182 354 200 356 228 C360 256 358 284 350 300 C338 316 312 320 294 318 L294 296 C308 292 318 286 322 270 C324 250 318 220 318 178Z', 338, 1);
    s += cuff(180, 308, 80) + cuff(300, 308, -80);
    // palms under the book
    s += part(c, 'M168 296 C174 288 192 288 200 296 C204 306 200 322 188 326 C176 328 166 318 168 296Z', ball(c, skin, 1, [0.35, 0.3]));
    s += part(c, 'M312 296 C306 288 288 288 280 296 C276 306 280 322 292 326 C304 328 314 318 312 296Z', ball(c, dk(skin, 0.1), 1, [0.35, 0.3]));
    s += G('translate(240 286)', book(true));
    // thumbs over the pages
    s += Ln(c, 'M186 302 C190 292 196 284 204 280', dk(skin, 0.4), 9.4) + Ln(c, 'M186 302 C190 292 196 284 204 280', skin, 8) + E(c, 203, 281, 3, 2.4, '#f2d0bc', 0.9) + Ln(c, 'M188 296 C192 290 196 286 200 283', lit(skin, 0.5), 2, 0.6, 0.5);
    s += Ln(c, 'M294 302 C290 292 284 284 276 280', dk(skin, 0.45), 9.4) + Ln(c, 'M294 302 C290 292 284 284 276 280', dk(skin, 0.08), 8) + E(c, 277, 281, 3, 2.4, '#eac4ae', 0.9);
  }
  return wrap(c, s);
}


// ================================================================ pilgrim
// A hand raised in blessing, palm out, wrist at (0,30): two fingers up.
function blessHand(c, skin) {
  const sd = dk(skin, 0.42);
  let s = '';
  const fing = (x1, y1, x2, y2, w) => Ln(c, `M${x1} ${y1} L${x2} ${y2}`, sd, w + 1.4) + Ln(c, `M${x1} ${y1} L${x2} ${y2}`, skin, w) +
    Ln(c, `M${x1 - w * 0.22} ${y1} L${x2 - w * 0.22} ${y2 + 2}`, lit(skin, 0.45), w * 0.28, 0.6, 0.5) +
    Ln(c, `M${x1 - w * 0.4} ${(y1 + y2) / 2} l${w * 0.8} 0`, sd, 0.8, 0.5);
  s += fing(-4, -4, -5, -38, 8.4) + fing(4.4, -4, 4.6, -42, 8.8);
  s += part(c, 'M-14 28 C-16 14 -15 2 -12 -7 L13 -7 C15 4 15 16 12 28 C4 33 -5 33 -14 28Z', ball(c, skin, 1, [0.35, 0.35]),
    Ln(c, 'M-10 10 C-4 14 4 14 10 8 M-8 20 C-2 18 4 18 8 22', sd, 1, 0.5, 0.5) + E(c, 10, 12, 4, 14, DEEP, 0.25, 3));
  s += E(c, 9, -3, 4.6, 7.5, L(c, [0, 0, 0, 1], [[0, lit(skin, 0.2)], [1, dk(skin, 0.3)]]), 1, 0, -10);
  s += E(c, 14, 3, 4, 6.4, L(c, [0, 0, 0, 1], [[0, skin], [1, dk(skin, 0.35)]]), 1, 0, -14);
  s += Ln(c, 'M-13 18 C-8 14 -2 10 6 7', sd, 9.4) + Ln(c, 'M-13 18 C-8 14 -2 10 6 7', lit(skin, 0.1), 8) + Ln(c, 'M-12 15 C-7 12 -2 9 4 6', lit(skin, 0.55), 2, 0.6, 0.5);
  return s;
}

function pilgrim(frame) {
  const c = ctx('pilgrim', frame, 440, 640);
  const g = frame === 'attack';
  const skin = '#c88e6c';
  const cloak = '#7c4c28';
  const robe = '#2f6a34';
  const wood = '#6e4422';
  const fold = (d, w = 7, op = 0.45, b = 4, col = DEEP) => Ln(c, d, col, w, op, b);
  const hil = (d, w = 4, op = 0.35, b = 3) => Ln(c, d, lit(cloak, 0.7), w, op, b);
  const cx = 200;
  let s = '';

  // staff with a little hanging lamp
  const sx = 322;
  s += part(c, `M${sx - 6} 640 L${sx - 5} 40 C${sx - 5} 32 ${sx + 5} 30 ${sx + 6} 38 L${sx + 6} 640Z`, cyl(c, wood, [0, 0, 1, 0]),
    Ln(c, `M${sx - 3} 600 L${sx - 2} 44`, lit(wood, 0.5), 1.6, 0.6, 0.8) + Ln(c, `M${sx - 5} 160 q4 4 9 0 M${sx - 5} 300 q4 5 9 0 M${sx - 5} 470 q4 4 9 0`, dk(wood, 0.6), 2.4, 0.8));
  s += E(c, sx, 160, 7.5, 5, ball(c, wood)) + E(c, sx, 470, 7.5, 5, ball(c, wood));
  // the lamp hangs from a crook bound to the staff, beside his face
  s += Ln(c, `M${sx} 92 C${sx - 12} 84 ${sx - 26} 86 ${sx - 30} 98`, '#4a3a2a', 5) + Ln(c, `M${sx} 90 C${sx - 12} 82 ${sx - 24} 84 ${sx - 28} 94`, lit('#6e4422', 0.4), 1.6, 0.7);
  s += Ln(c, `M${sx - 6} 86 l12 8 M${sx - 6} 94 l12 -6`, '#8a7048', 3);
  s += G(`translate(${sx - 30} 100)`, lantern(c, true, 1.05));

  // boots
  for (const [x, i] of [[178, 0], [222, 1]]) {
    s += part(c, `M${x - 18} 596 L${x + 18} 596 C${x + 21} 612 ${x + 24 + i * 6} 626 ${x + 22 + i * 6} 640 L${x - 22 - (1 - i) * 6} 640 C${x - 24 - (1 - i) * 6} 626 ${x - 21} 612 ${x - 18} 596Z`, cyl(c, '#4e2e18', [0, 0, 1, 0.3]),
      E(c, x - 4, 620, 12, 6, lit('#4e2e18', 0.5), 0.5, 3) + E(c, x, 638, 28, 3, DEEP, 0.7, 1.2) + Ln(c, `M${x - 18} 604 L${x + 18} 608 M${x - 18} 612 L${x + 18} 600`, '#a07850', 1.6, 0.6));
  }

  // green robe in the cloak's opening, rope belt
  s += part(c, `M${cx - 30} 200 L${cx + 30} 200 L${cx + 44} 610 L${cx - 44} 610Z`, cyl(c, robe, [0, 0, 1, 0]),
    fold(`M${cx - 8} 400 L${cx - 12} 620 M${cx + 14} 400 L${cx + 20} 620`, 6, 0.45, 3) + E(c, cx, 300, 26, 120, DEEP, 0.35, 10));
  s += Ln(c, `M${cx - 34} 352 C${cx - 10} 360 ${cx + 10} 360 ${cx + 34} 352`, '#8a7048', 7) + Ln(c, `M${cx - 34} 350 C${cx - 10} 358 ${cx + 10} 358 ${cx + 34} 350`, '#d8c08a', 4) +
    Ln(c, `M${cx - 30} 350 l4 5 M${cx - 20} 353 l4 5 M${cx - 10} 355 l4 5 M${cx} 356 l4 5 M${cx + 10} 355 l4 5 M${cx + 20} 353 l4 5`, '#8a7048', 1, 0.7);
  s += E(c, cx + 8, 360, 7, 6, ball(c, '#c8ac78'));
  s += Ln(c, `M${cx + 6} 364 C${cx + 4} 390 ${cx + 8} 410 ${cx + 4} 440 M${cx + 12} 364 C${cx + 14} 384 ${cx + 12} 400 ${cx + 16} 424`, '#c8ac78', 3.4) +
    E(c, cx + 4, 442, 3.4, 4.4, '#a88c58') + E(c, cx + 16, 426, 3.4, 4.4, '#a88c58');

  // cloak halves with a worn hem
  const hemL = 'M92 604 L102 610 L110 605 L120 612 L130 607 L142 613 L152 608 L162 614 L172 610';
  const hemR = 'L238 610 L248 614 L260 608 L270 613 L282 607 L292 612 L300 605 L308 610 L308 604';
  const cloakL = `M200 196 C170 196 140 200 124 214 C110 232 104 260 102 300 C98 400 94 500 92 604 ${hemL.replace('M92 604 ', 'L92 604 ')} C176 500 182 330 190 206Z`;
  const cloakR = `M210 206 C218 330 224 500 228 610 ${hemR} C306 500 302 400 298 300 C296 260 290 232 276 214 C260 200 230 196 210 196Z`;
  let csh = '';
  csh += fold('M140 300 C134 400 126 500 120 626 M168 330 C166 430 162 530 158 626', 9, 0.5, 5);
  csh += hil('M126 300 C120 400 112 500 106 620 M156 330 C152 430 148 530 146 626', 6, 0.45, 4);
  csh += E(c, 130, 250, 26, 50, lit(cloak, 0.6), 0.35, 12);
  csh += Ln(c, 'M190 206 C182 330 176 500 172 626', lit(cloak, 0.5), 3, 0.7, 1);
  s += part(c, cloakL, cyl(c, cloak, [0, 0, 1, 0.2]), drape(c, [90, 200, 200, 614], cloak, 51, { w: 8 }) + csh);
  let rsh = '';
  rsh += fold('M248 300 C252 400 256 500 258 626 M276 320 C282 420 288 520 292 626', 10, 0.55, 6);
  rsh += hil('M238 300 C242 400 244 500 246 626', 5, 0.3, 4);
  rsh += E(c, 290, 420, 20, 200, DEEP, 0.5, 14);
  rsh += Ln(c, 'M211 208 C219 330 224 500 229 626', dk(cloak, 0.6), 4, 0.6, 1);
  s += part(c, cloakR, cyl(c, dk(cloak, 0.08), [0, 0, 1, 0.2]), drape(c, [206, 200, 312, 614], dk(cloak, 0.08), 52, { w: 8 }) + rsh);
  s += Ln(c, hemL, dk(cloak, 0.5), 3, 0.7, 1) + Ln(c, 'M228 610 ' + hemR, dk(cloak, 0.6), 3, 0.7, 1);

  // shell badge
  const shell = 'M0 14 C-10 10 -16 0 -14 -8 C-10 -14 -4 -16 0 -16 C4 -16 10 -14 14 -8 C16 0 10 10 0 14Z';
  let shs = '';
  for (const a of [-60, -36, -12, 12, 36, 60]) {
    const r = (a * Math.PI) / 180;
    shs += Ln(c, `M0 12 L${f2(Math.sin(r) * 15)} ${f2(-Math.cos(r) * 15)}`, '#b08870', 1.2, 0.8);
  }
  s += G('translate(158 262) rotate(-8)', part(c, shell, R(c, [0.5, 0.4, 0.7, 0.35, 0.25], [[0, '#fffaf0'], [0.6, '#eadccc'], [1, '#b89880']]), shs) +
    part(c, 'M-6 14 L6 14 L5 19 L-5 19Z', '#d8c4b0'));

  // staff arm out of the cloak
  s += part(c, 'M272 300 C286 296 304 300 316 310 L318 336 C302 340 286 338 272 330Z', cyl(c, dk(cloak, 0.15), [0, 0, 0, 1]),
    fold('M280 312 C292 316 302 322 312 326', 3, 0.5, 2));
  s += G(`translate(${sx} 330)`, gripFist(c, skin));

  // hood and face in its shadow
  const hood = `M${cx} 40 C${cx + 10} 46 ${cx + 30} 52 ${cx + 44} 70 C${cx + 60} 92 ${cx + 64} 130 ${cx + 68} 170 C${cx + 70} 190 ${cx + 80} 200 ${cx + 84} 212 C${cx + 40} 224 ${cx - 40} 224 ${cx - 84} 212 C${cx - 80} 200 ${cx - 70} 190 ${cx - 68} 170 C${cx - 64} 130 ${cx - 60} 92 ${cx - 44} 70 C${cx - 30} 52 ${cx - 10} 46 ${cx} 40Z`;
  s += part(c, hood, cyl(c, cloak, [0, 0, 1, 0.4]),
    fold(`M${cx + 40} 80 C${cx + 54} 120 ${cx + 58} 170 ${cx + 72} 210`, 10, 0.5, 6) + hil(`M${cx - 36} 76 C${cx - 50} 110 ${cx - 56} 160 ${cx - 70} 204`, 6, 0.5, 4) +
    E(c, cx - 18, 60, 20, 10, lit(cloak, 0.6), 0.4, 6) + fold(`M${cx - 70} 206 C${cx - 30} 216 ${cx + 30} 216 ${cx + 70} 206`, 5, 0.5, 3));
  const open = `M${cx} 80 C${cx + 24} 80 ${cx + 40} 98 ${cx + 42} 126 C${cx + 44} 158 ${cx + 34} 186 ${cx + 16} 202 C${cx + 8} 208 ${cx - 8} 208 ${cx - 16} 202 C${cx - 34} 186 ${cx - 44} 158 ${cx - 42} 126 C${cx - 40} 98 ${cx - 24} 80 ${cx} 80Z`;
  s += P(open, '#1a0f0c');
  const fs = [];
  fs.push(G(`translate(${cx} 134) scale(1.02)`, face(c, { skin, iris: '#5a6a58', brow: '#a8a29c', browW: 1.8, expr: 'kind', age: 1, blush: 0.22, noseW: 1.15, shadow: 0.3, plane: 0.0, gaze: 0.4 })));
  // grey beard
  const by = 134;
  const beard = `M${cx - 34} ${by + 6} C${cx - 36} ${by + 30} ${cx - 28} ${by + 58} ${cx - 12} ${by + 76} C${cx - 6} ${by + 82} ${cx + 6} ${by + 82} ${cx + 12} ${by + 76} C${cx + 28} ${by + 58} ${cx + 36} ${by + 30} ${cx + 34} ${by + 6} C${cx + 30} ${by + 22} ${cx + 22} ${by + 34} ${cx + 12} ${by + 38} C${cx + 6} ${by + 40} ${cx - 6} ${by + 40} ${cx - 12} ${by + 38} C${cx - 22} ${by + 34} ${cx - 30} ${by + 22} ${cx - 34} ${by + 6}Z`;
  fs.push(part(c, beard, L(c, [0, 0, 1, 1], [[0, '#a8a4a8'], [1, '#3a3640']])));
  fs.push(beardLocks(c, { cx, y0: by + 38, y1: by + 84, w: 30, n: 10, seed: 2, taper: 0.6, short: 0.25, drop: -44, cols: ['#dedad6', '#9a96a0', '#46424e'] }));
  fs.push(part(c, `M${cx} ${by + 25} C${cx - 8} ${by + 21} ${cx - 20} ${by + 22} ${cx - 26} ${by + 31} C${cx - 29} ${by + 38} ${cx - 28} ${by + 47} ${cx - 25} ${by + 54} C${cx - 22} ${by + 44} ${cx - 15} ${by + 35} ${cx - 6} ${by + 33} L${cx} ${by + 31} L${cx + 6} ${by + 33} C${cx + 15} ${by + 35} ${cx + 22} ${by + 44} ${cx + 25} ${by + 54} C${cx + 28} ${by + 47} ${cx + 29} ${by + 38} ${cx + 26} ${by + 31} C${cx + 20} ${by + 22} ${cx + 8} ${by + 21} ${cx} ${by + 25}Z`,
    L(c, [0, 0, 0.5, 1], [[0, '#e8e4e0'], [1, '#6a6670']]), Ln(c, `M${cx - 4} ${by + 27} C${cx - 12} ${by + 27} ${cx - 20} ${by + 32} ${cx - 23} ${by + 44} M${cx + 4} ${by + 27} C${cx + 12} ${by + 27} ${cx + 20} ${by + 32} ${cx + 23} ${by + 44}`, '#ffffff', 1, 0.5)));
  s += `<g clip-path="${clipD(c, open)}">${fs.join('')}${E(c, cx - 10, 96, 56, 30, '#120806', 0.55, 10)}${E(c, cx - 36, 150, 14, 60, '#120806', 0.5, 8)}${Ln(c, open, '#120806', 14, 0.5, 6)}${E(c, cx + 40, 132, 40, 60, '#ffb24a', 0.42, 16)}${E(c, cx + 22, 128, 22, 30, '#ffd68a', 0.3, 10)}</g>`;
  s += `<circle cx="${cx - 15.6}" cy="132.4" r="1.3" fill="#fff6e0" opacity="0.9"/><circle cx="${cx + 12.6}" cy="132.4" r="1.1" fill="#fff6e0" opacity="0.75"/>`;
  s += Ln(c, `M${cx - 30} 86 C${cx - 42} 100 ${cx - 46} 124 ${cx - 46} 150`, lit(cloak, 0.6), 3, 0.6, 1.5);

  if (g) {
    // left arm comes out of the cloak and raises a hand in blessing
    s += part(c, 'M104 250 C96 270 98 296 112 306 C124 312 140 306 150 296 L146 250 C136 240 116 238 104 250Z', cyl(c, cloak, [0, 0, 1, 0.4]), fold('M110 268 C120 284 132 292 146 294', 5, 0.5, 3));
    s += part(c, 'M100 290 C92 260 94 222 102 182 L146 184 C142 222 144 258 150 286Z', cyl(c, robe, [0, 0, 1, 0]),
      fold('M112 230 C120 236 128 238 138 236 M110 260 C120 266 130 268 142 266', 3, 0.5, 2) + E(c, 140, 240, 6, 40, DEEP, 0.4, 4));
    s += part(c, 'M98 190 C100 176 108 170 124 170 C138 170 148 176 150 190 L148 200 L100 200Z', cyl(c, dk(robe, 0.1), [0, 0, 1, 0]));
    s += G('translate(124 128) scale(1.75)', blessHand(c, skin));
  }
  const under = halo(c, sx - 30, 128, 110, '#ffb44a', 0.3);
  const over = halo(c, sx - 30, 128, 44, '#ffe2a0', 0.4);
  return wrap(c, s, { under, over });
}


// ================================================================ peddler
function peddler(frame) {
  const c = ctx('peddler', frame, 560, 640);
  const g = frame === 'attack';
  const skin = '#d89a78';
  const teal = '#23708e';
  const brown = '#5e3a22';
  const canvas = '#9a7a52';
  const iron = '#4a4c56';
  const copper = '#b8643a';
  const red = '#a82424';
  const gold = '#d8a838';
  const wood = '#6a4424';
  const fold = (d, w = 4, op = 0.45, b = 3, col = DEEP) => Ln(c, d, col, w, op, b);
  let s = '';

  // ----- the pack, behind him
  // striped blanket hanging down the left side
  s += part(c, 'M150 160 C128 200 118 260 120 330 C122 360 130 380 142 392 L190 380 L196 170Z', cyl(c, '#3a5a8a', [0, 0, 1, 0.2]),
    Ln(c, 'M126 220 L194 214 M122 260 L194 256 M121 300 L193 298 M124 340 L192 340', '#e0c070', 5, 0.85) +
    Ln(c, 'M127 232 L194 227 M122 272 L194 268 M122 312 L193 310', red, 4, 0.8) + E(c, 180, 280, 20, 120, DEEP, 0.5, 10));
  // main sack
  const sack = 'M168 140 C150 190 148 280 164 380 L404 380 C420 280 418 190 400 140Z';
  s += part(c, sack, cyl(c, canvas, [0, 0, 1, 0.3]),
    fold('M200 160 C196 220 198 300 206 370 M250 150 C252 230 250 300 252 372 M330 152 C336 230 340 300 336 372', 7, 0.4, 5) +
    Ln(c, 'M180 250 L390 250', dk(canvas, 0.5), 2, 0.5, 0, ' stroke-dasharray="5 4"') +
    part(c, 'M300 190 L346 186 L350 226 L304 230Z', '#7a8a5a', Ln(c, 'M302 192 L346 188 L350 226 L304 230Z', '#e0d0a0', 1, 0.7, 0, ' stroke-dasharray="3 3"')) +
    E(c, 380, 270, 26, 120, DEEP, 0.5, 14) + E(c, 200, 200, 30, 50, lit(canvas, 0.5), 0.35, 12));
  // pans and pot hanging at the sides
  s += Ln(c, 'M150 190 L112 214', '#5a4030', 2.4);
  s += part(c, 'M68 222 L150 222 C152 252 140 278 110 282 C80 278 66 252 68 222Z', ball(c, iron, 1.2, [0.3, 0.2]),
    E(c, 109, 222, 41, 7, '#1e1e26') + Ln(c, 'M70 230 C90 236 130 236 150 230', lit(iron, 0.6), 2, 0.6, 0.6) + E(c, 88, 250, 8, 14, '#d8dce8', 0.35, 4));
  s += Ln(c, 'M68 222 C60 206 74 198 82 214 M150 222 C158 206 144 198 136 214', iron, 3);
  // frying pan on the right
  s += part(c, 'M452 236 L470 160 L480 162 L462 238Z', cyl(c, wood, [0, 0, 1, 0]));
  s += E(c, 452, 268, 42, 36, ball(c, iron, 1.1, [0.3, 0.3])) + E(c, 452, 266, 34, 28, '#2a2a32') + E(c, 440, 256, 14, 8, '#8a8e9e', 0.4, 4);
  // lantern hanging at the right
  s += Ln(c, 'M404 300 L428 314', '#5a4030', 2) + G('translate(430 316)', lantern(c, false, 0.9));
  // rolled rug across the top
  const rug = 'M128 120 L436 120 C446 120 452 136 452 148 C452 160 446 176 436 176 L128 176 C118 176 112 160 112 148 C112 136 118 120 128 120Z';
  let rp = '';
  for (let x = 134; x < 436; x += 22) rp += `M${x} 126 l11 22 l-11 22 `;
  s += part(c, rug, L(c, [0, 0, 0, 1], [[0, lit(red, 0.45)], [0.35, red], [0.8, dk(red, 0.5)], [1, dk(red, 0.3)]]),
    Ln(c, rp, gold, 3, 0.9) + Ln(c, 'M128 130 L436 130 M128 166 L436 166', '#2a1a40', 3, 0.7) + E(c, 280, 128, 150, 5, '#fff0d0', 0.35, 3));
  s += E(c, 128, 148, 16, 28, L(c, [0, 0, 1, 1], [[0, lit(red, 0.4)], [1, dk(red, 0.4)]]));
  s += `<path d="M128 148 m-2 0 a3 3 0 1 1 5 1 a6 7 0 1 1 -10 -2 a10 12 0 1 1 15 4" fill="none" stroke="${dk(red, 0.6)}" stroke-width="1.6"/>`;
  s += Ln(c, 'M130 123 L132 116 M140 122 L141 114 M150 122 L150 115', gold, 1.6);
  // copper kettle on the left of the rug
  s += part(c, 'M150 120 C146 96 160 80 182 80 C204 80 218 96 214 120Z', ball(c, copper, 1.1, [0.3, 0.3]), E(c, 166, 96, 8, 6, '#ffd0a0', 0.6, 2));
  s += part(c, 'M212 108 C224 100 232 92 236 82 L240 86 C236 98 226 110 214 116Z', cyl(c, copper, [0, 0, 1, 0]));
  s += `<path d="M164 84 C164 64 200 64 200 84" fill="none" stroke="${dk(copper, 0.3)}" stroke-width="4"/>` + E(c, 182, 78, 8, 4, ball(c, copper));
  // stacked pots in the middle
  s += part(c, 'M232 120 L232 96 C232 88 290 88 290 96 L290 120Z', cyl(c, iron, [0, 0, 1, 0]), E(c, 246, 104, 8, 10, '#b8bccc', 0.3, 3));
  s += part(c, 'M240 96 L242 76 C242 70 280 70 280 76 L282 96Z', cyl(c, lit(iron, 0.2), [0, 0, 1, 0]));
  s += E(c, 261, 74, 20, 4, '#2a2a32') + E(c, 261, 70, 6, 4, ball(c, iron));
  // the lute, neck up and to the left
  s += G('translate(382 120) rotate(-20)', part(c, 'M-6 -80 L6 -80 L7 0 L-7 0Z', cyl(c, '#5a3418', [0, 0, 1, 0]), Ln(c, 'M-2 -78 L-2 0 M2 -78 L2 0', '#e8e0c8', 0.6, 0.8)) +
    part(c, 'M-9 -104 L9 -104 L7 -78 L-7 -78Z', cyl(c, '#4a2810', [0, 0, 1, 0]), Ln(c, 'M-12 -100 l5 0 M-12 -92 l5 0 M-12 -84 l5 0 M12 -100 l-5 0 M12 -92 l-5 0 M12 -84 l-5 0', '#d8c8a0', 2)) +
    part(c, 'M0 -8 C-30 -8 -40 30 -36 52 C-32 76 -14 86 0 86 C14 86 32 76 36 52 C40 30 30 -8 0 -8Z', ball(c, '#c07a3a', 1, [0.35, 0.3]),
      `<circle cx="0" cy="34" r="10" fill="#2a160a"/>` + `<circle cx="0" cy="34" r="12" fill="none" stroke="${gold}" stroke-width="1.6"/>` + Ln(c, 'M-2 -8 L-2 70 M2 -8 L2 70', '#efe6d0', 0.6, 0.85) +
      part(c, 'M-10 64 L10 64 L10 70 L-10 70Z', '#3a2010') + E(c, 22, 40, 10, 40, DEEP, 0.4, 8)));
  // a string of bells and charms across the sack
  let ch = Ln(c, 'M176 196 C220 222 300 226 392 196', '#c8a050', 1.8);
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    const x = 176 + t * 216;
    const y = 196 + Math.sin(t * Math.PI) * 26 + 6;
    ch += Ln(c, `M${f2(x)} ${f2(y - 6)} L${f2(x)} ${f2(y)}`, '#c8a050', 1.2);
    ch += i % 2 ? E(c, x, y + 5, 5, 6, ball(c, gold)) + E(c, x, y + 10, 2, 1.4, '#3a2a10') : E(c, x, y + 5, 4.6, 4.6, ball(c, ['#3a8ac8', '#c83a3a', '#40a860', '#a060d0'][i % 4]));
  }
  s += ch;

  // ----- the man
  // legs and boots
  for (const [x, i] of [[248, 0], [314, 1]]) {
    const k = i ? 1 : -1;
    s += part(c, `M${x - 28} 520 C${x - 30 + k * 6} 548 ${x - 26 + k * 6} 576 ${x - 22} 606 L${x + 22} 606 C${x + 26 + k * 6} 576 ${x + 30 + k * 6} 548 ${x + 28} 520Z`, cyl(c, brown, [0, 0, 1, 0]),
      E(c, x, 526, 34, 16, DEEP, 0.7, 6) + fold(`M${x - 18} 562 q 16 8 34 0 M${x - 16} 578 q 14 6 30 0`, 3, 0.5, 2) + E(c, x - 8 + k * 6, 556, 8, 14, lit(brown, 0.5), 0.4, 4));
    const bx = x + (i ? 6 : -6);
    s += part(c, `M${bx - 24} 592 L${bx + 24} 592 C${bx + 28} 608 ${bx + 32 + i * 6} 624 ${bx + 30 + i * 6} 640 L${bx - 30 - (1 - i) * 6} 640 C${bx - 32 - (1 - i) * 6} 624 ${bx - 28} 608 ${bx - 24} 592Z`, cyl(c, '#3e2414', [0, 0, 1, 0.3]),
      E(c, bx - 6, 618, 14, 7, lit('#3e2414', 0.5), 0.5, 3) + E(c, bx, 638, 36, 3, DEEP, 0.7, 1.2));
  }
  // coat
  const coat = 'M222 290 C200 292 184 310 180 336 C172 376 172 430 176 486 C178 510 182 526 190 536 L370 536 C378 526 382 510 384 486 C388 430 388 376 380 336 C376 310 360 292 338 290Z';
  s += part(c, coat, cyl(c, teal, [0, 0.1, 1, 0.3]), drape(c, [176, 290, 386, 536], teal, 81, { w: 7 }) +
    fold('M212 470 C206 494 204 514 204 536 M346 470 C352 494 354 514 356 536 M280 480 L280 536', 5, 0.45, 3) +
    E(c, 360, 400, 20, 110, DEEP, 0.5, 12) + E(c, 214, 350, 26, 60, lit(teal, 0.5), 0.35, 12) +
    Ln(c, 'M280 300 L280 536', dk(teal, 0.6), 2.4, 0.7, 0.6) + E(c, 280, 292, 70, 16, DEEP, 0.5, 8));
  for (const y of [330, 366, 402, 438]) s += E(c, 290, y, 5, 5, ball(c, gold)) + E(c, 288.4, y - 1.4, 1.4, 1.2, '#fff6c0');
  // belt with pouches
  s += part(c, 'M182 440 C230 452 330 452 378 440 L379 460 C330 472 230 472 181 460Z', cyl(c, '#3a2010', [0, 0, 1, 0.1]), Ln(c, 'M184 445 C230 457 330 457 376 445', lit('#3a2010', 0.4), 1, 0.6));
  s += part(c, 'M214 456 L246 458 L244 494 C236 500 222 500 214 494Z', cyl(c, '#7a4a28', [0, 0, 1, 0.2]), part(c, 'M212 454 L248 456 L246 472 L212 470Z', dk('#7a4a28', 0.2)));
  s += part(c, 'M320 458 L350 456 L350 490 C342 496 328 496 320 490Z', cyl(c, '#6a4024', [0, 0, 1, 0.2]), part(c, 'M318 455 L352 453 L352 468 L318 470Z', dk('#6a4024', 0.2)));
  s += `<rect x="270" y="442" width="22" height="22" rx="2" fill="none" stroke="${gold}" stroke-width="3.4"/>`;
  // pack straps
  s += part(c, 'M224 292 L242 290 L240 420 L222 424Z', cyl(c, '#6a4424', [0, 0, 1, 0]), Ln(c, 'M227 296 L226 420 M238 294 L237 418', '#d8b080', 0.9, 0.6, 0, ' stroke-dasharray="3 3"'));
  s += part(c, 'M336 292 L318 290 L320 420 L338 424Z', cyl(c, dk('#6a4424', 0.2), [0, 0, 1, 0]), Ln(c, 'M333 296 L334 420 M322 294 L323 418', '#c8a070', 0.9, 0.5, 0, ' stroke-dasharray="3 3"'));
  s += `<rect x="224" y="384" width="18" height="14" rx="2" fill="none" stroke="#b8b8c0" stroke-width="2.4"/><rect x="319" y="384" width="18" height="14" rx="2" fill="none" stroke="#9a9aa4" stroke-width="2.4"/>`;
  // collar
  s += part(c, 'M230 290 C250 312 310 312 330 290 L340 300 C320 330 240 330 220 300Z', cyl(c, dk(teal, 0.25), [0, 0, 1, 0]));
  // head, beard, hat
  const hx = 280;
  const hy = 270;
  const hs = [];
  hs.push(G(`translate(${hx} ${hy})`, face(c, {
    skin, iris: '#3a5a3a', brow: '#d8d4d0', browW: 2, jaw: 1.06, cheek: 1.02, expr: g ? 'grin' : 'smile', age: 0.8, blush: 0.45, blushCol: '#d04a40', noseW: 1.5, noseCol: '#d8705a', gaze: g ? 0.8 : 0.3,
  })));
  const beard = `M${hx - 34} ${hy + 12} C${hx - 38} ${hy + 40} ${hx - 26} ${hy + 64} ${hx} ${hy + 68} C${hx + 26} ${hy + 64} ${hx + 38} ${hy + 40} ${hx + 34} ${hy + 12} C${hx + 30} ${hy + 30} ${hx + 20} ${hy + 40} ${hx + 12} ${hy + 42} C${hx + 6} ${hy + 44} ${hx - 6} ${hy + 44} ${hx - 12} ${hy + 42} C${hx - 20} ${hy + 40} ${hx - 30} ${hy + 30} ${hx - 34} ${hy + 12}Z`;
  hs.push(part(c, beard, L(c, [0, 0, 1, 1], [[0, '#e0dcd8'], [0.6, '#a8a4ac'], [1, '#5a5664']])));
  hs.push(beardLocks(c, { cx: hx, y0: hy + 42, y1: hy + 74, w: 32, n: 10, seed: 7, taper: 0.7, short: 0.2, drop: -50, curl: 1.4, cols: ['#f4f0ec', '#b0acb4', '#5a5664'] }));
  const mo = g
    ? `M${hx} ${hy + 27} C${hx - 8} ${hy + 22} ${hx - 22} ${hy + 22} ${hx - 28} ${hy + 30} C${hx - 31} ${hy + 35} ${hx - 32} ${hy + 40} ${hx - 30} ${hy + 44} C${hx - 24} ${hy + 36} ${hx - 14} ${hy + 33} ${hx - 6} ${hy + 33} L${hx} ${hy + 31} L${hx + 6} ${hy + 33} C${hx + 14} ${hy + 33} ${hx + 24} ${hy + 36} ${hx + 30} ${hy + 44} C${hx + 32} ${hy + 40} ${hx + 31} ${hy + 35} ${hx + 28} ${hy + 30} C${hx + 22} ${hy + 22} ${hx + 8} ${hy + 22} ${hx} ${hy + 27}Z`
    : `M${hx} ${hy + 26} C${hx - 8} ${hy + 21} ${hx - 22} ${hy + 21} ${hx - 27} ${hy + 30} C${hx - 30} ${hy + 36} ${hx - 30} ${hy + 42} ${hx - 28} ${hy + 47} C${hx - 23} ${hy + 39} ${hx - 14} ${hy + 35} ${hx - 6} ${hy + 35} L${hx} ${hy + 33} L${hx + 6} ${hy + 35} C${hx + 14} ${hy + 35} ${hx + 23} ${hy + 39} ${hx + 28} ${hy + 47} C${hx + 30} ${hy + 42} ${hx + 30} ${hy + 36} ${hx + 27} ${hy + 30} C${hx + 22} ${hy + 21} ${hx + 8} ${hy + 21} ${hx} ${hy + 26}Z`;
  hs.push(part(c, mo, L(c, [0, 0, 0.5, 1], [[0, '#ffffff'], [0.6, '#cfcbcb'], [1, '#7a7484']]),
    Ln(c, `M${hx - 4} ${hy + 28} C${hx - 12} ${hy + 27} ${hx - 22} ${hy + 32} ${hx - 26} ${hy + 42} M${hx + 4} ${hy + 28} C${hx + 12} ${hy + 27} ${hx + 22} ${hy + 32} ${hx + 26} ${hy + 42}`, '#8a8494', 1, 0.6)));
  // the nose again on top of the moustache's edge
  hs.push(E(c, hx, hy + 16, 7.4, 6.4, R(c, [0.5, 0.5, 0.6, 0.35, 0.3], [[0, '#f0a088'], [0.6, '#d8705a'], [1, '#a04a3a']])) + E(c, hx - 2, hy + 13, 2.2, 1.6, '#fff0e0', 0.7, 0.5));
  // hat: brim, crown, band, feather
  hs.push(part(c, `M${hx - 64} ${hy - 30} C${hx - 50} ${hy - 44} ${hx + 50} ${hy - 44} ${hx + 64} ${hy - 30} C${hx + 50} ${hy - 20} ${hx - 50} ${hy - 20} ${hx - 64} ${hy - 30}Z`, cyl(c, '#2e5a2a', [0, 0, 1, 0.2]),
    E(c, hx, hy - 24, 60, 4, DEEP, 0.6, 2)));
  hs.push(part(c, `M${hx - 40} ${hy - 34} C${hx - 42} ${hy - 60} ${hx - 26} ${hy - 82} ${hx - 2} ${hy - 84} C${hx + 18} ${hy - 86} ${hx + 30} ${hy - 76} ${hx + 36} ${hy - 62} C${hx + 30} ${hy - 64} ${hx + 24} ${hy - 62} ${hx + 22} ${hy - 58} C${hx + 34} ${hy - 56} ${hx + 40} ${hy - 46} ${hx + 40} ${hy - 34}Z`, cyl(c, '#3a6e32', [0, 0, 1, 0.3]),
    fold(`M${hx - 10} ${hy - 80} C${hx - 6} ${hy - 66} ${hx - 6} ${hy - 50} ${hx - 10} ${hy - 36}`, 4, 0.4, 3) + E(c, hx - 22, hy - 64, 12, 14, lit('#3a6e32', 0.6), 0.45, 6)));
  hs.push(part(c, `M${hx - 40} ${hy - 44} C${hx - 20} ${hy - 40} ${hx + 20} ${hy - 40} ${hx + 40} ${hy - 44} L${hx + 40} ${hy - 34} C${hx + 20} ${hy - 30} ${hx - 20} ${hy - 30} ${hx - 40} ${hy - 34}Z`, cyl(c, '#5a3418', [0, 0, 1, 0])));
  hs.push(part(c, `M${hx + 30} ${hy - 42} C${hx + 50} ${hy - 70} ${hx + 70} ${hy - 96} ${hx + 92} ${hy - 104} C${hx + 80} ${hy - 86} ${hx + 60} ${hy - 62} ${hx + 34} ${hy - 38}Z`, L(c, [0, 0, 1, 1], [[0, '#ff7060'], [0.5, '#c82a2a'], [1, '#6a1010']]),
    Ln(c, `M${hx + 32} ${hy - 40} C${hx + 52} ${hy - 66} ${hx + 70} ${hy - 90} ${hx + 90} ${hy - 102}`, '#ffd0c0', 1, 0.8) +
    Ln(c, `M${hx + 46} ${hy - 58} l8 -2 M${hx + 56} ${hy - 70} l8 -2 M${hx + 66} ${hy - 82} l8 -2 M${hx + 44} ${hy - 50} l-2 -8 M${hx + 56} ${hy - 62} l-2 -8`, '#7a1414', 1, 0.6)));
  s += hs.join('');

  // arms
  const sleeve = (d, x, sgn) => part(c, d, cyl(c, teal, [0, 0, 1, 0.2]),
    fold(`M${x - sgn * 8} 380 C${x} 388 ${x + sgn * 8} 394 ${x + sgn * 16} 396 M${x - sgn * 10} 410 C${x} 416 ${x + sgn * 8} 420 ${x + sgn * 16} 420`, 3.4, 0.45, 2) +
    E(c, x + sgn * 12, 380, 10, 50, DEEP, sgn > 0 ? 0.5 : 0.3, 7));
  // stick in the left hand
  s += part(c, 'M150 268 C156 300 152 360 148 420 C144 500 140 580 136 640 L126 640 C130 580 134 500 138 420 C142 360 146 300 140 268 C138 258 150 256 150 268Z', cyl(c, wood, [0, 0, 1, 0]),
    Ln(c, 'M143 300 q5 3 8 0 M140 450 q5 3 8 0 M136 560 q5 3 8 0', dk(wood, 0.6), 2, 0.8) + Ln(c, 'M140 280 C144 340 140 420 134 600', lit(wood, 0.5), 1.4, 0.6));
  s += part(c, 'M136 270 C130 254 138 240 152 242 C164 244 168 258 160 268Z', ball(c, wood));
  s += sleeve('M226 292 C204 296 190 316 186 344 C180 380 176 400 168 414 C160 424 166 436 178 434 C196 428 212 404 220 376 C228 350 234 316 226 292Z', 200, -1);
  s += part(c, 'M150 410 C160 404 176 404 184 412 L182 434 C172 440 158 438 150 432Z', cyl(c, lit(teal, 0.15), [0, 0, 0, 1]));
  s += G('translate(146 436) rotate(-4)', gripFist(c, skin));
  if (!g) {
    // right hand rests on the strap
    s += sleeve('M334 292 C356 296 370 316 374 344 C378 370 376 394 366 410 C356 420 338 418 330 408 C334 380 336 350 334 292Z', 356, 1);
    s += part(c, 'M330 398 C318 394 308 398 304 408 C300 420 308 430 320 430 C334 430 342 418 338 404Z', ball(c, skin, 1, [0.4, 0.3]),
      Ln(c, 'M308 410 C314 408 322 408 330 410 M308 418 C314 417 322 417 330 419', dk(skin, 0.4), 1.2, 0.6, 0.5));
    s += part(c, 'M342 396 C350 400 360 404 368 404 L366 414 C354 416 344 412 336 408Z', cyl(c, lit(teal, 0.1), [0, 0, 0, 1]));
  } else {
    // right arm held out with a gem amulet dangling from the fingers
    s += sleeve('M334 292 C356 296 372 314 380 336 C388 356 404 368 424 372 C434 380 430 396 418 398 C392 398 368 384 352 362 C340 344 334 320 334 292Z', 370, 1);
    s += part(c, 'M410 368 C420 362 434 362 440 370 L438 396 C428 402 414 400 408 394Z', cyl(c, lit(teal, 0.1), [0, 0, 0, 1]));
    s += part(c, 'M436 366 C448 360 464 364 470 374 C474 384 470 394 460 398 C450 402 440 398 436 392Z', ball(c, skin, 1, [0.35, 0.3]));
    s += finger(c, 462, 370, 474, 368, 7.4, skin) + finger(c, 462, 380, 476, 380, 7.4, skin) + finger(c, 460, 390, 472, 392, 7, dk(skin, 0.1));
    s += Ln(c, 'M474 370 C478 392 476 410 474 424', gold, 1.6) + Ln(c, 'M476 372 C470 392 470 410 474 424', '#a8802a', 1.2);
    s += G('translate(474 440)', part(c, 'M0 -16 L13 -4 L9 12 L0 18 L-9 12 L-13 -4Z', ball(c, gold, 1.2)) +
      part(c, 'M0 -11 L9 -3 L6 9 L0 13 L-6 9 L-9 -3Z', R(c, [0.5, 0.5, 0.6, 0.35, 0.3], [[0, '#f0d0ff'], [0.35, '#a050e0'], [0.8, '#5a1a98'], [1, '#2a0a50']]),
        S(c, 'M0 -11 L-9 -3 L0 0Z', '#ffffff', 0.4) + S(c, 'M0 0 L6 9 L0 13Z', '#1a0030', 0.4)));
  }
  const over = g ? glint(470, 434, 13, '#f4e0ff', 0.95) + glint(482, 450, 6, '#ffffff', 0.8) : '';
  return wrap(c, s, { over });
}


// ================================================================ sellsword
// Riveted mail as a pattern of overlapping rings (user space).
function mailPattern(c, k = 1, name = 'mail') {
  const w = 9 * k;
  const h = 7 * k;
  return c.def(name, `<pattern id="@ID" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><g transform="scale(${k})">
<rect width="9" height="7" fill="#2c2e36"/>
<path d="M-4.5 7.6 a4.5 3.7 0 0 1 9 0 M4.5 7.6 a4.5 3.7 0 0 1 9 0" fill="none" stroke="#8a8e9a" stroke-width="1.7"/>
<path d="M0 4.1 a4.5 3.7 0 0 1 9 0" fill="none" stroke="#b4b8c4" stroke-width="1.7"/>
<path d="M1 3.1 a3.8 3 0 0 1 3.2 -2.1" fill="none" stroke="#f2f4fa" stroke-width="0.8"/>
<path d="M-3.5 6.6 a3.8 3 0 0 1 3.2 -2.1 M5.5 6.6 a3.8 3 0 0 1 3.2 -2.1" fill="none" stroke="#dde0e8" stroke-width="0.7"/>
</g></pattern>`);
}
// Shading laid over a patterned surface: warm light left, deep shadow right.
function overShade(c, v = [0, 0, 1, 0.3], k = 1) {
  return L(c, v, [[0, DEEP, 0.35 * k], [0.18, KEY, 0.22 * k], [0.42, KEY, 0.05], [0.62, DEEP, 0.3 * k], [0.88, DEEP, 0.72 * k], [1, RIM, 0.3]]);
}

function sellsword(frame) {
  const c = ctx('sellsword', frame, 480, 640);
  const g = frame === 'attack';
  const skin = '#c88a64';
  const leather = '#6a4024';
  const pants = '#38323e';
  const hair = '#2a1e18';
  const steelC = '#a8b0bc';
  const fold = (d, w = 4, op = 0.45, b = 3, col = DEEP) => Ln(c, d, col, w, op, b);
  const mail = mailPattern(c, 1.7);
  let s = '';
  const cx = 240;

  // round shield on his back, over the left shoulder
  const sh = 'M330 112 A86 86 0 1 1 329.9 112Z';
  s += `<circle cx="330" cy="198" r="86" fill="${R(c, [0.5, 0.5, 0.5, 0.4, 0.35], [[0, '#a83a2a'], [0.7, '#7a2418'], [1, '#4a140c']])}"/>`;
  s += `<g clip-path="${clipD(c, 'M244 198 A86 86 0 1 1 416 198 A86 86 0 1 1 244 198Z')}">` +
    Ln(c, 'M270 112 L270 290 M300 112 L300 290 M330 112 L330 290 M360 112 L360 290 M390 112 L390 290', '#3a0e08', 1.6, 0.6) +
    S(c, 'M300 112 L360 112 L360 290 L300 290Z', '#c8963a', 0.75) + E(c, 300, 150, 40, 30, '#ffd8a0', 0.25, 12) + E(c, 390, 240, 40, 60, DEEP, 0.6, 14) +
    Ln(c, 'M262 180 l6 6 M282 240 l8 4 M376 150 l-6 8 M350 260 l6 -6', '#2a0a06', 1.4, 0.7) + '</g>';
  s += `<circle cx="330" cy="198" r="83" fill="none" stroke="${L(c, [0, 0, 1, 1], [[0, '#d0d4dc'], [0.5, '#6a6e7a'], [1, '#2a2c34']])}" stroke-width="8"/>`;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    s += E(c, 330 + Math.cos(a) * 83, 198 + Math.sin(a) * 83, 2.6, 2.6, ball(c, '#9a9ea8'));
  }
  void sh;

  // spear (behind the near hand)
  const spear = (x0, y0, x1, y1) => {
    const ang = (Math.atan2(x1 - x0, y0 - y1) * 180) / Math.PI;
    const len = Math.hypot(x1 - x0, y1 - y0);
    let t = '';
    t += part(c, `M-4.5 0 L-3.6 ${-len} L3.6 ${-len} L4.5 0Z`, cyl(c, '#6a4020', [0, 0, 1, 0]), Ln(c, `M-1.6 -4 L-1.4 ${-len + 4}`, lit('#6a4020', 0.5), 1.4, 0.6) +
      Ln(c, `M-4 ${-len * 0.35} l8 -3 M-4 ${-len * 0.35 + 6} l8 -3 M-4 ${-len * 0.35 + 12} l8 -3`, '#3a2010', 2, 0.9));
    t += part(c, `M-4 0 L4 0 L4.6 12 L-4.6 12Z`, cyl(c, '#5a5e68', [0, 0, 1, 0]));
    // tassel and head
    t += S(c, `M-4 ${-len + 30} C-14 ${-len + 46} -12 ${-len + 64} -8 ${-len + 74} C-4 ${-len + 64} 4 ${-len + 64} 8 ${-len + 74} C12 ${-len + 62} 14 ${-len + 46} 4 ${-len + 30}Z`, L(c, [0, 0, 1, 1], [[0, '#e04a3a'], [0.6, '#a01a14'], [1, '#5a0a08']]));
    t += Ln(c, `M-6 ${-len + 40} C-8 ${-len + 52} -8 ${-len + 62} -6 ${-len + 70} M0 ${-len + 40} L0 ${-len + 70} M5 ${-len + 40} C7 ${-len + 52} 7 ${-len + 62} 6 ${-len + 70}`, '#ff8a70', 1, 0.6);
    t += part(c, `M-5 ${-len + 30} L5 ${-len + 30} L4 ${-len + 14} L-4 ${-len + 14}Z`, cyl(c, '#5a5e68', [0, 0, 1, 0]));
    t += part(c, `M0 ${-len - 52} C7 ${-len - 34} 11 ${-len - 12} 6 ${-len + 6} L0 ${-len + 16} L-6 ${-len + 6} C-11 ${-len - 12} -7 ${-len - 34} 0 ${-len - 52}Z`, L(c, [0, 0, 1, 0], [[0, '#f4f6fa'], [0.45, '#b8c0cc'], [0.55, '#5a606c'], [1, '#9aa8c4']]),
      Ln(c, `M0 ${-len - 48} L0 ${-len + 12}`, '#e8ecf4', 1, 0.7));
    return G(`translate(${x0} ${y0}) rotate(${f2(ang)})`, t);
  };
  if (!g) s += spear(152, 640, 104, 72);
  else s += spear(108, 640, 108, 72);

  // legs and boots
  for (const [x, i] of [[212, 0], [268, 1]]) {
    s += part(c, `M${x - 26} 440 C${x - 28} 480 ${x - 26} 530 ${x - 22} 572 L${x + 22} 572 C${x + 26} 530 ${x + 28} 480 ${x + 26} 440Z`, cyl(c, pants, [0, 0, 1, 0]),
      E(c, x, 446, 30, 14, DEEP, 0.7, 6) + fold(`M${x - 14} 510 q 12 6 28 0`, 3, 0.5, 2));
    const bx = x + (i ? 4 : -4);
    const boot = `M${bx - 25} 540 L${bx + 25} 540 C${bx + 27} 580 ${bx + 26} 604 ${bx + 30 + i * 6} 626 C${bx + 32 + i * 6} 634 ${bx + 28} 640 ${bx + 20} 640 L${bx - 22} 640 C${bx - 30} 640 ${bx - 34 - (1 - i) * 6} 634 ${bx - 32 - (1 - i) * 6} 626 C${bx - 26} 604 ${bx - 27} 580 ${bx - 25} 540Z`;
    s += part(c, boot, cyl(c, '#5a3418', [0, 0, 1, 0.2]),
      Ln(c, `M${bx - 25} 556 L${bx + 25} 566 M${bx - 25} 572 L${bx + 25} 582 M${bx - 25} 588 L${bx + 25} 598 M${bx + 25} 556 L${bx - 25} 566 M${bx + 25} 572 L${bx - 25} 582`, '#8a6a4a', 3, 0.85) +
      E(c, bx - 8, 620, 12, 8, lit('#5a3418', 0.5), 0.5, 3) + E(c, bx, 638, 36, 3, DEEP, 0.7, 1.2) + E(c, bx + 18, 580, 8, 40, DEEP, 0.5, 5));
    s += part(c, `M${bx - 28} 534 L${bx + 28} 534 L${bx + 27} 548 L${bx - 27} 548Z`, cyl(c, lit('#5a3418', 0.1), [0, 0, 1, 0]));
  }

  // padded gambeson skirt showing under the mail
  s += part(c, 'M156 420 L324 420 L330 464 C290 472 190 472 150 464Z', cyl(c, '#8a6a48', [0, 0, 1, 0.2]),
    fold('M180 428 L178 466 M210 430 L210 470 M240 430 L240 470 M270 430 L270 470 M300 428 L302 466', 2.4, 0.5, 1));
  // mail hauberk
  const hauberk = 'M206 166 C184 168 162 174 150 188 C138 204 136 228 140 254 C144 286 150 314 158 334 C160 342 156 352 152 364 C148 392 146 424 144 452 L232 456 L240 432 L248 456 L336 452 C334 424 332 392 328 364 C324 352 320 342 322 334 C330 314 336 286 340 254 C344 228 342 204 330 188 C318 174 296 168 274 166Z';
  s += part(c, hauberk, mail,
    `<rect x="130" y="160" width="220" height="300" fill="${overShade(c, [0, 0, 1, 0.3], 1.25)}"/>` +
    E(c, 196, 236, 34, 30, '#e8f0ff', 0.22, 10) + E(c, 262, 240, 22, 26, '#e8f0ff', 0.1, 10) +
    E(c, 240, 300, 80, 10, DEEP, 0.4, 8) + E(c, 240, 452, 100, 14, DEEP, 0.55, 6) +
    fold('M164 322 C190 334 290 334 316 322', 9, 0.45, 5) + fold('M166 312 C192 322 288 322 314 312', 3, 0.3, 2, '#e8f0ff') +
    fold('M180 380 C176 410 172 432 170 452 M300 380 C304 410 308 432 310 452 M210 372 C208 400 206 430 206 452', 7, 0.5, 4) +
    fold('M172 384 C168 410 165 432 163 450 M292 384 C296 410 300 432 302 450', 3, 0.3, 2, '#e8f0ff') +
    E(c, 330, 260, 16, 90, DEEP, 0.45, 10) + E(c, 150, 250, 10, 60, DEEP, 0.3, 8) +
    Ln(c, 'M150 448 L232 452 L240 430 L248 452 L330 448', '#e0e4ec', 1.4, 0.4));
  // leather collar
  s += part(c, 'M206 162 C214 180 266 180 274 162 L284 170 C272 196 208 196 196 170Z', cyl(c, leather, [0, 0, 1, 0]),
    Ln(c, 'M204 170 C214 186 266 186 276 170', lit(leather, 0.4), 1, 0.5, 0, ' stroke-dasharray="3 3"'));
  // baldric across the chest
  s += part(c, 'M286 172 L304 182 L186 344 L168 334Z', L(c, [0, 0, 1, 0], [[0, lit(leather, 0.35)], [0.5, leather], [1, dk(leather, 0.4)]]),
    Ln(c, 'M290 178 L174 336 M300 184 L182 344', '#c8a070', 0.9, 0.6, 0, ' stroke-dasharray="3 3"'));
  s += `<rect x="226" y="248" width="20" height="16" rx="2" transform="rotate(-54 236 256)" fill="none" stroke="#a8acb6" stroke-width="3"/>`;
  // belt, pouch, knife
  s += part(c, 'M150 330 C190 342 290 342 330 330 L332 354 C290 366 190 366 148 354Z', cyl(c, dk(leather, 0.1), [0, 0, 1, 0.1]),
    Ln(c, 'M152 335 C190 347 290 347 328 335', lit(leather, 0.4), 1, 0.6));
  s += `<rect x="228" y="334" width="24" height="24" rx="3" fill="none" stroke="#b0b4be" stroke-width="3.6"/>` + Ln(c, 'M240 338 L240 354', '#8a8e98', 3);
  s += part(c, 'M290 352 L318 350 L318 384 C310 390 296 390 290 384Z', cyl(c, leather, [0, 0, 1, 0.2]), part(c, 'M288 348 L320 346 L320 362 L288 364Z', dk(leather, 0.25)));
  s += part(c, 'M168 352 L178 352 L176 410 L170 410Z', cyl(c, '#3a2414', [0, 0, 1, 0])) + part(c, 'M164 346 L182 346 L182 352 L164 352Z', ball(c, '#9a9ea8'));

  // head
  const hx = cx;
  const hy = 96;
  const hs = [];
  hs.push(part(c, `M${hx - 22} 120 L${hx + 22} 120 L${hx + 26} 172 L${hx - 26} 172Z`, cyl(c, dk(skin, 0.2), [0, 0, 1, 0]), E(c, hx, 132, 30, 16, DEEP, 0.6, 6)));
  hs.push(G(`translate(${hx} ${hy})`, face(c, {
    skin, iris: '#5a4a2a', brow: hair, browW: 1.5, jaw: 1.16, cheek: 1.02, expr: g ? 'shout' : 'stern', age: 0.5, blush: 0.15,
    stubble: '#2a2024', scar: true, noseW: 1.1, shadow: 0.7, lip: '#a0605a', square: 1,
  })));
  // short messy hair
  const X = (v) => hx + v;
  const Y = (v) => hy + v;
  const hairD = `M${X(-37)} ${Y(0)} C${X(-41)} ${Y(-18)} ${X(-39)} ${Y(-34)} ${X(-30)} ${Y(-44)} L${X(-33)} ${Y(-53)} L${X(-22)} ${Y(-50)} C${X(-16)} ${Y(-60)} ${X(-4)} ${Y(-62)} ${X(4)} ${Y(-58)} L${X(13)} ${Y(-65)} L${X(17)} ${Y(-55)} C${X(30)} ${Y(-54)} ${X(40)} ${Y(-44)} ${X(40)} ${Y(-30)} L${X(46)} ${Y(-31)} L${X(40)} ${Y(-20)} C${X(41)} ${Y(-12)} ${X(40)} ${Y(-6)} ${X(37)} ${Y(0)} C${X(35)} ${Y(-10)} ${X(31)} ${Y(-18)} ${X(25)} ${Y(-22)} L${X(19)} ${Y(-14)} L${X(15)} ${Y(-24)} C${X(8)} ${Y(-22)} ${X(1)} ${Y(-23)} ${X(-4)} ${Y(-27)} L${X(-11)} ${Y(-13)} L${X(-13)} ${Y(-25)} C${X(-22)} ${Y(-23)} ${X(-30)} ${Y(-16)} ${X(-37)} ${Y(0)}Z`;
  let hsh = '';
  for (let i = 0; i < 14; i++) {
    const x = hx - 32 + i * 4.8;
    hsh += Ln(c, `M${f2(x)} ${f2(Y(-22) - Math.sin(i) * 3)} q ${f2(-5 + (i % 3) * 4)} -14 ${f2(3 + (i % 4))} -30`, i % 2 ? '#6a5040' : '#100a08', 1.5, 0.7);
  }
  hs.push(part(c, hairD, L(c, [0, 0, 1, 1], [[0, '#4e3a2c'], [0.5, hair], [1, '#0e0808']]), hsh + E(c, X(-14), Y(-46), 14, 6, '#9a8070', 0.45, 4) + E(c, X(30), Y(-20), 10, 20, DEEP, 0.5, 5)));
  s += G(`translate(${hx} ${hy + 10}) scale(1.1) translate(${-hx} ${-hy})`, hs.join(''));

  // arms
  const mailSleeve = (d) => part(c, d, mail, `<rect x="80" y="150" width="320" height="200" fill="${overShade(c, [0, 0, 1, 0])}"/>`);
  const bracer = (d) => part(c, d, cyl(c, leather, [0, 0, 1, 0.1]), Ln(c, d, lit(leather, 0.5), 1, 0.4, 0, ' stroke-dasharray="3 3"'));
  if (!g) {
    // spear arm (viewer's left)
    s += mailSleeve('M156 182 C138 188 128 206 126 232 C124 256 126 274 130 288 L166 286 C166 262 166 238 170 214 C172 196 168 184 156 182Z');
    s += part(c, 'M130 284 C128 300 124 316 122 330 L144 334 C150 316 158 302 166 286Z', cyl(c, skin, [0, 0, 1, 0.1]));
    s += bracer('M128 296 C130 288 162 288 164 296 L156 322 C148 326 132 326 124 320Z');
    s += G('translate(124 336) rotate(-5)', gripFist(c, skin));
    // other arm: thumb hooked in the belt
    s += mailSleeve('M324 182 C342 188 352 206 354 232 C356 256 354 274 350 288 L314 286 C314 262 314 238 310 214 C308 196 312 184 324 182Z');
    s += part(c, 'M314 284 C318 304 322 318 322 330 L346 328 C348 314 350 300 350 286Z', cyl(c, dk(skin, 0.1), [0, 0, 1, 0.1]));
    s += bracer('M314 294 C318 288 346 288 352 294 L348 318 C340 322 326 322 318 318Z');
    s += part(c, 'M318 326 C326 320 344 320 350 328 C354 340 350 354 340 358 C330 360 320 356 316 346Z', ball(c, dk(skin, 0.05), 1, [0.35, 0.3]),
      Ln(c, 'M322 338 C330 336 340 336 348 338 M322 346 C330 345 338 345 346 347', dk(skin, 0.45), 1.2, 0.6, 0.5));
  } else {
    // spear arm reaching up to grip the planted spear high
    s += mailSleeve('M156 182 C136 182 120 194 112 212 C106 226 108 240 116 250 L148 238 C150 226 156 214 166 204 C170 192 166 184 156 182Z');
    s += part(c, 'M112 244 C108 232 106 214 106 196 L130 196 C130 212 134 228 142 240Z', cyl(c, skin, [0, 0, 1, 0.1]));
    s += bracer('M104 230 C102 214 104 202 106 194 L132 196 C132 208 134 220 140 232 C130 238 114 238 104 230Z');
    s += G('translate(108 186)', gripFist(c, skin));
    // fist on the chest
    s += mailSleeve('M324 182 C342 188 354 206 356 232 C358 256 352 276 342 286 L306 278 C312 256 314 236 310 214 C308 196 312 184 324 182Z');
    s += part(c, 'M340 286 C330 292 306 284 288 262 L300 244 C314 258 330 264 346 260Z', cyl(c, dk(skin, 0.05), [0, 0, 0, 1]));
    s += bracer('M346 284 C334 292 312 286 296 268 L306 250 C320 262 336 266 352 262Z');
    s += part(c, 'M258 226 C266 214 290 214 298 226 C304 238 300 256 288 262 C276 266 262 262 256 250 C252 242 254 232 258 226Z', ball(c, skin, 1, [0.35, 0.3]));
    for (const [y, x2] of [[230, 296], [240, 297], [250, 295]]) s += Ln(c, `M262 ${y} C272 ${y - 3} ${x2 - 12} ${y - 3} ${x2} ${y}`, dk(skin, 0.45), 1.4, 0.7, 0.5);
    s += Ln(c, 'M262 230 C264 220 272 216 282 218', dk(skin, 0.4), 9.4) + Ln(c, 'M262 230 C264 220 272 216 282 218', lit(skin, 0.15), 8) + Ln(c, 'M264 225 C266 220 272 218 278 219', lit(skin, 0.6), 2, 0.6, 0.5);
  }
  // layered leather spaulder on the spear-arm shoulder, with a buckled strap
  const sp0 = s;
  s = '';
  for (let i = 2; i >= 0; i--) {
    const y = 186 + i * 16;
    s += part(c, `M${118 + i * 2} ${y + 10} C${122 + i * 2} ${y - 10} ${150} ${y - 18} ${178 - i * 2} ${y - 8} L${180 - i * 2} ${y + 10} C${160} ${y + 6} ${136} ${y + 12} ${120 + i * 2} ${y + 22}Z`,
      cyl(c, i ? dk(leather, 0.1 * i) : leather, [0, 0, 1, 0.5]),
      Ln(c, `M${122 + i * 2} ${y + 14} C${138} ${y + 6} ${160} ${y + 2} ${178 - i * 2} ${y + 4}`, '#d8b080', 1, 0.55, 0, ' stroke-dasharray="3 3"') + E(c, 140, y + 14, 20, 4, DEEP, 0.5, 2));
  }
  s += part(c, 'M120 192 C122 170 150 160 182 170 L184 182 C160 176 136 182 124 204Z', cyl(c, lit(leather, 0.15), [0, 0, 1, 0.5]), E(c, 142, 176, 16, 5, lit(leather, 0.6), 0.5, 3));
  s += E(c, 150, 196, 3, 3, ball(c, '#b0b4be')) + E(c, 128, 210, 3, 3, ball(c, '#b0b4be'));
  s = sp0 + G(g ? 'translate(18 -4) rotate(-8 150 200)' : 'translate(10 0)', s);
  return wrap(c, s);
}


// ================================================================ vael
// Polished plate: reflections of a dusk sky above, a dark horizon band and
// warm ground below, a cool rim at the right edge.
function plate(c, v = [0, 0, 1, 0], k = 0) {
  return L(c, v, [
    [0, '#3a4052'], [0.08, mix('#c6cde4', '#a8b2c2', k)], [0.18, '#f6f8fd'], [0.3, '#b2bad0'], [0.46, '#5e6578'],
    [0.6, '#282a3a'], [0.74, '#6c7082'], [0.88, '#caa890'], [0.95, '#7c7686'], [1, '#a9c2e6'],
  ]);
}
function dome(c, f = [0.32, 0.26]) {
  return R(c, [0.5, 0.5, 0.62, f[0], f[1]], [
    [0, '#ffffff'], [0.1, '#eef0fa'], [0.3, '#a4aac2'], [0.55, '#525870'], [0.75, '#28293a'], [0.88, '#8a7880'], [1, '#aabfe0'],
  ]);
}
function gilt(c, v = [0, 0, 0, 1]) {
  return L(c, v, [[0, '#fff2b0'], [0.35, '#e8b844'], [0.7, '#a8741c'], [1, '#5a3a0a']]);
}
// A specular streak (drawn inside a clip).
const spec = (c, d, w = 3, op = 0.85, b = 1.2) => Ln(c, d, '#ffffff', w, op, b);

// Eight-pointed white star with fine rays, centred on (0,0), radius r.
function starDevice(c, r) {
  let pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.36 : i % 4 ? r * 0.7 : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  let s = part(c, `${polyD(pts)}Z`, R(c, [0.5, 0.5, 0.6, 0.38, 0.32], [[0, '#ffffff'], [0.6, '#eef2fa'], [1, '#b8c6e0']]),
    S(c, `M0 0 ${pts.slice(4, 13).map((p) => `L${f2(p[0])} ${f2(p[1])}`).join(' ')}Z`, '#8a9cc4', 0.35, 1));
  s += `<circle r="${f2(r * 0.16)}" fill="${R(c, [0.5, 0.5, 0.5, 0.35, 0.3], [[0, '#ffffff'], [1, '#c8d4ea']])}"/>`;
  return s;
}
// Six-armed snowflake, centred on (0,0), radius r.
function snowflake(c, r) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const P2 = (u, v) => `${f2(ca * u - sa * v)} ${f2(sa * u + ca * v)}`;
    d += `M0 0 L${P2(r, 0)} `;
    for (const [u, l] of [[0.42, 0.26], [0.68, 0.2]]) d += `M${P2(r * u, 0)} L${P2(r * (u + l * 0.8), r * l)} M${P2(r * u, 0)} L${P2(r * (u + l * 0.8), -r * l)} `;
  }
  let s = Ln(c, d, '#c4d2ec', r * 0.13);
  s += Ln(c, d, '#ffffff', r * 0.085);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    s += `<circle cx="${f2(Math.cos(a) * r)}" cy="${f2(Math.sin(a) * r)}" r="${f2(r * 0.07)}" fill="#ffffff"/>`;
  }
  s += `<circle r="${f2(r * 0.14)}" fill="#ffffff"/>` + `<circle r="${f2(r * 0.07)}" fill="#c4d2ec"/>`;
  return s;
}

function vael(frame) {
  const c = ctx('vael', frame, 560, 800);
  const g = frame === 'attack';
  const az = '#2a60c0';
  const azD = '#163676';
  const fold = (d, w = 5, op = 0.45, b = 3.4, col = DEEP) => Ln(c, d, col, w, op, b);
  const ao = (d, w = 6, op = 0.55, b = 3) => Ln(c, d, '#0e0c14', w, op, b);
  let s = '';
  const cx = 272;

  // ---------------- lance (behind the arm)
  const lanceX = 102;
  const lance = (top, bot, grip) => {
    let t = '';
    const shaft = `M${lanceX - 7.5} ${bot} L${lanceX - 5} ${top + 40} L${lanceX + 5} ${top + 40} L${lanceX + 7.5} ${bot}Z`;
    let stripes = '';
    for (let y = top + 20; y < bot + 40; y += 30) stripes += `M${lanceX - 12} ${y} L${lanceX + 12} ${y - 16} L${lanceX + 12} ${y - 2} L${lanceX - 12} ${y + 14}Z `;
    t += part(c, shaft, '#f2f4f8', S(c, stripes, az) + `<rect x="${lanceX - 9}" y="${top}" width="18" height="${bot - top}" fill="${L(c, [0, 0, 1, 0], [[0, DEEP, 0.4], [0.25, '#ffffff', 0.35], [0.45, '#ffffff', 0], [0.7, DEEP, 0.35], [0.92, DEEP, 0.6], [1, RIM, 0.4]])}"/>`);
    // tip
    t += part(c, `M${lanceX} ${top} C${lanceX + 6} ${top + 14} ${lanceX + 8} ${top + 30} ${lanceX + 6} ${top + 42} L${lanceX - 6} ${top + 42} C${lanceX - 8} ${top + 30} ${lanceX - 6} ${top + 14} ${lanceX} ${top}Z`, plate(c), spec(c, `M${lanceX - 2} ${top + 8} L${lanceX - 3} ${top + 38}`, 1.6));
    t += part(c, `M${lanceX - 8} ${top + 42} L${lanceX + 8} ${top + 42} L${lanceX + 6} ${top + 52} L${lanceX - 6} ${top + 52}Z`, gilt(c, [0, 0, 1, 0]));
    // pennant, swallow-tailed, flying to the right
    const py = top + 60;
    const pen = `M${lanceX + 5} ${py} C${lanceX + 40} ${py - 6} ${lanceX + 70} ${py + 4} ${lanceX + 104} ${py - 2} L${lanceX + 82} ${py + 22} L${lanceX + 100} ${py + 44} C${lanceX + 66} ${py + 42} ${lanceX + 36} ${py + 52} ${lanceX + 5} ${py + 48}Z`;
    t += part(c, pen, L(c, [0, 0, 1, 0.3], [[0, lit(az, 0.25)], [0.5, az], [1, azD]]),
      fold(`M${lanceX + 30} ${py + 2} C${lanceX + 34} ${py + 20} ${lanceX + 32} ${py + 34} ${lanceX + 36} ${py + 48} M${lanceX + 62} ${py + 2} C${lanceX + 66} ${py + 18} ${lanceX + 62} ${py + 34} ${lanceX + 66} ${py + 46}`, 6, 0.5, 3) +
      Ln(c, `M${lanceX + 14} ${py + 4} C${lanceX + 18} ${py + 20} ${lanceX + 16} ${py + 32} ${lanceX + 18} ${py + 46}`, '#ffffff', 3, 0.3, 2) +
      G(`translate(${lanceX + 40} ${py + 24})`, starDevice(c, 11)));
    // vamplate above the hand
    const vy = grip - 22;
    t += part(c, `M${lanceX - 9} ${vy} L${lanceX + 9} ${vy} L${lanceX + 34} ${vy - 46} L${lanceX - 34} ${vy - 46}Z`, plate(c, [0, 0, 1, 0]),
      spec(c, `M${lanceX - 20} ${vy - 40} L${lanceX - 6} ${vy - 4}`, 2.4) + ao(`M${lanceX - 32} ${vy - 44} L${lanceX + 32} ${vy - 44}`, 3, 0.4));
    t += `<ellipse cx="${lanceX}" cy="${vy - 46}" rx="34" ry="8" fill="${plate(c, [0, 0, 1, 0])}"/>` + `<ellipse cx="${lanceX}" cy="${vy - 46}" rx="27" ry="5" fill="#1e2028"/>`;
    t += part(c, `M${lanceX - 8} ${bot - 14} L${lanceX + 8} ${bot - 14} L${lanceX + 7} ${bot} L${lanceX - 7} ${bot}Z`, plate(c));
    return t;
  };
  s += g ? lance(14, 742, 352) : lance(52, 800, 452);

  // ---------------- plume, swept up and back, with feathery barbs
  const sweep = [[cx + 2, 136], [cx - 8, 100], [cx + 2, 64], [cx + 48, 40], [cx + 110, 46], [cx + 154, 84], [cx + 174, 132], [cx + 180, 178]];
  const plumeLayer = (off, wmax, cols, barbCol, seed) => {
    const pts = sweep.map(([x, y], i) => [x + off[0] * Math.min(1, i / 2), y + off[1] * Math.min(1, i / 2)]);
    const wf = (t) => wmax * (0.3 + 0.95 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.55) * (1 - t * 0.6);
    const d = ribbon(pts, wf, 10);
    const cl = spline(pts, 10);
    let barbs = '';
    for (let i = 3; i < cl.length - 1; i++) {
      const t = i / (cl.length - 1);
      const [x, y] = cl[i];
      const [x2, y2] = cl[i + 1];
      const a = Math.atan2(y2 - y, x2 - x);
      const tx = Math.cos(a);
      const ty = Math.sin(a);
      const nx = -ty;
      const ny = tx;
      const hw = wf(t) / 2;
      for (const sd of [-1, 1]) {
        const ext = hw + 5 + 5 * Math.abs(Math.sin(i * seed));
        const sx = x + nx * sd * hw * 0.2;
        const sy = y + ny * sd * hw * 0.2;
        const ex = x + nx * sd * ext - tx * (10 + 6 * t);
        const ey = y + ny * sd * ext - ty * (10 + 6 * t);
        const qx = x + nx * sd * hw * 0.9 + tx * 2;
        const qy = y + ny * sd * hw * 0.9 + ty * 2;
        barbs += `M${f2(sx)} ${f2(sy)} Q${f2(qx)} ${f2(qy)} ${f2(ex)} ${f2(ey)} `;
      }
    }
    let t = '';
    t += Ln(c, barbs, barbCol, 2.4);
    t += part(c, d, L(c, [0, 0, 1, 1], [[0, cols[2]], [0.45, cols[1]], [1, cols[0]]]),
      Ln(c, barbs, cols[2], 1, 0.5) + Ln(c, polyD(cl), cols[0], 1.2, 0.5) + E(c, cx + 160, 120, 40, 60, DEEP, 0.35, 12));
    return t;
  };
  s += plumeLayer([14, 12], 40, ['#163e8e', az, '#4a7cd8'], '#1e4ea8', 1.7);
  s += plumeLayer([6, 4], 36, ['#b8c6e2', '#f4f6fb', '#ffffff'], '#e4eaf6', 2.3);
  s += plumeLayer([-2, -4], 22, ['#1c4aa4', '#3a74d4', '#7aa6ee'], '#3a74d4', 3.1);
  s += plumeLayer([-8, -10], 14, ['#d0dbef', '#ffffff', '#ffffff'], '#ffffff', 1.3);

  // ---------------- legs
  const leg = (x, side) => {
    let t = '';
    // cuisse with a rolled lower edge
    t += part(c, `M${x - 30} 590 L${x + 30} 590 L${x + 28} 664 L${x - 28} 664Z`, plate(c),
      spec(c, `M${x - 16} 596 L${x - 15} 660`, 3) + Ln(c, `M${x - 28} 646 L${x + 28} 646`, '#22252e', 2, 0.6) + Ln(c, `M${x - 28} 648.5 L${x + 28} 648.5`, '#ffffff', 1, 0.4));
    // greave with a shin ridge
    const gr = `M${x - 26} 690 C${x - 28} 720 ${x - 24} 748 ${x - 20} 774 L${x + 20} 774 C${x + 24} 748 ${x + 28} 720 ${x + 26} 690Z`;
    t += part(c, gr, plate(c),
      spec(c, `M${x - 13} 700 C${x - 14} 724 ${x - 12} 748 ${x - 10} 768`, 3.4) + ao(`M${x - 26} 694 L${x + 26} 694`, 6, 0.5) +
      Ln(c, `M${x - 2} 700 L${x - 2} 772`, '#ffffff', 1.4, 0.5, 0.6) + Ln(c, `M${x + 1} 700 L${x + 1} 772`, '#262a34', 1.4, 0.45, 0.6) +
      E(c, x, 770, 24, 4, DEEP, 0.5, 2));
    // poleyn with its side wing
    t += part(c, `M${x + side * 22} 660 C${x + side * 46} 654 ${x + side * 52} 680 ${x + side * 40} 694 C${x + side * 32} 690 ${x + side * 26} 682 ${x + side * 22} 676Z`, dome(c, side < 0 ? [0.3, 0.3] : [0.6, 0.3]));
    t += part(c, `M${x - 26} 668 C${x - 26} 650 ${x - 12} 640 ${x} 640 C${x + 12} 640 ${x + 26} 650 ${x + 26} 668 C${x + 26} 686 ${x + 12} 700 ${x} 700 C${x - 12} 700 ${x - 26} 686 ${x - 26} 668Z`, dome(c),
      Ln(c, `M${x - 24} 676 C${x - 12} 684 ${x + 12} 684 ${x + 24} 676`, '#2a2e3a', 2, 0.6));
    t += E(c, x, 668, 4, 4, gilt(c));
    // sabaton: three lames widening to a pointed toe, turned a little outward
    const tx = x + side * 7;
    const sab = `M${x - 21} 770 L${x + 21} 770 C${x + 26} 778 ${x + 29} 786 ${x + 27 + side * 3} 793 C${tx + 16} 798 ${tx + 6} 800 ${tx} 800 C${tx - 6} 800 ${tx - 16} 798 ${x - 27 + side * 3} 793 C${x - 29} 786 ${x - 26} 778 ${x - 21} 770Z`;
    t += part(c, sab, dome(c, [0.35, 0.2]),
      Ln(c, `M${x - 24} 778 C${x - 10} 782 ${x + 10} 782 ${x + 24} 778 M${x - 27} 787 C${x - 10} 791 ${x + 10} 791 ${x + 27} 787`, '#1e2028', 1.8, 0.75) +
      spec(c, `M${x - 14} 774 C${x - 8} 776 ${x - 2} 776 ${x + 4} 775`, 1.8));
    return t;
  };
  s += leg(226, -1) + leg(320, 1);
  // fauld between the skirts
  s += part(c, 'M246 424 L300 424 L304 600 L242 600Z', plate(c), Ln(c, 'M244 460 L302 460 M244 500 L302 500 M243 540 L303 540 M243 580 L303 580', '#20232c', 2.4, 0.8) + spec(c, 'M252 430 L250 596', 3));

  // ---------------- surcoat
  const torso = 'M222 262 C200 266 186 278 182 296 C176 334 178 382 188 426 L356 426 C366 382 368 334 362 296 C358 278 344 266 322 262Z';
  s += part(c, torso, L(c, [0, 0, 1, 0.3], [[0, lit(az, 0.15)], [0.22, lit(az, 0.3)], [0.5, az], [0.8, azD], [1, '#3a5a9a']]), drape(c, [180, 262, 366, 426], az, 91, { w: 7 }) +
    E(c, 210, 320, 30, 60, lit(az, 0.6), 0.35, 14) + E(c, 350, 360, 20, 80, DEEP, 0.5, 10) + fold('M300 300 C306 340 308 380 304 420', 6, 0.35, 5));
  s += G(`translate(${cx} 336)`, starDevice(c, 42));
  const skirtL = 'M188 424 L250 424 L246 612 C222 620 196 618 168 608Z';
  const skirtR = 'M296 424 L356 424 L378 608 C350 618 324 620 300 612Z';
  const skirtSh = (x0, x1, dir) => fold(`M${x0 + 18} 440 C${x0 + 14} 500 ${x0 + 8 * dir} 560 ${x0 + 4 * dir} 612 M${x1 - 18} 440 C${x1 - 16} 500 ${x1 - 14} 560 ${x1 - 12} 612`, 9, 0.45, 5) +
    Ln(c, `M${x0 + 8} 440 C${x0 + 4} 500 ${x0 - 2 * dir} 560 ${x0 - 6 * dir} 610`, lit(az, 0.6), 4, 0.35, 3);
  s += part(c, skirtL, L(c, [0, 0, 1, 0], [[0, lit(az, 0.25)], [0.5, az], [1, azD]]), drape(c, [168, 424, 250, 618], az, 92, { w: 7 }) + skirtSh(188, 250, 1) + Ln(c, 'M170 602 C196 612 222 614 246 606', '#e8b844', 5) + Ln(c, 'M170 597 C196 607 222 609 246 601', '#fff2b0', 1.2, 0.7));
  s += part(c, skirtR, L(c, [0, 0, 1, 0], [[0, az], [0.5, azD], [1, '#122a5c']]), drape(c, [296, 424, 378, 618], azD, 93, { w: 7 }) + skirtSh(296, 356, -1) + Ln(c, 'M300 606 C324 614 350 612 376 602', '#c89a34', 5) + E(c, 360, 520, 20, 90, DEEP, 0.45, 10));
  s += ao('M250 426 L246 612 M296 426 L300 612', 4, 0.5, 2);
  // belt
  s += part(c, 'M184 416 C220 424 324 424 360 416 L362 438 C324 446 220 446 182 438Z', L(c, [0, 0, 0, 1], [[0, '#4a2a1a'], [1, '#1e120c']]));
  for (let x = 196; x <= 348; x += 22) s += `<rect x="${x - 6}" y="420" width="12" height="16" rx="2" fill="${gilt(c)}"/>`;
  s += part(c, `M${cx - 14} 414 L${cx + 14} 414 L${cx + 14} 442 L${cx - 14} 442Z`, gilt(c), `<rect x="${cx - 8}" y="420" width="16" height="16" fill="#3a2410"/>` + E(c, cx, 428, 4, 4, '#ff5040'));

  // ---------------- gorget and pauldrons
  s += part(c, `M${cx - 44} 236 C${cx - 30} 244 ${cx + 30} 244 ${cx + 44} 236 L${cx + 50} 272 C${cx + 30} 284 ${cx - 30} 284 ${cx - 50} 272Z`, plate(c),
    Ln(c, `M${cx - 46} 250 C${cx - 30} 260 ${cx + 30} 260 ${cx + 46} 250 M${cx - 48} 262 C${cx - 30} 272 ${cx + 30} 272 ${cx + 48} 262`, '#20232c', 2, 0.8) +
    spec(c, `M${cx - 30} 246 C${cx - 20} 252 ${cx - 6} 254 ${cx + 6} 254`, 2.4));
  const pauldron = (x, side) => {
    let t = '';
    for (let i = 3; i >= 1; i--) {
      const y = 316 + i * 15;
      t += part(c, `M${x - 44} ${y - 14} C${x - 30} ${y - 6} ${x + 30} ${y - 6} ${x + 44} ${y - 14} L${x + 42} ${y + 4} C${x + 28} ${y + 12} ${x - 28} ${y + 12} ${x - 42} ${y + 4}Z`, plate(c, [0, 0, 1, 0.2]),
        ao(`M${x - 42} ${y - 12} C${x - 28} ${y - 4} ${x + 28} ${y - 4} ${x + 42} ${y - 12}`, 5, 0.6) + spec(c, `M${x - 30} ${y - 4} C${x - 20} ${y} ${x - 10} ${y + 1} ${x} ${y + 1}`, 1.8, 0.7) +
        Ln(c, `M${x - 42} ${y + 2} C${x - 28} ${y + 10} ${x + 28} ${y + 10} ${x + 42} ${y + 2}`, '#e8b844', 2.4, 0.9));
    }
    const d = `M${x - 52} 330 C${x - 56} 296 ${x - 36} 262 ${x} 258 C${x + 36} 262 ${x + 56} 296 ${x + 52} 330 C${x + 30} 344 ${x - 30} 344 ${x - 52} 330Z`;
    t += part(c, d, dome(c, side < 0 ? [0.3, 0.28] : [0.4, 0.28]),
      ao(`M${x - 50} 334 C${x - 30} 346 ${x + 30} 346 ${x + 50} 334`, 6, 0.6) + spec(c, `M${x - 34} 300 C${x - 26} 280 ${x - 12} 270 ${x + 4} 268`, 3.2, 0.9, 1.4));
    t += Ln(c, `M${x - 52} 330 C${x - 30} 344 ${x + 30} 344 ${x + 52} 330`, '#e8b844', 4) + Ln(c, `M${x - 50} 328 C${x - 30} 341 ${x + 30} 341 ${x + 50} 328`, '#fff2b0', 1.1, 0.8);
    for (const dx of [-36, 0, 36]) t += E(c, x + dx, 334 + (dx ? -2 : 4), 3, 3, gilt(c));
    return t;
  };

  // ---------------- lance arm (viewer's left)
  const arm = () => {
    let t = '';
    if (!g) {
      t += part(c, 'M150 326 C164 320 184 320 198 326 L192 408 C178 412 162 412 148 408Z', plate(c), spec(c, 'M160 332 L157 404', 3) + ao('M150 330 L198 330', 6, 0.5) + Ln(c, 'M149 372 C164 377 180 377 195 372', '#1e2028', 2, 0.7) + Ln(c, 'M149 375 C164 380 180 380 195 375', '#ffffff', 1, 0.45));
      t += part(c, 'M150 424 C140 436 128 446 116 452 L112 474 C130 470 148 458 162 446Z', plate(c, [0, 0, 0, 1]), spec(c, 'M120 456 C134 452 144 444 152 434', 2.4));
      t += part(c, 'M142 418 C154 400 180 400 192 416 C200 434 190 452 170 456 C152 458 138 444 142 418Z', dome(c), ao('M146 444 C156 454 174 456 188 446', 4, 0.5));
      t += part(c, 'M146 418 C130 404 124 386 132 374 C146 384 156 398 160 414Z', dome(c, [0.3, 0.4]));
      t += E(c, 168, 428, 4, 4, gilt(c));
      t += part(c, 'M130 444 C126 456 124 466 126 476 L104 478 C100 466 102 452 108 444Z', plate(c, [0, 0, 1, 1]));
      t += G(`translate(${lanceX} 456) scale(1.25)`, gauntletGrip(c, 30));
    } else {
      t += part(c, 'M150 326 C164 320 184 320 198 326 L190 390 C176 396 160 396 148 392Z', plate(c), spec(c, 'M160 332 L157 388', 3) + ao('M150 330 L198 330', 6, 0.5) + Ln(c, 'M149 362 C164 367 180 367 194 362', '#1e2028', 2, 0.7) + Ln(c, 'M149 365 C164 370 180 370 194 365', '#ffffff', 1, 0.45));
      t += part(c, 'M150 384 C140 372 128 364 116 360 L110 340 C130 340 150 350 166 368Z', plate(c, [0, 0, 1, 1]), spec(c, 'M118 348 C132 350 146 358 156 368', 2.4));
      t += part(c, 'M140 392 C150 374 176 372 192 386 C202 404 192 424 172 428 C152 430 136 418 140 392Z', dome(c), ao('M144 416 C156 428 176 430 190 420', 4, 0.5));
      t += part(c, 'M146 392 C128 380 122 362 128 350 C142 360 154 374 160 388Z', dome(c, [0.3, 0.4]));
      t += E(c, 168, 400, 4, 4, gilt(c));
      t += part(c, 'M124 366 C118 356 116 344 120 336 L102 330 C96 340 96 356 102 366Z', plate(c, [0, 0, 1, 1]));
      t += G(`translate(${lanceX} 354) scale(1.25)`, gauntletGrip(c, 50));
    }
    return t;
  };

  // ---------------- kite shield on the far arm
  const shield = () => {
    const d = 'M362 296 C400 286 460 286 498 296 C506 380 494 470 470 540 C456 584 440 624 430 668 C418 624 400 584 384 540 C364 470 352 380 362 296Z';
    const inner = 'M370 304 C404 295 456 295 490 304 C496 382 486 468 462 536 C450 574 438 610 430 646 C422 610 410 574 396 536 C372 468 364 382 370 304Z';
    let t = '';
    t += part(c, d, plate(c, [0, 0, 1, 0.3]), spec(c, 'M366 310 C362 380 370 460 390 530', 3, 0.8));
    t += part(c, inner, R(c, [0.4, 0.3, 0.8, 0.32, 0.2], [[0, '#5a90ee'], [0.35, az], [0.75, azD], [1, '#0c1e44']]),
      E(c, 400, 350, 30, 50, '#ffffff', 0.18, 14) + E(c, 470, 470, 26, 120, DEEP, 0.55, 16) + G('translate(430 420)', snowflake(c, 52)));
    for (const [x, y] of [[372, 306], [430, 297], [488, 306], [368, 400], [492, 400], [390, 520], [470, 520]]) t += E(c, x, y, 3, 3, gilt(c));
    return G('rotate(-3 430 470)', t);
  };

  s += pauldron(352, 1);
  s += shield();
  s += arm();
  s += pauldron(194, -1);

  // ---------------- helm
  const hx = cx;
  const hy = 186;
  const hs = [];
  const shell = 'M0 -60 C30 -60 49 -40 49 -8 C49 14 47 36 41 50 C31 62 13 67 0 67 C-13 67 -31 62 -41 50 C-47 36 -49 14 -49 -8 C-49 -40 -30 -60 0 -60Z';
  if (g) {
    // visor raised: the face shows in the opening
    const opening = 'M-31 -16 C-20 -20 20 -20 31 -16 L33 30 C30 46 16 58 0 60 C-16 58 -30 46 -33 30Z';
    let face2 = '';
    face2 += `<rect x="-60" y="-40" width="120" height="120" fill="#2a2430"/>`;
    face2 += G('translate(0 6) scale(0.86)', face(c, {
      skin: '#d8a080', iris: '#5a7a9c', brow: '#6a4a2a', browW: 1.5, expr: 'stern', age: 0.35, ears: false, jaw: 1.08, square: 0.8, cheek: 1.02, shadow: 0.6,
      stubble: '#5a3a24',
    }));
    // short beard and moustache
    face2 += S(c, 'M-26 26 C-24 44 -14 56 0 58 C14 56 24 44 26 26 C20 36 12 40 0 40 C-12 40 -20 36 -26 26Z', L(c, [0, 0, 0, 1], [[0, '#7a5434'], [1, '#3a2414']]), 0.95, 0.4);
    face2 += S(c, 'M0 28 C-6 25 -16 25 -20 31 C-22 35 -21 39 -19 41 C-16 36 -10 33 -4 33 L0 32 L4 33 C10 33 16 36 19 41 C21 39 22 35 20 31 C16 25 6 25 0 28Z', L(c, [0, 0, 0, 1], [[0, '#8a6444'], [1, '#3a2414']]), 1, 0.3);
    face2 += E(c, 0, -14, 34, 10, '#0e0c14', 0.75, 6) + E(c, 30, 20, 8, 40, '#0e0c14', 0.6, 6) + E(c, -30, 20, 6, 40, '#0e0c14', 0.45, 6);
    hs.push(`<g clip-path="${clipD(c, opening)}">${face2}</g>`);
    hs.push(`<path d="${shell} ${opening}" fill-rule="evenodd" fill="${dome(c, [0.34, 0.2])}"/>`);
    hs.push(`<g clip-path="${clipD(c, shell)}">` +
      Ln(c, opening, '#1a1c24', 5, 0.7, 2) + Ln(c, 'M-33 -16 L-33 30 C-30 46 -16 58 0 60', '#ffffff', 1.6, 0.45, 0.6) +
      spec(c, 'M-34 -44 C-24 -54 -10 -58 4 -58', 4, 0.9, 1.6) + E(c, 38, 20, 12, 50, DEEP, 0.4, 8) + '</g>');
    hs.push('@VISOR@');
  } else {
    hs.push(part(c, shell, dome(c, [0.34, 0.24]),
      E(c, 38, 20, 14, 56, DEEP, 0.45, 8) + spec(c, 'M-34 -44 C-24 -54 -10 -58 4 -58', 4, 0.9, 1.6) +
      Ln(c, 'M0 -60 L0 66', '#ffffff', 2, 0.35, 0.8) + Ln(c, 'M2 -58 L2 66', '#1a1c24', 1.6, 0.5, 0.6)));
    // visor with a pointed ridge, eye slit and breaths
    const visor = 'M-44 -16 C-30 -20 30 -20 44 -16 L45 18 C40 40 22 58 0 64 C-22 58 -40 40 -45 18Z';
    hs.push(part(c, visor, L(c, [0, 0, 1, 0.2], [[0, '#59616f'], [0.18, '#e9eef6'], [0.42, '#9aa4b4'], [0.5, '#f4f7fb'], [0.56, '#5a6272'], [0.8, '#2c303c'], [0.94, '#8c8a94'], [1, '#a9c2e6']]),
      Ln(c, 'M0 -16 L0 64', '#ffffff', 2, 0.6, 0.6) + spec(c, 'M-36 -6 C-34 14 -28 32 -16 48', 2.6, 0.7)));
    hs.push(P('M-38 -8 C-24 -11 24 -11 38 -8 L38 -1 C24 -3 -24 -3 -38 -1Z', '#06070a') + Ln(c, 'M-36 -0.5 C-24 -2 24 -2 36 -0.5', '#9aa4b4', 1, 0.7) + P('M-2 -11 L2 -11 L2 -1 L-2 -1Z', '#3a404c'));
    for (let i = 0; i < 4; i++) hs.push(P(`M${14 + i * 0} ${16 + i * 8} l16 -3 l0 3 l-16 3Z`, '#06070a') + P(`M${-30} ${13 + i * 8} l16 3 l0 3 l-16 -3Z`, '#06070a'));
  }
  // gold circlet with small points
  const circ = 'M-50 -24 C-30 -32 30 -32 50 -24 L50 -12 C30 -20 -30 -20 -50 -12Z';
  hs.push(part(c, circ, gilt(c), Ln(c, 'M-50 -22 C-30 -30 30 -30 50 -22', '#fff6c8', 1.2, 0.8) + E(c, 40, -16, 10, 6, DEEP, 0.4, 3)));
  for (const x of [-36, -12, 12, 36]) hs.push(part(c, `M${x - 6} ${-27 - Math.abs(x) * 0.02} L${x} ${-40} L${x + 6} ${-27}Z`, gilt(c, [0, 0, 1, 1])));
  for (const x of [-24, 0, 24]) hs.push(E(c, x, -19, 3.2, 3.2, R(c, [0.5, 0.5, 0.5, 0.35, 0.3], [[0, '#c8e0ff'], [0.5, '#3a74d4'], [1, '#10285a']])));
  // plume socket
  hs.push(part(c, 'M-7 -74 L7 -74 L6 -58 L-6 -58Z', gilt(c, [0, 0, 1, 0])));
  let helm = hs.join('');
  if (g) {
    // the raised visor rides up over the skull, its slit and breaths showing
    const vis = 'M-46 -36 C-40 -58 -22 -66 0 -66 C22 -66 40 -58 46 -36 C30 -44 -30 -44 -46 -36Z';
    let v = part(c, vis, L(c, [0, 0, 0, 1], [[0, '#f4f7fb'], [0.3, '#aab4c4'], [0.6, '#596170'], [1, '#2c303c']]),
      S(c, 'M-34 -50 C-20 -56 20 -56 34 -50 L33 -46 C20 -52 -20 -52 -33 -46Z', '#06070a') + Ln(c, 'M0 -66 L0 -40', '#ffffff', 1.6, 0.5) +
      spec(c, 'M-34 -46 C-26 -58 -12 -62 2 -63', 2.4, 0.9) + E(c, 36, -44, 10, 8, DEEP, 0.5, 3));
    v += E(c, -46, -30, 5, 5, gilt(c)) + E(c, 46, -30, 5, 5, gilt(c));
    helm = helm.replace('@VISOR@', '') + v + part(c, 'M-7 -78 L7 -78 L6 -62 L-6 -62Z', gilt(c, [0, 0, 1, 0]));
  }
  s += G(`translate(${hx} ${hy})`, helm);

  // the plume against the light: a soft, semi-transparent backlit glow
  let under = '';
  for (const [x, y, r, op] of [[cx + 40, 60, 70, 0.22], [cx + 110, 70, 80, 0.22], [cx + 165, 130, 60, 0.2]]) under += halo(c, x, y, r, '#dfe8ff', op);
  under += halo(c, cx + 80, 40, 140, '#ffd9a0', 0.1);
  return wrap(c, s, { under, fx: { kd: 1.4 } });
}


// ================================================================ raven
// One glossy black feather from base to tip, with a blue-violet sheen.
function feather(c, x0, y0, x1, y1, w, bend = 0, k = 1) {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const pts = [[x0, y0], [mx - (dy / l) * bend, my + (dx / l) * bend], [x1, y1]];
  const d = ribbon(pts, (t) => w * (t < 0.8 ? 0.75 + 0.25 * Math.sin((t / 0.8) * Math.PI * 0.5) : Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2))), 8);
  const sheen = L(c, [0, 0, 1, 1], [[0, '#1e1e34'], [0.35 * k, '#0c0a14'], [0.6, '#1a1838'], [0.74, '#34307a'], [0.84, '#0e0c18'], [1, '#07060b']]);
  return part(c, d, sheen, Ln(c, polyD(spline(pts, 6)), '#34345a', 0.9, 0.7)) + Ln(c, d, '#5a5ab0', 0.7, 0.3);
}

function raven(frame) {
  const c = ctx('raven', frame, 400, 400);
  const g = frame === 'attack';
  const black = '#16141e';
  const bark = '#5e3c24';
  const fold = (d, w = 4, op = 0.5, b = 3, col = DEEP) => Ln(c, d, col, w, op, b);
  const glossy = (v = [0, 0, 1, 1]) => L(c, v, [[0, '#262640'], [0.22, '#0e0c16'], [0.5, '#141226'], [0.6, '#2e2a6a'], [0.7, '#0e0c18'], [1, '#06050a']]);
  let s = '';

  // ---------------- broken stump
  const stump = 'M128 400 C134 370 140 330 142 290 L146 252 L160 262 L170 238 L184 256 L196 236 L210 254 L226 226 L236 250 L252 240 L262 262 L274 250 L278 290 C282 330 290 370 302 400Z';
  let bs = '';
  for (let x = 150; x < 290; x += 13) bs += Ln(c, `M${x} 262 C${x + 2} 300 ${x - 2} 340 ${x + 3} 400`, '#2a160c', 3, 0.6, 0.8) + Ln(c, `M${x + 4} 270 C${x + 6} 310 ${x + 2} 350 ${x + 7} 400`, '#9a7050', 1.2, 0.35);
  bs += E(c, 160, 320, 26, 80, '#c89068', 0.25, 12) + E(c, 290, 340, 22, 90, DEEP, 0.6, 12);
  bs += E(c, 214, 340, 10, 14, '#2a160c', 0.9) + E(c, 214, 338, 6, 9, '#120a06');
  s += part(c, stump, L(c, [0, 0, 1, 0], [[0, lit(bark, 0.2)], [0.3, bark], [0.75, dk(bark, 0.45)], [1, dk(bark, 0.6)]]), bs);
  // pale broken wood at the top
  s += part(c, 'M146 252 L160 262 L170 238 L184 256 L196 236 L210 254 L226 226 L236 250 L252 240 L262 262 L274 250 L276 268 C240 278 180 278 148 268Z', L(c, [0, 0, 0, 1], [[0, '#e8cfa0'], [0.6, '#b8925e'], [1, '#6a4a2a']]),
    Ln(c, 'M170 240 L174 266 M196 238 L198 268 M226 228 L224 270 M252 242 L248 268', '#8a6a40', 1.2, 0.8));
  // roots and moss
  s += part(c, 'M128 400 C112 392 96 392 84 400Z', bark) + part(c, 'M302 400 C318 390 336 392 350 400Z', dk(bark, 0.3));
  s += part(c, 'M126 400 C130 380 150 368 176 374 C200 380 214 392 220 400Z', L(c, [0, 0, 0, 1], [[0, '#6a9a3a'], [1, '#2a4a1a']]), E(c, 156, 380, 14, 5, '#a8d070', 0.5, 3));
  s += part(c, 'M240 400 C252 384 278 380 300 388 C312 392 318 396 322 400Z', L(c, [0, 0, 0, 1], [[0, '#4a7a2e'], [1, '#1e3a14']]));
  for (let i = 0; i < 11; i++) {
    const x = 104 + i * 21 + (i % 3) * 5;
    const lean = i % 2 ? 1 : -1;
    const h = 26 + (i % 4) * 7;
    s += part(c, `M${x - 4} 400 Q${x + lean * 4} ${400 - h * 0.6} ${x + lean * 12} ${400 - h} Q${x + lean * 2} ${400 - h * 0.5} ${x + 4} 400Z`, L(c, [0, 1, 0, 0], [[0, '#2a4a18'], [1, '#8ac050']]));
  }

  // ---------------- the bird (scaled up around the perch)
  const ground = s;
  s = '';
  const R0 = rng(g ? 77 : 33);
  const sheenL = '#6c68d4';
  const sheenM = '#36326c';
  // one painted feather: a dark tapered vane with a rounded tip, a glossy
  // lit edge on the side toward the light and a darker shaft side
  const pf = (x0, y0, x1, y1, w, lift = 1) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const pts = [[x0, y0], [x0 + dx * 0.5 + nx * w * 0.08, y0 + dy * 0.5 + ny * w * 0.08], [x1, y1]];
    const d = ribbon(pts, (t) => w * (t < 0.82 ? 0.55 + 0.45 * Math.sin((t / 0.82) * Math.PI * 0.5) : Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.18) ** 2))), 6);
    const up = ny < 0 ? 1 : -1;
    const edge = [[x0 + nx * w * 0.32 * up, y0 + ny * w * 0.32 * up], [x0 + dx * 0.55 + nx * w * 0.42 * up, y0 + dy * 0.55 + ny * w * 0.42 * up], [x1 - dx * 0.06 + nx * w * 0.2 * up, y1 - dy * 0.06 + ny * w * 0.2 * up]];
    return part(c, d, L(c, [0, 0, 1, 1], [[0, '#1c1a2c'], [0.5, '#121018'], [1, '#08070c']]),
      brush(c, edge, w * 0.36, lift > 0.6 ? sheenL : sheenM, 0.7 * lift, 0.9) +
      brush(c, edge.map(([x, y]) => [x - nx * w * 0.5 * up, y - ny * w * 0.5 * up]), w * 0.3, '#05040a', 0.5, 1));
  };
  // rows of overlapping rounded feather tips over a mass (scallops)
  const scallops = (cx, cy, rx, ry, rows, per, dir, sz, lift) => {
    let t = '';
    for (let rI = rows - 1; rI >= 0; rI--) {
      for (let k = 0; k < per; k++) {
        const u = (k + 0.5 + (rI % 2) * 0.5) / per - 0.5;
        const v = rI / Math.max(1, rows - 1) - 0.5;
        const x = cx + u * rx * 2 + (R0() - 0.5) * 4;
        const y = cy + v * ry * 2 + (R0() - 0.5) * 4;
        const lightness = Math.max(0.15, Math.min(1, lift * (0.9 - u * 0.9 - v * 0.6)));
        t += pf(x - dir * sz * 0.3, y - sz * 0.5, x + dir * sz * 0.35, y + sz * 0.55, sz * 0.95, lightness);
      }
    }
    return t;
  };
  const bodyFill = (v = [0, 0, 1, 1]) => L(c, v, [[0, '#2a2844'], [0.3, '#14121e'], [0.7, '#0c0a12'], [1, '#07060b']]);
  const beak = (open) => {
    let t = '';
    const upper = open
      ? 'M128 76 C110 62 86 58 64 62 C56 64 52 70 54 76 C56 80 60 78 62 76 C84 78 106 84 126 96Z'
      : 'M114 90 C96 82 74 84 56 94 C48 98 44 104 46 110 C48 114 52 112 54 109 C70 110 92 114 114 124Z';
    t += part(c, upper, L(c, [0, 0, 0, 1], [[0, '#5e5c70'], [0.3, '#2a2834'], [1, '#08070c']]),
      brush(c, open ? [[122, 76], [100, 68], [72, 66]] : [[108, 90], [88, 88], [62, 96]], 5, '#a8a6bc', 0.5, 0.8));
    if (open) {
      t += S(c, 'M126 96 C106 88 86 86 66 84 C86 94 106 102 126 106Z', '#6a1a2a') + E(c, 102, 94, 12, 4, '#c04a5e', 0.8, 1, 8);
      t += part(c, 'M126 102 C108 104 90 110 72 120 C68 123 69 126 73 125 C92 120 110 116 126 114Z', L(c, [0, 0, 0, 1], [[0, '#3a3848'], [1, '#08070c']]));
    }
    return t;
  };
  if (!g) {
    // tail, long and wedge-shaped
    for (const [x1, y1, w] of [[344, 300, 22], [332, 318, 22], [322, 330, 20], [350, 284, 18]]) s += pf(262, 214, x1, y1, w, 0.5);
    // feet gripping the stump
    for (const [x, y] of [[204, 226], [232, 232]]) {
      s += Ln(c, `M${x + 4} ${y - 22} L${x} ${y}`, '#1a1820', 7) + Ln(c, `M${x} ${y} l-15 6 M${x} ${y} l-4 11 M${x} ${y} l9 8 M${x} ${y} l15 2`, '#1a1820', 5);
    }
    // body mass, then feathered planes over it
    const body = 'M128 132 C146 108 196 108 238 124 C274 140 294 176 286 206 C278 232 250 240 220 234 C186 228 158 210 142 186 C130 168 122 150 128 132Z';
    s += part(c, body, bodyFill(),
      scallops(196, 190, 60, 26, 3, 6, 1, 22, 0.7) + E(c, 182, 132, 46, 16, sheenL, 0.3, 8) + E(c, 254, 214, 34, 24, DEEP, 0.6, 8));
    // folded wing: coverts as scallops, then long primaries over the tail
    const wing = 'M164 130 C200 114 246 122 272 148 C294 170 306 200 316 238 C290 232 256 222 228 210 C198 196 174 176 164 156Z';
    s += part(c, wing, bodyFill([0, 0, 1, 0.6]), scallops(222, 160, 44, 24, 3, 5, 1, 24, 1) + E(c, 206, 140, 34, 12, sheenL, 0.35, 6));
    for (let i = 0; i < 5; i++) s += pf(232 + i * 7, 186 + i * 5, 318 + i * 5, 240 + i * 6, 16, 0.85 - i * 0.12);
    // head and the shaggy throat hackles
    s += part(c, 'M112 128 C116 148 130 162 150 168 L160 150 L152 138 C136 140 122 136 112 128Z', bodyFill());
    for (let i = 0; i < 6; i++) s += pf(118 + i * 6, 128 + i * 3, 116 + i * 7, 156 + i * 4, 11, 0.5);
    const head = 'M102 108 C102 82 122 66 148 66 C172 66 188 82 190 104 C192 124 180 138 164 142 C144 146 120 142 110 132 C104 124 102 116 102 108Z';
    s += part(c, head, bodyFill([0, 0, 1, 0.8]),
      brush(c, [[112, 92], [134, 72], [162, 70]], 12, sheenL, 0.5, 2) + brush(c, [[116, 112], [140, 100], [170, 98]], 9, sheenM, 0.4, 2) + E(c, 178, 122, 14, 20, DEEP, 0.6, 5));
    s += beak(false);
    s += brush(c, [[112, 96], [122, 90], [134, 92]], 7, '#2a2840', 0.9, 0.6);
    // the single bright eye
    s += E(c, 142, 94, 8, 7.6, '#0a0810') + E(c, 142, 94, 5.8, 5.6, R(c, [0.5, 0.5, 0.5, 0.4, 0.35], [[0, '#fff2b0'], [0.4, '#f0b030'], [1, '#8a4a08']])) +
      E(c, 142.4, 94.4, 2.6, 2.8, '#0a0608') + E(c, 140, 91.6, 1.8, 1.6, '#ffffff');
  } else {
    // wings spread wide, beak open
    const wingMass = (sx, sy, dir, far) => {
      let t = '';
      const tone = far ? 0.55 : 1;
      // primaries, fingered, fanning up and out
      for (let i = 0; i < 7; i++) {
        const a = (dir < 0 ? -92 - i * 9.5 : -100 + (8 + i * 11)) * (Math.PI / 180);
        const len = 146 - i * 6 - (far ? 14 : 0);
        const bx = sx + dir * (40 + i * 6);
        const by = sy - 30 + i * 6;
        t += pf(bx, by, bx + Math.cos(a) * len * 0.2 + dir * len * 0.72, by + Math.sin(a) * len * 0.9, 20 - i * 0.6, tone * (1 - i * 0.06));
      }
      // secondaries along the trailing edge
      for (let i = 0; i < 6; i++) {
        const bx = sx + dir * (12 + i * 9);
        const by = sy + 4 + i * 2;
        t += pf(bx, by - 10, bx + dir * (18 + i * 4), by + 56 - i * 4, 19, tone * 0.7);
      }
      // coverts: the inner arm of the wing as rows of scallops
      const cov = dir < 0
        ? `M${sx} ${sy} C${sx - 30} ${sy - 50} ${sx - 80} ${sy - 76} ${sx - 120} ${sy - 80} C${sx - 110} ${sy - 50} ${sx - 70} ${sy - 10} ${sx - 20} ${sy + 20}Z`
        : `M${sx} ${sy} C${sx + 30} ${sy - 50} ${sx + 80} ${sy - 76} ${sx + 120} ${sy - 80} C${sx + 110} ${sy - 50} ${sx + 70} ${sy - 10} ${sx + 20} ${sy + 20}Z`;
      t += part(c, cov, bodyFill([dir < 0 ? 1 : 0, 0, dir < 0 ? 0 : 1, 1]),
        scallops(sx + dir * 58, sy - 34, 52, 26, 3, 6, dir, 22, tone) + E(c, sx + dir * 60, sy - 56, 34, 10, sheenL, 0.3 * tone, 6, dir * -30));
      return t;
    };
    s += wingMass(196, 158, -1, true);
    for (const [x1, y1, w] of [[296, 316, 22], [276, 330, 22], [312, 300, 18]]) s += pf(236, 218, x1, y1, w, 0.5);
    for (const [x, y] of [[198, 228], [228, 232]]) {
      s += Ln(c, `M${x + 3} ${y - 22} L${x} ${y}`, '#1a1820', 7) + Ln(c, `M${x} ${y} l-15 6 M${x} ${y} l-4 11 M${x} ${y} l9 8 M${x} ${y} l15 2`, '#1a1820', 5);
    }
    const body = 'M150 118 C170 98 214 104 240 126 C266 148 270 184 258 206 C246 228 220 234 196 226 C170 216 154 192 148 164 C144 146 142 130 150 118Z';
    s += part(c, body, bodyFill(), scallops(206, 176, 44, 34, 4, 5, 1, 22, 0.8) + E(c, 240, 200, 26, 20, DEEP, 0.55, 8));
    s += wingMass(222, 160, 1, false);
    s += part(c, 'M126 112 C132 132 146 146 166 152 L176 136 L168 124 C152 126 136 122 126 112Z', bodyFill());
    for (let i = 0; i < 6; i++) s += pf(130 + i * 7, 114 + i * 3, 128 + i * 8, 144 + i * 4, 11, 0.5);
    const head = 'M118 92 C116 68 134 50 158 50 C180 50 196 64 198 86 C200 104 190 118 174 122 C156 126 134 124 124 114 C120 108 118 100 118 92Z';
    s += part(c, head, bodyFill([0, 0, 1, 0.8]), brush(c, [[126, 76], [148, 56], [176, 54]], 12, sheenL, 0.5, 2) + E(c, 186, 104, 14, 20, DEEP, 0.55, 5));
    s += beak(true);
    s += brush(c, [[126, 80], [136, 74], [148, 76]], 7, '#2a2840', 0.9, 0.6);
    s += E(c, 158, 78, 8, 7.6, '#0a0810') + E(c, 158, 78, 5.8, 5.6, R(c, [0.5, 0.5, 0.5, 0.4, 0.35], [[0, '#fff6c0'], [0.4, '#ffbe3a'], [1, '#9a5008']])) +
      E(c, 158.4, 78.4, 2.4, 2.8, '#0a0608') + E(c, 156, 75.6, 1.8, 1.6, '#ffffff');
  }
  s = ground + G(g ? 'translate(204 240) scale(0.95) translate(-216 -238)' : 'translate(216 238) scale(1.18) translate(-216 -238)', s);
  return wrap(c, s, { fx: { ow: 2.2, rim: 0.9 } });
}


// ================================================================ hand
// The player's own sword hand, a screen overlay for the bottom-right
// corner. The hand, hilt and blade are drawn in a local frame (grip along
// y, blade toward -y, back of the gauntlet toward +x); the frame is then
// rotated (idle) or reflected across the diagonal (attack, blade to the
// left). The arm runs off the right and bottom edges.
function ruby(c, rx, ry) {
  return E(c, 0, 0, rx, ry, R(c, [0.5, 0.5, 0.6, 0.38, 0.32], [[0, '#ffd0d0'], [0.18, '#ff4a50'], [0.55, '#a80c1c'], [1, '#3a0208']])) +
    E(c, -rx * 0.35, -ry * 0.35, rx * 0.28, ry * 0.2, '#ffffff', 0.85, 0.6);
}

function hand(frame) {
  const c = ctx('hand', frame, 960, 960);
  const g = frame === 'attack';
  const crim = '#9a1420';
  const fold = (d, w = 6, op = 0.5, b = 4, col = DEEP) => Ln(c, d, col, w, op, b);
  const steelV = (v = [0, 0, 0, 1]) => L(c, v, [[0, '#eef2f8'], [0.16, '#aab2c0'], [0.36, '#5a6272'], [0.56, '#262a36'], [0.8, '#4e5464'], [0.93, '#9a8a7c'], [1, '#8aa2c8']]);
  const steelH = (v = [0, 0, 1, 0]) => plate(c, v);
  const sp = (d, w = 3, op = 0.85, b = 1.2) => Ln(c, d, '#ffffff', w, op, b);

  // ---------------- blade, guard, grip (local frame)
  let blade = '';
  const bl = 'M-34 -112 L-31 -500 C-27 -548 -14 -592 0 -628 C14 -592 27 -548 31 -500 L34 -112Z';
  // painted as two bold bevel planes either side of the ridge: the lit
  // plane takes the sky, the far plane falls into shadow
  const bevL = 'M-34 -112 L-31 -500 C-27 -548 -14 -592 0 -628 L0 -112Z';
  const bevR = 'M34 -112 L31 -500 C27 -548 14 -592 0 -628 L0 -112Z';
  const swordBlade = part(c, bl, '#5a6070',
    P(bevL, L(c, [0, 1, 0, 0], [[0, '#b8c2d0'], [0.45, '#eef3fa'], [0.7, '#c8d2e0'], [1, '#f6f9fd']])) +
    P(bevR, L(c, [0, 1, 0, 0], [[0, '#3a3e4a'], [0.5, '#5c6476'], [0.8, '#40465a'], [1, '#7a8498']])) +
    brush(c, [[-20, -140], [-18, -360], [-12, -560]], 9, '#ffffff', 0.55, 2) +
    brush(c, [[16, -150], [15, -380], [8, -560]], 8, '#20242e', 0.45, 2) +
    Ln(c, 'M0 -116 L0 -626', '#ffffff', 2.4, 0.7, 0.6) + Ln(c, 'M30 -112 L28 -500', RIM, 3, 0.6, 1) +
    E(c, -14, -250, 12, 60, '#ffd9a0', 0.25, 8) +
    G('translate(0 -170)', Ln(c, 'M0 -14 L0 14 M-10 0 L10 0 M-7 -7 L7 7 M7 -7 L-7 7', '#e8b844', 2.4, 0.9)));
  blade += swordBlade;
  const bladeOnly = () => blade;
  // grip: leather with gold wire
  let wire = '';
  for (let y = -94; y < 92; y += 13) wire += `M-15 ${y + 6} L15 ${y} `;
  blade += part(c, 'M-15 -96 L15 -96 L16 94 L-16 94Z', L(c, [0, 0, 1, 0], [[0, '#6a2a1c'], [0.3, '#8a3a26'], [0.7, '#3a140c'], [1, '#5a2a24']]),
    Ln(c, wire, '#e8b844', 2.6, 0.95) + Ln(c, wire, '#2a0e08', 1, 0.6, 0.6));
  // guard: gold bar, finials and rubies
  const guard = 'M-158 -108 C-100 -116 -40 -118 0 -118 C40 -118 100 -116 158 -108 L160 -88 C100 -96 40 -98 0 -98 C-40 -98 -100 -96 -160 -88Z';
  blade += part(c, guard, gilt(c), Ln(c, 'M-150 -110 C-100 -116 -40 -118 0 -118 C40 -118 100 -116 150 -110', '#fff8d0', 2, 0.8) + E(c, 100, -96, 50, 6, '#3a2208', 0.5, 4));
  for (const x of [-170, 170]) {
    blade += E(c, x, -99, 20, 20, R(c, [0.5, 0.5, 0.6, 0.35, 0.3], [[0, '#fff6c8'], [0.35, '#e8b844'], [0.8, '#8a5a12'], [1, '#4a2e06']]));
    blade += G(`translate(${x} -99)`, ruby(c, 9, 9));
  }
  blade += part(c, 'M0 -146 L30 -108 L0 -64 L-30 -108Z', gilt(c, [0, 0, 1, 1]), Ln(c, 'M0 -146 L-30 -108 L0 -64', '#fff6c8', 2, 0.7));
  blade += G('translate(0 -106)', ruby(c, 13, 17));

  // ---------------- gauntlet (local frame)
  let back = '';
  // back of the hand: a broad convex plate on the +x side
  const bh = 'M22 -80 C56 -90 94 -74 108 -42 C118 -10 118 30 110 64 C100 88 76 102 50 102 C34 102 22 94 18 84Z';
  back += part(c, bh, R(c, [0.4, 0.4, 0.75, 0.3, 0.25], [[0, '#ffffff'], [0.12, '#e2e8f0'], [0.35, '#97a1b2'], [0.6, '#4a5160'], [0.82, '#2a2e3a'], [1, '#8aa2c8']]),
    sp('M40 -74 C70 -78 92 -64 102 -40', 3, 0.85, 1.4) + Ln(c, 'M28 -40 C60 -46 92 -36 112 -16 M26 10 C60 4 94 12 114 28 M24 56 C56 52 86 60 108 74', '#20232c', 2.4, 0.6, 0.8) +
    Ln(c, 'M28 -37 C60 -43 92 -33 112 -13 M26 13 C60 7 94 15 114 31', '#ffffff', 1, 0.4) + E(c, 100, 40, 16, 50, DEEP, 0.45, 8));
  back += Ln(c, 'M24 -76 C56 -86 92 -70 106 -40 C116 -10 116 30 108 62', '#e8b844', 3.4, 0.95) + Ln(c, 'M26 -79 C56 -89 92 -73 106 -43', '#fff6c8', 1, 0.7);
  for (const [x, y] of [[66, -60], [92, -26], [100, 20], [86, 70]]) back += E(c, x, y, 4.4, 4.4, gilt(c));

  let fing = '';
  // a rounded steel lame between x0 and x1 (local), from y0 to y1
  const lame = (x0, x1, y0, y1, rl = 4, rr = 4) => {
    const h = y1 - y0;
    const d = `M${x0 + rl} ${y0} L${x1 - rr} ${y0} C${x1 - rr * 0.3} ${y0} ${x1} ${y0 + h * 0.2} ${x1} ${y0 + h * 0.5} C${x1} ${y0 + h * 0.8} ${x1 - rr * 0.3} ${y1} ${x1 - rr} ${y1} L${x0 + rl} ${y1} C${x0 + rl * 0.3} ${y1} ${x0} ${y0 + h * 0.8} ${x0} ${y0 + h * 0.5} C${x0} ${y0 + h * 0.2} ${x0 + rl * 0.3} ${y0} ${x0 + rl} ${y0}Z`;
    return part(c, d, steelV(),
      sp(`M${x0 + rl} ${y0 + h * 0.2} L${x1 - rr} ${y0 + h * 0.2}`, 2, 0.85, 0.7) +
      Ln(c, `M${x0 + rl} ${y0 + h * 0.48} L${x1 - rr} ${y0 + h * 0.48}`, '#ffffff', 1, 0.3, 0.4) +
      E(c, (x0 + x1) / 2, y1 - 3, (x1 - x0) * 0.6, 6, DEEP, 0.7, 2.4) + E(c, x1 - 3, y0 + h * 0.5, 5, h * 0.5, DEEP, 0.45, 2));
  };
  const rows = [[-76, -42, -60], [-40, -6, -64], [-4, 30, -62], [32, 62, -52]];
  rows.forEach(([y0, y1, xl], i) => {
    const h = y1 - y0;
    // fingertip, curled under: a rounded cap
    fing += lame(xl - 6, xl + 26, y0 + 3, y1 - 1, h * 0.45, 5);
    // middle lame overlapping the tip
    fing += lame(xl + 20, 16, y0 + 1, y1, 5, 5);
    fing += Ln(c, `M${xl + 22} ${y0 + 3} L${xl + 22} ${y1 - 2}`, '#0e0c14', 2.4, 0.55, 1);
    // proximal lame toward the knuckle
    fing += lame(10, 52, y0 - 1, y1 + 1, 5, 8);
    fing += Ln(c, `M12 ${y0 + 1} L12 ${y1 - 1}`, '#0e0c14', 2.6, 0.6, 1);
    fing += E(c, xl + 24, y0 + h * 0.5, 2.6, 2.6, gilt(c)) + E(c, 15, y0 + h * 0.5, 2.6, 2.6, gilt(c));
    if (i < 3) fing += Ln(c, `M${xl - 2} ${y1 + 0.5} L52 ${y1 + 1.5}`, '#0a0a10', 2.6, 0.75, 0.8);
  });
  // knuckle plate: a gilt-edged band over the knuckles with four bosses
  const kp = 'M40 -84 C50 -86 60 -84 64 -80 C70 -40 70 20 64 70 C58 74 48 74 42 70 C46 20 46 -40 40 -84Z';
  fing += part(c, kp, steelV([0, 0, 1, 0]), sp('M46 -78 C50 -40 50 20 47 64', 2.4, 0.8, 0.8) + E(c, 62, 0, 4, 70, DEEP, 0.45, 3));
  fing += Ln(c, 'M40 -84 C46 -40 46 20 42 70', '#e8b844', 3) + Ln(c, 'M64 -80 C70 -40 70 20 64 70', '#c8962c', 3);
  for (const y of [-58, -22, 13, 47]) fing += E(c, 53, y, 9, 11, dome(c, [0.3, 0.25])) + E(c, 51, y - 3, 2.4, 2, '#ffffff', 0.9);
  // thumb: three overlapping lames wrapping over the index toward the guard
  const tl = (cx0, cy0, rx, ry, rot) => G(`translate(${cx0} ${cy0}) rotate(${rot})`,
    part(c, `M${-rx} 0 C${-rx} ${-ry * 1.1} ${rx} ${-ry * 1.1} ${rx} 0 C${rx} ${ry * 0.9} ${-rx} ${ry * 0.9} ${-rx} 0Z`, steelV(),
      sp(`M${-rx * 0.7} ${-ry * 0.45} C${-rx * 0.2} ${-ry * 0.7} ${rx * 0.3} ${-ry * 0.7} ${rx * 0.7} ${-ry * 0.5}`, 2.2, 0.9, 0.7) + E(c, 0, ry * 0.6, rx * 0.9, 4, DEEP, 0.5, 2)));
  fing += tl(60, -68, 38, 22, -30) + tl(22, -88, 32, 20, -12) + tl(-14, -94, 27, 18, -4);
  fing += part(c, 'M-30 -110 C-50 -110 -62 -100 -60 -88 C-58 -78 -44 -76 -30 -80Z', steelV(), sp('M-50 -102 C-42 -107 -36 -107 -30 -105', 1.8, 0.8));
  fing += E(c, 36, -86, 2.8, 2.8, gilt(c)) + E(c, 2, -96, 2.6, 2.6, gilt(c));

  // pommel: gold wheel with a ruby
  let pom = '';
  pom += part(c, 'M-11 96 L11 96 L13 112 L-13 112Z', gilt(c, [0, 0, 1, 0]));
  pom += E(c, 0, 132, 34, 30, R(c, [0.5, 0.5, 0.6, 0.35, 0.3], [[0, '#fff6c8'], [0.3, '#e8b844'], [0.75, '#8a5a12'], [1, '#3a2204']]));
  pom += E(c, 0, 132, 25, 22, 'none') + `<ellipse cx="0" cy="132" rx="25" ry="22" fill="none" stroke="#7a4e10" stroke-width="2" opacity="0.7"/>`;
  pom += G('translate(0 132)', ruby(c, 13, 12));
  pom += E(c, 0, 164, 9, 6, gilt(c));

  // ---------------- cuff and sleeve, in a frame along the forearm (+y)
  const cuff = () => {
    let t = '';
    // crimson sleeve, quilted, running off the edges
    const sl = 'M-150 232 C-160 360 -170 520 -180 760 L190 760 C176 520 164 360 150 232Z';
    t += part(c, sl, L(c, [0, 0, 1, 0], [[0, '#5a0a12'], [0.2, '#c8303c'], [0.45, crim], [0.75, '#4a0610'], [1, '#7a2a4a']]),
      fold('M-90 260 C-96 380 -104 520 -110 760 M-20 262 C-22 400 -24 560 -26 760 M60 262 C62 400 66 560 70 760', 12, 0.5, 7) +
      Ln(c, 'M-120 260 C-126 380 -134 520 -142 760 M-54 262 C-58 400 -60 560 -62 760', '#ff7080', 4, 0.3, 4) +
      Ln(c, 'M-150 300 L150 300 M-156 380 L156 380 M-162 460 L162 460', '#3a0408', 2, 0.4, 0, ' stroke-dasharray="7 5"'));
    // flared steel cuff
    const cf = 'M-84 0 C-96 70 -120 160 -150 240 L150 240 C120 160 96 70 84 0Z';
    t += part(c, cf, steelH(),
      sp('M-60 10 C-70 80 -88 160 -110 230', 6, 0.8, 2.4) + E(c, 0, 4, 90, 14, '#0e0c14', 0.6, 6) + E(c, 80, 150, 70, 110, DEEP, 0.6, 22) + E(c, 20, 60, 50, 50, DEEP, 0.35, 18) + E(c, -60, 100, 24, 90, '#ffffff', 0.22, 12));
    // crimson-and-gold band across the cuff
    const band = 'M-110 128 C-40 140 40 140 110 128 L124 184 C40 198 -40 198 -124 184Z';
    t += part(c, band, L(c, [0, 0, 1, 0], [[0, '#6a0a14'], [0.2, '#d8404c'], [0.45, crim], [0.8, '#4a0610'], [1, '#8a3a5a']]),
      Ln(c, 'M-112 134 C-40 146 40 146 112 134 M-122 178 C-40 192 40 192 122 178', '#e8b844', 4) +
      Ln(c, 'M-112 132 C-40 144 40 144 112 132', '#fff6c8', 1.2, 0.8) +
      Ln(c, 'M-90 158 c10 -12 20 -12 30 0 s20 12 30 0 s20 -12 30 0 s20 12 30 0 s20 -12 30 0 s20 12 30 0', '#e8b844', 2.2, 0.9));
    for (const x of [-96, -48, 0, 48, 96]) t += E(c, x, 160 + Math.abs(x) * 0.06, 6, 6, gilt(c)) + E(c, x - 1.6, 158 + Math.abs(x) * 0.06, 1.8, 1.4, '#ffffff', 0.8);
    // rolled gilt rim of the cuff
    t += `<ellipse cx="0" cy="240" rx="150" ry="22" fill="none" stroke="${gilt(c)}" stroke-width="9"/>`;
    t += Ln(c, 'M-148 236 C-60 222 60 222 148 236', '#fff6c8', 1.6, 0.7);
    // wrist lames
    t += Ln(c, 'M-86 34 C-30 46 30 46 86 34 M-92 70 C-30 84 30 84 92 70', '#1e2028', 3, 0.7) + Ln(c, 'M-86 37 C-30 49 30 49 86 37 M-92 73 C-30 87 30 87 92 73', '#ffffff', 1.2, 0.5);
    return t;
  };

  // ---------------- assemble
  let s = '';
  let under = '';
  let over = '';
  const parts = (cuffTf) => blade + back + G(cuffTf, cuff()) + pom + fing;
  if (!g) {
    s += G('translate(642 606) rotate(-42) scale(1.26)', parts('translate(58 92) rotate(-14)'));
  } else {
    // mid-swing: a horizontal slash seen in perspective. The tip's path is a
    // flattened ellipse arcing back over the blade toward the hand; a
    // swoosh band and streaks follow it, and the blade smears sideways.
    // None of these take the outline.
    const F = [706, 548];
    const tf = `translate(${F[0]} ${F[1]}) matrix(0 1.1 1.1 0 0 0)`;
    const ec = [522, 552];
    const ell = (rx, ry, from, to, n = 28) => [...Array(n + 1).keys()].map((i) => {
      const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
      return [ec[0] + rx * Math.cos(a), ec[1] + ry * Math.sin(a)];
    });
    let trail = '';
    const sw = c.def('swoosh', `<linearGradient id="@ID" gradientUnits="userSpaceOnUse" x1="10" y1="560" x2="880" y2="360">${stopStr([[0, '#f2f7ff', 0.62], [0.35, '#d4e4ff', 0.34], [0.75, '#9fc4ff', 0.08], [1, '#9fc4ff', 0]])}</linearGradient>`);
    trail += `<path d="${ribbon(ell(486, 236, 182, 318, 6), (t) => 120 * (1 - t) ** 1.3 + 4, 6)}" fill="${sw}" filter="${blur(c, 5)}"/>`;
    for (let i = 0; i < 7; i++) {
      const pts = ell(500 - i * 16, 244 - i * 9, 181 + i * 1.5, 300 - i * 9 + (i % 2) * 10, 20);
      trail += `<path d="${ribbon(pts, (t) => (3.2 - i * 0.25) * (1 - t * 0.85), 3)}" fill="${sw}"/>`;
    }
    trail += `<g filter="${c.def('smear', '<filter id="@ID" filterUnits="userSpaceOnUse" x="-200" y="0" width="1400" height="960"><feGaussianBlur stdDeviation="22 1.2"/></filter>')}" opacity="0.45"><g transform="translate(26 -10)"><g transform="${tf}">${swordBlade}</g></g></g>`;
    under = trail;
    s += G(tf, parts('translate(62 86) rotate(-40)'));
  }
  return wrap(c, s, { under, over, fx: { lx: 160, ly: -260, lz: 760, kd: 1.34, bounce: 0.18, formBlur: 14, formScale: 9, lost: 2.2 } });
}

export const ART_PEOPLE = {
  merchant: { w: 480, h: 640, height: 1.75, frames: { idle: merchant('idle'), attack: merchant('attack') } },
  priest: { w: 480, h: 680, height: 1.8, frames: { idle: priest('idle'), attack: priest('attack') } },
  steward: { w: 480, h: 640, height: 1.75, frames: { idle: steward('idle'), attack: steward('attack') } },
  pilgrim: { w: 440, h: 640, height: 1.7, frames: { idle: pilgrim('idle'), attack: pilgrim('attack') } },
  peddler: { w: 560, h: 640, height: 1.7, frames: { idle: peddler('idle'), attack: peddler('attack') } },
  sellsword: { w: 480, h: 640, height: 1.8, frames: { idle: sellsword('idle'), attack: sellsword('attack') } },
  raven: { w: 400, h: 400, height: 0.6, frames: { idle: raven('idle'), attack: raven('attack') } },
  vael: { w: 560, h: 800, height: 2.3, frames: { idle: vael('idle'), attack: vael('attack') } },
  hand: { w: 960, h: 960, height: 0, frames: { idle: hand('idle'), attack: hand('attack') } },
};
