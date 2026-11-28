import { ARMOR_ENUM as A, WEAPONS_ENUM as W } from '../combat/enemyEquipment.js';
import { ARMOR_MATERIAL as material } from '../systems/armorMaterials.js';
import { EQUIP_SLOTS as slot } from '../systems/equip.js';
import { MOBILE_TYPES as M } from './mobile/mobileTypes.js';
import { MENS, WOMENS } from './wardrobe.js';

const armor = (equipSlot, templateIndex, metal, model = {}) =>
  ({ equipSlot, templateIndex, group: 'Armor', material: metal, ...model });
const gauntlets = (metal, model) => armor(slot.Gloves, A.Gauntlets, metal, { __mwLook: model });
const ironGauntlets = gauntlets(material.Iron, 'iron_gauntlet');
const leatherGloves = gauntlets(material.Leather, 'netch_leather_gauntlet');
const leatherBracers = gauntlets(material.Leather, 'leather_bracer');
const clothBracers = gauntlets(material.Leather, 'cloth_bracer');
const furGloves = gauntlets(material.Leather, 'fur_gauntlet');
const weapon = (templateIndex, metal = 0, record = null) =>
  ({ equipSlot: slot.RightHand, templateIndex, group: 'Weapons', material: metal, ...(record ? { __mwLook: record } : {}) });

// The Orc sprites (TEXTURE.262/.267/.276/.279) show
// fixed silhouettes. DFU's EnemyEntity.SetEnemy rolls combat equipment;
// these pieces are only the 3D equivalent of the fixed sprite equipment.
const orcishShoulders = [
  armor(slot.LeftArm, A.Left_Pauldron, material.Orcish, { __mwLook: 'orcish_pauldron_left' }),
  armor(slot.RightArm, A.Right_Pauldron, material.Orcish, { __mwLook: 'orcish_pauldron_right' }),
];
const orcishCuirass = armor(slot.ChestArmor, A.Cuirass, material.Orcish, { __mwLook: 'orcish_cuirass' });
const thighPlates = armor(slot.LegsArmor, A.Greaves, material.Steel);
const axe = weapon(W['Battle Axe'], 1, 'steel war axe');
const roadRaiderArmor = [
  armor(slot.ChestArmor, A.Cuirass, material.Leather, { __mwLook: 'netch_leather_boiled_cuirass' }),
  armor(slot.LeftArm, A.Left_Pauldron, material.Leather, { __mwLook: 'netch_leather_pauldron' }),
  armor(slot.RightArm, A.Right_Pauldron, material.Leather, { __mwLook: 'netch_leather_pauldron' }),
  leatherGloves,
];
const shoulders = (metal, style, rightMetal = metal, rightStyle = style) => [
  armor(slot.LeftArm, A.Left_Pauldron, metal, { __mwLook: `${style}_pauldron` }),
  armor(slot.RightArm, A.Right_Pauldron, rightMetal, { __mwLook: `${rightStyle}_pauldron` }),
];
// These classes share their source sprites. Keep the metal shoulders and
// exposed upper arms, and distinguish the two roles by their layers.
const martialKits = new Map([
  [M.Warrior, [
    [
      armor(slot.Head, A.Helm, material.Steel, { __mwLook: 'steel_helm' }),
      armor(slot.ChestArmor, A.Cuirass, material.Steel, { __mwLook: 'steel_cuirass' }),
      ...shoulders(material.Steel, 'steel'),
      gauntlets(material.Steel, 'steel_gauntlet'),
      armor(slot.LegsArmor, A.Greaves, material.Steel, { __mwLook: 'steel_greaves' }),
      armor(slot.Feet, A.Boots, material.Steel, { __mwLook: 'steel_boots' }),
    ],
    [
      armor(slot.Head, A.Helm, material.Iron, { __mwLook: 'imperial_chain_coif_helm' }),
      armor(slot.ChestArmor, A.Cuirass, material.Iron, { __mwLook: 'iron_cuirass' }),
      ...shoulders(material.Iron, 'iron'),
      ironGauntlets,
      armor(slot.LegsArmor, A.Greaves, material.Iron, { __mwLook: 'iron_greaves' }),
      armor(slot.Feet, A.Boots, material.Iron, { __mwLook: 'iron_boots' }),
    ],
  ]],
  [M.Barbarian, [
    [armor(slot.ChestArmor, A.Cuirass, material.Iron, { __mwLook: 'nordic_iron_cuirass' }), ...shoulders(material.Iron, 'iron'), gauntlets(material.Leather, 'fur_bracer')],
    [armor(slot.ChestArmor, A.Cuirass, material.Chain, { __mwLook: 'nordic_ringmail_cuirass' }), ...shoulders(material.Iron, 'iron', material.Steel, 'steel'), furGloves],
  ]],
]);

const cuirass = (metal, model) => armor(slot.ChestArmor, A.Cuirass, metal, { __mwLook: model });
const helm = (metal, model) => armor(slot.Head, A.Helm, metal, { __mwLook: model });
const greaves = (metal, model) => armor(slot.LegsArmor, A.Greaves, metal, { __mwLook: model });
const sabatons = (metal, model) => armor(slot.Feet, A.Boots, metal, { __mwLook: model });
const shoulder = (side, metal, model) => side === 'left'
  ? armor(slot.LeftArm, A.Left_Pauldron, metal, { __mwLook: model })
  : armor(slot.RightArm, A.Right_Pauldron, metal, { __mwLook: model });

// Many Daggerfall careers share a sprite. Keep the family silhouette and
// distinguish each career by its cut and most visible layer before its colors.
const classKits = new Map([
  [M.Knight, {
    armor: [helm(material.Steel, 'imperial_helmet_armor'), cuirass(material.Steel, 'imperial_cuirass_armor'),
      ...shoulders(material.Steel, 'imperial'), gauntlets(material.Steel, 'imperial_gauntlet'),
      greaves(material.Steel, 'imperial_greaves'), sabatons(material.Steel, 'imperial_boots')],
    cloth: [{ cloak: 2 }, { cloak: 0 }],
  }],
  [M.Spellsword, {
    armor: [shoulder('right', material.Steel, 'steel_pauldron'), sabatons(material.Leather, 'netch_leather_boots'), leatherGloves],
    cloth: [{ top: 'misc_shirt08a', legs: 'misc_trsrs_03e', cloak: 0 }, { top: 'misc_shirt08b', legs: 'misc_trsrs_03c', cloak: 0 }],
  }],
  [M.Battlemage, {
    armor: [cuirass(material.Chain, 'bonemold_gah_julan_cuirass'), ...shoulders(material.Chain, 'bonemold_gah_julan'), gauntlets(material.Chain, 'bonemold_bracer')],
    cloth: [{ top: 'misc_shirt04a', legs: 'misc_trsrs_03e', boots: 'misc_boots_01e', cloak: 4 },
      { top: 'misc_shirt04b', legs: 'misc_trsrs_03c', boots: 'misc_boots_01b', cloak: 4 }],
  }],
  [M.Nightblade, {
    armor: [shoulder('left', material.Leather, 'chitin_pauldron'), leatherGloves],
    cloth: [{ top: 'misc_shirt11g', legs: 'misc_trsrs_03e', boots: 'misc_boots_01e' },
      { top: 'misc_shirt04b', legs: 'misc_trsrs_03d', boots: 'misc_boots_01e' }],
  }],
  [M.Mage, {
    cloth: [{ robe: 'barenziah_robe02', boots: 'highelf_boot_01a' }, { robe: 'highelf_robe_03a', boots: 'highelf_boot_01b' }],
  }],
  [M.Healer, {
    cloth: [{ robe: 'imperial_srct_robe01', boots: 'mlsnd_boot_02' }, { robe: 'mlsnd_robe_02x', boots: 'mlsnd_boot_02' }],
  }],
  [M.Sorcerer, {
    cloth: [{ robe: 'highelf_robe_03d', boots: 'misc_boots_01e' }, { robe: 'highelf_robe_03b', boots: 'misc_boots_01b', hands: clothBracers }],
  }],
  [M.Bard, {
    cloth: [{ top: 'misc_shirt11b', legs: 'misc_trsrs_03a', boots: 'highelf_boot_01c', cloak: 2 },
      { top: 'misc_shirt11e', legs: 'misc_trsrs_03c', boots: 'highelf_boot_01d', cloak: 2 }],
  }],
  [M.Burglar, {
    cloth: [{ top: 'misc_shirt06a', legs: 'misc_trsrs_03a', boots: 'misc_boots_01a' },
      { top: 'misc_shirt06b', legs: 'misc_trsrs_03f', boots: 'misc_boots_01d', hands: leatherBracers }],
  }],
  [M.Acrobat, {
    cloth: [{ top: 'misc_shirt02a', legs: 'misc_trsrs_03c', boots: 'highelf_boot_01b' },
      { top: 'misc_shirt02b', legs: 'misc_trsrs_03d', boots: 'highelf_boot_01d', hands: clothBracers }],
  }],
  [M.Thief, {
    cloth: [{ top: 'misc_shirt03a', legs: 'misc_trsrs_03e', boots: 'misc_boots_01e', cloak: 1 },
      { top: 'misc_shirt03b', legs: 'misc_trsrs_03d', boots: 'misc_boots_01b', cloak: 1, hands: leatherGloves }],
  }],
  [M.Assassin, {
    armor: [helm(material.Leather, 'netch_leather_helm'), cuirass(material.Leather, 'netch_leather_cuirass'), leatherGloves],
    cloth: [{ top: 'misc_shirt04b', legs: 'misc_trsrs_03e', boots: 'misc_boots_01e' },
      { top: 'misc_shirt11g', legs: 'misc_trsrs_03d', boots: 'misc_boots_01e' }],
  }],
  [M.Monk, {
    armor: [clothBracers],
    cloth: [{ top: 'misc_shirt10a', legs: 'misc_trsrs_03a', boots: 'mlsnd_boot_01' },
      { top: 'misc_shirt10d', legs: 'misc_trsrs_03f', boots: 'mlsnd_boot_01' }],
  }],
  [M.Archer, {
    armor: [shoulder('right', material.Leather, 'netch_leather_pauldron'), leatherBracers],
    cloth: [{ top: 'misc_shirt09a', legs: 'misc_trsrs_03e', boots: 'highelf_boot_01a' },
      { top: 'misc_shirt09b', legs: 'misc_trsrs_03c', boots: 'highelf_boot_01b' }],
  }],
  [M.Ranger, {
    armor: [shoulder('left', material.Leather, 'netch_leather_pauldron'), furGloves],
    cloth: [{ top: 'misc_shirt05a', legs: 'misc_trsrs_03f', boots: 'misc_boots_01a', cloak: 9 },
      { top: 'misc_shirt05b', legs: 'misc_trsrs_03a', boots: 'misc_boots_01d', cloak: 9 }],
  }],
  [M.Vampire, {
    cloth: [{ top: 'misc_shirt04b', legs: 'misc_trsrs_03e', boots: 'misc_boots_01e', cloak: 2 },
      { top: 'misc_shirt04a', legs: 'misc_trsrs_03d', boots: 'misc_boots_01e', cloak: 2, hands: leatherGloves }],
  }],
  [M.VampireAncient, {
    cloth: [{ robe: 'highelf_robe_03g', boots: 'highelf_boot_03a' }, { robe: 'barenziah_robe03', boots: 'misc_boots_01e' }],
  }],
]);
const kits = new Map([
  [M.Orc, [
    weapon(W.Saber), orcishCuirass, thighPlates,
    armor(slot.LeftArm, A.Left_Pauldron, material.Iron, { __mwLook: 'iron_pauldron_left' }),
    armor(slot.RightArm, A.Right_Pauldron, material.Iron, { __mwLook: 'iron_pauldron_right' }),
  ]],
  [M.OrcSergeant, [
    axe, ...orcishShoulders, ironGauntlets,
    armor(slot.Head, A.Helm, material.Iron, { __mwLook: 'trollbone_helm' }),
    armor(slot.ChestArmor, A.Cuirass, material.Iron, { __mwLook: 'trollbone_cuirass' }),
    armor(slot.LegsArmor, A.Greaves, material.Orcish, { __mwLook: 'orcish_greaves' }),
  ]],
  [M.OrcShaman, [weapon(W.Staff, 0, 'wooden staff')]],
  [M.OrcWarlord, [
    axe, ...orcishShoulders, orcishCuirass, ironGauntlets, thighPlates,
    armor(slot.Head, A.Helm, material.Iron, { __mwLook: 'nordic_iron_helm' }),
    armor(slot.Feet, A.Boots, material.Orcish, { __mwLook: 'orcish_boots' }),
  ]],
]);

// Give the reference colorway half the rolls and split the rest between its alternate dyes.
const SHAMAN_ROBES = ['war_khajiit_robe_01d', 'war_khajiit_robe_01d', 'war_khajiit_robe_01c', 'war_khajiit_robe_01e'];

export const hasEnemySpriteKit = (mobileType) => mobileType === M.Rogue || kits.has(mobileType) || martialKits.has(mobileType) || classKits.has(mobileType);

export function enemySpriteKitOf(look, hint) {
  const mobileType = hint?.spriteKit;
  const kit = kits.get(mobileType);
  const martial = martialKits.get(mobileType);
  const career = classKits.get(mobileType);
  if (!kit && !martial && !career && mobileType !== M.Rogue) return null;

  const female = look.gender === 'female';
  const clothes = female ? WOMENS : MENS;
  const group = female ? 'WomensClothing' : 'MensClothing';
  const garment = (equipSlot, templateIndex, dye, record = null) => ({
    equipSlot, templateIndex, group, dye, ...(record ? { __mwLook: record } : {}),
  });
  if (career) {
    const { top, legs, boots, cloak, robe, hands } = career.cloth[hint.seed & 1];
    return [
      ...(career.armor ?? []),
      ...(hands ? [hands] : []),
      ...(top ? [garment(slot.ChestClothes, clothes.shortShirts[0], 1, `war_${top}`)] : []),
      ...(legs ? [garment(slot.LegsClothes, clothes.casualPants, 1, `war_${legs}`)] : []),
      ...(boots ? [garment(slot.Feet, clothes.boots, 1, `war_${boots}`)] : []),
      ...(cloak != null ? [garment(slot.Cloak1, clothes.casualCloak, cloak)] : []),
      ...(robe ? [garment(slot.ChestClothes, clothes.plainRobes, 1, `war_${robe}`)] : []),
    ];
  }
  if (martial) {
    const variant = hint.seed & 1;
    const base = martial[variant];
    if (mobileType === M.Barbarian) return [...base,
      garment(slot.LegsClothes, clothes.casualPants, variant ? 2 : 1, variant ? 'war_misc_trsrs_03a' : 'war_misc_trsrs_03e'),
      garment(slot.Feet, clothes.boots, variant ? 3 : 1, variant ? 'war_misc_boots_01a' : 'war_misc_boots_01e'),
    ];
    return base;
  }
  if (mobileType === M.Rogue) {
    const ambusher = (hint.seed & 1) === 1;
    const trousers = garment(slot.LegsClothes, clothes.casualPants, 1, 'war_misc_trsrs_03e');
    if (ambusher) {
      return [
        leatherBracers,
        garment(slot.ChestClothes, clothes.shortShirts[0], 0, 'war_misc_shirt03b'),
        trousers,
        garment(slot.Feet, clothes.boots, 1, 'war_misc_boots_01e'),
        garment(slot.Cloak1, clothes.casualCloak, 1),
      ];
    }
    return [
      ...roadRaiderArmor,
      trousers,
      garment(slot.Feet, clothes.boots, 3, 'war_misc_boots_01a'),
    ];
  }
  if (mobileType === M.OrcShaman) {
    const robe = SHAMAN_ROBES[hint.seed & 3];
    return [...kit, garment(slot.ChestClothes, clothes.plainRobes, 3, robe)];
  }
  return [
    ...kit,
    ...(mobileType === M.OrcSergeant
      ? [garment(slot.Feet, clothes.tallBoots, 5, 'war_misc_boots_01a')] : []),
    ...(mobileType === M.OrcWarlord ? [garment(slot.Cloak1, clothes.casualCloak, 2)] : []),
  ];
}
