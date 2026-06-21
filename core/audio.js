/* 共用音效：Web Audio 程序化 SFX（無音檔）。各遊戲呼叫 Platform.audio.xxx() */
Platform.audio = {
  ctx: null,
  enabled: Platform.store.get('arcade_snd', true),
  vol: Platform.store.get('arcade_svol', 0.6),

  _ac() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  setEnabled(v) { this.enabled = !!v; Platform.store.set('arcade_snd', this.enabled); },
  setVol(v) { this.vol = Math.max(0, Math.min(1, v)); Platform.store.set('arcade_svol', this.vol); },

  // 單一振盪器音符
  _tone(freq, dur, type = 'sine', gain = 0.5, when = 0) {
    if (!this.enabled) return;
    const ac = this._ac(); if (!ac) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * this.vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  // 白噪爆破（開槍 / 洗牌）
  _noise(dur, gain = 0.5, hp = 800) {
    if (!this.enabled) return;
    const ac = this._ac(); if (!ac) return;
    const t = ac.currentTime;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ac.createGain(); g.gain.value = gain * this.vol;
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t);
  },

  click()  { this._tone(660, 0.06, 'square', 0.18); },
  deal()   { this._tone(420, 0.08, 'triangle', 0.25); },
  flip()   { this._tone(520, 0.07, 'triangle', 0.3); this._tone(780, 0.06, 'sine', 0.18, 0.04); },
  chip()   { this._tone(900, 0.05, 'square', 0.2); this._tone(1200, 0.05, 'square', 0.15, 0.03); },
  alert()  { this._tone(330, 0.18, 'sawtooth', 0.3); },
  shot()   { this._noise(0.25, 0.9, 500); this._tone(80, 0.25, 'sawtooth', 0.5); },
  empty()  { this._tone(1000, 0.04, 'square', 0.25); this._tone(700, 0.05, 'square', 0.18, 0.04); }, // 空膛喀
  win()    { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.3, 'triangle', 0.35, i * 0.1)); },
  lose()   { [392, 330, 262].forEach((f, i) => this._tone(f, 0.35, 'sine', 0.3, i * 0.12)); },
};
