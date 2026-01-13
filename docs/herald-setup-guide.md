# Herald MCP Setup Guide

Quick setup for Herald MCP in Claude CLI.

---

## Prerequisites

- Node.js 18+
- Claude CLI installed

---

## Setup (2 minutes)

### Step 1: Create config file

In your project root, create `.mcp.json`:

```json
{
  "mcpServers": {
    "herald": {
      "command": "npx",
      "args": ["@spilno/herald-mcp"],
      "env": {
        "CEDA_URL": "https://getceda.com",
        "HERALD_COMPANY": "your-company",
        "HERALD_PROJECT": "your-project"
      }
    }
  }
}
```

> Replace `your-company` and `your-project` with your actual values.

### Step 2: Restart Claude CLI

Close and reopen Claude CLI in your project directory.

### Step 3: Verify connection

Run:
```
/mcp
```

You should see `herald` listed as connected.

---

## What you get

- **Pattern predictions** - CEDA suggests module structures based on your input
- **Learning loop** - Your observations feed back to improve patterns
- **Shared patterns** - Access to methodology patterns across the organization

---

## Test it

Ask Claude something like:

> "What patterns apply to user authentication?"

Herald will query CEDA and return relevant patterns.

---

## Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `CEDA_URL` | CEDA backend URL | `https://getceda.com` |
| `HERALD_COMPANY` | Your organization | `spilno`, `goprint` |
| `HERALD_PROJECT` | Your project name | `salvador`, `mobidruk` |

---

## Troubleshooting

**Herald not showing in `/mcp`?**
- Check `.mcp.json` is in project root
- Ensure valid JSON syntax
- Restart Claude CLI

**Connection errors?**
- Verify `CEDA_URL` is correct
- Check internet connection
