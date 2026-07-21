# Provider adapter: Meshy AI

One of three provider adapters. The `SKILL.md` workflow refers to four
primitives; this maps them to Meshy's MCP tools (the official
`@meshy-ai/meshy-mcp-server`, ~24 `meshy_*` tools).

> **Verify at runtime.** The MCP tool *names* are documented, but their exact
> parameter schemas are thin wrappers over Meshy's REST API and are not fully
> published, and can change between server versions. After connecting, look at
> your actual Meshy tool list. The REST contract (`api.meshy.ai/openapi/...`)
> is the stable source of truth.

## Adapter map

| Workflow primitive | Meshy tool |
|---|---|
| **generate** (text) | `meshy_text_to_3d` (preview) then `meshy_text_to_3d_refine` (adds textures) |
| **generate** (image) | `meshy_image_to_3d`, or `meshy_multi_image_to_3d` |
| **poll** (status) | `meshy_get_task_status` |
| **download URL** (GLB) | result `model_urls.glb`, or `meshy_download_model` |
| **balance / pricing** | `meshy_check_balance` (credits); each result reports `consumed_credits` |
| **refine** | `meshy_remesh`, `meshy_retexture`, `meshy_rig`, `meshy_animate`, `meshy_uv_unwrap`, `meshy_convert` |
| **reuse** | `meshy_list_tasks` (past generations) |

## Setup

Official server: `npx -y @meshy-ai/meshy-mcp-server`, API key env
`MESHY_API_KEY` (a `msy_...` key from meshy.ai → Settings → API keys).
Connect, for Claude Code:

```bash
claude mcp add meshy -- npx -y @meshy-ai/meshy-mcp-server
# then set MESHY_API_KEY in the server's environment
```

## Async pattern

Submit, get a task `id`, poll `meshy_get_task_status` (about every 5 seconds)
until a terminal status: `PENDING` to `IN_PROGRESS` to `SUCCEEDED` /
`FAILED` / `CANCELED` (there is a `progress` 0 to 100). On `SUCCEEDED`, read
`model_urls.glb`. Preview mesh is roughly 30 seconds; a textured model is
usually under 2 minutes. Download URLs are retained about 3 days, so grab them
during the run.

## The one thing that trips people up: text is two stages

`meshy_text_to_3d` produces an **untextured preview mesh**. To get a finished,
textured model you then run `meshy_text_to_3d_refine` on that preview's task
id (a second job, more credits). So for a textured text-to-3D asset, that is
two queue steps, not one. Image-to-3D (`meshy_image_to_3d`) is single-stage
and textures by default (`should_texture` defaults true). Factor the extra
refine step into your cost estimate and the queue.

## Notes for the workflow

- **Request GLB**: pass `target_formats: ["glb"]` (add `fbx` only if you
  specifically need rigged/engine output). GLB carries PBR textures inline, so
  materials come through on import.
- **Default output is GLB, Y-up** (Blender's importer converts to Z-up
  automatically). Not real-world scale unless you pass `auto_size: true`, so
  the skill's normalize-and-ground step still applies.
- **Balance**: `meshy_check_balance` gives a live credit number, so the
  Step 2 cost gate can show a real balance for Meshy. Per-operation credit
  costs vary; treat `consumed_credits` on each result as the truth after the
  fact.
- **Polygon budget**: `target_polycount` (100 to 300,000) and
  `topology: "quad"|"triangle"` control density for game/scene use.
