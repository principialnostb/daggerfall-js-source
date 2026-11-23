"""Author a reference-matched classic street lantern; run with Blender -b -P."""
import bpy, math, random, json, struct, base64, sys
from pathlib import Path
from mathutils import Matrix, Vector

OUT = Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path.cwd()/'scratch'/'classic-lantern'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(1311)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
materials = []
texture_bytes = []
for name, color in [('Forged iron', (65,57,58)), ('Worn bronze edges',(105,76,49)), ('Amber glass',(255,160,45)), ('Snow',(218,226,239))]:
    image = bpy.data.images.new(name, width=128, height=128)
    pixels, raw = [], []
    rng = random.Random(71)
    cells = [[rng.uniform(.86,1.10) for x in range(32)] for y in range(32)]
    for y in range(128):
        for x in range(128):
            grain = cells[y//4][x//4] + .12*math.sin(x*.12+math.sin(y*.13)*2)*math.cos(y*.17) + rng.uniform(-.02,.02)
            if name == 'Amber glass':
                glow = max(0, 1-((x-64)/78)**2-((y-57)/100)**2)
                rgb = [255, 88+119*glow, 16+65*glow]
                grain = .92 + .08*cells[y//4][x//4]
            else: rgb = color
            values = [max(0,min(255,round(c*grain))) for c in rgb]+[255]
            raw.extend(values)
            pixels.extend([((v/255+.055)/1.055)**2.4 if v>10 else v/3294.6 for v in values[:3]]+[1])
    image.pixels = pixels
    image.filepath_raw = str(OUT/(name.replace(' ','_')+'.png'))
    image.file_format='PNG'; image.save(); image.pack()
    texture_bytes.append(base64.b64encode(bytes(raw)).decode())
    mat = bpy.data.materials.new(name); mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image; tex.interpolation='Closest'
    mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value=.73
    bs.inputs['Metallic'].default_value=.28 if len(materials)<2 else 0
    if name=='Amber glass':
        mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Emission Color'])
        bs.inputs['Emission Strength'].default_value=.45
    materials.append(mat)

objects=[]
def finish(obj,name,mat=0,bevel=0):
    obj.name=name
    obj.data.materials.clear()
    for m in materials: obj.data.materials.append(m)
    for face in obj.data.polygons: face.material_index=mat
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new('Hammered bevel','BEVEL'); mod.width=bevel; mod.segments=1; mod.material=1 if mat==0 else mat
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')
    objects.append(obj)
    return obj
def box(name,loc,scale,mat=0,bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.dimensions=scale
    return finish(o,name,mat,bevel)
def cone(name,z,r1,r2,h,x=0,y=0,mat=0,sides=8):
    bpy.ops.mesh.primitive_cone_add(vertices=sides,radius1=r1,radius2=r2,depth=h,location=(x,y,z))
    return finish(bpy.context.object,name,mat)
def bar(name,a,b,width,depth=None,mat=0):
    a,b=Vector(a),Vector(b)
    o=box(name,(a+b)/2,(width,depth or width,(b-a).length),mat,min(width*.15,.008))
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return o
def bolt(x,y,z,r=.024,axis='Y'):
    o=cone('Hand forged diamond rivet',z,r,r*.23,r*.7,x,y,1,4)
    if axis=='Y': o.rotation_euler[0]=math.pi/2
    else: o.rotation_euler[1]=math.pi/2
def band(z,w=.205,h=.145):
    box('Square iron collar',(0,0,z),(w,w,h),0,.016)
    for sign in [-1,1]:
        bolt(0,sign*(w/2+.007),z)
        bolt(sign*(w/2+.007),0,z,axis='X')
def ring(name,loc,r=.075,t=.014):
    bpy.ops.mesh.primitive_torus_add(major_segments=16,minor_segments=6,location=loc,major_radius=r,minor_radius=t,rotation=(math.pi/2,0,0))
    return finish(bpy.context.object,name)

# Ratios measured from the supplied four-view reference: total height 4.4 m.
box('Wide octagonal bevel foot',(0,0,.065),(.79,.66,.13),bevel=.035)
box('Lower pedestal block',(0,0,.265),(.61,.51,.27),bevel=.035)
for x in [-.20,.20]:
    box('Pedestal vertical strap',(x,-.267,.265),(.055,.025,.255),bevel=.006)
box('Pedestal neck',(0,0,.435),(.45,.40,.075))
box('Heavy plinth belt',(0,0,.535),(.49,.43,.13),bevel=.025)
cone('Tapered square pedestal',.81,.268,.12,.43,sides=4).rotation_euler[2]=math.pi/4
for x in [-1,1]:
    for y in [-1,1]: bar('Pedestal corner rib',(x*.175,y*.175,.60),(x*.077,y*.077,1.04),.035,mat=1)
band(1.08,.27,.13)
box('Continuous square iron post',(0,0,2.42),(.135,.135,2.63),bevel=.009)
band(1.30,.16,.21)
band(2.70)
band(3.24,.16,.13)
band(3.72,.205,.20)
arm_start=len(objects)
box('Horizontal projecting arm',(.43,0,3.73),(.98,.15,.15),bevel=.018)
for x in [.72,.90]:
    box('Arm collar',(x,0,3.73),(.16,.195,.18),bevel=.015)
    for y in [-.104,.104]: bolt(x,y,3.73)
for x in [.26,.47]:
    bolt(x,-.081,3.73,.014)
bar('Diagonal forged support',(.06,0,3.27),(.50,0,3.65),.041,.068,1)
bar('Brace short seat',(.04,0,3.26),(.04,0,3.44),.046,.080)
arm=objects[arm_start:]
cone('Finial lower socket',3.93,.089,.075,.13,sides=4).rotation_euler[2]=math.pi/4
cone('Finial diamond bottom',4.025,.04,.105,.09,sides=4).rotation_euler[2]=math.pi/4
cone('Finial diamond top',4.12,.105,.037,.10,sides=4).rotation_euler[2]=math.pi/4
cone('Spear lower shoulders',4.21,.07,.045,.09,sides=4).rotation_euler[2]=math.pi/4
cone('Spear point',4.335,.045,0,.16,sides=4).rotation_euler[2]=math.pi/4

cx=.735
housing_start=len(objects)
box('Suspension strap',(cx,0,3.60),(.049,.064,.15),bevel=.008)
ring('Single hanging iron ring',(cx,0,3.50),.073,.015)
box('Lantern ring eye',(cx,0,3.405),(.045,.052,.08),bevel=.009)
# Hexagonal housing, broad glazed panels and a stepped hipped roof.
cone('Roof crown',3.357,.064,.032,.045,cx)
cone('Hipped roof upper',3.30,.175,.065,.095,cx,sides=6)
cone('Roof ledge',3.238,.228,.175,.05,cx,sides=6)
cone('Heavy upper rim',3.20,.239,.239,.055,cx,sides=6)
cone('Lower rim',2.79,.239,.239,.065,cx,sides=6)
cone('Lower sloping bowl',2.733,.12,.223,.05,cx,sides=6)
cone('Lower bowl tip',2.69,.047,.12,.04,cx,sides=6)
cone('Bottom bead',2.646,.048,.029,.05,cx,sides=6)
cone('Bottom pointed pendant',2.584,0,.047,.075,cx,sides=6)
for i in range(6):
    a=i*math.tau/6; b=(i+1)*math.tau/6
    x,y=cx+.215*math.cos(a),.215*math.sin(a)
    bar('Six lantern corner mullions',(x,y,2.82),(x,y,3.18),.026)
    for z in [2.79,3.20]:
        o=cone('Lantern rim rivet',z,.014,.005,.012,x,y,1,4)
        o.rotation_euler=Vector((math.cos(a),math.sin(a),0)).to_track_quat('Z','Y').to_euler()
    verts=[(cx+.208*math.cos(t),.208*math.sin(t),z) for t,z in [(a,2.82),(b,2.82),(b,3.177),(a,3.177)]]
    mesh=bpy.data.meshes.new('Glass quad'); mesh.from_pydata(verts,[],[(0,1,2,3)]); mesh.update()
    o=bpy.data.objects.new('Warm amber pane without candle',mesh); bpy.context.collection.objects.link(o)
    finish(o,o.name,2)
    uv=o.data.uv_layers.active.data
    for j,coord in enumerate([(0,0),(1,0),(1,1),(0,1)]): uv[j].uv=coord
housing=objects[housing_start:]
for x in [-.29,0,.29]: bolt(x,-.335,.065,.022)
for x in [-.17,.17]: bolt(x,-.225,.535,.018)
bpy.context.view_layer.update()
single_count=len(objects)
opposite=Matrix.Diagonal((-1,-1,1,1))
for obj in arm+housing:
    other=obj.copy()
    bpy.context.collection.objects.link(other)
    other.matrix_world=opposite@obj.matrix_world
    objects.append(other)

# A separate snow collection is retained in the editable model and winter GLB.
bare=list(objects)
def snowcap(name,x,y,z,w,d):
    nx,ny=12,5; verts=[]; faces=[]
    for j in range(ny+1):
        for i in range(nx+1):
            edge=i in (0,nx) or j in (0,ny)
            height=random.uniform(.003,.018) if edge else random.uniform(.025,.047)
            verts.append((x+(i/nx-.5)*w,y+(j/ny-.5)*d,z+height))
    for j in range(ny):
        for i in range(nx):
            k=j*(nx+1)+i; faces.append((k,k+1,k+nx+2,k+nx+1))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);finish(o,name,3)
snowcap('Snow on projecting arm',.44,0,3.817,1.01,.20)
snowcap('Snow on opposite arm',-.44,0,3.817,1.01,.20)
for z,w,d in [(.13,.80,.67),(.60,.49,.43),(1.15,.27,.27),(2.78,.21,.21),(3.83,.21,.21)]: snowcap('Settled collar snow',0,0,z,w,d)
snow=list(set(objects)-set(bare))

def pack_mesh():
    positions=[]; normals=[]; uvs=[]; groups=[[] for _ in range(4)]; single_counts=[0]*4
    for number,obj in enumerate(bare):
        mesh=obj.data; mesh.calc_loop_triangles(); matrix=obj.matrix_world
        normal_matrix=matrix.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            if number<single_count: single_counts[tri.material_index]+=3
            for li in tri.loops:
                loop=mesh.loops[li]; p=matrix@mesh.vertices[loop.vertex_index].co; n=(normal_matrix@tri.normal).normalized()
                groups[tri.material_index].append(len(positions)//3)
                positions.extend([p.x/4.415,p.z/4.415,-p.y/4.415]); normals.extend([n.x,n.z,-n.y])
                uvs.extend(mesh.uv_layers.active.data[li].uv)
    def enc(code,values): return base64.b64encode(struct.pack('<'+code*len(values),*values)).decode()
    result=dict(positions=enc('f',positions),normals=enc('f',normals),uvs=enc('f',uvs),indices=enc('I',sum(groups,[])),counts=[len(g) for g in groups],singleCounts=single_counts,textures=texture_bytes,textureSize=128)
    (OUT/'classicStreetLantern.json').write_text(json.dumps(result,separators=(',',':'))+'\n',newline='\n')
    print('CLASSIC_LANTERN_TRIANGLES',len(positions)//9)
bpy.context.view_layer.update(); pack_mesh()
if '--packed-only' in sys.argv: sys.exit(0)
def export(name,selection):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in selection: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/name),use_selection=True,export_format='GLB',export_apply=True)
export('classic-street-lantern.glb',bare)
export('classic-street-lantern-winter.glb',objects)

# Studio preview; no candle or flame geometry exists in either export.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012))
floor=bpy.context.object; floor.name='Preview floor'
mat=bpy.data.materials.new('Studio grey');mat.diffuse_color=(.24,.25,.28,1);floor.data.materials.append(mat)
def aim(obj,at):obj.rotation_euler=(Vector(at)-obj.location).to_track_quat('-Z','Y').to_euler()
for loc,power,size in [((1,-4,7),1800,5),((-4,-1,3),1100,4),((2,3,6),2200,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,2))
bpy.ops.object.camera_add(location=(6,-13,6.1));camera=bpy.context.object;aim(camera,(0,0,2.22));camera.data.type='ORTHO';camera.data.ortho_scale=5.0
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.world.color=(.3,.3,.3);scene.view_settings.view_transform='AgX'
scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'classic-street-lantern.blend'))
scene.render.filepath=str(OUT/'preview-winter.png');bpy.ops.render.render(write_still=True)
for o in snow:o.hide_render=True
scene.render.filepath=str(OUT/'preview-game-asset.png');bpy.ops.render.render(write_still=True)
