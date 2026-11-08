import { TEST_BUILD_CONTENT } from './testBuildContent.js';
import { APP_ROOT } from './appRoot.js';
import { openDfmodBundleSource } from './dfmodTextures.js';

export function createTestPaperdollPack(index, loadBlob, open = openDfmodBundleSource) {
  let blob;
  return Object.freeze({key:'dfmod/paperdoll enhanced.dfmod',index,on:true,stamp:'test-build-paperdoll-v1',
    open:async()=>{blob ??= loadBlob();return open(await blob,{knownTextures:index.textures});},
  });
}
let packs;
export async function testBuildPaperdollPacks() {
  if (!TEST_BUILD_CONTENT) return [];
  if (!packs) packs = (async()=>{
    const root = APP_ROOT ?? globalThis.document?.baseURI;
    const indexResponse = await fetch(new URL(TEST_BUILD_CONTENT.paperdollIndex,root));
    if(!indexResponse.ok)throw new Error('Bundled Paperdoll Enhanced index unavailable');
    const index = await indexResponse.json();
    return [createTestPaperdollPack(index,async()=>{
      const response=await fetch(new URL(TEST_BUILD_CONTENT.paperdoll,root));
      if(!response.ok)throw new Error('Bundled Paperdoll Enhanced unavailable');
      return response.blob();
    })];
  })();
  return packs;
}
