import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EdplayLoader } from "../map/EdplayLoader";
import { deckCells, PLANE_FLOOR, PLANE_UPPER } from "../map/planes";
import { linkAt, linkKindOf, movingToward, planeLinksFor } from "./PlaneLinks";
import type { EdPlayFile, GameLevel } from "../map/types";

const TILE = 32;

const map = (() => {
  const raw = JSON.parse(readFileSync("public/assets/edplay.json", "utf8")) as EdPlayFile;
  return EdplayLoader.parse(
    raw,
    raw.SpriteSheets.map((s) => s.RelativePath),
  ).map;
})();

const levelNamed = (name: string): GameLevel => {
  const l = map.levels.find((x) => x.name === name);
  if (!l) throw new Error(`no level ${name}`);
  return l;
};

const coords = (l: GameLevel): string[] =>
  planeLinksFor(l, TILE)
    .map((k) => `${k.x},${k.y}->${k.toX},${k.toY}`)
    .sort();

describe("planeLinksFor", () => {
  it("reads vent_core's three ladders once each, not twice", () => {
    // They are filed on two boards — `catwalk_access_up` and `floor_access_down`
    // — at the same three coordinates, one board per direction. That is one way
    // up described twice, not two ways up.
    // Each foot has two deck cells beside it; the fixed neighbour order (N, E,
    // S, W) picks the same one every time, which is what matters.
    expect(coords(levelNamed("vent_core"))).toEqual([
      "35,0->35,1",
      "35,17->35,16",
      "4,17->4,16",
    ]);
  });

  it("reads roof_array's four ramps", () => {
    expect(coords(levelNamed("roof_array"))).toEqual([
      "10,7->11,7",
      "17,1->17,0",
      "17,16->17,17",
      "24,7->23,7",
    ]);
  });

  it("finds none on a level with one walk surface", () => {
    for (const flat of ["main1", "duct1", "duct2", "secret1", "main2", "main2vault", "secret2"]) {
      expect(planeLinksFor(levelNamed(flat), TILE)).toEqual([]);
    }
  });

  it("lands every head on a deck cell and every foot off it", () => {
    // The invariant that makes a link usable: you step onto walkable deck, from
    // somewhere the deck does not already cover.
    for (const name of ["vent_core", "roof_array"]) {
      const level = levelNamed(name);
      const deck = deckCells(level, TILE);
      const on = (x: number, y: number): boolean => deck[y * level.width + x] === 1;
      for (const k of planeLinksFor(level, TILE)) {
        expect(on(k.toX, k.toY), `${name} head ${k.toX},${k.toY}`).toBe(true);
        expect(on(k.x, k.y), `${name} foot ${k.x},${k.y}`).toBe(false);
      }
    }
  });

  it("declines a link tile with no deck beside it rather than guessing", () => {
    const orphan = {
      name: "t",
      width: 6,
      height: 6,
      layers: [
        { name: "catwalks", tiles: [{ x: 5, y: 5 }] },
        { name: "ramps", tiles: [{ x: 1, y: 1 }] },
      ],
    } as unknown as GameLevel;
    expect(planeLinksFor(orphan, TILE)).toEqual([]);
  });
});

describe("linkAt", () => {
  it("answers at the foot going up and at the head coming down", () => {
    const links = planeLinksFor(levelNamed("roof_array"), TILE);
    expect(linkAt(links, PLANE_FLOOR, 17, 16)).toBeDefined();
    expect(linkAt(links, PLANE_UPPER, 17, 17)).toBeDefined();
    // …and not the other way round: (17,17) is deck, so it is no use from below.
    expect(linkAt(links, PLANE_FLOOR, 17, 17)).toBeUndefined();
    expect(linkAt(links, PLANE_UPPER, 17, 16)).toBeUndefined();
  });
});

describe("linkKindOf", () => {
  it("prompts for ladders and hatches, walks over everything else", () => {
    for (const ref of ["ladder_up3", "ladder_down1", "hatch2", "access_hatch5"]) {
      expect(linkKindOf(ref), ref).toBe("ladder");
    }
    for (const ref of ["ramp_up_south_metal1", "catwalk_ramp_up_east1", "stairs_up_east2"]) {
      expect(linkKindOf(ref), ref).toBe("ramp");
    }
  });

  it("walks over a ramp whose ref never says 'ramp'", () => {
    // roof_array's west ramp. A rule keyed on ramp-ish names would file this as a
    // ladder and make one corner of the roof behave unlike the other three.
    expect(linkKindOf("catwalk_up_west_metal1")).toBe("ramp");
  });

  it("treats a ref-less tile as a ramp rather than throwing", () => {
    expect(linkKindOf(undefined)).toBe("ramp");
  });
});

describe("the shipped map's link kinds", () => {
  it("makes vent_core's three ladders prompt and roof_array's four ramps walk over", () => {
    const kinds = (name: string): string[] =>
      planeLinksFor(levelNamed(name), TILE)
        .map((k) => k.kind)
        .sort();
    expect(kinds("vent_core")).toEqual(["ladder", "ladder", "ladder"]);
    expect(kinds("roof_array")).toEqual(["ramp", "ramp", "ramp", "ramp"]);
  });

  it("agrees with the direction each ramp's own art names", () => {
    // Independent corroboration: the geometry picks the head, the ref says which
    // way the author drew the slope, and the two must not disagree.
    const named: Record<string, [number, number]> = {
      north: [0, -1],
      south: [0, 1],
      east: [1, 0],
      west: [-1, 0],
    };
    const level = levelNamed("roof_array");
    const ramps = level.layers.find((l) => l.name === "ramps");
    expect(ramps?.tiles).toHaveLength(4);

    for (const tile of ramps!.tiles) {
      const dir = /up_(north|south|east|west)/i.exec(tile.ref ?? "")?.[1].toLowerCase();
      expect(dir, `${tile.ref} names a direction`).toBeDefined();
      const link = planeLinksFor(level, TILE).find((k) => k.x === tile.x && k.y === tile.y);
      expect(link, `${tile.ref} resolves`).toBeDefined();
      expect([link!.toX - link!.x, link!.toY - link!.y], `${tile.ref}`).toEqual(named[dir!]);
    }
  });
});

describe("movingToward", () => {
  it("fires walking into the ramp and not walking past it", () => {
    // roof_array's west ramp: foot (24,7), head (23,7). Heading west is up it.
    expect(movingToward(-40, 0, 24, 7, 23, 7)).toBe(true);
    expect(movingToward(40, 0, 24, 7, 23, 7)).toBe(false);
  });

  it("ignores travel across the link, which is the whole point", () => {
    // The head (23,7) sits in the middle of the x=23 gantry, so walking that
    // column north or south crosses it. Neither may tip the player off the deck.
    expect(movingToward(0, -40, 23, 7, 24, 7)).toBe(false);
    expect(movingToward(0, 40, 23, 7, 24, 7)).toBe(false);
  });

  it("counts a diagonal that still closes on the link", () => {
    expect(movingToward(-30, 30, 24, 7, 23, 7)).toBe(true);
  });

  it("refuses a body that isn't moving", () => {
    expect(movingToward(0, 0, 24, 7, 23, 7)).toBe(false);
  });
});
