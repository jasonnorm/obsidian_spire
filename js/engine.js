// Rules engine for Obsidian Spire. No DOM access: everything the player sees
// or decides goes through the `io` object, so the same engine drives the
// browser game and the headless balance simulator.
//
// io contract (all may return promises):
//   io.update(game)                       state changed, redraw
//   io.show(player, evt)                  display an event on the Spire
//   io.ask(player, prompt) -> key         human decision ('yes','no','next','end','fight','flee','haggle');
//                                         a shop prompt's qty may be set before answering 'yes'
//   io.chooseMove(player, options) -> {to} | {stay:true}
//   io.movePawn(player, path, {teleport})
//   io.kindle(player, sequence) -> bool   memory test at the crown
//   io.gameOver(game)

import {
  NODES, NODE_BY_ID, ADJ, DIST, shortestPath, SHARDS, RELICS, RELIC_BY_ID, FOES, PROVINCES,
  START, LIMITS, CHAPTERS, PACE,
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
  // Strengths of the Spire's three guardians.
  spireFoe(tier) {
    const g = this.s.gloom;
    const fb = this.chapter.foeBonus;
    if (tier === 0) return 10 + Math.floor(g * 0.35) + fb * 2;
    if (tier === 1) return 12 + Math.floor(g * 0.4) + fb * 2;
    return 15 + Math.floor(g * 0.45) + fb * 2;
  }

  // The home keep gathers tithes every round while its Warden is away, up to a cap.
  get titheRate() { return PACE.titheRate; }
  get prayEvery() { return PACE.prayEvery; }
  titheDue(p) { return Math.min(PACE.titheCap, PACE.titheRate * (this.s.round - p.lastTithe)); }
  upkeep(p) { return Math.max(1, Math.ceil(p.company / PACE.upkeepPer)); }
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
      // A border on the way stops the ride there until it has been crossed.
      const stop = path.findIndex((id, i) => i > 0 && i < path.length - 1 && NODE_BY_ID[id].type === 'border');
      const leg = stop > 0 ? path.slice(0, stop + 1) : path;
      await this.ride(p, leg);
      if (stop > 0) {
        const res = await this.borderFlow(p, this.node(p));
        if (res === 'across' && !this.s.over && p.company > 0) {
          await this.ride(p, path.slice(stop));
          await this.arrive(p);
        }
      } else {
        await this.arrive(p);
      }
    }
    if (this.s.over) return;
    if (p.company <= 0) { await this.rout(p); return; }
    await this.doUpkeep(p);
    if (p.company <= 0) await this.rout(p);
  }

  async ride(p, path) {
    p.prevNode = path[path.length - 2] ?? p.node;
    await this.io.movePawn?.(p, path);
    p.node = path[path.length - 1];
    p.stats.roads += path.length - 1;
    this.changed();
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
      case 'border': return this.borderFlow(p, n);
      case 'road': return this.wildsEvent(p, n, false, true);
      default: return this.wildsEvent(p, n, false);
    }
  }

  async stayAt(p) {
    const n = this.node(p);
    if (n.type === 'border') {
      await this.show(p, { glyph: 'border', text: `${p.human ? 'You wait' : 'Ser Vael waits'} by ${n.name}.`, sound: 'quiet', mood: 'idle', short: true });
      return;
    }
    if (n.type === 'wilds' || n.type === 'road') {
      const found = this.int(2, 4);
      p.provisions += found;
      this.clamp(p);
      await this.show(p, {
        glyph: 'camp', led: found,
        text: `${p.human ? 'You make' : 'Ser Vael makes'} camp at ${n.name} and forage ${found} provisions.`,
        tone: 'good', sound: 'gain', mood: 'good',
      });
      if (this.chance(0.35)) await this.wildsEvent(p, n, true, n.type === 'road');
      return;
    }
    return this.arrive(p);
  }

  async foreignKeep(p, n) {
    await this.show(p, { glyph: 'keep', text: `The gates of ${n.name} stay shut to a rival Warden.`, tone: 'neutral', sound: 'deny', mood: 'idle' });
  }

  // ---------- haggling ----------
  // `d` is the running deal for one item: { off, tries, closed }, where `off`
  // is the share knocked off the asking price (negative once the seller has
  // put it up). Each try may win 10-16% off, up to 30%, but a seller pushed
  // too often digs in, raises the price, or refuses to deal at all.
  dealPrice(base, d, qty = 1) { return Math.max(1, Math.round(base * qty * (1 - d.off))); }

  async haggle(p, d, base, who) {
    const You = p.human ? 'You' : 'Ser Vael';
    d.tries++;
    const pct = () => (d.off > 0 ? `${Math.round(d.off * 100)}% off` : d.off < 0 ? `${Math.round(-d.off * 100)}% more` : 'the asking price');
    if (d.off < 0.3 && this.chance(0.55 - 0.15 * (d.tries - 1))) {
      d.off = Math.min(0.3, d.off + 0.1 + Math.round(this.rand() * 6) / 100);
      await this.show(p, { glyph: 'coin', led: this.dealPrice(base, d), text: `${You} haggle${p.human ? '' : 's'}. ${who} grumbles and comes down: ${pct()}.`, tone: 'good', sound: 'coin', mood: 'good', short: true });
      return 'down';
    }
    if (this.chance(0.3 + 0.15 * d.tries)) {
      // A first try never ends the deal; after that the seller may walk away.
      if (d.tries >= 3 || (d.tries >= 2 && this.chance(0.45))) {
        d.closed = true;
        await this.show(p, { glyph: 'coin', text: `${who} takes offence and will not deal with ${p.human ? 'you' : 'him'} today.`, tone: 'bad', sound: 'deny', mood: 'warn', short: true });
        return 'closed';
      }
      d.off -= 0.15;
      await this.show(p, { glyph: 'coin', led: this.dealPrice(base, d), text: `${who} takes offence and puts the price up: ${pct()}.`, tone: 'bad', sound: 'deny', mood: 'warn', short: true });
      return 'up';
    }
    await this.show(p, { glyph: 'coin', led: this.dealPrice(base, d), text: d.off >= 0.3 ? `${who} will not go a copper lower.` : `${who} will not budge.`, tone: 'neutral', sound: 'deny', mood: 'idle', short: true });
    return 'same';
  }

  // A device-style shop: the Spire shows one item at a time. Men and
  // provisions can be bought several at once (the prompt's qty, set by the
  // player or the rival before YES), and anything can be haggled over except
  // at a Warden's own keep.
  async shopLoop(p, n, goods, intro, { haggle = true, who = 'The merchant' } = {}) {
    await this.show(p, { glyph: intro.glyph, text: intro.text, sound: intro.sound || 'market', mood: 'good', short: true });
    if (!goods.length) return;
    const deals = goods.map(() => ({ off: 0, tries: 0, closed: false }));
    let i = 0;
    let guard = 0;
    while (guard++ < 400) {
      const g = goods[i];
      const d = deals[i];
      const owned = g.relic && p.relics[g.relic];
      const per = g.company || g.provisions || 1;
      const room = g.company ? LIMITS.company - p.company : g.provisions ? LIMITS.provisions - p.provisions : 1;
      let qtyMax = 1;
      if (!g.relic) {
        qtyMax = Math.floor(room / per);
        while (qtyMax > 1 && this.dealPrice(g.price, d, qtyMax) > p.coin) qtyMax--;
        qtyMax = Math.max(1, qtyMax);
      }
      const price = this.dealPrice(g.price, d);
      const open = !owned && !d.closed;
      const each = g.relic ? '' : g.company ? ' a head' : ' a sack';
      const was = d.off > 0 ? `, ${Math.round(d.off * 100)}% off` : d.off < 0 ? `, ${Math.round(-d.off * 100)}% dearer` : '';
      const prompt = {
        kind: 'shop', item: g, price, base: g.price, off: d.off, place: n.id, haggles: d.tries,
        qty: Math.min(d.qty || 1, qtyMax), qtyMax: open ? qtyMax : 0, unit: per, unitName: g.company ? 'men' : g.provisions ? 'provisions' : '',
        glyph: g.glyph, led: price,
        text: owned ? `${g.name}: you already carry one.`
          : d.closed ? `${g.name}: ${who.toLowerCase()} will not sell to you today.`
            : `${g.name}: ${g.price} coin${each}${was}. ${g.blurb}`,
        options: open ? ['yes', ...(haggle && d.tries < 3 ? ['haggle'] : []), 'next', 'end'] : ['next', 'end'],
      };
      const key = await this.ask(p, prompt);
      if (key === 'end') break;
      if (key === 'next' || key === 'no') { i = (i + 1) % goods.length; continue; }
      if (key === 'haggle') {
        // Haggle over the order as it stands; the quantity carries over.
        d.qty = prompt.qty;
        await this.haggle(p, d, g.price, who);
        continue;
      }
      if (key !== 'yes') continue;
      if (owned) { await this.show(p, { glyph: g.glyph, text: 'You already carry one.', sound: 'deny', short: true }); continue; }
      const qty = Math.max(1, Math.min(qtyMax, Math.floor(Number(prompt.qty) || 1)));
      const cost = this.dealPrice(g.price, d, qty);
      if (p.coin < cost) { await this.show(p, { glyph: 'coin', led: p.coin, text: `Not enough coin. You hold ${p.coin}.`, tone: 'bad', sound: 'deny', short: true }); continue; }
      p.coin -= cost;
      if (g.company) p.company += g.company * qty;
      if (g.provisions) p.provisions += g.provisions * qty;
      if (g.relic) p.relics[g.relic] = true;
      this.clamp(p);
      const n1 = g.company * qty;
      const what = g.company ? `${p.human ? 'You hire' : 'Ser Vael hires'} ${n1 === 1 ? 'a' : n1} ${n1 === 1 ? g.unit : g.units || `${g.unit}s`}`
        : g.provisions ? `${p.human ? 'You buy' : 'Ser Vael buys'} ${g.provisions * qty} provisions`
          : `${p.human ? 'You buy' : 'Ser Vael buys'} the ${g.name}`;
      await this.show(p, {
        glyph: g.glyph, led: g.company ? p.company : g.provisions ? p.provisions : cost,
        text: `${what} for ${cost} coin.`, tone: 'good', sound: g.relic ? 'relic' : 'coin', mood: 'good', short: true,
      });
    }
  }

  staples(rate) {
    const m = this.priceMult();
    return [
      { kind: 'company', name: rate.unitName, unit: rate.unit, units: rate.units, glyph: 'sellswords', price: Math.round(rate.company * m), company: 1, blurb: 'One more blade for your company.' },
      { kind: 'provisions', name: 'Provisions', glyph: 'provisions', price: Math.round(rate.provisions * m), provisions: 5, blurb: `Five to a sack. Your company eats ${'{upkeep}'} a day.` },
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
    const goods = this.staples({ unitName: 'Men-at-arms', unit: 'man-at-arms', units: 'men-at-arms', company: 2, provisions: 3 })
      .map((g) => ({ ...g, blurb: g.blurb.replace('{upkeep}', this.upkeep(p)), glyph: g.kind === 'company' ? 'recruit' : g.glyph, name: g.kind === 'company' ? 'Men-at-arms' : g.name }));
    await this.shopLoop(p, n, goods, { glyph: 'keep', text: `${n.name}. Home. Men-at-arms and stores are cheaper here, at cost.`, sound: 'home' }, { haggle: false });
  }

  async marketFlow(p, n) {
    const m = this.priceMult();
    const goods = this.staples({ unitName: 'Sellswords', unit: 'sellsword', units: 'sellswords', company: 3, provisions: 4 })
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
    if (this.s.round - p.lastPray >= PACE.prayEvery) {
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
  // Men lost when the foe wins an exchange. A foe hits back in proportion to
  // its strength (about one man for every six points still standing), so a
  // big host is dangerous even to a big company.
  foeBite(foe, left) {
    let loss = Math.max(1, Math.floor(left / 6 + this.rand()));
    if (foe.breath) loss += 1 + (this.chance(0.2) ? 1 : 0);
    else if (foe.venom && this.chance(0.35)) loss += 1;
    else if (foe.fierce && this.chance(0.25)) loss += 1;
    return loss;
  }

  async battle(p, foeKind, strength, opts = {}) {
    const foe = FOES[foeKind];
    let left = Math.max(1, strength);
    let bannerUsed = false;
    const before = p.company;
    const coinBefore = p.coin;
    const You = p.human ? 'You' : 'Ser Vael';
    await this.show(p, { foe: foeKind,
      glyph: foe.glyph, led: left,
      text: opts.intro || `${foe.name}${opts.place ? ` in ${opts.place}` : ''}! Strength ${left}.`,
      tone: 'bad', sound: opts.sound || 'alarm', mood: 'danger',
    });
    // What happened in the last exchange stays on the Fight-or-Flee prompt,
    // so it can be read while the choice is made.
    let last = '';
    let rounds = 0;
    while (rounds++ < 200) {
      const ce = p.company * (p.relics.blade ? 1.33 : 1);
      const key = await this.ask(p, {
        kind: 'battle', foe: foeKind, foeLeft: left, glyph: foe.glyph, led: left, battle: true,
        text: `${last ? `${last} ` : ''}${foe.name}: ${left}. ${p.human ? 'Your' : 'His'} company: ${p.company}. Fight or flee?`,
        options: ['fight', 'flee'],
      });
      if (key === 'flee') {
        p.provisions = Math.max(0, p.provisions - 1);
        if (this.chance(0.4)) p.company -= 1;
        const lost = before - p.company;
        await this.show(p, { foe: foeKind,
          glyph: 'retreat', led: lost ? -lost : null,
          text: `${You} fall${p.human ? '' : 's'} back from the ${foe.name}. ${this.lossText(p, lost)}`,
          tone: 'neutral', sound: 'retreat', mood: 'warn', hold: true,
        });
        return 'fled';
      }
      const pWin = ce / (ce + left);
      if (this.rand() < pWin) {
        let dmg = Math.max(1, Math.round(ce * (0.2 + this.rand() * 0.15)));
        if (foe.armored) dmg = Math.max(1, Math.round(dmg * 0.6));
        dmg = Math.min(dmg, left);
        left -= dmg;
        p.stats.foesSlain += dmg;
        if (left <= 0) break;
        last = foe.armored
          ? `Blades skid on their shells: only ${dmg} fall.`
          : `${p.human ? 'You strike' : 'He strikes'} home: ${dmg} fall.`;
        await this.show(p, { foe: foeKind, glyph: 'battle', led: left, text: `${last} ${left} remain${left === 1 ? 's' : ''}.`, log: null, tone: 'good', sound: 'hit', mood: 'good', battleTick: true, short: true });
      } else {
        const loss = this.foeBite(foe, left);
        // Trolls heal and imps rob, whether or not the banner holds the line.
        let extra = '';
        if (foe.regen && left < strength) { left += 1; extra += ' Its wounds knit.'; }
        if (foe.thief && p.coin > 0) { const st = Math.min(p.coin, this.int(2, 4)); p.coin -= st; extra += ` The imps snatch ${st} coin.`; }
        if (p.relics.banner && !bannerUsed) {
          bannerUsed = true;
          last = `The line wavers, but the war banner holds it.${extra}`;
          await this.show(p, { foe: foeKind, glyph: 'banner', led: p.company, text: last, log: null, tone: 'good', sound: 'rally', mood: 'good', battleTick: true, short: true });
        } else {
          const took = Math.min(p.company, loss);
          p.company -= took;
          if (foe.breath) {
            last = `Dragonfire rolls over the line: ${took} burn.${extra}`;
            await this.show(p, { foe: foeKind, glyph: 'dragon', breath: true, led: p.company, text: last, log: null, tone: 'bad', sound: 'fire', mood: 'danger', battleTick: true, short: true });
          } else {
            last = `The ${foe.name} ${foe.singular ? 'cuts' : foe.venom ? 'bite' : 'cut'} down ${took}${foe.venom && took > 1 ? ', venom taking the last' : ''}.${extra}`;
            await this.show(p, { foe: foeKind, glyph: 'wound', led: p.company, text: last, log: null, tone: 'bad', sound: 'hurt', mood: 'danger', battleTick: true, short: true });
          }
          if (p.company <= 0) {
            await this.show(p, { foe: foeKind, glyph: 'defeat', text: `${p.human ? 'Your' : "Ser Vael's"} company is broken by the ${foe.name}. All ${before} are lost.`, tone: 'bad', sound: 'defeat', mood: 'danger', hold: true });
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
      lootText = ` ${foe.singular ? 'It leaves' : 'They leave'} ${coin} coin behind.`;
    }
    const robbed = coinBefore - p.coin;
    const robText = foe.thief && robbed > 0 ? ` The imps got away with ${robbed} coin.` : '';
    await this.show(p, {
      foe: foeKind, glyph: 'victory', led: p.company,
      text: `The ${foe.name} ${foe.singular ? 'is' : 'are'} defeated! ${this.lossText(p, before - p.company)}${lootText}${robText}`,
      tone: 'good', sound: 'win', mood: 'good', hold: true,
    });
    return 'won';
  }

  // "You lost 3 men; 9 remain." for battle results.
  lossText(p, lost) {
    if (lost <= 0) return `Not one of ${p.human ? 'your' : 'his'} company fell.`;
    return `${p.human ? 'You' : 'He'} lost ${lost} ${lost === 1 ? 'man' : 'men'}; ${p.company} remain${p.company === 1 ? 's' : ''}.`;
  }

  // ---------- the wilds ----------
  // `road` is a halfway space on a road: mostly quiet, rarely a Gloom surge.
  wildsTable(camping, node, road = false) {
    const g = this.s.gloom;
    const terrain = node && node.wedge >= 0 ? PROVINCES[node.wedge].terrain : null;
    const HOME = { marsh: 'troll', forest: 'spiders', volcanic: 'imps', snow: 'ogre', desert: 'scorpions' };
    // A Warden's own marchers keep the beasts down in his home province.
    const patrolled = node && this.s.players.some((q) => NODE_BY_ID[q.home].wedge === node.wedge);
    const beasts = ['troll', 'spiders', 'imps', 'ogre', 'scorpions'].map((b) => [b, HOME[terrain] === b && !patrolled ? 9 : 1.5]);
    return [
      ['quiet', road ? 48 : camping ? 30 : 20],
      ['brigands', 11],
      ['wolves', 6],
      ...beasts,
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
      ['gloomsurge', road ? 0.5 : 2 + g / 4],
    ];
  }

  async wildsEvent(p, n, camping, road = false) {
    const table = this.wildsTable(camping, n, road);
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
      case 'troll': {
        const str = 5 + this.int(0, 3) + Math.floor(g / 2) + fb;
        await this.battle(p, 'troll', str, { intro: `A Bog Troll heaves itself out of the mire at ${n.name}, worth ${str} men! Its wounds close as fast as you make them.` });
        return;
      }
      case 'spiders': {
        const str = 3 + this.int(0, 4) + Math.floor(g / 2) + fb;
        await this.battle(p, 'spiders', str, { intro: `Giant spiders drop on silk lines at ${n.name}, ${str} strong! Their bite is venomous.` });
        return;
      }
      case 'imps': {
        const str = 4 + this.int(0, 4) + Math.floor(g / 2) + fb;
        await this.battle(p, 'imps', str, { intro: `Cinder imps pour out of a smoking vent at ${n.name}, ${str} of them, grabbing at purses!` });
        return;
      }
      case 'ogre': {
        const str = 7 + this.int(0, 3) + Math.floor(g / 2) + fb;
        await this.battle(p, 'ogre', str, { intro: `A Frost Ogre blocks the road at ${n.name}, worth ${str} men!` });
        return;
      }
      case 'scorpions': {
        const str = 3 + this.int(0, 3) + Math.floor(g / 2) + fb;
        await this.battle(p, 'scorpions', str, { intro: `Dune scorpions burst from the sand at ${n.name}, ${str} strong! Their shells turn blades.` });
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
        const base = Math.round(2 * k * this.priceMult());
        const d = { off: 0, tries: 0, closed: false };
        for (let guard = 0; guard < 8; guard++) {
          d.price = this.dealPrice(base, d);
          const key = await this.ask(p, { kind: 'offer', what: 'company', amount: k, price: d.price, base, haggles: d.tries, glyph: 'sellswords', led: d.price, text: `${k} sellswords at ${n.name} offer their blades for ${d.price} coin${d.price !== base ? ` (asked ${base})` : ''}. Hire them?`, options: d.tries < 3 ? ['yes', 'haggle', 'no'] : ['yes', 'no'] });
          if (key === 'haggle') {
            if ((await this.haggle(p, d, base, 'Their captain')) === 'closed') return;
            continue;
          }
          if (key !== 'yes') return;
          if (p.coin < d.price) { await this.show(p, { glyph: 'coin', led: p.coin, text: 'Not enough coin. They walk away.', sound: 'deny', tone: 'bad', short: true }); return; }
          p.coin -= d.price;
          p.company += k;
          this.clamp(p);
          await this.show(p, { glyph: 'recruit', led: p.company, text: `${k} sellswords join ${p.human ? 'you' : 'Ser Vael'} for ${d.price} coin.`, tone: 'good', sound: 'gain', mood: 'good' });
          return;
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
        const base = Math.round(r.price * 0.85 * this.priceMult());
        const d = { off: 0, tries: 0, closed: false };
        for (let guard = 0; guard < 8; guard++) {
          d.price = this.dealPrice(base, d);
          const key = await this.ask(p, { kind: 'offer', what: 'relic', relic: r.id, price: d.price, base, haggles: d.tries, glyph: r.id, led: d.price, text: `A peddler offers a ${r.name} for ${d.price} coin${d.price !== base ? ` (asked ${base})` : ''}. ${r.text} Buy it?`, options: d.tries < 3 ? ['yes', 'haggle', 'no'] : ['yes', 'no'] });
          if (key === 'haggle') {
            if ((await this.haggle(p, d, base, 'The peddler')) === 'closed') return;
            continue;
          }
          if (key !== 'yes') return;
          if (p.coin < d.price) { await this.show(p, { glyph: 'coin', led: p.coin, text: 'Not enough coin. The peddler shrugs and moves on.', sound: 'deny', tone: 'bad', short: true }); return; }
          p.coin -= d.price;
          p.relics[r.id] = true;
          await this.show(p, { glyph: r.id, text: `${You} buy${p.human ? '' : 's'} the ${r.name} for ${d.price} coin.`, tone: 'good', sound: 'relic', mood: 'good' });
          return;
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

  // ---------- border crossings ----------
  // Every road from one province into the next has a crossing held by that
  // march's garrison. A Warden's own marchers let him through; anywhere else
  // he pays the toll, forces the crossing, or takes the wild way round and
  // risks the land itself.
  borderInfo(p, n) {
    const g = this.s.gloom;
    const fb = this.chapter.foeBonus;
    const homeWedge = (q) => NODE_BY_ID[q.home].wedge;
    const prev = p.prevNode ? NODE_BY_ID[p.prevNode] : null;
    const into = prev && prev.wedge === n.wedges[0] ? n.wedges[1] : prev && prev.wedge === n.wedges[1] ? n.wedges[0] : n.wedges[1];
    const own = n.wedges.includes(homeWedge(p));
    const rivals = n.wedges.includes(homeWedge(this.other(p)));
    const toll = Math.round((4 + Math.floor(g / 3) + fb) * (rivals ? 1.5 : 1) * this.priceMult());
    const str = 4 + Math.floor(g / 2) + fb + (rivals ? 3 : 0);
    return { into, own, rivals, toll, str };
  }

  async borderFlow(p, n) {
    const { into, own, rivals, toll } = this.borderInfo(p, n);
    const dest = PROVINCES[into];
    const You = p.human ? 'You' : 'Ser Vael';
    if (own) {
      await this.show(p, { glyph: 'border', text: `${n.name}. ${p.human ? 'Your' : 'His'} own marchers wave ${p.human ? 'you' : 'him'} through into ${dest.name}.`, tone: 'good', sound: 'home', mood: 'good', short: true });
      return 'across';
    }
    const str = this.borderInfo(p, n).str + this.int(0, 3);
    const holders = rivals ? `${p.human ? "Ser Vael's" : "Hearthmoor's"} marchers` : 'Marchers';
    const d = { off: 0, tries: 0, closed: false };
    let key;
    for (let guard = 0; guard < 8; guard++) {
      d.price = this.dealPrice(toll, d);
      const canPay = !d.closed && p.coin >= d.price;
      key = await this.ask(p, {
        kind: 'border', node: n.id, toll: d.price, base: toll, haggles: d.tries, foeLeft: str, foe: 'marchers', rivals, canPay,
        glyph: 'marchers', led: d.price, price: d.price,
        text: `${n.name}. ${holders}, ${str} strong, hold the way into ${dest.name}${canPay ? ` and want ${d.price} coin` : d.closed ? ' and will take no coin from you' : ''}. ${canPay ? 'YES pays, ' : ''}FIGHT forces it, NO takes the wild way.`,
        options: canPay ? ['yes', ...(d.tries < 3 ? ['haggle'] : []), 'fight', 'no'] : ['fight', 'no'],
      });
      if (key !== 'haggle') break;
      await this.haggle(p, d, toll, 'The marcher captain');
    }
    if (key === 'yes') {
      p.coin -= d.price;
      await this.show(p, { glyph: 'coin', led: -d.price, text: `${You} pay${p.human ? '' : 's'} ${d.price} coin at ${n.name} and cross into ${dest.name}.`, tone: 'neutral', sound: 'coin', mood: 'idle', short: true });
      return 'across';
    }
    if (key === 'fight') {
      const r = await this.battle(p, 'marchers', str, { intro: `${You} force${p.human ? '' : 's'} the crossing at ${n.name}! ${str} marchers close the way.` });
      if (r === 'won') return 'across';
      if (r === 'fled') await this.turnBack(p, n);
      return 'back';
    }
    return this.wildWay(p, n, dest);
  }

  // Around the garrison by the wild way. The land itself takes its toll,
  // unless the cartographer's map knows the smugglers' paths.
  async wildWay(p, n, dest) {
    const You = p.human ? 'You' : 'Ser Vael';
    if (p.relics.map) {
      await this.show(p, { glyph: 'map', text: `${p.human ? 'Your' : 'His'} map knows the smugglers' way round ${n.name}. ${You} slip${p.human ? '' : 's'} into ${dest.name} unseen.`, tone: 'good', sound: 'quiet', mood: 'good' });
      return 'across';
    }
    if (this.chance(0.3)) {
      await this.show(p, { glyph: 'border', text: `${You} find${p.human ? '' : 's'} a way round ${n.name} and cross into ${dest.name} unharmed.`, tone: 'good', sound: 'quiet', mood: 'idle' });
      return 'across';
    }
    const g = this.s.gloom;
    let men = Math.min(p.company, this.int(1, 3) + Math.floor(g / 8));
    let food = 0;
    let text;
    switch (dest.terrain) {
      case 'marsh':
        men = Math.max(1, men - 1);
        food = this.int(2, 4);
        text = `The tide floods the flats on the wild way. ${food} provisions spoil and ${men} of the company drown.`;
        break;
      case 'volcanic':
        text = `Ash vents flare along the wild way into ${dest.name}. ${men} of the company are burned.`;
        break;
      case 'snow':
        text = `Snow buries the wild way into ${dest.name}. ${men} of the company freeze in the drifts.`;
        break;
      case 'forest':
        men = Math.max(1, men - 1);
        food = this.int(2, 4);
        text = `The thorns close round the wild way. ${men} of the company are lost in them and ${food} provisions are left behind.`;
        break;
      case 'desert':
        food = this.int(2, 4);
        men = Math.max(1, men - 1);
        text = `The dunes on the wild way drink ${food} provisions, and ${men} of the company fall to the heat.`;
        break;
      default:
        text = `The wild way into ${dest.name} crosses a black bog. ${men} of the company are lost in the mire.`;
    }
    men = Math.min(p.company, men);
    p.company -= men;
    p.provisions = Math.max(0, p.provisions - food);
    await this.show(p, { glyph: 'wound', led: -men, text, tone: 'bad', sound: 'lose', mood: 'danger', hold: true });
    return p.company > 0 ? 'across' : 'lost';
  }

  // Driven back from a crossing: return to the space the Warden came from.
  async turnBack(p, n) {
    const back = p.prevNode && n.ends.includes(p.prevNode) ? p.prevNode : n.ends[0];
    p.prevNode = n.id;
    await this.io.movePawn?.(p, [n.id, back]);
    p.node = back;
    this.changed();
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
    const You = p.human ? 'You' : 'Ser Vael';
    if (p.spireTier === 0) {
      const str = this.spireFoe(0);
      const all = [0, 1, 2].map((t) => this.spireFoe(t));
      const key = await this.ask(p, { kind: 'ascend', tier: 0, foeLeft: str, glyph: 'sentinels', led: str, text: `Guardians: Sentinels ${str}, Ash Warden ${all[1]}, Dragon ${all[2]}. Turn back and all rise again. Assault the gate?`, options: ['yes', 'no'] });
      if (key !== 'yes') return;
      const r = await this.battle(p, 'sentinels', str, { intro: 'The Sentinels grind into motion!' });
      if (r !== 'won') return;
      p.spireTier = 1;
      await this.show(p, { glyph: 'spire', text: `${p.human ? 'You hold' : 'Ser Vael holds'} the gate of the Spire.`, tone: 'good', sound: 'win', mood: 'magic', flare: true });
    }
    if (p.spireTier === 1) {
      const str = this.spireFoe(1);
      const key = await this.ask(p, { kind: 'ascend', tier: 1, foeLeft: str, glyph: 'ashwarden', led: str, text: `Ash Warden: ${str}. ${p.human ? 'Your' : 'His'} company: ${p.company}. Climb on? Turning back undoes the climb.`, options: ['yes', 'no'] });
      if (key !== 'yes') return this.spireRetreat(p);
      const r = await this.battle(p, 'ashwarden', str, { intro: 'The Ash Warden draws a sword of fire!' });
      if (r === 'fled') return this.spireRetreat(p);
      if (r !== 'won') return;
      p.spireTier = 2;
      await this.show(p, { glyph: 'dragon', text: 'The Ash Warden falls. Above the hall, something vast stirs on the crown.', tone: 'neutral', sound: 'roar', mood: 'danger' });
    }
    if (p.spireTier === 2) {
      const str = this.spireFoe(2);
      const key = await this.ask(p, { kind: 'ascend', tier: 2, foeLeft: str, glyph: 'dragon', led: str, text: `Crown Dragon: ${str}, breathing fire. ${p.human ? 'Your' : 'His'} company: ${p.company}. Face it? Turning back undoes the climb.`, options: ['yes', 'no'] });
      if (key !== 'yes') return this.spireRetreat(p);
      const r = await this.battle(p, 'dragon', str, { intro: 'The Crown Dragon spreads its wings and roars!', sound: 'roar' });
      if (r === 'fled') return this.spireRetreat(p);
      if (r !== 'won') return;
      p.spireTier = 3;
      await this.show(p, { glyph: 'kindle', text: `The dragon crashes across the parapet and is still. ${You} stand${p.human ? '' : 's'} alone before the crown.`, tone: 'good', sound: 'win', mood: 'magic', flare: true });
    }
    if (p.spireTier === 3) {
      const len = this.chapter.kindleBase + Math.floor(g / 6);
      const key = await this.ask(p, { kind: 'ascend', tier: 3, glyph: 'kindle', led: len, text: `The crown of the Spire. It will sing the order of kindling, ${len} notes long. Set your shards in the same order. Begin?`, options: ['yes', 'no'] });
      if (key !== 'yes') return;
      await this.kindleRite(p);
    }
  }

  // Leaving the Spire before the dragon falls: the guardians re-form, and the
  // next climb starts again at the gate.
  async spireRetreat(p) {
    if (p.spireTier <= 0 || p.spireTier >= 3) return;
    p.spireTier = 0;
    await this.show(p, {
      glyph: 'sentinels',
      text: p.human
        ? 'You turn back. Behind you the Sentinels haul themselves up from the rubble, and the halls of the Spire fill again.'
        : 'Ser Vael turns back from the Spire, and its guardians rise again behind him.',
      tone: 'bad', sound: 'deny', mood: 'gloom', hold: true,
    });
  }

  // The crown sings a sequence; the Warden must repeat it on the sockets.
  // Returns 'won', 'refused' or 'lost'.
  async kindleRite(p) {
    const len = this.chapter.kindleBase + Math.floor(this.s.gloom / 6);
    let tries = 0;
    while (tries++ < 20) {
      // The crown sings a fresh order every time.
      const seq = Array.from({ length: len }, () => this.pick(SHARD_IDS));
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
      const lost = Math.min(p.company, 3);
      p.company -= lost;
      await this.show(p, { glyph: 'wound', led: -lost, text: `The crown shrieks at the wrong note. ${lost} of the company are thrown from the parapet.`, tone: 'bad', sound: 'hurt', mood: 'danger' });
      if (p.company <= 0) return 'lost';
      const again = await this.ask(p, { kind: 'kindleRetry', glyph: 'kindle', led: p.company, text: `Try again? The crown will sing a new order, ${len} notes long.`, options: ['yes', 'no'] });
      if (again !== 'yes') return 'refused';
    }
    return 'refused';
  }

  // First-person Spire: walk the gate hall, the hall of ash and the crown.
  async spireFP(p) {
    const key = await this.ask(p, { kind: 'ascend', tier: p.spireTier, glyph: 'spire', text: p.spireTier === 0
      ? `The Spire's gate opens. Guardians: Sentinels ${this.spireFoe(0)}, Ash Warden ${this.spireFoe(1)}, Dragon ${this.spireFoe(2)}. Leave early and all rise again. Enter?`
      : `The gate of the Spire stands open to you. ${['', 'The Ash Warden waits above.', 'The Crown Dragon waits at the peak.', 'The way to the crown is open.'][p.spireTier]} Enter?`, options: ['yes', 'no'] });
    if (key !== 'yes') return;
    for (let guard = 0; guard < 60; guard++) {
      const r = await this.io.explore(p, { site: 'spire', tier: p.spireTier });
      if (r === 'leave') {
        if (p.spireTier > 0 && p.spireTier < 3) return this.spireRetreat(p);
        await this.show(p, { glyph: 'spire', text: 'You withdraw from the Spire.', short: true });
        return;
      }
      if (r === 'gate' && p.spireTier === 0) {
        const res = await this.battle(p, 'sentinels', this.spireFoe(0), { intro: 'The Sentinels grind into motion!' });
        if (res === 'lost') return;
        if (res === 'won') {
          p.spireTier = 1;
          await this.show(p, { glyph: 'spire', text: 'You hold the gate of the Spire. The stair beyond is open.', tone: 'good', sound: 'win', mood: 'magic', flare: true });
        }
        continue;
      }
      if (r === 'hall' && p.spireTier === 1) {
        const res = await this.battle(p, 'ashwarden', this.spireFoe(1), { intro: 'The Ash Warden draws a sword of fire!' });
        if (res === 'lost') return;
        if (res === 'won') {
          p.spireTier = 2;
          await this.show(p, { glyph: 'dragon', text: 'The Ash Warden falls. The last stair climbs to the crown, and something vast stirs up there.', tone: 'neutral', sound: 'roar', mood: 'danger' });
        }
        continue;
      }
      if (r === 'dragon' && p.spireTier === 2) {
        const str = this.spireFoe(2);
        const res = await this.battle(p, 'dragon', str, { intro: `The Crown Dragon uncoils from the crown, worth ${str} of your company!`, sound: 'roar' });
        if (res === 'lost') return;
        if (res === 'won') {
          p.spireTier = 3;
          await this.show(p, { glyph: 'kindle', text: 'The dragon crashes across the floor and is still. The crown is yours to kindle.', tone: 'good', sound: 'win', mood: 'magic', flare: true });
        }
        continue;
      }
      if (r === 'crown' && p.spireTier === 3) {
        const res = await this.kindleRite(p);
        if (res === 'won' || res === 'lost') return;
      }
    }
  }
}

export function serialize(game) {
  return JSON.stringify(game.s);
}
