import {
  loadWorkspaceConfig,
} from "../workspace/load-config.js";
import {
  scanWorkspaceLibrary,
} from "../library/scan.js";
import {
  findArtifact,
} from "../resolution/find-artifact.js";
import {
  resolveArtifactAppearance,
  type ArtifactAppearanceResolution,
} from "../resolution/resolve.js";
import {
  buildStandaloneArtifact,
} from "../export/export-artifact.js";
import {
  discoverRecipeFiles,
  validateRecipeFile,
} from "./recipe-validation.js";
import {
  scopedLibraryView,
} from "../users/scope.js";
import {
  validateArtifactSourcePolicies,
} from "./source-policy-validation.js";
import type { LibraryScan } from "../library/types.js";
import type { WorkspaceConfig } from "../workspace/types.js";
import type { LibraryEntry } from "../library/types.js";
import type { ValidationIssue, ValidationReport, ValidationStage, ValidationSeverity, ValidationStageStatus } from "./types.js";

export interface ValidateWorkspaceOptions {
  workspaceRoot: string;
  artifactId?: string;
  artifactKind?: string;
  allUsers?: boolean;
  validateExports?: boolean;
  validateRecipes?: boolean;
  minify?: boolean;
  maxBytes?: number;
  failOnWarning?: boolean;
  now?: () => Date;
}

export interface ArtifactAppearanceReport {
  id: string;
  kind: string;
  title: string | null;
  user: string | null;
  displayPath: string;
  appearance: {
    valid: boolean;
    summary: ArtifactAppearanceResolution["summary"];
    selections: ArtifactAppearanceResolution["selections"];
    issues: ArtifactAppearanceResolution["issues"];
  } | null;
  export: ArtifactExportReport;
}

export type ArtifactExportReport =
  | { status: "skipped"; reason: string }
  | {
      status: "passed";
      sizeBytes: number;
      sha256: string;
      resourceCounts: unknown;
      validation: unknown;
      warnings: unknown[];
    }
  | { status: "failed"; issue: ValidationIssue }
  | { status: "pending" };

export interface RecipeValidationReport {
  path: string;
  displayPath: string;
  id: string | null;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
}

export interface SourceValidationReport {
  artifactId: string;
  artifactKind: string;
  sourceId: string;
  policyPath: string;
  currentPath?: string;
  policy?: unknown;
  issues: ValidationIssue[];
}

export interface WorkspaceValidationReport {
  schemaVersion: 1;
  generatedAt: string;
  workspace: {
    id: string | null;
    name: string;
    user: string | null;
    root: string;
  };
  options: {
    artifactId: string | null;
    artifactKind: string | null;
    user: string | null;
    allUsers: boolean;
    validateExports: boolean;
    validateRecipes: boolean;
    minify: boolean;
    maxBytes: number | undefined;
    failOnWarning: boolean;
  };
  stages: { [key: string]: ValidationStage | undefined };
  artifacts: ArtifactAppearanceReport[];
  recipes: RecipeValidationReport[];
  sources: SourceValidationReport[];
  issues: ValidationIssue[];
  summary: {
    valid: boolean;
    errorCount: number;
    warningCount: number;
    artifactCount: number;
    recipeCount: number;
    sourceCount: number;
    exportValidatedCount: number;
    exportFailedCount: number;
  };
}

export async function validateWorkspace(
  options: ValidateWorkspaceOptions,
): Promise<WorkspaceValidationReport> {
  const generatedAt = (
    options.now ? options.now() : new Date()
  ).toISOString();
  const issues: ValidationIssue[] = [];
  const stages: { [key: string]: ValidationStage } = createStages();
  const artefactReports: ArtifactAppearanceReport[] = [];
  const recipeReports: RecipeValidationReport[] = [];
  const sourceReports: SourceValidationReport[] = [];
  let config: WorkspaceConfig | null = null;
  let scan: LibraryScan | null = null;
  let user: string | null = null;

  try {
    config = await loadWorkspaceConfig(options.workspaceRoot);
    user = options.allUsers ? null : config.user;
    const workspaceStage: ValidationStage = (stages.workspace ??= stage());
    workspaceStage.status = "passed";
  } catch (error) {
    const issue = errorIssue(
      "workspace",
      "WORKSPACE_CONFIGURATION_INVALID",
      error,
    );
    issues.push(issue);
    const workspaceStage: ValidationStage = (stages.workspace ??= stage());
    workspaceStage.status = "failed";
    finishStage(workspaceStage, [issue]);

    return finish();
  }

  try {
    scan = await scanWorkspaceLibrary(options.workspaceRoot);
    const libraryView = scopedLibraryView(scan as never, {
      allUsers: options.allUsers,
      user: user ?? undefined,
    });
    const libraryIssues = libraryView.issues.map((issue) => ({
      stage: "library",
      ...issue,
    })) as unknown as ValidationIssue[];
    issues.push(...libraryIssues);
    const libraryStage: ValidationStage = (stages.library ??= stage());
    libraryStage.status = libraryIssues.some(
      (issue) => (issue.severity as string) === "error",
    )
      ? "failed"
      : "passed";
    libraryStage.entryCount = libraryView.summary.entryCount;
    finishStage(libraryStage, libraryIssues);
  } catch (error) {
    const issue = errorIssue(
      "library",
      "LIBRARY_SCAN_FAILED",
      error,
    );
    issues.push(issue);
    const libraryStage: ValidationStage = (stages.library ??= stage());
    libraryStage.status = "failed";
    finishStage(libraryStage, [issue]);

    return finish();
  }

  let artifacts = scan.entries.filter(
    (entry) =>
      entry.category === "artifact" &&
      (!user || entry.user === user),
  );

  if (options.artifactId) {
    artifacts = [
      findArtifact(
        scan,
        options.artifactId,
        options.artifactKind,
        user,
      ),
    ];
  }

  for (const artifact of artifacts) {
  const artifactReport: ArtifactAppearanceReport = {
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      user: artifact.user,
      displayPath: artifact.displayPath,
      appearance: null,
      export: options.validateExports === false
        ? { status: "skipped", reason: "exports-skipped" }
        : { status: "pending" },
    };

    let resolution: ArtifactAppearanceResolution = null as unknown as ArtifactAppearanceResolution;

    try {
      resolution = resolveArtifactAppearance(scan, artifact);
      artifactReport.appearance = {
        valid: resolution.summary.valid,
        summary: resolution.summary,
        selections: resolution.selections,
        issues: resolution.issues,
      };

      const appearanceIssues = resolution.issues.map(
        (issue) => ({
          stage: "appearance",
          severity: "error" as const,
          code: issue.code,
          message: issue.message,
          artifactId: artifact.id,
          artifactKind: artifact.kind,
        }),
      ) as unknown as ValidationIssue[];
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
        summary: { valid: false, errorCount: 0, warningCount: 0, dependencyCount: 0 },
        selections: {
          theme: null,
          preset: null,
          layout: null,
          components: {},
          primitives: {},
          assets: {},
        },
        issues: [issue as unknown as never],
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
            artifact: artifact as unknown as Parameters<typeof buildStandaloneArtifact>[0]["artifact"],
            scan,
            resolution,
            minify: options.minify ?? false,
            maxBytes: options.maxBytes ?? undefined,
          });

          artifactReport.export = {
            status: "passed",
            sizeBytes: built.sizeBytes,
            sha256: built.sha256,
            resourceCounts: (built.resources as { counts?: unknown })?.counts ?? null,
            validation: built.validation,
            warnings: built.warnings,
          };

        for (const warning of (built.warnings ?? []) as { code?: string; message?: string }[]) {
          issues.push({
            stage: "exports",
            severity: "warning" as ValidationSeverity,
            code: warning.code ?? "STANDALONE_EXPORT_WARNING",
            message: warning.message ?? String(warning),
            artifactId: artifact.id,
            artifactKind: artifact.kind,
          });
        }
        } catch (error) {
          const code = (error as { code?: string }).code;
          const issue = errorIssue(
            "exports",
            code ?? "STANDALONE_EXPORT_BUILD_FAILED",
            error,
            {
              artifactId: artifact.id,
              artifactKind: artifact.kind,
              validation: (error as { validation?: unknown }).validation ?? null,
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

  stages.workspace = stages.workspace ?? stage();
  stages.library = stages.library ?? stage();
  stages.appearance = stages.appearance ?? stage();
  stages.exports = stages.exports ?? stage();
  stages.sources = stages.sources ?? stage();
  stages.recipes = stages.recipes ?? stage();

  const appearanceIssues = issues.filter(
    (issue) => issue.stage === "appearance",
  );
  stages.appearance.status = appearanceIssues.some(
    (issue) => (issue.severity as string) === "error",
  )
    ? "failed"
    : "passed";
  stages.appearance.artifactCount = artefactReports.length;
  finishStage(stages.appearance, appearanceIssues);

  if (options.validateExports === false) {
    stages.exports.status = "skipped";
  } else {
    const exportIssues = issues.filter(
      (issue) => issue.stage === "exports",
    );
    stages.exports.status = exportIssues.some(
      (issue) => (issue.severity as string) === "error",
    )
      ? "failed"
      : "passed";
    stages.exports.validatedCount = artefactReports.filter(
      (artifact) =>
        artifact.export.status === "passed",
    ).length;
    stages.exports.skippedCount = artefactReports.filter(
      (artifact) =>
        artifact.export.status === "skipped",
    ).length;
    finishStage(stages.exports, exportIssues);
  }

  if (options.validateRecipes === false) {
    stages.sources.status = "skipped";
    stages.recipes.status = "skipped";
  } else {
    const validatedSources = await validateArtifactSourcePolicies(
      artifacts,
      options.workspaceRoot,
    );
    sourceReports.push(...validatedSources);
    for (const report of sourceReports) {
      for (const issue of report.issues) {
        issues.push({
          stage: "sources",
          severity: "error" as ValidationSeverity,
          code: issue.code,
          message: issue.message,
          artifactId: report.artifactId,
          artifactKind: report.artifactKind,
          sourceId: report.sourceId,
          policyPath: report.policyPath,
        });
      }
    }
    const sourceIssues = issues.filter(
      (issue) => issue.stage === "sources",
    );
    stages.sources.status = sourceIssues.some(
      (issue) => (issue.severity as string) === "error",
    )
      ? "failed"
      : "passed";
    stages.sources.sourceCount = sourceReports.length;
    finishStage(stages.sources, sourceIssues);

    const recipePaths = await discoverRecipeFiles(
      options.workspaceRoot,
      artifacts,
    );

    for (const recipePath of recipePaths) {
      const recipe = await validateRecipeFile(recipePath, {
        workspaceRoot: options.workspaceRoot,
        execute: true,
      });
      recipeReports.push(recipe as unknown as RecipeValidationReport);

      for (const issue of recipe.issues as ValidationIssue[]) {
        issues.push({
          stage: "recipes",
          severity: issue.severity as ValidationSeverity,
          code: issue.code,
          message: issue.message,
          recipePath: recipe.displayPath,
          recipeId: recipe.id ?? undefined,
        });
      }
    }

    const recipeIssues = issues.filter(
      (issue) => issue.stage === "recipes",
    );
    stages.recipes.status = recipeIssues.some(
      (issue) => (issue.severity as string) === "error",
    )
      ? "failed"
      : "passed";
    stages.recipes.recipeCount = recipeReports.length;
    finishStage(stages.recipes, recipeIssues);
  }

  return finish();

  function finish(): WorkspaceValidationReport {
    for (const stage of Object.values(stages) as ValidationStage[]) {
      if (stage.status === ("pending" as ValidationStageStatus)) {
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
        id: (config?.id as string | null) ?? null,
        name: (config?.name as string | undefined) ?? "Unknown workspace",
        user: (config?.user as string | null) ?? null,
        root: options.workspaceRoot,
      },
  options: {
    artifactId: options.artifactId ?? null,
    artifactKind: options.artifactKind ?? null,
    user,
    allUsers: options.allUsers ?? false,
    validateExports: options.validateExports !== false,
    validateRecipes: options.validateRecipes !== false,
    minify: options.minify ?? false,
    maxBytes: (options.maxBytes ?? undefined) as number | undefined,
    failOnWarning: options.failOnWarning ?? false,
  },
      stages,
      artifacts: artefactReports,
      recipes: recipeReports,
      sources: sourceReports,
      issues: sortIssues(issues),
      summary: {
        valid,
        errorCount,
        warningCount,
        artifactCount: artefactReports.length,
        recipeCount: recipeReports.length,
        sourceCount: sourceReports.length,
        exportValidatedCount: artefactReports.filter(
          (artifact) => artifact.export.status === "passed",
        ).length,
        exportFailedCount: artefactReports.filter(
          (artifact) => artifact.export.status === "failed",
        ).length,
      },
    };
  }
}

function createStages(): Record<string, ValidationStage> {
  return {
    workspace: stage(),
    library: stage(),
    appearance: stage(),
    sources: stage(),
    recipes: stage(),
    exports: stage(),
  };
}

function stage(): ValidationStage {
  return {
    status: "pending",
    errorCount: 0,
    warningCount: 0,
  };
}

function finishStage(stage: ValidationStage, issues: readonly ValidationIssue[]): void {
  stage.errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  stage.warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
}

function errorIssue(
  stage: string,
  code: string,
  error: unknown,
  details: Record<string, unknown> = {},
): ValidationIssue {
  return {
    stage,
    severity: "error",
    code,
    message: error instanceof Error ? error.message : String(error),
    ...details,
  };
}

function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const severityOrder: Record<string, number> = { error: 0, warning: 1 };
  const stageOrder: Record<string, number> = {
    workspace: 0,
    library: 1,
    appearance: 2,
    sources: 3,
    recipes: 4,
    exports: 5,
  };

  return [...issues].sort(
    (left, right) =>
      (severityOrder[left.severity ?? ""] ?? 9) -
        (severityOrder[right.severity ?? ""] ?? 9) ||
      (stageOrder[left.stage ?? ""] ?? 9) -
        (stageOrder[right.stage ?? ""] ?? 9) ||
      String(left.code ?? "").localeCompare(String(right.code ?? ""), "en") ||
      String(left.message ?? "").localeCompare(String(right.message ?? ""), "en"),
  );
}