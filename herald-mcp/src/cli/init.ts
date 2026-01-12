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

const HERALD_MCP_CONFIG = {
  mcpServers: {
    herald: {
      command: "npx",
      args: ["@spilno/herald-mcp"],
      env: {
        HERALD_API_URL: "https://getceda.com"
      }
    }
  }
};

function printInitHelp(): void {
  console.log(`
Herald MCP Init - Configure Claude Desktop for Herald

Usage:
  npx @spilno/herald-mcp init [options]

Options:
  --help, -h          Show this help message
  --force, -f         Overwrite existing settings.json
  --company, -c       Company context (e.g., goprint)
  --project, -p       Project context (e.g., mobidruk)
  --user, -u          User context (default: plumber)
  --no-claude-md      Skip CLAUDE.md modification

What it does:
  1. Creates .claude/settings.json with Herald MCP configuration
  2. Creates/updates CLAUDE.md with Herald integration instructions

After running init:
  1. Open Claude Desktop
  2. Herald will be available as an MCP server
  3. Claude will know to use Herald for module design

Example:
  cd my-project
  npx @spilno/herald-mcp init --company goprint --project mobidruk
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
  const settingsPath = join(claudeDir, "settings.json");
  const claudeMdPath = join(cwd, "CLAUDE.md");
  
  const context: HeraldContext = {
    company: options.company || "default",
    project: options.project || projectName,
    user: options.user || "plumber",
  };
  
  if (existsSync(settingsPath) && !options.force) {
    console.log(`
.claude/settings.json already exists.

To view current config:
  cat .claude/settings.json

To overwrite:
  npx @spilno/herald-mcp init --force
`);
    return;
  }
  
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
    console.log("Created .claude directory");
  }
  
  let finalConfig = HERALD_MCP_CONFIG;
  
  if (existsSync(settingsPath)) {
    try {
      const existingContent = readFileSync(settingsPath, "utf-8");
      const existingConfig = JSON.parse(existingContent);
      
      finalConfig = {
        ...existingConfig,
        mcpServers: {
          ...existingConfig.mcpServers,
          ...HERALD_MCP_CONFIG.mcpServers
        }
      };
      console.log("Merging with existing settings.json");
    } catch {
      console.log("Overwriting invalid settings.json");
    }
  }
  
  writeFileSync(settingsPath, JSON.stringify(finalConfig, null, 2) + "\n", "utf-8");
  console.log("Created .mcp.json with Herald config");
  
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
  
  console.log(`Context: ${context.company}/${context.project}/${context.user}`);
  
  console.log(`
Herald is ready. Claude Code will now:
  - Check patterns before building
  - Use predictions as starting points
  - Observe outcomes for learning

Environment variables (optional):
  HERALD_API_URL      CEDA server URL (default: https://getceda.com)
  HERALD_COMPANY      Company context for multi-tenancy
  HERALD_PROJECT      Project context for multi-tenancy
  HERALD_USER         User context for multi-tenancy
`);
}
