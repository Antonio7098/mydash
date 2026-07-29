import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { buildStandaloneArtifactDocument } from "./rewrite-html.js";
import { validateStandaloneHtml, type StandaloneValidationResult } from "./validate-html.js";
import { writeFileAtomic } from "../files/output.js";
import { resolveExportSourcePath, workspaceDisplayPath } from "./paths.js";
import type { ArtifactEntry } from "./types.js";

export interface BuildStandaloneArtifactOptions {
  workspaceRoot: string;
  artifact: ArtifactEntry;
  scan?: unknown;
  resolution?: unknown;
  minify?: boolean;
  maxBytes?: number;
}

export interface BuiltArtifact {
  artifact: {
    id: string;
    kind: string;
    title: string | null;
    source: string | null;
    entry: string;
  };
  html: string;
  sizeBytes: number;
  sha256: string;
  validation: StandaloneValidationResult;
  resources: unknown;
  warnings: unknown[];
  sourceEntryPath: string;
}

export async function buildStandaloneArtifact(
  options: BuildStandaloneArtifactOptions,
): Promise<BuiltArtifact> {
  const entryPath = await resolveArtifactEntry(options);
  const source = await readFile(entryPath, "utf8");
  const rewritten = await buildStandaloneArtifactDocument({
    workspaceRoot: options.workspaceRoot,
    artifact: options.artifact,
    entryPath,
    source,
    scan: options.scan as { entries: { manifestPath: string; manifest: Record<string, unknown> }[] },
    resolution: options.resolution as { selections: { theme: { entry: { manifestPath: string } | null } | null; assets: Record<string, { entry: { manifestPath: string } | null } | null> }; dependencyClosure: { manifestPath: string; kind: string; id: string }[] },
    minify: options.minify,
    maxBytes: options.maxBytes ?? undefined,
  });
  const validation = validateStandaloneHtml(rewritten.html, {
    maxBytes: options.maxBytes,
  });

  if (!validation.valid) {
    const error = new Error(
      `Standalone export validation failed: ${validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("; ")}`,
    ) as Error & { code: string; validation: StandaloneValidationResult };
    error.code = "STANDALONE_EXPORT_INVALID";
    error.validation = validation;
    throw error;
  }

  const sha256 = createHash("sha256")
    .update(rewritten.html)
    .digest("hex");

  return {
    artifact: {
      id: options.artifact.id,
      kind: options.artifact.kind,
      title: options.artifact.title,
      source: options.artifact.displayPath,
      entry: workspaceDisplayPath(
        entryPath,
        options.workspaceRoot,
      ),
    },
    html: rewritten.html,
    sizeBytes: validation.sizeBytes,
    sha256,
    validation,
    resources: rewritten.resources,
    warnings: rewritten.warnings,
    sourceEntryPath: entryPath,
  };
}

export interface ExportStandaloneArtifactOptions extends BuildStandaloneArtifactOptions {
  outputPath: string;
  overwrite?: boolean;
}

export interface ExportResult {
  artifact: BuiltArtifact["artifact"];
  output: {
    path: string;
    displayPath: string;
  };
  sizeBytes: number;
  sha256: string;
  validation: StandaloneValidationResult;
  resources: unknown;
  warnings: unknown[];
}

export async function exportStandaloneArtifact(
  options: ExportStandaloneArtifactOptions,
): Promise<ExportResult> {
  const built = await buildStandaloneArtifact(options);
  if (resolve(options.outputPath) === built.sourceEntryPath) {
    const error = new Error(
      "Export output cannot overwrite the artefact source entry.",
    ) as Error & { code: string };
    error.code = "OUTPUT_OVERWRITES_SOURCE";
    throw error;
  }

  const outputPath = await writeFileAtomic(
    options.outputPath,
    built.html,
    {
      workspaceRoot: options.workspaceRoot,
      overwrite: options.overwrite ?? false,
      encoding: "utf8",
    },
  );

  return {
    artifact: built.artifact,
    output: {
      path: outputPath,
      displayPath: workspaceDisplayPath(
        outputPath,
        options.workspaceRoot,
      ),
    },
    sizeBytes: built.sizeBytes,
    sha256: built.sha256,
    validation: built.validation,
    resources: built.resources,
    warnings: built.warnings,
  };
}

async function resolveArtifactEntry(options: BuildStandaloneArtifactOptions): Promise<string> {
  const entry = options.artifact.manifest.entry as string | undefined;

  if (
    typeof entry !== "string" ||
    extname(entry).toLowerCase() !== ".html"
  ) {
    const error = new Error(
      `Artefact entry must be an HTML file: ${entry ?? "(missing)"}`,
    ) as Error & { code: string };
    error.code = "ARTIFACT_ENTRY_NOT_HTML";
    throw error;
  }

  const resolved = await resolveExportSourcePath(
    options.artifact.manifestPath,
    entry,
    options.workspaceRoot,
  );

  if (resolved.kind !== "file" || !resolved.path) {
    const error = new Error(
      `Artefact entry is not a local file: ${entry}`,
    ) as Error & { code: string };
    error.code = "ARTIFACT_ENTRY_INVALID";
    throw error;
  }

  return resolved.path;
}