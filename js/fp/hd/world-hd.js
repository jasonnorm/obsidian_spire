// The Gloaming Reach in the modern look: rolling terrain with the provinces
// blended into one another, a physical dusk sky, PBR buildings, instanced 3D
// vegetation and painted, lit billboards for the people of the Reach.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { NODES, EDGES, PROVINCES } from '../../data.js';
import { mulberry32 } from '../../engine.js';
import { Overland, wpos, K } from '../world.js';
import { hdMaterial, hdTextures, makeBillboard, faceBillboards, HD_ART } from './gfx-hd.js';
import { makeHDBackdrop, HD_SPECS } from './textures-hd.js';
import { makeVegetation, makeProp, makeShard, VEGETATION } from './props-hd.js';

const ASH_R = 4.7 * K;
const SPIRE_R = 13;
const SPLAT = ['heath', 'marsh', 'volcanic', 'snow', 'forest', 'desert', 'ash'];
const TERRAIN_INDEX = { heath: 0, marsh: 1, volcanic: 2, snow: 3, forest: 4, desert: 5 };
const SCENERY_HD = {
  heath: { trees: ['oak', 'oak', 'bush', 'boulder', 'standingstone', 'rock'], ground: ['grasstuft'] },
  marsh: { trees: ['reeds', 'reeds', 'deadtree', 'bush', 'rock'], ground: ['reeds', 'grasstuft'] },
  volcanic: { trees: ['deadtree', 'rock', 'boulder', 'rock'], ground: ['rock'] },
  snow: { trees: ['snowpine', 'snowpine', 'snowpine', 'boulder', 'rock'], ground: ['rock'] },
  forest: { trees: ['pine', 'pine', 'oak', 'pine', 'bush', 'mushroom'], ground: ['grasstuft', 'mushroom'] },
  desert: { trees: ['cactus', 'rock', 'cactus', 'boulder'], ground: ['rock'] },
  ash: { trees: ['deadtree', 'rock', 'boulder'], ground: ['rock'] },
};
const PEOPLE = new Set(['merchant', 'priest', 'steward', 'pilgrim', 'peddler', 'sellsword', 'raven', 'vael']);

// ---------------------------------------------------------------- noise
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) { s += a * (vnoise(x * f, y * f) * 2 - 1); f *= 2.03; a *= 0.5; }
  return s;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const SEGS = EDGES.map(([a, b]) => [a === 'S' ? new THREE.Vector3() : wpos(a), b === 'S' ? new THREE.Vector3() : wpos(b)]);
function segDist(x, z, a, b) {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - (a.x + t * vx), z - (a.z + t * vz));
}

export class OverlandHD extends Overland {
  // ------------------------------------------------------------ asset hooks
  mat(name, opts = {}) {
    const tuned = {
      obsidian: { roughness: 0.28, metalness: 0.25, color: '#9a94a8' },
      marble: { roughness: 0.45 },
      gold: { roughness: 0.3, metalness: 1 },
      door: {},
    }[name] || {};
    return hdMaterial(name, { ...tuned, color: opts.color && name !== 'obsidian' ? opts.color : tuned.color, side: opts.side });
  }

  glowMat(name) {
    const t = hdTextures(name);
    return new THREE.MeshStandardMaterial({
      map: t.map, emissiveMap: t.emissive || t.map, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 2.4,
      side: THREE.DoubleSide, roughness: 0.5,
    });
  }

  prop(name, x, z, { height, parent = this.scene, y = 0 } = {}) {
    let obj = null;
    if (PEOPLE.has(name) && HD_ART[name]) {
      obj = makeBillboard(name, { height });
      if (obj) (this.billboards ||= []).push(obj);
    } else {
      const kind = name === 'campfire' && y > 0.5 ? 'brazier' : name;
      if (VEGETATION.includes(kind)) {
        obj = new THREE.Group();
        for (const part of makeVegetation(kind)) {
          const m = new THREE.Mesh(part.geometry, part.material);
          m.castShadow = true;
          m.receiveShadow = true;
          obj.add(m);
        }
        const base = { standingstone: 3, rock: 0.8, boulder: 2.2 }[kind];
        if (height && base) obj.scale.setScalar(height / base);
      } else {
        try { obj = makeProp(kind); } catch (e) { obj = null; }
      }
      if (obj?.userData?.update) (this.updaters ||= []).push(obj);
    }
    if (!obj) return null;
    obj.position.set(x, y, z);
    parent.add(obj);
    return obj;
  }

  // ------------------------------------------------------------ build
  build() {
    super.build();
    // Every solid thing casts and receives shadows; the ground only receives.
    this.scene.traverse((o) => {
      if (!o.isMesh || o.userData.noShadow) return;
      if (o.castShadow === false && !o.userData.billboard) o.castShadow = true;
      o.receiveShadow = true;
    });
  }

  buildSky() {
    const s = this.scene;
    s.fog = new THREE.FogExp2('#7d6470', 0.0042);
    s.background = new THREE.Color('#2a1c2a');
    const sky = new Sky();
    sky.scale.setScalar(4500);
    const u = sky.material.uniforms;
    u.turbidity.value = 10;
    u.rayleigh.value = 3;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    this.skyMesh = sky;
    s.add(sky);
    this.sunDir = new THREE.Vector3();

    const r = this.rng;
    const starPos = [];
    for (let i = 0; i < 900; i++) {
      const th = r() * Math.PI * 2;
      const el = 0.12 + r() * 1.35;
      starPos.push(3000 * Math.cos(el) * Math.cos(th), 3000 * Math.sin(el), 3000 * Math.cos(el) * Math.sin(th));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
    s.add(this.stars);

    this.hemi = new THREE.HemisphereLight('#b9b4e6', '#4a3424', 0.75);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffc38a', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    s.add(this.sun);
    s.add(this.sun.target);

    // Far mountains, painted, around the whole horizon.
    const bdCanvas = makeHDBackdrop();
    const bd = new THREE.CanvasTexture(bdCanvas);
    bd.colorSpace = THREE.SRGBColorSpace;
    bd.wrapS = THREE.RepeatWrapping;
    bd.repeat.set(3, 1);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(1100, 1100, 260, 96, 1, true),
      new THREE.MeshBasicMaterial({ map: bd, side: THREE.BackSide, transparent: true, alphaTest: 0.02, fog: false, depthWrite: false, color: '#c9b9c4' }),
    );
    ring.position.y = 70;
    ring.renderOrder = -5;
    ring.userData.noShadow = true;
    s.add(ring);
    this.mountains = ring;
    this.setSun(2.2, 248);
  }

  setSun(elevationDeg, azimuthDeg) {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    this.skyMesh.material.uniforms.sunPosition.value.copy(this.sunDir);
  }

  heightAt(x, z) {
    const r = Math.hypot(x, z);
    let d = Infinity;
    for (const [a, b] of SEGS) d = Math.min(d, segDist(x, z, a, b));
    for (const st of Object.values(this.sites || {})) d = Math.min(d, Math.hypot(st.center.x - x, st.center.z - z) - (st.type === 'keep' ? 16 : 10));
    const mask = smooth(4, 24, d) * smooth(SPIRE_R + 10, SPIRE_R + 30, r);
    const hills = fbm(x * 0.011, z * 0.011) * 9 + fbm(x * 0.05 + 7, z * 0.05) * 1.6;
    const rim = smooth(85, 200, r) * (30 + fbm(x * 0.006, z * 0.006) * 25);
    return Math.max(-0.4, hills * mask + rim * smooth(0, 30, d));
  }

  buildGround() {
    // Sites are placed later; flatten around where they will be.
    this.sites = this.sites || {};
    const size = 520;
    const seg = 200;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    const w1 = new Float32Array(pos.count * 4);
    const w2 = new Float32Array(pos.count * 4);
    this.groundGeo = g;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      uv.setXY(i, x, z);
      const r = Math.hypot(x, z);
      const phi = (Math.atan2(x, z) * 180) / Math.PI;
      const ws = PROVINCES.map((pv) => {
        const dd = Math.abs(((phi - pv.id * 60 + 540) % 360) - 180);
        return smooth(38, 22, dd);
      });
      const total = ws.reduce((a, b) => a + b, 0) || 1;
      const ash = smooth(ASH_R + 5, ASH_R - 5, r);
      const wt = new Array(7).fill(0);
      PROVINCES.forEach((pv, k) => { wt[TERRAIN_INDEX[pv.terrain]] += (ws[k] / total) * (1 - ash); });
      wt[6] = ash;
      w1.set([wt[0], wt[1], wt[2], wt[3]], i * 4);
      w2.set([wt[4], wt[5], wt[6], 0], i * 4);
    }
    g.setAttribute('w1', new THREE.BufferAttribute(w1, 4));
    g.setAttribute('w2', new THREE.BufferAttribute(w2, 4));
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const maps = SPLAT.map((n) => hdTextures(n));
    mat.normalMap = maps[0].normal; // turns on the tangent-space normal path; sampling is replaced below
    mat.onBeforeCompile = (shader) => {
      SPLAT.forEach((n, k) => {
        shader.uniforms[`sTex${k}`] = { value: maps[k].map };
        shader.uniforms[`sNrm${k}`] = { value: maps[k].normal };
      });
      shader.uniforms.sScale = { value: SPLAT.map((n) => HD_SPECS[n]?.metres || 6) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 w1; attribute vec4 w2; varying vec4 vW1; varying vec4 vW2; varying vec2 vWXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW1 = w1; vW2 = w2; vWXZ = (modelMatrix * vec4(position, 1.0)).xz;');
      const decl = SPLAT.map((n, k) => `uniform sampler2D sTex${k}; uniform sampler2D sNrm${k};`).join('\n');
      const sum = (pre, suffix) => SPLAT.map((n, k) => `texture2D(${pre}${k}, p / sScale[${k}])${suffix} * ${['vW1.x', 'vW1.y', 'vW1.z', 'vW1.w', 'vW2.x', 'vW2.y', 'vW2.z'][k]}`).join(' + ');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${decl}\nuniform float sScale[7];\nvarying vec4 vW1; varying vec4 vW2; varying vec2 vWXZ;
vec3 splatColor() { vec2 p = vWXZ; return ${sum('sTex', '.rgb')}; }
vec3 splatNormal() { vec2 p = vWXZ; return ${sum('sNrm', '.xyz')}; }`)
        .replace('#include <map_fragment>', 'diffuseColor.rgb *= splatColor();')
        .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = splatNormal() * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
#endif`);
    };
    const ground = new THREE.Mesh(g, mat);
    ground.receiveShadow = true;
    ground.userData.noShadow = true;
    ground.castShadow = false;
    this.scene.add(ground);
    this.ground = ground;
  }

  // Heights depend on where the sites are, so shape the terrain afterwards.
  shapeGround() {
    const g = this.groundGeo;
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  buildRoads() {
    // Soft-edged road ribbons laid on the flattened ground.
    const t = hdTextures('road');
    const edge = document.createElement('canvas');
    edge.width = 64;
    edge.height = 4;
    const eg = edge.getContext('2d');
    const grad = eg.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, '#000');
    grad.addColorStop(0.22, '#fff');
    grad.addColorStop(0.78, '#fff');
    grad.addColorStop(1, '#000');
    eg.fillStyle = grad;
    eg.fillRect(0, 0, 64, 4);
    const alpha = new THREE.CanvasTexture(edge);
    const mat = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normal, alphaMap: alpha, transparent: true, depthWrite: false,
      roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4,
    });
    const W = 5;
    for (const [a, b] of EDGES) {
      let pa = wpos(a);
      let pb = wpos(b);
      if (a === 'S') pa = pb.clone().setLength(SPIRE_R + 6);
      if (b === 'S') pb = pa.clone().setLength(SPIRE_R + 6);
      const len = pa.distanceTo(pb) + W;
      const g = new THREE.PlaneGeometry(W, len, 1, Math.ceil(len / 2));
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), (uv.getY(i) * len) / 4);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.copy(pa).add(pb).multiplyScalar(0.5);
      m.position.y = 0.06;
      m.rotation.y = Math.atan2(pb.x - pa.x, pb.z - pa.z);
      m.receiveShadow = true;
      m.userData.noShadow = true;
      m.renderOrder = 1;
      this.scene.add(m);
    }
    // Alpha maps read the green channel and need their own UVs, so the
    // crossroad clearings use a radial version.
    const rc = document.createElement('canvas');
    rc.width = rc.height = 64;
    const rg = rc.getContext('2d');
    const rgrad = rg.createRadialGradient(32, 32, 10, 32, 32, 32);
    rgrad.addColorStop(0, '#fff');
    rgrad.addColorStop(1, '#000');
    rg.fillStyle = rgrad;
    rg.fillRect(0, 0, 64, 64);
    const clearMat = mat.clone();
    clearMat.alphaMap = new THREE.CanvasTexture(rc);
    const cg = new THREE.CircleGeometry(6.5, 24);
    cg.rotateX(-Math.PI / 2);
    for (const n of NODES) {
      if (n.type === 'spire') continue;
      const c = new THREE.Mesh(cg, clearMat);
      c.position.copy(wpos(n.id));
      c.position.y = 0.07;
      c.receiveShadow = true;
      c.userData.noShadow = true;
      c.renderOrder = 1;
      this.scene.add(c);
    }
  }

  buildSpire() {
    super.buildSpire();
    this.shapeGround();
  }

  scatter() {
    const rng = mulberry32(4242);
    const sites = Object.values(this.sites);
    const nodeNear = (x, z, d) => NODES.some((n) => Math.hypot(n.x * K - x, n.z * K - z) < d);
    const roadNear = (x, z, d) => SEGS.some(([a, b]) => segDist(x, z, a, b) < d);
    const siteNear = (x, z, pad) => sites.some((st) => st.type !== 'wilds' && st.type !== 'road' && Math.hypot(st.center.x - x, st.center.z - z) < (st.type === 'keep' ? 18 : 12) + pad);
    const buckets = {};
    const add = (kind, x, z, s, shadow) => {
      (buckets[kind] ||= { list: [], shadow }).list.push([x, this.heightAt(x, z), z, rng() * Math.PI * 2, s]);
    };
    const place = (terrain, count, big, rMin, rMax, a0, a1) => {
      const set = SCENERY_HD[terrain];
      let n = 0;
      for (let tries = 0; tries < count * 8 && n < count; tries++) {
        const a = ((a0 + rng() * (a1 - a0)) * Math.PI) / 180;
        const r = rMin + rng() * (rMax - rMin);
        const x = r * Math.sin(a);
        const z = r * Math.cos(a);
        if (Math.hypot(x, z) < SPIRE_R + 9) continue;
        if (roadNear(x, z, big ? 5.5 : 3.2) || nodeNear(x, z, big ? 9 : 6) || siteNear(x, z, big ? 2 : 0)) continue;
        const pool = big ? set.trees : set.ground;
        const kind = pool[Math.floor(rng() * pool.length)];
        add(kind, x, z, 0.75 + rng() * 0.6, big && kind !== 'grasstuft' && kind !== 'reeds');
        n++;
      }
    };
    for (const pv of PROVINCES) {
      const a0 = pv.id * 60 - 29;
      const a1 = pv.id * 60 + 29;
      place(pv.terrain, 130, true, ASH_R + 3, 165, a0, a1);
      place(pv.terrain, 320, false, ASH_R + 2, 110, a0, a1);
    }
    place('ash', 45, true, SPIRE_R + 10, ASH_R, 0, 360);
    const dummy = new THREE.Object3D();
    for (const [kind, { list, shadow }] of Object.entries(buckets)) {
      const parts = makeVegetation(kind);
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        list.forEach(([x, y, z, rot, s], i) => {
          dummy.position.set(x, y - 0.05, z);
          dummy.rotation.set(0, rot, 0);
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = shadow;
        im.receiveShadow = true;
        im.userData.noShadow = !shadow;
        im.computeBoundingSphere();
        this.scene.add(im);
      }
    }
  }

  // ------------------------------------------------------------ dynamic
  setBarrow(id, shard, dim) {
    const s = this.barrowSigils[id];
    if (!s) return;
    const key = `${shard}|${dim}`;
    if (s.key === key) return;
    s.key = key;
    if (s.sprite) { s.group.remove(s.sprite); s.sprite = null; }
    if (!shard) return;
    const gem = makeShard(shard);
    gem.scale.setScalar(dim ? 1.4 : 2.2);
    s.group.add(gem);
    s.sprite = gem;
    (this.updaters ||= []).push(gem);
  }

  placeRival(nodeId, playerNode) {
    if (!this.rival) {
      this.rival = makeBillboard('vael');
      if (!this.rival) return;
      this.scene.add(this.rival);
      (this.billboards ||= []).push(this.rival);
    }
    const p = nodeId === 'S' ? new THREE.Vector3(0, 0, 1).setLength(SPIRE_R + 9) : wpos(nodeId);
    const site = this.sites[nodeId];
    const side = site ? site.dir + Math.PI / 2 : 0;
    const off = nodeId === playerNode ? 6 : 3.5;
    this.rival.position.set(p.x + Math.sin(side) * off, 0, p.z + Math.cos(side) * off);
  }

  setGloom(t) {
    this.gloomT = t;
    // Dusk drains toward night as the Gloom rises.
    this.setSun(2.2 - 6 * t, 248);
    const u = this.skyMesh.material.uniforms;
    u.turbidity.value = 10 + 6 * t;
    u.rayleigh.value = 3 + 1.5 * t;
    this.scene.fog.color.set('#7d6470').lerp(new THREE.Color('#1c1426'), t);
    this.scene.fog.density = 0.0042 + 0.004 * t;
    this.hemi.intensity = 0.75 - 0.35 * t;
    this.sun.intensity = Math.max(0.15, 2.6 - 2.3 * t);
    this.sun.color.set('#ffc38a').lerp(new THREE.Color('#b06a8a'), t);
    this.mountains.material.color.set('#c9b9c4').lerp(new THREE.Color('#3a3046'), t);
    this.stars.material.opacity = Math.max(0, t * 1.2 - 0.15);
    this.envDirty = true;
  }

  // Refresh image-based lighting from the sky now and then.
  updateEnvironment(renderer) {
    if (!this.envDirty && this.scene.environment) return;
    this.envDirty = false;
    const pm = this.pmrem || (this.pmrem = new THREE.PMREMGenerator(renderer));
    const skyScene = this.skyScene || (this.skyScene = new THREE.Scene());
    const clone = this.skyClone || (this.skyClone = new Sky());
    clone.scale.setScalar(4500);
    for (const k of Object.keys(clone.material.uniforms)) {
      const v = this.skyMesh.material.uniforms[k].value;
      if (v?.copy) clone.material.uniforms[k].value.copy(v); else clone.material.uniforms[k].value = v;
    }
    skyScene.add(clone);
    const rt = pm.fromScene(skyScene, 0, 1, 6000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }

  update(t, camera) {
    super.update(t);
    for (const o of this.updaters || []) o.userData.update?.(t);
    if (camera) {
      faceBillboards(this.billboards || [], camera);
      // Keep the sun's shadow box centred on the viewer.
      this.sun.position.copy(camera.position).addScaledVector(this.sunDir, 220);
      this.sun.target.position.copy(camera.position);
      this.sun.target.updateMatrixWorld();
    }
  }
}
