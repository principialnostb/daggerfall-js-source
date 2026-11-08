// Real town surfaces, read-only probe access; no data or captures are published.
import fs from 'node:fs';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const server=await createServer({logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{port:5209,strictPort:true},plugins:[{
 name:'camp-review-access',enforce:'pre',transform(code,id){
  id=id.replaceAll('\\','/');
  if(id.endsWith('/src/scenes/camps.js')){
   const at=code.lastIndexOf('  return {');if(at<0)throw Error('Pool seam moved');
   return code.slice(0,at)+code.slice(at).replace('  return {','  return (globalThis.__campReviewPools ??= [])[globalThis.__campReviewPools.length] = {');
  }
  if(id.endsWith('/src/scenes/exterior.js')){
   const needle='window.__renderer = renderer;';if(!code.includes(needle))throw Error('Town probe seam moved');
   const popAt=code.indexOf('const popDt = townTalk.overlayActive ? 0 : dt;');
   const gate=code.lastIndexOf('if (walkMode) {',popAt);
   if(gate<0)throw Error('Population preview gate moved');
   code=code.slice(0,gate)+code.slice(gate).replace('if (walkMode) {','if (walkMode || (shotMode && window.__campScalePerson)) {');
   return code.replace(needle,needle+`window.__campTerrain={dim:tilemapDim,tiles:Array.from(locationTilemap),size:TILE_WORLD,
    person:(x,y,z)=>{const it=population._freeItem();population._randomiseNPC(it.person);it.person.place(...cityNav.worldToNav(x,z));it.person.pos=[x,y,z];it.person.target=[x,y,z];it.person.moveCount=2;it.active=true;it.visible=true;it.scheduleEnable=false;const step=it.person.update.bind(it.person);it.person.update=(dt,...args)=>step(0,...args);window.__campScalePerson=true;return it.person.nameNPC;},
    ground:(x,z)=>{const h=collider.surfaceHit([x,30,z],[0,-1,0],80);return Number.isFinite(h?.dist)?30-h.dist:null;}};`);
  }
 },
}]});
await server.listen();let browser;
try{
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1080}});
 page.on('pageerror',e=>console.log('PAGE',e.message));
 fs.mkdirSync('scratch/campfire',{recursive:true});
 for(const surface of ['snow','grass']){
  await page.goto('http://localhost:5209/play/?shot&exterior&fly&air=on&season='+(surface==='grass'?'summer':'winter'),{timeout:120000});
  await page.waitForFunction(()=>window.__shotReady&&window.__campTerrain&&window.__campReviewPools?.length,null,{timeout:240000});
  const spot=await page.evaluate(async(surface)=>{
   const p=window.__player.pos,t=window.__campTerrain;
   let x=p[0],z=p[2]+2,y=t.ground(x,z);
   if(surface==='grass'){
    const candidates=[];
    for(let iz=2;iz<t.dim-2;iz++)for(let ix=2;ix<t.dim-2;ix++){
     let grass=true;
     for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if((t.tiles[(iz+dz)*t.dim+ix+dx]&63)!==2)grass=false;
     if(grass)candidates.push({x:(ix+.5)*t.size,z:(iz+.5)*t.size});
    }
    candidates.sort((a,b)=>Math.hypot(a.x-p[0],a.z-p[2])-Math.hypot(b.x-p[0],b.z-p[2]));
    const at=candidates.find(c=>{const h=t.ground(c.x,c.z);return h!=null&&h<.5&&h>-.5;});
    if(!at)throw Error('No clear grass surface found');x=at.x;z=at.z;y=t.ground(x,z);
   }
   if(y==null)throw Error('Ground probe failed');
   const {worldMinutes}=await import('/src/systems/worldTick.js');const camp=[x,y+.008,z];
   for(const pool of window.__campReviewPools)pool.restore([{id:'review:1',kind:'fire',pos:camp,yaw:0,litUntil:worldMinutes()+480,wear:8,fuel:true}]);
   window.__pose(x+.90,y+1.48,z-1.8,Math.atan2(-.90,1.8),-.49);
   let value=window.__frame;
   Object.defineProperty(window,'__frame',{configurable:true,get:()=>value,set:n=>{value=n;window.__campCaptured=window.__renderer.canvas.toDataURL('image/png');}});
   return {camp,surface,pools:window.__campReviewPools.length,palette:(await import('/src/world/dfLook.js')).dfLookOn()};
  },surface);
  console.log('SURFACE',JSON.stringify(spot));
  const f=await page.evaluate(()=>window.__frame);
  await page.waitForFunction(n=>window.__frame>=n,f+5,{timeout:120000});
  const data=await page.evaluate(()=>window.__campCaptured);
  fs.writeFileSync('scratch/campfire/game-'+surface+'.png',Buffer.from(data.split(',')[1],'base64'));
  if(surface==='grass'){
   await page.evaluate(camp=>{
    const [x,y,z]=camp;window.__campTerrain.person(x+.85,y,z+.05);
    window.__pose(x+1.5,y+1.6,z-2.8,Math.atan2(-1.2,2.8),-.30);
   },spot.camp);
   const from=await page.evaluate(()=>window.__frame);
   await page.waitForFunction(n=>window.__frame>=n,from+16,{timeout:120000});
   const frame=await page.evaluate(()=>window.__campCaptured);
   fs.writeFileSync('scratch/campfire/game-scale.png',Buffer.from(frame.split(',')[1],'base64'));
  }
 }
 console.log('REAL SURFACES CAPTURED');
}finally{await browser?.close();await server.close();}
