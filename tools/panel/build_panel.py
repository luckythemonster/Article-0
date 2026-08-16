#!/usr/bin/env python3
"""Build the HUD panel's sprite sheets from `ui-panel.aseprite`.

The panel is not one image. Its source carries six layers, four of which are
*independent* indicators driven by live game state — three binary counts and a
status badge — over a screen fill with three states of its own. Those combine
into more than twenty thousand readouts, so there is no set of flat frames that
covers them: the panel has to be assembled at runtime from a nine-slice chrome
plus four small sprites, and this script cuts the source into exactly those
pieces.

Three files come out:

  ui-panel.png            144x48, three 48x48 frames of `base` + `screen` only.
                          The generic panel every widget nine-slices: a dark
                          screen, a lit one, and the red alert flash.
                          Deliberately *without* the indicator layers, so the
                          inventory strip and anything else that adopts a panel
                          does not inherit three meaningless LED labels.

  network-indicators.png  192x48, a 16x4 grid of 12x12 frames — the four
                          indicators, each cropped to the 12px corner it lives
                          in. Cropping to the corner rather than to the ink is
                          what makes placement trivial: nine-slice reproduces
                          corners at native size, so each sprite sits flush at
                          its panel corner whatever size the panel is stretched
                          to. One row per indicator, so a cluster's counts stay
                          contiguous and `base + n` addresses the count `n`;
                          only 11 of each row's 16 slots are drawn and the rest
                          are never addressed.

  networkIndicatorFrames.json   emitted into `src/ui/`, mapping every state the
                          artist named onto its frame index. This is the
                          art->code contract, and it is generated rather than
                          written down twice.

**The cel labels are the contract.** Every count frame is annotated in the
source with its own number (`'0'`..`'10'`, plus a `>`-prefixed overflow), and
every badge and screen frame with its state name. This script reads those
annotations, not frame positions — which is why the counts could grow from 0-7
to 0-10 across two redraws with no code change at all: re-run the tool and the
new range is simply in the JSON. Frames may be reordered or inserted freely; it
is the labels that must not change meaning.

Run by hand; the output is committed. Same arrangement as `tools/font/`.

    pip install Pillow
    python3 tools/panel/build_panel.py

Everything below is measured off the source file rather than assumed — see
`_probe()`, which fails loudly if the art moves out from under these numbers.
"""

from __future__ import annotations

import json
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
OUT_MANIFEST = os.path.join(ROOT, "src", "ui", "networkIndicatorFrames.json")

# --- geometry, mirrored by src/ui/NetworkPanel.ts and UiTextures.ts --------

CANVAS = 48
#: Nine-slice inset. Also the indicator crop size — they are the same 12px
#: corner, which is the whole reason the indicators survive stretching.
INSET = 12
INDICATOR = INSET

#: Layer names, and which corner each indicator occupies.
LAYER_BASE = "base"
LAYER_SCREEN = "screen"
LAYER_BADGE = "NETWORK"
#: The three count clusters, in the order the indicator sheet lays them out.
COUNT_LAYERS = (
    ("UNIT_indicator_LEDs", "TL"),
    ("SPOT_indicator_LEDs", "BR"),
    ("SUSP_indicator_LEDs", "BL"),
)
BADGE_CORNER = "TR"
CORNER_ORIGIN = {
    "TL": (0, 0),
    "TR": (CANVAS - INSET, 0),
    "BL": (0, CANVAS - INSET),
    "BR": (CANVAS - INSET, CANVAS - INSET),
}

#: Cel labels the screen layer uses, in the frame order the chrome sheet emits.
SCREEN_LABELS = ("off", "on", "ALERT_FLASH")
#: Cel labels the badge uses, in the frame order the indicator sheet emits.
BADGE_LABELS = ("DISCONNECTED", "NOMINAL", "SUSPICIOUS", "ALERT", "BLINK")
#: The count clusters' own "everything is lit" frame, on top of 0..N.
BLINK_LABEL = "BLINK"

#: Columns in the indicator sheet. Wide enough for the longest run — the counts,
#: which are 0..N plus an overflow and a blink — so each cluster gets one row.
SHEET_COLS = 16

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
    #: (frame, layer) -> the artist's own annotation on that cel. This is the
    #: contract: frames are found by what they are labelled, never by index.
    labels: dict[tuple[int, int], str] = {}

    off = 128
    for fi in range(frames):
        fbytes, _fmagic, oldn = struct.unpack("<IHH", d[off : off + 8])
        nchunks = struct.unpack("<I", d[off + 12 : off + 16])[0] or oldn
        co = off + 16
        last_cel: tuple[int, int] | None = None
        for _ in range(nchunks):
            csize, ctype = struct.unpack("<IH", d[co : co + 6])
            body = co + 6
            if ctype == 0x2004:
                name, _ = text(body + 16)
                layers.append(name)
            elif ctype == 0x2020:
                # User data, which Aseprite attaches to the chunk before it.
                flags = struct.unpack("<I", d[body : body + 4])[0]
                if flags & 1 and last_cel is not None:
                    labels[last_cel], _ = text(body + 4)
            elif ctype == 0x2005:
                li, x, y, opacity, celtype = struct.unpack("<HhhBH", d[body : body + 9])
                last_cel = (fi, li)
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

    return frames, layers, cels, linked, labels


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


def _probe(layers: list[str]) -> dict[str, int]:
    """Layer name -> index, failing loudly if the art no longer matches."""
    idx = {name: i for i, name in enumerate(layers)}
    expected = [LAYER_BASE, LAYER_SCREEN, LAYER_BADGE] + [n for n, _ in COUNT_LAYERS]
    missing = [n for n in expected if n not in idx]
    if missing:
        raise SystemExit(
            f"{SRC}: missing layer(s) {missing}.\n"
            f"  found: {layers}\n"
            "  The art was restructured; this script and src/ui/NetworkPanel.ts "
            "both need updating together."
        )
    return idx


def _labelled(labels, li: int) -> dict[str, int]:
    """`{label: frame}` for one layer, last write winning on a repeat."""
    return {lab: fi for (fi, layer), lab in labels.items() if layer == li}


def _count_frames(labels, li: int, layer_name: str) -> tuple[list[int], int]:
    """The count run `0..N` and the overflow frame, read off the cel labels.

    The artist numbers each count cel (`'0'`, `'1'`, ...) and marks the
    everything-lit one with a `>` prefix. Reading those rather than hardcoding
    frame indices is what lets counts be added to the art without touching code
    — which has already happened twice.

    A gap in the run is fatal rather than tolerated: a missing `'9'` would
    otherwise quietly fall through to the overflow frame, and a count that
    silently reads as "too many" is worse than a build that stops.
    """
    found = _labelled(labels, li)
    numeric: dict[int, int] = {}
    overflow: int | None = None
    for lab, fi in found.items():
        stripped = lab.strip("'\"")
        if stripped.startswith(">"):
            # `>10` on two clusters and `>9` on the third — a label slip in the
            # source. The pixels are identical, so match the prefix, not the number.
            overflow = fi
        elif stripped.isdigit():
            numeric[int(stripped)] = fi

    if overflow is None:
        raise SystemExit(f"{SRC}: {layer_name} has no overflow cel (a label starting with '>')")
    if not numeric:
        raise SystemExit(f"{SRC}: {layer_name} has no numbered count cels")

    highest = max(numeric)
    gaps = [n for n in range(highest + 1) if n not in numeric]
    if gaps:
        raise SystemExit(
            f"{SRC}: {layer_name} is missing count cel(s) {gaps} "
            f"(has 0..{highest} apart from those). Draw them, or the counts "
            "would silently read as overflow."
        )
    return [numeric[n] for n in range(highest + 1)], overflow


def _named_frames(labels, li: int, wanted: tuple[str, ...], layer_name: str) -> list[int]:
    """Frames for a fixed set of named states, in the order `wanted` lists them."""
    found = _labelled(labels, li)
    missing = [w for w in wanted if w not in found]
    if missing:
        raise SystemExit(
            f"{SRC}: {layer_name} has no cel(s) labelled {missing}.\n"
            f"  found: {sorted(found)}"
        )
    return [found[w] for w in wanted]


def build() -> None:
    frames, layers, cels, linked, labels = _read_aseprite(SRC)
    idx = _probe(layers)
    print(f"{os.path.relpath(SRC, ROOT)}: {frames} frames, layers {layers}")

    screen_frames = _named_frames(labels, idx[LAYER_SCREEN], SCREEN_LABELS, LAYER_SCREEN)
    badge_frames = _named_frames(labels, idx[LAYER_BADGE], BADGE_LABELS, LAYER_BADGE)

    # Every count cluster must agree on how far it counts, or the three corners
    # would disagree about what a given number looks like.
    runs = {}
    for name, _corner in COUNT_LAYERS:
        runs[name] = _count_frames(labels, idx[name], name)
    lengths = {name: len(run) for name, (run, _of) in runs.items()}
    if len(set(lengths.values())) != 1:
        raise SystemExit(f"{SRC}: count clusters disagree on length: {lengths}")
    count_len = next(iter(lengths.values()))

    manifest: dict[str, object] = {
        "note": "Generated by tools/panel/build_panel.py — do not edit by hand.",
        "indicatorSize": INDICATOR,
        "screen": {lab: i for i, lab in enumerate(SCREEN_LABELS)},
        "counts": {},
        "badge": {},
    }

    # --- chrome: base + screen, one frame per screen state -----------------
    chrome = Image.new("RGBA", (CANVAS * len(screen_frames), CANVAS), (0, 0, 0, 0))
    for slot, fi in enumerate(screen_frames):
        im = _composite(cels, linked, fi, [idx[LAYER_BASE], idx[LAYER_SCREEN]])
        chrome.paste(im, (slot * CANVAS, 0))
    chrome.save(OUT_CHROME)

    # --- indicators: one row per cluster, then the badge -------------------
    rows = len(COUNT_LAYERS) + 1
    sheet = Image.new("RGBA", (INDICATOR * SHEET_COLS, INDICATOR * rows), (0, 0, 0, 0))
    placed = 0

    def place(row: int, col: int, fi: int, li: int, corner: str) -> None:
        nonlocal placed
        ox, oy = CORNER_ORIGIN[corner]
        im = _composite(cels, linked, fi, [li])
        sheet.paste(im.crop((ox, oy, ox + INDICATOR, oy + INDICATOR)),
                    (col * INDICATOR, row * INDICATOR))
        placed += 1

    for row, (name, corner) in enumerate(COUNT_LAYERS):
        run, overflow = runs[name]
        blink = _named_frames(labels, idx[name], (BLINK_LABEL,), name)[0]
        base = row * SHEET_COLS
        for col, fi in enumerate(run):
            place(row, col, fi, idx[name], corner)
        place(row, len(run), overflow, idx[name], corner)
        place(row, len(run) + 1, blink, idx[name], corner)
        manifest["counts"][name] = {
            "base": base,
            "max": count_len - 1,
            "overflow": base + len(run),
            "blink": base + len(run) + 1,
        }

    badge_row = len(COUNT_LAYERS)
    for col, fi in enumerate(badge_frames):
        place(badge_row, col, fi, idx[LAYER_BADGE], BADGE_CORNER)
    manifest["badge"] = {
        lab: badge_row * SHEET_COLS + i for i, lab in enumerate(BADGE_LABELS)
    }
    manifest["frameCount"] = rows * SHEET_COLS

    sheet.save(OUT_INDICATORS)
    _write_manifest(manifest)
    _verify(chrome, sheet, placed, manifest, runs)


def _write_manifest(manifest: dict) -> None:
    """The frame map, for `src/ui/NetworkPanel.ts` to address the sheet by.

    Emitted here rather than hand-copied into the TypeScript for the same reason
    `build_symbols.py` emits `coverage.json`: the generator already knows the
    answer, and two hand-maintained copies of one layout drift.
    """
    with open(OUT_MANIFEST, "w") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(f"  {os.path.relpath(OUT_MANIFEST, ROOT)}: {manifest['frameCount']} frame slots")


def _verify(chrome: Image.Image, sheet: Image.Image, placed: int,
            manifest: dict, runs: dict) -> None:
    """Prove the output rather than trust it: palette, coverage, distinctness."""
    bad: list[str] = []

    for name, im in ((OUT_CHROME, chrome), (OUT_INDICATORS, sheet)):
        cols = Counter()
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if a:
                    cols[(r, g, b)] += 1
        off = sorted({f"#{r:02x}{g:02x}{b:02x}" for r, g, b in cols
                      if f"{r:02x}{g:02x}{b:02x}" not in EDG64})
        print(f"  {os.path.relpath(name, ROOT)}: {im.width}x{im.height}, {len(cols)} colours")
        if off:
            bad.append(f"{os.path.basename(name)}: off-palette {off[:6]}")

    # A mislinked cel would ship several identical "counts", which reads as a
    # stuck readout rather than an error. Distinctness is what catches it.
    px = sheet.load()
    def frame_at(row: int, col: int):
        return tuple(px[col * INDICATOR + x, row * INDICATOR + y]
                     for y in range(INDICATOR) for x in range(INDICATOR))

    # The blink-off frames are *expected* to duplicate the dark state — an
    # unlit cluster is an unlit cluster whether it reads zero or is mid-blink.
    # Asserting that rather than tolerating it turns a would-be false alarm into
    # a real check: if the artist ever gives blink its own look, this notices.
    for row, (name, _corner) in enumerate(COUNT_LAYERS):
        run, _of = runs[name]
        n = len(run) + 1  # counts + overflow; blink is checked separately
        seen = {frame_at(row, c) for c in range(n)}
        if len(seen) != n:
            bad.append(f"{name}: {n} frames but {len(seen)} distinct — cels may be mislinked")
        elif frame_at(row, n) != frame_at(row, 0):
            bad.append(f"{name}: blink frame differs from the zero frame")
        else:
            print(f"  {name:22} {len(run)} counts + overflow distinct, blink == zero")

    badge_row = len(COUNT_LAYERS)
    lit = len(BADGE_LABELS) - 1  # every state but BLINK
    seen = {frame_at(badge_row, c) for c in range(lit)}
    if len(seen) != lit:
        bad.append(f"badge: {lit} states but {len(seen)} distinct")
    elif frame_at(badge_row, lit) != frame_at(badge_row, BADGE_LABELS.index("DISCONNECTED")):
        bad.append("badge: BLINK differs from DISCONNECTED (both should be the dark lamp)")
    else:
        print(f"  {LAYER_BADGE:22} {lit} states distinct, BLINK == DISCONNECTED")

    print(f"\n  {placed} indicator frames placed")
    print("  " + ("\n  ".join(f"FAIL {b}" for b in bad) if bad
                  else "all colours ENDESGA-64, all frames distinct"))
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    build()
