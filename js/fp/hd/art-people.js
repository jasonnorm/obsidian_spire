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
  s += Ln(c, `M-9.2 1 C-5.8 ${f2(-5.6 * op)} 3 ${f2(-7.1 * op)} 9.8 0.4`, o.lash || '#3a2018', 1.2);
  s += Ln(c, `M0 ${f2(-6.2 * op)} C4 ${f2(-6.4 * op)} 7.4 ${f2(-3.6 * op)} 9.8 0.4`, o.lash || '#2e1a14', 1.8);
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
  const fo = { skin, iris: '#56708c', brow: '#6a4a36', browW: 0.9, expr: g ? 'smile' : 'kind', blush: 0.24, age: 0.3, jaw: 0.94, cheek: 0.98, shadow: 0.55 };
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
  s += S(c, 'M0 -14 C-7 -20 -6 -28 -1 -34 C-1 -28 4 -27 3 -32 C9 -26 8 -18 0 -14Z', L(c, [0, 1, 0, 0], [[0, '#ff9a20'], [0.6, '#ffd040'], [1, '#fff6c0']]));
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
  for (const [x, i] of [[216, 0], [264, 1]]) {
    s += part(c, `M${x - 20} 470 L${x + 20} 470 L${x + 17} 610 L${x - 17} 610Z`, cyl(c, hose, [0, 0, 1, 0]),
      E(c, x, 474, 26, 20, DEEP, 0.7, 6) + fold(`M${x - 8} 530 q 8 5 16 0`, 2.4, 0.4, 1.4));
    const sx = x + (i ? 6 : -6);
    s += part(c, `M${sx - 20} 604 L${sx + 20} 604 C${sx + 24} 616 ${sx + 28 + (i ? 6 : -2)} 628 ${sx + 26 + (i ? 4 : -2)} 640 L${sx - 26 + (i ? 2 : -4)} 640 C${sx - 28 + (i ? 2 : -6)} 628 ${sx - 24} 616 ${sx - 20} 604Z`, cyl(c, '#4a2614', [0, 0, 1, 0.3]),
      E(c, sx - 4, 622, 12, 6, lit('#4a2614', 0.6), 0.55, 3) + E(c, sx, 638, 30, 3, DEEP, 0.7, 1.2));
  }

  // blue doublet body
  const body = 'M206 160 C180 164 160 170 148 182 C134 196 132 222 134 250 C132 300 138 360 146 420 C170 440 310 440 334 420 C342 360 348 300 346 250 C348 222 346 196 332 182 C320 170 300 164 274 160Z';
  s += part(c, body, cyl(c, blue, [0, 0.1, 1, 0.3]), E(c, 330, 300, 20, 120, DEEP, 0.5, 10));
  // doublet skirt below the tabard
  s += part(c, 'M150 400 C190 412 290 412 330 400 L338 478 C300 488 180 488 142 478Z', cyl(c, dk(blue, 0.15), [0, 0, 1, 0.2]),
    fold('M176 420 L172 478 M210 424 L208 484 M270 424 L272 484 M304 420 L308 478', 5, 0.45, 3) + fold('M184 424 L180 478 M218 426 L216 482', 2, 0.35, 1, lit(blue, 0.6)));

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
  hs.push(E(c, hx - 12, 64, 16, 8, '#fff2e0', 0.6, 4));
  // side tufts over the ears
  for (const sd of [-1, 1]) {
    const d = `M${hx + sd * 33} 76 C${hx + sd * 46} 82 ${hx + sd * 49} 100 ${hx + sd * 44} 118 C${hx + sd * 40} 112 ${hx + sd * 38} 104 ${hx + sd * 35} 98 C${hx + sd * 38} 92 ${hx + sd * 36} 84 ${hx + sd * 33} 76Z`;
    let t = '';
    for (let i = 0; i < 6; i++) t += Ln(c, `M${hx + sd * (35 + i * 2)} ${78 + i * 2} q ${sd * 6} 14 ${sd * 2} ${30 - i * 2}`, '#ffffff', 1, 0.5);
    hs.push(part(c, d, sd < 0 ? '#e2deda' : '#a8a4ac', t));
  }
  // beard
  const beard = `M${hx - 36} 104 C${hx - 40} 136 ${hx - 34} 176 ${hx - 18} 206 C${hx - 10} 220 ${hx - 4} 226 ${hx} 228 C${hx + 4} 226 ${hx + 10} 220 ${hx + 18} 206 C${hx + 34} 176 ${hx + 40} 136 ${hx + 36} 104 C${hx + 32} 120 ${hx + 24} 130 ${hx + 14} 132 C${hx + 8} 133 ${hx - 8} 133 ${hx - 14} 132 C${hx - 24} 130 ${hx - 32} 120 ${hx - 36} 104Z`;
  let bsh = '';
  for (let i = 0; i < 22; i++) {
    const k = i - 10.5;
    const x0 = hx + k * 3.2;
    bsh += Ln(c, `M${f2(x0)} ${f2(118 + Math.abs(k) * 0.6)} C${f2(x0 + k * 0.4)} 160 ${f2(x0 + k * 0.2)} 190 ${f2(hx + k * 0.9)} ${f2(222 - Math.abs(k) * 1.6)}`, i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#8e8a96' : '#c8c4c4', i % 3 === 0 ? 1.2 : 1, 0.6);
  }
  bsh += E(c, hx + 26, 170, 16, 50, '#3a3448', 0.5, 8) + E(c, hx - 14, 150, 14, 30, '#ffffff', 0.35, 8);
  hs.push(part(c, beard, L(c, [0, 0, 1, 1], [[0, '#f4f0ea'], [0.5, '#c4c0c4'], [1, '#6e6878']]), bsh));
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
    s += sleeve('M160 178 C138 182 124 200 122 228 C118 256 120 284 128 300 C140 316 168 320 190 318 L190 296 C172 292 160 286 156 270 C154 250 160 220 160 178Z', 140, -1);
    s += sleeve('M320 178 C342 182 356 200 358 228 C362 256 360 284 352 300 C340 316 312 320 290 318 L290 296 C308 292 320 286 324 270 C326 250 320 220 320 178Z', 340, 1);
    s += G('translate(240 290)', book(true));
    s += cuff(184, 308, 80) + cuff(296, 308, -80);
    s += part(c, 'M170 300 C176 292 190 290 196 298 C200 308 196 322 186 326 C176 328 168 320 170 300Z', ball(c, skin, 1, [0.35, 0.3]));
    s += part(c, 'M310 300 C304 292 290 290 284 298 C280 308 284 322 294 326 C304 328 312 320 310 300Z', ball(c, dk(skin, 0.1), 1, [0.35, 0.3]));
    s += finger(c, 186, 294, 192, 284, 7, skin) + finger(c, 294, 294, 288, 284, 7, dk(skin, 0.1));
  }
  return wrap(c, s);
}

export const ART_PEOPLE = {
  merchant: { w: 480, h: 640, height: 1.75, frames: { idle: merchant('idle'), attack: merchant('attack') } },
  priest: { w: 480, h: 680, height: 1.8, frames: { idle: priest('idle'), attack: priest('attack') } },
  steward: { w: 480, h: 640, height: 1.75, frames: { idle: steward('idle'), attack: steward('attack') } },
};
