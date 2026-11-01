import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLICK_ATTACK_DIRECTIONS, CLICK_REPEAT_MAX, clickFamilyOf, rollClickDirection } from '../../src/characters/weaponStates.js';
import { PlayerWeapon } from '../../src/combat/playerWeapon.js';

// CLICK-VARIETY (2026-10-26, Mac: "one animation five times is not an interesting pool, it is strange combat"): the
// click's roll never shows one blow more than CLICK_REPEAT_MAX times running; the gesture's drag is never touched.

test('CLICK-VARIETY: the families - the three downward strikes one chop, the two sides one slash, up the thrust', () => {
  assert.deepEqual(CLICK_ATTACK_DIRECTIONS.map(clickFamilyOf), ['thrust', 'slash', 'slash', 'chop', 'chop', 'chop']);
  for (const s of ['StrikeDown', 'StrikeDownLeft', 'StrikeDownRight']) assert.equal(clickFamilyOf(s), 'chop');
  assert.equal(clickFamilyOf('StrikeLeft'), 'slash');
  assert.equal(clickFamilyOf('StrikeRight'), 'slash');
  assert.equal(clickFamilyOf('StrikeUp'), 'thrust');
});

test('CLICK-VARIETY: a family shown CLICK_REPEAT_MAX times running is rolled again over the others, uniform among them', () => {
  assert.equal(CLICK_REPEAT_MAX, 2);
  const at = (r) => () => r;
  // no run: DFU's own uniform roll over the six
  assert.equal(rollClickDirection(at(0.99), []), 'DownRight');
  assert.equal(rollClickDirection(at(0.99), ['chop']), 'DownRight', 'one chop is no run');
  assert.equal(rollClickDirection(at(0.99), ['slash', 'chop']), 'DownRight', 'two different blows are no run');
  // two chops running: the roll is over UpRight, Left, Right
  assert.equal(rollClickDirection(at(0.99), ['chop', 'chop']), 'Right');
  assert.equal(rollClickDirection(at(0), ['chop', 'chop']), 'UpRight');
  for (let r = 0; r < 1; r += 0.01) assert.notEqual(clickFamilyOf(rollClickDirection(at(r), ['chop', 'chop'])), 'chop');
  for (let r = 0; r < 1; r += 0.01) assert.notEqual(clickFamilyOf(rollClickDirection(at(r), ['slash', 'slash'])), 'slash');
});

test('CLICK-VARIETY: a long run of clicks never shows one blow three times running, and still shows all three', () => {
  let seed = 7;
  const rolls = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const recent = [];
  const seen = new Map();
  let run = 0; let last = null;
  for (let i = 0; i < 3000; i++) {
    const f = clickFamilyOf(rollClickDirection(rolls, recent));
    recent.push(f); if (recent.length > CLICK_REPEAT_MAX) recent.shift();
    run = f === last ? run + 1 : 1; last = f;
    assert.ok(run <= CLICK_REPEAT_MAX, `blow ${i}: ${f} ${run} times running`);
    seen.set(f, (seen.get(f) ?? 0) + 1);
  }
  for (const f of ['chop', 'slash', 'thrust']) assert.ok(seen.get(f) > 300, `${f} still in the pool (${seen.get(f)})`);
});

test('CLICK-VARIETY: the weapon keeps the families of the blows it BEGAN - a click the machine refuses is not one shown', () => {
  const pw = new PlayerWeapon();
  let started = 0;
  pw._attack = () => (++started % 2 === 0);   // every other click refused
  for (let i = 0; i < 6; i++) pw.clickAttack(() => 0.99);   // DownRight: a chop each time it is allowed
  assert.ok(pw._clickFamilies.length <= CLICK_REPEAT_MAX);
  assert.ok(pw._clickFamilies.every((f) => typeof f === 'string'));
  // two chops shown: the next allowed click is not a chop
  const pw2 = new PlayerWeapon();
  pw2._attack = () => true;
  const shown = [0, 1, 2].map(() => pw2.clickAttack(() => 0.99));
  assert.deepEqual(shown.map(clickFamilyOf), ['chop', 'chop', 'slash']);
  // two chops REFUSED (a held button over a busy machine) are no run: the first chop shown is still a chop
  const pw3 = new PlayerWeapon();
  const answers = [false, false, true];
  pw3._attack = () => answers.shift() ?? true;
  pw3.clickAttack(() => 0.99); pw3.clickAttack(() => 0.99);
  assert.equal(pw3.clickAttack(() => 0.99), 'StrikeDownRight');
});
