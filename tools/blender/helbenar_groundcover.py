"""Bake the four Helbenar groundcover forms from the approved Blender library."""
import base64
import json
import math
import struct
from pathlib import Path

import bpy

DEST = Path(__file__).resolve().parents[2] / "src/assets/grass/helbenar"
FORMS = ("Creeping clover", "Broadleaf rosette", "Short sward", "Pink meadow spire")


def encode(data):
    return base64.b64encode(data).decode("ascii")


def bake(mesh, lod):
    uv = mesh.uv_layers.active.data
    verts, indices, lookup = bytearray(), bytearray(), {}

    def corner(face, i):
        loop = mesh.loops[face.loop_indices[i]]
        p = mesh.vertices[loop.vertex_index].co
        u, v = uv[loop.index].uv
        pigment = math.floor(u * 12)
        return struct.pack("<hhhBBB", round(p.x * 4096), round(p.z * 4096), round(-p.y * 4096),
                           round((u * 12 - pigment) * 255), round(v * 255), pigment - 2)

    def triangle(a, b, c):
        for v in (a, b, c):
            if v not in lookup:
                lookup[v] = len(lookup)
                verts.extend(v)
            indices.extend(struct.pack("<H", lookup[v]))

    faces = mesh.polygons
    i = 0
    leaf_index = 0
    while i < len(faces):
        p = faces[i]
        if abs(uv[p.loop_indices[0]].uv.y - uv[p.loop_indices[1]].uv.y) < .001:
            # A three-sided stem. Keep its axis even on the distant flower.
            for j in range(3 if lod == 0 else 1):
                a, b, c, d = (corner(faces[i+j], k) for k in range(4))
                triangle(a,b,c)
                triangle(a,c,d)
            i += 3
            continue
        # The authored leaf has five cross sections around a raised midrib.
        # Preserve its shoulders and bent tip. Far swards keep fewer whole blades.
        rows = [[corner(p,0), corner(p,3), corner(faces[i+1],3)]]
        for j in range(0,10,2):
            rows.append([corner(faces[i+j],1), corner(faces[i+j],2), corner(faces[i+j+1],2)])
        i += 10
        leaf_index += 1
        if lod == 2 and mesh.name.startswith("Short sward") and leaf_index % 2 == 0:
            continue
        foot, tip = rows[0][1], rows[5][1]
        if lod == 0:
            left, ridge, right = rows[3]
            for l, r, end in [(rows[1][0],rows[1][2],foot),(rows[4][0],rows[4][2],tip)]:
                if end == foot:
                    triangle(foot,l,ridge); triangle(foot,ridge,r)
                    triangle(l,left,ridge); triangle(ridge,right,r)
                else:
                    triangle(left,l,ridge); triangle(ridge,r,right)
                    triangle(l,tip,ridge); triangle(ridge,tip,r)
        else:
            left, ridge, right = rows[3]
            if lod == 1:
                triangle(foot,left,ridge); triangle(foot,ridge,right)
                triangle(left,tip,ridge); triangle(ridge,tip,right)
            else:
                triangle(foot,left,tip); triangle(foot,tip,right)
    return {"vertices": encode(verts), "indices": encode(indices), "triangles":len(indices)//6}


def textures():
    image = bpy.data.images["Meadow pigments"]
    pixels = list(image.pixels)
    tiles = []
    for tile in range(2,12):
        buf = bytearray()
        for y in reversed(range(32)):
            for x in range(32):
                off = (y*384+tile*32+x)*4
                # This packed byte atlas exposes normalized sRGB bytes.
                buf.extend(round(255*c) for c in pixels[off:off+3])
        tiles.append(encode(buf))
    return tiles


models = []
for name in FORMS:
    variants = sorted((m for m in bpy.data.meshes if m.name.startswith(name)), key=lambda m:m.name)
    assert len(variants) >= 2
    models.append([[bake(m,lod) for lod in range(3)] for m in variants[:2]])
payload = {"tiles":textures(), "models":models}
(DEST/"groundcover.json").write_text(json.dumps(payload,separators=(",",":"))+"\n")
print("Groundcover triangles per form", [[m["triangles"] for m in v[0]] for v in models])
