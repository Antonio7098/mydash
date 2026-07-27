import { loadPackageMetadata } from "../../src/workspace/package-metadata.mjs";

export const versionCommand = {
  name: "version",
  summary: "Show the installed My Dashboards CLI version.",
  usage: "mydash version",
  options: ["--json       Return structured JSON."],

  async run(_invocation, context) {
    const metadata = await loadPackageMetadata(context.cwd);

    return {
      ok: true,
      command: "version",
      data: {
        name: metadata.name,
        version: metadata.version,
        node: process.versions.node,
      },
      text: `${metadata.name} ${metadata.version}`,
    };
  },
};
