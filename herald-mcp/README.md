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
cd your-project
npx @spilno/herald-mcp init
```

**What this does:**
1. Creates `.mcp.json` with Herald MCP configuration
2. Fetches learned patterns from CEDA (if any exist)
3. Creates/updates `CLAUDE.md` with patterns baked in

Company and project default to your folder name. Zero config.

## Init Options

```bash
npx @spilno/herald-mcp init [options]
```

| Option | Description |
|--------|-------------|
| `--sync`, `-s` | Just sync patterns to CLAUDE.md (quick update) |
| `--hookify` | Generate hookify rules for auto pattern reminders |
| `--company`, `-c` | Override company (default: folder name) |
| `--project`, `-p` | Override project (default: folder name) |
| `--user`, `-u` | Override user (default: "default") |
| `--force`, `-f` | Overwrite existing config |
| `--help`, `-h` | Show help |

**Examples:**
```bash
# Basic setup (zero config)
npx @spilno/herald-mcp init

# Sync latest patterns to CLAUDE.md
npx @spilno/herald-mcp init --sync

# Add auto-reminder hooks
npx @spilno/herald-mcp init --hookify

# Custom context
npx @spilno/herald-mcp init --company acme --project safety
```

## Pattern Inheritance

Patterns cascade from specific to broad:

```
user (your personal patterns)
  ↓ inherits from
project (team patterns)
  ↓ inherits from
company (org-wide patterns)
```

More specific patterns take precedence. If you have a pattern and your company has the same one, yours wins.

## MCP Resources

Herald exposes patterns as MCP resources (auto-readable by Claude Code):

| Resource | Description |
|----------|-------------|
| `herald://patterns` | Learned patterns for current context |
| `herald://context` | Current configuration (company/project/user) |

## Core Tools

| Tool | Purpose |
|------|---------|
| `herald_patterns` | Query what worked before (with inheritance) |
| `herald_reflect` | Capture patterns and antipatterns |
| `herald_predict` | Generate structure from natural language |
| `herald_refine` | Refine predictions with feedback |
| `herald_feedback` | Reinforce helpful patterns |

### Pattern Capture

When something works or fails, capture it:

```
User: "Herald reflect - that was smooth"
Claude: "What specifically worked?"
User: "The ASCII visualization approach"
→ Pattern captured, available in future sessions
```

```
User: "Herald reflect - that was rough"
Claude: "What went wrong?"
User: "Forgot to check existing tests before refactoring"
→ Antipattern captured, Claude will avoid this
```

## Hookify Integration

Add auto-reminders with `--hookify`:

```bash
npx @spilno/herald-mcp init --hookify
```

This creates rules in `.claude/` that:
- **On prompt**: Remind to check patterns at session start
- **On session end**: Remind to capture patterns before leaving

Requires [hookify plugin](https://github.com/anthropics/claude-code/tree/main/plugins/hookify).

## Configuration

### Files Created

| File | Purpose |
|------|---------|
| `.mcp.json` | MCP server configuration for Claude Code |
| `CLAUDE.md` | Project instructions with baked patterns |
| `.claude/hookify.*.local.md` | Auto-reminder rules (if --hookify) |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CEDA_URL` | https://getceda.com | CEDA backend URL |
| `HERALD_COMPANY` | folder name | Company context |
| `HERALD_PROJECT` | folder name | Project context |
| `HERALD_USER` | "default" | User context |

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Claude    │────▶│   Herald    │────▶│    CEDA     │
│   Code      │     │   (MCP)     │     │  (Pattern   │
│             │◀────│             │◀────│   Memory)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │            ┌──────┴──────┐
       │            │ Patterns    │
       └───────────▶│ Antipatterns│
    (auto-reads     │ Inheritance │
     resources)     └─────────────┘
```

1. **Session Start**: Claude reads `herald://patterns` resource
2. **During Work**: Patterns guide behavior
3. **Session End**: Capture new patterns with `herald_reflect`
4. **Next Session**: New patterns available automatically

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

*Herald v1.25.0 — Pattern memory for AI agents*
