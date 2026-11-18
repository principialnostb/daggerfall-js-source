import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCosmeticItems, cosmeticBodyMorphs } from '../../src/net/cosmetics/identityOptions.js';
import { peerStubEntity } from '../../src/net/remotePlayers.js';
import { playerBuildOpts } from '../../src/net/peer/peerBodies.js';
import { validLook } from '../../src/net/wire.js';

test('cosmetic receiver builds from the profile and reverts when it is removed', () => {
  const look = validLook({ race: 'Breton', gender: 'male', items: [
    { templateIndex: 102, equipSlot: 0, group: 'Armor', material: 0 },
  ] });
  const cosmetic = { version: 1, body: {
    identity: { race: 'nord', female: true, faceIndex: 3, hairId: 'hair 01', headId: '../elsewhere' },
    proportions: { headScale: 2, unknown: 1 },
  }, slots: [
    { slot: 0, group: 'Armor', templateIndex: 102, material: 0, model: 'cuirass 01' },
    { slot: 0, group: 'Armor', templateIndex: 102, material: 1, model: 'wrong material' },
  ] };
  const renderLook = { ...look, cosmetic };
  const options = playerBuildOpts(renderLook);
  assert.equal(options.race, 'nord');
  assert.equal(options.female, true);
  assert.equal(options.appearanceHairId, 'hair 01');
  assert.equal(options.appearanceHeadId, null);
  assert.deepEqual(cosmeticBodyMorphs(cosmetic), { headScale: 1 });
  const slots = applyCosmeticItems(peerStubEntity(look).equip.slots, cosmetic);
  assert.equal(slots[0].__mwLook, 'cuirass 01');
  assert.deepEqual(validLook(renderLook), look);
  assert.equal(playerBuildOpts(look).race, 'breton');
  assert.equal(playerBuildOpts(look).remoteBodyMorphs, null);
});

test('two clients share profiles through the separate HTTP service across room changes', async (t) => {
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const { createCosmeticPeers } = await import('../../src/net/cosmetics/cosmeticPeers.js');
  const child = spawn(process.execPath, ['tools/cosmeticsService.mjs'], {
    env: { ...process.env, COSMETICS_HOST: '127.0.0.1', COSMETICS_PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(() => child.kill());
  const [ready] = await once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
  const endpoint = 'http://127.0.0.1:' + Number(ready.toString().trim());
  assert.equal((await (await fetch(endpoint + '/health')).json()).service, 'dfo-cosmetics');
  assert.match(await (await fetch(endpoint)).text(), /Публичный адрес/);
  const clients = [createCosmeticPeers(endpoint), createCosmeticPeers(endpoint)];
  const sessions = ['player-a', 'player-b'].map((id) => ({ id, room: 'first', url: 'wss://example.test', status: 'open' }));
  const localMotion = [{ mair: 1, mcr: 0, an: 0, bms: 480, bhm: 240, bst: 0.12, bsr: 1 }, { mair: 0, mcr: 1, an: 0 }];
  sessions.forEach((session, i) => { session.visualPose = () => localMotion[i]; });
  const base = { race: 'Breton', items: [] };
  const peers = sessions.map(({ id }) => ({ id, look: base, shown: { an: 0 } }));
  const tick = (i, now) => clients[i](sessions[i], null, [peers[1 - i]], now)[0];
  let sampledAt = 0;
  for (let now = 0; now <= 5000; now += 100) {
    sampledAt = now;
    tick(0, now);
    tick(1, now);
    await new Promise((resolve) => setTimeout(resolve, 35));
    if (tick(0, now).shown.mcr === 1 && tick(1, now).shown.mair === 1 && tick(1, now).shown.bms === 480) break;
  }
  const received = tick(0, sampledAt + 1);
  assert.equal(received.look.cosmetic?.version, 1);
  assert.equal(tick(1, sampledAt + 1).look.cosmetic?.version, 1);
  assert.equal(received.shown.mcr, 1);
  assert.equal(tick(1, sampledAt + 1).shown.mair, 1);
  assert.equal(tick(1, sampledAt + 1).shown.bms, 480);
  assert.equal(tick(1, sampledAt + 1).shown.bst, 0.12);
  assert.equal(tick(1, sampledAt + 1).shown.bsr, 1);
  sessions[0].room = 'adjacent';
  assert.equal(tick(0, 50_002).look, received.look);
  assert.equal(createCosmeticPeers()(sessions[0], null, [peers[1]], 0)[0], peers[1]);
  assert.deepEqual(base, { race: 'Breton', items: [] });
});

test('the menu host starts and stops its own loopback service', async () => {
  const { createCosmeticsHost } = await import('../../app/lib/cosmeticsServer.mjs');
  const host = createCosmeticsHost(0);
  assert.equal(await host('status'), null);
  const { url } = await host('start');
  try {
    assert.deepEqual(await host('start'), { url });
    const health = await (await fetch(url + '/health')).json();
    assert.equal(health.players, 0);
    assert.match(health.instance, /^[a-f0-9]{24}$/);
  } finally {
    assert.equal(await host('stop'), null);
  }
  await assert.rejects(fetch(url + '/health'));
});


test('visual motion clears, expires, isolates rooms and waits briefly for matching strike timing', async () => {
  const { cosmeticMotion } = await import('../../src/net/cosmetics/cosmeticPeers.js');
  const entry = { motion: { room: 'room', seq: 1, mair: 1, mcr: 1, an: 1, bms: 480, bhm: 240 }, motionUntil: 1500 };
  const pose = { an: 1, x: 12 };
  assert.deepEqual(cosmeticMotion(pose, entry, 'room', 0), { ...pose, mair: 1, mcr: 1, bms: 480, bhm: 240 });
  assert.equal(cosmeticMotion(pose, entry, 'other', 0), pose);
  assert.equal(cosmeticMotion(pose, entry, 'room', 1500), pose);
  assert.equal(cosmeticMotion({ an: 2 }, entry, 'room', 100).an, 1);
  entry.motion = { ...entry.motion, an: 2, mair: 0, mcr: 0 };
  const next = cosmeticMotion({ an: 2 }, entry, 'room', 200);
  assert.equal(next.an, 2);
  assert.equal(next.mair, 0);
  assert.equal(next.mcr, 0);
  assert.equal(next.bms, 480);
  assert.equal(cosmeticMotion({ an: 3 }, entry, 'room', 300).an, 2);
  assert.equal(cosmeticMotion({ an: 3 }, entry, 'room', 551).an, 3);
});
