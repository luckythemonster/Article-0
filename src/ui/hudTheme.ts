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
 * the text ramp.
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
  cyan: "#39d3ff",
  cyanBright: "#5fe0ff",
  amber: "#ffb03b",
  amberBright: "#ffe14d",
  red: "#ff5c6a",
  redDeep: "#ff3b3b",
  green: "#5effa0",
  greenBright: "#d6ffe8",
  /** The "we" of a merged Shared Field, and the ready state that precedes it. */
  greenSoft: "#8effc0",
  /** Body text that wants to read as *interface* without the accent's heat. */
  blueSoft: "#9fd2ff",

  // --- surfaces ---
  bgPanel: "#070c12",
  bgScope: "#03070c",
  track: "#11202b",

  // --- structure ---
  border: "#2b6e7a",
  borderCool: "#2b4356",
  borderDim: "#2b3a44",

  // --- text ramp (brightest -> faintest) ---
  text: "#bfe3ea",
  textStrong: "#cfe0f0",
  textBtn: "#9fb6c2",
  textMuted: "#8fa9b4",
  textFaint: "#8899aa",
  textDim: "#6b7f92",
  textDisabled: "#4a5a68",
  textDebug: "#45566a",
} as const;

/**
 * `"#39d3ff"` -> `0x39d3ff`, for the Phaser APIs that take a number.
 *
 * The whole point of the module: `Text` wants the string, `Graphics` and
 * `Rectangle` want the int, and deriving the second from the first means the two
 * cannot disagree.
 */
export function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
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
