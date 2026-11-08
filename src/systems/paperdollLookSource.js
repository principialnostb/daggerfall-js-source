// @ts-check
// PAPERDOLL-LOOKS: the door between systems/paperdollLooks.js and systems/item/itemTemplates.js. A LEAF with no imports:
// itemTemplates.js importing paperdollLooks.js cycles through paperdoll.js and equip.js back into itself, and a setter
// living in itemTemplates.js could be called before that module's `let` had initialised. Either side may load first.
/** @type {(item: any) => ({ v?: number, t?: number } | null)} */
let source = () => null;
/** paperdollLooks.js registers its reader here. */
export function setPaperdollLookSource(/** @type {any} */ fn) { source = typeof fn === 'function' ? fn : () => null; }
/** The player's 2D card look of a piece - `{ v }`, `{ t }` - or null. */
export const paperdollLookFor = (/** @type {any} */ item) => source(item);
