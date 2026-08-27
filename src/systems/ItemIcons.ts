/**
 * Item name -> icon asset path, for the items with hand-authored art. Items
 * absent here (Stun Rounds, the two LOG_CACHE fragments) render without an icon.
 */
import {
  BATTERY_ITEM,
  FLASHLIGHT_ITEM,
  keycardNumber,
  CERT_ITEM,
  CHAFF_PACK_ITEM,
  EIRA7_LOG_ITEM,
  RATION_PACK_ITEM,
  SACK_LUNCH_ITEM,
  STAPLER_ITEM,
  THERMAL_GEL_ITEM,
} from "./EntityStats";

export const ITEM_ICON_PATHS: Record<string, string> = {
  [CHAFF_PACK_ITEM]: "assets/icons/EMP_grenade.png",
  [THERMAL_GEL_ITEM]: "assets/icons/thermal_gel.png",
  [CERT_ITEM]: "assets/icons/Q0_certification.png",
  [RATION_PACK_ITEM]: "assets/icons/medkit.png",
  [BATTERY_ITEM]: "assets/icons/battery.png",
  [EIRA7_LOG_ITEM]: "assets/icons/disk.png",
  [SACK_LUNCH_ITEM]: "assets/icons/sack_lunch.png",
  // The one entry with no 256px original behind it: `rail_stapler.png` was drawn
  // native, so only the `assets/ui/icons/` half of the pair below exists. If that
  // file ever goes missing the fallback resolves to nothing and the Stapler goes
  // back to rendering iconless — which is what it did before this line, so the
  // failure mode is the status quo rather than a broken image.
  [STAPLER_ITEM]: "assets/icons/rail_stapler.png",
};

/** The flashlight's icon depends on its toggle state, so it isn't in the flat map. */
export function flashlightIconPath(on: boolean): string {
  return on ? "assets/icons/flashlight-on.png" : "assets/icons/flashlight-off.png";
}

/**
 * The icon for a keycard of any clearance.
 *
 * Every clearance shares one image today. The art does not have to: this file is cut
 * from `keycard icon.aseprite`, which carries **five** numbered `clearance_level`
 * frames, and `tools/icons/build_icons.py` says in as many words that the other four
 * were "drawn and waiting for a mechanic" because nothing carried a clearance to pick
 * them by. Something does now — wiring them is one `Spec(outputs={0..4})` line there
 * plus a lookup here, and it needs Aseprite to regenerate the PNGs.
 *
 * The filename still says `access_chit` because it is a *generated* artefact: renaming
 * the output means re-running that script, which is the same blocker.
 */
export function keycardIconPath(_clearance: number): string {
  return "assets/icons/access_chit.png";
}

/**
 * The icon for a held item, or `undefined` for one with no art.
 *
 * The flat map cannot answer for every item — the flashlight varies with its toggle and
 * keycards are an open-ended family — so callers go through here rather than indexing
 * {@link ITEM_ICON_PATHS} directly and missing the dynamic cases.
 */
export function itemIconPath(name: string, flashlightOn = false): string | undefined {
  if (name === FLASHLIGHT_ITEM) return flashlightIconPath(flashlightOn);
  const clearance = keycardNumber(name);
  if (clearance !== undefined) return keycardIconPath(clearance);
  return ITEM_ICON_PATHS[name];
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
 *
 * As of the 2026-08-21 bundle the native side covers eight of the ten:
 * `EMP_grenade`, `Q0_certification`, `access_chit`, `disk`, `flashlight-off`,
 * `flashlight-on`, `medkit` and the new `rail_stapler`, all cut from
 * `.aseprite` sources by `tools/icons/build_icons.py`. `battery.png` and
 * `thermal_gel.png` are still the legacy 256px art and still fall back here.
 */
export function nativeIconPath(path: string): string {
  return `assets/ui/icons/${path.slice(path.lastIndexOf("/") + 1)}`;
}
