"""Generate AI-rendered Michigan map + QR code for Ellis Car Care.

Run once. Re-run if branding changes.
"""

import os
import base64
from pathlib import Path

ROOT = Path(__file__).parent
IMAGES = ROOT / "images"
DOTENV = Path(r"C:\Users\chris\OneDrive\Desktop\Claude\.env")


def load_dotenv():
    if not DOTENV.exists():
        return
    for line in DOTENV.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def generate_michigan():
    """Use OpenAI gpt-image-1 to generate a clean modern silhouette of Michigan."""
    from openai import OpenAI
    # Explicitly read from the loaded dotenv to bypass any stale system env var.
    api_key = None
    for line in DOTENV.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("OPENAI_API_KEY="):
            api_key = line.split("=", 1)[1].strip()
            break
    client = OpenAI(api_key=api_key)

    prompt = (
        "A minimal, modern flat vector-style map illustration of the state of Michigan's "
        "Lower Peninsula, the iconic 'mitten' shape with a clear thumb pointing up and slightly "
        "right (eastward), a deep curved Saginaw Bay indent at the base of the thumb, and a "
        "smooth Lake Michigan coast on the west. Clean single-color line art, deep navy stroke "
        "on a transparent or warm off-white background, no text, no labels, no compass, no other "
        "elements. Editorial, sophisticated, suitable for a high-end auto detailing brand's "
        "service-area icon. Centered. Generous margin. Crisp lines, no shading, no gradient. "
        "Approximately 1024x1024."
    )
    res = client.images.generate(
        model="gpt-image-1",
        prompt=prompt,
        size="1024x1024",
        quality="high",
        n=1,
    )
    img_b64 = res.data[0].b64_json
    out = IMAGES / "michigan-ai.png"
    out.write_bytes(base64.b64decode(img_b64))
    print(f"Wrote {out} ({out.stat().st_size} bytes)")
    return out


def generate_qr():
    """Build a clean black-on-white QR code for the SMS deep link to Ellis."""
    import qrcode
    from qrcode.image.styledpil import StyledPilImage
    from qrcode.image.styles.moduledrawers import RoundedModuleDrawer

    sms_body = (
        "Hi Ellis, I'd like to book a detail. "
        "My car is a ____. I'm in Burns Park / 48104. Available: ____."
    )
    # urlencode the body
    from urllib.parse import quote
    sms_uri = f"sms:+16282520740?&body={quote(sms_body)}"

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=14,
        border=2,
    )
    qr.add_data(sms_uri)
    qr.make(fit=True)
    # styled rounded modules for a more modern look
    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(),
        fill_color="#0E1F33",
        back_color="#FAFAF7",
    )
    out = IMAGES / "qr-text-ellis.png"
    img.save(out, optimize=True)
    print(f"Wrote {out} ({out.stat().st_size} bytes)")
    return out


def main():
    load_dotenv()
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY not in env")
    generate_qr()
    generate_michigan()


if __name__ == "__main__":
    main()
