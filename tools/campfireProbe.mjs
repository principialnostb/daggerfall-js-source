// Local proof using the game's actual WebGL renderer; writes only ignored scratch files.
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const html = `<!doctype html><style>body{margin:0;background:#171b19}canvas{width:960px;height:720px;image-rendering:pixelated}</style><canvas id="view"></canvas><script type="module">
import { Renderer } from '/src/render/renderer.js';
import { EL_LANE } from '/src/render/enhancedLighting.js';
import { campfirePaint } from '/src/world/campfireModel.js';
import { createCampfireVisual } from '/src/scenes/campfireVisual.js';
import { perspective, mirrorProjectionX, lookAt, identity } from '/src/world/mat4.js';
import { MeshBench, box } from '/src/world/ships/galleonMesh.js';
const r=new Renderer(document.querySelector('canvas'));
r.setLightingLane(EL_LANE);r.setAir(true);r.setExposure(1.15);
r.setClearColor([.09,.11,.10,1]);r.setLighting([.37,.38,.40],.35,[1,.91,.76]);r.setFog('off',0,0,100,[0,0,0]);
r.uploadTexture(38341,3,campfirePaint(3));
const fire=createCampfireVisual(r), b=new MeshBench(38341);
box(b,3,[0,-.025,0],[2,.025,2],{tile:[.5,.5]});const floorData=b.finish();floorData.subMeshes[0].textureArchive=38341;floorData.subMeshes[0].textureRecord=3;const floor=r.createMesh(floorData);
window.render=(angle=0,lit=true,time=0)=>{
 const radius=window.topView?.02:2.5;
 const eye=[Math.sin(angle)*radius,window.topView?3.4:1.65,Math.cos(angle)*radius];
 r.setPointLights(new Float32Array(lit?[0,.48,0,5]:[]),new Float32Array([1,.38,.1]));
 r.beginFrame(mirrorProjectionX(perspective(Math.PI/4,960/720,.05,50)),lookAt(eye,[0,.35,0],[0,1,0]),new Float32Array([.4,.8,.3]),{world:true});
 // Acquire textures before drawing the floor; draws the same pool visual the game uses.
 r.drawMesh(floor,identity());fire.draw({rec:{pos:[0,0,0],yaw:0}},lit,time);r.resolveFrame();
 window.ready=true;
};window.pose=[.5,true,0];requestAnimationFrame(function loop(){window.render(...window.pose);requestAnimationFrame(loop);});
</script>`;
const server = await createServer({optimizeDeps:{noDiscovery:true,include:[]}, server: { port: 5208, strictPort: true }, plugins: [{name:'campfire-proof',configureServer(s){
  s.middlewares.use((req,res,next)=>{if(req.url==='/__campfire'){res.setHeader('Content-Type','text/html');res.end(html);}else next();});
}}] });
await server.listen();
let browser;
try {
  browser = await chromium.launch({headless:true,args:['--use-gl=angle','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:960,height:720}});
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
  page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
  page.on('requestfailed',q=>console.log('REQUEST FAILED',q.url()));
  await page.goto('http://localhost:5208/__campfire',{timeout:120000});
  await page.waitForFunction(()=>window.ready===true,{},{timeout:60000});
  fs.mkdirSync('scratch/campfire',{recursive:true});
  for(const [name,angle,lit,time] of [['front',.5,true,0],['back',3.5,true,.25],['cold',.5,false,0],['top',.5,true,.5]]){
    await page.evaluate(top=>{window.topView=top;},name==='top');
    await page.evaluate((pose)=>new Promise(resolve=>{window.pose=pose;requestAnimationFrame(()=>requestAnimationFrame(resolve));}),[angle,lit,time]);
    await page.screenshot({path:'scratch/campfire/'+name+'.png'});
  }
  await page.evaluate(()=>{window.topView=false;});
  for(let f=0;f<16;f++){
    await page.evaluate(pose=>new Promise(resolve=>{window.pose=pose;requestAnimationFrame(()=>requestAnimationFrame(resolve));}),[.5,true,f/12]);
    await page.screenshot({path:'scratch/campfire/frame-'+String(f).padStart(2,'0')+'.png'});
  }
  console.log(JSON.stringify({errors,images:'scratch/campfire'}));
  if(errors.length)process.exitCode=1;
} finally {await browser?.close();await server.close();}
