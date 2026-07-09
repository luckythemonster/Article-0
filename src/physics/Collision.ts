import { WorldMap, TileType, DEPTH } from '../world/MapData';

export interface CollidableEntity {
    x: number;      // continuous tile units (float)
    y: number;      // continuous tile units (float)
    z: number;      // active floor level (integer, 0 to 11)
    radius: number; // collision radius in tile units (usually 0.4)
}

function isSolid(tile: number): boolean {
    return tile > 0 && tile !== TileType.LADDER;
}

export function resolveMovement(
    entity: CollidableEntity,
    dx: number,
    dy: number,
    worldMap: WorldMap,
    interactDirection: number
): void {
    // Handle Z-level transition (ladder)
    if (interactDirection !== 0) {
        const currentTile = worldMap.getTile(Math.floor(entity.x), Math.floor(entity.y), entity.z);
        if (currentTile === TileType.LADDER) {
            let newZ = entity.z + interactDirection;
            // Clamp Z-level
            if (newZ < 0) newZ = 0;
            if (newZ >= DEPTH) newZ = DEPTH - 1;

            if (newZ !== entity.z) {
                entity.z = newZ;
                // Snap to center of the tile
                entity.x = Math.floor(entity.x) + 0.5;
                entity.y = Math.floor(entity.y) + 0.5;
                // Movement is consumed by the Z transition, prevent further sliding
                return;
            }
        }
    }

    const epsilon = 1e-4;

    // Resolve X axis
    if (dx !== 0) {
        const newX = entity.x + dx;
        const minX = Math.floor(newX - entity.radius + epsilon);
        const maxX = Math.floor(newX + entity.radius - epsilon);

        // Use current Y for collision check
        const minY = Math.floor(entity.y - entity.radius + epsilon);
        const maxY = Math.floor(entity.y + entity.radius - epsilon);

        let collisionFoundX = false;

        // We check all corners of the AABB around the newX
        for (let checkX = minX; checkX <= maxX; checkX++) {
            for (let checkY = minY; checkY <= maxY; checkY++) {
                if (isSolid(worldMap.getTile(checkX, checkY, entity.z))) {
                    collisionFoundX = true;
                    // resolve collision on X
                    if (dx > 0) {
                        entity.x = checkX - entity.radius;
                    } else {
                        entity.x = checkX + 1 + entity.radius;
                    }
                    // Break out of double loop since we found collision and resolved
                    break;
                }
            }
            if (collisionFoundX) break;
        }

        if (!collisionFoundX) {
            entity.x = newX;
        }
    }

    // Resolve Y axis
    if (dy !== 0) {
        const newY = entity.y + dy;
        const minX = Math.floor(entity.x - entity.radius + epsilon);
        const maxX = Math.floor(entity.x + entity.radius - epsilon);
        const minY = Math.floor(newY - entity.radius + epsilon);
        const maxY = Math.floor(newY + entity.radius - epsilon);

        let collisionFoundY = false;

        for (let checkX = minX; checkX <= maxX; checkX++) {
            for (let checkY = minY; checkY <= maxY; checkY++) {
                if (isSolid(worldMap.getTile(checkX, checkY, entity.z))) {
                    collisionFoundY = true;
                    // resolve collision on Y
                    if (dy > 0) {
                        entity.y = checkY - entity.radius;
                    } else {
                        entity.y = checkY + 1 + entity.radius;
                    }
                    break;
                }
            }
            if (collisionFoundY) break;
        }

        if (!collisionFoundY) {
            entity.y = newY;
        }
    }
}
