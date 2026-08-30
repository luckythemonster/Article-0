#!/usr/bin/env python3
"""Build a VFX pack's spritesheet from its `.aseprite` source.

Same arrangement as `tools/sprites/build_sprites.py` and `tools/panel/`: the
`.aseprite` is the source and the PNG beside it is build output, generated
rather than hand-exported so the frame geometry can't drift from what
`src/entities/Vfx.ts` expects.

Simpler than the entity sprites, because a one-shot effect has no state to
address by name — it's a flat sequence of frames played front to back once,
so there is nothing here to read as a tag or a cel label. The output is just
the strip; `frameCount`, `frameRate` and `displayTiles` in `Vfx.ts` are
hand-written to match what this prints, the same way the third-party packs'
numbers always were.

    pip install Pillow
    python3 tools/vfx/build_vfx.py [--strict]

`--strict` turns an off-ENDESGA-64 colour into a build failure. VFX packs
aren't held to the palette the way world/UI art is — most of what ships here
started as a third-party pack — so the default is to report and continue.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))

from aseprite.reader import off_palette, read  # noqa: E402

VFX_DIR = os.path.join(ROOT, "public", "assets", "vfx")


@dataclass(frozen=True)
class Spec:
    """One hand-drawn pack: its folder, its source file, and its frame size.

    `size` is asserted rather than read off the file, so a canvas resize in
    Aseprite fails the build instead of silently shipping a strip whose
    frames no longer match `frameSize` in `Vfx.ts`.
    """

    folder: str
    source: str
    size: int


#: Hand-drawn VFX packs. Third-party packs (impact, smoke-plume, the EMP
#: blast) have no `.aseprite` source and aren't built by this tool.
SPRITES: tuple[Spec, ...] = (
    Spec(folder="electricity", source="electricity.aseprite", size=128),
    Spec(folder="stun-round", source="stun_round.aseprite", size=8),
)


def build(strict: bool = False) -> None:
    problems: list[str] = []

    for spec in SPRITES:
        src = os.path.join(VFX_DIR, spec.folder, spec.source)
        doc = read(src, expect_size=(spec.size, spec.size))
        layers = doc.visible_layers()

        print(f"{os.path.relpath(src, ROOT)}: {doc.frame_count} frames, "
              f"{spec.size}x{spec.size}")

        strip = Image.new("RGBA", (spec.size * doc.frame_count, spec.size), (0, 0, 0, 0))
        for frame in range(doc.frame_count):
            strip.paste(doc.composite(frame, layers), (frame * spec.size, 0))
        out_png = os.path.join(VFX_DIR, spec.folder, "spritesheet.png")
        strip.save(out_png)

        off = off_palette(strip)
        note = f"off-palette {off[:6]}" if off else "all colours ENDESGA-64"
        print(f"  {os.path.relpath(out_png, ROOT)}: "
              f"{strip.width}x{strip.height}, {note}")
        if off and strict:
            problems.append(f"{spec.folder}: {len(off)} off-palette colour(s) {off[:6]}")
        print()

    if problems:
        print("\n  " + "\n  ".join(f"FAIL {p}" for p in problems))
        raise SystemExit(1)


if __name__ == "__main__":
    build(strict="--strict" in sys.argv[1:])
