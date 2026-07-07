# 3DGenSkill

An [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) that lets Claude turn a plain-language scene description into real, AI-generated 3D models, placed and scaled correctly inside your currently open Blender file.

You describe the scene ("a small fantasy village: a well in the center, three cottages around it, a cart near the entrance"). Claude decomposes it into an asset plan, shows you the credit cost and waits for your go-ahead, then generates each asset through Alpha3D, downloads and imports it, scales it to a sensible real-world size, drops it to the ground, and positions it — all inside your live Blender session.

## How it works

1. [**Alpha3D MCP**](https://alpha3d.io) generates the actual 3D models (`generate_3d`, plus optional refinement: rigging, retopology, UV unwrapping, texturing, segmentation).
2. A **Blender MCP bridge** (a Blender add-on exposing a local code-execution server — commonly known as "BlenderMCP") lets Claude run the import/placement code inside your running Blender instance.

Claude orchestrates both: it never spends credits without showing you the cost first and getting explicit confirmation, and it never touches Blender without first checking the bridge is actually connected.

## Prerequisites

- An Alpha3D account with credits, and the **Alpha3D MCP connector** connected in your Claude client (Settings → Connectors).
- **Blender** open, with a Blender MCP bridge add-on installed, enabled, and its local server started. This add-on is separate from Alpha3D and just gives Claude the ability to run Python (`bpy`) inside your Blender session — any bridge that exposes a `bpy`-code-execution MCP tool should work.
- A Claude client that supports MCP connectors and can run code locally (Claude Code, Claude Desktop with the connector configured, etc.) — this skill depends on reaching a Blender instance on your own machine, so it isn't usable from a fully hosted/sandboxed environment with no access to your local Blender.

## Installing the skill

Clone this repo, then follow your Claude client's instructions for installing a local Agent Skill (typically: point it at this directory, or package it first):

```bash
git clone https://github.com/ig-shadow-walker/3DGenSkill.git
```

See [`SKILL.md`](./SKILL.md) for what Claude actually does step by step, and the `references/` directory for the underlying tool contracts, Blender helper code, and known troubleshooting fixes.

## Cost

Every generation and refinement step spends real Alpha3D credits (see the cost table in [`references/mcp_tools.md`](./references/mcp_tools.md)). This skill always shows you the full plan and total cost, and waits for explicit confirmation, before submitting anything.

## License

Not yet specified — add a `LICENSE` file before treating this as open source for others to redistribute.
