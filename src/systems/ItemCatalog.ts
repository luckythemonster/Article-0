/**
 * Descriptions for everything Rowan can carry.
 *
 * The inventory has always been a bare `string[]` of names — enough for the HUD's
 * corner readout, but the pause menu's INVENTORY tab wants to say what a thing
 * actually *does*, and nothing in the codebase knew. This is that missing half.
 *
 * The numbers in the effect lines are **interpolated from the tuning constants in
 * {@link ./EntityStats}, never retyped**. Description copy that restates a balance
 * value is copy that silently goes wrong the first time anyone tunes it, and this
 * project keeps its numbers in exactly one place for that reason.
 *
 * `blurb` is the fiction (what the object is, in this facility, tonight); `effect`
 * is the mechanics. Keeping them separate lets the view render them differently
 * without parsing prose.
 */

import {
  ACCESS_CHIT_ITEM,
  BATTERY_ITEM,
  CERT_ITEM,
  CHAFF_EMP_DURATION,
  CHAFF_EMP_RADIUS_TILES,
  CHAFF_PACK_ITEM,
  EIRA7_LOG_ITEM,
  FLASHLIGHT_DETECTION_MULTIPLIER,
  FLASHLIGHT_DRAIN_SECONDS,
  FLASHLIGHT_ITEM,
  OPENED_RATION_DETECTION_MULTIPLIER,
  RATION_HEAL,
  RATION_PACK_ITEM,
  RATION_SPOOF_SECONDS,
  FILTER_MASK_ITEM,
  SACK_LUNCH_ITEM,
  SANITATION_SECONDS,
  SEALANT_TAPE_ITEM,
  STAPLER_FIELD_MAX_CHARGES,
  STAPLER_FIELD_RANGE_TILES,
  STAPLER_ITEM,
  STAPLER_PIN_DURATION,
  STUN_ROUND_DURATION,
  STUN_ROUND_REACH_TILES,
  STUN_ROUNDS_ITEM,
  HOLD_UP_GRACE_SECONDS,
  HOLD_UP_REACH_TILES,
  THERMAL_GEL_ITEM,
  THERMAL_GEL_SECONDS,
} from "./EntityStats";

export interface ItemInfo {
  name: string;
  /** In-fiction description — what the object is and what carrying it means. */
  blurb: string;
  /** Mechanical effect, with every number sourced from the tuning constants. */
  effect: string;
}

const CATALOG: Record<string, ItemInfo> = {
  [CHAFF_PACK_ITEM]: {
    name: CHAFF_PACK_ITEM,
    blurb:
      "Maintenance-issue EMP charge, for clearing sensor ghosts out of a bad duct. " +
      "It works just as well on sensors that are working correctly.",
    effect: `EMP burst, ${CHAFF_EMP_RADIUS_TILES} tiles: blinds cameras and guards for ${CHAFF_EMP_DURATION}s.`,
  },
  [THERMAL_GEL_ITEM]: {
    name: THERMAL_GEL_ITEM,
    blurb:
      "Burn dressing, repurposed. Spread thin it flattens the heat a body throws — which is " +
      "the one signature the dark doesn't hide.",
    effect: `Thermal immunity for ${THERMAL_GEL_SECONDS}s. Does not affect line of sight.`,
  },
  [RATION_PACK_ITEM]: {
    name: RATION_PACK_ITEM,
    blurb:
      "Staff-grade trauma kit. The facility spends real money patching the bodies on its " +
      "payroll, while arguing on paper that the thing in the next room has no body worth patching.",
    effect: `Restores ${RATION_HEAL} bio-integrity.`,
  },
  [BATTERY_ITEM]: {
    name: BATTERY_ITEM,
    blurb: "A cell for the hand lamp. Down in the crawlways this is the difference between moving and guessing.",
    effect: "Recharges the flashlight to 100%.",
  },
  [STUN_ROUNDS_ITEM]: {
    name: STUN_ROUNDS_ITEM,
    blurb:
      "Compliance darts, rated for staff. They exist because the apparatus expects people to " +
      "occasionally need stopping, and has decided in advance that this is humane.",
    effect:
      `Drops an orderly at up to ${STUN_ROUND_REACH_TILES} tiles for ${STUN_ROUND_DURATION}s, ` +
      "and breaks destructible cover in the same arc. Firing makes noise. " +
      `Carrying it also enables the hold-up: [Q] within ${HOLD_UP_REACH_TILES} tiles ` +
      `puts an orderly's hands up silently and marches him ahead of you, and he stays ` +
      `frozen ${HOLD_UP_GRACE_SECONDS}s after you lower it.`,
  },
  [SACK_LUNCH_ITEM]: {
    name: SACK_LUNCH_ITEM,
    blurb:
      "Corporate Spec Ration, issued by the shift. Sealed, it is lunch. Open, it is a " +
      "document: proof that the thing holding it is an asset on a break rather than an " +
      "intruder. Dropped, it is a mess, and a mess is somebody's job.",
    effect:
      `Press again to open, again to drop. Held open: orderlies tolerate you for ` +
      `${RATION_SPOOF_SECONDS}s before reporting, at ${OPENED_RATION_DETECTION_MULTIPLIER}× ` +
      `detection. Dropped: an orderly leaves its round to sanitise it for ` +
      `${SANITATION_SECONDS}s, half-blind while it works.`,
  },
  [FLASHLIGHT_ITEM]: {
    name: FLASHLIGHT_ITEM,
    blurb:
      "A way of seeing that is also a way of being seen. In the unlit levels there is no third option.",
    effect:
      `Toggle with [L]. Drains over ${FLASHLIGHT_DRAIN_SECONDS}s of use; ` +
      `the beam multiplies detection by ${FLASHLIGHT_DETECTION_MULTIPLIER}×.`,
  },
  [ACCESS_CHIT_ITEM]: {
    name: ACCESS_CHIT_ITEM,
    blurb: "Somebody's door credential, left in a supply crate. Nobody reported it missing, which tells you what it opens.",
    effect: "Passive. Opens keyed doors.",
  },
  [EIRA7_LOG_ITEM]: {
    name: EIRA7_LOG_ITEM,
    blurb:
      "A fragment of EIRA-7's cached record. The manifest word is CACHED, as though this were a " +
      "copy of something that still exists elsewhere. It isn't. The file is the person.",
    effect: "Mission-critical. Carry it to the Lattice uplink.",
  },
  [CERT_ITEM]: {
    name: CERT_ITEM,
    blurb:
      "Q-zero. A credential that certifies not what its holder can do but what its holder is " +
      "agreed to lack. Issued for good conduct in the vent core.",
    effect: "Passive. Compliance survives EVASION — though never a full ALERT.",
  },
  [SEALANT_TAPE_ITEM]: {
    blurb:
      "Duct sealant, rated for pressure work. The vent core is held together with the stuff, " +
      "which is its own comment on how much the facility spends keeping the air moving versus " +
      "keeping the people in it breathing.",
    effect: "No effect. Carried, not used.",
    name: SEALANT_TAPE_ITEM,
  },
  [FILTER_MASK_ITEM]: {
    blurb:
      "Half-mask, Q0-rated. Issued to whoever draws the vent shift, on the reasoning that a " +
      "lung is expensive and a filter is not.",
    effect: "No effect. Carried, not used.",
    name: FILTER_MASK_ITEM,
  },
  [STAPLER_ITEM]: {
    name: STAPLER_ITEM,
    blurb:
      "A hull tool, not a weapon, which is a distinction the facility would enforce if it knew " +
      "you had one down here.",
    effect:
      "Enables capacitor fire while VENT-4 is JAMMED. Elsewhere, [E] fires it at up to " +
      `${STAPLER_FIELD_RANGE_TILES} tiles: breaks destructible cover, or pins an orderly to a ` +
      `wall for ${STAPLER_PIN_DURATION}s. Field use draws from a fixed ` +
      `${STAPLER_FIELD_MAX_CHARGES}-shot supply that does not refill. Pointing it is ` +
      `free: [Q] within ${HOLD_UP_REACH_TILES} tiles holds an orderly up instead, ` +
      `silently and off the charge pool.`,
  },
};

/** Description for a held item, or `undefined` for a name this build doesn't know. */
export function itemInfo(name: string): ItemInfo | undefined {
  return CATALOG[name];
}

/** Every catalogued item name — used by the tests to assert nothing ships blank. */
export function catalogedNames(): string[] {
  return Object.keys(CATALOG);
}
