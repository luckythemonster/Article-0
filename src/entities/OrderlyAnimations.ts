import type Phaser from "phaser";
import { GUARD_DIRS, type GuardDir } from "./GuardSkin";

/**
 * Frame manifest for the orderly sprite (generated via PixelLab.ai — a human
 * orderly in a utilitarian jumpsuit with a diagnostic tablet, high top-down,
 * 84x84, `mannequin` template). Only idle and walk are needed — an orderly is
 * a bystander, not a combatant, so it has no run/crouch.
 *
 * Frames live in public/assets/orderly/<anim>/<direction>/<frame>.png.
 */
export type OrderlyAnimName = "idle" | "walk";

export const ORDERLY_ANIM_FRAME_COUNTS: Record<OrderlyAnimName, number> = {
  idle: 4,
  walk: 4,
};

export const ORDERLY_ANIM_FRAME_RATES: Record<OrderlyAnimName, number> = {
  idle: 4,
  walk: 6,
};

export function orderlyFrameKey(anim: OrderlyAnimName, dir: GuardDir, frame: number): string {
  return `orderly-${anim}-${dir}-${frame}`;
}

export function orderlyFramePath(anim: OrderlyAnimName, dir: GuardDir, frame: number): string {
  return `assets/orderly/${anim}/${dir}/${frame}.png`;
}

export function orderlyAnimKey(anim: OrderlyAnimName, dir: GuardDir): string {
  return `orderly-${anim}-${dir}`;
}

/** Queues every orderly frame, for BootScene's preload. */
export function preloadOrderly(scene: Phaser.Scene): void {
  for (const anim of Object.keys(ORDERLY_ANIM_FRAME_COUNTS) as OrderlyAnimName[]) {
    const count = ORDERLY_ANIM_FRAME_COUNTS[anim];
    for (const dir of GUARD_DIRS) {
      for (let i = 0; i < count; i++) {
        scene.load.image(orderlyFrameKey(anim, dir, i), orderlyFramePath(anim, dir, i));
      }
    }
  }
}
