import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const bundled = read('../../../src/systems/bundledMorrowindMods.js');
const bodies = read('../../../src/formats/morrowind/mwBetterBodies.js');
const bodyEditor = read('../../../better-bodies-texture-editor.html');

test('MW-MODS-PATHS: bundled pack globs use the new category roots', () => {
  assert.doesNotMatch(bundled, /Morrowind Textures/);

  for (const pack of [
    'Intelligent Textures',
    "Vurt's Better Clothes Retexture",
    'Better Clothes Retextured',
    "Westly's Fine Clothiers of Tamriel",
    "Westly's Faces Refurbished",
    'Better Morrowind Armor',
  ]) {
    assert.ok(bundled.includes('../../Mods/Textures/' + pack + '/'), 'missing texture-pack glob: ' + pack);
  }

  for (const pack of [
    'Better Bodies',
    'High Resolution Better Body Female Textures',
    'Seamless DMRA body replacer',
  ]) {
    assert.ok(bundled.includes('../../Mods/Bodies/' + pack + '/'), 'missing body-pack glob: ' + pack);
  }
});

test('MW-MODS-PATHS: Better Bodies runtime resolver uses Mods/Bodies', () => {
  assert.doesNotMatch(bodies, /Morrowind Textures/);
  assert.ok(bodies.includes('../../../Mods/Bodies/Better Bodies/Nude/Data Files/Meshes/'));
  assert.ok(bodies.includes('../../../Mods/Bodies/Better Bodies/Nude/Data Files/Textures/'));
  assert.ok(bodies.includes('../../../Mods/Bodies/Better Bodies/Underwear/Data Files/Meshes/'));
  assert.ok(bodies.includes('../../../Mods/Bodies/Better Bodies/Underwear/Data Files/Textures/'));
  assert.ok(bodies.includes('../../../Mods/Bodies/Seamless DMRA body replacer/Meshes/'));
});

test('MW-MODS-PATHS: body texture editor diagnostic follows the migrated tree', () => {
  assert.ok(bodyEditor.includes('Mods/Bodies/Better Bodies/Nude/Data Files/Textures/bb/bb_skinf_no.dds'));
  assert.doesNotMatch(bodyEditor, /Morrowind Textures\/Better Bodies/);
});
