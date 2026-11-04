// Static game data for Obsidian Spire: the map of the Gloaming Reach,
// relics, foes and the campaign chapters. Pure data, no DOM, no three.js,
// so the engine can run headless for balance simulation.

export const BOARD_RADIUS = 10;      // world units, board top surface is y = 0
export const SPIRE_BASE_RADIUS = 1.9;

// Six provinces, one per 60 degree wedge. Wedge 0 faces the camera (+z).
export const PROVINCES = [
  { id: 0, name: 'Hearthmoor', terrain: 'heath',    color: '#7d6b3c', accent: '#8e5a7a' },
  { id: 1, name: 'Saltmere',   terrain: 'marsh',    color: '#3e6a63', accent: '#a9c7b8' },
  { id: 2, name: 'Emberwold',  terrain: 'volcanic', color: '#7a3a25', accent: '#e0703a' },
  { id: 3, name: 'Frostvale',  terrain: 'snow',     color: '#8ea2b2', accent: '#e8f0f6' },
  { id: 4, name: 'Thornwood',  terrain: 'forest',   color: '#2e4a2b', accent: '#5f8a4a' },
  { id: 5, name: 'Sunscar',    terrain: 'desert',   color: '#b08a46', accent: '#e8c77a' },
];

// Slot template inside a wedge: angle offset (degrees) from the wedge centre and radius.
const SLOTS = {
  A: { a: -17, r: 8.3 },
  B: { a: 17, r: 8.3 },
  C: { a: 0, r: 6.3 },
  D: { a: 30, r: 5.5 },
  E: { a: 0, r: 3.9 },
};

// Types and names per wedge. Wedges i and i+3 share a layout so the
// two Wardens start on equal footing.
const LAYOUT = [
  { A: ['keep', 'Hearthmoor Keep'], B: ['market', 'Brackenford'], C: ['wilds', 'Gallowmere Heath'], D: ['wilds', 'The Hollow Road'], E: ['barrow', 'Cairn of the Red King'] },
  { A: ['wilds', 'Gull Strand'], B: ['shrine', 'Shrine of the Drowned Bell'], C: ['barrow', 'Saltgrave Barrow'], D: ['wilds', 'Reedwater Fen'], E: ['wilds', 'Mistcauldron'] },
  { A: ['market', 'Cinderwick'], B: ['wilds', 'Slagfield'], C: ['barrow', 'Barrow of Embers'], D: ['shrine', 'Shrine of the Ashen Lamp'], E: ['wilds', 'The Scorch'] },
  { A: ['keep', 'Frostvale Keep'], B: ['market', 'Rimeholt'], C: ['wilds', 'Wolfrun Pass'], D: ['wilds', 'The White Silence'], E: ['barrow', 'Cairn of the Frost Queen'] },
  { A: ['wilds', 'Briarwatch'], B: ['shrine', 'Shrine of the Green Hart'], C: ['barrow', 'Rootdeep Barrow'], D: ['wilds', 'Witchlight Glade'], E: ['wilds', 'The Black Thicket'] },
  { A: ['market', 'Ochrewell'], B: ['wilds', 'Glasswind Flats'], C: ['barrow', 'Barrow of the Sandsworn'], D: ['shrine', 'Shrine of the Dawnstone'], E: ['wilds', 'The Bleached Steps'] },
];

function polar(deg, r) {
  const t = (deg * Math.PI) / 180;
  return { x: +(r * Math.sin(t)).toFixed(3), z: +(r * Math.cos(t)).toFixed(3) };
}

export const NODES = [];
for (let w = 0; w < 6; w++) {
  for (const slot of ['A', 'B', 'C', 'D', 'E']) {
    const s = SLOTS[slot];
    const [type, name] = LAYOUT[w][slot];
    const angle = w * 60 + s.a;
    const p = polar(angle, s.r);
    NODES.push({
      id: `${slot}${w}`, wedge: w, slot, type, name, angle, r: s.r, x: p.x, z: p.z,
      ring: slot === 'E' ? 'inner' : slot === 'A' || slot === 'B' ? 'outer' : 'middle',
    });
  }
}
NODES.push({ id: 'S', wedge: -1, slot: 'S', type: 'spire', name: 'The Obsidian Spire', angle: 0, r: 0, x: 0, z: 0, ring: 'centre' });

export const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

// The roads between landmarks. Each one is then split by a space of its own
// halfway along, so every journey takes twice as many days. Where a road
// leaves one province for the next, that halfway space is a border crossing.
const edgeSet = new Set();
const ROADS = [];
function link(a, b) {
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (edgeSet.has(k)) return;
  edgeSet.add(k);
  ROADS.push([a, b]);
}
for (let w = 0; w < 6; w++) {
  const n = (w + 1) % 6;
  link(`A${w}`, `B${w}`);
  link(`B${w}`, `A${n}`);
  link(`A${w}`, `C${w}`);
  link(`B${w}`, `C${w}`);
  link(`C${w}`, `D${w}`);
  link(`D${w}`, `C${n}`);
  link(`C${w}`, `E${w}`);
  link(`E${w}`, `E${n}`);
  link(`E${w}`, 'S');
}

// Names for the halfway spaces, keyed by the two landmarks they join.
const ROAD_NAMES = {
  A0B0: 'Kingsmile', A0C0: 'Gibbet Lane', B0C0: 'Bracken Way', C0D0: 'Peat Cutting', C0E0: 'Redcairn Track', E0S: 'The Red Causeway',
  A1B1: 'Bell Sands', A1C1: 'Saltpan Walk', B1C1: "Wreckers' Path", C1D1: 'Eel Dyke', C1E1: 'Mist Steps', E1S: 'The Drowned Causeway',
  A2B2: "Smelters' Road", A2C2: 'Clinker Row', B2C2: 'Pumice Drift', C2D2: 'Lamplit Way', C2E2: 'Brimstone Cut', E2S: 'The Cinder Causeway',
  A3B3: 'Sledge Road', A3C3: 'Frostkeep Way', B3C3: 'Rime Ridge', C3D3: 'Howling Col', C3E3: "Queen's Stair", E3S: 'The White Causeway',
  A4B4: 'Hartsway', A4C4: 'Bramble Ride', B4C4: 'Mossback Trail', C4D4: 'Hollow Oak', C4E4: 'Rootgate Path', E4S: 'The Thorn Causeway',
  A5B5: 'Caravan Road', A5C5: 'Ochre Wash', B5C5: 'Mirage Track', C5D5: 'Dawn Trail', C5E5: 'Bonewhite Rise', E5S: 'The Glass Causeway',
  // Border crossings: outer bridge or tollhouse, middle pass, inner gate.
  B0A1: 'Gullford Bridge', D0C1: 'The Reed Weir', E0E1: 'Drownmark Stones',
  B1A2: 'Steamford', D1C2: 'Boiling Dyke', E1E2: 'The Hissing Gate',
  B2A3: 'Meltwater Bridge', D2C3: 'Fumarole Pass', E2E3: 'The Thawgate',
  B3A4: 'Wolfgate', D3C4: 'Snowbriar Pass', E3E4: 'Hoarthorn Gate',
  B4A5: 'Thornwall Gate', D4C5: 'The Withered March', E4E5: 'Deadwood Stair',
  B5A0: 'Sandmoor Tollhouse', D5C0: 'Dunesend Bridge', E5E0: 'The Red Sands Gate',
};

// Where the Spire's roads stop: the edge of the ash ring around its base.
const SPIRE_EDGE = 2.05;
const LANDMARKS = NODES.slice();
// Roughly where the board prints a landmark's name: a ribbon below it.
function onLabel(m, x, z) {
  if (m.type === 'spire') return false;
  const half = (0.18 * m.name.length + 0.3) / 2 + 0.22;
  return Math.abs(x - m.x) < half && z > m.z + 0.53 && z < m.z + 1.37;
}
export const EDGES = [];
for (const [a, b] of ROADS) {
  const na = NODE_BY_ID[a];
  const nb = NODE_BY_ID[b];
  // Keep the landmark first and the Spire last so ids read naturally.
  const id = b === 'S' ? `${a}S` : (ROAD_NAMES[`${a}${b}`] ? `${a}${b}` : `${b}${a}`);
  const end = (n, other) => (n.type === 'spire'
    ? { x: (other.x / other.r) * SPIRE_EDGE, z: (other.z / other.r) * SPIRE_EDGE }
    : { x: n.x, z: n.z });
  const pa = end(na, nb);
  const pb = end(nb, na);
  // Halfway, unless that lands on a landmark's printed name: then slide
  // along the road to the nearest clear spot.
  let t = 0.5;
  for (const tt of [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68]) {
    t = tt;
    const px = pa.x + (pb.x - pa.x) * tt;
    const pz = pa.z + (pb.z - pa.z) * tt;
    if (!LANDMARKS.some((m) => onLabel(m, px, pz) || (m.type !== 'spire' && Math.hypot(m.x - px, m.z - pz) < 0.9))) break;
  }
  const x = +(pa.x + (pb.x - pa.x) * t).toFixed(3);
  const z = +(pa.z + (pb.z - pa.z) * t).toFixed(3);
  const border = na.wedge >= 0 && nb.wedge >= 0 && na.wedge !== nb.wedge;
  const wedges = border ? [na.wedge, nb.wedge] : [Math.max(na.wedge, nb.wedge)];
  const node = {
    id, type: border ? 'border' : 'road', name: ROAD_NAMES[id] || 'The road',
    wedge: wedges[0], wedges, ends: [a, b], slot: border ? 'X' : 'R',
    angle: +((Math.atan2(x, z) * 180) / Math.PI).toFixed(2), r: +Math.hypot(x, z).toFixed(3), x, z, ring: 'road',
    // Which border crossing this is: the outer bridges, the middle passes or the inner gates.
    reach: border ? ({ A: 'outer', B: 'outer', C: 'middle', D: 'middle', E: 'inner' })[na.slot] : null,
  };
  NODES.push(node);
  NODE_BY_ID[id] = node;
  EDGES.push([a, id], [id, b]);
}

export const ADJ = Object.fromEntries(NODES.map((n) => [n.id, []]));
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}
// List each space's roads in the same turning order relative to the board's
// centre, so a route from Frostvale is the exact half-turn of the matching
// route from Hearthmoor and neither Warden is favoured by list order.
for (const n of NODES) {
  const r = Math.hypot(n.x, n.z) || 1;
  const ux = n.r ? n.x / r : 0;
  const uz = n.r ? n.z / r : 1;
  const turn = (m) => {
    const o = NODE_BY_ID[m];
    const dx = o.x - n.x;
    const dz = o.z - n.z;
    return Math.atan2(ux * dz - uz * dx, ux * dx + uz * dz);
  };
  ADJ[n.id].sort((p, q) => turn(p) - turn(q));
}

// Breadth-first distances between every pair of nodes (85 nodes, cheap).
export const DIST = {};
for (const n of NODES) {
  const d = { [n.id]: 0 };
  const q = [n.id];
  while (q.length) {
    const c = q.shift();
    for (const m of ADJ[c]) if (d[m] === undefined) { d[m] = d[c] + 1; q.push(m); }
  }
  DIST[n.id] = d;
}

// Shortest road from one space to another. Among routes of equal length it
// takes the one through the fewest border crossings, so neither Warden is
// sent through a toll gate by the order the roads happen to be listed in.
const pathCache = new Map();
export function shortestPath(from, to) {
  if (from === to) return [from];
  const key = `${from}>${to}`;
  if (pathCache.has(key)) return pathCache.get(key).slice();
  const cost = (id) => 1 + (NODE_BY_ID[id].type === 'border' ? 0.01 : 0);
  const best = { [from]: 0 };
  const prev = { [from]: null };
  const open = [from];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (best[open[i]] < best[open[bi]]) bi = i;
    const c = open.splice(bi, 1)[0];
    if (c === to) break;
    for (const m of ADJ[c]) {
      const d = best[c] + cost(m);
      if (best[m] === undefined || d < best[m] - 1e-9) {
        if (best[m] === undefined) open.push(m);
        best[m] = d;
        prev[m] = c;
      }
    }
  }
  if (prev[to] === undefined) return null;
  const path = [to];
  let p = prev[to];
  while (p !== null) { path.unshift(p); p = prev[p]; }
  pathCache.set(key, path);
  return path.slice();
}

export const SHARDS = [
  { id: 'sun', name: 'Sun Shard', color: '#f2b632' },
  { id: 'moon', name: 'Moon Shard', color: '#c9d6e8' },
  { id: 'star', name: 'Star Shard', color: '#a77bf0' },
];

// Relics: each Warden may own one of each.
export const RELICS = [
  { id: 'lantern', name: 'Wraith Lantern', price: 14, text: 'Wraiths cannot touch a company that carries it.' },
  { id: 'steed', name: 'Swift Steed', price: 26, text: 'Travel up to two roads each turn.' },
  { id: 'blade', name: 'Runed Blade', price: 22, text: 'Your company fights as if a third larger.' },
  { id: 'banner', name: 'War Banner', price: 13, text: 'The first loss in every battle is shrugged off.' },
  { id: 'map', name: "Cartographer's Map", price: 12, text: 'You are never lost in fog, storms cost less, and you know the smugglers\' way round every border garrison.' },
  { id: 'charm', name: 'Hearth Charm', price: 11, text: 'Fever and blight pass over your company.' },
];
export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export const FOES = {
  brigands: { name: 'Brigands', glyph: 'brigands', fierce: false, loot: [5, 12] },
  wolves: { name: 'Dire Wolves', glyph: 'wolves', fierce: false, loot: [0, 0] },
  hounds: { name: 'Gloom Hounds', glyph: 'hounds', fierce: true, loot: [0, 0] },
  wights: { name: 'Barrow-Wights', glyph: 'wight', fierce: false, loot: [0, 0] },
  barrowking: { name: 'Barrow King', glyph: 'wight', fierce: true, singular: true, loot: [0, 0] },
  sentinels: { name: 'Spire Sentinels', glyph: 'sentinels', fierce: true, loot: [0, 0] },
  ashwarden: { name: 'Ash Warden', glyph: 'ashwarden', fierce: true, singular: true, loot: [0, 0] },
  dragon: { name: 'Crown Dragon', glyph: 'dragon', fierce: true, singular: true, breath: true, loot: [0, 0] },
  // Province beasts met on the roads.
  troll: { name: 'Bog Troll', glyph: 'troll', fierce: false, singular: true, regen: true, loot: [3, 8] },
  spiders: { name: 'Giant Spiders', glyph: 'spiders', fierce: false, venom: true, loot: [0, 0] },
  imps: { name: 'Cinder Imps', glyph: 'imps', fierce: false, thief: true, loot: [0, 0] },
  ogre: { name: 'Frost Ogre', glyph: 'ogre', fierce: true, singular: true, loot: [6, 14] },
  scorpions: { name: 'Dune Scorpions', glyph: 'scorpions', fierce: false, armored: true, loot: [0, 0] },
  // The garrisons that hold the border crossings; their toll chest is the loot.
  marchers: { name: 'Border Marchers', glyph: 'marchers', fierce: false, loot: [4, 10] },
};

export const START = { company: 12, coin: 40, provisions: 20 };
// Per-round rates. A round is one day each for both Wardens; every road now
// takes two days, so these are tuned for the longer journeys.
export const PACE = { titheRate: 3, titheCap: 36, prayEvery: 5, upkeepPer: 20 };
export const LIMITS = { company: 99, coin: 99, provisions: 99 };

// Campaign chapters. gloomMax ends the game when reached; pulseEvery is how
// many rounds pass between the Spire's pulses of Gloom.
export const CHAPTERS = [
  {
    id: 1,
    title: 'The Kindling Road',
    gloomStart: 0, gloomMax: 24, pulseEvery: 4, foeBonus: 0, kindleBase: 5, rivalSkill: 0.7,
    intro: [
      'For a hundred winters the Obsidian Spire slept at the heart of the Gloaming Reach.',
      'Now it pulses. Each pulse spreads the Gloom a little further across the six provinces.',
      'The Spire can be quenched only by kindling its crown with three shards of the old sky: Sun, Moon and Star. They lie in the barrows of the Reach, guarded by the dead.',
      'Two Wardens ride out. You hold Hearthmoor. Ser Vael of Frostvale rides for the same crown, and the Reach will remember only the first to reach it.',
    ],
  },
  {
    id: 2,
    title: 'Ashfall',
    gloomStart: 2, gloomMax: 24, pulseEvery: 4, foeBonus: 1, kindleBase: 6, rivalSkill: 0.85,
    intro: [
      'The kindled crown held for a season. Then the ash began to fall again.',
      'The barrows have been resealed and the shards scattered anew. The dead in them are hungrier.',
      'Ser Vael has spent the winter learning the roads. Expect a quicker rival.',
    ],
  },
  {
    id: 3,
    title: 'The Long Night',
    gloomStart: 2, gloomMax: 23, pulseEvery: 4, foeBonus: 2, kindleBase: 7, rivalSkill: 0.95,
    intro: [
      'The sun has not fully risen in forty days. The Spire pulses every night now.',
      'This is the last kindling the Reach can survive. Fail, and the Gloom will cover all six provinces.',
      'Ser Vael rides without rest. So must you.',
    ],
  },
];

export const PLAYER_COLORS = {
  crimson: { name: 'Crimson', hex: '#c8262f', dark: '#7d1218', light: '#ff6b6b' },
  azure: { name: 'Azure', hex: '#2c6fd8', dark: '#173d7a', light: '#7fb2ff' },
};
