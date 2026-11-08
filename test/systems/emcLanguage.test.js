import test from 'node:test';
import assert from 'node:assert/strict';
import { emcLanguage, setEmcLanguage, emcText } from '../../src/ui/enhanced/emcLanguage.js';
import { MOD_PACKS, MOD_GROUPS } from '../../src/systems/enhancedModCatalog.js';
test('EMC language translates all provider descriptions and dependency labels without changing their IDs',()=>{
 setEmcLanguage('en');assert.equal(emcLanguage(),'en');
 for(const item of [...MOD_PACKS,...MOD_GROUPS]){
  assert.doesNotMatch(emcText(item.description),/[А-Яа-я]/,item.id);
 }
 for(const text of ['Комплекты брони из TESO 5','Комплекты оружия из TESO 5','Требуется указать путь к файлам игры Skyrim SE.','Кастомизация 3D','Интеграция: BLOODBATH','Перевод'])assert.doesNotMatch(emcText(text),/[А-Яа-я]/);
 assert.equal(emcText('✓ Better Bodies — подключён'),'✓ Better Bodies — connected');
 assert.equal(emcText('✕ Better Hands — не подключён'),'✕ Better Hands — not connected');
 setEmcLanguage('ru');assert.equal(emcText('Кастомизация 3D'),'Кастомизация 3D');
});

// Read the displayed strings so later catalog copy changes cannot silently lose their translation.
test('all current catalog text literals have an English translation', async () => {
 const { readFileSync } = await import('node:fs');
 const source = readFileSync(new URL('../../src/ui/enhanced/enhancedModCatalog.js', import.meta.url), 'utf8');
 setEmcLanguage('en');
 try {
  const { parse } = await import('acorn');
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  function visit(node) {
   if (!node || typeof node !== 'object') return;
   if (node.type === 'Literal' && typeof node.value === 'string' && node.value !== 'Интеграция' && /[А-Яа-яЁё]/u.test(node.value)) {
    assert.doesNotMatch(emcText(node.value), /[А-Яа-яЁё]/u, node.value);
   }
   for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
   }
  }
  visit(tree);
 } finally { setEmcLanguage('ru'); }
});
