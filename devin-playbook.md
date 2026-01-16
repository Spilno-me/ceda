# CEDA Devin Playbook

## Purpose
This playbook is Devin's local pattern buffer for CEDA. Patterns here are validated through PR review.

**Flow:** CEDA patterns → Playbook → Devin work → PR review → Reinforce/Correct → Update playbook

---

## Before Starting Any Task

1. **Read CLAUDE.md** in the repo root
2. **Check Herald patterns**: If Herald MCP is available, call `herald_patterns()` to get current antipatterns
3. **Read this playbook** for validated patterns specific to this codebase

---

## Validated Patterns (Reinforced through PR review)

### Architecture
- [ ] *Empty - patterns added after successful PR reviews*

### Code Style
- [ ] *Empty - patterns added after successful PR reviews*

### Testing
- [ ] *Empty - patterns added after successful PR reviews*

---

## Antipatterns (Learned from PR feedback)

### Context Confusion
- **KIOSK/ADMIN/WEB are separate contexts** - kiosk-web is for physical kiosks, goprint-web is for website. Always check service map before editing cross-repo.

### Publishing
- **Never publish without explicit cd** - Always `cd /path/to/package && npm publish` to prevent wrong repo publish

---

## PR Review Protocol

When PR is reviewed:

### If Approved/Merged
```
Pattern validated. Add to "Validated Patterns" section:
- What worked
- Why it worked
- Link to PR as evidence
```

### If Changes Requested
```
Check PR comments for pattern guidance. Add to "Antipatterns" section:
- What went wrong
- Better approach suggested
- Link to PR comment as evidence
```

---

## Feedback to CEDA

After task completion, if Herald available:
```
herald_pattern_feedback(pattern_id, outcome="helped"|"didnt_help")
```

This closes the loop - validated patterns propagate back to CEDA global memory.

---

## Revision History

| Date | Change | PR Evidence |
|------|--------|-------------|
| 2026-01-16 | Initial playbook created | - |

