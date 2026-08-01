import type Phaser from "phaser";
import { FONT_MONO } from "../ui/fonts";

/**
 * The Metal Gear "!" — the yellow exclamation that pops over anyone who has
 * just noticed you.
 *
 * A guard raises it on a confirmed sighting and an orderly raises it on
 * witnessing one, and both built the identical text object to do it. Depth 600
 * puts it above every body (450) and cone (400) but under the darkness overlay
 * (700), so a guard who spots you across an unlit room does not advertise it
 * through the dark.
 *
 * Starts hidden; the caller sets its position and visibility per frame.
 */
export function alertMarker(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tileSize: number,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y - tileSize, "!", {
      fontFamily: FONT_MONO,
      fontSize: `${Math.floor(tileSize * 0.9)}px`,
      color: "#ffec3d",
      fontStyle: "bold",
    })
    .setOrigin(0.5)
    .setDepth(600)
    .setVisible(false);
}

/**
 * A line of speech over someone's head — a reprimand, a muttered protocol
 * citation. The quiet counterpart to {@link alertMarker}: same depth for the same
 * reason, but small and dim, because the whole point of the states that use it is
 * that nobody has raised their voice yet.
 *
 * Starts hidden and empty; the caller sets the text, position and visibility.
 */
export function speechMarker(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tileSize: number,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y - tileSize, "", {
      fontFamily: FONT_MONO,
      fontSize: `${Math.floor(tileSize * 0.34)}px`,
      color: "#9fb4c7",
    })
    .setOrigin(0.5)
    .setDepth(600)
    .setVisible(false);
}
