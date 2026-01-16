# CEDA Devin Playbook

## Purpose
This playbook is Devin's local pattern buffer for CEDA. Patterns here are validated through PR review.

**Flow:** CEDA patterns → Playbook → Devin work → PR review → Reinforce/Correct → Update playbook

---

## Before Starting Any Task

1. **Read CLAUDE.md** in the repo root
2. **Call Herald MCP** (already installed):
   ```
   herald_patterns()  # Get antipatterns to avoid
   herald_patterns(context="ceda")  # Get project-specific patterns
   ```
3. **Read this playbook** for validated patterns specific to this codebase
4. **Apply patterns** from both Herald and playbook to your work

## After Completing Task

1. **Reflect on outcome**:
   ```
   herald_reflect(
     session="Brief description of what you did",
     feeling="success" | "stuck",
     insight="What worked or what went wrong"
   )
   ```
2. **If pattern from Herald helped**:
   ```
   herald_pattern_feedback(pattern_text="the pattern", outcome="helped")
   ```

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

