import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The naming rules from `docs/NAMING.md`, as something that fails rather than
 * something you have to remember.
 *
 * ### Why this is a test and not a style guide
 *
 * The guide exists too, and it is the readable half. This is the half that works
 * when nobody reads it. The repo already prefers this shape — `assertEntitySpriteSizes`
 * holds two hand-written size tables together, `pixelScale.test.ts` fails the build on
 * a resampled sprite, CI rejects a stale `TYPE_REFERENCE.md` — and each of those
 * replaced a thing somebody had to remember with a thing that says so.
 *
 * It is worth the file because the names it checks are the ones that break *quietly*.
 * A board, a tile-def ref, a component field and a sprite id all cross from the editor
 * into the engine, and a wrong one there does not throw: it reads as absent and the
 * engine substitutes a default. That is exactly how seven component fields spent the
 * project unread (PR #169), and how nine asset files accumulated spaces and mixed
 * separators without anything noticing.
 *
 * ### What it deliberately does not check
 *
 * Item icon PNGs (`EMP_grenade.png`, `flashlight-off.png`) are inconsistent and staying
 * that way for now: they are reached through `ITEM_ICON_PATHS`, a hand-written map, so
 * their names are load-bearing in a way a rename would have to chase. The `.aseprite`
 * sources behind them *are* checked, because nothing but the build tool reads those.
 *
 * Pure except for the directory walk, and it returns findings rather than throwing, so
 * the test can print all of them at once instead of one per run.
 */

export interface NamingViolation {
  /** What was named badly — a path, or `Component.field`. */
  subject: string;
  /** The rule it broke, phrased as the rule rather than as the failure. */
  rule: string;
  /** What to do about it. */
  fix: string;
}

/** Directories whose names are ours to choose. */
const WALKED = ["public/assets", "src", "tools"];

/**
 * Files whose names somebody else decided.
 *
 * `vite-env.d.ts` is Vite's own convention and renaming it would stop it being found.
 */
const NOT_OURS = new Set(["vite-env.d.ts"]);

/**
 * Names out of the fiction, where a hyphen is the story's rather than a style slip.
 *
 * NW-SMAC-01 calls its arena VENT-4 and its Alignment core EIRA-7, and a board named
 * after one should read like the thing it is named after.
 */
const PROPER_NOUNS = new Set(["EIRA-7", "VENT-4_capacitors", "EIRA-7_avatar"]);

/**
 * Component fields that predate the rule, listed so a *new* one still fails.
 *
 * **Delete from this list; never add to it.** Each is safe to leave — field lookup has
 * been case-insensitive since PR #169, so renaming one changes nothing functionally —
 * which is exactly why they need naming here rather than being fixed in a pass nobody
 * asked for. Renaming a field means editing `edplay.json`, which is the map author's
 * export, so it happens when they next open the editor and not before.
 */
const GRANDFATHERED_FIELDS = new Set([
  "Cover.Alarm",
  "Cover.BlockThermal",
  "Cover.Destructible",
  "Cover.Height",
  "Glass.VisionBlock",
  "Human.Behavior",
  "Human.Class",
  "Human.Job",
  "Human.QScore",
  "PowerGrid.State",
  "PowerGrid.Target",
  "Silicate.Class",
  "Silicate.QScore",
  "Silicate.State",
]);

/** Lowercase words joined by single `-` or `_`. Either separator; just not both. */
const LOWER_SEPARATED = /^[a-z0-9]+([-_][a-z0-9]+)*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
/** A `.ts` file is PascalCase or camelCase, optionally `.test`. */
const TS_FILE = /^[A-Za-z][A-Za-z0-9]*(\.test)?\.ts$/;
/** `security_guard_A` — a variant suffix, which is a good pattern and stays. */
const BOARD = /^[a-z][a-z0-9_]*(_[A-Z])?$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** Every naming rule, over the whole repo. Empty means clean. */
export function namingViolations(root = "."): NamingViolation[] {
  const found: NamingViolation[] = [];
  const files = WALKED.flatMap((d) => walk(join(root, d)));

  for (const path of files) {
    const name = basename(path);
    if (NOT_OURS.has(name)) continue;
    const stem = name.replace(/\.[^.]*$/, "");

    // A space breaks shell globs and every tool that takes an unquoted path. It is
    // the one rule with no exceptions anywhere.
    if (name.includes(" ")) {
      found.push({
        subject: path,
        rule: "no spaces in a filename",
        fix: `rename to "${name.replace(/ /g, "_")}"`,
      });
      continue;
    }

    // Mixing separators means nobody can guess which one a given name used.
    if (stem.includes("-") && stem.includes("_") && !PROPER_NOUNS.has(stem)) {
      found.push({
        subject: path,
        rule: "one separator per name, not both `-` and `_`",
        fix: `rename to "${name.replace(/-/g, "_")}"`,
      });
      continue;
    }

    // `.aseprite` sources are lowercase. Deliberately *not* a snake-vs-kebab rule:
    // the repo genuinely uses both — `door_single_east_west` next to `ui-panel` and
    // `hits-1` — and neither is wrong, so enforcing one would be pure churn against
    // names that already read fine. What is wrong is a capital, which is what made
    // `Breaker.aseprite` and `TRIP_LASER_NORTH-SOUTH.aseprite` stand out from their
    // twenty neighbours. Spaces and mixed separators are caught above, for everyone.
    if (name.endsWith(".aseprite") && !LOWER_SEPARATED.test(stem)) {
      found.push({
        subject: path,
        rule: "an .aseprite source is lowercase",
        fix: `rename to "${stem.toLowerCase()}.aseprite", and update its Spec.source`,
      });
    }

    if (name.endsWith(".ts") && !TS_FILE.test(name)) {
      found.push({
        subject: path,
        rule: "a .ts file is PascalCase (it *is* a thing) or camelCase (loose helpers)",
        fix: "rename it, and fix the imports",
      });
    }
  }

  found.push(...mapViolations(join(root, "public/assets/edplay.json")));
  return found;
}

/** The rules that live inside the map export rather than on disk. */
function mapViolations(edplayPath: string): NamingViolation[] {
  const found: NamingViolation[] = [];
  const raw = JSON.parse(readFileSync(edplayPath, "utf8")) as {
    Levels: { Boards?: { Name: string }[] }[];
    DataTypes: { DataStructures: { Name: string; Fields: { Name: string }[] }[] };
  };

  const boards = new Set<string>();
  for (const level of raw.Levels) for (const b of level.Boards ?? []) boards.add(b.Name);
  for (const board of boards) {
    if (PROPER_NOUNS.has(board) || BOARD.test(board)) continue;
    found.push({
      subject: `board "${board}"`,
      rule: "a board is snake_case, optionally with a `_A` variant suffix",
      fix: `rename it in the editor to "${board.toLowerCase().replace(/[- ]/g, "_")}"`,
    });
  }

  for (const ds of raw.DataTypes.DataStructures) {
    for (const field of ds.Fields) {
      const id = `${ds.Name}.${field.Name}`;
      if (CAMEL.test(field.Name) || GRANDFATHERED_FIELDS.has(id)) continue;
      found.push({
        subject: id,
        rule: "a component field is camelCase",
        fix:
          `rename it in the editor to "${field.Name[0].toLowerCase()}${field.Name.slice(1)}" ` +
          `— or add it to GRANDFATHERED_FIELDS if it is going to stay`,
      });
    }
  }

  return found;
}
