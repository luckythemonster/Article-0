/**
 * Redraws a character's existing frames at a new native size.
 *
 *     PIXELLAB_API_KEY=... npx tsx tools/pixellab/rescale.ts --subject drone --from 85
 *
 * This is the alternative to regenerating a character, and it exists because
 * regeneration is not always available. Rotating a reference into 8 directions
 * fits a 3D skeleton to the sprite, and the templates on offer are humanoid or
 * hoofed quadrupeds. A body plan that is neither — the drone's four legs splay
 * out sideways — comes back mangled: limbs detached, joints at impossible
 * angles, in seven of eight facings. The art already on disk has correct
 * geometry in every direction, so the useful operation is not "draw this
 * character again" but "draw these frames smaller".
 *
 * Each frame goes through `/resize`, which re-renders pixel art at a new size
 * rather than resampling it — the difference between a redrawn sprite and a
 * decimated one, and the reason thin details like legs survive at all. Frames
 * are redrawn independently, which sounds like it should flicker; in practice
 * the variation it produces is the variation already present in the source.
 *
 * Results are cached per frame, so an interrupted run resumes without paying
 * for the frames it already has. Afterwards, run `npm run gen:colliders`.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { balance, post, toBase64Image } from "./client";
import { CHARACTERS } from "./characters";
import { decodeRgba8 } from "./png";
import { DIRECTIONS, argValue, writeFrameSet, type CharacterSpec, type Frame } from "./pipeline";

const ROOT = path.resolve(import.meta.dirname, "../..");

async function main(): Promise<void> {
  const name = argValue("--subject");
  const spec = name ? CHARACTERS[name] : undefined;
  if (!spec) {
    throw new Error(`--subject must be one of: ${Object.keys(CHARACTERS).join(", ")}`);
  }

  const from = Number(argValue("--from"));
  if (!Number.isFinite(from)) throw new Error("--from <native size of the current frames> is required");

  const srcDir = path.resolve(argValue("--in") ?? path.join(ROOT, "public", "assets", spec.id));
  const outDir = path.resolve(argValue("--out") ?? path.join(ROOT, "public", "assets", spec.id));
  const cacheDir = path.resolve(argValue("--cache") ?? path.join(ROOT, `.pixellab-${spec.id}-rescale`));
  fs.mkdirSync(cacheDir, { recursive: true });

  const before = await balance();
  console.log(`Generations remaining: ${before.subscription?.generations ?? "?"}`);
  console.log(`Redrawing ${spec.id} frames ${from}px -> ${spec.canvas}px\n`);

  const decoded: Frame[] = [];
  const baseline: Frame[] = [];
  for (const anim of spec.anims) {
    for (const direction of DIRECTIONS) {
      for (let frame = 0; frame < anim.frameCount; frame++) {
        const source = path.join(srcDir, anim.name, direction, `${frame}.png`);
        const cached = path.join(cacheDir, `${anim.name}-${direction}-${frame}.png`);
        if (!fs.existsSync(cached)) {
          fs.writeFileSync(cached, await redraw(spec, source, from));
          process.stdout.write(".");
        }
        baseline.push({
          anim: anim.name,
          direction,
          frame,
          image: decodeRgba8(new Uint8Array(fs.readFileSync(source))),
        });
        decoded.push({
          anim: anim.name,
          direction,
          frame,
          image: decodeRgba8(new Uint8Array(fs.readFileSync(cached))),
        });
      }
    }
    console.log(`\n  ${anim.name}: ${DIRECTIONS.length * anim.frameCount} frames`);
  }

  // The frames are judged against the ones they were drawn from, not in the
  // absolute — a rescale cannot be asked to improve on its source's motion, only
  // to reproduce it.
  writeFrameSet(spec, decoded, outDir, baseline);

  const after = await balance();
  console.log(`\nGenerations remaining: ${after.subscription?.generations ?? "?"}`);
  console.log("Next: npm run gen:colliders");
}

/** Re-renders one frame at the spec's canvas size. */
async function redraw(spec: CharacterSpec, sourcePath: string, from: number): Promise<Uint8Array> {
  const sheet = spec.sheets[0].source;
  const description = sheet.from === "reference" ? sheet.description : sheet.edit;

  const result = (await post("/resize", {
    description,
    reference_image: toBase64Image(new Uint8Array(fs.readFileSync(sourcePath))),
    reference_image_size: { width: from, height: from },
    target_size: { width: spec.canvas, height: spec.canvas },
    view: spec.view,
    no_background: true,
  })) as { image?: { base64: string } };

  if (!result.image?.base64) {
    throw new Error(`resize returned no image for ${sourcePath} (keys: ${Object.keys(result).join(", ")})`);
  }
  return new Uint8Array(Buffer.from(result.image.base64, "base64"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
