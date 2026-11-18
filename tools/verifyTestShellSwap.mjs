import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, createReadStream, statSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.platform !== 'win32') {
  throw new Error('Run the installation test on a disposable GitHub-hosted Windows runner.');
}
const require = createRequire(new URL('../app/package.json', import.meta.url));
const { build, Platform, Arch } = require('electron-builder');
const assets = resolve(process.argv[2]);
const scratch = mkdtempSync(join(tmpdir(), 'dfo-shell-swap-'));
const marker = join(scratch, 'downloaded');
const problem = join(scratch, 'error.txt');
const yaml = require('js-yaml').load(readFileSync(join(assets, 'latest.yml'), 'utf8'));
const server = createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1);
  if (!['latest.yml', yaml.path, yaml.path + '.blockmap'].includes(name)) return response.writeHead(404).end();
  const file = join(assets, name);
  response.setHeader('Content-Length', statSync(file).size);
  createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const feed = 'http://127.0.0.1:' + server.address().port + '/';
  // Keep production artifacts intact. The older fixture uses the identical NSIS product identity.
  const project = mkdtempSync(join(scratch, 'previous-'));
  const out = join(scratch, 'out');
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'dfo-1311-test', version: '13.11.0',
    productName: 'DFO 13.11', main: 'main.cjs', author: 'DFO', description: 'Previous client for update smoke test' }));
  writeFileSync(join(project, 'main.cjs'), `
    const { app } = require('electron');
    const fs = require('node:fs');
    app.whenReady().then(async () => {
      const { autoUpdater } = require(${JSON.stringify(require.resolve('electron-updater'))});
      autoUpdater.disableDifferentialDownload = true;
      autoUpdater.setFeedURL({provider:'generic', url:${JSON.stringify(feed)}});
      autoUpdater.on('update-downloaded', () => {
        fs.writeFileSync(${JSON.stringify(marker)}, app.getVersion());
        autoUpdater.quitAndInstall(true, true);
      });
      const result = await autoUpdater.checkForUpdates();
      await result.downloadPromise;
    }).catch(e => { fs.writeFileSync(${JSON.stringify(problem)}, String(e.stack)); app.exit(1); });
  `);
  await build({ projectDir: project, targets: Platform.WINDOWS.createTarget('nsis', Arch.x64), publish: 'never',
    config: { appId: 'dev.dfo.test1311', electronVersion: require('electron/package.json').version,
      directories: { output: out }, nsis: { oneClick: true, perMachine: false, artifactName: 'previous.exe' },
      publish: { provider: 'generic', url: feed } } });
  execFileSync(join(out, 'previous.exe'), ['/S'], { timeout: 120000 });
  const program = join(process.env.LOCALAPPDATA, 'Programs', 'dfo-1311-test', 'DFO 13.11.exe');
  const cli = (cmd) => execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], {
    encoding: 'utf8', env: { ...process.env, DFO_VERIFY_PROGRAM: program, DAGGER_NO_UPDATE_CHECK: '1' } }).trim();
  cli('Start-Process -FilePath $env:DFO_VERIFY_PROGRAM -WindowStyle Hidden');
  for (let i = 0; i < 150; i++) {
    if (existsSync(problem)) throw new Error(readFileSync(problem, 'utf8'));
    if (existsSync(marker)) {
      const version = cli("(Get-Process -Name 'DFO Test Build' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path (Split-Path $env:DFO_VERIFY_PROGRAM) 'DFO Test Build.exe') -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1).ProductVersion");
      if (version === yaml.version || version === yaml.version + '.0') {
        console.log('Verified automatic shell download, install and reopened window: ' + version);
        // Exercise the same master installation path used after the folder picker confirms.
        cli("Get-Process -Name 'DFO Test Build' -ErrorAction SilentlyContinue | Stop-Process -Force");
        const legacy = join(scratch, 'previous client');
        const { mkdirSync } = await import('node:fs');
        mkdirSync(join(legacy, 'resources'), { recursive: true });
        writeFileSync(join(legacy, 'DFO Online Mod.exe'), '');
        writeFileSync(join(legacy, 'resources', 'app.asar'), 'previous files');
        execFileSync(join(assets, 'DFO-Test-Build-Setup.exe'), ['--local-install', legacy, assets], { timeout: 120000 });
        if (!existsSync(join(legacy, 'DFO Test Build', 'DFO Test Build.exe'))
          || readFileSync(join(legacy, 'resources', 'app.asar'), 'utf8') !== 'previous files') throw new Error('Legacy migration failed');
        break;
      }
    }
    if (i === 149) throw new Error('Updated launcher window did not reopen. Downloaded: ' + existsSync(marker));
    await delay(2000);
  }
} finally {
  server.close();
}
