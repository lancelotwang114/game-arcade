# Generates standard 52-card sprite sheets for 4 styles (A/B/C/D from the source comparison image).
# Number cards (A-10) rendered to match each style's palette; J/Q/K + back cropped from the source art (spade only).
# 280x392 per card, 13 cols x 4 rows, suits S,H,D,C, ranks A..K, 0 gap, transparent bg.
import os, json, random
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))
SRC = 'D:/lab/GITHUB/game-arcade/291f615c-41de-40cd-9e5e-ebbf565ff6c5.png'
src = Image.open(SRC).convert('RGBA')
CW, CH = 280, 392
COLS, ROWS = 13, 4
SUITS = ['S', 'H', 'D', 'C']
GLYPH = {'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣'}
RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
FD = 'C:/Windows/Fonts/'
F = lambda n, s: ImageFont.truetype(FD + n, s)
f_rank, f_suit_c = F('arialbd.ttf', 40), F('arial.ttf', 30)
f_pip, f_pip_big = F('arial.ttf', 60), F('arial.ttf', 132)
f_joker = F('arialbd.ttf', 34)

# 來源圖座標：各風格那一列的牌上緣 y、宮廷牌水平中心、背牌框
ROW_TOP = {'D': 786, 'A': 18, 'B': 274, 'C': 530, 'E': 786, 'F': 786}
COURT_CX = {'K': 798, 'Q': 1020, 'J': 1241}
CB_W, CB_H = 158, 221
# 牌背直接從來源設計稿裁切（座標經人工逐張確認），程式畫的佔位圖風格對不上
# (x0, y0, x1, y1)
BACK_CROP_BOX = {
    'D': (285, 806, 475, 1014),
    'A': (280, 10, 480, 275),
    'B': (289, 301, 470, 528),
    'C': (287, 568, 454, 764),
}
# D 牌背下緣白色卡緣帶混入「背面」說明文字，這條 y（來源座標）以下整帶抹白
BACK_D_TEXT_Y = 1006

# 各風格：輸出後綴、牌底色、黑花色色、紅花色色、Joker 底色
STYLES = {
    'D': {'suffix': '',   'bg': (250, 247, 238, 255), 'blk': (26, 26, 26, 255),  'red': (192, 57, 43, 255)},
    'A': {'suffix': '_A', 'bg': (244, 238, 222, 255), 'blk': (26, 34, 64, 255),  'red': (150, 42, 42, 255)},
    'B': {'suffix': '_B', 'bg': (240, 236, 226, 255), 'blk': (38, 38, 38, 255),  'red': (150, 60, 55, 255)},
    'C': {'suffix': '_C', 'bg': (238, 230, 210, 255), 'blk': (30, 42, 38, 255),  'red': (150, 50, 45, 255)},
    # E 簡約：牌面同經典配色，牌背用程式畫的編織紋（原本 D 的畫法）
    'E': {'suffix': '_E', 'bg': (250, 247, 238, 255), 'blk': (26, 26, 26, 255),  'red': (192, 57, 43, 255)},
    # F 極簡：素色牌背無圖案；牌面只有大字 rank + 角落小花色（花色是牌局判定必需，只縮不刪）
    'F': {'suffix': '_F', 'bg': (252, 252, 250, 255), 'blk': (30, 30, 30, 255),  'red': (200, 60, 50, 255), 'plain': True},
}

_mask = Image.new('L', (CW, CH), 0)
ImageDraw.Draw(_mask).rounded_rectangle([0, 0, CW - 1, CH - 1], radius=22, fill=255)


def text_img(txt, font, color):
    b = font.getbbox(txt); w, h = b[2] - b[0], b[3] - b[1]
    im = Image.new('RGBA', (max(1, w), max(1, h)), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((-b[0], -b[1]), txt, font=font, fill=color)
    return im


def paste_center(base, g, cx, cy, flip=False):
    if flip: g = g.rotate(180, expand=True)
    base.alpha_composite(g, (int(cx - g.width / 2), int(cy - g.height / 2)))


def blank_card(bg):
    im = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([1, 1, CW - 2, CH - 2], radius=22, fill=bg,
                                         outline=(208, 208, 200, 255), width=2)
    return im


def corner(card, rank, suit, color):
    r = text_img(rank, f_rank, color); g = text_img(GLYPH[suit], f_suit_c, color)
    card.alpha_composite(r, (16, 14))
    card.alpha_composite(g, (16 + (r.width - g.width) // 2, 14 + r.height + 2))
    bw, bh = max(r.width, g.width), r.height + 2 + g.height
    blk = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
    blk.alpha_composite(r, ((bw - r.width) // 2, 0)); blk.alpha_composite(g, ((bw - g.width) // 2, r.height + 2))
    blk = blk.rotate(180, expand=True)
    card.alpha_composite(blk, (CW - 16 - blk.width, CH - 14 - blk.height))


L, C, R = 0.31, 0.5, 0.69
yT, yB = 0.205, 0.795
y2, y3 = yT + (yB - yT) / 3, yT + 2 * (yB - yT) / 3
y7 = (yT + 0.5) / 2
LAYOUT = {
    'A': [(C, 0.5, 'big')], '2': [(C, yT), (C, yB)], '3': [(C, yT), (C, 0.5), (C, yB)],
    '4': [(L, yT), (R, yT), (L, yB), (R, yB)], '5': [(L, yT), (R, yT), (C, 0.5), (L, yB), (R, yB)],
    '6': [(L, yT), (R, yT), (L, 0.5), (R, 0.5), (L, yB), (R, yB)],
    '7': [(L, yT), (R, yT), (C, y7), (L, 0.5), (R, 0.5), (L, yB), (R, yB)],
    '8': [(L, yT), (R, yT), (C, y7), (L, 0.5), (R, 0.5), (C, 1 - y7), (L, yB), (R, yB)],
    '9': [(L, yT), (R, yT), (L, y2), (R, y2), (C, 0.5), (L, y3), (R, y3), (L, yB), (R, yB)],
    '10': [(L, yT), (R, yT), (C, (yT + y2) / 2), (L, y2), (R, y2), (L, y3), (R, y3), (C, (y3 + yB) / 2), (L, yB), (R, yB)],
}


def court_crop(rank, top):
    cx = COURT_CX[rank]
    box = (cx - CB_W // 2, top, cx - CB_W // 2 + CB_W, top + CB_H)
    return src.crop(box).resize((CW, CH), Image.LANCZOS)


def make_back(key):
    """D/A/B/C 直接裁來源設計稿的牌背；E 簡約版用程式畫。"""
    gold = (216, 177, 90, 255)
    if key in BACK_CROP_BOX:
        x0, y0, x1, y1 = BACK_CROP_BOX[key]
        crop = src.convert('RGBA').crop((x0, y0, x1, y1))
        if key == 'D':  # 抹掉下緣白邊帶混入的「背面」文字
            d = ImageDraw.Draw(crop)
            d.rectangle([0, BACK_D_TEXT_Y - y0, crop.width, crop.height], fill=(245, 245, 245, 255))
        crop = crop.resize((CW, CH), Image.LANCZOS)
        if key == 'B':  # B 卡緣偏淡，補一圈金色描邊跟其他款一致
            ImageDraw.Draw(crop).rounded_rectangle([1, 1, CW - 2, CH - 2], radius=22, outline=gold, width=3)
        crop.putalpha(_mask)
        return crop
    if key == 'F':  # F 極簡：素色底 + 細白邊，無任何圖案
        im = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([1, 1, CW - 2, CH - 2], radius=22, fill=(42, 66, 92, 255),
                            outline=(255, 255, 255, 200), width=3)
        im.putalpha(_mask)
        return im
    # E 簡約：深藍底 + 對角編織紋 + 金色黑桃
    base = (36, 59, 107, 255)
    line = (255, 255, 255, 40)
    im = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([1, 1, CW - 2, CH - 2], radius=22, fill=base, outline=gold, width=3)
    d.rounded_rectangle([16, 16, CW - 16, CH - 16], radius=14, outline=gold, width=2)
    for i in range(-CH, CW + CH, 26):
        d.line([(i, 18), (i + CH, CH - 18)], fill=line); d.line([(i, CH - 18), (i + CH, 18)], fill=line)
    g = text_img('♠', F('seguisym.ttf', 104), gold)
    im.alpha_composite(g, ((CW - g.width) // 2, (CH - g.height) // 2))
    return im


def make_card(rank, suit, st, top):
    color = st['red'] if suit in ('H', 'D') else st['blk']
    if st.get('plain'):  # F 極簡：白底 + 置中大字 rank + 角落 rank/小花色，無點陣無宮廷圖
        card = blank_card(st['bg'])
        corner(card, rank, suit, color)
        big = text_img(rank, F('arialbd.ttf', 150 if rank != '10' else 120), color)
        paste_center(card, big, CW * 0.5, CH * 0.5)
        return card
    if rank in ('J', 'Q', 'K'):
        card = court_crop(rank, top)
        if suit != 'S':
            d = ImageDraw.Draw(card)
            patch = st['bg']
            d.rectangle([4, 6, 66, 100], fill=patch); d.rectangle([CW - 66, CH - 100, CW - 4, CH - 6], fill=patch)
            corner(card, rank, suit, color)
        card.putalpha(_mask)
        return card
    card = blank_card(st['bg'])
    corner(card, rank, suit, color)
    g, gb = text_img(GLYPH[suit], f_pip, color), text_img(GLYPH[suit], f_pip_big, color)
    for p in LAYOUT[rank]:
        xf, yf = p[0], p[1]
        paste_center(card, (gb if len(p) > 2 else g), CW * xf, CH * yf, flip=(yf > 0.5005))
    return card


def make_joker(st, color):
    card = blank_card(st['bg'])
    star = text_img('★', F('seguisym.ttf', 150), color)
    card.alpha_composite(star, ((CW - star.width) // 2, (CH - star.height) // 2))
    lbl = text_img('JOKER', f_joker, color)
    card.alpha_composite(lbl, (18, 16))
    b = lbl.rotate(180, expand=True)
    card.alpha_composite(b, (CW - 18 - b.width, CH - 16 - b.height))
    return card


for key, st in STYLES.items():
    top = ROW_TOP[key]
    sheet = Image.new('RGBA', (CW * COLS, CH * ROWS), (0, 0, 0, 0))
    frames = {}
    for r, suit in enumerate(SUITS):
        for c, rank in enumerate(RANKS):
            x, y = c * CW, r * CH
            sheet.alpha_composite(make_card(rank, suit, st, top), (x, y))
            frames[rank + suit] = {"x": x, "y": y, "width": CW, "height": CH}
    sfx = st['suffix']
    sheet.save(os.path.join(OUT, f'cards_sheet{sfx}.png'))
    make_back(key).save(os.path.join(OUT, f'back{sfx}.png'))
    make_joker(st, st['red']).save(os.path.join(OUT, f'joker_red{sfx}.png'))
    make_joker(st, st['blk']).save(os.path.join(OUT, f'joker_black{sfx}.png'))
    data = {
        "meta": {"sheet": f"cards_sheet{sfx}.png", "style": key, "cardWidth": CW, "cardHeight": CH,
                 "columns": COLS, "rows": ROWS, "spacing": 0, "margin": 0},
        "order": {"suits": SUITS, "ranks": RANKS},
        "frames": frames,
        "extra": {"back": f"back{sfx}.png", "joker_red": f"joker_red{sfx}.png", "joker_black": f"joker_black{sfx}.png"},
    }
    with open(os.path.join(OUT, f'cards{sfx}.json'), 'w', encoding='utf-8') as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
    print('style', key, 'sheet', sheet.size, 'frames', len(frames))
