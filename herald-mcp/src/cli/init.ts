#!/usr/bin/env node
/**
 * Herald MCP Init CLI
 * 
 * Creates .claude/settings.json with Herald MCP configuration
 * in the current directory.
 * 
 * Usage: npx @spilno/herald-mcp init
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

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
  --help, -h     Show this help message
  --force, -f    Overwrite existing settings.json

What it does:
  Creates .claude/settings.json in the current directory with Herald MCP
  configuration. This allows Claude Desktop to use Herald for AI-native
  module design through CEDA.

After running init:
  1. Open Claude Desktop
  2. Herald will be available as an MCP server
  3. Ask Claude to use Herald for module design

Example:
  cd my-project
  npx @spilno/herald-mcp init
`);
}

export interface InitOptions {
  force?: boolean;
  help?: boolean;
}

export function parseInitArgs(args: string[]): InitOptions {
  const options: InitOptions = {};
  
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--force" || arg === "-f") {
      options.force = true;
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
  const claudeDir = join(cwd, ".claude");
  const settingsPath = join(claudeDir, "settings.json");
  
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
  
  console.log(`
Herald MCP configured successfully!

Created: .claude/settings.json

Configuration:
${JSON.stringify(HERALD_MCP_CONFIG.mcpServers.herald, null, 2)}

Next steps:
  1. Open Claude Desktop
  2. Herald will be available as an MCP server
  3. Try: "Use Herald to design a safety assessment module"

Environment variables (optional):
  HERALD_API_URL      CEDA server URL (default: https://getceda.com)
  HERALD_COMPANY      Company context for multi-tenancy
  HERALD_PROJECT      Project context for multi-tenancy
  HERALD_USER         User context for multi-tenancy
`);
}
