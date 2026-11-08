// @ts-check
// MODEL-LOOKS: the door between systems/modelLooks.js and the Morrowind resolvers (formats/morrowind/mwItemMap.js,
// mwFirstPerson.js, combat/fpArm.js). A LEAF with no imports, so either side may load first and nothing cycles.
// The resolvers are shared by the player's body, every peer's and every townsperson's: the reader registered here
// answers a look only for a piece the PLAYER holds (systems/modelLooks.js isPlayersOwn) - a peer or an NPC wearing the
// same cuirass keeps its own. A preview copy (`__mwLook`, the 3D tab's thumbnails) names its look itself.
/** @type {(item: any) => (string | null)} */
let source = () => null;
/** systems/modelLooks.js registers its reader here. */
export function setModelLookSource(/** @type {any} */ fn) { source = typeof fn === 'function' ? fn : () => null; }
/** The Morrowind record id the player chose to draw this piece as in 3D, or null for the resolver's own pick. */
export function modelLookFor(/** @type {any} */ item) {
  if (!item || typeof item !== 'object') return null;
  if (Object.hasOwn(item, '__mwLook')) return typeof item.__mwLook === 'string' ? item.__mwLook : null;
  return source(item);
}
