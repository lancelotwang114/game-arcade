/* 大老二 Big Two — 單機 + AI（4 人，每人 13 張）
   規則（台灣常見版 + 炸彈）：
   - 點數 3 < 4 < … < K < A < 2；花色 梅花 < 方塊 < 紅心 < 黑桃。
   - 牌型：單張、對子、五張（順子 < 同花 < 葫蘆 < 鐵支 < 同花順）；不能單出三條。
   - 炸彈：鐵支（四條帶一張）、同花順可以壓任何牌型（含單張、對子）；炸彈之間依五張牌型大小比較。
   - 順子：23456 最大、A2345 第二，其餘依最大一張；JQKA2、QKA23、KA234 不算順子。同順子比最大那張的花色。
   - 開局：持梅花 3 者先出，第一手必須包含梅花 3；之後每局由上局贏家先出（不限牌）。
   - 一輪中其他人都「過」，最後出牌者取得出牌權，可出任何牌型。
   - 結算：輸家扣剩餘張數；剩 10 張以上 ×2、13 張全沒出 ×3；手上有 2 再 ×2。累計先到目標分數者輸，遊戲結束。 */
const BigTwo = {
  RANKS: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
  SUITS: ['c', 'd', 'h', 's'],                // 梅花 < 方塊 < 紅心 < 黑桃
  rv(r) { return this.RANKS.indexOf(r) + 3; }, // 3..15（2 = 15）
  cv(c) { return this.rv(c.r) * 4 + this.SUITS.indexOf(c.s); }, // 單張比較值
  TYPE_NAME: { single: '單張', pair: '對子', straight: '順子', flush: '同花', fullhouse: '葫蘆', four: '鐵支', sflush: '同花順' },
  FIVE_ORDER: ['straight', 'flush', 'fullhouse', 'four', 'sflush'],
  TARGET: 60,

  // ---------- 牌型判定（純函式）----------
  // 順子：回傳比較鍵（越大越強），不是順子回傳 0。23456 = 17、A2345 = 16、其餘 = 最大點數（7..14）
  _straightKey(cards) {
    const v = cards.map(c => this.rv(c.r)).sort((a, b) => a - b);
    if (new Set(v).size !== 5) return 0;
    const is = arr => arr.every((x, i) => i === 0 || x === arr[i - 1] + 1);
    if (v.join() === '3,4,5,6,15') return 17;           // 2 3 4 5 6
    if (v.join() === '3,4,5,14,15') return 16;          // A 2 3 4 5
    if (v[4] === 15) return 0;                          // 其他含 2 的（JQKA2 等）不算順子
    return is(v) ? v[4] : 0;
  },
  // 回傳 {type, key:[...]}（同 type 比 key 字典序），不合法回傳 null
  classify(cards) {
    const n = cards.length, cs = [...cards].sort((a, b) => this.cv(a) - this.cv(b));
    const top = cs[n - 1];
    if (n === 1) return { type: 'single', key: [this.cv(top)] };
    if (n === 2) return cs[0].r === cs[1].r ? { type: 'pair', key: [this.cv(top)] } : null;
    if (n !== 5) return null;
    const cnt = {}; cs.forEach(c => cnt[c.r] = (cnt[c.r] || 0) + 1);
    const groups = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    const flush = cs.every(c => c.s === cs[0].s), sk = this._straightKey(cs);
    // 順子內最大的那張（A2345、23456 皆以 2 為準）
    const hi = cs.reduce((m, c) => this.cv(c) > this.cv(m) ? c : m);
    if (sk && flush) return { type: 'sflush', key: [sk, this.cv(hi)] };
    if (groups[0][1] === 4) return { type: 'four', key: [this.rv(groups[0][0])] };
    if (groups[0][1] === 3 && groups[1][1] === 2) return { type: 'fullhouse', key: [this.rv(groups[0][0])] };
    if (flush) return { type: 'flush', key: cs.map(c => this.cv(c)).reverse() };
    if (sk) return { type: 'straight', key: [sk, this.cv(hi)] };
    return null;
  },
  isBomb(t) { return t && (t.type === 'four' || t.type === 'sflush'); },
  _cmpKey(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; },
  // b 能不能壓過 a（a = 桌上，b = 要出的）
  beats(b, a) {
    if (!b) return false;
    if (!a) return true;
    const five = t => this.FIVE_ORDER.includes(t.type);
    if (a.type === 'single' || a.type === 'pair') {
      if (b.type === a.type) return this._cmpKey(b.key, a.key) > 0;
      return this.isBomb(b);                              // 炸彈壓單張/對子
    }
    if (!five(b)) return false;
    const ia = this.FIVE_ORDER.indexOf(a.type), ib = this.FIVE_ORDER.indexOf(b.type);
    if (ib !== ia) return ib > ia;
    return this._cmpKey(b.key, a.key) > 0;
  },

  // ---------- 可出的組合（提示 / AI 用）----------
  combos(hand) {
    const out = [], h = [...hand].sort((a, b) => this.cv(a) - this.cv(b));
    h.forEach(c => out.push([c]));
    for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) if (h[i].r === h[j].r) out.push([h[i], h[j]]);
    const n = h.length;
    if (n >= 5) for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      const five = [h[a], h[b], h[c], h[d], h[e]]; if (this.classify(five)) out.push(five);
    }
    return out;
  },
  // 能壓過 table 的所有組合，由小到大（同類型內）；mustHave = 必須包含的牌（開局梅花 3）
  legalPlays(hand, table, mustHave) {
    return this.combos(hand).filter(cs => {
      if (mustHave && !cs.includes(mustHave)) return false;
      return this.beats(this.classify(cs), table && table.t);
    });
  },

  // ---------- 結算（純函式）----------
  penalty(hand) {
    let p = hand.length;
    if (hand.length >= 13) p *= 3; else if (hand.length >= 10) p *= 2;
    if (hand.some(c => c.r === '2')) p *= 2;
    return p;
  },

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  makeDeck() { const d = []; for (const s of this.SUITS) for (const r of this.RANKS) d.push({ r, s }); return d; },
  sortHand(h) { return h.sort((a, b) => this.cv(a) - this.cv(b)); },

  // ---------- 對局狀態 ----------
  st: null, _timers: [],
  newMatch(human = '你') {
    const names = [human, '阿傑', '小琪', '老王'];
    this.st = { players: names.map((nm, i) => ({ id: i, name: nm, isAI: i !== 0, hand: [], score: 0, last: '' })),
      handNo: 0, turn: 0, table: null, passes: 0, leader: -1, first: true, phase: 'idle', log: [], winner: -1, lastWinner: -1 };
    this.newHand();
  },
  newHand() {
    const s = this.st; s.handNo++;
    const deck = this.shuffle(this.makeDeck());
    s.players.forEach((p, i) => { p.hand = this.sortHand(deck.slice(i * 13, i * 13 + 13)); p.last = ''; });
    s.table = null; s.passes = 0; s.winner = -1; s.phase = 'play';
    s.first = s.lastWinner < 0;                                   // 第一局：梅花 3 開
    s.turn = s.first ? s.players.findIndex(p => p.hand.some(c => c.r === '3' && c.s === 'c')) : s.lastWinner;
    s.leader = s.turn;
    this.log(`— 第 ${s.handNo} 局 — ${s.players[s.turn].name} 先出${s.first ? '（梅花 3）' : ''}`);
    if (this.render) this.render();
    this.tick();
  },
  club3() { return this.st.first ? this.st.players[this.st.turn].hand.find(c => c.r === '3' && c.s === 'c') : null; },
  canPass() { return !!this.st.table; },  // 自己有出牌權時不能過
  // 出牌：cards 為該玩家手牌中的物件
  play(i, cards) {
    const s = this.st, p = s.players[i];
    if (s.phase !== 'play' || s.turn !== i) return false;
    const t = this.classify(cards);
    if (!t || !cards.every(c => p.hand.includes(c))) return false;
    const must = this.club3(); if (must && !cards.includes(must)) return false;
    if (!this.beats(t, s.table && s.table.t)) return false;
    p.hand = p.hand.filter(c => !cards.includes(c));
    s.table = { by: i, cards: this.sortHand([...cards]), t };
    s.first = false; s.passes = 0; s.leader = i; p.last = this.TYPE_NAME[t.type];
    this.log(`${p.name} 出 ${this.TYPE_NAME[t.type]}：${cards.map(c => this.cardName(c)).join(' ')}`);
    if (!p.hand.length) { this._endHand(i); return true; }
    this._next();
    return true;
  },
  pass(i) {
    const s = this.st;
    if (s.phase !== 'play' || s.turn !== i || !this.canPass()) return false;
    s.players[i].last = '過'; s.passes++;
    this.log(`${s.players[i].name} 過`);
    if (s.passes >= 3) {                                          // 其他三家都過：最後出牌者取得出牌權
      s.table = null; s.passes = 0; s.turn = s.leader;
      s.players.forEach(p => { p.last = ''; });
      this.log(`${s.players[s.turn].name} 取得出牌權`);
      if (this.render) this.render(); this.tick(); return true;
    }
    this._next(); return true;
  },
  _next() { const s = this.st; s.turn = (s.turn + 1) % 4; if (this.render) this.render(); this.tick(); },
  _endHand(w) {
    const s = this.st; s.phase = 'scored'; s.winner = w; s.lastWinner = w;
    const res = s.players.map((p, i) => i === w ? 0 : this.penalty(p.hand));
    s.players.forEach((p, i) => { p.score += res[i]; });
    s.lastResult = res;
    this.log(`🏆 ${s.players[w].name} 出完了！` + s.players.map((p, i) => i === w ? '' : `${p.name} −${res[i]}`).filter(Boolean).join('，'));
    if (this.render) this.render();
    if (s.players.some(p => p.score >= this.TARGET)) { this._after(3500, () => { s.phase = 'over'; if (this.render) this.render(); }); return; }
    this._after(4500, () => this.newHand());
  },
  tick() {
    const s = this.st; if (!s || s.phase !== 'play') return;
    if (s.players[s.turn].isAI) this._after(900 + Math.random() * 700, () => this.aiAct(s.turn));
  },

  // ---------- AI ----------
  aiAct(i) {
    const s = this.st; if (!s || s.phase !== 'play' || s.turn !== i) return;
    const p = s.players[i], must = this.club3();
    const plays = this.legalPlays(p.hand, s.table, must);
    if (!plays.length) { this.pass(i); return; }
    const minOpp = Math.min(...s.players.filter((q, k) => k !== i).map(q => q.hand.length));
    const score = cs => { const t = this.classify(cs); const base = t.type === 'single' || t.type === 'pair' ? 0 : 100 + this.FIVE_ORDER.indexOf(t.type) * 20;
      return base + (t.key[0] || 0) - cs.length * 3; };
    if (!s.table) {
      // 有出牌權：優先甩掉五張牌型與小牌；對手快出完時改出大牌
      const pick = minOpp <= 2 ? plays.sort((a, b) => score(b) - score(a))[0]
        : plays.filter(cs => cs.length === 5 && !this.isBomb(this.classify(cs))).sort((a, b) => score(a) - score(b))[0]
          || plays.filter(cs => cs.length === 2).sort((a, b) => score(a) - score(b))[0]
          || plays.sort((a, b) => score(a) - score(b))[0];
      this.play(i, pick); return;
    }
    // 跟牌：用剛好壓得過的最小組合；捨不得拆 2/炸彈時（手牌多、對手還遠）就過
    const sorted = plays.sort((a, b) => score(a) - score(b));
    const pick = sorted[0], t = this.classify(pick);
    const precious = this.isBomb(t) || pick.some(c => c.r === '2');
    if (precious && minOpp > 4 && p.hand.length > 5 && Math.random() < .7) { this.pass(i); return; }
    this.play(i, pick);
  },

  cardName(c) { return ({ s: '♠', h: '♥', d: '♦', c: '♣' }[c.s]) + c.r; },
  log(m) { this.st.log.unshift(m); if (this.st.log.length > 8) this.st.log.pop(); },
  _after(ms, fn) { const t = setTimeout(fn, ms); this._timers.push(t); return t; },
  _clearTimers() { this._timers.forEach(clearTimeout); this._timers = []; },
};

// ---------- node 自測 ----------
if (typeof module !== 'undefined' && require.main === module) {
  const assert = require('assert'), B = BigTwo;
  const C = str => str.split(' ').map(x => ({ r: x.slice(0, -1), s: x.slice(-1) }));
  const T = str => B.classify(C(str)), beats = (b, a) => B.beats(T(b), T(a));
  // 牌型
  assert.strictEqual(T('3c').type, 'single'); assert.strictEqual(T('3c 3s').type, 'pair'); assert.strictEqual(T('3c 4s'), null, '非對子');
  assert.strictEqual(T('3c 3d 3h'), null, '不能單出三條');
  assert.strictEqual(T('3c 4d 5h 6s 7c').type, 'straight'); assert.strictEqual(T('3c 5c 7c 9c Jc').type, 'flush');
  assert.strictEqual(T('3c 3d 3h 9s 9c').type, 'fullhouse'); assert.strictEqual(T('3c 3d 3h 3s 9c').type, 'four');
  assert.strictEqual(T('3c 4c 5c 6c 7c').type, 'sflush');
  assert.strictEqual(T('Jc Qd Kh As 2c'), null, 'JQKA2 不算順子'); assert.strictEqual(T('Kc Ad 2h 3s 4c'), null, 'KA234 不算順子');
  // 大小
  assert.ok(beats('2c', 'As'), '2 > A'); assert.ok(beats('3s', '3h'), '同點比花色：黑桃 > 紅心');
  assert.ok(beats('2c 3d 4h 5s 6c', 'Ac 2d 3h 4s 5c'), '23456 > A2345');
  assert.ok(beats('Ac 2d 3h 4s 5c', '10c Jd Qh Ks Ac'), 'A2345 > 10JQKA');
  assert.ok(beats('4c 5d 6h 7s 8c', '3c 4d 5h 6s 7s'), '45678 > 34567');
  assert.ok(beats('3c 5c 7c 9c Jc', 'Ac 2d 3h 4s 5c'), '同花 > 任何順子');
  assert.ok(beats('3c 3d 3h 3s 4c', 'Ac Ad Ah Ks Kc'), '鐵支 > 葫蘆');
  // 炸彈壓單張、對子
  assert.ok(beats('3c 3d 3h 3s 4c', '2s'), '鐵支壓單張 2'); assert.ok(beats('3c 4c 5c 6c 7c', '2s 2h'), '同花順壓對 2');
  assert.ok(!beats('3c 4d 5h 6s 7c', '3d'), '普通順子不能壓單張');
  assert.ok(!beats('4c 4d', '5c'), '對子不能壓單張');
  // 結算
  assert.strictEqual(B.penalty(C('3c 4d 5h')), 3); assert.strictEqual(B.penalty(C('3c 4d 2h')), 6, '有 2 ×2');
  assert.strictEqual(B.penalty(C('3c 4c 5c 6c 7c 8c 9c 10c Jc Qc')), 20, '10 張 ×2');
  assert.strictEqual(B.penalty(C('3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac 2c')), 13 * 3 * 2, '13 張 ×3 且有 2 ×2');
  // 對局流程：AI 對打到有人出完，結算與張數一致
  B.render = null; B.newMatch('P0'); B.st.players[0].isAI = true; B._after = (ms, fn) => fn();  // 同步跑
  let guard = 0; B.tick = function () { const s = this.st; if (s.phase === 'play' && guard++ < 5000) this.aiAct(s.turn); };
  B._endHand = function (w) { this.st.phase = 'done'; this.st.winner = w; };
  B.tick();
  assert.strictEqual(B.st.phase, 'done', '一局能打完'); assert.strictEqual(B.st.players[B.st.winner].hand.length, 0, '贏家出完');
  console.log('✅ BigTwo 自測通過');
}
if (typeof module !== 'undefined') module.exports = BigTwo;
