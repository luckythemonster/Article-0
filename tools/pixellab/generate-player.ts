/**
 * Regenerates the player character's full sprite set from a single south-facing
 * reference frame.
 *
 *     PIXELLAB_API_KEY=... npx tsx tools/pixellab/generate-player.ts \
 *       --reference candidate.png
 *
 * The pipeline itself lives in `./pipeline`; this file is only the description
 * of what Rowan is. Pick the reference with `candidates.ts` first — rotating and
 * animating a character costs far more than drawing one frame of it.
 *
 * Afterwards, always run `npm run gen:colliders` — the physics body is traced
 * from `idle/south/0.png` and will not match the new art until you do.
 */

import { main, type CharacterSpec } from "./pipeline";

const PLAYER: CharacterSpec = {
  id: "player",
  /**
   * 96 is what makes the player's display scale exactly 0.5, so at the camera's
   * 2x zoom one source pixel covers exactly one screen pixel and the art is
   * never resampled. See `PLAYER_SOURCE_SIZE` in
   * `src/entities/PlayerAnimations.ts` for the full arithmetic.
   */
  canvas: 96,
  templateId: "mannequin",
  view: "high top-down",

  sheets: [
    {
      name: "standing",
      source: {
        from: "reference",
        displayName: "Rowan Ibarra",
        description:
          "Rowan Ibarra, a weary human orderly aboard a Commonwealth station. Pale bone-white and " +
          "light grey jumpsuit with dark charcoal harness straps, bright cyan interface cables, " +
          "badge NW-ORD-3A on the chest, heavy slouched posture under high gravity, strong value " +
          "contrast, crisp black outline.",
      },
    },
    {
      // Derived from the standing sheet rather than generated separately, so the
      // rig, outfit and palette cannot drift between the two stances Rowan
      // transitions between.
      name: "crouched",
      source: {
        from: "state",
        of: "standing",
        stateName: "crouched",
        edit:
          "crouched low to the ground, knees deeply bent, torso lowered and compact, head tucked " +
          "down, sneaking stance",
      },
    },
  ],

  /**
   * Frame counts match `PLAYER_ANIM_FRAME_COUNTS` exactly. Changing one here
   * without changing it there desynchronises the loader from the assets on disk.
   *
   * The two crouched cycles pin their end frame to their own sheet. Left
   * open-ended, the motion model treats a crouch as a pose to move *out of* and
   * walks the character back up toward the template's neutral stance over the
   * cycle — which loops as Rowan repeatedly standing and dropping rather than
   * holding a crouch. The standing cycles need no such anchor: neutral is where
   * they already start.
   *
   * Neither crouched action asks for breathing. Requesting it produced a visible
   * effect drawn around the head — a puff, then a spiked halo — rather than a
   * shift in the shoulders. A held crouch reads as settled because of the pose.
   */
  anims: [
    { name: "idle", sheet: "standing", action: "standing still, breathing, weight shifting slightly", frameCount: 4, keepFirstFrame: false },
    { name: "walk", sheet: "standing", action: "walking forward at a steady pace", frameCount: 4, keepFirstFrame: false },
    { name: "run", sheet: "standing", action: "running forward urgently, leaning into the stride", frameCount: 4, keepFirstFrame: false },
    { name: "crouch", sheet: "crouched", action: "holding a low crouch, staying low and still throughout", frameCount: 4, keepFirstFrame: false, endFrameSheet: "crouched" },
    { name: "crouch-walk", sheet: "crouched", action: "creeping forward one full stride while staying crouched low throughout", frameCount: 6, keepFirstFrame: false, endFrameSheet: "crouched" },
    { name: "crouch-down", sheet: "standing", action: "lowering from standing into a low crouch", frameCount: 8, keepFirstFrame: true, endFrameSheet: "crouched", oneShot: true },
    { name: "crouch-up", sheet: "crouched", action: "rising from a low crouch back up to standing", frameCount: 8, keepFirstFrame: true, endFrameSheet: "standing", oneShot: true },
  ],
};

main(PLAYER);
