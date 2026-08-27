#!/usr/bin/env python3
"""Build the radar's ring chrome from `radar_bezel.aseprite`.

`src/ui/UiTextures.ts` has carried a `ui-radar-bezel` entry pointing at
`assets/ui/radar/bezel.png` since before any art existed to fill it, and
`src/ui/Radar.ts` already probes for that texture and draws it over the
scope's masked contents. Both sides of that seam predate this source file —
this script is the missing third side: the PNG they are waiting for.

**Only the `bezel` layer is cut**, and the ring is asserted to be the same on
every frame before frame 0 is taken — see `_assert_static_ring`. The rest of
the source is a noise readout that this tool deliberately does not touch, and
what it *is* is worth writing down, because it is not shaped like a clip:

The `DIRECTION INDICATORS` group carries eight compass layers (`north`,
`northeast`, ...), each a full 96x96 canvas holding one 1-2px tick at its own
position around the ring — eight non-overlapping spots. **No frame ever shows
two directions in different states**: every frame paints all eight the same
colour, and the frames supply a loudness ramp rather than a bearing —
`#0cf1ff` idle ping, `#99e65f` quiet, `#ffeb57` medium, `#ff0040` loud, over
`#3d3d3d` dark between blinks. Timing carries meaning too: idle flashes 36ms
once per ~1.3s, an active source blinks 100ms on / 36ms off.

So the bearing lives in the *layers* and the loudness in the *frames*, which
makes this the network panel's problem, not the entity sprites' — eight
independent positions times five states do not fit in a set of flat frames.
Wiring it means cutting each direction layer separately, cropped to its own
tick, the way `tools/panel/build_panel.py` cuts its corner LED clusters; then
lighting whichever bearings the game wants at whichever loudness. Nothing in
`src/systems/Radar.ts` tracks a noise source today, so there is no state to
drive that with, and it is left for whoever adds that mechanic.

Two traps for that person. `JAMMED` spans frames 2-7 and so **overlaps** all
three of `LOUD_SOURCE`, `MEDIUM_SOURCE` and `QUIET_SOURCE` — the same shape as
`lattice-uplink`'s `SEARCHING`, which has to be read through `clipFrames`
rather than by frame position. And the cel labels slip: on the dark frames
five layers read `BLINK` while three read `LOUD`, though all eight pixels are
an identical `#3d3d3d`. That is the same class of error as the `>10`/`>9` slip
`build_panel.py` documents, and here the pixels are the contract, not the
labels.

The hidden `well` layer is an opaque interior fill, the backdrop the artist
drew the ring against. It stays dropped: compositing it would floor the scope
and hide the blips the ring is supposed to frame.

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


def _assert_static_ring(doc, bezel_layer: int) -> None:
    """Fail if the ring is not identical on every frame.

    Taking a single frame is only correct while the ring itself does not
    animate — all eight frames of movement in this source belong to the
    direction ticks, on their own layers. If an artist ever animates the
    `bezel` layer, a one-frame PNG would silently ship the first frame and
    throw the rest away, which is exactly the kind of quiet loss the other
    cutters' `expect_size` and `_probe` assertions exist to prevent.

    The fix, should this ever fire, is a strip plus a manifest — not a
    different frame index.
    """
    reference = doc.composite(BEZEL_FRAME, [bezel_layer]).tobytes()
    moving = [
        f for f in range(doc.frame_count)
        if doc.composite(f, [bezel_layer]).tobytes() != reference
    ]
    if moving:
        raise SystemExit(
            f"{SRC}: the 'bezel' layer differs on frame(s) {moving} from frame "
            f"{BEZEL_FRAME}.\n"
            "  The ring is animated now, so one frame no longer describes it. "
            "This tool emits a single PNG and `ui-radar-bezel` loads it as a "
            "single image — both need to become a strip, alongside "
            "src/ui/UiTextures.ts and src/ui/Radar.ts."
        )


def build(strict: bool = False) -> None:
    doc = read(SRC, expect_size=(BEZEL_SIZE, BEZEL_SIZE))
    bezel_layer = doc.layer_index("bezel")
    _assert_static_ring(doc, bezel_layer)

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
