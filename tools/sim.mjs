// Headless balance check: the computer plays both seats.
// Usage: node tools/sim.mjs [gamesPerChapter] [humanSkill]
import { Game, newState } from '../js/engine.js';
import { CHAPTERS } from '../js/data.js';

const N = Number(process.argv[2] || 300);
const humanSkill = Number(process.argv[3] || 0.85);
const io = {};

for (let ch = 0; ch < CHAPTERS.length; ch++) {
  const tally = { p: 0, r: 0, spire: 0 };
  let rounds = 0;
  let routs = 0;
  let maxRounds = 0;
  let stuck = 0;
  const firstShardRound = [];
  for (let i = 0; i < N; i++) {
    const s = newState(ch, 1000 + i * 7919 + ch);
    s.players[0].skill = humanSkill;
    const g = new Game(s, io, { allAI: true });
    // Guard against an endless game in the sim.
    const origEnd = g.endRound.bind(g);
    g.endRound = async () => {
      await origEnd();
      if (g.s.round > 200) { g.s.over = true; g.s.winner = 'stuck'; }
    };
    let firstShard = null;
    const origShow = g.show.bind(g);
    g.show = async (p, evt) => {
      if (firstShard === null && ['sun', 'moon', 'star'].includes(evt.glyph) && evt.sound === 'shard') firstShard = g.s.round;
      return origShow(p, evt);
    };
    await g.run();
    if (g.s.winner === 'stuck') stuck++;
    else tally[g.s.winner]++;
    rounds += g.s.round;
    maxRounds = Math.max(maxRounds, g.s.round);
    routs += g.s.players[0].stats.routs + g.s.players[1].stats.routs;
    if (firstShard) firstShardRound.push(firstShard);
  }
  const avgFirst = firstShardRound.reduce((a, b) => a + b, 0) / Math.max(1, firstShardRound.length);
  console.log(
    `Chapter ${ch + 1} "${CHAPTERS[ch].title}": player ${(100 * tally.p / N).toFixed(1)}%  rival ${(100 * tally.r / N).toFixed(1)}%  spire ${(100 * tally.spire / N).toFixed(1)}%  stuck ${stuck}` +
    `  | avg rounds ${(rounds / N).toFixed(1)} (max ${maxRounds})  routs/game ${(routs / N).toFixed(2)}  first shard ~r${avgFirst.toFixed(1)}`,
  );
}
