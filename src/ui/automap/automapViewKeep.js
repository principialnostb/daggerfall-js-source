// Each dungeon map keeps the view it was closed on, per dungeon, in this
// app's storage (browser or desktop). Without storage the view is not kept.

import { appStorage } from '../../systems/appStorage.js';

const VIEW_KEEP = 30;

function readAll(store) {
  try {
    const all = JSON.parse(appStorage()?.getItem(store) ?? '{}');
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch { return {}; }
}

/** The view `store` kept for dungeon `key`, or null. */
export function readKeptView(store, key) {
  if (!key) return null;
  const view = readAll(store)[key];
  return view && typeof view === 'object' ? view : null;
}

/** Keep `value` as dungeon `key`'s view; the oldest past VIEW_KEEP go. */
export function writeKeptView(store, key, value) {
  if (!key || !value) return;
  try {
    const all = readAll(store);
    delete all[key];   // re-added last: insertion order is the age
    all[key] = value;
    const keys = Object.keys(all);
    for (const oldest of keys.slice(0, Math.max(0, keys.length - VIEW_KEEP))) delete all[oldest];
    appStorage()?.setItem(store, JSON.stringify(all));
  } catch { /* storage full or refused: the view is not kept */ }
}
