// Apply before seasonal cover. Exposed faces take their climate's soil or
// stone. In the open patches, some earth shows through ordinary meadow turf.
export const groundFinishGlsl = `
  float turf = ge ? (geA == 2u ? 1.0-geS : geB == 2u ? geS : 0.0) : (layer == 2 ? 1.0 : 0.0);
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
