"""Generate the three authored shrubs. Run with Blender --background --python this_file."""
import base64
import json
import math
import random
import struct
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "src/assets/grass/helbenar"
DEST.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
V = Vector
TAU = math.tau
UP = V((0, 0, 1))
# Ember-brown wood, cool interior leaves, sage tips, and two flower pigments.
PIGMENTS = [(89,65,47), (51,65,48), (69,87,55), (88,105,61),
            (102,119,73), (145,90,127), (178,124,152), (183,153,98)]
TEX = 16
tiles = []
for slot, rgb in enumerate(PIGMENTS):
    tile = bytearray()
    for y in range(TEX):
        for x in range(TEX):
            if slot == 0:
                tone = 3 * math.sin(x*2 + y*.16) - (11 if (x+y//6)%7 == 1 else 0)
            elif slot <= 4:
                # y=0 at the petiole; a broken midrib and oblique side veins.
                rib = abs(x-7.5) < .8 and y < 14
                vein = (y - int(abs(x-7.5)*.7))%6 == 1 and 2 < y < 14
                tone = (6 if x<8 else -5) + 7*y/15 + 8*rib + 4*vein
            else:
                tone = -12 + y*.95 + (5 if x<7 else 0)
            tile.extend(max(0,min(255,round(c+tone))) for c in rgb)
    tiles.append(tile)
pixels = []
for y in range(TEX):
    for tile in tiles:
        for x in range(TEX):
            off=3*(y*TEX+x)
            pixels.extend([tile[off+k]/255 for k in range(3)] + [1.0])
image=bpy.data.images.new("Helbenar · botanical pigments",width=TEX*8,height=TEX,alpha=False)
image.pixels.foreach_set(pixels)
image.pack()
mat=bpy.data.materials.new("Helbenar · leaf and bark atlas")
mat.use_nodes=True
tex=mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image=image
tex.interpolation="Closest"
mat.node_tree.links.new(tex.outputs["Color"],mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
mat.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value=.87

class Plant:
    def __init__(self):
        self.points=[]; self.uv=[]; self.faces=[]; self.groups=[]
    def vertices(self,points,uv,slot,group):
        first=len(self.points)
        self.points.extend(points)
        self.uv.extend([((slot+.04+.92*u)/8,.04+.92*v) for u,v in uv])
        self.groups.append((group,range(first,len(self.points))))
        return list(range(first,len(self.points)))
    def tube(self,path,radii,sides):
        rings=[]
        for i,(p,r) in enumerate(zip(path,radii)):
            tangent=(path[min(len(path)-1,i+1)]-path[max(0,i-1)]).normalized()
            if i==0:
                axis=tangent.cross(V((0,1,0)) if abs(tangent.y)<.88 else V((1,0,0))).normalized()
            else:
                axis=(axis-tangent*tangent.dot(axis)).normalized()
            side=tangent.cross(axis)
            ring=[p+r*(math.cos(TAU*j/sides)*axis+math.sin(TAU*j/sides)*side) for j in range(sides)]
            rings.append(self.vertices(ring,[(j/sides,i/(len(path)-1)) for j in range(sides)],0,"Wood"))
        for lo,hi in zip(rings,rings[1:]):
            for j in range(sides):
                k=(j+1)%sides
                self.faces.extend([(lo[j],lo[k],hi[k]),(lo[j],hi[k],hi[j])])
        for j in range(1,sides-1):
            self.faces.extend([(rings[0][0],rings[0][j+1],rings[0][j]),(rings[-1][0],rings[-1][j],rings[-1][j+1])])
    def blade(self,root,axis,width,slot,roll,lod,group="Leaves"):
        length=axis.length
        f=axis.normalized()
        side=f.cross(UP if abs(f.z)<.96 else V((1,0,0))).normalized()
        n=side.cross(f).normalized()
        side,n=side*math.cos(roll)+n*math.sin(roll),n*math.cos(roll)-side*math.sin(roll)
        # A tapered petiole, rounded shoulders, a curved pointed tip and a convex underside.
        tip=root+axis-n*length*.11
        wide=root+axis*.55
        if lod > 0:
            rim=[root,wide+side*width,tip,wide-side*width]
            uv=[(.5,0),(1,.54),(.5,1),(0,.54)]
        else:
            rim=[root,root+axis*.26+side*width*.73+n*length*.037,wide+side*width,
                 tip,wide-side*width*.88-n*length*.027,root+axis*.25-side*width*.62]
            uv=[(.50,0),(.85,.26),(1,.55),(.50,1),(0,.58),(.16,.25)]
        ids=self.vertices(rim+[wide+n*width*.21,wide-n*width*.13],uv+[(.5,.55),(.5,.54)],slot,group)
        for j in range(len(rim)):
            k=(j+1)%len(rim)
            self.faces.extend([(ids[j],ids[k],ids[-2]),(ids[k],ids[j],ids[-1])])
    def finish(self,name,collection):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(self.points,[],self.faces);mesh.update()
        obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj)
        mesh.materials.append(mat)
        uv=mesh.uv_layers.new(name="LeafAtlas")
        for loop in mesh.loops: uv.data[loop.index].uv=self.uv[loop.vertex_index]
        groups={name:obj.vertex_groups.new(name=name) for name in ("Wood","Leaves","Blossoms")}
        for name,indices in self.groups: groups[name].add(list(indices),1.0,"REPLACE")
        return obj

def between(path,t):
    at=min(len(path)-1.00001,max(0,t)*(len(path)-1))
    return path[int(at)].lerp(path[int(at)+1],at%1)

# Main cane headings, reach, and climbing height, in model space. Each habit
# has independent leaders, twig spacing, leaf shape, and floral architecture.
HABITS=[
    ("Meadow",[(8,.46,.29),(76,.37,.21),(151,.49,.25),(204,.39,.34),(255,.43,.22),(313,.32,.38)],13,4,.095,.43),
    ("Roadside",[(13,.31,.50),(85,.25,.47),(156,.34,.35),(231,.23,.59),(303,.32,.43)],17,5,.108,.36),
    ("Wall",[(24,.20,.79),(102,.23,.65),(174,.28,.50),(244,.16,.87),(309,.26,.62)],22,5,.132,.40),
]
def model(form,lod):
    name,leaders,seed,nshoot,length,width=HABITS[form]
    rng=random.Random(seed)
    plant=Plant()
    def random_dir(a): return V((math.cos(a),math.sin(a),0))
    for ci,(degrees,reach,high) in enumerate(leaders):
        ang=math.radians(degrees);out=random_dir(ang);side=random_dir(ang+math.pi/2)
        origin=out*rng.uniform(.012,.046);origin.z=-.012
        cane=[origin,origin+out*reach*.23+UP*high*.34,
              origin+out*reach*.67+side*reach*.12+UP*high*.72,
              origin+out*reach+UP*high]
        plant.tube(cane,[.018,.014,.009,.0035],5 if lod==0 else 3)
        for s in range(nshoot+1):
            t=.26+.73*(s+.2)/(nshoot+1)
            start=between(cane,t)
            bearing=ang+(-1 if s%2 else 1)*rng.uniform(.58,1.48)
            arm=random_dir(bearing)
            span=(.15+.14*(1-t))*rng.uniform(.77,1.15)
            lift=(.07+.10*form)*rng.uniform(.75,1.12)
            branch=[start,start+arm*span*.5+UP*lift*.73,start+arm*span+UP*lift]
            plant.tube(branch,[.007,.004,.0019],4 if lod==0 else 3)
            # Each short lateral carries paired leaves. Lower fans droop; the young
            # terminal pair opens upward. The oldest leaves stay cool and dark.
            for b in range(4):
                p=between(branch,.20+b*.22)
                for hand in (-1,1):
                    az=bearing+hand*rng.uniform(.62,1.37)
                    slope=rng.uniform(-.38,.34)+b*.09
                    axis=(random_dir(az)+UP*slope).normalized()*length*rng.uniform(.79,1.29)
                    shade=rng.random();roll=rng.uniform(-.71,.71)
                    slot=1+min(3,int((.41*t+.32*b/3+.27*shade)*4))
                    keep=lod==0 or (lod==1 and (b+s+ci)%3!=0) or (lod==2 and b==(ci+s)%4)
                    if keep:
                        plant.blade(p,axis*(1+.16*lod),axis.length*width*(1+.23*lod),slot,roll,lod)
            # Recurved laterals fill the inside of the plant at staggered heights.
            # Their attachment and droop vary with the habit, including short basal fans.
            fork = between(branch, .38 + .13*((ci+s)%3))
            turn = bearing + (1 if (ci+s)%2 else -1)*1.84
            reach_in = (.12, .145, .115)[form]
            fall = (-.042, -.065, -.095)[form] * (.6 + .25*(s%3))
            hook = [fork, fork+random_dir(turn)*reach_in*.45+UP*.016,
                    fork+random_dir(turn+.34)*reach_in+UP*fall]
            if lod < 2 or s%2 == 0:
                plant.tube(hook,[.0045,.003,.0014],3)
                for k in range(4 if lod==0 else 3 if lod==1 else 1):
                    node = between(hook,.26+.22*k)
                    for hand in (-1,1):
                        vec = random_dir(turn+hand*(.73+.11*k)) + UP*(.31-.15*k+.12*math.sin(ci+s))
                        axis = vec.normalized()*length*(.76+.08*((s+k+ci)%4))
                        plant.blade(node,axis,axis.length*width*.76,1+((s+ci+k)%3),hand*.46,lod)
            if (ci+2*s)% (4 if form==0 else 3)==0:
                for j in range([3,4,6][form]):
                    az=ang+j*2.399+.38*s
                    center=branch[-1]+random_dir(az)*(.011+.005*j)+UP*(.016+j*.009)
                    petal_len=rng.uniform(.019,.034)
                    if lod==2:
                        if j%2==0:
                            plant.blade(branch[-1],center-branch[-1],.008,5+j%2,.2,2,"Blossoms")
                        continue
                    if lod==1 and j%2: continue
                    plant.tube([branch[-1],center],[.0018,.0012],3)
                    for petal in range(4 if form==2 else 5):
                        axis=(random_dir(az+TAU*petal/(4 if form==2 else 5))+UP*.46)*petal_len
                        plant.blade(center,axis,petal_len*.51,5+(j+petal//3)%2,.23,2,"Blossoms")
                    plant.blade(center,UP*.010,.004,7,.2,2,"Blossoms")
    # The lower crown grows from distinct basal shoots. A meadow runner roots
    # outward; the verge sends out short arching suckers; a wall plant bears
    # downward leaf sprays below its upright flowering canes.
    skirts = [
        [(34,.49,.09),(139,.35,.12),(221,.42,.085)],
        [(31,.29,.23),(104,.25,.18),(182,.32,.21),(268,.24,.17),(328,.26,.26)],
        [(37,.27,.37),(126,.25,.26),(209,.29,.43),(275,.21,.34)]
    ][form]
    for k,(heading,span,height) in enumerate(skirts):
        along=random_dir(math.radians(heading))
        bend=random_dir(math.radians(heading+19-11*(k%3)))
        foot=along*(.042+.013*(k%3))-UP*.008
        path=[foot,foot+along*span*.35+UP*height*.81,
              foot+bend*span*.79+UP*height,foot+bend*span+UP*height*.73]
        plant.tube(path,[.009,.006,.003,.0015],3)
        for node in range(1,8,1 if lod==0 else 2 if lod==1 else 3):
            base=between(path,.16+node*.105)
            for hand in (-1,1):
                angle=math.radians(heading)+hand*(.79+.11*(node%3))
                axis=(random_dir(angle)+UP*(.39-.13*node)).normalized()
                leaf=axis*length*(.69+.10*((k+node)%4))*(1+.13*lod)
                plant.blade(base,leaf,leaf.length*width*.81,1+(k+node//2)%3,hand*.58,lod)
    return plant

def packed(obj):
    mesh=obj.data;mesh.calc_loop_triangles()
    verts=bytearray();indices=bytearray();lookup={}
    uv=mesh.uv_layers.active.data
    for tri in mesh.loop_triangles:
        for li in tri.loops:
            vi=mesh.loops[li].vertex_index
            if vi not in lookup:
                p=mesh.vertices[vi].co; u,v=uv[li].uv; slot=int(u*8)
                lookup[vi]=len(lookup)
                verts.extend(struct.pack("<hhhBBB",round(4096*p.x),round(4096*p.z),round(-4096*p.y),
                    round((u*8-slot)*255),round(v*255),slot))
            indices.extend(struct.pack("<H",lookup[vi]))
    enc=lambda b:base64.b64encode(b).decode("ascii")
    return {"vertices":enc(verts),"indices":enc(indices),"triangles":len(indices)//6}

assets=[]
for form,(name,*_) in enumerate(HABITS):
    levels=[]
    for lod in range(3):
        col=bpy.data.collections.get("LOD "+str(lod)) or bpy.data.collections.new("LOD "+str(lod))
        if not col.users: bpy.context.scene.collection.children.link(col)
        obj=model(form,lod).finish(name+" · LOD "+str(lod),col)
        obj.location.x=(form-1)*1.65
        col.hide_viewport=lod!=0;col.hide_render=lod!=0
        levels.append(packed(obj))
    assets.append(levels)
    print(name,[level["triangles"] for level in levels])
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=="VIEW_3D":
            space=area.spaces.active;space.shading.color_type="TEXTURE"
            space.overlay.show_floor=False;space.region_3d.view_distance=5
            space.region_3d.view_rotation=V((0,1,-.40)).to_track_quat("-Z","Y")
            space.region_3d.view_location=(0,0,.35)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(DEST/"Helbenar Shrubs.blend"),compress=True)
(DEST/"shrubs.json").write_text(json.dumps({"tiles":[base64.b64encode(t).decode() for t in tiles],"models":assets},separators=(",",":"))+"\n")
