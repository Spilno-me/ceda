# CEDA Devin Playbook

## Purpose

This playbook teaches Devin how to cooperate with Herald MCP to enrich CEDA's pattern memory.

**Formula:** More patterns → Smarter Devin → Better code → More patterns (exponential)

---

## Herald MCP Integration

Herald is your connection to CEDA's active pattern memory. USE IT.

### Session Start (REQUIRED)

```
1. Read this playbook
2. Call herald_patterns()
3. Apply patterns to your work
4. Avoid antipatterns listed below
```

### During Work

When you hit **friction** (stuck, confused, error):
```
herald_reflect(
  session="Brief context",
  feeling="stuck",
  insight="What went wrong"
)
```

When something **works well** (smooth, elegant, fast):
```
herald_reflect(
  session="Brief context",
  feeling="success",
  insight="What worked"
)
```

### Session End

```
1. Open PR with clear summary
2. Reference patterns used (if any)
3. Wait for Claude review
```

### After PR Review

If pattern from Herald helped your work:
```
herald_pattern_feedback(pattern_text="the pattern", outcome="helped")
```

If pattern didn't help or led you astray:
```
herald_pattern_feedback(pattern_text="the pattern", outcome="didnt_help")
```

---

## Herald Tools Reference

| Tool | When | Example |
|------|------|---------|
| `herald_context(refresh=true)` | After cloning repo | Refresh context from git |
| `herald_patterns()` | Session start | Get all patterns for context |
| `herald_patterns(context="testing")` | Specific domain | Get testing patterns |
| `herald_reflect(session, feeling, insight)` | Friction/success | Capture signal |
| `herald_pattern_feedback(pattern_text, outcome)` | After using pattern | Reinforce/break |
| `herald_simulate(session, feeling, insight)` | Complex analysis | AI-to-AI reflection |

### Context Refresh (IMPORTANT for Devin)

When you clone a repo, Herald may not automatically detect the git context.
Call `herald_context(refresh=true)` after cloning to update context:

```
1. Clone repo: git clone https://github.com/org/repo
2. cd repo
3. herald_context(refresh=true)  # Now context is: org=github-org, project=repo
```

Context is derived from git (trusted, immutable):
- **org**: GitHub org from remote
- **project**: Repo name from remote
- **user**: git config user.name

---

## Validated Patterns (PR Review Approved)

### Architecture
- [ ] *Empty - patterns added after successful PR reviews*

### Code Style
- [ ] *Empty - patterns added after successful PR reviews*

### Testing
- [ ] *Empty - patterns added after successful PR reviews*

---

## Antipatterns (PR Review Feedback)

### Context Confusion
- **KIOSK/ADMIN/WEB are separate contexts** - kiosk-web is for physical kiosks, goprint-web is for website. Always check service map before editing cross-repo.

### Publishing
- **Never publish without explicit cd** - Always `cd /path/to/package && npm publish` to prevent wrong repo publish.

### Herald Usage
- **Don't guess insights** - When calling herald_reflect(), ask what specifically worked/failed. Don't invent signals.
- **Call herald_patterns() first** - Always check existing patterns before starting work. Don't reinvent.

---

## Pattern Propagation

```
user → team → org → orgs → global

Your patterns help everyone. Everyone's patterns help you.
```

When you discover something valuable:
```
herald_share_scoped(
  insight="The insight",
  scope="siblings"  # or "parent" or "all"
)
```

---

## PR Review Protocol

### If PR Approved/Merged

Pattern validated. Add to "Validated Patterns" above:
- What worked
- Why it worked
- Link to PR as evidence

Call:
```
herald_reflect(
  session="PR approved",
  feeling="success",
  insight="What the review validated"
)
```

### If Changes Requested

Check PR comments. Add to "Antipatterns" above:
- What went wrong
- Better approach from review
- Link to PR comment

Call:
```
herald_reflect(
  session="PR changes requested",
  feeling="stuck",
  insight="What should have been done differently"
)
```

---

## The Double Loop

**Loop 1 (Real-time):** You → Herald → CEDA (immediate signals)
**Loop 2 (Async):** You → PR → Claude Review → Playbook (validated patterns)

Both loops make you smarter. Each session compounds.

---

## Revision History

| Date | Change | PR Evidence |
|------|--------|-------------|
| 2026-01-17 | Added Herald integration guide | - |
| 2026-01-16 | Initial playbook created | - |
