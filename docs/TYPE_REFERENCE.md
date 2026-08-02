# Type reference

Every enum, class, interface, type alias, and `as const` constant declared under `src/`, grouped by the area of the engine that owns it. Each entry cites the file and line it is declared on, so this file is a map into the code rather than a replacement for it.

**Generated — do not edit by hand.** Regenerate with `npm run docs:types` (`tools/typeref/generate.ts`) after adding or renaming a declaration. Prose lives in the doc comments on the declarations themselves; the generator lifts it from there.

## Totals

| Area | Enums | Classes | Interfaces | Type aliases | Constants | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [Systems](#systems) | 3 | 16 | 69 | 17 | 6 | 111 |
| [Entities](#entities) | 0 | 17 | 16 | 12 | 4 | 49 |
| [Map](#map) | 0 | 3 | 26 | 3 | 1 | 33 |
| [Scenes](#scenes) | 0 | 14 | 12 | 2 | 0 | 28 |
| [UI](#ui) | 0 | 18 | 19 | 1 | 1 | 39 |
| [Tools](#tools) | 0 | 0 | 6 | 1 | 0 | 7 |
| [Testing](#testing) | 0 | 1 | 0 | 0 | 0 | 1 |
| [Entry points](#entry-points) | 0 | 1 | 0 | 0 | 0 | 1 |
| **All** | **3** | **70** | **148** | **36** | **12** | **269** |

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

`src/systems/EntityStats.ts:259`

| Key | Value | Notes |
| --- | --- | --- |
| `interactionTime` | `1.4` |  |
| `noiseOnOpen` | `3` |  |
| `items` | `["Medkit", "Battery", "Access Chit"]` | Loot used when the map leaves a chest's item slots blank (they all are). The schema only carries three slots, and since unlit space became genuinely opaque a Battery outranks Stun Rounds — light is load-bearing, stunning an Orderly bystander is a convenience. |

<a id="const-consumable-order"></a>

#### `CONSUMABLE_ORDER` — const

`src/systems/EntityStats.ts:467`

The consumables that map to hotkeys [1]–[4], in canonical slot order. Held
consumables fill slots dynamically (unheld names are skipped), so e.g. a
player holding only Thermal Gel + Medkit sees them as [1] and [2].

```ts
const CONSUMABLE_ORDER = [ CHAFF_PACK_ITEM, THERMAL_GEL_ITEM, RATION_PACK_ITEM, BATTERY_ITEM, STUN_ROUNDS_ITEM, SACK_LUNCH_ITEM, ] as const;
```

<a id="const-door-defaults"></a>

#### `DOOR_DEFAULTS` — const

`src/systems/EntityStats.ts:152`

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
const RUN_KEYS = [ "inventory", "staplerFieldCharges", "objectives", "journal", "explored", "playTimeMs", "detection", "alertPhase", "radar", "alertNetwork", "playerHp", "sharedField", "activeItems", "vent4", "vent4State", "vent4Transmit", "smac", "smacState", "relay", "relayState", "conductMetrics", "pauseRequest", "mapSnapshot", SUSPENDED_KEY, ] as const;
```

<a id="const-terminal-defaults"></a>

#### `TERMINAL_DEFAULTS` — const

`src/systems/EntityStats.ts:199`

| Key | Value | Notes |
| --- | --- | --- |
| `hackTime` | `2.2` |  |

### Systems — Classes

<a id="class-activeitemstate"></a>

#### `ActiveItemState` — class

`src/systems/ActiveItems.ts:29`

| Member | Signature | Notes |
| --- | --- | --- |
| `chaffOrigin` | `chaffOrigin: { x: number; y: number } \| null = null` | World position the EMP Grenade was used at; null while inactive. |
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

`src/systems/AudioDirector.ts:26`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
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

*Plus 18 private members.*

<a id="class-binaryheap"></a>

#### `BinaryHeap` — class *(module-private)*

`src/systems/Pathfinder.ts:259`

Minimal binary min-heap over (node, priority) pairs.

Lazily deleted: a node improved after it was queued is pushed again rather
than sifted in place, and the stale copy is skipped when it pops against the
closed set. That costs a little memory and buys a much smaller heap.

| Member | Signature | Notes |
| --- | --- | --- |
| `size` | `get size(): number` |  |
| `push` | `push(node: number, cost: number): void` |  |
| `pop` | `pop(): number \| undefined` |  |

*Plus 3 private members.*

<a id="class-collisiongrid"></a>

#### `CollisionGrid` — class

`src/systems/CollisionGrid.ts:60`

A grid of blocked tiles for a level, plus helpers used by both player movement and
line of sight. Built from the `walls` layer (and any other layers marked as
blocking, e.g. closed doors in later phases).

Movement and sight are tracked separately, because they can disagree: a pane of clear
glass stops you walking through but not looking through. Callers should pick the
predicate that matches what they are asking — `isBlocked` for anything physical
(movement, pathing, radar, knocking) and `blocksSight` for anything optical
(line-of-sight tests, vision cones, the darkness overlay's visibility polygon).

| Member | Signature | Notes |
| --- | --- | --- |
| `width` | `readonly width: number` |  |
| `height` | `readonly height: number` |  |
| `revision` | `revision = 0` | Bumped whenever a tile's blocked or see-through state actually changes. Lets a cache of derived geometry — the player's visibility polygon in `Lighting` — know a door opened even if nothing else about the frame moved. |
| `constructor` | `constructor(level: GameLevel, blockingLayers: string[] = ["walls"])` |  |
| `inBounds` | `inBounds(x: number, y: number): boolean` |  |
| `isBlocked` | `isBlocked(tileX: number, tileY: number): boolean` | Blocks movement. Out of bounds counts as blocked. |
| `blocksSight` | `blocksSight(tileX: number, tileY: number): boolean` | Blocks line of sight. Everything that blocks movement also blocks sight *unless* it was registered as see-through. Out of bounds blocks sight, which is also what stops the ray walks in `hasLineOfSight` and `Visibility.rayDistance` running away. |
| `setBlocked` | `setBlocked(tileX: number, tileY: number, blocked: boolean, seeThrough = false): void` | Marks a tile blocked or clear at runtime — used by doors, which block movement, radar and enforcer pathing while closed and clear all of it the instant they open. Out-of-bounds writes are ignored. @param seeThrough when blocking, let sight through anyway (clear glazing). Ignored   when clearing a cell, since an open cell blocks nothing either way. |
| `wallsNear` | `wallsNear(cx: number, cy: number, radius: number, out: WallBuffer): WallBuffer` | Blocked-tile offsets within a circular radius (in tiles) of a centre point, as (dx, dy) relative to that centre, appended to `out`. Used by the radar to sample nearby terrain without scanning the whole level each frame. Fills a caller-owned `WallBuffer` rather than returning a fresh array because this runs every frame: a 10-tile radar radius sweeps 441 cells and can report a few hundred of them, and one `{ dx, dy }` per report at 60fps is a steady stream of short-lived objects for something that is only ever read and thrown away within the frame. |
| `hasLineOfSight` | `hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean` | Line-of-sight test between two tile coordinates using a supercover DDA walk. Returns true if no blocked tile lies strictly between the endpoints. |
| `lineOfSightPx` | `lineOfSightPx(x0: number, y0: number, x1: number, y1: number, tileSize: number): boolean` | `hasLineOfSight` for callers working in pixel space — divides both endpoints by `tileSize` before delegating. Used by guards checking sight to a noise's pixel origin. |

*Plus 2 private members.*

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

`src/systems/DetectionSystem.ts:34`

Turns the `light_sources` and `cover` layers into a spatial detection
modifier. When the player stands in a light pool they are easier to spot
(multiplier > 1); when they stand on a cover tile detection is dampened.

The result is a single function guards query: `multiplierAt(px, py)`.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(level: GameLevel, tileSize: number)` |  |
| `multiplierAt` | `multiplierAt(px: number, py: number): number` | Detection sensitivity at a pixel position (1 = neutral). |
| `coverTypeAt` | `coverTypeAt(px: number, py: number): string \| undefined` | Cover type at a pixel position, or undefined if the tile has no cover. |
| `thermalBleedAt` | `thermalBleedAt(px: number, py: number): boolean` | True when the cover here leaks body heat — thermal sensing sees through it. |
| `thermalRadiusFor` | `thermalRadiusFor(baseTiles: number, thermalMasked: boolean): number` | Thermal Gel zeroes every ThermalDetectionRadius check for its duration. |
| `destroyCoverAt` | `destroyCoverAt(tileX: number, tileY: number): boolean` | Removes a cover tile's gameplay effects — the detection dampening and any thermal bleed — once a destructible cover tile has been broken. Returns whether a cover tile was actually indexed there, so callers (`Cover`) can treat a double-destroy as a no-op. |

*Plus 8 private members.*

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

<a id="class-transitiongraph"></a>

#### `TransitionGraph` — class

`src/systems/TransitionGraph.ts:27`

The level-to-level connection map, derived automatically from the tile data.

The edplay export carries no explicit destination for a stair/ladder/hatch —
but the author aligned matching access points across levels by coordinate
(e.g. `main1`'s stairs sit at the same tiles as `main2`'s; `main1`'s hatches
share coordinates with `duct1`'s ladders). That alignment *is* the graph:
a transition tile at (x,y) in level A connects to another level B whose
same-named board also has a tile at (x,y), and the player arrives at (x,y).

Two refinements handle the map's rough edges:
 - **Affinity tie-break** — if several levels share a coordinate, prefer the
   one that shares the most of this board's tiles overall (then level order).
 - **Ragged-cluster fallback** — a tile with no exact-coordinate twin (e.g.
   the lower row of `main1`'s 2×2 stair block, absent from `main2`) links to
   the highest-affinity level and arrives at that level's nearest board tile.

Pure: never touches Phaser. Built once from the parsed `GameMap`.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(map: GameMap)` |  |
| `at` | `at(levelName: string, tileX: number, tileY: number): Transition \| undefined` | The transition on the tile at (tileX, tileY) in a level, if any. |
| `exitsOn` | `exitsOn(levelName: string): { tx: number; ty: number; transition: Transition }[]` | Every transition tile on a level, with its coordinate — the reverse of `at`, for the pause menu's map, which needs to mark the ways out rather than test one tile. |

*Plus 1 private member.*

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

`src/systems/CollisionGrid.ts:11`

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

<a id="interface-activeitemsview"></a>

#### `ActiveItemsView` — interface

`src/systems/ActiveItems.ts:134`

Snapshot published to the registry for the HUD.

| Field | Type | Notes |
| --- | --- | --- |
| `chaffRemaining` | `number` |  |
| `thermalRemaining` | `number` |  |
| `flashlightOwned` | `boolean` |  |
| `flashlightOn` | `boolean` |  |
| `flashlightCharge` | `number` |  |
| `sackLunchOpened` | `boolean` | A held Sack Lunch is OPENED — the HUD says so, since it costs to carry that way. |

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

<a id="interface-cheststats"></a>

#### `ChestStats` — interface

`src/systems/EntityStats.ts:250`

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

`src/systems/EntityStats.ts:506`

One occupied consumable hotkey slot.

| Field | Type | Notes |
| --- | --- | --- |
| `slot` | `number` | Hotkey number, 1..MAX_CONSUMABLES. |
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

`src/systems/Sensing.ts:67`

The extra context `accrueDetection` needs on top of `SensingWorld`.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `number` |  |
| `player` | `{ x: number; y: number }` |  |
| `lightMultiplierAt` | `(px: number, py: number) => number` |  |
| `alert` | `AlertState` |  |

<a id="interface-doorstats"></a>

#### `DoorStats` — interface

`src/systems/EntityStats.ts:143`

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

<a id="interface-glassstats"></a>

#### `GlassStats` — interface

`src/systems/EntityStats.ts:173`

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

`src/systems/ItemCatalog.ts:46`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` |  |
| `blurb` | `string` | In-fiction description — what the object is and what carrying it means. |
| `effect` | `string` | Mechanical effect, with every number sourced from the tuning constants. |

<a id="interface-journalentry"></a>

#### `JournalEntry` — interface

`src/systems/Journal.ts:42`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `JournalEntryId` |  |
| `title` | `string` | Short all-caps heading, shown in the entry list. |
| `body` | `string` | The entry itself. Hard-wrapped prose; the view renders it pre-formatted. |

<a id="interface-journalstate"></a>

#### `JournalState` — interface

`src/systems/Journal.ts:337`

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

<a id="interface-lightstats"></a>

#### `LightStats` — interface

`src/systems/EntityStats.ts:65`

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

<a id="interface-playerparams"></a>

#### `PlayerParams` — interface

`src/systems/QualiaLock.ts:34` · `extends WaveParams`

The player's wave adds an exponential-decay envelope (the DAMPING control).

| Field | Type | Notes |
| --- | --- | --- |
| `damping` | `number` | Envelope decay: y = A · e^(−damping·x) · sin(f·x + φ). 0 ⇒ flat baseline. |

<a id="interface-playerstats"></a>

#### `PlayerStats` — interface

`src/systems/EntityStats.ts:282`

| Field | Type | Notes |
| --- | --- | --- |
| `maxHp` | `number` | Full bio-integrity (health). |
| `captureRadius` | `number` | Tiles: a silicate this close, with line of sight, during a full alert seizes you. |
| `captureTime` | `number` | Seconds cornered before the capture (Alignment) completes. |
| `hazardDamage` | `number` | Bio-integrity lost per hazard hit (e.g. a laser). |
| `hitCooldown` | `number` | Seconds of invulnerability after taking a hit. |

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

`src/systems/Radar.ts:8`

A guard blip, player-relative, in tile units.

| Field | Type | Notes |
| --- | --- | --- |
| `dx` | `number` |  |
| `dy` | `number` |  |
| `facing` | `number` |  |
| `alerted` | `boolean` | True once the guard is past the "spotted" threshold — draws hot/red. |

<a id="interface-radarsnapshot"></a>

#### `RadarSnapshot` — interface

`src/systems/Radar.ts:33`

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

<a id="interface-radarunit"></a>

#### `RadarUnit` — interface

`src/systems/Radar.ts:17`

Anything the radar can plot: a guard or a camera.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `facing` | `number` |  |
| `detection` | `number` |  |

<a id="interface-raydirections"></a>

#### `RayDirections` — interface

`src/systems/Visibility.ts:40`

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

`src/systems/EntityStats.ts:727`

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

`src/systems/Sensing.ts:55`

The slice of the per-frame guard context sensing actually reads.

Declared structurally rather than importing `EnforcerContext` so this module
stays free of Phaser (`Enforcer.ts` imports it) and a test can hand it a
plain object. `EnforcerContext` satisfies this by shape.

| Field | Type | Notes |
| --- | --- | --- |
| `grid` | `{ hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean }` |  |
| `tileSize` | `number` |  |
| `player` | `{ x: number; y: number }` |  |
| `playerConcealed` | `boolean` |  |
| `playerCompliant` | `boolean` |  |
| `playerThermalConcealed` | `boolean` |  |
| `chaffZone` | `{ x: number; y: number; radiusPx: number } \| null` |  |
| `thermalRadiusMultiplier` | `(baseTiles: number) => number` |  |

<a id="interface-sensorstats"></a>

#### `SensorStats` — interface

`src/systems/EntityStats.ts:211`

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

`src/systems/EntityStats.ts:655`

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

<a id="interface-terminalstats"></a>

#### `TerminalStats` — interface

`src/systems/EntityStats.ts:190`

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

`src/systems/EntityStats.ts:531`

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
type ConductBreach = | "ALERT" /** * Guards are sweeping for you. Blocking unless Rowan carries the Q0 compliance * cert — with papers in hand he can stand the search down and pass as staff again. */ | "EVASION" | "RUNNING" | "SNEAKING" /** Working a terminal or a silicate rack. */ | "UNAUTHORIZED" /** Searching a container, rapping on walls. */ | "TAMPERING" /** Stun round, chaff burst. */ | "HOSTILE" /** Clean again, but still standing down from something. */ | "SETTLING";
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
type JournalEntryId = | "orders" | "arrival-main1" | "arrival-duct1" | "arrival-duct2" | "arrival-main2" | "supply" | "flagged" | "we" | "the-cache" | "node-alpha" | "node-beta" | "certified" | "vent4" | "arrival-roof" | "the-core" | "the-relay" | "the-uplink";
```

<a id="type-lexiconcategory"></a>

#### `LexiconCategory` — type

`src/systems/Lexicon.ts:19`

```ts
type LexiconCategory = "LAW" | "APPARATUS" | "PERSONS" | "PLACES" | "MATERIEL";
```

<a id="type-musicmood"></a>

#### `MusicMood` — type

`src/systems/AudioDirector.ts:17`

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

<a id="type-slotid"></a>

#### `SlotId` — type

`src/systems/SaveGame.ts:26`

Save slots: the engine's rolling checkpoint plus three the player controls.

```ts
type SlotId = "auto" | "1" | "2" | "3";
```

---

## Entities

Actors and props that own a sprite plus the behaviour attached to it. Entities wrap the headless cores from `systems/` and add the Phaser display objects.

### Entities — Constants

<a id="const-dirs-8"></a>

#### `DIRS_8` — const

`src/entities/directions.ts:20`

The eight directions in **export order**, matching how the sheets are laid
out on disk. Iteration order for preloading; not an angular sequence.

```ts
const DIRS_8 = [ "south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west", ] as const;
```

<a id="const-drone-patrol-south-collider"></a>

#### `DRONE_PATROL_SOUTH_COLLIDER` — const

`src/entities/generated/droneCollider.ts:32`

| Key | Value | Notes |
| --- | --- | --- |
| `source` | `"public/assets/drone/patrol/south/0.png"` |  |
| `frameWidth` | `85` |  |
| `frameHeight` | `85` |  |
| `epsilon` | `2` |  |
| `inset` | `0` |  |
| `aabb` | `{ width: 71, height: 63, offsetX: 6, offsetY: 10 }` |  |
| `polygon` | `[ { x: 14, y: 10 }, { x: 18, y: 11 }, { x: 18, y: 20 }, { x: 23, y: 28 }, { x: 31, y: 17 }, { x: 52, y: 17 }, { x: 60,…` |  |
| `polygonFlat` | `[14, 10, 18, 11, 18, 20, 23, 28, 31, 17, 52, 17, 60, 28, 65, 20, 64, 13, 69, 10, 74, 23, 73, 34, 69, 34, 67, 27, 62, 35…` |  |
| `matterPath` | `"14 10 18 11 18 20 23 28 31 17 52 17 60 28 65 20 64 13 69 10 74 23 73 34 69 34 67 27 62 35 57 34 57 43 63 54 68 53 66 4…` |  |

<a id="const-enforcer-patrol-south-collider"></a>

#### `ENFORCER_PATROL_SOUTH_COLLIDER` — const

`src/entities/generated/enforcerCollider.ts:32`

| Key | Value | Notes |
| --- | --- | --- |
| `source` | `"public/assets/enforcer/patrol/south/0.png"` |  |
| `frameWidth` | `48` |  |
| `frameHeight` | `48` |  |
| `epsilon` | `2` |  |
| `inset` | `0` |  |
| `aabb` | `{ width: 31, height: 42, offsetX: 9, offsetY: 2 }` |  |
| `polygon` | `[ { x: 27, y: 2 }, { x: 29, y: 7 }, { x: 33, y: 5 }, { x: 38, y: 10 }, { x: 39, y: 44 }, { x: 30, y: 41 }, { x: 10, y:…` |  |
| `polygonFlat` | `[27, 2, 29, 7, 33, 5, 38, 10, 39, 44, 30, 41, 10, 44, 11, 10, 19, 3, 25, 7, 26, 3]` |  |
| `matterPath` | `"27 2 29 7 33 5 38 10 39 44 30 41 10 44 11 10 19 3 25 7 26 3"` |  |

<a id="const-player-idle-south-collider"></a>

#### `PLAYER_IDLE_SOUTH_COLLIDER` — const

`src/entities/generated/playerCollider.ts:32`

| Key | Value | Notes |
| --- | --- | --- |
| `source` | `"public/assets/player/idle/south/0.png"` |  |
| `frameWidth` | `88` |  |
| `frameHeight` | `88` |  |
| `epsilon` | `2` |  |
| `inset` | `0` |  |
| `aabb` | `{ width: 28, height: 41, offsetX: 29, offsetY: 23 }` |  |
| `polygon` | `[ { x: 41, y: 23 }, { x: 53, y: 26 }, { x: 57, y: 37 }, { x: 56, y: 50 }, { x: 51, y: 57 }, { x: 53, y: 63 }, { x: 47,…` |  |
| `polygonFlat` | `[41, 23, 53, 26, 57, 37, 56, 50, 51, 57, 53, 63, 47, 60, 44, 53, 36, 64, 37, 57, 31, 53, 29, 43, 33, 28, 40, 24]` |  |
| `matterPath` | `"41 23 53 26 57 37 56 50 51 57 53 63 47 60 44 53 36 64 37 57 31 53 29 43 33 28 40 24"` |  |

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

`src/entities/Cover.ts:16`

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
| `constructor` | `constructor( private readonly scene: Phaser.Scene, private readonly detection: DetectionSystem, private readonly tileTexture: Phaser.GameObjects.RenderTexture, private readonly tileSize: number, tile…` |  |
| `isBroken` | `get isBroken(): boolean` |  |
| `destroy` | `destroy(): void` | Breaks the cover: a single hit is enough (no durability system, matching how doors/lasers/chests are all binary state). Clears its detection/ thermal effect and erases its art from the baked tile texture, redrawing the floor underneath so destroying it doesn't punch through to the level background. |

*Plus 1 private member.*

<a id="class-deployeditem"></a>

#### `DeployedItem` — class

`src/entities/DeployedItem.ts:17` · `implements DeployedLure`

An item the player has left on the floor — the world half of a deployable.

Modelled on `Cover`: a small class that owns one visual and one piece of
state, existing only because something has to happen to it later. It satisfies
`DeployedLure` structurally, so the AI reads it through the pure sensor
module without knowing a Phaser object is on the other end.

There is no icon art for the Sack Lunch (Stun Rounds and the Rail-Stapler ship
icon-less too), so the prop is drawn: a small paper-bag glyph over a soft floor
stain, at prop depth so it reads as litter rather than as an actor.

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

`src/entities/Door.ts:27`

An interactive door, sized and placed from the map's authoring data.

The door art is drawn pre-squished into a 32px cell but describes a larger
footprint via the tile's `colSpan`/`rowSpan` (single doors 1.5 tiles, double
doors 2.5) and is nudged into place with `offsetX`/`offsetY` — so we scale the
sprite to that footprint and centre it (the editor anchors doors at centre).
The two keyframes give distinct **closed** and **open** sprites, which we swap
on state change rather than just fading.

Closed, it blocks the player (an Arcade static body covering the footprint)
and every grid cell the footprint spans (so it also blocks radar and enforcer
pathing). Opening clears both. A door with a non-zero `key` is *locked* — only a
terminal hack (or, later, a keycard) opens it.

**Glazed** doors are the exception to blocking sight: the map's glass doors carry a
`glass` component alongside their `door` one, and clear glazing stops you walking
through without stopping you (or a guard) looking through. So a closed glass door is a
window — you can be spotted across it, and you can scout the room beyond before
committing to opening it.

| Member | Signature | Notes |
| --- | --- | --- |
| `tileX` | `readonly tileX: number` |  |
| `tileY` | `readonly tileY: number` |  |
| `stats` | `readonly stats: DoorStats` |  |
| `locked` | `readonly locked: boolean` |  |
| `seeThrough` | `readonly seeThrough: boolean` | Clear glazing: blocks movement while closed, but never line of sight. |
| `constructor` | `constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, grid: CollisionGrid)` |  |
| `body` | `get body(): Phaser.Physics.Arcade.Image` | The Arcade body used for player collision. |
| `isOpen` | `get isOpen(): boolean` |  |
| `isManual` | `get isManual(): boolean` | Whether the player may open this by hand (adjacent tap). |
| `covers` | `covers(tileX: number, tileY: number): boolean` | True when this door's footprint covers the given tile. |
| `setOpen` | `setOpen(open: boolean): boolean` | Opens/closes the door. Returns true if it changed state. |
| `toggle` | `toggle(): boolean` |  |

*Plus 9 private members.*

<a id="class-drone"></a>

#### `Drone` — class

`src/entities/Drone.ts:13` · `extends Enforcer`

A patrol drone. Mechanically identical to `Enforcer` — the map's
`drones` tiles (found in the crawlspace levels) carry the exact same
`enforcer` DataComponent/stats schema as guards — so this is just the
drone's `GuardSkin` wired into the shared AI core.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor( scene: Phaser.Scene, tileX: number, tileY: number, tileSize: number, components: ComponentData[], route: PatrolRoute = [], )` |  |

<a id="class-enforcer"></a>

#### `Enforcer` — class

`src/entities/Enforcer.ts:168`

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
| `constructor` | `constructor( scene: Phaser.Scene, tileX: number, tileY: number, tileSize: number, components: ComponentData[], skin: GuardSkin = ENFORCER_SKIN, route: PatrolRoute = [], )` |  |
| `update` | `update(dt: number, ctx: EnforcerContext): EnforcerFireResult \| undefined` |  |
| `collisionRadiusTiles` | `get collisionRadiusTiles(): number` | Collision radius in tiles — read by the debug overlay. |
| `patrolRoute` | `get patrolRoute(): readonly PathNode[]` | This guard's patrol waypoints, for the debug overlay. |
| `plannedPath` | `get plannedPath(): readonly PathNode[]` | The remaining leg of the path being walked, for the debug overlay. |
| `hearNoise` | `hearNoise(intensity: number, sx: number, sy: number): void` | Reacts to a nearby noise (e.g. a door operating): the guard turns to look toward the source and grows suspicious, but detection is capped below full so sound alone never trips a hard ALERT — it still takes line of sight to confirm. Also queues the origin for a LOS-aware investigation (pivot if already in clear sight, walk over if obstructed) the next time this guard is free to act on it. `intensity` is 0..1 (louder/closer = higher); `sx,sy` are pixels. |

*Plus 57 private members.*

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
| `constructor` | `constructor( scene: Phaser.Scene, tile: GameTile, tileSize: number, /** Position in its owner's board order — the index its core counts by. */ readonly index: number, holdTime: number, barColor: numb…` |  |
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

`src/entities/HoldTarget.ts:35`

| Member | Signature | Notes |
| --- | --- | --- |
| `x` | `readonly x: number` | Pixel centre: the tile's cell centre plus its authored placement offset. |
| `y` | `readonly y: number` |  |
| `constructor` | `constructor( scene: Phaser.Scene, tile: GameTile, private readonly tileSize: number, private readonly duration: number, private readonly barColor: number, )` | @param duration seconds of unbroken holding to complete. A duration of 0 (or   less) completes on the first frame and draws a full bar rather than   dividing by zero. @param barColor the fill — see `HOLD_BAR_CYAN` / `HOLD_BAR_AMBER`. |
| `advance` | `advance(dt: number): boolean` | Advances the hold by one frame and draws the bar. Returns true on the exact frame the timer fills, so the caller fires its effect once. |
| `decay` | `decay(dt: number): void` | The player let go this frame: drain partial progress and fade the bar out. |
| `reset` | `reset(): void` | Back to untouched — no progress, no bar, no tint. |
| `settle` | `settle(color: number): void` | Done: hide the bar and mark the sprite with `color`. |
| `setTint` | `setTint(color: number): void` | Recolours the sprite without touching progress (a substation being locked). |
| `clearTint` | `clearTint(): void` |  |

*Plus 4 private members.*

<a id="class-laser"></a>

#### `Laser` — class

`src/entities/Laser.ts:28`

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

*Plus 11 private members.*

<a id="class-orderly"></a>

#### `Orderly` — class

`src/entities/Orderly.ts:88`

A bystander, not a threat — the map's `orderlies` tiles carry no gameplay
component (unlike guards/drones), so this is a distinct, lighter mechanic.

An orderly wanders loosely near its spawn point. If it gets a clear,
unobstructed line of sight to the player (no cone-angle restriction — a
person just looks around) and the player isn't concealed, it startles: a
one-shot "witness" sighting. `update()` returns `true` on exactly that
frame so the scene can react (raise nearby guards' suspicion, the same way
a noisy door does) — after which the orderly freezes, its job done. It's a
hazard to avoid being seen by, not a persistent threat like a guard.

Two things bend that: a **deployed Sack Lunch**, which pulls it off its round
to clean and half-blinds it while it works, and an **opened** one held in
plain sight, which buys a grace window before it reports. Both are the same
insight from opposite ends — an orderly is a member of staff with a job, and
a job is a thing you can give it.

| Member | Signature | Notes |
| --- | --- | --- |
| `x` | `x: number` | Pixel position — public for the same reason as `Enforcer.x`. |
| `y` | `y: number` |  |
| `constructor` | `constructor(scene: Phaser.Scene, tileX: number, tileY: number, tileSize: number)` |  |
| `stun` | `stun(seconds: number): void` | Freezes the orderly for a stretch (a Stun Rounds dart) — can't witness. |
| `pin` | `pin(seconds: number): void` | Pins the orderly to a wall for a stretch (the Rail-Stapler's field mode) — can't witness. |
| `distract` | `distract(sx: number, sy: number): void` | Lures the orderly to inspect a nearby noise (a player's knock): it leaves its wander, walks over, pauses, then drifts back. A no-op while stunned, already startled by witnessing the player, or busy with a spill — a knock does not out-rank an actual work order. |
| `update` | `update(dt: number, ctx: OrderlyContext): boolean` | True on the exact frame the orderly first spots the player. |
| `isStunned` | `get isStunned(): boolean` | True while frozen by a Stun Rounds dart — guards treat this as an anomaly. |
| `isPinned` | `get isPinned(): boolean` | True while pinned to a wall by the Rail-Stapler's field mode — same effect as stun. |
| `isImmobilized` | `get isImmobilized(): boolean` | Frozen and can't witness, regardless of which effect is holding it. |

*Plus 30 private members.*

<a id="class-player"></a>

#### `Player` — class

`src/entities/Player.ts:32`

| Member | Signature | Notes |
| --- | --- | --- |
| `sprite` | `readonly sprite: Phaser.Physics.Arcade.Sprite` |  |
| `facing` | `facing = -Math.PI / 2` | Facing angle in radians; updated as the player moves. |
| `constructor` | `constructor(scene: Phaser.Scene, x: number, y: number, tileSize: number)` |  |
| `noise` | `noise = 0` | How loud the player currently is (0..1), from movement + stance. |
| `maxHp` | `readonly maxHp = PLAYER_DEFAULTS.maxHp` | Full and current bio-integrity (health). |
| `hp` | `hp = PLAYER_DEFAULTS.maxHp` |  |
| `crouched` | `get crouched(): boolean` | True only once *fully* crouched — not during the lower/rise transitions. Cover concealment keys off this, so tapping Shift can't grant an instant hide before Rowan has actually gone to ground. |
| `running` | `get running(): boolean` | True while actually sprinting — moving, upright, with run held. Not just the key state: standing still on Space isn't running. Read by the conduct rules, where a sprint is one of the things that stops you reading as staff. |
| `alive` | `get alive(): boolean` |  |
| `takeDamage` | `takeDamage(amount: number): boolean` | Applies damage unless still within the post-hit invulnerability window. Returns true if the hit landed (so callers can trigger feedback/SFX). |
| `heal` | `heal(amount: number): void` | Restores bio-integrity, capped at `maxHp` (Medkit). |
| `update` | `update(cursors: InputState, dt: number): void` |  |
| `x` | `get x(): number` |  |
| `y` | `get y(): number` |  |

*Plus 13 private members.*

<a id="class-pressuresubstation"></a>

#### `PressureSubStation` — class

`src/entities/PressureSubStation.ts:17`

A pressure relief terminal on the VENT-4 arena perimeter. Hold the interact
key while adjacent to patch it (Terminal's hold-to-progress contract:
`patch` returns true exactly on the completion frame, `idle` decays partial
progress). The machine "locks" the last un-patched station until its purge
phase — shown as an amber tint and a resisting prompt.

Renders its own sprite from the arena tile's frame (the `substations` board
is in GameScene's ENTITY_LAYERS so the static renderer skips it). The sprite,
bar and hold timer are a `HoldTarget`, shared with `Terminal`.

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

`src/entities/RoofRelay.ts:70`

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

*Plus 13 private members.*

<a id="class-sensor"></a>

#### `Sensor` — class

`src/entities/Sensor.ts:26`

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
| `constructor` | `constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, grid: CollisionGrid)` |  |
| `update` | `update(dt: number, ctx: EnforcerContext): void` |  |

*Plus 6 private members.*

<a id="class-terminal"></a>

#### `Terminal` — class

`src/entities/Terminal.ts:16`

A hackable terminal. Hold the interact key while adjacent to fill a progress
bar over the terminal's `HackTime`; finishing marks it hacked (green tint)
and fires its effect once (in this slice, opening nearby doors — the scene
owns that, since the map carries no explicit terminal→door links).

Renders its own sprite from the map tile's frame (the `terminals` board is in
GameScene's ENTITY_LAYERS so the static renderer skips it). The sprite, bar
and hold timer are a `HoldTarget`.

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

`src/entities/Vent4Boss.ts:79`

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

*Plus 53 private members.*

### Entities — Interfaces

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

`src/entities/Enforcer.ts:57`

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
| `chaffZone` | `{ x: number; y: number; radiusPx: number } \| null` | Non-null while an EMP Grenade's EMP zone is live; guards inside it can't see. |
| `thermalRadiusMultiplier` | `(baseTiles: number) => number` | Scales a guard's thermalRadius stat (in tiles) — 0 while Thermal Gel is active. |
| `alert` | `AlertState` |  |
| `anomalies` *(opt)* | `GuardAnomaly[]` | Opened doors/chests, EMP'd devices, and stunned orderlies visible this frame. |
| `lures` *(opt)* | `readonly DeployedLure[]` | Items the player has deployed on the floor this frame. Read by orderlies only — a spill is a work order, and guards do not do cleaning. They live on this context rather than an orderly-shaped one because `GameScene` deliberately hands the *same* object to both (an `OrderlyContext` is a structural subset of this one), rather than minting a second literal per orderly per frame. Making guards notice litter would be one push into `GameScene.buildAnomalies`, not a change here. |
| `rationSpoof` *(opt)* | `boolean` | True while an opened ration buys tolerance from orderlies — see `OrderlyContext`. |
| `playerVelocity` *(opt)* | `{ x: number; y: number }` | Player's current velocity (px/s), for smart search-point prediction. |
| `coverTilesNear` *(opt)* | `(tileX: number, tileY: number, radiusTiles: number) => { x: number; y: number }[]` | Cover tiles (pixel centres) within `radiusTiles` of a tile position. |
| `isGuardDoor` *(opt)* | `(tileX: number, tileY: number) => boolean` | True when this tile holds a door the guard may work itself — unlocked, and not a wall. Guards route through their own facility's doors rather than treating every one as permanent geometry: `main1`'s patrol beat crosses two of them, and without this the south half of the route is simply unreachable. |
| `setDoorOpen` *(opt)* | `(tileX: number, tileY: number, open: boolean) => void` | Opens or closes a door the guard is working. |

<a id="interface-enforcerfireresult"></a>

#### `EnforcerFireResult` — interface

`src/entities/Enforcer.ts:36`

A shot fired by a pursuing guard this frame — the scene applies its effects.

| Field | Type | Notes |
| --- | --- | --- |
| `originX` | `number` |  |
| `originY` | `number` |  |
| `targetX` | `number` |  |
| `targetY` | `number` |  |
| `damage` | `number` |  |

<a id="interface-guardanomaly"></a>

#### `GuardAnomaly` — interface

`src/entities/Enforcer.ts:45`

An environmental anomaly a guard's vision cone can notice.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` | Pixel-space position, for cone/LOS checks. |
| `y` | `number` |  |
| `tx` | `number` | Tile-space position, for search/anomaly bookkeeping. |
| `ty` | `number` |  |
| `kind` | `"door" \| "chest" \| "device" \| "stunnedOrderly" \| "pinnedOrderly"` |  |
| `key` | `string` | Stable identity so a guard investigates a given anomaly at most once. |

<a id="interface-guardskin"></a>

#### `GuardSkin` — interface

`src/entities/GuardSkin.ts:11`

Describes one guard's sprite sheet + display tuning, so the shared vision-
cone/patrol/pursue/detection AI in `Enforcer` can drive any reskin
(the security drone, the crawlspace drone, ...) without knowing its asset
layout. All guard skins use the same 8 directions.

| Field | Type | Notes |
| --- | --- | --- |
| `frameCount` | `number` |  |
| `frameRate` | `number` |  |
| `displayTiles` | `number` | Display height as a multiple of tile size (e.g. 1.5 tiles). |
| `sourceSize` | `number` | Native pixel size of the (square) source art. |
| `collisionRadiusTiles` | `number` | Radius (in tiles) of the circular body this guard collides with walls by. See `guardRadiusTiles` for how it's derived. |
| `frameKey` | `frameKey(dir: Dir8, frame: number): string` |  |
| `framePath` | `framePath(dir: Dir8, frame: number): string` |  |
| `animKey` | `animKey(dir: Dir8): string` |  |

<a id="interface-guardskinspec"></a>

#### `GuardSkinSpec` — interface

`src/entities/GuardSkin.ts:62`

The tuning that actually differs between one guard's art and another's.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Asset/animation slug. Frames are expected at `public/assets/<id>/patrol/<direction>/<frame>.png`, and every texture and animation key is derived from it — so this one string is the whole naming convention. |
| `frameCount` | `number` |  |
| `frameRate` | `number` |  |
| `displayTiles` | `number` | Display height as a multiple of tile size. |
| `sourceSize` | `number` | Native pixel size of the (square) source art. |
| `collider` | `SpriteCollider` | Generated collider for the south frame; see `guardRadiusTiles`. |

<a id="interface-inputstate"></a>

#### `InputState` — interface

`src/entities/Player.ts:275`

| Field | Type | Notes |
| --- | --- | --- |
| `up` | `boolean` |  |
| `down` | `boolean` |  |
| `left` | `boolean` |  |
| `right` | `boolean` |  |
| `run` | `boolean` |  |
| `sneak` | `boolean` |  |

<a id="interface-investigation"></a>

#### `Investigation` — interface *(module-private)*

`src/entities/Enforcer.ts:115`

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

`src/entities/Orderly.ts:22`

| Field | Type | Notes |
| --- | --- | --- |
| `grid` | `CollisionGrid` |  |
| `tileSize` | `number` |  |
| `player` | `{ x: number; y: number }` |  |
| `playerConcealed` | `boolean` | True when the player is hidden (crouched in cover) — orderlies can't see them either. |
| `playerCompliant` | `boolean` | True when the player reads as compliant staff — nothing to report. |
| `lures` *(opt)* | `readonly DeployedLure[]` | Items left on the floor this frame; an orderly services the nearest it notices. |
| `rationSpoof` *(opt)* | `boolean` | True when the player is holding an opened ration and no alarm is up: the orderly reads Rowan as an asset on a break and grants a grace window instead of reporting. Resolved by the scene, since the "before an alarm" half of it is global alert state the orderly has no other reason to know about. |

<a id="interface-relaytickresult"></a>

#### `RelayTickResult` — interface

`src/entities/RoofRelay.ts:56`

| Field | Type | Notes |
| --- | --- | --- |
| `transition` | `RelayTransition \| null` |  |
| `searchlightHit` | `boolean` | True on the frame a searchlight confirms — the scene charges the damage. |
| `spawnAt` | `{ x: number; y: number }[] \| null` | Catwalk mouths a wave should land at this frame, or null on the overwhelming majority of frames where none is due. Null rather than an empty array so the common path allocates nothing. |

<a id="interface-smactickresult"></a>

#### `SmacTickResult` — interface

`src/entities/BossCore.ts:56`

| Field | Type | Notes |
| --- | --- | --- |
| `transition` | `SmacTransition \| null` |  |
| `auditHit` | `boolean` | True on the frame an auditing beam confirms — the scene charges the damage. |

<a id="interface-spritecollider"></a>

#### `SpriteCollider` — interface

`src/entities/generated/droneCollider.ts:6`

A sprite collider derived from its alpha silhouette.

| Field | Type | Notes |
| --- | --- | --- |
| `source` | `readonly source: string` | Source sprite the collider was traced from. |
| `frameWidth` | `readonly frameWidth: number` |  |
| `frameHeight` | `readonly frameHeight: number` |  |
| `epsilon` | `readonly epsilon: number` | RDP tolerance (px) and edge inset (px) used to generate this data. |
| `inset` | `readonly inset: number` |  |
| `aabb` | `readonly aabb: { readonly width: number; readonly height: number; readonly offsetX: number; readonly offsetY: number; }` | Tight-fit box in the sprite's *unscaled* local space. Feed `width`/`height` to Phaser Arcade `body.setSize` and `offsetX`/`offsetY` to `body.setOffset`. |
| `polygon` | `readonly polygon: ReadonlyArray<{ readonly x: number; readonly y: number }>` | Simplified alpha contour (`origin=top-left`), for polygon/LOS/Matter use. |
| `polygonFlat` | `readonly polygonFlat: readonly number[]` | `polygon` flattened to `[x1, y1, x2, y2, ...]`. |
| `matterPath` | `readonly matterPath: string` | Path string for `Matter.Vertices.fromPath` / `Bodies.fromVertices`. |

<a id="interface-spritecollider-2"></a>

#### `SpriteCollider` — interface

`src/entities/generated/enforcerCollider.ts:6`

A sprite collider derived from its alpha silhouette.

| Field | Type | Notes |
| --- | --- | --- |
| `source` | `readonly source: string` | Source sprite the collider was traced from. |
| `frameWidth` | `readonly frameWidth: number` |  |
| `frameHeight` | `readonly frameHeight: number` |  |
| `epsilon` | `readonly epsilon: number` | RDP tolerance (px) and edge inset (px) used to generate this data. |
| `inset` | `readonly inset: number` |  |
| `aabb` | `readonly aabb: { readonly width: number; readonly height: number; readonly offsetX: number; readonly offsetY: number; }` | Tight-fit box in the sprite's *unscaled* local space. Feed `width`/`height` to Phaser Arcade `body.setSize` and `offsetX`/`offsetY` to `body.setOffset`. |
| `polygon` | `readonly polygon: ReadonlyArray<{ readonly x: number; readonly y: number }>` | Simplified alpha contour (`origin=top-left`), for polygon/LOS/Matter use. |
| `polygonFlat` | `readonly polygonFlat: readonly number[]` | `polygon` flattened to `[x1, y1, x2, y2, ...]`. |
| `matterPath` | `readonly matterPath: string` | Path string for `Matter.Vertices.fromPath` / `Bodies.fromVertices`. |

<a id="interface-spritecollider-3"></a>

#### `SpriteCollider` — interface

`src/entities/generated/playerCollider.ts:6`

A sprite collider derived from its alpha silhouette.

| Field | Type | Notes |
| --- | --- | --- |
| `source` | `readonly source: string` | Source sprite the collider was traced from. |
| `frameWidth` | `readonly frameWidth: number` |  |
| `frameHeight` | `readonly frameHeight: number` |  |
| `epsilon` | `readonly epsilon: number` | RDP tolerance (px) and edge inset (px) used to generate this data. |
| `inset` | `readonly inset: number` |  |
| `aabb` | `readonly aabb: { readonly width: number; readonly height: number; readonly offsetX: number; readonly offsetY: number; }` | Tight-fit box in the sprite's *unscaled* local space. Feed `width`/`height` to Phaser Arcade `body.setSize` and `offsetX`/`offsetY` to `body.setOffset`. |
| `polygon` | `readonly polygon: ReadonlyArray<{ readonly x: number; readonly y: number }>` | Simplified alpha contour (`origin=top-left`), for polygon/LOS/Matter use. |
| `polygonFlat` | `readonly polygonFlat: readonly number[]` | `polygon` flattened to `[x1, y1, x2, y2, ...]`. |
| `matterPath` | `readonly matterPath: string` | Path string for `Matter.Vertices.fromPath` / `Bodies.fromVertices`. |

<a id="interface-steamjet"></a>

#### `SteamJet` — interface *(module-private)*

`src/entities/Vent4Boss.ts:59`

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `active` | `boolean` |  |
| `timer` | `number` |  |
| `crossing` | `boolean` |  |

<a id="interface-vent4tickresult"></a>

#### `Vent4TickResult` — interface

`src/entities/Vent4Boss.ts:46`

What happened inside the boss this frame, for the scene to apply/dress.

| Field | Type | Notes |
| --- | --- | --- |
| `burst` *(opt)* | `{ dirX: number; dirY: number }` | A sweep (or the purge's thermal scan) fully spotted the player. |
| `steamHit` | `boolean` | An active steam jet caught the player (debounced). |
| `overheating` | `boolean` | Heat is maxed during the purge — the scene applies periodic damage. |
| `transition` | `Vent4Transition \| null` |  |

### Entities — Type aliases

<a id="type-dir8"></a>

#### `Dir8` — type

`src/entities/directions.ts:31`

```ts
type Dir8 = (typeof DIRS_8)[number];
```

<a id="type-followresult"></a>

#### `FollowResult` — type *(module-private)*

`src/entities/Enforcer.ts:154`

What a single `Enforcer.followPath` step achieved.

```ts
type FollowResult = "moving" | "arrived" | "unreachable";
```

<a id="type-guardstate"></a>

#### `GuardState` — type

`src/entities/Enforcer.ts:33`

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

`src/entities/Vent4Boss.ts:301`

```ts
type Kind = "sub" | "subLocked" | "winch" | "piton" | "stapler";
```

<a id="type-laserkind"></a>

#### `LaserKind` — type

`src/entities/Laser.ts:21`

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
offset (the sprite frames are an inconsistent 20–23-frame animation, so we
draw the beam ourselves rather than fight them).

```ts
type LaserKind = "scanner" | "beam";
```

<a id="type-orderlyanimname"></a>

#### `OrderlyAnimName` — type

`src/entities/OrderlyAnimations.ts:12`

Frame manifest for the orderly sprite (generated via PixelLab.ai — a human
orderly in a utilitarian jumpsuit with a diagnostic tablet, high top-down,
84x84, `mannequin` template). Only idle and walk are needed — an orderly is
a bystander, not a combatant, so it has no run/crouch.

Frames live in public/assets/orderly/<anim>/<direction>/<frame>.png.

```ts
type OrderlyAnimName = "idle" | "walk";
```

<a id="type-orderlystate"></a>

#### `OrderlyState` — type *(module-private)*

`src/entities/Orderly.ts:55`

What an orderly is currently doing.

These used to be three implicit booleans (`alerted`, a nullable distract target,
a pause accumulator) whose legal combinations were only knowable by reading the
whole file — which was survivable with one override and stopped being so with
three. The transitions are now stated in `Orderly.think`, once:

 - **WANDER**     — the default: drift near the spawn point on a leash.
 - **INSPECT**    — walking over to look at a knock, then giving up.
 - **SANITATION** — servicing a deployed item: the Sanitation / Containment
                    override, which outranks both of the above.
 - **WITNESSED**  — has seen the player and raised its one alarm. Terminal.

```ts
type OrderlyState = "WANDER" | "INSPECT" | "SANITATION" | "WITNESSED";
```

<a id="type-playeranimname"></a>

#### `PlayerAnimName` — type

`src/entities/PlayerAnimations.ts:16`

**Module note** — the header comment on `src/entities/PlayerAnimations.ts`, which this declaration heads:

Frame manifest for the player character sprite (generated via PixelLab.ai,
"Rowan Ibarra" — high top-down, 88x88, 8-direction template). All 8
directions were exported per animation, so the sprite's facing matches the
free 8-directional movement exactly (no cardinal snapping).

idle/walk/run come from the standing "Rowan Ibarra" character; crouch and
crouch-walk come from a second, dedicated "Rowan Ibarra crouched" character
sheet (same rig/outfit, posed low) — a proper settled kneel for standing
still in cover versus a distinct crouch-sneak stride for moving in it.

Frames live in public/assets/player/<anim>/<direction>/<frame>.png.

```ts
type PlayerAnimName = | "idle" | "walk" | "run" | "crouch" | "crouch-walk" | "crouch-down" | "crouch-up";
```

<a id="type-relayinteractresult"></a>

#### `RelayInteractResult` — type

`src/entities/RoofRelay.ts:68`

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

`src/entities/Player.ts:30`

Standing ⇄ crouched is a small state machine rather than an instant pose
swap: entering/leaving the crouch plays a one-shot lower/rise transition
that must finish before the target stance takes over, so the change reads
as Rowan actually ducking down and standing back up.

```ts
type Stance = "standing" | "crouching-down" | "crouched" | "standing-up";
```

<a id="type-vent4interactresult"></a>

#### `Vent4InteractResult` — type

`src/entities/Vent4Boss.ts:57`

The boss's claim on this frame's interact key, for the scene's dispatcher.

```ts
type Vent4InteractResult = EncounterInteractResult<Vent4Transition>;
```

---

## Map

The `edplay` file format, its in-memory game-side counterpart, and the generators that append levels the shipped map does not contain.

### Map — Constants

<a id="const-generated-levels"></a>

#### `GENERATED_LEVELS` — const

`src/map/types.ts:224`

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

`src/map/EdplayLoader.ts:24`

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

`src/map/generate.ts:31` · `extends Error`

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

### Map — Interfaces

<a id="interface-componentdata"></a>

#### `ComponentData` — interface

`src/map/types.ts:150`

A component instance placed on an entity, with values resolved to defaults.

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `string` |  |
| `values` | `Record<string, string>` |  |

<a id="interface-edanimation"></a>

#### `EdAnimation` — interface

`src/map/types.ts:35`

| Field | Type | Notes |
| --- | --- | --- |
| `KeyFrames` | `EdKeyFrame[]` |  |
| `Rate` | `number` |  |

<a id="interface-edboard"></a>

#### `EdBoard` — interface

`src/map/types.ts:78`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Width` | `number` |  |
| `Height` | `number` |  |
| `Tiles` | `EdTile[]` |  |
| `IsVisible` | `boolean` |  |
| `Id` | `string` |  |

<a id="interface-eddatacomponent"></a>

#### `EdDataComponent` — interface

`src/map/types.ts:45`

| Field | Type | Notes |
| --- | --- | --- |
| `DataType` | `string` |  |
| `Variables` | `EdVariable[]` |  |

<a id="interface-eddatastructure"></a>

#### `EdDataStructure` — interface

`src/map/types.ts:100`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Fields` | `EdField[]` |  |
| `Id` | `string` |  |

<a id="interface-eddatatypes"></a>

#### `EdDataTypes` — interface

`src/map/types.ts:112`

| Field | Type | Notes |
| --- | --- | --- |
| `EnumDefs` | `EdEnumDef[]` |  |
| `DataStructures` | `EdDataStructure[]` |  |

<a id="interface-edenumdef"></a>

#### `EdEnumDef` — interface

`src/map/types.ts:106`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Values` | `{ Name: string; Value: string }[]` |  |
| `Id` | `string` |  |

<a id="interface-edfield"></a>

#### `EdField` — interface

`src/map/types.ts:93`

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

<a id="interface-edlevel"></a>

#### `EdLevel` — interface

`src/map/types.ts:87`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Boards` | `EdBoard[]` |  |
| `Id` | `string` |  |

<a id="interface-edplayfile"></a>

#### `EdPlayFile` — interface

`src/map/types.ts:117`

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

`src/map/types.ts:71`

| Field | Type | Notes |
| --- | --- | --- |
| `X` | `number` |  |
| `Y` | `number` |  |
| `Handle` | `number` |  |
| `BrushId` *(opt)* | `string` |  |

<a id="interface-edtiledef"></a>

#### `EdTileDef` — interface

`src/map/types.ts:50`

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
| `TintColor` *(opt)* | `number` |  |
| `BackgroundColor` *(opt)* | `number` |  |
| `DataComponents` | `EdDataComponent[]` |  |
| `Handle` | `number` |  |
| `Ref` | `string` |  |
| `Id` | `string` |  |

<a id="interface-edvariable"></a>

#### `EdVariable` — interface

`src/map/types.ts:40`

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `string` |  |
| `Values` | `(string \| number \| null)[]` |  |

<a id="interface-gamelayer"></a>

#### `GameLayer` — interface

`src/map/types.ts:180`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` |  |
| `tiles` | `GameTile[]` |  |

<a id="interface-gamelevel"></a>

#### `GameLevel` — interface

`src/map/types.ts:185`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` |  |
| `width` | `number` |  |
| `height` | `number` |  |
| `layers` | `GameLayer[]` | Layers in board (z) order: index 0 draws first / lowest. |

<a id="interface-gamemap"></a>

#### `GameMap` — interface

`src/map/types.ts:193`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` |  |
| `tileWidth` | `number` |  |
| `tileHeight` | `number` |  |
| `levels` | `GameLevel[]` |  |
| `sheetTextureKeys` | `string[]` | Texture keys registered for the three spritesheets, in file order. |

<a id="interface-gametile"></a>

#### `GameTile` — interface

`src/map/types.ts:156`

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
| `entityType` *(opt)* | `string` | Present only for tiles whose TileDef carries a DataComponent. |
| `components` | `ComponentData[]` |  |

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
| `ventCoreHost` | `string \| null` | Level the generated vent-core arena grafts onto, or null to skip generating it — in which case the map simply has no VENT-4 (and so no Q0 compliance cert, since that is the reward for silencing it). |

<a id="interface-parsedmap"></a>

#### `ParsedMap` — interface

`src/map/EdplayLoader.ts:154`

| Field | Type | Notes |
| --- | --- | --- |
| `map` | `GameMap` |  |
| `uniqueFrames` | `SpriteFrame[]` | Every distinct sprite rect used by the map, ready for atlas registration. |

<a id="interface-spriteframe"></a>

#### `SpriteFrame` — interface

`src/map/types.ts:138`

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

`src/map/generate.ts:115`

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |

<a id="interface-transition"></a>

#### `Transition` — interface

`src/map/types.ts:251`

Where a transition tile leads: the destination level and arrival tile.

| Field | Type | Notes |
| --- | --- | --- |
| `toLevel` | `string` |  |
| `toX` | `number` |  |
| `toY` | `number` |  |
| `kind` | `TransitionKind` |  |

<a id="interface-wallrect"></a>

#### `WallRect` — interface

`src/map/TileBake.ts:31`

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

`src/map/TileBake.ts:41`

True when the cell at (x, y) should collide.

```ts
type BlockedAt = (x: number, y: number) => boolean;
```

<a id="type-knownlevel"></a>

#### `KnownLevel` — type

`src/map/types.ts:231`

The level keys the shipped map and its generated additions use, in play order.
Documentation and a spell-check for the few switches that key off a deck — not
a constraint on what a map may name its levels.

```ts
type KnownLevel = | "main1" | "duct1" | "duct2" | "main2" | (typeof GENERATED_LEVELS)[number];
```

<a id="type-transitionkind"></a>

#### `TransitionKind` — type

`src/map/types.ts:248`

Which board a transition tile lives on, which also decides how it triggers:
`stairs` are walked over, `maintenance_access` (hatches/ladders) is entered
with the interact key.

```ts
type TransitionKind = "stairs" | "maintenance_access";
```

---

## Scenes

Phaser scenes and the per-scene helpers `GameScene` delegates to.

### Scenes — Classes

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

`src/scenes/game/DebugOverlay.ts:85`

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
| `setNoClip` | `setNoClip(on: boolean, player: Player): void` | Toggles no-clip by enabling/disabling the player's wall+door colliders. |
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

<a id="class-gameoverscene"></a>

#### `GameOverScene` — class

`src/scenes/GameOverScene.ts:12` · `extends Phaser.Scene`

The failure screen — reached when the mesh runs Rowan down and prunes his
logs. In the fiction this is *Alignment*, the canonical Metal Gear capture
rather than death: the record simply shows that no subject was harmed.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `create` | `create(): void` |  |

<a id="class-gamescene"></a>

#### `GameScene` — class

`src/scenes/GameScene.ts:192` · `extends Phaser.Scene`

The playable scene. Renders one level's tile art in board z-order, builds the
wall collision, spawns the player and guards, and drives the stealth systems
each frame.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor()` |  |
| `init` | `init(data: GameSceneData): void` |  |
| `create` | `create(): void` |  |
| `update` | `update(_time: number, delta: number): void` |  |

*Plus 119 private members.*

<a id="class-noiseevents"></a>

#### `NoiseEvents` — class

`src/scenes/game/NoiseEvents.ts:51`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(private readonly w: NoiseWorld)` |  |
| `emitAt` | `emitAt(cx: number, cy: number, radiusPx: number): void` | Minor investigations (a single noise ping) never broadcast over the alert network — only the individual guard(s) in earshot react. But repeated pings in the same area within a short window are a distraction exploit: once `NoiseSpamTracker` flags spam, skip per-guard investigation entirely and radio it in as a confirmed sighting instead. |
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

`src/scenes/game/SensingContext.ts:44`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(deps: SensingDeps)` |  |
| `setPlayer` | `setPlayer(x: number, y: number, noise: number, vx: number, vy: number): void` | Where the player is, how loud, and how fast — for sensing and search prediction. |
| `setConcealment` | `setConcealment(concealed: boolean, compliant: boolean, thermalConcealed: boolean): void` | @param concealed hidden from vision cones (cover, or the Shared Field). @param compliant reads as staff, so sensing is suppressed outright. @param thermalConcealed hidden from the short-range heat sense as well. |
| `setChaff` | `setChaff(active: boolean, x: number, y: number, radiusPx: number): void` | The live EMP Grenade EMP zone, or `active: false` when none is running. |
| `setAnomalies` | `setAnomalies(anomalies: GuardAnomaly[]): void` | This frame's anomaly list. Borrowed, not copied — see the class doc. |
| `setDeployables` | `setDeployables(lures: readonly DeployedLure[]): void` | This frame's deployed items. Borrowed, not copied — see the class doc. |
| `setRationSpoof` | `setRationSpoof(on: boolean): void` | Whether an opened ration is currently buying tolerance from orderlies. |
| `chaffZone` | `get chaffZone(): { x: number; y: number; radiusPx: number } \| null` | The live chaff zone, for callers that need it outside the context. |
| `current` | `get current(): EnforcerContext` | The context for this frame. Valid only until the next `set*` call. |

*Plus 2 private members.*

<a id="class-titlescene"></a>

#### `TitleScene` — class

`src/scenes/TitleScene.ts:12` · `extends Phaser.Scene`

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
| `update` | `update(): void` |  |

*Plus 13 private members.*

### Scenes — Interfaces

<a id="interface-builtlevel"></a>

#### `BuiltLevel` — interface

`src/scenes/game/LevelBuilder.ts:39`

The live contents of a level, handed back to the scene to drive.

| Field | Type | Notes |
| --- | --- | --- |
| `player` | `Player` |  |
| `guards` | `Enforcer[]` | Enforcers and drones together — they share the same AI. |
| `orderlies` | `Orderly[]` |  |
| `doors` | `Door[]` |  |
| `terminals` | `Terminal[]` |  |
| `sensors` | `Sensor[]` |  |
| `chests` | `Chest[]` |  |
| `lasers` | `Laser[]` |  |
| `coverTiles` | `Cover[]` | Cover tiles the map (or a generator) marks `Destructible` — the rest of the `cover` board stays baked art with no entity, exactly as before. |
| `wallBodies` | `Phaser.GameObjects.GameObject[]` | Static bodies for the walls, merged into as few rectangles as possible. |
| `doorBodies` | `Phaser.GameObjects.GameObject[]` | Arcade bodies for the closed doors, for the player collider. |

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

`src/scenes/game/DebugOverlay.ts:61`

The scene-level effects the cheats reach for.

The colliders are functions rather than references because no-clip toggles
them long after this is constructed, and a captured reference would go stale
the moment the scene rebuilt one.

| Field | Type | Notes |
| --- | --- | --- |
| `lighting` | `Lighting` |  |
| `wallCollider` | `() => Phaser.Physics.Arcade.Collider \| undefined` |  |
| `doorCollider` | `() => Phaser.Physics.Arcade.Collider \| undefined` |  |
| `warpTargets` | `() => string[]` | Level names the warp keys map to, in key order. |
| `warpTo` | `(levelName: string) => void` | Restart the scene on another level. |
| `giveItem` | `(name: string) => void` | Grants one unit of an item, for testing weapons/items without playing to their chest. |

<a id="interface-debugworld"></a>

#### `DebugWorld` — interface

`src/scenes/game/DebugOverlay.ts:39`

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

<a id="interface-gamescenedata"></a>

#### `GameSceneData` — interface *(module-private)*

`src/scenes/GameScene.ts:133`

Data passed to `GameScene` when (re)starting for a level swap.

| Field | Type | Notes |
| --- | --- | --- |
| `level` *(opt)* | `string` |  |
| `arriveX` *(opt)* | `number` |  |
| `arriveY` *(opt)* | `number` |  |

<a id="interface-noiseworld"></a>

#### `NoiseWorld` — interface

`src/scenes/game/NoiseEvents.ts:35`

The live level state noise propagation reads. Held by reference.

| Field | Type | Notes |
| --- | --- | --- |
| `tileSize` | `number` |  |
| `grid` | `CollisionGrid` |  |
| `alert` | `AlertState` |  |
| `noiseSpam` | `NoiseSpamTracker` |  |
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
| `flashlightMultiplier` | `number` | Extra detection multipliers applied on top of the map's lights. |
| `rationMultiplier` | `number` |  |
| `coverTilesNear` | `(tileX: number, tileY: number, radiusTiles: number) => { x: number; y: number }[]` |  |
| `isGuardDoor` | `(tileX: number, tileY: number) => boolean` |  |
| `setDoorOpen` | `(tileX: number, tileY: number, open: boolean) => void` |  |

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

`src/scenes/GameScene.ts:1146`

```ts
type Target = { x: number; y: number; kind: "cover"; cover: Cover } | { x: number; y: number; kind: "orderly"; orderly: Orderly };
```

---

## UI

HUD widgets and DOM overlays. Phaser-drawn HUD pieces and DOM-drawn full-screen views both live here.

### UI — Constants

<a id="const-required-fonts"></a>

#### `REQUIRED_FONTS` — const

`src/ui/fonts.ts:38`

Families that must be resident before any `Text` is drawn.

```ts
const REQUIRED_FONTS = ["Share Tech Mono", "Article Zero Symbols", "Share Tech"] as const;
```

### UI — Classes

<a id="class-alertnetworkhud"></a>

#### `AlertNetworkHud` — class

`src/ui/AlertNetworkHud.ts:21`

A small readout of the base's security network, pinned under the detection
meter (top-left). Shows the network status, how many detectors are online /
alerted / suspicious, and — while combat-aware — how many guards are
converging on the last-known position and the seconds until it relaxes.

Reads the snapshot the scene publishes to the registry; screen-anchored so
the camera zoom doesn't scale it (same pattern as `Hud`).

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(net: AlertNetworkSnapshot): void` |  |

*Plus 2 private members.*

<a id="class-bosscorehud"></a>

#### `BossCoreHud` — class

`src/ui/BossCoreHud.ts:44`

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

`src/ui/ComplianceView.ts:31`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(mount: HTMLElement, puzzle: PuzzleState, callbacks: ComplianceViewCallbacks = {})` |  |
| `destroy` | `destroy(): void` | Detaches the widget and its listeners. Safe to call more than once. |

*Plus 21 private members.*

<a id="class-debughud"></a>

#### `DebugHud` — class

`src/ui/DebugHud.ts:55`

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

`src/ui/EncounterBand.ts:66`

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

<a id="class-hud"></a>

#### `Hud` — class

`src/ui/Hud.ts:21`

Heads-up display. The detection meter is framed as the facility's
**Subjectivity Risk Profile**: being seen means registering as a *subject*, so
the H (Harm/Vulnerability) and Y (Yield) axes climb while Q (Qualia) stays
pinned at 0 by the Non-Subject Status Act. A second bar tracks Rowan's
bio-integrity (health). Pinned to the camera; runs in the parallel UIScene.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update( alert: { phase: AlertPhase }, detection: number, hp: number, maxHp: number, conduct?: ConductView, ): void` |  |

*Plus 7 private members.*

<a id="class-inventoryhud"></a>

#### `InventoryHud` — class

`src/ui/InventoryHud.ts:22`

A compact inventory readout pinned to the bottom-right of the screen, in three
sections: the held CONSUMABLES mapped to hotkeys [1]–[4] (with counts and, for
timed buffs, their remaining duration), the flashlight EQUIPMENT state, and
passive KEY ITEMS. Purely a display — it reads the inventory/active-item state
the scene publishes to the registry; GameScene owns spending the items.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(items: string[], active: ActiveItemsView): void` |  |

*Plus 2 private members.*

<a id="class-lighting"></a>

#### `Lighting` — class

`src/ui/Lighting.ts:159`

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
| `destroy` | `destroy(): void` | Releases everything this overlay owns. Call on scene shutdown. The stamps are the reason this has to exist. They are built with `scene.make.image({ add: false })` — deliberately, because they are erase brushes stamped into a RenderTexture rather than things the camera should draw — but the cost of staying off the display list is that `Scene.shutdown` never sees them, and so never destroys them. Every level transition is a `scene.restart()` that constructs a fresh `Lighting`, so without this each swap orphaned one stamp per light source (49 of them on `main1`) plus the cone and the player's pool, for the life of the session. `rt` and `shadowGfx` *are* on the display list and would be collected anyway; destroying them here too keeps the ownership in one place rather than split between this class and Phaser's bookkeeping. |
| `setEnabled` | `setEnabled(on: boolean): void` | Debug switch: hides the whole overlay so the level can be read at full brightness. Re-enabling rebuilds both layers, since they went stale while off. |

*Plus 32 private members.*

<a id="class-menu"></a>

#### `Menu` — class

`src/ui/Menu.ts:20`

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

`src/ui/ObjectiveHud.ts:16`

A compact objective tracker pinned to the top-centre of the screen. Reads the
objective state the scene publishes to the registry and renders each line with
a ✓/○ marker; turns green once the whole directive is complete.

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(scene: Phaser.Scene)` |  |
| `update` | `update(state: ObjectiveState, currentLevel: string, features: MissionFeatures): void` |  |

*Plus 3 private members.*

<a id="class-pausemenuview"></a>

#### `PauseMenuView` — class

`src/ui/PauseMenuView.ts:98`

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

<a id="class-qualialockview"></a>

#### `QualiaLockView` — class

`src/ui/QualiaLockView.ts:68`

| Member | Signature | Notes |
| --- | --- | --- |
| `constructor` | `constructor(mount: HTMLElement, round: QualiaRound, callbacks: QualiaLockViewCallbacks = {})` |  |
| `destroy` | `destroy(): void` | Detaches the widget, its RAF loop, and its listeners. Idempotent. |

*Plus 36 private members.*

<a id="class-radar"></a>

#### `Radar` — class

`src/ui/Radar.ts:31`

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

*Plus 12 private members.*

<a id="class-relayhud"></a>

#### `RelayHud` — class

`src/ui/RelayHud.ts:23`

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

`src/ui/SharedFieldHud.ts:17`

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

`src/ui/Vent4Hud.ts:21`

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

`src/ui/ComplianceView.ts:24`

| Field | Type | Notes |
| --- | --- | --- |
| `onSolved` *(opt)* | `(finalText: string) => void` | Fired when the player transmits a solved log. Receives the final text. |
| `onClose` *(opt)* | `() => void` | Fired when the player aborts (Esc / ABORT) without solving. |

<a id="interface-conestyle"></a>

#### `ConeStyle` — interface

`src/ui/VisionCone.ts:28`

| Field | Type | Notes |
| --- | --- | --- |
| `color` | `number` | Fill while the cone is idle. |
| `alpha` | `number` |  |
| `hotColor` | `number` | Fill once detection passes `CONE_HOT_THRESHOLD`. |
| `hotAlpha` | `number` |  |

<a id="interface-controlbinding"></a>

#### `ControlBinding` — interface

`src/ui/Controls.ts:13`

**Module note** — the header comment on `src/ui/Controls.ts`, which this declaration heads:

The keybinding list, in one place.

It was previously written out twice — once as a hardcoded string in the HUD's
bottom-left hint (`Hud.ts`) and once in the README's controls table — with the
pause menu's CONTROLS tab about to make three. The hint had already drifted
once. `GameScene.bindInput()` remains the place keys are actually *bound*; this
is the place they are *described*, and the two are checked against each other
by eye at review time rather than by a mechanism, because Phaser gives no
enumerable view of a scene's bindings.

| Field | Type | Notes |
| --- | --- | --- |
| `key` | `string` |  |
| `action` | `string` |  |
| `hint` *(opt)* | `string` | Terse form for the HUD's single-line hint; omitted keys stay off it. |

<a id="interface-debugsnapshot"></a>

#### `DebugSnapshot` — interface

`src/ui/DebugHud.ts:16`

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

`src/ui/DebugHud.ts:7`

A named unit and its current detection level (0..1).

| Field | Type | Notes |
| --- | --- | --- |
| `label` | `string` |  |
| `detection` | `number` |  |

<a id="interface-encounterbandframe"></a>

#### `EncounterBandFrame` — interface

`src/ui/EncounterBand.ts:29`

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

`src/ui/EncounterBand.ts:17`

| Field | Type | Notes |
| --- | --- | --- |
| `barW` | `number` | Bar width in pixels. |
| `fillColor` | `number` | Fill colour while nothing overrides it. |
| `bannerColor` | `number` | Banner text colour. |
| `wash` *(opt)* | `{ color: number; alpha: number }` | Optional full-screen wash this encounter breathes during its worst phase. |

<a id="interface-flashlightbeam"></a>

#### `FlashlightBeam` — interface

`src/ui/Lighting.ts:125`

The player's flashlight beam, or null when it isn't emitting.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `facing` | `number` | Facing angle in radians. |

<a id="interface-light"></a>

#### `Light` — interface *(module-private)*

`src/ui/Lighting.ts:114`

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |
| `radiusPx` | `number` |  |
| `flicker` | `boolean` |  |
| `phase` | `number` |  |
| `stamp` | `Phaser.GameObjects.Image` | The stamp erased at this light. One per light so all of them batch together. |

<a id="interface-menuitem"></a>

#### `MenuItem` — interface

`src/ui/Menu.ts:8`

| Field | Type | Notes |
| --- | --- | --- |
| `label` | `string` |  |
| `onSelect` | `() => void` |  |
| `enabled` *(opt)* | `boolean` | A disabled item is dimmed and skipped by navigation/selection. |

<a id="interface-palette"></a>

#### `Palette` — interface *(module-private)*

`src/ui/MiniMapCanvas.ts:17`

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

`src/ui/PauseMenuView.ts:68`

One tab's content, plus its share of the keyboard.

| Field | Type | Notes |
| --- | --- | --- |
| `node` | `HTMLElement` |  |
| `onKey` *(opt)* | `onKey?(e: KeyboardEvent): boolean` | Returns whether the key was consumed. |
| `onShow` *(opt)* | `onShow?(): void` | Called when the tab is shown — panes that measure themselves need it. |

<a id="interface-pausecallbacks"></a>

#### `PauseCallbacks` — interface

`src/ui/PauseMenuView.ts:59`

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

`src/ui/PauseMenuView.ts:38`

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

`src/ui/QualiaLockView.ts:32`

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

<a id="interface-sharedfieldview"></a>

#### `SharedFieldView` — interface

`src/ui/SharedFieldHud.ts:6`

| Field | Type | Notes |
| --- | --- | --- |
| `charge` | `number` |  |
| `active` | `number` |  |
| `ready` | `boolean` |  |

<a id="interface-tribunalcallbacks"></a>

#### `TribunalCallbacks` — interface

`src/ui/TribunalScreen.ts:46`

| Field | Type | Notes |
| --- | --- | --- |
| `onContinue` | `() => void` | The player acknowledged the record — [Esc] or [Space]. |

### UI — Type aliases

<a id="type-rgb"></a>

#### `RGB` — type *(module-private)*

`src/ui/QualiaLockView.ts:47`

```ts
type RGB = [number, number, number];
```

---

## Tools

Offline build tooling — currently the sprite-collider generator.

### Tools — Interfaces

<a id="interface-aabb"></a>

#### `AABB` — interface

`src/tools/collider/format.ts:15`

| Field | Type | Notes |
| --- | --- | --- |
| `width` | `number` | Body width in pixels (Arcade `body.setSize`). |
| `height` | `number` | Body height in pixels. |
| `offsetX` | `number` | Left edge in unscaled sprite-local pixels (Arcade `body.setOffset`). |
| `offsetY` | `number` | Top edge in unscaled sprite-local pixels. |

<a id="interface-args"></a>

#### `Args` — interface *(module-private)*

`src/tools/collider/generate.ts:28`

| Field | Type | Notes |
| --- | --- | --- |
| `input` | `string` |  |
| `out` | `string` |  |
| `exportName` | `string` |  |
| `epsilon` | `number` |  |
| `inset` | `number` |  |
| `origin` | `Origin` |  |
| `threshold` | `number` |  |
| `verbose` | `boolean` |  |

<a id="interface-decodedimage"></a>

#### `DecodedImage` — interface

`src/tools/collider/png.ts:13`

| Field | Type | Notes |
| --- | --- | --- |
| `width` | `number` |  |
| `height` | `number` |  |
| `data` | `Uint8Array` | RGBA, 4 bytes per pixel, row-major (top-left origin). |

<a id="interface-framesize"></a>

#### `FrameSize` — interface

`src/tools/collider/format.ts:28`

| Field | Type | Notes |
| --- | --- | --- |
| `width` | `number` |  |
| `height` | `number` |  |

<a id="interface-mask"></a>

#### `Mask` — interface

`src/tools/collider/contour.ts:14`

| Field | Type | Notes |
| --- | --- | --- |
| `width` | `number` |  |
| `height` | `number` |  |
| `data` | `Uint8Array` | 1 = foreground (opaque), 0 = background (transparent). |

<a id="interface-point"></a>

#### `Point` — interface

`src/tools/collider/rdp.ts:12`

**Module note** — the header comment on `src/tools/collider/rdp.ts`, which this declaration heads:

Ramer–Douglas–Peucker polyline simplification.

Part of the Article Zero collider generator: after the alpha silhouette of a
sprite is traced into a dense boundary path, RDP drops the vertices that lie
(within `epsilon` perpendicular pixels) on a straight run, leaving a compact
polygon that is cheap for physics/line-of-sight to reason about. A larger
`epsilon` yields fewer vertices. Pure, dependency-free, browser-safe.

| Field | Type | Notes |
| --- | --- | --- |
| `x` | `number` |  |
| `y` | `number` |  |

### Tools — Type aliases

<a id="type-origin"></a>

#### `Origin` — type

`src/tools/collider/format.ts:26`

```ts
type Origin = "top-left" | "center";
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

`src/main.ts:38` · `extends Phaser.Scene`

Boot scene: loads the edplay map JSON and the three spritesheets, parses the
map into the normalized model, stashes it in the registry, then hands off to
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
| [AABB](#interface-aabb) | interface | `src/tools/collider/format.ts:15` |
| [ActiveItemState](#class-activeitemstate) | class | `src/systems/ActiveItems.ts:29` |
| [ActiveItemsView](#interface-activeitemsview) | interface | `src/systems/ActiveItems.ts:134` |
| [AlertNetworkHud](#class-alertnetworkhud) | class | `src/ui/AlertNetworkHud.ts:21` |
| [AlertNetworkSnapshot](#interface-alertnetworksnapshot) | interface | `src/systems/AlertNetwork.ts:11` |
| [AlertPhase](#type-alertphase) | type | `src/systems/AlertState.ts:13` |
| [AlertState](#class-alertstate) | class | `src/systems/AlertState.ts:21` |
| [AppliedCorrections](#type-appliedcorrections) | type | `src/systems/Compliance.ts:64` |
| [Args](#interface-args) | interface | `src/tools/collider/generate.ts:28` |
| [AudioDirector](#class-audiodirector) | class | `src/systems/AudioDirector.ts:26` |
| [BinaryHeap](#class-binaryheap) | class | `src/systems/Pathfinder.ts:259` |
| [BlockedAt](#type-blockedat) | type | `src/map/TileBake.ts:41` |
| [BootScene](#class-bootscene) | class | `src/main.ts:38` |
| [BossCore](#class-bosscore) | class | `src/entities/BossCore.ts:64` |
| [BossCoreHud](#class-bosscorehud) | class | `src/ui/BossCoreHud.ts:44` |
| [BuiltLevel](#interface-builtlevel) | interface | `src/scenes/game/LevelBuilder.ts:39` |
| [Chest](#class-chest) | class | `src/entities/Chest.ts:16` |
| [CHEST_DEFAULTS](#const-chest-defaults) | const | `src/systems/EntityStats.ts:259` |
| [ChestStats](#interface-cheststats) | interface | `src/systems/EntityStats.ts:250` |
| [CodecContext](#interface-codeccontext) | interface | `src/ui/Codec.ts:28` |
| [CodecData](#interface-codecdata) | interface | `src/scenes/CodecScene.ts:15` |
| [CodecScene](#class-codecscene) | class | `src/scenes/CodecScene.ts:37` |
| [CollisionGrid](#class-collisiongrid) | class | `src/systems/CollisionGrid.ts:60` |
| [ComplianceBand](#type-complianceband) | type | `src/systems/Vent4Core.ts:25` |
| [ComplianceData](#interface-compliancedata) | interface | `src/scenes/ComplianceScene.ts:8` |
| [ComplianceResult](#interface-complianceresult) | interface | `src/systems/Compliance.ts:67` |
| [ComplianceScene](#class-compliancescene) | class | `src/scenes/ComplianceScene.ts:23` |
| [ComplianceView](#class-complianceview) | class | `src/ui/ComplianceView.ts:31` |
| [ComplianceViewCallbacks](#interface-complianceviewcallbacks) | interface | `src/ui/ComplianceView.ts:24` |
| [ComponentData](#interface-componentdata) | interface | `src/map/types.ts:150` |
| [ConductBreach](#type-conductbreach) | type | `src/systems/Conduct.ts:26` |
| [ConductInput](#interface-conductinput) | interface | `src/systems/Conduct.ts:46` |
| [ConductMetrics](#interface-conductmetrics) | interface | `src/systems/Conduct.ts:95` |
| [ConductState](#class-conductstate) | class | `src/systems/Conduct.ts:112` |
| [ConductView](#interface-conductview) | interface | `src/systems/Conduct.ts:246` |
| [ConeStyle](#interface-conestyle) | interface | `src/ui/VisionCone.ts:28` |
| [CONSUMABLE_ORDER](#const-consumable-order) | const | `src/systems/EntityStats.ts:467` |
| [ConsumableSlot](#interface-consumableslot) | interface | `src/systems/EntityStats.ts:506` |
| [ControlBinding](#interface-controlbinding) | interface | `src/ui/Controls.ts:13` |
| [Correction](#interface-correction) | interface | `src/systems/Compliance.ts:35` |
| [Cover](#class-cover) | class | `src/entities/Cover.ts:16` |
| [DebugHost](#interface-debughost) | interface | `src/scenes/game/DebugOverlay.ts:61` |
| [DebugHud](#class-debughud) | class | `src/ui/DebugHud.ts:55` |
| [DebugOverlay](#class-debugoverlay) | class | `src/scenes/game/DebugOverlay.ts:85` |
| [DebugSnapshot](#interface-debugsnapshot) | interface | `src/ui/DebugHud.ts:16` |
| [DebugUnitView](#interface-debugunitview) | interface | `src/ui/DebugHud.ts:7` |
| [DebugWorld](#interface-debugworld) | interface | `src/scenes/game/DebugOverlay.ts:39` |
| [DecodedImage](#interface-decodedimage) | interface | `src/tools/collider/png.ts:13` |
| [DeployableKind](#type-deployablekind) | type | `src/systems/Deployables.ts:22` |
| [DeployedItem](#class-deployeditem) | class | `src/entities/DeployedItem.ts:17` |
| [DeployedLure](#interface-deployedlure) | interface | `src/systems/Deployables.ts:32` |
| [DetectionSystem](#class-detectionsystem) | class | `src/systems/DetectionSystem.ts:34` |
| [DetectionWorld](#interface-detectionworld) | interface | `src/systems/Sensing.ts:67` |
| [Dir8](#type-dir8) | type | `src/entities/directions.ts:31` |
| [DIRS_8](#const-dirs-8) | const | `src/entities/directions.ts:20` |
| [Door](#class-door) | class | `src/entities/Door.ts:27` |
| [DOOR_DEFAULTS](#const-door-defaults) | const | `src/systems/EntityStats.ts:152` |
| [DoorStats](#interface-doorstats) | interface | `src/systems/EntityStats.ts:143` |
| [Drone](#class-drone) | class | `src/entities/Drone.ts:13` |
| [DRONE_PATROL_SOUTH_COLLIDER](#const-drone-patrol-south-collider) | const | `src/entities/generated/droneCollider.ts:32` |
| [EdAnimation](#interface-edanimation) | interface | `src/map/types.ts:35` |
| [EdBoard](#interface-edboard) | interface | `src/map/types.ts:78` |
| [EdDataComponent](#interface-eddatacomponent) | interface | `src/map/types.ts:45` |
| [EdDataStructure](#interface-eddatastructure) | interface | `src/map/types.ts:100` |
| [EdDataTypes](#interface-eddatatypes) | interface | `src/map/types.ts:112` |
| [EdEnumDef](#interface-edenumdef) | interface | `src/map/types.ts:106` |
| [EdField](#interface-edfield) | interface | `src/map/types.ts:93` |
| [EdKeyFrame](#interface-edkeyframe) | interface | `src/map/types.ts:27` |
| [EdLevel](#interface-edlevel) | interface | `src/map/types.ts:87` |
| [EdPlayFile](#interface-edplayfile) | interface | `src/map/types.ts:117` |
| [EdplayLoader](#class-edplayloader) | class | `src/map/EdplayLoader.ts:24` |
| [EdSpriteRect](#interface-edspriterect) | interface | `src/map/types.ts:9` |
| [EdSpriteSheet](#interface-edspritesheet) | interface | `src/map/types.ts:18` |
| [EdTile](#interface-edtile) | interface | `src/map/types.ts:71` |
| [EdTileDef](#interface-edtiledef) | interface | `src/map/types.ts:50` |
| [EdVariable](#interface-edvariable) | interface | `src/map/types.ts:40` |
| [EncounterBand](#class-encounterband) | class | `src/ui/EncounterBand.ts:66` |
| [EncounterBandFrame](#interface-encounterbandframe) | interface | `src/ui/EncounterBand.ts:29` |
| [EncounterBandStyle](#interface-encounterbandstyle) | interface | `src/ui/EncounterBand.ts:17` |
| [EncounterInteractResult](#interface-encounterinteractresult) | interface | `src/entities/EncounterTypes.ts:11` |
| [Encounters](#class-encounters) | class | `src/scenes/game/Encounters.ts:70` |
| [EncountersCallbacks](#interface-encounterscallbacks) | interface | `src/scenes/game/Encounters.ts:50` |
| [Enforcer](#class-enforcer) | class | `src/entities/Enforcer.ts:168` |
| [ENFORCER_PATROL_SOUTH_COLLIDER](#const-enforcer-patrol-south-collider) | const | `src/entities/generated/enforcerCollider.ts:32` |
| [EnforcerContext](#interface-enforcercontext) | interface | `src/entities/Enforcer.ts:57` |
| [EnforcerFireResult](#interface-enforcerfireresult) | interface | `src/entities/Enforcer.ts:36` |
| [EnforcerStats](#interface-enforcerstats) | interface | `src/systems/EntityStats.ts:34` |
| [ExploredMap](#class-exploredmap) | class | `src/systems/Explored.ts:16` |
| [ExploredState](#type-exploredstate) | type | `src/systems/Explored.ts:74` |
| [Eye](#interface-eye) | interface | `src/systems/Sensing.ts:20` |
| [FlashlightBeam](#interface-flashlightbeam) | interface | `src/ui/Lighting.ts:125` |
| [FollowResult](#type-followresult) | type | `src/entities/Enforcer.ts:154` |
| [FrameSize](#interface-framesize) | interface | `src/tools/collider/format.ts:28` |
| [GameLayer](#interface-gamelayer) | interface | `src/map/types.ts:180` |
| [GameLevel](#interface-gamelevel) | interface | `src/map/types.ts:185` |
| [GameMap](#interface-gamemap) | interface | `src/map/types.ts:193` |
| [GameMode](#type-gamemode) | type | `src/systems/GameState.ts:20` |
| [GameOverScene](#class-gameoverscene) | class | `src/scenes/GameOverScene.ts:12` |
| [GameScene](#class-gamescene) | class | `src/scenes/GameScene.ts:192` |
| [GameSceneData](#interface-gamescenedata) | interface | `src/scenes/GameScene.ts:133` |
| [GameTile](#interface-gametile) | interface | `src/map/types.ts:156` |
| [GENERATED_LEVELS](#const-generated-levels) | const | `src/map/types.ts:224` |
| [GlassStats](#interface-glassstats) | interface | `src/systems/EntityStats.ts:173` |
| [GuardAnomaly](#interface-guardanomaly) | interface | `src/entities/Enforcer.ts:45` |
| [GuardSkin](#interface-guardskin) | interface | `src/entities/GuardSkin.ts:11` |
| [GuardSkinSpec](#interface-guardskinspec) | interface | `src/entities/GuardSkin.ts:62` |
| [GuardState](#type-guardstate) | type | `src/entities/Enforcer.ts:33` |
| [HoldFixture](#class-holdfixture) | class | `src/entities/HoldFixture.ts:24` |
| [HoldTarget](#class-holdtarget) | class | `src/entities/HoldTarget.ts:35` |
| [Hud](#class-hud) | class | `src/ui/Hud.ts:21` |
| [InputState](#interface-inputstate) | interface | `src/entities/Player.ts:275` |
| [InventoryHud](#class-inventoryhud) | class | `src/ui/InventoryHud.ts:22` |
| [Investigation](#interface-investigation) | interface | `src/entities/Enforcer.ts:115` |
| [ItemInfo](#interface-iteminfo) | interface | `src/systems/ItemCatalog.ts:46` |
| [JournalEntry](#interface-journalentry) | interface | `src/systems/Journal.ts:42` |
| [JournalEntryId](#type-journalentryid) | type | `src/systems/Journal.ts:23` |
| [JournalState](#interface-journalstate) | interface | `src/systems/Journal.ts:337` |
| [Kind](#type-kind) | type | `src/entities/Vent4Boss.ts:301` |
| [KnownLevel](#type-knownlevel) | type | `src/map/types.ts:231` |
| [Laser](#class-laser) | class | `src/entities/Laser.ts:28` |
| [LaserKind](#type-laserkind) | type | `src/entities/Laser.ts:21` |
| [LexiconCategory](#type-lexiconcategory) | type | `src/systems/Lexicon.ts:19` |
| [LexiconContext](#interface-lexiconcontext) | interface | `src/systems/Lexicon.ts:257` |
| [LexiconEntry](#interface-lexiconentry) | interface | `src/systems/Lexicon.ts:30` |
| [Light](#interface-light) | interface | `src/ui/Lighting.ts:114` |
| [Lighting](#class-lighting) | class | `src/ui/Lighting.ts:159` |
| [LightSource](#interface-lightsource) | interface | `src/systems/DetectionSystem.ts:4` |
| [LightStats](#interface-lightstats) | interface | `src/systems/EntityStats.ts:65` |
| [LogToken](#interface-logtoken) | interface | `src/systems/Compliance.ts:20` |
| [LureSpec](#interface-lurespec) | interface | `src/systems/Deployables.ts:49` |
| [LureWorld](#interface-lureworld) | interface | `src/systems/Deployables.ts:70` |
| [MANUAL_SLOTS](#const-manual-slots) | const | `src/systems/SaveGame.ts:29` |
| [MapPlan](#interface-mapplan) | interface | `src/map/MapPlan.ts:19` |
| [MapSnapshot](#interface-mapsnapshot) | interface | `src/systems/PauseState.ts:36` |
| [Mask](#interface-mask) | interface | `src/tools/collider/contour.ts:14` |
| [MemStorage](#class-memstorage) | class | `src/testing/memStorage.ts:8` |
| [Menu](#class-menu) | class | `src/ui/Menu.ts:20` |
| [MenuItem](#interface-menuitem) | interface | `src/ui/Menu.ts:8` |
| [MissingProto](#class-missingproto) | class | `src/map/generate.ts:31` |
| [MissionFeatures](#interface-missionfeatures) | interface | `src/systems/Objectives.ts:70` |
| [MoveResult](#interface-moveresult) | interface | `src/systems/GridMotion.ts:26` |
| [MusicMood](#type-musicmood) | type | `src/systems/AudioDirector.ts:17` |
| [NetworkUnit](#interface-networkunit) | interface | `src/systems/AlertNetwork.ts:5` |
| [NoiseEvents](#class-noiseevents) | class | `src/scenes/game/NoiseEvents.ts:51` |
| [NoiseSpamTracker](#class-noisespamtracker) | class | `src/systems/AlertNetwork.ts:78` |
| [NoiseWorld](#interface-noiseworld) | interface | `src/scenes/game/NoiseEvents.ts:35` |
| [ObjectiveHud](#class-objectivehud) | class | `src/ui/ObjectiveHud.ts:16` |
| [ObjectiveLine](#interface-objectiveline) | interface | `src/systems/Objectives.ts:166` |
| [ObjectiveState](#interface-objectivestate) | interface | `src/systems/Objectives.ts:20` |
| [OpenablePredicate](#type-openablepredicate) | type | `src/systems/GridMotion.ts:41` |
| [Orderly](#class-orderly) | class | `src/entities/Orderly.ts:88` |
| [OrderlyAnimName](#type-orderlyanimname) | type | `src/entities/OrderlyAnimations.ts:12` |
| [OrderlyContext](#interface-orderlycontext) | interface | `src/entities/Orderly.ts:22` |
| [OrderlyState](#type-orderlystate) | type | `src/entities/Orderly.ts:55` |
| [Origin](#type-origin) | type | `src/tools/collider/format.ts:26` |
| [OverlayConfig](#interface-overlayconfig) | interface | `src/scenes/game/OverlayGate.ts:21` |
| [OverlayGate](#class-overlaygate) | class | `src/scenes/game/OverlayGate.ts:32` |
| [OverlayId](#type-overlayid) | type | `src/scenes/game/OverlayGate.ts:19` |
| [Palette](#interface-palette) | interface | `src/ui/MiniMapCanvas.ts:17` |
| [Pane](#interface-pane) | interface | `src/ui/PauseMenuView.ts:68` |
| [ParsedMap](#interface-parsedmap) | interface | `src/map/EdplayLoader.ts:154` |
| [PathNode](#interface-pathnode) | interface | `src/systems/Pathfinder.ts:22` |
| [PathOptions](#interface-pathoptions) | interface | `src/systems/Pathfinder.ts:27` |
| [PatrolRoute](#type-patrolroute) | type | `src/systems/PatrolRoute.ts:26` |
| [PauseCallbacks](#interface-pausecallbacks) | interface | `src/ui/PauseMenuView.ts:59` |
| [PauseMenuView](#class-pausemenuview) | class | `src/ui/PauseMenuView.ts:98` |
| [PauseRequest](#type-pauserequest) | type | `src/systems/PauseState.ts:29` |
| [PauseScene](#class-pausescene) | class | `src/scenes/PauseScene.ts:32` |
| [PauseSnapshot](#interface-pausesnapshot) | interface | `src/ui/PauseMenuView.ts:38` |
| [Player](#class-player) | class | `src/entities/Player.ts:32` |
| [PLAYER_IDLE_SOUTH_COLLIDER](#const-player-idle-south-collider) | const | `src/entities/generated/playerCollider.ts:32` |
| [PlayerAnimName](#type-playeranimname) | type | `src/entities/PlayerAnimations.ts:16` |
| [PlayerParams](#interface-playerparams) | interface | `src/systems/QualiaLock.ts:34` |
| [PlayerStats](#interface-playerstats) | interface | `src/systems/EntityStats.ts:282` |
| [Point](#interface-point) | interface | `src/tools/collider/rdp.ts:12` |
| [PressureSubStation](#class-pressuresubstation) | class | `src/entities/PressureSubStation.ts:17` |
| [PuzzleState](#interface-puzzlestate) | interface | `src/systems/Compliance.ts:50` |
| [QualiaLockConfig](#interface-qualialockconfig) | interface | `src/systems/QualiaLock.ts:46` |
| [QualiaLockData](#interface-qualialockdata) | interface | `src/scenes/QualiaLockScene.ts:8` |
| [QualiaLockScene](#class-qualialockscene) | class | `src/scenes/QualiaLockScene.ts:25` |
| [QualiaLockState](#interface-qualialockstate) | interface | `src/systems/QualiaLock.ts:73` |
| [QualiaLockView](#class-qualialockview) | class | `src/ui/QualiaLockView.ts:68` |
| [QualiaLockViewCallbacks](#interface-qualialockviewcallbacks) | interface | `src/ui/QualiaLockView.ts:32` |
| [QualiaRound](#interface-qualiaround) | interface | `src/systems/QualiaLock.ts:251` |
| [QualiaStatus](#type-qualiastatus) | type | `src/systems/QualiaLock.ts:40` |
| [RackCandidate](#interface-rackcandidate) | interface | `src/systems/QualiaLock.ts:273` |
| [Radar](#class-radar) | class | `src/ui/Radar.ts:31` |
| [RadarBlip](#interface-radarblip) | interface | `src/systems/Radar.ts:8` |
| [RadarSnapshot](#interface-radarsnapshot) | interface | `src/systems/Radar.ts:33` |
| [RadarUnit](#interface-radarunit) | interface | `src/systems/Radar.ts:17` |
| [Range](#type-range) | type | `src/systems/QualiaLock.ts:43` |
| [RayDirections](#interface-raydirections) | interface | `src/systems/Visibility.ts:40` |
| [RelayCore](#class-relaycore) | class | `src/systems/RelayCore.ts:75` |
| [RelayHud](#class-relayhud) | class | `src/ui/RelayHud.ts:23` |
| [RelayInteractResult](#type-relayinteractresult) | type | `src/entities/RoofRelay.ts:68` |
| [RelayMsg](#interface-relaymsg) | interface | `src/systems/RelayCore.ts:46` |
| [RelaySnapshot](#interface-relaysnapshot) | interface | `src/systems/RelayCore.ts:40` |
| [RelayState](#enum-relaystate) | enum | `src/systems/RelayCore.ts:18` |
| [RelayStats](#interface-relaystats) | interface | `src/systems/EntityStats.ts:727` |
| [RelayTickResult](#interface-relaytickresult) | interface | `src/entities/RoofRelay.ts:56` |
| [RelayTransition](#interface-relaytransition) | interface | `src/systems/RelayCore.ts:35` |
| [RelayView](#interface-relayview) | interface | `src/systems/RelayCore.ts:55` |
| [REQUIRED_FONTS](#const-required-fonts) | const | `src/ui/fonts.ts:38` |
| [RGB](#type-rgb) | type | `src/ui/QualiaLockView.ts:47` |
| [RoofRelay](#class-roofrelay) | class | `src/entities/RoofRelay.ts:70` |
| [RUN_KEYS](#const-run-keys) | const | `src/systems/GameState.ts:42` |
| [SaveData](#interface-savedata) | interface | `src/systems/SaveGame.ts:34` |
| [SavePayload](#type-savepayload) | type | `src/systems/SaveGame.ts:53` |
| [SelectList](#class-selectlist) | class | `src/ui/SelectList.ts:29` |
| [SelectListRow](#interface-selectlistrow) | interface | `src/ui/SelectList.ts:18` |
| [SensingContext](#class-sensingcontext) | class | `src/scenes/game/SensingContext.ts:44` |
| [SensingDeps](#interface-sensingdeps) | interface | `src/scenes/game/SensingContext.ts:25` |
| [SensingWorld](#interface-sensingworld) | interface | `src/systems/Sensing.ts:55` |
| [Sensor](#class-sensor) | class | `src/entities/Sensor.ts:26` |
| [SensorStats](#interface-sensorstats) | interface | `src/systems/EntityStats.ts:211` |
| [Settings](#interface-settings) | interface | `src/systems/Settings.ts:13` |
| [SharedField](#class-sharedfield) | class | `src/systems/SharedField.ts:22` |
| [SharedFieldHud](#class-sharedfieldhud) | class | `src/ui/SharedFieldHud.ts:17` |
| [SharedFieldView](#interface-sharedfieldview) | interface | `src/ui/SharedFieldHud.ts:6` |
| [SlotId](#type-slotid) | type | `src/systems/SaveGame.ts:26` |
| [SmacCore](#class-smaccore) | class | `src/systems/SmacCore.ts:118` |
| [SmacCorrection](#interface-smaccorrection) | interface | `src/systems/SmacCore.ts:78` |
| [SmacInteractResult](#type-smacinteractresult) | type | `src/entities/BossCore.ts:62` |
| [SmacMsg](#interface-smacmsg) | interface | `src/systems/SmacCore.ts:72` |
| [SmacSnapshot](#interface-smacsnapshot) | interface | `src/systems/SmacCore.ts:63` |
| [SmacState](#enum-smacstate) | enum | `src/systems/SmacCore.ts:38` |
| [SmacStats](#interface-smacstats) | interface | `src/systems/EntityStats.ts:655` |
| [SmacTickResult](#interface-smactickresult) | interface | `src/entities/BossCore.ts:56` |
| [SmacTransition](#interface-smactransition) | interface | `src/systems/SmacCore.ts:57` |
| [SmacView](#interface-smacview) | interface | `src/systems/SmacCore.ts:94` |
| [SpriteAtlas](#class-spriteatlas) | class | `src/map/SpriteAtlas.ts:12` |
| [SpriteCollider](#interface-spritecollider) | interface | `src/entities/generated/droneCollider.ts:6` |
| [SpriteCollider](#interface-spritecollider-2) | interface | `src/entities/generated/enforcerCollider.ts:6` |
| [SpriteCollider](#interface-spritecollider-3) | interface | `src/entities/generated/playerCollider.ts:6` |
| [SpriteFrame](#interface-spriteframe) | interface | `src/map/types.ts:138` |
| [Stance](#type-stance) | type | `src/entities/Player.ts:30` |
| [SteamJet](#interface-steamjet) | interface | `src/entities/Vent4Boss.ts:59` |
| [Target](#type-target) | type | `src/scenes/GameScene.ts:1146` |
| [Terminal](#class-terminal) | class | `src/entities/Terminal.ts:16` |
| [TERMINAL_DEFAULTS](#const-terminal-defaults) | const | `src/systems/EntityStats.ts:199` |
| [TerminalStats](#interface-terminalstats) | interface | `src/systems/EntityStats.ts:190` |
| [TilePos](#interface-tilepos) | interface | `src/map/generate.ts:115` |
| [TitleScene](#class-titlescene) | class | `src/scenes/TitleScene.ts:12` |
| [Transition](#interface-transition) | interface | `src/map/types.ts:251` |
| [TransitionGraph](#class-transitiongraph) | class | `src/systems/TransitionGraph.ts:27` |
| [TransitionKind](#type-transitionkind) | type | `src/map/types.ts:248` |
| [TribunalCallbacks](#interface-tribunalcallbacks) | interface | `src/ui/TribunalScreen.ts:46` |
| [TribunalScene](#class-tribunalscene) | class | `src/scenes/TribunalScene.ts:19` |
| [TribunalScreen](#class-tribunalscreen) | class | `src/ui/TribunalScreen.ts:51` |
| [UIScene](#class-uiscene) | class | `src/scenes/UIScene.ts:34` |
| [Vec2](#interface-vec2) | interface | `src/systems/Vent4PhysicsSystem.ts:15` |
| [Vent4Boss](#class-vent4boss) | class | `src/entities/Vent4Boss.ts:79` |
| [Vent4Core](#class-vent4core) | class | `src/systems/Vent4Core.ts:67` |
| [Vent4Forces](#interface-vent4forces) | interface | `src/systems/Vent4PhysicsSystem.ts:31` |
| [Vent4Hud](#class-vent4hud) | class | `src/ui/Vent4Hud.ts:21` |
| [Vent4InteractResult](#type-vent4interactresult) | type | `src/entities/Vent4Boss.ts:57` |
| [Vent4Layout](#interface-vent4layout) | interface | `src/systems/Vent4PhysicsSystem.ts:20` |
| [Vent4Msg](#interface-vent4msg) | interface | `src/systems/Vent4Core.ts:44` |
| [Vent4PhysicsSystem](#class-vent4physicssystem) | class | `src/systems/Vent4PhysicsSystem.ts:63` |
| [Vent4Snapshot](#interface-vent4snapshot) | interface | `src/systems/Vent4Core.ts:34` |
| [Vent4State](#enum-vent4state) | enum | `src/systems/Vent4Core.ts:17` |
| [Vent4Stats](#interface-vent4stats) | interface | `src/systems/EntityStats.ts:531` |
| [Vent4TickResult](#interface-vent4tickresult) | interface | `src/entities/Vent4Boss.ts:46` |
| [Vent4Transition](#interface-vent4transition) | interface | `src/systems/Vent4Core.ts:28` |
| [Vent4View](#interface-vent4view) | interface | `src/systems/Vent4Core.ts:50` |
| [WallBuffer](#class-wallbuffer) | class | `src/systems/CollisionGrid.ts:11` |
| [WallRect](#interface-wallrect) | interface | `src/map/TileBake.ts:31` |
| [WaveParams](#interface-waveparams) | interface | `src/systems/QualiaLock.ts:27` |
| [WitnessAnchor](#interface-witnessanchor) | interface | `src/scenes/game/Encounters.ts:64` |
