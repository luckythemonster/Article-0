/**
 * Generates south-facing candidate sprites for a character, for picking a look
 * before committing the generation budget to a full 8-direction set.
 *
 * Rotating and animating a character costs far more than drawing one frame of
 * it, so the cheap step goes first: draw several south-facing variants, look at
 * them at the size they will actually appear in game, then feed the winner to
 * `generate-player.ts` as the rotation reference.
 *
 * Each candidate is written out on its own, alongside a contact sheet that
 * shows every variant at 1x and 3x over a dark floor swatch — the sprite has to
 * read against unlit rooms, and that is not something you can judge from a
 * white background.
 *
 *     PIXELLAB_API_KEY=... npx tsx tools/pixellab/candidates.ts --out /tmp/candidates
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { balance, post } from "./client";
import { contentBounds, boundsWidth, boundsHeight } from "./canvas";
import { decodeRgba8, encodeRgba8, type DecodedImage } from "./png";

/**
 * Generation size for a candidate.
 *
 * The player's body needs to land near 32x46 native pixels: at the 96px canvas
 * and 0.5 display scale the game uses, native pixels map 1:1 onto screen pixels,
 * so this is also the size Rowan occupies on screen. Pixen fills most of the
 * frame it is given, so a 48px frame puts a standing figure in the right range.
 */
const CANDIDATE_SIZE = 48;

/** Rowan's fixed identity. Every variant carries this; only the styling below differs. */
const IDENTITY =
  "Rowan Ibarra, a weary human orderly aboard a Commonwealth station. Utilitarian jumpsuit, " +
  "rigid industrial harness with glowing interface cables, badge NW-ORD-3A on the chest, " +
  "heavy slouched posture under high gravity. Single character, standing, facing the viewer.";

interface Variant {
  id: string;
  /** What this variant is trying for, in one line — printed with the results. */
  intent: string;
  styling: string;
  outline: string;
  detail: string;
  /**
   * Pixen has no `shading` field — only the rotation endpoints do — so the
   * shading intent rides along in the prompt here, and this value is what gets
   * passed through to `create-character-v3` once a variant is chosen.
   */
  shading: string;
}

/**
 * Four takes on the same character, spread across the axis that actually
 * matters here: how strongly the figure separates from a dark floor. The
 * sprite being replaced failed on exactly this — median luminance 99 against
 * unlit rooms — so every variant pushes contrast somewhere different rather
 * than varying the character design.
 */
const VARIANTS: Variant[] = [
  {
    id: "1-high-contrast",
    intent: "Pale uniform, hard black outline — maximum separation from dark floors",
    styling:
      "Pale bone-white and light grey jumpsuit with dark charcoal harness straps, " +
      "bright cyan interface cables, strong value contrast between suit and equipment.",
    outline: "single color black outline",
    shading: "basic shading",
    detail: "medium detail",
  },
  {
    id: "2-warm-accent",
    intent: "Mid-tone uniform with a hot amber accent as the eye-catch",
    styling:
      "Slate grey-blue jumpsuit, worn amber-orange high-visibility harness and shoulder flash, " +
      "warm accent lighting on the cables, clearly readable silhouette.",
    outline: "single color black outline",
    shading: "basic shading",
    detail: "medium detail",
  },
  {
    id: "3-bold-silhouette",
    intent: "Chunkier shapes, flat shading — fewest pixels doing the most work",
    styling:
      "Bold simplified shapes, flat colour blocks, teal-grey jumpsuit with a wide pale chest panel, " +
      "minimal interior detail, heavy readable silhouette with broad shoulders.",
    outline: "single color black outline",
    shading: "flat shading",
    detail: "low detail",
  },
  {
    id: "4-rim-lit",
    intent: "Dark uniform rescued by a bright rim light — closest to the current look",
    styling:
      "Dark olive-green jumpsuit with a bright pale rim light down one side, " +
      "glowing pale-green interface cables, high specular highlights on the harness buckles.",
    outline: "single color black outline",
    shading: "medium shading",
    detail: "medium detail",
  },
];

/** Approximate unlit floor colour, for judging contrast on the contact sheet. */
const FLOOR = [22, 26, 33] as const;

async function main(): Promise<void> {
  const outDir = argValue("--out") ?? path.join(process.cwd(), "pixellab-candidates");
  fs.mkdirSync(outDir, { recursive: true });

  const before = await balance();
  console.log(`Generations remaining: ${before.subscription?.generations ?? "?"}\n`);

  const rendered: { variant: Variant; image: DecodedImage }[] = [];

  for (const variant of VARIANTS) {
    console.log(`Generating ${variant.id} — ${variant.intent}`);
    const response = (await post("/create-image-pixen", {
      description: `${IDENTITY} ${variant.styling} ${variant.shading}.`,
      image_size: { width: CANDIDATE_SIZE, height: CANDIDATE_SIZE },
      outline: variant.outline,
      detail: variant.detail,
      view: "high top-down",
      direction: "south",
      no_background: true,
      background_removal_task: "remove_complex_background",
    })) as { image: { base64: string } };

    const bytes = new Uint8Array(Buffer.from(response.image.base64, "base64"));
    const image = decodeRgba8(bytes);
    fs.writeFileSync(path.join(outDir, `${variant.id}.png`), bytes);

    const box = contentBounds(image);
    const size = box ? `${boundsWidth(box)}x${boundsHeight(box)}` : "empty";
    console.log(`  body ${size} in a ${image.width}x${image.height} frame -> ${variant.id}.png\n`);
    rendered.push({ variant, image });
  }

  const sheetPath = path.join(outDir, "contact-sheet.png");
  fs.writeFileSync(sheetPath, contactSheet(rendered.map((r) => r.image)));
  console.log(`Contact sheet: ${sheetPath}`);

  const after = await balance();
  console.log(`Generations remaining: ${after.subscription?.generations ?? "?"}`);
}

/**
 * Lays the candidates out over a dark floor swatch: a 1x row showing true
 * in-game size, and a 3x row for inspecting individual pixels. Scaling is
 * nearest-neighbour at a whole-number factor, so the preview shows the same
 * pixels the game will.
 */
function contactSheet(images: DecodedImage[], zoom = 3): Uint8Array {
  const cell = Math.max(...images.map((i) => i.width));
  const pad = 8;
  const width = images.length * (cell * zoom + pad) + pad;
  const height = pad + cell + pad + cell * zoom + pad;
  const out = new Uint8Array(width * height * 4);

  for (let i = 0; i < out.length; i += 4) {
    out[i] = FLOOR[0];
    out[i + 1] = FLOOR[1];
    out[i + 2] = FLOOR[2];
    out[i + 3] = 255;
  }

  images.forEach((image, index) => {
    const columnX = pad + index * (cell * zoom + pad);
    blit(out, width, image, columnX + Math.floor((cell * zoom - cell) / 2), pad, 1);
    blit(out, width, image, columnX, pad + cell + pad, zoom);
  });

  return encodeRgba8(width, height, out);
}

/** Alpha-composites `image` onto the sheet at an integer zoom. */
function blit(
  out: Uint8Array,
  outWidth: number,
  image: DecodedImage,
  originX: number,
  originY: number,
  zoom: number,
): void {
  for (let y = 0; y < image.height * zoom; y++) {
    for (let x = 0; x < image.width * zoom; x++) {
      const src = (Math.floor(y / zoom) * image.width + Math.floor(x / zoom)) * 4;
      const alpha = image.data[src + 3] / 255;
      if (alpha === 0) continue;
      const dest = ((originY + y) * outWidth + originX + x) * 4;
      for (let c = 0; c < 3; c++) {
        out[dest + c] = Math.round(image.data[src + c] * alpha + out[dest + c] * (1 - alpha));
      }
    }
  }
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
