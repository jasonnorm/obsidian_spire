// The Warden's-eye view: a first-person, turn-based look at the Gloaming
// Reach. Overland you ride road to road; barrows and the Spire are grid
// dungeons. Everything is drawn through the EGA pass in gfx.js.

import * as THREE from 'three';
import { NODE_BY_ID, PROVINCES, SHARDS } from '../data.js';
import { EgaPipeline, makeSprite, setFrame } from './gfx.js';
import { Overland, wpos, yawTo, EYE } from './world.js';
import { Level, barrowMap, SPIRE_MAPS, CELL, DIRS, drawAutomap } from './dungeon.js';
import { FOES_ART } from './sprites-foes.js';
import { BEASTS_ART } from './sprites-beasts.js';
import { PEOPLE_ART } from './sprites-people.js';
import { PROPS_ART } from './sprites-props.js';
import { rowsToCanvas, PALETTE } from './palette.js';
import * as audio from '../audio.js';

const INTERNAL_H = 300;
const FOE_STAGE = {
  dragon: { art: 'dragon', n: 1, height: 4.8 },
  troll: { set: 'beasts', art: 'troll', n: 1 },
  spiders: { set: 'beasts', art: 'spider', n: 3 },
  imps: { set: 'beasts', art: 'imp', n: 3 },
  ogre: { set: 'beasts', art: 'ogre', n: 1 },
  scorpions: { set: 'beasts', art: 'scorpion', n: 2 },
  brigands: { art: 'brigand', n: 3 },
  wolves: { art: 'wolf', n: 2 },
  hounds: { art: 'hound', n: 2 },
  wights: { art: 'wight', n: 3 },
  barrowking: { art: 'barrowking', n: 1 },
  sentinels: { art: 'sentinel', n: 2 },
  ashwarden: { art: 'ashwarden', n: 1 },
};
const GLYPH_STAGE = {
  wraith: { set: FOES_ART, art: 'wraith', n: 1, lift: 0.4 },
  sellswords: { set: PEOPLE_ART, art: 'sellsword', n: 2 },
  recruit: { set: PEOPLE_ART, art: 'sellsword', n: 2 },
  pilgrim: { set: PEOPLE_ART, art: 'pilgrim', n: 1 },
  peddler: { set: PEOPLE_ART, art: 'peddler', n: 1 },
  omen: { set: PEOPLE_ART, art: 'raven', n: 1, dist: 4 },
  cache: { set: PROPS_ART, art: 'chestopen', n: 1, dist: 4 },
  camp: { set: PROPS_ART, art: 'campfire', n: 1, dist: 4 },
};
const SHARD_PROP = { sun: 'shardsun', moon: 'shardmoon', star: 'shardstar' };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export class FirstPersonView {
  constructor(canvas, hud, { say } = {}) {
    this.canvas = canvas;
    this.hud = hud;
    this.say = say;
    this.pipe = new EgaPipeline(canvas);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.camera.rotation.order = 'YXZ';
    this.overland = new Overland();
    this.scene = this.overland.scene;
    this.mode = 'overland';
    this.pos = new THREE.Vector3(0, EYE, 30);
    this.yaw = 0;
    this.pitch = 0;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.anims = [];
    this.actors = [];
    this.node = null;
    this.speed = 1;
    this.active = false;
    this.locked = false;
    this.clock = new THREE.Clock();
    this.buildHud();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
  }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const h = this.hud;
    h.innerHTML = `
      <div class="fp-banner"><b id="fp-place">The Gloaming Reach</b><small id="fp-region"></small></div>
      <canvas class="fp-compass" id="fp-compass" width="176" height="22" aria-hidden="true"></canvas>
      <canvas class="fp-automap" id="fp-automap" width="104" height="104" aria-label="Map of the explored passages" hidden></canvas>
      <div class="fp-roads" id="fp-roads" hidden>
        <button type="button" class="fp-btn" data-act="prev" aria-label="Previous road">&#9664;</button>
        <div class="fp-road-label" id="fp-road-label" aria-live="polite"></div>
        <button type="button" class="fp-btn" data-act="next" aria-label="Next road">&#9654;</button>
        <button type="button" class="fp-btn fp-ride" data-act="ride">Ride</button>
      </div>
      <div class="fp-pad" id="fp-pad" hidden>
        <button type="button" class="fp-btn" data-act="tl" aria-label="Turn left">&#8630;</button>
        <button type="button" class="fp-btn" data-act="fw" aria-label="Step forward">&#9650;</button>
        <button type="button" class="fp-btn" data-act="tr" aria-label="Turn right">&#8631;</button>
        <button type="button" class="fp-btn" data-act="sl" aria-label="Step left">&#9664;</button>
        <button type="button" class="fp-btn" data-act="bk" aria-label="Step back">&#9660;</button>
        <button type="button" class="fp-btn" data-act="sr" aria-label="Step right">&#9654;</button>
        <button type="button" class="fp-btn fp-leave" data-act="leave">Leave</button>
      </div>
      <canvas class="fp-hand" id="fp-hand" aria-hidden="true" hidden></canvas>
      <div class="fp-fade" id="fp-fade"></div>`;
    this.el = {
      place: h.querySelector('#fp-place'),
      region: h.querySelector('#fp-region'),
      compass: h.querySelector('#fp-compass'),
      automap: h.querySelector('#fp-automap'),
      roads: h.querySelector('#fp-roads'),
      roadLabel: h.querySelector('#fp-road-label'),
      pad: h.querySelector('#fp-pad'),
      hand: h.querySelector('#fp-hand'),
      fade: h.querySelector('#fp-fade'),
    };
    h.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      audio.play('key');
      this.act(b.dataset.act);
    });
    const hand = PEOPLE_ART.hand;
    if (hand) {
      this.handFrames = {
        idle: rowsToCanvas(hand.frames.idle),
        attack: rowsToCanvas(hand.frames.attack || hand.frames.idle),
      };
      this.el.hand.width = hand.w;
      this.el.hand.height = hand.h;
      this.setHand('idle');
    }
  }

  setHand(frame) {
    const c = this.handFrames?.[frame];
    if (!c) return;
    const g = this.el.hand.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(c, 0, 0);
  }

  showHand(on) { this.el.hand.hidden = !on; }

  setBanner(place, region) {
    this.el.place.textContent = place;
    this.el.region.textContent = region || '';
  }

  resize() {
    const p = this.canvas.parentElement;
    const w = p.clientWidth;
    const h = p.clientHeight;
    if (!w || !h) return;
    const ih = INTERNAL_H;
    const iw = Math.max(160, Math.round((ih * w) / h));
    this.pipe.setSize(iw, ih);
    this.camera.aspect = iw / ih;
    this.camera.updateProjectionMatrix();
    this.hud.style.setProperty('--fp-px', `${(h / ih).toFixed(3)}px`);
  }

  // ---------------------------------------------------------------- loop
  setActive(on) {
    this.active = on;
    if (on) {
      this.resize();
      if (!this.raf) {
        const loop = () => { this.raf = requestAnimationFrame(loop); this.frame(); };
        loop();
      }
    } else if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  anim(ms, fn) {
    return new Promise((resolve) => {
      if (!this.active) { fn(1); resolve(); return; }
      this.anims.push({ t0: performance.now(), ms: Math.max(1, ms), fn, resolve });
    });
  }

  frame() {
    const now = performance.now();
    const t = this.clock.getElapsedTime();
    this.anims = this.anims.filter((a) => {
      const k = Math.min(1, (now - a.t0) / a.ms);
      a.fn(k);
      if (k >= 1) { a.resolve(); return false; }
      return true;
    });
    const cam = this.camera;
    cam.position.copy(this.pos);
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - 0.02);
    }
    cam.rotation.set(this.pitch, this.yaw, 0);
    if (this.flash > 0) {
      this.pipe.setFlash(this.flash, this.flashColor);
      this.flash = Math.max(0, this.flash - 0.04);
    } else this.pipe.setFlash(0);
    if (this.mode === 'overland') this.overland.update(t);
    else {
      this.level?.update(t, cam.position);
      if (this.torch) {
        this.torch.position.copy(cam.position);
        this.torch.intensity = 8 + Math.sin(t * 13) * 0.6 + Math.sin(t * 7.3) * 0.5;
      }
      if (this.crystal) this.crystal.rotation.y = t * 0.6;
    }
    for (const a of this.actors) {
      if (a.userData.float) a.position.y = a.userData.float + Math.sin(t * 2.2 + a.id) * 0.15;
    }
    this.drawCompass();
    this.pipe.render(this.scene, cam);
  }

  drawCompass() {
    const c = this.el.compass;
    const g = c.getContext('2d');
    g.fillStyle = '#000000';
    g.fillRect(0, 0, c.width, c.height);
    const heading = (-this.yaw * 180) / Math.PI;
    const ppd = c.width / 120; // pixels per degree, 120 degree window
    g.font = '8px "Press Start 2P", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let d = -180; d <= 540; d += 15) {
      const rel = ((d - heading + 540) % 360) - 180;
      if (Math.abs(rel) > 60) continue;
      const x = Math.round(c.width / 2 + rel * ppd);
      const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[((d % 360) + 360) % 360];
      if (card) {
        g.fillStyle = card === 'N' ? '#ff5555' : '#ffffff';
        g.fillText(card, x, 12);
      } else {
        g.fillStyle = '#aaaaaa';
        g.fillRect(x, 16, 1, 4);
      }
    }
    if (this.mode === 'overland') {
      const sp = (Math.atan2(-this.pos.x, this.pos.z * -1) * 180) / Math.PI;
      const bearing = (Math.atan2(0 - this.pos.x, -(0 - this.pos.z)) * 180) / Math.PI;
      const rel = ((bearing - heading + 540) % 360) - 180;
      void sp;
      if (Math.abs(rel) <= 60) {
        const x = Math.round(c.width / 2 + rel * ppd);
        g.fillStyle = '#aa55ff';
        g.fillRect(x - 2, 2, 5, 3);
        g.fillRect(x - 1, 5, 3, 2);
      }
    }
    g.fillStyle = '#ffff55';
    g.fillRect(c.width / 2, 0, 1, 4);
  }

  // Back to a clean overland state, standing at the human's node (or nowhere).
  reset(human) {
    this.exploreResolve = null;
    this.roadSel = null;
    this.el.roads.hidden = true;
    this.el.pad.hidden = true;
    this.el.automap.hidden = true;
    this.el.fade.style.opacity = '0';
    this.anims = [];
    this.mode = 'overland';
    this.scene = this.overland.scene;
    this.level = null;
    this.crystal = null;
    this.torch = null;
    this.dungeonKey = null;
    this.spireLevels = null;
    this.riding = false;
    this.clearStage();
    this.showHand(false);
    this.node = null;
    if (human) { this.human = human; this.standAt(human.node, null); }
  }

  // ---------------------------------------------------------------- overland
  regionOf(id) {
    const n = NODE_BY_ID[id];
    if (n.type === 'spire') return 'The Ashlands';
    return n.slot === 'E' ? `${PROVINCES[n.wedge].name} · edge of the Ashlands` : PROVINCES[n.wedge].name;
  }

  standAt(id, fromId) {
    this.node = id;
    const site = this.overland.sites[id];
    if (id === 'S') {
      const stand = this.overland.spireStand(fromId);
      this.pos.set(stand.x, EYE, stand.z);
      this.overland.faceGate(fromId && fromId !== 'S' ? fromId : 'E0');
      this.yaw = yawTo(this.pos, new THREE.Vector3());
      this.pitch = 0.2;
    } else {
      const p = wpos(id);
      this.pos.set(p.x, EYE, p.z);
      this.pitch = 0;
      if (site && site.type !== 'wilds') this.yaw = yawTo(this.pos, site.center);
      else this.yaw = yawTo(this.pos, new THREE.Vector3());
    }
    this.setBanner(NODE_BY_ID[id].name, this.regionOf(id));
  }

  async faceSite() {
    const site = this.overland.sites[this.node];
    let target;
    let pitch = 0;
    if (this.node === 'S') { target = yawTo(this.pos, new THREE.Vector3()); pitch = 0.2; }
    else if (site && site.type !== 'wilds') target = yawTo(this.pos, site.center);
    else return;
    await this.turnTo(target, pitch, 450);
  }

  turnTo(yaw, pitch = this.pitch, ms = 300) {
    const y0 = this.yaw;
    const p0 = this.pitch;
    const dy = wrap(yaw - y0);
    return this.anim(ms, (k) => {
      const e = ease(k);
      this.yaw = y0 + dy * e;
      this.pitch = p0 + (pitch - p0) * e;
    });
  }

  ensurePose(human) {
    if (this.mode !== 'overland' || this.riding) return;
    if (this.node !== human.node) this.standAt(human.node, human.prevNode);
  }

  chooseRoad(p, options, pick) {
    const here = this.pos.clone();
    const items = options.map((o) => {
      const first = o.path[1];
      const target = first === 'S' ? new THREE.Vector3() : wpos(first);
      return { ...o, yaw: yawTo(here, target), roads: o.path.length - 1 };
    });
    items.sort((a, b) => wrap(a.yaw - this.yaw) - wrap(b.yaw - this.yaw) || a.roads - b.roads);
    // Start on the road closest to straight ahead.
    let i = 0;
    let best = Infinity;
    items.forEach((it, k) => { const d = Math.abs(wrap(it.yaw - this.yaw)); if (d < best) { best = d; i = k; } });
    this.roadSel = { items, i, pick };
    this.el.roads.hidden = false;
    this.showHand(false);
    this.updateRoadLabel(false);
    return () => { this.roadSel = null; this.el.roads.hidden = true; };
  }

  updateRoadLabel(turn = true) {
    const sel = this.roadSel;
    if (!sel) return;
    const it = sel.items[sel.i];
    const n = NODE_BY_ID[it.to];
    const kind = { keep: 'Keep', market: 'Market', shrine: 'Shrine', barrow: 'Barrow', wilds: 'Wilds', spire: 'The Spire' }[n.type];
    const via = it.roads > 1 ? ` via ${NODE_BY_ID[it.path[1]].name}` : '';
    this.el.roadLabel.innerHTML = `<b>${n.name}</b><small>${kind} &middot; ${it.roads} road${it.roads > 1 ? 's' : ''}${via}</small>`;
    if (turn) this.turnTo(it.yaw, 0, 260);
  }

  act(a) {
    if (this.roadSel) {
      const sel = this.roadSel;
      if (a === 'prev') { sel.i = (sel.i - 1 + sel.items.length) % sel.items.length; this.updateRoadLabel(); return true; }
      if (a === 'next') { sel.i = (sel.i + 1) % sel.items.length; this.updateRoadLabel(); return true; }
      if (a === 'ride') { const it = sel.items[sel.i]; sel.pick(it.to); return true; }
    }
    if (this.mode === 'dungeon' && this.exploreResolve && !this.locked) {
      if (a === 'fw') return this.step(0), true;
      if (a === 'bk') return this.step(2), true;
      if (a === 'sl') return this.step(3), true;
      if (a === 'sr') return this.step(1), true;
      if (a === 'tl') return this.turn(-1), true;
      if (a === 'tr') return this.turn(1), true;
      if (a === 'leave') return this.finishExplore('leave'), true;
    }
    return false;
  }

  handleKey(e) {
    if (!this.active) return false;
    const k = e.key.toLowerCase();
    if (this.roadSel) {
      if (k === 'arrowleft' || k === 'a') return this.act('prev');
      if (k === 'arrowright' || k === 'd') return this.act('next');
      if (k === 'arrowup' || k === 'w') return this.act('ride');
      return false;
    }
    if (this.mode === 'dungeon') {
      const map = { arrowup: 'fw', w: 'fw', arrowdown: 'bk', s: 'bk', arrowleft: 'tl', a: 'tl', arrowright: 'tr', d: 'tr', q: 'sl', e: 'sr', escape: 'leave', backspace: 'leave' };
      if (map[k]) return this.act(map[k]);
    }
    return false;
  }

  async ride(path, { teleport = false, drift = false } = {}) {
    if (this.mode === 'dungeon') await this.exitDungeon(true);
    this.clearStage();
    const dest = path[path.length - 1];
    if (teleport || !this.active) {
      if (teleport && this.active) await this.fadeTo(1, 350);
      this.standAt(dest, path[path.length - 2]);
      if (teleport && this.active) await this.fadeTo(0, 450);
      return;
    }
    this.riding = true;
    for (let i = 0; i < path.length - 1; i++) {
      const to = path[i + 1];
      const from = path[i];
      const b = to === 'S' ? this.overland.spireStand(from) : wpos(to);
      const a = this.pos.clone();
      const dest3 = new THREE.Vector3(b.x, EYE, b.z);
      await this.turnTo(yawTo(a, dest3), 0, 260 * this.speed);
      const dist = a.distanceTo(dest3);
      const ms = Math.max(650, (dist / (drift ? 7 : 17)) * 1000) * this.speed;
      let lastStep = 0;
      if (drift) this.overland.scene.fog.near = 6;
      await this.anim(ms, (k) => {
        const e = k < 0.15 ? k * k / 0.3 : k > 0.85 ? 1 - (1 - k) ** 2 / 0.3 : (k - 0.075) / 0.85;
        this.pos.lerpVectors(a, dest3, Math.min(1, Math.max(0, e)));
        this.pos.y = EYE + Math.abs(Math.sin(k * ms / 140)) * 0.12;
        if (k - lastStep > 0.11) { lastStep = k; audio.play('step'); }
      });
      this.node = to;
      this.setBanner(NODE_BY_ID[to].name, this.regionOf(to));
    }
    this.pos.y = EYE;
    this.riding = false;
    if (dest === 'S') this.overland.faceGate(path[path.length - 2]);
    await this.faceSite();
  }

  fadeTo(v, ms) {
    this.el.fade.style.transition = `opacity ${ms}ms steps(6)`;
    this.el.fade.style.opacity = String(v);
    return new Promise((r) => setTimeout(r, ms));
  }

  sync(game) {
    const s = game.s;
    const me = s.players[0];
    const rival = s.players[1];
    this.overland.setGloom(Math.min(1, s.gloom / s.gloomMax));
    for (const [id, b] of Object.entries(s.barrows)) this.overland.setBarrow(id, b.revealed ? b.shard : null, !!me.looted[id]);
    this.overland.placeRival(rival.node, me.node);
    this.human = me;
  }

  setMood(color, mood) {
    const intensity = { idle: 0.85, good: 1, danger: 1.15, warn: 1, magic: 1.1, gloom: 0.7, victory: 1.5, rival: 0.9 }[mood] ?? 1;
    this.moodColor = color;
    this.overland.setMood(color, intensity);
    if (this.crystal) { this.crystal.material.color.set(color); this.crystalLight.color.set(color); }
  }

  pulse() {
    this.overland.pulse();
    if (this.active) { this.flash = 0.35; this.flashColor = '#aa55ff'; }
  }

  flare() {
    this.overland.pulse();
    if (this.active) { this.flash = 0.3; this.flashColor = this.moodColor || '#ffff55'; }
  }

  crownNote(shard) {
    const col = SHARDS.find((s) => s.id === shard)?.color || '#ffffff';
    this.overland.setMood(col, 1.5);
    if (this.crystal) { this.crystal.material.color.set(col); this.crystalLight.color.set(col); this.crystalLight.intensity = 40; }
    const sock = this.level?.sockets?.[shard];
    if (sock) {
      const base = sock.userData.baseScale;
      this.anim(380, (k) => sock.scale.copy(base).multiplyScalar(1 + Math.sin(k * Math.PI) * 0.6));
    }
    clearTimeout(this.noteT);
    this.noteT = setTimeout(() => {
      if (this.crystalLight) this.crystalLight.intensity = 18;
      if (this.moodColor) this.setMood(this.moodColor, 'magic');
    }, 380);
  }

  // ---------------------------------------------------------------- staging
  clearStage() {
    for (const a of this.actors) a.parent?.remove(a);
    this.actors = [];
    this.stageKey = null;
    this.showHand(this.mode === 'dungeon');
  }

  dropLurker() {
    if (this.lurker) { this.lurker.parent?.remove(this.lurker); this.lurker = null; }
  }

  forwardRoom() {
    if (this.mode !== 'dungeon') return 7;
    let d = 0;
    let { x, y } = this.grid;
    const [dx, dy] = DIRS[this.dir];
    while (d < 3 && this.level.walkable(x + dx, y + dy)) { x += dx; y += dy; d++; }
    return Math.max(2.2, Math.min(6.5, d * CELL + CELL / 2 - 0.8));
  }

  spawn(set, art, n, { dist, lift = 0, key, height }) {
    const def = set[art];
    if (!def) return;
    this.clearStage();
    this.stageKey = key;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const d = Math.min(dist ?? this.forwardRoom(), this.forwardRoom());
    const width = ((height ?? def.height) * def.w) / def.h;
    const spacing = Math.min(width * 1.05, this.mode === 'dungeon' ? 3.4 / Math.max(1, n - 1 || 1) + 0.4 : 9);
    for (let i = 0; i < n; i++) {
      const s = makeSprite(def, art, { height });
      const off = (i - (n - 1) / 2) * spacing;
      const depth = d + (n > 1 && i % 2 === 1 ? 0.8 : 0);
      s.position.set(this.pos.x + fwd.x * depth + right.x * off, lift, this.pos.z + fwd.z * depth + right.z * off);
      if (lift) s.userData.float = lift;
      s.userData.selfLit = this.mode !== 'dungeon';
      this.scene.add(s);
      this.actors.push(s);
      // Rise into view.
      const base = s.userData.baseScale.clone();
      s.scale.set(base.x, 0.01, 1);
      this.anim(260, (k) => s.scale.set(base.x, base.y * ease(k), 1));
    }
    if (this.mode === 'dungeon') for (const s of this.actors) this.level.sprites.push(s);
  }

  hitActor() {
    const a = this.actors[Math.floor(Math.random() * this.actors.length)];
    if (!a) return;
    const p0 = a.position.clone();
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.anim(260, (k) => {
      a.visible = Math.floor(k * 6) % 2 === 0;
      a.position.copy(p0).addScaledVector(fwd, Math.sin(k * Math.PI) * 0.6);
    }).then(() => { a.visible = true; a.position.copy(p0); });
  }

  swing() {
    this.setHand('attack');
    setTimeout(() => this.setHand('idle'), 240);
  }

  stage(evt, p) {
    if (!this.active) return;
    if (p && !p.human) return;
    const foe = evt.foe && FOE_STAGE[evt.foe];
    if (foe) {
      this.showHand(true);
      const key = `foe:${evt.foe}`;
      if (this.stageKey !== key) {
        if (evt.foe === 'dragon') this.dropLurker();
        this.spawn(foe.set === 'beasts' ? BEASTS_ART : FOES_ART, foe.art, foe.n, { key, height: foe.height });
      }
      if (evt.breath) {
        const a = this.actors[0];
        if (a) { setFrame(a, 'attack'); setTimeout(() => setFrame(a, 'idle'), 650); }
        this.flash = 0.6;
        this.flashColor = '#ffaa55';
        this.shake = 0.35;
      }
      if (evt.glyph === 'battle') { this.swing(); this.hitActor(); this.flash = 0.12; this.flashColor = '#ffffff'; }
      if (evt.glyph === 'wound') {
        const a = this.actors[0];
        if (a) { setFrame(a, 'attack'); setTimeout(() => setFrame(a, 'idle'), 420); }
        this.flash = 0.45;
        this.flashColor = '#aa0000';
        this.shake = 0.25;
      }
      if (evt.glyph === 'banner') this.swing();
      if (evt.glyph === 'victory') this.felled();
      if (evt.glyph === 'defeat') { this.flash = 0.8; this.flashColor = '#550000'; }
      return;
    }
    if (evt.glyph === 'retreat') {
      this.clearStage();
      this.pushBack = true;
      return;
    }
    if (evt.glyph === 'wound' || evt.glyph === 'hunger' || evt.glyph === 'fever') { this.flash = 0.35; this.flashColor = '#aa0000'; this.shake = 0.15; }
    if (evt.glyph === 'storm') { this.flash = 0.9; this.flashColor = '#ffffff'; setTimeout(() => { this.flash = 0.7; }, 260); }
    if (evt.glyph === 'fog') this.overland.scene.fog.near = 4;
    if (evt.glyph === 'rout' || evt.glyph === 'defeat') { this.flash = 0.8; this.flashColor = '#550000'; }
    if (evt.mood === 'victory') { this.flash = 0.6; this.flashColor = '#ffff55'; }
    if (['sun', 'moon', 'star'].includes(evt.glyph) && evt.sound === 'shard') this.raiseShard(evt.glyph);
    const g = GLYPH_STAGE[evt.glyph];
    if (g) {
      const key = `g:${evt.glyph}`;
      if (this.stageKey !== key) this.spawn(g.set, g.art, g.n, { key, dist: g.dist, lift: g.lift });
      if (evt.glyph === 'wraith' && evt.led < 0) { this.flash = 0.4; this.flashColor = '#00aaaa'; }
      return;
    }
    // NPCs at the sites gesture when they deal with you.
    const site = this.overland.sites[this.node];
    if (this.mode === 'overland' && site?.npc && ['coin', 'relic', 'gain', 'magic', 'reveal'].includes(evt.sound)) {
      setFrame(site.npc, 'attack');
      clearTimeout(this.npcT);
      this.npcT = setTimeout(() => setFrame(site.npc, 'idle'), 700);
    }
  }

  felled() {
    const list = this.actors.slice();
    this.actors = [];
    this.stageKey = null;
    for (const a of list) {
      const base = a.scale.clone();
      this.anim(420, (k) => a.scale.set(base.x * (1 + k * 0.3), base.y * (1 - k), 1)).then(() => {
        a.parent?.remove(a);
        if (this.mode === 'dungeon' && a.userData.name !== 'sentinel') {
          const bones = this.level.sprite('bones', 0, 0);
          if (bones) bones.position.set(a.position.x, 0, a.position.z);
        }
      });
    }
  }

  raiseShard(shard) {
    const def = PROPS_ART[SHARD_PROP[shard]];
    if (!def) return;
    const s = makeSprite(def, SHARD_PROP[shard], { height: 1 });
    s.userData.selfLit = true;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const from = this.pos.clone().addScaledVector(fwd, 3);
    from.y = 0.4;
    s.position.copy(from);
    this.scene.add(s);
    this.anim(1500, (k) => {
      s.position.y = 0.4 + k * 1.6;
      s.position.lerpVectors(from, this.pos.clone().setY(EYE - 0.6), k * k);
      const sc = s.userData.baseScale.clone().multiplyScalar(1 + k * 0.8);
      s.scale.set(sc.x, sc.y, 1);
    }).then(() => s.parent?.remove(s));
    if (this.level?.altarShard) { this.level.group.remove(this.level.altarShard); this.level.altarShard = null; }
  }

  // ---------------------------------------------------------------- dungeons
  explore(opts) {
    return new Promise(async (resolve) => {
      const key = opts.site === 'barrow' ? `b:${opts.node}` : 'spire';
      if (this.mode !== 'dungeon' || this.dungeonKey !== key) await this.enterDungeon(opts, key);
      else if (this.pushBack) {
        this.pushBack = false;
        if (this.prevCell) await this.moveTo(this.prevCell.x, this.prevCell.y, false);
      }
      this.pushBack = false;
      this.exploreOpts = opts;
      this.exploreResolve = resolve;
      this.locked = false;
      this.el.pad.hidden = false;
      this.showHand(true);
      this.dressTomb();
    });
  }

  finishExplore(result) {
    const r = this.exploreResolve;
    this.exploreResolve = null;
    this.el.pad.hidden = true;
    if (result === 'leave') this.exitDungeon().then(() => r?.(result));
    else r?.(result);
  }

  levelFor(site, floor) {
    if (site === 'barrow') {
      const n = NODE_BY_ID[this.exploreNode];
      let h = (this.seed || 7) >>> 0;
      for (const ch of n.id) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
      return new Level(barrowMap(h % 997), { kind: 'barrow' });
    }
    this.spireLevels = this.spireLevels || [];
    if (!this.spireLevels[floor]) this.spireLevels[floor] = new Level(SPIRE_MAPS[floor], { kind: 'spire', floor });
    return this.spireLevels[floor];
  }

  async enterDungeon(opts, key) {
    this.exploreOpts = opts;
    if (this.active) await this.fadeTo(1, 300);
    this.clearStage();
    this.mode = 'dungeon';
    this.dungeonKey = key;
    this.exploreNode = opts.node;
    this.site = opts.site;
    this.spireLevels = opts.site === 'spire' ? this.spireLevels : null;
    this.enterFloor(0, 'S');
    this.el.roads.hidden = true;
    this.el.automap.hidden = false;
    if (this.active) await this.fadeTo(0, 400);
  }

  enterFloor(floor, at) {
    const lvl = this.levelFor(this.site, floor);
    this.level = lvl;
    this.floor = floor;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#000000');
    scene.fog = new THREE.Fog('#000000', 3, this.site === 'spire' ? 26 : 18);
    scene.add(new THREE.HemisphereLight(this.site === 'spire' ? '#aa88ff' : '#ffddaa', '#000000', this.site === 'spire' ? 0.3 : 0.2));
    this.torch = new THREE.PointLight('#ffaa55', 8, 17, 1.3);
    scene.add(this.torch);
    scene.add(lvl.group);
    this.crystal = null;
    if (this.site === 'spire' && floor === 2) {
      const c = lvl.find('C');
      const w = lvl.world(c.x, c.y);
      this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: this.moodColor || '#c49bff', fog: false }));
      this.crystal.scale.y = 1.8;
      this.crystal.position.set(w.x, 5.5, w.z);
      scene.add(this.crystal);
      this.crystalLight = new THREE.PointLight(this.moodColor || '#c49bff', 18, 30, 1.2);
      this.crystalLight.position.set(w.x, 5, w.z);
      scene.add(this.crystalLight);
      // The Crown Dragon waits coiled behind the crown until you step up to it.
      this.lurker = null;
      if ((this.exploreOpts?.tier ?? 0) === 2 && FOES_ART.dragon) {
        const d = makeSprite(FOES_ART.dragon, 'dragon');
        d.position.set(w.x, 0, w.z - CELL * 0.75);
        d.userData.selfLit = true;
        scene.add(d);
        this.lurker = d;
      }
    }
    this.scene = scene;
    const start = lvl.find(at) || lvl.find('S') || lvl.find('v');
    this.grid = { x: start.x, y: start.y };
    this.prevCell = null;
    this.dir = lvl.openDir(start.x, start.y);
    const w = lvl.world(start.x, start.y);
    this.pos.set(w.x, EYE, w.z);
    this.yaw = -this.dir * (Math.PI / 2);
    this.pitch = 0;
    this.seen = new Set();
    this.look();
    const names = { barrow: NODE_BY_ID[this.exploreNode]?.name, spire: ['The Spire: the gate hall', 'The Spire: the hall of ash', 'The Spire: the crown'][floor] };
    this.setBanner(names[this.site], this.site === 'barrow' ? 'Inside the barrow' : 'The Obsidian Spire');
  }

  dressTomb() {
    const o = this.exploreOpts;
    const lvl = this.level;
    if (this.site !== 'barrow' || !lvl?.altarCell) return;
    const want = o.shard && !o.hasShard && !o.looted ? o.shard : null;
    if (want && !lvl.altarShard) {
      lvl.altarShard = lvl.sprite(SHARD_PROP[want], lvl.altarCell.x, lvl.altarCell.y, { lift: 1.25, height: 0.8 });
      if (lvl.altarShard) lvl.altarShard.userData.selfLit = true;
    }
  }

  async exitDungeon(instant = false) {
    if (this.mode !== 'dungeon') return;
    if (this.active && !instant) await this.fadeTo(1, 300);
    this.mode = 'overland';
    this.scene = this.overland.scene;
    this.level = null;
    this.crystal = null;
    this.torch = null;
    this.dungeonKey = null;
    this.spireLevels = null;
    this.el.pad.hidden = true;
    this.el.automap.hidden = true;
    this.clearStage();
    this.showHand(false);
    if (this.node) this.standAt(this.node, this.human?.prevNode);
    if (this.active && !instant) await this.fadeTo(0, 400);
    else this.el.fade.style.opacity = '0';
  }

  // Mark what the torch shows: the cell, its neighbours, and straight ahead.
  look() {
    const lvl = this.level;
    const { x, y } = this.grid;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.seen.add(`${x + dx},${y + dy}`);
    const [fx, fy] = DIRS[this.dir];
    let cx = x;
    let cy = y;
    for (let i = 0; i < 4; i++) {
      cx += fx; cy += fy;
      this.seen.add(`${cx},${cy}`);
      this.seen.add(`${cx + fy},${cy + fx}`);
      this.seen.add(`${cx - fy},${cy - fx}`);
      if (!lvl.walkable(cx, cy)) break;
    }
    drawAutomap(this.el.automap, lvl, this.seen, this.grid, this.dir);
  }

  async turn(d) {
    this.locked = true;
    this.dir = (this.dir + d + 4) % 4;
    await this.turnTo(-this.dir * (Math.PI / 2), 0, 170);
    this.look();
    this.locked = false;
  }

  async step(rel) {
    const d = (this.dir + rel) % 4;
    const [dx, dy] = DIRS[d];
    const nx = this.grid.x + dx;
    const ny = this.grid.y + dy;
    if (!this.level.walkable(nx, ny)) {
      audio.play('deny');
      this.shake = 0.12;
      return;
    }
    await this.moveTo(nx, ny, true);
  }

  async moveTo(nx, ny, trigger) {
    this.locked = true;
    this.prevCell = { ...this.grid };
    const a = this.pos.clone();
    const w = this.level.world(nx, ny);
    const b = new THREE.Vector3(w.x, EYE, w.z);
    audio.play('step');
    await this.anim(190, (k) => {
      this.pos.lerpVectors(a, b, ease(k));
      this.pos.y = EYE + Math.sin(k * Math.PI) * 0.08;
    });
    this.pos.y = EYE;
    this.grid = { x: nx, y: ny };
    this.look();
    this.locked = false;
    if (trigger) this.enterCell();
  }

  enterCell() {
    const lvl = this.level;
    const ch = lvl.at(this.grid.x, this.grid.y);
    const o = this.exploreOpts || {};
    if (this.site === 'barrow') {
      if (ch === 'S') return this.finishExplore('leave');
      if (ch === 'a' && o.depth === 0) return this.finishExplore('antechamber');
      if (ch === 'D' || ch === 't') {
        if (o.depth >= 1 && !o.looted && !o.hasShard) return this.finishExplore('tomb');
        if (!this.saidTomb) { this.saidTomb = true; this.say?.('tomb', o); }
      }
      return;
    }
    // The Spire.
    if (ch === 'S' && this.floor === 0) return this.finishExplore('leave');
    if (ch === 'g' && o.tier === 0) return this.finishExplore('gate');
    if (ch === 'h' && o.tier === 1) return this.finishExplore('hall');
    if (ch === 'r' && o.tier === 2) return this.finishExplore('dragon');
    if (ch === 'C' && o.tier >= 3) return this.finishExplore('crown');
    if (ch === 'U') {
      if ((this.floor === 0 && o.tier >= 1) || (this.floor === 1 && o.tier >= 2)) return this.changeFloor(this.floor + 1, 'v');
      this.say?.('barred', o);
    }
    if (ch === 'v' && this.floor > 0) return this.changeFloor(this.floor - 1, 'U');
  }

  async changeFloor(floor, at) {
    this.locked = true;
    audio.play('turn');
    if (this.active) await this.fadeTo(1, 250);
    this.enterFloor(floor, at);
    // Step off the stair so it does not fire again.
    if (this.active) await this.fadeTo(0, 350);
    this.locked = false;
  }
}
