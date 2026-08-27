import type Phaser from "phaser";

/**
 * The four overlays that can take the screen away from the running game: the
 * pause menu, the EIRA-7 codec, and the two minigames.
 *
 * Each one used to have its own toggle, and all four were the same seven lines
 * — flip a flag, republish the suspended state, pause Arcade physics, launch a
 * scene; and the reverse on the way out. What actually differs between them is
 * a scene key and a little setup, which is what {@link OverlayConfig} carries.
 *
 * Centralising the flags also fixes the part that was easy to get wrong.
 * "Something is covering the screen" is a property of all four together, not of
 * whichever one just changed, so closing the codec while the pause menu is up
 * must not report the game as resumed. That answer is computed here from the
 * whole set rather than assigned by each toggle.
 */

export type OverlayId = "pause" | "codec" | "compliance" | "qualia";

export interface OverlayConfig {
  /** The Phaser scene launched for this overlay. */
  sceneKey: string;
  /** Data passed to `scene.launch`, evaluated at open time. */
  launchData?: () => object;
  /** Extra work on the way in, after physics is paused. */
  onOpen?: () => void;
  /** Extra work on the way out, before physics resumes. */
  onClose?: () => void;
}

export class OverlayGate {
  private readonly open: Record<OverlayId, boolean> = {
    pause: false,
    codec: false,
    compliance: false,
    qualia: false,
  };

  /**
   * @param publishSuspended told whether *any* overlay owns the screen. UIScene
   *   runs in parallel and keeps updating behind every overlay, so it needs
   *   this to know when not to read gameplay input.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly configs: Record<OverlayId, OverlayConfig>,
    private readonly publishSuspended: (suspended: boolean) => void,
  ) {}

  isOpen(id: OverlayId): boolean {
    return this.open[id];
  }

  /** True while any overlay is up — the sim must not advance. */
  get anyOpen(): boolean {
    return this.open.pause || this.open.codec || this.open.compliance || this.open.qualia;
  }

  /** True while a minigame is up; those suppress the pause and codec hotkeys. */
  get minigameOpen(): boolean {
    return this.open.compliance || this.open.qualia;
  }

  /** Opens or closes one overlay. A no-op if it is already in that state. */
  set(id: OverlayId, open: boolean): void {
    if (open === this.open[id]) return;
    this.open[id] = open;
    this.publishSuspended(this.anyOpen);

    const cfg = this.configs[id];
    if (open) {
      this.scene.physics.pause();
      cfg.onOpen?.();
      this.scene.scene.launch(cfg.sceneKey, cfg.launchData?.() ?? {});
    } else {
      this.scene.scene.stop(cfg.sceneKey);
      cfg.onClose?.();
      this.scene.physics.resume();
    }
  }

  /**
   * Republishes the suspended flag without changing anything.
   *
   * Needed after a scene restart out of an overlay — a load from the pause menu
   * — where the flags reset to false but nobody told UIScene, leaving its input
   * gate stuck closed.
   */
  resync(): void {
    this.publishSuspended(this.anyOpen);
  }

  /**
   * Reads and clears a minigame's outcome from the registry.
   *
   * Both minigames are DOM overlays with no handle on the scene, so they post
   * their result to the registry and it is collected here. The sim update never
   * runs while one is open, which is why this has to be polled from the branch
   * that handles the overlay rather than from the normal frame.
   *
   * `failedKey` is optional: only the compliance puzzle can be committed wrong,
   * so the qualia overlay keeps polling with just the two outcomes.
   */
  pollResult(solvedKey: string, closedKey: string, failedKey?: string): "solved" | "closed" | "failed" | null {
    const registry = this.scene.registry;
    if (registry.get(solvedKey) === true) {
      registry.remove(solvedKey);
      return "solved";
    }
    if (registry.get(closedKey) === true) {
      registry.remove(closedKey);
      return "closed";
    }
    if (failedKey && registry.get(failedKey) === true) {
      registry.remove(failedKey);
      return "failed";
    }
    return null;
  }
}
