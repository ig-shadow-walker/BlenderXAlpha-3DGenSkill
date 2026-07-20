#!/usr/bin/env node
/**
 * One-command installer for the Alpha3D Scene Generator skill.
 *
 * Run without cloning or publishing anything:
 *   npx github:ig-shadow-walker/3DGenSkill            # Claude Code (default)
 *   npx github:ig-shadow-walker/3DGenSkill --cursor   # Cursor
 *   npx github:ig-shadow-walker/3DGenSkill --codex    # OpenAI Codex CLI
 *
 * It puts the skill where your client expects it and wires up as much as can
 * be done from a script. Dependency-free: uses only Node built-ins. It never
 * overwrites unrelated config (JSON is merged; AGENTS.md is appended once).
 *
 * Options:
 *   --cursor         set up Cursor (skill + .cursor/mcp.json + rule)
 *   --codex          set up Codex (skill + AGENTS.md; prints the mcp commands)
 *   --project        Claude Code: install into ./.claude/skills (this repo)
 *   --dir <path>     Claude Code: install the skill folder into <path>
 *   -h, --help       show this help
 */
import {
  appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = 'alpha-scene-gen';
const REPO = 'https://github.com/ig-shadow-walker/3DGenSkill';
const ALPHA3D_URL = 'https://api.alpha3d.io/mcp';
const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', 'skills', SKILL);
const args = process.argv.slice(2);

const RULE_BODY = `When the user asks to generate, build, or populate a Blender scene with 3D
assets, follow the workflow in \`skills/${SKILL}/SKILL.md\` and its
\`references/\` files. Read them before acting.`;

const CURSOR_RULE = `---
description: Alpha3D + Blender 3D scene generation workflow
alwaysApply: true
---

${RULE_BODY}
`;

const AGENTS_SECTION = `## 3D scene generation in Blender

${RULE_BODY}
`;

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
Alpha3D Scene Generator skill installer

  npx github:ig-shadow-walker/3DGenSkill [options]

  (no option)    Claude Code: install to ~/.claude/skills/${SKILL}
  --cursor       Cursor: copy the skill into ./skills, merge .cursor/mcp.json,
                 write .cursor/rules/${SKILL}.mdc
  --codex        Codex: copy the skill into ./skills, add a section to AGENTS.md,
                 print the two "codex mcp" commands to run
  --project      Claude Code: install into ./.claude/skills instead of home
  --dir <path>   Claude Code: install the skill folder into <path>
  -h, --help     show this help
`);
  process.exit(0);
}

if (!existsSync(source)) {
  console.error(
    `\n  Could not find the skill files at:\n    ${source}\n\n` +
    `  Run this via "npx github:ig-shadow-walker/3DGenSkill" so the packaged\n` +
    `  skill folder is present.\n`
  );
  process.exit(1);
}

function optionValue(name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

function copySkillInto(baseDir) {
  const target = join(baseDir, SKILL);
  const updating = existsSync(target);
  mkdirSync(baseDir, { recursive: true });
  cpSync(source, target, { recursive: true, force: true });
  return { target, updating };
}

function nextSteps() {
  console.log('  Then open Blender with a bridge add-on running (e.g. BlenderMCP)');
  console.log('  and ask your agent to build a scene. Alpha3D asks you to sign in');
  console.log('  in the browser on first use.\n');
  console.log(`  Docs: ${REPO}\n`);
}

if (args.includes('--cursor')) {
  const { target, updating } = copySkillInto(resolve('skills'));

  const mcpPath = resolve('.cursor', 'mcp.json');
  mkdirSync(resolve('.cursor'), { recursive: true });
  let cfg = { mcpServers: {} };
  let mcpWord = 'Created';
  let parsed = true;
  if (existsSync(mcpPath)) {
    try {
      cfg = JSON.parse(readFileSync(mcpPath, 'utf8'));
      mcpWord = 'Updated';
    } catch {
      parsed = false;
    }
  }
  if (parsed) {
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers.alpha3d = { url: ALPHA3D_URL };
    cfg.mcpServers.blender = { command: 'uvx', args: ['blender-mcp'] };
    writeFileSync(mcpPath, JSON.stringify(cfg, null, 2) + '\n');
  }

  const rulesDir = resolve('.cursor', 'rules');
  mkdirSync(rulesDir, { recursive: true });
  writeFileSync(join(rulesDir, `${SKILL}.mdc`), CURSOR_RULE);

  console.log(`\n  ${updating ? 'Updated' : 'Installed'} the skill: ${target}`);
  if (parsed) console.log(`  ${mcpWord} .cursor/mcp.json (added alpha3d + blender).`);
  console.log(`  Wrote .cursor/rules/${SKILL}.mdc\n`);
  if (!parsed) {
    console.log('  Your .cursor/mcp.json could not be parsed, so it was left alone.');
    console.log('  Add these two servers under "mcpServers" by hand:');
    console.log(`    "alpha3d": { "url": "${ALPHA3D_URL}" },`);
    console.log('    "blender": { "command": "uvx", "args": ["blender-mcp"] }\n');
  }
  console.log('  Last step in Cursor: Settings > MCP, make sure both are on, and');
  console.log('  click Authenticate on "alpha3d" to sign in.\n');
  nextSteps();
} else if (args.includes('--codex')) {
  const { target, updating } = copySkillInto(resolve('skills'));

  const agentsPath = resolve('AGENTS.md');
  const existed = existsSync(agentsPath);
  let agentsWord;
  if (existed && readFileSync(agentsPath, 'utf8').includes('## 3D scene generation in Blender')) {
    agentsWord = 'AGENTS.md already references the skill (left as is)';
  } else {
    appendFileSync(agentsPath, (existed ? '\n' : '') + AGENTS_SECTION);
    agentsWord = existed ? 'Added a section to AGENTS.md' : 'Created AGENTS.md';
  }

  console.log(`\n  ${updating ? 'Updated' : 'Installed'} the skill: ${target}`);
  console.log(`  ${agentsWord}.\n`);
  console.log('  Connect the two MCP servers (once):\n');
  console.log(`    codex mcp add alpha3d --url ${ALPHA3D_URL}`);
  console.log('    codex mcp login alpha3d        # opens the browser sign-in');
  console.log('    codex mcp add blender -- uvx blender-mcp\n');
  nextSteps();
} else {
  // Claude Code (default)
  const customDir = optionValue('--dir');
  let base;
  if (customDir) base = resolve(customDir);
  else if (args.includes('--project')) base = resolve('.claude', 'skills');
  else base = join(homedir(), '.claude', 'skills');

  const { target, updating } = copySkillInto(base);
  console.log(`\n  ${updating ? 'Updated' : 'Installed'} the skill: ${target}\n`);
  console.log('  Connect the two MCP servers (once):\n');
  console.log(`    claude mcp add --transport http alpha3d ${ALPHA3D_URL}`);
  console.log('    claude mcp add blender -- uvx blender-mcp\n');
  nextSteps();
}
