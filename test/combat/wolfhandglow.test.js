// The Morrowind werewolf's hands glow as the classic claws sprite does. The claws are a held item
// (systems/lycanthropy.js WERECLAWS_ITEM), so the rig's fists' glow read "a weapon in hand" and handed the wolf's hands
// none, while the classic claws wore their glow through the art's own ask (glowOf).
import '../modsOff.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inGlowSlot } from '../../src/render/renderer.js';
import { fpWeaponKey } from '../../src/combat/fpArm.js';
import { WERECLAWS_ITEM } from '../../src/systems/lycanthropy.js';

test('the wolf\'s hands take the claws\' glow on the Morrowind arm', () => {
  // the robe's hand rows are the fists' glow ranges
  for (const slot of ['right hand (werewolfrobe)', 'left hand (werewolfrobe)']) assert.equal(inGlowSlot({ slot }, 'hands'), true, slot);
  assert.equal(inGlowSlot({ slot: 'cuirass (werewolfrobe)' }, 'hands'), false, 'the fur is not a hand');
  // the claws are the empty hand to the arm, so its hand glow is drawn (fpArm handGlowShown's key gate)
  assert.equal(fpWeaponKey(WERECLAWS_ITEM, false), fpWeaponKey(null, false));
  // and the rig hands the arm the claws' own glow - the one the classic claws sprite wears
  const rig = readFileSync(new URL('../../src/combat/weapon/weaponRig.js', import.meta.url), 'utf8');
  assert.match(rig, /fpArm\.setHandGlow\?\.\(armItem\?\.werecreatureClaws \? glowOf\(armItem\) : /);
});

test('a peer\'s wolf: its hands wear their weapon aura (their kit\'s weapon piece), and none without one', async () => {
  const WG = await import('../../src/systems/weaponGlow.js');
  const { PeerBodies, peerBuildOpts } = await import('../../src/net/peer/peerBodies.js');
  const hand = [];
  const rig = { setSheathed() {}, readySpell() {}, release() {}, upperBodyReady: () => true, setWeapon: () => true, setWeaponGlow() {}, setOffWeaponGlow() {}, setHandGlow: (s) => hand.push(s) };
  const pb = new PeerBodies({ renderer: {}, createRig: () => ({}), buildOpts: peerBuildOpts });
  const look = { race: 'Breton', gender: 'male', faceIndex: 0, items: [] };
  pb._arm({ wolf: true, weapon: null, ammo: 0, held: false, swing: null, cast: null, rig }, { wd: 1, an: 0, cn: 0 }, look, '0000b');
  assert.deepEqual(hand.at(-1), WG.glowSpec('edge', WG.ARMORY_LEVEL), 'the Eternal Edge on the claws');
  pb._arm({ wolf: true, weapon: null, ammo: 0, held: false, swing: null, cast: null, rig }, { wd: 1, an: 0, cn: 0 }, look, null);
  assert.equal(hand.at(-1), null, 'no aura, no glow');
});
