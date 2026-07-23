import { describe, it, expect } from "vitest";
import { SharedField, SHARED_FIELD_DURATION } from "./SharedField";

describe("SharedField", () => {
  it("charges only while witnessing and caps at 1", () => {
    const f = new SharedField();
    f.witness(1, false);
    expect(f.charge).toBe(0);
    f.witness(3, true);
    expect(f.charge).toBeCloseTo(0.5, 5);
    f.witness(100, true);
    expect(f.charge).toBe(1);
    expect(f.ready).toBe(true);
  });

  it("activates only when charged, runs for the WX-9 duration, then ends", () => {
    const f = new SharedField();
    expect(f.activate()).toBe(false); // not charged
    f.witness(100, true);
    expect(f.activate()).toBe(true);
    expect(f.isActive).toBe(true);
    expect(f.charge).toBe(0);
    f.update(SHARED_FIELD_DURATION - 0.1);
    expect(f.isActive).toBe(true);
    f.update(0.2);
    expect(f.isActive).toBe(false);
  });

  it("does not accrue charge while a merge is active", () => {
    const f = new SharedField();
    f.witness(100, true);
    f.activate();
    f.witness(100, true);
    expect(f.charge).toBe(0);
  });
});
