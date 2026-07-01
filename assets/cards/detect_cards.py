#!/usr/bin/env python3
"""detect_cards.py — CV 卡牌偵測擷取工具。

用「逐列背景色分段 + 前景連通元件」找出來源設計比較圖裡所有卡牌矩形（不靠手動座標），
依 (row, col) 排序後裁切匯出：所有輸出尺寸一致、錨點一致、去背透明。
偵測信心不足時直接中止，不猜測。

原理：
1. 每一列（style 分區）背景是單一色塊，掃左邊界像素找出列與列的背景色變化點，自動切出各列的 y 範圍。
2. 對每一列，用該列背景色做色差門檻，取得前景遮罩（= 卡牌 + 標題文字）。
3. 對前景遮罩做連通元件分析，用「長寬比」+「面積」+「填滿率」把卡牌矩形跟標題文字/裝飾線濾出來
   （卡牌是實心矩形，填滿率高；文字/裝飾線稀疏，填滿率低，會被濾掉)。
4. 各列卡牌數量、尺寸離散度都要通過一致性檢查才輸出；任何一關過不了就中止，不猜測、不硬湊。

用法：
    python3 detect_cards.py [--src 來源圖路徑] [--out 輸出資料夾]
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

DEFAULT_SRC = 'D:/lab/GITHUB/game-arcade/291f615c-41de-40cd-9e5e-ebbf565ff6c5.png'
DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'detected')

ASPECT_TARGET = 158 / 221      # 卡牌寬高比（既有素材 cell size 158x221 反推）
ASPECT_TOL = 0.15
MIN_AREA_FRAC = 0.010          # 卡牌面積下限（相對整張圖面積），濾掉雜訊/文字
MAX_AREA_FRAC = 0.035          # 卡牌面積上限，濾掉整排/整頁誤框
MIN_FILL_RATIO = 0.80          # 連通元件面積 / bbox 面積：卡牌是實心矩形，填滿率應該很高
BG_ROW_DIFF_THRESH = 18        # 逐列背景色變化門檻（找分列邊界用）
BG_PIXEL_DIST_THRESH = 26      # 前景/背景色差門檻
CORNER_RADIUS_FRAC = 0.10      # 輸出圓角遮罩半徑（比例於輸出寬）
MIN_ROW_HEIGHT = 40            # 分列邊界抖動雜訊過濾：小於這個高度的段落不當作一列


def split_rows_by_background(img):
    """掃最左邊界（可靠背景區）逐行取色，依顏色變化切出每一列的 (y0, y1) 區間。"""
    h = img.shape[0]
    left_col = img[:, 2, :].astype(np.int16)  # (h, 3)
    bounds = [0]
    for y in range(1, h):
        d = np.abs(left_col[y] - left_col[y - 1]).sum()
        if d > BG_ROW_DIFF_THRESH:
            bounds.append(y)
    bounds.append(h)
    bands = []
    for y0, y1 in zip(bounds[:-1], bounds[1:]):
        if y1 - y0 >= MIN_ROW_HEIGHT:
            bands.append((y0, y1))
    return bands


def row_background_color(img, y0, y1):
    strip = np.concatenate([img[y0:y1, 0:4, :].reshape(-1, 3), img[y0:y1, -4:, :].reshape(-1, 3)], axis=0)
    return np.median(strip, axis=0)


def find_cards_in_row(img, y0, y1, img_area):
    band = img[y0:y1, :, :].astype(np.int16)
    bg = row_background_color(img, y0, y1)
    dist = np.abs(band - bg).sum(axis=2)
    fg = (dist > BG_PIXEL_DIST_THRESH).astype(np.uint8) * 255
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

    n, labels, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    cands = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        bbox_area = w * h
        if bbox_area < img_area * MIN_AREA_FRAC or bbox_area > img_area * MAX_AREA_FRAC:
            continue
        ar = min(w, h) / max(w, h)
        if abs(ar - ASPECT_TARGET) > ASPECT_TOL:
            continue
        fill = area / bbox_area
        if fill < MIN_FILL_RATIO:
            continue
        cands.append((x, y + y0, w, h))
    cands.sort(key=lambda b: b[0])
    return cands


def rounded_mask(w, h, radius):
    mask = np.zeros((h, w), np.uint8)
    cv2.rectangle(mask, (radius, 0), (w - radius, h), 255, -1)
    cv2.rectangle(mask, (0, radius), (w, h - radius), 255, -1)
    for cx, cy in [(radius, radius), (w - radius, radius), (radius, h - radius), (w - radius, h - radius)]:
        cv2.circle(mask, (cx, cy), radius, 255, -1)
    return mask


def main():
    ap = argparse.ArgumentParser(description='CV 偵測設計比較圖裡的卡牌矩形並裁切匯出')
    ap.add_argument('--src', default=DEFAULT_SRC)
    ap.add_argument('--out', default=DEFAULT_OUT)
    args = ap.parse_args()

    if not os.path.exists(args.src):
        sys.exit(f'找不到來源圖：{args.src}')
    img = cv2.imread(args.src, cv2.IMREAD_COLOR)
    if img is None:
        sys.exit(f'讀取失敗：{args.src}')
    img_area = img.shape[0] * img.shape[1]

    bands = split_rows_by_background(img)
    if len(bands) < 2:
        sys.exit(f'偵測到的列數過少（{len(bands)}），信心不足，中止（不猜測）。')

    rows_of = {}
    for ri, (y0, y1) in enumerate(bands):
        boxes = find_cards_in_row(img, y0, y1, img_area)
        if boxes:
            rows_of[ri] = boxes

    if len(rows_of) < 2:
        sys.exit(f'能抓到卡牌的列數過少（{len(rows_of)}），信心不足，中止（不猜測）。')

    counts = [len(v) for v in rows_of.values()]
    if len(set(counts)) != 1:
        sys.exit(f'各列偵測到的卡牌數不一致 {dict((k, len(v)) for k, v in rows_of.items())}，'
                  f'信心不足，中止（不猜測）。')

    all_boxes = [b for v in rows_of.values() for b in v]
    sizes = np.array([[b[2], b[3]] for b in all_boxes], dtype=float)  # [w, h]
    size_cv = sizes.std(axis=0) / sizes.mean(axis=0)
    if (size_cv > 0.15).any():
        sys.exit(f'偵測框尺寸離散過大 CV={size_cv.round(3).tolist()}，信心不足，中止（不猜測）。')

    target_w = int(round(float(np.median(sizes[:, 0]))))
    target_h = int(round(float(np.median(sizes[:, 1]))))
    radius = max(4, int(round(target_w * CORNER_RADIUS_FRAC)))
    mask = rounded_mask(target_w, target_h, radius)

    os.makedirs(args.out, exist_ok=True)
    manifest = {
        'source': os.path.basename(args.src), 'card_width': target_w, 'card_height': target_h,
        'corner_radius': radius, 'rows': len(rows_of), 'cols': counts[0], 'cards': [],
    }

    row_keys = sorted(rows_of)
    for out_ri, ri in enumerate(row_keys):
        for ci, (x, y, w, h) in enumerate(rows_of[ri]):
            crop = img[y:y + h, x:x + w]
            resized = cv2.resize(crop, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
            bgra = cv2.cvtColor(resized, cv2.COLOR_BGR2BGRA)
            bgra[:, :, 3] = mask
            fname = f'card_r{out_ri}_c{ci}.png'
            cv2.imwrite(os.path.join(args.out, fname), bgra)
            manifest['cards'].append({
                'row': out_ri, 'col': ci, 'file': fname,
                'bbox': [int(x), int(y), int(w), int(h)],
            })

    with open(os.path.join(args.out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f'✅ 偵測 {len(all_boxes)} 張卡牌（{len(rows_of)} 列 × {counts[0]} 欄），'
          f'輸出尺寸 {target_w}x{target_h} → {args.out}')


if __name__ == '__main__':
    main()
