#!/usr/bin/env python3
"""Build the radar's ring chrome and its noise-direction ticks from `radar_bezel.aseprite`.

`src/ui/UiTextures.ts` has carried a `ui-radar-bezel` entry pointing at
`assets/ui/radar/bezel.png` since before any art existed to fill it, and
`src/ui/Radar.ts` already probes for that texture and draws it over the
scope's masked contents. Both sides of that seam predate this source file —
this script is the missing third side.

Two things come out, because the source holds two different kinds of art:

  bezel.png              The static ring, cut from the `bezel` layer alone and
                         asserted to be the same on every frame first (see
                         `_assert_static_ring`). Loaded as a single image.

  radar-directions.png   The eight compass ticks, 8x8 each, one row per
                         bearing. Loaded as a spritesheet under its own key —
                         deliberately *not* by making the ring a strip, which
                         would break the assertion above and force
                         `Radar.drawBezel` to change.

  src/ui/radarDirectionFrames.json
                         Which frame is which. Generated rather than written
                         down twice, the same contract `build_panel.py` emits.

**The ticks are not a clip, and that shapes everything below.** Each of the
eight compass layers is a full 96x96 canvas carrying one 1-2px tick at its own
spot around the ring, and *no frame ever shows two directions in different
states* — every frame paints all eight the same colour. The bearing lives in the
**layers** and the loudness in the **frames**, so eight positions times five
states cannot be a set of flat frames. That is the network panel's problem
exactly, and this cuts it the same way: one layer at a time, cropped to a fixed
region, laid out one logical group per row with a fixed stride so `base + state`
addresses a frame.

**States are resolved by tag, never by frame position or cel label.** Two traps
in this source. `JAMMED` spans frames 2-7 and so overlaps all three of
`LOUD_SOURCE`, `MEDIUM_SOURCE` and `QUIET_SOURCE` — it is excluded from
`STATES` by omission rather than being reasoned around. And the cel labels slip:
on the dark frames five layers read `BLINK` while three read `LOUD`, though all
eight pixels are an identical `#3d3d3d`. Here the pixels are the contract, not
the labels — the opposite of `build_panel.py`, which is why this reads tags.

The hidden `well` layer is an opaque interior fill, the backdrop the artist
drew the ring against. It stays dropped: compositing it would floor the scope
and hide the blips the ring is supposed to frame.

Run by hand; the output is committed. Same arrangement as `tools/icons/`,
`tools/panel/` and `tools/sprites/`.

    pip install Pillow
    python3 tools/radar/build_radar_bezel.py [--strict]
"""

from __future__ import annotations

import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))

from aseprite.reader import off_palette, read  # noqa: E402

RADAR_DIR = os.path.join(ROOT, "public", "assets", "ui", "radar")
SRC = os.path.join(RADAR_DIR, "radar_bezel.aseprite")
OUT_PNG = os.path.join(RADAR_DIR, "bezel.png")
OUT_TICKS = os.path.join(RADAR_DIR, "radar-directions.png")
OUT_MANIFEST = os.path.join(ROOT, "src", "ui", "radarDirectionFrames.json")

#: Matches `size: 96` on the `ui-radar-bezel` entry in `src/ui/UiTextures.ts`.
BEZEL_SIZE = 96

#: The frame the static ring is cut from. Frame 0 is the ring at rest — every
#: direction layer reads `PING` there, i.e. no source pinging yet.
BEZEL_FRAME = 0

#: The box each tick is cropped to. Every tick is 1-2px, so this is mostly
#: margin — but a *uniform* box is what lets one spritesheet hold all eight, and
#: the origins below are computed per layer rather than assumed.
TICK = 8

#: Row stride. Wider than the five drawn states, exactly as `build_panel.py`
#: leaves slack in its 16-wide rows: the stride is what makes `base + state`
#: arithmetic, and the undrawn slots are simply never addressed.
SHEET_COLS = 8

#: The eight compass layers, **in world-angle order starting due east and going
#: clockwise on screen** (+y is south, so clockwise in screen space). Row `i` is
#: therefore sector `i` in `src/systems/Radar.ts`, and the TS side can bucket a
#: bearing straight into a row without a lookup table.
DIRECTIONS: tuple[str, ...] = (
    "east", "southeast", "south", "southwest",
    "west", "northwest", "north", "northeast",
)

#: Lit states, and the tag each is read from. `JAMMED` is deliberately absent —
#: it spans 2-7 and overlaps all three source tags, so including it would make
#: "which frame is LOUD" ambiguous. The dark state is handled separately.
STATES: tuple[tuple[str, str], ...] = (
    ("ping", "SCANNING"),
    ("loud", "LOUD_SOURCE"),
    ("medium", "MEDIUM_SOURCE"),
    ("quiet", "QUIET_SOURCE"),
)

#: The unlit tick. Read as `SCANNING`'s second frame rather than given a tag of
#: its own, because the artist never tagged it — every tag's second frame is the
#: same dark pixel, which `_verify` asserts rather than assumes.
DARK_STATE = "dark"

#: Layers that are not compass ticks. `DIRECTION INDICATORS` is the group header
#: (no pixels of its own) and `well` is the hidden backdrop.
NON_TICK_LAYERS = ("bezel", "DIRECTION INDICATORS", "well")


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


def _tag_frames(doc) -> dict[str, int]:
    """`{state: lit frame}`, read off the tags named in {@link STATES}.

    A tag's `from_frame` is its lit frame; the frame after it is the blink's
    dark half. Missing tags are fatal rather than skipped — a state with no tag
    would otherwise silently fall back to whatever frame happened to be there.
    """
    by_name = {tag.name: tag for tag in doc.tags}
    missing = [tag for _state, tag in STATES if tag not in by_name]
    if missing:
        raise SystemExit(
            f"{SRC}: no tag(s) named {missing}.\n"
            f"  found: {sorted(by_name)}\n"
            "  The art was retagged; this script and src/ui/radarDirections.ts "
            "both need updating together."
        )
    frames = {state: by_name[tag].from_frame for state, tag in STATES}
    frames[DARK_STATE] = by_name["SCANNING"].to_frame
    return frames


def _tick_origin(doc, layer: int, frames: dict[str, int], name: str) -> tuple[int, int]:
    """Where to crop this direction's `TICK`-square box, from the ink itself.

    Computed rather than tabulated: the artist may nudge a tick and re-running
    the tool is then the whole migration. The box is centred on the ink and
    clamped into the canvas, which matters because several ticks sit 1px from
    the edge and an uncentred box would fall outside it.

    The ink must not move between states, or one origin could not serve all
    five — so that is asserted here rather than trusted.
    """
    boxes = {}
    for state, frame in frames.items():
        box = doc.composite(frame, [layer]).getbbox()
        if box is None:
            raise SystemExit(f"{SRC}: layer {name!r} draws nothing on frame {frame} ({state})")
        boxes[state] = box

    distinct = set(boxes.values())
    if len(distinct) != 1:
        raise SystemExit(
            f"{SRC}: layer {name!r} draws its tick in different places per state: {boxes}.\n"
            "  One crop box has to serve every state, so the tick must not move."
        )

    left, upper, right, lower = distinct.pop()
    cx = (left + right) // 2
    cy = (upper + lower) // 2
    ox = max(0, min(BEZEL_SIZE - TICK, cx - TICK // 2))
    oy = max(0, min(BEZEL_SIZE - TICK, cy - TICK // 2))
    return ox, oy


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

    problems: list[str] = []

    # --- the ring ----------------------------------------------------------
    ring = doc.composite(BEZEL_FRAME, [bezel_layer])
    ring.save(OUT_PNG)
    off = off_palette(ring)
    print(f"  {os.path.relpath(OUT_PNG, ROOT)}: frame {BEZEL_FRAME}, "
          f"layer 'bezel' only, {ring.width}x{ring.height}, "
          + (f"off-palette {off[:6]}" if off else "all colours ENDESGA-64"))
    if off:
        problems.append(f"bezel.png: off-palette {off[:6]}")

    # --- the ticks ---------------------------------------------------------
    drawn = [n for n in doc.layer_names if n not in NON_TICK_LAYERS]
    unexpected = sorted(set(drawn) ^ set(DIRECTIONS))
    if unexpected:
        raise SystemExit(
            f"{SRC}: compass layers are {sorted(drawn)}, expected {sorted(DIRECTIONS)}.\n"
            f"  differing: {unexpected}\n"
            "  The art was restructured; DIRECTIONS and src/systems/Radar.ts's "
            "sector order need updating together."
        )

    frames = _tag_frames(doc)
    state_order = [state for state, _tag in STATES] + [DARK_STATE]
    print("  states   " + ", ".join(f"{s}={frames[s]}" for s in state_order))

    sheet = Image.new("RGBA", (TICK * SHEET_COLS, TICK * len(DIRECTIONS)), (0, 0, 0, 0))
    manifest_dirs: dict[str, object] = {}
    origins: dict[tuple[int, int], str] = {}
    cells: dict[tuple[str, str], bytes] = {}

    for row, name in enumerate(DIRECTIONS):
        layer = doc.layer_index(name)
        ox, oy = _tick_origin(doc, layer, frames, name)
        if (ox, oy) in origins:
            problems.append(f"{name}: same crop origin as {origins[(ox, oy)]} — ticks overlap")
        origins[(ox, oy)] = name

        for col, state in enumerate(state_order):
            tick = doc.composite(frames[state], [layer]).crop((ox, oy, ox + TICK, oy + TICK))
            sheet.paste(tick, (col * TICK, row * TICK))
            cells[(name, state)] = tick.tobytes()

        manifest_dirs[name] = {"base": row * SHEET_COLS, "x": ox, "y": oy}
        print(f"  {name:<10} row {row}  base {row * SHEET_COLS:>2}  crop ({ox:>2},{oy:>2})")

    sheet.save(OUT_TICKS)
    off = off_palette(sheet)
    print(f"  {os.path.relpath(OUT_TICKS, ROOT)}: {sheet.width}x{sheet.height}, "
          f"{len(DIRECTIONS)}x{len(state_order)} drawn of "
          f"{len(DIRECTIONS)}x{SHEET_COLS} grid, "
          + (f"off-palette {off[:6]}" if off else "all colours ENDESGA-64"))
    if off:
        problems.append(f"radar-directions.png: off-palette {off[:6]}")

    manifest = {
        "note": "Generated by tools/radar/build_radar_bezel.py — do not edit by hand.",
        "tickSize": TICK,
        "frameCount": len(DIRECTIONS) * SHEET_COLS,
        "states": {state: i for i, state in enumerate(state_order)},
        "directions": manifest_dirs,
    }
    with open(OUT_MANIFEST, "w") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(f"  {os.path.relpath(OUT_MANIFEST, ROOT)}: "
          f"{len(DIRECTIONS)} directions x {len(state_order)} states")

    _verify(doc, frames, cells, problems)

    if problems:
        print("\n  " + "\n  ".join(f"{'FAIL' if strict else 'warn'} {p}" for p in problems))
        if strict:
            raise SystemExit(1)
    else:
        print("\n  all colours ENDESGA-64, every state distinct, ticks all placed")


def _verify(doc, frames: dict[str, int], cells: dict[tuple[str, str], bytes],
            problems: list[str]) -> None:
    """Prove the cut rather than trust it.

    Two failure modes worth catching. A mislinked cel would ship several
    identical "states", which reads as a stuck readout rather than as an error —
    so the four lit states must be four distinct pixel runs. And the four dark
    frames are *expected* to be identical; asserting that rather than tolerating
    it means a future redraw that gives blink its own look trips this instead of
    silently shipping.
    """
    lit = [state for state, _tag in STATES]
    for name in DIRECTIONS:
        seen = {cells[(name, state)] for state in lit}
        if len(seen) != len(lit):
            problems.append(
                f"{name}: {len(lit)} lit states but {len(seen)} distinct — cels may be mislinked"
            )

    # Every tag's second frame should be the same dark tick as SCANNING's.
    dark = frames[DARK_STATE]
    layer = doc.layer_index(DIRECTIONS[0])
    reference = doc.composite(dark, [layer]).tobytes()
    for state, tag_name in STATES:
        if state == "ping":
            continue
        tag = next(t for t in doc.tags if t.name == tag_name)
        if doc.composite(tag.to_frame, [layer]).tobytes() != reference:
            problems.append(
                f"{tag_name}: its dark frame {tag.to_frame} differs from SCANNING's {dark}. "
                "The blink states have diverged and each needs its own frame."
            )


if __name__ == "__main__":
    build(strict="--strict" in sys.argv[1:])
