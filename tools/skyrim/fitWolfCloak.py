"""Surface fitting of the generated upper cloak against runtime-posed body/iron meshes.
All calculations happen in cloak bind space obtained by inverting the measured chest skin affine.
"""
import json, math, bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree


def fit_upper_cloak(shapes, cage_file, report_file):
    cage = json.load(open(cage_file, encoding='utf-8'))
    inverse = Matrix(cage['matrix']).inverted()
    def make_tree(helmet=False):
        points, triangles = [], []
        for s in cage['surfaces']:
            if ('helm' in s['name']) != helmet:
                continue
            pos, normals, idx = s['positions'], s['normals'], s['indices']
            offset = len(points)
            transformed = [inverse @ Vector(pos[i:i+3]) for i in range(0, len(pos), 3)]
            points.extend(transformed)
            for i in range(0, len(idx), 3):
                a, b, c = idx[i:i+3]
                if normals:
                    n = inverse.to_3x3() @ sum((Vector(normals[j*3:j*3+3]) for j in (a,b,c)), Vector())
                    geometric = (transformed[b]-transformed[a]).cross(transformed[c]-transformed[a])
                    if geometric.dot(n) < 0:
                        b,c = c,b
                triangles.append((a+offset,b+offset,c+offset))
        return BVHTree.FromPolygons(points, triangles, all_triangles=True)
    body, helmet = make_tree(), make_tree(True)
    def weight(z):
        t = min(1, max(0, (z-88)/23))
        return t*t*(3-2*t)
    def nearest(p):
        hit, normal, _, distance = body.find_nearest(Vector(p))
        return hit, normal.normalized(), distance
    def stats(points):
        gaps, signed, helmet_gaps = [], [], []
        for p in points:
            q,n,d = nearest(p); gaps.append(d); signed.append((Vector(p)-q).dot(n))
            helmet_gaps.append(helmet.find_nearest(Vector(p))[3])
        gaps.sort()
        return dict(samples=len(gaps), median=round(gaps[len(gaps)//2],3), p90=round(gaps[int(.9*(len(gaps)-1))],3),
                    max=round(max(gaps),3), surface_under_02=sum(d < -.2 for d in signed), min_helmet_gap=round(min(helmet_gaps),3))
    def back_shift(p):
        # Shared displacement cage for the panel and its overlying fur, so
        # neighbouring courses cannot separate when the shoulder fit pulls in.
        half_width=12.5+10.5*max(0,min(1,(p.z-28)/84))
        ref_y=-17.5-2.3*(1-min(1,abs(p.x)/half_width)**2)-1.6*max(0,(90-p.z)/70)
        reference=Vector((p.x,ref_y,p.z))
        q,n,_=nearest(reference)
        close=q+n*1.0-reference
        anchor=Vector((max(-16,min(16,p.x)),-20,100))
        aq,an,_=nearest(anchor)
        hang=(aq+an*1.0-anchor).y
        w=weight(p.z)
        return Vector((close.x*w, close.y*w+hang*(1-w), close.z*w))
    report = dict(method='runtime-pose BVH cage; smooth upper fit; per-lock root anchoring; signed clearance correction', shapes={})
    for shape in shapes:
        old = [Vector(p) for p in shape['positions']]
        result = [p.copy() for p in old]
        active = [i for i,p in enumerate(old) if p.z > 100]
        before = stats([old[i] for i in active]) if active else None
        root_before, root_after, root_indices = [], [], []
        if shape['name'] in ('Wolf_Back_Panel','Wolf_Back_Locks'):
            for i,p in enumerate(old):
                result[i]=p+back_shift(p)
        elif shape['name']=='Wolf_Upper_Drape':
            for i,p in enumerate(old):
                if weight(p.z) == 0:
                    continue
                q,n,d = nearest(p)
                result[i] = p.lerp(q+n*1.0, weight(p.z))
        else:
            # Every procedural lock has 7 rows of 5 vertices. Keep its volume;
            # anchor the root to the cage instead of flattening every strand onto skin.
            for start in range(0,len(old),35):
                anchor = old[start+2]
                if weight(anchor.z) == 0:
                    continue
                q,n,d = nearest(anchor)
                delta = q+n*1.6-anchor
                root_before.append(d); root_indices.append(start+2)
                for j in range(35):
                    i=start+j; t=(j//5)/6
                    result[i] = old[i] + delta*weight(anchor.z)*(1-.25*t)
                root_after.append(nearest(result[start+2])[2])
        # Local penetration correction, not a global position/scale adjustment.
        for i,p in enumerate(result):
            for _ in range(12):
                q,n,d = nearest(p); depth=(p-q).dot(n)
                if old[i].z >= 88 and depth < .7 and d < 15:
                    p += n*(.7-depth)
                elif old[i].z < 88 and depth < .7 and d < 8 and n.y < -.2:
                    p.y -= (.7-depth)/max(.2,-n.y)
                h,hn,_,hd = helmet.find_nearest(p)
                if hd < 2 and (p-h).dot(hn) < .8:
                    p += hn.normalized()*(.8-(p-h).dot(hn))
            result[i]=p
        shape['positions'] = [list(p) for p in result]
        obj=bpy.data.objects[shape['name']]
        for vertex,p in zip(obj.data.vertices,result): vertex.co=p
        obj.data.update()
        moved=[(a-b).length for a,b in zip(old,result)]
        details=dict(before=before, after=stats([result[i] for i in active]) if active else None,
                     moved=sum(d>.001 for d in moved), max_displacement=round(max(moved),3),
                     lower_height_unchanged=all(abs(a.z-b.z)<1e-6 for a,b in zip(old,result) if a.z<88))
        if root_before:
            details['root_mean_before']=round(sum(root_before)/len(root_before),3)
            details['root_mean_after']=round(sum(nearest(result[i])[2] for i in root_indices)/len(root_indices),3)
        report['shapes'][shape['name']]=details
    with open(report_file,'w',encoding='utf-8') as f: json.dump(report,f,indent=2)
    print('WOLF_FIT_REPORT',json.dumps(report))
