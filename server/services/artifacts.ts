import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { buildStandaloneArtifact } from "../../src/export/export-artifact.js";
import { checkpointWorkspace } from "../../src/git/checkpoint.js";
import { runGit } from "../../src/git/run.js";
import { getRepositoryStatus } from "../../src/git/status.js";
import { findArtifact } from "../../src/resolution/find-artifact.js";
import { resolveArtifactAppearance } from "../../src/resolution/resolve.js";
import {
  applyAppearanceInput,
  buildAppearanceOptions,
  normaliseAppearanceInput,
  validateAppearanceReferences,
} from "../../src/appearance/controls.js";
import { HttpError } from "../http.js";
import { stableStringify } from "../etag.js";
import { artifactsForUser, availableUsers } from "../../src/users/scope.js";
import { RevisionCache } from "./revision-cache.js";
import type {
  AppearanceControlsLike,
  ArtifactAppearanceOptionsResult,
  ArtifactAppearanceResolutionLike,
  ArtifactDetailResult,
  ArtifactListResult,
  ArtifactPreviewResult,
  ArtifactSaveAppearanceResult,
  ArtifactService,
  ArtifactUsersResult,
  LibraryEntryLike,
  LibraryScanLike,
  LibraryService,
  PreviewBuilt,
  PreviewOptions,
  RevisionService,
  WorkspaceRevision,
} from "../types.js";

export interface ArtifactServiceOptions {
  workspaceRoot: string;
  revision: RevisionService;
  library: LibraryService;
  previewCache: RevisionCache<PreviewBuilt>;
  now: () => Date;
}

export function createArtifactService(
  options: ArtifactServiceOptions,
): ArtifactService {
  const { library, revision, previewCache, workspaceRoot, now } = options;

  async function list(user: string | null = null): Promise<ArtifactListResult> {
    const snapshot = await library.snapshot();
    const configuredUser = stringOrNull(snapshot.scan.config.user);
    const selectedUser: string | null = user ?? configuredUser;

    return {
      ...snapshot,
      user: selectedUser,
      artifacts: artifactsForUser(
        snapshot.scan.entries as never,
        selectedUser as string,
      ) as unknown as LibraryEntryLike[],
    };
  }

  async function users(): Promise<ArtifactUsersResult> {
    const snapshot = await library.snapshot();
    const configuredUser = stringOrNull(snapshot.scan.config.user);

    return {
      ...snapshot,
      currentUser: configuredUser,
      users: availableUsers(
        snapshot.scan.entries as never,
        (configuredUser ?? "") as string,
      ),
    };
  }

  async function get(
    kind: string,
    id: string,
    appearance: unknown = null,
    user: string | null = null,
  ): Promise<ArtifactDetailResult> {
    const snapshot = await library.snapshot();
    const configuredUser = stringOrNull(snapshot.scan.config.user);
    const selectedUser: string | null = user ?? configuredUser;
    const sourceArtifact = findArtifact(
      snapshot.scan as never,
      id,
      kind,
      selectedUser,
    ) as unknown as LibraryEntryLike & { manifest: Record<string, unknown> };
    const artifact = appearance
      ? (applyAppearanceInput(sourceArtifact, appearance) as LibraryEntryLike & {
          manifest: Record<string, unknown>;
        })
      : sourceArtifact;
    const resolution = resolveArtifactAppearance(
      snapshot.scan as never,
      artifact as never,
    ) as unknown as ArtifactAppearanceResolutionLike;

    return {
      ...snapshot,
      user: selectedUser,
      sourceArtifact,
      artifact,
      appearance: normaliseAppearanceInput(
        artifact.manifest.appearance,
      ),
      resolution,
    };
  }

  async function appearanceOptions(
    kind: string,
    id: string,
    user: string | null = null,
  ): Promise<ArtifactAppearanceOptionsResult> {
    const snapshot = await get(kind, id, null, user);
    const controls = buildAppearanceOptions(
      snapshot.scan as never,
      snapshot.sourceArtifact as never,
    ) as unknown as AppearanceControlsLike;

    return {
      ...snapshot,
      controls,
    };
  }

  async function preview(
    kind: string,
    id: string,
    previewOptions: PreviewOptions = {},
  ): Promise<ArtifactPreviewResult> {
    const appearance = previewOptions.appearance
      ? normaliseAppearanceInput(previewOptions.appearance)
      : null;
    const cacheKey = stableStringify({
      kind,
      id,
      user: previewOptions.user ?? null,
      appearance,
      minify: previewOptions.minify ?? false,
      maxBytes: previewOptions.maxBytes,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const snapshot = await get(
        kind,
        id,
        appearance,
        previewOptions.user,
      );
      const built = await previewCache.get(
        cacheKey,
        snapshot.revision.id,
        () =>
          buildStandaloneArtifact({
            workspaceRoot,
            scan: snapshot.scan as never,
            artifact: snapshot.artifact as never,
            resolution: snapshot.resolution as never,
            minify: previewOptions.minify ?? false,
            maxBytes: previewOptions.maxBytes,
          } as never).then((result) => ({
            html: result.html,
            sizeBytes: result.sizeBytes,
            sha256: result.sha256,
            validation: result.validation,
            resources: result.resources,
            warnings: result.warnings,
          })),
      );
      const after: WorkspaceRevision = await revision.current({
        force: true,
        reason: "preview-consistency-check",
      });

      if (snapshot.revision.id === after.id) {
        return {
          ...snapshot,
          revision: after,
          built,
          cacheKey,
        };
      }

      previewCache.delete(cacheKey);
    }

    const error = new Error(
      "The workspace changed repeatedly while the preview was being built.",
    ) as Error & { code: string };
    error.code = "WORKSPACE_CHANGED_DURING_READ";
    throw error;
  }

  async function saveAppearance(
    kind: string,
    id: string,
    request: { appearance: unknown; expectedRevision: string },
    user: string | null = null,
  ): Promise<ArtifactSaveAppearanceResult> {
    const before = await get(kind, id, null, user);

    if (
      !request.expectedRevision ||
      request.expectedRevision !== before.revision.id
    ) {
      throw new HttpError(
        409,
        "APPEARANCE_REVISION_CONFLICT",
        "The workspace changed after the appearance panel opened. Refresh before saving.",
        {
          details: {
            expectedRevision: request.expectedRevision ?? null,
            currentRevision: before.revision.id,
          },
        },
      );
    }

    const status = await getRepositoryStatus(workspaceRoot);

    if (resolve(status.root) !== resolve(workspaceRoot)) {
      throw new HttpError(
        409,
        "WORKSPACE_GIT_ROOT_MISMATCH",
        "Artefact-default changes require the workspace to be the Git repository root.",
      );
    }

    const manifestPath = before.sourceArtifact.manifestPath;
    const relativeManifest = relative(status.root, manifestPath).replaceAll(
      "\\",
      "/",
    );
    const existing = status.changes.find(
      (change) =>
        change.path === relativeManifest ||
        change.originalPath === relativeManifest,
    );

    if (existing) {
      throw new HttpError(
        409,
        "ARTEFACT_MANIFEST_ALREADY_CHANGED",
        `${relativeManifest} already contains uncommitted changes and was not modified.`,
        { details: { change: existing } },
      );
    }

    const references = validateAppearanceReferences(
      before.scan as never,
      before.sourceArtifact as never,
      request.appearance,
    );

    if (!references.valid) {
      throw new HttpError(
        422,
        "APPEARANCE_REFERENCES_INVALID",
        "The proposed appearance contains unavailable or ambiguous resources.",
        { details: { issues: references.issues } },
      );
    }

    const proposed = applyAppearanceInput(
      before.sourceArtifact,
      references.appearance,
    ) as LibraryEntryLike & { manifest: Record<string, unknown> };
    const resolution = resolveArtifactAppearance(
      before.scan as never,
      proposed as never,
    ) as unknown as ArtifactAppearanceResolutionLike;

    if (!resolution.summary.valid) {
      throw new HttpError(
        422,
        "APPEARANCE_RESOLUTION_INVALID",
        "The proposed appearance could not be resolved.",
        { details: { issues: resolution.issues } },
      );
    }

    const built = await buildStandaloneArtifact({
      workspaceRoot,
      scan: before.scan as never,
      artifact: proposed as never,
      resolution: resolution as never,
      minify: false,
      maxBytes: 50 * 1024 * 1024,
    });
    const original = await readFile(manifestPath, "utf8");
    const next = `${JSON.stringify(proposed.manifest, null, 2)}\n`;
    const headBefore = status.head;

    if (original === next) {
      return {
        artifact: before.sourceArtifact,
        appearance: before.appearance,
        resolution,
        export: {
          ready: true,
          sizeBytes: built.sizeBytes,
          sha256: built.sha256,
          validation: built.validation,
          warnings: built.warnings,
        },
        checkpoint: null,
        revision: before.revision,
      };
    }

    await atomicWrite(manifestPath, next);
    await revision.current({
      force: true,
      reason: "appearance-default-write",
    });

    let checkpoint;

    try {
      checkpoint = await checkpointWorkspace({
        workspaceRoot,
        paths: [relativeManifest],
        message: `Update ${before.sourceArtifact.title} appearance`,
        push: true,
        acknowledgeImpact: false,
        failOnWarning: false,
        allUsers: true,
        now,
      } as never);
    } catch (error: unknown) {
      const after = await getRepositoryStatus(workspaceRoot);

      if (after.head === headBefore) {
        runGit(
          ["reset", "--quiet", "HEAD", "--", relativeManifest],
          { cwd: workspaceRoot, allowFailure: true } as never,
        );
        await atomicWrite(manifestPath, original);
        await revision.current({
          force: true,
          reason: "appearance-default-rollback",
        });
      }

      throw error;
    }

    previewCache.clear("appearance-default-saved");
    const after = await get(kind, id, null, user);

    return {
      artifact: after.sourceArtifact,
      appearance: after.appearance,
      resolution: after.resolution,
      export: {
        ready: true,
        sizeBytes: built.sizeBytes,
        sha256: built.sha256,
        validation: built.validation,
        warnings: built.warnings,
      },
      checkpoint,
      revision: after.revision,
    };
  }

  return {
    users,
    list,
    get,
    appearanceOptions,
    preview,
    saveAppearance,
  };
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}