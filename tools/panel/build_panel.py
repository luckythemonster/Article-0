#!/usr/bin/env python3
"""Build the HUD panel's sprite sheets from `ui-panel.aseprite`.

The panel is not one image. Its source carries six layers, four of which are
*independent* indicators driven by live game state — three counts and a status
badge — plus a screen fill that darkens when the readout has no data. Those
combine 2 x 8 x 8 x 8 x 4 = 4096 ways, so there is no set of flat frames that
covers them: the panel has to be assembled at runtime from a nine-slice chrome
plus four small sprites, and this script cuts the source into exactly those
pieces.

Two sheets come out:

  ui-panel.png            96x48, two 48x48 frames of `base` + `screen` only.
                          The generic panel every widget nine-slices. Frame 0 is
                          the dark screen, frame 1 the lit one. Deliberately
                          *without* the indicator layers, so the inventory strip
                          and anything else that adopts a panel does not inherit
                          three meaningless LED labels.

  network-indicators.png  96x48, an 8x4 grid of 12x12 frames — the four
                          indicators, each cropped to the 12px corner it lives
                          in. Cropping to the corner rather than to the ink is
                          what makes placement trivial: nine-slice reproduces
                          corners at native size, so each sprite sits flush at
                          its panel corner whatever size the panel is stretched
                          to.

Run by hand; the output is committed. Same arrangement as `tools/font/`.

    pip install Pillow
    python3 tools/panel/build_panel.py

Everything below is measured off the source file rather than assumed — see
`_probe()`, which fails loudly if the art moves out from under these numbers.
"""

from __future__ import annotations

import math
import os
import struct
import zlib
from collections import Counter

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PANEL_DIR = os.path.join(ROOT, "public", "assets", "ui", "panel")
SRC = os.path.join(PANEL_DIR, "ui-panel.aseprite")
OUT_CHROME = os.path.join(PANEL_DIR, "ui-panel.png")
OUT_INDICATORS = os.path.join(PANEL_DIR, "network-indicators.png")

# --- geometry, mirrored by src/ui/NetworkPanel.ts and UiTextures.ts --------

CANVAS = 48
#: Nine-slice inset. Also the indicator crop size — they are the same 12px
#: corner, which is the whole reason the indicators survive stretching.
INSET = 12
INDICATOR = INSET

#: Source frames that carry each state, by the artist's own cel annotations.
SCREEN_OFF_FRAME = 0
SCREEN_ON_FRAME = 1
#: Frames holding counts 0..7, in order. Frame 1 is the all-dark "0".
COUNT_FRAMES = (1, 4, 5, 6, 7, 8, 9, 10)
#: Frames holding the badge's four states, in DISCONNECTED/WARNING/ALERT/NOMINAL
#: order — which is the order `BadgeState` lists them in.
BADGE_FRAMES = (0, 1, 2, 3)

#: Layer names, and which corner each indicator occupies.
LAYER_BASE = "base"
LAYER_SCREEN = "screen"
#: (layer name, corner) in the frame order the indicator sheet lays them out.
INDICATOR_LAYERS = (
    ("UNIT_indicator_LEDs", "TL"),
    ("SPOT_indicator_LEDs", "BR"),
    ("SUSP_indicator_LEDs", "BL"),
    ("NETWORK", "TR"),
)
CORNER_ORIGIN = {
    "TL": (0, 0),
    "TR": (CANVAS - INSET, 0),
    "BL": (0, CANVAS - INSET),
    "BR": (CANVAS - INSET, CANVAS - INSET),
}

#: Sheet layout: 8 columns so each 8-frame count run occupies exactly one row.
SHEET_COLS = 8
SHEET_ROWS = 4

# --- palette ---------------------------------------------------------------

EDG64 = {
    "ff0040", "131313", "1b1b1b", "272727", "3d3d3d", "5d5d5d", "858585",
    "b4b4b4", "ffffff", "c7cfdd", "92a1b9", "657392", "424c6e", "2a2f4e",
    "1a1932", "0e071b", "1c121c", "391f21", "5d2c28", "8a4836", "bf6f4a",
    "e69c69", "f6ca9f", "f9e6cf", "edab50", "e07438", "c64524", "8e251d",
    "ff5000", "ed7614", "ffa214", "ffc825", "ffeb57", "d3fc7e", "99e65f",
    "5ac54f", "33984b", "1e6f50", "134c4c", "0c2e44", "00396d", "0069aa",
    "0098dc", "00cdf9", "0cf1ff", "94fdff", "fdd2ed", "f389f5", "db3ffd",
    "7a09fa", "3003d9", "0c0293", "03193f", "3b1443", "622461", "93388f",
    "ca52c9", "c85086", "f68187", "f5555d", "ea323c", "c42430", "891e2b",
    "571c27",
}

#: The three LED label bars are drawn with a textured brush that scatters ~34
#: near-duplicates of `--c-border-dim` across them — all within a rounding error
#: of each other, none of them palette entries. Snapped here rather than in the
#: source, so the .aseprite keeps whatever the artist drew while the shipped
#: sheet stays strictly ENDESGA-64.
SNAP_TARGET = (0x2A, 0x2F, 0x4E)
SNAP_RADIUS = 16


# --- .aseprite reader ------------------------------------------------------
#
# Enough of the format to composite this file: layers, cels (raw + zlib), and
# linked cels. Written out rather than pulled in as a dependency because it is
# forty lines and the alternative is a package that has to be pinned, audited
# and kept working for one asset.


def _read_aseprite(path: str):
    d = open(path, "rb").read()
    magic, frames = struct.unpack("<H", d[4:6])[0], struct.unpack("<H", d[6:8])[0]
    w, h = struct.unpack("<HH", d[8:12])
    if magic != 0xA5E0:
        raise SystemExit(f"{path}: not an .aseprite file (magic {magic:#06x})")
    if (w, h) != (CANVAS, CANVAS):
        raise SystemExit(f"{path}: canvas is {w}x{h}, expected {CANVAS}x{CANVAS}")

    def text(o):
        n = struct.unpack("<H", d[o : o + 2])[0]
        return d[o + 2 : o + 2 + n].decode("utf8", "replace"), o + 2 + n

    layers: list[str] = []
    cels: dict[tuple[int, int], tuple] = {}
    linked: dict[tuple[int, int], int] = {}

    off = 128
    for fi in range(frames):
        fbytes, _fmagic, oldn = struct.unpack("<IHH", d[off : off + 8])
        nchunks = struct.unpack("<I", d[off + 12 : off + 16])[0] or oldn
        co = off + 16
        for _ in range(nchunks):
            csize, ctype = struct.unpack("<IH", d[co : co + 6])
            body = co + 6
            if ctype == 0x2004:
                name, _ = text(body + 16)
                layers.append(name)
            elif ctype == 0x2005:
                li, x, y, opacity, celtype = struct.unpack("<HhhBH", d[body : body + 9])
                if celtype == 1:
                    linked[(fi, li)] = struct.unpack("<H", d[body + 16 : body + 18])[0]
                elif celtype in (0, 2):
                    cw, ch = struct.unpack("<HH", d[body + 16 : body + 20])
                    payload = d[body + 20 : co + csize]
                    if celtype == 2:
                        # Raw inflate, skipping the 2-byte zlib header: some
                        # exporters truncate the trailing Adler-32, which makes
                        # a checked decompress fail on otherwise-complete data.
                        obj = zlib.decompressobj(-15)
                        pixels = obj.decompress(payload[2:]) + obj.flush()
                    else:
                        pixels = payload
                    cels[(fi, li)] = (x, y, opacity, cw, ch, pixels)
            co += csize
        off += fbytes

    return frames, layers, cels, linked


def _cel(cels, linked, fi: int, li: int):
    if (fi, li) in linked:
        return _cel(cels, linked, linked[(fi, li)], li)
    return cels.get((fi, li))


def _composite(cels, linked, fi: int, layer_ids: list[int]) -> Image.Image:
    """Alpha-composite `layer_ids` (bottom first) of frame `fi` onto transparency."""
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    for li in layer_ids:
        c = _cel(cels, linked, fi, li)
        if c is None:
            continue
        x, y, opacity, cw, ch, pixels = c
        layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        sub = Image.frombytes("RGBA", (cw, ch), bytes(pixels))
        if opacity != 255:
            alpha = sub.getchannel("A").point(lambda a: a * opacity // 255)
            sub.putalpha(alpha)
        layer.paste(sub, (x, y))
        out = Image.alpha_composite(out, layer)
    return out


def _snap(im: Image.Image) -> tuple[Image.Image, int]:
    """Pull the label bars' brush noise onto `--c-border-dim`. Returns (image, n)."""
    px = im.load()
    snapped = 0
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if (r, g, b) != SNAP_TARGET and math.dist((r, g, b), SNAP_TARGET) <= SNAP_RADIUS:
                px[x, y] = (*SNAP_TARGET, a)
                snapped += 1
    return im, snapped


def _probe(layers: list[str]) -> dict[str, int]:
    """Layer name -> index, failing loudly if the art no longer matches."""
    idx = {name: i for i, name in enumerate(layers)}
    expected = [LAYER_BASE, LAYER_SCREEN] + [n for n, _ in INDICATOR_LAYERS]
    missing = [n for n in expected if n not in idx]
    if missing:
        raise SystemExit(
            f"{SRC}: missing layer(s) {missing}.\n"
            f"  found: {layers}\n"
            "  The art was restructured; this script and src/ui/NetworkPanel.ts "
            "both need updating together."
        )
    return idx


def build() -> None:
    frames, layers, cels, linked = _read_aseprite(SRC)
    idx = _probe(layers)
    print(f"{os.path.relpath(SRC, ROOT)}: {frames} frames, layers {layers}")

    needed = max(max(COUNT_FRAMES), max(BADGE_FRAMES), SCREEN_ON_FRAME)
    if frames <= needed:
        raise SystemExit(f"{SRC}: only {frames} frames, need at least {needed + 1}")

    total_snapped = 0

    # --- chrome: base + screen, two frames ---------------------------------
    chrome = Image.new("RGBA", (CANVAS * 2, CANVAS), (0, 0, 0, 0))
    for slot, fi in enumerate((SCREEN_OFF_FRAME, SCREEN_ON_FRAME)):
        im = _composite(cels, linked, fi, [idx[LAYER_BASE], idx[LAYER_SCREEN]])
        im, n = _snap(im)
        total_snapped += n
        chrome.paste(im, (slot * CANVAS, 0))
    chrome.save(OUT_CHROME)

    # --- indicators: four corners, 12x12 each ------------------------------
    sheet = Image.new("RGBA", (INDICATOR * SHEET_COLS, INDICATOR * SHEET_ROWS), (0, 0, 0, 0))
    placed = 0
    for row, (layer_name, corner) in enumerate(INDICATOR_LAYERS):
        li = idx[layer_name]
        src_frames = BADGE_FRAMES if layer_name == "NETWORK" else COUNT_FRAMES
        ox, oy = CORNER_ORIGIN[corner]
        for col, fi in enumerate(src_frames):
            im = _composite(cels, linked, fi, [li])
            im, n = _snap(im)
            total_snapped += n
            crop = im.crop((ox, oy, ox + INDICATOR, oy + INDICATOR))
            sheet.paste(crop, (col * INDICATOR, row * INDICATOR))
            placed += 1
    sheet.save(OUT_INDICATORS)

    _verify(chrome, sheet, placed, total_snapped)


def _verify(chrome: Image.Image, sheet: Image.Image, placed: int, snapped: int) -> None:
    """Prove the output rather than trust it: palette, coverage, geometry."""
    print(f"\n  snapped {snapped} brush-noise pixels onto #2a2f4e")
    bad: list[str] = []

    for name, im in ((OUT_CHROME, chrome), (OUT_INDICATORS, sheet)):
        cols = Counter()
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if a:
                    cols[(r, g, b)] += 1
        off = sorted({f"#{r:02x}{g:02x}{b:02x}" for r, g, b in cols if f"{r:02x}{g:02x}{b:02x}" not in EDG64})
        print(f"  {os.path.relpath(name, ROOT)}: {im.width}x{im.height}, {len(cols)} colours")
        if off:
            bad.append(f"{os.path.basename(name)}: {len(off)} off-palette colours {off[:6]}")

    # Each indicator row must actually differ frame to frame, or a cel-linking
    # mistake would silently ship eight identical "counts".
    px = sheet.load()
    for row, (layer_name, _) in enumerate(INDICATOR_LAYERS):
        seen = set()
        n = len(BADGE_FRAMES) if layer_name == "NETWORK" else len(COUNT_FRAMES)
        for col in range(n):
            box = tuple(
                px[col * INDICATOR + x, row * INDICATOR + y]
                for y in range(INDICATOR)
                for x in range(INDICATOR)
            )
            seen.add(box)
        if len(seen) != n:
            bad.append(f"{layer_name}: {n} frames but only {len(seen)} distinct — cels may be mislinked")
        else:
            print(f"  {layer_name:22} {n} distinct frames")

    print(f"\n  {placed} indicator frames placed in an {SHEET_COLS}x{SHEET_ROWS} grid")
    print("  " + ("\n  ".join(f"FAIL {b}" for b in bad) if bad else "all colours ENDESGA-64, all frames distinct"))
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    build()
