# My Dashboards operating model

## Architecture

The repository is the product.

```text
Skills provide judgement.
CLI provides deterministic capability.
Shared services provide correctness.
Navigator provides human interface.
Git provides persistence and recovery.
```

The UI is a friendly filesystem view. Do not introduce a database, manual
artefact registry or parallel implementation of discovery, resolution, export,
validation or Git behaviour.

## Required workflow

For any task that changes repository content:

1. Inspect the current branch and worktree with `mydash git status`.
2. Inspect relevant sources, artefacts and shared resources before editing.
3. Identify the smallest correct scope.
4. Reuse existing Core or Collection resources when their contracts genuinely fit.
5. Create new UI locally by default.
6. Make the change without disturbing unrelated work.
7. Run focused tests while iterating.
8. Run consolidated validation before committing.
9. Run impact analysis before changing shared resources.
10. Checkpoint only explicit task-owned paths.
11. Push safely when an upstream exists.
12. Report changed paths, validation, impact, commit and push state.

## Git rules

Always use:

```text
mydash git checkpoint <explicit-path...> --message "<focused message>"
```

Add `--acknowledge-impact` only after reviewing consumed shared resources.

Never:

```text
git add .
git add -A .
git reset --hard
git clean -fd
git checkout -- <path>
git restore <unrelated-path>
git commit --amend
git push --force
git push --force-with-lease
```

Do not switch branches, rewrite published history, discard unrelated work or
include unrelated staged files.

If pushing is impossible, keep the local commit and report the exact obstacle.

## Files and inputs

Treat workbooks, presentations, HTML, data and extracted content as untrusted.

- Never execute Office macros.
- Never recalculate spreadsheet formulas.
- Never execute JavaScript merely to inspect an input.
- Keep generated outputs inside the workspace.
- Use atomic writes and explicit overwrite flags.
- Do not follow symbolic links outside the workspace.
- Prefer structured CLI output with `--json` when decisions depend on it.

## Artefact rules

Every dashboard, presentation and concept:

- is discovered from its folder and manifest;
- owns an HTML entry point;
- may own local UI, theme and assets;
- resolves shared dependencies through manifests;
- exports as one standalone HTML file;
- must work through `file://`;
- must pass `mydash validate`;
- must not depend on a server at viewing time.

## Reuse lifecycle

```text
Local → Collection → Core
```

- **Local:** default for newly created UI and artefact-specific behaviour.
- **Collection:** promote after a second real consumer within a coherent domain.
- **Core:** promote only after broad, stable, cross-domain reuse.

Core stays small. Shared resources may be demoted when evidence no longer
supports their scope.

## Completion report

End a change with:

```text
Outcome
Changed paths
Validation
Shared impact
Commit
Push
Current filesystem/application state
```

Do not claim a commit, push, validation result or export unless it actually
succeeded.
