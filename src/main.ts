import { parseEdPlayJson } from './TileRegistryParser';
import { TileType } from './CollisionRegistry';

import { calculateBitmask } from './Autotiler';
import { PlayerController } from './PlayerController';

import { parseEdMapJson } from './MapParser';

// If 'edplay.json' is fetched during runtime it will need a fetch/import.
// For now, let's just initialize the canvas to prove it's rendering.

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
if (canvas) {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#fff';
    ctx.font = '48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Article Zero Initialization Complete', canvas.width / 2, canvas.height / 2);
    ctx.font = '24px monospace';

    ctx.fillText('Canvas 1280x720 Ready', canvas.width / 2, canvas.height / 2 + 50);

    // Mount the map
    fetch('test_map.json')
      .then(response => response.text())
      .then(jsonText => {
        const mappingConfig: Record<string, number> = {
            'concrete_wall': TileType.CONCRETE_WALL,
            'glass': TileType.GLASS,
            'b_White_tile_spritesheet1': TileType.WHITE_TILE,

            'b_concrete_wall_spritesheet1': TileType.CONCRETE_WALL,
            'b_painted_concrete_wall_spritesheet1': TileType.CONCRETE_WALL,
            'b_steel_wall_spritesheet1': TileType.CONCRETE_WALL,
            'b_drywall_terrain48': TileType.CONCRETE_WALL,
            'b_WINDOWS_TERRAIN48': TileType.WINDOWS_TERRAIN48,

            'b_metal_floor_spritesheet1': 5,
            'floor_metal': 5,
            'b_metal_floor_spritesheet__2_1': 5,
            'b_rusted_metal_floor_spritesheet1': 5,
            'b_dirt1': 8,
            'vent_interior': 3,
            'b_caution_tape1': 9,
        };

        const worldMap = parseEdMapJson(jsonText, mappingConfig);
        const tileRegistry = parseEdPlayJson(jsonText, mappingConfig);

        const autotileGroups: Record<number, string> = {
            [TileType.CONCRETE_WALL]: "walls",
            [TileType.WINDOWS_TERRAIN48]: "walls",
            [5]: "floors",
            [TileType.WHITE_TILE]: "floors",
            [8]: "floors", // dirt
            [3]: "floors", // vent
        };


        const inputState = { x: 0, y: 0 };
        const keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            ArrowUp: false,
            ArrowLeft: false,
            ArrowDown: false,
            ArrowRight: false
        };

        const updateInputState = () => {
            let x = 0;
            let y = 0;
            if (keys.w || keys.ArrowUp) y -= 1;
            if (keys.s || keys.ArrowDown) y += 1;
            if (keys.a || keys.ArrowLeft) x -= 1;
            if (keys.d || keys.ArrowRight) x += 1;

            // Normalize
            if (x !== 0 && y !== 0) {
                const length = Math.sqrt(x*x + y*y);
                x /= length;
                y /= length;
            }
            inputState.x = x;
            inputState.y = y;
        };

        window.addEventListener('keydown', (e) => {
            if (keys.hasOwnProperty(e.key)) {
                keys[e.key as keyof typeof keys] = true;
                updateInputState();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (keys.hasOwnProperty(e.key)) {
                keys[e.key as keyof typeof keys] = false;
                updateInputState();
            }
        });

        window.addEventListener('blur', () => {
            for (const key in keys) {
                keys[key as keyof typeof keys] = false;
            }
            updateInputState();
        });

        // Pre-compute bitmasks into a grid
        const { width, height, depth } = worldMap;
        const bitmaskGrid = new Uint16Array(width * height * depth);

        // Autotiler uses calculateBitmask from './Autotiler'
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = x + (y * width) + (z * width * height);
                    const tileType = worldMap.getTile(x, y, z);
                    if (tileType !== null && tileType !== TileType.AIR) {
                        bitmaskGrid[idx] = calculateBitmask(worldMap, x, y, z, autotileGroups);
                    }
                }
            }
        }


        const tileSize = 32;

        const player = new PlayerController(5, 5, 0, 5.0, 0.4);

        const loadImages = () => {
            return Promise.all([
                new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = 'spritesheet_0.png';
                }),
                new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = 'spritesheet_1.png';
                })
            ]);
        };

        loadImages().then(spritesheets => {
            console.log("Images loaded", spritesheets.length);

            let lastTime = performance.now();
            const gameLoop = (currentTime: number) => {
                const deltaTime = (currentTime - lastTime) / 1000;
                lastTime = currentTime;

                player.update(worldMap, deltaTime, inputState.x, inputState.y);

                ctx.fillStyle = '#111';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.save();
                // Center camera on player
                const cameraX = Math.floor(player.x * tileSize - canvas.width / 2);
                const cameraY = Math.floor(player.y * tileSize - canvas.height / 2);
                ctx.translate(-cameraX, -cameraY);

                // For rendering, start at the player's active Z level minus 1
                const startZ = Math.max(0, player.z - 1);
                // Currently only 1 Z layer is needed for standard maps unless we expand the engine to support height logic.
                // We'll just render the entire depth.

                for (let z = 0; z < depth; z++) {
                    // Dim lower layers
                    if (z < player.z) {
                        ctx.globalAlpha = 0.4;
                    } else if (z > player.z) {
                        ctx.globalAlpha = 0.8;
                    } else {
                        ctx.globalAlpha = 1.0;
                    }

                    for (let y = 0; y < height; y++) {
                        for (let x = 0; x < width; x++) {
                            const type = worldMap.getTile(x, y, z);
                            if (type !== null && type !== TileType.AIR) {
                                const idx = x + (y * width) + (z * width * height);
                                const bitmask = bitmaskGrid[idx];

                                let tileData = tileRegistry[type]?.[bitmask];
                                if (!tileData && tileRegistry[type]) {
                                    // Fallback to first available bitmask mapping
                                    tileData = Object.values(tileRegistry[type])[0];
                                }

                                if (tileData) {
                                    const sheet = spritesheets[tileData.sheetIndex];
                                    if (sheet) {
                                        const col = tileData.atlasIndex % 16;
                                        const row = Math.floor(tileData.atlasIndex / 16);
                                        const srcX = col * 33;
                                        const srcY = row * 33;
                                        // Fake isometric pseudo-3D offset
                                        const zOffset = (z - player.z) * -12;
                                        ctx.drawImage(sheet, srcX, srcY, 32, 32, x * tileSize, y * tileSize + zOffset, tileSize, tileSize);
                                    }
                                } else {
                                    // Debug fallback
                                    ctx.fillStyle = 'magenta';
                                    ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
                                }
                            }
                        }
                    }
                }

                ctx.globalAlpha = 1.0;

                // Render Player
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.arc(player.x * tileSize, player.y * tileSize, player.radius * tileSize, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();

                requestAnimationFrame(gameLoop);
            };
            requestAnimationFrame(gameLoop);
        });

      })
      .catch(err => {
        console.error('Failed to mount map:', err);
      });

  }
}
