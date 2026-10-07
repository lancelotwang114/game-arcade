/* 麻將模組：沿用原版 3D 完整單檔，以 iframe 掛入平台外殼（內部未重構，行為與原版一致）
   連線：iframe 帶 ?arcade=1，經 window.MJBridge 走大廳共用房間（Platform.net），可跟其他遊戲互換並帶著賓客 */
Platform.register({
  id: 'mahjong',
  name: '台灣麻將 3D',
  icon: '🀄',
  desc: '3D 立體牌桌，16 張台灣麻將 + 完整台型',
  players: { min: 4, max: 4 },
  online: true,
  _frame: null,
  mount(stage, opts = {}) {
    const f = document.createElement('iframe');
    let src = 'games/mahjong/mahjong-3d.html';
    if (opts.online) {
      src += (opts.join ? `?room=${encodeURIComponent(opts.join.room)}&host=${encodeURIComponent(opts.join.host)}` : '?online=1') + '&arcade=1';
      this._bridge(opts);
    }
    f.src = src;
    f.className = 'game-frame';
    stage.appendChild(f);
    this._frame = f;
  },
  // iframe 收不到時先排隊（iframe 載入比房主的 switch / 賓客的 rejoin 慢），attach 後依序送進去；麻將訊息一律包成 'mj' 避免撞到平台訊息
  _bridge(opts) {
    const n = Platform.net, name = Platform.store.get('arcade_name', '') || '玩家';
    const B = window.MJBridge = {
      q: [], sink: null, name,
      push(e) { if (this.sink) this.sink(e); else this.q.push(e); },
      attach(fn) { this.sink = fn; this.q.splice(0).forEach(fn); },
      send: (peer, d) => n.sendTo(peer, 'mj', { d: JSON.parse(JSON.stringify(d)) }), // iframe 建的物件跨 realm，PeerJS 序列化會默默失敗 → 先在本頁複製一份
      join: host => new Promise((ok, fail) => { // 連上房主才算加入；8 秒沒連上 = 失敗（同原版逾時）
        const c = n.joinRoom(host); if (c.open) { ok(); return; }
        const t = setTimeout(() => { try { c.close(); } catch {} fail(new Error('join timeout')); }, 8000); // 關掉，免得晚到的連線讓房主誤判已入座
        c.on('open', () => { clearTimeout(t); ok(); });
      }),
      isHost: () => n.isHost,
      roomId: () => n.roomId,
      inviteUrl: () => n.inviteUrl(),
    };
    B.ready = n.init(name).then(id => { if (!opts.join) n.createRoom(); return id; });
    B.ready.catch(e => { Platform.toast('連線失敗：' + (e.message || e)); Platform.exit(); });
    n.on('_open', (d, from) => B.push({ ev: 'join', peer: from, name: d.name || '玩家' }));
    n.on('_close', (d, from) => {
      if (!n.isHost && from === n.hostId) { Platform.toast('房主已離線'); Platform.exit(); return; }
      B.push({ ev: 'leave', peer: from });
    });
    n.on('mj', (d, from) => B.push({ ev: 'data', peer: from, d: d.d }));
  },
  unmount() {
    window.MJBridge = null;
    if (this._frame) { this._frame.src = 'about:blank'; this._frame.remove(); this._frame = null; }
  },
});
