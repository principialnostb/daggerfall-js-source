import { emcLanguage } from './emcLanguage.js';
import { MOD_PACKS } from '../../systems/enhancedModCatalog.js';
import { modPackState, attachModFolder, removeModResources } from '../../systems/enhancedModResources.js';
import { modSetting, setModSetting } from '../../systems/modSettings.js';

const COPY = {
  'mw-textures-high-resolution-bodies': ['High Resolution Better Body Female Textures',
    'Текстуры кожи и рук женских моделей Better Bodies в высоком разрешении. Варианты нижнего белья и волос выбираются в редакторе внешности; исправленная геометрия и UV-развёртка сохраняются.',
    'High-resolution skin and hand textures for female Better Bodies models. Underwear and body-hair variants are selected in the appearance editor; corrected geometry and UV mapping are retained.',
    'Для применения требуется Better Bodies.', 'Requires Better Bodies to apply.'],
  'mw-textures-intelligent': ['Intelligent Textures · 00 Core',
    'Базовый набор улучшенных текстур Morrowind. Пакет 01 Atlas Textures не используется: для него нужны соответствующие атласные модели.',
    'The core Morrowind texture enhancement pack. The 01 Atlas Textures set is excluded because it needs matching atlas meshes.'],
  'mw-textures-vurt-clothes': ["Vurt’s Better Clothes Retexture",
    'Заменяет текстуры одежды там, где пути ресурсов совпадают с поддерживаемыми моделями. Геометрия одежды остаётся прежней.',
    'Replaces clothing textures at paths matching supported models. Clothing geometry stays unchanged.'],
  'mw-textures-better-clothes': ['Better Clothes Retextured',
    'Обновляет поддерживаемые текстуры одежды. Текстуры штанов сохраняются прежними для проверенной посадки на моделях.',
    'Updates supported clothing textures. Pants retain their existing textures to preserve the tested fit.'],
  'mw-textures-better-armor': ['Better Morrowind Armor',
    'Подключает модели, текстуры и основной плагин набора брони. Несовместимые альтернативные патчи автоматически не добавляются.',
    'Uses the armor pack’s meshes, textures and base plugin. Incompatible alternative patches are not added automatically.'],
  'mw-textures-armor-joints': ['Complete Armor Joints',
    'Дополнение для сочленений брони Better Morrowind Armor. Применяется вместе с основным набором брони.',
    'An armor-joint add-on for Better Morrowind Armor, used alongside the main armor pack.',
    'Для применения требуется Better Morrowind Armor.', 'Requires Better Morrowind Armor to apply.'],
  'mw-textures-westly-clothiers': ['Westly’s Fine Clothiers of Tamriel',
    'Подключает модели, текстуры и плагин набора одежды Westly’s Fine Clothiers of Tamriel.',
    'Uses the meshes, textures and plugin from Westly’s Fine Clothiers of Tamriel.'],
  'mw-textures-westly-faces': ['Westly’s Faces Refurbished',
    'Заменяет поддерживаемые модели и текстуры голов и причёсок ресурсами Westly’s Faces Refurbished.',
    'Replaces supported head and hair meshes and textures with Westly’s Faces Refurbished resources.'],
};
const local = (ru, en) => emcLanguage() === 'en' ? en : ru;
const node = (tag, cls, text) => {
  const element = document.createElement(tag); element.className = cls;
  element.textContent = text; return element;
};
export function textureCopy(id) {
  const copy = COPY[id];
  return copy ? { title: copy[0], description: local(copy[1], copy[2]), requirement: copy[3] ? local(copy[3], copy[4]) : null } : null;
}
export function textureIntro() {
  const intro = node('section', 'card emc-texture-intro', '');
  intro.append(node('h3', '', local('Текстуры и внешний вид', 'Textures and appearance')),
    node('p', 'meta', local('Подключайте ресурсы и включайте нужные наборы кнопками на карточках. Некоторые наборы включают модели и плагины вместе с текстурами; их состав указан в описании.', 'Connect resources and enable packs using the card actions. Some packs include meshes and plugins alongside textures; each description explains its contents.')),
    node('p', 'meta emc-pending', local('Изменения источников применяются после перезапуска игры. Сохранённые настройки и порядок загрузки ресурсов остаются прежними.', 'Source changes take effect after restarting the game. Saved settings and resource loading order are retained.')));
  return intro;
}
/** Replace the legacy source bar with resource actions, preserving saved values and online locks. */
export function decorateTextureTile(tile, id, render = () => {}) {
  const copy = textureCopy(id); if (!copy) return tile;
  tile.classList.add('card', 'emc-catalog', 'emc-texture-card');
  const main = tile.querySelector('.ft-tile-main');
  main.replaceWith(node('h3', '', copy.title));
  const control = tile.querySelector('.ft-tile-ctl');
  control.before(node('p', 'meta', copy.description));
  if (copy.requirement) control.before(node('p', 'meta emc-source-note', copy.requirement));
  control.remove();
  for (const notice of tile.querySelectorAll('.ft-tile-notice')) {
    // This pre-existing notice describes a locked online control.
    if (tile.dataset.locked === '1') notice.textContent = local('Настройка закреплена правилами сетевой игры.', 'This setting is fixed by online game rules.');
  }
  appendTextureActions(tile, id, render);
  return tile;
}

function appendTextureActions(tile, id, render) {
  const pack = MOD_PACKS.find(pack => pack.feature === id);
  if (!pack) return;
  const state = modPackState(pack.id);
  tile.append(node('p', 'meta emc-credits', local('Автор уточняется · Интеграция: BLOODBATH', 'Author unconfirmed · Integration: BLOODBATH')));
  tile.append(node('p', 'meta emc-status', state.connected
    ? local(`Ресурсы подключены · файлов: ${state.count}`, `Resources connected · files: ${state.count}`)
    : local('Ресурсы не подключены', 'Resources not connected')));
  const actions = document.createElement('div'); actions.className = 'acts';
  const action = (ru, en, cls, run) => {
    const button = node('button', `act ${cls}`, local(ru, en)); button.type = 'button';
    button.onclick = async () => {
      button.disabled = true;
      try { await run(); render(); }
      catch (error) { tile.append(node('p', 'meta emc-error', String(error?.message || error))); }
      finally { button.disabled = false; }
    };
    actions.append(button); return button;
  };
  if (!state.connected) {
    const download = node('a', 'act', local('Скачать с Nexus Mods', 'Download from Nexus Mods'));
    download.href = pack.nexus; download.target = '_blank'; download.rel = 'noopener noreferrer';
    actions.append(download);
    action('Подключить ресурсы', 'Connect resources', 'emc-connect', () => new Promise((resolve, reject) => {
      const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.webkitdirectory = true;
      input.oncancel = () => resolve();
      input.onchange = async () => {
        try { if (input.files?.length) await attachModFolder(pack.id, [...input.files]); resolve(); }
        catch (error) { reject(error); }
      };
      input.click();
    }));
    tile.append(actions);
    return;
  }
  const enabled = modSetting('morrowind-textures', pack.setting) === true;
  const toggle = action(enabled ? 'Отключить' : 'Включить', enabled ? 'Disable' : 'Enable', enabled ? 'emc-disable' : 'emc-enable', () => {
    if (!modPackState(pack.id).connected || tile.dataset.locked === '1') return;
    setModSetting('morrowind-textures', pack.setting + 'Source', enabled ? 0 : 2);
  });
  toggle.disabled = !state.connected || tile.dataset.locked === '1';
  toggle.setAttribute('aria-pressed', String(enabled));
  if (state.connected) action('Удалить ресурсы', 'Remove resources', 'emc-remove', () => removeModResources(pack.id));
  tile.append(actions);
}
