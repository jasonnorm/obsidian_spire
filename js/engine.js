// Rules engine for Obsidian Spire. No DOM access: everything the player sees
// or decides goes through the `io` object, so the same engine drives the
// browser game and the headless balance simulator.
//
// io contract (all may return promises):
//   io.update(game)                       state changed, redraw
//   io.show(player, evt)                  display an event on the Spire
//   io.ask(player, prompt) -> key         human decision ('yes','no','next','end','fight','flee')
//   io.chooseMove(player, options) -> {to} | {stay:true}
//   io.movePawn(player, path, {teleport})
//   io.kindle(player, sequence) -> bool   memory test at the crown
//   io.gameOver(game)

import {
  NODES, NODE_BY_ID, ADJ, DIST, shortestPath, SHARDS, RELICS, RELIC_BY_ID, FOES,
  START, LIMITS, CHAPTERS,
} from './data.js';
import * as AI from './ai.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHARD_IDS = SHARDS.map((s) => s.id);
export const KEEP_OF = { p: 'A0', r: 'A3' };

function makePlayer(id, human, chapter) {
  return {
    id,
    human,
    name: human ? 'You' : 'Ser Vael',
    title: human ? 'Warden of Hearthmoor' : 'Warden of Frostvale',
    color: human ? 'crimson' : 'azure',
    home: KEEP_OF[id],
    node: KEEP_OF[id],
    prevNode: null,
    company: START.company,
    coin: START.coin,
    provisions: START.provisions,
    relics: Object.fromEntries(RELICS.map((r) => [r.id, false])),
    shards: Object.fromEntries(SHARD_IDS.map((s) => [s, false])),
    ward: false,
    spireTier: 0,
    lastTithe: 1,
    lastPray: -9,
    looted: {},
    depth: {},
    stats: { battlesWon: 0, routs: 0, foesSlain: 0, roads: 0 },
    skill: human ? 1 : chapter.rivalSkill,
  };
}

export function newState(chapterIndex, seed) {
  const chapter = CHAPTERS[chapterIndex];
  const rng = mulberry32(seed);
  // Each of the six barrows hides one shard type, two of each.
  const barrowIds = NODES.filter((n) => n.type === 'barrow').map((n) => n.id);
  const pool = ['sun', 'sun', 'moon', 'moon', 'star', 'star'];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const barrows = {};
  barrowIds.forEach((id, i) => { barrows[id] = { shard: pool[i], revealed: false }; });
  // Every market sells the staples plus three relics.
  const markets = {};
  for (const n of NODES.filter((m) => m.type === 'market')) {
    const rel = RELICS.map((r) => r.id);
    for (let i = rel.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rel[i], rel[j]] = [rel[j], rel[i]];
    }
    markets[n.id] = { relics: rel.slice(0, 3).sort() };
  }
  return {
    version: 1,
    seed,
    rngCalls: 0,
    chapterIndex,
    round: 1,
    turn: 0,
    gloom: chapter.gloomStart,
    gloomMax: chapter.gloomMax,
    players: [makePlayer('p', true, chapter), makePlayer('r', false, chapter)],
    barrows,
    markets,
    over: false,
    winner: null,
    reason: '',
  };
}

export class Game {
  constructor(state, io, opts = {}) {
    this.s = state;
    this.io = io;
    this.chapter = CHAPTERS[state.chapterIndex];
    this.rng = mulberry32(state.seed ^ 0x9e3779b9);
    // Advance the rng to where a saved game left off.
    for (let i = 0; i < state.rngCalls; i++) this.rng();
    this.allAI = !!opts.allAI;
    this.log = [];
  }

  // ---------- helpers ----------
  rand() { this.s.rngCalls++; return this.rng(); }
  int(a, b) { return a + Math.floor(this.rand() * (b - a + 1)); }
  chance(p) { return this.rand() < p; }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
  get players() { return this.s.players; }
  other(p) { return this.s.players.find((q) => q !== p); }
  node(p) { return NODE_BY_ID[p.node]; }
  // The home keep gathers 4 coin of tithes every round, up to 32, while its Warden is away.
  titheDue(p) { return Math.min(32, 4 * (this.s.round - p.lastTithe)); }
  upkeep(p) { return Math.max(1, Math.ceil(p.company / 12)); }
  priceMult() { const g = this.s.gloom; return 1 + (g >= 7 ? 0.25 : 0) + (g >= 14 ? 0.25 : 0); }
  shardCount(p) { return SHARD_IDS.filter((s) => p.shards[s]).length; }
  isHuman(p) { return p.human && !this.allAI; }
  // True when the human is playing through the first-person view.
  fp(p) { return this.isHuman(p) && !!this.io.firstPerson?.(); }

  clamp(p) {
    for (const k of ['company', 'coin', 'provisions']) p[k] = Math.max(0, Math.min(LIMITS[k], Math.round(p[k])));
  }
  changed() { this.io.update?.(this); }

  async show(p, evt) {
    this.changed();
    const line = evt.log !== undefined ? evt.log : evt.text;
    if (line) this.log.push({ round: this.s.round, who: p ? p.id : null, text: line, tone: evt.tone || 'neutral' });
    await this.io.show?.(p, evt);
  }

  async ask(p, prompt) {
    this.changed();
    if (this.isHuman(p)) return this.io.ask(p, prompt);
    const key = AI.decide(this, p, prompt);
    await this.io.aiChoice?.(p, prompt, key);
    return key;
  }

  // ---------- main loop ----------
  async run() {
    this.changed();
    while (!this.s.over) {
      while (this.s.turn < this.players.length && !this.s.over) {
        const p = this.players[this.s.turn];
        await this.io.beforeTurn?.(this, p);
        await this.takeTurn(p);
        this.s.turn++;
      }
      if (this.s.over) break;
      await this.endRound();
      this.s.turn = 0;
    }
    this.changed();
    await this.io.gameOver?.(this);
    return this.s;
  }

  movementOptions(p) {
    const range = p.relics.steed ? 2 : 1;
    const d = DIST[p.node];
    return NODES.filter((n) => n.id !== p.node && d[n.id] <= range).map((n) => ({
      to: n.id,
      path: shortestPath(p.node, n.id),
    }));
  }

  async takeTurn(p) {
    await this.show(p, {
      glyph: p.human ? 'company' : 'rival',
      led: this.s.round,
      text: p.human ? `Round ${this.s.round}. Your move, Warden.` : `Round ${this.s.round}. Ser Vael rides.`,
      log: p.human ? `Round ${this.s.round}: your turn.` : `Round ${this.s.round}: Ser Vael's turn.`,
      sound: 'turn', mood: 'idle', short: true,
    });
    const options = this.movementOptions(p);
    let choice;
    if (this.isHuman(p)) choice = await this.io.chooseMove(p, options);
    else {
      choice = AI.chooseMove(this, p, options);
      await this.io.aiChoice?.(p, { kind: 'move' }, choice);
    }

    if (choice.stay) {
      await this.stayAt(p);
    } else {
      const opt = options.find((o) => o.to === choice.to);
      const path = opt ? opt.path : shortestPath(p.node, choice.to);
      p.prevNode = p.node;
      await this.io.movePawn?.(p, path);
      p.node = choice.to;
      p.stats.roads += path.length - 1;
      this.changed();
      await this.arrive(p);
    }
    if (this.s.over) return;
    if (p.company <= 0) { await this.rout(p); return; }
    await this.doUpkeep(p);
    if (p.company <= 0) await this.rout(p);
  }

  async doUpkeep(p) {
    const need = this.upkeep(p);
    if (p.provisions >= need) {
      p.provisions -= need;
      this.changed();
      if (p.provisions <= need * 2 && p.human) {
        await this.show(p, { glyph: 'provisions', led: p.provisions, text: `Provisions are running low: ${p.provisions} left, your company eats ${need} a day.`, tone: 'bad', sound: 'warn', mood: 'warn', short: true });
      }
      return;
    }
    const short = need - p.provisions;
    p.provisions = 0;
    const lost = Math.min(p.company, 1 + short);
    p.company -= lost;
    await this.show(p, {
      glyph: 'hunger', led: -lost,
      text: `${p.human ? 'Your' : "Ser Vael's"} company goes hungry. ${lost} desert in the night.`,
      tone: 'bad', sound: 'lose', mood: 'danger',
    });
  }

  async rout(p) {
    p.stats.routs++;
    p.company = 5;
    p.coin = Math.floor(p.coin / 2);
    p.provisions = Math.max(p.provisions, 8);
    p.spireTier = 0;
    p.ward = false;
    const from = p.node;
    p.node = p.home;
    p.prevNode = null;
    this.s.gloom = Math.min(this.s.gloomMax, this.s.gloom + 1);
    await this.io.movePawn?.(p, [from, p.home], { teleport: true });
    await this.show(p, {
      glyph: 'rout', led: 5,
      text: p.human
        ? 'Your company is routed. You limp home to Hearthmoor with five survivors and half your purse. The Gloom deepens.'
        : 'Ser Vael is routed and flees home to Frostvale. The Gloom deepens.',
      tone: 'bad', sound: 'defeat', mood: 'danger',
    });
    await this.checkGloom();
  }

  async endRound() {
    this.s.round++;
    if ((this.s.round - 1) % this.chapter.pulseEvery === 0) {
      this.s.gloom = Math.min(this.s.gloomMax, this.s.gloom + 1);
      await this.show(null, {
        glyph: 'gloom', led: this.s.gloom,
        text: `The Spire pulses. Gloom rises to ${this.s.gloom} of ${this.s.gloomMax}.`,
        tone: 'bad', sound: 'pulse', mood: 'gloom', pulse: true,
      });
    }
    await this.checkGloom();
  }

  async checkGloom() {
    if (this.s.over) return;
    if (this.s.gloom >= this.s.gloomMax) {
      this.s.over = true;
      this.s.winner = 'spire';
      this.s.reason = 'The Gloom covers the Reach. The Spire wakes, and no Warden will kindle its crown now.';
      await this.show(null, { glyph: 'defeat', led: this.s.gloom, text: this.s.reason, tone: 'bad', sound: 'defeat', mood: 'gloom' });
    }
  }

  // ---------- arriving and staying ----------
  async arrive(p) {
    const n = this.node(p);
    switch (n.type) {
      case 'keep': return n.id === p.home ? this.keepFlow(p, n) : this.foreignKeep(p, n);
      case 'market': return this.marketFlow(p, n);
      case 'shrine': return this.shrineFlow(p, n);
      case 'barrow': return this.barrowFlow(p, n);
      case 'spire': return this.spireFlow(p, n);
      default: return this.wildsEvent(p, n, false);
    }
  }

  async stayAt(p) {
    const n = this.node(p);
    if (n.type === 'wilds') {
      const found = this.int(2, 4);
      p.provisions += found;
      this.clamp(p);
      await this.show(p, {
        glyph: 'camp', led: found,
        text: `${p.human ? 'You make' : 'Ser Vael makes'} camp at ${n.name} and forage ${found} provisions.`,
        tone: 'good', sound: 'gain', mood: 'good',
      });
      if (this.chance(0.35)) await this.wildsEvent(p, n, true);
      return;
    }
    return this.arrive(p);
  }

  async foreignKeep(p, n) {
    await this.show(p, { glyph: 'keep', text: `The gates of ${n.name} stay shut to a rival Warden.`, tone: 'neutral', sound: 'deny', mood: 'idle' });
  }

  // A device-style shop: the Spire shows one item at a time.
  async shopLoop(p, n, goods, intro) {
    await this.show(p, { glyph: intro.glyph, text: intro.text, sound: intro.sound || 'market', mood: 'good', short: true });
    if (!goods.length) return;
    let i = 0;
    let guard = 0;
    while (guard++ < 400) {
      const g = goods[i];
      const owned = g.relic && p.relics[g.relic];
      const price = g.price;
      const key = await this.ask(p, {
        kind: 'shop', item: g, price, place: n.id,
        glyph: g.glyph, led: price,
        text: owned ? `${g.name}: you already carry one.` : `${g.name} for ${price} coin. ${g.blurb}`,
        options: ['yes', 'next', 'end'],
      });
      if (key === 'end') break;
      if (key === 'next' || key === 'no') { i = (i + 1) % goods.length; continue; }
      if (key === 'yes') {
        if (owned) { await this.show(p, { glyph: g.glyph, text: 'You already carry one.', sound: 'deny', short: true }); continue; }
        if (p.coin < price) { await this.show(p, { glyph: 'coin', led: p.coin, text: `Not enough coin. You hold ${p.coin}.`, tone: 'bad', sound: 'deny', short: true }); continue; }
        p.coin -= price;
        if (g.company) p.company += g.company;
        if (g.provisions) p.provisions += g.provisions;
        if (g.relic) p.relics[g.relic] = true;
        this.clamp(p);
        const what = g.company ? `${p.human ? 'You hire' : 'Ser Vael hires'} ${g.company === 1 ? 'a' : g.company} ${g.unit}` : g.provisions ? `${p.human ? 'You buy' : 'Ser Vael buys'} ${g.provisions} provisions` : `${p.human ? 'You buy' : 'Ser Vael buys'} the ${g.name}`;
        await this.show(p, {
          glyph: g.glyph, led: g.company ? p.company : g.provisions ? p.provisions : price,
          text: `${what}.`, tone: 'good', sound: g.relic ? 'relic' : 'coin', mood: 'good', short: true,
          log: `${what} for ${price} coin.`,
        });
      }
    }
  }

  staples(rate) {
    const m = this.priceMult();
    return [
      { kind: 'company', name: rate.unitName, unit: rate.unit, glyph: 'sellswords', price: Math.round(rate.company * m), company: 1, blurb: 'One more blade for your company.' },
      { kind: 'provisions', name: '5 provisions', glyph: 'provisions', price: Math.round(rate.provisions * m), provisions: 5, blurb: `Your company eats ${'{upkeep}'} a day.` },
    ];
  }

  async keepFlow(p, n) {
    const tithe = this.titheDue(p);
    if (tithe > 0) {
      p.lastTithe = this.s.round;
      p.coin += tithe;
      this.clamp(p);
      await this.show(p, { glyph: 'tithe', led: tithe, text: `The stewards of ${n.name} hand over ${tithe} coin of tithes gathered while ${p.human ? 'you were' : 'he was'} away.`, tone: 'good', sound: 'coin', mood: 'good' });
    }
    const goods = this.staples({ unitName: 'Men-at-arms', unit: 'man-at-arms', company: 2, provisions: 3 })
      .map((g) => ({ ...g, blurb: g.blurb.replace('{upkeep}', this.upkeep(p)), glyph: g.kind === 'company' ? 'recruit' : g.glyph, name: g.kind === 'company' ? 'Men-at-arms' : g.name }));
    await this.shopLoop(p, n, goods, { glyph: 'keep', text: `${n.name}. Home. Men-at-arms and stores are cheaper here.`, sound: 'home' });
  }

  async marketFlow(p, n) {
    const m = this.priceMult();
    const goods = this.staples({ unitName: 'Sellswords', unit: 'sellsword', company: 3, provisions: 4 })
      .map((g) => ({ ...g, blurb: g.blurb.replace('{upkeep}', this.upkeep(p)) }));
    for (const rid of this.s.markets[n.id].relics) {
      const r = RELIC_BY_ID[rid];
      goods.push({ kind: 'relic', relic: rid, name: r.name, glyph: rid, price: Math.round(r.price * m), blurb: r.text });
    }
    await this.shopLoop(p, n, goods, {
      glyph: 'market',
      text: `The market at ${n.name}.${m > 1 ? ' The Gloom has driven prices up.' : ''}`,
    });
  }

  async shrineFlow(p, n) {
    await this.show(p, { glyph: 'shrine', text: `${n.name}. Candles burn here even now.`, sound: 'shrine', mood: 'magic', short: true });
    if (this.s.round - p.lastPray >= 3) {
      const gain = p.company < 8 ? 3 : 2;
      const key = await this.ask(p, { kind: 'pray', glyph: 'pray', led: gain, text: `Pray at the shrine? Pilgrims may join you (+${gain}).`, options: ['yes', 'no'] });
      if (key === 'yes') {
        p.lastPray = this.s.round;
        p.company += gain;
        this.clamp(p);
        await this.show(p, { glyph: 'pilgrim', led: p.company, text: `${gain} pilgrims take up arms and join ${p.human ? 'you' : 'Ser Vael'}.`, tone: 'good', sound: 'gain', mood: 'magic' });
      }
    }
    const hidden = Object.entries(this.s.barrows).filter(([, b]) => !b.revealed);
    if (hidden.length) {
      const cost = Math.round(5 * this.priceMult());
      const key = await this.ask(p, { kind: 'oracle', glyph: 'oracle', led: cost, price: cost, text: `Ask the oracle which shard a barrow hides? ${cost} coin.`, options: ['yes', 'no'] });
      if (key === 'yes') {
        if (p.coin < cost) await this.show(p, { glyph: 'coin', led: p.coin, text: 'The oracle wants coin you do not have.', sound: 'deny', tone: 'bad', short: true });
        else {
          p.coin -= cost;
          await this.revealBarrow(p, 'oracle');
        }
      }
    }
    if (!p.ward) {
      const cost = Math.round(7 * this.priceMult());
      const key = await this.ask(p, { kind: 'ward', glyph: 'ward', led: cost, price: cost, text: `Take the shrine's ward for ${cost} coin? It turns aside one wraith, fever or curse.`, options: ['yes', 'no'] });
      if (key === 'yes') {
        if (p.coin < cost) await this.show(p, { glyph: 'coin', led: p.coin, text: 'Not enough coin for the ward.', sound: 'deny', tone: 'bad', short: true });
        else {
          p.coin -= cost;
          p.ward = true;
          await this.show(p, { glyph: 'ward', text: `${p.human ? 'You are' : 'Ser Vael is'} warded.`, tone: 'good', sound: 'magic', mood: 'magic' });
        }
      }
    }
  }

  // The oracle or an omen reveals one hidden barrow, preferring a shard the player lacks.
  async revealBarrow(p, source) {
    const hidden = Object.entries(this.s.barrows).filter(([, b]) => !b.revealed);
    if (!hidden.length) {
      await this.show(p, { glyph: source, text: 'Every barrow has already given up its secret.', short: true });
      return;
    }
    const wanted = hidden.filter(([, b]) => !p.shards[b.shard]);
    const [id, b] = this.pick(wanted.length ? wanted : hidden);
    b.revealed = true;
    const shard = SHARDS.find((s) => s.id === b.shard);
    await this.show(p, {
      glyph: b.shard, text: `${source === 'oracle' ? 'The oracle speaks' : 'A raven circles'}: ${NODE_BY_ID[id].name} holds the ${shard.name}.`,
      tone: 'magic', sound: 'reveal', mood: 'magic', reveal: id,
    });
  }

  barrowStrength(n, depth) {
    const g = this.s.gloom;
    const fb = this.chapter.foeBonus;
    const inner = n.slot === 'E';
    return depth === 0
      ? (inner ? 6 : 4) + this.int(0, 2) + Math.floor(g * 0.4) + fb
      : (inner ? 9 : 7) + this.int(0, 3) + Math.floor(g * 0.5) + Math.round(fb * 1.5);
  }

  async barrowPassage(p) {
    if (this.s.gloom < 8) return true;
    if (p.relics.lantern) {
      await this.show(p, { glyph: 'lantern', text: 'Wraiths drift in the barrow passage. The lantern holds them back.', tone: 'good', sound: 'magic', mood: 'magic', short: true });
    } else if (p.ward) {
      p.ward = false;
      await this.show(p, { glyph: 'ward', text: 'Wraiths drift in the barrow passage. The ward breaks against them.', tone: 'neutral', sound: 'magic', mood: 'magic' });
    } else {
      const lost = Math.min(p.company, this.int(1, 2));
      p.company -= lost;
      await this.show(p, { glyph: 'wraith', led: -lost, text: `Wraiths haunt the passage. ${lost} of the company are lost to them.`, tone: 'bad', sound: 'wraith', mood: 'danger' });
      if (p.company <= 0) return false;
    }
    return true;
  }

  // Barrows have two chambers: an antechamber of wights, which reveals the
  // sigil on the tomb door, and the tomb itself, where a Barrow King keeps
  // the shard. A cleared antechamber stays cleared for that Warden.
  async barrowFlow(p, n) {
    const b = this.s.barrows[n.id];
    const shard = SHARDS.find((s) => s.id === b.shard);
    const You = p.human ? 'You' : 'Ser Vael';
    if (p.looted[n.id]) {
      await this.show(p, { glyph: 'barrow', text: `${n.name} has nothing more for ${p.human ? 'you' : 'Ser Vael'}.`, short: true });
      return;
    }
    let depth = p.depth[n.id] || 0;
    if (depth === 1 && p.shards[b.shard]) {
      p.looted[n.id] = true;
      await this.show(p, { glyph: 'barrow', text: `${n.name} guards the ${shard.name}, which ${p.human ? 'you already carry' : 'Ser Vael already carries'}.`, short: true });
      return;
    }
    let text;
    if (depth === 0) {
      text = b.revealed
        ? `${n.name}. Its tomb holds the ${shard.name}${p.shards[b.shard] ? ', which you already carry, but grave-gold lies in the antechamber' : ''}. Enter the barrow?`
        : `${n.name}. Something old waits inside. Enter the barrow?`;
    } else {
      text = `${n.name}. The antechamber is clear. The ${shard.name} lies in the tomb below. Descend?`;
    }
    const key = await this.ask(p, { kind: 'enterBarrow', node: n.id, depth, glyph: 'barrow', text, options: ['yes', 'no'] });
    if (key !== 'yes') return;
    if (!(await this.barrowPassage(p))) return;
    if (this.fp(p)) return this.barrowFP(p, n, b, shard);

    if (depth === 0) {
      const s1 = this.barrowStrength(n, 0);
      const r1 = await this.battle(p, 'wights', s1, { intro: `Barrow-wights rise in the antechamber of ${n.name}, ${s1} of them!` });
      if (r1 !== 'won') return;
      p.depth[n.id] = depth = 1;
      const firstReveal = !b.revealed;
      b.revealed = true;
      const gold = this.int(3, 7);
      p.coin += gold;
      this.clamp(p);
      if (p.shards[b.shard]) {
        p.looted[n.id] = true;
        await this.show(p, { glyph: b.shard, led: gold, text: `The tomb door bears the sigil of the ${shard.name}, already in ${p.human ? 'your' : 'his'} keeping. ${You} gather${p.human ? '' : 's'} ${gold} coin of grave-gold and leave${p.human ? '' : 's'} the dead in peace.`, tone: 'neutral', sound: 'reveal', mood: 'magic', reveal: firstReveal ? n.id : null });
        return;
      }
      await this.show(p, { glyph: b.shard, led: gold, text: `The tomb door bears the sigil of the ${shard.name}! ${gold} coin of grave-gold lies in the dust.`, tone: 'magic', sound: 'reveal', mood: 'magic', reveal: firstReveal ? n.id : null });
    }

    const s2 = this.barrowStrength(n, 1);
    const go = await this.ask(p, { kind: 'descend', node: n.id, foeLeft: s2, glyph: 'wight', led: s2, text: `The Barrow King guards the ${shard.name}, ${s2} strong. Descend into the tomb?`, options: ['yes', 'no'] });
    if (go !== 'yes') return;
    const r2 = await this.battle(p, 'barrowking', s2, { intro: `The Barrow King rises from his slab!` });
    if (r2 !== 'won') return;
    p.looted[n.id] = true;
    p.shards[b.shard] = true;
    const gold = this.int(4, 9);
    p.coin += gold;
    this.clamp(p);
    await this.show(p, {
      glyph: b.shard, led: this.shardCount(p),
      text: `${p.human ? 'You claim' : 'Ser Vael claims'} the ${shard.name}! ${this.shardCount(p)} of 3, and ${gold} coin besides.`,
      tone: 'magic', sound: 'shard', mood: 'magic', flare: true,
    });
  }

  // First-person barrow: the player walks the passages, and the engine runs
  // the fights when they step into the antechamber or the tomb.
  async barrowFP(p, n, b, shard) {
    for (let guard = 0; guard < 60; guard++) {
      const r = await this.io.explore(p, {
        site: 'barrow', node: n.id, depth: p.depth[n.id] || 0, looted: !!p.looted[n.id],
        shard: b.revealed ? b.shard : null, hasShard: !!p.shards[b.shard],
      });
      if (r === 'leave') {
        await this.show(p, { glyph: 'barrow', text: `You climb back out of ${n.name}.`, short: true });
        return;
      }
      if (r === 'antechamber' && !(p.depth[n.id] >= 1)) {
        const s1 = this.barrowStrength(n, 0);
        const r1 = await this.battle(p, 'wights', s1, { intro: `Barrow-wights rise in the antechamber of ${n.name}, ${s1} of them!` });
        if (r1 === 'lost') return;
        if (r1 !== 'won') continue;
        p.depth[n.id] = 1;
        const firstReveal = !b.revealed;
        b.revealed = true;
        const gold = this.int(3, 7);
        p.coin += gold;
        this.clamp(p);
        if (p.shards[b.shard]) {
          p.looted[n.id] = true;
          await this.show(p, { glyph: b.shard, led: gold, text: `The tomb door bears the sigil of the ${shard.name}, already in your keeping. You gather ${gold} coin of grave-gold.`, tone: 'neutral', sound: 'reveal', mood: 'magic', reveal: firstReveal ? n.id : null });
        } else {
          await this.show(p, { glyph: b.shard, led: gold, text: `The tomb door bears the sigil of the ${shard.name}! ${gold} coin of grave-gold lies in the dust. The tomb lies beyond.`, tone: 'magic', sound: 'reveal', mood: 'magic', reveal: firstReveal ? n.id : null });
        }
        continue;
      }
      if (r === 'tomb' && !p.looted[n.id] && !p.shards[b.shard]) {
        const s2 = this.barrowStrength(n, 1);
        const r2 = await this.battle(p, 'barrowking', s2, { intro: `The Barrow King rises from his slab, worth ${s2} of your company!` });
        if (r2 === 'lost') return;
        if (r2 !== 'won') continue;
        p.looted[n.id] = true;
        p.shards[b.shard] = true;
        const gold = this.int(4, 9);
        p.coin += gold;
        this.clamp(p);
        await this.show(p, {
          glyph: b.shard, led: this.shardCount(p),
          text: `You claim the ${shard.name}! ${this.shardCount(p)} of 3, and ${gold} coin besides. Leave when you are ready.`,
          tone: 'magic', sound: 'shard', mood: 'magic', flare: true,
        });
      }
    }
  }

  // ---------- battles ----------
  async battle(p, foeKind, strength, opts = {}) {
    const foe = FOES[foeKind];
    let left = Math.max(1, strength);
    let bannerUsed = false;
    await this.show(p, { foe: foeKind,
      glyph: foe.glyph, led: left,
      text: opts.intro || `${foe.name}${opts.place ? ` in ${opts.place}` : ''}! Strength ${left}.`,
      tone: 'bad', sound: 'alarm', mood: 'danger',
    });
    let rounds = 0;
    while (rounds++ < 200) {
      const ce = p.company * (p.relics.blade ? 1.33 : 1);
      const key = await this.ask(p, {
        kind: 'battle', foe: foeKind, foeLeft: left, glyph: foe.glyph, led: left, battle: true,
        text: `${foe.name}: ${left}. Your company: ${p.company}. Fight or flee?`,
        options: ['fight', 'flee'],
      });
      if (key === 'flee') {
        p.provisions = Math.max(0, p.provisions - 1);
        let lost = 0;
        if (this.chance(0.4)) { lost = 1; p.company -= 1; }
        await this.show(p, { foe: foeKind,
          glyph: 'retreat', led: lost ? -lost : null,
          text: `${p.human ? 'You fall' : 'Ser Vael falls'} back from the ${foe.name}${lost ? ', losing one in the retreat' : ''}.`,
          tone: 'neutral', sound: 'retreat', mood: 'warn',
        });
        return 'fled';
      }
      const pWin = ce / (ce + left);
      if (this.rand() < pWin) {
        const dmg = Math.max(1, Math.round(ce * (0.2 + this.rand() * 0.15)));
        left = Math.max(0, left - dmg);
        p.stats.foesSlain += dmg;
        if (left <= 0) break;
        await this.show(p, { foe: foeKind, glyph: 'battle', led: left, text: `Your company strikes home: ${dmg} of the foe fall. ${left} remain.`, log: null, tone: 'good', sound: 'hit', mood: 'good', battleTick: true, short: true });
      } else {
        const loss = 1 + (foe.fierce && this.chance(0.25) ? 1 : 0);
        if (p.relics.banner && !bannerUsed) {
          bannerUsed = true;
          await this.show(p, { foe: foeKind, glyph: 'banner', led: p.company, text: 'The line wavers, but the war banner holds it together.', log: null, tone: 'good', sound: 'rally', mood: 'good', battleTick: true, short: true });
        } else {
          p.company = Math.max(0, p.company - loss);
          await this.show(p, { foe: foeKind, glyph: 'wound', led: p.company, text: `The ${foe.name} cut down ${loss}. Your company: ${p.company}.`, log: null, tone: 'bad', sound: 'hurt', mood: 'danger', battleTick: true, short: true });
          if (p.company <= 0) {
            await this.show(p, { foe: foeKind, glyph: 'defeat', text: `${p.human ? 'Your' : "Ser Vael's"} company is broken by the ${foe.name}.`, tone: 'bad', sound: 'defeat', mood: 'danger' });
            return 'lost';
          }
        }
      }
    }
    p.stats.battlesWon++;
    let lootText = '';
    if (foe.loot[1] > 0) {
      const coin = this.int(foe.loot[0], foe.loot[1]);
      p.coin += coin;
      this.clamp(p);
      lootText = ` They leave ${coin} coin behind.`;
    }
    await this.show(p, { foe: foeKind, glyph: 'victory', led: p.company, text: `The ${foe.name} ${foe.singular ? 'is' : 'are'} defeated!${lootText}`, tone: 'good', sound: 'win', mood: 'good' });
    return 'won';
  }

  // ---------- the wilds ----------
  wildsTable(camping) {
    const g = this.s.gloom;
    return [
      ['quiet', camping ? 30 : 20],
      ['brigands', 14],
      ['wolves', 8],
      ['wraith', g >= 4 ? 5 + g / 2 : 0],
      ['hounds', g >= 10 ? 4 + g / 3 : 0],
      ['fog', camping ? 0 : 6],
      ['storm', 6],
      ['fever', 4],
      ['cache', camping ? 3 : 8],
      ['forage', camping ? 0 : 7],
      ['sellswords', 6],
      ['pilgrim', 4],
      ['peddler', 5],
      ['omen', 4],
      ['gloomsurge', 2 + g / 4],
    ];
  }

  async wildsEvent(p, n, camping) {
    const table = this.wildsTable(camping);
    const total = table.reduce((a, [, w]) => a + w, 0);
    let roll = this.rand() * total;
    let ev = 'quiet';
    for (const [id, w] of table) { roll -= w; if (roll <= 0) { ev = id; break; } }
    const You = p.human ? 'You' : 'Ser Vael';
    const your = p.human ? 'your' : "Ser Vael's";
    const g = this.s.gloom;
    const fb = this.chapter.foeBonus;

    switch (ev) {
      case 'quiet':
        await this.show(p, { glyph: 'quiet', text: `${n.name}. The road is quiet.`, sound: 'quiet', mood: 'idle', short: true });
        return;
      case 'brigands': {
        const str = 3 + this.int(0, 5) + Math.floor(g / 2) + fb;
        const toll = Math.min(20, str + 2);
        if (p.coin >= toll) {
          const key = await this.ask(p, { kind: 'toll', foeLeft: str, price: toll, glyph: 'brigands', led: toll, text: `${str} brigands block the road at ${n.name} and demand ${toll} coin. Pay the toll?`, options: ['yes', 'no'] });
          if (key === 'yes') {
            p.coin -= toll;
            await this.show(p, { glyph: 'coin', led: -toll, text: `${You} pay${p.human ? '' : 's'} the brigands ${toll} coin and pass.`, tone: 'neutral', sound: 'coin', mood: 'warn' });
            return;
          }
        }
        await this.battle(p, 'brigands', str, { place: n.name, intro: `${str} brigands spring from cover at ${n.name}!` });
        return;
      }
      case 'wolves': {
        const str = 2 + this.int(0, 4) + Math.floor(g / 3) + fb;
        await this.battle(p, 'wolves', str, { intro: `A pack of ${str} dire wolves runs down ${your} column!` });
        return;
      }
      case 'hounds': {
        const str = 6 + this.int(0, 4) + Math.floor(g / 3) + fb;
        await this.battle(p, 'hounds', str, { intro: `Gloom Hounds pour out of the dark, ${str} of them!` });
        return;
      }
      case 'wraith': {
        if (p.relics.lantern) {
          await this.show(p, { glyph: 'lantern', text: `A wraith rises at ${n.name} and shrinks from ${your} lantern.`, tone: 'good', sound: 'magic', mood: 'magic' });
        } else if (p.ward) {
          p.ward = false;
          await this.show(p, { glyph: 'ward', text: `A wraith rises at ${n.name}. ${p.human ? 'Your' : 'His'} ward flares and breaks, and the wraith is gone.`, tone: 'neutral', sound: 'magic', mood: 'magic' });
        } else {
          const lost = Math.min(p.company, 1 + this.int(0, 2));
          p.company -= lost;
          await this.show(p, { glyph: 'wraith', led: -lost, text: `A wraith passes through ${your} camp. ${lost} never wake.`, tone: 'bad', sound: 'wraith', mood: 'danger' });
        }
        return;
      }
      case 'fog': {
        if (p.relics.map) {
          await this.show(p, { glyph: 'map', text: `Fog rolls over ${n.name}. ${p.human ? 'Your' : 'His'} map keeps the road.`, tone: 'good', sound: 'quiet', mood: 'idle', short: true });
          return;
        }
        const to = this.pick(ADJ[p.node].filter((x) => x !== 'S'));
        const from = p.node;
        p.node = to;
        await this.io.movePawn?.(p, [from, to], { drift: true });
        await this.show(p, { glyph: 'fog', text: `Fog swallows the road. ${You} wander${p.human ? '' : 's'} out at ${NODE_BY_ID[to].name}.`, tone: 'bad', sound: 'fog', mood: 'warn' });
        return;
      }
      case 'storm': {
        let lost = this.int(2, 4);
        if (p.relics.map) lost = Math.ceil(lost / 2);
        lost = Math.min(lost, p.provisions);
        p.provisions -= lost;
        await this.show(p, { glyph: 'storm', led: -lost, text: `A storm tears through ${n.name}. ${lost} provisions are spoiled.`, tone: 'bad', sound: 'storm', mood: 'warn' });
        return;
      }
      case 'fever': {
        if (p.relics.charm) {
          await this.show(p, { glyph: 'charm', text: `Fever stalks ${n.name}, but the hearth charm keeps it from ${your} company.`, tone: 'good', sound: 'magic', mood: 'magic' });
        } else if (p.ward) {
          p.ward = false;
          await this.show(p, { glyph: 'ward', text: 'Fever comes, and the ward takes it instead.', tone: 'neutral', sound: 'magic', mood: 'magic' });
        } else {
          const lost = Math.min(p.company, this.int(1, 3));
          p.company -= lost;
          await this.show(p, { glyph: 'fever', led: -lost, text: `Fever runs through ${your} company. ${lost} are lost.`, tone: 'bad', sound: 'lose', mood: 'danger' });
        }
        return;
      }
      case 'cache': {
        const coin = this.int(6, 14);
        p.coin += coin;
        this.clamp(p);
        await this.show(p, { glyph: 'cache', led: coin, text: `${You} find${p.human ? '' : 's'} a hidden cache: ${coin} coin.`, tone: 'good', sound: 'coin', mood: 'good' });
        return;
      }
      case 'forage': {
        const f = this.int(3, 6);
        p.provisions += f;
        this.clamp(p);
        await this.show(p, { glyph: 'forage', led: f, text: `Good foraging at ${n.name}: ${f} provisions.`, tone: 'good', sound: 'gain', mood: 'good' });
        return;
      }
      case 'sellswords': {
        const k = this.int(2, 4);
        const cost = Math.round(2 * k * this.priceMult());
        const key = await this.ask(p, { kind: 'offer', what: 'company', amount: k, price: cost, glyph: 'sellswords', led: cost, text: `${k} sellswords at ${n.name} offer their blades for ${cost} coin. Hire them?`, options: ['yes', 'no'] });
        if (key === 'yes') {
          if (p.coin < cost) { await this.show(p, { glyph: 'coin', led: p.coin, text: 'Not enough coin. They walk away.', sound: 'deny', tone: 'bad', short: true }); return; }
          p.coin -= cost;
          p.company += k;
          this.clamp(p);
          await this.show(p, { glyph: 'recruit', led: p.company, text: `${k} sellswords join ${p.human ? 'you' : 'Ser Vael'}.`, tone: 'good', sound: 'gain', mood: 'good' });
        }
        return;
      }
      case 'pilgrim': {
        p.ward = true;
        await this.show(p, { glyph: 'pilgrim', text: `A pilgrim shares ${p.human ? 'your' : 'his'} fire and leaves a blessing. ${You} ${p.human ? 'are' : 'is'} warded.`, tone: 'good', sound: 'magic', mood: 'magic' });
        return;
      }
      case 'peddler': {
        const unowned = RELICS.filter((r) => !p.relics[r.id]);
        if (!unowned.length) {
          const f = 4;
          p.provisions += f;
          await this.show(p, { glyph: 'peddler', led: f, text: `A peddler trades ${f} provisions for news.`, tone: 'good', sound: 'gain', short: true });
          return;
        }
        const r = this.pick(unowned);
        const cost = Math.round(r.price * 0.85 * this.priceMult());
        const key = await this.ask(p, { kind: 'offer', what: 'relic', relic: r.id, price: cost, glyph: r.id, led: cost, text: `A peddler offers a ${r.name} for ${cost} coin. ${r.text} Buy it?`, options: ['yes', 'no'] });
        if (key === 'yes') {
          if (p.coin < cost) { await this.show(p, { glyph: 'coin', led: p.coin, text: 'Not enough coin. The peddler shrugs and moves on.', sound: 'deny', tone: 'bad', short: true }); return; }
          p.coin -= cost;
          p.relics[r.id] = true;
          await this.show(p, { glyph: r.id, text: `${You} buy${p.human ? '' : 's'} the ${r.name}.`, tone: 'good', sound: 'relic', mood: 'good' });
        }
        return;
      }
      case 'omen':
        await this.revealBarrow(p, 'omen');
        return;
      case 'gloomsurge':
        this.s.gloom = Math.min(this.s.gloomMax, this.s.gloom + 1);
        await this.show(p, { glyph: 'gloom', led: this.s.gloom, text: `The sky darkens over ${n.name}. Gloom surges to ${this.s.gloom}.`, tone: 'bad', sound: 'pulse', mood: 'gloom', pulse: true });
        await this.checkGloom();
        return;
      default:
    }
  }

  // ---------- the Spire ----------
  async spireFlow(p) {
    if (this.shardCount(p) < 3) {
      const lost = p.ward ? 0 : Math.min(p.company, 1);
      if (p.ward) p.ward = false;
      p.company -= lost;
      await this.show(p, {
        glyph: 'sealed', led: lost ? -lost : null,
        text: `The Spire is sealed to anyone without all three shards. ${lost ? 'Its cold takes one of the company.' : 'The ward shields you from its cold.'}`,
        tone: 'bad', sound: 'deny', mood: 'gloom',
      });
      return;
    }
    if (this.fp(p)) return this.spireFP(p);
    const g = this.s.gloom;
    const fb = this.chapter.foeBonus;
    if (p.spireTier === 0) {
      const str = 10 + Math.floor(g * 0.8) + fb * 2;
      const key = await this.ask(p, { kind: 'ascend', tier: 0, foeLeft: str, glyph: 'sentinels', led: str, text: `Sentinels of stone guard the Spire's gate, ${str} strong. Assault the gate?`, options: ['yes', 'no'] });
      if (key !== 'yes') return;
      const r = await this.battle(p, 'sentinels', str, { intro: 'The Sentinels grind into motion!' });
      if (r !== 'won') return;
      p.spireTier = 1;
      await this.show(p, { glyph: 'spire', text: `${p.human ? 'You hold' : 'Ser Vael holds'} the gate of the Spire.`, tone: 'good', sound: 'win', mood: 'magic', flare: true });
    }
    if (p.spireTier === 1) {
      const str = 13 + Math.floor(g * 0.9) + fb * 2;
      const key = await this.ask(p, { kind: 'ascend', tier: 1, foeLeft: str, glyph: 'ashwarden', led: str, text: `The Ash Warden waits in the hall, worth ${str} men. Climb on?`, options: ['yes', 'no'] });
      if (key !== 'yes') return;
      const r = await this.battle(p, 'ashwarden', str, { intro: 'The Ash Warden draws a sword of fire!' });
      if (r !== 'won') return;
      p.spireTier = 2;
    }
    if (p.spireTier === 2) {
      const len = this.chapter.kindleBase + Math.floor(g / 6);
      const key = await this.ask(p, { kind: 'ascend', tier: 2, glyph: 'kindle', led: len, text: `The crown of the Spire. It will sing the order of kindling, ${len} notes long. Set your shards in the same order. Begin?`, options: ['yes', 'no'] });
      if (key !== 'yes') return;
      await this.kindleRite(p);
    }
  }

  // The crown sings a sequence; the Warden must repeat it on the sockets.
  // Returns 'won', 'refused' or 'lost'.
  async kindleRite(p) {
    const len = this.chapter.kindleBase + Math.floor(this.s.gloom / 6);
    const seq = Array.from({ length: len }, () => this.pick(SHARD_IDS));
    let tries = 0;
    while (tries++ < 20) {
      const ok = this.isHuman(p) ? await this.io.kindle(p, seq) : AI.kindle(this, p, seq);
      if (!this.isHuman(p)) await this.io.aiKindle?.(p, seq, ok);
      if (ok) {
        this.s.over = true;
        this.s.winner = p.id;
        this.s.reason = p.human
          ? 'You kindle the crown. Light floods down the Spire and the Gloom breaks over the Reach. The bards will sing of Hearthmoor.'
          : 'Ser Vael kindles the crown. The Gloom breaks, and the Reach will remember the Warden of Frostvale.';
        await this.show(p, { glyph: 'victory', text: this.s.reason, tone: 'good', sound: p.human ? 'fanfare' : 'defeat', mood: 'victory', flare: true });
        return 'won';
      }
      const lost = Math.min(p.company, 2);
      p.company -= lost;
      await this.show(p, { glyph: 'wound', led: -lost, text: `The crown shrieks at the wrong note. ${lost} of the company are thrown from the parapet.`, tone: 'bad', sound: 'hurt', mood: 'danger' });
      if (p.company <= 0) return 'lost';
      const again = await this.ask(p, { kind: 'kindleRetry', glyph: 'kindle', led: p.company, text: 'Try the kindling again?', options: ['yes', 'no'] });
      if (again !== 'yes') return 'refused';
    }
    return 'refused';
  }

  // First-person Spire: walk the gate hall, the hall of ash and the crown.
  async spireFP(p) {
    const key = await this.ask(p, { kind: 'ascend', tier: p.spireTier, glyph: 'spire', text: `The gate of the Spire stands open to the bearer of three shards. ${['Sentinels guard the gate hall.', 'The gate is yours; the Ash Warden waits above.', 'The way to the crown is open.'][p.spireTier]} Enter?`, options: ['yes', 'no'] });
    if (key !== 'yes') return;
    const g = this.s.gloom;
    const fb = this.chapter.foeBonus;
    for (let guard = 0; guard < 60; guard++) {
      const r = await this.io.explore(p, { site: 'spire', tier: p.spireTier });
      if (r === 'leave') {
        await this.show(p, { glyph: 'spire', text: 'You withdraw from the Spire.', short: true });
        return;
      }
      if (r === 'gate' && p.spireTier === 0) {
        const res = await this.battle(p, 'sentinels', 10 + Math.floor(g * 0.8) + fb * 2, { intro: 'The Sentinels grind into motion!' });
        if (res === 'lost') return;
        if (res === 'won') {
          p.spireTier = 1;
          await this.show(p, { glyph: 'spire', text: 'You hold the gate of the Spire. The stair beyond is open.', tone: 'good', sound: 'win', mood: 'magic', flare: true });
        }
        continue;
      }
      if (r === 'hall' && p.spireTier === 1) {
        const res = await this.battle(p, 'ashwarden', 13 + Math.floor(g * 0.9) + fb * 2, { intro: 'The Ash Warden draws a sword of fire!' });
        if (res === 'lost') return;
        if (res === 'won') {
          p.spireTier = 2;
          await this.show(p, { glyph: 'kindle', text: 'The Ash Warden falls. The last stair climbs to the crown.', tone: 'good', sound: 'win', mood: 'magic', flare: true });
        }
        continue;
      }
      if (r === 'crown' && p.spireTier === 2) {
        const res = await this.kindleRite(p);
        if (res === 'won' || res === 'lost') return;
      }
    }
  }
}

export function serialize(game) {
  return JSON.stringify(game.s);
}
