/* 牌桌遊戲廳 — 平台核心：遊戲註冊表 + 啟動/退出 + 共用服務掛載點 */
const Platform = {
  games: [],
  _active: null,
  _onChange: null,

  register(g) {
    if (this.games.some(x => x.id === g.id)) return;
    this.games.push(g);
    if (this._onChange) this._onChange();
  },

  launch(id, opts = {}) {
    const g = this.games.find(x => x.id === id);
    if (!g) return;
    this.exit();
    const lobby = document.getElementById('lobby');
    const stage = document.getElementById('stage');
    const back  = document.getElementById('back-btn');
    if (lobby) lobby.style.display = 'none';
    if (stage) { stage.style.display = 'block'; stage.innerHTML = ''; }
    if (back)  back.style.display = 'block';
    this._active = g;
    try { g.mount(stage, opts); }
    catch (e) { console.error('mount failed', e); this.toast && this.toast('遊戲載入失敗'); this.exit(); }
  },
  // 連線模式啟動（host 開房 / 賓客加入）
  launchOnline(id, join) {
    const g = this.games.find(x => x.id === id);
    if (!g) return;
    if (!g.online) { this.toast && this.toast('此遊戲暫不支援連線'); return; }
    this.launch(id, { online: true, join: join || null });
  },

  exit() {
    if (this._active) {
      try { this._active.unmount && this._active.unmount(); }
      catch (e) { console.error('unmount failed', e); }
      this._active = null;
    }
    if (this.net && this.net.peer) this.net.reset();
    const lobby = document.getElementById('lobby');
    const stage = document.getElementById('stage');
    const back  = document.getElementById('back-btn');
    if (stage) { stage.style.display = 'none'; stage.innerHTML = ''; }
    if (back)  back.style.display = 'none';
    if (lobby) lobby.style.display = '';
  },

  // localStorage JSON 包裝
  store: {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v)   { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  },

  // 以下服務由各 core 模組載入後掛上：audio, theme, ui, cards, toast, fx
};

// 大廳卡片渲染
function renderLobby() {
  const grid = document.getElementById('game-grid');
  if (!grid) return;
  grid.innerHTML = '';
  Platform.games.forEach(g => {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `<div class="gc-icon" aria-hidden="true">${g.icon || '🎲'}</div>
      <div class="gc-name">${g.name}</div>
      <div class="gc-desc">${g.desc || ''}</div>
      <div class="gc-players">${g.players ? `${g.players.min}–${g.players.max} 人` : ''}</div>
      <div class="gc-btns">
        <button class="gc-go" aria-label="單機遊玩 ${g.name}">單機</button>
        ${g.online ? `<button class="gc-online" aria-label="連線遊玩 ${g.name}"><span aria-hidden="true">🌐</span> 連線</button>` : ''}
      </div>`;
    card.querySelector('.gc-go').onclick = () => Platform.launch(g.id);
    const ob = card.querySelector('.gc-online');
    if (ob) ob.onclick = () => Platform.launchOnline(g.id);
    grid.appendChild(card);
  });
}
Platform._onChange = renderLobby;

window.addEventListener('DOMContentLoaded', () => {
  renderLobby();
  const back = document.getElementById('back-btn');
  if (back) back.onclick = () => Platform.exit();
  // 由邀請連結進入 → 自動以賓客加入
  if (Platform._pendingJoin) {
    const j = Platform._pendingJoin; Platform._pendingJoin = null;
    Platform.launchOnline(j.game, { room: j.room, host: j.host });
  }
});
