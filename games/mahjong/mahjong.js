/* 麻將模組：沿用原版 3D 完整單檔，以 iframe 掛入平台外殼（內部未重構，行為與原版一致）
   連線：iframe 帶 ?arcade=1，經 window.MJBridge 走大廳共用房間（Platform.net），可跟其他遊戲互換並帶著賓客 */
const MJ_TILE_BACKS = [['ebony', '皇家極夜烏木'], ['frostjade', '寒霧冰晶玉'], ['cyberred', '賽博霓虹·朱紅'], ['amberwax', '深海波濤蜜蠟'], ['amber', '經典琥珀黃'],
  ['wood', '細緻木紋'], ['jade', '翡翠綠'], ['navy', '深海藍'], ['cinnabar', '紅玉朱砂'], ['purple', '紫金宮廷'], ['obsidian', '玄武黑曜'], ['ivory', '象牙白玉'],
  ['porcelain', '青花瓷韻'], ['pearl', '珍珠紋']]; // 與 mahjong-3d.html 的 TILE_BACKS 同序

Platform.register({
  id: 'mahjong',
  name: '台灣麻將 3D',
  icon: '🀄',
  desc: '3D 立體牌桌，16 張台灣麻將 + 完整台型',
  players: { min: 4, max: 4 },
  online: true,
  // 大廳 ⚙ 設定：單機時以網址參數交給 iframe 直接開局（值對應麻將單機面板的選單；連線房間的規則仍在麻將房間面板設定）
  target: {},
  settings: [
    { k: 'base', label: '底台', def: 1, options: [1, 2, 3], fmt: v => `${v} 台底` },
    { k: 'tai', label: '每台金額', def: 100, options: [50, 100, 200, 500], fmt: v => `${Platform.money(v)}/台` },
    { k: 'money', label: '起始籌碼', def: 10000, options: [5000, 10000, 20000, 50000], fmt: Platform.money },
    { k: 'time', label: '出牌限時', def: 15, options: [5, 8, 12, 15, 20, 0], fmt: v => v ? `${v} 秒` : '不限' },
    { k: 'speed', label: '電腦速度', def: 1, options: [0, 1, 2, 3], fmt: v => ['慢', '正常', '快', '極快'][v] }, // 麻將的值是 slow/normal/fast/turbo，這裡用序號
    { k: 'quick', label: '開局動畫', def: 0, options: [0, 1], fmt: v => v ? '快速開局' : '完整動畫' },
    { k: 'rounds', label: '局數', def: 4, options: [4, 8], fmt: v => v === 8 ? '南風局（8 局）' : '東風局（4 局）' },
    // 牌背：麻將首頁的牌背選擇器在大廳看不到，搬來這裡（0 = 沿用上次選的；其餘對應 TILE_BACKS 的 id）
    { k: 'back', label: '牌背', def: 0, options: [...Array(15).keys()], fmt: v => v ? MJ_TILE_BACKS[v - 1][1] : '沿用上次' },
  ],
  _frame: null,
  _backParam(opts) { const b = !opts.join && this.target.back; return b ? `&tileback=${MJ_TILE_BACKS[b - 1][0]}` : ''; }, // 賓客不套（target 可能是房主送來的設定），牌背是個人偏好
  mount(stage, opts = {}) {
    const f = document.createElement('iframe');
    let src = 'games/mahjong/mahjong-3d.html';
    if (opts.online) {
      src += (opts.join ? `?room=${encodeURIComponent(opts.join.room)}&host=${encodeURIComponent(opts.join.host)}` : '?online=1') + '&arcade=1' + this._backParam(opts);
      this._bridge(opts);
    } else { // 單機：跳過麻將自己的首頁直接開局
      const c = this.target;
      src += `?solo=1&base=${c.base}&tai=${c.tai}&money=${c.money}&time=${c.time}&speed=${['slow', 'normal', 'fast', 'turbo'][c.speed]}&quick=${c.quick}&rounds=${c.rounds === 8 ? 'south' : 'east'}` + this._backParam(opts);
    }
    // iframe 內「返回大廳」交給平台（Platform 是 const，不在 window 上，iframe 摸不到）：連線中先確認，取消就繼續打
    window.MJLeave = pre => Platform.confirmLeave(() => { try { if (pre) pre(); } catch (e) {} Platform.leave(); }); // pre：確認後、卸載前讓麻將清存檔／停語音
    // 單機有上次沒打完的牌局：問要不要接著打
    window.MJResume = (onResume, onNew) => Platform.ui.modal({ title: '有上次沒打完的牌局', html: '<p>要接著打，還是開新局？</p>', onDismiss: onResume, // 按 Esc 關掉 = 接著打（不丟存檔）
      buttons: [{ label: '繼續上局', primary: true, onClick: c => { c(); onResume(); } }, { label: '開新局', onClick: c => { c(); onNew(); } }] });
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
        const c = n.joinRoom(host, false); if (c.open) { ok(); return; }
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
    window.MJBridge = null; window.MJLeave = window.MJResume = null;
    if (this._frame) { try { const w = this._frame.contentWindow; w.__arcadeLeaving = true; w.speechSynthesis && w.speechSynthesis.cancel(); } catch (e) {} this._frame.src = 'about:blank'; this._frame.remove(); this._frame = null; }
  },
});
