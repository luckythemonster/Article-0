import { describe, it, expect } from "vitest";
import { Anomalies, type AnomalyWorld } from "./Anomalies";
import type { Chest } from "../../entities/Chest";
import type { Door } from "../../entities/Door";
import type { Laser } from "../../entities/Laser";
import type { Orderly } from "../../entities/Orderly";
import type { Sensor } from "../../entities/Sensor";

const TS = 16;

/** Only the fields the anomaly pass reads. */
const door = (tileX: number, tileY: number, isOpen: boolean) => ({ tileX, tileY, isOpen }) as Door;
const chest = (tileX: number, tileY: number, isOpen: boolean) =>
  ({ tileX, tileY, x: (tileX + 0.5) * TS, y: (tileY + 0.5) * TS, isOpen }) as Chest;
const laser = (x: number, y: number, isEmped: boolean) => ({ x, y, isEmped }) as Laser;
const sensor = (x: number, y: number) => ({ x, y }) as Sensor;
const orderly = (x: number, y: number, state: Partial<Orderly> = {}) =>
  ({ x, y, isStunned: false, isPinned: false, isSurrendered: false, ...state }) as Orderly;

function world(parts: Partial<Record<keyof AnomalyWorld, unknown>> = {}): AnomalyWorld {
  return {
    tileSize: () => TS,
    doors: () => [],
    chests: () => [],
    lasers: () => [],
    sensors: () => [],
    orderlies: () => [],
    ...parts,
  } as AnomalyWorld;
}

describe("Anomalies", () => {
  it("reports only the doors and chests that are open", () => {
    const a = new Anomalies(
      world({
        doors: () => [door(1, 1, true), door(2, 2, false)],
        chests: () => [chest(3, 3, true), chest(4, 4, false)],
      }),
    );
    expect(a.build(null).map((e) => e.key)).toEqual(["door:1:1", "chest:3:3"]);
  });

  it("reports only emitters that have been knocked out", () => {
    const a = new Anomalies(
      world({ lasers: () => [laser(16, 16, true), laser(32, 32, false)] }),
    );
    const out = a.build(null);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "device", key: "device:laser:1:1" });
  });

  it("reports cameras only inside a live chaff zone", () => {
    const a = new Anomalies(world({ sensors: () => [sensor(16, 16), sensor(160, 160)] }));
    expect(a.build(null)).toHaveLength(0);
    const inZone = a.build({ x: 16, y: 16, radiusPx: 40 });
    expect(inZone).toHaveLength(1);
    expect(inZone[0].key).toBe("device:camera:1:1");
  });

  it("reports a darted man as darted even once he has also surrendered", () => {
    // The dart is the longer-lasting evidence and what a patrol should react to.
    const both = orderly(16, 16, { isStunned: true, isSurrendered: true });
    const a = new Anomalies(world({ orderlies: () => [both] }));
    expect(a.build(null)[0].kind).toBe("stunnedOrderly");
  });

  it("distinguishes pinned and surrendered men from darted ones", () => {
    const a = new Anomalies(
      world({
        orderlies: () => [
          orderly(16, 16, { isPinned: true }),
          orderly(32, 32, { isSurrendered: true }),
          orderly(48, 48),
        ],
      }),
    );
    expect(a.build(null).map((e) => e.kind)).toEqual(["pinnedOrderly", "surrenderedOrderly"]);
  });

  it("recycles its entries rather than allocating a fresh list each frame", () => {
    // The steady state must allocate nothing: the same objects come back, with
    // their fields rewritten in place.
    const doors = [door(1, 1, true), door(2, 2, true)];
    const a = new Anomalies(world({ doors: () => doors }));
    const first = a.build(null);
    const identities = [...first];
    const second = a.build(null);
    expect(second).toBe(first);
    expect(second[0]).toBe(identities[0]);
    expect(second[1]).toBe(identities[1]);
  });

  it("only re-interpolates a key when the tile it names actually moves", () => {
    // A door never moves, so a level's worth of open doors costs no string
    // building after the first frame.
    const doors = [door(1, 1, true)];
    const a = new Anomalies(world({ doors: () => doors }));
    const keyFirst = a.build(null)[0].key;
    const keySecond = a.build(null)[0].key;
    expect(keySecond).toBe(keyFirst);

    // A device that does move gets a fresh key for its new tile.
    const lasers = [laser(16, 16, true)];
    const b = new Anomalies(world({ lasers: () => lasers }));
    expect(b.build(null)[0].key).toBe("device:laser:1:1");
    lasers[0] = laser(48, 48, true);
    expect(b.build(null)[0].key).toBe("device:laser:3:3");
  });

  it("shrinks the reported list when a slot goes quiet, without losing the pool", () => {
    const doors = [door(1, 1, true), door(2, 2, true)];
    const a = new Anomalies(world({ doors: () => doors }));
    expect(a.build(null)).toHaveLength(2);
    doors[1] = door(2, 2, false);
    expect(a.build(null)).toHaveLength(1);
    doors[1] = door(2, 2, true);
    expect(a.build(null)).toHaveLength(2);
  });
});
