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
| Guards and drones | `ENFORCER_DEFAULTS`, `ENFORCER_FIRE_NOISE` |
| Cameras | `SENSOR_DEFAULTS` (thermal radius and network radius are shared with guards) |
| Lights | `LIGHT_DEFAULTS` |
| Doors, glass | `DOOR_DEFAULTS`, `glassStatsFor` (only `VisionBlock` is read) |
| Terminals, chests | `TERMINAL_DEFAULTS`, `CHEST_DEFAULTS` (incl. the default loot) |
| Rowan | `PLAYER_DEFAULTS`, `PLAYER_WALK_TILES` |
| Item effects | `FLASHLIGHT_*`, `CHAFF_EMP_*`, `THERMAL_GEL_SECONDS`, `RATION_HEAL`, `STUN_ROUND_*`, `STAPLER_*` |
| Aimed actions and the hold-up | `WEAPON_ARC_DEGREES`, `HOLD_UP_*`, `ESCORT_*` |
| The Sack Lunch and sanitation | `SACK_LUNCH_*`, `SANITATION_*`, `RATION_SPOOF_SECONDS`, `OPENED_RATION_*` |
| The three act bosses | `VENT4_DEFAULTS`, `SMAC_DEFAULTS`, `RELAY_DEFAULTS` |

For the full member list of any of these, see
[`TYPE_REFERENCE.md`](TYPE_REFERENCE.md) — it is generated from the sources, so it cannot
drift.

## Inventory

- **`CONSUMABLE_ORDER`** is the display and cycling order: EMP Grenade → Thermal Gel →
  Medkit → Battery → Stun Rounds → Sack Lunch. Selection is `,` / `.` cycling with
  **Enter** to use (`src/scenes/UIScene.ts`); there are no numeric item hotkeys.
- **`MAX_CONSUMABLES` is 8** — a cap on total units held, not on distinct types.
- **Key items are uncapped, and defined as the complement of `CONSUMABLE_ORDER`** rather
  than their own allowlist (`isKeyItem`). Anything the game grants that isn't a
  consumable — Flashlight, Access Chit, EIRA-7 Log, Rail-Stapler, the Q0 compliance cert,
  the two log-cache halves — shows up under KEY ITEMS automatically. See
  [Design notes](DESIGN_NOTES.md#held-items-are-the-complement-of-the-consumables-list)
  for why that matters.
- **`STARTING_INVENTORY`** is what Rowan begins a run holding.

## Changing a number

The pause menu's item descriptions interpolate their effect values from these constants
(`ItemCatalog.ts`), so the player-facing copy cannot drift from the balance. Change the
constant and the description follows.
