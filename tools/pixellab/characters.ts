/**
 * What each character in the game is, as the generation pipeline sees it.
 *
 * These are descriptions, not code — the pipeline that consumes them lives in
 * `./pipeline`, and the entry points (`generate-player.ts`, `rescale.ts`, ...)
 * are a line each. Keeping them together means the frame counts, canvas sizes
 * and prompts that have to agree with `src/entities/` can be read in one place.
 */

import type { CharacterSpec } from "./pipeline";

export const PLAYER: CharacterSpec = {
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

export const DRONE: CharacterSpec = {
  id: "drone",

  /**
   * 48, down from the 85 this art used to ship at.
   *
   * What has to hold is `(tileSize * displayTiles) / canvas * zoom` = a whole
   * number: `(32 * 0.75) / 48 * 2` = exactly 1, one screen pixel per source
   * pixel. At 85 the same sum gave 0.5647 — below 1, so nearest-neighbour was
   * *discarding* roughly 44% of every frame, and which pixels survived depended
   * on the sprite's subpixel position, so the detail changed as the drone moved.
   *
   * Any `canvas = 64 * displayTiles` satisfies the arithmetic equally, but they
   * are not interchangeable: at a net factor of 1 the drone appears at whatever
   * size its *body* is drawn, and a rescale scales the body with the canvas. 48
   * is what keeps the drone the size it is today — the body lands at 41px on
   * screen against the 40.7px it currently occupies, so `DRONE_DISPLAY_TILES`
   * does not move and neither does the duct fit. 64 would have made it 54px.
   *
   * The union of every frame's content comes to 45x41 at this size, so it fits
   * with room; the drone translates within its frame as it walks, which is why
   * the union is wider than any single frame.
   */
  canvas: 48,
  templateId: "cat",
  view: "high top-down",

  /**
   * Present so the spec is complete, but this character is not built by
   * rotating a reference — see `rescale.ts` and the note on `anims` below.
   */
  sheets: [
    {
      name: "body",
      source: {
        from: "reference",
        displayName: "Crawlspace Drone",
        description:
          "A small non-humanoid patrol drone: a compact armoured grey-steel chassis carried on " +
          "four splayed spider legs, with a row of glowing green sensor lenses across the front. " +
          "Top-down view, crisp black outline.",
      },
    },
  ],

  /**
   * One cycle, matching `DRONE_SKIN` in `src/entities/DroneAnimations.ts`: 8
   * frames at 8fps. Both are gameplay feel — the patrol cadence the guard AI is
   * tuned against — so neither changes.
   *
   * The drone's frames are produced by `rescale.ts` rather than generated, and
   * the reason is worth recording. Rotating a reference into 8 directions fits a
   * 3D skeleton to the sprite, and the available templates are all humanoid or
   * hoofed quadrupeds — none of them has legs splayed out sideways. Fitting a
   * cat to this body plan mangled seven of the eight facings: limbs detached,
   * joints at impossible angles. The existing art already has correct geometry
   * in every direction, so it is redrawn at the new size instead.
   */
  anims: [
    {
      name: "patrol",
      sheet: "body",
      action: "scuttling forward one full stride on its legs while the sensor cluster scans",
      frameCount: 8,
      keepFirstFrame: false,
    },
  ],

  /**
   * A chassis on legs rides higher and lower over a stride than a torso does,
   * and this cycle is 8 frames rather than 4, so it has more room to travel.
   * Raised from the default 6, which was calibrated on the player's gaits — but
   * only enough to allow a gait, not a change of pose.
   */
  maxCycleRange: 8,
};

export const CHARACTERS: Record<string, CharacterSpec> = { player: PLAYER, drone: DRONE };
