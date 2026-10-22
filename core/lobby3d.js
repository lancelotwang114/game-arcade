/* 大廳 3D 背景（ES module，動態載入）：綠絨圓桌 + 撲克、籌碼、骰子、麻將牌，鏡頭慢慢繞桌。
   全部程式建模＋canvas 貼字，不載入任何模型/圖片。mount(host, { active }) → { dispose() }；active() 回傳 false 時（進遊戲）不畫。
   效能：像素比上限 1.5；大廳被隱藏（進遊戲）或分頁切走時停畫；prefers-reduced-motion 只畫一張靜態。 */
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .6, ...o });
const RED = '#c0392b', INK = '#1a1a1a';

// canvas 貼字（牌面／麻將字）
function faceTex(draw, w = 256, h = 356) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const cardFace = (rank, suit) => faceTex((g, w, h) => {
  g.fillStyle = '#faf7ef'; g.fillRect(0, 0, w, h);
  const col = '♥♦'.includes(suit) ? RED : INK; g.fillStyle = col; g.textAlign = 'center';
  g.font = 'bold 64px Georgia, serif'; g.fillText(rank, 44, 74); g.font = '52px serif'; g.fillText(suit, 44, 128);
  g.font = '150px serif'; g.fillText(suit, w / 2, h / 2 + 52);
});
const cardBack = faceTex((g, w, h) => {
  g.fillStyle = '#7a1f24'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e8c56a'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
  g.globalAlpha = .25; for (let i = -h; i < w; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
});
const tileFace = (ch, col) => faceTex((g, w, h) => {
  g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, w, h); g.fillStyle = col; g.textAlign = 'center';
  g.font = 'bold 190px "Noto Serif TC", serif'; g.fillText(ch, w / 2, h / 2 + 66);
}, 256, 320);

function card(rank, suit) {
  const geo = new THREE.BoxGeometry(.63, .006, .88), side = mat(0xf2ede0);
  const m = [side, side, new THREE.MeshStandardMaterial({ map: cardFace(rank, suit), roughness: .5 }), new THREE.MeshStandardMaterial({ map: cardBack, roughness: .5 }), side, side];
  // BoxGeometry 面序：+x,-x,+y,-y,+z,-z → +y 朝上是牌面
  const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; return o;
}
function chipStack(n, color) {
  const grp = new THREE.Group(), body = mat(color, { roughness: .45 }), edge = mat(0xf5f0e6, { roughness: .5 });
  for (let i = 0; i < n; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .045, 32), [body, body, body]);
    c.position.y = .0225 + i * .047; c.rotation.y = Math.random() * 6; c.castShadow = c.receiveShadow = true; grp.add(c);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.2, .006, 6, 32, Math.PI / 4), edge); // 邊緣白條紋
    ring.rotation.x = Math.PI / 2; ring.position.y = c.position.y; ring.rotation.z = Math.random() * 6; grp.add(ring);
  }
  return grp;
}
function die() {
  const s = .26, grp = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat(0xf7f3ea, { roughness: .3 })); cube.castShadow = true; grp.add(cube);
  const pip = new THREE.SphereGeometry(.024, 12, 8), pm = mat(0x111111), rm = mat(0xb3261e);
  const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  const faces = [[1, [0, 1, 0]], [6, [0, -1, 0]], [2, [1, 0, 0]], [5, [-1, 0, 0]], [3, [0, 0, 1]], [4, [0, 0, -1]]];
  faces.forEach(([n, nrm]) => P[n].forEach(([a, b]) => {
    const p = new THREE.Mesh(pip, n === 1 ? rm : pm), d = s / 2, k = .065;
    if (nrm[1]) p.position.set(a * k, nrm[1] * d, b * k); else if (nrm[0]) p.position.set(nrm[0] * d, a * k, b * k); else p.position.set(a * k, b * k, nrm[2] * d);
    p.scale.set(nrm[0] ? .35 : 1, nrm[1] ? .35 : 1, nrm[2] ? .35 : 1); grp.add(p);
  }));
  return grp;
}
function tile(ch, col) {
  const side = mat(0xf4ecd8, { roughness: .35 }), back = mat(0x1f6b4a, { roughness: .35 });
  const face = new THREE.MeshStandardMaterial({ map: tileFace(ch, col), roughness: .35 });
  const o = new THREE.Mesh(new THREE.BoxGeometry(.4, .3, .52), [side, side, face, back, side, side]); o.castShadow = o.receiveShadow = true; return o;
}

export function mount(host, { active = () => true } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070b09); scene.fog = new THREE.Fog(0x070b09, 7, 16);
  const cam = new THREE.PerspectiveCamera(38, 1, .1, 50);

  // 燈光：頭頂暖色聚光 + 微弱環境光 + 冷色輪廓光
  scene.add(new THREE.HemisphereLight(0x3a4a40, 0x0a0806, .55));
  const spot = new THREE.SpotLight(0xffe2b0, 60, 14, .55, .55, 1.6); spot.position.set(0, 6.5, 0); spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -.0004; scene.add(spot, spot.target);
  const rim = new THREE.DirectionalLight(0x6f8cff, .35); rim.position.set(-5, 3, -4); scene.add(rim);

  // 牌桌：綠絨 + 木邊 + 桌腳
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, .12, 96), mat(0x1f6a46, { roughness: .95 }));
  felt.position.y = -.06; felt.receiveShadow = true; scene.add(felt);
  const railM = mat(0x4a2a14, { roughness: .4, metalness: .1 });
  const rail = new THREE.Mesh(new THREE.TorusGeometry(3.08, .16, 24, 120), railM); rail.rotation.x = Math.PI / 2; rail.castShadow = true; scene.add(rail);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.5, .9, 2.2, 32), railM); base.position.y = -1.2; scene.add(base);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), mat(0x120d0a, { roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.3; floor.receiveShadow = true; scene.add(floor);

  // 桌上物件
  const items = new THREE.Group(); scene.add(items);
  [['A', '♠', -.95, .55, -.3], ['K', '♥', -.6, .7, .05], ['Q', '♦', -.25, .6, .35], ['J', '♣', .1, .45, .55]].forEach(([r, s, x, z, ry], i) => {
    const c = card(r, s); c.position.set(x, .01 + i * .007, z); c.rotation.y = ry; items.add(c); });
  const back1 = card('2', '♠'); back1.rotation.set(Math.PI, .4, 0); back1.position.set(1.3, .012, -1); items.add(back1);
  [[0xb3261e, 7, .9, .2], [0x1d4fa3, 5, 1.35, .45], [0x111111, 9, 1.05, .75], [0xd4a843, 4, 1.55, -.05]].forEach(([c, n, x, z]) => {
    const st = chipStack(n, c); st.position.set(x, 0, z); items.add(st); });
  const d1 = die(); d1.position.set(-.3, .13, -.95); d1.rotation.y = .5; items.add(d1);
  const d2 = die(); d2.position.set(.05, .13, -1.15); d2.rotation.set(0, -.3, Math.PI / 2); items.add(d2);
  [['中', RED, -1.6, -.4], ['發', '#1f7a4a', -1.15, -.75], ['東', INK, -1.75, .25]].forEach(([ch, col, x, z], i) => {
    const t = tile(ch, col); t.position.set(x, .15, z); t.rotation.y = .3 + i * .25; items.add(t); });

  // 光束裡的浮塵
  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const a = Math.random() * 6.28, r = Math.random() * 2.6; pos.set([Math.cos(a) * r, Math.random() * 5, Math.sin(a) * r], i * 3); }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe9c0, size: .025, transparent: true, opacity: .55, depthWrite: false })); scene.add(dust);

  const size = () => { const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  const ro = new ResizeObserver(size); ro.observe(host); size();

  let t0 = performance.now(), raf = 0, alive = true;
  const frame = now => {
    const t = (now - t0) / 1000;
    const a = t * .08 + .6, r = 6.2; // 鏡頭繞桌：約 80 秒一圈
    cam.position.set(Math.cos(a) * r, 3.1 + Math.sin(t * .3) * .15, Math.sin(a) * r); cam.lookAt(0, .55, 0); // 看點偏高 → 牌桌落在畫面下半，上方留給標題
    d1.rotation.y = .5 + Math.sin(t * .5) * .05;
    dust.rotation.y = t * .02; dust.position.y = Math.sin(t * .2) * .1;
    renderer.render(scene, cam);
  };
  const loop = now => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden || !active()) return; // 分頁切走或在遊戲裡：不畫，省電
    frame(now);
  };
  if (reduced) frame(t0 + 8000); else raf = requestAnimationFrame(loop);

  return {
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); [].concat(o.material || []).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
