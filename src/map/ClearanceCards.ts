import {
  chestStatsFor,
  isKeycard,
  keycardName,
  parseItemList,
  str,
} from "../systems/EntityStats";
import { POSTED_CLEARANCE } from "./AutoClearance";
import type { GameLevel, GameMap, GameTile } from "./types";

/**
 * The credential that answers the facility's restricted ground, added at boot.
 *
 * ### Why this exists
 *
 * The shipped map locks six doors, every one of them on clearance 2, and hands out
 * exactly one keycard: `main1`'s authored `"Key1"`. So the only credential in the game
 * opens nothing in the game, and once `src/map/AutoClearance.ts` derives restricted
 * ground on eight of the nine decks, *nothing Rowan can find would clear any of it*.
 * A restriction with no answer is not a mechanic, it is a wall — and the whole point of
 * a clearance is that it is "a much easier thing to become than a lock is to break".
 *
 * So one obtainable {@link CLEARANCE_CARD} is grafted in, the same way every other
 * fixture the map does not author is: at boot, by editing what the author already
 * placed, because the export is committed verbatim and is never hand-edited.
 *
 * ### Where it goes, and why there
 *
 * {@link CARD_HOST}'s chest. `secret1` is Act I, so the card is reachable long before
 * the clearance-2 doors on `main2` that most need it — a credential found after the
 * locks it opens is a credential found too late. And it is behind the optional secret
 * room, so it is *earned* rather than handed over, which is the same bargain the Q0
 * compliance cert strikes for silencing VENT-4.
 *
 * ### Why it appends to `items` rather than writing the slots
 *
 * `chestLoot` reads two schemas and the `item1/2/3` slots win over the `items` list —
 * which is right for a generated chest, and wrong here. Writing slots would cap this
 * chest at three items, and `main1`'s already carries four, so the slot schema does not
 * scale to "whatever the author wrote, plus one". Appending to the list keeps the
 * author's loot intact and in their own schema.
 *
 * **The existing loot is read, not assumed.** Hardcoding `secret1`'s two items and
 * writing back three would silently drop whatever a re-export changed them to. This
 * reads what is there and adds to it, so the graft survives the map moving underneath
 * it — the failure this file's neighbours (`Lockers`, `DestructibleCover`) all had to
 * learn about the hard way.
 *
 * Best-effort like its siblings: a map with no chest on that level, or one already
 * handing out a keycard of its own, simply gets nothing rather than crashing or
 * second-guessing an author who has already made the decision.
 */

/** The clearance the grafted card carries — whatever the derivation posts ground at. */
export const CLEARANCE_CARD = keycardName(POSTED_CLEARANCE);

/**
 * The level whose chest carries it.
 *
 * Named rather than derived: `MapPlan` can tell you where a run starts and ends, but
 * "the optional room off Act I" is a judgement about pacing that no shape of the map
 * announces. If this level is absent the graft simply does not happen.
 */
export const CARD_HOST = "secret1";

/**
 * Adds the clearance card to the host level's chest.
 *
 * @returns whether the card was actually placed — the caller may want to know, and a
 *   silent no-op is exactly the failure `furnishVentCoreChest` and `Lockers` are shaped
 *   to make visible rather than mysterious.
 */
export function appendClearanceCards(map: GameMap, host: string = CARD_HOST): boolean {
  const level = map.levels.find((l) => l.name === host);
  if (!level) return false;

  const chest = findChest(level);
  if (!chest) return false;

  const held = chestStatsFor(chest.components).items;
  // An author who placed a keycard here has already answered this question. Don't add a
  // second one beside it — two credentials in one box reads as a bug, and if theirs is
  // the wrong number that is a map decision to fix in the editor, not here.
  if (held.some(isKeycard)) return false;

  const component = chest.components.find((c) => c.type === "chest");
  if (!component) return false;

  // Read the raw string rather than rebuilding it from `held`: `chestStatsFor` has
  // already normalised the author's spellings (`"StunRounds"` -> `"Stun Rounds"`), and
  // writing those back would quietly rewrite the map's own text on a field the author
  // owns. Appending to what they typed leaves it as they typed it.
  const authored = parseItemList(str(chest.components, "chest", "items", ""));
  component.values.items = [...authored, CLEARANCE_CARD]
    .map((name) => `"${name}"`)
    .join(", ");
  return true;
}

/** The level's searchable chest, if it has one. */
function findChest(level: GameLevel): GameTile | undefined {
  for (const layer of level.layers) {
    for (const tile of layer.tiles) {
      if (tile.components.some((c) => c.type === "chest")) return tile;
    }
  }
  return undefined;
}
