// What the Replacements pane offers to replace, tab by tab, and how it reads each picture's original.
//
// An item is one thing a player knows by name (a Rat, a Dagger, a town guard, a city wall set). Its pictures are
// TEXTURE records and frames: `sources` names the archives (and the records, where an item is part of an archive),
// and `pictures` lists them outright where the catalog already knows them. The player's body is drawn from the body
// sprites the game ships, keyed the same way, so its items read their originals from those (`sprites`).
import { t, getLocalizedItemName, getLocalizedEnemyName, getLocalizedMagicItemName } from '../textManager.js';
import { ITEM_TEMPLATES, GROUP_TEMPLATE_INDICES, inventoryItemImage, customTemplateRows, customItemsForGroup } from '../item/itemTemplates.js';
import { ENEMY_BASICS, enemyDisplayName } from '../../characters/enemy/enemyBasics.js';
import { PERSON_TEXTURES, GUARD_TEXTURE } from '../../characters/mobile/mobilePerson.js';
import { NPC_FLAT_ARCHIVES } from '../../world/npcFlatArchives.js';
import { designForArchive } from '../../characters/villagerDesigns.js';
import { CLASS_SKINS, EOTB_FOOT_SET_COUNT } from '../../player/classSkins.js';
import { ARCHIVE_FOOT, ARCHIVE_HORSE, ARCHIVE_LYCAN } from '../../player/eyeOfTheBeholder/eotbBillboard.js';
import { MOD_SETTINGS } from '../modSettings.js';
import { CLIMATE_SET_NAMES, getClimateTextureInfo } from '../../world/climateSwaps.js';
import { FlatsFile } from '../../formats/flatsFile.js';
import { classicRecords } from './classicRecords.js';
import { vendorRecordCount, vendorFrameCount, isVendorArchive, pictureBelowPlayer, standInArchives } from '../textureReplacement.js';
import { MATERIAL_NAMES } from '../item/itemInfo.js';
import { DYE_COLORS, dyeToken } from '../../characters/dyes.js';
import { WEAPONS, WEAPON_MATERIALS, weaponDyeColor } from '../../characters/weapons.js';
import { cifPictureName, HELD_MAP_PICTURE, PORT_PAINTINGS } from './playerPictures.js';
import { SPELL_ICON_FILE, SPELL_ICON_CELL, spellIconPictureName, cutIcon, overhaulIconSheet } from './spellIconSheet.js';
import { PAINTED_SETS, paintedPictures, paintedPicture } from './paintedArt.js';
import { SPELL_ICON_COUNT } from '../spell/spellMaker.js';
import { RACE_TEMPLATES, raceByKey } from '../races.js';
import { dfmodImgImage, dfmodCifRciImage, hasDfmodImg, hasDfmodCifRciFile } from '../dfmodTextures.js';
import { packImgUrl, packBytes } from '../uiPack.js';
import { DIVERSE_WEAPONS_STEMS } from '../../combat/diverseWeapons/diverseWeaponsIndex.js';

/** The tabs, in the order the pane shows them. */
export const REPLACEMENT_TABS = Object.freeze(['player', 'gear', 'items', 'magic', 'enemies', 'npcs', 'world']);
/** The first of the five spell missile archives, Fire to Magic (systems/spellcast.js missileArchive). */
const MISSILE_ARCHIVE = 375;
const ELEMENT_WORDS = Object.freeze([
  () => t('menu.repl.fire', 'Fire'),
  () => t('menu.repl.cold', 'Cold'),
  () => t('menu.repl.poison', 'Poison'),
  () => t('menu.repl.shock', 'Shock'),
  () => t('menu.repl.magic', 'Magic'),
]);

/**
 * @typedef {{ archive: number, record: number, frame: number }} ReplacementPicture
 * @typedef {{ archive: number, records?: number[] }} ReplacementSource
 * @typedef {{ id: string, name: string, tab: string, sources: ReplacementSource[], pictures?: ReplacementPicture[], sprites?: boolean,
 *   group?: string, templateIndex?: number, metals?: boolean, hands?: string, castElement?: number, race?: string, spellIcons?: boolean,
 *   paintings?: string[], paintingNote?: () => string, curses?: boolean, sheetFile?: string, artifact?: object, riding?: boolean }} ReplacementItem
 */

/** Every TEXTURE archive the freeware data carries, as ranges; .215, .217 and .436 the reader cannot read. */
const CLASSIC_TEXTURE_RANGES = Object.freeze([
  [0, 20], [22, 31], [33, 33], [35, 50], [53, 77], [79, 186], [190, 190], [194, 195], [197, 214], [216, 216],
  [218, 218], [233, 242], [245, 293], [295, 366], [368, 372], [374, 420], [422, 435], [437, 440], [442, 470],
  [473, 495], [500, 511],
]);
export const CLASSIC_TEXTURE_ARCHIVES = Object.freeze(
  CLASSIC_TEXTURE_RANGES.flatMap(([first, last]) => Array.from({ length: last - first + 1 }, (_, i) => first + i)),
);
/** The paper doll's item archives (weapons, clothing, armour, gems and ingredients): the Gear tab's, not the World's. */
const GEAR_ARCHIVES = Object.freeze({ first: 233, last: 254 });

const byName = (first, second) => first.name.localeCompare(second.name);
/** One picture per archive and record, frame 0: the shape of a list an item names outright. */
const sourcesOf = (pictures) => {
  const records = new Map();
  for (const picture of pictures) {
    if (!records.has(picture.archive)) records.set(picture.archive, new Set());
    records.get(picture.archive).add(picture.record);
  }
  return [...records].map(([archive, recordSet]) => ({ archive, records: [...recordSet].sort((a, b) => a - b) }));
};

// ---- Player -------------------------------------------------------------------------------------------------------

/** A body set's pictures, from the sprite keys the game ships (`112364_0-0`), in record and frame order. */
function spritePictures(spriteKeys, archive) {
  const pictures = [];
  for (const key of spriteKeys) {
    const match = /^(\d+)_(\d+)-(\d+)$/.exec(key);
    if (match && Number(match[1]) === archive) pictures.push({ archive, record: Number(match[2]), frame: Number(match[3]) });
  }
  return pictures.sort((a, b) => a.record - b.record || a.frame - b.frame);
}
/** The Player tab's items from the body's sprite keys: every on-foot look and class skin, the riders and the two beast
 *  forms, named as the Skin card names them. */
export function playerItemsFrom(spriteKeys) {
  const keys = MOD_SETTINGS['eye-of-the-beholder']?.keys ?? {};
  const footNames = [...(keys['Graphics.OnFoot']?.labels ?? [])];
  const horseNames = [...(keys['Graphics.OnHorse']?.labels ?? [])];
  const items = [];
  const add = (id, name, archive) => {
    const pictures = spritePictures(spriteKeys, archive);
    if (pictures.length) items.push({ id, name, tab: 'player', sprites: true, pictures, sources: sourcesOf(pictures) });
  };
  for (let set = 0; set < EOTB_FOOT_SET_COUNT; set++)
    add(`foot-${set}`, t('menu.repl.onFoot', 'On foot: {look}', { look: footNames[set] ?? String(set + 1) }), ARCHIVE_FOOT + set);
  CLASS_SKINS.forEach((skin, index) =>
    add(`class-${skin.archive}`, t('menu.repl.onFoot', 'On foot: {look}', { look: footNames[EOTB_FOOT_SET_COUNT + index] ?? skin.name }), skin.archive),
  );
  for (let set = 0; set < horseNames.length; set++)
    add(`horse-${set}`, t('menu.repl.onHorse', 'On horseback: {look}', { look: horseNames[set] }), ARCHIVE_HORSE + set);
  add('werewolf', t('menu.repl.werewolf', 'Werewolf form'), ARCHIVE_LYCAN);
  add('wereboar', t('menu.repl.wereboar', 'Wereboar form'), ARCHIVE_LYCAN + 1);
  return items;
}
/** The words under a painting, and over a set of them, each one literal call for the catalog of strings. */
const PAINTING_CAPTIONS = Object.freeze({
  'climb-grip': () => t('menu.repl.climbGrip', 'Fist on the wall'),
  'climb-reach': () => t('menu.repl.climbReach', 'Arm reaching out'),
  'thunderlock-frames': () => t('menu.repl.gunFrames', 'First-person frames, side by side'),
  'pistol-frames': () => t('menu.repl.gunFrames', 'First-person frames, side by side'),
});
const HELD_MAP_NOTE = () => t('menu.repl.heldMapNote', 'Keep the paper where it is. The map is drawn over it.');
const CLIMB_NOTE = () => t('menu.repl.climbNote', 'Paint a left hand. The game mirrors it for the right hand.');

/** The paper doll for every race, the hands and claws in first person, the climbing hands and the held map: the
 *  player's own pictures besides the body's sprites. */
async function playerOwnItems() {
  const { raceDisplayName } = await import('../talk/talkSession.js');
  displayRace = raceDisplayName;
  return [
    ...RACE_TEMPLATES.map((race) => ({
      id: `doll-${race.key}`,
      name: t('menu.repl.paperDoll', 'Paper doll: {race}', { race: raceDisplayName(race.key) }),
      tab: 'player',
      sources: [],
      race: race.key,
    })),
    { id: 'curses', name: t('menu.repl.curses', 'Paper doll: curses'), tab: 'player', sources: [], curses: true },
    { id: 'hands', name: t('menu.repl.hands', 'Hands (first person)'), tab: 'player', sources: [], hands: 'Melee' },
    { id: 'riding', name: t('menu.repl.riding', 'Riding (first person)'), tab: 'player', sources: [], riding: true },
    { id: 'claws', name: t('menu.repl.claws', 'Werebeast claws (first person)'), tab: 'player', sources: [], hands: 'Werecreature' },
    { id: 'climb-hands', name: t('menu.repl.climbHands', 'Climbing hands'), tab: 'player', sources: [], paintings: ['climb-grip', 'climb-reach'], paintingNote: CLIMB_NOTE },
    { id: 'held-map', name: t('menu.repl.heldMap', 'Held map'), tab: 'player', sources: [], paintings: [HELD_MAP_PICTURE], paintingNote: HELD_MAP_NOTE },
  ];
}
/** A race's name as shown, once the Player tab has read it (talk/talkSession.js raceDisplayName). */
let displayRace = (key) => key;
/** VAMP00I0.CIF's sixteen heads (vampirism.js racialOverrideHeadArt): the women's by race, then the men's. */
const vampireHeadCaptions = () =>
  Array.from({ length: 16 }, (_, record) => {
    const race = RACE_TEMPLATES[record % 8]?.key ?? 'Breton';
    return record < 8
      ? () => t('menu.repl.raceWoman', '{race}, woman', { race: displayRace(race) })
      : () => t('menu.repl.raceMan', '{race}, man', { race: displayRace(race) });
  });
async function playerItems() {
  const { eotbSpriteKeys } = await import('../../player/eyeOfTheBeholder/eotbSprite.js');
  return [...(await playerOwnItems()), ...playerItemsFrom(eotbSpriteKeys())];
}

// ---- Gear ---------------------------------------------------------------------------------------------------------

/** Each body an item's picture can be drawn for: the armour and clothing archives follow sex and race. */
const IDENTITIES = Object.freeze(
  ['male', 'female'].flatMap((gender) =>
    ['Breton', 'Redguard', 'Nord', 'DarkElf', 'HighElf', 'WoodElf', 'Khajiit', 'Argonian'].map((race) => ({ gender, race })),
  ),
);
let inventoryBuilt = null;
/** Every item template with an inventory picture, named apart, each marked `equippable` where the equip table finds
 *  it a slot (characters/equipTable.js getEquipSlot): Gear lists those, Items the rest. */
function inventoryItems() {
  inventoryBuilt ??= buildInventoryItems().catch((e) => {
    inventoryBuilt = null;
    throw e;
  });
  return inventoryBuilt;
}
async function buildInventoryItems() {
  const [{ createEquipTable }, { EQUIP_SLOTS }, { ITEM_GROUPS }, guns] = await Promise.all([
    import('../../characters/equipTable.js'),
    import('../../characters/paperdoll/paperdoll.js'),
    import('../../characters/equipRules.js'),
    portGuns(),
  ]);
  const equipTable = createEquipTable();
  const groupOf = new Map();
  for (const [group, indices] of Object.entries(GROUP_TEMPLATE_INDICES))
    for (const index of [...indices, ...customItemsForGroup(group)]) if (!groupOf.has(index)) groupOf.set(index, group);   // a mod's rows by the group it registers them in
  const items = [];
  for (const template of [...ITEM_TEMPLATES, ...customTemplateRows()]) {
    const seen = new Set();
    const pictures = [];
    for (const identity of IDENTITIES)
      for (let variant = 0; variant < Math.max(1, template.variants); variant++) {
        const image = inventoryItemImage({ templateIndex: template.index, group: groupOf.get(template.index), variant }, identity);
        if (!image?.archive || seen.has(`${image.archive}_${image.record}`)) continue;
        seen.add(`${image.archive}_${image.record}`);
        pictures.push({ archive: image.archive, record: image.record, frame: 0 });
      }
    if (!pictures.length) continue;
    pictures.sort((a, b) => a.archive - b.archive || a.record - b.record);
    const gun = guns.get(template.index);
    const group = gun?.group ?? groupOf.get(template.index) ?? null;
    if (gun) {
      pictures.splice(0, pictures.length, ...gun.pictures);
    }
    const slot = equipTable.getEquipSlot({ templateIndex: template.index, group: ITEM_GROUPS[group] ?? ITEM_GROUPS.None });
    items.push({
      id: `item-${template.index}`,
      name: getLocalizedItemName(template.index, template.name),
      tab: slot === EQUIP_SLOTS.None ? 'items' : 'gear',
      templateIndex: template.index,
      group,
      metals: !gun && (group === 'Weapons' || group === 'Armor'), // a weapon's or armour's picture is drawn in its metal's colours
      pictures,
      sources: sourcesOf(pictures),
      ...(gun?.strip ? { paintings: [gun.strip] } : {}),
    });
  }
  for (const artifact of await artifactItems().catch(() => [])) {
    const slot = equipTable.getEquipSlot({ templateIndex: artifact.templateIndex, group: ITEM_GROUPS[artifact.group] ?? ITEM_GROUPS.None });
    items.push({ ...artifact, tab: slot === EQUIP_SLOTS.None ? 'items' : 'gear' });
  }
  return nameApart(items).sort(byName);
}
/** The port's own guns and their pellet, by template: their group (a game's load registers it), every picture they have
 *  (the doll's and the list's, plain and gilded) and the first-person strip. Their modules register the templates and
 *  the pictures, as a game's load does. */
async function portGuns() {
  const [thunderlock, pistolet] = await Promise.all([import('../thunderlock.js'), import('../pistolet.js')]);
  thunderlock.installThunderlockIcons();
  pistolet.installPistoletIcons();
  const picturesOf = (files, archive) => files.filter((file) => file.archive === archive).map(({ archive: a, record, frame }) => ({ archive: a, record, frame }));
  return new Map([
    [thunderlock.THUNDERLOCK_TEMPLATE, { group: 'Weapons', pictures: picturesOf(thunderlock.ICON_FILES, thunderlock.ART.weaponArchive), strip: 'thunderlock-frames' }],
    [thunderlock.PELLET_TEMPLATE, { group: 'Weapons', pictures: picturesOf(thunderlock.ICON_FILES, thunderlock.ART.ammoArchive), strip: null }],
    [pistolet.PISTOLET_TEMPLATE, { group: 'Weapons', pictures: picturesOf(pistolet.PISTOLET_ICON_FILES, pistolet.PISTOLET_ARCHIVE), strip: 'pistol-frames' }],
  ]);
}
let artifactsRead = null;
/** The artifacts, as MAGIC.DEF lists them (its ArtifactClass rows, loot.js createArtifact): `{ index, magic, item }`. */
function artifactRows() {
  artifactsRead ??= (async () => {
    const [{ getBytes }, { readMagicDef }, { createArtifact }] = await Promise.all([
      import('../../scenes/dataSource.js'),
      import('../../formats/magicDef.js'),
      import('../loot/loot.js'),
    ]);
    const templates = readMagicDef(new Uint8Array(await getBytes('MAGIC.DEF')));
    return templates.filter((row) => row.type === 1 || row.type === 2).map((magic, index) => ({ index, magic, item: createArtifact(templates, index) }));
  })().catch((e) => {
    artifactsRead = null;
    throw e;
  });
  return artifactsRead;
}
/** Each artifact: its own picture, a man's and a woman's (TEXTURE.432 and .433, loot.js artifactTextureIndices), and a
 *  weapon's first-person sheet (Diverse Weapons' own, EBONYBLADE.CIF, while it is on). */
async function artifactItems() {
  const { artifactTextureIndices } = await import('../loot/loot.js');
  return (await artifactRows()).map(({ index, magic, item }) => {
    const pictures = ['male', 'female'].map((gender) => ({ ...artifactTextureIndices(index, gender), frame: 0 }));
    return {
      id: `artifact-${index}`,
      name: getLocalizedMagicItemName(magic.index, magic.name),
      templateIndex: item.templateIndex,
      group: item.group,
      artifact: item,
      metals: false,
      pictures,
      sources: sourcesOf(pictures),
    };
  });
}
/** An artifact's first-person sheet: the name the weapon in hand asks by, in its own material. */
async function artifactSheet(artifact) {
  const [{ WEAPON_FILE, weaponTypeForItem, getWeaponAnims }, { atlasFileName }] = await firstPersonModules();
  const type = weaponTypeForItem(artifact);
  const classicFile = WEAPON_FILE[type];
  if (!classicFile) return null;
  const metal = MATERIAL_NAMES[artifact.material] ?? null;
  return cifSheet(classicFile, { file: atlasFileName(artifact, classicFile, undefined, true), reader: 'weapon', gameMetal: metal, anims: getWeaponAnims(type) });
}
/** Gear: what can be equipped. Items: what has a picture but cannot be (ingredients, books, deeds...). */
const gearItems = async () => (await inventoryItems()).filter((item) => item.tab === 'gear');
const inventoryOnlyItems = async () => (await inventoryItems()).filter((item) => item.tab === 'items');
/** Templates that share a name (ten Long Shirts) told apart: men's or women's, then a cut number in template order. */
function nameApart(items) {
  const byName = new Map();
  for (const item of items) byName.set(item.name, [...(byName.get(item.name) ?? []), item]);
  for (const [name, same] of byName) {
    if (same.length < 2) continue;
    const cuts = new Map();
    for (const item of same) cuts.set(item.group, [...(cuts.get(item.group) ?? []), item]);
    for (const [group, sameGroup] of cuts)
      sameGroup.forEach((item, index) => {
        const cut = sameGroup.length > 1 ? index + 1 : null;
        if (group === 'MensClothing')
          item.name = cut ? t('menu.repl.mensCut', '{name} (men\'s, cut {number})', { name, number: cut }) : t('menu.repl.mens', '{name} (men\'s)', { name });
        else if (group === 'WomensClothing')
          item.name = cut ? t('menu.repl.womensCut', '{name} (women\'s, cut {number})', { name, number: cut }) : t('menu.repl.womens', '{name} (women\'s)', { name });
        else if (cut) item.name = t('menu.repl.cut', '{name} (cut {number})', { name, number: cut });
      });
  }
  return items;
}

// ---- Metals and first-person sheets -------------------------------------------------------------------------------

/** The metals a weapon's or armour's pictures are drawn in, by their English identity (MATERIAL_NAMES). */
export const REPLACEMENT_METALS = MATERIAL_NAMES;
/** A metal's dye for a TEXTURE picture's name: DFU's DyeColors name, none for Silver (its dye is Unchanged, and a
 *  silver item asks by the bare name - TextureReplacement.GetName). */
export const textureDyeOf = (metal) => (metal ? dyeToken(DYE_COLORS[metal]) || null : null);
/** A metal's DyeColors value, which recolours the classic picture (ChangeDye). */
const dyeValueOf = (metal) => (metal ? DYE_COLORS[metal] ?? null : null);
/** A first-person metal's dye (FPSWeapon.GetWeaponTexture2D): none for steel, the files' own colours. */
const weaponDyeOf = (metal) => (metal && metal !== 'Steel' ? weaponDyeColor(WEAPON_MATERIALS[metal]) : null);

const firstPersonModules = () =>
  Promise.all([import('../../combat/fpsWeapon.js'), import('../../combat/diverseWeapons/diverseWeapons.js')]);

/**
 * A sheet of CIF frames: `file`, the name the game asks them by; `classicFile`, the game's CIF they are cut from;
 * `counts`, each record's frames; `reader`, the overhaul over it (`weapon` mods and attached ones, or a `mod`);
 * `metals` when the metal row chooses, else `gameMetal`; `parts`, each record's swing; `shared` if a kind shares it.
 * @typedef {{ file: string, classicFile: string, counts: number[], reader: string, metals: boolean,
 *   gameMetal: string|null, parts: number[]|null, shared: boolean }} CifSheet
 */
/** Each record's swing, by WeaponStates (the anims' order), where no two share a record (the bow's do). */
function recordParts(anims, recordCount) {
  const records = anims.map((anim) => anim.Record);
  if (new Set(records).size !== records.length) return null;
  const parts = Array(recordCount).fill(null);
  anims.forEach((anim, state) => {
    if (anim.Record < recordCount) parts[anim.Record] = state;
  });
  return parts;
}
/** A first-person sheet of a weapon type's CIF, or null where the player's files have none. */
async function cifSheet(classicFile, { file = classicFile, reader = 'mod', metals = false, gameMetal = null, anims = null, shared = false, captions = null, copyable = true } = {}) {
  const counts = await classicRecords().cifFrameCounts(classicFile).catch(() => null);
  if (!counts?.length) return null;
  const parts = anims ? recordParts(anims, counts.length) : null;
  return { file: String(file).toUpperCase(), classicFile, counts, reader, metals, gameMetal, parts, shared, captions, copyable };
}
/** A weapon's first-person sheet, plain or enchanted: the name the weapon in hand asks by (Diverse Weapons' own sheet
 *  for the template while it is on - LONGSWORD.CIF - else the classic one), or null for anything not swung (an arrow). */
export async function weaponSheet(templateIndex, enchanted = false) {
  if (templateIndex == null || templateIndex === WEAPONS.Arrow) return null;
  const [{ WEAPON_FILE, weaponTypeForItem, plainWeaponType, getWeaponAnims }, { atlasFileName }] = await firstPersonModules();
  const weapon = { templateIndex, group: 'Weapons', ...(enchanted ? { enchantments: [{}] } : {}) };
  const type = enchanted ? weaponTypeForItem(weapon) : plainWeaponType(weaponTypeForItem(weapon));
  const classicFile = WEAPON_FILE[type];
  if (!classicFile) return null;
  const file = atlasFileName(weapon, classicFile, undefined, enchanted);
  return cifSheet(classicFile, { file, reader: 'weapon', metals: true, anims: getWeaponAnims(type), shared: String(file).toUpperCase() === classicFile });
}
/** The bare hands' or the werebeast's claws' sheet (`Melee`, `Werecreature`): drawn as iron, the game's material 0. */
async function handSheet(typeName) {
  const [{ WEAPON_FILE, WEAPON_TYPES, getWeaponAnims }] = await firstPersonModules();
  const type = WEAPON_TYPES[typeName];
  return cifSheet(WEAPON_FILE[type], { reader: 'weapon', gameMetal: MATERIAL_NAMES[WEAPON_MATERIALS.Iron], anims: getWeaponAnims(type) });
}
/** A spell element's casting hands (FPSSpellCasting): one frame a record, no metal, an attached mod's over the game's. */
async function castingSheet(element) {
  const { magicAnimFilename } = await import('../../combat/fpsSpellCasting.js');
  const file = magicAnimFilename(element);
  return file ? cifSheet(file) : null;
}
/** A sheet's frames, in record and frame order. */
export const sheetPictures = (sheet) =>
  sheet.counts.flatMap((frames, record) => Array.from({ length: frames }, (_, frame) => ({ record, frame })));
/** The metal a sheet's frame is shown in: the one chosen where it has metals (steel, the files' own, for every one),
 *  else the game's own. */
export const sheetMetal = (sheet, metal) => (sheet.metals ? metal ?? 'Steel' : sheet.gameMetal);
/** A sheet's frame as it is drawn without the player's own - an overhaul's where one answers, else the classic CIF
 *  frame in its metal's colours - as `{ classic, overhaul }` top-down RGBA pictures. */
export async function sheetOriginal(sheet, { record, frame }, metal = null) {
  const shown = sheetMetal(sheet, metal);
  const [classic, overhaul] = await Promise.all([
    classicRecords().cifPicture(sheet.classicFile, record, frame, weaponDyeOf(shown)).catch(() => null),
    sheetOverhaul(sheet, record, frame, shown),
  ]);
  return { classic, overhaul };
}
async function sheetOverhaul(sheet, record, frame, metal) {
  if (sheet.reader !== 'weapon') return dfmodCifRciImage(sheet.file, record, frame).catch(() => null);
  const { customWeaponImage } = await import('../../combat/diverseWeapons/diverseWeaponsAssets.js');
  const image = await customWeaponImage(cifPictureName(sheet.file, record, frame, metal)).catch(() => null);
  return image?.width ? { width: image.width, height: image.height, data: image.colors } : null;
}
/** A frame of the player's own copy of a sheet's CIF (`bytes`), in the metal's colours, or null. */
export const sheetCopyPicture = (sheet, { record, frame }, metal, bytes) =>
  classicRecords().cifCopyPicture(bytes, sheet.classicFile, record, frame, weaponDyeOf(sheetMetal(sheet, metal)));

/** An item's picture as it is drawn without the player's own: `{ classic, overhaul }`, in `metal`'s colours for a
 *  weapon's or armour's. */
export async function itemOriginal(item, picture, metal = null) {
  const { archive, record, frame } = picture;
  // the port's own painting, painted for the pane when it is asked: no game data under it
  if (item.painted || item.studio) return { classic: null, overhaul: await generatedPicture(archive, record).catch(() => null) };
  const metalOn = item.metals ? metal : null;
  const [classic, overhaul] = await Promise.all([
    metalOn ? classicRecords().picture(archive, record, frame, dyeValueOf(metalOn)).catch(() => null) : originalPicture(item, picture),
    pictureBelowPlayer(archive, record, frame, { dye: textureDyeOf(metalOn), derive: classicRecords().deriveContext }),
  ]);
  return { classic, overhaul };
}

// ---- Pictures the game asks by name: IMG files, spell icons, the held map -------------------------------------------

/**
 * A picture asked by name, `{ name, caption, source }`: `source` says where its original is - a whole IMG (`img`,
 * `file`), a spell icon's cell of ICON00I0.IMG (`icon`, `index`) or a painting the port serves (`painting`, `url`).
 * @typedef {{ name: string, caption?: (() => string) | null, source: { kind: string, file?: string, index?: number,
 *   url?: string } }} NamedPicture
 */
/** An IMG as an overhaul draws it, top-down RGBA: the worn UI pack's, else an attached mod's (`{FILE}.png`), or null. */
async function imgOverhaul(file) {
  const url = packImgUrl(file);
  if (url) {
    try {
      const { decodePng } = await import('../textureReplacement.js');
      const picture = await decodePng(await packBytes(url));
      if (picture?.width) return picture;
    } catch {
      // the pack's picture would not read: a mod's, or the game's, as the game falls back
    }
  }
  return dfmodImgImage(file).catch(() => null);
}
/** A named picture as it is drawn without the player's own: `{ classic, overhaul }`, top-down RGBA. */
export async function namedOriginal({ source }) {
  if (source.kind === 'img') {
    const [classic, overhaul] = await Promise.all([classicRecords().imgPicture(source.file).catch(() => null), imgOverhaul(source.file)]);
    return { classic, overhaul };
  }
  if (source.kind === 'icon') {
    const [sheet, overhaulSheet] = await Promise.all([classicRecords().imgPicture(SPELL_ICON_FILE).catch(() => null), overhaulIconSheet()]);
    return { classic: cutIcon(sheet, source.index), overhaul: cutIcon(overhaulSheet, source.index) };
  }
  if (source.kind === 'painting') {
    const { decodeServedPng } = await import('../vanillaEnhanced/vanillaEnhancedPack.js');
    return { classic: await decodeServedPng(source.url).catch(() => null), overhaul: null };
  }
  return { classic: null, overhaul: null };
}
/** A named picture's size for Import: an IMG's, an icon's cell, the held map's painting. */
async function namedSize(source) {
  if (source.kind === 'img') return classicRecords().imgSize(source.file).catch(() => null);
  if (source.kind === 'icon') return { width: SPELL_ICON_CELL, height: SPELL_ICON_CELL };
  if (source.kind === 'painting') return source.size ?? null;
  return null;
}

// ---- An item's sections --------------------------------------------------------------------------------------------

/** The words of a section's title, each one literal call so the catalog of strings reads them off the source. */
const SECTION_TITLES = Object.freeze({
  firstPerson: () => t('menu.repl.firstPerson', 'First person'),
  firstPersonEnchanted: () => t('menu.repl.firstPersonEnchanted', 'First person, enchanted'),
  body: () => t('menu.repl.body', 'Body'),
  headsMale: () => t('menu.repl.headsMale', "Men's heads"),
  headsFemale: () => t('menu.repl.headsFemale', "Women's heads"),
  background: () => t('menu.repl.background', 'Background'),
  werewolf: () => t('menu.repl.werewolfDoll', 'Werewolf'),
  wereboar: () => t('menu.repl.wereboarDoll', 'Wereboar'),
  vampireHeads: () => t('menu.repl.vampireHeads', 'Vampire heads'),
  vampireBackdrop: () => t('menu.repl.vampireBackdrop', 'Vampire backdrop'),
  head: () => t('menu.repl.head', 'Head'),
  horse: () => t('menu.repl.horse', 'Horse'),
  cart: () => t('menu.repl.cart', 'Cart'),
});
const BODY_CAPTIONS = Object.freeze([
  () => t('menu.repl.bodyMaleBare', 'Man, unclothed'),
  () => t('menu.repl.bodyMaleClothed', 'Man, clothed'),
  () => t('menu.repl.bodyFemaleBare', 'Woman, unclothed'),
  () => t('menu.repl.bodyFemaleClothed', 'Woman, clothed'),
]);
const imgPicture = (file, caption = null) => ({ name: file, caption, source: { kind: 'img', file } });
/** One of the port's own paintings as a named picture: its file beside the page and its own size. */
const paintingPicture = (name) => {
  const { file, width, height } = PORT_PAINTINGS[name];
  return { name, caption: PAINTING_CAPTIONS[name] ?? null, source: { kind: 'painting', url: file, size: { width, height } } };
};

/**
 * An item's sections, each a viewer on the pane: `{ id, kind, title, pictures | sheet }` - its TEXTURE pictures
 * (`texture`), a sheet of CIF frames (`cif`), or pictures asked by name (`named`).
 */
export async function itemSections(item) {
  const sections = [];
  const pictures = item.sources.length || item.pictures ? await itemPictures(item) : [];
  if (pictures.length) sections.push({ id: 'main', kind: 'texture', title: null, pictures });
  const addSheet = (id, title, sheet) => {
    if (sheet && !sections.some((section) => section.sheet?.file === sheet.file)) sections.push({ id, kind: 'cif', title, sheet });
  };
  if (item.artifact) addSheet('first-person', SECTION_TITLES.firstPerson, await artifactSheet(item.artifact).catch(() => null));
  else if (item.group === 'Weapons') {
    addSheet('first-person', SECTION_TITLES.firstPerson, await weaponSheet(item.templateIndex).catch(() => null));
    addSheet('first-person-enchanted', SECTION_TITLES.firstPersonEnchanted, await weaponSheet(item.templateIndex, true).catch(() => null));
  }
  if (item.hands) addSheet('first-person', null, await handSheet(item.hands).catch(() => null));
  if (item.castElement != null) addSheet('casting', null, await castingSheet(item.castElement).catch(() => null));
  if (item.curses) {
    sections.push({ id: 'werewolf', kind: 'named', title: SECTION_TITLES.werewolf, pictures: [imgPicture('WOLF00I0.IMG', SECTION_TITLES.body), imgPicture('WERE01I0.IMG', SECTION_TITLES.head)] });
    sections.push({ id: 'wereboar', kind: 'named', title: SECTION_TITLES.wereboar, pictures: [imgPicture('BOAR00I0.IMG', SECTION_TITLES.body), imgPicture('WERE00I0.IMG', SECTION_TITLES.head)] });
    addSheet('vampire-heads', SECTION_TITLES.vampireHeads, await cifSheet('VAMP00I0.CIF', { captions: vampireHeadCaptions() }).catch(() => null));
    sections.push({ id: 'vampire-backdrop', kind: 'named', title: SECTION_TITLES.vampireBackdrop, pictures: [imgPicture('SCBG08I0.IMG')] });
  }
  if (item.sheetFile) addSheet('faces', null, await cifSheet(item.sheetFile).catch(() => null));
  if (item.riding) {
    addSheet('horse', SECTION_TITLES.horse, await cifSheet('MRED00I0.CFA', { copyable: false }).catch(() => null));
    addSheet('cart', SECTION_TITLES.cart, await cifSheet('MRED01I0.CFA', { copyable: false }).catch(() => null));
  }
  if (item.race) {
    const race = raceByKey(item.race);
    const bodies = [...race.bodyMale, ...race.bodyFemale];
    sections.push({ id: 'body', kind: 'named', title: SECTION_TITLES.body, pictures: bodies.map((file, index) => imgPicture(file, BODY_CAPTIONS[index])) });
    addSheet('heads-male', SECTION_TITLES.headsMale, await cifSheet(race.headsMale, { reader: 'doll' }).catch(() => null));
    addSheet('heads-female', SECTION_TITLES.headsFemale, await cifSheet(race.headsFemale, { reader: 'doll' }).catch(() => null));
    sections.push({ id: 'background', kind: 'named', title: SECTION_TITLES.background, pictures: [imgPicture(race.background)] });
  }
  if (item.spellIcons) {
    const icons = Array.from({ length: SPELL_ICON_COUNT }, (_, index) => ({ name: spellIconPictureName(index), caption: null, source: { kind: 'icon', index } }));
    sections.push({ id: 'icons', kind: 'named', title: null, pictures: icons });
  }
  if (item.paintings) sections.push({ id: 'painting', kind: 'named', title: null, note: item.paintingNote ?? null, pictures: item.paintings.map(paintingPicture) });
  return sections;
}

/** The names an item's pictures are kept by besides its TEXTURE records: `names`, each a picture's name or the file
 *  its frames are cut from, and `files`, the CIF files whose copy draws it. What its marks and Clear read. */
export async function itemFileNames(item) {
  if (item.group !== 'Weapons' && !item.hands && item.castElement == null && !item.race && !item.spellIcons && !item.paintings && !item.curses && !item.sheetFile && !item.riding)
    return { names: [], files: [] };
  const sections = await itemSections(item);
  const sheets = sections.filter((section) => section.kind === 'cif').map((section) => section.sheet);
  const named = sections.filter((section) => section.kind === 'named').flatMap((section) => section.pictures.map((picture) => picture.name));
  return { names: [...sheets.map((sheet) => sheet.file), ...named], files: sheets.map((sheet) => sheet.classicFile) };
}
/** A kept picture's name is one of an item's: one of its names, or a frame of a file it names. */
export const nameIsItems = (name, names) => names.some((own) => name === own || name.startsWith(`${own}_`));
let diverseWeaponsSheets = null;
/** The sheets Diverse Weapons' shipped set draws frames of (`LONGSWORD.CIF`), read off its index once. */
const diverseWeaponsFiles = () =>
  (diverseWeaponsSheets ??= new Set(Object.keys(DIVERSE_WEAPONS_STEMS).map((stem) => stem.replace(/_\d+-\d+$/, '').toUpperCase())));
/** An IMG an overhaul draws: the worn UI pack's, or an attached mod's. */
const imgOverhauled = (file) => hasDfmodImg(file) || !!packImgUrl(file);
/** An overhaul draws one of these names: an IMG, a spell icon (the sheet's), or any frame of a CIF (an attached mod's,
 *  Diverse Weapons'). */
export const namesOverhauled = (names) =>
  names.some((name) => {
    if (/\.IMG_\d+$/i.test(name)) return imgOverhauled(SPELL_ICON_FILE);
    if (/\.IMG$/i.test(name)) return imgOverhauled(name);
    return /\.(CIF|RCI)$/i.test(name) && (hasDfmodCifRciFile(name) || diverseWeaponsFiles().has(name.toUpperCase()));
  });

/** Every name Import reads a PNG against, by the file it names: a CIF sheet's (`{ kind: 'cif', classicFile }`, its
 *  frames named `FILE.CIF_<record>-<frame>`), or a picture's own (`{ kind: 'named', source }`). */
export async function offeredPictureNames() {
  const [{ WEAPON_FILE, weaponTypeForItem, plainWeaponType }, { atlasFileName }] = await firstPersonModules();
  const { MAGIC_ANIM_FILE } = await import('../../combat/fpsSpellCasting.js');
  const offered = new Map();
  for (const file of [...Object.values(WEAPON_FILE), ...MAGIC_ANIM_FILE]) offered.set(file.toUpperCase(), { kind: 'cif', classicFile: file });
  for (const template of ITEM_TEMPLATES) {
    if (!(GROUP_TEMPLATE_INDICES.Weapons ?? []).includes(template.index)) continue;
    const weapon = { templateIndex: template.index, group: 'Weapons' };
    for (const enchanted of [false, true]) {
      const classicFile = WEAPON_FILE[enchanted ? weaponTypeForItem({ ...weapon, enchantments: [{}] }) : plainWeaponType(weaponTypeForItem(weapon))];
      const file = classicFile ? atlasFileName(weapon, classicFile, true, enchanted) : null;
      if (file) offered.set(String(file).toUpperCase(), { kind: 'cif', classicFile });
    }
  }
  for (const file of ['VAMP00I0.CIF', 'TFAC00I0.RCI', 'FACES.CIF', 'KIDS00I0.CIF', 'MRED00I0.CFA', 'MRED01I0.CFA']) offered.set(file, { kind: 'cif', classicFile: file });
  for (const { item } of await artifactRows().catch(() => [])) {
    const classicFile = WEAPON_FILE[weaponTypeForItem(item)];
    if (item.group === 'Weapons' && classicFile) offered.set(String(atlasFileName(item, classicFile, true, true)).toUpperCase(), { kind: 'cif', classicFile });
  }
  for (const file of ['WOLF00I0.IMG', 'BOAR00I0.IMG', 'WERE00I0.IMG', 'WERE01I0.IMG', 'SCBG08I0.IMG']) offered.set(file, { kind: 'named', source: { kind: 'img', file } });
  for (const race of RACE_TEMPLATES) {
    for (const file of [race.headsMale, race.headsFemale]) offered.set(file, { kind: 'cif', classicFile: file });
    for (const file of [...race.bodyMale, ...race.bodyFemale, race.background]) offered.set(file, { kind: 'named', source: { kind: 'img', file } });
  }
  for (let index = 0; index < SPELL_ICON_COUNT; index++) offered.set(spellIconPictureName(index), { kind: 'named', source: { kind: 'icon', index } });
  for (const name of Object.keys(PORT_PAINTINGS)) offered.set(name.toUpperCase(), { kind: 'named', source: paintingPicture(name).source });
  return offered;
}
/** The classic CIF files whose whole copy the game reads in place of its own. */
export async function offeredCifFiles() {
  const offered = await offeredPictureNames();
  return new Set([...offered.values()].filter((entry) => entry.kind === 'cif').map((entry) => entry.classicFile.toUpperCase()));
}
/** The sizes a picture named for Import may follow: a CIF frame's record size, or a named picture's own. */
export async function offeredSizes(entry, { record = 0, frame = 0 } = {}) {
  const size = entry.kind === 'cif' ? await classicRecords().cifSize(entry.classicFile, record, frame).catch(() => null) : await namedSize(entry.source);
  return size ? [size] : [];
}

// ---- Enemies ------------------------------------------------------------------------------------------------------

/** The City Watch walks the towns too, so it is listed once, with the people. Daggerfall Enemy Expansion's fifty are
 *  read from its own tables, their pictures put on the texture door as a game's load puts them (dexSprites.js). */
async function enemyItems() {
  const items = [];
  for (const [id, row] of Object.entries(ENEMY_BASICS)) {
    const archives = [...new Set([row.maleTexture, row.femaleTexture])].filter((archive) => archive > 0 && archive !== GUARD_TEXTURE);
    const fallback = enemyDisplayName(Number(id));
    if (!archives.length || !fallback) continue;
    items.push({ id: `enemy-${id}`, name: getLocalizedEnemyName(Number(id), fallback), tab: 'enemies', sources: archives.map((archive) => ({ archive })) });
  }
  const listed = new Set(items.map((item) => item.id));
  const people = new Set(walkerArchives());
  for (const enemy of await expansionEnemies().catch(() => []))
    if (!listed.has(enemy.key)) {
      const archives = enemy.archives.filter((archive) => !people.has(archive));
      if (!archives.length) continue;
      const item = { id: enemy.key, name: enemy.name, tab: 'enemies', sources: archives.map((archive) => ({ archive })) };
      // the mod's own frame counts (dexArt.js), whatever the texture door holds now
      if (archives.every((archive) => enemy.frames[archive]))
        item.pictures = archives.flatMap((archive) => enemy.frames[archive].flatMap((count, record) => Array.from({ length: count }, (_, frame) => ({ archive, record, frame }))));
      items.push(item);
    }
  return items.sort(byName);
}
/** The Enemy Expansion's own enemies, `{ id, name, archives, frames }` (frames: each of its own archives' frame counts
 *  by record), its pictures registered. */
async function expansionEnemies() {
  const [{ dexRead }, { dexEnemyNameText }, { installDexSprites }, { isClassicEnemyId }, { DEX_ART }] = await Promise.all([
    import('../enemyExpansion/dexInstall.js'),
    import('../enemyExpansion/dexNames.js'),
    import('../enemyExpansion/dexSprites.js'),
    import('../../characters/enemy/enemyBasics.js'),
    import('../enemyExpansion/dexArt.js'),
  ]);
  installDexSprites();
  const read = dexRead({ log: () => {} });
  const framesOf = (archives) => Object.fromEntries(archives.filter((archive) => DEX_ART[archive]).map((archive) => [archive, DEX_ART[archive].frames]));
  const enemies = [];
  for (const [id, { row }] of read.enemies) {
    if (isClassicEnemyId(id)) continue;
    const archives = [...new Set([row.maleTexture, row.femaleTexture])].filter((archive) => archive > 0);
    enemies.push({ key: `enemy-${id}`, id, name: dexEnemyNameText(id) ?? row.name ?? String(id), archives, frames: framesOf(archives) });
  }
  // a classic enemy the mod draws in pictures of its own (ClassicClassBase.mdb.csv: two classes redrawn), beside the
  // classic one, named for the mod
  for (const [id, { row }] of read.classic) {
    const classic = [ENEMY_BASICS[id]?.maleTexture, ENEMY_BASICS[id]?.femaleTexture];
    const archives = [...new Set([row.maleTexture, row.femaleTexture])].filter((archive) => DEX_ART[archive] && !classic.includes(archive));
    if (!archives.length) continue;
    const name = getLocalizedEnemyName(id, enemyDisplayName(id) ?? String(id));
    const mod = MOD_SETTINGS['daggerfall-enemy-expansion'].title; // the mod's name in the player's language
    enemies.push({ key: `enemy-dex-${id}`, id, name: t('menu.repl.byMod', '{name} ({mod})', { name, mod }), archives, frames: framesOf(archives) });
  }
  return enemies;
}
/** Every archive an enemy is drawn from. */
const enemyArchives = () => new Set(Object.values(ENEMY_BASICS).flatMap((row) => [row.maleTexture, row.femaleTexture]).filter((archive) => archive > 0));

// ---- NPCs ---------------------------------------------------------------------------------------------------------

let flatsReading = null;
/** FLATS.CFG, which names each standing person, read once from the player's files. */
function flats() {
  flatsReading ??= (async () => {
    const { getBytes } = await import('../../scenes/dataSource.js');
    const file = new FlatsFile();
    file.load(new Uint8Array(await getBytes('FLATS.CFG')), 'FLATS.CFG');
    return file;
  })().catch((e) => {
    flatsReading = null;
    console.warn('[replacements] FLATS.CFG could not be read - people keep their numbers:', e?.message ?? e);
    return null;
  });
  return flatsReading;
}
const capitalized = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);
const walkerArchives = () => [...Object.values(PERSON_TEXTURES).flatMap((sexes) => [...sexes.male, ...sexes.female]), GUARD_TEXTURE];

async function npcItems() {
  const items = [
    { id: 'faces-common', name: t('menu.repl.talkFaces', 'Conversation faces'), tab: 'npcs', sources: [], sheetFile: 'TFAC00I0.RCI' },
    { id: 'faces-special', name: t('menu.repl.specialFaces', 'Special faces'), tab: 'npcs', sources: [], sheetFile: 'FACES.CIF' },
    { id: 'faces-children', name: t('menu.repl.childFaces', "Children's faces"), tab: 'npcs', sources: [], sheetFile: 'KIDS00I0.CIF' },
  ];
  for (const [race, sexes] of Object.entries(PERSON_TEXTURES))
    for (const [sex, archives] of Object.entries(sexes))
      archives.forEach((archive, index) => {
        const look = designForArchive(archive)?.name ?? String(index + 1);
        const name = sex === 'male'
          ? t('menu.repl.townsman', 'Townsman, {race}: {look}', { race, look })
          : t('menu.repl.townswoman', 'Townswoman, {race}: {look}', { race, look });
        items.push({ id: `walker-${archive}`, name, tab: 'npcs', sources: [{ archive }] });
      });
  items.push({ id: `walker-${GUARD_TEXTURE}`, name: t('menu.repl.guard', 'Town guard'), tab: 'npcs', sources: [{ archive: GUARD_TEXTURE }] });
  const captions = await flats();
  for (const archive of NPC_FLAT_ARCHIVES) {
    const counts = await classicRecords().frameCounts(archive).catch(() => null);
    for (let record = 0; record < (counts?.length ?? 0); record++) {
      const caption = capitalized(captions?.caption(archive, record) ?? '');
      const name = caption
        ? t('menu.repl.person', '{caption} ({archive}-{record})', { caption, archive, record })
        : t('menu.repl.personNumber', 'Person {archive}-{record}', { archive, record });
      items.push({ id: `person-${archive}-${record}`, name, tab: 'npcs', sources: [{ archive, records: [record] }] });
    }
  }
  return items;
}

// ---- World --------------------------------------------------------------------------------------------------------

/** A ClimateTextureSet's name made readable: `Exterior_CityWalls` -> `City walls`. */
const setWords = (name) => {
  const words = name.replace(/^[A-Za-z]+_/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return words[0] + words.slice(1).toLowerCase();
};
const CLIMATE_WORDS = Object.freeze({
  0: () => t('menu.repl.desert', 'desert'),
  100: () => t('menu.repl.mountain', 'mountain'),
  300: () => t('menu.repl.temperate', 'temperate'),
  400: () => t('menu.repl.swamp', 'swamp'),
});
/** An archive's name from DFU's climate tables (ClimateSwaps.ApplyClimate: a winter set is the set plus one, the
 *  terrain's rain set the set plus two), or its number where the tables name none. */
export function worldArchiveName(archive) {
  const number = String(archive).padStart(3, '0');
  const base = archive < 500 ? Math.trunc(archive / 100) * 100 : null;
  const set = archive < 500 ? archive - base : archive;
  let name = CLIMATE_SET_NAMES[set] ?? null;
  let season = '';
  if (!name && CLIMATE_SET_NAMES[set - 1] && getClimateTextureInfo(archive - 1).supportsWinter) {
    name = CLIMATE_SET_NAMES[set - 1];
    season = t('menu.repl.winter', 'winter');
  } else if (!name && CLIMATE_SET_NAMES[set - 2] && getClimateTextureInfo(archive - 2).supportsRain) {
    name = CLIMATE_SET_NAMES[set - 2];
    season = t('menu.repl.rain', 'rain');
  }
  if (!name) return t('menu.repl.texture', 'Texture {number}', { number });
  const climate = CLIMATE_WORDS[base]?.() ?? '';
  const words = [setWords(name), climate, season].filter(Boolean).join(', ');
  return t('menu.repl.worldSet', '{words} ({number})', { words, number });
}
// ---- Magic --------------------------------------------------------------------------------------------------------

/** The spell icons, each element's casting hands, and each element's missile and its burst. */
function magicItems() {
  const items = [{ id: 'spell-icons', name: t('menu.repl.spellIcons', 'Spell icons'), tab: 'magic', sources: [], spellIcons: true }];
  ELEMENT_WORDS.forEach((element, index) =>
    items.push({ id: `casting-${index}`, name: t('menu.repl.casting', 'Casting hands: {element}', { element: element() }), tab: 'magic', sources: [], castElement: index }),
  );
  ELEMENT_WORDS.forEach((element, index) =>
    items.push({ id: `missile-${index}`, name: t('menu.repl.missile', 'Spell missile: {element}', { element: element() }), tab: 'magic', sources: [{ archive: MISSILE_ARCHIVE + index }] }),
  );
  return items;
}
const magicArchives = () => ELEMENT_WORDS.map((_, index) => MISSILE_ARCHIVE + index);

/** A set of the port's own named by its first picture's file (`weir-key-38282_0 (38282)`), else by its number. */
function ownSetName(archive, fileName) {
  const words = String(fileName ?? '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  return !words || /^\d+_\d+-\d+$/.test(words) ? worldArchiveName(archive) : t('menu.repl.worldSet', '{words} ({number})', { words, number: archive });
}
/** The artifacts' own pictures (loot.js ARTIFACT_*_TEXTURE_ARCHIVE): listed with each artifact, not as a set. */
const ARTIFACT_ARCHIVES = Object.freeze([432, 433]);
/** Every other TEXTURE archive, and every archive the port's own art adds that no other tab lists (its ships, its
 *  festivals' and stand-ins' pictures - what is on the texture door when the tab opens). */
async function worldItems() {
  const claimed = new Set([...enemyArchives(), ...walkerArchives(), ...NPC_FLAT_ARCHIVES, ...magicArchives(), ...ARTIFACT_ARCHIVES]);
  const classic = CLASSIC_TEXTURE_ARCHIVES.filter((archive) => !claimed.has(archive) && !(archive >= GEAR_ARCHIVES.first && archive <= GEAR_ARCHIVES.last))
    .map((archive) => ({ id: `world-${archive}`, name: worldArchiveName(archive), tab: 'world', sources: [{ archive }] }));
  const listed = new Set(classic.map((item) => item.sources[0].archive));
  for (const tab of REPLACEMENT_TABS.filter((id) => id !== 'world'))
    for (const item of await replacementItems(tab)) for (const source of item.sources) listed.add(source.archive);
  // the pictures the port paints in code, each set by its archive: its own (paintedArt.js) and the studio's (studioSlots.js)
  const { STUDIO_SETS } = await import('../studioArt/studioSlots.js');
  const painted = [
    ...PAINTED_SETS.map((set) => ({ id: `painted-${set.id}`, name: set.title(), tab: 'world', sources: [{ archive: set.archive }], painted: set })),
    ...STUDIO_SETS.map((set) => ({ id: `studio-${set.id}`, name: STUDIO_TITLES[set.id]?.() ?? set.title, tab: 'world', sources: [{ archive: set.archive }], studio: set })),
  ].filter((item) => !listed.has(item.sources[0].archive) && !claimed.has(item.sources[0].archive));
  for (const item of painted) listed.add(item.sources[0].archive);
  const own = standInArchives().filter(({ archive }) => !listed.has(archive) && !claimed.has(archive))
    .map(({ archive, fileName }) => ({
      id: `world-${archive}`,
      name: ownSetName(archive, fileName),
      tab: 'world',
      sources: [{ archive }],
    }));
  return [...classic, ...painted, ...own];
}
/** The studio's sets in the player's language (studioSlots.js names them for its artists, in English). */
const STUDIO_TITLES = Object.freeze({
  wagons: () => t('menu.repl.studio.wagons', 'Wagons, carts and the caravan'),
  galleon: () => t('menu.repl.studio.galleon', 'The galleon'),
  carrack: () => t('menu.repl.studio.carrack', 'The carrack'),
  largeboat: () => t('menu.repl.studio.largeboat', 'The large boat'),
  hangings: () => t('menu.repl.studio.hangings', "Towns' tapestries, banners and rugs"),
  yards: () => t('menu.repl.studio.yards', 'The stable, wagon yard and joinery'),
  port: () => t('menu.repl.studio.port', 'The shipyard and the lighthouse'),
  lefay: () => t('menu.repl.studio.lefay', 'The LeFay monument'),
});
/** A studio set's slot for a record, painted when asked, or null. */
async function studioSlot(set, record) {
  const { studioSlots } = await import('../studioArt/studioSlots.js');
  return studioSlots(set).find((slot) => slot.record === record) ?? null;
}
/** A picture the port paints in code as it is painted, top-down RGBA: a painted set's, or a studio slot's before the
 *  game's look is laid on it. Null where the archive is neither's. */
export async function generatedPicture(archive, record) {
  const own = await paintedPicture(archive, record);
  if (own) return own;
  const { STUDIO_SETS } = await import('../studioArt/studioSlots.js');
  const set = STUDIO_SETS.find((entry) => entry.archive === Number(archive));
  const slot = set ? await studioSlot(set, Number(record)).catch(() => null) : null;
  return slot ? await slot.picture().catch(() => null) : null;
}

// ---- The catalog's doors --------------------------------------------------------------------------------------------

const BUILDERS = Object.freeze({ player: playerItems, gear: gearItems, items: inventoryOnlyItems, magic: magicItems, enemies: enemyItems, npcs: npcItems, world: worldItems });
/** A tab's items, built once a page: the tables they come from are fixed once a game is up. */
const built = new Map();
let builtStandIns = -1;
/** @returns {Promise<ReplacementItem[]>} */
export function replacementItems(tabId) {
  if (tabId === 'world' && builtStandIns !== standInArchives().length) {
    built.delete('world');   // the port's own archives register as a game loads: the World list follows them
    builtStandIns = standInArchives().length;
  }
  if (!built.has(tabId)) {
    const building = Promise.resolve()
      .then(() => BUILDERS[tabId]?.() ?? [])
      .catch((e) => {
        built.delete(tabId);
        console.warn(`[replacements] the ${tabId} list could not be built:`, e?.message ?? e);
        return [];
      });
    built.set(tabId, building);
  }
  return built.get(tabId);
}
/** The tests' seam: build every list again. */
export function forgetReplacementItems() {
  built.clear();
  inventoryBuilt = null;
}

/** Each record's frame count in an archive: the player's file's, else the count a mod's own art registers. */
async function archiveFrames(archive) {
  const counts = await classicRecords().frameCounts(archive).catch(() => null);
  if (counts) return counts;
  if (!isVendorArchive(archive)) return [];
  return Array.from({ length: vendorRecordCount(archive) }, (_, record) => vendorFrameCount(archive, record));
}
/** Every picture an item has, in record and frame order. @returns {Promise<ReplacementPicture[]>} */
export async function itemPictures(item) {
  if (item.pictures) return item.pictures;
  if (item.painted)
    return [...(await paintedPictures(item.painted)).keys()].sort((a, b) => a - b).map((record) => ({ archive: item.painted.archive, record, frame: 0 }));
  if (item.studio) {
    const { studioSlots } = await import('../studioArt/studioSlots.js');
    return studioSlots(item.studio).map((slot) => ({ archive: slot.archive, record: slot.record, frame: 0 }));
  }
  const pictures = [];
  for (const source of item.sources) {
    const counts = await archiveFrames(source.archive);
    const records = source.records ?? counts.map((_, record) => record);
    for (const record of records)
      for (let frame = 0; frame < (counts[record] ?? 0); frame++) pictures.push({ archive: source.archive, record, frame });
  }
  return pictures;
}
/** A picture as the game has it with nothing laid over it, top row first, or null where the player's files have none. */
export async function originalPicture(item, { archive, record, frame }) {
  try {
    if (item.sprites) {
      const [{ eotbSpriteUrl }, { decodeServedPng }] = await Promise.all([
        import('../../player/eyeOfTheBeholder/eotbSprite.js'),
        import('../vanillaEnhanced/vanillaEnhancedPack.js'),
      ]);
      const url = eotbSpriteUrl(`${archive}_${record}-${frame}`);
      return url ? await decodeServedPng(url) : null;
    }
    return await classicRecords().picture(archive, record, frame);
  } catch {
    return null;
  }
}

/** Why a replacement may not be seen on this item now, as codes the pane words: `morrowind` (a Morrowind model draws
 *  it, which outranks a replacement), `morrowindNear` (models draw the nearest ones while Morrowind bodies are on) and
 *  `layered` (Layered Gearing draws the player on foot). */
export async function itemNotes(item) {
  const notes = [];
  const { morrowindDataCount } = await import('../../scenes/dataSource.js');
  if (morrowindDataCount() > 0) {
    if (item.tab === 'player' || item.tab === 'gear') notes.push('morrowind');
    else if (item.tab === 'enemies' || item.tab === 'npcs') {
      const { npcBodiesOn } = await import('../../characters/npcBodies.js');
      if (npcBodiesOn()) notes.push('morrowindNear');
    }
  }
  if (item.riding || (item.tab === 'player' && item.id.startsWith('horse-'))) notes.push('mountLook');
  if (item.tab === 'player' && item.id.startsWith('foot-') && !notes.length) {
    const [{ modSetting }, { layeredGenderOf }] = await Promise.all([
      import('../modSettings.js'),
      import('../../player/eyeOfTheBeholder/layeredArmor.js'),
    ]);
    if (layeredGenderOf(modSetting('eye-of-the-beholder', 'Graphics.LayeredGear')) != null) notes.push('layered');
  }
  return notes;
}
