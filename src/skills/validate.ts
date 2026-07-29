import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { discoverProjectSkills } from "./discover.js";

export const LOGICAL_SKILLS = [
  "mydash",
  "help",
  "spreadsheet",
  "powerpoint",
  "dashboard",
  "presentation",
  "concept",
  "component",
  "hsbc-visual-standards",
];

export const EXPECTED_COMMANDS = [
  ...LOGICAL_SKILLS,
  "mydash-help",
];

const SUPPORTING_FILES = [
  "docs/cli-reference.md",
  "docs/api-reference.md",
];

const CONTENT_RULES: Record<string, string[]> = {
  mydash: [
    "Do not maintain an artefact index",
    "mydash git checkpoint",
    "data.user",
    "Every primitive, component, layout, theme, preset and asset",
    "Load `/component`",
    "shows only artefacts belonging to the user configured",
    "Maintain `CHANGELOG.md` for every core-system change",
    "An addition or correction to `/help` is a core-system change",
  ],
  help: [
    "nontechnical",
    "Capture recurring guidance",
    "Navigator shows content for the user",
    "Every addition or correction to this `/help` skill",
  ],
  "mydash-help": [
    ".claude/skills/help/SKILL.md",
  ],
  spreadsheet: [
    "Never execute workbook macros",
    "mydash git checkpoint",
  ],
  powerpoint: [
    "Never execute PowerPoint macros",
    "mydash git checkpoint",
  ],
  dashboard: [
    "kind dashboard",
    "mydash git checkpoint",
    "An implementation without its manifest",
  ],
  presentation: [
    "kind presentation",
    "mydash git checkpoint",
    "An implementation without its manifest",
  ],
  concept: [
    "Local",
    "mydash git checkpoint",
    "An implementation without its manifest",
  ],
  component: [
    "Local → Collection → Core",
    "mydash impact",
    "--acknowledge-impact",
    "implementation without its manifest is not a resource",
    "library diagnostics",
  ],
  "hsbc-visual-standards": [
    "Do not claim official brand approval",
    "mydash git checkpoint",
  ],
};

export interface SkillValidationIssue {
  severity: "warning" | "error";
  code: string;
  message: string;
  command?: string;
  path?: string;
  lineCount?: number;
  requiredText?: string;
}

export interface SkillValidationSummary {
  valid: boolean;
  logicalSkillCount: number;
  commandCount: number;
  errorCount: number;
  warningCount: number;
}

export interface SkillValidationReport {
  entries: unknown[];
  issues: SkillValidationIssue[];
  summary: SkillValidationSummary;
}

export async function validateProjectSkills(
  workspaceRoot: string,
): Promise<SkillValidationReport> {
  const discovered = await discoverProjectSkills(workspaceRoot);
  const issues: SkillValidationIssue[] = [...discovered.diagnostics];

  for (const expected of EXPECTED_COMMANDS) {
    if (!discovered.entries.some((entry) => entry.command === expected)) {
      issues.push({
        severity: "error",
        code: "EXPECTED_SKILL_MISSING",
        message:
          `Expected project skill is missing: /${expected}.`,
        command: expected,
      });
    }
  }

  for (const entry of discovered.entries) {
    for (const error of entry.errors) {
      issues.push({
        severity: "error",
        command: entry.command,
        path: entry.displayPath,
        ...error,
      });
    }

    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.command)) {
      issues.push({
        severity: "error",
        code: "SKILL_COMMAND_INVALID",
        message:
          `Skill command must be kebab-case: ${entry.command}.`,
        command: entry.command,
      });
    }

    if (!entry.description.trim()) {
      issues.push({
        severity: "error",
        code: "SKILL_DESCRIPTION_MISSING",
        message:
          `Skill /${entry.command} requires a description.`,
        command: entry.command,
      });
    } else if (entry.description.length > 800) {
      issues.push({
        severity: "warning",
        code: "SKILL_DESCRIPTION_LONG",
        message:
          `Skill /${entry.command} has a long description (${entry.description.length} characters).`,
        command: entry.command,
      });
    }

    if (!entry.body.trim()) {
      issues.push({
        severity: "error",
        code: "SKILL_BODY_MISSING",
        message:
          `Skill /${entry.command} has no instructions.`,
        command: entry.command,
      });
    }

    if (entry.source.includes("docs/agent-workflows/")) {
      issues.push({
        severity: "error",
        code: "SKILL_LEGACY_WORKFLOW_REFERENCE",
        message:
          `Skill /${entry.command} still depends on the retired docs/agent-workflows directory.`,
        command: entry.command,
      });
    }

    if (entry.lineCount > 500) {
      issues.push({
        severity: "error",
        code: "SKILL_TOO_LONG",
        message:
          `Skill /${entry.command} exceeds 500 lines.`,
        command: entry.command,
        lineCount: entry.lineCount,
      });
    }

    if (
      /(^|\s)!`|```!/m.test(entry.source)
    ) {
      issues.push({
        severity: "error",
        code: "SKILL_SHELL_INJECTION_FORBIDDEN",
        message:
          `Skill /${entry.command} contains dynamic shell injection. Use explicit agent tool calls instead.`,
        command: entry.command,
      });
    }

    if (Object.hasOwn(entry.frontmatter, "allowed-tools")) {
      issues.push({
        severity: "warning",
        code: "SKILL_SELF_GRANTS_TOOLS",
        message:
          `Skill /${entry.command} pre-approves tools. Review this permission carefully.`,
        command: entry.command,
      });
    }

    for (const requiredText of CONTENT_RULES[entry.command] ?? []) {
      if (
        !entry.body
          .toLowerCase()
          .includes(requiredText.toLowerCase())
      ) {
        issues.push({
          severity: "error",
          code: "SKILL_REQUIRED_RULE_MISSING",
          message:
            `Skill /${entry.command} is missing required guidance: ${requiredText}.`,
          command: entry.command,
          requiredText,
        });
      }
    }
  }

  for (const relativePath of SUPPORTING_FILES) {
    try {
      await access(resolve(workspaceRoot, relativePath));
    } catch {
      issues.push({
        severity: "error",
        code: "SKILL_SUPPORT_FILE_MISSING",
        message:
          `Skill support file is missing: ${relativePath}.`,
        path: relativePath,
      });
    }
  }

  const errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;

  return {
    entries: discovered.entries,
    issues: issues.sort(compareIssues),
    summary: {
      valid: errorCount === 0,
      logicalSkillCount: LOGICAL_SKILLS.filter((command) =>
        discovered.entries.some((entry) => entry.command === command),
      ).length,
      commandCount: discovered.entries.length,
      errorCount,
      warningCount,
    },
  };
}

function compareIssues(
  left: SkillValidationIssue,
  right: SkillValidationIssue,
): number {
  const order: Record<string, number> = { error: 0, warning: 1 };

  return (
    (order[left.severity] ?? 9) -
      (order[right.severity] ?? 9) ||
    String(left.code).localeCompare(String(right.code), "en") ||
    String(left.message).localeCompare(String(right.message), "en")
  );
}