import { t } from '../systems/textManager.js'; // L10N4: the mark's alt text in the player's language

export const BRAND_LOGO_URL = new URL('../../app/launcher/daggerfall-online.png', import.meta.url).href;
export const BRAND_LOGO_ALT = 'DFO Online';
/** L10N4: the alt text a screen reader hears, in the player's language (BRAND_LOGO_ALT stays the English). */
export const brandLogoAlt = () => t('menu.brand.alt', BRAND_LOGO_ALT);

export function brandMark(doc = document) {
  const image = doc.createElement('img');
  image.src = BRAND_LOGO_URL;
  image.alt = brandLogoAlt();
  image.className = 'brand-logo';
  image.width = 2103;
  image.height = 748;
  image.draggable = false;
  return image;
}
