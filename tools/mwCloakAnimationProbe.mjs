// MW-CLOAK-PROBE: read-only live capture of the actual posed cloak and leg meshes.
// Usage: node tools/mwCloakAnimationProbe.mjs [url] [seconds]
// Omit seconds (or pass 0) to record until Stop is pressed in the browser.
// Start a game/save and exercise idle, walk, run, combat and transitions during capture.
// This does not alter geometry or animation and is NOT a collision solver.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5247/play/';
const requestedSeconds = Number(process.argv[3] ?? 0);
const seconds = Number.isFinite(requestedSeconds) && requestedSeconds > 0 ? requestedSeconds : 0;
const outDir = resolve('diagnostics/mw-cloak-probe');
await mkdir(outDir, { recursive: true });
const server = await createServer({ server: { port: 5247, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const consoleErrors = [];
const failedRequests = [];
page.on('pageerror', e => errors.push(String(e.stack ?? e)));
page.on('console', msg => {
  if (msg.type() === 'error') {
    const entry = msg.text();
    consoleErrors.push(entry);
    console.error('[browser console]', entry);
  }
});
page.on('requestfailed', req => {
  const entry = { url: req.url(), error: req.failure()?.errorText ?? 'request failed' };
  failedRequests.push(entry);
  console.error('[request failed]', entry.error, entry.url);
});
await page.addInitScript(() => {
  window.__mwCloakProbeEnabled = true;
  window.__mwCloakProbeStop = false;
  const addStopControl = () => {
    if (!document.documentElement || document.getElementById('__mwCloakProbeStopButton')) return;
    const button = document.createElement('button');
    button.id = '__mwCloakProbeStopButton';
    button.textContent = 'Stop cloak diagnostic capture';
    button.style.cssText = 'position:fixed;z-index:2147483647;top:8px;right:8px;padding:10px 14px;background:#7f1d1d;color:white;border:2px solid white;border-radius:6px;font:14px sans-serif;cursor:pointer;box-shadow:0 2px 8px #0008';
    button.addEventListener('click', () => { window.__mwCloakProbeStop = true; button.textContent = 'Stopping capture…'; button.disabled = true; });
    document.documentElement.appendChild(button);
  };
  new MutationObserver(addStopControl).observe(document, { childList: true, subtree: true });
  addStopControl();
  window.__mwCloakProbeFrames = [];
  window.__mwCloakProbeOnPose = frame => {
    const pieces = frame.pieces ?? [];
    const cloak = pieces.filter(p => /cloak/i.test(p.slot + ' ' + p.name));
    const legs = pieces.filter(p => /^(upperleg|lowerleg|foot|groin|chest)$/i.test(p.slot));
    if (!cloak.length || !legs.length) return;
    // Bound memory: keep one sample per ~100 ms, and cap at 4,000 samples.
    const now = performance.now();
    if (now - (window.__mwCloakProbeLastAt ?? -Infinity) < 100) return;
    window.__mwCloakProbeLastAt = now;
    const samples = window.__mwCloakProbeFrames;
    samples.push({ wallTimeMs: now, time: frame.time, cpuSkinned: frame.cpuSkinned,
      cloak, legs, bones: frame.bones });
    if (samples.length > 4000) samples.shift();
  };
});
try {
  console.log('Opening:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log(seconds
    ? 'Capture window: ' + seconds + ' seconds.'
    : 'Capture runs until you click “Stop cloak diagnostic capture” in the browser.');
  console.log('If the page is blank, keep the run open briefly: browser console and failed requests will be written to the report.');
  const startedAt = Date.now();
  if (seconds) {
    await page.waitForTimeout(seconds * 1000);
  } else {
    while (true) {
      await page.waitForTimeout(500);
      const stopped = await page.evaluate(() => window.__mwCloakProbeStop === true).catch(() => true);
      if (stopped) break;
    }
  }
  const result = await page.evaluate(() => ({
    frames: window.__mwCloakProbeFrames ?? [],
    error: window.__mwCloakProbeError ?? null,
    href: location.href,
    title: document.title,
  }));
  const report = {
    schema: 'mw-cloak-probe-v1',
    generatedAt: new Date().toISOString(),
    url: result.href,
    title: result.title,
    durationSeconds: seconds,
    sampleCount: result.frames.length,
    runtimeHookError: result.error,
    pageErrors: errors,
    consoleErrors,
    failedRequests,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    note: 'Raw posed geometry capture. It does not assert that a near-surface sample is a confirmed intersection; clip/state labels require runtime animation-source metadata.',
    frames: result.frames,
  };
  const jsonPath = resolve(outDir, 'capture.json');
  await writeFile(jsonPath, JSON.stringify(report));
  await page.screenshot({ path: resolve(outDir, 'last-frame.png'), fullPage: false });
  await writeFile(resolve(outDir, 'README.txt'),
    'Morrowind cloak pose capture\\n\\n' +
    'capture.json contains sampled skinned geometry for the cloak and body slots from the live runtime.\\n' +
    'last-frame.png is the final browser view.\\n' +
    'The capture is read-only. It does not change the pose or solve collisions.\\n' +
    'For meaningful coverage, load a save and exercise idle, walk, run, combat stances, attacks, turns and transitions during capture.\\n' +
    'Current capture does not yet identify the source KF/clip name or automatically force every animation state.\\n');
  console.log('Saved:', jsonPath);
  console.log('Samples:', report.sampleCount, '| page errors:', errors.length, '| console errors:', consoleErrors.length, '| failed requests:', failedRequests.length, '| hook error:', result.error ?? 'none');
  if (!report.sampleCount) {
    console.error('No cloak+body samples captured. Inspect capture.json, consoleErrors, failedRequests and last-frame.png.');
    process.exitCode = 2;
  }
} finally {
  await browser.close();
  await server.close();
}
