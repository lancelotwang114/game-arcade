/* 共用動畫時間軸 + 實錄音效播放器（德州、騙子酒吧與之後的新遊戲共用）
   原則：動畫/音效純裝飾。DOM 最終狀態由遊戲同步寫入，這裡只負責「延後顯示」與「飛行/滾動」效果，
   不提供任何動畫結束回呼（背景分頁 rAF 停擺時 onfinish 不會觸發，牌局不能等它）。 */
Object.assign(Platform.fx, {
  reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; },
  // 重新觸發一次 CSS 動畫 class
  restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); },

  // 動畫時間軸：綁定一個根元素，飛行元素掛在它底下（沿用遊戲的 CSS 變數與樣式）；clear() 一次清掉所有排程與飛行中元素
  timeline(root) {
    const timers = [], fx = this;
    const tl = {
      after(fn, ms) { timers.push(setTimeout(fn, fx.reduced() ? 0 : ms)); },
      clear() { timers.splice(0).forEach(clearTimeout); root.querySelectorAll('[data-fx-fly]').forEach(e => e.remove()); },
      // 從 from 飛到 to（html 為飛行內容）；rot = [起始角度, 結束角度]
      fly(from, to, html, dur, delay = 0, rot = [0, 0]) {
        if (!from || !to || fx.reduced()) return;
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(); if (!a.width || !b.width) return;
        const w = document.createElement('div'); w.dataset.fxFly = ''; w.innerHTML = html;
        w.style.cssText = 'position:fixed;left:0;top:0;z-index:70;pointer-events:none';
        root.appendChild(w);
        const at = (r, d) => `translate(${r.left + r.width / 2}px,${r.top + r.height / 2}px) translate(-50%,-50%) rotate(${d}deg)`;
        w.animate([{ transform: at(a, rot[0]) }, { transform: at(b, rot[1]) }], { duration: dur, delay, easing: 'cubic-bezier(.3,.7,.25,1)', fill: 'both' });
        tl.after(() => w.remove(), dur + delay + 40);
      },
      // 數字滾動；同一元素有新目標時，舊的滾動自動停止
      count(el, to, dur, delay = 0) {
        el.dataset.v = to;
        const run = () => {
          if (+el.dataset.v !== to) return;
          if (fx.reduced()) { el.textContent = to; return; }
          const from = +el.textContent || 0, t0 = performance.now();
          const tick = () => { if (+el.dataset.v !== to) return; const k = Math.min(1, (performance.now() - t0) / dur);
            el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) tl.after(tick, 16); };
          tick();
        };
        delay ? tl.after(run, delay) : run();
      },
    };
    return tl;
  },

  // 實錄音效播放器。files = { key: '檔名' }；play('card-slide') 會在 card-slide-1..n 中隨機挑一個並微調音高
  sampler(base, files) {
    const A = () => Platform.audio, ac = () => A() && A()._ac();
    return {
      buf: {}, _ld: null, amb: null,
      load() {
        if (this._ld) return this._ld; const c = ac(); if (!c) return Promise.resolve();
        // decodeAudioData 用回呼寫法：舊版 iOS Safari 不支援 Promise 版
        return this._ld = Promise.all(Object.entries(files).map(([k, f]) => fetch(base + f).then(r => r.arrayBuffer())
          .then(a => new Promise((ok, no) => c.decodeAudioData(a, ok, no))).then(b => { this.buf[k] = b; }).catch(() => {})));
      },
      // iOS/Android：須在使用者手勢內恢復 AudioContext 並播一段靜音才算解鎖
      unlock() { const c = ac(); if (!c) return; try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch (e) {} },
      play(name, { gain = .8, when = 0, rate = 1, jitter = true } = {}) {
        if (!A().enabled) return; const c = ac(); if (!c) return;
        const keys = Object.keys(this.buf).filter(k => k === name || k.startsWith(name + '-')); if (!keys.length) return;
        const s = c.createBufferSource(), g = c.createGain();
        s.buffer = this.buf[keys[Math.random() * keys.length | 0]]; s.playbackRate.value = rate * (jitter ? .95 + Math.random() * .1 : 1);
        g.gain.value = gain * A().vol; s.connect(g).connect(c.destination); s.start(c.currentTime + when);
      },
      // 環境音循環（淡入/淡出）
      ambience(on, { key = 'ambience', level = .32 } = {}) {
        const c = ac(); if (!c) return;
        if (on && A().enabled && !this.amb && this.buf[key]) {
          const s = c.createBufferSource(), g = c.createGain(); s.buffer = this.buf[key]; s.loop = true;
          g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(level * A().vol, c.currentTime + 2);
          s.connect(g).connect(c.destination); s.start(); this.amb = { s, g };
        }
        if (!on && this.amb) { const a = this.amb; this.amb = null; a.g.gain.linearRampToValueAtTime(0, c.currentTime + .5); setTimeout(() => { try { a.s.stop(); } catch (e) {} }, 600); }
      },
      // 暫時壓低/恢復環境音
      duck(level, sec) { if (!this.amb) return; const c = ac(), t = c.currentTime; this.amb.g.gain.cancelScheduledValues(t); this.amb.g.gain.linearRampToValueAtTime(level * A().vol, t + sec); },
    };
  },
});
