import type Phaser from "phaser";
import type { Breaker } from "../../entities/Breaker";
import type { Chest } from "../../entities/Chest";
import type { Door } from "../../entities/Door";
import type { Terminal } from "../../entities/Terminal";
import { FONT_MONO } from "../../ui/fonts";
import { UI } from "../../ui/hudTheme";

/**
 * The two labels that float over Rowan's head: the contextual `[E]` verb, and
 * the status marker that says how the facility currently reads him.
 *
 * Both are the same shape — a Text object pinned above the player, shown with a
 * string or hidden with nothing — so they share an owner. Keeping the two
 * `add.text` calls next to the code that positions them also means the styling
 * and the placement can no longer drift apart across 2000 lines of scene.
 *
 * The verb selection itself is {@link promptLabelFor}, a pure function, because
 * "which of six candidates wins" is a rule worth testing without a Phaser scene
 * to hang it on.
 */

/**
 * Everything in reach that E could act on, for the single nearest-wins prompt.
 *
 * An object rather than the positional list this used to be. It had grown to
 * eleven parameters, six of them a thing paired with its distance, and the
 * breaker would have made it thirteen — at which point a transposed pair of
 * arguments is a bug the compiler cannot see, since half of them are `number`
 * and the rest are optional.
 */
export interface PromptCandidates {
  terminal: Terminal | undefined;
  terminalDist: number;
  door: Door | undefined;
  doorDist: number;
  breaker: Breaker | undefined;
  breakerDist: number;
  chest: Chest | undefined;
  chestDist: number;
  hatch: boolean;
  vault: boolean;
  ventLabel?: string;
  ventDist?: number;
  /** A transition the player is standing on that refuses to open, and why. */
  lockedLabel?: string;
}

/**
 * What the label is pinned to. `Player` satisfies this structurally; naming the
 * four fields it actually reads keeps the pure half testable with a literal.
 */
export interface PromptAnchor {
  x: number;
  y: number;
  peeking: boolean;
  pressed: boolean;
}

/**
 * Picks the winning `[E]` verb from everything in reach.
 *
 * Nearest wins among the ranged candidates, with the ties broken by the order
 * of the comparisons below — which deliberately matches the order the tap is
 * claimed in `updateInteractions`, so the prompt never advertises a verb that a
 * closer thing would actually consume.
 */
export function promptLabelFor(c: PromptCandidates): string | undefined {
  let label: string | undefined;
  let best = Infinity;
  if (c.terminal && c.terminalDist < best) {
    best = c.terminalDist;
    label = "[E] Hack";
  }
  if (c.ventLabel && (c.ventDist ?? Infinity) < best) {
    best = c.ventDist ?? Infinity;
    label = c.ventLabel;
  }
  if (c.chest && c.chestDist < best) {
    best = c.chestDist;
    label = "[E] Search";
  }
  // Above the door *and evaluated above it*, matching the tap order: a breaker
  // outranks a door at the same reach, because it is a thing you crossed the
  // deck for and main1 puts one on the same board as a door. The verb names the
  // *outcome* rather than the switch, because "[E] Breaker" would not tell you
  // which way it goes.
  //
  // The ordering is what carries the tie, not the comparison. Going first means
  // a tie with the door (or with a hatch at its 0.2) leaves the later `<` false,
  // so the breaker keeps the slot — exactly as `updateInteractions` resolves it
  // with `breakerDist <= Math.min(doorDist, hatchDist)`. Loosening this test to
  // `<=` instead would have let the breaker take ties from the terminal, vent and
  // chest above as well, and those are *holds*: nothing in the tap order says
  // they should lose one.
  if (c.breaker && c.breakerDist < best) {
    best = c.breakerDist;
    label = c.breaker.isClosed ? "[E] Cut power" : "[E] Restore power";
  }
  if (c.door && c.doorDist < best) {
    best = c.doorDist;
    label = c.door.isOpen ? "[E] Close" : "[E] Open";
  }
  if (c.hatch && 0.2 < best) {
    label = "[E] Use access";
  }
  // Lowest priority of the E verbs, matching the tap order above: a crate is
  // scenery Rowan happens to be facing, and it must not shout over a door.
  if (c.vault && !label) {
    label = "[E] Vault";
  }
  // A gated transition wins outright: the player is standing on it, and telling them
  // why it won't open matters more than any verb they could reach from there.
  if (c.lockedLabel) label = c.lockedLabel;

  return label;
}

/**
 * Picks the status marker's text and colour.
 *
 * Concealed reads as the Shared Field's green, passing-as-staff as the soft
 * blue, and anything else as amber — the caution the style guide reserves for
 * flagged conduct.
 */
export function statusMarkerFor(
  anchor: PromptAnchor,
  concealed: boolean,
  compliant: boolean,
): { label: string; color: string } | undefined {
  const label = concealed
    ? "HIDDEN"
    : anchor.peeking
      ? "PEEKING"
      : anchor.pressed
        ? "PRESSED"
        : compliant
          ? "COMPLIANT"
          : null;
  if (!label) return undefined;
  return {
    label,
    color: concealed ? UI.greenSoft : label === "COMPLIANT" ? UI.blueSoft : UI.amber,
  };
}

export class InteractPrompt {
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;

  /**
   * @param tileSize fixed for the module's life. A level change restarts the
   *   scene, which rebuilds this, so it cannot go stale underneath us.
   */
  constructor(
    scene: Phaser.Scene,
    private readonly tileSize: number,
  ) {
    // Interact prompt for hatches and ladders.
    this.prompt = scene.add
      .text(0, 0, "[E] Use access", {
        fontFamily: FONT_MONO,
        fontSize: "11px",
        color: "#cfe8ff",
        backgroundColor: "#0a0f16cc",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(1000)
      .setVisible(false);

    // "HIDDEN" marker shown over the player while concealed in cover.
    this.status = scene.add
      .text(0, 0, "HIDDEN", {
        fontFamily: FONT_MONO,
        fontSize: "10px",
        color: UI.greenSoft,
        fontStyle: "bold",
        backgroundColor: `${UI.bgPanel}cc`,
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(1000)
      .setVisible(false);
  }

  /** Whether a verb is currently on screen — the hold-up offer defers to it. */
  get visible(): boolean {
    return this.prompt.visible;
  }

  /** Shows the winning verb from everything in reach, or clears the prompt. */
  show(c: PromptCandidates, anchor: PromptAnchor): void {
    this.set(promptLabelFor(c), anchor);
  }

  /** Takes the verb off screen without needing somewhere to have put it. */
  clear(): void {
    this.prompt.setVisible(false);
  }

  /**
   * Puts a label in the contextual prompt over Rowan's head, or clears it.
   *
   * Split out of {@link show} rather than becoming another field on
   * {@link PromptCandidates}: the hold-up is not a nearest-wins candidate at
   * all — it is a state that replaces the whole comparison.
   */
  set(label: string | undefined, anchor: PromptAnchor): void {
    if (!label) {
      this.prompt.setVisible(false);
      return;
    }
    this.prompt.setText(label);
    this.prompt.setPosition(anchor.x, anchor.y - this.tileSize * 0.9);
    this.prompt.setVisible(true);
  }

  /**
   * Floats a single status marker over the player: "HIDDEN" while concealed in cover,
   * "PEEKING" while leaning past a corner, "PRESSED" while holding a face, otherwise
   * "COMPLIANT" while Rowan reads as staff. One label rather than four so they can't
   * stack on the same spot, ranked by how much each is protecting him right now —
   * concealment first, being the strongest (it survives an active alert, which
   * compliance does not).
   *
   * Pressing earns a label at all because it is the one state here with no other
   * tell: concealment darkens the threat meter, compliance is why nobody reacts, and
   * a peek visibly opens the darkness — but a man flat against a wall looks like a
   * man standing next to one.
   */
  showStatus(anchor: PromptAnchor, concealed: boolean, compliant: boolean): void {
    const marker = statusMarkerFor(anchor, concealed, compliant);
    if (!marker) {
      this.status.setVisible(false);
      return;
    }
    this.status
      .setText(marker.label)
      .setColor(marker.color)
      .setPosition(anchor.x, anchor.y - this.tileSize * 0.9)
      .setVisible(true);
  }
}
