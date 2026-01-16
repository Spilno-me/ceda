# CEDA MVP Lifecycle Implementation

## Overview

Complete the full user lifecycle:
1. Onboarding → CLI → Herald confirms immutable git context
2. User uses Herald → Reviews patterns on CEDA web
3. Hit limits → Payment required

## Tasks

### CEDA-90: Usage Tracking & Limits

**Goal:** Track usage per user and enforce tier limits

**Endpoints to add:**
```
GET  /api/usage         - Get current user's usage stats
POST /api/usage/track   - Internal: increment usage (called by Herald endpoints)
```

**Data model:**
```typescript
interface UserUsage {
  userId: string;
  plan: 'free' | 'pro' | 'team';
  patterns: { used: number; limit: number };   // Free: 100, Pro: 10000, Team: -1
  queries: { used: number; limit: number };    // Free: 1000/mo, Pro: -1, Team: -1
  projects: { used: number; limit: number };   // Free: 1, Pro: -1, Team: -1
  periodStart: string;  // ISO date, reset monthly
}
```

**Limits (from pricing):**
- Free: 1 project, 100 patterns, 1000 queries/month
- Pro ($9/mo): Unlimited projects, 10K patterns, unlimited queries
- Team ($29/seat/mo): Everything unlimited + org sharing

**Implementation:**
1. Add usage table/storage (can use Upstash Redis or simple JSON file initially)
2. Middleware to check limits before pattern operations
3. Return 429 with upgrade link when limit exceeded

### CEDA-91: Stripe Billing Integration

**Goal:** Accept payments for Pro and Team tiers

**Endpoints to add:**
```
POST /api/billing/checkout    - Create Stripe checkout session
POST /api/billing/webhook     - Handle Stripe webhooks
GET  /api/billing/portal      - Redirect to Stripe customer portal
```

**Environment variables needed:**
```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_TEAM=price_...
```

**Stripe products to create:**
1. CEDA Pro - $9/month (price_pro)
2. CEDA Team - $29/seat/month (price_team)

**Webhook events to handle:**
- `checkout.session.completed` → Upgrade user plan
- `customer.subscription.deleted` → Downgrade to free
- `invoice.payment_failed` → Mark subscription as past_due

### CEDA-92: Patterns Dashboard (Web)

**Goal:** Logged-in users can view their patterns on web

**Pages to create:**
```
/dashboard.html    - Already exists, enhance with patterns view
```

**Sections needed:**
1. **Your Patterns** - List of captured patterns with timestamps
2. **Antipatterns** - Things that didn't work
3. **Usage Stats** - Visual progress bars for limits
4. **Activity Feed** - Recent reflects, queries

**API calls from frontend:**
```javascript
// Get patterns
GET /api/herald/reflections?user=X

// Get usage
GET /api/usage
```

**UI components:**
- Pattern card (insight, feeling, timestamp)
- Usage meter (patterns: 45/100, queries: 234/1000)
- Empty state when no patterns yet

### CEDA-93: End-to-End Test Flow

**Goal:** Verify complete lifecycle works

**Test script:**
```bash
#!/bin/bash
# 1. Fresh user login
npx @spilno/herald-mcp login

# 2. Get config
npx @spilno/herald-mcp config

# 3. Use Herald (capture pattern)
# (In Claude Code or other MCP client)
# herald_reflect(session="test", feeling="success", insight="test pattern")

# 4. View on web
# Open https://app.getceda.com/dashboard
# Verify pattern appears

# 5. Check usage
npx @spilno/herald-mcp upgrade
# Should show usage stats

# 6. Test limit (if near)
# Capture more patterns until limit hit
# Should see 429 error with upgrade link
```

## Acceptance Criteria

1. [ ] `npx @spilno/herald-mcp login` opens browser, completes OAuth, stores token
2. [ ] `npx @spilno/herald-mcp config` outputs valid MCP JSON with auth
3. [ ] Herald MCP tools work with authenticated user
4. [ ] Patterns appear on web dashboard
5. [ ] Usage stats show correct numbers
6. [ ] Hitting limit returns 429 with upgrade link
7. [ ] Stripe checkout creates subscription
8. [ ] Upgraded user has higher limits

## Priority Order

1. CEDA-90 (Usage) - Foundation for limits
2. CEDA-92 (Dashboard) - Show value to users
3. CEDA-91 (Billing) - Monetization
4. CEDA-93 (E2E Test) - Validation

## Notes

- Herald already has CLI scaffolding committed (login, logout, config, upgrade)
- Backend OAuth already supports CLI callback
- Focus on connecting the pieces, not building new
- Keep it simple - MVP, not perfect
