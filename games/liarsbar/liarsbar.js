/* 騙子酒吧 Liar's Bar — 單機 + AI
   牌庫 20 張：K×6 Q×6 A×6 Joker×2。每局桌牌為 K/Q/A 之一，Joker 萬用。
   輪到你：出 1–3 張蓋牌宣稱皆為桌牌，或喊「騙子」翻上家的牌。
   翻牌：有一張非桌牌/非Joker → 出牌者開槍；全合法 → 喊的人開槍。
   左輪 6 膛 1 實彈，中彈淘汰。最後存活者勝。 */
const LiarsBar = {
  // ---------- 純規則（可在 node 測試） ----------
  RANKS: ['K', 'Q', 'A'],
  makeDeck() {
    const d = [];
    for (const r of ['K', 'Q', 'A']) for (let i = 0; i < 6; i++) d.push({ r });
    for (let i = 0; i < 2; i++) d.push({ r: 'JOKER' });
    return d; // 20 張
  },
  isValid(card, tableRank) { return card.r === tableRank || card.r === 'JOKER'; },
  // 翻牌判定：cards 是否「全部合法」。lying = 有任一張不合法
  judge(cards, tableRank) {
    return { lying: cards.some(c => !this.isValid(c, tableRank)) };
  },
  // 左輪：6 膛、實彈在 live(0-5)，已擊發 fired 次。回傳是否中彈並推進
  makeGun() { return { live: Math.floor(Math.random() * 6), fired: 0 }; },
  pullTrigger(gun) { const hit = gun.fired === gun.live; gun.fired++; return hit; },

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },

  // ---------- 對局狀態 ----------
  st: null,
  _timers: [],
  _stage: null,

  _aliveIdx(from, includeSelf) {
    const p = this.st.players, n = p.length;
    for (let k = includeSelf ? 0 : 1; k <= n; k++) {
      const i = (from + k) % n;
      if (p[i].alive) return i;
    }
    return from;
  },
  _aliveCount() { return this.st.players.filter(p => p.alive).length; },

  newMatch(human = '你', styles = ['balanced', 'attack', 'defense']) {
    const names = [human, '阿牛', '小美', '老張'];
    const players = names.map((nm, i) => ({
      id: i, name: i === 0 ? human : names[i], isAI: i !== 0,
      alive: true, hand: [], gun: this.makeGun(),
      style: i === 0 ? null : styles[(i - 1) % styles.length],
    }));
    this.st = { players, tableRank: 'K', lastPlay: null, turn: 0, phase: 'play', log: [], roundNo: 0 };
    this.deal(0);
  },

  // 發新一局牌；starter = 起始玩家 index（會 normalize 到存活者）
  deal(starter) {
    const s = this.st;
    s.roundNo++;
    s.tableRank = this.RANKS[Math.floor(Math.random() * 3)];
    s.lastPlay = null;
    s.phase = 'play';
    s._reveal = null; s._shot = null; s._challenger = null;
    const deck = this.shuffle(this.makeDeck());
    s.players.forEach(p => { p.hand = []; });
    const alive = s.players.filter(p => p.alive);
    let di = 0;
    for (let c = 0; c < 5; c++) for (const p of alive) p.hand.push(deck[di++]);
    alive.forEach(p => p.hand.sort((a, b) => this._sortKey(a) - this._sortKey(b)));
    s.turn = s.players[starter] && s.players[starter].alive ? starter : this._aliveIdx(starter, true);
    this._dealtAt = Date.now(); // 發牌動畫期間電腦不出手（見 tick）
    this.log(`🍺 新一局：桌牌是 ${this.face(s.tableRank)}（共發 ${alive.length * 5} 張）`);
  },
  _sortKey(c) { return ({ K: 0, Q: 1, A: 2, JOKER: 3 })[c.r]; },
  face(r) { return r === 'JOKER' ? '★' : r; },

  log(msg) { this.st.log.unshift(msg); if (this.st.log.length > 6) this.st.log.pop(); },

  // ---------- 動作 ----------
  // 出牌：玩家 idx 打出 cards（hand 子集），宣稱皆為桌牌
  play(idx, cards) {
    const s = this.st, p = s.players[idx];
    cards.forEach(c => { const k = p.hand.indexOf(c); if (k >= 0) p.hand.splice(k, 1); });
    s.lastPlay = { by: idx, cards, count: cards.length };
    this.log(`${p.name} 蓋下 ${cards.length} 張，宣稱都是 ${this.face(s.tableRank)}`);
    this.nextTurn();
  },

  // 喊騙子：玩家 byIdx 質疑 lastPlay
  challenge(byIdx) {
    const s = this.st;
    if (!s.lastPlay) return;
    const lp = s.lastPlay, liarIdx = lp.by;
    const { lying } = this.judge(lp.cards, s.tableRank);
    const shooter = lying ? liarIdx : byIdx;
    s.phase = 'reveal';
    this.log(`${s.players[byIdx].name} 喊騙子！翻開：${lp.cards.map(c => this.face(c.r)).join(' ')}`);
    this.log(lying ? `❌ 是詐唬！${s.players[liarIdx].name} 開槍` : `✅ 全是真的！${s.players[byIdx].name} 喊錯，開槍`);
    s._reveal = lp.cards.slice();
    s._challenger = byIdx;
    if (this.render) this.render();
    this._after(3800, () => this.doShoot(shooter, byIdx)); // 等「騙子！」印章 + 翻牌演出
  },

  doShoot(shooterIdx, challengerIdx) {
    const s = this.st, p = s.players[shooterIdx];
    const hit = this.pullTrigger(p.gun);
    if (hit) {
      p.alive = false;
      this.log(`💥 砰！${p.name} 中彈淘汰（第 ${p.gun.fired} 槍）`);
    } else {
      this.log(`😮‍💨 喀！${p.name} 逃過一劫（已擊發 ${p.gun.fired}/6）`);
    }
    s._shot = { seat: shooterIdx, hit, fired: p.gun.fired }; // 觸發左輪開火動畫
    if (this.render) this.render();

    if (this._aliveCount() <= 1) {
      this._after(7000, () => { s._shot = null; s._reveal = null; this.endMatch(); }); // 等俄羅斯輪盤演出
      return;
    }
    // 下一局：開槍者若存活從他開始，否則從質疑者後一位存活者
    const starter = p.alive ? shooterIdx : this._aliveIdx(shooterIdx, false);
    this._after(7000, () => { s._shot = null; s._reveal = null; this.deal(starter); if (this.render) this.render(); this.tick(); });
  },

  nextTurn() {
    const s = this.st;
    s.turn = this._aliveIdx(s.turn, false);
    if (this.render) this.render();
    this.tick();
  },

  // 推進：若輪到 AI 就讓它行動；輪到人類則等 UI
  tick() {
    const s = this.st;
    if (!s || s.phase === 'over') return;
    const p = s.players[s.turn];
    if (!p.alive) { this.nextTurn(); return; }
    if (p.isAI) this._after(Math.max(1200 + Math.random() * 600, (this._dealtAt || 0) + 4300 - Date.now()), () => this.aiAct(s.turn));
  },

  // ---------- AI ----------
  // 估算「桌牌+Joker」在別人手上還有多少張（排除自己手牌與已翻開）
  _validUnseen(selfIdx) {
    const s = this.st;
    let total = 8; // 6 桌牌 + 2 joker
    const self = s.players[selfIdx];
    total -= self.hand.filter(c => this.isValid(c, s.tableRank)).length;
    return Math.max(0, total);
  },
  aiAct(idx) {
    const s = this.st;
    if (!s || s.phase !== 'play' || s.turn !== idx) return;
    const p = s.players[idx];
    const style = p.style || 'balanced';
    const valid = p.hand.filter(c => this.isValid(c, s.tableRank));
    const mustChallenge = p.hand.length === 0 && s.lastPlay;

    // 是否喊騙子
    if (s.lastPlay && s.lastPlay.by !== idx) {
      const claim = s.lastPlay.count;
      const unseen = this._validUnseen(idx); // 別人手上可能的合法牌上限
      let pChallenge;
      if (claim > unseen) pChallenge = 0.97;            // 數學上不可能為真
      else {
        const ratio = claim / Math.max(1, unseen);       // 宣稱越多越可疑
        const base = { attack: 0.45, balanced: 0.3, defense: 0.18 }[style];
        pChallenge = Math.min(0.9, base + ratio * 0.5);
        // 自己快沒牌、或對方槍膛快滿時略升攻擊
        if (s.players[s.lastPlay.by].gun.fired >= 4) pChallenge += 0.15;
      }
      if (mustChallenge || Math.random() < pChallenge) { this.challenge(idx); return; }
    }
    if (mustChallenge) { this.challenge(idx); return; }

    // 出牌：有合法牌就誠實出，否則詐唬
    let toPlay;
    if (valid.length > 0) {
      const honestProb = { attack: 0.7, balanced: 0.85, defense: 0.95 }[style];
      if (Math.random() < honestProb) {
        const n = Math.min(valid.length, 1 + Math.floor(Math.random() * Math.min(2, valid.length)));
        toPlay = valid.slice(0, n);
      } else {
        // 摻一張假的詐唬
        const fake = p.hand.find(c => !this.isValid(c, s.tableRank));
        toPlay = fake ? [valid[0], fake] : [valid[0]];
      }
    } else {
      // 全是假牌：被迫詐唬，出 1（保守）~2 張
      const n = Math.min(p.hand.length, style === 'attack' ? 2 : 1);
      toPlay = p.hand.slice(0, n);
    }
    this.play(idx, toPlay);
  },

  endMatch() {
    const s = this.st; s.phase = 'over';
    const winner = s.players.find(p => p.alive);
    this.log(`🏆 ${winner ? winner.name : '無人'} 是最後生還者！`);
    if (this.render) this.render();
    if (typeof Platform === 'undefined') return;
    const me = s.players[0];
    if (winner && winner.id === 0) Platform.audio && Platform.audio.win();
    else Platform.audio && Platform.audio.lose();
    Platform.ui.modal({
      title: winner && winner.id === 0 ? '🏆 你贏了！' : '☠️ 你出局了',
      html: `最後生還者：<b>${winner ? winner.name : '無'}</b>`,
      buttons: [
        { label: '再來一局', primary: true, onClick: (close) => { close(); this.restart(); } },
        { label: '回大廳', onClick: (close) => { close(); Platform.leave(); } },
      ],
    });
  },
  restart() {
    this._clearTimers();
    if (this.O && this.O.isHost) { this._hostStart(); return; } // 連線：房主重開
    this.newMatch(this._human); if (this.render) this.render(); this.tick();
  },

  // ---------- 計時器 ----------
  _after(ms, fn) { const t = setTimeout(fn, ms); this._timers.push(t); return t; },
  _clearTimers() { this._timers.forEach(clearTimeout); this._timers = []; },
};

// ---------- node 自測 ----------
if (typeof module !== 'undefined' && require.main === module) {
  const assert = require('assert');
  const L = LiarsBar;
  assert.strictEqual(L.makeDeck().length, 20, '牌庫 20 張');
  assert.strictEqual(L.makeDeck().filter(c => c.r === 'JOKER').length, 2, '2 Joker');
  assert.strictEqual(L.makeDeck().filter(c => c.r === 'K').length, 6, '6 K');
  // 判定真值表
  assert.deepStrictEqual(L.judge([{ r: 'K' }, { r: 'K' }], 'K').lying, false, 'KK 桌牌K 為真');
  assert.deepStrictEqual(L.judge([{ r: 'K' }, { r: 'JOKER' }], 'K').lying, false, 'K+Joker 為真');
  assert.deepStrictEqual(L.judge([{ r: 'K' }, { r: 'Q' }], 'K').lying, true, 'K+Q 桌牌K 為詐唬');
  assert.deepStrictEqual(L.judge([{ r: 'A' }], 'K').lying, true, 'A 桌牌K 為詐唬');
  // 左輪：6 槍內必中且只中一次
  const g = L.makeGun(); let hits = 0; for (let i = 0; i < 6; i++) if (L.pullTrigger(g)) hits++;
  assert.strictEqual(hits, 1, '6 膛 1 實彈');
  console.log('✅ LiarsBar 自測通過');
}
if (typeof module !== 'undefined') module.exports = LiarsBar;

// ---------- 連線（host 權威）----------
if (typeof Platform !== 'undefined') {
  // 對賓客遮蔽：只給自己的手牌實值，他人只給張數；蓋牌堆只給張數；翻開的牌公開
  LiarsBar._redact = function (seat) {
    const s = this.st;
    return JSON.parse(JSON.stringify({
      players: s.players.map((p, i) => ({
        id: p.id, name: p.name, alive: p.alive, isAI: p.isAI,
        hand: i === seat ? p.hand : p.hand.map(() => ({ hidden: true })),
        gun: { fired: p.gun.fired },
      })),
      tableRank: s.tableRank, turn: s.turn, phase: s.phase, log: s.log, roundNo: s.roundNo,
      lastPlay: s.lastPlay ? { by: s.lastPlay.by, count: s.lastPlay.count } : null,
      _reveal: s._reveal || null, _shot: s._shot || null, _challenger: s._challenger,
    }));
  };
  LiarsBar._push = function () {
    const O = this.O; if (!O || !O.isHost || !O.started) return;
    for (const seat in O.peerOf) Platform.net.sendTo(O.peerOf[seat], 'state', { st: this._redact(+seat), seat: +seat });
  };

  LiarsBar._newMatchOnline = function () {
    const styles = ['attack', 'balanced', 'defense'];
    const players = [0, 1, 2, 3].map(i => {
      const occupied = i === 0 || this.O.names[i] != null;
      return {
        id: i, name: this.O.names[i] || (['', '阿牛', '小美', '老張'][i]),
        isAI: !occupied, _remote: occupied && i !== 0,
        alive: true, hand: [], gun: this.makeGun(), style: i === 0 ? null : styles[(i - 1) % 3],
      };
    });
    this.st = { players, tableRank: 'K', lastPlay: null, turn: 0, phase: 'play', log: [], roundNo: 0 };
    this._overShown = false;
    this.deal(0);
  };
  LiarsBar._hostStart = function () {
    this.O.started = true;
    this._newMatchOnline();
    for (const seat in this.O.peerOf) Platform.net.sendTo(this.O.peerOf[seat], 'start', { seat: +seat });
    this.render(); this.tick();
  };

  LiarsBar._setupHostNet = function () {
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
        const p = this.st.players[seat]; p.isAI = true; p._remote = false; this.log(`${p.name} 離線，改由電腦接手`);
        if (this.st.turn === seat && this.st.phase === 'play') this.tick();
        this.render();
      } else this._renderRoom();
      Platform.net.broadcast('lobby', { names: this.O.names });
    });
    Platform.net.on('act', (d, from) => {
      const seat = this.O.seatOf[from];
      if (seat == null || !this.st || this.st.turn !== seat || this.st.phase !== 'play') return;
      if (d.kind === 'challenge') { if (this.st.lastPlay && this.st.lastPlay.by !== seat) this.challenge(seat); return; }
      if (d.kind === 'play') {
        const idx = [...new Set(Array.isArray(d.cards) ? d.cards : [])].filter(i => Number.isInteger(i) && i >= 0 && i < this.st.players[seat].hand.length); // 去重+整數，防重複 index 作弊/非整數卡死
        if (idx.length < 1 || idx.length > 3) return;
        this.play(seat, idx.map(i => this.st.players[seat].hand[i]));
      }
    });
  };
  LiarsBar._setupGuestNet = function () {
    Platform.net.on('welcome', d => { this.O.mySeat = d.seat; this._renderRoom(); });
    Platform.net.on('lobby', d => { this.O.names = d.names; this._renderRoom(); });
    Platform.net.on('start', d => { if (d && d.seat != null) this.O.mySeat = d.seat; this.O.started = true; if (this._overModal) { this._overModal.close(); this._overModal = null; } });
    Platform.net.on('state', d => {
      this.st = d.st; this.O.mySeat = d.seat; this.O.started = true;
      if (this.st.phase !== 'over') this._overShown = false;
      this.render();
      if (this.st.phase === 'over') this._maybeOver();
    });
    Platform.net.on('full', () => { Platform.toast('房間已滿或已開始'); Platform.exit(); });
    Platform.net.on('_close', () => { if (!this._root) return; Platform.toast('房主已離線'); Platform.exit(); }); // 賓客只連房主
  };

  LiarsBar._startOnline = function (opts) {
    const name = Platform.store.get('arcade_name', '') || (opts.join ? '賓客' : '房主');
    this.O = { isHost: !opts.join, mySeat: opts.join ? -1 : 0, seatOf: {}, peerOf: {}, names: [null, null, null, null], started: false };
    this._renderRoom('連線中…');
    Platform.net.init(name).then(() => {
      if (this.O.isHost) { Platform.net.createRoom(); this.O.names[0] = name; this._setupHostNet(); this._renderRoom(); }
      else { this._setupGuestNet(); Platform.net.joinRoom(opts.join.host); this._renderRoom(); }
    }).catch(e => { Platform.toast('連線失敗：' + (e.message || e)); Platform.exit(); });
  };

  LiarsBar._renderRoom = function () {
    if (!this._root || !this.O || this.O.started) return;
    Platform.net.renderRoom(this._root, this.O, '🍺 騙子酒吧', () => this._hostStart());
  };
  LiarsBar._maybeOver = function () {
    if (this._overShown) return; this._overShown = true;
    const s = this.st, winner = s.players.find(p => p.alive);
    const meWin = winner && winner.id === this.O.mySeat;
    Platform.audio && (meWin ? Platform.audio.win() : Platform.audio.lose());
    this._overModal = Platform.ui.modal({
      title: meWin ? '🏆 你贏了！' : '☠️ 遊戲結束',
      html: `最後生還者：<b>${winner ? winner.name : '無'}</b>`,
      buttons: [{ label: '回大廳', primary: true, onClick: c => { c(); Platform.leave(); } }],
    });
  };

  // ================= 畫面層 v2（西部酒館）：骨架只建一次，依「前後狀態差異」觸發動畫與音效 =================
  // 動畫/音效純裝飾：DOM 最終狀態同步寫入，不依賴動畫結束回呼；唯一刻意延後的是開槍結果（輪盤轉完才揭曉）
  const ini = nm => { const ch = [...(nm || '?')]; const last = ch[ch.length - 1]; return /[一-鿿]/.test(last) ? last : ch[0].toUpperCase(); };
  const faceOf = r => r === 'JOKER' ? '★' : r;
  const cardHTML = (r, cls = '', st = '') => `<div class="lb-card ${r === 'JOKER' ? 'joker' : ''} ${cls}" style="${st}"><span>${faceOf(r)}</span><i class="lb-cback"></i></div>`;
  const backHTML = (cls = '', st = '') => `<div class="lb-card back ${cls}" style="${st}"></div>`;
  const ROULETTE_OUT = 4300; // 開輪盤 → 揭曉結果的時間（ms）

  // ---------- 音效：全部為 CC0 實錄（來源見 games/liarsbar/audio/CREDITS.txt）；播放器在 core/fx.js ----------
  LiarsBar.sfx = Object.assign(Platform.fx.sampler('games/liarsbar/audio/', {
    ambience: 'ambience.mp3', 'shot-1': 'shot-1.wav', 'shot-2': 'shot-2.wav', 'cock-1': 'cock-1.mp3', 'cock-2': 'cock-2.mp3', click: 'click.mp3',
    'toast-1': 'toast-1.mp3', 'toast-2': 'toast-2.mp3', 'slam-1': 'slam-1.wav', 'slam-2': 'slam-2.wav', 'slam-3': 'slam-3.wav',
    'glass-1': 'glass-1.wav', 'glass-2': 'glass-2.wav', 'glass-3': 'glass-3.wav', shuffle: 'card-shuffle.wav',
    'slide-1': 'card-slide-1.wav', 'slide-2': 'card-slide-2.wav', 'slide-3': 'card-slide-3.wav',
    'place-1': 'card-place-1.wav', 'place-2': 'card-place-2.wav', 'place-3': 'card-place-3.wav', shove: 'card-shove-1.wav',
  }), {
    // 轉輪盤：擊錘「喀」聲連續剪接，間隔由快到慢
    spin(dur = 2) { let t = 0, gap = .035; while (t < dur) { this.play('click', { when: t, gain: .35, rate: 1.7 }); t += gap; gap *= 1.09; } },
  });

  // ---------- 左輪 SVG（側面）與彈巢正面 ----------
  const GUN_SVG = `<svg viewBox="0 0 260 130" aria-hidden="true">
    <defs><linearGradient id="lbgm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd3d8"/><stop offset=".45" stop-color="#8a9097"/><stop offset="1" stop-color="#3d4248"/></linearGradient>
      <linearGradient id="lbgw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a4a22"/><stop offset="1" stop-color="#3e1d0b"/></linearGradient></defs>
    <rect x="120" y="36" width="132" height="15" rx="3" fill="url(#lbgm)"/><rect x="244" y="30" width="6" height="7" rx="1" fill="#5c6168"/>
    <rect x="150" y="53" width="86" height="7" rx="3" fill="url(#lbgm)"/>
    <path d="M58 30 L124 30 L124 64 L104 74 L66 74 L50 60 Z" fill="url(#lbgm)"/>
    <rect x="72" y="26" width="52" height="44" rx="9" fill="url(#lbgm)" stroke="#2c3036"/>
    <g stroke="#3a3f45" stroke-width="2"><line x1="80" y1="30" x2="80" y2="66"/><line x1="92" y1="30" x2="92" y2="66"/><line x1="104" y1="30" x2="104" y2="66"/><line x1="116" y1="30" x2="116" y2="66"/></g>
    <g class="lb-hammer"><path d="M60 34 L70 26 L58 12 L50 16 L56 26 Z" fill="#6b7178" stroke="#2c3036"/></g>
    <path d="M74 74 C74 92 98 96 104 76" fill="none" stroke="url(#lbgm)" stroke-width="5"/>
    <path d="M86 74 C86 84 90 88 92 82" fill="none" stroke="#3d4248" stroke-width="5" stroke-linecap="round"/>
    <path d="M50 58 L66 74 L48 122 C40 128 18 124 14 116 L34 66 Z" fill="url(#lbgw)" stroke="#2a1306"/>
    <circle cx="38" cy="96" r="3" fill="#d8b15a"/></svg>`;
  const cylSVG = fired => {
    const ch = [0, 1, 2, 3, 4, 5].map(k => { const a = (k * 60 - 90) * Math.PI / 180, x = Math.cos(a) * 34, y = Math.sin(a) * 34;
      return `<g class="lb-ch" data-k="${k}"><circle cx="${x}" cy="${y}" r="13" fill="#0b0b0b" stroke="#555" stroke-width="1.5"/>
        ${k < fired ? '' : `<circle cx="${x}" cy="${y}" r="10.5" fill="url(#lbbr)"/><circle cx="${x}" cy="${y}" r="3.5" fill="#b9a46a" stroke="#6b5420"/>`}</g>`; }).join('');
    const fl = [0, 1, 2, 3, 4, 5].map(k => { const a = (k * 60 - 60) * Math.PI / 180, x = Math.cos(a) * 51, y = Math.sin(a) * 51;
      return `<ellipse cx="${x}" cy="${y}" rx="5" ry="9" transform="rotate(${k * 60 + 30} ${x} ${y})" fill="#2a2d31"/>`; }).join('');
    return `<svg viewBox="-70 -78 140 148" aria-hidden="true"><defs>
      <radialGradient id="lbcm" cx=".4" cy=".35"><stop offset="0" stop-color="#d9dde2"/><stop offset=".6" stop-color="#7d838a"/><stop offset="1" stop-color="#3a3e43"/></radialGradient>
      <radialGradient id="lbbr" cx=".4" cy=".35"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".6" stop-color="#c9952e"/><stop offset="1" stop-color="#7a5313"/></radialGradient></defs>
      <path d="M0 -76 L-9 -62 L9 -62 Z" fill="#c8372d"/>
      <g class="lb-rot"><circle r="58" fill="url(#lbcm)" stroke="#24272b" stroke-width="2"/>${fl}${ch}<circle r="9" fill="#2a2d31" stroke="#888"/></g></svg>`;
  };

  // ---------- 小工具：時間軸在 core/fx.js（mount 時建立 this._tl）----------
  LiarsBar._fx = function (fn, ms) { this._tl.after(fn, ms); };
  LiarsBar._clearFx = function () { if (this._tl) this._tl.clear(); };
  LiarsBar._fly = function (from, to, html, dur, delay) { this._tl.fly(from, to, html, dur, delay, [-8, Math.random() * 30 - 15]); };
  const restart = (el, c) => Platform.fx.restart(el, c);
  LiarsBar._say = function (k, txt, cls = '') { const b = this._ui.bub[k]; b.textContent = txt; b.className = 'lb-bub ' + cls; restart(b, 'pop'); };
  LiarsBar._pileAdd = function (n, delay) {
    const pile = this._ui.pile;
    for (let j = 0; j < n; j++) {
      const k = pile.children.length;
      pile.insertAdjacentHTML('beforeend', backHTML('in', `--d:${delay + j * 160}ms;translate:calc(-50% + ${(k % 6) * 9 - 22}px) calc(-50% + ${(k % 2) * 4}px);rotate:${(k * 37 % 24) - 12}deg`));
    }
  };

  // ---------- 骨架 ----------
  LiarsBar._build = function () {
    const root = this._root;
    const seat = p => `<div class="lb-seat" data-p="${p}"><div class="lb-ava"><span class="lb-ini"></span></div>
      <div class="lb-meta"><div class="lb-nm"></div><div class="lb-cnt"><b>0</b> 張</div><div class="lb-cyl"></div></div><div class="lb-bub"></div></div>`;
    root.innerHTML = `<div class="lb-app">
      <header class="lb-top">
        <div class="lb-brand">騙子酒吧</div>
        <div class="lb-info">第 <b class="lb-rno">1</b> 巡</div>
        <button class="lb-ibtn lb-snd" aria-label="音效開關"></button>
        <button class="lb-ibtn lb-logbtn" aria-label="牌局紀錄">☰</button>
      </header>
      <main class="lb-stage">
        ${seat(1)}${seat(2)}${seat(3)}
        <div class="lb-center">
          <div class="lb-tlabel">本局桌牌</div>
          <div class="lb-tcard-wrap"></div>
          <div class="lb-pile"></div>
          <div class="lb-claim" aria-live="polite"></div>
        </div>
        <div class="lb-gunrest">${GUN_SVG}</div>
        <div class="lb-deck"></div>
        <div class="lb-log" aria-label="牌局紀錄"></div>
        <div class="lb-stamp" aria-hidden="true">騙子！</div>
      </main>
      <section class="lb-dock" aria-label="你的手牌與行動">
        <div class="lb-me"><div class="lb-ava"><span class="lb-ini"></span></div><div class="lb-nm"></div><div class="lb-cyl"></div><div class="lb-bub"></div></div>
        <div class="lb-hand"></div>
        <div class="lb-acts"><div class="lb-tip" aria-live="polite"></div>
          <button class="lb-act play" disabled>蓋牌宣稱</button><button class="lb-act liar" disabled>騙子！</button></div>
      </section>
      <div class="lb-rl" role="dialog" aria-label="俄羅斯輪盤" aria-hidden="true"><div class="lb-rl-box">
        <div class="lb-rl-who" aria-live="assertive"></div><div class="lb-rl-cyl"></div><div class="lb-rl-gun">${GUN_SVG}</div><div class="lb-rl-msg" aria-live="assertive"></div>
      </div></div>
      <div class="lb-flash"></div>
    </div>`;
    const q = s => root.querySelector(s);
    const U = this._ui = {
      app: q('.lb-app'), stage: q('.lb-stage'), rno: q('.lb-rno'), tcard: q('.lb-tcard-wrap'), pile: q('.lb-pile'), claim: q('.lb-claim'), deck: q('.lb-deck'), log: q('.lb-log'),
      stamp: q('.lb-stamp'), hand: q('.lb-hand'), tip: q('.lb-tip'), play: q('.lb-act.play'), liar: q('.lb-act.liar'), snd: q('.lb-snd'),
      rl: q('.lb-rl'), rlWho: q('.lb-rl-who'), rlCyl: q('.lb-rl-cyl'), rlGun: q('.lb-rl-gun'), rlMsg: q('.lb-rl-msg'), flash: q('.lb-flash'),
      seat: [q('.lb-me'), ...[1, 2, 3].map(p => q(`.lb-seat[data-p="${p}"]`))],
    };
    U.ava = U.seat.map(e => e.querySelector('.lb-ava')); U.bub = U.seat.map(e => e.querySelector('.lb-bub')); U.cyl = U.seat.map(e => e.querySelector('.lb-cyl'));
    this._prev = null; this._pend = null; this._handKey = ''; this._sel = new Set();
    if (this._3d) { this._3d.dispose(); this._3d = null; } this._3dp = null;
    const sndIcon = () => { const on = Platform.audio.enabled; U.snd.textContent = on ? '🔊' : '🔇'; U.snd.setAttribute('aria-pressed', String(on)); };
    sndIcon();
    U.snd.onclick = () => { Platform.audio.setEnabled(!Platform.audio.enabled); sndIcon(); this.sfx.ambience(Platform.audio.enabled); };
    q('.lb-logbtn').onclick = () => U.log.classList.toggle('open');
  };

  // ---------- 3D 角色（lb3d.js 動態載入；WebGL／CDN 失敗就維持 2D 畫面＋輪盤）----------
  const KIND_OF = ['fox', 'pig', 'bull', 'dog']; // 依玩家編號固定角色：連線各端同一位玩家是同一隻
  LiarsBar._load3d = function () {
    if (this._3dp) return;
    const root = this._root, U = this._ui, me = this.O ? this.O.mySeat : 0;
    this._3dp = import(new URL('games/liarsbar/lb3d.js', document.baseURI).href).then(m => {
      if (this._root !== root || this._ui !== U) return;                         // 載入期間已離開／重建
      this._3d = m.createStage(U.stage, { kinds: [0, 1, 2, 3].map(k => KIND_OF[(k + me) % 4]), cards: false,
        sfx: k => this.sfx.play(k, { gain: .8 }), onFlash: () => restart(U.flash, 'go') });
      U.app.classList.add('three'); this._3d.setIdle(true); this._sync3d();
    }).catch(e => console.warn('3D 載入失敗，維持 2D', e));
  };
  // 角色生死與狀態對齊遊戲（動畫中不打斷；開槍結果揭曉前不提早倒下）
  LiarsBar._sync3d = function (force) {
    const T = this._3d; if (!T || !this.st) return;
    const me = this.O ? this.O.mySeat : 0, N = this.st.players.length;
    this.st.players.forEach((p, i) => {
      const k = (i - me + N) % N, a = T.actors[k]; if (!k || !a) return;
      a.tense = p.gun.fired >= 4;
      if (force || (!a.busy && p.alive !== a.alive && !(this._pend && this._pend.seat === i))) T.setDead(k, !p.alive);
    });
  };
  // 開槍：角色舉槍抵太陽穴發抖（自己 = 第一人稱槍），ROULETTE_OUT 時揭曉：中彈倒地／空膛鬆一口氣
  LiarsBar._shot3d = function (k, hit, onReveal, name) {
    const T = this._3d, U = this._ui;
    if (k) T.act(k, 'aim'); else T.fpGun('aim');
    [1, 2, 3].forEach(j => { if (j !== k) T.look(j, k || 'me'); });           // 大家盯著開槍的人
    this._fx(() => {
      if (k) T.act(k, hit ? 'fireHit' : 'fireMiss'); else T.fpGun(hit ? 'hit' : 'miss');
      if (hit) restart(U.app, 'shake'); else this.sfx.play('glass', { gain: .5, when: 1.2 });
      U.claim.textContent = hit ? `砰！${name} 中彈` : `喀…${name} 空膛`;     // 讀屏播報（2D 輪盤原本有 aria-live）
      onReveal();
    }, ROULETTE_OUT);
    this._fx(() => [1, 2, 3].forEach(j => T.look(j, null)), ROULETTE_OUT + 2500);
  };

  // ---------- 俄羅斯輪盤演出：開槍結果在 ROULETTE_OUT 後才揭曉 ----------
  LiarsBar._roulette = function (k, name, firedBefore, hit, onReveal) {
    const U = this._ui, sfx = this.sfx;
    U.rlWho.textContent = `${name} 扣下扳機`; const sm = document.createElement('small'); sm.textContent = `已擊發 ${firedBefore} / 6 膛`; U.rlWho.append(sm);
    U.rlCyl.innerHTML = cylSVG(firedBefore); U.rlMsg.textContent = ''; U.rlMsg.className = 'lb-rl-msg';
    U.rl.classList.add('on'); U.rl.setAttribute('aria-hidden', 'false'); sfx.duck(.04, .5);
    const rot = U.rlCyl.querySelector('.lb-rot'), hammer = U.rlGun.querySelector('.lb-hammer');
    this._fx(() => { sfx.spin(2); rot.style.transform = `rotate(${-(firedBefore * 60) - 1080}deg)`; }, 600);
    this._fx(() => { hammer.classList.add('cocked'); sfx.play('cock', { gain: 1, jitter: false }); }, 2900);
    this._fx(() => {
      hammer.classList.remove('cocked');
      const ch = U.rlCyl.querySelector(`.lb-ch[data-k="${firedBefore}"]`);
      if (hit) {
        sfx.play('shot', { gain: 1, jitter: false }); restart(U.flash, 'go'); restart(U.app, 'shake');
        if (ch) ch.querySelector('circle').setAttribute('fill', '#ff3b2f');
        U.rlMsg.textContent = '砰！'; U.rlMsg.className = 'lb-rl-msg bang';
      } else {
        sfx.play('click', { gain: 1, jitter: false });
        if (ch) [...ch.querySelectorAll('circle')].slice(1).forEach(c => c.remove());
        U.rlMsg.textContent = '喀…空膛'; U.rlMsg.className = 'lb-rl-msg click';
      }
      onReveal();
    }, ROULETTE_OUT);
    this._fx(() => { U.rl.classList.remove('on'); U.rl.setAttribute('aria-hidden', 'true'); sfx.duck(.32, 1.2); if (!hit) sfx.play('glass', { gain: .5 }); }, ROULETTE_OUT + 1900);
  };

  // ---------- 主渲染 ----------
  LiarsBar.render = function () {
    const root = this._root; if (!root) return;
    const O = this.O;
    if (O && !O.started) { this._renderRoom(); return; }
    const s = this.st; if (!s) return;
    if (!root.querySelector('.lb-app')) this._build();
    this._load3d();
    const U = this._ui, me = O ? O.mySeat : 0, pl = s.players, N = pl.length, isHost = !O || O.isHost;
    const pos = i => (i - me + N) % N; // 0 自己（下）、1 右、2 上、3 左
    const P = this._prev, newRound = !P || P.round !== s.roundNo, mine = pl[me];
    const total = pl.reduce((a, p) => a + p.hand.length, 0);
    let t = 0;
    const pendNow = () => this._pend && Date.now() < this._pend.until ? this._pend : null; // 開槍結果尚未揭曉（即時讀，本次渲染中途可能才登記）
    const pend = pendNow();

    U.rno.textContent = s.roundNo;
    // ---- 座位：名字、張數、彈膛、存活（揭曉前沿用開槍前狀態）----
    const paintSeat = i => {
      const pend = pendNow(), k = pos(i), p = pl[i], hold = pend && pend.seat === i;
      U.seat[k].querySelector('.lb-ini').textContent = ini(p.name);
      U.seat[k].querySelector('.lb-nm').textContent = p.name;
      const fired = hold ? pend.fired - 1 : p.gun.fired;
      U.cyl[k].innerHTML = [0, 1, 2, 3, 4, 5].map(c => `<i class="${c < fired ? 'fired' : ''}"></i>`).join('');
      U.cyl[k].title = `已擊發 ${fired}/6`;
      U.seat[k].classList.toggle('dead', hold ? false : !p.alive);
      U.seat[k].classList.toggle('warn', fired >= 4);
      if (k) U.seat[k].querySelector('.lb-cnt b').textContent = p.hand.length;
    };
    pl.forEach((p, i) => paintSeat(i));

    if (newRound) {
      // ---- 新一巡：清桌 → 洗牌 → 逐張發牌 → 翻桌牌 → 自己的牌翻面 ----
      this._clearFx(); this._pend = null; this._handKey = ''; this._sel = new Set();
      if (this._3d) { [1, 2, 3].forEach(j => this._3d.look(j, null)); this._3d.fpGun('off'); this._sync3d(true); } // 新一巡：全部歸位（分頁在背景時動畫可能沒跑完）
      U.pile.innerHTML = ''; U.claim.textContent = '把牌蓋上，賭一張嘴。';
      U.bub.forEach(b => { b.className = 'lb-bub'; });
      U.rl.classList.remove('on'); U.rl.setAttribute('aria-hidden', 'true');
      U.tcard.innerHTML = backHTML('lb-tcard');
      this.sfx.play('shuffle', { gain: .7 }); if (!P) this.sfx.play('toast', { gain: .45, when: .2 });
      const order = []; for (let k = 1; k <= N; k++) { const i = (s.turn + k - 1) % N; if (pl[i].alive && pl[i].hand.length) order.push(i); }
      let d = 1000; const mineAt = [];
      for (let c = 0; c < 5; c++) order.forEach(i => {
        if (pos(i) === 0) mineAt.push(d);
        this._fly(U.deck, pos(i) ? U.ava[pos(i)] : U.hand, backHTML('', '--w:44px'), 280, d);
        this.sfx.play('slide', { gain: .4, when: d / 1000 }); d += 110;
      });
      const flipT = d + 450;
      this._handKey = mine.hand.map(c => c.r).join() + '#' + s.roundNo;
      U.hand.innerHTML = mine.alive ? mine.hand.map((c, j) => cardHTML(c.r, 'deal', `--d:${(mineAt[j] || d) + 280}ms;--t:${flipT + j * 80}ms`)).join('') : '';
      this._fx(() => { U.tcard.innerHTML = cardHTML(s.tableRank, 'lb-tcard flip'); this.sfx.play('place', { gain: .9 }); }, flipT + 500);
      this.sfx.play('place', { gain: .5, when: flipT / 1000 });
      t = flipT + 900;
      this.sfx.ambience(true);
    } else {
      // ---- 有人出牌：全場手牌總數變少 ----
      const dec = P.total - total;
      if (dec > 0 && s.lastPlay) {
        const by = s.lastPlay.by, k = pos(by);
        U.bub.forEach(b => { if (!b.classList.contains('liar')) b.className = 'lb-bub'; });
        for (let j = 0; j < dec; j++) { this._fly(k ? U.ava[k] : U.hand, U.pile, backHTML('', '--w:44px'), 380, j * 160); this.sfx.play(k ? 'place' : 'shove', { gain: .7, when: j * .16 }); }
        this._pileAdd(dec, 380);
        this._say(k, `${dec} 張 ${faceOf(s.tableRank)}`);
        if (this._3d && k) this._3d.act(k, 'play');
        U.claim.textContent = `「這 ${dec} 張，都是 ${faceOf(s.tableRank)}」— ${pl[by].name}`;
        t = 380 + dec * 160;
      }
      // ---- 喊騙子：拍桌 + 印章，逐張翻開上一手 ----
      if (s._reveal && !P.reveal) {
        const ch = s._challenger, cards = s._reveal, rank = s.tableRank;
        this._say(pos(ch), '騙子！', 'liar');
        if (this._3d) { const ck = pos(ch); if (ck) this._3d.act(ck, 'liar'); [1, 2, 3].forEach(j => { if (j !== ck) this._3d.look(j, ck || 'me'); }); } // 拍桌；其他人（含被指控的）看向喊的人
        this.sfx.play('slam', { gain: 1 }); restart(U.stamp, 'show'); restart(U.app, 'shake'); this.sfx.duck(.08, .3);
        let kids = [...U.pile.children]; if (kids.length < cards.length) { this._pileAdd(cards.length - kids.length, 0); kids = [...U.pile.children]; }
        const last = kids.slice(-cards.length);
        let lying = false;
        cards.forEach((c, j) => {
          const ok = c.r === rank || c.r === 'JOKER'; lying = lying || !ok;
          this._fx(() => { const el = last[j]; el.outerHTML = cardHTML(c.r, `flip ${ok ? 'good' : 'bad'}`, el.getAttribute('style').replace(/--d:[^;]*;?/, '')); this.sfx.play('place', { gain: .8 }); }, 1200 + j * 450);
        });
        const liarName = s.lastPlay ? pl[s.lastPlay.by].name : '';
        this._fx(() => { U.claim.textContent = lying ? `${liarName} 說謊！` : `全是真的！${pl[ch].name} 喊錯了`; this.sfx.duck(.32, 1); }, 1200 + cards.length * 450 + 200);
      }
      // ---- 開槍：俄羅斯輪盤演出，結果延後揭曉 ----
      if (s._shot && !P.shot) {
        const sh = s._shot, i = sh.seat;
        this._pend = { seat: i, fired: sh.fired, until: Date.now() + ROULETTE_OUT + 50 };
        paintSeat(i);
        const reveal = () => { this._pend = null; paintSeat(i); this._paintLog(); };
        if (this._3d) this._shot3d(pos(i), sh.hit, reveal, pl[i].name); else this._roulette(pos(i), pl[i].name, sh.fired - 1, sh.hit, reveal);
      }
    }

    // ---- 自己的手牌（手牌內容變了才重建；發牌時已建好）----
    const key = mine.hand.map(c => c.r).join() + '#' + s.roundNo;
    if (key !== this._handKey) {
      this._handKey = key; this._sel = new Set();
      U.hand.innerHTML = mine.alive ? mine.hand.map(c => cardHTML(c.r)).join('') : '<div class="lb-dead-note">你已出局——留下來看戲。</div>';
    }
    U.seat[0].querySelector('.lb-ini').textContent = ini(mine.name);

    // ---- 輪到誰 + 操作 ----
    const myTurn = s.turn === me && s.phase === 'play' && mine.alive;
    const canLiar = myTurn && s.lastPlay && s.lastPlay.by !== me;
    const turnTo = s.phase === 'play' ? s.turn : -1;
    // 文案在渲染當下算好；延後執行時若已有更新的渲染，舊的直接作廢（避免舊排程讀到新狀態）
    const meShown = mine.alive || !!(pendNow() && pendNow().seat === me); // 自己中彈：揭曉前不提早清空提示
    const tip = !meShown || s.phase === 'over' ? '' : !myTurn ? (s.phase === 'reveal' ? '攤牌了…' : `等 ${pl[s.turn].name} 出手…`)
      : !mine.hand.length ? '沒牌了，只能喊騙子' : `選 1–3 張，宣稱都是 ${faceOf(s.tableRank)}；不信就喊騙子`;
    const tok = this._turnTok = (this._turnTok || 0) + 1;
    const applyTurn = () => {
      if (tok !== this._turnTok) return;
      U.seat.forEach(e => e.classList.remove('turn'));
      if (turnTo >= 0 && pl[turnTo]) U.seat[pos(turnTo)].classList.add('turn');
      if (this._3d && turnTo >= 0 && !this._pend) { const tk = pos(turnTo); [1, 2, 3].forEach(j => this._3d.look(j, j === tk ? null : tk || 'me')); }
      U.app.classList.toggle('myturn', myTurn);
      U.tip.textContent = tip;
      U.liar.disabled = !canLiar; U.liar.classList.toggle('hint', !!canLiar);
      this._paintPlay();
    };
    t ? this._fx(applyTurn, t) : applyTurn();

    const send = (kind, cards) => {
      U.play.disabled = U.liar.disabled = true; U.app.classList.remove('myturn');
      if (kind === 'liar') { if (isHost) this.challenge(me); else Platform.net.sendHost('act', { kind: 'challenge' }); }
      else { if (isHost) this.play(me, cards.map(j => mine.hand[j])); else Platform.net.sendHost('act', { kind: 'play', cards }); }
    };
    U.liar.onclick = () => { if (canLiar) { this._sel = new Set(); send('liar'); } };
    U.play.onclick = () => { if (!myTurn || this._sel.size < 1) return; const idx = [...this._sel].sort((a, b) => a - b); this._sel = new Set(); send('play', idx); };
    [...U.hand.querySelectorAll('.lb-card')].forEach((el, j) => {
      el.setAttribute('aria-label', `手牌 ${faceOf(mine.hand[j].r)}`);
      if (!myTurn) { el.removeAttribute('role'); el.removeAttribute('tabindex'); el.onclick = el.onkeydown = null; return; }
      el.setAttribute('role', 'button'); el.tabIndex = 0;
      const toggle = () => {
        if (!U.app.classList.contains('myturn')) return;
        if (this._sel.has(j)) this._sel.delete(j); else { if (this._sel.size >= 3) return Platform.toast('最多蓋 3 張'); this._sel.add(j); }
        this.sfx.play('slide', { gain: .25, rate: 1.3 }); this._paintPlay();
      };
      el.onclick = toggle; el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } };
    });

    if (!pend && !(s._shot && P && !P.shot)) this._paintLog();
    if (this._3d && s.phase === 'over' && P && P.phase !== 'over') { const w = pl.findIndex(p => p.alive); if (w >= 0 && pos(w)) this._fx(() => this._3d.act(pos(w), 'cheer'), 600); }
    this._sync3d();
    this._prev = { round: s.roundNo, total, reveal: !!s._reveal, shot: !!s._shot, phase: s.phase };
    this._push(); // host 同步狀態給賓客
  };
  // 手牌選取外觀 + 「蓋牌宣稱」按鈕文字
  LiarsBar._paintPlay = function () {
    const U = this._ui, myTurn = U.app.classList.contains('myturn'), n = this._sel.size, r = faceOf(this.st.tableRank);
    [...U.hand.querySelectorAll('.lb-card')].forEach((el, j) => { el.classList.toggle('sel', this._sel.has(j)); el.setAttribute('aria-pressed', String(this._sel.has(j))); });
    U.hand.classList.toggle('locked', !myTurn);
    U.play.disabled = !(myTurn && n >= 1); U.play.textContent = n ? `蓋 ${n} 張，宣稱是 ${r}` : '蓋牌宣稱';
  };
  // 紀錄（純文字寫入：玩家名稱可能來自連線賓客輸入）
  LiarsBar._paintLog = function () {
    const U = this._ui; if (!U || !this.st) return;
    U.log.replaceChildren(...this.st.log.slice(0, 5).map(l => { const d = document.createElement('div'); d.textContent = l; return d; }));
  };

  Platform.register({
    id: 'liarsbar', name: '騙子酒吧', icon: '🍺',
    desc: '吹牛、抓謊、左輪淘汰', players: { min: 2, max: 4 },
    online: true,
    settings: [], // 只有暱稱
    mount(stage, opts) {
      LiarsBar._stage = stage;
      const root = document.createElement('div');
      root.id = 'lb-root'; root.className = 'lb-root';
      stage.appendChild(root);
      LiarsBar._root = root; LiarsBar._human = '你'; LiarsBar._sel = new Set(); LiarsBar._overShown = false; LiarsBar._prev = null; LiarsBar._tl = Platform.fx.timeline(root);
      // 進場點擊即使用者手勢：解鎖音效（iOS/Android 必要）並預載；環境音載入後才開始
      LiarsBar.sfx.unlock(); LiarsBar.sfx.load().then(() => { if (LiarsBar._root && LiarsBar.st) LiarsBar.sfx.ambience(true); });
      root.addEventListener('pointerdown', () => LiarsBar.sfx.unlock(), { passive: true });
      if (opts && opts.online) { LiarsBar._startOnline(opts); }
      else { LiarsBar.O = null; LiarsBar.newMatch('你'); LiarsBar.render(); LiarsBar.tick(); }
    },
    unmount() { if (LiarsBar._3d) { LiarsBar._3d.dispose(); LiarsBar._3d = null; } LiarsBar._3dp = null; LiarsBar._clearTimers(); LiarsBar._clearFx(); LiarsBar.sfx.ambience(false); LiarsBar._root = null; LiarsBar._ui = null; LiarsBar.st = null; LiarsBar._reveal = null; LiarsBar.O = null; LiarsBar._overShown = false; },
  });
}

