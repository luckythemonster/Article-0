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
| Shift | Sneak — slower, quieter, harder to spot |
| Space | Run — faster but louder |

Walk into a guard's yellow vision cone with a clear line of sight and the
detection meter fills; fill it completely and the base goes to **ALERT** (the
cone turns red, a `!` appears, guards converge on your last known position).
Break line of sight and it decays back through **EVASION** to **INFILTRATION**.
Standing in a light pool fills the meter faster; standing on cover slows it.

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
  animated character sprite) and `Enforcer` (patrol + wall-clipped vision cone
  + per-guard detection meter, animated scanner-drone sprite).
- **`src/systems/`** — `CollisionGrid` (wall grid + line-of-sight raycast),
  `DetectionSystem` (light/cover modifiers), `AlertState` (the
  INFILTRATION → ALERT → EVASION FSM), and `EntityStats` (engine-side default
  tuning per entity type).

The gameplay numbers live in `EntityStats.ts` because the map author left the
per-entity fields at their defaults — override any of them in the map and the
engine will use that value instead.

## What's implemented (Phase 1 — playable vertical slice)

- Parse `edplay.json` into a normalized model and register sprite frames.
- Render `main1` from the real spritesheets, in correct layer order.
- Player: free 8-directional movement, wall collision, sneak/run stances,
  animated character sprite (idle/walk/run/crouch, 4-direction).
- Guards: patrol, wall-clipped vision cones, per-guard detection, animated
  scanner-drone sprite (idle/patrol scan cycle, 4-direction).
- Stealth: light/cover detection modifiers, global alert FSM, HUD.

## Roadmap

2. **The rest of the complex** — render/play `duct1`, `duct2`, `main2`, with
   transitions through `stairs` and `maintenance_access` hatches; a
   Soliton-style radar minimap.
3. **Interactables** — hackable `terminal`s, keyed/stateful `door`s, `power`
   breakers that cut lights and sensors, `chest`/item pickups, `audio_hazard`
   noise traps (loose grates, steam).
4. **More threats & the RPG layer** — `orderly`/`drone`/`security` enemy types,
   `sensor` cameras, thermal detection, inventory, and alert-network stats.

## Project layout

```
public/assets/          edplay.json + spritesheet_{0,1,2}.png (extracted from the zip)
public/assets/player/   player character frames (see below)
public/assets/enforcer/ enforcer drone frames (see below)
src/main.ts         boot: load assets, parse map, start scenes
src/map/            format types, loader, sprite atlas
src/scenes/         GameScene, UIScene
src/entities/       Player, Enforcer, PlayerAnimations, EnforcerAnimations
src/systems/        CollisionGrid, DetectionSystem, AlertState, EntityStats
src/ui/             Hud
```

## Character & enemy art

Both were generated with [PixelLab.ai](https://www.pixellab.ai/) (high
top-down templates) and pulled in via its API:

- **Player** ("Rowan Ibarra", 64x64) — idle/walk/run/crouch cycles in 4
  cardinal directions (`public/assets/player/`, manifest at
  `public/assets/player/manifest.json`). `PlayerAnimations.ts` maps that frame
  layout to Phaser animation keys.
- **Enforcer** ("Enforcer", 68x68) — a tracked security drone with a
  swiveling floodlight/sensor arm; its "apprehend" cycle (the arm sweeping
  left-right) doubles as the patrol-scan animation, sped up while pursuing
  (`public/assets/enforcer/`, manifest at
  `public/assets/enforcer/manifest.json`). `EnforcerAnimations.ts` maps the
  frames to Phaser animation keys.

Both only exported 4 cardinal directions, so diagonal movement stays free
8-directional while each sprite's *visual* facing snaps to the nearest
cardinal — a standard convention for 4-direction character sheets.
