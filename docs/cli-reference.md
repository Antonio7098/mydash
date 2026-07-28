# `mydash` CLI reference

This is the authoritative command reference for the checked-in `mydash` CLI.
Agent skills contain workflow and judgement; this document records the exact
deterministic interface.

Use the repository script form so the checked-in CLI is always used:

```bash
npm run mydash -- <command>
```

Use `--json` whenever a decision depends on command output. Most commands also
accept `--workspace <path>`; source-reading commands accept `--allow-outside`
only for explicit, read-only access beyond that workspace.

Artefact-aware commands default to `userId` in `config/workspace.json`. Add
`--all-users` only when the requested operation must span the whole workspace.
Reusable resources and impact analysis remain global.

## Orientation and inspection

```bash
npm run mydash -- help [command]
npm run mydash -- version
npm run mydash -- doctor
npm run mydash -- inspect <file-or-directory>
npm run mydash -- git status
```

`inspect` identifies a file or directory and recommends relevant next steps.

## Files

```bash
npm run mydash -- file identify <path>
npm run mydash -- file hash <path> [--algorithm sha256|sha512]
npm run mydash -- file tree <directory> [--depth 3] [--hidden]
npm run mydash -- file find "**/*.json" --root <directory> [--max-results 200] [--hidden]
npm run mydash -- file safe-name <text> [--extension html]
```

## Excel

Modern `.xlsx` and `.xlsm` workbooks are inspected without executing macros or
recalculating formulas.

```bash
npm run mydash -- excel inspect <workbook.xlsx>
npm run mydash -- excel sheets <workbook.xlsx>
npm run mydash -- excel preview <workbook.xlsx> --sheet <name> --range A1:E10 --formulas
npm run mydash -- excel formulas <workbook.xlsx> [--sheet <name>] [--max-results 500]
npm run mydash -- excel extract <workbook.xlsx> --sheet <name> --range A1:E10 --output <path> --format csv --overwrite
npm run mydash -- excel extract-table <workbook.xlsx> --table <name> --output <path> --format json --overwrite
```

Extract supports JSON, CSV and NDJSON. `--no-header` and `--formulas` are
available when explicitly needed.

## PowerPoint

Modern `.pptx` and `.pptm` files are inspected without executing macros.

```bash
npm run mydash -- powerpoint inspect <presentation.pptx>
npm run mydash -- powerpoint outline <presentation.pptx>
npm run mydash -- powerpoint notes <presentation.pptx>
npm run mydash -- powerpoint extract <presentation.pptx> --output <directory> --include-images --overwrite
npm run mydash -- powerpoint images <presentation.pptx> --output <directory> --overwrite
```

There is no `powerpoint read` command.

## Data and recipes

```bash
npm run mydash -- data inspect <file> [--max-rows 1000]
npm run mydash -- data profile <file> [--top-values 5]
npm run mydash -- data convert <file> --output <path> --format json --overwrite
npm run mydash -- data select <file> --columns "id,status" --output <path> --format csv --overwrite
npm run mydash -- data filter <file> --where "status=Review" --output <path> --format json --overwrite
npm run mydash -- data deduplicate <file> --key id --output <path> --format csv --overwrite
npm run mydash -- data create-recipe <source> --id <id> --recipe <path> --output <path> --format json --output-overwrite --overwrite
npm run mydash -- data refresh <recipe.json> --overwrite [--no-provenance]
npm run mydash -- data stage <source> --artifact <id> --kind <kind> --source <source-id> [--force] [--no-history]
npm run mydash -- data sync <artifact> --kind <kind> --source <source-id> [--force] [--no-history]
npm run mydash -- data refresh-artifact <artifact> --kind <kind>
npm run mydash -- data status <artifact> --kind <kind>
```

Supported tabular formats are CSV, JSON and NDJSON. Write operations require
explicit outputs and do not overwrite existing files without `--overwrite`.
Excel is supported as a staged recipe source. See
[Data refresh](data-refresh.md) for source policies, live-local configuration,
quality gates, transactional publication and scheduling.

## Library, appearance and impact

```bash
npm run mydash -- library scan
npm run mydash -- library list [--kind <kind>] [--level core|collection|local] [--collection <id>]
npm run mydash -- library inspect <id> --kind <kind>
npm run mydash -- library consumers <id> --kind <kind>
npm run mydash -- library diagnostics
npm run mydash -- appearance resolve <artefact-id> --kind <kind>
npm run mydash -- appearance validate
npm run mydash -- impact <resource-id> --kind <kind> --change contract [--fail-if-consumed]
```

Use qualified impact references where needed: `core/<id>`,
`<collection>/<id>`, or `local/<artefact>/<id>`.

## Artefacts, export and validation

```bash
npm run mydash -- artifact inspect <id> --kind <kind>
npm run mydash -- artifact dependencies <id> --kind <kind>
npm run mydash -- artifact validate <id> --kind <kind> [--max-bytes <number>]
npm run mydash -- artifact export <id> --kind <kind> --output <path> --overwrite [--minify] [--max-bytes <number>]
npm run mydash -- validate [--artifact <id> --kind <kind>] [--skip-exports] [--skip-recipes] [--minify] [--max-bytes <number>] [--fail-on-warning] [--report <path>]
```

`library`, `appearance`, `artifact`, `validate` and `git checkpoint` accept
`--all-users`.

Exports are standalone HTML intended to work through `file://`.

## Git checkpoints

```bash
npm run mydash -- git status
npm run mydash -- git checkpoint <explicit-path...> --message "<focused message>" --dry-run --no-push
npm run mydash -- git checkpoint <explicit-path...> --message "<focused message>" --acknowledge-impact --no-push
```

Checkpoints validate before staging. Use `--acknowledge-impact` only after
reviewing consumers of a changed shared resource.

## Skills

```bash
npm run mydash -- skills list
npm run mydash -- skills inspect <command>
npm run mydash -- skills validate
```
