'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { testApi, testRelease } = require('./testBuildUpdates.cjs');
const { ASSET_NAME, temporaryUrl } = require('./emcReleasePack.cjs');

const repository = 'principialnostb/daggerfall-js-source';
const branch = '13.11-build';
const rosterPath = 'test-channel/13.11-invites.json';
const rosterEndpoint = '/repos/' + repository + '/contents/' + rosterPath;
const privateRepo = 'principialnostb/dfo-13-11-test-releases';
const hashCode = (value) => createHash('sha256').update(value).digest('hex');
const absent = (e) => e.code === 'ENOENT';

function publicTestChannel({ userData, net, safeStorage, copy, emc, clientId, openBrowser }) {
  const api = testApi(repository);
  const inviteFile = path.join(userData, 'test-invite-public');
  const adminFile = path.join(userData, 'test-admin-public');
  let invite = process.env.DFO_1311_PUBLIC_INVITE_HASH;
  delete process.env.DFO_1311_PUBLIC_INVITE_HASH;
  let pendingInvite = invite;
  let admin;
  let deviceCode;
  let online = null;
  let publishedAssets = new Map();
  const downloadPrefix = 'https://github.com/' + repository + '/releases/download/';

  function read(file) {
    try { return fs.readFileSync(file, 'utf8').trim(); } catch (error) { if (!absent(error)) throw error; return null; }
  }

  function gh(route, token, init = {}) {
    return net.fetch('https://api.github.com' + route, {
      ...init, redirect: 'manual', signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'DFO-13.11', Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}), ...init.headers },
    });
  }

  async function json(response) {
    if (!response.ok) throw new Error('GitHub request failed (' + response.status + ')');
    return response.json();
  }

  async function roster(token) {
    const data = await json(await gh(rosterEndpoint + '?ref=' + branch, token, { cache: 'no-store' }));
    const rows = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    if (!Array.isArray(rows) || rows.some((row) => !/^[0-9a-f]{64}$/.test(row?.hash) || typeof row.label !== 'string')) {
      throw new Error('Invalid test invitation list');
    }
    return { rows, sha: data.sha };
  }

  async function member() {
    if (pendingInvite && /^[0-9a-f]{64}$/.test(pendingInvite)) {
      fs.mkdirSync(userData, { recursive: true });
      fs.writeFileSync(inviteFile, pendingInvite);
      pendingInvite = null;
    }
    invite ??= read(inviteFile);
    if (!invite) return false;
    online ??= await roster().then(({ rows }) => rows.some((row) => row.hash === invite));
    return online;
  }

  async function authorizeUpdate() {
    // Recheck for every release lookup so an already open launcher also sees a revocation.
    online = null;
    if (!await member()) throw new Error('Activate a test invitation first');
  }

  async function adminProfile(token) {
    if (!token) return null;
    const repo = await json(await gh('/repos/' + repository, token));
    if (repo.permissions?.push !== true) throw new Error('GitHub write access required');
    const me = await json(await gh('/user', token));
    return { role: me.id === repo.owner?.id ? 'owner' : 'developer', login: me.login,
      avatar: 'https://avatars.githubusercontent.com/u/' + me.id };
  }

  function adminToken() {
    if (!admin && safeStorage.isEncryptionAvailable() && fs.existsSync(adminFile)) {
      admin = safeStorage.decryptString(fs.readFileSync(adminFile));
    }
    return admin;
  }

  async function saveRoster(rows, sha, token) {
    const result = await gh(rosterEndpoint, token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      branch, message: 'Update the 13.11 invitation list', sha,
      content: Buffer.from(JSON.stringify(rows, null, 2) + '\n').toString('base64'),
    }) });
    if (!result.ok) throw new Error('Cannot update invitations. Check write access or reload the list and retry.');
    online = null;
  }

  async function device(route, params) {
    return json(await net.fetch('https://github.com/login/' + route, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' },
      body: new URLSearchParams({ client_id: clientId, ...params }),
    }));
  }

  async function action(name, value) {
    if (name === 'github' && clientId) {
      const flow = await device('device/code');
      if (!flow.device_code || !flow.user_code) throw new Error('GitHub sign-in unavailable');
      deviceCode = flow.device_code;
      await openBrowser('https://github.com/login/device');
      return { code: flow.user_code, interval: Math.max(5, flow.interval) };
    }
    if (name === 'poll' && clientId && deviceCode) {
      const grant = await device('oauth/access_token', { device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
      if (grant.error === 'authorization_pending' || grant.error === 'slow_down') {
        return { pending: true, interval: Math.max(grant.error === 'slow_down' ? 10 : 5, grant.interval ?? 0) };
      }
      deviceCode = null;
      if (!grant.access_token) throw new Error('GitHub sign-in failed');
      return action('github-token', grant.access_token);
    }
    if (name === 'invite') {
      const code = value?.trim();
      if (!/^[0-9a-f]{48}$/.test(code)) throw new Error('Invalid invitation');
      const digest = hashCode(code);
      if (!(await roster()).rows.some((row) => row.hash === digest)) throw new Error('Invitation unavailable');
      fs.mkdirSync(userData, { recursive: true });
      fs.writeFileSync(inviteFile, digest);
      invite = digest;
      online = true;
      return { role: 'tester', login: 'Tester' };
    }
    if (name === 'github-token') {
      const token = value?.trim();
      const profile = await adminProfile(token);
      if (!profile) throw new Error('Enter a GitHub credential');
      admin = token;
      if (safeStorage.isEncryptionAvailable()) {
        fs.mkdirSync(userData, { recursive: true });
        fs.writeFileSync(adminFile, safeStorage.encryptString(token), { mode: 0o600 });
      }
      return profile;
    }
    if (name === 'profile') {
      const token = adminToken();
      if (token) return adminProfile(token);
      return await member() ? { role: 'tester', login: 'Tester' } : null;
    }
    if (name === 'sign-out') {
      for (const file of [inviteFile, adminFile]) fs.rmSync(file, { force: true });
      pendingInvite = invite = admin = null;
      online = false;
      return null;
    }
    if (name === 'emc') {
      await authorizeUpdate();
      return emc.install(value);
    }
    const token = adminToken();
    if (!await adminProfile(token)) throw new Error('Administrator sign-in required');
    if (name === 'emc-link') {
      const response = await gh('/repos/' + privateRepo, token);
      if (!(await json(response)).private) throw new Error('EMC repository must be private');
      const releases = await json(await gh('/repos/' + privateRepo + '/releases?per_page=100', token));
      const asset = releases.filter((release) => !release.draft).flatMap((release) => release.assets ?? [])
        .find((item) => item.name === ASSET_NAME);
      if (!Number.isSafeInteger(asset?.id) || !/^sha256:[0-9a-f]{64}$/.test(asset.digest)) throw new Error('EMC archive unavailable');
      const download = await gh('/repos/' + privateRepo + '/releases/assets/' + asset.id, token, {
        headers: { Accept: 'application/octet-stream' },
      });
      if (download.status !== 302) {
        await download.body?.cancel();
        throw new Error('GitHub did not issue a temporary link');
      }
      copy(JSON.stringify({ url: temporaryUrl(download.headers.get('location')), size: asset.size, sha256: asset.digest.slice(7) }));
      return { copied: true };
    }
    const { rows, sha } = await roster(token);
    if (name === 'list') return rows.map(({ hash, label }) => ({ id: hash, label, creator: '', expires: 0, active: true }));
    if (name === 'revoke') {
      await saveRoster(rows.filter((row) => row.hash !== value), sha, token);
      return null;
    }
    if (name === 'create' && value?.trim()) {
      const code = randomBytes(24).toString('hex');
      await saveRoster([...rows, { hash: hashCode(code), label: value.trim() }], sha, token);
      return { code };
    }
    throw new Error('Unknown test action');
  }

  return {
    action, repository, page: 'https://github.com/' + repository + '/releases',
    async releases(options) {
      await authorizeUpdate();
      const response = await net.fetch(api + '?per_page=100', options);
      if (response.ok) {
        const rows = await response.clone().json();
        publishedAssets = new Map(rows.filter((r) => !r.draft && !r.prerelease && /^dfo-1311-v13\.11\.\d+$/.test(r.tag_name))
          .flatMap((r) => r.assets ?? []).filter((a) => a.browser_download_url?.startsWith(downloadPrefix))
          .map((a) => [String(a.id), a.browser_download_url]));
      }
      return response;
    },
    asset(url, options) {
      const prefix = api + '/assets/';
      if (!online || !url.startsWith(prefix) || !/^\d+$/.test(url.slice(prefix.length))) throw new Error('Test access required');
      const download = publishedAssets.get(url.slice(prefix.length));
      if (!download) throw new Error('Asset unavailable');
      return net.fetch(download, options);
    },
    async setupLink() {
      await authorizeUpdate();
      const release = testRelease(await json(await net.fetch(api + '?per_page=100', { signal: AbortSignal.timeout(12000) })));
      return release?.assets?.find((file) => file.name === 'DFO-13.11-Setup.exe')?.browser_download_url;
    },
  };
}

module.exports = { publicTestChannel };
