"""Trace the approved Staycio mark PNG into the SVG paths the site uses.

    python3 -m venv .venv && .venv/bin/pip install potracer pillow numpy
    .venv/bin/python scripts/brand/trace_mark.py <out-dir> [source.png]

Source: white mark with a cyan door on a black background (the "Final" export
in ~/Desktop/Staycio Logo). Writes <out-dir>/new-mark.svg and new-mark.json;
paste the json's body/door/viewBox into src/components/brand/StaycioMark.tsx
and regenerate public/brand/*.svg, src/app/icon.svg and the PNG icons from
the same paths (see the 2026-10-02 commit that introduced this mark).
"""
import numpy as np, potrace, sys, json
from PIL import Image
src = sys.argv[2] if len(sys.argv) > 2 else "/Users/examodels/Desktop/Staycio Logo/Final/Staycio - New Logo.png"
im = np.asarray(Image.open(src).convert("RGB")).astype(int)
r, g, b = im[...,0], im[...,1], im[...,2]
white = (r > 128) & (g > 128) & (b > 128)              # body
cyan  = (b > 150) & (g > 120) & (r < 120)              # door
ys, xs = np.where(white | cyan)
y0, y1, x0, x1 = ys.min(), ys.max()+1, xs.min(), xs.max()+1
print("bbox", x0, y0, x1, y1, "size", x1-x0, y1-y0)
def trace(mask):
    sub = mask[y0:y1, x0:x1]
    print('fg pixels', int(sub.sum()), 'of', sub.size)
    bm = potrace.Bitmap(~sub)
    path = bm.trace(turdsize=200, alphamax=1.0, opticurve=True, opttolerance=0.2)
    d = []
    for curve in path:
        sp = curve.start_point
        d.append(f"M{sp.x:.2f},{sp.y:.2f}")
        for seg in curve:
            if seg.is_corner:
                d.append(f"L{seg.c.x:.2f},{seg.c.y:.2f}L{seg.end_point.x:.2f},{seg.end_point.y:.2f}")
            else:
                d.append(f"C{seg.c1.x:.2f},{seg.c1.y:.2f} {seg.c2.x:.2f},{seg.c2.y:.2f} {seg.end_point.x:.2f},{seg.end_point.y:.2f}")
        d.append("Z")
    return "".join(d), len(path)
body, nb = trace(white)
door, nd = trace(cyan)
W, H = x1-x0, y1-y0
# normalise to a 100-high viewBox like the old mark
s = 100.0 / H
import re
def scale(d):
    return re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group())*s:.2f}", d)
body_s, door_s = scale(body), scale(door)
vb = f"0 0 {W*s:.2f} 100"
print("curves body/door:", nb, nd, "viewBox", vb, "path chars", len(body_s), len(door_s))
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><path fill="#FFFFFF" fill-rule="evenodd" d="{body_s}"/><path fill="#05CFFD" fill-rule="evenodd" d="{door_s}"/></svg>'
open(sys.argv[1]+"/new-mark.svg", "w").write(svg)
json.dump({"viewBox": vb, "body": body_s, "door": door_s, "aspect": W/H}, open(sys.argv[1]+"/new-mark.json","w"))
