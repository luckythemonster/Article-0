import { parseEdPlayJson } from './TileRegistryParser';
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
  }
}
