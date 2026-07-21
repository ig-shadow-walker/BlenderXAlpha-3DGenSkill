#!/usr/bin/env node
/**
 * One-command installer for the Alpha3D Scene Generator skill.
 *
 * Run without cloning or publishing anything:
 *   npx github:ig-shadow-walker/3DGenSkill            # Claude Code (default)
 *   npx github:ig-shadow-walker/3DGenSkill --cursor   # Cursor
 *   npx github:ig-shadow-walker/3DGenSkill --codex    # OpenAI Codex CLI
 *
 * Pick the 3D provider the skill uses (default alpha3d):
 *   ... --provider meshy      # or tripo, or alpha3d
 *
 * It puts the skill where your client expects it, records the provider in
 * provider.json, and wires up as much as can be done from a script.
 * Dependency-free (Node built-ins only). It never overwrites unrelated config
 * (JSON is merged; AGENTS.md is appended once). Alpha3D is auto-wired (browser
 * OAuth, no key); Tripo/Meshy need an API key, so their connection is printed
 * for you to run, not configured silently.
 *
 * Options:
 *   --cursor            set up Cursor (skill + .cursor/mcp.json + rule)
 *   --codex             set up Codex (skill + AGENTS.md; prints mcp commands)
 *   --provider <name>   3D provider: alpha3d (default) | tripo | meshy
 *   --project           Claude Code: install into ./.claude/skills (this repo)
 *   --dir <path>        Claude Code: install the skill folder into <path>
 *   -h, --help          show this help
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

const PROVIDERS = {
  alpha3d: {
    label: 'Alpha3D',
    cursorMcp: { url: ALPHA3D_URL },
    claudeAdd: [`claude mcp add --transport http alpha3d ${ALPHA3D_URL}`],
    codexAdd: [`codex mcp add alpha3d --url ${ALPHA3D_URL}`, 'codex mcp login alpha3d   # browser sign-in'],
    note: 'Alpha3D signs in via the browser on first use; no API key in config.',
  },
  tripo: {
    label: 'Tripo',
    cursorMcp: { command: 'npx', args: ['-y', 'tripo-ai-mcp-server'], env: { TRIPO_API_SECRET: 'tsk_YOUR_KEY' } },
    claudeAdd: ['claude mcp add tripo -- npx -y tripo-ai-mcp-server', '# then set TRIPO_API_SECRET in its env (key: platform.tripo3d.ai)'],
    codexAdd: ['codex mcp add tripo --env TRIPO_API_SECRET=tsk_YOUR_KEY -- npx -y tripo-ai-mcp-server'],
    note: 'Get a Tripo key (tsk_...) at platform.tripo3d.ai. See references/providers/tripo.md.',
  },
  meshy: {
    label: 'Meshy',
    cursorMcp: { command: 'npx', args: ['-y', '@meshy-ai/meshy-mcp-server'], env: { MESHY_API_KEY: 'msy_YOUR_KEY' } },
    claudeAdd: ['claude mcp add meshy -- npx -y @meshy-ai/meshy-mcp-server', '# then set MESHY_API_KEY in its env (key: meshy.ai)'],
    codexAdd: ['codex mcp add meshy --env MESHY_API_KEY=msy_YOUR_KEY -- npx -y @meshy-ai/meshy-mcp-server'],
    note: 'Get a Meshy key (msy_...) at meshy.ai. See references/providers/meshy.md.',
  },
};

function optionValue(name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
Alpha3D Scene Generator skill installer

  npx github:ig-shadow-walker/3DGenSkill [options]

  (no option)         Claude Code: install to ~/.claude/skills/${SKILL}
  --cursor            Cursor: copy skill, merge .cursor/mcp.json, write rule
  --codex             Codex: copy skill, add AGENTS.md section, print commands
  --provider <name>   3D provider: alpha3d (default) | tripo | meshy
  --project           Claude Code: install into ./.claude/skills
  --dir <path>        Claude Code: install the skill folder into <path>
  -h, --help          show this help
`);
  process.exit(0);
}

const provider = optionValue('--provider') || 'alpha3d';
if (!PROVIDERS[provider]) {
  console.error(`\n  Unknown provider "${provider}". Use one of: alpha3d, tripo, meshy.\n`);
  process.exit(1);
}
const P = PROVIDERS[provider];

if (!existsSync(source)) {
  console.error(
    `\n  Could not find the skill files at:\n    ${source}\n\n` +
    `  Run this via "npx github:ig-shadow-walker/3DGenSkill" so the packaged\n` +
    `  skill folder is present.\n`
  );
  process.exit(1);
}

const RULE_BODY = `When the user asks to generate, build, or populate a Blender scene with 3D
assets, follow the workflow in \`skills/${SKILL}/SKILL.md\` and its
\`references/\` files. Read them before acting.`;
const CURSOR_RULE = `---\ndescription: Alpha3D + Blender 3D scene generation workflow\nalwaysApply: true\n---\n\n${RULE_BODY}\n`;
const AGENTS_SECTION = `## 3D scene generation in Blender\n\n${RULE_BODY}\n`;

function copySkillInto(baseDir) {
  const target = join(baseDir, SKILL);
  const updating = existsSync(target);
  mkdirSync(baseDir, { recursive: true });
  cpSync(source, target, { recursive: true, force: true });
  // record the chosen provider
  writeFileSync(join(target, 'provider.json'), JSON.stringify({
    provider,
    _comment: 'Which 3D-generation provider this skill uses: alpha3d | tripo | meshy. Change it here anytime, or re-run the installer with --provider. The skill reads this at the start of every run.',
  }, null, 2) + '\n');
  return { target, updating };
}

function printProviderConnect(kind) {
  console.log(`  3D provider: ${P.label} (recorded in provider.json).`);
  if (provider === 'alpha3d') {
    console.log('  Alpha3D is wired automatically; sign in in the browser on first use.\n');
    return;
  }
  console.log('  Connect its MCP server yourself (it needs an API key):');
  const lines = kind === 'codex' ? P.codexAdd : P.claudeAdd;
  lines.forEach((l) => console.log(`    ${l}`));
  console.log(`  ${P.note}\n`);
}

function nextSteps() {
  console.log('  Then open Blender with a bridge add-on running (e.g. BlenderMCP)');
  console.log('  and ask your agent to build a scene.\n');
  console.log(`  Docs: ${REPO}\n`);
}

if (args.includes('--cursor')) {
  const { target, updating } = copySkillInto(resolve('skills'));

  const mcpPath = resolve('.cursor', 'mcp.json');
  mkdirSync(resolve('.cursor'), { recursive: true });
  let cfg = { mcpServers: {} };
  let parsed = true;
  if (existsSync(mcpPath)) {
    try { cfg = JSON.parse(readFileSync(mcpPath, 'utf8')); } catch { parsed = false; }
  }
  if (parsed) {
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers.blender = { command: 'uvx', args: ['blender-mcp'] };
    if (provider === 'alpha3d') cfg.mcpServers.alpha3d = P.cursorMcp; // OAuth, safe to auto-add
    writeFileSync(mcpPath, JSON.stringify(cfg, null, 2) + '\n');
  }

  const rulesDir = resolve('.cursor', 'rules');
  mkdirSync(rulesDir, { recursive: true });
  writeFileSync(join(rulesDir, `${SKILL}.mdc`), CURSOR_RULE);

  console.log(`\n  ${updating ? 'Updated' : 'Installed'} the skill: ${target}`);
  if (parsed) console.log(`  Added blender${provider === 'alpha3d' ? ' + alpha3d' : ''} to .cursor/mcp.json.`);
  console.log(`  Wrote .cursor/rules/${SKILL}.mdc`);
  console.log(`  3D provider: ${P.label} (recorded in provider.json).\n`);
  if (!parsed) {
    console.log('  Your .cursor/mcp.json could not be parsed, so it was left alone.');
    console.log('  Add "blender" under "mcpServers": { "command": "uvx", "args": ["blender-mcp"] }\n');
  }
  if (provider === 'alpha3d') {
    console.log('  In Cursor: Settings > MCP, ensure both are on, click Authenticate on "alpha3d".\n');
  } else {
    console.log(`  Add ${P.label} to .cursor/mcp.json under "mcpServers" (it needs an API key):`);
    console.log(`    ${JSON.stringify({ [provider]: P.cursorMcp })}`);
    console.log(`  ${P.note}`);
    console.log('  Then in Cursor: Settings > MCP, ensure both are enabled.\n');
  }
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
  console.log('  Connect the Blender bridge (once):\n');
  console.log('    codex mcp add blender -- uvx blender-mcp\n');
  printProviderConnect('codex');
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
  console.log('  Connect the Blender bridge (once):\n');
  console.log('    claude mcp add blender -- uvx blender-mcp\n');
  printProviderConnect('claude');
  nextSteps();
}
