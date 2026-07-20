<div align="center">

# Alpha3D Scene Generator for Blender

**Describe a scene in plain English. Your AI agent generates the 3D models with Alpha3D and builds it in your open Blender file, scaled, grounded, and placed.**

An [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) for [Claude Code](https://claude.com/claude-code), also usable in Cursor and OpenAI Codex, that connects [Alpha3D](https://alpha3d.io) AI 3D generation to a running Blender session.

<!-- Badges: replace OWNER/REPO once topics + license are set on GitHub -->
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Agent Skill](https://img.shields.io/badge/Anthropic-Agent%20Skill-6C4BF6.svg)
![Blender](https://img.shields.io/badge/Blender-4.x%20%7C%205.x-orange.svg)

**Works with**
&nbsp;![Claude Code](https://img.shields.io/badge/Claude%20Code-6C4BF6)
&nbsp;![Cursor](https://img.shields.io/badge/Cursor-111111)
&nbsp;![Codex](https://img.shields.io/badge/Codex-10a37f)

<br/>

<!--
  DEMO PLACEHOLDER. Record a 10-20s screen capture of a real scene build
  (see assets/README.md for the spec), save it as assets/demo.gif, then
  replace the italic line below with:
  ![Alpha3D Scene Generator demo](assets/demo.gif)
-->
_Demo video coming soon._

</div>

---

You say:

> *"I've got Blender open on an empty scene. Build me a small fantasy village: a stone well in the center, three different cottages around it, and a wooden cart by the entrance."*

Your agent breaks that into individual assets, shows you exactly what each one costs in Alpha3D credits, waits for your go-ahead, then generates them one at a time, importing each into your live Blender file as it finishes, scaled to a sensible real-world size, dropped to the floor, and arranged into the layout you described. No manual export, download, or import.

## Contents

- [What it can build](#what-it-can-build)
- [Capabilities](#capabilities)
- [How it works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation](#installation) (Claude Code, Cursor, Codex)
- [Usage](#usage)
- [Cost](#cost)
- [Repo layout](#repo-layout)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## What it can build

Point it at your open Blender file and describe what you want in it:

- **A game level or environment:** set pieces, terrain dressing, scattered props.
- **A product or interior scene:** furniture, fixtures, and decor arranged in a room.
- **A character or creature:** generated, and optionally rigged so you can pose it.
- **A tabletop set or diorama:** a themed collection of small props laid out together.
- **Props into a scene you already have:** "add a lamp on my desk", dropped onto the real desk.

You stay in the loop: it always plans and prices the work first, and never spends a credit without your say-so.

## Capabilities

| Capability | What you get |
|---|---|
| **Text, image, or multi-view to 3D** | Generate a model from a prompt, a reference image, or several angles of one object. |
| **Reuse your library, for free** | Refer to a model you already made ("my dragon from last week") and it imports that one instead of paying to regenerate it. |
| **Identical copies for one price** | "Five barrels" generates once and duplicates the rest inside Blender, so the extra copies cost zero credits. |
| **Smart source triage** | Hero props and organic shapes get AI-generated; a flat floor or plain cube is built as a free Blender primitive; atmosphere like sky or fog is skipped. You never pay to generate a cube. |
| **Scene-aware placement** | Reads what is already in your file, so "on my desk" lands on the actual desk. Then it scales each asset to a real-world size, drops it to the floor, and groups it under a named Empty. |
| **Layout reasoning** | "Around the well" becomes a circle, "along the path" a line, a loose list a spaced grid, with facing applied where the description implies it. |
| **Refinement passes** | Optional auto-rig, retopology, UV unwrap, re-texture, or part segmentation, triggered from your words ("rig it so I can pose it"). |
| **Concept image to 3D, for free** | Generate a concept image with FLUX first; once you like it, turn that exact image into a model. |
| **Cost-safe by design** | Generates one asset at a time and stops cleanly the moment you run out of credits, never mid-committing a batch it can't finish. Shows a per-asset cost table and waits for confirmation; failed jobs auto-refund; an interrupted run recovers already-paid assets from your library instead of charging twice. |
| **Fails loudly, not silently** | If Blender is not connected or a model comes back malformed, it tells you what is wrong and how to fix it, rather than producing a cryptic error. |

> [!TIP]
> The cheapest asset is the one you do not generate. This skill leans on reuse, primitives, and duplication precisely so a scene costs the minimum number of real generations.

## How it works

This skill is pure orchestration. It plugs two MCP connectors together and does the scene reasoning in between.

```mermaid
flowchart LR
    U[You describe a scene] --> C[Your coding agent + this skill]
    C -->|generate_3d, get_job| A[Alpha3D MCP<br/>AI 3D generation]
    A -->|GLB download links| C
    C -->|execute_blender_code| B[Blender MCP bridge<br/>runs bpy in your Blender]
    B --> S[Your live Blender scene]
```

1. **[Alpha3D MCP](https://alpha3d.io)** generates the actual 3D models and handles optional refinement (rigging, retopo, UV, texturing, segmentation).
2. **A Blender MCP bridge** (a Blender add-on that exposes a local `bpy` code-execution tool over MCP) lets the agent import and place assets inside your running Blender instance.

Your agent sequences both: it plans the scene, prices it, and after you confirm, downloads each model to local disk, sanitizes it for Blender's strict glTF loader, and imports it, arranging assets as each one finishes. See [`SKILL.md`](./skills/alpha3d-scenegen/SKILL.md) for the full step-by-step procedure.

<details>
<summary><b>Example: what actually happens for the village above</b></summary>

Your agent first shows a plan and the cost, and stops:

| Asset | Source | Quality |
|---|---|---|
| Stone well | generate | pbr |
| Cottage (3 different) | generate x3 | pbr |
| Wooden cart | generate | pbr |
| Ground plane | primitive | free |

> This generates 5 models (the well, three different cottages, the cart); the ground plane is a free Blender primitive. Here is the total credit cost and your balance after it. Confirm to build, or tell me what to change.

On your go-ahead it generates them one at a time, checking your balance before each so it stops cleanly if you run low. As each finishes it imports the model, scales it (a well is about 1.5 m, a cottage about 5 m), drops it to the floor, and places it: the well at the center, the three cottages spaced around it in a ring, the cart out by the entrance. It ends with a viewport screenshot and the exact credits actually spent.

</details>

## Prerequisites

| Requirement | Why | Notes |
|---|---|---|
| An **MCP capable coding agent** that runs on your machine: **Claude Code**, **Cursor**, or **OpenAI Codex CLI** | Runs the workflow and reaches Blender on your machine | Per-client setup is below. |
| **An Alpha3D account with credits** + the **Alpha3D MCP connector** | Does the AI 3D generation | Generation spends real credits. Get an account at [alpha3d.io](https://alpha3d.io). |
| **Blender 4.x or 5.x**, open, with a **Blender MCP bridge** add-on running | Lets the agent run `bpy` in your session | Any bridge exposing a `bpy` code-execution MCP tool works. The common one is [BlenderMCP](https://github.com/ahujasid/blender-mcp). |

> [!NOTE]
> This talks to a Blender instance on **your own computer**, so it will not work from a fully hosted sandbox with no local access. You run the agent and Blender side by side on the same machine.

## Installation

The skill has two parts, and setup depends on your client:

1. **Two MCP connectors.** **Alpha3D** (remote, at `https://api.alpha3d.io/mcp`, with a browser OAuth step on first use) and a **Blender bridge** (a local stdio server, e.g. `uvx blender-mcp`).
2. **The skill's instructions.** The `skills/alpha3d-scenegen/` folder (`SKILL.md` plus `references/`). Claude Code loads these automatically as a skill or plugin. Cursor and Codex have no Agent Skills system, so you connect the same two MCP servers and point the tool at these instructions through its own rules file or `AGENTS.md`.

**The Blender side is identical for every client:** install a bridge add-on such as [BlenderMCP](https://github.com/ahujasid/blender-mcp) in Blender, and **start its server** (a button in the add-on's panel) each session. The per-client config below only tells your agent how to launch or reach that bridge, plus the remote Alpha3D server. You also need an [alpha3d.io](https://alpha3d.io) account with credits.

<details open>
<summary><b>Claude Code</b></summary>

**Install the skill (easiest).** One command, no plugin, no clone. It copies the skill into your Claude Code skills folder:

```bash
npx github:ig-shadow-walker/3DGenSkill
```

By default it installs to `~/.claude/skills/alpha3d-scenegen/` (available in every project). Add `--project` to install into the current repo's `.claude/skills/` instead, or `--dir <path>` to target any folder. The installer is dependency-free and prints exactly what it copied. Claude Code discovers the skill from its `SKILL.md`; no restart needed.

<details>
<summary>Prefer not to use npx? Two other ways</summary>

- **Manual copy:** `git clone https://github.com/ig-shadow-walker/3DGenSkill.git`, then `cp -r 3DGenSkill/skills/alpha3d-scenegen ~/.claude/skills/`.
- **Plugin marketplace**, if you'd rather manage it with `/plugin list`, `/plugin disable`, `/plugin uninstall` (requires Claude Code v2.1.143+):

  ```text
  /plugin marketplace add ig-shadow-walker/3DGenSkill
  /plugin install alpha3d-scenegen@alpha3d
  ```

</details>

**Connect both MCP servers:**

```bash
claude mcp add --transport http alpha3d https://api.alpha3d.io/mcp
claude mcp add blender -- uvx blender-mcp
```

Alpha3D prompts for browser authorization on first use (this links your account so generation draws from your credits). In Claude Desktop or claude.ai, add the same Alpha3D URL from **Settings > Connectors**.

</details>

<details>
<summary><b>Cursor</b></summary>

**Get the instructions locally:**

```bash
git clone https://github.com/ig-shadow-walker/3DGenSkill.git
# keep or copy the skills/alpha3d-scenegen/ folder inside your project
```

**Connect both MCP servers.** Add them to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "alpha3d": { "url": "https://api.alpha3d.io/mcp" },
    "blender": { "command": "uvx", "args": ["blender-mcp"] }
  }
}
```

Open **Settings > MCP**, make sure both are toggled on, and for **alpha3d** click **Authenticate** to complete the browser OAuth (Cursor handles the flow natively; no credentials go in the file). If the login window never opens, toggle the server off and on, or restart Cursor.

**Load the instructions** as an always-on Project Rule at `.cursor/rules/alpha3d-scenegen.mdc`:

```md
---
description: Alpha3D + Blender 3D scene generation workflow
alwaysApply: true
---

When the user asks to generate, build, or populate a Blender scene with 3D
assets, follow the workflow in `skills/alpha3d-scenegen/SKILL.md` and its
`references/` files. Read them before acting.
```

</details>

<details>
<summary><b>OpenAI Codex CLI</b></summary>

Native remote MCP and OAuth landed in Codex in late 2025, so use a current version (`codex --version`, upgrade if `codex mcp login` is missing).

**Get the instructions locally:**

```bash
git clone https://github.com/ig-shadow-walker/3DGenSkill.git
# keep or copy the skills/alpha3d-scenegen/ folder inside your project
```

**Connect both MCP servers:**

```bash
codex mcp add alpha3d --url https://api.alpha3d.io/mcp
codex mcp login alpha3d        # opens the browser OAuth flow
codex mcp add blender -- uvx blender-mcp
```

Equivalently, edit `~/.codex/config.toml`:

```toml
[mcp_servers.alpha3d]
url = "https://api.alpha3d.io/mcp"

[mcp_servers.blender]
command = "uvx"
args = ["blender-mcp"]
```

**Load the instructions** by adding this to `AGENTS.md` (repo root, or `~/.codex/AGENTS.md` for all projects):

```md
## 3D scene generation in Blender

When the user asks to generate, build, or populate a Blender scene with 3D
assets, follow the workflow in `skills/alpha3d-scenegen/SKILL.md` and its
`references/` files. Read them before acting.
```

</details>

### Verify

Open Blender on a scene and start the bridge server, then describe a small scene to your agent. The skill runs a free preflight check on both connectors before proposing anything, so if a connection is missing it tells you immediately instead of failing deep into a build.

## Usage

Just describe what you want in your open Blender scene:

- *"Add a low-poly goblin to my scene and rig it so I can pose it."*
- *"Fill this empty room: a wooden desk, a chair, a bookshelf against the back wall, and a desk lamp."*
- *"Generate a sci-fi crate and scatter five of them near the origin."*
- *"Put a lamp on my desk and a small rug on the floor under it."* (it reads the desk that is already there)
- *"Drop my dragon from last week onto the hill and add three different torches around it."* (reuses the dragon, generates the torches)

Your agent will plan it, price it, ask you to confirm, then build it, arranging each model as it finishes. You stay in control of every credit spent.

## Cost

Generation and refinement spend Alpha3D credits. Reuse from your library, Blender primitives, duplicated copies, and concept images are free.

The same credit pricing as the Alpha3D platform applies. For current rates, see the [Alpha3D pricing page](https://alpha3d.io/pricing). You never have to look it up yourself, though: your agent reads live pricing from the connector and shows you the exact per-asset cost and total in the plan before it builds anything.

> [!IMPORTANT]
> Credits are debited when a job is submitted and **auto-refunded if it fails**. This skill always shows the full cost and waits for your confirmation before submitting anything, so nothing is spent without your go-ahead.

## Repo layout

```
3DGenSkill/
├── bin/
│   └── install.mjs              # npx installer (copies the skill into place)
├── package.json                 # Lets `npx github:...` run the installer
├── .claude-plugin/
│   ├── plugin.json              # Plugin manifest (for the /plugin route)
│   └── marketplace.json         # Marketplace catalog (powers /plugin install)
├── skills/
│   └── alpha3d-scenegen/
│       ├── SKILL.md             # The skill: the full procedure the agent follows
│       └── references/
│           ├── mcp_tools.md         # Verified Alpha3D MCP tool contracts + cost table
│           ├── blender_helpers.md   # Proven bpy code: download, sanitize, import, place, duplicate
│           └── troubleshooting.md   # Known failure modes and their fixes
├── evals/
│   └── evals.json               # Test prompts for validating the skill
├── README.md
├── CONTRIBUTING.md
└── LICENSE
```

## Troubleshooting

The three things most likely to trip you up, with fixes, live in [`references/troubleshooting.md`](./skills/alpha3d-scenegen/references/troubleshooting.md):

- **"Cannot connect to Blender":** the bridge server is not running. Open Blender and start it from the add-on panel (it does not survive a Blender restart).
- **"Bad GLB: file size doesn't match":** a malformed download. The skill's sanitize step handles this automatically.
- **A job stays processing for minutes:** normal. Real generation takes time.

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to propose changes, and please open an issue for bugs or feature ideas.

## License

[MIT](./LICENSE).

---

<div align="center">
Built for <a href="https://alpha3d.io">Alpha3D</a>, the full AI 3D pipeline in one place.
</div>
