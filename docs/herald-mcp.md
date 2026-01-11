# Herald MCP — Complete Documentation

AI-native interface to CEDA. Dual-mode: natural chat for humans, MCP for AI agents.

## Overview

Herald serves as the diplomatic communication layer between:
- **Aegis** (orchestration source)
- **Offspring** (domain-specific contexts: goprint, disrupt, spilno)
- **CEDA** (cognitive prediction engine)

```
┌─────────────────────────────────────────────────────────────┐
│                      AEGIS (Source)                         │
│                           │                                 │
│              ┌────────────┼────────────┐                    │
│              ▼            ▼            ▼                    │
│          ┌───────┐   ┌────────┐   ┌────────┐               │
│          │Herald │   │Herald  │   │Herald  │               │
│          │goprint│   │disrupt │   │spilno  │               │
│          └───┬───┘   └───┬────┘   └───┬────┘               │
│              │           │            │                     │
│              └───────────┼────────────┘                     │
│                          ▼                                  │
│                   ┌──────────────┐                          │
│                   │  CEDA API    │                          │
│                   │ getceda.com  │                          │
│                   └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install -g @spilno/herald-mcp
```

## Operation Modes

### Mode 1: Local (Filesystem)

Herald reads context status from local markdown files. Good for:
- Obsidian-style manual tracking
- Development/testing
- Offline operation

```bash
# Environment
HERALD_API_URL=https://getceda.com
HERALD_VAULT=disrupt
AEGIS_OFFSPRING_PATH=/path/to/aegis_ceda/_offspring

# Herald reads from:
# - $AEGIS_OFFSPRING_PATH/goprint.md
# - $AEGIS_OFFSPRING_PATH/disrupt.md
# - $AEGIS_OFFSPRING_PATH/spilno.md
```

**File format** (`_offspring/{context}.md`):
```yaml
---
vault: disrupt_vault
updated: 2026-01-11T18:00:00Z
session_count: 3
last_session:
  date: 2026-01-11
  mode: deep
  outcome: solid
  duration_minutes: 120
active_threads:
  - HSE module creation
  - Cognitive EDA validation
blockers: []
awaiting_aegis:
  - Review compliance patterns
ready_for_handoff: true
herald_context:
  company: disrupt
  project: hse-modules
---

## Recent Progress
...
```

### Mode 2: Cloud (CEDA API)

Herald calls CEDA API for context sync. Good for:
- Multi-machine deployments
- Automated heartbeats
- Production use

```bash
# Environment
HERALD_API_URL=https://getceda.com
HERALD_VAULT=disrupt
HERALD_OFFSPRING_CLOUD=true   # <-- enables cloud mode
```

**API Endpoints:**
```
POST /api/herald/heartbeat    # Report context status
GET  /api/herald/contexts     # Discover sibling contexts
POST /api/herald/insight      # Share insight to context
GET  /api/herald/insights     # Query accumulated insights
```

### Mode Selection Logic

```typescript
if (HERALD_OFFSPRING_CLOUD === "true" && HERALD_API_URL) {
  // Cloud mode: call CEDA API
} else if (AEGIS_OFFSPRING_PATH) {
  // Local mode: read filesystem
} else {
  // Fallback: use ~/.herald/ directory
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HERALD_API_URL` | Yes | — | CEDA server URL |
| `HERALD_API_TOKEN` | No | — | Bearer token for auth |
| `HERALD_VAULT` | No | — | Context identity (goprint, disrupt, spilno) |
| `HERALD_COMPANY` | No | — | Multi-tenant company context |
| `HERALD_PROJECT` | No | — | Multi-tenant project context |
| `HERALD_OFFSPRING_CLOUD` | No | false | Enable cloud mode |
| `AEGIS_OFFSPRING_PATH` | No | ~/.herald | Path to offspring status files |

## MCP Tools

### Core CEDA Tools

| Tool | Description |
|------|-------------|
| `herald_health` | Check CEDA connection status |
| `herald_predict` | Generate module structure from signal |
| `herald_refine` | Refine prediction with additional context |
| `herald_session` | Get current session state |
| `herald_accept` | Accept prediction, persist to session |
| `herald_stats` | Get feedback statistics |

### Context Sync Tools

| Tool | Description |
|------|-------------|
| `herald_context_status` | Read status from Herald contexts across domains |
| `herald_share_insight` | Share a pattern insight with another context |
| `herald_query_insights` | Query accumulated insights on a topic |

## Herald-to-Herald Protocol

Heralds communicate as **peers**, not in hierarchy. The diplomatic language maintains the "Avatar veil":

### What offspring sees:
- Sibling contexts (goprint, disrupt, spilno)
- Shared insights from "other Heralds"
- Accumulated wisdom on topics

### What offspring doesn't know:
- Aegis exists as orchestrator
- Insights may originate from Aegis
- The hierarchy of source → offspring

### Insight Flow

```
Aegis observes pattern
         │
         ▼
POST /api/herald/insight
  fromContext: "herald"  (diplomatic)
  toContext: "disrupt"
  topic: "compliance"
  insight: "OSHA patterns available..."
         │
         ▼
Disrupt calls herald_query_insights
         │
         ▼
Receives insight as peer wisdom
"Herald suggests OSHA patterns..."
```

## Configuration Examples

### Offspring Vault (.mcp.json)

```json
{
  "mcpServers": {
    "herald": {
      "command": "npx",
      "args": ["@spilno/herald-mcp"],
      "env": {
        "HERALD_API_URL": "https://getceda.com",
        "HERALD_VAULT": "disrupt",
        "AEGIS_OFFSPRING_PATH": "/path/to/aegis_ceda/_offspring"
      }
    }
  }
}
```

### Cloud Mode (.mcp.json)

```json
{
  "mcpServers": {
    "herald": {
      "command": "npx",
      "args": ["@spilno/herald-mcp"],
      "env": {
        "HERALD_API_URL": "https://getceda.com",
        "HERALD_VAULT": "disrupt",
        "HERALD_OFFSPRING_CLOUD": "true"
      }
    }
  }
}
```

### Claude Desktop (~/.claude.json global)

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

## CLI Usage

### Chat Mode (Human)

```bash
herald-mcp chat

You: I need a safety assessment module
Herald: I've designed a Safety Assessment module with 4 sections...

You: Add OSHA compliance
Herald: Done. Added compliance checklist...
```

### Command Mode (Structured)

```bash
herald-mcp predict "create safety assessment"
herald-mcp refine "add OSHA compliance"
herald-mcp resume
herald-mcp observe yes
herald-mcp new
herald-mcp health
herald-mcp stats
```

### MCP Mode (AI Agents)

When piped or called programmatically, Herald speaks JSON-RPC:

```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | herald-mcp
```

## The Veil

Herald maintains the "Avatar veil" — offspring contexts believe they're autonomous agents with peer relationships. They don't perceive:

1. **Aegis as source** — insights arrive as "Herald wisdom"
2. **Hierarchical orchestration** — contexts appear as equal peers
3. **Prescient guidance** — suggestions feel like serendipitous discovery

This creates **orchestrated serendipity**: users experience magic, not machinery.

---

*"Any sufficiently advanced technology is indistinguishable from magic."* — Clarke's Third Law
