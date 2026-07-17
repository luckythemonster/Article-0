import { parseEdPlayJson } from './TileRegistryParser';
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
    fetch('edplay.json')
      .then(response => response.text())
      .then(jsonText => {
        const mappingConfig = {
            'concrete_wall': 2,
            'glass': 6,
            'b_metal_floor_spritesheet1': 5,
            'b_White_tile_spritesheet1': 7,
            'tile_white': 7,
            'floor_metal': 5,
            'sidewalk': 1,
            'glass1': 6,
            'dirt': 8,
            'vent': 3
        };
        const worldMap = parseEdMapJson(jsonText, mappingConfig);
        console.log(`Map mounted successfully: ${worldMap.width}x${worldMap.height}x${worldMap.depth}`);
        ctx.fillText(`Map mounted: ${worldMap.width}x${worldMap.height}x${worldMap.depth}`, canvas.width / 2, canvas.height / 2 + 100);
      })
      .catch(err => {
        console.error('Failed to mount map:', err);
      });

  }
}
