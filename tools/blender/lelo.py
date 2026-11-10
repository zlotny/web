import math
import sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "//lelo.glb"
PREVIEW = argv[1] if len(argv) > 1 else None

GREY = (0.42, 0.44, 0.47)
BACK = (0.31, 0.33, 0.36)
BELLY = (0.5, 0.51, 0.53)
YELLOW = (0.97, 0.87, 0.3)
CREAM = (0.93, 0.9, 0.68)
ORANGE = (0.95, 0.4, 0.12)
BEAK = (0.6, 0.57, 0.55)
EYE = (0.02, 0.02, 0.03)
WHITE = (0.96, 0.95, 0.9)
FLIGHT = (0.2, 0.21, 0.24)
FLIGHT_TIP = (0.13, 0.14, 0.16)
CREST_TIP = (0.72, 0.68, 0.36)
FOOT = (0.62, 0.5, 0.48)

BONES = [
    "body",
    "head",
    "crest",
    "tail",
    "wing_upper.L",
    "wing_fore.L",
    "wing_hand.L",
    "wing_upper.R",
    "wing_fore.R",
    "wing_hand.R",
]

X = Vector((1, 0, 0))
Z = Vector((0, 0, 1))


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def smooth(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def catmull(values, t):
    n = len(values) - 1
    f = t * n
    i = min(n - 1, int(f))
    u = f - i
    p0 = values[max(0, i - 1)]
    p1 = values[i]
    p2 = values[i + 1]
    p3 = values[min(n, i + 2)]
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.color = self.bm.verts.layers.float_color.new("Col")
        self.deform = self.bm.verts.layers.deform.verify()

    def vert(self, co, color, weights):
        v = self.bm.verts.new(co)
        v[self.color] = (*color, 1.0)
        total = sum(weights.values())
        for bone, w in weights.items():
            if w > 0:
                v[self.deform][BONES.index(bone)] = w / total
        return v

    def face(self, verts, flip=False):
        unique = []
        for v in verts:
            if v not in unique:
                unique.append(v)
        if len(unique) < 3:
            return
        try:
            self.bm.faces.new(list(reversed(unique)) if flip else unique)
        except ValueError:
            pass

    def loft(self, rings, segments, color_fn, weight_fn, cap_start=True, cap_end=True, flip=False):
        rows = []
        for center, u, v, ru, rv in rings:
            row = []
            for s in range(segments):
                a = 2 * math.pi * s / segments
                co = center + u * (math.cos(a) * ru) + v * (math.sin(a) * rv)
                row.append(self.vert(co, color_fn(co), weight_fn(co)))
            rows.append(row)
        for r in range(len(rows) - 1):
            for s in range(segments):
                n = (s + 1) % segments
                self.face([rows[r][s], rows[r][n], rows[r + 1][n], rows[r + 1][s]], flip)
        for index, enabled in ((0, cap_start), (-1, cap_end)):
            if not enabled:
                continue
            center = rings[index][0]
            tip = self.vert(center, color_fn(center), weight_fn(center))
            row = rows[index]
            for s in range(segments):
                n = (s + 1) % segments
                self.face([tip, row[n], row[s]] if index == 0 else [tip, row[s], row[n]], flip)
        return rows

    def feather(self, root, direction, length, width, up, color_fn, weights, mirror=False, droop=0.0):
        direction = direction.normalized()
        side = direction.cross(up).normalized()
        steps = 6
        rows = []
        for i in range(steps + 1):
            t = i / steps
            taper = (0.55 + 0.45 * min(1.0, t / 0.45)) * math.sqrt(max(0.0, 1 - max(0.0, (t - 0.7) / 0.3) ** 2))
            center = root + direction * (length * t) - up * (droop * t * t)
            half = max(width * taper, 0.0006)
            row = []
            for k, offset in enumerate((-1, 0, 1)):
                co = center + side * (half * offset) + up * (0.0035 * (1 - abs(offset)) * math.sin(math.pi * min(1, t * 1.2)))
                row.append(self.vert(co, color_fn(t, offset), weights))
            rows.append(row)
        for i in range(steps):
            for k in range(2):
                self.face([rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]], mirror)


def body_rings():
    keys = [
        (-0.474, 0.048, 0.016, 0.02),
        (-0.458, 0.053, 0.046, 0.052),
        (-0.425, 0.061, 0.068, 0.076),
        (-0.388, 0.063, 0.075, 0.082),
        (-0.35, 0.054, 0.071, 0.075),
        (-0.312, 0.038, 0.065, 0.066),
        (-0.265, 0.017, 0.078, 0.077),
        (-0.205, 0.002, 0.094, 0.09),
        (-0.125, -0.004, 0.101, 0.096),
        (-0.045, -0.004, 0.097, 0.09),
        (0.035, 0.001, 0.082, 0.074),
        (0.105, 0.008, 0.06, 0.052),
        (0.165, 0.014, 0.038, 0.03),
        (0.215, 0.018, 0.016, 0.012),
    ]
    count = 84
    rings = []
    for i in range(count + 1):
        t = i / count
        y, z, rx, rz = (catmull([k[c] for k in keys], t) for c in range(4))
        rings.append((Vector((0, y, z)), X, Z, max(rx, 0.004), max(rz, 0.004)))
    return rings


def body_color(co):
    side = abs(co.x)
    top = smooth(-0.03, 0.06, co.z - 0.01)
    grey = mix(BELLY, mix(GREY, BACK, smooth(-0.2, 0.1, co.y)), top)
    head = 1 - smooth(-0.335, -0.3, co.y)
    nape = smooth(-0.4, -0.33, co.y) * smooth(0.075, 0.115, co.z)
    yellow_mask = head * (1 - nape * 0.9)
    throat = smooth(-0.35, -0.29, co.y)
    yellow = mix(YELLOW, CREAM, throat * 0.8)
    color = mix(grey, yellow, yellow_mask)
    cheek = Vector((side, co.y, co.z)) - Vector((0.066, -0.372, 0.04))
    cheek_mask = 1 - smooth(0.022, 0.034, math.sqrt(cheek.y**2 + (cheek.z * 1.05) ** 2))
    if side > 0.03:
        color = mix(color, ORANGE, cheek_mask)
    return color


def body_weight(co):
    head = 1 - smooth(-0.335, -0.265, co.y)
    tail = smooth(0.1, 0.2, co.y)
    return {"head": head, "tail": tail, "body": max(0.0, 1 - head - tail)}


def curve_rings(points, radii, flatten=1.0):
    rings = []
    for i, p in enumerate(points):
        a = points[max(0, i - 1)]
        b = points[min(len(points) - 1, i + 1)]
        tangent = (b - a).normalized()
        v = tangent.cross(X).normalized()
        rings.append((p, X, v, radii[i], radii[i] * flatten))
    return rings


def build_beak(b):
    points = []
    radii = []
    steps = 14
    for i in range(steps + 1):
        t = i / steps
        angle = t * 1.5
        points.append(Vector((0, -0.46 - math.sin(angle) * 0.034, 0.052 - (1 - math.cos(angle)) * 0.034)))
        radii.append(0.02 * (1 - t) ** 0.7 + 0.0005)

    def horn(co):
        return mix(BEAK, (0.42, 0.4, 0.4), smooth(0.03, -0.005, co.z))

    b.loft(curve_rings(points, radii, 1.12), 16, horn, lambda co: {"head": 1}, cap_start=False)
    lower = [Vector((0, -0.455 - 0.02 * t, 0.027 - 0.007 * t * t)) for t in (0, 0.25, 0.5, 0.75, 1)]
    b.loft(curve_rings(lower, [0.017, 0.016, 0.013, 0.008, 0.001], 0.62), 12, lambda co: (0.45, 0.43, 0.42), lambda co: {"head": 1}, cap_start=False)
    for sign in (1, -1):
        center = Vector((0.0075 * sign, -0.472, 0.0615))
        rings = [(center + Z * o, X, Vector((0, 1, 0)), r, r) for o, r in ((-0.0016, 0.0014), (0.0, 0.0024), (0.0016, 0.0014))]
        b.loft(rings, 6, lambda co: (0.3, 0.27, 0.27), lambda co: {"head": 1})


def build_eyes(b):
    for sign in (1, -1):
        center = Vector((0.064 * sign, -0.418, 0.079))
        rings = []
        for i in range(1, 6):
            a = math.pi * i / 6
            rings.append((center + X * (sign * math.cos(a) * 0.0125), Vector((0, 1, 0)), Z, math.sin(a) * 0.0125, math.sin(a) * 0.0125))
        b.loft(rings, 10, lambda co: EYE, lambda co: {"head": 1}, flip=sign < 0)
        glint = center + Vector((0.011 * sign, -0.004, 0.005))
        rings = [(glint + X * (sign * o), Vector((0, 1, 0)), Z, r, r) for o, r in ((-0.002, 0.0022), (0.0, 0.003), (0.002, 0.0022))]
        b.loft(rings, 6, lambda co: (1, 1, 1), lambda co: {"head": 1}, flip=sign < 0)


def build_crest(b):
    feathers = [
        (-0.432, 0.126, 0.13, 0.95, 0.0),
        (-0.42, 0.134, 0.17, 0.85, 0.012),
        (-0.408, 0.139, 0.21, 0.78, -0.012),
        (-0.396, 0.142, 0.235, 0.7, 0.008),
        (-0.384, 0.143, 0.215, 0.62, -0.008),
        (-0.372, 0.141, 0.18, 0.55, 0.0),
    ]
    for y, z, length, lift, x in feathers:
        points = []
        radii = []
        steps = 9
        for i in range(steps + 1):
            t = i / steps
            back = length * t * (1 - 0.25 * t)
            up = length * (lift * 0.42 * t + 0.42 * t**3)
            forward_curl = length * 0.16 * max(0.0, t - 0.7) ** 2 * 6
            points.append(Vector((x * (1 + t), y + back - forward_curl, z - 0.012 + up)))
            radii.append(0.0085 * (1 - t) ** 0.6 * (0.6 + 0.4 * min(1, t * 6)) + 0.0006)
        tip_at = points[-1].z

        def color(co, base=z, tip=tip_at):
            return mix(YELLOW, CREST_TIP, smooth(0.45, 1.0, (co.z - base) / max(1e-5, tip - base)))

        def weight(co, base=z):
            return {"crest": smooth(0.0, 0.03, co.z - base + 0.012), "head": 1 - smooth(0.0, 0.03, co.z - base + 0.012)}

        b.loft(curve_rings(points, radii, 0.55), 6, color, weight, cap_start=False)


WING = {
    "S": Vector((0.068, -0.2, 0.052)),
    "E": Vector((0.185, -0.166, 0.058)),
    "W": Vector((0.335, -0.216, 0.056)),
    "T": Vector((0.665, -0.122, 0.05)),
}


def wing_point(s):
    s0, e, w, t = WING["S"], WING["E"], WING["W"], WING["T"]
    if s < 0.22:
        return s0.lerp(e, s / 0.22)
    if s < 0.5:
        return e.lerp(w, (s - 0.22) / 0.28)
    return w.lerp(t, (s - 0.5) / 0.5)


def wing_weights(s):
    upper = 1 - smooth(0.16, 0.28, s)
    hand = smooth(0.44, 0.56, s)
    fore = max(0.0, 1 - upper - hand)
    return upper, fore, hand


def wing_direction(s):
    if s < 0.5:
        angle = math.radians(84 - 26 * (s / 0.5))
    else:
        angle = math.radians(58 - 46 * ((s - 0.5) / 0.5) ** 0.85)
    return Vector((math.cos(angle), math.sin(angle), 0))


def wing_length(s):
    if s < 0.5:
        return 0.15 + 0.045 * (s / 0.5)
    u = (s - 0.5) / 0.5
    return 0.2 + 0.095 * math.sin(math.pi * min(1.0, u * 0.9) * 0.8) - 0.07 * u**3


def build_wing(b, sign):
    suffix = ".L" if sign > 0 else ".R"
    mirror = sign < 0

    def place(co):
        return Vector((co.x * sign, co.y, co.z))

    def weights(s):
        upper, fore, hand = wing_weights(s)
        return {"wing_upper" + suffix: upper, "wing_fore" + suffix: fore, "wing_hand" + suffix: hand}

    count = 30
    for i in range(count):
        s = 0.06 + 0.92 * (i / (count - 1))
        direction = wing_direction(s)
        root = wing_point(s) + direction * 0.012 + Z * (-0.004 - 0.001 * i)
        length = wing_length(s)
        width = 0.026 if s < 0.5 else 0.021
        white = (1 - smooth(0.42, 0.52, s)) * smooth(0.02, 0.1, s)

        def color(t, offset, white=white, s=s):
            base = mix(FLIGHT, WHITE, white * (1 - smooth(0.3, 0.5, t)))
            return mix(base, FLIGHT_TIP, smooth(0.6, 1.0, t) * 0.8)

        b.feather(place(root), place(direction), length, width, Z, color, weights(s), mirror=not mirror, droop=0.012)

    stations = 22
    depth_rows = [-0.1, 0.0, 0.3, 0.62, 1.0]
    grid = []
    for i in range(stations + 1):
        s = i / stations
        lead = wing_point(s)
        direction = wing_direction(s)
        depth = (0.085 - 0.03 * smooth(0.4, 0.7, s)) * (1 - smooth(0.82, 1.0, s) * 0.85) * (0.55 + 0.45 * smooth(0.0, 0.12, s))
        row = []
        for k, d in enumerate(depth_rows):
            bulge = 0.011 * math.sin(math.pi * min(1.0, max(0.0, d) * 0.9 + 0.12)) * (1 - 0.6 * s)
            drop = -0.008 if d < 0 else 0.0
            co = lead + direction * (depth * d) + Z * (0.004 + bulge + drop)
            bar = (1 - smooth(0.44, 0.52, s)) * smooth(0.04, 0.12, s) * smooth(0.2, 0.45, d)
            edge = mix(BACK, GREY, smooth(0.0, 0.3, d))
            color = mix(mix(edge, FLIGHT, smooth(0.5, 0.62, s)), WHITE, bar)
            row.append(b.vert(place(co), color, weights(s)))
        grid.append(row)
    for i in range(stations):
        for k in range(len(depth_rows) - 1):
            b.face([grid[i][k], grid[i][k + 1], grid[i + 1][k + 1], grid[i + 1][k]], mirror)


def build_tail(b):
    feathers = 9
    for i in range(feathers):
        u = i / (feathers - 1) * 2 - 1
        angle = math.radians(u * 13)
        direction = Vector((math.sin(angle), math.cos(angle), -0.02))
        length = 0.47 - 0.2 * abs(u) ** 1.3
        root = Vector((u * 0.02, 0.15, 0.016 - abs(u) * 0.006 + (0.002 if i % 2 else 0)))

        def color(t, offset, u=u):
            base = mix(BACK, FLIGHT, smooth(0.0, 0.35, t))
            return mix(base, FLIGHT_TIP, smooth(0.55, 1.0, t))

        b.feather(root, direction, length, 0.019 - 0.004 * abs(u), Z, color, {"tail": 1}, mirror=True, droop=0.01)


def build_feet(b):
    for sign in (1, -1):
        points = [Vector((0.03 * sign, 0.02 + 0.03 * t, -0.078 - 0.006 * math.sin(math.pi * t))) for t in (0, 0.33, 0.66, 1)]
        b.loft(curve_rings(points, [0.011, 0.014, 0.012, 0.004], 0.7), 6, lambda co: FOOT, lambda co: {"body": 1})


def build_armature():
    data = bpy.data.armatures.new("LeloRig")
    obj = bpy.data.objects.new("LeloRig", data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    spec = {
        "body": ((0, 0.1, 0.0), (0, -0.28, 0.02), None),
        "head": ((0, -0.3, 0.035), (0, -0.46, 0.06), "body"),
        "crest": ((0, -0.4, 0.13), (0, -0.3, 0.26), "head"),
        "tail": ((0, 0.14, 0.014), (0, 0.5, 0.01), "body"),
    }
    for sign, suffix in ((1, ".L"), (-1, ".R")):
        s, e, w, t = (Vector((WING[k].x * sign, WING[k].y, WING[k].z)) for k in "SEWT")
        spec["wing_upper" + suffix] = (s, e, "body")
        spec["wing_fore" + suffix] = (e, w, "wing_upper" + suffix)
        spec["wing_hand" + suffix] = (w, t, "wing_fore" + suffix)
    for name in BONES:
        head, tail, parent = spec[name]
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.roll = 0
        if parent:
            bone.parent = data.edit_bones[parent]
    for bone in data.edit_bones:
        if bone.name.startswith("wing"):
            bone.align_roll(Z)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    b = Builder()
    b.loft(body_rings(), 40, body_color, body_weight)
    build_beak(b)
    build_eyes(b)
    build_crest(b)
    build_wing(b, 1)
    build_wing(b, -1)
    build_tail(b)
    build_feet(b)

    mesh = bpy.data.meshes.new("Lelo")
    obj = bpy.data.objects.new("Lelo", mesh)
    bpy.context.scene.collection.objects.link(obj)
    for name in BONES:
        obj.vertex_groups.new(name=name)
    bmesh.ops.recalc_face_normals(b.bm, faces=[f for f in b.bm.faces if len(f.verts) > 0 and abs(f.calc_center_median().z) > 1])
    b.bm.to_mesh(mesh)
    b.bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.color_attributes.active_color = mesh.color_attributes["Col"]
    mesh.color_attributes.render_color_index = 0

    material = bpy.data.materials.new("LeloPaint")
    tree = material.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    attr = tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    gamma = tree.nodes.new("ShaderNodeGamma")
    gamma.inputs["Gamma"].default_value = 2.2
    tree.links.new(attr.outputs["Color"], gamma.inputs["Color"])
    tree.links.new(gamma.outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = 0.9
    material.use_backface_culling = False
    mesh.materials.append(material)

    rig = build_armature()
    obj.parent = rig
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig

    stats = {"verts": len(mesh.vertices), "tris": sum(len(p.vertices) - 2 for p in mesh.polygons)}

    out_path = bpy.path.abspath(OUT)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=False,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_materials="EXPORT",
        export_normals=True,
        export_tangents=False,
        export_texcoords=False,
    )

    if PREVIEW:
        render_previews(obj, PREVIEW)
    print("@@JSON@@", stats, out_path)


def render_previews(obj, path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 700
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("W")
    scene.world = world
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.7, 0.9, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.1
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(140))
    scene.collection.objects.link(sun)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    target = Vector((0, 0.02, 0.03))
    views = {
        "top": (0.0, -0.001, 2.3),
        "side": (2.3, 0.0, 0.25),
        "front": (0.9, -2.0, 0.6),
        "back": (-1.0, 1.9, 0.9),
        "head": (0.75, -0.95, 0.3),
        "beak": (1.2, -0.5, 0.06),
    }
    for name, position in views.items():
        cam.location = position
        aim = Vector((0, -0.38, 0.08)) if name == "head" else Vector((0, -0.46, 0.05)) if name == "beak" else target
        cam_data.lens = 150 if name == "head" else 260 if name == "beak" else 70
        direction = aim - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"{path}-{name}.png"
        bpy.ops.render.render(write_still=True)


main()
