import Phaser from "phaser";
import { TribunalScreen } from "../ui/TribunalScreen";
import { getAudio } from "../systems/AudioDirector";
import { setMode } from "../systems/GameState";

const CODEC_ROOT_ID = "codec-root";

/**
 * The run's closing scene: the Alignment Tribunal's exhibit record.
 *
 * Reached from `GameScene.endRun("TRIBUNAL", "TribunalScene")` when the rooftop uplink
 * completes and the capture sequence plays out — the one ending the game has, replacing
 * the old `VictoryScene`. See {@link TribunalScreen} for why.
 *
 * A DOM overlay rather than Phaser text, like the codec and both minigames, because the
 * record is a fixed-width document and needs to be one: `<pre>` in Share Tech Mono keeps
 * its 80-column rules intact at any window size, which a canvas `Text` would not.
 */
export class TribunalScene extends Phaser.Scene {
  private screen?: TribunalScreen;
  private veil?: HTMLDivElement;

  constructor() {
    super("TribunalScene");
  }

  create(): void {
    const mount = document.getElementById(CODEC_ROOT_ID)!;

    // The codec's dimmed backdrop, reused — the record centres itself within it.
    const veil = document.createElement("div");
    veil.className = "codec-veil";
    mount.appendChild(veil);
    this.veil = veil;

    getAudio().capture();

    this.screen = new TribunalScreen(veil, {
      onContinue: () => {
        setMode(this.registry, "TITLE");
        this.scene.start("TitleScene");
      },
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardownDom());
  }

  private teardownDom(): void {
    this.screen?.destroy();
    this.screen = undefined;
    this.veil?.remove();
    this.veil = undefined;
  }
}
