# MW-HORN5: Skyrim's iron helmet, read out of the owner's install by tools/skyrim/importIronHelmet.mjs (OBJ + PNGs in
# scratch/skyrim/out), adapted: its painting re-baked in Cycles with its normal map's light in it, at the set's 128,
# and the helm written where tools/bakeHornedHelm.mjs reads it (both outputs ignored by git - Bethesda's, not ours).
import bpy, os, math

ROOT = os.getcwd()
OUT = os.path.join(ROOT, 'scratch', 'skyrim', 'out')
SRC = os.path.join(ROOT, 'src', 'assets', 'mw', 'source')
FBX_OUT = os.path.join(SRC, 'Steel_Plate_Horned_Helm.fbx')
PNG_OUT = os.path.join(SRC, 'Steel_Plate_Horned_Helm.png')
BAKE, SIZE = 512, 128

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=os.path.join(OUT, 'helmet.obj'), forward_axis='Y', up_axis='Z')
parts = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
helm = bpy.context.active_object
helm.name = helm.data.name = 'Horned_Helm'

m = bpy.data.materials.new('iron_helmet'); m.use_nodes = True
nt = m.node_tree; n = nt.nodes; l = nt.links
bsdf = n['Principled BSDF']
dif = n.new('ShaderNodeTexImage'); dif.image = bpy.data.images.load(os.path.join(OUT, 'diffuse.png'))
nrm = n.new('ShaderNodeTexImage'); nrm.image = bpy.data.images.load(os.path.join(OUT, 'normal.png')); nrm.image.colorspace_settings.name = 'Non-Color'
nm = n.new('ShaderNodeNormalMap')
l.new(dif.outputs['Color'], bsdf.inputs['Base Color'])
l.new(nrm.outputs['Color'], nm.inputs['Color']); l.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = 0.45
helm.data.materials.clear(); helm.data.materials.append(m)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 96; scene.cycles.device = 'CPU'
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.30, 0.31, 0.34, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
for rot, energy in (((math.radians(-40), math.radians(12), 0), 3.8), ((math.radians(200), 0, 0), 0.8)):
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = energy; sun.rotation_euler = rot
    bpy.context.collection.objects.link(sun)

img = bpy.data.images.new('bake', BAKE, BAKE)
t = n.new('ShaderNodeTexImage'); t.image = img; n.active = t
bpy.ops.object.select_all(action='DESELECT'); helm.select_set(True); bpy.context.view_layer.objects.active = helm
scene.render.bake.use_selected_to_active = False
scene.render.bake.margin = 8
bpy.ops.object.bake(type='COMBINED')
img.scale(SIZE, SIZE)
img.filepath_raw = PNG_OUT; img.file_format = 'PNG'; img.save()

ship = bpy.data.materials.new('Steel_Plate_Horned_Helm'); ship.use_nodes = True
st = ship.node_tree.nodes.new('ShaderNodeTexImage'); st.image = bpy.data.images.load(PNG_OUT)
ship.node_tree.links.new(st.outputs['Color'], ship.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
helm.data.materials.clear(); helm.data.materials.append(ship)
bpy.ops.export_scene.fbx(filepath=FBX_OUT, use_selection=True, add_leaf_bones=False, path_mode='STRIP', mesh_smooth_type='OFF')
print('ADAPTED', len(helm.data.polygons), [round(v, 2) for v in helm.bound_box[0]], [round(v, 2) for v in helm.bound_box[6]])
