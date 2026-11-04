# birthday

"Par avion" birthday page. Live at **https://darkaydoo.github.io/birthday/** once GitHub Pages is on (Settings → Pages → Deploy from a branch → `main` / `(root)`).

## Edit the words
Open `index.html`, find `// ===== EDIT ONLY THIS BLOCK =====` and change only the `CONTENT` object:
- `name`: shown on the envelope and as "Name," at the top of page 1. Czech letters (ř, č, ž, ě…) are fine.
- `pages`: three strings, one per letter page. A blank line (`\n\n`) starts a new paragraph.
- `signoff`, `signature`: the end of page 3.
- `photos`: `alt` describes each photo for screen readers. `caption` is the line under the polaroid.

## Add the photos
```bash
python3 -m pip install Pillow pillow-heif
python3 tools/prepare_photos.py ~/Pictures/a.jpg ~/Pictures/b.heic ~/Pictures/c.jpg
```
This fixes rotation, crops to a square, resizes to 1000×1000, strips EXIF/GPS, and writes `photos/photo-1.jpg` to `photo-3.jpg`. To move the crop for one photo, add `--focus 2=0.5,0.3` (photo 2, crop centred at 50% across and 30% down).

## Check before sending
```bash
cd .. && python3 -m http.server 8000
```
Open http://localhost:8000/birthday/ in a browser. Or run the automated check: `node birthday/tools/verify.mjs` (needs Playwright).

**WhatsApp:** do not paste the link until https://darkaydoo.github.io/birthday/og-image.jpg loads. WhatsApp caches a failed preview for days.
