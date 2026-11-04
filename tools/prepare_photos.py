#!/usr/bin/env python3
"""Prepare the three polaroid photos for the birthday page.

Usage:
    python3 tools/prepare_photos.py IN1 IN2 IN3
    python3 tools/prepare_photos.py IN1 IN2 IN3 --focus 2=0.5,0.3

Writes photos/photo-1.jpg ... photo-3.jpg (you may pass 1-3 inputs; they fill
photo-1, photo-2, photo-3 in order):
  1. fixes phone rotation (EXIF orientation) and converts to sRGB RGB
  2. centre-crops to a square (--focus N=x,y moves the crop centre for photo N;
     x and y are 0-1, e.g. 0.5,0.3 = middle, upper third)
  3. resizes to 1000 x 1000 (Lanczos)
  4. saves JPEG quality 82, progressive, optimized, with NO EXIF/GPS/ICC metadata
  5. prints each output's size in KB

Needs Pillow:  python3 -m pip install Pillow
iPhone .HEIC files also need:  python3 -m pip install pillow-heif
"""
import argparse
import io
import os
import sys

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow is not installed. Run: python3 -m pip install Pillow")

try:  # optional HEIC support
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

SIZE = 1000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "photos")


def parse_focus(values, count):
    focus = {}
    for v in values or []:
        try:
            n, xy = v.split("=", 1)
            x, y = (float(t) for t in xy.split(","))
            n = int(n)
        except ValueError:
            sys.exit(f"--focus must look like 2=0.5,0.3 (got {v!r})")
        if not (1 <= n <= count) or not (0 <= x <= 1) or not (0 <= y <= 1):
            sys.exit(f"--focus {v!r}: photo number must be 1-{count}, x and y between 0 and 1")
        focus[n] = (x, y)
    return focus


def to_srgb(img):
    """Convert to sRGB if the file carries a colour profile (e.g. iPhone Display P3)."""
    icc = img.info.get("icc_profile")
    if img.mode not in ("RGB", "L", "RGBA", "P", "CMYK", "I;16"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    if icc:
        try:
            from PIL import ImageCms
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            dst = ImageCms.createProfile("sRGB")
            mode = "RGB"
            if img.mode not in ("RGB", "CMYK", "L"):
                img = img.convert("RGB")
            img = ImageCms.profileToProfile(img, src, dst, outputMode=mode)
        except Exception as e:  # fall back to a plain conversion
            print(f"  (colour profile ignored: {e})")
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    return img.convert("RGB")


def square_crop(img, fx=0.5, fy=0.5):
    w, h = img.size
    side = min(w, h)
    left = round(fx * w - side / 2)
    top = round(fy * h - side / 2)
    left = max(0, min(left, w - side))
    top = max(0, min(top, h - side))
    return img.crop((left, top, left + side, top + side))


def main():
    ap = argparse.ArgumentParser(description="Prepare photos/photo-1..3.jpg for the birthday page.")
    ap.add_argument("inputs", nargs="+", metavar="IN", help="1 to 3 image files, in page order")
    ap.add_argument("--focus", action="append", metavar="N=x,y",
                    help="crop centre for photo N, x,y in 0-1 (repeatable)")
    args = ap.parse_args()
    if len(args.inputs) > 3:
        ap.error("at most 3 photos")
    focus = parse_focus(args.focus, len(args.inputs))
    os.makedirs(OUT_DIR, exist_ok=True)

    for i, path in enumerate(args.inputs, start=1):
        try:
            src = Image.open(path)
        except Exception as e:
            sys.exit(f"Could not open {path}: {e}"
                     + ("\nFor iPhone HEIC photos run: python3 -m pip install pillow-heif"
                        if path.lower().endswith((".heic", ".heif")) else ""))
        img = ImageOps.exif_transpose(src)
        img.info["icc_profile"] = src.info.get("icc_profile")  # exif_transpose may drop it
        img = to_srgb(img)
        img = square_crop(img, *focus.get(i, (0.5, 0.5)))
        img = img.resize((SIZE, SIZE), Image.LANCZOS)

        # Re-create the pixels in a fresh image so no metadata can ride along.
        clean = Image.new("RGB", img.size)
        clean.paste(img)
        out = os.path.join(OUT_DIR, f"photo-{i}.jpg")
        clean.save(out, "JPEG", quality=82, progressive=True, optimize=True)

        with Image.open(out) as check:
            assert len(check.getexif()) == 0, f"{out} still has EXIF data"
            assert "icc_profile" not in check.info, f"{out} still has an ICC profile"
            assert check.size == (SIZE, SIZE)
        print(f"{os.path.relpath(out, ROOT)}  {os.path.getsize(out) / 1024:.0f} KB  (from {path})")


if __name__ == "__main__":
    main()
