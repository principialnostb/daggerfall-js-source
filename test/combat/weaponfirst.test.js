// WEAPON-FIRST (bible/07-Rendering/Load-Stalls.md section 5; the owner, 2026-10-28: a weapon's first equip "может
// достигать и 30 секунд, а может и вовсе не прогрузиться", a second one quick): a failed swap asked again a few times,
// further apart each time; the carried weapons read and decoded before the click; the swap's own line in the console.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { swapRetryDue, SWAP_RETRY_MAX, SWAP_RETRY_MS } from '../../src/combat/fpArm.js';

const src = readFileSync('src/combat/fpArm.js', 'utf8');

test('WEAPON-FIRST: a failed hand is asked again SWAP_RETRY_MAX times, each further apart, and never another hand\'s failure (mutants: never again; at once; for ever)', () => {
  const t = (tries, at) => ({ weaponFailTry: { key: 'k', tries, at } });
  assert.equal(swapRetryDue({}, 'k', 1e6), false, 'no failure, nothing to ask again');
  assert.equal(swapRetryDue(t(1, 0), 'k', SWAP_RETRY_MS - 1), false, 'not before its wait');
  assert.equal(swapRetryDue(t(1, 0), 'k', SWAP_RETRY_MS), true);
  assert.equal(swapRetryDue(t(2, 0), 'k', SWAP_RETRY_MS), false, 'the second wait is twice the first');
  assert.equal(swapRetryDue(t(2, 0), 'k', 2 * SWAP_RETRY_MS), true);
  assert.equal(swapRetryDue(t(SWAP_RETRY_MAX, 0), 'k', 1e9), false, 'past the last try the card says why');
  assert.equal(swapRetryDue(t(1, 0), 'other', 1e9), false);
});

test('WEAPON-FIRST: the swap counts its failures by hand and clears them when it lands, and the frame door asks it (mutants: the count never kept; never cleared; the gate unread)', () => {
  assert.match(src, /if \(built\.weaponFailed === key && !swapRetryDue\(built, key\)\) return false;/);
  assert.match(src, /token\.weaponFailTry = \{ key, tries: prior && prior\.key === key \? prior\.tries \+ 1 : 1, at: mwNow\(\) \};/);
  assert.match(src, /token\.weaponFailTry = null;/);
  assert.match(src, /console\.log\(`\[mw\] weapon swap \$\{item\?\.name \?\? 'bare hands'\} in /);
});

test('WEAPON-FIRST: the carried weapons are warmed once each by the standing rig - by the build and by the pack (mutants: warmed again each refresh; unwired)', () => {
  const warm = src.slice(src.indexOf('async prewarmWeapons(items) {'), src.indexOf('/** LOAD-STALL 3: is a build or a swap under way'));
  assert.match(warm, /if \(seen\.has\(key\)\) continue;\s*seen\.add\(key\);/);
  assert.match(warm, /await preloadArmTextures\(pieces, archives, gen\);/, 'in the pool\'s ordinary line - a click\'s own swap goes ahead of it');
  assert.match(readFileSync('src/combat/weapon/weaponRig.js', 'utf8'), /if \(res\?\.ok\) fpArm\.prewarmWeapons\?\.\(entity\?\.items\)\.catch\(\(\) => 0\);/);
  assert.match(readFileSync('src/ui/enhanced/enhancedInventory.js', 'utf8'), /arm\.prewarmWeapons\?\.\(deps\.entity\.items\)\?\.catch\?\.\(\(\) => 0\);/);
});

test('LOAD-STALL 4: archive reads go through one queue - at most ARCHIVE_READS_NORMAL ordinary ones at once, room always left for an urgent one, and the urgent line served first (mutants: no cap; no room kept; first come first served)', async () => {
  const { archiveRead, _archiveReadState, ARCHIVE_READS_MAX, ARCHIVE_READS_NORMAL } = await import('../../src/combat/fpArm.js');
  const open = []; const order = [];
  const hold = (name) => () => new Promise((r) => { order.push(name); open.push(r); });
  const normal = Array.from({ length: ARCHIVE_READS_NORMAL + 3 }, (_, i) => archiveRead(hold(`npc${i}`)));
  assert.equal(_archiveReadState().running, ARCHIVE_READS_NORMAL, 'the street\'s reads stop at their cap');
  const mine = archiveRead(hold('sword'), true);
  assert.equal(order.at(-1), 'sword', 'the urgent read starts at once, in the room kept for it');
  assert.ok(_archiveReadState().running <= ARCHIVE_READS_MAX);
  const mine2 = archiveRead(hold('sword-tex'), true);
  archiveRead(hold('sword-tex2'), true);
  assert.equal(_archiveReadState().running, ARCHIVE_READS_MAX);
  open.shift()(); await Promise.resolve(); await Promise.resolve();
  assert.equal(order.at(-1), 'sword-tex2', 'a freed place goes to the urgent line first');
  while (open.length) { open.shift()(); await Promise.resolve(); await Promise.resolve(); }
  await Promise.all([...normal, mine, mine2]);
  assert.deepEqual(_archiveReadState(), { running: 0, urgent: 0, normal: 0 });
});

test('TEXTURE-HEAL: a picture whose read did not land is asked for again after a build and a swap - one the file refused never is (mutants: the memo unread, so a refused file is read for ever; never asked again; the rig\'s meshes never hang it)', () => {
  const heal = src.slice(src.indexOf('async function healTextures(token, tries = 0) {'), src.indexOf('async function healTextures(token, tries = 0) {') + 2200);
  assert.match(heal, /e && !e\.ok && !TEXTURE_CACHE\.has\(`\$\{gen\}:\$\{file\}`\)/, 'transient: not ok AND not the memo\'s answer');
  assert.match(heal, /if \(gen === null \|\| tries >= TEXTURE_HEAL_TRIES\) return 0;/);
  assert.match(heal, /releaseMesh\(\); packed = null; releaseThirdMesh\(\); thirdPacked = null;/);
  assert.match(src, /healTextures\(res\)\.catch\(\(\) => 0\);/);
  assert.match(src, /healTextures\(token\)\.catch\(\(\) => 0\);/);
  // the memo keeps a file's own refusal (and an absent file) - the line the heal reads it by
  assert.match(src, /if \(err\?\.decoderError && !TEXTURE_CACHE\.has\(key\)\) TEXTURE_CACHE\.set\(key, \{ ok: false/);
});

test('LOAD-HOLD: a vendored file the server refused once is fetched again on the next load, and a read that never answers gives its place back (mutants: the refusal kept for the session; no lease)', async () => {
  const { makeVendoredArchive } = await import('../../src/systems/urlArchive.js');
  let calls = 0;
  const arc = makeVendoredArchive({ 'textures/sheath.dds': '/sheath.dds' }, async () => { calls++; if (calls === 1) throw new Error('ERR_INSUFFICIENT_RESOURCES'); return new Uint8Array([7]); });
  await assert.rejects(arc.load('textures/sheath.dds'));
  assert.deepEqual(await arc.load('textures/sheath.dds'), new Uint8Array([7]), 'asked again, it is fetched again');
  assert.equal(calls, 2);
  assert.match(src, /const lease = setTimeout\(\(\) => \{ if \(done\(\)\) job\.reject\(new Error\('archive read timed out'\)\); \}, ARCHIVE_READ_LEASE_MS\);/);
  assert.match(readFileSync('src/formats/morrowind/mwTextureClient.js', 'utf8'), /drop\(slot, 'mw texture worker stopped answering'\); \}, DECODE_TIMEOUT_MS\);/);
});
