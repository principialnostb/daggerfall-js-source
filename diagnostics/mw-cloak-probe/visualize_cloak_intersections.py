#!/usr/bin/env python3
"""Create a standalone 3-view HTML visualization of reported cloak/body intersections."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

def read(path):
    with Path(path).open(encoding="utf-8") as f:
        return json.load(f)

def find_mesh(frame, group, slot):
    entries = frame.get(group, [])
    for mesh in entries if isinstance(entries, list) else []:
        if isinstance(mesh, dict) and mesh.get("slot", "") == slot:
            return mesh
    return None

def payload(mesh, hit_ids):
    pos, idx = mesh.get("positions", []), mesh.get("indices", [])
    if not isinstance(pos, list) or len(pos) % 3:
        raise ValueError("Malformed positions in " + str(mesh.get("slot")))
    if not isinstance(idx, list) or len(idx) % 3:
        raise ValueError("Malformed triangle indices in " + str(mesh.get("slot")))
    n = len(pos) // 3
    if any(not isinstance(i, int) or isinstance(i, bool) or i < 0 or i >= n for i in idx):
        raise ValueError("Invalid vertex index in " + str(mesh.get("slot")))
    tris = [idx[i:i+3] for i in range(0, len(idx), 3)]
    return {"slot":mesh.get("slot",""),"positions":pos,"triangles":tris,
            "highlight":sorted(set(i for i in hit_ids if 0 <= i < len(tris)))}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("capture",nargs="?",default="diagnostics/mw-cloak-probe/mw-cloak-capture.json")
    p.add_argument("--report",default=None)
    p.add_argument("--out",default=None)
    p.add_argument("--frames",default="117,203,272,317",help="comma-separated frame indices, or all")
    a=p.parse_args()
    cap=Path(a.capture); rep=Path(a.report) if a.report else cap.with_name("cloak-triangle-intersections.json")
    out=Path(a.out) if a.out else cap.with_name("cloak-intersection-viewer.html")
    if not cap.is_file(): p.error("Capture not found: "+str(cap))
    if not rep.is_file(): p.error("Report not found; run npm run mwcloak:intersections first")
    capture, report=read(cap),read(rep); frames=capture.get("frames")
    if not isinstance(frames,list) or not frames: p.error("Capture has no frames")
    rows=report.get("intersections",[])
    try:
        wanted=sorted({int(r["frame"]) for r in rows}) if a.frames.strip().lower()=="all" else sorted({int(x.strip()) for x in a.frames.split(",") if x.strip()})
    except ValueError: p.error("--frames must be 'all' or comma-separated integers")
    data=[]
    for fi in wanted:
        if fi<0 or fi>=len(frames): print("Skipping out-of-range frame",fi,file=sys.stderr); continue
        for row in (r for r in rows if r.get("frame")==fi):
            c=find_mesh(frames[fi],"cloak",row.get("cloak_slot",""))
            b=find_mesh(frames[fi],"legs",row.get("body_slot",""))
            if c is None or b is None: print("Cannot match meshes in frame",fi,file=sys.stderr); continue
            pairs=row.get("example_triangle_index_pairs_first_100",[])
            data.append({"frame":fi,"time":frames[fi].get("time"),"hitPairs":row.get("intersecting_triangle_pairs",0),
                "cloak":payload(c,[x[0] for x in pairs if isinstance(x,list) and len(x)==2]),
                "body":payload(b,[x[1] for x in pairs if isinstance(x,list) and len(x)==2])})
    if not data: p.error("No matching intersection frames found; capture and report must match")
    embedded=json.dumps(data,separators=(",",":"),allow_nan=False).replace("</","<\\/")
    page=r"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cloak intersection viewer</title><style>
body{font:14px system-ui;margin:18px;max-width:1500px}header{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
select,button{font:inherit;padding:6px}.views{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
section{border:1px solid #aaa;border-radius:8px;padding:8px}canvas{width:100%;height:400px;display:block;background:#8881}
.note{max-width:1000px;color:#555}@media(max-width:850px){.views{grid-template-columns:1fr}canvas{height:320px}}
</style><h1>Cloak / leg triangle-intersection viewer</h1>
<header><label>Frame <select id="frame"></select></label><button id="reset">Reset view</button></header>
<p class="note">Three orthographic projections of captured geometry. Drag to pan; mouse wheel to zoom. This is not the game's camera or material renderer. Highlighted triangles are examples stored by the report (up to 100 pairs); the total hit count is shown separately.</p>
<p id="info"></p><p>Legend: <span style="color:#3679c9">blue = cloak</span>; <span style="color:#d58b24">orange = leg/trousers</span>; <span style="color:#d22">red = cloak triangles in hit pairs</span>; <span style="color:#a4c">purple = body triangles in hit pairs</span>.</p>
<div class="views"><section><b>XY</b><canvas data-view="xy"></canvas></section><section><b>XZ</b><canvas data-view="xz"></canvas></section><section><b>YZ</b><canvas data-view="yz"></canvas></section></div>
<script>
const D=__DATA__, sel=document.querySelector('#frame'), info=document.querySelector('#info'), canv=[...document.querySelectorAll('canvas')];
D.forEach((d,i)=>{let o=document.createElement('option');o.value=i;o.textContent='Frame '+d.frame+' — '+d.hitPairs+' hit pairs';sel.append(o)});
let cur=0, zoom=1, panX=0, panY=0;
function proj(p,v){return v==='xy'?[p[0],p[1]]:v==='xz'?[p[0],p[2]]:[p[1],p[2]]}
function draw(c){let d=D[cur],v=c.dataset.view,ctx=c.getContext('2d'),r=c.getBoundingClientRect(),ratio=devicePixelRatio||1;
c.width=Math.max(1,r.width*ratio);c.height=Math.max(1,r.height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
let w=r.width,h=r.height,all=[];[d.cloak,d.body].forEach(m=>{for(let i=0;i<m.positions.length;i+=3)all.push(proj(m.positions.slice(i,i+3),v))});
if(!all.length)return;let xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),mx=(Math.min(...xs)+Math.max(...xs))/2,my=(Math.min(...ys)+Math.max(...ys))/2;
let scale=Math.min((w-24)/Math.max(1e-6,Math.max(...xs)-Math.min(...xs)),(h-24)/Math.max(1e-6,Math.max(...ys)-Math.min(...ys)))*zoom;
let xy=p=>{p=proj(p,v);return [w/2+(p[0]-mx)*scale+panX,h/2-(p[1]-my)*scale+panY]};ctx.clearRect(0,0,w,h);
function mesh(m,base,hot){ctx.lineWidth=.6;ctx.strokeStyle=base;ctx.globalAlpha=.3;
m.triangles.forEach(t=>{ctx.beginPath();t.forEach((n,j)=>{let p=xy(m.positions.slice(n*3,n*3+3));j?ctx.lineTo(...p):ctx.moveTo(...p)});ctx.closePath();ctx.stroke()});
ctx.globalAlpha=.82;ctx.fillStyle=hot;ctx.strokeStyle=hot;ctx.lineWidth=1;
m.highlight.forEach(i=>{let t=m.triangles[i];if(!t)return;ctx.beginPath();t.forEach((n,j)=>{let p=xy(m.positions.slice(n*3,n*3+3));j?ctx.lineTo(...p):ctx.moveTo(...p)});ctx.closePath();ctx.fill();ctx.stroke()});ctx.globalAlpha=1}
mesh(d.cloak,'#3679c9','#d22');mesh(d.body,'#d58b24','#a4c')}
function render(){let d=D[cur];info.textContent='Frame '+d.frame+' | time='+d.time+' | total intersecting triangle pairs='+d.hitPairs+'. Red/purple highlights use the report’s stored example triangle pairs. Projected overlap alone is not proof of 3D intersection.';canv.forEach(draw)}
sel.onchange=()=>{cur=+sel.value;zoom=1;panX=panY=0;render()};document.querySelector('#reset').onclick=()=>{zoom=1;panX=panY=0;render()};
canv.forEach(c=>{let drag=null;c.onpointerdown=e=>{drag=[e.clientX,e.clientY,panX,panY];c.setPointerCapture(e.pointerId)};c.onpointermove=e=>{if(drag){panX=drag[2]+e.clientX-drag[0];panY=drag[3]+e.clientY-drag[1];render()}};c.onpointerup=c.onpointercancel=()=>drag=null;c.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.1,Math.min(40,zoom*Math.exp(-e.deltaY*.001)));render()},{passive:false})});
window.onresize=render;render();
</script></html>"""
    out.parent.mkdir(parents=True,exist_ok=True); out.write_text(page.replace("__DATA__",embedded),encoding="utf-8")
    print(json.dumps({"viewer":str(out),"frames":[x["frame"] for x in data],"bytes":out.stat().st_size},indent=2))
if __name__=="__main__": main()
