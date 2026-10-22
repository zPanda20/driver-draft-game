#!/usr/bin/env python3
"""Make a game-ready driver photo: a square head-and-shoulders crop, 256 px, saved as JPEG.
Usage:  python3 tools/driver_photo.py in.jpg public/drivers/<slug>.jpg [--size 256] [--zoom 1.0] [--box x,y,side]
The face is found automatically (OpenCV, detection only) and the crop is centred on it. --zoom 1.2 is tighter, 0.85 is looser.
--box x,y,side crops exactly that square of the original (pixels) when the automatic crop is wrong.
Needs Pillow, numpy, opencv-python-headless (pip install --break-system-packages opencv-python-headless).
Name the file with the driver's slug: name in lower case, no accents, hyphens for spaces (Sébastien Loeb -> sebastien-loeb.jpg).
`node tools/driver_slugs.mjs` prints every driver's slug, in rank order."""
import sys, os
import numpy as np
from PIL import Image, ImageOps
a = sys.argv[1:]
def opt(name, default=None):
    if name in a: i = a.index(name); v = a[i + 1]; del a[i:i + 2]; return v
    return default
size = int(opt('--size', 256)); zoom = float(opt('--zoom', 1.0)); box = opt('--box')
src, dst = a[0], a[1]
im = ImageOps.exif_transpose(Image.open(src)).convert('RGB'); W, H = im.size
how = 'box'
if box:
    x, y, s = [int(float(v)) for v in box.split(',')]
else:
    import cv2
    g = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2GRAY); g = cv2.equalizeHist(g)
    faces = []
    for name in ('haarcascade_frontalface_default.xml', 'haarcascade_frontalface_alt2.xml', 'haarcascade_profileface.xml'):
        c = cv2.CascadeClassifier(cv2.data.haarcascades + name)
        f = c.detectMultiScale(g, 1.08, 5, minSize=(max(40, W // 12), max(40, W // 12)))
        if len(f): faces = f; how = name.split('_', 1)[1][:-4]; break
    if len(faces):
        fx, fy, fw, fh = max(faces, key=lambda r: r[2] * r[3])
        cx, cy = fx + fw / 2, fy + fh / 2
        s = fw * 2.35 / zoom
    else:   # nothing found: top-centre square
        how = 'fallback'; s = min(W, H) / zoom; cx, cy = W / 2, s * 0.42
    s = min(s, W, H)
    x = cx - s / 2; y = cy - s * 0.46
    x = max(0, min(W - s, x)); y = max(0, min(H - s, y))
out = im.crop((int(x), int(y), int(x + s), int(y + s))).resize((size, size), Image.LANCZOS)
os.makedirs(os.path.dirname(dst) or '.', exist_ok=True); out.save(dst, quality=88, optimize=True)
print('saved', dst, f'({how}, crop {int(x)},{int(y)},{int(s)} of {W}x{H})')
