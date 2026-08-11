import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UI, hex } from "./hudTheme";

/**
 * The palette's drift guard.
 *
 * `theme.css` and `hudTheme.ts` describe one palette to two renderers — CSS for
 * the overlay views, canvas for the HUD. Nothing in the build connects them, so
 * the failure mode is a colour edited on one side only: the pause menu's cyan
 * moves, the HUD's does not, and the two are close enough that it reads as a
 * trick of the eye rather than a bug. That is exactly how `#5f7285`, `0x59d98e`
 * and `0x0a0f16` ended up in the HUD naming nothing at all.
 *
 * So the CSS file is the fixture: every key in {@link UI} names a `--c-*` token,
 * and the two values must agree. Checking this direction is enough — it catches
 * an edit to either side, because both sides are being compared, and it still
 * lets `theme.css` carry a token the canvas has no use for.
 */

const THEME_CSS = join(__dirname, "theme.css");

/** `cyanBright` -> `--c-cyan-bright`, the naming rule the two files share. */
function cssVarName(key: string): string {
  return `--c-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Every `--c-<name>: #rrggbb;` declaration in `theme.css`, lowercased. */
function themeTokens(): Map<string, string> {
  const css = readFileSync(THEME_CSS, "utf8");
  const out = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/(--c-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out.set(name, value.toLowerCase());
  }
  return out;
}

describe("hudTheme", () => {
  it("matches theme.css for every colour it names", () => {
    const tokens = themeTokens();
    // Guards the parser itself: a regex that silently matched nothing would make
    // every assertion below vacuous.
    expect(tokens.size).toBeGreaterThan(15);

    for (const [key, value] of Object.entries(UI)) {
      const name = cssVarName(key);
      expect(tokens.has(name), `theme.css has no ${name} for UI.${key}`).toBe(true);
      expect(tokens.get(name), `UI.${key} and ${name} disagree`).toBe(value.toLowerCase());
    }
  });

  it("declares every colour as a six-digit hex string", () => {
    for (const [key, value] of Object.entries(UI)) {
      expect(value, `UI.${key}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("derives the Phaser int form losslessly", () => {
    for (const [key, value] of Object.entries(UI)) {
      const n = hex(value);
      expect(Number.isInteger(n), `UI.${key}`).toBe(true);
      expect(n, `UI.${key}`).toBeGreaterThanOrEqual(0);
      expect(n, `UI.${key}`).toBeLessThanOrEqual(0xffffff);
      // Round-trips: the int and the string are the same colour, always.
      expect(`#${n.toString(16).padStart(6, "0")}`).toBe(value);
    }
  });
});
