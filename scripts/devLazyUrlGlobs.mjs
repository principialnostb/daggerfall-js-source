// LOAD-STALL 3 (bible/07-Rendering/Load-Stalls.md section 5): THE DEV SERVER'S URL GLOBS, LAZY.
//
// Every `import.meta.glob(<patterns>, { eager: true, query: '?url', import: 'default' })` in src/ becomes, on the dev
// server alone, `devGlobUrls(import.meta.glob(<patterns>, { query: '?url', import: 'default' }), '<module path>')`:
// the same table of URLs, made from the lazy glob's keys (src/systems/devGlobUrls.js), with no module request per
// file. Vite hoists an eager glob into top-level imports whatever branch it stands in, so the rewrite is the source's,
// before Vite's own glob transform (enforce 'pre'). The build is untouched (apply 'serve'). The helper's import is
// appended, not prepended, so every line keeps its number.

const EAGER_URL_GLOB = /import\.meta\.glob\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")\s*,\s*\{\s*eager:\s*true,\s*query:\s*'\?url',\s*import:\s*'default',?\s*\}\s*\)/g;

/** The rewrite, pure: `code` of the module at `modulePath` (its path from the root), or null when it has no such glob. */
export function rewriteEagerUrlGlobs(code, modulePath) {
  if (!code.includes('import.meta.glob')) return null;
  let n = 0;
  const lines = (s) => s.split('\n').length - 1;
  const out = code.replace(EAGER_URL_GLOB, (match, patterns) => {
    n++;
    const lazy = `__devGlobUrls(import.meta.glob(${patterns}, { query: '?url', import: 'default' }), ${JSON.stringify(modulePath)})`;
    return lazy + '\n'.repeat(Math.max(0, lines(match) - lines(lazy)));   // the lines the options held, kept
  });
  if (!n) return null;
  return `${out}\nimport { devGlobUrls as __devGlobUrls } from '/src/systems/devGlobUrls.js';\n`;
}

/** The Vite plugin. */
export function devLazyUrlGlobs() {
  let root = '';
  return {
    name: 'dev-lazy-url-globs',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) { root = config.root.replace(/\\/g, '/'); },
    transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/');
      if (!file.startsWith(`${root}/src/`) || !/\.m?js$/.test(file)) return null;
      const out = rewriteEagerUrlGlobs(code, file.slice(root.length));
      return out === null ? null : { code: out, map: null };
    },
  };
}
