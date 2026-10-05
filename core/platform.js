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
    this.exit(opts.keepNet);
    if (!opts.join) this.applyCfg(id, this.cfg(id)); // 賓客的設定由房主連線送來（net.js 'cfg'）
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
    const n = this.net;
    if (!join && n && n.peer && n.isHost) { // 房主帶著原房間的賓客換遊戲
      if (g.ownNet) { this.toast('此遊戲使用獨立連線房間，請先關閉目前房間'); return; }
      this.launch(id, { online: true, keepNet: true });
      setTimeout(() => n.broadcast('switch', { game: id }), 300); // 等新遊戲掛好連線處理器，賓客的 rejoin 才接得住
      return;
    }
    if (!join && !this.store.get('arcade_name', '')) { this.askName('開房前先取個暱稱', () => this.launchOnline(id)); return; } // 別讓朋友看到「房主」
    this.launch(id, { online: true, join: join || null });
  },
  // 連線前輸入暱稱（預填上次用的）；按確定才 go()，取消就留在大廳
  askName(title, go) {
    const m = this.ui.modal({
      title,
      html: `<label class="cfg-row"><span>你的暱稱</span><input type="text" maxlength="12" placeholder="例如：小明" autocomplete="nickname"></label>
        <p class="net-hint" aria-live="polite"></p>`,
      buttons: [
        { label: '加入', primary: true, onClick: close => {
          const nm = m.el.querySelector('input').value.replace(/[<>&"'`]/g, '').trim().slice(0, 12);
          if (!nm) { m.el.querySelector('.net-hint').textContent = '請輸入暱稱'; m.el.querySelector('input').focus(); return; }
          this.store.set('arcade_name', nm); close(); go();
        } },
        { label: '取消' },
      ],
    });
    const inp = m.el.querySelector('input');
    inp.value = this.store.get('arcade_name', '');
    inp.onkeydown = e => { if (e.key === 'Enter') m.el.querySelector('.btn-primary').click(); };
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
  },
  // 回大廳：連線房主且有賓客 → 保留房間，賓客在大廳等房主選下一款
  leave() {
    const n = this.net;
    if (n && n.peer && n.isHost && n.conns.length) { n.broadcast('hold', {}); this.exit(true); }
    else this.exit();
  },

  exit(keepNet) {
    if (this._active) {
      try { this._active.unmount && this._active.unmount(); }
      catch (e) { console.error('unmount failed', e); }
      this._active = null;
    }
    if (this.net && this.net.peer) { if (keepNet) this.net.handlers = {}; else this.net.reset(); }
    const lobby = document.getElementById('lobby');
    const stage = document.getElementById('stage');
    const back  = document.getElementById('back-btn');
    if (stage) { stage.style.display = 'none'; stage.innerHTML = ''; }
    if (back)  back.style.display = 'none';
    if (lobby) lobby.style.display = '';
    renderRoomBar();
  },

  // ---- 房內設定：遊戲 register 時給 settings: [{k, label, def, min, max, step}] 與 target（套用到的遊戲物件） ----
  _clampCfg(g, src) {
    const o = {};
    (g.settings || []).forEach(f => {
      let v = Math.round(+(src || {})[f.k] / (f.step || 1)) * (f.step || 1);
      if (!Number.isFinite(v)) v = f.def;
      o[f.k] = Math.max(f.min, Math.min(f.max, v));
    });
    return o;
  },
  cfg(id) { const g = this.games.find(x => x.id === id); return g ? this._clampCfg(g, this.store.get('arcade_cfg_' + id, {})) : {}; },
  applyCfg(id, cfg) { const g = this.games.find(x => x.id === id); if (g && g.target) Object.assign(g.target, this._clampCfg(g, cfg)); },
  // 設定對話框：暱稱 + 該遊戲設定；存檔後呼叫 after()
  editCfg(id, after) {
    const g = this.games.find(x => x.id === id); if (!g) return;
    const cur = this.cfg(id), esc = t => String(t).replace(/[<>&"'`]/g, c => `&#${c.charCodeAt(0)};`);
    const row = (k, label, v, a) => `<label class="cfg-row"><span>${label}</span><input data-k="${k}" ${a} value="${esc(v)}"></label>`;
    const m = this.ui.modal({
      title: `${g.name} — 設定`,
      html: `<div class="cfg-form">${row('_name', '暱稱', this.store.get('arcade_name', ''), 'type="text" maxlength="12" placeholder="玩家"')}`
        + (g.settings || []).map(f => row(f.k, f.label, cur[f.k], `type="number" inputmode="numeric" min="${f.min}" max="${f.max}" step="${f.step || 1}"`)).join('') + '</div>',
      buttons: [
        { label: '儲存', primary: true, onClick: close => {
          const v = {}; m.el.querySelectorAll('input[data-k]').forEach(i => { v[i.dataset.k] = i.value; });
          this.store.set('arcade_name', String(v._name || '').replace(/[<>&"'`]/g, '').trim().slice(0, 12));
          this.store.set('arcade_cfg_' + id, this._clampCfg(g, v));
          close(); after && after();
        } },
        { label: '取消' },
      ],
    });
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
        ${g.settings ? `<button class="gc-cfg" aria-label="${g.name} 設定"><span aria-hidden="true">⚙</span></button>` : ''}
      </div>`;
    card.querySelector('.gc-go').onclick = () => Platform.launch(g.id);
    const ob = card.querySelector('.gc-online');
    if (ob) ob.onclick = () => Platform.launchOnline(g.id);
    const cb = card.querySelector('.gc-cfg');
    if (cb) cb.onclick = () => Platform.editCfg(g.id);
    grid.appendChild(card);
  });
  renderRoomBar();
}
Platform._onChange = renderLobby;

// 大廳的連線房間列：房主保留房間回大廳時，選任一遊戲的「連線」就帶賓客一起進；賓客在此等待
function renderRoomBar() {
  const lobby = document.getElementById('lobby'), n = Platform.net;
  if (!lobby) return;
  let bar = document.getElementById('room-bar');
  const on = n && n.peer && (n.isHost ? n.conns.length : n.conns.length && n.hostId);
  if (!on) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'room-bar'; bar.setAttribute('aria-live', 'polite'); lobby.insertBefore(bar, document.getElementById('game-grid')); }
  bar.innerHTML = n.isHost
    ? `<span>🌐 房間 <b>${n.roomId || ''}</b> · ${n.conns.length} 位賓客等你選遊戲（按「連線」大家一起進）</span><button class="btn">關閉房間</button>`
    : `<span>🌐 等待房主選擇下一款遊戲…</span><button class="btn">離開房間</button>`;
  bar.querySelector('button').onclick = () => { n.reset(); renderRoomBar(); };
}

window.addEventListener('DOMContentLoaded', () => {
  renderLobby();
  const back = document.getElementById('back-btn');
  if (back) back.onclick = () => Platform.leave();
  // 由邀請連結進入 → 先輸入暱稱，再以賓客加入
  if (Platform._pendingJoin) {
    const j = Platform._pendingJoin; Platform._pendingJoin = null;
    const g = Platform.games.find(x => x.id === j.game);
    Platform.askName(`加入${g ? g.name : '連線房間'}`, () => Platform.launchOnline(j.game, { room: j.room, host: j.host }));
  }
});
