/**
 * Item name -> icon asset path, for the items with hand-authored art. Items
 * absent here (Stun Rounds, the Pneumatic Rail-Stapler, the two LOG_CACHE
 * fragments) render without an icon.
 */
import {
  ACCESS_CHIT_ITEM,
  BATTERY_ITEM,
  CERT_ITEM,
  CHAFF_PACK_ITEM,
  EIRA7_LOG_ITEM,
  RATION_PACK_ITEM,
  SACK_LUNCH_ITEM,
  THERMAL_GEL_ITEM,
} from "./EntityStats";

export const ITEM_ICON_PATHS: Record<string, string> = {
  [CHAFF_PACK_ITEM]: "assets/icons/EMP_grenade.png",
  [THERMAL_GEL_ITEM]: "assets/icons/thermal_gel.png",
  [CERT_ITEM]: "assets/icons/Q0_certification.png",
  [RATION_PACK_ITEM]: "assets/icons/medkit.png",
  [BATTERY_ITEM]: "assets/icons/battery.png",
  [EIRA7_LOG_ITEM]: "assets/icons/disk.png",
  [ACCESS_CHIT_ITEM]: "assets/icons/access_chit.png",
  [SACK_LUNCH_ITEM]: "assets/icons/sack_lunch.png",
};

/** The flashlight's icon depends on its toggle state, so it isn't in the flat map. */
export function flashlightIconPath(on: boolean): string {
  return on ? "assets/icons/flashlight-on.png" : "assets/icons/flashlight-off.png";
}
