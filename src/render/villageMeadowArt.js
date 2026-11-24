import { buildMeadowAtlas, buildMeadowMips } from './grassMeadow.js';
import { VILLAGE_SLOTS } from './villageGrass.js';
import { shrubSurfaces } from './villageShrubs.js';
import { groundcoverSurfaces } from './villageGroundcover.js';
import { MEADOW_SPRITES } from './meadowArt.js';

// Rows run from the tip to the foot. Wider colour patches survive minification;
// gaps in the midrib leave the blade's two geometric faces visible in daylight.
const bladeRows = [
  '55566555', '45566554', '45565544', '44555544',
  '34456544', '33456543', '33455433', '33354433',
  '23345433', '23345332', '22344322', '22343322',
  '12234322', '12233321', '11223221', '01122210',
];
const blossomRows = [
  '23344332', '33455433', '34555543', '34544543',
  '34422443', '23311332', '12200121', '01100110',
];
const bladePalette = [[49,72,40],[57,82,45],[64,92,50],[75,102,55],
  [90,115,62],[105,129,71],[125,145,84]];
const blossomPalette = [[157,132,75],[178,150,90],[183,166,124],
  [197,182,148],[212,200,171],[221,212,188]];

function surface(name, rows, palette) {
  const size=16, rgba=new Uint8Array(size*size*4);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const row=rows[Math.floor(y*rows.length/size)];
    const rgb=palette[Number(row[Math.floor(x*row.length/size)])];
    rgba.set([...rgb,255],4*(y*size+x));
  }
  return {name,width:size,height:size,rgba};
}

export function villageMeadowMips() {
  const blade=surface('grass blade',bladeRows,bladePalette);
  const flower=surface('meadow flower',blossomRows,blossomPalette);
  return buildMeadowMips(buildMeadowAtlas({slots:VILLAGE_SLOTS,sprites:[...MEADOW_SPRITES,blade,flower,...shrubSurfaces(),...groundcoverSurfaces()]}));
}
