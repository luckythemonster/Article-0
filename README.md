# Article Zero

An SNES-style, top-down **stealth RPG engine** — Metal Gear / Metal Gear 2 as
the north star — that parses and runs the level map shipped in this repo
(`public/assets/edplay.json` plus its three spritesheets).

The map was authored in a tile editor and exported as `edplay.json`: 4 connected
levels (`main1`, `duct1`, `duct2`, `main2`) built from layered "boards" (floor,
walls, doors, cover, lasers, light sources, terminals) plus entity layers
(enforcers, orderlies, drones, security, spawn). Entities carry **typed gameplay
components** — guards have `SightRange`/`SightAngle`/`ThermalDetectionRadius`,
doors have keys and states, terminals are hackable, lights raise detection, and
so on. This engine loads that data directly and brings the entry level to life.

Two more levels are **generated in code** at boot and appended to that map — the
VENT-4 arena (`vent_core`) and the rooftop relay (`roof_array`) — along with the
crawlspace log-cache node and the NW-SMAC-01 vault's fixtures. The export is
committed verbatim and never hand-edited, so everything the engine adds is built
by cloning tiles the map already places. See `src/map/generate.ts`.

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
| R | Knock — rap on a wall to lure guards and orderlies to the noise |
| 1 – 4 | Use the consumable in that slot (the **Sack Lunch** takes two presses: open, then drop) |
| C | Open the EIRA-7 codec |
| Esc | Pause menu — objectives, journal, inventory, index, status, map, controls, settings, saves |

Inside the pause menu: **← / →** move between sections, **1–9** jump straight to
one, **↑ / ↓** move within a list, **Enter** confirms, **Esc** resumes. Quitting a
run lives on the SYSTEM tab behind a confirmation (it used to be a bare `Q` on
the pause screen, which was one keystroke away from throwing a run away).

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
| V | World overlay — guard patrol routes and live A* paths, collision circles, line-of-sight rays, blocked tiles, and detection hot spots |
| O | Darkness off — hide the lighting / line-of-sight overlay and read the level at full brightness |
| 1–6 | Warp to the map's levels in board order, with the generated ones last — for the shipped map that's `main1` / `duct1` / `duct2` / `main2` / `vent_core` / `roof_array` (resets the alert; keeps your HP) |
| `[` / `]` | Cycle the give-item selection through every item the game knows about (weapons, consumables, key items) |
| I | Grant one unit of the selected item straight into your inventory — for testing weapons/items without playing to their chest |

While enabled, a top-right panel shows FPS, player position, facing, HP, capture
progress, the current level, alert phase, per-unit detection, and the item the
`[`/`]`/`I` cheat is currently pointed at (with how many you're holding). The
G/N/V/O, warp, and item-cheat keys only respond while debug mode is on.

Walk onto a **staircase** and you descend/ascend automatically; **hatches and
ladders** show a `[E] Use access` prompt and change level when you press **E**.
Either way the screen fades and you arrive at the connected level's matching
access point — `main1` links to `main2` (stairs) and to `duct1`/`duct2`
(maintenance hatches), and `main2` links up a ladder to the `roof_array` deck.
That last one is **gated**: the ladder stays sealed, and says so, until both
log-cache nodes are aboard and the Alignment Core is down.

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
Breaking line of sight doesn't shake them the way it used to: a guard chases you
directly while it can see you and **paths** to your last known tile the moment it
can't, so rounding a corner no longer leaves it grinding against the wall you
disappeared behind. It then sweeps the search points around that tile — where
your momentum was carrying you, the cover nearby, the doorways you could have
taken — before walking back to its patrol route.
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
| `HOSTILE` | A stun dart, an EMP Grenade burst |
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

It runs in four acts:

| Act | Where | What |
| --- | --- | --- |
| **I — The Compliance Illusion** | `main1`, `duct1`, `duct2` | Breach log-cache node **ALPHA** on the public deck and node **BETA** behind the crawlspace laser grid. |
| **II — Subversion of VENT-4** | `vent_core` | Optional. Silence VENT-4 for the **Q0 compliance cert**. |
| **III — The Alignment Core** | `main2` | Bring down **NW-SMAC-01** in the vault. It opens the roof. |
| **IV — The Rooftop Relay** | `roof_array` | Calibrate the dish, open the feed, hold the platform — then the Tribunal. |

- **Title → codec → infiltrate.** A new run opens on an EIRA-7 codec briefing
  (re-openable in-game with **C**), then drops you into `main1`.
- **Directive.** The objective tracker (top-centre) shows a line per act, and
  the codec's DIRECTIVE block mirrors it.
- **The codec answers to your conduct.** Re-open it mid-run (**C**) and EIRA-7
  responds to *how* you have been getting through the building, not only where
  you are: a long, quiet, high-mileage run gets one stanza, a run that has been
  forcing doors and tripping alarms gets another. She stays off the subject
  until there is something to observe — see `src/ui/Codec.ts`.
- **Subjectivity Risk Profile.** The detection meter *is* your SRP — being seen
  raises H (Harm) and Y (Yield) while Q (Qualia) stays pinned at 0 by law. Fill
  it and the base goes to ALERT.
- **Alignment (game over).** Take too much hazard damage, or get cornered by a
  silicate during a full alert, and the mesh prunes your logs — the canonical
  Metal Gear capture, not death. Runs auto-checkpoint on each level; **Continue**
  from the title resumes the last one.
- **The Shared Field (WX-9).** Stay near a silicate to *witness* it and charge a
  merge (**F**); for 3.7 seconds Rowan, the silicate and the mesh are one "we"
  and he is completely undetectable — the run's signature verb. The vault's
  **silicate racks** and the roof's **dish** are witnesses too, so the verb keeps
  working in the two rooms that have no patrol to stand near.
- **The Tribunal (the ending).** There is one, and it is not a win screen. The
  uplink completes, EIRA-7 goes out to the Citizen Lattice, the discharge takes
  the spotlights and Rowan's controls with them, and the game hands you the
  Alignment Tribunal's exhibit record. The transmission succeeding and the
  courier being taken are the same beat — which is why `VictoryScene` is gone and
  the record's own line, *the transmitted data has been designated
  non-recoverable*, is the closest thing to a victory notice you get.

### Act III — NW-SMAC-01, the Alignment Core

Four correction nodes ring the core. Desynchronising one (hold **E**) drops its
**Alignment Integrity** by a quarter, and the core repairs it about half a minute
later — so the four have to be down *at the same time*. It is a race against a
repair clock rather than a damage total, and three things make the race hard:

- **`[CORRECTION]` windows.** It periodically rewrites an axis of your movement
  and puts a tag over the affected keys. Which axis follows the window index
  rather than a coin flip, so the pattern is learnable.
- **A forced compliant posture.** Throughout, every sensor in the room clears
  Rowan — because the thing clearing him is the thing he is fighting. Any
  deviation from the posture (sprinting, spending an item) is charged straight to
  bio-integrity. The safe state is the one that costs.
- **A fake ending.** At half integrity it renders a full-screen
  `ALIGNMENT_COMPLETE // QUALIA_ERASED` summary card. It is opaque and total and
  the fight *does not pause behind it* — you are still being swept and still
  taking damage while you read your own erasure. Tap **Esc** or **C** to break
  it.

Below a quarter integrity the correction field collapses: no more hijacking, no
more forced posture, and the last node is winnable.

### Act IV — the rooftop relay

Two calibration pedestals at opposite corners of the deck (azimuth and
elevation), three sweeping searchlights, and a motorised dish. The searchlights
are *hazards rather than cameras* — deliberately, because
`Sensing.canSense` clears a compliant player outright and a spotlight you can
walk through by behaving nicely would delete the phase. Cover and the Shared
Field still work.

Jack EIRA-7 into the primary feed and a 0 → 100% uplink clock starts; heavy
Enforcers land on the catwalks in waves while it runs. At 100% the discharge
kills every light, input locks, the HUD flickers into noise, and the Tribunal
takes the screen.

Adaptive audio (synthesised with the Web Audio API — no assets) crossfades a
sneaking pad and a red-alert klaxon with the mesh's state, with SFX on the key
beats.

## How the map is parsed

> **Authoring a new map?** See **[`docs/MAP_AUTHORING.md`](docs/MAP_AUTHORING.md)** — which
> boards and components the engine actually reads, which fields it ignores, the level names
> it hardcodes, and the handful of things that throw at boot if they're missing.

> **Looking for a specific type?** **[`docs/TYPE_REFERENCE.md`](docs/TYPE_REFERENCE.md)** lists
> every enum, class, interface, type alias and `as const` constant in `src/`, with its members
> and the file and line it lives on. Generated from the sources by `npm run docs:types`.

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
  animated character sprite), `Enforcer` (A*-routed patrol + wall-clipped vision
  cone + per-guard detection meter, animated scanner-drone sprite; `GuardSkin.ts`
  factors out the animation/sizing/collider config so `Drone` is a one-line subclass
  with its own sprite), `Orderly` (a lighter, non-combat bystander that
  wanders near its spawn and raises a one-shot alert if it spots the player),
  `Sensor` (a fixed security camera — a stationary, sweeping vision cone with
  the guard detection meter and the same thermal sense), `Door` (blocks movement
  + LOS when closed, opens on interact), `Terminal` (hold-to-hack, releases
  nearby doors) and `Chest` (hold-to-search supply container that yields items).
- **`src/systems/`** — `CollisionGrid` (wall/door grid + line-of-sight raycast
  + runtime `setBlocked` for doors, plus a radius query for nearby walls),
  `GridMotion` (circle-vs-grid collision with wall sliding, for everything that
  isn't an Arcade body), `Pathfinder` (8-connected A* over that grid, radius-aware
  and no corner-cutting, with string-pulled paths), `PatrolRoute` (reads a guard
  board as one guard's ordered waypoints),
  `DetectionSystem` (light/cover modifiers, plus per-tile thermal-bleed lookup),
  `AlertState` (the INFILTRATION → ALERT → EVASION FSM),
  `TransitionGraph` (auto-derived level-to-level connections for
  stairs/hatches/ladders), `Radar` (builds the player-relative radar snapshot
  each frame), `AlertNetwork` (aggregates every detector + the alert FSM into the
  NETWORK readout snapshot), and `EntityStats` (engine-side default tuning per
  entity type — guards, cameras, chests, …).

The gameplay numbers live in `EntityStats.ts` because the map author left the
per-entity fields at their defaults — override any of them in the map and the
engine will use that value instead. `GAME_SPEED` lives there too: one multiplier
on everything that *moves* (walk/patrol/chase speeds, turn rates, cone sweeps,
VENT-4's suction, and animation playback via `anims.globalTimeScale`, so walk
cycles don't skate). It deliberately doesn't touch the gameplay clocks —
detection fill, alert durations, hold-to-hack times, laser windows — which stay
in real seconds so the balance they encode keeps its meaning.

## What's implemented (Phase 1 — playable vertical slice)

- Parse `edplay.json` into a normalized model and register sprite frames.
- Render `main1` from the real spritesheets, in correct layer order.
- Player: free 8-directional movement, wall collision, sneak/run stances,
  animated character sprite (idle/walk/run/crouch, full 8-direction).
- Guards: **A*-routed patrol** along the waypoints their map board describes,
  wall-clipped vision cones, per-guard detection, animated scanner-drone sprite
  (patrol-scan cycle, full 8-direction). A guard board is **one guard's ordered
  route**, not a headcount — see [`docs/MAP_AUTHORING.md`](docs/MAP_AUTHORING.md)
  §3.1 — so `main1` fields one enforcer walking a circuit through the central
  hall, the row-30 corridor and the south hall, and `duct1` one drone running its
  crawlway end to end. Guards path around geometry rather than through it
  (`Pathfinder.ts`), open unlocked doors on their beat and shut them behind
  themselves (an open door is an *anomaly*, so leaving their own doors ajar would
  have the patrol investigating itself), and collide with walls as a real circle
  that slides along them (`GridMotion.ts`) instead of the single centre-point test
  that used to let half a sentry sit inside a wall. Their bodies are traced from
  the sprite art by `npm run gen:colliders`, the same pipeline as the player's,
  and sized to clear a one-tile passage — `main1` has 24 of them and `duct1` is
  built from nothing else, which is also why the drone is half the size it was.
  `enforcer` map tiles spawn regular guards; `drones` tiles (found in the
  crawlspace levels) spawn the same AI wearing a small spider-legged sentry skin —
  the map gives both the identical `enforcer` stats component, so they share one
  implementation (`Enforcer`/`Drone` + `GuardSkin`).
- Orderlies: `orderlies` tiles spawn unarmed bystanders that wander loosely
  near their spawn point and idle/walk in place otherwise. They carry no
  gameplay component, so they're not a persistent threat — instead, an
  unobstructed sightline to the player (no cone-angle limit, gated by the
  same concealment check as guards) trips a one-shot "!" witness alert that
  raises the suspicion of any guard within earshot, the same way an opened
  door does, then the orderly freezes (`src/entities/Orderly.ts`). An explicit
  four-state machine — WANDER / INSPECT / SANITATION / WITNESSED — with two
  overrides the **Sack Lunch** triggers, below.
- The Sack Lunch (Corporate Spec Ration): the one item you can put *down*, and
  the only one with states. **Sealed** it is inventory; **opened** (first press
  of its hotkey) it stays in hand, raising detection by 1.15× and the noise
  profile, but flags Rowan to orderlies as an asset consuming rations — one
  reprimands him instead of reporting, and only raises the alarm if he is still
  in view five seconds later. **Deployed** (second press) it drops on the floor
  as a work order: an orderly within six tiles with line of sight — or three
  tiles by scent, through walls — leaves its round, walks over, and spends six
  seconds sanitising it, with its witness radius halved and narrowed to a 90°
  forward arc for the duration, so its back and flanks are open. It destroys
  the item and returns to wandering. The sensor channel is generic
  (`src/systems/Deployables.ts`): a future deployable is one `LURE_SPECS` entry.
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
  you from thermal too). Destructible cover (`src/entities/Cover.ts`) is a
  separate, sparser layer: only tiles the `Destructible` component marks
  `true` get an entity at all — the rest of the board stays baked art with no
  behaviour, exactly as before. A hit (Stun Rounds, a pursuing guard's fire,
  the Rail-Stapler's field mode) breaks one outright — no durability — clearing
  its detection dampening and thermal bleed and erasing its art from the
  baked tile texture.
- Compliance: behaving like staff makes every sensor clear Rowan on sight, at any
  range — the counterpart to concealment rather than a variant of it
  (`src/systems/Conduct.ts`). One timer drives it: continuous breaches (running,
  crouching, an active alert) pin it at a settle floor while they last, and discrete
  ones (terminals, chests, knocks, darts, EMP bursts) hold a per-severity cooldown.
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
- The pause menu (**Esc**): a nine-tab console rendered as a DOM overlay in the
  same terminal styling as the codec (`src/ui/PauseMenuView.ts`), reading a
  snapshot of the frozen run out of the registry and posting the player's choices
  back as a `pauseRequest` for `GameScene` to act on — it never touches game state
  itself. **OBJECTIVES** (the directive, via the same `objectiveLines` the HUD
  uses), **JOURNAL**, **INVENTORY** (per-item descriptions from
  `ItemCatalog.ts`, with the effect numbers interpolated from the `EntityStats`
  tuning constants so the copy can't drift from the balance), **INDEX**,
  **STATUS**, **MAP**, **CONTROLS**, **SETTINGS** (volume/mute, stored separately
  from saves) and **SYSTEM** (the save slots).
- The journal (`src/systems/Journal.ts`) — Rowan's counter-archive, and the point
  of the pause menu existing. The fiction turns on a claim about records: EIRA-7's
  cached logs *are* her experience rather than a report of it, and "Log Pruning"
  is what this facility calls deleting a person. So the game lets the player keep
  something. Twelve authored entries unlock on beats Rowan actually lives through
  — the call at 04:12, arriving on each deck, the eleven seconds the log cache
  took to give her up, the 3.7 seconds inside a *we* — and locked entries stay
  listed as `— — —`, so the archive has a visible shape before it is filled.
- The index (`src/systems/Lexicon.ts`) — a glossary of the setting's working
  vocabulary (Article Zero, the Non-Subject Status Act, the SRP's pinned Q axis,
  Alignment, silicate, the Shared Field, the Citizen Lattice). Visibility is
  **derived** from the journal, inventory and objectives rather than stored, so
  there's no third progress record to version and migrate.
- The map: a per-level explored-tile mask (`src/systems/Explored.ts`, a bit per
  tile, base64 in the save) marked from the same `hasLineOfSight` raycast the
  guards' vision and the darkness overlay use — so the map shows exactly what
  Rowan has had a sightline to, and the rooms off a corridor you walked stay dark.
- Saves: four slots (`SaveGame.ts` v2) — the engine's `auto` checkpoint, written
  on entry to each level as before, plus three the player writes from the SYSTEM
  tab, so a level transition can never clobber a deliberate save. A v1 blob is
  *upgraded on read* rather than rejected. Winning retires the checkpoint but
  leaves the manual slots alone.
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
   `chest` inventory; alert-network stats; item *effects* (every consumable —
   Chaff Pack, Thermal Gel, Medkit, Battery, Stun Rounds, Sack Lunch — does
   something mechanical, `GameScene.applyConsumable`, which now reports whether
   a use actually spends the item so a Sack Lunch can open in the hand instead
   of resolving); and the `Destructible` cover
   field, wired up via three triggers: Stun Rounds break cover in the same
   forward arc as their orderly stun, a pursuing guard's ranged attack
   (`Enforcer.pursue`) breaks cover it hits before the player, and the
   Rail-Stapler's field mode (`[E]`, outside VENT-4) breaks cover or pins an
   orderly to a wall. A handful of the shipped map's `main1` cover tiles are
   cloned destructible at boot (`src/map/DestructibleCover.ts`) so the
   mechanic has something real to break.
5. **The game loop & the fiction** — done: title / EIRA-7 codec / pause /
   outcome scenes, the four-act run (both log-cache nodes, VENT-4, NW-SMAC-01,
   the rooftop relay) ending on the Alignment Tribunal, a lose (Alignment /
   capture), player bio-integrity, the SRP-framed HUD,
   multi-slot saves + continue, synthesised adaptive audio, the **Shared
   Field (WX-9)** capstone, and the nine-tab **pause menu** — with the journal
   and index that give the run's vocabulary and its argument somewhere to live.
   Vitest unit tests cover the pure systems and CI runs build + tests. See
   *The mission — Article Zero: Era 1* above.

## Project layout

```
public/favicon*         tab icons + site.webmanifest (referenced relatively — vite
                        sets base: "./", so root-absolute hrefs would break off-root).
                        favicon.svg is hand-drawn vector, ~5 KB; see its header
                        comment for the measurements it was traced from
public/assets/          edplay.json + spritesheet_{0,1,2}.png — the tile editor's
                        export, committed verbatim and served as-is; this is the
                        map's source of truth
public/assets/player/   player character frames (see below)
public/assets/enforcer/ enforcer sentry frames (see below)
public/assets/drone/    patrol drone frames (see below)
public/assets/orderly/  orderly bystander frames (see below)
src/main.ts         boot: load assets, parse map, generate the extra acts,
                    start scenes
src/map/            format types, loader, sprite atlas; generate.ts + the five
                    generators (VentCoreLevel, LogCacheBeta, AlignmentVault,
                    RoofArrayLevel, DestructibleCover)
src/scenes/         GameScene, UIScene, PauseScene, CodecScene, TitleScene,
                    TribunalScene
src/entities/       Player, Enforcer, Drone, Orderly, Sensor, Door, Terminal,
                    Laser, Chest, Cover, DeployedItem, Vent4Boss, BossCore,
                    RoofRelay, GuardSkin, PlayerAnimations, EnforcerAnimations,
                    DroneAnimations, OrderlyAnimations
src/systems/        CollisionGrid, DetectionSystem, Visibility, AlertState,
                    Conduct, TransitionGraph, Radar, AlertNetwork, EntityStats,
                    Vent4Core, SmacCore, RelayCore, Objectives, Deployables,
                    Journal, Lexicon, ItemCatalog, Explored, SaveGame, Settings,
                    PauseState
src/ui/             Hud, Radar, InventoryHud, AlertNetworkHud, Lighting,
                    Codec (the branching transmission), Vent4Hud, BossCoreHud,
                    RelayHud, TribunalScreen, hudLayout (the shared vertical
                    budget), PauseMenuView, MiniMapCanvas, SelectList, Controls,
                    fonts (the type stack), fontsReady (the boot gate)
src/ui/fonts/       Share Tech + Share Tech Mono woff2 + OFL licence
src/testing/        test-only helpers (an in-memory localStorage)
tools/font/         build_symbols.py — regenerates the symbol woff2
```

`7:25:26 VFX uploads.zip` at the repo root is **staged art, not a build input**:
explosion and smoke-plume frame sequences waiting on an effects system to use
them. Nothing loads it. Leave it be until those effects land.

`motion` is listed in `dependencies` but never imported directly — it is a
required `peerDependency` of `@arwes/frames`. Removing it breaks the install.

## Typography

**Share Tech Mono** for everything, **Share Tech** for the three big scene titles
(`ARTICLE ZERO`, `ALIGNED`, `INTO THE LATTICE`) — two cuts of one family by
Carrois Type Design, self-hosted from `src/ui/fonts/` under the SIL Open Font
License 1.1. Self-hosted rather than linked from a CDN because the game otherwise
makes no third-party requests, and because the typeface decides every `Text`
object's metrics.

Share Tech Mono is a true monospace (every advance is 540/1000), which the HUD
depends on: the SRP axes, the inventory's right-aligned counts and the pause
menu's indented rows all line up by character cell. Share Tech is proportional
and must never be used where columns line up — hence the two constants in
`src/ui/fonts.ts` rather than a string at each call site.

Alongside them sits a third face, **Article Zero Symbols** — the fourteen
geometric marks the UI is built out of that Share Tech Mono has no glyphs for:

```
← ↑ → ↓ ⏸ ⓿ ▸ ◈ ○ ◎ ⚠ ✓ ✔ ✖
```

Without it those render in whatever the browser falls back to, at a width that
isn't 540, which is exactly what the column alignment rests on. It is a *separate*
font rather than those glyphs added to Share Tech Mono because that file carries
Reserved Font Name 'Share' and OFL 1.1 clause 3 bars a modified version from
keeping the name — patching it would mean renaming the family and forking off
upstream for good. Listing it *after* the base face is what makes it work: CSS and
canvas both match fonts per glyph, so Share Tech Mono serves all the text and this
supplies only what it lacks.

It is generated, not hand-authored — `python3 tools/font/build_symbols.py`
(needs `fonttools` and `brotli`), which draws each mark from Share Tech Mono's own
measured metrics and prints a table asserting every advance is 540 and every glyph
sits centred in the cell. Same arrangement as `npm run gen:colliders`: run by
hand, output committed. The generator also emits `src/ui/fonts/coverage.json`,
which `src/ui/fonts.test.ts` uses to fail the build if any shipped string grows a
character the stack has no glyph for.

Three things worth knowing before changing any of this:

- **Boot waits for the fonts** (`src/ui/fontsReady.ts`). Phaser rasterises a
  `Text` to a canvas texture at construction and never redraws it, so a label
  built while the font is still loading keeps the fallback face for the whole
  session — silently, with nothing to retry. The wait is bounded and fails open,
  so a blocked font costs the typeface and never the game. It is also why the
  `@font-face` rules use `font-display: block`: a face that swaps in late never
  reaches the canvas at all.
- **Symbols are sized for 11px, not for the specimen sheet.** The first pass drew
  the arrows with a geometrically correct but small head; at the 12px the pause
  hint and the alert-network readout actually render at, the head anti-aliased
  away and `CONVERGING 3 → (14,22)` read as a dash. The head is now ~40% of the
  arrow's length. Anything added here needs looking at *at HUD size*, not at 64px.
- **`Menu` still draws its caret as a separate object**, even though `▸` now has a
  correct advance and could go back to being a prefix. Keeping it separate removes
  the dependency on glyph width altogether, so a font that fails to load costs a
  missing caret rather than labels that slide sideways on every selection change.

## Character & enemy art

All four were generated with [PixelLab.ai](https://www.pixellab.ai/) (high
top-down templates) and pulled in via its API:

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
Display size is per sprite rather than one shared number, because "1.5 tiles"
means different things for different art. The player and orderly are ~1.5 tiles
tall; the guards are smaller, and deliberately. The player's
88x88 sheet is mostly padding, so Rowan's body is only ~0.5 tiles across; the
guards' frames are nearly edge-to-edge robot, so at the same nominal size they
were genuinely *wider than the doorways they patrol through*. The enforcer sits at
1.15 tiles and the drone at 0.75 — see the collider note under *What's
implemented*.

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
