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
  RATION_HEAL,
  RATION_PACK_ITEM,
  STAPLER_ITEM,
  STUN_ROUND_DURATION,
  STUN_ROUND_REACH_TILES,
  STUN_ROUNDS_ITEM,
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
    effect: `Drops an orderly at up to ${STUN_ROUND_REACH_TILES} tiles for ${STUN_ROUND_DURATION}s. Firing makes noise.`,
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
  [STAPLER_ITEM]: {
    name: STAPLER_ITEM,
    blurb:
      "A hull tool, not a weapon, which is a distinction the facility would enforce if it knew " +
      "you had one down here.",
    effect: "Passive. Enables capacitor fire while VENT-4 is JAMMED.",
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
