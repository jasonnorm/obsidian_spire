// Detailed balance check: where games are won and lost.
// Usage: node tools/sim-detail.mjs [gamesPerChapter] [humanSkill]
import { Game, newState } from '../js/engine.js';
import { CHAPTERS } from '../js/data.js';

const N = Number(process.argv[2] || 300);
const humanSkill = Number(process.argv[3] || 0.85);

for (let ch = 0; ch < CHAPTERS.length; ch++) {
  const t = { hunger: 0, wildLoss: 0, wild: 0, paid: 0, forced: 0, borders: 0, routCause: {}, p: 0, r: 0, spire: 0, climbs: 0, climbWins: 0, climbCompany: 0, climbGloom: 0, threeShards: 0, threeRound: 0, routs: 0, battles: 0, battleLoss: 0, peak: 0, spireFled: 0 };
  for (let i = 0; i < N; i++) {
    const s = newState(ch, 1000 + i * 7919 + ch);
    s.players[0].skill = humanSkill;
    const g = new Game(s, {}, { allAI: true });
    const origEnd = g.endRound.bind(g);
    g.endRound = async () => { await origEnd(); if (g.s.round > 200) { g.s.over = true; g.s.winner = 'stuck'; } };
    const seen3 = new Set();
    const origBattle = g.battle.bind(g);
    g.battle = async (p, kind, str, opts) => {
      const before = p.company;
      if (kind === 'sentinels') { t.climbs++; t.climbCompany += before; t.climbGloom += g.s.gloom; }
      const r = await origBattle(p, kind, str, opts);
      t.battles++; t.battleLoss += before - p.company;
      if (kind === 'dragon' && r === 'won') t.climbWins++;
      if (['sentinels', 'ashwarden', 'dragon'].includes(kind) && r === 'fled') t.spireFled++;
      return r;
    };
    const origAsk = g.ask.bind(g);
    g.ask = async (p, prompt) => {
      const k = await origAsk(p, prompt);
      if (prompt.kind === 'border') { t.borders++; if (k === 'yes') t.paid++; else if (k === 'fight') t.forced++; else t.wild++; }
      return k;
    };
    let lastBad = 'other';
    const origShow = g.show.bind(g);
    g.show = async (p, evt) => {
      if (evt.glyph === 'hunger') { t.hunger++; lastBad = 'hunger'; }
      if (evt.glyph === 'wound' && /wild way/.test(evt.text || '')) { t.wildLoss -= evt.led || 0; lastBad = 'wild way'; }
      if (evt.foe) lastBad = evt.foe;
      if (evt.glyph === 'rout') t.routCause[lastBad] = (t.routCause[lastBad] || 0) + 1;
      for (const q of g.s.players) {
        t.peak = Math.max(t.peak, q.company);
        if (!seen3.has(q.id) && g.shardCount(q) === 3) { seen3.add(q.id); t.threeShards++; t.threeRound += g.s.round; }
      }
      return origShow(p, evt);
    };
    await g.run();
    t[g.s.winner] = (t[g.s.winner] || 0) + 1;
    t.routs += g.s.players[0].stats.routs + g.s.players[1].stats.routs;
  }
  const f = (x) => x.toFixed(1);
  console.log(`Ch${ch + 1}: player ${f(100 * t.p / N)}% rival ${f(100 * t.r / N)}% spire ${f(100 * t.spire / N)}% | 3 shards by r${f(t.threeRound / Math.max(1, t.threeShards))} (${f(t.threeShards / N)} Wardens/game)` +
    ` | climbs/game ${f(t.climbs / N)}, company ${f(t.climbCompany / Math.max(1, t.climbs))}, gloom ${f(t.climbGloom / Math.max(1, t.climbs))}, crowned ${f(100 * t.climbWins / Math.max(1, t.climbs))}%, fled ${t.spireFled}` +
    ` | routs/game ${(t.routs / N).toFixed(2)}, avg battle loss ${(t.battleLoss / Math.max(1, t.battles)).toFixed(2)}`);
  console.log(`     borders/game ${f(t.borders / N)} (paid ${f(100 * t.paid / Math.max(1, t.borders))}%, forced ${f(100 * t.forced / Math.max(1, t.borders))}%, wild ${f(100 * t.wild / Math.max(1, t.borders))}%, wild-way losses/game ${f(t.wildLoss / N)}) | hunger/game ${f(t.hunger / N)} | rout causes ${JSON.stringify(t.routCause)}`);
}
