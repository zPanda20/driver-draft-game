#!/usr/bin/env python3
"""Turn a one-colour track outline (PNG, JPG or SVG, dark line on a light or transparent background) into the game's recolourable
masks:  public/tracks/<slug>.png (large, 640 px) and public/tracks/<slug>-s.png (thicker line, 160 px, for small spots).
The game paints the mask in the team's livery colour, so only the SHAPE is used and the original colour is thrown away.
Usage:  python3 tools/track_outline.py <input.png|jpg|svg> <slug> [--patch x,y,r]    (slug = track name, lower case, hyphens: Red Bull Ring -> red-bull-ring)
`node tools/track_slugs.mjs` lists every track with the slug it expects.   SVG input needs Playwright + Chromium."""
import sys, os, io, subprocess
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
a = sys.argv[1:]
patch = None
if "--patch" in a: i = a.index("--patch"); patch = [float(v) for v in a[i + 1].split(",")]; del a[i:i + 2]
src, slug = a[0], a[1]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "tracks")
os.makedirs(out, exist_ok=True)

def load(path):
    if path.lower().endswith(".svg"):
        from playwright.sync_api import sync_playwright
        svg = open(path, encoding="utf-8").read()
        with sync_playwright() as p:
            b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1400, "height": 1400})
            pg.set_content(f'<body style="margin:0;background:transparent"><div id=w style="width:1200px;height:1200px;display:flex;align-items:center;justify-content:center">{svg}</div></body>')
            pg.eval_on_selector("svg", "s=>{const w=s.getAttribute('width'),h=s.getAttribute('height');s.removeAttribute('width');s.removeAttribute('height');s.style.maxWidth='1100px';s.style.maxHeight='1100px';s.style.width='1100px';s.style.height='auto'}")
            png = pg.locator("#w").screenshot(omit_background=True); b.close()
        return Image.open(io.BytesIO(png)).convert("RGBA")
    return Image.open(path).convert("RGBA")

im = load(src); a = np.asarray(im).astype(float)
alpha = a[..., 3]
if alpha.min() < 250:                      # transparent background: the line is where it is opaque
    m = alpha
else:                                      # opaque background: the line is whatever is dark
    m = 255 - a[..., :3].min(axis=2)       # distance from white: black AND coloured lines both come out solid
m = np.clip((m - 8) * (255 / 247), 0, 255).astype(np.uint8)
mask = Image.fromarray(m, "L")
bb = mask.point(lambda v: 255 if v > 40 else 0).getbbox()
if not bb: sys.exit("no line found in " + src)
if patch:   # fill a small marker (e.g. a start/finish dot) sitting on the line: close the gap locally
    x, y, r = patch; arr = np.asarray(mask).copy()
    yy, xx = np.ogrid[:arr.shape[0], :arr.shape[1]]; disc = (xx - x) ** 2 + (yy - y) ** 2 <= (r * 1.8) ** 2
    win = ndi.binary_closing(arr > 127, structure=np.fromfunction(lambda i, j: (i - r) ** 2 + (j - r) ** 2 <= (r * 1.15) ** 2, (int(2 * r) + 1, int(2 * r) + 1)), iterations=1)
    arr[disc & win] = 255; mask = Image.fromarray(arr, "L")
# drop specks and watermarks: keep only the pieces of line that are a real share of the drawing
lab, n = ndi.label(np.asarray(mask) > 100)
if n > 1:
    sizes = ndi.sum(np.ones_like(lab), lab, index=range(1, n + 1)); keep = [i + 1 for i, v in enumerate(sizes) if v >= 0.06 * max(sizes)]
    mask = Image.fromarray(np.where(np.isin(lab, keep), np.asarray(mask), 0).astype(np.uint8), "L")
bb = mask.point(lambda v: 255 if v > 40 else 0).getbbox()
mask = mask.crop(bb)
pad = int(max(mask.size) * 0.04); canvas = Image.new("L", (mask.width + 2 * pad, mask.height + 2 * pad), 0); canvas.paste(mask, (pad, pad)); mask = canvas
def fit(img, long_side, smooth=False):
    s = long_side / max(img.size); size = (max(1, round(img.width * s)), max(1, round(img.height * s)))
    r = img.resize(size, Image.LANCZOS)
    if smooth:                              # small, soft sources: blur then re-threshold so the edge is crisp, not mushy
        r = r.filter(ImageFilter.GaussianBlur(1.6)).point(lambda v: max(0, min(255, int((v - 110) * 2.2))))
    return r
def even_line(img, target):
    """Every outline gets the same line weight (about `target` px at 640), whatever the source looked like."""
    b = np.asarray(img) > 127
    if b.sum() == 0: return img
    from skimage.morphology import skeletonize
    dt = ndi.distance_transform_edt(b); sk = skeletonize(b)
    t = 2 * float(np.median(dt[sk])) if sk.any() else target
    if abs(t - target) < 0.8: return img
    if t > target:   # too thick: shave the outside
        out = ndi.distance_transform_edt(b) > (t - target) / 2
    else:            # too thin: grow
        out = ndi.distance_transform_edt(~b) <= (target - t) / 2
    out = Image.fromarray((out * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.8))
    return out.point(lambda v: max(0, min(255, int((v - 100) * 1.7))))
big = fit(mask, 640, smooth=max(im.size) < 400)
big = even_line(big, 11)
def rgba(m): 
    o = Image.new("RGBA", m.size, (255, 255, 255, 0)); o.putalpha(m); return o
rgba(big).save(os.path.join(out, slug + ".png"), optimize=True)
k = max(3, (max(big.size) // 40) | 1)       # thicken the line for tiny sizes
thick = big.filter(ImageFilter.MaxFilter(k))
rgba(fit(thick, 160)).save(os.path.join(out, slug + "-s.png"), optimize=True)
print("saved", slug, big.size)
