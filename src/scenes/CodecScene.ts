import Phaser from "phaser";
import { createFrame, type Frame } from "@arwes/frames";
import { terminalFrameSettings } from "../ui/frame";
import { initialObjectives, objectiveLines, type ObjectiveState } from "../systems/Objectives";
import { codecHeader, codecLines, codecSpeech, type CodecContext } from "../ui/Codec";
import type { ConductView } from "../systems/Conduct";
import { missionFeatures, setMode } from "../systems/GameState";
import { getAudio } from "../systems/AudioDirector";
import { captureModalFocus } from "../ui/dom";
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
  private restoreFocus?: () => void;

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
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "codec-title");
    panel.tabIndex = -1;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "codec-frame-svg");
    // Decorative frame border; the panel's text carries the accessible content.
    svg.setAttribute("aria-hidden", "true");
    panel.appendChild(svg);

    const state =
      (this.registry.get("objectives") as ObjectiveState | undefined) ?? initialObjectives();
    const level = (this.registry.get("currentLevel") as string | undefined) ?? "";
    const conduct = this.registry.get("conduct") as ConductView | undefined;
    const ctx: CodecContext = {
      briefing: this.interactive,
      objectives: state,
      features: missionFeatures(this.registry),
      highCompliance: conduct?.highCompliance ?? false,
      sabotageActions: conduct?.sabotageActions ?? 0,
    };

    const header = document.createElement("div");
    header.className = "codec-header";
    header.id = "codec-title";
    header.textContent = codecHeader(ctx);

    const body = document.createElement("pre");
    body.className = "codec-body";
    body.textContent = codecLines(ctx).join("\n");

    const directiveHead = document.createElement("div");
    directiveHead.className = "codec-directive-head";
    directiveHead.textContent = "DIRECTIVE";

    const directive = document.createElement("pre");
    directive.className = "codec-directive";
    directive.textContent = objectiveLines(state, level, ctx.features)
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
    this.restoreFocus = captureModalFocus(panel);

    this.frame = createFrame(svg, terminalFrameSettings());

    // She reads her own transmission. `narrate` is a no-op when the player has
    // turned narration off, and stops anything the previous open left speaking.
    getAudio().narrate(codecSpeech(ctx));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Every way out of the codec lands here — `C` and the minigame gates go
      // through `OverlayGate.set` -> `scene.stop`, and the briefing's Enter
      // through `scene.start` — so this one hook is what stops her talking over
      // the game she just handed back.
      getAudio().stopNarration();
      this.teardownDom();
    });

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
    this.restoreFocus?.();
    this.restoreFocus = undefined;
    this.veil?.remove();
    this.veil = undefined;
  }
}
