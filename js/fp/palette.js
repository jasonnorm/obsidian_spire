// The first-person view's palette: sixteen colours picked from the EGA's
// 64 (each channel 00, 55, AA or FF), the way 640x350 EGA games could
// reprogram their palette. Pixel art in this project is written as rows of
// characters, one character per pixel:
//   '.'          transparent
//   '0'-'9','a'-'f'  palette index 0-15 (hex digit)

export const PALETTE = [
  '#000000', // 0 black
  '#000055', // 1 navy
  '#0055aa', // 2 blue
  '#55aaff', // 3 sky
  '#005500', // 4 dark green
  '#55aa00', // 5 green
  '#00aaaa', // 6 teal
  '#550000', // 7 maroon
  '#aa0000', // 8 red
  '#aa5500', // 9 brown
  '#ffaa55', // a sand / skin
  '#ffff55', // b yellow
  '#555555', // c dark grey
  '#aaaaaa', // d light grey
  '#ffffff', // e white
  '#aa55ff', // f violet
];

export const PAL_RGB = PALETTE.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));

// Check a sprite: every row the same width, only legal characters.
export function validateRows(rows, name = 'sprite') {
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`${name}: row ${i} is ${r.length} wide, expected ${w}`);
    if (!/^[.0-9a-f]*$/.test(r)) throw new Error(`${name}: row ${i} has an illegal character`);
  });
  return { w, h: rows.length };
}

// Paint rows of palette characters into a new canvas (scale = pixels per art pixel).
export function rowsToCanvas(rows, scale = 1) {
  const { w, h } = validateRows(rows);
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const o = (y * w + x) * 4;
      if (ch === '.') { img.data[o + 3] = 0; continue; }
      const [r, gg, b] = PAL_RGB[parseInt(ch, 16)];
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  if (scale === 1) { g.putImageData(img, 0, 0); return cv; }
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, 0, 0, w * scale, h * scale);
  return cv;
}

// Nearest palette index for an RGB triple (plain Euclidean in sRGB, which is
// what the hardware effectively did).
export function nearestIndex(r, g, b) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < 16; i++) {
    const [pr, pg, pb] = PAL_RGB[i];
    const d = (r - pr) ** 2 * 0.3 + (g - pg) ** 2 * 0.59 + (b - pb) ** 2 * 0.11;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// 4x4 Bayer matrix, values 0..15.
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
