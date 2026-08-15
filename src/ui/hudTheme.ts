/**
 * The Phaser side of the palette — the same colours `theme.css` gives the DOM
 * overlays, in the form canvas code can use.
 *
 * `theme.css` opens by calling itself the single source of truth for the retro
 * terminal palette, and for the four overlay stylesheets it is. The HUD never got
 * the message: `Hud.ts` and `Radar.ts` re-typed their colours as literals, twice
 * over — once as a `"#rrggbb"` string for `Text.color` and once as an `0xrrggbb`
 * int for `Graphics`/`Rectangle`. Two hand-maintained copies of one palette drift,
 * and they had: the SRP axes were reading `#5f7285`, the health bar `0x59d98e` and
 * the radar panel `0x0a0f16`, none of which were tokens any more, all of which
 * looked close enough to right that nobody caught them.
 *
 * So the strings live here once and the int form is *derived* by {@link hex}
 * rather than written down. There is no second table to keep in step, and
 * `hudTheme.test.ts` reads `theme.css` and fails the build if this file and that
 * one disagree about a colour they both name.
 *
 * Not every literal in the UI belongs here. A colour that one widget mixes for
 * its own interior — the radar's crosshair and wall dots, its jam static — is
 * scope-internal and stays where it is used. What lives here is the shared
 * vocabulary: the accents that mean something, the surfaces, the structure, and
 * the text ramp. Scope-internal or not, every colour in the UI is an
 * **ENDESGA-64** entry; `theme.css` explains why.
 */

/**
 * The palette, keyed to match `theme.css`'s custom properties.
 *
 * Each key maps to `--c-<kebab-case>`; the test derives that name mechanically,
 * so a key added here without the matching token there fails rather than
 * silently becoming a private colour.
 */
export const UI = {
  // --- accents ---
  cyan: "#00cdf9",
  cyanBright: "#0cf1ff",
  amber: "#ffa214",
  amberBright: "#ffeb57",
  red: "#f5555d",
  redDeep: "#ea323c",
  green: "#5ac54f",
  greenBright: "#d3fc7e",
  /** The "we" of a merged Shared Field, and the ready state that precedes it. */
  greenSoft: "#99e65f",
  /** Body text that wants to read as *interface* without the accent's heat. */
  blueSoft: "#94fdff",

  // --- surfaces ---
  /** What the canvas clears to — darker than any panel. */
  bgVoid: "#0e071b",
  bgPanel: "#1a1932",
  bgScope: "#131313",
  track: "#0c2e44",

  // --- structure ---
  border: "#0069aa",
  borderCool: "#424c6e",
  borderDim: "#2a2f4e",

  // --- text ramp (brightest -> faintest) ---
  text: "#c7cfdd",
  textStrong: "#ffffff",
  textBtn: "#b4b4b4",
  textMuted: "#92a1b9",
  textFaint: "#858585",
  textDim: "#657392",
  textDisabled: "#5d5d5d",
  textDebug: "#3d3d3d",
} as const;

/**
 * `"#00cdf9"` -> `0x00cdf9`, for the Phaser APIs that take a number.
 *
 * The whole point of the module: `Text` wants the string, `Graphics` and
 * `Rectangle` want the int, and deriving the second from the first means the two
 * cannot disagree.
 */
export function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/**
 * `"#00cdf9"` -> `[0, 205, 249]`, for code that interpolates between colours.
 *
 * Same argument as {@link hex}: the phase-lock's live wave mixes amber toward red
 * per frame and needs the channels separately, and it used to carry them written
 * out as `[255, 176, 59]`. That is a third copy of the palette in a third
 * notation — the exact drift this module exists to prevent — so it is derived
 * here instead.
 */
export function rgb(color: string): [number, number, number] {
  const n = hex(color);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * The HUD's margin from every screen edge.
 *
 * Was 12 in the widgets and 10 in `hudLayout.ts`, which is why the top-centre
 * cluster never quite lined up with the top-left one. One number now; the
 * encounter rows in `hudLayout.ts` derive from it.
 */
export const UI_PAD = 12;

/**
 * The type scale.
 *
 * Five steps, because the HUD had grown five sizes (10/11/12/13/20) by accident
 * and they turned out to be doing five distinct jobs. Named for the job so a new
 * widget picks a role rather than a number.
 */
export const UI_TEXT = {
  /** The alert-phase banner. Nothing else is this large. */
  title: "20px",
  /** Running prose — objectives, codec-adjacent readouts. */
  body: "13px",
  /** The default: inventory rows, the controls hint, the conduct line. */
  label: "12px",
  /** Section headings above a bar, and the alert-network rows. */
  small: "11px",
  /** Numeric detail that must not compete — SRP axes, the JAMMED tag. */
  micro: "10px",
} as const;

/**
 * Depth bands for the HUD.
 *
 * These were ad-hoc — 900, 1000, 1001, 1002, 1500 scattered across nine widgets,
 * each chosen relative to whatever the author happened to be looking at. The
 * numbers are unchanged (this is a naming pass, not a re-ordering) but they now
 * say what they are for, so the next widget stacks itself deliberately.
 */
export const UI_DEPTH = {
  /** Panel backgrounds and track rectangles — behind everything they contain. */
  PANEL: 900,
  /** The HUD proper: text, chrome, bar tracks. */
  BASE: 1000,
  /** Bar fills and the radar bezel — over BASE, under its own labels. */
  FILL: 1001,
  /** Labels that must stay legible on top of a fill. */
  ACCENT: 1002,
  /** The debug inspector, above the whole HUD. */
  DEBUG: 1500,
} as const;
