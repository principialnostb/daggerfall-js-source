'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { testApi } = require('./testBuildUpdates.cjs');

function privateTestChannel({ repository, userData, net, safeStorage }) {
  const api = testApi(repository);
  const tokenFile = path.join(userData, 'test-release-credential');
  let installToken = process.env.DFO_1311_INSTALL_TOKEN?.trim();
  delete process.env.DFO_1311_INSTALL_TOKEN;
  let token = installToken;

  function readToken() {
    if (!safeStorage.isEncryptionAvailable()) return token;
    try {
      if (installToken) {
        fs.mkdirSync(userData, { recursive: true });
        fs.writeFileSync(tokenFile, safeStorage.encryptString(installToken), { mode: 0o600 });
        installToken = null;
      }
      token ??= safeStorage.decryptString(fs.readFileSync(tokenFile));
    } catch { /* The installed game is still available if the credential cannot be read. */ }
    return token;
  }

  function fetch(url, options, accept) {
    const credential = readToken();
    if (!credential) throw new Error('No GitHub test release credential');
    return net.fetch(url, {
      ...options,
      headers: { ...options?.headers, Authorization: `Bearer ${credential}`, Accept: accept },
    });
  }

  return {
    repository,
    page: `https://github.com/${repository}/releases`,
    releases: (options) => fetch(api + '?per_page=100', options, 'application/vnd.github+json'),
    asset: (url, options) => {
      const prefix = api + '/assets/';
      if (typeof url !== 'string' || !url.startsWith(prefix) || !/^\d+$/.test(url.slice(prefix.length))) {
        throw new Error('Invalid test release asset');
      }
      return fetch(url, options, 'application/octet-stream');
    },
  };
}

module.exports = { privateTestChannel };
