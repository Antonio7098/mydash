# Agent workflows

Project skills are active under:

```text
.claude/skills/<command>/SKILL.md
```

This directory contains shared operating references used by the active skills.
Deterministic work belongs in the `mydash` CLI; skills supply judgement,
workflow and decision rules.

## Catalogue

| Command | Purpose |
| --- | --- |
| `/my-dashboard` | Route a request to the correct My Dashboards workflow |
| `/help` | Explain the app to a nontechnical user |
| `/mydash-help` | Safe explicit alias when Claude Code's native `/help` takes precedence |
| `/spreadsheet` | Inspect and turn spreadsheet/data sources into governed artefact data |
| `/powerpoint` | Inspect or transform PowerPoint sources safely |
| `/dashboard` | Create or update a dashboard artefact |
| `/presentation` | Create or update an HTML presentation artefact |
| `/concept` | Create a lightweight concept or prototype |
| `/component` | Select, create, modify or promote UI resources |
| `/hsbc-visual-standards` | Apply the project’s restrained HSBC-inspired visual language |

There are nine logical product skills. `/mydash-help` is an invocation alias,
not a separate workflow.

`/my-dashboard` indexes and explains the skills. It never maintains an artefact
index. Artefacts are always discovered from the filesystem with `mydash
library`.

## Shared references

- [OPERATING_MODEL.md](OPERATING_MODEL.md) — non-negotiable repository workflow
- [CLI_REFERENCE.md](CLI_REFERENCE.md) — deterministic commands and their purpose
- [ARTIFACT_AUTHORING.md](ARTIFACT_AUTHORING.md) — artefact structure and lifecycle
- [VISUAL_STANDARDS.md](VISUAL_STANDARDS.md) — project visual and accessibility rules
- [EVALUATION_CASES.md](EVALUATION_CASES.md) — prompts for checking routing and behaviour

## Validation

```bash
npm run mydash -- skills list
npm run mydash -- skills inspect dashboard
npm run mydash -- skills validate
npm run test:skills
```
