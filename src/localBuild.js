// Whether this page is a local build (`npm run dev`), read as main.js reads it. Vite fills in `import.meta.env` only
// where those words stand as they are, and the type checker does not know Vite's field, so this one line lives in a
// file that is not checked (main.js is not either) rather than behind an escape hatch in a checked one.
export const LOCAL_BUILD = !!import.meta.env?.DEV;
