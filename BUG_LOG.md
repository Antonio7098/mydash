# MyDash bug and system change log

This log records changes to the MyDash system itself. Keep it useful as a
compact operational history, not as a duplicate Git log.

## What belongs here

- a reproducible bug that is found, whether still open or fixed;
- the cause and resolution of a fixed bug;
- a change to Navigator, CLI, server, discovery, validation, resolution,
  export, workspace, Git or shared system behaviour;
- a compatibility, migration or operational consequence of a system change.

Do not record routine creation or editing of dashboards, presentations,
concepts, primitives, components, layouts, themes, presets or assets. Record
those only when the work also changes the system that discovers, validates,
renders, exports or manages them.

## Entry format

Add the newest entry first.

```markdown
## YYYY-MM-DD — Short title

- Type: Bug | Fix | System change
- Status: Open | Fixed | Complete
- Area: Navigator | CLI | Server | Library | Validation | Export | Workspace | Git
- Summary: What happened or changed.
- Cause: Why the bug occurred, when applicable.
- Resolution: What fixed it or how the system now behaves.
- Validation: Checks that demonstrate the current state.
- References: Relevant paths, issue IDs or commits.
```

Omit fields that genuinely do not apply. Update an existing open bug entry when
it is fixed instead of creating a disconnected duplicate.

## 2026-07-27 — System change log introduced

- Type: System change
- Status: Complete
- Area: Workspace
- Summary: Replaced the static release checklist with a maintained bug and
  system-change history.
- Resolution: Added this log and made system-change logging part of the agent
  workflows.
- References: `BUG_LOG.md`, `.claude/skills/`
