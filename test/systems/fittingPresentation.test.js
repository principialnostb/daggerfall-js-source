import test from 'node:test';
import assert from 'node:assert/strict';
import { editorPreviewRaster, previewRasterSize, itemPreviewRasterSize } from '../../src/ui/enhanced/previewPixelation.js';
import { stepFittingCloth } from '../../src/render/fittingCloth.js';
import { createCloakPhysics } from '../../src/formats/morrowind/mwCloakPhysics.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { modGroupEnabled, setModGroupEnabled } from '../../src/systems/enhancedModResources.js';

test('preview resolution follows player screen-row intensity and off retains full detail', () => {
  assert.deepEqual(previewRasterSize(96,96,68,800,200), {width:17,height:17});
  assert.deepEqual(previewRasterSize(384,640,500,800,200), {width:75,height:125});
  assert.deepEqual(previewRasterSize(96,96,68,800,0), {width:96,height:96});
  assert.deepEqual(previewRasterSize(96,96,68,800,800), {width:96,height:96});
});

test('editor matches displayed world blocks across all five tiers and render scales', () => {
  const native = { world: [1920, 1080], worldDisplayHeight: 1080 };
  assert.deepEqual([0, 540, 360, 270, 200].map(rows => editorPreviewRaster(300, 480, rows, native, 1080)), [
    { width: 300, height: 480, pixelated: false },
    { width: 150, height: 240, pixelated: true },
    { width: 100, height: 160, pixelated: true },
    { width: 75, height: 120, pixelated: true },
    { width: 60, height: 96, pixelated: true },
  ]);
  const scaled = { world: [960, 540], worldDisplayHeight: 1080 };
  assert.deepEqual(editorPreviewRaster(300, 480, 270, scaled, 1080), { width: 75, height: 120, pixelated: true });
  assert.deepEqual(editorPreviewRaster(300, 480, 540, scaled, 1080, 2), { width: 600, height: 960, pixelated: false });
  const smallViewport = { world: [600, 600], worldDisplayHeight: 300 };
  assert.deepEqual(editorPreviewRaster(300, 480, 200, smallViewport, 1080, 2), { width: 200, height: 320, pixelated: true });
});

test('small item cards retain distinct detail budgets without the full-screen block size', () => {
  assert.deepEqual([0, 540, 360, 270, 200].map((rows) => itemPreviewRasterSize(96, 96, 68, rows)), [
    { width: 96, height: 96 }, { width: 36, height: 36 }, { width: 27, height: 27 },
    { width: 23, height: 23 }, { width: 20, height: 20 },
  ]);
  assert.deepEqual(itemPreviewRasterSize(48, 96, 68, 360), { width: 14, height: 27 });
  assert.deepEqual(itemPreviewRasterSize(192, 384, 136, 360), { width: 27, height: 54 });
});

test('idle fitting advances the real cloth solver only while Animated Cloaks is enabled', () => {
  const previous = getPref('modelCustomization'), enabled = modGroupEnabled('cloak-animation');
  const storage = globalThis.localStorage; globalThis.localStorage = { getItem: () => null, setItem() {} };
  const positions = Float32Array.from([-1,-1,2, 1,-1,2, 1,-1,0, -1,-1,0]);
  const normals = Float32Array.from([0,1,0, 0,1,0, 0,1,0, 0,1,0]);
  const piece = { slot:'cloak (daggerfall_cloak)', positions, normals, batch:{ positions, normals, skin:{ bones:[{ref:1,indices:Uint16Array.from([0,1,2,3]),weights:Float32Array.from([1,1,1,1])}] } }, indices:Uint16Array.from([0,1,2,0,2,3]), sourceGen:0 };
  piece.clothPhysics = createCloakPhysics(piece);
  const rig = {arm:{pieces:[piece], cpuSkinned:true, mats:new Map(),
    fns:{skinBatch(batch, skeleton, pose, mats, out) { out.set(batch.positions); }} }};
  try {
    setPref('modelCustomization',true); setModGroupEnabled('cloak-animation',true);
    const rest = positions.slice();
    for(let i=0;i<30;i++) stepFittingCloth(rig,true,i*1000/30);
    assert.notDeepEqual(positions,rest);
    assert.deepEqual(piece.clothPhysics.pos,rest);
    assert.equal(piece.clothPhysics.time,0, 'painting the preview does not advance the world');
    const moved=positions.slice(), time=piece.clothPhysics.time;
    setModGroupEnabled('cloak-animation',false);
    for(let i=30;i<60;i++) stepFittingCloth(rig,true,i*1000/30);
    assert.deepEqual(positions,moved); assert.equal(piece.clothPhysics.time,time);
    setModGroupEnabled('cloak-animation',true); stepFittingCloth(rig,false,3000);
    assert.equal(piece.clothPhysics.time,time);
  } finally {setPref('modelCustomization',previous);setModGroupEnabled('cloak-animation',enabled);globalThis.localStorage=storage;}
});
