// ASSET SOURCES: stable, domain-local resource selections.
// This module owns persistence and deterministic fallback. UI rows must only be
// exposed for domains whose runtime resolver actually calls resolveAssetSource().
import { appStorage } from './appStorage.js';

const STORAGE_KEY = 'dfjs-asset-source-selections';
const SCHEMA_VERSION = 1;

export const ASSET_SOURCE_DOMAINS = Object.freeze({
  'animation.player.walk': Object.freeze({
    label: 'Player walk animation',
    sources: Object.freeze([
      Object.freeze({ id: 'original', label: 'Original', status: 'needs-runtime-provider' }),
      Object.freeze({ id: 'vanilla', label: 'Vanilla', status: 'fallback' }),
      Object.freeze({ id: 'morrowind-animation-overhaul', label: 'Morrowind Animation Overhaul', status: 'needs-validation' }),
      Object.freeze({ id: 'simply-walking', label: 'Simply Walking', status: 'needs-validation' }),
    ]),
    defaultSource: 'vanilla',
  }),
  'animation.player.run': Object.freeze({
    label: 'Player run animation',
    sources: Object.freeze([
      Object.freeze({ id: 'original', label: 'Original', status: 'needs-runtime-provider' }),
      Object.freeze({ id: 'vanilla', label: 'Vanilla', status: 'fallback' }),
    ]),
    defaultSource: 'vanilla',
  }),
  'animation.npc.male.walk': Object.freeze({
    label: 'Male NPC walk animation',
    sources: Object.freeze([
      Object.freeze({ id: 'original', label: 'Original', status: 'needs-runtime-provider' }),
      Object.freeze({ id: 'vanilla', label: 'Vanilla', status: 'fallback' }),
    ]),
    defaultSource: 'vanilla',
  }),
  'animation.npc.female.walk': Object.freeze({
    label: 'Female NPC walk animation',
    sources: Object.freeze([
      Object.freeze({ id: 'original', label: 'Original', status: 'needs-runtime-provider' }),
      Object.freeze({ id: 'vanilla', label: 'Vanilla', status: 'fallback' }),
      Object.freeze({ id: 'simply-walking', label: 'Simply Walking', status: 'needs-validation' }),
    ]),
    defaultSource: 'vanilla',
  }),
});

function readSelections() {
  try {
    const storage = appStorage();
    if (!storage) return {};
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    return parsed?.version === SCHEMA_VERSION && parsed.selections && typeof parsed.selections === 'object'
      ? parsed.selections
      : {};
  } catch {
    return {};
  }
}

function writeSelections(selections) {
  try {
    const storage = appStorage();
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, selections }));
    return true;
  } catch {
    return false;
  }
}

/** Return the persisted source ID, or this domain's default. */
export function getAssetSource(domainId) {
  const domain = ASSET_SOURCE_DOMAINS[domainId];
  if (!domain) return null;
  const requested = readSelections()[domainId];
  return domain.sources.some((source) => source.id === requested) ? requested : domain.defaultSource;
}

/** Persist one domain only; unrelated domain selections are preserved. */
export function setAssetSource(domainId, sourceId) {
  const domain = ASSET_SOURCE_DOMAINS[domainId];
  if (!domain || !domain.sources.some((source) => source.id === sourceId)) return false;
  const selections = readSelections();
  selections[domainId] = sourceId;
  return writeSelections(selections);
}

/**
 * Runtime resolver contract. Until a source has an integrated provider, it must
 * resolve to Vanilla and report why; a UI choice alone must never imply the
 * external pack is active. Callers provide isAvailable based on actual assets.
 */
export function resolveAssetSource(domainId, { isAvailable = () => false } = {}) {
  const domain = ASSET_SOURCE_DOMAINS[domainId];
  if (!domain) return { domainId, requested: null, effective: null, fallback: false, reason: 'unknown-domain' };

  const requested = getAssetSource(domainId);
  if (requested === 'vanilla') {
    return { domainId, requested, effective: 'vanilla', fallback: false, reason: null };
  }

  const candidate = domain.sources.find((source) => source.id === requested);
  if (candidate?.status === 'integrated' && isAvailable(requested, domainId)) {
    return { domainId, requested, effective: requested, fallback: false, reason: null };
  }

  return {
    domainId,
    requested,
    effective: 'vanilla',
    fallback: true,
    reason: candidate?.status === 'needs-validation'
      ? 'source-not-integrated-or-validated'
      : 'original-provider-not-integrated',
  };
}
