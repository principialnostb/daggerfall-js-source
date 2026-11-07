// @ts-check
// The toybox's ghost, the relay's half. A developer's socket in a place turns ghost mode on and off with
// `{t:'ghost', on}`. While on, its poses and presence reach only sockets whose verified glyphs name a developer or a
// moderator; to everyone else it is gone as a hidden staff socket is (staffHidden.js): a leave when it turns on, a
// join when it turns off. Unlike a hidden socket it is still a player: its other frames are heard and it may host.
// Who may is the glyphs `_named` wrote off the verified token, never the frame's word; a refusal is answered, never
// struck. A hello may carry `gh: 1`, so a ghost crossing into a room or reconnecting never shows there. Channels and
// the hub keep their own rosters: there the frame is answered and changes nothing.
import { badged, isChatRoom, isSocialRoom } from './relay.js';
import { mayToybox } from '../../src/systems/toybox/toyboxLaw.js';

/** The glyphs that still see a ghost: a developer's and a moderator's (server-account/src/titles.js glyphsOf). */
export const GHOST_SEERS = Object.freeze(['dev', 'mod']);
/** The word a refused ghost frame is answered with. */
export const GHOST_REFUSED = 'not a developer';

/** Whether an attachment is a ghost's. @param {any} a */
export const isGhost = (a) => a?.gh === 1;
/** Whether an attachment's verified glyphs see a ghost. @param {any} b */
export const ghostSees = (b) => Array.isArray(b?.glyphs) && b.glyphs.some((glyph) => GHOST_SEERS.includes(glyph));
/** Whether `ghost` is hidden from the socket whose attachment is `viewer`. @param {any} ghost @param {any} viewer */
export const ghostHides = (ghost, viewer) => isGhost(ghost) && ghost !== viewer && !ghostSees(viewer);
/** Whether ghost mode lives in a room of this key: a place, never a channel or the hub. @param {unknown} key */
export const ghostRoom = (key) => !!key && !isChatRoom(key) && !isSocialRoom(key);

/** A hello that asked for it (`gh: 1`), from a developer, in a place: the attachment marked before any join is fanned.
 *  @param {any} room @param {any} ws @param {any} hello @param {any} who */
export function ghostHello(room, ws, hello, who) {
  if (hello?.gh !== 1 || !mayToybox(who?.glyphs)) return;
  const a = room._attach(ws);
  if (!ghostRoom(a.key) || isGhost(a)) return;
  room._setAttach(ws, { ...a, gh: 1 });
}

/** The join a ghost's return is said with: its hello's look and its latest pose, badged as every join is. @param {any} room @param {any} a */
const joinOf = (room, a) =>
  JSON.stringify(
    badged(
      { t: 'join', id: a.id, name: a.name, look: room._looks?.get(a.id) ?? null, pose: room._drawn(a, a.key).pose ?? null },
      a,
    ),
  );

/**
 * `{t:'ghost', on}`: ghost mode turned on or off by its socket, answered `{t:'ghost', on}` with what took (and `no` the
 * refusal's word when it did not). Turned on: every socket that cannot see it is told it left. Turned off: told it
 * joined. Answers what was sent to the asker (a test's).
 * @param {any} room @param {any} ws @param {any} a @param {{ on: boolean }} frame
 */
export function ghostFrame(room, ws, a, frame) {
  if (!mayToybox(a?.glyphs)) {
    const no = { t: 'ghost', on: false, no: GHOST_REFUSED };
    room._send(ws, JSON.stringify(no));
    return no;
  }
  const was = isGhost(a);
  const on = !!frame.on && ghostRoom(a.key);
  if (on !== was) {
    const next = { ...a };
    if (on) next.gh = 1;
    else delete next.gh;
    if (!room._setAttach(ws, next)) return null;
    const said = on ? JSON.stringify({ t: 'leave', id: a.id }) : joinOf(room, a);
    for (const [other, b] of [...room._all()]) {
      if (other === ws || !b.id || ghostSees(b) || room._dead?.has(other) || room._gone?.has(other)) continue;
      room._send(other, said);
    }
  }
  const out = { t: 'ghost', on };
  room._send(ws, JSON.stringify(out));
  return out;
}
