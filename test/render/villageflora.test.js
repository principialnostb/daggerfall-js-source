import { test } from 'node:test';
import assert from 'node:assert/strict';
import { villageMeadowMips } from '../../src/render/villageMeadowArt.js';
import { buildMeadowAtlas, slotCoverage } from '../../src/render/grassMeadow.js';
import { drawVillageShrubFlat, standVillageShrubFlats, releaseVillageShrubFlat } from '../../src/render/villageShrubFlats.js';
import { VILLAGE_SLOTS } from '../../src/render/villageGrass.js';
import { groundcoverForm, groundcoverGeometry, groundcoverSurfaces } from '../../src/render/villageGroundcover.js';
import { shrubGeometry } from '../../src/render/villageShrubs.js';
import { treeFloorMap } from '../../src/world/tamriel/helbernar.js';

test('village mesh surfaces are opaque and preserve the five regional silhouettes', () => {
  const base = slotCoverage(buildMeadowAtlas()), levels = villageMeadowMips();
  const coverage = slotCoverage(levels[0],VILLAGE_SLOTS);
  assert.deepEqual(coverage.slice(0,5), base.slice(0,5));
  assert.deepEqual(coverage.slice(5,27),Array(22).fill(1));
  assert.equal(levels.at(-1).width, 1);
});

test('the three Blender shrubs keep woody stems, closed leaves and distinct proportions through LOD', () => {
  const aspects = [];
  for (let form=0; form<3; form++) {
    let previous = Infinity;
    for (let lod=0; lod<3; lod++) {
      const mesh = shrubGeometry(form,lod), edges = new Map(), pigments = new Set();
      let left=Infinity, right=-Infinity, top=0;
      assert.ok(mesh.length < previous);
      previous = mesh.length;
      for (let i=0; i<mesh.length; i+=27) {
        const slot=mesh[i+2]-23;
        pigments.add(slot);
        const points=[3,12,21].map(k=>mesh.subarray(i+k,i+k+3));
        for(const [x,y] of points){left=Math.min(left,x);right=Math.max(right,x);top=Math.max(top,y);}
        if(slot<1 || slot>4) continue;
        for(let k=0;k<3;k++){
          const key=[points[k].join(','),points[(k+1)%3].join(',')].sort().join('/');
          edges.set(key,(edges.get(key)??0)+1);
        }
      }
      assert.ok(pigments.has(0) && pigments.has(5) && edges.size>100);
      assert.ok([...edges.values()].every(count=>count%2===0),'every leaf edge has two sides');
      if (!lod) aspects.push((right-left)/top);
    }
  }
  assert.ok(aspects[0]>aspects[1] && aspects[1]>aspects[2]);
});

test('root map keeps terrain records, locates a trunk across tile boundaries and skips non-trees', () => {
  const bytes = new Uint8Array(128*128).fill(8);
  const flats = [{archive:510,record:11,c:[64,0,64]}, {archive:504,record:12,c:[96,0,96]}, {archive:510,record:1,c:[32,0,32]}];
  const map = treeFloorMap(bytes,flats,6.4,(_a,r)=>r!==1);
  for(let i=0;i<bytes.length;i++) assert.equal(map[4*i],bytes[i]);
  for(const col of [9,10]) {
    const i = 4*(10*128+col);
    assert.equal(map[i+3],2);
    assert.ok(Math.abs((map[i+1]-128)/16+(col+.5)*6.4-64)<0.04);
  }
  assert.equal(map[4*(15*128+15)+3],1);
  assert.equal(map[4*(5*128+5)+3],0);
});


test('mapped roadside bushes keep their recorded roots and release shared landscape geometry', () => {
  const calls=[], dropped=[];
  const renderer={
    _camPos:[12,1,13],
    uploadTexture(_archive,_record,image){ assert.equal(image.colors.length,image.width*image.height*4); },
    createBillboardBatch(){ return {}; }, createMesh(data){ return data; },
    drawMesh(mesh,transform){ calls.push([mesh,...transform.slice(12,15)]); },
    destroyMesh(mesh){ dropped.push(mesh); }
  };
  const p={paths:new Uint8Array(128*128),tilemapBytes:new Uint8Array(128*128).fill(8),unionBox(){}};
  const batches=[];
  standVillageShrubFlats(renderer,p,[[1,0,1],[3,0,2],[13,0,1]],504,1,{w:1,h:1},batches);
  assert.equal(batches.length,2);
  for(const batch of batches) batch.origin=[10,1,10];
  assert.equal(drawVillageShrubFlat(renderer,batches[0],false),true);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].slice(1),[11,1,11]);
  assert.equal(calls[0][0],calls[1][0]);
  assert.equal(calls[0][0].pixelKind,'landscape');
  assert.equal(calls[0][0].subMeshes.length,1);
  renderer._camPos=[200,1,200];
  assert.equal(drawVillageShrubFlat(renderer,batches[0],false),false);
  releaseVillageShrubFlat(renderer,batches[0]);
  assert.equal(dropped.length,0);
  releaseVillageShrubFlat(renderer,batches[1]);
  assert.deepEqual(dropped,[calls[0][0]]);
});

test('the layered meadow keeps all seven forms, two silhouettes per form and clearings inside its map pixel', () => {
  const counts = Array(8).fill(0);
  for (let x=0; x<30; x++) for (let z=0; z<30; z++) {
    for (let roll=0; roll<20; roll++) counts[1+groundcoverForm(x,z,(roll+.5)/20)]++;
  }
  assert.ok(counts.every(n=>n>0));
  assert.ok(counts[5] > counts[6] && counts[5] > counts[7], 'upper stems are accents among the sedges');
  assert.ok(counts[0]>counts[1] && counts[4]<counts[2]);
  for (const [x,z] of [[-1,400],[400,-1],[820,400],[400,820]]) assert.equal(groundcoverForm(x,z,0),-1);
  for (let form=0; form<7; form++) {
    const near = [0,1].map(v=>groundcoverGeometry(2*form+v,0));
    assert.notDeepEqual(near[0], near[1]);
    for (const variant of [0,1]) {
      const middle = groundcoverGeometry(2*form+variant,1), far = groundcoverGeometry(2*form+variant,2);
      assert.ok(near[variant].length>middle.length && middle.length>far.length && far.length>0);
    }
  }
  // An extra sRGB conversion makes the clover cream-coloured against the existing meadow.
  const clover = groundcoverSurfaces()[0].rgba;
  assert.deepEqual([...clover.subarray(0,4)].slice(-1), [255]);
  const greens = clover.filter((_v,i) => i%4 === 1);
  const meanGreen = greens.reduce((a,b)=>a+b,0)/greens.length;
  assert.ok(meanGreen>100 && meanGreen<130);
});
