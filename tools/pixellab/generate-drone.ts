/**
 * Regenerates the crawlspace drone's sprite set from a south-facing reference.
 *
 *     PIXELLAB_API_KEY=... npx tsx tools/pixellab/generate-drone.ts \
 *       --reference candidate.png
 *
 * The drone is a reskin of the enforcer's AI (see `GuardSkin.ts`), so it needs
 * far less than the player does: one sheet, one looping cycle, no stances and no
 * transitions.
 *
 * Afterwards, always run `npm run gen:colliders` — `guardRadiusTiles` derives
 * the drone's collision circle from the traced silhouette *and* the frame width,
 * so both are wrong until it is re-run.
 */

import { main, type CharacterSpec } from "./pipeline";

const DRONE: CharacterSpec = {
  id: "drone",

  /**
   * 48, down from the 85 this art used to ship at.
   *
   * The drone displays at 0.75 tiles, so its sprite scale is `(32 * 0.75) / 48`
   * = 0.5, and at the camera's 2x zoom that is exactly one screen pixel per
   * source pixel. At 85 the same sum gave 0.5647 — below 1, so nearest-neighbour
   * was *discarding* roughly 44% of every frame, and which pixels survived
   * depended on the sprite's subpixel position, so the detail changed as the
   * drone moved.
   *
   * Raising `displayTiles` instead would have fixed the arithmetic and broken
   * the level: `duct1` is built entirely from one-tile crawlways, and
   * `DroneAnimations.ts` records that the drone was already halved from 1.5
   * tiles so it could fit down them. So the art comes down to 48 rather than the
   * display going up.
   */
  canvas: 48,

  // A splay-legged quadruped, not a humanoid — the skeleton estimator is fitted
  // accordingly, or the legs get read as arms.
  templateId: "cat",
  view: "high top-down",

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
   * tuned against — so neither changes here.
   *
   * Issued without an end-frame anchor to start with, because that is one
   * batched request rather than eight. The pipeline's cycle check will say if
   * the hover wanders, and the anchor can be added then.
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
   * A walking drone's chassis rides higher and lower over a stride than a
   * human's torso does, and this cycle is 8 frames rather than 4, so it has more
   * room to travel. Raised from the default 6, which was calibrated on the
   * player's gaits — but only enough to allow a gait, not a change of pose.
   */
  maxCycleRange: 8,
};

main(DRONE);
