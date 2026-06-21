/* 麻將模組：沿用原版 3D 完整單檔，以 iframe 掛入平台外殼（內部未重構，行為與原版一致） */
Platform.register({
  id: 'mahjong',
  name: '台灣麻將 3D',
  icon: '🀄',
  desc: '3D 立體牌桌，16 張台灣麻將 + 完整台型',
  players: { min: 4, max: 4 },
  _frame: null,
  mount(stage) {
    const f = document.createElement('iframe');
    f.src = 'games/mahjong/mahjong-3d.html';
    f.className = 'game-frame';
    stage.appendChild(f);
    this._frame = f;
  },
  unmount() {
    if (this._frame) { this._frame.src = 'about:blank'; this._frame.remove(); this._frame = null; }
  },
});
