"""Render the original login illustration with Blender (no external assets).
Run: blender --background --factory-startup --python scripts/generate-auth-art.py -- /tmp/auth-study.png
Then encode the PNG as assets/auth-study.webp with sharp (quality 88, alpha preserved).
"""
import bpy
import math
import sys
from mathutils import Vector

# Runs in an isolated background Blender process, never in an existing user scene.
scene = bpy.context.scene
for obj in list(scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 1440
scene.render.resolution_y = 1440
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.world.use_nodes = True
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs['Color'].default_value = (0.82, 0.85, 0.9, 1)
background.inputs['Strength'].default_value = 0.45


def material(name, color, roughness=0.65):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat


wine = material('Burgundy linen', (0.24, 0.035, 0.045))
red = material('Terracotta pencil', (0.55, 0.13, 0.075))
paper = material('Warm ivory paper', (0.9, 0.86, 0.74))
edge = material('Paper edges', (0.73, 0.68, 0.56))
ink = material('Burgundy ink', (0.28, 0.045, 0.055))
rule = material('Soft pencil ruling', (0.58, 0.6, 0.57))
wood = material('Cedar wood', (0.66, 0.4, 0.2))
graphite = material('Graphite', (0.055, 0.055, 0.05))
gold = material('Ochre ribbon', (0.57, 0.32, 0.085))
green = material('Sage bookcloth', (0.29, 0.36, 0.27))


def box(name, location, scale, mat, bevel=0.04, angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.z = angle
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new('Soft edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 4
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj


def line(name, points, mat, thickness=0.009):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = thickness
    data.bevel_resolution = 3
    spline = data.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for p, coord in zip(spline.points, points):
        p.co = (*coord, 1)
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


# A second, closed exercise book gives the open notebook a gentle lift.
angle = math.radians(-12)
box('Sage book bottom cover', (-0.35, 0.65, 0.06), (3.35, 3.2, 0.12), green, angle=angle)
box('Sage book pages', (-0.35, 0.65, 0.20), (3.23, 3.08, 0.18), paper, angle=angle)
box('Sage book top cover', (-0.35, 0.65, 0.34), (3.35, 3.2, 0.12), green, angle=angle)
box('Open burgundy cover', (0, -0.18, 0.45), (4.5, 3.22, 0.12), wine, 0.075)


def page_height(x):
    return 0.72 + 0.18 * math.exp(-((abs(x) - 0.55) / 0.85) ** 2)


for side in [-1, 1]:
    # A closed page block with a subtly curved top; the fold remains visible.
    verts = []
    steps = 36
    for zlayer in [0, 1]:
        for y in [-1.68, 1.32]:
            for i in range(steps + 1):
                x = side * (0.035 + 2.12 * i / steps)
                verts.append((x, y, page_height(x) if zlayer else 0.52))
    n = steps + 1
    faces = []
    for i in range(steps):
        faces.extend([(2*n+i, 2*n+i+1, 3*n+i+1, 3*n+i),
                      (i, n+i, n+i+1, i+1),
                      (i, i+1, 2*n+i+1, 2*n+i),
                      (n+i, 3*n+i, 3*n+i+1, n+i+1)])
    faces.extend([(0, 2*n, 3*n, n), (n-1, 2*n-1, 4*n-1, 3*n-1)])
    mesh = bpy.data.meshes.new('Curved pages')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('Notebook page block', mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(paper)
    for z in [0.55, 0.58, 0.61, 0.64, 0.67]:
        line('Visible page layers', [(side*0.08, -1.687, z), (side*2.14, -1.687, z)], edge, 0.004)

# Fine, restrained marks read as a real exercise page rather than floating UI.
for y in [-1.19, -0.87, -0.55, -0.23]:
    line('Left writing rule', [(x, y, page_height(x)+0.007) for x in [-1.88+i*0.045 for i in range(30)]], rule, 0.006)
    line('Checkmark', [(-1.92, y+0.075, page_height(-1.92)+0.015), (-1.84, y+0.01, page_height(-1.84)+0.015), (-1.72, y+0.17, page_height(-1.72)+0.015)], ink, 0.012)
for x in [0.55, 0.85, 1.15, 1.45, 1.75]:
    line('Graph vertical', [(x, y, page_height(x)+0.012) for y in [-1.2, 0.48]], rule, 0.004)
for y in [-1.2, -0.9, -0.6, -0.3, 0, 0.3]:
    line('Graph horizontal', [(x, y, page_height(x)+0.012) for x in [0.35+i*0.05 for i in range(31)]], rule, 0.004)
line('Graph axes', [(0.45, 0.55, page_height(.45)+.02), (.45,-1.2,page_height(.45)+.02), (1.93,-1.2,page_height(1.93)+.02)], ink, .009)
points=[]
for i in range(50):
    x=.5+i*.026
    y=-1.05 + .91*((x-.72)**2)
    points.append((x,y,page_height(x)+.03))
line('Learning curve', points, ink, .018)
for x in [.82, 1.57]:
    y=-1.05+.91*((x-.72)**2)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=.045, location=(x,y,page_height(x)+.04))
    bpy.context.object.data.materials.append(red)
# Score and a hand-drawn circle, on the upper left page.
bpy.ops.object.text_add(location=(-1.65,.44,page_height(1.35)+.025))
score=bpy.context.object
score.name='Ten point score'
score.data.body='10'
score.data.size=.48
score.data.extrude=.001
score.data.materials.append(ink)
line('Score circle', [(-1.35+.5*math.cos(t),.66+.37*math.sin(t),page_height(-1.35+.5*math.cos(t))+.02) for t in [i*math.tau/80 for i in range(81)]], ink, .009)
# Cloth bookmark extending out of the notebook.
ribbon_points = [(0.11,1.25,.84),(.11,.15,.87),(.12,-1.64,.75),(.15,-1.95,.53),(.24,-2.1,.48)]
ribbon_mesh = bpy.data.meshes.new('Flat woven bookmark')
ribbon_mesh.from_pydata([(x+offset,y,z) for x,y,z in ribbon_points for offset in [-.065,.065]], [], [(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(ribbon_points)-1)])
ribbon = bpy.data.objects.new('Ochre bookmark', ribbon_mesh)
scene.collection.objects.link(ribbon)
ribbon.data.materials.append(gold)

# A real hexagonal pencil; all components share a tilted parent.
bpy.ops.object.empty_add(location=(2.25,-.75,.78))
pencil=bpy.context.object
pencil.name='Terracotta pencil assembly'
pencil.rotation_euler=(math.radians(87),math.radians(-5),math.radians(-22))
for name,depth,r1,r2,z,mat in [('Painted pencil',2.9,.09,.09,0,red),('Sharpened cedar',.38,.09,.015,-1.64,wood),('Graphite tip',.13,.018,0,-1.895,graphite)]:
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=r2, radius2=r1, depth=depth)
    obj=bpy.context.object
    obj.name=name
    obj.parent=pencil
    obj.location=(0,0,z)
    obj.data.materials.append(mat)

# Keep the backdrop transparent; lighting still casts shadows between the objects.
for name,loc,power,size in [('Large softbox',(-3,-4,8),650,6),('Soft fill',(4,2,6),220,5)]:
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.shape='DISK'
    data.size=size
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=loc
    obj.rotation_euler=(Vector((0,0,.4))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(5,-7.5,11.5))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,-.05,.4))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=7.3
scene.camera=camera
scene.render.filepath=sys.argv[sys.argv.index('--')+1]
bpy.ops.render.render(write_still=True)
