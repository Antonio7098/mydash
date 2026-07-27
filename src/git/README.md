# Constrained Git operations

Git is the persistence, collaboration and recovery layer for My Dashboards.

## Status

`mydash git status` reports:

- repository root;
- branch and detached-HEAD state;
- HEAD commit;
- upstream and ahead/behind counts;
- staged, unstaged, untracked and conflicted paths;
- active merge, rebase, cherry-pick, revert or bisect operations;
- configured identity and remotes.

## Checkpoint safety

`mydash git checkpoint <path...> --message <text>`:

1. requires explicit repository-relative paths;
2. refuses wildcards, Git pathspec magic and the repository root;
3. refuses detached HEAD, conflicts and in-progress Git operations;
4. refuses partially staged selected files;
5. runs complete consolidated validation before staging;
6. calculates shared-resource impact;
7. requires `--acknowledge-impact` for consumed Core or Collection resources;
8. verifies selected files did not change during validation;
9. stages only the explicit paths;
10. commits only those paths with `git commit --only`;
11. preserves unrelated staged and unstaged changes;
12. pushes the current upstream, or creates `origin/<branch>` safely;
13. never force-pushes or rewrites published history.

When no push target exists, the local commit remains valid and the exact obstacle
is reported.

## Examples

```text
mydash git checkpoint app src/server --message "Add navigator foundation"
mydash git checkpoint library/ui/components/core/card --message "Refine card contract" --acknowledge-impact
mydash git checkpoint library/dashboards/pipeline --message "Update pipeline dashboard" --no-push
```
