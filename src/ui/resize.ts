import Phaser from "phaser";

/**
 * Re-lays-out a scene-owned widget whenever the canvas resizes, and unhooks
 * itself when the scene shuts down.
 *
 * Ten HUD pieces and title-card scenes each hand-rolled the same two lines —
 * `scale.on("resize", …)` plus a `SHUTDOWN` listener to take it back off again.
 * Getting the second line wrong is not a visible bug, which is exactly what
 * makes it worth having in one place: the ScaleManager outlives every scene, so
 * a handler left attached keeps firing into a dead scene's destroyed Game
 * Objects for the rest of the session, once per level transition.
 *
 * @param immediate call the handler once now with the current canvas size —
 *   what most callers want, since a widget has to be laid out before its first
 *   resize as well as after.
 */
export function onResize(
  scene: Phaser.Scene,
  handler: (width: number, height: number) => void,
  immediate = false,
): void {
  if (immediate) handler(scene.scale.width, scene.scale.height);
  const listener = (size: Phaser.Structs.Size): void => handler(size.width, size.height);
  scene.scale.on("resize", listener);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off("resize", listener));
}
