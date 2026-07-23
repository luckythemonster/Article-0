import Phaser from "phaser";
import { QualiaLockView } from "../ui/QualiaLockView";
import { DEMO_ROUND, type QualiaRound } from "../systems/QualiaLock";
import { getAudio } from "../systems/AudioDirector";

const CODEC_ROOT_ID = "codec-root";

interface QualiaLockData {
  /** The round to play; defaults to the demo silicate-rack round. */
  round?: QualiaRound;
}

/**
 * The Qualia Phase-Lock minigame as an in-game overlay. Ready to launch when
 * Rowan patches a spiking silicate rack; the launching scene freezes the sim
 * behind it (same contract as {@link import("./ComplianceScene").ComplianceScene}).
 *
 * Like the codec and compliance overlays, this is a DOM overlay mounted into
 * #codec-root rather than Phaser GameObjects — it hosts a {@link QualiaLockView}
 * (the same widget the standalone demo uses). The scene never closes itself:
 * completing the bypass raises `qualiaSolved`; a purge or abort raises
 * `qualiaClosed`. The launching scene consumes whichever flag while the overlay
 * is up and stops this scene.
 */
export class QualiaLockScene extends Phaser.Scene {
  private round: QualiaRound = DEMO_ROUND;
  private view?: QualiaLockView;
  private veil?: HTMLDivElement;

  constructor() {
    super("QualiaLockScene");
  }

  init(data: QualiaLockData): void {
    this.round = data.round ?? DEMO_ROUND;
  }

  create(): void {
    const mount = document.getElementById(CODEC_ROOT_ID)!;

    // Reuse the codec overlay's dimmed backdrop; the view centres itself within.
    const veil = document.createElement("div");
    veil.className = "codec-veil";
    mount.appendChild(veil);
    this.veil = veil;

    getAudio().ping();

    this.view = new QualiaLockView(veil, this.round, {
      // The launching scene consumes these flags while the overlay is up.
      onSolved: () => this.registry.set("qualiaSolved", true),
      onPurged: () => this.registry.set("qualiaClosed", true),
      onClose: () => this.registry.set("qualiaClosed", true),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardownDom());
  }

  private teardownDom(): void {
    this.view?.destroy();
    this.view = undefined;
    this.veil?.remove();
    this.veil = undefined;
  }
}
