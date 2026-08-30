#!/usr/bin/env python3
"""Build the directive tracker's backing plate from `ui-objective-panel.aseprite`.

Unlike `ui-panel.aseprite`, this source has no runtime-composited indicator
layer — every state is a flat picture, three layers (`frame`, `well`,
`mission_urgency`) collapsed into one. So this script is the simple half of
what `build_panel.py` does: find each named frame, flatten it, place it in a
strip.

One file comes out:

  ui-objective-panel.png   192x48, four 48x48 frames — the plate's four
                            urgency states, in a fixed order regardless of
                            where the artist put them in the source.

  src/ui/objectivePanelFrames.json   emitted alongside, mapping each state
                            name to its frame index in the strip. Generated
                            rather than hand-copied for the same reason
                            `networkIndicatorFrames.json` is: the art is the
                            source of truth for its own layout, and a redraw
                            that reorders frames needs no code change.

**The cel labels are the contract**, same as `build_panel.py`: every state
frame is annotated on the `mission_urgency` layer with its own name
(`NOMINAL`, `SEARCHING`, `ALERT`, `COMPLETE`). A stray `N/A` frame in the
source (an unused template cel) is simply not one of those names and is never
addressed — frames may be added, removed or reordered around it freely.

Run by hand; the output is committed. Same arrangement as `tools/font/` and
`tools/panel/build_panel.py`.

    pip install Pillow
    python3 tools/panel/build_objective_panel.py
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

PANEL_DIR = os.path.join(ROOT, "public", "assets", "ui", "panel")
SRC = os.path.join(PANEL_DIR, "ui-objective-panel.aseprite")
OUT_SHEET = os.path.join(PANEL_DIR, "ui-objective-panel.png")
OUT_MANIFEST = os.path.join(ROOT, "src", "ui", "objectivePanelFrames.json")

CANVAS = 48

#: The four urgency states, in the order the built strip lays them out.
#: `ObjectivePanel.ts` addresses the strip by the generated JSON, not by this
#: order directly, so this list only has to match what the art actually draws.
LABELS = ("NOMINAL", "SEARCHING", "ALERT", "COMPLETE")


def build() -> None:
    doc = read(SRC, expect_size=(CANVAS, CANVAS))
    print(f"{os.path.relpath(SRC, ROOT)}: {doc.frame_count} frames, layers {doc.layer_names}")

    # Every layer is flattened together — there is no runtime split to
    # preserve here, unlike the network panel's base/screen/indicator layers.
    layers = doc.visible_layers()

    # The label can live on any layer the artist happened to annotate; search
    # all of them rather than assuming which one carries the state names.
    found: dict[str, int] = {}
    for li in layers:
        for frame, label in doc.labels_for(li).items():
            if label in LABELS:
                found[label] = frame

    missing = [lab for lab in LABELS if lab not in found]
    if missing:
        raise SystemExit(
            f"{SRC}: no cel labelled {missing}.\n"
            f"  found labels: {sorted({l for li in layers for l in doc.labels_for(li).values()})}"
        )

    sheet = Image.new("RGBA", (CANVAS * len(LABELS), CANVAS), (0, 0, 0, 0))
    for slot, label in enumerate(LABELS):
        im = doc.composite(found[label], layers)
        sheet.paste(im, (slot * CANVAS, 0))
    sheet.save(OUT_SHEET)

    manifest = {lab: i for i, lab in enumerate(LABELS)}
    with open(OUT_MANIFEST, "w") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")

    _verify(sheet)
    print(f"  {os.path.relpath(OUT_SHEET, ROOT)}: {sheet.width}x{sheet.height}, {len(LABELS)} frames")
    print(f"  {os.path.relpath(OUT_MANIFEST, ROOT)}: {manifest}")


def _verify(sheet: Image.Image) -> None:
    """Prove the output rather than trust it: on-palette, and no two states drawn alike."""
    bad: list[str] = []

    off = off_palette(sheet)
    if off:
        bad.append(f"off-palette colours: {off[:6]}")

    def frame_at(slot: int):
        px = sheet.load()
        return tuple(
            px[slot * CANVAS + x, y] for y in range(CANVAS) for x in range(CANVAS)
        )

    seen = {frame_at(slot) for slot in range(len(LABELS))}
    if len(seen) != len(LABELS):
        bad.append(f"{len(LABELS)} states but only {len(seen)} distinct pictures")

    if bad:
        print("  " + "\n  ".join(f"FAIL {b}" for b in bad))
        raise SystemExit(1)
    print("  all colours ENDESGA-64, all four states distinct")


if __name__ == "__main__":
    build()
