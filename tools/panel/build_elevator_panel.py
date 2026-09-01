#!/usr/bin/env python3
"""Build the elevator car's control plate from its two `.aseprite` sources.

Two sources rather than one, because they are two different canvases: the plate
is nine-sliced and stretched to the shaft's height, the buttons are fixed-size
instruments laid onto it. Baking the buttons into the plate would smear them the
moment a floor was added — the same split, for the same reason, that
`build_panel.py` keeps between `ui-panel.png` and `network-indicators.png`.

Two files come out:

  ui-elevator-panel.png     480x48, ten 48x48 frames — the casing. Same
                            nine-slice terms as `ui-panel`: 12px inset, so
                            four 12x12 corners, four 12x24 edges and a 24x24
                            middle. Only the corners are safe for detail; the
                            edges stretch along their axis and the middle
                            stretches both ways. Frames "0".."8" are a digit
                            shown on the corner LEDs — `ElevatorScene` picks
                            one to track the picker's cursor row — and frame
                            "ALERT" is all four corners lit red, shown while
                            `AlertState` is in its `ALERT` phase. See
                            `PLATE_STATES` below and `src/ui/ElevatorPanel.ts`.

  elevator-buttons.png      96x24, four 24x24 frames — one call button per
                            state, laid out in STATES order below.

**The cel labels are the contract**, same as the other two panel tools: each
frame — casing digit/alert state, button state alike — is annotated on its
own cel with its name.

The two sources are drawn independently and `build()` cuts whichever one
exists — a finished button sheet isn't held back waiting on the casing, or
the reverse. Only when neither source exists does it refuse outright.

Unlike its siblings this emits **no JSON manifest**. Those exist because their
art is the source of truth for its own frame order; here the order is owned by
`src/ui/ElevatorPanel.ts`'s `BUTTON_STATES`, which is what addresses the strip,
and STATES below must match it. A generated file mirroring a hardcoded tuple —
which is all `build_objective_panel.py`'s manifest is — would add a third place
to keep in step rather than removing one.

Run by hand; the output is committed. Same arrangement as the other tools under
`tools/`.

    pip install Pillow
    python3 tools/panel/build_elevator_panel.py
"""

from __future__ import annotations

import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))

from aseprite.reader import off_palette, read  # noqa: E402

PANEL_DIR = os.path.join(ROOT, "public", "assets", "ui", "panel")

PLATE_SRC = os.path.join(PANEL_DIR, "ui-elevator-panel.aseprite")
PLATE_OUT = os.path.join(PANEL_DIR, "ui-elevator-panel.png")
PLATE_CANVAS = 48

BUTTON_SRC = os.path.join(PANEL_DIR, "elevator-buttons.aseprite")
BUTTON_OUT = os.path.join(PANEL_DIR, "elevator-buttons.png")
BUTTON_CANVAS = 24

#: Must match `BUTTON_STATES` in `src/ui/ElevatorPanel.ts` — that is what
#: addresses the built strip by index.
STATES = ("IDLE", "LIT", "SEALED", "PRESSED")

#: Must match `PANEL_DIGIT_COUNT`/`PANEL_ALERT_FRAME` in
#: `src/ui/ElevatorPanel.ts` — nine digits the corner LEDs can show, plus the
#: all-red alert frame. The source also carries a `BLINK` cel (the alert
#: flash's dark beat), left unaddressed on purpose: it is pixel-identical to
#: `"0"`, so `ElevatorScene` reuses frame 0 for it rather than the sheet
#: carrying a redundant frame — the same kind of gap `elevator-buttons.png`
#: already leaves for the unused `SEALED & PRESSED` cel.
PLATE_STATES = ("0", "1", "2", "3", "4", "5", "6", "7", "8", "ALERT")


def build_plate() -> None:
    doc = read(PLATE_SRC, expect_size=(PLATE_CANVAS, PLATE_CANVAS))
    print(f"{os.path.relpath(PLATE_SRC, ROOT)}: {doc.frame_count} frames, layers {doc.layer_names}")

    layers = doc.visible_layers()

    # The label can live on any layer the artist happened to annotate; search
    # all of them rather than assuming which one carries the state names.
    found: dict[str, int] = {}
    for li in layers:
        for frame, label in doc.labels_for(li).items():
            if label in PLATE_STATES:
                found[label] = frame

    missing = [s for s in PLATE_STATES if s not in found]
    if missing:
        raise SystemExit(
            f"{PLATE_SRC}: no cel labelled {missing}.\n"
            f"  found labels: {sorted({l for li in layers for l in doc.labels_for(li).values()})}"
        )

    sheet = Image.new("RGBA", (PLATE_CANVAS * len(PLATE_STATES), PLATE_CANVAS), (0, 0, 0, 0))
    for slot, state in enumerate(PLATE_STATES):
        sheet.paste(doc.composite(found[state], layers), (slot * PLATE_CANVAS, 0))
    sheet.save(PLATE_OUT)

    _verify_palette(sheet, PLATE_OUT)
    _verify_distinct(sheet, PLATE_CANVAS, PLATE_STATES, "casing frames")
    print(f"  {os.path.relpath(PLATE_OUT, ROOT)}: {sheet.width}x{sheet.height}, {len(PLATE_STATES)} frames")


def build_buttons() -> None:
    doc = read(BUTTON_SRC, expect_size=(BUTTON_CANVAS, BUTTON_CANVAS))
    print(f"{os.path.relpath(BUTTON_SRC, ROOT)}: {doc.frame_count} frames, layers {doc.layer_names}")

    layers = doc.visible_layers()

    # The label can live on any layer the artist happened to annotate; search
    # all of them rather than assuming which one carries the state names.
    found: dict[str, int] = {}
    for li in layers:
        for frame, label in doc.labels_for(li).items():
            if label in STATES:
                found[label] = frame

    missing = [s for s in STATES if s not in found]
    if missing:
        raise SystemExit(
            f"{BUTTON_SRC}: no cel labelled {missing}.\n"
            f"  found labels: {sorted({l for li in layers for l in doc.labels_for(li).values()})}"
        )

    sheet = Image.new("RGBA", (BUTTON_CANVAS * len(STATES), BUTTON_CANVAS), (0, 0, 0, 0))
    for slot, state in enumerate(STATES):
        sheet.paste(doc.composite(found[state], layers), (slot * BUTTON_CANVAS, 0))
    sheet.save(BUTTON_OUT)

    _verify_palette(sheet, BUTTON_OUT)
    _verify_distinct(sheet, BUTTON_CANVAS, STATES, "button states")
    print(f"  {os.path.relpath(BUTTON_OUT, ROOT)}: {sheet.width}x{sheet.height}, {len(STATES)} frames")


def _verify_palette(image: Image.Image, path: str) -> None:
    off = off_palette(image)
    if off:
        print(f"  FAIL {os.path.relpath(path, ROOT)}: off-palette colours: {off[:6]}")
        raise SystemExit(1)


def _verify_distinct(
    sheet: Image.Image, canvas: int, states: tuple[str, ...], noun: str
) -> None:
    """Prove the states differ rather than trust it — a button or a casing digit
    that never changes is a panel that silently stops reporting anything."""
    px = sheet.load()

    def frame_at(slot: int):
        return tuple(
            px[slot * canvas + x, y] for y in range(canvas) for x in range(canvas)
        )

    seen = {frame_at(slot) for slot in range(len(states))}
    if len(seen) != len(states):
        print(f"  FAIL {len(states)} {noun} but only {len(seen)} distinct pictures")
        raise SystemExit(1)
    print(f"  all colours ENDESGA-64, all {len(states)} {noun} distinct")


def build() -> None:
    """Cuts whichever of the plate and buttons has a source, independently.

    The two are drawn by different people on different schedules — nothing
    ties their completion together — so waiting on both before cutting
    either would sit on a finished button sheet for however long the casing
    takes. Only the fully-undrawn case refuses outright.
    """
    ran = False
    if os.path.exists(PLATE_SRC):
        build_plate()
        ran = True
    else:
        print(f"  skipping casing: {os.path.relpath(PLATE_SRC, ROOT)} not drawn yet")

    if os.path.exists(BUTTON_SRC):
        build_buttons()
        ran = True
    else:
        print(f"  skipping buttons: {os.path.relpath(BUTTON_SRC, ROOT)} not drawn yet")

    if not ran:
        raise SystemExit(
            "elevator panel art not drawn yet — nothing to build.\n"
            f"  missing: {os.path.relpath(PLATE_SRC, ROOT)}\n"
            f"  missing: {os.path.relpath(BUTTON_SRC, ROOT)}\n"
            "  see docs/SPRITE_BACKLOG.md for what each file should contain.\n"
            "  The game runs without them: ElevatorScene falls back to the\n"
            "  generic `ui-panel` casing and primitive buttons."
        )


if __name__ == "__main__":
    build()
