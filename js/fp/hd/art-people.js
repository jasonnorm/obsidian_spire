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
<feColorMatrix in="mn" type="matrix" values="1.5 0 0 0 -0.28  1.4 0 0 0 -0.27  1.3 0 0 0 -0.26  0 0 0 0 ${o.mottle ?? 0.08}" result="mc"/>
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

// ---------------------------------------------------------------- faces
// A head in local coordinates: crown y=-46, eye line y=0, chin y=+47,
// cheekbones at x=+-36. Options pick skin, eyes, expression and age.
function eyeShape(c, side, o) {
  const op = o.open ?? 1;
  const lo = o.low ?? 1;
  const iris = o.iris;
  const gz = (o.gaze ?? 0) * side;
  const white = `M-8.6 0.9 C-5.6 ${f2(-4.9 * op)} 3 ${f2(-6.3 * op)} 9.2 0.2 C5 ${f2(3.6 * lo)} -3 ${f2(4.1 * lo)} -8.6 0.9Z`;
  const ck = clipD(c, white);
  const ir = 4.1 * (o.irisR ?? 1);
  let s = '';
  s += P(white, L(c, [0, 0, 0, 1], [[0, '#9c8a80'], [0.45, '#e3d8cb'], [1, '#f1e9de']]));
  s += `<g clip-path="${ck}">`;
  s += `<circle cx="${f2(gz)}" cy="-0.4" r="${f2(ir)}" fill="${R(c, [0.5, 0.5, 0.5, 0.62, 0.7], [[0, lit(iris, 0.45)], [0.55, iris], [0.85, dk(iris, 0.45)], [1, dk(iris, 0.75)]])}"/>`;
  s += `<circle cx="${f2(gz)}" cy="-0.4" r="${f2(ir * 0.44)}" fill="#120a0a"/>`;
  s += S(c, `M-10 -7 L10 -7 L10 ${f2(-1.6 * op)} C3 ${f2(-3.4 * op)} -4 ${f2(-2.6 * op)} -10 0Z`, dk(o.skin, 0.6), 0.55, 0.9);
  s += `</g>`;
  s += `<circle cx="${f2(gz - 1.3 * side)}" cy="-2.1" r="1.15" fill="#fffaf0" opacity="0.95"/>`;
  s += `<circle cx="${f2(gz + 1.5 * side)}" cy="1" r="0.5" fill="#fffaf0" opacity="0.6"/>`;
  s += Ln(c, `M-9.2 1 C-5.8 ${f2(-5.6 * op)} 3 ${f2(-7.1 * op)} 9.8 0.4`, o.lash || '#2a1612', 1.5);
  s += Ln(c, `M0 ${f2(-6.2 * op)} C4 ${f2(-6.4 * op)} 7.4 ${f2(-3.6 * op)} 9.8 0.4`, o.lash || '#2a1612', 2.1);
  s += Ln(c, `M9.4 0.4 L11.4 -1.1`, o.lash || '#2a1612', 1.1);
  s += Ln(c, `M-7.4 ${f2(-6.4 * op - 1.2)} C-3 ${f2(-9.6 * op - 1)} 4 ${f2(-10 * op - 1)} 8.4 ${f2(-4.4 * op - 1)}`, dk(o.skin, 0.45), 1, 0.45, 0.3);
  s += Ln(c, `M-6.4 2.8 C-2 ${f2(4.9 * lo)} 4 ${f2(4.7 * lo)} 8 1.6`, dk(o.skin, 0.35), 0.9, 0.5, 0.3);
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
  const head = `M0 -46 C22 -46 ${cw} -32 ${cw} -8 C${cw} 6 ${f2(jw + 4)} 16 ${jw} 26 C${f2(jw - 6)} 38 13 ${cl - 1} 0 ${cl} C-13 ${cl - 1} -${f2(jw - 6)} 38 -${jw} 26 C-${f2(jw + 4)} 16 -${cw} 6 -${cw} -8 C-${cw} -32 -22 -46 0 -46Z`;
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
  if (o.stubble) sh += S(c, `M-${jw + 2} 14 C-${jw - 2} 36 -12 ${cl + 2} 0 ${cl + 2} C12 ${cl + 2} ${jw - 2} 36 ${jw + 2} 14 C${jw - 4} 24 14 20 0 22 C-14 20 -${jw - 4} 24 -${jw + 2} 14Z`, o.stubble, 0.42, 1.6);
  if (o.scar) sh += Ln(c, 'M-24 -16 C-21 -6 -19 6 -15 20', '#e9b4a0', 1.6, 0.85) + Ln(c, 'M-23 -15 C-20 -5 -18 7 -14.4 20', '#7a3a32', 0.8, 0.6);
  if (o.glow) sh += E(c, o.glow[0], o.glow[1], o.glow[2], o.glow[2] * 1.3, o.glow[3], o.glow[4], 10);
  s += part(c, head, R(c, [0.42, 0.42, 0.68, 0.32, 0.28], [[0, lit(skin, 0.5)], [0.36, skin], [0.72, dk(skin, 0.22)], [1, dk(skin, 0.5)]]), sh);
  // eyes
  const open = { neutral: 1, kind: 0.88, grin: 0.66, stern: 0.82, shout: 1.1, smile: 0.78 }[expr] ?? 1;
  const low = { grin: 0.62, smile: 0.72, kind: 0.85 }[expr] ?? 1;
  const eo = { skin, iris: o.iris, open: o.open ?? open, low, gaze: o.gaze, lash: o.lash };
  s += G('translate(-14.5 0) scale(-1.1 1.1)', eyeShape(c, -1, eo));
  s += G('translate(14.5 0) scale(1.1)', eyeShape(c, 1, eo));
  // brows
  const br = { neutral: 0, kind: 7, grin: 6, stern: -12, shout: -16, smile: 4 }[expr] ?? 0;
  const by = { grin: -2.5, smile: -1.5, kind: -1, shout: 1 }[expr] ?? 0;
  const bo = { brow: o.brow, browW: o.browW };
  s += G(`translate(-14 ${by}) scale(-1 1)`, brow(c, bo, br + (o.browTilt || 0)));
  s += G(`translate(14 ${by})`, brow(c, bo, br - (o.browTilt || 0)));
  if (expr === 'stern' || expr === 'shout') s += Ln(c, 'M-3 -11 L-2 -6 M3 -11 L2 -6', Sd, 1, 0.5, 0.6);
  // nose
  const nw = o.noseW ?? 1;
  const nose = o.noseCol || skin;
  s += E(c, 0, 15.5, 5.6 * nw, 4.8, R(c, [0.5, 0.5, 0.6, 0.35, 0.3], [[0, lit(nose, 0.35)], [0.6, nose], [1, dk(nose, 0.3)]]));
  s += E(c, -5.4 * nw, 18.6, 3.2 * nw, 2.7, dk(nose, 0.08)) + E(c, 5.4 * nw, 18.6, 3.2 * nw, 2.7, dk(nose, 0.22));
  s += Ln(c, `M2.4 -4 C4.6 4 5.2 10 ${f2(6.6 * nw)} 15 C${f2(5.2 * nw)} 18.4 3.6 19.2 2.4 19.4`, Sd, 3.4, 0.55, 1.5);
  s += Ln(c, 'M-1.6 -3 C-2.2 4 -2.5 9.5 -2 13.5', Sl, 2.2, 0.55, 1);
  s += E(c, -1.4, 14.2, 1.9, 1.4, '#fff3de', 0.6, 0.6);
  s += E(c, 1, 22.6, 7.5 * nw, 2.6, Sdd, 0.55, 1.4);
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
    const out = 'M-11 27.5 C-5 25.6 5 25.6 11 27.5 C12.6 36 7.4 45.6 0 46 C-7.4 45.6 -12.6 36 -11 27.5Z';
    s += P(out, R(c, [0.5, 0.6, 0.6], [[0, '#1e0808'], [1, '#4a1616']]));
    s += `<g clip-path="${clipD(c, out)}">`;
    s += P('M-10 27.2 C-5 26 5 26 10 27.2 L9.4 30.6 C5 31.6 -5 31.6 -9.4 30.6Z', L(c, [0, 0, 0, 1], [[0, '#f6ecdc'], [1, '#c9b9a6']]));
    s += P('M-6 44 C-3 41.6 3 41.6 6 44 L6 47 L-6 47Z', '#d8cbb8');
    s += E(c, 0, 42, 7, 3.4, '#9a3236');
    s += '</g>';
    s += S(c, 'M-11.6 27.4 C-6 24.4 6 24.4 11.6 27.4 C6 25.8 -6 25.8 -11.6 27.4Z', dk(lip, 0.15));
    s += S(c, 'M-8 45 C-4 48.6 4 48.6 8 45 C4 46.4 -4 46.4 -8 45Z', lip);
    s += Ln(c, 'M-11 20 C-15 24 -15.6 29 -13 34 M11 20 C15 24 15.6 29 13 34', Sd, 1.6, 0.45, 0.9);
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

// ================================================================ merchant
function merchant(frame) {
  const c = ctx('merchant', frame, 480, 640);
  const g = frame === 'attack';
  const skin = '#d4956a';
  const green = '#3f7d35';
  const leather = '#7c4a26';
  const blue = '#2d4a88';
  const boot = '#5e3418';
  const hair = '#211814';
  let s = '';

  // legs and boots
  for (const side of [-1, 1]) {
    const x = 240 + side * 27;
    const leg = `M${x - 25} 470 L${x + 25} 470 L${x + 22 + side * 2} 596 L${x - 22 + side * 2} 596Z`;
    s += part(c, leg, cyl(c, blue, [0, 0, 1, 0.2]),
      Ln(c, `M${x - 6} 520 q 8 6 16 2 M${x - 10} 560 q 10 7 20 0`, dk(blue, 0.5), 3, 0.5, 2) +
      E(c, x, 480, 30, 16, dk(blue, 0.7), 0.7, 6));
    const bx = x + side * 4;
    const bt = `M${bx - 26} 580 L${bx + 26} 580 L${bx + 28} 612 C${bx + 30 + side * 6} 626 ${bx + 30 + side * 8} 640 ${bx + 18 + side * 8} 640 L${bx - 20 + side * 8} 640 C${bx - 32 + side * 6} 640 ${bx - 32 + side * 4} 626 ${bx - 28} 612Z`;
    s += part(c, bt, cyl(c, boot, [0, 0, 1, 0.3]),
      E(c, bx - 8 + side * 4, 626, 14, 6, lit(boot, 0.5), 0.5, 3) +
      Ln(c, `M${bx - 26} 600 C${bx - 10} 604 ${bx + 10} 604 ${bx + 27} 600`, dk(boot, 0.5), 2.2, 0.6, 0.8) +
      E(c, bx, 638, 40, 5, DEEP, 0.6, 2));
    s += part(c, `M${bx - 29} 576 L${bx + 29} 576 L${bx + 28} 596 C${bx + 10} 600 ${bx - 10} 600 ${bx - 28} 596Z`, cyl(c, lit(boot, 0.12), [0, 0, 1, 0.3]),
      Ln(c, `M${bx - 27} 586 L${bx + 27} 586`, lit(boot, 0.4), 1, 0.35));
  }

  // neck
  s += part(c, 'M214 128 L266 128 L270 182 L210 182Z', cyl(c, dk(skin, 0.1), [0, 0, 1, 0]), E(c, 240, 140, 40, 16, dk(skin, 0.6), 0.7, 6));

  // tunic body
  const tunic = 'M206 158 C176 160 150 166 134 182 C118 198 114 220 117 244 C112 282 110 330 122 372 C132 406 168 424 240 424 C312 424 348 406 358 372 C370 330 368 282 363 244 C366 220 362 198 346 182 C330 166 304 160 274 158Z';
  s += part(c, tunic, cyl(c, green, [0, 0.1, 1, 0.3]),
    E(c, 180, 220, 50, 40, lit(green, 0.5), 0.35, 14) +
    Ln(c, 'M140 250 C150 300 146 350 152 400 M336 250 C330 300 336 350 328 400', dk(green, 0.6), 6, 0.45, 4) +
    Ln(c, 'M128 380 C150 404 180 414 200 416 M352 380 C332 404 300 414 280 416', dk(green, 0.5), 4, 0.4, 3));
  // open collar and chest
  s += part(c, 'M218 160 L262 160 L254 200 L240 214 L226 200Z', R(c, [0.5, 0.2, 0.8], [[0, dk(skin, 0.1)], [1, dk(skin, 0.5)]]),
    Ln(c, 'M232 190 q3 6 0 10 M244 186 q4 5 1 12 M236 202 q4 3 8 0', hair, 1.1, 0.6));
  s += P('M206 158 C214 166 222 186 230 206 L240 214 L226 160Z', lit(green, 0.25)) + P('M274 158 C266 166 258 186 250 206 L240 214 L254 160Z', dk(green, 0.2));

  // belt under the apron, purse at the right hip
  s += part(c, 'M120 298 C170 312 310 312 360 298 L362 322 C310 336 170 336 118 322Z', cyl(c, '#3e2414', [0, 0, 1, 0.1]),
    Ln(c, 'M122 304 C170 318 310 318 358 304', lit('#3e2414', 0.4), 1, 0.5));
  // apron ties
  s += Ln(c, 'M122 300 C132 304 140 306 146 306', '#cbb48a', 4) + Ln(c, 'M358 300 C348 304 340 306 334 306', '#a8916a', 4);

  // apron
  const apron = 'M197 202 C215 198 265 198 283 202 L289 290 C320 298 342 318 347 352 C353 404 351 462 343 502 C339 514 328 518 314 518 L166 518 C152 518 141 514 137 502 C129 462 127 404 133 352 C138 318 160 298 191 290Z';
  let ash = '';
  ash += E(c, 200, 340, 56, 70, lit(leather, 0.55), 0.38, 16);
  ash += E(c, 336, 390, 30, 100, dk(leather, 0.7), 0.55, 14);
  ash += E(c, 240, 478, 110, 16, dk(leather, 0.7), 0.45, 8);
  ash += E(c, 240, 296, 60, 10, dk(leather, 0.6), 0.45, 6);
  ash += Ln(c, 'M196 296 C214 306 266 306 284 296', lit(leather, 0.5), 2, 0.4, 1.5);
  ash += Ln(c, 'M160 470 C170 490 176 505 178 518 M300 470 C306 490 302 505 304 518 M240 486 L240 518', dk(leather, 0.6), 3, 0.4, 2.5);
  for (let i = 0; i < 18; i++) {
    const x = 150 + ((i * 53) % 180);
    const y = 230 + ((i * 97) % 270);
    ash += Ln(c, `M${x} ${y} q ${4 + (i % 3) * 3} ${-2 + (i % 2) * 4} ${9 + (i % 4) * 2} ${i % 2 ? 2 : -1}`, lit(leather, 0.5), 1, 0.18);
  }
  ash += Ln(c, 'M200 208 L205 290 M280 208 L275 290', '#d9b98a', 1.2, 0.55, 0, ' stroke-dasharray="4 3"');
  ash += Ln(c, 'M141 500 C139 470 136 420 138 360 M339 500 C341 470 344 420 342 360', '#d9b98a', 1.2, 0.5, 0, ' stroke-dasharray="4 3"');
  ash += Ln(c, 'M168 512 L312 512', '#d9b98a', 1.2, 0.5, 0, ' stroke-dasharray="4 3"');
  s += part(c, apron, flat(c, leather, [0, 0, 1, 0.8]), ash);
  // straps
  s += part(c, 'M197 204 L207 203 L224 160 L214 158Z', cyl(c, leather, [0, 0, 1, 0]));
  s += part(c, 'M283 204 L273 203 L256 160 L266 158Z', cyl(c, dk(leather, 0.2), [0, 0, 1, 0]));
  s += E(c, 202, 205, 4, 4, ball(c, '#c9a040')) + E(c, 278, 205, 4, 4, ball(c, '#c9a040'));
  // pocket with a quill and a tally stick
  s += part(c, 'M218 380 L224 330 L231 331 L226 382Z', cyl(c, '#c7a46a', [0, 0, 1, 0]));
  s += S(c, 'M226 336 C214 318 210 290 214 268 C224 286 232 310 232 336Z', R(c, [0.3, 0.3, 0.9], [[0, '#f4ead8'], [1, '#b8a890']]), 1);
  s += Ln(c, 'M229 336 C224 312 218 290 215 270', '#9a8a74', 0.8);
  const pocket = 'M178 376 L302 376 L299 446 C299 454 294 458 286 458 L194 458 C186 458 181 454 181 446Z';
  s += part(c, pocket, flat(c, dk(leather, 0.08), [0, 0, 1, 1]),
    E(c, 240, 378, 70, 8, DEEP, 0.55, 4) + Ln(c, 'M240 378 L240 458', dk(leather, 0.55), 2, 0.6, 0.8) +
    Ln(c, 'M182 382 L298 382', lit(leather, 0.6), 1.2, 0.5));
  s += Ln(c, 'M184 384 L184 446 C184 452 188 454 194 454 L286 454 C292 454 296 452 296 446 L296 384 M240 384 L240 454', '#e0c296', 1.1, 0.6, 0, ' stroke-dasharray="4 3"');
  // purse
  const purse = 'M338 334 C326 346 322 368 327 388 C332 408 352 414 366 410 C382 404 389 384 384 364 C380 346 370 336 358 333Z';
  s += Ln(c, 'M346 318 C344 326 344 330 342 336 M354 318 C356 326 357 330 358 334', '#2e1a0e', 3);
  s += part(c, purse, ball(c, '#8a4a28', 1, [0.3, 0.35]),
    Ln(c, 'M330 360 C346 368 366 368 386 360', '#d8a040', 2.4, 0.9) + Ln(c, 'M330 365 C346 373 366 373 385 365', '#7a4a10', 1, 0.6) +
    E(c, 346, 382, 10, 14, lit('#8a4a28', 0.5), 0.35, 5));
  s += part(c, 'M336 336 C342 330 360 328 366 334 L362 342 C356 338 344 338 340 342Z', cyl(c, '#6a3418'));
  s += coin(c, 350, 330, 7, 0.4) + coin(c, 362, 331, 6, 0.4);
  s += E(c, 352, 344, 4, 4, ball(c, '#e0b040'));

  // head
  const hx = 240;
  const hy = 104;
  // headscarf tails behind, on the right
  s += part(c, `M${hx + 30} 96 C${hx + 46} 110 ${hx + 54} 140 ${hx + 50} 178 L${hx + 66} 172 C${hx + 70} 140 ${hx + 60} 108 ${hx + 40} 88Z`, cyl(c, '#a8201c', [0, 0, 1, 0.3]),
    Ln(c, `M${hx + 40} 98 C${hx + 52} 120 ${hx + 58} 150 ${hx + 56} 176`, '#e8b030', 5, 0.9) + E(c, hx + 60, 140, 8, 40, DEEP, 0.4, 5));
  s += part(c, `M${hx + 34} 96 C${hx + 56} 112 ${hx + 72} 136 ${hx + 76} 162 L${hx + 86} 152 C${hx + 82} 124 ${hx + 64} 100 ${hx + 42} 86Z`, cyl(c, '#b8261e', [0, 0, 1, 0.3]),
    Ln(c, `M${hx + 44} 94 C${hx + 62} 112 ${hx + 74} 132 ${hx + 80} 156`, '#e8b030', 4.5, 0.9));
  // hair at the temples
  s += S(c, `M${hx - 38} 86 C${hx - 42} 100 ${hx - 40} 112 ${hx - 35} 120 L${hx - 30} 100Z`, hair, 1);
  s += S(c, `M${hx + 38} 86 C${hx + 42} 100 ${hx + 40} 112 ${hx + 35} 120 L${hx + 30} 100Z`, hair, 1);
  const grin = g;
  s += G(`translate(${hx} ${hy})`, face(c, {
    skin, iris: '#4a2c18', brow: hair, browW: 1.5, jaw: 1.18, cheek: 1.04, chin: 49, expr: grin ? 'grin' : 'smile',
    blush: 0.3, noseW: 1.25, noseCol: '#d88a66', age: 0.4, gaze: grin ? -0.8 : 0,
  }));
  // beard and moustache
  const beard = `M${hx - 36} 116 C${hx - 34} 140 ${hx - 22} 160 ${hx} 162 C${hx + 22} 160 ${hx + 34} 140 ${hx + 36} 116 C${hx + 30} 128 ${hx + 22} 136 ${hx + 14} 140 C${hx + 8} 142 ${hx - 8} 142 ${hx - 14} 140 C${hx - 22} 136 ${hx - 30} 128 ${hx - 36} 116Z`;
  let bsh = '';
  for (let i = 0; i < 16; i++) {
    const x = hx - 30 + i * 4;
    bsh += Ln(c, `M${x} ${128 + Math.abs(i - 7.5) * -1.2} q ${(i - 7.5) * 0.4} 12 ${(i - 7.5) * 0.3} 22`, '#5a4a44', 0.9, 0.45);
  }
  bsh += E(c, hx + 22, 150, 16, 16, DEEP, 0.4, 5);
  s += part(c, beard, R(c, [0.4, 0.3, 0.8], [[0, '#3a2c28'], [1, '#151012']]), bsh);
  const mo = grin
    ? `M${hx} 129 C${hx - 8} 125 ${hx - 20} 124 ${hx - 26} 130 C${hx - 30} 134 ${hx - 32} 140 ${hx - 30} 146 C${hx - 26} 138 ${hx - 20} 134 ${hx - 12} 134 C${hx - 6} 134 ${hx} 132 ${hx} 132 C${hx} 132 ${hx + 6} 134 ${hx + 12} 134 C${hx + 20} 134 ${hx + 26} 138 ${hx + 30} 146 C${hx + 32} 140 ${hx + 30} 134 ${hx + 26} 130 C${hx + 20} 124 ${hx + 8} 125 ${hx} 129Z`
    : `M${hx} 127 C${hx - 8} 123 ${hx - 20} 123 ${hx - 25} 130 C${hx - 28} 135 ${hx - 29} 142 ${hx - 26} 148 C${hx - 22} 140 ${hx - 18} 136 ${hx - 10} 136 C${hx - 4} 136 ${hx} 134 ${hx} 134 C${hx} 134 ${hx + 4} 136 ${hx + 10} 136 C${hx + 18} 136 ${hx + 22} 140 ${hx + 26} 148 C${hx + 29} 142 ${hx + 28} 135 ${hx + 25} 130 C${hx + 20} 123 ${hx + 8} 123 ${hx} 127Z`;
  s += part(c, mo, L(c, [0, 0, 0.3, 1], [[0, '#4a3a34'], [1, '#141012']]),
    Ln(c, `M${hx - 4} 129 C${hx - 12} 128 ${hx - 20} 130 ${hx - 24} 138 M${hx + 4} 129 C${hx + 12} 128 ${hx + 20} 130 ${hx + 24} 138`, '#6a5a54', 1, 0.6));
  // headscarf dome with stripes
  const scarf = `M${hx - 41} 96 C${hx - 44} 64 ${hx - 24} 46 ${hx} 46 C${hx + 26} 46 ${hx + 44} 62 ${hx + 42} 96 C${hx + 34} 84 ${hx + 16} 78 ${hx} 78 C${hx - 16} 78 ${hx - 32} 84 ${hx - 41} 96Z`;
  let ssh = '';
  for (let i = 0; i < 7; i++) {
    const y = 40 + i * 9;
    ssh += Ln(c, `M${hx - 50} ${y + 24} C${hx - 26} ${y - 4} ${hx + 26} ${y - 4} ${hx + 50} ${y + 24}`, '#e8b030', 4.2, 0.95);
  }
  ssh += E(c, hx - 18, 58, 18, 10, '#fff0c0', 0.35, 6);
  ssh += E(c, hx + 40, 80, 14, 30, DEEP, 0.55, 7);
  ssh += Ln(c, `M${hx - 40} 92 C${hx - 30} 82 ${hx - 14} 78 ${hx} 78 C${hx + 16} 78 ${hx + 32} 84 ${hx + 41} 94`, DEEP, 4, 0.35, 2);
  s += part(c, scarf, cyl(c, '#b02420', [0, 0, 1, 0.4]), ssh);
  // knot
  s += part(c, `M${hx + 32} 82 C${hx + 42} 74 ${hx + 54} 80 ${hx + 52} 92 C${hx + 50} 102 ${hx + 38} 102 ${hx + 34} 96Z`, ball(c, '#b8261e'),
    Ln(c, `M${hx + 36} 84 C${hx + 44} 86 ${hx + 48} 92 ${hx + 46} 98`, '#e8b030', 3, 0.9));

  // arms
  const sleeve = (d, shade = '') => part(c, d, cyl(c, green, [0, 0, 1, 0.2]), shade);
  const forearm = (d) => part(c, d, cyl(c, skin, [0, 0, 1, 0.3]),
    Ln(c, d.replace(/Z$/, ''), dk(skin, 0.5), 0.1, 0) );
  if (!g) {
    // left arm (viewer's left): hangs then forearm comes in over the belly
    s += sleeve('M134 182 C114 192 104 222 104 262 C104 286 108 300 116 314 L160 302 C156 280 156 252 160 226 C162 206 156 190 134 182Z',
      E(c, 150, 260, 10, 50, dk(green, 0.6), 0.45, 6) + Ln(c, 'M114 240 C120 252 126 262 136 268', dk(green, 0.6), 3, 0.4, 2));
    s += sleeve('M346 182 C366 192 376 222 376 262 C376 286 372 300 364 314 L320 302 C324 280 324 252 320 226 C318 206 324 190 346 182Z',
      E(c, 330, 250, 12, 60, dk(green, 0.6), 0.45, 8));
    // forearms
    s += part(c, 'M112 300 C118 322 140 336 170 340 L214 340 L218 312 L172 304 C152 300 136 296 120 290Z', cyl(c, skin, [0, 0, 0, 1]),
      E(c, 160, 330, 40, 8, dk(skin, 0.5), 0.4, 4) + Ln(c, 'M140 312 l6 2 M152 314 l6 1 M164 316 l6 0 M146 320 l5 2', '#5a3020', 0.9, 0.5));
    s += part(c, 'M368 300 C362 322 340 336 310 340 L266 340 L262 312 L308 304 C328 300 344 296 360 290Z', cyl(c, dk(skin, 0.15), [0, 0, 0, 1]),
      E(c, 320, 332, 40, 8, dk(skin, 0.6), 0.45, 4) + Ln(c, 'M318 312 l6 2 M330 314 l6 1 M306 316 l6 1', '#5a3020', 0.9, 0.5));
    // rolled cuffs
    s += part(c, 'M106 286 C116 300 130 306 146 306 L150 290 C134 290 120 284 112 270Z', cyl(c, lit(green, 0.2), [0, 0, 0, 1]), Ln(c, 'M108 282 C118 294 132 298 148 298', dk(green, 0.4), 1.5, 0.5));
    s += part(c, 'M374 286 C364 300 350 306 334 306 L330 290 C346 290 360 284 368 270Z', cyl(c, green, [0, 0, 0, 1]), Ln(c, 'M372 282 C362 294 348 298 332 298', dk(green, 0.5), 1.5, 0.5));
    // clasped hands: left hand under, right hand over
    s += part(c, 'M206 308 C222 302 244 304 256 314 C262 322 258 336 246 342 C232 348 214 346 204 338Z', ball(c, dk(skin, 0.05)));
    const hand2 = 'M232 306 C246 300 266 302 276 310 C284 318 282 334 272 342 C262 350 240 350 230 344 C222 338 222 314 232 306Z';
    s += part(c, hand2, ball(c, skin, 1, [0.4, 0.3]),
      Ln(c, 'M234 324 C244 326 260 326 272 322 M234 333 C244 336 258 336 270 332 M236 315 C246 316 260 316 270 314', dk(skin, 0.45), 1.6, 0.6, 0.7) +
      E(c, 250, 312, 14, 5, lit(skin, 0.5), 0.45, 2));
    s += part(c, 'M212 312 C206 318 206 328 212 334 C218 334 222 326 220 316Z', cyl(c, skin));
  } else {
    // raised arm (viewer's left) holding up a coin
    s += sleeve('M136 182 C112 186 92 196 80 214 C70 230 70 252 82 262 L118 240 C122 226 132 214 148 210 C160 204 158 188 136 182Z',
      E(c, 110, 240, 30, 10, dk(green, 0.6), 0.5, 6));
    s += part(c, 'M70 226 C66 196 72 164 86 130 L112 138 C104 168 102 198 108 232Z', cyl(c, skin, [0, 0, 1, 0.1]),
      Ln(c, 'M80 200 l4 3 M78 180 l5 2 M84 160 l4 3 M90 210 l4 2', '#5a3020', 0.9, 0.5) + E(c, 104, 190, 6, 40, dk(skin, 0.5), 0.45, 4));
    s += part(c, 'M66 236 C64 222 70 210 80 206 L112 216 C114 228 110 240 104 248 C90 250 76 246 66 236Z', cyl(c, lit(green, 0.2), [0, 0, 1, 0.5]),
      Ln(c, 'M70 226 C82 232 96 234 108 230', dk(green, 0.4), 1.5, 0.5));
    // hand: fist with thumb and forefinger pinching the coin
    s += part(c, 'M82 140 C76 124 80 104 94 98 C108 92 122 100 124 114 C126 128 118 142 108 146 C98 150 86 150 82 140Z', ball(c, skin, 1, [0.35, 0.3]),
      Ln(c, 'M92 112 C100 110 110 112 118 116 M90 122 C100 120 110 122 118 126 M92 132 C100 132 108 134 114 136', dk(skin, 0.45), 1.6, 0.6, 0.7));
    s += finger(c, 112, 102, 118, 84, 9, skin);
    s += finger(c, 96, 100, 102, 82, 8.5, lit(skin, 0.05));
    s += coin(c, 110, 70, 15, 0.92);
    s += finger(c, 92, 104, 98, 88, 8, lit(skin, 0.1));
    // other arm: hand on the belly
    s += sleeve('M346 182 C366 192 376 222 376 262 C376 286 372 300 364 314 L320 302 C324 280 324 252 320 226 C318 206 324 190 346 182Z',
      E(c, 330, 250, 12, 60, dk(green, 0.6), 0.45, 8));
    s += part(c, 'M368 300 C362 322 340 336 310 340 L280 340 L276 312 L308 304 C328 300 344 296 360 290Z', cyl(c, dk(skin, 0.15), [0, 0, 0, 1]),
      E(c, 320, 332, 40, 8, dk(skin, 0.6), 0.45, 4) + Ln(c, 'M318 312 l6 2 M330 314 l6 1 M306 316 l6 1', '#5a3020', 0.9, 0.5));
    s += part(c, 'M374 286 C364 300 350 306 334 306 L330 290 C346 290 360 284 368 270Z', cyl(c, green, [0, 0, 0, 1]), Ln(c, 'M372 282 C362 294 348 298 332 298', dk(green, 0.5), 1.5, 0.5));
    const hand2 = 'M240 308 C254 300 276 302 286 312 C292 322 290 336 280 342 C268 350 248 350 238 342 C230 334 230 316 240 308Z';
    s += part(c, hand2, ball(c, skin, 1, [0.4, 0.3]),
      Ln(c, 'M244 324 C254 326 270 326 280 322 M244 334 C254 336 268 336 278 332 M246 315 C256 316 270 316 280 314', dk(skin, 0.45), 1.6, 0.6, 0.7));
  }
  const over = g ? glint(98, 58, 16) + glint(126, 80, 7, '#fff6d8', 0.8) : '';
  return wrap(c, s, { over });
}

export const ART_PEOPLE = {
  merchant: { w: 480, h: 640, height: 1.75, frames: { idle: merchant('idle'), attack: merchant('attack') } },
};
