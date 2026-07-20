---
name: alpha3d-scenegen
description: >
  Generates AI 3D models through the Alpha3D MCP connector and imports them
  directly into the user's currently open Blender scene, scaled and placed to
  build out a described environment, prop set, or character roster. Use this
  skill whenever the user wants to populate, build, dress, furnish, or fill a
  Blender scene with new 3D assets; describes a level, room, environment, or
  list of props/characters they want created directly in their open .blend
  file; asks to "generate this into Blender", "add these models to my
  scene", "drop my existing Alpha3D models into this scene", or "build me a
  village/room/set in Blender"; or wants AI-generated meshes (or models
  already in their Alpha3D library) automatically downloaded, scaled,
  grounded, and positioned in Blender without manually exporting and
  importing each one by hand. Trigger
  this even if the user doesn't say "Alpha3D" or "MCP" by name and just
  describes what they want their scene to contain. Requires BOTH the Alpha3D
  MCP connector (generate_3d, get_job, etc.) and a Blender code-execution MCP
  connector (e.g. the BlenderMCP add-on's execute_blender_code tool) to be
  connected. If either is missing, this skill still triggers so it can walk
  the user through connecting it, rather than failing with a confusing error.
compatibility: >
  Requires an authenticated Alpha3D MCP connector and a Blender MCP bridge
  (a bpy code-execution tool) connected to a currently-running Blender
  instance. Spends real Alpha3D credits per generated asset, so this skill
  never submits a paid job without explicit user confirmation first.
---

# Alpha3D Scene Generator (for Blender)

Turns a plain-language scene or asset description into real, AI-generated 3D
models, placed and scaled correctly inside the user's currently open Blender
file. You are the orchestrator: the Alpha3D MCP connector does the AI
generation, the Blender MCP connector does the placement, and you do the
scene reasoning that ties them together, deciding what to generate, how big
it should be, and where it goes.

Three files carry the parts of this skill that are pure mechanism rather than
judgment, so you don't have to re-derive them each time:
- `references/mcp_tools.md`: verified tool contracts and the credit cost
  table for every Alpha3D MCP tool this skill uses.
- `references/blender_helpers.md`: proven Python (download, sanitize,
  import, normalize, place) to adapt inside your `execute_blender_code`
  calls. The sanitize step in particular fixes a real, previously-debugged
  Blender import failure. Don't skip it or try to reinvent it.
- `references/troubleshooting.md`: what to do when a specific thing goes
  wrong (bridge disconnected, malformed GLB, job errored, insufficient
  credits).

## Before anything else: confirm both connections are actually alive

This skill depends on two *independent* MCP connections, and either one can
be missing or can have silently dropped since it was last used (the Blender
bridge in particular is session-scoped to a running Blender instance and
does not survive Blender closing or its add-on server being stopped). Don't
assume either is up just because the tools appear in your tool list. Verify
with a cheap, free call to each:

1. **Alpha3D MCP**: call `get_credit_balance`. A real balance response means
   the connector is authenticated and live.
2. **Blender MCP bridge**: run a trivial `execute_blender_code` call, e.g.
   `result = {"blender_version": bpy.app.version_string}`. If this errors
   with a connection failure, the bridge server isn't running.

The exact tool names you call may carry a connector-specific prefix (e.g.
`mcp__<id>__generate_3d`) that varies by session. If the plain names aren't
already visible in your tool list, use your tool-search mechanism to find
them by their short name (`generate_3d`, `execute_blender_code`, etc.)
rather than assuming a fixed prefix.

If either check fails, **stop and tell the user plainly what's missing and
how to fix it** (see `references/troubleshooting.md` for exact wording).
Don't proceed partway and produce a confusing failure later.

## Step 1: Turn the description into an asset plan

First, look at what you are building into. The scene is often not empty. If
the request references existing content ("on the desk", "next to the
character", "fill the empty corner") or the scene may already have objects,
inspect it with a free `execute_blender_code` call (`summarize_scene` in
`references/blender_helpers.md`). Anchor new assets to the real coordinates
of what is already there, and keep them clear of existing geometry. Treat
the scene as an empty floor only if it actually is one.

Then build a structured plan, one entry per distinct object. For each,
decide:

- **name**: a short, descriptive label.
- **count**: how many of this exact object. If the user wants several
  identical copies ("three crates", "a row of six pillars"), plan ONE entry
  with count > 1, not N separate entries. You generate or fetch the asset
  once and duplicate it in Blender (Step 5), so nine identical crates still
  cost a single generation. Only make separate entries when the copies
  should genuinely differ ("three different cottages" is three entries).
- **source**: `generate`, `reuse`, `primitive`, or `skip`. This decision
  drives cost, so make it deliberately:
  - **`reuse`** (free): if the user refers to something they already made
    ("my dragon from last week", "the crate I generated earlier", "use my
    existing models"), find it with `search` or `list_library` and import
    it via its `fetch` download link. This spends zero credits, so always
    prefer it over regenerating an asset the user already owns.
  - **`generate`** (spends credits): reserve AI generation for objects where
    it earns its keep, like hero props, organic shapes, characters, anything
    with visual complexity or a specific look the user described.
  - **`primitive`** (free): a flat table, a simple crate, a wall, a floor
    plane: build these with ordinary `bpy` primitives instead; generating a
    cube costs 30+ credits for something `bpy.ops.mesh.primitive_cube_add()`
    does for free with an identical result.
  - **`skip`**: purely atmospheric elements (sky, fog, ambient light) aren't
    meshes at all; note them in your final report and move on.
- **prompt** (for `generate` items): a clear, specific text prompt, or an
  image URL if the user gave you a reference image.
- **quality**: `standard` (fast/cheap, no PBR, fine for a rough
  placeholder), `pbr` (full materials, the right default for anything the
  camera will actually see and that should look finished), or `low_poly`
  (real-time/game-ready). Don't default to the most expensive tier without
  a reason; ask yourself what the user actually needs it for.
- **target_size_m**: the object's largest real-world dimension in meters,
  reasoned from what it is (a house is meters tall, a coin is centimeters).
  Generated meshes come back at an arbitrary internal scale, not the real
  world size. You normalize this after import in Step 5.
- **needs_postprocess**: does this asset need `rig_3d` (a character or
  creature the user wants to animate or pose), `segment_3d` (a mechanical
  object the user wants to manipulate part-by-part), `retopologize`, or
  `uv_unwrap`? Most background/dressing props need none of these; each one
  roughly doubles that asset's cost, so only add them when the user's intent
  calls for it (e.g. "rig it so I can pose it" clearly wants `rig_3d`;
  "make a village" alone does not imply any background prop needs rigging).
- **placement**: reason out where this belongs relative to everything else
  from the description itself (and relative to any existing objects you found
  above). "Around a well" implies a circle; "along a path" implies points
  spaced along a line; an unordered list of props implies a simple grid with
  spacing derived from each item's `target_size_m` so nothing ends up
  overlapping. For a count > 1, write one coordinate per copy. Write down
  actual (x, y) coordinates now, you'll apply them in Step 5. If the
  description implies a facing (a cart "facing the well", chairs "around a
  table"), note a Z rotation too; generated meshes have no guaranteed front,
  so treat facing as best-effort and call it out in your report so the user
  can spin any that end up backwards.

Two other tools are worth reaching for while planning (both free), see
`references/mcp_tools.md` for details:
- If the user dropped a **local image** into the chat, or wants
  **multi-view-to-3D** (several angles of one object), you can't submit that
  through `generate_3d` directly. Use `open_generator` to hand them a web
  link, let them generate there, then pick the result up with `get_job` or
  `list_library` and import it like any other asset.
- `generate_image` is a quick way to lock a look before spending 3D credits:
  generate a concept image, and if the user likes it, feed its hosted URL
  into `generate_3d` image mode. Useful when a text prompt alone keeps
  missing what they want.

## Step 2: Show the plan, then STOP for explicit confirmation

This step is not optional and there is no phrasing of the user's original
request that counts as already having given this confirmation, no matter
how detailed their description was. Credits are debited the moment a job is
*submitted* (refunded automatically only if that job later fails). So a
misunderstood prompt, an unnecessarily high quality tier, or a postprocess
step the user didn't actually want is real spent money, not something an
undo button fixes.

Call `get_credit_balance`, then show the user a plan table: asset name,
source, quality, credits, any postprocess + its credits, subtotal, followed
by the grand total and the balance remaining after. Reuse, primitive, and
skip rows are free; only `generate` and postprocess rows cost credits.

If any credits will be spent, wait for an explicit go-ahead in the
conversation before calling `generate_3d` (or any other credit-spending
tool). If the whole plan happens to be free (all reuse/primitive/skip), you
can proceed once you've shown it, but still show it first so the user can
correct anything before you build.

## Step 3: Submit generation jobs, in parallel

For every `generate` asset, call `generate_3d` (or `image_to_3d`/multiview
per `references/mcp_tools.md`). There is no shared client-side state
limiting how many jobs you can have in flight (each call is independent), so
submit all of them back-to-back rather than waiting for one to finish
before starting the next. Track each returned `job_id` against its plan
entry; you'll need both together for every step from here on.

Always pass a clear, unique `title` (the asset's name from your plan). It
labels the asset in the user's library, which is what lets you recover it
later without paying again if the run gets interrupted (see the note below).

## Step 4: Poll until every job finishes

Round-robin `get_job(job_id)` across everything still pending. The tool's
own guidance is to poll every 15-30 seconds, and real generations take
minutes. This loop naturally spans several of your own turns rather than
one blocking call. That's expected; don't shorten the interval just to look
responsive, and don't give up early. For each job: `queued`/`processing`
means keep waiting; `completed` means record the download link(s);
`error` means record the failure reason and move on without blocking the
rest of the scene on it; a single failed asset should not sink the build.

**Import each asset the moment its job completes** (its Step 5 pass), while
the others keep generating. Don't wait for the whole batch to finish first:
importing as you go means the user sees the scene fill in, and one slow or
stuck job never blocks the assets that are already ready.

## Step 5: Download, sanitize, import, normalize, and place (one `execute_blender_code` call per asset)

Each asset now has a GLB download URL: for a `generate` asset it comes from
its completed `get_job`; for a `reuse` asset it comes from `fetch(id)` (those
skip Steps 3 and 4 entirely, since nothing was generated). The import is
identical either way.

Do the entire pipeline for one asset in a single call rather than several
round trips: download the GLB bytes, truncate them if Blender's strict
loader would otherwise reject them ("Bad GLB: file size doesn't match" is a
real, previously-hit failure; see why in `references/blender_helpers.md`),
write to a temp file, import, compute its bounding box, scale to
`target_size_m`, drop it to the ground plane, group it under a named Empty,
and move that Empty to the coordinates you planned in Step 1. The working
code for all of this is in `references/blender_helpers.md`. Read it and
adapt the parameters per asset rather than writing it from scratch each
time; the byte-truncation math in particular is easy to get subtly wrong if
you rederive it.

For an asset with **count > 1**, use `build_asset` (in
`references/blender_helpers.md`): it downloads the GLB once and places a
uniquely-named copy at each coordinate you planned, so the extra copies cost
no credits, and it cleans up the temp file for you. For a very large count,
`duplicate_linked` makes mesh-sharing copies that keep the scene light.

If a completed job's response includes more than one download link
(`segment_3d` splits a mesh into labeled parts, each its own GLB), import
every part under the *same* parent Empty rather than creating a separate
Empty per part. The parts are meant to be treated as one object made of
pieces, not as separate scene objects.

## Step 6: Optional post-processing pass

For any asset flagged `needs_postprocess` in Step 1, submit the relevant
tool (`rig_3d`, `segment_3d`, `retopologize`, `uv_unwrap`) against that
asset's `post_id` from its completed generation job. These can run freely
in parallel with each other and with anything still generating; they're
just more independent `job_id`s to poll the same way as Step 4. When one
completes, repeat the Step 5 import for its result.

## Step 7: Report back

Take a screenshot of the viewport so the user can see the actual result
without switching windows. Summarize what was built, what failed (with the
real reason, not a vague "something went wrong"), and the total credits
*actually* spent. Count only jobs that reached `completed`, since a failed
job auto-refunds and was never really spent. Ask if they want anything
repositioned, resized, or regenerated before considering the scene done.

## If a run gets interrupted after generating

A job that reached `completed` is already paid for and stored in the user's
Alpha3D library. If the run breaks after that (the Blender bridge drops, the
conversation resets) before you placed the asset, do NOT regenerate it, that
charges the user a second time for a model they already own. Recover it
instead: `search` or `list_library` by the `title` you set in Step 3, then
`fetch` its download link and import (Step 5). This is exactly the `reuse`
path from Step 1, and it is why every generation gets a clear, unique title.

## If something goes wrong mid-run

Check `references/troubleshooting.md` first. The three failure modes
you're most likely to hit (Blender bridge disconnecting, a malformed GLB,
insufficient credits) have already been debugged once and have a known fix
documented there. Don't rediscover them from scratch.
