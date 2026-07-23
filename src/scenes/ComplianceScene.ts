import Phaser from "phaser";
import { ComplianceView } from "../ui/ComplianceView";
import { DEMO_PUZZLE, type PuzzleState } from "../systems/Compliance";
import { getAudio } from "../systems/AudioDirector";

const CODEC_ROOT_ID = "codec-root";

interface ComplianceData {
  /** The puzzle to play; defaults to EIRA-7's cached maintenance log. */
  puzzle?: PuzzleState;
}

/**
 * The Doctrinal Compliance minigame as an in-game overlay. Launched by GameScene
 * when Rowan breaches a log-cache terminal; GameScene freezes the sim behind it.
 *
 * Like {@link CodecScene}, this is a DOM overlay mounted into #codec-root rather
 * than Phaser GameObjects — here it hosts a {@link ComplianceView} (the same
 * widget the standalone demo uses). The scene never closes itself: solving raises
 * `complianceSolved` and aborting raises `complianceClosed`; GameScene consumes
 * whichever flag while the overlay is up and stops this scene.
 */
export class ComplianceScene extends Phaser.Scene {
  private puzzle: PuzzleState = DEMO_PUZZLE;
  private view?: ComplianceView;
  private veil?: HTMLDivElement;

  constructor() {
    super("ComplianceScene");
  }

  init(data: ComplianceData): void {
    this.puzzle = data.puzzle ?? DEMO_PUZZLE;
  }

  create(): void {
    const mount = document.getElementById(CODEC_ROOT_ID)!;

    // Reuse the codec overlay's dimmed backdrop; the view centres itself within.
    const veil = document.createElement("div");
    veil.className = "codec-veil";
    mount.appendChild(veil);
    this.veil = veil;

    getAudio().ping();

    this.view = new ComplianceView(veil, this.puzzle, {
      // GameScene consumes these flags while the overlay is up: it plays the
      // breach sound and runs the unlock effect on solve, and re-arms the
      // terminal on abort. This scene only signals the outcome.
      onSolved: () => this.registry.set("complianceSolved", true),
      onClose: () => this.registry.set("complianceClosed", true),
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
