import { parseNif } from '../formats/morrowind/mwNifFile.js';
import { flattenNif } from '../formats/morrowind/mwNifMesh.js';

const classic = ['blue','grey','red','dark_brown','purple','light_brown','white','green'].map((p) => ({
  label: `Classic · ${p}`, model: `cloak_${p}.nif`, style: 'classic',
}));
const animated = [
  ['blue','simply_cape_blue_skins.nif'],
  ['grey','simply_cape_grey_skins.nif'],
  ['red','simply_cape_red_skins.nif'],
  ['dark brown','simply_cape_black_skins.nif'],
  ['purple','simply_cape_brwn_blue_skins.nif'],
  ['light brown','simply_cape_brown_skins.nif'],
  ['white','simply_cape_03_b_skins.nif'],
  ['green','simply_cape_green_skins.nif'],
].map(([label, model]) => ({ label: `Simply Animated · ${label}`, model, style: 'simply-animated' }));

const meshSelect = document.querySelector('#mesh');
const viewSelect = document.querySelector('#view');
const canvas = document.querySelector('#preview');
const ctx = canvas.getContext('2d');
const report = document.querySelector('#report');
const models = [...classic, ...animated];

for (const entry of models) {
  const option = document.createElement('option');
  option.value = entry.model;
  option.textContent = entry.label;
  meshSelect.append(option);
}
meshSelect.value = 'simply_cape_blue_skins.nif';

const fmt = (n) => Number.isFinite(n) ? n.toFixed(3) : 'n/a';
function project(p, view) {
  if (view === 'side') return [p[1], p[2]];
  if (view === 'top') return [p[0], p[1]];
  return [p[0], p[2]];
}
function render(batches, entry, byteLength) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const all = batches.filter((b) => b.positions?.length && b.indices?.length);
  if (!all.length) {
    report.textContent = `Model: ${entry.model}\nNIF bytes: ${byteLength}\nERROR: parser produced no drawable geometry.`;
    return;
  }
  let min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  let vertices = 0, triangles = 0, texture = '', skinned = false;
  const bones = new Set();
  for (const b of all) {
    vertices += b.positions.length / 3;
    triangles += b.indices.length / 3;
    texture ||= b.material?.textureFile ?? '';
    skinned ||= !!b.skinned;
    for (const bone of b.skin?.bones ?? []) bones.add(bone.name);
    for (let i=0;i<b.positions.length;i+=3) for(let k=0;k<3;k++) {
      min[k] = Math.min(min[k], b.positions[i+k]);
      max[k] = Math.max(max[k], b.positions[i+k]);
    }
  }
  const center = min.map((v,i)=>(v+max[i])/2);
  const dimensions = min.map((v,i)=>max[i]-v);
  const view = viewSelect.value;
  const projected = [];
  for (const b of all) {
    const pts = new Array(b.positions.length/3);
    for(let i=0;i<b.positions.length;i+=3) {
      const p = project([b.positions[i]-center[0],b.positions[i+1]-center[1],b.positions[i+2]-center[2]],view);
      pts[i/3]=p;
    }
    projected.push({b,pts});
  }
  let loX=Infinity,loY=Infinity,hiX=-Infinity,hiY=-Infinity;
  for(const item of projected) for(const p of item.pts) {
    loX=Math.min(loX,p[0]); hiX=Math.max(hiX,p[0]);
    loY=Math.min(loY,p[1]); hiY=Math.max(hiY,p[1]);
  }
  const spanX=Math.max(hiX-loX,1e-5), spanY=Math.max(hiY-loY,1e-5);
  const scale=Math.min((canvas.width-90)/spanX,(canvas.height-90)/spanY);
  const px=(x)=>canvas.width/2+x*scale;
  const py=(y)=>canvas.height/2-y*scale;
  ctx.strokeStyle='#9eb4c5';
  ctx.lineWidth=0.7;
  ctx.beginPath();
  for(const {b,pts} of projected) {
    for(let i=0;i+2<b.indices.length;i+=3) {
      const a=pts[b.indices[i]], c=pts[b.indices[i+1]], d=pts[b.indices[i+2]];
      if(!a||!c||!d) continue;
      ctx.moveTo(px(a[0]),py(a[1])); ctx.lineTo(px(c[0]),py(c[1]));
      ctx.lineTo(px(d[0]),py(d[1])); ctx.lineTo(px(a[0]),py(a[1]));
    }
  }
  ctx.stroke();
  ctx.fillStyle='#d4b66c';
  ctx.font='14px system-ui';
  ctx.fillText(`${entry.label} · ${view} projection · scale ${fmt(scale)} px/unit`,16,24);
  ctx.fillStyle='#7e8c98';
  ctx.fillText('Center of bounds translated to canvas center; wireframe is geometry-only, not a game-render screenshot.',16,canvas.height-16);
  report.textContent = [
    `Model: ${entry.model}`,
    `Style: ${entry.style}`,
    `NIF bytes: ${byteLength}`,
    `Drawable batches: ${all.length}`,
    `Vertices: ${vertices} | triangles: ${triangles}`,
    `Skinned: ${skinned}`,
    `Skin bones: ${[...bones].join(', ') || '(none found in parsed skin data)'}`,
    `Texture path in NIF: ${texture || '(none)'}`,
    `Bounds min: [${min.map(fmt).join(', ')}]`,
    `Bounds max: [${max.map(fmt).join(', ')}]`,
    `Dimensions: [${dimensions.map(fmt).join(', ')}]`,
    `Bounds center: [${center.map(fmt).join(', ')}]`,
    '',
    'Interpretation: compare classic and animated meshes in all three projections. This viewer recenters geometry for inspection, so it diagnoses shape/scale but does not validate its in-game attachment offset.',
  ].join('\n');
}
async function load() {
  const entry = models.find((m) => m.model === meshSelect.value);
  if (!entry) return;
  report.textContent = `Loading ${entry.model}…`;
  try {
    const url = new URL(`../assets/mw/meshes/${entry.model}`, import.meta.url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.pathname}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const batches = flattenNif(parseNif(bytes));
    render(batches, entry, bytes.byteLength);
  } catch (error) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    report.textContent = `Failed to load ${entry.model}: ${error?.stack ?? error}`;
  }
}
meshSelect.addEventListener('change', load);
viewSelect.addEventListener('change', load);
document.querySelector('#reload').addEventListener('click', load);
load();