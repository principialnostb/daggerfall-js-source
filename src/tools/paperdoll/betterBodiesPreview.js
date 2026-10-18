// Isolated, non-invasive preview of the Better Bodies female NIF.
// Uses the project's own NIF flattener and DDS decoder; it does not modify
// the live player renderer or the inventory PaperDoll.
import { betterBodiesFemaleAssetUrls } from '../../formats/morrowind/mwBetterBodies.js';
import { parseNif } from '../../formats/morrowind/mwNifFile.js';
import { flattenNif } from '../../formats/morrowind/mwNifMesh.js';
import { decodeDds } from '../../formats/morrowind/mwDdsFile.js';
import { buildSkeleton, skeletonSpaceMatrices, skinBatch, GRAPH_ROOT } from '../../formats/morrowind/mwSkin.js';

/* global THREE */
const canvas = document.getElementById('view');
const viewport = document.getElementById('viewport');
const status = document.getElementById('status');
const meshList = document.getElementById('meshList');
const uvInfo = document.getElementById('uvInfo');
const uvInputs = {
  u: document.getElementById('uvU'),
  v: document.getElementById('uvV'),
  su: document.getElementById('uvSU'),
  sv: document.getElementById('uvSV'),
};
const uvResetButton = document.getElementById('uvReset');
const uvExportButton = document.getElementById('uvExport');
const meshRecords = [];
let selectedMesh = null;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15151c);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x51443c, 1.5));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(4, 6, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0x9aaeff, 0.8);
fill.position.set(-5, 1, -4);
scene.add(fill);

const camera = new THREE.PerspectiveCamera(36, viewport.clientWidth / Math.max(1, viewport.clientHeight), 0.01, 10000);
let target = new THREE.Vector3(0, 0, 0);
let radius = 180;
let yaw = 0.55;
let pitch = 0.12;
let dragging = false;
let lastX = 0;
let lastY = 0;
const group = new THREE.Group();
scene.add(group);

function updateCamera() {
  pitch = Math.max(-1.25, Math.min(1.25, pitch));
  camera.position.set(
    target.x + radius * Math.cos(pitch) * Math.sin(yaw),
    target.y + radius * Math.sin(pitch),
    target.z + radius * Math.cos(pitch) * Math.cos(yaw),
  );
  camera.lookAt(target);
}
canvas.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lastX) * 0.008;
  pitch += (e.clientY - lastY) * 0.008;
  lastX = e.clientX; lastY = e.clientY;
  updateCamera();
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  radius = Math.max(2, Math.min(5000, radius * Math.exp(e.deltaY * 0.001)));
  updateCamera();
}, { passive: false });

function statusText(text) { status.textContent = text; }

function uvBounds(uvs) {
  if (!uvs || !uvs.length) return null;
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (let i = 0; i < uvs.length; i += 2) {
    minU = Math.min(minU, uvs[i]); maxU = Math.max(maxU, uvs[i]);
    minV = Math.min(minV, uvs[i + 1]); maxV = Math.max(maxV, uvs[i + 1]);
  }
  return { minU, minV, maxU, maxV };
}
function selectMesh(record) {
  selectedMesh = record;
  for (const item of meshRecords) {
    item.mesh.material.color.set(item === record ? 0xffa34d : 0xffffff);
  }
  for (const button of meshList.querySelectorAll('button')) {
    button.classList.toggle('active', Number(button.dataset.meshIndex) === record.index);
  }
  for (const input of Object.values(uvInputs)) input.disabled = false;
  uvResetButton.disabled = false;
  uvExportButton.disabled = false;
  uvInputs.u.value = record.transform.u;
  uvInputs.v.value = record.transform.v;
  uvInputs.su.value = record.transform.su;
  uvInputs.sv.value = record.transform.sv;
  const b = record.bounds;
  uvInfo.textContent = 'Mesh #' + record.index + ': ' + record.name +
    '\\nVertices: ' + record.vertexCount + ' · triangles: ' + record.triangleCount +
    '\\nUV min: (' + b.minU.toFixed(5) + ', ' + b.minV.toFixed(5) + ')' +
    '\\nUV max: (' + b.maxU.toFixed(5) + ', ' + b.maxV.toFixed(5) + ')' +
    '\\nOffset: (' + record.transform.u + ', ' + record.transform.v + ')' +
    '\\nScale: (' + record.transform.su + ', ' + record.transform.sv + ')';
}
function applyUvTransform(record) {
  const attr = record.mesh.geometry.getAttribute('uv');
  if (!attr) return;
  const { u, v, su, sv } = record.transform;
  for (let i = 0; i < record.baseUvs.length; i += 2) {
    attr.setXY(i / 2, record.baseUvs[i] * su + u, record.baseUvs[i + 1] * sv + v);
  }
  attr.needsUpdate = true;
  if (selectedMesh === record) selectMesh(record);
}
for (const [key, input] of Object.entries(uvInputs)) {
  input.addEventListener('input', () => {
    if (!selectedMesh) return;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    selectedMesh.transform[key] = value;
    applyUvTransform(selectedMesh);
  });
}
uvResetButton.addEventListener('click', () => {
  if (!selectedMesh) return;
  selectedMesh.transform = { u: 0, v: 0, su: 1, sv: 1 };
  applyUvTransform(selectedMesh);
});
uvExportButton.addEventListener('click', () => {
  const payload = {
    format: 'better-bodies-nif-uv-edits-v1',
    source: 'Morrowind Textures/Better Bodies/Nude/Data Files/Meshes/bb/bb_skinf_no.nif',
    note: 'UV transform is applied per flattened NIF mesh section as uv=(baseUV*scale)+offset. Preview changes only; integrate into NIF mesh pipeline to persist in game.',
    edits: meshRecords.filter(record => record.transform.u !== 0 || record.transform.v !== 0 || record.transform.su !== 1 || record.transform.sv !== 1).map(record => ({
      meshIndex: record.index,
      name: record.name,
      vertexCount: record.vertexCount,
      triangleCount: record.triangleCount,
      baseUvBounds: record.bounds,
      transform: { ...record.transform },
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'bb_skinf_no-uv-edits.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function load() {
  try {
    const [nifResponse, ddsResponse] = await Promise.all([
      fetch(betterBodiesFemaleAssetUrls.model),
      fetch(betterBodiesFemaleAssetUrls.texture),
    ]);
    if (!nifResponse.ok) throw new Error('NIF fetch failed: HTTP ' + nifResponse.status);
    if (!ddsResponse.ok) throw new Error('DDS fetch failed: HTTP ' + ddsResponse.status);

    const nifBytes = new Uint8Array(await nifResponse.arrayBuffer());
    const ddsBytes = new Uint8Array(await ddsResponse.arrayBuffer());
    const nif = parseNif(nifBytes);
    const batches = flattenNif(nif);
    const skeleton = buildSkeleton(nif);
    // Use the NIF's rest pose with the project's CPU skinning reference.
    const pose = new Map([...skeleton.nodes].map(([ref, node]) => [ref, node.rest]));
    const skelMats = skeletonSpaceMatrices(skeleton, pose, GRAPH_ROOT);
    const decoded = decodeDds(ddsBytes, { levels: 1 });
    const mip = decoded.mips[0];
    const imageData = new ImageData(new Uint8ClampedArray(mip.rgba), mip.width, mip.height);
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = mip.width;
    textureCanvas.height = mip.height;
    textureCanvas.getContext('2d').putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.flipY = true;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    meshList.textContent = '';
    let drawable = 0;
    let vertexCount = 0;
    let triangleCount = 0;
    let skinnedCount = 0;
    for (const batch of batches) {
      if (!batch.positions?.length || !batch.indices?.length) continue;
      let positions = batch.positions;
      let normals = batch.normals;
      if (batch.skinned && batch.skin) {
        positions = new Float32Array(batch.positions.length);
        normals = new Float32Array(batch.normals?.length ?? batch.positions.length);
        skinBatch(batch, skeleton, pose, skelMats, positions, normals);
        skinnedCount++;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      if (normals?.length === positions.length) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
      } else {
        geometry.computeVertexNormals();
      }
      if (batch.uvs?.length === positions.length / 3 * 2) {
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(batch.uvs), 2));
      }
      geometry.setIndex(Array.from(batch.indices));
      geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({
        map: batch.material?.textureFile ? texture : null,
        color: 0xffffff,
        roughness: 0.82,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = batch.name || 'NIF shape ' + drawable;
      group.add(mesh);
      const record = {
        index: drawable,
        name: mesh.name,
        mesh,
        baseUvs: batch.uvs ? new Float32Array(batch.uvs) : null,
        bounds: uvBounds(batch.uvs),
        vertexCount: positions.length / 3,
        triangleCount: batch.indices.length / 3,
        transform: { u: 0, v: 0, su: 1, sv: 1 },
      };
      if (record.baseUvs && record.bounds) {
        meshRecords.push(record);
        const option = document.createElement('button');
        option.className = 'mesh-option';
        option.dataset.meshIndex = String(record.index);
        option.innerHTML = '';
        const title = document.createElement('span');
        title.textContent = '#' + record.index + ' — ' + record.name;
        const detail = document.createElement('small');
        detail.textContent = record.vertexCount + ' verts · ' + record.triangleCount + ' tris · UV ' +
          record.bounds.minU.toFixed(2) + ',' + record.bounds.minV.toFixed(2) + ' → ' +
          record.bounds.maxU.toFixed(2) + ',' + record.bounds.maxV.toFixed(2);
        option.append(title, detail);
        option.addEventListener('click', () => selectMesh(record));
        meshList.appendChild(option);
      }
      drawable++;
      vertexCount += positions.length / 3;
      triangleCount += batch.indices.length / 3;
    }

    // NetImmerse/Morrowind NIFs commonly author Z-up coordinates.
    group.rotation.x = -Math.PI / 2;
    const bounds = new THREE.Box3().setFromObject(group);
    if (bounds.isEmpty()) throw new Error('NIF parsed but produced no drawable meshes.');
    const center = bounds.getCenter(new THREE.Vector3());
    group.position.sub(center);
    target.set(0, 0, 0);
    const size = bounds.getSize(new THREE.Vector3());
    radius = Math.max(size.x, size.y, size.z) * 2.8;
    camera.near = Math.max(0.01, radius / 5000);
    camera.far = Math.max(1000, radius * 20);
    camera.updateProjectionMatrix();
    updateCamera();
    statusText(
      'Better Bodies female NIF — isolated preview\n' +
      'Meshes: ' + drawable + ' · skinned: ' + skinnedCount + ' · vertices: ' + vertexCount + ' · triangles: ' + triangleCount + '\n' +
      'Texture: ' + mip.width + ' × ' + mip.height + ' DDS → RGBA8\n' +
      'NIF rest pose with CPU skinning; live-game animation/skeleton not connected.'
    );
  } catch (error) {
    console.error('[Better Bodies preview]', error);
    statusText('Preview failed\n' + String(error?.stack || error));
  }
}

function render() {
  requestAnimationFrame(render);
  renderer.render(scene, camera);
}
window.addEventListener('resize', () => {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
});
updateCamera();
load();
render();
