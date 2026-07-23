import { describe, it, expect } from "vitest";
import { AlertState } from "./AlertState";

describe("AlertState", () => {
  it("starts in INFILTRATION", () => {
    expect(new AlertState().phase).toBe("INFILTRATION");
  });

  it("reports a sighting as ALERT with the last-known tile", () => {
    const a = new AlertState();
    a.reportSighting(3, 4);
    expect(a.phase).toBe("ALERT");
    expect(a.lastKnownTile).toEqual({ x: 3, y: 4 });
    expect(a.isCombatAware).toBe(true);
  });

  it("decays ALERT -> EVASION -> INFILTRATION over time", () => {
    const a = new AlertState();
    a.reportSighting(1, 1);
    a.update(9); // past the 8s ALERT window
    expect(a.phase).toBe("EVASION");
    a.update(13); // past the 12s EVASION window
    expect(a.phase).toBe("INFILTRATION");
    expect(a.lastKnownTile).toBeNull();
  });

  it("does nothing while infiltrating", () => {
    const a = new AlertState();
    a.update(100);
    expect(a.phase).toBe("INFILTRATION");
  });
});
