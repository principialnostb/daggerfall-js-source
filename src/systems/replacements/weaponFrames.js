// The first-person weapon's frames: the player's own (the Replacements pane) before any mod's.
//
// The weapon in hand asks each frame by DFU's CIF name (combat/fpsWeapon.js frameName). The player's own picture of a
// frame answers first; the player's own copy of the classic file (`WEAPON04.CIF`) outranks the mods too, so a frame
// it covers is drawn from the copy. A frame is drawn into the classic frame's box, so a bigger picture keeps its place.
import { toScreenOrder } from '../../formats/color32Order.js';
import { customWeaponImage } from '../../combat/diverseWeapons/diverseWeaponsAssets.js';
import { playerPictureRgba, playerPictureStamp, hasPlayerPicture, hasPlayerFile } from './playerPictures.js';

/** The player's frame for an asked name as the weapon draws it, or null. `ownStamp` rides it, so its texture is keyed
 *  apart from a mod's frame of the same name and from the player's earlier one. */
export async function playerWeaponFrame(name) {
  const stamp = playerPictureStamp(name);
  if (stamp == null) return null;
  const picture = await playerPictureRgba(name);
  return picture ? { ...toScreenOrder(picture), ownStamp: stamp } : null;
}

/** The door the weapon in hand asks every frame by: the player's own first, then the mods' (Diverse Weapons and the
 *  rest). Replacements outrank overhauls. */
export async function weaponFrameImage(name) {
  return (await playerWeaponFrame(name)) ?? (await customWeaponImage(name));
}

/** The player draws this frame: their own picture of it, or their own copy of the classic file it is cut from. */
export const playerDrawsWeaponFrame = (name, classicFile) => hasPlayerPicture(name) || hasPlayerFile(classicFile);
