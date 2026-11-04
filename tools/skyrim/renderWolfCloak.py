import bpy,json,os,math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
out = os.environ.get('WOLF_PREVIEW_OUT', 'scratch/wolf-preview')
for i,s in enumerate(json.load(open(os.path.join(out, 'scene.json')))):
    p=s['positions']; idx=s['indices']; uv=s['uvs']
    m=bpy.data.meshes.new(s['name']);m.from_pydata([p[j:j+3] for j in range(0,len(p),3)],[],[idx[j:j+3] for j in range(0,len(idx),3)]);m.update()
    o=bpy.data.objects.new(str(i),m);bpy.context.collection.objects.link(o)
    mat=bpy.data.materials.new(str(i));mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.8
    if s['png']:
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(os.path.abspath(s['png']));mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        if s.get('alpha'):mat.node_tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
        layer=m.uv_layers.new()
        for f in m.polygons:
            for li in f.loop_indices:
                v=m.loops[li].vertex_index;layer.data[li].uv=(uv[v*2],1-uv[v*2+1])
    else:bs.inputs['Base Color'].default_value=(.24,.24,.29,1)
    o.data.materials.append(mat)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.resolution_x=600;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.23,.23,.23,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
for pos,power,size in [((70,110,200),230000,100),((-80,-100,150),180000,90)]:
    d=bpy.data.lights.new('soft','AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new('soft',d);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,80))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Camera');o=bpy.data.objects.new('Camera',d);bpy.context.collection.objects.link(o);scene.camera=o;d.type='ORTHO';d.ortho_scale=155
for view,pos in [('front',(0,260,95)),('back',(0,-260,95)),('side',(260,0,95)),('angle45',(184,-184,95))]:
    if view not in os.environ.get('WOLF_PREVIEW_VIEWS', 'front,back,side,angle45').split(','): continue
    o.location=pos;o.rotation_euler=(Vector((0,0,65))-o.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.abspath(os.path.join(out,view+'.png'));bpy.ops.render.render(write_still=True)
