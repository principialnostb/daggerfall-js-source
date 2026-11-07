// @ts-check
// The lanes' packets handed to the naval host, which stands and steers them (navalHost.js liners): every
// LANE_LIST_MS, every packet of each lane a ship of which may be in reach of the player (worldLanes.js near), where
// the shared clock puts her (seaLanes.js packetsAt), in the scene. A lane's two legs in the scene - its way, and
// the way reversed - are kept while the scene's frame holds, and each port's key and name are kept by the port, so
// a list holds the same numbers a list made afresh would, without remaking what the clock does not move.
import { packetsAt } from '../../systems/naval/seaLanes.js';

/** How often the naval host is handed the list (ms). */
export const LANE_LIST_MS = 2000;

/** What `localFromWorld` reads of the streaming world's state: the map pixel the scene is laid about and the floating
 *  origin's offset along x and z. Two frames with the same four numbers put every native point at the same place. */
export const sceneFrameOf = (/** @type {{ mapOrigin: { x: number, y: number }, compensation: number[] }} */ state) => [
  state.mapOrigin.x,
  state.mapOrigin.y,
  state.compensation[0],
  state.compensation[2],
];
const sameFrame = (/** @type {number[]} */ one, /** @type {number[]} */ other) =>
  one.length === other.length && one.every((value, i) => Object.is(value, other[i]));

/**
 * @param {{ lanes: { all: () => any[], near: (lane: any, here: { x: number, y: number }) => boolean, way: (lane: any) => any },
 *   here: () => { x: number, y: number }, clock: () => number, naval: () => any, ready: () => boolean,
 *   state: { localFromWorld: (x: number, z: number) => number[] }, frame?: () => number[], now?: () => number }} deps
 *   `lanes` the world's lanes (worldLanes.js), `here` the player's map pixel, `clock` the shared clock (ms), `naval`
 *   the naval host or null, `ready` whether the map's directory stands, `state` the streaming world's, `frame` what
 *   its scene is laid by (sceneFrameOf), `now` the page's clock (ms)
 */
export function createLaneShips({
  lanes,
  here,
  clock,
  naval,
  ready,
  state,
  frame = () => sceneFrameOf(/** @type {any} */ (state)),
  now = () => performance.now(),
}) {
  let listedAt = -Infinity;
  /** @type {WeakMap<object, { laid: number[], out: number[][], home: number[][] }>} */
  const sceneLegs = new WeakMap();
  /** @type {WeakMap<object, { key: string, name: any }>} */
  const portNames = new WeakMap();
  /** Her harbour's key and name, as the naval host knows a harbour (navalHarbourNear's). */
  const portOf = (/** @type {any} */ port) => {
    if (!port) return null;
    let named = portNames.get(port);
    if (!named) portNames.set(port, (named = { key: `port:${port.id}`, name: port.name }));
    return named;
  };
  /** A way's legs in the scene, out and home: made again only where the scene's frame moved. */
  const sceneLegsOf = (/** @type {{ x: number, z: number }[]} */ pts, /** @type {number[]} */ laid) => {
    let kept = sceneLegs.get(pts);
    if (!kept || !sameFrame(kept.laid, laid)) {
      const out = pts.map((point) => state.localFromWorld(point.x, point.z));
      sceneLegs.set(pts, (kept = { laid, out, home: [...out].reverse() }));
    }
    return kept;
  };
  /** The list, once LANE_LIST_MS has passed since the last and while the host is on and the map read. */
  function step() {
    const stamp = now();
    if (stamp - listedAt < LANE_LIST_MS || !naval()?.enabled || !ready()) return;
    listedAt = stamp;
    const at = here(),
      shared = clock();
    const laid = frame();
    const list = [];
    for (const lane of lanes.all()) {
      if (!lanes.near(lane, at)) continue;
      const way = lanes.way(lane);
      if (!way) continue;
      const { out, home } = sceneLegsOf(way.pts, laid);
      for (const packet of packetsAt(lane, way, shared)) {
        const [x, z] = state.localFromWorld(packet.at.x, packet.at.z);
        const [dx, dz] = state.localFromWorld(packet.at.x + packet.dir.x, packet.at.z + packet.dir.z);
        list.push({
          id: packet.id,
          seed: packet.seed,
          seeds: packet.seeds,
          classId: packet.cls.id,
          region: packet.region,
          area: lane.a.area ?? -1,
          phase: packet.phase,
          pos: [x, 0, z],
          yaw: Math.atan2(dx - x, dz - z),
          leg: packet.leg === way.pts ? out : home,
          port: portOf(packet.port),
          to: portOf(packet.to),
          from: portOf(packet.from),
        });
      }
    }
    naval().liners(list);
  }
  return { step };
}
