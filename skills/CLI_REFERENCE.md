# `mydash` CLI reference

Use the repository script form:

```bash
npm run mydash -- <command>
```

Use `--json` when an agent needs machine-readable output.

## Orientation

```bash
npm run mydash -- doctor
npm run mydash -- git status
npm run mydash -- library scan
npm run mydash -- library list
npm run mydash -- appearance validate
```

## Files

```bash
npm run mydash -- file identify <path>
npm run mydash -- file hash <path>
npm run mydash -- file tree <directory>
npm run mydash -- file find <query>
npm run mydash -- file safe-name <text>
```

## Excel

```bash
npm run mydash -- excel inspect <workbook.xlsx>
npm run mydash -- excel sheets <workbook.xlsx>
npm run mydash -- excel preview <workbook.xlsx> --sheet <name>
npm run mydash -- excel formulas <workbook.xlsx>
npm run mydash -- excel extract <workbook.xlsx> --output <path>
npm run mydash -- excel extract-table <workbook.xlsx> --table <name> --output <path>
```

Excel inspection never runs macros or recalculates formulas.

## PowerPoint

```bash
npm run mydash -- powerpoint inspect <presentation.pptx>
npm run mydash -- powerpoint outline <presentation.pptx>
npm run mydash -- powerpoint read <presentation.pptx>
npm run mydash -- powerpoint extract <presentation.pptx> --output <directory>
```

Use `npm run mydash -- help powerpoint` if an installed command differs.

## Data

```bash
npm run mydash -- data inspect <file>
npm run mydash -- data profile <file>
npm run mydash -- data convert <file> --output <path>
npm run mydash -- data select <file> --columns <list> --output <path>
npm run mydash -- data filter <file> --where <expression> --output <path>
npm run mydash -- data deduplicate <file> --key <columns> --output <path>
npm run mydash -- data create-recipe <source> ...
npm run mydash -- data refresh <recipe>
```

## Library and appearance

```bash
npm run mydash -- library list
npm run mydash -- library inspect <id> --kind <kind>
npm run mydash -- library consumers <id> --kind <kind>
npm run mydash -- appearance resolve <artefact-id> --kind <kind>
npm run mydash -- appearance validate
```

There is no manually maintained artefact index.

## Artefacts and export

```bash
npm run mydash -- artifact inspect <id> --kind <kind>
npm run mydash -- artifact dependencies <id> --kind <kind>
npm run mydash -- artifact validate <id> --kind <kind>
npm run mydash -- artifact export <id> --kind <kind>
```

## Validation and impact

```bash
npm run mydash -- validate
npm run mydash -- validate --artifact <id> --kind <kind>
npm run mydash -- impact core/<id> --kind <kind>
npm run mydash -- impact <collection>/<id> --kind <kind>
npm run mydash -- impact local/<artefact>/<id> --kind <kind>
```

## Checkpoint

```bash
npm run mydash -- git checkpoint \
  <explicit-path...> \
  --message "<focused message>"
```

For reviewed shared-resource changes:

```bash
npm run mydash -- git checkpoint \
  <explicit-path...> \
  --message "<focused message>" \
  --acknowledge-impact
```

## Skills

```bash
npm run mydash -- skills list
npm run mydash -- skills inspect <command>
npm run mydash -- skills validate
```
