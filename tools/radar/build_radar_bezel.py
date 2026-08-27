#!/usr/bin/env python3
"""Build the radar's ring chrome from `radar_bezel.aseprite`.

`src/ui/UiTextures.ts` has carried a `ui-radar-bezel` entry pointing at
`assets/ui/radar/bezel.png` since before any art existed to fill it, and
`src/ui/Radar.ts` already probes for that texture and draws it over the
scope's masked contents. Both sides of that seam predate this source file —
this script is the missing third side: the PNG they are waiting for.

**Only the `bezel` layer is cut.** The source also carries a `DIRECTION
INDICATORS` group with eight compass layers (`north`, `northeast`, ...), each
tagged across `SCANNING`/`LOUD_SOURCE`/`MEDIUM_SOURCE`/`QUIET_SOURCE`/`JAMMED`
frames with per-direction `PING`/`BLINK`/`LOUD`/`MEDIUM`/`QUIET` cels — a
readout of which way a noise source is and how loud it is. Nothing in
`src/systems/Radar.ts` tracks noise sources today, so there is no state to
drive those layers with; wiring them is a game-system change, not an art
drop-in, and is left for whoever adds that mechanic. Only the static ring is
cut here, and its interior stays transparent so the scope's masked terrain and
blips still show through underneath it.

Run by hand; the output is committed. Same arrangement as `tools/icons/`,
`tools/panel/` and `tools/sprites/`.

    pip install Pillow
    python3 tools/radar/build_radar_bezel.py [--strict]
"""

from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))

from aseprite.reader import off_palette, read  # noqa: E402

RADAR_DIR = os.path.join(ROOT, "public", "assets", "ui", "radar")
SRC = os.path.join(RADAR_DIR, "radar_bezel.aseprite")
OUT_PNG = os.path.join(RADAR_DIR, "bezel.png")

#: Matches `size: 96` on the `ui-radar-bezel` entry in `src/ui/UiTextures.ts`.
BEZEL_SIZE = 96

#: The frame the static ring is cut from. Frame 0 is the ring at rest — every
#: direction layer reads `PING` there, i.e. no source pinging yet.
BEZEL_FRAME = 0


def build(strict: bool = False) -> None:
    doc = read(SRC, expect_size=(BEZEL_SIZE, BEZEL_SIZE))
    bezel_layer = doc.layer_index("bezel")

    print(f"{os.path.relpath(SRC, ROOT)}: {doc.frame_count} frames, "
          f"{BEZEL_SIZE}x{BEZEL_SIZE}")
    print(f"  layers   {doc.layer_names}")
    if doc.tags:
        print("  tags     " + ", ".join(
            f"{t.name} {t.from_frame}" + (f"-{t.to_frame}" if t.to_frame != t.from_frame else "")
            for t in doc.tags))

    image = doc.composite(BEZEL_FRAME, [bezel_layer])
    image.save(OUT_PNG)

    off = off_palette(image)
    note = f"off-palette {off[:6]}" if off else "all colours ENDESGA-64"
    print(f"  {os.path.relpath(OUT_PNG, ROOT)}: frame {BEZEL_FRAME}, "
          f"layer 'bezel' only, {image.width}x{image.height}, {note}")

    direction_layers = [
        name for name in doc.layer_names
        if name not in ("bezel", "DIRECTION INDICATORS", "well")
    ]
    print(f"  note     {len(direction_layers)} direction layer(s) drawn but not wired: "
          f"{direction_layers}")

    if off and strict:
        raise SystemExit(f"{OUT_PNG}: off-palette colour(s) {off[:6]}")


if __name__ == "__main__":
    build(strict="--strict" in sys.argv[1:])
