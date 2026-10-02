/* 德州撲克 Texas Hold'em — 單機 + AI（4 人桌，籌碼 1000，盲注 10/20）
   流程：preflop→flop→turn→river→showdown。動作 fold/check/call/raise/all-in。
   評牌：純函式 7 取 5。底池含 all-in 邊池。 */
const Texas = {
  RANKS: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
  rv(r) { return this.RANKS.indexOf(r) + 2; }, // 2..14

  // ---------- 評牌（純函式，可在 node 測試） ----------
  _straightHigh(vals) {
    const s = new Set(vals);
    if (s.has(14)) s.add(1); // A 可當 1（順子 A2345）
    for (let hi = 14; hi >= 5; hi--) {
      let ok = true;
      for (let k = 0; k < 5; k++) if (!s.has(hi - k)) { ok = false; break; }
      if (ok) return hi;
    }
    return 0;
  },
  // cards: [{r,s}] 5~7 張 → {cat:0-8, tb:[...]}（cat 越大越好；同 cat 比 tb）
  eval7(cards) {
    const vals = cards.map(c => this.rv(c.r));
    const cnt = {}; vals.forEach(v => cnt[v] = (cnt[v] || 0) + 1);
    const byCount = c => Object.keys(cnt).filter(v => cnt[v] === c).map(Number).sort((a, b) => b - a);
    const quads = byCount(4), trips = byCount(3), pairs = byCount(2);
    const allDesc = [...vals].sort((a, b) => b - a);
    const top = (excl, n) => allDesc.filter(v => !excl.includes(v)).slice(0, n);

    // 同花 / 同花順
    const suits = {}; cards.forEach(c => (suits[c.s] = suits[c.s] || []).push(this.rv(c.r)));
    let flushVals = null;
    for (const s in suits) if (suits[s].length >= 5) flushVals = suits[s].sort((a, b) => b - a);
    if (flushVals) {
      const sf = this._straightHigh(flushVals);
      if (sf) return { cat: 8, tb: [sf] };                       // 同花順
    }
    if (quads.length) return { cat: 7, tb: [quads[0], ...top([quads[0]], 1)] }; // 四條
    if (trips.length && (pairs.length || trips.length >= 2))
      return { cat: 6, tb: [trips[0], Math.max(pairs[0] || 0, trips[1] || 0)] }; // 葫蘆
    if (flushVals) return { cat: 5, tb: flushVals.slice(0, 5) };  // 同花
    const st = this._straightHigh(vals);
    if (st) return { cat: 4, tb: [st] };                          // 順子
    if (trips.length) return { cat: 3, tb: [trips[0], ...top([trips[0]], 2)] }; // 三條
    if (pairs.length >= 2) return { cat: 2, tb: [pairs[0], pairs[1], ...top([pairs[0], pairs[1]], 1)] }; // 兩對
    if (pairs.length === 1) return { cat: 1, tb: [pairs[0], ...top([pairs[0]], 3)] }; // 一對
    return { cat: 0, tb: allDesc.slice(0, 5) };                   // 高牌
  },
  cmp(a, b) {
    if (a.cat !== b.cat) return a.cat - b.cat;
    for (let i = 0; i < Math.max(a.tb.length, b.tb.length); i++) {
      const d = (a.tb[i] || 0) - (b.tb[i] || 0);
      if (d) return d;
    }
    return 0;
  },
  CAT_NAME: ['高牌', '一對', '兩對', '三條', '順子', '同花', '葫蘆', '四條', '同花順'],

  // ---------- 邊池（純函式） ----------
  // players: [{totalInvested, folded}] → [{amt, elig:[idx...]}]
  buildPots(players) {
    const levels = [...new Set(players.filter(p => p.totalInvested > 0).map(p => p.totalInvested))].sort((a, b) => a - b);
    const pots = []; let prev = 0;
    for (const lv of levels) {
      let amt = 0;
      players.forEach(p => { amt += Math.min(Math.max(p.totalInvested - prev, 0), lv - prev); });
      const elig = players.map((p, i) => i).filter(i => players[i].totalInvested >= lv && !players[i].folded);
      if (amt > 0) pots.push({ amt, elig });
      prev = lv;
    }
    return pots;
  },

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  makeDeck() { const d = []; for (const s of ['s', 'h', 'd', 'c']) for (const r of this.RANKS) d.push({ r, s }); return d; },

  // ---------- 對局狀態 ----------
  st: null, _timers: [], _root: null, SB: 10, BB: 20, START: 1000,

  newMatch(human = '你') {
    const names = [human, '阿傑', '小琪', '老王'];
    const players = names.map((nm, i) => ({
      id: i, name: nm, isAI: i !== 0, chips: this.START,
      hole: [], bet: 0, totalInvested: 0, folded: false, allin: false, acted: false,
      style: ['balanced', 'attack', 'defense'][i % 3], last: '',
    }));
    this.st = { players, board: [], deck: [], dealer: 0, street: 'idle', currentBet: 0, toAct: -1, _seat: -1, log: [], pots: [], handNo: 0 };
    this.newHand();
  },

  newHand() {
    const s = this.st;
    s.handNo++;
    // 淘汰沒籌碼者（保留座位但 folded out）
    const alive = s.players.filter(p => p.chips > 0);
    if (alive.length <= 1) { this.endMatch(); return; }
    s.players.forEach(p => { p.hole = []; p.bet = 0; p.totalInvested = 0; p.folded = p.chips <= 0; p.allin = false; p.acted = false; p.last = p.chips <= 0 ? '出局' : ''; });
    s.board = []; s.currentBet = 0; s.pots = []; s._winners = [];
    s.deck = this.shuffle(this.makeDeck());
    // 莊家輪轉到下一個有籌碼者
    s.dealer = this._nextSeat(s.dealer, p => p.chips > 0);
    const inHand = () => s.players.filter(p => p.chips > 0);
    // 盲注
    const sbIdx = inHand().length === 2 ? s.dealer : this._nextSeat(s.dealer, p => p.chips > 0);
    const bbIdx = this._nextSeat(sbIdx, p => p.chips > 0);
    this._postBlind(sbIdx, this.SB); this._postBlind(bbIdx, this.BB);
    s.currentBet = this.BB; s.lastRaise = this.BB;
    // 發底牌
    for (let k = 0; k < 2; k++) s.players.forEach(p => { if (p.chips > 0 || p.bet > 0) p.hole.push(s.deck.pop()); });
    s.street = 'preflop';
    s._seat = bbIdx; // 第一個行動者 = BB 之後
    s.log = [`— 第 ${s.handNo} 手 — 莊家：${s.players[s.dealer].name}`];
    if (this.render) this.render();
    this.step();
  },
  _postBlind(i, amt) { const p = this.st.players[i]; const a = Math.min(amt, p.chips); p.chips -= a; p.bet = a; p.totalInvested = a; if (p.chips === 0) p.allin = true; },
  _nextSeat(from, pred) { const p = this.st.players, n = p.length; for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (pred(p[i])) return i; } return from; },

  pot() { return this.st.players.reduce((s, p) => s + p.totalInvested, 0); },

  // ---------- 行動推進 ----------
  _nextActor() {
    const s = this.st, p = s.players, n = p.length;
    for (let k = 1; k <= n; k++) {
      const i = (s._seat + k) % n;
      if (!p[i].folded && !p[i].allin && (!p[i].acted || p[i].bet < s.currentBet)) return i;
    }
    return null;
  },
  step() {
    const s = this.st;
    if (!s || s.street === 'idle') return;
    const live = s.players.filter(p => !p.folded);
    if (live.length === 1) { this._awardUncontested(live[0]); return; }
    const nxt = this._nextActor();
    if (nxt === null) { this._nextStreet(); return; }
    s._seat = nxt; s.toAct = nxt;
    if (this.render) this.render();
    if (s.players[nxt].isAI) this._after(900, () => this.aiAct(nxt));
  },

  // 合法動作給人類 UI
  legal(i) {
    const s = this.st, p = s.players[i];
    const toCall = s.currentBet - p.bet;
    // 已行動者只有遇到「足額加注」（acted 被重設）才可再加注；不足額 all-in 只能跟或蓋
    const acts = { fold: true, call: toCall > 0, check: toCall === 0, raise: p.chips > toCall && !p.acted };
    acts.toCall = Math.min(toCall, p.chips);
    acts.minRaise = Math.min(p.chips + p.bet, s.currentBet + (s.lastRaise || this.BB)); // 加注「到」的最小總額 = 現注 + 上次加注增量
    acts.maxRaise = p.chips + p.bet;                                   // all-in 到
    return acts;
  },

  apply(i, type, raiseTo) {
    const s = this.st, p = s.players[i];
    if (s.toAct !== i || !['preflop', 'flop', 'turn', 'river'].includes(s.street)) return; // 攤牌/換街空窗不得行動
    if (type === 'fold') { p.folded = true; p.last = '蓋牌'; }
    else if (type === 'check') { p.last = '過牌'; }
    else if (type === 'call') {
      const amt = Math.min(s.currentBet - p.bet, p.chips);
      p.chips -= amt; p.bet += amt; p.totalInvested += amt; if (p.chips === 0) p.allin = true;
      p.last = amt > 0 ? `跟 ${amt}` : '過牌';
    } else if (type === 'raise' || type === 'allin') {
      let target = type === 'allin' ? p.bet + p.chips : Math.max(raiseTo, s.currentBet + (s.lastRaise || this.BB));
      target = Math.min(target, p.bet + p.chips);
      const amt = target - p.bet, inc = target - s.currentBet;
      p.chips -= amt; p.bet = target; p.totalInvested += amt;
      if (inc > 0) s.currentBet = target;
      if (p.chips === 0) p.allin = true;
      p.last = (p.allin ? '全下 ' : '加到 ') + target;
      if (inc >= s.lastRaise) { s.lastRaise = inc; s.players.forEach(q => { if (q !== p && !q.folded && !q.allin) q.acted = false; }); } // 足額加注才重開行動權
    }
    p.acted = true;
    if (typeof Platform !== 'undefined' && Platform.audio) (type === 'fold' ? Platform.audio.click() : Platform.audio.chip());
    this.step();
  },

  _nextStreet() {
    const s = this.st;
    s.players.forEach(p => { p.bet = 0; p.acted = false; });
    s.currentBet = 0; s.lastRaise = this.BB; s.toAct = -1;
    s._seat = s.dealer;
    const order = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    s.street = order[order.indexOf(s.street) + 1];
    if (s.street === 'flop') { s.deck.pop(); s.board.push(s.deck.pop(), s.deck.pop(), s.deck.pop()); }
    else if (s.street === 'turn' || s.street === 'river') { s.deck.pop(); s.board.push(s.deck.pop()); }
    if (s.street === 'showdown') { this._showdown(); return; }
    this.log(`【${this._streetName(s.street)}】${s.board.map(c => c.r + ({ s: '♠', h: '♥', d: '♦', c: '♣' }[c.s] || c.s)).join(' ')}`);
    if (this.render) this.render();
    this._after(600, () => this.step());
  },
  _streetName(st) { return { flop: '翻牌', turn: '轉牌', river: '河牌' }[st] || st; },

  _awardUncontested(winner) {
    const amt = this.pot();
    winner.chips += amt;
    this.log(`${winner.name} 贏得底池 ${amt}（其他人蓋牌）`);
    this.st.street = 'idle'; this.st.toAct = -1;
    if (this.render) this.render();
    if (typeof Platform !== 'undefined' && Platform.audio) Platform.audio.chip();
    this._after(1500, () => this.newHand());
  },

  _showdown() {
    const s = this.st;
    const scores = s.players.map(p => p.folded ? null : this.eval7([...p.hole, ...s.board]));
    const pots = this.buildPots(s.players);
    const results = [];
    const winSeats = new Set();
    pots.forEach(pot => {
      let best = null, winners = [];
      pot.elig.forEach(i => {
        if (!scores[i]) return;
        if (!best || this.cmp(scores[i], best) > 0) { best = scores[i]; winners = [i]; }
        else if (this.cmp(scores[i], best) === 0) winners.push(i);
      });
      const n = s.players.length; winners.sort((a, b) => (a - s.dealer - 1 + n) % n - (b - s.dealer - 1 + n) % n); // 零頭給莊家左手第一位
      const share = Math.floor(pot.amt / winners.length);
      winners.forEach((i, k) => { s.players[i].chips += share + (k === 0 ? pot.amt - share * winners.length : 0); winSeats.add(i); });
      results.push({ winners: winners.map(i => s.players[i].name), amt: pot.amt, cat: best ? this.CAT_NAME[best.cat] : '' });
    });
    s._winners = [...winSeats];
    s.street = 'showdown'; s.toAct = -1;
    s._reveal = true;
    results.forEach(r => this.log(`攤牌：${r.winners.join('、')} 以 ${r.cat} 贏得 ${r.amt}`));
    if (this.render) this.render();
    if (typeof Platform !== 'undefined' && Platform.audio) { const win = results.some(r => r.winners.includes(s.players[0].name)); win ? Platform.audio.win() : Platform.audio.chip(); }
    this._after(2600, () => { s._reveal = false; this.newHand(); });
  },

  // ---------- AI ----------
  _holeStrength(p) {
    const [a, b] = p.hole.map(c => this.rv(c.r));
    const hi = Math.max(a, b), lo = Math.min(a, b);
    let v = (hi + lo) / 28;                          // 高牌基礎
    if (a === b) v = 0.5 + hi / 28;                  // 口袋對
    if (p.hole[0].s === p.hole[1].s) v += 0.06;      // 同花
    const gap = hi - lo; if (a !== b && gap <= 2) v += 0.05; // 連張
    return Math.min(0.99, v);
  },
  _strength(i) {
    const s = this.st, p = s.players[i];
    if (s.board.length === 0) return this._holeStrength(p);
    const e = this.eval7([...p.hole, ...s.board]);
    return Math.min(0.99, 0.12 + e.cat / 8 * 0.8 + (e.tb[0] || 0) / 14 * 0.08);
  },
  aiAct(i) {
    const s = this.st;
    if (!s || s.toAct !== i) return;
    const p = s.players[i], L = this.legal(i);
    const str = this._strength(i);
    const aggr = { attack: 0.18, balanced: 0.08, defense: -0.02 }[p.style] + (Math.random() - 0.5) * 0.12;
    const eff = str + aggr;
    const potOdds = L.toCall > 0 ? L.toCall / (this.pot() + L.toCall) : 0;

    if (L.toCall === 0) {
      // 可過牌：強牌下注
      if (eff > 0.62 && L.raise) {
        const size = Math.min(L.maxRaise, p.bet + Math.max(this.BB, Math.floor(this.pot() * (eff > 0.8 ? 0.8 : 0.5))));
        this.apply(i, 'raise', size); return;
      }
      this.apply(i, 'check'); return;
    }
    // 面對下注
    if (eff < potOdds - 0.04 && eff < 0.5) { this.apply(i, 'fold'); return; }
    if (eff > 0.78 && L.raise && Math.random() < 0.6) {
      const size = Math.min(L.maxRaise, s.currentBet + Math.max(this.BB, Math.floor(this.pot() * 0.6)));
      this.apply(i, 'raise', size); return;
    }
    this.apply(i, 'call');
  },

  endMatch() {
    const s = this.st; s.street = 'over';
    const winner = s.players.reduce((a, b) => b.chips > a.chips ? b : a);
    if (this.render) this.render();
    if (typeof Platform === 'undefined') return;
    const meWin = winner.id === 0;
    Platform.audio && (meWin ? Platform.audio.win() : Platform.audio.lose());
    Platform.ui.modal({
      title: meWin ? '🏆 你贏得全場！' : '💸 你出局了',
      html: `籌碼王：<b>${winner.name}</b>（${winner.chips}）`,
      buttons: [
        { label: '再來', primary: true, onClick: c => { c(); this.restart(); } },
        { label: '回大廳', onClick: c => { c(); Platform.exit(); } },
      ],
    });
  },
  restart() {
    this._clearTimers();
    if (this.O && this.O.isHost) { this._hostStart(); return; } // 連線：房主重開
    this.newMatch(this._human || '你');
  },

  log(m) { this.st.log.unshift(m); if (this.st.log.length > 7) this.st.log.pop(); },
  _after(ms, fn) { const t = setTimeout(fn, ms); this._timers.push(t); return t; },
  _clearTimers() { this._timers.forEach(clearTimeout); this._timers = []; },
};

// ---------- node 自測 ----------
if (typeof module !== 'undefined' && require.main === module) {
  const assert = require('assert');
  const T = Texas;
  const C = (str) => str.split(' ').map(x => ({ r: x.slice(0, -1), s: x.slice(-1) }));
  const better = (a, b) => T.cmp(T.eval7(C(a)), T.eval7(C(b))) > 0;
  // 類別正確
  assert.strictEqual(T.eval7(C('As Ks Qs Js 10s')).cat, 8, '同花順');
  assert.strictEqual(T.eval7(C('As Ah Ad Ac Ks')).cat, 7, '四條');
  assert.strictEqual(T.eval7(C('As Ah Ad Ks Kh')).cat, 6, '葫蘆');
  assert.strictEqual(T.eval7(C('As Ks Qs Js 9s')).cat, 5, '同花');
  assert.strictEqual(T.eval7(C('As Kh Qd Jc 10s')).cat, 4, '順子');
  assert.strictEqual(T.eval7(C('5s 4h 3d 2c As')).cat, 4, '輪子 A2345');
  assert.strictEqual(T.eval7(C('As Ah Ad Ks Qh')).cat, 3, '三條');
  assert.strictEqual(T.eval7(C('As Ah Ks Kh Qd')).cat, 2, '兩對');
  assert.strictEqual(T.eval7(C('As Ah Ks Qh Jd')).cat, 1, '一對');
  assert.strictEqual(T.eval7(C('As Ks Qh Jd 9c')).cat, 0, '高牌');
  // 7 取 5
  assert.strictEqual(T.eval7(C('As Ah Ad Ac Ks Kh Qd')).cat, 7, '7張取四條');
  // 比較
  assert.ok(better('As Ah Ad Ac Ks', 'As Ah Ad Ks Kh'), '四條 > 葫蘆');
  assert.ok(better('Ks Kh Kd 2s 3h', 'Qs Qh Qd As Kh'), '三條K > 三條Q');
  assert.ok(better('As Ks Qs Js 10s', 'Ah Ad Ac Ah Kh'.replace('Ah Ad Ac Ah', 'Ah Ad Ac Ks')), '同花順 > 四條');
  // 邊池：A all-in 100，B/C 各投 300
  const pots = T.buildPots([{ totalInvested: 100, folded: false }, { totalInvested: 300, folded: false }, { totalInvested: 300, folded: false }]);
  assert.strictEqual(pots.length, 2, '兩個池');
  assert.strictEqual(pots[0].amt, 300, '主池 100×3');
  assert.strictEqual(pots[0].elig.length, 3, '主池三人有份');
  assert.strictEqual(pots[1].amt, 400, '邊池 200×2');
  assert.deepStrictEqual(pots[1].elig, [1, 2], '邊池只 B C');
  // 規則手算樣例：3 人翻牌圈，全人類（不觸發 AI），每人 1000
  const mk = chips => chips.map((c, i) => ({ id: i, name: 'P' + i, isAI: false, chips: c, hole: [], bet: 0, totalInvested: 0, folded: false, allin: false, acted: false, last: '' }));
  const flop = chips => { T.st = { players: mk(chips), board: [], deck: [], dealer: 0, street: 'flop', currentBet: 0, lastRaise: T.BB, toAct: 0, _seat: 0, log: [], pots: [], handNo: 1 }; };
  // 最小加注：P0 下到 200（增量 200）→ P1 最小加到 400；送 220 會被拉到 400
  flop([1000, 1000, 1000]); T.apply(0, 'raise', 200);
  assert.strictEqual(T.legal(1).minRaise, 400, '最小加注 = 200 + 200');
  T.apply(1, 'raise', 220); assert.strictEqual(T.st.currentBet, 400, '不足最小加注被拉到 400');
  // 不足額 all-in：P0 下 200、P1 跟、P2 全下 250（增量 50 < 200）→ P0 只能跟 50 或蓋，不能再加
  flop([1000, 1000, 250]); T.apply(0, 'raise', 200); T.apply(1, 'call'); T.apply(2, 'allin');
  assert.strictEqual(T.st.toAct, 0, '輪回 P0 補跟');
  assert.strictEqual(T.legal(0).toCall, 50, 'P0 需補 50');
  assert.strictEqual(T.legal(0).raise, false, '不足額 all-in 不重開加注');
  // 攤牌中行動被擋：籌碼不變
  T.st.street = 'showdown'; T.st.toAct = 0; const c0 = T.st.players[0].chips;
  T.apply(0, 'raise', 900); assert.strictEqual(T.st.players[0].chips, c0, '攤牌中不得下注');
  // 零頭：莊家 0，P0/P1 平手各投 50、P2 投 1 後蓋 → 主池 3 + 邊池 98；零頭 1 給莊家左手 P1 → P0 得 50、P1 得 51
  T.st = { players: mk([0, 0, 0]), board: C('As Ks Qs Js 10s'), dealer: 0, street: 'river', log: [] };
  T.st.players.forEach((p, i) => { p.totalInvested = [50, 50, 1][i]; p.hole = C(['2h 3d', '2c 3h', '4c 5d'][i]); });
  T.st.players[2].folded = true; T._showdown();
  assert.deepStrictEqual(T.st.players.map(p => p.chips), [50, 51, 0], '零頭給莊家左手第一位');
  T._clearTimers();
  console.log('✅ Texas 自測通過');
}
if (typeof module !== 'undefined') module.exports = Texas;

// ---------- 平台註冊 + UI ----------
if (typeof Platform !== 'undefined') {
  const SEAT_CLASS = ['seat-b', 'seat-r', 'seat-t', 'seat-l'];

  // 對賓客遮蔽 hole cards（只給自己；攤牌時公開未蓋牌者）
  Texas._redact = function (seat) {
    const s = this.st, reveal = !!s._reveal;
    return JSON.parse(JSON.stringify({
      players: s.players.map((p, i) => ({
        id: p.id, name: p.name, isAI: p.isAI, chips: p.chips, bet: p.bet, totalInvested: p.totalInvested,
        folded: p.folded, allin: p.allin, acted: p.acted, last: p.last,
        hole: (i === seat || (reveal && !p.folded)) ? p.hole : p.hole.map(() => ({ hidden: true })),
      })),
      board: s.board, dealer: s.dealer, currentBet: s.currentBet, lastRaise: s.lastRaise, toAct: s.toAct,
      street: s.street, log: s.log, pots: s.pots, handNo: s.handNo, _reveal: s._reveal || false, _winners: s._winners || [],
    }));
  };
  Texas._push = function () {
    const O = this.O; if (!O || !O.isHost || !O.started) return;
    for (const seat in O.peerOf) Platform.net.sendTo(O.peerOf[seat], 'state', { st: this._redact(+seat), seat: +seat });
  };
  Texas._newMatchOnline = function () {
    const names = this.O.names, styles = ['balanced', 'attack', 'defense'];
    const players = [0, 1, 2, 3].map(i => {
      const occupied = i === 0 || names[i] != null;
      return {
        id: i, name: names[i] || (['', 'AI甲', 'AI乙', 'AI丙'][i]), isAI: !occupied, _remote: occupied && i !== 0,
        chips: this.START, hole: [], bet: 0, totalInvested: 0, folded: false, allin: false, acted: false, style: styles[i % 3], last: '',
      };
    });
    this.st = { players, board: [], deck: [], dealer: 0, street: 'idle', currentBet: 0, toAct: -1, _seat: -1, log: [], pots: [], handNo: 0 };
    this._overShown = false;
    this.newHand();
  };
  Texas._hostStart = function () {
    this.O.started = true;
    for (const seat in this.O.peerOf) Platform.net.sendTo(this.O.peerOf[seat], 'start', { seat: +seat });
    this._newMatchOnline();
  };
  Texas._setupHostNet = function () {
    Platform.net.on('_open', (d, from) => {
      if (this.O.started) { Platform.net.sendTo(from, 'full', {}); return; }
      let seat = -1; for (let i = 1; i < 4; i++) if (!this.O.peerOf[i]) { seat = i; break; }
      if (seat < 0) { Platform.net.sendTo(from, 'full', {}); return; }
      this.O.seatOf[from] = seat; this.O.peerOf[seat] = from; this.O.names[seat] = d.name || ('賓客' + seat);
      Platform.net.sendTo(from, 'welcome', { seat });
      Platform.net.broadcast('lobby', { names: this.O.names });
      this._renderRoom();
    });
    Platform.net.on('_close', (d, from) => {
      const seat = this.O.seatOf[from]; if (seat == null) return;
      delete this.O.peerOf[seat]; delete this.O.seatOf[from]; this.O.names[seat] = null;
      if (this.O.started && this.st && this.st.players[seat]) {
        const p = this.st.players[seat]; p.isAI = true; p._remote = false; this.log(`${p.name} 離線，改由 AI 接手`);
        if (this.st.toAct === seat) this._after(900, () => this.aiAct(seat)); else this.render();
      } else this._renderRoom();
      Platform.net.broadcast('lobby', { names: this.O.names });
    });
    Platform.net.on('act', (d, from) => {
      const seat = this.O.seatOf[from], s = this.st;
      if (seat == null || !s || s.toAct !== seat || s.street === 'idle' || s.street === 'over') return;
      const L = this.legal(seat); let kind = d.kind, amount = d.amount;
      if (kind === 'check') { if (!L.check) return; }
      else if (kind === 'call') { if (!L.call) { if (L.check) kind = 'check'; else return; } }
      else if (kind === 'raise') { if (!L.raise) return; amount = Math.max(L.minRaise, Math.min(L.maxRaise, +amount || L.minRaise)); }
      else if (kind === 'allin') { if (!L.raise) kind = L.call ? 'call' : 'check'; }
      else if (kind !== 'fold') return;
      this.apply(seat, kind, amount);
    });
  };
  Texas._setupGuestNet = function () {
    Platform.net.on('welcome', d => { this.O.mySeat = d.seat; this._renderRoom(); });
    Platform.net.on('lobby', d => { this.O.names = d.names; this._renderRoom(); });
    Platform.net.on('start', d => { if (d && d.seat != null) this.O.mySeat = d.seat; this.O.started = true; if (this._overModal) { this._overModal.close(); this._overModal = null; } });
    Platform.net.on('state', d => {
      this.st = d.st; this.O.mySeat = d.seat; this.O.started = true;
      if (this.st.street !== 'over') this._overShown = false;
      this.render();
      if (this.st.street === 'over') this._maybeOver();
    });
    Platform.net.on('full', () => { Platform.toast('房間已滿或已開始'); Platform.exit(); });
    Platform.net.on('_close', () => { if (!this._root) return; Platform.toast('房主已離線'); Platform.exit(); }); // 賓客只連房主
  };
  Texas._startOnline = function (opts) {
    const name = Platform.store.get('arcade_name', '') || (opts.join ? '賓客' : '房主');
    this.O = { isHost: !opts.join, mySeat: opts.join ? -1 : 0, seatOf: {}, peerOf: {}, names: [null, null, null, null], started: false };
    this._renderRoom();
    Platform.net.init(name).then(() => {
      if (this.O.isHost) { Platform.net.createRoom(); this.O.names[0] = name; this._setupHostNet(); this._renderRoom(); }
      else { this._setupGuestNet(); Platform.net.joinRoom(opts.join.host); this._renderRoom(); }
    }).catch(e => { Platform.toast('連線失敗：' + (e.message || e)); Platform.exit(); });
  };
  Texas._renderRoom = function () {
    if (!this._root || !this.O || this.O.started) return;
    Platform.net.renderRoom(this._root, this.O, '🃏 德州撲克', () => this._hostStart());
  };
  Texas._maybeOver = function () {
    if (this._overShown) return; this._overShown = true;
    const winner = this.st.players.reduce((a, b) => b.chips > a.chips ? b : a);
    const meWin = winner.id === this.O.mySeat;
    Platform.audio && (meWin ? Platform.audio.win() : Platform.audio.lose());
    this._overModal = Platform.ui.modal({
      title: meWin ? '🏆 你贏得全場！' : '💸 遊戲結束',
      html: `籌碼王：<b>${winner.name}</b>（${winner.chips}）`,
      buttons: [{ label: '回大廳', primary: true, onClick: c => { c(); Platform.exit(); } }],
    });
  };

  Texas.render = function () {
    const root = this._root; if (!root) return;
    const O = this.O;
    if (O && !O.started) { this._renderRoom(); return; }
    const s = this.st; if (!s) return;
    const showdown = s._reveal;
    const meSeat = O ? O.mySeat : 0;
    const N = s.players.length;
    const isHost = !O || O.isHost;
    const winners = s._winners || [];
    let prevBoard = this._prevBoard || 0; if (s.board.length < prevBoard) prevBoard = 0;
    const newHand = this._prevHand !== s.handNo; this._prevHand = s.handNo; // 新一手→發牌動畫
    const chip = (amt, cls) => `<span class="tx-chip ${cls || ''}"><span class="tx-chip-d"></span><b>${amt}</b></span>`;
    const cardName = c => ({ s: '黑桃', h: '紅心', d: '方塊', c: '梅花' }[c.s] || '') + c.r;
    const face = (c, extra = '') => `<div class="tx-cardimg ${extra}" role="img" aria-label="${cardName(c)}" style="${Platform.cards.spriteCSS(c, 46)}"></div>`;
    const backc = `<div class="tx-cardimg" role="img" aria-label="蓋著的牌" style="${Platform.cards.backCSS(46)}"></div>`;

    const seatHtml = s.players.map((p, i) => {
      const reveal = i === meSeat || (showdown && !p.folded);
      const cards = p.hole.map((c, ci) => {
        if (!(reveal && c && c.r)) return backc;
        const ex = (i === meSeat && newHand) ? 'tx-deal' : (showdown && i !== meSeat ? 'tx-flip' : '');
        return face(c, ex + (ex ? ` d${ci}` : ''));
      }).join('');
      const pos = (i - meSeat + N) % N; // 自己永遠在下方
      const cls = [SEAT_CLASS[pos], p.folded ? 'folded' : '', s.toAct === i ? 'active' : '', winners.includes(i) ? 'winner' : ''].join(' ');
      const badge = p.allin ? '<div class="tx-badge allin">全下</div>' : (p.last ? `<div class="tx-badge">${p.last}</div>` : '');
      return `<div class="tx-seat ${cls}">
        ${s.dealer === i ? '<span class="tx-dealer">D</span>' : ''}
        <div class="tx-pinfo"><span class="tx-name">${p.name}</span><span class="tx-stack">${p.chips}</span></div>
        <div class="tx-cards">${cards}</div>
        ${badge}
        ${p.bet > 0 ? `<div class="tx-betchip">${chip(p.bet)}</div>` : ''}
      </div>`;
    }).join('');

    const boardHtml = s.board.map((c, i) => `<div class="tx-cardimg ${i >= prevBoard ? 'deal-new' : ''}" role="img" aria-label="${cardName(c)}" style="${Platform.cards.spriteCSS(c, 66)}"></div>`).join('')
      + Array(Math.max(0, 5 - s.board.length)).fill('<div class="board-slot"></div>').join('');
    this._prevBoard = s.board.length;

    const phase = ({ preflop: '翻牌前', flop: '翻牌', turn: '轉牌', river: '河牌', showdown: '攤牌', over: '結束' })[s.street] || '';

    root.innerHTML = `
      <div class="tx-felt">
        <button class="tx-stylebtn" id="tx-style">🎴 牌面</button>
        <div class="tx-rail"></div>
        ${seatHtml}
        <div class="tx-center">
          <div class="tx-phase">${phase}<i>第 ${s.handNo} 手</i></div>
          <div class="tx-board">${boardHtml}</div>
          <div class="tx-pot">${chip(this.pot(), 'pot' + (showdown ? ' win' : ''))}</div>
        </div>
        <div class="tx-log">${s.log.map(l => `<div>${l}</div>`).join('')}</div>
        <div class="tx-actions" id="tx-actions"></div>
      </div>`;

    const me = s.players[meSeat];
    const bar = root.querySelector('#tx-actions');
    const myTurn = s.toAct === meSeat && s.street !== 'idle' && s.street !== 'over' && me && !me.folded && !me.allin;
    if (myTurn) {
      const L = this.legal(meSeat);
      const callLabel = L.toCall > 0 ? `跟注 <b>${L.toCall}</b>` : '過牌';
      const send = (kind, amount) => { if (isHost) this.apply(meSeat, kind, amount); else Platform.net.sendHost('act', { kind, amount }); };
      const pot = this.pot();
      const clampR = v => Math.min(L.maxRaise, Math.max(L.minRaise, v));
      const half = clampR(s.currentBet + Math.floor(pot * 0.5)), full = clampR(s.currentBet + pot);
      bar.innerHTML = `
        <button class="tx-act fold" id="tx-fold">蓋牌</button>
        <button class="tx-act call" id="tx-call">${callLabel}</button>
        ${L.raise ? `<div class="tx-raisebox">
          <div class="tx-presets"><button data-v="${half}">½ 底池</button><button data-v="${full}">底池</button></div>
          <div class="tx-sliderow"><input type="range" id="tx-rng" aria-label="加注金額" min="${L.minRaise}" max="${L.maxRaise}" value="${L.minRaise}" step="${this.BB}"><span id="tx-rval">${L.minRaise}</span></div>
          <div class="tx-raisebtns"><button class="tx-act raise" id="tx-raise">加注</button><button class="tx-act allin" id="tx-allin">全下 ${L.maxRaise}</button></div>
        </div>` : ''}`;
      root.querySelector('#tx-fold').onclick = () => send('fold');
      root.querySelector('#tx-call').onclick = () => send(L.toCall > 0 ? 'call' : 'check');
      if (L.raise) {
        const rng = root.querySelector('#tx-rng'), rval = root.querySelector('#tx-rval');
        rng.oninput = () => rval.textContent = rng.value;
        root.querySelectorAll('.tx-presets button').forEach(b => b.onclick = () => { rng.value = b.dataset.v; rval.textContent = b.dataset.v; });
        root.querySelector('#tx-raise').onclick = () => send('raise', +rng.value);
        root.querySelector('#tx-allin').onclick = () => send('allin');
      }
    } else {
      const who = s.toAct >= 0 && s.players[s.toAct] ? s.players[s.toAct].name : '';
      bar.innerHTML = `<div class="tx-wait">${s.street === 'over' ? '' : (who ? `輪到 ${who}…` : '')}</div>`;
    }

    const sb = root.querySelector('#tx-style');
    if (sb) sb.onclick = () => Platform.ui.modal({
      title: '選擇牌面風格',
      html: '即時切換（會記住）',
      buttons: Object.keys(Platform.cards.STYLE_NAMES).map(k => ({
        label: Platform.cards.STYLE_NAMES[k] + (Platform.cards.style === k ? ' ✓' : ''),
        primary: Platform.cards.style === k,
        onClick: c => { c(); Platform.cards.setStyle(k); this.render(); },
      })),
    });

    this._push(); // host 同步給賓客
  };

  Platform.register({
    id: 'texas', name: '德州撲克', icon: '🃏',
    desc: '德州撲克無限注，下注/加注/全下', players: { min: 2, max: 4 },
    online: true,
    mount(stage, opts) {
      const root = document.createElement('div');
      root.id = 'tx-root'; root.className = 'tx-root';
      stage.appendChild(root);
      Texas._root = root; Texas._human = '你'; Texas._overShown = false; Texas._prevHand = null; Texas._prevBoard = 0;
      if (opts && opts.online) { Texas._startOnline(opts); }
      else { Texas.O = null; Texas.newMatch('你'); }
    },
    unmount() { Texas._clearTimers(); Texas._root = null; Texas.st = null; Texas.O = null; Texas._overShown = false; },
  });
}
