import { appStorage } from './appStorage.js';
import { MOD_PACKS, packForPath } from './enhancedModCatalog.js';
const DB = 'dfo-enhanced-resources-v1';
const urls = new Map();
const records = new Map();
const bundled = new Map();
const registeredPatterns = new Set();
let database, pending;
export let resourceError = '';
export let resourcesChanged = false;
const stateKey = 'enhanced-mod-groups-v1';
const read = key => { try { return JSON.parse(appStorage()?.getItem(key) || '{}'); } catch { return {}; } };
const write = (key, value) => { const storage=appStorage(); if (!storage) throw new Error('Хранилище недоступно.'); storage.setItem(key,JSON.stringify(value)); };
const disabled = read(stateKey);
const removedKey = 'enhanced-mod-removed-v1';
const removed = read(removedKey);
export const modGroupEnabled = id => disabled[id] !== false;
export const modResourceAllowed = path => {
  const pack=packForPath(path);
  return !pack || (modGroupEnabled(pack.group) && removed[pack.id] !== true);
};
let presentationRevision = 0;
export const noteModPresentationChanged = () => { presentationRevision++; };
export const modResourceSignature = () => JSON.stringify([
  presentationRevision,
  Object.entries(disabled).filter(([,value])=>value===false).sort(),
  Object.entries(removed).filter(([,value])=>value===true).sort(),
  [...records.values()].map(pack=>[pack.id,pack.revision||0]).sort(),
]);

export function setModGroupEnabled(id, enabled) { const next={...disabled,[id]:enabled}; write(stateKey,next); Object.assign(disabled,next); resourcesChanged=true; }
export function initEnhancedModResources() {
  if (pending) return pending;
  pending=(async()=>{
    if (!globalThis.indexedDB) return;
    database=await new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('packs',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    const packs=await new Promise((resolve,reject)=>{
      const request=database.transaction('packs').objectStore('packs').getAll();
      request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
    });
    for(const pack of packs){
      records.set(pack.id,pack);
      for(const file of pack.files) urls.set(file.path,URL.createObjectURL(file.blob));
    }
  })().catch(error=>{resourceError=String(error?.message||error);});
  return pending;
}
export function globPattern(pattern) {
  let source='';
  for(let i=0;i<pattern.length;i++){
    const c=pattern[i];
    if(c==='*' && pattern[i+1]==='*') {i++; if(pattern[i+1]==='/'){i++;source+='(?:.*/)?';}else source+='.*';}
    else if(c==='*')source+='[^/]*';
    else if(c==='?')source+='[^/]';
    else if(c==='{')source+='(?:';
    else if(c==='}')source+=')';
    else if(c===',')source+='|';
    else source+=c.replace(/[.()+^$|[\]\\]/g,'\\$&');
  }
  return new RegExp('^'+source+'$','i');
}
export function modResourceGlob(patterns, original) {
  const list=Array.isArray(patterns)?patterns:[patterns];
  const matchers=list.map(globPattern);
  for(const pattern of list)registeredPatterns.add(pattern);
  const prefix=list[0].slice(0,list[0].indexOf('Mods/'));
  for(const path of Object.keys(original)){
    const pack=packForPath(path);
    if(pack){
      if(!bundled.has(pack.id))bundled.set(pack.id,new Set());
      bundled.get(pack.id).add(path.slice(path.toLowerCase().indexOf('/mods/')+1).toLowerCase());
    }
  }
  const result={...original};
  for(const [path,url] of urls){
    const full=prefix+path;
    if(matchers.some(re=>re.test(full))){
      for(const key of Object.keys(result))if(key.toLowerCase()===full.toLowerCase())delete result[key];
      result[full]=url;
    }
  }
  for(const path of Object.keys(result)){
    const pack=packForPath(path);
    if(pack && removed[pack.id] === true)delete result[path];
  }
  return result;
}
export function modPackState(id) {
  const state = resourceConnectionState({ importedCount: records.get(id)?.files.length || 0, bundledCount: bundled.get(id)?.size || 0, removed: removed[id] === true });
  return { ...state, imported: records.has(id), bundled: bundled.has(id) };
}
export const modGroupReady = id => modGroupEnabled(id) && MOD_PACKS.filter(pack=>pack.group===id).every(pack=>modPackState(pack.id).connected);
export function resourceConnectionState({ importedCount = 0, bundledCount = 0, removed = false } = {}) {
  const count = removed ? 0 : importedCount || bundledCount;
  return { connected: count > 0, count };
}
export function normalizeModFiles(pack, files) {
  const marker=pack.folder.toLowerCase()+'/';
  const accepted=[];
  for(const file of files){
    let path=(file.webkitRelativePath||file.name).replaceAll('\\','/');
    const at=path.toLowerCase().indexOf(marker);
    path=at>=0?path.slice(at+marker.length):path.slice(path.indexOf('/')+1);
    if(path.split('/').some(p=>p==='..')||! /\.(kf|nif|dds|tga|esp)$/i.test(path))continue;
    accepted.push({path:'Mods/'+pack.folder+'/'+path,blob:file});
  }
  if(!accepted.length)throw new Error('В выбранной папке нет поддерживаемых ресурсов. Выберите распакованную папку мода.');
  return accepted.sort((a,b)=>a.path.localeCompare(b.path));
}
async function commitPack(id,value){
  await initEnhancedModResources();
  if(!database)throw new Error(resourceError||'Хранилище ресурсов недоступно.');
  await new Promise((resolve,reject)=>{
    const tx=database.transaction('packs','readwrite'); const store=tx.objectStore('packs');
    if(value)store.put(value);else store.delete(id);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  if(value)records.set(id,value);else records.delete(id);
  resourcesChanged=true;
}
export async function attachModFolder(id,files){
  const pack=MOD_PACKS.find(p=>p.id===id); if(!pack)throw new Error('Неизвестная модификация.');
  const assets=normalizeModFiles(pack,files);
  const compatible=assets.filter(file=>[...registeredPatterns].some(pattern=>{
    const prefix=pattern.slice(0,pattern.indexOf('Mods/'));
    return globPattern(pattern).test(prefix+file.path);
  }));
  if(!compatible.length)throw new Error('Структура папки не соответствует загрузчику. Выберите корневую папку распакованного мода.');
  for(const asset of compatible){
    const bytes=new Uint8Array(await asset.blob.slice(0,80).arrayBuffer());
    if(/\.(nif|kf)$/i.test(asset.path)){
      const header=new TextDecoder().decode(bytes);
      if(!/^(NetImmerse|Gamebryo) File Format/.test(header))throw new Error('Неверный формат: '+asset.path);
    }
    if(/\.dds$/i.test(asset.path) && String.fromCharCode(...bytes.slice(0,4))!=='DDS ')throw new Error('Неверная DDS-текстура: '+asset.path);
  }
  if(pack.group==='bodies' && (!compatible.some(f=>/\.nif$/i.test(f.path)) || !compatible.some(f=>/\.(dds|tga)$/i.test(f.path)))){
    if(pack.id!=='gauntlets')throw new Error('Для этого мода нужны модели и соответствующие текстуры.');
  }
  await commitPack(id,{id,revision:Date.now(),files:assets});
  const next = {...removed}; delete next[id]; write(removedKey,next); delete removed[id];
}
export async function removeModResources(id){
  if(!MOD_PACKS.some(pack => pack.id === id))throw new Error('Неизвестная модификация.');
  // Disconnect built-in URLs without touching the owner's source files.
  await commitPack(id,null);
  const next = {...removed,[id]:true};
  write(removedKey,next); Object.assign(removed,next);
}
