/* 騙子酒吧 3D 舞台（ES module，動態載入）：角色、槍、桌子全用 three.js 幾何體程式建模，不載入任何模型/貼圖。
   createStage(host, opts) → api；正式遊戲（liarsbar.js）與預覽頁（preview-3d.html）共用。
   座位 k = 0..3：0 = 相機（第一人稱，自己）、1 右、2 對面、3 左（與 liarsbar.js 的 pos() 一致）。 */
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const V3 = THREE.Vector3;
const KINDS = {
  fox:  { name: '狐狸', coat: 0x5b2a4a, skin: 0xd9772b, light: 0xf4e3cf },
  pig:  { name: '豬',   coat: 0x2f4a5e, skin: 0xe8a3a0, light: 0xf2c4c0 },
  bull: { name: '牛',   coat: 0x4a3a1e, skin: 0x5a3622, light: 0xa07a5a },
  dog:  { name: '狗',   coat: 0x3a2f2a, skin: 0xc9a06a, light: 0xeedcbc },
};
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .62, ...o });
const mesh = (geo, m, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; if (parent) parent.add(o); return o; };

// ---------- 角色（幾何體拼裝；臉朝 +z）----------
function buildHead(kind, h, P) {
  const skin = mat(P.skin), light = mat(P.light), dark = mat(0x161010, { roughness: .3 }), white = mat(0xf7f3ea, { roughness: .25 });
  const ball = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = mesh(new THREE.SphereGeometry(r, 32, 24), m, x, y, z, h); o.scale.set(sx, sy, sz); return o; };
  const ear = (m, s, x, y, z, rz, len = .2, rad = .08) => { const e = mesh(new THREE.ConeGeometry(rad, len, 24), m, s * x, y, z, h); e.scale.z = .45; e.rotation.z = -s * rz; return e; };
  let eyeZ = .155;
  if (kind === 'bull') {
    ball(.2, skin, 0, .2, 0, 1.08, .95, 1);
    ball(.13, light, 0, .1, .15, 1.25, .75, .85);                                      // 鼻口
    [-1, 1].forEach(s => { ball(.018, dark, s * .045, .1, .26); ball(.06, skin, s * .22, .26, -.02, 1.3, .55, .5);   // 鼻孔、耳朵
      const horn = mesh(new THREE.ConeGeometry(.04, .26, 24), mat(0xe9dcc0, { roughness: .35 }), s * .25, .38, 0, h); horn.rotation.z = -s * 1.05; });
    mesh(new THREE.TorusGeometry(.05, .011, 12, 32), mat(0xd4a83a, { metalness: .85, roughness: .25 }), 0, .03, .25, h);
    eyeZ = .165;
  } else {
    ball(.2, skin, 0, .2, 0, 1, kind === 'pig' ? .92 : 1, 1);
    if (kind === 'fox') {
      ball(.12, light, 0, .13, .17, .75, .6, 1.25);                                     // 尖嘴
      ball(.026, dark, 0, .15, .31);
      [-1, 1].forEach(s => { ear(skin, s, .12, .42, -.02, .35); ear(light, s, .12, .4, .0, .35, .13, .045); ball(.07, light, s * .1, .15, .1, 1, .8, .8); });
    } else if (kind === 'pig') {
      ball(.09, light, 0, .15, .19, 1, .8, .5);                                        // 豬鼻
      [-1, 1].forEach(s => { ball(.017, dark, s * .03, .15, .235); ear(skin, s, .15, .38, 0, .9, .12, .065); });
    } else {
      ball(.11, light, 0, .13, .16, 1, .78, 1.15);                                     // 嘴套
      ball(.034, dark, 0, .17, .285);
      [-1, 1].forEach(s => { const e = mesh(new THREE.CapsuleGeometry(.05, .12, 8, 16), mat(0x7a5530), s * .2, .19, -.02, h); e.scale.z = .45; e.rotation.z = s * .25; });
    }
  }
  // 表情骨架：上眼皮（半球殼繞 x 轉下來）、眉毛、嘴（扁橢球，開合 = scale.y）、汗滴
  const lidM = mat(P.skin, { side: THREE.DoubleSide }), browM = mat(0x241612);
  const eyes = [-1, 1].map(s => { const e = new THREE.Group(); e.position.set(s * .075, .26, eyeZ); h.add(e);
    mesh(new THREE.SphereGeometry(.045, 24, 16), white, 0, 0, 0, e); mesh(new THREE.SphereGeometry(.022, 16, 12), dark, 0, 0, .033, e);
    const lid = new THREE.Group(); e.add(lid); mesh(new THREE.SphereGeometry(.05, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidM, 0, 0, 0, lid);
    const b = mesh(new THREE.CapsuleGeometry(.013, .07, 4, 12), browM, s * .075, .335, .158, h); b.rotation.z = Math.PI / 2;
    return { e, lid, b, s };
  });
  const mouth = mesh(new THREE.SphereGeometry(.05, 24, 12), mat(0x3a0c0c, { roughness: .5 }), ...{ fox: [0, .05, .25], pig: [0, .05, .19], bull: [0, 0, .2], dog: [0, .042, .24] }[kind], h);
  mouth.scale.set(1, .1, .4);
  const sweat = mesh(new THREE.SphereGeometry(.018, 12, 10), mat(0xa8d8ff, { roughness: .05, transparent: true, opacity: .85 }), .17, .34, .1, h);
  sweat.scale.y = 1.4; sweat.visible = false;
  return { eyes, mouth, sweat };
}
function buildGun() {
  const g = new THREE.Group(), steel = mat(0x8a8a96, { metalness: .7, roughness: .3 }), wood = mat(0x5a2e16);
  mesh(new THREE.CylinderGeometry(.018, .018, .2, 20), steel, 0, -.17, .02, g);                      // 槍管（沿 -y = 手指方向）
  mesh(new THREE.CylinderGeometry(.045, .045, .065, 12), steel, 0, -.05, .02, g);                     // 轉輪
  mesh(new THREE.BoxGeometry(.04, .12, .05), steel, 0, -.03, .005, g);                                // 機匣
  const grip = mesh(new THREE.BoxGeometry(.04, .055, .11), wood, 0, .03, -.05, g); grip.rotation.x = .35; // 握把（朝 -z = 手心下方）
  const muzzle = new THREE.PointLight(0xffb040, 0, 3); muzzle.position.set(0, -.3, .02); g.add(muzzle);
  const fl = mesh(new THREE.SphereGeometry(.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a }), 0, -.32, .02, g); fl.visible = false; fl.castShadow = false;
  g.userData = { muzzle, fl }; g.visible = false;
  return g;
}
function mkChar(kind) {
  const P = KINDS[kind], g = new THREE.Group(), root = new THREE.Group(); g.add(root);
  const body = new THREE.Group(); body.position.y = .7; root.add(body);
  const prof = [[0, 0], [.27, 0], [.29, .08], [.28, .3], [.25, .48], [.18, .6], [.1, .65], [0, .66]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(prof, 48), mat(P.coat), 0, 0, 0, body).scale.z = .82;              // 軀幹（圓肩）
  mesh(new THREE.SphereGeometry(.13, 24, 16), mat(0xf2ead8), 0, .45, .14, body).scale.set(.75, 1.2, .5); // 襯衫前襟
  mesh(new THREE.ConeGeometry(.035, .2, 16), mat(0x8a1c1c), 0, .44, .215, body).rotation.x = Math.PI;  // 領帶
  const head = new THREE.Group(); head.position.y = .64; body.add(head);
  const face = buildHead(kind, head, P);
  const arm = s => {
    const sh = new THREE.Group(); sh.position.set(s * .3, .52, 0); body.add(sh);
    mesh(new THREE.SphereGeometry(.08, 24, 16), mat(P.coat), 0, 0, 0, sh);
    mesh(new THREE.CapsuleGeometry(.068, .2, 8, 20), mat(P.coat), 0, -.15, 0, sh);
    const el = new THREE.Group(); el.position.y = -.3; sh.add(el);
    mesh(new THREE.CapsuleGeometry(.058, .18, 8, 20), mat(P.coat), 0, -.14, 0, el);
    const wr = new THREE.Group(); wr.position.y = -.29; el.add(wr);
    mesh(new THREE.SphereGeometry(.065, 24, 16), mat(P.skin), 0, -.03, 0, wr).scale.set(1, 1.15, .8);
    return { sh, el, wr };
  };
  const R = arm(1), L = arm(-1), gun = buildGun(); R.wr.add(gun);
  const cup = mesh(new THREE.CylinderGeometry(.045, .038, .11, 24), mat(0xd8c08a, { transparent: true, opacity: .6, roughness: .1 }), 0, -.07, .03, L.wr);
  cup.rotation.x = Math.PI / 2; cup.visible = false;                                              // 喝酒用的杯子（左手）
  const neck = Array.from({ length: 12 }, () => {                                                // 伸長脖子（惡搞）：平常隱藏
    const sg = mesh(new THREE.CylinderGeometry(.062, .062, 1, 16), mat(P.skin), 0, 0, 0, body), jt = mesh(new THREE.SphereGeometry(.062, 16, 12), mat(P.skin), 0, 0, 0, body);
    sg.visible = jt.visible = false; return { sg, jt };
  });
  return { g, root, body, head, face, R, L, gun, cup, neck };
}

// ---------- 姿勢 ----------
// 關節角度（弧度）。手臂自然下垂為 0；sh.x 負 = 往前抬、sh.z 往外抬（右正左負）
export const REST = { bx: 0, by: 0, bz: 0, hx: .08, hy: 0, hz: 0,
  rsx: -.55, rsz: .12, rex: -1.0, rez: 0, rwx: 0, rwz: 0, lsx: -.55, lsz: -.12, lex: -1.0, lez: 0, lwx: 0, fall: 0, drop: 0,
  eb: 0, ea: 0, lid: .1, mo: 0, sw: 0, bob: 0, nk: 0 }; // 表情：眉高、眉角（正 = 生氣、負 = 擔心）、眼皮（-.4 睜大～1 閉）、嘴開、冒汗、大笑抖動、脖子伸長
// 槍口抵右太陽穴：依目標點（肘 .58,.62,.12／腕 .5,.9,.05／槍管指向 -x）反解的關節角
const GUN = { rsx: .88, rsz: 2.08, rex: -1.53, rez: 2.63, rwx: -1.28, rwz: -.42, hz: -.22, hy: .12, bz: -.06 };
// 左手拿杯子到嘴前（數值反解：腕 ≈ -.07,.70,.30，杯口朝嘴）
const DRINK = { lsx: -1.65, lsz: -.05, lex: -1.55, lez: -1, lwx: -.2 };
const WORRY = { ea: -.4, eb: .03, lid: -.3, sw: 1, mo: .15 };
const DEAD = { ...REST, fall: -1.35, drop: .25, lsz: -1.2, rsz: 1.2, rsx: 0, rez: .3, hx: .4, lid: 1 };
// 伸長脖子：頭沿二次貝茲曲線（頸根 → 高處控制點 → 目標牌上方）移動，nk = 0～1 進度
const UP = new V3(0, 1, 0), NECK0 = new V3(0, .6, 0), HEAD0 = new V3(0, .64, 0);
const _end = new V3(), _ctl = new V3(), _a = new V3(), _b = new V3(), _hp = new V3();
const bez = (o, u) => o.set(0, 0, 0).addScaledVector(NECK0, (1 - u) ** 2).addScaledVector(_ctl, 2 * (1 - u) * u).addScaledVector(_end, u * u);
function layNeck(c, nk, peek, t) {
  const on = Math.abs(nk) > .01 && peek;
  c.neck.forEach(n => n.sg.visible = n.jt.visible = !!on);
  if (!on) { c.head.position.copy(HEAD0); return; }
  c.body.worldToLocal(_end.copy(peek)).y -= .2;                                   // 目標是頭中心，頭的原點在中心下方 .2
  _end.lerpVectors(HEAD0, _end, nk).add(_a.set(Math.sin(t * 1.7) * .03, Math.sin(t * 2.3) * .015, 0).multiplyScalar(nk)); // 緩慢小擺
  _ctl.set(_end.x * .25, Math.max(_end.y, .64) + .9 * Math.min(1, Math.abs(nk)), _end.z * .25);
  c.head.position.copy(_end);
  const N = c.neck.length;
  c.neck.forEach((n, i) => {
    bez(_a, i / N); bez(_b, (i + 1) / N);
    n.jt.position.copy(_b); n.sg.position.addVectors(_a, _b).multiplyScalar(.5);
    const len = _a.distanceTo(_b); n.sg.scale.set(1, len, 1); n.sg.quaternion.setFromUnitVectors(UP, _b.sub(_a).normalize());
  });
}
const ease = u => u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;

class Actor {
  constructor(kind, seat, scene) {
    this.kind = kind; this.seat = seat; this.c = mkChar(kind); this.p = { ...REST }; this.q = []; this.k = null; this.shake = 0; this.seed = Math.random() * 100;
    this.look = null; this.lw = 0; this.yaw = 0; this.pit = 0; // 指定視線：Vector3 或回傳 Vector3 的函式；null = 自然東張西望
    const a = seat * Math.PI / 2, R = 1.72;
    this.c.g.position.set(Math.sin(a) * R, 0, Math.cos(a) * R); this.c.g.rotation.y = a + Math.PI;
    scene.add(this.c.g);
  }
  get busy() { return !!(this.k || this.q.length); }
  get alive() { return Math.abs(this.p.fall) < .3; }
  lookAt(target) { this.look = target; }
  play(seq) { this.q = seq.slice(); this.k = null; this.c.cup.visible = false; } // 被打斷時杯子不留在手上（槍由 aim 自己拿出）
  // 立即擺好姿勢（不動畫）：換局重置／已淘汰躺著
  pose(p) { this.q = []; this.k = null; this.shake = 0; Object.assign(this.p, REST, p); this.c.gun.visible = this.c.cup.visible = false; }
  update(dt, t) {
    if (!this.k && this.q.length) { this.k = this.q.shift(); this.t = 0; this.from = { ...this.p }; if (this.k.ev) this.k.ev(this); }
    if (this.k) {
      this.t += dt; const u = Math.min(1, this.t / (this.k.d || .001)), e = (this.k.lin ? u : ease(u));
      for (const j in this.k.p || {}) this.p[j] = this.from[j] + (this.k.p[j] - this.from[j]) * e;
      if (u >= 1) this.k = null;
    }
    const p = this.p, c = this.c, s = this.seed, alive = this.alive;
    // 疊加待機：呼吸、東張西望、握槍發抖
    const br = alive ? Math.sin(t * 1.6 + s) * .025 : 0, look = alive ? Math.sin(t * .45 + s) * .35 + Math.sin(t * 1.3 + s * 2) * .06 : 0;
    const tr = this.shake * (Math.sin(t * 47 + s) * .03), trb = this.shake * Math.sin(t * 31) * .02;
    // 指定視線：目標換到角色座標 → 偏航／俯仰（限幅），身體分 30%、頭 70%、眼珠再多轉一點；與自然張望平滑切換
    let yaw = 0, pit = 0;
    const tg = this.look && (typeof this.look === 'function' ? this.look() : this.look);
    if (tg) {
      _hp.set(0, 1.54, 0); if (this.peekAt && p.nk) _hp.lerp(c.g.worldToLocal(_a.copy(this.peekAt)), p.nk); // 頭的參考位置（不讀上一幀，免回授抖動）
      const v = c.g.worldToLocal(tg.clone()).sub(_hp), flat = Math.hypot(v.x, v.z);
      if (flat > .12) yaw = Math.max(-1.3, Math.min(1.3, Math.atan2(v.x, v.z))); else yaw = this.yaw;          // 目標幾乎在正下方：維持原方向
      pit = Math.max(-.5, Math.min(.9, -Math.atan2(v.y, flat)));
    }
    const k = Math.min(1, dt * 8); this.yaw += (yaw - this.yaw) * k; this.pit += (pit - this.pit) * k; yaw = this.yaw; pit = this.pit;
    this.lw += ((tg && alive ? 1 : 0) - this.lw) * Math.min(1, dt * 5);
    const w = this.lw, nat = look * (1 - w);
    c.body.rotation.set(p.bx + br, p.by + nat * .25 + yaw * .3 * w, p.bz);
    c.head.rotation.set(p.hx - br * 1.5 + trb + pit * w, p.hy + nat + yaw * .7 * w, p.hz);
    c.face.eyes.forEach(o => o.e.rotation.set(pit * .3 * w, Math.max(-.35, Math.min(.35, yaw * .3)) * w, 0));
    c.R.sh.rotation.set(p.rsx + tr, 0, p.rsz + tr); c.R.el.rotation.set(p.rex, 0, p.rez); c.R.wr.rotation.set(p.rwx, 0, p.rwz);
    c.L.sh.rotation.set(p.lsx + br, 0, p.lsz); c.L.el.rotation.set(p.lex, 0, -p.lez); c.L.wr.rotation.x = p.lwx;
    c.root.rotation.z = p.fall; c.root.position.y = -p.drop;
    // 表情：眨眼、眉毛、嘴；大笑 = 嘴巴開合＋身體上下抖
    const f = c.face, laugh = p.bob * Math.abs(Math.sin(t * 16));
    const lid = !alive || ((t + s) % 4.3) < .12 ? 1 : p.lid;
    f.eyes.forEach(o => { o.lid.rotation.x = -.7 + lid * 2.2; o.b.position.y = .335 + p.eb; o.b.rotation.z = Math.PI / 2 + o.s * p.ea; });
    f.mouth.scale.y = .1 + Math.max(0, p.mo + laugh * .5) * .8;
    c.body.position.y = .7 + laugh * .02;
    c.g.updateMatrixWorld(true); layNeck(c, p.nk, this.peekAt, t);
    f.sweat.visible = p.sw > .5; if (f.sweat.visible) f.sweat.position.y = .36 - ((t * .5 + s) % 1) * .2;
  }
}

// ---------- 舞台 ----------
// opts: { kinds: 座位 0..3 的角色, sfx(key), onFlash(strength), cards: 是否顯示 3D 牌堆與出牌飛牌, reducedMotion }
// sfx key：cock / click / shot / slam / glass / slide / place / shove
export function createStage(host, opts = {}) {
  const RM = opts.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sfx = opts.sfx || (() => {}), onFlash = opts.onFlash || (() => {});
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'lb-3d';
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0806); scene.fog = new THREE.Fog(0x0b0806, 4, 11);
  const camera = new THREE.PerspectiveCamera(55, 1, .05, 50); scene.add(camera); // 加進場景：第一人稱的槍掛在相機上
  let tall = false; // 直式：拉遠＋放寬視角，左右兩家才看得到
  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h); camera.aspect = w / h; tall = camera.aspect < 1; camera.fov = tall ? 88 : 55; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  scene.add(new THREE.HemisphereLight(0x6a5a8a, 0x1a0e06, .35));
  const lamp = new THREE.SpotLight(0xffc27a, 60, 9, .75, .55, 1.6);
  lamp.position.set(0, 3.1, 0); lamp.target.position.set(0, 0, 0); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024);
  scene.add(lamp, lamp.target);
  const fill = new THREE.PointLight(0xff9a4a, 4, 6); fill.position.set(0, 1.9, 0); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x5a7ad0, .6); rim.position.set(-3, 3, -4); scene.add(rim);
  // 吊燈
  mesh(new THREE.ConeGeometry(.42, .32, 40, 1, true), mat(0x2a1a0e, { side: THREE.DoubleSide }), 0, 2.75, 0, scene);
  mesh(new THREE.SphereGeometry(.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), 0, 2.62, 0, scene);
  mesh(new THREE.CylinderGeometry(.01, .01, 1.2, 4), mat(0x111111), 0, 3.5, 0, scene);
  // 地板、桌子
  const floor = mesh(new THREE.CircleGeometry(9, 40), mat(0x24160c), 0, 0, 0, scene); floor.rotation.x = -Math.PI / 2;
  mesh(new THREE.CylinderGeometry(1.25, 1.25, .07, 72), mat(0x3d1e12), 0, .8, 0, scene);              // 桌面
  mesh(new THREE.CylinderGeometry(1.14, 1.14, .075, 72), mat(0x1f4a2e, { roughness: .95 }), 0, .802, 0, scene); // 綠絨布
  mesh(new THREE.TorusGeometry(1.24, .045, 12, 72), mat(0x5a2f18), 0, .83, 0, scene).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(.12, .3, .78, 10), mat(0x2a150b), 0, .39, 0, scene);
  // 桌上道具：牌堆（可關，正式遊戲牌堆由畫面層負責）、酒杯、酒瓶
  const cardGeo = new THREE.BoxGeometry(.13, .006, .19), cardMat = mat(0x7a1c1c);
  const pile = new THREE.Group(); pile.position.set(0, .845, 0); scene.add(pile);
  const addPileCard = () => { const c = mesh(cardGeo, cardMat, (Math.random() - .5) * .08, pile.children.length * .007, (Math.random() - .5) * .08, pile); c.rotation.y = Math.random() * 3; };
  if (opts.cards !== false) for (let i = 0; i < 4; i++) addPileCard();
  const glassM = mat(0xd8c08a, { transparent: true, opacity: .45, roughness: .1 });
  [[.55, .45], [-.6, .35], [.4, -.6]].forEach(([x, z]) => mesh(new THREE.CylinderGeometry(.045, .04, .12, 24), glassM, x, .9, z, scene));
  mesh(new THREE.CylinderGeometry(.06, .07, .3, 24), mat(0x1d3b1a, { roughness: .2 }), -.35, 1, -.55, scene);
  mesh(new THREE.CylinderGeometry(.02, .03, .1, 16), mat(0x1d3b1a, { roughness: .2 }), -.35, 1.2, -.55, scene);

  const kinds = opts.kinds || ['fox', 'pig', 'bull', 'dog'];
  const actors = kinds.map((k, i) => new Actor(k, i, scene));
  let fp = true, camShake = 0;
  const center = new V3(0, 1.05, 0);
  const headOf = i => () => actors[(i + 4) % 4].c.head.localToWorld(new V3(0, .25, 0));
  const camPos = () => camera.position;
  const flyers = [];
  const flyCard = actor => {
    if (opts.cards === false) return;
    const from = new V3(); actor.c.R.wr.getWorldPosition(from);
    const c = mesh(cardGeo, cardMat, from.x, from.y, from.z, scene);
    flyers.push({ o: c, from, to: new V3((Math.random() - .5) * .1, .845 + pile.children.length * .007, (Math.random() - .5) * .1), t: 0, d: .45, spin: Math.random() * 4 });
  };
  const muzzle = (a, on) => { const u = a.c.gun.userData; u.muzzle.intensity = on ? 40 : 0; u.fl.visible = on; };
  const bang = () => { camShake = RM ? 0 : .6; onFlash(RM ? .15 : .55); };

  // ---------- 動作：回傳關鍵影格陣列 ----------
  const aimSteps = hold => [
    { d: .1, ev: x => { x.c.gun.visible = true; sfx('cock'); } },
    { d: .7, p: { ...GUN, ...WORRY } },
    { d: hold, p: { hx: .2, lid: 1, ea: .35, mo: .05 }, ev: x => x.shake = 1.6 },              // 閉眼咬牙發抖
  ];
  const hitSteps = () => [
    { d: .06, p: { hz: -1.1, hy: -.4, bz: -.25, mo: .7, sw: 0 }, lin: true, ev: x => {
      actors.forEach(o => { if (o !== x && o.alive && !o.busy && o.c.g.visible) o.play(ACTIONS.shock(o)); }); // 其他人嚇一跳
      x.shake = 0; sfx('shot'); muzzle(x, true); bang(); setTimeout(() => muzzle(x, false), 70);
    } },
    { d: .25, p: { rsz: 1.2, rsx: 0, rez: .3 }, ev: x => { x.c.gun.visible = false; } },
    { d: .9, p: { fall: -1.35, drop: .25, lsz: -1.2, hx: .4 } },                                // 往旁邊倒下
  ];
  const missSteps = () => [
    { d: .08, p: { hz: -.38, lid: -.4, eb: .045, ea: -.2 }, ev: x => { x.shake = 0; sfx('click'); } }, // 睜大眼
    { d: .5, p: { hz: -.15, hx: -.25, bx: -.15, mo: .45, lid: .3, ea: -.15, sw: 0 } },          // 鬆一口氣：往後仰、吐氣
    { d: .7, p: { ...REST } },
    { d: .01, ev: x => x.c.gun.visible = false },
  ];
  const ACTIONS = {
    play: a => [
      { d: .35, p: { rsx: -1.25, rex: -.25, hx: .3, bx: .12, lid: .4, ea: .15 } },   // 瞇眼、賊笑
      { d: .25, p: { rsx: -1.4, rex: -.05 }, ev: x => { flyCard(x); if (opts.cards !== false) sfx('slide'); } },
      { d: .2, ev: () => { if (opts.cards !== false) setTimeout(() => sfx('place'), 250); } },
      { d: .5, p: { ...REST } },
    ],
    liar: a => [
      { d: .18, p: { bx: .28, lsx: -1.4, lex: -.2, lsz: -.1, hx: -.15, ea: .5, eb: -.01, lid: .15 } },
      { d: .1, p: { lsx: -.9, lex: -.6, bx: .32, mo: .9 }, ev: () => { sfx('slam'); camShake = RM ? 0 : .25; } },
      { d: .3, p: { rsx: -1.55, rex: 0, rsz: -.15, hx: -.1, hy: .0, mo: .65 } },
      { d: 1.0, p: { mo: .3 } },
      { d: .6, p: { ...REST } },
    ],
    raise: a => [...aimSteps(1.6), { d: .6, p: { ...REST }, ev: x => x.shake = 0 }, { d: .01, ev: x => x.c.gun.visible = false }],
    click: a => [...aimSteps(1.2), ...missSteps()],
    bang: a => [...aimSteps(1.4), ...hitSteps(), { d: 1.8, p: {} }, { d: .01, p: { ...REST, drop: 2 } }, { d: .9, p: { ...REST } }], // 預覽：換一位從地板升回來
    // 正式遊戲：舉槍等結果（無限期）→ fireHit 倒地不起／fireMiss 鬆一口氣
    aim: a => aimSteps(999),
    fireHit: a => hitSteps(),
    fireMiss: a => missSteps(),
    shock: a => [
      { d: .15, p: { bx: -.2, hx: -.2, eb: .045, ea: -.25, lid: -.4, mo: .9 } },
      { d: 1.2, p: { mo: .5 } },
      { d: .8, p: { ...REST } },
    ],
    drink: a => [
      { d: .35, p: { lsx: -1.15, lex: -.35, hx: .15 } },
      { d: .01, ev: x => { x.c.cup.visible = true; sfx('glass'); } },
      { d: .55, p: { ...DRINK, hx: -.3, lid: .7, mo: .3 } },
      { d: .9, p: { hx: -.4 } },
      { d: .45, p: { lsx: -1.15, lex: -.35, lwx: 0, hx: .1, lid: .55, mo: .1, ea: -.1 } },     // 放下杯子、滿足
      { d: .01, ev: x => { x.c.cup.visible = false; sfx('glass'); } },
      { d: .5, p: { ...REST } },
    ],
    laugh: a => [
      { d: .3, p: { bx: -.22, hx: -.35, lid: .75, mo: .6, eb: .02, ea: -.1, bob: 1, rsx: -.3, rex: -1.4 } },
      { d: 1.6, p: {} },
      { d: .5, p: { ...REST } },
    ],
    nervous: a => [
      { d: .3, p: { ...WORRY, bx: .08, hx: .15 } },
      { d: .35, p: { hy: -.6 } }, { d: .35, p: { hy: .6 } }, { d: .3, p: { hy: -.1, rex: -1.3 } },   // 左右張望
      { d: .12, p: { rex: -.9 } }, { d: .12, p: { rex: -1.3 } }, { d: .12, p: { rex: -.9 } }, { d: .12, p: { rex: -1.3 } }, // 手指敲桌
      { d: .6, p: { ...REST } },
    ],
    // 伸長偷看下家的牌（惡搞，看不到牌）：故障抖兩下 → 竄過去 → 賊笑盯牌 → 轉頭看鏡頭（被抓包）→ 啵一聲縮回
    peek: a => {
      const ti = (a.seat + 1) % 4, ang = ti * Math.PI / 2, cards = new V3(Math.sin(ang) * 1.05, .86, Math.cos(ang) * 1.05);
      return [
        { d: .01, ev: x => { x.peekAt = new V3(cards.x * .62, 1.3, cards.z * .62); x._look = x.look; sfx('slide'); } },
        { d: .07, p: { nk: .14 }, lin: true }, { d: .06, p: { nk: .02 }, lin: true }, { d: .07, p: { nk: .2 }, lin: true }, { d: .06, p: { nk: .05 }, lin: true },
        { d: .5, p: { nk: 1, eb: .03, lid: -.2, mo: .25 }, ev: x => { x.lookAt(cards); sfx('slide'); } },
        { d: 1.3, p: { lid: .45, ea: .3, eb: 0, mo: .35 }, ev: x => { if (x.onPeek) x.onPeek(ti); } },   // 保留：要讓偷看有效果（看一張牌／被抓包懲罰）從 onPeek 接
        { d: .35, p: { lid: -.35, eb: .045, ea: -.2, mo: .6 }, ev: x => x.lookAt(camPos) },            // 被抓包
        { d: .7, p: {} },
        { d: .16, p: { nk: -.06 }, lin: true, ev: x => { x.lookAt(x._look); sfx('shove'); } },
        { d: .3, p: { ...REST } },
      ];
    },
    cheer: a => [
      { d: .35, p: { rsz: 2.7, rsx: 0, rex: -.2, rez: 0, lsz: -2.7, lsx: 0, lex: -.2, lez: 0, eb: .04, ea: -.15, mo: .9, lid: .3, bx: -.1, hx: -.2, bob: .6 } },
      { d: 1.2, p: {} },
      { d: .6, p: { ...REST } },
    ],
  };

  // ---------- 第一人稱：自己對太陽穴開槍 ----------
  // 槍掛在相機上（槍管朝畫面左、握把朝下）；state: aim 舉起發抖 → hit 閃光＋鏡頭倒下再慢慢回來看戲／miss 喀一聲放下
  // 槍管方向 d 朝自己太陽穴（往左＋往後），畫面只露出右緣的轉輪、握把和手；相機上掛一盞小燈照亮
  const fpg = buildGun(); fpg.scale.setScalar(1.25);
  { const d = new V3(-.3, .06, 1).normalize(), y = d.clone().negate(), z = new V3(0, 1, 0).addScaledVector(y, -y.y).normalize(), x = new V3().crossVectors(y, z);
    fpg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); }
  mesh(new THREE.SphereGeometry(.075, 24, 16), mat(KINDS[kinds[0]].skin), 0, .02, -.05, fpg).scale.set(1, 1.2, .9); // 握槍的手
  camera.add(fpg);
  const fpl = new THREE.PointLight(0xffd2a0, 2.5, 1.5); fpl.position.set(.2, .25, 0); camera.add(fpl);
  const fpS = { st: 'off', t: 0, up: 0, fall: 0 };
  const fpGun = st => { fpS.st = st; fpS.t = 0; if (st === 'aim') { fpg.visible = true; sfx('cock'); } if (st === 'miss') sfx('click');
    if (st === 'hit') { sfx('shot'); muzzle({ c: { gun: fpg } }, true); setTimeout(() => muzzle({ c: { gun: fpg } }, false), 70); bang();
      actors.forEach(o => { if (o.alive && !o.busy && o.c.g.visible) o.play(ACTIONS.shock(o)); }); } };

  // ---------- 待機：正式遊戲裡電腦／對手偶爾喝酒、大笑；槍膛快滿的人緊張 ----------
  let idle = false, idleT = 4;
  const doIdle = dt => {
    if (!idle || (idleT -= dt) > 0) return;
    idleT = 5 + Math.random() * 5;
    const free = actors.filter((a, i) => (!fp || i) && a.alive && !a.busy && a.c.g.visible);
    if (!free.length) return;
    const a = free[Math.random() * free.length | 0];
    a.play(ACTIONS[a.tense && Math.random() < .6 ? 'nervous' : Math.random() < .75 ? 'drink' : 'laugh'](a));
  };

  let mx = 0, my = 0, lx = 0, ly = 0;
  const onMove = e => { const r = host.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width * 2 - 1; my = (e.clientY - r.top) / r.height * 2 - 1; };
  host.addEventListener('pointermove', onMove);
  const clock = new THREE.Clock();
  let onTick = null;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    if (onTick) onTick(dt, t);
    doIdle(dt);
    actors.forEach(a => a.update(dt, t));
    actors[0].c.g.visible = !fp;
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i]; f.t += dt; const u = Math.min(1, f.t / f.d);
      f.o.position.lerpVectors(f.from, f.to, ease(u)); f.o.position.y += Math.sin(u * Math.PI) * .15; f.o.rotation.y = f.spin * (1 - u);
      if (u >= 1) { scene.remove(f.o); addPileCard(); if (pile.children.length > 14) pile.remove(pile.children[0]); flyers.splice(i, 1); }
    }
    fill.intensity = 4 + Math.sin(t * 9) * .25 + (!RM && Math.random() < .02 ? -1.5 : 0);   // 燈泡閃爍
    if (!RM) { lx += (mx - lx) * .06; ly += (my - ly) * .06; }                  // 減少動態效果：鏡頭不跟游標
    // 第一人稱槍：up 0→1 舉起；hit 時鏡頭往旁邊倒（roll）＋下沉，約 3 秒後回來
    fpS.t += dt;
    const upT = fpS.st === 'aim' ? 1 : fpS.st === 'hit' ? (fpS.t < .15 ? 1 : 0) : fpS.st === 'miss' ? (fpS.t < .6 ? 1 : 0) : 0;
    fpS.up += (upT - fpS.up) * Math.min(1, dt * 6);
    const fallT = !RM && fpS.st === 'hit' && fpS.t < 3.2 ? 1 : 0;                // 減少動態效果：中彈不翻鏡頭（仍有閃光）
    fpS.fall += (fallT - fpS.fall) * Math.min(1, dt * (fallT ? 5 : 1.2));
    if (fpS.st !== 'aim' && fpS.up < .02) fpg.visible = false;
    const shk = fpS.st === 'aim' && !RM ? 1 : 0;
    fpg.position.set(.36 + Math.sin(t * 43) * .005 * shk, -.6 + fpS.up * .5 + Math.sin(t * 37) * .005 * shk, -.42);
    if (fp) {
      camera.position.set(lx * .08, (tall ? 2.5 : 1.55) - fpS.fall * .7, tall ? 2.7 : 2.25); // 直式：拉高往下看，桌子與三家都進畫面
      camera.lookAt(center.x + lx * .7, (tall ? .8 : center.y) - ly * .25 - fpS.fall * .6, center.z);
      camera.rotateZ(fpS.fall * 1.1);
    } else { const a = t * .12; camera.position.set(Math.sin(a) * 4, 2.5, Math.cos(a) * 4); camera.lookAt(center); }
    if (camShake > 0) { camera.position.x += (Math.random() - .5) * camShake * .08; camera.position.y += (Math.random() - .5) * camShake * .08; camShake = Math.max(0, camShake - dt * 1.5); }
    renderer.render(scene, camera);
  });

  return {
    THREE, scene, camera, actors, ACTIONS, KINDS, center,
    act(seat, name) { const a = actors[seat]; if (a && ACTIONS[name]) a.play(ACTIONS[name](a)); },
    // target：'me' = 相機、數字 = 看某座位的頭、'pile' = 牌堆、Vector3／函式、null = 自然
    look(seat, target) { const a = actors[seat]; if (!a) return;
      a.lookAt(target === 'me' ? camPos : typeof target === 'number' ? headOf(target) : target === 'pile' ? new V3(0, .86, 0) : target || null); },
    headOf, fpGun, setFP(v) { fp = v; }, get fp() { return fp; }, pointer: () => ({ x: mx, y: my }),
    setDead(seat, dead) { const a = actors[seat]; if (a) a.pose(dead ? DEAD : {}); },
    setIdle(v) { idle = v; },
    set onTick(fn) { onTick = fn; },
    dispose() {
      renderer.setAnimationLoop(null); ro.disconnect(); host.removeEventListener('pointermove', onMove);
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
