import type { CollisionGrid } from "../systems/CollisionGrid";
import { withinOrEqual } from "../systems/distance";
import type { PathNode } from "../systems/Pathfinder";

/**
 * How staff work the doors they walk through: open the one ahead, shut it behind.
 *
 * Shared by {@link Enforcer} and {@link Orderly} because the two must not
 * disagree about it. **Closing behind is not tidiness** — an open door is an
 * anomaly the guards investigate, so anyone who left their own doors standing
 * open would have the patrols spend the level investigating them, and an open
 * door would stop meaning "the player came through here". Silently, for the
 * same reason: the door-operation noise ping exists to give away the *player*
 * working a door, not staff using one normally.
 *
 * Two copies of that reasoning is one copy too many, which is why this is a
 * module and not a method — the same argument `src/entities/directions.ts`
 * makes for the eight facings.
 *
 * Pure apart from the two callbacks and the `heldDoor` it writes back, so it
 * takes a grid rather than a scene and can be tested without either.
 */

/** How far ahead of its own body a walker reaches to work a door, in tiles. */
export const DOOR_REACH_TILES = 0.9;
/** Distance past a door at which the walker shuts it behind itself, in tiles. */
export const DOOR_CLOSE_TILES = 1.8;

/** The walker's own state. `heldDoor` is read and written by {@link workDoors}. */
export interface DoorWalker {
  /** Pixel position. */
  x: number;
  y: number;
  /** Body radius in tiles, so the probe clears the walker's own edge. */
  radiusTiles: number;
  /** The door this walker opened and has not yet shut, or null. */
  heldDoor: PathNode | null;
}

/**
 * The scene's door hooks, as the entity contexts carry them.
 *
 * Optional throughout: a context that supplies neither leaves every door as
 * permanent geometry, which is what both classes did before they were wired up
 * and remains the correct behaviour for a caller that has no doors.
 */
export interface DoorAccess {
  /** True when this tile holds a door staff may work — unlocked, and not a wall. */
  isOperableDoor?: (tileX: number, tileY: number) => boolean;
  /** Opens or closes a door being worked. */
  setDoorOpen?: (tileX: number, tileY: number, open: boolean) => void;
}

/**
 * Opens the door immediately ahead, and shuts the last one behind once clear.
 *
 * `heading` is the direction the walker is travelling, in radians — the probe
 * goes out along it rather than along the facing, so a guard scanning sideways
 * still opens the door it is walking into.
 */
export function workDoors(
  walker: DoorWalker,
  access: DoorAccess,
  grid: CollisionGrid,
  tileSize: number,
  heading: number,
): void {
  const { isOperableDoor, setDoorOpen } = access;
  if (!isOperableDoor || !setDoorOpen) return;

  if (walker.heldDoor) {
    const dx = walker.heldDoor.x + 0.5 - walker.x / tileSize;
    const dy = walker.heldDoor.y + 0.5 - walker.y / tileSize;
    if (!withinOrEqual(dx, dy, DOOR_CLOSE_TILES)) {
      setDoorOpen(walker.heldDoor.x, walker.heldDoor.y, false);
      walker.heldDoor = null;
    }
    return;
  }

  // Probe just past the body's own edge, along the way it's walking.
  const reach = walker.radiusTiles + DOOR_REACH_TILES;
  const tx = Math.floor(walker.x / tileSize + Math.cos(heading) * reach);
  const ty = Math.floor(walker.y / tileSize + Math.sin(heading) * reach);
  if (!grid.isBlocked(tx, ty) || !isOperableDoor(tx, ty)) return;
  setDoorOpen(tx, ty, true);
  walker.heldDoor = { x: tx, y: ty };
}
