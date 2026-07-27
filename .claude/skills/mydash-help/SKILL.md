---
name: "My Dashboards Help Alias"
description: "Reliable explicit alias for project-specific My Dashboards help when the native /help command takes precedence."
argument-hint: "[question]"
disable-model-invocation: true
---

Apply the complete help workflow in `.claude/skills/help/SKILL.md` to:

```text
$ARGUMENTS
```

Keep the answer plain, practical and nontechnical. Do not modify repository
content unless the user explicitly asks for a change.
