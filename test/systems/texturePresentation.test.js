import test from 'node:test';
import assert from 'node:assert/strict';
import { textureCopy } from '../../src/ui/enhanced/texturePresentation.js';
import { setEmcLanguage } from '../../src/ui/enhanced/emcLanguage.js';
import { CATEGORIES } from '../../src/ui/settings/settingsMap.js';
import { FEATURES } from '../../src/systems/features.js';
import { tileStates } from '../../src/ui/enhanced/enhancedMenu.js';

test('all eight texture sources have bilingual descriptions without changing state', () => {
 const ids = CATEGORIES.find(c => c.id === 'compatibility').sections.find(s => s.id === 'textures').items.filter(id => id.startsWith('feat:')).map(id => id.slice(5));
 assert.equal(ids.length, 8);
 try {
  for (const id of ids) {
   const f = FEATURES.find(f => f.id === id);
   const before = tileStates(f);
   setEmcLanguage('ru'); const ru = textureCopy(id);
   assert.match(ru.description, /[А-Яа-я]/u);
   setEmcLanguage('en'); const en = textureCopy(id);
   assert.doesNotMatch(en.description + (en.requirement ?? ''), /[А-Яа-яЁё]/u);
   assert.equal(en.title, ru.title);
   assert.equal(tileStates(f).at, before.at);
   assert.equal(tileStates(f).labels.length, 3);
  }
  assert.equal(textureCopy('unrelated'), null);
 } finally { setEmcLanguage('ru'); }
});


test('texture cards replace source bars with resource actions in both languages', async () => {
 const { decorateTextureTile } = await import('../../src/ui/enhanced/texturePresentation.js');
 const previousDocument = globalThis.document;
 const element = () => ({ children: [], dataset: {}, classList: { add() {} },
  append(...nodes) { this.children.push(...nodes); }, setAttribute() {},
  before() {}, replaceWith() {}, remove() { this.removed = true; } });
 globalThis.document = { createElement: element };
 try {
  for (const language of ['ru', 'en']) {
   setEmcLanguage(language);
   for (const feature of FEATURES.filter(f => f.id.startsWith('mw-textures-'))) {
    const control = element(); const main = element(); const tile = element();
    tile.querySelector = selector => selector === '.ft-tile-main' ? main : control;
    tile.querySelectorAll = () => [];
    const before = tileStates(feature).at;
    decorateTextureTile(tile, feature.id);
    assert.equal(control.removed, true, feature.id);
    const actions = tile.children.find(child => child.className === 'acts');
    assert.ok(actions);
    const labels = actions.children.map(child => child.textContent).join(' ');
    assert.match(labels, language === 'ru' ? /Скачать с Nexus Mods/ : /Download from Nexus Mods/);
    assert.match(labels, language === 'ru' ? /Подключить ресурсы/ : /Connect resources/);
    assert.equal(actions.children.length, 2);
    assert.doesNotMatch(labels, /Включить|Отключить|Удалить|Enable|Disable|Remove/);
    assert.doesNotMatch(labels, /Original|Vanilla|This pack|Этот набор/);
    assert.equal(tileStates(feature).at, before);
   }
  }
  const { MOD_PACKS } = await import('../../src/systems/enhancedModCatalog.js');
  const { modResourceGlob } = await import('../../src/systems/enhancedModResources.js');
  const { modSetting, setModSetting } = await import('../../src/systems/modSettings.js');
  for (const pack of MOD_PACKS.filter(pack => pack.feature)) {
   const path = '../../Mods/' + pack.folder + '/texture.dds';
   modResourceGlob('../../Mods/**/*.dds', { [path]: 'test-url' });
   const feature = FEATURES.find(feature => feature.id === pack.feature);
   const original = tileStates(feature).at;
   try {
    for (const language of ['ru', 'en']) for (const enabled of [false, true]) {
     setEmcLanguage(language);
     setModSetting('morrowind-textures', pack.setting + 'Source', enabled ? 2 : 0);
     const tile = element(); const control = element();
     tile.querySelector = selector => selector === '.ft-tile-main' ? element() : control;
     tile.querySelectorAll = () => [];
     decorateTextureTile(tile, pack.feature);
     const actions = tile.children.find(child => child.className === 'acts');
     assert.equal(actions.children.length, 2);
     assert.equal(actions.children[0].textContent, language === 'ru' ? (enabled ? 'Отключить' : 'Включить') : (enabled ? 'Disable' : 'Enable'));
     assert.equal(actions.children[1].textContent, language === 'ru' ? 'Удалить ресурсы' : 'Remove resources');
     await actions.children[0].onclick();
     assert.equal(modSetting('morrowind-textures', pack.setting), !enabled);
    }
   } finally { setModSetting('morrowind-textures', pack.setting + 'Source', original); }
  }
 } finally { globalThis.document = previousDocument; setEmcLanguage('ru'); }
});
