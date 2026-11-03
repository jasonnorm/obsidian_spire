// three.js helpers for the first-person view: palette-locked pixel textures,
// sprites from pixel art, textured primitives with world-scaled UVs, and the
// EGA pass that snaps every rendered pixel to the 16-colour palette with an
// ordered dither.

import * as THREE from 'three';
import { PALETTE, rowsToCanvas } from './palette.js';

const texCache = new Map();

export function pixelTexture(canvas, { repeat = false, mips = repeat } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mips ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
  t.generateMipmaps = !!mips;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function cachedTexture(key, make, opts) {
  if (!texCache.has(key)) texCache.set(key, pixelTexture(make(), opts));
  return texCache.get(key);
}

// A sprite definition is { w, h, height, frames: { idle: rows, ... } }.
export function spriteFrames(def, name) {
  const out = {};
  for (const [k, rows] of Object.entries(def.frames)) {
    out[k] = cachedTexture(`spr:${name}:${k}`, () => rowsToCanvas(rows), { repeat: false, mips: false });
  }
  return out;
}

export function makeSprite(def, name, { height, frame = 'idle' } = {}) {
  const frames = spriteFrames(def, name);
  const mat = new THREE.SpriteMaterial({ map: frames[frame] || frames.idle, alphaTest: 0.5, transparent: false, fog: true });
  const s = new THREE.Sprite(mat);
  const h = height ?? def.height ?? 1;
  s.scale.set((h * def.w) / def.h, h, 1);
  s.center.set(0.5, 0);
  s.userData = { frames, def, name, baseScale: s.scale.clone() };
  return s;
}

export function setFrame(sprite, frame) {
  const f = sprite.userData.frames;
  sprite.material.map = f[frame] || f.idle;
  sprite.material.needsUpdate = true;
}

// Scale the UVs of a geometry so textures tile once per `unit` world units.
export function worldUV(geo, unit = 4) {
  const uv = geo.getAttribute('uv');
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u;
    let v;
    if (ny > 0.7) { u = x; v = z; } else if (nx > 0.7) { u = z; v = y; } else { u = x; v = y; }
    uv.setXY(i, u / unit, v / unit);
  }
  uv.needsUpdate = true;
  return geo;
}

// Cylinder UVs: u around the circumference, v up the height, in world units.
export function cylinderUV(geo, radius, height, unit = 4) {
  const uv = geo.getAttribute('uv');
  const circ = 2 * Math.PI * radius;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / unit, (uv.getY(i) * height) / unit);
  uv.needsUpdate = true;
  return geo;
}

const matCache = new Map();
export function lambert(tex, { color = '#ffffff', side = THREE.FrontSide, emissive } = {}) {
  const key = `${tex?.uuid}|${color}|${side}|${emissive}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshLambertMaterial({ map: tex, color, side });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveMap = tex; }
    matCache.set(key, m);
  }
  return matCache.get(key);
}

export function box(w, h, d, mat, unit = 4) {
  const g = worldUV(new THREE.BoxGeometry(w, h, d), unit);
  const m = new THREE.Mesh(g, mat);
  return m;
}

// ---------------------------------------------------------------------------
// The EGA pass
// ---------------------------------------------------------------------------
const EGA_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const EGA_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform vec3 pal[16];
uniform float flash;
uniform vec3 flashColor;
varying vec2 vUv;

float b2(vec2 p) { return 2.0 * p.x + 3.0 * p.y - 4.0 * p.x * p.y; }
float bayer4(vec2 fc) {
  vec2 q = mod(floor(fc), 4.0);
  return 4.0 * b2(mod(q, 2.0)) + b2(floor(q / 2.0));
}
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float dist2(vec3 a, vec3 b) { vec3 d = a - b; return dot(d * d, vec3(0.30, 0.59, 0.11)); }

void main() {
  vec3 c = toSRGB(texture2D(tDiffuse, vUv).rgb);
  c = mix(c, flashColor, flash);
  // Find the two nearest palette colours, then dither between them.
  vec3 c1 = pal[0]; vec3 c2 = pal[0];
  float d1 = 1e9; float d2 = 1e9;
  for (int i = 0; i < 16; i++) {
    float d = dist2(c, pal[i]);
    if (d < d1) { d2 = d1; c2 = c1; d1 = d; c1 = pal[i]; }
    else if (d < d2) { d2 = d; c2 = pal[i]; }
  }
  float a = sqrt(d1); float b = sqrt(d2);
  float ratio = a / max(a + b, 1e-5);           // 0 = exactly c1, 0.5 = halfway
  float threshold = (bayer4(gl_FragCoord.xy) + 0.5) / 16.0;
  vec3 outc = ratio > threshold ? c2 : c1;
  gl_FragColor = vec4(outc, 1.0);
}
`;

export class EgaPipeline {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    this.renderer = r;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
    const palVec = PALETTE.map((h) => new THREE.Color(h)).map((c) => {
      // THREE.Color stores linear values; the shader compares in sRGB.
      const s = c.clone().convertLinearToSRGB();
      return new THREE.Vector3(s.r, s.g, s.b);
    });
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: this.rt.texture },
          pal: { value: palVec },
          flash: { value: 0 },
          flashColor: { value: new THREE.Vector3(1, 1, 1) },
        },
        vertexShader: EGA_VERT,
        fragmentShader: EGA_FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.w = 4;
    this.h = 4;
  }

  setSize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.rt.setSize(w, h);
  }

  setFlash(amount, hex = '#ffffff') {
    const u = this.quad.material.uniforms;
    u.flash.value = amount;
    const c = new THREE.Color(hex).convertLinearToSRGB();
    u.flashColor.value.set(c.r, c.g, c.b);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }
}
