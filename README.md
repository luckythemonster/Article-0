# Article Zero

An SNES-style, top-down **stealth RPG engine** — Metal Gear / Metal Gear 2 as
the north star — that parses and runs the level map shipped in this repo
(`Article Zero test map 1.zip`).

The map was authored in a tile editor and exported as `edplay.json`: 4 connected
levels (`main1`, `duct1`, `duct2`, `main2`) built from layered "boards" (floor,
walls, doors, cover, lasers, light sources, terminals) plus entity layers
(enforcers, orderlies, drones, security, spawn). Entities carry **typed gameplay
components** — guards have `SightRange`/`SightAngle`/`ThermalDetectionRadius`,
doors have keys and states, terminals are hackable, lights raise detection, and
so on. This engine loads that data directly and brings the entry level to life.

## Running it

```bash
npm install
npm run dev      # open the printed local URL
```

Build / type-check:

```bash
npm run build    # tsc --noEmit + vite build
```

### Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move (free 8-directional) |
| Shift | Sneak / crouch — slower, quieter; crouch on cover to hide |
| Space | Run — faster but louder |
| E | Contextual: open/close a door, hack a terminal (hold), or use a hatch/ladder |

Walk onto a **staircase** and you descend/ascend automatically; **hatches and
ladders** show a `[E] Use access` prompt and change level when you press **E**.
Either way the screen fades and you arrive at the connected level's matching
access point — `main1` links to `main2` (stairs) and to `duct1`/`duct2`
(maintenance hatches).

**Doors** are closed by default and block both movement and line of sight —
they're real chokepoints. Stand next to one and tap **E** to open or close it
(opening makes noise: nearby guards turn to look and grow suspicious, so timing
matters). **Terminals** are hacked by holding **E** while adjacent — a progress
bar fills over the terminal's hack time, and finishing releases every door in
the surrounding sector (the classic "hack the panel, the doors open" beat).
Since the map carries no explicit terminal→door wiring, that link is derived by
proximity.

Walk into a guard's yellow vision cone with a clear line of sight and the
detection meter fills; fill it completely and the base goes to **ALERT** (the
cone turns red, a `!` appears, guards converge on your last known position).
Break line of sight and it decays back through **EVASION** to **INFILTRATION**.
Standing in a light pool fills the meter faster; standing on cover slows it.

The top-right **radar** is a Soliton-style minimap: a world-aligned circular
plan view showing nearby walls and guards (yellow, red once they're close to
spotting you) within a fixed radius, with your own facing as a cyan arrow at
the centre. It's disabled during **ALERT** — the feed reads `JAMMED` and shows
only static — so you lose the safety net exactly when guards are actively
hunting and have to fall back on line of sight.

## How the map is parsed

The whole pipeline lives in `src/`:

- **`src/map/`** — the format. `types.ts` describes the edplay schema and the
  normalized game model. `EdplayLoader.ts` resolves every tile
  (`Handle → TileDef → SpriteId → sprite rect`) and every entity
  (`TileDef.DataComponents → typed values`, falling back to the
  `DataStructure` field defaults, since the map leaves tuning at 0/null).
  `SpriteAtlas.ts` slices each referenced rectangle out of the three
  spritesheet PNGs into a named Phaser frame, so tiles draw as their real
  pixel art.
- **`src/scenes/`** — `GameScene` renders the layers in board z-order, builds
  wall collision, spawns entities, and drives the systems each frame.
  `UIScene` is a parallel, unzoomed overlay for the HUD.
- **`src/entities/`** — `Player` (arcade-body 8-dir movement, stance/noise,
  animated character sprite), `Enforcer` (patrol + wall-clipped vision cone
  + per-guard detection meter, animated scanner-drone sprite; `GuardSkin.ts`
  factors out the animation/sizing config so `Drone` is a one-line subclass
  with its own sprite), `Orderly` (a lighter, non-combat bystander that
  wanders near its spawn and raises a one-shot alert if it spots the player),
  `Door` (blocks movement + LOS when closed, opens on interact) and
  `Terminal` (hold-to-hack, releases nearby doors).
- **`src/systems/`** — `CollisionGrid` (wall/door grid + line-of-sight raycast
  + runtime `setBlocked` for doors, plus a radius query for nearby walls),
  `DetectionSystem` (light/cover modifiers), `AlertState` (the
  INFILTRATION → ALERT → EVASION FSM),
  `TransitionGraph` (auto-derived level-to-level connections for
  stairs/hatches/ladders), `Radar` (builds the player-relative radar snapshot
  each frame), and `EntityStats` (engine-side default tuning per entity type).

The gameplay numbers live in `EntityStats.ts` because the map author left the
per-entity fields at their defaults — override any of them in the map and the
engine will use that value instead.

## What's implemented (Phase 1 — playable vertical slice)

- Parse `edplay.json` into a normalized model and register sprite frames.
- Render `main1` from the real spritesheets, in correct layer order.
- Player: free 8-directional movement, wall collision, sneak/run stances,
  animated character sprite (idle/walk/run/crouch, full 8-direction).
- Guards: patrol, wall-clipped vision cones, per-guard detection, animated
  scanner-drone sprite (patrol-scan cycle, full 8-direction), roughly
  player-sized. `enforcer` map tiles spawn regular guards; `drones` tiles
  (found in the crawlspace levels) spawn the same AI wearing a small
  spider-legged sentry skin — the map gives both the identical `enforcer`
  stats component, so they share one implementation (`Enforcer`/`Drone` +
  `GuardSkin`).
- Orderlies: `orderlies` tiles spawn unarmed bystanders that wander loosely
  near their spawn point and idle/walk in place otherwise. They carry no
  gameplay component, so they're not a persistent threat — instead, an
  unobstructed sightline to the player (no cone-angle limit, gated by the
  same concealment check as guards) trips a one-shot "!" witness alert that
  raises the suspicion of any guard within earshot, the same way an opened
  door does, then the orderly freezes (`src/entities/Orderly.ts`).
- Stealth: light/cover detection modifiers, global alert FSM, HUD.
- Transitions: walk-over `stairs` and `E`-to-use `maintenance_access`
  hatches/ladders move between all four levels (`main1`, `duct1`, `duct2`,
  `main2`), with a screen fade. Connections are derived automatically from the
  map by matching each access point's tile coordinate across levels
  (`src/systems/TransitionGraph.ts`).
- Radar: a Soliton-style circular minimap (nearby walls + guard blips,
  player-facing marker), jammed during ALERT (`src/systems/Radar.ts` +
  `src/ui/Radar.ts`).
- Interactables: `door`s block movement and line of sight when closed and open
  on interact (with an operation-noise ping that alerts nearby guards);
  `terminal`s hack on a held interact and release the doors in their sector
  (`src/entities/Door.ts`, `src/entities/Terminal.ts`). Terminal→door links are
  derived by proximity, since the map carries none.
- Lasers: `laser` tiles become live hazards (`src/entities/Laser.ts`) — pink
  4×4 `scanner` zones with a rotating sweep, and red horizontal/vertical
  `beam`s — that pulse active/idle (a timing window to slip through) and trip
  the alarm instantly on contact. Kind and orientation are inferred from the
  `ref` and the footprint from `ColSpan`/`RowSpan`, since the tiles carry no
  components.
- Lighting: the level is darkened with soft, bright pools punched out at each
  `light_source` (`src/ui/Lighting.ts`), so you can see where the shadows are.
  It reads the *same* light data `DetectionSystem` uses, so a lit spot is both
  visibly brighter and mechanically easier to be spotted in; `flicker`-type
  lights pulse.
- Cover: crouch (**Shift**) on a `cover` tile to break the guards' line of sight
  entirely — a "HIDDEN" marker confirms it. Standing on cover still softens
  detection (0.4×). Concealment is gated in the one vision choke point
  (`Enforcer.canSee`); all map cover is `LOW` (crouch). Thermal/destructible
  cover fields are left for later.

## Roadmap

2. **The rest of the complex** — done: level transitions through `stairs` and
   `maintenance_access` hatches, plus a Soliton-style radar minimap.
3. **Interactables & hazards** — done: hackable `terminal`s, blocking/openable
   `door`s, and `laser` tripwires/scanners. (The map places no `power`,
   `chest`, or `audio_hazard` tiles, so those roadmap ideas would need new
   authoring.)
4. **More threats & the RPG layer** — done: `orderly` and `drone` enemy
   types. Left: `security` enemy type, `sensor` cameras, thermal detection,
   inventory, and alert-network stats.

## Project layout

```
public/assets/          edplay.json + spritesheet_{0,1,2}.png (extracted from the zip)
public/assets/player/   player character frames (see below)
public/assets/enforcer/ enforcer sentry frames (see below)
public/assets/drone/    patrol drone frames (see below)
public/assets/orderly/  orderly bystander frames (see below)
src/main.ts         boot: load assets, parse map, start scenes
src/map/            format types, loader, sprite atlas
src/scenes/         GameScene, UIScene
src/entities/       Player, Enforcer, Drone, Orderly, Door, Terminal, Laser,
                    GuardSkin, PlayerAnimations, EnforcerAnimations,
                    DroneAnimations, OrderlyAnimations
src/systems/        CollisionGrid, DetectionSystem, AlertState,
                    TransitionGraph, Radar, EntityStats
src/ui/             Hud, Radar, Lighting
```

## Character & enemy art

All four were generated with [PixelLab.ai](https://www.pixellab.ai/) (high
top-down templates) and pulled in via its API, every sprite scaled to ~1.5
tiles tall:

- **Player** ("Rowan Ibarra", 88x88) — idle/walk/run cycles in all 8
  directions (`public/assets/player/`, manifest at
  `public/assets/player/manifest.json`). `PlayerAnimations.ts` maps that frame
  layout to Phaser animation keys; facing matches the free 8-directional
  movement exactly, no direction snapping. Crouch and crouch-walk come from a
  second, dedicated "Rowan Ibarra crouched" character sheet (same rig/outfit,
  posed low) rather than a reskinned standing pose — a settled kneel for
  standing still in cover, and a distinct low stride for sneaking on the move.
- **Enforcer** (48x48) — a blocky robotic sentry gliding on magnetic tracks
  with a rotating crown of camera-arms. It shipped with no animations, so its
  "patrol-scan" cycle (the camera-arms sweeping back and forth while it
  glides forward) was generated with PixelLab's custom v3 animation mode
  across all 8 directions in one call (`public/assets/enforcer/`, manifest at
  `public/assets/enforcer/manifest.json`). `EnforcerAnimations.ts` maps the
  frames to Phaser animation keys; facing matches the guard's continuous
  patrol/pursuit angle exactly.
- **Drone** (85x85) — a small spider-legged sentry with a sensor-cluster
  "eye", generated the same way as the Enforcer (v3 mode, one call, all 8
  directions; `public/assets/drone/`, manifest at
  `public/assets/drone/manifest.json`, mapped by `DroneAnimations.ts`). It's
  the Enforcer's AI wearing a different `GuardSkin` — see `Drone.ts`.
- **Orderly** (84x84) — a human orderly in a utility jumpsuit carrying a
  diagnostic tablet. Only `idle` and `walk` were generated (character
  template mode, all 8 directions each in one call — a bystander has no
  run/crouch; `public/assets/orderly/`, manifest at
  `public/assets/orderly/manifest.json`, mapped by `OrderlyAnimations.ts`).
