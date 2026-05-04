"""Build the 1200x630 OG share image + apple-touch-icon for Ellis Car Care.

v4.3 dark mode. Composites the hero photograph as the right slab, dark
gradient mask blending into the navy-black canvas, then overlays the
typographic system in cream + amber.

Run: python build_og.py
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path

ROOT = Path(__file__).parent
IMAGES = ROOT / "images"
OG = ROOT / "og-image.png"
APPLE = ROOT / "apple-touch-icon.png"

# v4 brand colors
BG       = (14, 16, 20)
SURFACE  = (24, 28, 36)
INK      = (242, 238, 230)
INK_SOFT = (197, 192, 183)
MUTED    = (138, 133, 121)
AMBER    = (229, 162, 53)


def load_font(names, size):
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def build_og():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)

    # 1. Composite the hero photograph on the right ~45% with a feathered fade
    hero_src = IMAGES / "hero.jpg"
    if hero_src.exists():
        hero = Image.open(hero_src).convert("RGB")
        slab_w = int(W * 0.46)
        slab_h = H
        hw, hh = hero.size
        ratio = max(slab_w / hw, slab_h / hh)
        nw, nh = int(hw * ratio), int(hh * ratio)
        hero_resized = hero.resize((nw, nh), Image.LANCZOS)
        # Center crop to slab dimensions
        left = (nw - slab_w) // 2
        top = (nh - slab_h) // 2
        hero_cropped = hero_resized.crop((left, top, left + slab_w, top + slab_h))

        # Build a feathered alpha mask, fully transparent at left edge fading to opaque
        mask = Image.new("L", (slab_w, slab_h), 255)
        mdraw = ImageDraw.Draw(mask)
        fade = 280
        for x in range(fade):
            alpha = int(round((x / fade) * 255))
            mdraw.line([(x, 0), (x, slab_h)], fill=alpha)
        # Slight darkening overlay on the photo so type stays legible if it overlaps
        darken = Image.new("RGB", (slab_w, slab_h), BG)
        hero_cropped = Image.blend(hero_cropped, darken, 0.10)
        img.paste(hero_cropped, (W - slab_w, 0), mask)

    draw = ImageDraw.Draw(img)

    # 2. Faint amber radial glow upper right (matches site hero gradient)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse([(W - 600, -300), (W + 200, 300)], fill=(229, 162, 53, 32))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img.paste(glow, (0, 0), glow)

    # 3. Type system
    f_eyebrow = load_font([
        "C:/Windows/Fonts/consola.ttf",
        "C:/Windows/Fonts/cour.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ], 22)
    f_brand = load_font([
        "C:/Windows/Fonts/georgiab.ttf",
        "C:/Windows/Fonts/timesbd.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ], 30)
    f_h1 = load_font([
        "C:/Windows/Fonts/georgiab.ttf",
        "C:/Windows/Fonts/timesbd.ttf",
        "C:/Windows/Fonts/seguibl.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ], 92)
    f_phone = load_font([
        "C:/Windows/Fonts/georgiab.ttf",
        "C:/Windows/Fonts/timesbd.ttf",
    ], 36)
    f_meta = load_font([
        "C:/Windows/Fonts/consola.ttf",
        "C:/Windows/Fonts/cour.ttf",
    ], 18)

    # Top brand line
    draw.text((80, 60), "ELLIS CAR CARE", fill=INK, font=f_brand)

    # Eyebrow (amber mono)
    draw.text((80, 200), "BURNS PARK · ANN ARBOR · MICHIGAN", fill=AMBER, font=f_eyebrow)

    # Headline, two lines
    draw.text((78, 246), "Hand-detailed,", fill=INK, font=f_h1)
    draw.text((78, 348), "in your driveway.", fill=INK, font=f_h1)

    # Hairline under copy block
    draw.line([(80, 480), (560, 480)], fill=(242, 238, 230, 60), width=1)

    # Phone, prominent (Fraunces feel via Georgia bold)
    draw.text((80, 498), "(628) 252-0740", fill=INK, font=f_phone)

    # Bottom meta strip
    draw.text((80, 568), "TEXT OR CALL · CASH, VENMO, ZELLE", fill=MUTED, font=f_meta)

    img.save(OG, "PNG", optimize=True)
    print(f"Wrote {OG} ({OG.stat().st_size} bytes)")


def build_apple_touch():
    """180x180 dark amber-ringed mark for iOS home screen."""
    img = Image.new("RGB", (180, 180), BG)
    draw = ImageDraw.Draw(img)
    # Amber ring
    draw.ellipse([(20, 20), (160, 160)], outline=AMBER, width=4)
    # Amber dot center
    draw.ellipse([(74, 74), (106, 106)], fill=AMBER)
    img.save(APPLE, "PNG", optimize=True)
    print(f"Wrote {APPLE} ({APPLE.stat().st_size} bytes)")


def main():
    build_og()
    build_apple_touch()


if __name__ == "__main__":
    main()
