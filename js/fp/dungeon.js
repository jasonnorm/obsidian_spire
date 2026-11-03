// Grid dungeons for the barrows and the Spire's interior. Each level is an
// ASCII map; this module turns one into merged wall, floor and ceiling
// geometry plus pixel-art props.
//
//   #  wall               .  floor             S  entrance (stepping on it leaves)
//   a  antechamber        D  tomb gate         t  tomb floor
//   X  altar (blocked)    b  bones             T  torches on the walls round this cell
//   c  chest (blocked)    g  gate guard zone   h  hall guard zone
//   U  stair up           v  stair down        C  crown dais
//   r  the dragon's ground (crown floor)
//   o  shard socket (blocked)   Z  statue (blocked)

import * as THREE from 'three';
import { makeTexture } from './textures.js';
import { PROPS_ART } from './sprites-props.js';
import { FOES_ART } from './sprites-foes.js';
import { cachedTexture, makeSprite } from './gfx.js';
// The modern-look kit is injected by the view once it has been loaded.
let HD = null;
export function setDungeonKit(kit) { HD = kit; }

export const CELL = 4;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W as [dx, dy]

export const BARROW_MAPS = [
  [
    '###########',
    '#S..#.....#',
    '###.#.###.#',
    '#T..#.#b#.#',
    '#.###.#.#.#',
    '#.....T...#',
    '#####.#####',
    '#aaaaaaaaa#',
    '#aaaaaaaaa#',
    '####D######',
    '#ttttttttt#',
    '#tttTXtttt#',
    '###########',
  ],
  [
    '#############',
    '#S#...T.....#',
    '#.#.#####.#.#',
    '#...#b....#.#',
    '###.#.#####.#',
    '#T....#.....#',
    '#.#####.#####',
    '#.....#.....#',
    '#####.#####.#',
    '#aaaaaaa#...#',
    '#aaaaaaa..#.#',
    '#aaaaaaa#.#b#',
    '###D#########',
    '#ttttt#######',
    '#tTXtt#######',
    '#ttttt#######',
    '#############',
  ],
  [
    '###########',
    '#.....#S..#',
    '#.###.###.#',
    '#.#b#.....#',
    '#.#.#####.#',
    '#T#.......#',
    '#.#####.###',
    '#.......#b#',
    '###.#####.#',
    '#aaaaaaa..#',
    '#aaaaaaa#.#',
    '#aaaaaaa#T#',
    '#####D#####',
    '###ttttt###',
    '###tTXtt###',
    '###########',
  ],
];

export const SPIRE_MAPS = [
  [
    '###########',
    '####.U.####',
    '####ggg####',
    '#Z..ggg..Z#',
    '#T.......T#',
    '#Z.......Z#',
    '#.........#',
    '#Z..T.T..Z#',
    '#####S#####',
    '###########',
  ],
  [
    '#############',
    '#####.U.#####',
    '#####hhh#####',
    '#T...hhh...T#',
    '#.#.#...#.#.#',
    '#T.........T#',
    '#.#.#.v.#.#.#',
    '#############',
  ],
  [
    '###########',
    '###T.o.T###',
    '##.......##',
    '#o...C...o#',
    '#T.......T#',
    '#rrrrrrrrr#',
    '##.......##',
    '###..v..###',
    '###########',
  ],
];

const BLOCKED = new Set(['#', 'X', 'c', 'o', 'Z']);

function mirror(map) { return map.map((r) => [...r].reverse().join('')); }

export function barrowMap(seed) {
  const base = BARROW_MAPS[seed % BARROW_MAPS.length];
  return (seed >> 2) % 2 ? mirror(base) : base;
}

export class Level {
  constructor(map, { kind, floor = 0, hd = false }) {
    this.hd = hd;
    this.billboards = [];
    this.props = [];
    this.torches = [];
    this.map = map;
    this.kind = kind; // 'barrow' | 'spire'
    this.floor = floor;
    this.h = map.length;
    this.w = map[0].length;
    this.group = new THREE.Group();
    this.sprites = [];
    this.animated = [];
    this.statues = [];
    this.sockets = {};
    this.height = kind === 'spire' ? (floor === 2 ? 8 : 6) : 3.6;
    this.build();
  }

  at(x, y) { return y < 0 || y >= this.h || x < 0 || x >= this.w ? '#' : this.map[y][x]; }
  walkable(x, y) { return !BLOCKED.has(this.at(x, y)); }
  find(ch) {
    for (let y = 0; y < this.h; y++) {
      const x = this.map[y].indexOf(ch);
      if (x >= 0) return { x, y };
    }
    return null;
  }
  // The open direction from a cell (used to face away from a stair).
  openDir(x, y) {
    for (let d = 0; d < 4; d++) if (this.walkable(x + DIRS[d][0], y + DIRS[d][1])) return d;
    return 0;
  }
  world(x, y) { return new THREE.Vector3(x * CELL, 0, y * CELL); }

  build() {
    const wallTex = this.kind === 'spire' ? 'spirewall' : 'barrowwall';
    const floorTex = this.kind === 'spire' ? 'spirefloor' : 'barrowfloor';
    const ceilTex = this.kind === 'spire' ? 'spirewall' : 'barrowceil';
    const tex = (n) => cachedTexture(`tex:${n}`, () => makeTexture(n), { repeat: true, mips: true });
    const H = this.height;
    const buckets = { wall: [], floor: [], ceil: [] };
    const quad = (bucket, a, b, c, d, n, uw, uh) => {
      bucket.push({ v: [a, b, c, d], n, uw, uh });
    };
    const h2 = CELL / 2;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.at(x, y) === '#') continue;
        const cx = x * CELL;
        const cz = y * CELL;
        quad(buckets.floor, [cx - h2, 0, cz + h2], [cx + h2, 0, cz + h2], [cx + h2, 0, cz - h2], [cx - h2, 0, cz - h2], [0, 1, 0], 1, 1);
        quad(buckets.ceil, [cx - h2, H, cz - h2], [cx + h2, H, cz - h2], [cx + h2, H, cz + h2], [cx - h2, H, cz + h2], [0, -1, 0], 1, 1);
        const uh = H / CELL;
        if (this.at(x, y - 1) === '#') quad(buckets.wall, [cx - h2, 0, cz - h2], [cx + h2, 0, cz - h2], [cx + h2, H, cz - h2], [cx - h2, H, cz - h2], [0, 0, 1], 1, uh);
        if (this.at(x, y + 1) === '#') quad(buckets.wall, [cx + h2, 0, cz + h2], [cx - h2, 0, cz + h2], [cx - h2, H, cz + h2], [cx + h2, H, cz + h2], [0, 0, -1], 1, uh);
        if (this.at(x - 1, y) === '#') quad(buckets.wall, [cx - h2, 0, cz + h2], [cx - h2, 0, cz - h2], [cx - h2, H, cz - h2], [cx - h2, H, cz + h2], [1, 0, 0], 1, uh);
        if (this.at(x + 1, y) === '#') quad(buckets.wall, [cx + h2, 0, cz - h2], [cx + h2, 0, cz + h2], [cx + h2, H, cz + h2], [cx + h2, H, cz - h2], [-1, 0, 0], 1, uh);
      }
    }
    const mk = (list, texName, color) => {
      const pos = [];
      const nrm = [];
      const uv = [];
      const idx = [];
      list.forEach((q, i) => {
        q.v.forEach((v) => pos.push(...v));
        for (let k = 0; k < 4; k++) nrm.push(...q.n);
        uv.push(0, 0, q.uw, 0, q.uw, q.uh, 0, q.uh);
        const o = i * 4;
        idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, this.hd
        ? HD.hdMaterial(texName, { color, emissiveColor: this.kind === 'spire' ? '#c49bff' : undefined, emissiveIntensity: 1.6 })
        : new THREE.MeshLambertMaterial({ map: tex(texName), color }));
      m.receiveShadow = true;
      this.group.add(m);
    };
    mk(buckets.wall, wallTex, '#ffffff');
    mk(buckets.floor, floorTex, '#ffffff');
    mk(buckets.ceil, ceilTex, this.kind === 'spire' ? '#8877aa' : '#bbbbbb');
    this.decorate();
  }

  // A modern-look 3D prop or painted billboard at a cell.
  hdThing(name, x, y, { height, dx = 0, dz = 0, lift = 0, yaw = 0 } = {}) {
    let obj = null;
    if (name === 'sentinel') {
      obj = HD.makeBillboard('sentinel', { height });
      if (obj) { obj.material = obj.material.clone(); obj.material.color.set('#8a8a96'); this.billboards.push(obj); this.statues.push(obj); }
    } else if (name.startsWith('shard')) {
      obj = HD.makeShard(name.slice(5));
    } else if (name === 'rock') {
      obj = new THREE.Group();
      for (const part of HD.makeVegetation('rock')) obj.add(new THREE.Mesh(part.geometry, part.material));
    } else {
      obj = HD.makeProp(name);
    }
    if (!obj) return null;
    const w = this.world(x, y);
    obj.position.set(w.x + dx, lift, w.z + dz);
    obj.rotation.y = yaw;
    this.group.add(obj);
    if (obj.userData?.update) this.props.push(obj);
    return obj;
  }

  sprite(name, x, y, opts = {}) {
    if (this.hd) {
      const map = { shardsun: 'shardsun', shardmoon: 'shardmoon', shardstar: 'shardstar' };
      const hdName = map[name] || name;
      const o = this.hdThing(hdName, x, y, { ...opts, lift: name === 'torch' ? (opts.lift ?? 0) + 0.3 : opts.lift });
      if (o && name === 'torch') this.torches.push(o);
      return o;
    }
    const { height, dx = 0, dz = 0, lift = 0, art } = opts;
    const def = (art || PROPS_ART)[name];
    if (!def) return null;
    const s = makeSprite(def, name, { height });
    const w = this.world(x, y);
    s.position.set(w.x + dx, lift, w.z + dz);
    this.group.add(s);
    this.sprites.push(s);
    if (def.frames.alt) this.animated.push(s);
    return s;
  }

  decorate() {
    const stone = this.hd
      ? HD.hdMaterial(this.kind === 'spire' ? 'spirefloor' : 'stonewall')
      : new THREE.MeshLambertMaterial({ map: cachedTexture('tex:stonewall', () => makeTexture('stonewall'), { repeat: true, mips: true }) });
    const socketOrder = ['sun', 'moon', 'star'];
    let socketI = 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = this.at(x, y);
        if (ch === 'T') {
          for (let d = 0; d < 4; d++) {
            const [dx, dy] = DIRS[d];
            if (this.at(x + dx, y + dy) !== '#') continue;
            this.sprite('torch', x, y, { dx: dx * (CELL / 2 - 0.12), dz: dy * (CELL / 2 - 0.12), lift: 1.6, yaw: Math.atan2(-dx, -dy) });
          }
        } else if (ch === 'b') {
          this.sprite('bones', x, y, { dx: (x % 2 ? 0.6 : -0.6) });
        } else if (ch === 'X') {
          this.altar = this.sprite('altar', x, y, { height: 1.4 });
          this.altarCell = { x, y };
        } else if (ch === 'c') {
          this.sprite('chest', x, y);
        } else if (ch === 'Z') {
          const s = this.sprite('sentinel', x, y, { art: FOES_ART, height: 3.4 });
          if (s && !this.hd) { s.material.color.set('#777788'); this.statues.push(s); }
        } else if (ch === 'o') {
          const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.2, 8), stone);
          const w = this.world(x, y);
          ped.position.set(w.x, 0.6, w.z);
          this.group.add(ped);
          const shard = socketOrder[socketI++ % 3];
          const s = this.sprite({ sun: 'shardsun', moon: 'shardmoon', star: 'shardstar' }[shard], x, y, { lift: 1.2, height: 0.9 });
          if (s && this.hd) s.userData.baseScale = s.scale.clone();
          this.sockets[shard] = s;
        } else if (ch === 'U' || ch === 'v') {
          this.stairs(x, y, ch === 'U', stone);
        } else if (ch === 'S') {
          this.stairs(x, y, true, stone);
        } else if (ch === 'D') {
          this.gate(x, y, stone);
        }
      }
    }
  }

  // A short flight of steps against the cell's back wall.
  stairs(x, y, up, mat) {
    const back = this.openDir(x, y);
    const [bx, by] = DIRS[(back + 2) % 4];
    const w = this.world(x, y);
    // Steps fill the back half of the cell, rising (or sinking) toward the back wall.
    for (let i = 0; i < 4; i++) {
      const hgt = up ? 0.4 * (i + 1) : 0.12;
      const s = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.9, hgt, 0.45), mat);
      const off = 0.35 + i * 0.45;
      s.position.set(w.x + bx * off, up ? hgt / 2 : 0.06 - (i + 1) * 0.001, w.z + by * off);
      if (bx !== 0) s.rotation.y = Math.PI / 2;
      if (!up) s.material = new THREE.MeshLambertMaterial({ color: '#000000' });
      this.group.add(s);
    }
  }

  gate(x, y, mat) {
    const w = this.world(x, y);
    const H = this.height;
    const horizontal = this.walkable(x, y - 1) && this.walkable(x, y + 1);
    const along = horizontal ? 'x' : 'z';
    const mk = (sx, sy, sz, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(w.x + px, py, w.z + pz);
      this.group.add(m);
    };
    if (along === 'x') {
      mk(0.5, H, 0.6, -CELL / 2 + 0.25, H / 2, 0);
      mk(0.5, H, 0.6, CELL / 2 - 0.25, H / 2, 0);
      mk(CELL, 0.6, 0.7, 0, H - 0.3, 0);
    } else {
      mk(0.6, H, 0.5, 0, H / 2, -CELL / 2 + 0.25);
      mk(0.6, H, 0.5, 0, H / 2, CELL / 2 - 0.25);
      mk(0.7, 0.6, CELL, 0, H - 0.3, 0);
    }
  }

  update(t, camPos) {
    if (this.hd) {
      for (const p of this.props) p.userData.update?.(t);
      // Only the torches nearest the player keep their lights on, so the
      // shader's light count stays small.
      if (!this._lightTick || t - this._lightTick > 0.25) {
        this._lightTick = t;
        const ranked = this.torches.map((o) => [o, o.getWorldPosition(new THREE.Vector3()).distanceTo(camPos)]).sort((a, b) => a[1] - b[1]);
        ranked.forEach(([o], i) => { const l = o.userData.light; if (l) l.intensity = i < 4 ? (l.userData.base ?? (l.userData.base = l.intensity)) : 0; });
      }
      return;
    }
    const flick = Math.floor(t * 7) % 2;
    for (const s of this.animated) {
      const f = s.userData.frames;
      const want = flick ? f.alt : f.idle;
      if (want && s.material.map !== want) { s.material.map = want; s.material.needsUpdate = true; }
    }
    // Sprites are unlit, so fade them with distance from the torch the player carries.
    for (const s of this.sprites) {
      if (s.userData.selfLit) continue;
      const d = s.position.distanceTo(camPos);
      const isTorch = s.userData.name === 'torch';
      const k = isTorch ? 1 : Math.max(0.12, Math.min(1, 1.35 - d / 13));
      const base = this.statues.includes(s) ? 0.55 : 1;
      s.material.color.setScalar(k * base);
    }
  }
}

// Text drawn on the automap needs nothing fancy: one pixel per quarter cell.
export function drawAutomap(canvas, level, seen, pos, dir) {
  const g = canvas.getContext('2d');
  const s = Math.max(2, Math.floor(Math.min(canvas.width / level.w, canvas.height / level.h)));
  g.fillStyle = '#000000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const ox = Math.floor((canvas.width - level.w * s) / 2);
  const oy = Math.floor((canvas.height - level.h * s) / 2);
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      if (!seen.has(`${x},${y}`)) continue;
      const ch = level.at(x, y);
      g.fillStyle = ch === '#' ? '#555555' : ch === 'a' || ch === 'g' || ch === 'h' || ch === 'r' ? '#550000' : ch === 't' || ch === 'D' ? '#000055' : ch === 'U' || ch === 'v' || ch === 'S' ? '#aa5500' : '#aaaaaa';
      if (BLOCKED.has(ch) && ch !== '#') g.fillStyle = '#ffff55';
      g.fillRect(ox + x * s, oy + y * s, s, s);
    }
  }
  g.fillStyle = '#ff5555';
  const px = ox + pos.x * s;
  const py = oy + pos.y * s;
  g.fillRect(px, py, s, s);
  g.fillStyle = '#ffffff';
  const [dx, dy] = DIRS[dir];
  g.fillRect(px + Math.floor(s / 2) + dx * Math.floor(s / 2) - 1 + (dx === 0 ? 0 : 0), py + Math.floor(s / 2) + dy * Math.floor(s / 2) - 1, 2, 2);
}
