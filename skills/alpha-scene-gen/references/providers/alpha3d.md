# Provider adapter: Alpha3D (the default, fully verified)

This is one of three provider adapters (see also `tripo.md`, `meshy.md`). The
main `SKILL.md` workflow is provider-agnostic and refers to four primitives;
this file maps them to Alpha3D's actual MCP tools:

| Workflow primitive | Alpha3D tool |
|---|---|
| **generate** (text or image to 3D) | `generate_3d` |
| **poll** (job status) | `get_job(job_id)` |
| **download URL** (a GLB) | in the completed `get_job` result, or `fetch(id)` for an existing asset |
| **balance / pricing** | `get_credit_balance` + `list_generation_options` (live per-op cost) |
| **refine** | `retopologize`, `uv_unwrap`, `texture_3d`, `rig_3d`, `segment_3d`, `convert_format` |
| **reuse from library** | `search`, `list_library`, then `fetch(id)` |

Alpha3D is verified directly against a live connector session and is the
richest of the three (library reuse, live pricing, concept-image-to-3D). The
rest of this file is the full tool detail.

Tool names below are the short/logical names. Your actual tool list may show
them with a connector-specific prefix (e.g.
`mcp__<connector-id>__generate_3d`). If the plain name isn't already visible,
search your available tools by the short name rather than assuming a fixed
prefix; connector IDs are not stable across sessions or users.

The three most useful facts that are easy to miss: `fetch` hands you download
links for an asset the user *already* generated (so you can import from their
library for free instead of regenerating), a `generate_image` result can be
fed straight into `generate_3d` (concept image, then 3D), and `open_generator`
is the escape hatch for anything you can't submit directly (a local image,
multi-view).

## Generation

### `generate_3d`
Generates a 3D model from a text prompt or a single reference image (URL or
base64). Image mode removes the background first by default, matching the
website. Returns a `job_id` immediately. Poll `get_job` for the result.

| Argument | Type | Notes |
|---|---|---|
| `prompt` | string | Text mode. |
| `image_url` | string (https URL) | Image mode. |
| `image_base64` | string | Image mode when you have the bytes but no URL. |
| `quality` | `"standard"` \| `"pbr"` \| `"low_poly"` | Mesh style. Default `pbr`. Cost varies by tier; get current pricing from `list_generation_options`. |
| `geometry_only` | boolean | Output a bare mesh with no textures or PBR (cheaper); the user colours it later. Overrides the texturing implied by `quality`. |
| `detail` | `"high"` \| `"ultra"` | Mesh density for standard/pbr/geometry. Default `high`. Ignored for `low_poly`. |
| `polygon_type` | `"triangle"` \| `"quad"` | Low-poly topology only (`quality="low_poly"`). Default `triangle`. |
| `face_count` | integer, 3,000-1,500,000 | Target polygon count. |
| `remove_background` | boolean | Image mode only: strip the background before generating. Default `true`. |
| `title` | string, max 100 chars | Name for the generated asset. |

Set exactly one of `prompt` / `image_url` / `image_base64` per call. There is
**no** multi-view parameter here: for multi-view-to-3D (several angles), a
local image file with no URL, or the full settings UI, use `open_generator`
instead (see below).

### `open_generator`
Returns a link to the Alpha3D web generator for the signed-in user. This is
the escape hatch for what `generate_3d` cannot take directly: a **local
image** the user dropped into chat (no URL, no base64), **multi-view-to-3D**
where they upload each angle (or auto-generate the other views from one
reference), or the **full settings UI** (quality tier, PBR on/off,
geometry-only, 3D-print, low-poly triangle/quad, polygon count). The user
generates on that page (background removal runs automatically) and the page
shows a job id; then poll `get_job` with that id, or grab the newest model
from `list_library`. Optional args: `quality`, `title` (both just prefill
the page). If you already have a single reference image as a URL or base64,
prefer `generate_3d` for a one-step flow.

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

## Image tools (free, rate-limited)

### `generate_image`
FLUX image generator (the same engine as the website). Three modes: **text**
(`prompt` only), **image** (`prompt` + `image_url` to transform an image),
and **style** (`prompt` + `reference_image_urls` to match a style, up to 4).
Options: `resolution` (`1K`/`1080p`/`2K`/`4K`/`custom`, default `1K`; `2K`
and `4K` are slower and can occasionally time out, so prefer `1K`/`1080p`),
`width`/`height` (256-4096, for `custom`), `ratio` (text mode), `seed`,
`enhance_prompt`, and `match_image_size`/`match_image_index` (image/style).
Small results come back inline; larger ones return a **hosted image URL you
can pass straight into `generate_3d` as `image_url`**. That makes it a free
way to nail a concept image first, then turn the one you like into 3D.

### `remove_background`
Strips the background from an image, returns a transparent PNG inline
(`image_url` or `image_base64` in, base64 out). `generate_3d` already
removes backgrounds on image mode by default, so you rarely need this
first; it's here for when the user wants the cutout itself.

## Library and lookup (free)

- **`list_library(page, limit, category)`**: the user's generations, newest
  first, with status and thumbnail.
- **`search(query)`**: search the user's OWN models by title, tags, or
  category. Returns matches with ids.
- **`fetch(id)`**: full details of one model, including **fresh presigned
  download links for every available format** (a `formats` list + a
  `downloads` map: GLB, FBX, OBJ, any converted formats, segmentation
  parts, thumbnail; links valid ~5 minutes). Works for the user's own
  models and for public completed models. This is how you import an asset
  the user ALREADY has without spending a credit: `search`/`list_library`
  to find it, `fetch` to get its GLB link, then import that link the same
  way you would a freshly generated one.

## Bookkeeping

- **`get_job(job_id)`**: poll every 15-30 seconds. Returns
  `queued`/`processing`/`completed`/`error`. A `completed` response
  includes fresh download link(s). Note the plural: `segment_3d` in
  particular can return multiple links, one per part.
- **`get_credit_balance()`**: no arguments. Returns plan allowance
  remaining, bonus credits, purchased credits, and `total_usable`. Call
  this before showing a cost estimate and again after a run to confirm
  what actually got spent.
- **`list_generation_options()`**: no arguments. Returns the *live*,
  authoritative per-operation cost plus each tool's required arguments. This
  is the source of truth for pricing; always call it before quoting a cost.

## Credit costs

**Do not hardcode prices.** Call `list_generation_options` for the live,
authoritative per-operation cost right before you build an estimate. The
same pricing as the Alpha3D platform applies (see the pricing page at
`https://alpha3d.io/pricing`), and it can change, so the live tool is the
only number you should quote to the user.

Free, and never needs pricing:

- `reuse` via `fetch` (importing a model the user already owns)
- Blender primitives and duplicated copies (built locally, no job runs)
- `generate_image`, `remove_background`
- `open_generator`, `search`, `list_library`, `get_job`, `get_credit_balance`

Spends credits: `generate_3d` and the refinement tools (`retopologize`,
`uv_unwrap`, `texture_3d`, `segment_3d`, `rig_3d`, `convert_format`). Get
each one's current cost from `list_generation_options`.

**Credits are debited when a job is *submitted*, and auto-refunded if that
job later fails.** When reporting what a run actually cost, count only jobs
that reached `completed`; a failed job never really cost the user anything.
