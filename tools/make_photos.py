"""img/profile/<이름>.(jpg|png) → img/players/<이름>.jpg (300x300 정사각형, 웹용)
+ img/players/photos.js (사진이 있는 선수 목록)"""
import json, sys
from pathlib import Path
from PIL import Image

site = Path(sys.argv[1])
src_dir, out_dir = site / "img" / "profile", site / "img" / "players"
out_dir.mkdir(parents=True, exist_ok=True)

names = []
for f in sorted(src_dir.iterdir()):
    if f.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        continue
    name = f.stem.strip()
    im = Image.open(f)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    # 세로로 긴 사진은 얼굴이 있는 위쪽을 살림 (위에서 15% 지점부터)
    top = 0 if h <= w else min(h - side, int((h - side) * 0.15))
    im = im.crop((left, top, left + side, top + side)).resize((300, 300), Image.LANCZOS)
    im.save(out_dir / f"{name}.jpg", quality=85, optimize=True, progressive=True)
    names.append(name)

(out_dir / "photos.js").write_text(
    "// 자동 생성: 사진이 있는 선수 목록 (img/players/<이름>.jpg)\nwindow.PLAYER_PHOTOS = "
    + json.dumps(names, ensure_ascii=False) + ";\n",
    encoding="utf-8",
)
print(len(names), "photos")
