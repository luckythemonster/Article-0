/**
 * Regenerates the player character's full sprite set from a single south-facing
 * reference frame.
 *
 *     PIXELLAB_API_KEY=... npx tsx tools/pixellab/generate-player.ts \
 *       --reference candidate.png
 *
 * What Rowan is lives in `./characters`; the pipeline that builds him lives in
 * `./pipeline`. Pick the reference with `candidates.ts` first — rotating and
 * animating a character costs far more than drawing one frame of it.
 *
 * Afterwards, always run `npm run gen:colliders` — the physics body is traced
 * from `idle/south/0.png` and will not match the new art until you do.
 */

import { PLAYER } from "./characters";
import { main } from "./pipeline";

main(PLAYER);
