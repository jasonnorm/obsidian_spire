// Obsidian Spire: picture-window glyphs.
//
// The tower console has a small backlit picture window. Each glyph here is
// one "slide" for it: a bold silhouette lit in a single colour, with detail
// carved into it in the window's dark backing colour. Pure strings, no DOM.
//
// Every glyph is inner markup for viewBox "0 0 120 90":
//   lit parts      fill/stroke currentColor (tint with CSS `color`)
//   carved detail  fill/stroke var(--slide-ink, #140d08)
//   secondary      currentColor at opacity .45 (ground lines, glows, motion)
// No ids, gradients, filters or text, so any number can share a page.

const INK = 'var(--slide-ink, #140d08)';
const K = `fill="${INK}"`;
const ks = (w = 3) => `fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const ls = (w = 3) => `fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
// ink outline painted under a lit shape: separates it from what is behind
const sep = (w = 1.5) => `stroke="${INK}" stroke-width="${2 * w}" stroke-linejoin="round" paint-order="stroke"`;
const DIM = 'opacity=".45"';
// lit stroke with an ink keyline under it (for lit strokes crossing lit shapes)
const lsep = (d, w = 3, s = 1.5) => `<path d="${d}" ${ks(w + 2 * s)}/><path d="${d}" ${ls(w)}/>`;

const r1 = (n) => Math.round(n * 10) / 10;
const pol = (cx, cy, r, deg) => [r1(cx + r * Math.cos((deg * Math.PI) / 180)), r1(cy + r * Math.sin((deg * Math.PI) / 180))];
const g = (...parts) => `<g>${parts.join('')}</g>`;
const ground = (x1 = 22, x2 = 98, y = 80) => `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="3" rx="1.5" ${DIM}/>`;

// alternating outer/inner radius polygon (stars, gems). rot = angle of first point
function starPts(cx, cy, R, r, n, rot = -90) {
  const p = [];
  for (let i = 0; i < 2 * n; i++) p.push(pol(cx, cy, i % 2 ? r : R, rot + (i * 180) / n).join(','));
  return p.join(' ');
}
// triangular rays: base half-width hw at radius r0, tip at r2
function rays(cx, cy, angles, r0, r2, hw = 3, attrs = '') {
  let d = '';
  for (const a of angles) {
    const [bx, by] = pol(cx, cy, r0, a);
    const [tx, ty] = pol(cx, cy, r2, a);
    const nx = r1(-Math.sin((a * Math.PI) / 180) * hw), ny = r1(Math.cos((a * Math.PI) / 180) * hw);
    d += `M${r1(bx + nx)} ${r1(by + ny)}L${tx} ${ty}L${r1(bx - nx)} ${r1(by - ny)}Z`;
  }
  return `<path d="${d}" ${attrs}/>`;
}
// straight ray strokes from r0 to r2
function rayLines(cx, cy, angles, r0, r2, attrs) {
  let d = '';
  for (const a of angles) d += `M${pol(cx, cy, r0, a).join(' ')}L${pol(cx, cy, r2, a).join(' ')}`;
  return `<path d="${d}" ${attrs}/>`;
}
// four-point twinkle
const spark = (cx, cy, r, attrs = '') =>
  `<path d="M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z" ${attrs}/>`;
// tapered stroke along a cubic bezier [x0,y0,x1,y1,x2,y2,x3,y3]: width w0 -> w1
function taper(p, w0, w1 = 0.6, attrs = '') {
  const L = [], R = [], N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6];
    const y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7];
    const dx = 3 * u * u * (p[2] - p[0]) + 6 * u * t * (p[4] - p[2]) + 3 * t * t * (p[6] - p[4]);
    const dy = 3 * u * u * (p[3] - p[1]) + 6 * u * t * (p[5] - p[3]) + 3 * t * t * (p[7] - p[5]);
    const len = Math.hypot(dx, dy) || 1, hw = (w0 + (w1 - w0) * t) / 2;
    L.push(`${r1(x - (dy / len) * hw)} ${r1(y + (dx / len) * hw)}`);
    R.unshift(`${r1(x + (dy / len) * hw)} ${r1(y - (dx / len) * hw)}`);
  }
  return `<path d="M${L.join('L')}L${R.join('L')}Z" ${attrs}/>`;
}
// battlements: n merlons spanning width w, top edge at y
function crenels(x, y, w, n, h = 5, attrs = '') {
  const m = w / (2 * n - 1);
  let d = '';
  for (let i = 0; i < n; i++) d += `M${r1(x + 2 * i * m)} ${y}h${r1(m)}v${h}h${r1(-m)}z`;
  return `<path d="${d}" ${attrs}/>`;
}
// a sword pointing up, guard centred on the origin, blade length len
const sword = (len, attrs = '') =>
  `<path d="M-4.5 -1V${-len + 9}L0 ${-len}L4.5 ${-len + 9}V-1Z" ${attrs}/>` +
  `<rect x="-12" y="-2" width="24" height="5" rx="2.5" ${attrs}/>` +
  `<rect x="-2.5" y="3" width="5" height="11"/><circle cy="16.5" r="4" ${attrs}/>` +
  `<path d="M0 -6V${-len + 13}" ${ks(2.5)}/>`;

// ---------------------------------------------------------------- figures
const soldier = (cx, y0) =>
  `<path d="M${cx + 15} ${y0 - 8}V80" ${ls(3)}/><path d="M${cx + 15} ${y0 - 19}l4.5 8-4.5 4-4.5-4z"/>` +
  `<path d="M${cx - 12} 80L${cx - 11} ${y0 + 27}Q${cx - 11} ${y0 + 20} ${cx - 4} ${y0 + 20}H${cx + 4}Q${cx + 11} ${y0 + 20} ${cx + 11} ${y0 + 27}L${cx + 12} 80Z"/>` +
  `<circle cx="${cx}" cy="${y0 + 14}" r="6"/>` +
  `<path d="M${cx - 8} ${y0 + 11}Q${cx - 8} ${y0} ${cx} ${y0}Q${cx + 8} ${y0} ${cx + 8} ${y0 + 11}Z"/>` +
  `<rect x="${cx - 11}" y="${y0 + 9}" width="22" height="3.5" rx="1.75"/>` +
  `<rect x="${cx - 5}" y="${y0 + 13}" width="10" height="2.6" ${K}/>` +
  `<path d="M${cx + 8} ${y0 + 24}L${cx + 15} ${y0 + 32}" ${ls(5)}/><circle cx="${cx + 15}" cy="${y0 + 32}" r="3.6"/>` +
  `<path d="M${cx - 11} ${y0 + 40}H${cx + 11}M${cx} 80V${y0 + 46}" ${ks(3)}/>`;

const bandit =
  `<path d="M24 80L28 52Q30 44 40 44Q50 44 52 52L56 80Z"/>` +
  `<circle cx="40" cy="35" r="8"/>` +
  `<rect x="31" y="31.5" width="18" height="5.5" rx="2.7" ${K}/>` +
  `<circle cx="36" cy="34.2" r="1.5"/><circle cx="44" cy="34.2" r="1.5"/>` +
  `<path d="M30 50L20 30" ${ls(6)}/><circle cx="19.5" cy="28.5" r="4.3"/>` +
  `<path d="M16.8 25L19.5 8L22.2 25Z"/><rect x="13" y="23.5" width="13" height="3.4" rx="1.7"/>` +
  `<path d="M29 60H51M40 80V68" ${ks(3)}/>`;

// ---------------------------------------------------------------- glyphs
export const GLYPHS = {
  // ---------------------------------------------------- resources & people
  company: g(soldier(27, 30), soldier(87, 30), soldier(57, 26), ground(10, 110, 81)),

  coin: g(
    `<path d="M19 27V74A20 6 0 0 0 59 74V27Z"/><ellipse cx="39" cy="27" rx="20" ry="6"/>`,
    `<path d="M19 34.8A20 6 0 0 0 59 34.8M19 42.6A20 6 0 0 0 59 42.6M19 50.4A20 6 0 0 0 59 50.4M19 58.2A20 6 0 0 0 59 58.2M19 66A20 6 0 0 0 59 66" ${ks(2.5)}/>`,
    `<ellipse cx="39" cy="27" rx="13" ry="3" ${ks(2.5)}/>`,
    `<circle cx="89" cy="57" r="22" ${DIM}/><circle cx="85" cy="57" r="22"/>`,
    `<circle cx="85" cy="57" r="15.5" ${ks(3)}/>`,
    `<path d="M77 64V50L81 55L85 47.5L89 55L93 50V64Z" ${K}/>`,
    ground(14, 108, 81)
  ),

  provisions: g(
    `<path d="M28 80Q16 78 18 62Q20 46 34 38L32 31Q28 27 31 22L38 26L44 19L50 26L57 22Q60 27 56 31L54 38Q68 46 70 62Q72 78 60 80Z"/>`,
    `<path d="M33 34Q44 37.5 55 34" ${ks(3)}/><path d="M44 74V50M38 54l6 4 6-4M38 62l6 4 6-4" ${ks(2.5)}/>`,
    `<path d="M70 66Q62 52 72 42Q82 32 94 36L98 40Q100 52 90 62Q80 70 70 66Z" ${sep()}/>`,
    `<path d="M95 39L103 31" ${ls(6)}/><circle cx="102" cy="27.5" r="3.6"/><circle cx="106.5" cy="32" r="3.6"/>`,
    `<path d="M90 34.5L99 43.5" ${ks(3)}/><path d="M74 56Q74 46 84 42" ${ks(2.5)}/>`,
    `<ellipse cx="82" cy="71" rx="17" ry="9" ${sep()}/><path d="M74 64l-4 9M82 63l-4 11M90 64l-4 9" ${ks(2.5)}/>`,
    ground(12, 108, 81)
  ),

  sellswords: g(
    // left: plumed hat, sword planted before him
    `<path d="M24 80L26 52Q26 44 34 43H46Q54 44 54 52L56 80Z"/><circle cx="40" cy="35" r="7"/>`,
    `<ellipse cx="40" cy="29" rx="13" ry="3.5"/><path d="M33 29Q33 20 40 20Q47 20 47 29Z"/><path d="M45 22Q49 9 61 11Q52 14 48.5 23Z"/>`,
    `<rect x="34" y="32.5" width="12" height="2.6" ${K}/>`,
    `<path d="M37 57H43L42 77L40 80L38 77Z" ${sep()}/><rect x="32" y="53" width="16" height="4" rx="2" ${sep()}/>`,
    `<rect x="38" y="47" width="4" height="6"/><circle cx="40" cy="47" r="4.5" ${sep()}/>`,
    // right: holds up a coin
    `<path d="M88 47L97 31" ${ls(6)}/><circle cx="97.5" cy="30" r="4.2"/>`,
    `<path d="M64 80L66 52Q66 44 74 43H84Q92 44 92 52L94 80Z"/><circle cx="79" cy="35" r="7"/>`,
    `<path d="M71 33Q71 24 79 24Q87 24 87 33Z"/><rect x="73" y="32.5" width="12" height="2.6" ${K}/>`,
    `<path d="M66 60H92M79 80V68" ${ks(3)}/>`,
    `<circle cx="98.5" cy="19" r="7.2" ${sep(1.2)}/><circle cx="98.5" cy="19" r="3.8" ${ks(2.5)}/>`,
    rayLines(98.5, 19, [-160, -115, -65, -20, 20, 160], 10, 13, `${ls(2)} ${DIM}`),
    ground(14, 108, 81)
  ),

  peddler: g(
    `<g transform="rotate(-12 36 46)"><rect x="18" y="28" width="34" height="38" rx="7"/><rect x="16" y="17" width="36" height="12" rx="6" ${sep(1.2)}/><path d="M18 44H52M30 28V66" ${ks(3)}/><circle cx="22" cy="23" r="2.6" ${ks(2)}/></g>`,
    `<path d="M24 66L21 71" ${ls(2)}/><circle cx="20" cy="75" r="5"/>`,
    `<path d="M46 42Q58 32 72 40L74 46L66 64H52Q44 56 46 42Z" ${sep()}/>`,
    `<path d="M56 63L50 79M64 63L72 79" ${ls(6)}/>`,
    `<path d="M68 47L88 54" ${ls(5)}/>`,
    `<circle cx="77" cy="42" r="6" ${sep(1.2)}/><ellipse cx="78" cy="36.5" rx="11" ry="3"/><path d="M72 37Q72 28 78 28Q84 28 84 37Z"/>`,
    `<path d="M91 30L93 81" ${ls(3.5)}/><circle cx="91" cy="54" r="3.6"/>`,
    ground(10, 106, 81)
  ),

  pilgrim: g(
    `<g transform="translate(-5 0)">`,
    `<circle cx="99" cy="32" r="10" ${DIM}/>`,
    `<path d="M86 17V81" ${ls(3.5)}/><path d="M86 19Q86 9 92 9Q99 9 99 15V20" ${ls(3)}/>`,
    `<path d="M93.5 26L99 20.5L104.5 26Z"/><rect x="95" y="26" width="8" height="11" rx="1"/><path d="M99 29V34" ${ks(2)}/>`,
    `<path d="M58 10Q44 14 44 32L42 44Q38 62 32 80H80Q76 62 72 44Q74 20 58 10Z"/>`,
    `<ellipse cx="61" cy="31" rx="6.5" ry="8.5" ${K}/>`,
    `<path d="M70 40L85 47" ${ls(7)}/><circle cx="86" cy="47" r="3.8"/>`,
    `<path d="M44 50Q58 55 72 50M52 56L48 78M64 57L66 78" ${ks(2.5)}/>`,
    ground(24, 106, 81),
    '</g>'
  ),

  rival: g(
    `<g transform="translate(-3 -1.5)">`,
    // great helm crowned with a tall swept plume
    `<path d="M51 34Q40 16 54 9Q70 3 88 12Q99 19 96 34Q90 23 81 21Q73 20 70 27L69 34Z"/>`,
    `<path d="M56 31Q50 19 60 14Q73 9 86 17M63 31Q62 24 68 20Q77 16 90 24" ${ks(2.5)}/>`,
    `<path d="M38 50Q38 40 60 38Q82 40 82 50V72Q82 80 72 82H48Q38 80 38 72Z"/>`,
    `<rect x="42" y="31" width="36" height="8" rx="4" ${sep(1.5)}/>`,
    `<path d="M48 32.5l3 5M56 32.5l3 5M64 32.5l3 5M72 32.5l-1 3" ${ks(2)}/>`,
    `<rect x="42" y="51" width="15" height="4.5" rx="1.5" ${K}/><rect x="63" y="51" width="15" height="4.5" rx="1.5" ${K}/>`,
    `<path d="M60 43V78" ${ks(3)}/><path d="M68 62v8M73 62v8" ${ks(2.5)}/>`,
    `<ellipse cx="60" cy="85" rx="28" ry="1.6" ${DIM}/>`,
    '</g>'
  ),

  // ---------------------------------------------------------------- foes
  brigands: g(
    bandit,
    `<path d="M33 40Q32 28 40 28Q48 28 47 40" ${ks(2.5)}/>`,
    `<g transform="matrix(-1 0 0 1 120 0)">${bandit}</g>`,
    `<path d="M70 30Q70 21 80 21Q92 21 95 27L89 30Z"/>`,
    ground(10, 110, 81)
  ),

  wolves: g(
    `<circle cx="100" cy="22" r="11" ${DIM}/>`,
    `<path d="M8 80Q10 74 22 72Q20 60 28 52Q38 44 48 40L52 34L50 31L55 28L54 24L56 22L54 10L62 16L66 15L79 7L82 11L72 18L78 20L70 25L73 30L70 33L73 38L69 46L69 80H62L61 62Q54 62 50 70L54 80Z"/>`,
    `<path d="M50 70Q44 58 32 60" ${ks(2.5)}/><path d="M63 18.5l4-1.5" ${ks(2.5)}/>`,
    `<path d="M84 14q3 3 2 7M89 10q5 5 3 12" ${ls(2.5)} ${DIM}/>`,
    ground(6, 84, 81)
  ),

  hounds: g(
    taper([90, 42, 98, 38, 104, 32, 112, 30], 5, 0.6),
    taper([92, 52, 100, 54, 104, 60, 112, 58], 4, 0.5, DIM),
    taper([84, 40, 90, 30, 98, 26, 104, 22], 4, 0.5, DIM),
    `<path d="M10 44L16 39L26 36L30 25L35 34Q46 34 56 38Q72 35 86 40Q93 42 94 48L90 60L96 80H89L82 62Q76 56 70 56Q60 58 50 54L46 62L44 80H38L38 62L34 51L26 49L22 50L11 47Z"/>`,
    `<path d="M20 40.5L29 38.5L26.5 43Z" ${K}/><path d="M13 46H24" ${ks(2)}/>`,
    `<path d="M56 42Q58 48 56 53M62 41Q64 48 62 54M68 41Q70 48 68 54" ${ks(2.5)}/>`,
    ground(8, 104, 81)
  ),

  wraith: g(
    `<ellipse cx="60" cy="83.5" rx="22" ry="2" ${DIM}/>`,
    `<path d="M60 8Q44 10 42 30Q41 40 34 46L16 52L20 60L38 55L36 72L31 75L38 73L40 79L46 72L52 78L58 72L64 78L70 72L76 78L80 73L89 75L84 72L82 55L100 60L104 52L86 46Q79 40 78 30Q76 10 60 8Z"/>`,
    `<ellipse cx="60" cy="30" rx="9" ry="11" ${K}/>`,
    `<ellipse cx="56" cy="30" rx="2" ry="1.4"/><ellipse cx="64" cy="30" rx="2" ry="1.4"/>`,
    `<path d="M18 52q-5-6-10-5M17 56q-6-2-10 1M19 59q-4 2-7 7M102 52q5-6 10-5M103 56q6-2 10 1M101 59q4 2 7 7" ${ls(2.5)}/>`,
    `<path d="M48 46L45 70M60 46V72M72 46L75 70" ${ks(2.5)}/>`
  ),

  wight: g(
    `<path d="M84 30L87 8L90 30Z"/><rect x="80" y="30" width="14" height="3.5" rx="1.7"/>`,
    `<path d="M66 46L78 50L86 38" ${ls(4)}/><circle cx="87" cy="36" r="3.6"/>`,
    `<path d="M42 46L32 54L36 62" ${ls(4)}/>`,
    `<path d="M40 44Q54 38 68 44L66 66H42Z"/><rect x="51" y="36" width="6" height="7"/>`,
    `<path d="M44 49Q54 46 64 49M43 54Q54 51 65 54M43 59Q54 56 65 59M54 44V64" ${ks(2.5)}/>`,
    `<circle cx="54" cy="27" r="10"/><rect x="48" y="32" width="12" height="7" rx="2"/>`,
    `<circle cx="50" cy="27" r="3.2" ${K}/><circle cx="58" cy="27" r="3.2" ${K}/><path d="M54 30.5l-1.6 3h3.2z" ${K}/><path d="M51 35.5v3M54 35.5v3M57 35.5v3" ${ks(2)}/>`,
    `<path d="M44 20V10L49 15L54 6L59 15L64 10V20Z" ${sep(1.2)}/>`,
    `<rect x="14" y="62" width="92" height="18" rx="2" ${sep(1.5)}/><rect x="20" y="67" width="80" height="8" rx="1" ${ks(2.5)}/>`,
    ground(10, 110, 81)
  ),

  sentinels: g(
    `<path d="M78 11V72" ${ls(3.5)}/><path d="M76.3 13L78 6L79.7 13Z"/>`,
    `<path d="M80 14Q95 12 97 27Q89 24 80 28Z"/><path d="M76 17L69 21L76 24Z"/>`,
    `<rect x="40" y="58" width="9" height="15"/><rect x="55" y="58" width="9" height="15"/>`,
    `<path d="M38 30H66L63 52L66 62H38L41 52Z"/>`,
    `<rect x="29" y="37" width="7" height="21" rx="3.5"/>`,
    `<circle cx="38" cy="33" r="7" ${sep(1.2)}/><circle cx="66" cy="33" r="7" ${sep(1.2)}/>`,
    `<path d="M70 37L78 46" ${ls(7)}/><circle cx="78" cy="47" r="4.2" ${sep(1)}/>`,
    `<rect x="44" y="11" width="16" height="18" rx="3"/><rect x="46.5" y="17" width="11" height="3" ${K}/><path d="M52 21V26" ${ks(2)}/>`,
    `<path d="M41 52H63M52 52V62" ${ks(2.5)}/>`,
    `<rect x="27" y="72" width="62" height="9" rx="1"/><path d="M30 75.5H86" ${ks(2.5)}/>`,
    ground(14, 102, 81)
  ),

  ashwarden: g(
    `<path d="M38 22Q24 22 22 6Q30 15 40 15Z"/><path d="M58 22Q72 22 74 6Q66 15 56 15Z"/>`,
    `<path d="M20 42Q22 34 32 35H64Q74 34 76 42L72 52L66 50L64 62L68 80H54L50 66H46L42 80H28L32 62L30 50L24 52Z"/>`,
    `<path d="M24 40L18 28L30 35ZM72 40L78 28L66 35Z"/>`,
    `<path d="M38 36V20Q38 12 48 12Q58 12 58 20V36L48 40Z" ${sep(1.2)}/>`,
    `<path d="M41 23H55M48 23V33" ${ks(3)}/><path d="M32 56H64M48 42V56" ${ks(2.5)}/>`,
    `<g transform="translate(86 61) rotate(16) scale(.9)">` +
      `<path d="M-7 -4Q-16 -12 -11 -23Q-9 -17 -6 -18Q-14 -29 -6 -39Q-5 -32 -2.5 -33Q-8 -45 0 -58Q3 -49 5 -45Q8 -41 6 -35Q11 -38 11 -44Q16 -32 8 -25Q12 -25 14 -29Q16 -14 7 -4Z"/>` +
      `<path d="M-3.5 -3V-42L0 -49L3.5 -42V-3Z" ${sep(1.5)}/>` +
      `<rect x="-11" y="-3" width="22" height="4.5" rx="2.2" ${sep(1.2)}/>` +
      `<rect x="-2.2" y="1.5" width="4.4" height="10"/><circle cy="13.5" r="3.5"/></g>`,
    `<path d="M68 42Q80 46 84 62" ${ls(8)}/>`,
    `<circle cx="104" cy="30" r="1.6" ${DIM}/><circle cx="96" cy="14" r="1.4" ${DIM}/><circle cx="108" cy="44" r="1.3" ${DIM}/>`,
    ground(14, 108, 81)
  ),

  dragon: (() => {
    // head (tilted down to rake fire at the ground), neck, horns, spikes, tail and far leg share one keyline
    const head =
      `<g transform="rotate(-25 50 16)">` +
      `<path d="M18 15Q20 11 26 11L36 9Q42 5 48 8Q54 9 57 14L56 24L46 33Q38 37 30 37L24 36Q22 34 25 33L42 23L22 20Q17 19 18 15Z"/>` +
      `<path d="M46 31L54 32L47 36Z"/></g>`;
    const headInk =
      `<g transform="rotate(-25 50 16)">` +
      `<path d="M37 14.5L46 12L44 16.5Z" ${K}/><ellipse cx="22" cy="14" rx="1.6" ry="1.1" ${K}/>` +
      `<path d="M23.8 20.2L25.4 24.4L27 20.4ZM30.4 20.9L31.8 24.2L33.2 21ZM27 32.4L28.6 28.4L30.2 31.4ZM33 29.4L34.4 26.2L35.8 28.6Z"/></g>`;
    const core =
      head +
      `<path d="M50 12Q62 16 63 26Q65 34 72 39Q80 45 80 58L76 68H58Q49 64 47 57Q44 50 47 44Q52 38 50 32L46 22Z"/>` +
      taper([47, 12, 53, 6.5, 61, 5.5, 69, 8], 6, 0.6) + taper([52, 14, 58, 12, 64, 13, 69, 17], 4, 0.6) +
      `<path d="M58 16L65 15L62 21ZM62 23L69 24L64 28ZM64 31L71 33L66 36Z"/>` +
      taper([78, 58, 92, 70, 94, 82, 106, 70], 11, 3) +
      `<path d="M104 72L112 62L101 66ZM86 68L90 62L92 70ZM95 76L101 71L101 78Z"/>` +
      `<path d="M72 62L80 76L88 80H74L68 70Z"/>`;
    return g(
      `<path d="M44 26C36 30 26 32 16 36C12 38 9 39 7 40C12 42 11 45 6 49C12 51 11 54 7 59C13 59 15 62 13 68C18 64 21 66 22 69C24 60 28 52 34 45C37 40 41 34 45 30Z" ${DIM}/>`,
      `<circle cx="28" cy="72" r="1.5" ${DIM}/><circle cx="12" cy="70" r="1.3" ${DIM}/><circle cx="18" cy="76" r="1.1" ${DIM}/>`,
      `<path d="M58 36L72 9L96 5.5Q88 13 94 20L78 34Z" ${sep(1.2)}/>`,
      `<path d="M62 40L84 12L110 7Q102 14.5 114 22Q102.5 24.4 111 40Q97.3 34 98 52Q87.5 41.4 80 56Z" ${sep(1.2)}/><path d="M84 12L80.5 6.5L88 9.5Z"/>`,
      `<path d="M84 12L112 22M84 12L109 39M84 12L97 50" ${ks(2.5)}/>`,
      `<path d="M51 44L44 48L41 43" ${ls(4.5)}/>`,
      taper([42, 44, 39, 40, 38, 38, 38, 35], 2.8, 0.4), taper([42, 44, 38, 43, 36, 42, 34, 40], 2.8, 0.4),
      `<g ${sep(1.5)}>${core}</g>`, core, headInk,
      `<path d="M58 60q2 2 6 2M54 64q3 1 6 1" ${ks(2.5)}/>`,
      `<path d="M58 54Q72 50 76 62Q76 70 68 72L70 77L74 80H54L56 77Q57 73 60 70Q50 66 52 60Q53 56 58 54Z" ${sep(1.5)}/>`,
      `<path d="M55 80L48 78.5L55 76Z"/><path d="M62 77v3" ${ks(2.5)}/>`,
      lsep('M54 50L47 59L41 54', 5.5, 1.2),
      taper([41, 54, 37, 51, 35, 49, 34, 46], 3.2, 0.4), taper([41, 54, 37, 54, 34, 53, 32, 51], 3.2, 0.4), taper([42, 55, 38, 57, 35, 57, 33, 56], 3, 0.4),
      ground(30, 112, 81)
    );
  })(),

  troll: g(
    `<path d="M12 80V26M19 80V34" ${ls(2)} ${DIM}/><rect x="10" y="18" width="4" height="11" rx="2" ${DIM}/><rect x="17" y="26" width="4" height="10" rx="2" ${DIM}/>`,
    `<path d="M82 44Q94 54 95 66" ${ls(7)}/><circle cx="95.5" cy="69" r="4.5"/><path d="M92 72v5M95.5 73v5M99 71.5v4.5" ${ls(2.4)}/>`,
    `<path d="M50 60L46 72L40 80H56L56 72L58 62Z"/>`,
    `<path d="M48 62Q46 40 52 26Q58 15 68 14Q78 15 82 24Q86 32 85 40Q84 54 78 60Q72 66 60 66Z" ${sep(1.5)}/>`,
    `<path d="M80 30Q82 24 90 25L95 26Q98 28 97 31L96 33L99 35L106 43L101 45L102 46.5L99 48L104 49L101 54L92 54Q84 52 80 46Z" ${sep(1.5)}/>`,
    `<path d="M88 34L77 27L86 41Z" ${sep(1)}/>`,
    `<path d="M64 60L78 64Q84 66 84 72L84 77L92 80H72L74 74L72 70L62 66Z" ${sep(1.2)}/>`,
    (() => {
      const club = `<path d="M33 62L22 66Q12 64 8 71Q7 80 16 80Q26 79 35 69Z"/><path d="M12 64.5L9 58.5L16 63ZM21 65.5L21 59.5L25.5 66.5Z"/>`;
      return `<g ${sep(1.2)}>${club}</g>${club}<path d="M13 71Q19 73 27 71" ${ks(2.5)}/>`;
    })(),
    `<path d="M58 17Q72 14 77 26L71 44Q67 52 59 57L43 68L33 59L48 48Q53 44 55 38L54 28Q54 21 58 17Z" ${sep(1.5)}/>`,
    `<circle cx="36" cy="64" r="7" ${sep(1.2)}/><path d="M31 67Q35 63 40 64" ${ks(2.5)}/><path d="M57 50Q61 47 62 43" ${ks(2.5)}/>`,
    `<circle cx="93.5" cy="33.2" r="1.6" ${K}/><path d="M90 30.5L97 31M99 48H103" ${ks(2.5)}/>`,
    taper([60, 15, 53, 17, 48, 22, 44, 30], 3, 0.6), taper([55, 20, 50, 24, 48, 30, 45, 38], 3, 0.6),
    taper([94, 54, 93, 58, 95, 62, 93, 66], 2.6, 0.6), taper([100, 53, 100, 57, 102, 60, 101, 64], 2.4, 0.6),
    taper([98, 58, 100, 61, 99, 64, 101, 67], 2.2, 0.6), taper([40, 55, 41, 58, 39, 61, 41, 64], 2.2, 0.6),
    ground(8, 112, 81)
  ),

  spiders: (() => {
    const half =
      `<path d="M4 -9L14 -17L15 -27M6 -6L18 -10L24 -19M6 -3L19 2L25 11M5 0L14 11L16 24" ${ls(3.6)}/>` +
      `<path d="M3.5 -12L6 -17" ${ls(2.6)}/>`;
    const spider =
      half + `<g transform="scale(-1 1)">${half}</g>` +
      `<ellipse cy="12" rx="10.5" ry="13" ${sep(1.2)}/><ellipse cy="-6" rx="7.5" ry="8" ${sep(1.2)}/>` +
      `<circle cx="-2.6" cy="-9" r="2" ${K}/><circle cx="2.6" cy="-9" r="2" ${K}/><circle cx="-5.2" cy="-6.6" r="1.2" ${K}/><circle cx="5.2" cy="-6.6" r="1.2" ${K}/>` +
      `<path d="M-4.5 5H4.5L0 11.5L4.5 18H-4.5L0 11.5Z" ${K}/>`;
    const web = (cx, cy, angs) =>
      rayLines(cx, cy, angs, 0, 40, `${ls(1.6)} ${DIM}`) +
      `<path d="${[11, 21, 31].map((r) => 'M' + angs.map((a) => pol(cx, cy, r, a).join(' ')).join('L')).join('')}" ${ls(1.4)} ${DIM}/>`;
    return g(
      web(113, 7, [95, 118, 141, 164]), web(7, 83, [-84, -61, -38, -15]),
      `<path d="M9 7L111 83" ${ls(2)}/>`,
      `<g transform="translate(39 29.5) rotate(-53) scale(.74)">${spider}</g>`,
      `<g transform="translate(79.5 59.5) rotate(-53) scale(.88)">${spider}</g>`
    );
  })(),

  imps: g(
    `<path d="M60 81Q52 76 56 68Q57 73 60 73Q58 66 62 60Q66 68 66 74Q70 72 68 66Q74 74 68 81Z" ${DIM}/>`,
    `<circle cx="52" cy="54" r="1.4" ${DIM}/><circle cx="68" cy="50" r="1.4" ${DIM}/><circle cx="61" cy="44" r="1.2" ${DIM}/>`,
    // left imp: skips along with the stolen coin held high
    `<path d="M34 46L24 23L7 32Q15 34 12 42Q19 41 21 49Q26 47 30 54Z"/><path d="M24 23l-2-5l4.5 2.5z"/><path d="M24 23L13.5 39M24 23L20.5 45.5" ${ks(2.5)}/>`,
    taper([31, 61, 20, 70, 10, 66, 11, 56], 3.5, 1.2), `<path d="M11 48L6.5 56.5L11 54.5L15.5 56.5Z"/>`,
    `<path d="M38 62L42 70L40 79H47M33 62L27 70L20 66" ${ls(4)}/>`,
    `<ellipse cx="36" cy="54" rx="7.5" ry="10" transform="rotate(15 36 54)" ${sep(1.2)}/>`,
    `<path d="M40 47L48 43L52 34M37 50L45 57L50 53" ${ls(4)}/>`,
    rayLines(54, 26, [-160, -120, -80, -40, 0], 9.5, 12.5, `${ls(2)} ${DIM}`),
    `<circle cx="54" cy="26" r="6.5" ${sep(1)}/><circle cx="54" cy="26" r="3.5" ${ks(2.5)}/>`,
    taper([36, 31, 34, 25, 30, 21, 26, 20], 4.4, 0.5), taper([42, 30, 43, 24, 41, 19, 38, 15], 4.4, 0.5),
    `<circle cx="40" cy="37" r="8" ${sep(1)}/><path d="M33 36L24 31L33 41Z"/>`,
    `<path d="M38.5 35l3 1.4M43.5 36.4l3-1.4M39 41Q43 44 47 40" ${ks(2.5)}/>`,
    // right imp: capers on one leg, claws flung up
    `<path d="M86 46L96 23L113 32Q105 34 108 42Q101 41 99 49Q94 47 90 54Z"/><path d="M96 23l2-5l-4.5 2.5z"/><path d="M96 23L106.5 39M96 23L99.5 45.5" ${ks(2.5)}/>`,
    taper([89, 61, 100, 70, 110, 66, 109, 56], 3.5, 1.2), `<path d="M109 48L104.5 56.5L109 54.5L113.5 56.5Z"/>`,
    `<path d="M86 62L88 71L85 79H78M81 62L74 63L73 71" ${ls(4)}/>`,
    `<ellipse cx="84" cy="53" rx="7.5" ry="10" transform="rotate(-15 84 53)" ${sep(1.2)}/>`,
    `<path d="M80 46L73 40L71 30M71 30l-3-4M71 30v-5M71 30l3-4" ${ls(4)}/>`,
    taper([84, 30, 86, 24, 90, 20, 94, 19], 4.4, 0.5), taper([78, 29, 77, 23, 79, 18, 82, 14], 4.4, 0.5),
    `<circle cx="80" cy="36" r="8" ${sep(1)}/><path d="M87 35L96 30L87 40Z"/>`,
    `<path d="M81.5 34l-3 1.4M76.5 35.4l-3-1.4M81 40Q77 43 73 39" ${ks(2.5)}/>`,
    ground(6, 114, 81)
  ),

  ogre: (() => {
    const club =
      `<path d="M83.5 47L77 39.5L86 42.5ZM100.5 37L109 31.5L102.5 31.5Z"/>` +
      taper([80, 68, 88, 50, 95, 33, 102, 16], 9, 16) +
      `<path d="M94.6 12.9L95 7.5L99.5 11L103 6.5L105.5 12L111 9.5L109.4 19.1Z"/>`;
    return g(
      rayLines(16, 18, [0, 60, 120, 180, 240, 300], 0, 4.5, `${ls(1.8)} ${DIM}`),
      rayLines(30, 9, [30, 90, 150, 210, 270, 330], 0, 3, `${ls(1.6)} ${DIM}`),
      rayLines(9, 36, [30, 90, 150, 210, 270, 330], 0, 2.6, `${ls(1.5)} ${DIM}`),
      `<path d="M22 44Q14 56 18 66" ${ls(10)}/><circle cx="19" cy="68" r="6"/><path d="M13.5 62Q19 64.5 24.5 62" ${ks(2.5)}/>`,
      `<path d="M36 68H50L50 80H34Z"/><path d="M58 68H72L74 80H58Z"/><path d="M35 74H50M58 74H73" ${ks(2.5)}/>`,
      `<path d="M30 48Q28 62 34 66H74Q80 62 78 48Z"/>`,
      `<path d="M32 62H76L78 72L74 69L70 73L66 69L62 73L58 69L54 73L50 69L46 73L42 69L38 73L34 69L30 72Z" ${sep(1.2)}/>`,
      `<path d="M86 42L86 52" ${ls(9)}/>`,
      `<path d="M18 46Q20 32 34 30H74Q88 32 90 46L86 50L82 47L78 51L74 47L70 51L66 47L62 51L58 47L54 51L50 47L46 51L42 47L38 51L34 47L30 51L26 47L22 50Z" ${sep(1.2)}/>`,
      `<path d="M27 36l2 4M34 34l2 4M74 34l-2 4M81 36l-2 4" ${ks(2.5)}/>`,
      `<g ${sep(1.2)}>${club}</g>`, club,
      `<path d="M85 46Q88 40 92 36M94 30Q96 24 100 20" ${ks(2.5)}/><ellipse cx="97.5" cy="36" rx="1.6" ry="2.6" transform="rotate(23 97.5 36)" ${K}/>`,
      `<circle cx="86" cy="54" r="6" ${sep(1.2)}/>`,
      `<path d="M42 25Q39 8 54 7Q69 8 66 25Z"/><ellipse cx="41" cy="20" rx="3" ry="4.5"/><ellipse cx="67" cy="20" rx="3" ry="4.5"/>`,
      `<path d="M41 24Q37 36 42 44Q46 49 50 49L51.5 55L53.5 49.5H54.5L56.5 55L58 49Q62 49 66 44Q71 36 67 24Z" ${sep(1.2)}/>`, `<path d="M44.5 45.5L46 51L47.5 47ZM63.5 45.5L62 51L60.5 47Z"/>`,
      `<path d="M45 15L52 18.5M63 15L56 18.5" ${ks(3)}/><circle cx="49" cy="20.5" r="1.7" ${K}/><circle cx="59" cy="20.5" r="1.7" ${K}/>`,
      `<circle cx="52.5" cy="24" r="1" ${K}/><circle cx="55.5" cy="24" r="1" ${K}/>`,
      `<rect x="48" y="26.5" width="12" height="4.5" rx="1.5" ${K}/><path d="M49.5 31L48.5 22.5L52 29.5ZM58.5 31L59.5 22.5L56 29.5Z" ${sep(0.8)}/>`,
      `<path d="M47 33Q45 38 47 43M54 34Q52 40 54 46M61 33Q63 38 61 43" ${ks(2.5)}/>`,
      ground(10, 110, 81)
    );
  })(),

  scorpions: (() => {
    const tail = [65, 37, 9, -19, -47, -75, -103, -131].map((a, i) => {
      const [x, y] = pol(80, 36, 22, a);
      return `<ellipse cx="${x}" cy="${y}" rx="${r1(6.6 - i * 0.3)}" ry="${r1(6.4 - i * 0.2)}" transform="rotate(${a} ${x} ${y})" ${sep(1.2)}/>`;
    });
    const [tx, ty] = pol(80, 36, 22, -155);
    const claw = `<ellipse rx="6.5" ry="8"/>` + taper([-3.5, -5, -7, -11, -6, -18, -2, -21], 5.5, 0.6) + taper([3, -5, 8, -9, 9, -15, 6, -18], 4.5, 0.6);
    return g(
      `<g transform="translate(2 0)">`,
      `<path d="M46 63L39 67L34 80M54 64L49 69L47 80M64 64L68 69L69 80M74 64L81 67L86 80" ${ls(3.2)}/>`,
      `<path d="M38 54L42 44L38 34" ${ls(4.5)}/>`, `<g transform="translate(37 27) rotate(-22) scale(.86)">${claw}</g>`,
      ...tail,
      `<ellipse cx="${tx}" cy="${ty}" rx="5.5" ry="7" transform="rotate(-155 ${tx} ${ty})" ${sep(1.2)}/>`,
      taper([57, 29, 53, 32, 50, 35, 49, 41], 4.5, 0.5),
      `<path d="M32 60Q34 51 44 50Q62 47 80 50Q90 52 90 58Q88 64 78 65H44Q34 65 32 60Z" ${sep(1.2)}/>`,
      `<path d="M52 49Q54 57 52 64.5M61 48.5Q63 56.5 61 65M70 49Q72 57 70 65M79 50Q81 57 79 64.5" ${ks(2.5)}/>`,
      `<circle cx="40" cy="55" r="1.6" ${K}/><circle cx="43.5" cy="54" r="1" ${K}/>`,
      lsep('M36 58L24 54L20 44', 5, 1.2),
      `<g transform="translate(19 38) rotate(-30)" ${sep(1.2)}>${claw}</g>`, `<g transform="translate(19 38) rotate(-30)">${claw}</g>`,
      '</g>',
      ground(8, 112, 81)
    );
  })(),

  // ---------------------------------------------------------------- places
  keep: g(
    `<path d="M60 16V7" ${ls(2.5)}/><path d="M61 6H76L72 9.5L76 13H61Z"/>`,
    `<rect x="48" y="20" width="24" height="28"/>`, crenels(48, 15, 24, 4, 5),
    `<path d="M57 38V31a3 3 0 0 1 6 0V38Z" ${K}/>`,
    `<rect x="34" y="46" width="52" height="34" ${sep(1.5)}/>`, crenels(34, 41, 52, 6, 5, sep(1.2)),
    `<rect x="16" y="30" width="20" height="50" ${sep(1.5)}/><rect x="14" y="27" width="24" height="5" rx="1"/>`, crenels(14, 21, 24, 3, 6),
    `<rect x="84" y="30" width="20" height="50" ${sep(1.5)}/><rect x="82" y="27" width="24" height="5" rx="1"/>`, crenels(82, 21, 24, 3, 6),
    `<path d="M51 80V67a9 9 0 0 1 18 0V80Z" ${K}/>`,
    `<rect x="24" y="40" width="4" height="10" rx="2" ${K}/><rect x="92" y="40" width="4" height="10" rx="2" ${K}/>`,
    `<rect x="24" y="58" width="4" height="10" rx="2" ${K}/><rect x="92" y="58" width="4" height="10" rx="2" ${K}/>`,
    ground(8, 112, 81)
  ),

  market: g(
    `<path d="M22 12H98L106 30H14Z"/>`,
    (() => {
      let d = '';
      for (let i = 1; i < 7; i += 2) {
        const a = 22 + (i * 76) / 7, b = 22 + ((i + 1) * 76) / 7, c = 14 + (i * 92) / 7, e = 14 + ((i + 1) * 92) / 7;
        const ta = a + (c - a) * 0.11, tb = b + (e - b) * 0.11, bc = a + (c - a) * 0.89, be = b + (e - b) * 0.89;
        d += `M${r1(ta)} 14L${r1(tb)} 14L${r1(be)} 28L${r1(bc)} 28Z`;
      }
      return `<path d="${d}" ${K}/>`;
    })(),
    `<path d="M14 30${'a6.57 6.57 0 0 0 13.14 0'.repeat(7)}Z"/>`,
    `<rect x="17" y="34" width="5" height="46"/><rect x="98" y="34" width="5" height="46"/>`,
    `<path d="M26 56Q21 48 27 42L26 38H35L34 42Q40 48 35 56Z" ${sep(1.2)}/>`,
    `<circle cx="58" cy="51.5" r="4.5" ${sep(1)}/><circle cx="67" cy="51.5" r="4.5" ${sep(1)}/><circle cx="76" cy="51.5" r="4.5" ${sep(1)}/><circle cx="62.5" cy="43.5" r="4.5" ${sep(1)}/><circle cx="71.5" cy="43.5" r="4.5" ${sep(1)}/>`,
    `<path d="M86 56Q84 44 90 41L88 37H97L95 41Q101 44 99 56Z" ${sep(1.2)}/>`,
    `<rect x="12" y="56" width="96" height="5" rx="1.5"/><rect x="16" y="61" width="88" height="19"/>`,
    `<path d="M16 67.5H104M16 74H104" ${ks(2.5)}/>`,
    ground(8, 112, 81)
  ),

  shrine: g(
    `<circle cx="60" cy="52" r="10" ${DIM}/>`,
    `<path d="M30 32A30 22 0 0 1 90 32Z"/><circle cx="60" cy="7.5" r="2.6"/><path d="M60 10V12" ${ls(2.5)}/>`,
    `<path d="M45 31Q46 18 60 10.5M75 31Q74 18 60 10.5M60 11V31" ${ks(2.5)}/>`,
    `<rect x="24" y="31" width="72" height="7" rx="1"/>`,
    ...[32, 46, 74, 88].map((c) => `<rect x="${c - 3.5}" y="38" width="7" height="31"/><rect x="${c - 5.5}" y="38" width="11" height="3"/><rect x="${c - 5}" y="66" width="10" height="3"/>`),
    `<rect x="53.5" y="61" width="13" height="8" rx="1"/>`,
    `<path d="M60 40Q67 48 66.5 54Q66 60 60 60Q54 60 53.5 54Q53 48 60 40Z"/><path d="M60 49Q63 53 62.5 56Q62 58 60 58Q58 58 57.5 56Q57 53 60 49Z" ${K}/>`,
    `<rect x="24" y="69" width="72" height="6" rx="1"/><rect x="18" y="75" width="84" height="6" rx="1"/><path d="M24 75H96" ${ks(2)}/>`
  ),

  // A march gate across the road: two towers, an arch with its portcullis
  // half raised, a pennant on each tower and the road running through.
  border: g(
    `<path d="M24 22V8" ${ls(2.5)}/><path d="M25 8H38L34 11L38 14H25Z"/>`,
    `<path d="M96 22V8" ${ls(2.5)}/><path d="M97 8H110L106 11L110 14H97Z"/>`,
    `<rect x="14" y="28" width="22" height="52" ${sep(1.5)}/>`, crenels(12, 21, 26, 3, 7, sep(1.2)),
    `<rect x="84" y="28" width="22" height="52" ${sep(1.5)}/>`, crenels(82, 21, 26, 3, 7, sep(1.2)),
    `<path d="M36 36H84V80H74V58A14 14 0 0 0 46 58V80H36Z" ${sep(1.5)}/>`, crenels(36, 30, 48, 5, 6, sep(1.2)),
    `<path d="M48 58V66M54 50V66M60 48V66M66 50V66M72 58V66M47 62H73" ${ls(2.5)}/>`,
    `<rect x="22" y="42" width="5" height="11" rx="2.5" ${K}/><rect x="93" y="42" width="5" height="11" rx="2.5" ${K}/>`,
    `<path d="M52 80L56 70H64L68 80Z" ${DIM}/>`,
    ground(4, 116, 81)
  ),

  // The march's garrison: two spearmen behind a striped toll bar.
  marchers: g(
    `<path d="M30 80L32 50Q32 42 40 41H48Q56 42 56 50L58 80Z"/><circle cx="44" cy="32" r="7.5"/>`,
    `<path d="M35 30Q35 19 44 18Q53 19 53 30Z"/><rect x="38" y="29.5" width="12" height="3" ${K}/>`,
    `<path d="M24 82V10" ${ls(3)}/><path d="M24 4L28 13H20Z"/>`,
    `<path d="M66 80L68 50Q68 42 76 41H84Q92 42 92 50L94 80Z"/><circle cx="80" cy="32" r="7.5"/>`,
    `<path d="M71 30Q71 19 80 18Q89 19 89 30Z"/><rect x="74" y="29.5" width="12" height="3" ${K}/>`,
    `<path d="M100 82V10" ${ls(3)}/><path d="M100 4L104 13H96Z"/>`,
    `<path d="M70 50H90V66Q80 74 70 66Z" ${sep(1.5)}/><path d="M80 52V70M72 58H88" ${ks(2.5)}/>`,
    `<rect x="8" y="58" width="104" height="8" rx="2" ${sep(1.5)}/>`,
    `<path d="M20 58L28 66M40 58L48 66M60 58L68 66M80 58L88 66M100 58L108 66" ${ks(4)}/>`,
    `<rect x="10" y="66" width="5" height="16"/><rect x="105" y="66" width="5" height="16"/>`,
    ground(4, 116, 82)
  ),

  barrow: g(
    taper([86, 44, 86, 32, 88, 22, 93, 15], 4.5, 1), taper([87, 31, 81, 27, 79, 23, 77, 20], 2.5, 0.8), taper([88.5, 24, 95, 22, 98, 20, 100, 16], 2.5, 0.8),
    `<path d="M8 80Q12 50 40 40Q60 34 80 40Q108 50 112 80Z"/>`,
    `<path d="M18 66Q25 54 37 49M83 49Q95 54 102 66" ${ks(2.5)}/>`,
    `<rect x="51" y="53" width="18" height="27" ${K}/>`,
    `<rect x="43" y="52" width="8" height="28" rx="1" ${sep()}/><rect x="69" y="52" width="8" height="28" rx="1" ${sep()}/><rect x="39" y="45" width="42" height="8" rx="1" ${sep()}/>`,
    `<path d="M50 49h5M65 49h5" ${ks(2)}/>`,
    ground(6, 114, 81)
  ),

  spire: g(
    rayLines(60, 19, [-155, -125, -55, -25], 12, 15.5, `${ls(2.5)} ${DIM}`),
    `<path d="M36 82L45 74L51 34H69L75 74L84 82Z"/>`,
    `<path d="M45 82L39 66L47.5 72ZM75 82L81 66L72.5 72ZM50.5 50L44 45L51 44ZM69.5 50L76 45L69 44Z"/>`,
    `<rect x="47" y="30" width="26" height="6" rx="1"/>`,
    // crown of claws hooking inward around the crystal
    taper([49, 33, 38, 26, 38, 13, 49, 8], 7, 0.6), taper([71, 33, 82, 26, 82, 13, 71, 8], 7, 0.6),
    taper([54, 31, 49, 26, 49, 20, 53, 16], 4.5, 0.6), taper([66, 31, 71, 26, 71, 20, 67, 16], 4.5, 0.6),
    `<path d="M60 9L65.5 19L60 29.5L54.5 19Z" ${sep(1.2)}/><path d="M55 19H65M60 11V28" ${ks(2)}/>`,
    `<path d="M58 49V43a2 2 0 0 1 4 0V49Z" ${K}/><path d="M57.5 64V57a2.5 2.5 0 0 1 5 0V64Z" ${K}/><path d="M55 82V77a5 5 0 0 1 10 0V82Z" ${K}/>`,
    `<path d="M50.5 39H69.5M48.5 53H71.5M46.5 69H73.5" ${ks(2)}/>`,
    ground(14, 106, 81)
  ),

  // ------------------------------------------------------ relics & shards
  lantern: g(
    `<g transform="translate(0 1.5)">`,
    rayLines(60, 47, [-30, 0, 30, 60, 90, 120, 150, 180, 210], 24, 33, `${ls(3)} ${DIM}`),
    `<circle cx="60" cy="9.5" r="3.5" ${ls(2.5)}/><path d="M60 13V18" ${ls(2.5)}/>`,
    `<path d="M46 28L60 17L74 28Z"/><rect x="44" y="27" width="32" height="4" rx="2"/>`,
    `<rect x="47" y="31" width="26" height="30" rx="1"/><rect x="51.5" y="35" width="17" height="22" rx="1" ${K}/>`,
    `<path d="M60 38Q66.5 45 65.5 50.5Q65 55 60 55Q55 55 54.5 50.5Q53.5 45 60 38Z"/>`,
    `<rect x="44" y="61" width="32" height="4" rx="2"/><path d="M50 65H70L66 69H54Z"/>`,
    '</g>'
  ),

  steed: g(
    `<g transform="translate(-3 1)">`,
    // horse's head and neck in profile, facing left: mane locks, bridle and reins
    `<path d="M68 12L77 10L77 17L86 16L86 24L95 25L93 32L103 35L99 42L109 47L103 52L110 59L104 63L106 72L102 74Q103 52 94 38Q84 22 70 15Z"/>`,
    `<path d="M21 42Q16 49 19 55Q22 60 30 60L42 57Q54 59 59 50Q60 64 64 82H104Q104 54 94 38Q84 22 70 15L67 6.5L59 13Q50 14 42 21Z" ${sep(1.2)}/>`,
    `<path d="M43 29.5Q48 25 54 28Q48 33 43 29.5Z" ${K}/><path d="M22 47q3 0 4 4M21 56h8" ${ks(2.5)}/>`,
    `<path d="M64 17L35 48M31 36L35 59M60 21Q66 34 60 48" ${ks(3)}/><circle cx="35.5" cy="53" r="3.4" ${ks(2.5)}/>`,
    `<path d="M39 54Q66 60 92 76" ${ks(3)}/>`,
    '</g>'
  ),

  blade: g(
    spark(100, 14, 5, DIM), spark(18, 30, 3.5, DIM),
    `<g transform="rotate(-32 60 45)">` +
      `<path d="M34 38H100L114 45L100 52H34Z"/>` +
      `<path d="M44 41.5V48.5M44 41.5L48 43.5L44 45.5L48 48.5M58 41L61 45L58 49L55 45ZM68 41.5V48.5M68 45L72 41.5M68 45L72 48.5M80 41.5L84 48.5M84 41.5L80 48.5M94 48.5V41.5M91 44.5L94 41.5L97 44.5" ${ks(2.2)}/>` +
      `<rect x="28" y="31" width="6" height="28" rx="3"/><rect x="13" y="41.5" width="15" height="7" rx="1"/>` +
      `<path d="M18 41.5v7M23 41.5v7" ${ks(2)}/><circle cx="10" cy="45" r="5.5"/><circle cx="10" cy="45" r="1.8" ${K}/></g>`
  ),

  banner: g(
    `<path d="M28 15V81" ${ls(4)}/><path d="M28 6L31.5 12L28 15L24.5 12Z"/>`,
    `<path d="M30 16Q52 10 72 16Q88 20 104 16L90 34L104 52Q86 54 70 50Q50 46 30 52Z"/>`,
    `<path d="M70 18Q68 33 70 48" ${ks(2.5)}/>`,
    `<path d="M42 42V30h3.5v-3.5h3v3.5h3v-3.5h3v3.5h3.5V42Z" ${K}/>`,
    ground(14, 44, 81)
  ),

  map: g(
    `<path d="M22 18Q40 14 60 18Q80 22 98 18V72Q80 76 60 72Q40 68 22 72Z"/>`,
    `<rect x="12" y="14" width="12" height="62" rx="6" ${sep(1.2)}/><rect x="96" y="14" width="12" height="62" rx="6" ${sep(1.2)}/>`,
    `<circle cx="18" cy="20" r="2.5" ${ks(2)}/><circle cx="102" cy="20" r="2.5" ${ks(2)}/>`,
    `<path d="M32 62Q42 50 52 58Q62 66 70 50Q74 42 80 37" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="0.1 6.5"/>`,
    `<path d="M82 26L91 35M91 26L82 35" ${ks(3.5)}/><circle cx="32" cy="62" r="3" ${K}/>`,
    `<path d="M30 42L36 33L42 42M40 42L47 31L54 42" ${ks(2.5)}/>`
  ),

  charm: g(
    `<path d="M24 8Q34 30 55 34M96 8Q86 30 65 34" ${ls(2.5)}/>`,
    `<circle cx="37" cy="25" r="3"/><circle cx="83" cy="25" r="3"/>`,
    `<circle cx="60" cy="35" r="4.5" ${ls(3)}/>`,
    `<circle cx="60" cy="58" r="21"/><circle cx="60" cy="58" r="16" ${K}/>`,
    `<path d="M60 45Q68 52 66.5 58Q65.5 62 60 62Q54.5 62 53.5 58Q52 52 56 48Q57 53 59 53Q57 49 60 45Z"/>`,
    `<path d="M49 63H71Q69 69 60 69Q51 69 49 63Z"/><rect x="58" y="68" width="4" height="4"/>`
  ),

  sun: (() => {
    const o = [], n = [];
    for (let i = 0; i < 8; i++) { o.push(pol(60, 45, 20, -67.5 + i * 45)); n.push(pol(60, 45, 10, -67.5 + i * 45)); }
    return g(
      rays(60, 45, [0, 60, 120, 180, 240, 300], 25, 40, 5),
      rays(60, 45, [30, 90, 150, 210, 270, 330], 25, 33, 4),
      `<polygon points="${o.map((p) => p.join(',')).join(' ')}"/>`,
      `<polygon points="${n.map((p) => p.join(',')).join(' ')}" ${ks(2.5)}/>`,
      `<path d="${o.map((p, i) => `M${n[i].join(' ')}L${p.join(' ')}`).join('')}" ${ks(2.5)}/>`
    );
  })(),

  moon: g(
    `<g transform="translate(-4 0)">`,
    `<path d="M70 16A31 31 0 1 0 70 74A30 30 0 0 1 70 16Z"/>`,
    `<path d="M67 21A24.4 24.4 0 1 0 67 69" ${ks(2.5)}/>`,
    rayLines(59, 45, [145, 215], 15, 28.5, ks(2.5)),
    spark(92, 26, 7), spark(100, 50, 5), spark(86, 66, 4),
    '</g>'
  ),

  star: g(
    `<polygon points="${starPts(60, 47, 36, 15, 5)}"/>`,
    rayLines(60, 47, [-90, -18, 54, 126, 198], 0, 30, ks(2.5)),
    spark(22, 18, 5, DIM), spark(100, 22, 4, DIM), spark(98, 72, 3.5, DIM)
  ),

  // ---------------------------------------------------------------- events
  storm: g(
    `<circle cx="38" cy="34" r="12"/><circle cx="58" cy="26" r="16"/><circle cx="80" cy="30" r="13"/><circle cx="93" cy="40" r="9"/><circle cx="28" cy="42" r="9"/><rect x="28" y="36" width="66" height="14" rx="7"/>`,
    `<path d="M44 42Q50 34 60 36M72 38Q78 32 86 36" ${ks(2.5)}/>`,
    `<path d="M62 44L50 64H59L50 84L74 58H64L72 44Z" ${sep(1.5)}/>`,
    `<path d="M32 58l-4 10M42 60l-4 10M36 72l-3 7M84 58l-4 10M94 60l-4 10M88 72l-3 7" ${ls(3)} ${DIM}/>`
  ),

  fog: g(
    `<path d="M10 30Q26 22 42 28T74 28Q90 28 100 22Q106 16 100 13Q95 12 95 17" ${ls(5)} ${DIM}/>`,
    `<circle cx="60" cy="23" r="7"/><path d="M48 80L50 44Q50 33 60 33Q70 33 70 44L72 80Z"/>`,
    `<path d="M51 43L38 52L33 49M69 43L82 50L87 47" ${ls(5)}/>`,
    ...[
      'M10 60Q26 52 42 58T74 58Q92 58 98 50Q100 44 94 44Q90 46 92 50',
      'M22 76Q38 68 54 74T86 74T112 72',
    ].map((d) => `<path d="${d}" ${ks(10)}/><path d="${d}" ${ls(5)} ${DIM}/>`),
    taper([14, 44, 20, 40, 26, 42, 30, 38], 3, 0.6, DIM), taper([96, 36, 102, 34, 106, 38, 110, 34], 3, 0.6, DIM)
  ),

  fever: g(
    `<rect x="10" y="40" width="6" height="40" rx="2"/><circle cx="13" cy="37" r="3.5"/>`,
    `<rect x="10" y="64" width="100" height="6" rx="2"/><rect x="102" y="70" width="5" height="10"/><rect x="18" y="70" width="5" height="10"/>`,
    `<ellipse cx="28" cy="58" rx="11" ry="6"/>`,
    `<circle cx="33" cy="51" r="8" ${sep(1.5)}/><path d="M30 50q2 2 4 0" ${ks(2)}/>`,
    `<path d="M40 64Q40 50 52 48Q72 44 90 50Q96 46 102 50Q106 54 106 64Z" ${sep(1.5)}/>`,
    `<path d="M58 51Q62 58 60 64M78 49Q82 57 80 64M42 57Q47 52 54 52" ${ks(2.5)}/>`,
    `<path d="M24 36q-3-4 0-8t0-8t0-8M34 34q-3-4 0-8t0-8t0-8M44 36q-3-4 0-8t0-8t0-8" ${ls(3)}/>`,
    ground(6, 114, 81)
  ),

  cache: g(
    spark(18, 20, 5, DIM), spark(102, 16, 4, DIM),
    `<path d="M28 46L30 22Q60 12 90 22L92 46Z"/><path d="M34 44L35 27Q60 19 85 27L86 44Z" ${K}/>`,
    ...[[40, 45], [50, 41], [60, 39], [70, 41], [80, 45], [45, 47], [56, 46], [66, 46], [75, 47]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5" ${sep(1.1)}/>`),
    `<rect x="24" y="48" width="72" height="32" rx="2" ${sep(1.5)}/>`,
    `<path d="M24 55H96M37 55V80M83 55V80" ${ks(3)}/>`,
    `<rect x="53.5" y="51" width="13" height="14" rx="2" ${sep(1.5)}/><path d="M60 55.5V60.5" ${ks(2.5)}/>`,
    `<ellipse cx="104" cy="79" rx="6" ry="2.5"/><ellipse cx="14" cy="79" rx="5" ry="2.2"/>`,
    ground(8, 112, 81)
  ),

  forage: g(
    `<path d="M28 52Q28 12 60 12Q92 12 92 52" ${ls(4.5)}/>`,
    `<rect x="38" y="34" width="9" height="16" rx="2" ${sep(1.2)}/><path d="M28 36Q30 20 42.5 20Q55 20 57 36Z" ${sep(1.2)}/>`,
    `<circle cx="38" cy="28" r="2.5" ${K}/><circle cx="48" cy="26" r="2" ${K}/>`,
    `<rect x="60" y="38" width="7" height="12" rx="2" ${sep(1.2)}/><path d="M54 41Q55 30 63.5 30Q72 30 73 41Z" ${sep(1.2)}/>`,
    `<path d="M86 36Q92 24 102 26Q96 36 86 36Z" ${sep(1)}/><path d="M89 34L99 28" ${ks(2)}/>`,
    ...[[80, 40], [87, 39], [84, 46], [91, 45], [77, 47]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" ${sep(1)}/>`),
    `<path d="M22 50H98L90 80H30Z"/><rect x="18" y="47" width="84" height="7" rx="3.5" ${sep(1.2)}/>`,
    `<path d="M25 63H95M28 72H92M40 54V63M60 54V63M80 54V63M50 63V72M70 63V72M40 72V80M60 72V80M80 72V80" ${ks(2.5)}/>`,
    ground(14, 106, 81)
  ),

  omen: g(
    `<circle cx="94" cy="20" r="12" ${DIM}/>`,
    `<path d="M9 71.5Q40 66 70 70Q92 72 111 66.5" ${ls(5)}/><path d="M28 69Q22 60 14 58M94 71Q100 78 108 80" ${ls(3)}/>`,
    `<path d="M62 62L60 70M70 62L71 70" ${ls(3)}/>`,
    // raven: heavy beak, flat crown, shaggy throat, long wedge tail
    `<path d="M10 41Q20 32 34 30Q40 23 50 24Q58 25 62 31Q74 37 86 47L113 59L110 65L88 60Q80 64 70 64Q56 64 50 57L47 55L48 51L43 51L45 47L39 46L41 43L34 42Z" ${sep(1.5)}/>`,
    `<path d="M14 40L33 37.5" ${ks(2)}/><circle cx="42" cy="31.5" r="3" ${K}/>`,
    `<path d="M57 38Q72 42 84 51L102 59M80 49l-5 6M90 53l-5 6" ${ks(2.5)}/>`
  ),

  gloom: g(
    taper([44, 30, 36, 18, 24, 14, 20, 24], 6, 1),
    taper([39, 46, 28, 52, 16, 46, 16, 36], 6, 1),
    taper([44, 60, 38, 74, 26, 76, 22, 68], 6, 1),
    taper([60, 66, 62, 74, 58, 80, 52, 82], 5, 1),
    taper([76, 60, 84, 72, 96, 74, 98, 66], 6, 1),
    taper([81, 44, 92, 38, 104, 42, 102, 52], 6, 1),
    taper([76, 30, 84, 18, 96, 14, 100, 22], 6, 1),
    taper([60, 22, 58, 14, 64, 10, 66, 6], 5, 1),
    `<circle cx="60" cy="44" r="23"/><circle cx="60" cy="44" r="17.5" ${K}/>`
  ),

  quiet: g(
    `<path d="M34 9A14 14 0 1 0 34 37A15 15 0 0 1 34 9Z"/>`,
    spark(56, 14, 3, DIM), spark(90, 18, 3.5, DIM), spark(104, 34, 2.5, DIM), spark(74, 30, 2, DIM),
    `<path d="M6 54Q20 46 34 50Q48 44 62 50Q80 42 96 48Q106 46 114 50V56H6Z" ${DIM}/>`,
    `<path d="M30 84Q52 78 60 72Q66 66 54 62Q46 58 60 54L64 54Q56 58 62 61Q76 66 72 72Q66 80 90 84Z"/>`,
    `<path d="M60 83Q63 77 66 72Q69 67 62 63.5" ${ks(2.5)} stroke-dasharray="4 5"/>`,
    `<rect x="24" y="71" width="3" height="9" rx="1"/><rect x="90" y="69" width="3" height="9" rx="1"/>`
  ),

  camp: g(
    `<path d="M12 80L42 28L72 80Z"/><path d="M42 28L35 19M42 28L49 19" ${ls(3)}/>`,
    `<path d="M42 46L32 80H52Z" ${K}/>`,
    `<g ${sep(1)}><rect x="76" y="72" width="32" height="7" rx="3.5" transform="rotate(-15 92 75.5)"/><rect x="76" y="72" width="32" height="7" rx="3.5" transform="rotate(15 92 75.5)"/></g>`,
    `<path d="M92 36Q104 50 102 62Q100 72 92 72Q84 72 82 62Q81 54 86 48Q86 56 90 56Q88 46 92 36Z"/>`,
    `<path d="M92 56Q96 61 95 65Q94 68 92 68Q90 68 89 65Q88 61 92 56Z" ${K}/>`,
    `<circle cx="100" cy="30" r="1.6" ${DIM}/><circle cx="84" cy="34" r="1.5" ${DIM}/><circle cx="96" cy="22" r="1.3" ${DIM}/>`,
    ground(6, 114, 81)
  ),

  hunger: g(
    `<path d="M24 46Q26 76 60 78Q94 76 96 46Z"/><path d="M46 77H74L76 82H44Z"/>`,
    `<ellipse cx="60" cy="46" rx="36" ry="9"/><ellipse cx="60" cy="46.5" rx="31" ry="6" ${K}/>`,
    `<ellipse cx="54" cy="47" rx="7" ry="3.2"/>`,
    lsep('M60 46L100 18', 4, 1.2),
    `<path d="M30 60Q60 70 90 60" ${ks(2.5)}/>`
  ),

  battle: g(
    `<g transform="translate(33 67) rotate(46.8)">${sword(80, sep(1.2))}</g>`,
    `<g transform="translate(87 67) rotate(-46.8)">${sword(80, sep(1.2))}</g>`,
    `<path d="M40 24H80V44Q80 64 60 76Q40 64 40 44Z" ${sep(2)}/>`,
    `<path d="M45.5 29.5H74.5V44Q74.5 60 60 69.5Q45.5 60 45.5 44Z" ${ks(2.5)}/>`,
    `<path d="M60 34V62M50 44H70" ${ks(3.5)}/>`
  ),

  retreat: g(
    `<path d="M50 50L88 10" ${ls(3)}/>`,
    `<path d="M87 11Q98 6 110 13L103 16L108 20L100 21L104 26L96 25L98 30Q88 26 77 23Z"/><path d="M101 15L94 19.5" ${ks(2)}/>`,
    `<circle cx="34" cy="24" r="6.5"/>`,
    `<path d="M39 33L49 52" ${ls(10)}/>`,
    `<path d="M48 52L36 60L30 76L23 77M49 53L60 63L72 59L75 64" ${ls(6)}/>`,
    `<path d="M38 35L28 43L21 39M43 36L53 44L56 41" ${ls(5)}/>`,
    `<path d="M80 72h16M84 64h12M86 56h10" ${ls(3)} ${DIM}/>`,
    ground(10, 104, 81)
  ),

  victory: (() => {
    const leaves = [];
    for (let i = 0; i < 6; i++) {
      const a = 112 + i * 15;
      const [x, y] = pol(60, 50, 29, a), [ox, oy] = pol(60, 50, 33, a - 3), [ix, iy] = pol(60, 50, 25, a + 4);
      leaves.push(`<ellipse cx="${ox}" cy="${oy}" rx="6" ry="2.7" transform="rotate(${a + 60} ${ox} ${oy})"/>`);
      if (i < 5) leaves.push(`<ellipse cx="${ix}" cy="${iy}" rx="5" ry="2.4" transform="rotate(${a + 120} ${ix} ${iy})"/>`);
      void x; void y;
    }
    const half = `<path d="M58 79A29 29 0 0 1 32.5 37" ${ls(2.5)}/>${leaves.join('')}`;
    return g(
      rays(60, 42, [195, 215, 235, 255, 270, 285, 305, 325, 345], 27, 36, 2.6, DIM),
      half, `<g transform="matrix(-1 0 0 1 120 0)">${half}</g>`,
      `<path d="M41 49L38 26L50 37L60 20L70 37L82 26L79 49Z"/><circle cx="38" cy="24" r="3.2"/><circle cx="60" cy="17.5" r="3.6"/><circle cx="82" cy="24" r="3.2"/>`,
      `<rect x="40" y="48" width="40" height="10" rx="1.5" ${sep(1.2)}/>`,
      `<circle cx="50" cy="53" r="2.2" ${K}/><path d="M60 50L62.5 53L60 56L57.5 53Z" ${K}/><circle cx="70" cy="53" r="2.2" ${K}/>`,
      `<path d="M60 79L52 83L53 77ZM60 79L68 83L67 77Z"/><circle cx="60" cy="79" r="2.6"/>`
    );
  })(),

  defeat: g(
    `<path d="M6 83Q60 66 114 83Z" ${DIM}/>`,
    // broken sword stuck in the ground: the hilt half knocked askew above the snapped stump
    `<g transform="rotate(8 66 78)">` +
      `<path d="M61.5 60.5L64.5 58L67.5 61L70.5 58V79H61.5Z"/>` +
      `<g transform="rotate(-9 66 56) translate(-1 -1.5)"><path d="M61.5 38H70.5V53.5L67.5 56.5L64.5 53.5L61.5 56.5Z"/><path d="M66 42V51" ${ks(2.2)}/>` +
      `<rect x="52" y="33" width="28" height="6" rx="3"/><rect x="63.5" y="19" width="5" height="14"/><circle cx="66" cy="16" r="4.6"/></g></g>`,
    `<path d="M80 54L85 50.5L84.5 56.5ZM86 61L90 59L88.5 63Z"/>`,
    `<g transform="rotate(-8 32 68)"><circle cx="32" cy="62" r="13"/><rect x="24" y="66" width="16" height="12" rx="3"/><circle cx="27" cy="62" r="4" ${K}/><circle cx="37" cy="62" r="4" ${K}/><path d="M32 67.5l-2 3.5h4z" ${K}/><path d="M28 73v4M32 73v4M36 73v4" ${ks(2.2)}/></g>`
  ),

  rout: g(
    // spears stuck askew, one snapped, and the company banner toppling limp
    `<path d="M88 81L106 36" ${ls(3)}/><path d="M108.8 29L109.2 40L103.6 37.8Z"/>`,
    `<path d="M30 81L12 44" ${ls(3)}/><path d="M9 37.5L15.6 42.5L10.2 45.2Z"/>`,
    `<path d="M74 81L70 64" ${ls(3)}/><path d="M68 62.5l2.5-1.5 1 3.5" ${ls(2.5)}/>`,
    `<path d="M20 81L94 31" ${ls(4)}/><path d="M96.5 29.5L100 25L99 31.5Z"/>`,
    `<path d="M50 61L92.5 32L95 63L76 58.5L56 79Z" ${sep(1.2)}/>`,
    `<path d="M73 49V56M85 41V54" ${ks(2.5)}/>`,
    `<path d="M61 59.5L65.5 65.5L61 71.5L56.5 65.5Z" ${K}/>`,
    `<path d="M100 14Q110 20 111 32M93 20Q99 23 101 29" ${ls(2.5)} ${DIM}/>`,
    `<path d="M40 79L58 76" ${ls(3)}/>`,
    ground(6, 114, 81)
  ),

  tithe: g(
    `<path d="M20 22L30 8L40 22ZM80 22L90 8L100 22Z"/>`,
    `<rect x="22" y="22" width="16" height="44"/><rect x="82" y="22" width="16" height="44"/>`,
    `<rect x="38" y="34" width="44" height="32" ${sep(1.2)}/>`, crenels(38, 29, 44, 5, 5),
    `<rect x="28" y="32" width="4" height="9" rx="2" ${K}/><rect x="88" y="32" width="4" height="9" rx="2" ${K}/>`,
    `<path d="M48 48Q38 52 37 64Q36 80 60 80Q84 80 83 64Q82 52 72 48L70 44Q74 40 72 36L66 40L60 34L54 40L48 36Q46 40 50 44Z" ${sep(1.5)}/>`,
    `<path d="M49 46Q60 50 71 46" ${ks(3)}/><circle cx="60" cy="64" r="7" ${ks(3)}/><path d="M60 60.5V67.5" ${ks(2.5)}/>`,
    `<ellipse cx="94" cy="79" rx="7" ry="2.8" ${sep(1)}/><ellipse cx="100" cy="76" rx="7" ry="2.8" ${sep(1)}/>`,
    ground(10, 110, 81)
  ),

  pray: g(
    `<g transform="translate(-3 1.5)">`,
    rayLines(60, 28, [-150, -120, -90, -60, -30, 0, 180], 19, 22, `${ls(2.5)} ${DIM}`),
    `<circle cx="60" cy="28" r="14" ${ls(3)}/>`,
    `<path d="M60 15Q68 24 67 31Q66 37 60 37Q54 37 53 31Q52 24 60 15Z"/><path d="M60 25Q63 29 62.5 32Q62 34 60 34Q58 34 57.5 32Q57 29 60 25Z" ${K}/>`,
    `<path d="M60 37V42" ${ls(2)}/>`,
    `<rect x="51" y="42" width="18" height="32"/><path d="M51.5 47Q54 51 56.5 47.5Q59 44 61 49Q63 53 65 48Q66.5 45 68.5 47" ${ks(2.5)}/>`,
    `<path d="M36 73H84Q82 81 60 81Q38 81 36 73Z"/><circle cx="88" cy="75" r="5" ${ls(3)}/>`,
    '</g>'
  ),

  oracle: g(
    rays(60, 45, Array.from({ length: 16 }, (_, i) => i * 22.5), 31.5, 38.5, 2.6),
    `<circle cx="60" cy="45" r="27" ${ls(3.5)}/>`,
    `<path d="M37 45Q60 22 83 45Q60 68 37 45Z"/>`,
    `<circle cx="60" cy="45" r="10" ${K}/><circle cx="63.5" cy="41.5" r="2.6"/>`
  ),

  ward: g(
    `<g transform="translate(0 2)">`,
    rayLines(60, 46, [-160, -135, -110, -70, -45, -20, 160, 20], 36, 43, `${ls(2.5)} ${DIM}`),
    `<path d="M32 14H88V40Q88 66 60 80Q32 66 32 40Z"/>`,
    `<path d="M38 20H82V40Q82 62 60 73Q38 62 38 40Z" ${K}/>`,
    `<circle cx="60" cy="44" r="14" ${DIM}/>`,
    `<path d="M60 27V63M51 36L60 45L69 36M51 54L60 45L69 54" ${ls(4)}/>`,
    '</g>'
  ),

  kindle: g(
    `<ellipse cx="60" cy="83" rx="40" ry="1.8" ${DIM}/>`,
    `<g transform="translate(0 4)">`,
    `<path d="M18 46L14 16L36 34L60 10L84 34L106 16L102 46Z"/>`,
    `<circle cx="14" cy="13" r="4"/><circle cx="60" cy="7" r="4"/><circle cx="106" cy="13" r="4"/>`,
    `<rect x="16" y="44" width="88" height="32" rx="2" ${sep(1.2)}/>`,
    `<path d="M16 49H104M16 71H104" ${ks(2.5)}/>`,
    `<circle cx="32" cy="60" r="5.5" ${K}/>`, rayLines(32, 60, [0, 45, 90, 135, 180, 225, 270, 315], 8, 10.5, ks(2.5)),
    `<path d="M64 50.5A10 10 0 1 0 64 69.5A8 8 0 0 1 64 50.5Z" ${K}/>`,
    `<polygon points="${starPts(88, 60.5, 10.5, 4.3, 5)}" ${K}/>`,
    '</g>'
  ),

  sealed: g(
    `<path d="M26 82V40A34 34 0 0 1 94 40V82Z"/>`,
    `<path d="M33 82V42A27 27 0 0 1 87 42V82Z" ${K}/>`,
    `<path d="M36 82V43A24 24 0 0 1 84 43V82Z"/>`,
    `<path d="M48 26V82M60 22V82M72 26V82" ${ks(2.5)}/><path d="M36 40H84M36 70H84" ${ks(3.5)}/>`,
    rayLines(60, 40, [-170, -145, -120, -90, -60, -35, -10], 27, 34, ks(2)),
    lsep('M53.5 54V48a6.5 6.5 0 0 1 13 0V54', 4, 1.2),
    `<rect x="49" y="53" width="22" height="18" rx="3" ${sep(1.5)}/>`,
    `<circle cx="60" cy="60" r="2.6" ${K}/><path d="M60 61V66" ${ks(2.5)}/>`
  ),

  wound: g(
    `<g transform="translate(3 -1)">`,
    // a shield split down the middle, an arrow still lodged in it
    `<path d="M29 14H57L62 25L55 35L63 46L56 58L61 69L59 81Q29 67 29 40Z"/><path d="M29 41H60" ${ks(4)}/>`,
    `<g transform="rotate(6 60 81) translate(5 1)"><path d="M57 14H89V40Q89 67 59 81L61 69L56 58L63 46L55 35L62 25Z"/><path d="M58 41H89" ${ks(4)}/></g>`,
    lsep('M44 56L16 28', 3.5, 1.5),
    `<path d="M17.4 29.4L23.8 35.8L26.6 30.2L19.5 23.1ZM17.4 29.4L23.8 35.8L18.2 38.6L11.1 31.5Z"/><path d="M19 31L23 35" ${ks(1.6)}/>`,
    `<path d="M100 66L104 62L105 68ZM95 76L100 74L98 79Z" ${DIM}/>`,
    '</g>'
  ),

  recruit: (() => {
    const hand =
      `<rect x="58" y="20" width="6.5" height="28" rx="3.25"/><rect x="66" y="14" width="6.5" height="32" rx="3.25"/><rect x="74" y="16" width="6.5" height="30" rx="3.25"/><rect x="82" y="23" width="6.5" height="24" rx="3.25"/>` +
      `<path d="M58 44Q58 40 62 40H84Q88.5 40 88.5 44V60Q88.5 68 80 70H66Q58 68 58 60Z"/><path d="M60 58L47 44Q45 40 49 38.5Q52 38 54 41L64 51Z"/>`;
    return g(
      // spear raised behind an open hand: "join us"
      `<path d="M31.1 80L48.5 19" ${ls(4)}/><path d="M51 9L53 17.8L48.4 20.5L45.4 15.6Z"/>`,
      `<path d="M47.6 22L32 21L37.5 26.5L30.5 31.5L45 31Z"/>`,
      `<g ${sep(1.5)}>${hand}</g>`, hand,
      `<path d="M61 56Q66 62 64 66" ${ks(2.5)}/>`,
      `<rect x="59" y="69" width="29" height="15" rx="2" ${sep(1.5)}/><path d="M59 74H88" ${ks(2.5)}/>`
    );
  })(),

  ledger: g(
    `<rect x="16" y="73" width="92" height="4" rx="2" ${DIM}/>`,
    `<rect x="12" y="24" width="96" height="46" rx="5"/><path d="M18 34H102" ${ks(2.5)}/>`,
    ...[0, 1].map((r) => Array.from({ length: 10 }, (_, i) => `<circle cx="${r1(21 + i * 8.67)}" cy="${46 + r * 14}" r="2.9" ${K}/>`).join('')),
    `<path d="M35.8 46V30a2.5 2.5 0 0 1 5 0V46Z" ${sep(1.2)}/><circle cx="38.3" cy="26" r="4" ${sep(1.2)}/>`,
    `<path d="M70.9 60V44a2.5 2.5 0 0 1 5 0V60Z" ${sep(1.2)}/><circle cx="73.4" cy="40" r="4" ${sep(1.2)}/>`
  ),

  hourglass: g(
    `<rect x="30" y="8" width="60" height="7" rx="2"/><rect x="30" y="75" width="60" height="7" rx="2"/>`,
    `<rect x="33" y="15" width="5" height="60"/><rect x="82" y="15" width="5" height="60"/>`,
    `<path d="M44 15Q44 34 58 44Q44 54 44 75H76Q76 54 62 44Q76 34 76 15Z" ${ls(3)}/>`,
    `<path d="M50 32H70Q66 40 60 44Q54 40 50 32Z"/><path d="M60 44V66" ${ls(2)}/>`,
    `<path d="M46 75Q50 64 60 62Q70 64 74 75Z"/>`
  ),

  question: g(
    spark(26, 58, 5, DIM), spark(94, 58, 5, DIM),
    `<path d="M41 30Q41 12 60 12Q79 12 79 28Q79 40 65 46Q60 48.5 60 58" ${ls(11)}/>`,
    `<circle cx="41" cy="30" r="8"/>`,
    `<path d="M41 30Q41 12 60 12Q79 12 79 28Q79 40 65 46Q60 48.5 60 58" ${ks(3)} pathLength="100" stroke-dasharray="0 12 82 100"/>`,
    `<circle cx="41" cy="30" r="2.6" ${K}/>`,
    `<path d="M60 64L68 72L60 80L52 72Z"/><path d="M60 69L63 72L60 75L57 72Z" ${K}/>`
  ),
};

export const GLYPH_NAMES = Object.keys(GLYPHS);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Full <svg> string for a glyph, tinted by CSS `color`. Unknown names fall
// back to 'question'. `title` sets the accessible name (and a tooltip).
export function glyph(name, { title } = {}) {
  const key = Object.prototype.hasOwnProperty.call(GLYPHS, name) ? name : 'question';
  const label = esc(title || key);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90" width="100%" height="100%" ` +
    `preserveAspectRatio="xMidYMid meet" fill="currentColor" stroke="none" role="img" aria-label="${label}">` +
    (title ? `<title>${label}</title>` : '') +
    `${GLYPHS[key]}</svg>`
  );
}
