# Provider adapter: Tripo AI (Tripo3D)

One of three provider adapters. The `SKILL.md` workflow refers to four
primitives; this maps them to Tripo's MCP tools.

> **Verify at runtime.** Two Tripo MCP servers exist and their tool names
> differ, and the community server's exact parameter names are not
> authoritatively published. After connecting, look at your actual Tripo tool
> list and match it to the primitives below. The underlying REST contract
> (`api.tripo3d.ai/v2/openapi/task`) is the stable source of truth if a tool's
> shape is unclear.

## Adapter map

| Workflow primitive | Tripo tool (community server) | Tripo tool (official server) |
|---|---|---|
| **generate** (text) | `text_to_3d` | `create_3d_model_from_text` |
| **generate** (image) | `image_to_3d` (also `multiview_to_3d`) | `create_3d_model_from_image` |
| **poll** (status) | `get_task_status` | `get_task_status` |
| **download URL** (GLB) | in `get_task_status`: `model` / `pbr_model` / `base_model` | in `get_task_status`: `model_url` / `pbr_model_url` / `base_model_url` |
| **balance / pricing** | none (no MCP balance tool) | none |
| **refine** | `refine_model`, `texture_model`, `rig_model`, `convert_model`, `stylize_model` | none (generate + status only) |
| **reuse** | `get_task_status` by a known task id (no library list) | same |

## Which server

- **Community `pasie15/tripo-ai-mcp-server`** (recommended for this skill):
  `npx -y tripo-ai-mcp-server`, API key env `TRIPO_API_SECRET`. Covers the
  whole pipeline (12 tools).
- **Official `VAST-AI-Research/tripo-mcp`**: `uvx tripo-mcp`, env
  `TRIPO_API_KEY`. Alpha, minimal. It also tries to import into Blender itself
  over a socket, which overlaps with this skill's own import step, so use only
  its generate/status tools and let this skill do the placing.

Get an API key (`tsk_...`) from the console at
[platform.tripo3d.ai](https://platform.tripo3d.ai). Connect, for Claude Code:

```bash
# community server
claude mcp add tripo -- npx -y tripo-ai-mcp-server
# then set TRIPO_API_SECRET in the server's environment
```

## Async pattern

Submit a generate task, get a `task_id`, poll `get_task_status(task_id)` every
few seconds until a terminal status. Status values: `queued`, `running`,
`success`, `failed`, `cancelled`, `banned`, `expired`. On `success`, read the
GLB URL from the output (`model` / `pbr_model`). Jobs typically take 10 to 120
seconds. Output URLs are time-limited, so download promptly.

## Notes for the workflow

- **Default output is GLB**, importable directly. Not real-world scale, so the
  skill's normalize-and-ground step still applies. Use `face_limit` (and
  `quad`) to control polygon budget for game/scene use.
- **No live balance via MCP.** Tell the user you can't show a running credit
  number for Tripo and to watch their Tripo console; still confirm the plan
  before generating. Costs are credit-based and version-dependent (see the
  Tripo pricing page).
- **Local image with no URL / multi-view / auto-generated views**: the
  community server has `multiview_to_3d` and `upload_file` (returns a reusable
  token). If your connected server lacks these, ask the user for image URLs or
  fall back to the Alpha3D provider for that asset.
- **Other formats** (FBX/OBJ/USDZ) come from a `convert_model` task, not the
  base generation.
