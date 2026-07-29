import process from "node:process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateDocument } from "../validation/contracts.js";
import type { WorkspaceConfig } from "./types.js";

export async function loadWorkspaceConfig(workspaceRoot: string): Promise<WorkspaceConfig> {
  const path = join(workspaceRoot, "config", "workspace.json");
  const source = await readFile(path, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Workspace configuration is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const validation = validateDocument("workspace", parsed);

  if (!validation.ok) {
    const details = validation.errors
      .map((error) => `${error.path}: ${error.message}`)
      .join("; ");

    throw new Error(`Workspace configuration is invalid: ${details}`);
  }

  return parsed as WorkspaceConfig;
}