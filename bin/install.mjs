#!/usr/bin/env node
/**
 * One-command installer for the Alpha3D Scene Generator skill.
 *
 * Run without cloning or publishing anything:
 *   npx github:ig-shadow-walker/3DGenSkill
 *
 * It copies the skill folder (SKILL.md + references) into your Claude Code
 * skills directory. Dependency-free: uses only Node built-ins.
 *
 * Options:
 *   --project        install into ./.claude/skills (this repo only)
 *   --dir <path>     install into <path>/alpha3d-scenegen (any location)
 *   -h, --help       show this help
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_NAME = 'alpha3d-scenegen';
const REPO = 'https://github.com/ig-shadow-walker/3DGenSkill';
const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', 'skills', SKILL_NAME);
const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
Alpha3D Scene Generator skill installer

  npx github:ig-shadow-walker/3DGenSkill [options]

Options:
  --project      install into ./.claude/skills (current repo only)
  --dir <path>   install into <path>/${SKILL_NAME}
  -h, --help     show this help

With no options it installs to ~/.claude/skills/${SKILL_NAME} (all projects).
`);
  process.exit(0);
}

function optionValue(name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

let base;
const customDir = optionValue('--dir');
if (customDir) base = resolve(customDir);
else if (args.includes('--project')) base = resolve('.claude', 'skills');
else base = join(homedir(), '.claude', 'skills');

const target = join(base, SKILL_NAME);

if (!existsSync(source)) {
  console.error(
    `\n  Could not find the skill files at:\n    ${source}\n\n` +
    `  Run this via "npx github:ig-shadow-walker/3DGenSkill" so the packaged\n` +
    `  skill folder is present, or clone the repo and run bin/install.mjs from it.\n`
  );
  process.exit(1);
}

const updating = existsSync(target);
mkdirSync(base, { recursive: true });
cpSync(source, target, { recursive: true, force: true });

console.log(`
  ${updating ? 'Updated' : 'Installed'} the Alpha3D Scene Generator skill:
    ${target}

  Next, connect the two MCP servers your agent needs (once):

    claude mcp add --transport http alpha3d https://api.alpha3d.io/mcp
    claude mcp add blender -- uvx blender-mcp

  Then open Blender with a bridge add-on running (e.g. BlenderMCP), and ask
  your agent to build a scene. Alpha3D asks for browser sign-in on first use.

  Docs: ${REPO}
`);
