// An oil-paint pass for the illustrations. Every character is run through
// the same filter, which is what gives the set one shared painted finish:
//   1. a Kuwahara filter (two passes, built on summed-area tables) breaks the
//      vector shapes into flat, brush-like patches with soft, painted edges;
//   2. a warm glaze lifts the shadows toward umber and rolls off highlights;
//   3. a fine canvas weave and directional bristle grain sit on top.
// Works on premultiplied colour so the soft alpha of mist, smoke and glow is
// filtered along with the figure. Pure typed-array code: runs in a Web
// Worker when one is available, on the main thread otherwise.

function kuwahara(src, w, h, r) {
  const W = w + 1;
  const N = W * (h + 1);
  const sR = new Float64Array(N);
  const sG = new Float64Array(N);
  const sB = new Float64Array(N);
  const sA = new Float64Array(N);
  const sL = new Float64Array(N);
  const sL2 = new Float64Array(N);
  for (let y = 0; y < h; y++) {
    let rr = 0; let gg = 0; let bb = 0; let aa = 0; let ll = 0; let l2 = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const a = src[o + 3] / 255;
      const pr = src[o] * a; const pg = src[o + 1] * a; const pb = src[o + 2] * a;
      const l = 0.299 * pr + 0.587 * pg + 0.114 * pb + 40 * a;
      rr += pr; gg += pg; bb += pb; aa += a * 255; ll += l; l2 += l * l;
      const i = (y + 1) * W + x + 1;
      const u = y * W + x + 1;
      sR[i] = sR[u] + rr; sG[i] = sG[u] + gg; sB[i] = sB[u] + bb;
      sA[i] = sA[u] + aa; sL[i] = sL[u] + ll; sL2[i] = sL2[u] + l2;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  const box = (S, x0, y0, x1, y1) => S[(y1 + 1) * W + x1 + 1] - S[y0 * W + x1 + 1] - S[(y1 + 1) * W + x0] + S[y0 * W + x0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      let br = 0; let bg = 0; let bb = 0; let ba = 0;
      for (let q = 0; q < 4; q++) {
        const x0 = q & 1 ? x : Math.max(0, x - r);
        const x1 = q & 1 ? Math.min(w - 1, x + r) : x;
        const y0 = q & 2 ? y : Math.max(0, y - r);
        const y1 = q & 2 ? Math.min(h - 1, y + r) : y;
        const n = (x1 - x0 + 1) * (y1 - y0 + 1);
        const m = box(sL, x0, y0, x1, y1) / n;
        const v = box(sL2, x0, y0, x1, y1) / n - m * m;
        if (v < best) {
          best = v;
          br = box(sR, x0, y0, x1, y1) / n;
          bg = box(sG, x0, y0, x1, y1) / n;
          bb = box(sB, x0, y0, x1, y1) / n;
          ba = box(sA, x0, y0, x1, y1) / n;
        }
      }
      const o = (y * w + x) * 4;
      const a = ba / 255;
      if (a > 0.002) {
        out[o] = br / a; out[o + 1] = bg / a; out[o + 2] = bb / a;
      }
      out[o + 3] = ba;
    }
  }
  return out;
}

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function finish(px, w, h, seed) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (px[o + 3] === 0) continue;
      let r = px[o] / 255; let g = px[o + 1] / 255; let b = px[o + 2] / 255;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      // Glaze: warm umber in the shadows, a soft shoulder on the lights.
      const shadow = Math.max(0, 0.45 - l) / 0.45;
      r += shadow * 0.045; g += shadow * 0.018; b -= shadow * 0.012;
      const knee = (c) => (c > 0.82 ? 0.82 + (c - 0.82) * 0.6 : c);
      r = knee(r); g = knee(g); b = knee(b);
      // Slightly richer saturation, as oils tend to read.
      const m = (r + g + b) / 3;
      r = m + (r - m) * 1.12; g = m + (g - m) * 1.12; b = m + (b - m) * 1.12;
      // Canvas weave and bristle grain.
      const weave = ((x & 3) === 0 ? -0.018 : 0) + ((y & 3) === 0 ? -0.018 : 0);
      const bristle = (hash((x / 3) | 0, y + seed) - 0.5) * 0.05 + (hash(x + seed, (y / 7) | 0) - 0.5) * 0.035;
      const t = 1 + weave + bristle;
      px[o] = Math.max(0, Math.min(255, r * t * 255));
      px[o + 1] = Math.max(0, Math.min(255, g * t * 255));
      px[o + 2] = Math.max(0, Math.min(255, b * t * 255));
    }
  }
  return px;
}

// The whole pass on raw RGBA pixels. Radii scale with image size so large
// and small illustrations get similar brush marks relative to the figure.
export function paintPixels(data, w, h, { seed = 7 } = {}) {
  const scale = Math.sqrt((w * h) / (520 * 680));
  const r1 = Math.max(2, Math.round(4 * scale));
  const r2 = Math.max(1, Math.round(2 * scale));
  const a = kuwahara(data, w, h, r1);
  const b = kuwahara(a, w, h, r2);
  return finish(b, w, h, seed);
}

// Source for the worker: the same functions, serialised.
const WORKER_SRC = `${kuwahara}\n${hash}\n${finish}\n${paintPixels.toString().replace(/^export /, '')}
self.onmessage = (e) => { const { id, data, w, h, seed } = e.data; const out = paintPixels(data, w, h, { seed }); self.postMessage({ id, out }, [out.buffer]); };`;

let worker = null;
let nextId = 1;
const waiting = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = (e) => { const cb = waiting.get(e.data.id); waiting.delete(e.data.id); cb?.(e.data.out); };
    worker.onerror = () => { worker = false; for (const cb of waiting.values()) cb(null); waiting.clear(); };
  } catch (err) {
    worker = false;
  }
  return worker;
}

// Paint a canvas in place (returns a promise for the same canvas).
export function paintify(canvas, { seed = 7 } = {}) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const wk = getWorker();
  const apply = (out) => {
    if (out) img.data.set(out);
    ctx.putImageData(img, 0, 0);
    return canvas;
  };
  if (!wk) return Promise.resolve(apply(paintPixels(img.data, w, h, { seed })));
  return new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, (out) => resolve(apply(out || paintPixels(img.data, w, h, { seed }))));
    const copy = new Uint8ClampedArray(img.data);
    wk.postMessage({ id, data: copy, w, h, seed }, [copy.buffer]);
  });
}
