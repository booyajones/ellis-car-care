"""
process-wash-photos.py

Take the raw PNGs in C:\\Users\\chris\\Downloads\\ellis-photos-raw\\ and
generate web-ready assets in ellis-car-care/images/process/.

For each photo:
  - 1600-wide webp + jpg  (hero / opened gallery)
  - 900-wide  webp + jpg  (gallery grid card)
  - 400-wide  webp + jpg  (thumb / responsive srcset)

Exif/metadata stripped. JPEGs at q=82 (visually lossless at web sizes).
WebPs at q=80 (smaller, broad support today).

Naming: wash-01-1600.webp, wash-01-1600.jpg, wash-01-900.webp, ...

Run from anywhere:
    python scripts/process-wash-photos.py
"""
from pathlib import Path
from PIL import Image, ImageOps

SRC = Path(r"C:\Users\chris\Downloads\ellis-photos-raw")
DST = Path(__file__).resolve().parent.parent / "images" / "process"

# Curated ordering: chosen for visual storytelling.
# Strong landscape composition first (good hero candidate),
# then variety: foam application, foam coverage, detail close-ups, rinse.
ORDER = [
    "Untitled design (13).png",  # 01 — wide rinse arc, driveway scene  (HERO CANDIDATE)
    "Untitled design (8).png",   # 02 — side door foam application
    "Untitled design (9).png",   # 03 — side fully foamed, clean composition
    "Untitled design (12).png",  # 04 — front 3/4 with sprayer, garage backdrop
    "Untitled design (7).png",   # 05 — taillight close-up with foam (red pops)
    "Untitled design (10).png",  # 06 — hood foam close-up
    "Untitled design (6).png",   # 07 — rear hatch foam, Mazda
    "Untitled design (5).png",   # 08 — rear corner foam, Mazda
    "Untitled design (11).png",  # 09 — side panel foam application
    "Untitled design (4).png",   # 10 — side foam spray, driveway
    "Untitled design (3).png",   # 11 — roof/windshield rinse
    "Untitled design (2).png",   # 12 — wheel/side close-up
]

SIZES = [1600, 900, 400]
JPG_QUALITY = 82
WEBP_QUALITY = 80


def process_one(src: Path, index: int) -> None:
    base = f"wash-{index:02d}"
    img = Image.open(src)
    img = ImageOps.exif_transpose(img)
    # Convert to RGB (strip alpha if any) so JPEG works without artifacts.
    if img.mode != "RGB":
        img = img.convert("RGB")
    src_w, src_h = img.size

    for width in SIZES:
        if src_w <= width:
            scaled = img.copy()
        else:
            height = round(src_h * (width / src_w))
            scaled = img.resize((width, height), Image.LANCZOS)

        webp_out = DST / f"{base}-{width}.webp"
        jpg_out = DST / f"{base}-{width}.jpg"

        scaled.save(webp_out, "WEBP", quality=WEBP_QUALITY, method=6)
        scaled.save(jpg_out, "JPEG", quality=JPG_QUALITY, optimize=True, progressive=True)
        print(f"  {webp_out.name:<26} {webp_out.stat().st_size//1024:>5} KB    {jpg_out.name:<26} {jpg_out.stat().st_size//1024:>5} KB")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Source not found: {SRC}")
    DST.mkdir(parents=True, exist_ok=True)
    print(f"Output: {DST}")

    for i, name in enumerate(ORDER, start=1):
        path = SRC / name
        if not path.exists():
            print(f"  SKIP (missing): {name}")
            continue
        print(f"\n[{i:02d}] {name}")
        process_one(path, i)

    print(f"\nDone. {len(ORDER)} photos x {len(SIZES)} sizes x 2 formats.")


if __name__ == "__main__":
    main()
