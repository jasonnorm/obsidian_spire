// The Spire's console: crystal lamp, backlit picture window, red LED
// readout, amber ticker, three crown sockets and a nine-key pad.

import { glyph } from './glyphs.js';
import * as audio from './audio.js';

export const MOODS = {
  idle: '#ffb347',
  good: '#7dff9a',
  danger: '#ff4a3a',
  warn: '#ffa63a',
  magic: '#c49bff',
  gloom: '#b072ff',
  victory: '#ffd75a',
  rival: '#7fb2ff',
};

export const KEYS = [
  { k: 'yes', label: 'Yes', hint: 'Y' },
  { k: 'no', label: 'No', hint: 'N' },
  { k: 'next', label: 'Next', hint: 'X' },
  { k: 'fight', label: 'Fight', hint: 'F' },
  { k: 'flee', label: 'Flee', hint: 'L' },
  { k: 'stay', label: 'Stay', hint: 'S' },
  { k: 'ledger', label: 'Ledger', hint: 'I' },
  { k: 'repeat', label: 'Repeat', hint: 'R' },
  { k: 'end', label: 'End', hint: 'E' },
];
const UTILITY = ['ledger', 'repeat'];
const SHARD_KEYS = [
  { k: 'sun', label: 'Sun', hint: '1', note: 'sun' },
  { k: 'moon', label: 'Moon', hint: '2', note: 'moon' },
  { k: 'star', label: 'Star', hint: '3', note: 'star' },
];
const SEGMENTS = {
  ' ': '', '-': 'g',
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

function ledDigitSVG(x) {
  // Slanted seven-segment digit, 40 x 64 units.
  const s = 0.12; // slant
  const P = (px, py) => `${(px + (64 - py) * s).toFixed(1)},${py}`;
  const segs = {
    a: [P(8, 4), P(32, 4), P(28, 9), P(12, 9)],
    b: [P(33, 6), P(33, 30), P(29, 28), P(29, 10)],
    c: [P(33, 34), P(33, 58), P(29, 54), P(29, 36)],
    d: [P(8, 60), P(32, 60), P(28, 55), P(12, 55)],
    e: [P(7, 34), P(11, 36), P(11, 54), P(7, 58)],
    f: [P(7, 6), P(11, 10), P(11, 28), P(7, 30)],
    g: [P(9, 32), P(13, 29.5), P(27, 29.5), P(31, 32), P(27, 34.5), P(13, 34.5)],
  };
  return `<g transform="translate(${x},0)">${Object.entries(segs)
    .map(([k, pts]) => `<polygon data-seg="${k}" points="${pts.join(' ')}"/>`)
    .join('')}</g>`;
}

export class SpireConsole {
  constructor(root) {
    this.root = root;
    this.spire3d = null;
    this.speed = 1;
    this.enabled = new Set();
    this.pending = null;
    this.skipper = null;
    this.last = null; // last event shown, for Repeat
    this.current = null; // what the window shows now
    this.busy = false; // ledger or repeat slideshow running
    this.whose = null;
    this.build();
  }

  build() {
    const r = this.root;
    this.crystal = r.querySelector('#sc-crystal');
    this.window = r.querySelector('#sc-window');
    this.glyphEl = r.querySelector('#sc-glyph');
    this.ticker = r.querySelector('#sc-ticker');
    this.say = r.querySelector('#sc-say');
    this.lamps = { p: r.querySelector('#lamp-p'), r: r.querySelector('#lamp-r') };

    this.ledEl = r.querySelector('#sc-led');
    this.ledEl.innerHTML = `<svg viewBox="0 0 132 64" aria-hidden="true">${[0, 44, 88].map((x) => ledDigitSVG(x)).join('')}</svg>`;
    this.ledDigits = [...this.ledEl.querySelectorAll('g')];

    const pad = r.querySelector('#sc-keypad');
    this.keyEls = {};
    for (const key of KEYS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `sc-key sc-key-${key.k}`;
      b.id = `key-${key.k}`;
      b.dataset.key = key.k;
      b.innerHTML = `<span class="sc-key-led" aria-hidden="true"></span><span class="sc-key-label">${key.label}</span><span class="sc-key-hint" aria-hidden="true">${key.hint}</span>`;
      b.setAttribute('aria-keyshortcuts', key.hint);
      b.disabled = true;
      b.addEventListener('click', () => this.press(key.k));
      pad.appendChild(b);
      this.keyEls[key.k] = b;
    }

    const sockets = r.querySelector('#sc-sockets');
    this.socketEls = {};
    for (const s of SHARD_KEYS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `sc-socket sc-socket-${s.k}`;
      b.id = `socket-${s.k}`;
      b.dataset.shard = s.k;
      b.title = `${s.label} Shard (${s.hint})`;
      b.innerHTML = `<span class="sc-socket-gem">${glyph(s.k)}</span><span class="sc-socket-label">${s.label}</span>`;
      b.disabled = true;
      b.addEventListener('click', () => this.socketPress(s.k));
      sockets.appendChild(b);
      this.socketEls[s.k] = b;
    }

    this.window.addEventListener('click', () => this.skip());
    this.ticker.addEventListener('click', () => this.skip());
    this.setLED(null);
    this.setMood('idle');
  }

  bindSpire(spire3d) { this.spire3d = spire3d; }

  // ---------- low-level display ----------
  setMood(mood) {
    const c = MOODS[mood] || MOODS.idle;
    this.root.style.setProperty('--mood', c);
    this.mood = mood;
    this.spire3d?.setMood?.(c, mood);
  }

  setGlyph(name) {
    if (!name) { this.glyphEl.innerHTML = ''; return; }
    this.glyphEl.innerHTML = glyph(name);
    this.window.classList.remove('flick');
    // Restart the slide-change flicker.
    void this.window.offsetWidth;
    this.window.classList.add('flick');
  }

  setLED(v) {
    let str = '   ';
    if (v !== null && v !== undefined && v !== '') {
      const n = Math.max(-99, Math.min(999, Math.round(Number(v))));
      str = String(n).padStart(3, ' ');
    }
    this.ledEl.setAttribute('aria-label', v === null || v === undefined ? 'blank' : String(v));
    [...str].forEach((ch, i) => {
      const on = SEGMENTS[ch] ?? '';
      for (const seg of this.ledDigits[i].querySelectorAll('polygon')) {
        seg.classList.toggle('on', on.includes(seg.dataset.seg));
      }
    });
  }

  typeText(text) {
    clearInterval(this.typeTimer);
    const el = this.ticker;
    if (!text) { el.textContent = ''; return; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
    let i = 0;
    el.textContent = '';
    this.typeTimer = setInterval(() => {
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(this.typeTimer);
    }, 14);
  }

  render(evt) {
    this.current = evt;
    this.setGlyph(evt.glyph);
    this.setLED(evt.led);
    this.typeText(evt.text || '');
    if (this.say) this.say.textContent = evt.text || '';
    this.setMood(evt.mood || 'idle');
  }

  setTurn(pid) {
    this.whose = pid;
    for (const [k, el] of Object.entries(this.lamps)) el.classList.toggle('on', k === pid);
    this.root.dataset.turn = pid || '';
  }

  setShards(player) {
    for (const s of SHARD_KEYS) this.socketEls[s.k].classList.toggle('held', !!player?.shards[s.k]);
  }

  wait(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(done, ms);
      const self = this;
      function done() { clearTimeout(t); if (self.skipper === done) self.skipper = null; resolve(); }
      this.skipper = done;
    });
  }

  skip() {
    if (this.pending?.hold) { this.press('next'); return; }
    this.skipper?.();
  }

  // ---------- events ----------
  async display(evt, { rival = false } = {}) {
    if (evt.text) this.last = evt;
    this.render(evt);
    if (evt.sound) audio.play(evt.sound);
    if (evt.pulse) this.spire3d?.pulse?.();
    if (evt.flare) this.spire3d?.flare?.();
    // A battle's outcome stays up until the player presses NEXT (or Enter or
    // Space), so it can be read before play moves on.
    if (evt.hold && !rival) {
      await new Promise((resolve) => {
        this.pending = { resolve, prompt: evt, keys: new Set(['next']), hold: true };
        this.enable(['next', ...UTILITY]);
      });
      return;
    }
    const len = (evt.text || '').length;
    let ms = (evt.short ? 650 : 1250) + len * (evt.short ? 12 : 22);
    if (evt.battleTick) ms = rival ? 750 : 650;
    else if (rival && !evt.hold) ms *= 0.75; // the rival's turn plays at 80% of the old pace
    // The rival's battle outcomes linger long enough to read.
    if (evt.hold) ms = Math.max(ms, 2600 + len * 18);
    ms *= this.speed;
    await this.wait(ms);
  }

  enable(keys) {
    this.enabled = new Set(keys);
    for (const [k, el] of Object.entries(this.keyEls)) {
      const on = this.enabled.has(k);
      el.disabled = !on;
      el.classList.toggle('live', on && !UTILITY.includes(k));
    }
  }

  ask(prompt) {
    this.render({ ...prompt, mood: prompt.mood || (prompt.battle ? 'danger' : this.mood === 'danger' ? 'danger' : 'idle') });
    return new Promise((resolve) => {
      this.pending = { resolve, prompt, keys: new Set(prompt.options) };
      this.enable([...prompt.options, ...UTILITY]);
    });
  }

  // Waiting for a board click; STAY is the only console answer.
  awaitMove(text, onStay) {
    this.render({ glyph: 'quiet', led: null, text, mood: 'idle' });
    this.pending = { resolve: onStay, prompt: { options: ['stay'] }, keys: new Set(['stay']), move: true };
    this.enable(['stay', ...UTILITY]);
  }

  flashKey(k) {
    const el = this.keyEls[k];
    if (!el) return;
    el.classList.add('pressed', 'flash');
    audio.play('key');
    setTimeout(() => el.classList.remove('pressed', 'flash'), 200);
  }

  cancelPending() {
    this.pending = null;
    this.enable([]);
  }

  async press(k) {
    if (!this.enabled.has(k) || this.busy) return;
    audio.play('key');
    const el = this.keyEls[k];
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 140);
    if (k === 'ledger') return this.showLedger();
    if (k === 'repeat') return this.repeat();
    const p = this.pending;
    if (!p || !p.keys.has(k)) return;
    this.pending = null;
    this.enable([]);
    p.resolve(k);
  }

  async withRestore(fn) {
    this.busy = true;
    const snap = this.current;
    const keys = [...this.enabled];
    this.enable([]);
    try { await fn(); } finally {
      this.busy = false;
      if (snap) this.render(snap);
      if (this.pending) this.enable(keys);
    }
  }

  async repeat() {
    if (!this.last) return;
    const ev = this.last;
    await this.withRestore(async () => {
      this.render(ev);
      if (ev.sound) audio.play(ev.sound);
      await this.wait(1600 * this.speed);
    });
  }

  async showLedger() {
    const p = this.ledgerSource?.();
    if (!p) return;
    const slides = [
      { glyph: 'company', led: p.company, text: `Company: ${p.company} strong.` },
      { glyph: 'coin', led: p.coin, text: `Coin: ${p.coin}.` },
      { glyph: 'provisions', led: p.provisions, text: `Provisions: ${p.provisions}, enough for ${Math.floor(p.provisions / Math.max(1, Math.ceil(p.company / 12)))} days.` },
    ];
    for (const [id, has] of Object.entries(p.relics)) if (has) slides.push({ glyph: id, text: `You carry the ${this.relicNames?.[id] || id}.`, mood: 'good' });
    for (const s of ['sun', 'moon', 'star']) if (p.shards[s]) slides.push({ glyph: s, text: `The ${s[0].toUpperCase() + s.slice(1)} Shard is yours.`, mood: 'magic' });
    if (p.ward) slides.push({ glyph: 'ward', text: 'You are warded.', mood: 'magic' });
    await this.withRestore(async () => {
      for (const s of slides) {
        this.render({ mood: 'idle', ...s });
        audio.play('key');
        await this.wait(950 * this.speed);
      }
    });
  }

  // ---------- kindling (memory test) ----------
  async playSequence(seq) {
    this.render({ glyph: 'kindle', led: seq.length, text: 'Listen. The crown sings the order of kindling...', mood: 'magic' });
    await this.wait(1300);
    for (const s of seq) {
      await this.flashSocket(s, 520);
      await new Promise((r) => setTimeout(r, 170));
    }
  }

  async flashSocket(s, ms) {
    const el = this.socketEls[s];
    el.classList.add('flash');
    audio.play(s);
    this.spire3d?.crownNote?.(s);
    this.setGlyph(s);
    await new Promise((r) => setTimeout(r, ms));
    el.classList.remove('flash');
  }

  kindle(seq) {
    return new Promise(async (resolve) => {
      await this.playSequence(seq);
      this.render({ glyph: 'kindle', led: seq.length, text: `Now set the shards in the same order: ${seq.length} notes. Press the sockets below (or keys 1, 2, 3).`, mood: 'magic' });
      let i = 0;
      this.socketMode = (s) => {
        audio.play(s);
        this.spire3d?.crownNote?.(s);
        const el = this.socketEls[s];
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 220);
        if (s !== seq[i]) {
          this.endSocketMode();
          audio.play('deny');
          resolve(false);
          return;
        }
        i++;
        this.setLED(seq.length - i);
        if (i >= seq.length) {
          this.endSocketMode();
          resolve(true);
        }
      };
      for (const el of Object.values(this.socketEls)) { el.disabled = false; el.classList.add('live'); }
      this.root.classList.add('kindling');
    });
  }

  endSocketMode() {
    this.socketMode = null;
    for (const el of Object.values(this.socketEls)) { el.disabled = true; el.classList.remove('live'); }
    this.root.classList.remove('kindling');
  }

  socketPress(s) { this.socketMode?.(s); }

  async showAIKindle(seq, ok) {
    await this.playSequence(seq);
    this.render({ glyph: 'rival', led: seq.length, text: ok ? 'Ser Vael sets the shards...' : 'Ser Vael sets the shards... and falters.', mood: 'rival' });
    for (let i = 0; i < seq.length; i++) {
      await this.flashSocket(seq[i], 375);
      if (!ok && i === Math.floor(seq.length / 2)) break;
    }
  }

  handleKey(e) {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return false;
    const k = e.key.toLowerCase();
    if (this.socketMode && ['1', '2', '3'].includes(k)) { this.socketMode(['sun', 'moon', 'star'][+k - 1]); return true; }
    if (k === ' ' || k === 'enter') {
      if (this.pending?.hold) { this.press('next'); return true; }
      if (this.skipper) { this.skip(); return true; }
    }
    const map = { y: 'yes', n: 'no', x: 'next', arrowright: 'next', f: 'fight', l: 'flee', s: 'stay', i: 'ledger', r: 'repeat', e: 'end' };
    const key = map[k];
    if (key && this.enabled.has(key)) { this.press(key); return true; }
    return false;
  }
}
