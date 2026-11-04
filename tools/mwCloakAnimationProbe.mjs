// MW-CLOAK-PROBE: use the running dev server and the user's normal browser.
// Usage: npm run mwcloakprobe [base-url]
// Start the game with "npm run dev" first. No separate server, Chromium,
// Playwright profile, graphics backend, or collision solver is involved.
import { spawn } from 'node:child_process';

const base = (process.argv[2] ?? 'http://localhost:5173/play/').replace(/\/$/, '/');
const url = new URL(base);
url.searchParams.set('mwcloakprobe', '1');

let response;
try {
  response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2500) });
} catch {
  console.error('Cannot reach the running Vite dev server at', base);
  console.error('First start it in another terminal with: npm.cmd run dev');
  console.error('Then run this command again: npm.cmd run mwcloakprobe');
  process.exit(2);
}
if (!response.ok && response.status !== 304) {
  console.error('The dev server responded with HTTP', response.status, 'for', url.href);
  console.error('Check that npm.cmd run dev is serving the game at /play/.');
  process.exit(2);
}

console.log('Opening the cloak diagnostic in your default browser:');
console.log(url.href);
console.log('The game uses the existing dev server and browser session.');
console.log('Equip a cloak, exercise the animations you want to inspect, then click');
console.log('"Stop and download capture" in the in-game diagnostic panel.');
console.log('The downloaded mw-cloak-capture.json is raw read-only geometry, not a collision verdict.');

const command = process.platform === 'win32' ? 'cmd.exe'
  : process.platform === 'darwin' ? 'open' : 'xdg-open';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'start', '""', url.href]
  : [url.href];
const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
child.on('error', (error) => {
  console.error('Could not open the browser automatically:', error.message);
  console.error('Open this address manually:', url.href);
});
child.unref();
