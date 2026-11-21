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
      if (url === 'https://raw.githubusercontent.com/principialnostb/daggerfall-js-source/13.11-build/test-channel/13.11-invites.json') return Response.json(rows);
      if (url === 'https://raw.githubusercontent.com/principialnostb/daggerfall-js-source/13.11-build/test-channel/13.11-releases.json') return Response.json([{ tag_name: 'dfo-1311-v13.11.23', assets: [] }]);
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
      if (url.startsWith('https://raw.githubusercontent.com/')) return Response.json(rows);
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
    emc: { installSet: async ([{ offer: info, open }]) => {
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
  const compressed = emcPack.encodeOffer({ base: offer(base), faces: offer(faces) });
  assert.match(compressed, /^DFO1-[\w-]+$/);
  const revoked = AbortSignal.abort();
  await assert.rejects(store.install(compressed, revoked), { name: 'AbortError' });
  await store.install(compressed);
  assert.deepEqual(await store.serve(['test-emc']).json(), names);
});

test('sign-out invalidates a pending invitation activation', async (t) => {
  const code = 'b'.repeat(48);
  let finish;
  const auth = channel.publicTestChannel({
    userData: profile(t), safeStorage: { isEncryptionAvailable: () => false },
    net: { fetch: () => new Promise(resolve => { finish = resolve; }) },
  });
  const login = auth.action('invite', code);
  await auth.action('sign-out');
  finish(Response.json([{ label: 'Tester', hash: hash(code) }]));
  await assert.rejects(login, /cancelled/);
  await assert.rejects(auth.authorizeUpdate(), /Activate/);
});

test('a replacement EMC pair survives a failed transfer and resumes with a fresh offer', async (t) => {
  const pack = (paths, value) => {
    const index = Buffer.from(JSON.stringify(paths.map(path => ({ path, size: 1 }))));
    const length = Buffer.alloc(4);
    length.writeUInt32LE(index.length);
    return Buffer.concat([length, index, Buffer.alloc(paths.length, value)]);
  };
  const facePaths = ['head.nif', 'head.dds'].map(p => "Mods/Textures/Westly's Faces Refurbished/Data Files/" + p);
  const root = profile(t);
  let base = pack(emcPack.paperdollFiles, 65);
  let faces = pack(facePaths, 66);
  let interrupt = false;
  let baseRequests = 0;
  let resumed = false;
  const net = { fetch: async (url, options) => {
    if (url.includes('part=base')) { baseRequests++; return new Response(base); }
    if (interrupt) return new Response(faces.subarray(0, 10));
    if (options.headers?.Range) {
      resumed = true;
      assert.equal(options.headers.Range, 'bytes=10-');
      return new Response(faces.subarray(10), { status: 206, headers: {
        'Content-Range': 'bytes 10-' + (faces.length - 1) + '/' + faces.length,
      } });
    }
    return new Response(faces);
  } };
  const store = () => emcPack.emcStore(root, net, { requireFaces: true });
  const offer = (v) => JSON.stringify(Object.fromEntries(Object.entries({ base, faces }).map(([part, bytes]) =>
    [part, { url: temporary + '&part=' + part + '&v=' + v, size: bytes.length, sha256: hash(bytes) }])));
  await store().install(offer(1));
  base = pack(emcPack.paperdollFiles, 67);
  faces = pack(facePaths, 68);
  interrupt = true;
  await assert.rejects(store().install(offer(2)), /Incomplete/);
  assert.equal(await store().serve(['test-emc', '0']).text(), 'A');
  assert.equal(await store().serve(['test-emc', '2']).text(), 'B');
  interrupt = false;
  await store().install(offer(3));
  assert.equal(baseRequests, 2);
  assert.equal(resumed, true);
  assert.equal(await store().serve(['test-emc', '0']).text(), 'C');
  assert.equal(await store().serve(['test-emc', '2']).text(), 'D');
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

test('a rate-limited tester can discover the game, read notes, find setup and fetch its pack', async (t) => {
  const root = profile(t);
  const tag = 'dfo-1311-v13.11.23';
  const repo = 'principialnostb/daggerfall-js-source';
  const base = 'https://github.com/' + repo + '/releases/download/';
  const name = 'DFO-Online-game.pack.1';
  const calls = [];
  const auth = channel.publicTestChannel({ userData: root, safeStorage: { isEncryptionAvailable: () => false },
    net: { fetch: async (url, options) => {
      calls.push(url);
      if (url.includes('api.github.com')) return new Response(null, {status:403});
      if (url.endsWith('/13.11-releases.json')) return Response.json([{ tag_name:tag, body:'Patch notes\n<!-- setup-tag: dfo-1311-v13.11.20 -->',
        assets:[{id:7, name, size:64, browser_download_url:base + tag + '/' + name}] }]);
      assert.equal(url, base + tag + '/' + name);
      assert.equal(options.headers.Range, 'bytes=0-15');
      return new Response(new Uint8Array(16), {status:206});
    } } });
  assert.match((await (await auth.releases()).json())[0].body, /Patch notes/);
  assert.equal(await auth.setupLink(), base + 'dfo-1311-v13.11.20/DFO-13.11-Setup.exe');
  const response = await auth.asset('https://api.github.com/repos/' + repo + '/releases/assets/7', {headers:{Range:'bytes=0-15'}});
  assert.equal(response.status, 206);
  assert.equal(calls.length, 2);
  await assert.rejects(auth.authorizeUpdate(), /Activate/);
});
