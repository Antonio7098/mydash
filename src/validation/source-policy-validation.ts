import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { validateSourcePolicy } from "../data/artifact-refresh.js";
import type { LibraryEntry } from "../library/types.js";
import type { ValidationIssue } from "./types.js";

export interface SourcePolicyValidationReport {
  artifactId: string;
  artifactKind: string;
  sourceId: string;
  policyPath: string;
  currentPath?: string;
  policy?: unknown;
  issues: ValidationIssue[];
}

export async function validateArtifactSourcePolicies(
  artifacts: readonly LibraryEntry[],
  workspaceRoot: string,
): Promise<SourcePolicyValidationReport[]> {
  const reports: SourcePolicyValidationReport[] = [];

  for (const artifact of artifacts) {
    const root = join(artifact.directory, "data", "source");
    for (const entry of await safeDirectories(root)) {
      const policyPath = join(root, entry.name, "source.json");
      let policy: unknown;
      try {
        policy = JSON.parse(await readFile(policyPath, "utf8"));
        validateSourcePolicy(policy, entry.name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        reports.push({
          artifactId: artifact.id,
          artifactKind: artifact.kind,
          sourceId: entry.name,
          policyPath: display(policyPath, workspaceRoot),
          issues: [{
            severity: "error",
            code: (error as { code?: string }).code ?? "SOURCE_POLICY_INVALID",
            message: error instanceof Error ? error.message : String(error),
          }],
        });
        continue;
      }

      const currentPath = join(root, entry.name, (policy as { filename?: string }).filename ?? "");
      const present = await fileExists(currentPath);
      reports.push({
        artifactId: artifact.id,
        artifactKind: artifact.kind,
        sourceId: entry.name,
        policyPath: display(policyPath, workspaceRoot),
        currentPath: display(currentPath, workspaceRoot),
        policy,
        issues: present ? [] : [{
          severity: "warning",
          code: "SOURCE_SNAPSHOT_MISSING",
          message: `Workstation-local source snapshot is not present: ${display(currentPath, workspaceRoot)}.`,
        }],
      });
    }
  }

  return reports;
}

async function safeDirectories(path: string): Promise<{ name: string }[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function display(path: string, workspaceRoot: string): string {
  return relative(workspaceRoot, path).replaceAll("\\", "/");
}