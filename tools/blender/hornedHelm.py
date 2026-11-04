# THE HORNED HELM IN BLENDER (MW-HORN4) - modelled, painted and exported in one run.
#
#     blender -b --factory-startup --python tools/blender/hornedHelm.py -- build
#         model the helm, bake its painting, write src/assets/mw/source/Steel_Plate_Horned_Helm.fbx and .png
#     blender -b --factory-startup --python tools/blender/hornedHelm.py -- preview [out.png]
#         render it worn over the set's cuirass and pauldrons beside the closed helm, at the game's coarse pixels
#
# A fan replica of Skyrim's horned iron helm, for the owner's personal fork, modelled here by eye from screenshots
# (nothing of Bethesda's files). Blender's frame IS the steel plate scene's (Z up, front +Y, right +X, the same
# numbers - Mac's closed helm stands at x +-7.5, y -7.9..9.0, z 113.9..132.8 here as in the bake), so the helm is built
# where it is worn. Each part is laid out round the head in (azimuth, height) and wrapped onto it; a LOW mesh is what
# ships, a HIGH copy (bevelled edges, rivet heads) is what its painting is baked from, Cycles lighting the iron from above
# and in front, so the light and the wear live in the picture as they do in Mac's.
import bpy, bmesh, math, sys, os
from mathutils import Vector

ROOT = os.getcwd()
SRC = os.path.join(ROOT, 'src', 'assets', 'mw', 'source')
FBX_OUT = os.path.join(SRC, 'Steel_Plate_Horned_Helm.fbx')
PNG_OUT = os.path.join(SRC, 'Steel_Plate_Horned_Helm.png')
OBJECT = 'Horned_Helm'
TEX = 128          # the set's helm pictures' size
BAKE = 512         # baked large, then scaled down to TEX

# The head the helm closes round: an upright elliptic cylinder up to the brow, a dome over it.
RX, RY, CY, BROW, H = 6.3, 7.4, 0.9, 123.4, 8.0
BAND_LO, BAND_HI = 122.3, 124.7

def head(th, z, g):
    """A point round the head: azimuth th (degrees, 0 the front, +90 the right), height z, g out from its surface."""
    k = 1.0 if z <= BROW else math.cos(math.asin(min(1.0, (z - BROW) / H)))
    a = math.radians(th)
    return Vector(((RX * k + g) * math.sin(a), CY + (RY * k + g) * math.cos(a), z))

# ═══ BUILDING ════════════════════════════════════════════════════════

def orient(bm, inside):
    """Every face turned to face away from inside(point) - the head's axis for a plate, the spine for a horn."""
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.dot(c - inside(c)) < 0:
            f.normal_flip()
    bm.normal_update()
    return bm

def axis(c):
    return Vector((0, CY, c.z if c.z <= BROW else BROW))

def mesh_object(name, bm, inside=axis):
    orient(bm, inside)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob

def grid_bm(nu, nv, f, closed_u=False):
    """A grid of quads over (s, t) in [0,1]^2 through f(s, t) -> Vector."""
    bm = bmesh.new()
    cols = nu if closed_u else nu + 1
    vs = [[bm.verts.new(f(i / nu, j / nv)) for i in range(cols)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            a, b = vs[j][i], vs[j][(i + 1) % cols]
            c, d = vs[j + 1][(i + 1) % cols], vs[j + 1][i]
            if len({a, b, c, d}) == 4:
                bm.faces.new((a, b, c, d))
            elif len({a, b, c, d}) == 3:
                bm.faces.new(tuple(dict.fromkeys((a, b, c, d))))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    return bm

def outline_bm(outer, holes, wrap, step=1.6):
    """A flat (azimuth, height) outline with holes, filled, divided finely enough to bend, then wrapped onto the head."""
    cu = bpy.data.curves.new('outline', 'CURVE')
    cu.dimensions = '2D'
    cu.fill_mode = 'BOTH'
    for poly in [outer] + holes:
        sp = cu.splines.new('POLY')
        sp.points.add(len(poly) - 1)
        for p, (u, v) in zip(sp.points, poly):
            p.co = (u / 10.0, v, 0, 1)   # azimuth in tens of degrees, so a degree weighs like the height's units
        sp.use_cyclic_u = True
    ob = bpy.data.objects.new('outline', cu)
    bpy.context.collection.objects.link(ob)
    me = ob.to_mesh().copy()
    bpy.data.objects.remove(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    for _ in range(6):
        long = [e for e in bm.edges if e.calc_length() > step]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.beautify_fill(bm, faces=bm.faces, edges=[e for e in bm.edges if not e.is_boundary])
    for v in bm.verts:
        v.co = wrap(v.co.x * 10.0, v.co.y)
    return bm

def mirror_x(pts):
    return [(-u, v) for (u, v) in reversed(pts)]

def solidify(ob, t, offset=-1.0):
    m = ob.modifiers.new('solid', 'SOLIDIFY')
    m.thickness, m.offset, m.use_rim = t, offset, True
    return m

def apply_all(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def spine(points):
    """Catmull-Rom through points, t in [0,1]."""
    def at(t):
        t = min(1.0, max(0.0, t))
        f = t * (len(points) - 1)
        i = min(len(points) - 2, int(f))
        u = f - i
        p0, p1, p2, p3 = (Vector(points[max(0, i - 1)]), Vector(points[i]), Vector(points[i + 1]), Vector(points[min(len(points) - 1, i + 2)]))
        return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)
    return at

def tube_bm(path, radius, nu, nv, t0=0.0, t1=1.0, cap=True):
    """A tube along path(t) for t0..t1, radius(t); the tip closed to a point."""
    def ring(s, t):
        tt = t0 + (t1 - t0) * t
        c = path(tt)
        T = (path(min(1, tt + 0.01)) - path(max(0, tt - 0.01))).normalized()
        B = T.cross(Vector((0, 0, 1))).normalized()
        N = B.cross(T)
        a = s * 2 * math.pi
        return c + radius(tt) * (math.cos(a) * B + math.sin(a) * N)
    return grid_bm(nu, nv, ring, closed_u=True)

# The parts, laid out in (azimuth degrees, height). The right half; the left is its mirror.
MASK = [(0, 122.9), (100, 122.9), (100, 116.2), (86, 116.2), (86, 114.3), (54, 114.3), (49, 117.5), (16, 116.7), (6, 115.6), (0, 115.0)]
EYE = [(9, 120.5), (38, 121.6), (42, 120.6), (31, 119.2), (11, 119.6)]
HORN = [(5.0, 0.2, 126.8), (8.2, -0.5, 127.9), (11.3, -0.4, 128.3), (14.0, 0.8, 127.3), (15.3, 3.0, 124.9), (15.1, 5.2, 122.2), (13.7, 6.5, 120.6)]
HORN_R = lambda t: 2.0 * (1 - t) ** 0.72 + 0.07

def mask_wrap(th, z):
    flare = 0.32 * max(0.0, 122.9 - z) / 8.0
    keel = 1.0 * max(0.0, 1 - abs(th) / 28.0) * min(1.0, max(0.0, (122.6 - z) / 1.6))   # a ridge down the middle to the nose
    p = head(th, z, 0.42 + flare)
    p.y += keel * math.cos(math.radians(th))
    return p

def build_low():
    parts = []
    # the skull, under the band to the crown, with a little point at the top
    def dome(s, t):
        th = s * 360
        if t < 0.1:
            return head(th, BAND_LO - 0.2 + (BROW - BAND_LO + 0.2) * t / 0.1, 0.0)
        e = (t - 0.1) / 0.9 * math.pi / 2
        a = math.radians(th)
        k = math.cos(e)
        return Vector((RX * k * math.sin(a), CY + RY * k * math.cos(a), BROW + H * math.sin(e) + 0.25 * math.sin(e) ** 8))
    ob = mesh_object('dome', grid_bm(24, 7, dome, closed_u=True)); solidify(ob, 0.25); parts.append(ob)
    # the ridge over the crown, front band to back band
    def ridge(s, t):
        psi = 0.05 + (math.pi - 0.1) * t
        y, z = CY + RY * math.cos(psi), BROW + H * math.sin(psi) + 0.25 * math.sin(psi) ** 8
        n = Vector((0, (y - CY) / RY ** 2, (z - BROW) / H ** 2)).normalized()
        x = -0.85 + 1.7 * s
        return Vector((x, y, z)) + n * 0.32
    ob = mesh_object('ridge', grid_bm(1, 14, ridge), lambda c: Vector((0, CY, BROW))); solidify(ob, 0.32); parts.append(ob)
    # the brow band
    ob = mesh_object('band', grid_bm(28, 1, lambda s, t: head(s * 360, BAND_LO + (BAND_HI - BAND_LO) * t, 0.62), closed_u=True)); solidify(ob, 0.3); parts.append(ob)
    # the mask and its cheek plates, one plate with the eyes cut out
    outer = mirror_x(MASK)[:-1] + MASK
    ob = mesh_object('mask', outline_bm(outer, [EYE, mirror_x(EYE)], mask_wrap)); solidify(ob, 0.28); parts.append(ob)
    # the nasal bar, brow to the point
    def nasal(s, t):
        th = -3.2 + 6.4 * s
        z = 115.2 + (122.4 - 115.2) * t
        p = mask_wrap(th, z)
        return p + Vector((0, 0.3, 0))
    ob = mesh_object('nasal', grid_bm(1, 5, nasal)); solidify(ob, 0.3); parts.append(ob)
    # the neck guard, flaring out behind
    ob = mesh_object('neck', grid_bm(14, 3, lambda s, t: head(98 + 164 * s, 115.4 + (122.6 - 115.4) * t, 0.34 + 0.5 * (1 - t)))); solidify(ob, 0.28); parts.append(ob)
    # the leather hanging inside, seen under the mask and between the cheek plates
    ob = mesh_object('leather', grid_bm(16, 2, lambda s, t: head(-104 + 208 * s, 112.4 + (118.8 - 112.4) * t + 0.4 * math.sin(s * math.pi * 9) ** 2 * (1 - t), 0.12))); solidify(ob, 0.12); parts.append(ob)
    # the horns, each in a cup
    for side in (1, -1):
        path = spine([(x * side, y, z) for (x, y, z) in HORN])
        samples = [path(i / 100) for i in range(101)]
        near = lambda c, samples=samples: min(samples, key=lambda p: (p - c).length_squared)
        ob = mesh_object('horn', tube_bm(path, HORN_R, 10, 18), near); parts.append(ob)
        ob = mesh_object('cup', tube_bm(path, lambda t: 2.4 + 0.15 * math.sin(t / 0.14 * math.pi), 10, 2, 0.0, 0.14), near); solidify(ob, 0.3); parts.append(ob)
    for ob in parts:
        ob['part'] = ob.name.split('.')[0]
        apply_all(ob)
        mat_index(ob)
    return parts

# ═══ PAINTING ════════════════════════════════════════════════════════

def node_mat(name, build):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    build(nt, bsdf)
    return m

def iron(nt, bsdf):
    n = nt.nodes; l = nt.links
    tc = n.new('ShaderNodeTexCoord')
    hammer = n.new('ShaderNodeTexNoise'); hammer.inputs['Scale'].default_value = 1.4; hammer.inputs['Detail'].default_value = 6
    rust = n.new('ShaderNodeTexNoise'); rust.inputs['Scale'].default_value = 0.35; rust.inputs['Detail'].default_value = 4
    l.new(tc.outputs['Object'], hammer.inputs['Vector']); l.new(tc.outputs['Object'], rust.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.3, (0.075, 0.070, 0.066, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.7, (0.17, 0.16, 0.15, 1)
    l.new(hammer.outputs['Fac'], ramp.inputs['Fac'])
    rr = n.new('ShaderNodeValToRGB')
    rr.color_ramp.elements[0].position, rr.color_ramp.elements[0].color = 0.56, (0, 0, 0, 1)
    rr.color_ramp.elements[1].position, rr.color_ramp.elements[1].color = 0.70, (1, 1, 1, 1)
    l.new(rust.outputs['Fac'], rr.inputs['Fac'])
    mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['B'].default_value = (0.13, 0.055, 0.022, 1)
    l.new(rr.outputs['Color'], mix.inputs['Factor']); l.new(ramp.outputs['Color'], mix.inputs['A'])
    l.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.38

def bone(nt, bsdf):
    n = nt.nodes; l = nt.links
    attr = n.new('ShaderNodeAttribute'); attr.attribute_name = 'along'
    tc = n.new('ShaderNodeTexCoord')
    wobble = n.new('ShaderNodeTexNoise'); wobble.inputs['Scale'].default_value = 0.8
    l.new(tc.outputs['Object'], wobble.inputs['Vector'])
    m1 = n.new('ShaderNodeMath'); m1.operation = 'MULTIPLY_ADD'; m1.inputs[1].default_value = 0.08
    l.new(wobble.outputs['Fac'], m1.inputs[0]); l.new(attr.outputs['Fac'], m1.inputs[2])
    m2 = n.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; m2.inputs[1].default_value = 12 * math.pi * 2
    l.new(m1.outputs['Value'], m2.inputs[0])
    sn = n.new('ShaderNodeMath'); sn.operation = 'SINE'; l.new(m2.outputs['Value'], sn.inputs[0])
    rings = n.new('ShaderNodeValToRGB')
    rings.color_ramp.elements[0].position, rings.color_ramp.elements[0].color = 0.0, (0.17, 0.12, 0.07, 1)
    rings.color_ramp.elements[1].position, rings.color_ramp.elements[1].color = 0.6, (0.44, 0.37, 0.25, 1)
    sc = n.new('ShaderNodeMath'); sc.operation = 'MULTIPLY_ADD'; sc.inputs[1].default_value = 0.5; sc.inputs[2].default_value = 0.5
    l.new(sn.outputs['Value'], sc.inputs[0]); l.new(sc.outputs['Value'], rings.inputs['Fac'])
    tip = n.new('ShaderNodeValToRGB')
    tip.color_ramp.elements[0].position, tip.color_ramp.elements[0].color = 0.82, (1, 1, 1, 1)
    tip.color_ramp.elements[1].position, tip.color_ramp.elements[1].color = 0.97, (0.10, 0.08, 0.07, 1)
    l.new(attr.outputs['Fac'], tip.inputs['Fac'])
    mul = n.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
    l.new(rings.outputs['Color'], mul.inputs['A']); l.new(tip.outputs['Color'], mul.inputs['B'])
    l.new(mul.outputs['Result'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.5

def leather(nt, bsdf):
    n = nt.nodes; l = nt.links
    tc = n.new('ShaderNodeTexCoord')
    nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.2
    l.new(tc.outputs['Object'], nz.inputs['Vector'])
    r = n.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].color = (0.025, 0.016, 0.010, 1); r.color_ramp.elements[1].color = (0.085, 0.052, 0.028, 1)
    l.new(nz.outputs['Fac'], r.inputs['Fac'])
    l.new(r.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8

def dark(nt, bsdf):
    bsdf.inputs['Base Color'].default_value = (0.012, 0.011, 0.010, 1)
    bsdf.inputs['Roughness'].default_value = 0.9

MATS = {}
def materials():
    for name, f in (('iron', iron), ('bone', bone), ('leather', leather), ('dark', dark)):
        MATS[name] = node_mat(name, f)

PART_MAT = {'horn': 'bone', 'leather': 'leather'}
def mat_index(ob):
    ob.data.materials.append(MATS[PART_MAT.get(ob['part'], 'iron')])
    if ob['part'] in ('dome', 'mask', 'neck'):   # the inside of a plate seen through the eyes or from below is dark
        ob.data.materials.append(MATS['dark'])
        for p in ob.data.polygons:
            c = p.center
            r = Vector((c.x / RX, (c.y - CY) / RY, 0)).length
            nrm = Vector((p.normal.x / RX, p.normal.y / RY, 0))
            out = Vector((c.x / RX ** 2, (c.y - CY) / RY ** 2, 0))
            if ob['part'] != 'dome' and nrm.dot(out) < -0.2:
                p.material_index = 1
            if ob['part'] == 'dome' and Vector((c.x, c.y - CY, (c.z - BROW))).dot(p.normal) < 0:
                p.material_index = 1

def horn_along(ob, side):
    """Each horn vertex's distance along its spine (0 root, 1 tip), for the rings and the dark tip."""
    path = spine([(x * side, y, z) for (x, y, z) in HORN])
    samples = [path(i / 200) for i in range(201)]
    attr = ob.data.attributes.new('along', 'FLOAT', 'POINT')
    for v in ob.data.vertices:
        best = min(range(201), key=lambda i: (samples[i] - v.co).length_squared)
        attr.data[v.index].value = best / 200

def rivets(high_parts):
    """Rivet heads on the high copy: round the band, along the ridge, on the cheeks and round each cup."""
    pts = [head(th, (BAND_LO + BAND_HI) / 2, 0.62 + 0.3) for th in range(0, 360, 15)]
    for i in range(1, 12):
        psi = 0.05 + (math.pi - 0.1) * i / 12
        y, z = CY + RY * math.cos(psi), BROW + H * math.sin(psi) + 0.25 * math.sin(psi) ** 8
        n = Vector((0, (y - CY) / RY ** 2, (z - BROW) / H ** 2)).normalized()
        pts.append(Vector((0, y, z)) + n * 0.65)
    for side in (1, -1):
        for z in (115.4, 119.6):
            pts.append(mask_wrap(side * 74, z) + head(side * 74, z, 1).normalized() * 0.0 + (head(side * 74, z, 0.6) - head(side * 74, z, 0.3)))
        path = spine([(x * side, y, z) for (x, y, z) in HORN])
        c = path(0.07); T = (path(0.08) - path(0.06)).normalized(); B = T.cross(Vector((0, 0, 1))).normalized(); N = B.cross(T)
        for k in range(6):
            a = k / 6 * 2 * math.pi
            pts.append(c + 2.62 * (math.cos(a) * B + math.sin(a) * N))
    for p in pts:
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=0.34)
        bmesh.ops.translate(bm, verts=bm.verts, vec=p)
        ob = mesh_object('rivet', bm, lambda c, p=p: p)
        ob.data.materials.append(MATS['iron'])
        high_parts.append(ob)

def join(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = ob.data.name = name
    return ob

def sharp_by_angle(ob, deg=42):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(deg)) and not e.is_boundary
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(ob.data); bm.free()

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials()
    low_parts = build_low()
    for ob in low_parts:
        if ob['part'] == 'horn':
            horn_along(ob, 1 if ob.data.vertices[0].co.x > 0 else -1)
    # the high copy: the same parts, edges bevelled, rivets added
    high_parts = []
    for ob in low_parts:
        h = ob.copy(); h.data = ob.data.copy(); bpy.context.collection.objects.link(h)
        if h['part'] != 'horn':
            b = h.modifiers.new('bevel', 'BEVEL'); b.width, b.segments, b.limit_method = 0.09, 2, 'ANGLE'
            apply_all(h)
        high_parts.append(h)
    rivets(high_parts)
    high = join(high_parts, 'high')
    low = join(low_parts, OBJECT)
    sharp_by_angle(low)
    for p in high.data.polygons:
        p.use_smooth = True
    # one painting for the whole helm
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.select_all(action='DESELECT'); low.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.012)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('bake', BAKE, BAKE)
    for m in low.data.materials:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = img; m.node_tree.nodes.active = t
    # the light: a key from above and in front, a dim fill from behind, a grey sky
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 96
    scene.cycles.device = 'CPU'
    world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.30, 0.31, 0.34, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    for rot, energy in (((math.radians(-40), math.radians(12), 0), 3.8), ((math.radians(200), 0, 0), 0.8)):
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        sun.data.energy = energy; sun.rotation_euler = rot
        bpy.context.collection.objects.link(sun)
    bpy.ops.object.select_all(action='DESELECT')
    high.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.45
    scene.render.bake.max_ray_distance = 1.0
    scene.render.bake.margin = 8
    bpy.ops.object.bake(type='COMBINED')
    img.scale(TEX, TEX)
    img.filepath_raw = PNG_OUT; img.file_format = 'PNG'; img.save()
    # ship one material wearing the painting
    for m in list(low.data.materials):
        pass
    low.data.materials.clear()
    ship = bpy.data.materials.new('Steel_Plate_Horned_Helm')
    ship.use_nodes = True
    t = ship.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(PNG_OUT)
    ship.node_tree.links.new(t.outputs['Color'], ship.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    low.data.materials.append(ship)
    for p in low.data.polygons:
        p.material_index = 0
    bpy.ops.object.select_all(action='DESELECT'); low.select_set(True)
    bpy.ops.export_scene.fbx(filepath=FBX_OUT, use_selection=True, add_leaf_bones=False, path_mode='STRIP', mesh_smooth_type='OFF')
    print('BUILT', OBJECT, len(low.data.polygons), 'faces', [round(v, 2) for v in low.bound_box[0]], [round(v, 2) for v in low.bound_box[6]])

# ═══ PREVIEW ═════════════════════════════════════════════════════════

SET_PICTURES = {'Imperial_Silver_Cuirass_67_Male.013': 'Cuirass', 'Imperial_Silver_Cuirass_67_Male.012': 'Cuirass',
                'Breton_Male.009 Remeshed.001': 'Pauldron', 'Breton_Male.009 Remeshed.003': 'Pauldron',
                'Sphere': 'Helm', 'Sphere.001 Remeshed Remeshed': 'Visor'}

def pictured(ob, png):
    m = bpy.data.materials.new(png)
    m.use_nodes = True
    t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(SRC, png)); t.interpolation = 'Closest'
    b = m.node_tree.nodes['Principled BSDF']
    m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.6
    ob.data.materials.clear(); ob.data.materials.append(m)

def preview(out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, 'Steel_Plate.fbx'))
    for ob in list(bpy.data.objects):
        if ob.type == 'MESH' and ob.name not in SET_PICTURES:
            bpy.data.objects.remove(ob)
        elif ob.type == 'MESH':
            pictured(ob, 'Steel_Plate_%s.png' % SET_PICTURES[ob.name])
    # a second body, wearing the horned helm, 40 to the right
    shift = Vector((40, 0, 0))
    for ob in [o for o in bpy.data.objects if o.type == 'MESH' and o.name not in ('Sphere', 'Sphere.001 Remeshed Remeshed')]:
        c = ob.copy(); c.location = ob.location + shift; bpy.context.collection.objects.link(c)
    bpy.ops.import_scene.fbx(filepath=FBX_OUT)
    helm = bpy.data.objects[OBJECT]
    helm.location = helm.location + shift
    pictured(helm, 'Steel_Plate_Horned_Helm.png')
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.08, 0.08, 0.1, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3
    sun.rotation_euler = (math.radians(-50), math.radians(20), 0); bpy.context.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 72
    scene.view_settings.view_transform = 'Standard'
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 360, 160   # coarse, as the pixel pass is
    scene.render.film_transparent = False
    base, ext = os.path.splitext(out)
    for name, yaw in (('front', 0), ('side', 90), ('three', 35)):
        a = math.radians(yaw)
        target = Vector((20, 0.5, 116))
        cam.location = target + Vector((60 * math.sin(a), 60 * math.cos(a), 6))
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = '%s-%s%s' % (base, name, ext)
        bpy.ops.render.render(write_still=True)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if args and args[0] == 'build':
    build()
elif args and args[0] == 'preview':
    preview(os.path.abspath(args[1] if len(args) > 1 else 'scratch/blender/preview.png'))
