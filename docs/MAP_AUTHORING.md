# Map authoring reference

What the engine actually reads out of an `edplay` map, and what it ignores. Derived from
the consumers rather than the schema — the schema defines a fair amount the engine never
looks at, and authoring against it wastes effort.

Every claim below cites the code. If something here disagrees with the code, the code
wins and this file is a bug.

---

## 1. Hard requirements

Only two, and neither is a level name:

- **A `spawn` tile somewhere.** Without one the run starts at the first level's centre,
  which is almost certainly inside a wall.
- **At least one terminal typed `log_cache`.** It is the only way to recover EIRA-7's logs,
  and the run cannot be won without them.

Nothing else throws. Earlier versions of the engine required a level literally named
`duct2` and seven populated boards, because `appendVentCore` threw while hunting prototype
tiles and `BootScene` calls it unconditionally. Generation is now optional and silent — see
§2.

## 2. Level roles are derived, not hardcoded

`MapPlan.planFor` works out the map's shape at boot from the map itself. Each role has a
fallback chain, ordered so the shipped map resolves exactly as it always did:

| Role | How it's chosen |
| --- | --- |
| **Start** | First level with a non-empty `spawn` board → else the first level. |
| **Extraction** (the win condition) | First level with a non-empty `extraction` board → else a level named `main2` → else the last level. |
| **Vault host** (the Alignment Core) | First level with a non-empty `EIRA-7` board → else a level with `vault` in its name → else the extraction level. |
| **Vent-core host** | A level named `duct2` → else the last level with a non-empty `maintenance_access` board that isn't the start or extraction level → else **none**. |

So you can name your levels whatever you like. Declare intent explicitly by placing a
`spawn` tile, an `extraction` board and an `EIRA-7` board; otherwise the fallbacks pick
something sensible. The extraction deck and the vault need not be the same level — the
shipped map stacks the roof above the vault.

A level the engine *generated* is never chosen for any of these roles. A level you author
yourself is ordinary content, even if you call it `vent_core` or `roof_array`: the engine
will adopt what you drew instead of generating over it (`src/map/AdoptAuthored.ts`).

### If no level can host the vent core

The VENT-4 arena is spliced into a maintenance level and clones that level's art, so a map
with no suitable host simply doesn't get one. `appendVentCore` returns `false` and the game
boots normally. Consequences worth knowing:

- No VENT-4 boss, and the optional objective line is omitted rather than shown as something
  the player cannot complete.
- **No Q0 compliance cert**, since that is the reward for silencing VENT-4 — so compliance
  will never survive an EVASION sweep on that map (see
  [compliance in the README](../README.md#how-it-plays)).

### Prototype refs (cosmetic)

When the arena *is* generated it clones placed tiles, preferring these refs so it looks
right rather than borrowing something arbitrary. Missing them is not an error — generation
falls back to any tile on the board, and skips entirely if a board is empty everywhere.

| Board | Preferred ref |
| --- | --- |
| `floor` | `tdVents_Interior1_13` (a grate) |
| `walls` | anything containing `Concrete_Wall`, on the host level |
| `maintenance_access` | `hatch`, on the host level |
| `terminals` | `terminal0` |
| `cover` | `cover0` |
| `light_sources` | anything containing `light_source` |
| `items` | `chest0` |

## 3. Boards

Every board is drawn as tile art at `depth = layerIndex * 10`, **except** the individual
tiles the engine spawns as entities — those are claimed per tile by `src/map/EntityIndex.ts`
and skipped by the bake, because the entity draws its own sprite. Claiming is per tile
rather than per board on purpose: a board is free to mix art with entities, and several do.

(A short `ENTITY_LAYERS` list still skips whole boards, but only for the ones the *engine*
generates and the legacy names below. Don't author against it.)

### The cast: named for the route, typed by the component

A guard board can be called anything — `security_guard_A`, `drone_B`, `orderly`. What the
engine reads is the component every tile on it carries:

| Every tile carries | Becomes |
| --- | --- |
| `Human` with `Job: SECURITY` | **One `Enforcer` for the whole board**, its tiles that guard's ordered waypoints — see §3.1 |
| `Silicate` | Same, for one `Drone` — identical AI, different skin |
| `Human` with `Job: ORDERLY` | One `Orderly` per tile. Orderlies don't patrol, so the tiles are placements, not a route |

And per tile, on any board:

| Tile carries | Becomes |
| --- | --- |
| `Sensor` | One fixed camera. Facing is **inferred from surrounding walls**; the `facing` field is not read |
| `enemySpawn` | One `Enforcer` standing post. There is no wave system, so a spawn point is a sentry |

The legacy board names `enforcers`, `drones`, `orderlies` and `security` still work and are
read by name; the engine's own generators emit them.

### Fixtures and roles

| Board | What the engine does | Component |
| --- | --- | --- |
| `spawn` | **First tile only** = player start. Extra tiles ignored. Falls back to level centre. | — |
| `walls` | Collision grid + static physics bodies + blocks sight. Tile presence is enough. **Not the only solid board** — see §3.2. | — |
| `floor` | Nothing special — just art. (Only `VentCoreLevel` looks it up, for prototypes.) | — |
| `doors` | Tiles **with** a `door` component become doors. Board-scoped on purpose: a `Door` component on any other board stays art, which is what keeps an elevator car's own doors from sealing the player inside. | **`door` required** |
| `terminals` | Tiles **with** a `terminal` component become terminals. A `terminalN` tile here with *no* component is given the export's own `Terminal` defaults — see `InertTerminals.ts` — so anything else on this board should be named something else. | **`terminal` required** |
| `items` | Tiles **with** a `chest` component become chests. | **`chest` required** |
| `cover` | Detection dampening (0.4×) and crouch concealment. | `cover` |
| `light_sources` | Light pools *and* the detection multiplier — the same data drives both. | `light_source` |
| `verticals` | Every way off the level — stairs, ladders, hatches. See the Transitions section. | `Vertical`, optional |
| `elevator*` | An elevator car. Three or more levels sharing the car's coordinate is a shaft. | — |
| `extraction` | Marks the level as the win condition's destination (§2). Any tile will do; nothing is drawn. | — |
| `EIRA-7` | Marks the level as the Alignment vault (§2). The `*_avatar` tile is where the Core stands. | — |
| `substations`, `grates` | VENT-4 boss fixtures, adopted from the arena's own boards or generated. | — |

Lasers are the exception to all of this and are found **by ref** across every board — see
"Lasers are found by ref, not by board" below.

### 3.1 A guard board is one guard's patrol route

Tiles on a guard board are **ordered waypoints for a single guard**, walked as a loop, not
one guard each. Ordering comes from the trailing number on each tile's `ref`
(`security_guard1`, `security_guard2`, …); tiles whose ref has no number keep their file
order and sort behind the numbered ones. The guard spawns on the first waypoint and reads
its stats from that tile.

**Number each tile on the board individually.** The number is the *step*, not the guard —
the board is already the guard. An export that gives all four tiles of a route the same ref
still works, but its waypoint order collapses to file order and you lose the only handle
you have on it.

This is how the shipped map is authored. `main1`'s `security_guard_A` traces a circuit
across the level — (11,4), (16,8), (25,11), (28,11) — and `duct1`'s `drone_A` sits at
opposite ends of one corridor, which is a patrol rather than two drones standing in a line.
The engine used to read these boards as a headcount and let each guard wander, which is why
`main1` fielded four enforcers milling around instead of one walking a beat.

Consecutive waypoints do **not** need to be adjacent, or even in the same room: guards route
between them with A* (`src/systems/Pathfinder.ts`), so a leg may cross the whole level. They
will also open unlocked doors in their way and shut them again once through — `main1`'s beat
depends on it, since the only routes to the south hall are the doors at (4,33) and (32,33).
Locked doors stop guards exactly as they stop the player.

Practical notes for authoring:

- **One waypoint** is a sentry post: the guard holds that spot and sweeps its cone.
- **No tiles** means no guard on that level.
- A leg A* can't solve is skipped, and the loop picks the waypoint up next time round, so a
  route temporarily severed by a locked door degrades rather than wedging the guard.
- Want more guards on a level? That needs a second guard board, not more tiles on this one.

### 3.2 What blocks: the board says so, the tile says what shape

Solidity is the **board's** `Collision` field, not a hardcoded list of names:

| `Collision` | Meaning |
| --- | --- |
| `1` | Solid. Tiles block movement. |
| `2` | Marker/trigger. Never blocks. |
| absent | Not classified — treated as not solid. |

On NW-SMAC-01 that makes `walls`, `cover` and `winches` solid. **`cover` blocking is
new**: a server rack you could walk through read as a bug, so crates and desks are
obstacles now as well as concealment.

Two rules layered on top:

- **`fence` blocks regardless** (`EXTRA_SOLID_BOARDS` in `src/map/types.ts`). The
  roof's perimeter carries no `Collision` value but is plainly meant to stop you.
  Set `Collision: 1` on it and this exception can be deleted.
- **`cover` and `fence` block movement without blocking sight**
  (`SEE_THROUGH_BOARDS`), reusing the channel clear glazing already uses. You see
  over a crate and through chain-link, and cover keeps concealing rather than
  occluding.

If **no** board on a level declares `Collision` — an older export, a generated
level — the engine falls back to `["walls"]` and behaves exactly as it always did.

#### `ColliderPadding`: the shape of a solid tile

A TileDef may carry `ColliderPadding` — `{Left?, Top?, Right?, Bottom?}` in
**fractions of a cell** — which insets its collision box from the footprint
rectangle. `{Bottom: 0.4}` on a 1×1 wall gives a 32×19.2px body, leaving the lower
40% of the cell walkable, so collision hugs the drawn face instead of claiming the
floor in front of it.

Three things worth knowing:

- **It describes the art, not the placement.** `tdCement_4X5_10` carries
  `Bottom: 0.4` and is used on `walls`, `building` *and* `roof`. Padding never
  decides whether a tile is solid — only what shape it is when it is. That is why
  solidity is the board's call: keying it off padding would make the rooftop deck
  solid, and `roof_array` has no `walls` board to fall back on.
- **The collision grid stays whole-cell.** Padding refines the static bodies the
  *player* collides with; guards, pathfinding and line of sight keep working in
  whole cells. Every inset in the shipped map is ≤0.4, so a cell's centre never
  leaves the box and no cell is lost. Doors have worked this way all along.
- **Direction is confirmed as an inset.** `PADDING_DIRECTION` in
  `src/map/footprint.ts` reads padding as pulling the collision box in from the
  named edge, per the map author.

Turn on the debug overlay (`?debug`, backtick, `V`) to see it: red fills are the
coarse grid, cyan outlines are the real collider rectangles.

#### `CollisionMode`: a per-tile solid override

The board's `Collision` field (above) sets the default; a TileDef's
`CollisionMode` is that same three-way choice (default / ignore / wall) at the
*tile* level, for a prop that should collide wherever it's dragged regardless of
the board it lands on. Only the confirmed value is read:

| `CollisionMode` | Meaning |
| --- | --- |
| `1` | Solid, regardless of the board's own `Collision`. |
| absent | Defers to the board. |
| anything else | Not handled — the editor's "ignore" state has never appeared in an export, so its numeric encoding is unconfirmed. Treated the same as absent rather than guessed. |

`isForcedSolid` (`src/map/types.ts`) is the single place this is read; `CollisionGrid`
and `TileBake`'s `wallCells`/`wallBodyRects` all check it alongside the board's own
solidity. On the shipped map this changes nothing today — the 15 defs that carry it
are all already placed on `walls` — it only matters the day one of them, or a future
prop, ends up on a board that isn't otherwise solid.

### Lasers are found by ref, not by board

Every board is scanned for tiles whose `ref` contains `laser` (case-insensitive). The
`security` board is the one exception — its laser-ref tiles are reinterpreted as cameras.
A `lasers` board is therefore a convention, not a requirement.

- `scanner` in the ref → a 4×4 rotating scan zone; otherwise a beam.
- `vertical` in the ref → vertical beam; otherwise horizontal.
- Footprint comes from the tile's `ColSpan` / `RowSpan`.

### Transitions: one board, aligned coordinates

Put **every way off a level on a board called `verticals`** — stairs, ladders, hatches
alike — and give the two ends of a link the **same tile coordinate**. That is the whole
convention:

```
main1  verticals  access_hatch1 (10,14)  <->  duct1  verticals  ladder_up1  (10,14)
main2  verticals  ladder_up5    (30,6)   <->  roof_array  verticals  access_hatch5 (30,6)
```

Three things follow from it:

- **The art decides the trigger.** A ref starting `stairs` is walked over; a `ladder_*` or
  `access_hatch*` shows a `[E] Use access` prompt. Give both ends the same kind of art or
  the link feels different in each direction.
- **The board may hold art too, but name it clearly.** Only refs starting `access_hatch`,
  `hatch`, `ladder`, `stairs` or `elevator` — or a tile carrying a `Vertical` component —
  are read as ways out. `stairwell1` is art and stays art; that is deliberate, since the
  shipped map files two guard posts on `verticals` under that name.
- **Ladders inside one level are not transitions.** The engine models no intra-level
  verticals, so a catwalk↔floor ladder belongs on its own board (the shipped map uses
  `catwalk_access_up` / `floor_access_down`), not on `verticals`.

#### Elevators

An `elevator*` board holds a car (ref `elevator`) and, optionally, its door art. Two levels
sharing the car's coordinate link as an ordinary pair. **Three or more is a shaft**, and the
floors are linked as a cycle in map order — every floor gets one way in and one way out, and
the car travels one way round. Leave the car's doors on the elevator board: made real they
would seal the player inside a one-tile car.

#### If a link is off by a tile

Two ends that both failed to find an exact partner, on different levels, axis-aligned and
**one tile apart**, are linked anyway. That is a net for a single slipped coordinate, not a
feature — anything further out, diagonal, or with a real partner elsewhere is left alone,
and a tile with no partner stays inert art rather than being pointed at a guess.

#### Numbered pairs (explicit, and still supported)

Name the two ends `hatch<N>` and `ladder<N>` — the *tile ref*, not the board — and they
link whatever board they sit on and wherever they sit, even with no coordinate in common:

```
main2  ladder3 (5,1)  <->  roof_array  hatch3  (6,30)     <- coordinates need not match
```

The number is the link, and it beats coordinate matching for the same tile. Exactly two
ends per number: one end is ignored, and three or more is ambiguous, so nothing is linked.
The match is anchored (`^(hatch|ladder)\d+$`), which is why intra-level ramp art called
`stairs_up_east2` or `stair_rail_top_left1` never becomes an accidental level exit.

#### Legacy board names

`stairs`, `maintenance_access` and `roof_access` still work exactly as they did, with the
board name carrying the trigger style. The engine's own generators emit them.

### If the extraction level has no way in

`graftExtractionEntrance` (`src/map/AdoptAuthored.ts`) is the safety net: when the
extraction level has no way in at all, and some other level has a transition tile whose
coordinate nothing answers, the engine joins those two with a grafted
`hatch9`/`ladder9` pair, landing the player on the nearest tile they can stand on. It is a
net, not a feature — author the entrance and it never fires.

## 4. Component fields — read vs ignored

### Naming: the loader normalises, within limits

Component names below are the engine's. The editor doesn't spell them consistently across
exports — NW-SMAC-01 ships `Terminal`, `Container`, `LightSource` — so `EdplayLoader`
lowercases every `DataType` and maps the ones that genuinely differ:

| Editor emits | Engine reads |
| --- | --- |
| `Container` | `chest` |
| `LightSource` | `light_source` |
| `Sensors` | `sensor` |
| `AudioHazard` | `audio_hazard` |
| `Cover.Height` | `cover.type` |

Field names are left alone apart from the identity fields `Type` / `State` / `Key`, which
lowercase — the tuning fields (`SightRange`, `HackTime`, `ThermalBleed`, …) keep the
editor's PascalCase, because that is what the engine has always read them as.

This matters more than it looks: an unrecognised component reads as *absent*, silently. A
map whose terminals are spelled in a way the loader doesn't know has no terminals at all,
which means no log caches, which means a run that cannot be won — with nothing logged
anywhere. If you add a component type to the editor, add it here.

### Read vs ignored

Fields in the ignored column are authored (and sometimes even parsed) but never acted on.

| Component | Read | Ignored |
| --- | --- | --- |
| `enforcer` | `SightRange`, `SightAngle`, `ThermalDetectionRadius`, `AuditDelay`, `PatrolSpeed`, `PurgeSpeed`, `TurnRate`, `AlertNetworkRadius` | `DiscomfortEmitterPower`, `ArmorIntegrity`, `SystemStability` — they imply a combat model the game doesn't have |
| `door` | `key`, `state`, `OperationNoise` | `OpenSpeed` |
| `glass` | `VisionBlock` | `type` (the sprite conveys it), `BreakNoise` (no breakage mechanic) |
| `terminal` | `type`, `HackTime` | `password`; `AlertOnFail` is parsed into `TerminalStats` but unused — there is no hack-fail path for it to attach to |
| `light_source` | `Radius`, `DetectionMultiplier`, `type` (`flicker` in the value → pulses) | `LightOn` — an "off" fixture still lights |
| `cover` | `type` (`low` → crouch to hide, `high` → hides standing), `ThermalBleed`, `Destructible` | — |
| `chest` | `InteractionTime`, `NoiseOnOpen`, `item1/2/3` | `state` |
| `human` | `Job` (`SECURITY` → enforcer, `ORDERLY` → orderly) | `QScore`, `Class`, `Behavior` |
| `silicate` | presence (→ drone) | every field |
| `enemyspawn` | presence (→ a sentry) | `spawnTime`, `type` — there is no wave system |
| `sensor` | presence (→ a camera) | every field, `facing` included: it is inferred from the surrounding walls |
| `vertical` | presence (→ a way out, on a `verticals` board) | `direction`, `material` |
| `hatch`, `audio_hazard`, `powergrid` | **nothing** | every field |

### Notes on the ones with teeth

- **`glass`** sits *alongside* `door` on the shipped glass tile defs, and that combination
  is supported: the tile is a real openable door that never blocks line of sight. Glass on
  a blocking board (e.g. `walls`) becomes a static see-through obstacle instead. Set
  `VisionBlock` to `1`/`true` for frosted glazing that blocks sight like a wall.
  A pane placed this way blocks (and glazes) every cell of its **footprint**, so the
  1×2.5 glass tiles read as full-height panes rather than the one cell they sit on —
  see below.
- **`terminal.type`** values that mean something:
  - `log_cache` → opens the Doctrinal Compliance minigame. **Solving one is required to
    recover EIRA-7's logs, so a map needs at least one.** (`designateQualiaRack`
    deliberately never retypes the last one.)
  - `log_cache_alpha` / `log_cache_beta` → the two *named* halves of the cache. Same
    minigame, but each also grants its key item and ticks its own objective line. You do
    not normally author these: `GameScene.designateLogCacheNodes` promotes the log-cache
    nearest the player's arrival to ALPHA, and `src/map/LogCacheBeta.ts` promotes (or
    places) BETA on the crawlspace deck. Authoring them explicitly overrides both — but
    note that **the start level needs a log cache** for ALPHA to have anything to promote.
  - `qualia_rack` → opens the Qualia Phase-Lock bypass. Optional; if no terminal is typed
    this way the engine promotes one per level.
  - anything else → a plain terminal whose hack releases doors within 6 tiles.
- **`chest` item slots** left blank fall back to
  `["Medkit", "Battery", "Access Chit"]` (`CHEST_DEFAULTS`).

## 5. Gotchas

1. **A numeric field authored as `0` is treated as unset** and replaced by the engine
   default — see the comment in `EntityStats.num`, *"Map leaves tuning at 0"*. You cannot
   author a genuine zero: no zero-radius light, no zero sight range. This is why the
   shipped map runs almost entirely on defaults; its values are all `0` or `null`.
2. **Board order is draw order.** Non-entity boards render at `layerIndex * 10`, so put
   `floor` first and stack upward.
3. **The first board sets the level's dimensions.** `width`/`height` come from
   `Boards[0]`, falling back to the file's own `Width`/`Height`. Make board 0 full-size.
4. **A tile on `doors` without a `door` component is silently decorative.** No collider,
   no grid entry, no interaction — just art.
5. **A locked door with no terminal in range is impassable.** `key !== 0` or
   `state === "LOCKED"` locks a door, and only a terminal hack within 6 tiles opens it. The
   Access Chit is not wired up, so it cannot be used as a key.
6. **Guards don't hear footsteps.** `playerNoise` is only consumed by VENT-4's grate check;
   guards learn about noise from door, chest, knock and dart events. Quiet vs loud flooring
   does nothing.
7. **Unlit levels are genuinely dark.** Darkness is opaque and clipped to line of sight, so
   a level with no `light_sources` board is navigable only by flashlight and radar. Four of
   the shipped map's nine levels are in that state.
8. **Level order matters too**, separately from board order: the debug warp keys `1`–`9` map
   to your levels in authored order, with engine-*generated* levels last. "Generated" is a
   flag the generator sets, not the level's name — a `vent_core` you authored sorts with
   your own levels. Put the ones you iterate on most near the front.
9. **The engine appends four things to your map at boot**, each of which will quietly
   decline if your map can't host it — see `src/map/generate.ts` and the flags
   `hasVentCore` / `hasLogBeta` / `hasVault` / `hasRoof`:
   - `vent_core` and log-cache node BETA graft onto `MapPlan.ventCoreHost`;
   - the NW-SMAC-01 vault's fixtures graft onto `MapPlan.vaultHost`, and the `roof_array`
     level onto `MapPlan.extractionLevel`.

   The vault and BETA prefer their hardcoded coordinates and fall back to a layout derived
   from the host's own open floor when those don't fit; BETA retypes a `log_cache` terminal
   the host already has rather than standing a second one. `requireClear` rejects anything
   off the edge of the level as well as anything solid — an out-of-bounds coordinate used
   to read as "clear" and place fixtures where no player could reach them.
10. **Author `vent_core` / `roof_array` yourself and the engine adopts them** instead of
   generating (`src/map/AdoptAuthored.ts`). It reads what you placed and derives the rest:

   | Engine board | Taken from |
   | --- | --- |
   | `substations` | the whole `VENT-4_capacitors` board, or `energy` tiles reffed `substation_energy*` — **moved** either way |
   | `vent_hub` | `vents` tiles reffed `turbine*` (their centre, if there are several), or the `VENT-4` tile whose ref contains `chassis` |
   | `steam` | `VENT-4` tiles reffed `Steam_Vent1`; derived if there are none |
   | `relay_pedestals` | `terminals` typed `CALIBRATION`, or reffed `calibration_pedestal*` — **moved** off `terminals` |
   | `relay_dish` | the `uplink` tile, or the `extraction` tile |
   | `siege_mouths` | the roof's `entities`, `enforcer_spawn` and `enforcer_rail_*` tiles — **marked**, so they still stand their own sentry |
   | `vault_core` | the `EIRA-7` tile whose ref contains `avatar` — **moved** |
   | `vault_nodes` | every `terminals` tile carrying a `terminal` component — **moved** |
   | `vault_racks` | the vault level's `cover` tiles — **marked**, so the room keeps its cover |
   | `winches`, `drips` | your board of that name, as-is |
   | `pitons`, `columns`, `grates`, `relay_feed`, `searchlights` | derived |

   `substations` and `winches` also decide **how many** of each the fight has: place four
   capacitors and VENT-4 needs four patched, not the generated arena's three.

   **Every one of these is overridable**: place a board yourself and the adopter leaves it
   alone. The derived layouts are a floor, not a ceiling. An arena with no chassis, or a
   roof with no dish, is declined outright rather than reported as a boss that isn't there.

   Board names the acts claim, generated or adopted: `vault_core`, `vault_nodes`,
   `vault_racks`, `relay_pedestals`, `relay_feed`, `relay_dish`, `siege_mouths`,
   `searchlights`, `substations`, `grates`, `vent_hub`, `steam`, `pitons`, `drips`,
   `columns`. Only the hold-to-interact ones (`vault_nodes`, `relay_pedestals`,
   `relay_feed`, `substations`) are in `ENTITY_LAYERS`; the rest render as ordinary tile
   art, and the marker-only ones aren't drawn at all.
11. **A tile can be bigger than the cell it sits on.** `ColSpan`/`RowSpan` and
   `OffsetX`/`OffsetY` describe a footprint the art is stretched over — doors are 1.5 or
   2.5 tiles in one axis, and `main2`'s glass panes are 1×2.5 nudged half a tile down.
   `src/map/footprint.ts` resolves that into cells (a cell counts as covered when its
   *centre* falls inside the rectangle), and the tile bake, the wall bodies and the
   collision grid all read it. So a wide tile on `walls` blocks all of itself, and a
   1.5-wide door still only claims one cell because its 8px overhang misses both
   neighbours' centres. A tile can also be *smaller* than its footprint —
   `ColliderPadding` insets the collision box without moving the art or the cells
   the grid claims (§3.2).

## 6. Minimum viable map

Two levels, named whatever you like:

- A **start** level with a `spawn` tile, a `floor` board and a `walls` board.
- An **extraction** level with an `extraction` board.
- At least one terminal typed `log_cache` — on the **start** level, so node ALPHA has
  something to promote.
- A `verticals` board on each, with one tile at **identical coordinates** in both.

That's it. Everything else — guards, cameras, cover, lasers, chests, lights, glazing, and
the VENT-4 arena — is optional content. Add a third level with a `maintenance_access` board
if you want the boss fight (and the Q0 cert that comes with it).
