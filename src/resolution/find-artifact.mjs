import { CliError, EXIT_USAGE } from "../../cli/errors.mjs";

export function findArtifact(scan, id, kind = null) {
  const matches = scan.entries.filter(
    (entry) =>
      entry.category === "artifact" &&
      entry.id === id &&
      (!kind || entry.kind === kind),
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

  return matches[0];
}
