import { describe, it, expect } from "vitest";
import { indexEntities, indexFixtures } from "./EntityIndex";
import type { ComponentData, GameLevel, GameTile } from "./types";

/** A placed tile with components — the only fields the index reads. */
function tile(x: number, y: number, ref: string, ...components: ComponentData[]): GameTile {
  return {
    x,
    y,
    ref,
    handle: 0,
    colSpan: 1,
    rowSpan: 1,
    offsetX: 0,
    offsetY: 0,
    flipY: false,
    components,
  };
}

const human = (job: string): ComponentData => ({ type: "human", values: { Job: job } });
const silicate: ComponentData = { type: "silicate", values: {} };
const sensor: ComponentData = { type: "sensor", values: { type: "OPTICAL" } };
const spawner: ComponentData = { type: "enemyspawn", values: { type: "ENFORCER" } };
const terminal: ComponentData = { type: "terminal", values: { type: "LOG_CACHE" } };
const chest: ComponentData = { type: "chest", values: {} };
const door: ComponentData = { type: "door", values: { state: "CLOSED" } };

function level(boards: Record<string, GameTile[]>): GameLevel {
  return {
    name: "t",
    width: 36,
    height: 18,
    layers: Object.entries(boards).map(([name, tiles]) => ({ name, tiles })),
  };
}

/** What the engine's own generators still file by name. */
const LEGACY = new Set(["spawn", "enforcers", "drones", "orderlies", "security", "items", "doors"]);

describe("EntityIndex — the cast", () => {
  it("reads a guard board as one guard's route, in ref order", () => {
    // v0.4 numbers each tile on a route board individually, so the trailing digit
    // is the waypoint order again — v0.3 gave every tile the same ref and lost it.
    const ix = indexEntities(
      level({
        security_guard_A: [
          tile(28, 11, "security_guard4", human("SECURITY")),
          tile(11, 4, "security_guard1", human("SECURITY")),
          tile(25, 11, "security_guard3", human("SECURITY")),
          tile(16, 8, "security_guard2", human("SECURITY")),
        ],
      }),
      LEGACY,
    );
    expect(ix.guards).toHaveLength(1);
    expect(ix.guards[0].kind).toBe("enforcer");
    expect(ix.guards[0].route).toEqual([
      { x: 11, y: 4 },
      { x: 16, y: 8 },
      { x: 25, y: 11 },
      { x: 28, y: 11 },
    ]);
  });

  it("tells a drone board from a guard board by its component", () => {
    const ix = indexEntities(
      level({
        drone_A: [tile(8, 13, "drone1", silicate), tile(1, 13, "drone2", silicate)],
        security_guard_B: [tile(7, 5, "security_guard1", human("SECURITY"))],
      }),
      LEGACY,
    );
    expect(ix.guards.map((g) => g.kind).sort()).toEqual(["drone", "enforcer"]);
  });

  it("reads an orderly board as one orderly's round, in ref order", () => {
    // An entity board is one entity, and its tiles are that entity's waypoints —
    // the same rule guard boards follow. A board of four is one porter with a
    // four-stop round, not four porters standing about.
    const ix = indexEntities(
      level({
        orderly: [
          tile(4, 1, "orderly4", human("ORDERLY")),
          tile(25, 8, "orderly2", human("ORDERLY")),
        ],
      }),
      LEGACY,
    );
    expect(ix.guards).toEqual([]);
    expect(ix.orderlies).toHaveLength(1);
    // Ordered by the trailing number on the ref, not by file order.
    expect(ix.orderlies[0].route).toEqual([
      { x: 25, y: 8 },
      { x: 4, y: 1 },
    ]);
  });

  it("reads a spawn board as one sentry's round too", () => {
    // `enemySpawn` has no wave system behind it, so its tiles are places a guard
    // stands rather than times one appears — which makes them waypoints.
    const ix = indexEntities(
      level({
        enforcer_spawn: [
          tile(7, 1, "enforcer_spawn1", spawner),
          tile(5, 3, "enforcer_spawn2", spawner),
        ],
      }),
      LEGACY,
    );
    expect(ix.guards).toHaveLength(1);
    expect(ix.guards[0].route).toEqual([
      { x: 7, y: 1 },
      { x: 5, y: 3 },
    ]);
  });

  it("keeps the character on a board that mixes bodies with scenery", () => {
    // One prop dragged onto a route board used to delete the whole character,
    // silently. The bodies decide it now, and the prop stays art.
    const scenery = tile(9, 9, "stairwell1");
    const ix = indexEntities(
      level({
        security_guard_A: [
          tile(11, 4, "security_guard1", human("SECURITY")),
          scenery,
          tile(16, 8, "security_guard2", human("SECURITY")),
        ],
      }),
      LEGACY,
    );
    expect(ix.guards).toHaveLength(1);
    expect(ix.guards[0].route).toEqual([
      { x: 11, y: 4 },
      { x: 16, y: 8 },
    ]);
    // Unclaimed, so `bakeTileLayers` still paints it.
    expect(ix.claimed.has(scenery)).toBe(false);
  });

  it("stands a sentry on a spawn point, since nothing schedules waves", () => {
    const ix = indexEntities(
      level({ enforcer_spawn: [tile(31, 16, "enforcer_spawn1", spawner)] }),
      LEGACY,
    );
    expect(ix.guards).toEqual([
      { kind: "enforcer", route: [{ x: 31, y: 16 }], components: [spawner] },
    ]);
  });

  it("takes the spawn tiles off a board that also holds art, and leaves the art", () => {
    // main2vault files two stairwell pieces that are guard posts on `verticals`,
    // beside the stair that is a real way out. The stair must stay art, and the
    // two posts become one guard's round — a board is one entity, so a level
    // wanting two guards here needs two boards.
    const ix = indexEntities(
      level({
        verticals: [
          tile(25, 14, "stairs_down_north_cement1", { type: "vertical", values: {} }),
          tile(25, 15, "stairwell1", spawner),
          tile(25, 16, "stairwell1", spawner),
        ],
      }),
      LEGACY,
    );
    expect(ix.guards).toHaveLength(1);
    expect(ix.guards[0].route).toEqual([
      { x: 25, y: 15 },
      { x: 25, y: 16 },
    ]);
    // The stair itself is art the bake still has to paint.
    expect([...ix.claimed].map((t) => t.y).sort()).toEqual([15, 16]);
  });

  it("takes cameras by component, and leaves component-less art alone", () => {
    // Both levels call the board `sensors`. main1's holds a camera carrying a
    // `Sensor` component; duct2's holds four laser fixtures carrying nothing,
    // which are found by ref as Laser hazards and must not become cameras.
    const camera = indexEntities(
      level({ sensors: [tile(10, 11, "security_camera_mounted_north1", sensor)] }),
      LEGACY,
    );
    expect(camera.sensors.map((t) => [t.x, t.y])).toEqual([[10, 11]]);
    expect(camera.claimed.size).toBe(1);

    const lasers = indexEntities(
      level({ sensors: [tile(21, 13, "laser_sensor_vertical1")] }),
      LEGACY,
    );
    expect(lasers.sensors).toEqual([]);
    expect(lasers.claimed.size).toBe(0);
  });

  it("skips boards the engine generates, which it reads by name instead", () => {
    const ix = indexEntities(
      level({ enforcers: [tile(1, 1, "enforcer0", human("SECURITY"))] }),
      LEGACY,
    );
    expect(ix.guards).toEqual([]);
  });
});

describe("EntityIndex — fixtures", () => {
  it("claims every tile it spawns, and nothing it doesn't", () => {
    const node = tile(20, 13, "security_node1");
    const lvl = level({
      terminals: [tile(20, 2, "terminal6", terminal), node],
      items: [tile(12, 1, "item_chest1", chest)],
      doors: [tile(14, 13, "door_single_vertical1", door)],
    });
    const ix = indexEntities(lvl, LEGACY);
    indexFixtures(lvl, ix);

    expect(ix.terminals).toHaveLength(1);
    expect(ix.chests).toHaveLength(1);
    expect(ix.doors).toHaveLength(1);
    // The scenery sharing the terminals board keeps its art.
    expect(ix.claimed.has(node)).toBe(false);
    expect(ix.claimed.size).toBe(3);
  });

  it("keeps doors board-scoped, so an elevator car's doors stay art", () => {
    // Both exits of the one-tile car carry a LOCKED door component. Made real,
    // they would seal the player inside it.
    const lvl = level({
      elevator: [tile(5, 1, "elevator"), tile(6, 1, "door_elevator_vertical1", door)],
    });
    const ix = indexEntities(lvl, LEGACY);
    indexFixtures(lvl, ix);
    expect(ix.doors).toEqual([]);
    expect(ix.claimed.size).toBe(0);
  });
});
