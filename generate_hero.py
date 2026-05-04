"""Generate the hero photographic asset via OpenAI gpt-image-1.

A moody, dark-mode editorial macro for the right column of the hero.
"""
import base64
import os
from pathlib import Path

ROOT = Path(__file__).parent
IMAGES = ROOT / "images"
DOTENV = Path(r"C:\Users\chris\OneDrive\Desktop\Claude\.env")


def get_key():
    for line in DOTENV.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip()
    return None


def main():
    from openai import OpenAI
    client = OpenAI(api_key=get_key())

    prompt = (
        "A moody, editorial automotive detailing photograph: an extreme macro close-up "
        "of glossy black car paint covered in tiny clear water droplets that bead up "
        "perfectly on freshly waxed paint. Late afternoon golden hour light grazes "
        "across the surface from the left, catching individual water beads as small "
        "points of warm light. Shallow depth of field, the front beads in sharp focus, "
        "the background falling into a soft dark blur. Slight chrome reflection visible "
        "in the panel. Color palette: deep near-black with warm amber highlights, "
        "matching a brand palette of #0E1014 navy-black and #E5A235 amber. "
        "Premium automotive product photography style, evocative of high-end car care "
        "brand campaigns. No people, no text, no logos. Vertical 3:4 portrait composition."
    )
    res = client.images.generate(
        model="gpt-image-1",
        prompt=prompt,
        size="1024x1536",   # portrait, ~ 2:3
        quality="high",
        n=1,
    )
    img_b64 = res.data[0].b64_json
    raw = IMAGES / "hero-source.png"
    raw.write_bytes(base64.b64decode(img_b64))
    print(f"Wrote {raw} ({raw.stat().st_size} bytes)")

    # Optimize: produce webp + jpg at reasonable web sizes
    from PIL import Image
    img = Image.open(raw).convert("RGB")
    print("source:", img.size)
    # 1200 wide max, preserve aspect
    w, h = img.size
    target_w = 1200
    new_h = int(h * target_w / w)
    img = img.resize((target_w, new_h), Image.LANCZOS)
    img.save(IMAGES / "hero.webp", "WEBP", quality=85, method=6)
    img.save(IMAGES / "hero.jpg", "JPEG", quality=82, optimize=True, progressive=True)
    import os as _os
    print("hero.webp:", _os.path.getsize(IMAGES / "hero.webp"))
    print("hero.jpg :", _os.path.getsize(IMAGES / "hero.jpg"))

    # delete source
    try:
        raw.unlink()
    except Exception:
        pass


if __name__ == "__main__":
    main()
