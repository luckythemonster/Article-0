import { describe, it, expect } from "vitest";
import { routeFromLayer } from "./PatrolRoute";
import type { GameLayer } from "../map/types";

/** A guard layer from `[ref, x, y]` triples, in deliberate file order. */
function layer(tiles: [string, number, number][]): GameLayer {
  return {
    name: "enforcers",
    tiles: tiles.map(([ref, x, y]) => ({ ref, x, y })),
  } as unknown as GameLayer;
}

describe("routeFromLayer", () => {
  it("orders waypoints by the numeric suffix of their ref, not file order", () => {
    // The shipped `main1` board, in the order the map file lists it.
    const route = routeFromLayer(
      layer([
        ["enforcer2", 22, 30],
        ["enforcer1", 14, 30],
        ["enforcer0", 18, 25],
        ["enforcer3", 17, 38],
      ]),
    );
    expect(route).toEqual([
      { x: 18, y: 25 },
      { x: 14, y: 30 },
      { x: 22, y: 30 },
      { x: 17, y: 38 },
    ]);
  });

  it("orders duct1's two drone waypoints down the shaft", () => {
    const route = routeFromLayer(
      layer([
        ["drone1", 21, 9],
        ["drone0", 21, 34],
      ]),
    );
    expect(route).toEqual([
      { x: 21, y: 34 },
      { x: 21, y: 9 },
    ]);
  });

  it("sorts numerically rather than lexically past nine", () => {
    const route = routeFromLayer(
      layer([
        ["enforcer10", 10, 0],
        ["enforcer9", 9, 0],
        ["enforcer2", 2, 0],
      ]),
    );
    expect(route.map((p) => p.x)).toEqual([2, 9, 10]);
  });

  it("keeps file order for refs with no numeric suffix", () => {
    const route = routeFromLayer(
      layer([
        ["patrol_north", 3, 3],
        ["patrol_south", 5, 5],
      ]),
    );
    expect(route).toEqual([
      { x: 3, y: 3 },
      { x: 5, y: 5 },
    ]);
  });

  it("puts unnumbered refs behind numbered ones", () => {
    const route = routeFromLayer(
      layer([
        ["loose", 9, 9],
        ["enforcer1", 1, 1],
        ["enforcer0", 0, 0],
      ]),
    );
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 9, y: 9 },
    ]);
  });

  it("returns a single waypoint for a one-tile board", () => {
    expect(routeFromLayer(layer([["enforcer0", 4, 4]]))).toEqual([{ x: 4, y: 4 }]);
  });

  it("returns nothing for a missing or empty layer", () => {
    expect(routeFromLayer(undefined)).toEqual([]);
    expect(routeFromLayer(layer([]))).toEqual([]);
  });

  it("does not mutate the source layer's tile order", () => {
    const l = layer([
      ["enforcer1", 1, 1],
      ["enforcer0", 0, 0],
    ]);
    routeFromLayer(l);
    expect(l.tiles.map((t) => t.ref)).toEqual(["enforcer1", "enforcer0"]);
  });
});
