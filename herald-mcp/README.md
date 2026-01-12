# @spilno/herald-mcp

Herald MCP - AI-native interface to [CEDA](https://getceda.com) (Cognitive Event-Driven Architecture).

**Dual-mode**: Natural chat for humans, MCP for AI agents.

## Quick Start

```bash
# Initialize Herald MCP config for Claude Desktop
npx @spilno/herald-mcp init

# Or install globally
npm install -g @spilno/herald-mcp
herald-mcp init
```

That's it. Herald is now configured for Claude Desktop.

## Init Command (New in v1.4.0)

The `init` command creates `.claude/settings.json` with Herald MCP configuration:

```bash
npx @spilno/herald-mcp init
```

This creates:
```json
{
  "mcpServers": {
    "herald": {
      "command": "npx",
      "args": ["@spilno/herald-mcp"],
      "env": {
        "HERALD_API_URL": "https://getceda.com"
      }
    }
  }
}
```

Options:
- `--help, -h` - Show help
- `--force, -f` - Overwrite existing settings.json

## Chat Mode (Natural Conversation)

```bash
export HERALD_API_URL=https://getceda.com
herald-mcp chat
```

```
You: I need a safety assessment module for construction sites
Herald: I've designed a Safety Assessment module with 4 sections...

You: Add OSHA compliance fields
Herald: Done. Added compliance checklist to Risk Evaluation...

You: Looks good, let's use it
Herald: Great! Module accepted and saved.
```

## Command Mode (Structured)

```bash
herald-mcp predict "create safety assessment"
herald-mcp refine "add OSHA compliance"
herald-mcp resume
herald-mcp observe yes
herald-mcp new
herald-mcp health
herald-mcp stats
```

## Session Persistence

Sessions saved to `~/.herald/session` - resume anytime:

```bash
# Start today
herald-mcp predict "create incident report module"

# Continue tomorrow
herald-mcp resume
herald-mcp refine "add witness statements section"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HERALD_API_URL` | Yes | CEDA server URL |
| `HERALD_API_TOKEN` | No | Bearer token for auth |
| `HERALD_COMPANY` | No | Multi-tenant company context |
| `HERALD_PROJECT` | No | Multi-tenant project context |
| `HERALD_VAULT` | No | Offspring vault ID (spilno, goprint, disrupt) |
| `HERALD_OFFSPRING_CLOUD` | No | Set to "true" for cloud mode |
| `AEGIS_OFFSPRING_PATH` | No | Local path to offspring status files |

## Herald Context Sync (v1.3.0+)

Herald instances can communicate across contexts, sharing insights and synchronizing status:

### Tools

| Tool | Purpose |
|------|---------|
| `herald_context_status` | Read status from Herald contexts across domains |
| `herald_share_insight` | Share a pattern insight with another context |
| `herald_query_insights` | Query accumulated insights on a topic |

### Local Mode (Default)

```bash
# Context files in local directory
export AEGIS_OFFSPRING_PATH=~/Documents/aegis_ceda/_offspring
export HERALD_VAULT=spilno  # Which context this Herald serves

herald-mcp  # MCP mode uses local files
```

### Cloud Mode

```bash
# Use CEDA API for context synchronization
export HERALD_API_URL=https://getceda.com
export HERALD_OFFSPRING_CLOUD=true
export HERALD_VAULT=spilno

herald-mcp  # MCP mode calls CEDA API
```

### Herald-to-Herald Protocol

```
POST /api/herald/heartbeat    # Herald reports its context status
GET  /api/herald/contexts     # Herald discovers sibling contexts
POST /api/herald/insight      # Herald shares an insight
GET  /api/herald/insights     # Herald queries shared insights
```

## MCP Mode (for AI Agents)

When piped, Herald speaks JSON-RPC for Claude, Devin, and other AI agents.

### Claude Code (~/.claude.json)

```json
{
  "mcpServers": {
    "herald": {
      "command": "npx",
      "args": ["@spilno/herald-mcp"],
      "env": {
        "HERALD_API_URL": "https://getceda.com"
      }
    }
  }
}
```

### Devin MCP Marketplace

- **Server Name**: Herald-CEDA
- **Command**: `npx @spilno/herald-mcp`
- **Environment**: `HERALD_API_URL=https://getceda.com`

## Architecture

```
Human ←→ Herald (Claude voice) ←→ CEDA (cognition)
Agent ←→ Herald (JSON-RPC)     ←→ CEDA
```

## License

MIT
