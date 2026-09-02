/**
 * Which circuits are live, and the keypad codes punched into them.
 *
 * The map has carried this design since v0.4 and nothing read it: a `PowerGrid`
 * component on `main1`'s `breaker_main1`, naming `light_overhead1` as its target
 * and `CLOSED` as its resting state. `light_overhead1` is a tile-def ref placed
 * fifty times across that level, so the one breaker feeds the whole main deck's
 * overhead lighting.
 *
 * Cutting it is not cosmetic. `src/ui/Lighting.ts` makes unlit space genuinely
 * opaque, and `src/systems/DetectionSystem.ts` reads the same `light_sources`
 * data to decide how easily a guard sees you — so one throw both blinds the
 * player and un-lights fifty pools worth of ×1.6 detection.
 *
 * Headless, like everything else under `src/systems/` — no Phaser, no DOM — so
 * the state machine and the code generator are unit-testable without a scene.
 * `src/entities/Breaker.ts` owns the animation; this owns the truth.
 */

/**
 * Circuit state that outlives a level, held in the Phaser registry.
 *
 * **Only explicit overrides are stored.** A circuit nobody has touched is absent
 * and falls back to whatever the map authored, so this never has to be seeded
 * from the map and can never disagree with it about an untouched breaker.
 */
export interface PowerGridState {
  /**
   * {@link circuitKey} -> whether the circuit is closed (powered).
   *
   * Strictly **the position of the control named by the key**: a breaker's lever at
   * its wing, a wall switch's rocker at its zone. Not "is this zone lit" — a zone
   * whose plate is on can still be dark because the wing above it is out, and
   * telling those two apart is the whole of {@link hacked} and of the emergency
   * lighting that hangs off it. See `src/scenes/game/PowerControl.ts`.
   */
  circuits: Record<string, boolean>;
  /**
   * {@link circuitKey} -> zones a terminal hack cut, upstream of any plate.
   *
   * Separate from {@link circuits} because a hack has no fixture and therefore no
   * lever to record a position for. Recording it as one would make a hacked room
   * indistinguishable from a room somebody switched off by hand — and those two
   * differ in what the player sees (a dead plate versus a lit `OFF` one) and in
   * whether the emergency light comes up.
   */
  hacked: Record<string, true>;
}

export function initialPowerGrid(): PowerGridState {
  return { circuits: {}, hacked: {} };
}

/**
 * Circuits are keyed by level *and* target.
 *
 * A target is a tile-def ref, and refs are reused across levels — `light_overhead2`
 * lights most of main2. Keying on the ref alone would wire a breaker on one deck
 * to the lights on another.
 *
 * `\u0000` as the separator because it cannot occur in either half: a level name
 * and a tile-def ref both come from the editor as ordinary identifiers, and
 * anything printable (`:` say) is one authoring convention away from colliding.
 */
export function circuitKey(level: string, target: string): string {
  return `${level}\u0000${target}`;
}

/** Whether a circuit is live, falling back to the state the map authored. */
export function isCircuitClosed(
  state: PowerGridState,
  level: string,
  target: string,
  authored: boolean,
): boolean {
  return state.circuits[circuitKey(level, target)] ?? authored;
}

/**
 * Every circuit this level has an explicit override for, as `target -> closed`.
 *
 * The state is keyed by level *and* target so refs can repeat across decks, which
 * makes "what has been thrown down here?" a question only this module can answer —
 * it owns the key's shape. `GameScene` asks it on every level build, because a
 * circuit can be thrown by three different things now (a breaker, a wall switch, a
 * terminal hack) and only the state knows about all three. Re-applying from the
 * *fixtures* would silently lose whichever throw had no fixture behind it.
 */
export function circuitsForLevel(
  state: PowerGridState,
  level: string,
): { target: string; closed: boolean }[] {
  const prefix = `${level}\u0000`;
  const out: { target: string; closed: boolean }[] = [];
  for (const [key, closed] of Object.entries(state.circuits ?? {})) {
    if (key.startsWith(prefix)) out.push({ target: key.slice(prefix.length), closed });
  }
  return out;
}

/** Whether a terminal hack has cut this circuit upstream of its plate. */
export function isHacked(state: PowerGridState, level: string, target: string): boolean {
  // `?? {}` because the state is read straight out of the Phaser registry, which can
  // hold an object built before this field existed — see `GameScene.create`.
  return (state.hacked ?? {})[circuitKey(level, target)] === true;
}

/** Records a hack. There is no un-hacking: nothing in the game restores one. */
export function markHacked(state: PowerGridState, level: string, target: string): void {
  (state.hacked ??= {})[circuitKey(level, target)] = true;
}

/** Records a throw. */
export function setCircuitClosed(
  state: PowerGridState,
  level: string,
  target: string,
  closed: boolean,
): void {
  state.circuits[circuitKey(level, target)] = closed;
}

// --- the keypad ------------------------------------------------------------

/** Digits punched in per throw. Four, to match the four-LED cluster the art draws. */
export const KEYPAD_DIGITS = 4;

/**
 * The code shown going into the keypad on one throw.
 *
 * Nothing gates on it — the breaker always works, and there is no code to find.
 * It exists because the art draws a real keypad: the `CONTROLS` layer is four
 * binary LEDs with a labelled frame for every digit 0-9, and playing a fixed
 * sequence would waste that. A fresh code per throw makes cutting the power and
 * restoring it look like two different operations, which they are.
 *
 * Deterministic from `seed` rather than `Math.random` so a test can assert an
 * exact sequence, and so a replayed throw looks the same twice. The generator is
 * a 32-bit xorshift — small, well-mixed in the low bits (which is where `% 10`
 * reads), and self-contained, since the project has no PRNG of its own and one
 * that only feeds an animation does not justify a dependency.
 */
export function keypadCode(seed: number, digits: number = KEYPAD_DIGITS): number[] {
  // Any non-zero start will do; xorshift is fixed at zero.
  let x = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  const out: number[] = [];
  for (let i = 0; i < digits; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out.push(Math.abs(x) % 10);
  }
  return out;
}

/**
 * A stable seed for one breaker's nth throw.
 *
 * Mixed from the tile coordinates so two breakers on a level punch different
 * codes, and from the throw count so one breaker's cut and restore differ.
 */
export function keypadSeed(tileX: number, tileY: number, throwCount: number): number {
  return (tileX * 73856093) ^ (tileY * 19349663) ^ (throwCount * 83492791);
}
