import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { validateSourcePolicy } from "../data/artifact-refresh.mjs";

export async function validateArtifactSourcePolicies(artifacts, workspaceRoot) {
  const reports = [];

  for (const artifact of artifacts) {
    const root = join(artifact.directory, "data", "source");
    for (const entry of await safeDirectories(root)) {
      const policyPath = join(root, entry.name, "source.json");
      let policy;
      try {
        policy = JSON.parse(await readFile(policyPath, "utf8"));
        validateSourcePolicy(policy, entry.name);
      } catch (error) {
        if (error.code === "ENOENT") continue;
        reports.push({
          artifactId: artifact.id,
          artifactKind: artifact.kind,
          sourceId: entry.name,
          policyPath: display(policyPath, workspaceRoot),
          issues: [{
            severity: "error",
            code: error.code ?? "SOURCE_POLICY_INVALID",
            message: error.message,
          }],
        });
        continue;
      }

      const currentPath = join(root, entry.name, policy.filename);
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

async function safeDirectories(path) {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function fileExists(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function display(path, workspaceRoot) {
  return relative(workspaceRoot, path).replaceAll("\\", "/");
}
