const fs = require('fs');
let mainTs = fs.readFileSync('src/main.ts', 'utf8');

const importStatements = `import { parseEdPlayJson } from './TileRegistryParser';
import { parseEdMapJson } from './MapParser';
`;

if (!mainTs.includes("parseEdMapJson")) {
    mainTs = mainTs.replace(`import { parseEdPlayJson } from './TileRegistryParser';`, importStatements);

    const logic = `
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
        console.log(\`Map mounted successfully: \${worldMap.width}x\${worldMap.height}x\${worldMap.depth}\`);
        ctx.fillText(\`Map mounted: \${worldMap.width}x\${worldMap.height}x\${worldMap.depth}\`, canvas.width / 2, canvas.height / 2 + 100);
      })
      .catch(err => {
        console.error('Failed to mount map:', err);
      });
`;

    mainTs = mainTs.replace(`    ctx.fillText('Canvas 1280x720 Ready', canvas.width / 2, canvas.height / 2 + 50);`, logic);
    fs.writeFileSync('src/main.ts', mainTs);
}
