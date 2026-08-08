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
   * 48, matching PixelLab character `17c7f0e3-796b-47f9-9371-3761e53a09c8`'s
   * own native size exactly — this design is *adopted*, not redrawn, so its
   * pixel density is whatever it already is.
   *
   * `(32 * 1.5) / 48 * 2` = exactly 2: two screen pixels per source pixel,
   * still a whole number so the art stays crisp, just chunkier than the
   * previous 96-canvas take (net factor 1). That's the point — the brief was
   * a lower-resolution sprite, not a same-resolution reskin.
   */
  canvas: 48,
  templateId: "mannequin",
  view: "high top-down",

  sheets: [
    {
      name: "standing",
      /**
       * Adopted exactly as it exists on PixelLab — no rotation call, no
       * redraw. The brief was "use this one", and a redraw (even a faithful
       * one) is a reinterpretation; this is the design itself. The character
       * already carries all 8 rotations.
       */
      source: { from: "existing", characterId: "17c7f0e3-796b-47f9-9371-3761e53a09c8" },
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

export const ENFORCER: CharacterSpec = {
  id: "enforcer",

  /**
   * 72, up from 48, paired with an `ENFORCER_DISPLAY_TILES` of 1.125.
   *
   * `(32 * 1.125) / 72 * 2` = exactly 1 screen pixel per source pixel. The old
   * pairing of 48 and 1.15 gave 1.533, so two source pixels out of three got one
   * screen pixel and the third got two — and which ones moved with the sprite,
   * so the outline broke up as the enforcer patrolled.
   *
   * Unlike the drone this is an *upscale*: the enforcer was being magnified, not
   * shrunk, so the fix is art with enough pixels to be shown at the size it is
   * already shown at. The display drops from 1.15 tiles to 1.125 — the nearest
   * value with a whole-number canvas — which is a 2% reduction on screen, far
   * inside the margin that made 1.15 necessary in the first place.
   *
   * The union of every frame's content comes to 71x69 here, against a 72 canvas.
   * That is nearly no margin, and it is not an oversight: this art is 98% frame
   * fill, which is precisely why the enforcer could not be fixed by changing
   * numbers alone. If a redraw overflows, the canvas can go to 80 with
   * `displayTiles` at 1.25 without changing the on-screen size at all — with a
   * net factor of 1 the body appears at whatever size it is *drawn*, and the
   * canvas around it is only padding.
   */
  canvas: 72,
  templateId: "mannequin",
  view: "high top-down",

  sheets: [
    {
      name: "body",
      source: {
        from: "reference",
        displayName: "Commonwealth Enforcer",
        description:
          "A blocky robotic sentry gliding on magnetic tracks, with a rotating crown of " +
          "camera-arms above a heavy armoured torso. Top-down view, crisp black outline.",
      },
    },
  ],

  /** Matches `ENFORCER_SKIN`: 8 frames at 8fps, the patrol-scan cycle. */
  anims: [
    {
      name: "patrol",
      sheet: "body",
      action: "gliding forward while the crown of camera-arms sweeps back and forth",
      frameCount: 8,
      keepFirstFrame: false,
    },
  ],
};

export const ORDERLY: CharacterSpec = {
  id: "orderly",

  /**
   * 96, up from 84, with `displayTiles` left at 1.5.
   *
   * `(32 * 1.5) / 96 * 2` = exactly 1. The old canvas of 84 gave 1.1429, a
   * fraction, so the grid re-snapped under camera motion. 96 is 84 * 8/7, which
   * is the same ratio the old scale was magnifying by — so the orderly comes out
   * exactly the size it already was, and nothing but the canvas moves.
   */
  canvas: 96,
  templateId: "mannequin",
  view: "high top-down",

  sheets: [
    {
      name: "body",
      source: {
        from: "reference",
        displayName: "Commonwealth Orderly",
        description:
          "A human orderly in a utilitarian jumpsuit with reinforced utility pockets, carrying a " +
          "diagnostic tablet. Top-down view, crisp black outline.",
      },
    },
  ],

  /**
   * Matches `ORDERLY_ANIM_FRAME_COUNTS`: idle and walk, 4 frames each. A
   * bystander has no run or crouch.
   */
  anims: [
    { name: "idle", sheet: "body", action: "standing still, breathing, weight shifting slightly", frameCount: 4, keepFirstFrame: false },
    { name: "walk", sheet: "body", action: "walking forward at a steady pace", frameCount: 4, keepFirstFrame: false },
  ],
};

export const CHARACTERS: Record<string, CharacterSpec> = {
  player: PLAYER,
  drone: DRONE,
  enforcer: ENFORCER,
  orderly: ORDERLY,
};
