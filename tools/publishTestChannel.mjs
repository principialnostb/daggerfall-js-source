import { execFileSync } from 'node:child_process';

const repository = 'principialnostb/daggerfall-js-source';
const branch = '13.11-build';
const endpoint = 'repos/' + repository;
const path = endpoint + '/contents/test-channel/13.11-releases.json';
const api = (args, input) => JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024 }));
const current = api([path + '?ref=' + branch]);
const releases = api([endpoint + '/releases?per_page=100'])
  .filter(r => !r.draft && !r.prerelease && /^dfo-1311-v13\.11\.\d+$/.test(r.tag_name))
  .map(({ tag_name, name, html_url, body, published_at, assets }) => ({
    tag_name, name, html_url, body, published_at,
    assets: assets.map(({ id, name, size, digest, browser_download_url }) => ({ id, name, size, digest, browser_download_url })),
  }));
const expected = 'dfo-1311-v' + process.env.VERSION;
if (!releases.some(r => r.tag_name === expected && r.assets.some(a => a.name === 'DFO-Online-game.json.gz')
    && r.assets.some(a => a.name === 'DFO-Online-game.pack.1'))) throw new Error('Published game assets missing for ' + expected);
const content = Buffer.from(JSON.stringify(releases) + '\n').toString('base64');
api(['--method', 'PUT', path, '--input', '-'], JSON.stringify({
  message: 'Update public 13.11 launcher index', branch, sha: current.sha, content,
}));
