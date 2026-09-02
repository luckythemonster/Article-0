import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { namingViolations, type NamingViolation } from "./naming";

/**
 * The naming rules, enforced over the real repo — see `docs/NAMING.md` for the
 * readable half and `naming.ts` for why this exists as a test at all.
 *
 * Two halves. The first points the lint at this repository and expects silence; the
 * second points it at a directory built to be wrong, because a lint that passes over
 * a repo it failed to read looks exactly like one that passes over a clean repo. Every
 * bad name in the fixture was really in `public/assets` until the commit that added
 * this file.
 */

const describeAll = (found: NamingViolation[]): string =>
  found.map((v) => `\n  ${v.subject}\n    rule: ${v.rule}\n    fix:  ${v.fix}`).join("");

describe("naming — the real repo", () => {
  it("has nothing named against the rules", () => {
    const found = namingViolations();
    expect(found, describeAll(found)).toEqual([]);
  });

  it("read enough to be worth trusting", () => {
    // Guards the assertion above against the failure mode it cannot see: a walk that
    // found nothing, or an `edplay.json` that failed to parse into any boards, passes
    // just as quietly as a clean repo. Deliberately loose — this is a floor, not a
    // count somebody has to keep up to date.
    expect(namingViolations("."), "the lint should have walked the repo").toEqual([]);
    const { fileCount, boardCount, fieldCount } = countsFor(".");
    expect(fileCount).toBeGreaterThan(100);
    expect(boardCount).toBeGreaterThan(30);
    expect(fieldCount).toBeGreaterThan(20);
  });
});

describe("naming — a directory built to be wrong", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "naming-"));
    mkdirSync(join(root, "public/assets/sprites"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "tools"), { recursive: true });

    const asset = (name: string): void =>
      writeFileSync(join(root, "public/assets/sprites", name), "");
    // One per rule, each a real name this repo carried.
    asset("big bulkhead.aseprite"); // a space
    asset("door_single_east-west.aseprite"); // `-` and `_` in one name
    asset("Breaker.aseprite"); // a capital
    writeFileSync(join(root, "src", "some_module.ts"), ""); // snake in TS
    // A board and a field the engine would read straight past.
    writeFileSync(
      join(root, "public/assets/edplay.json"),
      JSON.stringify({
        Levels: [{ Boards: [{ Name: "Light Sources" }, { Name: "light_sources" }] }],
        DataTypes: {
          DataStructures: [
            { Name: "LightSource", Fields: [{ Name: "Radius" }, { Name: "radius" }] },
          ],
        },
      }),
    );
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const subjects = (): string[] => namingViolations(root).map((v) => v.subject);

  it("catches a space in a filename", () => {
    expect(subjects().some((s) => s.includes("big bulkhead"))).toBe(true);
  });

  it("catches `-` and `_` mixed in one name", () => {
    expect(subjects().some((s) => s.includes("door_single_east-west"))).toBe(true);
  });

  it("catches a capital in an .aseprite source", () => {
    expect(subjects().some((s) => s.includes("Breaker.aseprite"))).toBe(true);
  });

  it("catches a snake_case .ts file", () => {
    expect(subjects().some((s) => s.includes("some_module.ts"))).toBe(true);
  });

  it("catches a board that is not snake_case", () => {
    expect(subjects()).toContain('board "Light Sources"');
  });

  it("catches a component field that is not camelCase", () => {
    expect(subjects()).toContain("LightSource.Radius");
  });

  it("says what to do about each one", () => {
    // The reason this returns findings rather than throwing on the first: a lint that
    // reports "6 violations" sends you looking, and one that names the rename does not.
    for (const v of namingViolations(root)) {
      expect(v.fix.length, `${v.subject} has no fix`).toBeGreaterThan(10);
      expect(v.rule.length, `${v.subject} has no rule`).toBeGreaterThan(10);
    }
  });

  it("leaves the good names alone", () => {
    const bad = subjects().join(" ");
    expect(bad).not.toContain("light_sources");
    expect(bad).not.toContain("LightSource.radius");
  });
});

/** What the lint actually looked at, for the floor assertions above. */
function countsFor(root: string): {
  fileCount: number;
  boardCount: number;
  fieldCount: number;
} {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  };
  const fileCount = ["public/assets", "src", "tools"].reduce(
    (n, d) => n + walk(join(root, d)).length,
    0,
  );
  const raw = JSON.parse(
    readFileSync(join(root, "public/assets/edplay.json"), "utf8"),
  ) as {
    Levels: { Boards?: { Name: string }[] }[];
    DataTypes: { DataStructures: { Fields: { Name: string }[] }[] };
  };
  const boards = new Set<string>();
  for (const l of raw.Levels) for (const b of l.Boards ?? []) boards.add(b.Name);
  const fieldCount = raw.DataTypes.DataStructures.reduce((n, ds) => n + ds.Fields.length, 0);
  return { fileCount, boardCount: boards.size, fieldCount };
}
