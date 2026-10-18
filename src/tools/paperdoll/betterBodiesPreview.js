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
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
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

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.01, 10000);
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
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});
updateCamera();
load();
render();
