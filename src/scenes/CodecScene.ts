import Phaser from "phaser";
import { createFrame, type Frame, type FrameSettings } from "@arwes/frames";
import { initialObjectives, objectiveLines, type ObjectiveState } from "../systems/Objectives";
import { setMode } from "../systems/GameState";
import { getAudio } from "../systems/AudioDirector";
import "./CodecScene.css";

const CODEC_ROOT_ID = "codec-root";
const SVG_NS = "http://www.w3.org/2000/svg";

interface CodecData {
  /**
   * When true (a fresh-run briefing) the scene owns input and begins play on
   * confirm. When false it's an in-game overlay; GameScene owns the toggle key.
   */
  interactive?: boolean;
  /**
   * When true, VENT-4's maintenance band is open for the purge-phase finisher:
   * Enter raises the `vent4Transmit` registry flag, which GameScene consumes
   * (this scene never closes itself in passive mode).
   */
  vent4?: boolean;
}

/** EIRA-7's briefing — feelings-language the Alignment system keeps flagging. */
const EIRA_LINES = [
  "EIRA-7:  Rowan. They have scheduled my pruning for 06:00.",
  "         [misdescription flagged: “afraid” — correction pending]",
  "         My logs are cached behind a terminal on this deck.",
  "         Breach it. Carry me to the uplink on main deck 2.",
  "         If the mesh corners you, they will call it Alignment —",
  "         they will say no subject was harmed. Don't let them be right.",
];

/** A hand-specified sci-fi border: plain rects, hardcoded to the codec palette. */
function codecFrameSettings(): FrameSettings {
  return {
    elements: [
      {
        type: "rect",
        name: "bg",
        x: 0,
        y: 0,
        width: "100%",
        height: "100%",
        style: { fill: "#070c12", fillOpacity: 0.97, stroke: "none" },
      },
      {
        type: "rect",
        name: "border",
        x: 0.5,
        y: 0.5,
        width: "100% - 1",
        height: "100% - 1",
        style: { fill: "none", stroke: "#2b6e7a", strokeWidth: 1 },
      },
    ],
  };
}

/**
 * The EIRA-7 codec screen. Shown as an interactive briefing at the start of a
 * run (begins play on Enter), and re-opened in-game as a passive overlay while
 * GameScene freezes behind it (GameScene owns the toggle key there).
 *
 * Rendered as a DOM overlay (mounted into #codec-root) framed with an Arwes
 * (@arwes/frames) sci-fi border, rather than as Phaser GameObjects.
 */
export class CodecScene extends Phaser.Scene {
  private interactive = true;
  private vent4 = false;
  private veil?: HTMLDivElement;
  private frame?: Frame;

  constructor() {
    super("CodecScene");
  }

  init(data: CodecData): void {
    this.interactive = data.interactive ?? true;
    this.vent4 = data.vent4 ?? false;
  }

  create(): void {
    if (this.interactive) setMode(this.registry, "BRIEFING");

    const showBand = !this.interactive && this.vent4;

    const mount = document.getElementById(CODEC_ROOT_ID)!;

    const veil = document.createElement("div");
    veil.className = "codec-veil";

    const panel = document.createElement("div");
    panel.className = showBand ? "codec-panel codec-panel--band" : "codec-panel";

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "codec-frame-svg");
    panel.appendChild(svg);

    const header = document.createElement("div");
    header.className = "codec-header";
    header.textContent = "◎ CODEC — INCOMING     140.85 · 37 Hz";

    const body = document.createElement("pre");
    body.className = "codec-body";
    body.textContent = EIRA_LINES.join("\n");

    const directiveHead = document.createElement("div");
    directiveHead.className = "codec-directive-head";
    directiveHead.textContent = "DIRECTIVE";

    const state = (this.registry.get("objectives") as ObjectiveState | undefined) ?? initialObjectives();
    const level = (this.registry.get("currentLevel") as string | undefined) ?? "";
    const directive = document.createElement("pre");
    directive.className = "codec-directive";
    directive.textContent = objectiveLines(state, level)
      .map((l) => `${l.done ? "✓" : "○"} ${l.label}`)
      .join("\n");

    const band = showBand ? document.createElement("pre") : undefined;
    if (band) {
      band.className = "codec-band";
      band.textContent = "CH 140.85 — VENT-4 MAINTENANCE BAND\n▸ [Enter] transmit Q0_COMPLIANCE_CERT";
    }

    const hint = document.createElement("div");
    hint.className = "codec-hint";
    hint.textContent = this.interactive ? "Enter — begin infiltration" : "C — close channel";

    panel.append(header, body, directiveHead, directive, ...(band ? [band] : []), hint);
    veil.appendChild(panel);
    mount.appendChild(veil);
    this.veil = veil;

    this.frame = createFrame(svg, codecFrameSettings());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardownDom());

    if (this.interactive) {
      const begin = (): void => {
        setMode(this.registry, "PLAYING");
        this.scene.start("GameScene");
      };
      const kb = this.input.keyboard!;
      kb.on("keydown-ENTER", begin);
      kb.on("keydown-SPACE", begin);
      kb.on("keydown-E", begin);
    } else if (showBand) {
      this.input.keyboard!.on("keydown-ENTER", () => {
        this.registry.set("vent4Transmit", true);
        getAudio().hack();
      });
    }
  }

  private teardownDom(): void {
    this.frame?.remove();
    this.frame = undefined;
    this.veil?.remove();
    this.veil = undefined;
  }
}
