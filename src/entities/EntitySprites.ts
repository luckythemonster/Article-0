import type Phaser from "phaser";
import { isPixelPerfect } from "../render/pixelScale";
import MANIFEST from "./entitySpriteFrames.json";

/**
 * The world's hand-drawn entity art, and how game state picks a clip.
 *
 * Eight objects in the world are drawn rather than generated: the hackable
 * terminal, the VENT-4 pressure substation, the mounted security camera, the
 * power breaker, and the four doors (single/glass × east-west/north-south).
 * Their sources are the `.aseprite` files under `public/assets/sprites/`;
 * `tools/sprites/build_sprites.py` composites each one into a horizontal strip
 * and emits {@link ./entitySpriteFrames.json} beside it. This module is the
 * other half of that contract — the same arrangement `src/ui/NetworkPanel.ts`
 * has with `tools/panel/build_panel.py`.
 *
 * **Frames are addressed by what the artist called them, never by position.**
 * The sources annotate in two ways and both are read:
 *
 * - **Tags** name a *range* — `POWER_ON` is a clip to play.
 * - **Cel labels** name a *single frame on one layer* — the camera's facing, the
 *   substation ring's `GOOD`/`WARNING`/`ERROR`.
 *
 * Between them they answer questions neither could alone. The camera's eight
 * frames are four facings × a two-frame LED blink: the tag says which pair is
 * `active`, the cel label says which pair is `south`, and {@link clipFrames}
 * intersects them.
 *
 * **Optional, and fails open.** Each strip is probed for before boot and used
 * only if it is really there — exactly what `src/ui/UiTextures.ts` does for the
 * HUD chrome, and for the same reason: every entity here already draws
 * something (a tile-sheet frame, or a `Graphics` housing), so missing art costs
 * the upgrade and never the game.
 */

/** The manifest's own ids, which are the PNG basenames and the texture-key stems. */
export type EntitySpriteId =
  | "terminal"
  | "terminal-substation"
  | "security-camera"
  | "breaker"
  | "door-single-east-west"
  | "door-single-north-south"
  | "door-glass-east-west"
  | "door-glass-north-south";

interface SpriteEntry {
  size: number;
  frameCount: number;
  /** Authored hold time per frame, in ms. The timing is part of the drawing. */
  durations: number[];
  /**
   * Ordered as the source stores them, **names repeated**. `security-camera`
   * has four `active`s, one per facing; `breaker` has two `IDLE`s.
   */
  tags: { name: string; from: number; to: number }[];
  /** `layer name -> frame index (as a string) -> label`. */
  cels: Record<string, Record<string, string>>;
}

const SPRITES = MANIFEST.sprites as unknown as Record<EntitySpriteId, SpriteEntry>;

export interface EntitySpriteSpec {
  id: EntitySpriteId;
  /** Phaser texture key. Prefixed so it cannot collide with a map sheet's key. */
  key: string;
  /** Path under `public/`. */
  path: string;
  /** One frame's authored pixel size (square), mirrored by the build tool's `Spec`. */
  sourceSize: number;
  /**
   * **Every** footprint the map draws this object at, in tiles.
   *
   * A list rather than a number because display size is not this module's to
   * choose: each object is drawn at its own map tile's `RowSpan`/`ColSpan`, so
   * the art lands exactly where the sprite it replaces did, and the map does
   * not agree with itself. The shipped `TileDefs` give `terminal1`…`terminal9`
   * half a tile and `terminal11`/`terminal12` a whole one, and the VENT-4
   * substations clone whichever terminal prototype was to hand.
   *
   * So the art has to survive all of them, and `pixelScale.test.ts` checks
   * every entry rather than a nominal one. 32px art happens to oblige — a whole
   * tile is 2 screen pixels per source pixel and a half tile is 1 — which is
   * the reason the terminal could be drawn at one size at all.
   *
   * A bare number is a **square** footprint (`col === row`), true of every
   * sprite here except the doors: a north-south door's tile is 1 tile wide and
   * 1.5 tall, so its footprint is `{ col, row }` and both axes are checked
   * independently. `pixelScale.ts`'s rule only asks that *each* axis land on a
   * whole number — it does not require the same whole number, so a door can be
   * pixel-perfect at 2 screen pixels per source pixel wide and 3 tall at once.
   */
  displayTiles: readonly DisplayFootprint[];
}

/** One footprint entry — see {@link EntitySpriteSpec.displayTiles}. */
export type DisplayFootprint = number | { col: number; row: number };

/**
 * Every entity sprite that ships.
 *
 * Every pairing comes out whole — 4 and 2 for the terminal's 16px art, 2 and 1
 * for the substation's 32px art, 4 for the camera, 2 for the breaker — and
 * `src/render/pixelScale.test.ts` asserts all of them, so art redrawn at a
 * size that no longer divides fails the build rather than shipping soft.
 */
export const ENTITY_SPRITES: readonly EntitySpriteSpec[] = [
  {
    id: "terminal",
    key: "entity-terminal",
    path: "assets/sprites/terminal.png",
    sourceSize: 16,
    displayTiles: [1, 0.5],
  },
  {
    id: "terminal-substation",
    key: "entity-terminal-substation",
    path: "assets/sprites/terminal-substation.png",
    sourceSize: 32,
    displayTiles: [1, 0.5],
  },
  // The `security_camera_mounted_*` tile defs are a whole tile, both of them.
  {
    id: "security-camera",
    key: "entity-security-camera",
    path: "assets/sprites/security-camera.png",
    sourceSize: 16,
    displayTiles: [1],
  },
  // `breaker_main1` is authored at half a tile, which is why this is 16px art.
  {
    id: "breaker",
    key: "entity-breaker",
    path: "assets/sprites/breaker.png",
    sourceSize: 16,
    displayTiles: [0.5],
  },
  // East-west doors' tiles are a plain 1x1 — the doorway's extra length runs
  // the other way, so this footprint stays square unlike its north-south sibling.
  {
    id: "door-single-east-west",
    key: "entity-door-single-east-west",
    path: "assets/sprites/door-single-east-west.png",
    sourceSize: 32,
    displayTiles: [1],
  },
  // North-south doors' tiles are 1x1.5 — the extra half-tile is the swing
  // clearance the horizontal orientation doesn't need. See DisplayFootprint.
  {
    id: "door-single-north-south",
    key: "entity-door-single-north-south",
    path: "assets/sprites/door-single-north-south.png",
    sourceSize: 32,
    displayTiles: [{ col: 1, row: 1.5 }],
  },
  {
    id: "door-glass-east-west",
    key: "entity-door-glass-east-west",
    path: "assets/sprites/door-glass-east-west.png",
    sourceSize: 32,
    displayTiles: [1],
  },
  {
    id: "door-glass-north-south",
    key: "entity-door-glass-north-south",
    path: "assets/sprites/door-glass-north-south.png",
    sourceSize: 32,
    displayTiles: [{ col: 1, row: 1.5 }],
  },
] as const;

const SPEC_BY_ID = new Map(ENTITY_SPRITES.map((s) => [s.id, s]));

/** The Phaser texture key for a sprite, whether or not it actually loaded. */
export function entitySpriteKey(id: EntitySpriteId): string {
  const spec = SPEC_BY_ID.get(id);
  if (!spec) throw new Error(`unknown entity sprite ${id}`);
  return spec.key;
}

// --- reading the artist's annotations ---------------------------------------

/** Every frame the tag occurrences named `tag` cover, one array per occurrence. */
function tagRuns(id: EntitySpriteId, tag: string): number[][] {
  return SPRITES[id].tags
    .filter((t) => t.name === tag)
    .map((t) => {
      const frames: number[] = [];
      for (let f = t.from; f <= t.to; f++) frames.push(f);
      return frames;
    });
}

/**
 * Frames carrying a cel label, across every layer unless one is named.
 *
 * Searching all layers by default is what lets the camera be asked for `south`
 * without naming `Layer 1` — the source's layers are called `Layer 1` and
 * `Layer 2` and both carry the same facing labels, so pinning either would be
 * pinning a default name the artist never chose. Pass `layer` where a word
 * means different things on different layers: the substation says `ERROR` on
 * both its status ring and its screen.
 */
export function framesLabelled(
  id: EntitySpriteId,
  label: string,
  layer?: string,
): Set<number> {
  const cels = SPRITES[id].cels;
  const found = new Set<number>();
  for (const [layerName, byFrame] of Object.entries(cels)) {
    if (layer !== undefined && layerName !== layer) continue;
    for (const [frame, text] of Object.entries(byFrame)) {
      if (text === label) found.add(Number(frame));
    }
  }
  return found;
}

/**
 * The frames of a named clip, narrowed by a cel label when the name repeats.
 *
 * With no `label` this is the first occurrence of the tag. With one, it is the
 * occurrence whose frames all carry that label — which is how the camera's four
 * identically-named `active` tags are told apart by facing.
 *
 * Returns an empty array when nothing matches, so a caller that asks for a clip
 * the art no longer has degrades to "no animation" rather than throwing mid-scene.
 */
export function clipFrames(
  id: EntitySpriteId,
  tag: string,
  label?: string,
): number[] {
  const runs = tagRuns(id, tag);
  if (label === undefined) return runs[0] ?? [];
  const marked = framesLabelled(id, label);
  return runs.find((run) => run.every((f) => marked.has(f))) ?? [];
}

// --- animations --------------------------------------------------------------

/**
 * A nominal 1ms per frame, so the authored per-frame holds carry the timing.
 *
 * Phaser shows a frame for `msPerFrame + frame.duration`, and there is no way to
 * ask for a zero base — `frameRate: 0` falls back to 24fps. Running the base at
 * 1000fps and subtracting that millisecond from each authored duration
 * reproduces the source's timing exactly.
 *
 * The timing is not decoration. The camera's "active" clip is a 500ms LED blink,
 * and the terminal's idle is a 1000ms dark hold followed by a 77ms yellow blip —
 * a standby flicker that a single frame rate would flatten into a strobe.
 */
const BASE_FRAME_RATE = 1000;
const BASE_MS_PER_FRAME = 1000 / BASE_FRAME_RATE;

/** Animation key for a clip. Same shape as the texture keys, and collision-free. */
export function entityAnimKey(
  id: EntitySpriteId,
  tag: string,
  label?: string,
): string {
  return label === undefined ? `${id}:${tag}` : `${id}:${tag}:${label}`;
}

/**
 * Registers one clip's animation, returning its key — or undefined if the art
 * is absent or carries no such clip, which is the caller's cue to draw its
 * fallback. Safe to call repeatedly.
 */
export function ensureEntityAnim(
  scene: Phaser.Scene,
  id: EntitySpriteId,
  tag: string,
  label?: string,
  repeat = -1,
): string | undefined {
  return ensureEntityClip(
    scene,
    id,
    entityAnimKey(id, tag, label),
    clipFrames(id, tag, label),
    repeat,
  );
}

/**
 * Registers an animation from an explicit frame list, under a caller-chosen key.
 *
 * For clips the source does not name as a single tag. The breaker's throw is the
 * case that needs it: the cabinet opening, then four *chosen* digit frames, then
 * the screen flipping and the cabinet shutting. Which digits depends on the code
 * being punched in, so the sequence is assembled per throw and cannot be a tag.
 *
 * Frames are still found by label upstream — this only takes the result. Nothing
 * here addresses a frame by position.
 */
export function ensureEntityClip(
  scene: Phaser.Scene,
  id: EntitySpriteId,
  key: string,
  frames: readonly number[],
  repeat = -1,
): string | undefined {
  if (scene.anims.exists(key)) return key;

  const textureKey = entitySpriteKey(id);
  if (!scene.textures.exists(textureKey)) return undefined;
  if (frames.length === 0) return undefined;

  const durations = SPRITES[id].durations;
  scene.anims.create({
    key,
    frames: frames.map((frame) => ({
      key: textureKey,
      frame,
      duration: Math.max(0, (durations[frame] ?? 0) - BASE_MS_PER_FRAME),
    })),
    frameRate: BASE_FRAME_RATE,
    repeat: frames.length > 1 ? repeat : 0,
  });
  return key;
}

// --- loading -----------------------------------------------------------------

/** Filled by {@link discoverEntitySprites}; empty until it has run. */
let present: readonly EntitySpriteSpec[] = [];

/**
 * Works out which strips actually exist, before Phaser starts.
 *
 * A straight copy of `UiTextures.discoverUiTextures`, including the
 * content-type check, which is not belt-and-braces: Vite's dev server answers a
 * request for a missing file with the SPA shell and a 200, so `res.ok` alone
 * reports every absent sheet as present and hands Phaser an HTML document to
 * decode as a PNG. Fails open — a probe that throws is treated as "no art".
 */
export async function discoverEntitySprites(): Promise<void> {
  const found = await Promise.all(
    ENTITY_SPRITES.map(async (spec) => {
      try {
        const res = await fetch(spec.path, { method: "HEAD" });
        const type = res.headers.get("content-type") ?? "";
        return res.ok && type.startsWith("image/") ? spec : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  present = found.filter((s): s is EntitySpriteSpec => s !== undefined);
}

/** Queues whichever strips {@link discoverEntitySprites} found. */
export function preloadEntitySprites(scene: Phaser.Scene): void {
  for (const spec of present) {
    scene.load.spritesheet(spec.key, spec.path, {
      frameWidth: spec.sourceSize,
      frameHeight: spec.sourceSize,
    });
  }
}

/** Whether a sprite's art actually loaded. */
export function hasEntitySprite(scene: Phaser.Scene, id: EntitySpriteId): boolean {
  return scene.textures.exists(entitySpriteKey(id));
}

// --- the scale rule ----------------------------------------------------------

/**
 * Every sprite's frame size and display height, for the pixel-scale test.
 *
 * Exported as data for the same reason `Vfx.vfxScales` is: the test holds these
 * to the cast's rule without this module importing vitest, and without the test
 * hard-coding numbers that would then have to be kept in step by hand.
 */
export function entitySpriteScales(): {
  id: string;
  displayTiles: readonly DisplayFootprint[];
  sourceSize: number;
}[] {
  return ENTITY_SPRITES.map((s) => ({
    id: s.id,
    displayTiles: s.displayTiles,
    sourceSize: s.sourceSize,
  }));
}

/**
 * Every `id@tiles` pairing that would be resampled on the way to the screen.
 *
 * Named per footprint rather than per sprite because a sprite can be fine at
 * one of its sizes and wrong at another, and "terminal is broken" would not say
 * which of the map's two terminal footprints to look at. A non-square
 * `{ col, row }` footprint is two independent pairings, named `@colN`/`@rowN`
 * so a failure says which axis is off rather than just "the door."
 */
export function assertEntitySpriteScales(): string[] {
  const bad: string[] = [];
  for (const spec of ENTITY_SPRITES) {
    for (const tiles of spec.displayTiles) {
      if (typeof tiles === "number") {
        if (!isPixelPerfect(tiles, spec.sourceSize)) bad.push(`${spec.id}@${tiles}`);
      } else {
        if (!isPixelPerfect(tiles.col, spec.sourceSize)) bad.push(`${spec.id}@col${tiles.col}`);
        if (!isPixelPerfect(tiles.row, spec.sourceSize)) bad.push(`${spec.id}@row${tiles.row}`);
      }
    }
  }
  return bad;
}

/**
 * Ids whose declared frame size disagrees with what the build tool wrote.
 *
 * The two are set in different languages in different files, and a redraw at a
 * new canvas changes only one of them. Everything downstream — the loader's
 * `frameWidth`, the scale rule, the strip's own geometry — is derived from the
 * pair agreeing.
 */
export function assertEntitySpriteSizes(): string[] {
  return ENTITY_SPRITES.filter((s) => SPRITES[s.id]?.size !== s.sourceSize).map(
    (s) => s.id,
  );
}
