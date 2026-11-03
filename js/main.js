// Wires the engine to the board, the Spire console, the ledgers and the
// title / chapter / end screens.

import { Board3D } from './board3d.js';
import { SpireConsole } from './console.js';
import { Ledger, GloomTrack } from './ledger.js';
import * as audio from './audio.js';
import { Game, newState } from './engine.js';
import { CHAPTERS, NODE_BY_ID, RELIC_BY_ID, SHARDS } from './data.js';

const $ = (s) => document.querySelector(s);
const ROMAN = ['I', 'II', 'III', 'IV'];
const SAVE_KEY = 'obsidian-spire.save.v1';
const CAMPAIGN_KEY = 'obsidian-spire.campaign.v1';
const PREFS_KEY = 'obsidian-spire.prefs.v1';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let board = null;
let con = null;
let ledgers = {};
let gloomTrack = null;
let game = null;
let gen = 0;
let moveState = null;
let memorySave = null;
let webglOK = true;
const prefs = { muted: false, speed: 1, ...(store.get(PREFS_KEY) || {}) };
const SPEEDS = [
  { v: 1, label: 'Normal' },
  { v: 0.55, label: 'Brisk' },
  { v: 1.5, label: 'Stately' },
];

function campaign() { return { cleared: [], best: {}, ...(store.get(CAMPAIGN_KEY) || {}) }; }
function savedGame() { return store.get(SAVE_KEY) || memorySave; }

// ---------------------------------------------------------------------------
// io: the engine's window onto the page
// ---------------------------------------------------------------------------
function makeIO(myGen) {
  const alive = () => myGen === gen;
  const frozen = () => new Promise(() => {});
  return {
    update(g) { if (alive()) syncUI(g); },
    async show(p, evt) {
      if (!alive()) return frozen();
      const line = evt.log !== undefined ? evt.log : evt.text;
      if (line) addChronicle(p ? p.id : null, line, evt.tone);
      const rival = !!p && p.id === 'r';
      const shown = rival && (!evt.mood || evt.mood === 'idle') ? { ...evt, mood: 'rival' } : evt;
      await con.display(shown, { rival });
      if (!alive()) return frozen();
    },
    async ask(p, prompt) {
      if (!alive()) return frozen();
      setHint(promptHint(prompt));
      const k = await con.ask(prompt);
      setHint('');
      if (!alive()) return frozen();
      return k;
    },
    async aiChoice(p, prompt, key) {
      if (!alive()) return frozen();
      if (prompt.kind === 'move' || !key || typeof key !== 'string') return;
      con.render({ ...prompt, mood: prompt.battle ? 'danger' : 'rival' });
      const browsing = key === 'next' || key === 'end';
      await wait((browsing ? 160 : 420) * con.speed);
      con.flashKey?.(key);
      await wait((browsing ? 90 : 260) * con.speed);
      if (!alive()) return frozen();
    },
    chooseMove(p, options) {
      if (!alive()) return frozen();
      return new Promise((resolve) => {
        const ids = options.map((o) => o.to);
        board?.highlight(ids);
        const here = NODE_BY_ID[p.node];
        const stayText = here.type === 'wilds' ? 'make camp and forage' : here.type === 'spire' ? 'stay at the Spire' : `stay at ${here.name}`;
        const msg = `Choose your road: click a glowing space${p.relics.steed ? ' (your steed reaches two roads)' : ''}, or press STAY to ${stayText}.`;
        const finish = (choice) => {
          moveState = null;
          board?.highlight(null);
          renderRoads(null);
          con.cancelPending();
          setHint('');
          resolve(choice);
        };
        moveState = { ids: new Set(ids), finish };
        con.awaitMove(msg, () => finish({ stay: true }));
        setHint('Your move. Click a glowing space on the board.');
        renderRoads(options, (to) => finish({ to }));
      });
    },
    async movePawn(p, path, opts = {}) {
      if (!alive()) return frozen();
      if (board) await board.movePawn(p.id, path, opts, () => audio.play('step'));
      else await wait(200);
    },
    kindle(p, seq) { return alive() ? con.kindle(seq) : frozen(); },
    async aiKindle(p, seq, ok) { if (alive()) await con.showAIKindle(seq, ok); },
    async beforeTurn(g, p) {
      if (!alive()) return frozen();
      con.setTurn(p.id);
      con.setShards(p);
      board?.setActive(p.id);
      if (p.human) {
        const save = { state: JSON.parse(JSON.stringify(g.s)), log: chronicleEntries.slice(-80), at: Date.now() };
        memorySave = save;
        store.set(SAVE_KEY, save);
      }
    },
    async gameOver(g) { if (alive()) showEnd(g); },
  };
}

function promptHint(prompt) {
  if (prompt.battle) return 'Battle! Press FIGHT for another exchange or FLEE to fall back.';
  if (prompt.kind === 'shop') return 'YES buys, NEXT shows the next item, END leaves.';
  return '';
}

// ---------------------------------------------------------------------------
// UI sync
// ---------------------------------------------------------------------------
function syncUI(g) {
  const s = g.s;
  for (const p of s.players) ledgers[p.id]?.update(p, { active: s.players[s.turn]?.id === p.id && !s.over, upkeep: g.upkeep(p) });
  gloomTrack.update(s.gloom, s.gloomMax);
  $('#round-label').textContent = `Round ${s.round}`;
  if (board) {
    board.syncBarrows(s);
    board.setGloom(s.gloom, s.gloomMax);
  }
  const cur = s.players[s.turn];
  if (cur) con.setShards(cur);
}

const chronicleEntries = [];
function addChronicle(who, text, tone) {
  chronicleEntries.push({ who, text, tone: tone || 'neutral', round: game?.s.round });
  const ol = $('#chronicle');
  const li = document.createElement('li');
  li.className = `ch-${who || 'world'} tone-${tone || 'neutral'}`;
  li.textContent = text;
  ol.appendChild(li);
  while (ol.children.length > 160) ol.removeChild(ol.firstChild);
  ol.parentElement.scrollTop = ol.parentElement.scrollHeight;
}

function setHint(text) {
  const el = $('#board-hint-text');
  el.textContent = text;
  $('#board-hint').classList.toggle('show', !!text);
}

function renderRoads(options, pick) {
  const box = $('#roads');
  box.innerHTML = '';
  if (!options) { box.hidden = true; return; }
  box.hidden = false;
  for (const o of options) {
    const n = NODE_BY_ID[o.to];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `road-chip t-${n.type}`;
    b.textContent = n.name;
    b.title = describeNode(n.id);
    b.addEventListener('click', () => { audio.play('key'); pick(o.to); });
    b.addEventListener('mouseenter', () => board?.highlightHover?.(o.to));
    box.appendChild(b);
  }
}

const TYPE_TEXT = {
  keep: 'Keep',
  market: 'Market town: sellswords, provisions and relics',
  shrine: 'Shrine: pray, consult the oracle, take a ward',
  barrow: 'Barrow: wights in the antechamber, a Barrow King in the tomb',
  wilds: 'Wilds: anything may happen on the road',
  spire: 'The Obsidian Spire: bring all three shards',
};

function describeNode(id) {
  const n = NODE_BY_ID[id];
  if (!game) return `${n.name}. ${TYPE_TEXT[n.type]}`;
  const s = game.s;
  const me = s.players[0];
  let extra = '';
  if (n.type === 'keep') extra = n.id === me.home ? `Your keep. Tithes waiting: ${game.titheDue(me)} coin. Men-at-arms cost 2.` : "Ser Vael's keep. Its gates are shut to you.";
  if (n.type === 'market') extra = `Relics for sale: ${s.markets[id].relics.map((r) => RELIC_BY_ID[r].name).join(', ')}.`;
  if (n.type === 'barrow') {
    const b = s.barrows[id];
    const sh = SHARDS.find((x) => x.id === b.shard);
    extra = b.revealed ? `Its tomb holds the ${sh.name}.` : 'Which shard it holds is unknown.';
    if (me.looted[id]) extra += ' You have taken all it holds for you.';
    else if (me.depth?.[id]) extra += ' You cleared its antechamber.';
  }
  return `${n.name}. ${n.type === 'keep' ? '' : `${TYPE_TEXT[n.type]}. `}${extra}`.trim();
}

function onNodeClick(id) {
  if (moveState && moveState.ids.has(id)) {
    audio.play('key');
    moveState.finish({ to: id });
  }
}

function onNodeHover(id, e) {
  const tip = $('#node-tip');
  if (!id || !e || $('#title-screen').hidden === false) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.textContent = describeNode(id);
  const wrap = $('#board-stage').getBoundingClientRect();
  const x = Math.min(e.clientX - wrap.left + 14, wrap.width - 260);
  const y = Math.min(e.clientY - wrap.top + 16, wrap.height - 80);
  tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
function show(id) {
  for (const s of ['#title-screen', '#intro-screen', '#end-screen']) $(s).hidden = s !== id;
  document.body.classList.toggle('in-menu', !!id);
}

function renderTitle() {
  const c = campaign();
  const box = $('#chapters');
  box.innerHTML = '';
  CHAPTERS.forEach((ch, i) => {
    const unlocked = i === 0 || c.cleared.includes(CHAPTERS[i - 1].id) || c.unlockAll;
    const cleared = c.cleared.includes(ch.id);
    const card = document.createElement('div');
    card.className = `chapter-card${unlocked ? '' : ' locked'}${cleared ? ' cleared' : ''}`;
    card.innerHTML = `
      <span class="cc-num">${ROMAN[i]}</span>
      <div class="cc-body">
        <h3>${ch.title}</h3>
        <p>${['Gentle Gloom, a green rival.', 'Hungrier dead, a sharper rival.', 'Little time, a ruthless rival.'][i]}</p>
        <p class="cc-status">${cleared ? `Cleared${c.best[ch.id] ? ` in ${c.best[ch.id]} rounds` : ''}` : unlocked ? 'Ready' : `Clear chapter ${ROMAN[i - 1]} to unlock`}</p>
      </div>`;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.id = `btn-chapter-${ch.id}`;
    b.textContent = cleared ? 'Ride again' : 'Begin';
    b.disabled = !unlocked;
    b.addEventListener('click', () => { audio.unlock(); audio.play('key'); openIntro(i); });
    card.appendChild(b);
    box.appendChild(card);
  });
  const sv = savedGame();
  const cont = $('#btn-continue');
  cont.hidden = !sv || sv.state?.over;
  if (sv && !sv.state?.over) cont.textContent = `Continue: Chapter ${ROMAN[sv.state.chapterIndex]}, round ${sv.state.round}`;
}

function openIntro(i) {
  const ch = CHAPTERS[i];
  $('#intro-eyebrow').textContent = `Chapter ${ROMAN[i]}`;
  $('#intro-title').textContent = ch.title;
  $('#intro-text').innerHTML = ch.intro.map((p) => `<p>${p}</p>`).join('');
  $('#intro-facts').innerHTML = `
    <li><b>${ch.gloomMax}</b> Gloom wakes the Spire</li>
    <li>Gloom starts at <b>${ch.gloomStart}</b></li>
    <li>Crown song: <b>${ch.kindleBase}</b>+ notes</li>`;
  $('#btn-rideout').onclick = () => { audio.unlock(); startNew(i); };
  show('#intro-screen');
}

function resetTable() {
  $('#chronicle').innerHTML = '';
  chronicleEntries.length = 0;
}

async function bootSequence() {
  con.setTurn(null);
  audio.play('boot');
  con.render({ glyph: 'spire', led: 888, text: 'OBSIDIAN SPIRE . . . READY', mood: 'victory' });
  board?.flare();
  for (const k of ['yes', 'no', 'next', 'fight', 'flee', 'stay', 'ledger', 'repeat', 'end']) {
    con.flashKey?.(k);
    await wait(70);
  }
  await wait(900);
}

function attachGame(state, log) {
  gen++;
  const myGen = gen;
  game = new Game(state, makeIO(myGen));
  ledgers.p = new Ledger($('#ledger-p'), state.players[0]);
  ledgers.r = new Ledger($('#ledger-r'), state.players[1]);
  con.ledgerSource = () => game?.s.players[0];
  con.relicNames = Object.fromEntries(Object.entries(RELIC_BY_ID).map(([k, v]) => [k, v.name]));
  const ch = CHAPTERS[state.chapterIndex];
  $('#chapter-label').textContent = `Chapter ${ROMAN[state.chapterIndex]} · ${ch.title}`;
  resetTable();
  for (const e of log || []) addChronicle(e.who, e.text, e.tone);
  board?.placePawns(state.players);
  syncUI(game);
  return myGen;
}

async function startNew(i) {
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  const state = newState(i, seed);
  store.del(SAVE_KEY);
  const myGen = attachGame(state, []);
  show(null);
  board?.setTitleMode(false);
  board?.resetView(true);
  await bootSequence();
  if (myGen !== gen) return;
  addChronicle(null, `Chapter ${ROMAN[i]}: ${CHAPTERS[i].title}. The Gloom stands at ${state.gloom}.`, 'magic');
  game.run();
}

async function continueSaved() {
  const sv = savedGame();
  if (!sv) return;
  audio.unlock();
  const myGen = attachGame(sv.state, sv.log);
  show(null);
  board?.setTitleMode(false);
  board?.resetView(true);
  await bootSequence();
  if (myGen !== gen) return;
  addChronicle(null, `The quest resumes in round ${sv.state.round}.`, 'magic');
  game.run();
}

function showEnd(g) {
  const s = g.s;
  const won = s.winner === 'p';
  store.del(SAVE_KEY);
  memorySave = null;
  const ch = CHAPTERS[s.chapterIndex];
  if (won) {
    const c = campaign();
    if (!c.cleared.includes(ch.id)) c.cleared.push(ch.id);
    c.best[ch.id] = Math.min(c.best[ch.id] || 999, s.round);
    store.set(CAMPAIGN_KEY, c);
  }
  board?.highlight(null);
  con.enable([]);
  $('#end-eyebrow').textContent = `Chapter ${ROMAN[s.chapterIndex]} · ${ch.title} · Round ${s.round}`;
  $('#end-title').textContent = won ? 'The Crown Is Kindled' : s.winner === 'r' ? 'Frostvale Triumphs' : 'The Spire Wakes';
  $('#end-text').textContent = s.reason;
  $('#end-screen').dataset.result = won ? 'win' : 'lose';
  const rows = [
    ['Shards', (p) => SHARDS.filter((x) => p.shards[x.id]).map((x) => x.name.split(' ')[0]).join(', ') || 'none'],
    ['Company at the end', (p) => p.company],
    ['Battles won', (p) => p.stats.battlesWon],
    ['Foes cut down', (p) => p.stats.foesSlain],
    ['Roads travelled', (p) => p.stats.roads],
    ['Times routed', (p) => p.stats.routs],
    ['Relics', (p) => Object.entries(p.relics).filter(([, v]) => v).map(([k]) => RELIC_BY_ID[k].name.split(' ').pop()).join(', ') || 'none'],
  ];
  $('#end-stats').innerHTML = `<thead><tr><th></th><th class="c-p">You</th><th class="c-r">Ser Vael</th></tr></thead><tbody>${rows
    .map(([l, f]) => `<tr><th>${l}</th><td>${f(s.players[0])}</td><td>${f(s.players[1])}</td></tr>`).join('')}</tbody>`;
  const next = $('#btn-next-chapter');
  next.hidden = !(won && s.chapterIndex < CHAPTERS.length - 1);
  next.onclick = () => { audio.play('key'); openIntro(s.chapterIndex + 1); };
  $('#btn-again').onclick = () => { audio.play('key'); openIntro(s.chapterIndex); };
  setTimeout(() => show('#end-screen'), 1200);
}

function toTitle() {
  gen++; // freezes any running game
  game = null;
  moveState = null;
  board?.highlight(null);
  renderRoads(null);
  setHint('');
  con.cancelPending();
  con.endSocketMode?.();
  con.setTurn(null);
  con.render({ glyph: 'spire', led: null, text: 'The Spire waits.', mood: 'idle' });
  board?.setTitleMode(true);
  renderTitle();
  show('#title-screen');
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function applyPrefs() {
  audio.setMuted(prefs.muted);
  con.speed = prefs.speed;
  const sb = $('#btn-sound');
  sb.textContent = prefs.muted ? 'Sound off' : 'Sound on';
  sb.setAttribute('aria-pressed', String(!prefs.muted));
  $('#btn-speed').textContent = `Pace: ${(SPEEDS.find((s) => s.v === prefs.speed) || SPEEDS[0]).label}`;
}

async function boot(hotData) {
  if (hotData?.save) memorySave = hotData.save;
  con = new SpireConsole($('#console'));
  gloomTrack = new GloomTrack($('#gloom-track'));
  gloomTrack.update(0, CHAPTERS[0].gloomMax);
  // Placeholder ledgers so the table is complete before a game starts.
  const demo = newState(0, 1);
  ledgers.p = new Ledger($('#ledger-p'), demo.players[0]);
  ledgers.r = new Ledger($('#ledger-r'), demo.players[1]);
  ledgers.p.update(demo.players[0], { active: false, upkeep: 1 });
  ledgers.r.update(demo.players[1], { active: false, upkeep: 1 });
  applyPrefs();

  try {
    board = new Board3D($('#board'), { onNodeClick, onNodeHover });
    await board.init();
    con.bindSpire(board);
    board.placePawns(demo.players);
    board.setTitleMode(true);
    board.start();
  } catch (err) {
    console.error(err);
    webglOK = false;
    board = null;
    $('#board-wrap').classList.add('no-webgl');
    $('#board-fallback').hidden = false;
  }
  con.render({ glyph: 'spire', led: null, text: 'The Spire waits.', mood: 'idle' });

  document.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('in-menu') || $('#rules').open) return;
    if (con.handleKey(e)) e.preventDefault();
  });
  $('#btn-sound').addEventListener('click', () => { audio.unlock(); prefs.muted = !prefs.muted; store.set(PREFS_KEY, prefs); applyPrefs(); });
  $('#btn-speed').addEventListener('click', () => {
    const i = SPEEDS.findIndex((s) => s.v === prefs.speed);
    prefs.speed = SPEEDS[(i + 1) % SPEEDS.length].v;
    store.set(PREFS_KEY, prefs);
    applyPrefs();
  });
  $('#btn-view').addEventListener('click', () => board?.resetView(true));
  $('#btn-rules').addEventListener('click', () => $('#rules').showModal());
  $('#btn-howto').addEventListener('click', () => $('#rules').showModal());
  $('#btn-rules-close').addEventListener('click', () => $('#rules').close());
  $('#btn-menu').addEventListener('click', () => {
    const conf = $('#menu-confirm');
    conf.hidden = !conf.hidden;
  });
  $('#btn-menu-cancel').addEventListener('click', () => { $('#menu-confirm').hidden = true; });
  $('#btn-menu-leave').addEventListener('click', () => { $('#menu-confirm').hidden = true; toTitle(); });
  $('#btn-continue').addEventListener('click', () => continueSaved());
  $('#btn-intro-back').addEventListener('click', () => show('#title-screen'));
  $('#btn-end-title').addEventListener('click', () => toTitle());

  renderTitle();
  show('#title-screen');
  window.claude?.hot?.snapshot?.(() => ({ save: savedGame() }));
  window.__spire = { get game() { return game; }, board, con };
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready((data) => boot(data || {}));
else boot(hot?.data ?? {});
