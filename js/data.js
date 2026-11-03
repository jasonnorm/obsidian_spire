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

const edgeSet = new Set();
export const EDGES = [];
function link(a, b) {
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (edgeSet.has(k)) return;
  edgeSet.add(k);
  EDGES.push([a, b]);
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

export const ADJ = Object.fromEntries(NODES.map((n) => [n.id, []]));
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

// Breadth-first distances between every pair of nodes (31 nodes, cheap).
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

export function shortestPath(from, to) {
  if (from === to) return [from];
  const prev = { [from]: null };
  const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const m of ADJ[c]) {
      if (prev[m] !== undefined) continue;
      prev[m] = c;
      if (m === to) {
        const path = [to];
        let p = c;
        while (p !== null) { path.unshift(p); p = prev[p]; }
        return path;
      }
      q.push(m);
    }
  }
  return null;
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
  { id: 'map', name: "Cartographer's Map", price: 9, text: 'You are never lost in fog, and storms cost less.' },
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
};

export const START = { company: 12, coin: 40, provisions: 20 };
export const LIMITS = { company: 99, coin: 99, provisions: 99 };

// Campaign chapters. gloomMax ends the game when reached; pulseEvery is how
// many rounds pass between the Spire's pulses of Gloom.
export const CHAPTERS = [
  {
    id: 1,
    title: 'The Kindling Road',
    gloomStart: 0, gloomMax: 24, pulseEvery: 2, foeBonus: 0, kindleBase: 4, rivalSkill: 0.55,
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
    gloomStart: 2, gloomMax: 22, pulseEvery: 2, foeBonus: 1, kindleBase: 5, rivalSkill: 0.75,
    intro: [
      'The kindled crown held for a season. Then the ash began to fall again.',
      'The barrows have been resealed and the shards scattered anew. The dead in them are hungrier.',
      'Ser Vael has spent the winter learning the roads. Expect a quicker rival.',
    ],
  },
  {
    id: 3,
    title: 'The Long Night',
    gloomStart: 4, gloomMax: 20, pulseEvery: 2, foeBonus: 2, kindleBase: 6, rivalSkill: 0.95,
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
