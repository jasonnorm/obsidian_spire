// The Gloaming Reach at walking scale: the board's map scaled up seven
// times, with life-size keeps, markets, shrines, barrows and the Spire,
// built from textured primitives and pixel-art billboards.

import * as THREE from 'three';
import { NODES, NODE_BY_ID, EDGES, ADJ, PROVINCES } from '../data.js';
import { mulberry32 } from '../engine.js';
import { makeTexture, makeBackdrop } from './textures.js';
import { PROPS_ART } from './sprites-props.js';
import { PEOPLE_ART } from './sprites-people.js';
import { cachedTexture, makeSprite, worldUV, cylinderUV, lambert, box } from './gfx.js';

export const K = 7; // board units to metres
export const EYE = 1.7;
const GROUND_R = 190;
const ASH_R = 4.7 * K;
const SPIRE_R = 13;
const SPIRE_H = 78;

export function wpos(id) {
  const n = NODE_BY_ID[id];
  return new THREE.Vector3(n.x * K, 0, n.z * K);
}
// Camera yaw that looks from a toward b.
export function yawTo(a, b) {
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

function tex(name, repeat = true) {
  return cachedTexture(`tex:${name}`, () => makeTexture(name), { repeat, mips: repeat });
}

const TERRAIN_TEX = { heath: 'heath', marsh: 'marsh', volcanic: 'volcanic', snow: 'snow', forest: 'forest', desert: 'desert' };
const SCENERY = {
  heath: ['oak', 'rock', 'boulder', 'oak', 'standingstone', 'rock'],
  marsh: ['reeds', 'reeds', 'deadtree', 'rock', 'reeds'],
  volcanic: ['deadtree', 'rock', 'boulder', 'rock'],
  snow: ['snowpine', 'snowpine', 'rock', 'boulder', 'snowpine'],
  forest: ['pine', 'pine', 'oak', 'mushroom', 'pine'],
  desert: ['cactus', 'rock', 'cactus', 'boulder'],
  ash: ['deadtree', 'bones', 'rock'],
};

export class Overland {
  constructor() {
    this.scene = new THREE.Scene();
    this.sites = {};
    this.barrowSigils = {};
    this.animated = [];
    this.rng = mulberry32(81);
    this.build();
  }

  // Asset hooks. The retro look uses the pixel-art textures and sprites;
  // the modern look (world-hd.js) overrides these.
  mat(name, opts) { return lambert(tex(name, name !== 'door'), opts); }
  glowMat(name) {
    const t = cachedTexture(`tex:${name}`, () => makeTexture(name), { repeat: true, mips: false });
    return new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, fog: false });
  }
  box(w, h, d, name, unit = 4) { return box(w, h, d, typeof name === 'string' ? this.mat(name) : name, unit); }

  build() {
    this.buildSky();
    this.buildGround();
    this.buildRoads();
    this.buildSites();
    this.buildSpire();
    this.scatter();
  }

  buildSky() {
    const s = this.scene;
    s.fog = new THREE.Fog('#550000', 70, 260);

    // Sky dome.
    this.skyUniforms = {
      uHorizon: { value: new THREE.Color('#aa5500') },
      uMid: { value: new THREE.Color('#2a0a26') },
      uZenith: { value: new THREE.Color('#000022') },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 uHorizon; uniform vec3 uMid; uniform vec3 uZenith; varying vec3 vDir;
          void main(){ float h = clamp(vDir.y, 0.0, 1.0);
            vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.12, h));
            c = mix(c, uZenith, smoothstep(0.1, 0.55, h));
            gl_FragColor = vec4(c, 1.0); }`,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    sky.renderOrder = -10;
    s.add(sky);
    this.sky = sky;

    // Stars.
    const starPos = [];
    const r = this.rng;
    for (let i = 0; i < 420; i++) {
      const th = r() * Math.PI * 2;
      const el = 0.25 + r() * 1.2;
      starPos.push(400 * Math.cos(el) * Math.cos(th), 400 * Math.sin(el), 400 * Math.cos(el) * Math.sin(th));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 }));
    s.add(this.stars);

    // Lights.
    this.hemi = new THREE.HemisphereLight('#aab0ff', '#553311', 0.9);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe6cc', 1.35);
    this.sun.position.set(-120, 60, 80);
    s.add(this.sun);

    // Mountains wrapped around the horizon.
    const bd = cachedTexture('backdrop', makeBackdrop, { repeat: true, mips: false });
    bd.wrapT = THREE.ClampToEdgeWrapping;
    bd.repeat.set(5, 1);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(300, 300, 64, 64, 1, true),
      new THREE.MeshBasicMaterial({ map: bd, side: THREE.BackSide, alphaTest: 0.5, fog: false, color: '#9a9ab0' }),
    );
    ring.position.y = 22;
    s.add(ring);
    this.mountains = ring;
  }

  buildGround() {
    const s = this.scene;
    for (const pv of PROVINCES) {
      const thetaStart = ((pv.id * 60 - 120) * Math.PI) / 180;
      const g = new THREE.RingGeometry(ASH_R, GROUND_R, 12, 4, thetaStart, Math.PI / 3);
      g.rotateX(-Math.PI / 2);
      worldUV(g, 6);
      const m = new THREE.Mesh(g, this.mat(TERRAIN_TEX[pv.terrain]));
      s.add(m);
    }
    const ash = new THREE.CircleGeometry(ASH_R + 0.01, 48);
    ash.rotateX(-Math.PI / 2);
    worldUV(ash, 6);
    s.add(new THREE.Mesh(ash, this.mat('ash')));
  }

  buildRoads() {
    const mat = this.mat('road');
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    for (const [a, b] of EDGES) {
      let pa = wpos(a);
      let pb = wpos(b);
      if (a === 'S') pa = pb.clone().setLength(SPIRE_R + 6);
      if (b === 'S') pb = pa.clone().setLength(SPIRE_R + 6);
      const len = pa.distanceTo(pb);
      const g = new THREE.PlaneGeometry(4.2, len + 4.2);
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), (uv.getY(i) * (len + 4.2)) / 4.2);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.copy(pa).add(pb).multiplyScalar(0.5);
      m.position.y = 0.03;
      m.rotation.y = Math.atan2(pb.x - pa.x, pb.z - pa.z);
      this.scene.add(m);
    }
    // A packed-earth clearing at every crossroads.
    const cg = new THREE.CircleGeometry(4.5, 16);
    cg.rotateX(-Math.PI / 2);
    worldUV(cg, 4.2);
    for (const n of NODES) {
      if (n.type === 'spire') continue;
      const c = new THREE.Mesh(cg, mat);
      c.position.copy(wpos(n.id));
      c.position.y = 0.035;
      this.scene.add(c);
    }
  }

  // Pick where a site's building goes: away from the node's own roads, clear
  // of every other crossroads and road, and preferably outward.
  clearDirection(id, dist, radius) {
    const p = wpos(id);
    const roads = ADJ[id].map((o) => {
      const q = o === 'S' ? new THREE.Vector3() : wpos(o);
      return Math.atan2(q.x - p.x, q.z - p.z);
    });
    const segs = EDGES.map(([a, b]) => [a === 'S' ? new THREE.Vector3() : wpos(a), b === 'S' ? new THREE.Vector3() : wpos(b)]);
    const segDist = (x, z, a, b) => {
      const vx = b.x - a.x; const vz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
      return Math.hypot(x - (a.x + t * vx), z - (a.z + t * vz));
    };
    const outward = Math.atan2(p.x, p.z);
    let best = outward;
    let bestScore = -Infinity;
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180;
      const cx = p.x + Math.sin(a) * dist;
      const cz = p.z + Math.cos(a) * dist;
      const clear = Math.min(...roads.map((r) => Math.abs(Math.atan2(Math.sin(a - r), Math.cos(a - r)))));
      const nodeGap = Math.min(...NODES.filter((n) => n.id !== id).map((n) => (n.type === 'spire' ? Math.hypot(cx, cz) - 14 : Math.hypot(n.x * K - cx, n.z * K - cz))));
      const roadGap = Math.min(...segs.map(([s0, s1]) => segDist(cx, cz, s0, s1)));
      const crowd = Math.max(0, radius + 7 - nodeGap) / 4 + Math.max(0, radius + 1 - roadGap) / 3;
      const score = clear + 0.35 * Math.cos(a - outward) - crowd;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  prop(name, x, z, { height, parent = this.scene, y = 0 } = {}) {
    const def = PROPS_ART[name] || PEOPLE_ART[name];
    if (!def) return null;
    const s = makeSprite(def, name, { height });
    s.position.set(x, y, z);
    parent.add(s);
    if (def.frames.alt) this.animated.push(s);
    return s;
  }

  buildSites() {
    for (const n of NODES) {
      if (n.type === 'spire') continue;
      const p = wpos(n.id);
      const dist = { keep: 31, market: 14, shrine: 16, barrow: 17 }[n.type] ?? 7;
      const radius = { keep: 13, market: 9, shrine: 7, barrow: 10 }[n.type] ?? 3;
      const dir = this.clearDirection(n.id, dist, radius);
      const c = new THREE.Vector3(p.x + Math.sin(dir) * dist, 0, p.z + Math.cos(dir) * dist);
      const g = new THREE.Group();
      g.position.copy(c);
      g.rotation.y = dir + Math.PI; // local +z faces back toward the crossroads
      let npc = null;
      if (n.type === 'keep') npc = this.makeKeep(g, n.wedge === 0);
      else if (n.type === 'market') npc = this.makeMarket(g);
      else if (n.type === 'shrine') npc = this.makeShrine(g);
      else if (n.type === 'barrow') this.makeBarrow(g, n.id);
      else this.makeWayside(g);
      this.scene.add(g);
      const focus = c.clone();
      focus.y = n.type === 'keep' ? 5 : n.type === 'barrow' ? 2.2 : n.type === 'wilds' ? 1.4 : 2.2;
      this.sites[n.id] = { group: g, center: c, dir, focus, npc, type: n.type };
    }
  }

  makeKeep(g, mine) {
    const wall = this.mat('stonewall');
    const roof = this.mat('rooftile');
    const S = 18;
    const H = 6.5;
    const T = 1.2;
    const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
    add(box(S, H, T, wall), 0, H / 2, -S / 2);
    add(box(T, H, S, wall), -S / 2, H / 2, 0);
    add(box(T, H, S, wall), S / 2, H / 2, 0);
    const seg = (S - 5) / 2;
    add(box(seg, H, T, wall), -(5 / 2 + seg / 2), H / 2, S / 2);
    add(box(seg, H, T, wall), 5 / 2 + seg / 2, H / 2, S / 2);
    add(box(5, 1.6, T, wall), 0, H - 0.8, S / 2);
    // Gate.
    const door = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.2), this.mat('door'));
    add(door, 0, 2.6, S / 2 - 0.2);
    // Crenellations.
    for (let i = -S / 2; i <= S / 2; i += 1.8) {
      for (const [x, z] of [[i, -S / 2], [i, S / 2], [-S / 2, i], [S / 2, i]]) add(box(0.9, 1.1, 1.3, wall, 2), x, H + 0.55, z);
    }
    // Towers.
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cg = cylinderUV(new THREE.CylinderGeometry(2.5, 2.7, 9.5, 8), 2.6, 9.5);
      add(new THREE.Mesh(cg, wall), (x * S) / 2, 4.75, (z * S) / 2);
      const rg = cylinderUV(new THREE.ConeGeometry(3.1, 4.5, 8), 3.1, 4.5);
      add(new THREE.Mesh(rg, roof), (x * S) / 2, 9.5 + 2.25, (z * S) / 2);
    }
    // Great tower.
    add(box(8, 14, 8, wall), 0, 7, -2);
    const kr = cylinderUV(new THREE.ConeGeometry(6.2, 6, 4), 6, 6);
    const keepRoof = add(new THREE.Mesh(kr, roof), 0, 17, -2);
    keepRoof.rotation.y = Math.PI / 4;
    this.prop(mine ? 'bannerCrimson' : 'bannerAzure', -3.6, S / 2 + 1.2, { parent: g });
    this.prop(mine ? 'bannerCrimson' : 'bannerAzure', 3.6, S / 2 + 1.2, { parent: g });
    return mine ? this.prop('steward', 1.6, S / 2 + 2.5, { parent: g }) : null;
  }

  makeMarket(g) {
    const wood = this.mat('wood');
    const canvas = this.mat('canvas', { side: THREE.DoubleSide });
    const cob = new THREE.CircleGeometry(8.5, 20);
    cob.rotateX(-Math.PI / 2);
    worldUV(cob, 3);
    const yard = new THREE.Mesh(cob, this.mat('cobble'));
    yard.position.y = 0.04;
    g.add(yard);
    const stall = (x, z, rot) => {
      const st = new THREE.Group();
      st.position.set(x, 0, z);
      st.rotation.y = rot;
      for (const [px, pz] of [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]]) {
        const post = box(0.25, 2.8, 0.25, wood, 2);
        post.position.set(px, 1.4, pz);
        st.add(post);
      }
      const counter = box(3.4, 1, 0.8, wood, 2);
      counter.position.set(0, 0.5, 1.1);
      st.add(counter);
      const aw = box(4, 0.12, 3.2, canvas, 2);
      aw.position.set(0, 2.85, 0.3);
      aw.rotation.x = 0.28;
      st.add(aw);
      g.add(st);
    };
    stall(-5.2, -1.5, 0.5);
    stall(0, -3.2, 0);
    stall(5.2, -1.5, -0.5);
    this.prop('crate', -3, 1.2, { parent: g });
    this.prop('barrel', -2.2, 0.4, { parent: g });
    this.prop('barrel', 3.4, 1, { parent: g });
    this.prop('cart', 6.4, 3.2, { parent: g });
    this.prop('well', -6.2, 3.6, { parent: g });
    return this.prop('merchant', 0, -1.2, { parent: g });
  }

  makeShrine(g) {
    const marble = this.mat('marble');
    const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
    add(new THREE.Mesh(cylinderUV(new THREE.CylinderGeometry(6.4, 6.6, 0.4, 16), 6.4, 0.4, 3), marble), 0, 0.2, 0);
    add(new THREE.Mesh(cylinderUV(new THREE.CylinderGeometry(5.6, 5.6, 0.5, 16), 5.6, 0.5, 3), marble), 0, 0.65, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      add(new THREE.Mesh(cylinderUV(new THREE.CylinderGeometry(0.38, 0.45, 5, 8), 0.4, 5, 2), marble), Math.sin(a) * 4.6, 3.4, Math.cos(a) * 4.6);
    }
    add(new THREE.Mesh(cylinderUV(new THREE.CylinderGeometry(5.1, 5.1, 0.9, 16, 1, true), 5.1, 0.9, 3), this.mat('marble', { side: THREE.DoubleSide })), 0, 6.3, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.mat('marble'));
    dome.scale.y = 0.7;
    add(dome, 0, 6.7, 0);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 6), this.mat('gold')), 0, 10.9, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 1.1, 8), this.mat('stonewall')), 0, 1.45, 0);
    this.prop('campfire', 0, 0, { parent: g, y: 2.0, height: 0.9 });
    const light = new THREE.PointLight('#ffaa55', 6, 14, 1.4);
    light.position.set(0, 3, 0);
    g.add(light);
    return this.prop('priest', 0, 6.4, { parent: g });
  }

  makeBarrow(g, id) {
    const mg = new THREE.SphereGeometry(8.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const uv = mg.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9, uv.getY(i) * 3);
    const mound = new THREE.Mesh(mg, this.mat('grassmound'));
    mound.scale.y = 0.48;
    g.add(mound);
    const stone = this.mat('barrowwall', { color: '#cfcfcf' });
    const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
    add(box(1.1, 3.6, 1.1, stone, 2), -1.7, 1.8, 7.6);
    add(box(1.1, 3.6, 1.1, stone, 2), 1.7, 1.8, 7.6);
    add(box(4.8, 1, 1.4, stone, 2), 0, 4.0, 7.6);
    const dark = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.5, 3), new THREE.MeshBasicMaterial({ color: '#000000' }));
    add(dark, 0, 1.75, 6.8);
    for (const [x, z] of [[-6.5, 7.5], [6.8, 7], [-9.5, 0], [9.4, 1]]) this.prop('standingstone', x, z, { parent: g });
    const sig = new THREE.Group();
    sig.position.set(0, 5.6, 7.6);
    g.add(sig);
    this.barrowSigils[id] = { group: sig, sprite: null, key: null };
  }

  makeWayside(g) {
    this.prop('signpost', -2.5, 3.5, { parent: g });
    if (this.rng() < 0.5) this.prop('rock', 2, 2.5, { parent: g });
  }

  buildSpire() {
    const g = new THREE.Group();
    const obs = this.mat('obsidian', { color: '#c8c0d8' });
    const plinth = new THREE.Mesh(cylinderUV(new THREE.CylinderGeometry(SPIRE_R + 3, SPIRE_R + 4, 4, 8), SPIRE_R + 3, 4), obs);
    plinth.position.y = 2;
    g.add(plinth);
    const shaft = new THREE.Mesh(cylinderUV(new THREE.CylinderGeometry(8, SPIRE_R, SPIRE_H, 8), 10.5, SPIRE_H, 5), obs);
    shaft.position.y = 4 + SPIRE_H / 2;
    g.add(shaft);
    // Buttresses.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = box(2.2, 34, 6, obs, 4);
      b.position.set(Math.sin(a) * (SPIRE_R + 1.5), 18, Math.cos(a) * (SPIRE_R + 1.5));
      b.rotation.y = a;
      b.rotation.x = -0.12;
      g.add(b);
    }
    // Glowing rune band and window slits.
    const band = new THREE.Mesh(
      cylinderUV(new THREE.CylinderGeometry(10.4, 10.7, 3.2, 8, 1, true), 10.5, 3.2, 3.2),
      this.glowMat('runeband'),
    );
    band.position.y = 4 + SPIRE_H * 0.62;
    g.add(band);
    this.slitMat = new THREE.MeshBasicMaterial({ color: '#aa55ff', fog: false });
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const y = 16 + k * 13;
        const rr = SPIRE_R - (y / SPIRE_H) * (SPIRE_R - 8) + 0.25;
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.4, 0.3), this.slitMat);
        slit.position.set(Math.sin(a) * rr, y, Math.cos(a) * rr);
        slit.rotation.y = a;
        g.add(slit);
      }
    }
    // Crown of claws.
    const crownY = 4 + SPIRE_H;
    const cap = new THREE.Mesh(cylinderUV(new THREE.CylinderGeometry(10, 8, 2.5, 8), 9, 2.5), obs);
    cap.position.y = crownY + 1.2;
    g.add(cap);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const claw = new THREE.Mesh(new THREE.ConeGeometry(1.2, 12, 4), obs);
      claw.position.set(Math.sin(a) * 8.5, crownY + 7, Math.cos(a) * 8.5);
      // Tilt each claw outward around the tangent.
      claw.quaternion.setFromAxisAngle(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), 0.42);
      g.add(claw);
    }
    this.crystalMat = new THREE.MeshBasicMaterial({ color: '#ffb347', fog: false });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(4.5, 0), this.crystalMat);
    crystal.scale.y = 1.9;
    crystal.position.y = crownY + 9;
    g.add(crystal);
    this.crystal = crystal;
    this.crownLight = new THREE.PointLight('#ffb347', 30, 220, 1.1);
    this.crownLight.position.y = crownY + 9;
    g.add(this.crownLight);
    // A gate that turns to face whoever arrives.
    const gate = new THREE.Group();
    const gd = new THREE.Mesh(new THREE.PlaneGeometry(6, 9), this.mat('door', { color: '#8888aa' }));
    gd.position.set(0, 8.5, SPIRE_R + 3.05);
    gate.add(gd);
    const steps = box(9, 4, 4, obs, 2);
    steps.position.set(0, 2, SPIRE_R + 4.2);
    gate.add(steps);
    // Torches either side of the gate so it reads against the black stone.
    const gateLight = new THREE.PointLight('#ffaa55', 14, 26, 1.3);
    gateLight.position.set(0, 6, SPIRE_R + 8);
    gate.add(gateLight);
    for (const x of [-4.2, 4.2]) this.prop('torch', x, SPIRE_R + 3.4, { parent: gate, y: 6, height: 1.6 });
    g.add(gate);
    this.spireGate = gate;
    this.scene.add(g);
    this.spire = g;
  }

  scatter() {
    const rng = this.rng;
    const segs = EDGES.map(([a, b]) => [a === 'S' ? new THREE.Vector3() : wpos(a), b === 'S' ? new THREE.Vector3() : wpos(b)]);
    const nearRoad = (x, z) => segs.some(([a, b]) => {
      const vx = b.x - a.x; const vz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
      return Math.hypot(x - (a.x + t * vx), z - (a.z + t * vz)) < 5;
    });
    const sites = Object.values(this.sites);
    const placed = [];
    const tryPlace = (kinds, x, z) => {
      if (Math.hypot(x, z) < SPIRE_R + 8) return false;
      if (nearRoad(x, z)) return false;
      if (NODES.some((n) => Math.hypot(n.x * K - x, n.z * K - z) < 7)) return false;
      if (sites.some((st) => st.type !== 'wilds' && Math.hypot(st.center.x - x, st.center.z - z) < (st.type === 'keep' ? 17 : 11))) return false;
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3.2)) return false;
      const kind = kinds[Math.floor(rng() * kinds.length)];
      this.prop(kind, x, z, { height: (PROPS_ART[kind]?.height || 1) * (0.8 + rng() * 0.5) });
      placed.push([x, z]);
      return true;
    };
    for (const pv of PROVINCES) {
      let n = 0;
      for (let tries = 0; tries < 900 && n < 70; tries++) {
        const a = ((pv.id * 60 - 29 + rng() * 58) * Math.PI) / 180;
        const r = ASH_R + 2 + rng() * 100;
        if (tryPlace(SCENERY[pv.terrain], r * Math.sin(a), r * Math.cos(a))) n++;
      }
    }
    for (let tries = 0, n = 0; tries < 300 && n < 22; tries++) {
      const a = rng() * Math.PI * 2;
      const r = SPIRE_R + 9 + rng() * (ASH_R - SPIRE_R - 10);
      if (tryPlace(SCENERY.ash, r * Math.sin(a), r * Math.cos(a))) n++;
    }
  }

  // ---------- dynamic state ----------
  setBarrow(id, shard, dim) {
    const s = this.barrowSigils[id];
    if (!s) return;
    const key = `${shard}|${dim}`;
    if (s.key === key) return;
    s.key = key;
    if (s.sprite) { s.group.remove(s.sprite); s.sprite = null; }
    if (!shard) return;
    const name = { sun: 'shardsun', moon: 'shardmoon', star: 'shardstar' }[shard];
    s.sprite = this.prop(name, 0, 0, { parent: s.group, height: 1.5 });
    if (s.sprite && dim) s.sprite.material.color.set('#666677');
  }

  placeRival(nodeId, playerNode) {
    if (!this.rival) {
      this.rival = this.prop('vael', 0, 0);
    }
    if (!this.rival) return;
    const p = nodeId === 'S' ? new THREE.Vector3(0, 0, 1).setLength(SPIRE_R + 9) : wpos(nodeId);
    const site = this.sites[nodeId];
    const side = site ? site.dir + Math.PI / 2 : 0;
    const off = nodeId === playerNode ? 6 : 3.5;
    this.rival.position.set(p.x + Math.sin(side) * off, 0, p.z + Math.cos(side) * off);
  }

  setGloom(t) {
    const u = this.skyUniforms;
    u.uHorizon.value.set('#aa5500').lerp(new THREE.Color('#550055'), t);
    u.uMid.value.set('#2a0a26').lerp(new THREE.Color('#110016'), t);
    u.uZenith.value.set('#000022').lerp(new THREE.Color('#000000'), t);
    this.scene.fog.color.copy(u.uMid.value).lerp(u.uHorizon.value, 0.4);
    this.scene.fog.near = 70 - 40 * t;
    this.scene.fog.far = 260 - 120 * t;
    this.hemi.intensity = 0.9 - 0.45 * t;
    this.sun.intensity = 1.35 - 0.9 * t;
    this.mountains.material.color.set('#9a9ab0').lerp(new THREE.Color('#554466'), t);
    this.stars.material.opacity = 0.5 + 0.5 * t;
  }

  setMood(color, intensity = 1) {
    this.crystalMat.color.set(color);
    this.crownLight.color.set(color);
    this.crownLight.intensity = 30 * intensity;
    this.slitMat.color.set(color).lerp(new THREE.Color('#aa55ff'), 0.5);
  }

  pulse() { this.pulseT = performance.now(); }

  faceGate(fromId) {
    const p = wpos(fromId);
    this.spireGate.rotation.y = Math.atan2(p.x, p.z);
  }

  // Where the camera stands at the Spire, coming from an inner-ring node.
  spireStand(fromId) {
    const p = fromId && fromId !== 'S' ? wpos(fromId) : new THREE.Vector3(0, 0, 1);
    return p.clone().setLength(SPIRE_R + 21);
  }

  update(t) {
    this.crystal.rotation.y = t * 0.4;
    if (this.pulseT) {
      const k = (performance.now() - this.pulseT) / 700;
      this.crownLight.intensity = 30 + Math.max(0, 1 - k) * 80;
      if (k > 1) this.pulseT = 0;
    }
    const flick = Math.floor(t * 6) % 2;
    for (const s of this.animated) {
      const f = s.userData.frames;
      const want = flick ? f.alt : f.idle;
      if (want && s.material.map !== want) { s.material.map = want; s.material.needsUpdate = true; }
    }
    for (const s of Object.values(this.barrowSigils)) if (s.sprite) s.sprite.position.y = Math.sin(t * 2) * 0.25;
  }
}
