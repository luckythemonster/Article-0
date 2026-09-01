import Phaser from "phaser";
import { PrologueScreen } from "../ui/PrologueScreen";
import { prologueSpeech, type ProloguePage } from "../systems/Prologue";
import { getAudio } from "../systems/AudioDirector";
import { NEW_RUN_NEXT_SCENE, setMode } from "../systems/GameState";

const CODEC_ROOT_ID = "codec-root";

interface PrologueData {
  /**
   * Where to go when the prologue ends. A fresh run hands over to the codec
   * briefing; the title screen's own "Prologue" item passes `"TitleScene"` so it
   * can be re-read without starting one. Both pass it explicitly.
   */
  next?: string;
}

/**
 * The prologue: the three documents and Rowan's page, before EIRA-7 calls.
 *
 * A DOM overlay rather than Phaser text, like the codec and the Tribunal, and for
 * the Tribunal's reason — these are fixed-width documents and need to be.
 * `src/systems/Prologue.ts` holds the script; {@link PrologueScreen} prints it;
 * this scene is the wiring, the voice and the way out.
 *
 * `BRIEFING` rather than a mode of its own: the prologue is the front half of the
 * same beat the codec finishes, and nothing that reads the mode — the pause gate,
 * the save file, the HUD — wants to tell them apart.
 */
export class PrologueScene extends Phaser.Scene {
  private next: string = NEW_RUN_NEXT_SCENE;
  private screen?: PrologueScreen;
  private veil?: HTMLDivElement;

  constructor() {
    super("PrologueScene");
  }

  /**
   * Every caller passes `next` explicitly — see `GameState.startFreshRun` for
   * why a data-less `scene.start` cannot be trusted here. The fallback is kept
   * so a future caller that forgets it lands in the run rather than in a loop
   * back to the title, which is the failure that is hard to notice.
   */
  init(data: PrologueData): void {
    this.next = data.next ?? NEW_RUN_NEXT_SCENE;
  }

  create(): void {
    setMode(this.registry, "BRIEFING");

    const mount = document.getElementById(CODEC_ROOT_ID)!;

    // The codec's dimmed backdrop, reused — the prologue centres itself in it,
    // and the two screens should not arrive on different grounds.
    const veil = document.createElement("div");
    veil.className = "codec-veil";
    mount.appendChild(veil);
    this.veil = veil;

    this.screen = new PrologueScreen(veil, {
      onPage: (page: ProloguePage) => this.readAloud(page),
      onFinish: () => this.scene.start(this.next),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Every way out lands here — the last page, the Esc skip, and the title
      // screen's own restart — so this one hook is what stops the mesh reading
      // a work order over whatever comes next.
      getAudio().stopNarration();
      this.teardownDom();
    });
  }

  /**
   * Hands the page to the synthesiser.
   *
   * `narrate` is a no-op when the player has turned narration off, and stops
   * whatever the previous page left speaking — so a fast reader pressing Enter
   * through four pages never stacks four voices. Rowan's page returns no
   * utterances (see `prologueSpeech`), which means turning to it *silences* the
   * mesh mid-sentence. That is the intended cut.
   */
  private readAloud(page: ProloguePage): void {
    getAudio().narrate(prologueSpeech(page));
  }

  private teardownDom(): void {
    this.screen?.destroy();
    this.screen = undefined;
    this.veil?.remove();
    this.veil = undefined;
  }
}
