# Generates the "Compagno" app icon set: the BotFace (two sunflower eyes) on indigo.
import sys
from PIL import Image, ImageDraw
out = sys.argv[1]
INK, SUN, MIST = (30, 33, 80, 255), (244, 182, 63, 255), (238, 240, 255, 255)
SS = 4  # supersampling

def eyes(draw, size, scale, color):
    # eyes 6x10 units, gap 6, in a 36-unit face (BotFace geometry)
    u = size * scale / 36
    cx, cy = size / 2, size / 2
    w, h, gap = 6 * u, 10 * u, 6 * u
    for x0 in (cx - gap / 2 - w, cx + gap / 2):
        draw.rounded_rectangle([x0, cy - h / 2, x0 + w, cy + h / 2], radius=3 * u, fill=color)

def render(size, bg=None, face=None, eye=SUN, eye_scale=1.0, radius=0):
    big = size * SS
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=radius * SS, fill=bg)
    if face:
        fs = big * face
        o = (big - fs) / 2
        d.rounded_rectangle([o, o, o + fs, o + fs], radius=fs * 12 / 36, fill=INK)
    eyes(d, big, eye_scale, eye)
    return im.resize((size, size), Image.LANCZOS)

render(1024, bg=INK, eye_scale=0.62).convert("RGB").save(f"{out}/icon.png")
render(512, bg=INK).save(f"{out}/android-icon-background.png")            # solid indigo
render(512, eye_scale=0.42).save(f"{out}/android-icon-foreground.png")     # eyes inside the 66% safe zone
render(432, eye=(255, 255, 255, 255), eye_scale=0.42).save(f"{out}/android-icon-monochrome.png")
render(1024, face=0.42, eye_scale=0.42).save(f"{out}/splash-icon.png")      # face on the mist splash
render(48, bg=INK, eye_scale=0.62, radius=10).save(f"{out}/favicon.png")
