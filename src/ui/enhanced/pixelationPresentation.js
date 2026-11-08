import { emcLanguage, emcText, setEmcLanguage } from './emcLanguage.js';
import { modGroupReady } from '../../systems/enhancedModResources.js';

const COPY = {
  'char-pixel-fp': [
    ['Руки от первого лица', 'First-person hands'],
    ['Настраивает пикселизацию улучшенных рук и предметов в руках от первого лица.', 'Adjusts pixelation of enhanced first-person hands and held equipment.'],
  ],
  'char-pixel-player': [
    ['Персонаж от третьего лица', 'Third-person character'],
    ['Настраивает пикселизацию улучшенной модели вашего персонажа при виде от третьего лица.', 'Adjusts pixelation of your enhanced character model in third-person view.'],
  ],
  'char-pixel-npc': [
    ['Персонажи NPC', 'NPC characters'],
    ['Настраивает пикселизацию совместимых улучшенных моделей NPC.', 'Adjusts pixelation of compatible enhanced NPC models.'],
  ],
  'world-pixel-objects': [
    ['Предметы и декор', 'Objects and decor'],
    ['Настраивает пикселизацию поддерживаемых предметов и декора в игровом мире. Не зависит от связки тел и рук.', 'Adjusts pixelation of supported world objects and decor. Independent of the bodies and hands group.'],
  ],
};
const local = (ru, en) => emcLanguage() === 'en' ? en : ru;
export function pixelationCopy(id) {
  const copy = COPY[id];
  return copy ? { title: local(...copy[0]), description: local(...copy[1]) } : null;
}
const node = (tag, cls, text) => {
  const element = document.createElement(tag);
  element.className = cls;
  if (text) element.textContent = text;
  return element;
};
export function catalogLanguageControl(render) {
  const language = node('div', 'emc-language');
  language.setAttribute('role', 'group');
  language.setAttribute('aria-label', 'EMC / Pixelation language');
  language.append(node('span', 'meta', emcText('Перевод') + ':'));
  for (const code of ['ru', 'en']) {
    const pick = node('button', 'act' + (emcLanguage() === code ? ' primary' : ''), code.toUpperCase());
    pick.type = 'button';
    pick.setAttribute('aria-pressed', String(emcLanguage() === code));
    pick.onclick = () => { setEmcLanguage(code); render(); };
    language.append(pick);
  }
  return language;
}
export function pixelationIntro(render) {
  const intro = node('section', 'card emc-catalog pixelation-intro');
  intro.append(catalogLanguageControl(render), node('h3', '', local('Пикселизация', 'Pixelation')),
    node('p', 'meta', local('Выберите степень пикселизации для каждой категории: HD — без дополнительной пикселизации; Light, Medium, Classic и Retro последовательно увеличивают размер пикселя.', 'Choose pixelation for each category: HD adds no extra pixelation; Light, Medium, Classic and Retro progressively increase pixel size.')),
    node('p', 'meta', local('Настройки рук, персонажа и NPC доступны при подключённой и включённой связке «Тела и руки» в EMC. Когда связка отключена, используется встроенная отрисовка игры. Ваш выбор сохраняется для повторного включения.', 'Hands, character and NPC controls require the connected and enabled Bodies and hands group in EMC. Disabling it restores the game’s built-in rendering. Your choices are retained for re-enabling.')));
  return intro;
}
export function pixelationTile(id, state, control) {
  const copy = pixelationCopy(id);
  const tile = node('section', 'card emc-catalog pixelation-card');
  tile.id = 'opt-' + id;
  tile.dataset.fid = id;
  tile.append(node('h3', '', copy.title), node('p', 'meta', copy.description));
  const linked = id !== 'world-pixel-objects';
  const ready = !linked || modGroupReady('bodies');
  const status = node('ul', 'emc-readiness');
  status.append(node('li', ready ? 'emc-ready' : 'emc-missing', (ready ? '✓ ' : '✕ ') + (linked
    ? local('Тела и руки (EMC) — ' + (ready ? 'подключены и включены' : 'подключите ресурсы и включите связку'), 'Bodies and hands (EMC) — ' + (ready ? 'connected and enabled' : 'connect resources and enable the group'))
    : local('Доступно независимо от EMC', 'Available independently of EMC'))));
  if (state.locked && !state.lockReason) status.append(node('li', 'emc-missing', local('Настройка закреплена правилами сетевой игры.', 'This setting is fixed by online game rules.')));
  for (const button of control.querySelectorAll('button:disabled')) button.title = status.textContent;
  tile.append(status, control);
  if (state.locked) { tile.dataset.locked = '1'; tile.setAttribute('aria-disabled', 'true'); }
  return tile;
}
