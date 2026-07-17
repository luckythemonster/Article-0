import { PlayerController } from './PlayerController';
import { WorldMapContext } from './WorldMapContext';
import { TileType } from './CollisionRegistry';

describe('PlayerController', () => {
    let mockWorldMap: WorldMapContext;

    beforeEach(() => {
        mockWorldMap = {
            getTile: jest.fn((x: number, y: number, z: number) => {
                // Large open area 10x10
                if (x >= 0 && x <= 9 && y >= 0 && y <= 9) {
                    return TileType.AIR;
                }
                return TileType.CONCRETE_WALL;
            })
        };
    });

    describe('Angle Snapping', () => {
        it('should move exactly right when touch input is slightly angled up-right', () => {
            const player = new PlayerController(5.0, 5.0, 0, 1.0, 0.4);
            // Input vector (1, 0.2) is roughly 11 degrees. It should snap to 0 degrees.
            player.update(mockWorldMap, 1.0, 1.0, 0.2);

            expect(player.x).toBeCloseTo(6.0, 4); // x + 1.0 * cos(0)
            expect(player.y).toBeCloseTo(5.0, 4); // y + 1.0 * sin(0)
        });

        it('should move diagonally (45 deg) when touch input is ~30 degrees', () => {
            const player = new PlayerController(5.0, 5.0, 0, 1.0, 0.4);
            // Input vector (0.866, 0.5) is exactly 30 degrees.
            // 30 is closer to 45 (Math.PI/4) than 0, so it snaps to 45 degrees.
            // 30 / 45 = 0.66 -> round to 1 -> snaps to 45
            player.update(mockWorldMap, 1.0, 0.866, 0.5);

            const expectedMovement = Math.cos(Math.PI / 4); // 0.707...
            expect(player.x).toBeCloseTo(5.0 + expectedMovement, 4);
            expect(player.y).toBeCloseTo(5.0 + expectedMovement, 4);
        });
    });

    describe('Collision Sliding', () => {
        it('should slide along a vertical wall', () => {
            // Player is near the left wall (x=0 is safe, x=-1 is wall)
            const player = new PlayerController(0.5, 5.0, 0, 1.0, 0.4);

            // Try to move left and up (angle 135 deg / -135 deg)
            // Input vector (-1, -1) snaps to 225 deg (or -135)
            // It should block X movement but allow Y movement
            player.update(mockWorldMap, 1.0, -1.0, -1.0);

            // X shouldn't change because left is blocked
            expect(player.x).toBeCloseTo(0.5, 4);

            // Y should change
            const expectedYMovement = Math.sin(Math.PI * -0.75); // -0.707...
            expect(player.y).toBeCloseTo(5.0 + expectedYMovement, 4);
        });
    });
});
