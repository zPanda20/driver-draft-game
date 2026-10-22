#!/usr/bin/env python3
"""Remove a flat magenta (#FF00FF) background from a generated image and save a transparent PNG.
Usage:  python3 tools/clean_asset.py in.png public/liveries/<slug>/icon.png [--size 256] [--square]
--square crops to the artwork and pads to a square (use for icons).
Needs Pillow and numpy (pip install pillow numpy). Edge pixels are un-mixed from the magenta so no pink halo is left."""
import sys, os
import numpy as np
from PIL import Image
a = sys.argv[1:]; size = None; square = '--square' in a
if square: a.remove('--square')
if '--size' in a: i = a.index('--size'); size = int(a[i + 1]); del a[i:i + 2]
src, dst = a[0], a[1]
arr = np.asarray(Image.open(src).convert('RGB')).astype(float)
r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
m = np.clip(np.minimum(r, b) - g, 0, None)            # "magentaness": 0 for white/black/red/etc., ~250 for the background
al = np.clip(1 - (m - 12) / 200, 0, 1); al[m <= 12] = 1; al[m >= 212] = 0
M = np.array([255, 0, 255.]); out = arr.copy()
edge = (al > 0) & (al < 1)
out[edge] = (arr[edge] - (1 - al[edge, None]) * M) / al[edge, None]
out = np.clip(out, 0, 255)
im = Image.fromarray(np.dstack([out, al * 255]).astype('uint8'), 'RGBA')
if square:
    bb = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
    if bb:
        im = im.crop(bb); mx = max(im.size); pad = int(mx * 0.04); S = mx + 2 * pad
        c = Image.new('RGBA', (S, S), (0, 0, 0, 0)); c.paste(im, ((S - im.width) // 2, (S - im.height) // 2)); im = c
if size: im.thumbnail((size, size), Image.LANCZOS)
os.makedirs(os.path.dirname(dst) or '.', exist_ok=True); im.save(dst); print('saved', dst, im.size)
