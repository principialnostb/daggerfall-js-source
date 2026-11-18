import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

export function createCosmeticsServer({ origin = '*', panel = null } = {}) {
  const instance = randomBytes(12).toString('hex');
  const profiles = new Map();
  const ttl = 60_000;
  const address = /^\/v1\/([a-f0-9]{64})\/([A-Za-z0-9_-]{4,40})$/;
  return createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    for (const [id, entry] of profiles) if (entry.expires <= Date.now()) profiles.delete(id);
    const reply = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (req.method === 'GET' && req.url === '/health') return reply(200, { service: 'dfo-cosmetics', instance, players: profiles.size });
    if (req.method === 'GET' && req.url === '/' && panel && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host ?? '')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(panel);
    }
    const route = address.exec(req.url ?? '');
    if (!route) return reply(404, null);
    const key = route[0];
    const existing = profiles.get(key);
    if (req.method === 'GET') return reply(existing ? 200 : 404, existing?.profile ?? null);
    if (req.method !== 'PUT') return reply(405, null);
    const authorization = req.headers.authorization;
    if (existing && authorization !== 'Bearer ' + existing.token) return reply(403, null);
    if (!existing && profiles.size >= 4096) return reply(503, null);
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 8192) return reply(413, null);
      }
      const profile = JSON.parse(body);
      if (profile?.version !== 1 || !Array.isArray(profile.slots) || profile.slots.length > 27) return reply(400, null);
      if (profiles.get(key) !== existing) return reply(409, null);
      const token = existing?.token ?? randomBytes(24).toString('hex');
      profiles.set(key, { token, profile, expires: Date.now() + ttl });
      return reply(200, { token });
    } catch {
      return reply(400, null);
    }
  });
}

export function createCosmeticsHost(port = 8793) {
  let server;
  let running = false;
  return async (action, requestedPort = port) => {
    if (action === 'start' && !server) {
      if (!Number.isInteger(requestedPort) || requestedPort < (port === 0 ? 0 : 1) || requestedPort > 65535) {
        throw new RangeError('Укажите порт от 1 до 65535.');
      }
      const next = createCosmeticsServer();
      server = next;
      try {
        await new Promise((resolve, reject) => {
          next.once('error', reject);
          next.listen(requestedPort, '127.0.0.1', resolve);
        });
        running = true;
      } catch (error) {
        server = undefined;
        throw error;
      }
    } else if (action === 'stop' && running) {
      running = false;
      server.close();
      server.closeAllConnections();
      server = undefined;
    }
    return running ? { url: 'http://127.0.0.1:' + server.address().port } : null;
  };
}
