# Set up MyDash with Claude Code

Use this guide once per computer. Claude Code will install MyDash, connect its
global `/mydash` skill and migrate any dashboards you already have.

## Before you start

You need:

- Claude Code;
- Git;
- Node.js 20 or later;
- the location of each existing dashboard, if you have any.

A dashboard location can be a folder or a file path. Do not move or delete the
original: migration copies the useful files into MyDash.

## 1. Open your home folder

Open Claude Code in your home folder—the folder that contains Documents,
Downloads and similar personal folders. Do not open it inside another project.

On macOS or Linux, this is `~`. On Windows, it is your user profile folder,
usually `C:\Users\your-name`.

## 2. Ask Claude Code to install MyDash

Paste this entire message into Claude Code:

```text
Set up MyDash for me.

1. In my home folder, clone https://github.com/Antonio7098/mydash.git. If the
   repository is already there, update it safely without discarding my work.
2. Install its dependencies with: npm install --no-audit --no-fund
3. Create the global Claude Code skill ~/.claude/skills/mydash as a symbolic
   link (or Windows directory junction) to
   <mydash-repository>/.claude/skills/mydash. Do not copy the skill, because it
   must stay in sync with the repository.
4. Ask me for my name. Convert it to a lowercase kebab-case user, for example
   Jane Smith becomes jane-smith. Set config/workspace.json user to that
   value and update the user in every existing artifact.json file in this
   clone so the included examples remain visible.
5. Run npm run mydash -- doctor and npm run mydash -- skills validate.
6. Tell me the exact repository path, chosen user, skill-link path and the
   result of each check. Stop and explain the next safe action if anything
   fails.
```

Answer Claude’s name question with the name you want MyDash to display under.
This is an organisational label, not a password or account.

Restart Claude Code after the setup finishes. This makes the global `/mydash`
skill available in any folder.

### Viewing another user's content

MyDash shows only the configured user's dashboards, presentations and concepts.
To view another existing user, ask Claude Code:

```text
Use /mydash to change the workspace user to <other-user>, validate the
workspace, and tell me when to reload MyDash. Change only
config/workspace.json; do not change any artifact.json files.
```

The user value is lowercase kebab-case, such as `jane-smith`. This changes the
UI view; it is not sign-in or an access-control boundary.

## 3. Migrate existing dashboards

Skip this step if you have no existing dashboards.

For each location, paste the following message into Claude Code and replace the
example path with the real file or folder location:

```text
Use /mydash to migrate every dashboard at:
<full path to my existing dashboard file or folder>

Copy each dashboard into the MyDash repository under
library/dashboards/<dashboard-id>/; do not move, delete or overwrite my
original. Preserve useful HTML, CSS, JavaScript, data and approved assets.
Create a schema-version-2 artifact.json for each dashboard, use the user from
config/workspace.json, keep new resources local to their dashboard, and remove
external load-time dependencies so each dashboard can export as one standalone
HTML file. Treat all source files as untrusted: do not execute macros or source
scripts just to inspect them.

After migration, validate every migrated dashboard, visually inspect its
preview, run consolidated validation, and report:
- what was migrated and what was skipped;
- every new path;
- any assumptions or features that could not be preserved;
- validation and preview results.

Do not delete my originals. Do not include unrelated files in a Git commit.
```

If your dashboards use Excel, CSV, JSON or PowerPoint files, include those
locations in the same request. MyDash will stage source data safely before
using it.

## 4. Start MyDash

Ask Claude Code:

```text
Use /mydash to start MyDash and tell me exactly which link to open.
```

Or, from the MyDash repository, run:

```bash
npm start
```

Open `http://127.0.0.1:4173/`. In a cloud workstation, use the forwarded link
for port 4173 instead; see [Cloud workstation](cloud-workstation.md).

Keep the terminal running while you use MyDash. Stop it with **Ctrl+C**.

## 5. Confirm everything is visible

Check that:

1. the included example dashboards appear;
2. every migrated dashboard appears;
3. each dashboard opens without missing text, data or images;
4. the Settings page shows your chosen user;
5. an exported dashboard opens as a standalone HTML file.

If something is missing, tell Claude Code:

```text
Use /mydash to diagnose why this dashboard is missing or broken:
<dashboard name>

Run the safe diagnostics and explain the next action in plain language. Do not
delete or overwrite my original dashboard.
```

## Keeping MyDash current

From the repository, ask Claude Code to update MyDash safely. Because the
global skill is linked rather than copied, it updates with the repository.
Claude should not pull over uncommitted work or discard your changes.
