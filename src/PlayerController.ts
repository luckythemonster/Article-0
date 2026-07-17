import { WorldMapContext } from './WorldMapContext';
import { isPositionClear } from './CollisionRegistry';

export class PlayerController {
    // Spatial properties
    public x: number = 0;
    public y: number = 0;
    public z: number = 0;

    public speed: number = 2.0; // Units per second
    public radius: number = 0.4; // Half-width/height for collision bounding box

    constructor(startX: number, startY: number, startZ: number, speed: number = 2.0, radius: number = 0.4) {
        this.x = startX;
        this.y = startY;
        this.z = startZ;
        this.speed = speed;
        this.radius = radius;
    }

    /**
     * Updates the player's position based on touch input and collision checks.
     * Enforces a zero-allocation policy in the update loop.
     *
     * @param worldMap The world map to query for collisions.
     * @param deltaTime The time elapsed since the last frame in seconds.
     * @param inputX The X component of the analog touch vector (-1 to 1).
     * @param inputY The Y component of the analog touch vector (-1 to 1).
     */
    public update(worldMap: WorldMapContext, deltaTime: number, inputX: number, inputY: number): void {
        // If there's no input, don't move
        if (inputX === 0 && inputY === 0) {
            return;
        }

        // 1. Calculate the intended un-snapped angle
        const rawAngle = Math.atan2(inputY, inputX);

        // 2. Snap to the nearest 45 degrees (PI / 4 radians)
        const snapInterval = Math.PI / 4;
        const snappedAngle = Math.round(rawAngle / snapInterval) * snapInterval;

        // 3. Resolve intended velocity and next coordinates
        const moveDistance = this.speed * deltaTime;
        const velocityX = Math.cos(snappedAngle) * moveDistance;
        const velocityY = Math.sin(snappedAngle) * moveDistance;

        const intendedX = this.x + velocityX;
        const intendedY = this.y + velocityY;

        // 4. Check collisions and apply movement if clear
        // We evaluate X and Y axes independently for simple sliding against walls

        // Try moving on X axis
        if (isPositionClear(worldMap, intendedX, this.y, this.z, this.radius, this.radius)) {
            this.x = intendedX;
        }

        // Try moving on Y axis
        if (isPositionClear(worldMap, this.x, intendedY, this.z, this.radius, this.radius)) {
            this.y = intendedY;
        }
    }
}
