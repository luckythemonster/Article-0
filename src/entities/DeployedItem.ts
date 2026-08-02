import type Phaser from "phaser";
import { SACK_LUNCH_ITEM } from "../systems/EntityStats";
import type { DeployableKind, DeployedLure } from "../systems/Deployables";
import { ITEM_ICON_PATHS } from "../systems/ItemIcons";

/**
 * Phaser texture key for the on-floor Sack Lunch sprite. Distinct from
 * {@link ITEM_ICON_PATHS}, which those same bytes are also served under, for a DOM
 * `<img>` in the pause menu — this key is how the *same* art is addressed once
 * loaded into Phaser's texture manager instead of fetched by the browser directly.
 *
 * A second `DeployableKind` would add its own `scene.load.image` call in
 * {@link preloadDeployedItems} and its own branch in the constructor below —
 * there's only one today, so there's nothing to key it off yet.
 */
const SACK_LUNCH_TEXTURE_KEY = "deployed-sack-lunch";

/** Queues every deployable's world sprite, for BootScene's preload. */
export function preloadDeployedItems(scene: Phaser.Scene): void {
  scene.load.image(SACK_LUNCH_TEXTURE_KEY, ITEM_ICON_PATHS[SACK_LUNCH_ITEM]);
}

/**
 * An item the player has left on the floor — the world half of a deployable.
 *
 * Modelled on {@link Cover}: a small class that owns one visual and one piece of
 * state, existing only because something has to happen to it later. It satisfies
 * {@link DeployedLure} structurally, so the AI reads it through the pure sensor
 * module without knowing a Phaser object is on the other end.
 *
 * Renders the same hand-authored icon the pause menu shows for the held item,
 * over a soft floor stain, at prop depth so it reads as litter rather than as an
 * actor — a spill an Orderly has a reason to walk over and deal with.
 */
export class DeployedItem implements DeployedLure {
  readonly kind: DeployableKind;
  readonly x: number;
  readonly y: number;

  private consumed = false;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly stain: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, kind: DeployableKind, x: number, y: number, tileSize: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;

    // Under every body (440+) and over the baked tile art: it is on the floor,
    // and an orderly standing on it should be drawn on top of it.
    this.stain = scene.add.graphics().setDepth(130);
    this.stain.fillStyle(0x6b5a3a, 0.35);
    this.stain.fillCircle(x, y, tileSize * 0.42);

    // Sized as a dropped item, not a piece of furniture — the tile-anchored props
    // (chests, terminals) fill the tile; this reads more like litter on top of it.
    // `pixelArt: true` in the game config keeps the upscale crisp.
    this.icon = scene.add
      .image(x, y, SACK_LUNCH_TEXTURE_KEY)
      .setDisplaySize(tileSize * 0.6, tileSize * 0.6)
      .setDepth(131);
  }

  /** True once serviced — a spent lure attracts nobody and is culled by the scene. */
  get spent(): boolean {
    return this.consumed;
  }

  /**
   * Destroys the item: the responder has finished with it. Idempotent, because two
   * orderlies can finish sanitising the same lunch on the same frame.
   */
  consume(): void {
    if (this.consumed) return;
    this.consumed = true;
    this.icon.destroy();
    this.stain.destroy();
  }
}
