import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { animationOverhaulEntries, selectAnimationFamily, isFistAnimationGroup, fistAnimationSourceEnabled } from '../../../src/formats/morrowind/mwWalkAnimationAssets.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { collectTextKeys, normalizeTextKeys, resetClip, extractTracks, sampleTrack } from '../../../src/formats/morrowind/mwAnim.js';
import { pickAnimSource } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { MOD_SETTINGS } from '../../../src/systems/modSettings.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices, accumRootRef, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';

const path = name => new URL('../../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/'+name, import.meta.url);
const available = existsSync(path('Xbase_anim.kf')) && existsSync(path('Xbase_anim_female.kf'));
const report = file => { const keys = normalizeTextKeys(collectTextKeys(parseNif(readFileSync(file)))); return { keys, groups: [...new Set(keys.map(k=>k.text.split(':')[0]))] }; };

test('the configured fist source defaults to MAO with an explicit archive fallback choice', () => {
  const setting=MOD_SETTINGS['morrowind-animation'].keys.ThirdPersonFistsSource;
  assert.equal(setting.default,1);assert.match(setting.options[0],/Vanilla/);assert.match(setting.options[1],/Morrowind Animation Overhaul/);
});

test('the optional fist family retains the accepted shield-bash source', () => {
  assert.equal(fistAnimationSourceEnabled({choice:1}),true);
  assert.equal(fistAnimationSourceEnabled({choice:1,shield:true}),false);
  assert.equal(fistAnimationSourceEnabled({choice:0}),false);
  assert.equal(fistAnimationSourceEnabled({choice:0,shield:true}),false);
});

test('MAO female library inherits shared groups before applying sparse overrides', {skip:!available}, () => {
  const base = {name:'base', ...report(path('Xbase_anim.kf'))}, female = {name:'female', ...report(path('Xbase_anim_female.kf'))};
  assert.ok(!female.groups.includes('walkforwardhh'), 'the actual female file is sparse');
  const sources = animationOverhaulEntries({female:true,base,femaleOverride:female});
  assert.equal(pickAnimSource(sources,'walkforwardhh',resetClip,{loopFallback:true}).source,base);
  assert.equal(pickAnimSource(sources,'runforward',resetClip,{loopFallback:true}).source,female);
  assert.deepEqual(animationOverhaulEntries({base,femaleOverride:female}),[base]);
  assert.deepEqual(animationOverhaulEntries({female:true,base}),[base]);
  assert.deepEqual(animationOverhaulEntries({female:true,femaleOverride:female}),[female]);
});

test('MAO fist source admits the entire fist family and excludes other weapon choreography', {skip:!available}, () => {
  const source = report(path('Xbase_anim.kf'));
  const selected = selectAnimationFamily({family:'fists'},source);
  for(const group of ['idlehh','handtohand','jumphh','walkforwardhh','runbackhh','sneaklefthh','turnrighthh']) assert.ok(selected.familyGroups.includes(group),group);
  for(const group of ['idle2c','weapontwohand','weapononehand','walkforward2c','walkforward1h','idle','walkforward','hit1']) assert.ok(!selected.familyGroups.includes(group),group);
  for(const type of ['chop','slash','thrust']) for(const follow of ['small','medium','large']) {
    const state=resetClip(selected.familyKeys,'handtohand',{start:type+' start',stop:type+' '+follow+' follow stop'});
    assert.ok(state.ok,type+' '+follow);assert.ok(state.stopTime>state.startTime);
  }
  assert.equal(selected.isOverhaul,false,'fist sources do not accidentally enable a whole-library override');
});

test('fist admission is exact and does not leak multiline keys or similarly named groups', () => {
  assert.ok(isFistAnimationGroup('IdleHH'));
  for(const group of ['handtohandextra','idlehh2','walkforward2c','swimwalkforwardhh']) assert.ok(!isFistAnimationGroup(group));
  const selected=selectAnimationFamily({family:'fists'},{groups:['idlehh','idle2c'],keys:[{time:1,text:'idle2c: start\nIdleHH: start'},{time:2,text:'idlehh: stop\nweapononehand: equip start'}]});
  assert.deepEqual(selected.familyKeys,[{time:1,text:'idlehh: start'},{time:2,text:'idlehh: stop'}]);
});

test('existing MAO movement admission still keeps its established scope and event records', () => {
  const keys=[{time:1,text:'soundgen: left\nwalkforwardhh: start'},{time:2,text:'handtohand: chop start'},{time:3,text:'walkforward: start'}];
  const selected=selectAnimationFamily({family:'all',movementOnly:true},{groups:['walkforwardhh','handtohand','walkforward'],keys});
  assert.deepEqual(selected.familyGroups,['walkforwardhh']);assert.deepEqual(selected.familyKeys,[keys[0]]);
});

test('MAO fist recovery returns to the same female support stance', {skip:!available}, () => {
  const nif=parseNif(readFileSync(path('Xbase_anim.kf'))), source=report(path('Xbase_anim.kf'));
  const {familyKeys:keys}=selectAnimationFamily({family:'fists'},source);
  const sk=buildSkeleton(parseNif(readFileSync(new URL('../../../vendor/weapon-sheathing/Data Files/Animations/xbase_anim_female/xbase_anim_sh.nif',import.meta.url))));
  const tracks=extractTracks(nif),accumRoot=accumRootRef(sk,tracks);
  const at=time=>skeletonSpaceMatrices(sk,poseSkeleton(sk,tracks,sampleTrack,time,{accumRoot}),GRAPH_ROOT);
  const guard=resetClip(keys,'idlehh',{loopFallback:true});assert.ok(guard.ok);
  const idle=at(guard.startTime);
  for(const type of ['chop','slash','thrust']){
    const clip=resetClip(keys,'handtohand',{start:type+' start',stop:type+' small follow stop'});assert.ok(clip.ok);
    for(const time of [clip.startTime,clip.stopTime])for(const name of ['bip01 l foot','bip01 r foot']){
      const ref=sk.byName.get(name),distance=Math.hypot(...at(time).get(ref).t.map((v,i)=>v-idle.get(ref).t[i]));
      assert.ok(distance<0.1,`${type} ${name}: ${distance} model units from guard; recovery must not exchange support stances`);
    }
  }
});
