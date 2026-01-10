# CEDA Deployment Guide

## Quick Start (Local)

```bash
# Clone
git clone https://github.com/Spilno-me/ceda.git
cd ceda

# Install & Build
yarn install
yarn build

# Test
yarn test

# Run HTTP server (port 3030)
yarn serve

# Run Herald MCP (for Claude Desktop)
yarn herald
```

## Verify Installation

```bash
# Health check
curl http://localhost:3030/health

# Test prediction
curl -X POST http://localhost:3030/api/predict \
  -H "Content-Type: application/json" \
  -d '{"input": "create safety assessment module"}'
```

Expected health response:
```json
{"status":"ok","service":"ceda-demo","patternsLoaded":5,"servicesReady":true}
```

## Docker Deployment

```bash
# Build and run
docker compose up -d

# Verify
curl http://localhost:3030/health

# Run Herald MCP via Docker
docker exec -it ceda-ceda-1 yarn herald
```

## Claude Desktop Integration

Add to `~/.claude.json` (or Claude Desktop MCP config):

```json
{
  "mcpServers": {
    "herald": {
      "command": "yarn",
      "args": ["herald"],
      "cwd": "/path/to/ceda"
    }
  }
}
```

For Docker:
```json
{
  "mcpServers": {
    "herald": {
      "command": "docker",
      "args": ["exec", "-i", "ceda-ceda-1", "yarn", "herald"]
    }
  }
}
```

## Herald MCP Tools

| Tool | Description |
|------|-------------|
| `herald_predict` | Generate module structure from natural language |
| `herald_modify` | Apply modification to last prediction |
| `herald_health` | Check service status |
| `herald_observe` | Record observation for learning |
| `herald_patterns` | List available patterns |

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/predict` | POST | Run cognitive pipeline |
| `/api/feedback` | POST | Record user feedback |
| `/api/stats` | GET | Get statistics |

## Remote Deployment (Devin/VM)

1. Clone repo on remote machine
2. Run `yarn install && yarn build`
3. Start server: `yarn serve` (or use Docker)
4. Create tunnel (ngrok, cloudflare, or Devin tunnel)
5. Configure Herald MCP to point to remote URL

Example `.env` for remote Herald MCP client:
```bash
HERALD_API_URL=https://your-tunnel-url.com
HERALD_API_USER=user
HERALD_API_PASS=your-password
```

## Troubleshooting

**Tests fail**: Run `yarn typecheck` to check for type errors

**Port in use**: Check if another process uses 3030: `lsof -i :3030`

**MCP not responding**: Restart Claude Desktop after config changes

## Architecture

```
User → Herald MCP → CEDA Pipeline → Prediction
         ↓
    Signal Processor → Pattern Library → Prediction Engine → Validation
```

All services run in-process (no external dependencies for basic operation).

## Future: Vector + Graph DB

For non-deterministic inference, add Qdrant:

```yaml
# Uncomment in docker-compose.yml
qdrant:
  image: qdrant/qdrant:latest
  ports:
    - "6333:6333"
```
