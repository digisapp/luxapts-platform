"""Staycio mark generator: a location pin split by an S-shaped channel, with a
cyan door in the upper bowl.

Built from circles and half-planes, so the channel is exactly w wide where the
two bowls meet. Coordinates are in the pixel space of the AI concept (H1_1,
864x1152) the mark was redrawn from.

    pip install shapely
    python scripts/brand/mark.py            # JSON: white/door paths in 0..100 units

Paste the output into src/components/brand/StaycioMark.tsx; the static files
(public/brand/*.svg, src/app/icon.svg, the PNG icons, public/og-image.png) are
rendered from the same paths.
"""
import json, sys
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union
from shapely import affinity

P = dict(
    cx=435, cy=495, R=255, tip_y=912, tip_round=14,   # pin
    sx=432, sy=550,                                   # S centre (between the bowls)
    w=96,                                             # channel width where the bowls meet
    rin_top=30, rin_bot=28,                           # counter radii = half the tongue / lobe thickness
    lift=28,                                          # upper stroke swells to w + 2*lift at the top
    taper=2.0, taper_bot=2.1,                         # opening circles (x r_out): top crescent tip, bottom-left tip
    tilt=17,                                          # degrees, rotates the S about its centre
    door_w=82, door_h=118, door_dx=38, door_gap=-6,   # door (upright)
    corner=6,                                         # soften every sharp corner
)
if len(sys.argv) > 1:
    P.update(json.loads(sys.argv[1]))

def circ(x, y, r):
    return Point(x, y).buffer(r, 256)

def pin(p):
    import math
    cx, cy, R, ty = p["cx"], p["cy"], p["R"], p["tip_y"]
    d = ty - cy
    a = math.acos(R / d)                     # tangent half-angle seen from the centre
    lt = (cx - R * math.sin(a), cy + R * math.cos(a))
    rt = (cx + R * math.sin(a), cy + R * math.cos(a))
    shape = unary_union([circ(cx, cy, R), Polygon([lt, rt, (cx, ty)])])
    r = p["tip_round"]
    return shape.buffer(-r, 64).buffer(r, 64)

def black(p):
    """The S channel. Both bowls meet at the spine with width w; the upper
    bowl's outer circle is lifted by `lift`, so that stroke swells smoothly
    from w at the spine to w + 2*lift at the top — room for the door."""
    sx, sy, w = p["sx"], p["sy"], p["w"]
    rin1, rin2, e = p["rin_top"], p["rin_bot"], p["lift"]
    rho1, rho2 = rin1 + w / 2, rin2 + w / 2
    o1 = (sx, sy - rho1)                       # upper bowl (inner circle) centre
    o2 = (sx, sy + rho2)                       # lower bowl centre
    rout1, rout2 = rin1 + w + e, rin2 + w
    o1o = (o1[0], o1[1] - e)                   # upper outer circle, lifted
    big = 5000
    left = box(-big, -big, o1[0], big)
    u1 = circ(*o1o, rout1).difference(circ(*o1, rin1)).intersection(left)
    top = o1o[1] - rout1
    rb = rout1 * p["taper"]
    u2 = box(o1[0], -big, big, o1[1] - rin1).intersection(circ(o1[0], top + rb, rb))
    ring2 = circ(*o2, rout2).difference(circ(*o2, rin2))
    u3 = ring2.intersection(box(o2[0], -big, big, big))
    rb2 = rout2 * p["taper_bot"]
    u4 = box(-big, o2[1] + rin2, o2[0], big).intersection(circ(o2[0], o2[1] + rout2 - rb2, rb2))
    shape = unary_union([u1, u2, u3, u4])
    if p["tilt"]:
        shape = affinity.rotate(shape, p["tilt"], origin=(sx, sy))
    return shape, o1, rin1, rout1

def door(p, o1, rin):
    import math
    # Anchor on the tongue's top edge, then follow the S's tilt; the door
    # itself stays upright and sits on the highest point of that sloped edge.
    t = math.radians(p["tilt"])
    ax, ay = o1[0] + p["door_dx"] - p["sx"], o1[1] - rin - p["sy"]
    x = p["sx"] + ax * math.cos(t) - ay * math.sin(t)
    y = p["sy"] + ax * math.sin(t) + ay * math.cos(t)
    w, h = p["door_w"], p["door_h"]
    base = y - (w / 2) * abs(math.tan(t)) - p["door_gap"]
    body = box(x - w / 2, base - h + w / 2, x + w / 2, base)
    return unary_union([body, circ(x, base - h + w / 2, w / 2)])

def soften(g, r):
    return g.buffer(-r, 32).buffer(2 * r, 32).buffer(-r, 32) if r else g

def build(p):
    pn = pin(p)
    blk, o1, rin, rout = black(p)
    white = soften(pn.difference(blk), p["corner"])
    return white, soften(door(p, o1, rin), 3)

if __name__ == "__main__":
    white, dr = build(P)
    x0, y0, x1, y1 = white.union(dr).bounds
    s = 100 / (y1 - y0)                      # normalise: mark height = 100 units

    def norm(g):
        return affinity.scale(affinity.translate(g, -x0, -y0), s, s, origin=(0, 0))

    def path(g):
        polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
        return "".join(
            "M" + " ".join(f"{x:.2f},{y:.2f}" for x, y in list(r.simplify(0.04).coords)[:-1]) + "Z"
            for poly in polys for r in [poly.exterior, *poly.interiors]
        )

    json.dump({"w": round((x1 - x0) * s, 2), "h": 100,
               "white": path(norm(white)), "door": path(norm(dr))}, sys.stdout)
