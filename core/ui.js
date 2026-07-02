/* 共用 UI：toast / modal / 粒子 / 視窗縮放 */
Platform.toast = function (msg, ms = 1800) {
  let host = document.getElementById('toast-host');
  if (!host) { host = document.createElement('div'); host.id = 'toast-host'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
};

Platform.ui = {
  // 全螢幕遮罩對話框。buttons: [{label, primary, onClick}]。回傳 {el, close}
  modal({ title = '', html = '', buttons = [] } = {}) {
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    const box = document.createElement('div');
    box.className = 'modal-box';
    box.innerHTML = (title ? `<h2 class="modal-title">${title}</h2>` : '') + `<div class="modal-body">${html}</div>`;
    const row = document.createElement('div');
    row.className = 'modal-btns';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn' + (b.primary ? ' btn-primary' : '');
      btn.textContent = b.label;
      btn.onclick = () => { if (b.onClick) b.onClick(close); else close(); };
      row.appendChild(btn);
    });
    box.appendChild(row);
    ov.appendChild(box);
    document.body.appendChild(ov);
    const prevFocus = document.activeElement;
    requestAnimationFrame(() => ov.classList.add('show'));
    const first = row.querySelector('.btn-primary') || row.querySelector('button');
    if (first) first.focus();
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    function close() {
      document.removeEventListener('keydown', onKey);
      ov.classList.remove('show'); setTimeout(() => ov.remove(), 250);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    return { el: box, close };
  },

  // 視窗縮放：把固定設計尺寸 el 等比縮放塞進 parent
  fitScale(el, designW, designH) {
    const parent = el.parentElement;
    const apply = () => {
      const pw = parent.clientWidth, ph = parent.clientHeight;
      const s = Math.min(pw / designW, ph / designH);
      el.style.transform = `translate(-50%,-50%) scale(${s})`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(parent);
    el._fitRO = ro; // 供 unmount 斷開
    return apply;
  },
};

Platform.fx = {
  // 在 (cx,cy) 視窗座標噴彩帶
  confetti(cx, cy, n = 28) {
    const host = document.body;
    const colors = ['#d4a843', '#e8c56a', '#3fae6b', '#c9514d', '#5b8cc9', '#fff'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-p';
      const ang = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 160;
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', (Math.sin(ang) * dist - 80) + 'px');
      p.style.setProperty('--dur', (0.7 + Math.random() * 0.6) + 's');
      host.appendChild(p);
      setTimeout(() => p.remove(), 1500);
    }
  },
};
