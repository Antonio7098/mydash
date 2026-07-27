# MyDash v0.1.0 — Systematic Acceptance Test Guide

This guide tests the complete MyDash roadmap: installation, CLI, filesystem utilities, Excel and PowerPoint inspection, tabular data tools, recipes and provenance, library discovery, appearance resolution, standalone export, navigator, gallery, viewer, appearance scopes, Git safety, agent skills, failure handling, and work-laptop operation.

The commands below are written for **PowerShell on Windows**. Run them from the extracted `mydash` directory unless a step says otherwise.

---

## 1. Test strategy

Use three passes:

1. **Clean extracted pass — no Git repository**
   - Proves MyDash can run from the release zip.
   - Tests installation, automated suites, CLI, server, browser, Office/data utilities, preview and export.
2. **Git-enabled pass**
   - Proves focused checkpoints and artefact-default appearance saves.
   - Uses a local repository and no remote push.
3. **Negative and recovery pass**
   - Introduces invalid files and conflict conditions deliberately.
   - Always restores the clean baseline afterwards.

Do not run destructive tests in the only copy of the release.

### Result states

Mark every test:

- `[PASS]` — observed result matches the pass criteria.
- `[FAIL]` — result is wrong or the command exits unexpectedly.
- `[BLOCKED]` — company policy, permissions, registry or missing software prevents the test.
- `[SKIP]` — optional capability is intentionally unavailable.

For failures, record:

```text
Test ID:
Command or action:
Expected:
Actual:
Exit code / HTTP status:
Relevant log:
Screenshot or output path:
```

---

# PASS A — Clean extracted installation

## A01 — Verify the release archive

Expected SHA-256:

```text
f00fc1beb0cbf09e5227fc3114650979019928a2c43cb196abb0df9b0153a276
```

Run against the downloaded zip:

```powershell
Get-FileHash .\mydash-v0.1.0.zip -Algorithm SHA256
```

**Pass criteria**

- Hash exactly matches the expected value.
- The zip extracts into one top-level `mydash` directory.
- The extracted directory does not contain `node_modules` or `.git`.

---

## A02 — Extract into a writable location

Recommended location:

```powershell
$Root = Join-Path $env:USERPROFILE "mydash-acceptance"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive .\mydash-v0.1.0.zip -DestinationPath $Root
Set-Location (Join-Path $Root "mydash")
```

Confirm:

```powershell
Test-Path .\package.json
Test-Path .\config\workspace.json
Test-Path .\library\dashboards\ai-use-case-governance\artifact.json
```

**Pass criteria**

All three commands return `True`.

---

## A03 — Check workstation requirements

```powershell
node --version
npm --version
git --version
```

**Pass criteria**

- Node reports version 20 or later.
- npm runs.
- Git may be unavailable during the no-Git pass; record `[SKIP]` for Git-only tests if company policy prevents installation.

Optional tools:

```powershell
python --version
libreoffice --version
```

Python and LibreOffice are optional. LibreOffice is only needed for optional rendering or recalculation workflows, not basic workbook/presentation inspection.

---

## A04 — Install pinned dependencies

Prefer the lockfile-controlled install:

```powershell
npm ci --no-audit --no-fund
```

If the company network requires an approved registry, configure it according to internal policy and rerun.

**Pass criteria**

- Exit code is zero.
- `node_modules` is created.
- No package-lock mismatch is reported.
- No source file is modified unexpectedly.

Record the registry used:

```powershell
npm config get registry
```

---

## A05 — Run release gates

Run in this order:

```powershell
npm run check:source
npm run validate:contracts
npm run validate
npm test
npm run smoke
```

**Pass criteria**

- Every command exits zero.
- `check:source` reports all JavaScript, JSON and relative imports valid.
- Contract fixtures pass.
- Consolidated validation reports zero errors.
- All automated tests pass.
- Smoke test passes health, readiness, navigator, reference viewer and reference preview.

Save evidence:

```powershell
New-Item -ItemType Directory -Force .\.my-dashboards\acceptance | Out-Null

npm run check:source  *>&1 | Tee-Object .\.my-dashboards\acceptance\check-source.txt
npm run validate      *>&1 | Tee-Object .\.my-dashboards\acceptance\validate.txt
npm test              *>&1 | Tee-Object .\.my-dashboards\acceptance\npm-test.txt
npm run smoke         *>&1 | Tee-Object .\.my-dashboards\acceptance\smoke.txt
```

---

## A06 — Run each feature suite separately

`npm test` is the overall gate. The individual scripts make failures easier to locate.

```powershell
$Suites = @(
  "test:cli",
  "test:files",
  "test:office",
  "test:data",
  "test:library",
  "test:resolution",
  "test:export",
  "test:validation",
  "test:git",
  "test:server",
  "test:skills",
  "test:core",
  "test:navigator",
  "test:gallery",
  "test:viewer",
  "test:appearance-controls",
  "test:library-browser",
  "test:polish"
)

foreach ($Suite in $Suites) {
  Write-Host "`n===== $Suite =====" -ForegroundColor Cyan
  npm run $Suite

  if ($LASTEXITCODE -ne 0) {
    throw "$Suite failed with exit code $LASTEXITCODE"
  }
}
```

**Pass criteria**

Every suite exits zero.

---

# PASS B — CLI and filesystem features

## B01 — Help, version and structured output

```powershell
npm run --silent mydash -- help
npm run --silent mydash -- version
npm run --silent mydash -- help artifact
npm run --silent mydash -- library scan --json |
  ConvertFrom-Json |
  Select-Object -ExpandProperty data
```

**Pass criteria**

- Help lists: `doctor`, `inspect`, `file`, `excel`, `powerpoint`, `data`, `library`, `appearance`, `artifact`, `validate`, `impact`, `git`, and `skills`.
- Version prints the package version.
- Command-specific help is readable.
- `--json` produces parseable JSON without human prose mixed into stdout.

Negative test:

```powershell
npm run --silent mydash -- command-that-does-not-exist
```

**Pass criteria**

- Exit code is non-zero.
- Error explains that the command is unknown.
- It recommends `mydash help`.

---

## B02 — Workspace inspection

```powershell
npm run --silent mydash -- inspect .
npm run --silent mydash -- inspect .\tests\fixtures\data\sample.csv
npm run --silent mydash -- inspect .\tests\fixtures\office\sample.xlsx
```

Create Office fixtures first if the final path does not yet exist:

```powershell
npm run fixtures:office
```

**Pass criteria**

- Directory and file types are identified correctly.
- Media type and size are reported for files.
- Recommended follow-up commands are relevant to CSV and Excel.

---

## B03 — File identification and hashing

```powershell
npm run --silent mydash -- file identify .\tests\fixtures\data\sample.csv
npm run --silent mydash -- file hash .\tests\fixtures\data\sample.csv
npm run --silent mydash -- file hash .\tests\fixtures\data\sample.csv --algorithm sha512
```

**Pass criteria**

- CSV is identified as tabular data.
- SHA-256 is 64 hexadecimal characters.
- SHA-512 is 128 hexadecimal characters.
- Running the same hash twice returns the same value.

---

## B04 — Deterministic tree, search and safe names

```powershell
npm run --silent mydash -- file tree .\library --depth 3
npm run --silent mydash -- file find "**/*.json" --root .\library --max-results 500
npm run --silent mydash -- file safe-name "Quarterly AI Governance / Q3" --extension html
```

**Pass criteria**

- Tree order is stable across two runs.
- Find returns manifests and data JSON files beneath `library`.
- Safe name is lowercase, filesystem-safe, and ends in `.html`.
- No path escapes the selected root.

---

## B05 — Workspace boundary protection

Create an outside file:

```powershell
$Outside = Join-Path $env:TEMP "mydash-outside.csv"
Copy-Item .\tests\fixtures\data\sample.csv $Outside -Force
```

Run without permission:

```powershell
npm run --silent mydash -- inspect $Outside
```

Then explicitly permit read-only access:

```powershell
npm run --silent mydash -- inspect $Outside --allow-outside
```

**Pass criteria**

- First command fails because the source is outside the workspace.
- Second command succeeds.
- No command writes outside the workspace.

---

# PASS C — Excel features

## C01 — Generate deterministic Office fixtures

```powershell
npm run fixtures:office
```

Expected files:

```powershell
Test-Path .\tests\fixtures\office\sample.xlsx
Test-Path .\tests\fixtures\office\sample.pptx
```

Both should return `True`.

---

## C02 — Inspect workbook structure

```powershell
npm run --silent mydash -- excel inspect .\tests\fixtures\office\sample.xlsx
npm run --silent mydash -- excel sheets .\tests\fixtures\office\sample.xlsx
```

**Pass criteria**

- Workbook is read without Excel being installed.
- Sheets include `Summary` and hidden `Hidden Data`.
- Summary reports row/column counts.
- Hidden sheet state is preserved.

---

## C03 — Preview ranges and formulas

```powershell
npm run --silent mydash -- excel preview `
  .\tests\fixtures\office\sample.xlsx `
  --sheet Summary `
  --range A1:E4 `
  --rows 10 `
  --columns 10 `
  --formulas

npm run --silent mydash -- excel formulas `
  .\tests\fixtures\office\sample.xlsx `
  --sheet Summary
```

**Pass criteria**

- Preview includes `Approved`, `Review`, counts and `Governance summary`.
- Formula listing includes the total formula `SUM(B2:B3)`.
- Formulas are inspected, not recalculated or silently changed.

---

## C04 — Extract worksheet and named table

```powershell
$Output = ".\.my-dashboards\acceptance\excel"
New-Item -ItemType Directory -Force $Output | Out-Null

npm run --silent mydash -- excel extract `
  .\tests\fixtures\office\sample.xlsx `
  --sheet Summary `
  --range A1:B4 `
  --output "$Output\summary.csv" `
  --format csv `
  --overwrite

npm run --silent mydash -- excel extract-table `
  .\tests\fixtures\office\sample.xlsx `
  --table StatusTable `
  --output "$Output\status-table.json" `
  --format json `
  --overwrite
```

Inspect:

```powershell
Get-Content "$Output\summary.csv"
Get-Content "$Output\status-table.json" -Raw | ConvertFrom-Json
```

**Pass criteria**

- Both outputs are created.
- CSV contains header and expected records.
- Named-table JSON contains `Approved` and `Review`.
- Existing output is not replaced unless `--overwrite` is supplied.

Overwrite negative test:

```powershell
npm run --silent mydash -- excel extract `
  .\tests\fixtures\office\sample.xlsx `
  --sheet Summary `
  --output "$Output\summary.csv" `
  --format csv
```

This should fail rather than overwrite silently.

---

# PASS D — PowerPoint features

## D01 — Inspect and outline

```powershell
npm run --silent mydash -- powerpoint inspect .\tests\fixtures\office\sample.pptx
npm run --silent mydash -- powerpoint outline .\tests\fixtures\office\sample.pptx
npm run --silent mydash -- powerpoint notes .\tests\fixtures\office\sample.pptx
```

**Pass criteria**

- One slide is found.
- Title is `Agent Hub Overview`.
- Slide text includes `Use cases in governance review`.
- Speaker note includes `Explain the governance journey.`
- One embedded image is reported.

---

## D02 — Extract presentation structure and images

```powershell
$PptOutput = ".\.my-dashboards\acceptance\powerpoint"

npm run --silent mydash -- powerpoint extract `
  .\tests\fixtures\office\sample.pptx `
  --output $PptOutput `
  --include-images `
  --overwrite
```

Verify:

```powershell
Get-ChildItem $PptOutput -Recurse
Get-Content "$PptOutput\presentation.json" -Raw | ConvertFrom-Json
Get-Content "$PptOutput\slides\001.json" -Raw | ConvertFrom-Json
Get-Content "$PptOutput\notes\001.txt"
```

**Pass criteria**

- `presentation.json` exists.
- `slides\001.json` exists.
- `notes\001.txt` exists.
- Extracted image exists under `images`.
- A second extraction without `--overwrite` is rejected safely.

Test the image-only command:

```powershell
npm run --silent mydash -- powerpoint images `
  .\tests\fixtures\office\sample.pptx `
  --output .\.my-dashboards\acceptance\powerpoint-images `
  --overwrite
```

---

# PASS E — CSV, JSON, NDJSON and recipes

## E01 — Inspect all supported tabular formats

```powershell
npm run --silent mydash -- data inspect .\tests\fixtures\data\sample.csv
npm run --silent mydash -- data inspect .\tests\fixtures\data\sample.json
npm run --silent mydash -- data inspect .\tests\fixtures\data\sample.ndjson
```

**Pass criteria**

- Format is recognised correctly.
- Column names are discovered.
- CSV reports four records.
- JSON and NDJSON records are loaded without changing the source.

---

## E02 — Profile types, blanks and duplicates

```powershell
npm run --silent mydash -- data profile `
  .\tests\fixtures\data\sample.csv `
  --top-values 5
```

**Pass criteria**

- Four rows are analysed.
- Duplicate row count reflects the repeated `UC-002` row.
- `status` reports one blank/null-like value.
- Numeric `amount` and date-like `created` values are profiled sensibly.

---

## E03 — Convert formats

```powershell
$DataOutput = ".\.my-dashboards\acceptance\data"
New-Item -ItemType Directory -Force $DataOutput | Out-Null

npm run --silent mydash -- data convert `
  .\tests\fixtures\data\sample.csv `
  --output "$DataOutput\sample.json" `
  --format json `
  --overwrite

npm run --silent mydash -- data convert `
  .\tests\fixtures\data\sample.json `
  --output "$DataOutput\sample.ndjson" `
  --format ndjson `
  --overwrite
```

**Pass criteria**

- Four CSV records appear in converted JSON.
- NDJSON has one valid JSON object per line.
- Conversion does not alter the original fixture.

---

## E04 — Select, filter and deduplicate

```powershell
npm run --silent mydash -- data select `
  .\tests\fixtures\data\sample.csv `
  --columns "id,status" `
  --output "$DataOutput\selected.csv" `
  --format csv `
  --overwrite

npm run --silent mydash -- data filter `
  .\tests\fixtures\data\sample.csv `
  --where "status=Review" `
  --output "$DataOutput\review.json" `
  --format json `
  --overwrite

npm run --silent mydash -- data filter `
  .\tests\fixtures\data\sample.csv `
  --where "status is-null" `
  --output "$DataOutput\blank-status.json" `
  --format json `
  --overwrite

npm run --silent mydash -- data deduplicate `
  .\tests\fixtures\data\sample.csv `
  --key id `
  --output "$DataOutput\deduplicated.csv" `
  --format csv `
  --overwrite
```

**Pass criteria**

- Selected output contains only `id` and `status`.
- Review filter contains the two matching source rows.
- Null filter contains `UC-003`.
- Deduplicated output contains three records and reports one removed row.
- Unknown-column filters fail with a useful error listing available columns.

---

## E05 — Create and refresh a repeatable recipe

```powershell
$RecipeRoot = ".\.my-dashboards\acceptance\recipe"
New-Item -ItemType Directory -Force $RecipeRoot | Out-Null

npm run --silent mydash -- data create-recipe `
  .\tests\fixtures\data\sample.csv `
  --id acceptance-sample `
  --recipe "$RecipeRoot\sample.recipe.json" `
  --output ".my-dashboards/acceptance/recipe/refreshed.json" `
  --format json `
  --output-overwrite `
  --overwrite

npm run --silent mydash -- data refresh `
  "$RecipeRoot\sample.recipe.json" `
  --overwrite
```

Verify:

```powershell
Get-Content "$RecipeRoot\sample.recipe.json" -Raw | ConvertFrom-Json
Get-Content "$RecipeRoot\refreshed.json" -Raw | ConvertFrom-Json
Get-Content "$RecipeRoot\refreshed.provenance.json" -Raw | ConvertFrom-Json
```

**Pass criteria**

- Recipe contains a workspace-relative source and output.
- Refresh creates four output records.
- Provenance records source file, SHA-256, command, timestamp and tool version.
- Re-running produces deterministic data and updated provenance.
- `--no-provenance` skips provenance only when explicitly requested.

---

# PASS F — Library discovery and resolution

## F01 — Scan and list the library

```powershell
npm run --silent mydash -- library scan
npm run --silent mydash -- library list
npm run --silent mydash -- library list --level core
npm run --silent mydash -- library list --level local
npm run --silent mydash -- library list --kind component
npm run --silent mydash -- library diagnostics
```

**Pass criteria**

The library contains:

- 1 dashboard artefact.
- 1 Core theme.
- 1 Core preset.
- 1 Core layout.
- 2 Core components.
- 2 Core primitives.
- 1 Core asset.
- 1 Local component.

`library diagnostics` reports no errors.

---

## F02 — Inspect resources and reverse consumers

```powershell
npm run --silent mydash -- library inspect metric-card --kind component
npm run --silent mydash -- library inspect governance-pipeline --kind component
npm run --silent mydash -- library consumers status-badge --kind primitive
npm run --silent mydash -- library consumers metric-card --kind component
```

**Pass criteria**

- `metric-card` is Core, slot `metric-summary`, with props and variants.
- `governance-pipeline` is Local and owned by `ai-use-case-governance`.
- Consumers show the expected component/artefact relationships.
- Source paths are repository-relative and accurate.

---

## F03 — Resolve appearance

```powershell
npm run --silent mydash -- appearance resolve `
  ai-use-case-governance `
  --kind dashboard

npm run --silent mydash -- appearance validate
```

**Pass criteria**

Resolution reports:

- Theme `hsbc-light`.
- Preset `default`.
- Layout `dashboard-shell`.
- Valid dependency closure.
- Core metric/section resources.
- Local `governance-pipeline`.
- No unresolved references.

---

## F04 — Analyse shared-resource impact

```powershell
npm run --silent mydash -- impact `
  status-badge `
  --kind primitive `
  --change contract

npm run --silent mydash -- impact `
  status-badge `
  --kind primitive `
  --change contract `
  --fail-if-consumed
```

**Pass criteria**

- First command lists direct/transitive consumers and affected artefacts.
- Second command exits non-zero because the shared primitive is consumed.
- The command does not modify files.

---

# PASS G — Artefact validation and standalone export

## G01 — Inspect and validate the reference artefact

```powershell
npm run --silent mydash -- artifact inspect `
  ai-use-case-governance `
  --kind dashboard

npm run --silent mydash -- artifact dependencies `
  ai-use-case-governance `
  --kind dashboard

npm run --silent mydash -- artifact validate `
  ai-use-case-governance `
  --kind dashboard
```

**Pass criteria**

- Artefact title and entry point are correct.
- Appearance is valid.
- Dependency closure contains nine resources: eight Core resources and one Local component.
- In-memory standalone validation passes.
- Size and SHA-256 are reported.
- Styles, scripts, data, assets and UI resources are embedded.

---

## G02 — Export and test overwrite protection

```powershell
npm run --silent mydash -- artifact export `
  ai-use-case-governance `
  --kind dashboard `
  --output exports\acceptance-governance.html `
  --overwrite
```

Run the same command again **without** `--overwrite`:

```powershell
npm run --silent mydash -- artifact export `
  ai-use-case-governance `
  --kind dashboard `
  --output exports\acceptance-governance.html
```

**Pass criteria**

- First export succeeds.
- Second export fails rather than replacing the file.
- Export remains unchanged after the refused operation.

---

## G03 — Test minification and size limits

```powershell
npm run --silent mydash -- artifact export `
  ai-use-case-governance `
  --kind dashboard `
  --output exports\acceptance-governance-min.html `
  --minify `
  --overwrite

npm run --silent mydash -- artifact validate `
  ai-use-case-governance `
  --kind dashboard `
  --max-bytes 1024
```

**Pass criteria**

- Minified export succeeds and is no larger than the normal export.
- 1 KiB maximum test fails with a clear output-size error.
- No partial export is left by the failed size-limit operation.

---

## G04 — Prove `file://` independence

Stop MyDash with `Ctrl+C`.

Open:

```powershell
Start-Process (Resolve-Path .\exports\acceptance-governance.html)
```

In the browser:

1. Confirm the dashboard renders.
2. Use search and filters.
3. Open DevTools → Network.
4. Reload the file.
5. Confirm there are no HTTP or HTTPS requests.

Static checks:

```powershell
Select-String `
  -Path .\exports\acceptance-governance.html `
  -Pattern '<script[^>]+src=','<link[^>]+stylesheet','fetch\('
```

**Pass criteria**

- Dashboard works with the server stopped.
- No external stylesheet/script/fetch dependency is found.
- Data, UI resources and brand asset remain visible.
- Interactions still work.

---

# PASS H — Server, API and no-Git operation

## H01 — Start without a Git repository

Before initialising Git:

```powershell
npm start
```

Open:

```text
http://127.0.0.1:4173/
```

**Pass criteria**

- Server starts.
- Navigator opens.
- Readiness remains usable.
- Git is shown as unavailable or warning, not as a runtime crash.
- Browsing, preview and export work.

Note: the CLI `doctor` command currently treats Git and Git identity as required workstation capabilities. In this no-Git pass it may exit non-zero even though the runtime correctly supports browsing/export without Git. Record this distinction rather than treating navigator startup as failed.

---

## H02 — Exercise primary API routes

With the server running:

```powershell
$Base = "http://127.0.0.1:4173"

Invoke-RestMethod "$Base/api/health"
Invoke-RestMethod "$Base/api/readiness"
Invoke-RestMethod "$Base/api/capabilities"
Invoke-RestMethod "$Base/api/state"
Invoke-RestMethod "$Base/api/library"
Invoke-RestMethod "$Base/api/library/component/metric-card"
Invoke-RestMethod "$Base/api/artifacts"
Invoke-RestMethod "$Base/api/artifacts/dashboard/ai-use-case-governance"
Invoke-RestMethod "$Base/api/artifacts/dashboard/ai-use-case-governance/export-status"
Invoke-RestMethod "$Base/api/artifacts/dashboard/ai-use-case-governance/appearance-options"
Invoke-RestMethod "$Base/api/git/status"
```

**Pass criteria**

- Every endpoint returns a structured envelope with `ok: true`.
- Health status is `ok`.
- Readiness is `ready` or has only expected optional warnings.
- Artifact and library metadata match the filesystem.
- Export status says ready and does not include the full HTML document.
- Git status returns an unavailable state rather than server error when Git is absent.

---

## H03 — Check browser security headers

```powershell
$Response = Invoke-WebRequest "$Base/" -UseBasicParsing
$Response.Headers["Content-Security-Policy"]
$Response.Headers["Permissions-Policy"]
$Response.Headers["X-Frame-Options"]
$Response.Headers["Cache-Control"]
```

**Pass criteria**

- Content Security Policy permits only same-origin application resources and frames.
- Permissions Policy disables camera, microphone, geolocation, payment and USB.
- Frame policy is `SAMEORIGIN`.
- Navigator HTML is revalidated rather than indefinitely cached.

---

## H04 — Port conflict and alternate port

Keep the first instance running. In another terminal:

```powershell
npm start
```

**Pass criteria**

The second process exits with a useful “port already in use” style message.

Then stop both and run:

```powershell
$env:MYDASH_PORT = "4174"
npm start
```

Open:

```text
http://127.0.0.1:4174/
```

**Pass criteria**

Alternate port works. Clear the variable afterwards:

```powershell
Remove-Item Env:MYDASH_PORT
```

---

## H05 — Launchers and shutdown

Test separately:

```powershell
.\start-mydash.cmd
```

Then:

```powershell
.\start-mydash.ps1
```

If PowerShell execution policy blocks local scripts, record `[BLOCKED]` and confirm `npm start` or `.cmd` still works.

For each launcher:

- Server starts at the expected URL.
- `Ctrl+C` stops it.
- No orphaned Node process continues listening.

---

# PASS I — Navigator and reference dashboard

## I01 — Primary navigation

Open Home and test:

- Expand/collapse the top-left navigation.
- Close with Escape.
- Close by clicking outside.
- Use the top category selector.
- Visit Home, Dashboards, Presentations, Concepts, Library and Settings.
- Use browser Back and Forward.
- Refresh every route directly.

**Pass criteria**

- Deep links survive refresh.
- Current route remains highlighted.
- Empty Presentations/Concepts states are helpful, not broken.
- Connection state reaches `Workspace live`.
- Keyboard focus remains visible.

---

## I02 — Home and gallery

On Home:

- Confirm artefact and resource counts are plausible.
- Scroll until the reference dashboard miniature enters the viewport.
- Observe waiting → loading → loaded preview states.
- Click the preview.
- Use card `View` and `Download`.

**Pass criteria**

- Miniature preview lazy-loads.
- Preview is non-interactive inside the card.
- Overlay/link opens the viewer.
- Download returns an HTML attachment.
- No duplicate artefact registry is required.

---

## I03 — Reference dashboard content

Open:

```text
http://127.0.0.1:4173/view/dashboard/ai-use-case-governance
```

Open standalone or the viewer iframe and verify:

### Summary

```text
Portfolio total:       14
Review backlog:         4
Approved for pilot:     2
High risk:              3
Review completion:     63%
```

### Pipeline

```text
Intake:             3
Control reviews:    4
Committee:          3
Pilot:              2
Production:         2
```

### Filtering

- Search `Knowledge` → one matching use case.
- Select stage `Control reviews` → four use cases.
- Select owner `Developer Experience` → two use cases.
- Reset → fourteen use cases.
- Search a nonsense value → intentional empty state.

**Pass criteria**

- Counts match.
- Synthetic-data notice is visible.
- Table remains readable on narrow screen.
- Status and risk are understandable without colour alone.
- No raw JSON is shown to the user.
- Error and empty states are intentional.

---

# PASS J — Viewer features

## J01 — Toolbar and keyboard controls

In the viewer test:

```text
R          reload preview
F          enter/exit fullscreen
I          show/hide details
A          show/hide appearance
?          open shortcut help
Escape     exit fullscreen or close help
```

Also click every toolbar button.

**Pass criteria**

- Keyboard and mouse actions behave identically.
- Shortcuts are ignored while focused in a form control.
- Fullscreen applies only to the preview mount.
- Reload preserves the active personal/preview appearance.
- Help dialog is keyboard accessible.

---

## J02 — Details panel

Press `I`.

Verify sections:

- Artefact metadata.
- Theme, preset and layout.
- Dependency closure.
- Standalone export readiness.
- Size and SHA-256.
- Embedded resource counts.
- Diagnostics.
- Workspace revision.

**Pass criteria**

- Details load independently of the iframe.
- Dependency list includes Core and Local scope.
- Export says ready.
- No discovery/resolution/export errors appear.
- Closing and reopening does not create duplicate panels.

---

## J03 — Standalone and download actions

- `Open standalone` opens a new tab.
- `Download HTML` downloads `ai-use-case-governance.html`.
- Downloaded file works after the server is stopped.

**Pass criteria**

All actions use the current active appearance selection.

---

# PASS K — Appearance scopes

The seeded release contains one theme and one preset. Therefore test scope, persistence, URL resolution and explicit advanced mappings; a dramatic cross-theme visual comparison is not possible until a second theme/preset exists.

Before testing, record the manifest hash:

```powershell
$Manifest = ".\library\dashboards\ai-use-case-governance\artifact.json"
$BeforeHash = (Get-FileHash $Manifest -Algorithm SHA256).Hash
```

---

## K01 — Preview-only appearance

1. Press `A`.
2. Select **Preview only**.
3. Select explicit `HSBC Light · Core` and `Default · Core`.
4. Expand Advanced.
5. Select explicit Core layout/component mappings where offered.
6. Click **Apply temporary preview**.

Check:

```powershell
$AfterPreviewHash = (Get-FileHash $Manifest -Algorithm SHA256).Hash
$BeforeHash -eq $AfterPreviewHash
```

**Pass criteria**

- Status reads Preview override.
- Preview reloads.
- Manifest hashes are identical.
- Refreshing/closing the viewer removes the temporary selection.
- Open standalone and Download use the temporary appearance while active.

---

## K02 — Personal appearance

1. Select **Personal**.
2. Apply explicit appearance choices.
3. Reload the browser page.
4. Close and reopen the artefact.
5. Press `A` and click **Clear personal**.

Check manifest hash again.

**Pass criteria**

- Status reads Personal appearance after reload.
- Preference is scoped to this artefact and browser profile.
- `artifact.json` remains unchanged.
- Clear personal restores the artefact default.

Optional storage check in DevTools:

```javascript
Object.keys(localStorage).filter((key) => key.includes("mydash.appearance"))
```

---

# PASS L — Git-enabled and artefact-default tests

Run these tests only after Pass H proves no-Git operation.

## L01 — Initialise an isolated local repository

Stop the server, then:

```powershell
git init -b main
git config user.name "MyDash Acceptance"
git config user.email "mydash-acceptance@example.invalid"
git add -A
git commit -m "Acceptance baseline"
git tag acceptance-baseline
```

Run:

```powershell
npm run --silent mydash -- git status
npm run --silent mydash -- doctor
```

**Pass criteria**

- Branch is `main`.
- Worktree is clean.
- Git identity is configured.
- Doctor reports required capabilities available, except optional Python/LibreOffice if absent.

---

## L02 — Focused checkpoint dry-run

Create one target and one unrelated change:

```powershell
Set-Content .\docs\checkpoint-target.txt "checkpoint target"
Add-Content .\README.md "`nUnrelated acceptance change"
```

Dry-run only the target:

```powershell
npm run --silent mydash -- git checkpoint `
  docs/checkpoint-target.txt `
  --message "Test focused checkpoint" `
  --dry-run `
  --no-push
```

**Pass criteria**

- Validation and impact analysis run.
- No commit is created.
- Both changes remain uncommitted.

---

## L03 — Real focused checkpoint without push

```powershell
npm run --silent mydash -- git checkpoint `
  docs/checkpoint-target.txt `
  --message "Test focused checkpoint" `
  --no-push
```

Inspect:

```powershell
git log -1 --oneline
git status --short
git show --name-only --pretty="" HEAD
```

**Pass criteria**

- Commit contains only `docs/checkpoint-target.txt`.
- README modification remains uncommitted.
- No force-push occurs.
- Validation passed before commit.

Restore baseline before continuing:

```powershell
git reset --hard acceptance-baseline
git clean -fd
```

---

## L04 — Artefact-default appearance save

Start MyDash from the clean Git baseline:

```powershell
npm start
```

In the viewer:

1. Press `A`.
2. Select **Artefact default**.
3. In Advanced, set the layout explicitly to Core `Dashboard Shell`, or add an explicit Core mapping that differs from the currently inherited representation.
4. Click **Save, validate & checkpoint**.

Then inspect:

```powershell
git log -1 --oneline
git show --name-only --pretty="" HEAD
git status --short
```

**Pass criteria**

- Viewer reports saved.
- `artifact.json` is the only committed file.
- Commit message is `Update AI Use Case Governance appearance`.
- Export validation occurred before commit.
- Worktree is clean.
- With no remote, result reports committed locally rather than force-pushing.

Restore:

```powershell
git reset --hard acceptance-baseline
```

---

## L05 — Dirty-manifest protection

Modify the manifest without committing:

```powershell
Add-Content $Manifest " "
```

Try an Artefact-default save from the UI.

**Pass criteria**

- Save is rejected with a message equivalent to `ARTEFACT_MANIFEST_ALREADY_CHANGED`.
- Existing edit is preserved.
- No commit is created.

Restore:

```powershell
git reset --hard acceptance-baseline
```

---

## L06 — Stale-revision protection

1. Open the appearance panel and leave it open.
2. In PowerShell, make a harmless workspace change:

```powershell
Set-Content .\.my-dashboards\acceptance\revision-probe.txt (Get-Date)
```

3. Wait for the navigator to detect the new revision.
4. Attempt an Artefact-default save from the already-open panel.

**Pass criteria**

- Stale save is rejected with a revision-conflict message.
- Refreshing the viewer and retrying uses the latest revision.
- No stale write is silently accepted.

---

# PASS M — Visual library browser

Open:

```text
http://127.0.0.1:4173/components
```

## M01 — Search and filters

Test:

- Search `metric`.
- Filter level `Core`.
- Filter level `Local`.
- Filter kind `Component`.
- Filter slot `metric-summary`.
- Clear all filters.
- Search nonsense text.

**Pass criteria**

- `metric-card` appears for metric search.
- Local filter shows `governance-pipeline`.
- Core filter excludes Local resources.
- Empty state is intentional.
- Result count updates accessibly.

---

## M02 — Resource detail routes

Open:

```text
/components/component/metric-card
/components/component/governance-pipeline
/components/primitive/button
/components/theme/hsbc-light
```

Refresh each deep route directly.

**Pass criteria**

Details expose, where applicable:

- Canonical reference.
- Lifecycle level.
- Owner/Collection.
- Source path.
- Slot.
- Contract version.
- Props.
- Variants.
- Supported themes.
- Dependencies.
- Reverse consumers.
- Diagnostics.

Use browser Back/Forward and links to consuming artefacts.

---

# PASS N — Agent skills

## N01 — Catalogue and validation

```powershell
npm run --silent mydash -- skills list
npm run --silent mydash -- skills validate
```

Expected commands include:

```text
/my-dashboard
/help
/mydash-help
/spreadsheet
/powerpoint
/dashboard
/presentation
/concept
/component
/hsbc-visual-standards
```

Inspect examples:

```powershell
npm run --silent mydash -- skills inspect dashboard
npm run --silent mydash -- skills inspect spreadsheet
npm run --silent mydash -- skills inspect my-dashboard
```

**Pass criteria**

- Skills list is complete.
- Validation reports zero errors.
- Frontmatter and instructions are readable.
- Native `/help` alias handling is clear.
- Skills refer to actual CLI capabilities and repository paths.

---

# PASS O — Live refresh, cache and events

## O01 — Observe server-sent revision events

With MyDash running, open a second terminal:

```powershell
curl.exe -N http://127.0.0.1:4173/api/events
```

Make a temporary valid change to a non-manifest source file:

```powershell
$ReadmeBackup = Get-Content .\README.md -Raw
Add-Content .\README.md "`nAcceptance revision probe"
```

**Pass criteria**

- Event stream remains open.
- A workspace revision event appears.
- Navigator briefly refreshes.
- `/api/state` revision changes.
- No server restart is required.

Restore:

```powershell
Set-Content .\README.md $ReadmeBackup -NoNewline
```

If using the Git baseline:

```powershell
git checkout -- README.md
```

---

## O02 — ETag revalidation

Use the browser Network panel or:

```powershell
$First = Invoke-WebRequest "$Base/api/library" -UseBasicParsing
$ETag = $First.Headers["ETag"]
$ETag
```

Then send `If-None-Match` using `curl.exe`:

```powershell
curl.exe -i -H "If-None-Match: $ETag" "$Base/api/library"
```

**Pass criteria**

- First response contains an ETag.
- Matching conditional request returns `304 Not Modified`.
- Revision changes invalidate the old response.

---

# PASS P — Negative validation and recovery

Run in the Git-enabled disposable copy.

## P01 — Invalid manifest detection

Create an intentionally incomplete concept:

```powershell
$Bad = ".\library\concepts\invalid-acceptance"
New-Item -ItemType Directory -Force $Bad | Out-Null
'{"schemaVersion":1,"kind":"concept","id":"invalid-acceptance"}' |
  Set-Content "$Bad\artifact.json"
```

Run:

```powershell
npm run --silent mydash -- library diagnostics
npm run --silent mydash -- validate --skip-exports --skip-recipes
```

**Pass criteria**

- Both commands fail validation.
- Error identifies the bad manifest and missing required fields.
- Navigator readiness changes to Needs attention.
- Other valid resources remain discoverable.

Remove and recover:

```powershell
Remove-Item $Bad -Recurse -Force
npm run validate
```

Final validation must pass.

---

## P02 — Unresolved appearance reference

Back up the manifest:

```powershell
Copy-Item $Manifest "$Manifest.acceptance-backup" -Force

$Value = Get-Content $Manifest -Raw | ConvertFrom-Json
$Value.appearance.theme = "missing-theme"
$Value | ConvertTo-Json -Depth 30 | Set-Content $Manifest
```

Run:

```powershell
npm run --silent mydash -- appearance resolve `
  ai-use-case-governance `
  --kind dashboard

npm run --silent mydash -- artifact validate `
  ai-use-case-governance `
  --kind dashboard
```

**Pass criteria**

- Resolution clearly reports missing theme.
- Export validation refuses to build.
- No partial export is written.

Restore:

```powershell
Move-Item "$Manifest.acceptance-backup" $Manifest -Force
npm run validate
```

---

## P03 — Unknown file type and malformed data

Create malformed data:

```powershell
Set-Content .\.my-dashboards\acceptance\bad.json '{"broken":'
Set-Content .\.my-dashboards\acceptance\unknown.bin 'not a supported document'
```

Run:

```powershell
npm run --silent mydash -- data inspect .\.my-dashboards\acceptance\bad.json
npm run --silent mydash -- inspect .\.my-dashboards\acceptance\unknown.bin
```

**Pass criteria**

- Malformed JSON fails with a useful parsing error.
- Unknown file is identified safely or receives a clear unsupported-type response.
- No raw stack trace is exposed as the main user message.

---

# PASS Q — Work-laptop acceptance

Run these checks in the exact folder and security context you intend to use at work.

## Q01 — Non-admin operation

- Folder is under your user profile or another writable approved location.
- No admin elevation is required.
- `npm ci`, `npm start`, preview and export work as your normal account.

## Q02 — Corporate network

- Record npm registry/proxy.
- Confirm runtime works after disconnecting from the internet.
- Confirm exported HTML works offline.
- Confirm MyDash makes no external runtime requests.

## Q03 — Endpoint/security software

Check whether company controls block:

- Node execution.
- Local loopback port 4173.
- PowerShell scripts.
- Downloaded standalone HTML.
- Writing beneath the selected folder.

Use `start-mydash.cmd` or `npm start` if `.ps1` is blocked.

## Q04 — Real Office documents

Copy one approved, non-sensitive workbook and presentation into a test input folder and run:

```powershell
npm run --silent mydash -- excel inspect <approved-workbook.xlsx> --allow-outside
npm run --silent mydash -- powerpoint inspect <approved-presentation.pptx> --allow-outside
```

Do not use confidential production data until internal approval and storage requirements are understood.

**Pass criteria**

- Real-world structure is inspected.
- Source files remain unchanged.
- Outputs are written only to approved workspace paths.

---

# Final release acceptance checklist

MyDash is accepted only when all required items are true:

```text
[ ] Archive hash matches
[ ] npm ci succeeds
[ ] check:source passes
[ ] contract validation passes
[ ] consolidated validation passes
[ ] full npm test passes
[ ] smoke test passes
[ ] all individual feature suites pass
[ ] CLI help and JSON output work
[ ] workspace boundary protection works
[ ] Excel inspect/preview/formulas/extract works
[ ] PowerPoint inspect/outline/notes/extract/images works
[ ] CSV/JSON/NDJSON inspect/profile/convert/transform works
[ ] recipe refresh and provenance work
[ ] library scan, diagnostics, consumers and impact work
[ ] appearance resolution is valid
[ ] standalone export validates and works through file://
[ ] navigator starts without Git
[ ] health/readiness/state APIs work
[ ] gallery lazy preview works
[ ] viewer reload/fullscreen/details/help work
[ ] preview-only appearance leaves files unchanged
[ ] personal appearance persists locally
[ ] artefact-default appearance creates a focused commit
[ ] dirty manifest and stale revision are rejected
[ ] visual library browser and deep links work
[ ] skills catalogue validates
[ ] live revision events and cache revalidation work
[ ] invalid manifests and missing references produce useful diagnostics
[ ] port conflicts and shutdown are handled cleanly
[ ] work-laptop permissions and approved registry are confirmed
```

---

# Recommended final evidence bundle

Keep these files together:

```text
.mydashboards/acceptance/
├── check-source.txt
├── validate.txt
├── npm-test.txt
├── smoke.txt
├── screenshots/
│   ├── home.png
│   ├── dashboard.png
│   ├── viewer-details.png
│   ├── appearance.png
│   └── library-browser.png
├── exports/
│   └── acceptance-governance.html
└── defects.md
```

A clean final result is:

```text
Automated release gates: PASS
Core CLI/utilities:       PASS
Office/data processing:   PASS
Library/appearance:       PASS
Browser/viewer:            PASS
Standalone export:         PASS
Git safety:                PASS or SKIP when Git is prohibited
Work-laptop operation:     PASS
Open critical defects:     0
```
