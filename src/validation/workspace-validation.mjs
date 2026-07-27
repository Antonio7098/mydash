import {
  loadWorkspaceConfig,
} from "../workspace/load-config.mjs";
import {
  scanWorkspaceLibrary,
} from "../library/scan.mjs";
import {
  findArtifact,
} from "../resolution/find-artifact.mjs";
import {
  resolveArtifactAppearance,
} from "../resolution/resolve.mjs";
import {
  buildStandaloneArtifact,
} from "../export/export-artifact.mjs";
import {
  discoverRecipeFiles,
  validateRecipeFile,
} from "./recipe-validation.mjs";
import {
  scopedLibraryView,
} from "../users/scope.mjs";

export async function validateWorkspace(options) {
  const generatedAt = (
    options.now ? options.now() : new Date()
  ).toISOString();
  const issues = [];
  const stages = createStages();
  const artefactReports = [];
  const recipeReports = [];
  let config = null;
  let scan = null;
  let userId = null;

  try {
    config = await loadWorkspaceConfig(
      options.workspaceRoot,
    );
    userId = options.allUsers ? null : config.userId;
    stages.workspace.status = "passed";
  } catch (error) {
    const issue = errorIssue(
      "workspace",
      "WORKSPACE_CONFIGURATION_INVALID",
      error,
    );
    issues.push(issue);
    stages.workspace.status = "failed";
    finishStage(stages.workspace, [issue]);

    return finish();
  }

  try {
    scan = await scanWorkspaceLibrary(
      options.workspaceRoot,
    );
    const libraryView = scopedLibraryView(scan, {
      allUsers: options.allUsers,
      userId,
    });
    const libraryIssues = libraryView.issues.map((issue) => ({
      stage: "library",
      ...issue,
    }));
    issues.push(...libraryIssues);
    stages.library.status = libraryIssues.some(
      (issue) => issue.severity === "error",
    )
      ? "failed"
      : "passed";
    stages.library.entryCount = libraryView.summary.entryCount;
    finishStage(stages.library, libraryIssues);
  } catch (error) {
    const issue = errorIssue(
      "library",
      "LIBRARY_SCAN_FAILED",
      error,
    );
    issues.push(issue);
    stages.library.status = "failed";
    finishStage(stages.library, [issue]);

    return finish();
  }

  let artifacts = scan.entries.filter(
    (entry) =>
      entry.category === "artifact" &&
      (!userId || entry.userId === userId),
  );

  if (options.artifactId) {
    artifacts = [
      findArtifact(
        scan,
        options.artifactId,
        options.artifactKind,
        userId,
      ),
    ];
  }

  for (const artifact of artifacts) {
    const artifactReport = {
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      userId: artifact.userId,
      displayPath: artifact.displayPath,
      appearance: null,
      export: {
        status:
          options.validateExports === false
            ? "skipped"
            : "pending",
      },
    };

    let resolution;

    try {
      resolution = resolveArtifactAppearance(
        scan,
        artifact,
      );
      artifactReport.appearance = {
        valid: resolution.summary.valid,
        summary: resolution.summary,
        selections: resolution.selections,
        issues: resolution.issues,
      };

      const appearanceIssues = resolution.issues.map(
        (issue) => ({
          stage: "appearance",
          artifactId: artifact.id,
          artifactKind: artifact.kind,
          ...issue,
        }),
      );
      issues.push(...appearanceIssues);
    } catch (error) {
      const issue = errorIssue(
        "appearance",
        "APPEARANCE_RESOLUTION_FAILED",
        error,
        {
          artifactId: artifact.id,
          artifactKind: artifact.kind,
        },
      );
      issues.push(issue);
      artifactReport.appearance = {
        valid: false,
        summary: null,
        selections: null,
        issues: [issue],
      };
    }

    if (options.validateExports !== false) {
      if (!artifactReport.appearance?.valid) {
        artifactReport.export = {
          status: "skipped",
          reason: "appearance-invalid",
        };
      } else {
        try {
          const built = await buildStandaloneArtifact({
            workspaceRoot: options.workspaceRoot,
            scan,
            artifact,
            resolution,
            minify: options.minify ?? false,
            maxBytes: options.maxBytes,
          });

          artifactReport.export = {
            status: "passed",
            sizeBytes: built.sizeBytes,
            sha256: built.sha256,
            resourceCounts: built.resources?.counts ?? null,
            validation: built.validation,
            warnings: built.warnings,
          };

          for (const warning of built.warnings ?? []) {
            issues.push({
              stage: "exports",
              severity: "warning",
              code:
                warning.code ??
                "STANDALONE_EXPORT_WARNING",
              message:
                warning.message ??
                String(warning),
              artifactId: artifact.id,
              artifactKind: artifact.kind,
            });
          }
        } catch (error) {
          const issue = errorIssue(
            "exports",
            error.code ??
              "STANDALONE_EXPORT_BUILD_FAILED",
            error,
            {
              artifactId: artifact.id,
              artifactKind: artifact.kind,
              validation: error.validation ?? null,
            },
          );
          issues.push(issue);
          artifactReport.export = {
            status: "failed",
            issue,
          };
        }
      }
    }

    artefactReports.push(artifactReport);
  }

  const appearanceIssues = issues.filter(
    (issue) => issue.stage === "appearance",
  );
  stages.appearance.status = appearanceIssues.some(
    (issue) => issue.severity === "error",
  )
    ? "failed"
    : "passed";
  stages.appearance.artifactCount =
    artefactReports.length;
  finishStage(stages.appearance, appearanceIssues);

  if (options.validateExports === false) {
    stages.exports.status = "skipped";
  } else {
    const exportIssues = issues.filter(
      (issue) => issue.stage === "exports",
    );
    stages.exports.status = exportIssues.some(
      (issue) => issue.severity === "error",
    )
      ? "failed"
      : "passed";
    stages.exports.validatedCount =
      artefactReports.filter(
        (artifact) =>
          artifact.export.status === "passed",
      ).length;
    stages.exports.skippedCount =
      artefactReports.filter(
        (artifact) =>
          artifact.export.status === "skipped",
      ).length;
    finishStage(stages.exports, exportIssues);
  }

  if (options.validateRecipes === false) {
    stages.recipes.status = "skipped";
  } else {
    const recipePaths = await discoverRecipeFiles(
      options.workspaceRoot,
      artifacts,
    );

    for (const recipePath of recipePaths) {
      const recipe = await validateRecipeFile(
        recipePath,
        {
          workspaceRoot: options.workspaceRoot,
          execute: true,
        },
      );
      recipeReports.push(recipe);

      for (const issue of recipe.issues) {
        issues.push({
          stage: "recipes",
          recipePath: recipe.displayPath,
          recipeId: recipe.id,
          ...issue,
        });
      }
    }

    const recipeIssues = issues.filter(
      (issue) => issue.stage === "recipes",
    );
    stages.recipes.status = recipeIssues.some(
      (issue) => issue.severity === "error",
    )
      ? "failed"
      : "passed";
    stages.recipes.recipeCount =
      recipeReports.length;
    finishStage(stages.recipes, recipeIssues);
  }

  return finish();

  function finish() {
    for (const stage of Object.values(stages)) {
      if (stage.status === "pending") {
        stage.status = "skipped";
      }
    }

    const errorCount = issues.filter(
      (issue) => issue.severity === "error",
    ).length;
    const warningCount = issues.filter(
      (issue) => issue.severity === "warning",
    ).length;
    const valid =
      errorCount === 0 &&
      (!options.failOnWarning || warningCount === 0);

    return {
      schemaVersion: 1,
      generatedAt,
      workspace: {
        id: config?.id ?? null,
        name: config?.name ?? "Unknown workspace",
        userId: config?.userId ?? null,
        root: options.workspaceRoot,
      },
      options: {
        artifactId: options.artifactId ?? null,
        artifactKind: options.artifactKind ?? null,
        userId,
        allUsers: options.allUsers ?? false,
        validateExports:
          options.validateExports !== false,
        validateRecipes:
          options.validateRecipes !== false,
        minify: options.minify ?? false,
        maxBytes: options.maxBytes,
        failOnWarning:
          options.failOnWarning ?? false,
      },
      stages,
      artifacts: artefactReports,
      recipes: recipeReports,
      issues: sortIssues(issues),
      summary: {
        valid,
        errorCount,
        warningCount,
        artifactCount: artefactReports.length,
        recipeCount: recipeReports.length,
        exportValidatedCount:
          artefactReports.filter(
            (artifact) =>
              artifact.export.status === "passed",
          ).length,
        exportFailedCount:
          artefactReports.filter(
            (artifact) =>
              artifact.export.status === "failed",
          ).length,
      },
    };
  }
}

function createStages() {
  return {
    workspace: stage(),
    library: stage(),
    appearance: stage(),
    recipes: stage(),
    exports: stage(),
  };
}

function stage() {
  return {
    status: "pending",
    errorCount: 0,
    warningCount: 0,
  };
}

function finishStage(stage, issues) {
  stage.errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  stage.warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
}

function errorIssue(
  stage,
  code,
  error,
  details = {},
) {
  return {
    stage,
    severity: "error",
    code,
    message:
      error instanceof Error
        ? error.message
        : String(error),
    ...details,
  };
}

function sortIssues(issues) {
  const severityOrder = {
    error: 0,
    warning: 1,
  };
  const stageOrder = {
    workspace: 0,
    library: 1,
    appearance: 2,
    recipes: 3,
    exports: 4,
  };

  return [...issues].sort(
    (left, right) =>
      (severityOrder[left.severity] ?? 9) -
        (severityOrder[right.severity] ?? 9) ||
      (stageOrder[left.stage] ?? 9) -
        (stageOrder[right.stage] ?? 9) ||
      String(left.code).localeCompare(
        String(right.code),
        "en",
      ) ||
      String(left.message).localeCompare(
        String(right.message),
        "en",
      ),
  );
}
