'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { testApi, testRelease } = require('./testBuildUpdates.cjs');
const { ASSET_NAME, FACE_ASSET_NAME, MAX_PACK, temporaryUrl, encodeOffer } = require('./emcReleasePack.cjs');

const repository = 'principialnostb/daggerfall-js-source';
const branch = '13.11-build';
const rosterPath = 'test-channel/13.11-invites.json';
const rosterEndpoint = '/repos/' + repository + '/contents/' + rosterPath;
const privateRepo = 'principialnostb/dfo-13-11-test-releases';
const hashCode = (value) => createHash('sha256').update(value).digest('hex');

function githubCredential() {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'credential.gitHubAuthModes=browser', 'credential-manager', 'get'], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'always' },
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', () => reject(new Error('Git for Windows with Git Credential Manager is required for developer sign-in')));
    child.stdin.on('error', () => {});
    child.once('close', (code) => {
      const token = /^password=([^\r\n]+)/m.exec(stdout)?.[1];
      if (code || !token) reject(new Error('GitHub sign-in was cancelled or failed'));
      else resolve(token);
    });
    child.stdin.end('protocol=https\nhost=github.com\n\n');
  });
}

function publicTestChannel({ userData, net, safeStorage, copy, emc, clientId, openBrowser, fetchAsset = net.fetch.bind(net), requireFaces = false }) {
  const api = testApi(repository);
  const inviteFile = path.join(userData, 'test-invite-public.dpapi');
  const adminFile = path.join(userData, 'test-admin-public');
  const vaultFile = path.join(userData, 'test-invites.dpapi');
  let invite;
  let admin;
  let deviceCode;
  let identityEpoch = 0;
  let publishedAssets = new Map();
  const emcNames = requireFaces ? { base: ASSET_NAME, faces: FACE_ASSET_NAME } : { base: ASSET_NAME };
  const downloadPrefix = 'https://github.com/' + repository + '/releases/download/';

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

  // Only the publisher calls the releases API. The static index keeps the same
  // release rows so both game-only and shell updates use their existing checks.
  const indexUrl = 'https://raw.githubusercontent.com/' + repository + '/' + branch + '/test-channel/13.11-releases.json';
  let lastIndex;
  async function releaseIndex(options) {
    options?.signal?.throwIfAborted();
    if (lastIndex && Date.now() - lastIndex.time < 15000) return Response.json(lastIndex.rows);
    try {
      const response = await net.fetch(indexUrl, { ...options, headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (response.ok) {
        const rows = await response.json();
        if (Array.isArray(rows) && testRelease(rows)) {
          lastIndex = { rows, time: Date.now() };
          return Response.json(rows);
        }
      }
    } catch (error) {
      if (options?.signal?.aborted) throw error;
    }
    // Retain the previous route if only the static host is unavailable.
    return net.fetch(api + '?per_page=100', options);
  }

  async function roster(token) {
    let rows;
    let sha;
    if (token) {
      const data = await json(await gh(rosterEndpoint + '?ref=' + branch, token, { cache: 'no-store' }));
      rows = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
      sha = data.sha;
    } else {
      const url = 'https://raw.githubusercontent.com/' + repository + '/' + branch + '/' + rosterPath;
      rows = await json(await net.fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000) }));
    }
    if (!Array.isArray(rows) || rows.some((row) => !/^[0-9a-f]{64}$/.test(row?.hash) || typeof row.label !== 'string')) {
      throw new Error('Invalid test invitation list');
    }
    return { rows, sha };
  }

  async function member() {
    if (!invite && safeStorage.isEncryptionAvailable() && fs.existsSync(inviteFile)) {
      invite = safeStorage.decryptString(fs.readFileSync(inviteFile));
    }
    if (!/^[0-9a-f]{48}$/.test(invite ?? '')) return false;
    const digest = hashCode(invite);
    return (await roster()).rows.some((row) => !row.revoked && row.hash === digest);
  }

  async function authorizeUpdate() {
    // Recheck for every release lookup so an already open launcher also sees a revocation.
    const token = adminToken();
    const profile = await adminProfile(token);
    if (profile) return profile;
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

  function vault() {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(vaultFile)) return {};
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(vaultFile)));
  }

  function saveVault(codes) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable');
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(vaultFile + '.tmp', safeStorage.encryptString(JSON.stringify(codes)), { mode: 0o600 });
    fs.renameSync(vaultFile + '.tmp', vaultFile);
  }

  async function saveRoster(rows, sha, token) {
    const result = await gh(rosterEndpoint, token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      branch, message: 'Update the 13.11 invitation list', sha,
      content: Buffer.from(JSON.stringify(rows, null, 2) + '\n').toString('base64'),
    }) });
    if (!result.ok) throw new Error('Cannot update invitations. Check write access or reload the list and retry.');
  }

  async function device(route, params) {
    return json(await net.fetch('https://github.com/login/' + route, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' },
      body: new URLSearchParams({ client_id: clientId, ...params }),
    }));
  }

  function emcErrorMessage(error) {
    return error.message === 'GitHub request failed (404)'
      ? 'This GitHub sign-in cannot read the private EMC repository. Check repository access and sign in again.'
      : /(?:GitHub request failed|EMC download refused \(HTTP) \(?\d{3}\)/.test(error.message)
        ? error.message + '. Check access or request a fresh offer.'
        : error.message === 'EMC transfer timed out'
        ? 'The EMC transfer stopped responding. Retry the download.'
        : 'Could not download EMC from GitHub. Check your connection and try again.';
  }

  async function privateEmcAssets(token) {
    const response = await gh('/repos/' + privateRepo, token);
    if (!(await json(response)).private) throw new Error('EMC repository must be private');
    const releases = await json(await gh('/repos/' + privateRepo + '/releases?per_page=100', token));
    return releases.filter((release) => !release.draft && /^emc-1311-v\d+$/.test(release.tag_name))
      .sort((a, b) => Number(b.tag_name.slice(10)) - Number(a.tag_name.slice(10)))
      .flatMap((release) => release.assets ?? []);
  }

  function emcDownload(available, token, name) {
    const asset = available.find((item) => item.name === name);
    if (!Number.isSafeInteger(asset?.id) || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_PACK
      || !/^sha256:[0-9a-f]{64}$/.test(asset.digest)) throw new Error('EMC archive unavailable');
    return {
      asset: { size: asset.size, sha256: asset.digest.slice(7) },
      request: (signal = AbortSignal.timeout(30000), offset = 0) => fetchAsset('https://api.github.com/repos/' + privateRepo + '/releases/assets/' + asset.id, {
        headers: { 'User-Agent': 'DFO-13.11', Authorization: 'Bearer ' + token, Accept: 'application/octet-stream', ...(offset ? { Range: 'bytes=' + offset + '-' } : {}) },
        redirect: 'manual', signal,
      }),
    };
  }

  async function installDeveloperEmc(access) {
    try {
      const token = adminToken();
      if (!await adminProfile(token)) return { error: 'Sign in with GitHub as a developer to install EMC.' };
      const available = await privateEmcAssets(token);
      const parts = Object.entries(emcNames).map(([part, name]) => {
        const { asset, request } = emcDownload(available, token, name);
        const open = async (signal, offset) => {
          const download = await request(signal, offset);
          if (download.status === 404) throw new Error('GitHub request failed (404)');
          if (download.status !== 302) return download;
          return net.fetch(temporaryUrl(download.headers.get('location')), { redirect: 'error', cache: 'no-store', signal,
            ...(offset ? { headers: { Range: 'bytes=' + offset + '-' } } : {}) });
        };
        return { part, offer: asset, open };
      });
      return await emc.installSet(parts, access);
    } catch (error) { return { error: emcErrorMessage(error) }; }
  }

  async function action(name, value, access) {
    const epoch = identityEpoch;
    const assertCurrent = () => {
      if (epoch !== identityEpoch) throw new Error('Sign-in was cancelled');
    };
    if (name === 'github-login') {
      const token = await githubCredential();
      assertCurrent();
      return action('github-token', token);
    }
    if (name === 'github' && clientId) {
      const flow = await device('device/code');
      assertCurrent();
      if (!flow.device_code || !flow.user_code) throw new Error('GitHub sign-in unavailable');
      deviceCode = flow.device_code;
      await openBrowser('https://github.com/login/device');
      return { code: flow.user_code, interval: Math.max(5, flow.interval) };
    }
    if (name === 'poll' && clientId && deviceCode) {
      const grant = await device('oauth/access_token', { device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
      assertCurrent();
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
      if (!(await roster()).rows.some((row) => !row.revoked && row.hash === digest)) throw new Error('Invitation unavailable');
      assertCurrent();
      if (safeStorage.isEncryptionAvailable()) {
        fs.mkdirSync(userData, { recursive: true });
        fs.writeFileSync(inviteFile, safeStorage.encryptString(code), { mode: 0o600 });
      }
      invite = code;
      return { role: 'tester', login: 'Tester' };
    }
    if (name === 'github-token') {
      const token = value?.trim();
      const profile = await adminProfile(token);
      if (!profile) throw new Error('Enter a GitHub credential');
      assertCurrent();
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
      invite = admin = null;
      identityEpoch++;
      deviceCode = null;
      return null;
    }
    if (name === 'emc') {
      await authorizeUpdate();
      return emc.install(value, access);
    }
    const token = adminToken();
    if (!await adminProfile(token)) throw new Error('Administrator sign-in required');
    if (name === 'emc-link') {
      try {
        const available = await privateEmcAssets(token);
        const offer = {};
        for (const [part, name] of Object.entries(emcNames)) {
          const { asset, request } = emcDownload(available, token, name);
          const download = await request();
          if (download.status !== 302) {
            await download.body?.cancel();
            return { error: 'GitHub did not provide a shareable link. Try again.' };
          }
          offer[part] = { url: temporaryUrl(download.headers.get('location')), ...asset };
        }
        copy(requireFaces ? encodeOffer(offer) : JSON.stringify(offer.base));
        return { copied: true };
      } catch (error) { return { error: emcErrorMessage(error) }; }
    }
    const { rows, sha } = await roster(token);
    if (name === 'list') {
      const codes = vault();
      return rows.map(({ hash, label, revoked }) => ({ id: hash, label, revoked: revoked === true, canCopy: !revoked && !!codes[hash] }));
    }
    if (name === 'copy-existing') {
      if (!rows.some((row) => row.hash === value && !row.revoked)) throw new Error('Active invitation not found');
      const code = vault()[value];
      if (!code) throw new Error('Original code is unavailable on this PC');
      copy(code);
      return null;
    }
    if (name === 'revoke') {
      if (!rows.some((row) => row.hash === value && !row.revoked)) throw new Error('Active invitation not found');
      await saveRoster(rows.map((row) => row.hash === value
        ? { ...row, hash: hashCode('revoked:' + row.hash), revoked: true } : row), sha, token);
      const codes = vault();
      if (codes[value]) { delete codes[value]; saveVault(codes); }
      return null;
    }
    if (name === 'create' && value?.trim()) {
      const code = randomBytes(24).toString('hex');
      const id = hashCode(code);
      saveVault({ ...vault(), [id]: code });
      await saveRoster([...rows, { hash: id, label: value.trim() }], sha, token);
      return { code, id };
    }
    throw new Error('Unknown test action');
  }

  return {
    action, authorizeUpdate, installDeveloperEmc, repository, page: 'https://github.com/' + repository + '/releases',
    async releases(options) {
      const response = await releaseIndex(options);
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
      if (!url.startsWith(prefix) || !/^\d+$/.test(url.slice(prefix.length))) throw new Error('Test access required');
      const download = publishedAssets.get(url.slice(prefix.length));
      if (!download) throw new Error('Asset unavailable');
      return net.fetch(download, options);
    },
    async setupLink() {
      const release = testRelease(await json(await releaseIndex({ signal: AbortSignal.timeout(12000) })));
      const direct = release?.assets?.find((file) => file.name === 'DFO-13.11-Setup.exe')?.browser_download_url;
      if (direct) return direct;
      const tag = /<!-- setup-tag: (dfo-1311-v13\.11\.[1-9]\d*) -->/.exec(release?.body ?? '')?.[1];
      return tag ? downloadPrefix + tag + '/DFO-13.11-Setup.exe' : undefined;
    },
  };
}

module.exports = { publicTestChannel };
