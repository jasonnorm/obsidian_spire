// Synthesised sound for the Spire. Square and triangle voices with short
// envelopes, the way a 1981 sound chip would have done it. All tunes are
// original.

let ctx = null;
let master = null;
let muted = false;

const NOTE = {};
(() => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let o = 1; o <= 7; o++) {
    names.forEach((n, i) => {
      const midi = 12 * (o + 1) + i;
      NOTE[`${n}${o}`] = 440 * 2 ** ((midi - 69) / 12);
    });
  }
})();

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.32;
  // A gentle low-pass keeps the square waves from being shrill.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  master.connect(lp);
  lp.connect(ctx.destination);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.32, ctx.currentTime, 0.02);
}
export function isMuted() { return muted; }

function tone(freq, start, dur, { type = 'square', vol = 0.25, slide = 0, attack = 0.005, release = 0.06 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + attack);
  g.gain.setValueAtTime(vol, start + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(master);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(start, dur, { vol = 0.2, freq = 1200, q = 0.8, type = 'bandpass' } = {}) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(start);
}

// seq: [[note|freq|null, beats], ...]
function seq(notes, { bpm = 240, type = 'square', vol = 0.22, gap = 0.9, at = 0 } = {}) {
  const beat = 60 / bpm;
  let t = ctx.currentTime + 0.01 + at;
  for (const [n, b] of notes) {
    const dur = b * beat;
    if (n) {
      const f = typeof n === 'number' ? n : NOTE[n];
      tone(f, t, dur * gap, { type, vol });
    }
    t += dur;
  }
  return t - ctx.currentTime;
}

const SOUNDS = {
  key: () => tone(1320, ctx.currentTime, 0.035, { vol: 0.12 }),
  step: () => tone(520, ctx.currentTime, 0.05, { type: 'triangle', vol: 0.3, slide: 1.6 }),
  turn: () => seq([['E5', 0.5], ['B5', 0.5]], { bpm: 480, vol: 0.15 }),
  boot: () => {
    seq([['C4', 0.5], ['G4', 0.5], ['C5', 0.5], ['D#5', 0.5], ['G5', 1], [null, 0.5], ['F5', 0.5], ['D#5', 0.5], ['D5', 0.5], ['C5', 2]], { bpm: 300, vol: 0.2 });
    seq([['C3', 4], ['G#2', 2], ['G2', 2]], { bpm: 300, type: 'triangle', vol: 0.3 });
  },
  quiet: () => seq([['G4', 1], ['C5', 1]], { bpm: 300, type: 'triangle', vol: 0.25 }),
  market: () => seq([['C5', 0.5], ['E5', 0.5], ['G5', 0.5], ['E5', 0.5], ['C6', 1]], { bpm: 420, vol: 0.16 }),
  home: () => seq([['G4', 1], ['C5', 1], ['E5', 1], ['G5', 2]], { bpm: 360, type: 'triangle', vol: 0.3 }),
  shrine: () => {
    seq([['E5', 3]], { bpm: 200, type: 'triangle', vol: 0.18 });
    seq([['G#5', 3]], { bpm: 200, type: 'triangle', vol: 0.12 });
    seq([['B5', 3]], { bpm: 200, type: 'triangle', vol: 0.1 });
  },
  coin: () => { tone(1568, ctx.currentTime, 0.06, { vol: 0.14 }); tone(2093, ctx.currentTime + 0.06, 0.16, { vol: 0.14 }); },
  gain: () => seq([['C5', 0.5], ['E5', 0.5], ['G5', 1]], { bpm: 480, vol: 0.16 }),
  relic: () => seq([['G4', 0.5], ['B4', 0.5], ['D5', 0.5], ['G5', 0.5], ['B5', 0.5], ['D6', 1.5]], { bpm: 540, vol: 0.16 }),
  magic: () => {
    for (let i = 0; i < 8; i++) tone(880 * 2 ** (i / 6), ctx.currentTime + i * 0.045, 0.09, { type: 'triangle', vol: 0.16 });
  },
  reveal: () => {
    seq([['A4', 0.5], ['E5', 0.5], ['A5', 0.5], ['C6', 1.5]], { bpm: 360, type: 'triangle', vol: 0.25 });
    seq([['A3', 3]], { bpm: 360, type: 'square', vol: 0.06 });
  },
  shard: () => {
    seq([['C5', 0.5], ['G5', 0.5], ['C6', 0.5], ['E6', 0.5], ['G6', 0.5], [null, 0.5], ['E6', 0.5], ['G6', 2]], { bpm: 420, vol: 0.18 });
    seq([['C4', 2], ['G3', 2], ['C4', 2]], { bpm: 420, type: 'triangle', vol: 0.3 });
  },
  alarm: () => {
    seq([['A3', 0.5], ['A3', 0.5], ['A3', 0.5], ['F3', 1.5]], { bpm: 300, vol: 0.22 });
    noise(ctx.currentTime, 0.2, { vol: 0.15, freq: 180, type: 'lowpass' });
  },
  hit: () => { noise(ctx.currentTime, 0.12, { vol: 0.35, freq: 2400 }); tone(220, ctx.currentTime, 0.12, { slide: 2.2, vol: 0.18 }); },
  hurt: () => { noise(ctx.currentTime, 0.18, { vol: 0.3, freq: 500 }); tone(330, ctx.currentTime, 0.22, { slide: 0.4, vol: 0.2 }); },
  rally: () => seq([['D5', 0.5], ['D5', 0.5], ['G5', 1]], { bpm: 480, vol: 0.18 }),
  win: () => seq([['G4', 0.5], ['C5', 0.5], ['E5', 0.5], ['G5', 1], ['E5', 0.5], ['G5', 2]], { bpm: 420, vol: 0.2 }),
  retreat: () => seq([['E4', 0.5], ['D4', 0.5], ['C4', 0.5], ['A3', 1.5]], { bpm: 420, type: 'triangle', vol: 0.3 }),
  lose: () => seq([['E4', 1], ['D#4', 1], ['D4', 2]], { bpm: 300, vol: 0.18 }),
  warn: () => seq([['F#5', 0.5], [null, 0.5], ['F#5', 0.5]], { bpm: 480, vol: 0.14 }),
  deny: () => tone(110, ctx.currentTime, 0.22, { vol: 0.2 }),
  defeat: () => {
    seq([['A3', 1.5], ['G#3', 1.5], ['G3', 1.5], ['F#3', 3]], { bpm: 200, vol: 0.2 });
    seq([['A2', 7.5]], { bpm: 200, type: 'triangle', vol: 0.3 });
  },
  pulse: () => {
    tone(55, ctx.currentTime, 1.2, { type: 'triangle', vol: 0.5, attack: 0.15, release: 0.8 });
    tone(58, ctx.currentTime, 1.2, { type: 'square', vol: 0.06, attack: 0.15, release: 0.8 });
    noise(ctx.currentTime + 0.05, 0.9, { vol: 0.08, freq: 120, type: 'lowpass' });
  },
  wraith: () => {
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) tone(660 - i * 70, t + i * 0.18, 0.5, { type: 'triangle', vol: 0.16, slide: 0.7, attack: 0.08 });
    noise(t, 1.0, { vol: 0.06, freq: 3000, q: 4 });
  },
  fog: () => { noise(ctx.currentTime, 1.2, { vol: 0.1, freq: 600, q: 0.5 }); seq([['C5', 1], ['B4', 1], ['A#4', 2]], { bpm: 240, type: 'triangle', vol: 0.15 }); },
  storm: () => { noise(ctx.currentTime, 1.4, { vol: 0.25, freq: 300, type: 'lowpass' }); noise(ctx.currentTime + 0.1, 0.3, { vol: 0.35, freq: 1800 }); },
  fanfare: () => {
    seq([['C5', 1], ['C5', 0.5], ['C5', 0.5], ['G5', 2], ['E5', 1], ['G5', 1], ['C6', 4], [null, 1], ['A5', 1], ['B5', 1], ['C6', 4]], { bpm: 300, vol: 0.2 });
    seq([['C3', 4], ['G3', 4], ['C3', 4], ['F3', 2], ['G3', 2], ['C3', 4]], { bpm: 300, type: 'triangle', vol: 0.35 });
  },
  roar: () => {
    const t = ctx.currentTime;
    tone(110, t, 1.1, { type: 'sawtooth', vol: 0.22, slide: 0.45, attack: 0.08, release: 0.5 });
    tone(116, t + 0.02, 1.1, { type: 'square', vol: 0.12, slide: 0.42, attack: 0.08, release: 0.5 });
    noise(t, 1.2, { vol: 0.3, freq: 260, q: 0.6 });
  },
  fire: () => {
    const t = ctx.currentTime;
    noise(t, 0.9, { vol: 0.4, freq: 900, q: 0.4 });
    noise(t + 0.05, 0.7, { vol: 0.25, freq: 2600, q: 0.8 });
    tone(220, t, 0.6, { type: 'sawtooth', vol: 0.12, slide: 0.5 });
  },
  sun: () => seq([['E5', 1]], { bpm: 300, vol: 0.2 }),
  moon: () => seq([['A4', 1]], { bpm: 300, vol: 0.2 }),
  star: () => seq([['C#6', 1]], { bpm: 300, vol: 0.2 }),
};

export function play(name) {
  if (!ctx || muted || !SOUNDS[name]) return;
  try { SOUNDS[name](); } catch (e) { /* audio is best-effort */ }
}
