import { extraAppearanceEnabled } from '../../systems/extraAppearance.js';
import { OWN_MW_URLS } from '../../systems/ownMwAssets.js';
import { modGroupEnabled } from '../../systems/enhancedModResources.js';
// These armour templates have no matching retail Morrowind piece. Resolve their locally authored models by
// material and armour slot.
import { ARMOR_MATERIAL, isPlate } from '../../systems/armorMaterials.js';

/** Roleplay & Realism Items' Jerkin (systems/roleplayRealismItems/rriItems.js RRI_TEMPLATES,
 *  ItemJerkin). Restated rather than imported for the leaf's sake;
 *  test/formats/morrowind/mwbrig2.test.js holds it to the mod's own row. */
export const RRI_JERKIN_TEMPLATE = 520;

/** The metals the Jerkin is a BRIGANDINE in - every plate material, Iron to Daedric (rriItems.js lightWord:
 *  "Iron and up"), in the material ladder's order. Each wears the brigandine in its own painting. */
export const BRIGANDINE_METALS = Object.freeze(Object.keys(ARMOR_MATERIAL).filter((k) => isPlate(ARMOR_MATERIAL[k])));

/** Daggerfall's classic armour templates (combat/enemyEquipment.js ARMOR_ENUM, DFU's ItemEnums.Armor),
 *  restated for the leaf's sake; test/tooling/mwsteel1.test.js holds them to the enum. */
export const CLASSIC_ARMOR_TEMPLATE = Object.freeze({
  Cuirass: 102,
  Gauntlets: 103,
  Greaves: 104,
  Left_Pauldron: 105,
  Right_Pauldron: 106,
  Helm: 107,
  Boots: 108,
});

/** The steel helm's styles - the values of its look, turned in the inventory (systems/lookVariants.js, pref `mwSteelHelm`),
 *  the default first. */
export const STEEL_HELM_STYLES = Object.freeze(['closed', 'open', 'horned']); // The horned helm, built (tools/bakeHornedHelm.mjs)
export const STEEL_HELM_DEFAULT = STEEL_HELM_STYLES[0];

const part = (p, model, hides = null, { showsSkin = false, fitMode = null } = {}) =>
  Object.freeze({
    part: p,
    model,
    ...(hides ? { hides: Object.freeze(hides) } : {}),
    ...(showsSkin ? { showsSkin } : {}),
    ...(fitMode ? { fitMode } : {}),
  });

/** The looks made from the player's own Skyrim install (tools/skyrim/), never committed - their meshes are
 *  on the disk of a player who ran the import and nowhere else, so they are no part of what ships. */
export const PLAYER_MADE_STYLES = Object.freeze(['horned', 'iron']);

/** Skyrim's heavy iron cuirass, cut into the cuirass's and the pauldrons' looks (tools/skyrim/
 *  importIronCuirass.mjs). Its cuirass is open at the neck as Skyrim's is, so it does not hide the chest under it - the
 *  skin shows where the armour does, and the import pushed every plate out over it (`showsSkin`: the slot occupied,
 *  its skin still drawn - mwItemMap.js composeWornArmor's `covers`). Its pauldrons ride the shoulder alone and leave
 *  the upper arm. */
const IRON = Object.freeze({
  // Its skirt (the belt, the plates, the trousers' thighs) covers the groin and both thighs whole (2 of the
  // groin's 155 vertices open, none of the thighs' 138), so it hides them - drawn, they showed through it as the legs
  // moved (the owner: "небольшие зоны где кожа проглядывает"); the knee it does not reach stays drawn.
  cuirass: Object.freeze([
    part('cuirass', 'iron_cuirass.nif', null, { showsSkin: true }),
    part('skirt', 'iron_skirt.nif', ['groin', 'right upper leg', 'left upper leg']),
  ]),
  left: Object.freeze([part('left pauldron', 'iron_pauldron_left.nif')]),
  right: Object.freeze([part('right pauldron', 'iron_pauldron_right.nif')]),
  // MW-IRON2 (tools/skyrim/importIronLimbs.mjs): the gauntlets hide the wrist under them and leave the forearm drawn
  // inside their flaring cuff (hidden, the cuff showed hollow at the elbow - MW-IRON4); the boots stop below the knee
  // (86 of its 136 vertices stand over their top), so they hide the ankle alone and leave the knee drawn.
  gauntlets: Object.freeze([
    part('right hand', 'iron_gauntlet_right.nif', ['right wrist']),
    part('left hand', 'iron_gauntlet_left.nif', ['left wrist']),
  ]),
  boots: Object.freeze([
    part('right foot', 'iron_boot_right.nif', ['right ankle']),
    part('left foot', 'iron_boot_left.nif', ['left ankle']),
  ]),
  // Skyrim has no greaves - its trousers are the cuirass's - so the greaves' iron look is the trousers below
  // the skirt. With the skirt and the boots they cover the thighs but for the knee's inner front, where a hidden knee
  // would leave a hole; so they show the skin under them, as the cuirass does.
  greaves: Object.freeze([
    part('right upper leg', 'iron_greave_right.nif', null, { showsSkin: true, fitMode: 'posedClearance' }),
    part('left upper leg', 'iron_greave_left.nif', null, { showsSkin: true, fitMode: 'posedClearance' }),
  ]),
});
const plate =
  (material) =>
  (id, name, templateIndex, { parts, styles = null }) =>
    Object.freeze({
      id,
      name,
      templateIndex,
      material,
      parts: Object.freeze(parts),
      ...(styles ? { styles: Object.freeze(styles) } : {}),
    });
const steel = plate(ARMOR_MATERIAL.Steel);
const ebony = plate(ARMOR_MATERIAL.Ebony); // MW-EBONY1

/** MW-STEEL1: Mac's steel plate, piece by piece (tools/bakeSteelPlate.mjs bakes the meshes, skinned - MW-STEEL4). Each
 *  piece fills the ARMO_PART slots a retail piece of its shape fills, so the priority law and the skin shadows are the
 *  ordinary path: the cuirass the cuirass, and (MW-STEEL2, its painting come: "This is the missing texture for the
 *  morrowind steel armor's skirt") the plate skirt under it Morrowind's skirt slot - modelled from the same cuirass mesh
 *  as the breastplate, shadowing nothing (ARMO_PART's skirt row), so a clothing skirt worn over it takes the slot at its
 *  higher priority as the law says; each gauntlet its hand, hiding the wrist and forearm under it; the greaves the
 *  upper legs; each pauldron its pauldron, hiding the upper arm it sleeves to the elbow (MW-FIT1); each boot its foot,
 *  hiding the ankle and knee. The helm fills the HAIR slot, which hides the hair; the open helm leaves the head, its
 *  face showing, and the closed one hides it (MW-FIT1). */
function steelPlate() {
  const helmClosed = Object.freeze([part('hair', 'steel_plate_helm_closed.nif', ['head'])]); // MW-FIT1: a closed helm is the head
  const helmOpen = Object.freeze([part('hair', 'steel_plate_helm_open.nif')]);
  const helmHorned = Object.freeze([part('hair', 'steel_plate_helm_horned.nif')]); // MW-HORN5: Skyrim's iron helmet, open under the mask - the face shows
  const cuirass = Object.freeze([part('cuirass', 'steel_plate_cuirass.nif'), part('skirt', 'steel_plate_skirt.nif')]);
  const left = Object.freeze([part('left pauldron', 'steel_plate_pauldron_left.nif', ['left upper arm'])]);
  const right = Object.freeze([part('right pauldron', 'steel_plate_pauldron_right.nif', ['right upper arm'])]);
  const greaves = Object.freeze([
    part('right upper leg', 'steel_plate_greave_right.nif', null, { fitMode: 'rigid' }),
    part('left upper leg', 'steel_plate_greave_left.nif', null, { fitMode: 'rigid' }),
  ]);
  const gauntlets = Object.freeze([
    part('right hand', 'steel_plate_gauntlet_right.nif', ['right wrist', 'right forearm']),
    part('left hand', 'steel_plate_gauntlet_left.nif', ['left wrist', 'left forearm']),
  ]);
  const boots = Object.freeze([
    part('right foot', 'steel_plate_boot_right.nif', ['right ankle', 'right knee']),
    part('left foot', 'steel_plate_boot_left.nif', ['left ankle', 'left knee']),
  ]);
  return [
    steel('daggerfall_steel_cuirass', 'Steel Cuirass', CLASSIC_ARMOR_TEMPLATE.Cuirass, {
      parts: cuirass,
      styles: { plate: cuirass, iron: IRON.cuirass },
    }),
    steel('daggerfall_steel_gauntlets', 'Steel Gauntlets', CLASSIC_ARMOR_TEMPLATE.Gauntlets, {
      parts: gauntlets,
      styles: { plate: gauntlets, iron: IRON.gauntlets },
    }),
    steel('daggerfall_steel_greaves', 'Steel Greaves', CLASSIC_ARMOR_TEMPLATE.Greaves, {
      parts: greaves,
      styles: { plate: greaves, iron: IRON.greaves },
    }),
    steel('daggerfall_steel_left_pauldron', 'Steel Left Pauldron', CLASSIC_ARMOR_TEMPLATE.Left_Pauldron, {
      parts: left,
      styles: { plate: left, iron: IRON.left },
    }),
    steel('daggerfall_steel_right_pauldron', 'Steel Right Pauldron', CLASSIC_ARMOR_TEMPLATE.Right_Pauldron, {
      parts: right,
      styles: { plate: right, iron: IRON.right },
    }),
    steel('daggerfall_steel_helm', 'Steel Helm', CLASSIC_ARMOR_TEMPLATE.Helm, {
      parts: helmClosed,
      styles: { closed: helmClosed, open: helmOpen, horned: helmHorned },
    }),
    steel('daggerfall_steel_boots', 'Steel Boots', CLASSIC_ARMOR_TEMPLATE.Boots, {
      parts: boots,
      styles: { plate: boots, iron: IRON.boots },
    }),
  ];
}

/** MW-BRIG1: Roleplay & Realism Items' Jerkin as a brigandine - MW-BRIG4: in every metal it is one, its painting the
 *  metal's (`brigandine_<metal>.nif`, which names `brigandine_<metal>.dds`). One piece, worn as a cuirass (it hides the
 *  chest skin). The skirt needs no split of its own: skinned from the groin, thighs and knees, it bends with the legs
 *  under it. */
const BRIGANDINE_SKIN_FROM = Object.freeze(['chest', 'groin', 'upperleg', 'knee']);
const brigandine = (metal) =>
  Object.freeze({
    id: `daggerfall_brigandine_${metal.toLowerCase()}`,
    name: `${metal} Brigandine`,
    templateIndex: RRI_JERKIN_TEMPLATE,
    material: ARMOR_MATERIAL[metal],
    skinFrom: BRIGANDINE_SKIN_FROM,
    fitTo: 'chest', // MW-BRIG3: its closed top sits where the chest skin it hides ends, at the base of the neck
    parts: Object.freeze([Object.freeze({ part: 'cuirass', model: `brigandine_${metal.toLowerCase()}.nif` })]),
  });

/** MW-EBONY1 (2026-10-09, Mac: "The ebony armor set and its textures"; asked, Ebony only): Mac's ebony plate,
 *  Daggerfall's seven classic pieces in Ebony (tools/bakeEbonyPlate.mjs bakes the meshes, skinned as the steel plate's
 *  are). Each piece fills the slots its steel twin fills and hides what it hides - the breastplate the cuirass and its
 *  plates the skirt, each gauntlet its hand over the wrist and forearm, each pauldron its pauldron over the upper arm,
 *  the greaves the upper legs, each boot its foot over the ankle and knee, the helm the HAIR over the head (one helm,
 *  closed, no styles). Mithril and Adamantium keep the Morrowind ebony they wore (mwItemMap.js
 *  DF_TO_MW_ARMOR_MATERIAL). */
function ebonyPlate() {
  return [
    ebony('daggerfall_ebony_cuirass', 'Ebony Cuirass', CLASSIC_ARMOR_TEMPLATE.Cuirass, {
      parts: [part('cuirass', 'ebony_plate_cuirass.nif'), part('skirt', 'ebony_plate_skirt.nif')],
    }),
    ebony('daggerfall_ebony_gauntlets', 'Ebony Gauntlets', CLASSIC_ARMOR_TEMPLATE.Gauntlets, {
      parts: [
        part('right hand', 'ebony_plate_gauntlet_right.nif', ['right wrist', 'right forearm']),
        part('left hand', 'ebony_plate_gauntlet_left.nif', ['left wrist', 'left forearm']),
      ],
    }),
    ebony('daggerfall_ebony_greaves', 'Ebony Greaves', CLASSIC_ARMOR_TEMPLATE.Greaves, {
      parts: [
        part('right upper leg', 'ebony_plate_greave_right.nif'),
        part('left upper leg', 'ebony_plate_greave_left.nif'),
      ],
    }),
    ebony('daggerfall_ebony_left_pauldron', 'Ebony Left Pauldron', CLASSIC_ARMOR_TEMPLATE.Left_Pauldron, {
      parts: [part('left pauldron', 'ebony_plate_pauldron_left.nif', ['left upper arm'])],
    }),
    ebony('daggerfall_ebony_right_pauldron', 'Ebony Right Pauldron', CLASSIC_ARMOR_TEMPLATE.Right_Pauldron, {
      parts: [part('right pauldron', 'ebony_plate_pauldron_right.nif', ['right upper arm'])],
    }),
    ebony('daggerfall_ebony_helm', 'Ebony Helm', CLASSIC_ARMOR_TEMPLATE.Helm, {
      parts: [part('hair', 'ebony_plate_helm.nif', ['head'])],
    }),
    ebony('daggerfall_ebony_boots', 'Ebony Boots', CLASSIC_ARMOR_TEMPLATE.Boots, {
      parts: [
        part('right foot', 'ebony_plate_boot_right.nif', ['right ankle', 'right knee']),
        part('left foot', 'ebony_plate_boot_left.nif', ['left ankle', 'left knee']),
      ],
    }),
  ];
}

/**
 * The port's own worn models.
 *
 * `skinFrom`: the body slots the model was fitted over. It is SKINNED FROM THEM at bind time
 * (formats/morrowind/mwSkinTransfer.js): every vertex copies the skin of the body vertex under it, so it moves by the body's
 * own bones and binds and never comes away from it (MW-BRIG2).
 *
 * `fitTo`: the body slot the model HIDES, and so must cover (MW-BRIG3). At bind time the model is moved onto the
 * wearer - its top to that part's top, measured in the rest pose - before it is skinned. The meshes keep the
 * modeller's scene placement (tools/bakeBrigandine.mjs, `placement: 'scene'`), but that scene's body stood lower than
 * the Morrowind body: drawn at the scene's height, the brigandine sat below the torso and left the chest it hides
 * bare, in MW-BRIG1 and MW-BRIG2 alike.
 *
 * A model with neither ships skinned (the steel plate, MW-STEEL4): its NIF carries its own weights and inverse binds,
 * as a retail armour mesh's do, and is bound exactly as one.
 *
 * `hides`, per part: the slots a part covers beyond its own, reserved with no mesh so their skin is not drawn (a
 * gauntlet over the wrist and forearm, a boot over the ankle and knee, a pauldron over the upper arm, a closed helm
 * over the head) - reserveIndividualPart's occupation, at the armour's priority like the part itself. A part the
 * first person does not draw hides nothing from it (mwItemMap.js composeWornArmor's `fpShadows`, MW-FIT1).
 *
 * `styles`: a piece that comes more than one way (the steel helm; MW-IRON1 the cuirass and the pauldrons), the parts
 * of each - `parts` is the default's. The helm's is the Steel Helm switch's (`helmStyle`); every other piece's is
 * its own, in `looks` by the piece's id (the pack's look row - systems/lookVariants.js).
 */
export const OWN_MW_ARMOR = Object.freeze([...BRIGANDINE_METALS.map(brigandine), ...steelPlate(), ...ebonyPlate()]);

/** The own model this worn piece wears, or null for everything that
 *  resolves through Morrowind's own records. */
export const ownArmorModelFor = (piece) =>
  (piece && OWN_MW_ARMOR.find((a) => a.templateIndex === piece.templateIndex && a.material === piece.material)) || null;

/** MW-STEEL1: the parts an own model wears in this style - its `styles` entry when it has one, else `parts`. The
 *  steel helm's style is `helmStyle`; MW-IRON1: any other piece's is `looks[its id]`. */
export const ownArmorParts = (
  own,
  {
    helmStyle = STEEL_HELM_DEFAULT,
    looks = null,
    pieceStyle = null,
    hasModel = (path) => typeof window === 'undefined' || path in OWN_MW_URLS,
  } = {},
) => {
  const style = pieceStyle ?? (own?.templateIndex === CLASSIC_ARMOR_TEMPLATE.Helm ? helmStyle : looks?.[own?.id]);
  const chosen = own?.styles?.[style];
  const available = chosen && chosen.every((part) => hasModel(`meshes/${part.model}`.toLowerCase()));
  return modGroupEnabled('bodies') && extraAppearanceEnabled('armor') && available ? chosen : (own?.parts ?? []);
};

/** Every mesh path this table can ask for, derived rather than typed out
 *  again - the coverage walk's (each ships). Every style's but the player-made (PLAYER_MADE_STYLES), which ship nowhere. */
export const ownArmorModelPaths = () => [
  ...new Set(
    OWN_MW_ARMOR.flatMap((a) =>
      [
        a.parts,
        ...Object.entries(a.styles ?? {})
          .filter(([k]) => !PLAYER_MADE_STYLES.includes(k))
          .map(([, v]) => v),
      ]
        .flat()
        .map((p) => `meshes/${p.model}`),
    ),
  ),
];
