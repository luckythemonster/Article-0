import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { EdplayLoader } from "../map/EdplayLoader";
import {
  doorStatsFor,
  lightStatsFor,
  num,
  str,
  terminalStatsFor,
  LIGHT_DEFAULTS,
} from "./EntityStats";
import type { ComponentData, EdPlayFile, GameMap } from "../map/types";

/**
 * The engine reads what the map wrote — checked against the **real** export.
 *
 * ### Why this file exists
 *
 * For the life of the project it did not. `lightStatsFor` asked for `Radius` and
 * NW-SMAC-01 wrote `radius`; the lookup was plain property access, so it missed, and
 * `num` answered the miss with an engine default. Seven fields across five component
 * types were wrong the same way, and nothing looked broken — it looked like a map
 * that had left its tuning blank.
 *
 * The second half was worse. The editor fills every blank field with its
 * DataStructure's own `DefaultValues`, so once the names matched, the editor's
 * placeholder outranked the engine's tuned default: `detectionMultiplier` came
 * through as the editor's `1` and standing in the light stopped costing anything,
 * on all nine levels at once.
 *
 * Both halves were invisible because nothing ever compared the two lists. That is
 * this file's whole job, and it is deliberately pointed at the shipped `edplay.json`
 * rather than a fixture — a fixture would only prove the readers agree with a
 * fixture, which is exactly the failure being guarded against.
 */

/** A fallback no authored value could equal, so "not found" is unambiguous. */
const MISSING = "<no such field>";

let map: GameMap;
let raw: EdPlayFile;

beforeAll(() => {
  raw = JSON.parse(readFileSync("public/assets/edplay.json", "utf8")) as EdPlayFile;
  map = EdplayLoader.parse(
    raw,
    raw.SpriteSheets.map((s) => s.RelativePath),
  ).map;
});

/** Every distinct component the parsed map carries, by tile-def ref. */
function componentsByRef(): Map<string, ComponentData[]> {
  const out = new Map<string, ComponentData[]>();
  for (const level of map.levels) {
    for (const layer of level.layers) {
      for (const t of layer.tiles) {
        if (t.components.length > 0 && !out.has(t.ref)) out.set(t.ref, t.components);
      }
    }
  }
  return out;
}

describe("every value the map chose reaches the engine", () => {
  it("finds each authored field by the export's own spelling", () => {
    // The direct guard on the name mismatch. Any field whose value differs from its
    // schema default was *chosen*, so asking for it — spelled as the export spells
    // it — has to return it. A future component whose names disagree fails here.
    let checked = 0;
    for (const [ref, components] of componentsByRef()) {
      for (const c of components) {
        for (const [field, value] of Object.entries(c.values)) {
          if (c.defaults?.[field] === value) continue;
          // Isolated to this one component, so a tile carrying two of the same
          // type cannot mask a miss behind its sibling.
          expect(str([c], c.type, field, MISSING), `${ref}.${c.type}.${field}`).toBe(value);
          checked++;
        }
      }
    }
    // Guards against the loop above passing because it found nothing to check.
    expect(checked).toBeGreaterThan(10);
  });

  it("finds a field however the caller cases it", () => {
    // The engine upper-camels its constants and the editor lower-camels its fields.
    // Neither side is going to change, so the lookup absorbs it.
    const [components] = [...componentsByRef().values()].filter((cs) =>
      cs.some((c) => c.type === "light_source"),
    );
    expect(num(components, "light_source", "radius", -1)).toBe(
      num(components, "light_source", "RADIUS", -1),
    );
    expect(num(components, "light_source", "Radius", -1)).toBe(
      num(components, "light_source", "radius", -1),
    );
  });

  it("keeps the loose lookup unambiguous", () => {
    // A structure with two fields differing only in case would make the
    // case-insensitive scan a coin flip. None does; this is what says so.
    for (const ds of raw.DataTypes.DataStructures) {
      const names = ds.Fields.map((f) => f.Name);
      expect(new Set(names.map((n) => n.toLowerCase())).size, ds.Name).toBe(names.length);
    }
  });
});

describe("a value only the editor filled in is not a value", () => {
  it("leaves an untouched light on the engine's tuning, not the editor's", () => {
    // `main1`'s fifty overheads author neither field, so the editor supplies its
    // own radius 7 and multiplier 1. Believing those would double every pool on the
    // deck *and* delete the detection penalty for standing in light — which is the
    // mechanic `docs/DESIGN_NOTES.md` opens with.
    const overhead = componentsByRef().get("light_overhead1");
    expect(overhead, "main1's overhead should still exist").toBeDefined();
    const stats = lightStatsFor(overhead!);
    expect(stats.radius).toBe(LIGHT_DEFAULTS.radius);
    expect(stats.detectionMultiplier).toBe(LIGHT_DEFAULTS.detectionMultiplier);
    // And specifically *not* the editor's placeholders.
    expect(stats.radius).not.toBe(7);
    expect(stats.detectionMultiplier).not.toBe(1);
  });

  it("still honours a value that happens to be authored", () => {
    // The other side of the same rule: these differ from the editor's defaults, so
    // they were chosen, so they win. Losing them is what the whole fix was for.
    const flicker = componentsByRef().get("light_overhead_flicker1");
    const stats = lightStatsFor(flicker!);
    expect(stats.radius).toBe(10);
    expect(stats.detectionMultiplier).toBe(0.75);
  });

  it("does not apply to string fields, which need their editor defaults", () => {
    // `InertTerminals` leans on `Terminal.type` arriving as the export's own
    // `LOG_CACHE`, and a door on its `CLOSED`. The rule is `num`-only for exactly
    // this reason — of every numeric field in the export, only `LightSource.radius`
    // and `detectionMultiplier` disagree with the engine at all.
    for (const [ref, components] of componentsByRef()) {
      if (!components.some((c) => c.type === "terminal")) continue;
      expect(str(components, "terminal", "type", MISSING), ref).not.toBe(MISSING);
    }
  });
});

describe("what this actually changed on the shipped map", () => {
  it("gives the amber flickers the reach and the safety they were authored with", () => {
    // `vent_core` and `main2vault`. They had been drawing at 3.5 and scoring 1.6
    // since they were placed — a wide, forgiving deck rendered as a narrow,
    // dangerous one.
    for (const ref of ["light_overhead_flicker1", "light_overhead_flicker2", "light_overhead_flicker3"]) {
      const stats = lightStatsFor(componentsByRef().get(ref)!);
      expect(stats.radius, ref).toBe(10);
      expect(stats.detectionMultiplier, ref).toBe(0.75);
      expect(stats.type, ref).toContain("flick");
    }
  });

  it("lets a door's noise vary by door", () => {
    // Every door carried the engine's flat 4 before, whatever the map said.
    const noises = new Set<number>();
    for (const [, components] of componentsByRef()) {
      if (components.some((c) => c.type === "door")) {
        noises.add(doorStatsFor(components).operationNoise);
      }
    }
    expect(noises.size, `saw ${[...noises].sort().join(", ")}`).toBeGreaterThan(1);
    // The secret door is the loud one, and that is the point of it.
    expect(Math.max(...noises)).toBe(6);
  });

  it("reads a terminal's hack time at all, though no terminal in play uses it", () => {
    // `terminal11`/`terminal12` are the only defs authoring anything but the
    // editor's 2.2, and they author 10. Worth pinning that the reader now sees it —
    // but *not* worth claiming as a balance change, because `AdoptAuthored` moves
    // both defs off the `terminals` board onto `relay_pedestals`/`relay_feed`, so
    // neither ever becomes a `Terminal` and nothing reads their `hackTime`. Every
    // terminal a player actually holds is still 2.2s. Checked in the running game:
    // `roof_array` builds zero terminal entities.
    for (const ref of ["terminal11", "terminal12"]) {
      expect(terminalStatsFor(componentsByRef().get(ref)!).hackTime, ref).toBe(10);
    }
    expect(terminalStatsFor(componentsByRef().get("terminal3")!).hackTime).toBe(2.2);
  });
});
