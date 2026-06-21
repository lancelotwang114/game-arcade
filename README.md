# 牌桌遊戲廳 — Table Arcade

> 純前端、零建置的多人/單機桌遊平台。一個大廳，三款博弈娛樂，挑了就玩。

線上展示：部署到 GitHub Pages 後即 `https://<使用者>.github.io/<repo>/`

## 遊戲

| 遊戲 | 玩法 | 單機 AI | 連線 |
|------|------|:---:|:---:|
| 🀄 台灣麻將 3D | 16 張台灣麻將、完整台型，three.js 立體牌桌 | ✅ | 內建 PeerJS |
| 🍺 騙子酒吧 | 吹牛、抓謊、左輪輪盤淘汰 | ✅ | ✅ |
| 🃏 德州撲克 | No-Limit，下注/加注/All-in，含邊池 | ✅ | ✅ |

- **連線**：host 權威 P2P（PeerJS）。大廳點「🌐 連線」開房，複製邀請連結給朋友開即可加入；空位由 AI 補。
- **牌面風格**：德州可即時切換 4 種牌組（經典 / 星辰夜空 / 山水雅韻 / 復古 Art Deco）。

## 技術

- 原生 HTML/CSS/JS，無框架、無打包步驟。
- 外部資源走 CDN：PeerJS、three.js、Google Fonts。
- 共用核心在 `core/`（平台外殼、音效、主題、UI、牌面、連線層）；各遊戲在 `games/<id>/` 以 `Platform.register()` 掛入。
- 無障礙 / 觸控 44px / 手機 RWD / `prefers-reduced-motion` 已處理。

## 本地預覽

```bash
python -m http.server 8080
# 開 http://localhost:8080/
```

## 部署到 GitHub Pages

1. 推到 GitHub repo
2. Settings → Pages → Build and deployment → Source 選 **Deploy from a branch**，Branch 選 `main` / `/ (root)`
3. 等一兩分鐘，開 Pages 給的網址

（已附 `.nojekyll`，確保所有檔案原樣提供。）

## 授權

個人作品。麻將牌素材、撲克宮廷牌素材為自製/衍生。
