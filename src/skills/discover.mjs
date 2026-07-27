import {
  lstat,
  readFile,
  readdir,
} from "node:fs/promises";
import {
  join,
  relative,
  resolve,
} from "node:path";
import {
  parseSkillMarkdown,
} from "./frontmatter.mjs";

export async function discoverProjectSkills(workspaceRoot) {
  const root = resolve(
    workspaceRoot,
    ".claude",
    "skills",
  );
  const entries = [];
  const diagnostics = [];
  let directoryEntries;

  try {
    directoryEntries = await readdir(root, {
      withFileTypes: true,
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        root,
        entries,
        diagnostics: [
          {
            severity: "error",
            code: "SKILLS_DIRECTORY_MISSING",
            message:
              "Project skills directory .claude/skills does not exist.",
          },
        ],
      };
    }

    throw error;
  }

  directoryEntries.sort((left, right) =>
    left.name.localeCompare(right.name, "en"),
  );

  for (const item of directoryEntries) {
    if (item.name.startsWith(".")) continue;

    const directory = join(root, item.name);
    const metadata = await lstat(directory);

    if (metadata.isSymbolicLink()) {
      diagnostics.push({
        severity: "warning",
        code: "SKILL_SYMLINK_SKIPPED",
        message:
          `Skill symlink was not inspected by mydash: ${item.name}.`,
        command: item.name,
      });
      continue;
    }

    if (!metadata.isDirectory()) continue;

    const skillPath = join(directory, "SKILL.md");
    let source;

    try {
      source = await readFile(skillPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        diagnostics.push({
          severity: "error",
          code: "SKILL_FILE_MISSING",
          message:
            `Skill directory ${item.name} has no SKILL.md.`,
          command: item.name,
        });
        continue;
      }

      throw error;
    }

    const parsed = parseSkillMarkdown(source, {
      path: relative(workspaceRoot, skillPath)
        .replaceAll("\\", "/"),
    });

    entries.push({
      command: item.name,
      directory,
      skillPath,
      displayPath: relative(workspaceRoot, skillPath)
        .replaceAll("\\", "/"),
      source,
      ...parsed,
      displayName:
        typeof parsed.frontmatter.name === "string" &&
        parsed.frontmatter.name
          ? parsed.frontmatter.name
          : item.name,
      description:
        typeof parsed.frontmatter.description === "string"
          ? parsed.frontmatter.description
          : "",
      userInvocable:
        parsed.frontmatter["user-invocable"] !== false,
      modelInvocable:
        parsed.frontmatter["disable-model-invocation"] !== true,
    });
  }

  return {
    root,
    entries,
    diagnostics,
  };
}
