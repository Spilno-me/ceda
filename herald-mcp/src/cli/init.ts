#!/usr/bin/env node
/**
 * Herald MCP Init CLI
 * 
 * Creates .claude/settings.json with Herald MCP configuration
 * and updates CLAUDE.md with Herald integration instructions.
 * 
 * Usage: npx @spilno/herald-mcp init [options]
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, basename } from "path";
import { updateClaudeMdContent, type HeraldContext } from "./templates/claude-md.js";

function buildHeraldConfig(company: string, project: string) {
  return {
    mcpServers: {
      herald: {
        command: "npx",
        args: ["@spilno/herald-mcp@latest"],
        env: {
          CEDA_URL: "https://getceda.com",
          HERALD_COMPANY: company,
          HERALD_PROJECT: project
        }
      }
    }
  };
}

function printInitHelp(): void {
  console.log(`
Herald MCP Init - One command setup for CEDA pattern learning

Usage:
  npx @spilno/herald-mcp@latest init [options]

Options:
  --help, -h          Show this help message
  --force, -f         Overwrite existing config
  --company, -c       Company context (e.g., goprint)
  --project, -p       Project context (e.g., kiosk-web)
  --no-claude-md      Skip CLAUDE.md modification

What it does:
  1. Creates .claude/settings.local.json with Herald @latest
  2. Configures CEDA cloud backend (getceda.com)
  3. Sets company/project context for pattern learning
  4. Updates CLAUDE.md with Herald instructions

Example:
  cd my-project
  npx @spilno/herald-mcp@latest init --company goprint --project kiosk

Then start Claude Code and say "herald health" to verify.
`);
}

export interface InitOptions {
  force?: boolean;
  help?: boolean;
  company?: string;
  project?: string;
  user?: string;
  noClaudeMd?: boolean;
}

export function parseInitArgs(args: string[]): InitOptions {
  const options: InitOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (arg === "--company" || arg === "-c") {
      options.company = args[++i];
    } else if (arg === "--project" || arg === "-p") {
      options.project = args[++i];
    } else if (arg === "--user" || arg === "-u") {
      options.user = args[++i];
    } else if (arg === "--no-claude-md") {
      options.noClaudeMd = true;
    }
  }
  
  return options;
}

export function runInit(args: string[] = []): void {
  const options = parseInitArgs(args);
  
  if (options.help) {
    printInitHelp();
    return;
  }
  
  const cwd = process.cwd();
  const projectName = basename(cwd);
  const claudeDir = join(cwd, ".claude");
  const settingsPath = join(claudeDir, "settings.local.json");
  const claudeMdPath = join(cwd, "CLAUDE.md");

  // Use provided values or derive from project name
  const company = options.company || projectName.split("-")[0] || "default";
  const project = options.project || projectName;

  const context: HeraldContext = {
    company,
    project,
    user: options.user || "default",
  };

  // Check for old herald configs and warn
  const oldSettingsPath = join(claudeDir, "settings.json");
  if (existsSync(oldSettingsPath)) {
    try {
      const oldConfig = JSON.parse(readFileSync(oldSettingsPath, "utf-8"));
      if (oldConfig.mcpServers?.herald) {
        console.log("⚠️  Found old Herald config in settings.json - will use settings.local.json instead");
      }
    } catch { /* ignore */ }
  }

  if (existsSync(settingsPath) && !options.force) {
    console.log(`
.claude/settings.local.json already exists.

To view current config:
  cat .claude/settings.local.json

To overwrite:
  npx @spilno/herald-mcp init --force
`);
    return;
  }
  
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
    console.log("Created .claude directory");
  }
  
  const heraldConfig = buildHeraldConfig(company, project);
  let finalConfig = heraldConfig;

  if (existsSync(settingsPath)) {
    try {
      const existingContent = readFileSync(settingsPath, "utf-8");
      const existingConfig = JSON.parse(existingContent);

      finalConfig = {
        ...existingConfig,
        mcpServers: {
          ...existingConfig.mcpServers,
          ...heraldConfig.mcpServers
        }
      };
      console.log("Merging with existing settings.local.json");
    } catch {
      console.log("Overwriting invalid settings.local.json");
    }
  }

  writeFileSync(settingsPath, JSON.stringify(finalConfig, null, 2) + "\n", "utf-8");
  console.log("✓ Created .claude/settings.local.json");
  
  if (!options.noClaudeMd) {
    let existingClaudeMd: string | null = null;
    if (existsSync(claudeMdPath)) {
      existingClaudeMd = readFileSync(claudeMdPath, "utf-8");
    }
    
    const updatedClaudeMd = updateClaudeMdContent(existingClaudeMd, context, projectName);
    writeFileSync(claudeMdPath, updatedClaudeMd, "utf-8");
    
    if (existingClaudeMd) {
      console.log("Updated CLAUDE.md with Herald integration");
    } else {
      console.log("Created CLAUDE.md with Herald integration");
    }
  }
  
  console.log(`
✓ Herald v1.16.0 configured

  Company:  ${company}
  Project:  ${project}
  Backend:  https://getceda.com

Next: Start Claude Code in this directory.
      Say "herald health" to verify.

Pattern capture:
      Say "Herald reflect - that was smooth"
      Claude will ask what worked, then capture it.
`);
}
