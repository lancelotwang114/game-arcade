/* 共用遊戲 HUD（照麻將）：右上工具列（電腦速度／代打／語音／暫停／錯誤回報）、聊天框、語音報牌、代打標記、暫停
   用法：遊戲 mount 建好畫面後呼叫 Platform.hud.mount(G, opts)；render 結尾呼叫 Platform.hud.sync()；unmount 呼叫 Platform.hud.unmount()
   opts = { root: 遊戲根元素, bar: 右上圖示列容器, seatEl(i) → 絕對座位 i 的 DOM, me() → 自己座位,
            takeover(i)?: 座位 i 剛改由電腦接手時補一步（預設：輪到他就 G.tick()） }
   遊戲物件 G 需有：st.players[i]（isAI）、_after(ms, fn)、render()；連線時 O（isHost / seatOf / names）與 _push() */

// ---------- 語音報牌：瀏覽器中文語音合成 ----------
Platform.voice = {
  enabled: Platform.store.get('arcade_voice', true),
  setEnabled(v) { this.enabled = !!v; Platform.store.set('arcade_voice', this.enabled); if (!v && window.speechSynthesis) speechSynthesis.cancel(); },
  say(text) {
    if (!this.enabled || !Platform.audio.enabled || !window.speechSynthesis || !text) return;
    try {
      const u = new SpeechSynthesisUtterance(String(text).slice(0, 30)); u.lang = 'zh-TW'; u.rate = 1.1; u.volume = Math.min(1, Platform.audio.vol * 1.4);
      const v = this._voice(); if (v) u.voice = v;
      speechSynthesis.cancel(); speechSynthesis.speak(u); // 新的一句蓋掉舊的，避免排隊越講越慢
    } catch (e) {}
  },
  _voice() {
    if (this._v) return this._v;
    const vs = speechSynthesis.getVoices(); if (!vs.length) return null;
    return this._v = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh[-_](HK|CN)|^zh/i.test(v.lang)) || null;
  },
};

Platform.hud = {
  QUICK: ['快一點啦', '好牌', '謝謝', '厲害', '不好意思', '等我一下', '再來一局', '哈哈'],
  AI_LINES: ['好啦好啦', '這把穩了', '嘿嘿', '你們手氣真好', '別急嘛', '這手不錯', '認真打囉', '再來再來', '哎呀', '看我的'],
  LABEL: { snd: '音效', style: '牌面', logbtn: '紀錄', addai: '加電腦', invite: '邀請' },
  G: null, o: null,

  mount(G, o) {
    this.unmount();
    this.G = G; this.o = o; this._held = []; this._unread = 0;
    // 暫停：包住遊戲排程，暫停中到期的動作先存起來，繼續時補跑（連線時只有房主的排程會推進牌局）
    const orig = G._after; this._orig = orig; G._paused = false;
    G._after = (ms, fn) => orig.call(G, ms, () => { if (G._paused) this._held.push(fn); else fn(); });
    this._buildBar(); this._buildChat();
    this._key = e => {
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); this.toggleChat(); }
      if ((e.key === 'p' || e.key === 'P') && this._canPause()) { e.preventDefault(); this.setPause(!G._paused); }
    };
    document.addEventListener('keydown', this._key);
    if (Platform.net) Platform.net.on('hud', (d, from) => this._onNet(d, from));
    this.sync();
  },
  unmount() {
    const G = this.G; if (!G) return;
    if (this._orig) G._after = this._orig; G._paused = false;
    document.removeEventListener('keydown', this._key);
    [this._tools, this._bMore, this._chat, this._pauseOv, this._volBox].forEach(el => el && el.remove());
    this._tools = this._bMore = this._chat = this._pauseOv = this._volBox = this._volIn = null;
    if (window.speechSynthesis) speechSynthesis.cancel();
    this.G = this.o = null;
  },

  // ---------- 狀態 ----------
  _online() { return !!(this.G && this.G.O); },
  _isHost() { return !this.G.O || this.G.O.isHost; },
  _canPause() { return this._isHost(); },
  _me() { return this.o.me(); },
  _name(i) { const p = this.G.st && this.G.st.players[i]; return p ? p.name : ''; },

  // ---------- 右上工具列 ----------
  _buildBar() {
    const bar = this.o.bar; if (!bar) return;
    // 遊戲原有圖示補上中文標籤（照麻將：按鈕下方永遠顯示用途）
    bar.querySelectorAll('button').forEach(b => { const k = Object.keys(this.LABEL).find(k => b.className.split(/\s+/).some(c => c.endsWith('-' + k))); if (k && !b.dataset.label) b.dataset.label = this.LABEL[k]; b.classList.add('hud-lbl'); });
    const box = this._tools = document.createElement('span'); box.className = 'hud-tools';
    const btn = (k, label, icon, title, fn) => { const b = document.createElement('button'); b.className = 'hud-ic hud-lbl hud-b-' + k; b.dataset.label = label; b.title = title; b.setAttribute('aria-label', title); b.textContent = icon; b.onclick = fn; box.append(b); return b; };
    const SPD = [1.6, 1, 0.5], SPD_NAME = { 1.6: '慢', 1: '正常', 0.5: '快' };
    this._bSpd = btn('spd', '電腦速度', '', '電腦速度（點一下切換）', () => {
      const G = this.G, v = SPD[(SPD.indexOf(G.AI_SPEED) + 1) % SPD.length] ?? 1; G.AI_SPEED = v;
      const id = Platform._active && Platform._active.id; if (id) { const c = Platform.cfg(id); c.AI_SPEED = v; Platform.store.set('arcade_cfg_' + id, c); }
      Platform.toast && Platform.toast(`電腦速度：${SPD_NAME[v]}`); this.sync();
    });
    this._bSpd._names = SPD_NAME;
    this._bAuto = btn('auto', '代打', '🤖', '代打（交給電腦幫你打）', () => this.requestAuto(!this._myAuto()));
    // 音量：點開滑桿；滑鼠滾輪在「音量」或遊戲原本的靜音鈕上也能調
    this._bVol = btn('vol', '音量', '🔉', '音量（點開滑桿，或用滑鼠滾輪調整）', () => this._volPop());
    const wheel = e => { e.preventDefault(); this.setVol(Platform.audio.vol + (e.deltaY < 0 ? .1 : -.1)); };
    [this._bVol, bar.querySelector('[class*="-snd"]')].forEach(b => b && b.addEventListener('wheel', wheel, { passive: false }));
    this._bVoice = btn('voice', '語音', '', '語音報牌開關', () => { Platform.voice.setEnabled(!Platform.voice.enabled); if (Platform.voice.enabled) Platform.voice.say('語音報牌開啟'); this.sync(); });
    this._bPause = btn('pause', '暫停', '⏸', '暫停／繼續（P）', () => this.setPause(!this.G._paused));
    this._bChat = btn('chat', '聊天', '💬', '聊天（C）', () => this.toggleChat());
    btn('bug', '錯誤回報', '🐞', '複製除錯紀錄（遇到錯誤時按，再貼給房主）', () => this.copyReport());
    box.addEventListener('click', e => { if (e.target.closest('.hud-ic')) box.classList.remove('open'); }); // 窄螢幕下拉：點了就收起
    const own = [...bar.querySelectorAll(':scope > button')]; // 遊戲原有圖示：一起收進工具列（桌機照常一排；手機一起進「選單」）
    if (own[0]) own[0].before(box); else bar.append(box);
    own.forEach(b => box.append(b));
    // 窄螢幕（手機）：共用按鈕收進「選單」下拉，避免一排擠爆
    const more = this._bMore = document.createElement('button'); more.className = 'hud-ic hud-lbl hud-b-more'; more.dataset.label = '選單'; more.textContent = '⚙';
    more.setAttribute('aria-label', '更多功能'); more.setAttribute('aria-expanded', 'false');
    more.onclick = () => { const on = box.classList.toggle('open'); more.setAttribute('aria-expanded', String(on)); };
    box.before(more);
  },
  setVol(v) {
    Platform.audio.setVol(Math.round(Math.max(0, Math.min(1, v)) * 20) / 20);
    if (this._volIn) this._volIn.value = Math.round(Platform.audio.vol * 100);
    Platform.audio._tone(660, .06, 'sine', .35); // 試聽目前大小
    this.sync();
  },
  _volPop() {
    if (this._volBox) { this._volBox.remove(); this._volBox = this._volIn = null; return; }
    const box = this._volBox = document.createElement('div'); box.className = 'hud-volpop';
    box.innerHTML = '<span>🔈</span><input type="range" min="0" max="100" step="5" aria-label="音量"><span>🔊</span><b></b>';
    const inp = this._volIn = box.querySelector('input'); inp.value = Math.round(Platform.audio.vol * 100);
    inp.oninput = () => this.setVol(inp.value / 100);
    box.addEventListener('wheel', e => { e.preventDefault(); this.setVol(Platform.audio.vol + (e.deltaY < 0 ? .1 : -.1)); }, { passive: false });
    const r = this._bVol.getBoundingClientRect(), shown = r.width > 0; // 手機下拉收起後按鈕不可見：改貼右上
    box.style.top = (shown ? r.bottom + 18 : 64) + 'px'; box.style.right = (shown ? Math.max(8, innerWidth - r.right) : 8) + 'px';
    document.body.append(box); inp.focus();
    const away = e => { if (!box.contains(e.target) && !this._bVol.contains(e.target)) { document.removeEventListener('pointerdown', away, true); if (this._volBox === box) this._volPop(); } };
    document.addEventListener('pointerdown', away, true); // 點外面就收起
    this.sync();
  },
  _myAuto() { const p = this.G.st && this.G.st.players[this._me()]; return !!(p && p.auto); },

  // 遊戲 render 結尾呼叫：代打標記、按鈕狀態
  sync() {
    const G = this.G; if (!G || !this._tools) return;
    const st = G.st, host = this._isHost();
    if (st && st.players) st.players.forEach((p, i) => { const el = this.o.seatEl(i); if (el) el.classList.toggle('hud-auto', !!p.auto); });
    this._bSpd.hidden = !host; this._bSpd.textContent = this._bSpd._names[G.AI_SPEED] || '正常';
    this._bAuto.classList.toggle('on', this._myAuto());
    const vp = Math.round(Platform.audio.vol * 100); this._bVol.dataset.label = `音量 ${vp}%`; this._bVol.textContent = vp ? (vp < 50 ? '🔉' : '🔊') : '🔈';
    if (this._volBox) this._volBox.querySelector('b').textContent = vp + '%';
    this._bVoice.textContent = Platform.voice.enabled ? '🗣' : '🔕'; this._bVoice.classList.toggle('on', Platform.voice.enabled);
    this._bPause.hidden = !host; this._bPause.textContent = G._paused ? '▶' : '⏸'; this._bPause.classList.toggle('on', !!G._paused);
  },

  // ---------- 代打 ----------
  requestAuto(on) {
    if (this._isHost()) this.setAuto(this._me(), on);
    else Platform.net.sendHost('hud', { kind: 'auto', on: !!on });
  },
  // 房主：座位 i 改由電腦接手（或交還給玩家）
  setAuto(i, on) {
    const G = this.G, st = G.st, p = st && st.players[i]; if (!p) return;
    p.auto = !!on; p.isAI = !!on;
    const turn = st.toAct != null ? st.toAct : st.turn;
    if (on && this.o.takeover) this.o.takeover(i);                 // 遊戲自訂接手（如 21 點下注／保險階段）
    else if (turn === i) { if (G.tick) G.tick(); }                 // 輪到他：電腦接手出這一步；交還玩家則重新開始行動限時
    if (G.render) G.render(); if (G._push) G._push();
  },

  // ---------- 暫停 ----------
  setPause(on) {
    const G = this.G; if (!G || !this._canPause()) return;
    this._applyPause(on);
    if (this._online()) Platform.net.broadcast('hud', { kind: 'pause', on: !!on });
  },
  _applyPause(on) {
    const G = this.G; G._paused = !!on;
    if (!on) { const h = this._held.splice(0); h.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
    if (on) Platform.ui.turnClock(null);
    if (on && !this._pauseOv) {
      const ov = this._pauseOv = document.createElement('div'); ov.className = 'hud-pause';
      ov.innerHTML = '<div class="hud-pbox"><b></b><p></p></div>';
      ov.querySelector('b').textContent = this._isHost() ? '已暫停' : '房主已暫停';
      ov.querySelector('p').textContent = this._isHost() ? '按 P 或下方按鈕繼續' : '等房主繼續…';
      if (this._isHost()) { const b = document.createElement('button'); b.className = 'btn btn-primary'; b.textContent = '▶ 繼續'; b.onclick = () => this.setPause(false); ov.querySelector('.hud-pbox').append(b); }
      this.o.root.append(ov);
    } else if (!on && this._pauseOv) { this._pauseOv.remove(); this._pauseOv = null; }
    this.sync();
  },

  // ---------- 聊天 ----------
  _buildChat() {
    const c = this._chat = document.createElement('div'); c.className = 'hud-chat'; c.hidden = true;
    c.innerHTML = `<div class="hud-chead"><b>聊天</b><button class="hud-cx" aria-label="關閉聊天">✕</button></div>
      <ul class="hud-clist" aria-live="polite"></ul>
      <div class="hud-quick" role="group" aria-label="快捷語">${this.QUICK.map(t => `<button>${t}</button>`).join('')}</div>
      <form class="hud-cform"><input maxlength="60" placeholder="輸入訊息…" aria-label="聊天訊息"><button type="button" class="hud-shout" aria-pressed="false" title="喊話：6 字內會唸出來">📢</button><button class="btn btn-primary">送出</button></form>`;
    const input = c.querySelector('input'), shout = c.querySelector('.hud-shout');
    c.querySelector('.hud-cx').onclick = () => this.toggleChat(false);
    shout.onclick = () => shout.setAttribute('aria-pressed', String(shout.getAttribute('aria-pressed') !== 'true'));
    c.querySelector('form').onsubmit = e => { e.preventDefault(); this.send(input.value, shout.getAttribute('aria-pressed') === 'true'); input.value = ''; };
    c.querySelector('.hud-quick').onclick = e => { const b = e.target.closest('button'); if (b) this.send(b.textContent, false); };
    this.o.root.append(c);
  },
  toggleChat(on) {
    const c = this._chat; if (!c) return;
    c.hidden = on == null ? !c.hidden : !on;
    if (!c.hidden) { this._unread = 0; this._bChat.classList.remove('dot'); this._bMore.classList.remove('dot'); c.querySelector('input').focus(); }
  },
  _clean(t, n) { return String(t || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n); },
  send(text, shout) {
    text = this._clean(text, shout ? 6 : 60); if (!text) return;
    const now = Date.now(); if (shout) { if (now - (this._lastShout || 0) < 1500) return; this._lastShout = now; }
    const me = this._me(), kind = shout ? 'shout' : 'chat';
    if (!this._online()) {
      this._recv(me, this._name(me) || '你', text, shout);
      // 單機：電腦隨機回一句
      const ai = (this.G.st.players || []).map((p, i) => i).filter(i => i !== me && this.G.st.players[i].isAI);
      if (ai.length && Math.random() < .7) { const i = ai[Math.random() * ai.length | 0]; setTimeout(() => this.G && this._recv(i, this._name(i), this.AI_LINES[Math.random() * this.AI_LINES.length | 0]), 600 + Math.random() * 800); }
    } else if (this._isHost()) { this._recv(me, this._name(me), text, shout); Platform.net.broadcast('hud', { kind, seat: me, name: this._name(me), text }); }
    else Platform.net.sendHost('hud', { kind, text });
  },
  _recv(seat, name, text, shout) {
    const c = this._chat; if (!c) return;
    const li = document.createElement('li'); li.className = seat === this._me() ? 'self' : '';
    const b = document.createElement('b'); b.textContent = this._clean(name, 8) + (shout ? ' 📢' : '');
    li.append(b, document.createTextNode('：' + text)); // 只用 textContent，不解析 HTML
    const list = c.querySelector('.hud-clist'); list.append(li); while (list.children.length > 80) list.firstChild.remove(); list.scrollTop = list.scrollHeight;
    if (c.hidden) { this._unread++; this._bChat.classList.add('dot'); this._bMore.classList.add('dot'); }
    this.bubble(seat, text);
    if (shout) Platform.voice.say(text);
  },
  bubble(seat, text) {
    const el = this.o.seatEl(seat); if (!el) return;
    let b = el.querySelector(':scope > .hud-bub');
    if (!b) { b = document.createElement('span'); b.className = 'hud-bub'; el.append(b); }
    b.textContent = this._clean(text, 20); Platform.fx.restart(b, 'on');
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('on'), 2600);
  },

  // ---------- 連線 ----------
  _onNet(d, from) {
    const G = this.G; if (!G || !G.O) return;
    if (G.O.isHost) { // 房主：處理賓客的請求，聊天轉發給所有人（賓客彼此沒有直連）
      const seat = G.O.seatOf[from]; if (seat == null) return;
      if (d.kind === 'auto') this.setAuto(seat, d.on);
      if (d.kind === 'chat' || d.kind === 'shout') {
        const shout = d.kind === 'shout', text = this._clean(d.text, shout ? 6 : 60); if (!text) return;
        const name = this._name(seat); this._recv(seat, name, text, shout);
        Platform.net.broadcast('hud', { kind: d.kind, seat, name, text });
      }
      return;
    }
    if (from !== Platform.net.hostId) return; // 賓客只認房主
    if (d.kind === 'pause') this._applyPause(d.on);
    if (d.kind === 'chat' || d.kind === 'shout') this._recv(+d.seat, d.name, this._clean(d.text, d.kind === 'shout' ? 6 : 60), d.kind === 'shout');
  },

  // ---------- 錯誤回報：複製對局資訊與紀錄 ----------
  copyReport() {
    const G = this.G, st = G.st || {}, g = Platform._active;
    const role = !G.O ? '單機' : G.O.isHost ? '房主' : `賓客（座位 ${this._me() + 1}）`;
    const head = ['=== 牌桌遊戲廳 錯誤回報 ===', `遊戲：${g ? g.name : '?'}`, `時間：${new Date().toLocaleString('zh-TW')}`, `角色：${role}`,
      `階段：${st.phase || st.street || '?'} | 輪到：${st.toAct != null ? st.toAct : st.turn} | 暫停：${!!G._paused}`,
      `玩家：${(st.players || []).map((p, i) => `${i}:${p.name}${p.isAI ? '(電腦)' : ''}${p.auto ? '(代打)' : ''}`).join(' ')}`, '=== 紀錄 ==='];
    const text = head.concat((st.log || []).slice(0, 80)).join('\n');
    const done = () => Platform.toast && Platform.toast('已複製！請貼給房主回報');
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  },
};
