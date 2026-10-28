// LOAD-STALL 1 (the owner, 2026-10-28: "одна глобальная проблема во всех аспектах" - the loads, the freezes on an
// equip, a two-hander swung from a one-hand stance, the editor's look waiting for the next equip). Phase 1 of
// bible/07-Rendering/Load-Stalls.md: the stance, the editor, Better Bodies' bytes, the build's clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { identityChanged } from '../../src/ui/appearanceEditor.js';

const fpArm = readFileSync('src/combat/fpArm.js', 'utf8');
const rig = readFileSync('src/combat/weapon/weaponRig.js', 'utf8');
const editor = readFileSync('src/ui/appearanceEditor.js', 'utf8');
const pack = readFileSync('src/ui/enhanced/enhancedInventory.js', 'utf8');

test('APPLY-NOW: identityChanged - each field moves it, a missing head/hair/sex is null, race by case (mutants: a field unread, case read)', () => {
  const base = { race: 'nord', faceIndex: 3, female: true, headId: 'h1', hairId: 'r1' };
  assert.equal(identityChanged(base, { ...base, race: 'NORD' }), false);
  assert.equal(identityChanged(base, { ...base }), false);
  for (const [k, v] of [['race', 'breton'], ['faceIndex', 4], ['female', false], ['headId', 'h2'], ['hairId', null]]) {
    assert.equal(identityChanged(base, { ...base, [k]: v }), true, `${k} unread`);
  }
  assert.equal(identityChanged(null, base), true, 'nothing saved yet is a change');
  assert.equal(identityChanged({ race: 'nord', faceIndex: 0 }, { race: 'nord', faceIndex: 0, female: undefined, headId: '', hairId: null }), false);
});

test('APPLY-NOW: Done rebuilds the live body on a changed identity, and both edits drop the pack figure\'s picture (mutants: the rebuild unwired; a cache left)', () => {
  const done = editor.slice(editor.indexOf("done.addEventListener('click'"), editor.indexOf('footerActions.append'));
  assert.match(done, /identityChanged\(getAppearanceIdentity\(\), identity\) && typeof fpArm\?\.applyAppearanceIdentity === 'function'/);
  assert.match(done, /fpArm\.applyAppearanceIdentity\(identity\)/);
  for (const ev of ['mw-appearance-identity-change', 'mw-body-morph-change']) {
    const at = pack.indexOf(`addEventListener('${ev}'`);
    assert.ok(at >= 0, `${ev} unheard`);
    assert.match(pack.slice(at, at + 200), /_figureCache = \{ key: null, img: null \}/, `${ev} keeps the stale figure`);
  }
});

test('STANCE-FIRST: the swing waits for the hand the game asked for (mutants: the want unrecorded; the gate unwired; a refused swap locking the arm)', () => {
  const setWeapon = fpArm.slice(fpArm.indexOf('    setWeapon(item, {'), fpArm.indexOf('const key = fpWeaponKey(item, hasAmmo);', fpArm.indexOf('    setWeapon(item, {')));
  assert.ok(setWeapon.indexOf('wantKey = fpWeaponKey(item, hasAmmo);') >= 0 && setWeapon.indexOf('wantKey =') < setWeapon.indexOf('if (busy)'),
    'the asked-for hand is recorded before a busy rig queues it');
  assert.match(fpArm, /return wantKey === wornKey \|\| built\.weaponFailed === wantKey;/);
  const gate = rig.slice(rig.indexOf('function armCannotSwing()'), rig.indexOf('function armCannotSwing()') + 500);
  assert.match(gate, /if \(fpArm\.handSettled\?\.\(\) === false\) return true;/);
});

test('BB-ONCE: Better Bodies\' bytes are one array a build, rewritten on a copy once, and the skin dropped only when it moved (mutants: a copy per call; the decode dropped every build)', () => {
  const loader = fpArm.slice(fpArm.indexOf('async function loadBetterBodiesAssetBytes'), fpArm.indexOf('// Robert\'s first-person NIF'));
  assert.match(loader, /return pending;\s*\}/);
  assert.doesNotMatch(loader, /new Uint8Array\(await pending\)/);
  assert.match(fpArm, /rewriteBetterBodiesTextureStem\(rawBytes\.slice\(\), fromStem, toStem\)/);
  assert.equal((fpArm.match(/rewriteBetterBodiesTextureStem\(/g) ?? []).length, 2, 'one definition, one caller (preparedBetterBodiesBytes)');
  assert.equal((fpArm.match(/TEXTURE_CACHE\.delete\(/g) ?? []).length, (fpArm.match(/BB-ONCE: (the decoded skin is dropped|only when the bytes moved)/g) ?? []).length,
    'every skin drop is gated on a change');
});

test('LOAD-CLOCK: the build\'s line names the third-person body\'s own span', () => {
  assert.match(fpArm, /stage\('third'\);/);
  assert.match(fpArm, /third \$\{timings\.third\}/);
});
