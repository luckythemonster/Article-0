/**
 * The keybinding list, in one place.
 *
 * It was previously written out twice — once as a hardcoded string in the HUD's
 * bottom-left hint (`Hud.ts`) and once in the README's controls table — with the
 * pause menu's CONTROLS tab about to make three. The hint had already drifted
 * once. `GameScene.bindInput()` remains the place keys are actually *bound*; this
 * is the place they are *described*, and the two are checked against each other
 * by eye at review time rather than by a mechanism, because Phaser gives no
 * enumerable view of a scene's bindings.
 */

export interface ControlBinding {
  key: string;
  action: string;
  /** Terse form for the HUD's single-line hint; omitted keys stay off it. */
  hint?: string;
}

export const CONTROLS: readonly ControlBinding[] = [
  { key: "WASD / Arrows", action: "Move (free 8-directional)", hint: "WASD move" },
  { key: "Shift", action: "Sneak — slower and quieter; crouch on cover to hide", hint: "Shift sneak" },
  { key: "Space", action: "Run — faster but louder; tap to toggle", hint: "Space run" },
  { key: "E", action: "Interact: doors, terminals, chests, hatches (hold where needed)", hint: "E interact" },
  { key: "L", action: "Flashlight — the only way to see in the unlit levels" },
  { key: "F", action: "Shared Field — once charged, merge and become undetectable", hint: "F shared-field" },
  { key: "R", action: "Knock — lure guards and orderlies to a wall" },
  { key: "Q", action: "Hold up — with a weapon, aim at an orderly: hands up, silent, and he walks ahead of you" },
  { key: "1 – 4", action: "Use the consumable in that slot" },
  { key: "C", action: "Open the EIRA-7 codec", hint: "C codec" },
  { key: "Esc", action: "Pause — objectives, journal, inventory, index, saves", hint: "Esc pause" },
];

/** The HUD's one-line controls hint, built from the bindings that opt into it. */
export function controlsHintLine(): string {
  return CONTROLS.filter((c) => c.hint).map((c) => c.hint).join("  ");
}
