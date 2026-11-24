"""Build the remaining Helbenar woodland library independently of the approved trees."""
import gzip
import json
import math
import sys
from pathlib import Path
from random import Random

import bpy
from mathutils import Vector

sys.path.insert(0,str(Path(__file__).resolve().parent))
from helbenar_trees import DEST, UP, TAU, radial, leaf_spray, frond, make_mesh, pack
from helbenar_canopy_art import paint

# The keys identify art shared by several nature archives. Height is in game metres.
# The final column names the original summer or winter records, including dead woodland.
MODELS = [
    ("Open highland pine", "pine", 0, 13.4, 0, "506:5 510:5"),
    ("Tall tiered pine", "pine", 0, 17.8, 1, "506:11 510:11"),
    ("Wind pine", "pine", 0, 8.5, 2, "503:5"),
    ("Candelabra tree", "table", 1, 15.6, 0, "504:14 506:14"),
    ("Spreading ridge tree", "table", 1, 16.0, 1, "504:15 506:15 508:15 510:15"),
    ("Bare ridge tree", "table_bare", 1, 16.0, 1, "505:15 507:15 509:15 511:15"),
    ("Amber crown", "round", 7, 13.5, 1, "508:13"),
    ("Bare amber crown", "round_bare", 7, 13.5, 1, "509:13"),
    ("Weathered stag", "dead", 2, 11.8, 0, "504:30 508:30 503:30"),
    ("Silver snag", "dead", 3, 14.1, 1, "506:24 508:24 510:24"),
    ("Twisted broken bole", "stump", 2, 5.6, 0, "508:25 510:16"),
    ("Charred fork", "dead", 3, 10.5, 2, "502:30 508:16"),
    ("Old rooted pollard", "stump", 2, 8.6, 1, "502:15 508:18"),
    ("Skeletal desert tree", "dead", 2, 6.5, 3, "503:12"),
    ("Dry coppice", "dead", 2, 7.3, 4, "503:11"),
    ("Open desert snag", "dead", 2, 5.9, 5, "503:28"),
    ("Low buttress fig", "round", 4, 6.0, 0, "500:18 502:12"),
    ("Spreading fig", "round", 4, 10.8, 2, "502:13"),
    ("Strangler fig", "round", 4, 7.5, 3, "502:16"),
    ("High root fig", "round", 4, 12.8, 4, "502:17"),
    ("Narrow river tree", "round", 4, 12.0, 5, "500:30 502:18"),
    ("Skirt palm", "palm", 6, 10.5, 0, "500:12"),
    ("Twisting palm", "palm", 6, 12.9, 1, "500:13"),
    ("Date palm", "palm", 5, 14.0, 2, "500:14 501:12"),
    ("Tall date palm", "palm", 5, 21.0, 3, "500:15 501:13"),
    ("Clumping palm", "palm", 5, 14.0, 4, "500:16"),
    ("Fan palm", "palm", 6, 11.0, 5, "501:11 501:16 503:13"),
    ("Leaning coastal palm", "palm", 5, 15.0, 6, "501:30"),
]

def tube(faces, path, radii, sides, rng, endgrain=False):
    """Joined rings and an axial UV seam follow a crooked limb, including its flared base."""
    grain_x = rng.randrange(96)
    span = min(126,max(4,TAU*max(radii[1:])*27))
    grain_x %= max(1,int(127-span))
    distances = [0.]
    for a,b in zip(path,path[1:]):
        distances.append(distances[-1]+(b-a).length)
    density=min(28,354/max(.01,distances[-1]))
    base_v=rng.uniform(2,17)
    rings=[]
    u=None
    for i,center in enumerate(path):
        axis=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        if u is None:
            u=axis.cross(Vector((1,.27,.06))).normalized()
        else:
            u=(u-axis*u.dot(axis)).normalized()
        v=axis.cross(u)
        rings.append([center+radii[i]*(u*math.cos(TAU*k/sides)+v*math.sin(TAU*k/sides)) for k in range(sides)])
    if endgrain:
        # A fracture opens along the grain: a low lip and a torn high side around a recessed core.
        end_axis = (path[-1]-path[-2]).normalized()
        phase = grain_x*.71
        for k in range(sides):
            edge = math.cos(TAU*k/sides+phase)*.33 + math.sin(2*TAU*k/sides+phase)*.16
            rings[-1][k] += end_axis*(radii[-1]*edge)
    for i,(lo,hi) in enumerate(zip(rings,rings[1:])):
        v0,v1=(base_v+distances[n]*density for n in (i,i+1))
        for k in range(sides):
            j=(k+1)%sides
            x0,x1=grain_x+span*k/sides,grain_x+span*(k+1)/sides
            faces.append((0,[lo[k],lo[j],hi[j],hi[k]],[(x0,v0),(x1,v0),(x1,v1),(x0,v1)]))
    if endgrain:
        ring=rings[-1]
        for k in range(sides):
            j=(k+1)%sides
            def uv(n):
                return (64+53*math.cos(TAU*n/sides),447+53*math.sin(TAU*n/sides))
            core = path[-1]-end_axis*radii[-1]*.28
            faces.append((0,[core,ring[k],ring[j]],[(64,447),uv(k),uv(j)]))
            if radii[-1]>.07 and (k+grain_x)%3==0:
                splinter = ring[k].lerp(ring[j],.22)+end_axis*radii[-1]*(.54+.24*(k%2))
                heel = core.lerp(ring[k],.73)
                faces.append((0,[heel,ring[k],splinter],[(30,20),(34,23),(34,42)]))
                faces.append((0,[splinter,ring[k],ring[k].lerp(ring[j],.46)],[(34,42),(34,23),(38,23)]))

def foot(faces,at,r,h,rng,count=6):
    for j in range(count):
        d=radial(TAU*j/count+rng.uniform(-.2,.2))
        toe=at+d*r*rng.uniform(1.8,3.0)
        tube(faces,[at+UP*h*.065,at+d*r*.85+UP*h*.022,toe-UP*.09],
             [r*.53,r*.35,r*.08],5,rng)

def pine(faces,h,var,rng):
    def axis(t):
        return Vector((h*(.024*t+.025*math.sin(4*t)*t),-.024*h*t*t,h*t))
    trunk_r=.025*h
    tube(faces,[axis(t) for t in (0,.12,.45,.72,.94,1)],
         [trunk_r*1.55,trunk_r,trunk_r*.76,trunk_r*.49,trunk_r*.17,.024],8,rng)
    foot(faces,axis(0),trunk_r,h,rng)
    # The old pines carry foliage in distinct sprays at the ends of ascending forks.
    tiers=(8, 9, 6)[var]
    for i in range(tiers):
        t=.18+.76*i/(tiers-1)
        for j in range(4 if var!=2 else 5):
            d=radial(i*2.41+j*TAU/(4 if var!=2 else 5)+rng.uniform(-.23,.23))
            reach=h*(.27 if var==1 else .21 if var==0 else .37)*(1-t)**.70
            base=axis(t+rng.uniform(-.024,.024))
            elbow=base+d*reach*.50-UP*reach*.14
            tip=base+d*reach+UP*reach*rng.uniform(.02,.21)
            tube(faces,[base,elbow,tip],[trunk_r*(1-t)*.45+.016,.034,.011],5,rng)
            # Flattened ginger-brown limbs carry bulky needle fans above and below their forks.
            leaf_spray(faces,elbow,d,reach*.61,reach*.20,reach*.14,7,rng,True)
            for k,turn in enumerate((-.69,-.26,.20,.71)):
                fan=radial(math.atan2(d.y,d.x)+turn)
                twig=elbow.lerp(tip,.14+.17*k)
                length=(.13 if var==1 else .16)*h*(1-t)**.72 + .13*reach
                raised=twig+fan*length*.52+UP*length*.20
                tube(faces,[twig,raised],[.029,.009],3,rng)
                for side in (-1,0,1):
                    brush=radial(math.atan2(fan.y,fan.x)+side*.58)
                    if side == 0:
                        leaf_spray(faces,raised,brush,length*.85,length*.36,length*.19,7,rng,True)
                    else:
                        frond(faces,raised,brush,length*.85,length*.36,-length*.30,7,True)
    for n in range(17):
        t=.91+.084*n/16
        length=h*(1-t)*.72+.08
        frond(faces,axis(t),radial(n*2.4),length,length*.29,-length*.22,7,True)

def broad(faces,h,var,rng,table,bare):
    leaf_rng = Random(rng.getrandbits(32))
    spread=((.31,.42)[var] if table else (.53,.40,.49,.44,.36,.21)[var])*h
    radius=h*(.026 if table else (.066,.043,.062,.072,.065,.040)[var])
    bend=radial(.85+var)*h*(.052 if not table else .075)
    def axis(t):
        return bend*math.sin(2*t)+UP*h*t+radial(3.9)*h*.018*math.sin(5*t)
    # Buttressed crowns begin on several sweeping scaffold branches.
    foot(faces,axis(0),radius,h,rng,5 if table else 8)
    tube(faces,[axis(t) for t in (0,.13,.32,.49,.68,.82)],
         [radius*1.6,radius,radius*.80,radius*.63,radius*.38,radius*.08],8,rng)
    if not table and var != 1:
        # Triangular buttresses climb the trunk, with a long tapered foot following the soil.
        for j in range(6):
            d=radial(j*TAU/6+.3*math.sin(2*j+var))
            side=UP.cross(d)*radius*.28
            high=axis(.20+.042*((j+var)%3))+d*radius*.79
            toe=axis(0)+d*radius*(2.6+.45*((j+var)%3))-UP*.07
            heel=axis(0)+d*radius*.74
            mid=heel.lerp(toe,.45)+UP*h*.073
            for sign in (-1,1):
                bottom=heel+side*sign
                faces.append((0,[bottom,toe,mid,high],[(19,2),(48,2),(38,23),(22,72)]))
                faces.append((0,[bottom,high,axis(.02)+side*sign],[(19,2),(22,72),(14,4)]))
    if not table and var in (3,4):
        for j in range(7):
            d=radial(j*.898)
            tube(faces,[axis(.36)+d*radius*.63,axis(.19)+d*radius*1.14,d*radius*1.58-UP*.08],
                 [radius*.19,radius*.23,radius*.14],5,rng)
    for j in range(13 if table else 17):
        t=(.29 if table else .35)+.45*j/(12 if table else 16)
        a=j*2.399+.4*var+rng.uniform(-.15,.15)
        d=radial(a)
        if table:
            shelf=.54+.39*j/13+.068*math.sin(a+var*.96)+.028*math.cos(2*a)
            reach=spread*(1-.28*j/13)*rng.uniform(.88,1.03)
            lift=h*(shelf-t)
        else:
            reach=spread*(.65+.35*math.sin(math.pi*j/17))*rng.uniform(.83,1.04)
            lift=h*(.65+.26*j/17+.052*math.sin(1.5*a+var)-t)
        base=axis(t)
        elbow=base+d*reach*.52+UP*lift*.35
        fork=base+d*reach*.77+UP*lift*.85
        tube(faces,[base,elbow,fork],[radius*(.35-.14*j/17),radius*.15,radius*.062],6,rng)
        for k in (-1,0,1):
            fan=radial(a+k*.87+rng.uniform(-.13,.13))
            tip=fork+fan*spread*.29+UP*h*rng.uniform(.013,.060)
            tube(faces,[fork,tip],[radius*.075,radius*.025],4,rng)
            for n in range(4):
                out=radial(a+k*.62+(n-1.5)*.94)
                origin=fork.lerp(tip,.24+.21*n)
                end=origin+out*spread*.18+UP*h*.037
                tube(faces,[origin,end],[radius*.035,.009],3,rng)
                if bare:
                    twig=end+out*spread*.069+UP*h*.034
                    tube(faces,[end,twig],[.018,.004],3,rng)
                else:
                    for side in (-1,0,1):
                        fanleaf=radial(a+k*.62+(n-1.5)*.94+side*.81)
                        length=spread*leaf_rng.uniform(.26,.42)
                        breadth = length*(.53 if table else .49)
                        drop = length*(leaf_rng.uniform(.16,.40) if table else leaf_rng.uniform(.29,.58))
                        shade = 3+leaf_rng.randrange(3)
                        if side == 0:
                            leaf_spray(faces,end,fanleaf,length,breadth,drop,shade,leaf_rng)
                        else:
                            frond(faces,end,fanleaf,length,breadth,-drop,shade)

def snag(faces,h,var,rng,stump):
    r=h*(.16 if stump else .051 if var==0 else .043)
    lean=radial(var*1.35+.3)
    def axis(t):
        return lean*h*(.078*math.sin(t*4.3)+.095*t*t)+UP*h*t
    foot(faces,axis(0),r,h,rng,7 if stump else 5)
    tube(faces,[axis(t) for t in (0,.12,.31,.54,.77,1)],
         [r*1.6,r,r*.77,r*.66,r*.43,r*(.28 if stump else .09)],8,rng,True)
    count=(6 if stump else (12,5,7,9,4,6)[var])
    for j in range(count):
        t=(.31+.49*j/count) if stump else .19+.67*j/count
        a=j*2.4+var
        d=radial(a)
        base=axis(t)
        length=h*((.34+.35*(1-t)) if stump else (.17+.20*(1-t)))*rng.uniform(.75,1.18)
        elbow=base+d*length*.52+UP*length*.45
        tip=elbow+radial(a+rng.uniform(-.65,.65))*length*(.68 if stump else .31)+UP*length*(.38 if stump else .78)
        tube(faces,[base,elbow,tip],[r*.51,r*.29,r*(.18 if stump else .064)],5,rng,True)
        if not stump or var==1:
            for k in (-1,1):
                off=radial(a+k*.91)
                fork=elbow.lerp(tip,.34 if k<0 else .7)
                end=fork+off*length*.45+UP*length*.32
                bud=end+radial(a+k*.55)*length*.16+UP*length*.42
                tube(faces,[fork,end,bud],[r*.15,r*.064,.009],4,rng,True)

def palm(faces,h,var,rng):
    clusters=(1,2,1,1,3,1,1)[var]
    for cl in range(clusters):
        size = h*(1 if cl==0 else .52+.12*cl)
        bend=radial(var*.76+cl*2.4)*size*(.44 if var==6 else .17 if var in (1,4) else .047)
        base=radial(cl*2.4)*cl*.58
        r=size*(.040 if var in (0,1,5) else .027)
        def center(t):
            kink=math.sin(t*9)*size*.035 if var==1 else 0
            return base+bend*t*t+radial(1.2)*kink+UP*size*t
        levels=(0,.06,.23,.46,.69,.86,1)
        tube(faces,[center(t) for t in levels],[r*k for k in (1.38,1,.90,.79,.75,.78,.64)],9,rng)
        foot(faces,base,r,size,rng,5)
        for n in range(18):
            a=n*2.39996+cl
            d=radial(a)
            crown=center(.976+.024*n/17)
            length=size*(.29 if var==3 else .52 if var==6 else .39 if var!=5 else .47)*rng.uniform(.89,1.08)
            loft=.12+.39*n/17
            droop=.74-.63*n/17
            def spine(t):
                return crown+d*length*t+UP*length*(loft*math.sin(math.pi*t)-droop*t*t)
            tube(faces,[spine(t) for t in (0,.30,.62,1)],[r*.15,r*.095,r*.053,.012],4,rng)
            if var in (0,5):
                # A fan opens on a petiole, with folded segments and separate hanging tips.
                joint=spine(.38)
                for k in range(-5,6):
                    blade=radial(a+k*.145)
                    length2=length*(.64-.037*abs(k))
                    frond(faces,joint,blade,length2,length*.080,-length2*droop,5,True)
            else:
                for j in range(1,14):
                    t=j/15
                    side_length=length*(.055+.21*math.sin(t*math.pi)**.72)
                    for sign in (-1,1):
                        tipdir=radial(a+sign*(1.15-.48*t))
                        frond(faces,spine(t),tipdir,side_length,side_length*.22,-side_length*(.24+droop*.70),5)
        if var in (0,2,3):
            # The skirt is made of old hanging leaf bases; its wood UVs keep it tawny.
            for j in range(26):
                t=.985-.11*j/26
                d=radial(j*2.4)
                a=center(t)+d*r*.64
                b=a+d*r*.94-UP*r*.64
                tube(faces,[a,b,b+d*r*.16-UP*r*1.8],[r*.25,r*.20,.015],4,rng)

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ink,colors,winter=paint()
    image=bpy.data.images.new("Bark, leaves and end grain",1024,512,alpha=True)
    rgba=[tuple(c/255 for c in col)+(1.,) for col in colors]
    rgba.extend([(0,0,0,0)]*(256-len(rgba)))
    image.pixels[:]=[c for ix in ink for c in rgba[ix]]
    image.pack()
    material=bpy.data.materials.new("Helbenar woodland cutout")
    material.use_nodes=True
    node=material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image,node.interpolation=image,"Closest"
    shader=material.node_tree.nodes.get("Principled BSDF")
    for output,input_name in (("Color","Base Color"),("Alpha","Alpha")):
        material.node_tree.links.new(node.outputs[output],shader.inputs[input_name])
    shader.inputs["Roughness"].default_value=.96
    verts,indices,meshes,records=bytearray(),bytearray(),[],{}
    for i,(name,kind,page,h,var,keys) in enumerate(MODELS):
        faces=[]
        rng=Random(908+var*197+page)
        if kind=="pine": pine(faces,h,var,rng)
        elif kind=="palm": palm(faces,h,var,rng)
        elif kind in ("dead","stump"): snag(faces,h,var,rng,kind=="stump")
        else: broad(faces,h,var,rng,kind.startswith("table"),kind.endswith("_bare"))
        mapped=[(slot,points,[((page*128+u)/4,v) for u,v in uv]) for slot,points,uv in faces]
        mesh=make_mesh(name,mapped,(i%7)*19,material,True,False)
        bpy.data.objects[name].location.y=(i//7)*22
        vs,ix,desc=pack(mesh)
        if desc["vertices"]>65535: raise ValueError(name+" exceeds the uint16 mesh limit")
        desc.update(vertex=len(verts)//32,index=len(indices)//2,needles=kind=="pine")
        verts.extend(vs)
        indices.extend(ix)
        meshes.append(desc)
        for key in keys.split():
            if key in records: raise ValueError("Duplicate source record "+key)
            records[key]=i
    (DEST/"woodland.idx").write_bytes(ink)
    (DEST/"woodland.mesh.gz").write_bytes(gzip.compress(verts+indices,compresslevel=8,mtime=0))
    (DEST/"woodland.json").write_text(json.dumps(dict(meshes=meshes,vertexBytes=len(verts),
        records=records,colors=colors,winter=winter),separators=(",",":")))
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(DEST/"Helbenar Woodland.blend"),compress=True)

if __name__=="__main__":
    build()
