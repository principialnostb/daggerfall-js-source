// The PDA rig with the relay behind it: the account service's RELAY binding answered by the relay's own Worker over its
// fake hub, the relay holding the service's public key, and one driven clock for both - so the events, the map and the
// friends screens read the hub as the deployed pair does.
import { pdaRig } from './pdaRig.mjs';
import { fakeRooms } from './fakeRoom.mjs';
import relayWorker from '../server/src/index.js';
import { SOCIAL_ROOM, SD_KEY } from '../src/net/wire.js';
import { _b64url } from '../src/net/identityToken.js';
import { _resetPdaRelayForTests } from '../server/src/pdaRelay.js';
import { _resetPdaEventsForTests } from '../server-account/src/pdaEvents.js';
import { _resetPdaFriendsForTests } from '../server-account/src/pdaFriends.js';
import { _resetPdaMapForTests } from '../server-account/src/pdaMap.js';

const { subtle } = globalThis.crypto;

/** The service and the relay together, on a clock `tick` moves. Call `done()` to put the real clock back. */
export async function pdaWorldRig(extra = {}) {
  _resetPdaRelayForTests();
  _resetPdaEventsForTests();
  _resetPdaFriendsForTests();
  _resetPdaMapForTests();
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  const r = await pdaRig({ RELAY_LAW_URL: 'https://relay.test/v1/law', ...extra });
  const world = fakeRooms({ now: () => clock });
  const hub = world.room(SOCIAL_ROOM);
  hub.store.set(SD_KEY, { s: 0, ph: 'gone', r: -1, at: clock, until: clock, next: clock + 10 * 365 * 86_400_000 });
  const relayEnv = {
    ROOMS: world.ROOMS,
    IDENTITY_PUBLIC_KEY: _b64url.encode(new Uint8Array(await subtle.exportKey('raw', r.identityPublic))),
  };
  const relayCalls = [];
  r.env.RELAY = {
    fetch: (req) => {
      relayCalls.push(new URL(req.url).pathname);
      return relayWorker.fetch(req, relayEnv);
    },
  };
  const tick = (ms = 700) => {
    clock += ms;
  };
  /** A player's game in the hub, as its verified account. */
  const online = async (who, name = who.handle) => {
    const ws = hub.connect();
    await hub.hello(ws, `peer-${name}`, null, { name, acct: who.id, asecret: `secret-of-${who.id}` });
    tick(10);
    return ws;
  };
  const social = async (ws, o) => {
    await hub.raw(ws, JSON.stringify({ t: 'social', ...o }));
    tick();
  };
  const quiet = async (fn) => {
    const info = console.info,
      warn = console.warn;
    console.info = () => {};
    console.warn = () => {};
    try {
      return await fn();
    } finally {
      console.info = info;
      console.warn = warn;
    }
  };
  return {
    ...r,
    hub,
    relayEnv,
    relayCalls,
    online,
    social,
    tick,
    quiet,
    now: () => clock,
    done: () => {
      Date.now = realNow;
    },
  };
}
