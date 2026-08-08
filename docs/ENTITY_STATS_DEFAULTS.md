# Entity Stats Defaults

This document lists the default values for all entity types in Article Zero. These values are defined in `src/systems/EntityStats.ts` and serve as the engine's tuning parameters.

## Overview

The map defines the *schema* of every entity (SightRange, PatrolSpeed, etc.) but leaves values at 0/null. The engine owns the actual numbers. Values are read from placed components when the map provides a non-zero override; otherwise, these defaults apply.

### Units

- **Ranges/Radii**: tiles
- **Angles**: degrees (full cone width)
- **Speeds**: tiles/second

### Game Speed Scaling

A global `GAME_SPEED` of `0.6` scales all movement-based rates:
- Walk/patrol/chase speeds
- Turn rates
- Vision-cone sweeps
- VENT-4's suction and impulses
- Animation playback

Gameplay clocks (detection fill, alert duration, evasion duration, hold-to-hack times, laser windows, item timers) are **not** affected by game speed scaling.

---

## Enforcer (Guard)

**Type**: `EnforcerStats`

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `sightRange` | 6.5 | tiles | Detection cone reach |
| `sightAngle` | 70 | degrees | Full cone width |
| `thermalRadius` | 2 | tiles | Short 360° heat-sense radius |
| `patrolSpeed` | 2.2 | tiles/s | Scaled by GAME_SPEED (0.6) |
| `purgeSpeed` | 4.0 | tiles/s | Scaled by GAME_SPEED (0.6) |
| `turnRate` | 120 | degrees/s | Scaled by GAME_SPEED (0.6) |
| `auditDelay` | 0.9 | seconds | Time in cone before full detection |
| `alertNetworkRadius` | 7 | tiles | Radius to alert networked guards |

---

## Light Source

**Type**: `LightStats`

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `radius` | 3.5 | tiles | Light emission radius |
| `detectionMultiplier` | 1.6 | multiplier | Detection-rate multiplier when lit |
| `type` | "static" | string | Can be "static", "flicker", etc. |

---

## Door

**Type**: `DoorStats`

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `key` | 0 | - | Keycard ID; 0 = hand-openable |
| `state` | "closed" | string | Can be "closed", "open", "locked", "off" |
| `operationNoise` | 4 | tiles | Noise ping radius when operating |

---

## Glass Panel

**Type**: `GlassStats`

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `visionBlock` | false | boolean | Blocks line of sight (frosted/opaque) |

Glass tiles are doors with an additional glass component. Only `VisionBlock` is actively used.

---

## Sensor (Camera)

**Type**: `SensorStats`

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `detectionRange` | 6 | tiles | Detection cone reach |
| `sightAngle` | 60 | degrees | Full cone width (not in map schema) |
| `detectionDelay` | 0.8 | seconds | Time in cone before full detection |
| `thermalRadius` | 2 | tiles | Short 360° heat-sense radius (shared with guards) |
| `alertNetworkRadius` | 7 | tiles | Radius to alert networked guards |
| `type` | "optical" | string | Can be "optical", "pressure", "trip", etc. |
| `state` | "active" | string | Can be "active", "disabled", "looped", etc. |

---

## Terminal

**Type**: `TerminalStats`

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `hackTime` | 2.2 | seconds | Hold-E duration to complete hack |
| `type` | "door" | string | Can be "door", "air", "cameras", "cache" |
| `alertOnFail` | false | boolean | Trip alert if hack abandoned mid-way |

---

## Chest

**Type**: `ChestStats`

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `interactionTime` | 1.4 | seconds | Hold-E duration to search/open |
| `noiseOnOpen` | 3 | tiles | Noise ping radius when opened |
| `items` | ["Medkit", "Battery", "Access Chit"] | array | Default loot when map leaves slots blank |

---

## Player (Rowan)

**Type**: `PlayerStats`

The map carries no player component, so these defaults are used directly.

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `maxHp` | 100 | - | Full bio-integrity (health) |
| `captureRadius` | 1.3 | tiles | Capture distance with line of sight during full alert |
| `captureTime` | 0.7 | seconds | Time cornered before capture completes |
| `deathHold` | 1.2 | seconds | Run holds after bio-integrity hits zero, so the dial's flatline is watchable before the outcome screen. Depletion only — being cornered ends immediately |
| `hazardDamage` | 25 | - | Bio-integrity lost per hazard hit (laser, steam, etc.) |
| `hitCooldown` | 1.0 | seconds | Invulnerability after taking a hit |

Movement pace is a module constant rather than a member of `PlayerStats`:

| Constant | Value | Unit | Notes |
|------|-------|------|-------|
| `PLAYER_WALK_TILES` | 3.2 | tiles/sec | Baseline walk, **scaled by `GAME_SPEED`**. Crouching, mid-crouch-transition and escorting run at 0.45×; sprinting at 1.6× |

---

## VENT-4 Boss

**Type**: `Vent4Stats`

The arena is engine-generated, so these defaults are used directly. Movement-bearing fields (`sweepSpeed*`, `suctionMax`, `burstImpulse`) are scaled by GAME_SPEED (0.6).

### Compliance Index & Phase Thresholds

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `complianceStart` | 100 | - | Boss "health" at encounter start (100 → 0) |
| `patchCompliance` | 15 | - | CI removed per patched pressure sub-station |
| `jamCompliance` | 8 | - | CI removed per scrap load winched into intake |
| `capacitorCompliance` | 12 | - | CI removed per core capacitor destroyed (JAMMED only) |
| `correctionRegen` | 5 | - | CI restored when sweep fully spots player (Phase 1 only) |
| `turbulenceBelow` | 70 | - | CI threshold entering Turbulence band |
| `purgeBelow` | 30 | - | CI threshold entering Critical Blockage → Phase 3 thermal purge |

### Encounter Structure

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `substationCount` | 3 | - | Pressure sub-stations to patch |
| `winchCount` | 3 | - | Scrap loads to winch into intake |
| `capacitorCount` | 4 | - | Core capacitors (Phase 2+) |
| `capacitorHits` | 3 | - | Rail-Stapler hits to destroy one capacitor |
| `sweepCount` | 4 | - | Spotlight sweeps active at full phase |

### Sweep (Spotlight)

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `sweepRange` | 9 | tiles | Spotlight reach from the hub |
| `sweepAngle` | 26 | degrees | Full spotlight cone width |
| `sweepSpeedLaminar` | 0.21 | radians/s | Rotation speed in Laminar phase (scaled by GAME_SPEED) |
| `sweepSpeedTurbulent` | 0.36 | radians/s | Rotation speed in Turbulent phase (scaled by GAME_SPEED) |
| `sweepDetectTime` | 1.1 | seconds | Time inside sweep before full detection (correction burst) |

### Suction & Hub

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `hubRadius` | 1.6 | tiles | Turbine hub footprint radius (sweep origin ring) |
| `suctionRadius` | 11 | tiles | Radial suction reach; pull ramps from 0 at edge to max at hub |
| `suctionMax` | 2.52 | tiles/s | Peak suction (scaled by GAME_SPEED); between player walk (1.92) and run (3.07) |
| `intakeRadius` | 2.3 | tiles | Distance from hub center dealing intake damage |
| `intakeDamage` | 25 | - | Bio-integrity lost per intake hit |

### Grip (Holding On)

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `gripRadius` | 1.35 | tiles | Distance from column center that counts as holding on |
| `gripDrainTime` | 6 | seconds | Time of un-anchored suction to exhaust grip |
| `gripRegenTime` | 2.5 | seconds | Time to refill exhausted grip when anchored |
| `exhaustedPullMultiplier` | 1.35 | multiplier | Pull multiplier once grip is exhausted |

### Jam Mechanic (Phase 2)

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `jamDuration` | 10 | seconds | Turbine stays JAMMED (core exposed) after scrap drop |
| `winchTime` | 2.0 | seconds | Hold-E duration to winch a scrap load |
| `patchTime` | 2.6 | seconds | Hold-E duration to patch a sub-station |

### Rail-Stapler (Capacitor Weapon)

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `staplerRange` | 6 | tiles | Weapon reach |
| `staplerCooldown` | 0.35 | seconds | Time between shots |

### Purge (Phase 3)

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `heatTime` | 18 | seconds | Purge exposure time to overheat (heat 0→1) |
| `overheatDamage` | 10 | - | Bio-integrity lost per overheat |
| `dripCoolDuration` | 6 | seconds | Duration of zeroed thermal signature under condensate drip |
| `steamDamage` | 15 | - | Bio-integrity lost per steam contact |
| `grateNoiseThreshold` | 0.2 | - | Player noise above this on floor grate pings boss (walk 0.5 > sneak 0.15) |

### Correction Burst (Detection Response)

| Stat | Value | Unit | Notes |
|------|-------|------|-------|
| `burstImpulse` | 5.4 | tiles/s | Knockback impulse (scaled by GAME_SPEED) |
| `burstDamage` | 15 | - | Bio-integrity lost per burst hit |

---

## Item Tuning

### Consumable Items

| Item | Stat | Value | Unit |
|------|------|-------|------|
| **EMP Grenade** | EMP radius | 4 | tiles |
| | EMP duration | 6 | seconds |
| | Noise on fire | 0.2 | 0..1 |
| **Thermal Gel** | Duration | 12 | seconds |
| **Medkit** | Heal amount | 35 | bio-integrity |
| **Stun Rounds** | Dart reach | 5 | tiles |
| | Stun duration | 8 | seconds |
| | Noise on fire | 0.2 | 0..1 |
| **Flashlight** | Drain time (100→0) | 45 | seconds |
| | Detection multiplier | 1.8 | multiplier |

### Aimed Actions

| Constant | Value | Unit | Notes |
|------|-------|------|-------|
| `WEAPON_ARC_DEGREES` | 120 | degrees | Full forward arc a dart or a staple reaches (±60°) |

### The Hold-Up

Pointing a weapon at an orderly rather than firing it (**Q**), which requires Stun
Rounds or the Rail-Stapler in the inventory. **There is deliberately no noise
constant** — the hold-up is silent, and that absence is the reason to use it over the
dart (0.2) or the stapler (0.35).

| Constant | Value | Unit | Notes |
|------|-------|------|-------|
| `HOLD_UP_REACH_TILES` | 3 | tiles | Reach to *start* a hold. Under both weapons, and under an orderly's own 5-tile sight range |
| `HOLD_UP_RELEASE_TILES` | 4.5 | tiles | Reach an established hold survives to — hysteresis, so a marched man clipping a corner doesn't strobe the hold |
| `HOLD_UP_ARC_DEGREES` | 90 | degrees | Full arc to start a hold. Narrower than `WEAPON_ARC_DEGREES` |
| `HOLD_UP_RELEASE_ARC_DEGREES` | 160 | degrees | Full arc an established hold survives in — wide, so corners are navigable with a hostage |
| `ESCORT_STANDOFF_TILES` | 1.2 | tiles | How far ahead of Rowan a marched hostage is held |
| `ESCORT_WALK_TILES` | 1.6 | tiles/sec | Marched pace, **scaled by `GAME_SPEED`**. Must exceed Rowan's escort pace (3.2 × 0.45 = 1.44) |
| `ESCORT_SPEED_MULTIPLIER` | 0.45 | multiplier | Rowan's own pace while marching someone |
| `HOLD_UP_GRACE_SECONDS` | 4 | seconds | Frozen shock after the aim comes off, before the ordinary witness path resumes |
| `ORDERLY_COLLISION_RADIUS_TILES` | 0.3 | tiles | Orderly body radius for `GridMotion`. Hand-written: `gen:colliders` covers the player, enforcer and drone only |

### Consumable Hotkey Configuration

- **Slot order** (hotkeys 1–4): EMP Grenade → Thermal Gel → Medkit → Battery → Stun Rounds
- **Max consumables held**: 4
- **Key items** (uncapped): All other items (Flashlight, Access Chit, EIRA-7 Log, Rail-Stapler, Compliance Cert, etc.)

### Special Items

| Item | Purpose |
|------|---------|
| **Pneumatic Rail-Stapler** | Loot from vent-core supply chest; enables capacitor fire while JAMMED |
| **Q0_COMPLIANCE_CERT** | Proof-of-compliance item granted when VENT-4 is silenced |
| **Flashlight** | Toggleable equipment (does not count against consumable cap) |
| **Access Chit** | Door-access credential (does not count against consumable cap) |
| **EIRA-7 Cached Log** | Recovered mission log (does not count against consumable cap) |

---

## Configuration Notes

- **Map overrides**: When a map provides a non-zero value for any component field, that override is used instead of the engine default (except for range/angle fields that the editor never set).
- **Zero-handling**: Maps intentionally leave tuning at 0; the `num()` helper treats 0 as "unset" and falls back to the default.
- **Speed scaling**: All movement-based rates use the `paced()` helper to apply GAME_SPEED (0.6) for consistent world pacing.
