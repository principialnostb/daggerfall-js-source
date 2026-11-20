// Coordinates are local to each basin, including the small upper dishes.
export const FOUNTAIN_WATER_GLSL = `
uniform float uFountainTime;
vec3 fountainWater(vec2 p, vec3 eye, vec3 bed) {
  if (uFountainTime < 0.0) {
    float streak = sin(p.y * 33.0 + uFountainTime * 8.0 + p.x * 1.6);
    return mix(vec3(0.40, 0.59, 0.61), vec3(0.72, 0.82, 0.82), streak * 0.5 + 0.5);
  }
  float t = uFountainTime;
  float radius = length(p);
  float crossWave = sin(p.x * 19.0 + p.y * 11.0 + t * 1.4);
  float drift = sin(p.y * 24.0 - p.x * 9.0 - t * 1.1);
  float fine = sin(p.x * 37.0 - p.y * 63.0 + t * 1.7 + 1.5 * drift);
  float ripple = sin(radius * 49.0 - t * 3.6 + 0.8 * crossWave + 0.45 * fine);
  float crest = smoothstep(0.77, 1.0, ripple) * smoothstep(0.0, 0.95, crossWave + drift * 0.65 + fine * 0.7);
  float grazing = 1.0 - clamp(abs(eye.y) / max(length(eye), 0.001), 0.0, 1.0);
  float shallow = smoothstep(0.55, 0.96, radius);
  vec3 base = mix(vec3(0.19, 0.34, 0.37), vec3(0.34, 0.47, 0.47), shallow);
  base += (dot(bed, vec3(0.30, 0.59, 0.11)) - 0.45) * (0.06 + 0.12 * shallow);
  base += vec3(0.022, 0.031, 0.034) * (0.6 * drift + 0.6 * fine + ripple);
  return mix(base, vec3(0.64, 0.76, 0.77), grazing * grazing * 0.36 + crest * 0.30);
}
`;
