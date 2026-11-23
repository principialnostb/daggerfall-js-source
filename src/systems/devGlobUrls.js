// In development the glob's keys identify its URLs. Importing every URL eagerly would issue a module request
// for each asset before startup.

/** `{ globKey: url }` from a lazy glob's keys (`'../../vendor/x/y.png'`) resolved against `modulePath`, the importing
 *  module's path from the project root (`/src/player/x.js`) - the dev server's own answer for each `?url`. */
export function devGlobUrls(lazyGlob, modulePath) {
  const base = new URL(modulePath, 'http://dev.invalid');
  const out = {};
  for (const key of Object.keys(lazyGlob ?? {})) out[key] = decodeURI(new URL(key, base).pathname);
  return out;
}
