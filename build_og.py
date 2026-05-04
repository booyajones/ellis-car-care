"""Build the 1200x630 OG share image for Ellis Car Care.

Uses PIL only. No external network calls.
Run once. Re-run if branding changes.
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math
import random

OUT = Path(__file__).parent / "og-image.png"
APPLE_TOUCH = Path(__file__).parent / "apple-touch-icon.png"

# Brand colors
NAVY = (14, 42, 71)
CREAM = (244, 235, 217)
CREAM_SOFT = (250, 244, 232)
SUN = (245, 184, 58)
TEAL = (47, 169, 184)
INK = (26, 26, 26)


def load_font(names, size):
    """Try a list of font names, return the first that loads."""
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def draw_sun(draw, cx, cy, r, color=SUN, stroke=NAVY, sw=4):
    """Hand-drawn sun: filled circle plus 8 main rays plus 8 short rays."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color, outline=stroke, width=sw)
    # 8 long rays
    for i in range(8):
        a = math.radians(i * 45)
        x1 = cx + math.cos(a) * (r + 12)
        y1 = cy + math.sin(a) * (r + 12)
        x2 = cx + math.cos(a) * (r + 38)
        y2 = cy + math.sin(a) * (r + 38)
        draw.line([(x1, y1), (x2, y2)], fill=stroke, width=sw)
    # 8 shorter rays offset
    for i in range(8):
        a = math.radians(i * 45 + 22.5)
        x1 = cx + math.cos(a) * (r + 12)
        y1 = cy + math.sin(a) * (r + 12)
        x2 = cx + math.cos(a) * (r + 26)
        y2 = cy + math.sin(a) * (r + 26)
        draw.line([(x1, y1), (x2, y2)], fill=stroke, width=sw - 1)


def draw_bucket(draw, x, y, w, h):
    """Trapezoid bucket with bubbles spilling out. x,y is top-left of bounding box."""
    # bubbles
    bubbles = [(x + 30, y - 10, 22), (x + 70, y - 30, 16), (x + 110, y - 12, 26),
               (x + 150, y - 36, 14), (x + 178, y - 6, 22)]
    for bx, by, br in bubbles:
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=CREAM_SOFT, outline=NAVY, width=4)
    # bucket body, slight trapezoid
    inset = 18
    body = [(x, y + 30), (x + w, y + 30), (x + w - inset, y + h), (x + inset, y + h)]
    draw.polygon(body, fill=(47, 169, 184, 60), outline=NAVY)
    # rim
    draw.line([(x - 4, y + 30), (x + w + 4, y + 30)], fill=NAVY, width=5)
    # handle arc
    handle_box = [(x + 30, y - 18), (x + w - 30, y + 70)]
    draw.arc(handle_box, start=200, end=340, fill=NAVY, width=4)


def main():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(img)

    # subtle dotted ground line near bottom
    for x in range(40, W - 40, 14):
        draw.ellipse([x, H - 78, x + 4, H - 74], fill=(107, 99, 88, 80))

    # sun in upper right
    draw_sun(draw, cx=1010, cy=170, r=78)

    # bucket lower right
    draw_bucket(draw, x=900, y=320, w=200, h=240)

    # display headline
    display_font = load_font([
        "C:/Windows/Fonts/Georgia Bold.ttf",
        "C:/Windows/Fonts/georgiab.ttf",
        "C:/Windows/Fonts/Cambria.ttc",
        "C:/Windows/Fonts/seguibl.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ], 96)
    body_font = load_font([
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ], 36)
    label_font = load_font([
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ], 28)

    # eyebrow label
    draw.text((80, 100), "ELLIS CAR CARE", fill=NAVY, font=label_font)
    # underline
    draw.line([(80, 142), (340, 142)], fill=SUN, width=6)

    # main headline, two lines
    draw.text((80, 180), "Hand-detailed", fill=NAVY, font=display_font)
    draw.text((80, 290), "by a kid from", fill=NAVY, font=display_font)
    # last line gets a yellow underline highlight, drawn as a fat semi-translucent stroke under the text
    draw.rectangle([(80, 425), (570, 470)], fill=SUN)
    draw.text((80, 400), "Burns Park.", fill=NAVY, font=display_font)

    # sub
    draw.text((80, 525), "Ann Arbor, Michigan. Wash, detail, wax.", fill=(60, 60, 60), font=body_font)

    img.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")

    # Also produce apple-touch-icon (180x180) by rendering the favicon-style sun
    apple = Image.new("RGB", (180, 180), CREAM)
    ad = ImageDraw.Draw(apple)
    draw_sun(ad, cx=90, cy=90, r=42, sw=5)
    apple.save(APPLE_TOUCH, "PNG", optimize=True)
    print(f"Wrote {APPLE_TOUCH}")


if __name__ == "__main__":
    main()
