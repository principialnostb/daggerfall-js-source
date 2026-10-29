// MW-SKY-AXE-FIT: measured complete retail meshes, not a sword-length guess.
// Reference: meshes/w/w_steel_battleaxe.nif from the player's Morrowind.bsa.
// Skyrim keeps its proportions; match the axe head's width and the lower-hand reach.
export const BATTLEAXE_REFERENCE = Object.freeze({
  width: 30.917202949523926,
  pommel: -19.541900634765625,
  tip: 37.1843376159668,
});
// Detailed Skyrim source spans: Y 98.69747161865234, X 35.46467590332031.
export const BATTLEAXE_LENGTH = BATTLEAXE_REFERENCE.width * 98.69747161865234 / 35.46467590332031;
export const BATTLEAXE_TIP = BATTLEAXE_REFERENCE.pommel + BATTLEAXE_LENGTH;
// Full-length ready stance: leave the head well ahead of the upper hand.
// Edge toward the player: remove the previous quarter-turn that presented the broad blade face.
// Shaft translation and dimensions stay unchanged.
export const BATTLEAXE_FIRST_PERSON = Object.freeze({
  a: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  t: Object.freeze([0, -10, 0]),
});
