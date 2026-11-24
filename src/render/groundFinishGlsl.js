import { mixedBankFinish } from './mixedBankMaterial.js';

// Apply before seasonal cover. Exposed faces take their climate's soil or
// stone. In the open patches, some earth shows through ordinary meadow turf.
export const groundFinishGlsl = `
  float turf = ge ? (geA == 2u ? 1.0-geS : geB == 2u ? geS : 0.0) : (layer == 2 ? 1.0 : 0.0);
  ${mixedBankFinish}
  // Helbenar's dry turf uses the same world-scale sod and stubble as the pond lip.
  // Keep the broad colour of the tile through the fine detail, including at mixed edges.
  if (uVillageTurf && turf > 0.001 && vBankFinish < 1.0) {
    vec2 st = vLocalXZ * 0.49;
    float last = float(textureSize(uTileArr, 0).z - 1);
    vec4 fibres = textureGrad(uTileArr, vec3(fract(st), last), dux * (uTileSize * 0.49), duy * (uTileSize * 0.49));
    vec3 sod = geBase(2u, fract(unwrapped * 4.4), dux * 4.4, duy * 4.4);
    float nap = fibres.g - 0.45;
    float cover = reNoise(unwrapped, 166, 217u);
    vec3 closeTurf = sod * vec3(0.90, 0.94, 0.84) * (0.93 + 0.14 * cover + 0.90 * nap);
    float worn = smoothstep(0.32, 0.15 + 0.38, 1.0 - cover) * max(0.0, 0.49 - fibres.r);
    closeTurf *= 1.0 - 0.75 * worn;
    uvec3 rootData = texelFetch(uTilemap, cell, 0).gba;
    if (rootData.z >= 1u && rootData.z <= 4u) {
      vec2 delta = (tileUV - 0.5) * uTileSize - (vec2(rootData.xy) - 128.0) / 16.0;
      float under = 1.0 - smoothstep(0.6, 2.05 + cover * 0.85, length(delta));
      if (rootData.z >= 3u) {
        vec2 rootXZ = vLocalXZ - delta;
        float turn = dot(floor(rootXZ), vec2(.73,1.17));
        float lobes = cos(3.0*atan(delta.y,delta.x+.0001)+turn);
        float litter = length(delta)*(.98+.19*lobes) + (fibres.r-.4)*.7;
        under = 1.0-smoothstep(.24, 1.25+cover*.9, litter);
      }
      vec3 mulch = geBase(1u, fract(unwrapped * 3.3), dux * 3.3, duy * 3.3);
      mulch *= (rootData.z == 2u || rootData.z == 4u) ? vec3(0.76,0.69,0.55) : vec3(0.95,0.79,0.56);
      closeTurf = mix(closeTurf, mulch * (0.89 + fibres.g * 0.28), under);
    }
    tex = mix(tex, closeTurf, 0.79 * turf * (1.0 - vBankFinish) * ew.x);
  }
  if (vEarthFinish.z > 0.001 && turf < 1.0) {
    vec3 sod = ecotone(geBase(2u, tileUV, dux, duy), ew, vec3(tileUV, 2.0), dux, duy);
    tex = mix(tex, sod, vEarthFinish.z * (1.0-turf));
  }
  float openSoil = vEarthFinish.y * turf;
  float soilShare = max(abs(vEarthFinish.x), openSoil * 0.34);
  if (soilShare > 0.001) {
    highp uint exposed = vEarthFinish.x < 0.0 ? 3u : 1u;
    vec3 earth = ecotone(geBase(exposed, tileUV, dux, duy), ew, vec3(tileUV, float(exposed)), dux, duy);
    tex = mix(tex, earth, soilShare);
  }`;
