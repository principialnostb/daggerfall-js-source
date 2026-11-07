// @ts-check
// THE TOYBOX IN THE WORLD: the window, the forge, the events' local runner and the offline command bar, built once
// from the few handles the world host lends. The host keeps none of the toybox's state; it asks this module for a
// chat line's answer, the map's marks, the timers' rows and a frame's work.
import { createToyboxHost } from './toyboxHost.js';
import { createItemForge } from '../ui/toybox/itemForge.js';
import { createOfflineCommandBar } from '../ui/offlineCommandBar.js';
import { parseToyboxCommand, mayToybox, TOYBOX_GLYPH } from '../systems/toybox/toyboxLaw.js';
import { setStaffPowers, staffPowers } from '../characters/playerEntity.js';
import { ghostOn, setGhost, setGhostSend } from '../systems/toybox/toyboxGhost.js';
import { toyboxGrant, toyboxGrantText } from '../net/toyboxGrant.js';
import { announceToyboxItem } from '../ui/lootBanner.js';
import { rosterRows } from '../net/roster.js';
import { createLocalToyboxEvents } from '../systems/toybox/localToyboxEvents.js';
import { startToyboxEvent, accountToyboxEvents } from '../net/toyboxEvents.js';
import { toyboxCities } from '../systems/toybox/toyboxCities.js';
import { toyboxMapMarks, toyboxTimerRows } from '../systems/toybox/toyboxMarks.js';
import { setToyboxSound } from '../systems/toybox/toyboxNews.js';
import { invasionLaugh } from '../systems/toybox/invasionRun.js';
import { storedSession, serviceBase } from '../net/accountClient.js';
import { holdCursor } from '../player/pointerLock.js';
import { LOCAL_BUILD } from '../localBuild.js';
import { REGION_NAMES } from '../formats/mapsFile.js';

/** The key that opens the offline command bar (`KeyboardEvent.code`); online the chat takes the line. */
export const TOYBOX_OFFLINE_KEY = 'Slash';
/** The hub's World list is asked again no more often than this, ms, as the player types a name. */
const WHO_EVERY_MS = 5000;
/** A local build (`npm run dev`): offline play has no service to say who is a developer, so the toybox there is the
 *  local build's alone, and offline it asks no server anything. A production page offline has no toybox. */
const LOCAL_DEV = LOCAL_BUILD;
/** Whether this is a local build, whose offline play has the toybox and its events. */
export const toyboxLocalBuild = () => LOCAL_DEV;

/**
 * @param {{ document?: any, glyphs: () => unknown, online: () => any, storage: () => any, fetch?: any,
 *   worldLink: () => any, summon: (name: string, say: (l: string) => void) => void,
 *   teleportToPlayer?: (name: string, say: (l: string) => void) => void,
 *   openTeleport: () => void, addToPack: (item: any) => void, postBox: () => any, deliver: (sev: any, room: string) => any,
 *   playerName: () => string, audio: () => any, relayNowMs: () => number, typing?: () => boolean,
 *   now?: () => number, localDev?: boolean, holdCursor?: () => () => boolean }} w
 */
export function createToyboxWorld(w) {
  const doc = w.document ?? globalThis.document;
  const now = w.now ?? (() => performance.now());
  const fetchFn = w.fetch ?? ((/** @type {any} */ url, /** @type {any} */ i) => globalThis.fetch(url, i));
  const isOnline = () => !!w.online();
  const localDev = w.localDev ?? LOCAL_DEV;
  // a key typed into a box of the page (the chat's, a popup's) is that box's, never the toybox's
  const typingInField = () => /^(INPUT|TEXTAREA|SELECT)$/.test(doc?.activeElement?.tagName ?? '') || !!doc?.activeElement?.isContentEditable;
  // online the service's signed glyphs; offline a local build's alone (`npm run dev`) - a shipped page offline has no
  // toybox, whatever it was told while it was online
  const glyphs = () => (isOnline() ? w.glyphs() : localDev ? [TOYBOX_GLYPH] : []);
  let whoAt = -Infinity;
  const players = () => {
    const link = w.worldLink();
    if (now() - whoAt > WHO_EVERY_MS) {
      whoAt = now();
      link?.sendHubWho?.();
    }
    return rosterRows(link).rows.filter((row) => !row.me).map((row) => String(row.name ?? '')).filter(Boolean);
  };
  /** @type {any[] | null} */
  let cityList = null;
  // the registry is read once, the first time a city box is typed in: it is the boot's, and it does not change
  const cities = () => (cityList ??= toyboxCities({ regionName: (region) => REGION_NAMES[region] ?? '' }));
  const clientOf = () => {
    const store = w.storage();
    const session = storedSession(store);
    return session ? { fetch: fetchFn, base: serviceBase(store), secret: session.secret, storage: store } : null;
  };
  // The mouse is held free through the game's own door while any toybox box is up: a lock the page drops by
  // itself reads to the game as the player's Escape, which closed the window the moment it opened.
  /** @type {(() => boolean) | null} */
  let letGo = null;
  const holdMouse = () => {
    if (!letGo) letGo = (w.holdCursor ?? holdCursor)();
  };
  const local = createLocalToyboxEvents({ deliver: w.deliver, name: w.playerName });
  const events = accountToyboxEvents({ fetch: fetchFn, storage: w.storage() });
  setGhostSend((on) => w.online()?.sendGhost?.(on));
  setToyboxSound((cue) => {
    const audio = w.audio();
    if (cue === 'laugh' && audio) invasionLaugh((clip, vol, pitch) => audio.playOneShot(clip, vol, pitch));
  });
  const forge = createItemForge({
    document: doc,
    online: isOnline,
    players,
    errorText: toyboxGrantText,
    onGranted: (item) => announceToyboxItem(item),
    grant: (spec, target) =>
      toyboxGrant({
        spec,
        target,
        online: isOnline(),
        io: clientOf(),
        addToPack: w.addToPack,
        claim: async (id) => {
          const box = w.postBox();
          if (!box) return { ok: false, error: 'claim' };
          await box.refresh?.();
          return box.claim(id);
        },
      }),
  });
  const powers = {
    get: () => ({ invincible: !!staffPowers().god, noclip: !!staffPowers().noclip, ghost: ghostOn() }),
    set: (/** @type {'invincible'|'noclip'|'ghost'} */ id, /** @type {boolean} */ on) => {
      if (id === 'ghost') return setGhost(on) !== false;
      setStaffPowers(id === 'invincible' ? { god: on } : { noclip: on });
      return true;
    },
  };
  const host = createToyboxHost({
    document: doc,
    glyphs,
    online: isOnline,
    powers,
    openTeleport: w.openTeleport,
    openForge: () => forge.open(),
    freeCursor: holdMouse,
    players,
    cities: () => cities().map((city) => city.name),
    summon: w.summon,
    teleportToPlayer: w.teleportToPlayer,
    startEvent: (spec) => startToyboxEvent(spec, { online: isOnline, relayOk: () => !!w.online()?.toyboxEvOk, post: events.post, local, cities }),
  });
  /** A chat or command-bar line: true when the toybox took it (a developer's /toybox), false for any other line. */
  const chat = (/** @type {string} */ text, /** @type {(l: string) => void} */ say) => {
    const parsed = parseToyboxCommand(text);
    return !!parsed && mayToybox(glyphs()) && host.command(parsed, say) !== false;
  };
  const bar = createOfflineCommandBar({
    doc,
    onSubmit: (text) => (chat(text, (line) => bar.say(line)) ? null : 'Unknown command.'),
  });
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.code !== TOYBOX_OFFLINE_KEY || isOnline() || bar.isOpen() || (w.typing ?? typingInField)()) return;
    if (!mayToybox(glyphs())) return;
    e.preventDefault();
    holdMouse();
    bar.open('/');
  };
  // heard first, on the window's capture, so no handler of the game's can stop the key before it
  const keys = doc?.defaultView ?? globalThis;
  keys?.addEventListener?.('keydown', onKey, true);
  return {
    host,
    local,
    forge,
    chat,
    /** The toybox events' map marks, beside the raids'. */
    mapMarks: () => toyboxMapMarks(w.relayNowMs()),
    /** The toybox events' rows in the timers window. */
    timerRows: () => toyboxTimerRows(w.relayNowMs()),
    /** Each frame: the local runner's clock offline; and the powers go when the developer glyph does. */
    frame() {
      if (!isOnline()) local.tick();
      if (!mayToybox(glyphs()) && (ghostOn() || staffPowers().noclip)) {
        setGhost(false);
        setStaffPowers({ noclip: false });
      }
      host.refresh();
      if (letGo && !host.isOpen() && !bar.isOpen() && !forge.isOpen()) {
        letGo();
        letGo = null;
      }
    },
    dispose() {
      keys?.removeEventListener?.('keydown', onKey, true);
      bar.dispose?.();
    },
  };
}
