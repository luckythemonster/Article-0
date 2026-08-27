import type Phaser from "phaser";
import { FONT_MONO } from "../ui/fonts";

/** Overhead, above every body and cone but under the darkness. The default. */
const OVERHEAD_DEPTH = 600;

/**
 * The Metal Gear "!" — the yellow exclamation that pops over anyone who has
 * just noticed you.
 *
 * A guard raises it on a confirmed sighting and an orderly raises it on
 * witnessing one, and both built the identical text object to do it.
 * {@link OVERHEAD_DEPTH} puts it above every body (450) and cone (400) but under
 * the darkness overlay (700), so a guard who spots you across an unlit room does
 * not advertise it through the dark.
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
    .setDepth(OVERHEAD_DEPTH)
    .setVisible(false);
}

/**
 * Overhead, and *through* the darkness — for a line that stands in for a sound.
 *
 * Above the lighting render texture (700) and its shadow fan (701), below the
 * debug overlay (900) and the world-space prompts and bars (1000).
 *
 * This is the one case where hiding a marker in the dark is wrong, and it is
 * worth being exact about why, because {@link alertMarker} deliberately does the
 * opposite two functions up. A silicate's bark is a *sound*: it plays at full
 * volume from anywhere on the level, because the whole point is the callout from
 * the room you are not looking at. Its text twin exists so a muted player gets
 * the same information — and at depth 600 the opaque darkness overlay painted
 * over exactly the off-screen guard the bark is for, leaving a muted player with
 * no channel at all. The `!` is different in kind: it reports that a guard can
 * see *you*, which is information about a lit sightline, so leaving it in the
 * dark costs nothing and showing it through a wall would give away a position.
 *
 * Orderlies keep {@link OVERHEAD_DEPTH}: a muttered reprimand is a local,
 * in-view event, and it has no sound to stand in for.
 */
export const AUDIBLE_LINE_DEPTH = 720;

/**
 * A line of speech over someone's head — a reprimand, a muttered protocol
 * citation, a silicate's compliance-speak. Small and dim, because most of the
 * states that use it are ones where nobody has raised their voice yet.
 *
 * `depth` decides whether the darkness may swallow it — see
 * {@link AUDIBLE_LINE_DEPTH} for the one caller that passes something else.
 *
 * Starts hidden and empty; the caller sets the text, position and visibility.
 */
export function speechMarker(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tileSize: number,
  depth: number = OVERHEAD_DEPTH,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y - tileSize, "", {
      fontFamily: FONT_MONO,
      fontSize: `${Math.floor(tileSize * 0.34)}px`,
      color: "#9fb4c7",
    })
    .setOrigin(0.5)
    .setDepth(depth)
    .setVisible(false);
}
