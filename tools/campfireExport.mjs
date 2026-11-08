// Export original DFO camp art for Blender or another model viewer.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { buildCampfireBody, buildCampfireFlame, campfirePaint } from '../src/world/campfireModel.js';
const out = 'scratch/campfire/model';
fs.mkdirSync(out, {recursive:true});
const records = [0,1,2,3,4,5,6,7,8];
let mtl = '';
for (const record of records) {
  const paint = campfirePaint(record), p = new PNG({width:paint.width,height:paint.height});
  const row = paint.width * 4;
  for(let y=0;y<paint.height;y++)p.data.set(paint.colors.subarray(y*row,(y+1)*row),(paint.height-1-y)*row);
  fs.writeFileSync(`${out}/paint-${record}.png`,PNG.sync.write(p));
  mtl += `newmtl paint-${record}\nKd 1 1 1\nmap_Kd paint-${record}.png\n`;

}
fs.writeFileSync(`${out}/campfire.mtl`,mtl);
for(const [name,m] of [['campfire-body',buildCampfireBody()],['campfire-flame',buildCampfireFlame(0)]]){
  const lines=['# Original DFO campfire, metres, Y up','mtllib campfire.mtl'];
  for(let i=0;i<m.positions.length;i+=3)lines.push(`v ${m.positions.slice(i,i+3).join(' ')}`);
  for(let i=0;i<m.uvs.length;i+=2)lines.push(`vt ${m.uvs.slice(i,i+2).join(' ')}`);
  for(let i=0;i<m.normals.length;i+=3)lines.push(`vn ${m.normals.slice(i,i+3).join(' ')}`);
  for(const sm of m.subMeshes){
    lines.push(`usemtl paint-${sm.textureRecord}`);
    for(let i=sm.startIndex;i<sm.startIndex+sm.primitiveCount*3;i+=3){
      lines.push('f '+Array.from(m.indices.slice(i,i+3),v=>`${v+1}/${v+1}/${v+1}`).join(' '));
    }
  }
  fs.writeFileSync(`${out}/${name}.obj`,lines.join('\n')+'\n');
}
console.log(out);
