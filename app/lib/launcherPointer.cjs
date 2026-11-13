// The launcher wears the game's own pointer: Enhanced Plus's gauntlet, read out of the one file the game draws it from
// (src/ui/plus/gauntletArt.js) and served to the launcher's page as PNG files. The page's CSP takes images from its own
// origin only, never data: URLs, and a copy of the art beside the page could drift from the game's.
'use strict';

/** The files the launcher's stylesheet asks for, each the art module's export that holds it. */
const POINTER_FILES = Object.freeze({
  'gauntlet-point.png': 'GAUNTLET_POINT_1X',
  'gauntlet-point@2x.png': 'GAUNTLET_POINT_2X',
  'gauntlet-press.png': 'GAUNTLET_PRESS_1X',
  'gauntlet-press@2x.png': 'GAUNTLET_PRESS_2X',
});
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The art module's text, read: each served file's PNG bytes. A frame the module does not hold whole, as a PNG, is
 *  left out, and the stylesheet's `auto` gives the OS arrow in its place. */
function pointerFiles(text) {
  const out = new Map();
  for (const [file, name] of Object.entries(POINTER_FILES)) {
    const m = new RegExp(`^export const ${name} =\\s*'data:image/png;base64,([A-Za-z0-9+/=]+)';$`, 'm').exec(String(text ?? ''));
    const bytes = m ? Buffer.from(m[1], 'base64') : null;
    if (bytes && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) out.set(file, bytes);
  }
  return out;
}

module.exports = { POINTER_FILES, pointerFiles };
