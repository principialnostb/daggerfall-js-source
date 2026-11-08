import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelationCopy } from '../../src/ui/enhanced/pixelationPresentation.js';
import { setEmcLanguage } from '../../src/ui/enhanced/emcLanguage.js';
import { CATEGORIES } from '../../src/ui/settings/settingsMap.js';

test('every visible Pixelation control has complete RU/EN copy', () => {
 const ids = CATEGORIES.find(tab => tab.id === 'pixelation').sections.flatMap(section => section.items).map(id => id.slice(5));
 assert.equal(ids.length, 4);
 try {
  for (const id of ids) {
   setEmcLanguage('ru'); const ru = pixelationCopy(id);
   assert.match(ru.title, /[А-Яа-я]/u); assert.match(ru.description, /[А-Яа-я]/u);
   setEmcLanguage('en'); const en = pixelationCopy(id);
   assert.doesNotMatch(en.title + en.description, /[А-Яа-я]/u);
   assert.notEqual(en.description, ru.description);
  }
  assert.equal(pixelationCopy('other-setting'), null);
 } finally { setEmcLanguage('ru'); }
});
