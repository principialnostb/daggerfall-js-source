// @ts-check
// THE WATER SURFACE (WATER1, 2026-09-08). Mac: "develop proper water
// shader for the oceans/rivers/ponds of daggerfall."
//
// WHAT DAGGERFALL DRAWS. Water is record 0 of the terrain tileset, and
// the terrain pass draws it exactly as it draws dirt: one opaque layer
// of the tile array, Lambert-lit, unmoving (render/renderer.js
// TERRAIN_FS - the verbatim TilemapTextureArray decode). The ocean's
// vertices are clamped flat at SCALED_OCEAN_ELEVATION (terrainSampler.js)
// but nothing about the shading says "water". Classic Daggerfall
// palette-cycled the tile; DFU draws it flat. This is the port's
// ENHANCED-LANE DEPARTURE (Ledger section A, row WATER1): a second pass
// over the same terrain grid, alpha-blended above it, that shades every
// water tile as a water surface - waves on the wind, the sky reflected
// by Fresnel, the sun and the moon glinting, the cloud deck's shadow,
// rain pocking the surface, the shore feathered along the marching
// squares' own diagonal. The classic lane and the terrain pass are
// untouched: the switch is `enhancedWater`, the kill door `?water=off`.
//
// THE GEOMETRY IS THE TERRAIN'S. There is no water mesh: the pass draws
// the pixel's own terrain surface (positions, normals, indices - the
// far ring's strided twin included) lifted WATER_LIFT above the ground,
// and the fragment shader DISCARDS everything that is not water. So the
// ocean is flat because the terrain under it is flat, a river follows
// its slope because the tiles do, and a town pond sits at the town's
// ground. Nothing here asserts a water surface height to the game
// (player/exteriorSurface.js: DFU has none outdoors) - it is a draw.
//
// WHICH TEXEL IS WATER. The tile byte says, through the 256-entry
// table of WATER CORNERS in world/water/waterCorners.js (MAC2 lifted it out of
// this file: the player's feet read the same table now, so where this
// pass draws water the player swims). The coverage inside a tile is
// the bilinear blend of its corners - the diagonal the shore tile's own
// art follows - feathered by SHORE_SOFTNESS.
import { POND_DEPTH_OFFSET, WATER_DRAW_MASK_TABLE } from '../world/water/waterCorners.js';
import { snowCoreGlsl } from './snowCoverGlsl.js'; // AUDIT PRECIP GROUND-5: the ground's snow, for a puddle's mask under it
import { PUDDLE_RECORDS } from '../world/puddleMask.js'; // WATER-PUDDLE: the records whose water is their art's   // MAC2: the corner table is a leaf the player's feet share; WATER-DRAW1: the DRAW's half of it - the feet's is the law's own table, and the two are not the same question
import { WIND_ROW_CALM, WIND_ROW_SPAN } from '../systems/wind/wind.js';
import { getPref } from '../systems/uiPrefs.js'; // FT6: the switch, read here alone
import { isEnhanced } from '../systems/uiSkin.js';
import { FOG_GLSL } from './fogGlsl.js'; // AUDIT 68 S17-fog-glsl-dup: the fog every world pass takes, one home
import { SEA_LOOK_GLSL, SEA_HAZE_BAND } from './horizonHaze.js'; // FAR-SEA1: the sea takes the far ring's haze; AUDIT FAR-SEA1 C12: and the open sea's light is one text with the ring's sea
import { pageParam } from '../systems/pageQuery.js';
import { EDGE_NOISE_GLSL } from './roadEdgeGlsl.js'; // COAST-LOOK: the edges' lattice noise, its one text
import { groundWanderGlsl, groundKindsGlsl } from './groundEdgeGlsl.js'; // COAST-LOOK: the shore's wander and the transitions' table, the ground's own (the sheet, the sand and the silt on one line)
import { RIPPLE_CELLS, RIPPLE_SCALE } from '../world/water/waterRipples.js';
import { NO_BED_DEPTH, SHELF_SHEET_DEPTH } from '../world/water/waterCorners.js'; // AUDIT WATER-NEXT H2: its one home, the water's leaf (the kernel's worker writes it)   // WATER-NEXT 4: the ripple field the shader reads   // PERF-URL: the page's query, parsed once a search

/** FT6 (2026-09-14, the Features arc): THE SWITCH, ONE HOME. Both
 *  exterior hosts composed "the enhanced skin, the pref, the kill door"
 *  inline, word for word - two copies of one law. This is the copy:
 *  the enhanced skin (the classic lane draws DFU's flat tile), the
 *  Enhanced water pref, and `?water=off` as the kill door. A town host
 *  still asks tilemapRectHasWater beside it - that is the town's, not
 *  the switch's. */
export function waterSwitchOn(search = globalThis.location?.search ?? '') {
  return isEnhanced() && !!getPref('enhancedWater') && pageParam('water', search) !== 'off'; // PERF-URL
}

// ═══════════════════════════════════════════════════════════════════
// FIELD BUGS 2026-09-29 (the sea) #4 (the Discord, through Mac: "Water flickers from a distance"): THE WATER'S LAYERS
// IN WINDOW DEPTH. The sea is a stack of sheets a few centimetres apart: the ground under it (the beach at the sea's
// own 34 m, Iliac Puddle No More's carved floor at least 5 cm under it), the sea's surface film over that (Iliac Puddle
// No More's top 3 cm up, SurfaceRenderYOffset; WATER1 a hand's breadth over the ground it lies on), and Come Sail Away's
// breakers 10 cm up (WAVE_LIFT). Unity draws them on a reversed, floating-point depth buffer that parts a centimetre
// at any range; this port's world pass is the GL convention's - a 24-bit buffer, the near plane 0.2 m out - where a
// step of depth is z^2 / (0.2 x 2^24) metres of eye depth: 3 mm at 100 m, 30 cm at 1 km. Seen from a raised eye a
// sheet 3 cm over another is a fraction of a step apart at a few hundred metres, and which of the two a pixel shows is
// the rounding's, which moves with every centimetre the deck bobs the camera: the far beach and the breakers flicker
// (tools/fbseaWaterProbe.mjs measures it on a real pipeline). WATER1 met the same law first and took a polygon offset
// (renderer.js, WATER-AUDIT M3): a nudge in WINDOW depth, so worth one resolvable step at every distance, never a lift
// in metres that is worth nothing past a few hundred. Every sheet of the stack takes it now, in the order the sheets
// stand in, from this one table:
//
//   the ground and the floor .......... 0 (opaque, written)
//   the surface film (the top, WATER1)  SURFACE: it covers what lies under it by two steps
//   Come Sail Away's breakers ......... BREAKERS: they stand over the film by four more - they write their depth, and
//                                       the film is drawn after them and tested against it
//
// The CONSTANT term only (WATER-AUDIT M3's reason: a slope factor grows with the sheet's own depth slope, hundreds of
// units a pixel at a grazing look, and would pull the water in front of a hull or a shore standing above it). What a
// step of bias costs: a sheet shows through what stands within that many steps in front of it - under a millimetre
// at 100 m, and at a kilometre a hull's waterline creeps up by a few centimetres, a fraction of the one pixel it is.
// ═══════════════════════════════════════════════════════════════════

/** polygonOffset's units (constant term, factor 0) for each sheet of the sea, the ground's 0 under them. */
export const WATER_LAYER_UNITS = Object.freeze({
  /** The sea's surface film: Iliac Puddle No More's top and WATER1 - never both over one texel (DW-F). */
  surface: -2,
  /** Come Sail Away's breakers: opaque, written, and drawn before the film - so the film tests against them. */
  breakers: -6,
});

/** How far above the ground the surface is drawn, in world units (a
 *  tile is 6.4). Enough to clear the depth test on a slope, too little
 *  to read as a step at the shore. */
export const WATER_LIFT = 0.08;
/** The classic water texel's tint under the surface - a deep blue-green
 *  multiplier, so the tile's own palette colour reads as the body of the
 *  water and not as a floor seen through it. MAC2: darkened from
 *  0.62/0.78/0.86 - the body is the water's depth now, not its floor. */
export const WATER_TINT = Object.freeze([0.36, 0.5, 0.6]);
/** Schlick's F0 for water (n = 1.33). */
export const WATER_F0 = 0.02;
/** Half-width of the shore feather, in coverage (0.5 is the diagonal). */
export const SHORE_SOFTNESS = 0.16;
/** The classic texel's slow flow, in tiles per second. AUDIT 65 CV-3:
 *  the ONE home for the rate - scenes/dungeon.js and scenes/worldModes.js
 *  import it, so a river and a dungeon pool crawl alike. */
export const WATER_SCROLL_TILES_PER_SEC = 0.05;
/** The sky the surface reflects when no sky says otherwise (a test, a
 *  lab without a dome): a plain day. */
export const DEFAULT_SKY_ZENITH = Object.freeze([0.17, 0.35, 0.72]);
export const DEFAULT_SKY_HORIZON = Object.freeze([0.66, 0.78, 0.92]);

/** WATER-AUDIT: does a sub-rectangle of a `dim`-wide tilemap carry any
 *  water? The fixed city pads its square tilemap with zeros past the
 *  location's real extent, and zero converts to water, so the whole map
 *  answered yes for every non-square town (AUDIT 65 MC-6: the one gate -
 *  the whole-map twin it replaced had no caller left and is retired). */
export function tilemapRectHasWater(bytes, dim, width, height, table = WATER_DRAW_MASK_TABLE) {
  const w = Math.min(width, dim),
    h = Math.min(height, dim);
  for (let y = 0; y < h; y++) {
    const row = y * dim;
    for (let x = 0; x < w; x++) if (table[bytes[row + x]]) return true;
  }
  return false;
}

/**
 * WATER-AUDIT (M4): THE WATER'S OWN INDEX SET. The pass drew the pixel's
 * whole terrain grid - 32,768 triangles for one stream tile, the far
 * ring's twin skirt included (a 40-unit vertical curtain of water at a
 * coast, both windings, four times). The quads of buildTerrainIndices'
 * layout whose tiles carry any water corner, and nothing else: an open
 * sea keeps every quad, a stream pixel keeps a few hundred triangles, no
 * pixel keeps a skirt. Null when the tilemap carries no water at all.
 * A quad (x, z) of the stride-`stride` grid covers the stride x stride
 * tiles at (x * stride.., z * stride..) - the grid's cell IS the tile at
 * stride 1 (6.4 units), which is the frame the shader samples in.
 */
export function buildWaterIndices(
  bytes,
  stride = 1,
  table = WATER_DRAW_MASK_TABLE,
  tileDim = 128,
  width = tileDim,
  height = tileDim,
) {
  const g = width / stride + 1; // WATER-NEXT 2: a grid `width` x `height` tiles (the fixed town's), `tileDim` a row
  const qx = g - 1,
    qz = height / stride;
  const out = [];
  for (let z = 0; z < qz; z++) {
    for (let x = 0; x < qx; x++) {
      let wet = false;
      for (let tz = z * stride; tz < (z + 1) * stride && !wet; tz++) {
        const row = tz * tileDim;
        for (let tx = x * stride; tx < (x + 1) * stride; tx++)
          if (table[bytes[row + tx]]) {
            wet = true;
            break;
          }
      }
      if (!wet) continue;
      const i0 = z * g + x,
        i1 = i0 + 1,
        i2 = i0 + g,
        i3 = i2 + 1;
      out.push(i0, i2, i3, i0, i3, i1);
    }
  }
  return out.length ? Uint32Array.from(out) : null;
}

/** 0..1: the eased wind row's strength on the sky's own scale
 *  (systems/wind/wind.js: a row's vector runs WIND_ROW_CALM to
 *  WIND_ROW_CALM + WIND_ROW_SPAN). null = no wind is known = calm. */
export function windStrength01(wind) {
  if (!wind) return 0;
  const m = Math.hypot(wind[0] ?? 0, wind[1] ?? 0);
  return Math.min(1, Math.max(0, (m - WIND_ROW_CALM) / WIND_ROW_SPAN));
}

/**
 * The frame's water uniforms, from what the hosts hold: the clock in
 * real seconds, the eased wind row (null = calm; the direction is the
 * row's), the front's rain intensity 0..1, and the sky's two colours
 * ({zenith, horizon} 0..1 rgb, or null for the default day) - SKYRIM-AURORA: and its `aurora`, the aurora's dome map
 * ({ tex }) the water reflects, or none.
 */
export function waterUniforms({ seconds = 0, wind = null, rain = 0, sky = null, still = false } = {}) {
  const t = still ? 0 : seconds;
  const s = windStrength01(wind);
  let dx = 0.7,
    dz = Math.sqrt(1 - 0.49); // a unit direction: the wind the sea takes when none is known
  if (wind) {
    const m = Math.hypot(wind[0] ?? 0, wind[1] ?? 0);
    if (m > 1e-9) {
      dx = wind[0] / m;
      dz = wind[1] / m;
    }
  }
  return {
    time: t,
    windDir: [dx, dz],
    windStrength: s,
    rain: Math.min(1, Math.max(0, rain || 0)),
    zenith: sky?.zenith ?? DEFAULT_SKY_ZENITH,
    horizon: sky?.horizon ?? DEFAULT_SKY_HORIZON,
    aurora: sky?.aurora?.tex ?? null, // SKYRIM-AURORA: the dome map's texture, or null
    // AUDIT WATER-NEXT m6: no `scroll` and no `opacity` - WATER-NEXT 2's sheet scrolls no texel and has no one opacity
    // (the body swallows light by its depth; MAC2's "darker and not as see through" is the deep water's now), and
    // WATER_OPACITY, forwarded here and pinned as the surface's floor, was a law nothing drew
    lift: WATER_LIFT,
    tint: WATER_TINT,
    f0: WATER_F0,
    shoreSoft: SHORE_SOFTNESS,
    swell: swellAmplitude(s), // WATER-NEXT 2: the sheet's swell, the wind's
    absorb: WATER_ABSORB,
  };
}

// ═══════════════════════════════════════════════════════════════════
// WATER-NEXT 2 - THE SWELL (2026-10-07, Mac: "real translucent water with proper waves"; asked, the waves "modest,
// weather-driven"): THE SHEET MOVES. WATER1's waves were a normal map on a still sheet; the sheet now rides three
// long trains - one down the wind, two crossing it - whose height the vertex shader lifts the sheet by and whose slope
// the fragment shader lights, ONE field (SWELL_GLSL, written from SWELL_TRAINS, and swellAt below, the same sum for the
// CPU - AUDIT WATER-NEXT m10: its pins read it; no hull bobs on it yet, so a still boat's waterline rides the swell's
// height up and down its side, as a wave runs along a moored hull). The trains run at deep water's own speed (omega = sqrt(g k), a unit a metre) and
// none is shorter than four of the sheet's 6.4-unit cells, so the grid carries it without facets. Over the bank the
// swell dies (the bed's depth fades it - water never lifts off its shore), and its height is the WIND's: a calm pond
// barely breathes, a gale heaves. The fine ripples and the rain stay WATER1's normal map (waveGradient).
// ═══════════════════════════════════════════════════════════════════

/** The swell's trains: [angle off the wind (radians), wavelength (units), share of the amplitude]. */
export const SWELL_TRAINS = Object.freeze([
  Object.freeze([0.0, 48.0, 0.55]),
  Object.freeze([0.54, 31.0, 0.28]),
  Object.freeze([-0.75, 25.6, 0.17]),
]);
/** g for the trains' speed, in units a second squared (a unit is a metre). */
export const SWELL_G = 9.8;
/** The swell's height (the sum of the trains' amplitudes, units) at a calm and at a gale, between them the wind's. */
export const SWELL_CALM = 0.05;
export const SWELL_GALE = 0.34;
/** The bed depth (units) over which the swell grows from nothing at the bank to its whole height. */
export const SWELL_DEPTH = 2.5;
/** AUDIT WATER-NEXT G8: the distance (units) over which the sheet's heave fades out - inside a near pixel's reach of the
 *  eye (a pixel is 819.2 across), before a strided ring's cells grow as long as the shortest train. */
export const SWELL_REACH = Object.freeze([300, 600]);
/** The swell's height for a wind strength 0..1. */
export const swellAmplitude = (windStrength01) =>
  SWELL_CALM + (SWELL_GALE - SWELL_CALM) * Math.min(1, Math.max(0, windStrength01));

/** The swell at a world point, the shader's own sum: [height, d/dx, d/dz]. `windDir` a unit [x, z]. */
export function swellAt(x, z, t, windDir, amplitude) {
  let h = 0,
    gx = 0,
    gz = 0;
  for (const [ang, len, share] of SWELL_TRAINS) {
    const c = Math.cos(ang),
      s = Math.sin(ang);
    const dx = c * windDir[0] - s * windDir[1],
      dz = s * windDir[0] + c * windDir[1];
    const k = (2 * Math.PI) / len,
      w = Math.sqrt(SWELL_G * k),
      a = amplitude * share;
    const ph = k * (dx * x + dz * z) - w * t;
    h += a * Math.sin(ph);
    gx += a * k * Math.cos(ph) * dx;
    gz += a * k * Math.cos(ph) * dz;
  }
  return [h, gx, gz];
}

/** The same sum in GLSL - the vertex shader's lift and the fragment shader's slope, one text. */
export const SWELL_GLSL = `
vec3 swellAt(vec2 p, float t, vec2 wind, float amp) {
  vec3 r = vec3(0.0);
${SWELL_TRAINS.map(([ang, len, share]) => {
  const k = (2 * Math.PI) / len,
    w = Math.sqrt(SWELL_G * k),
    f = (v) => `(${v.toFixed(6)})`;
  return `  { vec2 d = vec2(${f(Math.cos(ang))} * wind.x - ${f(Math.sin(ang))} * wind.y, ${f(Math.sin(ang))} * wind.x + ${f(Math.cos(ang))} * wind.y);
    float ph = ${k.toFixed(6)} * dot(d, p) - ${w.toFixed(6)} * t; float a = amp * ${share.toFixed(4)};
    r += vec3(a * sin(ph), (a * ${k.toFixed(6)} * cos(ph)) * d); }`;
}).join('\n')}
  return r;
}`;

// ═══════════════════════════════════════════════════════════════════
// WATER-NEXT 2 - THE BODY: water is a depth of something that swallows light, red first. What lies under it is seen
// through it by Beer-Lambert - exp(-WATER_ABSORB * path), the path the eye's through the water - and where the light is
// swallowed the water's own colour stands (the climate's water texel, averaged, tinted - a swamp's water is a swamp's).
// A hand's depth is clear, a man's depth green-blue, a lake's heart and the sea dark: Mac's MAC2 water, "darker and
// not as see through", is the deep water's, and the shallows are glass.
// ═══════════════════════════════════════════════════════════════════

/** Beer-Lambert's absorption, per unit of path, red, green, blue. */
export const WATER_ABSORB = Object.freeze([0.55, 0.3, 0.22]);
/** How far the refracted look is pushed by the waves' slope, in screen fractions at a unit of depth. */
export const REFRACT_STRENGTH = 0.035;
/** The path through the water, in units, past which the push grows no more. */
export const REFRACT_PATH_MAX = 4;
/** How the push fades with the distance from the eye: it is divided by 1 + REFRACT_FADE times that distance. */
export const REFRACT_FADE = 0.02;
/** How far inside the copy's edges the pushed look is held, in screen fractions. */
export const REFRACT_EDGE = 0.001;
/** The depth a sheet without a bed stands for - world/water/waterCorners.js NO_BED_DEPTH, its one home, re-exported for the renderer. */
export { NO_BED_DEPTH };
/** The path, in units, past which the water is taken as deep everywhere it cannot measure itself (the open sea
 *  without a depth copy). */
export const OPEN_PATH = 60.0;
// ═══════════════════════════════════════════════════════════════════
// WATER-NEXT 3 - THE SHORE (Mac: "shoreline interactivity"): WHERE THE WATER RUNS OUT, IT BREAKS. A band of foam where
// the water is shallow - FOAM_DEPTH of it, wider in a wind - pushed up the bank by the swell's crest and drawn back by
// its trough (the run-up: the band's edge rides the swell's own height), cut into lace by a noise that drifts down the
// wind; and on open water in a strong wind, where the swell is steep, its crests whiten. Lit by the light the water
// is, never glowing. One field with the waves: no sprite, no second sheet.
// ═══════════════════════════════════════════════════════════════════

/** The water depth (units, vertical) over which the shore's foam fades out, at a calm; a gale doubles it. */
export const FOAM_DEPTH = 0.22;
/** How far the swell's height pushes the foam's edge up and down the bank, in multiples of that height. */
export const FOAM_RUNUP = 2.2;
/** The swell's slope past which a crest whitens, at a gale (never below a strong wind). */
export const CREST_SLOPE = 0.075;

/** The texture units the scene's copy rides (bound before every water draw, never trusted to persist - inside
 *  Dynamic Skies' nine and under the lane's own, as BB_SURFACE_UNIT). */
export const WATER_SCENE_UNIT = 7;
/** WATER-NEXT 4: the ripple field's unit - 1, the billboards' emission unit, its shadow forgotten after the bind. */
export const WATER_RIPPLE_UNIT = 1;
export const WATER_SCENE_DEPTH_UNIT = 6;
/** SKYRIM-AURORA: the aurora's dome map's unit - no other fixed unit's (the snow's are 16-20, the skin's 21, the panes' 22,
 *  the snow lines' 23, the window light's 24); the black texel while there is none. */
export const AURORA_SKY_UNIT = 25;
/** SKYRIM-AURORA: where the aurora's dome map (render/auroraPass.js AURORA_DOME_FS) holds direction R - its azimuth from the
 *  north toward the east across, its height up. Here, beside its reader, so the boot's graph takes no new file. */
export const AURORA_DOME_UV_GLSL = `vec2 auroraDomeUv(vec3 R) { return vec2((length(R.xz) > 1e-6 ? atan(R.x, R.z) : 0.0) * 0.15915494 + 0.5, R.y); }`; // atan(0, 0) is undefined: straight up, any azimuth
/** SKYRIM-AURORA: the least share of the aurora the water reflects - its Fresnel where that is more. Calm water at night
 *  shows the curtains as it shows a lamp's glint; the bare Fresnel, a few hundredths looking down, hid them. */
export const AURORA_MIRROR = 0.3;

/** WATER-NEXT 2: the sheet - the grid AS IT STOOD before the bed was carved under it (world/water/waterBed.js), its bed's
 *  depth on attribute 1, lifted WATER_LIFT and heaved by the swell. The open sea's sheet (Deep Waters' top, `uOpen`)
 *  has no bed attribute - a constant - and swells everywhere. */
export const WATER_SURFACE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in float aDepth;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform float uLift;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uSwell;
uniform int uOpen;
uniform vec3 uCamPos;          // AUDIT WATER-NEXT G8: the eye, for the swell's reach
out vec3 vWorldPos;
out vec2 vLocalXZ;
out float vDepth;
out float vGrow;
out float vPond;
${SWELL_GLSL}
void main() {
  vec4 world = uModel * vec4(aPos.x, aPos.y + uLift, aPos.z, 1.0);
  // AUDIT WATER-NEXT H2: a negative depth is water on ground never carved (world/water/waterCorners.js SHEET_NO_BED) - its
  // magnitude the tint's depth, and no swell: lifted only uLift over its ground, a heave of a fifth of a unit took its
  // troughs under the ground in any fair wind
  // BANK-FLUSH: the ground under the sheet is carved only past the shelf (world/water/waterBed.js SHELF_CHAMFER), so the swell
  // grows past it too - a trough over the shelf's uncarved ground went under it in a fair wind
  float grow = uOpen == 1 ? 1.0 : (aDepth < 0.0 ? 0.0 : smoothstep(${SHELF_SHEET_DEPTH.toFixed(3)}, ${(SHELF_SHEET_DEPTH + SWELL_DEPTH).toFixed(3)}, aDepth));
  vec3 sw = swellAt(world.xz, uTime, uWindDir, uSwell * grow);
  // AUDIT WATER-NEXT G8: the heave fades out before the far rings' strided grids, whose cells are as long as the
  // shortest train (a vertex a wave: the distant sheet heaved in an aliased lattice); the slope stays the fragment's
  float lift = sw.x * (1.0 - smoothstep(${SWELL_REACH[0].toFixed(1)}, ${SWELL_REACH[1].toFixed(1)}, length(world.xz - uCamPos.xz)));
  world.y += lift;
  vWorldPos = world.xyz;
  vLocalXZ = aPos.xz;
  vDepth = max(abs(aDepth) + lift, 0.0);
  vPond = float(aDepth < -${POND_DEPTH_OFFSET.toFixed(1)});
  vDepth -= vPond * ${POND_DEPTH_OFFSET.toFixed(1)};
  vGrow = grow;
  gl_Position = uProj * uView * world;
}`;

/**
 * WATER-NEXT 2: the water's fragment shader, with the renderer's cloud-shadow block interpolated (a GLSL declaration
 * is visible only to the compilation unit that carries it - the EE5 lesson in renderer.js).
 *
 * WHERE: the terrain's water, a texel at a time - WATER1's corner table, its shore feather and WATER-PUDDLE's art
 * mask, unchanged - or, under `uOpen`, the whole sheet (Deep Waters' sea).
 * THE SLOPE: the swell's (the vertex shader's own field, per pixel) and WATER1's fine trains and rain.
 * THE PATH through the water: the scene's depth copy where the frame has one (the bed's own distance behind the
 * surface, so a boat's hull or a rock in a pond is where it is), else the bed's depth over the view's slant.
 * THE LOOK: what lies under the surface - the scene's colour copy, pushed by the waves' slope (never by a thing in
 * front of the water: a pushed look that lands on something nearer than the surface takes the straight look) - through
 * Beer-Lambert, the water's own lit colour where the light is swallowed, the sky reflected by Fresnel, the sun's, the
 * moon's and the lamps' glints, the fog. Without a copy (the classic lane's frame), the blend does the same sum: the
 * ground under the sheet is drawn, and the sheet's alpha is how much of it the water hides.
 */
export const waterSurfaceFs = (
  cloudShadowGlsl,
  shadowGlsl = '',
) => `#version 300 es   // EL7: with SHADOW_GLSL the water receives the lane's sun shadow
precision highp float;
precision highp int;   // WATER-NEXT 2: uOpen is the vertex stage's too - an int's precision must agree across the two
precision highp usampler2D;
precision highp sampler2DArray;
in vec3 vWorldPos;
in vec2 vLocalXZ;
in float vDepth;
in float vGrow;
in float vPond;
uniform sampler2DArray uTileArr;
uniform usampler2D uTilemap;
uniform highp ivec3 uEcoOrigin;   // AUDIT PRECIP GROUND-5: the pixel's first world tile on the snow lane (render/snowCoverGlsl.js)
${snowCoreGlsl()}
uniform float uTileSize;
uniform int uTileDim;          // WATER-AUDIT: the tilemap's side (128 in the world, the town's own in the fixed city)
uniform uvec4 uWaterMask[8];   // WATER1: 256 nibbles - converted tile byte -> water corners
uniform int uOpen;             // WATER-NEXT 2: the open sea's sheet - no tilemap, all water
uniform vec3 uOpenColor;       // and the mod's tint over its water's colour
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;   // 0..1 on the sky's row scale
uniform float uSwell;
uniform float uRain;           // 0..1, the front's intensity
uniform vec3 uLightDir;
uniform vec3 uAmbient;
uniform float uSunScale;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uMoonScale;
uniform vec3 uMoonColor;
uniform int uPointCount;       // WATER-AUDIT: the ground's point lights and the player's indirect light, term for term
uniform vec4 uPointLights[16];
uniform vec3 uPointColors[16];
uniform vec4 uIndirect;
uniform vec3 uIndirectColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform sampler2D uAuroraSky;   // SKYRIM-AURORA: the aurora's dome map (render/auroraPass.js), read while uAuroraSkyOn is 1
uniform int uAuroraSkyOn;
${AURORA_DOME_UV_GLSL}
uniform vec3 uTint;
uniform float uF0;
uniform float uShoreSoft;
${EDGE_NOISE_GLSL}
${groundWanderGlsl()}
${groundKindsGlsl()}
uniform vec3 uAbsorb;
uniform int uSceneOn;          // WATER-NEXT 2: the frame's colour and depth, copied before the water (Renderer.captureUnderWater)
uniform sampler2D uScene;
uniform sampler2D uSceneDepth;
uniform vec2 uSceneSize;
uniform mat4 uProj;
uniform int uRippleOn;         // WATER-NEXT 4: the ripple field round the camera (world/water/waterRipples.js)
uniform sampler2D uRipple;
uniform vec3 uRippleRect;      // its corner's world x, z and its side
${cloudShadowGlsl}
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec2 uSeaHaze;         // FAR-SEA1: the far ring's haze hold (0: off - the world's fog alone) and the sea's height (AUDIT FAR-SEA1 P3: the rim never reaches the streamed sea)
uniform vec3 uCamPos;
${shadowGlsl}
out vec4 outColor;
${FOG_GLSL}
${SEA_LOOK_GLSL}
${SWELL_GLSL}
uint waterCorners(uint data) {
  // the component by comparison, not by a dynamic index: a dynamic
  // component index on a uvec4 answered zero on ANGLE/SwiftShader (the
  // probe's first run), and a driver that cannot find the water is worse
  // than three compares
  uvec4 v = uWaterMask[data >> 5u];
  uint j = (data >> 3u) & 3u;
  uint word = j == 0u ? v.x : (j == 1u ? v.y : (j == 2u ? v.z : v.w));
  return (word >> ((data & 7u) * 4u)) & 15u;
}
// WATER-PUDDLE: a tile's turn as TERRAIN_FS applies it (render/renderer.js - DFU's row-major initializers transposed)
const mat2 PUDDLE_ROT[4] = mat2[4](mat2(1.0, 0.0, 0.0, 1.0), mat2(0.0, -1.0, 1.0, 0.0), mat2(-1.0, 0.0, 0.0, -1.0), mat2(0.0, 1.0, -1.0, 0.0));
const vec2 PUDDLE_TRANS[4] = vec2[4](vec2(0.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0), vec2(1.0, 0.0));
bool isPuddleRecord(uint r) { return ${PUDDLE_RECORDS.map((r) => `r == ${r}u`).join(' || ')}; }
float coverage(uint m, vec2 f) {
  float c00 = float(m & 1u), c10 = float((m >> 1u) & 1u);
  float c01 = float((m >> 2u) & 1u), c11 = float((m >> 3u) & 1u);
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}
// WATER1's fine trains: the gradient of three short trains on the wind and two rain trains, each fading with the
// distance on its own wavelength's scale, so a train a few units long is gone before it is a texel wide and aliases
vec2 waveGradient(vec2 p, float t, float dist) {
  float s = 0.35 + 0.65 * uWindStrength;
  vec2 d0 = uWindDir;
  // WATER-AUDIT (H3): the crossing trains by ROTATION of the wind, never
  // by adding a fixed vector to it - the sum collapsed onto the wind at
  // one heading and was the zero vector (a NaN sea) at its opposite
  vec2 d1 = vec2(0.809 * d0.x - 0.588 * d0.y, 0.588 * d0.x + 0.809 * d0.y);   // +36 degrees
  vec2 d2 = vec2(0.766 * d0.x + 0.643 * d0.y, -0.643 * d0.x + 0.766 * d0.y);  // -40 degrees
  vec2 g = vec2(0.0);
  g += (0.07 * s * exp(-dist * 0.004)) * cos(dot(p, d0) * 1.10 + t * 2.1) * d0;
  g += (0.06 * s * exp(-dist * 0.010)) * cos(dot(p, d1) * 2.30 + t * 3.4) * d1;
  g += (0.05 * s * exp(-dist * 0.020)) * cos(dot(p, d2) * 4.10 + t * 4.6) * d2;
  if (uRain > 0.0) {
    float near = exp(-dist * 0.012);
    vec2 r0 = vec2(0.96, 0.28), r1 = vec2(-0.28, 0.96);
    g += (0.16 * uRain * near) * cos(dot(p, r0) * 6.0 + t * 9.0) * r0;
    g += (0.16 * uRain * near) * cos(dot(p, r1) * 6.3 - t * 8.3) * r1;
  }
  return g;
}
// WATER-NEXT 3: the foam's lace - a value noise, two octaves
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
uniform float uPondBlock;
float lace(vec2 p, float t) {
  vec2 drift = uWindDir * t * 0.35;
  return 0.65 * vnoise(p * 0.9 - drift) + 0.35 * vnoise(p * 2.7 + drift.yx);
}
// the eye's distance to a window depth, off the frame's own projection (a GL perspective: z_ndc = 2d - 1)
float eyeDepth(float d) { return uProj[3][2] / ((d * 2.0 - 1.0) + uProj[2][2]); }
void main() {
  float edge = 1.0;
  float bankDepthScale = 1.0;
  float bankReflection = 1.0;
  vec2 pondOffset = vec2(0.0);
  float pondFacet = 0.0;
  vec3 body;
  if (uOpen == 1) {
    // the sea's own colour: the climate's water texel, averaged, under the mod's own tint (its Top Color setting)
    body = textureLod(uTileArr, vec3(0.5, 0.5, 0.0), 8.0).rgb * uTint * uOpenColor;
  } else {
    vec2 unwrapped = vLocalXZ / uTileSize;
    // GRAIN1 / GRAIN AUDIT 1: the footprint taken above the discards - a derivative inside non-uniform control flow is
    // undefined in GLSL ES 3.00
    vec2 wgx = dFdx(unwrapped), wgy = dFdy(unwrapped);
    if (vPond > 0.5 && uPondBlock > 1.0) {
      // Evaluate the material at the centre of the Objects pixel. Keep the
      // actual fragment for coverage and for the depth test at banks and posts.
      vec2 centre = (floor(gl_FragCoord.xy / uPondBlock) + 0.5) * uPondBlock;
      vec2 delta = centre - gl_FragCoord.xy;
      pondOffset = uTileSize * (wgx * delta.x + wgy * delta.y);
    }
    ivec2 cell = clamp(ivec2(floor(unwrapped)), ivec2(0), ivec2(uTileDim - 1));
    uint data = texelFetch(uTilemap, cell, 0).r;
    uint corners = waterCorners(data);
    if (corners == 0u) discard;
    vec2 f = fract(unwrapped);
    float c = coverage(corners, f);
    bool bank = geEntry(data) != 0u;
    float offset = bank ? shoreBlendOffset(c, geWander(unwrapped)) : 0.0;
    edge = smoothstep(0.5 - uShoreSoft, 0.5 + uShoreSoft, c - offset);
    // Let the exposed silt read through at the bank even when a small pond has no carved bed.
    if (bank) bankDepthScale = smoothstep(0.5, 0.5 + 2.0 * uShoreSoft, c);
    // The pilot floor intersects the sheet. Its excavated saddle spans the
    // two diagonal wet corners that the original tile mask only touches.
    if (vPond > 0.5 && ((bank && uSceneOn == 1) || data == 196u)) {
      edge = 1.0;
      bankDepthScale = 1.0;
    }
    if (bank && grassyWaterBank(data)) bankReflection = mix(0.32, 1.0, bankDepthScale);
    // WATER-PUDDLE: a puddle record keeps only the texels its own art paints water (world/puddleMask.js)
    uint rec = data >> 2u;
    if (isPuddleRecord(rec)) {
      int turn = int(data & 3u);
      vec2 puv = PUDDLE_ROT[turn] * f + PUDDLE_TRANS[turn];
      float pa = textureGrad(uTileArr, vec3(puv, float(rec)), PUDDLE_ROT[turn] * wgx, PUDDLE_ROT[turn] * wgy).a;
      // AUDIT PRECIP GROUND-5: under the snow the water is the texel's the ground wears there - its winter record's mask
      // in the cover's share (a puddle frozen under snow is the winter art's, a thaw's the summer's)
      float pc = snowCover(vLocalXZ, vWorldPos.y, wgx, wgy);
      if (pc > 0.0) pa = mix(pa, textureGrad(uTileArr, vec3(puv, float(rec) + float(uSnowArr.x)), PUDDLE_ROT[turn] * wgx, PUDDLE_ROT[turn] * wgy).a, pc);
      edge *= smoothstep(0.3, 0.7, pa);
    }
    if (edge <= 0.002) discard;
    // the water's own colour: the climate's water texel (record 0), averaged to one colour by its mip chain
    body = textureLod(uTileArr, vec3(0.5, 0.5, 0.0), 8.0).rgb * uTint;
  }
  // AUDIT WATER-NEXT G7: the open sea from under its own crest is not drawn - the mod's top discards the same
  // (uCamPos.y - vWorldPos.y + 0.02 < 0): a swimmer at the surface under a heaving sheet saw the wave's underside
  if (uOpen == 1 && uCamPos.y - vWorldPos.y + 0.02 < 0.0) discard;
  vec3 surfacePos = vWorldPos + vec3(pondOffset.x, 0.0, pondOffset.y);
  vec3 toEye = uCamPos - surfacePos;
  float dist = length(toEye);
  vec3 V = toEye / max(dist, 1e-4);
  vec3 sw = swellAt(surfacePos.xz, uTime, uWindDir, uSwell * vGrow);
  vec2 g = sw.yz + waveGradient(surfacePos.xz, uTime, dist);
  if (vPond > 0.5) {
    vec2 p = vLocalXZ + pondOffset;
    float reach = 1.0 - smoothstep(18.0, 45.0, dist);
    vec2 drift = uWindDir * (0.32 * uTime);
    float a = vnoise(p * vec2(1.4, 4.2) - drift);
    float b = vnoise(p * vec2(2.8, 1.1) + drift.yx + vec2(7.1, 3.4));
    vec2 axis = normalize(vec2(0.42, 0.91) + 0.42 * uWindDir);
    float phase = 8.5 * dot(p, axis) - uTime * (1.35 + 0.55 * uWindStrength);
    float ripplePatch = vnoise(p * 0.76 + vec2(0.7, -2.3) - drift * 0.23);
    float face = cos(phase + 3.4 * b + 5.0 * ripplePatch);
    float crest = face * smoothstep(0.26, 0.73, a) * (0.38 + 0.62 * ripplePatch);
    // Short sky-facing facets break up the reflection over the deeper bowl.
    pondFacet = reach * smoothstep(0.74, 0.97, face) * smoothstep(0.38, 0.69, a) * (0.42 + 0.58 * ripplePatch);
    g += reach * ((0.18 + 0.12 * uWindStrength) * axis * crest + 0.10 * (vec2(a, b) - 0.5));
    body = mix(vec3(0.18, 0.30, 0.30), body, 0.08);
  }
  // WATER-NEXT 4: the bodies' rings and wakes - the ripple field's slope, faded at its edge
  if (uRippleOn == 1) {
    vec2 ruv = (surfacePos.xz - uRippleRect.xy) / uRippleRect.z;
    vec2 inside = smoothstep(vec2(0.0), vec2(0.08), ruv) * smoothstep(vec2(0.0), vec2(0.08), vec2(1.0) - ruv);
    if (inside.x * inside.y > 0.0) {
      float tx = ${(1 / RIPPLE_CELLS).toFixed(6)};
      // AUDIT WATER-NEXT G10: an explicit level - an implicit one is undefined in non-uniform flow (the field has one)
      vec2 rg = vec2(textureLod(uRipple, ruv + vec2(tx, 0.0), 0.0).r - textureLod(uRipple, ruv - vec2(tx, 0.0), 0.0).r,
                     textureLod(uRipple, ruv + vec2(0.0, tx), 0.0).r - textureLod(uRipple, ruv - vec2(0.0, tx), 0.0).r);
      g += rg * (255.0 * ${RIPPLE_SCALE.toFixed(4)} / (2.0 * tx * uRippleRect.z)) * (inside.x * inside.y);
    }
  }
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  float NdV = clamp(dot(n, V), 0.0, 1.0);   // WATER-AUDIT (M1): two near-unit vectors can dot past one; pow of a negative is NaN
  float F = seaFresnel(NdV, uF0);   // AUDIT FAR-SEA1 C12: the open sea's light, one text with the far ring's sea (render/horizonHaze.js)
  F *= bankReflection;
  vec3 R = reflect(-V, n);
  vec3 skyRefl = seaSkyRefl(R.y, uSkyZenith, uSkyHorizon);
  if (vPond > 0.5) {
    // A broad patch of sky stays visible at a grazing angle. Tilted ripple
    // faces vary its brightness, using the current sky even at dusk.
    float skyBand = smoothstep(-0.07, 0.41, R.y);
    vec3 sky = mix(uSkyHorizon, skyRefl, 0.52);
    skyRefl = mix(vec3(dot(sky, vec3(0.30, 0.59, 0.11))), sky, 0.56)
      * mix(0.63, 1.0, skyBand);
    F = max(F, mix(0.14, 0.30, skyBand) * (1.0 - 0.28 * NdV));
    F = mix(F, 0.74, pondFacet);
    skyRefl = mix(skyRefl, uSkyHorizon, 0.55 * pondFacet);
  }
  // SKYRIM-AURORA: the aurora in the water, by the reflected ray (an explicit level: the flow here is not uniform), at the
  // water's Fresnel or AURORA_MIRROR, the more - added as the glints are, below
  vec3 auroraRefl = vec3(0.0);
  if (uAuroraSkyOn == 1) auroraRefl = textureLod(uAuroraSky, auroraDomeUv(R), 0.0).rgb * step(0.0, R.y) * max(F, ${AURORA_MIRROR.toFixed(2)});
  // PERF-SUN2: the shadow read only while the sun is up - a uniform branch
  float shadow = uSunScale > 0.0 ? cloudShadowAt(vWorldPos)${shadowGlsl ? ' * sunShadowAt(vWorldPos, n)' : ''} : 0.0;   // EL7: a quay's shadow lies on the water under the lane
  // the body lit as water is lit: the sky's light into it, the sun's and the moon's through it, softly
  float diff = max(dot(n, uLightDir), 0.0) * shadow;
  float mdiff = max(dot(n, uMoonDir), 0.0);
  vec3 lit = body * seaLight(uAmbient, uSunColor, uSunScale * diff, uMoonColor, uMoonScale * mdiff);
  vec3 pointAcc = vec3(0.0), pointSpec = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uPointCount) break;
    vec3 L = uPointLights[i].xyz - vWorldPos;
    float d = length(L);
    float att = clamp(1.0 - d / uPointLights[i].w, 0.0, 1.0);
    vec3 Ld = L / max(d, 1e-4);
    pointAcc += att * att * max(dot(n, Ld), 0.0) * uPointColors[i];
    // WATER-LIT1: water sends back little light diffusely and a lot as a glint - a lamp is a highlight on the waves
    pointSpec += att * pow(max(dot(n, normalize(Ld + V)), 0.0), 90.0) * uPointColors[i];
  }
  lit += body * pointAcc * 0.25;
  vec3 iL = uIndirect.xyz - vWorldPos;
  float iD = length(iL);
  float iAtt = clamp(1.0 - iD / max(uIndirect.w, 1e-4), 0.0, 1.0);
  lit += body * (iAtt * iAtt * max(dot(n, iL / max(iD, 1e-4)), 0.0)) * uIndirectColor * 0.25;
  // THE PATH through the water
  float slant = max(V.y, 0.12);
  float opticalDepth = vDepth * bankDepthScale;
  float bedPath = uOpen == 1 ? 0.0 : (opticalDepth + 0.02) / slant;   // what the bed under the sheet says
  float path = uOpen == 1 ? ${OPEN_PATH.toFixed(1)} : bedPath;
  vec2 uv0 = gl_FragCoord.xy / uSceneSize;
  // AUDIT WATER-NEXT G1/G3: THE COMPOSITION, PREMULTIPLIED. own is the water's own light at its share of the pixel;
  // with the scene's copy, under is the copy's colour at trans (its share: a finished, fogged image - fogged again
  // with the rest, every pond read paler and foggier than its bank); without one, cover is how much of the frame the
  // blend leaves under the sheet that the water hides. The foam and the glints are added to own at their full
  // strength - divided out of the blend after edge *= a, a glint over shallow water was a twentieth of Full's.
  // Extra extinction gives the shallow village basin a visible water column.
  // Both quality paths replace transmitted ground light with the lit body colour.
  vec3 extinction = uAbsorb;
  if (vPond > 0.5) extinction += vec3(0.94, 0.80, 0.74);
  vec3 own, under = vec3(0.0), trans = vec3(0.0);
  float cover = 1.0;
  if (uSceneOn == 1) {
    float here = eyeDepth(gl_FragCoord.z);
    float bedD = eyeDepth(textureLod(uSceneDepth, uv0, 0.0).r);   // AUDIT WATER-NEXT G10: after the discards, an explicit level
    if (vPond > 0.5) {
      // The surveyed floor meets this sheet. Fade the last few centimetres
      // against its actual depth instead of the coarse grid's corner estimate.
      edge *= smoothstep(0.0, 0.045, max(0.0, bedD - here) * slant);
      bedPath = 0.0;
    }
    path = max(bedD - here, bedPath);   // the scene's measure, never less than the bed's (a sheet with no bed stands for one)
    // the look pushed by the slope, by more the deeper the water under it, less the farther off
    vec2 push = n.xz * (${REFRACT_STRENGTH.toFixed(4)} * clamp(path, 0.0, ${REFRACT_PATH_MAX.toFixed(1)})) / (1.0 + dist * ${REFRACT_FADE.toFixed(2)});
    if (vPond > 0.5) push *= 0.35;
    vec2 uv = clamp(uv0 + push, vec2(${REFRACT_EDGE.toFixed(3)}), vec2(${(1 - REFRACT_EDGE).toFixed(3)}));
    float pushedD = eyeDepth(textureLod(uSceneDepth, uv, 0.0).r);
    if (pushedD < here) uv = uv0; else path = max(pushedD - here, bedPath);   // never what stands in front of the water
    vec3 T = exp(-extinction * path);
    under = textureLod(uScene, uv, 0.0).rgb;   // AUDIT WATER-NEXT G10: an explicit level
    trans = T * (1.0 - F);
    own = lit * (vec3(1.0) - T) * (1.0 - F) + skyRefl * F;
  } else {
    // the blend draws the ground under the sheet; cover is the share the water hides
    float t = dot(exp(-extinction * path), vec3(0.3333));
    cover = 1.0 - t * (1.0 - F);
    own = lit * (1.0 - t) * (1.0 - F) + skyRefl * F;
  }
  // WATER-NEXT 3: THE FOAM - the shore's band (the water's vertical depth here, the swell's crest pushing it up the
  // bank) and, on open water in a strong wind, the steep crests
  float vdepth = uSceneOn == 1 ? path * slant : (uOpen == 1 ? ${OPEN_PATH.toFixed(1)} : opticalDepth);
  // the open sea's sheets are 6.4-unit cells, their edge a staircase over the beach: where a sheet covers no water
  // (the scene's ground at or above it) it is gone, so the shore is where the sea's plane meets the sand
  if (uOpen == 1 && uSceneOn == 1) edge *= smoothstep(0.0, 0.12, vdepth);
  float band = ${FOAM_DEPTH.toFixed(3)} * (1.0 + uWindStrength);
  float shore = 1.0 - smoothstep(0.0, band, vdepth - sw.x * ${FOAM_RUNUP.toFixed(2)});
  float crest = smoothstep(${CREST_SLOPE.toFixed(4)}, ${(CREST_SLOPE * 1.6).toFixed(4)}, length(sw.yz)) * smoothstep(0.55, 0.9, uWindStrength);
  // a lace, never a rim: the noise cuts the band into threads, thicker the shallower the water and the harder the wind
  float l = lace(vWorldPos.xz, uTime);
  float foam = max(shore * shore * smoothstep(0.62 - 0.25 * shore * uWindStrength, 0.82, l), crest * smoothstep(0.6, 0.85, l)) * 0.75 * exp(-dist * 0.004);
  if (vPond > 0.5) foam *= 0.08;   // sheltered bank, without breaking surf
  vec3 foamLit = vec3(0.92, 0.95, 0.96) * (uAmbient + uSunColor * (uSunScale * shadow * max(n.y, 0.0)) + uMoonColor * (uMoonScale * 0.5));
  float k = foam * 0.9;   // foam is not glass: where it lies it hides what is under it
  own = mix(own, foamLit, k); trans *= 1.0 - k; cover = mix(cover, 1.0, k);
  edge = max(edge, foam * smoothstep(0.0, 0.2, edge));
  vec3 H = normalize(uLightDir + V);
  float spec = seaSunLobe(dot(n, H)) * uSunScale * shadow * (1.0 - foam);
  vec3 Hm = normalize(uMoonDir + V);
  float mspec = seaMoonLobe(dot(n, Hm)) * uMoonScale;
  own += seaGlints(uSunColor, spec, uMoonColor, mspec) + pointSpec * 1.2;   // WATER-LIT1: the lamps' and the torch's glints
  own += auroraRefl * (1.0 - foam);   // SKYRIM-AURORA: the curtains in the water, under no foam
  // the fogs over the water's own light at its share - the air's, then DW-C's sea fog - as a premultiplied colour takes
  // them (an affine fog of x is x * m + c; at a share s, x * m + c * s): the copy's share is left as it was drawn
  vec3 ownShare = uSceneOn == 1 ? vec3(1.0) - trans : vec3(cover);
  float fw = weatherFogAt(vWorldPos);   // BANTHA1: the weather's half - the sea's haze below is its law; the jungle's haze multiplies after
  // FAR-SEA1: THE SEA REACHES THE HORIZON. On a frame the far ring is drawn (the host sets uSeaHaze), the water at the
  // sea's own level takes the ring's haze - the world's linear ramp capped at the hold - so it no longer closes into a
  // band of solid fog in front of the ring's sea: the two meet at one haze at the streamed grid's edge. Nearer than the
  // hold the cap is the world's fog exactly; a lake or a river above the coast keeps the world's fog whole. AUDIT
  // FAR-SEA1 P3: the law's half that reaches the streamed sea is the world's own linear factor floored at 1 - hold
  // (render/horizonHaze.js: the rim opens past the grid's farthest corner) - no second distance, no second ramp; L3:
  // faded over the band's outer half, so water running down to the sea crosses into its haze without a line.
  if (uSeaHaze.x > 0.0 && uFogMode == 1) {
    float seaW = 1.0 - smoothstep(${(SEA_HAZE_BAND * 0.5).toFixed(2)}, ${SEA_HAZE_BAND.toFixed(2)}, abs(vWorldPos.y - uSeaHaze.y));
    fw = mix(fw, max(fw, 1.0 - uSeaHaze.x), seaW);
  }
  fw *= hazeAt(vWorldPos, focusOrigin());   // BANTHA1: the jungle's haze closes over the sea's floor too - no sea shows through it
  vec3 fogged = own * fw + uFogColor * (1.0 - fw) * ownShare;
  fogged = dwWaterFogAdd(fogged, vWorldPos) + dwWaterFog(vec3(0.0), vWorldPos) * ownShare;
  outColor = uSceneOn == 1 ? vec4(under * trans + fogged, edge) : vec4(fogged / max(cover, 1e-3), edge * cover);
}`;

// ═══════════════════════════════════════════════════════════════════
// WHAT A WATER DRAW CAN READ. The copy of the frame under the water (Renderer.captureUnderWater) is taken only where
// the water's fragments can read it. A sheet's box, carried through the vertex shader's own steps, bounds where its
// fragments fall; the push's own bound - REFRACT_STRENGTH over REFRACT_PATH_MAX, faded by the distance - bounds how
// far from its fragment a look lands. The copy is never read outside that part, so the rest need not be copied.
// ═══════════════════════════════════════════════════════════════════

/** The share each bound of the reach is widened by, against the GPU's single precision. */
const REACH_SLOP = 1e-3;
/** The texels a read can land past the push's own bound: the colour's second bilinear texel, the raster's sub-pixel
 *  snap and the rounding of the copy's coordinates, with one to spare. */
export const REACH_MARGIN = 3;
/** A box's twelve edges as pairs of corners, each corner numbered by its far ends (1 x, 2 y, 4 z). */
const BOX_EDGES = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7]);
/** The most the swell lifts a vertex, in multiples of its height: the trains' shares summed. */
const SWELL_SHARE = SWELL_TRAINS.reduce((sum, train) => sum + Math.abs(train[2]), 0);
const reachViewProj = new Float64Array(16);
const reachClip = new Float64Array(32);
const reachNdc = new Float64Array(4);

/**
 * A water sheet's box in its own space, [minX, minY, minZ, maxX, maxY, maxZ]: over its quads' vertices when it has
 * its own grid (`positions`), else round the `sphere` ([x, y, z, radius]) of the ground it rides. null with neither.
 * @param {ArrayLike<number>|null} indices
 * @param {ArrayLike<number>|null} [positions]
 * @param {ArrayLike<number>|null} [sphere]
 * @returns {Float64Array|null}
 */
export function waterSheetBox(indices, positions = null, sphere = null) {
  if (!indices || !indices.length) return null;
  if (!positions) {
    if (!sphere) return null;
    const radius = sphere[3];
    return Float64Array.of(
      sphere[0] - radius,
      sphere[1] - radius,
      sphere[2] - radius,
      sphere[0] + radius,
      sphere[1] + radius,
      sphere[2] + radius,
    );
  }
  const box = Float64Array.of(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity);
  for (let k = 0; k < indices.length; k++) {
    const at = indices[k] * 3;
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[at + axis];
      if (value < box[axis]) box[axis] = value;
      if (value > box[axis + 3]) box[axis + 3] = value;
    }
  }
  return box;
}

/**
 * Whether a part of the frame already copied holds a reach - each [x0, y0, x1, y1], null for the whole frame. Any
 * part holds an empty reach.
 * @param {ArrayLike<number>|null} part
 * @param {ArrayLike<number>|null} reach
 */
export function waterReachHolds(part, reach) {
  if (!part) return true;
  if (!reach) return false;
  if (reach[0] >= reach[2] || reach[1] >= reach[3]) return true;
  return part[0] <= reach[0] && part[1] <= reach[1] && part[2] >= reach[2] && part[3] >= reach[3];
}

/** Widens the reach's NDC bounds by a clip-space point; false for one at or behind the eye's own plane. */
function reachPoint(clipX, clipY, clipW) {
  if (!(clipW > 1e-6)) return false;
  const x = clipX / clipW,
    y = clipY / clipW;
  if (x < reachNdc[0]) reachNdc[0] = x;
  if (x > reachNdc[2]) reachNdc[2] = x;
  if (y < reachNdc[1]) reachNdc[1] = y;
  if (y > reachNdc[3]) reachNdc[3] = y;
  return true;
}

/**
 * The part of the frame water rows can read in the copy under them: [x0, y0, x1, y1] texels into `out`, the far edges
 * exclusive; empty when none is in view, null when a row cannot be bounded (no box, a matrix not affine). `frame`
 * holds the draw's `proj`, `view` and `eye`, its `lift` and `swell`, the viewport (`left`, `bottom`, `wide`, `high`)
 * and the copy's `width` and `height`. A box takes the vertex shader's steps and is cut at the near plane; a look is
 * pushed no farther than REFRACT_STRENGTH at REFRACT_PATH_MAX over 1 + REFRACT_FADE times its distance, then the edge.
 * @returns {Int32Array|null}
 */
export function waterRowsReach(rows, n, frame, out = new Int32Array(4)) {
  const { proj, view, eye, width, height } = frame;
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      reachViewProj[col * 4 + row] =
        proj[row] * view[col * 4] +
        proj[4 + row] * view[col * 4 + 1] +
        proj[8 + row] * view[col * 4 + 2] +
        proj[12 + row] * view[col * 4 + 3];
    }
  }
  if (!reachViewProj.every(Number.isFinite)) return null;
  const heave = Math.abs(frame.swell) * SWELL_SHARE * (1 + REACH_SLOP);
  const pushMost = REFRACT_STRENGTH * REFRACT_PATH_MAX * (1 + REACH_SLOP);
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const box = rows[i][0]?.box,
      model = rows[i][1];
    if (!box || !model || model[3] !== 0 || model[7] !== 0 || model[11] !== 0 || model[15] !== 1) return null;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let k = 0; k < 8; k++) {
      const sheetX = k & 1 ? box[3] : box[0],
        sheetY = (k & 2 ? box[4] : box[1]) + frame.lift,
        sheetZ = k & 4 ? box[5] : box[2];
      const worldX = model[0] * sheetX + model[4] * sheetY + model[8] * sheetZ + model[12],
        worldY = model[1] * sheetX + model[5] * sheetY + model[9] * sheetZ + model[13],
        worldZ = model[2] * sheetX + model[6] * sheetY + model[10] * sheetZ + model[14];
      minX = Math.min(minX, worldX);
      maxX = Math.max(maxX, worldX);
      minY = Math.min(minY, worldY);
      maxY = Math.max(maxY, worldY);
      minZ = Math.min(minZ, worldZ);
      maxZ = Math.max(maxZ, worldZ);
    }
    if (!(minX <= maxX && minY <= maxY && minZ <= maxZ)) return null;
    // the world the GPU computes in single precision, a hair either way of this one
    const pad = REACH_SLOP * 0.1 * (1 + Math.max(-minX, maxX, -minY, maxY, -minZ, maxZ));
    minX -= pad;
    maxX += pad;
    minY -= pad + heave;
    maxY += pad + heave;
    minZ -= pad;
    maxZ += pad;
    // the eye's distance to the box: no fragment of the row is nearer
    const near =
      Math.hypot(
        Math.max(minX - eye[0], 0, eye[0] - maxX),
        Math.max(minY - eye[1], 0, eye[1] - maxY),
        Math.max(minZ - eye[2], 0, eye[2] - maxZ),
      ) *
      (1 - REACH_SLOP);
    const reach = pushMost / (1 + REFRACT_FADE * near) + REFRACT_EDGE;
    for (let k = 0; k < 8; k++) {
      const worldX = k & 1 ? maxX : minX,
        worldY = k & 2 ? maxY : minY,
        worldZ = k & 4 ? maxZ : minZ;
      for (let comp = 0; comp < 4; comp++) {
        reachClip[k * 4 + comp] =
          reachViewProj[comp] * worldX +
          reachViewProj[4 + comp] * worldY +
          reachViewProj[8 + comp] * worldZ +
          reachViewProj[12 + comp];
      }
    }
    reachNdc[0] = reachNdc[1] = Infinity;
    reachNdc[2] = reachNdc[3] = -Infinity;
    for (let k = 0; k < 8; k++) {
      const at = k * 4;
      if (reachClip[at + 2] + reachClip[at + 3] < 0) continue; // behind the near plane
      if (!reachPoint(reachClip[at], reachClip[at + 1], reachClip[at + 3])) return null;
    }
    // where an edge crosses the near plane, the cut's own corner
    for (let edge = 0; edge < BOX_EDGES.length; edge += 2) {
      const from = BOX_EDGES[edge] * 4,
        to = BOX_EDGES[edge + 1] * 4;
      const nearFrom = reachClip[from + 2] + reachClip[from + 3],
        nearTo = reachClip[to + 2] + reachClip[to + 3];
      if (nearFrom < 0 === nearTo < 0) continue;
      const share = nearFrom / (nearFrom - nearTo);
      const clipX = reachClip[from] + share * (reachClip[to] - reachClip[from]),
        clipY = reachClip[from + 1] + share * (reachClip[to + 1] - reachClip[from + 1]),
        clipW = reachClip[from + 3] + share * (reachClip[to + 3] - reachClip[from + 3]);
      if (!reachPoint(clipX, clipY, clipW)) return null;
    }
    if (reachNdc[0] > reachNdc[2]) continue; // wholly behind the eye: no fragment
    const left = frame.left + (reachNdc[0] + 1) * 0.5 * frame.wide,
      right = frame.left + (reachNdc[2] + 1) * 0.5 * frame.wide,
      bottom = frame.bottom + (reachNdc[1] + 1) * 0.5 * frame.high,
      top = frame.bottom + (reachNdc[3] + 1) * 0.5 * frame.high;
    // wholly beside the viewport: no fragment either
    if (right < frame.left - REACH_MARGIN || left > frame.left + frame.wide + REACH_MARGIN) continue;
    if (top < frame.bottom - REACH_MARGIN || bottom > frame.bottom + frame.high + REACH_MARGIN) continue;
    const spreadX = reach * width + REACH_MARGIN,
      spreadY = reach * height + REACH_MARGIN;
    x0 = Math.min(x0, Math.max(left, frame.left) - spreadX);
    x1 = Math.max(x1, Math.min(right, frame.left + frame.wide) + spreadX);
    y0 = Math.min(y0, Math.max(bottom, frame.bottom) - spreadY);
    y1 = Math.max(y1, Math.min(top, frame.bottom + frame.high) + spreadY);
  }
  out.fill(0);
  if (x0 === Infinity) return out; // no row's water in view
  if (!(x0 < x1 && y0 < y1)) return null;
  out[0] = Math.max(0, Math.floor(x0));
  out[1] = Math.max(0, Math.floor(y0));
  out[2] = Math.min(width, Math.ceil(x1));
  out[3] = Math.min(height, Math.ceil(y1));
  if (!(out[0] < out[2] && out[1] < out[3])) out.fill(0);
  return out;
}
