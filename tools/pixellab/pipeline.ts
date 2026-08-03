/**
 * The generation pipeline shared by every character sheet in the game.
 *
 * A character is described by {@link CharacterSpec} — which sheets to create,
 * which animations to draw on them, and what canvas the frames must land on —
 * and this module runs it: create the sheets, generate each animation across all
 * eight directions, then download, re-canvas, validate and write.
 *
 * The parts worth knowing about, because they are all answers to something that
 * actually went wrong:
 *
 * - **Frame URLs come from the character record, never the job payload.** A
 *   completed job reports that frames exist but not where they live. The
 *   character carries them keyed by the animation name this tool sent, already
 *   trimmed to the stored frame count.
 * - **Takes are tracked by animation group.** The API cannot delete a single
 *   animation, so a bad take stays on the character forever under the same name.
 *   Recording which groups belong to the current take is what makes `--redo`
 *   take effect at all.
 * - **Every frame is re-canvased through one shared bounding box.** Cropping per
 *   frame would re-centre the character on every tick and destroy the motion.
 * - **Nothing is written until the frames validate.** See
 *   {@link assertFramesUsable}.
 *
 * Progress is checkpointed after each unit of work, so a run resumes rather than
 * regenerating — which matters when a full character is sixty-odd jobs over the
 * better part of an hour.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { awaitJob, balance, download, get, post, toBase64Image } from "./client";
import {
  bodyBounds,
  boundsHeight,
  boundsWidth,
  contentBounds,
  recanvas,
  unionBounds,
  type Bounds,
} from "./canvas";
import { decodeRgba8, encodeRgba8, type DecodedImage } from "./png";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** The eight directions, in the order the game's `DIRS_8` lists them. */
export const DIRECTIONS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;
export type Direction = (typeof DIRECTIONS)[number];

/**
 * How a character sheet comes into being.
 *
 * `reference` rotates a chosen south-facing sprite into eight directions.
 * `state` applies a text edit to another sheet's rotations, which keeps the rig,
 * outfit and palette identical — the way to get a crouched pose that cannot
 * drift away from the standing one it transitions to.
 */
export type SheetSource =
  | { from: "reference"; description: string; displayName: string }
  | { from: "state"; of: string; edit: string; stateName: string };

export interface SheetSpec {
  /** Name animations refer to this sheet by. */
  name: string;
  source: SheetSource;
}

export interface AnimSpec {
  /** Directory name under `public/assets/<id>/`, and the animation's key in the game. */
  name: string;
  /** Which sheet this animation is posed from. */
  sheet: string;
  action: string;
  /** Frames requested from the API. Must be even, 4-16. */
  frameCount: number;
  /**
   * Whether the source rotation is kept as frame 0. The API stores
   * `frameCount + 1` frames when true, which is how a 9-frame one-shot is built
   * from an 8-frame request.
   */
  keepFirstFrame: boolean;
  /**
   * The sheet whose rotation is the pose to interpolate toward. Set this and the
   * animation is issued one direction at a time, since the API takes a single
   * end frame per request.
   *
   * Pointing it at a *different* sheet gives a transition. Pointing it at the
   * animation's own sheet gives a closed cycle: it starts and ends on the same
   * pose, which is the only reliable way to stop a cycle wandering out of its
   * stance.
   */
  endFrameSheet?: string;
  /** Plays once and holds its last frame, rather than looping. */
  oneShot?: boolean;
}

export interface CharacterSpec {
  /**
   * Asset slug. Frames land at `public/assets/<id>/<anim>/<dir>/<n>.png` and
   * every texture key is `<id>-<anim>-<dir>-<frame>`, matching what the game's
   * loaders build.
   */
  id: string;
  /**
   * Output canvas size, in pixels.
   *
   * Load-bearing rather than descriptive: the sprite is drawn at
   * `displaySize / canvas`, and the camera runs at 2x zoom, so this is what
   * decides how many screen pixels one source pixel covers. Only a whole number
   * is stable — see `PLAYER_SOURCE_SIZE` in `src/entities/PlayerAnimations.ts`
   * for the arithmetic and what goes wrong otherwise.
   */
  canvas: number;
  /** Body type the skeleton estimator fits, e.g. `mannequin`. */
  templateId: string;
  view: string;
  sheets: SheetSpec[];
  anims: AnimSpec[];
  /**
   * Override for {@link MAX_CYCLE_RANGE}, for a character whose cycle
   * legitimately moves more than a walking humanoid's.
   */
  maxCycleRange?: number;
}

export interface RunOptions {
  statePath: string;
  outDir: string;
  /** Restrict the run to one animation. */
  only?: string;
  /** Re-roll takes: animation name -> directions, or null for all of them. */
  redo: Map<string, Set<Direction> | null>;
  /** South-facing sprite to rotate, for the first sheet. */
  reference?: string;
}

/** Everything a run has completed so far. Written after each unit of work. */
interface State {
  reference?: string;
  /** Sheet name -> character id. */
  sheets: Record<string, string>;
  /** Animation name -> direction -> ordered frame URLs. */
  frames: Record<string, Partial<Record<Direction, string[]>>>;
  /** Animation name -> the animation groups this tool created for it. */
  groups?: Record<string, string[]>;
  /** Groups discarded by `--redo`, never read again. */
  retired?: string[];
}

export async function run(spec: CharacterSpec, options: RunOptions): Promise<void> {
  const state = readState(options.statePath);

  const before = await balance();
  console.log(`Generations remaining: ${before.subscription?.generations ?? "?"}\n`);

  await createSheets(spec, options, state);

  const rotations: Record<string, Record<string, string>> = {};
  for (const sheet of spec.sheets) rotations[sheet.name] = await rotationUrls(state.sheets[sheet.name]);

  // Frame URLs always come from the character record rather than the job
  // payload, so a re-run repairs whatever the last one left behind.
  await refreshFrames(spec, state, options.statePath);

  for (const anim of spec.anims) {
    if (options.only && anim.name !== options.only) continue;
    await generateAnimation(spec, anim, options, state, rotations);
  }

  if (options.only) {
    console.log(`--only ${options.only} given; stopping before the write step.`);
    return;
  }

  await writeFrames(spec, state, options.outDir);

  const after = await balance();
  console.log(`\nGenerations remaining: ${after.subscription?.generations ?? "?"}`);
  console.log("Next: npm run gen:colliders");
}

async function createSheets(spec: CharacterSpec, options: RunOptions, state: State): Promise<void> {
  for (const sheet of spec.sheets) {
    if (state.sheets[sheet.name]) continue;

    let created: { background_job_id: string; character_id: string };
    if (sheet.source.from === "reference") {
      if (!options.reference) {
        throw new Error(`--reference <south-facing.png> is required to create the "${sheet.name}" sheet`);
      }
      const reference = fs.readFileSync(path.resolve(options.reference));
      const decoded = decodeRgba8(reference);
      console.log(`Rotating ${options.reference} (${decoded.width}x${decoded.height}) into 8 directions...`);

      created = (await post("/create-character-v3", {
        description: sheet.source.description,
        reference_image: toBase64Image(reference),
        image_size: { width: decoded.width, height: decoded.height },
        view: spec.view,
        template_id: spec.templateId,
        name: sheet.source.displayName,
        no_background: true,
      })) as { background_job_id: string; character_id: string };
      state.reference = options.reference;
    } else {
      const of = state.sheets[sheet.source.of];
      if (!of) throw new Error(`sheet "${sheet.name}" derives from "${sheet.source.of}", which does not exist yet`);
      console.log(`Deriving the "${sheet.name}" sheet...`);

      created = (await post("/create-character-state", {
        character_id: of,
        edit_description: sheet.source.edit,
        state_name: sheet.source.stateName,
        // Keeps the derived sheet on the source's exact palette, so the two
        // never drift apart mid-transition.
        use_color_palette_from_reference: true,
        no_background: true,
      })) as { background_job_id: string; character_id: string };
    }

    await awaitJob(created.background_job_id, `${sheet.name} rotations`);
    state.sheets[sheet.name] = created.character_id;
    writeState(options.statePath, state);
    console.log(`  ${sheet.name} character ${created.character_id}\n`);
  }
}

async function generateAnimation(
  spec: CharacterSpec,
  anim: AnimSpec,
  options: RunOptions,
  state: State,
  rotations: Record<string, Record<string, string>>,
): Promise<void> {
  // `--redo` re-rolls a take that generated badly. Retiring the groups it
  // replaces is the part that matters: the previous take stays on the character
  // under the same name, and would otherwise keep winning.
  const forced = options.redo.has(anim.name);
  if (forced) {
    await retireTake(state, anim, options.redo.get(anim.name));
    // Re-read before deciding what is missing, so `done` below reflects the
    // takes that actually survived rather than the pre-retirement picture.
    await refreshFrames(spec, state, options.statePath);
  } else if (isComplete(state, anim)) {
    console.log(`${anim.name}: already generated, skipping`);
    return;
  }

  console.log(`${anim.name}: ${anim.action}`);
  const characterId = state.sheets[anim.sheet];
  const done = state.frames[anim.name] ?? {};

  if (anim.endFrameSheet) {
    // An end frame is per-request, so anything carrying one — a transition, or
    // a cycle anchored to its own sheet — goes one direction at a time.
    for (const direction of DIRECTIONS) {
      if (done[direction]?.length) continue;
      const endFrame = await download(rotations[anim.endFrameSheet][direction]);
      const response = await requestAnimation(characterId, anim, [direction], toBase64Image(endFrame));
      await awaitAll(response, [direction], anim);
      await recordGroups(state, anim, characterId);
      await refreshFrames(spec, state, options.statePath);
    }
  } else {
    const pending = DIRECTIONS.filter((d) => !done[d]?.length);
    const response = await requestAnimation(characterId, anim, pending);
    await awaitAll(response, pending, anim);
    await recordGroups(state, anim, characterId);
    await refreshFrames(spec, state, options.statePath);
  }

  if (!isComplete(state, anim)) {
    throw new Error(
      `${anim.name}: finished generating but the character record still does not have ` +
        `${expectedFrames(anim)} frames in all 8 directions.`,
    );
  }
  console.log("");
}

function expectedFrames(anim: AnimSpec): number {
  return anim.frameCount + (anim.keepFirstFrame ? 1 : 0);
}

function requestAnimation(
  characterId: string,
  anim: AnimSpec,
  directions: readonly Direction[],
  endFrame?: { type: string; base64: string },
): Promise<{ background_job_ids: string[]; directions: string[] }> {
  return post("/characters/animations", {
    character_id: characterId,
    animation_name: anim.name,
    action_description: anim.action,
    mode: "v3",
    frame_count: anim.frameCount,
    keep_first_frame: anim.keepFirstFrame,
    directions,
    ...(endFrame ? { end_frame: endFrame } : {}),
  }) as Promise<{ background_job_ids: string[]; directions: string[] }>;
}

/** Waits out every per-direction job an animation request spawned. */
async function awaitAll(
  response: { background_job_ids: string[]; directions: string[] },
  requested: readonly Direction[],
  anim: AnimSpec,
): Promise<void> {
  const order = (response.directions?.length ? response.directions : requested) as Direction[];
  for (let i = 0; i < response.background_job_ids.length; i++) {
    await awaitJob(response.background_job_ids[i], `${anim.name} ${order[i] ?? i}`);
  }
}

/** Whether every direction of `anim` is present, at the frame count the game expects. */
function isComplete(state: State, anim: AnimSpec): boolean {
  const done = state.frames[anim.name];
  return !!done && DIRECTIONS.every((d) => done[d]?.length === expectedFrames(anim));
}

/** Rebuilds the frame index from every sheet's character record. */
async function refreshFrames(spec: CharacterSpec, state: State, statePath: string): Promise<void> {
  const all: AnimationRecord[] = [];
  for (const sheet of spec.sheets) all.push(...(await characterAnimations(state.sheets[sheet.name])));

  const retired = new Set(state.retired ?? []);
  const merged: State["frames"] = {};

  for (const anim of spec.anims) {
    const recorded = state.groups?.[anim.name];
    let takes = all.filter(
      (a) => a.display_name === anim.name && !(a.animation_group_id && retired.has(a.animation_group_id)),
    );
    // Once this run has recorded groups for an animation, they are the only ones
    // that count — that is what lets a `--redo` beat the take it replaced.
    if (recorded?.length) {
      takes = recorded.flatMap((group) => takes.filter((a) => a.animation_group_id === group));
    }

    // Last writer wins. Each take carries a whole set of directions, so a later
    // one replaces an earlier one wholesale rather than interleaving with it — a
    // direction is never a blend of two generations. Per-direction animations
    // are the exception by design: each take contributes the one it owns.
    const directions: Partial<Record<Direction, string[]>> = {};
    for (const take of takes) {
      for (const entry of take.directions ?? []) {
        if (entry.frames?.length) directions[entry.direction as Direction] = entry.frames;
      }
    }
    if (Object.keys(directions).length) merged[anim.name] = directions;
  }

  state.frames = merged;
  writeState(statePath, state);
}

/** Notes which animation groups appeared on the character as a result of this request. */
async function recordGroups(state: State, anim: AnimSpec, characterId: string): Promise<void> {
  const retired = new Set(state.retired ?? []);
  const known = new Set((state.groups?.[anim.name] ?? []).filter(Boolean));
  for (const animation of await characterAnimations(characterId)) {
    const group = animation.animation_group_id;
    if (animation.display_name !== anim.name || !group || retired.has(group)) continue;
    known.add(group);
  }
  (state.groups ??= {})[anim.name] = [...known];
}

/**
 * Discards the current take of an animation so the next run replaces it.
 *
 * `directions` narrows the re-roll to specific facings, which matters because
 * generation varies per direction: a cycle can hold its pose in seven directions
 * and drift out of it in the eighth, and re-rolling all eight to fix one risks
 * the seven that came out fine. Only animations issued a direction at a time can
 * be narrowed — a batched request produces one group covering all eight, so
 * there is nothing finer to retire.
 */
async function retireTake(
  state: State,
  anim: AnimSpec,
  directions: Set<Direction> | null | undefined,
): Promise<void> {
  if (directions && !anim.endFrameSheet) {
    throw new Error(
      `--redo ${anim.name}:<direction> is not supported: ${anim.name} is generated for all ` +
        `directions in one request, so its directions cannot be re-rolled separately. ` +
        `Use --redo ${anim.name} to re-roll the whole animation.`,
    );
  }

  const characterId = state.sheets[anim.sheet];
  const takes = (await characterAnimations(characterId)).filter((a) => a.display_name === anim.name);
  const retired = new Set(state.retired ?? []);
  const before = retired.size;

  for (const take of takes) {
    const covered = (take.directions ?? []).map((d) => d.direction as Direction);
    const hit = directions ? covered.some((d) => directions.has(d)) : true;
    if (hit && take.animation_group_id) retired.add(take.animation_group_id);
  }

  state.retired = [...retired];
  state.groups = { ...state.groups, [anim.name]: (state.groups?.[anim.name] ?? []).filter((g) => !retired.has(g)) };
  console.log(
    `  ${anim.name}: retired ${retired.size - before} take(s) covering ` +
      `${directions ? [...directions].join(", ") : "all directions"}`,
  );

  // Which directions survive is worked out by re-reading the character, never by
  // deleting entries here. A retired group can span directions the caller never
  // asked to re-roll — a batched take covers all eight — and clearing them by
  // hand would cascade a one-direction re-roll into a full one.
}

interface AnimationRecord {
  display_name?: string;
  animation_group_id?: string;
  directions?: { direction: string; frames: string[] }[];
}

interface CharacterRecord {
  rotation_urls: Record<string, string>;
  animations?: AnimationRecord[];
}

async function characterAnimations(characterId: string): Promise<AnimationRecord[]> {
  const character = (await get(`/characters/${characterId}`)) as CharacterRecord;
  return character.animations ?? [];
}

async function rotationUrls(characterId: string): Promise<Record<string, string>> {
  const character = (await get(`/characters/${characterId}`)) as CharacterRecord;
  return character.rotation_urls;
}

export interface Frame {
  anim: string;
  direction: Direction;
  frame: number;
  image: DecodedImage;
}

/**
 * Downloads every frame, re-canvases the whole set through one shared bounding
 * box, and writes the result alongside a manifest.
 */
async function writeFrames(spec: CharacterSpec, state: State, outDir: string): Promise<void> {
  console.log("\nDownloading frames...");
  const decoded: Frame[] = [];

  // Driven off the spec, not off whatever the character happens to hold: a
  // character accumulates animations from earlier experiments, and only the ones
  // the game loads belong on disk.
  for (const anim of spec.anims) {
    const directions = state.frames[anim.name];
    if (!directions) throw new Error(`${anim.name} was never generated — re-run without --only`);
    for (const direction of DIRECTIONS) {
      const urls = directions[direction];
      if (!urls) throw new Error(`${anim.name}/${direction} has no frames — re-run without --only`);
      for (let frame = 0; frame < urls.length; frame++) {
        decoded.push({ anim: anim.name, direction, frame, image: decodeRgba8(await download(urls[frame])) });
      }
    }
    console.log(`  ${anim.name}: ${DIRECTIONS.length * (directions.south?.length ?? 0)} frames`);
  }

  writeFrameSet(spec, decoded, outDir);
}

/**
 * Validates a complete frame set and writes it to disk.
 *
 * Split from the download so a set assembled another way — `rescale.ts` redraws
 * the frames already on disk rather than generating new ones — goes through the
 * same checks and the same re-canvasing rather than a second implementation of
 * them.
 */
export function writeFrameSet(
  spec: CharacterSpec,
  decoded: Frame[],
  outDir: string,
  baseline?: Frame[],
): void {
  // One shared bounding box only means anything if the frames share a coordinate
  // space, so a mismatched canvas has to stop the run rather than silently
  // translate half the set.
  const odd = decoded.find(
    (e) => e.image.width !== decoded[0].image.width || e.image.height !== decoded[0].image.height,
  );
  if (odd) {
    throw new Error(
      `${odd.anim}/${odd.direction}/${odd.frame} is ${odd.image.width}x${odd.image.height} but the set is ` +
        `${decoded[0].image.width}x${decoded[0].image.height}; frames must share one canvas to share one crop.`,
    );
  }

  assertFramesUsable(spec, decoded, baseline);

  const boxes: Bounds[] = [];
  for (const entry of decoded) {
    const box = contentBounds(entry.image);
    if (box) boxes.push(box);
  }
  const shared = unionBounds(boxes);
  console.log(
    `\nShared content box: ${boundsWidth(shared)}x${boundsHeight(shared)} ` +
      `at (${shared.minX},${shared.minY}) -> ${spec.canvas}x${spec.canvas} canvas`,
  );

  const manifest: { anim: string; direction: string; frame: number; key: string; path: string }[] = [];
  for (const entry of decoded) {
    const dir = path.join(outDir, entry.anim, entry.direction);
    fs.mkdirSync(dir, { recursive: true });
    const pixels = recanvas(entry.image, shared, spec.canvas);
    fs.writeFileSync(path.join(dir, `${entry.frame}.png`), encodeRgba8(spec.canvas, spec.canvas, pixels));
    manifest.push({
      anim: entry.anim,
      direction: entry.direction,
      frame: entry.frame,
      key: `${spec.id}-${entry.anim}-${entry.direction}-${entry.frame}`,
      path: `assets/${spec.id}/${entry.anim}/${entry.direction}/${entry.frame}.png`,
    });
  }

  // One-space indent matches the other asset manifests in public/assets.
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`Wrote ${manifest.length} frames + manifest.json to ${outDir}`);
}

/**
 * How much a looping cycle's body height may vary across the whole cycle.
 *
 * Measured, not guessed: on the player, idle and run vary by 4px, walk by 2,
 * crouch-walk by 4 — a gait genuinely rises and falls. A cycle that leaves its
 * *stance* is far outside that; the crouch that prompted this check varied by 11.
 *
 * The comparison spans every frame rather than just the first and last. A cycle
 * can start and end correctly crouched and still bulge to standing height in the
 * middle, which loops as a bob and is exactly as wrong.
 */
const MAX_CYCLE_RANGE = 6;

/**
 * How far the full opaque box may exceed the body's, per frame.
 *
 * The gap is detached content: pixels the generator left floating clear of the
 * character. They are a small fraction of the sprite — under 2% — so counting
 * pixels does not find them, but they sit in the empty space around the
 * character where they read as debris popping in and out.
 */
const MAX_DETACHED = 5;

/**
 * How far a redrawn frame's body may differ from the frame it was drawn from.
 *
 * Measured across the drone's 64 frames, where the largest deviation was 4px.
 */
const MAX_FIDELITY_DRIFT = 5;

/**
 * Rejects frames carrying floating debris, and cycles that do not hold their
 * pose.
 *
 * Both are measured on the largest connected component rather than raw alpha.
 * That matters in both directions: debris would otherwise inflate the pose
 * measurement and mask a bad cycle, and comparing the two boxes is the only way
 * the debris itself shows up.
 *
 * `baseline` switches what "holding a pose" is measured against. Without it,
 * each cycle is judged in the absolute — the right question for art generated
 * from nothing, where a crouch really can wander into a stand. With it, each
 * frame is compared against the one it was redrawn from, which is the right
 * question for a rescale: the source art already shipped, so its motion is not
 * on trial, and the only thing that can go wrong is the redraw departing from
 * it. Applying the absolute rule to a rescale means re-litigating whatever the
 * source already does — for the drone that meant flagging a diagonal gait whose
 * silhouette varies by 16px in the *shipped* art, which the redraw reproduced
 * to within 4.
 */
export function assertFramesUsable(spec: CharacterSpec, decoded: Frame[], baseline?: Frame[]): void {
  const maxRange = spec.maxCycleRange ?? MAX_CYCLE_RANGE;
  const failures: string[] = [];

  const scale = baseline?.length ? spec.canvas / baseline[0].image.width : 1;
  const baselineHeight = new Map<string, number>();
  for (const frame of baseline ?? []) {
    const body = bodyBounds(frame.image);
    if (body) baselineHeight.set(`${frame.anim}/${frame.direction}/${frame.frame}`, boundsHeight(body) * scale);
  }

  for (const anim of spec.anims) {
    for (const direction of DIRECTIONS) {
      const frames = decoded
        .filter((e) => e.anim === anim.name && e.direction === direction)
        .sort((a, b) => a.frame - b.frame);

      const heights: number[] = [];
      for (const frame of frames) {
        const body = bodyBounds(frame.image);
        const whole = contentBounds(frame.image);
        if (!body || !whole) continue;
        heights.push(boundsHeight(body));

        const detached = boundsHeight(whole) - boundsHeight(body);
        if (detached > MAX_DETACHED) {
          failures.push(
            `  ${anim.name}/${direction}/${frame.frame}: ${detached}px of content floating clear ` +
              `of the character (body ${boundsHeight(body)}px, full box ${boundsHeight(whole)}px)`,
          );
        }

        const was = baselineHeight.get(`${anim.name}/${direction}/${frame.frame}`);
        if (was !== undefined && Math.abs(boundsHeight(body) - was) > MAX_FIDELITY_DRIFT) {
          failures.push(
            `  ${anim.name}/${direction}/${frame.frame}: redrawn body is ${boundsHeight(body)}px ` +
              `where the source scales to ${was.toFixed(0)}px — the redraw did not keep the pose`,
          );
        }
      }

      // A transition is supposed to change stance, so only cycles are held to a
      // stable height — and only when there is no source to compare against.
      if (baseline?.length || anim.oneShot || heights.length === 0) continue;
      const range = Math.max(...heights) - Math.min(...heights);
      if (range > maxRange) {
        failures.push(
          `  ${anim.name}/${direction}: body height swings ${range}px across the cycle ` +
            `(${heights.join(", ")}) — it does not hold its pose`,
        );
      }
    }
  }

  if (failures.length) {
    throw new Error(
      `These frames are not usable:\n${failures.join("\n")}\n\n` +
        `A cycle that will not hold its pose usually needs an \`endFrameSheet\` pointing at ` +
        `its own sheet. Otherwise re-roll the affected facings with --redo <anim>:<direction>.`,
    );
  }
}

function readState(file: string): State {
  if (!fs.existsSync(file)) return { sheets: {}, frames: {} };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as State;
  return { ...parsed, sheets: parsed.sheets ?? {}, frames: parsed.frames ?? {} };
}

function writeState(file: string, state: State): void {
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Parses `--redo` into animation name -> directions to re-roll.
 *
 * `crouch` re-rolls every direction; `crouch:south` re-rolls one; both forms can
 * be combined, comma-separated. A `null` value means the whole animation.
 */
export function parseRedo(raw: string | undefined, anims: AnimSpec[]): Map<string, Set<Direction> | null> {
  const targets = new Map<string, Set<Direction> | null>();

  for (const entry of (raw ?? "").split(",").filter(Boolean)) {
    const [name, direction] = entry.split(":");
    if (!anims.some((a) => a.name === name)) {
      throw new Error(`--redo: no animation called "${name}". Known: ${anims.map((a) => a.name).join(", ")}`);
    }
    if (!direction) {
      targets.set(name, null);
      continue;
    }
    if (!DIRECTIONS.includes(direction as Direction)) {
      throw new Error(`--redo: no direction called "${direction}". Known: ${DIRECTIONS.join(", ")}`);
    }
    // An entry naming the whole animation wins over one naming a direction.
    if (targets.has(name) && targets.get(name) === null) continue;
    const existing = targets.get(name) ?? new Set<Direction>();
    existing.add(direction as Direction);
    targets.set(name, existing);
  }
  return targets;
}

/** Reads the CLI flags every generator entry point shares. */
export function runOptions(spec: CharacterSpec): RunOptions {
  return {
    statePath: path.resolve(argValue("--state") ?? path.join(ROOT, `.pixellab-${spec.id}.json`)),
    outDir: path.resolve(argValue("--out") ?? path.join(ROOT, "public", "assets", spec.id)),
    only: argValue("--only"),
    redo: parseRedo(argValue("--redo"), spec.anims),
    reference: argValue("--reference"),
  };
}

export function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Runs a spec as a CLI entry point, reporting failures without a stack trace. */
export function main(spec: CharacterSpec): void {
  run(spec, runOptions(spec)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
