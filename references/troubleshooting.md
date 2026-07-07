# Troubleshooting

Failure modes below have each actually been hit and debugged once. Check
here before spending time re-diagnosing from scratch.

## "Cannot connect to Blender at localhost:XXXX"

The Blender MCP bridge is session-scoped to a running Blender instance and
its add-on's server has to be started manually — it does **not** persist
across Blender restarts, and can silently drop mid-session even while the
rest of your tools still work fine (this has happened in practice, not just
in theory).

**Tell the user exactly this**: "The Blender connector isn't responding.
Please make sure Blender is open and that its bridge add-on's server has
been started (usually a 'Start Server' / 'Connect' button in its panel),
then let me know." Don't retry silently more than once or two — a
connection refused error means nothing is listening, not that the call was
slow.

## "Bad GLB: file size doesn't match" (or the import silently produces nothing)

Blender's glTF importer strictly checks the GLB header's declared byte
length against the actual file size. If you skipped the sanitize step in
`references/blender_helpers.md` (`sanitize_glb_bytes`), or wrote your own
truncation logic instead of using the proven one, this is almost certainly
why. Re-download and run it through `sanitize_glb_bytes` before importing —
don't try to patch around it with a retry, the bytes are consistently the
same shape on every download of the same asset.

If the import call *succeeds but nothing new appears in the scene*: this
usually means `bpy.ops.import_scene.gltf` ran without an active 3D viewport
context in whatever code path invoked it. Make sure your `execute_blender_code`
call runs the import directly (not deferred via a timer or background
thread) — the reference helpers already do this correctly.

## `get_job` stays `queued`/`processing` far longer than expected

Real generations take real time — several minutes is normal, not a sign
something is stuck. Don't shorten your poll interval below the tool's
documented 15-30 seconds; hammering `get_job` doesn't make the job finish
faster and just burns your own turns. If a job has been `processing` for
an unusually long time (tens of minutes) mention it to the user rather than
polling forever silently.

## `get_job` returns `error`

Record the failure reason from the response and **do not block the rest of
the scene on it** — move on to the next asset and report this one as
failed at the end. Credits for a job that errors are auto-refunded, so
don't count it in your final "credits spent" tally, but do tell the user
which specific asset failed and why, so they can decide whether to retry it
with a different prompt.

## A `generate_3d` (or refinement) call is rejected for insufficient credits

This should essentially never happen if you followed Step 2 of SKILL.md and
checked `get_credit_balance` against the plan's total before submitting
anything — if it does happen anyway (e.g. a concurrent process spent
credits in between your check and your submission), stop submitting further
jobs immediately, tell the user their balance ran out partway through, and
report which assets from the plan did make it through before this
happened.

## The Alpha3D MCP connector itself seems disconnected

Unlike the Blender bridge, this is normally an authenticated, persistent
connector (not something started fresh each session) — if `get_credit_balance`
fails outright, this usually means the connector needs re-authenticating
rather than "started." Tell the user to check their connector settings
(wherever they manage MCP connectors in their Claude client) rather than
looking for a server to start.
