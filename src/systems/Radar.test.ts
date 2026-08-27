import { describe, it, expect } from "vitest";
import { CollisionGrid } from "./CollisionGrid";
import { NoiseLog } from "./NoiseLog";
import {
  NOISE_SECTORS,
  buildRadarSnapshot,
  emptyRadarSnapshot,
  noiseSectorFor,
} from "./Radar";
import type { GameLevel } from "../map/types";

const TILE = 32;

/** An empty 24×24 level — the radar's own reach is what these tests exercise. */
function level(): GameLevel {
  return { name: "t", width: 24, height: 24, layers: [] } as unknown as GameLevel;
}

/** Sector indices by name, matching the sheet's row order in `build_radar_bezel.py`. */
const EAST = 0;
const SOUTHEAST = 1;
const SOUTH = 2;
const SOUTHWEST = 3;
const WEST = 4;
const NORTHWEST = 5;
const NORTH = 6;
const NORTHEAST = 7;

/** Builds a snapshot for a player at the centre of the level. */
function snapshotWith(log: NoiseLog, now: number, jammed = false) {
  const px = 12 * TILE;
  const py = 12 * TILE;
  return buildRadarSnapshot(
    new CollisionGrid(level()),
    TILE,
    { x: px, y: py, facing: 0 },
    [],
    [],
    jammed,
    log,
    now,
  );
}

describe("noiseSectorFor", () => {
  it("maps each compass bearing to its own sector", () => {
    // Screen space: +x east, +y south. Sector 0 is east, running clockwise.
    expect(noiseSectorFor(1, 0)).toBe(EAST);
    expect(noiseSectorFor(1, 1)).toBe(SOUTHEAST);
    expect(noiseSectorFor(0, 1)).toBe(SOUTH);
    expect(noiseSectorFor(-1, 1)).toBe(SOUTHWEST);
    expect(noiseSectorFor(-1, 0)).toBe(WEST);
    expect(noiseSectorFor(-1, -1)).toBe(NORTHWEST);
    expect(noiseSectorFor(0, -1)).toBe(NORTH);
    expect(noiseSectorFor(1, -1)).toBe(NORTHEAST);
  });

  it("rounds to the nearest bearing rather than flooring into a slice", () => {
    // Just off due north either way must still read north, not its neighbours.
    expect(noiseSectorFor(0.2, -1)).toBe(NORTH);
    expect(noiseSectorFor(-0.2, -1)).toBe(NORTH);
  });

  it("returns a sector in range for every angle, including the wrap at west", () => {
    for (let deg = 0; deg < 360; deg += 7) {
      const rad = (deg * Math.PI) / 180;
      const s = noiseSectorFor(Math.cos(rad), Math.sin(rad));
      expect(s, `${deg}°`).toBeGreaterThanOrEqual(0);
      expect(s, `${deg}°`).toBeLessThan(NOISE_SECTORS);
      expect(Number.isInteger(s), `${deg}°`).toBe(true);
    }
  });
});

describe("buildRadarSnapshot noise", () => {
  it("starts silent on every bearing", () => {
    const snap = snapshotWith(new NoiseLog(), 0);
    for (let i = 0; i < NOISE_SECTORS; i++) expect(snap.noise.level(i)).toBe(0);
  });

  it("lights the bearing a noise came from, and only that one", () => {
    const log = new NoiseLog();
    // Four tiles due north of the player, carrying eight.
    log.record(12 * TILE, 8 * TILE, 8 * TILE, 0);
    const snap = snapshotWith(log, 0);
    expect(snap.noise.level(NORTH)).toBeGreaterThan(0);
    for (let i = 0; i < NOISE_SECTORS; i++) {
      if (i !== NORTH) expect(snap.noise.level(i), `sector ${i}`).toBe(0);
    }
  });

  it("reads louder the closer the source is", () => {
    const near = new NoiseLog();
    near.record(12 * TILE, 10 * TILE, 8 * TILE, 0); // 2 tiles away
    const far = new NoiseLog();
    far.record(12 * TILE, 5 * TILE, 8 * TILE, 0); // 7 tiles away

    expect(snapshotWith(near, 0).noise.level(NORTH)).toBeGreaterThan(
      snapshotWith(far, 0).noise.level(NORTH),
    );
  });

  it("ignores a source whose radius does not reach the player", () => {
    const log = new NoiseLog();
    // Six tiles away but only carrying two — genuinely inaudible from here.
    log.record(12 * TILE, 6 * TILE, 2 * TILE, 0);
    const snap = snapshotWith(log, 0);
    expect(snap.noise.level(NORTH)).toBe(0);
  });

  it("takes the louder of two sources on one bearing rather than summing them", () => {
    const log = new NoiseLog();
    log.record(12 * TILE, 5 * TILE, 8 * TILE, 0); // far, quiet
    log.record(12 * TILE, 11 * TILE, 8 * TILE, 0); // near, loud
    const near = new NoiseLog();
    near.record(12 * TILE, 11 * TILE, 8 * TILE, 0);

    // Two stacked sources must read exactly as loud as the louder one alone —
    // summing them would report a threat that is not out there.
    expect(snapshotWith(log, 0).noise.level(NORTH)).toBe(
      snapshotWith(near, 0).noise.level(NORTH),
    );
  });

  it("drops a bearing once its noise has aged out", () => {
    const log = new NoiseLog();
    log.record(12 * TILE, 8 * TILE, 8 * TILE, 0);
    expect(snapshotWith(log, 0).noise.level(NORTH)).toBeGreaterThan(0);
    expect(snapshotWith(log, 99).noise.level(NORTH)).toBe(0);
  });

  it("reports nothing at all while jammed", () => {
    const log = new NoiseLog();
    log.record(12 * TILE, 8 * TILE, 8 * TILE, 0);
    const snap = snapshotWith(log, 0, true);
    expect(snap.jammed).toBe(true);
    for (let i = 0; i < NOISE_SECTORS; i++) expect(snap.noise.level(i)).toBe(0);
  });

  it("clears the previous frame's bearings when the buffer is reused", () => {
    // The snapshot's buffers are reused by design, so a bearing that went quiet
    // must actually go quiet rather than holding last frame's value.
    const grid = new CollisionGrid(level());
    const into = emptyRadarSnapshot();
    const loud = new NoiseLog();
    loud.record(12 * TILE, 8 * TILE, 8 * TILE, 0);

    const player = { x: 12 * TILE, y: 12 * TILE, facing: 0 };
    buildRadarSnapshot(grid, TILE, player, [], [], false, loud, 0, into);
    expect(into.noise.level(NORTH)).toBeGreaterThan(0);

    buildRadarSnapshot(grid, TILE, player, [], [], false, new NoiseLog(), 0, into);
    expect(into.noise.level(NORTH)).toBe(0);
  });
});
