import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLabDriver } from './driver.mjs';

/** Dev-only, same-origin API: no eval, no arbitrary filesystem paths, no external service. */
export function createLabPlugin() {
  let driver, bootPage, attached = null;
  const pending = new Set();
  const here = (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)));
  /** THE LAB AS IT STANDS ON DISK NOW, the game left running - the page's kits laid in again and a fresh driver
   *  over fresh scenario and reading modules. A boot costs minutes; a reload costs none. The run and the edits end. */
  const reload = async () => {
    if (!attached) throw new Error('Game is still loading');
    await driver?.close();
    await attached.reinject?.();
    const v = Date.now(), fresh = (name) => import(new URL(`./${name}.mjs?v=${v}`, import.meta.url).href);
    const [model, measure, made] = await Promise.all([fresh('model'), fresh('measure'), fresh('driver')]);
    driver = made.createLabDriver({ ...attached, modules: { model, measure } });
    return { reloaded: new Date().toISOString() };
  };
  const plugin = { name: 'animation-lab', configureServer(server) {
    server.middlewares.use('/__lab', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (code, value) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && (path === '/' || path === '')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(here('panel.html')); return; }
      // an empty page of this origin: the ground stores the player's data from it without loading the site's own front page
      if (req.method === 'GET' && path === '/blank') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>lab</title>'); return; }
      if (req.method === 'GET' && path === '/boot') {
        reply(200, { ready: !!driver, pending: [...pending].slice(0, 30), page: bootPage ? await bootPage.evaluate(() => ({ title: document.title, ready: window.__shotReady === true, frame: window.__frame ?? null, text: (document.body?.innerText ?? '').slice(0, 1000) })) : null }); return;
      }
      if (req.method === 'GET' && path === '/boot-image' && bootPage) {
        res.setHeader('Content-Type', 'image/png'); res.end(await bootPage.screenshot({ type: 'png' })); return;
      }
      if (!driver) { reply(503, { ok: false, error: 'Game is still loading' }); return; }
      if (req.method === 'GET' && path.startsWith('/shot/')) {
        const shot = driver.shot(decodeURIComponent(path.slice(6)));
        if (!shot) { reply(404, { error: 'No such picture' }); return; }
        res.setHeader('Content-Type', 'image/png'); res.end(shot); return;
      }
      if (req.method === 'GET' && path === '/image') {
        const image = driver.image(); if (!image) { reply(404, { error: 'Load a scenario first' }); return; }
        res.setHeader('Content-Type', 'image/png'); res.end(image); return;
      }
      if (req.method !== 'POST' || path !== '/command') { reply(404, { error: 'Unknown lab route' }); return; }
      // The browser panel and CLI are same-origin. Refuse cross-site commands, including simple-form requests.
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) { reply(415, { error: 'JSON required' }); return; }
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { reply(403, { error: 'Same origin required' }); return; }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 262144) { reply(413, { error: 'Request too large' }); return; } }
      const { command, args } = JSON.parse(body);
      reply(200, { ok: true, value: command === 'reload' ? await reload() : await driver.command(command, args) });
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
  }, attach(options) { attached = options; driver = createLabDriver(options); return driver; }, close: () => driver?.close() };
}
