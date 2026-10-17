"""Render the "Antenna" idle face (src/ui/BotFace.tsx, 100x100 grid) into the app icon PNGs.

Usage: python3 scripts/make-icon.py assets   (needs Pillow; the splash is not touched)
"""
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
BG = "#3f2564"      # theme primary (light)
HEAD = "#1c1428"    # theme foreground (light): dark head
EAR = "#6b5a8a"
BRAND = "#f0b429"   # sunflower yellow
SS = 4              # supersampling


def face(size, scale, *, bg=None, mono=False):
    """Draw the face centered; `scale` = fraction of the canvas the 100-unit grid takes."""
    S = size * SS
    img = Image.new("RGBA", (S, S), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = S * scale / 100
    # the drawing spans y 6.5..80 → center it vertically on 43.25, horizontally on 50
    ox, oy = S / 2 - 50 * u, S / 2 - 43.25 * u
    P = lambda x, y: (ox + x * u, oy + y * u)
    rr = lambda x, y, w, h, r, fill: d.rounded_rectangle([P(x, y), P(x + w, y + h)], radius=r * u, fill=fill)
    white = "#ffffff"
    rr(12, 44, 6, 16, 3, white if mono else EAR)
    rr(82, 44, 6, 16, 3, white if mono else EAR)
    d.line([P(50, 14), P(50, 24)], fill=white if mono else BRAND, width=round(3 * u))
    cx, cy = P(50, 11)
    r = 4.5 * u
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=white if mono else BRAND)
    rr(18, 24, 64, 56, 18, white if mono else HEAD)
    eye = (0, 0, 0, 0) if mono else BRAND
    rr(34, 40, 9, 16, 4.5, eye)
    rr(57, 40, 9, 16, 4.5, eye)
    return img.resize((size, size), Image.LANCZOS)


# adaptive icon: 108dp canvas, keep the face inside the 66dp safe circle
face(1024, 0.62).save(f"{OUT}/android-icon-foreground.png")
Image.new("RGBA", (1024, 1024), BG).save(f"{OUT}/android-icon-background.png")
face(1024, 0.62, mono=True).save(f"{OUT}/android-icon-monochrome.png")
face(1024, 0.72, bg=BG).convert("RGB").save(f"{OUT}/icon.png")
face(48, 0.9).save(f"{OUT}/favicon.png")
