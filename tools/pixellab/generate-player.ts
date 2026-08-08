/**
 * Regenerates the player character's full sprite set.
 *
 *     PIXELLAB_API_KEY=... npx tsx tools/pixellab/generate-player.ts
 *
 * What Rowan is lives in `./characters`; the pipeline that builds him lives in
 * `./pipeline`. The standing sheet is currently an *adopted* PixelLab
 * character (`from: "existing"`), so no `--reference` is needed — that flag
 * only matters if `PLAYER.sheets[0].source` goes back to `from: "reference"`,
 * in which case pick the reference with `candidates.ts` first: rotating and
 * animating a character costs far more than drawing one frame of it.
 *
 * Afterwards, always run `npm run gen:colliders` — the physics body is traced
 * from `idle/south/0.png` and will not match the new art until you do.
 */

import { PLAYER } from "./characters";
import { main } from "./pipeline";

main(PLAYER);
