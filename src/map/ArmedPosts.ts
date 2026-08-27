import { ARMED_POSTS_PER_LEVEL, enforcerStatsFor } from "../systems/EntityStats";
import type { ComponentData } from "./types";

/** The shape `issueFirearms` needs off a guard spec — see `EntityIndex.guards`. */
export interface ArmableGuard {
  kind: string;
  components: ComponentData[];
}

/**
 * Decides which guards on a level, if any, are carrying a firearm.
 *
 * **This is where gun scarcity is actually enforced.** `EnforcerStats.armed` decides
 * whether a body *may* fire and `src/systems/Firearms.ts` decides whether the facility
 * has released weapons at all, but neither can bound the *headcount* — a map that set
 * `Armed` on four boards would satisfy both and put four rifles on one floor. Scarcity
 * is a property of the roster, not of any one body, so it is settled once over the
 * whole roster here.
 *
 * **Only enforcers are ever considered.** A drone is too small to mount a weapon and
 * the human security staff are not issued them, so both stay melee-only however a board
 * is authored — `LevelBuilder` hands them their own stats and never consults this.
 *
 * An authored `Armed` board wins the allowance over the default pick, so an author who
 * says which post carries the gun gets that post rather than the first one indexed.
 * With the allowance at 1 that makes the rule simple to state: *the level's one firearm
 * is the one the map asked for, or the first enforcer if it didn't ask.*
 *
 * Headless and pure — it reads component data and returns indices — which is what lets
 * the cap be tested without standing up a level.
 *
 * @returns indices into `guards` that are armed. Never larger than
 *          {@link ARMED_POSTS_PER_LEVEL}.
 */
export function issueFirearms(guards: ArmableGuard[]): Set<number> {
  const enforcers = guards
    .map((g, i) => ({ i, kind: g.kind, components: g.components }))
    .filter((g) => g.kind === "enforcer");
  const authored = enforcers.filter((g) => enforcerStatsFor(g.components).armed).map((g) => g.i);
  const picks = authored.length > 0 ? authored : enforcers.slice(0, 1).map((g) => g.i);
  return new Set(picks.slice(0, ARMED_POSTS_PER_LEVEL));
}
