// The journal's Activity, driven as Discord's proxy drives it: a real Ed25519 key for the application, each request
// signed for the user it names, through the Worker's own door.
import { pdaRig } from './pdaRig.mjs';
import { _resetJournalDoorForTests } from '../server-account/src/journalDoor.js';

const subtle = globalThis.crypto.subtle;
const hex = (b) => Buffer.from(b).toString('hex');

/** A Discord application's key pair, and the proxy's signed headers for a user under it. */
export async function proxyKeys() {
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = hex(new Uint8Array(await subtle.exportKey('raw', kp.publicKey)));
  const sign = async (userId, { created = Math.floor(Date.now() / 1000), ttl = 300, hexSig = false, key = kp.privateKey, payload = null } = {}) => {
    const p = payload ?? { application_id: '700000000000000001', user_id: userId, is_developer: false, created_at: created, expires_at: created + ttl };
    const bytes = new TextEncoder().encode(JSON.stringify(p));
    const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, key, bytes));
    return {
      'x-signature-ed25519': hexSig ? hex(sig) : Buffer.from(sig).toString('base64'),
      'x-signature-timestamp': String(p.created_at),
      'x-discord-proxy-payload': Buffer.from(bytes).toString('base64'),
    };
  };
  return { pub, sign, kp };
}

/** A rig whose Discord key is a real one, and a way to ask the journal's door as a Discord user. */
export async function journalRig(extra = {}) {
  _resetJournalDoorForTests();
  const keys = await proxyKeys();
  const r = await pdaRig({ DISCORD_PUBLIC_KEY: keys.pub, ...extra });
  const ask = async (userId, route, body, { headers = null } = {}) => {
    const h = headers ?? (userId ? await keys.sign(userId) : {});
    const res = await r.fetch(`https://accounts.invalid/v1/journal/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...h, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const ct = res.headers.get('content-type') ?? '';
    return { status: res.status, json: ct.includes('json') ? await res.json() : null, res };
  };
  return { ...r, keys, ask };
}

