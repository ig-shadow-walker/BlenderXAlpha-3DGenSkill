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

## Viewport screenshot for the final report

```python
# Use your screenshot/render tool with a size cap. An uncapped full-resolution
# screenshot can overflow the MCP response and error with something like
# "Unterminated string" rather than a clear size-limit message.
```
