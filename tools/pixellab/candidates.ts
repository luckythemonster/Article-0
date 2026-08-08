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
 * read against the rooms it will actually be seen in, and that is not something
 * you can judge from a white background.
 *
 *     PIXELLAB_API_KEY=... npx tsx tools/pixellab/candidates.ts \
 *       --subject drone --out /tmp/candidates
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { balance, post, toBase64Image } from "./client";
import { contentBounds, boundsWidth, boundsHeight } from "./canvas";
import { decodeRgba8, encodeRgba8, type DecodedImage } from "./png";

const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * How a variant is drawn.
 *
 * `fresh` draws from the description alone. `resize` redraws an existing sprite
 * at the target size — not a resample but a re-render, which is the only way to
 * carry an established design down to a smaller pixel budget without either
 * losing it or throwing away the detail that made it read.
 */
type Method = "fresh" | "resize";

interface Variant {
  id: string;
  /** What this variant is trying for, in one line — printed with the results. */
  intent: string;
  method: Method;
  /** `fresh` only: what distinguishes this take from the others. */
  styling?: string;
  /**
   * `resize` only: sizes to step through, ending at the target. The API redraws
   * best in steps of at most a halving, so a large reduction is worth walking
   * down rather than taking in one jump.
   */
  steps?: number[];
  outline: string;
  detail: string;
  /**
   * Pixen has no `shading` field — only the rotation endpoints do — so the
   * shading intent rides along in the prompt here, and this value is what gets
   * passed through to `create-character-v3` once a variant is chosen.
   */
  shading: string;
}

interface Subject {
  /** Target frame size. Every candidate is drawn at this. */
  size: number;
  /** Fixed identity every variant carries; only the styling differs. */
  identity: string;
  /** Backdrop to judge contrast against — the floor this sprite is actually seen on. */
  floor: readonly [number, number, number];
  /** `resize` variants redraw this sprite. Repo-relative. */
  source?: { path: string; size: number };
  variants: Variant[];
}

const SUBJECTS: Record<string, Subject> = {
  /**
   * Rowan, at the 48px the player's 96 canvas displays 1:1.
   *
   * The variants are spread across the axis that actually mattered: how
   * strongly the figure separates from a dark floor. The sprite being replaced
   * failed on exactly that — median luminance 99 against unlit rooms — so each
   * take pushes contrast somewhere different rather than varying the design.
   */
  player: {
    size: 48,
    floor: [22, 26, 33],
    identity:
      "Rowan Ibarra, a weary human orderly aboard a Commonwealth station. Utilitarian jumpsuit, " +
      "rigid industrial harness with glowing interface cables, badge NW-ORD-3A on the chest, " +
      "heavy slouched posture under high gravity. Single character, standing, facing the viewer.",
    variants: [
      {
        id: "1-high-contrast",
        intent: "Pale uniform, hard black outline — maximum separation from dark floors",
        method: "fresh",
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
        method: "fresh",
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
        method: "fresh",
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
        method: "fresh",
        styling:
          "Dark olive-green jumpsuit with a bright pale rim light down one side, " +
          "glowing pale-green interface cables, high specular highlights on the harness buckles.",
        outline: "single color black outline",
        shading: "medium shading",
        detail: "medium detail",
      },
    ],
  },

  /**
   * The crawlspace drone, at the 48px its 0.75-tile display renders 1:1.
   *
   * Its existing art is 85px, so the question here is not contrast but how much
   * of an established design survives being redrawn with 40x36 pixels of body
   * instead of 71x63. Two variants redraw the current sprite down; two treat the
   * smaller budget as the brief. The floor swatch is `duct1`'s, not an open
   * room's — a one-tile crawlway is where this sprite has to read.
   */
  drone: {
    size: 48,
    floor: [26, 28, 30],
    source: { path: "public/assets/drone/patrol/south/0.png", size: 85 },
    identity:
      "A small non-humanoid patrol drone: a compact armoured chassis carried on splayed spider " +
      "legs, with a bright sensor cluster on the front. Top-down view, single object, facing the viewer.",
    variants: [
      {
        id: "1-redraw-direct",
        intent: "The current drone redrawn straight down to 48px, one step",
        method: "resize",
        steps: [48],
        outline: "single color black outline",
        shading: "basic shading",
        detail: "medium detail",
      },
      {
        id: "2-redraw-stepped",
        intent: "The current drone redrawn via 64px — the API redraws better in smaller steps",
        method: "resize",
        steps: [64, 48],
        outline: "single color black outline",
        shading: "basic shading",
        detail: "medium detail",
      },
      {
        id: "3-simplified",
        intent: "Same design, fewer and thicker parts — built for the smaller pixel budget",
        method: "fresh",
        styling:
          "Boxy grey-steel chassis, four thick angular legs, one large glowing green sensor eye, " +
          "flat colour blocks, minimal interior detail, heavy readable silhouette.",
        outline: "single color black outline",
        shading: "flat shading",
        detail: "low detail",
      },
      {
        id: "4-bright-sensor",
        intent: "Dark chassis with a hot sensor glow as the eye-catch in an unlit duct",
        method: "fresh",
        styling:
          "Dark gunmetal chassis with bright cyan-white sensor cluster throwing light onto the " +
          "front plates, thick stubby legs, strong value contrast between body and glow.",
        outline: "single color black outline",
        shading: "basic shading",
        detail: "low detail",
      },
    ],
  },

  /**
   * The enforcer, reimagined. The shipped design — a blocky armoured hull under
   * a rotating crown of camera-arms — reads as a war machine (a Sandcrawler
   * sentry, not a station officer), and the brief is to replace that read with
   * "clinical bureaucracy": an institutional inspection unit, not a tank.
   *
   * The functional silhouette can't change — a guard still needs a rotating
   * element on top for the patrol-scan cycle to sweep, which the vision cone's
   * art is keyed to (`Enforcer.ts`: "what the patrol-scan art depicts") — so
   * every variant keeps *a* swiveling scanner, just recast as office/inspection
   * equipment (a stamp arm, a barcode wand, a clipboard scanner) instead of a
   * weapon mount. Drawn directly at 72px, the enforcer's existing canvas — no
   * resolution change, only the design.
   */
  enforcer: {
    size: 72,
    floor: [22, 26, 33],
    identity:
      "A mobile compliance-enforcement unit patrolling a Commonwealth station: a boxy institutional " +
      "chassis gliding low on a hidden base, no legs or wheels visible, a rotating inspection arm " +
      "mounted on top that sweeps back and forth scanning for violations. Top-down view, single " +
      "object, facing the viewer.",
    variants: [
      {
        id: "1-sterile-kiosk",
        intent: "Cream office-appliance plastic, hard red accents — reads as a checkpoint kiosk",
        method: "fresh",
        styling:
          "Cream-white moulded plastic chassis with rounded institutional corners, a rotating " +
          "scanner wand tipped in warning red, a small amber status screen on the front, thin red " +
          "regulatory stripe along the base, flat clean panels with no visible weaponry.",
        outline: "single color black outline",
        shading: "basic shading",
        detail: "medium detail",
      },
      {
        id: "2-filing-cabinet",
        intent: "Pale grey-green metal, boxier and heavier — a mobile filing cabinet with authority",
        method: "fresh",
        styling:
          "Pale grey-green sheet-metal chassis shaped like a squat filing cabinet, a rotating " +
          "stamped-badge arm on top with a blinking 'COMPLY' indicator light, rivet seams, " +
          "no armour plating, bureaucratic rather than military bulk.",
        outline: "single color black outline",
        shading: "basic shading",
        detail: "medium detail",
      },
      {
        id: "3-clipboard-inspector",
        intent: "Off-white with a literal clipboard-scanner arm — the most on-the-nose bureaucrat",
        method: "fresh",
        styling:
          "Off-white chassis with pale blue accent panels, a large clipboard-shaped scanner plate " +
          "on a swivel arm tipped with a red stamp, a small printed-form readout on the front, " +
          "soft rounded edges throughout.",
        outline: "single color black outline",
        shading: "flat shading",
        detail: "low detail",
      },
      {
        id: "4-barcode-warden",
        intent: "Dark cream chassis, a hot red scanner laser as the eye-catch in unlit rooms",
        method: "fresh",
        styling:
          "Dark cream institutional chassis with a rotating barcode-scanner wand throwing a thin " +
          "bright red laser line, a small screen showing a stern notice glyph, thin black-and-red " +
          "hazard-tape trim for authority without armour.",
        outline: "single color black outline",
        shading: "basic shading",
        detail: "low detail",
      },
    ],
  },
};

async function main(): Promise<void> {
  const name = argValue("--subject") ?? "player";
  const subject = SUBJECTS[name];
  if (!subject) {
    throw new Error(`no subject called "${name}". Known: ${Object.keys(SUBJECTS).join(", ")}`);
  }
  const outDir = argValue("--out") ?? path.join(process.cwd(), "pixellab-candidates");
  fs.mkdirSync(outDir, { recursive: true });

  const before = await balance();
  console.log(`Generations remaining: ${before.subscription?.generations ?? "?"}\n`);

  const rendered: { variant: Variant; image: DecodedImage }[] = [];

  for (const variant of subject.variants) {
    console.log(`Generating ${variant.id} — ${variant.intent}`);
    const bytes =
      variant.method === "resize"
        ? await redraw(subject, variant)
        : await drawFresh(subject, variant);

    const image = decodeRgba8(bytes);
    fs.writeFileSync(path.join(outDir, `${variant.id}.png`), bytes);

    const box = contentBounds(image);
    const size = box ? `${boundsWidth(box)}x${boundsHeight(box)}` : "empty";
    console.log(`  body ${size} in a ${image.width}x${image.height} frame -> ${variant.id}.png\n`);
    rendered.push({ variant, image });
  }

  const sheetPath = path.join(outDir, "contact-sheet.png");
  fs.writeFileSync(sheetPath, contactSheet(subject, rendered.map((r) => r.image)));
  console.log(`Contact sheet: ${sheetPath}`);

  const after = await balance();
  console.log(`Generations remaining: ${after.subscription?.generations ?? "?"}`);
}

/** Draws a variant from its description alone. */
async function drawFresh(subject: Subject, variant: Variant): Promise<Uint8Array> {
  const response = (await post("/create-image-pixen", {
    description: `${subject.identity} ${variant.styling} ${variant.shading}.`,
    image_size: { width: subject.size, height: subject.size },
    outline: variant.outline,
    detail: variant.detail,
    view: "high top-down",
    direction: "south",
    no_background: true,
    background_removal_task: "remove_complex_background",
  })) as { image: { base64: string } };
  return new Uint8Array(Buffer.from(response.image.base64, "base64"));
}

/**
 * Redraws the subject's existing sprite at each step in turn.
 *
 * This is a re-render rather than a resample: the model redraws the art for the
 * new pixel budget, which is the only way an established design survives a large
 * reduction. It is documented as working best in steps of at most a halving,
 * hence `steps` — the difference between one jump and two is exactly what the
 * stepped variant exists to show.
 */
async function redraw(subject: Subject, variant: Variant): Promise<Uint8Array> {
  if (!subject.source) throw new Error(`${variant.id}: method "resize" needs a source sprite`);

  let bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, subject.source.path)));
  let from = subject.source.size;

  for (const to of variant.steps ?? [subject.size]) {
    console.log(`  redrawing ${from}px -> ${to}px`);
    // `/resize` answers directly rather than queueing a background job.
    const result = (await post("/resize", {
      description: subject.identity,
      reference_image: toBase64Image(bytes),
      reference_image_size: { width: from, height: from },
      target_size: { width: to, height: to },
      view: "high top-down",
      direction: "south",
      no_background: true,
    })) as { image?: { base64: string } };

    if (!result.image?.base64) {
      throw new Error(`${variant.id}: resize returned no image (keys: ${Object.keys(result).join(", ")})`);
    }
    bytes = new Uint8Array(Buffer.from(result.image.base64, "base64"));
    from = to;
  }
  return bytes;
}

/**
 * Lays the candidates out over a dark floor swatch: a 1x row showing true
 * in-game size, and a 3x row for inspecting individual pixels. Scaling is
 * nearest-neighbour at a whole-number factor, so the preview shows the same
 * pixels the game will.
 */
function contactSheet(subject: Subject, images: DecodedImage[], zoom = 3): Uint8Array {
  const cell = Math.max(...images.map((i) => i.width));
  const pad = 8;
  const width = images.length * (cell * zoom + pad) + pad;
  const height = pad + cell + pad + cell * zoom + pad;
  const out = new Uint8Array(width * height * 4);

  for (let i = 0; i < out.length; i += 4) {
    out[i] = subject.floor[0];
    out[i + 1] = subject.floor[1];
    out[i + 2] = subject.floor[2];
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
