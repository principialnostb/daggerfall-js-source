// @ts-check
// The seam the renderer asks before it puts up a picture the port paints in code and uploads itself: the player's own
// picture in its place (the Replacements pane), and the glow that goes with it. The replacements system fills it
// (systems/replacements/paintedArt.js); with nothing set, every picture goes up as it was painted.

let _upload = null;
let _glow = null;

/**
 * @param {{ upload?: ((renderer: any, archive: any, record: any, opts: any) => any) | null,
 *   glow?: ((renderer: any, archive: any, record: any, emission: any, opts: any) => any) | null }} [override]
 */
export function setPaintedOverride({ upload = null, glow = null } = {}) {
  _upload = upload;
  _glow = glow;
}
/** The picture to put up in place of a painted one, or null to put up the painted one. */
export const paintedUpload = (renderer, archive, record, opts) => _upload?.(renderer, archive, record, opts) ?? null;
/** The glow map to put up in place of a painted one's, or null to put up its own. */
export const paintedGlow = (renderer, archive, record, emission, opts) => _glow?.(renderer, archive, record, emission, opts) ?? null;
