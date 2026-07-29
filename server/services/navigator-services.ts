import { getRepositoryStatus } from "../../src/git/status.js";
import { validateMinimalCore } from "../../src/library/core.js";
import {
  buildReadinessReport,
  unavailableGit,
} from "../../src/workspace/readiness.js";
import { RevisionCache } from "./revision-cache.js";
import { createArtifactService } from "./artifacts.js";
import { createLibraryService } from "./library.js";
import { createValidationService } from "./validation.js";
import { createWorkspaceRevisionService } from "./workspace-revision.js";
import type {
  GitService,
  GitStatusResult,
  LibraryScanLike,
  PreviewBuilt,
  ReadinessServiceResult,
  RevisionService,
  ServiceBundle,
  ServerLogger,
  StateServiceResult,
  ValidationService,
  LibraryService,
  ArtifactService,
  WorkspaceRevision,
} from "../types.js";

export interface NavigatorServicesOptions {
  workspaceRoot: string;
  now: () => Date;
  logger: ServerLogger;
  pollIntervalMs?: number;
  minimumCheckIntervalMs?: number;
}

interface ReadinessValidationInput {
  artifactId: string | null;
  artifactKind: string | null;
  validateExports: boolean;
  validateRecipes: boolean;
  minify: boolean;
  maxBytes: number;
  failOnWarning: boolean;
}

const DEFAULT_VALIDATION_INPUT: ReadinessValidationInput = {
  artifactId: null,
  artifactKind: null,
  validateExports: true,
  validateRecipes: true,
  minify: false,
  maxBytes: 50 * 1024 * 1024,
  failOnWarning: false,
};

export function createNavigatorServices(
  options: NavigatorServicesOptions,
): ServiceBundle {
  const { workspaceRoot, now, logger } = options;

  const revision: RevisionService = createWorkspaceRevisionService({
    workspaceRoot,
    now,
    logger,
    pollIntervalMs: options.pollIntervalMs,
    minimumCheckIntervalMs: options.minimumCheckIntervalMs,
  });

  const caches = {
    library: new RevisionCache<LibraryScanLike>("library", { maxEntries: 2 }),
    previews: new RevisionCache<PreviewBuilt>("previews", { maxEntries: 24 }),
    validation: new RevisionCache("validation", { maxEntries: 12 }),
  };

  const library: LibraryService = createLibraryService({
    workspaceRoot,
    revision,
    cache: caches.library,
  });

  const artifacts: ArtifactService = createArtifactService({
    workspaceRoot,
    revision,
    library,
    previewCache: caches.previews,
    now,
  });

  const validation: ValidationService = createValidationService({
    workspaceRoot,
    revision,
    cache: caches.validation,
    now,
  });

  const unsubscribe = revision.onChange((event) => {
    for (const cache of Object.values(caches)) {
      cache.clear(`revision:${event.current.id}`);
    }
  });

  async function start(): Promise<WorkspaceRevision> {
    return revision.start();
  }

  async function close(): Promise<void> {
    unsubscribe();
    revision.stop();

    for (const cache of Object.values(caches)) {
      cache.clear("service-close");
    }
  }

  async function safeGitStatus(): Promise<GitStatusResult> {
    try {
      return {
        available: true,
        ...(await getRepositoryStatus(workspaceRoot)),
      };
    } catch (error: unknown) {
      const code =
        error instanceof Error && "code" in error
          ? (error as Error & { code?: string }).code
          : undefined;
      if (
        code === "GIT_REPOSITORY_NOT_FOUND" ||
        code === "WORKSPACE_NOT_REPOSITORY_ROOT" ||
        code === "ENOENT"
      ) {
        return unavailableGit(
          code === "ENOENT"
            ? "Git is not installed or is unavailable on PATH."
            : error instanceof Error
              ? error.message
              : String(error),
          error,
        ) as unknown as GitStatusResult;
      }
      throw error;
    }
  }

  async function readiness(): Promise<ReadinessServiceResult> {
    const [snapshot, validationResult, git] = await Promise.all([
      library.snapshot(),
      validation.validate(DEFAULT_VALIDATION_INPUT as never),
      safeGitStatus(),
    ]);
    const core = await validateMinimalCore(snapshot.scan as never);
    return {
      revision: snapshot.revision,
      report: buildReadinessReport({
        config: snapshot.scan.config as never,
        scan: snapshot.scan as never,
        validation: validationResult.report as never,
        core: core as never,
        git: git as never,
        generatedAt: now().toISOString(),
      } as never),
    };
  }

  async function state(): Promise<StateServiceResult> {
    const current: WorkspaceRevision = await revision.current();

    return {
      revision: current,
      pollIntervalMs: revision.pollIntervalMs,
      caches: Object.fromEntries(
        Object.entries(caches).map(([name, cache]) => [name, cache.snapshot()]),
      ),
    };
  }

  const git: GitService = {
    status: safeGitStatus,
  };

  return {
    revision,
    library,
    artifacts,
    validation,
    git,
    readiness,
    state,
    start,
    close,
  };
}