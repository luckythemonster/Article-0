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

`terminal.aseprite`, `terminal_substation.aseprite` and `security_camera.aseprite`
in `public/assets/sprites/` are finished and wired. The terminal sits dark and
idle, then its screen and status light step through the breach — READY, WORKING,
RUN — settling on that same running frame under a green tint once it's hacked.
The substation runs its readout while being patched and ends on a flatlined face.
The camera blinks a red status lamp once a second, faces whichever of four
cardinals it is mounted toward, and goes dark when its `Sensor` component says
`disabled`.

`terminal.aseprite` also carries a `DESTROYED` tag — not wired to anything yet,
reserved for a terminal-disabled mechanic (EMP, sabotage) that doesn't exist in
code. Don't be surprised it doesn't animate; nothing calls for it.

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

## Done — the four doors

`door_single_east-west.aseprite`, `door_single_north-south.aseprite`,
`door_glass_single_east-west.aseprite` and `door_glass_single_north-south.aseprite`
in `public/assets/sprites/` are finished and wired. Two silhouettes (plain,
glass) × two orientations, 19 frames each.

**Sizes differ by orientation, and that is the point.** East-west doors are
**32×48**, drawn to the shape of the 1×1.5 tile opening they bridge;
north-south doors are **32×32** on a plain 1×1 tile. Both come out a uniform 2
screen pixels per source pixel. An earlier pass drew all four at 32×32 and let
the east-west pair stretch to fill 1.5 tiles — legal under the scale rule, but
the door visibly failed to reach the top of its own doorway, which is why they
were redrawn.

Each source is one continuous sequence and the tags name its beats in order:

| tag | frames | door panel | reads as |
|---|---|---|---|
| `IDLE` | 0–1 | closed | at rest |
| `SCAN` | 2–4 | closed | reading whoever walked up |
| `LOCKED` | 5–6 | closed | denied |
| `UNLOCKED` | 7–9 | closed | granted — lead-in to the slide |
| `OPENING`/`CLOSING` | 10–15 | sliding | the travel |
| `MOTION_DETECTION` | 16–18 | **open** | held open, counting what passes |

> ⚠️ **Two tags do not mean what they say, and the `door` layer's cel labels are
> what prove it.** `MOTION_DETECTION` is the resting-**open** loop — its frames
> are the only ones labelled `OPEN` — not an approach cue; there is no `OPEN`
> tag any more. And `UNLOCKED` is the lead-in the indicator holds straight
> through the slide, so opening plays `UNLOCKED`+`OPENING` as one clip. Read the
> pixels, not the names, before changing either.

The closed states are proximity-driven: `GameScene` feeds every door the
player's position each frame, and a door shows `SCAN` or `LOCKED` when someone
is within `DOOR_SENSE_TILES`, `IDLE` otherwise. **Opening and closing stay
cosmetic** — collision and passability flip the instant `setOpen` is called, as
they always did, because guard door-work timing, the noise system and pathing
costs all assume it.

`door_glass_single_east-west.aseprite` carries 208 off-palette colours (a
glass-tint gradient its north-south sibling doesn't share) — reported, not
fatal, same as the terminal and substation. `docs/ART_PIPELINE.md` §"Entity
art" has the full contract, including why `CLOSING` is built by reversing
`OPENING` rather than read as its own tag.

---

## Done — the 2026-08-21 bundle

Two zips landed on 2026-08-21 (`Article Zero sprites 82126.zip`,
`Article Zero UI 82126.zip`) and sat unreferenced. Both are now unpacked, cut and
committed; the zips are gone, since keeping them alongside the loose sources
would be the same binary twice in git.

### World sprites — seven wired, four waiting on a call site

All eleven are in `SPRITES` in `tools/sprites/build_sprites.py` and their PNGs are
committed. Seven are also in `ENTITY_SPRITES` and drawn:

| id | source | canvas | shown at | drawn by |
|---|---|---|---|---|
| `laser-beam` | `laser.aseprite` | 32x32 | 1 tile | `src/entities/Laser.ts` |
| `laser-emitter` | `laser_emitter.aseprite` | 32x32 | ½ tile | `Laser.ts` |
| `trip-laser-east-west` | `trip_laser_east-west.aseprite` | **32x40** | 1x1.25 | `Laser.ts` |
| `trip-laser-north-south` | `TRIP_LASER_NORTH-SOUTH.aseprite` | 32x32 | 1 tile | `Laser.ts` |
| `lattice-uplink` | `lattice_uplink.aseprite` | **160x160** | 2.5 tiles | `src/entities/RoofRelay.ts` |
| `locker` | `locker.aseprite` | 32x32 | 1 tile | `src/entities/Locker.ts` |
| `footlocker` | `footlocker.aseprite` | 32x32 | 1 tile | `Locker.ts` |

A **beam** laser is now `laser-beam` segments tiled along its span with an emitter
housing at each end facing inward. The emitter's tags carry three states the class
already had and could not show — firing, `idle` between pulses, `deactivated` under
an EMP. The **scanner** keeps its `Graphics`: its sweep is a 4x4 scan zone, and the
trip lasers are doorway-width beams, so borrowing them would misdescribe it.

`lattice-uplink` plays `SEARCHING` — the full 48-frame sweep, which overlaps all
eight facing tags and so must be read through `clipFrames`, not by position — while
Act IV's pedestals are still being set, then holds a bearing once the feed is armed.

> ⚠️ **Four are cut but deliberately absent from `ENTITY_SPRITES`.** That list is a
> *load* manifest: an entry costs a HEAD probe and a texture at boot, and none of
> these has anything to draw it yet. Adding one is a single object literal once a
> call site exists.
>
> | id | canvas | drawn at | waiting on |
> |---|---|---|---|
> | `crate` | 32x32 | 1 or ½ tile | Cover art is baked into the level texture (`src/map/TileBake.ts`), not sprited — `Cover.destroy` erases it from the bake. Spriting cover is its own change. |
> | `crate-stack` | 32x32 | 1 or ½ tile | as above |
> | `bunk-bed` | 32x32 | 1 tile, or 1x2 | Nothing places furniture as an entity. Its four frames are facings (`WEST`/`EAST`/`SOUTH`/`NORTH`), not an animation. |
> | `bulkhead` | **64x96** | 2x3 tiles | The map has no 2x3 door def. Its only large opening is the 2.5x2.5 `elevator`, which `EntityIndex` files as scenery on purpose — made real it would seal the player in. |

`box.aseprite` and `box1.aseprite` are single-frame, so the build tool warns that
there is nothing to address by tag. That is correct for art with no states, not a
problem to fix.

### Item icons — eight, and a third cutter

`tools/icons/build_icons.py` joins `build_sprites.py` and `build_panel.py`, sharing
`tools/aseprite/reader.py` and the same source-is-the-`.aseprite` contract. It emits
**one file per icon rather than a strip**, because `ITEM_ICON_PATHS` addresses icons
by path and there is no spritesheet seam on that side to address a frame through —
and it emits **no manifest**, because the filename *is* the addressing and it is
already written down in `src/systems/ItemIcons.ts`.

Every colour is an exact ENDESGA-64 entry.

| source | frames | emits |
|---|---|---|
| `medkit.aseprite` | 1 | `medkit.png` |
| `disk.aseprite` | 1 | `disk.png` |
| `Q0 certification icon.aseprite` | 1 | `Q0_certification.png` |
| `EMP grenade.aseprite` | 1 | `EMP_grenade.png` |
| `flashlight.aseprite` | 2 | `flashlight-off.png`, `flashlight-on.png` |
| `keycard icon.aseprite` | 5 | `access_chit.png` |
| `STAPLE_GUN.aseprite` | 1 | `rail_stapler.png` — **new**, and now wired |

`rail_stapler.png` is the one with no 256px original behind it, so only the
`assets/ui/icons/` half of the fallback pair exists; if it ever goes missing the
Stapler renders iconless, which is what it did before.

`keycard icon.aseprite` carries **four more clearance levels** on its
`clearance_level` layer. They are drawn and unwired: `access_chit` is one item and
nothing in `ItemCatalog` carries a clearance to pick between them by. Left alone
rather than guessed at.

`breaker_load.aseprite` has no item it obviously belongs to and is unmapped.

Still outstanding as redraws: **`battery.png`** and **`thermal_gel.png`**, both still
the legacy 256px art. Still missing entirely: `stun_rounds.png`, `log_alpha.png`,
`log_beta.png` (and see the note about their `ITEM_ICON_PATHS` lines below).

### The two bezels — one mounted, one still wrong-size

The original `radar bezel.aseprite` (`public/assets/ui/icons/`, 160x160) and
`UI-VITALS-BEZEL.aseprite` (128x128) both arrived off-size and neither could be
used as drawn, since `src/render/uiScale.ts` requires UI art to be authored at
the size it appears.

**The radar half is done.** A proper 96x96 redraw landed as
`public/assets/ui/radar/radar_bezel.aseprite` and is now cut by
`tools/radar/build_radar_bezel.py` into `public/assets/ui/radar/bezel.png` — the
path `ui-radar-bezel` was already pointing at in `UI_TEXTURES`, so no code
changed. The old 160x160 `icons/radar bezel.aseprite` is superseded and can be
ignored (or removed, on its own).

The new source turned out to carry more than chrome: a `DIRECTION INDICATORS`
group of eight compass layers (`north`, `northeast`, ...) making up a
noise-source readout. `src/systems/Radar.ts` has no concept of a noise source to
drive it with today, so only the static `bezel` layer is cut; the eight
direction layers are drawn and waiting on that game system, the same "waiting on
a call site" state the four unwired world sprites are in above.

**It is not a clip, and that is the thing to know before wiring it.** Each of the
eight layers is a full 96×96 canvas carrying one 1–2px tick at its own spot
around the ring, and *no frame ever shows two directions in different states* —
every frame paints all eight the same colour. The bearing lives in the **layers**;
the frames are a loudness ramp:

| frames | tag | ticks | hold |
|---|---|---|---|
| 0–1 | `SCANNING` | `#0cf1ff` cyan, then dark | 36ms lit, 1260ms dark |
| 2–3 | `LOUD_SOURCE` | `#ff0040` red | 100ms lit, 36ms dark |
| 4–5 | `MEDIUM_SOURCE` | `#ffeb57` yellow | as above |
| 6–7 | `QUIET_SOURCE` | `#99e65f` green | as above |

So idle pings slowly, once per ~1.3s, and an active source blinks at ~7Hz.

That shape makes this **the network panel's problem, not the entity sprites'**:
eight independent positions × five states do not fit in a set of flat frames, so
wiring it means cutting each direction layer separately, cropped to its own tick,
exactly as `tools/panel/build_panel.py` cuts its corner LED clusters — then
lighting whichever bearings the game wants at whichever loudness.

> ⚠️ Two traps for whoever does that. **`JAMMED` spans frames 2–7**, overlapping
> all three source tags, so it must be read through `clipFrames` rather than by
> frame position — the same shape as `lattice-uplink`'s `SEARCHING` above. And
> **the cel labels slip**: on the dark frames five layers read `BLINK` while three
> read `LOUD`, though all eight pixels are an identical `#3d3d3d`. Same class of
> error as the `>10`/`>9` slip `build_panel.py` documents; here the pixels are the
> contract, not the labels.

The source's hidden `well` layer is an opaque interior fill — the backdrop the
ring was drawn against. It stays dropped: compositing it would floor the scope and
hide the blips the ring exists to frame.

**The vitals half is still open.** `UI-VITALS-BEZEL.aseprite` needs a 80x80
redraw the same way; `ui-vitals-bezel` still needs the one manifest line
described in Priority 2 below. Its source carries a `pulse_meter` and a `label`
layer plus a `NO_SOUND` tag, and its `BEZEL` and `RADAR_WELL` layers are hidden.

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

### Redraws — 2 remaining

Six of the eight were redrawn in the 2026-08-21 bundle and are cut by
`tools/icons/build_icons.py` — see "Done — the 2026-08-21 bundle" above. What is
left is what that bundle did not include:

| file | item in game |
|---|---|
| `battery.png` | Battery |
| `thermal_gel.png` | Thermal Gel |

Already correct, don't redo: **`sack_lunch.png`** (authored at 32×32 from the
start — it is the reference for what these should look like), **`EMP_grenade.png`**,
and the six from the bundle (`Q0_certification`, `access_chit`, `disk`,
`flashlight-off`, `flashlight-on`, `medkit`).

### New icons — 3 items have none at all

These render with no icon today. Adding one is the same drop-in, but the file
goes in **both** places or wires a path — see the note below.

| item | suggested filename |
|---|---|
| Stun Rounds | `stun_rounds.png` |
| LOG_CACHE_ALPHA | `log_alpha.png` |
| LOG_CACHE_BETA | `log_beta.png` |

The Pneumatic Rail-Stapler is **done** — `rail_stapler.png` came in the 2026-08-21
bundle and its `ITEM_ICON_PATHS` line is wired.

> **These three need one line of code each**, unlike the redraws. `ITEM_ICON_PATHS`
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

The HUD has two circular scopes and they are deliberately a matched pair. The
radar now draws its mounted ring art; the bio-integrity dial still draws as a
plain 2px `--c-border-cool` circle pending its own redraw.

| | radar | bio-integrity dial |
|---|---|---|
| where | top-right | top-left, under `BIO-INTEGRITY` |
| **source size** | **96×96** | **80×80** |
| drawn radius | 46 | 40 |
| texture key | `ui-radar-bezel` | `ui-vitals-bezel` |
| path | `public/assets/ui/radar/bezel.png` | *see warning below* |
| art on disk? | **yes, mounted** — 96×96, built by `tools/radar/build_radar_bezel.py` | yes, but **128×128** — redraw at 80 |
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

> ⚠️ **Sizing note — the vitals bezel's real margin is ~2-3px, not the whole
> radius.** "Drawn radius 40" in the table above is the canvas edge (80×80,
> so r=40), not how far out the moving content reaches. `src/ui/ekg.ts` caps
> the trace at `BASE_RADIUS + AMPLITUDE_PX` = 26 + 11 = **r=37**, a hard limit
> the code itself documents — so the ring has a genuine ~3px gutter (r=37 to
> r=40) to draw in, slightly more than the radar's own ~2px (content capped at
> r=46 inside a 96×96/r=48 canvas). Keep the transparent hole out to about
> r=38 for a hair of buffer past the R-spike peak, and treat r=38-40 as the
> bezel's territory — enough for a thin rim, fine tick marks, or small implied
> rivets, not a bezel with real relief.

---

## Priority 3 — the staged VFX packs

### Done — electricity

`public/assets/vfx/electricity/electricity.aseprite` is a hand-drawn 128×128,
14-frame arc, redrawn at size from the old 512×512 third-party pack (now
deleted). `tools/vfx/build_vfx.py` composites it to `spritesheet.png`, the same
source→build arrangement the entity sprites and panel use. `ELECTRICITY` in
`src/entities/Vfx.ts` is wired into `ALL_VFX` and covered by
`pixelScale.test.ts` — 2 tiles, a clean 1:1.

**Still needs a call site.** Nothing fires it yet — no code anywhere calls
`playVfx(scene, ELECTRICITY, …)`. Worth deciding what should trigger it (the
breaker throwing, a substation being patched, a guard hit by something
electrical) before that gets guessed at.

### Outstanding — explosion

**Status: on disk, unusable, not wired.**

`public/assets/vfx/explosion/` is still the third-party pack at **512×512 per
frame** — sixteen tiles across. No display height rescues it: getting to game
scale means an 8x nearest-neighbour reduction, the exact pixel destruction the
scale rule exists to prevent. It needs redrawing at size before it can be
wired up.

| pack | frames | currently | draw at | shown as |
|---|---|---|---|---|
| `explosion` | 12 | 512×512 | **192×192** | 3 tiles |

That target gives a clean 1:1 — one source pixel to one screen pixel. The
arithmetic, if you want a different footprint:

```
source size = 64 × (tiles across you want it to cover)

1 tile → 64px      3 tiles → 192px
2 tiles → 128px    4 tiles → 256px
```

For comparison, the effects already in the game: the EMP blast is 64px at 2 tiles,
the electronics spark 128px at 2 tiles, impact 32px at 1 tile, smoke plume 32px at
2 tiles, electricity 128px at 2 tiles.

> This needs code to wire up too — a `VfxSpec` plus a call site. Worth deciding
> what actually triggers an explosion before the art time goes in; nothing in
> the game currently does.

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
- **The item icons** — `sack_lunch.png` was always right, and eight more are cut
  from `.aseprite` sources by `tools/icons/build_icons.py`. Only `battery.png` and
  `thermal_gel.png` are still legacy art.
- **The seven mounted world sprites** from the 2026-08-21 bundle — the laser grid,
  the lattice uplink, and the two lockers. See "Done" above.
- **The network panel** — finished, wired to live data, and every colour an
  exact EDG64 entry asserted by its build tool. See "Done" above.
- **The terminal, substation and security camera** — hand-drawn, state-driven and
  wired. See "Done — three world entities" above.
- **The breaker** — art, entity and power grid all done. See "Done — the breaker
  and the power grid" above.
- **The four doors** — all hand-drawn, wired into `Door.ts`, and covered by a
  test. See "Done — the four doors" above.
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
| the item icons' build tool | `tools/icons/build_icons.py` |
| the shared `.aseprite` reader | `tools/aseprite/reader.py` |
| entity sprite manifest and clip lookup | `src/entities/EntitySprites.ts` |
| effect specs | `src/entities/Vfx.ts` |
