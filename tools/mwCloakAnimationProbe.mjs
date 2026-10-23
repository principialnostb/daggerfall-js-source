// MW-CLOAK-PROBE: read-only live capture of the actual posed cloak and leg meshes.
// Usage: node tools/mwCloakAnimationProbe.mjs [url] [seconds]
// Example: node tools/mwCloakAnimationProbe.mjs http://localhost:5173/play/ 90
// Start a game/save and exercise idle, walk, run, combat and transitions during capture.
// This does not alter geometry or animation and is NOT a collision solver.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const url = process.argv[2] ?? 'http://localhost:5173/play/';
const seconds = Math.max(10, Math.min(600, Number(process.argv[3]) || 90));
const outDir = resolve('diagnostics/mw-cloak-probe');
await mkdir(outDir, { recursive: true });
const server = await createServer({ server: { port: 5247, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e.stack ?? e)));
await page.addInitScript(() => {
  window.__mwCloakProbeEnabled = true;
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
  console.log('Capture window:', seconds, 'seconds. Ensure a save/player is loaded and exercise the states you want checked.');
  await page.waitForTimeout(seconds * 1000);
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
  console.log('Samples:', report.sampleCount, '| page errors:', errors.length, '| hook error:', result.error ?? 'none');
  if (!report.sampleCount) {
    console.error('No cloak+body samples captured. Verify the game route is loaded, the player body and cloak are visible, and the runtime hook is present.');
    process.exitCode = 2;
  }
} finally {
  await browser.close();
  await server.close();
}
