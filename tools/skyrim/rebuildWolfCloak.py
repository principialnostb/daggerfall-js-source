"""Rebuild the reference cloak topology in Blender; no source pelt shell is reused.
Run by importWolfCloak.mjs. Outputs a local .blend and JSON for the existing NIF writer.
Pelts o Plenty supplies the fur texture atlas; these meshes are newly constructed.
"""
import bpy, bmesh, json, math, os, sys

out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
shapes = []

def make_shape(name, positions, uvs, triangles, kind, motion):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(positions, [], triangles)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    layer = mesh.uv_layers.new(name='FurAtlas')
    for face in mesh.polygons:
        for loop in face.loop_indices:
            layer.data[loop].uv = uvs[mesh.loops[loop].vertex_index]
        face.use_smooth = True
    # A stored lower-panel group records the intended future dynamic region.
    group = obj.vertex_groups.new(name='Future_Cloak_Motion')
    for i, weight in enumerate(motion):
        if weight > 0:
            group.add([i], weight, 'REPLACE')
    bm = bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(mesh); bm.free()
    shapes.append(dict(name=name, kind=kind, positions=[list(v.co) for v in mesh.vertices], uvs=uvs,
                       indices=[i for f in mesh.polygons for i in f.vertices], motion=motion))


def back_width(z):
    return 12.5 + 10.5 * max(0, min(1, (z - 28) / 84))


def back_y(x, z):
    # A draped sheet behind the body, not a volume wrapped around its flanks.
    return -17.5 - 2.3 * (1 - min(1, abs(x) / back_width(z)) ** 2) - 1.6 * max(0, (90 - z) / 70)

# A continuous support surface, tapered and irregular at the hem.
p, uv, tris, motion = [], [], [], []
NX, NZ = 16, 22
for row in range(NZ + 1):
    t = row / NZ
    for col in range(NX + 1):
        u = col / NX
        hem = 29 + 2.2 * math.sin(col * 2.7) + 1.6 * math.sin(col * .8)
        z = 112 * (1 - t) + hem * t
        x = (u * 2 - 1) * back_width(z)
        p.append((x, back_y(x, z), z)); uv.append((u, t))
        motion.append(max(0, min(1, (100 - z) / 65)))
        if row < NZ and col < NX:
            a = row * (NX + 1) + col
            tris.extend([(a, a + NX + 1, a + 1), (a + 1, a + NX + 1, a + NX + 2)])
make_shape('Wolf_Back_Panel', p, uv, tris, 'hide', motion)


def add_lock(p, uv, tris, motion, root, width, length, side, sweep, seed, drop=1.0):
    """A curved, cambered and pointed geometric lock, sampled along its length.
    The texture atlas contributes fine strands; the mesh itself makes the big silhouette.
    """
    start = len(p)
    x, y, z = root
    rows, cols = 6, 4
    for r in range(rows + 1):
        t = r / rows
        taper = [.3, .8, 1, .86, .62, .36, .025][r]
        cx = x + side * length * .23 * t + math.sin(seed) * .8 * t
        cy = y - sweep * t - 1.8 * math.sin(math.pi * t)
        cz = z - length * t * drop
        for c in range(cols + 1):
            across = c / cols * 2 - 1
            p.append((cx + across * width * .5 * taper * (1 + .055 * math.sin(seed + r * 2.7) * abs(across)), cy + 3.1 * across * across, cz + .6 * across * math.sin(seed)))
            # Fur detail only: the broad cambered geometry now defines each clump.
            # Upper-right long wolf lock in the mod's fur-collar atlas. NIF V is top-down.
            uv.append((.64 + c / cols * .32, .025 + t * .56))
            motion.append(max(0, min(1, (100 - cz) / 65)))
            if r < rows and c < cols:
                a = start + r * (cols + 1) + c
                tris.extend([(a, a + cols + 1, a + 1), (a + 1, a + cols + 1, a + cols + 2)])

# Back: visible overlapping courses, with staggered roots and distinct free ends.
p, uv, tris, motion = [], [], [], []
for band, z in enumerate([114, 105, 95, 85, 75, 65, 54, 43]):
    count = 7 if band < 5 else 5
    w = back_width(z)
    for j in range(count):
        u = (j + .35 + .22 * (band % 2)) / count
        x = (2 * u - 1) * w
        root_z = z + 1.5 * math.sin(j * 2.4 + band)
        length = 16 + 5 * (.5 + .5 * math.sin(j * 2.2 + band * .9))
        if band == 7:
            length = 17 + 7 * (.5 + .5 * math.sin(j * 2.9))
        add_lock(p, uv, tris, motion, (x, back_y(x, root_z) - 1.4 - (band % 2) * .5, root_z),
                 w * 2 / count * 2.35, length, .8 * x / w + .8 * math.sin(j * 1.9 + band), 4.3 + math.sin(j + band), band * 9 + j)
make_shape('Wolf_Back_Locks', p, uv, tris, 'clumps', motion)

# Continuous support mantle between the neck arc, shoulders and scapulae.
p, uv, tris, motion = [], [], [], []
ANG, RAD = 20, 6
for r in range(RAD+1):
    t=r/RAD
    for j in range(ANG+1):
        angle=-math.pi/2+j/ANG*math.pi
        x=(10+14*t)*math.sin(angle)
        y=-6-(7+10*t)*math.cos(angle)+10*t*abs(math.sin(angle))
        z=118-9*t
        p.append((x,y,z)); uv.append((j/ANG,t)); motion.append(0)
        if r<RAD and j<ANG:
            a=r*(ANG+1)+j
            tris.extend([(a,a+ANG+1,a+1),(a+1,a+ANG+1,a+ANG+2)])
make_shape('Wolf_Upper_Drape',p,uv,tris,'hide',motion)

# Low nape fan: a continuous transition under the rear helmet, never around the front neck.
p, uv, tris, motion = [], [], [], []
for course in range(2):
    for j in range(11):
        angle = -math.pi / 2 + j / 10 * math.pi
        x = 10.5 * math.sin(angle)
        y = -6.5 - 6 * math.cos(angle) - course * 2
        z = 119 - course * 2 + .5 * math.sin(j * 2.1)
        add_lock(p, uv, tris, motion, (x, y, z), 7.8 + course,
                 8 + course * 3 + 1.5 * math.sin(j * 1.7), 1.2 * math.sin(angle), 4.2, j + course * 11, drop=.65)
make_shape('Wolf_Nape_Locks', p, uv, tris, 'clumps', motion)

# Four unequal shoulder courses: compact roots, swept middle and a longer outer fringe.
p, uv, tris, motion = [], [], [], []
for side in [-1, 1]:
    for band in range(4):
        for j in range(7):
            t = j / 6
            seed = j * 1.8 + band * 2.7 + side * .85
            x = side * (11.5 + 9 * t + band * .9)
            y = 14 - 25 * t - band * 1.1 + .65 * math.sin(seed)
            z = 117.5 - t - band * 1.15 + .7 * math.sin(seed)
            add_lock(p, uv, tris, motion, (x, y, z), 9 + band * .8,
                     7.5 + band * 3 + 2 * math.sin(seed), side * (1.0 + band * .3),
                     4 + band * 1.8 + math.cos(seed), seed, drop=.45 + band * .1)
make_shape('Wolf_Shoulder_Locks', p, uv, tris, 'clumps', motion)

# Project only the upper garment onto the concrete character/armour cage.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fitWolfCloak import fit_upper_cloak
fit_upper_cloak(shapes, sys.argv[sys.argv.index('--')+2], os.path.join(os.path.dirname(out),'fit-report.json'))

# Keep the approved fitted roots in place. Bend only the shoulder locks' free
# ends down onto the outer shoulder, with a smooth zero-slope start at each root.
# add_lock emits seven rows of five vertices per lock.
shoulders = next(s for s in shapes if s['name'] == 'Wolf_Shoulder_Locks')
obj = bpy.data.objects[shoulders['name']]
for i, p in enumerate(shoulders['positions']):
    t = ((i % 35) // 5) / 6
    p[2] -= 1.6 * t * t
    obj.data.vertices[i].co = p
obj.data.update()

os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w', encoding='utf-8') as f:
    json.dump(shapes, f)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.splitext(out)[0] + '.blend'))
print('REBUILT_WOLF_TOPOLOGY', [(s['name'], len(s['positions']), len(s['indices']) // 3) for s in shapes])
