// A camp has a footprint, not just one downward ray. No world/save state is added.
export const CAMP_GROUND_RADIUS = .48;
export const CAMP_GROUND_STEP = .36;

export function sampleCampGround(probe,pos,yaw=0){
  if(!probe)return null;
  const heights=[],r=CAMP_GROUND_RADIUS,cs=Math.cos(yaw),sn=Math.sin(yaw);
  for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++){
    const wx=pos[0]+cs*x*r+sn*z*r,wz=pos[2]-sn*x*r+cs*z*r;
    const d=probe([wx,pos[1]+.65,wz],[0,-1,0],1.3);
    if(!Number.isFinite(d)||d<0||d>1.3)return null;
    heights.push(pos[1]+.65-d);
  }
  if(Math.max(...heights)-Math.min(...heights)>CAMP_GROUND_STEP)return null;
  return heights;
}

export function campGroundOffset(heights,x,z,base){
  const gx=Math.max(0,Math.min(2,x/CAMP_GROUND_RADIUS+1));
  const gz=Math.max(0,Math.min(2,z/CAMP_GROUND_RADIUS+1));
  const ix=Math.min(1,Math.floor(gx)),iz=Math.min(1,Math.floor(gz)),u=gx-ix,v=gz-iz;
  const h=(a,b)=>heights[b*3+a];
  return ((1-u)*h(ix,iz)+u*h(ix+1,iz))*(1-v)+((1-u)*h(ix,iz+1)+u*h(ix+1,iz+1))*v-base;
}

export function conformCampBody(model,heights,base){
  const positions=model.positions.slice();
  for(let i=0;i<positions.length;i+=3)positions[i+1]+=campGroundOffset(heights,positions[i],positions[i+2],base);
  // Exposed normals are recalculated for the deformed triangles, preserving flat stone faces.
  const normals=model.normals.slice();
  for(let k=0;k<model.indices.length;k+=3){
    const a=model.indices[k]*3,b=model.indices[k+1]*3,c=model.indices[k+2]*3;
    const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
    const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
    const n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx],l=Math.hypot(...n)||1;
    for(const i of [a,b,c])for(let j=0;j<3;j++)normals[i+j]=n[j]/l;
  }
  return {...model,positions,normals};
}

export function campFootprintProbe(probe){
  if(!probe)return null;
  return (origin,dir,limit)=>{
    const d=probe(origin,dir,limit);
    if(!Number.isFinite(d)||d<0||d>limit)return d;
    const pos=origin.map((v,i)=>v+dir[i]*d);
    return sampleCampGround(probe,pos)?d:Infinity;
  };
}
