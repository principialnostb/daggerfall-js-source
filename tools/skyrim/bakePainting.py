# A Skyrim painting re-baked for the port (MW-IRON1, after MW-HORN5's helm): the OBJ's mesh wears the diffuse and its
# normal map, Cycles lights it from above and in front under a grey sky, and the light is baked into one picture,
# scaled down to the set's size.
#
#     blender -b --factory-startup --python tools/skyrim/bakePainting.py -- <obj> <diffuse.png> <normal.png> <out.png> <size>
import bpy, sys, math

obj, diffuse, normal, out, size = sys.argv[sys.argv.index('--') + 1:][:5]
size, BAKE = int(size), 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=obj, forward_axis='Y', up_axis='Z')
parts = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
mesh = bpy.context.active_object

m = bpy.data.materials.new('painting'); m.use_nodes = True
n, l = m.node_tree.nodes, m.node_tree.links
bsdf = n['Principled BSDF']
dif = n.new('ShaderNodeTexImage'); dif.image = bpy.data.images.load(diffuse)
nrm = n.new('ShaderNodeTexImage'); nrm.image = bpy.data.images.load(normal); nrm.image.colorspace_settings.name = 'Non-Color'
nm = n.new('ShaderNodeNormalMap')
l.new(dif.outputs['Color'], bsdf.inputs['Base Color'])
l.new(nrm.outputs['Color'], nm.inputs['Color']); l.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = 0.35   # a sheen on the plates' edges, as Mac's pictures carry
mesh.data.materials.clear(); mesh.data.materials.append(m)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 64; scene.cycles.device = 'CPU'
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.30, 0.31, 0.34, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6   # a dimmer sky, so the folds keep their shade
for rot, energy in (((math.radians(-40), 0, 0), 4.6), ((math.radians(200), 0, 0), 0.6)):   # level across: the mirrored halves share texels
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = energy; sun.rotation_euler = rot
    bpy.context.collection.objects.link(sun)

img = bpy.data.images.new('bake', BAKE, BAKE)
t = n.new('ShaderNodeTexImage'); t.image = img; n.active = t
bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
scene.render.bake.use_selected_to_active = False
scene.render.bake.margin = 16
bpy.ops.object.bake(type='COMBINED')
img.scale(size, size)
img.filepath_raw = out; img.file_format = 'PNG'; img.save()
print('BAKED', out, size)
