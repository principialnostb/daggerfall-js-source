#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const DEFAULT_MODEL = 'fal-ai/kling-image/o3/image-to-image';
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'vendor/smart-paperdoll/Textures/body');

function args(argv) {
  const o={references:[],rows:4,cols:4,cellWidth:64,cellHeight:128,model:DEFAULT_MODEL,
    outDir:OUT_DIR,background:'#ff00ff',maxColors:256};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--reference')o.references.push(argv[++i]);
    else if(a==='--rows')o.rows=Number(argv[++i]);
    else if(a==='--cols')o.cols=Number(argv[++i]);
    else if(a==='--cell-width')o.cellWidth=Number(argv[++i]);
    else if(a==='--cell-height')o.cellHeight=Number(argv[++i]);
    else if(a==='--keys')o.keysFile=argv[++i];
    else if(a==='--palette-reference')o.paletteReference=argv[++i];
    else if(a==='--prompt-file')o.promptFile=argv[++i];
    else if(a==='--model')o.model=argv[++i];
    else if(a==='--out-dir')o.outDir=path.resolve(argv[++i]);
    else if(a==='--background')o.background=argv[++i];
    else if(a==='--max-colors')o.maxColors=Number(argv[++i]);
    else if(a==='--help'||a==='-h')o.help=true;
    else throw new Error('Unknown argument: '+a);
  }
  return o;
}
function help(){
  console.log('Smart PaperDoll sprite-sheet generator\n\n'+
  'FAL_KEY=... node tools/smartPaperdollSpriteSheet.mjs --reference Reference/First.png --reference Reference/Second.png --reference <original-112364.png> --keys <real-key-list.json>\n\n'+
  'Options: --rows N --cols N --cell-width N --cell-height N --palette-reference FILE --prompt-file FILE --model ID --out-dir DIR --background #RRGGBB --max-colors 256\n\n'+
  'Keys JSON: [{"key":"112364_15-0","width":64,"height":128,"orientation":0,"mirror":false}, ...]\n'+
  'The key list must come from real spriteFor() results. The script refuses keys outside archive 112364.');
}
function rgb(hex){
  const h=hex.replace('#','');
  if(!/^[0-9a-f]{6}$/i.test(h))throw new Error('Background must be #RRGGBB');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
}
function readPng(buf){return new Promise((resolve,reject)=>new PNG().parse(buf,(e,p)=>e?reject(e):resolve(p)));}
function encodePng(png){return new Promise((resolve,reject)=>{const chunks=[];png.pack().on('data',c=>chunks.push(c)).on('error',reject).on('end',()=>resolve(Buffer.concat(chunks)));});}
function crop(src,x0,y0,w,h){
  const out=new PNG({width:w,height:h});
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const si=((y+y0)*src.width+x+x0)*4,di=(y*w+x)*4;src.data.copy(out.data,di,si,si+4);}
  return out;
}
function nearest(src,w,h){
  const out=new PNG({width:w,height:h});
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=Math.min(src.width-1,Math.floor(x*src.width/w)),sy=Math.min(src.height-1,Math.floor(y*src.height/h)),si=(sy*src.width+sx)*4,di=(y*w+x)*4;src.data.copy(out.data,di,si,si+4);}
  return out;
}
function removeBackground(p,bg,tol=54){
  const seen=new Uint8Array(p.width*p.height),stack=[],w=p.width,h=p.height;
  const near=i=>{const r=p.data[i]-bg[0],g=p.data[i+1]-bg[1],b=p.data[i+2]-bg[2];return Math.sqrt(r*r+g*g+b*b)<=tol;};
  const add=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const n=y*w+x,i=n*4;if(seen[n]||!near(i))return;seen[n]=1;stack.push(n);};
  for(let x=0;x<w;x++){add(x,0);add(x,h-1);}for(let y=0;y<h;y++){add(0,y);add(w-1,y);}
  while(stack.length){const n=stack.pop(),x=n%w,y=Math.floor(n/w),i=n*4;p.data[i+3]=0;add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);}
}
function paletteOf(p,max){
  const counts=new Map();
  for(let i=0;i<p.data.length;i+=4){if(p.data[i+3]<128)continue;const k=(p.data[i]<<16)|(p.data[i+1]<<8)|p.data[i+2];counts.set(k,(counts.get(k)||0)+1);}
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,max).map(([k])=>[(k>>16)&255,(k>>8)&255,k&255]);
}
function quantize(p,palette){
  const cache=new Map();
  for(let i=0;i<p.data.length;i+=4){if(!p.data[i+3])continue;const k=(p.data[i]<<16)|(p.data[i+1]<<8)|p.data[i+2];let c=cache.get(k);
    if(!c){let best=Infinity;for(const q of palette){const r=p.data[i]-q[0],g=p.data[i+1]-q[1],b=p.data[i+2]-q[2],d=.30*r*r+.59*g*g+.11*b*b;if(d<best){best=d;c=q;}}cache.set(k,c);}
    p.data[i]=c[0];p.data[i+1]=c[1];p.data[i+2]=c[2];
  }
  for(let i=0;i<p.data.length;i+=4)if(!p.data[i+3])p.data[i]=p.data[i+1]=p.data[i+2]=0;
}
async function upload(fal,file){
  const bytes=await fs.readFile(file),ext=path.extname(file).toLowerCase(),mime=ext==='.png'?'image/png':'image/jpeg';
  return fal.storage.upload(new File([bytes],path.basename(file),{type:mime}));
}
async function main(){
  const o=args(process.argv.slice(2));if(o.help)return help();
  if(!process.env.FAL_KEY)throw new Error('FAL_KEY missing. Create a key at https://fal.ai/dashboard/keys.');
  if(!o.references.length)throw new Error('Provide at least one --reference.');
  if(!o.keysFile)throw new Error('--keys is required; frame keys must come from actual spriteFor() results.');
  if(!Number.isInteger(o.rows)||!Number.isInteger(o.cols)||o.rows<1||o.cols<1)throw new Error('Rows and columns must be positive integers.');
  for(const f of o.references)await fs.access(path.resolve(ROOT,f));
  const keys=JSON.parse(await fs.readFile(path.resolve(ROOT,o.keysFile),'utf8'));
  if(!Array.isArray(keys)||keys.length!==o.rows*o.cols)throw new Error('Key list length must equal rows*cols.');
  for(const k of keys)if(!k||!/^112364_\d+-\d+$/.test(k.key||''))throw new Error('Invalid key; only archive 112364 is allowed: '+(k?.key||'missing'));
  const {fal}=await import('@fal-ai/client');fal.config({credentials:process.env.FAL_KEY});
  const urls=[];
  for(const f of o.references){console.log('Uploading reference:',f);urls.push(await upload(fal,path.resolve(ROOT,f)));}
  const prompt=o.promptFile?await fs.readFile(path.resolve(ROOT,o.promptFile),'utf8'):
    'Create ONE sprite sheet with exactly '+o.cols+' columns and '+o.rows+' rows. One consistent adult human female fantasy character, full body in every cell, centered, feet visible, consistent scale and identity. Late-1990s Daggerfall / Eye of the Beholder pre-rendered billboard pixel art: hard pixel edges, no anti-aliasing, no blur, limited retro palette. Use @Image1 and @Image2 only for broad body volume and proportions, not green skin, reptilian anatomy, or their rendering style. Use the original Light Fighter reference for human skin palette and pixel scale if supplied as @Image3. Natural human proportions, broader believable hips, relaxed shoulders, arms with volume, natural torso contours, no glossy doll anatomy. Old-game fantasy cloth/drapery and directional shadows cover intimate areas non-explicitly. Different view/pose per cell, consistent character. No text, labels, borders, scenery, props or grid lines. Flat solid '+o.background+' background. Avoid 3D render, photorealism, smooth CG, green skin, lizard features, spherical breasts, stick arms, narrow hips, blur, cross-cell bleed.';
  console.log('Generating one sheet with',o.model);
  const result=await fal.subscribe(o.model,{input:{prompt,image_urls:urls,resolution:'2K',result_type:'single',num_images:1,aspect_ratio:'1:1',output_format:'png',enable_safety_checker:true},logs:true,onQueueUpdate:u=>{if(u.status==='IN_PROGRESS')for(const l of u.logs||[])console.log(l.message);}});
  const url=result?.data?.images?.[0]?.url;if(!url)throw new Error('fal.ai returned no image URL: '+JSON.stringify(result?.data||result));
  const res=await fetch(url);if(!res.ok)throw new Error('Failed to download generated sheet: HTTP '+res.status);
  const bytes=Buffer.from(await res.arrayBuffer()),sheet=await readPng(bytes);
  const sheetPath=path.join(ROOT,'vendor/smart-paperdoll/generated/sprite-sheet.png');
  await fs.mkdir(path.dirname(sheetPath),{recursive:true});await fs.writeFile(sheetPath,bytes);
  const cw=Math.floor(sheet.width/o.cols),ch=Math.floor(sheet.height/o.rows);
  if(cw<32||ch<32)throw new Error('Generated sheet too small: '+sheet.width+'x'+sheet.height);
  let palette=o.paletteReference?paletteOf(await readPng(await fs.readFile(path.resolve(ROOT,o.paletteReference))),o.maxColors):null;
  await fs.mkdir(path.resolve(ROOT,o.outDir),{recursive:true});const manifest=[];
  for(let n=0;n<keys.length;n++){
    const row=Math.floor(n/o.cols),col=n%o.cols,cell=crop(sheet,col*cw,row*ch,cw,ch);
    removeBackground(cell,rgb(o.background));
    const w=keys[n].width||o.cellWidth,h=keys[n].height||o.cellHeight,p=nearest(cell,w,h);
    if(!palette)palette=paletteOf(p,o.maxColors);quantize(p,palette);
    const file=keys[n].key+'.png',dest=path.join(path.resolve(ROOT,o.outDir),file);
    await fs.writeFile(dest,await encodePng(p));
    manifest.push({key:keys[n].key,file:path.relative(ROOT,dest).replaceAll(path.sep,'/'),width:w,height:h,orientation:keys[n].orientation??null,mirror:!!keys[n].mirror,sourceCell:{row,col},generated:true,reviewRequired:true});
    console.log('Wrote',manifest.at(-1).file,w+'x'+h);
  }
  const mf='vendor/smart-paperdoll/generated/generated-manifest.json';
  await fs.writeFile(path.join(ROOT,mf),JSON.stringify({model:o.model,requestId:result.requestId||null,sheet:{file:'vendor/smart-paperdoll/generated/sprite-sheet.png',width:sheet.width,height:sheet.height,rows:o.rows,cols:o.cols},paletteColors:palette.length,background:o.background,frames:manifest},null,2)+'\n');
  console.log('Finished. Art is unreviewed and is NOT automatically enabled in runtime.');
  console.log('Sheet: vendor/smart-paperdoll/generated/sprite-sheet.png');console.log('Manifest:',mf);
}
main().catch(e=>{console.error('ERROR:',e.message);process.exitCode=1;});
