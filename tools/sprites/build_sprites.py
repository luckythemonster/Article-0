#!/usr/bin/env python3
"""Build the world entities' sprite sheets from the `.aseprite` sources.

The `.aseprite` files under `public/assets/sprites/` are the shipped source;
the PNGs beside them are build output, the same arrangement `tools/panel/build_panel.py`
uses for the HUD panel. Nothing is hand-exported, so the frame geometry cannot
be misread off a re-export.

Two files come out:

  public/assets/sprites/<id>.png   A horizontal strip, one frame per column,
                                   packed edge-to-edge with no margin or
                                   spacing. Every visible layer is composited
                                   down; hidden layers are dropped (see below).

  src/entities/entitySpriteFrames.json
                                   Every tag range and every cel label the
                                   artist wrote, for `src/entities/EntitySprites.ts`
                                   to address the strips by. The art->code
                                   contract, generated rather than written
                                   down twice.

**Read the annotations, never the frame positions.** That is the rule the panel
established and it applies here unchanged: an artist may reorder or insert
frames freely, and re-running this tool is the whole migration. What must not
change is what a name *means*.

They annotate in two different ways and both are the contract:

- **Tags** are ranges — `POWER_ON` is frames 0-11 of `Breaker.aseprite`, a clip
  to play.
- **Cel labels** are per-layer, per-frame notes — `terminal_substation`'s
  status ring is labelled `GOOD`/`WARNING`/`ERROR` frame by frame. They say what
  a single frame *is* rather than what to play.

**Tag names repeat, so tags are emitted as a list.** `Breaker.aseprite` has two
`IDLE`s (frames 0 and 23, the cabinet shut before and after a cycle) and
`security_camera.aseprite` has four `active`/`disabled` pairs, one per facing.
A name->range dict would silently keep whichever came last.

**Hidden layers are dropped.** An artist may keep a traced-over reference layer
with the eye off; compositing it would bake the reference into the shipped
sheet, so hidden layers are read but never drawn.

Run by hand; the output is committed. Same arrangement as `tools/panel/` and
`tools/font/`.

    pip install Pillow
    python3 tools/sprites/build_sprites.py [--strict]

`--strict` turns an off-ENDESGA-64 colour into a build failure rather than a
warning. The panel's own tool always fails on one, because that art was authored
against the assertion; this art was drawn before it existed, so the default
here is to report and continue.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))

from aseprite.reader import off_palette, read  # noqa: E402

SPRITE_DIR = os.path.join(ROOT, "public", "assets", "sprites")
OUT_MANIFEST = os.path.join(ROOT, "src", "entities", "entitySpriteFrames.json")


@dataclass(frozen=True)
class Spec:
    """One sprite: its source file, its id, and the canvas it must be drawn on.

    The canvas is asserted rather than read so that a resize in Aseprite fails
    here instead of silently shipping a strip whose frames no longer line up
    with `sourceWidth`/`sourceHeight` in `src/entities/EntitySprites.ts`. The
    two have to agree — that pairing is what `src/render/pixelScale.ts` checks.

    Width and height are separate because a canvas need not be square: an
    east-west door is 32x48, drawn over the 1x1.5 tile opening it has to
    bridge. Everything else here happens to be square, and says so by
    repeating the number.
    """

    id: str
    source: str
    width: int
    height: int


#: Every sprite that ships. `id` is the texture key stem and the PNG's basename;
#: it is deliberately kebab-case and independent of the source filename, which
#: is whatever the artist happened to save.
SPRITES: tuple[Spec, ...] = (
    Spec(id="terminal", source="terminal.aseprite", width=16, height=16),
    Spec(id="terminal-substation", source="terminal_substation.aseprite", width=32, height=32),
    Spec(id="security-camera", source="security_camera.aseprite", width=16, height=16),
    Spec(id="breaker", source="Breaker.aseprite", width=16, height=16),
    # Listed before the art exists — see docs/SPRITE_BACKLOG.md. The tool skips a
    # Spec whose source is absent, so this costs nothing until somebody draws it.
    # 8x8 over a quarter tile: the house density is one art pixel per world pixel,
    # and a tile is 32 world pixels. Must match EntitySprites.ts, per the docstring.
    Spec(id="light-switch", source="light_switch.aseprite", width=8, height=8),
    # The east-west doors are the one non-square canvas: 48px of art over the
    # 1.5-tile opening they bridge, rather than a 32px square stretched to fill it.
    Spec(id="door-single-east-west", source="door_single_east-west.aseprite", width=32, height=48),
    Spec(
        id="door-single-north-south",
        source="door_single_north-south.aseprite",
        width=32,
        height=32,
    ),
    Spec(
        id="door-glass-east-west",
        source="door_glass_single_east-west.aseprite",
        width=32,
        height=48,
    ),
    Spec(
        id="door-glass-north-south",
        source="door_glass_single_north-south.aseprite",
        width=32,
        height=32,
    ),
    # The 2026-08-21 bundle. Four families, and the sizes are not uniform because
    # the objects are not: a trip laser is a beam across a doorway and is drawn to
    # the doorway's shape, the bulkhead spans 2x3 tiles, and the uplink dish is a
    # 160px set piece. See `src/entities/EntitySprites.ts` for the display
    # footprints each of these is checked against.
    Spec(id="laser-beam", source="laser.aseprite", width=32, height=32),
    Spec(id="laser-emitter", source="laser_emitter.aseprite", width=32, height=32),
    Spec(id="trip-laser-east-west", source="trip_laser_east-west.aseprite", width=32, height=40),
    Spec(
        id="trip-laser-north-south",
        source="TRIP_LASER_NORTH-SOUTH.aseprite",
        width=32,
        height=32,
    ),
    Spec(id="locker", source="locker.aseprite", width=32, height=32),
    Spec(id="footlocker", source="footlocker.aseprite", width=32, height=32),
    Spec(id="crate", source="box.aseprite", width=32, height=32),
    Spec(id="crate-stack", source="box1.aseprite", width=32, height=32),
    Spec(id="bunk-bed", source="bunk_bed.aseprite", width=32, height=32),
    Spec(id="bulkhead", source="big bulkhead.aseprite", width=64, height=96),
    Spec(id="lattice-uplink", source="lattice_uplink.aseprite", width=160, height=160),
)


def build(strict: bool = False) -> None:
    manifest: dict[str, object] = {
        "note": "Generated by tools/sprites/build_sprites.py — do not edit by hand.",
        "sprites": {},
    }
    problems: list[str] = []

    for spec in SPRITES:
        src = os.path.join(SPRITE_DIR, spec.source)
        # A Spec may be declared before anyone has drawn it — see
        # docs/SPRITE_BACKLOG.md, where an entry names the exact filename and size
        # so the art is wired the day it lands. Until then there is nothing to cut,
        # and refusing to build the *other* sprites over it would be absurd.
        if not os.path.exists(src):
            print(f"{os.path.relpath(src, ROOT)}: not drawn yet, skipped")
            continue
        doc = read(src, expect_size=(spec.width, spec.height))
        layers = doc.visible_layers()
        hidden = [layer.name for layer in doc.layers if not layer.visible]

        print(f"{os.path.relpath(src, ROOT)}: {doc.frame_count} frames, "
              f"{spec.width}x{spec.height}")
        print(f"  layers   {[doc.layers[i].name for i in layers]}"
              + (f"  (hidden, dropped: {hidden})" if hidden else ""))

        # --- the strip -----------------------------------------------------
        strip = Image.new(
            "RGBA", (spec.width * doc.frame_count, spec.height), (0, 0, 0, 0)
        )
        for frame in range(doc.frame_count):
            strip.paste(doc.composite(frame, layers), (frame * spec.width, 0))
        out_png = os.path.join(SPRITE_DIR, f"{spec.id}.png")
        strip.save(out_png)

        off = off_palette(strip)
        note = f"off-palette {off[:6]}" if off else "all colours ENDESGA-64"
        print(f"  {os.path.relpath(out_png, ROOT)}: "
              f"{strip.width}x{strip.height}, {note}")
        if off:
            problems.append(f"{spec.id}: {len(off)} off-palette colour(s) {off[:6]}")

        # --- the annotations ------------------------------------------------
        tags = [
            {"name": tag.name, "from": tag.from_frame, "to": tag.to_frame}
            for tag in doc.tags
        ]
        cels = {}
        for li in layers:
            labelled = doc.labels_for(li)
            if labelled:
                cels[doc.layers[li].name] = {str(f): labelled[f] for f in sorted(labelled)}

        if tags:
            print("  tags     " + ", ".join(
                f"{t['name']} {t['from']}" + (f"-{t['to']}" if t["to"] != t["from"] else "")
                for t in tags))
        if cels:
            for layer_name, labelled in cels.items():
                distinct = sorted(set(labelled.values()))
                print(f"  cels     {layer_name}: {distinct}")
        if not tags and not cels:
            problems.append(
                f"{spec.id}: no tags and no cel labels — nothing for code to address"
            )

        manifest["sprites"][spec.id] = {
            "width": spec.width,
            "height": spec.height,
            "frameCount": doc.frame_count,
            "durations": doc.durations,
            "tags": tags,
            "cels": cels,
        }
        print()

    _write_manifest(manifest)

    if problems:
        print("\n  " + "\n  ".join(f"{'FAIL' if strict else 'warn'} {p}" for p in problems))
        if strict:
            raise SystemExit(1)
    else:
        print("\n  all sheets on palette, every sprite addressable")


def _write_manifest(manifest: dict) -> None:
    with open(OUT_MANIFEST, "w") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")
    n = len(manifest["sprites"])
    print(f"  {os.path.relpath(OUT_MANIFEST, ROOT)}: {n} sprites")


if __name__ == "__main__":
    build(strict="--strict" in sys.argv[1:])
