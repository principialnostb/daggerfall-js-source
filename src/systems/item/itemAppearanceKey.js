import { getPref, setPref } from '../uiPrefs.js';
const transient = new WeakMap();
// Cosmetic identity is separate from the service's valuable-item UID.
// Ordinary saved items carry it; frozen preview fixtures keep an object key.
export function itemAppearanceKey(item, create = false) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.localLookId === 'string' && item.localLookId) return item.localLookId;
  if (transient.has(item)) return transient.get(item);
  if (typeof item.uid === 'string' && item.uid) return `uid:${item.uid}`;
  if (!create) return null;
  const id = `local:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
  transient.set(item, id);
  if (Object.isExtensible(item)) item.localLookId = id;
  return id;
}
export const itemOwnStyle = (item) => item?.ownStyle ?? getPref('mwItemOwnLooks')?.[itemAppearanceKey(item)] ?? null;
export function setItemOwnStyle(item, value) {
  const key = itemAppearanceKey(item, true), looks = { ...(getPref('mwItemOwnLooks') ?? {}) };
  if (!key) return;
  looks[key] = value; setPref('mwItemOwnLooks', looks);
}

export function itemOwnStyleFields(item) {
  const ownStyle = itemOwnStyle(item);
  return ownStyle ? { ownStyle } : {};
}
