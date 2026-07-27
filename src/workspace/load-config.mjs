import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateDocument } from "../validation/contracts.mjs";

export async function loadWorkspaceConfig(workspaceRoot) {
  const path = join(workspaceRoot, "config", "workspace.json");
  const source = await readFile(path, "utf8");

  let config;

  try {
    config = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Workspace configuration is not valid JSON: ${error.message}`,
    );
  }

  const validation = validateDocument("workspace", config);

  if (!validation.ok) {
    const details = validation.errors
      .map((error) => `${error.path}: ${error.message}`)
      .join("; ");

    throw new Error(`Workspace configuration is invalid: ${details}`);
  }

  return config;
}
