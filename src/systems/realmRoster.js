// @ts-check
// The account's online characters as this device last heard them: the realm's list rows, kept per account so the
// Online door draws its tiles at once and asks the realm only to bring them up to date. A save that lands writes its
// tile's summary here too. Only the list's own fields are kept, never a save.

export const REALM_ROSTER_PREFIX = 'dagger.realm.roster.';

const keyOf = (/** @type {string} */ player) => `${REALM_ROSTER_PREFIX}${player}`;
/** A row as kept: "Playing now" is the moment's, so it is never kept. */
const keptRow = (/** @type {any} */ row) => { const { playing: _playing, ...rest } = row ?? {}; return rest; };

/**
 * The kept roster of `player`'s account, or null when this device has none.
 * @param {any} storage @param {string | null | undefined} player
 * @returns {{ characters: any[], max: number } | null}
 */
export function readRoster(storage, player) {
  if (!player) return null;
  try {
    const kept = JSON.parse(storage?.getItem?.(keyOf(player)) ?? 'null');
    if (!kept || !Array.isArray(kept.characters)) return null;
    return { characters: kept.characters.filter((r) => r && typeof r.id === 'string'), max: Number.isSafeInteger(kept.max) ? kept.max : 0 };
  } catch { return null; }
}

/** The realm's own list, kept as it answered. @param {any} storage @param {string | null | undefined} player @param {{ characters: any[], max: number }} list */
export function keepRoster(storage, player, { characters, max }) {
  if (!player || !Array.isArray(characters)) return false;
  try { storage?.setItem?.(keyOf(player), JSON.stringify({ characters: characters.map(keptRow), max })); return true; } catch { return false; }
}

/** One character's row changed in place; a roster this device never kept stays unkept. */
function patchRoster(/** @type {any} */ storage, /** @type {string | null | undefined} */ player, /** @type {(rows: any[]) => any[]} */ edit) {
  const kept = readRoster(storage, player);
  if (!kept) return false;
  return keepRoster(storage, player, { characters: edit(kept.characters), max: kept.max });
}

/** A save of `id` landed: its tile shows the summary it carried. @param {any} storage @param {string | null | undefined} player @param {string} id @param {any} summary @param {number} [atMs] */
export function rosterSaved(storage, player, id, summary, atMs = Date.now()) {
  return patchRoster(storage, player, (rows) => rows.map((r) => (r.id !== id ? r
    : { ...r, ...(summary ? { summary: { ...r.summary, ...summary } } : {}), bytes: Math.max(1, r.bytes ?? 0), updatedAt: Math.floor(atMs / 1000) })));
}

/** `id` is gone from the realm (deleted, or its bringing in undone). @param {any} storage @param {string | null | undefined} player @param {string} id */
export function rosterDropped(storage, player, id) {
  return patchRoster(storage, player, (rows) => rows.filter((r) => r.id !== id));
}

/** The account signed out: its kept tiles leave the device with its session. @param {any} storage @param {string | null | undefined} player */
export function forgetRoster(storage, player) {
  if (!player) return false;
  try { storage?.removeItem?.(keyOf(player)); return true; } catch { return false; }
}
