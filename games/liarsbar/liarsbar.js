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
    if (typeof Platform !== 'undefined') Platform.audio && Platform.audio.deal();
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
    this._after(1100, () => this.doShoot(shooter, byIdx));
  },

  doShoot(shooterIdx, challengerIdx) {
    const s = this.st, p = s.players[shooterIdx];
    if (typeof Platform !== 'undefined' && Platform.audio) Platform.audio.alert();
    const hit = this.pullTrigger(p.gun);
    if (hit) {
      p.alive = false;
      this.log(`💥 砰！${p.name} 中彈淘汰（第 ${p.gun.fired} 槍）`);
      if (typeof Platform !== 'undefined' && Platform.audio) Platform.audio.shot();
    } else {
      this.log(`😮‍💨 喀！${p.name} 逃過一劫（已擊發 ${p.gun.fired}/6）`);
      if (typeof Platform !== 'undefined' && Platform.audio) Platform.audio.empty();
    }
    s._shot = { seat: shooterIdx, hit, fired: p.gun.fired }; // 觸發左輪開火動畫
    if (this.render) this.render();

    if (this._aliveCount() <= 1) {
      this._after(1600, () => { s._shot = null; s._reveal = null; this.endMatch(); });
      return;
    }
    // 下一局：開槍者若存活從他開始，否則從質疑者後一位存活者
    const starter = p.alive ? shooterIdx : this._aliveIdx(shooterIdx, false);
    this._after(1700, () => { s._shot = null; s._reveal = null; this.deal(starter); if (this.render) this.render(); this.tick(); });
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
    if (p.isAI) this._after(800, () => this.aiAct(s.turn));
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
        { label: '回大廳', onClick: (close) => { close(); Platform.exit(); } },
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
        id: i, name: this.O.names[i] || (['', 'AI甲', 'AI乙', 'AI丙'][i]),
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
        const p = this.st.players[seat]; p.isAI = true; p._remote = false; this.log(`${p.name} 離線，改由 AI 接手`);
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
        const idx = (d.cards || []).filter(i => i >= 0 && i < this.st.players[seat].hand.length);
        if (idx.length < 1 || idx.length > 3) return;
        this.play(seat, idx.map(i => this.st.players[seat].hand[i]));
      }
    });
  };
  LiarsBar._setupGuestNet = function () {
    Platform.net.on('welcome', d => { this.O.mySeat = d.seat; this._renderRoom(); });
    Platform.net.on('lobby', d => { this.O.names = d.names; this._renderRoom(); });
    Platform.net.on('start', d => { if (d && d.seat != null) this.O.mySeat = d.seat; this.O.started = true; });
    Platform.net.on('state', d => {
      this.st = d.st; this.O.mySeat = d.seat; this.O.started = true;
      if (this.st.phase !== 'over') this._overShown = false;
      this.render();
      if (this.st.phase === 'over') this._maybeOver();
    });
    Platform.net.on('full', () => { Platform.toast('房間已滿或已開始'); Platform.exit(); });
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
    Platform.ui.modal({
      title: meWin ? '🏆 你贏了！' : '☠️ 遊戲結束',
      html: `最後生還者：<b>${winner ? winner.name : '無'}</b>`,
      buttons: [{ label: '回大廳', primary: true, onClick: c => { c(); Platform.exit(); } }],
    });
  };

  // 左輪：玩家自製圖（待機 / 開火）。shot 存在時開火（hit→換開火圖+後座，blank→小抖動）
  LiarsBar._revolverSVG = function (shot) {
    const cls = shot ? 'firing ' + (shot.hit ? 'hit' : 'blank') : '';
    return `<div class="lb-gun2 ${cls}" aria-hidden="true">
      <img class="lb-gun-idle" src="games/liarsbar/anim/idle.png" alt="">
      <img class="lb-gun-fire" src="games/liarsbar/anim/fire.png" alt="">
    </div>`;
  };

  // ---------- 遊戲畫面 ----------
  LiarsBar.render = function () {
    const root = this._root; if (!root) return;
    const O = this.O;
    if (O && !O.started) { this._renderRoom(); return; }
    const s = this.st; if (!s) return;
    const meSeat = O ? O.mySeat : 0;
    const me = s.players[meSeat];
    const myTurn = s.turn === meSeat && s.phase === 'play' && me.alive;
    const isHost = !O || O.isHost;
    const shot = s._shot;
    const calling = s.phase === 'reveal' && !shot; // 剛喊騙子、翻牌瞬間

    const N = s.players.length;
    const POS = ['', 'pos-r', 'pos-t', 'pos-l'];
    const gun = n => Array.from({ length: 6 }, (_, k) => `<i class="ch ${k < n ? 'spent' : ''}"></i>`).join('');

    const oppHtml = s.players.map((p, i) => {
      if (i === meSeat) return '';
      const pos = (i - meSeat + N) % N;
      const danger = p.gun.fired >= 4 ? 'danger' : p.gun.fired >= 2 ? 'warn' : '';
      const shooting = shot && shot.seat === i ? (shot.hit ? 'shooting hit' : 'shooting') : '';
      return `<div class="lb-seat ${POS[pos]} ${p.alive ? '' : 'dead'} ${s.turn === i ? 'active' : ''} ${shooting}">
        <div class="lb-pinfo"><span class="lb-name">${p.name}</span><span class="lb-count">🂠 ${p.hand.length}</span></div>
        <div class="lb-gun ${danger}" title="已擊發 ${p.gun.fired}/6">${gun(p.gun.fired)}</div>
        ${p.alive ? '' : '<div class="lb-x">☠</div>'}
      </div>`;
    }).join('');

    const selfDanger = me.gun.fired >= 4 ? 'danger' : me.gun.fired >= 2 ? 'warn' : '';
    const selfShooting = shot && shot.seat === meSeat ? (shot.hit ? 'shooting hit' : 'shooting') : '';
    root.innerHTML = `
      <div class="lb-room ${shot && shot.hit ? 'shake' : ''}">
        <div class="lb-lamp"></div>
        <div class="lb-sign">騙子酒吧</div>
        <div class="lb-table">
          ${oppHtml}
          <div class="lb-center">
            <div class="lb-eyebrow">本局桌牌 · 第 ${s.roundNo} 巡</div>
            <div class="lb-rankcard" id="lb-rankcard"></div>
            <div class="lb-pile" id="lb-pile"></div>
            <div class="lb-claim">${s.lastPlay ? `「這 ${s.lastPlay.count} 張，都是 ${this.face(s.tableRank)}」— ${s.players[s.lastPlay.by].name}` : '把牌蓋上，賭一張嘴。'}</div>
            <div class="lb-revwrap">${this._revolverSVG(shot)}</div>
            ${calling ? '<div class="lb-callstamp">騙子！</div>' : ''}
          </div>
          <div class="lb-log">${s.log.map(l => `<div>${l}</div>`).join('')}</div>
          <div class="lb-self ${myTurn ? 'active' : ''} ${me.alive ? '' : 'dead'} ${selfShooting}">
            <div class="lb-selfbar"><span class="lb-name">${me.name}</span><span class="lb-gun ${selfDanger}" title="已擊發 ${me.gun.fired}/6">${gun(me.gun.fired)}</span></div>
            <div class="lb-hand" id="lb-hand"></div>
            <div class="lb-actions">
              <button class="tx-act call" id="lb-play">蓋牌宣稱</button>
              <button class="tx-act danger" id="lb-challenge">喊騙子</button>
            </div>
            <div class="lb-hint" id="lb-hint"></div>
          </div>
        </div>
      </div>`;

    const rc = root.querySelector('#lb-rankcard');
    const tc = Platform.cards.bigEl(this.face(s.tableRank), { joker: s.tableRank === 'JOKER' });
    tc.classList.add('lb-tablecard'); rc.appendChild(tc);

    const pile = root.querySelector('#lb-pile');
    if (s._reveal) s._reveal.forEach((c, i) => { const e = Platform.cards.bigEl(this.face(c.r), { joker: c.r === 'JOKER' }); e.classList.add('lb-mini', 'lb-flip'); e.style.animationDelay = (i * 0.12) + 's'; pile.appendChild(e); });
    else if (s.lastPlay) for (let i = 0; i < s.lastPlay.count; i++) { const e = Platform.cards.bigEl('', { back: true }); e.classList.add('lb-mini'); pile.appendChild(e); }

    const handEl = root.querySelector('#lb-hand');
    this._sel = this._sel || new Set();
    if (!me.alive) handEl.innerHTML = '<div class="lb-dead-note">你已出局——留下來看戲。</div>';
    me.hand.forEach((c, i) => {
      const e = Platform.cards.bigEl(this.face(c.r), { joker: c.r === 'JOKER' });
      if (this._sel.has(i)) e.classList.add('sel');
      if (myTurn) {
        const toggle = () => {
          if (this._sel.has(i)) this._sel.delete(i);
          else { if (this._sel.size >= 3) return Platform.toast('最多蓋 3 張'); this._sel.add(i); }
          this.render();
        };
        e.onclick = toggle;
        e.tabIndex = 0;
        e.setAttribute('role', 'button');
        e.setAttribute('aria-pressed', this._sel.has(i) ? 'true' : 'false');
        e.setAttribute('aria-label', `手牌 ${this.face(c.r)}`);
        e.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } };
      }
      handEl.appendChild(e);
    });

    const playBtn = root.querySelector('#lb-play');
    const chBtn = root.querySelector('#lb-challenge');
    const hint = root.querySelector('#lb-hint');
    const canChallenge = myTurn && s.lastPlay && s.lastPlay.by !== meSeat;
    playBtn.disabled = !(myTurn && this._sel.size >= 1);
    chBtn.disabled = !canChallenge;
    if (!me.alive) hint.textContent = '';
    else if (!myTurn) hint.textContent = s.phase === 'reveal' ? '攤牌了…' : '等別人先出手…';
    else hint.textContent = `選 1–3 張，宣稱都是 ${this.face(s.tableRank)}；不信就喊騙子`;

    const doPlay = (cards) => { if (isHost) this.play(meSeat, cards); else Platform.net.sendHost('act', { kind: 'play', cards: cards.map(c => me.hand.indexOf(c)) }); };
    const doChallenge = () => { if (isHost) this.challenge(meSeat); else Platform.net.sendHost('act', { kind: 'challenge' }); };
    if (myTurn) {
      playBtn.onclick = () => { if (this._sel.size < 1) return; const cards = [...this._sel].sort((a, b) => a - b).map(i => me.hand[i]); this._sel = new Set(); doPlay(cards); };
      if (canChallenge) chBtn.onclick = () => { this._sel = new Set(); doChallenge(); };
    }

    this._push(); // host 同步狀態給賓客
  };

  Platform.register({
    id: 'liarsbar', name: '騙子酒吧', icon: '🍺',
    desc: '吹牛、抓謊、左輪淘汰', players: { min: 2, max: 4 },
    online: true,
    mount(stage, opts) {
      LiarsBar._stage = stage;
      const root = document.createElement('div');
      root.id = 'lb-root'; root.className = 'lb-root';
      stage.appendChild(root);
      LiarsBar._root = root; LiarsBar._human = '你'; LiarsBar._sel = new Set(); LiarsBar._overShown = false;
      if (opts && opts.online) { LiarsBar._startOnline(opts); }
      else { LiarsBar.O = null; LiarsBar.newMatch('你'); LiarsBar.render(); LiarsBar.tick(); }
    },
    unmount() { LiarsBar._clearTimers(); LiarsBar._root = null; LiarsBar.st = null; LiarsBar._reveal = null; LiarsBar.O = null; LiarsBar._overShown = false; },
  });
}
