import type Phaser from "phaser";

export const GUARD_DIRS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;
export type GuardDir = (typeof GUARD_DIRS)[number];

/**
 * Describes one guard's sprite sheet + display tuning, so the shared vision-
 * cone/patrol/pursue/detection AI in {@link Enforcer} can drive any reskin
 * (the security drone, the crawlspace drone, ...) without knowing its asset
 * layout. All guard skins use the same 8 directions.
 */
export interface GuardSkin {
  frameCount: number;
  frameRate: number;
  /** Display height as a multiple of tile size (e.g. 1.5 tiles). */
  displayTiles: number;
  /** Native pixel size of the (square) source art. */
  sourceSize: number;
  frameKey(dir: GuardDir, frame: number): string;
  framePath(dir: GuardDir, frame: number): string;
  animKey(dir: GuardDir): string;
}

const DIRECTION_ORDER: GuardDir[] = [
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
];

/** Snaps a facing angle (radians) to the nearest of the 8 guard directions. */
export function nearestGuardDirection(angle: number): GuardDir {
  const angleDeg = (angle * 180) / Math.PI;
  const normalized = ((angleDeg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return DIRECTION_ORDER[index];
}

/** Queues every frame a skin needs, for BootScene's preload. */
export function preloadGuardSkin(scene: Phaser.Scene, skin: GuardSkin): void {
  for (const dir of GUARD_DIRS) {
    for (let i = 0; i < skin.frameCount; i++) {
      scene.load.image(skin.frameKey(dir, i), skin.framePath(dir, i));
    }
  }
}
