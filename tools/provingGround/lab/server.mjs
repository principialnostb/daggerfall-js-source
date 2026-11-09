import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLabDriver } from './driver.mjs';

/** Dev-only, same-origin API: no eval, no arbitrary filesystem paths, no external service. */
export function createLabPlugin() {
  let driver, bootPage;
  const pending = new Set();
  const panel = readFileSync(fileURLToPath(new URL('./panel.html', import.meta.url)));
  const plugin = { name: 'animation-lab', configureServer(server) {
    server.middlewares.use('/__lab', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (code, value) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && (path === '/' || path === '')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(panel); return; }
      if (req.method === 'GET' && path === '/boot') {
        reply(200, { ready: !!driver, pending: [...pending].slice(0, 30), page: bootPage ? await bootPage.evaluate(() => ({ title: document.title, ready: window.__shotReady === true, frame: window.__frame ?? null, text: (document.body?.innerText ?? '').slice(0, 1000) })) : null }); return;
      }
      if (req.method === 'GET' && path === '/boot-image' && bootPage) {
        res.setHeader('Content-Type', 'image/png'); res.end(await bootPage.screenshot({ type: 'png' })); return;
      }
      if (!driver) { reply(503, { ok: false, error: 'Game is still loading' }); return; }
      if (req.method === 'GET' && path === '/image') {
        const image = driver.image(); if (!image) { reply(404, { error: 'Load a scenario first' }); return; }
        res.setHeader('Content-Type', 'image/png'); res.end(image); return;
      }
      if (req.method !== 'POST' || path !== '/command') { reply(404, { error: 'Unknown lab route' }); return; }
      // The browser panel and CLI are same-origin. Refuse cross-site commands, including simple-form requests.
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) { reply(415, { error: 'JSON required' }); return; }
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { reply(403, { error: 'Same origin required' }); return; }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 65536) { reply(413, { error: 'Request too large' }); return; } }
      const { command, args } = JSON.parse(body);
      reply(200, { ok: true, value: await driver.command(command, args) });
    } catch (error) { reply(400, { ok: false, error: error.message }); }
    });
  } };
  return { plugin, watch(page) {
    if (bootPage === page) return;
    pending.clear();
    bootPage = page;
    page.on('request', (r) => pending.add(r.url()));
    page.on('requestfinished', (r) => pending.delete(r.url()));
    page.on('requestfailed', (r) => pending.delete(r.url()));
  }, attach(options) { driver = createLabDriver(options); return driver; } };
}
