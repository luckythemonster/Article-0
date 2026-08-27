# Entity stats and tuning

Every gameplay number in Article Zero lives in **`src/systems/EntityStats.ts`**, with a
doc comment explaining what it is and why it's that value.

This file does **not** restate those numbers. It used to, and it drifted — it claimed a
consumable cap of 4 against a real cap of 8, and a slot order missing an item. The source
is the reference; what follows is the set of rules you need in order to read it correctly.

## The division of labour

The map defines the *schema* of every entity (`SightRange`, `PatrolSpeed`, …) but leaves
the values at 0/null. **The engine owns the numbers.** A placed component overrides a
default only when it supplies a non-zero value.

## The rules

**Zero means unset.** `num()` treats an authored `0` as absent and falls back to the
engine default — see the comment in `EntityStats.num`, *"Map leaves tuning at 0"*. You
cannot author a genuine zero: no zero-radius light, no zero sight range. This is why the
shipped map runs almost entirely on defaults.

**Units are consistent throughout.**

| Quantity | Unit |
| --- | --- |
| Ranges, radii, reaches | tiles |
| Angles | degrees, **full cone width** (so a 70° cone is ±35°) |
| Speeds | tiles/second |
| Noise | 0..1 |
| Durations, delays, cooldowns | seconds |

**`GAME_SPEED` (0.6) scales movement, not clocks.** One multiplier, applied through the
`paced()` helper, on everything that *moves*: walk/patrol/chase speeds, turn rates,
vision-cone sweeps, VENT-4's suction and impulses, and animation playback (via
`anims.globalTimeScale`, so walk cycles don't skate).

It deliberately does **not** touch the gameplay clocks — detection fill, alert and evasion
durations, hold-to-hack and hold-to-search times, laser windows, item timers. Those stay
in real seconds so the balance they encode keeps its meaning. When adding a constant, ask
which of the two it is; wrap it in `paced()` only if it's a rate of motion.

## Where to find what

| Group | Constant in `EntityStats.ts` |
| --- | --- |
| Guards and drones | `ENFORCER_DEFAULTS`, `ENFORCER_FIRE_NOISE_TILES`, `GUARD_MELEE_*` |
| Who may fire, and when | `EnforcerStats.armed`, `ARMED_POSTS_PER_LEVEL`, `FIREARMS_AUTHORIZATION_DELAY` |
| Human security guards | `SECURITY_GUARD_DEFAULTS`, read by `securityGuardStatsFor` |
| Putting a body down and hiding it | `LOCKER_STASH_TIME`, `CARRY_SPEED_MULTIPLIER`, `BODY_PICKUP_TILES`, `EMP_SHUTDOWN_DURATION`, `EMP_SHUTDOWN_TILES` |
| Cameras | `SENSOR_DEFAULTS` (thermal radius and network radius are shared with guards) |
| Lights | `LIGHT_DEFAULTS` |
| Doors, glass | `DOOR_DEFAULTS`, `glassStatsFor` (only `VisionBlock` is read) |
| Terminals, chests | `TERMINAL_DEFAULTS`, `CHEST_DEFAULTS` (incl. the default loot) |
| Rowan | `PLAYER_DEFAULTS`, `PLAYER_WALK_TILES` |
| Item effects | `FLASHLIGHT_*`, `CHAFF_EMP_*`, `THERMAL_GEL_SECONDS`, `RATION_HEAL`, `STUN_ROUND_*`, `STAPLER_*` |
| Aimed actions, the takedown and the hold-up | `WEAPON_ARC_DEGREES`, `PLAYER_MELEE_*`, `HOLD_UP_*`, `ESCORT_*` |
| The Sack Lunch and sanitation | `SACK_LUNCH_*`, `SANITATION_*`, `RATION_SPOOF_SECONDS`, `OPENED_RATION_*` |
| The three act bosses | `VENT4_DEFAULTS`, `SMAC_DEFAULTS`, `RELAY_DEFAULTS` |

For the full member list of any of these, see
[`TYPE_REFERENCE.md`](TYPE_REFERENCE.md) — it is generated from the sources, so it cannot
drift.

## Relationships worth knowing before you retune

Most numbers here stand alone. These do not, and all of them are asserted by
`EntityStats.test.ts` — which is the only place both halves of each are in scope.

**Enforcer pace against Rowan's.** `patrolSpeed` (1.6) sits just above a sneak
(`PLAYER_WALK_TILES` 3.2 × 0.45 = 1.44), so a patrol out-walks a crouched player;
`purgeSpeed` (3.0) sits just below a walk (3.2), so walking away holds distance and
a sprint (× 1.6 = 5.12) escapes outright. The purge used to be 4.0, which beat a
walk — making a sprint the only escape, and a sprint is exactly what `Conduct`
reads as "not staff". Raising it back past 3.2 undoes that.

**The security guard against the enforcer.** `SECURITY_GUARD_DEFAULTS` is the same
shape as `ENFORCER_DEFAULTS` and every field that differs says the same thing: he
is a man doing a job rather than a purpose-built sentry. Shorter `sightRange`,
longer `auditDelay`, a genuinely zero `thermalRadius`, a smaller
`alertNetworkRadius` (he radios the mesh, he is not on it), and a worse shot.
`turnRate` is deliberately held level — a man turns his head faster than a sentry
rotates a camera crown, and dropping that too would make him trivially flankable
on top of everything else.

**The stagger against the two purge speeds.** `GUARD_MELEE_STAGGER_MULTIPLIER` (0.55)
puts a staggered sprint at 3.2 × 1.6 × 0.55 = **2.82 tiles/s**, which lands deliberately
*between* a security guard's `purgeSpeed` (2.6) and an enforcer's (3.0). So a staggered
Rowan still out-runs a man with a stick and does not out-run a sentry — the humans hurt
you, the silicates take you in. Raising it past ~0.59 lets him sprint clear of a sentry
mid-stagger and deletes the prod-into-capture sequence; lowering it lets a security guard
run him down, which he should never do.

**The stagger against the capture.** `GUARD_MELEE_STAGGER_SECONDS` (0.5) is held under
`PLAYER_DEFAULTS.captureTime` (0.7), and `ENFORCER_DEFAULTS.meleeRange` (1.6) is held
*above* `captureRadius` (1.3). Together those mean the prod lands before the seizure and
one prod can never on its own hold Rowan inside the window that ends the run — you have to
eat two. Inverting either turns a single connection into a coin-flip death.

**Firearms against the alert clock.** `FIREARMS_AUTHORIZATION_DELAY` (6) must stay under
`AlertState`'s own `ALERT_DURATION` (8) or weapons could never be released at all, and
above 0 or they are released instantly. See
[Design notes](DESIGN_NOTES.md#firearms-are-restricted-not-absent) for the two gates a
shot has to pass, and `ARMED_POSTS_PER_LEVEL` for the headcount ceiling — that one is
enforced in `src/map/ArmedPosts.ts`, not here, because scarcity is a property of the
roster rather than of any one body.

## Inventory

- **`CONSUMABLE_ORDER`** is the display and cycling order: EMP Grenade → Thermal Gel →
  Medkit → Battery → Stun Rounds → Sack Lunch. Selection is `,` / `.` cycling with
  **Enter** to use (`src/scenes/UIScene.ts`); there are no numeric item hotkeys.
- **`MAX_CONSUMABLES` is 8** — a cap on total units held, not on distinct types.
- **Key items are uncapped, and defined as the complement of `CONSUMABLE_ORDER`** rather
  than their own allowlist (`isKeyItem`). Anything the game grants that isn't a
  consumable — Flashlight, keycards, EIRA-7 Log, Rail-Stapler, the Q0 compliance cert,
  the two log-cache halves — shows up under KEY ITEMS automatically. See
  [Design notes](DESIGN_NOTES.md#held-items-are-the-complement-of-the-consumables-list)
  for why that matters.
- **`STARTING_INVENTORY`** is what Rowan begins a run holding.

## Changing a number

The pause menu's item descriptions interpolate their effect values from these constants
(`ItemCatalog.ts`), so the player-facing copy cannot drift from the balance. Change the
constant and the description follows.
