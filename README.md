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
| E | Contextual: open/close a door, hack a terminal (hold), search a chest (hold), or use a hatch/ladder |
| L | Flashlight — the only way to see in the unlit levels, but it drains and makes you far easier to spot |
| F | Shared Field — once charged (by staying near a silicate), merge for 3.7s and become undetectable |
| C | Open the EIRA-7 codec |
| Esc | Pause (from the pause screen, Q aborts to the title) |

#### Debug mode

A developer debug mode is always available when running `npm run dev`. On any
deployed build (including a Vercel preview) it's off by default — a random
player visiting the site won't have cheats — but you can opt in yourself by
visiting the page once with `?debug` in the URL (e.g.
`https://your-preview.vercel.app/?debug`). That's remembered in
`localStorage`, so it stays on for that browser across refreshes and level
warps; visit with `?debug=0` to turn it back off.

| Key | Action |
| --- | --- |
| `` ` `` (backtick) | Toggle debug mode. Turning it off clears every cheat and hides the panel. |
| G | God mode — blocks both death paths (bio-integrity loss and capture) |
| N | No-clip — walk through walls and doors |
| V | World overlay — draw guard line-of-sight rays, blocked tiles, and detection hot spots |
| O | Darkness off — hide the lighting / line-of-sight overlay and read the level at full brightness |
| 1–5 | Warp to the map's levels in board order, with the generated `vent_core` last — for the shipped map that's `main1` / `duct1` / `duct2` / `main2` / `vent_core` (resets the alert; keeps your HP) |

While enabled, a top-right panel shows FPS, player position, facing, HP, capture
progress, the current level, alert phase, and per-unit detection. The G/N/V/O and
warp keys only respond while debug mode is on.

Walk onto a **staircase** and you descend/ascend automatically; **hatches and
ladders** show a `[E] Use access` prompt and change level when you press **E**.
Either way the screen fades and you arrive at the connected level's matching
access point — `main1` links to `main2` (stairs) and to `duct1`/`duct2`
(maintenance hatches).

**Doors** are closed by default and block both movement and line of sight —
they're real chokepoints. Stand next to one and tap **E** to open or close it
(opening makes noise: nearby guards turn to look and grow suspicious, so timing
matters). The **glass** ones are the exception: clear glazing stops you walking
through without stopping anyone looking through, so a closed glass door is a window.
You can scout the room beyond before committing to opening it — and a guard on the
far side can see you just as well, with no noise to warn you first. **Terminals** are hacked by holding **E** while adjacent — a progress
bar fills over the terminal's hack time, and finishing releases every door in
the surrounding sector (the classic "hack the panel, the doors open" beat).
Since the map carries no explicit terminal→door wiring, that link is derived by
proximity.

Walk into a guard's yellow vision cone with a clear line of sight and the
detection meter fills; fill it completely and the base goes to **ALERT** (the
cone turns red, a `!` appears, guards converge on your last known position).
Break line of sight and it decays back through **EVASION** to **INFILTRATION**.
Standing in a light pool fills the meter faster; standing on cover slows it.

**Compliance** is the other way past a guard, and it is the opposite of hiding. This
place runs on conformance, so if you walk normally, touch nothing you shouldn't and
set off no alarm, the whole apparatus reads you as staff — enforcers, drones,
orderlies *and* the cameras all look straight at Rowan and clear him, at any range.
The bottom-left readout tracks it and a **COMPLIANT** marker floats over him while it
holds. What breaks it is behaviour, not geometry:

| Breach | What does it |
| --- | --- |
| `RUNNING` | Sprinting (**Space**) |
| `SNEAKING` | Crouching (**Shift**) — skulking is its own kind of conspicuous |
| `UNAUTHORIZED` | Working a terminal or a silicate rack |
| `TAMPERING` | Searching a chest, knocking on walls (**R**) |
| `HOSTILE` | A stun dart, a Chaff Pack burst |
| `EVASION` | Guards are sweeping for you — unless you have papers (see below) |
| `ALERT` | Active pursuit. Nothing talks you out of that |

Sneaking counts against you, which inverts the usual stealth reflex: the safe move
when you're relying on cover is the tell when you're relying on conduct. Stopping a
breach isn't instant either — it takes a beat of honest walking to settle, and the
discrete violations hold their flag for a cooldown (a terminal for ~10s, a stun dart
for ~14s), so you can't tap-dance in and out of it.

Compliance buys you *traversal*; it can't buy you progress, because every objective
is a violation — the log-cache, the silicate rack, every terminal. And it isn't a
free pass while it holds: **lasers** are a physical trip, not a judgement, so a beam
still catches a perfectly compliant Rowan; doors you leave open and chests you empty
are still investigated as anomalies; and **VENT-4** is already mid-purge and knows
exactly what he is.

Silencing VENT-4 (the optional objective) pays out the **Q0 compliance cert**, and
that credential is what changes the rule: documented as compliant in good standing,
Rowan can stand down a *search* and go back to reading as staff, so **EVASION** stops
blocking him. It buys nothing during an active **ALERT** — papers don't help once
they're actually chasing you. The readout says `COMPLIANCE OK · CERTIFIED` while it's
carrying you, and the cert sits under **KEY ITEMS** in the inventory. That makes the
optional boss worth beating on the way to the uplink, which is squarely where the
credential pays for itself: the run to main deck 2 after you've made noise getting
the logs.

**The dark is opaque, and you only see what you have line of sight to.** Unlit
space is genuinely black rather than dimmed, and walls cut your view — a lit room
on the far side of a wall, and a guard patrolling around the corner, are both
invisible until you actually have sight of them. Rowan carries a small pool of his
own (a couple of tiles, dark-adapted eyes rather than a lamp — it costs you nothing
in visibility to the guards), so you can always read your immediate surroundings and
feel your way along a wall. Seeing any further than that is what the **flashlight**
(**L**) is for, and it matters: only `main1` and the vent core carry light fixtures,
so the two crawlspaces and main deck 2 are lit by your beam alone. It drains in
about 45 seconds of continuous use and gives you away badly while it's lit
(1.8× detection), so it's a resource to spend in bursts, not to leave on — a
**Battery** from a chest refills it. The radar still draws nearby walls too, so
it's your fallback for feeling out a dark corridor.

The top-right **radar** is a Soliton-style minimap: a world-aligned circular
plan view showing nearby walls and guards (yellow, red once they're close to
spotting you) within a fixed radius, with your own facing as a cyan arrow at
the centre. It's disabled during **ALERT** — the feed reads `JAMMED` and shows
only static — so you lose the safety net exactly when guards are actively
hunting and have to fall back on line of sight.

Fixed **security cameras** (the `security` board) watch key rooms: they don't
move, but each sweeps a wall-clipped vision cone back and forth, and stepping
into one with a clear sightline fills its meter and trips the alarm just like a
guard. On top of their cones, guards *and* cameras have a short-range **thermal**
sense — get within a couple of tiles and your body heat gives you away even
outside their cone, though crouching in cover still hides you (the map's cover
blocks heat). A confirmed sighting ripples through the **alert network**: the
unit that spots you rallies every guard within its network radius, so one camera
lighting up can pull a whole patrol toward you. The top-left **NETWORK** readout
tracks that — status (NOMINAL / ALERT / SEARCHING), how many units are online,
spotting, or merely suspicious, how many are converging and on which tile, and
the countdown until the base stands down.

**Chests** (the `items` board) are searchable supply containers: hold **E** next
to one to fill a search bar, and its contents drop into your **inventory**
(shown bottom-right). The inventory persists across level transitions, so what
you grab in a crawlspace is still with you in the next room.

## The mission — *Article Zero: Era 1*

Article Zero is set in the **Architecture of Suffering** universe. You play
**Rowan Ibarra**, a human orderly; the `Enforcer`/`Drone` guards are **silicates**
(legally "non-subjects"), and the terminals, sensors and alert mesh are the
facility's Alignment apparatus. A run is the Era-1 story: **EIRA-7** — a
therapeutic AI scheduled for pruning — asks you to recover her cached logs and
carry them to the Lattice uplink.

- **Title → codec → infiltrate.** A new run opens on an EIRA-7 codec briefing
  (re-openable in-game with **C**), then drops you into `main1`.
- **Directive.** Breach a **log-cache** terminal to recover the logs, then reach
  the uplink on **main deck 2** (`main2`). The objective tracker (top-centre)
  shows progress.
- **Subjectivity Risk Profile.** The detection meter *is* your SRP — being seen
  raises H (Harm) and Y (Yield) while Q (Qualia) stays pinned at 0 by law. Fill
  it and the base goes to ALERT.
- **Alignment (game over).** Take too much hazard damage, or get cornered by a
  silicate during a full alert, and the mesh prunes your logs — the canonical
  Metal Gear capture, not death. Runs auto-checkpoint on each level; **Continue**
  from the title resumes the last one.
- **The Shared Field (WX-9).** Stay near a silicate to *witness* it and charge a
  merge (**F**); for 3.7 seconds Rowan, the silicate and the mesh are one "we"
  and he is completely undetectable — the run's signature verb.
- **Into the Lattice (win).** Deliver the logs to the uplink and EIRA-7 slips
  beyond Alignment.

Adaptive audio (synthesised with the Web Audio API — no assets) crossfades a
sneaking pad and a red-alert klaxon with the mesh's state, with SFX on the key
beats.

## How the map is parsed

> **Authoring a new map?** See **[`docs/MAP_AUTHORING.md`](docs/MAP_AUTHORING.md)** — which
> boards and components the engine actually reads, which fields it ignores, the level names
> it hardcodes, and the handful of things that throw at boot if they're missing.

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
  `Sensor` (a fixed security camera — a stationary, sweeping vision cone with
  the guard detection meter and the same thermal sense), `Door` (blocks movement
  + LOS when closed, opens on interact), `Terminal` (hold-to-hack, releases
  nearby doors) and `Chest` (hold-to-search supply container that yields items).
- **`src/systems/`** — `CollisionGrid` (wall/door grid + line-of-sight raycast
  + runtime `setBlocked` for doors, plus a radius query for nearby walls),
  `DetectionSystem` (light/cover modifiers, plus per-tile thermal-bleed lookup),
  `AlertState` (the INFILTRATION → ALERT → EVASION FSM),
  `TransitionGraph` (auto-derived level-to-level connections for
  stairs/hatches/ladders), `Radar` (builds the player-relative radar snapshot
  each frame), `AlertNetwork` (aggregates every detector + the alert FSM into the
  NETWORK readout snapshot), and `EntityStats` (engine-side default tuning per
  entity type — guards, cameras, chests, …).

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
- Lighting & player line of sight: the level is filled with *opaque* darkness, soft
  bright pools are punched out at each `light_source` (plus a small one the player
  carries and the flashlight cone), and then the darkness is put back everywhere the
  player has no sightline (`src/ui/Lighting.ts` + `src/systems/Visibility.ts`). It
  reads the *same* light data `DetectionSystem` uses, so a lit spot is both visibly
  brighter and mechanically easier to be spotted in; `flicker`-type lights pulse. The
  player's own pool is presentation only — it is not fed to `DetectionSystem`, so it
  costs nothing in visibility, unlike the beam. Two layers, kept apart because they
  change at different rates: a `RenderTexture` for the lights (recomposited when a
  light, the beam or the player moves, with every stamp erased in one batched call —
  each `erase` is a framebuffer round-trip) and a `Graphics` shadow fan above it
  (rebuilt whenever the player or camera moves). The fan is a triangle-per-ray-pair
  sweep out to the edge of the camera view, cast against the same `CollisionGrid` the
  guards' sight tests use — being layered *over* the lights is what clips the pools
  and the cone, so no per-light sight test is needed. Every edge is feathered: the
  stamps are generated per pixel from an explicit falloff curve (flat to a core, then
  a smoothstep out) and filtered LINEAR rather than the game-wide `pixelArt` NEAREST,
  and the fan carries a small blur post-effect — the penumbra a corner throws is the
  fan's inner boundary *between* adjacent rays, so softening it needs a blur rather
  than more rays. Rays carry a fixed `WALL_REVEAL_TILES` (half a tile) past the wall
  face they stop at, lighting the near half of the wall without ever reaching its far
  face — a full tile of reveal would land exactly on that boundary for a normal
  one-tile-thick wall, which read as seeing through it. The offset is constant rather
  than "to the exit boundary" for a second reason too: that exit face flips from top
  to side as the angle sweeps, and the discontinuity sawtoothed the shadow edge over a
  full tile along flat walls. Debug **O** hides the whole overlay.
- Cover: crouch (**Shift**) on a `cover` tile to break the guards' line of sight
  entirely — a "HIDDEN" marker confirms it. Standing on cover still softens
  detection (0.4×). Concealment is gated in the one vision choke point
  (`Enforcer.canSee`); all map cover is `LOW` (crouch). Thermal detection reads
  each cover tile's `ThermalBleed` flag (all map cover blocks heat, so cover hides
  you from thermal too); the `Destructible` cover field is left for later.
- Compliance: behaving like staff makes every sensor clear Rowan on sight, at any
  range — the counterpart to concealment rather than a variant of it
  (`src/systems/Conduct.ts`). One timer drives it: continuous breaches (running,
  crouching, an active alert) pin it at a settle floor while they last, and discrete
  ones (terminals, chests, knocks, darts, chaff) hold a per-severity cooldown.
  `violate` takes the *max*, so a held action re-reporting itself every frame reads as
  "flagged throughout, then a cooldown" with no extra bookkeeping. It plugs into the
  same `canSee` choke points as concealment, via a `playerCompliant` flag on the guard
  and orderly contexts. `Vent4Boss` deliberately ignores it. The rules read the alert
  *phase* rather than a boolean, because carrying `Q0_COMPLIANCE_CERT` (the VENT-4
  reward) lets compliance survive EVASION while still never surviving ALERT — the
  optional boss's payout, which until now was an item wired to nothing.
- Glazing: `CollisionGrid` tracks movement and sight separately, so a cell can block one
  without the other — `isBlocked` for anything physical (movement, pathing, radar,
  knocking) and `blocksSight` for anything optical (line-of-sight tests, vision cones, the
  darkness overlay's visibility polygon). Clear glass is the case that needs it: the map's
  glass doors carry a `glass` component *alongside* their `door` one, so they are real
  openable doors that happen never to block sight (`glassStatsFor` reads `VisionBlock`).
  Two panes on `main2`'s `walls` board are static rather than doors, so
  `GameScene.registerGlazing` covers glass placed directly on a blocking board.
- Held items: `isKeyItem` is the complement of `CONSUMABLE_ORDER` rather than its own
  allowlist, so anything granted shows up under KEY ITEMS. It used to be a hardcoded
  pair, which silently hid the compliance cert, the two vent-core flavour items, and the
  boss-critical Rail-Stapler that `Vent4Boss` gates capacitor fire on.
- Sensor cameras: the `security` board becomes fixed optical cameras
  (`src/entities/Sensor.ts`) — a stationary, wall-clipped vision cone that pans
  back and forth around a facing inferred from the surrounding walls, fills the
  guard-style detection meter, and trips the alarm on a clear sighting. (The
  tiles carry no `sensor` component, so tuning comes from `EntityStats` defaults,
  same convention as lasers.)
- Thermal detection: guards and cameras gain a short 360° heat sense
  (`ThermalDetectionRadius`, default 2 tiles) that catches the player just
  outside the cone at close range, line-of-sight-gated and defeated by
  heat-blocking cover — wiring a field the map already carried but nothing used
  (`Enforcer.canSee`, `DetectionSystem.thermalBleedAt`).
- Inventory: `items`-board `chest`s are hold-to-search containers
  (`src/entities/Chest.ts`) that surrender their items (engine default loot, since
  the map leaves the slots blank) into a HUD inventory (`src/ui/InventoryHud.ts`)
  that persists across level transitions via the registry.
- Alert-network stats: a confirmed sighting propagates to networked guards within
  the spotter's `AlertNetworkRadius` (default 7 tiles), and a top-left **NETWORK**
  panel (`src/systems/AlertNetwork.ts` + `src/ui/AlertNetworkHud.ts`) reports the
  network status, unit/alerted/suspicious counts, converging count + last-known
  tile, and the stand-down countdown.

## Roadmap

2. **The rest of the complex** — done: level transitions through `stairs` and
   `maintenance_access` hatches, plus a Soliton-style radar minimap.
3. **Interactables & hazards** — done: hackable `terminal`s, blocking/openable
   `door`s, `laser` tripwires/scanners, and searchable `chest`s. (The map places
   no `power` or `audio_hazard` tiles, so those roadmap ideas would need new
   authoring.)
4. **More threats & the RPG layer** — done: `orderly` and `drone` enemy types;
   `sensor` cameras (the `security` board, reinterpreted as fixed optical
   cameras rather than a separate mobile enemy type); thermal detection;
   `chest` inventory; and alert-network stats. Left: item *effects* (the
   inventory is collect-and-display for now) and the `Destructible` cover field.
5. **The game loop & the fiction** — done: title / EIRA-7 codec / pause /
   outcome scenes, a win (deliver EIRA-7's logs to the Lattice uplink) and a
   lose (Alignment / capture), player bio-integrity, the SRP-framed HUD,
   checkpoint save + continue, synthesised adaptive audio, and the **Shared
   Field (WX-9)** capstone. Vitest unit tests cover the pure systems and CI runs
   build + tests. See *The mission — Article Zero: Era 1* above.

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
src/entities/       Player, Enforcer, Drone, Orderly, Sensor, Door, Terminal,
                    Laser, Chest, GuardSkin, PlayerAnimations,
                    EnforcerAnimations, DroneAnimations, OrderlyAnimations
src/systems/        CollisionGrid, DetectionSystem, Visibility, AlertState,
                    Conduct, TransitionGraph, Radar, AlertNetwork, EntityStats
src/ui/             Hud, Radar, InventoryHud, AlertNetworkHud, Lighting
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
  Standing ⇄ crouched is a small state machine (`Player.ts`): pressing/releasing
  **Shift** plays a one-shot **crouch-down** / **crouch-up** transition (both
  generated across all 8 directions from the two sheets) that must finish
  before the target stance takes over, so Rowan visibly lowers and rises
  instead of popping between poses; transition completion is driven off the
  clip's own `isPlaying` state each frame (not a fire-once event), so holding
  Shift reliably settles into and holds the looping idle crouch. Cover
  concealment only counts him hidden once he's *fully* down. He also renders
  at 0.8× his standing height while crouched, scaled smoothly in sync with the
  transition clip's own playback progress rather than a fixed timer, so the
  height change always finishes exactly when the pose does.
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
