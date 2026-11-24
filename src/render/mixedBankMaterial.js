import { CORNER_DRAWN } from '../world/water/waterCorners.js';

// Corner order is the texture array's (00,10,01,11), measured in the classic
// terrain art. The ordinary ROT/TRANS transform maps each block turn into it.
const shoreMaterials = Object.freeze({
  37: [1, 0, 1, 2], 38: [1, 0, 1, 3],
  40: [2, 0, 2, 1], 41: [2, 0, 2, 3],
  43: [3, 0, 3, 1], 44: [3, 0, 3, 2],
});

export const mixedBankTest = CORNER_DRAWN.map(r => 'layer == ' + r).join(' || ');

function cornerKind(corner) {
  const records = kind => CORNER_DRAWN.filter(r => shoreMaterials[r][corner] === kind)
    .map(r => 'layer == ' + r).join(' || ');
  return '(' + records(1) + ') ? 1u : (' + records(2) + ') ? 2u : 3u';
}

// Use the neighbour tiles' own rotated corner semantics, base materials,
// world-space grain and edge noise. Painted water never enters the dry mix.
export const mixedBankFinish = `
  if (uVillageTurf && (${mixedBankTest})) {
    highp uint mainKind = ${cornerKind(0)};
    highp uint tipKind = ${cornerKind(3)};
    float wetCorner = tuv.x * (1.0 - tuv.y);
    float tipShare = tuv.x * tuv.y / max(0.001, 1.0 - wetCorner);
    // Binary dry edges add wander to dirt for grass/dirt, to stone for grass/stone.
    float bias = tipKind == 2u ? -geWander(unwrapped) : geWander(unwrapped);
    float tip = smoothstep(0.42, 0.58, tipShare + bias);
    // A town block can abut this painted corner with a different dry material.
    // Read the adjoining edge in its own frame to meet it across the block seam.
    vec2 edgeDist = min(tileUV, vec2(1.0) - tileUV);
    float edgeWidth = 0.32 + 0.35 * geWander(unwrapped);
    for (int axis = 0; axis < 2; axis++) {
      if (edgeDist[axis] >= edgeWidth) continue;
      int side = tileUV[axis] < 0.5 ? -1 : 1;
      ivec2 neighbour = cell;
      neighbour[axis] += side;
      vec2 rim = tileUV;
      rim[axis] = side < 0 ? 1.0 : 0.0;
      uint d = texelFetch(uTilemap, clamp(neighbour, ivec2(0), ivec2(127)), 0).r;
      uint a, b;
      float share, target = tip;
      if (groundMix(d, rim, unwrapped, a, b, share)) {
        if (a == 0u) target = b == tipKind ? 1.0 : 0.0;
        else target = mix(a == tipKind ? 1.0 : 0.0, b == tipKind ? 1.0 : 0.0, share);
      } else if ((d >> 2u) == tipKind || (d >> 2u) == mainKind) {
        target = (d >> 2u) == tipKind ? 1.0 : 0.0;
      }
      tip = mix(target, tip, smoothstep(0.0, edgeWidth, edgeDist[axis]));
    }
    vec3 base = geBase(mainKind, tileUV, dux, duy);
    vec3 other = geBase(tipKind, tileUV, dux, duy);
    tex = mix(base, other, tip);
    turf = mainKind == 2u ? 1.0 - tip : tipKind == 2u ? tip : 0.0;
  }`;
