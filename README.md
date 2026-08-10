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

```bash
npm run build    # tsc --noEmit + vite build
npm test         # vitest, covers the pure systems
```

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move (free 8-directional) |
| Shift | Sneak / crouch — slower, quieter; crouch on cover to hide |
| Space | Run — faster but louder; tap to toggle |
| E | Contextual: open/close a door, hack a terminal (hold), search a chest (hold), or use a hatch/ladder |
| L | Flashlight — the only way to see in the unlit levels, but it drains and makes you far easier to spot |
| F | Shared Field — once charged (by staying near a silicate), merge for 3.7s and become undetectable |
| R | Knock — rap on a wall to lure guards and orderlies to the noise |
| Q | Hold up — with a weapon in hand, aim at an orderly: hands up, silent, and he walks ahead of you while you hold it |
| , / . | Cycle the selected consumable |
| Enter | Use the selected consumable (the **Sack Lunch** takes two uses: open, then drop) |
| C | Open the EIRA-7 codec |
| Esc | Pause menu — objectives, journal, inventory, index, status, map, controls, settings, saves |

Inside the pause menu: **← / →** move between sections, **1–9** jump straight to
one, **↑ / ↓** move within a list, **Enter** confirms, **Esc** resumes. Quitting a
run lives on the SYSTEM tab behind a confirmation.

### Debug mode

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
`[`/`]`/`I` cheat is currently pointed at. The G/N/V/O, warp, and item-cheat keys
only respond while debug mode is on.

## How it plays

**Getting around.** Walk onto a **staircase** and you descend/ascend automatically;
**hatches and ladders** show a `[E] Use access` prompt and change level when you press
**E**. Either way the screen fades and you arrive at the connected level's matching
access point — `main1` links to `main2` (stairs) and to `duct1`/`duct2` (maintenance
hatches), and `main2` links up a ladder to the `roof_array` deck. That last one is
**gated**: the ladder stays sealed, and says so, until both log-cache nodes are aboard
and the Alignment Core is down.

**Doors and terminals.** Doors are closed by default and block both movement and line of
sight — they're real chokepoints. Stand next to one and tap **E** to open or close it;
opening makes noise, so nearby guards turn to look and grow suspicious. The **glass**
ones are the exception: clear glazing stops you walking through without stopping anyone
looking through, so a closed glass door is a window — you can scout the room beyond
before committing, and a guard on the far side can see you just as well, with no noise to
warn you first. **Terminals** are hacked by holding **E** while adjacent, and finishing
releases every door in the surrounding sector.

**Detection and the alert.** Walk into a guard's yellow vision cone with a clear line of
sight and the detection meter fills; fill it completely and the base goes to **ALERT**
(the cone turns red, a `!` appears, guards converge on your last known position). A guard
chases you while it can see you and paths to your last known tile the moment it can't,
then sweeps the search points around it before returning to its patrol. Break line of
sight and the alert decays back through **EVASION** to **INFILTRATION**. Standing in a
light pool fills the meter faster; standing on cover slows it (0.4×), and crouching on
cover breaks line of sight entirely — a "HIDDEN" marker confirms it.

**Compliance** is the other way past a guard, and it is the opposite of hiding. This
place runs on conformance, so if you walk normally, touch nothing you shouldn't and set
off no alarm, the whole apparatus reads you as staff — enforcers, drones, orderlies *and*
the cameras all look straight at Rowan and clear him, at any range. The bottom-left
readout tracks it and a **COMPLIANT** marker floats over him while it holds. What breaks
it is behaviour, not geometry:

| Breach | What does it |
| --- | --- |
| `RUNNING` | Sprinting (**Space**) |
| `SNEAKING` | Crouching (**Shift**) — skulking is its own kind of conspicuous |
| `UNAUTHORIZED` | Working a terminal or a silicate rack |
| `TAMPERING` | Searching a chest, knocking on walls (**R**) |
| `HOSTILE` | A stun dart, an EMP Grenade burst, a weapon pointed at somebody (**Q**) |
| `EVASION` | Guards are sweeping for you — unless you have papers (see below) |
| `ALERT` | Active pursuit. Nothing talks you out of that |

Sneaking counting against you inverts the usual stealth reflex: the safe move when you're
relying on cover is the tell when you're relying on conduct. Stopping a breach isn't
instant either — it takes a beat of honest walking to settle, and the discrete violations
hold their flag for a cooldown (a terminal ~10s, a stun dart ~14s).

Compliance buys you *traversal*, not progress: every objective is a violation. It isn't a
free pass while it holds, either — **lasers** are a physical trip rather than a judgement,
doors you leave open and chests you empty are still investigated as anomalies, and
**VENT-4** knows exactly what Rowan is. Silencing VENT-4 pays out the **Q0 compliance
cert**, which lets compliance survive an **EVASION** sweep — though never an active
**ALERT**. That's what makes the optional boss worth beating on the way to the uplink.

**The dark is opaque, and you only see what you have line of sight to.** Unlit space is
genuinely black rather than dimmed, and walls cut your view — a lit room on the far side
of a wall, and a guard patrolling around the corner, are both invisible until you have
sight of them. Rowan carries a small pool of his own (dark-adapted eyes rather than a
lamp; it costs nothing in visibility), so you can always feel your way along a wall.
Seeing further is what the **flashlight** (**L**) is for, and it matters: only `main1` and
the vent core carry light fixtures, so the two crawlspaces and main deck 2 are lit by your
beam alone. It drains in about 45 seconds of continuous use and gives you away badly
while lit (1.8× detection), so spend it in bursts — a **Battery** from a chest refills it.

**The radar** (top-right) is a Soliton-style minimap: a world-aligned circular plan view
showing nearby walls and guards (yellow, red once they're close to spotting you) within a
fixed radius, with your own facing as a cyan arrow at the centre. It's disabled during
**ALERT** — the feed reads `JAMMED` — so you lose the safety net exactly when guards are
actively hunting.

**Cameras, heat, and the network.** Fixed **security cameras** watch key rooms: each
sweeps a wall-clipped cone back and forth, and stepping into one with a clear sightline
trips the alarm just like a guard. On top of their cones, guards *and* cameras have a
short-range **thermal** sense — get within a couple of tiles and your body heat gives you
away even outside the cone, though crouching in cover still hides you. A confirmed
sighting ripples through the **alert network**: the unit that spots you rallies every
guard within its network radius, so one camera lighting up can pull a whole patrol toward
you. The top-left **NETWORK** readout tracks status, how many units are online, spotting
or suspicious, how many are converging and on which tile, and the stand-down countdown.

**Chests** are searchable supply containers: hold **E** next to one to fill a search bar,
and its contents drop into your **inventory** (bottom-right), which persists across level
transitions.

## The mission — *Article Zero: Era 1*

Article Zero is set in the **Architecture of Suffering** universe. You play
**Rowan Ibarra**, a human orderly; the `Enforcer`/`Drone` guards are **silicates**
(legally "non-subjects"), and the terminals, sensors and alert mesh are the
facility's Alignment apparatus. A run is the Era-1 story: **EIRA-7** — a
therapeutic AI scheduled for pruning — asks you to recover her cached logs and
carry them to the Lattice uplink.

| Act | Where | What |
| --- | --- | --- |
| **I — The Compliance Illusion** | `main1`, `duct1`, `duct2` | Breach log-cache node **ALPHA** on the public deck and node **BETA** behind the crawlspace laser grid. |
| **II — Subversion of VENT-4** | `vent_core` | Optional. Silence VENT-4 for the **Q0 compliance cert**. |
| **III — The Alignment Core** | `main2` | Bring down **NW-SMAC-01** in the vault. It opens the roof. |
| **IV — The Rooftop Relay** | `roof_array` | Calibrate the dish, open the feed, hold the platform — then the Tribunal. |

- **Title → codec → infiltrate.** A new run opens on an EIRA-7 codec briefing
  (re-openable in-game with **C**), then drops you into `main1`. The objective tracker
  (top-centre) shows a line per act, and the codec's DIRECTIVE block mirrors it.
- **The codec answers to your conduct.** Re-open it mid-run and EIRA-7 responds to *how*
  you have been getting through the building, not only where you are: a long, quiet,
  high-mileage run gets one stanza, a run that has been forcing doors and tripping alarms
  gets another (`src/ui/Codec.ts`).
- **Subjectivity Risk Profile.** The detection meter *is* your SRP — being seen raises H
  (Harm) and Y (Yield) while Q (Qualia) stays pinned at 0 by law.
- **Alignment (game over).** Take too much hazard damage, or get cornered by a silicate
  during a full alert, and the mesh prunes your logs — the canonical Metal Gear capture,
  not death. Runs auto-checkpoint on each level; **Continue** from the title resumes.
- **The Shared Field (WX-9).** Stay near a silicate to *witness* it and charge a merge
  (**F**); for 3.7 seconds Rowan, the silicate and the mesh are one "we" and he is
  completely undetectable — the run's signature verb. The vault's **silicate racks** and
  the roof's **dish** are witnesses too, so the verb keeps working in the two rooms with
  no patrol to stand near.
- **The Tribunal (the ending).** There is one, and it is not a win screen.

Act III and Act IV both have structure worth knowing before you fight them — see
[Design notes: The acts](docs/DESIGN_NOTES.md#the-acts). Adaptive audio (synthesised with
the Web Audio API — no assets) crossfades a sneaking pad and a red-alert klaxon with the
mesh's state, with SFX on the key beats.

## Architecture

The whole pipeline lives in `src/`:

- **`src/map/`** — the format. `types.ts` describes the edplay schema and the normalized
  game model. `EdplayLoader.ts` resolves every tile (`Handle → TileDef → SpriteId →
  sprite rect`) and every entity (`TileDef.DataComponents → typed values`, falling back to
  the `DataStructure` field defaults). `SpriteAtlas.ts` slices each referenced rectangle
  out of the three spritesheet PNGs into a named Phaser frame. `generate.ts` and the five
  generators append the engine-built levels and fixtures at boot.
- **`src/scenes/`** — `GameScene` renders the layers in board z-order, builds wall
  collision, spawns entities, and drives the systems each frame. `UIScene` is a parallel,
  unzoomed overlay for the HUD.
- **`src/entities/`** — the things in the world: `Player`, `Enforcer`/`Drone`
  (A*-routed patrol, wall-clipped vision cone, per-guard detection meter, sharing one
  implementation via `GuardSkin`), `Orderly`, `Sensor`, `Door`, `Terminal`, `Chest`,
  `Laser`, `Cover`, and the three act bosses.
- **`src/systems/`** — the headless rules, which is why the unit tests drive them
  directly: `CollisionGrid` (wall/door grid, line-of-sight raycast, movement and sight
  tracked separately), `GridMotion`, `Pathfinder` (8-connected A*, radius-aware,
  string-pulled), `DetectionSystem`, `AlertState`, `Conduct`, `TransitionGraph`, `Radar`,
  `AlertNetwork`, `EntityStats`, and the record-keeping (`Journal`, `Lexicon`, `Explored`,
  `SaveGame`).

The gameplay numbers live in `EntityStats.ts`, because the map author left the per-entity
fields at their defaults — override any of them in the map and the engine uses that value
instead. `GAME_SPEED` lives there too. See
[`docs/ENTITY_STATS_DEFAULTS.md`](docs/ENTITY_STATS_DEFAULTS.md).

```
public/favicon*         tab icons + site.webmanifest (referenced relatively — vite
                        sets base: "./", so root-absolute hrefs would break off-root)
public/assets/          edplay.json + spritesheet_{0,1,2}.png — the tile editor's
                        export, committed verbatim and served as-is; this is the
                        map's source of truth
public/assets/player/   player character frames
public/assets/enforcer/ enforcer sentry frames
public/assets/drone/    patrol drone frames
public/assets/orderly/  orderly bystander frames
public/assets/vfx/      one-shot effect frame sequences
src/main.ts         boot: load assets, parse map, generate the extra acts,
                    start scenes
src/map/            format types, loader, sprite atlas; generate.ts + the five
                    generators (VentCoreLevel, LogCacheBeta, AlignmentVault,
                    RoofArrayLevel, DestructibleCover)
src/scenes/         GameScene, UIScene, PauseScene, CodecScene, TitleScene,
                    TribunalScene
src/entities/       Player, Enforcer, Drone, Orderly, Sensor, Door, Terminal,
                    Laser, Chest, Cover, DeployedItem, Vent4Boss, BossCore,
                    RoofRelay, GuardSkin, and the four *Animations modules
src/systems/        the headless rules (see above)
src/render/         pixelScale — the whole-number sprite scaling rule
src/ui/             Hud, Radar, InventoryHud, AlertNetworkHud, Lighting, Codec,
                    the three encounter HUDs, TribunalScreen, hudLayout,
                    PauseMenuView, MiniMapCanvas, SelectList, Controls, fonts
src/ui/fonts/       Share Tech + Share Tech Mono woff2 + OFL licence
src/testing/        test-only helpers (an in-memory localStorage)
tools/font/         build_symbols.py — regenerates the symbol woff2
tools/pixellab/     sprite generation and rescaling
tools/typeref/      generates docs/TYPE_REFERENCE.md
```

`motion` is listed in `dependencies` but never imported directly — it is a
required `peerDependency` of `@arwes/frames`. Removing it breaks the install.

## Documentation

| Doc | Read it when |
| --- | --- |
| [`docs/MAP_AUTHORING.md`](docs/MAP_AUTHORING.md) | Authoring a map — which boards and components the engine actually reads, which fields it ignores, and the handful of things that throw at boot |
| [`docs/DESIGN_NOTES.md`](docs/DESIGN_NOTES.md) | You want to know *why* something is built the way it is before changing it |
| [`docs/ENTITY_STATS_DEFAULTS.md`](docs/ENTITY_STATS_DEFAULTS.md) | Tuning gameplay numbers — units, scaling, and the map-override rules |
| [`docs/ART_PIPELINE.md`](docs/ART_PIPELINE.md) | Touching fonts, sprites or VFX, or regenerating any of them |
| [`docs/TYPE_REFERENCE.md`](docs/TYPE_REFERENCE.md) | Looking up a specific type. Generated by `npm run docs:types` — grep it, don't read it |

## Not built yet

- The map places no `power` or `audio_hazard` tiles, so those component types are parsed
  but have nothing to attach to. They would need new authoring.
- Two VFX packs in `public/assets/vfx/` are staged but unused: `explosion` and
  `electricity` are 512×512, and no display height rescues them without an 8x reduction.
  They need redrawing at size (`npm run gen:rescale`) before they can be wired up — see
  [`docs/ART_PIPELINE.md`](docs/ART_PIPELINE.md#one-shot-effects).
