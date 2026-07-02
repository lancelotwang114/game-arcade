/* 撲克牌渲染 + 牌庫工具。撲克 (texas) 與騙子酒吧共用 */
Platform.cards = {
  SUIT_CH: { s: '♠', h: '♥', d: '♦', c: '♣' },
  RANKS: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],

  // 標準撲克牌面。card = {r:'A', s:'h'}；opts.back = 蓋牌
  el(card, opts = {}) {
    const d = document.createElement('div');
    if (opts.back || !card) { d.className = 'pcard back'; return d; }
    const red = card.s === 'h' || card.s === 'd';
    d.className = 'pcard' + (red ? ' red' : '');
    const s = this.SUIT_CH[card.s];
    d.innerHTML = `<span class="pc-corner pc-tl">${card.r}<i>${s}</i></span>`
      + `<span class="pc-pip">${s}</span>`
      + `<span class="pc-corner pc-br">${card.r}<i>${s}</i></span>`;
    return d;
  },

  // 大字符號牌（騙子酒吧用：K/Q/A/🃏）
  bigEl(label, opts = {}) {
    const d = document.createElement('div');
    if (opts.back) { d.className = 'pcard back'; return d; }
    d.className = 'pcard big' + (opts.joker ? ' joker' : '');
    d.innerHTML = `<span class="pc-big">${label}</span>`;
    return d;
  },

  // 標準 52 張牌庫（未洗）
  deck52() {
    const out = [];
    for (const s of ['s', 'h', 'd', 'c']) for (const r of this.RANKS) out.push({ r, s });
    return out;
  },

  // Fisher–Yates 洗牌（就地 + 回傳）
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // rank 數值：2..14（A 高）
  rankVal(r) { return this.RANKS.indexOf(r) + 2; },

  // ---------- Sprite sheet 牌圖（assets/cards） ----------
  SHEET: 'assets/cards/cards_sheet.png',
  BACK: 'assets/cards/back.png',
  style: 'D',
  _STYLE_SFX: { D: '', A: '_A', B: '_B', C: '_C', E: '_E', F: '_F' },
  STYLE_NAMES: { D: '經典標準', A: '星辰夜空', B: '山水雅韻', C: '復古 Art Deco', E: '簡約', F: '極簡' },
  setStyle(k) {
    if (!(k in this._STYLE_SFX)) k = 'D';
    this.style = k; const s = this._STYLE_SFX[k];
    this.SHEET = 'assets/cards/cards_sheet' + s + '.png';
    this.BACK = 'assets/cards/back' + s + '.png';
    Platform.store.set('arcade_cardstyle', k);
  },
  _SR: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
  _SS: ['s', 'h', 'd', 'c'],
  // 回傳 inline style：以 sprite sheet 顯示某張牌，寬 w（高自動 392/280 比例）
  spriteCSS(card, w) {
    const col = this._SR.indexOf(card.r), row = this._SS.indexOf(card.s);
    const sc = w / 280, h = Math.round(w / 280 * 392);
    return `width:${w}px;height:${h}px;border-radius:${Math.round(6 * sc)}px;`
      + `background:url('${this.SHEET}') -${Math.round(col * 280 * sc)}px -${Math.round(row * 392 * sc)}px / ${Math.round(280 * 13 * sc)}px ${Math.round(392 * 4 * sc)}px no-repeat;`;
  },
  backCSS(w) {
    const h = Math.round(w / 280 * 392);
    return `width:${w}px;height:${h}px;background:url('${this.BACK}') center/contain no-repeat;`;
  },
};
Platform.cards.setStyle(Platform.store.get('arcade_cardstyle', 'D'));
