#!/usr/bin/env python3
"""Build `ArticleZeroSymbols-Regular.woff2` — the UI's geometric symbols.

Share Tech Mono carries none of the fourteen symbols this game's UI is built out
of (arrows, ticks, rings, carets), so without this they render in whatever face
the browser falls back to: a different weight, a different width, in the middle
of otherwise consistent terminal text. Worse, a fallback glyph does not honour the
540-unit cell, which is what the HUD's column alignment rests on.

Drawing them into Share Tech Mono is not an option. `src/ui/fonts/OFL.txt`
declares Reserved Font Name 'Share', and OFL 1.1 clause 3 forbids a Modified
Version from using it — so patching that file would mean renaming the family and
forking off upstream permanently. This is a *separate* font instead, listed after
Share Tech Mono in the stack: CSS and canvas both resolve fallback per glyph, so
Share Tech Mono keeps serving the text and this picks up exactly what it lacks.
Original drawings, no derivative work, upstream stays updatable.

Run by hand; the output is committed. Same arrangement as the offline collider
generator in `src/tools/collider/`.

    pip install fonttools brotli
    python3 tools/font/build_symbols.py

Every metric below is measured off ShareTechMono-Regular.woff2 — see METRICS.
"""

from __future__ import annotations

import json
import math
import os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
FONT_DIR = os.path.join(ROOT, "src", "ui", "fonts")
BASE_FONT = os.path.join(FONT_DIR, "ShareTechMono-Regular.woff2")
OUT_FONT = os.path.join(FONT_DIR, "ArticleZeroSymbols-Regular.woff2")
OUT_COVERAGE = os.path.join(FONT_DIR, "coverage.json")

# --- metrics, measured off Share Tech Mono --------------------------------
UPEM = 1000
ADVANCE = 540          # uniform: the base font is a true monospace
ASCENT = 885
DESCENT = -242
CAP_HEIGHT = 700
X_HEIGHT = 500

CX = 270               # centre of the drawing box (x 70..470)
CY = 313               # symbol axis: matches `plus`, which spans y 118..508
# Half-extent of a full-size symbol. Sized for where these actually render — the
# HUD at 10-12px — not for a specimen sheet. An earlier pass used 195 (0.39em),
# which matches the maths axis of `plus` and looks correct at 20px and above; at
# 12px it put the arrows' heads under 4 device pixels, they anti-aliased away, and
# `<-` `->` read as hyphens. Symbol glyphs in text faces are conventionally drawn
# much larger than the maths axis for exactly this reason. 215 overhangs the
# 70..470 box slightly, which is unremarkable here: the base font's own glyphs
# reach x 1010 against the same 540 advance.
HALF = 215
STROKE = 75            # matches `hyphen`, y 275..350

FAMILY = "Article Zero Symbols"
VERSION = "1.000"


# --- geometry helpers -----------------------------------------------------

def circle(pen, cx: float, cy: float, r: float, cw: bool = True) -> None:
    """A circle as eight quadratic arcs.

    Eight, not four: one quadratic per quarter-turn carries ~2.7% radial error,
    which is plainly visible on a ring this size. Per 45 degrees it drops to
    ~0.17%. Control points sit on the tangent intersection, at r/cos(22.5) —
    that is what makes the arc touch the true circle at both ends and its middle.
    """
    steps = 8
    step = 2 * math.pi / steps
    ctrl_r = r / math.cos(step / 2)
    sign = -1 if cw else 1          # y-up coords: clockwise means decreasing angle
    pt = lambda a, rad: (cx + rad * math.cos(a), cy + rad * math.sin(a))

    pen.moveTo(pt(0, r))
    for i in range(steps):
        a0 = sign * i * step
        pen.qCurveTo(pt(a0 + sign * step / 2, ctrl_r), pt(a0 + sign * step, r))
    pen.closePath()


def polygon(pen, points, cw: bool = True) -> None:
    """A straight-edged contour. `points` given counter-clockwise (y-up)."""
    pts = list(points) if not cw else list(reversed(points))
    pen.moveTo(pts[0])
    for p in pts[1:]:
        pen.lineTo(p)
    pen.closePath()


def rect(pen, x0: float, y0: float, x1: float, y1: float, cw: bool = True) -> None:
    polygon(pen, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], cw)


def diamond(pen, cx: float, cy: float, rx: float, ry: float, cw: bool = True) -> None:
    polygon(pen, [(cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)], cw)


def stroke_polyline(pen, points, width: float, cw: bool = True) -> None:
    """A polyline turned into a filled contour, with mitred joins.

    Used for the ticks and the crosses. Offsetting each segment and intersecting
    consecutive offset lines gives a proper mitre, so the elbow of a check mark
    comes to a point instead of showing the notch a naive per-segment quad leaves.
    """
    half = width / 2
    left, right = _offset_side(points, half), _offset_side(points, -half)
    polygon(pen, left + list(reversed(right)), cw)


def _offset_side(points, half: float):
    """One side of the offset path: endpoints squared off, joints mitred."""
    segs = []
    for a, b in zip(points, points[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        nx, ny = -dy / length * half, dx / length * half
        segs.append(((a[0] + nx, a[1] + ny), (b[0] + nx, b[1] + ny)))

    out = [segs[0][0]]
    for (p0, p1), (q0, q1) in zip(segs, segs[1:]):
        hit = _intersect(p0, p1, q0, q1)
        out.append(hit if hit else p1)
    out.append(segs[-1][1])
    return out


def _intersect(p0, p1, q0, q1):
    """Intersection of two infinite lines, or None when they're parallel."""
    x1, y1 = p0
    x2, y2 = p1
    x3, y3 = q0
    x4, y4 = q1
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-9:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))


# --- the glyphs -----------------------------------------------------------
#
# Each entry draws into a pen already centred on the (CX, CY) symbol axis.
# Shapes are kept to the STROKE weight so they sit at the same optical density
# as the surrounding text rather than reading as icons dropped into a sentence.

# Arrow proportions, and the reason they are what they are.
#
# The first pass used a 100-unit head at +-95: geometrically an arrow, and at
# 64px unmistakably one. At 12px — the size the pause hint and the alert-network
# readout actually render at — the head is barely a pixel of diagonal, it
# anti-aliases away, and `CONVERGING 3 -> (14,22)` reads as a dash. A head has to
# be a large fraction of the whole mark to survive being two pixels tall.
ARROW_SHAFT = 95          # heavier than STROKE: at 11px the shaft is most of the mark
ARROW_HEAD_LEN = 195      # ~45% of the length — short and blunt survives better than long and fine
ARROW_HEAD_HALF = 180     # 3.8x the shaft, so the barbs read even when the tip does not


def draw_arrow_right(pen):
    tail, tip = CX - HALF, CX + HALF
    rect(pen, tail, CY - ARROW_SHAFT / 2, tip - ARROW_HEAD_LEN, CY + ARROW_SHAFT / 2)
    polygon(pen, [(tip - ARROW_HEAD_LEN, CY - ARROW_HEAD_HALF),
                  (tip, CY),
                  (tip - ARROW_HEAD_LEN, CY + ARROW_HEAD_HALF)])


def draw_arrow_left(pen):
    tip, tail = CX - HALF, CX + HALF
    rect(pen, tip + ARROW_HEAD_LEN, CY - ARROW_SHAFT / 2, tail, CY + ARROW_SHAFT / 2)
    polygon(pen, [(tip + ARROW_HEAD_LEN, CY + ARROW_HEAD_HALF),
                  (tip, CY),
                  (tip + ARROW_HEAD_LEN, CY - ARROW_HEAD_HALF)])


def draw_arrow_up(pen):
    tail, tip = CY - HALF, CY + HALF
    rect(pen, CX - ARROW_SHAFT / 2, tail, CX + ARROW_SHAFT / 2, tip - ARROW_HEAD_LEN)
    polygon(pen, [(CX - ARROW_HEAD_HALF, tip - ARROW_HEAD_LEN),
                  (CX + ARROW_HEAD_HALF, tip - ARROW_HEAD_LEN),
                  (CX, tip)])


def draw_arrow_down(pen):
    tip, tail = CY - HALF, CY + HALF
    rect(pen, CX - ARROW_SHAFT / 2, tip + ARROW_HEAD_LEN, CX + ARROW_SHAFT / 2, tail)
    polygon(pen, [(CX + ARROW_HEAD_HALF, tip + ARROW_HEAD_LEN),
                  (CX - ARROW_HEAD_HALF, tip + ARROW_HEAD_LEN),
                  (CX, tip)])


def draw_caret_right(pen):
    """U+25B8 — a *small* triangle. Sized off the centroid, not the bounding box:
    a triangle's optical centre sits a third from its base, so matching bboxes
    would leave it visibly left of the cell's middle."""
    base_x, tip_x, h = CX - 90, CX + 155, 196
    polygon(pen, [(base_x, CY - h), (tip_x, CY), (base_x, CY + h)])


def draw_ring(pen):
    """U+25CB. 70 rather than the full 75: a closed ring reads heavier than an
    open stroke of the same width, and at HUD size it fills in otherwise."""
    circle(pen, CX, CY, 200, cw=True)
    circle(pen, CX, CY, 118, cw=False)


def draw_bullseye(pen):
    """U+25CE — ring plus a centred dot."""
    circle(pen, CX, CY, 200, cw=True)
    circle(pen, CX, CY, 124, cw=False)
    circle(pen, CX, CY, 80, cw=True)


TICK_PATH = [(CX - 190, CY + 30), (CX - 52, CY - 128), (CX + 196, CY + 172)]


def draw_tick(pen):
    stroke_polyline(pen, TICK_PATH, STROKE)


def draw_tick_heavy(pen):
    """U+2714 — the same path, heavier, so ✓ and ✔ read as one family.

    The path is pulled in a little first: a mitred join projects past the corner
    it turns, and at 115 units that overshoot pushes the tick out of the cell.
    """
    scaled = [(CX + (x - CX) * 0.93, CY + (y - CY) * 0.93) for x, y in TICK_PATH]
    stroke_polyline(pen, scaled, 115)


def draw_cross_heavy(pen):
    """U+2716. Two overlapping contours wound the same way: nonzero fill unions
    them, so the crossing does not punch a hole."""
    d = 172
    stroke_polyline(pen, [(CX - d, CY - d), (CX + d, CY + d)], 100)
    stroke_polyline(pen, [(CX - d, CY + d), (CX + d, CY - d)], 100)


def draw_warning(pen):
    """U+26A0 — triangle outline with the exclamation sitting in its counter.

    The counter is inset properly, by scaling about the *incentre*, not by nudging
    each vertex. Insetting a triangle's vertices by eye gives a border that is
    thick at the base and pinched at the apex, which is what the first attempt
    looked like.
    """
    apex, base_y, half_w = CY + 225, CY - 205, 220
    outer = [(CX - half_w, base_y), (CX + half_w, base_y), (CX, apex)]
    polygon(pen, outer, cw=True)

    border = 58
    ix, iy, inradius = _incentre(outer)
    k = (inradius - border) / inradius
    polygon(pen, [(ix + (x - ix) * k, iy + (y - iy) * k) for x, y in outer], cw=False)

    # Exclamation, sized to sit inside that counter with room to breathe.
    rect(pen, CX - 24, iy + 2, CX + 24, iy + 108)
    rect(pen, CX - 24, iy - 52, CX + 24, iy - 14)


def _incentre(tri):
    """Centre and radius of a triangle's inscribed circle."""
    (ax, ay), (bx, by), (cx_, cy_) = tri
    a = math.dist((bx, by), (cx_, cy_))
    b = math.dist((cx_, cy_), (ax, ay))
    c = math.dist((ax, ay), (bx, by))
    per = a + b + c
    x = (a * ax + b * bx + c * cx_) / per
    y = (a * ay + b * by + c * cy_) / per
    area = abs(ax * (by - cy_) + bx * (cy_ - ay) + cx_ * (ay - by)) / 2
    return x, y, area / (per / 2)


def draw_pause(pen):
    """U+23F8 — two bars, gap matched to the bar width so it reads at small size."""
    rect(pen, CX - 150, CY - 200, CX - 45, CY + 200)
    rect(pen, CX + 45, CY - 200, CX + 150, CY + 200)


def draw_diamond_in_diamond(pen):
    """U+25C8 — outlined diamond containing a solid one."""
    diamond(pen, CX, CY, 215, 215, cw=True)
    diamond(pen, CX, CY, 130, 130, cw=False)
    diamond(pen, CX, CY, 80, 80, cw=True)


def draw_circled_zero(pen):
    """U+24FF — solid disc with a zero knocked out of it. Three contours: the
    disc, then the zero's outside as a counter, then the zero's own bowl filled
    back in."""
    circle(pen, CX, CY, 215, cw=True)
    _ellipse(pen, CX, CY, 92, 132, cw=False)
    _ellipse(pen, CX, CY, 38, 70, cw=True)


def _ellipse(pen, cx, cy, rx, ry, cw=True):
    steps = 8
    step = 2 * math.pi / steps
    k = 1 / math.cos(step / 2)
    sign = -1 if cw else 1
    pt = lambda a, s: (cx + rx * s * math.cos(a), cy + ry * s * math.sin(a))
    pen.moveTo(pt(0, 1))
    for i in range(steps):
        a0 = sign * i * step
        pen.qCurveTo(pt(a0 + sign * step / 2, k), pt(a0 + sign * step, 1))
    pen.closePath()


GLYPHS = [
    (0x2190, "arrowleft", draw_arrow_left),
    (0x2191, "arrowup", draw_arrow_up),
    (0x2192, "arrowright", draw_arrow_right),
    (0x2193, "arrowdown", draw_arrow_down),
    (0x23F8, "pausesign", draw_pause),
    (0x24FF, "circledzero", draw_circled_zero),
    (0x25B8, "caretright", draw_caret_right),
    (0x25C8, "diamondindiamond", draw_diamond_in_diamond),
    (0x25CB, "whitecircle", draw_ring),
    (0x25CE, "bullseye", draw_bullseye),
    (0x26A0, "warning", draw_warning),
    (0x2713, "checkmark", draw_tick),
    (0x2714, "checkmarkheavy", draw_tick_heavy),
    (0x2716, "crossheavy", draw_cross_heavy),
]


def build() -> None:
    order = [".notdef"] + [name for _, name, _ in GLYPHS]
    fb = FontBuilder(UPEM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({cp: name for cp, name, _ in GLYPHS})

    glyphs = {".notdef": TTGlyphPen(None).glyph()}
    metrics = {".notdef": (ADVANCE, 0)}
    for _, name, draw in GLYPHS:
        # Recorded once, replayed twice: the outline has to be measured before it
        # is committed, because hmtx's left side bearing must equal the glyph's
        # own xMin. Declaring lsb=0 against an outline starting at x=75 does not
        # merely mislabel it — fontTools' glyph set then shifts every contour left
        # by the difference, which silently slides all fourteen symbols out of the
        # cell they were drawn for.
        rec = RecordingPen()
        draw(rec)

        bounds = BoundsPen(None)
        rec.replay(bounds)
        x_min = int(math.floor(bounds.bounds[0]))

        pen = TTGlyphPen(None)
        rec.replay(pen)
        glyphs[name] = pen.glyph()
        metrics[name] = (ADVANCE, x_min)
    fb.setupGlyf(glyphs)

    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    fb.setupNameTable({
        "familyName": FAMILY,
        "styleName": "Regular",
        "uniqueFontIdentifier": f"{FAMILY} Regular; {VERSION}",
        "fullName": f"{FAMILY} Regular",
        "psName": FAMILY.replace(" ", "") + "-Regular",
        "version": VERSION,
        "manufacturer": "Article Zero",
        "designer": "Article Zero",
        "description": "Geometric UI symbols drawn to Share Tech Mono's metrics.",
    })
    fb.setupOS2(
        sTypoAscender=ASCENT,
        sTypoDescender=DESCENT,
        sCapHeight=CAP_HEIGHT,
        sxHeight=X_HEIGHT,
        usWinAscent=ASCENT,
        usWinDescent=-DESCENT,
        achVendID="AZRO",
        # PANOSE wants all ten fields. Only two carry meaning here: family type 2
        # (latin text) and proportion 9 (monospaced), which is the cell these
        # glyphs are drawn for and what tells a font picker they are not
        # proportional.
        panose=dict(
            bFamilyType=2,
            bSerifStyle=11,
            bWeight=5,
            bProportion=9,
            bContrast=0,
            bStrokeVariation=0,
            bArmStyle=0,
            bLetterForm=0,
            bMidline=0,
            bXHeight=0,
        ),
    )
    fb.setupPost()
    fb.font.flavor = "woff2"
    fb.save(OUT_FONT)

    _report()
    _write_coverage()


def _report() -> None:
    ft = TTFont(OUT_FONT)
    gs = ft.getGlyphSet()
    print(f"{os.path.relpath(OUT_FONT, ROOT)}  {os.path.getsize(OUT_FONT)} bytes\n")
    print(f"  {'glyph':18} {'cp':8} {'adv':>4}  bbox")
    bad = []
    for cp, name, _ in GLYPHS:
        bp = BoundsPen(gs)
        gs[name].draw(bp)
        adv = ft["hmtx"][name][0]
        x0, y0, x1, y1 = (round(v) for v in bp.bounds)
        mid_y = (y0 + y1) / 2
        print(f"  {name:18} U+{cp:04X}  {adv:>4}  x {x0:>4}..{x1:<4} y {y0:>4}..{y1:<4} (mid y {mid_y:.0f})")
        if adv != ADVANCE:
            bad.append(f"{name}: advance {adv} != {ADVANCE}")
        if x0 < 40 or x1 > 500:
            bad.append(f"{name}: x {x0}..{x1} overhangs the cell more than the base font does")
        if abs(mid_y - CY) > 22:
            bad.append(f"{name}: ink centred at y {mid_y:.0f}, off the {CY} axis")
    print("\n  " + ("\n  ".join(f"WARN {b}" for b in bad) if bad else "all advances 540, all boxes in range, all centred"))


def _write_coverage() -> None:
    """Codepoints the stack covers, for `src/ui/fonts.test.ts` to assert against.

    Emitted here rather than read from the woff2 at test time so the test stays a
    plain node test with no font library — vitest runs in node with no fontTools
    and no way to inflate brotli-compressed glyf tables.
    """
    covered = set()
    for path in (BASE_FONT, OUT_FONT):
        ft = TTFont(path)
        for table in ft["cmap"].tables:
            covered |= set(table.cmap.keys())
    payload = {
        "note": "Generated by tools/font/build_symbols.py — do not edit by hand.",
        "families": ["Share Tech Mono", FAMILY],
        "codepoints": sorted(covered),
    }
    with open(OUT_COVERAGE, "w") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")
    print(f"\n  {os.path.relpath(OUT_COVERAGE, ROOT)}: {len(covered)} codepoints covered")


if __name__ == "__main__":
    build()
