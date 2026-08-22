import { makeGuardSkin, type GuardSkin } from "./GuardSkin";
import { SECURITY_SILHOUETTE } from "./Silhouette";

/**
 * Frame manifest for the human security guard (drawn by `CastArt` — a standing
 * figure in facility uniform and stab vest, high top-down, 96x96).
 *
 * He exists because the map already had him and the engine did not. The four
 * `security_guard_A`..`_D` boards carry bodies with `Human.Job = SECURITY`, and
 * `bodyKindOf` classified any non-orderly human as an enforcer — so four people
 * were spawning wearing silicate art. In a setting whose whole premise is which
 * beings count as subjects, that is not a cosmetic mix-up.
 *
 * Sized on the orderly's pairing rather than either guard's, because he is a
 * person and not a machine: `(32 * 1.5) / 96 * 2` = exactly 1 screen pixel per
 * source pixel. See `src/render/pixelScale.ts` for the rule and its test.
 *
 * Frames are drawn at boot by `CastArt.buildCastTextures`.
 */

/** Display height in tiles — a man, so the orderly's height rather than a guard's. */
const SECURITY_DISPLAY_TILES = 1.5;

/** Native pixel size of the source art. @see SECURITY_DISPLAY_TILES */
const SECURITY_SOURCE_SIZE = 96;

/** The security guard's {@link GuardSkin}. */
export const SECURITY_SKIN: GuardSkin = makeGuardSkin({
  id: "security",
  frameCount: 8,
  frameRate: 8,
  displayTiles: SECURITY_DISPLAY_TILES,
  sourceSize: SECURITY_SOURCE_SIZE,
  collider: SECURITY_SILHOUETTE,
});
