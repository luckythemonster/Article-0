# Sprite backlog

Every piece of art the game is still waiting on, with the size to draw it at and
what happens when it lands. A work order, not a wishlist: each entry names an
exact filename, an exact pixel size, and whether dropping the file in is enough
on its own.

Sizes here are not preferences. Both halves of the project enforce an arithmetic
rule with a test, and art authored off-size fails the build or visibly degrades —
see [The two rules](#the-two-rules) at the bottom. **Read that section before
drawing anything at a size not listed here.**

Colour is **ENDESGA-64** throughout, the same palette the existing sprites use.
`docs/GUI_STYLE_GUIDE.md` §3 has the token table; §5 has the drawing rules for
icons specifically.

---

## Done — three world entities

`Terminal.aseprite`, `terminal_substation.aseprite` and `security_camera.aseprite`
in `public/assets/sprites/` are finished and wired. The terminal shows a standby
blip when idle, flashes amber and red while it is being breached, and settles on
a teal screen with a green lamp once it is. The substation runs its readout while
being patched and ends on a flatlined face. The camera blinks a red status lamp
once a second, faces whichever of four cardinals it is mounted toward, and goes
dark when its `Sensor` component says `disabled`.

Same arrangement as the panel: **the `.aseprite` is the source and the PNG strip
is build output.** `python3 tools/sprites/build_sprites.py` composites the visible
layers and writes `src/entities/entitySpriteFrames.json`. Two annotations are read,
not one — Aseprite **tags** for clips and **cel labels** for single frames — which
is what lets the camera's four identically-named `active` tags be told apart by
facing. `docs/ART_PIPELINE.md` §"Entity art" has the full contract.

Nothing left to redraw here. If you do redraw one, re-run the tool and commit
what it writes; the frame numbers are generated, so inserting or reordering
frames needs no code change.

---

## Done — the breaker and the power grid

`Breaker.aseprite` is finished and wired. Tapping it cuts a named circuit and taps
again to restore it; `src/entities/Breaker.ts` owns the throw and
`src/systems/PowerGrid.ts` owns which circuits are live. Nothing left to draw here.

**The `CONTROLS` layer is a four-LED binary keypad, not a spinning readout** — that
was the open question, and the pixels answered it. Each of the four 2×2 lamps is one
bit, lit `#ff0040` and unlit `#571c27`:

| digit | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| lit | — | TL | TR | TL·TR | BL | TL·BL | TR·BL | TL·TR·BL | BR | TL·BR |

so **top-left is worth 1** and bottom-right 8. Every digit is drawn twice, once
against the green `POWER_ON` screen and once against the red `POWER_OFF` one, which
is what lets a code be shown going in while cutting power *and* while restoring it.

> ⚠️ **This is the opposite endianness to the HUD.** `docs/GUI_STYLE_GUIDE.md` §4
> says the network panel's LED clusters read "leftmost worth 8"; this one reads
> leftmost worth 1. Both are as-drawn and both are correct for their own art —
> documented rather than reconciled, because renaming either would break a readout
> that currently reads right. Do not "fix" one to match the other.

A throw is composed per-press rather than played as a fixed range: the four digits
are picked by `keypadCode` and looked up by label, so no two throws animate alike.
Cutting power reads `[idle-green, open, d1..d4, open-red, idle-red]` and restoring is
the mirror through the red digits.

| clip | frames | reads as |
|---|---|---|
| `IDLE` | 0, and 23 | cabinet shut — green screen at 0, red at 23 |
| `POWER_ON` | 0–11 | door opens, controls run, screen green |
| `POWER_OFF` | 12–23 | screen flips red, controls run, door shuts |
| `IN_USE` | 1–21 | the whole open-cabinet stretch |

`IDLE` appears **twice** and the two mean different things — powered and unpowered.
They are told apart by intersecting the tag with the `SCREEN` layer's own cel label,
which is the two-annotation contract doing exactly what it is for.

It is authored at **½ tile** (`breaker_main1` is `RowSpan`/`ColSpan` 0.5), which is
why the art is 16×16 and not 32.

---

## Done — the network panel

`public/assets/ui/panel/ui-panel.aseprite` is finished and wired. It is no longer
just chrome: three of its layers are binary LED clusters counting units, spotters
and suspicious contacts, and a fourth is a status badge, all driven by the live
`AlertNetworkSnapshot`. Counts read 0–10 exactly with an all-lit overflow frame
past that; the badge has five states; the screen has three, including a red
alert flash. Every colour is an exact ENDESGA-64 entry, asserted by the build
tool rather than eyeballed. Nothing left to redraw here.

Worth knowing before touching it: **the `.aseprite` is the source and the PNGs
are build output.** `python3 tools/panel/build_panel.py` cuts the layered file
into `ui-panel.png` (casing only) and `network-indicators.png` (the four corner
instruments), plus `src/ui/networkIndicatorFrames.json`. The tool reads the
artist's own **cel labels**, not frame positions, so redrawing is a re-run rather
than a code edit — that indirection is what let the counts grow from 0–7 to 0–10
across two revisions with nothing in `src/` changing. `docs/GUI_STYLE_GUIDE.md`
§4 has the full contract.

---

## Priority 1 — item icons

**Status: seam is live. Art only — no code needed.**

The legacy icons are 256×256 smooth line art displayed in a 32×32 box: a ratio of
**0.125**, which throws away seven of every eight source pixels and picks *which*
seven based on where the box lands. `image-rendering: pixelated` does not rescue
them; it only makes the discarding sharp-edged instead of blurry.

Draw at **32×32**, save as PNG with alpha, drop in `public/assets/ui/icons/` under
**the same filename** as the 256px original. The pause menu tries the native path
first and silently falls back, so the set can be replaced one file at a time with
the game playable throughout.

### Redraws — 8 remaining

| file | item in game |
|---|---|
| `Q0_certification.png` | Q0_COMPLIANCE_CERT |
| `access_chit.png` | Access Chit |
| `battery.png` | Battery |
| `disk.png` | EIRA-7 Cached Log |
| `flashlight-off.png` | Flashlight, stowed |
| `flashlight-on.png` | Flashlight, lit |
| `medkit.png` | Medkit |
| `thermal_gel.png` | Thermal Gel |

Already correct, don't redo: **`sack_lunch.png`** (authored at 32×32 from the
start — it is the reference for what these should look like) and
**`EMP_grenade.png`** (redrawn 2026-08-14).

### New icons — 4 items have none at all

These render with no icon today. Adding one is the same drop-in, but the file
goes in **both** places or wires a path — see the note below.

| item | suggested filename |
|---|---|
| Stun Rounds | `stun_rounds.png` |
| Pneumatic Rail-Stapler | `rail_stapler.png` |
| LOG_CACHE_ALPHA | `log_alpha.png` |
| LOG_CACHE_BETA | `log_beta.png` |

> **These four need one line of code each**, unlike the redraws. `ITEM_ICON_PATHS`
> in `src/systems/ItemIcons.ts` maps item name → path, and an item absent from it
> renders without an icon regardless of what is on disk. Ping me with the files
> and I'll wire them, or add the entry alongside the existing eight.

### Drawing rules (condensed from GUI_STYLE_GUIDE §5)

- **Silhouette first.** At 32×32 an icon is read by outline before anything else.
  If it isn't identifiable as a black shape, detail won't save it.
- **1px outline**, darker than the fill — `--c-bg-panel` `#1a1932` or
  `--c-border-dim` `#2a2f4e`.
- **Three to four values per material.** A base, a shadow, a highlight, optionally
  one accent. More turns to mush at this size.
- **Reserve the accent colours for meaning.** A medkit may be red because it is a
  medkit; don't use `--c-red-deep` as decorative trim, since the HUD uses it for
  alert.
- **Keep a 1px margin** inside the box so icons don't touch in the inventory strip.

---

## Priority 2 — the two round instruments

The HUD has two circular scopes and they are deliberately a matched pair — both
currently draw as a plain 2px `--c-border-cool` circle. Art can add bezel depth,
tick marks, a bearing scale, screw heads.

| | radar | bio-integrity dial |
|---|---|---|
| where | top-right | top-left, under `BIO-INTEGRITY` |
| **source size** | **96×96** | **80×80** |
| drawn radius | 46 | 40 |
| texture key | `ui-radar-bezel` | `ui-vitals-bezel` |
| path | `public/assets/ui/radar/bezel.png` | *see warning below* |
| code needed? | **no** — already in the manifest | **yes, one line** |

**The interior of both must be transparent.** Each scope's contents are drawn on a
separate layer *underneath* the bezel — the radar's terrain and blips through a
geometry mask, the dial's face and EKG trace directly. Anything opaque inside the
ring hides them rather than sitting behind them.

> ⚠️ **`ui-vitals-bezel` is a dead seam right now.** `src/ui/BioMonitor.ts` asks
> for the texture, but it is not declared in `UI_TEXTURES`, so nothing probes for
> it and nothing loads it — the art would sit on disk doing nothing however
> correctly it was drawn. It needs a manifest entry
> (`{ key: "ui-vitals-bezel", path: "assets/ui/vitals/bezel.png", size: 80 }`)
> before it can work. Tell me when you're drawing it and I'll add the line.

---

## Priority 3 — the two staged VFX packs

**Status: on disk, unusable, not wired.**

`public/assets/vfx/explosion/` and `public/assets/vfx/electricity/` are third-party
packs at **512×512 per frame** — sixteen tiles across. No display height rescues
them: getting to game scale means an 8x nearest-neighbour reduction, the exact
pixel destruction the scale rule exists to prevent. They need redrawing at size
before they can be wired up.

| pack | frames | currently | draw at | shown as |
|---|---|---|---|---|
| `explosion` | 12 | 512×512 | **192×192** | 3 tiles |
| `electricity` | 7 | 512×512 | **128×128** | 2 tiles |

Those targets both give a clean 1:1 — one source pixel to one screen pixel. The
arithmetic, if you want a different footprint:

```
source size = 64 × (tiles across you want it to cover)

1 tile → 64px      3 tiles → 192px
2 tiles → 128px    4 tiles → 256px
```

For comparison, the effects already in the game: the EMP blast is 64px at 2 tiles,
the electronics spark 128px at 2 tiles, impact 32px at 1 tile, smoke plume 32px at
2 tiles.

> These need code to wire up — a `VfxSpec` in `src/entities/Vfx.ts` plus a call
> site that fires them. Worth deciding what actually triggers an explosion before
> the art time goes in; nothing in the game currently does.

---

## The two rules

Two different rules apply depending on where a sprite is drawn, and both are
enforced by tests rather than by eye.

### World sprites — `src/render/pixelScale.ts`

Drawn through a **2x camera** on a 32px tile grid:

```
(tileSize × displayTiles) / sourceSize × cameraZoom   must be a whole number ≥ 1
```

Between whole numbers (say 1.09) most source pixels get one screen pixel and every
eleventh gets two — and *which* ones are doubled depends on where the sprite sits,
so as the camera pans the grid re-snaps: outlines break up, line weights flicker.
Below 1, pixels are thrown away outright, and that cannot be fixed by drawing
better.

### UI sprites — `src/render/uiScale.ts`

`UIScene` is deliberately unzoomed, so the rule collapses to something stricter:

> **Author UI art at the size it appears on screen.**

32px art in a 32px box is 1. 16px art at 32px is 2 — a clean doubling, also fine.
Anything else resamples. Every entry in the texture manifest is checked by
`uiScale.test.ts`, so art added at the wrong resolution fails the build rather
than shipping soft.

---

## Already correct — don't redo

- **All four characters** (Rowan, orderlies, enforcers, drones) are drawn
  procedurally at boot by `src/entities/CastArt.ts`. There are no PNGs, and there
  is nothing to redraw — change `ROLES` or `drawFigure` instead. See
  `docs/ART_PIPELINE.md`.
- **The four wired VFX** — EMP blast, electronics spark, impact, smoke plume — all
  satisfy the scale rule and are covered by a test.
- **`sack_lunch.png`** and **`EMP_grenade.png`** icons.
- **The network panel** — finished, wired to live data, and every colour an
  exact EDG64 entry asserted by its build tool. See "Done" above.
- **The terminal, substation and security camera** — hand-drawn, state-driven and
  wired. See "Done — three world entities" above.
- **The breaker** — art, entity and power grid all done. See "Done — the breaker
  and the power grid" above.
- Everything listed under GUI_STYLE_GUIDE §7 "What not to draw" — light cones,
  radial light stamps, radar blips and sweep, the EKG trace, bars and gauges. All
  generated at runtime from live state.

## Reference

| what | where |
|---|---|
| palette tokens, icon and panel rules | `docs/GUI_STYLE_GUIDE.md` |
| how the art pipeline fits together | `docs/ART_PIPELINE.md` |
| the world scale rule | `src/render/pixelScale.ts` |
| the UI scale rule | `src/render/uiScale.ts` |
| texture manifest | `src/ui/UiTextures.ts` |
| item name → icon path | `src/systems/ItemIcons.ts` |
| what each panel frame means | `src/ui/NetworkPanel.ts` |
| the panel's build tool | `tools/panel/build_panel.py` |
| the entity sprites' build tool | `tools/sprites/build_sprites.py` |
| the shared `.aseprite` reader | `tools/aseprite/reader.py` |
| entity sprite manifest and clip lookup | `src/entities/EntitySprites.ts` |
| effect specs | `src/entities/Vfx.ts` |
