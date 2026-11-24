"""Build Helbenar's meadow sedge, foxtail and yarrow in Blender and bake the game meshes."""
from pathlib import Path
from math import cos, sin, tau
import base64
import json
import random
import struct

import bpy
from mathutils import Vector

DEST = Path(__file__).resolve().parents[2] / "src/assets/grass/helbenar"
SPECIES = ("Meadow sedge", "Golden foxtail", "Ivory yarrow")
UP = Vector((0, 0, 1))
UV = ((.12,.06), (.88,.15), (.52,.94))
base64bytes = lambda b: base64.b64encode(b).decode("ascii")


def radial(angle):
    return Vector((cos(angle), sin(angle), 0))


def blade(faces, root, angle, reach, height, width, pigment):
    axis = radial(angle)
    side = radial(angle + tau/4)
    shoulder = root + axis*reach*.37 + UP*height*.76
    ridge = shoulder - axis*width*.33 + UP*width*.40
    tip = root + axis*reach + UP*height
    left, right = shoulder - side*width, shoulder + side*width
    for tri in ((root,left,ridge),(root,ridge,right),(left,tip,ridge),(ridge,tip,right)):
        faces.append((pigment,tri))


def stalk(faces, a, b, radius):
    for j in range(3):
        u, v = radial(j*tau/3)*radius, radial((j+1)*tau/3)*radius
        faces.extend([(4,(a+u,a+v,b+v*.72)),(4,(a+u,b+v*.72,b+u*.72))])


def plant(species, variant, lod):
    rng = random.Random(719 + 71*species + 13*variant)
    faces = []
    for i in range(15 if species == 0 else 8):
        angle = 2.4*i + rng.uniform(-.3,.3)
        root = radial(angle)*rng.uniform(.01,.08)
        reach = rng.uniform(.11,.24) if species == 0 else rng.uniform(.08,.17)
        height = rng.uniform(.25,.52) if species == 0 else rng.uniform(.12,.27)
        if i % (lod+1) == 0:
            blade(faces,root,angle,reach,height,.018 if species == 0 else .015,2+i%3)
    if species == 0:
        return faces
    for i in range(3+variant):
        angle = i*2.4+rng.uniform(-.5,.5)
        height = rng.uniform(.56,.76) if species == 1 else rng.uniform(.49,.68)
        axis = radial(angle)
        root = axis*.035
        bend = axis*.078 + UP*height*.55
        crown = axis*rng.uniform(.12,.19) + UP*height
        if lod == 2 and i == 2:
            continue
        stalk(faces,root,bend,.007)
        stalk(faces,bend,crown,.006)
        blade(faces,bend,angle+.85,.12,.13,.014,3)
        if species == 1:
            for j in range(8):
                if lod == 2 and j%2:
                    continue
                base = crown + UP*(.009*j) + axis*(.004*j)
                blade(faces,base,angle+j*2.4,.022,.052,.012,10)
        else:
            for j in range(5 if lod < 2 else 3):
                branch = radial(angle+j*2.4)
                head = crown + branch*(.052+.009*(j%2)) + UP*(.045+.008*(j%3))
                stalk(faces,crown,head,.0035)
                for petal in range(4 if lod == 0 else 3):
                    blade(faces,head,angle+petal*tau/(4 if lod == 0 else 3),
                          .024,.011,.013,11)
    return faces


def pigment_tile(base):
    return bytes(max(0,min(255,v + (y//6 - 2)*3 + (5 if 13 <= x <= 17 else 0)))
                 for y in range(32) for x in range(32) for v in base)


def export_mesh(faces):
    vertices, indices, index = bytearray(), bytearray(), {}
    for pigment, triangle in faces:
        for (x,y,z), (u,v) in zip(triangle,UV):
            data = struct.pack("<hhhBBB",round(x*4096),round(z*4096),round(-y*4096),
                               round(u*255),round(v*255),pigment)
            if data not in index:
                index[data] = len(index)
                vertices.extend(data)
            indices.extend(struct.pack("<H",index[data]))
    return dict(vertices=base64bytes(vertices),indices=base64bytes(indices),triangles=len(faces))


def blender_object(name, faces, location, materials):
    points, lookup, polygons = [], {}, []
    for _, triangle in faces:
        indices = []
        for point in triangle:
            key = tuple(point)
            if key not in lookup:
                lookup[key] = len(points)
                points.append(key)
            indices.append(lookup[key])
        polygons.append(indices)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points,[],polygons)
    uv = mesh.uv_layers.new()
    for material in materials:
        mesh.materials.append(material)
    for poly, (slot, _) in zip(mesh.polygons, faces):
        poly.material_index = slot
        for idx, coord in zip(poly.loop_indices,UV):
            uv.data[idx].uv = coord
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location


bpy.ops.wm.read_factory_settings(use_empty=True)
tiles = [pigment_tile((163,143,82)),pigment_tile((204,198,163))]
existing = json.loads((DEST/"groundcover.json").read_text())["tiles"]
materials = []
for i, tile in enumerate([base64.b64decode(t) for t in existing] + tiles):
    mat = bpy.data.materials.new("Meadow pigment %02d"%i)
    mat.diffuse_color = tuple((tile[c]/255)**2.2 for c in range(3))+(1,)
    mat.use_nodes = True
    image = bpy.data.images.new(mat.name,32,32)
    rgba = []
    for j in range(0,len(tile),3):
        rgba.extend([tile[j]/255,tile[j+1]/255,tile[j+2]/255,1])
    image.pixels[:] = rgba
    image.pack()
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image, tex.interpolation = image,"Closest"
    mat.node_tree.links.new(tex.outputs["Color"],mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    materials.append(mat)

models = []
for species, name in enumerate(SPECIES):
    variants = []
    for variant in range(2):
        levels = [plant(species,variant,lod) for lod in range(3)]
        blender_object(name+" "+str(variant+1),levels[0],(species*.85,variant*.75,0),materials)
        variants.append([export_mesh(faces) for faces in levels])
    models.append(variants)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(DEST/"Helbenar Meadow Stems.blend"),compress=True)
(DEST/"meadowStems.json").write_text(json.dumps(dict(models=models,tiles=list(map(base64bytes,tiles))),separators=(",",":"))+"\n")
