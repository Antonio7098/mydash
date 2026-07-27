#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 16: Seed the minimal Core library
 *
 * Seeds exactly eight reusable resources:
 *
 *   theme:       hsbc-light
 *   preset:      default
 *   layout:      dashboard-shell
 *   components:  metric-card, section-heading
 *   primitives:  button, status-badge
 *   asset:       mydash-brand-mark
 *
 * The brand asset is a project fallback and does not reproduce an HSBC logo.
 *
 * Usage:
 *   node scripts/16-seed-minimal-core.mjs
 *   node scripts/16-seed-minimal-core.mjs --dry-run
 *   node scripts/16-seed-minimal-core.mjs --no-commit
 *   node scripts/16-seed-minimal-core.mjs --no-push
 *   node scripts/16-seed-minimal-core.mjs --json
 *   node scripts/16-seed-minimal-core.mjs --target /path/to/my-dashboards
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
import {
  constants as fsConstants,
} from "node:fs";
import {
  dirname,
  join,
  relative,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import {
  spawnSync,
} from "node:child_process";
import process from "node:process";

const SCRIPT_NAME =
  "16-seed-minimal-core";
const COMMIT_MESSAGE =
  "Seed the minimal Core library";
const MIN_NODE_MAJOR = 20;
const FILES = {"src/library/core.mjs": {"content": "import {\n  access,\n  readFile,\n} from \"node:fs/promises\";\nimport {\n  join,\n} from \"node:path\";\n\nexport const MINIMAL_CORE = Object.freeze({\n  theme: [\"hsbc-light\"],\n  preset: [\"default\"],\n  layout: [\"dashboard-shell\"],\n  component: [\n    \"metric-card\",\n    \"section-heading\",\n  ],\n  primitive: [\n    \"button\",\n    \"status-badge\",\n  ],\n  asset: [\"mydash-brand-mark\"],\n});\n\nexport async function validateMinimalCore(scan) {\n  const issues = [];\n  const expected = Object.entries(\n    MINIMAL_CORE,\n  ).flatMap(([kind, ids]) =>\n    ids.map((id) => ({ kind, id })),\n  );\n\n  for (const item of expected) {\n    const matches = scan.entries.filter(\n      (entry) =>\n        entry.kind === item.kind &&\n        entry.id === item.id &&\n        entry.level === \"core\",\n    );\n\n    if (matches.length !== 1) {\n      issues.push({\n        severity: \"error\",\n        code:\n          matches.length === 0\n            ? \"MINIMAL_CORE_RESOURCE_MISSING\"\n            : \"MINIMAL_CORE_RESOURCE_DUPLICATE\",\n        message:\n          `Expected exactly one Core ${item.kind}:${item.id}; found ${matches.length}.`,\n        kind: item.kind,\n        id: item.id,\n      });\n      continue;\n    }\n\n    const entry = matches[0];\n\n    if (!entry.contractValid) {\n      issues.push({\n        severity: \"error\",\n        code: \"MINIMAL_CORE_CONTRACT_INVALID\",\n        message:\n          `Core ${item.kind}:${item.id} does not satisfy its manifest contract.`,\n        manifestPath: entry.manifestPath,\n      });\n    }\n\n    const sourcePath =\n      item.kind === \"asset\"\n        ? join(\n            entry.directory,\n            entry.manifest.file,\n          )\n        : item.kind === \"theme\" ||\n            item.kind === \"preset\"\n          ? null\n          : join(\n              entry.directory,\n              entry.manifest.entry,\n            );\n\n    if (sourcePath) {\n      try {\n        await access(sourcePath);\n      } catch {\n        issues.push({\n          severity: \"error\",\n          code: \"MINIMAL_CORE_ENTRY_MISSING\",\n          message:\n            `Core ${item.kind}:${item.id} references a missing file.`,\n          manifestPath: entry.manifestPath,\n          sourcePath,\n        });\n      }\n    }\n  }\n\n  const theme = find(\n    scan,\n    \"theme\",\n    \"hsbc-light\",\n  );\n  const requiredTokens = [\n    \"colour-primary\",\n    \"colour-background\",\n    \"colour-surface\",\n    \"colour-text\",\n    \"colour-text-muted\",\n    \"colour-border\",\n    \"font-family\",\n    \"space-4\",\n    \"radius-lg\",\n  ];\n\n  for (const token of requiredTokens) {\n    if (\n      !Object.hasOwn(\n        theme?.manifest.tokens ?? {},\n        token,\n      )\n    ) {\n      issues.push({\n        severity: \"error\",\n        code: \"MINIMAL_CORE_THEME_TOKEN_MISSING\",\n        message:\n          `Core theme hsbc-light is missing token ${token}.`,\n        token,\n      });\n    }\n  }\n\n  const cssEntries = scan.entries.filter(\n    (entry) =>\n      [\"primitive\", \"component\", \"layout\"].includes(\n        entry.kind,\n      ) &&\n      Object.values(MINIMAL_CORE)\n        .flat()\n        .includes(entry.id) &&\n      entry.manifest.entry?.endsWith(\".css\"),\n  );\n\n  for (const entry of cssEntries) {\n    const source = await readFile(\n      join(\n        entry.directory,\n        entry.manifest.entry,\n      ),\n      \"utf8\",\n    );\n    const referencedTokens = [\n      ...source.matchAll(\n        /var\\(--([a-z0-9-]+)\\)/g,\n      ),\n    ].map((match) => match[1]);\n\n    for (const token of new Set(\n      referencedTokens,\n    )) {\n      if (\n        !Object.hasOwn(\n          theme?.manifest.tokens ?? {},\n          token,\n        )\n      ) {\n        issues.push({\n          severity: \"error\",\n          code: \"MINIMAL_CORE_CSS_TOKEN_UNRESOLVED\",\n          message:\n            `${entry.kind}:${entry.id} references missing theme token ${token}.`,\n          manifestPath: entry.manifestPath,\n          token,\n        });\n      }\n    }\n  }\n\n  const brand = find(\n    scan,\n    \"asset\",\n    \"mydash-brand-mark\",\n  );\n\n  if (\n    brand?.manifest.approved !== true ||\n    !brand?.manifest.usage.includes(\n      \"not an HSBC logo\",\n    )\n  ) {\n    issues.push({\n      severity: \"error\",\n      code: \"MINIMAL_CORE_BRAND_CONTRACT_INVALID\",\n      message:\n        \"The fallback brand asset must be approved as a project asset and explicitly state that it is not an HSBC logo.\",\n    });\n  }\n\n  const errorCount = issues.filter(\n    (issue) => issue.severity === \"error\",\n  ).length;\n  const warningCount = issues.filter(\n    (issue) => issue.severity === \"warning\",\n  ).length;\n\n  return {\n    issues,\n    summary: {\n      valid: errorCount === 0,\n      expectedResourceCount:\n        expected.length,\n      discoveredResourceCount:\n        expected.filter(\n          (item) =>\n            scan.entries.filter(\n              (entry) =>\n                entry.kind === item.kind &&\n                entry.id === item.id &&\n                entry.level === \"core\",\n            ).length === 1,\n        ).length,\n      errorCount,\n      warningCount,\n    },\n  };\n}\n\nfunction find(scan, kind, id) {\n  return scan.entries.find(\n    (entry) =>\n      entry.kind === kind &&\n      entry.id === id &&\n      entry.level === \"core\",\n  );\n}\n"}, "src/workspace/capabilities.mjs": {"content": "export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"library.minimal-core\",\n        title: \"Minimal reusable Core library\",\n        available: true,\n        resourceCount: 8,\n        defaultTheme: \"hsbc-light\",\n        defaultPreset: \"default\",\n        brandAsset: \"mydash-brand-mark\",\n      },\n      {\n        id: \"agent.skills\",\n        title: \"Project agent skills\",\n        available: true,\n        logicalSkillCount: 9,\n        commandCount: 10,\n        activeDirectory: \".claude/skills\",\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n", "allowedPrevious": ["export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"agent.skills\",\n        title: \"Project agent skills\",\n        available: true,\n        logicalSkillCount: 9,\n        commandCount: 10,\n        activeDirectory: \".claude/skills\",\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n"]}, "docs/agent-workflows/VISUAL_STANDARDS.md": {"content": "# HSBC-inspired visual standards\n\nThese are project defaults derived from the requested My Dashboards visual\ndirection. They are not a substitute for an official internal brand manual.\nNever claim formal HSBC brand approval or compliance without an approved source.\n\n## Character\n\nThe interface should feel:\n\n- calm;\n- precise;\n- professional;\n- restrained;\n- spacious;\n- trustworthy;\n- contemporary without being fashionable.\n\nAvoid decorative excess, novelty dashboards and dense “control room” styling.\n\n## Colour\n\nDefault palette:\n\n```text\nPrimary accent    #DB0011\nCanvas            #FFFFFF\nPrimary text      near-black / charcoal\nSecondary text    restrained neutral grey\nBorders           pale neutral grey\n```\n\nUse red selectively for identity, active state and important emphasis. Do not\nturn every heading, card or metric red.\n\nNever use colour as the only carrier of status. Pair it with text, iconography\nor shape.\n\n## Typography\n\n- Prefer a clean system sans-serif stack unless an approved font asset exists.\n- Use a small number of sizes and weights.\n- Make hierarchy obvious before adding decoration.\n- Keep body copy readable and plain.\n- Avoid all-caps paragraphs and excessive letter spacing.\n\n## Layout\n\n- Use generous whitespace.\n- Align to a consistent grid.\n- Keep primary actions visually obvious.\n- Prefer a few strong groups over many bordered cards.\n- Use solid surfaces for information and translucency only for lightweight\n  navigation or framing.\n- Let content determine card dimensions; avoid uniform tiles when the material\n  has different needs.\n\n## Dashboards\n\n- Lead with the decision or operational question.\n- Put the most important summary first.\n- Use charts only when they reveal a comparison, distribution, trend or\n  relationship more clearly than text.\n- Include units, dates and source context.\n- Avoid decorative gauges and unexplained scores.\n- Make empty, loading and error states intentional.\n\n## Presentations\n\n- One primary idea per slide.\n- Use short, declarative titles.\n- Prefer evidence and diagrams over paragraphs.\n- Keep repeated chrome minimal.\n- Preserve a clear narrative from context to implication to action.\n\n## Navigator\n\nThe navigator should remain extremely minimal:\n\n- white canvas;\n- small top-left HSBC mark from approved assets;\n- compact expandable navigation;\n- category selector near the top centre;\n- miniature artefact previews;\n- solid title/action panel beneath each preview;\n- restrained glass treatment only on the preview mount;\n- no heavy application header.\n\n## Accessibility\n\n- Maintain readable contrast.\n- Use semantic landmarks and headings.\n- Support keyboard navigation and visible focus.\n- Provide text alternatives for meaningful images.\n- Respect reduced-motion preferences.\n- Do not rely on hover for essential information.\n- Keep touch targets usable.\n- Test narrow and wide viewports.\n\n## Assets\n\nUse approved assets from the repository library. Do not redraw the HSBC mark,\nextract logos from screenshots or invent brand graphics.\n\nWhen no approved asset exists, use a neutral placeholder and state that an\napproved asset is required.\n\nThe seeded Core asset `mydash-brand-mark` is an approved **project fallback**,\nnot an HSBC logo. It may be used in internal prototypes until an approved\ninternal HSBC asset is supplied. Do not describe the fallback as an HSBC mark.\n", "allowedPrevious": ["# HSBC-inspired visual standards\n\nThese are project defaults derived from the requested My Dashboards visual\ndirection. They are not a substitute for an official internal brand manual.\nNever claim formal HSBC brand approval or compliance without an approved source.\n\n## Character\n\nThe interface should feel:\n\n- calm;\n- precise;\n- professional;\n- restrained;\n- spacious;\n- trustworthy;\n- contemporary without being fashionable.\n\nAvoid decorative excess, novelty dashboards and dense “control room” styling.\n\n## Colour\n\nDefault palette:\n\n```text\nPrimary accent    #DB0011\nCanvas            #FFFFFF\nPrimary text      near-black / charcoal\nSecondary text    restrained neutral grey\nBorders           pale neutral grey\n```\n\nUse red selectively for identity, active state and important emphasis. Do not\nturn every heading, card or metric red.\n\nNever use colour as the only carrier of status. Pair it with text, iconography\nor shape.\n\n## Typography\n\n- Prefer a clean system sans-serif stack unless an approved font asset exists.\n- Use a small number of sizes and weights.\n- Make hierarchy obvious before adding decoration.\n- Keep body copy readable and plain.\n- Avoid all-caps paragraphs and excessive letter spacing.\n\n## Layout\n\n- Use generous whitespace.\n- Align to a consistent grid.\n- Keep primary actions visually obvious.\n- Prefer a few strong groups over many bordered cards.\n- Use solid surfaces for information and translucency only for lightweight\n  navigation or framing.\n- Let content determine card dimensions; avoid uniform tiles when the material\n  has different needs.\n\n## Dashboards\n\n- Lead with the decision or operational question.\n- Put the most important summary first.\n- Use charts only when they reveal a comparison, distribution, trend or\n  relationship more clearly than text.\n- Include units, dates and source context.\n- Avoid decorative gauges and unexplained scores.\n- Make empty, loading and error states intentional.\n\n## Presentations\n\n- One primary idea per slide.\n- Use short, declarative titles.\n- Prefer evidence and diagrams over paragraphs.\n- Keep repeated chrome minimal.\n- Preserve a clear narrative from context to implication to action.\n\n## Navigator\n\nThe navigator should remain extremely minimal:\n\n- white canvas;\n- small top-left HSBC mark from approved assets;\n- compact expandable navigation;\n- category selector near the top centre;\n- miniature artefact previews;\n- solid title/action panel beneath each preview;\n- restrained glass treatment only on the preview mount;\n- no heavy application header.\n\n## Accessibility\n\n- Maintain readable contrast.\n- Use semantic landmarks and headings.\n- Support keyboard navigation and visible focus.\n- Provide text alternatives for meaningful images.\n- Respect reduced-motion preferences.\n- Do not rely on hover for essential information.\n- Keep touch targets usable.\n- Test narrow and wide viewports.\n\n## Assets\n\nUse approved assets from the repository library. Do not redraw the HSBC mark,\nextract logos from screenshots or invent brand graphics.\n\nWhen no approved asset exists, use a neutral placeholder and state that an\napproved asset is required.\n"]}, "library/CORE.md": {"content": "# Minimal Core library\n\nCore is intentionally small. Bootstrap 16 seeds only the resources needed to\nestablish a stable visual baseline and build the first reference dashboard.\n\n## Seeded resources\n\n```text\nTheme\n  hsbc-light\n\nPreset\n  default\n\nLayout\n  dashboard-shell\n\nComponents\n  metric-card\n  section-heading\n\nPrimitives\n  button\n  status-badge\n\nAsset\n  mydash-brand-mark\n```\n\nThe `hsbc-light` theme expresses the restrained red, white and charcoal visual\ndirection requested for this project. It is not an official HSBC brand theme.\n\n`mydash-brand-mark` is a safe project fallback. It does not reproduce or claim\nto be the HSBC logo. Replace the `brand-logo` asset mapping when an approved\ninternal asset is supplied.\n\n## Core admission rule\n\nDo not add another Core resource merely because it may be useful.\n\nA resource belongs in Core only when it has:\n\n- multiple real consumers;\n- a stable semantic contract;\n- cross-domain usefulness;\n- validated behaviour across those consumers;\n- a clear reason not to remain local or Collection-scoped.\n\nCore resources can be demoted when the evidence no longer supports their scope.\n\n## Validate\n\n```bash\nnpm run mydash -- library scan\nnpm run mydash -- library list --level core\nnpm run test:core\nnpm run mydash -- validate\n```\n"}, "library/themes/core/hsbc-light/theme.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"theme\",\n  \"id\": \"hsbc-light\",\n  \"name\": \"HSBC Light\",\n  \"description\": \"Restrained light project theme inspired by the requested HSBC visual direction. This is not an official HSBC brand theme.\",\n  \"level\": \"core\",\n  \"tokens\": {\n    \"colour-primary\": \"#db0011\",\n    \"colour-primary-hover\": \"#b3000e\",\n    \"colour-primary-soft\": \"#fff1f2\",\n    \"colour-background\": \"#ffffff\",\n    \"colour-surface\": \"#ffffff\",\n    \"colour-surface-subtle\": \"#f7f7f7\",\n    \"colour-text\": \"#1f1f1f\",\n    \"colour-text-muted\": \"#5f5f5f\",\n    \"colour-border\": \"#d8d8d8\",\n    \"colour-border-strong\": \"#b8b8b8\",\n    \"colour-focus\": \"#0066cc\",\n    \"colour-positive\": \"#237804\",\n    \"colour-positive-soft\": \"#f0f8ec\",\n    \"colour-warning\": \"#8a5a00\",\n    \"colour-warning-soft\": \"#fff7e6\",\n    \"colour-critical\": \"#b42318\",\n    \"colour-critical-soft\": \"#fff1f0\",\n    \"colour-information\": \"#175cd3\",\n    \"colour-information-soft\": \"#eff8ff\",\n    \"font-family\": \"Inter, Arial, Helvetica, system-ui, -apple-system, BlinkMacSystemFont, \\\"Segoe UI\\\", sans-serif\",\n    \"font-size-xs\": \"0.75rem\",\n    \"font-size-sm\": \"0.875rem\",\n    \"font-size-md\": \"1rem\",\n    \"font-size-lg\": \"1.25rem\",\n    \"font-size-xl\": \"1.75rem\",\n    \"font-size-2xl\": \"2.5rem\",\n    \"font-weight-regular\": \"400\",\n    \"font-weight-medium\": \"600\",\n    \"font-weight-bold\": \"700\",\n    \"line-height-tight\": \"1.15\",\n    \"line-height-body\": \"1.5\",\n    \"space-1\": \"0.25rem\",\n    \"space-2\": \"0.5rem\",\n    \"space-3\": \"0.75rem\",\n    \"space-4\": \"1rem\",\n    \"space-5\": \"1.5rem\",\n    \"space-6\": \"2rem\",\n    \"space-7\": \"3rem\",\n    \"radius-sm\": \"0.25rem\",\n    \"radius-md\": \"0.5rem\",\n    \"radius-lg\": \"0.75rem\",\n    \"shadow-sm\": \"0 1px 2px rgba(0, 0, 0, 0.08)\",\n    \"shadow-md\": \"0 8px 24px rgba(0, 0, 0, 0.10)\",\n    \"content-max-width\": \"90rem\"\n  },\n  \"assets\": {\n    \"brand-logo\": \"mydash-brand-mark\"\n  }\n}\n"}, "library/presets/core/default/preset.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"preset\",\n  \"id\": \"default\",\n  \"name\": \"Default\",\n  \"description\": \"Minimal Core mappings for clear, accessible dashboards and concepts.\",\n  \"level\": \"core\",\n  \"mappings\": {\n    \"layout\": \"dashboard-shell\",\n    \"components\": {\n      \"metric-summary\": \"metric-card\",\n      \"section-heading\": \"section-heading\"\n    },\n    \"primitives\": {\n      \"button\": \"button\",\n      \"status\": \"status-badge\"\n    },\n    \"assets\": {\n      \"brand-logo\": \"mydash-brand-mark\"\n    }\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "library/ui/layouts/core/dashboard-shell/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"layout\",\n  \"id\": \"dashboard-shell\",\n  \"name\": \"Dashboard Shell\",\n  \"description\": \"Responsive page shell with a compact header, bounded content region and composable grid utilities.\",\n  \"level\": \"core\",\n  \"slot\": \"page-layout\",\n  \"contractVersion\": 1,\n  \"entry\": \"layout.css\",\n  \"props\": {\n    \"density\": {\n      \"type\": \"comfortable|compact\",\n      \"required\": false,\n      \"description\": \"Controls the default spacing rhythm.\"\n    }\n  },\n  \"variants\": {\n    \"density\": [\n      \"comfortable\",\n      \"compact\"\n    ]\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "library/ui/layouts/core/dashboard-shell/layout.css": {"content": ":where(html) {\n  background: var(--colour-background);\n  color: var(--colour-text);\n  font-family: var(--font-family);\n  line-height: var(--line-height-body);\n}\n\n:where(body) {\n  margin: 0;\n  min-width: 20rem;\n  background: var(--colour-background);\n}\n\n.mydash-shell {\n  min-height: 100vh;\n  background: var(--colour-background);\n}\n\n.mydash-shell__header {\n  display: flex;\n  min-height: 4.5rem;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--space-4);\n  padding: var(--space-3) clamp(var(--space-4), 3vw, var(--space-6));\n  border-bottom: 1px solid var(--colour-border);\n  background: var(--colour-surface);\n}\n\n.mydash-shell__brand {\n  display: inline-flex;\n  min-width: 0;\n  align-items: center;\n  gap: var(--space-3);\n  color: var(--colour-text);\n  text-decoration: none;\n}\n\n.mydash-shell__brand img {\n  display: block;\n  width: auto;\n  max-width: min(15rem, 48vw);\n  height: 2rem;\n}\n\n.mydash-shell__main {\n  width: min(\n    calc(100% - 2 * clamp(var(--space-4), 3vw, var(--space-6))),\n    var(--content-max-width)\n  );\n  margin-inline: auto;\n  padding-block: clamp(var(--space-5), 4vw, var(--space-7));\n}\n\n.mydash-shell[data-density=\"compact\"] .mydash-shell__main {\n  padding-block: var(--space-5);\n}\n\n.mydash-grid {\n  display: grid;\n  grid-template-columns: repeat(12, minmax(0, 1fr));\n  gap: var(--space-5);\n}\n\n.mydash-grid--metrics {\n  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));\n}\n\n.mydash-grid > * {\n  min-width: 0;\n}\n\n.mydash-panel {\n  border: 1px solid var(--colour-border);\n  border-radius: var(--radius-lg);\n  background: var(--colour-surface);\n  box-shadow: var(--shadow-sm);\n}\n\n@media (max-width: 48rem) {\n  .mydash-shell__header {\n    align-items: flex-start;\n    flex-direction: column;\n  }\n\n  .mydash-grid {\n    grid-template-columns: 1fr;\n  }\n}\n"}, "library/ui/layouts/core/dashboard-shell/README.md": {"content": "# Dashboard Shell\n\nUse these classes:\n\n```html\n<div class=\"mydash-shell\">\n  <header class=\"mydash-shell__header\">...</header>\n  <main class=\"mydash-shell__main\">\n    <div class=\"mydash-grid mydash-grid--metrics\">...</div>\n  </main>\n</div>\n```\n\nThe layout supplies structure only. Artefacts own their information\narchitecture and content.\n"}, "library/ui/primitives/core/button/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"primitive\",\n  \"id\": \"button\",\n  \"name\": \"Button\",\n  \"description\": \"Accessible action styling for native button and link elements.\",\n  \"level\": \"core\",\n  \"slot\": \"button\",\n  \"contractVersion\": 1,\n  \"entry\": \"primitive.css\",\n  \"props\": {\n    \"variant\": {\n      \"type\": \"primary|secondary|quiet\",\n      \"required\": false,\n      \"description\": \"Visual emphasis of the action.\"\n    },\n    \"size\": {\n      \"type\": \"small|medium\",\n      \"required\": false,\n      \"description\": \"Control height and padding.\"\n    }\n  },\n  \"variants\": {\n    \"variant\": [\n      \"primary\",\n      \"secondary\",\n      \"quiet\"\n    ],\n    \"size\": [\n      \"small\",\n      \"medium\"\n    ]\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "library/ui/primitives/core/button/primitive.css": {"content": ".mydash-button {\n  display: inline-flex;\n  min-height: 2.75rem;\n  align-items: center;\n  justify-content: center;\n  gap: var(--space-2);\n  padding: 0.625rem 1rem;\n  border: 1px solid transparent;\n  border-radius: var(--radius-sm);\n  font: inherit;\n  font-size: var(--font-size-sm);\n  font-weight: var(--font-weight-medium);\n  line-height: 1;\n  text-decoration: none;\n  cursor: pointer;\n  transition:\n    background-color 120ms ease,\n    border-color 120ms ease,\n    color 120ms ease;\n}\n\n.mydash-button[data-variant=\"primary\"] {\n  color: #ffffff;\n  background: var(--colour-primary);\n}\n\n.mydash-button[data-variant=\"primary\"]:hover {\n  background: var(--colour-primary-hover);\n}\n\n.mydash-button[data-variant=\"secondary\"] {\n  color: var(--colour-text);\n  border-color: var(--colour-border-strong);\n  background: var(--colour-surface);\n}\n\n.mydash-button[data-variant=\"secondary\"]:hover {\n  border-color: var(--colour-text);\n}\n\n.mydash-button[data-variant=\"quiet\"] {\n  color: var(--colour-primary);\n  background: transparent;\n}\n\n.mydash-button[data-variant=\"quiet\"]:hover {\n  background: var(--colour-primary-soft);\n}\n\n.mydash-button[data-size=\"small\"] {\n  min-height: 2.25rem;\n  padding: 0.5rem 0.75rem;\n}\n\n.mydash-button:focus-visible {\n  outline: 3px solid color-mix(in srgb, var(--colour-focus) 35%, transparent);\n  outline-offset: 2px;\n}\n\n.mydash-button:disabled,\n.mydash-button[aria-disabled=\"true\"] {\n  cursor: not-allowed;\n  opacity: 0.55;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .mydash-button {\n    transition: none;\n  }\n}\n"}, "library/ui/primitives/core/button/README.md": {"content": "# Button\n\nApply `.mydash-button` to a native `<button>` or an `<a>` with genuine\nnavigation semantics.\n\n```html\n<button class=\"mydash-button\" data-variant=\"primary\">Export</button>\n```\n\nSupported variants: `primary`, `secondary`, `quiet`.\n"}, "library/ui/primitives/core/status-badge/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"primitive\",\n  \"id\": \"status-badge\",\n  \"name\": \"Status Badge\",\n  \"description\": \"Compact textual status treatment. Status meaning must never rely on colour alone.\",\n  \"level\": \"core\",\n  \"slot\": \"status\",\n  \"contractVersion\": 1,\n  \"entry\": \"primitive.css\",\n  \"props\": {\n    \"tone\": {\n      \"type\": \"neutral|information|positive|warning|critical\",\n      \"required\": false,\n      \"description\": \"Semantic visual tone paired with visible status text.\"\n    }\n  },\n  \"variants\": {\n    \"tone\": [\n      \"neutral\",\n      \"information\",\n      \"positive\",\n      \"warning\",\n      \"critical\"\n    ]\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "library/ui/primitives/core/status-badge/primitive.css": {"content": ".mydash-status {\n  display: inline-flex;\n  align-items: center;\n  gap: var(--space-2);\n  min-height: 1.625rem;\n  padding: 0.2rem 0.55rem;\n  border: 1px solid var(--colour-border);\n  border-radius: 999px;\n  color: var(--colour-text-muted);\n  background: var(--colour-surface-subtle);\n  font-size: var(--font-size-xs);\n  font-weight: var(--font-weight-medium);\n  line-height: 1.2;\n  white-space: nowrap;\n}\n\n.mydash-status::before {\n  width: 0.45rem;\n  height: 0.45rem;\n  flex: 0 0 auto;\n  border-radius: 50%;\n  background: currentColor;\n  content: \"\";\n}\n\n.mydash-status[data-tone=\"information\"] {\n  color: var(--colour-information);\n  border-color: color-mix(in srgb, var(--colour-information) 25%, white);\n  background: var(--colour-information-soft);\n}\n\n.mydash-status[data-tone=\"positive\"] {\n  color: var(--colour-positive);\n  border-color: color-mix(in srgb, var(--colour-positive) 25%, white);\n  background: var(--colour-positive-soft);\n}\n\n.mydash-status[data-tone=\"warning\"] {\n  color: var(--colour-warning);\n  border-color: color-mix(in srgb, var(--colour-warning) 25%, white);\n  background: var(--colour-warning-soft);\n}\n\n.mydash-status[data-tone=\"critical\"] {\n  color: var(--colour-critical);\n  border-color: color-mix(in srgb, var(--colour-critical) 25%, white);\n  background: var(--colour-critical-soft);\n}\n"}, "library/ui/primitives/core/status-badge/README.md": {"content": "# Status Badge\n\nStatus text is mandatory. Colour is supplementary.\n\n```html\n<span class=\"mydash-status\" data-tone=\"warning\">Awaiting review</span>\n```\n"}, "library/ui/components/core/metric-card/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"component\",\n  \"id\": \"metric-card\",\n  \"name\": \"Metric Card\",\n  \"description\": \"A labelled summary value with optional supporting detail and status.\",\n  \"level\": \"core\",\n  \"slot\": \"metric-summary\",\n  \"contractVersion\": 1,\n  \"entry\": \"component.css\",\n  \"props\": {\n    \"label\": {\n      \"type\": \"string\",\n      \"required\": true,\n      \"description\": \"Plain-language metric label.\"\n    },\n    \"value\": {\n      \"type\": \"string\",\n      \"required\": true,\n      \"description\": \"Formatted value including visible unit where needed.\"\n    },\n    \"detail\": {\n      \"type\": \"string\",\n      \"required\": false,\n      \"description\": \"Supporting comparison, period or source context.\"\n    },\n    \"tone\": {\n      \"type\": \"neutral|positive|warning|critical\",\n      \"required\": false,\n      \"description\": \"Optional semantic emphasis.\"\n    }\n  },\n  \"variants\": {\n    \"tone\": [\n      \"neutral\",\n      \"positive\",\n      \"warning\",\n      \"critical\"\n    ],\n    \"density\": [\n      \"comfortable\",\n      \"compact\"\n    ]\n  },\n  \"dependencies\": {\n    \"primitives\": {\n      \"status\": \"status-badge\"\n    },\n    \"components\": {},\n    \"assets\": {}\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "library/ui/components/core/metric-card/component.css": {"content": ".mydash-metric-card {\n  display: grid;\n  align-content: start;\n  gap: var(--space-3);\n  min-height: 9.5rem;\n  padding: var(--space-5);\n  border: 1px solid var(--colour-border);\n  border-radius: var(--radius-lg);\n  background: var(--colour-surface);\n  box-shadow: var(--shadow-sm);\n}\n\n.mydash-metric-card[data-density=\"compact\"] {\n  min-height: 7.5rem;\n  padding: var(--space-4);\n}\n\n.mydash-metric-card__topline {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: var(--space-3);\n}\n\n.mydash-metric-card__label {\n  margin: 0;\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-sm);\n  font-weight: var(--font-weight-medium);\n}\n\n.mydash-metric-card__value {\n  margin: 0;\n  color: var(--colour-text);\n  font-size: clamp(var(--font-size-xl), 4vw, var(--font-size-2xl));\n  font-weight: var(--font-weight-bold);\n  letter-spacing: -0.035em;\n  line-height: var(--line-height-tight);\n}\n\n.mydash-metric-card__detail {\n  margin: 0;\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-sm);\n}\n\n.mydash-metric-card[data-tone=\"positive\"] {\n  border-top: 3px solid var(--colour-positive);\n}\n\n.mydash-metric-card[data-tone=\"warning\"] {\n  border-top: 3px solid var(--colour-warning);\n}\n\n.mydash-metric-card[data-tone=\"critical\"] {\n  border-top: 3px solid var(--colour-critical);\n}\n"}, "library/ui/components/core/metric-card/README.md": {"content": "# Metric Card\n\n```html\n<article class=\"mydash-metric-card\">\n  <div class=\"mydash-metric-card__topline\">\n    <p class=\"mydash-metric-card__label\">Open reviews</p>\n    <span class=\"mydash-status\" data-tone=\"warning\">Attention</span>\n  </div>\n  <p class=\"mydash-metric-card__value\">12</p>\n  <p class=\"mydash-metric-card__detail\">As of 26 July 2026</p>\n</article>\n```\n\nInclude visible units, dates or comparison context where they matter.\n"}, "library/ui/components/core/section-heading/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"component\",\n  \"id\": \"section-heading\",\n  \"name\": \"Section Heading\",\n  \"description\": \"A section title, optional supporting text and optional action region.\",\n  \"level\": \"core\",\n  \"slot\": \"section-heading\",\n  \"contractVersion\": 1,\n  \"entry\": \"component.css\",\n  \"props\": {\n    \"title\": {\n      \"type\": \"string\",\n      \"required\": true,\n      \"description\": \"Short section heading.\"\n    },\n    \"supportingText\": {\n      \"type\": \"string\",\n      \"required\": false,\n      \"description\": \"Concise context or source note.\"\n    },\n    \"action\": {\n      \"type\": \"button|link\",\n      \"required\": false,\n      \"description\": \"Optional action aligned with the heading.\"\n    }\n  },\n  \"variants\": {\n    \"alignment\": [\n      \"start\",\n      \"split\"\n    ]\n  },\n  \"dependencies\": {\n    \"primitives\": {\n      \"button\": \"button\"\n    },\n    \"components\": {},\n    \"assets\": {}\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "library/ui/components/core/section-heading/component.css": {"content": ".mydash-section-heading {\n  display: flex;\n  align-items: flex-end;\n  justify-content: space-between;\n  gap: var(--space-5);\n  margin-block: 0 var(--space-5);\n}\n\n.mydash-section-heading[data-alignment=\"start\"] {\n  align-items: flex-start;\n  flex-direction: column;\n  gap: var(--space-3);\n}\n\n.mydash-section-heading__copy {\n  min-width: 0;\n}\n\n.mydash-section-heading__title {\n  margin: 0;\n  color: var(--colour-text);\n  font-size: var(--font-size-xl);\n  font-weight: var(--font-weight-bold);\n  letter-spacing: -0.025em;\n  line-height: var(--line-height-tight);\n}\n\n.mydash-section-heading__supporting {\n  max-width: 70ch;\n  margin: var(--space-2) 0 0;\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-sm);\n}\n\n.mydash-section-heading__action {\n  flex: 0 0 auto;\n}\n\n@media (max-width: 40rem) {\n  .mydash-section-heading {\n    align-items: flex-start;\n    flex-direction: column;\n    gap: var(--space-3);\n  }\n}\n"}, "library/ui/components/core/section-heading/README.md": {"content": "# Section Heading\n\n```html\n<header class=\"mydash-section-heading\">\n  <div class=\"mydash-section-heading__copy\">\n    <h2 class=\"mydash-section-heading__title\">Pipeline</h2>\n    <p class=\"mydash-section-heading__supporting\">Current review status.</p>\n  </div>\n  <div class=\"mydash-section-heading__action\">...</div>\n</header>\n```\n"}, "library/assets/core/mydash-brand-mark/asset.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"asset\",\n  \"id\": \"mydash-brand-mark\",\n  \"name\": \"My Dashboards Brand Mark\",\n  \"level\": \"core\",\n  \"file\": \"mydash-brand-mark.svg\",\n  \"mediaType\": \"image/svg+xml\",\n  \"category\": \"logo\",\n  \"usage\": \"Approved project fallback for internal My Dashboards interfaces on light backgrounds. It is not an HSBC logo and must not be described as one. Replace the brand-logo mapping when an approved internal HSBC asset is available.\",\n  \"approved\": true,\n  \"attribution\": \"Created specifically for the My Dashboards project.\"\n}\n"}, "library/assets/core/mydash-brand-mark/mydash-brand-mark.svg": {"content": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"238\" height=\"40\" viewBox=\"0 0 238 40\" role=\"img\" aria-labelledby=\"title description\">\n  <title id=\"title\">My Dashboards</title>\n  <desc id=\"description\">Project fallback brand mark with a red vertical accent.</desc>\n  <rect width=\"238\" height=\"40\" rx=\"4\" fill=\"#ffffff\"/>\n  <rect x=\"0\" width=\"6\" height=\"40\" rx=\"3\" fill=\"#db0011\"/>\n  <text x=\"20\" y=\"25\" fill=\"#1f1f1f\" font-family=\"Arial, Helvetica, sans-serif\" font-size=\"16\" font-weight=\"700\" letter-spacing=\"0.4\">\n    MY DASHBOARDS\n  </text>\n</svg>\n"}, "tests/unit/core-library.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport test from \"node:test\";\nimport {\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\nimport {\n  validateMinimalCore,\n} from \"../../src/library/core.mjs\";\nimport {\n  resolveArtifactAppearance,\n} from \"../../src/resolution/resolve.mjs\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\n\ntest(\"minimal Core contains exactly the intended seed resources\", async () => {\n  const scan =\n    await scanWorkspaceLibrary(\n      projectRoot,\n    );\n  const result =\n    await validateMinimalCore(scan);\n\n  assert.equal(\n    result.summary.valid,\n    true,\n    JSON.stringify(result.issues, null, 2),\n  );\n  assert.equal(\n    result.summary.expectedResourceCount,\n    8,\n  );\n  assert.equal(\n    result.summary.discoveredResourceCount,\n    8,\n  );\n});\n\ntest(\"the default Core preset resolves a complete dashboard appearance\", async () => {\n  const scan =\n    await scanWorkspaceLibrary(\n      projectRoot,\n    );\n  const artifact = {\n    id: \"core-probe\",\n    kind: \"dashboard\",\n    category: \"artifact\",\n    title: \"Core Probe\",\n    level: null,\n    collection: null,\n    ownerArtifact: null,\n    directory: resolve(\n      projectRoot,\n      \"tests\",\n      \"fixtures\",\n      \"core-probe\",\n    ),\n    manifestPath: resolve(\n      projectRoot,\n      \"tests\",\n      \"fixtures\",\n      \"core-probe\",\n      \"artifact.json\",\n    ),\n    displayPath:\n      \"tests/fixtures/core-probe/artifact.json\",\n    manifest: {\n      schemaVersion: 1,\n      kind: \"dashboard\",\n      id: \"core-probe\",\n      title: \"Core Probe\",\n      entry: \"src/index.html\",\n      appearance: {\n        theme: \"hsbc-light\",\n        preset: \"default\",\n        overrides: {\n          layout: null,\n          components: {},\n          primitives: {},\n          assets: {},\n        },\n      },\n    },\n  };\n  const result =\n    resolveArtifactAppearance(\n      scan,\n      artifact,\n    );\n\n  assert.equal(\n    result.summary.valid,\n    true,\n    JSON.stringify(result.issues, null, 2),\n  );\n  assert.equal(\n    result.selections.theme.entry.id,\n    \"hsbc-light\",\n  );\n  assert.equal(\n    result.selections.preset.entry.id,\n    \"default\",\n  );\n  assert.equal(\n    result.selections.layout.entry.id,\n    \"dashboard-shell\",\n  );\n  assert.equal(\n    result.selections.components[\n      \"metric-summary\"\n    ].entry.id,\n    \"metric-card\",\n  );\n  assert.equal(\n    result.selections.components[\n      \"section-heading\"\n    ].entry.id,\n    \"section-heading\",\n  );\n  assert.equal(\n    result.selections.primitives.button\n      .entry.id,\n    \"button\",\n  );\n  assert.equal(\n    result.selections.primitives.status\n      .entry.id,\n    \"status-badge\",\n  );\n  assert.equal(\n    result.selections.assets[\n      \"brand-logo\"\n    ].entry.id,\n    \"mydash-brand-mark\",\n  );\n  assert.equal(\n    result.summary.dependencyCount,\n    8,\n  );\n});\n\ntest(\"the fallback brand asset is not represented as an HSBC logo\", async () => {\n  const scan =\n    await scanWorkspaceLibrary(\n      projectRoot,\n    );\n  const asset = scan.entries.find(\n    (entry) =>\n      entry.kind === \"asset\" &&\n      entry.id ===\n        \"mydash-brand-mark\",\n  );\n\n  assert.equal(\n    asset.manifest.approved,\n    true,\n  );\n  assert.match(\n    asset.manifest.usage,\n    /not an HSBC logo/,\n  );\n});\n"}, "tests/integration/core-library-cli.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport test from \"node:test\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\nconst cliPath = resolve(\n  projectRoot,\n  \"bin\",\n  \"mydash.mjs\",\n);\n\nfunction runCli(args) {\n  return spawnSync(\n    process.execPath,\n    [cliPath, ...args],\n    {\n      cwd: projectRoot,\n      encoding: \"utf8\",\n      stdio: \"pipe\",\n      shell: false,\n      maxBuffer:\n        64 * 1024 * 1024,\n    },\n  );\n}\n\ntest(\"library scan accepts the seeded Core\", () => {\n  const result = runCli([\n    \"library\",\n    \"scan\",\n    \"--json\",\n  ]);\n\n  assert.equal(\n    result.status,\n    0,\n    result.stderr || result.stdout,\n  );\n  const body = JSON.parse(\n    result.stdout,\n  );\n  assert.equal(\n    body.data.summary.errorCount,\n    0,\n  );\n  assert.equal(\n    body.data.summary.resourceCount >= 8,\n    true,\n  );\n});\n\ntest(\"Core listing contains the eight seed resources\", () => {\n  const result = runCli([\n    \"library\",\n    \"list\",\n    \"--level\",\n    \"core\",\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(\n    result.stdout,\n  );\n  const ids = new Set(\n    body.data.entries.map(\n      (entry) =>\n        `${entry.kind}:${entry.id}`,\n    ),\n  );\n  const expected = [\n    \"theme:hsbc-light\",\n    \"preset:default\",\n    \"layout:dashboard-shell\",\n    \"component:metric-card\",\n    \"component:section-heading\",\n    \"primitive:button\",\n    \"primitive:status-badge\",\n    \"asset:mydash-brand-mark\",\n  ];\n\n  for (const value of expected) {\n    assert.equal(\n      ids.has(value),\n      true,\n      `Missing ${value}`,\n    );\n  }\n});\n\ntest(\"workspace validation succeeds with the seeded defaults\", () => {\n  const result = runCli([\n    \"validate\",\n    \"--json\",\n  ]);\n\n  assert.equal(\n    result.status,\n    0,\n    result.stderr || result.stdout,\n  );\n  const body = JSON.parse(\n    result.stdout,\n  );\n  assert.equal(\n    body.data.summary.valid,\n    true,\n  );\n});\n"}, "scripts/tasks/test-core.mjs": {"content": "#!/usr/bin/env node\n\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  scriptDirectory,\n  \"../..\",\n);\n\nconst tests = [\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"unit\",\n    \"core-library.test.mjs\",\n  ),\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"integration\",\n    \"core-library-cli.test.mjs\",\n  ),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n    maxBuffer:\n      64 * 1024 * 1024,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode =\n  result.status ?? 1;\n"}};
const PLACEHOLDERS = {"library/ui/primitives/core/.gitkeep": "# Intentionally retained\n\nTrusted, context-free Core primitives will live here.\n\nImplementation is added by a later bootstrap step.\n", "library/ui/components/core/.gitkeep": "# Intentionally retained\n\nTrusted, broadly reusable Core components will live here.\n\nImplementation is added by a later bootstrap step.\n", "library/ui/layouts/core/.gitkeep": "# Intentionally retained\n\nA deliberately small set of stable Core layouts will live here.\n\nImplementation is added by a later bootstrap step.\n", "library/themes/core/.gitkeep": "# Intentionally retained\n\nTrusted Core themes such as HSBC Light and HSBC Dark will live here.\n\nImplementation is added by a later bootstrap step.\n", "library/presets/core/.gitkeep": "# Intentionally retained\n\nStable Core UI presets will live here.\n\nImplementation is added by a later bootstrap step.\n", "library/assets/core/.gitkeep": "# Intentionally retained\n\nTrusted shared assets will live here.\n\nImplementation is added by a later bootstrap step.\n"};
const NULL_DEFAULT_WORKSPACE =
  "{\n  \"schemaVersion\": 1,\n  \"id\": \"my-dashboards\",\n  \"name\": \"My Dashboards\",\n  \"libraryRoots\": {\n    \"dashboards\": \"library/dashboards\",\n    \"presentations\": \"library/presentations\",\n    \"concepts\": \"library/concepts\",\n    \"primitives\": \"library/ui/primitives\",\n    \"components\": \"library/ui/components\",\n    \"layouts\": \"library/ui/layouts\",\n    \"themes\": \"library/themes\",\n    \"presets\": \"library/presets\",\n    \"assets\": \"library/assets\"\n  },\n  \"defaults\": {\n    \"theme\": null,\n    \"preset\": null\n  },\n  \"preview\": {\n    \"host\": \"127.0.0.1\",\n    \"port\": 4173\n  },\n  \"export\": {\n    \"outputDirectory\": \"exports\"\n  }\n}\n";
const SEEDED_DEFAULT_WORKSPACE =
  "{\n  \"schemaVersion\": 1,\n  \"id\": \"my-dashboards\",\n  \"name\": \"My Dashboards\",\n  \"libraryRoots\": {\n    \"dashboards\": \"library/dashboards\",\n    \"presentations\": \"library/presentations\",\n    \"concepts\": \"library/concepts\",\n    \"primitives\": \"library/ui/primitives\",\n    \"components\": \"library/ui/components\",\n    \"layouts\": \"library/ui/layouts\",\n    \"themes\": \"library/themes\",\n    \"presets\": \"library/presets\",\n    \"assets\": \"library/assets\"\n  },\n  \"defaults\": {\n    \"theme\": \"hsbc-light\",\n    \"preset\": \"default\"\n  },\n  \"preview\": {\n    \"host\": \"127.0.0.1\",\n    \"port\": 4173\n  },\n  \"export\": {\n    \"outputDirectory\": \"exports\"\n  }\n}\n";

const args = parseBootstrapArgs(
  process.argv.slice(2),
);
const targetRoot = resolve(
  args.target ?? process.cwd(),
);
const selfPath = resolve(
  fileURLToPath(import.meta.url),
);

const report = {
  ok: false,
  script: SCRIPT_NAME,
  targetRoot,
  dryRun: args.dryRun,
  created: [],
  updated: [],
  removed: [],
  preserved: [],
  warnings: [],
  validation: [],
  defaults: {
    theme: null,
    preset: null,
    changed: false,
  },
  git: {
    commit: null,
    pushed: false,
    pushTarget: null,
  },
};

main().catch((error) => {
  report.warnings.push({
    code: "UNEXPECTED_FAILURE",
    message:
      error instanceof Error
        ? error.message
        : String(error),
  });
  finish(1);
});

async function main() {
  assertNodeVersion();
  await assertBootstrapFoundation();

  const repoRoot =
    getRepositoryRoot(targetRoot);

  if (
    !repoRoot ||
    resolve(repoRoot) !== targetRoot
  ) {
    throw new Error(
      "Bootstrap 16 must run from the root of the My Dashboards Git repository.",
    );
  }

  const dirtyBefore =
    getDirtyPaths(repoRoot);
  const ownedAbsolutePaths = [];

  for (
    const [
      relativePath,
      descriptor,
    ] of Object.entries(FILES)
  ) {
    const absolutePath = join(
      targetRoot,
      relativePath,
    );
    const result =
      await writeManagedFile({
        absolutePath,
        content: descriptor.content,
        allowedPrevious:
          descriptor.allowedPrevious ?? [],
        dirtyBefore,
        repoRoot,
      });

    if (
      result === "created" ||
      result === "updated"
    ) {
      ownedAbsolutePaths.push(
        absolutePath,
      );
    }
  }

  const configChanged =
    await updateWorkspaceDefaults(
      dirtyBefore,
      repoRoot,
    );

  if (configChanged) {
    ownedAbsolutePaths.push(
      join(
        targetRoot,
        "config",
        "workspace.json",
      ),
    );
  }

  const packageChanged =
    await updatePackageJson(
      dirtyBefore,
      repoRoot,
    );

  if (packageChanged) {
    ownedAbsolutePaths.push(
      join(targetRoot, "package.json"),
    );
  }

  for (
    const [
      relativePath,
      expectedContent,
    ] of Object.entries(PLACEHOLDERS)
  ) {
    const removed =
      await removeKnownPlaceholder({
        relativePath,
        expectedContent,
        dirtyBefore,
        repoRoot,
      });

    if (removed) {
      ownedAbsolutePaths.push(
        join(targetRoot, relativePath),
      );
    }
  }

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "16-seed-minimal-core.mjs",
  );

  if (
    selfPath === expectedSelfPath &&
    (await pathExists(selfPath))
  ) {
    ownedAbsolutePaths.push(selfPath);
  }

  if (
    !args.noCommit &&
    !args.dryRun
  ) {
    await checkpoint(
      repoRoot,
      uniquePaths(
        ownedAbsolutePaths,
      ),
    );
  } else if (args.noCommit) {
    report.warnings.push({
      code: "COMMIT_DISABLED",
      message:
        "The minimal Core library was created and tested, but --no-commit disabled the Git checkpoint.",
    });
  }

  report.ok = true;
  finish(0);
}

function parseBootstrapArgs(argv) {
  const parsed = {
    target: null,
    dryRun: false,
    noCommit: false,
    noPush: false,
    json: false,
    help: false,
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const value = argv[index];

    switch (value) {
      case "--target":
        index += 1;

        if (!argv[index]) {
          failArguments(
            "--target requires a directory path.",
          );
        }

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
        failArguments(
          `Unknown argument: ${value}`,
        );
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
  console.error(
    "Run with --help to see supported options.",
  );
  process.exit(2);
}

function printHelp() {
  console.log(`
My Dashboards — Bootstrap 16

Usage:
  node scripts/16-seed-minimal-core.mjs [options]

Options:
  --target <path>  Seed Core in a specific repository root.
  --dry-run        Report intended changes without writing or committing.
  --no-commit      Write and validate without committing or pushing.
  --no-push        Commit locally but do not push.
  --json           Return a machine-readable report.
  --help, -h       Show this help.
`.trim());
}

function assertNodeVersion() {
  const major = Number.parseInt(
    process.versions.node.split(".")[0],
    10,
  );

  if (
    !Number.isInteger(major) ||
    major < MIN_NODE_MAJOR
  ) {
    throw new Error(
      `Node.js ${MIN_NODE_MAJOR} or later is required. Found ${process.versions.node}.`,
    );
  }
}

async function assertBootstrapFoundation() {
  if (!args.dryRun) {
    await access(
      targetRoot,
      fsConstants.W_OK,
    );
  }

  const required = [
    "package.json",
    "package-lock.json",
    "config/workspace.json",
    "bin/mydash.mjs",
    "src/library/scan.mjs",
    "src/resolution/resolve.mjs",
    "src/workspace/capabilities.mjs",
    "docs/agent-workflows/VISUAL_STANDARDS.md",
    ".claude/skills/component/SKILL.md",
    "scripts/tasks/test-skills.mjs",
    "scripts/tasks/test-server.mjs",
    "scripts/tasks/test-git.mjs",
  ];
  const missing = [];

  for (const relativePath of required) {
    if (
      !(await pathExists(
        join(targetRoot, relativePath),
      ))
    ) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Bootstrap 15 has not been completed.",
        `Missing required paths: ${missing.join(", ")}`,
      ].join("\n"),
    );
  }
}

async function updateWorkspaceDefaults(
  dirtyBefore,
  repoRoot,
) {
  const configPath = join(
    targetRoot,
    "config",
    "workspace.json",
  );
  const gitPath = relativeGitPath(
    repoRoot,
    configPath,
  );

  if (dirtyBefore.has(gitPath)) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code:
        "PREEXISTING_WORKSPACE_CONFIG_CHANGES",
      message:
        "config/workspace.json had pre-existing changes, so its defaults were not modified.",
    });
    await recordCurrentDefaults(configPath);
    return false;
  }

  const source = await readFile(
    configPath,
    "utf8",
  );
  let value;

  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(
      "config/workspace.json is not valid JSON and was not modified.",
    );
  }

  report.defaults.theme =
    value.defaults?.theme ?? null;
  report.defaults.preset =
    value.defaults?.preset ?? null;

  if (
    value.defaults?.theme ||
    value.defaults?.preset
  ) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code:
        "WORKSPACE_DEFAULTS_ALREADY_SELECTED",
      message:
        `Preserved existing workspace defaults: theme=${value.defaults?.theme ?? "(none)"}, preset=${value.defaults?.preset ?? "(none)"}.`,
    });
    return false;
  }

  let next;

  if (source === NULL_DEFAULT_WORKSPACE) {
    next = SEEDED_DEFAULT_WORKSPACE;
  } else {
    value.defaults ??= {};
    value.defaults.theme =
      "hsbc-light";
    value.defaults.preset =
      "default";
    next =
      `${JSON.stringify(value, null, 2)}\n`;
  }

  report.defaults.theme =
    "hsbc-light";
  report.defaults.preset =
    "default";
  report.defaults.changed = true;

  if (args.dryRun) {
    report.updated.push(gitPath);
    return true;
  }

  await atomicWrite(
    configPath,
    next,
  );
  report.updated.push(gitPath);

  return true;
}

async function recordCurrentDefaults(
  configPath,
) {
  try {
    const value = JSON.parse(
      await readFile(
        configPath,
        "utf8",
      ),
    );
    report.defaults.theme =
      value.defaults?.theme ?? null;
    report.defaults.preset =
      value.defaults?.preset ?? null;
  } catch {
    // Validation reports malformed configuration later.
  }
}

async function updatePackageJson(
  dirtyBefore,
  repoRoot,
) {
  const packagePath = join(
    targetRoot,
    "package.json",
  );
  const gitPath = relativeGitPath(
    repoRoot,
    packagePath,
  );

  if (dirtyBefore.has(gitPath)) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code:
        "PREEXISTING_PACKAGE_CHANGES",
      message:
        "package.json had pre-existing changes, so the Core test command was not added automatically.",
    });
    return false;
  }

  const source = await readFile(
    packagePath,
    "utf8",
  );
  let value;

  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(
      "package.json is not valid JSON and was not modified.",
    );
  }

  value.scripts ??= {};
  value.scripts["test:core"] =
    value.scripts["test:core"] ??
    "node scripts/tasks/test-core.mjs";

  const next =
    `${JSON.stringify(value, null, 2)}\n`;

  if (source === next) {
    report.preserved.push(gitPath);
    return false;
  }

  if (args.dryRun) {
    report.updated.push(gitPath);
    return true;
  }

  await atomicWrite(
    packagePath,
    next,
  );
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
  const gitPath =
    relativeGitPath(
      repoRoot,
      absolutePath,
    );
  const exists =
    await pathExists(absolutePath);

  if (
    dirtyBefore.has(gitPath) &&
    absolutePath !== selfPath
  ) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code:
        "PREEXISTING_FILE_CHANGES",
      message:
        `Preserved pre-existing changes in ${gitPath}.`,
    });
    return "preserved";
  }

  if (exists) {
    const current =
      await readFile(
        absolutePath,
        "utf8",
      );

    if (current === content) {
      report.preserved.push(gitPath);
      return "preserved";
    }

    if (
      !allowedPrevious.includes(
        current,
      )
    ) {
      report.preserved.push(gitPath);
      report.warnings.push({
        code:
          "EXISTING_FILE_PRESERVED",
        message:
          `${gitPath} already exists with different content and was not overwritten.`,
      });
      return "preserved";
    }

    if (args.dryRun) {
      report.updated.push(gitPath);
      return "updated";
    }

    await atomicWrite(
      absolutePath,
      content,
    );
    report.updated.push(gitPath);

    return "updated";
  }

  if (args.dryRun) {
    report.created.push(gitPath);
    return "created";
  }

  await atomicWrite(
    absolutePath,
    content,
  );
  report.created.push(gitPath);

  return "created";
}

async function removeKnownPlaceholder({
  relativePath,
  expectedContent,
  dirtyBefore,
  repoRoot,
}) {
  const absolutePath = join(
    targetRoot,
    relativePath,
  );
  const gitPath = relativeGitPath(
    repoRoot,
    absolutePath,
  );

  if (
    !(await pathExists(absolutePath)) ||
    dirtyBefore.has(gitPath)
  ) {
    return false;
  }

  const current = await readFile(
    absolutePath,
    "utf8",
  );

  if (current !== expectedContent) {
    return false;
  }

  if (args.dryRun) {
    report.removed.push(gitPath);
    return true;
  }

  await rm(absolutePath);
  report.removed.push(gitPath);

  return true;
}

async function validateGeneratedState() {
  if (args.dryRun) {
    report.validation.push({
      check: "dry-run",
      ok: true,
      message:
        "The minimal Core library was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "src/library/core.mjs",
    "src/workspace/capabilities.mjs",
    "tests/unit/core-library.test.mjs",
    "tests/integration/core-library-cli.test.mjs",
    "scripts/tasks/test-core.mjs",
  ];

  for (
    const relativePath of modulePaths
  ) {
    const result = run(
      process.execPath,
      [
        "--check",
        join(
          targetRoot,
          relativePath,
        ),
      ],
      {
        cwd: targetRoot,
        allowFailure: true,
      },
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
    message:
      `${modulePaths.length} Core service and test modules passed Node syntax checks.`,
  });

  const tests = run(
    process.execPath,
    [
      join(
        targetRoot,
        "scripts",
        "tasks",
        "test-core.mjs",
      ),
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Minimal Core tests failed:\n${
        tests.stderr ||
        tests.stdout
      }`,
    );
  }

  report.validation.push({
    check: "core-tests",
    ok: true,
    message:
      "Core manifests, source files, theme tokens, resolution and CLI tests passed.",
  });

  for (const command of [
    [
      "library",
      "scan",
      "--json",
    ],
    [
      "validate",
      "--json",
    ],
    [
      "skills",
      "validate",
      "--json",
    ],
  ]) {
    const result = run(
      process.execPath,
      [
        join(
          targetRoot,
          "bin",
          "mydash.mjs",
        ),
        ...command,
      ],
      {
        cwd: targetRoot,
        allowFailure: true,
      },
    );

    if (result.status !== 0) {
      throw new Error(
        `Workspace command failed (mydash ${command.join(" ")}):\n${
          result.stderr ||
          result.stdout
        }`,
      );
    }
  }

  report.validation.push({
    check: "workspace-validation",
    ok: true,
    message:
      "Library scan, consolidated validation and skill validation accept the seeded Core.",
  });

  for (const task of [
    "scripts/tasks/test-skills.mjs",
    "scripts/tasks/test-server.mjs",
    "scripts/tasks/test-git.mjs",
    "scripts/tasks/test-validation.mjs",
    "scripts/tasks/test-export.mjs",
    "scripts/tasks/test-resolution.mjs",
    "scripts/tasks/test-library.mjs",
    "scripts/tasks/test-data.mjs",
    "scripts/tasks/test-office.mjs",
    "scripts/tasks/test-files.mjs",
    "scripts/tasks/test-cli.mjs",
    "scripts/tasks/validate.mjs",
  ]) {
    const result = run(
      process.execPath,
      [
        join(
          targetRoot,
          task,
        ),
      ],
      {
        cwd: targetRoot,
        allowFailure: true,
      },
    );

    if (result.status !== 0) {
      throw new Error(
        `Regression command failed (${task}):\n${
          result.stderr ||
          result.stdout
        }`,
      );
    }
  }

  report.validation.push({
    check: "regression",
    ok: true,
    message:
      "Skills, server, Git, validation, export, resolution, library, data, Office, filesystem, CLI and contract tests still pass.",
  });
}

async function checkpoint(
  repoRoot,
  ownedAbsolutePaths,
) {
  const ownedPaths = uniquePaths(
    ownedAbsolutePaths
      .filter((path) =>
        isInside(repoRoot, path),
      )
      .map((path) =>
        relativeGitPath(
          repoRoot,
          path,
        ),
      ),
  );

  if (ownedPaths.length === 0) {
    report.warnings.push({
      code:
        "NO_CHECKPOINT_CHANGES",
      message:
        "The minimal Core library was already present; there were no task-owned changes to commit.",
    });
    return;
  }

  const userName = run(
    "git",
    ["config", "user.name"],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  ).stdout;
  const userEmail = run(
    "git",
    ["config", "user.email"],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  ).stdout;

  if (!userName || !userEmail) {
    report.warnings.push({
      code:
        "GIT_IDENTITY_MISSING",
      message:
        "The minimal Core was created and tested, but no commit was made because Git user.name or user.email is missing.",
    });
    return;
  }

  run(
    "git",
    [
      "add",
      "--",
      ...ownedPaths,
    ],
    { cwd: repoRoot },
  );

  const stagedOwned = run(
    "git",
    [
      "diff",
      "--cached",
      "--name-only",
      "--",
      ...ownedPaths,
    ],
    { cwd: repoRoot },
  ).stdout
    .split("\n")
    .map((value) =>
      value.trim(),
    )
    .filter(Boolean);

  if (stagedOwned.length === 0) {
    report.warnings.push({
      code: "NO_COMMIT_NEEDED",
      message:
        "No task-owned changes remained to commit.",
    });
    return;
  }

  const commitResult = run(
    "git",
    [
      "commit",
      "--only",
      "-m",
      COMMIT_MESSAGE,
      "--",
      ...ownedPaths,
    ],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  );

  if (commitResult.status !== 0) {
    throw new Error(
      `Focused Git commit failed:\n${
        commitResult.stderr ||
        commitResult.stdout
      }`,
    );
  }

  const commitHash = run(
    "git",
    [
      "rev-parse",
      "--short",
      "HEAD",
    ],
    { cwd: repoRoot },
  ).stdout;
  report.git.commit = commitHash;

  if (args.noPush) {
    report.warnings.push({
      code: "PUSH_DISABLED",
      message:
        `Committed locally as ${commitHash}; --no-push prevented remote push.`,
    });
    return;
  }

  const branch = run(
    "git",
    [
      "branch",
      "--show-current",
    ],
    { cwd: repoRoot },
  ).stdout;
  const upstream = run(
    "git",
    [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  );

  let pushResult;

  if (upstream.status === 0) {
    report.git.pushTarget =
      upstream.stdout;
    pushResult = run(
      "git",
      ["push"],
      {
        cwd: repoRoot,
        allowFailure: true,
      },
    );
  } else {
    const remotes = run(
      "git",
      ["remote"],
      {
        cwd: repoRoot,
        allowFailure: true,
      },
    ).stdout
      .split("\n")
      .map((value) =>
        value.trim(),
      )
      .filter(Boolean);

    if (
      !branch ||
      !remotes.includes("origin")
    ) {
      report.warnings.push({
        code: "NO_PUSH_TARGET",
        message:
          `Committed locally as ${commitHash}, but no upstream was configured and origin was unavailable.`,
      });
      return;
    }

    report.git.pushTarget =
      `origin/${branch}`;
    pushResult = run(
      "git",
      [
        "push",
        "-u",
        "origin",
        branch,
      ],
      {
        cwd: repoRoot,
        allowFailure: true,
      },
    );
  }

  if (pushResult.status === 0) {
    report.git.pushed = true;
  } else {
    report.warnings.push({
      code: "PUSH_FAILED",
      message:
        `Committed locally as ${commitHash}, but the push failed safely. ` +
        "No force-push was attempted. " +
        (pushResult.stderr ||
          pushResult.stdout),
    });
  }
}

function getRepositoryRoot(cwd) {
  const result = run(
    "git",
    [
      "rev-parse",
      "--show-toplevel",
    ],
    {
      cwd,
      allowFailure: true,
    },
  );

  return result.status === 0
    ? resolve(result.stdout)
    : null;
}

function getDirtyPaths(repoRoot) {
  const result = run(
    "git",
    [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ],
    { cwd: repoRoot },
  );
  const entries = result.stdout
    ? result.stdout
        .split("\0")
        .filter(Boolean)
    : [];
  const paths = new Set();

  for (
    let index = 0;
    index < entries.length;
    index += 1
  ) {
    const entry = entries[index];

    if (entry.length < 4) {
      continue;
    }

    const statusCode =
      entry.slice(0, 2);
    paths.add(
      normaliseGitPath(
        entry.slice(3),
      ),
    );

    if (
      statusCode.includes("R") ||
      statusCode.includes("C")
    ) {
      const secondPath =
        entries[index + 1];

      if (secondPath) {
        paths.add(
          normaliseGitPath(
            secondPath,
          ),
        );
        index += 1;
      }
    }
  }

  return paths;
}

function run(
  command,
  commandArgs,
  options = {},
) {
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd:
        options.cwd ??
        targetRoot,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      maxBuffer:
        64 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (
    result.status !== 0 &&
    !options.allowFailure
  ) {
    const details = [
      result.stderr,
      result.stdout,
    ]
      .filter(Boolean)
      .map((value) =>
        value.trim(),
      )
      .filter(Boolean)
      .join("\n");

    throw new Error(
      `${command} ${commandArgs.join(" ")} failed with exit code ${result.status}` +
        (details
          ? `:\n${details}`
          : "."),
    );
  }

  return {
    status:
      result.status ?? 1,
    stdout:
      result.stdout?.trim() ?? "",
    stderr:
      result.stderr?.trim() ?? "",
  };
}

async function atomicWrite(
  path,
  content,
) {
  await mkdir(
    dirname(path),
    { recursive: true },
  );
  const temporaryPath =
    `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(
      temporaryPath,
      content,
      "utf8",
    );
    await rename(
      temporaryPath,
      path,
    );
  } finally {
    await rm(
      temporaryPath,
      { force: true },
    ).catch(() => {});
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error?.code === "ENOENT"
    ) {
      return false;
    }

    throw error;
  }
}

function isInside(root, path) {
  const relationship = relative(
    root,
    path,
  );

  return (
    relationship === "" ||
    (!relationship.startsWith("..") &&
      !resolve(path).startsWith(
        `${resolve(root)}..`,
      ))
  );
}

function relativeGitPath(
  repoRoot,
  path,
) {
  return normaliseGitPath(
    relative(repoRoot, path),
  );
}

function normaliseGitPath(path) {
  return path.replaceAll("\\", "/");
}

function uniquePaths(paths) {
  return [...new Set(paths)];
}

function finish(exitCode) {
  if (args.json) {
    console.log(
      JSON.stringify(
        report,
        null,
        2,
      ),
    );
    process.exit(exitCode);
  }

  console.log(
    "\nMy Dashboards — minimal Core library\n",
  );
  console.log(
    `Target: ${report.targetRoot}`,
  );
  console.log(
    `Result: ${
      report.ok
        ? "PASS"
        : "FAIL"
    }`,
  );
  console.log(
    `Mode: ${
      report.dryRun
        ? "dry-run"
        : "write"
    }`,
  );

  printSection(
    "Created",
    report.created,
  );
  printSection(
    "Updated",
    report.updated,
  );
  printSection(
    "Removed",
    report.removed,
  );
  printSection(
    "Preserved",
    report.preserved,
  );

  console.log("\nWorkspace defaults:");
  console.log(
    `  Theme: ${
      report.defaults.theme ??
      "(none)"
    }`,
  );
  console.log(
    `  Preset: ${
      report.defaults.preset ??
      "(none)"
    }`,
  );
  console.log(
    `  Changed: ${
      report.defaults.changed
        ? "yes"
        : "no"
    }`,
  );

  if (
    report.validation.length > 0
  ) {
    console.log("\nValidation:");

    for (
      const item of report.validation
    ) {
      console.log(
        `  ${
          item.ok ? "✓" : "✗"
        } ${item.message}`,
      );
    }
  }

  console.log("\nGit:");
  console.log(
    `  Commit: ${
      report.git.commit ?? "none"
    }`,
  );
  console.log(
    `  Pushed: ${
      report.git.pushed
        ? "yes"
        : "no"
    }`,
  );

  if (
    report.git.pushTarget
  ) {
    console.log(
      `  Push target: ${report.git.pushTarget}`,
    );
  }

  if (
    report.warnings.length > 0
  ) {
    console.log("\nWarnings:");

    for (
      const warning of report.warnings
    ) {
      console.log(
        `  ! ${warning.message}`,
      );
    }
  }

  console.log("");
  process.exit(exitCode);
}

function printSection(
  title,
  items,
) {
  console.log(`\n${title}:`);

  if (items.length === 0) {
    console.log("  none");
    return;
  }

  for (const item of items) {
    console.log(`  ${item}`);
  }
}
