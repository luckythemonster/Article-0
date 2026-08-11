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

/**
 * Where a 32x32 replacement for `path` would live.
 *
 * The icons above are 256x256 smooth line art shown in a 32px box — a 0.125 ratio,
 * which `render/uiScale.ts` exists to name as the worst case: seven of every eight
 * source pixels discarded, and *which* seven decided by where the box lands. Next
 * to the world's pixel art they read as clip art from another program, because
 * that is essentially what they are. `sack_lunch.png` is the exception and the
 * proof — it is 32x32, authored at size, and it is the one that looks right.
 *
 * Rather than a flag day, this maps each legacy path to its native-resolution
 * counterpart under `assets/ui/icons/`. Callers try that first and fall back to the
 * original when it 404s, so the set can be redrawn one icon at a time with the game
 * playable throughout. See `docs/GUI_STYLE_GUIDE.md` for what to draw.
 */
export function nativeIconPath(path: string): string {
  return `assets/ui/icons/${path.slice(path.lastIndexOf("/") + 1)}`;
}
