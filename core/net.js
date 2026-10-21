/* 連線傳輸層（遊戲無關）：PeerJS host-authoritative。
   房主開房得房間碼+邀請連結，賓客以 hostId 連入。
   遊戲用 Platform.net.on(type, fn) 註冊訊息處理；host 用 broadcast/sendTo，賓客用 sendHost。 */
Platform.net = {
  peer: null, conns: [], roomId: null, hostId: null, isHost: false,
  myId: null, myName: '', ready: false, handlers: {},

  on(type, fn) { this.handlers[type] = fn; return this; },
  off(type) { delete this.handlers[type]; },
  _emit(type, data, from) { const h = this.handlers[type]; if (h) try { h(data, from); } catch (e) { console.error('net handler', type, e); } },

  // 開啟自身 Peer，resolve(myId)
  init(name) {
    this.myName = name || '玩家';
    if (this.peer && this.ready) return Promise.resolve(this.myId); // 換遊戲保留房間：沿用同一個 Peer
    this.myId = 'arc_' + Math.random().toString(36).slice(2, 8).padEnd(6, '0'); // 後 6 碼即房間碼（約 21 億組，同麻將原版長度，不易被亂猜）：賓客在大廳輸入房間碼就能連到房主
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') { reject(new Error('PeerJS 未載入')); return; }
      this.peer = new Peer(this.myId);
      this.peer.on('open', id => { this.ready = true; resolve(id); });
      this.peer.on('error', e => {
        console.error('peer error', e);
        if (!this.ready) { reject(e); return; }
        if (e.type === 'peer-unavailable' && !this.isHost) { this._joinFail('找不到房間（房主可能已離開）'); return; }
        Platform.toast && Platform.toast('連線錯誤：' + (e.type || e));
      });
      this.peer.on('connection', c => this._setupConn(c)); // host 接受賓客
    });
  },

  createRoom() {
    this.isHost = true; this.hostId = this.myId;
    this.roomId = this.roomId || this.myId.slice(4).toUpperCase();
    return this.roomId;
  },
  // 賓客連不上房主：提示後回大廳（不會卡在「連線中…」）
  _joinFail(msg) { Platform.toast && Platform.toast(msg, 3000); Platform.exit(); },
  // 賓客連房主。timeout=false：呼叫端自己管逾時（麻將橋接有自己的 8 秒逾時）
  joinRoom(hostId, timeout = true) {
    clearTimeout(this._jt); // 前一次加入的逾時作廢，不會誤殺這次
    this.isHost = false; this.hostId = hostId;
    const old = this.conns.find(x => x.peer === hostId && x.open);
    if (old) { old.send({ type: 'rejoin' }); return old; } // 跟著房主換遊戲：沿用連線，請房主重新入座
    const c = this.peer.connect(hostId, { reliable: true, metadata: { name: this.myName, game: Platform._active && Platform._active.id } });
    this._setupConn(c);
    if (timeout) {
      c.on('open', () => clearTimeout(this._jt));
      this._jt = setTimeout(() => { c._gaveUp = true; try { c.close(); } catch {} this._joinFail('連不上房主，請確認連結或房間碼'); }, 10000);
    }
    return c;
  },

  _setupConn(c) {
    const name = () => String((c.metadata && c.metadata.name) || '').replace(/[<>&"'`]/g, '').slice(0, 16); // 賓客名稱會進 innerHTML，入口濾掉 HTML 字元防 XSS
    const seat = () => { // 房主：先送本局設定，再交給遊戲入座
      if (this.isHost && Platform._active) try { c.send({ type: 'cfg', cfg: Platform.cfg(Platform._active.id) }); } catch {}
      this._emit('_open', { name: name() }, c.peer);
    };
    c.on('open', () => {
      if (!this.conns.includes(c)) this.conns.push(c);
      const g = c.metadata && c.metadata.game, act = Platform._active;
      if (this.isHost && Platform.toast) Platform.toast(`${name() || '玩家'} 進房了`);
      // 賓客拿的是舊連結（房主已換遊戲 / 正在大廳選遊戲）→ 導到房主目前的狀態，而不是用錯的遊戲入座
      if (this.isHost && !act) try { c.send({ type: 'hold' }); } catch {}
      else if (this.isHost && g !== act.id) try { c.send({ type: 'switch', game: act.id }); } catch {} // 含輸入房間碼加入（g 為空）
      else seat();
      if (!act) renderRoomBar();
    });
    c.on('data', d => {
      if (!d || typeof d.type !== 'string' || d.type[0] === '_') return; // _open/_close 等內部事件只能由本機觸發，擋掉對方偽造
      if (this.isHost && d.type === 'rejoin') { seat(); return; }
      if (!this.isHost && c.peer === this.hostId) { // 平台層訊息：只認房主
        if (d.type === 'cfg') { const a = Platform._active; if (a) { Platform.applyCfg(a.id, d.cfg); this._cfgFor = a.id; if (a.target && a.target._renderRoom) a.target._renderRoom(); } return; } // 收到房主設定才顯示，免得先秀出自己本機的設定
        if (d.type === 'hold') { this._cfgFor = null; document.querySelectorAll('.modal-ov').forEach(m => m.remove()); Platform.exit(true); return; }
        if (d.type === 'switch') { this._cfgFor = null; if (Platform.games.some(g => g.id === d.game)) Platform.launch(d.game, { online: true, keepNet: true, join: { host: this.hostId, room: this.roomId } }); return; }
      }
      this._emit(d.type, d, c.peer);
    });
    c.on('close', () => {
      this.conns = this.conns.filter(x => x !== c); this._emit('_close', {}, c.peer);
      if (Platform._active || c._gaveUp) return; // 逾時放棄的連線由 _joinFail 統一提示，不再報「房主已關閉」
      if (!this.isHost && c.peer === this.hostId) { Platform.toast('房主已關閉房間'); this.reset(); } // 在大廳等待中被房主解散
      renderRoomBar();
    });
    c.on('error', e => console.error('conn error', e));
  },

  broadcast(type, data) { const m = Object.assign({ type }, data); this.conns.forEach(c => { try { c.send(m); } catch {} }); },
  sendTo(peerId, type, data) { const c = this.conns.find(x => x.peer === peerId); if (c) try { c.send(Object.assign({ type }, data)); } catch {} },
  sendHost(type, data) { this.sendTo(this.hostId, type, data); },
  peers() { return this.conns.map(c => c.peer); },

  inviteUrl() {
    const g = Platform._active ? Platform._active.id : '';
    return location.origin + location.pathname + '?room=' + this.roomId + '&host=' + this.hostId + '&game=' + g;
  },

  // 共用開房/加入面板。O = {isHost, mySeat, names[], started}；onStart 為房主開始回呼
  renderRoom(root, O, title, onStart) {
    if (!root || O.started) return;
    const names = O.names || [];
    const esc = t => String(t).replace(/[<>&"'`]/g, c => `&#${c.charCodeAt(0)};`); // 名稱可能來自對方，進 innerHTML 前跳脫
    const list = names.map((n, i) => `<li>${i === O.mySeat ? '👉 ' : ''}座位 ${i + 1}：${n ? esc(n) : '（空）'}${i === 0 ? '（房主）' : ''}</li>`).join('');
    const g = Platform._active, sum = g && g.settings && g.target ? g.settings.map(f => `${f.label} <b>${esc(Platform.fmtCfg(f, g.target[f.k]))}</b>`).join(' · ') : '';
    const cfgRow = sum && (O.isHost || this._cfgFor === g.id) ? `<p class="net-cfg">${sum}</p>` : '';
    if (O.isHost) {
      const url = this.roomId ? this.inviteUrl() : '';
      root.innerHTML = `<div class="net-room"><h2>${title} — 開房</h2>
        <div class="net-code">房間碼：<b>${this.roomId || '…'}</b></div>
        <div class="net-url"><input id="net-url" readonly value="${url}"><button class="btn" id="net-copy">複製邀請連結</button></div>
        <ul class="net-list">${list}</ul>${cfgRow}
        <p class="net-hint">把連結或房間碼傳給朋友（大廳可輸入房間碼加入）；空位由電腦補滿。</p>
        ${sum ? '<button class="btn" id="net-cfgbtn">⚙ 房間設定</button> ' : ''}<button class="btn btn-primary" id="net-start">開始遊戲</button></div>`;
      const cp = root.querySelector('#net-copy'); if (cp) cp.onclick = () => { const i = root.querySelector('#net-url'); i.select(); try { document.execCommand('copy'); Platform.toast('已複製連結'); } catch {} };
      const st = root.querySelector('#net-start'); if (st) st.onclick = onStart;
      const cf = root.querySelector('#net-cfgbtn');
      if (cf) cf.onclick = () => Platform.editCfg(g.id, () => {
        const c = Platform.cfg(g.id); Platform.applyCfg(g.id, c); this.broadcast('cfg', { cfg: c });
        if (g.target._renderRoom) g.target._renderRoom(); else this.renderRoom(root, O, title, onStart);
      });
    } else {
      root.innerHTML = `<div class="net-room"><h2>${title} — 加入房間</h2>
        <div class="net-code">${O.mySeat >= 0 ? `已入座（座位 ${O.mySeat + 1}）` : '連線中…'}</div>
        <ul class="net-list">${list}</ul>${cfgRow}
        <p class="net-hint">等待房主開始…</p></div>`;
    }
  },

  reset() {
    clearTimeout(this._jt);
    try { this.conns.forEach(c => c.close()); } catch {}
    try { if (this.peer) this.peer.destroy(); } catch {}
    this.peer = null; this.conns = []; this.roomId = null; this.hostId = null;
    this.isHost = false; this.ready = false; this.handlers = {}; this._cfgFor = null;
  },
};

// URL ?room=&host=&game= → 啟動時自動以賓客身分加入
Platform._pendingJoin = (() => {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('room') && q.get('host')) {
      history.replaceState(null, '', location.pathname); // 用過即清：重新整理不會拿舊連結再加入一次
      const room = q.get('room').toUpperCase(); // 房間碼會進畫面，只收英數字（舊連結 5 碼、新的 6 碼）
      if (/^[A-Z0-9]{5,6}$/.test(room)) return { room, host: q.get('host'), game: q.get('game') };
    }
  } catch {}
  return null;
})();
