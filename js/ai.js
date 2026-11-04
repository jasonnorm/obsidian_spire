// Ser Vael, the computer Warden. Plays by the same rules and sees only what
// the human sees: hidden barrows stay hidden until someone opens them or an
// oracle or omen reveals them.

import { NODES, NODE_BY_ID, DIST, shortestPath, SHARDS, RELIC_BY_ID } from './data.js';

const SHARD_IDS = SHARDS.map((s) => s.id);

// How each foe bends the battle maths: `hit` scales the damage the company
// deals, `extra` is the average loss on top of the foe's strength-scaled
// bite per lost exchange, `heal` is strength regained per lost exchange.
const FOE_FACTORS = {
  sentinels: { extra: 0.25 }, ashwarden: { extra: 0.25 }, barrowking: { extra: 0.25 }, hounds: { extra: 0.25 },
  ogre: { extra: 0.25 }, spiders: { extra: 0.35 }, dragon: { extra: 1.2 },
  scorpions: { hit: 0.6 }, troll: { heal: 1 },
};
export function foeFactor(kind) { return { hit: 1, extra: 0, heal: 0, ...(FOE_FACTORS[kind] || {}) }; }

// Deterministic attrition estimate using the engine's battle maths: the foe
// bites about one man per six points of its remaining strength.
export function expectedLoss(company, foe, blade, kind) {
  const fx = foeFactor(kind);
  let c = company;
  let f = foe;
  let guard = 0;
  while (f > 0 && c > 0 && guard++ < 500) {
    const ce = c * (blade ? 1.33 : 1);
    const p = ce / (ce + f);
    const bite = Math.max(1, f / 6) + fx.extra;
    f -= p * Math.max(1, 0.275 * ce * fx.hit);
    f += (1 - p) * fx.heal;
    c -= (1 - p) * bite;
  }
  // A margin for bad luck: the engine's rolls swing far more than this mean.
  return c <= 0 ? Infinity : (company - c) * 1.15;
}

function barrowStrength(game, nodeId, depth) {
  const n = NODE_BY_ID[nodeId];
  const g = game.s.gloom;
  const fb = game.chapter.foeBonus;
  return depth === 0
    ? (n.slot === 'E' ? 6 : 4) + 1 + Math.floor(g * 0.4) + fb
    : (n.slot === 'E' ? 9 : 7) + 1.5 + Math.floor(g * 0.5) + Math.round(fb * 1.5);
}

// Company needed to clear the remaining chambers of a barrow with some left over.
function barrowNeed(game, p, nodeId) {
  const depth = p.depth[nodeId] || 0;
  const fights = [];
  if (depth === 0) fights.push(barrowStrength(game, nodeId, 0));
  const b = game.s.barrows[nodeId];
  if (!(b.revealed && p.shards[b.shard])) fights.push(barrowStrength(game, nodeId, 1));
  return chainNeed(fights, p.relics.blade, 5);
}

function chainNeed(fights, blade, leftover) {
  for (let c = 3; c < 99; c++) {
    let left = c;
    for (const f of fights) {
      const l = typeof f === 'number' ? expectedLoss(left, f, blade) : expectedLoss(left, f.str, blade, f.kind);
      left = l === Infinity ? 0 : left - l;
    }
    if (left >= leftover) return c;
  }
  return 99;
}

// Smallest company that should survive a fight with `foe` keeping `margin` of itself.
function companyFor(foe, blade, keepFrac) {
  for (let c = 3; c < 99; c++) {
    const l = expectedLoss(c, foe, blade);
    if (l !== Infinity && c - l >= c * keepFrac) return c;
  }
  return 99;
}

// Company needed to clear the Spire's remaining guardians in one climb.
export function spireNeed(game, p) {
  const tiers = [];
  for (let t = Math.max(0, p.spireTier); t <= 2; t++) tiers.push({ str: game.spireFoe(t), kind: ['sentinels', 'ashwarden', 'dragon'][t] });
  return tiers.length ? chainNeed(tiers, p.relics.blade, 6) : 4;
}

function lackingShards(p) {
  return SHARD_IDS.filter((s) => !p.shards[s]);
}

// Probability that an unrevealed barrow holds something this Warden lacks.
function unknownValue(game, p) {
  const hidden = Object.values(game.s.barrows).filter((b) => !b.revealed);
  if (!hidden.length) return 0;
  // The AI does not peek: estimate from what is still unaccounted for.
  const revealedCounts = { sun: 0, moon: 0, star: 0 };
  for (const b of Object.values(game.s.barrows)) if (b.revealed) revealedCounts[b.shard]++;
  let wantedLeft = 0;
  for (const s of lackingShards(p)) wantedLeft += 2 - revealedCounts[s];
  return Math.min(1, wantedLeft / hidden.length);
}

// A tie-break that looks the same from either keep: the space's province
// counted round from the Warden's home, then its slot.
function rel(p, id) {
  const n = NODE_BY_ID[id];
  if (n.wedge < 0) return 999;
  const h = NODE_BY_ID[p.home].wedge;
  return ((n.wedge - h + 6) % 6) * 10 + 'ABCDERX'.indexOf(n.slot);
}

function nearest(p, ids) {
  let best = null;
  let bd = Infinity;
  for (const id of ids) {
    const d = DIST[p.node][id];
    if (d < bd || (d === bd && rel(p, id) < rel(p, best))) { bd = d; best = id; }
  }
  return { id: best, d: bd };
}

function recruitSpots(p) {
  const markets = NODES.filter((n) => n.type === 'market').map((n) => n.id);
  return [p.home, ...markets];
}

function shrines() {
  return NODES.filter((n) => n.type === 'shrine').map((n) => n.id);
}

function barrowTargets(game, p) {
  const uv = unknownValue(game, p);
  const out = [];
  for (const [id, b] of Object.entries(game.s.barrows)) {
    if (p.looted[id]) continue;
    let value;
    if (b.revealed) value = p.shards[b.shard] ? 0 : 1;
    else value = uv;
    if (value <= 0) continue;
    out.push({ id, value, d: DIST[p.node][id], need: barrowNeed(game, p, id) });
  }
  out.sort((a, b) => (b.value / (b.d + 3) - a.value / (a.d + 3)) || rel(p, a.id) - rel(p, b.id));
  return out;
}

export function targetCompany(game, p) {
  if (game.shardCount(p) === 3) return spireNeed(game, p) + 2;
  const t = barrowTargets(game, p);
  const need = t.length ? Math.max(...t.slice(0, 2).map((x) => x.need)) : 12;
  return Math.max(10, need + 2);
}

function chooseGoal(game, p) {
  const up = game.upkeep(p);
  const spots = recruitSpots(p);
  // Food first.
  if (p.provisions < up * 5) {
    const food = nearest(p, spots);
    if (p.coin >= 4 && food.d <= Math.max(1, Math.floor(p.provisions / up) + 1)) return { id: food.id, why: 'food' };
    if (['wilds', 'road'].includes(NODE_BY_ID[p.node].type)) return { id: p.node, why: 'forage' };
    const wild = nearest(p, NODES.filter((n) => n.type === 'wilds' || n.type === 'road').map((n) => n.id));
    return { id: wild.id, why: 'forage' };
  }
  const want = targetCompany(game, p);
  if (game.shardCount(p) === 3) {
    if (p.company >= spireNeed(game, p) || game.s.gloom >= game.s.gloomMax - 2) return { id: 'S', why: 'spire' };
  }
  if (p.company < want - 2) {
    const tithe = game.titheDue(p) + (DIST[p.node][p.home] / 2) * game.titheRate;
    const r = nearest(p, spots);
    const homeD = DIST[p.node][p.home];
    if (p.coin < 12 && tithe >= 12 && homeD <= r.d + 4) return { id: p.home, why: 'tithe' };
    if (Math.floor(p.coin / 3) >= 2) return { id: r.id, why: 'recruit' };
    if (tithe >= 12) return { id: p.home, why: 'tithe' };
    const shr = nearest(p, shrines());
    if (game.s.round - p.lastPray >= game.prayEvery && shr.d <= 6) return { id: shr.id, why: 'pray' };
  }
  // Relic shopping when rich.
  if (p.coin >= 34) {
    const wish = ['steed', 'blade', game.s.gloom >= 5 ? 'lantern' : null, 'banner'].filter(Boolean).filter((r) => !p.relics[r]);
    const shops = Object.entries(game.s.markets)
      .filter(([mid, m]) => DIST[p.node][mid] <= 6 && m.relics.some((r) => wish.includes(r)))
      .sort((x, y) => (DIST[p.node][x[0]] - DIST[p.node][y[0]]) || rel(p, x[0]) - rel(p, y[0]));
    if (shops.length) return { id: shops[0][0], why: 'relic' };
  }
  if (game.shardCount(p) < 3) {
    const t = barrowTargets(game, p);
    if (t.length) return { id: t[0].id, why: 'barrow' };
  }
  if (game.shardCount(p) === 3) {
    const r = nearest(p, spots);
    return { id: p.coin >= 6 ? r.id : 'S', why: 'prepare' };
  }
  return { id: nearest(p, spots).id, why: 'idle' };
}

export function chooseMove(game, p, options) {
  // A less skilled rival sometimes wanders.
  if (game.rand() < (1 - p.skill) * 0.3) {
    const adj = options.filter((o) => o.path.length === 2 && o.to !== 'S');
    if (adj.length) return { to: game.pick(adj).to };
  }
  const goal = chooseGoal(game, p);
  p._goal = goal;
  if (goal.id === p.node) {
    const here = NODE_BY_ID[p.node];
    if (here.type === 'barrow' && p.looted[p.node]) return { to: options[0].to };
    return { stay: true };
  }
  const path = shortestPath(p.node, goal.id);
  const range = p.relics.steed ? 2 : 1;
  const step = path[Math.min(range, path.length - 1)];
  if (options.some((o) => o.to === step)) return { to: step };
  return { to: options[0].to };
}

function relicPriority(game, p, id) {
  const g = game.s.gloom;
  switch (id) {
    case 'steed': return g < 12 ? 3 : 1;
    case 'blade': return 3;
    case 'lantern': return g >= 5 ? 3 : 1;
    case 'banner': return 2;
    case 'charm': return 1;
    case 'map': return 2;
    default: return 0;
  }
}

function shopDecision(game, p, prompt) {
  const memoKey = `${game.s.round}:${prompt.place}`;
  if (!p._shop || p._shop.key !== memoKey) p._shop = { key: memoKey, nexts: 0 };
  const item = prompt.item;
  const price = prompt.price;
  const up = game.upkeep(p);
  const provWant = Math.min(60, up * 15);
  const provBudget = Math.max(0, Math.ceil((provWant - p.provisions) / 5)) * (item.kind === 'provisions' ? price : 4);
  let buy = false;
  if (item.kind === 'provisions') buy = p.provisions < provWant && p.coin >= price;
  else if (item.kind === 'company') buy = p.company < targetCompany(game, p) && p.coin - price >= provBudget + 1;
  else if (item.kind === 'relic' && !p.relics[item.relic]) {
    const pr = relicPriority(game, p, item.relic);
    const spare = p.coin - price - provBudget;
    buy = (pr >= 3 && spare >= 4) || (pr === 2 && spare >= 12) || (pr === 1 && spare >= 25);
  }
  if (buy && p.coin >= price) { p._shop.nexts = 0; return 'yes'; }
  p._shop.nexts++;
  if (p._shop.nexts > 6) return 'end';
  return 'next';
}

export function decide(game, p, prompt) {
  const g = game.s.gloom;
  switch (prompt.kind) {
    case 'shop': return shopDecision(game, p, prompt);
    case 'pray': return 'yes';
    case 'oracle':
      return p.coin >= prompt.price + 8 && lackingShards(p).length && game.rand() < p.skill ? 'yes' : 'no';
    case 'ward':
      return p.coin >= prompt.price + 14 && g >= 4 && !p.relics.lantern ? 'yes' : 'no';
    case 'enterBarrow': {
      const b = game.s.barrows[prompt.node];
      if (b.revealed && p.shards[b.shard]) return p.company >= 14 && p.coin < 20 ? 'yes' : 'no';
      return p.company >= barrowNeed(game, p, prompt.node) * 0.9 ? 'yes' : 'no';
    }
    case 'descend': {
      const l = expectedLoss(p.company, prompt.foeLeft, p.relics.blade);
      return l !== Infinity && p.company - l >= Math.max(4, p.company * 0.35) ? 'yes' : 'no';
    }
    case 'toll': {
      const l = expectedLoss(p.company, prompt.foeLeft, p.relics.blade);
      return l > 2.5 && p.coin >= prompt.price + 4 ? 'yes' : 'no';
    }
    case 'offer':
      if (prompt.what === 'company') return p.coin >= prompt.price + 4 && p.company < targetCompany(game, p) + 4 ? 'yes' : 'no';
      return relicPriority(game, p, prompt.relic) >= 2 && p.coin >= prompt.price + 8 ? 'yes' : 'no';
    case 'battle': {
      const l = expectedLoss(p.company, prompt.foeLeft, p.relics.blade, prompt.foe);
      if (prompt.foeLeft <= 2 && p.company >= 3) return 'fight';
      const keep = ['sentinels', 'ashwarden', 'dragon'].includes(prompt.foe) ? 4 : 2;
      return l !== Infinity && p.company - l >= keep ? 'fight' : 'flee';
    }
    case 'ascend': {
      if (prompt.tier === 3) return 'yes';
      if (prompt.tier === 0) return p.company >= spireNeed(game, p) || g >= game.s.gloomMax - 1 ? 'yes' : 'no';
      const kind = ['sentinels', 'ashwarden', 'dragon'][prompt.tier];
      const l = expectedLoss(p.company, prompt.foeLeft, p.relics.blade, kind);
      return l !== Infinity && p.company - l >= 3 ? 'yes' : 'no';
    }
    case 'kindleRetry': return p.company >= 3 ? 'yes' : 'no';
    case 'border': {
      // The map makes the wild way free; otherwise pay when the purse allows,
      // fight a weak garrison for its toll chest, and go round when broke.
      if (p.relics.map) return 'no';
      if (prompt.canPay && p.coin >= prompt.toll + 4) return 'yes';
      const l = expectedLoss(p.company, prompt.foeLeft, p.relics.blade, 'marchers');
      if (l !== Infinity && l <= 2 && p.company - l >= 6) return 'fight';
      return prompt.canPay && p.company < 8 ? 'yes' : 'no';
    }
    default:
      return prompt.options.includes('yes') ? 'yes' : prompt.options[0];
  }
}

export function kindle(game, p, seq) {
  const q = 0.86 + 0.1 * p.skill;
  for (let i = 0; i < seq.length; i++) if (game.rand() > q) return false;
  return true;
}

// Used by the headless simulator to let the AI play the human seat too.
export const RELIC_NAMES = RELIC_BY_ID;
