#!/usr/bin/env python3
"""Profile and heuristically analyze a large cloak/body capture JSON.
Usage: python3 analyze_cloak_capture.py mw-cloak-capture.json [--out cloak-analysis-report.json]
Proximity is a screening heuristic, NOT proof of triangle intersection.
"""
import argparse, collections, json, math, os, sys

def typ(v):
    if isinstance(v,dict): return "object"
    if isinstance(v,list): return "array"
    if v is None: return "null"
    if isinstance(v,bool): return "boolean"
    if isinstance(v,(int,float)): return "number"
    return "string"

def profile(v,path="$",depth=0,out=None):
    if out is None: out={"keys":collections.Counter(),"lengths":collections.Counter(),"paths":[]}
    if len(out["paths"])<500: out["paths"].append({"path":path,"type":typ(v)})
    if isinstance(v,dict):
        for k,x in v.items():
            out["keys"][str(k)]+=1
            if depth<7: profile(x,path+"."+str(k),depth+1,out)
    elif isinstance(v,list):
        out["lengths"][len(v)]+=1
        for i,x in enumerate(v[:3]):
            if depth<7: profile(x,path+f"[{i}]",depth+1,out)
    return out

def point(v):
    if isinstance(v,dict):
        d={str(k).lower():x for k,x in v.items()}
        for ks in (("x","y","z"),("0","1","2")):
            if all(k in d for k in ks):
                a=[d[k] for k in ks]
                if all(isinstance(x,(int,float)) and math.isfinite(x) for x in a): return tuple(map(float,a))
        for k in ("position","pos","coords","coordinate","translation"):
            if k in d:
                p=point(d[k])
                if p is not None:return p
    if isinstance(v,(list,tuple)) and len(v)>=3 and all(isinstance(x,(int,float)) and math.isfinite(x) for x in v[:3]):
        return tuple(map(float,v[:3]))
    return None

GEOM_KEYS={"vertices","positions","points","worldvertices","world_vertices","skinnedvertices","skinned_vertices","bodyvertices","cloakvertices","vertexpositions","vertex_positions"}
def clouds(v,path="$",frame=None,out=None):
    if out is None:out=[]
    if isinstance(v,dict):
        nf=frame
        for k,x in v.items():
            lk=str(k).lower()
            childframe=str(x) if lk in {"frame","frameindex","frame_index","sample","sampleindex","sample_index"} and isinstance(x,(int,float,str)) else nf
            if isinstance(x,list) and lk in GEOM_KEYS:
                pts=[point(q) for q in x];pts=[q for q in pts if q is not None]
                if pts:out.append({"path":path+"."+str(k),"label":(path+"."+str(k)).lower(),"frame":childframe,"points":pts})
                else: clouds(x,path+"."+str(k),childframe,out)
            else:clouds(x,path+"."+str(k),childframe,out)
    elif isinstance(v,list):
        for i,x in enumerate(v):clouds(x,path+f"[{i}]",frame,out)
    return out

def distances(a,b):
    try:
        import numpy as np
    except ImportError:return {"unavailable":"Install numpy; scipy is recommended for speed."}
    aa=np.asarray(a,dtype=float);bb=np.asarray(b,dtype=float)
    if not len(aa) or not len(bb):return None
    try:
        from scipy.spatial import cKDTree
        d,ix=cKDTree(bb).query(aa,k=1)
        method="scipy.cKDTree"
    except ImportError:
        ds=[]; ixall=[]; chunk=max(1,min(256,1000000//max(1,len(bb))))
        for s in range(0,len(aa),chunk):
            delta=aa[s:s+chunk,None,:]-bb[None,:,:]
            mat=np.sqrt(np.sum(delta*delta,axis=2));ii=mat.argmin(axis=1)
            ds.extend(mat[np.arange(len(ii)),ii].tolist());ixall.extend(ii.tolist())
        d=np.asarray(ds);ix=np.asarray(ixall);method="numpy chunked exact"
    j=int(np.argmin(d))
    return {"min":float(np.min(d)),"p01":float(np.percentile(d,1)),"median":float(np.median(d)),
            "p95":float(np.percentile(d,95)),"max":float(np.max(d)),
            "closest_cloak_point":aa[j].tolist(),"closest_body_point":bb[int(ix[j])].tolist(),"method":method}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("capture");p.add_argument("--out",default="cloak-analysis-report.json")
    p.add_argument("--near",type=float,default=0.02,help="candidate proximity threshold in world units")
    a=p.parse_args();size=os.path.getsize(a.capture)
    print(f"Loading {a.capture} ({size:,} bytes)",file=sys.stderr)
    with open(a.capture,encoding="utf-8") as f:data=json.load(f)
    prof=profile(data);cs=clouds(data)
    clo=[c for c in cs if "cloak" in c["label"]]
    bod=[c for c in cs if any(k in c["label"] for k in ("body","skin","torso"))]
    comparisons=[];seen=set()
    for c in clo:
      for b in bod:
        if c["frame"] is not None and b["frame"] is not None and c["frame"]!=b["frame"]:continue
        if c["frame"] is None and b["frame"] is None and not(len(clo)==len(bod)==1):continue
        key=(c["path"],b["path"],c["frame"],b["frame"])
        if key in seen:continue
        seen.add(key);d=distances(c["points"],b["points"])
        if d and "min" in d:d["below_threshold_candidate"]=d["min"]<=a.near
        comparisons.append({"cloak_path":c["path"],"body_path":b["path"],"frame":c["frame"] or b["frame"],
                            "cloak_points":len(c["points"]),"body_points":len(b["points"]),"distances":d})
        if len(comparisons)>=500:break
      if len(comparisons)>=500:break
    report={"input":os.path.basename(a.capture),"size_bytes":size,"root_type":typ(data),
      "root_keys":list(data) if isinstance(data,dict) else None,
      "frame_count":len(data.get("frames",[])) if isinstance(data,dict) and isinstance(data.get("frames"),list) else None,
      "schema":{"keys_by_frequency":prof["keys"].most_common(100),"array_lengths":prof["lengths"].most_common(40),"sample_paths":prof["paths"]},
      "geometry":{"cloud_candidates":len(cs),"cloak_clouds":[{"path":c["path"],"frame":c["frame"],"points":len(c["points"])} for c in clo[:300]],
        "body_clouds":[{"path":c["path"],"frame":c["frame"],"points":len(c["points"])} for c in bod[:300]],
        "threshold_world_units":a.near,"comparisons":comparisons,
        "warning":"Vertex-to-vertex proximity does not prove surface penetration. Confirm with vertex-to-triangle distance and signed/interior tests."}}
    with open(a.out,"w",encoding="utf-8") as f:json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps({"size_bytes":size,"root_keys":report["root_keys"],"frame_count":report["frame_count"],
      "cloud_candidates":len(cs),"cloak_clouds":len(clo),"body_clouds":len(bod),"comparisons":len(comparisons),"report":a.out},ensure_ascii=False,indent=2))
if __name__=="__main__":main()
