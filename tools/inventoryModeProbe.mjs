import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Exercise the real menu and inventory DOM with a figure provider honoring the renderer flags.
// The provider is a stand-in, so this checks mode application, not NIF/body deformation.
const save = JSON.parse(readFileSync(process.env.TEST_SAVES_PATH + '/SAVE2/SaveData.txt','utf8'));
console.log('Preparing browser probe');
const server=await createServer({logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:5269,strictPort:true},plugins:[{name:'inventory-probe-page',configureServer(server){server.middlewares.use('/inventory-mode-probe',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><body></body></html>');});}}]});
await server.listen();console.log('Probe server ready');
const browser=await chromium.launch({headless:true,timeout:30000});console.log('Browser ready');
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();page.setDefaultTimeout(30000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.text().startsWith('probe:'))console.log(message.text());});
const watchdog=setTimeout(()=>{console.error('Browser probe exceeded 120 seconds');void browser.close();},120000);
async function mount() {
 await page.evaluate(async save=>{
  console.log('probe: preferences import');const prefs=await import('/src/systems/uiPrefs.js');console.log('probe: preferences ready');
  const {playerEntity}=await import('/src/characters/playerEntity.js');
  const {restorePlayer}=await import('/src/systems/save/save.js');restorePlayer(playerEntity,save);console.log('probe: save restored');
  const {mountEnhancedInventory}=await import('/src/ui/enhanced/enhancedInventory.js');
  const {enhancedModCatalog}=await import('/src/ui/enhanced/enhancedModCatalog.js');console.log('probe: UI imports ready');
  document.body.replaceChildren();
  const catalog=document.createElement('div');const inventory=document.createElement('div');
  inventory.id='probe-inventory';document.body.append(catalog,inventory);
  const arm={status:()=>({pieces:1,skeletonPath:'mode-probe'}),figure:()=>prefs.getPref('morrowind3dPaperDoll')?{width:32,height:64,data:new Uint8ClampedArray(32*64*4).fill(200)}:null};
  let view;
  const render=()=>{view?.unmount();inventory.hidden=false;catalog.replaceChildren(enhancedModCatalog({section:'bodies',render,openFiles(){},textureNodes:()=>[],paperdollAttach(){},paperdollRemove(){},restart(){},rebuild:async()=>{},editAppearance(){}}));view=mountEnhancedInventory(inventory,{entity:playerEntity,fpArm:arm,items:()=>playerEntity.items??[],onExit(){}});};
  console.log('probe: mounting DOM');render();console.log('probe: DOM mounted');
 },save);
}
async function check(twoD,label){
 await page.waitForFunction(twoD=>document.querySelectorAll('.wornmap-doll.model canvas').length===(twoD?0:1),twoD);
 const actual=await page.evaluate(async()=>{const {getPref}=await import('/src/systems/uiPrefs.js');return ['morrowindThirdPersonOnly','morrowind3dPaperDoll','morrowind3dInventoryIcons'].map(getPref);});
 assert.deepEqual(actual,[twoD,!twoD,!twoD],label);console.log('PASS',label);
}
try {
 await page.goto('http://127.0.0.1:5269/inventory-mode-probe');console.log('Probe page ready');
 await page.evaluate(()=>localStorage.setItem('dagger.ui.v1',JSON.stringify({_rev:2,morrowindThirdPersonOnly:false,morrowind3dPaperDoll:false,morrowind3dInventoryIcons:false})));
 await page.reload();await mount();await check(false,'3D on first mount with stale false renderer flags');
 await page.locator('#probe-inventory').evaluate(node=>{node.hidden=true;});
 await page.getByRole('button',{name:'Инвентарь: 3D',exact:true}).click();await check(true,'menu switches 3D to 2D');
 await page.reload();await mount();await check(true,'2D survives page reload');
 await page.locator('#probe-inventory').evaluate(node=>{node.hidden=true;});
 await page.getByRole('button',{name:'Инвентарь: 2D',exact:true}).click();await check(false,'menu switches 2D to 3D');
 await page.reload();await mount();await check(false,'3D survives page reload without an extra toggle');
 assert.deepEqual(errors,[]);
 mkdirSync('.proving-ground/inventory-mode',{recursive:true});
 writeFileSync('.proving-ground/inventory-mode/result.json',JSON.stringify({passed:true,errors,provider:'renderer-contract stand-in; actual menu and inventory DOM; actual supplied save'},null,2));
} finally {clearTimeout(watchdog);await context.close();await browser.close();await server.close();}
