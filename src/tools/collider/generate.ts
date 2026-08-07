/**
 * Article Zero collider generator — CLI runner.
 *
 * Traces a sprite PNG's alpha silhouette, simplifies it with Ramer–Douglas–
 * Peucker, and writes a generated TypeScript module holding a tight-fit AABB
 * (for Phaser Arcade `body.setSize`/`setOffset`) plus the simplified polygon
 * (for future Matter.js / line-of-sight use).
 *
 *   npm run gen:colliders                       # regenerate every TARGET below
 *   npm run gen:colliders -- --verbose          # + ASCII silhouette preview
 *   npm run gen:colliders -- --input assets/x.png --out src/entities/generated/x.ts \
 *                            --export FOO_COLLIDER --epsilon 2 --inset 0 --origin top-left
 *
 * With no `--input`/`--out`/`--export` it walks {@link TARGETS}; naming any of
 * them switches to a single one-off run. Deterministic either way: the same
 * input + flags produce byte-identical output.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { decodeRgba8 } from "./png";
import { alphaMask, largestComponent, traceContour } from "./contour";
import { rdp } from "./rdp";
import type { Point } from "./rdp";
import { toAABB, toPointObjects, toFlatArray, toMatterVertices } from "./format";
import type { AABB, Origin } from "./format";

interface Args {
  input: string;
  out: string;
  exportName: string;
  epsilon: number;
  inset: number;
  origin: Origin;
  threshold: number;
  verbose: boolean;
}

/** Tracing options shared by every target; only the three paths differ. */
const SHARED: Omit<Args, "input" | "out" | "exportName"> = {
  epsilon: 2.0,
  inset: 0,
  origin: "top-left",
  threshold: 10,
  verbose: false,
};

/**
 * Every sprite the game needs a collider for. The guards trace their *south*
 * frame for the same reason the player does — it's the resting pose — but note
 * that a guard's silhouette changes shape with facing (the enforcer is 32×43
 * facing south and 37×40 facing east), so guards use the traced extent to size
 * a *circle* (`GuardSkin.collisionRadiusTiles`) rather than feeding the AABB
 * straight to a physics body the way the player does.
 *
 * The orderly is here for neither of those reasons — he collides with nothing. He is
 * traced so his ground shadow can be sized off his real silhouette like everyone else's
 * (`ShadowShape` in `src/ui/EntityShadows.ts`), instead of being the one character in the
 * game wearing a hand-typed number that stops being true the moment the art changes.
 */
const TARGETS: ReadonlyArray<Pick<Args, "input" | "out" | "exportName">> = [
  {
    input: "public/assets/player/idle/south/0.png",
    out: "src/entities/generated/playerCollider.ts",
    exportName: "PLAYER_IDLE_SOUTH_COLLIDER",
  },
  {
    input: "public/assets/enforcer/patrol/south/0.png",
    out: "src/entities/generated/enforcerCollider.ts",
    exportName: "ENFORCER_PATROL_SOUTH_COLLIDER",
  },
  {
    input: "public/assets/drone/patrol/south/0.png",
    out: "src/entities/generated/droneCollider.ts",
    exportName: "DRONE_PATROL_SOUTH_COLLIDER",
  },
  {
    input: "public/assets/orderly/idle/south/0.png",
    out: "src/entities/generated/orderlyCollider.ts",
    exportName: "ORDERLY_IDLE_SOUTH_COLLIDER",
  },
];

const DEFAULTS: Args = { ...SHARED, ...TARGETS[0] };

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${flag}`);
      return v;
    };
    switch (flag) {
      case "--input":
        args.input = next();
        break;
      case "--out":
        args.out = next();
        break;
      case "--export":
        args.exportName = next();
        break;
      case "--epsilon":
        args.epsilon = Number(next());
        break;
      case "--inset":
        args.inset = Number(next());
        break;
      case "--origin": {
        const v = next();
        if (v !== "top-left" && v !== "center") {
          throw new Error(`--origin must be "top-left" or "center", got "${v}"`);
        }
        args.origin = v;
        break;
      }
      case "--threshold":
        args.threshold = Number(next());
        break;
      case "--verbose":
        args.verbose = true;
        break;
      default:
        throw new Error(`unknown argument: ${flag}`);
    }
  }
  return args;
}

/** Renders the mask with the simplified polygon vertices marked, for eyeballing. */
function asciiPreview(
  mask: { width: number; height: number; data: Uint8Array },
  polygon: Point[],
): string {
  const vertices = new Set(polygon.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
  const lines: string[] = [];
  for (let y = 0; y < mask.height; y++) {
    let line = "";
    for (let x = 0; x < mask.width; x++) {
      if (vertices.has(`${x},${y}`)) line += "#";
      else line += mask.data[y * mask.width + x] === 1 ? "." : " ";
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.join("\n");
}

function renderModule(args: Args, frameW: number, frameH: number, aabb: AABB, polygon: Point[]): string {
  const points = toPointObjects(polygon, args.origin, { width: frameW, height: frameH });
  const flat = toFlatArray(points);
  const matter = toMatterVertices(points);
  const polyLiteral = points.map((p) => `    { x: ${p.x}, y: ${p.y} }`).join(",\n");

  return `// AUTO-GENERATED by \`npm run gen:colliders\`. Do not edit by hand.
// Source: ${args.input} (${frameW}×${frameH}px)
// epsilon=${args.epsilon}, inset=${args.inset}, origin=${args.origin}, alphaThreshold=${args.threshold}

/** A sprite collider derived from its alpha silhouette. */
export interface SpriteCollider {
  /** Source sprite the collider was traced from. */
  readonly source: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** RDP tolerance (px) and edge inset (px) used to generate this data. */
  readonly epsilon: number;
  readonly inset: number;
  /**
   * Tight-fit box in the sprite's *unscaled* local space. Feed \`width\`/\`height\`
   * to Phaser Arcade \`body.setSize\` and \`offsetX\`/\`offsetY\` to \`body.setOffset\`.
   */
  readonly aabb: {
    readonly width: number;
    readonly height: number;
    readonly offsetX: number;
    readonly offsetY: number;
  };
  /** Simplified alpha contour (\`origin=${args.origin}\`), for polygon/LOS/Matter use. */
  readonly polygon: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** \`polygon\` flattened to \`[x1, y1, x2, y2, ...]\`. */
  readonly polygonFlat: readonly number[];
  /** Path string for \`Matter.Vertices.fromPath\` / \`Bodies.fromVertices\`. */
  readonly matterPath: string;
}

export const ${args.exportName}: SpriteCollider = {
  source: ${JSON.stringify(args.input)},
  frameWidth: ${frameW},
  frameHeight: ${frameH},
  epsilon: ${args.epsilon},
  inset: ${args.inset},
  aabb: { width: ${aabb.width}, height: ${aabb.height}, offsetX: ${aabb.offsetX}, offsetY: ${aabb.offsetY} },
  polygon: [
${polyLiteral},
  ],
  polygonFlat: [${flat.join(", ")}],
  matterPath: ${JSON.stringify(matter)},
} as const;
`;
}

function main(): void {
  const argv = process.argv.slice(2);
  const base = parseArgs(argv);
  // Naming any of the three path flags means "just this one"; otherwise the
  // bare command regenerates the whole set, so they can't drift apart.
  const oneOff = ["--input", "--out", "--export"].some((f) => argv.includes(f));
  for (const target of oneOff ? [base] : TARGETS.map((t) => ({ ...base, ...t }))) {
    generateOne(target);
  }
}

function generateOne(args: Args): void {
  const buffer = readFileSync(args.input);
  const img = decodeRgba8(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));

  const blob = largestComponent(alphaMask(img, args.threshold));
  const contour = traceContour(blob);
  const polygon = rdp(contour, args.epsilon);
  // The AABB drives the physics body, so take it from the raw silhouette
  // extent rather than the RDP polygon (which can shrink the box by ~epsilon).
  const aabb = toAABB(contour, args.inset);

  const module = renderModule(args, img.width, img.height, aabb, polygon);
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, module);

  const inFrame =
    aabb.width > 0 &&
    aabb.height > 0 &&
    aabb.offsetX >= 0 &&
    aabb.offsetY >= 0 &&
    aabb.offsetX + aabb.width <= img.width &&
    aabb.offsetY + aabb.height <= img.height;

  console.log(`collider: ${args.input} (${img.width}×${img.height})`);
  console.log(`  contour ${contour.length} px → polygon ${polygon.length} vertices (epsilon=${args.epsilon})`);
  console.log(`  aabb ${aabb.width}×${aabb.height} @ offset (${aabb.offsetX}, ${aabb.offsetY})${inFrame ? "" : "  ⚠ OUT OF FRAME"}`);
  console.log(`  wrote ${args.out}`);
  if (args.verbose) {
    console.log("\n" + asciiPreview(blob, polygon) + "\n");
  }
}

main();
