// Modern-look helpers for the first-person view: PBR materials from the
// procedural HD textures, painted SVG illustrations rasterised into lit
// billboards, and a full-resolution renderer with shadows and bloom.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeHD, HD_SPECS } from './textures-hd.js';
import { ART_FOES_A } from './art-foes-a.js';
import { ART_FOES_B } from './art-foes-b.js';
import { ART_PEOPLE } from './art-people.js';

export const HD_ART = { ...ART_FOES_A, ...ART_FOES_B, ...ART_PEOPLE };

let maxAniso = 8;
export function setMaxAnisotropy(n) { maxAniso = n; }

// ---------------------------------------------------------------- textures
const texCache = new Map();
function canvasTex(canvas, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

export function hdTextures(name) {
  if (!texCache.has(name)) {
    const spec = HD_SPECS[name] || {};
    const set = makeHD(name);
    texCache.set(name, {
      map: canvasTex(set.map, { repeat: spec.tile !== false }),
      normal: canvasTex(set.normal, { srgb: false, repeat: spec.tile !== false }),
      emissive: set.emissive ? canvasTex(set.emissive, { repeat: spec.tile !== false }) : null,
      spec,
    });
  }
  return texCache.get(name);
}

const matCache = new Map();
export function hdMaterial(name, { color = '#ffffff', side = THREE.FrontSide, emissiveColor, emissiveIntensity = 1, roughness, metalness, normalScale = 1 } = {}) {
  const key = `${name}|${color}|${side}|${emissiveColor}|${emissiveIntensity}|${roughness}|${metalness}|${normalScale}`;
  if (!matCache.has(key)) {
    const t = hdTextures(name);
    const m = new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normal,
      normalScale: new THREE.Vector2(normalScale, normalScale),
      color,
      side,
      roughness: roughness ?? t.spec.roughness ?? 0.85,
      metalness: metalness ?? t.spec.metalness ?? 0,
    });
    if (t.emissive) {
      m.emissiveMap = t.emissive;
      m.emissive = new THREE.Color(emissiveColor || '#ffffff');
      m.emissiveIntensity = emissiveIntensity;
    }
    matCache.set(key, m);
  }
  return matCache.get(key);
}

// ---------------------------------------------------------------- illustrations
const artCache = new Map();
function rasterise(svg, w, h) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv);
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// Rasterise every illustration once. Resolves when all are ready.
let artReady = null;
export function loadArt() {
  if (artReady) return artReady;
  const jobs = [];
  for (const [key, def] of Object.entries(HD_ART)) {
    for (const [frame, svg] of Object.entries(def.frames)) {
      jobs.push(rasterise(svg, def.w, def.h).then((cv) => {
        if (!cv) return;
        artCache.set(`${key}:${frame}`, { canvas: cv, tex: canvasTex(cv, { repeat: false }) });
      }));
    }
  }
  artReady = Promise.all(jobs);
  return artReady;
}

export function artCanvas(key, frame = 'idle') {
  return (artCache.get(`${key}:${frame}`) || artCache.get(`${key}:idle`))?.canvas || null;
}

// A lit, upright billboard that turns to face the camera around its vertical
// axis. Its geometry stands on y = 0.
export function makeBillboard(key, { height } = {}) {
  const def = HD_ART[key];
  if (!def) return null;
  const idle = artCache.get(`${key}:idle`);
  if (!idle) return null;
  const h = height ?? def.height ?? 1.8;
  const w = (h * def.w) / def.h;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: idle.tex,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: idle.tex, alphaTest: 0.45 });
  const frames = {};
  for (const f of Object.keys(def.frames)) frames[f] = artCache.get(`${key}:${f}`)?.tex || idle.tex;
  mesh.userData = {
    billboard: true,
    name: key,
    frames,
    baseScale: mesh.scale.clone(),
    setFrame(frame) {
      const t = frames[frame] || frames.idle;
      mat.map = t;
      mesh.customDepthMaterial.map = t;
      mat.needsUpdate = true;
      mesh.customDepthMaterial.needsUpdate = true;
    },
  };
  return mesh;
}

// Turn billboards toward the camera around their vertical axis.
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function parentYawOf(obj) {
  obj.getWorldQuaternion(_q);
  _e.setFromQuaternion(_q, 'YXZ');
  return _e.y;
}
export function faceBillboards(list, camera) {
  for (const o of list) {
    if (!o.parent) continue;
    o.getWorldPosition(_v);
    const yaw = Math.atan2(camera.position.x - _v.x, camera.position.z - _v.z);
    o.rotation.y = yaw - parentYawOf(o.parent);
  }
}

// ---------------------------------------------------------------- renderer
const FLASH_SHADER = {
  uniforms: { tDiffuse: { value: null }, flash: { value: 0 }, flashColor: { value: new THREE.Color('#ffffff') } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float flash; uniform vec3 flashColor; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5; float vig = smoothstep(0.85, 0.25, length(d));
      c.rgb *= mix(0.72, 1.0, vig);
      c.rgb = mix(c.rgb, flashColor, flash);
      gl_FragColor = c; }`,
};

export class HdPipeline {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.8;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    setMaxAnisotropy(r.capabilities.getMaxAnisotropy());
    this.renderer = r;
    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.flashPass = new ShaderPass(FLASH_SHADER);
    this.composer.addPass(this.flashPass);
    this.composer.addPass(new OutputPass());
    this.w = 0;
    this.h = 0;
  }

  setSize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  setFlash(amount, hex = '#ffffff') {
    this.flashPass.uniforms.flash.value = amount * 0.6;
    this.flashPass.uniforms.flashColor.value.set(hex);
  }

  render(scene, camera) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }

  dispose() {
    this.composer.dispose?.();
    this.renderer.dispose();
  }
}
