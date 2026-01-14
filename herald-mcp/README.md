# @spilno/herald-mcp

> AI-native interface to [CEDA](https://getceda.com) — pattern memory for AI agents.

Herald bridges AI agents and CEDA's cognitive pattern memory. Your AI remembers what worked.

## Why Herald?

AI agents start fresh each session. Herald gives them memory:

| Without Herald | With Herald |
|----------------|-------------|
| AI forgets past sessions | Patterns persist across sessions |
| Same mistakes repeated | Antipatterns prevent failures |
| Generic responses | Context-aware predictions |
| No learning curve | Knowledge compounds |

## Quick Start

```bash
# One command setup for Claude Desktop
npx @spilno/herald-mcp init

# Or install globally
npm install -g @spilno/herald-mcp
herald-mcp init
```

Done. Herald is now available to Claude.

## Core Tools

| Tool | Purpose |
|------|---------|
| `herald_predict` | Generate structure from natural language |
| `herald_refine` | Refine predictions with feedback |
| `herald_patterns` | Query what worked before |
| `herald_reflect` | Capture patterns and antipatterns |
| `herald_feedback` | Reinforce helpful patterns |

### Pattern Memory

```
AI: herald_patterns()
→ Returns: patterns that worked, antipatterns to avoid

AI: herald_predict("create safety assessment module")
→ Returns: structured prediction based on accumulated patterns

User: "That worked well"
AI: herald_reflect(feeling="success", insight="field grouping approach")
→ Pattern captured, weight increased
```

## Session Flow

```bash
# Start a session
herald-mcp predict "create incident report module"

# Refine iteratively
herald-mcp refine "add witness section"
herald-mcp refine "require photos for severity > 3"

# Accept when satisfied
herald-mcp observe yes

# Resume anytime
herald-mcp resume
```

## Configuration

### Claude Desktop / Claude Code

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

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HERALD_API_URL` | Yes | CEDA server (default: https://getceda.com) |
| `HERALD_COMPANY` | No | Multi-tenant company context |
| `HERALD_PROJECT` | No | Project context |
| `HERALD_USER` | No | User context |

## Multi-Tenant Isolation

Patterns are isolated by context:

```
Company A patterns → Only visible to Company A
Project X patterns → Only visible to Project X users
```

Set context via environment or headers:
```bash
export HERALD_COMPANY=acme
export HERALD_PROJECT=safety-modules
```

## Herald Context Sync

Herald instances share insights across contexts:

| Tool | Purpose |
|------|---------|
| `herald_context_status` | Check status of Herald instances |
| `herald_share_insight` | Share pattern to other contexts |
| `herald_query_insights` | Query shared insights |
| `herald_sync` | Flush local buffer to cloud |

## Chat Mode

For humans who prefer conversation:

```bash
herald-mcp chat
```

```
You: I need a permit-to-work module
Herald: I've designed a Permit-to-Work module with 5 sections...

You: Add gas testing checklist
Herald: Added gas testing to Pre-Work Safety section...

You: Perfect
Herald: Module accepted and saved.
```

## Command Reference

```bash
herald-mcp init          # Setup for Claude Desktop
herald-mcp chat          # Interactive conversation mode
herald-mcp predict <signal>  # Generate prediction
herald-mcp refine <signal>   # Refine current prediction
herald-mcp resume        # Resume last session
herald-mcp observe <yes|no>  # Accept or reject prediction
herald-mcp new           # Start fresh session
herald-mcp health        # Check CEDA connection
herald-mcp stats         # Show loaded patterns
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   AI Agent  │────▶│   Herald    │────▶│    CEDA     │
│ (Claude/    │     │   (MCP)     │     │  (Pattern   │
│  Devin/etc) │◀────│             │◀────│   Memory)   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ Patterns    │
                    │ Antipatterns│
                    │ Feedback    │
                    └─────────────┘
```

## What is CEDA?

CEDA (Cognitive Event-Driven Architecture) is pattern memory for AI:

- **Patterns**: Approaches that worked (weighted by effectiveness)
- **Antipatterns**: Approaches that failed (avoided in predictions)
- **Feedback loop**: Patterns strengthen or decay based on outcomes

Unlike RAG (retrieves content), CEDA retrieves **what worked**.

## Links

- **CEDA**: https://getceda.com
- **Documentation**: https://getceda.com/docs
- **GitHub**: https://github.com/Spilno-me/ceda

## License

MIT

---

*Herald v1.20.0 — Pattern memory for AI agents*
