import assets from '../assets/grass/helbenar/groundcover.json' with { type: 'json' };
import stems from '../assets/grass/helbenar/meadowStems.json' with { type: 'json' };
import { botanicalGeometry, botanicalSurfaces } from './villageShrubs.js';

export const GROUNDCOVER_RANGE = 32;

const forms = [...assets.models, ...stems.models];
export const GROUNDCOVER_VARIANTS = forms.length * 2;
export const groundcoverSurfaces = () => botanicalSurfaces([...assets.tiles, ...stems.tiles],32);
// Spread the creeping stems and basal leaves over the ground while keeping their height.
const lowSpread = [1.40, 1.52, 1.38];
const footprintRadii = [.78,.60,.49,.40,.40,.40,.40];
export const groundcoverRadius = form => footprintRadii[form];

export function groundcoverGeometry(variant,lod) {
  const form = Math.floor(variant/2);
  const mesh = botanicalGeometry(forms[form][variant%2][lod],31);
  const spread = lowSpread[form];
  if (spread) {
    for (let i=0; i<mesh.length; i+=9) {
      mesh[i+3] *= spread;
      mesh[i+5] *= spread;
      const nx = mesh[i+6]/spread, ny = mesh[i+7], nz = mesh[i+8]/spread;
      const length = Math.hypot(nx,ny,nz) || 1;
      mesh[i+6] = nx/length;
      mesh[i+7] = ny/length;
      mesh[i+8] = nz/length;
    }
  }
  return mesh;
}

// Use the meadow study's patch shapes in pixel-local metres, stable across floating-origin shifts.
export function groundcoverForm(x,z,roll) {
  if (x < .78 || z < .78 || x >= 818.42 || z >= 818.42) return -1;
  const patch = .5 + .21*Math.sin(1.95*x+.8*Math.sin(1.7*z)) + .19*Math.cos(2.55*z+.75*x) + .10*Math.sin(3.1*x-1.4*z);
  const openness = .5 + .5*Math.sin(.69*x+.34*z+1.2*Math.sin(.59*z));
  const density = (.22+.70*patch)*(.25+.75*openness);
  if (roll >= density) {
    // The same fertile pockets carry the taller growth, with open lanes between them.
    if (openness >= .38 && patch >= .37) {
      const spare = roll - density;
      const tallPatch = Math.sin(.44*x + .31*z) + .55*Math.cos(.59*z - .21*x);
      if (spare < .022 && tallPatch > .44) return 6;   // ivory yarrow
      if (spare < .045 && tallPatch < -.24) return 5;  // golden foxtail
      if (spare < .15*openness) return 4;              // folded sedge leaves
    }
    // Bridge the gaps with broad basal leaves. The thinnest pockets still expose soil.
    if (patch + openness < .44 || roll < .94 - .22*patch) return -1;
    return roll > .96 ? 0 : 1;
  }
  const pick = roll/density;
  if (patch > .63 && pick < .07) return 3;
  if (patch > .40 && pick < .19) return 1;
  return pick < .55 ? 0 : 2;
}
