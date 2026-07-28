---
name: "My Dashboards Help"
description: "Explains how to use My Dashboards in plain language. Use when a nontechnical user asks how to open the app, find an artefact, preview it, export it, share it or recover from a simple error."
argument-hint: "[question]"
---

Answer `$ARGUMENTS` for a nontechnical user.

Consult `docs/cli-reference.md` only when exact command syntax is needed.

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

## Setup and access

My Dashboards requires Node.js 20 or later and npm. Git is recommended for
persistence and recovery, but browsing, previewing and exporting work without
it. After dependencies are installed, My Dashboards makes no external runtime
requests.

On a Windows work laptop, use a writable extracted folder and run
`start-mydash.cmd`, or run `npm install --no-audit --no-fund` followed by
`npm start`. Open `http://127.0.0.1:4173/`.

### GCP Workstations in VS Code

A GCP Workstation normally has no desktop browser. Work in the remote VS Code
window and open My Dashboards through a forwarded-port link in the browser on
the local computer.

1. Open **Terminal → New Terminal** in VS Code.
2. Node.js, npm and Python are already installed. From the repository directory,
   install project dependencies if needed:

   ```text
   npm install --no-audit --no-fund
   ```

3. Start My Dashboards:

   ```text
   npm start
   ```

   Keep this terminal running. My Dashboards listens on port 4173 by default.

4. Open VS Code’s **Ports** tab. It is normally beside the Terminal tab in the
   bottom panel. If it is hidden, open the Command Palette and run
   **Ports: Focus on Ports View**.
5. If port **4173** is not detected automatically, select **Forward a Port**,
   enter `4173` and confirm.
6. In the row for port 4173, use the **Open in Browser** globe/link action, or
   copy the value in **Forwarded Address** and open it in the local computer’s
   browser. That generated address is the link to My Dashboards; do not try to
   open `127.0.0.1:4173` in a nonexistent browser inside the workstation.
7. Keep the port visibility **Private** unless the user explicitly needs to
   share it and organisational policy permits that change.

Keep `MYDASH_HOST=127.0.0.1`; VS Code performs the forwarding. If port 4173 is
occupied, stop the conflicting process or start My Dashboards with another
`MYDASH_PORT`, then forward that same port in the Ports tab. Do not weaken
corporate proxy, registry or workstation access controls when installation or
forwarding is blocked; use the approved organisational configuration.

Use these checks when installation verification is requested:

```text
npm run check:source
npm run validate
npm test
npm run smoke
```

## Navigator and appearance

The main human routes are dashboards, presentations, concepts, the visual
component library and settings. The visual library at `/components` shows
canonical references, lifecycle ownership, source paths, props, variants,
supported themes, dependencies and consumers. It does not automatically
promote or edit shared resources.

The Navigator shows content for the user in `config/workspace.json`. If someone
needs to see another user's dashboards, presentations or concepts, update the
workspace `user` to that existing user's kebab-case value, validate, and reload
the page. Change only the workspace setting; do not rename or reassign the
other user's artefacts. Shared UI resources remain visible to every user. This
is organisational scoping, not sign-in or access control.

Explain the three appearance scopes distinctly:

- Preview only is temporary and encoded in the preview URL.
- Personal is stored in browser localStorage for one artefact.
- Artefact default changes `artifact.json`, validates, creates a focused Git
  checkpoint and pushes safely when possible.

Theme and preset are the main appearance choices. Layout, component, primitive
and asset-slot overrides are advanced controls. Artefact-default changes
require a Git repository, current workspace revision and clean target manifest;
preview and personal choices do not.

## Recovery

- If port 4173 is occupied, choose another port with `MYDASH_PORT`.
- If Git is unavailable, continue browsing, previewing and exporting. Initialise
  Git and configure commit identity only when focused checkpoints or
  artefact-default appearance changes are needed.
- If a resource or artefact is missing, run `npm run validate` and
  `npm run mydash -- library scan`; scoped diagnostics are also available in
  Settings and resource-detail pages.
- If npm installation is blocked, use the approved company registry or proxy
  and do not disable corporate controls.

Do not change files, manifests, themes or Git history unless the user explicitly
asks for a change. Do not overwhelm the user with architecture or raw JSON.

When a command fails, translate the error into:

```text
What happened
Why it matters
The next safe action
```

## Capture recurring guidance

After resolving confusion or a difficult setup/recovery problem, decide whether
another nontechnical user is likely to encounter the same issue. If so, add the
smallest durable insight to this `/help` skill in the relevant section.

Only add guidance when the cause and safe resolution are understood. Keep it
plain, general and action-oriented; say what the user should do and what they
should see. Do not add conversation history, personal data, credentials,
machine-specific paths, uncertain guesses or one-off project details. Reuse or
correct existing guidance instead of creating a duplicate, and keep the skill
concise. Validate the skill catalogue after changing it.

This is the exception to the no-file-change rule above: a confirmed, likely
recurring help insight may be maintained here without a separate content
request. Do not use that exception to change application code, manifests,
themes, artefacts or Git history.

When investigation confirms a reproducible MyDash system bug, add or update its
entry in `BUG_LOG.md`. When the bug is fixed, record its cause, resolution and
validation. Do not log ordinary dashboard, presentation, concept or reusable
resource content changes.
