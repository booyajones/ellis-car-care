"""Composite an Ann Arbor star marker onto the AI-generated Michigan silhouette.

The original line-art PNG has no markers. This script overlays an amber 5-point
star at the approximate Ann Arbor location (south-central Lower Peninsula).
"""

from PIL import Image, ImageDraw
from pathlib import Path
import math

ROOT = Path(__file__).parent
SRC = ROOT / "images" / "michigan-ai.png"

AMBER = (229, 162, 53, 255)
DARK  = (14, 16, 20, 255)


def star_polygon(cx, cy, r_outer, r_inner, points=5, rotation_deg=-90):
    """Return a 5-point star polygon centered on (cx, cy)."""
    coords = []
    rotation = math.radians(rotation_deg)
    for i in range(points * 2):
        r = r_outer if i % 2 == 0 else r_inner
        a = rotation + (math.pi * i) / points
        coords.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return coords


def main():
    img = Image.open(SRC).convert("RGBA")
    W, H = img.size

    # Approximate Ann Arbor on the AI-rendered Michigan silhouette.
    # The silhouette is roughly: top y=18% (Mackinaw), bottom y=82% (Toledo),
    # left x=24% (Lake Mich coast), right x=70% (Detroit/Lake Erie).
    # Ann Arbor is in the south-central palm, ~ 50% horiz, 73% vert.
    cx = int(W * 0.50)
    cy = int(H * 0.73)
    r_outer = int(min(W, H) * 0.045)
    r_inner = int(r_outer * 0.42)

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    # Tiny dark outline around the star for legibility against the line
    star_pts = star_polygon(cx, cy, r_outer, r_inner)
    d.polygon(star_pts, fill=AMBER, outline=DARK)

    # A small dark circle behind for contrast (in case the star sits on a line)
    halo_r = r_outer + 4
    # Subtle halo: very faint amber glow as a separate filled circle (optional)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        [cx - halo_r * 1.6, cy - halo_r * 1.6, cx + halo_r * 1.6, cy + halo_r * 1.6],
        fill=(229, 162, 53, 70),
    )
    from PIL import ImageFilter
    glow = glow.filter(ImageFilter.GaussianBlur(8))

    out = Image.alpha_composite(img, glow)
    out = Image.alpha_composite(out, overlay)
    out.convert("RGB").save(SRC, "PNG", optimize=True)
    print(f"Wrote {SRC} ({SRC.stat().st_size} bytes)")

    # Also re-emit the WebP at the same size
    webp = SRC.with_suffix(".webp")
    out.convert("RGB").save(webp, "WEBP", quality=92, method=6)
    print(f"Wrote {webp} ({webp.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
