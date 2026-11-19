import { captureCosmeticProfile } from './captureProfile.js';

import { getPref } from '../../systems/uiPrefs.js';
import { normalizeCosmeticsUrl } from './endpoint.js';

const localDev = import.meta.env?.DEV
  && ['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname);
const configuredEndpoint = import.meta.env?.VITE_COSMETICS_URL
  ?? (localDev ? 'http://127.0.0.1:8793' : undefined);

let lastPublished = null;
let lastPublishFailure = null;
export const cosmeticPublishError = (url) => lastPublishFailure?.url === url ? lastPublishFailure.error : null;
export const cosmeticPublishStatus = (url) => lastPublished?.url === url && Date.now() - lastPublished.at < 15_000;

function readToken(scope) {
  try { return globalThis.sessionStorage?.getItem('cosmetics:' + scope) ?? null; }
  catch { return null; }
}

function rememberToken(current, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) return;
  current.token = token;
  try { globalThis.sessionStorage?.setItem('cosmetics:' + current.scope, token); }
  catch { /* storage may be disabled */ }
}

const roomKey = async (scope) => {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const request = (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(5000) });

export function createCosmeticPeers(configuredUrl) {
  const endpoint = configuredUrl?.replace(/\/+$/, '');
  let state = null;
  return function decorate(session, entity, peers, now) {
    if (!endpoint || !session?.id || session.status !== 'open' || !session.room || !globalThis.crypto?.subtle) return peers;
    const scope = JSON.stringify([endpoint, session.url, session.id]);
    if (state?.scope !== scope) {
      state = { scope, key: roomKey(session.url), next: 0, token: readToken(scope), profiles: new Map() };
    }
    const current = state;
    if (now >= current.next && !current.pending) {
      current.next = now + (session.visualPose && peers.length ? 100 : 5000);
      if (!current.profile || now >= current.profileAt + 5000) {
        current.profile = captureCosmeticProfile(entity);
        current.profileAt = now;
      }
      const localPose = session.visualPose?.();
      const profile = { ...current.profile, ...(localPose ? { motion: {
        seq: Date.now(), room: session.room, mair: localPose.mair ?? 0, mcr: localPose.mcr ?? 0,
        an: localPose.an ?? 0, bms: localPose.bms ?? 0, bhm: localPose.bhm ?? 0, bst: localPose.bst, bsr: localPose.bsr,
      } } : {}) };
      current.pending = current.key.then(async (hash) => {
        const base = endpoint + '/v1/' + hash + '/';
        const headers = { 'content-type': 'application/json' };
        if (current.token) headers.authorization = 'Bearer ' + current.token;
        const visible = peers;
        const update = request(base + session.id, { method: 'PUT', headers, body: JSON.stringify(profile) })
          .then(async (res) => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            rememberToken(current, (await res.json()).token);
            current.failureDelay = 0;
            lastPublished = { url: endpoint, at: Date.now() };
            lastPublishFailure = null;
          })
          .catch((error) => {
            current.failureDelay = Math.min(30_000, (current.failureDelay || 500) * 2);
            current.next = Math.max(current.next, now + current.failureDelay);
            lastPublishFailure = { url: endpoint, error: error.message };
          });
        const candidates = visible.filter(({ id }) => /^[A-Za-z0-9_-]{4,40}$/.test(id));
        const start = (current.offset ?? 0) % (candidates.length || 1);
        const batch = candidates.slice(start, start + 8);
        current.offset = start + batch.length;
        const reads = batch.map(async ({ id }) => {
          try {
            const res = await request(base + id);
            if (res.status === 404) {
              current.profiles.delete(id);
              return;
            }
            if (!res.ok) return;
            const value = await res.json();
            if (value?.version !== 1 || !Array.isArray(value.slots)) return;
            const motion = value.motion;
            delete value.motion;
            const key = JSON.stringify(value);
            const old = current.profiles.get(id);
            if (old?.key === key) old.expires = now + 60_000;
            else current.profiles.set(id, { key, value, look: null, base: null, expires: now + 60_000,
              motion: old?.motion, motionUntil: old?.motionUntil });
            const entry = current.profiles.get(id);
            if (Number.isSafeInteger(motion?.seq) && motion.seq !== entry.motion?.seq) {
              entry.motion = motion;
              entry.motionUntil = now + 1500;
            }
          } catch {
            // Keep the last confirmed profile until its lease expires.
          }
        });
        const ids = new Set(visible.map(({ id }) => id));
        for (const id of current.profiles.keys()) if (!ids.has(id)) current.profiles.delete(id);
        await Promise.all([update, ...reads]);
      }).catch(() => {}).finally(() => { current.pending = null; });
    }
    if (!current.profiles.size) return peers;
    return peers.map((peer) => {
      const entry = current.profiles.get(peer.id);
      if (!peer.look || !entry || entry.expires <= now) return peer;
      if (entry.base !== peer.look) {
        entry.base = peer.look;
        entry.look = { ...peer.look, cosmetic: entry.value, cosmeticKey: entry.key };
      }
      return { ...peer, look: entry.look, shown: cosmeticMotion(peer.shown, entry, session.room, now) };
    });
  };
}

let activeEndpoint;
let decorate;
export function cosmeticPeers(session, entity, peers, now) {
  const preference = getPref('cosmeticsServerUrl');
  const endpoint = normalizeCosmeticsUrl(preference ?? configuredEndpoint ?? '');
  if (!decorate || endpoint !== activeEndpoint) {
    activeEndpoint = endpoint;
    decorate = createCosmeticPeers(endpoint);
  }
  return decorate(session, entity, peers, now);
}


export function cosmeticMotion(shown, entry, room, now) {
  const m = entry.motion;
  if (!shown || !m || m.room !== room || !(now < entry.motionUntil)) return shown;
  const result = { ...shown };
  const an = shown.an ?? 0;
  entry.appliedAn ??= an;
  if (an !== entry.appliedAn && m.an !== an) {
    if (entry.waitAn !== an) { entry.waitAn = an; entry.waitUntil = now + 250; }
    if (now < entry.waitUntil) result.an = entry.appliedAn;
    else entry.appliedAn = an;
  } else { entry.appliedAn = an; entry.waitAn = null; }

  if ([0, 1, 2, 3].includes(m.mair)) result.mair = m.mair;
  if (m.mcr === 0 || m.mcr === 1) result.mcr = m.mcr;
  if (m.an === (shown.an ?? 0) && Number.isInteger(m.bms) && m.bms > 0 && m.bms <= 2500
      && Number.isInteger(m.bhm) && m.bhm >= 0 && m.bhm <= m.bms) {
    result.bms = m.bms;
    result.bhm = m.bhm;
    if (m.bsr === 0 || m.bsr === 1) result.bsr = m.bsr;
    if (Number.isFinite(m.bst) && m.bst > 0 && m.bst <= 2) result.bst = m.bst;
  }
  return result;
}
