// @ts-check
// HARBOUR-BOOK (2026-10-04, from the field: the port towns' new docks "missing" for some players) - THE HARBOURS FOUND
// NEAR THE PLAYER, ONE BOOK FOR THE QUAYS AND THE SEA. SHIP-LIFE's harbours (shipLife.js findHarbour) were the naval
// host's own Map, sounded in its frame alone - and that frame runs only while Naval Combat and Come Sail Away do, so a
// player with either off stood no quay in any port. A port's quays are its town's, not the sea fight's: the harbours are
// kept here, the world host sounds them every exterior frame whatever runs on the water, and the quays
// (scenes/quayPool.js) and the naval host (its moored ships, its docking, its errands) read the same book.
//
// ITS LIFE (navalHost.js harbourFrame's, moved whole): every port town within SEA_RING of the player (RPT1026-WORLD
// FAR-QUAY, harbourOf below; `harbourNear` - its key, name, footprint in the scene and whether every pixel the sounding
// reads is built) is sounded once that ground is built (AUDIT HOLDINGS O1: a pixel not built reads as land); a port that
// gave no harbour is sounded again HARBOUR_RETRY_S later (AUDIT SHIP-LIFE B7); the berths move with the floating origin
// (`offsetAll`), and the book is emptied at a transition, a jump and a load (`clear`). A naval host made without a book
// (its tests) keeps one of its own and steps it in its frame, as before.
//
// FB1020c HARBOUR-REACH (the field, 2026-10-20: "a lot of harbor towns dont have harbors dispite being along the coast"):
// ONE REACH FOR BOTH LAWS. A port town is one the open sea bears on within SEA_RING map pixels (world/portSites.js
// portTownOnSea), and its harbour was sounded within HARBOUR_REACH (420 m) of its footprint alone. DFU's kernel lays the
// shore of a high coast, or of a town that fills its pixel, far past that: 37 of the 106 port towns sounded no harbour -
// Daggerfall, Sentinel and Wayrest among them (shores 1.5 km, 700 m and 1.1 km off). A Bay port whose own shore gives no
// berth is sounded again out to the ring the port law read (`portRingReach`), once its ground is built (an unbuilt pixel
// reads as land) and once a book's life (the scan is some five times the near one's): 36 of the 37 stand a harbour, and
// Aldbrugh by the ring's square (ALDBRUGH-QUAY). An isle's port past the Veil sounds its own (AUDIT CAPTAIN'S SEA H1).
//
// PORT-SHIPS (2026-10-27, Solitude's ships inside its walls): A BERTH STANDS WHERE A SHIP CAN (shipLife.js berthStands) -
// the town keeps its ships out (`near.keep`, systems/naval/harbourKeep.js) and her waterplane floats over ground under the
// sea's top (`deps.ground`, as navalIsWater reads it). Either missing asks nothing of it.
//
// Not a DFU member. Ledger A (QUAYS).
import { findHarbour, offsetHarbour, HARBOUR_REACH } from './shipLife.js';
import { buildsStamp } from './navalShips.js';
import { SEA_RING } from '../../world/portSites.js';
import { TERRAIN_SIZE, sampleKernel, HEIGHTMAP_DIMENSION } from '../../world/terrain/terrainSampler.js';
import { sampleHeight, isWaterHeight } from '../../world/terrain/terrainTiles.js';
import { locationWorldRect } from '../../world/streamingWorld.js';

/** AUDIT SHIP-LIFE B7: a port whose shore gave no harbour is sounded again after this (s) - the terrain streams in
 *  nearest-first, and a harbour sounded on arrival met unbuilt water. */
export const HARBOUR_RETRY_S = 10;

/** FB1020c HARBOUR-REACH: the reach (m) off a town's footprint `rect` that sounds the pixels within SEA_RING of its own -
 *  the ring the port law reads (a town's footprint stands at its pixel's middle, DFU's TerrainHelper's tile origin). */
export const portRingReach = (rect) =>
  (SEA_RING + 0.5) * TERRAIN_SIZE - Math.max(rect.maxX - rect.minX, rect.maxZ - rect.minZ) / 2;

/**
 * RPT1026-WORLD FAR-QUAY (a private report, 2026-10-24: sailing from one port to another, no other port's docks stood,
 * so most of the harbour office's contracts could not be done): THE FAR HARBOUR IS SOUNDED FROM THE SEA. HARBOUR-REACH
 * (above) sounds a Bay port whose own shore gives no berth out to the port law's ring - and two things kept a ship come
 * in from the sea from ever seeing it. The port was asked only of the pixels about the player's own (scenes/world.js
 * navalHarbourNear's 3 x 3), and 7 of the 36 such ports lay their harbour's first berth 2 pixels off the town -
 * Daggerfall, Wayrest, Holwych, Ripmore, Isfakabi, Pencart and Gallocart: a ship at that berth was near no port. And the
 * ring's every pixel had to be built, while the streamed world stands DFU's TerrainDistance (3) about the player: from
 * that berth 5 of the ring's 25 pixels, on the town's far side, never were. So:
 * - HARBOUR_TOWN_ORDER: the pixels the port is looked for on, out to SEA_RING - the 3 x 3 first, in the order it was
 *   always walked (so a port within a pixel is the one it always was), then the ring's band.
 * - harbourKnown: a point of the sounding is known where its pixel is built - or where it is DRY FOR CERTAIN
 *   (`dryPixel`). An unbuilt pixel reads as land (AUDIT HOLDINGS O1), and where no build can stand water the land it
 *   reads is the truth: the harbour sounded is the one the whole ring's ground gives, to the bit, whichever way the
 *   player came. Measured over the 36 (the player's own data, test/portTerrain.mjs): a ship at each first berth, at
 *   TerrainDistance 3, has every ring pixel built or dry.
 * Not a DFU member (QUAYS, above).
 */
export const HARBOUR_TOWN_ORDER = Object.freeze(
  (() => {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(Object.freeze([dx, dy]));
    for (let dy = -SEA_RING; dy <= SEA_RING; dy++) {
      for (let dx = -SEA_RING; dx <= SEA_RING; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 1) out.push(Object.freeze([dx, dy]));
    }
    return out;
  })(),
);

/** RPT1026-WORLD FAR-QUAY: each height map's answers, a pixel's at its key - the map never changes under a session. */
const DRY = new WeakMap();
/**
 * RPT1026-WORLD FAR-QUAY: WHETHER NO BUILD OF MAP PIXEL (px, py) CAN STAND WATER A SHIP FLOATS IN. A terrain tile shows
 * water at a corner whose sample is at or under the ocean's elevation (terrainTiles.js isWaterHeight, the tile job's
 * own compare, on DFU's own samples - AUDIT LANDFORMS D3), and the kernel read without its ground noise
 * (terrainSampler.js sampleKernel, `groundNoise` false) is a strict lower bound of every sample (SPAWN-SHORE's
 * reading): where that bound stands over the ocean everywhere, no corner is water, a location's flattening (a lerp
 * toward the pixel's mean, itself over the line) keeps it so, and Deep Waters carves only under water. A river or a
 * stream painted across such a pixel is water too narrow for any hull's footprint or any harbour's mouth, its floor a
 * river's over the sea. Off the map: never certain. Kept per pixel; read only until a wet sample answers it.
 * @param {any} woods the loaded WoodsFile @param {number} px @param {number} py
 */
export function dryPixel(woods, px, py) {
  if (!woods || !(px >= 0 && py >= 0 && px < 1000 && py < 500)) return false;
  let memo = DRY.get(woods);
  if (!memo) DRY.set(woods, (memo = new Map()));
  const key = py * 1000 + px;
  let d = memo.get(key);
  if (d !== undefined) return d;
  const k = sampleKernel(woods, px, py, HEIGHTMAP_DIMENSION, false);
  d = true;
  for (let x = 0; x < HEIGHTMAP_DIMENSION && d; x++)
    for (let y = 0; y < HEIGHTMAP_DIMENSION && d; y++) d = !isWaterHeight(sampleHeight(Math.fround(k(x, y))));
  memo.set(key, d);
  return d;
}

/**
 * RPT1026-WORLD FAR-QUAY: whether a sounding's scene point (x, z) reads ground it can trust - `built(x, z)` (the world's
 * built pixel there, scenes/world.js csaPixelAt) or, unbuilt, a pixel `dryPixel` answers for. `state` the streaming
 * world's (its origin and compensation: the scene's pixel, csaPixelAt's own law).
 * @param {(x: number, z: number) => any} built @param {{ mapOrigin: { x: number, y: number }, compensation: number[] }} state
 * @param {any} woods @param {number} x @param {number} z
 */
export function harbourKnown(built, state, woods, x, z) {
  if (built(x, z)) return true;
  const c = state.compensation;
  return dryPixel(
    woods,
    state.mapOrigin.x + Math.floor((x - c[0]) / TERRAIN_SIZE),
    state.mapOrigin.y - Math.floor((z - c[2]) / TERRAIN_SIZE),
  );
}

/**
 * RPT1026-WORLD FAR-QUAY: a port town as the book is handed it - `t` its town (`{ id, loc, x, y, name?, reach? }`: its
 * location, its map pixel, an isle's own reach), answered as `{ key, name, rect, ready, reach, groundOver }`: its
 * footprint in the scene NOW (the native rect, locationWorldRect, through the floating origin's localFromWorld), its
 * readiness at any reach and its built ground (builtGround). The book is handed every port town near the player: a far
 * harbour's first berth can lie within a pixel of another port (Pencart's of Longham).
 * AUDIT HOLDINGS O1: the readiness - whether every pixel the harbour's scan reads (the rect grown HARBOUR_REACH) is known:
 * a pixel not built reads as land, so a harbour sounded early found its shore at the streamed world's edge and two
 * players arriving by different roads found different berths and stood different quays; asked only before it is
 * sounded. FB1020c HARBOUR-REACH: or at the port law's ring's reach (portRingReach). `state` the streaming world's,
 * `built` the world's built pixel at a scene point (scenes/world.js csaPixelAt), `woods` the height map (harbourKnown).
 * @param {{ id: any, loc: any, x: number, y: number, name?: string|null, reach?: number }} t
 * @param {{ state: any, built: (x: number, z: number) => any, woods: any }} deps
 */
/** RPT1026-WORLD FAR-QUAY: how far inside its box's far edges a readiness reads (m). */
export const EDGE_IN = 0.01;
export function harbourOf(t, { state, built, woods }) {
  const r = locationWorldRect(t.loc, t.x, t.y);
  const [ax, az] = state.localFromWorld(r.minX, r.minZ),
    [bx, bz] = state.localFromWorld(r.maxX, r.maxZ);
  const rect = { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
  const reach = t.reach ?? HARBOUR_REACH; // AUDIT CAPTAIN'S SEA H1: an isle port's sounding reaches its shore
  const ready = (r = reach) => {
    const x0 = rect.minX - r,
      z0 = rect.minZ - r,
      sx = rect.maxX - rect.minX + 2 * r,
      sz = rect.maxZ - rect.minZ + 2 * r;
    const nx = Math.ceil(sx / 400),
      nz = Math.ceil(sz / 400); // under 400 m apart, both edges read: no pixel (819.2 m) between two
    // RPT1026-WORLD FAR-QUAY: the box half-open - its far edges a hair inside it (EDGE_IN): the ring's own far edge is a
    // pixel's edge, and a point ON it was read as the next pixel's, one past the ring the port law reads
    for (let i = 0; i <= nx; i++)
      for (let k = 0; k <= nz; k++)
        if (
          !harbourKnown(
            built,
            state,
            woods,
            x0 + Math.min((sx * i) / nx, sx - EDGE_IN),
            z0 + Math.min((sz * k) / nz, sz - EDGE_IN),
          )
        )
          return false;
    return true;
  };
  const groundOver = (box) => builtGround(state, built, box); // a retry reads whether the ground its sounding read stands
  return { key: `port:${t.id}`, name: t.name ?? null, rect, ready, reach, groundOver }; // SHIP-TAGS: her name, the words a ship bound there is read by
}

/** Each object the built ground names, by a number, so a kept reading of the ground holds no pixel the world let go. */
const groundIds = new WeakMap();
let lastGroundId = 0;
const groundIdOf = (thing) => {
  if (thing === null || (typeof thing !== 'object' && typeof thing !== 'function')) return thing;
  let found = groundIds.get(thing);
  if (found === undefined) groundIds.set(thing, (found = ++lastGroundId));
  return found;
};

/**
 * The built ground over a scene box `[minX, minZ, maxX, maxZ]` as it stands: the frame (the compensation and the map
 * origin a scene point's pixel is read through), then for each pixel the box touches the built pixel there and what the
 * sea's water law and the ground's height read of it - its tile map, its heights, its ring class, its carved sea. Two
 * equal answers mean every point in the box reads as it did, so a sounding over it answers as it did.
 * @param {{ mapOrigin: { x: number, y: number }, compensation: number[] }} state
 * @param {(x: number, z: number) => any} built @param {number[]} box
 */
export function builtGround(state, built, box) {
  const comp = state.compensation,
    origin = state.mapOrigin;
  const out = [comp[0], comp[1], comp[2], origin.x, origin.y];
  if (!(box[0] <= box[2] && box[1] <= box[3])) return out;
  const west = Math.floor((box[0] - comp[0]) / TERRAIN_SIZE),
    east = Math.floor((box[2] - comp[0]) / TERRAIN_SIZE);
  const south = Math.floor((box[1] - comp[2]) / TERRAIN_SIZE),
    north = Math.floor((box[3] - comp[2]) / TERRAIN_SIZE);
  for (let k = south; k <= north; k++) {
    for (let i = west; i <= east; i++) {
      const pixel = built(comp[0] + (i + 0.5) * TERRAIN_SIZE, comp[2] + (k + 0.5) * TERRAIN_SIZE);
      out.push(
        groundIdOf(pixel ?? null),
        groundIdOf(pixel?.tilemapBytes),
        groundIdOf(pixel?.samples),
        pixel?._stride,
        groundIdOf(pixel?.deepWaters),
      );
    }
  }
  return out;
}

/** Widen `box` to hold scene point (x, z). A point off every finite pixel reads no pixel, so it is left out. */
function widenBox(box, x, z) {
  if (!(Number.isFinite(x) && Number.isFinite(z))) return;
  if (x < box[0]) box[0] = x;
  if (z < box[1]) box[1] = z;
  if (x > box[2]) box[2] = x;
  if (z > box[3]) box[3] = z;
}

/** The most keep answers a near sounding keeps for its retry, each asked again there. A port whose sounding asks its keep
 *  more often than this is sounded again at each retry. */
export const KEEP_ASKS = 8192;

/** What a near sounding over `box` read: the town's footprint, its reach, the hulls' builds, the ground over the box,
 *  whether it had a keep and the keep's answers in the order asked (`asked`: x, z, answer) - or null for a port that
 *  cannot name its ground (`groundOver`, harbourOf's) or whose keep was asked past KEEP_ASKS. */
function groundRead(near, reach, box, keep, asked) {
  if (typeof near.groundOver !== 'function' || (asked && asked.length > 3 * KEEP_ASKS)) return null;
  const rect = near.rect;
  return {
    box,
    reach,
    rect: [rect.minX, rect.minZ, rect.maxX, rect.maxZ],
    builds: buildsStamp(),
    ground: near.groundOver(box),
    keep: !!keep,
    asked,
  };
}

/** Whether a sounding now would get every answer `read` got: the same footprint, reach and hulls, the same ground over
 *  the box it read, and its keep's same answers where it asked them. A sounding reads nothing else, and the same answers
 *  lead it to the same questions, so it would give the harbour it gave. */
function groundHeld(read, near, reach) {
  if (!read || typeof near.groundOver !== 'function' || read.reach !== reach || read.builds !== buildsStamp())
    return false;
  const rect = near.rect,
    was = read.rect;
  if (!Object.is(rect.minX, was[0]) || !Object.is(rect.minZ, was[1])) return false;
  if (!Object.is(rect.maxX, was[2]) || !Object.is(rect.maxZ, was[3])) return false;
  const keep = near.keep ?? null;
  if (!!keep !== read.keep) return false;
  const now = near.groundOver(read.box);
  if (now.length !== read.ground.length) return false;
  for (let i = 0; i < now.length; i++) if (!Object.is(now[i], read.ground[i])) return false;
  const asked = read.asked;
  for (let i = 0; asked && i < asked.length; i += 3) if (!keep(asked[i], asked[i + 1]) !== !asked[i + 2]) return false;
  return true;
}

/**
 * `ready(reach)`: every pixel a sounding to `reach` (m; its own when unnamed) reads is built, or dry for certain
 * (harbourKnown). RPT1026-WORLD FAR-QUAY: `harbourNear` may answer a list, a port a town, each sounded as one always was.
 * @param {{
 *   harbourNear: () => ({ key: string, name?: string|null, rect: { minX: number, maxX: number, minZ: number, maxZ: number },
 *     ready?: (reach?: number) => boolean, reach?: number, keep?: ?((x: number, z: number) => boolean),
 *     groundOver?: (box: number[]) => any[] } | null),
 *   isWater: (x: number, z: number, hull: number) => boolean, ground?: (x: number, z: number) => number,
 * }} deps
 */
export function createHarbourBook(deps) {
  /** key -> { key, name, harbour (findHarbour's, or null: a port with no shore to berth at), at (when it was sounded),
   *  far (FB1020c HARBOUR-REACH: whether the port law's ring was sounded), read (what its last near sounding read,
   *  groundRead's, while it has no harbour) } */
  const book = new Map();

  /** Sound the port near the player: once its ground is built, and again HARBOUR_RETRY_S after a sounding that found
   *  no harbour, if anything that sounding read has changed (groundHeld). FB1020c HARBOUR-REACH: a Bay port whose own
   *  shore gave none, out to the port law's ring once that ground is built. `clock` in seconds. */
  function step(clock) {
    const near = deps.harbourNear() ?? null;
    if (!near) return;
    for (const one of Array.isArray(near) ? near : [near]) stepOne(one, clock); // RPT1026-WORLD FAR-QUAY: every port near
  }
  /** One port's sounding (step's, for each port the host names). */
  function stepOne(near, clock) {
    const own = near.reach ?? HARBOUR_REACH;
    /** What the near sounding read, once one is made this step (groundRead's, null where it cannot be kept). */
    let read;
    const sound = (reach = own, square = false) => {
      // the near sounding keeps the box of the points it asks and its keep's answers: a retry tells whether any moved
      const box = reach === own && !square ? [Infinity, Infinity, -Infinity, -Infinity] : null;
      const keep = near.keep ?? null,
        asked = box && keep ? [] : null;
      const groundAt = deps.ground;
      const harbour = findHarbour({
        rect: near.rect,
        isWater: (x, z, h) => {
          if (box) widenBox(box, x, z);
          return deps.isWater(x, z, h);
        },
        reach,
        square,
        keep: asked
          ? (x, z) => {
              const a = keep(x, z);
              if (asked.length <= 3 * KEEP_ASKS) asked.push(x, z, a ? 1 : 0);
              return a;
            }
          : keep,
        ground: groundAt
          ? (x, z) => {
              if (box) widenBox(box, x, z);
              return groundAt(x, z);
            }
          : null,
      }); // AUDIT CAPTAIN'S SEA H1: an isle port's own reach; PORT-SHIPS: its town's keep and the ground
      if (box) read = groundRead(near, own, box, keep, asked);
      return harbour;
    };
    const h = book.get(near.key);
    if (!h) {
      if (near.ready?.() !== false)
        book.set(near.key, { key: near.key, name: near.name ?? null, harbour: sound(), at: clock });
    } else if (!h.harbour && clock - h.at >= HARBOUR_RETRY_S && near.ready?.() !== false) {
      // ground that reads as it did gives the harbour it gave: no sounding, and the next retry as late as ever
      if (!groundHeld(h.read, near, own)) h.harbour = sound();
      h.at = clock;
    }
    const e = book.get(near.key),
      far = own === HARBOUR_REACH ? portRingReach(near.rect) : 0;
    if (e && read !== undefined) e.read = read;
    if (e && !e.harbour && !e.far && far > own && near.ready?.(far) !== false) {
      e.harbour = sound(far) ?? sound(far, true);
      e.far = true;
    } // ALDBRUGH-QUAY: and its corners where the round reach finds no shore
    if (e?.harbour) e.read = null; // a port with a harbour is never sounded again: what it read is let go
  }
  /** The world moved (the floating origin): every harbour's berths, approaches and mouth with it, in place. */
  function offsetAll(o) {
    for (const h of book.values()) offsetHarbour(h.harbour, o);
  }
  /** A transition, a jump, a load: every harbour forgotten, to be sounded again where the world is next. */
  function clear() {
    book.clear();
  }
  /** The harbours with berths, for the quays - `[{ key, name, harbour }]`. */
  function list() {
    const out = [];
    for (const h of book.values())
      if (h.harbour?.berths?.length) out.push({ key: h.key, name: h.name ?? null, harbour: h.harbour });
    return out;
  }
  return { step, offsetAll, clear, list, get: (key) => book.get(key), values: () => book.values() };
}
