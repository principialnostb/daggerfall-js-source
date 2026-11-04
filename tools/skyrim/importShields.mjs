// Local, rigid Skyrim shield imports in Morrowind shield-bone coordinates.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { listBsa, extract } from './bsa.mjs';
import { readSseNif } from './sseNif.mjs';
import { meshesToNif } from '../nifWrite.mjs';
import { smoothNormals } from './importIronCuirass.mjs';
import { mipChain, writeDds } from '../meshTexture.mjs';
import { readPng, writePng } from '../pngIO.mjs';
import { resampleRgba } from '../../src/formats/resample.js';
import { drawLook, thumbFile } from '../lookThumbs.mjs';
import { SHIELD_LOOKS } from '../../src/characters/ownModels/shieldLooks.js';

const data = `${process.env.SKYRIM_PATH ?? 'D:/Steam/steamapps/common/Skyrim Special Edition'}/Data`;
const meshArchives = [0,1].map((i) => listBsa(`${data}/Skyrim - Meshes${i}.bsa`));
const textureArchives = Array.from({ length: 9 },(_,i) => listBsa(`${data}/Skyrim - Textures${i}.bsa`));
const get = (archives,path) => {
  path=path.toLowerCase().replaceAll('/','\\');
  for(const b of archives) { const e=b.entries.find((x)=>x.path===path); if(e)return extract(b,e); }
  throw new Error(`Missing local asset: ${path}`);
};
mkdirSync('scratch/shield-import',{recursive:true});
for(const look of SHIELD_LOOKS) {
  const nif=readSseNif(get(meshArchives,`meshes/${look.source}`));
  const source=nif.shapes.filter((s)=>s.shader==='BSLightingShaderProperty' && s.textures?.[0] && s.tris.length);
  const points=source.flatMap((s)=>s.verts.map((v)=>v.pos.map((p,k)=>p*s.S+s.T[k])));
  const min=[0,1,2].map((k)=>Math.min(...points.map((p)=>p[k]))),max=[0,1,2].map((k)=>Math.max(...points.map((p)=>p[k])));
  // Genuine round shields only: uniform scaling retains their source shape.
  // The offset/grip frame is the original MW iron shield's measured bounds.
  const scale=(look.templateIndex===111?60:44)/Math.max(max[0]-min[0],max[1]-min[1]);
  const centre=min.map((v,k)=>(v+max[k])/2), target=[-4.277,-.566,2.668];
  const shapes=source.map((s,index)=>{
    const texture=look.model.replace('.nif',`_${index}.dds`);
    const raw=`scratch/shield-import/${texture}`;
    writeFileSync(raw,get(textureArchives,s.textures[0]));
    const png=readPng(execFileSync('python',['-c','from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGBA").save(sys.stdout.buffer,format="PNG")',raw],{maxBuffer:32*1024*1024}));
    const image=resampleRgba(png,256,256);
    writeFileSync(`src/assets/mw/textures/${texture}`,writeDds(mipChain(image)));
    // Skyrim's decorative face is -Z; MW's carried shield face is +Z.
    // A proper half-turn around Y keeps winding and the handle on the arm side.
    const positions=s.verts.map((v)=>v.pos.map((p,k)=>target[k]+(p*s.S+s.T[k]-centre[k])*scale*(k===1?1:-1)));
    const indices=s.tris.flat();
    return { name:s.name,texture,mesh:{positions:positions.flat(),normals:smoothNormals(positions,indices).flat(),uvs:s.verts.flatMap((v)=>v.uv),indices} };
  });
  writeFileSync(`src/assets/mw/meshes/${look.model}`,meshesToNif(shapes,{node:look.label,keepV:true}));
  // Shield faces lie in XY; lookThumbs normally projects XZ.
  writeFileSync(thumbFile(look.model),writePng(drawLook([look.model],{pitch:-Math.PI/2,yaw:0})));
  console.log(look.label,shapes.length,'shapes',Math.round(scale*100)/100,'scale');
}
