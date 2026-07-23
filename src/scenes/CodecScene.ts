import Phaser from "phaser";
import { initialObjectives, objectiveLines, type ObjectiveState } from "../systems/Objectives";
import { setMode } from "../systems/GameState";

interface CodecData {
  /**
   * When true (a fresh-run briefing) the scene owns input and begins play on
   * confirm. When false it's an in-game overlay; GameScene owns the toggle key.
   */
  interactive?: boolean;
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

/**
 * The EIRA-7 codec screen. Shown as an interactive briefing at the start of a
 * run (begins play on Enter), and re-opened in-game as a passive overlay while
 * GameScene freezes behind it (GameScene owns the toggle key there).
 */
export class CodecScene extends Phaser.Scene {
  private interactive = true;

  constructor() {
    super("CodecScene");
  }

  init(data: CodecData): void {
    this.interactive = data.interactive ?? true;
  }

  create(): void {
    if (this.interactive) setMode(this.registry, "BRIEFING");

    const veil = this.add.rectangle(0, 0, 10, 10, 0x05070a, 0.5).setOrigin(0, 0).setScrollFactor(0);
    const panel = this.add
      .rectangle(0, 0, 10, 10, 0x070c12, 0.97)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setStrokeStyle(1, 0x2b6e7a);
    const header = this.add
      .text(0, 0, "◎ CODEC — INCOMING     140.85 · 37 Hz", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#39d3ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    const body = this.add
      .text(0, 0, EIRA_LINES.join("\n"), { fontFamily: "monospace", fontSize: "13px", color: "#bfe3ea", lineSpacing: 4 })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    const directiveHead = this.add
      .text(0, 0, "DIRECTIVE", { fontFamily: "monospace", fontSize: "11px", color: "#8899aa" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    const state = (this.registry.get("objectives") as ObjectiveState | undefined) ?? initialObjectives();
    const level = (this.registry.get("currentLevel") as string | undefined) ?? "";
    const directive = this.add
      .text(0, 0, objectiveLines(state, level).map((l) => `${l.done ? "✓" : "○"} ${l.label}`).join("\n"), {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#cfe0f0",
        lineSpacing: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    const hint = this.add
      .text(0, 0, this.interactive ? "Enter — begin infiltration" : "C — close channel", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#6b7f92",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    const layout = (w: number, h: number): void => {
      veil.setSize(w, h);
      const pw = Math.min(600, w - 40);
      const ph = Math.min(320, h - 40);
      panel.setPosition(w / 2, h / 2);
      panel.setSize(pw, ph);
      let y = h / 2 - ph / 2 + 18;
      header.setPosition(w / 2, y);
      y += header.height + 14;
      body.setPosition(w / 2, y);
      y += body.height + 16;
      directiveHead.setPosition(w / 2, y);
      y += directiveHead.height + 6;
      directive.setPosition(w / 2, y);
      hint.setPosition(w / 2, h / 2 + ph / 2 - 26);
    };
    layout(this.scale.width, this.scale.height);
    const onResize = (size: Phaser.Structs.Size): void => layout(size.width, size.height);
    this.scale.on("resize", onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", onResize));

    if (this.interactive) {
      const begin = (): void => {
        setMode(this.registry, "PLAYING");
        this.scene.start("GameScene");
      };
      const kb = this.input.keyboard!;
      kb.on("keydown-ENTER", begin);
      kb.on("keydown-SPACE", begin);
      kb.on("keydown-E", begin);
    }
  }
}
