#!/usr/bin/env python3
"""Build the inventory item icons from the `.aseprite` sources.

The third cutter, after `tools/sprites/build_sprites.py` and
`tools/panel/build_panel.py`, sharing their reader and their contract: the
`.aseprite` under `public/assets/ui/icons/` is the source, the PNG beside it is
build output, and editing the PNG is lost on the next run.

**One file per icon, not a strip.** That is the whole reason this is a separate
tool rather than another `Spec` in the sprites one. `ITEM_ICON_PATHS` in
`src/systems/ItemIcons.ts` maps an item name to a *path*, and the pause menu's
inventory renders each through a plain `<img>` — there is no spritesheet seam on
that side to address a frame through. A source with several frames therefore
emits several files, and the spec says which frame goes where.

**No manifest comes out.** The sprites tool emits `entitySpriteFrames.json`
because code addresses those frames by the artist's tag names; here the filename
*is* the addressing, and it is already written down in `ITEM_ICON_PATHS`. A
second generated mapping would be the same fact in two places.

**32x32, asserted rather than assumed.** `src/render/uiScale.ts` is the rule
these have to satisfy: the HUD is unzoomed, so an icon is drawn at the size it
appears and anything else resamples. The legacy set was 256x256 shown in a 32px
box — a ratio of 0.125, throwing away seven pixels in eight. `read(...,
expect_size=...)` below turns a resize in Aseprite into a failure here instead of
a soft-looking icon shipping.

Run by hand; the output is committed.

    pip install Pillow
    python3 tools/icons/build_icons.py [--strict]

`--strict` turns an off-ENDESGA-64 colour into a build failure rather than a
warning, matching the sprites tool. Default is to report and continue.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))

from aseprite.reader import off_palette, read  # noqa: E402

ICON_DIR = os.path.join(ROOT, "public", "assets", "ui", "icons")

#: The box every icon is drawn in, and the size it must be authored at.
ICON_SIZE = 32


@dataclass(frozen=True)
class Spec:
    """One source file and the PNG(s) it emits.

    `outputs` maps a frame index to the basename it is written as. A
    single-frame source is the common case and says so with `{0: "name.png"}`;
    the flashlight has a stowed and a lit frame that the inventory addresses as
    two separate paths, and the keycard's five frames are clearance levels.
    """

    source: str
    outputs: dict[int, str] = field(default_factory=dict)


#: Every icon that ships. Filenames are the ones `ITEM_ICON_PATHS` already asks
#: for, so a redraw is a re-run rather than a code edit — the same indirection
#: the panel and the entity sprites have.
ICONS: tuple[Spec, ...] = (
    Spec(source="medkit.aseprite", outputs={0: "medkit.png"}),
    Spec(source="disk.aseprite", outputs={0: "disk.png"}),
    Spec(source="q0_certification_icon.aseprite", outputs={0: "Q0_certification.png"}),
    Spec(source="emp_grenade.aseprite", outputs={0: "EMP_grenade.png"}),
    # Two frames, two items: the flashlight is stowed at 0 and lit at 1, and the
    # inventory swaps the path rather than the frame.
    Spec(source="flashlight.aseprite", outputs={0: "flashlight-off.png", 1: "flashlight-on.png"}),
    # Five clearance levels on the `clearance_level` layer. Only the first is
    # wired: `access_chit.png` is one item, and nothing in `ItemCatalog` carries a
    # clearance to pick the others by. The remaining four are drawn and waiting
    # for a mechanic, which is worth knowing before someone redraws them.
    Spec(source="keycard_icon.aseprite", outputs={0: "access_chit.png"}),
    # New — no 256px legacy icon to replace. Needs its `ITEM_ICON_PATHS` line,
    # which it now has.
    Spec(source="staple_gun.aseprite", outputs={0: "rail_stapler.png"}),
)


def build(strict: bool = False) -> None:
    problems: list[str] = []

    for spec in ICONS:
        src = os.path.join(ICON_DIR, spec.source)
        doc = read(src, expect_size=(ICON_SIZE, ICON_SIZE))
        layers = doc.visible_layers()
        hidden = [layer.name for layer in doc.layers if not layer.visible]

        print(f"{os.path.relpath(src, ROOT)}: {doc.frame_count} frames, "
              f"{ICON_SIZE}x{ICON_SIZE}")
        print(f"  layers   {[doc.layers[i].name for i in layers]}"
              + (f"  (hidden, dropped: {hidden})" if hidden else ""))

        for frame, name in sorted(spec.outputs.items()):
            if frame >= doc.frame_count:
                problems.append(
                    f"{spec.source}: wants frame {frame} for {name}, "
                    f"but the source has {doc.frame_count}"
                )
                continue
            image: Image.Image = doc.composite(frame, layers)
            out_png = os.path.join(ICON_DIR, name)
            image.save(out_png)

            off = off_palette(image)
            note = f"off-palette {off[:6]}" if off else "all colours ENDESGA-64"
            print(f"  {os.path.relpath(out_png, ROOT)}: frame {frame}, "
                  f"{image.width}x{image.height}, {note}")
            if off:
                problems.append(f"{name}: {len(off)} off-palette colour(s) {off[:6]}")

        unused = doc.frame_count - len(spec.outputs)
        if unused > 0:
            print(f"  note     {unused} frame(s) drawn but not wired to an item")

    print(f"\n  {len(ICONS)} sources -> "
          f"{sum(len(s.outputs) for s in ICONS)} icons in "
          f"{os.path.relpath(ICON_DIR, ROOT)}")

    if problems:
        print("\n" + "\n".join(f"  warn {p}" for p in problems))
        if strict:
            raise SystemExit(f"{len(problems)} problem(s) — see above")


if __name__ == "__main__":
    build(strict="--strict" in sys.argv)
