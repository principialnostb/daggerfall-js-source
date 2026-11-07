// The toybox's item maker (src/systems/toybox/toyboxItem.js) and its grant as the game asks it (src/net/toyboxGrant.js):
// every wearable piece listed, a spec checked and made by the game's own producers, the item maker's own lists for an
// item, the special effects each piece may carry and how it carries them, the law's findings, and the grant's offline
// and online arms.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as TB from '../../src/systems/toybox/toyboxItem.js';
import { toyboxGrant, toyboxGrantText, TOYBOX_GRANT_PATH } from '../../src/net/toyboxGrant.js';
import { DEV_GRANT_PATH } from '../../server-account/src/devToybox.js';
import { weaponOfMaterial } from '../../src/combat/enemyEquipment.js';
import { itemFindings } from '../../src/systems/item/itemLaw.js';
import { isBound } from '../../src/systems/item/itemBound.js';
import { isAmmunition } from '../../src/systems/item/itemTemplates.js';
import { primaryPickerList, hasItemMakerFlag, ITEM_MAKER_FLAGS } from '../../src/systems/enchantmentCatalogue.js';
import * as SP from '../../src/systems/toybox/toyboxSpecial.js';
import { ENCHANTMENT_TYPES } from '../../src/formats/magicDef.js';
import { setIdOf } from '../../src/systems/sigil/sigilSets.js';
import { SIGIL_SET_IDS, SIGIL_STAGES } from '../../src/systems/sigil/sigil.js';
import { techniqueLineOf, powerOf } from '../../src/systems/loot/lootRarity.js';
import { techniquesFor } from '../../src/combat/technique/techniqueRoster.js';
import { validGildedMarks } from '../../src/systems/gilded.js';

const SWORD = { template: 120, material: 7 };

test('the catalogue: every wearable section, no ammunition, nothing a player cannot wear', () => {
  const c = TB.toyboxCatalogue();
  assert.deepEqual(c.map((s) => s.id), ['weapons', 'armor', 'shields', 'jewellery', 'mens', 'womens']);
  for (const s of c) assert.ok(s.items.length > 0, s.id);
  const all = c.flatMap((s) => s.items);
  assert.ok(all.some((i) => i.template === 120 && i.group === 'Weapons'), 'the Longsword');
  assert.ok(all.some((i) => i.template === 135 && i.group === 'Jewellery'), 'the Ring');
  assert.ok(c.find((s) => s.id === 'shields').items.every((i) => i.group === 'Armor'));
  assert.ok(!all.some((i) => i.group === 'Weapons' && isAmmunition({ templateIndex: i.template })), 'no arrows');
  assert.ok(!all.some((i) => ['Drugs', 'Books', 'Furniture'].includes(i.group)));
  for (const i of all) assert.deepEqual(TB.buildToyboxItem({ template: i.template, group: i.group }).findings, [], `${i.name} is lawful as made`);
});

test('a spec is made by the game\'s own producers, its typed fields laid on top', () => {
  const plain = TB.buildToyboxItem({ template: 120, material: 7 });
  assert.deepEqual(plain.item, weaponOfMaterial(120, 7), 'the same piece the game mints');
  const r = TB.buildToyboxItem({ template: 120, material: 7, name: '  Toy   Blade ', condition: 5, weight: 1.234, value: 9, bound: true });
  assert.deepEqual([r.item.name, r.item.currentCondition, r.item.weightInKg, r.item.value, r.item.bound], ['Toy Blade', 5, 1.23, 9, true]);
  assert.deepEqual(r.findings, [], 'a bound piece is lawful');
  assert.equal(isBound(r.item), true, 'and bound: never traded or dropped');
  assert.equal(TB.buildToyboxItem({ template: 120, material: 7, condition: 10 ** 9 }).item.currentCondition, plain.item.maxCondition, 'never past its most');
});

test('a spec out of its bounds is refused with its word', () => {
  const no = (spec) => TB.toyboxSpecOf(spec).error;
  assert.equal(no(null), 'toybox-template');
  assert.equal(no({ template: 78 }), 'toybox-template', 'a drug');
  assert.equal(no({ template: 131 }), 'toybox-template', 'an arrow');
  assert.equal(no({ template: 120, group: 'Armor' }), 'toybox-template');
  assert.equal(no({ template: 120, material: 0x0209 }), 'toybox-material', 'an armour\'s material on a weapon');
  assert.equal(no({ template: 135, material: 1 }), 'toybox-material', 'a ring takes none');
  assert.equal(no({ template: 120, weight: -1 }), 'toybox-field');
  assert.equal(no({ template: 120, value: 1.5 }), 'toybox-field');
  assert.equal(no({ template: 120, name: 'x'.repeat(TB.TOYBOX_NAME_MAX + 1) }), 'toybox-field');
  assert.equal(no({ template: 120, bound: 'yes' }), 'toybox-field');
  assert.equal(no({ template: 120, enchantments: [{ type: 'ExtraWeight', param: -1 }] }), 'toybox-enchant', 'a side effect is no power');
  assert.equal(no({ template: 120, sideEffects: [{ type: 'ExtraSpellPts', param: 0 }] }), 'toybox-enchant', 'nor a power a side effect');
  assert.equal(no({ template: 120, enchantments: [{ type: 'ExtraSpellPts', param: 999 }] }), 'toybox-enchant');
});

test('the add lists are the item maker\'s for the piece, and the law has the last word', () => {
  const sword = { template: 120, material: 9 };
  const powers = TB.toyboxEnchantChoices(sword, true).map((c) => c.type);
  assert.deepEqual(powers, primaryPickerList(true, { item: { group: 'Weapons', templateIndex: 120 } }));
  const ring = TB.toyboxEnchantChoices({ template: 135 }, true).map((c) => c.type);
  assert.ok(!ring.includes('PotentVs'), 'a weapon\'s power is not a ring\'s');
  const sides = TB.toyboxEnchantChoices(sword, false);
  assert.ok(sides.length && sides.every((c) => c.params.length), 'every side effect with a setting to take');
  const single = powers.find((t) => !hasItemMakerFlag(t, ITEM_MAKER_FLAGS.AllowMultiplePrimaryInstances));
  const onlyOne = { ...sword, enchantments: [{ type: single, param: TB.toyboxEnchantChoices(sword, true).find((c) => c.type === single).params[0].param }] };
  assert.ok(!TB.toyboxEnchantChoices(onlyOne, true).some((c) => c.type === single), `${single}: one of a kind`);
  const one = { ...sword, enchantments: [{ type: 'ExtraSpellPts', param: 0 }] };
  const params = TB.toyboxParamChoices(one, true, 0);
  assert.ok(params.length > 1 && params.some((p) => p.param === 0), 'its own setting among the others');
  const made = TB.buildToyboxItem({ ...one, sideEffects: [{ type: 'ExtraWeight', param: -1 }] });
  assert.deepEqual(made.findings, []);
  assert.equal(made.item.enchantments.length, 2);
  assert.ok(made.cost <= made.power);
  const dagger = { template: 113, material: 0, enchantments: ['ExtraSpellPts', 'RegensHealth', 'ImprovesTalents'].map((type) => ({ type, param: 0 })) };
  const over = TB.buildToyboxItem(dagger);
  assert.ok(over.cost > over.power && over.findings.includes('enchantments'), 'past its power, the law finds it');
  assert.deepEqual(over.findings, itemFindings(over.item));
});

test('the grant offline: one\'s own pack takes the piece; another account and an unlawful piece are refused', async () => {
  const pack = [];
  const r = await toyboxGrant({ spec: { template: 135, bound: true }, target: null, online: false, addToPack: (i) => pack.push(i) });
  assert.equal(r.ok, true);
  assert.deepEqual(pack, [r.item]);
  assert.equal(pack[0].bound, true);
  assert.deepEqual(await toyboxGrant({ spec: { template: 135 }, target: 'Ann', online: false, addToPack: (i) => pack.push(i) }), { ok: false, error: 'toybox-offline-target' });
  const bad = await toyboxGrant({ spec: { template: 113, material: 0, enchantments: ['ExtraSpellPts', 'RegensHealth', 'ImprovesTalents'].map((type) => ({ type, param: 0 })) }, target: null, online: false, addToPack: (i) => pack.push(i) });
  assert.equal(bad.error, 'toybox-unlawful');
  assert.equal(pack.length, 1);
  assert.match(toyboxGrantText('toybox-offline-target'), /needs the server/);
});

test('the grant online: the route asked with the spec; one\'s own is claimed at once, another\'s waits in their post', async () => {
  assert.equal(TOYBOX_GRANT_PATH, DEV_GRANT_PATH, 'the client and the service name one route');
  const calls = [], claims = [];
  const call = async (io, body) => {
    calls.push(body);
    return { ok: true, data: { ok: true, post: 'p'.repeat(24), item: { name: 'Ring' }, to: { self: body.to == null, name: body.to ?? 'Dev' } } };
  };
  const claim = async (id) => { claims.push(id); return { ok: true, item: { name: 'Ring', claimed: true } }; };
  const mine = await toyboxGrant({ spec: { template: 135 }, target: '  ', online: true, io: {}, claim, call });
  assert.deepEqual([calls[0].to, mine.ok, mine.item.claimed, claims], [null, true, true, ['p'.repeat(24)]]);
  const theirs = await toyboxGrant({ spec: { template: 135 }, target: 'Ann', online: true, io: {}, claim, call });
  assert.deepEqual([calls[1].to, theirs.ok, theirs.sent, claims.length], ['Ann', true, true, 1]);
  const refused = await toyboxGrant({ spec: { template: 135 }, target: null, online: true, io: {}, call: async () => ({ ok: false, error: 'not-developer' }) });
  assert.deepEqual(refused, { ok: false, error: 'not-developer' });
  const unclaimed = await toyboxGrant({ spec: { template: 135 }, target: null, online: true, io: {}, claim: async () => ({ ok: false, error: 'busy' }), call });
  assert.equal(unclaimed.error, 'claim', 'a claim that did not land: the piece waits in the mailbox');
});

const piece = (templateIndex, group) => ({ group, templateIndex });
const kinds = (list) => list.map((c) => `${c.kind}:${c.id}`);

test('special effects: each list holds what the piece may carry - sets, its family\'s moves, its group\'s lines', () => {
  const sword = SP.specialChoices(piece(120, 'Weapons'));
  assert.deepEqual([...new Set(sword.map((c) => c.section))], ['sets', 'moves', 'effects'], 'in the window\'s order');
  for (const id of SIGIL_SET_IDS) assert.ok(kinds(sword).includes(`set:${id}`), `${id}: a weapon counts in every set`);
  for (const id of techniquesFor({ group: 'Weapons', templateIndex: 120 })) assert.ok(kinds(sword).includes(`technique:${id}`));
  assert.ok(kinds(sword).includes('legendary:wyrmbane') && kinds(sword).includes('line:damage') && kinds(sword).includes('blow:sigil'));
  assert.ok(!kinds(sword).includes('line:armor') && !kinds(sword).includes('line:focus'), 'no armour\'s or jewel\'s line');
  assert.ok(sword.every((c) => c.name && c.does), 'each by its name, with what it does');
  const ring = SP.specialChoices(piece(135, 'Jewellery'));
  assert.ok(!ring.some((c) => c.kind === 'set' || c.kind === 'technique' || c.kind === 'blow'), 'a ring counts in no set and takes no move');
  assert.ok(kinds(ring).includes('line:focus') && !kinds(ring).includes('line:damage'));
  const cuirass = SP.specialChoices(piece(102, 'Armor'));
  assert.ok(kinds(cuirass).includes('line:armor') && kinds(cuirass).includes('set:malacath') && !cuirass.some((c) => c.kind === 'technique'));
  assert.ok(SP.specialChoices(piece(103, 'Armor')).some((c) => c.kind === 'technique'), 'the Gauntlets take the bare hand\'s');
  assert.ok(SP.specialChoices(piece(130, 'Weapons')).some((c) => c.kind === 'gilded' && c.id === 'the-hourlock'), 'a Long Bow may be the Hourlock');
  const held = [{ kind: 'line', id: 'stat', param: 'strength', value: 3 }];
  const stat = SP.specialChoices(piece(120, 'Weapons'), held).find((c) => c.id === 'stat');
  assert.ok(!stat.params.some((p) => p.param === 'strength'), 'a param held is not offered again');
});

test('special effects: the piece carries them as the game\'s own doors lay them, and the law takes the lawful', () => {
  const magic = TB.buildToyboxItem({ ...SWORD, special: [{ kind: 'technique', id: 'leap', value: 10 }, { kind: 'line', id: 'damage', value: 8 }, { kind: 'set', id: 'malacath', param: 2 }] });
  assert.deepEqual(magic.findings, []);
  assert.equal(magic.item.rarity, 'magic');
  assert.deepEqual(magic.item.affixes.at(-1), { id: 'technique', param: 'leap', value: 10 }, 'the technique line last');
  assert.deepEqual(techniqueLineOf(magic.item), { id: 'technique', param: 'leap', value: 10 });
  assert.equal(setIdOf(magic.item), 'malacath', 'a piece of the set its wearer counts');
  assert.equal(magic.item.sigil.xp, SIGIL_STAGES[2].xp);
  assert.ok(SP.specialLines(magic.item).includes("Set: Malacath's Bulwark (Bright)"), 'and its stats say so');
  const lines = [{ kind: 'line', id: 'damage', value: 12 }, { kind: 'line', id: 'leech', value: 5 }, { kind: 'line', id: 'stat', param: 'agility', value: 6 }, { kind: 'line', id: 'skill', param: 18, value: 12 }];
  const rare = TB.buildToyboxItem({ ...SWORD, tier: 'rare', flavour: 0, special: lines });
  assert.deepEqual(rare.findings, [], JSON.stringify(rare.findings));
  assert.equal(rare.item.enchantments[0].type, SP.rareFlavoursFor('Weapons')[0].type, 'a Rare\'s own enchantment first');
  const legend = TB.buildToyboxItem({ ...SWORD, special: [{ kind: 'legendary', id: 'wyrmbane' }] });
  assert.deepEqual([legend.item.rarity, legend.item.legendary, legend.item.name, legend.findings], ['legendary', 'wyrmbane', 'Wyrmbane', []]);
  assert.equal(powerOf(legend.item.legendary).name, 'Dragonsbane');
  const plate = TB.buildToyboxItem({ template: 102, material: 0, special: [{ kind: 'set', id: 'ruhn' }] });
  assert.deepEqual([plate.item.aetheric, plate.item.sigil.set, plate.findings], ['ruhn-warden-plate', 'ruhn', []], 'an Aetheric set makes its own piece');
  assert.equal(SP.specialMaterial(piece(102, 'Armor'), [{ kind: 'set', id: 'ruhn' }]), plate.item.material, 'of its own make');
  const gun = TB.buildToyboxItem({ template: 130, material: 0, special: [{ kind: 'gilded', id: 'the-hourlock' }] });
  assert.deepEqual([gun.item.gilded, gun.findings], ['the-hourlock', []]);
  assert.ok(validGildedMarks(gun.item));
});

test('special effects the law refuses online: marked, granted offline as made, and the spec bounded', async () => {
  const forged = { ...SWORD, special: [{ kind: 'line', id: 'damage', value: 8 }, { kind: 'set', id: 'ruhn' }] };
  const made = TB.buildToyboxItem(forged);
  assert.ok(made.findings.includes('sigil'), 'an Aetheric set on a piece that is not its record');
  assert.deepEqual(made.baseFindings, [], 'the piece without it is lawful');
  assert.deepEqual(TB.toyboxSpecialRefused(forged), [false, true]);
  assert.deepEqual(TB.toyboxSpecialRefused({ ...SWORD, special: [{ kind: 'line', id: 'damage', value: 40 }] }), [true], 'a value past its tier\'s band');
  const pack = [];
  const r = await toyboxGrant({ spec: forged, target: null, online: false, addToPack: (i) => pack.push(i) });
  assert.equal(r.ok, true, 'offline it goes in');
  assert.equal(setIdOf(pack[0]), 'ruhn');
  const no = (spec) => TB.toyboxSpecOf(spec).error;
  assert.equal(no({ template: 135, special: [{ kind: 'line', id: 'damage', value: 5 }] }), 'toybox-special', 'a weapon\'s line on a ring');
  assert.equal(no({ template: 135, special: [{ kind: 'set', id: 'malacath' }] }), 'toybox-special');
  assert.equal(no({ ...SWORD, special: [{ kind: 'line', id: 'damage', value: 41 }] }), 'toybox-special', 'past every band');
  assert.equal(no({ ...SWORD, special: [{ kind: 'technique', id: 'volley', value: 5 }] }), 'toybox-special', 'another family\'s move');
  assert.equal(no({ ...SWORD, special: [{ kind: 'legendary', id: 'wyrmbane' }, { kind: 'set', id: 'defender' }] }), 'toybox-special', 'one record');
  assert.equal(no({ ...SWORD, tier: 'legendary', special: [{ kind: 'line', id: 'damage', value: 5 }] }), 'toybox-special');
});

test('A RARE WEAPON\'S BONUSES: the special effects offer a found Rare\'s lines at its range; its own enchantment is the first Enchantments row that a found Rare carries, or the law asks for one', () => {
  const choices = SP.specialChoices(piece(120, 'Weapons')).filter((c) => c.section === 'effects' && c.kind === 'line');
  const damage = choices.find((c) => c.id === 'damage');
  assert.match(damage.does, /10-25/, 'a found Rare\'s range');
  assert.ok(!choices.some((c) => c.id === 'armor'), 'a weapon\'s lines alone');
  const lines = [{ kind: 'line', id: 'damage', value: 12 }, { kind: 'line', id: 'leech', value: 5 }, { kind: 'line', id: 'stat', param: 'agility', value: 6 }, { kind: 'line', id: 'skill', param: 18, value: 12 }];
  const bare = TB.buildToyboxItem({ ...SWORD, tier: 'rare', special: lines });
  assert.deepEqual([bare.item.rarity, bare.findings], ['rare', ['enchantments']], 'no own enchantment: the law asks for one');
  const own = TB.buildToyboxItem({ ...SWORD, tier: 'rare', special: lines, enchantments: [{ type: 'ExtraSpellPts', param: 0 }, { type: 'PotentVs', param: 1 }] });
  assert.deepEqual(own.findings, [], JSON.stringify(own.findings));
  assert.equal(own.item.enchantments.length, 2, 'the row moved, never doubled');
  assert.deepEqual([own.item.enchantments[0].type, own.item.enchantments[0].param, own.item.enchantments[0].enchantCost], [ENCHANTMENT_TYPES.PotentVs, 1, undefined], 'Potent vs Daedra first, the Rare\'s own');
});
