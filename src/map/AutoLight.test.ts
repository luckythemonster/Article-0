import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { EdplayLoader } from "./EdplayLoader";
import { typeInertTerminals } from "./InertTerminals";
import { planFor } from "./MapPlan";
import { appendVentCore } from "./VentCoreLevel";
import { appendLogCacheBeta } from "./LogCacheBeta";
import { appendAlignmentVault } from "./AlignmentVault";
import { appendRoofArray, ROOF_ARRAY_LEVEL } from "./RoofArrayLevel";
import { blockedTiles, standableIn } from "./generate";
import {
  autoLight,
  isDerivedCircuit,
  LIGHT_SWITCH_BOARD,
  emergencyRef,
  EMERGENCY_BRIGHTNESS,
  EMERGENCY_MULTIPLIER,
  EMERGENCY_RADIUS_TILES,
  LIGHT_SWITCH_COMPONENT,
  SWITCH_TILES,
  zoneOfEmergency,
  UNLIT_BOARD,
  ZONE_TILES,
} from "./AutoLight";
import { lightStatsFor, lightSwitchStatsFor } from "../systems/EntityStats";
import type { EdPlayFile, GameLevel, GameMap, GameTile } from "./types";

/**
 * Derived lighting, tested against the **real** `edplay.json` — the same approach
 * as `GeneratedActs.test.ts`, and for the same reason: this module exists to make
 * one specific export playable without hand-placing 127 lamps, and a fixture map
 * would only prove it fits the fixture.
 *
 * The two halves worth pinning are opposite claims. On the four levels nobody lit,
 * everything here has to *fire*. On `main1`, where somebody lit fifty tiles by hand,
 * everything here has to *stay out of the way* — that is the promise the feature
 * makes to a map that has already been authored, and it is the one a future change
 * to the suppression rule would silently break.
 */

/** The decks NW-SMAC-01 ships with no `light_sources` board at all. */
const UNLIT_DECKS = ["duct1", "duct2", "secret1", "secret2"];

let map: GameMap;
/** Light counts per level as the map authored them, before any derivation. */
let authored: Map<string, number>;

function level(name: string): GameLevel {
  const l = map.levels.find((x) => x.name === name);
  if (!l) throw new Error(`no level "${name}"`);
  return l;
}

const lightsOn = (l: GameLevel): GameTile[] =>
  l.layers.find((x) => x.name === "light_sources")?.tiles ?? [];

const switchesOn = (l: GameLevel): GameTile[] =>
  l.layers.find((x) => x.name === LIGHT_SWITCH_BOARD)?.tiles ?? [];

/** Every fixture this module added, overheads and emergency lamps alike. */
const allDerivedOn = (l: GameLevel): GameTile[] =>
  lightsOn(l).filter((t) => isDerivedCircuit(t.ref));

/** The overheads only — one per lit zone, and what a zone's ref names. */
const derivedOn = (l: GameLevel): GameTile[] =>
  allDerivedOn(l).filter((t) => zoneOfEmergency(t.ref) === t.ref);

/** The emergency lamps only — one per zone that got a plate to hang it on. */
const emergencyOn = (l: GameLevel): GameTile[] =>
  allDerivedOn(l).filter((t) => zoneOfEmergency(t.ref) !== t.ref);

beforeAll(() => {
  const raw = JSON.parse(readFileSync("public/assets/edplay.json", "utf8")) as EdPlayFile;
  typeInertTerminals(raw);
  const parsed = EdplayLoader.parse(
    raw,
    raw.SpriteSheets.map((s) => s.RelativePath),
  );
  map = parsed.map;

  // The same order boot uses. Derivation runs last, after every act has finished
  // changing the geometry it reads.
  const plan = planFor(map);
  appendVentCore(map, plan.ventCoreHost);
  appendLogCacheBeta(map, plan.ventCoreHost);
  appendAlignmentVault(map, plan.vaultHost);
  appendRoofArray(map, plan.extractionLevel);

  authored = new Map(map.levels.map((l) => [l.name, lightsOn(l).length]));
  autoLight(map);
});

describe("autoLight — the decks nobody lit", () => {
  it.each(UNLIT_DECKS)("lights %s, which shipped pitch black", (name) => {
    const l = level(name);
    expect(authored.get(name)).toBe(0);
    expect(derivedOn(l).length).toBeGreaterThan(0);
  });

  it("puts every derived light somewhere a player could stand", () => {
    for (const l of map.levels) {
      const blocked = blockedTiles(l, ["walls"]);
      const floor = new Set(
        (l.layers.find((x) => x.name === "floor")?.tiles ?? []).map((t) => `${t.x},${t.y}`),
      );
      for (const t of derivedOn(l)) {
        const at = `${t.x},${t.y}`;
        expect(blocked.has(at), `${l.name} lit a wall at ${at}`).toBe(false);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThan(l.width);
        expect(t.y).toBeLessThan(l.height);
        if (floor.size > 0) expect(floor.has(at), `${l.name} lit the void at ${at}`).toBe(true);
      }
    }
  });

  it("keeps each derived light inside the zone it is named for", () => {
    for (const l of map.levels) {
      for (const t of derivedOn(l)) {
        const col = Math.floor(t.x / ZONE_TILES);
        const row = Math.floor(t.y / ZONE_TILES);
        expect(t.ref, `${l.name} light at ${t.x},${t.y}`).toBe(`${l.name}__z${col}_${row}`);
      }
    }
  });

  it("gives a derived light a radius rather than falling back to the default", () => {
    // `EntityStats.num` reads 0 as unset, so a light that authored one would
    // silently take the engine's 3.5 and leave dark seams between zones.
    for (const t of derivedOn(level("duct1"))) {
      expect(lightStatsFor(t.components).radius).toBeGreaterThan(ZONE_TILES / 2);
    }
  });
});

describe("autoLight — staying out of an author's way", () => {
  it("leaves main1's fifty hand-placed overheads alone", () => {
    expect(authored.get("main1")).toBe(50);
    expect(derivedOn(level("main1"))).toHaveLength(0);
    expect(switchesOn(level("main1"))).toHaveLength(0);
  });

  it("adds nothing to main2, which the map also lit throughout", () => {
    // Not zero — `main2` is 56 lights over a deck with corners they don't reach —
    // but small enough to be filling gaps rather than relighting the level.
    expect(derivedOn(level("main2")).length).toBeLessThan(authored.get("main2")! / 10);
  });

  it("never lights a zone an authored fixture already covers", () => {
    for (const l of map.levels) {
      const hand = lightsOn(l).filter((t) => !isDerivedCircuit(t.ref));
      for (const d of derivedOn(l)) {
        for (const h of hand) {
          const reach = lightStatsFor(h.components).radius;
          const dx = h.x - d.x;
          const dy = h.y - d.y;
          // Measured to the zone centre, which is where the derived light sits
          // unless a wall pushed it — so allow the nudge.
          expect(
            Math.sqrt(dx * dx + dy * dy),
            `${l.name}: derived ${d.ref} sits inside an authored pool`,
          ).toBeGreaterThan(reach - ZONE_TILES);
        }
      }
    }
  });

  it("leaves the rooftop dark, because its difficulty is the dark", () => {
    const roof = level(ROOF_ARRAY_LEVEL);
    expect(roof.layers.some((l) => l.name === UNLIT_BOARD)).toBe(true);
    expect(derivedOn(roof)).toHaveLength(0);
    expect(switchesOn(roof)).toHaveLength(0);
    expect(roof.circuits).toBeUndefined();
  });

  it("cannot collide with a ref the map authored", () => {
    const handRefs = new Set<string>();
    for (const l of map.levels) {
      for (const layer of l.layers) {
        for (const t of layer.tiles) if (!isDerivedCircuit(t.ref)) handRefs.add(t.ref);
      }
    }
    for (const l of map.levels) {
      for (const t of derivedOn(l)) expect(handRefs.has(t.ref)).toBe(false);
    }
  });

  it("is idempotent — boot must not be able to light the map twice", () => {
    const before = map.levels.map((l) => [lightsOn(l).length, switchesOn(l).length]);
    autoLight(map);
    autoLight(map);
    expect(map.levels.map((l) => [lightsOn(l).length, switchesOn(l).length])).toEqual(before);
  });
});

describe("autoLight — emergency lighting", () => {
  it("hangs one lamp on every plate, and only on a plate", () => {
    // The art puts the emergency lamp on the switch, so a zone with no wall to
    // mount a plate has no fallback light — it can only be darkened by a breaker,
    // and a breaker is supposed to mean darkness.
    for (const l of map.levels) {
      const plates = switchesOn(l).map((s) => lightSwitchStatsFor(s.components).target);
      expect(emergencyOn(l).map((t) => zoneOfEmergency(t.ref)).sort()).toEqual(plates.sort());
    }
  });

  it("puts the lamp exactly where the plate is", () => {
    for (const l of map.levels) {
      const at = new Map(switchesOn(l).map((s) => [lightSwitchStatsFor(s.components).target, s]));
      for (const lamp of emergencyOn(l)) {
        const plate = at.get(zoneOfEmergency(lamp.ref))!;
        expect({ x: lamp.x, y: lamp.y }).toEqual({ x: plate.x, y: plate.y });
      }
    }
  });

  it("carries the art's own radius and a multiplier that beats full lighting", () => {
    for (const lamp of emergencyOn(level("duct1"))) {
      const s = lightStatsFor(lamp.components);
      expect(s.radius).toBe(EMERGENCY_RADIUS_TILES);
      expect(s.detectionMultiplier).toBe(EMERGENCY_MULTIPLIER);
      // The reason the switch is worth walking into a room for.
      expect(s.detectionMultiplier).toBeLessThan(1);
    }
  });

  it("burns dim, and guttering, because neither is the other", () => {
    // Brightness rather than a smaller radius: at full strength the lamp measured
    // indistinguishable from the overhead it replaces, and shrinking it instead
    // would stop it reaching the doorway. Flicker because the art's emergency
    // frames are labelled `BLINK` and `FLASH`.
    for (const lamp of emergencyOn(level("duct1"))) {
      const s = lightStatsFor(lamp.components);
      expect(s.brightness).toBe(EMERGENCY_BRIGHTNESS);
      expect(s.brightness).toBeLessThan(1);
      expect(s.type).toContain("flick");
    }
  });

  it("leaves the overheads at full brightness and steady", () => {
    for (const t of derivedOn(level("duct1"))) {
      const s = lightStatsFor(t.components);
      expect(s.brightness).toBe(1);
      expect(s.type).not.toContain("flick");
    }
  });

  it("is never filed into a wing — it is derived from its zone, not thrown on its own", () => {
    for (const l of map.levels) {
      const filed = new Set(Object.values(l.circuits ?? {}).flat());
      for (const lamp of emergencyOn(l)) expect(filed.has(lamp.ref)).toBe(false);
    }
  });

  it("round-trips its zone's name", () => {
    for (const l of map.levels) {
      for (const t of derivedOn(l)) expect(zoneOfEmergency(emergencyRef(t.ref))).toBe(t.ref);
    }
    // A ref that is not an emergency lamp comes back untouched, which is what lets
    // `cutCircuits` map a mixed list without knowing which is which.
    expect(zoneOfEmergency("light_overhead1")).toBe("light_overhead1");
  });
});

describe("autoLight — circuits", () => {
  it("files every zone under exactly one wing", () => {
    for (const l of map.levels) {
      const zones = derivedOn(l).map((t) => t.ref);
      const filed = Object.values(l.circuits ?? {}).flat();
      expect(new Set(filed).size, `${l.name} files a zone twice`).toBe(filed.length);
      expect([...filed].sort()).toEqual([...zones].sort());
    }
  });

  it("gives a level more than one wing, so a breaker is not an off switch", () => {
    for (const name of UNLIT_DECKS) {
      expect(Object.keys(level(name).circuits ?? {}).length).toBeGreaterThan(1);
    }
  });

  it("leaves circuits undefined on a level it derived nothing for", () => {
    expect(level("main1").circuits).toBeUndefined();
  });
});

describe("autoLight — switches", () => {
  it("puts a switch in the zone it throws, against something, on standable floor", () => {
    for (const l of map.levels) {
      // The same notion of solid the anchor uses: a plate mounts on anything a
      // player cannot walk into, which on `vent_core` includes the edge of the
      // catwalk as well as the walls.
      const standable = standableIn(l);
      for (const s of switchesOn(l)) {
        const target = lightSwitchStatsFor(s.components).target;
        const col = Math.floor(s.x / ZONE_TILES);
        const row = Math.floor(s.y / ZONE_TILES);
        expect(target).toBe(`${l.name}__z${col}_${row}`);
        expect(standable({ x: s.x, y: s.y })).toBe(true);
        const mounted = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].some(([dx, dy]) => !standable({ x: s.x + dx, y: s.y + dy }));
        expect(mounted, `${l.name}: switch at ${s.x},${s.y} floats mid-room`).toBe(true);
      }
    }
  });

  it("names a circuit that actually has lights on it", () => {
    for (const l of map.levels) {
      const zones = new Set(derivedOn(l).map((t) => t.ref));
      for (const s of switchesOn(l)) {
        expect(zones.has(lightSwitchStatsFor(s.components).target)).toBe(true);
      }
    }
  });

  it("carries the component that claims it as an entity", () => {
    for (const s of switchesOn(level("duct1"))) {
      expect(s.components.some((c) => c.type === LIGHT_SWITCH_COMPONENT)).toBe(true);
      // Frameless on purpose: the plate is drawn by the entity, and `TileBake`
      // skips a tile with no frame rather than trying to paint one.
      expect(s.frame).toBeUndefined();
    }
  });

  it("carries the plate's footprint on the tile, not just in the entity", () => {
    // `LightSwitch` sizes itself from `tile.colSpan` the way `Breaker` does, so the
    // span has to be here. `marker()` defaults both to a whole tile, which would
    // draw the 8x8 art at four times the house pixel density.
    for (const l of map.levels) {
      for (const s of switchesOn(l)) {
        expect(s.colSpan).toBe(SWITCH_TILES);
        expect(s.rowSpan).toBe(SWITCH_TILES);
      }
    }
  });

  it("starts every derived switch closed, so a fresh run walks into a lit level", () => {
    for (const l of map.levels) {
      for (const s of switchesOn(l)) expect(lightSwitchStatsFor(s.components).closed).toBe(true);
    }
  });
});
