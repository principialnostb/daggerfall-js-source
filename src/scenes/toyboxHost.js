// @ts-check
// THE TOYBOX'S HOST MODULE: /toybox's word, the window and its three popups, wired to what the world gives it. Only a
// developer opens it; to anyone else /toybox is an unknown command. The window closes when the dev glyph goes. Every
// power is read back from `powers.get` after a press, so the lit buttons show what took, not what was asked.
import { mayToybox, TOYBOX_ONLINE_ONLY, TOYBOX_OPTIONS } from '../systems/toybox/toyboxLaw.js';
import { createToyboxWindow } from '../ui/toybox/toyboxWindow.js';
import { createSummonPopup, createTeleportPopup, createInvasionPopup, createDragonPopup } from '../ui/toybox/toyboxPopups.js';

/** @typedef {'invincible' | 'noclip' | 'ghost'} ToyPower */
/** @typedef {{ kind: 'invasion' | 'dragon', city: string, family?: string }} ToyEventSpec */

const LABEL = Object.fromEntries(TOYBOX_OPTIONS.map((option) => [option.id, option.label]));

/** @typedef {{ get: () => Record<ToyPower, boolean>, set: (id: ToyPower, on: boolean) => (boolean | Promise<boolean>) }} ToyPowers */
/** @typedef {{ document: Document, win?: any, glyphs: () => unknown, online: () => boolean, powers: ToyPowers }} ToyBase */
/** @typedef {{ openTeleport: () => void, openForge: () => void, freeCursor?: () => void, players: () => string[], cities: () => string[] }} ToyDoors */
/** @typedef {{ summon: (name: string, say: (line: string) => void) => void, teleportToPlayer?: (name: string, say: (line: string) => void) => void, startEvent: (spec: ToyEventSpec) => Promise<{ ok: boolean, error?: string }> }} ToyActs */

/** `powers.set` answers whether the power took; `freeCursor` frees the mouse for the window. @param {ToyBase & ToyDoors & ToyActs} deps */
export function createToyboxHost(deps) {
  const { document: doc, glyphs, online, powers } = deps;
  const win = deps.win ?? doc.defaultView ?? globalThis;
  const freeCursor = deps.freeCursor ?? (() => {});
  /** @type {Set<string>} */
  const busy = new Set();
  /** @type {ReturnType<typeof createToyboxWindow> | null} */
  let box = null;
  /** @type {{ summon: any, teleport: any, invasion: any, dragon: any } | null} */
  let pops = null;
  let listening = false;

  const lit = () => {
    try {
      return powers.get() ?? {};
    } catch {
      return {};
    }
  };
  const repaint = () => box?.paint({ lit: { ...lit() }, online: !!online() });
  const closePopups = () => {
    for (const pop of Object.values(pops ?? {})) pop.close();
  };
  const anchor = () => {
    const rect = box?.el.getBoundingClientRect?.();
    return rect ? { left: rect.left, top: rect.top, width: rect.width } : null;
  };
  const popup = (/** @type {'summon' | 'teleport' | 'invasion' | 'dragon'} */ id) => {
    if (!pops) return;
    for (const [k, pop] of Object.entries(pops)) if (k !== id) pop.close();
    pops[id].open(anchor());
  };

  const toggle = async (/** @type {ToyPower} */ id) => {
    if (busy.has(id)) return;
    busy.add(id);
    const on = !lit()[id];
    let took = false;
    try {
      took = !!(await powers.set(id, on));
    } catch {
      took = false;
    }
    busy.delete(id);
    repaint();
    box?.say(took ? '' : `${LABEL[id]} could not be turned ${on ? 'on' : 'off'}.`);
  };

  const pick = (/** @type {string} */ id) => {
    if (!mayToybox(glyphs())) return close();
    if (!online() && TOYBOX_ONLINE_ONLY.includes(id)) return;
    box?.say('');
    if (id === 'invincible' || id === 'noclip' || id === 'ghost') return void toggle(id);
    if (id === 'item') deps.openForge();
    else if (id === 'summon' || id === 'teleport' || id === 'invasion' || id === 'dragon') popup(id);
  };

  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== 'Escape' || !box?.isOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    const up = Object.values(pops ?? {}).find((pop) => pop.isOpen());
    if (up) up.close();
    else close();
  };

  function make() {
    box = createToyboxWindow({ doc, win, onPick: pick, onClose: () => close() });
    pops = {
      summon: createSummonPopup({ doc, win, players: () => deps.players() ?? [], onSummon: (n, say) => deps.summon(n, say) }),
      // Open Map goes as the button went before: the toybox steps aside for the map
      teleport: createTeleportPopup({
        doc,
        win,
        players: () => deps.players() ?? [],
        online,
        onMap: () => {
          close();
          deps.openTeleport();
        },
        onToPlayer: (name, say) => (deps.teleportToPlayer ? deps.teleportToPlayer(name, say) : say('Teleport to a player needs online play.')),
      }),
      invasion: createInvasionPopup({ doc, win, cities: () => deps.cities() ?? [], onStart: (spec) => deps.startEvent(spec) }),
      dragon: createDragonPopup({ doc, win, cities: () => deps.cities() ?? [], onStart: (spec) => deps.startEvent(spec) }),
    };
  }

  function open() {
    if (!mayToybox(glyphs())) return false;
    if (!box) make();
    if (!box?.isOpen()) {
      box?.open();
      freeCursor();
    }
    if (!listening) {
      listening = true;
      win.addEventListener?.('keydown', onKey, true);
    }
    repaint();
    return true;
  }

  function close() {
    closePopups();
    if (listening) {
      listening = false;
      win.removeEventListener?.('keydown', onKey, true);
    }
    box?.close();
  }

  return {
    /** /toybox: opens the window for a developer and answers true. Anyone else's /toybox answers false, so the chat
     *  calls it an unknown command. @param {{ cmd?: string, error?: string } | null} parsed @param {(line: string) => void} say */
    command(parsed, say) {
      if (!parsed || !mayToybox(glyphs())) return false;
      if (parsed.error) {
        say(parsed.error);
        return true;
      }
      open();
      return true;
    },
    open,
    close,
    isOpen: () => !!box?.isOpen(),
    /** Re-reads the powers and the connection and repaints; closes the window if the dev glyph went. */
    refresh() {
      if (!box?.isOpen()) return;
      if (!mayToybox(glyphs())) return close();
      if (!online()) pops?.summon.close();
      pops?.teleport.refresh();
      repaint();
    },
  };
}
