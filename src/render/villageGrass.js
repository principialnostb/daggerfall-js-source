// Interleaved UV, part, object-space position and face normal; +Y is up.
// The legacy faces serve meadow plants across the settlement boundary.
export const VILLAGE_SLOTS = 32;
export const TUFT_BLADES = 12;

function triangleWriter(vertices) {
  return function triangle(part, a, b, c) {
    const ab = b.map((v,i) => v-a[i]), ac = c.map((v,i) => v-a[i]);
    const cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
    const length = Math.hypot(...cross);
    const normal = cross.map(v => v/length);
    for (const p of [a,b,c]) vertices.push(p[3] ?? .5, p[4] ?? Math.min(.98,.03+p[1]), part, ...p.slice(0,3), ...normal);
  };
}

export function tuftMesh() {
  const vertices = [], triangle = triangleWriter(vertices);
  for (let panel=0; panel<3; panel++) {
    const tag = panel/3 + panel%2;
    for (const [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]) {
      vertices.push(u,v,tag,0,0,0,0,1,0);
    }
  }
  const cardCount = vertices.length / 9;
  let farCount, middleCount;
  for (let i=0; i<TUFT_BLADES; i++) {
    const angle = i*2.39996 + .14*Math.sin(i*5);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const inner = i===0 ? 1 : (i*7%11)/11;
    const height = .52+.38*inner;
    const reach = .18+.30*(1-inner);
    const foot = .045+.095*(1-inner);
    const width = .018+.020*(1-inner);
    function point(radius, side, y, u=.5) { return [cos*radius-sin*side, y, sin*radius+cos*side,u]; }
    // Two triangular cross-sections give each leaf a keel, a back and a curved tip.
    function ring(radius, side, y, w) {
      return [point(radius,side-w,y,.04), point(radius+w*.84,side,y+.012,.49), point(radius,side+w,y,.96)];
    }
    const root = point(foot,0,0);
    const lower = ring(foot+.12*reach,0,height*.32,width);
    const upper = ring(foot+.53*reach,.24*width,height*(.74+.08*(1-inner)),width*.62);
    const tip = point(foot+reach,width*(1.4+inner),height*(.79+.21*inner));
    for (let j=0; j<3; j++) {
      const k=(j+1)%3;
      triangle(8,root,lower[j],lower[k]);
      triangle(8,lower[j],upper[j],upper[k]);
      triangle(8,lower[j],upper[k],lower[k]);
      triangle(8,upper[j],tip,upper[k]);
    }
    if (i<2) {
      const rim = Array.from({length:5},(_,j) => {
        const x=Math.cos(j*2*Math.PI/5), z=Math.sin(j*2*Math.PI/5);
        return [tip[0]+.031*x,tip[1]+.018,tip[2]+.031*z,.5+.46*x,.5+.46*z];
      });
      const base = [...tip,.50];
      const cap = [tip[0],tip[1]+.043,tip[2],.5,.5];
      for (let j=0;j<5;j++) {
        const k=(j+1)%5;
        triangle(9,base,rim[j],rim[k]);
        triangle(9,cap,rim[k],rim[j]);
      }
    }
    if (i===2) farCount = vertices.length/9;
    if (i===5) middleCount = vertices.length/9;
  }
  return {vertices:Float32Array.from(vertices),cardCount,farCount,middleCount};
}
