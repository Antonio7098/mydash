import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LibraryEntry, LibraryScan } from "./types.js";

export const MINIMAL_CORE = Object.freeze({
  theme: ["hsbc-light"],
  preset: ["default"],
  layout: ["dashboard-shell"],
  component: [
    "metric-card",
    "section-heading",
  ],
  primitive: [
    "button",
    "status-badge",
  ],
  asset: ["mydash-brand-mark"],
});

export interface MinimalCoreIssue {
  severity: "error";
  code:
    | "MINIMAL_CORE_RESOURCE_MISSING"
    | "MINIMAL_CORE_RESOURCE_DUPLICATE"
    | "MINIMAL_CORE_CONTRACT_INVALID"
    | "MINIMAL_CORE_ENTRY_MISSING"
    | "MINIMAL_CORE_THEME_TOKEN_MISSING"
    | "MINIMAL_CORE_CSS_TOKEN_UNRESOLVED"
    | "MINIMAL_CORE_BRAND_CONTRACT_INVALID";
  message: string;
  kind?: string;
  id?: string;
  manifestPath?: string;
  sourcePath?: string;
  token?: string;
}

export interface MinimalCoreSummary {
  valid: boolean;
  expectedResourceCount: number;
  discoveredResourceCount: number;
  errorCount: number;
  warningCount: number;
}

export interface MinimalCoreReport {
  issues: MinimalCoreIssue[];
  summary: MinimalCoreSummary;
}

export async function validateMinimalCore(
  scan: LibraryScan,
): Promise<MinimalCoreReport> {
  const issues: MinimalCoreIssue[] = [];
  const expected = Object.entries(MINIMAL_CORE).flatMap(([kind, ids]) =>
    ids.map((id) => ({ kind, id })),
  );

  for (const item of expected) {
    const matches = scan.entries.filter(
      (entry) =>
        entry.kind === item.kind &&
        entry.id === item.id &&
        entry.level === "core",
    );

    if (matches.length !== 1) {
      issues.push({
        severity: "error",
        code:
          matches.length === 0
            ? "MINIMAL_CORE_RESOURCE_MISSING"
            : "MINIMAL_CORE_RESOURCE_DUPLICATE",
        message: `Expected exactly one Core ${item.kind}:${item.id}; found ${matches.length}.`,
        kind: item.kind,
        id: item.id,
      });
      continue;
    }

    const entry = matches[0];
    if (!entry) continue;

    if (!entry.contractValid) {
      issues.push({
        severity: "error",
        code: "MINIMAL_CORE_CONTRACT_INVALID",
        message: `Core ${item.kind}:${item.id} does not satisfy its manifest contract.`,
        manifestPath: entry.manifestPath,
      });
    }

    const sourcePath =
      item.kind === "asset"
        ? join(entry.directory, entry.manifest.file as string)
        : item.kind === "theme" || item.kind === "preset"
          ? null
          : join(entry.directory, entry.manifest.entry as string);

    if (sourcePath) {
      try {
        await access(sourcePath);
      } catch {
        issues.push({
          severity: "error",
          code: "MINIMAL_CORE_ENTRY_MISSING",
          message: `Core ${item.kind}:${item.id} references a missing file.`,
          manifestPath: entry.manifestPath,
          sourcePath,
        });
      }
    }
  }

  const theme = find(scan, "theme", "hsbc-light");
  const requiredTokens = [
    "colour-primary",
    "colour-background",
    "colour-surface",
    "colour-text",
    "colour-text-muted",
    "colour-border",
    "font-family",
    "space-4",
    "radius-lg",
  ];

  for (const token of requiredTokens) {
    if (
      !Object.hasOwn(theme?.manifest.tokens ?? {}, token)
    ) {
      issues.push({
        severity: "error",
        code: "MINIMAL_CORE_THEME_TOKEN_MISSING",
        message: `Core theme hsbc-light is missing token ${token}.`,
        token,
      });
    }
  }

  const cssEntries = scan.entries.filter(
    (entry) =>
      ["primitive", "component", "layout"].includes(entry.kind) &&
      Object.values(MINIMAL_CORE)
        .flat()
        .includes(entry.id) &&
      (entry.manifest.entry as string | undefined)?.endsWith(".css"),
  );

  for (const entry of cssEntries) {
    const source = await readFile(
      join(entry.directory, entry.manifest.entry as string),
      "utf8",
    );
    const referencedTokens = [
      ...source.matchAll(/var\(--([a-z0-9-]+)\)/g),
    ].map((match) => match[1] as string);

    for (const token of new Set(referencedTokens)) {
      if (
        !Object.hasOwn(theme?.manifest.tokens ?? {}, token)
      ) {
        issues.push({
          severity: "error",
          code: "MINIMAL_CORE_CSS_TOKEN_UNRESOLVED",
          message: `${entry.kind}:${entry.id} references missing theme token ${token}.`,
          manifestPath: entry.manifestPath,
          token,
        });
      }
    }
  }

  const brand = find(scan, "asset", "mydash-brand-mark");

  if (
    brand?.manifest.approved !== true ||
    !(brand?.manifest.usage as string | undefined)?.includes("not an HSBC logo")
  ) {
    issues.push({
      severity: "error",
      code: "MINIMAL_CORE_BRAND_CONTRACT_INVALID",
      message:
        "The fallback brand asset must be approved as a project asset and explicitly state that it is not an HSBC logo.",
    });
  }

  const errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warningCount = issues.filter(
    (issue) => (issue.severity as string) === "warning",
  ).length;

  return {
    issues,
    summary: {
      valid: errorCount === 0,
      expectedResourceCount: expected.length,
      discoveredResourceCount: expected.filter(
        (item) =>
          scan.entries.filter(
            (entry) =>
              entry.kind === item.kind &&
              entry.id === item.id &&
              entry.level === "core",
          ).length === 1,
      ).length,
      errorCount,
      warningCount,
    },
  };
}

function find(
  scan: LibraryScan,
  kind: string,
  id: string,
): LibraryEntry | undefined {
  return scan.entries.find(
    (entry) =>
      entry.kind === kind &&
      entry.id === id &&
      entry.level === "core",
  );
}