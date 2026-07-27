import type Phaser from "phaser";
import { Vent4State, type Vent4View } from "../systems/Vent4Core";
import { EncounterBand } from "./EncounterBand";

/** Fill/status colors per compliance band. */
const BAND_STYLE: Record<string, { hex: number; css: string; label: string }> = {
  LAMINAR: { hex: 0x39d3ff, css: "#39d3ff", label: "LAMINAR FLOW" },
  TURBULENT: { hex: 0xffb03b, css: "#ffb03b", label: "TURBULENCE" },
  CRITICAL: { hex: 0xff3b3b, css: "#ff3b3b", label: "CRITICAL BLOCKAGE" },
};

/**
 * The VENT-4 encounter HUD: a Compliance Index bar (the boss's "health", 100% → 0%), a
 * band/status readout, and the Phase-3 purge's red screen wash.
 *
 * The widget itself is {@link EncounterBand}, shared with the two later encounters —
 * this file is now only VENT-4's vocabulary: which band it is in, and what that is
 * called. Hidden entirely outside the vent core, since `UIScene` runs across level
 * swaps and `update(null)` is how it learns to clear.
 */
export class Vent4Hud {
  private readonly band: EncounterBand;

  constructor(scene: Phaser.Scene) {
    this.band = new EncounterBand(scene, {
      barW: 220,
      fillColor: 0x39d3ff,
      bannerColor: 0xffb03b,
      wash: { color: 0xff3300, alpha: 0.1 },
    });
  }

  update(v: Vent4View | null): void {
    if (!v) {
      if (this.band.visible) this.band.hide();
      return;
    }
    const band = BAND_STYLE[v.band] ?? BAND_STYLE.LAMINAR;

    let status: string;
    let statusColor: string;
    if (v.state === Vent4State.DEFEATED) {
      status = "OFFLINE — COMPLIANCE CERT ACCEPTED";
      statusColor = "#8effc0";
    } else if (v.state === Vent4State.JAMMED) {
      status = `TRIAGE SUSPENDED ${Math.ceil(v.jamLeft)}s — CORE EXPOSED`;
      statusColor = "#ffe14d";
    } else {
      status = band.label;
      statusColor = band.css;
    }

    this.band.set({
      title: `VENT-4 · COMPLIANCE INDEX: ${v.compliance.toFixed(1)}%`,
      frac: v.compliance / 100,
      fillColor: band.hex,
      status,
      statusColor,
      msg: v.msg,
      wash: v.state === Vent4State.PHASE_3_PURGE,
    });
  }
}
