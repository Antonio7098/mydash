#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 17: Add the reference dashboard
 *
 * Adds the first real artefact:
 *
 *   dashboard:ai-use-case-governance
 *
 * The dashboard consumes the complete minimal Core and owns one local pipeline
 * component. It uses representative sample data and validates as one standalone
 * HTML file.
 *
 * Usage:
 *   node scripts/17-add-reference-dashboard.mjs
 *   node scripts/17-add-reference-dashboard.mjs --dry-run
 *   node scripts/17-add-reference-dashboard.mjs --no-commit
 *   node scripts/17-add-reference-dashboard.mjs --no-push
 *   node scripts/17-add-reference-dashboard.mjs --json
 *   node scripts/17-add-reference-dashboard.mjs --target /path/to/my-dashboards
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
  "17-add-reference-dashboard";
const COMMIT_MESSAGE =
  "Add the reference governance dashboard";
const MIN_NODE_MAJOR = 20;
const FILES = {"src/workspace/capabilities.mjs": {"content": "export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"artifact.reference-dashboard\",\n        title: \"Reference governance dashboard\",\n        available: true,\n        artifactId: \"ai-use-case-governance\",\n        artifactKind: \"dashboard\",\n        standaloneExport: true,\n      },\n      {\n        id: \"library.minimal-core\",\n        title: \"Minimal reusable Core library\",\n        available: true,\n        resourceCount: 8,\n        defaultTheme: \"hsbc-light\",\n        defaultPreset: \"default\",\n        brandAsset: \"mydash-brand-mark\",\n      },\n      {\n        id: \"agent.skills\",\n        title: \"Project agent skills\",\n        available: true,\n        logicalSkillCount: 9,\n        commandCount: 10,\n        activeDirectory: \".claude/skills\",\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n", "allowedPrevious": ["export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"library.minimal-core\",\n        title: \"Minimal reusable Core library\",\n        available: true,\n        resourceCount: 8,\n        defaultTheme: \"hsbc-light\",\n        defaultPreset: \"default\",\n        brandAsset: \"mydash-brand-mark\",\n      },\n      {\n        id: \"agent.skills\",\n        title: \"Project agent skills\",\n        available: true,\n        logicalSkillCount: 9,\n        commandCount: 10,\n        activeDirectory: \".claude/skills\",\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n"]}, "library/dashboards/ai-use-case-governance/artifact.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"dashboard\",\n  \"id\": \"ai-use-case-governance\",\n  \"title\": \"AI Use Case Governance\",\n  \"description\": \"Reference dashboard for understanding AI use-case progress, review backlog, risk and next actions.\",\n  \"owner\": \"My Dashboards\",\n  \"entry\": \"src/index.html\",\n  \"data\": [\n    \"data/use-cases.json\"\n  ],\n  \"tags\": [\n    \"reference\",\n    \"governance\",\n    \"ai-use-cases\",\n    \"operations\"\n  ],\n  \"appearance\": {\n    \"theme\": \"hsbc-light\",\n    \"preset\": \"default\",\n    \"overrides\": {\n      \"layout\": null,\n      \"components\": {\n        \"governance-pipeline\": \"governance-pipeline\"\n      },\n      \"primitives\": {},\n      \"assets\": {}\n    }\n  },\n  \"export\": {\n    \"fileName\": \"ai-use-case-governance.html\"\n  }\n}\n"}, "library/dashboards/ai-use-case-governance/README.md": {"content": "# AI Use Case Governance\n\nThis is the first real My Dashboards artefact and the reference implementation\nfor the source-to-preview-to-standalone-export path.\n\n## Purpose\n\nIt answers four operational questions:\n\n1. How many use cases are in the portfolio?\n2. Where is governance work accumulating?\n3. Which items require attention?\n4. What is the next action?\n\nThe included portfolio is representative sample data. It does not describe a\nreal organisation or approval state.\n\n## Appearance\n\nThe artefact consumes the complete minimal Core:\n\n```text\nhsbc-light\ndefault\ndashboard-shell\nmetric-card\nsection-heading\nbutton\nstatus-badge\nmydash-brand-mark\n```\n\nIt owns one local component:\n\n```text\ngovernance-pipeline\n```\n\nThe pipeline remains local because it has one demonstrated consumer.\n\n## Preview\n\n```bash\nnpm start\n```\n\nThen open:\n\n```text\nhttp://127.0.0.1:4173/api/artifacts/dashboard/ai-use-case-governance/preview\n```\n\n## Validate and export\n\n```bash\nnpm run mydash -- artifact validate ai-use-case-governance --kind dashboard\n\nnpm run mydash -- artifact export ai-use-case-governance \\\n  --kind dashboard\n```\n\nThe exported file works directly through `file://`.\n"}, "library/dashboards/ai-use-case-governance/src/index.html": {"content": "<!doctype html>\n<html lang=\"en-GB\">\n  <head>\n    <meta charset=\"utf-8\">\n    <meta\n      name=\"viewport\"\n      content=\"width=device-width, initial-scale=1\"\n    >\n    <meta\n      name=\"description\"\n      content=\"Reference dashboard for AI use-case governance progress, review backlog, risk and next actions.\"\n    >\n    <title>AI Use Case Governance</title>\n    <link rel=\"stylesheet\" href=\"./styles.css\">\n  </head>\n  <body>\n    <div class=\"mydash-shell\">\n      <header class=\"mydash-shell__header dashboard-header\">\n        <a class=\"mydash-shell__brand\" href=\"#main-content\">\n          <img\n            data-mydash-asset=\"brand-logo\"\n            alt=\"My Dashboards\"\n          >\n        </a>\n\n        <div class=\"dashboard-header__context\">\n          <span class=\"mydash-status\" data-tone=\"information\">\n            Reference artefact\n          </span>\n          <a\n            class=\"mydash-button\"\n            data-variant=\"quiet\"\n            data-size=\"small\"\n            href=\"#data-note\"\n          >\n            About the data\n          </a>\n        </div>\n      </header>\n\n      <main class=\"mydash-shell__main\" id=\"main-content\">\n        <section class=\"dashboard-intro\" aria-labelledby=\"dashboard-title\">\n          <div>\n            <p class=\"dashboard-intro__eyebrow\">\n              Group AI commercialisation\n            </p>\n            <h1 id=\"dashboard-title\">AI Use Case Governance</h1>\n            <p class=\"dashboard-intro__summary\">\n              A decision-focused view of portfolio progress, review bottlenecks,\n              delivery risk and the next action required.\n            </p>\n          </div>\n\n          <dl class=\"dashboard-intro__meta\">\n            <div>\n              <dt>Data date</dt>\n              <dd id=\"data-date\">Loading…</dd>\n            </div>\n            <div>\n              <dt>Portfolio</dt>\n              <dd>Representative sample</dd>\n            </div>\n          </dl>\n        </section>\n\n        <section aria-labelledby=\"portfolio-heading\">\n          <header class=\"mydash-section-heading\">\n            <div class=\"mydash-section-heading__copy\">\n              <h2\n                class=\"mydash-section-heading__title\"\n                id=\"portfolio-heading\"\n              >\n                Portfolio at a glance\n              </h2>\n              <p class=\"mydash-section-heading__supporting\">\n                Current volume, governance pressure and delivery risk.\n              </p>\n            </div>\n          </header>\n\n          <div\n            class=\"mydash-grid mydash-grid--metrics\"\n            id=\"metric-grid\"\n            aria-live=\"polite\"\n          >\n            <article class=\"mydash-metric-card\">\n              <p class=\"mydash-metric-card__label\">Loading portfolio</p>\n              <p class=\"mydash-metric-card__value\">—</p>\n              <p class=\"mydash-metric-card__detail\">\n                Preparing representative data\n              </p>\n            </article>\n          </div>\n        </section>\n\n        <section\n          class=\"dashboard-section\"\n          aria-labelledby=\"pipeline-heading\"\n        >\n          <header class=\"mydash-section-heading\">\n            <div class=\"mydash-section-heading__copy\">\n              <h2\n                class=\"mydash-section-heading__title\"\n                id=\"pipeline-heading\"\n              >\n                Governance pipeline\n              </h2>\n              <p class=\"mydash-section-heading__supporting\">\n                Where use cases currently sit in the journey from intake to\n                production.\n              </p>\n            </div>\n          </header>\n\n          <div\n            class=\"governance-pipeline\"\n            id=\"pipeline\"\n            data-density=\"comfortable\"\n            aria-live=\"polite\"\n          ></div>\n        </section>\n\n        <section\n          class=\"dashboard-section\"\n          aria-labelledby=\"queue-heading\"\n        >\n          <header class=\"mydash-section-heading\">\n            <div class=\"mydash-section-heading__copy\">\n              <h2\n                class=\"mydash-section-heading__title\"\n                id=\"queue-heading\"\n              >\n                Governance work queue\n              </h2>\n              <p class=\"mydash-section-heading__supporting\">\n                High-risk and long-running items appear first.\n              </p>\n            </div>\n            <div class=\"mydash-section-heading__action\">\n              <button\n                class=\"mydash-button\"\n                data-variant=\"secondary\"\n                data-size=\"small\"\n                id=\"reset-filters\"\n                type=\"button\"\n              >\n                Reset filters\n              </button>\n            </div>\n          </header>\n\n          <form class=\"dashboard-filters\" id=\"filters\">\n            <label>\n              <span>Search</span>\n              <input\n                id=\"search-filter\"\n                name=\"search\"\n                type=\"search\"\n                placeholder=\"ID, use case, area or owner\"\n                autocomplete=\"off\"\n              >\n            </label>\n\n            <label>\n              <span>Stage</span>\n              <select id=\"stage-filter\" name=\"stage\">\n                <option value=\"\">All stages</option>\n              </select>\n            </label>\n\n            <label>\n              <span>Owner</span>\n              <select id=\"owner-filter\" name=\"owner\">\n                <option value=\"\">All owners</option>\n              </select>\n            </label>\n          </form>\n\n          <p class=\"dashboard-results\" id=\"result-count\" aria-live=\"polite\">\n            Loading work queue…\n          </p>\n\n          <div\n            class=\"dashboard-table-wrap\"\n            role=\"region\"\n            aria-labelledby=\"queue-heading\"\n            tabindex=\"0\"\n          >\n            <table class=\"dashboard-table\">\n              <thead>\n                <tr>\n                  <th scope=\"col\">Use case</th>\n                  <th scope=\"col\">Stage</th>\n                  <th scope=\"col\">Risk</th>\n                  <th scope=\"col\">Reviews</th>\n                  <th scope=\"col\">Days here</th>\n                  <th scope=\"col\">Next action</th>\n                </tr>\n              </thead>\n              <tbody id=\"queue-body\"></tbody>\n            </table>\n          </div>\n\n          <div class=\"dashboard-empty\" id=\"empty-state\" hidden>\n            <h3>No matching use cases</h3>\n            <p>Change or reset the filters to restore the work queue.</p>\n          </div>\n        </section>\n\n        <aside class=\"dashboard-note\" id=\"data-note\">\n          <div>\n            <h2>About this reference dashboard</h2>\n            <p id=\"data-notice\">\n              This artefact uses representative sample data.\n            </p>\n          </div>\n          <p>\n            It demonstrates the minimal Core theme, preset, layout, components,\n            primitives and project fallback brand asset. The pipeline is local\n            because it has only one real consumer.\n          </p>\n        </aside>\n      </main>\n    </div>\n\n    <noscript>\n      <p class=\"dashboard-noscript\">\n        JavaScript is required to render this interactive reference dashboard.\n      </p>\n    </noscript>\n\n    <script type=\"module\" src=\"./main.js\"></script>\n  </body>\n</html>\n"}, "library/dashboards/ai-use-case-governance/src/styles.css": {"content": ":root {\n  color-scheme: light;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nhtml {\n  scroll-behavior: smooth;\n}\n\nbody {\n  min-height: 100vh;\n}\n\nbutton,\ninput,\nselect {\n  font: inherit;\n}\n\n.dashboard-header__context {\n  display: flex;\n  align-items: center;\n  gap: var(--space-3);\n}\n\n.dashboard-intro {\n  display: grid;\n  grid-template-columns: minmax(0, 1.6fr) minmax(16rem, 0.6fr);\n  gap: clamp(var(--space-5), 5vw, var(--space-7));\n  align-items: end;\n  margin-bottom: var(--space-7);\n  padding: clamp(var(--space-5), 5vw, var(--space-7));\n  border-left: 0.4rem solid var(--colour-primary);\n  border-radius: 0 var(--radius-lg) var(--radius-lg) 0;\n  background:\n    linear-gradient(\n      105deg,\n      var(--colour-primary-soft),\n      var(--colour-surface) 58%\n    );\n}\n\n.dashboard-intro__eyebrow {\n  margin: 0 0 var(--space-3);\n  color: var(--colour-primary);\n  font-size: var(--font-size-xs);\n  font-weight: var(--font-weight-bold);\n  letter-spacing: 0.12em;\n  text-transform: uppercase;\n}\n\n.dashboard-intro h1 {\n  max-width: 18ch;\n  margin: 0;\n  color: var(--colour-text);\n  font-size: clamp(2.25rem, 7vw, 4.75rem);\n  font-weight: var(--font-weight-bold);\n  letter-spacing: -0.055em;\n  line-height: 0.98;\n}\n\n.dashboard-intro__summary {\n  max-width: 62ch;\n  margin: var(--space-4) 0 0;\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-lg);\n}\n\n.dashboard-intro__meta {\n  display: grid;\n  gap: var(--space-4);\n  margin: 0;\n  padding: var(--space-5);\n  border: 1px solid var(--colour-border);\n  border-radius: var(--radius-lg);\n  background: color-mix(in srgb, var(--colour-surface) 92%, transparent);\n  box-shadow: var(--shadow-sm);\n}\n\n.dashboard-intro__meta div {\n  display: grid;\n  gap: var(--space-1);\n}\n\n.dashboard-intro__meta div + div {\n  padding-top: var(--space-4);\n  border-top: 1px solid var(--colour-border);\n}\n\n.dashboard-intro__meta dt {\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-xs);\n  font-weight: var(--font-weight-medium);\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.dashboard-intro__meta dd {\n  margin: 0;\n  color: var(--colour-text);\n  font-weight: var(--font-weight-bold);\n}\n\n.dashboard-section {\n  margin-top: var(--space-7);\n}\n\n.dashboard-filters {\n  display: grid;\n  grid-template-columns: minmax(16rem, 1.6fr) repeat(2, minmax(11rem, 0.7fr));\n  gap: var(--space-4);\n  margin-bottom: var(--space-4);\n  padding: var(--space-5);\n  border: 1px solid var(--colour-border);\n  border-radius: var(--radius-lg);\n  background: var(--colour-surface-subtle);\n}\n\n.dashboard-filters label {\n  display: grid;\n  gap: var(--space-2);\n  min-width: 0;\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-sm);\n  font-weight: var(--font-weight-medium);\n}\n\n.dashboard-filters input,\n.dashboard-filters select {\n  width: 100%;\n  min-height: 2.75rem;\n  padding: 0.6rem 0.75rem;\n  border: 1px solid var(--colour-border-strong);\n  border-radius: var(--radius-sm);\n  color: var(--colour-text);\n  background: var(--colour-surface);\n}\n\n.dashboard-filters input:focus,\n.dashboard-filters select:focus {\n  border-color: var(--colour-focus);\n  outline: 3px solid color-mix(in srgb, var(--colour-focus) 25%, transparent);\n  outline-offset: 1px;\n}\n\n.dashboard-results {\n  margin: 0 0 var(--space-3);\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-sm);\n}\n\n.dashboard-table-wrap {\n  overflow-x: auto;\n  border: 1px solid var(--colour-border);\n  border-radius: var(--radius-lg);\n  background: var(--colour-surface);\n  box-shadow: var(--shadow-sm);\n}\n\n.dashboard-table-wrap:focus-visible {\n  outline: 3px solid color-mix(in srgb, var(--colour-focus) 25%, transparent);\n  outline-offset: 2px;\n}\n\n.dashboard-table {\n  width: 100%;\n  min-width: 68rem;\n  border-collapse: collapse;\n}\n\n.dashboard-table th,\n.dashboard-table td {\n  padding: var(--space-4);\n  border-bottom: 1px solid var(--colour-border);\n  text-align: left;\n  vertical-align: top;\n}\n\n.dashboard-table th {\n  color: var(--colour-text-muted);\n  background: var(--colour-surface-subtle);\n  font-size: var(--font-size-xs);\n  font-weight: var(--font-weight-bold);\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.dashboard-table tbody tr:last-child td {\n  border-bottom: 0;\n}\n\n.dashboard-table tbody tr:hover {\n  background: color-mix(\n    in srgb,\n    var(--colour-primary-soft) 45%,\n    var(--colour-surface)\n  );\n}\n\n.dashboard-use-case {\n  display: grid;\n  gap: var(--space-1);\n  min-width: 14rem;\n}\n\n.dashboard-use-case strong {\n  color: var(--colour-text);\n}\n\n.dashboard-use-case span {\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-xs);\n}\n\n.dashboard-review-progress {\n  display: grid;\n  gap: var(--space-2);\n  min-width: 7rem;\n}\n\n.dashboard-review-progress progress {\n  width: 100%;\n  height: 0.45rem;\n  overflow: hidden;\n  border: 0;\n  border-radius: 999px;\n  background: var(--colour-border);\n}\n\n.dashboard-review-progress progress::-webkit-progress-bar {\n  background: var(--colour-border);\n}\n\n.dashboard-review-progress progress::-webkit-progress-value {\n  background: var(--colour-primary);\n}\n\n.dashboard-review-progress progress::-moz-progress-bar {\n  background: var(--colour-primary);\n}\n\n.dashboard-review-progress span {\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-xs);\n}\n\n.dashboard-next-action {\n  max-width: 28rem;\n  color: var(--colour-text);\n}\n\n.dashboard-next-action small {\n  display: block;\n  margin-top: var(--space-2);\n  color: var(--colour-text-muted);\n}\n\n.dashboard-empty {\n  margin-top: var(--space-4);\n  padding: var(--space-6);\n  border: 1px dashed var(--colour-border-strong);\n  border-radius: var(--radius-lg);\n  text-align: center;\n  background: var(--colour-surface-subtle);\n}\n\n.dashboard-empty h3,\n.dashboard-empty p {\n  margin: 0;\n}\n\n.dashboard-empty p {\n  margin-top: var(--space-2);\n  color: var(--colour-text-muted);\n}\n\n.dashboard-note {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  gap: var(--space-6);\n  margin-top: var(--space-7);\n  padding: var(--space-6);\n  border-top: 3px solid var(--colour-primary);\n  border-radius: var(--radius-lg);\n  background: var(--colour-surface-subtle);\n}\n\n.dashboard-note h2,\n.dashboard-note p {\n  margin: 0;\n}\n\n.dashboard-note h2 {\n  font-size: var(--font-size-lg);\n}\n\n.dashboard-note p {\n  color: var(--colour-text-muted);\n}\n\n.dashboard-note h2 + p {\n  margin-top: var(--space-2);\n}\n\n.dashboard-noscript {\n  margin: var(--space-5);\n  padding: var(--space-4);\n  border: 1px solid var(--colour-critical);\n  color: var(--colour-critical);\n  background: var(--colour-critical-soft);\n}\n\n@media (max-width: 60rem) {\n  .dashboard-intro,\n  .dashboard-note {\n    grid-template-columns: 1fr;\n  }\n\n  .dashboard-intro__meta {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n\n  .dashboard-intro__meta div + div {\n    padding-top: 0;\n    padding-left: var(--space-4);\n    border-top: 0;\n    border-left: 1px solid var(--colour-border);\n  }\n\n  .dashboard-filters {\n    grid-template-columns: 1fr 1fr;\n  }\n\n  .dashboard-filters label:first-child {\n    grid-column: 1 / -1;\n  }\n}\n\n@media (max-width: 40rem) {\n  html {\n    scroll-behavior: auto;\n  }\n\n  .dashboard-header__context {\n    width: 100%;\n    justify-content: space-between;\n  }\n\n  .dashboard-intro {\n    padding: var(--space-5);\n  }\n\n  .dashboard-intro h1 {\n    font-size: clamp(2.1rem, 16vw, 3.5rem);\n  }\n\n  .dashboard-intro__summary {\n    font-size: var(--font-size-md);\n  }\n\n  .dashboard-intro__meta,\n  .dashboard-filters,\n  .dashboard-note {\n    grid-template-columns: 1fr;\n  }\n\n  .dashboard-intro__meta div + div {\n    padding-top: var(--space-4);\n    padding-left: 0;\n    border-top: 1px solid var(--colour-border);\n    border-left: 0;\n  }\n\n  .dashboard-filters label:first-child {\n    grid-column: auto;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  html {\n    scroll-behavior: auto;\n  }\n}\n\n.dashboard-cell-detail {\n  display: block;\n  margin-top: var(--space-2);\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-xs);\n}\n"}, "library/dashboards/ai-use-case-governance/src/model.js": {"content": "export const GOVERNANCE_STAGES = Object.freeze([\n  {\n    id: \"intake\",\n    label: \"Intake\",\n    description: \"Scope, users and benefit\",\n  },\n  {\n    id: \"reviews\",\n    label: \"Control reviews\",\n    description: \"Data, cyber, cloud and model risk\",\n  },\n  {\n    id: \"committee\",\n    label: \"Committee\",\n    description: \"Decision and evidence\",\n  },\n  {\n    id: \"pilot\",\n    label: \"Pilot\",\n    description: \"Controlled adoption and measurement\",\n  },\n  {\n    id: \"production\",\n    label: \"Production\",\n    description: \"Live controls and benefit tracking\",\n  },\n]);\n\nconst RISK_ORDER = {\n  High: 0,\n  Medium: 1,\n  Low: 2,\n};\n\nexport function normalisePortfolio(payload) {\n  if (\n    !payload ||\n    typeof payload !== \"object\" ||\n    !Array.isArray(payload.useCases)\n  ) {\n    throw new TypeError(\n      \"Portfolio data must contain a useCases array.\",\n    );\n  }\n\n  return {\n    schemaVersion: payload.schemaVersion ?? 1,\n    asOf: requireDate(payload.asOf, \"asOf\"),\n    notice:\n      typeof payload.notice === \"string\"\n        ? payload.notice\n        : \"\",\n    useCases: payload.useCases.map(\n      normaliseUseCase,\n    ),\n  };\n}\n\nexport function calculateSummary(useCases) {\n  const total = useCases.length;\n  const reviewBacklog = useCases.filter(\n    (item) => item.stage === \"reviews\",\n  ).length;\n  const approvedForPilot = useCases.filter(\n    (item) =>\n      item.status ===\n      \"Approved for pilot\",\n  ).length;\n  const atRisk = useCases.filter(\n    (item) => item.risk === \"High\",\n  ).length;\n  const completedReviews = useCases.reduce(\n    (sum, item) =>\n      sum + item.reviews.complete,\n    0,\n  );\n  const totalReviews = useCases.reduce(\n    (sum, item) =>\n      sum + item.reviews.total,\n    0,\n  );\n  const reviewCompletion =\n    totalReviews === 0\n      ? 0\n      : Math.round(\n          (completedReviews /\n            totalReviews) *\n            100,\n        );\n\n  return {\n    total,\n    reviewBacklog,\n    approvedForPilot,\n    atRisk,\n    reviewCompletion,\n  };\n}\n\nexport function countByStage(useCases) {\n  const counts = Object.fromEntries(\n    GOVERNANCE_STAGES.map(\n      (stage) => [stage.id, 0],\n    ),\n  );\n\n  for (const item of useCases) {\n    if (Object.hasOwn(counts, item.stage)) {\n      counts[item.stage] += 1;\n    }\n  }\n\n  return GOVERNANCE_STAGES.map(\n    (stage) => ({\n      ...stage,\n      count: counts[stage.id],\n    }),\n  );\n}\n\nexport function filterUseCases(\n  useCases,\n  filters = {},\n) {\n  const search = String(\n    filters.search ?? \"\",\n  )\n    .trim()\n    .toLocaleLowerCase(\"en-GB\");\n  const stage = String(\n    filters.stage ?? \"\",\n  );\n  const owner = String(\n    filters.owner ?? \"\",\n  );\n\n  return useCases\n    .filter((item) => {\n      if (\n        stage &&\n        item.stage !== stage\n      ) {\n        return false;\n      }\n\n      if (\n        owner &&\n        item.owner !== owner\n      ) {\n        return false;\n      }\n\n      if (!search) return true;\n\n      return [\n        item.id,\n        item.title,\n        item.area,\n        item.owner,\n        item.status,\n      ].some((value) =>\n        value\n          .toLocaleLowerCase(\"en-GB\")\n          .includes(search),\n      );\n    })\n    .sort(compareWorkQueue);\n}\n\nexport function owners(useCases) {\n  return [\n    ...new Set(\n      useCases.map(\n        (item) => item.owner,\n      ),\n    ),\n  ].sort((left, right) =>\n    left.localeCompare(\n      right,\n      \"en-GB\",\n    ),\n  );\n}\n\nexport function stageLabel(stageId) {\n  return (\n    GOVERNANCE_STAGES.find(\n      (stage) =>\n        stage.id === stageId,\n    )?.label ?? stageId\n  );\n}\n\nexport function statusTone(status) {\n  if (\n    status === \"Production\" ||\n    status === \"Approved for pilot\"\n  ) {\n    return \"positive\";\n  }\n\n  if (\n    /requested|review/i.test(status)\n  ) {\n    return \"warning\";\n  }\n\n  if (/scheduled/i.test(status)) {\n    return \"information\";\n  }\n\n  return \"neutral\";\n}\n\nexport function riskTone(risk) {\n  return {\n    High: \"critical\",\n    Medium: \"warning\",\n    Low: \"positive\",\n  }[risk] ?? \"neutral\";\n}\n\nexport function formatDate(\n  value,\n) {\n  const date = new Date(\n    `${requireDate(value, \"date\")}T00:00:00Z`,\n  );\n\n  return new Intl.DateTimeFormat(\n    \"en-GB\",\n    {\n      day: \"numeric\",\n      month: \"short\",\n      year: \"numeric\",\n      timeZone: \"UTC\",\n    },\n  ).format(date);\n}\n\nfunction normaliseUseCase(\n  item,\n  index,\n) {\n  if (\n    !item ||\n    typeof item !== \"object\"\n  ) {\n    throw new TypeError(\n      `Use case at index ${index} must be an object.`,\n    );\n  }\n\n  const stage = requireString(\n    item.stage,\n    `useCases[${index}].stage`,\n  );\n\n  if (\n    !GOVERNANCE_STAGES.some(\n      (candidate) =>\n        candidate.id === stage,\n    )\n  ) {\n    throw new TypeError(\n      `Use case ${item.id ?? index} has unknown stage ${stage}.`,\n    );\n  }\n\n  const complete = requireInteger(\n    item.reviews?.complete,\n    `useCases[${index}].reviews.complete`,\n  );\n  const total = requireInteger(\n    item.reviews?.total,\n    `useCases[${index}].reviews.total`,\n  );\n\n  if (\n    complete < 0 ||\n    total < 0 ||\n    complete > total\n  ) {\n    throw new TypeError(\n      `Use case ${item.id ?? index} has invalid review progress.`,\n    );\n  }\n\n  return {\n    id: requireString(\n      item.id,\n      `useCases[${index}].id`,\n    ),\n    title: requireString(\n      item.title,\n      `useCases[${index}].title`,\n    ),\n    area: requireString(\n      item.area,\n      `useCases[${index}].area`,\n    ),\n    owner: requireString(\n      item.owner,\n      `useCases[${index}].owner`,\n    ),\n    stage,\n    status: requireString(\n      item.status,\n      `useCases[${index}].status`,\n    ),\n    risk: requireString(\n      item.risk,\n      `useCases[${index}].risk`,\n    ),\n    daysInStage: requireInteger(\n      item.daysInStage,\n      `useCases[${index}].daysInStage`,\n    ),\n    reviews: {\n      complete,\n      total,\n    },\n    nextAction: requireString(\n      item.nextAction,\n      `useCases[${index}].nextAction`,\n    ),\n    updatedAt: requireDate(\n      item.updatedAt,\n      `useCases[${index}].updatedAt`,\n    ),\n    targetDate: requireDate(\n      item.targetDate,\n      `useCases[${index}].targetDate`,\n    ),\n  };\n}\n\nfunction compareWorkQueue(\n  left,\n  right,\n) {\n  return (\n    (RISK_ORDER[left.risk] ?? 9) -\n      (RISK_ORDER[right.risk] ?? 9) ||\n    right.daysInStage -\n      left.daysInStage ||\n    left.id.localeCompare(\n      right.id,\n      \"en-GB\",\n    )\n  );\n}\n\nfunction requireString(\n  value,\n  label,\n) {\n  if (\n    typeof value !== \"string\" ||\n    !value.trim()\n  ) {\n    throw new TypeError(\n      `${label} must be a non-empty string.`,\n    );\n  }\n\n  return value.trim();\n}\n\nfunction requireInteger(\n  value,\n  label,\n) {\n  if (!Number.isInteger(value)) {\n    throw new TypeError(\n      `${label} must be an integer.`,\n    );\n  }\n\n  return value;\n}\n\nfunction requireDate(\n  value,\n  label,\n) {\n  const result = requireString(\n    value,\n    label,\n  );\n\n  if (\n    !/^\\d{4}-\\d{2}-\\d{2}$/.test(\n      result,\n    ) ||\n    Number.isNaN(\n      Date.parse(`${result}T00:00:00Z`),\n    )\n  ) {\n    throw new TypeError(\n      `${label} must be an ISO date.`,\n    );\n  }\n\n  return result;\n}\n"}, "library/dashboards/ai-use-case-governance/src/main.js": {"content": "import {\n  GOVERNANCE_STAGES,\n  calculateSummary,\n  countByStage,\n  filterUseCases,\n  formatDate,\n  normalisePortfolio,\n  owners,\n  riskTone,\n  stageLabel,\n  statusTone,\n} from \"./model.js\";\n\nconst elements = {\n  dataDate:\n    document.querySelector(\"#data-date\"),\n  dataNotice:\n    document.querySelector(\"#data-notice\"),\n  metricGrid:\n    document.querySelector(\"#metric-grid\"),\n  pipeline:\n    document.querySelector(\"#pipeline\"),\n  filters:\n    document.querySelector(\"#filters\"),\n  search:\n    document.querySelector(\"#search-filter\"),\n  stage:\n    document.querySelector(\"#stage-filter\"),\n  owner:\n    document.querySelector(\"#owner-filter\"),\n  reset:\n    document.querySelector(\"#reset-filters\"),\n  resultCount:\n    document.querySelector(\"#result-count\"),\n  queueBody:\n    document.querySelector(\"#queue-body\"),\n  emptyState:\n    document.querySelector(\"#empty-state\"),\n};\n\ninitialise().catch(renderFailure);\n\nasync function initialise() {\n  const response = await fetch(\n    \"../data/use-cases.json\",\n  );\n\n  if (!response.ok) {\n    throw new Error(\n      `Portfolio data could not be loaded (${response.status}).`,\n    );\n  }\n\n  const portfolio =\n    normalisePortfolio(\n      await response.json(),\n    );\n\n  elements.dataDate.textContent =\n    formatDate(portfolio.asOf);\n  elements.dataNotice.textContent =\n    portfolio.notice;\n\n  populateFilters(\n    portfolio.useCases,\n  );\n  renderSummary(\n    portfolio.useCases,\n  );\n  renderPipeline(\n    portfolio.useCases,\n  );\n  renderQueue(\n    portfolio.useCases,\n  );\n\n  elements.filters.addEventListener(\n    \"input\",\n    () =>\n      renderQueue(\n        portfolio.useCases,\n      ),\n  );\n  elements.filters.addEventListener(\n    \"change\",\n    () =>\n      renderQueue(\n        portfolio.useCases,\n      ),\n  );\n  elements.reset.addEventListener(\n    \"click\",\n    () => {\n      elements.filters.reset();\n      renderQueue(\n        portfolio.useCases,\n      );\n      elements.search.focus();\n    },\n  );\n\n  document.documentElement.dataset\n    .dashboardReady = \"true\";\n}\n\nfunction populateFilters(useCases) {\n  for (\n    const stage of GOVERNANCE_STAGES\n  ) {\n    elements.stage.append(\n      option(\n        stage.id,\n        stage.label,\n      ),\n    );\n  }\n\n  for (const owner of owners(useCases)) {\n    elements.owner.append(\n      option(owner, owner),\n    );\n  }\n}\n\nfunction renderSummary(useCases) {\n  const summary =\n    calculateSummary(useCases);\n  const metrics = [\n    {\n      label: \"Portfolio total\",\n      value: String(summary.total),\n      detail:\n        `${summary.reviewCompletion}% of required reviews complete`,\n      tone: \"neutral\",\n    },\n    {\n      label: \"Review backlog\",\n      value: String(\n        summary.reviewBacklog,\n      ),\n      detail:\n        \"Use cases currently in control review\",\n      tone:\n        summary.reviewBacklog > 3\n          ? \"warning\"\n          : \"neutral\",\n    },\n    {\n      label: \"Approved for pilot\",\n      value: String(\n        summary.approvedForPilot,\n      ),\n      detail:\n        \"Ready for controlled adoption\",\n      tone: \"positive\",\n    },\n    {\n      label: \"High risk\",\n      value: String(summary.atRisk),\n      detail:\n        \"Items requiring active attention\",\n      tone:\n        summary.atRisk > 0\n          ? \"critical\"\n          : \"neutral\",\n    },\n  ];\n\n  elements.metricGrid.replaceChildren(\n    ...metrics.map(metricCard),\n  );\n}\n\nfunction renderPipeline(useCases) {\n  const stages =\n    countByStage(useCases);\n  const maximum = Math.max(\n    1,\n    ...stages.map(\n      (stage) => stage.count,\n    ),\n  );\n\n  elements.pipeline.replaceChildren(\n    ...stages.map(\n      (stage, index) => {\n        const card = element(\n          \"article\",\n          \"governance-pipeline__stage\",\n        );\n        const topline = element(\n          \"div\",\n          \"governance-pipeline__topline\",\n        );\n        const position = element(\n          \"span\",\n          \"governance-pipeline__index\",\n          `0${index + 1}`,\n        );\n        const status = element(\n          \"span\",\n          \"mydash-status\",\n          `${stage.count} active`,\n        );\n        status.dataset.tone =\n          stage.count === maximum\n            ? \"warning\"\n            : \"neutral\";\n        topline.append(\n          position,\n          status,\n        );\n\n        const copy = element(\"div\");\n        copy.append(\n          element(\n            \"p\",\n            \"governance-pipeline__count\",\n            String(stage.count),\n          ),\n          element(\n            \"h3\",\n            \"governance-pipeline__label\",\n            stage.label,\n          ),\n          element(\n            \"p\",\n            \"governance-pipeline__description\",\n            stage.description,\n          ),\n        );\n\n        const bar = element(\n          \"div\",\n          \"governance-pipeline__bar\",\n        );\n        const fill = element(\"span\");\n        fill.style.width =\n          `${Math.max(\n            stage.count === 0\n              ? 0\n              : 8,\n            Math.round(\n              (stage.count /\n                maximum) *\n                100,\n            ),\n          )}%`;\n        bar.append(fill);\n\n        card.append(\n          topline,\n          copy,\n          bar,\n        );\n\n        return card;\n      },\n    ),\n  );\n}\n\nfunction renderQueue(useCases) {\n  const filtered = filterUseCases(\n    useCases,\n    {\n      search:\n        elements.search.value,\n      stage:\n        elements.stage.value,\n      owner:\n        elements.owner.value,\n    },\n  );\n\n  elements.resultCount.textContent =\n    `${filtered.length} of ${useCases.length} use cases shown`;\n  elements.queueBody.replaceChildren(\n    ...filtered.map(queueRow),\n  );\n  elements.emptyState.hidden =\n    filtered.length > 0;\n  elements.queueBody.closest(\n    \".dashboard-table-wrap\",\n  ).hidden =\n    filtered.length === 0;\n}\n\nfunction metricCard(metric) {\n  const card = element(\n    \"article\",\n    \"mydash-metric-card\",\n  );\n\n  if (metric.tone !== \"neutral\") {\n    card.dataset.tone =\n      metric.tone;\n  }\n\n  card.append(\n    element(\n      \"p\",\n      \"mydash-metric-card__label\",\n      metric.label,\n    ),\n    element(\n      \"p\",\n      \"mydash-metric-card__value\",\n      metric.value,\n    ),\n    element(\n      \"p\",\n      \"mydash-metric-card__detail\",\n      metric.detail,\n    ),\n  );\n\n  return card;\n}\n\nfunction queueRow(item) {\n  const row = element(\"tr\");\n\n  const useCaseCell = element(\"td\");\n  const useCase = element(\n    \"div\",\n    \"dashboard-use-case\",\n  );\n  useCase.append(\n    element(\n      \"strong\",\n      \"\",\n      item.title,\n    ),\n    element(\n      \"span\",\n      \"\",\n      `${item.id} · ${item.area} · ${item.owner}`,\n    ),\n  );\n  useCaseCell.append(useCase);\n\n  const stageCell = element(\"td\");\n  const stage = element(\n    \"span\",\n    \"mydash-status\",\n    stageLabel(item.stage),\n  );\n  stage.dataset.tone =\n    statusTone(item.status);\n  stageCell.append(\n    stage,\n    element(\n      \"small\",\n      \"dashboard-cell-detail\",\n      item.status,\n    ),\n  );\n\n  const riskCell = element(\"td\");\n  const risk = element(\n    \"span\",\n    \"mydash-status\",\n    `${item.risk} risk`,\n  );\n  risk.dataset.tone =\n    riskTone(item.risk);\n  riskCell.append(risk);\n\n  const reviewCell = element(\"td\");\n  const review = element(\n    \"div\",\n    \"dashboard-review-progress\",\n  );\n  const progress = element(\n    \"progress\",\n  );\n  progress.max =\n    item.reviews.total;\n  progress.value =\n    item.reviews.complete;\n  progress.setAttribute(\n    \"aria-label\",\n    `${item.reviews.complete} of ${item.reviews.total} reviews complete`,\n  );\n  review.append(\n    progress,\n    element(\n      \"span\",\n      \"\",\n      `${item.reviews.complete} / ${item.reviews.total} complete`,\n    ),\n  );\n  reviewCell.append(review);\n\n  const daysCell = element(\n    \"td\",\n    \"\",\n    String(item.daysInStage),\n  );\n\n  const nextCell = element(\n    \"td\",\n    \"dashboard-next-action\",\n  );\n  nextCell.append(\n    document.createTextNode(\n      item.nextAction,\n    ),\n    element(\n      \"small\",\n      \"\",\n      `Target ${formatDate(\n        item.targetDate,\n      )} · Updated ${formatDate(\n        item.updatedAt,\n      )}`,\n    ),\n  );\n\n  row.append(\n    useCaseCell,\n    stageCell,\n    riskCell,\n    reviewCell,\n    daysCell,\n    nextCell,\n  );\n\n  return row;\n}\n\nfunction option(value, label) {\n  const result = element(\n    \"option\",\n    \"\",\n    label,\n  );\n  result.value = value;\n  return result;\n}\n\nfunction element(\n  tagName,\n  className = \"\",\n  text = null,\n) {\n  const result =\n    document.createElement(tagName);\n\n  if (className) {\n    result.className = className;\n  }\n\n  if (text !== null) {\n    result.textContent = text;\n  }\n\n  return result;\n}\n\nfunction renderFailure(error) {\n  console.error(error);\n  elements.metricGrid.replaceChildren(\n    failurePanel(\n      \"Dashboard unavailable\",\n      \"The representative portfolio data could not be rendered.\",\n    ),\n  );\n  elements.pipeline.replaceChildren(\n    failurePanel(\n      \"Pipeline unavailable\",\n      \"Refresh the page after checking the artefact data file.\",\n    ),\n  );\n  elements.queueBody.closest(\n    \".dashboard-table-wrap\",\n  ).hidden = true;\n  elements.emptyState.hidden = false;\n  elements.emptyState.querySelector(\n    \"h3\",\n  ).textContent =\n    \"The work queue could not be loaded\";\n  elements.emptyState.querySelector(\n    \"p\",\n  ).textContent =\n    error instanceof Error\n      ? error.message\n      : String(error);\n  elements.resultCount.textContent =\n    \"No use cases shown\";\n  document.documentElement.dataset\n    .dashboardReady = \"error\";\n}\n\nfunction failurePanel(title, detail) {\n  const panel = element(\n    \"article\",\n    \"mydash-metric-card\",\n  );\n  panel.dataset.tone = \"critical\";\n  panel.append(\n    element(\n      \"p\",\n      \"mydash-metric-card__label\",\n      title,\n    ),\n    element(\n      \"p\",\n      \"mydash-metric-card__detail\",\n      detail,\n    ),\n  );\n  return panel;\n}\n"}, "library/dashboards/ai-use-case-governance/data/use-cases.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"asOf\": \"2026-07-26\",\n  \"notice\": \"Representative sample data created for the My Dashboards reference artefact. It does not describe a real portfolio.\",\n  \"useCases\": [\n    {\n      \"id\": \"UC-101\",\n      \"title\": \"Coding Assistant Pilot\",\n      \"area\": \"Engineering Tools\",\n      \"owner\": \"Developer Experience\",\n      \"stage\": \"committee\",\n      \"status\": \"Committee scheduled\",\n      \"risk\": \"Medium\",\n      \"daysInStage\": 4,\n      \"reviews\": {\n        \"complete\": 4,\n        \"total\": 4\n      },\n      \"nextAction\": \"Present pilot scope and control evidence\",\n      \"updatedAt\": \"2026-07-24\",\n      \"targetDate\": \"2026-08-01\"\n    },\n    {\n      \"id\": \"UC-102\",\n      \"title\": \"Knowledge Retrieval Assistant\",\n      \"area\": \"Agent Platform\",\n      \"owner\": \"Platform Enablement\",\n      \"stage\": \"reviews\",\n      \"status\": \"Cyber review\",\n      \"risk\": \"High\",\n      \"daysInStage\": 11,\n      \"reviews\": {\n        \"complete\": 2,\n        \"total\": 4\n      },\n      \"nextAction\": \"Close data-flow and access-control questions\",\n      \"updatedAt\": \"2026-07-22\",\n      \"targetDate\": \"2026-07-31\"\n    },\n    {\n      \"id\": \"UC-103\",\n      \"title\": \"Service Desk Summarisation\",\n      \"area\": \"Operations\",\n      \"owner\": \"Service Management\",\n      \"stage\": \"pilot\",\n      \"status\": \"Approved for pilot\",\n      \"risk\": \"Low\",\n      \"daysInStage\": 6,\n      \"reviews\": {\n        \"complete\": 4,\n        \"total\": 4\n      },\n      \"nextAction\": \"Begin controlled user onboarding\",\n      \"updatedAt\": \"2026-07-25\",\n      \"targetDate\": \"2026-08-05\"\n    },\n    {\n      \"id\": \"UC-104\",\n      \"title\": \"Model Usage Monitoring\",\n      \"area\": \"Control & Monitoring\",\n      \"owner\": \"AI Controls\",\n      \"stage\": \"production\",\n      \"status\": \"Production\",\n      \"risk\": \"Low\",\n      \"daysInStage\": 28,\n      \"reviews\": {\n        \"complete\": 5,\n        \"total\": 5\n      },\n      \"nextAction\": \"Review first monthly control report\",\n      \"updatedAt\": \"2026-07-23\",\n      \"targetDate\": \"2026-08-15\"\n    },\n    {\n      \"id\": \"UC-105\",\n      \"title\": \"Release Note Generator\",\n      \"area\": \"Engineering Tools\",\n      \"owner\": \"Developer Experience\",\n      \"stage\": \"intake\",\n      \"status\": \"Scope definition\",\n      \"risk\": \"Low\",\n      \"daysInStage\": 2,\n      \"reviews\": {\n        \"complete\": 0,\n        \"total\": 4\n      },\n      \"nextAction\": \"Confirm users, source repositories and benefit measure\",\n      \"updatedAt\": \"2026-07-25\",\n      \"targetDate\": \"2026-08-08\"\n    },\n    {\n      \"id\": \"UC-106\",\n      \"title\": \"Customer Correspondence Drafting\",\n      \"area\": \"Operations\",\n      \"owner\": \"Business Transformation\",\n      \"stage\": \"reviews\",\n      \"status\": \"Data review\",\n      \"risk\": \"High\",\n      \"daysInStage\": 15,\n      \"reviews\": {\n        \"complete\": 1,\n        \"total\": 5\n      },\n      \"nextAction\": \"Define restricted-data handling and human review\",\n      \"updatedAt\": \"2026-07-20\",\n      \"targetDate\": \"2026-07-30\"\n    },\n    {\n      \"id\": \"UC-107\",\n      \"title\": \"Test Case Generation\",\n      \"area\": \"Engineering Tools\",\n      \"owner\": \"Quality Engineering\",\n      \"stage\": \"pilot\",\n      \"status\": \"Approved for pilot\",\n      \"risk\": \"Medium\",\n      \"daysInStage\": 9,\n      \"reviews\": {\n        \"complete\": 4,\n        \"total\": 4\n      },\n      \"nextAction\": \"Capture quality and cycle-time baseline\",\n      \"updatedAt\": \"2026-07-21\",\n      \"targetDate\": \"2026-08-02\"\n    },\n    {\n      \"id\": \"UC-108\",\n      \"title\": \"Policy Question Assistant\",\n      \"area\": \"Knowledge Management\",\n      \"owner\": \"Data Office\",\n      \"stage\": \"committee\",\n      \"status\": \"Evidence requested\",\n      \"risk\": \"Medium\",\n      \"daysInStage\": 7,\n      \"reviews\": {\n        \"complete\": 4,\n        \"total\": 4\n      },\n      \"nextAction\": \"Provide evaluation results for unsupported answers\",\n      \"updatedAt\": \"2026-07-19\",\n      \"targetDate\": \"2026-07-29\"\n    },\n    {\n      \"id\": \"UC-109\",\n      \"title\": \"Incident Triage Assistant\",\n      \"area\": \"Technology Operations\",\n      \"owner\": \"Service Management\",\n      \"stage\": \"reviews\",\n      \"status\": \"Model risk review\",\n      \"risk\": \"High\",\n      \"daysInStage\": 13,\n      \"reviews\": {\n        \"complete\": 3,\n        \"total\": 5\n      },\n      \"nextAction\": \"Agree escalation thresholds and failure handling\",\n      \"updatedAt\": \"2026-07-18\",\n      \"targetDate\": \"2026-07-31\"\n    },\n    {\n      \"id\": \"UC-110\",\n      \"title\": \"Architecture Decision Assistant\",\n      \"area\": \"Engineering Tools\",\n      \"owner\": \"Architecture Practice\",\n      \"stage\": \"intake\",\n      \"status\": \"Benefits assessment\",\n      \"risk\": \"Medium\",\n      \"daysInStage\": 5,\n      \"reviews\": {\n        \"complete\": 0,\n        \"total\": 4\n      },\n      \"nextAction\": \"Define measurable decision-quality outcomes\",\n      \"updatedAt\": \"2026-07-23\",\n      \"targetDate\": \"2026-08-06\"\n    },\n    {\n      \"id\": \"UC-111\",\n      \"title\": \"Cloud Cost Explanation\",\n      \"area\": \"FinOps\",\n      \"owner\": \"Cloud Enablement\",\n      \"stage\": \"production\",\n      \"status\": \"Production\",\n      \"risk\": \"Low\",\n      \"daysInStage\": 41,\n      \"reviews\": {\n        \"complete\": 4,\n        \"total\": 4\n      },\n      \"nextAction\": \"Compare adoption with forecast benefit\",\n      \"updatedAt\": \"2026-07-17\",\n      \"targetDate\": \"2026-08-12\"\n    },\n    {\n      \"id\": \"UC-112\",\n      \"title\": \"Secure Coding Guidance\",\n      \"area\": \"Engineering Tools\",\n      \"owner\": \"Cyber Engineering\",\n      \"stage\": \"reviews\",\n      \"status\": \"Cyber review\",\n      \"risk\": \"Medium\",\n      \"daysInStage\": 8,\n      \"reviews\": {\n        \"complete\": 2,\n        \"total\": 4\n      },\n      \"nextAction\": \"Complete prompt-injection and data-leakage testing\",\n      \"updatedAt\": \"2026-07-24\",\n      \"targetDate\": \"2026-08-03\"\n    },\n    {\n      \"id\": \"UC-113\",\n      \"title\": \"Requirements Quality Checker\",\n      \"area\": \"Change Delivery\",\n      \"owner\": \"Business Transformation\",\n      \"stage\": \"intake\",\n      \"status\": \"Scope definition\",\n      \"risk\": \"Low\",\n      \"daysInStage\": 3,\n      \"reviews\": {\n        \"complete\": 0,\n        \"total\": 4\n      },\n      \"nextAction\": \"Select representative requirements for evaluation\",\n      \"updatedAt\": \"2026-07-25\",\n      \"targetDate\": \"2026-08-09\"\n    },\n    {\n      \"id\": \"UC-114\",\n      \"title\": \"Agent Run Audit Explorer\",\n      \"area\": \"Agent Platform\",\n      \"owner\": \"AI Controls\",\n      \"stage\": \"committee\",\n      \"status\": \"Committee scheduled\",\n      \"risk\": \"Medium\",\n      \"daysInStage\": 3,\n      \"reviews\": {\n        \"complete\": 5,\n        \"total\": 5\n      },\n      \"nextAction\": \"Confirm pilot access group and retention period\",\n      \"updatedAt\": \"2026-07-26\",\n      \"targetDate\": \"2026-08-04\"\n    }\n  ]\n}\n"}, "library/dashboards/ai-use-case-governance/ui/components/governance-pipeline/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"component\",\n  \"id\": \"governance-pipeline\",\n  \"name\": \"Governance Pipeline\",\n  \"description\": \"Artefact-local stage summary for the AI use-case governance journey.\",\n  \"level\": \"local\",\n  \"ownerArtifact\": \"ai-use-case-governance\",\n  \"slot\": \"governance-pipeline\",\n  \"contractVersion\": 1,\n  \"entry\": \"component.css\",\n  \"props\": {\n    \"stages\": {\n      \"type\": \"array\",\n      \"required\": true,\n      \"description\": \"Ordered governance stages and their current counts.\"\n    },\n    \"total\": {\n      \"type\": \"number\",\n      \"required\": true,\n      \"description\": \"Total use-case count used to scale stage bars.\"\n    }\n  },\n  \"variants\": {\n    \"density\": [\n      \"comfortable\",\n      \"compact\"\n    ]\n  },\n  \"dependencies\": {\n    \"primitives\": {\n      \"status\": \"status-badge\"\n    },\n    \"components\": {},\n    \"assets\": {}\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "library/dashboards/ai-use-case-governance/ui/components/governance-pipeline/component.css": {"content": ".governance-pipeline {\n  display: grid;\n  grid-template-columns: repeat(5, minmax(9.5rem, 1fr));\n  gap: var(--space-3);\n  overflow-x: auto;\n  padding: var(--space-5);\n  border: 1px solid var(--colour-border);\n  border-radius: var(--radius-lg);\n  background: var(--colour-surface-subtle);\n}\n\n.governance-pipeline__stage {\n  position: relative;\n  display: grid;\n  grid-template-rows: auto auto 1fr;\n  gap: var(--space-3);\n  min-width: 9.5rem;\n  padding: var(--space-4);\n  border: 1px solid var(--colour-border);\n  border-radius: var(--radius-md);\n  background: var(--colour-surface);\n  box-shadow: var(--shadow-sm);\n}\n\n.governance-pipeline__stage:not(:last-child)::after {\n  position: absolute;\n  top: 2rem;\n  right: calc(var(--space-3) * -1 - 1px);\n  width: var(--space-3);\n  height: 1px;\n  background: var(--colour-border-strong);\n  content: \"\";\n}\n\n.governance-pipeline__topline {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--space-2);\n}\n\n.governance-pipeline__index {\n  color: var(--colour-primary);\n  font-size: var(--font-size-xs);\n  font-weight: var(--font-weight-bold);\n  letter-spacing: 0.08em;\n}\n\n.governance-pipeline__count {\n  margin: 0;\n  color: var(--colour-text);\n  font-size: var(--font-size-xl);\n  font-weight: var(--font-weight-bold);\n  line-height: var(--line-height-tight);\n}\n\n.governance-pipeline__label {\n  margin: 0;\n  color: var(--colour-text);\n  font-size: var(--font-size-sm);\n  font-weight: var(--font-weight-bold);\n}\n\n.governance-pipeline__description {\n  margin: var(--space-1) 0 0;\n  color: var(--colour-text-muted);\n  font-size: var(--font-size-xs);\n}\n\n.governance-pipeline__bar {\n  align-self: end;\n  height: 0.45rem;\n  overflow: hidden;\n  border-radius: 999px;\n  background: var(--colour-border);\n}\n\n.governance-pipeline__bar span {\n  display: block;\n  height: 100%;\n  border-radius: inherit;\n  background: var(--colour-primary);\n}\n\n.governance-pipeline[data-density=\"compact\"] {\n  padding: var(--space-4);\n}\n\n.governance-pipeline[data-density=\"compact\"]\n  .governance-pipeline__stage {\n  padding: var(--space-3);\n}\n\n@media (max-width: 64rem) {\n  .governance-pipeline {\n    grid-template-columns: repeat(5, minmax(11rem, 1fr));\n  }\n}\n"}, "tests/unit/reference-dashboard.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  readFile,\n} from \"node:fs/promises\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport test from \"node:test\";\nimport {\n  calculateSummary,\n  countByStage,\n  filterUseCases,\n  formatDate,\n  normalisePortfolio,\n  owners,\n  riskTone,\n  statusTone,\n} from \"../../library/dashboards/ai-use-case-governance/src/model.js\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\nconst dataPath = resolve(\n  projectRoot,\n  \"library\",\n  \"dashboards\",\n  \"ai-use-case-governance\",\n  \"data\",\n  \"use-cases.json\",\n);\n\nasync function portfolio() {\n  return normalisePortfolio(\n    JSON.parse(\n      await readFile(\n        dataPath,\n        \"utf8\",\n      ),\n    ),\n  );\n}\n\ntest(\"reference portfolio produces the intended summary\", async () => {\n  const value = await portfolio();\n  const summary =\n    calculateSummary(\n      value.useCases,\n    );\n\n  assert.deepEqual(summary, {\n    total: 14,\n    reviewBacklog: 4,\n    approvedForPilot: 2,\n    atRisk: 3,\n    reviewCompletion: 63,\n  });\n});\n\ntest(\"stage counts cover the complete governance journey\", async () => {\n  const value = await portfolio();\n  const counts =\n    countByStage(\n      value.useCases,\n    );\n\n  assert.deepEqual(\n    counts.map(\n      (stage) => [\n        stage.id,\n        stage.count,\n      ],\n    ),\n    [\n      [\"intake\", 3],\n      [\"reviews\", 4],\n      [\"committee\", 3],\n      [\"pilot\", 2],\n      [\"production\", 2],\n    ],\n  );\n});\n\ntest(\"work queue filters and sorts high-risk items first\", async () => {\n  const value = await portfolio();\n  const filtered =\n    filterUseCases(\n      value.useCases,\n      {\n        search: \"engineering\",\n        owner: \"\",\n        stage: \"\",\n      },\n    );\n\n  assert.equal(\n    filtered.length,\n    5,\n  );\n  assert.equal(\n    filtered[0].risk,\n    \"Medium\",\n  );\n\n  const reviews =\n    filterUseCases(\n      value.useCases,\n      {\n        stage: \"reviews\",\n      },\n    );\n\n  assert.deepEqual(\n    reviews.slice(0, 3).map(\n      (item) => item.id,\n    ),\n    [\n      \"UC-106\",\n      \"UC-109\",\n      \"UC-102\",\n    ],\n  );\n});\n\ntest(\"owners, tones and dates are deterministic\", async () => {\n  const value = await portfolio();\n\n  assert.equal(\n    owners(value.useCases)[0],\n    \"AI Controls\",\n  );\n  assert.equal(\n    riskTone(\"High\"),\n    \"critical\",\n  );\n  assert.equal(\n    statusTone(\"Approved for pilot\"),\n    \"positive\",\n  );\n  assert.equal(\n    statusTone(\"Cyber review\"),\n    \"warning\",\n  );\n  assert.equal(\n    formatDate(\"2026-07-26\"),\n    \"26 Jul 2026\",\n  );\n});\n\ntest(\"portfolio validation rejects unknown stages\", () => {\n  assert.throws(\n    () =>\n      normalisePortfolio({\n        asOf: \"2026-07-26\",\n        useCases: [\n          {\n            id: \"UC-X\",\n            title: \"Invalid\",\n            area: \"Test\",\n            owner: \"Test\",\n            stage: \"unknown\",\n            status: \"Draft\",\n            risk: \"Low\",\n            daysInStage: 1,\n            reviews: {\n              complete: 0,\n              total: 1,\n            },\n            nextAction: \"Fix stage\",\n            updatedAt: \"2026-07-26\",\n            targetDate: \"2026-07-27\",\n          },\n        ],\n      }),\n    /unknown stage/,\n  );\n});\n"}, "tests/integration/reference-dashboard-cli.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  readFile,\n  rm,\n} from \"node:fs/promises\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport test from \"node:test\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\nconst cliPath = resolve(\n  projectRoot,\n  \"bin\",\n  \"mydash.mjs\",\n);\nconst outputPath = resolve(\n  projectRoot,\n  \".my-dashboards\",\n  \"temp\",\n  \"ai-use-case-governance-test.html\",\n);\n\nfunction runCli(args) {\n  return spawnSync(\n    process.execPath,\n    [cliPath, ...args],\n    {\n      cwd: projectRoot,\n      encoding: \"utf8\",\n      stdio: \"pipe\",\n      shell: false,\n      maxBuffer:\n        64 * 1024 * 1024,\n    },\n  );\n}\n\ntest(\"reference dashboard resolves Core plus its local pipeline\", () => {\n  const result = runCli([\n    \"artifact\",\n    \"inspect\",\n    \"ai-use-case-governance\",\n    \"--kind\",\n    \"dashboard\",\n    \"--json\",\n  ]);\n\n  assert.equal(\n    result.status,\n    0,\n    result.stderr || result.stdout,\n  );\n  const body = JSON.parse(\n    result.stdout,\n  );\n\n  assert.equal(\n    body.data.appearance.summary.valid,\n    true,\n  );\n  assert.equal(\n    body.data.appearance.summary.dependencyCount,\n    9,\n  );\n  assert.equal(\n    body.data.appearance.selections.components[\n      \"governance-pipeline\"\n    ].entry.level,\n    \"local\",\n  );\n  assert.equal(\n    body.data.appearance.selections.assets[\n      \"brand-logo\"\n    ].entry.id,\n    \"mydash-brand-mark\",\n  );\n});\n\ntest(\"reference dashboard builds a valid standalone document\", () => {\n  const result = runCli([\n    \"artifact\",\n    \"validate\",\n    \"ai-use-case-governance\",\n    \"--kind\",\n    \"dashboard\",\n    \"--json\",\n  ]);\n\n  assert.equal(\n    result.status,\n    0,\n    result.stderr || result.stdout,\n  );\n  const body = JSON.parse(\n    result.stdout,\n  );\n\n  assert.equal(\n    body.data.validation.valid,\n    true,\n  );\n  assert.equal(\n    body.data.resources.uiResources,\n    6,\n  );\n  assert.equal(\n    body.data.resources.dataFiles,\n    1,\n  );\n  assert.equal(\n    body.data.sizeBytes > 20_000,\n    true,\n  );\n  assert.match(\n    body.data.sha256,\n    /^[a-f0-9]{64}$/,\n  );\n});\n\ntest(\"reference dashboard exports as one file-compatible HTML document\", async () => {\n  await rm(\n    outputPath,\n    { force: true },\n  );\n\n  try {\n    const result = runCli([\n      \"artifact\",\n      \"export\",\n      \"ai-use-case-governance\",\n      \"--kind\",\n      \"dashboard\",\n      \"--output\",\n      \".my-dashboards/temp/ai-use-case-governance-test.html\",\n      \"--overwrite\",\n      \"--json\",\n    ]);\n\n    assert.equal(\n      result.status,\n      0,\n      result.stderr || result.stdout,\n    );\n\n    const html = await readFile(\n      outputPath,\n      \"utf8\",\n    );\n\n    assert.match(\n      html,\n      /data-mydash-standalone/,\n    );\n    assert.match(\n      html,\n      /AI Use Case Governance/,\n    );\n    assert.match(\n      html,\n      /governance-pipeline/,\n    );\n    assert.match(\n      html,\n      /data-mydash-asset-id=\"mydash-brand-mark\"/,\n    );\n    assert.match(\n      html,\n      /Content-Security-Policy/,\n    );\n    assert.doesNotMatch(\n      html,\n      /<script[^>]+src=/i,\n    );\n    assert.doesNotMatch(\n      html,\n      /<link[^>]+rel=\"stylesheet\"/i,\n    );\n  } finally {\n    await rm(\n      outputPath,\n      { force: true },\n    );\n  }\n});\n"}, "scripts/tasks/test-reference-dashboard.mjs": {"content": "#!/usr/bin/env node\n\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  scriptDirectory,\n  \"../..\",\n);\n\nconst tests = [\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"unit\",\n    \"reference-dashboard.test.mjs\",\n  ),\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"integration\",\n    \"reference-dashboard-cli.test.mjs\",\n  ),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n    maxBuffer:\n      64 * 1024 * 1024,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode =\n  result.status ?? 1;\n"}};
const DASHBOARD_PLACEHOLDER =
  "# Intentionally retained\n\nDashboard artefact folders will be discovered here.\n\nImplementation is added by a later bootstrap step.\n";

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
  artefact: {
    id: "ai-use-case-governance",
    kind: "dashboard",
    preview:
      "/api/artifacts/dashboard/ai-use-case-governance/preview",
    exportFile:
      "ai-use-case-governance.html",
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
      "Bootstrap 17 must run from the root of the My Dashboards Git repository.",
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

  const removed =
    await removeKnownPlaceholder({
      relativePath:
        "library/dashboards/.gitkeep",
      expectedContent:
        DASHBOARD_PLACEHOLDER,
      dirtyBefore,
      repoRoot,
    });

  if (removed) {
    ownedAbsolutePaths.push(
      join(
        targetRoot,
        "library",
        "dashboards",
        ".gitkeep",
      ),
    );
  }

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "17-add-reference-dashboard.mjs",
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
        "The reference dashboard was created and tested, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 17

Usage:
  node scripts/17-add-reference-dashboard.mjs [options]

Options:
  --target <path>  Add the artefact to a specific repository root.
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
    "src/export/export-artifact.mjs",
    "src/library/core.mjs",
    "src/workspace/capabilities.mjs",
    "library/themes/core/hsbc-light/theme.json",
    "library/presets/core/default/preset.json",
    "library/ui/layouts/core/dashboard-shell/ui.json",
    "library/ui/components/core/metric-card/ui.json",
    "library/ui/components/core/section-heading/ui.json",
    "library/ui/primitives/core/button/ui.json",
    "library/ui/primitives/core/status-badge/ui.json",
    "library/assets/core/mydash-brand-mark/asset.json",
    "scripts/tasks/test-core.mjs",
    "scripts/tasks/test-server.mjs",
    "scripts/tasks/test-skills.mjs",
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
        "Bootstrap 16 has not been completed.",
        `Missing required paths: ${missing.join(", ")}`,
      ].join("\n"),
    );
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
        "package.json had pre-existing changes, so the reference-dashboard test command was not added automatically.",
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
  value.scripts[
    "test:reference-dashboard"
  ] =
    value.scripts[
      "test:reference-dashboard"
    ] ??
    "node scripts/tasks/test-reference-dashboard.mjs";

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
        "The reference dashboard was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "src/workspace/capabilities.mjs",
    "library/dashboards/ai-use-case-governance/src/model.js",
    "library/dashboards/ai-use-case-governance/src/main.js",
    "tests/unit/reference-dashboard.test.mjs",
    "tests/integration/reference-dashboard-cli.test.mjs",
    "scripts/tasks/test-reference-dashboard.mjs",
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
      `${modulePaths.length} dashboard, model and test modules passed Node syntax checks.`,
  });

  const tests = run(
    process.execPath,
    [
      join(
        targetRoot,
        "scripts",
        "tasks",
        "test-reference-dashboard.mjs",
      ),
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Reference dashboard tests failed:\n${
        tests.stderr ||
        tests.stdout
      }`,
    );
  }

  report.validation.push({
    check: "reference-dashboard-tests",
    ok: true,
    message:
      "Portfolio model, local component resolution, standalone validation and export tests passed.",
  });

  for (const command of [
    [
      "library",
      "scan",
      "--json",
    ],
    [
      "appearance",
      "resolve",
      "ai-use-case-governance",
      "--kind",
      "dashboard",
      "--json",
    ],
    [
      "artifact",
      "validate",
      "ai-use-case-governance",
      "--kind",
      "dashboard",
      "--json",
    ],
    [
      "validate",
      "--artifact",
      "ai-use-case-governance",
      "--kind",
      "dashboard",
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
      "Library discovery, appearance resolution, artefact validation and consolidated validation accept the dashboard.",
  });

  for (const task of [
    "scripts/tasks/test-core.mjs",
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
      "Core, skills, server, Git, validation, export, resolution, library, data, Office, filesystem, CLI and contract tests still pass.",
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
        "The reference dashboard was already present; there were no task-owned changes to commit.",
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
        "The reference dashboard was created and tested, but no commit was made because Git user.name or user.email is missing.",
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
    "\nMy Dashboards — reference governance dashboard\n",
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

  console.log("\nArtefact:");
  console.log(
    `  ID: ${report.artefact.id}`,
  );
  console.log(
    `  Kind: ${report.artefact.kind}`,
  );
  console.log(
    `  Preview: ${report.artefact.preview}`,
  );
  console.log(
    `  Export file: ${report.artefact.exportFile}`,
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
