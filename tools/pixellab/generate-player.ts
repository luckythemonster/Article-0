/**
 * Regenerates the player character's full sprite set from a single south-facing
 * reference frame.
 *
 * Pipeline, in order:
 *
 *   1. Rotate the reference into 8 directions (`/create-character-v3`).
 *   2. Derive a crouched variant of that same character (`/create-character-state`),
 *      so the crouch poses share the rig, outfit and palette instead of being a
 *      second character that merely looks similar.
 *   3. Generate each animation across all 8 directions, at the exact frame counts
 *      `src/entities/PlayerAnimations.ts` expects.
 *   4. Re-canvas every frame onto the fixed square the renderer needs and write
 *      them out with a manifest.
 *
 * Steps 1-3 are slow and cost generations, so progress is checkpointed to a
 * state file after every completed unit of work. Re-running with the same
 * `--state` resumes rather than regenerating, which makes it safe to interrupt,
 * to fix a bug mid-run, or to re-roll one animation with `--only`.
 *
 *     PIXELLAB_API_KEY=... npx tsx tools/pixellab/generate-player.ts \
 *       --reference candidate.png --state .pixellab-player.json
 *
 * Afterwards, always run `npm run gen:colliders` — the physics body is traced
 * from `idle/south/0.png` and will not match the new art until you do.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { balance, download, get, post, awaitJob, toBase64Image } from "./client";
import { boundsHeight, boundsWidth, contentBounds, recanvas, unionBounds, type Bounds } from "./canvas";
import { decodeRgba8, encodeRgba8, type DecodedImage } from "./png";

const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * Output canvas size, in pixels.
 *
 * This must stay in step with `PLAYER_SOURCE_SIZE` in
 * `src/entities/PlayerAnimations.ts`, which explains why the number matters:
 * 96 is the value that makes the player's display scale exactly 0.5, so at the
 * camera's 2x zoom one source pixel covers exactly one screen pixel and the art
 * is never resampled.
 */
const CANVAS = 96;

/** The eight directions, in the order the game's `DIRS_8` lists them. */
const DIRECTIONS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;
type Direction = (typeof DIRECTIONS)[number];

/** Which character sheet an animation is posed from. */
type Sheet = "standing" | "crouched";

interface AnimSpec {
  /** Directory name under `public/assets/player/`, and the key in `PLAYER_ANIM_FRAME_COUNTS`. */
  name: string;
  sheet: Sheet;
  action: string;
  /** Frames requested from the API. Must be even, 4-16. */
  frameCount: number;
  /**
   * Whether the source rotation is kept as frame 0. The API stores
   * `frameCount + 1` frames when true, which is how the 9-frame one-shots are
   * built from an 8-frame request.
   */
  keepFirstFrame: boolean;
  /**
   * The sheet whose rotation is the pose to interpolate toward. Set this and
   * the animation is issued one direction at a time, since the API takes a
   * single end frame per request.
   *
   * Pointing it at a *different* sheet gives a transition. Pointing it at the
   * animation's own sheet gives a closed loop: it starts and ends on the same
   * pose, which is the only way to stop a cycle drifting (see the crouched
   * entries in ANIMS).
   */
  endFrameSheet?: Sheet;
  /** Plays once and holds its last frame, rather than looping. */
  oneShot?: boolean;
}

/**
 * The seven animations, with frame counts matching `PLAYER_ANIM_FRAME_COUNTS`
 * exactly. Changing a count here without changing it there desynchronises the
 * loader from the assets on disk.
 *
 * The two crouched loops pin their end frame to their own sheet. Left to run
 * open-ended, the motion model treats the crouch as a pose to move *out of* and
 * walks the character back up toward the template's neutral stance over the
 * cycle — which loops as Rowan repeatedly standing and dropping rather than
 * holding a crouch. Anchoring both ends to the crouched rotation forces the
 * cycle closed. The standing loops need no such anchor: neutral is where they
 * already start.
 */
const ANIMS: AnimSpec[] = [
  { name: "idle", sheet: "standing", action: "standing still, breathing, weight shifting slightly", frameCount: 4, keepFirstFrame: false },
  { name: "walk", sheet: "standing", action: "walking forward at a steady pace", frameCount: 4, keepFirstFrame: false },
  { name: "run", sheet: "standing", action: "running forward urgently, leaning into the stride", frameCount: 4, keepFirstFrame: false },
  { name: "crouch", sheet: "crouched", action: "holding a low crouch, breathing, staying low throughout", frameCount: 4, keepFirstFrame: false, endFrameSheet: "crouched" },
  { name: "crouch-walk", sheet: "crouched", action: "creeping forward one full stride while staying crouched low throughout", frameCount: 6, keepFirstFrame: false, endFrameSheet: "crouched" },
  { name: "crouch-down", sheet: "standing", action: "lowering from standing into a low crouch", frameCount: 8, keepFirstFrame: true, endFrameSheet: "crouched", oneShot: true },
  { name: "crouch-up", sheet: "crouched", action: "rising from a low crouch back up to standing", frameCount: 8, keepFirstFrame: true, endFrameSheet: "standing", oneShot: true },
];

const CHARACTER_PROMPT =
  "Rowan Ibarra, a weary human orderly aboard a Commonwealth station. Pale bone-white and light " +
  "grey jumpsuit with dark charcoal harness straps, bright cyan interface cables, badge NW-ORD-3A " +
  "on the chest, heavy slouched posture under high gravity, strong value contrast, crisp black outline.";

const CROUCH_EDIT =
  "crouched low to the ground, knees deeply bent, torso lowered and compact, head tucked down, " +
  "sneaking stance";

/** Everything the run has completed so far. Written after each unit of work. */
interface State {
  reference?: string;
  standing?: string;
  crouched?: string;
  /** Animation name -> direction -> ordered frame URLs. */
  frames: Record<string, Partial<Record<Direction, string[]>>>;
  /**
   * Animation name -> the animation groups this tool created for it.
   *
   * A character accumulates animations rather than replacing them, so
   * re-rolling `crouch` leaves the old one sitting alongside the new one under
   * the same name. Recording which groups belong to the current take is what
   * makes a re-roll actually take effect.
   */
  groups?: Record<string, string[]>;
}

async function main(): Promise<void> {
  const statePath = path.resolve(argValue("--state") ?? path.join(ROOT, ".pixellab-player.json"));
  const outDir = path.resolve(argValue("--out") ?? path.join(ROOT, "public", "assets", "player"));
  const only = argValue("--only");
  const redo = (argValue("--redo") ?? "").split(",").filter(Boolean);
  const state = readState(statePath);

  const before = await balance();
  console.log(`Generations remaining: ${before.subscription?.generations ?? "?"}\n`);

  // --- 1. Standing character: 8 rotations from the chosen reference ---------
  if (!state.standing) {
    const referencePath = argValue("--reference");
    if (!referencePath) throw new Error("--reference <south-facing.png> is required to create a new character");
    const reference = fs.readFileSync(path.resolve(referencePath));
    const decoded = decodeRgba8(reference);
    console.log(`Rotating ${referencePath} (${decoded.width}x${decoded.height}) into 8 directions...`);

    const created = (await post("/create-character-v3", {
      description: CHARACTER_PROMPT,
      reference_image: toBase64Image(reference),
      image_size: { width: decoded.width, height: decoded.height },
      view: "high top-down",
      template_id: "mannequin",
      name: "Rowan Ibarra",
      no_background: true,
    })) as { background_job_id: string; character_id: string };

    await awaitJob(created.background_job_id, "standing rotations");
    state.standing = created.character_id;
    state.reference = referencePath;
    writeState(statePath, state);
    console.log(`  standing character ${state.standing}\n`);
  }

  // --- 2. Crouched variant of the same character ---------------------------
  if (!state.crouched) {
    console.log("Deriving the crouched state...");
    const created = (await post("/create-character-state", {
      character_id: state.standing,
      edit_description: CROUCH_EDIT,
      state_name: "crouched",
      // Keeps the crouch on the standing sheet's exact palette, so the two
      // never drift apart mid-transition.
      use_color_palette_from_reference: true,
      no_background: true,
    })) as { background_job_id: string; character_id: string };

    await awaitJob(created.background_job_id, "crouched rotations");
    state.crouched = created.character_id;
    writeState(statePath, state);
    console.log(`  crouched character ${state.crouched}\n`);
  }

  const rotations: Record<Sheet, Record<string, string>> = {
    standing: await rotationUrls(state.standing!),
    crouched: await rotationUrls(state.crouched!),
  };

  // --- 3. Animations -------------------------------------------------------
  // Frame URLs always come from the character record rather than the job
  // payload, so a re-run repairs whatever the last one left behind.
  await refreshFrames(state, statePath);

  for (const spec of ANIMS) {
    if (only && spec.name !== only) continue;

    // `--redo` re-rolls an animation that generated badly. Dropping its
    // recorded groups is the part that matters: the previous take stays on the
    // character under the same name, and without this it would keep winning.
    const forced = redo.includes(spec.name);
    if (forced) {
      (state.groups ??= {})[spec.name] = [];
      delete state.frames[spec.name];
      writeState(statePath, state);
    } else if (isComplete(state, spec)) {
      console.log(`${spec.name}: already generated, skipping`);
      continue;
    }

    console.log(`${spec.name}: ${spec.action}`);
    const characterId = spec.sheet === "standing" ? state.standing! : state.crouched!;
    const done = state.frames[spec.name] ?? {};

    if (spec.endFrameSheet) {
      // An end frame is per-request, so anything carrying one — a transition,
      // or a loop anchored to its own sheet — goes one direction at a time.
      for (const direction of DIRECTIONS) {
        if (done[direction]?.length) continue;
        const endFrame = await download(rotations[spec.endFrameSheet][direction]);
        const response = await requestAnimation(characterId, spec, [direction], toBase64Image(endFrame));
        await awaitAll(response, [direction], spec);
        await recordGroups(state, spec, characterId);
        await refreshFrames(state, statePath);
      }
    } else {
      const pending = DIRECTIONS.filter((d) => !done[d]?.length);
      const response = await requestAnimation(characterId, spec, pending);
      await awaitAll(response, pending, spec);
      await recordGroups(state, spec, characterId);
      await refreshFrames(state, statePath);
    }

    if (!isComplete(state, spec)) {
      throw new Error(
        `${spec.name}: finished generating but the character record still does not have ` +
          `${spec.frameCount + (spec.keepFirstFrame ? 1 : 0)} frames in all 8 directions.`,
      );
    }
    console.log("");
  }

  if (only) {
    console.log(`--only ${only} given; stopping before the write step.`);
    return;
  }

  // --- 4. Download, re-canvas, write ---------------------------------------
  await writeFrames(state, outDir);

  const after = await balance();
  console.log(`\nGenerations remaining: ${after.subscription?.generations ?? "?"}`);
  console.log("Next: npm run gen:colliders");
}

function requestAnimation(
  characterId: string,
  spec: AnimSpec,
  directions: readonly Direction[],
  endFrame?: { type: string; base64: string },
): Promise<{ background_job_ids: string[]; directions: string[] }> {
  return post("/characters/animations", {
    character_id: characterId,
    animation_name: spec.name,
    action_description: spec.action,
    mode: "v3",
    frame_count: spec.frameCount,
    keep_first_frame: spec.keepFirstFrame,
    directions,
    ...(endFrame ? { end_frame: endFrame } : {}),
  }) as Promise<{ background_job_ids: string[]; directions: string[] }>;
}

/** Waits out every per-direction job an animation request spawned. */
async function awaitAll(
  response: { background_job_ids: string[]; directions: string[] },
  requested: readonly Direction[],
  spec: AnimSpec,
): Promise<void> {
  const order = (response.directions?.length ? response.directions : requested) as Direction[];
  for (let i = 0; i < response.background_job_ids.length; i++) {
    await awaitJob(response.background_job_ids[i], `${spec.name} ${order[i] ?? i}`);
  }
}

/** Whether every direction of `spec` is present, at the frame count the game expects. */
function isComplete(state: State, spec: AnimSpec): boolean {
  const expected = spec.frameCount + (spec.keepFirstFrame ? 1 : 0);
  const done = state.frames[spec.name];
  return !!done && DIRECTIONS.every((d) => done[d]?.length === expected);
}

/**
 * Rebuilds the frame index from both character records.
 *
 * The character is the source of truth, not the job payload. A completed job
 * reports that frames exist but not where they live, whereas each character
 * carries its animations keyed by the `animation_name` this tool sent — and
 * already trimmed to the stored frame count, so `keep_first_frame` needs no
 * compensating here. Reading it back also means a re-run repairs a partial or
 * mis-parsed previous run instead of inheriting it.
 */
async function refreshFrames(state: State, statePath: string): Promise<void> {
  const all = [
    ...(await characterAnimations(state.standing!)),
    ...(await characterAnimations(state.crouched!)),
  ];

  const merged: State["frames"] = {};
  for (const spec of ANIMS) {
    const recorded = state.groups?.[spec.name];
    let takes = all.filter((a) => a.display_name === spec.name);
    // Once this run has recorded groups for an animation, they are the only
    // ones that count — that is what lets a `--redo` beat the take it replaced.
    if (recorded?.length) {
      takes = recorded.flatMap((group) => takes.filter((a) => a.animation_group_id === group));
    }

    // Last writer wins. Each take carries a whole set of directions, so a later
    // one replaces an earlier one wholesale rather than interleaving with it —
    // a direction is never a blend of two generations. The transitions are the
    // exception by design: they are issued per direction, so each take
    // contributes the single direction it owns.
    const directions: Partial<Record<Direction, string[]>> = {};
    for (const take of takes) {
      for (const entry of take.directions ?? []) {
        if (entry.frames?.length) directions[entry.direction as Direction] = entry.frames;
      }
    }
    if (Object.keys(directions).length) merged[spec.name] = directions;
  }

  state.frames = merged;
  writeState(statePath, state);
}

/** Notes which animation groups appeared on the character as a result of this request. */
async function recordGroups(state: State, spec: AnimSpec, characterId: string): Promise<void> {
  const known = new Set((state.groups?.[spec.name] ?? []).filter(Boolean));
  for (const animation of await characterAnimations(characterId)) {
    if (animation.display_name !== spec.name || !animation.animation_group_id) continue;
    known.add(animation.animation_group_id);
  }
  (state.groups ??= {})[spec.name] = [...known];
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

/**
 * Downloads every frame, re-canvases the whole set through one shared bounding
 * box, and writes the result alongside a manifest.
 *
 * The single shared box is the important part: cropping each frame to its own
 * content would re-centre the character on every tick and wreck the motion.
 */
async function writeFrames(state: State, outDir: string): Promise<void> {
  console.log("\nDownloading frames...");
  const decoded: { anim: string; direction: Direction; frame: number; image: ReturnType<typeof decodeRgba8> }[] = [];

  // Driven off ANIMS, not off whatever the character happens to hold: a
  // character can accumulate extra animations from earlier experiments, and
  // only the seven the game loads belong on disk.
  for (const spec of ANIMS) {
    const directions = state.frames[spec.name];
    if (!directions) throw new Error(`${spec.name} was never generated — re-run without --only`);
    for (const direction of DIRECTIONS) {
      const urls = directions[direction];
      if (!urls) throw new Error(`${spec.name}/${direction} has no frames — re-run without --only`);
      for (let frame = 0; frame < urls.length; frame++) {
        decoded.push({ anim: spec.name, direction, frame, image: decodeRgba8(await download(urls[frame])) });
      }
    }
    console.log(`  ${spec.name}: ${DIRECTIONS.length * (directions.south?.length ?? 0)} frames`);
  }

  // One shared bounding box only means anything if the frames share a
  // coordinate space, so a mismatched canvas has to stop the run rather than
  // silently translate half the set.
  const odd = decoded.find((e) => e.image.width !== decoded[0].image.width || e.image.height !== decoded[0].image.height);
  if (odd) {
    throw new Error(
      `${odd.anim}/${odd.direction}/${odd.frame} is ${odd.image.width}x${odd.image.height} but the set is ` +
        `${decoded[0].image.width}x${decoded[0].image.height}; frames must share one canvas to share one crop.`,
    );
  }

  assertLoopsClose(decoded);

  const boxes: Bounds[] = [];
  for (const entry of decoded) {
    const box = contentBounds(entry.image);
    if (box) boxes.push(box);
  }
  const shared = unionBounds(boxes);
  console.log(
    `\nShared content box: ${boundsWidth(shared)}x${boundsHeight(shared)} ` +
      `at (${shared.minX},${shared.minY}) -> ${CANVAS}x${CANVAS} canvas`,
  );

  const manifest: { anim: string; direction: string; frame: number; key: string; path: string }[] = [];
  for (const entry of decoded) {
    const dir = path.join(outDir, entry.anim, entry.direction);
    fs.mkdirSync(dir, { recursive: true });
    const pixels = recanvas(entry.image, shared, CANVAS);
    fs.writeFileSync(path.join(dir, `${entry.frame}.png`), encodeRgba8(CANVAS, CANVAS, pixels));
    manifest.push({
      anim: entry.anim,
      direction: entry.direction,
      frame: entry.frame,
      key: `player-${entry.anim}-${entry.direction}-${entry.frame}`,
      path: `assets/player/${entry.anim}/${entry.direction}/${entry.frame}.png`,
    });
  }

  // One-space indent matches the other asset manifests in public/assets.
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`Wrote ${manifest.length} frames + manifest.json to ${outDir}`);
}

/**
 * Largest silhouette change a looping cycle may show between its last frame and
 * its first, in pixels. A walk or run legitimately lands on a different foot,
 * so this is not zero; a cycle that has wandered into a different *stance* is
 * far outside it.
 */
const MAX_LOOP_DRIFT = 5;

/**
 * Rejects looping animations that do not end where they began.
 *
 * The game plays every non-transition clip with `repeat: -1`, so a cycle whose
 * last frame differs from its first snaps on every wrap. When the drift is a
 * change of stance rather than a footfall the result is unmistakable — a held
 * crouch that reads as the character standing up and dropping again, over and
 * over. Silhouette height is a blunt measure but it catches exactly that,
 * which is the failure the motion model actually produces.
 */
function assertLoopsClose(
  decoded: { anim: string; direction: Direction; frame: number; image: DecodedImage }[],
): void {
  const failures: string[] = [];

  for (const spec of ANIMS) {
    if (spec.oneShot) continue;
    for (const direction of DIRECTIONS) {
      const frames = decoded
        .filter((e) => e.anim === spec.name && e.direction === direction)
        .sort((a, b) => a.frame - b.frame);
      const first = contentBounds(frames[0].image);
      const last = contentBounds(frames[frames.length - 1].image);
      if (!first || !last) continue;
      const drift = Math.abs(boundsHeight(last) - boundsHeight(first));
      if (drift > MAX_LOOP_DRIFT) {
        failures.push(
          `  ${spec.name}/${direction}: ${boundsHeight(first)}px tall on frame 0, ` +
            `${boundsHeight(last)}px on frame ${frames.length - 1} (drift ${drift}px)`,
        );
      }
    }
  }

  if (failures.length) {
    throw new Error(
      `These looping animations do not return to their starting pose, so they will snap ` +
        `every time they wrap:\n${failures.join("\n")}\n` +
        `Give the animation an \`endFrameSheet\` pointing at its own sheet to anchor both ` +
        `ends of the cycle, then re-run.`,
    );
  }
}

function readState(file: string): State {
  if (!fs.existsSync(file)) return { frames: {} };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as State;
  return { ...parsed, frames: parsed.frames ?? {} };
}

function writeState(file: string, state: State): void {
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
