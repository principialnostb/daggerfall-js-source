// MWNPC12 (2026-10-10, the MW-NPC arc's twelfth slice - bible/04-Characters/Morrowind-NPCs.md section 17): THE STEEL
// THAT NEVER SHOWED, AND THE ORCS. Every look that dressed a body in steel without an equip table to read - the street's
// guard (MWNPC7), a knightly order's standing person (MWNPC8a), the rosters' steel classes (MWNPC10b) - wrote its
// material as 1, which names no armour material (systems/armorMaterials.js ARMOR_MATERIAL: steel is 0x0201), so
// formats/morrowind/mwItemMap.js mwArmorRecords resolved none of it and every one of them stood in their clothes - the ones whose
// boots took their feet barefoot. Now they wear ARMOR_MATERIAL.Steel, and this pins it through mwArmorRecords itself.
// And the orcs, Daggerfall's monsters that are people, stand in Morrowind's Orc body: a foe in its own equip table, a
// road's or a roster's in DFU's own kit for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownArmorModelFor } from '../../src/characters/ownModels/ownArmorModels.js';
import { peerBuildOpts, peerWeaponOf } from '../../src/net/peer/peerBodies.js';
import { mwArmorRecords } from '../../src/formats/morrowind/mwItemMap.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { ARMOR_ENUM, WEAPONS_ENUM as W } from '../../src/combat/enemyEquipment.js';
import { folkLook } from '../../src/characters/folkBodies.js';
import { GUARD_TEXTURE } from '../../src/characters/mobile/mobilePerson.js';
import { personLook } from '../../src/characters/peopleBodies.js';
import { RACES } from '../../src/systems/races.js';
import { GENDERS } from '../../src/characters/nameHelper.js';
import { SOCIAL_GROUPS, GUILD_GROUPS, FACTION_TYPES } from '../../src/formats/factionFile.js';
import { rosterLook, foeActor, isClassFoe, isPersonFoe, isBodyFoe, ORC_MOBILES } from '../../src/characters/foeBodies.js';
import { residentLook } from '../../src/characters/rosterBodies.js';
import { CREATURE_MATCH } from '../../src/characters/creatureBodies.js';
import { MOBILE_TYPES as M } from '../../src/characters/mobile/mobileTypes.js';
import { EQUIP_SLOTS } from '../../src/systems/equip.js';
import { createEquipTable } from '../../src/characters/equipTable.js';

/** Morrowind's own armour ids, as a retail archive carries them */
const MW_ARMOUR = ['steel_cuirass', 'steel_greaves', 'steel_boots', 'steel_pauldron_left', 'steel_pauldron_right', 'steel_gauntlet_left', 'steel_gauntlet_right', 'steel_helm',
  'iron_cuirass', 'iron_greaves', 'iron_boots', 'iron_pauldron_left', 'iron_pauldron_right', 'iron_helmet', 'iron_shield',
  'netch_leather_cuirass', 'netch_leather_greaves', 'netch_leather_boots', 'netch_leather_pauldron_left', 'netch_leather_pauldron_right', 'netch_leather_helm', 'netch_leather_shield',
  'chain_mail_cuirass', 'chain_mail_greaves', 'chain_mail_helm', 'steel_shield'].map((id) => ({ id }));
const armour = (look) => look.items.filter((it) => it.group === 'Armor');
const resolved = (it) => mwArmorRecords(MW_ARMOUR, it.templateIndex, it.material);

test('MWNPC12-1 every steel look is worn: the street\'s guard, a roster\'s steel class and the watch - each piece resolves to Morrowind\'s steel - and a knightly order\'s person a knight\'s whole plate of one metal Morrowind names (MWNPC17); the 1 they wore named no material at all', () => {
  const guard = folkLook({ archive: GUARD_TEXTURE, gender: GENDERS.Male, personFaceRecordId: 0, nameNPC: 'Gaius' }, 'Breton');
  const knight = personLook({}, { race: RACES.Nord, gender: GENDERS.Male, nameSeed: 77, hash: 5, factionID: 0, billboardArchiveIndex: 182, billboardRecordIndex: 1 },
    { type: FACTION_TYPES.Generic, sgroup: SOCIAL_GROUPS.Commoners, ggroup: GUILD_GROUPS.KnightlyOrder });
  // PIN MOVED (MWNPC17, section 25): a knightly order's person wears a KNIGHT's plate - one metal, by his rank
  // (characters/wardrobe.js ARMOR_KITS.knight), steel among them; the guard, the roster's steel class and the watch steel
  const kp = armour(knight);
  assert.ok(kp.length >= 5 && new Set(kp.map((it) => it.material)).size === 1, 'the knight: whole plate, one metal');
  for (const it of kp) assert.doesNotMatch(mwArmorRecords([], it.templateIndex, it.material).note, /no MW material/, 'a metal Morrowind names');
  const looks = { guard, warrior: rosterLook({}, { mobileType: M.Warrior, seed: 3 }), watch: rosterLook({}, { mobileType: M.Knight_CityWatch, seed: 3 }) };
  for (const [who, look] of Object.entries(looks)) {
    const plate = armour(look);
    assert.ok(plate.length >= 6, `${who}: in plate`);
    for (const it of plate) {
      const r = resolved(it);
      assert.equal(r.note, 'resolved', `${who}: piece ${it.templateIndex} worn (${r.note})`);
      assert.equal(r.material, 'steel', `${who}: in steel`);
    }
  }
  assert.match(mwArmorRecords(MW_ARMOUR, ARMOR_ENUM.Cuirass, 1).note, /no MW material for 1/, 'the 1 they wore: nothing');
});

const foe = ({ mobileType, slots = {}, isClass = mobileType >= 128 }) => {
  const equip = createEquipTable();
  for (const [k, v] of Object.entries(slots)) equip.slots[EQUIP_SLOTS[k]] = v;
  return { mobileType, marker: [3, 0, 7], gender: 'male', entity: { isClass, race: undefined, equip, items: [] }, ai: { feet: [1, 2, 3], yaw: 0, moving: false, giveUpTimer: 0 } };
};

test('MWNPC12-2 an orc foe is a person: not a class, not a creature - Morrowind\'s Orc, in the blade and the armour its own equip table holds, its clothes under; a class foe still the Bay\'s; a rat still its creature', () => {
  assert.deepEqual([...ORC_MOBILES].sort((a, b) => a - b), [M.Orc, M.OrcSergeant, M.OrcShaman, M.OrcWarlord].sort((a, b) => a - b));
  const blade = { templateIndex: W.Longsword, group: 'Weapons', material: 0 }, helm = { templateIndex: ARMOR_ENUM.Helm, group: 'Armor', material: ARMOR_MATERIAL.Iron };
  for (const t of ORC_MOBILES) {
    const o = foe({ mobileType: t, slots: { RightHand: blade, Head: helm } });
    assert.deepEqual([isClassFoe(o), isPersonFoe(o), isBodyFoe(o)], [false, true, true], `${t}`);
    const look = foeActor(o).look;
    assert.equal(look.race, 'Orc', 'Morrowind\'s Orc');
    assert.ok(look.items.some((it) => it.templateIndex === W.Longsword) && look.items.some((it) => it.templateIndex === ARMOR_ENUM.Helm), 'what its table holds');
    assert.ok(look.items.some((it) => it.equipSlot === EQUIP_SLOTS.ChestClothes), 'its clothes under');
    assert.ok(CREATURE_MATCH[t].miss, 'never a creature');
  }
  assert.notEqual(foeActor(foe({ mobileType: M.Thief })).look.race, 'Orc', 'a class foe the Bay\'s');
  assert.deepEqual(foeActor(foe({ mobileType: M.Rat })).look, { creature: ['rat'] });
  assert.equal(isPersonFoe(foe({ mobileType: M.Rat })), false);
});

test('city watch wears the same plate on patrol, in combat, and in a roster', () => {
  const patrol = folkLook({ archive: GUARD_TEXTURE, gender: GENDERS.Male }, 'Breton');
  const blade = { templateIndex: W.Longsword, group: 'Weapons', material: 0 };
  const leather = { templateIndex: ARMOR_ENUM.Cuirass, group: 'Armor', material: ARMOR_MATERIAL.Leather };
  const guard = foe({ mobileType: M.Knight_CityWatch, slots: { RightHand: blade, ChestArmor: leather } });
  assert.deepEqual(armour(foeActor(guard).look), armour(patrol));
  assert.deepEqual(armour(rosterLook({}, { mobileType: M.Knight_CityWatch })), armour(patrol));
  const resident = residentLook({}, { id: 'watch', cls: M.Warrior, race: 'Breton', sex: 'male' }, { guard: true });
  assert.deepEqual(armour(resident), armour(patrol));
  assert.equal(peerWeaponOf(foeActor(guard).look).templateIndex, W.Longsword);
  guard.raidBearer = true;
  assert.equal(armour(foeActor(guard).look)[0].material, ARMOR_MATERIAL.Leather);
});

test('enemy frames and sprite equipment follow the mobile through the body compositor', () => {
  const look = (mobileType, slots) => foeActor(foe({ mobileType, slots })).look;
  const warrior = look(M.Warrior);
  const orc = look(M.Orc);
  const sergeant = look(M.OrcSergeant);
  const warlord = look(M.OrcWarlord);
  assert.ok(warrior.npcFrame.width < orc.npcFrame.width);
  assert.ok(orc.npcFrame.width < sergeant.npcFrame.width);
  assert.ok(sergeant.npcFrame.width < warlord.npcFrame.width);
  assert.deepEqual(peerBuildOpts(warlord).npcFrame, warlord.npcFrame);

  const shaman = look(M.OrcShaman);
  assert.ok(shaman.npcFrame.width < orc.npcFrame.width);
  const shield = { templateIndex: ARMOR_ENUM.Buckler, group: 'Armor', material: ARMOR_MATERIAL.Leather };
  const blade = { templateIndex: W.Longsword, group: 'Weapons', material: 0 };
  const equippedShaman = look(M.OrcShaman, { LeftHand: shield, RightHand: blade });
  assert.equal(equippedShaman.items.find(item => item.equipSlot === EQUIP_SLOTS.RightHand).templateIndex, W.Longsword);
  assert.equal(equippedShaman.items.find(item => item.equipSlot === EQUIP_SLOTS.LeftHand).templateIndex, ARMOR_ENUM.Buckler);
  assert.equal(peerWeaponOf(equippedShaman).templateIndex, W.Staff);
  assert.equal(peerWeaponOf(equippedShaman, { lh: true }), null);
  assert.ok(!peerBuildOpts(equippedShaman).armor.some(piece => [ARMOR_ENUM.Buckler, ARMOR_ENUM.Helm, ARMOR_ENUM.Cuirass].includes(piece.templateIndex)));
  for (const mobileType of ORC_MOBILES) {
    for (const gender of ['male', 'female']) {
      const outfit = peerBuildOpts(rosterLook({}, { mobileType, gender, seed: 9 })).armor;
      const clothes = outfit.filter(piece => piece.kind === 'clothing');
      assert.ok(clothes.every(piece => (mobileType === M.OrcShaman ? /Robes/ : /Boots|Cloak/).test(piece.name)));
      if (mobileType === M.OrcShaman) assert.equal(clothes.length, 1);
      const greaves = outfit.find(piece => piece.templateIndex === ARMOR_ENUM.Greaves);
      if (mobileType === M.OrcShaman) {
        assert.equal(greaves, undefined);
      } else if (mobileType === M.OrcSergeant) {
        assert.equal(greaves.mwRecord, 'orcish_greaves');
      } else {
        assert.deepEqual(ownArmorModelFor(greaves).parts.map(({ part, model }) => [part, model]), [
          ['right upper leg', 'steel_plate_greave_right.nif'],
          ['left upper leg', 'steel_plate_greave_left.nif'],
        ]);
      }
      const drawsBoots = outfit.some(piece => piece.templateIndex === ARMOR_ENUM.Boots || piece.name?.includes('Boots'));
      assert.equal(drawsBoots, mobileType === M.OrcSergeant || mobileType === M.OrcWarlord);
    }
  }
  assert.equal(peerWeaponOf(orc).templateIndex, W.Saber);
  assert.equal(warrior.npc.spriteKit, M.Warrior);
  for (const armored of [sergeant, warlord]) assert.equal(peerWeaponOf(armored).templateIndex, W['Battle Axe']);
  assert.ok(peerBuildOpts(warlord).armor.some(piece => piece.name?.endsWith('Cloak') && piece.dye === 2));
  assert.ok(peerBuildOpts(sergeant).armor.some(piece => piece.mwRecord === 'trollbone_helm'));
  assert.ok(peerBuildOpts(warlord).armor.some(piece => piece.mwRecord === 'nordic_iron_helm'));
  assert.ok(peerBuildOpts(orc).armor.every(piece => piece.templateIndex !== ARMOR_ENUM.Helm));
  assert.ok(!peerBuildOpts(sergeant).armor.some(piece => piece.name?.endsWith('Cloak')));
  assert.equal(peerWeaponOf(rosterLook({}, { mobileType: M.OrcShaman, seed: 9 })).templateIndex, W.Staff);

  const ally = foe({ mobileType: M.Warrior, slots: { RightHand: blade } });
  ally.companion = {};
  assert.equal(peerWeaponOf(foeActor(ally).look).templateIndex, W.Longsword);
  assert.equal(rosterLook({}, { mobileType: M.Warrior }).npcFrame, undefined);
  assert.deepEqual(rosterLook({}, { mobileType: M.Warrior, enemy: true, person: warrior.npc.seed }).npcFrame, warrior.npcFrame);
});

test('enemy faces and frames vary by identity and stay consistent across the roster', () => {
  const looks = Array.from({ length: 16 }, (_, person) => rosterLook({}, {
    mobileType: M.Ranger, person, race: 'DarkElf', enemy: true,
  }));
  assert.ok(looks.every(look => look.race === 'DarkElf' && look.npc.hairColor));
  assert.ok(new Set(looks.map(look => look.npc.hairColor)).size >= 3);
  assert.ok(new Set(looks.map(look => `${look.npcFrame.width}/${look.npcFrame.height}`)).size >= 6);
  assert.ok(new Set(looks.map(look => peerBuildOpts(look).npcFace.hair)).size >= 12);
});

test('hostile rogues choose a fixed outfit and keep their equipped weapons', () => {
  for (const gender of ['male', 'female']) {
    const rogue = (person, enemy) => rosterLook({}, { mobileType: M.Rogue, gender, person, enemy });
    const raider = peerBuildOpts(rogue(4, true));
    const ambusher = peerBuildOpts(rogue(5, true));
    assert.ok(raider.armor.some(piece => piece.mwRecord === 'netch_leather_boiled_cuirass'));
    assert.ok(ambusher.armor.some(piece => piece.name === 'Casual Cloak' && piece.dye === 1));
    for (const look of [raider, ambusher]) {
      assert.ok(look.armor.some(piece => piece.mwRecord === 'war_misc_trsrs_03e'));
    }
    assert.deepEqual(raider.weapon, peerBuildOpts(rogue(4, false)).weapon);
    assert.deepEqual(ambusher.weapon, peerBuildOpts(rogue(5, false)).weapon);
    assert.equal(rogue(4, false).npc.spriteKit, undefined);
  }
});

test('hostile warriors and barbarians choose coordinated kits and retain their weapons', () => {
  const expected = new Map([
    [M.Warrior, ['steel_cuirass', 'iron_cuirass']],
    [M.Barbarian, ['nordic_iron_cuirass', 'nordic_ringmail_cuirass']],
  ]);
  for (const [mobileType, cuirasses] of expected) {
    for (const gender of ['male', 'female']) {
      for (const person of [0, 1]) {
        const look = (enemy) => rosterLook({}, { mobileType, gender, person, enemy });
        const kit = peerBuildOpts(look(true));
        assert.equal(kit.armor.find((p) => p.templateIndex === ARMOR_ENUM.Cuirass)?.mwRecord, cuirasses[person]);
        assert.equal(kit.armor.some((p) => p.templateIndex === ARMOR_ENUM.Helm), mobileType === M.Warrior);
        if (mobileType === M.Warrior) {
          const metal = person === 0 ? 'steel' : 'iron';
          assert.equal(kit.armor.find((p) => p.templateIndex === ARMOR_ENUM.Greaves)?.mwRecord, `${metal}_greaves`);
          assert.equal(kit.armor.find((p) => p.templateIndex === ARMOR_ENUM.Boots)?.mwRecord, `${metal}_boots`);
          assert.equal(kit.armor.find((p) => p.templateIndex === ARMOR_ENUM.Gauntlets)?.mwRecord, `${metal}_gauntlet`);
        }
        assert.deepEqual(kit.weapon, peerBuildOpts(look(false)).weapon);
        assert.equal(look(false).npc.spriteKit, undefined);
      }
    }
  }
});

test('hostile kits distinguish plate gauntlets, travel gloves and hand wraps without replacing the race', () => {
  const pairOf = (mobileType, person) => {
    const look = rosterLook({}, { mobileType, person, enemy: true, race: 'DarkElf' });
    const kit = peerBuildOpts(look);
    assert.equal(kit.race, 'dark elf');
    return kit.armor.find((piece) => piece.templateIndex === ARMOR_ENUM.Gauntlets)?.mwRecord;
  };
  for (const person of [0, 1]) {
    assert.equal(pairOf(M.Knight, person), 'imperial_gauntlet');
    assert.equal(pairOf(M.Archer, person), 'leather_bracer');
    assert.equal(pairOf(M.Ranger, person), 'fur_gauntlet');
    assert.equal(pairOf(M.Monk, person), 'cloth_bracer');
    assert.equal(pairOf(M.Healer, person), undefined);
  }
  assert.equal(pairOf(M.Thief, 0), undefined);
  assert.equal(pairOf(M.Thief, 1), 'netch_leather_gauntlet');
});

test('each hostile career and vampire rank has distinct kit variants while keeping its weapons', () => {
  const careers = Object.values(M).filter((id) => id >= M.Mage && id <= M.Knight);
  const humanoids = [...careers, M.Vampire, M.VampireAncient];
  for (const gender of ['male', 'female']) {
    const signatures = new Set();
    for (const mobileType of humanoids) {
      for (const person of [0, 1]) {
        const look = (enemy) => rosterLook({}, { mobileType, gender, person, enemy });
        const hostile = look(true);
        assert.equal(hostile.npc.spriteKit, mobileType);
        const outfit = peerBuildOpts(hostile);
        const signature = JSON.stringify(outfit.armor.map((p) => [p.templateIndex, p.mwRecord, p.dye]));
        assert.ok(!signatures.has(signature), `${mobileType}/${person} duplicates another kit`);
        signatures.add(signature);
        assert.deepEqual(outfit.weapon, peerBuildOpts(look(false)).weapon);
      }
    }
  }
});

test('orc shaman robes retain their cut and vary predictably with the actor seed', () => {
  const robes = new Map();
  for (let person = 0; person < 4; person++) {
    const options = { mobileType: M.OrcShaman, person };
    const robeOf = gender => peerBuildOpts(rosterLook({}, { ...options, gender })).armor
      .find(piece => piece.kind === 'clothing').mwRecord;
    const robe = robeOf('male');
    assert.equal(robeOf('female'), robe);
    assert.equal(robeOf('male'), robe);
    robes.set(robe, (robes.get(robe) ?? 0) + 1);
  }
  assert.deepEqual(robes, new Map([
    ['war_khajiit_robe_01d', 2],
    ['war_khajiit_robe_01c', 1],
    ['war_khajiit_robe_01e', 1],
  ]));
});

test('MWNPC12-3 an orc with no table to read (a road\'s, a roster\'s) wears DFU\'s own kit for it: the orc and its shaman a one-hander and half the time a shield, half their armour; the sergeant and the warlord a two-hander, three pieces in four and nine in ten; the armour leather, chain or plate by DFU\'s odds - and a caravan beset by orcs is beset by Orcs', () => {
  const one = [W.Broadsword, W.Saber, W.Longsword], two = [W.Claymore, W['Dai-Katana'], W.Mace, W.Flail, W.Warhammer, W['Battle Axe']];
  const odds = { [M.Orc]: 0.5, [M.OrcShaman]: 0.5, [M.OrcSergeant]: 0.75, [M.OrcWarlord]: 0.9 };
  const mats = new Map();
  for (const t of ORC_MOBILES) {
    let pieces = 0, shields = 0;
    const N = 300;
    for (let s = 0; s < N; s++) {
      const l = rosterLook({}, { mobileType: t, seed: s });
      assert.equal(l.race, 'Orc');
      const w = l.items.filter((it) => it.group === 'Weapons');
      assert.equal(w.length, 1);
      assert.ok((odds[t] === 0.5 ? one : two).includes(w[0].templateIndex), `${t}: its variant's blade (${w[0].templateIndex})`);
      const a = armour(l);
      const sh = a.filter((it) => it.equipSlot === EQUIP_SLOTS.LeftHand);
      shields += sh.length;
      assert.ok(sh.every((it) => it.templateIndex >= ARMOR_ENUM.Buckler && it.templateIndex <= ARMOR_ENUM.Round_Shield), 'a buckler or a round shield');
      pieces += a.length - sh.length;
      for (const it of a) mats.set(it.material, (mats.get(it.material) ?? 0) + 1);
    }
    const share = pieces / (N * 6);
    assert.ok(Math.abs(share - odds[t]) < 0.08, `${t}: each piece at ${odds[t]} (${share.toFixed(2)})`);
    if (odds[t] === 0.5) assert.ok(Math.abs(shields / N - 0.5) < 0.1, `${t}: a shield half the time (${shields / N})`);
    else assert.equal(shields, 0, `${t}: two hands on the blade`);
  }
  const total = [...mats.values()].reduce((a, b) => a + b, 0);
  const of = (m) => (mats.get(m) ?? 0) / total;
  assert.ok(Math.abs(of(ARMOR_MATERIAL.Leather) - 0.69) < 0.06, `leather below 70 (${of(ARMOR_MATERIAL.Leather).toFixed(2)})`);
  assert.ok(Math.abs(of(ARMOR_MATERIAL.Chain) - 0.2) < 0.05, `chain to 89 (${of(ARMOR_MATERIAL.Chain).toFixed(2)})`);
  assert.ok(of(ARMOR_MATERIAL.Iron) > 0.02 && of(ARMOR_MATERIAL.Steel) > 0.02 && [...mats.keys()].every((m) => [ARMOR_MATERIAL.Leather, ARMOR_MATERIAL.Chain, ARMOR_MATERIAL.Iron, ARMOR_MATERIAL.Steel].includes(m)), 'plate iron or steel, nothing else');
  const beset = residentLook({}, { id: 'enc:0', cls: M.Orc, sex: 'male', name: '' });
  assert.equal(beset?.race, 'Orc', 'the road\'s orcs in their bodies');
  assert.ok(armour(rosterLook({}, { mobileType: M.OrcWarlord, seed: 1 })).every((it) => it.material !== 1), 'never the 1 that named nothing');
});
