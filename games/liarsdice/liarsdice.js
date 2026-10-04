/* 吹牛骰子 Liar's Dice — 單機 + AI（2~4 人，每人 5 顆骰子）
   規則：
   - 每輪所有存活玩家搖骰（各自只看得到自己的）。由本輪起手者開始叫「N 個 X 點」。
   - 1 點萬用（可當任何點數）；本輪只要有人叫過「N 個 1」，1 就不再萬用。
   - 下一位必須加價：數量更多（點數任意），或數量相同但點數更大（2 < 3 < 4 < 5 < 6 < 1）；或者「開」。
   - 最小起叫數量 = 存活人數；叫價數量不能超過場上骰子總數。
   - 開：翻開所有骰子計數。實際數量 ≥ 叫價 → 叫價成立，開的人輸；否則叫價的人輸。
   - 輸的人玩俄羅斯輪盤（每人一把左輪，6 膛 1 發），中彈淘汰。最後存活者勝。
   - 下一輪由輸家起手（若已淘汰，由他下一位存活者起手）。 */
const LiarsDice = {
  FACE_RANK: [0, 6, 1, 2, 3, 4, 5], // 點數大小：2(1) < 3 < 4 < 5 < 6(5) < 1(6)
  DICE: 5,

  // ---------- 純規則 ----------
  makeGun() { return { live: Math.floor(Math.random() * 6), fired: 0 }; },
  pullTrigger(gun) { const hit = gun.fired === gun.live; gun.fired++; return hit; },
  roll(n) { return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6)); },
  // 場上符合 face 的骰子數；wild = 1 是否萬用
  countFace(allDice, face, wild) { return allDice.filter(d => d === face || (wild && face !== 1 && d === 1)).length; },
  // next 是否為合法加價（prev 可為 null）
  isRaise(next, prev, minQ, maxQ) {
    if (!next || next.q < minQ || next.q > maxQ || next.f < 1 || next.f > 6 || !Number.isInteger(next.q) || !Number.isInteger(next.f)) return false;
    if (!prev) return true;
    return next.q > prev.q || (next.q === prev.q && this.FACE_RANK[next.f] > this.FACE_RANK[prev.f]);
  },

  // ---------- 對局狀態 ----------
  st: null, _timers: [],
  // online：連線時各座位名字（null = 空位由電腦補）
  newMatch(human = '你', online = null) {
    const names = online ? online.map((n, i) => n ?? ['', '阿牛', '小美', '老張'][i]) : [human, '阿牛', '小美', '老張'];
    this.st = { players: names.map((nm, i) => ({ id: i, name: nm, isAI: online ? online[i] == null : i !== 0, alive: true, dice: [], gun: this.makeGun(), style: ['', 'attack', 'balanced', 'defense'][i] })),
      roundNo: 0, turn: 0, bid: null, bids: [], oneCalled: false, phase: 'idle', log: [], _reveal: null, _shot: null };
    this.newRound(0);
  },
  aliveIdx() { return this.st.players.map((p, i) => i).filter(i => this.st.players[i].alive); },
  nextAlive(from) { const n = this.st.players.length; for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (this.st.players[i].alive) return i; } return from; },
  totalDice() { return this.st.players.reduce((a, p) => a + (p.alive ? p.dice.length : 0), 0); },
  minQ() { return this.aliveIdx().length; },
  newRound(starter) {
    const s = this.st; s.roundNo++;
    s.players.forEach(p => { p.dice = p.alive ? this.roll(this.DICE).sort((a, b) => a - b) : []; });
    s.bid = null; s.bids = []; s.oneCalled = false; s._reveal = null; s._shot = null; s.phase = 'bid';
    s.turn = s.players[starter] && s.players[starter].alive ? starter : this.nextAlive(starter);
    this._rolledAt = Date.now();
    this.log(`🎲 第 ${s.roundNo} 輪：大家搖骰，${s.players[s.turn].name} 先叫`);
    if (this.render) this.render();
    this.tick();
  },
  // 叫價
  bid(i, q, f) {
    const s = this.st;
    if (s.phase !== 'bid' || s.turn !== i) return false;
    const b = { q, f, by: i };
    if (!this.isRaise(b, s.bid, this.minQ(), this.totalDice())) return false;
    s.bid = b; s.bids.push(b); if (f === 1) s.oneCalled = true;
    this.log(`${s.players[i].name} 叫：${q} 個 ${f}${f === 1 ? '（1 不再萬用）' : ''}`);
    s.turn = this.nextAlive(i);
    if (this.render) this.render(); this.tick(); return true;
  },
  // 開
  challenge(i) {
    const s = this.st;
    if (s.phase !== 'bid' || s.turn !== i || !s.bid) return false;
    const all = s.players.flatMap(p => p.alive ? p.dice : []);
    const wild = !s.oneCalled, count = this.countFace(all, s.bid.f, wild);
    const truthful = count >= s.bid.q, loser = truthful ? i : s.bid.by;
    s.phase = 'reveal'; s._reveal = { by: i, count, wild, truthful, loser };
    this.log(`${s.players[i].name} 開！實際 ${count} 個 ${s.bid.f}${wild && s.bid.f !== 1 ? '（含萬用 1）' : ''} → ${truthful ? '叫價成立' : '吹牛被抓'}，${s.players[loser].name} 開槍`);
    if (this.render) this.render();
    this._after(4200, () => this.doShoot(loser));
    return true;
  },
  doShoot(i) {
    const s = this.st, p = s.players[i], hit = this.pullTrigger(p.gun);
    if (hit) p.alive = false;
    s._shot = { seat: i, hit, fired: p.gun.fired }; s.phase = 'shoot';
    this.log(hit ? `💥 砰！${p.name} 中彈淘汰` : `😮‍💨 喀！${p.name} 逃過一劫（已擊發 ${p.gun.fired}/6）`);
    if (this.render) this.render();
    if (this.aliveIdx().length <= 1) { this._after(7000, () => { s.phase = 'over'; if (this.render) this.render(); }); return; }
    this._after(7000, () => this.newRound(p.alive ? i : this.nextAlive(i)));
  },
  tick() {
    const s = this.st; if (!s || s.phase !== 'bid') return;
    if (s.players[s.turn].isAI) this._after(Math.max(1300 + Math.random() * 900, (this._rolledAt || 0) + 2600 - Date.now()), () => this.aiAct(s.turn));
  },

  // ---------- AI：以機率估計 ----------
  // 估計場上 face 的期望數（自己的骰子已知，其他人的依機率）
  _expect(i, face, wild) {
    const s = this.st, mine = s.players[i].dice, unknown = this.totalDice() - mine.length;
    const p = face === 1 || !wild ? 1 / 6 : 1 / 3;
    return this.countFace(mine, face, wild) + unknown * p;
  },
  aiAct(i) {
    const s = this.st; if (!s || s.phase !== 'bid' || s.turn !== i) return;
    const me = s.players[i], bold = { attack: .9, balanced: .45, defense: .1 }[me.style] ?? .45;
    if (s.bid) {
      const exp = this._expect(i, s.bid.f, !s.oneCalled);
      // 叫價明顯超過期望就開（大膽的人門檻較高）
      if (s.bid.q > exp + .6 + bold * .8 || s.bid.q >= this.totalDice()) { this.challenge(i); return; }
    }
    // 加價：從自己最多的點數挑，叫最低合法數量；偶爾吹牛多加一個
    const wildNow = !s.oneCalled;
    const faces = [2, 3, 4, 5, 6, 1].map(f => ({ f, e: this._expect(i, f, wildNow && f !== 1) })).sort((a, b) => b.e - a.e);
    const minQ = this.minQ(), maxQ = this.totalDice();
    for (const { f, e } of faces) {
      let q = Math.max(minQ, s.bid ? (this.FACE_RANK[f] > this.FACE_RANK[s.bid.f] ? s.bid.q : s.bid.q + 1) : minQ);
      if (Math.random() < bold * .25) q++;
      if (q <= maxQ && q <= Math.ceil(e + .8 + bold * .6) && this.bid(i, q, f)) return;
    }
    if (s.bid) this.challenge(i); else this.bid(i, minQ, faces[0].f);
  },

  log(m) { this.st.log.unshift(m); if (this.st.log.length > 8) this.st.log.pop(); },
  _after(ms, fn) { const t = setTimeout(fn, ms); this._timers.push(t); return t; },
  _clearTimers() { this._timers.forEach(clearTimeout); this._timers = []; },
};

// ---------- node 自測 ----------
if (typeof module !== 'undefined' && require.main === module) {
  const assert = require('assert'), L = LiarsDice;
  // 計數：1 萬用 / 叫過 1 後不萬用 / 叫 1 本身只算 1
  assert.strictEqual(L.countFace([1, 4, 4, 2, 6], 4, true), 3, '4 含萬用 1');
  assert.strictEqual(L.countFace([1, 4, 4, 2, 6], 4, false), 2, '叫過 1 後 1 不算 4');
  assert.strictEqual(L.countFace([1, 1, 4], 1, true), 2, '叫 1 只算 1');
  // 加價規則
  const R = (q, f) => ({ q, f });
  assert.ok(L.isRaise(R(4, 3), R(3, 6), 2, 20), '數量加一，點數任意');
  assert.ok(L.isRaise(R(3, 5), R(3, 4), 2, 20), '同數量換大點');
  assert.ok(!L.isRaise(R(3, 3), R(3, 4), 2, 20), '同數量小點不行');
  assert.ok(L.isRaise(R(3, 1), R(3, 6), 2, 20), '同數量 1 最大');
  assert.ok(!L.isRaise(R(3, 6), R(3, 1), 2, 20), '1 之後同數量不能叫 6');
  assert.ok(!L.isRaise(R(1, 6), null, 2, 20), '低於最小起叫');
  assert.ok(!L.isRaise(R(21, 6), null, 2, 20), '超過骰子總數');
  // 左輪：6 槍必中一次
  const g = L.makeGun(); let hits = 0; for (let i = 0; i < 6; i++) if (L.pullTrigger(g)) hits++;
  assert.strictEqual(hits, 1, '6 膛 1 發');
  // 開：判定與輸家
  L.render = null; L._after = () => {};
  L.newMatch('P0'); const s = L.st;
  s.players.forEach((p, i) => { p.dice = [[1, 2, 3, 4, 5], [4, 4, 6, 6, 2], [3, 3, 3, 5, 5], [6, 6, 6, 1, 2]][i]; });
  s.turn = 0; L.bid(0, 5, 4); L.challenge(1);   // 4：P0 一個 4 + 1 萬用、P1 兩個 4、P3 一個萬用 1 → 共 5 → 成立，開的 P1 輸
  assert.deepStrictEqual([s._reveal.count, s._reveal.truthful, s._reveal.loser], [5, true, 1], '叫價成立開的人輸');
  L.newMatch('P0'); const t = L.st;
  t.players.forEach((p, i) => { p.dice = [[1, 2, 3, 4, 5], [4, 4, 6, 6, 2], [3, 3, 3, 5, 5], [6, 6, 6, 1, 2]][i]; });
  t.turn = 0; L.bid(0, 4, 1); L.challenge(1);   // 叫 1：只有 P0、P3 各一個 1 → 2 < 4 → 吹牛，P0 輸
  assert.deepStrictEqual([t._reveal.count, t._reveal.loser, t.oneCalled], [2, 0, true], '叫 1 吹牛被抓');
  // AI 對打：每輪都能結束（叫價或開），不會卡住
  L.newMatch('P0'); L.st.players[0].isAI = true; let guard = 0;
  while (L.st.phase === 'bid' && guard++ < 200) L.aiAct(L.st.turn);
  assert.strictEqual(L.st.phase, 'reveal', 'AI 一輪內會有人開');
  console.log('✅ LiarsDice 自測通過');
}
if (typeof module !== 'undefined') module.exports = LiarsDice;

// ---------- 平台註冊 + 連線（host 權威）+ UI ----------
if (typeof Platform !== 'undefined') {
  const L = LiarsDice;
  const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const dieHTML = (f, cls = '', st = '') => `<div class="ld-die ${cls}" data-f="${f}" style="${st}" role="img" aria-label="${f} 點">${Array.from({ length: 9 }, (_, k) => `<i class="${PIPS[f].includes(k + 1) ? 'on' : ''}"></i>`).join('')}</div>`;
  const ini = nm => { const ch = [...(nm || '?')]; const last = ch[ch.length - 1]; return /[一-鿿]/.test(last) ? last : ch[0].toUpperCase(); };
  const cyl = fired => `<span class="ld-cyl" role="img" aria-label="左輪已擊發 ${fired}/6">${[0, 1, 2, 3, 4, 5].map(k => `<i class="${k < fired ? 'fired' : ''}"></i>`).join('')}</span>`;
  const GUN = fired => { const ch = [0, 1, 2, 3, 4, 5].map(k => { const a = (k * 60 - 90) * Math.PI / 180, x = Math.cos(a) * 34, y = Math.sin(a) * 34;
    return `<g><circle cx="${x}" cy="${y}" r="13" fill="#0b0b0b" stroke="#555"/>${k < fired ? '' : `<circle cx="${x}" cy="${y}" r="10.5" fill="#c9952e"/><circle cx="${x}" cy="${y}" r="3.5" fill="#e9d48a"/>`}</g>`; }).join('');
    return `<svg viewBox="-70 -78 140 148" aria-hidden="true"><path d="M0 -76 L-9 -62 L9 -62 Z" fill="#c8372d"/><g class="ld-rot"><circle r="58" fill="#8a9097" stroke="#24272b" stroke-width="2"/>${ch}<circle r="9" fill="#2a2d31"/></g></svg>`; };

  // ---------- 音效（CC0，來源見 games/liarsdice/audio/CREDITS.txt）----------
  L.sfx = Platform.fx.sampler('games/liarsdice/audio/', {
    ambience: 'ambience.mp3', 'shake-1': 'dice-shake-1.wav', 'shake-2': 'dice-shake-2.wav', 'shake-3': 'dice-shake-3.wav',
    'throw-1': 'dice-throw-1.wav', 'throw-2': 'dice-throw-2.wav', 'throw-3': 'dice-throw-3.wav', 'grab-1': 'dice-grab-1.wav', 'grab-2': 'dice-grab-2.wav',
    'chip-1': 'chip-lay-1.wav', 'chip-2': 'chip-lay-2.wav', 'slam-1': 'slam-1.wav', 'slam-2': 'slam-2.wav', 'slam-3': 'slam-3.wav',
    'shot-1': 'shot-1.wav', 'shot-2': 'shot-2.wav', 'cock-1': 'cock-1.mp3', 'cock-2': 'cock-2.mp3', click: 'click.mp3',
    'glass-1': 'glass-1.wav', 'glass-2': 'glass-2.wav', toast: 'toast-1.mp3',
  });

  // ---------- 連線：對賓客遮蔽他人骰子（開的時候公開）與子彈位置 ----------
  L._redact = function (seat) {
    const s = this.st, open = s.phase === 'reveal' || s.phase === 'shoot' || s.phase === 'over';
    return JSON.parse(JSON.stringify({
      players: s.players.map((p, i) => ({ id: p.id, name: p.name, isAI: p.isAI, alive: p.alive, gun: { fired: p.gun.fired },
        dice: (i === seat || open) ? p.dice : p.dice.map(() => 0) })),
      roundNo: s.roundNo, turn: s.turn, bid: s.bid, bids: s.bids, oneCalled: s.oneCalled, phase: s.phase, log: s.log, _reveal: s._reveal, _shot: s._shot,
    }));
  };
  L._push = function () {
    const O = this.O; if (!O || !O.isHost || !O.started) return;
    for (const seat in O.peerOf) Platform.net.sendTo(O.peerOf[seat], 'state', { st: this._redact(+seat), seat: +seat });
  };
  L._hostStart = function () {
    this._clearTimers(); this._prev = null; this.O.started = true;
    for (const seat in this.O.peerOf) Platform.net.sendTo(this.O.peerOf[seat], 'start', { seat: +seat });
    this._overShown = false; this.newMatch('你', this.O.names);
  };
  L._setupHostNet = function () {
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
      if (this.O.started && this.st && this.st.players[seat]) {
        const p = this.st.players[seat]; p.isAI = true; this.log(`${p.name} 離線，改由電腦接手`);
        if (this.st.turn === seat) this.tick(); this.render();
      } else this._renderRoom();
      Platform.net.broadcast('lobby', { names: this.O.names });
    });
    Platform.net.on('act', (d, from) => {
      const seat = this.O.seatOf[from], s = this.st;
      if (!d || seat == null || !s || s.turn !== seat || s.phase !== 'bid') return;
      if (d.kind === 'open') this.challenge(seat);
      else if (d.kind === 'bid') this.bid(seat, d.q, d.f); // bid() 內 isRaise 會驗證整數與範圍
    });
  };
  L._setupGuestNet = function () {
    Platform.net.on('welcome', d => { this.O.mySeat = d.seat; this._renderRoom(); });
    Platform.net.on('lobby', d => { this.O.names = d.names; this._renderRoom(); });
    Platform.net.on('start', d => { if (d && d.seat != null) this.O.mySeat = d.seat; this.O.started = true; this._overShown = false; this._prev = null; if (this._overModal) { this._overModal.close(); this._overModal = null; } });
    Platform.net.on('state', d => { this.st = d.st; this.O.mySeat = d.seat; this.O.started = true; this.render(); });
    Platform.net.on('full', () => { Platform.toast('房間已滿或已開始'); Platform.exit(); });
    Platform.net.on('_close', () => { if (!this._root) return; Platform.toast('房主已離線'); Platform.exit(); });
  };
  L._startOnline = function (opts) {
    const name = Platform.store.get('arcade_name', '') || (opts.join ? '賓客' : '房主');
    this.O = { isHost: !opts.join, mySeat: opts.join ? -1 : 0, seatOf: {}, peerOf: {}, names: [null, null, null, null], started: false };
    this._renderRoom();
    Platform.net.init(name).then(() => {
      if (this.O.isHost) { Platform.net.createRoom(); this.O.names[0] = name; this._setupHostNet(); this._renderRoom(); }
      else { this._setupGuestNet(); Platform.net.joinRoom(opts.join.host); this._renderRoom(); }
    }).catch(e => { Platform.toast('連線失敗：' + (e.message || e)); Platform.exit(); });
  };
  L._renderRoom = function () { if (!this._root || !this.O || this.O.started) return; Platform.net.renderRoom(this._root, this.O, '🎲 吹牛骰子', () => this._hostStart()); };
  L.restart = function () { this._clearTimers(); this._overShown = false; this._prev = null; if (this.O && this.O.isHost) { this._hostStart(); return; } this.newMatch('你'); };

  // ---------- 骨架 ----------
  L._build = function () {
    const root = this._root;
    const seat = p => `<div class="ld-seat" data-p="${p}"><div class="ld-cupwrap"><div class="ld-dice"></div><div class="ld-cup"></div></div>
      <div class="ld-tag"><div class="ld-ava"></div><div><div class="ld-nm"></div><div class="ld-cylw"></div></div></div><span class="ld-bub"></span></div>`;
    root.innerHTML = `<div class="ld-app">
      <header class="ld-top">
        <div class="ld-brand">吹牛骰子</div>
        <div class="ld-info"><span class="ld-rinfo"></span><span class="ld-wild">1 點萬用</span></div>
        <button class="ld-ibtn ld-snd" aria-label="音效開關"></button>
        <button class="ld-ibtn ld-logbtn" aria-label="遊戲紀錄">☰</button>
      </header>
      <main class="ld-stage">${seat(1)}${seat(2)}${seat(3)}${seat(0)}
        <div class="ld-board"><div class="ld-cur"></div><div class="ld-curby" aria-live="polite"></div><div class="ld-tally" aria-live="polite"></div></div>
      </main>
      <section class="ld-dock" aria-label="叫價">
        <div class="ld-panel">
          <div class="ld-qrow"><button class="ld-qbtn ld-qm" aria-label="減少數量">−</button><div class="ld-qv"></div><button class="ld-qbtn ld-qp" aria-label="增加數量">＋</button><div class="ld-tip"></div></div>
          <div class="ld-frow" role="group" aria-label="點數">${[2, 3, 4, 5, 6, 1].map(f => `<button class="ld-fbtn" data-f="${f}" aria-label="${f} 點">${dieHTML(f)}</button>`).join('')}</div>
        </div>
        <div class="ld-acts"><button class="ld-act bid" disabled>叫</button><button class="ld-act open" disabled>開！</button></div>
      </section>
      <div class="ld-stamp" aria-hidden="true">開！</div>
      <div class="ld-rl" aria-hidden="true" aria-live="polite"><div class="ld-rlbox"><div class="ld-rlwho"></div><div class="ld-rlcyl"></div><div class="ld-rlmsg"></div></div></div>
      <div class="ld-flash"></div>
      <aside class="ld-log" aria-label="遊戲紀錄"><h2>遊戲紀錄 <button class="ld-ibtn ld-logx" aria-label="關閉">✕</button></h2><ul></ul></aside>
    </div>`;
    const q = s => root.querySelector(s);
    const U = this._ui = {
      app: q('.ld-app'), rinfo: q('.ld-rinfo'), wild: q('.ld-wild'), cur: q('.ld-cur'), curby: q('.ld-curby'), tally: q('.ld-tally'), stamp: q('.ld-stamp'),
      seat: [0, 1, 2, 3].map(p => q(`.ld-seat[data-p="${p}"]`)), qv: q('.ld-qv'), qm: q('.ld-qm'), qp: q('.ld-qp'), tip: q('.ld-tip'),
      fbtn: [...root.querySelectorAll('.ld-fbtn')], bid: q('.ld-act.bid'), open: q('.ld-act.open'),
      rl: q('.ld-rl'), rlWho: q('.ld-rlwho'), rlCyl: q('.ld-rlcyl'), rlMsg: q('.ld-rlmsg'), flash: q('.ld-flash'), snd: q('.ld-snd'), log: q('.ld-log'), logList: q('.ld-log ul'),
    };
    U.cup = U.seat.map(e => e.querySelector('.ld-cup')); U.dice = U.seat.map(e => e.querySelector('.ld-dice')); U.bub = U.seat.map(e => e.querySelector('.ld-bub'));
    this._prev = null; this._q = 4; this._f = 2; this._shotPend = -1;
    const sndIcon = () => { U.snd.textContent = Platform.audio.enabled ? '🔊' : '🔇'; U.snd.setAttribute('aria-pressed', String(Platform.audio.enabled)); };
    sndIcon(); U.snd.onclick = () => { Platform.audio.setEnabled(!Platform.audio.enabled); sndIcon(); this.sfx.ambience(Platform.audio.enabled); };
    const logOpen = on => { U.log.classList.toggle('open', on); U.log.inert = !on; }; logOpen(false); // 收起時不可 Tab 進去
    q('.ld-logbtn').onclick = () => logOpen(true); q('.ld-logx').onclick = () => logOpen(false);
    U.qm.onclick = () => { this._q--; this._paintPanel(); }; U.qp.onclick = () => { this._q++; this._paintPanel(); };
    U.fbtn.forEach(b => b.onclick = () => { this._f = +b.dataset.f; this.sfx.play('grab', { gain: .25, rate: 1.3 }); this._paintPanel(); });
    U.bid.onclick = () => this._send('bid'); U.open.onclick = () => this._send('open');
  };

  // ---------- 叫價面板 ----------
  // 預設停在「最小合法加價」：數量不變換大點，不行就數量 +1
  L._normalize = function () {
    const s = this.st, min = this.minQ(), max = this.totalDice();
    this._q = Math.max(min, Math.min(max, this._q));
    if (s.bid && !this.isRaise({ q: this._q, f: this._f }, s.bid, min, max)) this._q = Math.min(max, s.bid.q + (this.FACE_RANK[this._f] > this.FACE_RANK[s.bid.f] ? 0 : 1));
  };
  L._paintPanel = function () {
    const U = this._ui, s = this.st, me = this._me, min = this.minQ(), max = this.totalDice();
    const my = s.phase === 'bid' && s.turn === me && s.players[me].alive;
    U.qv.innerHTML = `${+this._q}<small>個</small>`;
    U.fbtn.forEach(b => { const f = +b.dataset.f; b.classList.toggle('sel', f === this._f); b.setAttribute('aria-pressed', String(f === this._f));
      b.disabled = !(my && this.isRaise({ q: this._q, f }, s.bid, min, max)); });
    const ok = my && this.isRaise({ q: this._q, f: this._f }, s.bid, min, max);
    U.bid.disabled = !ok; U.bid.textContent = ok ? `叫 ${this._q} 個 ${this._f}` : '叫';
    U.open.disabled = !(my && s.bid); U.qm.disabled = !my || this._q <= min; U.qp.disabled = !my || this._q >= max;
    U.tip.textContent = !s.players[me].alive && this._shotPend !== me ? '你已出局，觀戰中' : my ? (s.bid ? '加價，或者開！' : `你先叫，至少 ${min} 個`) : '';
  };

  // ---------- 主渲染：依前後狀態差異觸發動畫 ----------
  L.render = function () {
    const root = this._root; if (!root) return;
    const O = this.O;
    if (O && !O.started) { this._renderRoom(); return; }
    const s = this.st; if (!s) return;
    if (!root.querySelector('.ld-app')) this._build();
    const U = this._ui, me = this._me = O ? O.mySeat : 0, pl = s.players, pos = i => (i - me + 4) % 4, tl = this._tl, sfx = this.sfx;
    const P = this._prev, newRound = !P || P.round !== s.roundNo;
    U.wild.className = 'ld-wild' + (s.oneCalled ? ' off' : ''); U.wild.textContent = s.oneCalled ? '1 已被叫，不萬用' : '1 點萬用';
    if (newRound) this._shotPend = -1;
    if (s._shot && P && !P.shot) this._shotPend = s._shot.seat; // 中彈結果等輪盤演完才顯示
    // 座位：名字、左輪膛數、淘汰（開槍結果等輪盤演完才顯示）
    pl.forEach((p, i) => {
      const el = U.seat[pos(i)], pend = this._shotPend === i;
      el.querySelector('.ld-ava').textContent = ini(p.name); el.querySelector('.ld-nm').textContent = p.name;
      if (!pend) { el.querySelector('.ld-cylw').innerHTML = cyl(p.gun.fired); el.classList.toggle('dead', !p.alive); }
      el.classList.toggle('turn', s.phase === 'bid' && s.turn === i);
    });
    if (newRound) {
      tl.clear(); sfx.ambience(true); U.tally.textContent = ''; U.tally.className = 'ld-tally'; U.rl.classList.remove('on'); U.rl.setAttribute('aria-hidden', 'true');
      U.bub.forEach(b => { b.className = 'ld-bub'; });
      pl.forEach((p, i) => {
        const k = pos(i), cup = U.cup[k], dice = U.dice[k];
        cup.classList.remove('lift', 'shake', 'slam'); dice.innerHTML = '';
        if (!p.alive) return;
        Platform.fx.restart(cup, 'shake'); sfx.play('shake', { gain: .5, when: k * .08 });
        tl.after(() => {
          cup.classList.remove('shake'); Platform.fx.restart(cup, 'slam'); sfx.play('throw', { gain: .6 });
          if (k === 0 && !dice.childElementCount) { dice.innerHTML = p.dice.map((f, j) => dieHTML(f, 'roll', `--d:${j * 60}ms`)).join(''); tl.after(() => cup.classList.add('lift'), 500); }
        }, 1000 + k * 120);
      });
      this._q = this.minQ(); this._f = 2;
    }
    // 新叫價
    if (P && !newRound && s.bids.length > P.bids) {
      const b = s.bid; this._say(pos(b.by), `${b.q} 個 ${b.f}`); sfx.play('chip', { gain: .7 });
      if (b.by !== me) { this._q = +b.q; this._f = +b.f; }
    }
    this._normalize();
    if (s.bid) { U.cur.innerHTML = `${+s.bid.q} 個 ${dieHTML(s.bid.f)}`; U.curby.textContent = `${pl[s.bid.by].name} 叫的${s.phase === 'bid' ? ` · 輪到 ${pl[s.turn].name}` : ''}`; }
    else { U.cur.innerHTML = ''; U.curby.textContent = s.phase === 'bid' ? `${pl[s.turn].name} 先叫（至少 ${this.minQ()} 個）` : ''; }
    // 開：拍桌 → 逐一掀盅 → 計數
    if (s._reveal && P && !P.reveal) {
      const r = s._reveal, f = s.bid.f, wild = r.wild && f !== 1;
      U.bub.forEach(b => { b.className = 'ld-bub'; }); // 收起叫價泡泡，別擋住掀開的骰子
      this._say(pos(r.by), '開！', 'open'); sfx.play('slam', { gain: 1 }); sfx.duck(.08, .3);
      Platform.fx.restart(U.stamp, 'show'); Platform.fx.restart(U.app, 'shake');
      let n = 0, t = 900;
      [0, 1, 2, 3].map(k => (k + me) % 4).forEach(i => {
        const p = pl[i]; if (!p.alive) return;
        const k = pos(i);
        tl.after(() => {
          if (k || !U.dice[0].childElementCount) U.dice[k].innerHTML = p.dice.map(v => dieHTML(v)).join('');
          U.cup[k].classList.add('lift'); sfx.play('grab', { gain: .5 });
          U.dice[k].querySelectorAll('.ld-die').forEach((d, j) => { const v = p.dice[j]; if (v === f) { d.classList.add('hit'); n++; } else if (wild && v === 1) { d.classList.add('hitwild'); n++; } else d.classList.add('dim'); });
          U.tally.textContent = `共 ${n} 個 ${f}`;
        }, t);
        t += 550;
      });
      tl.after(() => { U.tally.textContent = `共 ${r.count} 個 ${f} · ${r.truthful ? '叫價成立' : '吹牛被抓！'}`; U.tally.className = 'ld-tally ' + (r.truthful ? 'ok' : 'bad'); sfx.duck(.32, 1); }, t + 200);
    }
    // 開槍：輪盤演出
    if (s._shot && P && !P.shot) this._roulette(s._shot);
    this._paintMisc();
    U.app.classList.toggle('myturn', s.phase === 'bid' && s.turn === me);
    if (s.phase === 'bid' && s.turn === me && pl[me].alive && (!P || P.turn !== s.turn || newRound)) Platform.audio._tone(880, .25, 'sine', .1, newRound ? 2.6 : 0);
    if (s.phase === 'over' && !this._overShown) {
      this._overShown = true;
      const w = pl.find(p => p.alive) || pl[0], iWin = w.id === me, isGuest = O && !O.isHost;
      iWin ? Platform.audio.win() : Platform.audio.lose(); if (iWin) sfx.play('toast', { gain: .6 });
      this._overModal = Platform.ui.modal({ title: iWin ? '🏆 你活到最後！' : '遊戲結束',
        html: `最後存活：<b>${w.name.replace(/[<>&"']/g, '')}</b>`,
        buttons: isGuest ? [{ label: '回大廳', primary: true, onClick: c => { c(); Platform.exit(); } }]
          : [{ label: '再來一場', primary: true, onClick: c => { c(); this.restart(); } }, { label: '回大廳', onClick: c => { c(); Platform.exit(); } }] });
    }
    this._prev = { round: s.roundNo, bids: s.bids.length, reveal: !!s._reveal, shot: !!s._shot, turn: s.turn };
    this._push();
  };
  // 場上顆數、面板、紀錄：輪盤演出中不透露中彈結果
  L._paintMisc = function () {
    const U = this._ui, s = this.st, pend = this._shotPend >= 0 && !s.players[this._shotPend].alive;
    U.rinfo.textContent = `第 ${s.roundNo} 輪 · 場上 ${this.totalDice() + (pend ? s.players[this._shotPend].dice.length : 0)} 顆`;
    this._paintPanel();
    U.logList.replaceChildren(...s.log.slice(this._shotPend >= 0 ? 1 : 0).map(l => { const li = document.createElement('li'); li.textContent = l; return li; }));
  };
  L._say = function (k, t, cls = '') { const b = this._ui.bub[k]; b.textContent = t; b.className = 'ld-bub ' + cls; Platform.fx.restart(b, 'pop'); };
  L._roulette = function (sh) {
    const U = this._ui, tl = this._tl, sfx = this.sfx, s = this.st, seat = sh.seat, k = (seat - this._me + 4) % 4, before = sh.fired - 1;
    U.rl.setAttribute('aria-hidden', 'false');
    U.rlWho.textContent = `${s.players[seat].name} 扣下扳機`; const sm = document.createElement('small'); sm.textContent = `已擊發 ${before} / 6 膛`; U.rlWho.append(sm);
    U.rlCyl.innerHTML = GUN(before); U.rlMsg.textContent = ''; U.rlMsg.className = 'ld-rlmsg';
    U.rl.classList.add('on'); sfx.duck(.04, .5);
    tl.after(() => { let t = 0, g = .035; while (t < 2) { sfx.play('click', { when: t, gain: .35, rate: 1.7 }); t += g; g *= 1.09; }
      const rot = U.rlCyl.querySelector('.ld-rot'); if (rot) rot.style.transform = `rotate(${-(before * 60) - 1080}deg)`; }, 500);
    tl.after(() => sfx.play('cock', { gain: 1, jitter: false }), 2800);
    tl.after(() => {
      if (sh.hit) { sfx.play('shot', { gain: 1, jitter: false }); Platform.fx.restart(U.flash, 'go'); Platform.fx.restart(U.app, 'shake'); U.rlMsg.textContent = '砰！'; U.rlMsg.className = 'ld-rlmsg bang'; }
      else { sfx.play('click', { gain: 1, jitter: false }); U.rlMsg.textContent = '喀…空膛'; U.rlMsg.className = 'ld-rlmsg click'; }
      this._shotPend = -1; U.seat[k].classList.toggle('dead', sh.hit); U.seat[k].querySelector('.ld-cylw').innerHTML = cyl(sh.fired); this._paintMisc();
    }, 4200);
    tl.after(() => { U.rl.classList.remove('on'); U.rl.setAttribute('aria-hidden', 'true'); sfx.duck(.32, 1.2); if (!sh.hit) sfx.play('glass', { gain: .5 }); }, 6000);
  };

  // 送出動作：房主直接套用；賓客送給房主驗證
  L._send = function (kind) {
    const isHost = !this.O || this.O.isHost, me = this._me, q = this._q, f = this._f;
    if (kind === 'open') { if (isHost) this.challenge(me); else Platform.net.sendHost('act', { kind: 'open' }); return; }
    if (isHost) this.bid(me, q, f); else Platform.net.sendHost('act', { kind: 'bid', q, f });
  };

  Platform.register({
    id: 'liarsdice', name: '吹牛骰子', icon: '🎲',
    desc: '搖骰吹牛，1 點萬用；被抓包就玩俄羅斯輪盤', players: { min: 2, max: 4 },
    online: true,
    mount(stage, opts) {
      const root = document.createElement('div'); root.id = 'ld-root'; root.className = 'ld-root'; stage.appendChild(root);
      L._root = root; L._prev = null; L._overShown = false; L._tl = Platform.fx.timeline(root);
      L.sfx.unlock(); L.sfx.load().then(() => { if (L._root && L.st) L.sfx.ambience(true); });
      root.addEventListener('pointerdown', () => L.sfx.unlock(), { passive: true });
      if (opts && opts.online) L._startOnline(opts); else { L.O = null; L.newMatch('你'); }
    },
    unmount() {
      L._clearTimers(); if (L._tl) L._tl.clear(); L.sfx.ambience(false);
      if (L._overModal) { L._overModal.close(); L._overModal = null; }
      L._root = null; L._ui = null; L.st = null; L.O = null; L._overShown = false;
    },
  });
}
