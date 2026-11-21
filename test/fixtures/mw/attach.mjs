import { readFile } from 'node:fs/promises';
import { memoryIdb } from '../../memoryIdb.mjs';
import { storeMorrowindFiles, countMorrowindArchives } from '../../../src/scenes/dataSource.js';

export async function attachFixtureArchive() {
  globalThis.indexedDB = memoryIdb();
  const bytes = await readFile(new URL('./fixture.bsa', import.meta.url));
  await storeMorrowindFiles([new File([bytes], 'fixture.bsa')]);
  await countMorrowindArchives();
}
