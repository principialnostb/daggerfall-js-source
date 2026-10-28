// LOAD-STALL 3 (bible/07-Rendering/Load-Stalls.md section 5): A GLOB'S URLS WITHOUT A REQUEST APIECE ON THE DEV SERVER.
//
// An eager `import.meta.glob(..., { eager: true, query: '?url', import: 'default' })` is a table of strings in the
// build - and on the dev server a MODULE REQUEST per file, hoisted to the importing module's top and answered before
// it runs: the Eye of the Beholder's sprites and layered armour (~12,400 pictures, imported at boot) and the bundled
// Morrowind packs (7,410 files, at the first body) - 19,816 requests measured in the page. On the dev server a file's
// `?url` is its path from the project root, so scripts/devLazyUrlGlobs.mjs rewrites each such glob, on the dev server
// alone, into a LAZY one (no request until a loader is called, and none is) handed to this function with the module's
// own root path. The build is not touched.

/** `{ globKey: url }` from a lazy glob's keys (`'../../vendor/x/y.png'`) resolved against `modulePath`, the importing
 *  module's path from the project root (`/src/player/x.js`) - the dev server's own answer for each `?url`. */
export function devGlobUrls(lazyGlob, modulePath) {
  const base = new URL(modulePath, 'http://dev.invalid');
  const out = {};
  for (const key of Object.keys(lazyGlob ?? {})) out[key] = decodeURI(new URL(key, base).pathname);
  return out;
}
