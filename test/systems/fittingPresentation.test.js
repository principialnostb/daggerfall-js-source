import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRasterSize } from '../../src/ui/enhanced/previewPixelation.js';
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

test('idle fitting advances the real cloth solver only while Animated Cloaks is enabled', () => {
  const previous = getPref('modelCustomization'), enabled = modGroupEnabled('cloak-animation');
  const storage = globalThis.localStorage; globalThis.localStorage = { getItem: () => null, setItem() {} };
  const positions = Float32Array.from([-1,-1,2, 1,-1,2, 1,-1,0, -1,-1,0]);
  const normals = Float32Array.from([0,1,0, 0,1,0, 0,1,0, 0,1,0]);
  const piece = { slot:'cloak (daggerfall_cloak)', positions, normals, batch:{ positions, normals, skin:{ bones:[{ref:1,indices:Uint16Array.from([0,1,2,3]),weights:Float32Array.from([1,1,1,1])}] } }, indices:Uint16Array.from([0,1,2,0,2,3]), sourceGen:0 };
  piece.clothPhysics = createCloakPhysics(piece);
  const rig = {arm:{pieces:[piece]}};
  try {
    setPref('modelCustomization',true); setModGroupEnabled('cloak-animation',true);
    const rest = positions.slice();
    for(let i=0;i<30;i++) stepFittingCloth(rig,true,i*1000/30);
    assert.notDeepEqual(positions,rest);
    const moved=positions.slice(), time=piece.clothPhysics.time;
    setModGroupEnabled('cloak-animation',false);
    for(let i=30;i<60;i++) stepFittingCloth(rig,true,i*1000/30);
    assert.deepEqual(positions,moved); assert.equal(piece.clothPhysics.time,time);
    setModGroupEnabled('cloak-animation',true); stepFittingCloth(rig,false,3000);
    assert.equal(piece.clothPhysics.time,time);
  } finally {setPref('modelCustomization',previous);setModGroupEnabled('cloak-animation',enabled);globalThis.localStorage=storage;}
});
