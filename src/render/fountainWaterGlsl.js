import { SEA_LOOK_GLSL } from './horizonHaze.js';
import { POND_SURFACE_GLSL } from './pondSurfaceGlsl.js';

export const FOUNTAIN_WATER_GLSL = `
uniform vec4 uFountainFlow;
uniform vec3 uBasinZenith;
uniform vec3 uBasinHorizon;
uniform vec3 uBasinWind;
${SEA_LOOK_GLSL}
${POND_SURFACE_GLSL}

vec3 fountainWater(vec2 p, vec3 eye, vec3 bed) {
  float time = uFountainFlow.x;
  vec2 impact = uFountainFlow.yz;
  float shelter = uFountainFlow.w;
  if (time < 0.0) {
    float strand = sin(floor(p.y * 19.0) * 1.2 + time * 5.0 + p.x * 0.7);
    return mix(vec3(0.26, 0.38, 0.37), vec3(0.55, 0.66, 0.64), 0.43 + strand * 0.15);
  }
  vec2 footprint = fwidth(p);
  float detail = 1.0 - smoothstep(0.022, 0.11, max(footprint.x, footprint.y));
  float shore = smoothstep(0.54, 1.0, length(p));
  vec3 waves = pondRipples(p * 2.35, time, uBasinWind.xy,
    uBasinWind.z * (1.0 - shelter), detail * (1.0 - shelter * 0.67));
  vec3 view = eye / max(length(eye), 1e-4);
  vec3 normal = normalize(vec3(-waves.x, 1.0, -waves.y));
  float ndv = clamp(dot(normal, view), 0.0, 1.0);
  vec4 reflection = pondReflection(reflect(-view, normal), ndv,
    uBasinZenith, uBasinHorizon, seaFresnel(ndv, 0.02), waves.z);
  // Small bowls use a radial depth tint and leave their stone in the opaque pass.
  vec3 body = mix(vec3(0.105, 0.22, 0.22), vec3(0.24, 0.36, 0.33), shore * 0.79);
  body += (dot(bed, vec3(0.30, 0.59, 0.11)) - 0.27) * (0.07 + shore * 0.15);
  vec3 water = mix(body, reflection.rgb, reflection.a * (1.0 - shelter * 0.72));
  if (dot(impact, impact) > 0.0) {
    vec2 texel = (floor(p * 54.0) + 0.5) / 54.0;
    float dist = min(length(texel - impact), length(texel + impact));
    float ring = sin(dist * 82.0 - time * 4.6);
    float crest = smoothstep(0.57, 0.96, ring) * (1.0 - smoothstep(0.025, 0.14, dist));
    float foam = step(0.40, sin(texel.x * 726.0 + texel.y * 394.0 + time * 4.1))
      * (1.0 - smoothstep(0.008, 0.049, dist));
    water = mix(water, vec3(0.59, 0.67, 0.64), (crest * 0.31 + foam * 0.26) * detail);
  }
  return water;
}
`;
