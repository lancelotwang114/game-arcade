/* 21 點 Blackjack — 單機 + 電腦（4 個座位，每局輪流當莊）
   規則：
   - 6 副牌的牌靴，剩不到 1/4 重洗。起始 1000 籌碼，打 ROUNDS 局後籌碼最多者勝（輸光就只能看）。
   - 每局莊家輪替；莊家不做決定，照規則補牌：不到 17 點就拿，到 17（含軟 17）就停。
   - 閒家先下注（10 ~ 500），發兩張；莊家一明一暗。
   - 莊家明牌是 A 可買保險（下注一半，莊家 Blackjack 賠 2 倍）；明牌 A 或 10 點時莊家先偷看，有 Blackjack 直接結算。
   - 閒家依序：要牌 / 停牌 / 加倍（前兩張，加倍下注只再拿一張）/ 分牌（兩張同點數，限一次；分 A 各只拿一張）。
   - 過五關：拿到 5 張沒爆牌直接贏（賠 2 倍）。Blackjack（非分牌後的 A + 10 點）賠 1.5 倍。
   - 籌碼在閒家與當局莊家之間結算。 */
const Blackjack = {
  RANKS: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUITS: ['s', 'h', 'd', 'c'],
  DECKS: 6, START: 1000, ROUNDS: 8, MIN_BET: 10, MAX_BET: 500,

  // ---------- 純規則 ----------
  cardVal(c) { return c.r === 'A' ? 1 : ['J', 'Q', 'K'].includes(c.r) ? 10 : +c.r; },
  // { total, soft }：soft = 有 A 當 11 算
  value(cards) {
    let t = 0, ace = false; for (const c of cards) { t += this.cardVal(c); if (c.r === 'A') ace = true; }
    return ace && t + 10 <= 21 ? { total: t + 10, soft: true } : { total: t, soft: false };
  },
  isBJ(hand) { return !hand.split && hand.cards.length === 2 && this.value(hand.cards).total === 21; },
  isCharlie(hand) { return hand.cards.length >= 5 && this.value(hand.cards).total <= 21; },
  canSplit(hand, chips) { const c = hand.cards; return !hand.split && c.length === 2 && this.cardVal(c[0]) === this.cardVal(c[1]) && chips >= hand.bet; },
  canDouble(hand, chips) { return hand.cards.length === 2 && !hand.doubled && chips >= hand.bet && !(hand.split && hand.cards[0].r === 'A'); },
  // 一手牌對莊家的結果倍數（含本金以外的淨輸贏）：+2 過五關 / +1.5 BJ / +1 / 0 / -1
  outcome(hand, dealerCards) {
    const p = this.value(hand.cards).total, d = this.value(dealerCards).total, dBJ = dealerCards.length === 2 && d === 21;
    if (p > 21) return -1;
    if (this.isBJ(hand)) return dBJ ? 0 : 1.5;
    if (dBJ) return -1;
    if (this.isCharlie(hand)) return 2;
    if (d > 21) return 1;
    return p > d ? 1 : p < d ? -1 : 0;
  },
  shoe() {
    const a = []; for (let k = 0; k < this.DECKS; k++) for (const s of this.SUITS) for (const r of this.RANKS) a.push({ r, s });
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  },

  // ---------- 對局狀態 ----------
  st: null, _timers: [], TURN_SEC: 30, AI_SPEED: 1,
  newMatch(human = '你', online = null) {
    const names = online ? online.map((n, i) => n ?? ['', '阿牛', '小美', '老張'][i]) : [human, '阿牛', '小美', '老張'];
    this.st = { players: names.map((nm, i) => ({ id: i, name: nm, isAI: online ? online[i] == null : i !== 0, chips: this.START, bet: 0, hands: [], insured: null, style: ['', 'attack', 'balanced', 'defense'][i] })),
      shoe: this.shoe(), roundNo: 0, dealer: -1, dealerCards: [], holeShown: false, phase: 'idle', turn: -1, hand: 0, log: [], lastNet: null };
    this.newRound();
  },
  canInsure(p) { return p.chips - p.bet >= Math.ceil(p.bet / 2); },
  bettors() { const s = this.st; return s.players.map((p, i) => i).filter(i => i !== s.dealer && s.players[i].chips >= this.MIN_BET); },
  draw() { const s = this.st; if (s.shoe.length < this.DECKS * 13) { s.shoe = this.shoe(); this.log('🔀 牌靴重洗'); } return s.shoe.pop(); },
  newRound() {
    const s = this.st; s.roundNo++;
    // 莊家輪替（跳過輸光的人）
    let d = s.dealer; for (let k = 0; k < 4; k++) { d = (d + 1) % 4; if (s.players[d].chips > 0) break; }
    s.dealer = d; s.dealerCards = []; s.holeShown = false; s.turn = -1; s.hand = 0; s.lastNet = null;
    s.players.forEach(p => { p.bet = 0; p.hands = []; p.insured = null; });
    if (!this.bettors().length) { s.phase = 'over'; if (this.render) this.render(); return; } // 沒人下得起注
    s.phase = 'bet';
    this.log(`🃏 第 ${s.roundNo} 局：${s.players[d].name} 當莊，請下注`);
    this._betAt = Date.now();
    if (this.render) this.render();
    const rn = s.roundNo;
    s.players.forEach((p, i) => {
      if (!this.bettors().includes(i)) return;
      if (p.isAI) this._after((900 + Math.random() * 1400) * this.AI_SPEED, () => this.setBet(i, this.aiBet(i)));
      else if (this.TURN_SEC) this._after(this.TURN_SEC * 1000, () => { if (s.roundNo === rn && s.phase === 'bet' && !p.bet) this.setBet(i, this.MIN_BET); }); // 逾時：下最低注
    });
  },
  setBet(i, amt) {
    const s = this.st, p = s.players[i];
    if (s.phase !== 'bet' || !this.bettors().includes(i) || p.bet) return false;
    if (!Number.isInteger(amt) || amt < this.MIN_BET || amt > Math.min(this.MAX_BET, p.chips) || amt % 10) return false;
    p.bet = amt; this.log(`${p.name} 下注 ${amt}`);
    if (this.bettors().every(j => s.players[j].bet)) this._deal(); else if (this.render) this.render();
    return true;
  },
  _deal() {
    const s = this.st, order = this._order();
    order.forEach(i => { const p = s.players[i]; p.hands = [{ cards: [this.draw()], bet: p.bet, done: false, doubled: false, split: false }]; });
    s.dealerCards.push(this.draw());
    order.forEach(i => s.players[i].hands[0].cards.push(this.draw()));
    s.dealerCards.push(this.draw());
    s.phase = 'deal'; this._dealtAt = Date.now();
    if (this.render) this.render();
    const wait = 600 + (order.length + 1) * 2 * 260 + 600; // 等發牌動畫
    this._after(wait, () => {
      if (s.dealerCards[0].r === 'A' && order.some(i => this.canInsure(s.players[i]))) {
        s.phase = 'insure'; this.log('莊家明牌是 A：要買保險嗎？'); if (this.render) this.render();
        order.forEach(i => { const p = s.players[i]; if (!this.canInsure(p)) p.insured = false; else if (p.isAI) this._after((800 + Math.random() * 900) * this.AI_SPEED, () => this.insure(i, false));
          else if (this.TURN_SEC) { const rn = s.roundNo; this._after(this.TURN_SEC * 1000, () => { if (s.roundNo === rn && s.phase === 'insure' && p.insured === null) this.insure(i, false); }); } }); // 逾時：不買
        this._insureCheck();
      } else this._peek();
    });
  },
  // 閒家順序：從莊家下一位開始
  _order() { const s = this.st; return [1, 2, 3].map(k => (s.dealer + k) % 4).filter(i => s.players[i].bet > 0); },
  insure(i, yes) {
    const s = this.st, p = s.players[i];
    if (s.phase !== 'insure' || p.insured !== null || !p.bet) return false;
    p.insured = !!yes && this.canInsure(p);
    if (p.insured) this.log(`${p.name} 買保險 ${Math.ceil(p.bet / 2)}`);
    if (this.render) this.render();
    this._insureCheck(); return true;
  },
  _insureCheck() { const s = this.st; if (s.phase === 'insure' && this._order().every(i => s.players[i].insured !== null)) this._peek(); },
  // 莊家偷看：明牌 A 或 10 點且有 Blackjack → 直接結算
  _peek() {
    const s = this.st, up = this.cardVal(s.dealerCards[0]);
    if ((up === 1 || up === 10) && this.value(s.dealerCards).total === 21) { this.log(`${s.players[s.dealer].name}（莊）Blackjack！`); this._settle(); return; }
    if (s.players.some(p => p.insured)) this.log('莊家沒有 Blackjack，保險沒收');
    s.phase = 'play'; s.turn = -1; this._advance();
  },
  // 找下一個還要動作的手
  _advance() {
    const s = this.st;
    for (const i of this._order()) {
      const p = s.players[i];
      for (let h = 0; h < p.hands.length; h++) {
        const hd = p.hands[h];
        if (hd.done) continue;
        const v = this.value(hd.cards).total;
        if (v >= 21 || this.isCharlie(hd) || (hd.split && hd.cards[0].r === 'A' && hd.cards.length >= 2)) { hd.done = true; continue; }
        s.turn = i; s.hand = h; this._turnAt = Date.now();
        if (this.render) this.render(); this.tick(); return;
      }
    }
    s.turn = -1; this._dealerPlay();
  },
  act(i, kind) {
    const s = this.st; if (s.phase !== 'play' || s.turn !== i) return false;
    const p = s.players[i], hd = p.hands[s.hand];
    if (kind === 'hit') { hd.cards.push(this.draw()); const v = this.value(hd.cards).total; this.log(`${p.name} 要牌${v > 21 ? '：爆了！' : this.isCharlie(hd) ? '：過五關！' : ''}`); }
    else if (kind === 'stand') { hd.done = true; this.log(`${p.name} 停牌（${this.value(hd.cards).total}）`); }
    else if (kind === 'double') { if (!this.canDouble(hd, p.chips - this._committed(p))) return false; hd.bet *= 2; hd.doubled = true; hd.cards.push(this.draw()); hd.done = true; this.log(`${p.name} 加倍`); }
    else if (kind === 'split') {
      if (!this.canSplit(hd, p.chips - this._committed(p))) return false;
      const c2 = hd.cards.pop(); hd.split = true; hd.cards.push(this.draw());
      p.hands.splice(s.hand + 1, 0, { cards: [c2, this.draw()], bet: hd.bet, done: false, doubled: false, split: true });
      this.log(`${p.name} 分牌`);
    } else return false;
    this._advance(); return true;
  },
  // 已押在桌上的籌碼（下注 + 保險）
  _committed(p) { return p.hands.reduce((a, h) => a + h.bet, 0) + (p.insured ? Math.ceil(p.bet / 2) : 0); },
  _dealerPlay() {
    const s = this.st; s.phase = 'dealer'; s.holeShown = true;
    if (this.render) this.render();
    const live = this._order().some(i => s.players[i].hands.some(h => this.value(h.cards).total <= 21 && !this.isBJ(h) && !this.isCharlie(h)));
    const step = () => {
      const v = this.value(s.dealerCards);
      if (live && v.total < 17) { s.dealerCards.push(this.draw()); if (this.render) this.render(); this._after(1000, step); return; }
      this.log(`${s.players[s.dealer].name}（莊）${v.total > 21 ? '爆了！' : `停在 ${v.total}`}`);
      this._after(700, () => this._settle());
    };
    this._after(1200, step);
  },
  _settle() {
    const s = this.st, D = s.players[s.dealer], net = [0, 0, 0, 0], dBJ = s.dealerCards.length === 2 && this.value(s.dealerCards).total === 21;
    s.holeShown = true;
    for (const i of this._order()) {
      const p = s.players[i];
      let n = 0;
      if (p.insured) n += dBJ ? Math.ceil(p.bet / 2) * 2 : -Math.ceil(p.bet / 2);
      p.hands.forEach(h => { const o = this.outcome(h, s.dealerCards); h.result = o; n += Math.floor(h.bet * o); });
      net[i] = n; net[s.dealer] -= n; p.chips += n;
    }
    D.chips += net[s.dealer]; // ponytail: 莊家可能賠到負數（視為輸光，之後不再當莊）；要設莊家上限再加桌限

    s.lastNet = net; s.phase = 'settle';
    this.log(net.map((n, i) => i === s.dealer || n || s.players[i].bet ? `${s.players[i].name} ${n >= 0 ? '+' : ''}${n}` : '').filter(Boolean).join('、'));
    if (this.render) this.render();
    const over = s.roundNo >= this.ROUNDS || s.players.filter(p => p.chips > 0).length <= 1;
    this._after(6000, () => { if (over) { s.phase = 'over'; if (this.render) this.render(); } else this.newRound(); });
  },
  tick() {
    const s = this.st; if (!s || s.phase !== 'play' || s.turn < 0) return;
    const i = s.turn, tok = this._tickNo = (this._tickNo || 0) + 1, wait = (this._dealtAt || 0) + 2500 - Date.now();
    if (s.players[i].isAI) this._after(Math.max((1200 + Math.random() * 600) * this.AI_SPEED, wait), () => this.aiAct(i));
    else if (this.TURN_SEC) this._after(Math.max(0, wait) + this.TURN_SEC * 1000, () => { if (this._tickNo === tok && s.turn === i && s.phase === 'play') this.aiAct(i); }); // 逾時：電腦代打一步
  },

  // ---------- 電腦：簡化基本策略 ----------
  aiBet(i) { const p = this.st.players[i], k = { attack: .15, balanced: .08, defense: .04 }[p.style] ?? .08;
    return Math.max(this.MIN_BET, Math.min(this.MAX_BET, p.chips, Math.round(p.chips * k * (.7 + Math.random() * .6) / 10) * 10)); },
  aiDecide(hand, up, chips) {
    const { total, soft } = this.value(hand.cards), u = this.cardVal(up) === 1 ? 11 : this.cardVal(up);
    if (this.canSplit(hand, chips) && ['A', '8'].includes(hand.cards[0].r)) return 'split';
    if (this.canDouble(hand, chips) && !soft && (total === 11 || (total === 10 && u < 10))) return 'double';
    if (soft) return total <= 17 ? 'hit' : 'stand';
    if (total <= 11) return 'hit';
    if (total <= 16) return u >= 7 ? 'hit' : 'stand';
    return 'stand';
  },
  aiAct(i) {
    const s = this.st; if (!s || s.phase !== 'play' || s.turn !== i) return;
    const p = s.players[i]; this.act(i, this.aiDecide(p.hands[s.hand], s.dealerCards[0], p.chips - this._committed(p)));
  },

  log(m) { this.st.log.unshift(m); if (this.st.log.length > 12) this.st.log.pop(); },
  _after(ms, fn) { const t = setTimeout(fn, ms); this._timers.push(t); return t; },
  _clearTimers() { this._timers.forEach(clearTimeout); this._timers = []; },
};

// ---------- node 自測 ----------
if (typeof module !== 'undefined' && require.main === module) {
  const assert = require('assert'), B = Blackjack, C = s => s.split(' ').map(x => ({ r: x.slice(0, -1), s: x.slice(-1) }));
  assert.deepStrictEqual(B.value(C('As 6h')), { total: 17, soft: true }, '軟 17');
  assert.deepStrictEqual(B.value(C('As 6h Kd')), { total: 17, soft: false }, 'A 退回 1');
  assert.strictEqual(B.value(C('As Ad 9c')).total, 21, '兩張 A');
  assert.ok(B.isBJ({ cards: C('As Kh') }) && !B.isBJ({ cards: C('As Kh'), split: true }), '分牌後不算 BJ');
  const H = (s, extra = {}) => ({ cards: C(s), bet: 100, ...extra });
  assert.strictEqual(B.outcome(H('As Kh'), C('9s 9h')), 1.5, 'BJ 賠 1.5');
  assert.strictEqual(B.outcome(H('As Kh'), C('Ad Qh')), 0, '雙 BJ 和');
  assert.strictEqual(B.outcome(H('10s 9h'), C('Ad Qh')), -1, '莊 BJ 通殺');
  assert.strictEqual(B.outcome(H('2s 3h 2d 4c 3s'), C('10d 9h')), 2, '過五關贏 19，賠 2 倍');
  assert.strictEqual(B.outcome(H('10s 6h 9d'), C('10d 6c 9h')), -1, '閒家先爆就輸');
  assert.strictEqual(B.outcome(H('10s 8h'), C('10d 6c 9h')), 1, '莊爆閒贏');
  assert.strictEqual(B.outcome(H('10s 8h'), C('10d 8c')), 0, '同點和');
  assert.ok(B.canSplit(H('8s 8h'), 100) && B.canSplit(H('Ks Qh'), 100) && !B.canSplit(H('8s 8h'), 50), '分牌條件');
  // 整場電腦對打：籌碼守恆、局數正確、狀態不卡
  for (let run = 0; run < 30; run++) {
    const q = []; B._after = (ms, fn) => q.push(fn); B.render = null;
    B.newMatch('P0'); B.st.players[0].isAI = true;
    let guard = 0; while (q.length && guard++ < 20000) q.shift()();
    const s = B.st;
    assert.strictEqual(s.phase, 'over', '整場會結束');
    assert.strictEqual(s.players.reduce((a, p) => a + p.chips, 0), B.START * 4, '籌碼守恆');
    assert.ok(s.roundNo <= B.ROUNDS, '局數上限');
  }
  // 指定牌序：保險 + 莊家 Blackjack（牌靴從尾端抽）
  const rig = (cards) => { B.st.shoe = [...Array(200).fill(null).map(() => ({ r: '2', s: 'c' })), ...C(cards).reverse()]; };
  { const q = []; B._after = (ms, fn) => q.push(fn); B.newMatch('P0'); q.length = 0; const s = B.st; // 莊家 = 0，閒家順序 1,2,3
    s.players.forEach(p => { p.isAI = false; });
    rig('10s 10h 10d As 9s 9h 9d Kc'); // 1,2,3 第一張、莊明 A、1,2,3 第二張、莊暗 K
    B.setBet(1, 100); B.setBet(2, 100); B.setBet(3, 100); q.shift()();
    assert.strictEqual(s.phase, 'insure', '明牌 A 進保險');
    B.insure(1, true); B.insure(2, false); B.insure(3, false);
    assert.strictEqual(s.phase, 'settle', '莊 BJ 直接結算');
    assert.deepStrictEqual(s.lastNet, [200, 0, -100, -100], '保險打平、其他輸');
  }
  // 分牌：8,8 分成兩手、各補一張
  { const q = []; B._after = (ms, fn) => q.push(fn); B.newMatch('P0'); q.length = 0; const s = B.st;
    s.players.forEach(p => { p.isAI = false; });
    rig('8s 10h 10d 9s 8h 7h 7d 7c 3s 4s'); // 莊 9+7=16
    B.setBet(1, 100); B.setBet(2, 100); B.setBet(3, 100); q.shift()();
    assert.strictEqual([s.phase, s.turn].join(), 'play,1', '輪到 1');
    assert.ok(B.act(1, 'split')); assert.strictEqual(s.players[1].hands.length, 2, '分成兩手');
    assert.deepStrictEqual(s.players[1].hands.map(h => h.cards.length), [2, 2], '各補一張');
  }
  console.log('✅ Blackjack 自測通過');
}
if (typeof module !== 'undefined') module.exports = Blackjack;

// ---------- 平台註冊 + 連線（host 權威）+ UI ----------
if (typeof Platform !== 'undefined') {
  const B = Blackjack;
  const esc = t => String(t).replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`);
  const ini = nm => { const ch = [...(nm || '?')]; const last = ch[ch.length - 1]; return /[一-鿿]/.test(last) ? last : ch[0].toUpperCase(); };
  const cardHTML = (c, cls = '', st = '') => c && c.r
    ? `<div class="bj-card ${cls}" role="img" aria-label="${esc(c.r)}" style="background-position:${B.RANKS.indexOf(c.r) / 12 * 100}% ${B.SUITS.indexOf(c.s) / 3 * 100}%;${st}"></div>`
    : `<div class="bj-card back ${cls}" role="img" aria-label="暗牌" style="${st}"></div>`;
  const chipsOf = n => { const o = []; for (const v of [500, 100, 50, 10]) while (n >= v && o.length < 5) { o.push(v); n -= v; } return o; };
  const totHTML = cards => { const v = B.value(cards), bust = v.total > 21, bj = cards.length === 2 && v.total === 21;
    return `<span class="bj-tot ${bust ? 'bust' : bj ? 'bj' : ''}">${bj ? 'BJ' : bust ? '爆' : (v.soft ? `${v.total - 10}/` : '') + v.total}</span>`; };

  // ---------- 音效（CC0，來源見 games/blackjack/audio/CREDITS.txt）----------
  B.sfx = Platform.fx.sampler('games/blackjack/audio/', {
    shuffle: 'card-shuffle.wav', 'slide-1': 'card-slide-1.wav', 'slide-2': 'card-slide-2.wav', 'slide-3': 'card-slide-3.wav',
    'place-1': 'card-place-1.wav', 'place-2': 'card-place-2.wav', 'place-3': 'card-place-3.wav', shove: 'card-shove-1.wav',
    'chip-1': 'chip-lay-1.wav', 'chip-2': 'chip-lay-2.wav', 'chip-3': 'chip-lay-3.wav', 'stack-1': 'chips-stack-1.wav', 'stack-2': 'chips-stack-2.wav',
    'collide-1': 'chips-collide-1.wav', 'collide-2': 'chips-collide-2.wav', toast: 'toast-1.mp3', glass: 'glass-1.wav',
  });

  // ---------- 連線：不送牌靴；莊家暗牌翻開前遮蔽 ----------
  B._redact = function () {
    const s = this.st;
    return JSON.parse(JSON.stringify({
      players: s.players.map(p => ({ id: p.id, name: p.name, isAI: p.isAI, chips: p.chips, bet: p.bet, hands: p.hands, insured: p.insured })),
      roundNo: s.roundNo, dealer: s.dealer, dealerCards: s.holeShown ? s.dealerCards : s.dealerCards.map((c, j) => j === 1 ? null : c),
      holeShown: s.holeShown, phase: s.phase, turn: s.turn, hand: s.hand, log: s.log, lastNet: s.lastNet,
    }));
  };
  B._push = function () {
    const O = this.O; if (!O || !O.isHost || !O.started) return;
    const st = this._redact();
    for (const seat in O.peerOf) Platform.net.sendTo(O.peerOf[seat], 'state', { st, seat: +seat });
  };
  B._hostStart = function () {
    this._clearTimers(); this._prev = null; this.O.started = true;
    for (const seat in this.O.peerOf) Platform.net.sendTo(this.O.peerOf[seat], 'start', { seat: +seat });
    this._overShown = false; this.newMatch('你', this.O.names);
  };
  // 離線玩家改由電腦接手：補上他卡住的決定
  B._aiTakeover = function (i) {
    const s = this.st, p = s.players[i]; p.isAI = true; this.log(`${p.name} 離線，改由電腦接手`);
    if (s.phase === 'bet' && this.bettors().includes(i) && !p.bet) this._after(800, () => this.setBet(i, this.aiBet(i)));
    if (s.phase === 'insure' && p.bet && p.insured === null) this._after(800, () => this.insure(i, false));
    if (s.phase === 'play' && s.turn === i) this.tick();
    this.render();
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
      if (!this.O) return; // 離開遊戲時 net.reset 也會觸發 _close
      const seat = this.O.seatOf[from]; if (seat == null) return;
      delete this.O.peerOf[seat]; delete this.O.seatOf[from]; this.O.names[seat] = null;
      if (this.O.started && this.st && this.st.players[seat]) this._aiTakeover(seat); else this._renderRoom();
      Platform.net.broadcast('lobby', { names: this.O.names });
    });
    Platform.net.on('act', (d, from) => {
      const seat = this.O.seatOf[from]; if (!d || seat == null || !this.st) return;
      if (d.kind === 'bet') this.setBet(seat, d.amt);            // setBet 內驗證整數、範圍、階段
      else if (d.kind === 'insure') this.insure(seat, d.yes === true);
      else if (['hit', 'stand', 'double', 'split'].includes(d.kind)) this.act(seat, d.kind);
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
  B._renderRoom = function () { if (!this._root || !this.O || this.O.started) return; Platform.net.renderRoom(this._root, this.O, '♠️ 21 點', () => this._hostStart()); };
  B.restart = function () { this._clearTimers(); this._overShown = false; this._prev = null; if (this.O && this.O.isHost) { this._hostStart(); return; } this.newMatch('你'); };

  // ---------- 骨架 ----------
  B._skin = function () { const r = this._root.style, abs = u => new URL(u, document.baseURI).href;
    r.setProperty('--bj-sheet', `url('${abs(Platform.cards.SHEET)}')`); r.setProperty('--bj-back', `url('${abs(Platform.cards.BACK)}')`); };
  B._build = function () {
    const root = this._root;
    root.innerHTML = `<div class="bj-app">
      <header class="bj-top">
        <div class="bj-brand">21 點</div>
        <div class="bj-info"></div>
        <button class="bj-ibtn bj-snd" aria-label="音效開關"></button>
        <button class="bj-ibtn bj-style" aria-label="牌面風格">🎴</button>
        <button class="bj-ibtn bj-logbtn" aria-label="牌局紀錄">☰</button>
      </header>
      <main class="bj-stage"><div class="bj-shoe" aria-hidden="true"></div><div class="bj-dealer"></div><div class="bj-seats"></div></main>
      <section class="bj-dock" aria-label="你的操作"></section>
      <aside class="bj-log" aria-label="牌局紀錄"><h2>牌局紀錄 <button class="bj-ibtn bj-logx" aria-label="關閉">✕</button></h2><ul></ul></aside>
    </div>`;
    const q = s => root.querySelector(s);
    const U = this._ui = { app: q('.bj-app'), info: q('.bj-info'), dealer: q('.bj-dealer'), seats: q('.bj-seats'), dock: q('.bj-dock'), snd: q('.bj-snd'), log: q('.bj-log'), logList: q('.bj-log ul') };
    this._prev = null; this._seen = {}; this._amt = 0; this._dockKey = '';
    const sndIcon = () => { U.snd.textContent = Platform.audio.enabled ? '🔊' : '🔇'; U.snd.setAttribute('aria-pressed', String(Platform.audio.enabled)); };
    sndIcon(); U.snd.onclick = () => { Platform.audio.setEnabled(!Platform.audio.enabled); sndIcon(); };
    const logOpen = on => { U.log.classList.toggle('open', on); U.log.inert = !on; }; logOpen(false);
    q('.bj-logbtn').onclick = () => logOpen(true); q('.bj-logx').onclick = () => logOpen(false);
    q('.bj-style').onclick = () => Platform.ui.modal({ title: '選擇牌面風格', html: '即時切換（會記住）',
      buttons: Object.keys(Platform.cards.STYLE_NAMES).map(k => ({ label: Platform.cards.STYLE_NAMES[k] + (Platform.cards.style === k ? ' ✓' : ''), primary: Platform.cards.style === k,
        onClick: c => { c(); Platform.cards.setStyle(k); this._skin(); } })) });
    this._skin();
  };

  // 一疊牌：新出現的牌飛入（delay 由呼叫端決定）；暗牌翻開時翻面
  B._cards = function (key, cards, delayOf) {
    const n = this._seen[key] || 0, wasHidden = this._seen[key + 'h']; this._seen[key] = cards.length; this._seen[key + 'h'] = cards.map(c => !c);
    return cards.map((c, j) => {
      if (j >= n) return cardHTML(c, 'in', `--d:${delayOf(j)}ms`);
      return cardHTML(c, wasHidden && wasHidden[j] && c ? 'flip' : '');
    }).join('');
  };

  // ---------- 主渲染：依前後狀態差異觸發動畫 ----------
  B.render = function () {
    const root = this._root; if (!root) return;
    const O = this.O;
    if (O && !O.started) { this._renderRoom(); return; }
    const s = this.st; if (!s) return;
    if (!root.querySelector('.bj-app')) this._build();
    const U = this._ui, me = this._me = O ? O.mySeat : 0, pl = s.players, sfx = this.sfx, P = this._prev;
    const newRound = !P || P.round !== s.roundNo, D = s.dealer;
    const order = [1, 2, 3].map(k => (D + k) % 4), dealing = s.phase === 'deal' && (!P || P.phase !== 'deal');
    if (newRound) { this._seen = {}; this._amt = 0; sfx.play('shuffle', { gain: .45 }); }
    // 發牌順序：閒家依序一張、莊家一張，兩輪
    const live = order.filter(i => pl[i].bet > 0), nDeal = live.length + 1;
    const dealDelay = (pos, r) => 300 + (r * nDeal + pos) * 260;
    let hitN = 0; const hitDelay = () => (hitN++) * 260;
    if (dealing) for (let k = 0; k < nDeal * 2; k++) sfx.play('slide', { gain: .4, when: (300 + k * 260) / 1000 });
    U.info.innerHTML = `第 <b>${s.roundNo}</b> / ${this.ROUNDS} 局 · 莊家：${esc(pl[D].name)}`;
    // 莊家
    const dHide = !s.holeShown;
    const dcards = this._cards('D', dHide ? s.dealerCards.map((c, j) => j === 1 ? null : c) : s.dealerCards, j => dealing ? dealDelay(nDeal - 1, j) : hitDelay());
    U.dealer.classList.toggle('turn', s.phase === 'dealer');
    U.dealer.innerHTML = `<div class="bj-who"><div class="bj-ava">${esc(ini(pl[D].name))}</div><div><div class="bj-nm">${esc(pl[D].name)}<span class="bj-badge">莊</span></div><div class="bj-chips">$${pl[D].chips}${this._netHTML(D)}</div></div></div>
      <div class="bj-cards">${dcards}</div>${s.dealerCards.length && !dHide ? totHTML(s.dealerCards) : ''}<div class="bj-rule">莊家到 17 點停 · BLACKJACK 賠 3:2 · 過五關賠 2 倍</div>`;
    if (P && P.hole === false && s.holeShown && s.dealerCards.length) sfx.play('place', { gain: .7 });
    // 閒家：自己放大在中間，其他人在莊家兩側
    const sides = ['l', 'r'];
    U.seats.innerHTML = order.map(i => {
      const p = pl[i], pos = live.indexOf(i), side = i === me || (D === me && i === order[1]) ? '' : sides.shift();
      const hands = p.hands.map((h, k) => {
        const r = s.phase === 'settle' && h.result !== undefined ? h.result : null;
        const cs = this._cards(i + '-' + k, h.cards, j => dealing && j < 2 ? dealDelay(pos, j) : hitDelay());
        return `<div class="bj-hand ${s.phase === 'play' && s.turn === i && s.hand === k ? 'act' : ''}"><div class="bj-cards">${cs}</div>${totHTML(h.cards)}
          ${r === null ? '' : `<span class="bj-res ${r > 0 ? 'w' : r < 0 ? 'l' : 'p'}">${r === 2 ? '過五關！' : r > 1 ? 'Blackjack!' : r > 0 ? '贏' : r < 0 ? '輸' : '和'}</span>`}</div>`;
      }).join('');
      const betN = p.hands.length ? p.hands.reduce((a, h) => a + h.bet, 0) : p.bet, newBet = P && !newRound && betN > (P.bets[i] || 0);
      const chips = betN ? chipsOf(betN).map((v, j) => `<i class="bj-chip c${v} ${newBet ? 'in' : ''}" style="--d:${j * 50}ms"></i>`).join('') + ` ${betN}`
        : s.phase === 'bet' && this.bettors().includes(i) ? '<span class="bj-wait">下注中…</span>' : '';
      return `<div class="bj-seat ${i === me ? 'me' : ''} ${s.phase === 'play' && s.turn === i ? 'turn' : ''} ${s.phase !== 'bet' && !p.bet ? 'out' : ''}" ${side ? `data-side="${side}"` : ''}>
        <div class="bj-hands ${p.hands.length > 1 ? 'multi' : ''}">${hands}</div><div class="bj-bet">${chips}${p.insured ? '<span class="bj-ins">保險</span>' : ''}</div>
        <div class="bj-who"><div class="bj-ava">${esc(ini(p.name))}</div><div><div class="bj-nm">${esc(p.name)}</div><div class="bj-chips">$${p.chips}${this._netHTML(i)}</div></div></div></div>`;
    }).join('');
    // 音效：下注、要牌、結算
    if (P && !newRound) {
      pl.forEach((p, i) => { const b = p.hands.length ? p.hands.reduce((a, h) => a + h.bet, 0) : p.bet; if (b > (P.bets[i] || 0)) sfx.play('chip', { gain: .6 }); });
      if (!dealing && hitN) sfx.play('slide', { gain: .45 });
      if (s.phase === 'settle' && P.phase !== 'settle') {
        const n = s.lastNet ? s.lastNet[me] : 0;
        sfx.play(n > 0 ? 'stack' : 'collide', { gain: .7, when: .3 }); if (n > 0 && me !== D) sfx.play('toast', { gain: .35, when: .7 });
      }
    }
    this._paintDock();
    if (s.phase === 'play' && s.turn === me && (!P || P.turn !== s.turn || P.hand !== s.hand || P.phase !== 'play')) Platform.audio._tone(880, .25, 'sine', .1, dealing ? 2.4 : 0);
    U.logList.replaceChildren(...s.log.map(l => { const li = document.createElement('li'); li.textContent = l; return li; }));
    if (s.phase === 'over' && !this._overShown) {
      this._overShown = true;
      const iWin = pl[me].chips === Math.max(...pl.map(p => p.chips)), isGuest = O && !O.isHost; // 同分都算贏
      iWin ? Platform.audio.win() : Platform.audio.lose(); if (iWin) sfx.play('toast', { gain: .6 });
      this._overModal = Platform.ui.modal({ title: iWin ? '🏆 你的籌碼最多！' : '遊戲結束',
        html: pl.slice().sort((a, b) => b.chips - a.chips).map(p => `${esc(p.name)}：$${p.chips}`).join('<br>'),
        buttons: isGuest ? [{ label: '回大廳', primary: true, onClick: c => { c(); Platform.leave(); } }]
          : [{ label: '再來一場', primary: true, onClick: c => { c(); this.restart(); } }, { label: '回大廳', onClick: c => { c(); Platform.leave(); } }] });
    }
    this._prev = { round: s.roundNo, phase: s.phase, turn: s.turn, hand: s.hand, hole: s.holeShown, bets: pl.map(p => p.hands.length ? p.hands.reduce((a, h) => a + h.bet, 0) : p.bet) };
    this._push();
  };
  B._netHTML = function (i) { const n = this.st.phase === 'settle' && this.st.lastNet ? this.st.lastNet[i] : 0; return n ? ` <span class="${n > 0 ? 'up' : 'dn'}">${n > 0 ? '+' : ''}${n}</span>` : ''; };

  // ---------- 操作區（內容依階段切換；同一狀態不重建，避免按鈕閃爍）----------
  B._paintDock = function () {
    const U = this._ui, s = this.st, me = this._me, p = s.players[me], D = s.dealer;
    let key, html;
    const ck = s.phase === 'bet' && this.bettors().includes(me) && !p.bet ? 'bet' : s.phase === 'insure' && p.bet && p.insured === null ? 'ins'
      : s.phase === 'play' && s.turn === me ? `play${s.hand}/${p.hands[s.hand].cards.length}` : '';
    Platform.ui.turnClock(ck && `bj:${s.roundNo}:${ck}`, this.TURN_SEC);
    if (s.phase === 'bet' && this.bettors().includes(me) && !p.bet) {
      const max = Math.min(this.MAX_BET, p.chips), a = this._amt;
      key = `bet${a}${max}`;
      html = `<div class="bj-tip">下注 ${this.MIN_BET} ~ ${max}</div>${[10, 50, 100, 500].map(v => `<button class="bj-cbtn c${v}" data-add="${v}" ${a + v > max ? 'disabled' : ''} aria-label="加 ${v}">${v}</button>`).join('')}
        <div class="bj-amt" aria-live="polite">$${a}</div><button class="bj-btn" data-do="clr" ${a ? '' : 'disabled'}>清除</button><button class="bj-btn pri" data-do="bet" ${a >= this.MIN_BET ? '' : 'disabled'}>下注</button>`;
    } else if (s.phase === 'insure' && p.bet && p.insured === null) {
      key = 'ins'; html = `<div class="bj-tip">莊家明牌是 A，要花 $${Math.ceil(p.bet / 2)} 買保險嗎？（莊家 Blackjack 賠 2 倍）</div><button class="bj-btn" data-do="noins">不買</button><button class="bj-btn pri" data-do="ins">買保險</button>`;
    } else if (s.phase === 'play' && s.turn === me) {
      const h = p.hands[s.hand], free = p.chips - this._committed(p);
      key = `play${s.hand}/${p.hands.length}/${h.cards.length}/${free}`;
      html = `<div class="bj-tip">${p.hands.length > 1 ? `第 ${s.hand + 1} 手 · ` : ''}你的點數 ${this.value(h.cards).total}${h.cards.length === 4 ? ' · 再一張沒爆就過五關！' : ''}</div>
        <button class="bj-btn" data-do="hit">要牌</button><button class="bj-btn pri" data-do="stand">停牌</button>
        <button class="bj-btn" data-do="double" ${this.canDouble(h, free) ? '' : 'disabled'}>加倍</button><button class="bj-btn" data-do="split" ${this.canSplit(h, free) ? '' : 'disabled'}>分牌</button>`;
    } else {
      const t = D === me && s.phase !== 'settle' && s.phase !== 'over' ? '這局你當莊，照規則自動補牌' : s.phase === 'bet' ? '等其他人下注…' : s.phase === 'deal' ? '發牌中…' : s.phase === 'insure' ? '等其他人決定保險…'
        : s.phase === 'play' ? `輪到 ${s.players[s.turn].name}` : s.phase === 'dealer' ? '莊家補牌中…' : s.phase === 'settle' ? '結算' : '';
      key = 'tip' + t; html = `<div class="bj-tip"></div>`;
      if (this._dockKey !== key) { U.dock.innerHTML = html; U.dock.querySelector('.bj-tip').textContent = t; this._dockKey = key; }
      return;
    }
    if (this._dockKey === key) return;
    // 重建前記住焦點按鈕，重建後還原（鍵盤操作不必每次重新 Tab）
    const f = document.activeElement, fk = f && U.dock.contains(f) ? (f.dataset.do ? `[data-do="${f.dataset.do}"]` : f.dataset.add ? `[data-add="${f.dataset.add}"]` : '') : '';
    U.dock.innerHTML = html; this._dockKey = key;
    if (fk) { const nf = U.dock.querySelector(fk); (nf && !nf.disabled ? nf : U.dock.querySelector('button:not(:disabled)'))?.focus(); }
  };
  // 送出動作：房主直接套用；賓客送給房主驗證
  B._send = function (kind, extra = {}) {
    const isHost = !this.O || this.O.isHost, me = this._me;
    if (isHost) { if (kind === 'bet') this.setBet(me, extra.amt); else if (kind === 'insure') this.insure(me, extra.yes); else this.act(me, kind); }
    else Platform.net.sendHost('act', { kind, ...extra });
  };

  Platform.register({
    id: 'blackjack', name: '21 點', icon: '♠️',
    desc: '輪流當莊：要牌、加倍、分牌、保險，過五關賠 2 倍', players: { min: 2, max: 4 },
    online: true,
    target: B, settings: [ // 最低注選項都 ≤ 100 ≤ 最高注選項，兩者不會交叉
      { k: 'START', label: '起始籌碼', def: 1000, options: [500, 1000, 5000, 10000], fmt: Platform.money }, { k: 'ROUNDS', label: '局數', def: 8, options: [4, 8, 12, 20], fmt: v => `${v} 局` },
      { k: 'MIN_BET', label: '最低注', def: 10, options: [10, 50, 100], fmt: Platform.money }, { k: 'MAX_BET', label: '最高注', def: 500, options: [100, 500, 1000, 5000], fmt: Platform.money },
      Platform.COMMON_CFG.turn, Platform.COMMON_CFG.ai],
    mount(stage, opts) {
      const root = document.createElement('div'); root.id = 'bj-root'; root.className = 'bj-root'; stage.appendChild(root);
      B._root = root; B._prev = null; B._overShown = false;
      B.sfx.unlock(); B.sfx.load();
      root.addEventListener('pointerdown', () => B.sfx.unlock(), { passive: true });
      root.addEventListener('click', e => {
        const U = B._ui; if (!U || !B.st) return;
        const b = e.target.closest('.bj-dock button'); if (!b || b.disabled) return;
        if (b.dataset.add) { B._amt += +b.dataset.add; B.sfx.play('chip', { gain: .5 }); B._paintDock(); return; }
        const d = b.dataset.do;
        if (d === 'clr') { B._amt = 0; B._paintDock(); }
        else if (d === 'bet') B._send('bet', { amt: B._amt });
        else if (d === 'ins' || d === 'noins') B._send('insure', { yes: d === 'ins' });
        else B._send(d);
      });
      if (opts && opts.online) B._startOnline(opts); else { B.O = null; B.newMatch('你'); }
    },
    unmount() {
      B._clearTimers();
      if (B._overModal) { B._overModal.close(); B._overModal = null; }
      B._root = null; B._ui = null; B.st = null; B.O = null; B._overShown = false;
    },
  });
}
