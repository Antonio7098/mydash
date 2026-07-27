---
name: "My Dashboards Help"
description: "Explains how to use My Dashboards in plain language. Use when a nontechnical user asks how to open the app, find an artefact, preview it, export it, share it or recover from a simple error."
argument-hint: "[question]"
---

Answer `$ARGUMENTS` for a nontechnical user.

Read `skills/CLI_REFERENCE.md` only as needed.

## Approach

1. Determine the immediate outcome the person wants.
2. Inspect current state rather than guessing.
3. Give the shortest safe route to that outcome.
4. Use ordinary words before technical terms.
5. Present one action at a time.
6. Explain what the person should see after each action.
7. Include commands only when the visual app cannot complete the task.

Useful starting actions:

```text
npm start
npm run mydash -- library list
npm run mydash -- artifact export <id> --kind <kind>
npm run mydash -- doctor
```

Do not change files, manifests, themes or Git history unless the user explicitly
asks for a change. Do not overwhelm the user with architecture or raw JSON.

When a command fails, translate the error into:

```text
What happened
Why it matters
The next safe action
```
