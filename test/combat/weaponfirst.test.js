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
