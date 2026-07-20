# Blender-side helpers

Adapt the code below inside your `execute_blender_code` calls. Don't
rewrite the byte-truncation math or the bounding-box normalization from
scratch each time. Everything here uses only `bpy` and the Python standard
library (`urllib`, `struct`, `tempfile`, `os`), so it needs nothing beyond
what Blender's bundled Python already has.

## Why the sanitize step exists

Blender's glTF importer is strict: it rejects a `.glb` whose actual file
size doesn't exactly match the 12-byte header's declared total length
(bytes 8-12, a little-endian uint32). Some servers pad a GLB with trailing
bytes that web viewers (three.js and friends) happily ignore but Blender's
importer refuses outright, failing with `Bad GLB: file size doesn't match`.
This is a real failure mode, already hit and fixed once. Always sanitize a
downloaded GLB before importing it; never skip this step to save a line of
code.

```python
import struct

def sanitize_glb_bytes(data: bytes) -> bytes:
    """Truncate a GLB to its header-declared length if it has trailing
    bytes Blender's strict importer would otherwise reject. Never pads,
    never touches non-GLB data; only ever shrinks."""
    if len(data) < 12 or data[0:4] != b"glTF":
        return data
    declared_length = struct.unpack_from("<I", data, 8)[0]
    if len(data) > declared_length > 0:
        return data[:declared_length]
    return data
```

## Download + write to a temp file

Blender's `import_scene.gltf` operator needs a filepath, not bytes in
memory, so download and stage to disk first. `urllib` is stdlib; no pip
install needed inside Blender's Python.

```python
import urllib.request, tempfile, os

def download_and_stage_glb(url: str, timeout: int = 180) -> str:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        data = resp.read()
    data = sanitize_glb_bytes(data)
    fd, path = tempfile.mkstemp(suffix=".glb", prefix="alpha3d_scenegen_")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    return path
```

## Import, normalize scale, drop to ground, group under a named Empty

Generated meshes come back at an arbitrary internal scale. Always
normalize to the `target_size_m` you decided during planning, not the
mesh's raw imported size. Grouping under an Empty (rather than leaving
loose objects, or worse, the glTF importer's own throwaway "world"/scene
wrapper node) keeps the scene organized and gives you one object to
position, rename, and move later.

```python
import bpy, mathutils

def import_and_place(glb_path, asset_name, target_size_m, location_xy, base_z=0.0):
    """Import glb_path, scale its largest dimension to target_size_m, drop
    it to base_z, and group everything under a new Empty named asset_name
    positioned at location_xy. Returns a small result dict for reporting."""
    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=glb_path)
    new_objs = [o for o in bpy.context.selected_objects if o.name not in before]
    if not new_objs:
        raise RuntimeError(f"Import of {glb_path} produced no new objects")

    # Combined world-space bounding box across every newly imported object.
    mins = mathutils.Vector((float("inf"),) * 3)
    maxs = mathutils.Vector((float("-inf"),) * 3)
    for o in new_objs:
        for corner in o.bound_box:
            world = o.matrix_world @ mathutils.Vector(corner)
            mins = mathutils.Vector(min(a, b) for a, b in zip(mins, world))
            maxs = mathutils.Vector(max(a, b) for a, b in zip(maxs, world))
    size = maxs - mins
    largest_dim = max(size.x, size.y, size.z, 0.0001)
    scale_factor = target_size_m / largest_dim

    parent = bpy.data.objects.new(asset_name, None)  # a plain Empty
    bpy.context.collection.objects.link(parent)

    # Re-parent every top-level new object to the Empty, preserving its
    # current world pose (parenting alone would otherwise jump it to the
    # parent's origin).
    for o in new_objs:
        if o.parent is not None and o.parent in new_objs:
            continue  # already parented within this import; leave the hierarchy intact
        world = o.matrix_world.copy()
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
        o.matrix_world = world

    ground_lift = -mins.z * scale_factor  # world Z the mesh's lowest point sits at, after scaling
    parent.scale = (scale_factor,) * 3
    parent.location = (location_xy[0], location_xy[1], base_z + ground_lift)

    return {
        "parent": parent.name,
        "objects": [o.name for o in new_objs],
        "raw_bounds_m": [size.x, size.y, size.z],
        "scale_factor": scale_factor,
    }
```

## Place one asset, or N identical copies, from one download

This is the workhorse for Step 5. It downloads the GLB **once** and imports a
copy at each `(x, y)` you pass, so "three crates" or "a row of pillars" costs
a single generation, not one per copy. It keeps names unique (`crate`,
`crate_2`, `crate_3`, so Blender never silently appends `.001`) and always
deletes the temp file, even if an import raises.

```python
def build_asset(url, base_name, target_size_m, placements):
    """Download url once, then import+place a copy at each (x, y) in
    placements (a list of at least one tuple). Extra copies re-use the
    already-downloaded file, so they cost zero credits. Returns one result
    dict per placed copy."""
    path = download_and_stage_glb(url)
    results = []
    try:
        for i, (x, y) in enumerate(placements, start=1):
            name = base_name if len(placements) == 1 else f"{base_name}_{i}"
            results.append(import_and_place(path, name, target_size_m, (x, y)))
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    return results
```

Re-importing gives each copy its own mesh data, which is fine for a handful.
For a large count (say 50 pillars) it is lighter to import once and make
mesh-linked copies that share the mesh, so only the transforms differ:

```python
def duplicate_linked(master_result, placements):
    """Given one import_and_place result, add mesh-linked copies at each
    (x, y). Copies share mesh data (light on memory) and keep the master's
    scale, rotation, and ground height. Numbering starts at _2."""
    master = bpy.data.objects[master_result["parent"]]
    children = list(master.children)
    made = []
    for i, (x, y) in enumerate(placements, start=2):
        dup = bpy.data.objects.new(f"{master.name}_{i}", None)
        bpy.context.collection.objects.link(dup)
        dup.scale = master.scale
        dup.rotation_euler = master.rotation_euler
        dup.location = (x, y, master.location.z)
        for child in children:
            c = child.copy()  # shares child.data (the mesh) -> linked copy
            bpy.context.collection.objects.link(c)
            c.parent = dup
            c.matrix_parent_inverse = child.matrix_parent_inverse.copy()
            c.matrix_basis = child.matrix_basis.copy()
        made.append(dup.name)
    return made
```

## Multi-part assets (e.g. a completed `segment_3d` job)

When a completed job returns more than one download link, import every
part under the *same* parent Empty instead of calling `import_and_place`
independently for each (that would create a separate Empty per part, which
defeats the point of segmentation; the parts are meant to be treated as
one object made of pieces):

```python
def import_parts_and_place(glb_urls, asset_name, target_size_m, location_xy, base_z=0.0):
    parent = bpy.data.objects.new(asset_name, None)
    bpy.context.collection.objects.link(parent)
    all_mins = mathutils.Vector((float("inf"),) * 3)
    all_maxs = mathutils.Vector((float("-inf"),) * 3)
    part_objects = []

    for url in glb_urls:
        path = download_and_stage_glb(url)
        before = {o.name for o in bpy.data.objects}
        bpy.ops.import_scene.gltf(filepath=path)
        new_objs = [o for o in bpy.context.selected_objects if o.name not in before]
        for o in new_objs:
            for corner in o.bound_box:
                world = o.matrix_world @ mathutils.Vector(corner)
                all_mins = mathutils.Vector(min(a, b) for a, b in zip(all_mins, world))
                all_maxs = mathutils.Vector(max(a, b) for a, b in zip(all_maxs, world))
        part_objects.extend(new_objs)
        try:
            os.remove(path)
        except OSError:
            pass

    size = all_maxs - all_mins
    scale_factor = target_size_m / max(size.x, size.y, size.z, 0.0001)
    for o in part_objects:
        world = o.matrix_world.copy()
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
        o.matrix_world = world

    ground_lift = -all_mins.z * scale_factor
    parent.scale = (scale_factor,) * 3
    parent.location = (location_xy[0], location_xy[1], base_z + ground_lift)
    return {"parent": parent.name, "part_count": len(part_objects)}
```

## Preflight check

Run this as your very first `execute_blender_code` call in any session.
It's free, fast, and tells you immediately whether the bridge is actually
alive rather than failing confusingly deeper into the plan:

```python
import bpy
result = {"blender_version": bpy.app.version_string, "scene_objects": len(bpy.data.objects)}
```

## Read the existing scene before placing

The scene is often NOT empty. When the request references existing content
("on the desk", "next to the character", "fill the rest of the room"), you
need the real coordinates of what's already there, not an assumed empty
floor. This returns every existing object with its world-space bounds plus
the 3D cursor, so you can anchor new assets to real geometry and avoid
dropping them inside what's already present.

```python
import bpy, mathutils

def summarize_scene():
    """Existing objects with world-space bounds (meshes) or location
    (empties), plus the 3D cursor. Skips cameras and lights."""
    items = []
    for o in bpy.data.objects:
        if o.type in {"CAMERA", "LIGHT"}:
            continue
        if o.type == "EMPTY" or not len(o.bound_box):
            items.append({"name": o.name, "type": o.type,
                          "location": list(o.matrix_world.translation)})
            continue
        corners = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        xs = [v.x for v in corners]; ys = [v.y for v in corners]; zs = [v.z for v in corners]
        items.append({"name": o.name, "type": o.type,
                      "min": [min(xs), min(ys), min(zs)],
                      "max": [max(xs), max(ys), max(zs)]})
    return {"objects": items, "cursor": list(bpy.context.scene.cursor.location)}

result = summarize_scene()
```

## Seeing the scene (visual understanding and verification)

Object bounds tell you where things are; an actual image tells you whether
the scene looks right, whether a model faces the wrong way, sits in the
floor, floats, or intersects a neighbor. There are two ways to get one, in
order of preference:

1. **A native screenshot tool on your bridge**, if it has one (BlenderMCP
   exposes `get_viewport_screenshot`; other bridges may have an equivalent).
   It returns the current viewport image inline, so you see it directly. Ask
   for a size cap / lower resolution if offered: an uncapped full-resolution
   image can overflow the MCP response and error with something like
   "Unterminated string" rather than a clear size message.
2. **Render to a local PNG and read that file.** Works with any bridge, since
   you (the agent) run on the same machine as Blender and can open the file.
   The helper below renders a framed 3/4 view with Workbench (fast, no lights
   to set up), restores every setting it touched, and cleans up its camera.

```python
import bpy, mathutils

def render_scene(path, resolution=768):
    """Render all mesh objects to a PNG at `path` from a 3/4 view so the
    agent can look at the result. Returns path. Read the file afterward with
    your normal image-viewing capability."""
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == "MESH"]
    mins = mathutils.Vector((float("inf"),) * 3)
    maxs = mathutils.Vector((float("-inf"),) * 3)
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            mins = mathutils.Vector(min(a, b) for a, b in zip(mins, w))
            maxs = mathutils.Vector(max(a, b) for a, b in zip(maxs, w))
    if not meshes:
        mins, maxs = mathutils.Vector((-1, -1, 0)), mathutils.Vector((1, 1, 1))
    center = (mins + maxs) / 2
    radius = max((maxs - mins).length / 2, 1.0)

    cam_data = bpy.data.cameras.new("alpha3d_view_cam")
    cam = bpy.data.objects.new("alpha3d_view_cam", cam_data)
    scene.collection.objects.link(cam)
    d = radius * 2.6
    cam.location = center + mathutils.Vector((d * 0.7, -d * 0.7, d * 0.6))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

    prev = (scene.camera, scene.render.engine, scene.render.resolution_x,
            scene.render.resolution_y, scene.render.filepath,
            scene.render.image_settings.file_format)
    try:
        scene.camera = cam
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.render.resolution_x = scene.render.resolution_y = resolution
        scene.render.image_settings.file_format = "PNG"
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
    finally:
        (scene.camera, scene.render.engine, scene.render.resolution_x,
         scene.render.resolution_y, scene.render.filepath,
         scene.render.image_settings.file_format) = prev
        bpy.data.objects.remove(cam, do_unlink=True)
        bpy.data.cameras.remove(cam_data)
    return path

result = render_scene("/tmp/alpha3d_scene_view.png")
```
