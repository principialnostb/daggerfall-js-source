import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import emcPack from '../../app/lib/emcReleasePack.cjs';
import channel from '../../app/lib/publicTestChannel.cjs';

const temporary = 'https://release-assets.githubusercontent.com/a?sig=example';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const profile = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dfo-public-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

test('public invitations authorize updates and removal blocks the next release check', async (t) => {
  const code = 'a'.repeat(48);
  const root = profile(t);
  let rows = [{ hash: hash(code), label: 'Wave 1' }];
  const auth = channel.publicTestChannel({
    userData: root, safeStorage: { isEncryptionAvailable: () => false },
    net: { fetch: async (url, options) => {
      assert.equal(options?.headers?.Authorization, undefined, 'testers make anonymous requests');
      if (url.includes('/contents/')) return Response.json({ content: Buffer.from(JSON.stringify(rows)).toString('base64') });
      if (url.includes('/releases?')) return Response.json([]);
      throw new Error('Unexpected URL');
    } },
  });
  await assert.rejects(auth.releases(), /Activate/);
  assert.deepEqual(await auth.action('invite', code), { role: 'tester', login: 'Tester' });
  assert.equal((await auth.releases()).status, 200);
  rows = [];
  await assert.rejects(auth.releases(), /Activate/);
});

test('EMC download checks its digest before exposing a package on disk', async (t) => {
  const root = profile(t);
  const contents = Buffer.from('model');
  const header = Buffer.from(JSON.stringify([{ path: 'Mods/Bodies/Example/model.nif', size: contents.length }]));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(header.length);
  const bytes = Buffer.concat([length, header, contents]);
  const store = emcPack.emcStore(root, { fetch: async (url, options) => {
    assert.equal(url, temporary);
    assert.equal(options.redirect, 'error');
    return new Response(bytes);
  } });
  assert.deepEqual(await store.serve(['test-emc']).json(), []);
  await assert.rejects(store.install(JSON.stringify({ url: temporary, size: bytes.length, sha256: '0'.repeat(64) })), /checksum/);
  assert.deepEqual(await store.serve(['test-emc']).json(), []);
  assert.deepEqual(await store.install(JSON.stringify({ url: temporary, size: bytes.length, sha256: hash(bytes) })), { files: 1 });
  assert.deepEqual(await store.serve(['test-emc']).json(), ['Mods/Bodies/Example/model.nif']);
  assert.equal(await store.serve(['test-emc', '0']).text(), 'model');
  assert.equal(store.serve(['test-emc', '../0']).status, 404);
});
