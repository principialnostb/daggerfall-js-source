import { MAX_GROUND_LAYERS } from './pondSoilTexture.js';

// Soil, stubble, mineral flecks and root fibres share a seamless two-metre
// tile. Only display colours go through the lighting lane's colour decoder.
export const bankFinishMix = (decode) => `vec2 dropGrad = vec2(dFdx(vBankDepth), dFdy(vBankDepth));
  if (vBankFinish > 0.001 && uWaterBed > 0.5) {
    vec2 mx = dux * uTileSize, my = duy * uTileSize;
    vec2 uv = vLocalXZ * 0.49;
    int layers = textureSize(uTileArr, 0).z;
    float pat = float(layers - 1);
    vec4 top = layers <= ${MAX_GROUND_LAYERS + 1} ? textureGrad(uTileArr, vec3(fract(uv), pat), mx * 0.49, my * 0.49) : vec4(0.5, 0.45, 0.0, 0.0);
    vec4 soil = top;
    vec3 normal = normalize(vNormal);
    float face = smoothstep(0.045, 0.34, 1.0 - normal.y);
    if (face > 0.01 && layers <= ${MAX_GROUND_LAYERS + 1}) {
      vec4 xFace = textureGrad(uTileArr, vec3(fract(vec2(uv.y, -vBankDepth * 0.49)), pat),
        vec2(mx.y, -dropGrad.x) * 0.49, vec2(my.y, -dropGrad.y) * 0.49);
      vec4 zFace = textureGrad(uTileArr, vec3(fract(vec2(uv.x + 0.37, -vBankDepth * 0.49)), pat),
        vec2(mx.x, -dropGrad.x) * 0.49, vec2(my.x, -dropGrad.y) * 0.49);
      vec2 weights = normal.xz * normal.xz;
      soil = mix(top, mix(zFace, xFace, weights.x / max(0.001, weights.x + weights.y)), face);
    }
    float cover = reNoise(unwrapped, 166, 217u);
    float pocket = smoothstep(0.24, 0.78, cover);
    float edge = mix(0.15 + 0.18 * pocket, 0.11, face) + (top.g - 0.45) * 0.19 + (soil.r - 0.5) * 0.10;
    float exposed = smoothstep(edge - 0.037, edge + 0.042, vBankDepth);
    float wet = smoothstep(0.24 + cover * 0.06, 0.47, vBankDepth);
    float clod = smoothstep(0.20, 0.79, soil.r + (cover - 0.5) * 0.55);
    vec3 dryLoam = mix(vec3(0.123, 0.110, 0.077), vec3(0.380, 0.324, 0.218), clod);
    vec3 wetSilt = mix(vec3(0.087, 0.090, 0.075), vec3(0.263, 0.246, 0.183), clod);
    vec3 pigment = mix(dryLoam, wetSilt, wet);
    float rootBand = face * (1.0 - smoothstep(0.035, 0.12, abs(vBankDepth - edge - 0.045)));
    pigment *= 1.0 - rootBand * 0.15;
    pigment += vec3(0.095, 0.078, 0.045) * soil.a * rootBand;
    pigment += vec3(0.082, 0.078, 0.060) * soil.b * (0.4 + 0.6 * pocket);
    vec3 earth = ${decode('pigment')};
    vec3 sod = ${decode('textureGrad(uTileArr, vec3(fract(unwrapped * 4.4), 2.0), dux * 4.4, duy * 4.4).rgb')};
    float nap = top.g - 0.45;
    vec3 grass = sod * vec3(0.90, 0.94, 0.84) * (0.93 + 0.14 * cover + 0.68 * nap);
    if (layer == 2) grass = mix(tex, grass, 0.77);
    float dryTurf = (layer == 2 || grassyWaterBank(data)) ? 1.0 : turf;
    float share = max(dryTurf, smoothstep(0.0, 0.055, vBankDepth));
    tex = mix(tex, mix(grass, earth, exposed), vBankFinish * share * (1.0 - snowC * (1.0 - wet)));
  }`;
