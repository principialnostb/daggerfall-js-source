// Original DFO torch geometry. DFU DaggerfallBillboard.Update faces the camera;
// these fixtures remain solid from every viewing direction.
import { MeshBench, box, prism } from './ships/galleonMesh.js';
export const TORCH_ARCHIVE = 38342;
export const torchKind = (archive, record) => archive === 190 && record === 3 ? 'pole'
  : archive === 210 ? ({6:'pole',16:'wood',17:'iron',18:'cage',20:'poleIron'}[record] ?? null) : null;
export const isWallTorch = (kind) => kind === 'wood' || kind === 'iron' || kind === 'cage';

// Local +Z points into the room. The depth scale reaches the shaft's collar.
export function buildTorchBracket() {
  const bench = new MeshBench(TORCH_ARCHIVE);
  box(bench, 3, [0, -.035, .04], [.058, .105, .05]);
  for (const y of [-.109, .039]) {
    prism(bench, 3, [0, y, .08], [0, y, .15], .015, .012, 6);
  }
  box(bench, 3, [0, 0, .54], [.023, .018, .49]);
  prism(bench, 3, [0, -.109, .11], [0, -.014, .86], .014, .017, 6);
  return finishTorchMesh(bench);
}

export function buildTorchBody(kind) {
  const b = new MeshBench(TORCH_ARCHIVE);
  const pole = kind === 'pole' || kind === 'poleIron';
  const foot = pole ? .03 : .12, head = .70;
  prism(b, kind === 'wood' || kind === 'pole' ? 1 : 3, [0,foot,0], [0,head,0], .025, .035, 8);
  if (pole) {
    prism(b,3,[0,0,0],[0,.025,0],.10,.09,8);
    prism(b,3,[0,.025,0],[0,.08,0],.065,.03,8);
  }
  prism(b,3,[0,.65,0],[0,.69,0],.047,.052,10);
  prism(b,3,[0,.70,0],[0,.78,0],.055,.080,10);
  prism(b,4,[0,.775,0],[0,.81,0],.068,.06,9);
  for (let i=0;i<3;i++) {
    const y=.30+i*.14;
    prism(b,3,[0,y,0],[0,y+.025,0],.032,.032,8);
  }
  if (kind === 'cage' || kind === 'poleIron') for(let i=0;i<5;i++) {
    const a=i*Math.PI*2/5,x=Math.cos(a),z=Math.sin(a);
    prism(b,3,[x*.052,.69,z*.052],[x*.085,.88,z*.085],.009,.006,5);
  }
  return finishTorchMesh(b);
}

export function finishTorchMesh(bench) {
  const m = bench.finish();
  m.subMeshes=m.subMeshes.map((s,i)=>({...s,textureArchive:TORCH_ARCHIVE,textureRecord:m.slots[i].record}));
  return m;
}
