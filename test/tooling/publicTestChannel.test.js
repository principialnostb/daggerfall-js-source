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

test('public updates stay available while revocation blocks private access', async (t) => {
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
  assert.equal((await auth.releases()).status, 200);
  await assert.rejects(auth.authorizeUpdate(), /Activate/);
  await assert.rejects(auth.action('invite', hash(code)), /Invalid invitation/);
  assert.deepEqual(await auth.action('invite', code), { role: 'tester', login: 'Tester' });
  assert.equal((await auth.releases()).status, 200);
  rows = [];
  assert.equal((await auth.releases()).status, 200);
  await assert.rejects(auth.authorizeUpdate(), /Activate/);
});

test('EMC download checks its digest before exposing a package on disk', async (t) => {
  const root = profile(t);
  const contents = Buffer.from('model');
  const paths = ['Mods/Bodies/Example/model.nif', ...emcPack.paperdollFiles];
  const header = Buffer.from(JSON.stringify(paths.map((path) => ({ path, size: contents.length }))));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(header.length);
  const bytes = Buffer.concat([length, header, ...paths.map(() => contents)]);
  const store = emcPack.emcStore(root, { fetch: async (url, options) => {
    assert.equal(url, temporary);
    assert.equal(options.redirect, 'error');
    return new Response(bytes);
  } });
  assert.equal(store.ready(), false);
  assert.deepEqual(await store.serve(['test-emc']).json(), []);
  await assert.rejects(store.install(JSON.stringify({ url: temporary, size: bytes.length, sha256: '0'.repeat(64) })), /checksum/);
  assert.deepEqual(await store.serve(['test-emc']).json(), []);
  assert.deepEqual(await store.install(JSON.stringify({ url: temporary, size: bytes.length, sha256: hash(bytes) })), { files: paths.length });
  assert.equal(store.ready(), true);
  assert.deepEqual(await store.serve(['test-emc']).json(), paths);
  assert.equal(await store.serve(['test-emc', '0']).text(), 'model');
  assert.equal(store.serve(['test-emc', '../0']).status, 404);
});

test('a revoked invitation remains in the roster and its original hash is removed', async (t) => {
  const root = profile(t);
  let rows = [];
  let copied;
  const auth = channel.publicTestChannel({
    userData: root, copy: (code) => { copied = code; },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => value.toString() },
    net: { fetch: async (url, options) => {
      if (url.endsWith('/user')) return Response.json({ id: 1, login: 'owner' });
      if (url.includes('/contents/') && options.method === 'PUT') {
        rows = JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64').toString());
        return Response.json({});
      }
      if (url.includes('/contents/')) return Response.json({ content: Buffer.from(JSON.stringify(rows)).toString('base64') });
      return Response.json({ permissions: { push: true }, owner: { id: 1 } });
    } },
  });
  await auth.action('github-token', 'test-token');
  const { code, id } = await auth.action('create', 'Test player');
  assert.deepEqual(await auth.action('list'), [{ label: 'Test player', id, revoked: false, canCopy: true }]);
  await auth.action('copy-existing', id);
  assert.equal(copied, code);
  await auth.action('revoke', id);
  await assert.rejects(auth.action('copy-existing', id), /Active invitation not found/);
  assert.deepEqual(await auth.action('list'), [{ label: 'Test player', id: hash('revoked:' + id), revoked: true, canCopy: false }]);
  await assert.rejects(auth.action('invite', code), /Invitation unavailable/);
});
test('developer EMC supports direct and redirected downloads while keeping the credential on GitHub', async (t) => {
  const root = profile(t);
  const token = 'test-token';
  const asset = { id: 12, name: emcPack.ASSET_NAME, size: 128, digest: 'sha256:' + 'a'.repeat(64) };
  let redirect = false;
  let copied;
  const auth = channel.publicTestChannel({
    userData: root, copy: (value) => { copied = JSON.parse(value); },
    safeStorage: { isEncryptionAvailable: () => false },
    emc: { installFrom: async (info, open) => {
      assert.deepEqual(info, { size: asset.size, sha256: asset.digest.slice(7) });
      assert.equal(await (await open()).text(), 'archive');
      return { files: 1 };
    } },
    net: { fetch: async (url, options) => {
      if (url === temporary) {
        assert.equal(options.headers?.Authorization, undefined);
        return new Response('archive');
      }
      if (url.endsWith('/user')) return Response.json({ id: 1, login: 'owner' });
      if (url.includes('/releases?')) return Response.json([
        { tag_name: 'emc-1311-v1', assets: [{ ...asset, id: 11 }] },
        { tag_name: 'emc-1311-v2', assets: [asset] },
      ]);
      if (url.endsWith('/dfo-13-11-test-releases')) return Response.json({ private: true });
      return Response.json({ permissions: { push: true }, owner: { id: 1 } });
    } },
    fetchAsset: async (url, options) => {
      assert.match(url, /\/releases\/assets\/12$/);
      assert.equal(options.headers.Authorization, 'Bearer ' + token);
      assert.equal(options.redirect, 'manual');
      return redirect ? Response.redirect(temporary) : new Response('archive');
    },
  });
  assert.match((await auth.installDeveloperEmc()).error, /Sign in/);
  await auth.action('github-token', token);
  assert.deepEqual(await auth.installDeveloperEmc(), { files: 1 });
  redirect = true;
  assert.deepEqual(await auth.installDeveloperEmc(), { files: 1 });
  await auth.action('emc-link');
  assert.deepEqual(copied, { url: temporary, size: asset.size, sha256: asset.digest.slice(7) });
});


test('complete EMC offers retain an installed base and mount the independent faces component', async (t) => {
  const root = profile(t);
  const baseContents = emcPack.paperdollFiles.map((path) => ({ path, size: 1 }));
  const facesContents = ['Meshes/b/head.nif', 'Textures/head.dds'].map((path) => ({
    path: "Mods/Textures/Westly's Faces Refurbished/Data Files/" + path, size: 1,
  }));
  const bytes = (files) => {
    const index = Buffer.from(JSON.stringify(files));
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(index.length);
    return Buffer.concat([prefix, index, Buffer.alloc(files.length, 107)]);
  };
  const base = bytes(baseContents);
  let faces = bytes(facesContents);
  let fetched = 0;
  const store = emcPack.emcStore(root, { fetch: async () => { fetched++; return new Response(faces); } }, { requireFaces: true });
  await store.installFrom({ size: base.length, sha256: hash(base) }, async () => new Response(base));
  assert.equal(store.ready(), false);
  assert.equal(store.readyPart('base'), true);
  const offer = (part) => ({ size: part.length, sha256: hash(part), url: temporary });
  await assert.rejects(store.install(JSON.stringify(offer(base))), /complete EMC offer/);
  assert.deepEqual(await store.install(JSON.stringify({ base: offer(base), faces: offer(faces) })), { files: 2 });
  assert.equal(fetched, 1);
  assert.equal(store.ready(), true);
  faces = Buffer.from(faces);
  faces[faces.length - 1] = 109;
  assert.deepEqual(await store.install(JSON.stringify({ base: offer(base), faces: offer(faces) })), { files: 2 });
  assert.equal(fetched, 2, 'an updated component of the same size is fetched again');
  const names = [...baseContents, ...facesContents].map((asset) => asset.path);
  assert.deepEqual(await store.serve(['test-emc']).json(), names);
  assert.equal(await store.serve(['test-emc', '2']).text(), 'k');
  await store.remove();
  assert.equal(store.ready(), false);
  assert.equal(store.readyPart('base'), false);
  assert.equal(store.readyPart('faces'), false);
  assert.deepEqual(await store.serve(['test-emc']).json(), []);
  assert.equal(store.serve(['test-emc', '2']).status, 404);
  await store.installFrom({ size: base.length, sha256: hash(base) }, async () => new Response(base));
  await store.install(JSON.stringify({ base: offer(base), faces: offer(faces) }));
  assert.deepEqual(await store.serve(['test-emc']).json(), names);
});

test('EMC times out before headers and after a stalled body, then allows another attempt', async (t) => {
  const events = [];
  let response = (signal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const root = profile(t);
  const store = emcPack.emcStore(root, { fetch: (_url, { signal }) => response(signal) }, {
    idleMs: 40, onProgress: (event) => events.push(event?.stage ?? 'done'),
  });
  const offer = JSON.stringify({ url: temporary, size: 2, sha256: hash('ab') });
  await assert.rejects(store.install(offer), /transfer timed out/);
  assert.deepEqual(events.splice(0), ['connecting', 'done']);
  response = () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([97])); } }));
  await assert.rejects(store.install(offer), /transfer timed out/);
  assert.deepEqual(events.splice(0), ['connecting', 'downloading', 'downloading', 'done']);
  response = () => new Response(null, { status: 403 });
  await assert.rejects(store.install(offer), /HTTP 403/);
  assert.deepEqual(events, ['connecting', 'done']);
});
