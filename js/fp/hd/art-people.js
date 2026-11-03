// Obsidian Spire, modern first-person mode: painted illustrations of the
// people met on the road, as standalone SVG strings. Each one is rasterised
// once (Image -> canvas) and stood in the scene as a lit billboard; `hand`
// is the player's own sword hand, a screen overlay for the bottom-right
// corner (no world height), and there `attack` is the mid-swing frame. For
// people `attack` is a gesture.
//
// Shared style: warm key light from the upper left (#ffd9a0), cool rim light
// from behind on the right (#9fc4ff), deep shadows that are never black, a
// 2-3 px umber outline on the outer silhouette only, and a fine grain
// clipped to the figure. Forms are built from layered gradients with soft,
// clipped shading passes. Every id is prefixed `<key>-<frame>-`.

const OUT = '#1a1210';
const KEY = '#ffd9a0';
const RIM = '#9fc4ff';
const DEEP = '#1d1420';

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

// The figure filter: umber outline on the outer silhouette, a soft fall-off
// of the key light (a flat diffuse-lit plane, multiplied in), painterly
// mottling, cool rim along right-hand edges, a warm catch along upper-left
// edges, and a fine grain, all clipped to the figure.
function figFilter(c, o = {}) {
  const { w, h } = c;
  const ow = o.ow ?? 2.4;
  const grain = o.grain ?? 0.1;
  const lx = o.lx ?? w * 0.3;
  const ly = o.ly ?? -h * 0.1;
  const lz = o.lz ?? h * 0.72;
  const kd = o.kd ?? 1.28;
  return c.def('fx', `<filter id="@ID" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB">
<feMorphology in="SourceAlpha" operator="dilate" radius="${ow}" result="dil"/>
<feFlood flood-color="${OUT}"/><feComposite in2="dil" operator="in" result="ink"/>
<feDiffuseLighting in="SourceAlpha" surfaceScale="0" diffuseConstant="${kd}" lighting-color="#fff6ea" result="lt"><fePointLight x="${lx}" y="${ly}" z="${lz}"/></feDiffuseLighting>
<feComposite in="SourceGraphic" in2="lt" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="shd"/>
<feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="${o.seed ?? 4}" result="mn"/>
<feColorMatrix in="mn" type="matrix" values="1.5 0 0 0 -0.28  1.4 0 0 0 -0.27  1.3 0 0 0 -0.26  0 0 0 0 ${o.mottle ?? 0.05}" result="mc"/>
<feComposite in="mc" in2="SourceAlpha" operator="in" result="mot"/>
<feOffset in="SourceAlpha" dx="-4" dy="1" result="o1"/>
<feComposite in="SourceAlpha" in2="o1" operator="out" result="r1"/>
<feGaussianBlur in="r1" stdDeviation="0.9" result="r2"/>
<feFlood flood-color="${RIM}" flood-opacity="${o.rim ?? 0.8}"/><feComposite in2="r2" operator="in" result="rim"/>
<feOffset in="SourceAlpha" dx="3" dy="3" result="o2"/>
<feComposite in="SourceAlpha" in2="o2" operator="out" result="k1"/>
<feGaussianBlur in="k1" stdDeviation="1.1" result="k2"/>
<feFlood flood-color="${KEY}" flood-opacity="0.3"/><feComposite in2="k2" operator="in" result="keyl"/>
<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="nz"/>
<feColorMatrix in="nz" type="matrix" values="1.7 0 0 0 -0.32  1.7 0 0 0 -0.34  1.7 0 0 0 -0.36  0 0 0 0 ${grain}" result="gr"/>
<feComposite in="gr" in2="SourceAlpha" operator="in" result="grain"/>
<feComposite in="rim" in2="SourceAlpha" operator="in" result="rim2"/>
<feComposite in="keyl" in2="SourceAlpha" operator="in" result="key2"/>
<feMerge><feMergeNode in="ink"/><feMergeNode in="shd"/><feMergeNode in="mot"/><feMergeNode in="key2"/><feMergeNode in="rim2"/><feMergeNode in="grain"/></feMerge>
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
function eyeShape(c, side, o) {
  const op = o.open ?? 1;
  const lo = o.low ?? 1;
  const iris = o.iris;
  const gz = (o.gaze ?? 0) * side;
  const white = `M-8.4 0.9 C-5.6 ${f2(-4.4 * op)} 3 ${f2(-5.8 * op)} 9 0.3 C5 ${f2(3.3 * lo)} -3 ${f2(3.8 * lo)} -8.4 0.9Z`;
  const ck = clipD(c, white);
  const ir = 4.2 * (o.irisR ?? 1);
  const lid = dk(o.skin, 0.72);
  let s = '';
  // the lid's skin fold and socket above the eye
  s += S(c, `M-9.6 0.6 C-6 ${f2(-6.4 * op - 1.6)} 4 ${f2(-8 * op - 1.6)} 10.4 0 C5 ${f2(-5.2 * op)} -4 ${f2(-4.4 * op)} -9.6 0.6Z`, dk(o.skin, 0.25), 0.7, 0.6);
  s += P(white, L(c, [0, 0, 0, 1], [[0, '#8a7a72'], [0.5, '#d6cabd'], [1, '#e8dfd2']]));
  s += `<g clip-path="${ck}">`;
  s += `<circle cx="${f2(gz)}" cy="-0.2" r="${f2(ir)}" fill="${R(c, [0.5, 0.5, 0.5, 0.6, 0.72], [[0, lit(iris, 0.5)], [0.5, iris], [0.84, dk(iris, 0.45)], [1, dk(iris, 0.8)]])}"/>`;
  s += `<circle cx="${f2(gz)}" cy="-0.2" r="${f2(ir * 0.42)}" fill="#120a0a"/>`;
  s += S(c, `M-10 -8 L10 -8 L10 ${f2(-1.4 * op)} C3 ${f2(-3.2 * op)} -4 ${f2(-2.4 * op)} -10 0.4Z`, dk(o.skin, 0.65), 0.62, 0.9);
  s += `</g>`;
  s += `<circle cx="${f2(gz - 1.3 * side)}" cy="-1.9" r="1.1" fill="#fffaf0" opacity="0.92"/>`;
  s += `<circle cx="${f2(gz + 1.5 * side)}" cy="1.1" r="0.45" fill="#fffaf0" opacity="0.5"/>`;
  // upper lid edge: heavier toward the outer corner
  s += Ln(c, `M-9 1 C-5.8 ${f2(-5.1 * op)} 3 ${f2(-6.6 * op)} 9.6 0.5`, o.lash || lid, 1.1);
  s += Ln(c, `M1 ${f2(-5.8 * op)} C4.6 ${f2(-5.8 * op)} 7.6 ${f2(-3.2 * op)} 9.6 0.5`, o.lash || lid, 1.6);
  if (o.lashes) s += Ln(c, 'M9.3 0.4 L11.2 -1', o.lash || lid, 1);
  // crease
  s += Ln(c, `M-7.6 ${f2(-5.6 * op - 2)} C-3 ${f2(-8.8 * op - 2)} 4 ${f2(-9.2 * op - 2)} 9 ${f2(-3.8 * op - 1.6)}`, dk(o.skin, 0.55), 1.1, 0.55, 0.35);
  // lower lid and a soft bag under it
  s += Ln(c, `M-6.4 2.8 C-2 ${f2(4.6 * lo)} 4 ${f2(4.4 * lo)} 8 1.6`, dk(o.skin, 0.4), 0.9, 0.55, 0.3);
  s += Ln(c, `M-5 ${f2(5.4 * lo + 1)} C-1 ${f2(7 * lo + 1)} 4 ${f2(6.6 * lo + 1)} 7 ${f2(4 * lo + 1)}`, dk(o.skin, 0.3), 1.2, 0.3 + 0.3 * (o.age ?? 0), 0.6);
  return s;
}

function brow(c, o, rot) {
  const t = o.browW ?? 1;
  const d = `M-10 ${f2(-8 + 1.5 * (t - 1))} C-5 ${f2(-12.5 - 1.5 * t)} 4 ${f2(-13 - t)} 12 -9 C5 ${f2(-10.4 - 0.4 * t)} -3 -10.2 -10 ${f2(-7 + 2.2 * (t - 1))}Z`;
  let s = S(c, d, o.brow, 1, 0.35);
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
    'M186 466 C184 510 186 560 190 598 L236 598 C238 560 240 510 240 466Z',
    'M240 466 C240 510 242 560 244 598 L290 598 C294 560 296 510 294 466Z',
  ];
  legs.forEach((d, i) => {
    const x = i ? 268 : 212;
    s += part(c, d, cyl(c, blue, [0, 0, 1, 0.1]),
      E(c, x, 470, 34, 22, DEEP, 0.75, 7) +
      fold(`M${x - 14} 540 q 10 8 24 2 M${x - 16} 566 q 12 7 26 -1`, 3, 0.5, 1.6) +
      fold(`M${x - 12} 545 q 10 6 22 1`, 1.4, 0.35, 0.8, lit(blue, 0.6)));
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
    s += part(c, `M${x - 30} 576 L${x + 30} 576 L${x + 29} 598 C${x + 10} 602 ${x - 10} 602 ${x - 29} 598Z`, cyl(c, lit(boot, 0.1), [0, 0, 1, 0.3]),
      Ln(c, `M${x - 28} 579 L${x + 28} 579`, lit(boot, 0.5), 1.4, 0.5) + E(c, x, 598, 30, 4, DEEP, 0.5, 2));
  });

  // neck
  s += part(c, 'M212 126 L268 126 L272 184 L208 184Z', cyl(c, dk(skin, 0.1), [0, 0, 1, 0]), E(c, 240, 140, 40, 18, dk(skin, 0.6), 0.75, 6));

  // tunic
  const tunic = 'M210 160 C192 164 170 170 154 178 C140 184 128 196 124 214 C118 240 118 262 122 280 C112 310 110 350 120 384 C130 412 170 430 240 430 C310 430 350 412 360 384 C370 350 368 310 358 280 C362 262 362 240 356 214 C352 196 340 184 326 178 C310 170 288 164 270 160Z';
  s += part(c, tunic, cyl(c, green, [0, 0.1, 1, 0.3]),
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
  const apron = 'M200 200 C214 197 266 197 280 200 C282 230 284 262 290 288 C322 296 346 318 352 352 C358 400 356 462 346 506 C343 516 332 520 318 520 C270 524 210 524 162 520 C148 520 137 516 134 506 C124 462 122 400 128 352 C134 318 158 296 190 288 C196 262 198 230 200 200Z';
  let ash = '';
  ash += E(c, 196, 352, 60, 74, lit(leather, 0.6), 0.45, 18);
  ash += E(c, 172, 250, 20, 50, lit(leather, 0.4), 0.3, 10);
  ash += E(c, 342, 400, 34, 120, DEEP, 0.55, 16);
  ash += E(c, 240, 478, 120, 18, DEEP, 0.4, 9);
  ash += E(c, 240, 293, 56, 9, DEEP, 0.5, 5);
  ash += Ln(c, 'M194 300 C214 310 266 310 286 300', lit(leather, 0.55), 2, 0.45, 1.5);
  ash += fold('M156 466 C164 486 170 504 172 522 M306 466 C312 486 310 504 312 522 M232 486 L230 522', 4, 0.45, 3);
  ash += fold('M160 470 C167 488 172 506 174 522', 1.5, 0.3, 1, lit(leather, 0.6));
  for (let i = 0; i < 26; i++) {
    const x = 145 + ((i * 53) % 190);
    const y = 220 + ((i * 97) % 290);
    ash += Ln(c, `M${x} ${y} q ${4 + (i % 3) * 3} ${-2 + (i % 2) * 4} ${9 + (i % 4) * 3} ${i % 2 ? 2 : -1}`, i % 3 ? lit(leather, 0.55) : DEEP, 1.2, 0.22, 0.4);
  }
  const stitch = (d) => Ln(c, d, '#e2c294', 1.2, 0.6, 0, ' stroke-dasharray="4 3"');
  ash += stitch('M204 206 C203 236 201 262 196 290 M276 206 C277 236 279 262 284 290');
  ash += stitch('M140 504 C130 462 128 404 134 354 M340 504 C350 462 352 404 346 354 M166 514 C210 518 270 518 314 514');
  s += part(c, apron, flat(c, leather, [0, 0, 1, 0.8]), ash);
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
  const over = g ? glint(94, 60, 20) + glint(130, 84, 8, '#fff6d8', 0.8) : '';
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
  s += part(c, robe, white(), rsh);
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

  // legs and shoes
  for (const [x, i] of [[214, 0], [266, 1]]) {
    s += part(c, `M${x - 24} 466 C${x - 25} 500 ${x - 23} 530 ${x - 20} 550 C${x - 21} 575 ${x - 20} 595 ${x - 18} 612 L${x + 18} 612 C${x + 20} 595 ${x + 21} 575 ${x + 20} 550 C${x + 23} 530 ${x + 25} 500 ${x + 24} 466Z`, cyl(c, hose, [0, 0, 1, 0]),
      E(c, x, 474, 30, 20, DEEP, 0.7, 6) + fold(`M${x - 10} 540 q 10 6 20 0`, 2.4, 0.4, 1.4) + E(c, x - 6, 530, 6, 14, lit(hose, 0.5), 0.35, 4));
    const sx = x + (i ? 6 : -6);
    s += part(c, `M${sx - 20} 604 L${sx + 20} 604 C${sx + 24} 616 ${sx + 28 + (i ? 6 : -2)} 628 ${sx + 26 + (i ? 4 : -2)} 640 L${sx - 26 + (i ? 2 : -4)} 640 C${sx - 28 + (i ? 2 : -6)} 628 ${sx - 24} 616 ${sx - 20} 604Z`, cyl(c, '#4a2614', [0, 0, 1, 0.3]),
      E(c, sx - 4, 622, 12, 6, lit('#4a2614', 0.6), 0.55, 3) + E(c, sx, 638, 30, 3, DEEP, 0.7, 1.2));
  }

  // blue doublet body
  // doublet skirt, flared, then the body
  s += part(c, 'M152 356 L328 356 C336 390 344 430 352 470 C310 486 170 486 128 470 C136 430 144 390 152 356Z', cyl(c, dk(blue, 0.1), [0, 0, 1, 0.2]),
    fold('M170 380 C164 410 158 440 154 476 M200 384 C198 420 196 450 194 482 M282 384 C284 420 286 450 288 482 M312 380 C318 410 324 440 328 476', 6, 0.5, 3.4) +
    fold('M178 382 C172 412 166 444 162 478 M208 386 C206 420 204 450 202 482', 2.4, 0.4, 1.4, lit(blue, 0.6)) + E(c, 240, 362, 100, 10, DEEP, 0.6, 5));
  const body = 'M208 162 C188 164 168 170 156 180 C144 192 140 214 142 240 C142 286 146 326 152 362 L328 362 C334 326 338 286 338 240 C340 214 336 192 324 180 C312 170 292 164 272 162Z';
  s += part(c, body, cyl(c, blue, [0, 0.1, 1, 0.3]), E(c, 328, 290, 18, 110, DEEP, 0.5, 10) + E(c, 170, 220, 30, 50, lit(blue, 0.5), 0.3, 12));

  // tabard
  const tab = 'M190 180 C210 172 270 172 290 180 L300 470 C298 478 292 482 284 482 L196 482 C188 482 182 478 180 470Z';
  let tsh = '';
  tsh += E(c, 206, 300, 30, 130, lit(crim, 0.55), 0.35, 14) + E(c, 290, 340, 18, 150, DEEP, 0.55, 12);
  tsh += fold('M206 400 C204 430 204 456 206 482 M266 380 C270 420 272 450 270 482 M236 420 L236 482', 5, 0.4, 3);
  tsh += Ln(c, 'M184 470 L184 186 M296 470 L296 186 M184 478 L296 478', gold, 6) + Ln(c, 'M182.6 470 L182.6 188 M182 476 L298 476', '#fff0b0', 1.4, 0.6);
  tsh += Ln(c, 'M190 466 L190 192 M290 466 L290 192 M190 472 L290 472', dk(gold, 0.4), 1, 0.6, 0, ' stroke-dasharray="3 3"');
  s += part(c, tab, flat(c, crim, [0, 0, 1, 0.7]), tsh);
  s += G('translate(240 268) scale(1.15)', keepDevice(c));
  // belt with keys
  s += part(c, 'M146 352 C190 362 290 362 334 352 L336 372 C290 382 190 382 144 372Z', cyl(c, '#3a2010', [0, 0, 1, 0.1]),
    Ln(c, 'M148 357 C190 367 290 367 332 357', lit('#3a2010', 0.4), 1, 0.6));
  s += part(c, 'M228 356 L252 356 L252 378 L228 378Z', 'none', '');
  s += `<rect x="226" y="354" width="28" height="24" rx="3" fill="none" stroke="${gold}" stroke-width="4"/><rect x="226" y="354" width="28" height="24" rx="3" fill="none" stroke="#fff0b0" stroke-width="1" opacity="0.6"/>`;
  s += Ln(c, 'M240 358 L240 374', '#b88a2a', 3);
  s += G('translate(176 372)', keyRing(c));

  // collar
  s += part(c, 'M204 158 C214 176 266 176 276 158 L282 168 C268 192 212 192 198 168Z', cyl(c, lit(blue, 0.1), [0, 0, 1, 0]));

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
    skin, iris: '#4a5a6c', brow: '#e6e2dc', browW: 2.2, jaw: 1, cheek: 1, expr: g ? 'smile' : 'neutral', age: 1, blush: 0.25, noseW: 1.15, noseCol: '#d89478', gaze: g ? 0 : 0, open: g ? 0.7 : 0.9,
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
    fold(`M${x - sgn * 10} 260 C${x} 268 ${x + sgn * 8} 276 ${x + sgn * 14} 280 M${x - sgn * 12} 300 C${x} 306 ${x + sgn * 8} 312 ${x + sgn * 14} 314`, 3.4, 0.45, 2) +
    E(c, x - 10, 214, 12, 24, lit(blue, 0.6), sgn < 0 ? 0.45 : 0.15, 7) + E(c, x + 14, 280, 10, 60, DEEP, sgn > 0 ? 0.5 : 0.3, 7));
  const cuff = (x, y, rot) => G(`translate(${x} ${y}) rotate(${rot})`, part(c, 'M-17 -7 L17 -7 L18 7 L-18 7Z', cyl(c, gold, [0, 0, 1, 0]), Ln(c, 'M-17 -3 L17 -3', '#fff0b0', 1, 0.6)));
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
  s += Ln(c, `M${sx} 58 C${sx + 14} 56 ${sx + 24} 60 ${sx + 26} 70`, '#5a5660', 3.4) + Ln(c, `M${sx} 57 C${sx + 14} 55 ${sx + 22} 58 ${sx + 25} 66`, '#b0b4c0', 1, 0.7);
  s += G(`translate(${sx + 26} 72)`, lantern(c, true, 0.85));

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
  s += part(c, cloakL, cyl(c, cloak, [0, 0, 1, 0.2]), csh);
  let rsh = '';
  rsh += fold('M248 300 C252 400 256 500 258 626 M276 320 C282 420 288 520 292 626', 10, 0.55, 6);
  rsh += hil('M238 300 C242 400 244 500 246 626', 5, 0.3, 4);
  rsh += E(c, 290, 420, 20, 200, DEEP, 0.5, 14);
  rsh += Ln(c, 'M211 208 C219 330 224 500 229 626', dk(cloak, 0.6), 4, 0.6, 1);
  s += part(c, cloakR, cyl(c, dk(cloak, 0.08), [0, 0, 1, 0.2]), rsh);
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
  fs.push(G(`translate(${cx} 134) scale(0.96)`, face(c, { skin, iris: '#6a7a6a', brow: '#8a8480', browW: 1.4, expr: 'kind', age: 1, blush: 0.18, noseW: 1.1, shadow: 0.7 })));
  // grey beard
  const by = 134;
  const beard = `M${cx - 34} ${by + 6} C${cx - 36} ${by + 30} ${cx - 28} ${by + 58} ${cx - 12} ${by + 76} C${cx - 6} ${by + 82} ${cx + 6} ${by + 82} ${cx + 12} ${by + 76} C${cx + 28} ${by + 58} ${cx + 36} ${by + 30} ${cx + 34} ${by + 6} C${cx + 30} ${by + 22} ${cx + 22} ${by + 34} ${cx + 12} ${by + 38} C${cx + 6} ${by + 40} ${cx - 6} ${by + 40} ${cx - 12} ${by + 38} C${cx - 22} ${by + 34} ${cx - 30} ${by + 22} ${cx - 34} ${by + 6}Z`;
  fs.push(part(c, beard, L(c, [0, 0, 1, 1], [[0, '#a8a4a8'], [1, '#3a3640']])));
  fs.push(beardLocks(c, { cx, y0: by + 38, y1: by + 84, w: 30, n: 10, seed: 2, taper: 0.6, short: 0.25, drop: -44, cols: ['#dedad6', '#9a96a0', '#46424e'] }));
  fs.push(part(c, `M${cx} ${by + 25} C${cx - 8} ${by + 21} ${cx - 20} ${by + 22} ${cx - 26} ${by + 31} C${cx - 29} ${by + 38} ${cx - 28} ${by + 47} ${cx - 25} ${by + 54} C${cx - 22} ${by + 44} ${cx - 15} ${by + 35} ${cx - 6} ${by + 33} L${cx} ${by + 31} L${cx + 6} ${by + 33} C${cx + 15} ${by + 35} ${cx + 22} ${by + 44} ${cx + 25} ${by + 54} C${cx + 28} ${by + 47} ${cx + 29} ${by + 38} ${cx + 26} ${by + 31} C${cx + 20} ${by + 22} ${cx + 8} ${by + 21} ${cx} ${by + 25}Z`,
    L(c, [0, 0, 0.5, 1], [[0, '#e8e4e0'], [1, '#6a6670']]), Ln(c, `M${cx - 4} ${by + 27} C${cx - 12} ${by + 27} ${cx - 20} ${by + 32} ${cx - 23} ${by + 44} M${cx + 4} ${by + 27} C${cx + 12} ${by + 27} ${cx + 20} ${by + 32} ${cx + 23} ${by + 44}`, '#ffffff', 1, 0.5)));
  s += `<g clip-path="${clipD(c, open)}">${fs.join('')}${E(c, cx, 104, 56, 42, '#120806', 0.8, 10)}${E(c, cx + 34, 150, 14, 70, '#120806', 0.6, 8)}${Ln(c, open, '#120806', 16, 0.65, 6)}</g>`;
  s += `<circle cx="${cx - 15.6}" cy="132.4" r="1.3" fill="#fff6e0" opacity="0.9"/><circle cx="${cx + 12.6}" cy="132.4" r="1.1" fill="#fff6e0" opacity="0.75"/>`;
  s += Ln(c, `M${cx - 30} 86 C${cx - 42} 100 ${cx - 46} 124 ${cx - 46} 150`, lit(cloak, 0.6), 3, 0.6, 1.5);

  if (g) {
    // left arm comes out of the cloak and raises a hand in blessing
    s += part(c, 'M104 250 C96 270 98 296 112 306 C124 312 140 306 150 296 L146 250 C136 240 116 238 104 250Z', cyl(c, cloak, [0, 0, 1, 0.4]), fold('M110 268 C120 284 132 292 146 294', 5, 0.5, 3));
    s += part(c, 'M104 288 C98 260 100 222 108 190 L140 192 C138 222 140 258 146 284Z', cyl(c, robe, [0, 0, 1, 0]),
      fold('M112 230 C120 236 128 238 138 236 M110 260 C120 266 130 268 142 266', 3, 0.5, 2) + E(c, 140, 240, 6, 40, DEEP, 0.4, 4));
    s += part(c, 'M104 196 C106 186 112 182 124 182 C134 182 142 186 144 196 L142 204 L106 204Z', cyl(c, dk(robe, 0.1), [0, 0, 1, 0]));
    s += G('translate(124 154) scale(1.15)', blessHand(c, skin));
  }
  return wrap(c, s);
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
  s += part(c, coat, cyl(c, teal, [0, 0.1, 1, 0.3]),
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
  const mail = mailPattern(c);
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
  const hauberk = 'M206 166 C184 168 164 174 152 186 C140 200 138 222 140 248 C142 290 150 320 160 340 C154 380 150 420 148 452 L232 456 L240 432 L248 456 L332 452 C330 420 326 380 320 340 C330 320 338 290 340 248 C342 222 340 200 328 186 C316 174 296 168 274 166Z';
  s += part(c, hauberk, mail,
    `<rect x="130" y="160" width="220" height="300" fill="${overShade(c)}"/>` +
    E(c, 196, 230, 40, 40, '#e8f0ff', 0.18, 10) + E(c, 240, 452, 100, 14, DEEP, 0.5, 6) +
    fold('M180 380 C176 410 172 432 170 452 M300 380 C304 410 308 432 310 452', 6, 0.5, 4) +
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
  return wrap(c, s);
}

export const ART_PEOPLE = {
  merchant: { w: 480, h: 640, height: 1.75, frames: { idle: merchant('idle'), attack: merchant('attack') } },
  priest: { w: 480, h: 680, height: 1.8, frames: { idle: priest('idle'), attack: priest('attack') } },
  steward: { w: 480, h: 640, height: 1.75, frames: { idle: steward('idle'), attack: steward('attack') } },
  pilgrim: { w: 440, h: 640, height: 1.7, frames: { idle: pilgrim('idle'), attack: pilgrim('attack') } },
  peddler: { w: 560, h: 640, height: 1.7, frames: { idle: peddler('idle'), attack: peddler('attack') } },
  sellsword: { w: 480, h: 640, height: 1.8, frames: { idle: sellsword('idle'), attack: sellsword('attack') } },
};
