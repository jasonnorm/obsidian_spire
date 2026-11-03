// Everything the modern look needs, loaded on demand so the rest of the game
// never waits on (or breaks over) the high-resolution assets.
export { OverlandHD } from './world-hd.js';
export { HdPipeline, loadArt, makeBillboard, faceBillboards, artCanvas, hdMaterial } from './gfx-hd.js';
export { makeProp, makeShard, makeVegetation } from './props-hd.js';
