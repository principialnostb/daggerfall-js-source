import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function openLab({ page, context, lab, base, out }) {
  await page.addScriptTag({ type: 'module', content: readFileSync(fileURLToPath(new URL('../kit.js', import.meta.url)), 'utf8') });
  await page.waitForFunction(() => !!window.__pgKit);
  const kit = (fn, ...args) => page.evaluate(([name, values]) => window.__pgKit[name](...values), [fn, args]);
  const step = (n) => page.evaluate((count) => window.__pg.step(count), n);
  if (await page.evaluate(() => (document.body?.innerText ?? '').includes('CLICK OR PRESS A KEY'))) {
    await page.keyboard.press('Enter'); await step(1);
  }
  await kit('third'); await step(30); await kit('setHome');
  const revision = execFileSync('git', ['-c', 'safe.directory=*', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const driver = lab.attach({ page, step, kit, out, revision });
  const panel = await context.newPage();
  await panel.goto(`${base}/__lab/`);
  console.log(`Animation Lab: ${base}/__lab/`);
  console.log(`Agent API: node tools/provingGround/lab/client.mjs status`);
  try {
    await new Promise((resolve) => {
      const stop = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); resolve(); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      panel.once('close', stop);
    });
  } finally { await driver.close(); }
}
