import {
  getRepositoryStatus,
} from "../../src/git/status.mjs";
import {
  RevisionCache,
} from "./revision-cache.mjs";
import {
  createArtifactService,
} from "./artifacts.mjs";
import {
  createLibraryService,
} from "./library.mjs";
import {
  createValidationService,
} from "./validation.mjs";
import {
  validateMinimalCore,
} from "../../src/library/core.mjs";
import {
  buildReadinessReport,
  unavailableGit,
} from "../../src/workspace/readiness.mjs";
import {
  createWorkspaceRevisionService,
} from "./workspace-revision.mjs";

export function createNavigatorServices(
  options,
) {
  const {
    workspaceRoot,
    now,
    logger,
  } = options;
  const revision =
    createWorkspaceRevisionService({
      workspaceRoot,
      now,
      logger,
      pollIntervalMs:
        options.pollIntervalMs,
      minimumCheckIntervalMs:
        options.minimumCheckIntervalMs,
    });
  const caches = {
    library: new RevisionCache(
      "library",
      { maxEntries: 2 },
    ),
    previews: new RevisionCache(
      "previews",
      { maxEntries: 24 },
    ),
    validation: new RevisionCache(
      "validation",
      { maxEntries: 12 },
    ),
  };
  const library =
    createLibraryService({
      workspaceRoot,
      revision,
      cache: caches.library,
    });
  const artifacts =
    createArtifactService({
      workspaceRoot,
      revision,
      library,
      previewCache:
        caches.previews,
      now,
    });
  const validation =
    createValidationService({
      workspaceRoot,
      revision,
      cache: caches.validation,
      now,
    });
  const unsubscribe =
    revision.onChange((event) => {
      for (const cache of Object.values(
        caches,
      )) {
        cache.clear(
          `revision:${event.current.id}`,
        );
      }
    });

  async function start() {
    return revision.start();
  }

  async function close() {
    unsubscribe();
    revision.stop();

    for (const cache of Object.values(
      caches,
    )) {
      cache.clear("service-close");
    }
  }

  async function safeGitStatus() {
    try {
      return {
        available: true,
        ...(await getRepositoryStatus(workspaceRoot)),
      };
    } catch (error) {
      if (
        [
          "GIT_REPOSITORY_NOT_FOUND",
          "WORKSPACE_NOT_REPOSITORY_ROOT",
          "ENOENT",
        ].includes(error?.code)
      ) {
        return unavailableGit(
          error.code === "ENOENT"
            ? "Git is not installed or is unavailable on PATH."
            : error.message,
          error,
        );
      }
      throw error;
    }
  }

  async function readiness() {
    const [snapshot, validationResult, git] = await Promise.all([
      library.snapshot(),
      validation.validate({
        artifactId: null,
        artifactKind: null,
        validateExports: true,
        validateRecipes: true,
        minify: false,
        maxBytes: 50 * 1024 * 1024,
        failOnWarning: false,
      }),
      safeGitStatus(),
    ]);
    const core = await validateMinimalCore(snapshot.scan);
    return {
      revision: snapshot.revision,
      report: buildReadinessReport({
        config: snapshot.scan.config,
        scan: snapshot.scan,
        validation: validationResult.report,
        core,
        git,
        generatedAt: now().toISOString(),
      }),
    };
  }

  async function state() {
    const current =
      await revision.current();

    return {
      revision: current,
      pollIntervalMs:
        revision.pollIntervalMs,
      caches: Object.fromEntries(
        Object.entries(caches).map(
          ([name, cache]) => [
            name,
            cache.snapshot(),
          ],
        ),
      ),
    };
  }

  return {
    revision,
    library,
    artifacts,
    validation,
    git: {
      status: safeGitStatus,
    },
    readiness,
    state,
    start,
    close,
  };
}
