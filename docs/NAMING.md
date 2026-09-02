# Naming

Every rule here is one you are already mostly following. This file exists so you do
not have to hold them in your head, and so the handful of places the map and the code
currently disagree are written down rather than rediscovered as bugs.

**If you read one thing:** the only names that can silently break the game are the ones
that cross from the editor into the engine — board names, tile-def refs, component
fields, sprite ids, cel labels. A wrong name there does not error. It reads as absent,
and the engine quietly substitutes a default. That is exactly how every light on the
shipped map spent the project rendering at the wrong radius.

---

## The table

| You are naming | Use | Example | Who reads it |
| --- | --- | --- | --- |
| **A board** | `snake_case` | `light_sources`, `maintenance_access` | `EntityIndex`, `AutoLight`, the bake |
| A board that is one of a set | `snake_case` + `_A` | `security_guard_A`, `drone_B` | `EntityIndex` route grouping |
| **A tile-def ref** you author | `snake_case` + optional digit | `light_overhead1`, `breaker_main1` | `power_grid.Target`, generators |
| **A component field** | `camelCase` | `hackTime`, `operationNoise` | `EntityStats` — **see the warning below** |
| A component DataStructure | `PascalCase` | `LightSource`, `PowerGrid` | `EdplayLoader` (lowercases it) |
| An enum *value* | `SCREAMING_SNAKE` | `LOG_CACHE`, `Q2_COGNITIVE` | `str()` comparisons |
| **An `.aseprite` file** | lowercase; `_` or `-`, not both | `light_switch.aseprite`, `ui-panel.aseprite` | `build_sprites.py` / `build_icons.py` `Spec.source` |
| **A sprite id / its `.png`** | `kebab-case` | `light-switch.png` | `EntitySpriteId`, texture keys |
| A cel label or tag | `SCREAMING_SNAKE` | `NO_POWER`, `POWER_ON` | `framesLabelled`, `clipFrames` |
| **A `.ts` file that *is* a thing** | `PascalCase` | `AutoLight.ts`, `Enforcer.ts` | you |
| A `.ts` file of loose helpers | `camelCase` | `falloff.ts`, `distance.ts` | you |
| A TS constant | `SCREAMING_SNAKE` | `ZONE_TILES` | you |
| A TS type / interface / class | `PascalCase` | `LightStats` | you |
| Anything else in TS | `camelCase` | `lightStatsFor` | you |

Two things that are **never** correct anywhere: a **space** in a filename, and mixing
`-` with `_` in the same name.

---

## The one that actually bites: component fields

The export currently spells its fields three different ways — 15 lowercase, 14
PascalCase, 6 camelCase — and it spells *the same concept* two ways:

```
Door.state      Hatch.state      Sensor.state      Chest.state
PowerGrid.State                  Silicate.State
```

`EntityStats` asks for one spelling. Whichever it picks, the other half misses, falls
through to an engine default, and nothing reports it. That is not hypothetical — it is
PR #169, seven fields wrong across five component types, for the life of the project.

**The rule: `camelCase` for every component field.** It is what the editor produces
when you type a two-word name, so it is the one you will land on by accident.

Three notes:

1. **Single lowercase words already satisfy this.** `radius`, `type`, `state`, `key`,
   `items`, `facing` are all correct as-is. Nothing to change.
2. **The engine no longer cares.** Field lookup is case-insensitive as of #169, so
   `Radius` and `radius` both find the field. This rule is now about *you* being able
   to read the export, not about the game working.
3. **Blank still means blank.** The editor fills an untouched field with its
   structure's `DefaultValues`, and the engine treats a value equal to that default as
   unset. To change a number, change it to something the editor is not already
   suggesting. See `MAP_AUTHORING.md` gotcha 1.

---

## What is currently wrong

**Nothing, on disk.** `tools/naming/naming.test.ts` walks `public/assets`, `src` and
`tools` on every `npm test` and fails on anything in the table above, so this section
can only ever describe what the lint would say — and right now it says nothing.

It did not start that way, and the gap is the argument for the lint in one line: a
careful read-through of this repo found **four** badly named asset files. The walk
found **fifteen**. Five had spaces (`rain effect.aseprite`, `big bulkhead.aseprite`
and three icon sources), eight mixed `-` with `_`, and two were shouting
(`Breaker.aseprite`, `STAPLE_GUN.aseprite`). All fifteen are renamed and their
`Spec.source` entries with them.

**Component fields are the exception, and are grandfathered.** Fourteen are not
camelCase — `PowerGrid.Target`, `Cover.Height`, `Human.QScore` and the rest. They are
listed in `GRANDFATHERED_FIELDS` so a *new* one still fails, and they are safe to
leave: field lookup has been case-insensitive since #169, so renaming one changes
nothing functionally. Rename them when you next have the editor open and delete the
matching line from that list. **That list only shrinks.**

**Not wrong, despite looking it:**

- `VENT-4_capacitors`, `EIRA-7`, `EIRA-7_avatar` — proper nouns out of the fiction.
  A hyphen inside a name the story uses is the story's, not a style slip. The lint
  knows them by name.
- `tdCement_4X4_10` and its 135 siblings — the editor generates these when you import
  a tileset. They are not yours to name, and the lint does not look at them.
- `security_guard_A` … `_D`, `drone_A`, `enforcer_rail_A` — a deliberate, consistent
  variant suffix. It is a good pattern; the lint allows it explicitly.
- Item icon **PNGs** (`EMP_grenade.png` beside `flashlight-off.png`) — inconsistent,
  and deliberately unlinted. They are reached through `ITEM_ICON_PATHS`, a
  hand-written map, so their names are load-bearing in a way a rename would have to
  chase. The `.aseprite` sources behind them *are* linted.
- `ui-panel.aseprite` beside `door_single_east_west.aseprite` — the repo uses both
  separators for art sources and neither is wrong, so the lint only asks that you not
  mix them inside one name.

## You do not have to remember any of this

Rules you have to remember are the wrong tool for a consistency problem, so these are
not only written down — they run. `tools/naming/naming.ts` holds them and
`tools/naming/naming.test.ts` fails `npm test` on a violation, naming the file *and the
rename* rather than reporting a count. Same shape as `assertEntitySpriteSizes` and the
pixel-scale test: a thing somebody had to remember, replaced by a thing that says so.

Two consequences worth knowing:

- **A badly named new asset fails the build**, not review. Rename it as the message
  says, and update its `Spec.source` in the same commit.
- **The exception lists are the pressure valve.** `PROPER_NOUNS` and
  `GRANDFATHERED_FIELDS` in `naming.ts` exist so the lint can never force a rename that
  would be wrong. Adding to `PROPER_NOUNS` is fine when the fiction earns it; adding to
  `GRANDFATHERED_FIELDS` is not.
