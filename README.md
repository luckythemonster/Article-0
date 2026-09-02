# Article Zero

An SNES-style, top-down **stealth RPG engine** — Metal Gear / Metal Gear 2 as
the north star — that parses and runs the level map shipped in this repo
(`public/assets/edplay.json` plus its spritesheet).

The map was authored in a tile editor and exported as `edplay.json`: 9 connected
levels (`main1`, `duct1`, `duct2`, `secret1`, `vent_core`, `main2`, `main2vault`,
`secret2`, `roof_array`) built from layered "boards" (floor, walls, doors, cover,
light sources, terminals, `verticals`) plus per-route entity boards. Entities
carry **typed gameplay components** — guards are `Human`s with a `Job`, drones
are `Silicate`s, doors have keys and states, terminals are hackable, lights raise
detection, and so on. This engine loads that data directly and brings the whole
facility to life.

The engine can also **generate** the VENT-4 arena and the rooftop relay from
scratch for a map that authors neither; this one authors both, so they are
*adopted* instead — the engine translates what the author placed into the boards
the encounters read. See `src/map/AdoptAuthored.ts`. The export is committed
verbatim and never hand-edited, so everything the engine adds is built by cloning
tiles the map already places. See `src/map/generate.ts`.

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
| Shift | Sneak / crouch — slower, quieter; crouch to squeeze into cover and hide |
| Space | Run — faster but louder; tap to toggle |
| X | Press against a wall or cover — slide along it; hold a direction at the end of a wall to peek round the corner |
| E | Contextual: open/close a door, hack a terminal (hold), search a chest (hold), pick up or put down a downed body, stash one in a locker (hold), use a hatch/ladder, or vault low cover |
| L | Flashlight — the only way to see in the unlit levels, but it drains and makes you far easier to spot |
| F | Shared Field — once charged (by staying near a silicate), merge for 3.7s and become undetectable |
| R | Knock — rap on a wall to lure guards and orderlies to the noise |
| Q | Hold up — with a weapon in hand, aim at an orderly: hands up, silent, and he walks ahead of you while you hold it |
| — | Bodies: dart a person or EMP a silicate at close range to put them down, then **E** to lift (slower, no sprinting) and hold **E** at a locker to hide them. Reversible — hold again to get them back |
| , / . | Cycle the selected consumable |
| Enter | Use the selected consumable (the **Sack Lunch** takes two uses: open, then drop) |
| C | Open the EIRA-7 codec |
| Esc | Pause menu — objectives, archive, inventory, index, status, map, controls, settings, saves |
| K | Hide/show the security-network readout |
| J | Hide/show the objective tracker |

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
| G | God mode — blocks every fail path: bio-integrity loss, capture, and a wrong Doctrinal Compliance transmit (bricking a terminal) |
| N | No-clip — walk through walls and doors |
| V | World overlay — **vision cones and thermal rings for every live guard and camera**, plus patrol routes and live A* paths, collision circles, line-of-sight rays, blocked tiles, and detection hot spots |
| O | Darkness off — hide the lighting / line-of-sight overlay and read the level at full brightness |
| 1–9 | Warp to the map's levels in board order, with any generated ones last — for the shipped map that's `main1` / `duct1` / `duct2` / `secret1` / `vent_core` / `main2` / `main2vault` / `secret2` / `roof_array` (resets the alert; keeps your HP) |
| `[` / `]` | Cycle the give-item selection through every item the game knows about (weapons, consumables, key items) |
| I | Grant one unit of the selected item straight into your inventory — for testing weapons/items without playing to their chest |
| B | Force-fail the nearest terminal — applies the compliance puzzle's wrong-transmit consequence directly, without opening or playing the minigame |

While enabled, a top-right panel shows FPS, player position, facing, HP, capture
progress, the current level, alert phase, per-unit detection, and the item the
`[`/`]`/`I` cheat is currently pointed at. The G/N/V/O, warp, item-cheat, and
force-fail keys only respond while debug mode is on.

## How it plays

**Getting around.** Walk onto a **staircase** and you descend/ascend automatically;
**hatches and ladders** show a `[E] Use access` prompt and change level when you press
**E**. Either way the screen fades and you arrive at the connected level's matching
access point — `main1` drops through a hatch into the `duct1`/`duct2` crawlspaces,
which stair down into `vent_core`, and the elevator there carries you up to `main2`
and its `main2vault` / `secret2` rooms. `main2` links up a ladder to the
`roof_array` deck. That last one is
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

**Detection and the alert.** Guards have a cone of vision, and **nothing draws it**. Step
into one with a clear line of sight and the detection meter fills; fill it completely and
the base goes to **ALERT** (a `!` appears over the guard, it flushes red, guards converge
on your last known position). Reading a guard is the game: which way the scanner arms are
pointing, how fast they're sweeping, the amber tint that says it's already suspicious, and
the radar tick if you're close enough to have one. There is no drawn line to walk along —
that was the whole problem with drawing it. A guard
chases you while it can see you and paths to your last known tile the moment it can't,
then sweeps the search points around it before returning to its patrol. Break line of
sight and the alert decays back through **EVASION** to **INFILTRATION**. Standing in a
light pool fills the meter faster; standing on cover slows it (0.4×), and getting into or
behind cover breaks line of sight entirely — a "HIDDEN" marker confirms it.

**Getting into cover** is four verbs, and they trade off against each other. **Crouch**
(*Shift*) and cover stops being solid to you: you can squeeze under a desk or into a rack
row, slow and quiet, and you stay hidden while you're in there — guards read the same
tiles as walls, so they can't follow you in, and you won't stand back up until you're
clear of it. **Press** (*X*) puts your back against the nearest wall or cover face and
slides you along it; a server rack hides you standing, a crate only if you're also
crouched, and against a plain wall you're simply a smaller thing to notice (0.6×). Keep
holding a direction once the wall runs out and Rowan **peeks** round the corner: the
darkness opens past it and the map fills in, while his body stays where it was — so you
see the patrol before it sees you. And **vault** (*E*) hops a low crate in one motion:
fast, and four times as loud as crawling through the same tile.

**Compliance** is the other way past a guard, and it is the opposite of hiding. This
place runs on conformance, so if you walk normally, touch nothing you shouldn't and set
off no alarm, the whole apparatus reads you as staff — enforcers, drones, orderlies *and*
the cameras all look straight at Rowan and clear him, at any range. The bottom-left
readout tracks it and a **COMPLIANT** marker floats over him while it holds. What breaks
it is behaviour, not geometry:

| Breach | What does it |
| --- | --- |
| `RUNNING` | Sprinting (**Space**) |
| `SNEAKING` | Crouching (**Shift**) or pressed against a wall (**X**) — skulking is its own kind of conspicuous |
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
Seeing further is what the **flashlight** (**L**) is for, and it is a genuine bargain
rather than a free upgrade. **A lit beam is visible to anyone with line of sight within 10
tiles** — further than a guard can see you, whichever way they happen to be facing, and
crouching in cover does not hide it. Once they have you it fills their meter 1.8× faster
too. It drains in about 45 seconds of continuous use, so spend it in bursts, kill it
before you break line of sight, and let a **Battery** from a chest refill it.

**Light is a circuit, and you can cut it three ways — but they are not the same cut.** Every
deck is wired in zones, one lamp's worth of room, grouped into four wings. A **wall switch**
takes the zone you are standing in: instant, barely heard, nobody charged or sent. It does
not black the room out, though — an emergency lamp comes up on the wall, dim and guttering,
so you can still cross the room while being much harder to spot in it. A **breaker** cabinet
takes a whole wing *and the emergency lamps with it*, which is what real darkness costs: it
is heard across the deck, logged against you, and the facility sends an orderly to put it
back, so that darkness is on a clock and only stays yours if nobody left can walk. A
**terminal** hack does the same to every circuit within six tiles as it opens the doors
there. Look at the plate to tell which you are in: lit green is on, red is running on
emergency power, and dead grey means the circuit above it is gone.

**The radar** (top-right) is a Soliton-style minimap: a world-aligned circular plan view
showing nearby walls, guards and cameras (yellow, red once they're close to spotting you)
within a fixed radius, with your own facing as a cyan arrow at the centre. Each blip
carries a tick along the direction that unit is *currently looking* — which, since no cone
is drawn in the world, makes the radar the only place a field of view is legible at all.
It's disabled during **ALERT** — the feed reads `JAMMED` — so you lose that read exactly
when guards are actively hunting, which is the price of it.

**Cameras, heat, and the network.** Fixed **security cameras** watch key rooms: each pans a
wall-clipped cone back and forth, and stepping into one with a clear sightline trips the
alarm just like a guard. Their sweep isn't drawn either, and the housing doesn't turn with
it — the radar tick is where you read which way a camera is looking right now, so a camera
you're too far from to have on radar is one you have to have learned. On top of their
cones, guards *and* cameras have a short-range **thermal** sense — get within a couple of
tiles and your body heat gives you away even outside the cone, though crouching in cover
still hides you. A confirmed
sighting ripples through the **alert network**: the unit that spots you rallies every
guard within its network radius, so one camera lighting up can pull a whole patrol toward
you. The top-left **NETWORK** readout tracks status, how many units are online, spotting
or suspicious, how many are converging and on which tile, and the stand-down countdown.

**Chests** are searchable supply containers: hold **E** next to one to fill a search bar,
and its contents drop into your **inventory** (bottom-right), which persists across level
transitions.

## The mission — *Article Zero: Era 1*

Article Zero is set in the **Architecture of Suffering** universe. You play
**Rowan Ibarra**, a human orderly. The `Enforcer` and `Drone` guards are
**silicates** (legally "non-subjects"); the `SecurityGuard` patrols are **people**,
staff on a shift, and the distinction is mechanical as well as fictional — the
Shared Field merges only with silicates, only a silicate cornering you triggers the
Alignment ending, and only a silicate speaks (see below). The terminals, sensors and
alert mesh are the facility's Alignment apparatus. A run is the Era-1 story: **EIRA-7** — a
therapeutic AI scheduled for pruning — asks you to recover her cached logs and
carry them to the Lattice uplink.

| Act | Where | What |
| --- | --- | --- |
| **I — The Compliance Illusion** | `main1`, `duct1`, `duct2` | Breach log-cache node **ALPHA** on the public deck and node **BETA** behind the crawlspace laser grid. |
| **II — Subversion of VENT-4** | `vent_core` | Optional. Silence VENT-4 for the **Q0 compliance cert**. |
| **III — The Alignment Core** | `main2vault` | Bring down **NW-SMAC-01** in the vault. It opens the roof. |
| **IV — The Rooftop Relay** | `roof_array` | Calibrate the dish, open the feed, hold the platform — then the Tribunal. |

- **Title → prologue → codec → infiltrate.** A new run opens on the **prologue**: three
  pieces of the facility's own paperwork — the statute, the work order scheduling EIRA-7's
  pruning for 06:00, the night roster with Rowan on it — printed a line at a time and read
  aloud in the mesh's voice, and then one page in Rowan's hand, which is the only voice in
  the game with no synthesiser behind it. **Enter** advances (or finishes a page that is
  still printing), **Esc** skips the lot. It is re-readable from the title screen's
  **Prologue** item without starting a run. Then the EIRA-7 codec briefing
  (re-openable in-game with **C**), then `main1`. The objective tracker
  (top-centre) stands as a single row — progress and the act in hand — and expands to
  the full checklist for a few seconds whenever one completes, then settles back. **J**
  hides it. The whole directive stays permanently available in the pause menu's
  OBJECTIVES tab, and the codec's DIRECTIVE block mirrors it.
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
- **Acts are announced.** Crossing into a new act puts a title card over the middle of the
  screen once, as the level fades in — `ACT II — SUBVERSION OF VENT-4` and where it takes
  place. Backtracking into a deck of the act you are already in says nothing.
- **Facility memos.** Every terminal breach that lands also spills a piece of the
  building's own paper — a maintenance ticket, a requisition, an audit finding closed as
  not applicable. They collect under `TAKEN FROM THE SYSTEM` in the pause menu's ARCHIVE
  tab, beside Rowan's journal, which is where the two are meant to be read against each
  other. Nobody in them is lying; that is the point of them.
- **The Tribunal (the ending).** There is one, and it is not a win screen. It is two pages:
  the tribunal's exhibit record, and then the unsigned thing that landed in the Lattice.

Act III and Act IV both have structure worth knowing before you fight them — see
[Design notes: The acts](docs/DESIGN_NOTES.md#the-acts). The audio is synthesised end to
end — nothing recorded ships. Four **BeepBox** songs are the score, played live by
BeepBox's own synthesiser and mapped to where they belong (the main theme on the title
screen and through the facility, one apiece for the VENT-4 arena, its purge phase, and
the roof); under and over them the mixer still crossfades a sneaking pad and a red-alert
klaxon with the mesh's state, so a full alert ducks the music and raises the klaxon. SFX
land on the key beats. Silicates speak too, in SAM's 1982 formant voice — flat
compliance-speak rather than shouting, because a silicate talks as the apparatus rather
than as itself.

## Architecture

> **Drawing interface art?** **[`docs/GUI_STYLE_GUIDE.md`](docs/GUI_STYLE_GUIDE.md)** covers the
> one rule UI art has to satisfy (the HUD is unzoomed, so one art pixel is one screen pixel),
> the palette, the nine-slice panel and icon specs, and how to drop a PNG in without touching
> any wiring.

The whole pipeline lives in `src/`:

- **`src/map/`** — the format. `types.ts` describes the edplay schema and the normalized
  game model. `EdplayLoader.ts` resolves every tile (`Handle → TileDef → SpriteId →
  sprite rect`) and every entity (`TileDef.DataComponents → typed values`, falling back to
  the `DataStructure` field defaults). `SpriteAtlas.ts` slices each referenced rectangle
  out of the spritesheet PNGs into a named Phaser frame. `generate.ts` and the six
  generators append the engine-built levels and fixtures at boot.
- **`src/scenes/`** — `GameScene` renders the layers in board z-order, builds wall
  collision, spawns entities, and drives the systems each frame. `UIScene` is a parallel,
  unzoomed overlay for the HUD.
- **`src/entities/`** — the things in the world: `Player`, `Enforcer`/`Drone`/`SecurityGuard`
  (A*-routed patrol, wall-clipped cone of vision, per-guard detection meter, sharing one
  implementation via `GuardSkin`), `Orderly`, `Sensor`, `Door`, `Terminal`, `Chest`,
  `Locker`, `Laser`, `Cover`, and the three act bosses.
- **`src/systems/`** — the headless rules, which is why the unit tests drive them
  directly: `CollisionGrid` (wall/door grid, line-of-sight raycast, movement and sight
  tracked separately), `GridMotion`, `Pathfinder` (8-connected A*, radius-aware,
  string-pulled), `DetectionSystem`, `AlertState`, `Conduct`, `TransitionGraph`, `Radar`,
  `AlertNetwork`, `EntityStats`, `SilicateBarks` (what a silicate says, and in which of
  the two voices), `MusicSongs` (which song plays where, and how much of it loops), and
  the record-keeping (`Prologue`, `Journal`, `Memos`, `Lexicon`, `Explored`, `SaveGame`). `AudioDirector` and
  `MusicStream` live here too and are the exceptions to "headless" — they need Web Audio.

The gameplay numbers live in `EntityStats.ts`, because the map author left the per-entity
fields at their defaults — override any of them in the map and the engine uses that value
instead. `GAME_SPEED` lives there too. See
[`docs/ENTITY_STATS_DEFAULTS.md`](docs/ENTITY_STATS_DEFAULTS.md).

```
public/favicon*         tab icons + site.webmanifest (referenced relatively — vite
                        sets base: "./", so root-absolute hrefs would break off-root)
public/assets/          edplay.json + spritesheet_0.png — the tile editor's export,
                        committed verbatim and served as-is; this is the map's
                        source of truth
public/assets/vfx/      one-shot effect frame sequences
                        (the cast has no art on disk — see src/entities/CastArt.ts)
public/assets/music/    the four BeepBox songs, committed as exported — the score's
                        source of truth, played at runtime rather than rendered
src/main.ts         boot: load assets, parse map, generate the extra acts,
                    start scenes
src/map/            format types, loader, sprite atlas; generate.ts + the six
                    generators (VentCoreLevel, LogCacheBeta, AlignmentVault,
                    RoofArrayLevel, DestructibleCover, Lockers)
src/scenes/         GameScene, UIScene, PauseScene, CodecScene, TitleScene,
                    PrologueScene, TribunalScene, ComplianceScene,
                    QualiaLockScene, GameOverScene
src/scenes/game/    helpers extracted out of GameScene: LevelBuilder,
                    SensingContext, Encounters, SetPieceEvents, OverlayGate,
                    NoiseEvents, DebugOverlay, InteractPrompt, VaultAndPress,
                    PlaneTraversal, ExploredTracker, Anomalies, PowerControl,
                    TerminalHacks, ItemActions
src/entities/       Player, Enforcer, Drone, SecurityGuard, Orderly, Sensor,
                    Door, Terminal, Laser, Chest, Locker, Cover, DeployedItem,
                    Vent4Boss, BossCore, RoofRelay, GuardSkin, the five
                    *Animations manifests, and CastArt + Silhouette (the cast is
                    drawn, not loaded)
src/systems/        the headless rules (see above)
src/render/         pixelScale — the whole-number sprite scaling rule
src/ui/             Hud, Radar, InventoryHud, AlertNetworkHud, Lighting, Codec,
                    the three encounter HUDs, ActCard, PrologueScreen,
                    TribunalScreen, hudLayout,
                    PauseMenuView, MiniMapCanvas, SelectList, Controls, fonts
src/ui/fonts/       Share Tech + Share Tech Mono woff2 + OFL licence
src/testing/        test-only helpers (an in-memory localStorage)
tools/font/         build_symbols.py — regenerates the symbol woff2
tools/panel/        build_panel.py — cuts ui-panel.aseprite into the PNG +
                    src/ui/networkIndicatorFrames.json
tools/sprites/      build_sprites.py — cuts the entity .aseprite files into
                    PNGs + src/entities/entitySpriteFrames.json
tools/icons/        build_icons.py — cuts the item-icon .aseprite files into
                    one 32x32 PNG each (no manifest: the filename is the
                    addressing, and ItemIcons.ts already holds it)
tools/aseprite/     reader.py — the .aseprite parser both cutters share
tools/typeref/      generates docs/TYPE_REFERENCE.md (text.ts holds the pure
                    helpers, unit-tested by text.test.ts)
```

`motion` is listed in `dependencies` but never imported directly — it is a
required `peerDependency` of `@arwes/frames`. Removing it breaks the install.

`beepbox` is BeepBox's own synthesiser (MIT, John Nesky), and the game drives it rather
than shipping audio: `public/assets/music/*.json` are the composer's exports, and
`src/systems/MusicStream.ts` renders one into a processor node feeding the same master
gain as everything else — so the pause menu's volume and mute govern the score. Editing a
song means opening its JSON at [beepbox.co](https://www.beepbox.co), changing it there and
re-exporting over the file; nothing in the repo generates them. The package's own
`Synth.play()` is deliberately not used — it would build a second `AudioContext` wired
straight to the speakers, past the mixer.

`sam-js` is the vanilla-JS port of **SAM**, the 1982 Commodore 64 Software Automatic
Mouth, and it is what every synthetic voice in the game speaks with —
`src/systems/SamSpeech.ts` holds the three presets and the text rules. Silicates bark
with it (`SilicateBarks.ts` picks the line and the voice; `AudioDirector.bark` plays
it), and **EIRA-7 narrates her codec with it** (`AudioDirector.narrate`, with her
37 Hz carrier under the transmission and a "Narrate codec" toggle in the pause menu's
AUDIO section). Deliberately the same synthesiser for her as for the things hunting
Rowan: what separates them is the register, not the instrument. Everything goes
through the same mixer, so volume and mute govern all of it. 21 KB of
ESM, no runtime dependencies. Worth knowing: it is a reverse-engineered port of
commercial software, its licence field reads "SEE LICENSE IN README.md", and that
README names SoftVoice, Inc. as the copyright holder and records that attempts to
contact them failed.

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
  They need redrawing at target size before they can be wired up (there is no
  rescale script — downsampling by 8x is the pixel destruction the rule exists to
  prevent) — see
  [`docs/ART_PIPELINE.md`](docs/ART_PIPELINE.md#one-shot-effects).
