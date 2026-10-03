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
    s.table = null; s.trick = []; s.passes = 0; s.winner = -1; s.phase = 'play'; this._dealtAt = Date.now();
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
    s.trick = (s.trick || []).concat([{ by: i, cards: s.table.cards, type: t.type }]); // 這一輪各家出過的牌（UI 顯示用）
    s.first = false; s.passes = 0; s.leader = i; p.last = this.TYPE_NAME[t.type];
    this.log(`${p.name} 出 ${this.TYPE_NAME[t.type]}：${cards.map(c => this.cardName(c)).join(' ')}`);
    if (!p.hand.length) { this._endHand(i); return true; }
    this._next();
    return true;
  },
  pass(i) {
    const s = this.st;
    if (s.phase !== 'play' || s.turn !== i || !this.canPass()) return false;
    s.players[i].last = '過'; s.passes++; s.passSeq = (s.passSeq || 0) + 1; s.lastPassBy = i; // UI 依序號顯示「過」
    this.log(`${s.players[i].name} 過`);
    if (s.passes >= 3) {                                          // 其他三家都過：最後出牌者取得出牌權
      s.table = null; s.trick = []; s.passes = 0; s.turn = s.leader;
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
    // 發牌動畫期間電腦不出手
    if (s.players[s.turn].isAI) this._after(Math.max(1100 + Math.random() * 700, (this._dealtAt || 0) + 3000 - Date.now()), () => this.aiAct(s.turn));
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

// ---------- 平台註冊 + 連線（host 權威）+ UI ----------
if (typeof Platform !== 'undefined') {
  const B = BigTwo;
  const SR_ = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SS_ = ['s', 'h', 'd', 'c'];
  const TYPES = ['single', 'pair', 'straight', 'flush', 'fullhouse', 'four', 'sflush'];
  const key = c => c.r + c.s;
  const known = c => !!(c && c.r);
  const cardHTML = (c, cls = '', st = '') => known(c)
    ? `<div class="b2-card ${cls}" data-k="${key(c)}" role="img" aria-label="${B.cardName(c)}" style="background-position:${SR_.indexOf(c.r) / 12 * 100}% ${SS_.indexOf(c.s) / 3 * 100}%;${st}"></div>`
    : `<div class="b2-card back ${cls}" style="${st}"></div>`;
  const ini = nm => { const ch = [...(nm || '?')]; const last = ch[ch.length - 1]; return /[一-鿿]/.test(last) ? last : ch[0].toUpperCase(); };
  // 扇形：第 k 張（共 n 張）的旋轉角與下沉量
  const fan = (k, n, step, drop) => { const m = (n - 1) / 2, d = k - m; return `rotate:${(d * step).toFixed(1)}deg;translate:0 ${(Math.abs(d) * drop).toFixed(1)}px`; };
  const portrait = () => matchMedia('(orientation: portrait)').matches;

  // ---------- 音效（CC0，來源見 games/bigtwo/audio/CREDITS.txt）----------
  B.sfx = Platform.fx.sampler('games/bigtwo/audio/', {
    shuffle: 'card-shuffle.wav', 'slide-1': 'card-slide-1.wav', 'slide-2': 'card-slide-2.wav', 'slide-3': 'card-slide-3.wav',
    'place-1': 'card-place-1.wav', 'place-2': 'card-place-2.wav', 'place-3': 'card-place-3.wav', 'shove-1': 'card-shove-1.wav', 'shove-2': 'card-shove-2.wav',
    'slam-1': 'slam-1.wav', 'slam-2': 'slam-2.wav', toast: 'toast-1.mp3',
  });

  // ---------- 連線：對賓客遮蔽他人手牌（結算時公開）----------
  B._redact = function (seat) {
    const s = this.st, open = s.phase === 'scored' || s.phase === 'over';
    return JSON.parse(JSON.stringify({
      players: s.players.map((p, i) => ({ id: p.id, name: p.name, isAI: p.isAI, score: p.score, last: p.last,
        hand: (i === seat || open) ? p.hand : p.hand.map(() => ({ hidden: true })) })),
      handNo: s.handNo, turn: s.turn, table: s.table, trick: s.trick || [], passes: s.passes, leader: s.leader, first: s.first,
      phase: s.phase, log: s.log, winner: s.winner, lastWinner: s.lastWinner, lastResult: s.lastResult || null, passSeq: s.passSeq || 0, lastPassBy: s.lastPassBy,
    }));
  };
  B._push = function () {
    const O = this.O; if (!O || !O.isHost || !O.started) return;
    for (const seat in O.peerOf) Platform.net.sendTo(O.peerOf[seat], 'state', { st: this._redact(+seat), seat: +seat });
  };
  B._newMatchOnline = function () {
    const names = this.O.names;
    this.st = { players: [0, 1, 2, 3].map(i => ({ id: i, name: names[i] || ['', 'AI甲', 'AI乙', 'AI丙'][i], isAI: !(i === 0 || names[i] != null), hand: [], score: 0, last: '' })),
      handNo: 0, turn: 0, table: null, trick: [], passes: 0, leader: -1, first: true, phase: 'idle', log: [], winner: -1, lastWinner: -1 };
    this._overShown = false;
    this.newHand();
  };
  B._hostStart = function () {
    this._clearTimers(); this._prev = null; this.O.started = true;
    for (const seat in this.O.peerOf) Platform.net.sendTo(this.O.peerOf[seat], 'start', { seat: +seat });
    this._newMatchOnline();
  };
  B._setupHostNet = function () {
    Platform.net.on('_open', (d, from) => {
      if (this.O.started) { Platform.net.sendTo(from, 'full', {}); return; }
      let seat = -1; for (let i = 1; i < 4; i++) if (!this.O.peerOf[i]) { seat = i; break; }
      if (seat < 0) { Platform.net.sendTo(from, 'full', {}); return; }
      this.O.seatOf[from] = seat; this.O.peerOf[seat] = from; this.O.names[seat] = d.name || ('賓客' + seat);
      Platform.net.sendTo(from, 'welcome', { seat }); Platform.net.broadcast('lobby', { names: this.O.names }); this._renderRoom();
    });
    Platform.net.on('_close', (d, from) => {
      const seat = this.O.seatOf[from]; if (seat == null) return;
      delete this.O.peerOf[seat]; delete this.O.seatOf[from]; this.O.names[seat] = null;
      if (this.O.started && this.st && this.st.players[seat]) {
        const p = this.st.players[seat]; p.isAI = true; this.log(`${p.name} 離線，改由電腦接手`);
        if (this.st.turn === seat) this.tick(); this.render();
      } else this._renderRoom();
      Platform.net.broadcast('lobby', { names: this.O.names });
    });
    Platform.net.on('act', (d, from) => {
      const seat = this.O.seatOf[from], s = this.st;
      if (!d || seat == null || !s || s.turn !== seat || s.phase !== 'play') return;
      if (d.kind === 'pass') { this.pass(seat); return; }
      if (d.kind !== 'play' || !Array.isArray(d.cards) || d.cards.length < 1 || d.cards.length > 5) return;
      const hand = s.players[seat].hand, pick = [];
      for (const c of d.cards) { const h = hand.find(x => x.r === (c && c.r) && x.s === (c && c.s)); if (!h || pick.includes(h)) return; pick.push(h); } // 只接受自己手上、不重複的牌
      this.play(seat, pick);
    });
  };
  B._setupGuestNet = function () {
    Platform.net.on('welcome', d => { this.O.mySeat = d.seat; this._renderRoom(); });
    Platform.net.on('lobby', d => { this.O.names = d.names; this._renderRoom(); });
    Platform.net.on('start', d => { if (d && d.seat != null) this.O.mySeat = d.seat; this.O.started = true; this._overShown = false; this._prev = null; if (this._overModal) { this._overModal.close(); this._overModal = null; } });
    Platform.net.on('state', d => { this.st = d.st; this.O.mySeat = d.seat; this.O.started = true; this.render(); });
    Platform.net.on('full', () => { Platform.toast('房間已滿或已開始'); Platform.exit(); });
    Platform.net.on('_close', () => { if (!this._root) return; Platform.toast('房主已離線'); Platform.exit(); });
  };
  B._startOnline = function (opts) {
    const name = Platform.store.get('arcade_name', '') || (opts.join ? '賓客' : '房主');
    this.O = { isHost: !opts.join, mySeat: opts.join ? -1 : 0, seatOf: {}, peerOf: {}, names: [null, null, null, null], started: false };
    this._renderRoom();
    Platform.net.init(name).then(() => {
      if (this.O.isHost) { Platform.net.createRoom(); this.O.names[0] = name; this._setupHostNet(); this._renderRoom(); }
      else { this._setupGuestNet(); Platform.net.joinRoom(opts.join.host); this._renderRoom(); }
    }).catch(e => { Platform.toast('連線失敗：' + (e.message || e)); Platform.exit(); });
  };
  B._renderRoom = function () { if (!this._root || !this.O || this.O.started) return; Platform.net.renderRoom(this._root, this.O, '🂡 大老二', () => this._hostStart()); };
  B.restart = function () { this._clearTimers(); this._overShown = false; this._prev = null; if (this.O && this.O.isHost) { this._hostStart(); return; } this.newMatch(this._human || '你'); };

  // ---------- 骨架 ----------
  B._skin = function () { const r = this._root.style, abs = u => new URL(u, document.baseURI).href;
    r.setProperty('--b2-sheet', `url('${abs(Platform.cards.SHEET)}')`); r.setProperty('--b2-back', `url('${abs(Platform.cards.BACK)}')`); };
  B._build = function () {
    const root = this._root;
    const seat = p => `<div class="b2-seat" data-p="${p}"><div class="b2-pod"><div class="b2-ava"><span class="b2-ini"></span></div>
      <div><div class="b2-nm"></div><div class="b2-cnt"><b>0</b> 張</div><div class="b2-score"></div></div><div class="b2-fanback"></div></div><span class="b2-bub"></span></div>`;
    root.innerHTML = `<div class="b2-app">
      <header class="b2-top">
        <div class="b2-brand">大老二</div>
        <div class="b2-info">第 <b class="b2-hno">1</b> 局<span class="b2-target"> · 先到 ${B.TARGET} 分者輸</span></div>
        <button class="b2-ibtn b2-snd" aria-label="音效開關"></button>
        <button class="b2-ibtn b2-style" aria-label="牌面風格">🎴</button>
        <button class="b2-ibtn b2-logbtn" aria-label="牌局紀錄">☰</button>
      </header>
      <main class="b2-wrap"><div class="b2-table">
        ${seat(1)}${seat(2)}${seat(3)}
        ${[0, 1, 2, 3].map(p => `<div class="b2-spot" data-p="${p}"></div>`).join('')}
        <div class="b2-center"><div class="b2-type"></div><div class="b2-status" aria-live="polite"></div></div>
        <div class="b2-deck"></div>
      </div></main>
      <section class="b2-dock" aria-label="你的手牌與行動">
        <div class="b2-me"><div class="b2-ava"><span class="b2-ini"></span></div><div><div class="b2-nm"></div><div class="b2-score"></div></div><span class="b2-bub"></span></div>
        <div class="b2-mid">
          <div class="b2-tip" aria-live="polite"></div>
          <div class="b2-chips" role="group" aria-label="牌型快捷">${TYPES.map(t => `<button class="b2-chip" data-t="${t}" disabled>${B.TYPE_NAME[t]}<b></b></button>`).join('')}</div>
          <div class="b2-hand"></div>
        </div>
        <div class="b2-acts"><button class="b2-act b2-sort" aria-label="排序方式">點數排序</button><button class="b2-act b2-pass" disabled>過</button><button class="b2-act primary b2-play" disabled>出牌</button></div>
      </section>
      <div class="b2-result" aria-live="polite"><div class="b2-rbox"></div></div>
      <aside class="b2-log" aria-label="牌局紀錄"><h2>牌局紀錄 <button class="b2-ibtn b2-logx" aria-label="關閉">✕</button></h2><ul></ul></aside>
    </div>`;
    const q = s => root.querySelector(s);
    const U = this._ui = {
      app: q('.b2-app'), hno: q('.b2-hno'), status: q('.b2-status'), type: q('.b2-type'), deck: q('.b2-deck'),
      seat: [q('.b2-me'), ...[1, 2, 3].map(p => q(`.b2-seat[data-p="${p}"]`))], spot: [0, 1, 2, 3].map(p => q(`.b2-spot[data-p="${p}"]`)),
      hand: q('.b2-hand'), tip: q('.b2-tip'), chips: [...root.querySelectorAll('.b2-chip')], play: q('.b2-play'), pass: q('.b2-pass'), sort: q('.b2-sort'),
      result: q('.b2-result'), rbox: q('.b2-rbox'), snd: q('.b2-snd'), log: q('.b2-log'), logList: q('.b2-log ul'),
    };
    U.ava = U.seat.map(e => e.querySelector('.b2-ava')); U.bub = U.seat.map(e => e.querySelector('.b2-bub'));
    this._prev = null; this._sel = new Set(); this._sortBy = 'rank'; this._cyc = {};
    const sndIcon = () => { U.snd.textContent = Platform.audio.enabled ? '🔊' : '🔇'; U.snd.setAttribute('aria-pressed', String(Platform.audio.enabled)); };
    sndIcon(); U.snd.onclick = () => { Platform.audio.setEnabled(!Platform.audio.enabled); sndIcon(); };
    q('.b2-logbtn').onclick = () => U.log.classList.add('open'); q('.b2-logx').onclick = () => U.log.classList.remove('open');
    q('.b2-style').onclick = () => Platform.ui.modal({ title: '選擇牌面風格', html: '即時切換（會記住）',
      buttons: Object.keys(Platform.cards.STYLE_NAMES).map(k => ({ label: Platform.cards.STYLE_NAMES[k] + (Platform.cards.style === k ? ' ✓' : ''), primary: Platform.cards.style === k,
        onClick: c => { c(); Platform.cards.setStyle(k); this._skin(); } })) });
    U.sort.onclick = () => { this._sortBy = this._sortBy === 'rank' ? 'suit' : 'rank'; U.sort.textContent = this._sortBy === 'rank' ? '點數排序' : '花色排序'; this._paintHand(false); };
    this._skin();
  };

  // ---------- 手牌（自己）----------
  B._myHand = function () {
    const h = [...this.st.players[this._me].hand].filter(known);
    return this._sortBy === 'rank' ? B.sortHand(h) : h.sort((a, b) => SS_.indexOf(a.s) - SS_.indexOf(b.s) || B.cv(a) - B.cv(b));
  };
  B._paintHand = function (deal, dealDelay = []) {
    const U = this._ui, h = this._myHand(), rows = portrait() && h.length > 7 ? [h.slice(0, 7), h.slice(7)] : [h];
    let idx = 0;
    U.hand.innerHTML = rows.map(row => `<div class="b2-row">${row.map((c, k) => {
      const d = deal ? `--d:${dealDelay[idx] || 0}ms;` : ''; idx++;
      return cardHTML(c, (this._sel.has(key(c)) ? 'sel ' : '') + (deal ? 'deal' : ''), d + (rows.length === 1 ? fan(k, row.length, 2.2, 1.1) : ''));
    }).join('')}</div>`).join('');
    U.hand.querySelectorAll('.b2-card').forEach(el => {
      el.setAttribute('role', 'button'); el.tabIndex = 0;
      const toggle = () => { const k = el.dataset.k; this._sel.has(k) ? this._sel.delete(k) : this._sel.add(k); this._cyc = {}; this.sfx.play('slide', { gain: .22, rate: 1.4 }); this._paintSel(); };
      el.onclick = toggle; el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } };
    });
    this._paintSel();
  };
  // 選取外觀 + 出牌按鈕 + 提示文字 + 牌型快捷
  B._paintSel = function () {
    const U = this._ui, s = this.st, me = this._me, mine = s.players[me];
    const myTurn = s.phase === 'play' && s.turn === me;
    const hand = mine.hand.filter(known), cards = hand.filter(c => this._sel.has(key(c)));
    U.hand.querySelectorAll('.b2-card').forEach(el => { const on = this._sel.has(el.dataset.k); el.classList.toggle('sel', on); el.setAttribute('aria-pressed', String(on)); });
    const t = cards.length ? B.classify(cards) : null;
    const must = myTurn && s.first ? hand.find(c => c.r === '3' && c.s === 'c') : null;
    const ok = myTurn && t && B.beats(t, s.table && s.table.t) && (!must || cards.includes(must));
    U.play.disabled = !ok; U.play.textContent = ok ? `出 ${B.TYPE_NAME[t.type]}` : '出牌';
    U.pass.disabled = !(myTurn && s.table);
    U.tip.className = 'b2-tip' + (cards.length && !ok ? ' bad' : '');
    U.tip.textContent = !cards.length ? (myTurn ? (s.table ? `要壓過 ${s.players[s.table.by].name} 的${B.TYPE_NAME[s.table.t.type]}` : must ? '第一手要含梅花 3' : '你有出牌權，出什麼都可以') : '')
      : !t ? '這幾張不是合法牌型' : !myTurn ? `已選：${B.TYPE_NAME[t.type]}` : ok ? '' : must && !cards.includes(must) ? '第一手要含梅花 3' : `${B.TYPE_NAME[t.type]}壓不過桌上的牌`;
    // 牌型快捷：輪到自己時列「壓得過的」，否則列手上有的
    const pool = myTurn ? B.legalPlays(hand, s.table, must) : B.combos(hand);
    const by = {}; pool.forEach(cs => { const tp = B.classify(cs).type; (by[tp] = by[tp] || []).push(cs); });
    this._chipPool = by;
    U.chips.forEach(ch => { const n = (by[ch.dataset.t] || []).length; ch.querySelector('b').textContent = n ? n : '';
      ch.disabled = !n || !myTurn; ch.classList.toggle('on', !!(t && t.type === ch.dataset.t)); });
  };
  // 點牌型快捷：由小到大循環選一組
  B._pickType = function (tp) {
    const list = (this._chipPool[tp] || []).slice().sort((a, b) => B._cmpKey(B.classify(a).key, B.classify(b).key));
    if (!list.length) return;
    const i = this._cyc[tp] = ((this._cyc[tp] ?? -1) + 1) % list.length;
    this._sel = new Set(list[i].map(key)); this.sfx.play('slide', { gain: .25, rate: 1.3 }); this._paintSel();
    const cyc = this._cyc[tp]; this._cyc = { [tp]: cyc };
  };

  // ---------- 結算面板 ----------
  B._showResult = function () {
    const U = this._ui, s = this.st, w = s.winner, res = s.lastResult || [];
    U.rbox.innerHTML = '';
    const h = document.createElement('h2'); h.textContent = `${s.players[w].name} 出完了！`; U.rbox.append(h);
    s.players.forEach((p, i) => {
      const row = document.createElement('div'); row.className = 'b2-rrow' + (i === w ? ' win' : '');
      const nm = document.createElement('div'); nm.className = 'b2-rname'; nm.textContent = p.name + (i === w ? ' 🏆' : '');
      const cs = document.createElement('div'); cs.className = 'b2-rcards'; cs.innerHTML = p.hand.filter(known).map(c => cardHTML(c)).join('');
      const pen = document.createElement('b'); pen.textContent = i === w ? '' : `−${res[i]}`;
      const tot = document.createElement('span'); tot.textContent = `累計 ${p.score}`;
      row.append(nm, cs, pen, tot); U.rbox.append(row);
    });
    U.result.classList.add('on'); this.sfx.play('toast', { gain: .5 });
  };

  // ---------- 主渲染：依前後狀態差異觸發動畫 ----------
  B.render = function () {
    const root = this._root; if (!root) return;
    const O = this.O;
    if (O && !O.started) { this._renderRoom(); return; }
    const s = this.st; if (!s) return;
    if (!root.querySelector('.b2-app')) this._build();
    const U = this._ui, me = this._me = O ? O.mySeat : 0, pl = s.players, N = 4, pos = i => (i - me + N) % N, tl = this._tl;
    const P = this._prev, newHand = !P || P.hand !== s.handNo, trick = s.trick || [];
    U.hno.textContent = s.handNo;
    // 座位：名字、張數、分數、對手手牌扇形
    pl.forEach((p, i) => {
      const k = pos(i), el = U.seat[k];
      el.querySelector('.b2-ini').textContent = ini(p.name); el.querySelector('.b2-nm').textContent = p.name;
      el.querySelector('.b2-score').textContent = `${p.score} 分`;
      if (k) {
        const n = p.hand.length, c = el.querySelector('.b2-cnt'); c.querySelector('b').textContent = n; c.classList.toggle('low', n > 0 && n <= 3);
        const fb = el.querySelector('.b2-fanback');
        if (fb.childElementCount !== n || newHand) fb.innerHTML = Array.from({ length: n }, (_, j) => `<i style="${fan(j, n, 5, .6)}${newHand ? `;--d:${600 + j * 4 * 40 + k * 40}ms` : ''}" class="${newHand ? 'deal' : ''}"></i>`).join('');
      }
      el.classList.toggle('turn', s.phase === 'play' && s.turn === i);
    });

    if (newHand) {
      tl.clear(); this._sel = new Set(); this._cyc = {};
      U.spot.forEach(sp => { sp.innerHTML = ''; sp.className = 'b2-spot'; }); U.type.textContent = ''; U.result.classList.remove('on');
      U.bub.forEach(b => { b.className = 'b2-bub'; });
      this.sfx.play('shuffle', { gain: .6 });
      const delays = []; for (let r = 0; r < 13; r++) for (let k = 0; k < 4; k++) {
        const d = 600 + (r * 4 + k) * 40;
        if (k === 0) delays.push(d + 260);
        if (r % 3 === 0) { tl.fly(U.deck, k ? U.ava[k] : U.hand, cardHTML(null, '', '--w:40px'), 260, d); this.sfx.play('slide', { gain: .3, when: d / 1000 }); }
      }
      this._paintHand(true, delays);
    } else {
      // 有人出牌：這一輪的出牌紀錄變長
      if (trick.length > P.trickLen) {
        const e = trick[trick.length - 1], k = pos(e.by), bomb = B.isBomb({ type: e.type });
        U.spot.forEach(sp => sp.classList.remove('lead'));
        const sp = U.spot[k]; sp.className = 'b2-spot lead';
        sp.innerHTML = e.cards.map((c, j) => cardHTML(c, 'in', `--d:${240 + j * 50}ms;${fan(j, e.cards.length, 5, 1.2)}`)).join('');
        U.spot.forEach((o, j) => { if (j !== k && o.childElementCount) o.classList.add('old'); });
        e.cards.forEach((c, j) => tl.fly(k ? U.ava[k] : U.hand, sp, cardHTML(c, '', '--w:46px'), 280, j * 50, [-12, 0]));
        if (bomb) { this.sfx.play('slam', { gain: 1, when: .2 }); tl.after(() => Platform.fx.restart(U.app, 'shake'), 220); }
        else this.sfx.play('place', { gain: .8, when: .22 });
        U.type.textContent = B.TYPE_NAME[e.type]; Platform.fx.restart(U.type, 'pop');
        if (k) this._say(k, B.TYPE_NAME[e.type], 'type');
        if (!k || e.by === me) this._sel = new Set();
      }
      // 一輪結束：桌上牌收走
      if (trick.length === 0 && P.trickLen > 0) {
        // 只收走「此刻」桌上的牌；之後若有人立刻出新牌，不會被一起清掉
        const gone = U.spot.map(sp => { if (sp.childElementCount) { tl.fly(sp, U.deck, cardHTML(null, '', '--w:40px'), 380, 0); sp.classList.add('clear'); } return [...sp.children]; });
        tl.after(() => U.spot.forEach((sp, j) => { gone[j].forEach(n => n.remove()); if (!sp.childElementCount) sp.className = 'b2-spot'; }), 360);
        U.type.textContent = ''; this.sfx.play('shove', { gain: .5 });
        U.bub.forEach(b => { b.className = 'b2-bub'; });
      }
      // 過
      if ((s.passSeq || 0) > (P.passSeq || 0) && s.lastPassBy != null) { const k = pos(s.lastPassBy); if (k) this._say(k, '過'); this.sfx.play('slide', { gain: .18, rate: .8 }); }
      // 結算
      if (s.phase === 'scored' && P.phase !== 'scored') {
        U.spot.forEach(o => o.classList.add('old'));
        tl.after(() => this._showResult(), 1100);
      }
    }
    // 自己手牌：張數變了（出牌或連線新狀態）才重繪
    const myN = pl[me].hand.length;
    if (!newHand && (!P || P.myN !== myN || P.phase !== s.phase)) this._paintHand(false);
    else this._paintSel();
    // 中央狀態
    U.status.textContent = s.phase !== 'play' ? '' : !s.table ? `${pl[s.turn].name} 有出牌權${s.first ? '（第一手須含梅花 3）' : ''}`
      : `${pl[s.table.by].name} 的${B.TYPE_NAME[s.table.t.type]} · 輪到 ${pl[s.turn].name}`;
    U.app.classList.toggle('myturn', s.phase === 'play' && s.turn === me);
    if (s.phase === 'play' && s.turn === me && (!P || P.turn !== s.turn || newHand)) Platform.audio._tone(880, .25, 'sine', .1, newHand ? 3 : 0);
    // 紀錄（純文字）
    U.logList.replaceChildren(...s.log.map(l => { const li = document.createElement('li'); li.textContent = l; return li; }));
    // 整場結束
    if (s.phase === 'over' && !this._overShown) {
      this._overShown = true;
      const best = pl.reduce((a, b) => b.score < a.score ? b : a), iWin = best.id === me;
      Platform.audio && (iWin ? Platform.audio.win() : Platform.audio.lose());
      const isGuest = O && !O.isHost;
      this._overModal = Platform.ui.modal({ title: iWin ? '🏆 你是最低分！' : '遊戲結束',
        html: `最低分：<b>${best.name.replace(/[<>&"']/g, '')}</b>（${best.score} 分）`,
        buttons: isGuest ? [{ label: '回大廳', primary: true, onClick: c => { c(); Platform.exit(); } }]
          : [{ label: '再來一場', primary: true, onClick: c => { c(); this.restart(); } }, { label: '回大廳', onClick: c => { c(); Platform.exit(); } }] });
    }
    this._prev = { hand: s.handNo, trickLen: trick.length, passSeq: s.passSeq || 0, myN, phase: s.phase, turn: s.turn };
    this._push();
  };
  B._say = function (k, t, cls = '') { const b = this._ui.bub[k]; b.textContent = t; b.className = 'b2-bub ' + cls; Platform.fx.restart(b, 'pop'); };

  // 送出動作：房主直接套用；賓客送給房主驗證
  B._send = function (kind, cards) {
    const isHost = !this.O || this.O.isHost, me = this._me;
    this._sel = new Set(); this._cyc = {};
    if (kind === 'pass') { if (isHost) this.pass(me); else Platform.net.sendHost('act', { kind: 'pass' }); return; }
    if (isHost) { const hand = this.st.players[me].hand; this.play(me, cards.map(c => hand.find(h => key(h) === key(c)))); }
    else Platform.net.sendHost('act', { kind: 'play', cards: cards.map(c => ({ r: c.r, s: c.s })) });
  };

  Platform.register({
    id: 'bigtwo', name: '大老二', icon: '🂡',
    desc: '台灣大老二：對子、順子、葫蘆、鐵支炸彈', players: { min: 2, max: 4 },
    online: true,
    mount(stage, opts) {
      const root = document.createElement('div'); root.id = 'b2-root'; root.className = 'b2-root'; stage.appendChild(root);
      B._root = root; B._human = '你'; B._prev = null; B._overShown = false; B._tl = Platform.fx.timeline(root);
      B.sfx.unlock(); B.sfx.load();
      root.addEventListener('pointerdown', () => B.sfx.unlock(), { passive: true });
      root.addEventListener('click', e => {
        const U = B._ui; if (!U) return;
        const chip = e.target.closest('.b2-chip'); if (chip && !chip.disabled) { B._pickType(chip.dataset.t); return; }
        if (e.target === U.play && !U.play.disabled) { const hand = B.st.players[B._me].hand.filter(known); B._send('play', hand.filter(c => B._sel.has(key(c)))); return; }
        if (e.target === U.pass && !U.pass.disabled) B._send('pass');
      });
      B._mq = matchMedia('(orientation: portrait)'); B._onMq = () => { if (B._ui && B.st) B._paintHand(false); }; B._mq.addEventListener('change', B._onMq);
      if (opts && opts.online) B._startOnline(opts); else { B.O = null; B.newMatch('你'); }
    },
    unmount() {
      B._clearTimers(); if (B._tl) B._tl.clear(); if (B._mq) B._mq.removeEventListener('change', B._onMq);
      if (B._overModal) { B._overModal.close(); B._overModal = null; }
      B._root = null; B._ui = null; B.st = null; B.O = null; B._overShown = false;
    },
  });
}
