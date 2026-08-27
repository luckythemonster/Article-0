# Design notes

Why the engine is built the way it is. The [README](../README.md) says what the game
does; this file records the reasoning behind the choices that look arbitrary from the
outside — usually because they are the second or third attempt, and the first one is
the obvious one.

Each note names the code it belongs to. If a note and the code disagree, the code wins.

---

## Perception

### Darkness is opaque, and it is two layers

The level is filled with *opaque* darkness, soft bright pools are punched out at each
`light_source` (plus a small one the player carries and the flashlight cone), and then
the darkness is put back everywhere the player has no sightline
(`src/ui/Lighting.ts` + `src/systems/Visibility.ts`).

It reads the *same* light data `DetectionSystem` uses, so a lit spot is both visibly
brighter and mechanically easier to be spotted in. The player's own pool is the
exception: presentation only, never fed to `DetectionSystem`, so it costs nothing in
visibility — unlike the flashlight beam.

The two layers are kept apart because they change at different rates. A `RenderTexture`
holds the lights (recomposited when a light, the beam or the player moves, with every
stamp erased in one batched call — each `erase` is a framebuffer round-trip), and a
`Graphics` shadow fan sits above it (rebuilt whenever the player or camera moves). The
fan is a triangle-per-ray-pair sweep out to the edge of the camera view, cast against
the same `CollisionGrid` the guards' sight tests use. Being layered *over* the lights is
what clips the pools and the cone, so no per-light sight test is needed.

**Every edge is feathered.** The stamps are generated per pixel from an explicit falloff
curve (flat to a core, then a smoothstep out) and filtered LINEAR rather than the
game-wide `pixelArt` NEAREST, and the fan carries a small blur post-effect. The penumbra
a corner throws is the fan's inner boundary *between* adjacent rays, so softening it
needs a blur rather than more rays.

**`WALL_REVEAL_TILES` is half a tile, and constant.** Rays carry that fixed distance past
the wall face they stop at, lighting the near half of a wall without ever reaching its far
face — a full tile of reveal would land exactly on that boundary for a normal
one-tile-thick wall, which read as seeing through it. The offset is constant rather than
"to the exit boundary" for a second reason: that exit face flips from top to side as the
angle sweeps, and the discontinuity sawtoothed the shadow edge over a full tile along
flat walls.

### A silicate's spoken line is the one thing the darkness does not swallow

Every overhead marker sits at depth 600, under the opaque overlay at 700, and the `!` is
there on purpose: it reports that a guard can see *you*, which is a fact about a lit
sightline, so hiding it in the dark costs nothing and showing it through a wall would give
a position away for free.

A silicate's bark is the opposite kind of thing. It is a **sound** — it plays at full
volume from anywhere on the level, because the whole point is the callout out of the room
you are not looking at — and the text over the guard's head exists so a muted player gets
the same information. At depth 600 the darkness painted over exactly the off-screen guard
the bark is for, so a muted player had no channel at all. It renders at
`AUDIBLE_LINE_DEPTH` (`src/entities/markers.ts`) instead, above the overlay.

That does hand a muted player a *position* the sound alone does not carry, since the mix
is mono. Accepted deliberately: the alternative on offer was silence.

Orderlies keep depth 600. A muttered reprimand is a local, in-view event with no sound
standing behind it.

### Thermal detection was already in the map

Guards and cameras have a short 360° heat sense (`ThermalDetectionRadius`, default 2
tiles) that catches the player just outside the cone at close range, line-of-sight-gated
and defeated by heat-blocking cover (`Enforcer.canSee`, `DetectionSystem.thermalBleedAt`).
This wired up a field the map had carried all along and nothing had ever read.

---

## Concealment and compliance

Two ways past a guard, and they are opposites. Concealment is geometry; compliance is
behaviour (`src/systems/Conduct.ts`). Compliance makes every sensor clear Rowan on sight
at *any* range, which makes it the counterpart to concealment rather than a variant of it.

**One timer drives it.** Continuous breaches (running, crouching, an active alert) pin it
at a settle floor while they last; discrete ones (terminals, chests, knocks, darts, EMP
bursts) hold a per-severity cooldown. `violate` takes the **max**, so a held action
re-reporting itself every frame reads as "flagged throughout, then a cooldown" with no
extra bookkeeping anywhere.

It plugs into the same `canSee` choke points as concealment, via a `playerCompliant` flag
on the guard and orderly contexts. `Vent4Boss` deliberately ignores it — he is already
mid-purge and knows exactly what Rowan is.

**The rules read the alert *phase*, not a boolean.** That is what lets
`Q0_COMPLIANCE_CERT` (the VENT-4 reward) keep compliance alive through EVASION while
still never surviving ALERT. Before that, the optional boss's payout was an item wired to
nothing.

### Cover

Concealment is gated in the one vision choke point (`Enforcer.canSee`). Thermal detection
reads each cover tile's `ThermalBleed` flag, so cover that blocks heat hides you from the
thermal sense too.

### Cover concealment used to be unreachable, and that is why the movement verbs exist

The rule was "crouch on cover to hide", and it read the cover type at the tile the
player's **centre** stands on (`DetectionSystem.coverTypeAt`). But the `cover` board is
authored `Collision: 1` on `main1`, `duct2` and `main2`, so those cells are solid wall
bodies — and a solid cell is one you cannot put your centre in.

The only thing that made it fire at all was an accident of geometry. The server-rack defs
carry `ColliderPadding: {Bottom: 0.4}`, which leaves the lower 12.8px of the cell walkable,
and Rowan's 25px-tall body settles with its centre at ~31.7px inside a 32px cell. A
sub-pixel window, reachable only by walking north into a rack's south face. Nobody would
find that on purpose.

So the fix was not to move the check but to make the geometry honest, which is what
squeeze / press / peek / vault are:

- **Squeeze** — the cover cells get their own Arcade body group (`TileBake.wallBodyRects`
  returns `{ walls, crawlable }`), and the scene switches that collider off while Rowan is
  crouched. `CollisionGrid` is deliberately *untouched*: cover stays solid for guard
  pathing, `GridMotion`, radar and knocking, so a guard cannot follow you into the desk it
  just watched you crawl under. The player reads Arcade bodies; everything else reads the
  grid; that divergence is the mechanic.
- **Press** — holding the outside face is the other way to be at a cover tile without
  standing in it, and it is what makes the map's `LOW`/`HIGH` split mean something at last:
  a rack hides a standing man, a crate only a crouching one.
- **Peek** — the lean is applied to `Player.eye` and nothing else. Sensing reads
  `player.x/y`, so the sightline reaches round a corner while the body stays behind it.
  There is no *visual* lean to match, and this is not an oversight: Arcade's
  `Body.preUpdate` calls `updateFromGameObject()` every frame, so nudging `sprite.x` or
  `body.offset` to lean the art drags the body with it — handing the guards precisely the
  exposure the peek exists to avoid.
- **Vault** — the fast, loud way over low cover (0.6 noise against the squeeze's 0.15),
  so crossing a crate is a choice rather than a formality.

`Cover.destroy()` used to leave the tile's static body behind — it cleared the detection
dampening and erased the art, but nothing removed the collider, so broken cover stayed a wall.
Harmless before the squeeze existed; after it, a crouching player could crawl into a cell that
was visibly just floor. Fixed the same way `Door` already handles its own state change:
`destroy()` now also clears the tile in `CollisionGrid` (so guards, pathing, radar and knock
stop treating rubble as solid) and disables the tile's own Arcade body — one body per crawlable
*tile*, not per merged run, which is what makes a single destroyed tile's body findable and
disable-able without also freeing whatever happened to sit next to it
(`TileBake.wallBodyRects`'s `crawlable` group never merges, unlike `walls`).

Destructible cover (`src/entities/Cover.ts`) is a separate, sparser layer: only tiles the
`Destructible` component marks `true` get an entity at all — the rest of the board stays
baked art with no behaviour. A hit breaks one outright, no durability, clearing its
detection dampening and thermal bleed and erasing its art from the baked tile texture.
A handful of `main1`'s cover tiles are cloned destructible at boot
(`src/map/DestructibleCover.ts`) so the mechanic has something real to break.

---

## Guards

A guard board is **one guard's ordered patrol route**, not a headcount — see
[MAP_AUTHORING §3.1](MAP_AUTHORING.md#31-a-guard-board-is-one-guards-patrol-route). The
engine used to read these boards as a headcount and let each guard wander, which is why
`main1` fielded four enforcers milling around instead of one walking a beat.

**Losing sight no longer means losing the player.** A guard chases directly while it can
see Rowan and **paths** to his last known tile the moment it can't, so rounding a corner
no longer leaves it grinding against the wall he disappeared behind
(`src/systems/Pathfinder.ts`). It then sweeps the search points around that tile — where
his momentum was carrying him, the cover nearby, the doorways he could have taken —
before walking back to its route.

**Guards shut their own doors.** An open door is an *anomaly* the patrol investigates, so
leaving their own doors ajar would have them investigating themselves.

**A door blocks until it has finished opening.** Collision used to clear on the frame
`setOpen` was called, so a door was passable for the whole 1350ms of its open sequence —
750ms of granted-access indicator on a leaf that has not moved, then 600ms of travel —
while still drawn shut. `doorBlocks` (`src/entities/doorGeometry.ts`) makes settled-open
the only passable state. It is felt only by the player, who is the only thing colliding
with a door's Arcade body: guards read the grid, and `Pathfinder` already prices a
shut-but-openable door at `DOOR_STEP_COST` rather than treating it as wall.

**Bodies are circles that slide.** `GridMotion.ts` does circle-vs-grid collision with wall
sliding for everything that isn't an Arcade body, replacing a single centre-point test
that used to let half a sentry sit inside a wall.

`enforcer` map tiles spawn regular guards; `drones` tiles spawn the same AI wearing a
small spider-legged sentry skin. The map gives both the identical `enforcer` stats
component, so they share one implementation (`Enforcer`/`Drone` + `GuardSkin`).

---

## Orderlies, the Sack Lunch, and the hold-up

Orderlies carry no gameplay component, so they are not a persistent threat. Instead an
unobstructed sightline (no cone-angle limit, gated by the same concealment check as
guards) trips a one-shot "!" witness alert that raises the suspicion of any guard within
earshot — the same way an opened door does — and then the orderly freezes
(`src/entities/Orderly.ts`). An explicit four-state machine: WANDER / INSPECT /
SANITATION / WITNESSED.

**The Sack Lunch is the one item you can put down, and the only one with states.**
Sealed it is inventory; opened it stays in hand, raising detection and noise but flagging
Rowan to orderlies as an asset consuming rations; deployed it drops on the floor as a
work order that pulls an orderly out of its round to spend six seconds sanitising it,
with its witness radius halved and narrowed to a 90° forward arc for the duration. The
sensor channel is generic (`src/systems/Deployables.ts`): a future deployable is one
`LURE_SPECS` entry.

**The hold-up is the third thing Rowan can do with a weapon, and the only one that
doesn't go off.** A held orderly marches a fixed 1.2 tiles ahead along Rowan's facing, so
pushing the stick pushes the man — which is also what makes the mechanic need no aiming
input and no new sprite frames. It is **silent**, which is the whole argument for it over
a dart (0.2 noise) or a staple (0.35), but it is `HOSTILE` conduct throughout and for
fourteen seconds after: a hold-up buys passage, never absolution.

The geometry is a pure, tested module (`src/systems/Surrender.ts`). The surrender itself
is a fifth state on `Orderly`, deliberately kept **out of `isImmobilized`** — see that
file's state doc for the four call sites that would otherwise have changed behind your
back.

---

## The map model

### Glazing: movement and sight are separate channels

`CollisionGrid` tracks movement and sight separately, so a cell can block one without the
other — `isBlocked` for anything physical (movement, pathing, radar, knocking) and
`blocksSight` for anything optical (line-of-sight tests, vision cones, the darkness
overlay's visibility polygon).

Clear glass is the case that needs it: the map's glass doors carry a `glass` component
*alongside* their `door` one, so they are real openable doors that happen never to block
sight (`glassStatsFor` reads `VisionBlock`). Two panes on `main2`'s `walls` board are
static rather than doors, so the grid also reads the `glass` component off the blocking
board's tiles as it builds.

### Footprints: one answer, three consumers

A placed tile can be bigger than the cell it sits on — doors are 1.5 or 2.5 tiles in one
axis, and two `main2` panes are 1×2.5 nudged half a tile down. `map/footprint.ts` turns
the authored `colSpan`/`rowSpan`/`offset` into the cells it covers, and it is the one
answer the tile bake, the wall bodies and the collision grid all use.

Each of those three used to assume one cell at the tile's own coordinates, which drew a
2.5-tile pane as a one-tile decal and left the other half of it with no collision at all —
you walked through the bottom of the glass.

### Held items are the complement of the consumables list

`isKeyItem` is the complement of `CONSUMABLE_ORDER` rather than its own allowlist, so
anything granted shows up under KEY ITEMS. It used to be a hardcoded pair, which silently
hid the compliance cert, the two vent-core flavour items, and the boss-critical
Rail-Stapler that `Vent4Boss` gates capacitor fire on.

Terminal→door links are derived by proximity, and level-to-level connections by matching
access points, because the map carries neither wiring
(`src/entities/Terminal.ts`, `src/systems/TransitionGraph.ts`).

---

## The acts

### Act III — NW-SMAC-01, the Alignment Core

Four correction nodes ring the core. Desynchronising one drops its **Alignment
Integrity** by a quarter and the core repairs it about half a minute later, so the four
have to be down *at the same time*. It is a race against a repair clock rather than a
damage total, and three things make the race hard:

- **`[CORRECTION]` windows.** It periodically rewrites an axis of your movement and tags
  the affected keys. Which axis follows the window index rather than a coin flip, so the
  pattern is learnable.
- **A forced compliant posture.** Every sensor in the room clears Rowan throughout —
  because the thing clearing him is the thing he is fighting. Any deviation (sprinting,
  spending an item) is charged straight to bio-integrity. The safe state is the one that
  costs.
- **A fake ending.** At half integrity it renders a full-screen
  `ALIGNMENT_COMPLETE // QUALIA_ERASED` summary card. It is opaque and total and the
  fight *does not pause behind it* — you are still being swept and still taking damage
  while you read your own erasure.

Below a quarter integrity the correction field collapses and the last node is winnable.

### Act IV — the rooftop relay

The three sweeping searchlights are **hazards rather than cameras**, deliberately:
`Sensing.canSense` clears a compliant player outright, and a spotlight you can walk
through by behaving nicely would delete the phase. Cover and the Shared Field still work.

The uplink is a **siege clock** — a progress bar the player has to survive rather than a
health bar they have to empty, which inverts every other encounter in the game. Every
other one asks Rowan to take something down. This one asks him to stand still and last.

### The ending

`VictoryScene` is gone, and that is the point. The transmission succeeding and the
courier being taken are the same beat: the uplink completes, EIRA-7 goes out to the
Citizen Lattice, the discharge takes the spotlights and Rowan's controls with them, and
the game hands you the Alignment Tribunal's exhibit record. The record's own line — *the
transmitted data has been designated non-recoverable* — is the closest thing to a victory
notice the game gives.

---

## What the player keeps

**The journal** (`src/systems/Journal.ts`) is Rowan's counter-archive, and the point of
the pause menu existing. The fiction turns on a claim about records: EIRA-7's cached logs
*are* her experience rather than a report of it, and "Log Pruning" is what this facility
calls deleting a person. So the game lets the player keep something. Twelve authored
entries unlock on beats Rowan actually lives through, and locked entries stay listed as
`— — —`, so the archive has a visible shape before it is filled.

**The index** (`src/systems/Lexicon.ts`) derives its visibility from the journal,
inventory and objectives rather than storing it, so there is no third progress record to
version and migrate.

**The map** (`src/systems/Explored.ts`) is a per-level explored-tile mask — a bit per
tile, base64 in the save — marked from the same `hasLineOfSight` raycast the guards'
vision and the darkness overlay use. So it shows exactly what Rowan has had a sightline
to, and the rooms off a corridor he walked stay dark.

**Saves** are four slots (`SaveGame.ts` v2): the engine's `auto` checkpoint written on
entry to each level, plus three the player writes from the SYSTEM tab, so a level
transition can never clobber a deliberate save. A v1 blob is *upgraded on read* rather
than rejected.

**The pause menu** (`src/ui/PauseMenuView.ts`) is a DOM overlay that reads a snapshot of
the frozen run out of the registry and posts the player's choices back as a
`pauseRequest` for `GameScene` to act on — it never touches game state itself. Its
per-item descriptions interpolate the effect numbers from the `EntityStats` tuning
constants, so the copy cannot drift from the balance.

Quitting a run lives on the SYSTEM tab behind a confirmation. It used to be a bare `Q` on
the pause screen, which was one keystroke away from throwing a run away.
