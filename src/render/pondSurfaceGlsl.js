// Shared by the terrain ponds and by the water in placed basins.
export const POND_SURFACE_GLSL = `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 pondRipples(vec2 p, float time, vec2 wind, float strength, float reach) {
    vec2 drift = wind * (0.32 * time);
    float a = vnoise(p * vec2(1.4, 4.2) - drift);
    float b = vnoise(p * vec2(2.8, 1.1) + drift.yx + vec2(7.1, 3.4));
    vec2 axis = normalize(vec2(0.42, 0.91) + 0.42 * wind);
    float phase = 8.5 * dot(p, axis) - time * (1.35 + 0.55 * strength);
    float ripplePatch = vnoise(p * 0.76 + vec2(0.7, -2.3) - drift * 0.23);
    float face = cos(phase + 3.4 * b + 5.0 * ripplePatch);
    float crest = face * smoothstep(0.26, 0.73, a) * (0.38 + 0.62 * ripplePatch);
    float facet = reach * smoothstep(0.74, 0.97, face) * smoothstep(0.38, 0.69, a) * (0.42 + 0.58 * ripplePatch);
    vec2 slope = reach * ((0.18 + 0.12 * strength) * axis * crest + 0.10 * (vec2(a, b) - 0.5));

  return vec3(slope, facet);
}
vec4 pondReflection(vec3 R, float NdV, vec3 zenith, vec3 horizon, float F, float pondFacet) {
  vec3 skyRefl = seaSkyRefl(R.y, zenith, horizon);
    float skyBand = smoothstep(-0.07, 0.41, R.y);
    vec3 sky = mix(horizon, skyRefl, 0.52);
    skyRefl = mix(vec3(dot(sky, vec3(0.30, 0.59, 0.11))), sky, 0.56)
      * mix(0.63, 1.0, skyBand);
    F = max(F, mix(0.14, 0.30, skyBand) * (1.0 - 0.28 * NdV));
    F = mix(F, 0.74, pondFacet);
    skyRefl = mix(skyRefl, horizon, 0.55 * pondFacet);
  return vec4(skyRefl, F);
}
`;
