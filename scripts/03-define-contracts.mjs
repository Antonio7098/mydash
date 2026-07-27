#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 03: Define contracts
 *
 * Defines the versioned JSON contracts used by the workspace, artefacts,
 * reusable UI, themes, presets, assets, user preferences and data provenance.
 *
 * This step intentionally uses a small dependency-free validator. A general
 * JSON Schema engine may be introduced later when its value is demonstrated.
 *
 * Safe defaults:
 * - rerunnable;
 * - does not overwrite unknown existing files;
 * - updates only known Bootstrap 01 placeholders;
 * - validates positive and negative fixtures before committing;
 * - commits only task-owned paths;
 * - never force-pushes.
 *
 * Usage:
 *   node scripts/03-define-contracts.mjs
 *   node scripts/03-define-contracts.mjs --dry-run
 *   node scripts/03-define-contracts.mjs --no-commit
 *   node scripts/03-define-contracts.mjs --no-push
 *   node scripts/03-define-contracts.mjs --json
 *   node scripts/03-define-contracts.mjs --target /path/to/my-dashboards
 */

import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

const SCRIPT_NAME = "03-define-contracts";
const COMMIT_MESSAGE = "Define workspace and library contracts";
const MIN_NODE_MAJOR = 20;

const args = parseArgs(process.argv.slice(2));
const targetRoot = resolve(args.target ?? process.cwd());
const selfPath = resolve(fileURLToPath(import.meta.url));

const report = {
  ok: false,
  script: SCRIPT_NAME,
  targetRoot,
  dryRun: args.dryRun,
  created: [],
  updated: [],
  preserved: [],
  warnings: [],
  validation: [],
  git: {
    commit: null,
    pushed: false,
    pushTarget: null,
  },
};

main().catch((error) => {
  report.warnings.push({
    code: "UNEXPECTED_FAILURE",
    message: error instanceof Error ? error.message : String(error),
  });
  finish(1);
});

async function main() {
  assertNodeVersion();
  await assertBootstrapFoundation();

  const repoRoot = getRepositoryRoot(targetRoot);
  if (!repoRoot || resolve(repoRoot) !== targetRoot) {
    throw new Error(
      "Bootstrap 03 must run from the root of the My Dashboards Git repository.",
    );
  }

  const dirtyBefore = getDirtyPaths(repoRoot);
  const ownedAbsolutePaths = [];
  const files = buildFiles();

  for (const [relativePath, descriptor] of Object.entries(files)) {
    const absolutePath = join(targetRoot, relativePath);
    const result = await writeManagedFile({
      absolutePath,
      content: descriptor.content,
      allowedPrevious: descriptor.allowedPrevious ?? [],
      dirtyBefore,
      repoRoot,
    });

    if (result === "created" || result === "updated") {
      ownedAbsolutePaths.push(absolutePath);
    }
  }

  const packageChanged = await updatePackageJson(dirtyBefore, repoRoot);
  if (packageChanged) {
    ownedAbsolutePaths.push(join(targetRoot, "package.json"));
  }

  await validateGeneratedState();

  // The numbered bootstrap script is intentionally part of this checkpoint
  // when it is being executed from the target repository.
  const expectedSelfPath = join(targetRoot, "scripts", "03-define-contracts.mjs");
  if (selfPath === expectedSelfPath && (await pathExists(selfPath))) {
    ownedAbsolutePaths.push(selfPath);
  }

  if (!args.noCommit && !args.dryRun) {
    await checkpoint(repoRoot, uniquePaths(ownedAbsolutePaths));
  } else if (args.noCommit) {
    report.warnings.push({
      code: "COMMIT_DISABLED",
      message:
        "Contracts were written and validated, but --no-commit disabled the Git checkpoint.",
    });
  }

  report.ok = true;
  finish(0);
}

function parseArgs(argv) {
  const parsed = {
    target: null,
    dryRun: false,
    noCommit: false,
    noPush: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    switch (value) {
      case "--target":
        index += 1;
        if (!argv[index]) failArguments("--target requires a directory path.");
        parsed.target = argv[index];
        break;
      case "--dry-run":
        parsed.dryRun = true;
        parsed.noCommit = true;
        parsed.noPush = true;
        break;
      case "--no-commit":
        parsed.noCommit = true;
        parsed.noPush = true;
        break;
      case "--no-push":
        parsed.noPush = true;
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      default:
        failArguments(`Unknown argument: ${value}`);
    }
  }

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  return parsed;
}

function failArguments(message) {
  console.error(message);
  console.error("Run with --help to see supported options.");
  process.exit(2);
}

function printHelp() {
  console.log(`
My Dashboards — Bootstrap 03

Usage:
  node scripts/03-define-contracts.mjs [options]

Options:
  --target <path>  Define contracts in a specific repository root.
  --dry-run        Report intended changes without writing, committing, or pushing.
  --no-commit      Write and validate files without committing or pushing.
  --no-push        Commit locally but do not push.
  --json           Return a machine-readable report.
  --help, -h       Show this help.
`.trim());
}

function assertNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);

  if (!Number.isInteger(major) || major < MIN_NODE_MAJOR) {
    throw new Error(
      `Node.js ${MIN_NODE_MAJOR} or later is required. Found ${process.versions.node}.`,
    );
  }
}

async function assertBootstrapFoundation() {
  if (!args.dryRun) {
    await access(targetRoot, fsConstants.W_OK);
  }

  const required = [
    "package.json",
    "scripts/bootstrap.mjs",
    "scripts/lib/filesystem.mjs",
    "scripts/lib/process.mjs",
    "scripts/lib/git.mjs",
    "scripts/lib/checkpoint.mjs",
    "config/schemas",
    "library/dashboards",
    "library/presentations",
    "library/concepts",
    "library/ui/primitives/core",
    "library/ui/components/core",
    "library/ui/layouts/core",
    "library/themes/core",
    "library/presets/core",
    "library/assets/core",
    "tests/fixtures",
    "src/validation",
  ];

  const missing = [];

  for (const relativePath of required) {
    if (!(await pathExists(join(targetRoot, relativePath)))) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Bootstrap 02 has not been completed.",
        `Missing required paths: ${missing.join(", ")}`,
      ].join("\n"),
    );
  }
}

function buildFiles() {
  const schema = (value) => `${JSON.stringify(value, null, 2)}\n`;
  const fixture = (value) => `${JSON.stringify(value, null, 2)}\n`;

  const schemas = buildSchemas();
  const fixtures = buildFixtures();

  return {
    "config/workspace.json": {
      content: fixture({
        schemaVersion: 1,
        id: "my-dashboards",
        name: "My Dashboards",
        libraryRoots: {
          dashboards: "library/dashboards",
          presentations: "library/presentations",
          concepts: "library/concepts",
          primitives: "library/ui/primitives",
          components: "library/ui/components",
          layouts: "library/ui/layouts",
          themes: "library/themes",
          presets: "library/presets",
          assets: "library/assets"
        },
        defaults: {
          theme: null,
          preset: null
        },
        preview: {
          host: "127.0.0.1",
          port: 4173
        },
        export: {
          outputDirectory: "exports"
        }
      })
    },

    "config/CONTRACTS.md": {
      content: `# My Dashboards contracts

All persistent workspace records use versioned JSON contracts.

## Identifiers

Identifiers use lower-case kebab case:

\`\`\`text
use-case-pipeline
metric-card
hsbc-light
\`\`\`

They are stable references, not display labels.

## Paths

Contract paths are workspace-relative, use forward slashes and must not contain
\`..\`, absolute roots or URL schemes.

## Lifecycle

Reusable library entries use:

\`\`\`text
local → collection → core
\`\`\`

- **local** requires an owning artefact;
- **collection** requires a collection identifier;
- **core** must not declare either.

## Appearance

Themes define tokens. Presets define mappings for layouts, components and
primitives. Artefacts may override mappings explicitly.

## Compatibility

Shared UI declares a positive integer \`contractVersion\`. A later resolver may
reject incompatible mappings rather than silently rendering incorrect UI.

## Discovery

Artefacts are discovered from their folders. No manually maintained dashboard
index is part of these contracts.

## Validation

Run:

\`\`\`bash
npm run validate
\`\`\`

The current validator is intentionally dependency-free and checks both schemas
and representative valid/invalid fixtures.
`
    },

    "src/validation/contracts.mjs": {
      content: contractsValidatorSource()
    },

    "scripts/tasks/validate-contracts.mjs": {
      content: validateContractsTaskSource()
    },

    "scripts/tasks/validate.mjs": {
      content: validateWorkspaceTaskSource(),
      allowedPrevious: [
        `#!/usr/bin/env node

console.log(
  "The workspace validation suite is installed by a later bootstrap step.",
);
console.log("Repository foundation: available");
console.log("Application validation: not installed yet");
`
      ]
    },

    "tests/fixtures/contracts/cases.json": {
      content: fixture(fixtures.cases)
    },

    ...Object.fromEntries(
      Object.entries(schemas).map(([name, value]) => [
        `config/schemas/${name}`,
        { content: schema(value) }
      ])
    ),

    ...Object.fromEntries(
      Object.entries(fixtures.files).map(([name, value]) => [
        `tests/fixtures/contracts/${name}`,
        { content: fixture(value) }
      ])
    )
  };
}

function buildSchemas() {
  const commonDefs = {
    id: {
      type: "string",
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
    },
    relativePath: {
      type: "string",
      minLength: 1,
      pattern: "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$))(?![a-zA-Z][a-zA-Z0-9+.-]*://).+$"
    },
    lifecycle: {
      type: "string",
      enum: ["local", "collection", "core"]
    },
    reference: {
      type: ["string", "null"],
      pattern: "^[a-z0-9]+(?:[/-][a-z0-9]+)*$"
    },
    stringMap: {
      type: "object",
      additionalProperties: {
        type: "string"
      }
    }
  };

  return {
    "common.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://my-dashboards.local/schemas/common.schema.json",
      title: "My Dashboards common definitions",
      $defs: commonDefs
    },

    "workspace.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://my-dashboards.local/schemas/workspace.schema.json",
      title: "Workspace configuration",
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "id",
        "name",
        "libraryRoots",
        "defaults",
        "preview",
        "export"
      ],
      properties: {
        schemaVersion: { const: 1 },
        id: { $ref: "common.schema.json#/$defs/id" },
        name: { type: "string", minLength: 1 },
        libraryRoots: {
          type: "object",
          additionalProperties: false,
          required: [
            "dashboards",
            "presentations",
            "concepts",
            "primitives",
            "components",
            "layouts",
            "themes",
            "presets",
            "assets"
          ],
          properties: Object.fromEntries(
            [
              "dashboards",
              "presentations",
              "concepts",
              "primitives",
              "components",
              "layouts",
              "themes",
              "presets",
              "assets"
            ].map((key) => [
              key,
              { $ref: "common.schema.json#/$defs/relativePath" }
            ])
          )
        },
        defaults: {
          type: "object",
          additionalProperties: false,
          required: ["theme", "preset"],
          properties: {
            theme: { $ref: "common.schema.json#/$defs/reference" },
            preset: { $ref: "common.schema.json#/$defs/reference" }
          }
        },
        preview: {
          type: "object",
          additionalProperties: false,
          required: ["host", "port"],
          properties: {
            host: { type: "string", minLength: 1 },
            port: {
              type: "integer",
              minimum: 1024,
              maximum: 65535
            }
          }
        },
        export: {
          type: "object",
          additionalProperties: false,
          required: ["outputDirectory"],
          properties: {
            outputDirectory: {
              $ref: "common.schema.json#/$defs/relativePath"
            }
          }
        }
      }
    },

    "artifact.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://my-dashboards.local/schemas/artifact.schema.json",
      title: "Dashboard, presentation or concept manifest",
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "kind",
        "id",
        "title",
        "entry",
        "appearance"
      ],
      properties: {
        schemaVersion: { const: 1 },
        kind: {
          type: "string",
          enum: ["dashboard", "presentation", "concept"]
        },
        id: { $ref: "common.schema.json#/$defs/id" },
        title: { type: "string", minLength: 1 },
        description: { type: "string" },
        owner: { type: "string", minLength: 1 },
        entry: { $ref: "common.schema.json#/$defs/relativePath" },
        data: {
          type: "array",
          uniqueItems: true,
          items: { $ref: "common.schema.json#/$defs/relativePath" }
        },
        tags: {
          type: "array",
          uniqueItems: true,
          items: { type: "string", minLength: 1 }
        },
        appearance: {
          type: "object",
          additionalProperties: false,
          required: ["theme", "preset", "overrides"],
          properties: {
            theme: { $ref: "common.schema.json#/$defs/reference" },
            preset: { $ref: "common.schema.json#/$defs/reference" },
            overrides: {
              type: "object",
              additionalProperties: false,
              properties: {
                layout: { $ref: "common.schema.json#/$defs/reference" },
                components: { $ref: "common.schema.json#/$defs/stringMap" },
                primitives: { $ref: "common.schema.json#/$defs/stringMap" },
                assets: { $ref: "common.schema.json#/$defs/stringMap" }
              }
            }
          }
        },
        export: {
          type: "object",
          additionalProperties: false,
          properties: {
            fileName: {
              type: "string",
              pattern: "^[^/\\\\]+\\.html$"
            }
          }
        }
      }
    },

    "ui-item.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://my-dashboards.local/schemas/ui-item.schema.json",
      title: "Primitive, component or layout manifest",
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "kind",
        "id",
        "name",
        "level",
        "slot",
        "contractVersion",
        "entry",
        "supportedThemes"
      ],
      properties: {
        schemaVersion: { const: 1 },
        kind: {
          type: "string",
          enum: ["primitive", "component", "layout"]
        },
        id: { $ref: "common.schema.json#/$defs/id" },
        name: { type: "string", minLength: 1 },
        description: { type: "string" },
        level: { $ref: "common.schema.json#/$defs/lifecycle" },
        collection: { $ref: "common.schema.json#/$defs/reference" },
        ownerArtifact: { $ref: "common.schema.json#/$defs/reference" },
        slot: { $ref: "common.schema.json#/$defs/id" },
        contractVersion: {
          type: "integer",
          minimum: 1
        },
        entry: { $ref: "common.schema.json#/$defs/relativePath" },
        preview: { $ref: "common.schema.json#/$defs/relativePath" },
        props: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            required: ["type", "required"],
            properties: {
              type: { type: "string", minLength: 1 },
              required: { type: "boolean" },
              description: { type: "string" }
            }
          }
        },
        variants: {
          type: "object",
          additionalProperties: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: { type: "string", minLength: 1 }
          }
        },
        dependencies: {
          type: "object",
          additionalProperties: false,
          properties: {
            primitives: { $ref: "common.schema.json#/$defs/stringMap" },
            components: { $ref: "common.schema.json#/$defs/stringMap" },
            assets: { $ref: "common.schema.json#/$defs/stringMap" }
          }
        },
        supportedThemes: {
          type: "array",
          uniqueItems: true,
          items: { $ref: "common.schema.json#/$defs/reference" }
        }
      },
      allOf: [
        {
          if: {
            properties: { level: { const: "local" } },
            required: ["level"]
          },
          then: {
            required: ["ownerArtifact"]
          }
        },
        {
          if: {
            properties: { level: { const: "collection" } },
            required: ["level"]
          },
          then: {
            required: ["collection"]
          }
        }
      ]
    },

    "theme.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://my-dashboards.local/schemas/theme.schema.json",
      title: "Theme manifest",
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "kind",
        "id",
        "name",
        "level",
        "tokens"
      ],
      properties: {
        schemaVersion: { const: 1 },
        kind: { const: "theme" },
        id: { $ref: "common.schema.json#/$defs/id" },
        name: { type: "string", minLength: 1 },
        description: { type: "string" },
        level: { $ref: "common.schema.json#/$defs/lifecycle" },
        collection: { $ref: "common.schema.json#/$defs/reference" },
        ownerArtifact: { $ref: "common.schema.json#/$defs/reference" },
        tokens: {
          type: "object",
          minProperties: 1,
          additionalProperties: {
            type: ["string", "number", "boolean"]
          }
        },
        assets: { $ref: "common.schema.json#/$defs/stringMap" }
      }
    },

    "preset.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://my-dashboards.local/schemas/preset.schema.json",
      title: "UI preset manifest",
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "kind",
        "id",
        "name",
        "level",
        "mappings",
        "supportedThemes"
      ],
      properties: {
        schemaVersion: { const: 1 },
        kind: { const: "preset" },
        id: { $ref: "common.schema.json#/$defs/id" },
        name: { type: "string", minLength: 1 },
        description: { type: "string" },
        level: { $ref: "common.schema.json#/$defs/lifecycle" },
        collection: { $ref: "common.schema.json#/$defs/reference" },
        ownerArtifact: { $ref: "common.schema.json#/$defs/reference" },
        mappings: {
          type: "object",
          additionalProperties: false,
          required: ["layout", "components", "primitives"],
          properties: {
            layout: { $ref: "common.schema.json#/$defs/reference" },
            components: { $ref: "common.schema.json#/$defs/stringMap" },
            primitives: { $ref: "common.schema.json#/$defs/stringMap" },
            assets: { $ref: "common.schema.json#/$defs/stringMap" }
          }
        },
        supportedThemes: {
          type: "array",
          uniqueItems: true,
          items: { $ref: "common.schema.json#/$defs/reference" }
        }
      }
    },

    "asset.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://my-dashboards.local/schemas/asset.schema.json",
      title: "Asset manifest",
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "kind",
        "id",
        "name",
        "level",
        "file",
        "mediaType",
        "usage"
      ],
      properties: {
        schemaVersion: { const: 1 },
        kind: { const: "asset" },
        id: { $ref: "common.schema.json#/$defs/id" },
        name: { type: "string", minLength: 1 },
        level: { $ref: "common.schema.json#/$defs/lifecycle" },
        collection: { $ref: "common.schema.json#/$defs/reference" },
        ownerArtifact: { $ref: "common.schema.json#/$defs/reference" },
        file: { $ref: "common.schema.json#/$defs/relativePath" },
        mediaType: { type: "string", minLength: 3 },
        category: {
          type: "string",
          enum: [
            "logo",
            "icon",
            "image",
            "illustration",
            "background",
            "font",
            "data",
            "other"
          ]
        },
        usage: { type: "string", minLength: 1 },
        approved: { type: "boolean" },
        attribution: { type: "string" }
      }
    },

    "user-preferences.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://my-dashboards.local/schemas/user-preferences.schema.json",
      title: "Local user preferences",
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "userId",
        "favourites",
        "recent",
        "appearance"
      ],
      properties: {
        schemaVersion: { const: 1 },
        userId: { $ref: "common.schema.json#/$defs/id" },
        favourites: {
          type: "array",
          uniqueItems: true,
          items: { $ref: "common.schema.json#/$defs/reference" }
        },
        recent: {
          type: "array",
          uniqueItems: true,
          items: { $ref: "common.schema.json#/$defs/reference" }
        },
        appearance: {
          type: "object",
          additionalProperties: false,
          required: ["theme", "preset"],
          properties: {
            theme: { $ref: "common.schema.json#/$defs/reference" },
            preset: { $ref: "common.schema.json#/$defs/reference" }
          }
        }
      }
    },

    "data-recipe.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://my-dashboards.local/schemas/data-recipe.schema.json",
      title: "Repeatable data extraction recipe",
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "id", "source", "output"],
      properties: {
        schemaVersion: { const: 1 },
        id: { $ref: "common.schema.json#/$defs/id" },
        source: {
          type: "object",
          additionalProperties: false,
          required: ["type", "file"],
          properties: {
            type: {
              type: "string",
              enum: ["excel", "csv", "json", "powerpoint"]
            },
            file: { $ref: "common.schema.json#/$defs/relativePath" },
            sheet: { type: "string", minLength: 1 },
            table: { type: "string", minLength: 1 },
            range: { type: "string", minLength: 1 }
          }
        },
        output: {
          type: "object",
          additionalProperties: false,
          required: ["file", "format"],
          properties: {
            file: { $ref: "common.schema.json#/$defs/relativePath" },
            format: {
              type: "string",
              enum: ["csv", "json", "ndjson"]
            },
            overwrite: { type: "boolean" }
          }
        }
      }
    },

    "provenance.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://my-dashboards.local/schemas/provenance.schema.json",
      title: "Generated data provenance",
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "source",
        "sourceHash",
        "generatedAt",
        "command",
        "toolVersion"
      ],
      properties: {
        schemaVersion: { const: 1 },
        source: { $ref: "common.schema.json#/$defs/relativePath" },
        sourceHash: {
          type: "string",
          pattern: "^[a-f0-9]{64}$"
        },
        generatedAt: {
          type: "string",
          format: "date-time"
        },
        command: { type: "string", minLength: 1 },
        toolVersion: { type: "string", minLength: 1 }
      }
    }
  };
}

function buildFixtures() {
  const files = {
    "valid/workspace.json": {
      schemaVersion: 1,
      id: "my-dashboards",
      name: "My Dashboards",
      libraryRoots: {
        dashboards: "library/dashboards",
        presentations: "library/presentations",
        concepts: "library/concepts",
        primitives: "library/ui/primitives",
        components: "library/ui/components",
        layouts: "library/ui/layouts",
        themes: "library/themes",
        presets: "library/presets",
        assets: "library/assets"
      },
      defaults: {
        theme: "hsbc-light",
        preset: "default"
      },
      preview: {
        host: "127.0.0.1",
        port: 4173
      },
      export: {
        outputDirectory: "exports"
      }
    },

    "valid/artifact-dashboard.json": {
      schemaVersion: 1,
      kind: "dashboard",
      id: "use-case-pipeline",
      title: "Use Case Pipeline",
      description: "An operational view of use cases and governance progress.",
      owner: "antonio",
      entry: "src/index.html",
      data: ["data/use-cases.json"],
      tags: ["governance", "operations"],
      appearance: {
        theme: "hsbc-light",
        preset: "default",
        overrides: {
          layout: null,
          components: {},
          primitives: {},
          assets: {}
        }
      },
      export: {
        fileName: "use-case-pipeline.html"
      }
    },

    "valid/artifact-presentation.json": {
      schemaVersion: 1,
      kind: "presentation",
      id: "agent-hub-proposal",
      title: "Agent Hub Proposal",
      entry: "src/index.html",
      appearance: {
        theme: "hsbc-light",
        preset: "editorial",
        overrides: {
          layout: "presentation-frame",
          components: {},
          primitives: {},
          assets: {}
        }
      }
    },

    "valid/ui-component-core.json": {
      schemaVersion: 1,
      kind: "component",
      id: "metric-card",
      name: "Metric Card",
      description: "Displays one metric with optional context and status.",
      level: "core",
      slot: "metric-summary",
      contractVersion: 1,
      entry: "component.js",
      preview: "preview.html",
      props: {
        label: {
          type: "string",
          required: true,
          description: "Human-readable metric label."
        },
        value: {
          type: "string | number",
          required: true
        },
        status: {
          type: "positive | neutral | warning | negative",
          required: false
        }
      },
      variants: {
        density: ["compact", "comfortable"],
        emphasis: ["standard", "high"]
      },
      dependencies: {
        primitives: {
          badge: "badge"
        },
        components: {},
        assets: {}
      },
      supportedThemes: ["hsbc-light", "hsbc-dark"]
    },

    "valid/ui-layout-collection.json": {
      schemaVersion: 1,
      kind: "layout",
      id: "executive-overview",
      name: "Executive Overview",
      level: "collection",
      collection: "executive-reporting",
      slot: "page-layout",
      contractVersion: 1,
      entry: "layout.js",
      supportedThemes: ["hsbc-light", "hsbc-dark"]
    },

    "valid/theme.json": {
      schemaVersion: 1,
      kind: "theme",
      id: "hsbc-light",
      name: "HSBC Light",
      level: "core",
      tokens: {
        "colour-primary": "#db0011",
        "colour-background": "#ffffff",
        "colour-text": "#1f1f1f",
        "radius-card": "1.25rem",
        "space-page": "2rem"
      },
      assets: {
        "brand-logo": "hsbc-red"
      }
    },

    "valid/preset.json": {
      schemaVersion: 1,
      kind: "preset",
      id: "default",
      name: "Default",
      level: "core",
      mappings: {
        layout: "dashboard-grid",
        components: {
          "metric-summary": "metric-card"
        },
        primitives: {
          button: "button",
          badge: "badge"
        },
        assets: {
          "brand-logo": "hsbc-red"
        }
      },
      supportedThemes: ["hsbc-light", "hsbc-dark"]
    },

    "valid/asset.json": {
      schemaVersion: 1,
      kind: "asset",
      id: "hsbc-red",
      name: "HSBC logo — red",
      level: "core",
      file: "hsbc-red.svg",
      mediaType: "image/svg+xml",
      category: "logo",
      usage: "Use on light backgrounds.",
      approved: true
    },

    "valid/user-preferences.json": {
      schemaVersion: 1,
      userId: "antonio",
      favourites: ["use-case-pipeline"],
      recent: ["agent-hub-proposal", "use-case-pipeline"],
      appearance: {
        theme: "hsbc-light",
        preset: "default"
      }
    },

    "valid/data-recipe.json": {
      schemaVersion: 1,
      id: "use-case-extract",
      source: {
        type: "excel",
        file: "sources/use-cases.xlsx",
        sheet: "Use Cases",
        table: "UseCaseTable"
      },
      output: {
        file: "library/dashboards/use-case-pipeline/data/use-cases.json",
        format: "json",
        overwrite: false
      }
    },

    "valid/provenance.json": {
      schemaVersion: 1,
      source: "sources/use-cases.xlsx",
      sourceHash:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      generatedAt: "2026-07-26T15:30:00.000Z",
      command:
        "mydash excel extract-table sources/use-cases.xlsx --table UseCaseTable",
      toolVersion: "0.1.0"
    },

    "invalid/artifact-missing-title.json": {
      schemaVersion: 1,
      kind: "dashboard",
      id: "broken-dashboard",
      entry: "src/index.html",
      appearance: {
        theme: null,
        preset: null,
        overrides: {}
      }
    },

    "invalid/ui-local-without-owner.json": {
      schemaVersion: 1,
      kind: "component",
      id: "local-risk-card",
      name: "Local Risk Card",
      level: "local",
      slot: "risk-summary",
      contractVersion: 1,
      entry: "component.js",
      supportedThemes: []
    },

    "invalid/preset-unsafe-reference.json": {
      schemaVersion: 1,
      kind: "preset",
      id: "unsafe",
      name: "Unsafe",
      level: "core",
      mappings: {
        layout: "../../outside",
        components: {},
        primitives: {}
      },
      supportedThemes: []
    },

    "invalid/provenance-bad-hash.json": {
      schemaVersion: 1,
      source: "sources/use-cases.xlsx",
      sourceHash: "not-a-sha256",
      generatedAt: "yesterday",
      command: "extract",
      toolVersion: "0.1.0"
    }
  };

  const cases = [
    ["valid/workspace.json", "workspace", true],
    ["valid/artifact-dashboard.json", "artifact", true],
    ["valid/artifact-presentation.json", "artifact", true],
    ["valid/ui-component-core.json", "uiItem", true],
    ["valid/ui-layout-collection.json", "uiItem", true],
    ["valid/theme.json", "theme", true],
    ["valid/preset.json", "preset", true],
    ["valid/asset.json", "asset", true],
    ["valid/user-preferences.json", "userPreferences", true],
    ["valid/data-recipe.json", "dataRecipe", true],
    ["valid/provenance.json", "provenance", true],
    ["invalid/artifact-missing-title.json", "artifact", false],
    ["invalid/ui-local-without-owner.json", "uiItem", false],
    ["invalid/preset-unsafe-reference.json", "preset", false],
    ["invalid/provenance-bad-hash.json", "provenance", false]
  ].map(([file, contract, valid]) => ({ file, contract, valid }));

  return { files, cases };
}

function contractsValidatorSource() {
  return `import { readFile } from "node:fs/promises";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCE_PATTERN = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const LIFECYCLE = new Set(["local", "collection", "core"]);
const ARTIFACT_KINDS = new Set(["dashboard", "presentation", "concept"]);
const UI_KINDS = new Set(["primitive", "component", "layout"]);
const DATA_SOURCE_TYPES = new Set(["excel", "csv", "json", "powerpoint"]);
const DATA_OUTPUT_TYPES = new Set(["csv", "json", "ndjson"]);

export async function readJson(path) {
  const source = await readFile(path, "utf8");

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(
      \`Invalid JSON in \${path}: \${error instanceof Error ? error.message : String(error)}\`,
    );
  }
}

export function validateDocument(contract, value) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });

  if (!isPlainObject(value)) {
    add("$", "must be a JSON object");
    return result(errors);
  }

  switch (contract) {
    case "workspace":
      validateWorkspace(value, add);
      break;
    case "artifact":
      validateArtifact(value, add);
      break;
    case "uiItem":
      validateUiItem(value, add);
      break;
    case "theme":
      validateTheme(value, add);
      break;
    case "preset":
      validatePreset(value, add);
      break;
    case "asset":
      validateAsset(value, add);
      break;
    case "userPreferences":
      validateUserPreferences(value, add);
      break;
    case "dataRecipe":
      validateDataRecipe(value, add);
      break;
    case "provenance":
      validateProvenance(value, add);
      break;
    default:
      add("$", \`unknown contract: \${contract}\`);
  }

  return result(errors);
}

function result(errors) {
  return {
    ok: errors.length === 0,
    errors
  };
}

function validateBase(value, add) {
  if (value.schemaVersion !== 1) {
    add("$.schemaVersion", "must equal 1");
  }
}

function validateWorkspace(value, add) {
  validateBase(value, add);
  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);

  const requiredRoots = [
    "dashboards",
    "presentations",
    "concepts",
    "primitives",
    "components",
    "layouts",
    "themes",
    "presets",
    "assets"
  ];

  if (!isPlainObject(value.libraryRoots)) {
    add("$.libraryRoots", "must be an object");
  } else {
    for (const key of requiredRoots) {
      requireRelativePath(value.libraryRoots[key], \`$.libraryRoots.\${key}\`, add);
    }
  }

  if (!isPlainObject(value.defaults)) {
    add("$.defaults", "must be an object");
  } else {
    optionalReference(value.defaults.theme, "$.defaults.theme", add);
    optionalReference(value.defaults.preset, "$.defaults.preset", add);
  }

  if (!isPlainObject(value.preview)) {
    add("$.preview", "must be an object");
  } else {
    requireString(value.preview.host, "$.preview.host", add);
    if (
      !Number.isInteger(value.preview.port) ||
      value.preview.port < 1024 ||
      value.preview.port > 65535
    ) {
      add("$.preview.port", "must be an integer between 1024 and 65535");
    }
  }

  if (!isPlainObject(value.export)) {
    add("$.export", "must be an object");
  } else {
    requireRelativePath(
      value.export.outputDirectory,
      "$.export.outputDirectory",
      add,
    );
  }
}

function validateArtifact(value, add) {
  validateBase(value, add);

  if (!ARTIFACT_KINDS.has(value.kind)) {
    add("$.kind", "must be dashboard, presentation or concept");
  }

  requireId(value.id, "$.id", add);
  requireString(value.title, "$.title", add);
  requireRelativePath(value.entry, "$.entry", add);

  if (value.data !== undefined) {
    validateUniqueStringArray(value.data, "$.data", add, requireRelativePath);
  }

  if (value.tags !== undefined) {
    validateUniqueStringArray(value.tags, "$.tags", add, requireString);
  }

  if (!isPlainObject(value.appearance)) {
    add("$.appearance", "must be an object");
  } else {
    optionalReference(value.appearance.theme, "$.appearance.theme", add);
    optionalReference(value.appearance.preset, "$.appearance.preset", add);

    if (!isPlainObject(value.appearance.overrides)) {
      add("$.appearance.overrides", "must be an object");
    } else {
      optionalReference(
        value.appearance.overrides.layout,
        "$.appearance.overrides.layout",
        add,
      );
      validateOptionalStringMap(
        value.appearance.overrides.components,
        "$.appearance.overrides.components",
        add,
      );
      validateOptionalStringMap(
        value.appearance.overrides.primitives,
        "$.appearance.overrides.primitives",
        add,
      );
      validateOptionalStringMap(
        value.appearance.overrides.assets,
        "$.appearance.overrides.assets",
        add,
      );
    }
  }

  if (value.export !== undefined) {
    if (!isPlainObject(value.export)) {
      add("$.export", "must be an object");
    } else if (
      value.export.fileName !== undefined &&
      (!isNonEmptyString(value.export.fileName) ||
        /[/\\\\]/.test(value.export.fileName) ||
        !value.export.fileName.endsWith(".html"))
    ) {
      add("$.export.fileName", "must be a file name ending in .html");
    }
  }
}

function validateUiItem(value, add) {
  validateBase(value, add);

  if (!UI_KINDS.has(value.kind)) {
    add("$.kind", "must be primitive, component or layout");
  }

  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);
  validateLifecycle(value, add);
  requireId(value.slot, "$.slot", add);

  if (!Number.isInteger(value.contractVersion) || value.contractVersion < 1) {
    add("$.contractVersion", "must be a positive integer");
  }

  requireRelativePath(value.entry, "$.entry", add);

  if (value.preview !== undefined) {
    requireRelativePath(value.preview, "$.preview", add);
  }

  if (value.props !== undefined) {
    if (!isPlainObject(value.props)) {
      add("$.props", "must be an object");
    } else {
      for (const [name, definition] of Object.entries(value.props)) {
        if (!ID_PATTERN.test(name)) {
          add(\`$.props.\${name}\`, "property names must use kebab case");
        }

        if (!isPlainObject(definition)) {
          add(\`$.props.\${name}\`, "must be an object");
          continue;
        }

        requireString(definition.type, \`$.props.\${name}.type\`, add);

        if (typeof definition.required !== "boolean") {
          add(\`$.props.\${name}.required\`, "must be boolean");
        }
      }
    }
  }

  if (value.variants !== undefined) {
    if (!isPlainObject(value.variants)) {
      add("$.variants", "must be an object");
    } else {
      for (const [name, options] of Object.entries(value.variants)) {
        requireId(name, \`$.variants.\${name}\`, add);
        validateUniqueStringArray(
          options,
          \`$.variants.\${name}\`,
          add,
          requireString,
        );
      }
    }
  }

  if (value.dependencies !== undefined) {
    if (!isPlainObject(value.dependencies)) {
      add("$.dependencies", "must be an object");
    } else {
      validateOptionalStringMap(
        value.dependencies.primitives,
        "$.dependencies.primitives",
        add,
      );
      validateOptionalStringMap(
        value.dependencies.components,
        "$.dependencies.components",
        add,
      );
      validateOptionalStringMap(
        value.dependencies.assets,
        "$.dependencies.assets",
        add,
      );
    }
  }

  validateReferenceArray(
    value.supportedThemes,
    "$.supportedThemes",
    add,
    true,
  );
}

function validateTheme(value, add) {
  validateBase(value, add);

  if (value.kind !== "theme") {
    add("$.kind", "must equal theme");
  }

  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);
  validateLifecycle(value, add);

  if (!isPlainObject(value.tokens) || Object.keys(value.tokens).length === 0) {
    add("$.tokens", "must be a non-empty object");
  } else {
    for (const [key, token] of Object.entries(value.tokens)) {
      if (!isNonEmptyString(key)) {
        add("$.tokens", "token names must be non-empty");
      }

      if (!["string", "number", "boolean"].includes(typeof token)) {
        add(\`$.tokens.\${key}\`, "must be string, number or boolean");
      }
    }
  }

  validateOptionalStringMap(value.assets, "$.assets", add);
}

function validatePreset(value, add) {
  validateBase(value, add);

  if (value.kind !== "preset") {
    add("$.kind", "must equal preset");
  }

  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);
  validateLifecycle(value, add);

  if (!isPlainObject(value.mappings)) {
    add("$.mappings", "must be an object");
  } else {
    optionalReference(value.mappings.layout, "$.mappings.layout", add);
    validateStringMap(
      value.mappings.components,
      "$.mappings.components",
      add,
      true,
    );
    validateStringMap(
      value.mappings.primitives,
      "$.mappings.primitives",
      add,
      true,
    );
    validateOptionalStringMap(
      value.mappings.assets,
      "$.mappings.assets",
      add,
    );
  }

  validateReferenceArray(
    value.supportedThemes,
    "$.supportedThemes",
    add,
    true,
  );
}

function validateAsset(value, add) {
  validateBase(value, add);

  if (value.kind !== "asset") {
    add("$.kind", "must equal asset");
  }

  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);
  validateLifecycle(value, add);
  requireRelativePath(value.file, "$.file", add);
  requireString(value.mediaType, "$.mediaType", add);
  requireString(value.usage, "$.usage", add);

  if (value.approved !== undefined && typeof value.approved !== "boolean") {
    add("$.approved", "must be boolean");
  }
}

function validateUserPreferences(value, add) {
  validateBase(value, add);
  requireId(value.userId, "$.userId", add);
  validateReferenceArray(value.favourites, "$.favourites", add, true);
  validateReferenceArray(value.recent, "$.recent", add, true);

  if (!isPlainObject(value.appearance)) {
    add("$.appearance", "must be an object");
  } else {
    optionalReference(value.appearance.theme, "$.appearance.theme", add);
    optionalReference(value.appearance.preset, "$.appearance.preset", add);
  }
}

function validateDataRecipe(value, add) {
  validateBase(value, add);
  requireId(value.id, "$.id", add);

  if (!isPlainObject(value.source)) {
    add("$.source", "must be an object");
  } else {
    if (!DATA_SOURCE_TYPES.has(value.source.type)) {
      add("$.source.type", "must be excel, csv, json or powerpoint");
    }

    requireRelativePath(value.source.file, "$.source.file", add);

    for (const key of ["sheet", "table", "range"]) {
      if (value.source[key] !== undefined) {
        requireString(value.source[key], \`$.source.\${key}\`, add);
      }
    }
  }

  if (!isPlainObject(value.output)) {
    add("$.output", "must be an object");
  } else {
    requireRelativePath(value.output.file, "$.output.file", add);

    if (!DATA_OUTPUT_TYPES.has(value.output.format)) {
      add("$.output.format", "must be csv, json or ndjson");
    }

    if (
      value.output.overwrite !== undefined &&
      typeof value.output.overwrite !== "boolean"
    ) {
      add("$.output.overwrite", "must be boolean");
    }
  }
}

function validateProvenance(value, add) {
  validateBase(value, add);
  requireRelativePath(value.source, "$.source", add);

  if (!isNonEmptyString(value.sourceHash) || !SHA256_PATTERN.test(value.sourceHash)) {
    add("$.sourceHash", "must be a lower-case SHA-256 hash");
  }

  if (
    !isNonEmptyString(value.generatedAt) ||
    Number.isNaN(Date.parse(value.generatedAt))
  ) {
    add("$.generatedAt", "must be an ISO date-time");
  }

  requireString(value.command, "$.command", add);
  requireString(value.toolVersion, "$.toolVersion", add);
}

function validateLifecycle(value, add) {
  if (!LIFECYCLE.has(value.level)) {
    add("$.level", "must be local, collection or core");
    return;
  }

  if (value.level === "local") {
    requireReference(value.ownerArtifact, "$.ownerArtifact", add);

    if (value.collection !== undefined && value.collection !== null) {
      add("$.collection", "must not be set for a local item");
    }
  }

  if (value.level === "collection") {
    requireReference(value.collection, "$.collection", add);

    if (value.ownerArtifact !== undefined && value.ownerArtifact !== null) {
      add("$.ownerArtifact", "must not be set for a collection item");
    }
  }

  if (value.level === "core") {
    if (value.collection !== undefined && value.collection !== null) {
      add("$.collection", "must not be set for a Core item");
    }

    if (value.ownerArtifact !== undefined && value.ownerArtifact !== null) {
      add("$.ownerArtifact", "must not be set for a Core item");
    }
  }
}

function validateReferenceArray(value, path, add, required) {
  if (value === undefined && !required) return;

  if (!Array.isArray(value)) {
    add(path, "must be an array");
    return;
  }

  const seen = new Set();

  for (let index = 0; index < value.length; index += 1) {
    const itemPath = \`\${path}[\${index}]\`;
    requireReference(value[index], itemPath, add);

    if (seen.has(value[index])) {
      add(itemPath, "must not duplicate another entry");
    }

    seen.add(value[index]);
  }
}

function validateUniqueStringArray(value, path, add, validator) {
  if (!Array.isArray(value)) {
    add(path, "must be an array");
    return;
  }

  const seen = new Set();

  for (let index = 0; index < value.length; index += 1) {
    const itemPath = \`\${path}[\${index}]\`;
    validator(value[index], itemPath, add);

    if (seen.has(value[index])) {
      add(itemPath, "must not duplicate another entry");
    }

    seen.add(value[index]);
  }
}

function validateOptionalStringMap(value, path, add) {
  if (value === undefined) return;
  validateStringMap(value, path, add, false);
}

function validateStringMap(value, path, add, required) {
  if (value === undefined && !required) return;

  if (!isPlainObject(value)) {
    add(path, "must be an object");
    return;
  }

  for (const [key, reference] of Object.entries(value)) {
    requireId(key, \`\${path}.\${key}\`, add);
    requireReference(reference, \`\${path}.\${key}\`, add);
  }
}

function optionalReference(value, path, add) {
  if (value === undefined || value === null) return;
  requireReference(value, path, add);
}

function requireReference(value, path, add) {
  if (!isNonEmptyString(value) || !REFERENCE_PATTERN.test(value)) {
    add(path, "must be a safe lower-case reference");
  }
}

function requireId(value, path, add) {
  if (!isNonEmptyString(value) || !ID_PATTERN.test(value)) {
    add(path, "must use lower-case kebab case");
  }
}

function requireRelativePath(value, path, add) {
  if (!isNonEmptyString(value)) {
    add(path, "must be a non-empty relative path");
    return;
  }

  const normalised = value.replaceAll("\\\\", "/");

  if (
    normalised.startsWith("/") ||
    /^[A-Za-z]:/.test(normalised) ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\//.test(normalised) ||
    normalised.split("/").includes("..")
  ) {
    add(path, "must be a safe workspace-relative path");
  }
}

function requireString(value, path, add) {
  if (!isNonEmptyString(value)) {
    add(path, "must be a non-empty string");
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}
`;
}

function validateContractsTaskSource() {
  return `#!/usr/bin/env node

import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { readJson, validateDocument } from "../../src/validation/contracts.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");
const fixturesRoot = join(projectRoot, "tests", "fixtures", "contracts");
const schemasRoot = join(projectRoot, "config", "schemas");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const schemaFiles = (await readdir(schemasRoot))
    .filter((name) => name.endsWith(".schema.json"))
    .sort();

  if (schemaFiles.length === 0) {
    throw new Error("No contract schemas were found.");
  }

  for (const file of schemaFiles) {
    const value = await readJson(join(schemasRoot, file));

    if (
      value.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
      typeof value.$id !== "string" ||
      !value.$id
    ) {
      throw new Error(\`Schema metadata is incomplete: \${file}\`);
    }
  }

  const cases = await readJson(join(fixturesRoot, "cases.json"));
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("Contract fixture cases are missing or empty.");
  }

  let passed = 0;

  for (const testCase of cases) {
    const filePath = join(fixturesRoot, testCase.file);
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      throw new Error(\`Fixture is not a file: \${testCase.file}\`);
    }

    const document = await readJson(filePath);
    const result = validateDocument(testCase.contract, document);

    if (result.ok !== testCase.valid) {
      const details = result.errors
        .map((error) => \`\${error.path}: \${error.message}\`)
        .join("\\n");

      throw new Error(
        [
          \`Fixture result did not match expectation: \${testCase.file}\`,
          \`Expected valid: \${testCase.valid}\`,
          \`Actual valid: \${result.ok}\`,
          details
        ].filter(Boolean).join("\\n"),
      );
    }

    passed += 1;
  }

  console.log(
    \`Contract validation passed: \${schemaFiles.length} schemas and \${passed} fixtures.\`,
  );
}
`;
}

function validateWorkspaceTaskSource() {
  return `#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");

const tasks = [
  {
    name: "contracts",
    file: resolve(scriptDirectory, "validate-contracts.mjs")
  }
];

let failed = false;

for (const task of tasks) {
  console.log(\`\\n=== Validating \${task.name} ===\\n\`);

  const result = spawnSync(process.execPath, [task.file], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    console.error(result.error);
    failed = true;
    break;
  }

  if (result.status !== 0) {
    failed = true;
    break;
  }
}

if (failed) {
  process.exit(1);
}

console.log("\\nWorkspace validation passed.");
`;
}

async function updatePackageJson(dirtyBefore, repoRoot) {
  const packagePath = join(targetRoot, "package.json");
  const gitPath = relativeGitPath(repoRoot, packagePath);

  if (dirtyBefore.has(gitPath)) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code: "PREEXISTING_PACKAGE_CHANGES",
      message:
        "package.json had pre-existing changes, so contract commands were not added automatically.",
    });
    return false;
  }

  const source = await readFile(packagePath, "utf8");
  let value;

  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("package.json is not valid JSON and was not modified.");
  }

  value.scripts ??= {};
  value.scripts["validate:contracts"] =
    value.scripts["validate:contracts"] ??
    "node scripts/tasks/validate-contracts.mjs";

  const placeholderValidate = "node scripts/tasks/validate.mjs";
  if (!value.scripts.validate || value.scripts.validate === placeholderValidate) {
    value.scripts.validate = "node scripts/tasks/validate.mjs";
  }

  const next = `${JSON.stringify(value, null, 2)}\n`;

  if (source === next) {
    report.preserved.push(gitPath);
    return false;
  }

  if (args.dryRun) {
    report.updated.push(gitPath);
    return true;
  }

  await atomicWrite(packagePath, next);
  report.updated.push(gitPath);
  return true;
}

async function writeManagedFile({
  absolutePath,
  content,
  allowedPrevious,
  dirtyBefore,
  repoRoot,
}) {
  const gitPath = relativeGitPath(repoRoot, absolutePath);
  const exists = await pathExists(absolutePath);

  if (dirtyBefore.has(gitPath) && absolutePath !== selfPath) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code: "PREEXISTING_FILE_CHANGES",
      message: `Preserved pre-existing changes in ${gitPath}.`,
    });
    return "preserved";
  }

  if (exists) {
    const current = await readFile(absolutePath, "utf8");

    if (current === content) {
      report.preserved.push(gitPath);
      return "preserved";
    }

    if (!allowedPrevious.includes(current)) {
      report.preserved.push(gitPath);
      report.warnings.push({
        code: "EXISTING_FILE_PRESERVED",
        message:
          `${gitPath} already exists with different content and was not overwritten.`,
      });
      return "preserved";
    }

    if (args.dryRun) {
      report.updated.push(gitPath);
      return "updated";
    }

    await atomicWrite(absolutePath, content);
    report.updated.push(gitPath);
    return "updated";
  }

  if (args.dryRun) {
    report.created.push(gitPath);
    return "created";
  }

  await atomicWrite(absolutePath, content);
  report.created.push(gitPath);
  return "created";
}

async function validateGeneratedState() {
  if (args.dryRun) {
    report.validation.push({
      check: "dry-run",
      ok: true,
      message: "The complete contract set was calculated without writing it.",
    });
    return;
  }

  const schemaDirectory = join(targetRoot, "config", "schemas");
  const schemaNames = [
    "common.schema.json",
    "workspace.schema.json",
    "artifact.schema.json",
    "ui-item.schema.json",
    "theme.schema.json",
    "preset.schema.json",
    "asset.schema.json",
    "user-preferences.schema.json",
    "data-recipe.schema.json",
    "provenance.schema.json",
  ];

  for (const name of schemaNames) {
    const path = join(schemaDirectory, name);
    const value = JSON.parse(await readFile(path, "utf8"));

    if (
      value.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
      typeof value.$id !== "string"
    ) {
      throw new Error(`Schema metadata validation failed: ${name}`);
    }
  }

  report.validation.push({
    check: "schema-metadata",
    ok: true,
    message: `${schemaNames.length} JSON schemas contain version and identity metadata.`,
  });

  const modulePaths = [
    "src/validation/contracts.mjs",
    "scripts/tasks/validate-contracts.mjs",
    "scripts/tasks/validate.mjs",
  ];

  for (const relativePath of modulePaths) {
    const result = run(
      process.execPath,
      ["--check", join(targetRoot, relativePath)],
      { cwd: targetRoot, allowFailure: true },
    );

    if (result.status !== 0) {
      throw new Error(
        `Generated module failed syntax validation: ${relativePath}\n${result.stderr}`,
      );
    }
  }

  report.validation.push({
    check: "module-syntax",
    ok: true,
    message: `${modulePaths.length} validation modules passed Node syntax checks.`,
  });

  const fixtureValidation = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "validate-contracts.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (fixtureValidation.status !== 0) {
    throw new Error(
      `Contract fixture validation failed:\n${
        fixtureValidation.stderr || fixtureValidation.stdout
      }`,
    );
  }

  report.validation.push({
    check: "contract-fixtures",
    ok: true,
    message: fixtureValidation.stdout,
  });

  const workspaceValidation = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "validate.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (workspaceValidation.status !== 0) {
    throw new Error(
      `Workspace validation command failed:\n${
        workspaceValidation.stderr || workspaceValidation.stdout
      }`,
    );
  }

  report.validation.push({
    check: "workspace-command",
    ok: true,
    message: "npm run validate now has a working contract-validation foundation.",
  });
}

async function checkpoint(repoRoot, ownedAbsolutePaths) {
  const ownedPaths = uniquePaths(
    ownedAbsolutePaths
      .filter((path) => isInside(repoRoot, path))
      .map((path) => relativeGitPath(repoRoot, path)),
  );

  if (ownedPaths.length === 0) {
    report.warnings.push({
      code: "NO_CHECKPOINT_CHANGES",
      message: "The contract layer was already present; there were no task-owned changes to commit.",
    });
    return;
  }

  const userName = run("git", ["config", "user.name"], {
    cwd: repoRoot,
    allowFailure: true,
  }).stdout;

  const userEmail = run("git", ["config", "user.email"], {
    cwd: repoRoot,
    allowFailure: true,
  }).stdout;

  if (!userName || !userEmail) {
    report.warnings.push({
      code: "GIT_IDENTITY_MISSING",
      message:
        "Contracts were created and validated, but no commit was made because Git user.name or user.email is missing.",
    });
    return;
  }

  run("git", ["add", "--", ...ownedPaths], { cwd: repoRoot });

  const stagedOwned = run(
    "git",
    ["diff", "--cached", "--name-only", "--", ...ownedPaths],
    { cwd: repoRoot },
  ).stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  if (stagedOwned.length === 0) {
    report.warnings.push({
      code: "NO_COMMIT_NEEDED",
      message: "No task-owned changes remained to commit.",
    });
    return;
  }

  const commitResult = run(
    "git",
    ["commit", "--only", "-m", COMMIT_MESSAGE, "--", ...ownedPaths],
    { cwd: repoRoot, allowFailure: true },
  );

  if (commitResult.status !== 0) {
    throw new Error(
      `Focused Git commit failed:\n${commitResult.stderr || commitResult.stdout}`,
    );
  }

  const commitHash = run("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
  }).stdout;

  report.git.commit = commitHash;

  if (args.noPush) {
    report.warnings.push({
      code: "PUSH_DISABLED",
      message: `Committed locally as ${commitHash}; --no-push prevented remote push.`,
    });
    return;
  }

  const branch = run("git", ["branch", "--show-current"], {
    cwd: repoRoot,
  }).stdout;

  const upstream = run(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    { cwd: repoRoot, allowFailure: true },
  );

  let pushResult;

  if (upstream.status === 0) {
    report.git.pushTarget = upstream.stdout;
    pushResult = run("git", ["push"], {
      cwd: repoRoot,
      allowFailure: true,
    });
  } else {
    const remotes = run("git", ["remote"], {
      cwd: repoRoot,
      allowFailure: true,
    }).stdout
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!branch || !remotes.includes("origin")) {
      report.warnings.push({
        code: "NO_PUSH_TARGET",
        message:
          `Committed locally as ${commitHash}, but no upstream was configured and origin was unavailable.`,
      });
      return;
    }

    report.git.pushTarget = `origin/${branch}`;
    pushResult = run("git", ["push", "-u", "origin", branch], {
      cwd: repoRoot,
      allowFailure: true,
    });
  }

  if (pushResult.status === 0) {
    report.git.pushed = true;
  } else {
    report.warnings.push({
      code: "PUSH_FAILED",
      message:
        `Committed locally as ${commitHash}, but the push failed safely. ` +
        "No force-push was attempted. " +
        (pushResult.stderr || pushResult.stdout),
    });
  }
}

function getRepositoryRoot(cwd) {
  const result = run("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    allowFailure: true,
  });

  return result.status === 0 ? resolve(result.stdout) : null;
}

function getDirtyPaths(repoRoot) {
  const result = run(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: repoRoot },
  );

  const entries = result.stdout ? result.stdout.split("\0").filter(Boolean) : [];
  const paths = new Set();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.length < 4) continue;

    const statusCode = entry.slice(0, 2);
    paths.add(normaliseGitPath(entry.slice(3)));

    if (statusCode.includes("R") || statusCode.includes("C")) {
      const secondPath = entries[index + 1];
      if (secondPath) {
        paths.add(normaliseGitPath(secondPath));
        index += 1;
      }
    }
  }

  return paths;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? targetRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });

  if (result.error) throw result.error;

  if (result.status !== 0 && !options.allowFailure) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n");

    throw new Error(
      `${command} ${commandArgs.join(" ")} failed with exit code ${result.status}` +
        (details ? `:\n${details}` : "."),
    );
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function isInside(root, path) {
  const relativePath = relative(root, path);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !resolve(path).startsWith(`${resolve(root)}..`))
  );
}

function relativeGitPath(repoRoot, path) {
  return normaliseGitPath(relative(repoRoot, path));
}

function normaliseGitPath(path) {
  return path.replaceAll("\\", "/");
}

function uniquePaths(paths) {
  return [...new Set(paths)];
}

function finish(exitCode) {
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(exitCode);
  }

  console.log("\nMy Dashboards — contract foundation\n");
  console.log(`Target: ${report.targetRoot}`);
  console.log(`Result: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Mode: ${report.dryRun ? "dry-run" : "write"}`);

  printSection("Created", report.created);
  printSection("Updated", report.updated);
  printSection("Preserved", report.preserved);

  if (report.validation.length > 0) {
    console.log("\nValidation:");
    for (const item of report.validation) {
      console.log(`  ${item.ok ? "✓" : "✗"} ${item.message}`);
    }
  }

  console.log("\nGit:");
  console.log(`  Commit: ${report.git.commit ?? "none"}`);
  console.log(`  Pushed: ${report.git.pushed ? "yes" : "no"}`);
  if (report.git.pushTarget) {
    console.log(`  Push target: ${report.git.pushTarget}`);
  }

  if (report.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of report.warnings) {
      console.log(`  ! ${warning.message}`);
    }
  }

  console.log("");
  process.exit(exitCode);
}

function printSection(title, items) {
  console.log(`\n${title}:`);

  if (items.length === 0) {
    console.log("  none");
    return;
  }

  for (const item of items) {
    console.log(`  ${item}`);
  }
}
