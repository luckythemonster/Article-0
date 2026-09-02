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
| **An `.aseprite` file** | `snake_case` | `light_switch.aseprite` | `build_sprites.py` `Spec.source` |
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

Short list. None of it breaks anything today; all of it is friction.

**Filenames — worth fixing, they are one rename each:**

| Current | Should be | Why |
| --- | --- | --- |
| `rain effect.aseprite` | `rain_effect.aseprite` | A space in a filename breaks shell globs and tooling |
| `Breaker.aseprite` | `breaker.aseprite` | The only PascalCase source; its own PNG is `breaker.png` |
| `door_single_east-west.aseprite` | `door_single_east_west.aseprite` | Mixes `_` and `-` in one name |
| `door_glass_single_east-west.aseprite` | `door_glass_single_east_west.aseprite` | Same |

Renaming any of these means updating `Spec.source` in `tools/sprites/build_sprites.py`
in the same commit — that table is the only thing pointing at them.

**Fields — rename when you next touch the structure, not before:**

`Target` → `target`, `State` → `state`, `Height` → `height`, `Destructible` →
`destructible`, `Alarm` → `alarm`, `BlockThermal` → `blockThermal`, `VisionBlock` →
`visionBlock`, `QScore` → `qScore`, `Class` → `class`, `Behavior` → `behavior`,
`Job` → `job`.

These are safe to leave. The case-insensitive lookup means renaming them changes
nothing functionally, so do it when it is convenient rather than as a pass.

**Not wrong, despite looking it:**

- `VENT-4_capacitors`, `EIRA-7`, `EIRA-7_avatar` — proper nouns out of the fiction.
  A hyphen inside a name the story uses is the story's, not a style slip. Keep them.
- `tdCement_4X4_10` and its 135 siblings — the editor generates these when you import
  a tileset. They are not yours to name and not worth touching.
- `security_guard_A` … `_D`, `drone_A`, `enforcer_rail_A` — a deliberate, consistent
  variant suffix. It is a good pattern; it is in the table above now.

---

## How to stop needing this file

Rules you have to remember are the wrong tool for a consistency problem. The repo
already prefers the other kind — `assertEntitySpriteSizes` holds two hand-written size
tables together, `pixelScale.test.ts` fails the build on a resampled sprite, and CI
rejects a stale `TYPE_REFERENCE.md`. Each one replaced a thing somebody had to
remember with a thing that fails loudly.

The same is available here: a test that walks `edplay.json` and the asset directories
and fails on a space in a filename, a `-`/`_` mix, or a field that is not `camelCase`.
It would fail on the four filenames above until they are renamed, which is the point.

Ask for it when you want it — it is small, and it is the version of this document that
works whether or not you have read it.
