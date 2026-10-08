/* 德州撲克 Texas Hold'em — 單機 + 電腦（2~8 人桌；人數/起始籌碼/大盲由房內設定，預設 4 人、1000、10/20）
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

  // 最佳 5 張 + 組成牌型的關鍵牌（UI 金邊提示用）。cards 2~7 張 → {cat, tb, name, sub, key:[輸入索引]}
  bestHand(cards) {
    const n = cards.length, idx = [...Array(n).keys()];
    let best = null, used = idx;
    if (n > 5) {
      const pick = (start, acc) => {
        if (acc.length === 5) { const e = this.eval7(acc.map(i => cards[i])); if (!best || this.cmp(e, best) > 0) { best = e; used = acc; } return; }
        for (let i = start; i < n; i++) pick(i + 1, [...acc, i]);
      };
      pick(0, []);
    } else best = this.eval7(cards);
    const { cat, tb } = best;
    const keyRanks = { 0: [tb[0]], 1: [tb[0]], 2: [tb[0], tb[1]], 3: [tb[0]], 7: [tb[0]] }[cat]; // 其餘牌型 5 張全算
    const key = keyRanks ? used.filter(i => keyRanks.includes(this.rv(cards[i].r))) : used;
    const rn = v => ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }[v] || String(v));
    const sub = [rn(tb[0]), rn(tb[0]), `${rn(tb[0])} 與 ${rn(tb[1])}`, rn(tb[0]), `到 ${rn(tb[0])}`, `${rn(tb[0])} 大`, `${rn(tb[0])} 帶 ${rn(tb[1])}`, rn(tb[0]), `到 ${rn(tb[0])}`][cat];
    return { cat, tb, name: this.CAT_NAME[cat], sub, key };
  },

  // ---------- 邊池（純函式） ----------
  // players: [{totalInvested, folded}] → [{amt, elig:[idx...]}]
  buildPots(players) {
    const levels = [...new Set(players.filter(p => p.totalInvested > 0).map(p => p.totalInvested))].sort((a, b) => a - b);
    const pots = []; let prev = 0;
    for (const lv of levels) {
      let amt = 0;
      players.forEach(p => { amt += Math.min(Math.max(p.totalInvested - prev, 0), lv - prev); });
      const elig = players.map((p, i) => i).filter(i => players[i].totalInvested >= lv && !players[i].folded);
      // 這層只有已蓋牌者投入（例：蓋牌者下得比所有存活 all-in 者還多）→ 死錢併入上一個池，不能憑空消失
      if (amt > 0) { if (elig.length || !pots.length) pots.push({ amt, elig }); else pots[pots.length - 1].amt += amt; }
      prev = lv;
    }
    return pots;
  },

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  makeDeck() { const d = []; for (const s of ['s', 'h', 'd', 'c']) for (const r of this.RANKS) d.push({ r, s }); return d; },

  // ---------- 對局狀態 ----------
  st: null, _timers: [], _root: null, BB: 20, START: 1000, SEATS: 4, MAX_SEATS: 8, TURN_SEC: 30, AI_SPEED: 1,
  get SB() { return Math.max(1, Math.floor(this.BB / 2)); },
  AI_NAMES: ['', '阿傑', '小琪', '老王', '美玲', '大雄', '阿凱', '小芳'],
  _mkPlayer(i, name, isAI) {
    return { id: i, name: name || this.AI_NAMES[i] || ('電腦' + i), isAI, chips: this.START,
      hole: [], bet: 0, totalInvested: 0, folded: false, allin: false, acted: false, style: ['balanced', 'attack', 'defense'][i % 3], last: '' };
  },

  newMatch(human = '你') {
    const players = [...Array(this.SEATS).keys()].map(i => this._mkPlayer(i, i ? '' : human, i !== 0));
    this.st = { players, board: [], deck: [], dealer: 0, street: 'idle', currentBet: 0, toAct: -1, _seat: -1, log: [], pots: [], handNo: 0 };
    this.newHand();
  },
  // 中途加座位（房主加電腦 / 新賓客沒有電腦座位可接手）：本手先蓋牌觀戰，下一手起正常發牌
  _addSeat(name, isAI) {
    const s = this.st, i = s.players.length;
    if (i >= this.MAX_SEATS) return -1;
    const p = this._mkPlayer(i, name, isAI);
    if (s.street !== 'idle') { p.folded = true; p.last = '下一手加入'; }
    s.players.push(p);
    this.log(`${p.name} 入座`);
    return i;
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
    this._after(2600, () => this.step()); // 等洗牌 + 發牌動畫
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
    const tok = this._tickNo = (this._tickNo || 0) + 1;
    if (s.players[nxt].isAI) this._after((1200 + Math.random() * 600) * this.AI_SPEED, () => this.aiAct(nxt));
    else if (this.TURN_SEC) this._after(this.TURN_SEC * 1000, () => { // 逾時：能過牌就過，否則蓋牌
      if (this._tickNo === tok && s.toAct === nxt) this.apply(nxt, this.legal(nxt).check ? 'check' : 'fold');
    });
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
    this._after(s.street === 'flop' ? 2000 : 1400, () => this.step()); // 等收籌碼 + 翻牌動畫
  },
  _streetName(st) { return { flop: '翻牌', turn: '轉牌', river: '河牌' }[st] || st; },

  _awardUncontested(winner) {
    const amt = this.pot();
    winner.chips += amt;
    this.log(`${winner.name} 贏得底池 ${amt}（其他人蓋牌）`);
    this.st.street = 'idle'; this.st.toAct = -1;
    if (this.render) this.render();
    this._after(3600, () => this.newHand());
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
    this._after(6800, () => { s._reveal = false; this.newHand(); }); // 等亮牌 + 結算動畫
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
    if (!s || s.toAct !== i || !s.players[i].isAI) return; // 思考中途被賓客接手 → 交給真人
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
        { label: '回大廳', onClick: c => { c(); Platform.leave(); } },
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
  // 死錢：A 投 10 後蓋牌，B/C/D 各 all-in 1 → 9 不能消失，併入主池
  const dead = T.buildPots([{ totalInvested: 10, folded: true }, { totalInvested: 1, folded: false }, { totalInvested: 1, folded: false }, { totalInvested: 1, folded: false }]);
  assert.deepStrictEqual(dead.map(p => p.amt), [13], '蓋牌者多投的死錢併入主池');
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
  // 關鍵牌（金邊）：手 8c 3s + 公牌 8h Ks 3d 2c 8s → 葫蘆 8 帶 3，關鍵牌 = 兩張手牌 + 公牌第 0/2/4 張
  const bh = T.bestHand(C('8c 3s 8h Ks 3d 2c 8s'));
  assert.strictEqual(bh.name, '葫蘆'); assert.strictEqual(bh.sub, '8 帶 3');
  assert.deepStrictEqual(bh.key.sort((a, b) => a - b), [0, 1, 2, 4, 6], '葫蘆關鍵牌');
  const bp = T.bestHand(C('8c 3s 8h Ks 3d'));
  assert.strictEqual(bp.name, '兩對'); assert.deepStrictEqual(bp.key.sort((a, b) => a - b), [0, 1, 2, 4], '兩對不含 K');
  assert.deepStrictEqual(T.bestHand(C('Ah 7d')).key, [0], '翻牌前高牌只標 A');
  assert.strictEqual(T.bestHand(C('5s 4h 3d 2c As Kd Qd')).sub, '到 5', '輪子順子');
  console.log('✅ Texas 自測通過');
}
if (typeof module !== 'undefined') module.exports = Texas;

// ---------- 平台註冊 + UI ----------
if (typeof Platform !== 'undefined') {
  // 對賓客遮蔽 hole cards（只給自己；攤牌時公開未蓋牌者）
  Texas._redact = function (seat) {
    const s = this.st, reveal = !!s._reveal;
    return JSON.parse(JSON.stringify({
      players: s.players.map((p, i) => ({
        id: p.id, name: p.name, isAI: p.isAI, auto: !!p.auto, chips: p.chips, bet: p.bet, totalInvested: p.totalInvested,
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
    const names = this.O.names;
    const players = names.map((nm, i) => {
      const occupied = i === 0 || nm != null;
      return Object.assign(this._mkPlayer(i, nm, !occupied), { _remote: occupied && i !== 0 });
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
      if (this.O.started) { this._joinMidGame(d, from); return; }
      let seat = -1; for (let i = 1; i < this.O.names.length; i++) if (!this.O.peerOf[i]) { seat = i; break; }
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
        const p = this.st.players[seat]; p.isAI = true; p.auto = true; p._remote = false; this.log(`${p.name} 離線，改由電腦接手`);
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
  // 開局後才連進來的賓客：接手一個還有籌碼的電腦座位；沒有就加新座位（本手觀戰，下一手入局）
  Texas._joinMidGame = function (d, from) {
    const s = this.st, nm = d.name || '賓客';
    if (!s || s.street === 'over') { Platform.net.sendTo(from, 'full', {}); return; }
    let seat = s.players.findIndex((p, i) => i && p.isAI && p.chips > 0);
    if (seat >= 0) { s.players[seat].isAI = false; s.players[seat].name = nm; this.log(`${nm} 接手座位 ${seat + 1}`); }
    else seat = this._addSeat(nm, false);
    if (seat < 0) { Platform.net.sendTo(from, 'full', {}); return; }
    s.players[seat]._remote = true;
    this.O.seatOf[from] = seat; this.O.peerOf[seat] = from; this.O.names[seat] = nm;
    Platform.net.sendTo(from, 'start', { seat });
    this.render(); // render 尾端 _push 會把畫面送給新賓客
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
    this.O = { isHost: !opts.join, mySeat: opts.join ? -1 : 0, seatOf: {}, peerOf: {}, names: Array(this.SEATS).fill(null), started: false };
    this._renderRoom();
    Platform.net.init(name).then(() => {
      if (this.O.isHost) { Platform.net.createRoom(); this.O.names[0] = name; this._setupHostNet(); this._renderRoom(); }
      else { this._setupGuestNet(); Platform.net.joinRoom(opts.join.host); this._renderRoom(); }
    }).catch(e => { Platform.toast('連線失敗：' + (e.message || e)); Platform.exit(); });
  };
  Texas._renderRoom = function () {
    if (!this._root || !this.O || this.O.started) return;
    if (this.O.isHost) { // 房內設定改了人數：座位表跟著伸縮（不砍掉已入座的賓客）
      const nm = this.O.names, need = Math.max(this.SEATS, 1 + Math.max(0, ...Object.keys(this.O.peerOf).map(Number)));
      if (nm.length !== need) {
        while (nm.length < need) nm.push(null); nm.length = need;
        if (Platform.net.conns.length) Platform.net.broadcast('lobby', { names: nm });
      }
    }
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
      buttons: [{ label: '回大廳', primary: true, onClick: c => { c(); Platform.leave(); } }],
    });
  };

  // ================= 畫面層 v2：骨架只建一次，依「前後狀態差異」觸發動畫與音效 =================
  // 動畫/音效純裝飾：DOM 最終狀態一律同步寫入，不依賴動畫結束回呼（背景分頁 rAF 停擺也不會卡住牌局）
  const SR_ = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SS_ = ['s', 'h', 'd', 'c'];
  const BET_STREETS = ['preflop', 'flop', 'turn', 'river'];
  const known = c => !!(c && c.r);
  const cardName = c => ({ s: '黑桃', h: '紅心', d: '方塊', c: '梅花' }[c.s] || '') + c.r;
  const cardHTML = (c, cls = '', st = '') => known(c)
    ? `<div class="tx-card ${cls}" role="img" aria-label="${cardName(c)}" style="background-position:${SR_.indexOf(c.r) / 12 * 100}% ${SS_.indexOf(c.s) / 3 * 100}%;${st}"><i class="tx-back"></i></div>`
    : `<div class="tx-card back ${cls}" role="img" aria-label="蓋著的牌" style="${st}"></div>`;
  const ini = nm => { const ch = [...(nm || '?')]; const last = ch[ch.length - 1]; return /[一-鿿]/.test(last) ? last : ch[0].toUpperCase(); };
  const actText = l => l.replace(/^跟 /, '跟注 ').replace(/^加到 /, '加注到 ');
  const actKind = l => /^(蓋牌|出局)/.test(l) ? 'k-fold' : /^全下/.test(l) ? 'k-allin' : /^(跟|加)/.test(l) ? 'k-bet' : '';
  // ---------- 音效：Kenney Casino Audio（CC0 實錄，WAV 以支援 iPhone/Android）；播放器在 core/fx.js ----------
  const TX_SND = ['card-shuffle', 'card-slide-1', 'card-slide-2', 'card-slide-3', 'card-slide-4', 'card-place-1', 'card-place-2', 'card-place-3', 'card-place-4',
    'card-shove-1', 'card-shove-2', 'chip-lay-1', 'chip-lay-2', 'chip-lay-3', 'chips-stack-1', 'chips-stack-2', 'chips-stack-3', 'chips-stack-4',
    'chips-collide-1', 'chips-collide-2', 'chips-collide-3', 'chips-handle-1', 'chips-handle-2', 'chips-handle-3'];
  Texas.sfx = Object.assign(Platform.fx.sampler('core/sfx/', Object.fromEntries(TX_SND.map(n => [n, n + '.wav']))), {
    knock: () => Platform.audio.knock(), ding: () => Platform.audio.ding(), // 共用：core/audio.js
  });

  // ---------- 動畫小工具：時間軸在 core/fx.js（mount 時建立 this._tl）----------
  Texas._fx = function (fn, ms) { this._tl.after(fn, ms); };
  Texas._clearFx = function () { if (this._tl) this._tl.clear(); };
  Texas._fly = function (from, to, html, dur, delay) { this._tl.fly(from, to, html, dur, delay); };
  Texas._count = function (el, to, dur, delay) { this._tl.count(el, to, dur, delay); };
  Texas._pop = function (el, txt, kind) { el.textContent = txt; el.className = 'tx-bubble ' + kind; void el.offsetWidth; el.classList.add('pop'); };
  Texas._betFx = function (k, amt, label, delay = 0) {
    const U = this._ui, b = U.bet[k];
    this._fly(U.ava[k], b, '<span class="tx-chip"></span>', 500, delay);
    b.querySelector('b').textContent = amt; b.style.setProperty('--d', delay + 450 + 'ms');
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    this.sfx.play(amt > 40 ? 'chips-stack' : 'chip-lay', { when: delay / 1000 });
    if (amt >= 200) this.sfx.play('chips-handle', { when: delay / 1000 + .1, gain: .5 });
    if (label) this._pop(U.bub[k], `${label} ${amt}`, 'k-bet');
  };
  // 牌面風格以 CSS 變數套用，切換時不必重建牌。須轉絕對網址：var() 裡的 url() 會相對於 texas.css 解析
  Texas._skin = function () {
    const r = this._root.style, abs = u => new URL(u, document.baseURI).href;
    r.setProperty('--tx-sheet', `url('${abs(Platform.cards.SHEET)}')`); r.setProperty('--tx-back', `url('${abs(Platform.cards.BACK)}')`);
  };

  // ---------- 骨架 ----------
  // 座位沿橢圓排：k=0 你（正下方），k 增加 → 右 → 上 → 左（N=4 時與舊版 右/上/左 位置一致）
  const geo = (k, N) => { const a = Math.PI / 2 - k * 2 * Math.PI / N; return { c: Math.cos(a), s: Math.sin(a) }; };
  // 直立（手機）桌子瘦高：對手排上半圈（右 → 上 → 左），免得兩側座位壓到公共牌；5 人以上弧度放寬到 200° 分散開
  const pgeo = (k, N) => {
    const span = N > 4 ? 200 : 180, a = N > 2 ? ((span - 180) / 2 - (k - 1) / (N - 2) * span) * Math.PI / 180 : -Math.PI / 2;
    return { c: Math.cos(a), s: Math.sin(a) };
  };
  const vars = (k, N) => { const g = geo(k, N), p = k ? pgeo(k, N) : g, f = v => v.toFixed(3);
    return `--c:${f(g.c)};--s:${f(g.s)};--c2:${f(g.c * g.c)};--sn:${f(Math.min(g.s, 0))};--pc:${f(p.c)};--ps:${f(p.s)};--pc2:${f(p.c * p.c)};--psn:${f(Math.min(p.s, 0))}`; };
  Texas._build = function (N) {
    const root = this._root;
    const seat = p => {
      const { c, s } = geo(p, N), pc = pgeo(p, N).c; // 實際位置由 texas.css 依直/橫向計算
      return `<div class="tx-seat${s < -.7 ? ' top' : ''}${pc > .3 ? ' right' : ''}" data-p="${p}" style="${vars(p, N)}"><div class="tx-pod"><div class="tx-ava"><span class="tx-ini"></span><span class="tx-dbtn" hidden>D</span></div>
      <div><div class="tx-nm"></div><div class="tx-st"></div></div><div class="tx-hole"></div></div><span class="tx-bubble"></span></div>`;
    };
    const bet = p => `<div class="tx-bet" data-p="${p}" style="${vars(p, N)}"><span class="tx-chip"></span><b></b></div>`;
    const ks = [...Array(N).keys()];
    root.innerHTML = `<div class="tx-app${N > 6 ? ' many' : N > 4 ? ' mid' : ''}">
      <header class="tx-top">
        <div class="tx-info">第 <b class="tx-hno">1</b> 手<span class="tx-blinds"> · 盲注 <b>${this.SB}/${this.BB}</b></span></div>
        <button class="tx-ibtn tx-addai" aria-label="加入一位電腦玩家" hidden>＋🤖<span class="tx-lbl"> 電腦</span></button>
        <button class="tx-ibtn tx-invite" aria-label="邀請朋友中途入座" hidden>🔗<span class="tx-lbl"> 邀請</span></button>
        <button class="tx-ibtn tx-snd" aria-label="音效開關"></button>
        <button class="tx-ibtn tx-style" aria-label="牌面風格">🎴<span class="tx-lbl"> 牌面</span></button>
        <button class="tx-ibtn tx-logbtn" aria-label="牌局紀錄">☰</button>
      </header>
      <main class="tx-wrap"><div class="tx-table">
        ${ks.slice(1).map(seat).join('')}
        ${ks.map(bet).join('')}
        <div class="tx-deck"></div>
        <div class="tx-center">
          <div class="tx-phase"></div>
          <div class="tx-board">${'<div class="tx-slot"></div>'.repeat(5)}</div>
          <div class="tx-pot"><span class="tx-chip gold"></span><b>0</b><small>底池</small></div>
        </div>
        <div class="tx-banner" aria-live="polite"><span></span><small></small></div>
      </div></main>
      <section class="tx-dock" aria-label="你的手牌與行動">
        <div class="tx-me"><div class="tx-ava"><span class="tx-ini"></span><span class="tx-dbtn" hidden>D</span></div>
          <div><div class="tx-nm"></div><div class="tx-st"></div><div class="tx-str"></div></div><span class="tx-bubble"></span></div>
        <div class="tx-held" title="按住偷看手牌"></div>
        <div class="tx-ctrl">
          <div class="tx-wait" aria-live="polite"></div>
          <div class="tx-raise" role="dialog" aria-label="選擇加注金額">
            <div class="tx-rttl"><span class="tx-rlbl">加注到</span><b class="tx-rval">0</b></div>
            <div class="tx-presets"></div>
            <div class="tx-srow"><button class="tx-btn ghost tx-rminus" aria-label="減少">−</button><input type="range" class="tx-rng" aria-label="加注金額">
              <button class="tx-btn ghost tx-rplus" aria-label="增加">＋</button><button class="tx-btn primary tx-rok">確認</button></div>
          </div>
          <div class="tx-acts"><button class="tx-btn fold tx-fold" disabled>蓋牌</button><button class="tx-btn primary tx-call" disabled>跟注</button><button class="tx-btn tx-raisebtn" disabled aria-expanded="false">加注</button></div>
        </div>
      </section>
      <aside class="tx-log" aria-label="牌局紀錄"><h2>牌局紀錄 <button class="tx-ibtn tx-logx" aria-label="關閉">✕</button></h2><ul></ul></aside>
    </div>`;
    const q = s => root.querySelector(s);
    const U = this._ui = {
      app: q('.tx-app'), hno: q('.tx-hno'), phase: q('.tx-phase'), slots: [...root.querySelectorAll('.tx-slot')], board: q('.tx-board'),
      pot: q('.tx-pot'), potv: q('.tx-pot b'), deck: q('.tx-deck'), banner: q('.tx-banner'),
      seat: [q('.tx-me'), ...ks.slice(1).map(p => q(`.tx-seat[data-p="${p}"]`))],
      bet: ks.map(p => q(`.tx-bet[data-p="${p}"]`)), addai: q('.tx-addai'), invite: q('.tx-invite'),
      held: q('.tx-held'), str: q('.tx-str'), wait: q('.tx-wait'),
      raise: q('.tx-raise'), presets: q('.tx-presets'), rng: q('.tx-rng'), rval: q('.tx-rval'), rlbl: q('.tx-rlbl'), rok: q('.tx-rok'),
      fold: q('.tx-fold'), call: q('.tx-call'), raiseBtn: q('.tx-raisebtn'), snd: q('.tx-snd'), log: q('.tx-log'), logList: q('.tx-log ul'),
    };
    U.ava = U.seat.map(e => e.querySelector('.tx-ava')); U.st = U.seat.map(e => e.querySelector('.tx-st'));
    U.bub = U.seat.map(e => e.querySelector('.tx-bubble')); U.hole = U.seat.map(e => e.querySelector('.tx-hole')); // [0] 為 null（自己用 held）
    this._prev = null; this._paid = null; this._R = null; this._strLabel = '';
    const sndIcon = () => { const on = Platform.audio.enabled; U.snd.textContent = on ? '🔊' : '🔇'; U.snd.setAttribute('aria-pressed', String(on)); };
    sndIcon();
    U.snd.onclick = () => { Platform.audio.setEnabled(!Platform.audio.enabled); sndIcon(); };
    q('.tx-logbtn').onclick = () => U.log.classList.add('open');
    U.addai.onclick = () => { if (this._addSeat('', true) >= 0) this.render(); };
    U.invite.onclick = () => {
      const m = Platform.ui.modal({ title: '邀請朋友入座', html: `<p>連結傳給朋友，打開即可中途入座（接手電腦座位，或下一手加入新座位）。</p>
        <div class="net-url"><input readonly value="${Platform.net.inviteUrl()}"></div>`,
        buttons: [{ label: '複製連結', primary: true, onClick: c => { const i = m.el.querySelector('input'); i.select(); try { document.execCommand('copy'); Platform.toast('已複製連結'); } catch {} c(); } }, { label: '關閉' }] });
    };
    q('.tx-logx').onclick = () => U.log.classList.remove('open');
    q('.tx-style').onclick = () => Platform.ui.modal({
      title: '選擇牌面風格', html: '即時切換（會記住）',
      buttons: Object.keys(Platform.cards.STYLE_NAMES).map(k => ({
        label: Platform.cards.STYLE_NAMES[k] + (Platform.cards.style === k ? ' ✓' : ''), primary: Platform.cards.style === k,
        onClick: c => { c(); Platform.cards.setStyle(k); this._skin(); },
      })),
    });
    U.held.onpointerdown = () => U.held.classList.add('peek');
    U.rng.oninput = () => this._setR(+U.rng.value);
    q('.tx-rminus').onclick = () => this._setR(this._R.v - 10);
    q('.tx-rplus').onclick = () => this._setR(this._R.v + 10);
    this._skin();
    const me = () => this.O ? this.O.mySeat : 0;
    Platform.hud.mount(this, { root, bar: q('.tx-top'), me,
      seatEl: i => { const n = this.st ? this.st.players.length : 0; return n && this._ui ? this._ui.seat[(i - me() + n) % n] : null; },
      takeover: i => { if (this.st.toAct === i) this._after(600 * this.AI_SPEED, () => this.aiAct(i)); } });
  };

  // ---------- 加注面板 ----------
  Texas._openRaise = function (L) {
    const U = this._ui, s = this.st, base = this.pot() + L.toCall;
    const clamp = v => Math.min(L.maxRaise, Math.max(L.minRaise, Math.round(v / 10) * 10));
    const half = clamp(s.currentBet + base / 2), full = clamp(s.currentBet + base);  // 底池加注 = 現注 + (底池 + 跟注額)
    this._R = { min: L.minRaise, max: L.maxRaise, v: half };
    U.rlbl.textContent = s.currentBet > 0 ? '加注到' : '下注';
    U.presets.innerHTML = [['最小', L.minRaise], ['½ 池', half], ['底池', full], ['全下', L.maxRaise]]
      .map(([l, v]) => `<button class="${l === '全下' ? 'allin' : ''}" data-v="${v}">${l}<small>${v}</small></button>`).join('');
    U.presets.querySelectorAll('button').forEach(b => b.onclick = () => this._setR(+b.dataset.v));
    U.rng.min = L.minRaise; U.rng.max = L.maxRaise; U.rng.step = 10;
    this._setR(half);
    U.raise.classList.add('open'); U.raiseBtn.setAttribute('aria-expanded', 'true');
  };
  Texas._closeRaise = function () { const U = this._ui; U.raise.classList.remove('open'); U.raiseBtn.setAttribute('aria-expanded', 'false'); };
  Texas._setR = function (v) {
    const R = this._R, U = this._ui; if (!R) return;
    v = Math.max(R.min, Math.min(R.max, v)); R.v = v; U.rng.value = v; U.rval.textContent = v;
    U.rok.textContent = v >= R.max ? '全下 ✓' : '確認 ✓';
    U.presets.querySelectorAll('button').forEach(b => b.classList.toggle('sel', +b.dataset.v === v));
  };

  // ---------- 主渲染 ----------
  Texas.render = function () {
    const root = this._root; if (!root) return;
    const O = this.O;
    if (O && !O.started) { this._renderRoom(); return; }
    const s = this.st; if (!s) return;
    if (!root.querySelector('.tx-app') || this._ui.seat.length !== s.players.length) {
      const old = this._prev; this._build(s.players.length);
      // 牌局中途加座位而重建骨架：沿用上一個快照（不重播發牌），公共牌/輪到誰/操作鈕強制重畫
      if (old && old.hand === s.handNo) this._prev = Object.assign({}, old, { boardLen: 0, toAct: -2, myTurn: false });
    }
    const U = this._ui, me = O ? O.mySeat : 0, pl = s.players, N = pl.length, isHost = !O || O.isHost;
    const pos = i => (i - me + N) % N; // 0 = 自己（下方），1 右、2 上、3 左
    const P = this._prev, newHand = !P || P.hand !== s.handNo;
    const mine = pl[me];
    let t = 0, payT = 0; // 本次更新的動畫時間軸（ms）

    U.hno.textContent = s.handNo;
    U.phase.textContent = ({ preflop: '翻 牌 前', flop: '翻 牌', turn: '轉 牌', river: '河 牌', showdown: '攤 牌', over: '結 束' })[s.street] || '';
    pl.forEach((p, i) => {
      const seat = U.seat[pos(i)];
      seat.querySelector('.tx-ini').textContent = ini(p.name);
      seat.querySelector('.tx-nm').textContent = p.name;
      seat.querySelector('.tx-dbtn').hidden = s.dealer !== i;
      seat.classList.toggle('folded', !!p.folded);
    });

    if (newHand) {
      // ---- 新一手：清桌 → 盲注 → 洗牌 → 逐張發牌（先牌背，到齊後自己的翻面）----
      this._clearFx(); this._paid = null; this._strLabel = '';
      U.slots.forEach(sl => { sl.innerHTML = ''; }); U.board.classList.remove('dim');
      U.banner.className = 'tx-banner';
      U.bet.forEach(b => b.classList.remove('on'));
      U.bub.forEach(b => { b.className = 'tx-bubble'; });
      U.hole.forEach(h => { if (h) { h.innerHTML = ''; h.classList.remove('show'); } });
      U.held.innerHTML = ''; U.held.classList.remove('folded');
      U.seat.forEach(e => e.classList.remove('winner'));
      U.str.className = 'tx-str'; U.str.textContent = '';
      U.potv.textContent = 0; U.potv.dataset.v = 0;
      pl.forEach((p, i) => { const el = U.st[pos(i)]; el.textContent = p.chips + p.bet; el.dataset.v = p.chips + p.bet; });
      pl.forEach((p, i) => {
        if (p.bet > 0) this._betFx(pos(i), p.bet, p.bet < this.BB ? '小盲' : '大盲');
        else if (p.last) this._pop(U.bub[pos(i)], p.last, actKind(p.last));
      });
      this.sfx.play('card-shuffle', { when: .3 });
      const order = []; for (let k = 1; k <= N; k++) { const i = (s.dealer + k) % N; if (pl[i].hole.length) order.push(i); }
      const dl = {}; let d = 1000;
      order.forEach(i => { dl[i] = []; });
      [0, 1].forEach(() => order.forEach(i => { dl[i].push(d); d += 150; }));
      const flipT = d + 500;
      order.forEach(i => {
        const k = pos(i), box = k ? U.hole[k] : U.held;
        box.innerHTML = k ? dl[i].map(x => `<i class="tx-mini deal" style="--d:${x + 350}ms"></i>`).join('')
          : pl[i].hole.map((c, j) => cardHTML(c, 'deal', `--d:${dl[i][j] + 350}ms;--t:${flipT}ms`)).join('');
        dl[i].forEach((x, j) => { this._fly(U.deck, box.children[j], '<div class="tx-card back tx-flycard"></div>', 350, x); this.sfx.play('card-slide', { gain: .6, when: x / 1000 }); });
      });
      t = flipT + 400;
    } else {
      // ---- 換街 / 結算：桌面下注掃進底池 ----
      const sweep = pl.map((p, i) => i).filter(i => P.bet[i] > 0 && (pl[i].bet === 0 || s.street === 'idle'));
      if (sweep.length) {
        sweep.forEach((i, n) => { const b = U.bet[pos(i)]; this._fly(b, U.pot, '<span class="tx-chip"></span>', 550, n * 90); b.classList.remove('on'); });
        this.sfx.play('chips-collide'); this.sfx.play('chips-collide', { when: .14, gain: .6 }); this.sfx.play('chips-handle', { when: .25, gain: .7 });
        t = 650;
      }
      if (s.street !== P.street) U.bub.forEach(b => { if (!/k-fold|k-allin/.test(b.className)) b.className = 'tx-bubble'; });
      // ---- 新公共牌：逐張落桌 ----
      for (let k = P.boardLen; k < s.board.length; k++) {
        const at = t + (k - P.boardLen) * 450;
        U.slots[k].innerHTML = cardHTML(s.board[k], 'in', `--d:${at}ms`);
        this.sfx.play('card-place', { when: at / 1000 });
      }
      if (s.board.length > P.boardLen) { t += (s.board.length - P.boardLen) * 450 + 150; Platform.voice.say({ 3: '翻牌', 4: '轉牌', 5: '河牌' }[s.board.length]); }
      // ---- 每位玩家的新動作：氣泡 + 音效 + 籌碼 ----
      pl.forEach((p, i) => {
        const k = pos(i);
        if (p.bet > P.bet[i]) this._betFx(k, p.bet);
        else if (p.chips < P.chips[i]) { // 跟注與換街在同一次更新：籌碼直接飛進底池
          this._fly(U.ava[k], U.pot, '<span class="tx-chip"></span>', 600, 0); this.sfx.play(P.chips[i] - p.chips > 40 ? 'chips-stack' : 'chip-lay');
        }
        if (!p.last || !((p.acted && !P.acted[i]) || p.last !== P.last[i])) return;
        this._pop(U.bub[k], actText(p.last), actKind(p.last));
        Platform.voice.say(actText(p.last)); // 語音報：跟注 20／加注到 100／全下／過牌／蓋牌
        if (p.last === '過牌') this.sfx.knock();
        if (p.folded && !P.folded[i]) {
          this.sfx.play('card-shove', { gain: .7 });
          if (k) { [...U.hole[k].children].forEach((m, j) => this._fly(m, U.deck, '<i class="tx-mini"></i>', 450, j * 80)); U.hole[k].innerHTML = ''; }
          else U.held.classList.add('folded');
        }
      });
      // ---- 攤牌：對手逐一亮牌 ----
      if (s._reveal && !P.reveal) {
        let n = 0;
        pl.forEach((p, i) => {
          const k = pos(i); if (!k || p.folded || !known(p.hole[0])) return;
          const at = t + n++ * 700;
          U.hole[k].classList.add('show'); U.hole[k].innerHTML = p.hole.map(c => cardHTML(c, 'mini in', `--d:${at}ms`)).join('');
          this.sfx.play('card-place', { when: at / 1000 });
        });
        t += n * 700 + 300;
      }
      // ---- 結算：橫幅 → 底池籌碼飛向贏家 ----
      const done = s.street === 'idle' || (s.street === 'showdown' && (s._winners || []).length);
      if (done && this._paid !== s.handNo) {
        this._paid = s.handNo;
        const win = s.street === 'idle' ? pl.map((p, i) => i).filter(i => !pl[i].folded) : s._winners;
        const gain = i => pl[i].chips - (P.chips[i] - (pl[i].totalInvested - P.inv[i])); // 扣回同一次更新內才投入的跟注額
        const iWin = win.includes(me), total = pl.reduce((a, p) => a + p.totalInvested, 0);
        let head, sub;
        if (s.street === 'idle') { head = iWin ? '你贏了' : `${pl[win[0]].name} 贏了`; sub = `其他人蓋牌 · 贏得 ${gain(win[0])}`; }
        else {
          const h = this.bestHand([...pl[win[0]].hole, ...s.board]);
          head = iWin ? `${h.name}！` : `${win.map(i => pl[i].name).join('、')} 贏了`;
          sub = iWin ? `你贏得 ${gain(me)}` : `${h.name} · 贏得 ${win.reduce((a, i) => a + gain(i), 0)}`;
        }
        this._count(U.potv, total, 400, Math.min(t, 600));
        this._fx(() => { U.banner.firstChild.textContent = head; U.banner.lastChild.textContent = sub; U.banner.className = 'tx-banner'; void U.banner.offsetWidth; U.banner.classList.add('show'); Platform.voice.say(sub); }, t);
        payT = t + 900;
        win.forEach((i, w) => {
          for (let c = 0; c < 6; c++) this._fly(U.pot, U.ava[pos(i)], '<span class="tx-chip gold"></span>', 750, payT + c * 140 + w * 60);
          this._fx(() => U.seat[pos(i)].classList.add('winner'), payT);
        });
        for (let c = 0; c < 5; c++) this.sfx.play('chips-stack', { when: payT / 1000 + c * .15, gain: .7 });
        this.sfx.play('chips-handle', { when: payT / 1000 + .4 });
        if (iWin) this._fx(() => Platform.audio.win(), payT + 400);
        this._count(U.potv, 0, 800, payT);
      }
    }

    // ---- 同步層：不論動畫，最終狀態一律寫入 ----
    if (this._paid !== s.handNo) {
      const collected = pl.reduce((a, p) => a + p.totalInvested - (s.street === 'idle' ? 0 : p.bet), 0);
      if (+U.potv.dataset.v !== collected) this._count(U.potv, collected, 500, t ? Math.min(t, 650) : 0);
    }
    pl.forEach((p, i) => {
      const k = pos(i), el = U.st[k], b = U.bet[k];
      if (newHand) this._count(el, p.chips, 400, 400);
      else if (+el.dataset.v !== p.chips) this._count(el, p.chips, p.chips > +el.dataset.v ? 1000 : 400, p.chips > +el.dataset.v && payT ? payT : 100);
      if (p.bet > 0 && s.street !== 'idle') { if (!b.classList.contains('on')) { b.querySelector('b').textContent = p.bet; b.style.setProperty('--d', '0ms'); b.classList.add('on'); } }
      else b.classList.remove('on');
      // 中途重建（例如連線開局）時補上手牌
      if (k && !p.folded && p.hole.length && !U.hole[k].children.length && !s._reveal) U.hole[k].innerHTML = '<i class="tx-mini"></i><i class="tx-mini"></i>';
    });
    if (mine && known(mine.hole[0]) && !U.held.children.length) U.held.innerHTML = mine.hole.map(c => cardHTML(c)).join('');
    U.held.classList.toggle('folded', !!(mine && mine.folded && mine.hole.length));

    // ---- 你的牌型 + 金邊提示（等發牌/翻牌動畫結束才亮）----
    if (mine && known(mine.hole[0])) {
      const h = this.bestHand([...mine.hole, ...s.board]), key = h.cat && !mine.folded ? h.key : [], label = mine.folded ? '已蓋牌' : `${h.name} ${h.sub}`;
      const apply = () => {
        if (mine.folded) { U.str.className = 'tx-str'; U.str.textContent = '已蓋牌'; }
        else {
          U.str.innerHTML = ''; U.str.append(h.name + ' '); const em = document.createElement('em'); em.textContent = h.sub; U.str.append(em);
          U.str.className = 'tx-str' + (h.cat ? ' made' : '');
          if (label !== this._strLabel) { void U.str.offsetWidth; U.str.classList.add('up'); }
        }
        this._strLabel = label;
        [...U.held.children].forEach((c, j) => c.classList.toggle('hit', key.includes(j)));
        U.slots.forEach((sl, j) => { const c = sl.firstElementChild; if (c) c.classList.toggle('hit', key.includes(j + 2)); });
        U.board.classList.toggle('dim', key.some(x => x >= 2));
      };
      t ? this._fx(apply, t) : apply();
    }

    // ---- 輪到誰 + 操作區 ----
    const live = BET_STREETS.includes(s.street) && s.toAct >= 0 && !!pl[s.toAct];
    if (!P || P.toAct !== s.toAct || newHand) {
      U.seat.forEach(e => e.classList.remove('turn')); U.ava.forEach(a => a.classList.remove('turn'));
      if (live) { void U.app.offsetWidth; U.seat[pos(s.toAct)].classList.add('turn'); U.ava[pos(s.toAct)].classList.add('turn'); }
    }
    const myTurn = live && s.toAct === me && mine && !mine.folded && !mine.allin;
    U.app.classList.toggle('myturn', !!myTurn);
    Platform.ui.turnClock(myTurn ? `tx:${s.handNo}:${s.street}:${s.toAct}:${s.currentBet}:${(s.log || []).length}` : null, Texas.TURN_SEC);
    U.addai.hidden = !isHost || pl.length >= this.MAX_SEATS || s.street === 'over';
    U.invite.hidden = !(O && O.isHost);
    U.wait.textContent = myTurn ? '輪到你' : live ? `輪到 ${pl[s.toAct].name}…` : '';
    if (myTurn && (!P || !P.myTurn || newHand)) {
      const L = this.legal(me);
      const send = (kind, amount) => {
        this._closeRaise(); [U.fold, U.call, U.raiseBtn].forEach(b => { b.disabled = true; });
        if (isHost) this.apply(me, kind, amount); else Platform.net.sendHost('act', { kind, amount });
      };
      U.call.innerHTML = L.toCall > 0 ? `跟注 ${L.toCall}<small>剩 ${mine.chips - L.toCall}</small>` : '過牌<small>&nbsp;</small>';
      U.raiseBtn.textContent = s.currentBet > 0 ? '加注' : '下注';
      U.fold.disabled = U.call.disabled = false; U.raiseBtn.disabled = !L.raise;
      U.fold.onclick = () => send('fold');
      U.call.onclick = () => send(L.toCall > 0 ? 'call' : 'check');
      U.raiseBtn.onclick = () => U.raise.classList.contains('open') ? this._closeRaise() : this._openRaise(L);
      U.rok.onclick = () => send(this._R.v >= L.maxRaise ? 'allin' : 'raise', this._R.v);
      this.sfx.ding();
    } else if (!myTurn) {
      this._closeRaise(); [U.fold, U.call, U.raiseBtn].forEach(b => { b.disabled = true; });
      U.call.innerHTML = '跟注'; U.raiseBtn.textContent = '加注';
    }

    // ---- 紀錄（純文字寫入：玩家名稱可能來自連線賓客輸入）----
    U.logList.replaceChildren(...s.log.map(l => { const li = document.createElement('li'); li.textContent = l; return li; }));

    this._prev = {
      hand: s.handNo, street: s.street, boardLen: s.board.length, reveal: !!s._reveal, toAct: s.toAct, myTurn: !!myTurn,
      bet: pl.map(p => p.bet), chips: pl.map(p => p.chips), inv: pl.map(p => p.totalInvested), folded: pl.map(p => !!p.folded), acted: pl.map(p => !!p.acted), last: pl.map(p => p.last),
    };
    Platform.hud.sync();
    this._push(); // host 同步給賓客
  };

  Platform.register({
    id: 'texas', name: '德州撲克', icon: '🃏',
    desc: '德州撲克無限注，下注/加注/全下', players: { min: 2, max: 8 },
    online: true,
    target: Texas, settings: [
      { k: 'SEATS', label: '人數', def: 4, options: [2, 3, 4, 5, 6, 7, 8], fmt: v => `${v} 人` },
      { k: 'START', label: '起始籌碼', def: 1000, options: [500, 1000, 5000, 10000], fmt: Platform.money },
      { k: 'BB', label: '大盲', def: 20, options: [10, 20, 50, 100, 200], fmt: v => `${Platform.money(v / 2)}/${Platform.money(v)}` },
      Platform.COMMON_CFG.turn, Platform.COMMON_CFG.ai],
    mount(stage, opts) {
      const root = document.createElement('div');
      root.id = 'tx-root'; root.className = 'tx-root';
      stage.appendChild(root);
      Texas._root = root; Texas._human = '你'; Texas._overShown = false; Texas._prev = null; Texas._tl = Platform.fx.timeline(root);
      // 進入遊戲的點擊就是使用者手勢：此時解鎖音效（iOS/Android 必要），並預載音檔
      Texas.sfx.unlock(); Texas.sfx.load();
      root.addEventListener('pointerdown', () => Texas.sfx.unlock(), { passive: true });
      const unpeek = () => Texas._ui && Texas._ui.held.classList.remove('peek');
      root.addEventListener('pointerup', unpeek); root.addEventListener('pointercancel', unpeek);
      if (opts && opts.online) { Texas._startOnline(opts); }
      else { Texas.O = null; Texas.newMatch('你'); }
    },
    unmount() { Platform.hud.unmount(); Texas._clearTimers(); Texas._clearFx(); Texas._root = null; Texas._ui = null; Texas.st = null; Texas.O = null; Texas._overShown = false; },
  });
}
