import { describe, it, expect } from "vitest";
import { OBJECTIVE_FRAME_COUNT, objectivePanelFrame } from "./ObjectivePanel";
import FRAMES from "./objectivePanelFrames.json";
import { UI_TEXTURES } from "./UiTextures";

/**
 * `objectivePanelFrame`'s contract, asserted against the *generated* frame
 * indices rather than hardcoded 0/1/2/3 — a redraw that reorders the strip
 * should fail here only if the mapping itself is wrong, not because the art
 * moved under a stale constant.
 */

describe("ObjectivePanel: frame selection", () => {
  it("complete overrides status, whatever the network is doing", () => {
    for (const status of ["INFILTRATION", "EVASION", "ALERT", "anything-else"]) {
      expect(objectivePanelFrame(status, true)).toBe(FRAMES.COMPLETE);
    }
  });

  it("maps each network status to its own frame when not complete", () => {
    expect(objectivePanelFrame("INFILTRATION", false)).toBe(FRAMES.NOMINAL);
    expect(objectivePanelFrame("EVASION", false)).toBe(FRAMES.SEARCHING);
    expect(objectivePanelFrame("ALERT", false)).toBe(FRAMES.ALERT);
  });

  it("falls back to NOMINAL for a status it doesn't recognise", () => {
    // The disconnected case: no snapshot published yet, same default
    // `AlertNetworkHud` uses.
    expect(objectivePanelFrame("unknown", false)).toBe(FRAMES.NOMINAL);
  });

  it("registers exactly the four frames the strip holds", () => {
    const sheet = UI_TEXTURES.find((t) => t.key === "ui-objective-panel");
    expect(sheet?.sheet?.count).toBe(OBJECTIVE_FRAME_COUNT);
    expect(OBJECTIVE_FRAME_COUNT).toBe(4);
  });
});
