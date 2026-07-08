# Alpha3D MCP tool reference

Verified directly against a live connector session. Tool names below are
the short/logical names. Your actual tool list may show them with a
connector-specific prefix (e.g. `mcp__<connector-id>__generate_3d`). If the
plain name isn't already visible, search your available tools by the short
name rather than assuming a fixed prefix; connector IDs are not stable
across sessions or users.

## Generation

### `generate_3d`
Generates a 3D model from a text prompt, a single reference image URL, or
2-3 multi-view images. Returns a `job_id` immediately. Poll `get_job` for
the result.

| Argument | Type | Notes |
|---|---|---|
| `prompt` | string | Text mode. |
| `image_url` | string (https URL) | Image mode. |
| `multi_view_images` | array of `{view: "left"\|"right"\|"back", image_url}` | Multiview mode, max 3. |
| `quality` | `"standard"` \| `"pbr"` \| `"low_poly"` | Default `pbr`. See cost table below. |
| `face_count` | integer, 3,000-1,500,000 | Target polygon count. |
| `title` | string, max 100 chars | Name for the generated asset. |

Exactly one of `prompt` / `image_url` / `multi_view_images` should be set
per call.

## Refinement (all take an existing asset)

Each of these operates on either a completed generation (`post_id`) or an
arbitrary GLB you already have a URL/key for (`model_url`). All return a
`job_id`. Poll `get_job` the same way as generation.

| Tool | Purpose | Extra arguments |
|---|---|---|
| `retopologize` | Rebuild into clean, animation-friendly topology | `detail` (`high`\|`medium`\|`low`), `polygon_type` (`triangle`\|`quadrilateral`) |
| `uv_unwrap` | Generate clean UV maps | None |
| `texture_3d` | Re-texture from a prompt or reference image | `prompt` or `image_url` (one required) |
| `rig_3d` | Auto-rig a humanoid mesh in a T-pose (armature + skin weights) | None |
| `segment_3d` | Split into labeled semantic parts, each its own GLB | None |
| `convert_format` | Convert to a different file format | `target_format` (`"GLB"`\|`"FBX"`\|`"OBJ"`\|`"STL"`, required) |

## Free tools (no credits, rate-limited)

- `generate_image`: text-to-image.
- `remove_background`: strips the background from an image, returns a
  transparent PNG inline (`image_url` or `image_base64` in, base64 out).

## Bookkeeping

- **`get_job(job_id)`**: poll every 15-30 seconds. Returns
  `queued`/`processing`/`completed`/`error`. A `completed` response
  includes fresh download link(s). Note the plural: `segment_3d` in
  particular can return multiple links, one per part.
- **`get_credit_balance()`**: no arguments. Returns plan allowance
  remaining, bonus credits, purchased credits, and `total_usable`. Call
  this before showing a cost estimate and again after a run to confirm
  what actually got spent.
- **`list_generation_options()`**: no arguments. Returns the *live*
  authoritative cost table plus each tool's required arguments; prefer
  calling this fresh over trusting the numbers below if they might have
  changed.
- **`list_library(page, limit, category)`**: the user's past generations,
  newest first.
- **`search`** / **`fetch`**: general lookup/retrieval tools; not central
  to the generate-and-place flow but available if the user wants to search
  their existing Alpha3D library instead of generating something new.

## Credit costs (verified via `list_generation_options`; reconfirm if in doubt)

| Operation | Cost |
|---|---|
| `generate_3d` (any mode) | 30 credits (standard) / 42 (pbr) / 48 (low_poly) |
| `retopologize` | 60 |
| `uv_unwrap` | 12 |
| `texture_3d` | 54 (FBX target) / 61 (GLB, auto-converts) |
| `segment_3d` | 54 (FBX target) / 61 (GLB, auto-converts) |
| `rig_3d` | 15 (FBX/OBJ) / 27 (GLB, auto-converts) |
| `convert_format` | 12 |
| `generate_image` / `remove_background` | free |

**Credits are debited when a job is *submitted*, and auto-refunded if that
job later fails.** When reporting what a run actually cost, count only jobs
that reached `completed`; a failed job never really cost the user
anything.
