import { parseEdPlayJson } from './TileRegistryParser';
import * as fs from 'fs';

const edplay = fs.readFileSync('edplay.json', 'utf-8');

const mappingConfig = {
    'concrete_wall': 2,
    'glass': 6,
    'b_metal_floor_spritesheet1': 5,
    'b_White_tile_spritesheet1': 7,
};

const registry = parseEdPlayJson(edplay, mappingConfig);
console.log(JSON.stringify(registry, null, 2));
