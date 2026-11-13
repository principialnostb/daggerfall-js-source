// The picture a classic IMG or CIF record is drawn with over the game's own: the player's (the Replacements pane), then
// an attached mod's. A CIF record also asks the player's whole copy of its file. Every reader of these files asks here
// - the paper doll, the conversation's portrait, the escort faces, the party panel - so a replacement and a mod show
// alike wherever the picture does.
import { cifPictureName, hasPlayerPicture, playerPictureRgba, playerCifCopy, playerPicturesGeneration } from './playerPictures.js';
import { dfmodImgImage, dfmodCifRciImage, hasDfmodCifRci, dfmodGeneration } from '../dfmodTextures.js';
import { classicRecordRgba } from '../../formats/derivedTexture.js';

/** What a picture drawn from these doors is drawn again for: the player's pictures or the attached mods changing. */
export const ownOrModGeneration = () => `${playerPicturesGeneration()}.${dfmodGeneration()}`;

/** An IMG's picture over the game's: the player's own, else an attached mod's - top-down RGBA, or null. */
export const ownOrModImg = (name) => (hasPlayerPicture(name) ? playerPictureRgba(name) : dfmodImgImage(name));

/**
 * A CIF, RCI or CFA frame's picture over the game's: the player's own, then a frame of the player's copy of the file
 * (read in `palette`; only a copy shaped as `original`, where it is given), then an attached mod's - top-down RGBA, or
 * null where the game's own draws. `own: false` asks the mod's alone, where a picture bought with Aurum is drawn.
 */
export async function ownOrModCifRecord(file, record, palette, original = null, frame = 0, { own = true } = {}) {
  const name = cifPictureName(file, record, frame);
  if (own && hasPlayerPicture(name)) return playerPictureRgba(name);
  const copy = own ? await playerCifCopy(file, palette, original) : null;
  const bitmap = copy?.getDFBitmap(record, frame);
  if (bitmap?.width) return classicRecordRgba(bitmap, palette);
  return hasDfmodCifRci(file, record, frame) ? dfmodCifRciImage(file, record, frame).catch(() => null) : null;
}
