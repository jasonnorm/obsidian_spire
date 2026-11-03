// Peg scorecards ("Warden's Ledgers") and the shared Gloom track.

import { glyph } from './glyphs.js';
import { RELICS, SHARDS } from './data.js';

const RES = [
  { k: 'company', label: 'Company' },
  { k: 'coin', label: 'Coin' },
  { k: 'provisions', label: 'Provisions' },
];

function holes(n, cls) {
  let h = '';
  for (let i = 0; i < n; i++) h += `<span class="hole ${cls || ''}" data-i="${i}"><b>${i}</b></span>`;
  return h;
}

function setPeg(peg, idx) {
  const prev = peg.dataset.idx;
  if (prev === String(idx)) return;
  peg.dataset.idx = idx;
  peg.style.setProperty('--i', idx);
  if (prev !== undefined) {
    peg.classList.remove('lift');
    void peg.offsetWidth;
    peg.classList.add('lift');
  }
}

export class Ledger {
  constructor(root, player) {
    this.root = root;
    this.pid = player.id;
    const home = player.id === 'p' ? 'Hearthmoor' : 'Frostvale';
    root.className = `ledger ledger-${player.color}`;
    root.innerHTML = `
      <header class="lg-head">
        <span class="lg-title">Warden's Ledger</span>
        <span class="lg-name">${player.id === 'p' ? 'You' : 'Ser Vael'} <em>of ${home}</em></span>
        <span class="lg-turn" aria-live="polite"></span>
      </header>
      <div class="lg-body">
        ${RES.map((r) => `
          <div class="lg-row" data-res="${r.k}">
            <span class="lg-label"><span class="lg-ico">${glyph(r.k === 'company' ? 'company' : r.k)}</span>${r.label}</span>
            <span class="lg-place">&times;10</span>
            <div class="lg-holes" data-place="tens">${holes(10)}<span class="peg"></span></div>
            <span class="lg-place">&times;1</span>
            <div class="lg-holes" data-place="ones">${holes(10)}<span class="peg"></span></div>
            <output class="lg-value" aria-label="${r.label}">0</output>
          </div>`).join('')}
        <div class="lg-items">
          <div class="lg-relics">
            ${RELICS.map((r) => `
              <div class="lg-relic" data-relic="${r.id}" title="${r.name}: ${r.text}">
                <span class="lg-ico">${glyph(r.id)}</span>
                <span class="hole"><span class="peg"></span></span>
                <small>${r.name.split(' ').pop()}</small>
              </div>`).join('')}
          </div>
          <div class="lg-shards">
            ${SHARDS.map((s) => `
              <div class="lg-shard" data-shard="${s.id}" style="--gem:${s.color}" title="${s.name}">
                <span class="lg-socket"><span class="lg-gem"></span><span class="lg-sigil">${glyph(s.id)}</span></span>
                <small>${s.name.split(' ')[0]}</small>
              </div>`).join('')}
          </div>
          <div class="lg-status">
            <div class="lg-flag" data-flag="ward" title="A ward turns aside one wraith, fever or curse"><span class="hole"><span class="peg"></span></span><small>Ward</small></div>
            <div class="lg-flag" data-flag="gate" title="The Spire's gate is taken"><span class="hole"><span class="peg"></span></span><small>Gate</small></div>
            <div class="lg-flag" data-flag="hall" title="The Ash Warden is beaten"><span class="hole"><span class="peg"></span></span><small>Hall</small></div>
          </div>
        </div>
      </div>`;
    this.rows = {};
    for (const r of RES) {
      const row = root.querySelector(`[data-res="${r.k}"]`);
      this.rows[r.k] = {
        tens: row.querySelector('[data-place="tens"] .peg'),
        ones: row.querySelector('[data-place="ones"] .peg'),
        out: row.querySelector('.lg-value'),
        row,
      };
    }
    this.turnEl = root.querySelector('.lg-turn');
  }

  update(p, { active, upkeep }) {
    for (const r of RES) {
      const v = Math.max(0, Math.min(99, p[r.k]));
      const row = this.rows[r.k];
      setPeg(row.tens, Math.floor(v / 10));
      setPeg(row.ones, v % 10);
      if (row.out.textContent !== String(v)) {
        const up = Number(row.out.textContent) < v;
        row.out.textContent = v;
        row.row.classList.remove('up', 'down');
        void row.row.offsetWidth;
        row.row.classList.add(up ? 'up' : 'down');
      }
      row.row.classList.toggle('low', r.k === 'provisions' && v <= upkeep * 2);
    }
    for (const el of this.root.querySelectorAll('.lg-relic')) el.classList.toggle('owned', !!p.relics[el.dataset.relic]);
    for (const el of this.root.querySelectorAll('.lg-shard')) el.classList.toggle('owned', !!p.shards[el.dataset.shard]);
    const flags = { ward: p.ward, gate: p.spireTier >= 1, hall: p.spireTier >= 2 };
    for (const el of this.root.querySelectorAll('.lg-flag')) el.classList.toggle('owned', !!flags[el.dataset.flag]);
    this.root.classList.toggle('active', !!active);
    this.turnEl.textContent = active ? (p.id === 'p' ? 'Your turn' : 'Riding') : '';
  }
}

export class GloomTrack {
  constructor(root) {
    this.root = root;
    this.max = 0;
  }

  build(max) {
    this.max = max;
    const marks = { 4: 'Wraiths walk', 7: 'Prices rise', 8: 'Barrows haunted', 10: 'Hounds hunt', 14: 'Prices soar' };
    let h = '<span class="gt-label">Gloom</span><div class="gt-holes">';
    for (let i = 0; i <= max; i++) {
      const m = marks[i];
      h += `<span class="hole${m ? ' mark' : ''}${i === max ? ' doom' : ''}" data-i="${i}"${m ? ` title="${i}: ${m}"` : i === max ? ' title="The Spire wakes"' : ''}></span>`;
    }
    h += '<span class="peg gt-peg"></span></div><output class="gt-value"></output>';
    this.root.innerHTML = h;
    this.peg = this.root.querySelector('.gt-peg');
    this.out = this.root.querySelector('.gt-value');
    this.root.style.setProperty('--n', max + 1);
  }

  update(g, max) {
    if (max !== this.max) this.build(max);
    setPeg(this.peg, g);
    this.out.textContent = `${g}/${max}`;
    this.root.style.setProperty('--doom', (g / max).toFixed(3));
    for (const h of this.root.querySelectorAll('.hole')) h.classList.toggle('dark', Number(h.dataset.i) <= g);
  }
}
