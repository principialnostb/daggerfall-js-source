"""Generate the editable Helbenar trees and the instanced tree renderer's mesh stream."""
import base64
import json
import math
from pathlib import Path
from random import Random
import struct

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from helbenar_tree_materials import COLORS, artwork
import bpy
from mathutils import Vector

DEST = Path(__file__).resolve().parents[2] / "src/assets/trees/helbenar"
DEST.mkdir(parents=True, exist_ok=True)
UP = Vector((0, 0, 1))
TAU = math.tau
PALETTE = [(80,54,35),(105,75,46),(50,69,37),(62,85,42),(76,99,45),
           (91,114,53),(46,69,48),(55,82,53),(70,93,56),(88,106,60)]


def radial(a):
    return Vector((math.cos(a), math.sin(a), 0))


def texture():
    rng = Random(301)
    rgb = bytearray(256*32*3)
    for y in range(32):
        for x in range(256):
            slot = min(x//16,len(PALETTE)-1)
            streak = math.sin(x*.9 + math.sin(y*.31)) if slot < 2 else math.sin(x*.69 + y*.48)
            shade = int(streak*7) + rng.randrange(-5,6)
            i = 3*(y*256+x)
            rgb[i:i+3] = bytes(c+shade for c in PALETTE[slot])
    return rgb


def limb(faces, a, b, ra, rb, sides=6):
    axis = (b-a).normalized()
    u = axis.cross(Vector((1,.2,0))).normalized()
    v = axis.cross(u)
    ring = [u*math.cos(TAU*i/sides)+v*math.sin(TAU*i/sides) for i in range(sides)]
    for i, d in enumerate(ring):
        e = ring[(i+1)%sides]
        # Wrap the bole once and keep vertical coordinates continuous across trunk rings.
        trunk = sides == 8
        span = 126 if trunk else min(108, max(6, math.tau*max(ra,rb)*30))
        x0 = 1 if trunk else 2 + (abs(int(23*a.x+11*a.y)) % max(1,int(124-span)))
        v0 = 1 + a.z*25 if trunk else 8 + (int(abs(a.z*29+a.x*17)) % 230)
        v1 = v0 + (b-a).length*25
        lo,hi = x0+span*i/sides,x0+span*(i+1)/sides
        faces.append((int(i%4==1), [a+d*ra,a+e*ra,b+e*rb,b+d*rb], [(lo,v0),(hi,v0),(hi,v1),(lo,v1)]))


def map_spray(faces, start, root, axis, side, slot):
    # One patch per sprig: the midrib follows branch growth across all its folded panels.
    if slot >= 6:
        offsets = [pt-root for _, points in faces[start:] for pt in points]
        half_width = max(.001, max(abs(p.dot(side)) for p in offsets))
        reach = max(.001, max(p.dot(axis) for p in offsets))
        # Tiny branches sample the denser centre, which still reads as needles at a distance.
        width_span = 16 if reach < .32 else 55
        length_span = 83 if reach < .32 else 118
        for index in range(start, len(faces)):
            shade, points = faces[index]
            uvs = [(64 + width_span*(pt-root).dot(side)/half_width,
                    388 + length_span*(pt-root).dot(axis)/reach) for pt in points]
            faces[index] = shade, points, uvs
        return
    u0 = 48 + int(root.x*13 + root.z*17 + slot*5) % 32
    v0 = 399 + int(root.y*19 + root.z*7 + slot*7) % 24
    for index in range(start, len(faces)):
        shade, points = faces[index]
        uvs = [(u0 + (pt-root).dot(side)*26, v0 + (pt-root).dot(axis)*26) for pt in points]
        faces[index] = shade, points, [(min(126,max(1,u)), min(510,max(385,v))) for u,v in uvs]


def frond(faces, root, direction, length, width, rise, slot, pine=False):
    start = len(faces)
    # Alternating widths articulate the outline. A folded spine catches overcast light.
    side = UP.cross(direction).normalized()
    axis = direction.normalized()
    tip = root + axis*length + UP*rise
    previous = [root]*3
    widths = (.83,.60,.70) if pine else (1,)
    for i, factor in enumerate(widths,1):
        t = i/(len(widths)+1)
        centre = root.lerp(tip,t) + UP*(width*.65*math.sin(math.pi*t))
        row = [centre-side*factor*width, centre+UP*width*.39,centre+side*factor*width]
        for j in range(2):
            vertices = [previous[j],row[j],row[j+1],previous[j+1]]
            if i == 1: vertices.pop()
            faces.append((slot,vertices))
        previous = row
    for j in range(2):
        faces.append((slot,[previous[j],tip,previous[j+1]]))
    map_spray(faces, start, root, axis, side, slot)


def leaf_spray(faces, root, direction, length, breadth, drop, slot, rng, evergreen=False):
    """A ridged spray on its twig, with irregular lobes and a hanging fringe."""
    side = UP.cross(direction).normalized()
    start = len(faces)
    rows = [[root]*3]
    widths = (.55, .91, .66, .78, .42) if evergreen else (.65, 1.0, .86, .53)
    for i,width in enumerate(widths):
        t = (i+1)/(len(widths)+1)
        spine = root+direction*(length*t) + UP*(breadth*.47*math.sin(t*math.pi)-drop*t*t)
        row = [spine-side*(breadth*width*rng.uniform(.85,1.15))-UP*(breadth*rng.uniform(.28,.72)),
               spine,
               spine+side*(breadth*width*rng.uniform(.85,1.15))-UP*(breadth*rng.uniform(.28,.72))]
        rows.append(row)
    tip = root+direction*length-UP*drop
    rows.append([tip]*3)
    for i,(a,b) in enumerate(zip(rows,rows[1:])):
        for j in range(2):
            panel = [a[j],b[j],b[j+1],a[j+1]]
            if i == 0: panel.pop()
            elif i == len(rows)-2: panel.pop(1)
            faces.append((slot,panel))
        if evergreen and 0<i<len(rows)-2:
            for j in (0,2):
                hook = b[j]+direction*(length*.12)-UP*(breadth*rng.uniform(.38,.9))
                faces.append((slot, [a[j],hook,b[j]]))
    map_spray(faces, start, root, direction.normalized(), side, slot)


def tree(pine, variation):
    rng = Random(421+variation*47+pine*611)
    h = (13.4 if pine else 9.1)*(1+.12*variation)
    faces = []
    def trunk(t):
        return Vector((.48*t*t+.10*math.sin(4*t),.22*math.sin(3*t),h*t))
    levels = [0,.055,.24,.48,.7,.87,1]
    for a,b in zip(levels,levels[1:]):
        radius = lambda t: (.37 if pine else .51)*(1-t)**.8+.025+(.22 if t==0 else 0)
        limb(faces,trunk(a),trunk(b),radius(a),radius(b),8)
    for j in range(6):
        d = radial(j*2.4+rng.random()*.3)
        limb(faces,trunk(.045),d*rng.uniform(.65,1.05)-UP*.04,.24,.048,5)
    if pine:
        # Each year's extension is shorter towards the leader. Branches are staggered
        # through the year's growth, so their outer tips overlap in side view.
        turns = 22
        around = 6
        for tier in range(turns):
            for j in range(around):
                age = (tier + (j + .25) / around) / turns
                t = 1 - .77*(1-age)**1.37
                angle = tier*2.39996 + j*TAU/around + variation*.63 + rng.uniform(-.075,.075)
                direction = radial(angle)
                # One taper for the whole tree. A slight bias by compass direction
                # gives individual limbs character without widening an entire tier.
                reach = (4.32 - .52*variation)*(1-t)**.92
                reach *= 1 + .045*math.sin(2*angle+.6) + .022*math.cos(3*angle-2*t)
                base = trunk(t)
                sweep = .46*reach
                knee = base + direction*(reach*.53) - UP*(sweep*.32)
                end = base + direction*reach - UP*sweep
                slot = 6+rng.randrange(3)
                if reach > .36:
                    limb(faces,base,knee,.032*reach,.016*reach,5)
                    limb(faces,knee,end,.016*reach,.005*reach,4)
                leaf_spray(faces,base,direction,reach,reach*.32,sweep,slot,rng,True)
                for sign in (-1,1):
                    pos = base.lerp(knee, .62 + .14*sign)
                    fan = radial(angle+sign*.66)
                    leaf_spray(faces,pos,fan,reach*.58,reach*.19,sweep*.93,slot,rng,True)
                # At the same taper, short inner twigs cover the axis in the
                # vertical space between the larger sprays, including at the tip.
                inner = trunk(t - .022*(1-t)**.45)
                frond(faces,inner,radial(angle+1.18),reach*.62,reach*.20,-sweep*.58,slot,True)
                if t > .935:
                    # Close to the bud individual sprays are subpixel at far LOD.
                    # Fold the new shoots along the stem inside the same crown profile.
                    for turn in (-1, 1):
                        fan = radial(angle + turn*2.1)
                        frond(faces,base,fan,reach*.80,reach*.32,-sweep-.12*(1-age),slot,True)
    else:
        for j in range(16):
            t = .23+.63*j/16
            a = j*2.399+rng.uniform(-.3,.3)
            base = trunk(t)
            reach = rng.uniform(3.5,4.5)*math.sin(math.pi*(t+.02))*(1-.17*variation)
            fork = base+radial(a)*reach*.50+UP*rng.uniform(.68,1.27)
            limb(faces,base,fork,.21*(1-t)+.065,.105,6)
            for k in (-1,0,1):
                turn = a+k*rng.uniform(.4,.83)
                end = fork+radial(turn)*(.5*reach)+UP*rng.uniform(.63,1.45)
                limb(faces,fork,end,.088,.025,5)
                for m in range(4):
                    angle = turn+(m-2)*.72+rng.uniform(-.24,.24)
                    start = fork.lerp(end,.46+.17*m)
                    sprig = start+radial(angle)*rng.uniform(.48,.87)+UP*rng.uniform(.20,.50)
                    limb(faces,start,sprig,.034,.009,3)
                    for n in range(5):
                        direction = radial(angle+(.5 if n%2 else -.5)*(1.10+.09*n))
                        attach = start.lerp(sprig,.24+.18*n)
                        frond(faces,attach,direction,rng.uniform(.77,1.26),rng.uniform(.33,.53),
                              rng.uniform(-.40,.48),2+rng.randrange(4))
                    leaf_spray(faces,start,radial(angle),rng.uniform(.91,1.58),rng.uniform(.52,.88),
                               rng.uniform(-.38,.34),2+rng.randrange(4),rng)
    return faces


def make_mesh(name, faces, offset, material, sample, pine):
    verts, polys, slots, lookup = [], [], [], {}
    for slot, points, *_ in faces:
        ids = []
        for p in points:
            key = tuple(p)
            if key not in lookup:
                lookup[key] = len(verts)
                verts.append(key)
            ids.append(lookup[key])
        polys.append(ids)
        slots.append(slot)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], polys)
    mesh.materials.append(material)
    uv = mesh.uv_layers.new()
    for p, face in zip(mesh.polygons, faces):
        slot,points,*mapping = face
        for n,idx in enumerate(p.loop_indices):
            if sample:
                u,v = mapping[0][n]
                uv.data[idx].uv = ((u+128*pine)/256,v/512)
            else:
                u,v = [(.08,.08),(.89,.11),(.80,.94),(.16,.91)][n]
                uv.data[idx].uv = ((slot+u)/16,v)
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    obj.location.x = offset
    return mesh


def pack(mesh):
    mesh.calc_loop_triangles()
    verts, inds, lookup = bytearray(),bytearray(),{}
    uv = mesh.uv_layers.active.data
    for tri in mesh.loop_triangles:
        for loop in tri.loops:
            p = mesh.vertices[mesh.loops[loop].vertex_index].co
            n = tri.normal
            key = struct.pack('<8f',p.x,p.z,-p.y,n.x,n.z,-n.y,*uv[loop].uv)
            if key not in lookup:
                lookup[key] = len(lookup)
                verts.extend(key)
            inds.extend(struct.pack('<H',lookup[key]))
    coords = [(v.co.x,v.co.z,-v.co.y) for v in mesh.vertices]
    return verts,inds,dict(name=mesh.name,vertices=len(lookup),subs=[[0,len(inds)//2]],
                           min=list(map(min,zip(*coords))),max=list(map(max,zip(*coords))),
                           radius=max(math.hypot(x,z) for x,y,z in coords))


if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rgb = texture()
    image = bpy.data.images.new("Helbenar bark and foliage",256,32)
    image.pixels[:] = [v for i in range(0,len(rgb),3) for v in (*[c/255 for c in rgb[i:i+3]],1)]
    image.pack()
    mat = bpy.data.materials.new("Meadow woodland")
    mat.use_nodes = True
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image, node.interpolation = image,"Closest"
    mat.node_tree.links.new(node.outputs["Color"],mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    art = artwork()
    art_image = bpy.data.images.new("Oak fissures, spruce scales and foliage",256,512)
    art_image.pixels[:] = [c for ix in art for c in ((0,0,0,0) if ix == 255 else (*[n/255 for n in COLORS[ix]],1))]
    art_image.pack()
    sample_mat = mat.copy()
    sample_mat.name = "Woodland material study"
    sample_node = sample_mat.node_tree.nodes.get(node.name)
    sample_node.image = art_image
    sample_mat.node_tree.links.new(sample_node.outputs["Alpha"],sample_mat.node_tree.nodes.get("Principled BSDF").inputs["Alpha"])
    sample_mat.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = .94
    (DEST/"study.idx").write_bytes(art)
    vertices,indices,meshes = bytearray(),bytearray(),[]
    for i,name in enumerate(["Field oak","Upland oak","Norway spruce","Slender spruce"]):
        mesh = make_mesh(name,tree(i>=2,i%2),i*11,sample_mat if i != 1 else mat,i != 1,i>=2)
        v,ix,desc = pack(mesh)
        desc.update(vertex=len(vertices)//32,index=len(indices)//2)
        meshes.append(desc)
        vertices.extend(v)
        indices.extend(ix)
    (DEST/"trees.bin").write_bytes(vertices+indices)
    (DEST/"trees.json").write_text(json.dumps(dict(vertexBytes=len(vertices),meshes=meshes,
        studyColors=COLORS,palette=base64.b64encode(rgb).decode()),separators=(",",":")))
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(DEST/"Helbenar Trees.blend"),compress=True)
