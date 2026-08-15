import type Phaser from "phaser";
import { RelayState, type RelayView } from "../systems/RelayCore";
import { EncounterBand } from "./EncounterBand";
import { UI, hex } from "./hudTheme";

const PHASE_STYLE: Record<number, { text: string; css: string }> = {
  [RelayState.CALIBRATE]: { text: "CALIBRATION", css: UI.amber },
  [RelayState.ARMED]: { text: "DISH ALIGNED — FEED READY", css: UI.cyan },
  [RelayState.UPLINK]: { text: "UPLINK RUNNING — HOLD THE LINE", css: UI.greenSoft },
  [RelayState.CAPTURE]: { text: "CONTAINMENT INBOUND", css: UI.redDeep },
  [RelayState.SEIZED]: { text: "IN CUSTODY", css: UI.redDeep },
};

/**
 * The rooftop relay HUD: the uplink progress bar and the phase readout.
 *
 * The band itself — title, bar, status, banner queue, wash — is {@link EncounterBand},
 * shared with the other two encounters. What lives here is the one thing this readout
 * does that no other does: at 100% it is supposed to stop being readable. The percentage
 * scrambles to hex and the whole thing jitters, because the mesh has just taken the feed
 * away from Rowan and the player should feel the HUD lose its grip rather than watch it
 * get tidied away.
 */
export class RelayHud {
  private readonly band: EncounterBand;

  constructor(scene: Phaser.Scene) {
    this.band = new EncounterBand(scene, {
      barW: 240,
      fillColor: hex(UI.greenSoft),
      bannerColor: hex(UI.greenSoft),
      wash: { color: 0xff5000, alpha: 0.1 },
    });
  }

  update(v: RelayView | null): void {
    if (!v) {
      if (this.band.visible) this.band.hide();
      return;
    }
    const captured = v.state === RelayState.CAPTURE || v.state === RelayState.SEIZED;
    const phase = PHASE_STYLE[v.state] ?? PHASE_STYLE[RelayState.CALIBRATE];

    // Random hex where the number was is the cheapest honest way to draw a feed you no
    // longer own. It defeats the band's title cache by design — but only for the few
    // seconds the capture sequence runs, which is exactly when that is the point.
    const pct = captured
      ? Math.floor(Math.random() * 0xfff)
          .toString(16)
          .toUpperCase()
          .padStart(3, "0")
      : String(Math.round(v.progress * 100)).padStart(3, " ");

    this.band.set({
      title: `LATTICE UPLINK · ${pct}%`,
      frac: v.progress,
      fillColor: captured ? hex(UI.redDeep) : hex(UI.greenSoft),
      status:
        v.state === RelayState.CALIBRATE
          ? `${phase.text} · PEDESTALS ${v.pedestalsSet}/${v.pedestalCount}`
          : phase.text,
      statusColor: phase.css,
      msg: v.msg,
      wash: captured,
      legibility: captured ? 0.2 + Math.random() * 0.8 : 1,
    });
  }
}
