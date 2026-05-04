"""Process the AI-generated Michigan silhouette: make white pixels transparent,
recolor the navy stroke to cream so it reads on dark mode, and overlay an
amber star at Ann Arbor with a soft glow.

Run after regenerating michigan-ai source via build_assets.py.
"""

from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math

ROOT = Path(__file__).parent
SRC = ROOT / "images" / "michigan-ai.png"

AMBER  = (229, 162, 53, 255)
DARK   = (14, 16, 20, 255)
CREAM  = (242, 238, 230, 255)


def star_polygon(cx, cy, r_outer, r_inner, points=5, rotation_deg=-90):
    coords = []
    rotation = math.radians(rotation_deg)
    for i in range(points * 2):
        r = r_outer if i % 2 == 0 else r_inner
        a = rotation + (math.pi * i) / points
        coords.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return coords


def make_white_transparent(img):
    """Recolor any visible (non-transparent) line strokes to cream and make
    light/white pixels transparent. Preserves source alpha=0 pixels."""
    img = img.convert("RGBA")
    pixels = img.load()
    W, H = img.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue  # already transparent
            lum = int(0.299 * r + 0.587 * g + 0.114 * b)
            if lum >= 220:
                pixels[x, y] = (0, 0, 0, 0)
            elif lum <= 120:
                pixels[x, y] = (*CREAM[:3], 255)
            else:
                t = (220 - lum) / (220 - 120)
                pixels[x, y] = (*CREAM[:3], int(255 * t))
    return img


def main():
    img = Image.open(SRC).convert("RGBA")
    W, H = img.size

    img = make_white_transparent(img)

    # Star at ~ Ann Arbor (50% horiz, 73% vert of the canvas).
    cx = int(W * 0.50)
    cy = int(H * 0.73)
    r_outer = int(min(W, H) * 0.05)
    r_inner = int(r_outer * 0.42)

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    star_pts = star_polygon(cx, cy, r_outer, r_inner)
    d.polygon(star_pts, fill=AMBER)

    # Soft amber glow behind the star.
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    halo_r = int(r_outer * 2.4)
    gd.ellipse(
        [cx - halo_r, cy - halo_r, cx + halo_r, cy + halo_r],
        fill=(229, 162, 53, 90),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(14))

    out = Image.alpha_composite(img, glow)
    out = Image.alpha_composite(out, overlay)

    # Resize down for web (keep aspect, max edge 600px)
    max_edge = 600
    w, h = out.size
    scale = max_edge / max(w, h)
    if scale < 1:
        out = out.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    out.save(SRC, "PNG", optimize=True)   # Keep RGBA
    print(f"Wrote {SRC} ({SRC.stat().st_size} bytes)")

    webp = SRC.with_suffix(".webp")
    out.save(webp, "WEBP", quality=88, method=6, lossless=False)
    print(f"Wrote {webp} ({webp.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
