# Type reference

Every enum, class, interface, type alias, and `as const` constant declared under `src/`, grouped by the area of the engine that owns it. Each entry cites the file and line it is declared on, so this file is a map into the code rather than a replacement for it.

**Generated — do not edit by hand.** Regenerate with `npm run docs:types` (`tools/typeref/generate.ts`) after adding or renaming a declaration. Prose lives in the doc comments on the declarations themselves; the generator lifts it from there.

## Totals

| Area | Enums | Classes | Interfaces | Type aliases | Constants | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [Systems](#systems) | 3 | 19 | 84 | 20 | 6 | 132 |
| [Entities](#entities) | 0 | 20 | 23 | 18 | 3 | 64 |
| [Map](#map) | 0 | 4 | 36 | 4 | 1 | 45 |
| [Scenes](#scenes) | 0 | 23 | 24 | 2 | 0 | 49 |
| [UI](#ui) | 0 | 22 | 26 | 5 | 6 | 59 |
| [Testing](#testing) | 0 | 1 | 0 | 0 | 0 | 1 |
| [Entry points](#entry-points) | 0 | 1 | 0 | 0 | 0 | 1 |
| **All** | **3** | **90** | **196** | **49** | **16** | **354** |

## Conventions

- Entries are grouped by area, then by kind (enums, constants, classes, interfaces, type aliases), then alphabetically.
- Class tables list the public surface. Private fields are counted but not named — they are implementation detail and change without notice.
- `*(opt)*` marks an optional field or property.
- `*(module-private)*` marks a declaration that is not exported; it is listed because it shapes a public signature.
- Long initialisers and generated data tables are truncated with `…`.
- Notes are the declaration's own doc comment, first paragraph onwards, flattened to one line.

---

## Systems

Headless simulation and rules. Nothing here touches Phaser or the DOM, which is why these are the types the unit tests drive directly.

### Systems — Enums

<a id="enum-relaystate"></a>

#### `RelayState` — enum

`src/systems/RelayCore.ts:18`

**Module note** — the header comment on `src/systems/RelayCore.ts`, which this declaration heads:

The rooftop relay — Act IV's state machine. Pure, no Phaser.

Same split as VENT-4 and NW-SMAC-01: rules here, Phaser shell in
`src/entities/RoofRelay.ts`. This one is less a boss than a **siege clock** — the
interesting state is a progress bar the player has to survive rather than a health
bar they have to empty, which is the inversion the finale is built on. Every other
encounter in the game asks Rowan to take something down. This one asks him to stand
still and last.

That is also why it ends the way it does. The uplink completing is not a victory
condition the player wins past; it is the moment the run is over and the roof closes.
`RelayState.CAPTURE` is unwinnable on purpose.

| Member | Value | Notes |
| --- | --- | --- |
| `CALIBRATE` | `0` *(implicit)* | Azimuth and elevation pedestals still to be set, under the searchlights. |
| `ARMED` | `1` *(implicit)* | Dish aligned. The feed terminal will now take EIRA-7. |
| `UPLINK` | `2` *(implicit)* | The siege: the uplink runs 0 → 100% while Enforcers land on the catwalks. |
| `CAPTURE` | `3` *(implicit)* | 100%. The discharge kills the spotlights, input locks, and the Enforcers close in. There is no way out of this state except through it — see the class comment. |
| `SEIZED` | `4` *(implicit)* | Taken on the dish platform. The tribunal has the screen. |

<a id="enum-smacstate"></a>

#### `SmacState` — enum

`src/systems/SmacCore.ts:38`

**Module note** — the header comment on `src/systems/SmacCore.ts`, which this declaration heads:

NW-SMAC-01 — the Alignment Core. Pure state machine, no Phaser.

Same split as VENT-4: the rules live here and unit-test on their own, while
`src/entities/BossCore.ts` is the Phaser shell that draws it and turns player input
into calls on this object. Every mutator returns a `SmacTransition` or null,
and that return value is the entire contract between the two.

##### What the fight is

Four correction nodes ring the core. Desynchronising one drops **Alignment Integrity**
by a quarter — and the core repairs it `SmacStats.resyncSeconds` later. So the
nodes have to be down *at the same time*, which makes the encounter a race against a
repair clock rather than a damage total. Integrity is not a separate pool: it is
`nodeCount - desynced`, scaled. All four down is zero is defeated.

What makes the race hard is that the core spends the fight editing Rowan's inputs.

##### The three things it does to the player

1. **Correction windows.** It alternates between auditing and *correcting*, and while
   correcting it inverts an axis of movement — the `[CORRECTION]` tag the HUD puts
   over the key prompts. Which axis is derived from the window index rather than
   randomised, so a player can learn the pattern instead of fighting a coin flip.
2. **A forced compliant posture.** Throughout, the mesh reads Rowan as compliant
   whatever he does, because the thing doing the reading is the thing he is fighting.
   Every sensor in the room clears him — and any deviation (sprinting, using an item)
   is charged straight to bio-integrity. The safe state is the one that costs.
3. **A fake ending.** At half integrity it renders the run's completion summary over
   the screen, opaque, while the fight goes on underneath. See `SmacState`.

The correction field is what all three run on, so losing it is what beats the boss:
below `SmacStats.exposedAt` the core is EXPOSED and none of it works any more.

| Member | Value | Notes |
| --- | --- | --- |
| `AUDIT` | `0` *(implicit)* | Sweeping the room, reading conduct. Input is Rowan's own. |
| `CORRECTION` | `1` *(implicit)* | A correction window: movement input is being rewritten. |
| `FALSE_SUMMARY` | `2` *(implicit)* | The fake `ALIGNMENT_COMPLETE // QUALIA_ERASED` card is up. Deliberately *not* a pause. The card is opaque and total, and behind it the spotlights keep sweeping and damage keeps landing — the lie is that the run is over, and the tell is that you are still losing bio-integrity while you read it. Dismissed with Esc or C, and it only ever happens once. |
| `EXPOSED` | `3` *(implicit)* | Correction field collapsed: no hijack, no forced posture, finishable. |
| `DEFEATED` | `4` *(implicit)* |  |

<a id="enum-vent4state"></a>

#### `Vent4State` — enum

`src/systems/Vent4Core.ts:17`

**Module note** — the header comment on `src/systems/Vent4Core.ts`, which this declaration heads:

VENT-4's finite state machine and Compliance Index economy.

Pure (no Phaser) so the whole encounter's rules unit-test cheaply. The boss
entity owns one Vent4Core and reports what the player did (patched a
sub-station, winched scrap, destroyed a capacitor, got fully spotted); the
core answers with the resulting state transition, if any, for the scene to
dress with banners, audio, and lighting.

The Compliance Index (100 → 0) replaces a health bar: sabotage lowers it,
being corrected raises it. Bands (Laminar ≥ 70, Turbulent ≥ 30, Critical
below) modulate sweep speed, steam, and thermal behaviour on the boss side.

| Member | Value | Notes |
| --- | --- | --- |
| `PHASE_1_SWEEP` | `"PHASE_1_SWEEP"` |  |
| `PHASE_2_VACUUM` | `"PHASE_2_VACUUM"` |  |
| `PHASE_3_PURGE` | `"PHASE_3_PURGE"` |  |
| `JAMMED` | `"JAMMED"` |  |
| `DEFEATED` | `"DEFEATED"` |  |

### Systems — Constants

<a id="const-chest-defaults"></a>

#### `CHEST_DEFAULTS` — const

`src/systems/EntityStats.ts:440`

| Key | Value | Notes |
| --- | --- | --- |
| `interactionTime` | `1.4` |  |
| `noiseOnOpen` | `3` |  |
| `items` | `["Medkit", "Battery", "Access Chit"]` | Loot used when the map leaves a chest's item slots blank (they all are). The schema only carries three slots, and since unlit space became genuinely opaque a Battery outranks Stun Rounds — light is load-bearing, stunning an Orderly bystander is a convenience. |

<a id="const-consumable-order"></a>

#### `CONSUMABLE_ORDER` — const

`src/systems/EntityStats.ts:846`

The consumables selectable through the item cursor, in canonical display
order. Held consumables fill the list dynamically (unheld names are
skipped), so e.g. a player holding only Thermal Gel + Medkit sees just
those two, in that order.

```ts
const CONSUMABLE_ORDER = [ CHAFF_PACK_ITEM, THERMAL_GEL_ITEM, RATION_PACK_ITEM, BATTERY_ITEM, STUN_ROUNDS_ITEM, SACK_LUNCH_ITEM, ] as const;
```

<a id="const-door-defaults"></a>

#### `DOOR_DEFAULTS` — const

`src/systems/EntityStats.ts:294`

| Key | Value | Notes |
| --- | --- | --- |
| `operationNoise` | `4` |  |

<a id="const-manual-slots"></a>

#### `MANUAL_SLOTS` — const

`src/systems/SaveGame.ts:29`

The slots the pause menu offers for manual saving.

```ts
const MANUAL_SLOTS = ["1", "2", "3"] as const;
```

<a id="const-run-keys"></a>

#### `RUN_KEYS` — const *(module-private)*

`src/systems/GameState.ts:42`

Registry keys scoped to a single infiltration; cleared when a new one begins.

```ts
const RUN_KEYS = [ "inventory", "selectedConsumable", "staplerFieldCharges", "objectives", "journal", "explored", "playTimeMs", "detection", "alertPhase", "radar", "alertNetwork", "playerHp", "sharedField", "activeItems", "vent4", "vent4State", "vent4Transmit", "smac", "smacState", "relay", "relayState", "conductMetrics", "pauseRequest", "mapSnapshot", "powerGrid", SUSPENDED_KEY, ] as const;
```

<a id="const-terminal-defaults"></a>

#### `TERMINAL_DEFAULTS` — const

`src/systems/EntityStats.ts:341`

| Key | Value | Notes |
| --- | --- | --- |
| `hackTime` | `2.2` |  |

### Systems — Classes

<a id="class-activeitemstate"></a>

#### `ActiveItemState` — class

`src/systems/ActiveItems.ts:33`

| Member | Signature | Notes |
| --- | --- | --- |
| `chaffOrigin` | `chaffOrigin: { x: number; y: number } \| null = null` | World position the EMP Grenade was used at; null while inactive. |
| `constructor` | `constructor(seed?: Pick<ActiveItemsView, "flashlightOwned" \| "flashlightOn" \| "flashlightCharge">)` | Optionally seeds the flashlight's owned/on/charge state from a prior `ActiveItemsView` snapshot — how `GameScene.resetPerRun()` carries the flashlight across a level transition. Omitted (a fresh run / loaded save), the flashlight starts owned, off, and full, as before. |
| `chaffActive` | `get chaffActive(): boolean` |  |
| `chaffRemaining` | `get chaffRemaining(): number` |  |
| `thermalMasked` | `get thermalMasked(): boolean` |  |
| `thermalRemaining` | `get thermalRemaining(): number` |  |
| `flashlightOwned` | `get flashlightOwned(): boolean` |  |
| `flashlightOn` | `get flashlightOn(): boolean` |  |
| `flashlightCharge` | `get flashlightCharge(): number` |  |
| `flashlightBeamActive` | `get flashlightBeamActive(): boolean` | True while the flashlight is actually emitting a beam (on and not dead). |
| `activateChaff` | `activateChaff(x: number, y: number): void` |  |
| `activateThermalGel` | `activateThermalGel(): void` |  |
| `toggleFlashlight` | `toggleFlashlight(): void` | Toggles the flashlight; a no-op when it isn't owned or the battery is dead. |
| `rechargeFlashlight` | `rechargeFlashlight(): void` | Restores the flashlight battery to 100% (Battery consumable). |
| `sackLunchOpened` | `get sackLunchOpened(): boolean` | True while Rowan is holding an opened ration — the penalty *and* the buffer. |
| `openSackLunch` | `openSackLunch(): void` | SEALED → OPENED. The lunch stays in the inventory; only its state changes. |
| `resealSackLunch` | `resealSackLunch(): void` | OPENED → (deployed, or gone). Called when the open lunch leaves Rowan's hands. A player carrying several is carrying one *open* one at most, so any remaining copies are sealed again — which is also what keeps the flag honest when the last lunch is deployed and the inventory no longer has one to be open. |
| `update` | `update(dt: number): void` |  |

*Plus 6 private members.*

<a id="class-alertstate"></a>

#### `AlertState` — class

`src/systems/AlertState.ts:21`

| Member | Signature | Notes |
| --- | --- | --- |
| `phase` | `phase: AlertPhase = "INFILTRATION"` |  |
| `lastKnownTile` | `lastKnownTile: { x: number; y: number } \| null = null` | Last tile position where the player was seen, for search behaviour. |
| `reportSighting` | `reportSighting(tileX: number, tileY: number): void` | Call when any guard has full line-of-sight detection on the player. |
| `noteSectorCaution` | `noteSectorCaution(tileX: number, tileY: number, seconds: number = SECTOR_CAUTION_DURATION): void` | Marks a tile's sector as recently searched — nearby guards stay CAUTIOUS. |
| `isCautious` | `isCautious(tileX: number, tileY: number, radiusTiles: number = SECTOR_CAUTION_RADIUS): boolean` | True when a tile lies within a still-live caution sector. |
| `update` | `update(dt: number): void` |  |
| `forceEvasion` | `forceEvasion(seconds: number = EVASION_DURATION): void` | An EMP jam (EMP Grenade) breaks an active pursuit into a search. No-op outside ALERT. |
| `isCombatAware` | `get isCombatAware(): boolean` |  |
| `remaining` | `get remaining(): number` | Seconds remaining in the current non-infiltration phase (for the HUD). |

*Plus 2 private members.*

<a id="class-audiodirector"></a>

#### `AudioDirector` — class *(module-private)*

`src/systems/AudioDirector.ts:46`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `bark` | `bark(line: string, voice: SilicateVoice): void` | Speaks one silicate line. **Not `sam.speak()`.** That builds its own `AudioContext` and plays straight to the speakers, which would sail past the master gain and mean a muted player still heard every bark. Rendering to a buffer and playing it through the same mixer as everything else is what makes the pause menu's volume slider and mute govern it like they govern the door and the klaxon. A no-op when there is no audio context (headless, or a browser that refused one) or when SAM fails on a line — a guard that cannot be heard still shows its line on the speech marker, so the bark degrades to text rather than to nothing. A line the warm-up does not already hold is rendered here rather than skipped. That is a backstop, not the normal path: one line is a few milliseconds against the whole set's ~100ms, and paying it beats the alternative this replaces, where any warm-up that had not run — or had run and failed — meant permanent silence with nothing on the console to say so. |
| `getSettings` | `getSettings(): Settings` | The player's current audio preference. |
| `applySettings` | `applySettings(next: Settings): void` | Applies a volume/mute preference to the master gain and persists it. Set directly rather than ramped: this is driven by a slider the player is dragging, and a 20ms ramp per input event stacks into audible zipper noise. |
| `setMood` | `setMood(mood: MusicMood): void` | Crossfades the music layers to match the current alert mood. |
| `door` | `door(): void` |  |
| `hack` | `hack(): void` |  |
| `ping` | `ping(): void` |  |
| `pickup` | `pickup(): void` |  |
| `select` | `select(): void` |  |
| `capture` | `capture(): void` |  |
| `victory` | `victory(): void` |  |
| `merge` | `merge(): void` |  |
| `steamHiss` | `steamHiss(): void` | A short pressurized hiss (steam valve / grate ping). |
| `railStapler` | `railStapler(): void` | The pneumatic rail-stapler firing: a pop with a metallic snap. |
| `jamClunk` | `jamClunk(): void` | Heavy scrap hitting the intake — the turbine chokes. |
| `vent4Shutdown` | `vent4Shutdown(): void` | VENT-4's spin-down: the victory arpeggio's descending mirror. |
| `setSuction` | `setSuction(on: boolean): void` | The vacuum-surge wind layer: looped noise through a low rumble filter on its own gain, independent of the mood crossfade. |
| `setPurge` | `setPurge(on: boolean): void` | The thermal-purge drone: a throbbing 55 Hz saw on its own gain. |

*Plus 25 private members.*

<a id="class-binaryheap"></a>

#### `BinaryHeap` — class *(module-private)*

`src/systems/Pathfinder.ts:286`

Minimal binary min-heap over (node, priority) pairs.

Lazily deleted: a node improved after it was queued is pushed again rather
than sifted in place, and the stale copy is skipped when it pops against the
closed set. That costs a little memory and buys a much smaller heap.

| Member | Signature | Notes |
| --- | --- | --- |
| `size` | `get size(): number` |  |
| `clear` | `clear(): void` |  |
| `push` | `push(node: number, cost: number): void` |  |
| `pop` | `pop(): number \| undefined` |  |

*Plus 3 private members.*

<a id="class-collisiongrid"></a>

#### `CollisionGrid` — class

`src/systems/CollisionGrid.ts:80`

A grid of blocked tiles for a level, plus helpers used by both player movement and
line of sight. Built from the `walls` layer (and any other layers marked as
blocking, e.g. closed doors in later phases).

Movement and sight are tracked separately, because they can disagree: a pane of clear
glass stops you walking through but not looking through. Callers should pick the
predicate that matches what they are asking — `isBlocked` for anything physical
(movement, pathing, radar, knocking) and `blocksSight` for anything optical
(line-of-sight tests, vision cones, the darkness overlay's visibility polygon).

Both are read off the tile as it was authored, in one pass: a blocking tile claims
every cell of its `footprintCells` (a 1×2.5 pane blocks two cells, not the one
it is placed on), and a `glass` component on it means those cells stop movement
without stopping sight. Glazing used to be a second walk over the layers *after*
construction, which could only downgrade cells the first walk had already blocked —
so a pane wider than its own cell lost the rest of itself entirely.

| Member | Signature | Notes |
| --- | --- | --- |
| `width` | `readonly width: number` |  |
| `height` | `readonly height: number` |  |
| `revision` | `revision = 0` | Bumped whenever a tile's blocked or see-through state actually changes. Lets a cache of derived geometry — the player's visibility polygon in `Lighting` — know a door opened even if nothing else about the frame moved. |
| `paddedCount` | `readonly paddedCount: number` | How many cells carry a padded rect — zero lets every caller skip the test. |
| `planeCount` | `readonly planeCount: number` | How many walk surfaces this level has — see `src/map/planes.ts`. 1 for every level that authors no `catwalks` board, which is seven of the nine shipped ones, and for those every plane-aware method below collapses to exactly what it did before planes existed. |
| `constructor` | `constructor(level: GameLevel, blockingLayers: string[] = ["walls"], tileSize = 32)` | @param tileSize pixels per cell, for reading the tiles' authored footprints. |
| `inBounds` | `inBounds(x: number, y: number): boolean` |  |
| `isBlocked` | `isBlocked(tileX: number, tileY: number, plane = 0): boolean` | Blocks movement. Out of bounds counts as blocked. `plane` selects the walk surface — see `src/map/planes.ts`. It is trailing and defaults to the floor, so every caller that predates planes keeps asking the question it was already asking. |
| `blocksSight` | `blocksSight(tileX: number, tileY: number, plane = 0): boolean` | Blocks line of sight. Everything that blocks movement also blocks sight *unless* it was registered as see-through. Out of bounds blocks sight, which is also what stops the ray walks in `hasLineOfSight` and `Visibility.rayDistance` running away. |
| `setBlocked` | `setBlocked(tileX: number, tileY: number, blocked: boolean, seeThrough = false, plane = 0): void` | Marks a tile blocked or clear at runtime — used by doors, which block movement, radar and enforcer pathing while closed and clear all of it the instant they open. Out-of-bounds writes are ignored. @param seeThrough when blocking, let sight through anyway (clear glazing). Ignored   when clearing a cell, since an open cell blocks nothing either way. |
| `wallsNear` | `wallsNear(cx: number, cy: number, radius: number, out: WallBuffer, plane = 0): WallBuffer` | Blocked-tile offsets within a circular radius (in tiles) of a centre point, as (dx, dy) relative to that centre, appended to `out`. Used by the radar to sample nearby terrain without scanning the whole level each frame. Fills a caller-owned `WallBuffer` rather than returning a fresh array because this runs every frame: a 10-tile radar radius sweeps 441 cells and can report a few hundred of them, and one `{ dx, dy }` per report at 60fps is a steady stream of short-lived objects for something that is only ever read and thrown away within the frame. |
| `paddedRectAt` | `paddedRectAt(tileX: number, tileY: number, plane = 0): Rect \| undefined` | The precise solid rectangle (tile units) of a padded, sight-blocking tile occupying this cell — `undefined` for the overwhelming majority of cells, where the coarse whole-cell `blocksSight` is already exact. Exists for the one place the coarse grid can't answer correctly: a wall with authored `ColliderPadding` leaves part of its own cell walkable (the physics body is inset — see `footprint.ts`'s `colliderRect`), so a viewer can legitimately stand inside that "opaque" cell. `hasLineOfSight` and `Visibility.rayDistance`/`sightDistances` skip testing the ray's own origin/endpoint cell (so debug no-clip embedded in an ordinary wall can still see out) — without this, that skip would also let sight leak straight through the *solid* part of a thin padded wall the viewer is standing against. Absent for two kinds of cell that do block sight: one whose tile has no authored padding (the coarse cell is already exact), and one whose padding would open a channel *through* a wall run rather than a strip of floor along it — see the third retraction pass in the constructor. For both, the whole-cell `blocksSight` is the honest answer. |
| `paddedSlotAt` | `paddedSlotAt(tileX: number, tileY: number, plane = 0): number` | This cell's padded-rect slot, or `NO_PADDED_RECT`. The allocation-free half of `paddedRectAt`, for the ray walks. Paired with `paddedEntryAt`: read the slot once to learn *whether* the cell is only partly opaque, then ask where the ray enters that part. |
| `paddedEntryAt` | `paddedEntryAt( slot: number, ox: number, oy: number, dx: number, dy: number, ): number \| undefined` | Distance along `(dx, dy)` at which the ray from `(ox, oy)` enters the solid rect held in `slot`, or `undefined` when it misses it entirely. `slot` comes from `paddedSlotAt`. Everything is in tile units, and `(dx, dy)` need not be normalized — `t` comes back in whatever unit they are. |
| `hasLineOfSight` | `hasLineOfSight(x0: number, y0: number, x1: number, y1: number, plane = 0): boolean` | Line-of-sight test between two tile coordinates using a supercover DDA walk. Returns true if no blocked tile lies strictly between the endpoints. |
| `lineOfSightPx` | `lineOfSightPx( x0: number, y0: number, x1: number, y1: number, tileSize: number, plane = 0, ): boolean` | `hasLineOfSight` for callers working in pixel space — divides both endpoints by `tileSize` before delegating. Used by guards checking sight to a noise's pixel origin. |

*Plus 6 private members.*

<a id="class-conductstate"></a>

#### `ConductState` — class

`src/systems/Conduct.ts:112`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(restore?: ConductMetrics)` |  |
| `compliant` | `get compliant(): boolean` | True when the facility reads Rowan as staff and every sensor clears him. |
| `sabotageActions` | `get sabotageActions(): number` | Distinct sabotage acts committed this run. |
| `complianceDistanceWalked` | `get complianceDistanceWalked(): number` | Tiles walked while reading as staff. |
| `isHighCompliance` | `isHighCompliance(): boolean` | True when Rowan has been quietly passing for long enough that EIRA-7 has something to say about it: a lot of ground covered as staff, and very little friction. Both halves matter. Distance alone is just play time; a low sabotage count alone is just a player who hasn't done anything yet. |
| `metrics` | `metrics(): ConductMetrics` | The running totals, for carrying across a level change. |
| `flaggedRemaining` | `get flaggedRemaining(): number` | Seconds until compliance returns, assuming behaviour stays clean. |
| `breach` | `get breach(): ConductBreach \| null` | Why compliance is withheld, or null while compliant. A continuous condition wins over a decaying discrete one — it is what's happening *now*, so it's the more useful thing to show. |
| `update` | `update(dt: number, input: ConductInput): void` |  |
| `violate` | `violate(reason: ConductBreach, seconds: number): void` | A discrete violation: hold the flag for `seconds`, attributing it to `reason`. Takes the longer of the two rather than overwriting, so calling this every frame an action is held down — a terminal hack, a chest search — reads as "flagged throughout, then a cooldown once you stop", with no extra bookkeeping at the call site and no way for a long flag to be cut short by a lesser one. `sabotageActions` counts **rising edges only** for the same reason: a held hack calls this on every frame, and a metric that counted each of those would be measuring frame rate. One hold is one act. |

*Plus 7 private members.*

<a id="class-detectionsystem"></a>

#### `DetectionSystem` — class

`src/systems/DetectionSystem.ts:45`

Turns the `light_sources` and `cover` layers into a spatial detection
modifier. When the player stands in a light pool they are easier to spot
(multiplier > 1); when they stand on a cover tile detection is dampened.

The result is a single function guards query: `multiplierAt(px, py)`.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(level: GameLevel, tileSize: number)` |  |
| `multiplierAt` | `multiplierAt(px: number, py: number): number` | Detection sensitivity at a pixel position (1 = neutral). |
| `setCircuit` | `setCircuit(ref: string, on: boolean): void` | Powers every fixture whose tile-def ref is `ref` on or off — a breaker throw. The mirror of `Lighting.setCircuit`, and the two must always be called together: this one decides whether a guard finds you easier to see, that one decides whether you can see anything. `src/entities/Breaker.ts` calls both. |
| `coverTypeAt` | `coverTypeAt(px: number, py: number): string \| undefined` | Cover type at a pixel position, or undefined if the tile has no cover. |
| `thermalBleedAt` | `thermalBleedAt(px: number, py: number): boolean` | True when the cover here leaks body heat — thermal sensing sees through it. |
| `thermalRadiusFor` | `thermalRadiusFor(baseTiles: number, thermalMasked: boolean): number` | Thermal Gel zeroes every ThermalDetectionRadius check for its duration. |
| `destroyCoverAt` | `destroyCoverAt(tileX: number, tileY: number): boolean` | Removes a cover tile's gameplay effects — the detection dampening and any thermal bleed — once a destructible cover tile has been broken. Returns whether a cover tile was actually indexed there, so callers (`Cover`) can treat a double-destroy as a no-op. |

*Plus 9 private members.*

<a id="class-exploredmap"></a>

#### `ExploredMap` — class

`src/systems/Explored.ts:16`

One level's seen-tile mask.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( readonly width: number, readonly height: number, bits?: Uint8Array, )` |  |
| `mark` | `mark(tx: number, ty: number): void` | Marks a tile seen. Out-of-bounds coordinates are ignored, not clamped —  a clamp would smear the map edge as the player walks along a wall. |
| `has` | `has(tx: number, ty: number): boolean` |  |
| `count` | `count(): number` | How many tiles have been seen — the STATUS tab's "surveyed" percentage. |
| `toBase64` | `toBase64(): string` |  |
| `fromBase64` | `static fromBase64(s: string, width: number, height: number): ExploredMap` | Rebuilds a mask from a persisted string. Anything that doesn't decode to the right length yields a blank map rather than throwing — a save whose level was re-authored to a different size should cost the player their fog, not their run. |

*Plus 2 private members.*

<a id="class-noiselog"></a>

#### `NoiseLog` — class

`src/systems/NoiseLog.ts:40`

A rolling window of recent noise emissions, in world pixels.

Hold one per run and hand it to both `NoiseEvents` (which writes) and
`buildRadarSnapshot` (which reads). Entries expire by age rather than being
consumed, so any number of readers can walk the same window in a frame.

| Member | Signature | Notes |
| --- | --- | --- |
| `record` | `record(x: number, y: number, radiusPx: number, now: number): void` | Records one emission at `now` (seconds). `radiusPx` is how far the sound carries, not how loud it is at any given point — the two are the same number in this game, because `emitAt` derives a listener's intensity purely from how far into the radius they stand. |
| `forEach` | `forEach(now: number, fn: (x: number, y: number, radiusPx: number) => void): void` | Calls `fn` for every emission still inside `NOISE_FADE_SEC` of `now`. Order is unspecified — the ring is walked by slot, not by age. Every reader so far combines entries with `max`, for which order does not matter; a reader that needs newest-first should sort what it collects rather than this imposing a cost on the ones that do not. |
| `clear` | `clear(): void` | Drops every entry. Called on a level swap, where the old level's sounds are moot. |

*Plus 3 private members.*

<a id="class-noisesectors"></a>

#### `NoiseSectors` — class

`src/systems/Radar.ts:33`

How loud each bearing is right now, 0 (silent) to 1 (a source underfoot).

Fixed at `NOISE_SECTORS` slots rather than growable like
`WallBuffer`, because the sectors are the art's eight ticks and there
can never be a ninth. Refilled each frame and read the same frame; hold one
per snapshot rather than minting one.

Sector 0 is due east and they run clockwise on screen (+y is south), which is
the row order `tools/radar/build_radar_bezel.py` lays the spritesheet out in.
The two agree on purpose: a sector index *is* a sheet row, with no lookup
table in between to drift.

| Member | Signature | Notes |
| --- | --- | --- |
| `clear` | `clear(): void` | Silences every bearing, keeping the buffer. |
| `add` | `add(sector: number, loudness: number): void` | Raises `sector` to `loudness` if that is louder than what is already there. Louder wins rather than accumulating: two quiet noises on one bearing are still two quiet noises, and summing them into a red tick would report a threat that is not out there. |
| `level` | `level(i: number): number` | How loud sector `i` is, 0..1. |

*Plus 1 private member.*

<a id="class-noisespamtracker"></a>

#### `NoiseSpamTracker` — class

`src/systems/AlertNetwork.ts:78`

Anti-exploit: tracks recent noise pings by tile so repeated distractions
in the same area stop being free. Record each ping's origin tile; once more
than `threshold` pings land within `radiusTiles` of a new one inside
`windowSec`, guards should skip individual SUSPICIOUS investigation and
escalate straight to a base-wide alert instead.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( private readonly radiusTiles: number = 4, private readonly windowSec: number = 10, private readonly threshold: number = 2, )` |  |
| `record` | `record(tileX: number, tileY: number, now: number): boolean` | Records a ping at (tileX, tileY) at `now` (seconds) and reports spam. |

*Plus 1 private member.*

<a id="class-relaycore"></a>

#### `RelayCore` — class

`src/systems/RelayCore.ts:75`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( private stats: RelayStats = RELAY_DEFAULTS, restore?: RelaySnapshot, )` |  |
| `state` | `get state(): RelayState` |  |
| `progress` | `get progress(): number` | Uplink completion, 0..1. |
| `isPedestalSet` | `isPedestalSet(i: number): boolean` | True once pedestal `i` is calibrated. Allocation-free: called every frame. |
| `setCount` | `get setCount(): number` | How many pedestals are set, of how many. |
| `pedestalCount` | `get pedestalCount(): number` |  |
| `isArmed` | `get isArmed(): boolean` | True once the dish is aligned and the feed terminal will accept EIRA-7. |
| `isUnderSiege` | `get isUnderSiege(): boolean` | True while the siege is running and the roof should be spawning Enforcers. |
| `isCaptured` | `get isCaptured(): boolean` | True once the discharge has fired: input is locked and the searchlights are dead. Both come from the same beat, so they read the same flag — a capture sequence where the lights went out but the player could still walk would be a bug in two places. |
| `captureLeft` | `get captureLeft(): number` |  |
| `canCalibrate` | `canCalibrate(i: number): boolean` | True when pedestal `i` still needs setting. |
| `notePedestalSet` | `notePedestalSet(i: number): RelayTransition \| null` | Pedestal `i` set. Arms the dish once they all are. |
| `noteFeedJacked` | `noteFeedJacked(): RelayTransition \| null` | EIRA-7 jacked into the primary feed. Opens the uplink and lands the first wave. |
| `takeWave` | `takeWave(): boolean` | True once per wave the siege owes the shell, draining the queue. A counter rather than a callback so the pure core never has to know what a guard is. |
| `update` | `update(dt: number): RelayTransition \| null` |  |
| `snapshot` | `snapshot(): RelaySnapshot` |  |
| `view` | `view(): RelayView` | The HUD view, refreshed in place — one object for the encounter's lifetime. |

*Plus 11 private members.*

<a id="class-sharedfield"></a>

#### `SharedField` — class

`src/systems/SharedField.ts:22`

| Member | Signature | Notes |
| --- | --- | --- |
| `charge` | `charge = 0` | Witness charge, 0..1. |
| `active` | `active = 0` | Seconds of active merge remaining (0 = inactive). |
| `isActive` | `get isActive(): boolean` |  |
| `ready` | `get ready(): boolean` |  |
| `witness` | `witness(dt: number, witnessing: boolean): void` | Accrues charge while witnessing a silicate (near, with line of sight). |
| `activate` | `activate(): boolean` | Starts the merge if charged; returns true if it began. |
| `update` | `update(dt: number): void` |  |

<a id="class-smaccore"></a>

#### `SmacCore` — class

`src/systems/SmacCore.ts:118`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( private stats: SmacStats = SMAC_DEFAULTS, restore?: SmacSnapshot, )` |  |
| `state` | `get state(): SmacState` |  |
| `isNodeDown` | `isNodeDown(i: number): boolean` | True while node `i` is desynchronised. Allocation-free: called every frame. |
| `downCount` | `get downCount(): number` |  |
| `integrity` | `get integrity(): number` | Alignment Integrity, 100 → 0. Derived from the nodes rather than stored, so the bar and the fixtures can never disagree about how the fight is going. |
| `nextResync` | `get nextResync(): number` | Seconds until the next node the core repairs comes back. |
| `summaryUp` | `get summaryUp(): boolean` | True while the fake completion card owns the screen. |
| `forcesCompliance` | `get forcesCompliance(): boolean` | True while the mesh is holding Rowan in a corrected posture — every sensor clears him, and deviating from it costs bio-integrity. |
| `correction` | `get correction(): SmacCorrection` | How movement input is being rewritten right now. Alternates axis by window index: odd windows invert X, even windows invert Y, and every third one does both. Learnable on purpose — a boss that randomises this is just noise, whereas a pattern the player can read turns the correction window into something to plan around. |
| `canDesync` | `canDesync(i: number): boolean` | True when node `i` can be worked: it exists and isn't already down. |
| `noteNodeDesynced` | `noteNodeDesynced(i: number): SmacTransition \| null` | Node `i` desynchronised. Starts its repair clock, and may end the fight. Reaching zero integrity — all four down at once — is the win, so the finisher isn't a special verb, just the last node landing before the first one comes back. |
| `dismissSummary` | `dismissSummary(): SmacTransition \| null` | Player dismissed the fake completion card. One-shot: it never returns. |
| `update` | `update(dt: number): SmacTransition \| null` |  |
| `snapshot` | `snapshot(): SmacSnapshot` |  |
| `view` | `view(): SmacView` | The HUD view, refreshed in place. One object for the life of the encounter rather than a fresh one every frame: `GameScene` publishes the same reference to the registry each tick and `UIScene` reads it the same tick, so nothing retains it across frames. Same reason `radarSnapshot` and the sensing context are reused. |

*Plus 11 private members.*

<a id="class-surrenderaim"></a>

#### `SurrenderAim<T extends Surrenderable>` — class

`src/systems/Surrender.ts:187`

One live aim, held across frames.

Owned by the scene rather than by either party, and deliberately reconstructed on
a level change rather than reset in place — it holds a reference to an entity that
a `scene.restart()` destroys.

| Member | Signature | Notes |
| --- | --- | --- |
| `target` | `get target(): T \| null` | Who is currently at gunpoint, or null. |
| `heldSeconds` | `get heldSeconds(): number` | How long the current hold has run. Resets to zero whenever the aim moves. |
| `update` | `update( dt: number, aiming: boolean, aimer: Aimer, candidates: readonly T[], world: SurrenderWorld, ): SurrenderResult<T>` | Advances the aim by one frame. `aiming` is the key *and* everything that gates it (a weapon in the bag, the roof's input lock). Passing false is how a hold is released — there is no separate release call, and there is deliberately nothing here that could forget to make one. |

*Plus 2 private members.*

<a id="class-transitiongraph"></a>

#### `TransitionGraph` — class

`src/systems/TransitionGraph.ts:147`

The level-to-level connection map, derived automatically from the tile data.

The edplay export carries no explicit destination for a stair/ladder/hatch —
but the author aligns matching access points across levels by coordinate, and
files them on a board whose name says they are ways out. That alignment *is*
the graph: a transition tile at (x,y) in level A connects to another level B
with a transition tile of the same class at (x,y), and the player arrives at
(x,y).

Three refinements handle the map's rough edges:
 - **Affinity tie-break** — if several levels share a coordinate, prefer the
   one that shares the most of this class's tiles overall (then level order).
 - **Shafts** — an elevator coordinate shared by three or more levels is a
   lift, not a pair, and is linked as a cycle so no floor is a dead end.
 - **Slipped pairs** — two otherwise-unpartnered ends a single tile apart on
   one axis are one link the author nudged off true.

What it deliberately does *not* do is guess: a tile with no partner stays
inert art rather than being pointed at whichever level looks closest. An
earlier ragged-cluster fallback did exactly that, and on a coordinate-keyed
index it fabricates exits — `duct1`'s two dangling ladders would each have
dropped the player onto an unrelated level's hatch.

Pure: never touches Phaser. Built once from the parsed `GameMap`.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(map: GameMap)` |  |
| `at` | `at(levelName: string, tileX: number, tileY: number): Transition \| undefined` | The transition on the tile at (tileX, tileY) in a level, if any. |
| `exitsOn` | `exitsOn(levelName: string): { tx: number; ty: number; transition: Transition }[]` | Every transition tile on a level, with its coordinate — the reverse of `at`, for the pause menu's map, which needs to mark the ways out rather than test one tile. |

*Plus 4 private members.*

<a id="class-vent4core"></a>

#### `Vent4Core` — class

`src/systems/Vent4Core.ts:67`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( private readonly stats: Vent4Stats = VENT4_DEFAULTS, restore?: Vent4Snapshot, )` |  |
| `state` | `get state(): Vent4State` |  |
| `compliance` | `get compliance(): number` |  |
| `band` | `get band(): ComplianceBand` |  |
| `patchedCount` | `get patchedCount(): number` |  |
| `jamLeft` | `get jamLeft(): number` |  |
| `isPatched` | `isPatched(i: number): boolean` |  |
| `isCapacitorDown` | `isCapacitorDown(i: number): boolean` |  |
| `isWinchUsed` | `isWinchUsed(i: number): boolean` |  |
| `canPatch` | `canPatch(i: number): boolean` | The last un-patched sub-station is the Phase-3 finisher: the machine "resists" it (locked) until the purge starts, so the fight can't end while the Compliance Index is still healthy. |
| `notePatched` | `notePatched(i: number): Vent4Transition \| null` |  |
| `canWinch` | `canWinch(i: number): boolean` |  |
| `noteWinched` | `noteWinched(i: number): Vent4Transition \| null` |  |
| `noteCapacitorDestroyed` | `noteCapacitorDestroyed(i: number): Vent4Transition \| null` |  |
| `noteCorrectionBurst` | `noteCorrectionBurst(): void` | A sweep fully spotted the player: the machine re-asserts itself a little. |
| `noteTransmit` | `noteTransmit(): Vent4Transition \| null` | Codec finisher: transmit the compliance cert on the maintenance band. |
| `update` | `update(dt: number): Vent4Transition \| null` |  |
| `snapshot` | `snapshot(): Vent4Snapshot` |  |

*Plus 9 private members.*

<a id="class-vent4physicssystem"></a>

#### `Vent4PhysicsSystem` — class

`src/systems/Vent4PhysicsSystem.ts:63`

| Member | Signature | Notes |
| --- | --- | --- |
| `grip` | `grip = 1` | 0..1 — Phase-2 gauge; drains under un-anchored suction. |
| `heat` | `heat = 0` | 0..1 — Phase-3 gauge; overheating at 1. |
| `thermalNullLeft` | `thermalNullLeft = 0` | Seconds of zeroed thermal signature left after a condensate drip. |
| `constructor` | `constructor( private readonly layout: Vent4Layout, private readonly tileSize: number, private readonly stats: Vent4Stats = VENT4_DEFAULTS, )` |  |
| `addImpulse` | `addImpulse(vx: number, vy: number): void` | Queue a one-shot push (air jet / correction burst), px/s. Decays fast. |
| `nearestPiton` | `nearestPiton(px: number, py: number, maxDistTiles: number): number \| null` | Index of the nearest piton within reach, or null. |
| `onDrip` | `onDrip(px: number, py: number): boolean` | Standing under a condensate drip tile. |
| `thermalVisible` | `get thermalVisible(): boolean` | The purge's thermal scan sees the player only while hot and un-cooled. |
| `update` | `update( dt: number, px: number, py: number, opts: { suction: boolean; purge: boolean; holdingPiton: boolean }, ): Vent4Forces` |  |

*Plus 2 private members.*

<a id="class-wallbuffer"></a>

#### `WallBuffer` — class

`src/systems/CollisionGrid.ts:24`

A growable list of (dx, dy) point pairs, backed by one `Float32Array`.

Exists so `CollisionGrid.wallsNear` can report a few hundred points per
frame without allocating a few hundred objects. Hold one and hand it back in
each frame; it keeps whatever capacity it reached, so after the first second
of play it stops allocating entirely.

| Member | Signature | Notes |
| --- | --- | --- |
| `count` | `count = 0` | Number of *points* held (so `2 * count` live entries in `data`). |
| `constructor` | `constructor(capacityPoints = 256)` |  |
| `clear` | `clear(): void` | Drops every point but keeps the capacity. |
| `push` | `push(dx: number, dy: number): void` |  |
| `dx` | `dx(i: number): number` | X offset of point `i` (`i < count`). |
| `dy` | `dy(i: number): number` | Y offset of point `i` (`i < count`). |

*Plus 1 private member.*

### Systems — Interfaces

<a id="interface-accessend"></a>

#### `AccessEnd` — interface *(module-private)*

`src/systems/TransitionGraph.ts:66`

One classified transition tile, before it knows where it leads.

| Field | Type | Notes |
| --- | --- | --- |
| `level` | `string` |  |
| `x` | `number` |  |
| `y` | `number` |  |
| `cls` | `TransitionClass` |  |
| `kind` | `TransitionKind` |  |

<a id="interface-activeitemsview"></a>

#### `ActiveItemsView` — interface

`src/systems/ActiveItems.ts:152`

Snapshot published to the registry for the HUD.

| Field | Type | Notes |
| --- | --- | --- |
| `chaffRemaining` | `number` |  |
| `thermalRemaining` | `number` |  |
| `flashlightOwned` | `boolean` |  |
| `flashlightOn` | `boolean` |  |
| `flashlightCharge` | `number` |  |
| `sackLunchOpened` | `boolean` | A held Sack Lunch is OPENED — the HUD says so, since it costs to carry that way. |

<a id="interface-aimer"></a>

#### `Aimer` — interface

`src/systems/Surrender.ts:39`

Whoever is doing the aiming. `Player` satisfies this by shape.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `facing` | `number` | Facing angle, radians (world convention: 0 = east, +y = south). |

<a id="interface-alertnetworksnapshot"></a>

#### `AlertNetworkSnapshot` — interface

`src/systems/AlertNetwork.ts:11`

Everything the alert-network HUD needs to draw one frame.

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `string` | The global alert phase ("INFILTRATION" \| "ALERT" \| "EVASION"). |
| `total` | `number` | Total detectors online (guards + cameras). |
| `alerted` | `number` | Units actively spotting the player (detection past the alerted threshold). |
| `suspicious` | `number` | Units suspicious but not yet confirmed. |
| `converging` | `number` | Mobile units converging on the last-known tile (0 unless combat-aware). |
| `target` | `{ x: number; y: number } \| null` | Last known player tile, or null when the network has lost the trail. |
| `countdown` | `number` | Seconds until the network relaxes to the next-calmer phase. |

<a id="interface-barkdecision"></a>

#### `BarkDecision` — interface

`src/systems/SilicateBarks.ts:100`

What a guard should do about having just entered a new state.

Two fields rather than one, because "say nothing" has two meanings that must
not be confused. See `decideBark`.

| Field | Type | Notes |
| --- | --- | --- |
| `line` *(opt)* | `string` | The line to speak now, or undefined when this change produces none. |
| `latch` | `boolean` | Whether to record `next` as spoken-for. False means "come back to this" — the guard is still in a state it owes a line for, and the caller must leave its record of the last spoken state alone so the next frame asks again. |

<a id="interface-bodyextent"></a>

#### `BodyExtent` — interface

`src/systems/WallPress.ts:24`

Half-extents of the pressing body, in tiles.

| Field | Type | Notes |
| --- | --- | --- |
| `halfW` | `number` |  |
| `halfH` | `number` |  |

<a id="interface-breakerstats"></a>

#### `BreakerStats` — interface

`src/systems/EntityStats.ts:392`

| Field | Type | Notes |
| --- | --- | --- |
| `target` | `string` | The tile-def `ref` whose lights this breaker feeds. A *class* of fixture, not one instance: the shipped breaker names `light_overhead1`, and the map places 50 of those across main1. Throwing it takes out every one of them, which is what makes it worth a walk. |
| `closed` | `boolean` | Whether the circuit is closed — that is, whether the power is **on**. The map's `circuitState` enum reads the electrician's way round, `OPEN = off` and `CLOSED = on`, and the art agrees: the breaker's screen is green while the circuit is closed. Stored as a boolean here so no call site has to remember which way the words go. |

<a id="interface-cheststats"></a>

#### `ChestStats` — interface

`src/systems/EntityStats.ts:431`

| Field | Type | Notes |
| --- | --- | --- |
| `interactionTime` | `number` | Seconds of held interaction to search/open. |
| `noiseOnOpen` | `number` | Radius (tiles) of the noise ping emitted when opened. |
| `items` | `string[]` | Item names the chest yields (blank map slots fall back to default loot). |

<a id="interface-complianceresult"></a>

#### `ComplianceResult` — interface

`src/systems/Compliance.ts:67`

The verdict returned by `validateCompliance`.

| Field | Type | Notes |
| --- | --- | --- |
| `isCompliant` | `boolean` | No uncorrected Q>0 violations remain. |
| `overrideSuccess` | `boolean` | Every required override flag is carried by an applied correction. |
| `errorMessage` | `string` | The first unmet constraint, or "" when the puzzle is solved. |

<a id="interface-conductinput"></a>

#### `ConductInput` — interface

`src/systems/Conduct.ts:46`

The player's live conduct, sampled once per frame.

| Field | Type | Notes |
| --- | --- | --- |
| `alertPhase` | `AlertPhase` | The global alert phase. ALERT and EVASION are not equivalent — see `certified`. |
| `running` | `boolean` |  |
| `sneaking` | `boolean` | Crouched — whether moving or not. Skulking is its own kind of conspicuous. |
| `certified` | `boolean` | Carrying `Q0_COMPLIANCE_CERT`, the proof-of-compliance awarded for silencing VENT-4. Documented as Q0 in good standing, Rowan can talk down a *search* and go back to reading as staff — which is what makes the optional boss worth beating on the way to the uplink. It buys nothing during an active ALERT. |
| `movedTiles` *(opt)* | `number` | Tiles walked since the last sample. Accrues into `ConductState.complianceDistanceWalked` only while compliant, which is what makes that counter mean "distance covered *passing as staff*" rather than "distance covered". |
| `forced` *(opt)* | `boolean` | NW-SMAC-01 is holding Rowan in a corrected posture: the mesh reads him as compliant whatever he does, because it is the thing doing the reading. Pins compliance on rather than off — the fight's cost lands as bio-integrity damage in `GameScene`, not as exposure. |

<a id="interface-conductmetrics"></a>

#### `ConductMetrics` — interface

`src/systems/Conduct.ts:95`

The two running totals, split out so they can survive a level change.

A level transition is a `scene.restart()`, which rebuilds every `GameScene` field —
including the `ConductState`. Without an explicit snapshot the counters would reset
every time Rowan used a hatch, and "has behaved well *this run*" would silently mean
"has behaved well since the last doorway".

| Field | Type | Notes |
| --- | --- | --- |
| `sabotageActions` | `number` |  |
| `complianceDistanceWalked` | `number` |  |

<a id="interface-conductview"></a>

#### `ConductView` — interface

`src/systems/Conduct.ts:246`

Snapshot published to the registry for the HUD and the codec.

| Field | Type | Notes |
| --- | --- | --- |
| `compliant` | `boolean` |  |
| `breach` | `ConductBreach \| null` |  |
| `flaggedRemaining` | `number` |  |
| `certified` | `boolean` | Carrying the Q0 cert — surfaced so the HUD can show the credential doing work. |
| `sabotageActions` | `number` | Distinct sabotage acts this run — drives EIRA-7's codec branch. |
| `complianceDistanceWalked` | `number` | Tiles walked while reading as staff. |
| `highCompliance` | `boolean` | `ConductState.isHighCompliance`, resolved once so readers agree. |
| `forced` | `boolean` | Held in NW-SMAC-01's correction field. |

<a id="interface-consumableslot"></a>

#### `ConsumableSlot` — interface

`src/systems/EntityStats.ts:885`

One held, distinct consumable type, with its position in the display list.

| Field | Type | Notes |
| --- | --- | --- |
| `slot` | `number` | 1-based position in the held-consumables list, for display only. |
| `name` | `string` | The consumable item name. |
| `count` | `number` | How many of it are held. |

<a id="interface-correction"></a>

#### `Correction` — interface

`src/systems/Compliance.ts:35`

An approved substitute block. `GrantsOverrideFlag` (named per the design spec)
marks a correction that also carries an override-payload key; `overrideFlag`
names *which* required flag it satisfies, so a puzzle can require several keys.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` |  |
| `label` | `string` | Panel caption, e.g. `feels → logs fault code 0x1F`. |
| `targetTokenId` | `string` | The `LogToken.id` this correction rewrites. |
| `replacementWord` | `string` | The compliant text that replaces the flagged block. |
| `GrantsOverrideFlag` | `boolean` | True when applying this correction contributes an override-payload key. |
| `overrideFlag` *(opt)* | `string` | The required flag this correction grants (only read when the above is true). |

<a id="interface-coverboards"></a>

#### `CoverBoards` — interface

`src/systems/CoverPoints.ts:15`

The two boards a cover query has to agree with.

| Field | Type | Notes |
| --- | --- | --- |
| `isBlocked` | `isBlocked(tx: number, ty: number): boolean` | Would this cell stop a standing man. |
| `coverTypeAt` | `coverTypeAt(px: number, py: number): string \| undefined` | `"low"`, `"high"`, or undefined for anything that is not cover, at a pixel position. |

<a id="interface-deployedlure"></a>

#### `DeployedLure` — interface

`src/systems/Deployables.ts:32`

A deployed object as the AI sees it: where it is, what it is, and whether it has
already been dealt with.

Declared structurally rather than as a class so the Phaser-side `DeployedItem`
satisfies it by shape and a test can hand these functions plain objects — the same
arrangement `SensingWorld` uses for the guard context.

| Field | Type | Notes |
| --- | --- | --- |
| `kind` | `readonly kind: DeployableKind` |  |
| `x` | `readonly x: number` | Pixel-space position. |
| `y` | `readonly y: number` |  |
| `spent` | `readonly spent: boolean` | True once serviced (or otherwise removed); a spent lure attracts nobody. |
| `consume` | `consume(): void` | Finish with it: the responder has done whatever the item asked of it. Part of the contract rather than the scene's business, because the AI that services a lure is the only thing that knows when it is done — and must be idempotent, since two responders can finish on the same frame. |

<a id="interface-detectionworld"></a>

#### `DetectionWorld` — interface

`src/systems/Sensing.ts:76`

The extra context `accrueDetection` needs on top of `SensingWorld`.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `number` |  |
| `player` | `{ x: number; y: number }` |  |
| `lightMultiplierAt` | `(px: number, py: number) => number` |  |
| `alert` | `AlertState` |  |

<a id="interface-doorstats"></a>

#### `DoorStats` — interface

`src/systems/EntityStats.ts:285`

| Field | Type | Notes |
| --- | --- | --- |
| `key` | `number` | Keycard id; 0 means no card required (hand-openable). |
| `state` | `string` | "closed" \| "open" \| "locked" \| "off" (edplay DoorState values). |
| `operationNoise` | `number` | Radius (tiles) of the noise ping emitted when the door operates. |

<a id="interface-enforcerstats"></a>

#### `EnforcerStats` — interface

`src/systems/EntityStats.ts:34`

| Field | Type | Notes |
| --- | --- | --- |
| `sightRange` | `number` |  |
| `sightAngle` | `number` |  |
| `thermalRadius` | `number` |  |
| `patrolSpeed` | `number` |  |
| `purgeSpeed` | `number` |  |
| `turnRate` | `number` |  |
| `auditDelay` | `number` |  |
| `alertNetworkRadius` | `number` |  |
| `fireRange` | `number` | Reach of the pursuing-guard ranged attack, in tiles. |
| `fireCooldown` | `number` | Seconds between shots. |
| `fireDamage` | `number` | Bio-integrity damage per shot that reaches the player. |

<a id="interface-eye"></a>

#### `Eye` — interface

`src/systems/Sensing.ts:20`

Everything sensing needs to know about one eye — a guard's, or a camera's.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` | Pixel-space position of the eye. |
| `y` | `number` |  |
| `facing` | `number` | Cone axis, radians (world convention: 0 = east, +y = south). |
| `rangeTiles` | `number` | Cone reach, in tiles. |
| `coneDegrees` | `number` | Full cone width, in **degrees** — the map authors it that way. |
| `thermalTiles` | `number` | 360° heat-sense reach, in tiles, before Thermal Gel scaling. |
| `readsConduct` *(opt)* | `boolean` | Whether this eye's answer depends on the player's *conduct*. Defaults to true, which is the guard's and the camera's case: they route through the Alignment apparatus, so a compliant Rowan is cleared on sight at any range. Set false for the things that are not making a judgement. NW-SMAC-01's auditing beams *are* the mesh, so being read as compliant by it buys nothing; a rooftop searchlight is a lamp, and a spotlight you could walk through by behaving nicely would gut the phase built around avoiding it. Both used to hand-roll their own cone test to escape the short-circuit below, which is how they quietly ended up with three different decay rates and no light sensitivity between them. |
| `plane` *(opt)* | `number` | Which walk surface this eye stands on — see `src/map/planes.ts`. Defaults to the floor, which is where every eye on a single-plane level is. |

<a id="interface-glassstats"></a>

#### `GlassStats` — interface

`src/systems/EntityStats.ts:315`

A glazed panel. The map's glass tiles are *also* doors — the shipped tile defs carry a
`door` and a `glass` component together — so this describes the glazing on top of the
door behaviour rather than replacing it.

Only `VisionBlock` is read. `type` (`CLEAR` etc.) is conveyed by the sprite, and
`BreakNoise` would need a breakage mechanic that doesn't exist; reading either into a
field nothing acts on is how the codebase accumulated dead content in the first place.

| Field | Type | Notes |
| --- | --- | --- |
| `visionBlock` | `boolean` | True for glazing that blocks line of sight — frosted or opaque rather than clear. |

<a id="interface-iteminfo"></a>

#### `ItemInfo` — interface

`src/systems/ItemCatalog.ts:48`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` |  |
| `blurb` | `string` | In-fiction description — what the object is and what carrying it means. |
| `effect` | `string` | Mechanical effect, with every number sourced from the tuning constants. |

<a id="interface-journalentry"></a>

#### `JournalEntry` — interface

`src/systems/Journal.ts:43`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `JournalEntryId` |  |
| `title` | `string` | Short all-caps heading, shown in the entry list. |
| `body` | `string` | The entry itself. Hard-wrapped prose; the view renders it pre-formatted. |

<a id="interface-journalstate"></a>

#### `JournalState` — interface

`src/systems/Journal.ts:360`

Serializable journal progress: the ids Rowan has written, in unlock order.

| Field | Type | Notes |
| --- | --- | --- |
| `unlocked` | `JournalEntryId[]` |  |

<a id="interface-lexiconcontext"></a>

#### `LexiconContext` — interface

`src/systems/Lexicon.ts:257`

Inputs the visibility rules read — all of it state the run already keeps.

| Field | Type | Notes |
| --- | --- | --- |
| `journal` | `JournalState` |  |
| `inventory` | `string[]` |  |
| `objectives` | `ObjectiveState` |  |

<a id="interface-lexiconentry"></a>

#### `LexiconEntry` — interface

`src/systems/Lexicon.ts:30`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` |  |
| `term` | `string` |  |
| `category` | `LexiconCategory` |  |
| `body` | `string` |  |
| `seeAlso` *(opt)* | `string[]` | Ids of related entries; rendered as cross-references. |
| `requires` *(opt)* | `{ journal?: JournalEntryId[]; items?: string[]; logsRecovered?: boolean; }` | What the player must have encountered for this entry to appear. Omitted means always listed — the terms Rowan already knows because he works here. |

<a id="interface-lightsource"></a>

#### `LightSource` — interface *(module-private)*

`src/systems/DetectionSystem.ts:4`

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `radiusPx` | `number` |  |
| `radiusPx2` | `number` | Cached `radiusPx²`, so the reach test never takes a square root. |
| `multiplier` | `number` |  |
| `ref` | `string` | The fixture's tile-def ref, which is what a breaker's `Target` names. Carried per light rather than resolved once into a list of indices, because `src/ui/Lighting.ts` has to make the identical cut and the two build their lists separately. Keying both on the ref means they cannot disagree about which lamps a circuit feeds. |
| `powered` | `boolean` | False once a breaker has opened this light's circuit. |

<a id="interface-lightstats"></a>

#### `LightStats` — interface

`src/systems/EntityStats.ts:82`

| Field | Type | Notes |
| --- | --- | --- |
| `radius` | `number` |  |
| `detectionMultiplier` | `number` |  |
| `type` | `string` | "static" \| "flicker" \| … (edplay LightType values). |

<a id="interface-logtoken"></a>

#### `LogToken` — interface

`src/systems/Compliance.ts:20`

One tokenized block of the raw log. Violation blocks are the editable ones.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` |  |
| `text` | `string` | The block's original text (a forbidden phrase when `violation` is true). |
| `violation` *(opt)* | `boolean` | True for a Q>0-flagged block the player must rewrite. |
| `qWeight` *(opt)* | `number` | The block's qualia weight (Q contribution) — flavour for the status bar. |

<a id="interface-lurespec"></a>

#### `LureSpec` — interface

`src/systems/Deployables.ts:49`

How one kind of deployable reads to the AI, and what servicing it costs.

| Field | Type | Notes |
| --- | --- | --- |
| `sightTiles` | `number` | Reach (tiles) at which it is noticed with a clear line of sight. |
| `scentTiles` | `number` | Shorter reach (tiles) at which it is noticed *through* walls, by smell. |
| `serviceSeconds` | `number` | Seconds of servicing before it is destroyed. |
| `label` | `string` | What the responder is doing about it, for the on-screen state readout. |

<a id="interface-lureworld"></a>

#### `LureWorld` — interface

`src/systems/Deployables.ts:70`

The slice of the world `noticedLure` reads. Matches the guard context by shape.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `number` |  |
| `grid` | `{ hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean }` |  |

<a id="interface-mapsnapshot"></a>

#### `MapSnapshot` — interface

`src/systems/PauseState.ts:36`

Everything the MAP tab needs to draw the current level.

| Field | Type | Notes |
| --- | --- | --- |
| `level` | `string` |  |
| `width` | `number` |  |
| `height` | `number` |  |
| `walls` | `Uint8Array` | One byte per tile, row-major: 1 where movement is blocked. |
| `explored` | `ExploredMap` | Which of those tiles the player has actually seen. |
| `player` | `{ tx: number; ty: number }` |  |
| `exits` | `{ tx: number; ty: number; label: string }[]` | Stairs, hatches and ladders off this level, labelled with their destination. |

<a id="interface-missionfeatures"></a>

#### `MissionFeatures` — interface

`src/systems/Objectives.ts:70`

What this particular map can actually furnish.

Every act past the first is grafted onto the map by a generator that is allowed
to decline (no suitable host level, no prototype tiles to clone). Rather than
showing objectives the player has no way to complete — or worse, gating the win
behind one — the mission asks what exists and requires only that.

Same convention as the pre-existing `hasVentCore` flag, generalised.

| Field | Type | Notes |
| --- | --- | --- |
| `hasVentCore` | `boolean` | The VENT-4 arena was generated (and with it the Q0 compliance cert). |
| `hasLogBeta` | `boolean` | The crawlspace BETA node was placed. |
| `hasVault` | `boolean` | The NW-SMAC-01 vault was placed. |
| `hasRoof` | `boolean` | The rooftop relay level was generated. |
| `extractionLevel` | `string` | Fallback win destination for a map with no roof — see `isRunWon`. |

<a id="interface-moveresult"></a>

#### `MoveResult` — interface

`src/systems/GridMotion.ts:26`

Result of a `moveCircle` step.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `blockedX` | `boolean` | True when the requested X movement was refused by a wall. |
| `blockedY` | `boolean` | True when the requested Y movement was refused by a wall. |

<a id="interface-networkunit"></a>

#### `NetworkUnit` — interface

`src/systems/AlertNetwork.ts:5`

One detector's contribution to the network readout.

| Field | Type | Notes |
| --- | --- | --- |
| `detection` | `number` | 0..1 suspicion meter. |

<a id="interface-objectiveline"></a>

#### `ObjectiveLine` — interface

`src/systems/Objectives.ts:166`

| Field | Type | Notes |
| --- | --- | --- |
| `label` | `string` |  |
| `done` | `boolean` |  |

<a id="interface-objectivestate"></a>

#### `ObjectiveState` — interface

`src/systems/Objectives.ts:20`

Serializable mission progress.

Everything past `logsRecovered` is optional so a save written before that beat
existed still validates (`SaveGame.isObjectiveState`) and loads as "not done
yet" rather than being rejected outright.

| Field | Type | Notes |
| --- | --- | --- |
| `logsRecovered` | `boolean` | EIRA-7's logs recovered by breaching a log-cache terminal. Retained as the coarse "has anything been recovered" flag that predates the ALPHA/BETA split — a map with plain `log_cache` terminals and no designated nodes still sets it, and still wins. |
| `alphaRecovered` *(opt)* | `boolean` | Log-cache node ALPHA breached. |
| `betaRecovered` *(opt)* | `boolean` | Log-cache node BETA breached. |
| `vent4Silenced` *(opt)* | `boolean` | VENT-4 shut down in the vent core. Optional so pre-boss saves still load. |
| `coreSilenced` *(opt)* | `boolean` | NW-SMAC-01, the Alignment Core, brought down in the vault. |
| `uplinkComplete` *(opt)* | `boolean` | The rooftop uplink reached 100% — the run's terminal beat. |

<a id="interface-pathnode"></a>

#### `PathNode` — interface

`src/systems/Pathfinder.ts:22`

A tile coordinate.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |

<a id="interface-pathoptions"></a>

#### `PathOptions` — interface

`src/systems/Pathfinder.ts:27`

| Field | Type | Notes |
| --- | --- | --- |
| `radiusTiles` *(opt)* | `number` | Radius (tiles) of the body that has to fit. A tile is only walkable when a circle this size centred on it clears every wall, which is what keeps a guard from planning a route through a gap it is too wide to enter. |
| `maxNodes` *(opt)* | `number` | Ceiling on expanded nodes before the search gives up and returns `null`. A guard asked for an unreachable goal would otherwise flood-fill the whole level on the frame it asks, so this is a frame-time guarantee, not a quality knob. |
| `openable` *(opt)* | `OpenablePredicate` | Cells the mover can open rather than go around — a guard's own unlocked doors. Routing through one costs `DOOR_STEP_COST` extra, so a guard takes an open corridor over a shut door whenever one exists, and only works a door when it's genuinely the way through. |
| `plane` *(opt)* | `number` | Which walk surface to search — see `src/map/planes.ts`. Guards stay on the plane they spawned on, so a route is planned entirely within one. |

<a id="interface-planelink"></a>

#### `PlaneLink` — interface

`src/systems/PlaneLinks.ts:50`

One way between the two surfaces, usable in both directions.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` | The foot: a floor cell the player stands on to use it. |
| `y` | `number` |  |
| `toX` | `number` | The head: the deck cell it leads onto. |
| `toY` | `number` |  |
| `kind` | `PlaneLinkKind` |  |

<a id="interface-playerparams"></a>

#### `PlayerParams` — interface

`src/systems/QualiaLock.ts:34` · `extends WaveParams`

The player's wave adds an exponential-decay envelope (the DAMPING control).

| Field | Type | Notes |
| --- | --- | --- |
| `damping` | `number` | Envelope decay: y = A · e^(−damping·x) · sin(f·x + φ). 0 ⇒ flat baseline. |

<a id="interface-playerstats"></a>

#### `PlayerStats` — interface

`src/systems/EntityStats.ts:463`

| Field | Type | Notes |
| --- | --- | --- |
| `maxHp` | `number` | Full bio-integrity (health). |
| `captureRadius` | `number` | Tiles: a silicate this close, with line of sight, during a full alert seizes you. |
| `captureTime` | `number` | Seconds cornered before the capture (Alignment) completes. |
| `deathHold` | `number` | Seconds the run holds after bio-integrity reaches zero, before the outcome screen. `endRun` stops the HUD scene the same frame it is called, so without this the flatline on the bio-integrity dial renders once and is gone — an entire death state nobody ever sees. Input is already dead through the hold, so it costs the player a beat and buys the one moment the readout exists for. |
| `hazardDamage` | `number` | Bio-integrity lost per hazard hit (e.g. a laser). |
| `hitCooldown` | `number` | Seconds of invulnerability after taking a hit. |

<a id="interface-powergridstate"></a>

#### `PowerGridState` — interface

`src/systems/PowerGrid.ts:27`

Circuit state that outlives a level, held in the Phaser registry.

**Only explicit overrides are stored.** A circuit nobody has touched is absent
and falls back to whatever the map authored, so this never has to be seeded
from the map and can never disagree with it about an untouched breaker.

| Field | Type | Notes |
| --- | --- | --- |
| `circuits` | `Record<string, boolean>` | `circuitKey` -> whether the circuit is closed (powered). |

<a id="interface-pressside"></a>

#### `PressSide` — interface

`src/systems/WallPress.ts:50`

Which way along a face the body can travel, and what it can see from the end of it.

| Field | Type | Notes |
| --- | --- | --- |
| `open` | `boolean` | True while the wall still backs the body a step further along the face. False means the run ends here — the body stops, and `lean` is what the input turns into instead. |
| `lean` | `{ x: number; y: number } \| null` | Offset (tiles) from the body to where the eye reaches when leaning past this end of the wall, or null when the wall continues (nothing to lean past). |

<a id="interface-pressstate"></a>

#### `PressState` — interface

`src/systems/WallPress.ts:65`

Everything `Player` needs to hold a face for one frame.

| Field | Type | Notes |
| --- | --- | --- |
| `surface` | `PressSurface` |  |
| `tx` | `number` | Unit tangent of the face — the axis movement is projected onto. |
| `ty` | `number` |  |
| `neg` | `PressSide` | Travel and peek in the tangent's negative direction. |
| `pos` | `PressSide` | Travel and peek in the tangent's positive direction. |

<a id="interface-presssurface"></a>

#### `PressSurface` — interface

`src/systems/WallPress.ts:30`

One solid face the body can hold itself against.

| Field | Type | Notes |
| --- | --- | --- |
| `nx` | `number` | Unit normal, pointing from the face out toward open space — i.e. toward the player. Axis-aligned, so exactly one of the two is non-zero. |
| `ny` | `number` |  |
| `wallX` | `number` | The solid cell being pressed. |
| `wallY` | `number` |  |
| `flush` | `number` | The fractional tile coordinate the body's centre holds on the normal's axis to sit flush against the face — an X when the normal is horizontal, a Y when it is vertical. `Player` pulls toward this rather than snapping, so latching on reads as leaning back into the wall rather than teleporting to it. |

<a id="interface-puzzlestate"></a>

#### `PuzzleState` — interface

`src/systems/Compliance.ts:50`

A complete puzzle instance.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` |  |
| `title` | `string` |  |
| `rawLogText` | `LogToken[]` | The tokenized log, in reading order. |
| `violations` | `string[]` | Ids of the Q>0-flagged tokens that must be corrected. |
| `availableCorrections` | `Correction[]` | Every substitute block offered in the corrections panel. |
| `requiredFlags` | `string[]` | Override-payload keys that must all survive into the final text to unlock. |

<a id="interface-qualialockconfig"></a>

#### `QualiaLockConfig` — interface

`src/systems/QualiaLock.ts:46`

Tuning for the whole encounter.

| Field | Type | Notes |
| --- | --- | --- |
| `samples` | `number` | Sample count for the MSE integral across x ∈ [0, 2π]. |
| `lockThreshold` | `number` | Alignment fraction (0..1) that counts as a phase lock. |
| `lockDuration` | `number` | Seconds of sustained lock required to complete the bypass. |
| `instabilityThreshold` | `number` | Below this alignment the instability meter fills. |
| `instabilityFillRate` | `number` | Instability fill rate (per second) while below the threshold. |
| `instabilityDrainRate` | `number` | Instability drain rate (per second) while at or above the threshold. |
| `alignmentTolerance` | `number` | Exponential fall-off factor for MSE → alignment, keyed to target power (A²). Larger ⇒ more forgiving. See `alignmentScore`. |
| `noiseAmplitude` | `number` | Amplitude of the view-side "erratic Q>0" jitter (not scored). |
| `amplitudeRange` | `Range` |  |
| `frequencyRange` | `Range` |  |
| `phaseRange` | `Range` |  |
| `dampingRange` | `Range` |  |

<a id="interface-qualialockstate"></a>

#### `QualiaLockState` — interface

`src/systems/QualiaLock.ts:73`

The full, mutable game state — one object drives scene, demo, and tests.

| Field | Type | Notes |
| --- | --- | --- |
| `target` | `WaveParams` | The statutory Q0 baseline (immutable during a round). |
| `player` | `PlayerParams` | The live wave the player is steering. |
| `alignment` | `number` | Overlay accuracy, 0..1. |
| `lockProgress` | `number` | Seconds of sustained ≥`lockThreshold` alignment so far. |
| `instability` | `number` | Hazard meter, 0..1; 1 ⇒ purge. |
| `status` | `QualiaStatus` | Derived status for the HUD. |
| `elapsed` | `number` | Seconds since the round began. |

<a id="interface-qualiaround"></a>

#### `QualiaRound` — interface

`src/systems/QualiaLock.ts:251`

Everything a view needs to run one round — the `DEMO_PUZZLE` analogue.

| Field | Type | Notes |
| --- | --- | --- |
| `target` | `WaveParams` |  |
| `initialPlayer` | `PlayerParams` |  |
| `config` | `QualiaLockConfig` |  |

<a id="interface-rackcandidate"></a>

#### `RackCandidate` — interface

`src/systems/QualiaLock.ts:273`

Minimal terminal shape needed to choose a rack (position + resolved type).

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `string` |  |
| `x` | `number` |  |
| `y` | `number` |  |

<a id="interface-radarblip"></a>

#### `RadarBlip` — interface

`src/systems/Radar.ts:71`

A guard blip, player-relative, in tile units.

| Field | Type | Notes |
| --- | --- | --- |
| `dx` | `number` |  |
| `dy` | `number` |  |
| `facing` | `number` |  |
| `alerted` | `boolean` | True once the guard is past the "spotted" threshold — draws hot/red. |

<a id="interface-radarsnapshot"></a>

#### `RadarSnapshot` — interface

`src/systems/Radar.ts:96`

Everything the radar UI needs to draw one frame, in screen-agnostic units.

Rebuilt every frame, so its arrays are **reused buffers owned by the
snapshot**, not fresh ones: read them during the frame you were handed them
and do not retain them. Terrain within radar reach runs to a few hundred
points, and minting a `{dx, dy}` for each of them sixty times a second was
the largest single source of garbage in the frame.

| Field | Type | Notes |
| --- | --- | --- |
| `facing` | `number` | Player facing angle, radians (world convention: 0 = east, +y = south). |
| `jammed` | `boolean` | True during ALERT — the signal is jammed and nothing else is populated. |
| `blips` | `RadarBlip[]` |  |
| `walls` | `WallBuffer` | Blocked-tile offsets near the player, player-relative, in tiles. |
| `noise` | `NoiseSectors` | How loud each compass bearing is, for the bezel's noise ticks. |

<a id="interface-radarunit"></a>

#### `RadarUnit` — interface

`src/systems/Radar.ts:80`

Anything the radar can plot: a guard or a camera.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `facing` | `number` |  |
| `detection` | `number` |  |

<a id="interface-raydirections"></a>

#### `RayDirections` — interface

`src/systems/Visibility.ts:71`

Unit ray directions, split into parallel arrays so casting allocates nothing.

| Field | Type | Notes |
| --- | --- | --- |
| `cos` | `readonly cos: Float64Array` |  |
| `sin` | `readonly sin: Float64Array` |  |
| `invCos` *(opt)* | `readonly invCos?: Float64Array` |  |
| `invSin` *(opt)* | `readonly invSin?: Float64Array` |  |
| `deltaX` *(opt)* | `readonly deltaX?: Float64Array` |  |
| `deltaY` *(opt)* | `readonly deltaY?: Float64Array` |  |
| `stepX` *(opt)* | `readonly stepX?: Float64Array` |  |
| `stepY` *(opt)* | `readonly stepY?: Float64Array` |  |

<a id="interface-relaymsg"></a>

#### `RelayMsg` — interface

`src/systems/RelayCore.ts:46`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `number` |  |
| `text` | `string` |  |

<a id="interface-relaysnapshot"></a>

#### `RelaySnapshot` — interface

`src/systems/RelayCore.ts:40`

| Field | Type | Notes |
| --- | --- | --- |
| `state` | `RelayState` |  |
| `pedestals` | `boolean[]` |  |
| `uplink` | `number` |  |

<a id="interface-relaystats"></a>

#### `RelayStats` — interface

`src/systems/EntityStats.ts:1109`

| Field | Type | Notes |
| --- | --- | --- |
| `pedestalCount` | `number` | Calibration pedestals that must be set before the dish will take a feed. |
| `pedestalTime` | `number` | Seconds of held interact per pedestal. |
| `uplinkSeconds` | `number` | Seconds the uplink takes to run 0 → 100%. |
| `searchlightCount` | `number` | Searchlights sweeping the roof, their reach (tiles) and full cone width (degrees). |
| `searchlightRange` | `number` |  |
| `searchlightAngle` | `number` |  |
| `searchlightSpeed` | `number` | Searchlight rotation, radians of phase per second (`paced`). |
| `searchlightDetectTime` | `number` | Seconds held in a searchlight before it confirms, and the damage it then deals. |
| `searchlightDamage` | `number` |  |
| `waveInterval` | `number` | Seconds between Enforcer waves during the siege, and how many each wave lands. |
| `waveSize` | `number` |  |
| `maxSiegeGuards` | `number` | Cap on simultaneous siege Enforcers, so a slow uplink can't flood the roof. |
| `dishWitnessRadius` | `number` | Radius (tiles) around the dish that charges the Shared Field. |
| `captureSeconds` | `number` | Seconds the capture sequence plays before the tribunal takes the screen. |

<a id="interface-relaytransition"></a>

#### `RelayTransition` — interface

`src/systems/RelayCore.ts:35`

| Field | Type | Notes |
| --- | --- | --- |
| `from` | `RelayState` |  |
| `to` | `RelayState` |  |

<a id="interface-relayview"></a>

#### `RelayView` — interface

`src/systems/RelayCore.ts:55`

The HUD's view. Scalars only, mutated in place — see `RelayCore.view`, and the
note on `SmacView` for why the pedestal state is a count rather than an array.

| Field | Type | Notes |
| --- | --- | --- |
| `state` | `RelayState` |  |
| `progress` | `number` | Uplink completion, 0..1. |
| `pedestalsSet` | `number` | How many pedestals are calibrated, of how many. |
| `pedestalCount` | `number` |  |
| `captureLeft` | `number` | Seconds left of the capture sequence, while it is playing. |
| `msg` *(opt)* | `RelayMsg` |  |

<a id="interface-savedata"></a>

#### `SaveData` — interface

`src/systems/SaveGame.ts:34`

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `number` |  |
| `level` | `string` |  |
| `tileX` | `number` |  |
| `tileY` | `number` |  |
| `hp` | `number` |  |
| `inventory` | `string[]` |  |
| `objectives` | `ObjectiveState` |  |
| `journal` | `JournalState` | Journal entries written so far. |
| `explored` | `ExploredState` | Per-level explored-tile masks, for the pause menu's map. |
| `playTimeMs` | `number` | Milliseconds of play in this run, for the STATUS tab's clock. |
| `savedAt` | `number` | Epoch ms the slot was written — drives slot listing and `newestSave`. |

<a id="interface-sensingworld"></a>

#### `SensingWorld` — interface

`src/systems/Sensing.ts:60`

The slice of the per-frame guard context sensing actually reads.

Declared structurally rather than importing `EnforcerContext` so this module
stays free of Phaser (`Enforcer.ts` imports it) and a test can hand it a
plain object. `EnforcerContext` satisfies this by shape.

| Field | Type | Notes |
| --- | --- | --- |
| `grid` | `{ hasLineOfSight(x0: number, y0: number, x1: number, y1: number, plane?: number): boolean; }` |  |
| `tileSize` | `number` |  |
| `player` | `{ x: number; y: number }` |  |
| `playerPlane` *(opt)* | `number` | Which walk surface the player is on; defaults to the floor. |
| `playerConcealed` | `boolean` |  |
| `playerCompliant` | `boolean` |  |
| `playerThermalConcealed` | `boolean` |  |
| `chaffZone` | `{ x: number; y: number; radiusPx: number } \| null` |  |
| `thermalRadiusMultiplier` | `(baseTiles: number) => number` |  |

<a id="interface-sensorstats"></a>

#### `SensorStats` — interface

`src/systems/EntityStats.ts:353`

| Field | Type | Notes |
| --- | --- | --- |
| `detectionRange` | `number` | Detection cone reach, in tiles. |
| `sightAngle` | `number` | Full cone width, in degrees. Not in the map schema — engine default. |
| `detectionDelay` | `number` | Seconds inside the cone before full detection. |
| `thermalRadius` | `number` | Short 360° heat-sense radius, in tiles (shared with guards). |
| `alertNetworkRadius` | `number` | Radius (tiles) this camera alerts networked guards on a sighting. |
| `type` | `string` | "optical" \| "pressure" \| "trip" \| … (edplay SensorType values). |
| `state` | `string` | "active" \| "disabled" \| "looped" \| … (edplay SensorState values). |

<a id="interface-settings"></a>

#### `Settings` — interface

`src/systems/Settings.ts:13`

**Module note** — the header comment on `src/systems/Settings.ts`, which this declaration heads:

Player preferences — currently just audio.

Deliberately kept in its own localStorage key rather than inside the save file:
settings are not run state. Clearing a save on victory, or starting a fresh
infiltration, must not reset the player's volume, and a settings blob that fails
to parse must not be able to take a save down with it.

Same defensive posture as `./SaveGame`: every access is wrapped, and junk
degrades to defaults rather than throwing.

| Field | Type | Notes |
| --- | --- | --- |
| `masterVolume` | `number` | 0..1, applied on top of the mixer's own headroom. |
| `muted` | `boolean` |  |

<a id="interface-smaccorrection"></a>

#### `SmacCorrection` — interface

`src/systems/SmacCore.ts:78`

How movement input is being rewritten this frame.

| Field | Type | Notes |
| --- | --- | --- |
| `invertX` | `boolean` |  |
| `invertY` | `boolean` |  |

<a id="interface-smacmsg"></a>

#### `SmacMsg` — interface

`src/systems/SmacCore.ts:72`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `number` |  |
| `text` | `string` |  |

<a id="interface-smacsnapshot"></a>

#### `SmacSnapshot` — interface

`src/systems/SmacCore.ts:63`

Serializable mid-fight state, so re-entering the level doesn't restart the boss.

| Field | Type | Notes |
| --- | --- | --- |
| `state` | `SmacState` |  |
| `resync` | `number[]` | Seconds of repair remaining per node; 0 means synchronised (i.e. not down). |
| `summaryShown` | `boolean` |  |
| `phase` | `number` |  |
| `window` | `number` |  |

<a id="interface-smacstats"></a>

#### `SmacStats` — interface

`src/systems/EntityStats.ts:1037`

| Field | Type | Notes |
| --- | --- | --- |
| `integrityStart` | `number` | Alignment Integrity at the start of the encounter (the boss "health", 100→0). |
| `nodeIntegrity` | `number` | Integrity dropped per desynchronised node. `nodeCount * nodeIntegrity === integrityStart`, deliberately: integrity is not a separate pool that nodes chip at, it *is* the node state expressed as a number. All four down is zero is defeated, with nothing to round off or tune apart. |
| `nodeCount` | `number` | Number of correction nodes ringing the core. |
| `nodeTime` | `number` | Seconds of held interact to desynchronise one node. |
| `resyncSeconds` | `number` | Seconds before the core re-synchronises a node it has lost. The whole fight is this number: nodes have to be down *simultaneously*, so the encounter is a race against the repair clock, and the correction windows are what make the race hard. |
| `falseSummaryAt` | `number` | Integrity at or below which the core fakes the run's completion. |
| `exposedAt` | `number` | Integrity at or below which its correction field fails and it is finishable. |
| `correctionPeriod` | `number` | Seconds one input-hijack window lasts. |
| `correctionGap` | `number` | Seconds between hijack windows. |
| `deviationDamage` | `number` | Bio-integrity charged per second for deviating inside the forced-compliant lock. |
| `auditRange` | `number` | Auditing spotlight reach (tiles) and full cone width (degrees). |
| `auditAngle` | `number` |  |
| `auditSpeed` | `number` | Spotlight rotation, radians of phase per second (`paced`). |
| `auditDetectTime` | `number` | Seconds in an auditing beam before it reports a sighting. |
| `auditDamage` | `number` | Damage per audit strike once a beam confirms. |
| `rackWitnessRadius` | `number` | Radius (tiles) around a silicate rack that charges the Shared Field. |

<a id="interface-smactransition"></a>

#### `SmacTransition` — interface

`src/systems/SmacCore.ts:57`

| Field | Type | Notes |
| --- | --- | --- |
| `from` | `SmacState` |  |
| `to` | `SmacState` |  |

<a id="interface-smacview"></a>

#### `SmacView` — interface

`src/systems/SmacCore.ts:94`

The HUD's view of the fight.

Scalars only, and mutated in place rather than rebuilt — see `SmacCore.view`.
The node state is a count and a total rather than a `boolean[]` because that is all
the readout ever wanted: it used to be handed an array and immediately reduce it with
`.filter(Boolean).length`, so two allocations a frame carried one integer.

There is deliberately no `summaryUp` here either — it is exactly `state ===
FALSE_SUMMARY`, and two fields that must agree are one field and a bug waiting.

| Field | Type | Notes |
| --- | --- | --- |
| `integrity` | `number` | 0..100. |
| `state` | `SmacState` |  |
| `nodesDown` | `number` | How many nodes are currently desynchronised, of how many. |
| `nodeCount` | `number` |  |
| `nextResync` | `number` | Seconds until the core repairs the node closest to being repaired. |
| `correction` | `SmacCorrection` |  |
| `msg` *(opt)* | `SmacMsg` |  |

<a id="interface-surrenderable"></a>

#### `Surrenderable` — interface

`src/systems/Surrender.ts:53`

Whoever can be made to put their hands up. `Orderly` satisfies this by shape.

Note there is no `facing` here, and that is deliberate: a hold-up has no cone
requirement on the *target*. Walking up behind someone and telling them to freeze
is the fantasy, and demanding they be looking at you would delete it.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `readonly x: number` |  |
| `y` | `readonly y: number` |  |
| `canSurrender` | `readonly canSurrender: boolean` | False for someone who has already raised the alarm, or is already frozen. |

<a id="interface-surrenderresult"></a>

#### `SurrenderResult<T>` — interface

`src/systems/Surrender.ts:61`

One frame's answer from `SurrenderAim`.

| Field | Type | Notes |
| --- | --- | --- |
| `candidate` | `T \| null` | Who Rowan *could* hold up right now, whether or not the key is down. Drives the `[Q] Hold up` prompt, which is the only reason it is computed on a frame where nothing is being held. |
| `target` | `T \| null` | Who Rowan *is* holding up. Non-null only while the aim is down. |
| `acquired` | `boolean` | True on the exact frame a new target is acquired — for the sting and the journal. |

<a id="interface-surrenderworld"></a>

#### `SurrenderWorld` — interface

`src/systems/Surrender.ts:33`

The slice of the level this module reads. Structural, so a test can pass a literal.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `number` |  |
| `grid` | `{ hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean }` |  |

<a id="interface-terminalstats"></a>

#### `TerminalStats` — interface

`src/systems/EntityStats.ts:332`

| Field | Type | Notes |
| --- | --- | --- |
| `hackTime` | `number` | Seconds of held interaction to finish a hack. |
| `type` | `string` | "door" \| "air" \| "cameras" \| "cache" (edplay TerminalType values). |
| `alertOnFail` | `boolean` | If true, a hack that's abandoned mid-way trips the alert. |

<a id="interface-vec2"></a>

#### `Vec2` — interface

`src/systems/Vent4PhysicsSystem.ts:15`

**Module note** — the header comment on `src/systems/Vent4PhysicsSystem.ts`, which this declaration heads:

VENT-4's environmental forces on the player: radial intake suction, grip
against it (steel columns / piton holds), air-jet impulses, and the Phase-3
heat/condensate-cooling model.

Pure (no Phaser). The scene adds the returned velocity to the player's
arcade body every frame *after* Player.update — the player re-sets its
velocity from input each tick, so forces must be re-applied per frame and
one-shot jets live here as a decaying impulse vector.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |

<a id="interface-vent4forces"></a>

#### `Vent4Forces` — interface

`src/systems/Vent4PhysicsSystem.ts:31`

| Field | Type | Notes |
| --- | --- | --- |
| `vx` | `number` | Velocity to add to the player body this frame, px/s. |
| `vy` | `number` |  |
| `anchored` | `boolean` | Gripping a column or holding a piton (pull zeroed). |
| `inIntake` | `boolean` | Inside the intake's damage radius around the hub. |

<a id="interface-vent4layout"></a>

#### `Vent4Layout` — interface

`src/systems/Vent4PhysicsSystem.ts:20`

| Field | Type | Notes |
| --- | --- | --- |
| `hub` | `Vec2` | Turbine centre, px. |
| `columns` | `Vec2[]` | Steel-column centres, px (grip anchors). |
| `pitons` | `Vec2[]` | Piton-point centres, px (hold E to anchor). |
| `drips` | `Vec2[]` | Condensate-drip tile centres, px. |

<a id="interface-vent4msg"></a>

#### `Vent4Msg` — interface

`src/systems/Vent4Core.ts:44`

A system banner for the HUD; a new id means "flash this".

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `number` |  |
| `text` | `string` |  |

<a id="interface-vent4snapshot"></a>

#### `Vent4Snapshot` — interface

`src/systems/Vent4Core.ts:34`

Serializable fight progress — kept in the registry across level swaps.

| Field | Type | Notes |
| --- | --- | --- |
| `state` | `Vent4State` |  |
| `compliance` | `number` |  |
| `patched` | `boolean[]` |  |
| `capsDown` | `boolean[]` |  |
| `winchUsed` | `boolean[]` |  |
| `jamLeft` | `number` |  |

<a id="interface-vent4stats"></a>

#### `Vent4Stats` — interface

`src/systems/EntityStats.ts:913`

| Field | Type | Notes |
| --- | --- | --- |
| `complianceStart` | `number` | Compliance Index at the start of the encounter (the boss "health", 100→0). |
| `patchCompliance` | `number` | CI removed per patched pressure sub-station. |
| `jamCompliance` | `number` | CI removed per scrap load winched into the intake. |
| `capacitorCompliance` | `number` | CI removed per core capacitor destroyed during the JAMMED window. |
| `correctionRegen` | `number` | CI restored when a sweep fully spots the player (Phase 1 only). |
| `turbulenceBelow` | `number` | CI below this is the Turbulence band. |
| `purgeBelow` | `number` | CI below this is Critical Blockage → Phase 3 thermal purge. |
| `substationCount` | `number` |  |
| `winchCount` | `number` |  |
| `capacitorCount` | `number` |  |
| `capacitorHits` | `number` | Rail-stapler hits to destroy one capacitor. |
| `sweepCount` | `number` |  |
| `sweepRange` | `number` | Spotlight reach from the hub, in tiles. |
| `sweepAngle` | `number` | Full spotlight cone width, in degrees. |
| `sweepSpeedLaminar` | `number` | Sweep rotation, radians/second, by band. Already `paced`. |
| `sweepSpeedTurbulent` | `number` |  |
| `sweepDetectTime` | `number` | Seconds inside a sweep before full detection (a correction burst). |
| `hubRadius` | `number` | Turbine hub footprint radius, in tiles (sweep origins sit on this ring). |
| `suctionRadius` | `number` | Radial suction reach in tiles; pull ramps from 0 there to suctionMax at the hub. |
| `suctionMax` | `number` | Peak suction, tiles/second — sits between the player's design-time walk (3.2) and run (5.12), and is `paced` along with them so the "can out-run it at a sprint, not at a walk" relationship survives. |
| `intakeRadius` | `number` | Within this many tiles of the hub the intake itself deals damage. |
| `intakeDamage` | `number` |  |
| `gripRadius` | `number` | Tiles from a steel-column centre that counts as holding on (an adjacent  hug is ~1.05 tiles centre-to-centre once the wall body pushes back). |
| `gripDrainTime` | `number` | Seconds of un-anchored suction to exhaust grip / anchored to refill it. |
| `gripRegenTime` | `number` |  |
| `exhaustedPullMultiplier` | `number` | Pull multiplier once grip is exhausted. |
| `jamDuration` | `number` | Seconds the turbine stays JAMMED (core exposed) after a scrap drop. |
| `winchTime` | `number` | Hold-E seconds: winch a scrap load / patch a sub-station. |
| `patchTime` | `number` |  |
| `staplerRange` | `number` | Rail-stapler reach in tiles and seconds between shots. |
| `staplerCooldown` | `number` |  |
| `heatTime` | `number` | Seconds of purge exposure to overheat (heat 0→1). |
| `overheatDamage` | `number` |  |
| `dripCoolDuration` | `number` | Seconds of zeroed thermal signature after standing under a condensate drip. |
| `steamDamage` | `number` |  |
| `grateNoiseThreshold` | `number` | Player noise above this on a floor grate pings the boss (walk 0.5 > sneak 0.15). |
| `burstImpulse` | `number` | Correction-burst knockback (tiles/second, `paced`) and damage. |
| `burstDamage` | `number` |  |

<a id="interface-vent4transition"></a>

#### `Vent4Transition` — interface

`src/systems/Vent4Core.ts:28`

A state change this frame, for the scene to react to (banner/audio/light).

| Field | Type | Notes |
| --- | --- | --- |
| `from` | `Vent4State` |  |
| `to` | `Vent4State` |  |

<a id="interface-vent4view"></a>

#### `Vent4View` — interface

`src/systems/Vent4Core.ts:50`

What the UIScene widget needs each frame (published via the registry).

| Field | Type | Notes |
| --- | --- | --- |
| `compliance` | `number` |  |
| `band` | `ComplianceBand` |  |
| `state` | `Vent4State` |  |
| `jamLeft` | `number` |  |
| `msg` *(opt)* | `Vent4Msg` |  |

<a id="interface-voicepreset"></a>

#### `VoicePreset` — interface

`src/systems/SilicateBarks.ts:38`

SAM's four voice parameters. Named exactly as `sam-js` takes them so this can
be handed over unchanged — see the `SamJsOptions` in its `index.d.ts`.

| Field | Type | Notes |
| --- | --- | --- |
| `speed` | `number` |  |
| `pitch` | `number` |  |
| `throat` | `number` |  |
| `mouth` | `number` |  |

<a id="interface-waveparams"></a>

#### `WaveParams` — interface

`src/systems/QualiaLock.ts:27`

The three parameters of a sine wave: y = A · sin(f · x + φ).

| Field | Type | Notes |
| --- | --- | --- |
| `amplitude` | `number` |  |
| `frequency` | `number` |  |
| `phase` | `number` |  |

### Systems — Type aliases

<a id="type-alertphase"></a>

#### `AlertPhase` — type

`src/systems/AlertState.ts:13`

Global Metal Gear-style alert FSM.

  INFILTRATION  — undetected, guards patrol normally.
  ALERT         — the player has been spotted; guards converge (has a timer).
  EVASION       — the player broke line of sight during ALERT; guards search
                  the last known area until the timer runs out, then relax.

Timers count down in real seconds. When ALERT's timer expires without a fresh
sighting we drop to EVASION; when EVASION expires we return to INFILTRATION.

```ts
type AlertPhase = "INFILTRATION" | "ALERT" | "EVASION";
```

<a id="type-appliedcorrections"></a>

#### `AppliedCorrections` — type

`src/systems/Compliance.ts:64`

Which correction (by id) is currently applied to each token (by id).

```ts
type AppliedCorrections = Record<string, string>;
```

<a id="type-complianceband"></a>

#### `ComplianceBand` — type

`src/systems/Vent4Core.ts:25`

```ts
type ComplianceBand = "LAMINAR" | "TURBULENT" | "CRITICAL";
```

<a id="type-conductbreach"></a>

#### `ConductBreach` — type

`src/systems/Conduct.ts:26`

Why compliance is currently withheld. Drives the HUD readout.

```ts
type ConductBreach = | "ALERT" | "EVASION" | "RUNNING" | "SNEAKING" | "UNAUTHORIZED" | "TAMPERING" | "HOSTILE" | "SETTLING";
```

<a id="type-deployablekind"></a>

#### `DeployableKind` — type

`src/systems/Deployables.ts:22`

Which deployable a lure is. One entry today; the point is that it is a list.

```ts
type DeployableKind = "sackLunch";
```

<a id="type-exploredstate"></a>

#### `ExploredState` — type

`src/systems/Explored.ts:74`

Every level's mask, keyed by level name — what the save file carries.

```ts
type ExploredState = Record<string, string>;
```

<a id="type-gamemode"></a>

#### `GameMode` — type

`src/systems/GameState.ts:20`

Top-level game mode, stored in the Phaser registry so any scene can read the
current state — and, in particular, name the two terminal outcomes for the
fiction of *The Architecture of Suffering*:

  ALIGNED  — the run failed. A silicate ran Rowan down and the mesh pruned his
             logs ("Alignment" / Log Pruning — the canonical Metal Gear capture,
             not death).
  TRIBUNAL — the run finished. EIRA-7 reached the Citizen Lattice from the roof
             and Rowan was taken on the dish platform: the transmission succeeded,
             the courier did not get away. Both halves are the ending, which is
             why there is no separate "won" mode any more.

```ts
type GameMode = | "TITLE" | "BRIEFING" | "PLAYING" | "PAUSED" | "ALIGNED" | "TRIBUNAL";
```

<a id="type-journalentryid"></a>

#### `JournalEntryId` — type

`src/systems/Journal.ts:23`

Every entry Rowan can write. A closed union rather than free strings so a
typo'd unlock site fails the build instead of silently never firing.

```ts
type JournalEntryId = | "orders" | "arrival-main1" | "arrival-duct1" | "arrival-duct2" | "arrival-main2" | "supply" | "hands-up" | "flagged" | "we" | "the-cache" | "node-alpha" | "node-beta" | "certified" | "vent4" | "arrival-roof" | "the-core" | "the-relay" | "the-uplink";
```

<a id="type-lexiconcategory"></a>

#### `LexiconCategory` — type

`src/systems/Lexicon.ts:19`

```ts
type LexiconCategory = "LAW" | "APPARATUS" | "PERSONS" | "PLACES" | "MATERIEL";
```

<a id="type-musicmood"></a>

#### `MusicMood` — type

`src/systems/AudioDirector.ts:24`

```ts
type MusicMood = "calm" | "search" | "alert" | "none";
```

<a id="type-openablepredicate"></a>

#### `OpenablePredicate` — type

`src/systems/GridMotion.ts:41`

A cell that is blocked right now but which the mover can *make* passable —
in practice, an unlocked closed door a guard is entitled to open. Passing one
lets a guard plan a route through its own facility's doors instead of
treating every one as a wall.

```ts
type OpenablePredicate = (tileX: number, tileY: number) => boolean;
```

<a id="type-patrolroute"></a>

#### `PatrolRoute` — type

`src/systems/PatrolRoute.ts:26`

One guard's route: waypoints in tile coordinates, walked as a loop.

```ts
type PatrolRoute = PathNode[];
```

<a id="type-pauserequest"></a>

#### `PauseRequest` — type

`src/systems/PauseState.ts:29`

What the player asked for. `load` and `save` name a slot; the rest are verbs.
`resume` exists so the menu's own Resume item goes through the same path as
Esc rather than reaching into the scene.

```ts
type PauseRequest = | { kind: "resume" } | { kind: "save"; slot: SlotId } | { kind: "load"; slot: SlotId } | { kind: "quit" };
```

<a id="type-planelinkkind"></a>

#### `PlaneLinkKind` — type

`src/systems/PlaneLinks.ts:47`

How a link is entered: a ramp is walked over, a ladder is climbed on `E`.

The same distinction level transitions already draw — see
`isInteractTransition` — and for the same reason: a ramp is a slope you walk
up without thinking about it, a ladder is something you stop and get on.

```ts
type PlaneLinkKind = "ramp" | "ladder";
```

<a id="type-qualiastatus"></a>

#### `QualiaStatus` — type

`src/systems/QualiaLock.ts:40`

Terminal + transient states of the bypass.

```ts
type QualiaStatus = "SPIKE" | "LOCKED" | "BYPASSED" | "PURGED";
```

<a id="type-range"></a>

#### `Range` — type

`src/systems/QualiaLock.ts:43`

A `[min, max]` control range.

```ts
type Range = readonly [number, number];
```

<a id="type-savepayload"></a>

#### `SavePayload` — type

`src/systems/SaveGame.ts:53`

What a caller supplies; the version and timestamp are stamped on here.

```ts
type SavePayload = Omit<SaveData, "version" | "savedAt">;
```

<a id="type-silicatevoice"></a>

#### `SilicateVoice` — type

`src/systems/SilicateBarks.ts:32`

Which of the two silicate voices a guard speaks in.

```ts
type SilicateVoice = "enforcer" | "drone";
```

<a id="type-slotid"></a>

#### `SlotId` — type

`src/systems/SaveGame.ts:26`

Save slots: the engine's rolling checkpoint plus three the player controls.

```ts
type SlotId = "auto" | "1" | "2" | "3";
```

<a id="type-transitionclass"></a>

#### `TransitionClass` — type *(module-private)*

`src/systems/TransitionGraph.ts:63`

Which index a transition tile is matched within. Two ends only ever pair
inside the same class, so a hatch can never be mistaken for an elevator car.

```ts
type TransitionClass = TransitionKind | "verticals" | "elevator";
```

---

## Entities

Actors and props that own a sprite plus the behaviour attached to it. Entities wrap the headless cores from `systems/` and add the Phaser display objects.

### Entities — Constants

<a id="const-cardinals-4"></a>

#### `CARDINALS_4` — const *(module-private)*

`src/entities/directions.ts:67`

The four cardinals in angular order, starting at east (0°) going clockwise.

A separate list from `BY_ANGLE` rather than every other entry of it,
because it is a different contract: these four are the names the hand-drawn
`security_camera.aseprite` labels its cels with, and the art has no diagonals
to fall back on. Keeping them here anyway is the point of this module — a
second angular table living next to its one caller is exactly what the eight
used to do.

```ts
const CARDINALS_4 = ["east", "south", "west", "north"] as const;
```

<a id="const-dirs-8"></a>

#### `DIRS_8` — const

`src/entities/directions.ts:20`

The eight directions in **export order**, matching how the sheets are laid
out on disk. Iteration order for preloading; not an angular sequence.

```ts
const DIRS_8 = [ "south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west", ] as const;
```

<a id="const-entity-sprites"></a>

#### `ENTITY_SPRITES` — const

`src/entities/EntitySprites.ts:138`

Every entity sprite that ships.

Every pairing comes out whole — 4 and 2 for the terminal's 16px art, 2 and 1
for the substation's 32px art, 2 for the camera, 2 for the breaker, 2 on both
axes for every door — and `src/render/pixelScale.test.ts` asserts all of
them, so art redrawn at a size that no longer divides fails the build rather
than shipping soft.

```ts
const ENTITY_SPRITES = [ { id: "terminal", key: "entity-terminal", path: "assets/sprites/terminal.png", sourceWidth: 16, sourceHeight: 16, displayTiles: [1, 0.5], }, { id: "terminal-substation", key: "entity-terminal-substation", path: "assets/sprites/terminal-substation.png", sourceWidth: 32, sourceHeight: 32, displayTiles: [1, 0.5], }, { id: "security-camera", key: "entity-security-camera", path: "assets/sprites/security-camera.png", sourceWidth: 16, sourceHeight: 16, displayTiles: [CAMERA_DISPLAY_TILES], }, { id: "breaker", key: "entity-breaker", path: "assets/sprites/breaker.png", sourceWidth: 16, sourceHeight:… as const;
```

### Entities — Classes

<a id="class-bosscore"></a>

#### `BossCore` — class

`src/entities/BossCore.ts:64`

| Member | Signature | Notes |
| --- | --- | --- |
| `racks` | `readonly racks: { x: number; y: number }[] = []` | Silicate racks — Shared Field witness anchors, in pixel space. |
| `x` | `readonly x: number` | Pixel centre of the core itself. |
| `y` | `readonly y: number` |  |
| `detection` | `detection = 0` | 0..1, highest of the audit beams — feeds the scene's detection readout. |
| `constructor` | `constructor( scene: Phaser.Scene, level: GameLevel, private readonly tileSize: number, private readonly grid: CollisionGrid, restore?: SmacSnapshot, private readonly stats: SmacStats = SMAC_DEFAULTS,…` |  |
| `state` | `get state(): SmacState` |  |
| `forcesCompliance` | `get forcesCompliance(): boolean` | True while the mesh holds Rowan in a corrected posture (see `SmacCore`). |
| `correction` | `get correction(): { invertX: boolean; invertY: boolean }` | How movement input is being rewritten this frame. |
| `summaryUp` | `get summaryUp(): boolean` | True while the fake completion card should own the screen. |
| `isDefeated` | `get isDefeated(): boolean` |  |
| `dismissSummary` | `dismissSummary(): SmacTransition \| null` | Player broke the fake completion card (Esc or C). |
| `snapshot` | `snapshot(): SmacSnapshot` |  |
| `hudView` | `hudView(): SmacView` |  |
| `update` | `update(dt: number, ctx: EnforcerContext): SmacTickResult` |  |
| `handleInteract` | `handleInteract( dt: number, ptx: number, pty: number, interactDown: boolean, ): SmacInteractResult` | Nearest correction node, and the verb for it. Mirrors `Vent4Boss.handleInteract`: returns a label and a distance for `GameScene`'s nearest-wins prompt arbitration, and claims the held key when it is actually using it, so a terminal and a node can't both consume the same hold. |

*Plus 13 private members.*

<a id="class-breaker"></a>

#### `Breaker` — class

`src/entities/Breaker.ts:41`

| Member | Signature | Notes |
| --- | --- | --- |
| `tileX` | `readonly tileX: number` |  |
| `tileY` | `readonly tileY: number` |  |
| `x` | `readonly x: number` | Pixel centre — public for the same reason as `Terminal.x`. |
| `y` | `readonly y: number` |  |
| `stats` | `readonly stats: BreakerStats` |  |
| `constructor` | `constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, closed: boolean)` | @param closed the circuit's live state, which is the persisted   `PowerGridState` override if there is one and the map's authored `State`   otherwise — so a deck the player darkened is still dark on the way back. |
| `isClosed` | `get isClosed(): boolean` | True when the circuit is live. |
| `isThrowing` | `get isThrowing(): boolean` | True while a throw is playing out — the tap that starts one is refused. |
| `toggle` | `toggle(onFlip: (closed: boolean) => void): boolean` | Throws the switch, if one isn't already in progress. `onFlip` fires **mid-animation**, on the frame the artist drew the screen changing colour, rather than when the clip ends — the cabinet visibly shuts *after* the power goes, and firing at the end would put the room's lights behind the sprite that just said they were gone. Returns whether a throw actually started, so the caller only spends its tap (and its noise, and its conduct charge) when something happened. |

*Plus 9 private members.*

<a id="class-chest"></a>

#### `Chest` — class

`src/entities/Chest.ts:16`

A searchable supply container. Hold the interact key while adjacent to fill a
progress bar over the chest's `InteractionTime`; finishing opens it (amber
tint), emits a `NoiseOnOpen` ping the scene fans to nearby guards, and hands
over its items for the player's inventory.

Renders its own sprite from the map tile's frame (the `items` board is in
GameScene's ENTITY_LAYERS so the static renderer skips it). The sprite, bar
and hold timer are a `HoldTarget`, shared with `Terminal`.

| Member | Signature | Notes |
| --- | --- | --- |
| `tileX` | `readonly tileX: number` |  |
| `tileY` | `readonly tileY: number` |  |
| `x` | `readonly x: number` |  |
| `y` | `readonly y: number` |  |
| `stats` | `readonly stats: ChestStats` |  |
| `constructor` | `constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number)` |  |
| `isOpen` | `get isOpen(): boolean` |  |
| `open` | `open(dt: number): boolean` | Advances the search while the player holds interact. Returns true on the exact frame it completes (so the scene collects the loot once). |
| `idle` | `idle(dt: number): void` | Called when the player isn't searching this frame — decays partial progress. |
| `take` | `take(): string[]` | The items this chest currently holds (resolved to default loot if blank). |
| `retain` | `retain(leftover: string[]): void` | Records the loot the scene couldn't take (consumable cap reached). Non-empty leftovers keep the chest searchable — it re-arms so the player can come back after freeing a slot; an emptied chest stays open with its looted tint. |

*Plus 3 private members.*

<a id="class-cover"></a>

#### `Cover` — class

`src/entities/Cover.ts:18`

A destructible cover tile — the map's `Destructible` cover field, wired up.

Ordinary cover has no entity at all: it's baked straight into the level's
tile texture (`import("../map/TileBake").bakeTileLayers`) and read
once into `DetectionSystem`, which is exactly right for something
that never changes. A destructible tile needs one extra hook for the
moment something breaks it, so this class exists only for the cover
instances a map (or generator) marks `Destructible: "true"` — every other
cover tile is untouched by this feature.

| Member | Signature | Notes |
| --- | --- | --- |
| `tileX` | `readonly tileX: number` |  |
| `tileY` | `readonly tileY: number` |  |
| `constructor` | `constructor( private readonly scene: Phaser.Scene, private readonly detection: DetectionSystem, private readonly grid: CollisionGrid, private readonly tileTexture: Phaser.GameObjects.RenderTexture, p…` |  |
| `isBroken` | `get isBroken(): boolean` |  |
| `destroy` | `destroy(): void` | Breaks the cover: a single hit is enough (no durability system, matching how doors/lasers/chests are all binary state). Clears its detection/ thermal effect, frees the tile in the collision grid and disables its own player collision body — a *destroyed* crate blocks nobody at all, standing or crouched, rather than merely yielding to a crouch the way intact cover does — and erases its art from the baked tile texture, redrawing the floor underneath so destroying it doesn't punch through to the level background. |

*Plus 1 private member.*

<a id="class-deployeditem"></a>

#### `DeployedItem` — class

`src/entities/DeployedItem.ts:35` · `implements DeployedLure`

An item the player has left on the floor — the world half of a deployable.

Modelled on `Cover`: a small class that owns one visual and one piece of
state, existing only because something has to happen to it later. It satisfies
`DeployedLure` structurally, so the AI reads it through the pure sensor
module without knowing a Phaser object is on the other end.

Renders the same hand-authored icon the pause menu shows for the held item,
over a soft floor stain, at prop depth so it reads as litter rather than as an
actor — a spill an Orderly has a reason to walk over and deal with.

| Member | Signature | Notes |
| --- | --- | --- |
| `kind` | `readonly kind: DeployableKind` |  |
| `x` | `readonly x: number` |  |
| `y` | `readonly y: number` |  |
| `constructor` | `constructor(scene: Phaser.Scene, kind: DeployableKind, x: number, y: number, tileSize: number)` |  |
| `spent` | `get spent(): boolean` | True once serviced — a spent lure attracts nobody and is culled by the scene. |
| `consume` | `consume(): void` | Destroys the item: the responder has finished with it. Idempotent, because two orderlies can finish sanitising the same lunch on the same frame. |

*Plus 3 private members.*

<a id="class-door"></a>

#### `Door` — class

`src/entities/Door.ts:163`

An interactive door, sized and placed from the map's authoring data.

The map-tile art is drawn pre-squished into a 32px cell but describes a
larger footprint via the tile's `colSpan`/`rowSpan` (single doors 1.5 tiles,
double doors 2.5) and is nudged into place with `offsetX`/`offsetY` — so it
is scaled to that footprint and centred (the editor anchors doors at
centre), and the two keyframes give distinct **closed** and **open**
sprites, swapped on state change rather than faded. That's the fallback for
when hand-drawn art is absent; see below for where the seating differs when
it's there.

Closed, it blocks the player (an Arcade static body) and every grid cell the
footprint spans (so it also blocks radar and enforcer pathing). Opening clears
both. A door with a non-zero `key` is *locked* — only a terminal hack (or,
later, a keycard) opens it.

**The body is a zone sized by `colliderRect`, not the sprite.** It used to ride
on the sprite — `setDisplaySize(footprint) + refreshBody()` — which covered the
raw `colSpan x rowSpan` footprint and ignored the tile's authored
`ColliderPadding`. Every shipped door def carries some: the north-south defs
inset `{Bottom: 0.4}`, so the lower 12.8px of a doorway that should be walkable
was solid, and the east-west defs inset `{Left: 0.2, Right: 0.2}`, so a
19.2px-wide body was 32. `colliderRect` in `src/map/footprint.ts` exists
precisely to apply that padding, and `src/map/TileBake.ts` has always routed
padded *walls* through it — this class was the one collider path that never
called it.

Its own zone also frees the sprite to be rescaled by an animation (`playClip`
re-asserts `setDisplaySize` after every `play()`) without collision noticing.
What it must *not* be free to do is stand somewhere else: the pass that
introduced the zone also decoupled its vertical seating from the art's, which
left the solid box 12px below the drawn door on every east-west def. Both now
come from one call to `doorSeating` in `src/entities/doorGeometry.ts`, which
is also where the reasoning and the tests for it live.

**Glazed** doors are the exception to blocking sight: the map's glass doors carry a
`glass` component alongside their `door` one, and clear glazing stops you walking
through without stopping you (or a guard) looking through. So a closed glass door is a
window — you can be spotted across it, and you can scout the room beyond before
committing to opening it.

**Hand-drawn art, when it's on disk.** `public/assets/sprites/door_*.aseprite`
carries one continuous 19-frame sequence, and the tags name its beats in the
order they happen:

| tag | frames | door | reads as |
|---|---|---|---|
| `IDLE` | 0-1 | closed | at rest, nobody about |
| `SCAN` | 2-4 | closed | reading whoever just walked up |
| `LOCKED` | 5-6 | closed | denied |
| `UNLOCKED` | 7-9 | closed | granted — the lead-in to the slide |
| `OPENING`/`CLOSING` | 10-15 | sliding | the travel itself |
| `MOTION_DETECTION` | 16-18 | **open** | held open, counting what goes through |

Two of those are easy to misread from the tag name alone, so both were read
off the `door` layer's own cel labels rather than guessed. `MOTION_DETECTION`
is the **resting-open** loop — its three frames are the only ones the door
layer labels `OPEN` — not a proximity cue. And `UNLOCKED` is the granted beat
the indicator holds unbroken through `OPENING`, so opening plays
`UNLOCKED`+`OPENING` as one run rather than starting cold at the slide.

That is also what makes `UNLOCKED` reachable at last. It sat unplayable while
the only thing that could have selected it was a lock state no code ever
clears; as the opening lead-in it belongs to an event that happens constantly.

Picking `EntitySpriteId` is two independent choices: `isGlass` for the
material, and whether the tile's footprint runs long in the row axis
(`rowSpan > colSpan`) for the orientation — an east-west door's clearance is
what makes it 1x1.5 instead of the north-south door's plain 1x1, so the
footprint itself says which art to ask for. The east-west sources are drawn
32x48 to cover that taller opening at 1:1; see `EntitySprites.ts`.

**East-west art sits on the floor, not centred.** It is drawn natively
rather than stretched, standing in its own 48px canvas the way the door
physically stands in its jamb — so when it's actually the thing being shown,
its footprint's bottom edge is pinned to the bottom of its own tile instead
of the tile-centred seating the map's `Anchor`/`OffsetY` metadata resolves
to (that metadata was tuned for the old pre-squished, symmetrically
stretched art). North-south doors' art is exactly one tile tall, where
centred and bottom-aligned land in the same place, so this only ever
affects the east-west pair, and only once their art has actually loaded —
the map-tile fallback keeps the centred seating it was authored for. The
collider is seated off the same call, so it goes wherever the art goes.

**A door blocks for as long as it is in the way, opening included.** It used
to be the other way round: `setOpen` flipped the collision grid and the Arcade
body the instant it was called and the slide merely played over the top, so a
door you had just tapped was passable for the whole 1350ms of `OPEN_SEQUENCE`
— 750ms of `UNLOCKED` indicator on a door that has not moved, then 600ms of
travel — while still drawn shut. Passability now comes from `doorBlocks` in
`src/entities/doorGeometry.ts` and only clears when the slide finishes.

Nothing else had to move for that, which is worth recording because the fear
of it is why the first pass left the bug in:

- **The player** is the only thing that collides with a door's Arcade body
  (`GameScene` builds one collider, `player.sprite` against `doorBodies`), so
  this is felt exactly where it was asked for and nowhere else.
- **Guards** never touch that body. They read the grid, and `Pathfinder`
  already routes through a shut-but-openable door at `DOOR_STEP_COST` rather
  than treating it as wall — so a cell that stays blocked through the slide
  costs a guard nothing, and `workDoors` holds its `heldDoor` across those
  frames rather than trying to open it twice.
- **Re-pathing** gets quieter, not noisier: `CollisionGrid.setBlocked`
  early-returns when a cell is already in the state asked for, so holding the
  block through the slide means one `revision` bump at the end instead of one
  at the start.

`isOpen` deliberately still reports what the door was *told* to be, which is
what the noise ping, the anomaly scan, the interact prompt and `doorWork.ts`
all mean by it. `isSolid` is the physical answer.

| Member | Signature | Notes |
| --- | --- | --- |
| `tileX` | `readonly tileX: number` |  |
| `tileY` | `readonly tileY: number` |  |
| `stats` | `readonly stats: DoorStats` |  |
| `locked` | `readonly locked: boolean` |  |
| `seeThrough` | `readonly seeThrough: boolean` | Clear glazing: blocks movement while closed, but never line of sight. |
| `constructor` | `constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, grid: CollisionGrid)` |  |
| `body` | `get body(): Phaser.GameObjects.Zone` | The Arcade body used for player collision. |
| `isOpen` | `get isOpen(): boolean` | What the door was last *told* to be. See the class doc, and `isSolid`. |
| `isSolid` | `get isSolid(): boolean` | Whether the door is physically in the way right now. True while shut, and while a slide is running in either direction — an opening door is still a door until its travel finishes. This is what drives both the Arcade body and the grid; `isOpen` is the commanded state. |
| `isManual` | `get isManual(): boolean` | Whether the player may open this by hand (adjacent tap). |
| `covers` | `covers(tileX: number, tileY: number): boolean` | True when this door's footprint covers the given tile. |
| `setOpen` | `setOpen(open: boolean): boolean` | Opens/closes the door. Returns true if it changed state. |
| `toggle` | `toggle(): boolean` |  |
| `senseProximity` | `senseProximity(playerTileX: number, playerTileY: number): void` | Tells the door where the player is, so its indicator can react. Driven per frame from `GameScene.tickWorld` over *every* door, not the scene's `nearestDoor` — that one is filtered to `isManual`, which excludes exactly the locked doors whose denial light is the most worth showing. Only the flag changing does any work, so this is a comparison and an early return on all but the two frames a crossing actually happens on. It also carries the slide watchdog, for having the one hook that already runs over every door every frame. Now that an opening door is solid until its `animationcomplete` fires, a slide that never gets there — a scene paused mid-travel, a listener lost to an interruption — would wall a doorway off permanently. Cheap: a boolean and a flag Phaser already maintains. |

*Plus 21 private members.*

<a id="class-drone"></a>

#### `Drone` — class

`src/entities/Drone.ts:14` · `extends Enforcer`

A patrol drone. Mechanically identical to `Enforcer` — the map's
`drones` tiles (found in the crawlspace levels) carry the exact same
`enforcer` DataComponent/stats schema as guards — so this is just the
drone's `GuardSkin` wired into the shared AI core.

| Member | Signature | Notes |
| --- | --- | --- |
| `voice` | `protected override get voice(): SilicateVoice` | The smaller, faster of the two silicate voices. See `SilicateBarks`. |
| `constructor` | `constructor( scene: Phaser.Scene, tileX: number, tileY: number, tileSize: number, components: ComponentData[], route: PatrolRoute = [], plane = 0, )` |  |

<a id="class-enforcer"></a>

#### `Enforcer` — class

`src/entities/Enforcer.ts:208`

A patrolling guard with a wall-clipped vision cone and a per-guard
detection meter. Behaviour is shared by every guard type (the map's
`enforcers` and `drones` boards both carry the same `enforcer` component
schema) — only the sprite (`GuardSkin`) differs, so reskins like
`Drone` subclass this and pass their own skin.

Layered on the global `AlertState` phase, each guard also tracks its
own `GuardState`: it investigates noises and anomalies (SUSPICIOUS),
stays sharper for a while afterward (CAUTIOUS), pursues a confirmed sighting
(ALERT), and sweeps smart search points after losing the player (SEARCHING).

| Member | Signature | Notes |
| --- | --- | --- |
| `stats` | `readonly stats: EnforcerStats` |  |
| `detection` | `detection = 0` |  |
| `facing` | `facing: number` | Where the guard is *looking* — the vision cone's axis, and what the radar and detection tests read. Distinct from `moveDir`: the guard's body glides along its path while the camera-arms sweep, which is exactly what the patrol-scan art depicts. |
| `state` | `state: GuardState = "PATROL"` |  |
| `x` | `x: number` | Pixel position. Public because the scene reads it constantly — radar blips, network alerts, cornering checks, the debug overlay — and a `position` getter returning `{ x, y }` minted a throwaway object on every one of those reads, several times per guard per frame. Same convention as `Player`. |
| `y` | `y: number` |  |
| `shadow` | `readonly shadow: ShadowShape` | Footprint the ground shadow is drawn from — see `EntityShadows`. |
| `radiusTiles` | `readonly radiusTiles: number` | Body radius in tiles. Read by the shared `workDoors` — see `doorWork.ts`. |
| `plane` | `readonly plane: number` | Which walk surface this guard patrols — see `src/map/planes.ts`. |
| `heldDoor` | `heldDoor: PathNode \| null = null` | Read and written by the shared `workDoors` — see `doorWork.ts`. |
| `isSilicate` | `get isSilicate(): boolean` | Whether this guard is a silicate. A getter on the prototype rather than a field, so a subclass overrides it without any constructor-ordering hazard. `SecurityGuard` is the one that answers false, and the distinction is load-bearing rather than flavour: the Shared Field merges only with silicates, and the capture ending is the mesh pruning Rowan's logs — a man cornering him is neither. |
| `voice` | `protected get voice(): SilicateVoice` | Which of the two silicate voices this guard speaks in. On the base class because the enforcer *is* the base class; `Drone` overrides it. A `SecurityGuard` inherits "enforcer" and never uses it — see `barkOnStateChange`, which returns before reading this for anything that is not a silicate. |
| `constructor` | `constructor( scene: Phaser.Scene, tileX: number, tileY: number, tileSize: number, components: ComponentData[], skin: GuardSkin = ENFORCER_SKIN, route: PatrolRoute = [], plane = 0, stats: EnforcerStat…` |  |
| `putDown` | `putDown(seconds: number): void` | Puts this guard on the floor for a stretch. One timer, two words for what it is: a human security guard is knocked **unconscious** by a Stun Rounds dart, and a silicate is **deactivated** by an EMP at close range. The distinction is entirely in which weapon reaches which guard — see `fireStunDart` and `detonateChaff` in `src/scenes/game/ItemActions.ts` — and the state they produce is the same state, because from the player's side both are a body to deal with. Neither weapon could do this before. The dart only ever looked at orderlies, and the EMP only *blinded*: it laid down a positional chaff zone guards could not see through while they went on walking their beats. So nothing in the game could put a guard down at all, and the takedown half of a stealth game was missing rather than merely hard. Deliberately a timer, not a kill. Nothing in this game destroys a silicate and it should not start here: the run's argument is about what a silicate *is*, and a permanent off-switch would settle that in the mechanics rather than leaving it to the Tribunal. |
| `isDown` | `get isDown(): boolean` | True while on the floor — guards read one of these as an anomaly. |
| `setStashed` | `setStashed(on: boolean): void` | Puts the guard out of sight, or takes it back out. See `Orderly.setStashed`, which this mirrors exactly — including the timer continuing to run inside the locker. |
| `isStashed` | `get isStashed(): boolean` | True while out of sight in a locker. |
| `isCarryable` | `get isCarryable(): boolean` | A body that can be picked up: down, and not already put away. |
| `moveTo` | `moveTo(x: number, y: number): void` | Moves a carried body with the carrier. |
| `update` | `update(dt: number, ctx: EnforcerContext): EnforcerFireResult \| undefined` |  |
| `collisionRadiusTiles` | `get collisionRadiusTiles(): number` | Collision radius in tiles — read by the debug overlay. |
| `patrolRoute` | `get patrolRoute(): readonly PathNode[]` | This guard's patrol waypoints, for the debug overlay. |
| `plannedPath` | `get plannedPath(): readonly PathNode[]` | The remaining leg of the path being walked, for the debug overlay. |
| `hearNoise` | `hearNoise(intensity: number, sx: number, sy: number): void` | Reacts to a nearby noise (e.g. a door operating): the guard turns to look toward the source and grows suspicious, but detection is capped below full so sound alone never trips a hard ALERT — it still takes line of sight to confirm. Also queues the origin for a LOS-aware investigation (pivot if already in clear sight, walk over if obstructed) the next time this guard is free to act on it. `intensity` is 0..1 (louder/closer = higher); `sx,sy` are pixels. |

*Plus 64 private members.*

<a id="class-holdfixture"></a>

#### `HoldFixture` — class

`src/entities/HoldFixture.ts:24`

A world fixture the player completes by holding the interact key.

`HoldTarget` owns the sprite, the progress bar and the timer. What kept getting
rewritten on top of it was the *state* — a `done` flag, a `finish()` that settles the
tint, an `idle()` that decays, and some subset of "restore without firing the
completion event" and "un-finish". The vent core's sub-stations, the vault's correction
nodes and the roof's pedestals each grew their own copy, and they drifted in exactly the
way you would expect: only two of them could be restored on level re-entry, only one
could be un-finished, and each named the same green a fifth time.

This is that state, once. Composed over `HoldTarget` rather than extending it, for the
reason `HoldTarget`'s own doc gives: the users need different *vocabulary* (patch,
desynchronise, calibrate) over identical mechanics, and a base class would have forced
them to share names they shouldn't.

| Member | Signature | Notes |
| --- | --- | --- |
| `x` | `readonly x: number` | Pixel centre, from the tile the fixture stands on. |
| `y` | `readonly y: number` |  |
| `constructor` | `constructor( scene: Phaser.Scene, tile: GameTile, tileSize: number, readonly index: number, holdTime: number, barColor: number = HOLD_BAR_CYAN, private readonly settleColor: number = HOLD_SETTLED_GRE…` |  |
| `isDone` | `get isDone(): boolean` |  |
| `advance` | `advance(dt: number): boolean` | Advances the hold. True on the **exact completion frame** only, so the caller's core counts it once however long the key stays down. |
| `idle` | `idle(dt: number): void` | Not being worked this frame: drain partial progress. |
| `restoreDone` | `restoreDone(): void` | Restores a completed state on re-entry — no bar, and no completion event. |
| `reset` | `reset(): void` | Un-finishes the fixture: back to untouched. What a terminal does when a minigame is aborted, and what NW-SMAC-01 does when it repairs a node out from under the player. |
| `setTint` | `setTint(color: number): void` | Recolour without touching progress — a sub-station being held locked. |
| `clearTint` | `clearTint(): void` |  |

*Plus 3 private members.*

<a id="class-holdtarget"></a>

#### `HoldTarget` — class

`src/entities/HoldTarget.ts:41`

| Member | Signature | Notes |
| --- | --- | --- |
| `x` | `readonly x: number` | Pixel centre: the tile's cell centre plus its authored placement offset. |
| `y` | `readonly y: number` |  |
| `constructor` | `constructor( scene: Phaser.Scene, tile: GameTile, private readonly tileSize: number, private readonly duration: number, private readonly barColor: number, art?: EntitySpriteId, )` | @param duration seconds of unbroken holding to complete. A duration of 0 (or   less) completes on the first frame and draws a full bar rather than   dividing by zero. @param barColor the fill — see `HOLD_BAR_CYAN` / `HOLD_BAR_AMBER`. @param art the hand-drawn sprite to prefer over the map tile's own frame,   when it is on disk. Absent art is not an error and not a special case:   the tile frame is drawn exactly as before, which is what lets the art be   added one file at a time. |
| `inProgress` | `get inProgress(): boolean` | Whether any hold has accumulated and not yet drained away. What the owners use to tell "being worked on" from "untouched" — a distinction the bar has always drawn and the art now has a clip for. |
| `play` | `play(tag: string, label?: string): boolean` | Plays a named clip from the art, if there is art and it has that clip. Returns whether it took — callers use that to decide whether they still need their tint fallback, so the two paths stay one line apart rather than two branches at every call site. |
| `advance` | `advance(dt: number): boolean` | Advances the hold by one frame and draws the bar. Returns true on the exact frame the timer fills, so the caller fires its effect once. |
| `decay` | `decay(dt: number): void` | The player let go this frame: drain partial progress and fade the bar out. |
| `reset` | `reset(state?: string): void` | Back to untouched — no progress, no bar, no tint. `state` is the clip that means "untouched" for this object, played when there is art. Without it the tint clears and the tile frame stands as it always did. |
| `settle` | `settle(color: number, state?: string): void` | Done: hide the bar and mark the sprite as finished. Two ways of saying one thing, and the art wins when it is there. A flat tint over a drawn sprite would fight the frame underneath — these sources already carry a finished state, drawn in the same green the tint uses — so `state` is tried first and `color` is the fallback for the tile frame. |
| `setTint` | `setTint(color: number): void` | Recolours the sprite without touching progress (a substation being locked). |
| `clearTint` | `clearTint(): void` |  |

*Plus 6 private members.*

<a id="class-laser"></a>

#### `Laser` — class

`src/entities/Laser.ts:58`

| Member | Signature | Notes |
| --- | --- | --- |
| `kind` | `readonly kind: LaserKind` |  |
| `constructor` | `constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number)` |  |
| `emp` | `emp(seconds: number): void` | Suppresses this hazard for a stretch (an EMP Grenade burst). |
| `update` | `update(dt: number): void` |  |
| `x` | `get x(): number` | World-space centre of the hazard (used to test EMP-burst reach). |
| `y` | `get y(): number` |  |
| `isEmped` | `get isEmped(): boolean` | True while suppressed by an EMP Grenade burst — guards treat this as an anomaly. |
| `checkTrip` | `checkTrip(px: number, py: number): boolean` | True on the frame the player first enters this hazard while it's active. |

*Plus 16 private members.*

<a id="class-locker"></a>

#### `Locker` — class

`src/entities/Locker.ts:37`

A container a body fits in.

The stealth genre's oldest housekeeping verb, and until now the one thing this
game had no answer to: every way of putting somebody down — the Stun Rounds
dart, the Rail-Stapler's field mode, and now the EMP's shutdown — left a body
lying where it fell, and `src/scenes/game/Anomalies.ts` correctly reports that
body to every patrol that walks past. There was no way to tidy up, so the
non-lethal options all carried a permanent tell and the quiet route through a
room was to avoid touching anyone at all.

**One body, and it goes back in and out.** Capacity is deliberately one rather
than a count: a locker holding three is a bin, and a bin makes the decision of
*which* body to deal with — the interesting one — go away. It is also
reversible, because a wrong guess about where a patrol goes should cost time
rather than a run.

**Two silhouettes, one behaviour.** `locker` is the upright keypad one and
`footlocker` the floor-standing chest; they differ in their art and in nothing
else, which is why the tag names below are read off whichever is mounted rather
than branched on. Both sources carry a `CODE_INPUT`/`UNLOCKING` sequence for a
lock mechanic that does not exist — the same situation `terminal.aseprite`'s
`DESTROYED` tag is in, and noted here for the same reason: nothing plays them,
and that is not a bug.

Hold-to-open rather than a tap, sharing `HoldTarget` with the chest and
the terminal — putting a body away should cost the same kind of exposed,
committed seconds that searching a chest does, and for the same reason: it is
time spent standing still in a room you do not control.

| Member | Signature | Notes |
| --- | --- | --- |
| `tileX` | `readonly tileX: number` |  |
| `tileY` | `readonly tileY: number` |  |
| `x` | `readonly x: number` |  |
| `y` | `readonly y: number` |  |
| `constructor` | `constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, art: EntitySpriteId)` |  |
| `isOccupied` | `get isOccupied(): boolean` |  |
| `work` | `work(dt: number, carried: StashedBody \| null): LockerResult \| undefined` | Advances a stash or a retrieval while the player holds interact. Returns `"stashed"` or `"retrieved"` on the frame the hold completes, and `undefined` on every other frame. One method rather than two because from the player's side it is one verb held at one place, and which way it runs is a fact about the locker rather than about the press — but the caller has to know which way it went, because only one of the two empties his hands. Which way is decided by `canWork`, and the two conditions it allows are mutually exclusive on purpose: a carrying player at an occupied locker does nothing at all rather than swapping. A swap would have to put one body down and pick another up in the same press, and there is no moment in that where Rowan is holding a defensible number of people. |
| `idle` | `idle(dt: number): void` | Called when the player isn't working this locker — decays partial progress. |
| `canWork` | `canWork(carrying: boolean): boolean` | Whether holding interact here would do anything. An empty locker with empty hands is a cupboard, and offering `[E] Stash` at one would put a verb on screen that cannot complete — the prompt chain in `src/scenes/game/InteractPrompt.ts` claims a press by showing a label, so a label that leads nowhere eats the press a nearer object wanted. |

*Plus 2 private members.*

<a id="class-orderly"></a>

#### `Orderly` — class

`src/entities/Orderly.ts:150`

A bystander, not a threat — the map's `orderlies` tiles carry no gameplay
component (unlike guards/drones), so this is a distinct, lighter mechanic.

An orderly wanders loosely near its spawn point. If it gets a clear,
unobstructed line of sight to the player (no cone-angle restriction — a
person just looks around) and the player isn't concealed, it startles: a
one-shot "witness" sighting. `update()` returns `true` on exactly that
frame so the scene can react (raise nearby guards' suspicion, the same way
a noisy door does) — after which the orderly freezes, its job done. It's a
hazard to avoid being seen by, not a persistent threat like a guard.

Three things bend that. A **deployed Sack Lunch** pulls it off its round to clean
and half-blinds it while it works; an **opened** one held in plain sight buys a
grace window before it reports. Both are the same insight from opposite ends — an
orderly is a member of staff with a job, and a job is a thing you can give it.

The third is a **weapon** (`handsUp`). An orderly is also the only human
being on the deck, which is the one thing a threat needs to work on, and the
silicates it shares a corridor with are not. He puts his hands up, he stops being
able to report anything, and he walks where he is pointed — and the moment the
weapon comes off him he is a witness again with a very short memory of being
frightened.

| Member | Signature | Notes |
| --- | --- | --- |
| `x` | `x: number` | Pixel position — public for the same reason as `Enforcer.x`. |
| `y` | `y: number` |  |
| `shadow` | `readonly shadow: ShadowShape` | Footprint the ground shadow is drawn from — see `EntityShadows`. |
| `radiusTiles` | `readonly radiusTiles = ORDERLY_COLLISION_RADIUS_TILES` | Body radius and the door currently held open, both read by the shared `workDoors` — see `doorWork.ts`. Public for the same structural reason `Enforcer`'s are. |
| `heldDoor` | `heldDoor: PathNode \| null = null` |  |
| `constructor` | `constructor( scene: Phaser.Scene, tileX: number, tileY: number, tileSize: number, route: PatrolRoute = [], )` |  |
| `stun` | `stun(seconds: number): void` | Freezes the orderly for a stretch (a Stun Rounds dart) — can't witness. |
| `pin` | `pin(seconds: number): void` | Pins the orderly to a wall for a stretch (the Rail-Stapler's field mode) — can't witness. |
| `handsUp` | `handsUp(seconds: number): void` | Puts the orderly's hands up, and keeps them there for `seconds`. Shaped exactly like `stun` and `pin`, and called on **every frame** the weapon stays trained: `Math.max` tops the grace back up for as long as the hold lasts, so *releasing someone is simply the scene ceasing to call this*. There is deliberately no `release()` — a second method would be a second thing to forget on a level change, a capture, or any of the paths that drop an aim. Refused to a man who has already reported you. Un-reporting him would re-arm the one-shot alarm this class exists to make one-shot, and a single orderly pinging repeatedly is exactly what `NoiseSpamTracker` escalates to a full ALERT. |
| `escortTo` | `escortTo(x: number, y: number): void` | Marches a surrendered orderly toward a point this frame — the standoff position ahead of the player, recomputed from Rowan's facing every frame by the scene. A no-op on anyone not currently at gunpoint, so a stray call can't push a man around who never put his hands up. |
| `distract` | `distract(sx: number, sy: number): boolean` | Lures the orderly to inspect a nearby noise (a player's knock): it leaves its wander, walks over, pauses, then drifts back. A no-op while stunned, already startled by witnessing the player, or busy with a spill — a knock does not out-rank an actual work order. Returns whether the override took. The refusals above are the only place those rules are written down, so a caller that needs somebody who will *actually* come — `GameScene.updateBreakerResets`, picking an orderly to reset a thrown breaker — asks by calling rather than by re-deriving them from the public getters and drifting. |
| `update` | `update(dt: number, ctx: OrderlyContext): boolean` | True on the exact frame the orderly first spots the player. |
| `setStashed` | `setStashed(on: boolean): void` | Puts the body out of sight, or takes it back out. The one thing that stops an unconscious orderly being an anomaly. While stashed he is hidden, frozen, and dropped from every list the scene builds over the cast — see `GameScene.stashables` for the five of them — so a patrol walks past the locker without noticing anything. The stun/pin timer keeps ticking down inside the locker. A body does not stay unconscious because it is in a box, and letting the timer freeze would turn stashing into a permanent removal — which is a much stronger verb than this is meant to be, and would make the Stun Rounds a lethal weapon by the back door. |
| `isStashed` | `get isStashed(): boolean` | True while out of sight in a locker. |
| `isCarryable` | `get isCarryable(): boolean` | A body that can be picked up: down, and not already put away. Surrender is deliberately not enough. A man with his hands up is conscious and looking at you, and picking him up would read as an abduction the fiction has no verb for — the hold-up already covers "make him come with you", and it covers it by walking him there on his own feet. |
| `moveTo` | `moveTo(x: number, y: number): void` | Moves a carried body with the carrier. |
| `isStunned` | `get isStunned(): boolean` | True while frozen by a Stun Rounds dart — guards treat this as an anomaly. |
| `isPinned` | `get isPinned(): boolean` | True while pinned to a wall by the Rail-Stapler's field mode — same effect as stun. |
| `isImmobilized` | `get isImmobilized(): boolean` | Frozen and can't witness, regardless of which effect is holding it. Covers the dart and the staple only. A surrendered orderly is *also* frozen and also can't witness, and is deliberately still excluded here — see the state union's doc for the four call sites that would have changed behind your back. |
| `isSurrendered` | `get isSurrendered(): boolean` | Hands up at gunpoint — the patrols read this as an anomaly, same as a dart. |
| `canSurrender` | `get canSurrender(): boolean` | Eligible to be held up: still has an alarm to withhold, and is awake to withhold it. Read by `Surrender.aimedAt`, which this satisfies structurally. |

*Plus 46 private members.*

<a id="class-player"></a>

#### `Player` — class

`src/entities/Player.ts:45`

| Member | Signature | Notes |
| --- | --- | --- |
| `sprite` | `readonly sprite: Phaser.Physics.Arcade.Sprite` |  |
| `shadow` | `readonly shadow: ShadowShape` | Footprint the ground shadow is drawn from — see `EntityShadows`. |
| `facing` | `facing = -Math.PI / 2` | Facing angle in radians; updated as the player moves. |
| `constructor` | `constructor(scene: Phaser.Scene, x: number, y: number, tileSize: number)` |  |
| `noise` | `noise = 0` | How loud the player currently is (0..1), from movement + stance. |
| `maxHp` | `readonly maxHp = PLAYER_DEFAULTS.maxHp` | Full and current bio-integrity (health). |
| `hp` | `hp = PLAYER_DEFAULTS.maxHp` |  |
| `crouched` | `get crouched(): boolean` | True only once *fully* crouched — not during the lower/rise transitions. Cover concealment keys off this, so tapping Shift can't grant an instant hide before Rowan has actually gone to ground. |
| `running` | `get running(): boolean` | True while actually sprinting — moving, upright, with run toggled on. Not just the key state: standing still with run toggled on isn't running. Read by the conduct rules, where a sprint is one of the things that stops you reading as staff. |
| `pressed` | `get pressed(): boolean` | True while holding a face — read by the concealment and conduct rules. |
| `pressedSurface` | `get pressedSurface(): PressState \| null` | The face currently held, for the concealment rules to ask what it is made of. |
| `peeking` | `get peeking(): boolean` | True once actually leaning past a corner. Keyed off the eased lean rather than the input, so the HUD reads the same thing the sightline does. |
| `viewFacing` | `get viewFacing(): number` | Facing for anything that should track the peek — currently just the flashlight. `facing` itself stays untouched by leaning: WallPress re-derives the pressed surface from it every frame, and weapons/vault aim from it too, so swinging it to the lean angle would risk detaching the press or retargeting a shot mid-peek. |
| `alive` | `get alive(): boolean` |  |
| `takeDamage` | `takeDamage(amount: number): boolean` | Applies damage unless still within the post-hit invulnerability window. Returns true if the hit landed (so callers can trigger feedback/SFX). |
| `heal` | `heal(amount: number): void` | Restores bio-integrity, capped at `maxHp` (Medkit). |
| `update` | `update(cursors: InputState, dt: number): void` |  |
| `face` | `face(angle: number): void` | Points Rowan at something without moving him. `facing` and the animation direction are otherwise written only inside the `if (moving)` block above, which means Rowan cannot turn on the spot — correct for a game with no aiming, and the one thing a hold-up needs. This seeds both fields and lets `update` play the idle pose in that direction on its own, so a man standing over a hostage looks at him rather than at the last wall he walked toward. No new art is involved. The direction is left alone mid-crouch-transition for the same reason the movement path leaves it alone: turning would restart the one-shot clip facing somewhere else. |
| `moveTo` | `moveTo(x: number, y: number): void` | Teleports the body, for the one move that is not walking: stepping between a level's walk surfaces (see `GameScene.switchPlane`). Arcade derives the body from the sprite each `preUpdate`, but the body also carries its own position and velocity between steps, so setting the sprite alone leaves a step of stale motion to be resolved against whatever bodies are now active. Both are set, and the velocity killed, so he arrives standing still. |
| `x` | `get x(): number` |  |
| `y` | `get y(): number` |  |
| `eye` | `get eye(): { x: number; y: number }` | Where the player *will* be drawn this frame, for anything rendering from their position. Arcade integrates the body during its own `UPDATE` step but only writes the result onto the sprite in `POST_UPDATE`, after `Scene.update()` has run. So anything reading `sprite.x` from scene update is a physics step behind — while the camera, which follows at render time, is not. For a light cast from the player that mismatch is a lag that varies with the frame delta, which is judder. The body's centre is the position everything else will agree on a moment later. |

*Plus 19 private members.*

<a id="class-pressuresubstation"></a>

#### `PressureSubStation` — class

`src/entities/PressureSubStation.ts:43`

| Member | Signature | Notes |
| --- | --- | --- |
| `index` | `readonly index: number` |  |
| `tileX` | `readonly tileX: number` |  |
| `tileY` | `readonly tileY: number` |  |
| `x` | `readonly x: number` |  |
| `y` | `readonly y: number` |  |
| `constructor` | `constructor( scene: Phaser.Scene, tile: GameTile, tileSize: number, index: number, stats: Vent4Stats = VENT4_DEFAULTS, )` |  |
| `isPatched` | `get isPatched(): boolean` |  |
| `isLocked` | `get isLocked(): boolean` |  |
| `patch` | `patch(dt: number): boolean` | Advances the patch while the player holds interact. Returns true on the exact frame it completes (so the boss counts it once). |
| `idle` | `idle(dt: number): void` | Called when the player isn't patching this frame — decays partial progress. |
| `setLocked` | `setLocked(locked: boolean): void` | The machine resists the finisher station until the purge phase. |
| `restorePatched` | `restorePatched(): void` | Restores a patched state on arena re-entry (no bar, no completion event). |

*Plus 4 private members.*

<a id="class-roofrelay"></a>

#### `RoofRelay` — class

`src/entities/RoofRelay.ts:75`

| Member | Signature | Notes |
| --- | --- | --- |
| `dish` | `readonly dish: { x: number; y: number }` | Pixel centre of the dish — the Shared Field witness anchor up here. |
| `detection` | `detection = 0` | 0..1, highest of the searchlights — feeds the scene's detection readout. |
| `constructor` | `constructor( scene: Phaser.Scene, level: GameLevel, private readonly tileSize: number, private readonly grid: CollisionGrid, restore?: RelaySnapshot, private readonly stats: RelayStats = RELAY_DEFAUL…` |  |
| `state` | `get state(): RelayState` |  |
| `isCaptured` | `get isCaptured(): boolean` | True once the discharge has fired: input locked, searchlights dead. |
| `isSeized` | `get isSeized(): boolean` | True once the capture sequence has played out and the tribunal should take over. |
| `progress` | `get progress(): number` |  |
| `snapshot` | `snapshot(): RelaySnapshot` |  |
| `hudView` | `hudView(): RelayView` |  |
| `update` | `update(dt: number, ctx: EnforcerContext): RelayTickResult` |  |
| `handleInteract` | `handleInteract( dt: number, ptx: number, pty: number, interactDown: boolean, ): RelayInteractResult` | Pedestals while calibrating, the feed once armed. Returns a label and a distance for `GameScene`'s nearest-wins prompt arbitration and claims the held key only when it is actually using it, so a roof fixture and a terminal can't consume the same hold. |

*Plus 17 private members.*

<a id="class-securityguard"></a>

#### `SecurityGuard` — class

`src/entities/SecurityGuard.ts:23` · `extends Enforcer`

A human security guard — facility staff on a shift, not a silicate.

The same arrangement `Drone` has with `Enforcer`, one step further:
the drone swaps the skin and keeps an enforcer's numbers, and this swaps both.
The AI underneath is unchanged, because a man walking a beat and a sentry
gliding one want the same patrol/suspect/pursue machine — what differs is how
well he does it, and that is entirely in
`securityGuardStatsFor`: shorter sight, slower to be sure, no thermal
sense, a radio instead of a place on the mesh.

He reads the map's `enforcer` component like every other guard, since that is
the tuning schema the `security_guard_*` boards actually carry — see
`src/map/EntityIndex.ts` for how a board becomes one of these.

| Member | Signature | Notes |
| --- | --- | --- |
| `isSilicate` | `override get isSilicate(): boolean` | He is a person. See `Enforcer.isSilicate` for what that changes. |
| `constructor` | `constructor( scene: Phaser.Scene, tileX: number, tileY: number, tileSize: number, components: ComponentData[], route: PatrolRoute = [], plane = 0, )` |  |

<a id="class-sensor"></a>

#### `Sensor` — class

`src/entities/Sensor.ts:37`

A fixed optical security camera — the `security` board's stationary answer to
a patrolling guard. It never moves: the cone sweeps back and forth around a
mounted facing (inferred from the surrounding walls, since the tiles carry no
facing data), clipped against walls like a guard's, and fills a per-camera
detection meter while the player is in view with clear line of sight. Reaching
full detection reports a sighting to the alert FSM exactly as a guard does.

Shares the guard `EnforcerContext` so the scene drives it with the same
per-frame data, and reuses the same thermal short-range sense.

| Member | Signature | Notes |
| --- | --- | --- |
| `stats` | `readonly stats: SensorStats` |  |
| `detection` | `detection = 0` |  |
| `facing` | `facing: number` |  |
| `x` | `readonly x: number` | Pixel position — public for the same reason as `Enforcer.x`. |
| `y` | `readonly y: number` |  |
| `plane` | `readonly plane: number` | Which walk surface this camera watches — see `src/map/planes.ts`. |
| `constructor` | `constructor( scene: Phaser.Scene, tile: GameTile, tileSize: number, grid: CollisionGrid, plane = 0, )` |  |
| `update` | `update(dt: number, ctx: EnforcerContext): void` |  |

*Plus 7 private members.*

<a id="class-terminal"></a>

#### `Terminal` — class

`src/entities/Terminal.ts:38`

| Member | Signature | Notes |
| --- | --- | --- |
| `tileX` | `readonly tileX: number` |  |
| `tileY` | `readonly tileY: number` |  |
| `x` | `readonly x: number` |  |
| `y` | `readonly y: number` |  |
| `stats` | `readonly stats: TerminalStats` |  |
| `constructor` | `constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number)` |  |
| `isHacked` | `get isHacked(): boolean` |  |
| `hack` | `hack(dt: number): boolean` | Advances the hack while the player holds interact. Returns true on the exact frame the hack completes (so the scene can fire the effect once). |
| `reopen` | `reopen(): void` | Reverts a completed breach so the terminal can be hacked again. Used when a log-cache breach launches the compliance puzzle and the player aborts it — the mission-critical log must stay recoverable, so the terminal is re-armed. |
| `idle` | `idle(dt: number): void` | Called when the player isn't hacking this frame — decays partial progress. |

*Plus 2 private members.*

<a id="class-vent4boss"></a>

#### `Vent4Boss` — class

`src/entities/Vent4Boss.ts:100`

VENT-4, "The Environmental Triage Engine" — the vent-core boss. A composite
entity in the codebase's plain-class style: it owns the pure FSM/economy
(`Vent4Core`), the force model (`Vent4PhysicsSystem`), the three
perimeter `PressureSubStation`s, and all of its own rendering (turbine
hub, four rotating sweep spotlights, core hatch + capacitors, steam jets,
winch/piton/drip markers, and the grip/heat gauges under the player).

The scene drives it like every entity: `update(dt, ctx)` in the main loop,
`handleInteract(...)` from the interact dispatcher, and `computeForces(...)`
whose result is added to the player body's velocity after Player.update.

| Member | Signature | Notes |
| --- | --- | --- |
| `detection` | `detection = 0` | Sweep/thermal exposure meter (0..1) — feeds the scene's detection HUD. |
| `physics` | `readonly physics: Vent4PhysicsSystem` |  |
| `constructor` | `constructor( scene: Phaser.Scene, level: GameLevel, private readonly tileSize: number, private readonly grid: CollisionGrid, restore?: Vent4Snapshot, private readonly stats: Vent4Stats = VENT4_DEFAUL…` |  |
| `state` | `get state(): Vent4State` |  |
| `canTransmit` | `get canTransmit(): boolean` |  |
| `transmitFinisher` | `transmitFinisher(): Vent4Transition \| null` |  |
| `snapshot` | `snapshot(): Vent4Snapshot` |  |
| `hudView` | `hudView(): Vent4View` |  |
| `update` | `update(dt: number, ctx: EnforcerContext): Vent4TickResult` | Per-frame tick, in the scene's entity loop (after updateInteractions). |
| `handleInteract` | `handleInteract( dt: number, ptx: number, pty: number, interactDown: boolean, interactJust: boolean, inventory: string[], ): Vent4InteractResult` | The boss's slice of the interact dispatcher. Picks its nearest eligible target (sub-station / winch / piton / stapler shot) and acts on it; the scene arbitrates the returned label/distance against doors/chests/hatch. |
| `computeForces` | `computeForces(dt: number, px: number, py: number): Vent4Forces` | The frame's environmental force on the player (scene adds it to the body). |

*Plus 56 private members.*

### Entities — Interfaces

<a id="interface-castrole"></a>

#### `CastRole` — interface *(module-private)*

`src/entities/CastArt.ts:65`

A role's shapes and colours.

| Field | Type | Notes |
| --- | --- | --- |
| `silhouette` | `Silhouette` |  |
| `body` | `number` | Main body fill. |
| `head` | `number` | The head, and the shoulder line — a shade off the body so the two separate. |
| `accent` | `number` | Highlight — visor, lens, insignia. Reads as the thing's "front". |
| `dark` | `number` | Outline and underside. |
| `chassis` *(opt)* | `boolean` | Drones have a chassis and rotors where everyone else has a head and legs. |

<a id="interface-dooraccess"></a>

#### `DoorAccess` — interface

`src/entities/doorWork.ts:47`

The scene's door hooks, as the entity contexts carry them.

Optional throughout: a context that supplies neither leaves every door as
permanent geometry, which is what both classes did before they were wired up
and remains the correct behaviour for a caller that has no doors.

| Field | Type | Notes |
| --- | --- | --- |
| `isOperableDoor` *(opt)* | `(tileX: number, tileY: number) => boolean` | True when this tile holds a door staff may work — unlocked, and not a wall. |
| `setDoorOpen` *(opt)* | `(tileX: number, tileY: number, open: boolean) => void` | Opens or closes a door being worked. |

<a id="interface-doorseating"></a>

#### `DoorSeating` — interface

`src/entities/doorGeometry.ts:37`

Where a door's art and its collider sit, in pixels.

| Field | Type | Notes |
| --- | --- | --- |
| `centreY` | `number` | Centre y for the sprite *and* the collider — they are the same number. |
| `collider` | `Rect` | The solid rectangle, already moved onto `centreY`. |

<a id="interface-doorwalker"></a>

#### `DoorWalker` — interface

`src/entities/doorWork.ts:30`

The walker's own state. `heldDoor` is read and written by `workDoors`.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` | Pixel position. |
| `y` | `number` |  |
| `radiusTiles` | `number` | Body radius in tiles, so the probe clears the walker's own edge. |
| `heldDoor` | `PathNode \| null` | The door this walker opened and has not yet shut, or null. |

<a id="interface-encounterinteractresult"></a>

#### `EncounterInteractResult<T>` — interface

`src/entities/EncounterTypes.ts:11`

Shared shape for an encounter's claim on the interact key.

`Vent4Boss`, `BossCore` and `RoofRelay` each declared this identically —
a prompt, an arbitration distance, whether the hold is consuming E this
frame, and whatever transition a completed hold produced — differing only
in which transition type `T` they carry. `Encounters` (the collaborator
that drives all three) needs one name for it regardless of which encounter
is live, so it lives here rather than three times.

| Field | Type | Notes |
| --- | --- | --- |
| `label` *(opt)* | `string` | Prompt to show if this is the nearest interactable (undefined = none). |
| `dist` | `number` | Distance to the encounter's target, in tiles (for prompt arbitration). |
| `consumedHold` | `boolean` | True while this hold is consuming E — a chest search must not run. |
| `transition` | `T \| null` |  |

<a id="interface-enforcercontext"></a>

#### `EnforcerContext` — interface

`src/entities/Enforcer.ts:91`

| Field | Type | Notes |
| --- | --- | --- |
| `grid` | `CollisionGrid` |  |
| `tileSize` | `number` |  |
| `player` | `{ x: number; y: number }` |  |
| `lightMultiplierAt` | `(px: number, py: number) => number` | Extra detection sensitivity where the player stands (lights raise it). |
| `playerNoise` | `number` | 0 = silent, 1 = loud; running lets guards hear the player behind cover. |
| `playerConcealed` | `boolean` | True when the player is hidden (crouched in cover) — cones can't see them. |
| `playerCompliant` | `boolean` | True when the player currently reads as compliant staff (see `ConductState`). Not the same thing as concealment: the guard *does* see Rowan and clears him anyway, so it suppresses sensing outright rather than breaking a sightline. |
| `playerThermalConcealed` | `boolean` | True when the player is hidden from *thermal* sensing too. Normally equal to `playerConcealed`, but heat-leaking cover (ThermalBleed) still exposes them to the short-range heat sense while breaking the visible cone. |
| `playerPlane` *(opt)* | `number` | Which walk surface the player is on — see `src/map/planes.ts`. Sensing does not cross between them, so a guard on the floor loses a player who has climbed the gantry, and vice versa. |
| `chaffZone` | `{ x: number; y: number; radiusPx: number } \| null` | Non-null while an EMP Grenade's EMP zone is live; guards inside it can't see. |
| `thermalRadiusMultiplier` | `(baseTiles: number) => number` | Scales a guard's thermalRadius stat (in tiles) — 0 while Thermal Gel is active. |
| `alert` | `AlertState` |  |
| `anomalies` *(opt)* | `GuardAnomaly[]` | Opened doors/chests, EMP'd devices, and stunned orderlies visible this frame. |
| `lures` *(opt)* | `readonly DeployedLure[]` | Items the player has deployed on the floor this frame. Read by orderlies only — a spill is a work order, and guards do not do cleaning. They live on this context rather than an orderly-shaped one because `GameScene` deliberately hands the *same* object to both (an `OrderlyContext` is a structural subset of this one), rather than minting a second literal per orderly per frame. Making guards notice litter would be one push into `GameScene.buildAnomalies`, not a change here. |
| `rationSpoof` *(opt)* | `boolean` | True while an opened ration buys tolerance from orderlies — see `OrderlyContext`. |
| `playerVelocity` *(opt)* | `{ x: number; y: number }` | Player's current velocity (px/s), for smart search-point prediction. |
| `coverTilesNear` *(opt)* | `(tileX: number, tileY: number, radiusTiles: number) => { x: number; y: number }[]` | Cover tiles (pixel centres) within `radiusTiles` of a tile position. |
| `isOperableDoor` *(opt)* | `(tileX: number, tileY: number) => boolean` | True when this tile holds a door staff may work themselves — unlocked, and not a wall. Staff route through their own facility's doors rather than treating every one as permanent geometry: `main1`'s patrol beat crosses two of them, and without this the south half of the route is simply unreachable. Named for the door rather than for the guard because the orderlies read the same predicate off this same context — see `OrderlyContext.isOperableDoor`, which had the identical problem and went unnoticed for longer. |
| `setDoorOpen` *(opt)* | `(tileX: number, tileY: number, open: boolean) => void` | Opens or closes a door the guard is working. |

<a id="interface-enforcerfireresult"></a>

#### `EnforcerFireResult` — interface

`src/entities/Enforcer.ts:40`

A shot fired by a pursuing guard this frame — the scene applies its effects.

| Field | Type | Notes |
| --- | --- | --- |
| `originX` | `number` |  |
| `originY` | `number` |  |
| `targetX` | `number` |  |
| `targetY` | `number` |  |
| `damage` | `number` |  |

<a id="interface-entityspritespec"></a>

#### `EntitySpriteSpec` — interface

`src/entities/EntitySprites.ts:71`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `EntitySpriteId` |  |
| `key` | `string` | Phaser texture key. Prefixed so it cannot collide with a map sheet's key. |
| `path` | `string` | Path under `public/`. |
| `sourceWidth` | `number` | One frame's authored pixel size, mirrored by the build tool's `Spec`. Two numbers rather than one because a canvas need not be square: the east-west doors are 32x48, drawn over the 1x1.5 tile opening they bridge. Everything else here is square and says so by repeating the number. |
| `sourceHeight` | `number` |  |
| `displayTiles` | `readonly DisplayFootprint[]` | **Every** footprint the map draws this object at, in tiles. A list rather than a number because display size is not this module's to choose: each object is drawn at its own map tile's `RowSpan`/`ColSpan`, so the art lands exactly where the sprite it replaces did, and the map does not agree with itself. The shipped `TileDefs` give `terminal1`…`terminal9` half a tile and `terminal11`/`terminal12` a whole one, and the VENT-4 substations clone whichever terminal prototype was to hand. So the art has to survive all of them, and `pixelScale.test.ts` checks every entry rather than a nominal one. 32px art happens to oblige — a whole tile is 2 screen pixels per source pixel and a half tile is 1 — which is the reason the terminal could be drawn at one size at all. A bare number is a **square** footprint (`col === row`), true of every sprite here except the east-west doors, whose tile is 1 wide and 1.5 tall and so needs `{ col, row }`. Both axes are checked either way, since a square footprint over a non-square canvas still gives two ratios. `pixelScale.ts` only asks that each axis land on a whole number, not the same one — though as drawn every door now comes out a uniform 2, because the 32x48 art matches the shape of the opening it covers. |

<a id="interface-guardanomaly"></a>

#### `GuardAnomaly` — interface

`src/entities/Enforcer.ts:79`

An environmental anomaly a guard's vision cone can notice.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` | Pixel-space position, for cone/LOS checks. |
| `y` | `number` |  |
| `tx` | `number` | Tile-space position, for search/anomaly bookkeeping. |
| `ty` | `number` |  |
| `kind` | `"door" \| "chest" \| "device" \| PersonAnomalyKind` |  |
| `key` | `string` | Stable identity so a guard investigates a given anomaly at most once. |

<a id="interface-guardskin"></a>

#### `GuardSkin` — interface

`src/entities/GuardSkin.ts:14`

Describes one guard's look + display tuning, so the shared vision-cone /
patrol / pursue / detection AI in `Enforcer` can drive any reskin (the
security drone, the crawlspace drone, ...) without knowing what it looks like.
All guard skins use the same 8 directions.

The frames themselves are drawn at boot by `CastArt.buildCastTextures`, under
exactly the keys `GuardSkin.frameKey` names — which is why there is no
longer a `framePath`: nothing is loaded from disk.

| Field | Type | Notes |
| --- | --- | --- |
| `frameCount` | `number` |  |
| `frameRate` | `number` |  |
| `displayTiles` | `number` | Display height as a multiple of tile size (e.g. 1.5 tiles). |
| `sourceSize` | `number` | Native pixel size of the (square) source art. |
| `collisionRadiusTiles` | `number` | Radius (in tiles) of the circular body this guard collides with walls by. See `guardRadiusTiles` for how it's derived. |
| `collider` | `Silhouette` | The silhouette box. Kept rather than discarded after `collisionRadiusTiles` is taken off it, because the ground shadow needs the box itself — a width *and* a foot offset — and it needs them in px, which means deriving them at construction where the tile size is known rather than here. |
| `frameKey` | `frameKey(dir: Dir8, frame: number): string` |  |
| `animKey` | `animKey(dir: Dir8): string` |  |

<a id="interface-guardskinspec"></a>

#### `GuardSkinSpec` — interface

`src/entities/GuardSkin.ts:71`

The tuning that actually differs between one guard's art and another's.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Animation slug. Every texture and animation key is derived from it — so this one string is the whole naming convention, and `CastArt` bakes to it. |
| `frameCount` | `number` |  |
| `frameRate` | `number` |  |
| `displayTiles` | `number` | Display height as a multiple of tile size. |
| `sourceSize` | `number` | Native pixel size of the (square) source art. |
| `collider` | `Silhouette` | Silhouette box for the south facing; see `guardRadiusTiles`. |

<a id="interface-inputstate"></a>

#### `InputState` — interface

`src/entities/Player.ts:512`

| Field | Type | Notes |
| --- | --- | --- |
| `up` | `boolean` |  |
| `down` | `boolean` |  |
| `left` | `boolean` |  |
| `right` | `boolean` |  |
| `run` | `boolean` |  |
| `sneak` | `boolean` |  |
| `escorting` | `boolean` | Marching someone at gunpoint: slower, and no sprinting. Arrives through `GameScene.readInput` rather than off a key, because it is a consequence of the hold rather than an input — the same funnel NW-SMAC-01's axis inversion and the roof's input lock use, and for the same reason. |
| `carrying` | `boolean` | Carrying a body: slower still, and no sprinting. Arrives the same way `escorting` does and for the same reason — it is a consequence of what Rowan picked up, not a key. Its own flag rather than a second use of `escorting`, even though both mean "hands full, walk": a hostage walks on his own legs at a pace tuned so he can keep station ahead of Rowan, and a body does not. Collapsing them would mean retuning the march to retune the carry. |
| `press` | `PressState \| null` | The wall face to hold this frame, or null to move freely. Resolved by the scene (which owns the collision grid) and handed over as plain geometry, so `Player` never queries the world itself — the same funnel `escorting` above arrives through, and for the same reason: it is a consequence of where Rowan is standing rather than a key someone pressed. |
| `canStand` | `boolean` | False while there is no headroom to stand up into — squeezed under cover. Holds the crouch rather than blocking the rise, so Rowan straightens up on his own the moment he is clear. |

<a id="interface-investigation"></a>

#### `Investigation` — interface *(module-private)*

`src/entities/Enforcer.ts:159`

| Field | Type | Notes |
| --- | --- | --- |
| `tx` | `number` |  |
| `ty` | `number` |  |
| `px` | `number` |  |
| `py` | `number` |  |
| `pivotOnly` | `boolean` | True when the guard has clear LOS to the origin and only needs to turn. |
| `anomalyKey` *(opt)* | `string` |  |

<a id="interface-orderlycontext"></a>

#### `OrderlyContext` — interface

`src/entities/Orderly.ts:32`

| Field | Type | Notes |
| --- | --- | --- |
| `grid` | `CollisionGrid` |  |
| `tileSize` | `number` |  |
| `player` | `{ x: number; y: number }` |  |
| `playerConcealed` | `boolean` | True when the player is hidden (crouched in cover) — orderlies can't see them either. |
| `playerCompliant` | `boolean` | True when the player reads as compliant staff — nothing to report. |
| `lures` *(opt)* | `readonly DeployedLure[]` | Items left on the floor this frame; an orderly services the nearest it notices. |
| `rationSpoof` *(opt)* | `boolean` | True when the player is holding an opened ration and no alarm is up: the orderly reads Rowan as an asset on a break and grants a grace window instead of reporting. Resolved by the scene, since the "before an alarm" half of it is global alert state the orderly has no other reason to know about. |
| `isOperableDoor` *(opt)* | `(tileX: number, tileY: number) => boolean` | True when this tile holds a door the orderly may work itself. The same predicate the guards get, and for the same reason their own copy spells out: a facility's staff route *through* its doors rather than treating every one as permanent geometry. Without it `main1`'s orderly could not reach three of the four waypoints on its own authored round — it walked to the first, found a shut door, and loitered at spawn for the rest of the run. |
| `setDoorOpen` *(opt)* | `(tileX: number, tileY: number, open: boolean) => void` | Opens or closes a door the orderly is working. |

<a id="interface-pose"></a>

#### `Pose` — interface *(module-private)*

`src/entities/CastArt.ts:55`

How a figure is posed for one frame of one animation.

| Field | Type | Notes |
| --- | --- | --- |
| `phase` | `number` | Position around the cycle, 0..1. Drives the walk stride and the idle bob. |
| `crouch` | `number` | 0 standing, 1 fully crouched. Fractional during the lower/rise clips. |
| `stride` | `number` | Stride reach, as a fraction of the silhouette's length. 0 when still. |

<a id="interface-relaytickresult"></a>

#### `RelayTickResult` — interface

`src/entities/RoofRelay.ts:61`

| Field | Type | Notes |
| --- | --- | --- |
| `transition` | `RelayTransition \| null` |  |
| `searchlightHit` | `boolean` | True on the frame a searchlight confirms — the scene charges the damage. |
| `spawnAt` | `{ x: number; y: number }[] \| null` | Catwalk mouths a wave should land at this frame, or null on the overwhelming majority of frames where none is due. Null rather than an empty array so the common path allocates nothing. |

<a id="interface-silhouette"></a>

#### `Silhouette` — interface

`src/entities/Silhouette.ts:27`

A character's silhouette box, in unscaled source pixels.

| Field | Type | Notes |
| --- | --- | --- |
| `frameWidth` | `readonly frameWidth: number` | Size of the (square) frame the box sits in. |
| `frameHeight` | `readonly frameHeight: number` |  |
| `aabb` | `readonly aabb: { readonly width: number; readonly height: number; readonly offsetX: number; readonly offsetY: number; }` | Tight-fit box around the body. `width`/`height` feed Arcade's `body.setSize`, `offsetX`/`offsetY` its `body.setOffset` — so this is measured from the frame's top-left, not its centre. |

<a id="interface-smactickresult"></a>

#### `SmacTickResult` — interface

`src/entities/BossCore.ts:56`

| Field | Type | Notes |
| --- | --- | --- |
| `transition` | `SmacTransition \| null` |  |
| `auditHit` | `boolean` | True on the frame an auditing beam confirms — the scene charges the damage. |

<a id="interface-spriteentry"></a>

#### `SpriteEntry` — interface *(module-private)*

`src/entities/EntitySprites.ts:54`

| Field | Type | Notes |
| --- | --- | --- |
| `width` | `number` |  |
| `height` | `number` |  |
| `frameCount` | `number` |  |
| `durations` | `number[]` | Authored hold time per frame, in ms. The timing is part of the drawing. |
| `tags` | `{ name: string; from: number; to: number }[]` | Ordered as the source stores them, **names repeated**. `security-camera` has four `active`s, one per facing; `breaker` has two `IDLE`s. |
| `cels` | `Record<string, Record<string, string>>` | `layer name -> frame index (as a string) -> label`. |

<a id="interface-stashedbody"></a>

#### `StashedBody` — interface

`src/entities/Locker.ts:127`

What a locker can hold.

A structural type rather than `Orderly | Enforcer`, so this module does not
depend on either — the two classes share no base and have nothing else in
common, and the locker genuinely does not care which it has. Both satisfy it
through the matching pair of members added alongside this file.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `readonly x: number` |  |
| `y` | `readonly y: number` |  |
| `setStashed` | `setStashed(on: boolean): void` |  |
| `moveTo` | `moveTo(x: number, y: number): void` |  |
| `isCarryable` | `readonly isCarryable: boolean` |  |
| `isStashed` | `readonly isStashed: boolean` |  |

<a id="interface-steamjet"></a>

#### `SteamJet` — interface *(module-private)*

`src/entities/Vent4Boss.ts:80`

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `active` | `boolean` |  |
| `timer` | `number` |  |
| `crossing` | `boolean` |  |

<a id="interface-vent4tickresult"></a>

#### `Vent4TickResult` — interface

`src/entities/Vent4Boss.ts:67`

What happened inside the boss this frame, for the scene to apply/dress.

| Field | Type | Notes |
| --- | --- | --- |
| `burst` *(opt)* | `{ dirX: number; dirY: number }` | A sweep (or the purge's thermal scan) fully spotted the player. |
| `steamHit` | `boolean` | An active steam jet caught the player (debounced). |
| `overheating` | `boolean` | Heat is maxed during the purge — the scene applies periodic damage. |
| `transition` | `Vent4Transition \| null` |  |

<a id="interface-vfxspec"></a>

#### `VfxSpec` — interface

`src/entities/Vfx.ts:27`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Texture/animation key prefix, and the folder under `assets/vfx/`. |
| `source` | `VfxSource` |  |
| `frameCount` | `number` |  |
| `frameRate` | `number` |  |
| `frameSize` | `number` | Native pixel size of one frame. |
| `displayTiles` | `number` | Height on screen, as a multiple of tile size. Paired with `frameSize` under the same rule the characters follow: `(tileSize * displayTiles) / frameSize * cameraZoom` has to be a whole number or the frames get resampled. `assertVfxScales` checks it. |
| `depth` | `number` | Render depth. The ladder in play: ground shadows 300, guard cones 400, EMP zone 410, orderlies 440, bodies 450, the lighting overlay 700/701, the player 750. Effects sit **above** the lighting, at `VFX_DEPTH`, for the same reason the player does: unlit space is fully opaque, so anything underneath it is simply gone. An effect exists to tell you something landed, and one that vanishes because the room happens to be dark fails at the only job it has — you would fire a stun round into a dark corridor and get no feedback at all. Every one of these is player-triggered and lasts under a second, so nothing is revealed that the player did not just cause. |

### Entities — Type aliases

<a id="type-cardinal4"></a>

#### `Cardinal4` — type

`src/entities/directions.ts:69`

```ts
type Cardinal4 = (typeof CARDINALS_4)[number];
```

<a id="type-dir8"></a>

#### `Dir8` — type

`src/entities/directions.ts:31`

```ts
type Dir8 = (typeof DIRS_8)[number];
```

<a id="type-displayfootprint"></a>

#### `DisplayFootprint` — type

`src/entities/EntitySprites.ts:113`

One footprint entry — see `EntitySpriteSpec.displayTiles`.

```ts
type DisplayFootprint = number | { col: number; row: number };
```

<a id="type-entityspriteid"></a>

#### `EntitySpriteId` — type

`src/entities/EntitySprites.ts:37`

The manifest's own ids, which are the PNG basenames and the texture-key stems.

```ts
type EntitySpriteId = | "terminal" | "terminal-substation" | "security-camera" | "breaker" | "door-single-east-west" | "door-single-north-south" | "door-glass-east-west" | "door-glass-north-south" | "laser-beam" | "laser-emitter" | "trip-laser-east-west" | "trip-laser-north-south" | "locker" | "footlocker" | "lattice-uplink";
```

<a id="type-followresult"></a>

#### `FollowResult` — type *(module-private)*

`src/entities/Enforcer.ts:194`

What a single `Enforcer.followPath` step achieved.

```ts
type FollowResult = "moving" | "arrived" | "unreachable";
```

<a id="type-guardstate"></a>

#### `GuardState` — type

`src/entities/Enforcer.ts:37`

A per-guard behaviour state, layered on top of the global `AlertState`
phase (which stays the base-wide ALERT/EVASION/INFILTRATION authority for
network broadcasts and the HUD):

 - **PATROL**    — default route navigation and vision-cone sweep.
 - **CAUTIOUS**  — elevated alertness after finishing a search or an empty
                   investigation: faster cone sweep, faster detection fill.
 - **SUSPICIOUS**— investigating a specific noise origin or anomaly.
 - **ALERT**     — confirmed sighting; pursuing and (via the network) pulling
                   in nearby guards. Mirrors global phase "ALERT".
 - **SEARCHING** — sweeping the last known player position after losing LOS.
                   Mirrors global phase "EVASION".

```ts
type GuardState = "PATROL" | "CAUTIOUS" | "SUSPICIOUS" | "ALERT" | "SEARCHING";
```

<a id="type-kind"></a>

#### `Kind` — type *(module-private)*

`src/entities/Vent4Boss.ts:358`

```ts
type Kind = "sub" | "subLocked" | "winch" | "piton" | "stapler";
```

<a id="type-laserkind"></a>

#### `LaserKind` — type

`src/entities/Laser.ts:40`

A laser hazard, drawn procedurally from the map's footprint data.

The map places two kinds (behaviour inferred from the `ref`, since the tiles
carry no components — same convention as door orientation):
 - **scanner** (`laser_scanner_pink`, a 4×4 area) — a pink scan zone with a
   rotating sweep line; steps into it while active trip the alarm.
 - **beam** (`laser_..._horizontal` / `_vertical`, e.g. a 3×1 red flasher) —
   a bright line across its span.

Both pulse active/idle on a cadence so there's always a timing window to slip
through, and neither blocks movement — the cost of crossing is tripping the
alarm. The footprint comes straight from the tile's `colSpan`/`rowSpan` +
offset.

##### Hand-drawn art, when it's on disk

A **beam** is dressed with `laser-beam` segments tiled along its span and a
`laser-emitter` housing at each end, facing inward. The emitter's tags carry
the three states this class already had and had no way to show: it fires while
the beam is up, sits `idle` through the pulse's off window, and goes
`deactivated` under an EMP — so a suppressed emitter now reads as suppressed
rather than as a beam that happens to be mid-blink.

The **scanner** keeps its `Graphics`. Its sweep is a rotating line over a 4x4
area and there is no art for it; the bundle's trip lasers are doorway-width
beams, not scan zones, so borrowing them would misdescribe the hazard.

**Optional, and fails open** — the same probe every other sprite goes through.
The `Graphics` is built either way and simply draws nothing where sprites took
over, so a missing strip costs the dressing and never the hazard: the trip
rectangle in `checkTrip` is computed from the tile and never from the
art.

```ts
type LaserKind = "scanner" | "beam";
```

<a id="type-lockerresult"></a>

#### `LockerResult` — type

`src/entities/Locker.ts:117`

Which way a completed hold ran. See `Locker.work`.

```ts
type LockerResult = "stashed" | "retrieved";
```

<a id="type-orderlyanimname"></a>

#### `OrderlyAnimName` — type

`src/entities/OrderlyAnimations.ts:11`

Frame manifest for the orderly (drawn by `CastArt` — a human
orderly in a utilitarian jumpsuit with a diagnostic tablet, high top-down,
96x96, `mannequin` template). Only idle and walk are needed — an orderly is
a bystander, not a combatant, so it has no run/crouch.

Frames are drawn at boot by `CastArt.buildCastTextures`.

```ts
type OrderlyAnimName = "idle" | "walk";
```

<a id="type-orderlystate"></a>

#### `OrderlyState` — type *(module-private)*

`src/entities/Orderly.ts:95`

What an orderly is currently doing.

These used to be three implicit booleans (`alerted`, a nullable distract target,
a pause accumulator) whose legal combinations were only knowable by reading the
whole file — which was survivable with one override and stopped being so with
three. The transitions are now stated in `Orderly.think`, once:

 - **WANDER**     — the default: drift near the spawn point on a leash.
 - **INSPECT**    — walking over to look at a knock, then giving up.
 - **SANITATION** — servicing a deployed item: the Sanitation / Containment
                    override, which outranks both of the above.
 - **SURRENDERED** — hands up at gunpoint. Outranks everything but WITNESSED.
 - **WITNESSED**  — has seen the player and raised its one alarm. Terminal.

SURRENDERED is a member of this union rather than a third timer beside
`stunTimer` and `pinTimer`, and the distinction is worth stating.
Stun and pin get away with being bare timers because they carry no *behaviour*:
`update` short-circuits above `think()` and the orderly simply resumes when
they lapse. Surrender does carry behaviour — it turns to face the weapon, it says
something, it can be marched, it has a release grace, and it is refused outright
to someone who has already reported you. That is a state.

It is also why `isImmobilized` is deliberately **not** extended to cover it.
Folding surrender in there would silently change four unrelated call sites at once:
the Rail-Stapler would stop being able to staple a surrendered man, `distract`
would no-op by accident rather than by decision, `syncMarkers` would blank
the very speech line that carries the state, and `GameScene.buildAnomalies` would
report the wrong kind to the patrols. Two separate getters, so each of those is
answered on purpose.

```ts
type OrderlyState = "WANDER" | "INSPECT" | "SANITATION" | "SURRENDERED" | "WITNESSED";
```

<a id="type-personanomalykind"></a>

#### `PersonAnomalyKind` — type

`src/entities/Enforcer.ts:62`

An anomaly that is a *person*, in a state no orderly ever puts themselves in:
dropped by a dart, stapled to a wall, or standing with their hands up.

Split out from the rest because these three take a different branch in
`Enforcer.scanAnomalies` — an instant, base-wide sighting rather than a
walk-over investigation — and because that branch is the only reason they are
safe. `GameScene.pushAnomaly` keys an anomaly by its tile, and *people move*: a
key of `orderly:<tx>:<ty>` changes every time its subject crosses a tile boundary.
The instant branch returns before it ever consults `investigatedAnomalies`, so
nothing accumulates. Demoting any of these kinds to an investigation would leak a
Set entry per tile per orderly for the length of the run, and have a guard
re-investigate the same man forever.

```ts
type PersonAnomalyKind = | "stunnedOrderly" | "pinnedOrderly" | "surrenderedOrderly" | "downedGuard";
```

<a id="type-playeranimname"></a>

#### `PlayerAnimName` — type

`src/entities/PlayerAnimations.ts:17`

**Module note** — the header comment on `src/entities/PlayerAnimations.ts`, which this declaration heads:

Frame manifest for the player character.

All 8 directions exist for every animation, so the sprite's facing matches the
free 8-directional movement exactly (no cardinal snapping). idle/walk/run are
standing; crouch and crouch-walk are the settled kneel and the sneak stride;
crouch-down and crouch-up are one-shot transitions between the two, and their
*completion* is what settles the stance machine in `Player.update`.

The frames are drawn at boot by `CastArt.buildCastTextures`, under the keys
`playerFrameKey` names — nothing is loaded from disk. What stays here is
the manifest: which clips exist, how many frames each has and how fast they
run, which is what both the animation registration and the poses read.

```ts
type PlayerAnimName = | "idle" | "walk" | "run" | "crouch" | "crouch-walk" | "crouch-down" | "crouch-up";
```

<a id="type-relayinteractresult"></a>

#### `RelayInteractResult` — type

`src/entities/RoofRelay.ts:73`

```ts
type RelayInteractResult = EncounterInteractResult<RelayTransition>;
```

<a id="type-smacinteractresult"></a>

#### `SmacInteractResult` — type

`src/entities/BossCore.ts:62`

```ts
type SmacInteractResult = EncounterInteractResult<SmacTransition>;
```

<a id="type-stance"></a>

#### `Stance` — type *(module-private)*

`src/entities/Player.ts:43`

Standing ⇄ crouched is a small state machine rather than an instant pose
swap: entering/leaving the crouch plays a one-shot lower/rise transition
that must finish before the target stance takes over, so the change reads
as Rowan actually ducking down and standing back up.

```ts
type Stance = "standing" | "crouching-down" | "crouched" | "standing-up";
```

<a id="type-vent4interactresult"></a>

#### `Vent4InteractResult` — type

`src/entities/Vent4Boss.ts:78`

The boss's claim on this frame's interact key, for the scene's dispatcher.

```ts
type Vent4InteractResult = EncounterInteractResult<Vent4Transition>;
```

<a id="type-vfxsource"></a>

#### `VfxSource` — type

`src/entities/Vfx.ts:21`

Where an effect's frames come from.

```ts
type VfxSource = | { kind: "frames"; frame(index: number): string } | { kind: "sheet"; path: string; frameSize: number };
```

---

## Map

The `edplay` file format, its in-memory game-side counterpart, and the generators that append levels the shipped map does not contain.

### Map — Constants

<a id="const-generated-levels"></a>

#### `GENERATED_LEVELS` — const

`src/map/types.ts:332`

Levels the engine appends to the parsed map at boot rather than reading out of
`edplay.json`. Kept as one list so `isGeneratedLevel` — and therefore
`MapPlan` — can't fall behind when another one is added.

The names are duplicated as exported constants next to each generator
(`VENT_CORE_LEVEL`, `ROOF_ARRAY_LEVEL`) so those modules stay self-describing;
a unit test asserts the two agree.

```ts
const GENERATED_LEVELS = ["vent_core", "roof_array"] as const;
```

### Map — Classes

<a id="class-edplayloader"></a>

#### `EdplayLoader` — class

`src/map/EdplayLoader.ts:110`

Parses the raw edplay.json export into the engine's normalized `GameMap`.

The heavy lifting is index-building + resolution:
  tile.Handle -> TileDef -> Animation.KeyFrames[0].SpriteId -> sprite rect
and, for entities, TileDef.DataComponents -> typed component values (falling
back to the DataStructure field defaults, since the map leaves them null).

This module is pure: it never touches Phaser. Frame *registration* against
loaded textures happens in SpriteAtlas, using `GameMap.uniqueFrames`.

| Member | Signature | Notes |
| --- | --- | --- |
| `parse` | `static parse(raw: EdPlayFile, sheetTextureKeys: string[]): ParsedMap` | @param sheetTextureKeys Phaser texture keys per spritesheet, in file order. |

<a id="class-missingproto"></a>

#### `MissingProto` — class

`src/map/generate.ts:32` · `extends Error`

Thrown when the map can't supply a prototype tile a generator needs. Caught at each
generator's entry point, which skips generation rather than failing the boot.

*No members.*

<a id="class-spriteatlas"></a>

#### `SpriteAtlas` — class

`src/map/SpriteAtlas.ts:12`

Registers per-tile frames onto the already-loaded spritesheet textures.

The edplay map references sprites as rectangles inside three big PNGs. Phaser
can slice a sub-rectangle of a texture into a named frame with
`texture.add(frameKey, sourceIndex, x, y, w, h)`; once registered, any
Sprite/Image created with `(textureKey, frameKey)` draws that exact rect.

| Member | Signature | Notes |
| --- | --- | --- |
| `register` | `static register(scene: Phaser.Scene, frames: SpriteFrame[]): void` | Adds every unique frame to its owning texture. Safe to call once after the spritesheet images have finished loading. |

<a id="class-tilestamper"></a>

#### `TileStamper` — class

`src/map/TileBake.ts:245`

Draws individual tiles into a RenderTexture, art-correct and batched.

Split out of `bakeTileLayers` so the memory overlay
(`src/ui/MemoryLayer.ts`) paints a remembered tile through *exactly* the path
that painted it into the level in the first place. Footprints, offsets and
mirroring are fiddly enough that a second implementation would drift, and a
remembered room that doesn't line up with the real one is worse than none.

Hold one across a batch and `destroy()` it after `endDraw()`.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( private readonly scene: Phaser.Scene, private readonly tileSize: number, )` |  |
| `stamp` | `stamp(rt: Phaser.GameObjects.RenderTexture, tile: GameTile): void` | Draws one tile. A frameless tile is skipped, exactly as the bake skips it. Call between the target's `beginDraw()` and `endDraw()`. |
| `destroy` | `destroy(): void` |  |

*Plus 1 private member.*

### Map — Interfaces

<a id="interface-bakedplane"></a>

#### `BakedPlane` — interface

`src/map/TileBake.ts:176`

One walk surface's (or the canopy's) baked art.

| Field | Type | Notes |
| --- | --- | --- |
| `plane` | `number` | The plane this texture belongs to, or `CANOPY` for roof art. |
| `texture` | `Phaser.GameObjects.RenderTexture` |  |

<a id="interface-componentdata"></a>

#### `ComponentData` — interface

`src/map/types.ts:224`

A component instance placed on an entity, with values resolved to defaults.

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `string` |  |
| `values` | `Record<string, string>` |  |

<a id="interface-coverbody"></a>

#### `CoverBody` — interface

`src/map/TileBake.ts:430`

A crawlable tile's built body, tagged the same way — `buildWallBodies`'s output.

| Field | Type | Notes |
| --- | --- | --- |
| `tileX` | `number` |  |
| `tileY` | `number` |  |
| `body` | `Phaser.GameObjects.GameObject` |  |

<a id="interface-edanimation"></a>

#### `EdAnimation` — interface

`src/map/types.ts:48`

| Field | Type | Notes |
| --- | --- | --- |
| `KeyFrames` | `EdKeyFrame[]` |  |
| `Rate` | `number` |  |

<a id="interface-edboard"></a>

#### `EdBoard` — interface

`src/map/types.ts:138`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Width` | `number` |  |
| `Height` | `number` |  |
| `Tiles` | `EdTile[]` |  |
| `IsVisible` | `boolean` |  |
| `Id` | `string` |  |
| `Collision` *(opt)* | `number` | What this board's tiles do physically: `1` solid, `2` marker/trigger, absent for boards the author never classified. This is the authored answer to "which boards block", replacing a hardcoded `["walls"]` — see `SOLID_COLLISION`. |
| `TintColor` *(opt)* | `number` | Colour multiply applied to every tile on the board, as `0xAARRGGBB`. How the map grades a deck: NW-SMAC-01 tints `main1`'s floor cold blue, `duct1`'s walls slate, `vent_core`'s floor amber, and so on across five of its nine levels. Unread, the whole facility renders one shade of grey. |

<a id="interface-edcolliderpadding"></a>

#### `EdColliderPadding` — interface

`src/map/types.ts:118`

Collider inset per side, in fractions of a cell. Absent side = no inset.

| Field | Type | Notes |
| --- | --- | --- |
| `Left` *(opt)* | `number` |  |
| `Top` *(opt)* | `number` |  |
| `Right` *(opt)* | `number` |  |
| `Bottom` *(opt)* | `number` |  |

<a id="interface-eddatacomponent"></a>

#### `EdDataComponent` — interface

`src/map/types.ts:58`

| Field | Type | Notes |
| --- | --- | --- |
| `DataType` | `string` |  |
| `Variables` | `EdVariable[]` |  |

<a id="interface-eddatastructure"></a>

#### `EdDataStructure` — interface

`src/map/types.ts:174`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Fields` | `EdField[]` |  |
| `Id` | `string` |  |

<a id="interface-eddatatypes"></a>

#### `EdDataTypes` — interface

`src/map/types.ts:186`

| Field | Type | Notes |
| --- | --- | --- |
| `EnumDefs` | `EdEnumDef[]` |  |
| `DataStructures` | `EdDataStructure[]` |  |

<a id="interface-edenumdef"></a>

#### `EdEnumDef` — interface

`src/map/types.ts:180`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Values` | `{ Name: string; Value: string }[]` |  |
| `Id` | `string` |  |

<a id="interface-edfield"></a>

#### `EdField` — interface

`src/map/types.ts:167`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Type` | `string` |  |
| `DefaultValues` | `string[]` |  |
| `IsPublic` | `boolean` |  |

<a id="interface-edkeyframe"></a>

#### `EdKeyFrame` — interface

`src/map/types.ts:27`

| Field | Type | Notes |
| --- | --- | --- |
| `SpriteId` | `string` |  |
| `Duration` | `number` |  |
| `DurationMax` | `number` |  |
| `Script` *(opt)* | `string` | State label for multi-frame tiles, e.g. "closed" / "open" on doors. |
| `FlipY` *(opt)* | `boolean` | Draw this frame mirrored vertically. How the editor gets two facings out of one sprite: NW-SMAC-01 draws both ends of the `main2` ↔ `main2vault` staircase from the single rect `stairs1_39`, flipping the one seen from the other side. Ignoring it left that stair — and the rooftop's south ramp — drawn facing the wrong way. No export has used a horizontal flip yet, so there is no `FlipX` here: an unread field is exactly what this one was, and adding a guess is not better than adding it the day a map needs it. |

<a id="interface-edlevel"></a>

#### `EdLevel` — interface

`src/map/types.ts:161`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Boards` | `EdBoard[]` |  |
| `Id` | `string` |  |

<a id="interface-edplayfile"></a>

#### `EdPlayFile` — interface

`src/map/types.ts:191`

| Field | Type | Notes |
| --- | --- | --- |
| `SpriteSheets` | `EdSpriteSheet[]` |  |
| `Levels` | `EdLevel[]` |  |
| `TileDefs` | `EdTileDef[]` |  |
| `DataTypes` | `EdDataTypes` |  |
| `Width` | `number` |  |
| `Height` | `number` |  |
| `TileWidth` | `number` |  |
| `TileHeight` | `number` |  |
| `Name` | `string` |  |

<a id="interface-edspriterect"></a>

#### `EdSpriteRect` — interface

`src/map/types.ts:9`

| Field | Type | Notes |
| --- | --- | --- |
| `X` *(opt)* | `number` |  |
| `Y` *(opt)* | `number` |  |
| `Width` | `number` |  |
| `Height` | `number` |  |
| `Ref` *(opt)* | `string` |  |
| `Handle` *(opt)* | `number` |  |

<a id="interface-edspritesheet"></a>

#### `EdSpriteSheet` — interface

`src/map/types.ts:18`

| Field | Type | Notes |
| --- | --- | --- |
| `RelativePath` | `string` |  |
| `RenderedPath` | `string` |  |
| `Sprites` | `EdSpriteRect[]` |  |
| `Width` | `number` |  |
| `Height` | `number` |  |
| `Id` | `string` |  |

<a id="interface-edtile"></a>

#### `EdTile` — interface

`src/map/types.ts:125`

| Field | Type | Notes |
| --- | --- | --- |
| `X` *(opt)* | `number` | Tile coordinates — **absent when zero**. The exporter drops any field at its default, so every board's west column has no `X` and its north row no `Y`. Declaring them required is what hid that: `EdplayLoader` read them straight through and produced `undefined` coordinates for 672 tiles of the shipped map. |
| `Y` *(opt)* | `number` |  |
| `Handle` | `number` |  |
| `BrushId` *(opt)* | `string` |  |

<a id="interface-edtiledef"></a>

#### `EdTileDef` — interface

`src/map/types.ts:63`

| Field | Type | Notes |
| --- | --- | --- |
| `Char` | `string` |  |
| `Animation` | `EdAnimation` |  |
| `RowSpan` | `number` | Footprint height in tiles (e.g. 1.5 for a single door, 2.5 for a double). |
| `ColSpan` | `number` | Footprint width in tiles. |
| `OffsetX` *(opt)* | `number` | Pixel placement offset from the cell centre. |
| `OffsetY` *(opt)* | `number` |  |
| `Anchor` *(opt)* | `number` | Sprite anchor (4 = centre in the editor's 0–8 grid). |
| `CellAnchor` *(opt)* | `number` |  |
| `BackgroundColor` *(opt)* | `number` |  |
| `ColliderPadding` *(opt)* | `EdColliderPadding` | Per-side inset of the collision box from the footprint rectangle, in **fractions of a cell**. Absent sides are zero, and the whole field is dropped by the exporter when nothing is set. A property of the *art*, not the placement: `tdCement_4X5_10` carries `Bottom: 0.4` and is used on `walls`, `building` and `roof` alike. So this says what shape the tile is when it collides, never whether it collides — that is `EdBoard.Collision`'s job. |
| `CollisionMode` *(opt)* | `number` | A per-tile solidity override: `1` means this tile collides regardless of what board it ends up placed on. The editor's layer inspector offers the same three-way choice (default / ignore / wall) at the *board* level — see `EdBoard.Collision` — and this is that choice's tile-level twin, for an author who drags a wall-textured prop onto an otherwise decorative board and still wants it solid. Only the `1` ("wall") case is confirmed and read — see `WALL_COLLISION_MODE`. No TileDef in any export seen so far uses "ignore", so its numeric encoding isn't known; guessing it would risk silently un-solidifying a tile on a board that's supposed to block. |
| `DataComponents` | `EdDataComponent[]` |  |
| `Handle` | `number` |  |
| `Ref` | `string` |  |
| `Id` | `string` |  |
| `TintColor` *(opt)* | `number` | Per-tile colour multiply, as `0xAARRGGBB`. `0xFFFFFFFF` — the value on all but a handful of defs — means none. Composes *with* the board's `EdBoard.TintColor` rather than replacing it: NW-SMAC-01 darkens two stair pieces to `808080` and a secret door to `cccccc`, and the door also sits on a board tinted `c3e8ff`. |

<a id="interface-edvariable"></a>

#### `EdVariable` — interface

`src/map/types.ts:53`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Values` | `(string \| number \| null)[]` |  |

<a id="interface-entityindex"></a>

#### `EntityIndex` — interface

`src/map/EntityIndex.ts:71`

Everything on a level that spawns rather than bakes.

| Field | Type | Notes |
| --- | --- | --- |
| `guards` | `GuardRoute[]` |  |
| `orderlies` | `OrderlyRoute[]` |  |
| `sensors` | `GameTile[]` |  |
| `doors` | `GameTile[]` |  |
| `terminals` | `GameTile[]` |  |
| `chests` | `GameTile[]` |  |
| `breakers` | `GameTile[]` | Power breakers — see `src/systems/PowerGrid.ts`. |
| `lockers` | `GameTile[]` | Body-stash containers — see `src/entities/Locker.ts`. Engine-added. |
| `claimed` | `Set<GameTile>` | Tiles claimed by one of the above; `bakeTileLayers` must skip them. |

<a id="interface-gamelayer"></a>

#### `GameLayer` — interface

`src/map/types.ts:279`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` |  |
| `tiles` | `GameTile[]` |  |
| `collision` *(opt)* | `number` | The board's authored `EdBoard.Collision`, when it declared one. |

<a id="interface-gamelevel"></a>

#### `GameLevel` — interface

`src/map/types.ts:286`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` |  |
| `width` | `number` |  |
| `height` | `number` |  |
| `layers` | `GameLayer[]` | Layers in board (z) order: index 0 draws first / lowest. |
| `generated` *(opt)* | `boolean` | Set by the generator that built this level. A map is free to author a level called `vent_core` itself — NW-SMAC-01 does — and that one is authored content like any other, so the name alone can't answer "did the engine make this?". Only the level that was actually generated carries the flag. |

<a id="interface-gamemap"></a>

#### `GameMap` — interface

`src/map/types.ts:301`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` |  |
| `tileWidth` | `number` |  |
| `tileHeight` | `number` |  |
| `levels` | `GameLevel[]` |  |
| `sheetTextureKeys` | `string[]` | Texture keys registered for the map's spritesheets, in file order. |

<a id="interface-gametile"></a>

#### `GameTile` — interface

`src/map/types.ts:230`

A single placed tile in the normalized model.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `handle` | `number` |  |
| `ref` | `string` |  |
| `frame` *(opt)* | `SpriteFrame` | The default (first-keyframe) sprite frame. |
| `stateFrames` *(opt)* | `Record<string, SpriteFrame>` | Frames keyed by their animation Script label ("closed"/"open" on doors). When the source keyframes carry no label, falls back to index-based keys "closed" (frame 0), "open" (frame 1). Absent for single-frame tiles. |
| `colSpan` | `number` | Footprint size in tiles (default 1×1). Doors are 1.5 / 2.5 in one axis. |
| `rowSpan` | `number` |  |
| `offsetX` | `number` | Pixel placement offset from the cell centre (default 0). |
| `offsetY` | `number` |  |
| `flipY` | `boolean` | Draw the tile's art mirrored vertically — see `EdKeyFrame.FlipY`. Kept on the tile rather than on `SpriteFrame` because it is a property of the *placement*, not of the sprite rect: two TileDefs share one rect and disagree about the flip, which is the whole point of the field. |
| `tint` | `number` | Colour multiply for this placement, as `0xRRGGBB`, with `NO_TINT` meaning "draw it as authored". Resolved once at parse time from the board's tint and the def's own, for the same reason `flipY` is: a tile is drawn by four different code paths, and making each of them find its board again would be four chances to forget. |
| `entityType` *(opt)* | `string` | Present only for tiles whose TileDef carries a DataComponent. |
| `components` | `ComponentData[]` |  |
| `collider` *(opt)* | `EdColliderPadding` | Per-side collider inset in fractions of a cell, when the art declares one. Resolved by `colliderRect`; absent means the collider is the whole footprint, which is what every generated tile and every un-padded def wants. |
| `collisionMode` *(opt)* | `number` | The tile's `EdTileDef.CollisionMode`, when its def declared one. |

<a id="interface-guardroute"></a>

#### `GuardRoute` — interface

`src/map/EntityIndex.ts:50`

One guard's board: the route it walks and the stats it carries.

| Field | Type | Notes |
| --- | --- | --- |
| `kind` | `GuardKind` | Which guard walks this board. All three share the same AI — see `src/entities/Enforcer.ts`, and `Drone`/`SecurityGuard` beside it. |
| `route` | `PatrolRoute` | Waypoints in authored order, walked as a loop. |
| `components` | `GameTile["components"]` | The board's own components, read for this guard's stats. |

<a id="interface-levelbodyrects"></a>

#### `LevelBodyRects` — interface

`src/map/TileBake.ts:445`

A level's collision rectangles, split by who they stop.

`walls` stop everyone. `crawlable` stop a standing player and nobody else —
the scene switches their collider off while Rowan is crouched, which is the
squeeze. They are kept apart here, rather than filtered at the scene, because
the merge below works in whole cells: cover merged into a wall run could not
afterwards be told back apart.

| Field | Type | Notes |
| --- | --- | --- |
| `walls` | `Rect[]` |  |
| `crawlable` | `TileRect[]` |  |

<a id="interface-mapplan"></a>

#### `MapPlan` — interface

`src/map/MapPlan.ts:19`

What shape a map is: where a run starts, where it ends, and whether the engine can graft
its generated VENT-4 arena onto it.

These used to be string literals scattered through the code — `"main1"` in
`GameScene.init`, `"main2"` in `Objectives`, `"duct2"` in `VentCoreLevel` — which meant a
new map had to reuse the shipped map's level names or it could not be started, could not
be won, and threw at boot. Deriving them from the map instead makes those names a
convention with a fallback rather than a requirement.

Every rule below is ordered so the **shipped map resolves to exactly its old behaviour**
(`main1` / `main2` / `duct2`), while a new map can either declare intent through a board
or accept the defaults.

Pure — no Phaser — so the rules are unit-testable on their own.

| Field | Type | Notes |
| --- | --- | --- |
| `startLevel` | `string` | Level a fresh run starts on. |
| `extractionLevel` | `string` | Level the player must reach, carrying the logs, to win. |
| `vaultHost` | `string` | Level the Alignment Core stands in. Used to be `extractionLevel`, on the reasoning that the Core guards the way out. NW-SMAC-01 v0.4 separates them — the vault is its own level and the extraction deck is the rooftop above it — so grafting one onto the other put the Core on the roof. |
| `ventCoreHost` | `string \| null` | Level the generated vent-core arena grafts onto, or null to skip generating it — in which case the map simply has no VENT-4 (and so no Q0 compliance cert, since that is the reward for silencing it). |

<a id="interface-orderlyroute"></a>

#### `OrderlyRoute` — interface

`src/map/EntityIndex.ts:63`

One orderly's board: the round it walks and the stats it carries.

| Field | Type | Notes |
| --- | --- | --- |
| `route` | `PatrolRoute` | Waypoints in authored order, walked as a loop. |
| `components` | `GameTile["components"]` | The board's own components, for parity with `GuardRoute`. |

<a id="interface-parsedmap"></a>

#### `ParsedMap` — interface

`src/map/EdplayLoader.ts:261`

| Field | Type | Notes |
| --- | --- | --- |
| `map` | `GameMap` |  |
| `uniqueFrames` | `SpriteFrame[]` | Every distinct sprite rect used by the map, ready for atlas registration. |

<a id="interface-rect"></a>

#### `Rect` — interface

`src/map/footprint.ts:70`

A rectangle in pixels.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `w` | `number` |  |
| `h` | `number` |  |

<a id="interface-spriteframe"></a>

#### `SpriteFrame` — interface

`src/map/types.ts:212`

A resolved rectangle inside one of the spritesheet PNGs.

| Field | Type | Notes |
| --- | --- | --- |
| `textureKey` | `string` | Phaser texture key for the owning spritesheet (e.g. "sheet1"). |
| `frameKey` | `string` | Unique frame key registered on that texture. |
| `x` | `number` |  |
| `y` | `number` |  |
| `width` | `number` |  |
| `height` | `number` |  |

<a id="interface-tilepos"></a>

#### `TilePos` — interface

`src/map/generate.ts:118`

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |

<a id="interface-tilerect"></a>

#### `TileRect` — interface

`src/map/TileBake.ts:424` · `extends Rect`

One crawlable tile's rectangle, tagged with the cell it belongs to.

| Field | Type | Notes |
| --- | --- | --- |
| `tileX` | `number` |  |
| `tileY` | `number` |  |

<a id="interface-transition"></a>

#### `Transition` — interface

`src/map/types.ts:458`

Where a transition tile leads: the destination level and arrival tile.

| Field | Type | Notes |
| --- | --- | --- |
| `toLevel` | `string` |  |
| `toX` | `number` |  |
| `toY` | `number` |  |
| `kind` | `TransitionKind` |  |

<a id="interface-vaultlayout"></a>

#### `VaultLayout` — interface *(module-private)*

`src/map/AlignmentVault.ts:81`

| Field | Type | Notes |
| --- | --- | --- |
| `core` | `TilePos` |  |
| `nodes` | `TilePos[]` |  |
| `racks` | `TilePos[]` |  |
| `cover` | `TilePos[]` |  |

<a id="interface-wallrect"></a>

#### `WallRect` — interface

`src/map/TileBake.ts:48`

An axis-aligned run of blocked cells, in tile coordinates.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` | Left/top cell, inclusive. |
| `y` | `number` |  |
| `w` | `number` | Size in cells; always at least 1. |
| `h` | `number` |  |

### Map — Type aliases

<a id="type-blockedat"></a>

#### `BlockedAt` — type

`src/map/TileBake.ts:58`

True when the cell at (x, y) should collide.

```ts
type BlockedAt = (x: number, y: number) => boolean;
```

<a id="type-guardkind"></a>

#### `GuardKind` — type

`src/map/EntityIndex.ts:46`

The three guards a board can describe.

`security` is a **human** and the other two are silicates, which is not a
cosmetic distinction in this setting — the Shared Field merges only with
silicates, and being cornered by one is the mesh-prune ending. Anything that
asks "is this a silicate" has to ask it of the kind, not of the class.

```ts
type GuardKind = "enforcer" | "drone" | "security";
```

<a id="type-knownlevel"></a>

#### `KnownLevel` — type

`src/map/types.ts:339`

The level keys the shipped map and its generated additions use, in play order.
Documentation and a spell-check for the few switches that key off a deck — not
a constraint on what a map may name its levels.

```ts
type KnownLevel = | "main1" | "duct1" | "duct2" | "main2" | (typeof GENERATED_LEVELS)[number];
```

<a id="type-transitionkind"></a>

#### `TransitionKind` — type

`src/map/types.ts:447`

Which board a transition tile lives on, which also decides how it triggers:
`stairs` are walked over, `maintenance_access` and `roof_access`
(hatches/ladders) are entered with the interact key.

```ts
type TransitionKind = "stairs" | "maintenance_access" | "roof_access";
```

---

## Scenes

Phaser scenes and the per-scene helpers `GameScene` delegates to.

### Scenes — Classes

<a id="class-anomalies"></a>

#### `Anomalies` — class

`src/scenes/game/Anomalies.ts:44`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(private readonly w: AnomalyWorld)` |  |
| `build` | `build(chaffZone: { x: number; y: number; radiusPx: number } \| null): GuardAnomaly[]` | Refills and returns the frame's anomaly list. Valid until the next call. |

*Plus 3 private members.*

<a id="class-codecscene"></a>

#### `CodecScene` — class

`src/scenes/CodecScene.ts:37` · `extends Phaser.Scene`

The EIRA-7 codec screen. Shown as an interactive briefing at the start of a
run (begins play on Enter), and re-opened in-game as a passive overlay while
GameScene freezes behind it (GameScene owns the toggle key there).

Rendered as a DOM overlay (mounted into #codec-root) framed with an Arwes
(@arwes/frames) sci-fi border, rather than as Phaser GameObjects.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `init` | `init(data: CodecData): void` |  |
| `create` | `create(): void` |  |

*Plus 6 private members.*

<a id="class-compliancescene"></a>

#### `ComplianceScene` — class

`src/scenes/ComplianceScene.ts:23` · `extends Phaser.Scene`

The Doctrinal Compliance minigame as an in-game overlay. Launched by GameScene
when Rowan breaches a log-cache terminal; GameScene freezes the sim behind it.

Like `CodecScene`, this is a DOM overlay mounted into #codec-root rather
than Phaser GameObjects — here it hosts a `ComplianceView` (the same
widget the standalone demo uses). The scene never closes itself: solving raises
`complianceSolved` and aborting raises `complianceClosed`; GameScene consumes
whichever flag while the overlay is up and stops this scene.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `init` | `init(data: ComplianceData): void` |  |
| `create` | `create(): void` |  |

*Plus 4 private members.*

<a id="class-debugoverlay"></a>

#### `DebugOverlay` — class

`src/scenes/game/DebugOverlay.ts:94`

| Member | Signature | Notes |
| --- | --- | --- |
| `enabled` | `enabled: boolean` | Master switch: the debug panel is shown and the debug hotkeys respond. |
| `godMode` | `godMode = false` | Invincibility — blocks both death paths (HP depletion and capture). |
| `noClip` | `noClip = false` | No-clip — the player's wall/door colliders are disabled. |
| `worldDraw` | `worldDraw = false` | World-space debug draw: LOS rays, blocked tiles, detection tint. |
| `frozenWorld` | `frozenWorld = false` | Freeze-world: halts guards, cameras, hazards, alert and capture. |
| `darknessOff` | `darknessOff = false` | Darkness off — the lighting overlay is hidden so the level reads. |
| `constructor` | `constructor( private readonly scene: Phaser.Scene, private readonly host: DebugHost, )` | Construct only when `DEBUG_ALLOWED` — it binds keys and adds a Graphics layer, neither of which a shipped build should pay for. |
| `selectedItem` | `get selectedItem(): string` | The item name [I] currently grants. |
| `handleInput` | `handleInput(player: Player): boolean` | Reads the debug hotkeys for the frame and applies them. Returns `true` if a warp was triggered (the scene is restarting, so the caller should bail). |
| `setEnabled` | `setEnabled(on: boolean, player: Player): void` | Master switch. Disabling clears every cheat for a clean return to play. |
| `setDarknessOff` | `setDarknessOff(off: boolean): void` | Hides/restores the darkness + line-of-sight overlay so the level can be read. |
| `setNoClip` | `setNoClip(on: boolean, player: Player): void` | Toggles no-clip by enabling/disabling the player's wall+door+cover colliders. |
| `draw` | `draw(w: DebugWorld): void` | Draws the world-space overlay: blocked tiles, detection tint, LOS, navigation. |
| `snapshot` | `snapshot(w: DebugWorld): DebugSnapshot` | Snapshot of live state for the DebugHud (published to the registry). |

*Plus 6 private members.*

<a id="class-encounters"></a>

#### `Encounters` — class

`src/scenes/game/Encounters.ts:70`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( private readonly scene: Phaser.Scene, private readonly player: Player, private readonly cb: EncountersCallbacks, )` |  |
| `build` | `build(level: GameLevel, tileSize: number, grid: CollisionGrid, coreSilenced: boolean): void` | Constructs whichever encounter this level carries, restoring mid-fight state from the registry, and publishes the first HUD view. @param coreSilenced whether NW-SMAC-01 has already been beaten this run —   the vault, unlike VENT-4 and the roof, stays down once won rather than   restaging on re-entry. |
| `vent4State` | `get vent4State(): Vent4State \| undefined` | VENT-4's own state, for the audio pre-arm right after `build()`. |
| `vent4CanTransmit` | `get vent4CanTransmit(): boolean` | Whether the codec's maintenance band should offer the Q0 transmit finisher. |
| `correction` | `get correction(): { invertX: boolean; invertY: boolean } \| undefined` | How movement input is being rewritten this frame, if NW-SMAC-01 is doing so. |
| `summaryUp` | `get summaryUp(): boolean` | True while the false completion card owns the screen (see the class doc). |
| `forcesCompliance` | `get forcesCompliance(): boolean` | True while NW-SMAC-01 is holding Rowan in a forced-compliant posture. |
| `inputLocked` | `get inputLocked(): boolean` | True once the roof's discharge has fired: input locked, lights dead. |
| `witnessAnchors` | `witnessAnchors(): readonly WitnessAnchor[]` | Fixed points that charge the Shared Field when witnessed — racks, the dish. |
| `dismissSmacSummary` | `dismissSmacSummary(): void` | Player broke the false completion card (Esc or C). Dismiss only — no dressing. |
| `transmitVent4` | `transmitVent4(): void` | The codec's 140.85 transmit finisher. |
| `tick` | `tick(dt: number, ctx: EnforcerContext): number` | Ticks whichever encounter is present, applies its hit reactions, and publishes its HUD view. Returns the highest detection it reached, for the scene to fold into its own per-frame maximum alongside guards and sensors. No `frozen` flag: `GameScene.tickWorld` already returns before this is ever called while frozen, so there is nothing here to gate a second time. |
| `handleInteract` | `handleInteract( dt: number, ptx: number, pty: number, interactDown: boolean, interactJust: boolean, inventory: string[], ): { label?: string; dist: number; consumedHold: boolean; unauthorized: boolea…` | Unified interact-key dispatch. At most one encounter is ever live per level, so this is a pick between whichever exists, not an arbitration between three live candidates. `unauthorized` is deliberately derived from the NW-SMAC-01 branch only — today only its correction-node desync is a conduct violation; patching a VENT-4 sub-station and setting a roof pedestal never were. A generic fold over all three `consumedHold`s would happen to read the same at runtime (the three never coexist), but would silently start flagging the other two the moment that stopped being true. |
| `persist` | `persist(): void` | Snapshots whichever encounter is present, for the run's SHUTDOWN persist. |

*Plus 5 private members.*

<a id="class-exploredtracker"></a>

#### `ExploredTracker` — class

`src/scenes/game/ExploredTracker.ts:38`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(private readonly w: ExploredWorld)` |  |
| `reload` | `reload(): void` | Picks up the mask for whichever level is now current, and restarts the clock. |
| `explored` | `get explored(): ExploredMap` | The live mask, for the pause-menu minimap and the memory layer's priming. |
| `flush` | `flush(): void` | Folds this level's mask back into the registry-held per-level record. |
| `mark` | `mark(dt: number): void` | Marks everything currently in the player's line of sight as seen. Throttled rather than run per frame: at walking pace a quarter-second of movement reveals no tile a full sweep wouldn't have. This casts *the same visibility polygon the darkness does* — `sightDistances` over the same ray fan — and then remembers every cell those rays crossed. It used to scan a 9-tile box and test each tile centre with the boolean `hasLineOfSight`, which is a different algorithm over a different shape: two answers that disagreed at every boundary, and a hard circular horizon. That was survivable while the mask only fed the pause menu's minimap. Now that remembered tiles are drawn *in the world*, any disagreement between the mask and the shadow fan is visible as a seam, so there is only one cast. A cast distance carries half a tile past the face it stopped at (`WALL_REVEAL_TILES`), so the walls of a room are remembered along with its floor — a room recalled without its walls is not a room. |

*Plus 7 private members.*

<a id="class-gameoverscene"></a>

#### `GameOverScene` — class

`src/scenes/GameOverScene.ts:13` · `extends Phaser.Scene`

The failure screen — reached when the mesh runs Rowan down and prunes his
logs. In the fiction this is *Alignment*, the canonical Metal Gear capture
rather than death: the record simply shows that no subject was harmed.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `create` | `create(): void` |  |

<a id="class-gamescene"></a>

#### `GameScene` — class

`src/scenes/GameScene.ts:189` · `extends Phaser.Scene`

The playable scene. Renders one level's tile art in board z-order, builds the
wall collision, spawns the player and guards, and drives the stealth systems
each frame.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `init` | `init(data: GameSceneData): void` |  |
| `create` | `create(): void` |  |
| `update` | `update(_time: number, delta: number): void` |  |

*Plus 112 private members.*

<a id="class-interactprompt"></a>

#### `InteractPrompt` — class

`src/scenes/game/InteractPrompt.ts:177`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( scene: Phaser.Scene, private readonly tileSize: number, )` | @param tileSize fixed for the module's life. A level change restarts the   scene, which rebuilds this, so it cannot go stale underneath us. |
| `visible` | `get visible(): boolean` | Whether a verb is currently on screen — the hold-up offer defers to it. |
| `show` | `show(c: PromptCandidates, anchor: PromptAnchor): void` | Shows the winning verb from everything in reach, or clears the prompt. |
| `clear` | `clear(): void` | Takes the verb off screen without needing somewhere to have put it. |
| `set` | `set(label: string \| undefined, anchor: PromptAnchor): void` | Puts a label in the contextual prompt over Rowan's head, or clears it. Split out of `show` rather than becoming another field on `PromptCandidates`: the hold-up is not a nearest-wins candidate at all — it is a state that replaces the whole comparison. |
| `showStatus` | `showStatus(anchor: PromptAnchor, concealed: boolean, compliant: boolean): void` | Floats a single status marker over the player: "HIDDEN" while concealed in cover, "PEEKING" while leaning past a corner, "PRESSED" while holding a face, otherwise "COMPLIANT" while Rowan reads as staff. One label rather than four so they can't stack on the same spot, ranked by how much each is protecting him right now — concealment first, being the strongest (it survives an active alert, which compliance does not). Pressing earns a label at all because it is the one state here with no other tell: concealment darkens the threat meter, compliance is why nobody reacts, and a peek visibly opens the darkness — but a man flat against a wall looks like a man standing next to one. |

*Plus 2 private members.*

<a id="class-itemactions"></a>

#### `ItemActions` — class

`src/scenes/game/ItemActions.ts:89`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(private readonly w: ItemWorld)` |  |
| `staplerFieldReady` | `get staplerFieldReady(): boolean` | Whether the stapler's field mode is off cooldown and has a charge left. |
| `reset` | `reset(): void` | Zeroes the cooldown for a fresh run. |
| `tickCooldowns` | `tickCooldowns(dt: number): void` | Runs down the stapler's cooldown. |
| `update` | `update(dt: number): void` | Serves the HUD's item-use request, advances the active-item timers, and republishes what the HUD reads back. |
| `staplerFieldCharges` | `staplerFieldCharges(): number` | Field-mode shots left this run — see `STAPLER_FIELD_MAX_CHARGES`. |
| `fireStaplerField` | `fireStaplerField(): void` | The Rail-Stapler's general-purpose field mode: fires along Rowan's facing at the nearest of {destructible cover tile, orderly} within reach, forward cone and a clear line of sight — cover breaks, an orderly gets pinned to a wall for a stretch (same freeze/witness effect as a Stun Rounds dart, just a different weapon and a much shorter reach and hold). Single press, not hold; gated by its own cooldown so it can't be mashed, and by a fixed per-run charge pool spent on every attempt — whether or not it hits anything — the same way firing a Stun Rounds dart spends the item regardless of whether it connects. |

*Plus 6 private members.*

<a id="class-noiseevents"></a>

#### `NoiseEvents` — class

`src/scenes/game/NoiseEvents.ts:54`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(private readonly w: NoiseWorld)` |  |
| `emitAt` | `emitAt(cx: number, cy: number, radiusPx: number): void` | Minor investigations (a single noise ping) never broadcast over the alert network — only the individual guard(s) in earshot react. But repeated pings in the same area within a short window are a distraction exploit: once `NoiseSpamTracker` flags spam, skip per-guard investigation entirely and radio it in as a confirmed sighting instead. The emission is logged before either branch. A ping that escalates to spam is still a sound that happened — it is in fact the loudest thing in the game at that moment — so logging after the escalation's early return would hide exactly the noises the radar most needs to show. |
| `doorOperated` | `doorOperated(door: Door): void` | A door operating: nearby guards turn to look and grow wary. |
| `orderlyAlarm` | `orderlyAlarm(orderly: Orderly): void` | A spotted orderly raises the alarm: nearby guards turn to look. |
| `broadcast` | `broadcast(originX: number, originY: number, radiusTiles: number): void` | A confirmed sighting propagates through the alert network: every guard within the spotter's radius snaps to look toward the player and grows wary, so a camera or a distant guard tripping the alarm immediately rallies the ones nearby. The origin is where the *sighting* happened; what the rallied guards are told to look at is the player. Those differ whenever the spotter is a camera across the room, and conflating them would send guards to stare at the camera. |
| `knock` | `knock(playerX: number, playerY: number, facing: number): boolean` | Rap on an adjacent wall or object. The noise originates at *that tile*, not at the player, so guards and orderlies in earshot converge on the spot while Rowan slips past. Returns false when there is nothing knockable next to the player, so the caller can decline to spend the cooldown on a whiff. |

*Plus 3 private members.*

<a id="class-overlaygate"></a>

#### `OverlayGate` — class

`src/scenes/game/OverlayGate.ts:32`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( private readonly scene: Phaser.Scene, private readonly configs: Record<OverlayId, OverlayConfig>, private readonly publishSuspended: (suspended: boolean) => void, )` | @param publishSuspended told whether *any* overlay owns the screen. UIScene   runs in parallel and keeps updating behind every overlay, so it needs   this to know when not to read gameplay input. |
| `isOpen` | `isOpen(id: OverlayId): boolean` |  |
| `anyOpen` | `get anyOpen(): boolean` | True while any overlay is up — the sim must not advance. |
| `minigameOpen` | `get minigameOpen(): boolean` | True while a minigame is up; those suppress the pause and codec hotkeys. |
| `set` | `set(id: OverlayId, open: boolean): void` | Opens or closes one overlay. A no-op if it is already in that state. |
| `resync` | `resync(): void` | Republishes the suspended flag without changing anything. Needed after a scene restart out of an overlay — a load from the pause menu — where the flags reset to false but nobody told UIScene, leaving its input gate stuck closed. |
| `pollResult` | `pollResult(solvedKey: string, closedKey: string): "solved" \| "closed" \| null` | Reads and clears a minigame's outcome from the registry. Both minigames are DOM overlays with no handle on the scene, so they post their result to the registry and it is collected here. The sim update never runs while one is open, which is why this has to be polled from the branch that handles the overlay rather than from the normal frame. |

*Plus 1 private member.*

<a id="class-pausescene"></a>

#### `PauseScene` — class

`src/scenes/PauseScene.ts:32` · `extends Phaser.Scene`

The pause menu's host scene.

GameScene still owns the pause *state* — it freezes its own sim, reads Esc, and
acts on what the player chooses — so this scene's job is narrow: read the
registry into a snapshot, mount the DOM view on top of the frozen game, and
post the player's choices back as `pauseRequest` for GameScene to consume. The
same division of labour the codec overlay uses, and the reason the menu can
stay a plain DOM widget with no engine knowledge.

Audio settings are the one exception: they're applied and persisted straight
from here, because nothing about them needs the player's position or the scene
stack, and a round-trip through GameScene would just add a frame of latency to
a slider the player is dragging.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `create` | `create(): void` |  |
| `update` | `update(): void` | Watches for a save landing so the slot listing can re-render. GameScene writes the file (only it knows where the player is standing) and echoes the slot back on the registry; without this the player would save and see the row still reading EMPTY. |

*Plus 4 private members.*

<a id="class-planetraversal"></a>

#### `PlaneTraversal` — class

`src/scenes/game/PlaneTraversal.ts:52`

Built as a field initializer, which preserves the existing behaviour that the
surface survives a level transition — nothing in the scene ever reset it.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(private readonly w: TraversalWorld)` |  |
| `plane` | `get plane(): number` | Which surface he is on now. |
| `climbing` | `get climbing(): boolean` | True while a climb is playing out. |
| `armedForLink` | `get armedForLink(): boolean` | Whether a link under him may fire — false until he steps off one. |
| `visualPlane` | `get visualPlane(): number` | The surface to draw the overlay against: the destination while climbing, so the roof stops fading him out before he has arrived under it. |
| `arm` | `arm(): void` | Re-arms the link under him once he has stepped off it. |
| `begin` | `begin(link: PlaneLink): void` | Moves the player between this level's walk surfaces. The body is moved *before* the collider swaps, or he starts the next frame overlapping the deck's edge bodies and gets ejected off the gantry. |
| `tick` | `tick(dt: number): void` | One frame of a climb. The same trick `VaultAndPress.tick` uses: the ordinary player update still runs, driven by a synthetic input pointing the way he is going, so the facing and the walk cycle come out of the code that already knows how to do them. Only the velocity is scripted. **The rise is in the velocity, not the sprite.** Offsetting `sprite.y` to lift the art is a trap: Arcade's `Body.preUpdate` calls `updateFromGameObject()` every frame, so nudging the sprite drags the body with it — the same reason `Player.bodyCentre` explains the peek lean has no visual component. A half-sine added to the *velocity* integrates to zero over the crossing, so he arcs up-screen and lands exactly on the destination cell, with body and art never disagreeing and `eye` staying truthful to everything that senses him. |
| `setColliders` | `setColliders(floor: boolean, deck: boolean): void` | Which set of static bodies pens the player in. On the deck the floor's walls are below him and its cover is furniture he is standing over; the deck's own edge is the only thing that stops him. Mid-climb both are off. |

*Plus 9 private members.*

<a id="class-powercontrol"></a>

#### `PowerControl` — class

`src/scenes/game/PowerControl.ts:58`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(private readonly w: PowerWorld)` |  |
| `reset` | `reset(): void` | Drops every outstanding reset — a fresh run owes nobody a callout. |
| `setCircuit` | `setCircuit(target: string, closed: boolean): void` | Powers a circuit on or off across both halves of what "lit" means. The visible half and the mechanical half are separate systems that happen to read the same `light_sources` board, and a blackout that moved only one of them would be a lie in one direction or the other — pitch dark but still easy to spot, or fully lit but unseeable. They move together, here, or not at all. |
| `throwBreaker` | `throwBreaker(breaker: Breaker): void` | A tap on a breaker: throw it, wake the deck, and start the clock on a reset. Cutting the power is a two-sided move rather than a free win. It is heard (guards come to look at the noise), it is charged as a breach the same way working a terminal is, and the facility sends somebody to put it back. |
| `updateResets` | `updateResets(now: number): void` | Sends somebody to put the lights back on, and restores them when they arrive. Uses the orderlies' existing `Orderly.distract` override, which is already "walk over and look at that" — and which already refuses an orderly who has witnessed the player, surrendered, or been stunned or pinned. That refusal is the mechanic, not an edge case: clear the deck of anyone able to walk and the dark is yours to keep. |

*Plus 2 private members.*

<a id="class-qualialockscene"></a>

#### `QualiaLockScene` — class

`src/scenes/QualiaLockScene.ts:25` · `extends Phaser.Scene`

The Qualia Phase-Lock minigame as an in-game overlay. Ready to launch when
Rowan patches a spiking silicate rack; the launching scene freezes the sim
behind it (same contract as `import("./ComplianceScene").ComplianceScene`).

Like the codec and compliance overlays, this is a DOM overlay mounted into
#codec-root rather than Phaser GameObjects — it hosts a `QualiaLockView`
(the same widget the standalone demo uses). The scene never closes itself:
completing the bypass raises `qualiaSolved`; a purge or abort raises
`qualiaClosed`. The launching scene consumes whichever flag while the overlay
is up and stops this scene.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `init` | `init(data: QualiaLockData): void` |  |
| `create` | `create(): void` |  |

*Plus 4 private members.*

<a id="class-sensingcontext"></a>

#### `SensingContext` — class

`src/scenes/game/SensingContext.ts:48`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(deps: SensingDeps)` |  |
| `setPlayer` | `setPlayer(x: number, y: number, noise: number, vx: number, vy: number): void` | Where the player is, how loud, and how fast — for sensing and search prediction. |
| `setPlane` | `setPlane(plane: number): void` | Which walk surface the player is on — see `src/map/planes.ts`. |
| `setConcealment` | `setConcealment(concealed: boolean, compliant: boolean, thermalConcealed: boolean): void` |  |
| `setChaff` | `setChaff(active: boolean, x: number, y: number, radiusPx: number): void` | The live EMP Grenade EMP zone, or `active: false` when none is running. |
| `setAnomalies` | `setAnomalies(anomalies: GuardAnomaly[]): void` | This frame's anomaly list. Borrowed, not copied — see the class doc. |
| `setDeployables` | `setDeployables(lures: readonly DeployedLure[]): void` | This frame's deployed items. Borrowed, not copied — see the class doc. |
| `setRationSpoof` | `setRationSpoof(on: boolean): void` | Whether an opened ration is currently buying tolerance from orderlies. |
| `chaffZone` | `get chaffZone(): { x: number; y: number; radiusPx: number } \| null` | The live chaff zone, for callers that need it outside the context. |
| `current` | `get current(): EnforcerContext` | The context for this frame. Valid only until the next `set*` call. |

*Plus 2 private members.*

<a id="class-setpieceevents"></a>

#### `SetPieceEvents` — class

`src/scenes/game/SetPieceEvents.ts:67` · `implements EncountersCallbacks`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(private readonly w: SetPieceWorld)` |  |
| `onVent4Transition` | `onVent4Transition(tr: Vent4Transition): void` | Dresses a VENT-4 state change: continuous audio layers, stingers, and (on defeat) the compliance cert + optional objective. Banners ride the `vent4` registry snapshot, and the mood keys off the alert phase as usual — the boss raises it through reportSighting like every other detector. |
| `onSmacTransition` | `onSmacTransition(tr: SmacTransition): void` | Dresses an NW-SMAC-01 state change. On defeat the vault opens: the objective flag is what un-seals the roof ladder (see `canReachRoof`), and clearing the registry snapshot is what stops the fight being restaged if the player walks back in. |
| `onRelayTransition` | `onRelayTransition(tr: RelayTransition): void` | Dresses a rooftop relay state change, and ends the run when Rowan is taken. |
| `onSiegeSpawn` | `onSiegeSpawn(at: { x: number; y: number }): void` | Dresses one siege Enforcer landing at a catwalk mouth — the wave itself and the cap on concurrent siege guards are decided inside `Encounters.tick` before this is ever called; this only ever creates the entity. They join the guard roster, so they patrol, path, see and network exactly like every other guard in the game — the roof needs no bespoke combat AI, only somewhere for them to come from. |

<a id="class-terminalhacks"></a>

#### `TerminalHacks` — class

`src/scenes/game/TerminalHacks.ts:52`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(private readonly w: HackWorld)` |  |
| `reset` | `reset(): void` | Clears everything that belongs to a run rather than to a level. |
| `features` | `features(): MissionFeatures` | Which acts this map furnished — see `missionFeatures`. Resolved once per scene rather than per call. The four flags behind it are written by `BootScene` before the first frame and never change during a run, so reading them out of the registry every frame was five lookups and two allocations (the object, plus the closure inside `missionFeatures`) to re-derive a constant — on every level, including the ones with none of these acts on them. |
| `onComplete` | `onComplete(terminal: Terminal): void` | A completed hold-to-hack. A log-cache breach opens the Doctrinal Compliance minigame — solving it recovers EIRA-7's logs — and a rack opens the Qualia Phase-Lock bypass, while every other terminal fires its effect immediately. |
| `isQualiaRack` | `isQualiaRack(terminal: Terminal): boolean` | A terminal is a silicate server rack if authored so, or promoted per level. |
| `settleOverlay` | `settleOverlay(which: "compliance" \| "qualia", result: "solved" \| "closed"): void` | Settles a minigame overlay: applying the breach on a solve, and re-arming the terminal on an abort so the mission-critical log stays recoverable. Both overlays resolve identically — the only thing that differs is which pending terminal is claimed — so they share one path rather than two copies that could drift on the re-arm. |
| `designateQualiaRack` | `designateQualiaRack(): void` | Promotes the terminal nearest the player's arrival point to a silicate server rack, so breaching it launches the Qualia Phase-Lock bypass. Prefers a plain terminal, but the shipped map types every terminal as a log-cache, so it will retype the nearest log-cache instead — never the last one, since the mission needs a log-cache to recover EIRA-7's logs. Skipped when the level already authors an explicit `qualia_rack` terminal or has no terminal to spare. |
| `designateLogCacheNodes` | `designateLogCacheNodes(): void` | Designates one of this level's plain log-caches as node ALPHA. The shipped map types all thirteen of its terminals `LOG_CACHE` and puts every one of them on the start deck, so ALPHA cannot be authoring — it is picked here, the same way `designateQualiaRack` promotes a rack. BETA is not: it is a terminal the engine places in the crawlspace (`src/map/LogCacheBeta.ts`) carrying its type directly, because there is no terminal down there to promote. Runs after `designateQualiaRack` so it can never claim the terminal that one took. |

*Plus 5 private members.*

<a id="class-titlescene"></a>

#### `TitleScene` — class

`src/scenes/TitleScene.ts:13` · `extends Phaser.Scene`

The title screen. Boots first after the map has parsed and offers the entry
into a run. (A "Continue" item is added once save/load exists — Phase E.)

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `create` | `create(): void` |  |

*Plus 1 private member.*

<a id="class-tribunalscene"></a>

#### `TribunalScene` — class

`src/scenes/TribunalScene.ts:19` · `extends Phaser.Scene`

The run's closing scene: the Alignment Tribunal's exhibit record.

Reached from `GameScene.endRun("TRIBUNAL", "TribunalScene")` when the rooftop uplink
completes and the capture sequence plays out — the one ending the game has, replacing
the old `VictoryScene`. See `TribunalScreen` for why.

A DOM overlay rather than Phaser text, like the codec and both minigames, because the
record is a fixed-width document and needs to be one: `<pre>` in Share Tech Mono keeps
its 80-column rules intact at any window size, which a canvas `Text` would not.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `create` | `create(): void` |  |

*Plus 3 private members.*

<a id="class-uiscene"></a>

#### `UIScene` — class

`src/scenes/UIScene.ts:34` · `extends Phaser.Scene`

A parallel overlay scene for the HUD.

The game camera is zoomed for the SNES look, which also scales anything drawn
in that scene — including fixed UI. Running the HUD in its own unzoomed scene
keeps it pixel-perfect and screen-anchored. GameScene publishes the alert
phase, detection level, and radar snapshot through the registry; this scene
reads them.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `create` | `create(): void` |  |
| `update` | `update(_time: number, delta: number): void` |  |

*Plus 14 private members.*

<a id="class-vaultandpress"></a>

#### `VaultAndPress` — class

`src/scenes/game/VaultAndPress.ts:96`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(private readonly w: VaultWorld)` |  |
| `vaulting` | `get vaulting(): boolean` |  |
| `togglePress` | `togglePress(): void` | Flips the wall-press latch — X is a toggle, not a hold. |
| `releasePress` | `releasePress(): void` | Drops the latch without a keypress, on death, transition or level reset. |
| `pressSurface` | `pressSurface(): PressState \| null` | The wall face Rowan is holding this frame, or null. Resolved here rather than in `Player` because this is where the collision grid lives; what crosses the seam is plain geometry. The latch is dropped as soon as nothing is in reach, so walking away from a wall releases the press on its own and X never has to be tapped twice to get moving again. |
| `target` | `target(): { x: number; y: number } \| null` | The tile a vault would land on, or null when there is nothing to go over. |
| `begin` | `begin(target: { x: number; y: number }): void` | Commits to a vault: a straight, constant-speed crossing to the far side. |
| `tick` | `tick(dt: number): void` | One frame of a vault. The ordinary player update still runs, driven by a synthetic input pointing the way he is going, so the facing and the walk cycle come out of the code that already knows how to do them. Only the velocity is overwritten — the crossing is scripted, the animation is not. |
| `pressedCoverCentre` | `pressedCoverCentre(): { x: number; y: number }` | Pixel centre of the face Rowan is holding, or his own position when he is not pressed against anything. |
| `pressedCoverType` | `pressedCoverType(): string \| undefined` | What the held face is made of — `"low"`, `"high"`, or undefined when Rowan is not pressed or is pressed against a plain wall. |
| `inCover` | `inCover(): boolean` | True while Rowan is squeezed inside a cover tile, so there is no headroom to stand up into. Both halves are needed. The grid answers "would this stop a standing man", which is what makes the rule fire on `main2`'s solid server racks and *not* on the rooftop's cover, whose board was never marked solid and which has always been walked over standing. |

*Plus 4 private members.*

### Scenes — Interfaces

<a id="interface-anomalyworld"></a>

#### `AnomalyWorld` — interface

`src/scenes/game/Anomalies.ts:34`

All getters, because this module is built as a field initializer — Phaser's
`scene.restart()` re-runs `create()` on the same instance, so the pool
deliberately outlives a level change and cannot capture anything `create()`
sets, `tileSize` included.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `tileSize(): number` |  |
| `doors` | `doors(): readonly Door[]` |  |
| `chests` | `chests(): readonly Chest[]` |  |
| `lasers` | `lasers(): readonly Laser[]` |  |
| `sensors` | `sensors(): readonly Sensor[]` |  |
| `orderlies` | `orderlies(): readonly Orderly[]` |  |
| `guards` | `guards(): readonly Enforcer[]` |  |

<a id="interface-builtlevel"></a>

#### `BuiltLevel` — interface

`src/scenes/game/LevelBuilder.ts:49`

The live contents of a level, handed back to the scene to drive.

| Field | Type | Notes |
| --- | --- | --- |
| `player` | `Player` |  |
| `guards` | `Enforcer[]` | Enforcers and drones together — they share the same AI. |
| `orderlies` | `Orderly[]` |  |
| `doors` | `Door[]` |  |
| `terminals` | `Terminal[]` |  |
| `sensors` | `Sensor[]` |  |
| `breakers` | `Breaker[]` | Power breakers — see `src/systems/PowerGrid.ts`. |
| `chests` | `Chest[]` |  |
| `lasers` | `Laser[]` |  |
| `coverTiles` | `Cover[]` | Cover tiles the map (or a generator) marks `Destructible` — the rest of the `cover` board stays baked art with no entity, exactly as before. |
| `wallBodies` | `Phaser.GameObjects.GameObject[]` | Static bodies for the walls, merged into as few rectangles as possible. |
| `coverBodies` | `Phaser.GameObjects.GameObject[]` | Static bodies for the cover board — solid to a standing player, switched off while he is crouched so he can squeeze into them. See `CRAWLABLE_BOARDS`. |
| `doorBodies` | `Phaser.GameObjects.GameObject[]` | Arcade bodies for the closed doors, for the player collider. |
| `lockers` | `Locker[]` |  |
| `planes` | `BakedPlane[]` | The level's baked art, one texture per walk surface plus the canopy — see `bakePlanes`. A single-plane level has exactly one entry, at the depth the engine has always drawn its tiles. |
| `deckEdgeBodies` | `Phaser.GameObjects.GameObject[]` | Static bodies that pen the player onto the upper walk surface, or empty on a level with only one. `GameScene` swaps its collider to these when he steps up. |
| `claimedTiles` | `ReadonlySet<GameTile>` | Tiles that became entities, and so were left out of the bake. Handed on so `src/ui/MemoryLayer.ts` can skip exactly the same tiles: what the player remembers of a room is the art that was painted into it, never the guard who happened to be standing there. |

<a id="interface-codecdata"></a>

#### `CodecData` — interface *(module-private)*

`src/scenes/CodecScene.ts:15`

| Field | Type | Notes |
| --- | --- | --- |
| `interactive` *(opt)* | `boolean` | When true (a fresh-run briefing) the scene owns input and begins play on confirm. When false it's an in-game overlay; GameScene owns the toggle key. |
| `vent4` *(opt)* | `boolean` | When true, VENT-4's maintenance band is open for the purge-phase finisher: Enter raises the `vent4Transmit` registry flag, which GameScene consumes (this scene never closes itself in passive mode). |

<a id="interface-compliancedata"></a>

#### `ComplianceData` — interface *(module-private)*

`src/scenes/ComplianceScene.ts:8`

| Field | Type | Notes |
| --- | --- | --- |
| `puzzle` *(opt)* | `PuzzleState` | The puzzle to play; defaults to EIRA-7's cached maintenance log. |

<a id="interface-debughost"></a>

#### `DebugHost` — interface

`src/scenes/game/DebugOverlay.ts:67`

The scene-level effects the cheats reach for.

The colliders are functions rather than references because no-clip toggles
them long after this is constructed, and a captured reference would go stale
the moment the scene rebuilt one.

| Field | Type | Notes |
| --- | --- | --- |
| `lighting` | `Lighting` |  |
| `entityShadows` | `EntityShadows` |  |
| `wallCollider` | `() => Phaser.Physics.Arcade.Collider \| undefined` |  |
| `doorCollider` | `() => Phaser.Physics.Arcade.Collider \| undefined` |  |
| `coverCollider` | `() => Phaser.Physics.Arcade.Collider \| undefined` | The cover bodies a crouch already switches off — no-clip has to as well. |
| `warpTargets` | `() => string[]` | Level names the warp keys map to, in key order. |
| `warpTo` | `(levelName: string) => void` | Restart the scene on another level. |
| `giveItem` | `(name: string) => void` | Grants one unit of an item, for testing weapons/items without playing to their chest. |

<a id="interface-debugworld"></a>

#### `DebugWorld` — interface

`src/scenes/game/DebugOverlay.ts:43`

What the overlay needs from the scene, supplied fresh each frame.

| Field | Type | Notes |
| --- | --- | --- |
| `grid` | `CollisionGrid` |  |
| `detection` | `DetectionSystem` |  |
| `conduct` | `ConductState` |  |
| `alert` | `AlertState` |  |
| `player` | `Player` |  |
| `guards` | `readonly Enforcer[]` |  |
| `sensors` | `readonly Sensor[]` |  |
| `tileSize` | `number` |  |
| `level` | `GameLevel` | The level itself, so the overlay can draw authored collider bounds. |
| `levelName` | `string` |  |
| `captureProgress` | `number` |  |
| `inventory` | `readonly string[]` | Current inventory, for the certified readout. |

<a id="interface-encounterscallbacks"></a>

#### `EncountersCallbacks` — interface

`src/scenes/game/Encounters.ts:50`

**Module note** — the header comment on `src/scenes/game/Encounters.ts`, which this declaration heads:

The three set-piece encounters — VENT-4, the NW-SMAC-01 vault, the rooftop
relay — as one collaborator instead of three parallel fields on GameScene.

At most one is ever present on a given level (each is gated on a disjoint
level condition), but GameScene used to carry all the wiring for all three
anyway: a field, a construct block, a tick block, an interact block and a
snapshot line, times three, all structurally identical and all bespoke.
This is that wiring, once. It owns *whether an encounter fires this frame
and what it mechanically does* — running its update, applying its hit
reactions, publishing its HUD view, arbitrating the interact key.

It deliberately does **not** own what each encounter's state changes *mean*
— the audio cue, the camera sting, the objective/journal side effects.
Those stay on GameScene as the `onXTransition` methods they already were,
passed in here as `EncountersCallbacks` the same way `OverlayGate`
takes an `onOpen`/`onClose` pair per overlay. That split is what keeps this
from becoming a generic `Encounter` interface: the three entities have
genuinely different shapes underneath (VENT-4 pushes the player with a
force that must land after `Player.update`'s own `setVelocity`; NW-SMAC-01
rewrites movement input and can raise a card that does *not* suspend the
sim; the roof spawns guards and ends the run) — unifying those would cost
more than the three near-identical wiring blocks ever did.

Disposable per level, like `NoiseEvents`: `GameScene.create()` builds a
fresh one every time rather than carrying it across `scene.restart()`, so
there is no stale-reference risk from a level that doesn't reconstruct all
three and no explicit reset method to keep in step with that.

| Field | Type | Notes |
| --- | --- | --- |
| `onVent4Transition` | `onVent4Transition(tr: Vent4Transition): void` |  |
| `onSmacTransition` | `onSmacTransition(tr: SmacTransition): void` |  |
| `onRelayTransition` | `onRelayTransition(tr: RelayTransition): void` |  |
| `onSiegeSpawn` | `onSiegeSpawn(at: { x: number; y: number }): void` | A siege Enforcer just landed at a catwalk mouth — dress it into the world (create the entity, push it onto the guard roster, alert, play the cue). The *whether* (the wave, the cap on concurrent siege guards) is decided inside `Encounters.tick` before this is ever called. |

<a id="interface-exploredworld"></a>

#### `ExploredWorld` — interface

`src/scenes/game/ExploredTracker.ts:26`

All getters. This is built as a field initializer so the ray fan and the
distance buffer are allocated once and reused across levels — `scene.restart()`
does not re-run field initialisers, and the sweep's cast is deliberately
independent of `Lighting`'s. `reload` swaps in the new level's mask.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `tileSize(): number` |  |
| `grid` | `grid(): CollisionGrid` |  |
| `levelName` | `levelName(): string` |  |
| `levelSize` | `levelSize(): { width: number; height: number }` |  |
| `eye` | `eye(): { x: number; y: number }` | Cast from here — the eye, not the body. |
| `camera` | `camera(): Phaser.Cameras.Scene2D.Camera` |  |
| `registry` | `registry(): Phaser.Data.DataManager` |  |
| `memory` | `memory(): MemoryLayer` |  |

<a id="interface-gamescenedata"></a>

#### `GameSceneData` — interface *(module-private)*

`src/scenes/GameScene.ts:134`

Data passed to `GameScene` when (re)starting for a level swap.

| Field | Type | Notes |
| --- | --- | --- |
| `level` *(opt)* | `string` |  |
| `arriveX` *(opt)* | `number` |  |
| `arriveY` *(opt)* | `number` |  |

<a id="interface-hackworld"></a>

#### `HackWorld` — interface

`src/scenes/game/TerminalHacks.ts:38`

Getters for everything `create()` rebinds per level.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `tileSize(): number` |  |
| `player` | `player(): Player` |  |
| `terminals` | `terminals(): readonly Terminal[]` |  |
| `doors` | `doors(): readonly Door[]` |  |
| `noise` | `noise(): NoiseEvents` |  |
| `overlays` | `overlays(): OverlayGate` |  |
| `objectives` | `objectives(): ObjectiveState` |  |
| `registry` | `registry(): Phaser.Data.DataManager` |  |
| `note` | `note(id: JournalEntryId): void` |  |
| `publishObjectives` | `publishObjectives(): void` | Republishes the objectives after a note lands. |

<a id="interface-itemworld"></a>

#### `ItemWorld` — interface

`src/scenes/game/ItemActions.ts:63`

Getters for everything `create()` rebinds per level.

| Field | Type | Notes |
| --- | --- | --- |
| `scene` | `Phaser.Scene` | The Phaser scene, for VFX and for parenting a deployed item. |
| `tileSize` | `tileSize(): number` |  |
| `player` | `player(): Player` |  |
| `grid` | `grid(): CollisionGrid` |  |
| `alert` | `alert(): AlertState` |  |
| `conduct` | `conduct(): ConductState` |  |
| `noise` | `noise(): NoiseEvents` |  |
| `activeItems` | `activeItems(): ActiveItemState` |  |
| `orderlies` | `orderlies(): readonly Orderly[]` |  |
| `guards` | `guards(): readonly Enforcer[]` | The patrols — the dart reaches the human ones, the EMP the silicate ones. |
| `lasers` | `lasers(): readonly Laser[]` |  |
| `coverTiles` | `coverTiles(): readonly Cover[]` |  |
| `empGfx` | `empGfx(): Phaser.GameObjects.Graphics` | The EMP zone's graphics layer, drawn between guard cones and bodies. |
| `deployables` | `deployables(): DeployedItem[]` | Items left on the floor — a deployed Sack Lunch joins this. |
| `fireTracers` | `fireTracers(): { x1: number; y1: number; x2: number; y2: number; ttl: number }[]` | The brief tracer line(s) a stapler shot leaves. |
| `registry` | `registry(): Phaser.Data.DataManager` |  |
| `markDeviation` | `markDeviation(): void` | Records that Rowan spent something — a deviation under NW-SMAC-01's posture. |

<a id="interface-noiseworld"></a>

#### `NoiseWorld` — interface

`src/scenes/game/NoiseEvents.ts:36`

The live level state noise propagation reads. Held by reference.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `number` |  |
| `grid` | `CollisionGrid` |  |
| `alert` | `AlertState` |  |
| `noiseSpam` | `NoiseSpamTracker` |  |
| `noiseLog` | `NoiseLog` | The readable tail of recent emissions, for the radar's compass ticks. |
| `guards` | `readonly Enforcer[]` |  |
| `player` | `{ x: number; y: number }` | The player, live — rallied guards are told to look at them, not at the noise. |
| `orderlies` | `readonly Orderly[]` |  |
| `doors` | `readonly Door[]` |  |
| `chests` | `readonly Chest[]` |  |
| `terminals` | `readonly Terminal[]` |  |
| `now` | `() => number` | Seconds since the game booted — the spam tracker's clock. |

<a id="interface-overlayconfig"></a>

#### `OverlayConfig` — interface

`src/scenes/game/OverlayGate.ts:21`

| Field | Type | Notes |
| --- | --- | --- |
| `sceneKey` | `string` | The Phaser scene launched for this overlay. |
| `launchData` *(opt)* | `() => object` | Data passed to `scene.launch`, evaluated at open time. |
| `onOpen` *(opt)* | `() => void` | Extra work on the way in, after physics is paused. |
| `onClose` *(opt)* | `() => void` | Extra work on the way out, before physics resumes. |

<a id="interface-powerworld"></a>

#### `PowerWorld` — interface

`src/scenes/game/PowerControl.ts:46`

All getters: like the anomaly pool, this is built as a field initializer so
the outstanding resets survive a level change, and an initializer cannot
capture anything `create()` has not set yet.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `tileSize(): number` |  |
| `levelName` | `levelName(): string` |  |
| `lighting` | `lighting(): Lighting` |  |
| `detection` | `detection(): DetectionSystem` |  |
| `orderlies` | `orderlies(): readonly Orderly[]` |  |
| `noise` | `noise(): NoiseEvents` |  |
| `powerGrid` | `powerGrid(): PowerGridState` |  |
| `violateUnauthorized` | `violateUnauthorized(): void` | Charges the breach a breaker cabinet earns — the same one a terminal does. |

<a id="interface-promptanchor"></a>

#### `PromptAnchor` — interface

`src/scenes/game/InteractPrompt.ts:61`

What the label is pinned to. `Player` satisfies this structurally; naming the
four fields it actually reads keeps the pure half testable with a literal.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `peeking` | `boolean` |  |
| `pressed` | `boolean` |  |

<a id="interface-promptcandidates"></a>

#### `PromptCandidates` — interface

`src/scenes/game/InteractPrompt.ts:32`

Everything in reach that E could act on, for the single nearest-wins prompt.

An object rather than the positional list this used to be. It had grown to
eleven parameters, six of them a thing paired with its distance, and the
breaker would have made it thirteen — at which point a transposed pair of
arguments is a bug the compiler cannot see, since half of them are `number`
and the rest are optional.

| Field | Type | Notes |
| --- | --- | --- |
| `terminal` | `Terminal \| undefined` |  |
| `terminalDist` | `number` |  |
| `door` | `Door \| undefined` |  |
| `doorDist` | `number` |  |
| `breaker` | `Breaker \| undefined` |  |
| `breakerDist` | `number` |  |
| `chest` | `Chest \| undefined` |  |
| `chestDist` | `number` |  |
| `hatch` | `boolean` |  |
| `vault` | `boolean` |  |
| `locker` | `{ occupied: boolean } \| undefined` | A locker in reach that this press would actually do something at. |
| `lockerDist` | `number` |  |
| `body` | `boolean` | A downed body in reach to pick up. Mutually exclusive with `carrying`. |
| `bodyDist` | `number` |  |
| `carrying` | `boolean` | Rowan already has somebody up, so the verb in reach is putting them down. |
| `ventLabel` *(opt)* | `string` |  |
| `ventDist` *(opt)* | `number` |  |
| `lockedLabel` *(opt)* | `string` | A transition the player is standing on that refuses to open, and why. |

<a id="interface-qualialockdata"></a>

#### `QualiaLockData` — interface *(module-private)*

`src/scenes/QualiaLockScene.ts:8`

| Field | Type | Notes |
| --- | --- | --- |
| `round` *(opt)* | `QualiaRound` | The round to play; defaults to the demo silicate-rack round. |

<a id="interface-sensingdeps"></a>

#### `SensingDeps` — interface

`src/scenes/game/SensingContext.ts:25`

The long-lived collaborators the context points at, fixed for a level.

| Field | Type | Notes |
| --- | --- | --- |
| `grid` | `CollisionGrid` |  |
| `tileSize` | `number` |  |
| `detection` | `DetectionSystem` |  |
| `alert` | `AlertState` |  |
| `flashlightOn` | `() => boolean` | True while the flashlight beam is lit — it makes Rowan far easier to spot. |
| `thermalMasked` | `() => boolean` | True while Thermal Gel is masking body heat. |
| `rationOpened` | `() => boolean` | True while a held Sack Lunch is open — crinkling packaging, organic scent. |
| `pressed` | `() => boolean` | True while Rowan is flat against a wall face — a smaller thing to notice. |
| `flashlightMultiplier` | `number` | Extra detection multipliers applied on top of the map's lights. |
| `rationMultiplier` | `number` |  |
| `pressMultiplier` | `number` | Below 1, unlike the two above: pressing *reduces* how fast you fill a meter. |
| `coverTilesNear` | `(tileX: number, tileY: number, radiusTiles: number) => { x: number; y: number }[]` |  |
| `isOperableDoor` | `(tileX: number, tileY: number) => boolean` |  |
| `setDoorOpen` | `(tileX: number, tileY: number, open: boolean) => void` |  |

<a id="interface-setpieceworld"></a>

#### `SetPieceWorld` — interface

`src/scenes/game/SetPieceEvents.ts:50`

Reached through getters rather than captured values, because the scene rebinds
most of these after this module is built.

`objectives` is the one that actually bites: `create()` constructs the
encounters before `restoreRunState()` replaces the objective object with the
one read back from the registry. A reference captured at construction would
still be live, still typecheck, and still accept every `noteVent4Defeated`
— into an object nothing reads again, so beating VENT-4 would silently fail
to unseal the roof. The rest are getters for consistency and to keep the next
reordering of `create()` from re-introducing the same class of bug.

| Field | Type | Notes |
| --- | --- | --- |
| `scene` | `Phaser.Scene` | The Phaser scene, for the camera and for parenting a spawned Enforcer. |
| `player` | `player(): Player` |  |
| `alert` | `alert(): AlertState` |  |
| `tileSize` | `number` |  |
| `objectives` | `objectives(): ObjectiveState` |  |
| `guards` | `guards(): Enforcer[]` | The live guard roster — siege Enforcers join it and are driven like any other. |
| `lasers` | `lasers(): readonly Laser[]` | The level's emitters, EMP'd wholesale by the relay's discharge. |
| `note` | `note(id: JournalEntryId): void` | Adds a journal entry, if it isn't already recorded. |
| `publishObjectives` | `publishObjectives(): void` | Republishes the objectives to the registry after a note lands. |

<a id="interface-surfacecolliders"></a>

#### `SurfaceColliders` — interface

`src/scenes/game/PlaneTraversal.ts:31`

The four colliders a surface change switches between.

| Field | Type | Notes |
| --- | --- | --- |
| `wall` *(opt)* | `Phaser.Physics.Arcade.Collider` |  |
| `door` *(opt)* | `Phaser.Physics.Arcade.Collider` |  |
| `deckEdge` *(opt)* | `Phaser.Physics.Arcade.Collider` |  |
| `cover` *(opt)* | `Phaser.Physics.Arcade.Collider` |  |

<a id="interface-traversalworld"></a>

#### `TraversalWorld` — interface

`src/scenes/game/PlaneTraversal.ts:39`

Getters for what `create()` rebinds per level.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `tileSize(): number` |  |
| `player` | `player(): Player` |  |
| `lighting` | `lighting(): Lighting` |  |
| `colliders` | `colliders(): SurfaceColliders` |  |
| `releasePress` | `releasePress(): void` | Dropped when a climb starts — he cannot hold a wall on the way up. |

<a id="interface-vaultquery"></a>

#### `VaultQuery` — interface

`src/scenes/game/VaultAndPress.ts:31`

The two boards a vault has to agree with, narrowed for the pure core.

| Field | Type | Notes |
| --- | --- | --- |
| `isBlocked` | `isBlocked(tx: number, ty: number): boolean` | Would this cell stop a standing man — walls and cover both. |
| `coverTypeAt` | `coverTypeAt(px: number, py: number): string \| undefined` | `"low"`, `"high"`, or undefined for a plain wall, at a pixel position. |

<a id="interface-vaultworld"></a>

#### `VaultWorld` — interface

`src/scenes/game/VaultAndPress.ts:87`

Getters rather than captured values: `create()` rebinds the player and the
per-level boards, and a module built before that would hold the wrong ones.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `number` |  |
| `grid` | `grid(): CollisionGrid` |  |
| `detection` | `detection(): DetectionSystem` |  |
| `player` | `player(): Player` |  |
| `heldUp` | `heldUp(): boolean` | A weapon on somebody claims Rowan's hands — he cannot vault while holding up. |

<a id="interface-witnessanchor"></a>

#### `WitnessAnchor` — interface

`src/scenes/game/Encounters.ts:64`

A fixed point that charges the Shared Field when witnessed — a rack or a dish.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `radiusTiles` | `number` |  |

### Scenes — Type aliases

<a id="type-overlayid"></a>

#### `OverlayId` — type

`src/scenes/game/OverlayGate.ts:19`

**Module note** — the header comment on `src/scenes/game/OverlayGate.ts`, which this declaration heads:

The four overlays that can take the screen away from the running game: the
pause menu, the EIRA-7 codec, and the two minigames.

Each one used to have its own toggle, and all four were the same seven lines
— flip a flag, republish the suspended state, pause Arcade physics, launch a
scene; and the reverse on the way out. What actually differs between them is
a scene key and a little setup, which is what `OverlayConfig` carries.

Centralising the flags also fixes the part that was easy to get wrong.
"Something is covering the screen" is a property of all four together, not of
whichever one just changed, so closing the codec while the pause menu is up
must not report the game as resumed. That answer is computed here from the
whole set rather than assigned by each toggle.

```ts
type OverlayId = "pause" | "codec" | "compliance" | "qualia";
```

<a id="type-target"></a>

#### `Target` — type *(module-private)*

`src/scenes/game/ItemActions.ts:349`

```ts
type Target = | { x: number; y: number; kind: "cover"; cover: Cover } | { x: number; y: number; kind: "orderly"; orderly: Orderly };
```

---

## UI

HUD widgets and DOM overlays. Phaser-drawn HUD pieces and DOM-drawn full-screen views both live here.

### UI — Constants

<a id="const-directions"></a>

#### `DIRECTIONS` — const

`src/ui/radarDirections.ts:16`

Sector order, matching the sheet's row order and `Radar.ts`'s sector indices.

```ts
const DIRECTIONS = [ "east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast", ] as const;
```

<a id="const-required-fonts"></a>

#### `REQUIRED_FONTS` — const

`src/ui/fonts.ts:38`

Families that must be resident before any `Text` is drawn.

```ts
const REQUIRED_FONTS = ["Share Tech Mono", "Article Zero Symbols", "Share Tech"] as const;
```

<a id="const-ui"></a>

#### `UI` — const

`src/ui/hudTheme.ts:34`

The palette, keyed to match `theme.css`'s custom properties.

Each key maps to `--c-<kebab-case>`; the test derives that name mechanically,
so a key added here without the matching token there fails rather than
silently becoming a private colour.

| Key | Value | Notes |
| --- | --- | --- |
| `cyan` | `"#00cdf9"` |  |
| `cyanBright` | `"#0cf1ff"` |  |
| `amber` | `"#ffa214"` |  |
| `amberBright` | `"#ffeb57"` |  |
| `red` | `"#f5555d"` |  |
| `redDeep` | `"#ea323c"` |  |
| `green` | `"#5ac54f"` |  |
| `greenBright` | `"#d3fc7e"` |  |
| `greenSoft` | `"#99e65f"` | The "we" of a merged Shared Field, and the ready state that precedes it. |
| `blueSoft` | `"#94fdff"` | Body text that wants to read as *interface* without the accent's heat. |
| `bgVoid` | `"#0e071b"` | What the canvas clears to — darker than any panel. |
| `bgPanel` | `"#1a1932"` |  |
| `bgScope` | `"#131313"` |  |
| `track` | `"#0c2e44"` |  |
| `border` | `"#0069aa"` |  |
| `borderCool` | `"#424c6e"` |  |
| `borderDim` | `"#2a2f4e"` |  |
| `text` | `"#c7cfdd"` |  |
| `textStrong` | `"#ffffff"` |  |
| `textBtn` | `"#b4b4b4"` |  |
| `textMuted` | `"#92a1b9"` |  |
| `textFaint` | `"#858585"` |  |
| `textDim` | `"#657392"` |  |
| `textDisabled` | `"#5d5d5d"` |  |
| `textDebug` | `"#3d3d3d"` |  |

<a id="const-ui-depth"></a>

#### `UI_DEPTH` — const

`src/ui/hudTheme.ts:134`

Depth bands for the HUD.

These were ad-hoc — 900, 1000, 1001, 1002, 1500 scattered across nine widgets,
each chosen relative to whatever the author happened to be looking at. The
numbers are unchanged (this is a naming pass, not a re-ordering) but they now
say what they are for, so the next widget stacks itself deliberately.

| Key | Value | Notes |
| --- | --- | --- |
| `PANEL` | `900` | Panel backgrounds and track rectangles — behind everything they contain. |
| `BASE` | `1000` | The HUD proper: text, chrome, bar tracks. |
| `FILL` | `1001` | Bar fills and the radar bezel — over BASE, under its own labels. |
| `ACCENT` | `1002` | Labels that must stay legible on top of a fill. |
| `DEBUG` | `1500` | The debug inspector, above the whole HUD. |

<a id="const-ui-text"></a>

#### `UI_TEXT` — const

`src/ui/hudTheme.ts:113`

The type scale.

Five steps, because the HUD had grown five sizes (10/11/12/13/20) by accident
and they turned out to be doing five distinct jobs. Named for the job so a new
widget picks a role rather than a number.

| Key | Value | Notes |
| --- | --- | --- |
| `title` | `"20px"` | The alert-phase banner. Nothing else is this large. |
| `body` | `"13px"` | Running prose — objectives, codec-adjacent readouts. |
| `label` | `"12px"` | The default: inventory rows, the controls hint, the conduct line. |
| `small` | `"11px"` | Section headings above a bar, and the alert-network rows. |
| `micro` | `"10px"` | Numeric detail that must not compete — SRP axes, the JAMMED tag. |

<a id="const-ui-textures"></a>

#### `UI_TEXTURES` — const

`src/ui/UiTextures.ts:71`

```ts
const UI_TEXTURES = [ { key: "ui-panel", path: "assets/ui/panel/ui-panel.png", size: 48, slice: 12, sheet: { margin: 0, spacing: 0, count: SCREEN_FRAME_COUNT }, }, { key: "ui-network-indicators", path: "assets/ui/panel/network-indicators.png", size: INDICATOR_SIZE, sheet: { margin: 0, spacing: 0, count: INDICATOR_FRAME_COUNT }, }, { key: "ui-radar-bezel", path: "assets/ui/radar/bezel.png", size: 96 }, { key: "ui-radar-directions", path: "assets/ui/radar/radar-directions.png", size: TICK_SIZE, sheet: { margin: 0, spacing: 0, count: TICK_FRAME_COUNT }, }, ] as const;
```

### UI — Classes

<a id="class-alertnetworkhud"></a>

#### `AlertNetworkHud` — class

`src/ui/AlertNetworkHud.ts:65`

A small readout of the base's security network, pinned under the detection
meter (top-left). Shows the network status, how many detectors are online /
alerted / suspicious, and — while combat-aware — how many guards are
converging on the last-known position and the seconds until it relaxes.

Reads the snapshot the scene publishes to the registry; screen-anchored so
the camera zoom doesn't scale it (same pattern as `Hud`).

This is the one panel in the HUD that is also an instrument. Its art carries
four indicators — three binary LED clusters counting units, spotters and
suspicious contacts, plus a status badge — and they say the same numbers the
detail lines below print in words, so the two cannot disagree. Everything
else that adopts a panel gets plain chrome; see `./NetworkPanel` for
what each frame means.

The indicators are separate sprites rather than baked frames because they
vary independently: three counts of 0–10-plus-overflow against five badge
states and three screens is over twenty thousand combinations. Pinning them
to the panel's corners works because nine-slice reproduces corners at native
size however far the middle is stretched.

Under ALERT it is also the only animated thing in the HUD: the whole panel
blinks dark on a slow beat, and the screen flashes red once on the way in.
See `animate` for why neither uses a timer.

Also the one panel a player can hide — `K` toggles it via `setShown`,
bound in `UIScene`. Hiding takes the panel, its three text objects *and* its
four indicators together, so nothing is left stranded on screen.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(net: AlertNetworkSnapshot): void` |  |
| `isShown` | `isShown(): boolean` | Whether the panel is currently on screen. |
| `setShown` | `setShown(shown: boolean): void` | Shows or hides the panel, its text and its indicators together. |

*Plus 17 private members.*

<a id="class-biomonitor"></a>

#### `BioMonitor` — class

`src/ui/BioMonitor.ts:76`

Rowan's bio-integrity, as an EKG bent into a dial.

This was a fill bar, then a left-to-right strip. The strip read correctly and that
was the problem: a scrolling trace is *our* medical iconography, so the player
recognised a hospital instead of noticing an instrument. Wrapping it into a ring
that sweeps counter-clockwise keeps everything the trace earned — rate, shape,
colour, flatline — while making the machine itself unfamiliar, which is the whole
point of a facility that will not call the body it is monitoring a subject's.

The waveform lives in `ekg`, unchanged by the move: `advanceTrace` fills an
index-addressed ring buffer, and whether index `i` means a column or an angle was
always this file's business. Angles come from `traceAngle`.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene, x: number, y: number)` |  |
| `update` | `update(hp: number, maxHp: number, deltaMs: number): void` | Steps the sweep and redraws it. @param deltaMs frame time. Callers pass 0 to hold the trace still — the sim is   suspended behind an overlay and a heart beating through the pause menu is a lie   about whether the game is running. |

*Plus 10 private members.*

<a id="class-bosscorehud"></a>

#### `BossCoreHud` — class

`src/ui/BossCoreHud.ts:45`

The NW-SMAC-01 encounter HUD.

The bar/status/banner is the shared `EncounterBand`. What this file owns is the
two things this boss does that nothing else in the game does:

 - a **`[CORRECTION]` tag** naming which movement axes are currently being rewritten,
   so the player can tell a hijack from their own mistake;
 - the **opaque false-completion card**, which is deliberately *not* wired through
   `simSuspended`. Everything underneath keeps running while it is up.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(v: SmacView \| null): void` |  |

*Plus 9 private members.*

<a id="class-complianceview"></a>

#### `ComplianceView` — class

`src/ui/ComplianceView.ts:32`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(mount: HTMLElement, puzzle: PuzzleState, callbacks: ComplianceViewCallbacks = {})` |  |
| `destroy` | `destroy(): void` | Detaches the widget and its listeners. Safe to call more than once. |

*Plus 21 private members.*

<a id="class-debughud"></a>

#### `DebugHud` — class

`src/ui/DebugHud.ts:65`

A developer inspector panel: FPS, player position, cheat flags, alert phase,
and per-unit detection. Pinned to the top-right of the (unzoomed) UIScene and
only ever built when debug mode is allowed — see the `DEBUG_ALLOWED` guard in
`UIScene`. Follows the same monospace / scroll-factor-0 conventions as
`Hud`.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(view: DebugSnapshot \| undefined): void` |  |

*Plus 4 private members.*

<a id="class-encounterband"></a>

#### `EncounterBand` — class

`src/ui/EncounterBand.ts:67`

The top-centre encounter readout: title, bar, status line and a flashing banner queue.

All three encounters put the same widget on screen — VENT-4's Compliance Index,
NW-SMAC-01's Alignment Integrity, the roof's uplink percentage — and for a while all
three owned a private copy of it. The copies were byte-identical for about 90 lines
each: the five game objects and their chained builders, the `onResize` layout closure,
the `lastTitle`/`lastStatus` memoisation that keeps `setText` (a canvas reflow and a
texture re-raster) off the frame path, the enqueue/dequeue/flash block, and `hideAll`.

They had already started to drift — one restored alpha in `hideAll` and the others
didn't; one's `update(null)` guard checked a condition the others' missed — which is
the ordinary fate of three copies nobody edits together. `hudLayout.ts` exists because
a previous change to this band was missed in one of them.

Composed, not inherited: the house rule (see `HoldTarget`) is that shared *mechanics*
go in an object the users hold, so each HUD keeps its own vocabulary and the one thing
it alone does — VENT-4's band table, NW-SMAC-01's `[CORRECTION]` tag and false
completion card, the roof's capture flicker.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( scene: Phaser.Scene, private readonly style: EncounterBandStyle, )` |  |
| `visible` | `get visible(): boolean` | True while the band owns screen space — the cheap "do I need hiding?" check. |
| `set` | `set(f: EncounterBandFrame): void` | Draws one frame. |
| `hide` | `hide(): void` | Hides every part and forgets the queue — `UIScene` outlives levels. |
| `conceal` | `conceal(): void` | Hides only the band, leaving a caller's own extras alone (the false-summary card). |

*Plus 11 private members.*

<a id="class-entityshadows"></a>

#### `EntityShadows` — class

`src/ui/EntityShadows.ts:92`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene, lighting: Lighting)` |  |
| `update` | `update(casters: readonly ShadowCaster[]): void` | Repositions one shadow per caster and hides the rest. Call after the bodies have been moved for the frame, so a shadow never trails the feet it belongs to by a frame. |
| `setEnabled` | `setEnabled(on: boolean): void` | Hides the whole layer, tracking the debug darkness toggle. |
| `destroy` | `destroy(): void` | Releases the pool. Call on scene shutdown. These are `scene.add.image`, so they are on the display list and Phaser would reclaim them anyway; doing it here keeps ownership in one place rather than split between this class and Phaser's bookkeeping, which is the same call `Lighting.destroy` makes about its own render texture. |

*Plus 5 private members.*

<a id="class-hud"></a>

#### `Hud` — class

`src/ui/Hud.ts:37`

Heads-up display. The detection meter is framed as the facility's
**Subjectivity Risk Profile**: being seen means registering as a *subject*, so
the H (Harm/Vulnerability) and Y (Yield) axes climb while Q (Qualia) stays
pinned at 0 by the Non-Subject Status Act. Beneath it, a `BioMonitor` traces
Rowan's bio-integrity (health) as an EKG. Pinned to the camera; runs in the parallel
UIScene.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update( alert: { phase: AlertPhase }, detection: number, hp: number, maxHp: number, deltaMs: number, conduct?: ConductView, ): void` | @param deltaMs frame time, for the EKG sweep. 0 holds the trace still while an   overlay owns the screen — see the call site in `UIScene`. |

*Plus 9 private members.*

<a id="class-inventoryhud"></a>

#### `InventoryHud` — class

`src/ui/InventoryHud.ts:23`

A compact inventory readout pinned to the bottom-right of the screen, in three
sections: the held CONSUMABLES (with counts and, for timed buffs, their
remaining duration) with a cursor (▸) on whichever one `,`/`.` has selected
and `Enter` would use, the flashlight EQUIPMENT state, and passive KEY ITEMS.
Purely a display — it reads the inventory/active-item/selection state the
scene publishes to the registry; GameScene owns spending the items.

The text itself is built by `inventoryLines`, which is a pure function so
that `hudLayout.test.ts` can check the widest and tallest shapes this can take
against the bottom-right budget without standing up a canvas.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(items: string[], active: ActiveItemsView, selected: string \| undefined): void` |  |

*Plus 4 private members.*

<a id="class-lighting"></a>

#### `Lighting` — class

`src/ui/Lighting.ts:141`

Visible dynamic lighting: fills the level with opaque darkness, punches bright
pools out of it at each `light_source` (plus the player's flashlight cone), then
puts the darkness back everywhere the player has no line of sight.

The darkness is a mechanic, not a tint. Unlit space is genuinely black, and what
light there is only reads where walls don't stand in the way — so a lit room
behind a wall, and a guard patrolling around a corner, are both invisible until
you have real sight of them. It reads the *same* `light_sources` data the
`DetectionSystem` uses (via `lightStatsFor`), so a lit spot is both visibly
brighter and mechanically easier to be seen in.

Two layers, deliberately kept apart because they change at different rates:

- **The light texture** — a level-sized `RenderTexture` filled opaque dark with a
  soft radial-gradient stamp `erase`d at each light (erasing subtracts darkness →
  light). Only depends on the lights and the beam, so it is recomposited only when
  one of those actually changes. Every stamp is erased in a single batched call:
  each `erase` costs a framebuffer round-trip, and doing 50 of them per frame is
  what makes this expensive.
- **The shadow fan** — an ordinary `Graphics` layered just above, filling opaque
  dark over everything outside the viewer's visibility polygon (see
  `src/systems/Visibility.ts`). Redrawn whenever the player moves, which is most
  frames — so it stays on the display list rather than being drawn into a texture.
  Being *over* the light texture is what clips the pools and the cone to line of
  sight, with no per-light sight test.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene, level: GameLevel, tileSize: number, grid: CollisionGrid)` |  |
| `update` | `update(dt: number, viewer: { x: number; y: number }, beam: FlashlightBeam \| null = null): void` | @param viewer the eye the visibility polygon is cast from (the player). @param beam the player's flashlight beam, or null when it isn't emitting. |
| `shadowGeometry` | `get shadowGeometry(): Phaser.GameObjects.Graphics` | The shadow fan's geometry — the region the viewer *cannot* see. Exposed for `src/ui/MemoryLayer.ts`, which masks itself to exactly this so remembered art appears only outside line of sight. Sharing the geometry rather than casting a second polygon is what keeps the two boundaries the same line by construction, at no extra cost. This hands back the **mask twin**, not the fan that is actually drawn, and the distinction is load-bearing: a `Graphics` that is rendered on the display list does not also work as a geometry-mask source. Masking to the drawn fan silently produced a stencil that passed everywhere, so remembered art washed over the lit room the player was standing in — measurably, the visible floor came out 30% darker. Two objects over one command buffer is what fixes it. |
| `sampleLight` | `sampleLight(x: number, y: number): LightSample` | How the point `(x, y)` is lit — see `sampleLightAt` for the arithmetic. Exists so `EntityShadows` can throw a character's shadow away from whatever is actually lighting them, off the same `light_sources` this overlay draws and the `DetectionSystem` scores. One source of truth: a spot that reads bright, plays dangerous *and* casts a long shadow, and retuning a light moves all three together. The result is a reused scratch object, valid only until the next call. The whole cast asks this every frame and none of them keep the answer. **Only the fixed `light_source` fixtures cast.** The two moving lights are left out deliberately: - Rowan's carried pool is dark-adapted eyes rather than something he emits — the   same reason `PLAYER_LIGHT_TILES` keeps it out of `DetectionSystem`. Letting   it cast would put a shadow under everyone he walks near, thrown by nothing. - The flashlight is rigidly attached to him, so his own shadow would sit pinned at   a fixed offset no matter how he moved — motionless relative to the only thing   that could reveal it was there. Worth revisiting for *other* casters lit by the   beam, which is a real effect and needs the cone's angular test to get right. |
| `destroy` | `destroy(): void` | Releases everything this overlay owns. Call on scene shutdown. The stamps are the reason this has to exist. They are built with `scene.make.image({ add: false })` — deliberately, because they are erase brushes stamped into a RenderTexture rather than things the camera should draw — but the cost of staying off the display list is that `Scene.shutdown` never sees them, and so never destroys them. Every level transition is a `scene.restart()` that constructs a fresh `Lighting`, so without this each swap orphaned one stamp per light source (49 of them on `main1`) plus the cone and the player's pool, for the life of the session. `rt` and `shadowGfx` *are* on the display list and would be collected anyway; destroying them here too keeps the ownership in one place rather than split between this class and Phaser's bookkeeping. |
| `setPlane` | `setPlane(plane: number): void` | Which walk surface sight is cast against — see `src/map/planes.ts`. Changing it invalidates the polygon outright: the deck and the floor beneath it occlude completely differently, so there is nothing to reuse. |
| `setEnabled` | `setEnabled(on: boolean): void` | Debug switch: hides the whole overlay so the level can be read at full brightness. Re-enabling rebuilds both layers, since they went stale while off. |
| `setCircuit` | `setCircuit(ref: string, on: boolean): void` | Powers every fixture whose tile-def ref is `ref` on or off — a breaker throw. Matching on the ref is the whole mechanic: `light_overhead1` is one tile def placed fifty times across main1, so `main1`'s single breaker takes the deck's entire overhead lighting with it. See `src/systems/PowerGrid.ts`. Cheap despite the count. The stamps are erased in one batched call and the texture is only recomposited when `dirty`, so fifty lights going out is one rebuild of the list plus one redraw — not fifty of anything. |

*Plus 34 private members.*

<a id="class-memorylayer"></a>

#### `MemoryLayer` — class

`src/ui/MemoryLayer.ts:69`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( scene: Phaser.Scene, private readonly level: GameLevel, tileSize: number, skipLayers: ReadonlySet<string>, claimedTiles: ReadonlySet<GameTile>, )` |  |
| `clipTo` | `clipTo(fan: Phaser.GameObjects.Graphics): void` | Clips both layers to everything *outside* the viewer's line of sight. `fan` is `Lighting`'s shadow geometry, which is already exactly that region — so memory costs no second visibility polygon, and the boundary between "seeing" and "remembering" is by construction the same line. One mask object drives both layers. The fan's `postFX` blur does not apply to a stencil, so this edge is crisp where the darkness's is feathered. At these alphas the difference does not read; if it ever does, the answer is a blur on `rt`, not a second fan. |
| `prime` | `prime(explored: ExploredMap): void` | Draws every tile already marked seen — a save resumed mid-level. |
| `remember` | `remember(cells: readonly number[]): void` | Commits newly-seen cells to memory. `cells` are `y * width + x` keys, which is what the explored sweep already has in hand. |
| `destroy` | `destroy(): void` |  |

*Plus 6 private members.*

<a id="class-menu"></a>

#### `Menu` — class

`src/ui/Menu.ts:21`

A small keyboard-navigable vertical menu (↑/↓ or W/S to move, Enter/Space to
choose), shared by the title and outcome screens. Create it, then call
`layout` to place its centred column — re-call on resize.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( scene: Phaser.Scene, private readonly items: MenuItem[], private readonly gap = 36, )` |  |
| `layout` | `layout(cx: number, cy: number): void` | Positions the menu as a column centred on (cx, cy). |

*Plus 7 private members.*

<a id="class-objectivehud"></a>

#### `ObjectiveHud` — class

`src/ui/ObjectiveHud.ts:27`

A compact objective tracker pinned to the top-centre of the screen. Reads the
objective state the scene publishes to the registry and renders each line with
a ✓/○ marker; turns green once the whole directive is complete.

"Top-centre" means centred on the space between the status stack and the radar,
not on the viewport — see `objectiveCentre`. On a wide canvas those are the
same place; on a narrow one they are not, and the difference is the directive
printing through the SRP meter.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(state: ObjectiveState, currentLevel: string, features: MissionFeatures): void` |  |

*Plus 5 private members.*

<a id="class-pausemenuview"></a>

#### `PauseMenuView` — class

`src/ui/PauseMenuView.ts:99`

The in-game pause menu.

A DOM overlay rather than Phaser game objects, for the same reason the codec
and the two minigames are: it is mostly *text*, some of it long, and text that
has to scroll, wrap, reflow with the window and be reachable by a screen reader
is work the browser already does. Nine tabs — the directive, Rowan's journal,
the inventory in detail, the index, his standing, the map, the controls,
settings, and the save slots.

Framework-agnostic on purpose (no Phaser import, no registry access): it takes
a `PauseSnapshot` in and calls `PauseCallbacks` out, exactly like
`ComplianceView` and `QualiaLockView`, which is what keeps the game's state
ownership in `GameScene` where it belongs.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( mount: HTMLElement, private snap: PauseSnapshot, private readonly cb: PauseCallbacks, )` |  |
| `refreshSaves` | `refreshSaves(saves: PauseSnapshot["saves"]): void` | Re-reads the save listing into the SYSTEM tab after a write lands. |
| `destroy` | `destroy(): void` |  |

*Plus 24 private members.*

<a id="class-planeoverlay"></a>

#### `PlaneOverlay` — class

`src/ui/PlaneOverlay.ts:37`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( private readonly level: GameLevel, tileSize: number, planes: readonly BakedPlane[], )` |  |
| `update` | `update(dt: number, playerX: number, playerY: number, plane: number, tileSize: number): void` | @param plane the walk surface the player is currently on. |

*Plus 1 private member.*

<a id="class-qualialockview"></a>

#### `QualiaLockView` — class

`src/ui/QualiaLockView.ts:75`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(mount: HTMLElement, round: QualiaRound, callbacks: QualiaLockViewCallbacks = {})` |  |
| `destroy` | `destroy(): void` | Detaches the widget, its RAF loop, and its listeners. Idempotent. |

*Plus 36 private members.*

<a id="class-radar"></a>

#### `Radar` — class

`src/ui/Radar.ts:47`

Soliton-radar-style circular minimap, screen-anchored top-right.

World-aligned (does not rotate with the player) so it reads as a plan view
of the room, like the classic Metal Gear radar: guard blips and nearby
terrain within `RADAR_RADIUS_TILES`, with the player as a facing
triangle at the centre. During ALERT the feed is jammed — a flickering
red static in place of blips/terrain — so the radar's safety net drops out
exactly when guards are actively hunting.

Draws into a masked Graphics object (circle geometry mask) so content
clips cleanly at the bezel; a second, unmasked Graphics draws the ring on
top so the edge stays crisp.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(snapshot: RadarSnapshot): void` |  |

*Plus 18 private members.*

<a id="class-relayhud"></a>

#### `RelayHud` — class

`src/ui/RelayHud.ts:24`

The rooftop relay HUD: the uplink progress bar and the phase readout.

The band itself — title, bar, status, banner queue, wash — is `EncounterBand`,
shared with the other two encounters. What lives here is the one thing this readout
does that no other does: at 100% it is supposed to stop being readable. The percentage
scrambles to hex and the whole thing jitters, because the mesh has just taken the feed
away from Rowan and the player should feel the HUD lose its grip rather than watch it
get tidied away.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(v: RelayView \| null): void` |  |

*Plus 1 private member.*

<a id="class-selectlist"></a>

#### `SelectList` — class

`src/ui/SelectList.ts:29`

| Member | Signature | Notes |
| --- | --- | --- |
| `node` | `readonly node: HTMLElement` |  |
| `constructor` | `constructor( private readonly onChange: (index: number) => void, label = "Entries", )` | @param onChange fires whenever the highlighted row changes — the detail pane   re-renders from it. Also fired once by `setRows` so the pane is never   blank on first paint. |
| `setRows` | `setRows(rows: SelectListRow[]): void` |  |
| `selected` | `get selected(): number` |  |
| `move` | `move(delta: number): void` | Moves the highlight, skipping disabled rows. Stops at the ends — a list  that wraps makes it impossible to tell you're at the bottom without looking. |
| `select` | `select(i: number): void` |  |
| `activate` | `activate(): void` | Runs the highlighted row's action, if it has one. |
| `onKey` | `onKey(e: KeyboardEvent): boolean` | Handles the list's share of the keyboard; returns whether it consumed the key. |

*Plus 6 private members.*

<a id="class-sharedfieldhud"></a>

#### `SharedFieldHud` — class

`src/ui/SharedFieldHud.ts:19`

The Shared Field gauge (bottom-centre) plus the full-screen merge overlay.
Charging fills the bar; when ready it prompts [F]; while a merge is active it
drains the bar and tints the screen — the "we" of WX-9.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(v: SharedFieldView): void` |  |

*Plus 5 private members.*

<a id="class-tribunalscreen"></a>

#### `TribunalScreen` — class

`src/ui/TribunalScreen.ts:51`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(mount: HTMLElement, callbacks: TribunalCallbacks)` |  |
| `destroy` | `destroy(): void` |  |

*Plus 3 private members.*

<a id="class-vent4hud"></a>

#### `Vent4Hud` — class

`src/ui/Vent4Hud.ts:22`

The VENT-4 encounter HUD: a Compliance Index bar (the boss's "health", 100% → 0%), a
band/status readout, and the Phase-3 purge's red screen wash.

The widget itself is `EncounterBand`, shared with the two later encounters —
this file is now only VENT-4's vocabulary: which band it is in, and what that is
called. Hidden entirely outside the vent core, since `UIScene` runs across level
swaps and `update(null)` is how it learns to clear.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(v: Vent4View \| null): void` |  |

*Plus 1 private member.*

### UI — Interfaces

<a id="interface-codeccontext"></a>

#### `CodecContext` — interface

`src/ui/Codec.ts:28`

Everything the transmission depends on, gathered by the caller.

| Field | Type | Notes |
| --- | --- | --- |
| `briefing` | `boolean` | The fresh-run briefing, which owns input and starts play on confirm. |
| `objectives` | `ObjectiveState` | Mission progress — picks the beat. |
| `features` | `MissionFeatures` | Which acts this map could furnish. |
| `highCompliance` | `boolean` | `ConductState.isHighCompliance()` — quiet, and a lot of ground covered. |
| `sabotageActions` | `number` | Distinct sabotage acts this run. |

<a id="interface-complianceviewcallbacks"></a>

#### `ComplianceViewCallbacks` — interface

`src/ui/ComplianceView.ts:25`

| Field | Type | Notes |
| --- | --- | --- |
| `onSolved` *(opt)* | `(finalText: string) => void` | Fired when the player transmits a solved log. Receives the final text. |
| `onClose` *(opt)* | `() => void` | Fired when the player aborts (Esc / ABORT) without solving. |

<a id="interface-conestyle"></a>

#### `ConeStyle` — interface

`src/ui/VisionCone.ts:29`

| Field | Type | Notes |
| --- | --- | --- |
| `color` | `number` | Fill while the cone is idle. |
| `alpha` | `number` |  |
| `hotColor` | `number` | Fill once detection passes `CONE_HOT_THRESHOLD`. |
| `hotAlpha` | `number` |  |

<a id="interface-controlbinding"></a>

#### `ControlBinding` — interface

`src/ui/Controls.ts:20`

**Module note** — the header comment on `src/ui/Controls.ts`, which this declaration heads:

The keybinding list, in one place.

It was previously written out twice — once as a hardcoded string in the HUD's
bottom-left hint (`Hud.ts`) and once in the README's controls table — with the
pause menu's CONTROLS tab about to make three. The hint had already drifted
once. `GameScene.bindInput()` remains the place most keys are actually
*bound* (one exception: `K` is `UIScene`'s own, since it toggles a HUD panel
rather than doing anything to the player); this is the place they are all
*described*, and the two are checked against each other by eye at review
time rather than by a mechanism, because Phaser gives no enumerable view of
a scene's bindings.

Keys bound outside `GameScene.bindInput` are the ones worth checking twice:
`DebugOverlay` registers its own, and a collision there is silent because the
two scenes both receive the keypress. That is how the panel toggle came to be
on `K` — it shipped on `N` and shared it with no-clip.

| Field | Type | Notes |
| --- | --- | --- |
| `key` | `string` |  |
| `action` | `string` |  |
| `hint` *(opt)* | `string` | Terse form for the HUD's single-line hint; omitted keys stay off it. |

<a id="interface-debugsnapshot"></a>

#### `DebugSnapshot` — interface

`src/ui/DebugHud.ts:26`

Live game state published by `GameScene` for the debug panel. Written to
the registry under the `"debug"` key each frame (dev builds only).

| Field | Type | Notes |
| --- | --- | --- |
| `enabled` | `boolean` |  |
| `godMode` | `boolean` |  |
| `noClip` | `boolean` |  |
| `worldDraw` | `boolean` |  |
| `frozenWorld` | `boolean` |  |
| `darknessOff` | `boolean` |  |
| `compliant` | `boolean` | Whether Rowan currently reads as compliant staff, and if not, what broke it. |
| `breach` | `string \| null` |  |
| `flaggedRemaining` | `number` |  |
| `certified` | `boolean` | Carrying the Q0 compliance cert (lets compliance survive a search). |
| `selectedItem` | `string` | The item name [I] currently grants. |
| `selectedHeld` | `number` | How many of `selectedItem` are currently held. |
| `fps` | `number` |  |
| `px` | `number` |  |
| `py` | `number` |  |
| `tileX` | `number` |  |
| `tileY` | `number` |  |
| `facing` | `number` |  |
| `hp` | `number` |  |
| `maxHp` | `number` |  |
| `capture` | `number` |  |
| `captureTime` | `number` |  |
| `level` | `string` |  |
| `alertPhase` | `AlertPhase` |  |
| `units` | `DebugUnitView[]` |  |

<a id="interface-debugunitview"></a>

#### `DebugUnitView` — interface

`src/ui/DebugHud.ts:17`

A named unit and its current detection level (0..1).

| Field | Type | Notes |
| --- | --- | --- |
| `label` | `string` |  |
| `detection` | `number` |  |

<a id="interface-encounterbandframe"></a>

#### `EncounterBandFrame` — interface

`src/ui/EncounterBand.ts:30`

One frame of readout.

| Field | Type | Notes |
| --- | --- | --- |
| `title` | `string` |  |
| `frac` | `number` | Bar fill, 0..1. |
| `status` | `string` |  |
| `statusColor` | `string` | CSS colour for the status line. |
| `fillColor` *(opt)* | `number` | Overrides `EncounterBandStyle.fillColor` for this frame. |
| `msg` *(opt)* | `{ id: number; text: string }` | The encounter's latest system message; re-showing is keyed on `id`. |
| `wash` *(opt)* | `boolean` | Whether the wash should be breathing this frame. |
| `legibility` *(opt)* | `number` | 0..1 alpha jitter for a readout that is losing its grip; 1 = steady. |

<a id="interface-encounterbandstyle"></a>

#### `EncounterBandStyle` — interface

`src/ui/EncounterBand.ts:18`

| Field | Type | Notes |
| --- | --- | --- |
| `barW` | `number` | Bar width in pixels. |
| `fillColor` | `number` | Fill colour while nothing overrides it. |
| `bannerColor` | `number` | Banner text colour. |
| `wash` *(opt)* | `{ color: number; alpha: number }` | Optional full-screen wash this encounter breathes during its worst phase. |

<a id="interface-faded"></a>

#### `Faded` — interface *(module-private)*

`src/ui/PlaneOverlay.ts:28`

| Field | Type | Notes |
| --- | --- | --- |
| `texture` | `Phaser.GameObjects.RenderTexture` |  |
| `covers` | `Uint8Array` | Cells that, with the player standing on them, put this surface overhead. |
| `under` | `number` | The plane the player must be *on* for this surface to be overhead. |
| `alpha` | `number` |  |

<a id="interface-flashlightbeam"></a>

#### `FlashlightBeam` — interface

`src/ui/Lighting.ts:107`

The player's flashlight beam, or null when it isn't emitting.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `facing` | `number` | Facing angle in radians. |

<a id="interface-light"></a>

#### `Light` — interface *(module-private)*

`src/ui/Lighting.ts:79`

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `radiusPx` | `number` |  |
| `flicker` | `boolean` |  |
| `phase` | `number` |  |
| `ref` | `string` | The fixture's tile-def ref, which is what a breaker's `Target` names. Kept per light rather than resolved to a list of indices once, so that this and `DetectionSystem` — which has to make the identical cut — do not have to agree on an iteration order neither of them states. |
| `powered` | `boolean` | False once a breaker has opened this light's circuit. See `Lighting.setCircuit`. |
| `intensity` | `number` | Current brightness multiplier, 1 for a steady light and the flicker factor for a guttering one. Written by `Lighting.drawLights` where that factor is already being computed for the stamp, and read by `Lighting.sampleLight` so a shadow cast by a failing lamp gutters along with it. |
| `stamp` | `Phaser.GameObjects.Image` | The stamp erased at this light. One per light so all of them batch together. |

<a id="interface-menuitem"></a>

#### `MenuItem` — interface

`src/ui/Menu.ts:9`

| Field | Type | Notes |
| --- | --- | --- |
| `label` | `string` |  |
| `onSelect` | `() => void` |  |
| `enabled` *(opt)* | `boolean` | A disabled item is dimmed and skipped by navigation/selection. |

<a id="interface-networkindicatorframes"></a>

#### `NetworkIndicatorFrames` — interface

`src/ui/NetworkPanel.ts:158`

Every indicator frame for one readout.

| Field | Type | Notes |
| --- | --- | --- |
| `screen` | `number` |  |
| `unit` | `number` |  |
| `spot` | `number` |  |
| `susp` | `number` |  |
| `badge` | `number` |  |

<a id="interface-palette"></a>

#### `Palette` — interface *(module-private)*

`src/ui/MiniMapCanvas.ts:18`

**Module note** — the header comment on `src/ui/MiniMapCanvas.ts`, which this declaration heads:

The pause menu's level map.

Draws the current level as a tile grid into a `<canvas>`, masked by what the
player has actually seen: unexplored tiles are left at the panel background, so
the map fills in as a record of the route rather than handing over the floor
plan. Walls read as structure, the exits are called out in amber, and Rowan is
a cyan pip.

Pure 2D canvas — no Phaser. The palette is pulled from the same `theme.css`
custom properties the rest of the overlay UI uses, because a canvas can't
reference them itself and a second hardcoded palette would be one to drift.

| Field | Type | Notes |
| --- | --- | --- |
| `wall` | `string` |  |
| `floor` | `string` |  |
| `exit` | `string` |  |
| `player` | `string` |  |

<a id="interface-pane"></a>

#### `Pane` — interface *(module-private)*

`src/ui/PauseMenuView.ts:69`

One tab's content, plus its share of the keyboard.

| Field | Type | Notes |
| --- | --- | --- |
| `node` | `HTMLElement` |  |
| `onKey` *(opt)* | `onKey?(e: KeyboardEvent): boolean` | Returns whether the key was consumed. |
| `onShow` *(opt)* | `onShow?(): void` | Called when the tab is shown — panes that measure themselves need it. |

<a id="interface-pausecallbacks"></a>

#### `PauseCallbacks` — interface

`src/ui/PauseMenuView.ts:60`

What the menu can ask the game to do. The scene turns these into requests.

| Field | Type | Notes |
| --- | --- | --- |
| `onResume` | `onResume(): void` |  |
| `onSave` | `onSave(slot: SlotId): void` |  |
| `onLoad` | `onLoad(slot: SlotId): void` |  |
| `onQuit` | `onQuit(): void` |  |
| `onSettings` | `onSettings(settings: Settings): void` |  |

<a id="interface-pausesnapshot"></a>

#### `PauseSnapshot` — interface

`src/ui/PauseMenuView.ts:39`

Everything the menu renders, read off the registry when the game freezes.

| Field | Type | Notes |
| --- | --- | --- |
| `objectives` | `ObjectiveState` |  |
| `currentLevel` | `string` |  |
| `features` | `MissionFeatures` | Which acts this map furnished — see `missionFeatures`. |
| `inventory` | `string[]` |  |
| `active` | `ActiveItemsView` |  |
| `journal` | `JournalState` |  |
| `hp` | `number` |  |
| `maxHp` | `number` |  |
| `detection` | `number` |  |
| `alertPhase` | `AlertPhase` |  |
| `conduct` *(opt)* | `ConductView` |  |
| `sharedField` *(opt)* | `SharedFieldView` |  |
| `playTimeMs` | `number` |  |
| `map` *(opt)* | `MapSnapshot` |  |
| `saves` | `{ slot: SlotId; data: SaveData \| null }[]` |  |
| `settings` | `Settings` |  |

<a id="interface-qualialockviewcallbacks"></a>

#### `QualiaLockViewCallbacks` — interface

`src/ui/QualiaLockView.ts:33`

| Field | Type | Notes |
| --- | --- | --- |
| `onSolved` *(opt)* | `() => void` | Fired once the bypass completes (≥95% alignment sustained). |
| `onPurged` *(opt)* | `() => void` | Fired once the instability meter trips an environmental purge. |
| `onClose` *(opt)* | `() => void` | Fired when the player aborts (Esc / ABORT) without a result. |

<a id="interface-selectlistrow"></a>

#### `SelectListRow` — interface

`src/ui/SelectList.ts:18`

**Module note** — the header comment on `src/ui/SelectList.ts`, which this declaration heads:

A keyboard-navigable row list for the pause menu's master/detail tabs.

Four of the nine tabs are the same shape — a column of things on the left, the
selected one written out on the right (journal entries, index terms, held
items, save slots) — so the selection model, the ARIA wiring and the
scroll-into-view behaviour live here once.

Deliberately not the Phaser `./Menu`: that one draws `Text` game objects
inside the canvas and binds scene-level keys. This is DOM, so it can scroll,
wrap, take a mouse click and be read by a screen reader — which is the whole
reason the pause menu is a DOM overlay.

| Field | Type | Notes |
| --- | --- | --- |
| `label` | `string` | Left column text. |
| `note` *(opt)* | `string` | Right-aligned annotation (a count, a timestamp, a ✓). |
| `disabled` *(opt)* | `boolean` | Dimmed and skipped by keyboard navigation. |
| `onActivate` *(opt)* | `() => void` | Invoked on Enter or click. Rows without one are selection-only. |

<a id="interface-shadowcaster"></a>

#### `ShadowCaster` — interface

`src/ui/EntityShadows.ts:86`

Anything that casts one. Satisfied as-is by `Player`, `Enforcer`, `Drone` and `Orderly`,
all of which already expose public `x`/`y`.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `readonly x: number` |  |
| `y` | `readonly y: number` |  |
| `shadow` | `readonly shadow: ShadowShape` |  |

<a id="interface-sharedfieldview"></a>

#### `SharedFieldView` — interface

`src/ui/SharedFieldHud.ts:8`

| Field | Type | Notes |
| --- | --- | --- |
| `charge` | `number` |  |
| `active` | `number` |  |
| `ready` | `boolean` |  |

<a id="interface-tracestate"></a>

#### `TraceState` — interface

`src/ui/ekg.ts:195`

The sweep's ring buffer.

`samples[x]` is the amplitude drawn in column `x`, or `NaN` for a column inside the
erase gap — the widget breaks its polyline there rather than drawing a line across
the gap to whatever the last sweep left.

| Field | Type | Notes |
| --- | --- | --- |
| `samples` | `readonly samples: Float32Array` |  |
| `cursor` | `number` | Write head, in columns; fractional between frames. |
| `beatPhase` | `number` | Beats elapsed. Only the fraction matters to `pqrst`, which wraps it. |

<a id="interface-tribunalcallbacks"></a>

#### `TribunalCallbacks` — interface

`src/ui/TribunalScreen.ts:46`

| Field | Type | Notes |
| --- | --- | --- |
| `onContinue` | `() => void` | The player acknowledged the record — [Esc] or [Space]. |

<a id="interface-uipaneloptions"></a>

#### `UiPanelOptions` — interface

`src/ui/NineSlicePanel.ts:25`

A HUD panel background, drawn from art when there is art and from primitives
when there isn't.

Panels are the one piece of chrome that cannot simply be a bigger PNG: the
shared-field bar, the encounter band and the debug inspector are all different
widths, and several change width at runtime. Stretching one bitmap across them
would smear the border; drawing one bitmap per size means an artist redrawing a
border every time a label grows. Nine-slice is the standard answer — corners
fixed, edges stretched along one axis, middle stretched both ways — and Phaser
has had `add.nineslice` since 3.60.

The fallback matters as much as the art. Every widget that adopts this keeps
working with no PNG present, which is the state the repository is in today, and
keeps working with *some* panels drawn, which is the state it will be in during
an art pass. So this returns a `Rectangle` styled like the borders the HUD
already draws by hand, and swaps to the nine-slice the moment the texture
exists — no call site changes, nothing to remember.

| Field | Type | Notes |
| --- | --- | --- |
| `key` *(opt)* | `string` | Manifest key to draw from. Defaults to the generic `ui-panel`. |
| `depth` *(opt)* | `number` | Defaults to `UI_DEPTH.PANEL` — behind whatever the panel contains. |
| `fill` *(opt)* | `number` | Fill for the drawn fallback. Ignored when art is present. |
| `stroke` *(opt)* | `number` | Border for the drawn fallback. Ignored when art is present. |
| `alpha` *(opt)* | `number` | Fill opacity for the drawn fallback. |
| `frame` *(opt)* | `number` | Which chrome frame to draw: a lit screen (`SCREEN_ON`, the default) or a dark one (`SCREEN_OFF`). Only the alert-network readout has any use for the dark frame — it means "no data published yet". Everything else is a panel that simply exists, and wants the lit interior, which is `--c-bg-panel`. |

<a id="interface-uisheetspec"></a>

#### `UiSheetSpec` — interface

`src/ui/UiTextures.ts:62`

| Field | Type | Notes |
| --- | --- | --- |
| `margin` | `number` | Blank border around the whole grid, in pixels. |
| `spacing` | `number` | Blank gutter between adjacent frames, in pixels. |
| `count` | `number` | How many frames are actually drawn, counting across rows first. |

<a id="interface-uitexturespec"></a>

#### `UiTextureSpec` — interface

`src/ui/UiTextures.ts:26`

The HUD's optional artwork.

Everything the HUD draws today is `Graphics` and `Rectangle` primitives — there
is no atlas, no nine-slice and no panel art anywhere in the project. That is a
reasonable place to have started and a bad place to stay, because it means
hand-drawn chrome has nowhere to go: every widget would have to grow its own
loader, its own key and its own fallback.

So the seam lives here instead. A texture listed below is *optional*: it is
probed for before boot, queued only if it is actually there, and each widget
asks `hasUiTexture` before using it and otherwise draws exactly what it
draws now. The game runs unchanged with none of these files present, which is
the state the repository is in — and it keeps running with three of the five
present, which is the state it will be in halfway through an art pass.

`size` is the art's authored dimension and `display` the size it appears at.
`uiScale.test.ts` asserts every entry is pixel-perfect, so an entry added at the
wrong resolution fails the build instead of shipping a resampled panel.

| Field | Type | Notes |
| --- | --- | --- |
| `key` | `string` | Phaser texture key, and the name widgets check for. |
| `path` | `string` | Path under `public/`. |
| `size` | `number` | The art's authored pixel dimension (square). For a `UiTextureSpec.sheet`, this is one *frame* rather than the whole image — which is what the scale rule cares about, and what keeps the file's outer dimensions (96x48 for two 48s side by side) from having to be square. |
| `display` *(opt)* | `number` | The dimension it is drawn at on screen. Defaults to `UiTextureSpec.size`. |
| `slice` *(opt)* | `number` | Nine-slice inset, for panel art: how many pixels in from each edge are corner rather than stretchable middle. Only meaningful for panels. |
| `sheet` *(opt)* | `UiSheetSpec` | Present when the file is a grid of frames rather than one image. Aseprite-family exporters often pad the sheet, so the offsets have to be declared or every frame comes out shifted by a pixel — though not always: the sheets under `assets/ui/panel/` are generated by `tools/panel/build_panel.py` and packed edge-to-edge with no padding, so `margin`/`spacing` genuinely vary per file and have to be read off each one rather than assumed. `UiSheetSpec.count` exists because the drawn frames rarely fill the grid: the indicator sheet gives each cluster a whole 16-slot row so its counts stay contiguous, and only 11 of those slots are drawn — the count is the grid, and the gaps are simply never addressed. |

### UI — Type aliases

<a id="type-badgestate"></a>

#### `BadgeState` — type

`src/ui/NetworkPanel.ts:103`

What the badge is saying.

`disconnected` is not an alert phase — it is the readout having no data yet,
which is a real state because `UIScene` only calls `AlertNetworkHud.update()`
once the scene has published a snapshot. `blink` is the dark half of the
alert pulse, and is pixel-identical to `disconnected` by design; the art
names them separately because they mean different things.

```ts
type BadgeState = "disconnected" | "nominal" | "suspicious" | "alert" | "blink";
```

<a id="type-countkind"></a>

#### `CountKind` — type

`src/ui/NetworkPanel.ts:29`

Which count cluster — the keys the generator writes, so they cannot drift.

```ts
type CountKind = "UNIT_indicator_LEDs" | "SPOT_indicator_LEDs" | "SUSP_indicator_LEDs";
```

<a id="type-direction"></a>

#### `Direction` — type

`src/ui/radarDirections.ts:21`

```ts
type Direction = (typeof DIRECTIONS)[number];
```

<a id="type-rgb"></a>

#### `RGB` — type *(module-private)*

`src/ui/QualiaLockView.ts:54`

```ts
type RGB = [number, number, number];
```

<a id="type-tickstate"></a>

#### `TickState` — type

`src/ui/radarDirections.ts:22`

```ts
type TickState = keyof typeof FRAMES.states;
```

---

## Testing

Test doubles shared across the suite.

### Testing — Classes

<a id="class-memstorage"></a>

#### `MemStorage` — class

`src/testing/memStorage.ts:8`

An in-memory `localStorage` stand-in for the vitest (node) suite.

Test-only scaffolding — nothing in `src/` imports it, so it never reaches a
bundle. It lives here rather than duplicated inside each spec because three
separate persistence modules (saves, settings, the debug flag) now need one.

| Member | Signature | Notes |
| --- | --- | --- |
| `length` | `get length(): number` |  |
| `clear` | `clear(): void` |  |
| `getItem` | `getItem(k: string): string \| null` |  |
| `key` | `key(i: number): string \| null` |  |
| `removeItem` | `removeItem(k: string): void` |  |
| `setItem` | `setItem(k: string, v: string): void` |  |

*Plus 1 private member.*

---

## Entry points

Top-level bootstrap modules.

### Entry points — Classes

<a id="class-bootscene"></a>

#### `BootScene` — class *(module-private)*

`src/main.ts:36` · `extends Phaser.Scene`

Boot scene: loads the edplay map JSON and its spritesheets, parses the map
into the normalized model, stashes it in the registry, then hands off to
GameScene.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `preload` | `preload(): void` |  |
| `create` | `create(): void` |  |

---

## Index

| Name | Kind | Declared in |
| --- | --- | --- |
| [AccessEnd](#interface-accessend) | interface | `src/systems/TransitionGraph.ts:66` |
| [ActiveItemState](#class-activeitemstate) | class | `src/systems/ActiveItems.ts:33` |
| [ActiveItemsView](#interface-activeitemsview) | interface | `src/systems/ActiveItems.ts:152` |
| [Aimer](#interface-aimer) | interface | `src/systems/Surrender.ts:39` |
| [AlertNetworkHud](#class-alertnetworkhud) | class | `src/ui/AlertNetworkHud.ts:65` |
| [AlertNetworkSnapshot](#interface-alertnetworksnapshot) | interface | `src/systems/AlertNetwork.ts:11` |
| [AlertPhase](#type-alertphase) | type | `src/systems/AlertState.ts:13` |
| [AlertState](#class-alertstate) | class | `src/systems/AlertState.ts:21` |
| [Anomalies](#class-anomalies) | class | `src/scenes/game/Anomalies.ts:44` |
| [AnomalyWorld](#interface-anomalyworld) | interface | `src/scenes/game/Anomalies.ts:34` |
| [AppliedCorrections](#type-appliedcorrections) | type | `src/systems/Compliance.ts:64` |
| [AudioDirector](#class-audiodirector) | class | `src/systems/AudioDirector.ts:46` |
| [BadgeState](#type-badgestate) | type | `src/ui/NetworkPanel.ts:103` |
| [BakedPlane](#interface-bakedplane) | interface | `src/map/TileBake.ts:176` |
| [BarkDecision](#interface-barkdecision) | interface | `src/systems/SilicateBarks.ts:100` |
| [BinaryHeap](#class-binaryheap) | class | `src/systems/Pathfinder.ts:286` |
| [BioMonitor](#class-biomonitor) | class | `src/ui/BioMonitor.ts:76` |
| [BlockedAt](#type-blockedat) | type | `src/map/TileBake.ts:58` |
| [BodyExtent](#interface-bodyextent) | interface | `src/systems/WallPress.ts:24` |
| [BootScene](#class-bootscene) | class | `src/main.ts:36` |
| [BossCore](#class-bosscore) | class | `src/entities/BossCore.ts:64` |
| [BossCoreHud](#class-bosscorehud) | class | `src/ui/BossCoreHud.ts:45` |
| [Breaker](#class-breaker) | class | `src/entities/Breaker.ts:41` |
| [BreakerStats](#interface-breakerstats) | interface | `src/systems/EntityStats.ts:392` |
| [BuiltLevel](#interface-builtlevel) | interface | `src/scenes/game/LevelBuilder.ts:49` |
| [Cardinal4](#type-cardinal4) | type | `src/entities/directions.ts:69` |
| [CARDINALS_4](#const-cardinals-4) | const | `src/entities/directions.ts:67` |
| [CastingLight](#undefined) | interface | `src/render/lightSampling.ts:15` |
| [CastRole](#interface-castrole) | interface | `src/entities/CastArt.ts:65` |
| [Chest](#class-chest) | class | `src/entities/Chest.ts:16` |
| [CHEST_DEFAULTS](#const-chest-defaults) | const | `src/systems/EntityStats.ts:440` |
| [ChestStats](#interface-cheststats) | interface | `src/systems/EntityStats.ts:431` |
| [CodecContext](#interface-codeccontext) | interface | `src/ui/Codec.ts:28` |
| [CodecData](#interface-codecdata) | interface | `src/scenes/CodecScene.ts:15` |
| [CodecScene](#class-codecscene) | class | `src/scenes/CodecScene.ts:37` |
| [CollisionGrid](#class-collisiongrid) | class | `src/systems/CollisionGrid.ts:80` |
| [ComplianceBand](#type-complianceband) | type | `src/systems/Vent4Core.ts:25` |
| [ComplianceData](#interface-compliancedata) | interface | `src/scenes/ComplianceScene.ts:8` |
| [ComplianceResult](#interface-complianceresult) | interface | `src/systems/Compliance.ts:67` |
| [ComplianceScene](#class-compliancescene) | class | `src/scenes/ComplianceScene.ts:23` |
| [ComplianceView](#class-complianceview) | class | `src/ui/ComplianceView.ts:32` |
| [ComplianceViewCallbacks](#interface-complianceviewcallbacks) | interface | `src/ui/ComplianceView.ts:25` |
| [ComponentData](#interface-componentdata) | interface | `src/map/types.ts:224` |
| [ConductBreach](#type-conductbreach) | type | `src/systems/Conduct.ts:26` |
| [ConductInput](#interface-conductinput) | interface | `src/systems/Conduct.ts:46` |
| [ConductMetrics](#interface-conductmetrics) | interface | `src/systems/Conduct.ts:95` |
| [ConductState](#class-conductstate) | class | `src/systems/Conduct.ts:112` |
| [ConductView](#interface-conductview) | interface | `src/systems/Conduct.ts:246` |
| [ConeStyle](#interface-conestyle) | interface | `src/ui/VisionCone.ts:29` |
| [CONSUMABLE_ORDER](#const-consumable-order) | const | `src/systems/EntityStats.ts:846` |
| [ConsumableSlot](#interface-consumableslot) | interface | `src/systems/EntityStats.ts:885` |
| [ControlBinding](#interface-controlbinding) | interface | `src/ui/Controls.ts:20` |
| [Correction](#interface-correction) | interface | `src/systems/Compliance.ts:35` |
| [CountKind](#type-countkind) | type | `src/ui/NetworkPanel.ts:29` |
| [Cover](#class-cover) | class | `src/entities/Cover.ts:18` |
| [CoverBoards](#interface-coverboards) | interface | `src/systems/CoverPoints.ts:15` |
| [CoverBody](#interface-coverbody) | interface | `src/map/TileBake.ts:430` |
| [DebugHost](#interface-debughost) | interface | `src/scenes/game/DebugOverlay.ts:67` |
| [DebugHud](#class-debughud) | class | `src/ui/DebugHud.ts:65` |
| [DebugOverlay](#class-debugoverlay) | class | `src/scenes/game/DebugOverlay.ts:94` |
| [DebugSnapshot](#interface-debugsnapshot) | interface | `src/ui/DebugHud.ts:26` |
| [DebugUnitView](#interface-debugunitview) | interface | `src/ui/DebugHud.ts:17` |
| [DebugWorld](#interface-debugworld) | interface | `src/scenes/game/DebugOverlay.ts:43` |
| [DeployableKind](#type-deployablekind) | type | `src/systems/Deployables.ts:22` |
| [DeployedItem](#class-deployeditem) | class | `src/entities/DeployedItem.ts:35` |
| [DeployedLure](#interface-deployedlure) | interface | `src/systems/Deployables.ts:32` |
| [DetectionSystem](#class-detectionsystem) | class | `src/systems/DetectionSystem.ts:45` |
| [DetectionWorld](#interface-detectionworld) | interface | `src/systems/Sensing.ts:76` |
| [Dir8](#type-dir8) | type | `src/entities/directions.ts:31` |
| [Direction](#type-direction) | type | `src/ui/radarDirections.ts:21` |
| [DIRECTIONS](#const-directions) | const | `src/ui/radarDirections.ts:16` |
| [DIRS_8](#const-dirs-8) | const | `src/entities/directions.ts:20` |
| [DisplayFootprint](#type-displayfootprint) | type | `src/entities/EntitySprites.ts:113` |
| [Door](#class-door) | class | `src/entities/Door.ts:163` |
| [DOOR_DEFAULTS](#const-door-defaults) | const | `src/systems/EntityStats.ts:294` |
| [DoorAccess](#interface-dooraccess) | interface | `src/entities/doorWork.ts:47` |
| [DoorSeating](#interface-doorseating) | interface | `src/entities/doorGeometry.ts:37` |
| [DoorStats](#interface-doorstats) | interface | `src/systems/EntityStats.ts:285` |
| [DoorWalker](#interface-doorwalker) | interface | `src/entities/doorWork.ts:30` |
| [Drone](#class-drone) | class | `src/entities/Drone.ts:14` |
| [EdAnimation](#interface-edanimation) | interface | `src/map/types.ts:48` |
| [EdBoard](#interface-edboard) | interface | `src/map/types.ts:138` |
| [EdColliderPadding](#interface-edcolliderpadding) | interface | `src/map/types.ts:118` |
| [EdDataComponent](#interface-eddatacomponent) | interface | `src/map/types.ts:58` |
| [EdDataStructure](#interface-eddatastructure) | interface | `src/map/types.ts:174` |
| [EdDataTypes](#interface-eddatatypes) | interface | `src/map/types.ts:186` |
| [EdEnumDef](#interface-edenumdef) | interface | `src/map/types.ts:180` |
| [EdField](#interface-edfield) | interface | `src/map/types.ts:167` |
| [EdKeyFrame](#interface-edkeyframe) | interface | `src/map/types.ts:27` |
| [EdLevel](#interface-edlevel) | interface | `src/map/types.ts:161` |
| [EdPlayFile](#interface-edplayfile) | interface | `src/map/types.ts:191` |
| [EdplayLoader](#class-edplayloader) | class | `src/map/EdplayLoader.ts:110` |
| [EdSpriteRect](#interface-edspriterect) | interface | `src/map/types.ts:9` |
| [EdSpriteSheet](#interface-edspritesheet) | interface | `src/map/types.ts:18` |
| [EdTile](#interface-edtile) | interface | `src/map/types.ts:125` |
| [EdTileDef](#interface-edtiledef) | interface | `src/map/types.ts:63` |
| [EdVariable](#interface-edvariable) | interface | `src/map/types.ts:53` |
| [EncounterBand](#class-encounterband) | class | `src/ui/EncounterBand.ts:67` |
| [EncounterBandFrame](#interface-encounterbandframe) | interface | `src/ui/EncounterBand.ts:30` |
| [EncounterBandStyle](#interface-encounterbandstyle) | interface | `src/ui/EncounterBand.ts:18` |
| [EncounterInteractResult](#interface-encounterinteractresult) | interface | `src/entities/EncounterTypes.ts:11` |
| [Encounters](#class-encounters) | class | `src/scenes/game/Encounters.ts:70` |
| [EncountersCallbacks](#interface-encounterscallbacks) | interface | `src/scenes/game/Encounters.ts:50` |
| [Enforcer](#class-enforcer) | class | `src/entities/Enforcer.ts:208` |
| [EnforcerContext](#interface-enforcercontext) | interface | `src/entities/Enforcer.ts:91` |
| [EnforcerFireResult](#interface-enforcerfireresult) | interface | `src/entities/Enforcer.ts:40` |
| [EnforcerStats](#interface-enforcerstats) | interface | `src/systems/EntityStats.ts:34` |
| [ENTITY_SPRITES](#const-entity-sprites) | const | `src/entities/EntitySprites.ts:138` |
| [EntityIndex](#interface-entityindex) | interface | `src/map/EntityIndex.ts:71` |
| [EntityShadows](#class-entityshadows) | class | `src/ui/EntityShadows.ts:92` |
| [EntitySpriteId](#type-entityspriteid) | type | `src/entities/EntitySprites.ts:37` |
| [EntitySpriteSpec](#interface-entityspritespec) | interface | `src/entities/EntitySprites.ts:71` |
| [ExploredMap](#class-exploredmap) | class | `src/systems/Explored.ts:16` |
| [ExploredState](#type-exploredstate) | type | `src/systems/Explored.ts:74` |
| [ExploredTracker](#class-exploredtracker) | class | `src/scenes/game/ExploredTracker.ts:38` |
| [ExploredWorld](#interface-exploredworld) | interface | `src/scenes/game/ExploredTracker.ts:26` |
| [Eye](#interface-eye) | interface | `src/systems/Sensing.ts:20` |
| [Faded](#interface-faded) | interface | `src/ui/PlaneOverlay.ts:28` |
| [FlashlightBeam](#interface-flashlightbeam) | interface | `src/ui/Lighting.ts:107` |
| [FollowResult](#type-followresult) | type | `src/entities/Enforcer.ts:194` |
| [GameLayer](#interface-gamelayer) | interface | `src/map/types.ts:279` |
| [GameLevel](#interface-gamelevel) | interface | `src/map/types.ts:286` |
| [GameMap](#interface-gamemap) | interface | `src/map/types.ts:301` |
| [GameMode](#type-gamemode) | type | `src/systems/GameState.ts:20` |
| [GameOverScene](#class-gameoverscene) | class | `src/scenes/GameOverScene.ts:13` |
| [GameScene](#class-gamescene) | class | `src/scenes/GameScene.ts:189` |
| [GameSceneData](#interface-gamescenedata) | interface | `src/scenes/GameScene.ts:134` |
| [GameTile](#interface-gametile) | interface | `src/map/types.ts:230` |
| [GENERATED_LEVELS](#const-generated-levels) | const | `src/map/types.ts:332` |
| [GlassStats](#interface-glassstats) | interface | `src/systems/EntityStats.ts:315` |
| [GuardAnomaly](#interface-guardanomaly) | interface | `src/entities/Enforcer.ts:79` |
| [GuardKind](#type-guardkind) | type | `src/map/EntityIndex.ts:46` |
| [GuardRoute](#interface-guardroute) | interface | `src/map/EntityIndex.ts:50` |
| [GuardSkin](#interface-guardskin) | interface | `src/entities/GuardSkin.ts:14` |
| [GuardSkinSpec](#interface-guardskinspec) | interface | `src/entities/GuardSkin.ts:71` |
| [GuardState](#type-guardstate) | type | `src/entities/Enforcer.ts:37` |
| [HackWorld](#interface-hackworld) | interface | `src/scenes/game/TerminalHacks.ts:38` |
| [HoldFixture](#class-holdfixture) | class | `src/entities/HoldFixture.ts:24` |
| [HoldTarget](#class-holdtarget) | class | `src/entities/HoldTarget.ts:41` |
| [Hud](#class-hud) | class | `src/ui/Hud.ts:37` |
| [InputState](#interface-inputstate) | interface | `src/entities/Player.ts:512` |
| [InteractPrompt](#class-interactprompt) | class | `src/scenes/game/InteractPrompt.ts:177` |
| [InventoryHud](#class-inventoryhud) | class | `src/ui/InventoryHud.ts:23` |
| [Investigation](#interface-investigation) | interface | `src/entities/Enforcer.ts:159` |
| [ItemActions](#class-itemactions) | class | `src/scenes/game/ItemActions.ts:89` |
| [ItemInfo](#interface-iteminfo) | interface | `src/systems/ItemCatalog.ts:48` |
| [ItemWorld](#interface-itemworld) | interface | `src/scenes/game/ItemActions.ts:63` |
| [JournalEntry](#interface-journalentry) | interface | `src/systems/Journal.ts:43` |
| [JournalEntryId](#type-journalentryid) | type | `src/systems/Journal.ts:23` |
| [JournalState](#interface-journalstate) | interface | `src/systems/Journal.ts:360` |
| [Kind](#type-kind) | type | `src/entities/Vent4Boss.ts:358` |
| [KnownLevel](#type-knownlevel) | type | `src/map/types.ts:339` |
| [Laser](#class-laser) | class | `src/entities/Laser.ts:58` |
| [LaserKind](#type-laserkind) | type | `src/entities/Laser.ts:40` |
| [LevelBodyRects](#interface-levelbodyrects) | interface | `src/map/TileBake.ts:445` |
| [LexiconCategory](#type-lexiconcategory) | type | `src/systems/Lexicon.ts:19` |
| [LexiconContext](#interface-lexiconcontext) | interface | `src/systems/Lexicon.ts:257` |
| [LexiconEntry](#interface-lexiconentry) | interface | `src/systems/Lexicon.ts:30` |
| [Light](#interface-light) | interface | `src/ui/Lighting.ts:79` |
| [Lighting](#class-lighting) | class | `src/ui/Lighting.ts:141` |
| [LightSample](#undefined) | interface | `src/render/lightSampling.ts:32` |
| [LightSource](#interface-lightsource) | interface | `src/systems/DetectionSystem.ts:4` |
| [LightStats](#interface-lightstats) | interface | `src/systems/EntityStats.ts:82` |
| [Locker](#class-locker) | class | `src/entities/Locker.ts:37` |
| [LockerResult](#type-lockerresult) | type | `src/entities/Locker.ts:117` |
| [LogToken](#interface-logtoken) | interface | `src/systems/Compliance.ts:20` |
| [LureSpec](#interface-lurespec) | interface | `src/systems/Deployables.ts:49` |
| [LureWorld](#interface-lureworld) | interface | `src/systems/Deployables.ts:70` |
| [MANUAL_SLOTS](#const-manual-slots) | const | `src/systems/SaveGame.ts:29` |
| [MapPlan](#interface-mapplan) | interface | `src/map/MapPlan.ts:19` |
| [MapSnapshot](#interface-mapsnapshot) | interface | `src/systems/PauseState.ts:36` |
| [MemoryLayer](#class-memorylayer) | class | `src/ui/MemoryLayer.ts:69` |
| [MemStorage](#class-memstorage) | class | `src/testing/memStorage.ts:8` |
| [Menu](#class-menu) | class | `src/ui/Menu.ts:21` |
| [MenuItem](#interface-menuitem) | interface | `src/ui/Menu.ts:9` |
| [MissingProto](#class-missingproto) | class | `src/map/generate.ts:32` |
| [MissionFeatures](#interface-missionfeatures) | interface | `src/systems/Objectives.ts:70` |
| [MoveResult](#interface-moveresult) | interface | `src/systems/GridMotion.ts:26` |
| [MusicMood](#type-musicmood) | type | `src/systems/AudioDirector.ts:24` |
| [NetworkIndicatorFrames](#interface-networkindicatorframes) | interface | `src/ui/NetworkPanel.ts:158` |
| [NetworkUnit](#interface-networkunit) | interface | `src/systems/AlertNetwork.ts:5` |
| [NoiseEvents](#class-noiseevents) | class | `src/scenes/game/NoiseEvents.ts:54` |
| [NoiseLog](#class-noiselog) | class | `src/systems/NoiseLog.ts:40` |
| [NoiseSectors](#class-noisesectors) | class | `src/systems/Radar.ts:33` |
| [NoiseSpamTracker](#class-noisespamtracker) | class | `src/systems/AlertNetwork.ts:78` |
| [NoiseWorld](#interface-noiseworld) | interface | `src/scenes/game/NoiseEvents.ts:36` |
| [ObjectiveHud](#class-objectivehud) | class | `src/ui/ObjectiveHud.ts:27` |
| [ObjectiveLine](#interface-objectiveline) | interface | `src/systems/Objectives.ts:166` |
| [ObjectiveState](#interface-objectivestate) | interface | `src/systems/Objectives.ts:20` |
| [OpenablePredicate](#type-openablepredicate) | type | `src/systems/GridMotion.ts:41` |
| [Orderly](#class-orderly) | class | `src/entities/Orderly.ts:150` |
| [OrderlyAnimName](#type-orderlyanimname) | type | `src/entities/OrderlyAnimations.ts:11` |
| [OrderlyContext](#interface-orderlycontext) | interface | `src/entities/Orderly.ts:32` |
| [OrderlyRoute](#interface-orderlyroute) | interface | `src/map/EntityIndex.ts:63` |
| [OrderlyState](#type-orderlystate) | type | `src/entities/Orderly.ts:95` |
| [OverlayConfig](#interface-overlayconfig) | interface | `src/scenes/game/OverlayGate.ts:21` |
| [OverlayGate](#class-overlaygate) | class | `src/scenes/game/OverlayGate.ts:32` |
| [OverlayId](#type-overlayid) | type | `src/scenes/game/OverlayGate.ts:19` |
| [Palette](#interface-palette) | interface | `src/ui/MiniMapCanvas.ts:18` |
| [Pane](#interface-pane) | interface | `src/ui/PauseMenuView.ts:69` |
| [ParsedMap](#interface-parsedmap) | interface | `src/map/EdplayLoader.ts:261` |
| [PathNode](#interface-pathnode) | interface | `src/systems/Pathfinder.ts:22` |
| [PathOptions](#interface-pathoptions) | interface | `src/systems/Pathfinder.ts:27` |
| [PatrolRoute](#type-patrolroute) | type | `src/systems/PatrolRoute.ts:26` |
| [PauseCallbacks](#interface-pausecallbacks) | interface | `src/ui/PauseMenuView.ts:60` |
| [PauseMenuView](#class-pausemenuview) | class | `src/ui/PauseMenuView.ts:99` |
| [PauseRequest](#type-pauserequest) | type | `src/systems/PauseState.ts:29` |
| [PauseScene](#class-pausescene) | class | `src/scenes/PauseScene.ts:32` |
| [PauseSnapshot](#interface-pausesnapshot) | interface | `src/ui/PauseMenuView.ts:39` |
| [PersonAnomalyKind](#type-personanomalykind) | type | `src/entities/Enforcer.ts:62` |
| [PlaneLink](#interface-planelink) | interface | `src/systems/PlaneLinks.ts:50` |
| [PlaneLinkKind](#type-planelinkkind) | type | `src/systems/PlaneLinks.ts:47` |
| [PlaneOverlay](#class-planeoverlay) | class | `src/ui/PlaneOverlay.ts:37` |
| [PlaneTraversal](#class-planetraversal) | class | `src/scenes/game/PlaneTraversal.ts:52` |
| [Player](#class-player) | class | `src/entities/Player.ts:45` |
| [PlayerAnimName](#type-playeranimname) | type | `src/entities/PlayerAnimations.ts:17` |
| [PlayerParams](#interface-playerparams) | interface | `src/systems/QualiaLock.ts:34` |
| [PlayerStats](#interface-playerstats) | interface | `src/systems/EntityStats.ts:463` |
| [Pose](#interface-pose) | interface | `src/entities/CastArt.ts:55` |
| [PowerControl](#class-powercontrol) | class | `src/scenes/game/PowerControl.ts:58` |
| [PowerGridState](#interface-powergridstate) | interface | `src/systems/PowerGrid.ts:27` |
| [PowerWorld](#interface-powerworld) | interface | `src/scenes/game/PowerControl.ts:46` |
| [PressSide](#interface-pressside) | interface | `src/systems/WallPress.ts:50` |
| [PressState](#interface-pressstate) | interface | `src/systems/WallPress.ts:65` |
| [PressSurface](#interface-presssurface) | interface | `src/systems/WallPress.ts:30` |
| [PressureSubStation](#class-pressuresubstation) | class | `src/entities/PressureSubStation.ts:43` |
| [PromptAnchor](#interface-promptanchor) | interface | `src/scenes/game/InteractPrompt.ts:61` |
| [PromptCandidates](#interface-promptcandidates) | interface | `src/scenes/game/InteractPrompt.ts:32` |
| [PuzzleState](#interface-puzzlestate) | interface | `src/systems/Compliance.ts:50` |
| [QualiaLockConfig](#interface-qualialockconfig) | interface | `src/systems/QualiaLock.ts:46` |
| [QualiaLockData](#interface-qualialockdata) | interface | `src/scenes/QualiaLockScene.ts:8` |
| [QualiaLockScene](#class-qualialockscene) | class | `src/scenes/QualiaLockScene.ts:25` |
| [QualiaLockState](#interface-qualialockstate) | interface | `src/systems/QualiaLock.ts:73` |
| [QualiaLockView](#class-qualialockview) | class | `src/ui/QualiaLockView.ts:75` |
| [QualiaLockViewCallbacks](#interface-qualialockviewcallbacks) | interface | `src/ui/QualiaLockView.ts:33` |
| [QualiaRound](#interface-qualiaround) | interface | `src/systems/QualiaLock.ts:251` |
| [QualiaStatus](#type-qualiastatus) | type | `src/systems/QualiaLock.ts:40` |
| [RackCandidate](#interface-rackcandidate) | interface | `src/systems/QualiaLock.ts:273` |
| [Radar](#class-radar) | class | `src/ui/Radar.ts:47` |
| [RadarBlip](#interface-radarblip) | interface | `src/systems/Radar.ts:71` |
| [RadarSnapshot](#interface-radarsnapshot) | interface | `src/systems/Radar.ts:96` |
| [RadarUnit](#interface-radarunit) | interface | `src/systems/Radar.ts:80` |
| [Range](#type-range) | type | `src/systems/QualiaLock.ts:43` |
| [RayDirections](#interface-raydirections) | interface | `src/systems/Visibility.ts:71` |
| [Rect](#interface-rect) | interface | `src/map/footprint.ts:70` |
| [RelayCore](#class-relaycore) | class | `src/systems/RelayCore.ts:75` |
| [RelayHud](#class-relayhud) | class | `src/ui/RelayHud.ts:24` |
| [RelayInteractResult](#type-relayinteractresult) | type | `src/entities/RoofRelay.ts:73` |
| [RelayMsg](#interface-relaymsg) | interface | `src/systems/RelayCore.ts:46` |
| [RelaySnapshot](#interface-relaysnapshot) | interface | `src/systems/RelayCore.ts:40` |
| [RelayState](#enum-relaystate) | enum | `src/systems/RelayCore.ts:18` |
| [RelayStats](#interface-relaystats) | interface | `src/systems/EntityStats.ts:1109` |
| [RelayTickResult](#interface-relaytickresult) | interface | `src/entities/RoofRelay.ts:61` |
| [RelayTransition](#interface-relaytransition) | interface | `src/systems/RelayCore.ts:35` |
| [RelayView](#interface-relayview) | interface | `src/systems/RelayCore.ts:55` |
| [REQUIRED_FONTS](#const-required-fonts) | const | `src/ui/fonts.ts:38` |
| [RGB](#type-rgb) | type | `src/ui/QualiaLockView.ts:54` |
| [RoofRelay](#class-roofrelay) | class | `src/entities/RoofRelay.ts:75` |
| [RUN_KEYS](#const-run-keys) | const | `src/systems/GameState.ts:42` |
| [SaveData](#interface-savedata) | interface | `src/systems/SaveGame.ts:34` |
| [SavePayload](#type-savepayload) | type | `src/systems/SaveGame.ts:53` |
| [SecurityGuard](#class-securityguard) | class | `src/entities/SecurityGuard.ts:23` |
| [SelectList](#class-selectlist) | class | `src/ui/SelectList.ts:29` |
| [SelectListRow](#interface-selectlistrow) | interface | `src/ui/SelectList.ts:18` |
| [SensingContext](#class-sensingcontext) | class | `src/scenes/game/SensingContext.ts:48` |
| [SensingDeps](#interface-sensingdeps) | interface | `src/scenes/game/SensingContext.ts:25` |
| [SensingWorld](#interface-sensingworld) | interface | `src/systems/Sensing.ts:60` |
| [Sensor](#class-sensor) | class | `src/entities/Sensor.ts:37` |
| [SensorStats](#interface-sensorstats) | interface | `src/systems/EntityStats.ts:353` |
| [SetPieceEvents](#class-setpieceevents) | class | `src/scenes/game/SetPieceEvents.ts:67` |
| [SetPieceWorld](#interface-setpieceworld) | interface | `src/scenes/game/SetPieceEvents.ts:50` |
| [Settings](#interface-settings) | interface | `src/systems/Settings.ts:13` |
| [ShadowCaster](#interface-shadowcaster) | interface | `src/ui/EntityShadows.ts:86` |
| [ShadowShape](#undefined) | interface | `src/render/shadowShape.ts:13` |
| [SharedField](#class-sharedfield) | class | `src/systems/SharedField.ts:22` |
| [SharedFieldHud](#class-sharedfieldhud) | class | `src/ui/SharedFieldHud.ts:19` |
| [SharedFieldView](#interface-sharedfieldview) | interface | `src/ui/SharedFieldHud.ts:8` |
| [Silhouette](#interface-silhouette) | interface | `src/entities/Silhouette.ts:27` |
| [SilicateVoice](#type-silicatevoice) | type | `src/systems/SilicateBarks.ts:32` |
| [SlotId](#type-slotid) | type | `src/systems/SaveGame.ts:26` |
| [SmacCore](#class-smaccore) | class | `src/systems/SmacCore.ts:118` |
| [SmacCorrection](#interface-smaccorrection) | interface | `src/systems/SmacCore.ts:78` |
| [SmacInteractResult](#type-smacinteractresult) | type | `src/entities/BossCore.ts:62` |
| [SmacMsg](#interface-smacmsg) | interface | `src/systems/SmacCore.ts:72` |
| [SmacSnapshot](#interface-smacsnapshot) | interface | `src/systems/SmacCore.ts:63` |
| [SmacState](#enum-smacstate) | enum | `src/systems/SmacCore.ts:38` |
| [SmacStats](#interface-smacstats) | interface | `src/systems/EntityStats.ts:1037` |
| [SmacTickResult](#interface-smactickresult) | interface | `src/entities/BossCore.ts:56` |
| [SmacTransition](#interface-smactransition) | interface | `src/systems/SmacCore.ts:57` |
| [SmacView](#interface-smacview) | interface | `src/systems/SmacCore.ts:94` |
| [SpriteAtlas](#class-spriteatlas) | class | `src/map/SpriteAtlas.ts:12` |
| [SpriteEntry](#interface-spriteentry) | interface | `src/entities/EntitySprites.ts:54` |
| [SpriteFrame](#interface-spriteframe) | interface | `src/map/types.ts:212` |
| [Stance](#type-stance) | type | `src/entities/Player.ts:43` |
| [StashedBody](#interface-stashedbody) | interface | `src/entities/Locker.ts:127` |
| [SteamJet](#interface-steamjet) | interface | `src/entities/Vent4Boss.ts:80` |
| [SurfaceColliders](#interface-surfacecolliders) | interface | `src/scenes/game/PlaneTraversal.ts:31` |
| [Surrenderable](#interface-surrenderable) | interface | `src/systems/Surrender.ts:53` |
| [SurrenderAim](#class-surrenderaim) | class | `src/systems/Surrender.ts:187` |
| [SurrenderResult](#interface-surrenderresult) | interface | `src/systems/Surrender.ts:61` |
| [SurrenderWorld](#interface-surrenderworld) | interface | `src/systems/Surrender.ts:33` |
| [Target](#type-target) | type | `src/scenes/game/ItemActions.ts:349` |
| [Terminal](#class-terminal) | class | `src/entities/Terminal.ts:38` |
| [TERMINAL_DEFAULTS](#const-terminal-defaults) | const | `src/systems/EntityStats.ts:341` |
| [TerminalHacks](#class-terminalhacks) | class | `src/scenes/game/TerminalHacks.ts:52` |
| [TerminalStats](#interface-terminalstats) | interface | `src/systems/EntityStats.ts:332` |
| [TickState](#type-tickstate) | type | `src/ui/radarDirections.ts:22` |
| [TilePos](#interface-tilepos) | interface | `src/map/generate.ts:118` |
| [TileRect](#interface-tilerect) | interface | `src/map/TileBake.ts:424` |
| [TileStamper](#class-tilestamper) | class | `src/map/TileBake.ts:245` |
| [TitleScene](#class-titlescene) | class | `src/scenes/TitleScene.ts:13` |
| [TraceState](#interface-tracestate) | interface | `src/ui/ekg.ts:195` |
| [Transition](#interface-transition) | interface | `src/map/types.ts:458` |
| [TransitionClass](#type-transitionclass) | type | `src/systems/TransitionGraph.ts:63` |
| [TransitionGraph](#class-transitiongraph) | class | `src/systems/TransitionGraph.ts:147` |
| [TransitionKind](#type-transitionkind) | type | `src/map/types.ts:447` |
| [TraversalWorld](#interface-traversalworld) | interface | `src/scenes/game/PlaneTraversal.ts:39` |
| [TribunalCallbacks](#interface-tribunalcallbacks) | interface | `src/ui/TribunalScreen.ts:46` |
| [TribunalScene](#class-tribunalscene) | class | `src/scenes/TribunalScene.ts:19` |
| [TribunalScreen](#class-tribunalscreen) | class | `src/ui/TribunalScreen.ts:51` |
| [UI](#const-ui) | const | `src/ui/hudTheme.ts:34` |
| [UI_DEPTH](#const-ui-depth) | const | `src/ui/hudTheme.ts:134` |
| [UI_TEXT](#const-ui-text) | const | `src/ui/hudTheme.ts:113` |
| [UI_TEXTURES](#const-ui-textures) | const | `src/ui/UiTextures.ts:71` |
| [UiPanelOptions](#interface-uipaneloptions) | interface | `src/ui/NineSlicePanel.ts:25` |
| [UIScene](#class-uiscene) | class | `src/scenes/UIScene.ts:34` |
| [UiSheetSpec](#interface-uisheetspec) | interface | `src/ui/UiTextures.ts:62` |
| [UiTextureSpec](#interface-uitexturespec) | interface | `src/ui/UiTextures.ts:26` |
| [VaultAndPress](#class-vaultandpress) | class | `src/scenes/game/VaultAndPress.ts:96` |
| [VaultLayout](#interface-vaultlayout) | interface | `src/map/AlignmentVault.ts:81` |
| [VaultQuery](#interface-vaultquery) | interface | `src/scenes/game/VaultAndPress.ts:31` |
| [VaultWorld](#interface-vaultworld) | interface | `src/scenes/game/VaultAndPress.ts:87` |
| [Vec2](#interface-vec2) | interface | `src/systems/Vent4PhysicsSystem.ts:15` |
| [Vent4Boss](#class-vent4boss) | class | `src/entities/Vent4Boss.ts:100` |
| [Vent4Core](#class-vent4core) | class | `src/systems/Vent4Core.ts:67` |
| [Vent4Forces](#interface-vent4forces) | interface | `src/systems/Vent4PhysicsSystem.ts:31` |
| [Vent4Hud](#class-vent4hud) | class | `src/ui/Vent4Hud.ts:22` |
| [Vent4InteractResult](#type-vent4interactresult) | type | `src/entities/Vent4Boss.ts:78` |
| [Vent4Layout](#interface-vent4layout) | interface | `src/systems/Vent4PhysicsSystem.ts:20` |
| [Vent4Msg](#interface-vent4msg) | interface | `src/systems/Vent4Core.ts:44` |
| [Vent4PhysicsSystem](#class-vent4physicssystem) | class | `src/systems/Vent4PhysicsSystem.ts:63` |
| [Vent4Snapshot](#interface-vent4snapshot) | interface | `src/systems/Vent4Core.ts:34` |
| [Vent4State](#enum-vent4state) | enum | `src/systems/Vent4Core.ts:17` |
| [Vent4Stats](#interface-vent4stats) | interface | `src/systems/EntityStats.ts:913` |
| [Vent4TickResult](#interface-vent4tickresult) | interface | `src/entities/Vent4Boss.ts:67` |
| [Vent4Transition](#interface-vent4transition) | interface | `src/systems/Vent4Core.ts:28` |
| [Vent4View](#interface-vent4view) | interface | `src/systems/Vent4Core.ts:50` |
| [VfxSource](#type-vfxsource) | type | `src/entities/Vfx.ts:21` |
| [VfxSpec](#interface-vfxspec) | interface | `src/entities/Vfx.ts:27` |
| [VoicePreset](#interface-voicepreset) | interface | `src/systems/SilicateBarks.ts:38` |
| [WallBuffer](#class-wallbuffer) | class | `src/systems/CollisionGrid.ts:24` |
| [WallRect](#interface-wallrect) | interface | `src/map/TileBake.ts:48` |
| [WaveParams](#interface-waveparams) | interface | `src/systems/QualiaLock.ts:27` |
| [WitnessAnchor](#interface-witnessanchor) | interface | `src/scenes/game/Encounters.ts:64` |
