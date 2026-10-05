/* 麻將模組：沿用原版 3D 完整單檔，以 iframe 掛入平台外殼（內部未重構，行為與原版一致） */
Platform.register({
  id: 'mahjong',
  name: '台灣麻將 3D',
  icon: '🀄',
  desc: '3D 立體牌桌，16 張台灣麻將 + 完整台型',
  players: { min: 4, max: 4 },
  online: true, // 連線流程在 iframe 內（自帶 PeerJS 房間），平台只負責帶參數進場
  ownNet: true, // 不能沿用大廳保留的連線房間（見 Platform.launchOnline）
  _frame: null,
  mount(stage, opts = {}) {
    const f = document.createElement('iframe');
    let src = 'games/mahjong/mahjong-3d.html';
    if (opts.online) {
      src += opts.join ? `?room=${encodeURIComponent(opts.join.room)}&host=${encodeURIComponent(opts.join.host)}`
                       : '?online=1';
    }
    f.src = src;
    f.className = 'game-frame';
    stage.appendChild(f);
    this._frame = f;
  },
  unmount() {
    if (this._frame) { this._frame.src = 'about:blank'; this._frame.remove(); this._frame = null; }
  },
});
