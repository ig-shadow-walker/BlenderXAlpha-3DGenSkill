# Contributing

Thanks for your interest in improving the Alpha3D Scene Generator skill.

## Ways to help

- **Report bugs.** Open an issue describing what you asked Claude to do, what happened, and what you expected. Include the failing prompt and, if relevant, which connector (Alpha3D or the Blender bridge) was involved.
- **Suggest improvements.** Better scene reasoning, smarter default placement, support for more asset types, clearer cost breakdowns, all welcome.
- **Improve the docs.** The reference files in `references/` are the skill's working knowledge. If a tool contract drifts or a new failure mode appears, a PR that updates them helps everyone.

## Making changes

This is an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview), so most of it is prose and a small amount of Python. The pieces:

- `SKILL.md` is the procedure Claude follows. Keep it focused and explain the *why* behind each instruction rather than piling on rigid rules. Aim to stay well under 500 lines.
- `references/*.md` hold the mechanical detail (tool contracts, reusable `bpy` snippets, fixes). Put anything long or lookup style here so `SKILL.md` stays readable.
- `evals/evals.json` holds test prompts. If you change behavior, add or update a prompt that exercises it.

### Testing your change

The skill spends real Alpha3D credits, so the built in test prompts are written to stop at the confirmation gate and validate the *planning* (decomposition, cost estimate, placement, preflight checks) without generating anything. Please keep that property: a test should be runnable without silently spending credits.

For a full end to end check, run one real scene yourself with Blender open and the bridge connected, and confirm the models import and place correctly.

## Pull requests

1. Fork the repo and branch from `main`.
2. Make your change, keeping the style and structure of the surrounding files.
3. Describe what you changed and how you verified it.

By contributing, you agree that your contributions are licensed under the project's [MIT License](./LICENSE).
