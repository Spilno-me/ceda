# CEDA-41: Herald MCP Context Format and Query Params Fix

## Postmortem

**Date:** 2026-01-13
**PR:** [#24](https://github.com/Spilno-me/ceda/pull/24)
**Status:** Fixed

---

## The Scenario

When using Herald to analyze a project by calling `herald_predict` with:

```
signal: "Analyze the salvador-mcp project..."
context: "Project at /Users/adrozdenko/Desktop/salvador-mcp..."
```

Two errors occurred that prevented Herald from communicating with CEDA.

---

## Error 1: Context Format Mismatch

### Symptom

```
TypeError: (body.context || []).map is not a function
```

### Why It Happened

| Component | Expected Format | Actual Format |
|-----------|-----------------|---------------|
| **CEDA Server** | `context: [{ type: "...", value: "...", source: "..." }]` | - |
| **Herald MCP** | - | `context: "string"` |

Herald's MCP tool schema defined `context` as a simple string:

```typescript
context: { type: "string", description: "Additional context" }
```

But CEDA's server expected an array of structured objects and tried to call `.map()` on it:

```typescript
// server.ts line 306
const requestContext = (body.context || []).map((c) => ({
  ...c,
  timestamp: new Date(),
}));
```

When you pass a string to `.map()`, JavaScript throws `TypeError` because strings don't have a `.map()` method (arrays do).

### Fix

Convert string context to CEDA's expected array format in Herald MCP:

```typescript
// herald-mcp/src/index.ts
const context = contextStr
  ? [{ type: "user_context", value: contextStr, source: "herald" }]
  : undefined;
```

---

## Error 2: Query Parameter Pollution

### Symptom

```
herald_stats → HTTP 404: Not Found
```

### Why It Happened

Herald's `callCedaAPI` function automatically added tenant parameters to ALL `/api/` GET requests:

```typescript
// Before fix
if (method === "GET" && endpoint.startsWith("/api/")) {
  url += `?company=${HERALD_COMPANY}&project=${HERALD_PROJECT}&user=${HERALD_USER}`;
}
```

This transformed:
- `/api/stats` → `/api/stats?company=demo&project=default&user=claude`

But CEDA's route matching used exact string comparison:

```typescript
// server.ts line 473
if (url === '/api/stats' && method === 'GET') {  // Doesn't match with query params!
```

The URL with query params didn't match, so CEDA returned 404.

### Fix

Only add tenant params to endpoints that actually need them:

```typescript
// herald-mcp/src/index.ts
const needsTenantParams = endpoint.startsWith("/api/patterns") ||
                          endpoint.startsWith("/api/session/") ||
                          endpoint.startsWith("/api/observations");
if (method === "GET" && needsTenantParams) {
  const separator = endpoint.includes("?") ? "&" : "?";
  url += `${separator}company=${HERALD_COMPANY}&project=${HERALD_PROJECT}&user=${HERALD_USER}`;
}
```

---

## Root Cause Summary

| Bug | Root Cause | Layer |
|-----|------------|-------|
| Context format | **API contract mismatch** - Herald and CEDA had different expectations for the `context` field | Integration |
| Query params | **Over-eager parameter injection** - Herald added params to endpoints that don't need them | Herald MCP |

Both bugs existed because Herald MCP was developed separately from CEDA's actual API expectations. The fix aligned Herald's behavior with what CEDA actually accepts.

---

## Lessons Learned

1. **API contracts should be explicit** - Document the exact format expected by each endpoint
2. **Don't assume all endpoints need the same parameters** - Be selective about what gets added automatically
3. **Integration testing between components** - Herald and CEDA should have shared integration tests

---

## Files Changed

- `herald-mcp/src/index.ts` (+18 lines, -3 lines)

## Test Verification

- [x] `herald_health` returns status
- [x] `herald_stats` returns server statistics
- [x] `herald_predict` with context parameter works
- [x] `herald_refine` with context parameter works
- [x] Multi-turn sessions work correctly
