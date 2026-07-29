import { CliError, EXIT_USAGE } from "../../cli/errors.js";
import type { LibraryScan } from "../library/types.js";

export function findArtifact<T extends { category?: string; id: string; kind: string; user?: string | null }>(
  scan: LibraryScan,
  id: string,
  kind: string | null = null,
  user: string | null = null,
): T {
  const matches = scan.entries.filter(
    (entry) =>
      entry.category === "artifact" &&
      entry.id === id &&
      (!kind || entry.kind === kind) &&
      (!user || entry.user === user),
  );

  if (matches.length === 0) {
    throw new CliError(
      "ARTIFACT_NOT_FOUND",
      `No artefact found for ${kind ? `${kind}:` : ""}${id}.`,
      { exitCode: EXIT_USAGE },
    );
  }

  if (matches.length > 1) {
    throw new CliError(
      "AMBIGUOUS_ARTIFACT",
      `Multiple artefacts use the identifier ${id}.`,
      {
        exitCode: EXIT_USAGE,
        details: {
          matches: matches.map((entry) => ({
            kind: entry.kind,
            displayPath: entry.displayPath,
          })),
        },
        hint: "Use --kind to disambiguate the artefact.",
      },
    );
  }

  return matches[0] as unknown as T;
}