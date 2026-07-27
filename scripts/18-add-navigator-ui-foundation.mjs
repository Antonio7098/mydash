#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 18: Add navigator UI foundation
 *
 * Adds:
 *
 *   - the first human-facing application shell;
 *   - compact expandable navigation;
 *   - route-aware Home, Dashboards, Presentations, Concepts, Components and
 *     Settings views;
 *   - live workspace revision state;
 *   - ETag-aware API reads;
 *   - static Express delivery with restrictive browser security headers.
 *
 * Usage:
 *   node scripts/18-add-navigator-ui-foundation.mjs
 *   node scripts/18-add-navigator-ui-foundation.mjs --dry-run
 *   node scripts/18-add-navigator-ui-foundation.mjs --no-commit
 *   node scripts/18-add-navigator-ui-foundation.mjs --no-push
 *   node scripts/18-add-navigator-ui-foundation.mjs --json
 *   node scripts/18-add-navigator-ui-foundation.mjs --target /path/to/my-dashboards
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
  "18-add-navigator-ui-foundation";
const COMMIT_MESSAGE =
  "Add navigator UI foundation";
const MIN_NODE_MAJOR = 20;
const FILES = {"app/README.md": {"content": "# Navigator application\n\nThe navigator is a lightweight browser interface over the repository and HTTP\nservices. It does not maintain a separate database or artefact index.\n\n## Start\n\n```bash\nnpm start\n```\n\nOpen:\n\n```text\nhttp://127.0.0.1:4173/\n```\n\n## Routes\n\n```text\n/\n /dashboards\n /presentations\n /concepts\n /components\n /settings\n```\n\nThe shell uses History API routing and the Express server returns `index.html`\nfor each supported route.\n\n## Current scope\n\nBootstrap 18 provides:\n\n- minimal white-and-red application chrome;\n- compact expandable navigation;\n- top-centre category selector;\n- route-aware views;\n- live health and revision status;\n- artefact and library counts;\n- component-library summary;\n- Git and cache state;\n- ETag-aware API reads;\n- live refresh through `/api/events`.\n\nIt deliberately does not yet render miniature artefact previews or the final\ngallery card system. Those belong to the next bootstrap.\n\n## Browser modules\n\n```text\nindex.html\nstyles.css\nrouter.js\napi.js\nmain.js\n```\n\nNo bundler or framework is required. All browser code is ordinary ES modules\nserved by Express.\n\n## Safety\n\n- no external scripts or styles;\n- no inline scripts;\n- no cross-origin API calls;\n- repository text is inserted with `textContent`;\n- navigation routes are allow-listed;\n- Content Security Policy is applied by the server;\n- the HTTP interface remains read-only.\n", "allowedPrevious": ["# Navigator application\n\nThis directory will contain the minimal browser interface for discovering, previewing and exporting artefacts.\n\nThe navigator is deliberately implemented after the shared services, CLI, discovery, resolution, validation and export systems.\n"]}, "app/index.html": {"content": "<!doctype html>\n<html lang=\"en-GB\">\n  <head>\n    <meta charset=\"utf-8\">\n    <meta\n      name=\"viewport\"\n      content=\"width=device-width, initial-scale=1\"\n    >\n    <meta\n      name=\"description\"\n      content=\"Browse, preview and export My Dashboards artefacts.\"\n    >\n    <title>My Dashboards</title>\n    <link rel=\"stylesheet\" href=\"/navigator/styles.css\">\n  </head>\n  <body>\n    <a class=\"skip-link\" href=\"#page-content\">Skip to content</a>\n\n    <header class=\"navigator-chrome\">\n      <nav\n        class=\"navigator-nav\"\n        id=\"navigator-nav\"\n        aria-label=\"Primary navigation\"\n        data-open=\"false\"\n      >\n        <button\n          class=\"navigator-nav__toggle\"\n          id=\"nav-toggle\"\n          type=\"button\"\n          aria-controls=\"nav-panel\"\n          aria-expanded=\"false\"\n        >\n          <span class=\"navigator-mark\" aria-hidden=\"true\">\n            <span class=\"navigator-mark__bar\"></span>\n            <span class=\"navigator-mark__letters\">MD</span>\n          </span>\n          <span class=\"navigator-nav__toggle-label\">My Dashboards</span>\n          <span class=\"navigator-nav__chevron\" aria-hidden=\"true\">›</span>\n        </button>\n\n        <div class=\"navigator-nav__panel\" id=\"nav-panel\">\n          <a href=\"/\" data-navigator-link data-route=\"home\">Home</a>\n          <a\n            href=\"/dashboards\"\n            data-navigator-link\n            data-route=\"dashboards\"\n          >\n            Dashboards\n          </a>\n          <a\n            href=\"/presentations\"\n            data-navigator-link\n            data-route=\"presentations\"\n          >\n            Presentations\n          </a>\n          <a\n            href=\"/concepts\"\n            data-navigator-link\n            data-route=\"concepts\"\n          >\n            Concepts\n          </a>\n          <a\n            href=\"/components\"\n            data-navigator-link\n            data-route=\"components\"\n          >\n            Components\n          </a>\n\n          <div class=\"navigator-nav__separator\" role=\"separator\"></div>\n\n          <a\n            href=\"/settings\"\n            data-navigator-link\n            data-route=\"settings\"\n          >\n            Settings\n          </a>\n          <a href=\"/api\" target=\"_blank\" rel=\"noreferrer\">API</a>\n        </div>\n      </nav>\n\n      <label class=\"category-switcher\">\n        <span class=\"visually-hidden\">Current section</span>\n        <select id=\"category-selector\" aria-label=\"Current section\">\n          <option value=\"/\">Home</option>\n          <option value=\"/dashboards\">Dashboards</option>\n          <option value=\"/presentations\">Presentations</option>\n          <option value=\"/concepts\">Concepts</option>\n          <option value=\"/components\">Components</option>\n          <option value=\"/settings\">Settings</option>\n        </select>\n      </label>\n\n      <div\n        class=\"connection-status\"\n        id=\"connection-status\"\n        data-state=\"loading\"\n        role=\"status\"\n        aria-live=\"polite\"\n      >\n        <span class=\"connection-status__dot\" aria-hidden=\"true\"></span>\n        <span id=\"connection-status-label\">Connecting</span>\n      </div>\n    </header>\n\n    <main class=\"navigator-main\" id=\"page-content\" tabindex=\"-1\">\n      <section class=\"navigator-loading\" aria-live=\"polite\">\n        <p class=\"navigator-eyebrow\">My Dashboards</p>\n        <h1>Opening your workspace</h1>\n        <p>Reading artefacts and shared resources from the repository.</p>\n      </section>\n    </main>\n\n    <footer class=\"navigator-footer\">\n      <span>Repository-backed</span>\n      <span aria-hidden=\"true\">·</span>\n      <span id=\"footer-revision\">Revision loading</span>\n    </footer>\n\n    <script type=\"module\" src=\"/navigator/main.js\"></script>\n  </body>\n</html>\n"}, "app/styles.css": {"content": ":root {\n  color-scheme: light;\n  --nav-red: #db0011;\n  --nav-red-dark: #b3000e;\n  --nav-red-soft: #fff2f3;\n  --nav-canvas: #ffffff;\n  --nav-surface: #ffffff;\n  --nav-surface-muted: #f6f6f6;\n  --nav-text: #1f1f1f;\n  --nav-text-muted: #666666;\n  --nav-border: #dddddd;\n  --nav-border-strong: #b9b9b9;\n  --nav-focus: #0066cc;\n  --nav-positive: #237804;\n  --nav-warning: #8a5a00;\n  --nav-critical: #b42318;\n  --nav-shadow:\n    0 18px 45px rgba(0, 0, 0, 0.12),\n    0 2px 10px rgba(0, 0, 0, 0.06);\n  --nav-radius-sm: 0.35rem;\n  --nav-radius-md: 0.65rem;\n  --nav-radius-lg: 1rem;\n  --nav-max-width: 92rem;\n  font-family:\n    Inter,\n    Arial,\n    Helvetica,\n    system-ui,\n    -apple-system,\n    BlinkMacSystemFont,\n    \"Segoe UI\",\n    sans-serif;\n  line-height: 1.5;\n  background: var(--nav-canvas);\n  color: var(--nav-text);\n}\n\n* {\n  box-sizing: border-box;\n}\n\nhtml {\n  min-width: 20rem;\n  min-height: 100%;\n  background: var(--nav-canvas);\n}\n\nbody {\n  min-height: 100vh;\n  margin: 0;\n  background:\n    radial-gradient(\n      circle at 50% -18rem,\n      rgba(219, 0, 17, 0.065),\n      transparent 32rem\n    ),\n    var(--nav-canvas);\n  color: var(--nav-text);\n}\n\nbutton,\ninput,\nselect {\n  font: inherit;\n}\n\na {\n  color: inherit;\n}\n\n.skip-link {\n  position: fixed;\n  z-index: 100;\n  top: 0.75rem;\n  left: 50%;\n  padding: 0.65rem 0.9rem;\n  transform: translate(-50%, -200%);\n  border-radius: var(--nav-radius-sm);\n  color: #ffffff;\n  background: var(--nav-text);\n}\n\n.skip-link:focus {\n  transform: translate(-50%, 0);\n}\n\n.visually-hidden {\n  position: absolute !important;\n  width: 1px !important;\n  height: 1px !important;\n  overflow: hidden !important;\n  clip: rect(0 0 0 0) !important;\n  white-space: nowrap !important;\n  clip-path: inset(50%) !important;\n}\n\n.navigator-chrome {\n  position: relative;\n  z-index: 20;\n  display: grid;\n  grid-template-columns: 1fr auto 1fr;\n  align-items: start;\n  min-height: 6.5rem;\n  padding:\n    clamp(1rem, 2.5vw, 1.75rem)\n    clamp(1rem, 3vw, 2.25rem);\n  pointer-events: none;\n}\n\n.navigator-chrome > * {\n  pointer-events: auto;\n}\n\n.navigator-nav {\n  position: fixed;\n  top: clamp(1rem, 2.5vw, 1.75rem);\n  left: clamp(1rem, 3vw, 2.25rem);\n  display: grid;\n  width: 3.2rem;\n  max-height: 3.2rem;\n  overflow: hidden;\n  border: 1px solid var(--nav-border);\n  border-radius: 1.6rem;\n  background: rgba(255, 255, 255, 0.96);\n  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);\n  transition:\n    width 180ms ease,\n    max-height 220ms ease 100ms,\n    border-radius 180ms ease,\n    box-shadow 180ms ease;\n  backdrop-filter: blur(18px);\n}\n\n.navigator-nav[data-open=\"true\"] {\n  width: min(16rem, calc(100vw - 2rem));\n  max-height: 31rem;\n  border-radius: var(--nav-radius-lg);\n  box-shadow: var(--nav-shadow);\n  transition:\n    width 180ms ease,\n    max-height 240ms ease 120ms,\n    border-radius 180ms ease,\n    box-shadow 180ms ease;\n}\n\n.navigator-nav__toggle {\n  display: grid;\n  grid-template-columns: 2rem minmax(0, 1fr) 1rem;\n  gap: 0.65rem;\n  align-items: center;\n  width: 100%;\n  min-height: 3.1rem;\n  padding: 0.3rem 0.55rem;\n  border: 0;\n  color: var(--nav-text);\n  background: transparent;\n  cursor: pointer;\n  text-align: left;\n}\n\n.navigator-mark {\n  position: relative;\n  display: grid;\n  width: 2rem;\n  height: 2rem;\n  place-items: center;\n  overflow: hidden;\n  border-radius: 50%;\n  color: var(--nav-text);\n  background: var(--nav-surface-muted);\n  font-size: 0.68rem;\n  font-weight: 800;\n  letter-spacing: -0.03em;\n}\n\n.navigator-mark__bar {\n  position: absolute;\n  inset: 0 auto 0 0;\n  width: 0.28rem;\n  background: var(--nav-red);\n}\n\n.navigator-mark__letters {\n  transform: translateX(0.09rem);\n}\n\n.navigator-nav__toggle-label {\n  overflow: hidden;\n  font-size: 0.9rem;\n  font-weight: 700;\n  opacity: 0;\n  white-space: nowrap;\n  transition: opacity 100ms ease;\n}\n\n.navigator-nav__chevron {\n  display: grid;\n  place-items: center;\n  color: var(--nav-text-muted);\n  font-size: 1.25rem;\n  opacity: 0;\n  transform: rotate(0deg);\n  transition:\n    opacity 100ms ease,\n    transform 180ms ease;\n}\n\n.navigator-nav[data-open=\"true\"] .navigator-nav__toggle-label,\n.navigator-nav[data-open=\"true\"] .navigator-nav__chevron {\n  opacity: 1;\n  transition-delay: 150ms;\n}\n\n.navigator-nav[data-open=\"true\"] .navigator-nav__chevron {\n  transform: rotate(90deg);\n}\n\n.navigator-nav__toggle:focus-visible,\n.navigator-nav__panel a:focus-visible,\n.category-switcher select:focus-visible {\n  outline: 3px solid color-mix(in srgb, var(--nav-focus) 28%, transparent);\n  outline-offset: 2px;\n}\n\n.navigator-nav__panel {\n  display: grid;\n  gap: 0.2rem;\n  padding: 0.35rem 0.45rem 0.6rem;\n  opacity: 0;\n  transform: translateY(-0.25rem);\n  transition:\n    opacity 120ms ease,\n    transform 120ms ease;\n  visibility: hidden;\n}\n\n.navigator-nav[data-open=\"true\"] .navigator-nav__panel {\n  opacity: 1;\n  transform: translateY(0);\n  transition-delay: 170ms;\n  visibility: visible;\n}\n\n.navigator-nav__panel a {\n  display: flex;\n  min-height: 2.5rem;\n  align-items: center;\n  padding: 0.55rem 0.8rem;\n  border-radius: var(--nav-radius-md);\n  color: var(--nav-text-muted);\n  font-size: 0.9rem;\n  font-weight: 600;\n  text-decoration: none;\n}\n\n.navigator-nav__panel a:hover {\n  color: var(--nav-text);\n  background: var(--nav-surface-muted);\n}\n\n.navigator-nav__panel a[aria-current=\"page\"] {\n  color: var(--nav-red-dark);\n  background: var(--nav-red-soft);\n}\n\n.navigator-nav__separator {\n  height: 1px;\n  margin: 0.4rem 0.75rem;\n  background: var(--nav-border);\n}\n\n.category-switcher {\n  grid-column: 2;\n  justify-self: center;\n}\n\n.category-switcher select {\n  min-height: 2.65rem;\n  min-width: 10rem;\n  padding: 0.5rem 2.3rem 0.5rem 0.9rem;\n  border: 1px solid var(--nav-border);\n  border-radius: 999px;\n  color: var(--nav-text);\n  background:\n    linear-gradient(45deg, transparent 50%, var(--nav-text-muted) 50%)\n      calc(100% - 1rem) 51% / 0.32rem 0.32rem no-repeat,\n    linear-gradient(135deg, var(--nav-text-muted) 50%, transparent 50%)\n      calc(100% - 0.7rem) 51% / 0.32rem 0.32rem no-repeat,\n    rgba(255, 255, 255, 0.92);\n  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.045);\n  font-size: 0.88rem;\n  font-weight: 700;\n  appearance: none;\n  cursor: pointer;\n  backdrop-filter: blur(15px);\n}\n\n.connection-status {\n  grid-column: 3;\n  justify-self: end;\n  display: inline-flex;\n  min-height: 2.65rem;\n  align-items: center;\n  gap: 0.55rem;\n  padding: 0.45rem 0.8rem;\n  border: 1px solid var(--nav-border);\n  border-radius: 999px;\n  color: var(--nav-text-muted);\n  background: rgba(255, 255, 255, 0.9);\n  font-size: 0.78rem;\n  font-weight: 650;\n  backdrop-filter: blur(15px);\n}\n\n.connection-status__dot {\n  width: 0.48rem;\n  height: 0.48rem;\n  border-radius: 50%;\n  background: var(--nav-border-strong);\n}\n\n.connection-status[data-state=\"ready\"] .connection-status__dot {\n  background: var(--nav-positive);\n  box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--nav-positive) 15%, transparent);\n}\n\n.connection-status[data-state=\"stale\"] .connection-status__dot {\n  background: var(--nav-warning);\n}\n\n.connection-status[data-state=\"error\"] .connection-status__dot {\n  background: var(--nav-critical);\n}\n\n.navigator-main {\n  width: min(\n    calc(100% - 2 * clamp(1rem, 4vw, 3rem)),\n    var(--nav-max-width)\n  );\n  min-height: calc(100vh - 11rem);\n  margin-inline: auto;\n  padding:\n    clamp(1rem, 3vw, 2rem)\n    0\n    clamp(4rem, 8vw, 7rem);\n  outline: none;\n}\n\n.navigator-loading {\n  max-width: 42rem;\n  margin: clamp(4rem, 12vh, 9rem) auto 0;\n  text-align: center;\n}\n\n.navigator-eyebrow {\n  margin: 0 0 0.8rem;\n  color: var(--nav-red);\n  font-size: 0.74rem;\n  font-weight: 800;\n  letter-spacing: 0.14em;\n  text-transform: uppercase;\n}\n\n.navigator-loading h1,\n.page-heading h1 {\n  margin: 0;\n  color: var(--nav-text);\n  font-size: clamp(2.7rem, 7vw, 5.8rem);\n  font-weight: 750;\n  letter-spacing: -0.065em;\n  line-height: 0.94;\n}\n\n.navigator-loading p:last-child,\n.page-heading__summary {\n  max-width: 60ch;\n  margin: 1.25rem 0 0;\n  color: var(--nav-text-muted);\n  font-size: clamp(1rem, 2vw, 1.2rem);\n}\n\n.page-heading {\n  display: grid;\n  grid-template-columns: minmax(0, 1.4fr) minmax(15rem, 0.55fr);\n  gap: clamp(2rem, 7vw, 7rem);\n  align-items: end;\n  padding:\n    clamp(3rem, 8vw, 7rem)\n    0\n    clamp(2.5rem, 6vw, 5rem);\n}\n\n.page-heading__summary {\n  margin-inline: 0;\n}\n\n.page-heading__aside {\n  display: grid;\n  gap: 0.45rem;\n  padding: 1rem 0 1rem 1.3rem;\n  border-left: 0.25rem solid var(--nav-red);\n}\n\n.page-heading__aside strong {\n  font-size: clamp(2rem, 5vw, 3.5rem);\n  letter-spacing: -0.05em;\n  line-height: 1;\n}\n\n.page-heading__aside span {\n  color: var(--nav-text-muted);\n  font-size: 0.86rem;\n}\n\n.overview-grid {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 1rem;\n}\n\n.overview-card,\n.status-panel,\n.library-stat,\n.empty-category {\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-lg);\n  background: var(--nav-surface);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.035);\n}\n\n.overview-card {\n  position: relative;\n  display: grid;\n  min-height: 11rem;\n  align-content: space-between;\n  gap: 1.5rem;\n  padding: 1.35rem;\n  color: var(--nav-text);\n  text-decoration: none;\n  transition:\n    transform 140ms ease,\n    border-color 140ms ease,\n    box-shadow 140ms ease;\n}\n\n.overview-card::before {\n  position: absolute;\n  inset: 0 auto 0 0;\n  width: 0.22rem;\n  border-radius: var(--nav-radius-lg) 0 0 var(--nav-radius-lg);\n  background: transparent;\n  content: \"\";\n}\n\n.overview-card:hover {\n  transform: translateY(-2px);\n  border-color: var(--nav-border-strong);\n  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.07);\n}\n\n.overview-card:hover::before {\n  background: var(--nav-red);\n}\n\n.overview-card__label {\n  color: var(--nav-text-muted);\n  font-size: 0.82rem;\n  font-weight: 700;\n}\n\n.overview-card__count {\n  display: block;\n  margin-top: 0.35rem;\n  font-size: clamp(2.3rem, 5vw, 4rem);\n  font-weight: 760;\n  letter-spacing: -0.055em;\n  line-height: 1;\n}\n\n.overview-card__action {\n  color: var(--nav-red-dark);\n  font-size: 0.82rem;\n  font-weight: 700;\n}\n\n.section-block {\n  margin-top: clamp(3rem, 7vw, 6rem);\n}\n\n.section-heading {\n  display: flex;\n  align-items: end;\n  justify-content: space-between;\n  gap: 2rem;\n  margin-bottom: 1.25rem;\n}\n\n.section-heading h2 {\n  margin: 0;\n  font-size: clamp(1.55rem, 3vw, 2.4rem);\n  letter-spacing: -0.035em;\n}\n\n.section-heading p {\n  max-width: 52ch;\n  margin: 0;\n  color: var(--nav-text-muted);\n  font-size: 0.9rem;\n  text-align: right;\n}\n\n.status-grid {\n  display: grid;\n  grid-template-columns: minmax(0, 1.5fr) minmax(18rem, 0.65fr);\n  gap: 1rem;\n}\n\n.status-panel {\n  display: grid;\n  gap: 1.15rem;\n  padding: 1.4rem;\n}\n\n.status-panel__topline {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 1rem;\n}\n\n.status-panel__topline h3 {\n  margin: 0;\n  font-size: 1rem;\n}\n\n.status-badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.45rem;\n  color: var(--nav-positive);\n  font-size: 0.78rem;\n  font-weight: 750;\n}\n\n.status-badge::before {\n  width: 0.45rem;\n  height: 0.45rem;\n  border-radius: 50%;\n  background: currentColor;\n  content: \"\";\n}\n\n.status-list {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 1rem;\n  margin: 0;\n}\n\n.status-list div {\n  min-width: 0;\n}\n\n.status-list dt {\n  color: var(--nav-text-muted);\n  font-size: 0.72rem;\n  font-weight: 750;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.status-list dd {\n  overflow: hidden;\n  margin: 0.3rem 0 0;\n  font-size: 0.94rem;\n  font-weight: 650;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.category-intro {\n  display: grid;\n  grid-template-columns: minmax(0, 1.1fr) minmax(17rem, 0.6fr);\n  gap: clamp(2rem, 7vw, 7rem);\n  align-items: center;\n  min-height: 21rem;\n  padding: clamp(2rem, 6vw, 5rem);\n  border: 1px solid var(--nav-border);\n  border-radius: clamp(1rem, 2.5vw, 1.8rem);\n  background:\n    linear-gradient(\n      112deg,\n      var(--nav-red-soft),\n      var(--nav-surface) 54%\n    );\n}\n\n.category-intro h2 {\n  max-width: 12ch;\n  margin: 0;\n  font-size: clamp(2.4rem, 6vw, 5.4rem);\n  letter-spacing: -0.06em;\n  line-height: 0.96;\n}\n\n.category-intro p {\n  max-width: 56ch;\n  margin: 1.2rem 0 0;\n  color: var(--nav-text-muted);\n}\n\n.category-intro__count {\n  display: grid;\n  justify-items: start;\n  gap: 0.6rem;\n  padding-left: clamp(1rem, 4vw, 3rem);\n  border-left: 1px solid var(--nav-border-strong);\n}\n\n.category-intro__count strong {\n  font-size: clamp(4rem, 10vw, 8rem);\n  letter-spacing: -0.075em;\n  line-height: 0.8;\n}\n\n.category-intro__count span {\n  color: var(--nav-text-muted);\n  font-size: 0.86rem;\n}\n\n.primary-action,\n.secondary-action {\n  display: inline-flex;\n  min-height: 2.8rem;\n  align-items: center;\n  justify-content: center;\n  margin-top: 1.5rem;\n  padding: 0.65rem 1rem;\n  border: 1px solid transparent;\n  border-radius: var(--nav-radius-sm);\n  font-size: 0.84rem;\n  font-weight: 750;\n  text-decoration: none;\n}\n\n.primary-action {\n  color: #ffffff;\n  background: var(--nav-red);\n}\n\n.primary-action:hover {\n  background: var(--nav-red-dark);\n}\n\n.secondary-action {\n  color: var(--nav-text);\n  border-color: var(--nav-border-strong);\n  background: var(--nav-surface);\n}\n\n.empty-category {\n  margin-top: 1rem;\n  padding: 1.6rem;\n  color: var(--nav-text-muted);\n}\n\n.empty-category strong {\n  display: block;\n  margin-bottom: 0.3rem;\n  color: var(--nav-text);\n}\n\n.library-grid {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 1rem;\n}\n\n.library-stat {\n  padding: 1.35rem;\n}\n\n.library-stat span {\n  color: var(--nav-text-muted);\n  font-size: 0.78rem;\n  font-weight: 700;\n}\n\n.library-stat strong {\n  display: block;\n  margin-top: 0.45rem;\n  font-size: 2.4rem;\n  letter-spacing: -0.05em;\n  line-height: 1;\n}\n\n.settings-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 1rem;\n}\n\n.settings-card {\n  min-width: 0;\n  padding: 1.4rem;\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-lg);\n  background: var(--nav-surface);\n}\n\n.settings-card h2 {\n  margin: 0 0 1rem;\n  font-size: 1rem;\n}\n\n.settings-card dl {\n  display: grid;\n  gap: 0.9rem;\n  margin: 0;\n}\n\n.settings-card dl div {\n  display: grid;\n  grid-template-columns: minmax(7rem, 0.55fr) minmax(0, 1fr);\n  gap: 1rem;\n  padding-bottom: 0.9rem;\n  border-bottom: 1px solid var(--nav-border);\n}\n\n.settings-card dl div:last-child {\n  padding-bottom: 0;\n  border-bottom: 0;\n}\n\n.settings-card dt {\n  color: var(--nav-text-muted);\n  font-size: 0.78rem;\n}\n\n.settings-card dd {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  margin: 0;\n  font-size: 0.86rem;\n  font-weight: 650;\n  text-align: right;\n}\n\n.navigator-error {\n  max-width: 42rem;\n  margin: 6rem auto;\n  padding: 1.6rem;\n  border: 1px solid color-mix(in srgb, var(--nav-critical) 35%, white);\n  border-radius: var(--nav-radius-lg);\n  background: #fff4f2;\n}\n\n.navigator-error h1,\n.navigator-error p {\n  margin: 0;\n}\n\n.navigator-error p {\n  margin-top: 0.75rem;\n  color: var(--nav-text-muted);\n}\n\n.navigator-footer {\n  display: flex;\n  justify-content: center;\n  gap: 0.55rem;\n  min-height: 4rem;\n  align-items: center;\n  padding: 1rem;\n  color: var(--nav-text-muted);\n  font-size: 0.74rem;\n}\n\n@media (max-width: 64rem) {\n  .overview-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n\n  .page-heading,\n  .category-intro,\n  .status-grid {\n    grid-template-columns: 1fr;\n  }\n\n  .page-heading__aside,\n  .category-intro__count {\n    max-width: 22rem;\n  }\n\n  .library-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n}\n\n@media (max-width: 44rem) {\n  .navigator-chrome {\n    grid-template-columns: 1fr auto;\n    min-height: 7.5rem;\n  }\n\n  .category-switcher {\n    grid-column: 2;\n    justify-self: end;\n  }\n\n  .connection-status {\n    grid-column: 1 / -1;\n    grid-row: 2;\n    justify-self: end;\n    margin-top: 0.65rem;\n  }\n\n  .connection-status span:last-child {\n    max-width: 9rem;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n  }\n\n  .overview-grid,\n  .library-grid,\n  .settings-grid,\n  .status-list {\n    grid-template-columns: 1fr;\n  }\n\n  .section-heading {\n    align-items: start;\n    flex-direction: column;\n  }\n\n  .section-heading p {\n    text-align: left;\n  }\n\n  .category-intro__count {\n    padding-top: 1.5rem;\n    padding-left: 0;\n    border-top: 1px solid var(--nav-border-strong);\n    border-left: 0;\n  }\n\n  .settings-card dl div {\n    grid-template-columns: 1fr;\n    gap: 0.3rem;\n  }\n\n  .settings-card dd {\n    text-align: left;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    scroll-behavior: auto !important;\n    transition-duration: 0.01ms !important;\n    transition-delay: 0ms !important;\n  }\n}\n"}, "app/router.js": {"content": "export const NAVIGATOR_ROUTES = Object.freeze([\n  {\n    id: \"home\",\n    path: \"/\",\n    title: \"Home\",\n    category: null,\n  },\n  {\n    id: \"dashboards\",\n    path: \"/dashboards\",\n    title: \"Dashboards\",\n    category: \"dashboard\",\n  },\n  {\n    id: \"presentations\",\n    path: \"/presentations\",\n    title: \"Presentations\",\n    category: \"presentation\",\n  },\n  {\n    id: \"concepts\",\n    path: \"/concepts\",\n    title: \"Concepts\",\n    category: \"concept\",\n  },\n  {\n    id: \"components\",\n    path: \"/components\",\n    title: \"Components\",\n    category: \"library\",\n  },\n  {\n    id: \"settings\",\n    path: \"/settings\",\n    title: \"Settings\",\n    category: \"settings\",\n  },\n]);\n\nconst ROUTE_BY_PATH = new Map(\n  NAVIGATOR_ROUTES.map(\n    (route) => [route.path, route],\n  ),\n);\n\nexport function normaliseNavigatorPath(\n  value,\n) {\n  const pathname = String(\n    value ?? \"/\",\n  )\n    .split(/[?#]/, 1)[0]\n    .replace(/\\/{2,}/g, \"/\");\n\n  if (pathname === \"/\") return \"/\";\n\n  return pathname\n    .replace(/\\/+$/, \"\") ||\n    \"/\";\n}\n\nexport function routeForPath(\n  value,\n) {\n  return (\n    ROUTE_BY_PATH.get(\n      normaliseNavigatorPath(value),\n    ) ??\n    ROUTE_BY_PATH.get(\"/\")\n  );\n}\n\nexport function routeForId(id) {\n  return (\n    NAVIGATOR_ROUTES.find(\n      (route) => route.id === id,\n    ) ??\n    NAVIGATOR_ROUTES[0]\n  );\n}\n\nexport function isNavigatorPath(value) {\n  return ROUTE_BY_PATH.has(\n    normaliseNavigatorPath(value),\n  );\n}\n\nexport function navigate(\n  path,\n  options = {},\n) {\n  const next =\n    normaliseNavigatorPath(path);\n\n  if (!isNavigatorPath(next)) {\n    throw new TypeError(\n      `Unsupported navigator route: ${path}`,\n    );\n  }\n\n  const method =\n    options.replace\n      ? \"replaceState\"\n      : \"pushState\";\n\n  window.history[method](\n    {},\n    \"\",\n    next,\n  );\n  window.dispatchEvent(\n    new PopStateEvent(\"popstate\"),\n  );\n}\n"}, "app/api.js": {"content": "const responseCache = new Map();\n\nexport class NavigatorApiError extends Error {\n  constructor(message, options = {}) {\n    super(message);\n    this.name = \"NavigatorApiError\";\n    this.status = options.status ?? 0;\n    this.code = options.code ?? \"NAVIGATOR_API_ERROR\";\n    this.details = options.details ?? null;\n  }\n}\n\nexport async function loadNavigatorSnapshot(\n  options = {},\n) {\n  const signal = options.signal;\n\n  const [\n    health,\n    artefacts,\n    library,\n    state,\n    git,\n  ] = await Promise.all([\n    getJson(\"/api/health\", { signal }),\n    getJson(\"/api/artifacts\", { signal }),\n    getJson(\"/api/library\", { signal }),\n    getJson(\"/api/state\", {\n      signal,\n      cache: false,\n    }),\n    getJson(\"/api/git/status\", {\n      signal,\n      cache: false,\n    }),\n  ]);\n\n  return {\n    health,\n    artefacts:\n      artefacts.artifacts ?? [],\n    library:\n      library.entries ?? [],\n    librarySummary:\n      library.summary ?? {},\n    libraryIssues:\n      library.issues ?? [],\n    state,\n    git,\n  };\n}\n\nexport async function getJson(\n  path,\n  options = {},\n) {\n  const cached =\n    responseCache.get(path);\n  const headers = new Headers(\n    options.headers,\n  );\n\n  if (\n    options.cache !== false &&\n    cached?.etag\n  ) {\n    headers.set(\n      \"If-None-Match\",\n      cached.etag,\n    );\n  }\n\n  const response = await fetch(\n    path,\n    {\n      method: \"GET\",\n      headers,\n      signal: options.signal,\n      credentials: \"same-origin\",\n    },\n  );\n\n  if (\n    response.status === 304 &&\n    cached\n  ) {\n    return cached.data;\n  }\n\n  let envelope;\n\n  try {\n    envelope =\n      await response.json();\n  } catch {\n    throw new NavigatorApiError(\n      `The server returned an unreadable response for ${path}.`,\n      {\n        status: response.status,\n        code:\n          \"NAVIGATOR_RESPONSE_INVALID\",\n      },\n    );\n  }\n\n  if (\n    !response.ok ||\n    envelope.ok !== true\n  ) {\n    throw new NavigatorApiError(\n      envelope.error?.message ??\n        `Request failed for ${path}.`,\n      {\n        status: response.status,\n        code:\n          envelope.error?.code ??\n          \"NAVIGATOR_REQUEST_FAILED\",\n        details:\n          envelope.error?.details ??\n          null,\n      },\n    );\n  }\n\n  const data = envelope.data;\n  const etag =\n    response.headers.get(\"etag\");\n\n  if (\n    options.cache !== false &&\n    etag\n  ) {\n    responseCache.set(path, {\n      etag,\n      data,\n    });\n  }\n\n  return data;\n}\n\nexport function clearApiCache() {\n  responseCache.clear();\n}\n"}, "app/main.js": {"content": "import {\n  clearApiCache,\n  loadNavigatorSnapshot,\n} from \"./api.js\";\nimport {\n  NAVIGATOR_ROUTES,\n  navigate,\n  routeForPath,\n} from \"./router.js\";\n\nconst elements = {\n  nav:\n    document.querySelector(\n      \"#navigator-nav\",\n    ),\n  navToggle:\n    document.querySelector(\n      \"#nav-toggle\",\n    ),\n  categorySelector:\n    document.querySelector(\n      \"#category-selector\",\n    ),\n  connection:\n    document.querySelector(\n      \"#connection-status\",\n    ),\n  connectionLabel:\n    document.querySelector(\n      \"#connection-status-label\",\n    ),\n  main:\n    document.querySelector(\n      \"#page-content\",\n    ),\n  footerRevision:\n    document.querySelector(\n      \"#footer-revision\",\n    ),\n};\n\nconst state = {\n  snapshot: null,\n  route: routeForPath(\n    window.location.pathname,\n  ),\n  eventSource: null,\n  loadingController: null,\n  revisionId: null,\n};\n\ninitialise().catch(\n  renderFatalError,\n);\n\nasync function initialise() {\n  bindNavigation();\n  restoreNavigationState();\n  updateRouteChrome();\n  await refreshSnapshot({\n    focus: false,\n  });\n  connectRevisionEvents();\n}\n\nfunction bindNavigation() {\n  elements.navToggle.addEventListener(\n    \"click\",\n    () => {\n      setNavOpen(\n        elements.nav.dataset.open !==\n          \"true\",\n      );\n    },\n  );\n\n  elements.categorySelector.addEventListener(\n    \"change\",\n    () => {\n      navigate(\n        elements.categorySelector.value,\n      );\n    },\n  );\n\n  document.addEventListener(\n    \"click\",\n    (event) => {\n      const link =\n        event.target.closest(\n          \"[data-navigator-link]\",\n        );\n\n      if (link) {\n        event.preventDefault();\n        navigate(\n          link.getAttribute(\"href\"),\n        );\n        setNavOpen(false);\n        return;\n      }\n\n      if (\n        elements.nav.dataset.open ===\n          \"true\" &&\n        !elements.nav.contains(\n          event.target,\n        )\n      ) {\n        setNavOpen(false);\n      }\n    },\n  );\n\n  document.addEventListener(\n    \"keydown\",\n    (event) => {\n      if (\n        event.key === \"Escape\" &&\n        elements.nav.dataset.open ===\n          \"true\"\n      ) {\n        setNavOpen(false);\n        elements.navToggle.focus();\n      }\n    },\n  );\n\n  window.addEventListener(\n    \"popstate\",\n    () => {\n      state.route = routeForPath(\n        window.location.pathname,\n      );\n      updateRouteChrome();\n      renderCurrentRoute({\n        focus: true,\n      });\n    },\n  );\n}\n\nfunction restoreNavigationState() {\n  const saved =\n    window.localStorage.getItem(\n      \"mydash.navigator.nav-open\",\n    );\n\n  setNavOpen(saved === \"true\", {\n    persist: false,\n  });\n}\n\nfunction setNavOpen(\n  open,\n  options = {},\n) {\n  elements.nav.dataset.open =\n    String(open);\n  elements.navToggle.setAttribute(\n    \"aria-expanded\",\n    String(open),\n  );\n\n  if (options.persist !== false) {\n    window.localStorage.setItem(\n      \"mydash.navigator.nav-open\",\n      String(open),\n    );\n  }\n}\n\nasync function refreshSnapshot(\n  options = {},\n) {\n  state.loadingController?.abort();\n  state.loadingController =\n    new AbortController();\n\n  setConnection(\n    \"loading\",\n    state.snapshot\n      ? \"Refreshing\"\n      : \"Connecting\",\n  );\n\n  try {\n    const snapshot =\n      await loadNavigatorSnapshot({\n        signal:\n          state.loadingController.signal,\n      });\n\n    state.snapshot = snapshot;\n    state.revisionId =\n      snapshot.state?.revision?.id ??\n      snapshot.health?.revision?.id ??\n      null;\n\n    setConnection(\n      \"ready\",\n      \"Workspace live\",\n    );\n    updateRevisionLabel();\n    renderCurrentRoute({\n      focus:\n        options.focus ?? false,\n    });\n  } catch (error) {\n    if (\n      error?.name === \"AbortError\"\n    ) {\n      return;\n    }\n\n    setConnection(\n      state.snapshot\n        ? \"stale\"\n        : \"error\",\n      state.snapshot\n        ? \"Showing cached state\"\n        : \"Connection failed\",\n    );\n\n    if (!state.snapshot) {\n      renderFatalError(error);\n    }\n  }\n}\n\nfunction connectRevisionEvents() {\n  state.eventSource?.close();\n\n  const source =\n    new EventSource(\"/api/events\");\n  state.eventSource = source;\n\n  source.addEventListener(\n    \"workspace-revision\",\n    (event) => {\n      let revision;\n\n      try {\n        revision =\n          JSON.parse(event.data);\n      } catch {\n        return;\n      }\n\n      if (\n        revision.id &&\n        revision.id !==\n          state.revisionId\n      ) {\n        state.revisionId =\n          revision.id;\n        clearApiCache();\n        refreshSnapshot({\n          focus: false,\n        });\n      }\n    },\n  );\n\n  source.addEventListener(\n    \"open\",\n    () => {\n      if (state.snapshot) {\n        setConnection(\n          \"ready\",\n          \"Workspace live\",\n        );\n      }\n    },\n  );\n\n  source.addEventListener(\n    \"error\",\n    () => {\n      if (state.snapshot) {\n        setConnection(\n          \"stale\",\n          \"Reconnecting\",\n        );\n      }\n    },\n  );\n}\n\nfunction updateRouteChrome() {\n  elements.categorySelector.value =\n    state.route.path;\n  document.title =\n    state.route.id === \"home\"\n      ? \"My Dashboards\"\n      : `${state.route.title} · My Dashboards`;\n\n  for (\n    const link of document.querySelectorAll(\n      \"[data-navigator-link]\",\n    )\n  ) {\n    const current =\n      link.dataset.route ===\n      state.route.id;\n\n    if (current) {\n      link.setAttribute(\n        \"aria-current\",\n        \"page\",\n      );\n    } else {\n      link.removeAttribute(\n        \"aria-current\",\n      );\n    }\n  }\n}\n\nfunction renderCurrentRoute(\n  options = {},\n) {\n  if (!state.snapshot) return;\n\n  const view = {\n    home: renderHome,\n    dashboards: () =>\n      renderCategory({\n        kind: \"dashboard\",\n        singular: \"dashboard\",\n        plural: \"dashboards\",\n        title: \"Dashboards\",\n        description:\n          \"Operational views, decision support and live portfolio summaries.\",\n      }),\n    presentations: () =>\n      renderCategory({\n        kind: \"presentation\",\n        singular: \"presentation\",\n        plural: \"presentations\",\n        title: \"Presentations\",\n        description:\n          \"Narrative artefacts designed to explain evidence, implications and action.\",\n      }),\n    concepts: () =>\n      renderCategory({\n        kind: \"concept\",\n        singular: \"concept\",\n        plural: \"concepts\",\n        title: \"Concepts\",\n        description:\n          \"Lightweight prototypes for exploring an idea before it becomes shared architecture.\",\n      }),\n    components:\n      renderComponents,\n    settings:\n      renderSettings,\n  }[state.route.id];\n\n  elements.main.replaceChildren(\n    view(),\n  );\n\n  if (options.focus) {\n    elements.main.focus({\n      preventScroll: true,\n    });\n  }\n}\n\nfunction renderHome() {\n  const fragment =\n    document.createDocumentFragment();\n  const counts =\n    artifactCounts();\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Repository navigator\",\n      title:\n        \"Everything you make, in one place.\",\n      summary:\n        \"Browse dashboards, presentations, concepts and shared UI directly from the filesystem.\",\n      asideValue:\n        String(\n          state.snapshot.artefacts.length,\n        ),\n      asideLabel:\n        pluralise(\n          state.snapshot.artefacts.length,\n          \"artefact\",\n          \"artefacts\",\n        ),\n    }),\n  );\n\n  const overview = element(\n    \"section\",\n    \"overview-grid\",\n  );\n  overview.setAttribute(\n    \"aria-label\",\n    \"Artefact categories\",\n  );\n\n  for (const item of [\n    {\n      route: \"/dashboards\",\n      label: \"Dashboards\",\n      count: counts.dashboard,\n    },\n    {\n      route: \"/presentations\",\n      label: \"Presentations\",\n      count:\n        counts.presentation,\n    },\n    {\n      route: \"/concepts\",\n      label: \"Concepts\",\n      count: counts.concept,\n    },\n    {\n      route: \"/components\",\n      label: \"Shared UI\",\n      count:\n        state.snapshot.library.filter(\n          isUiResource,\n        ).length,\n    },\n  ]) {\n    overview.append(\n      overviewCard(item),\n    );\n  }\n\n  fragment.append(overview);\n\n  const statusSection = element(\n    \"section\",\n    \"section-block\",\n  );\n  statusSection.append(\n    sectionHeading(\n      \"Workspace status\",\n      \"Live repository state from the shared server services.\",\n    ),\n  );\n\n  const statusGrid = element(\n    \"div\",\n    \"status-grid\",\n  );\n  statusGrid.append(\n    workspaceStatusPanel(),\n    cacheStatusPanel(),\n  );\n  statusSection.append(statusGrid);\n  fragment.append(statusSection);\n\n  return fragment;\n}\n\nfunction renderCategory(config) {\n  const matching =\n    state.snapshot.artefacts.filter(\n      (item) =>\n        item.kind === config.kind,\n    );\n  const fragment =\n    document.createDocumentFragment();\n  const intro = element(\n    \"section\",\n    \"category-intro\",\n  );\n  const copy = element(\"div\");\n  copy.append(\n    element(\n      \"p\",\n      \"navigator-eyebrow\",\n      \"Artefact library\",\n    ),\n    element(\n      \"h2\",\n      \"\",\n      config.title,\n    ),\n    element(\n      \"p\",\n      \"\",\n      config.description,\n    ),\n  );\n\n  if (matching.length > 0) {\n    const first = matching[0];\n    const action = element(\n      \"a\",\n      \"primary-action\",\n      `Open ${first.title}`,\n    );\n    action.href =\n      `/api/artifacts/${encodeURIComponent(\n        first.kind,\n      )}/${encodeURIComponent(\n        first.id,\n      )}/preview`;\n    action.target = \"_blank\";\n    action.rel = \"noreferrer\";\n    copy.append(action);\n  }\n\n  const count = element(\n    \"div\",\n    \"category-intro__count\",\n  );\n  count.append(\n    element(\n      \"strong\",\n      \"\",\n      String(matching.length),\n    ),\n    element(\n      \"span\",\n      \"\",\n      pluralise(\n        matching.length,\n        config.singular,\n        config.plural,\n      ),\n    ),\n  );\n  intro.append(copy, count);\n  fragment.append(intro);\n\n  const note = element(\n    \"div\",\n    \"empty-category\",\n  );\n\n  if (matching.length === 0) {\n    note.append(\n      element(\n        \"strong\",\n        \"\",\n        `No ${config.plural} yet`,\n      ),\n      element(\n        \"span\",\n        \"\",\n        `Create one with the /${config.singular} skill or add a valid artefact folder to the repository.`,\n      ),\n    );\n  } else {\n    note.append(\n      element(\n        \"strong\",\n        \"\",\n        `${matching.length} discovered from the filesystem`,\n      ),\n      element(\n        \"span\",\n        \"\",\n        \"Miniature preview cards and the full visual gallery are added in the next navigator layer.\",\n      ),\n    );\n  }\n\n  fragment.append(note);\n  return fragment;\n}\n\nfunction renderComponents() {\n  const fragment =\n    document.createDocumentFragment();\n  const resources =\n    state.snapshot.library.filter(\n      isLibraryResource,\n    );\n  const counts = countBy(\n    resources,\n    (item) => item.kind,\n  );\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Shared library\",\n      title:\n        \"Primitives, components and layouts.\",\n      summary:\n        \"Core stays small. New UI begins locally and earns promotion through real reuse.\",\n      asideValue:\n        String(resources.length),\n      asideLabel:\n        pluralise(\n          resources.length,\n          \"resource\",\n          \"resources\",\n        ),\n    }),\n  );\n\n  const grid = element(\n    \"section\",\n    \"library-grid\",\n  );\n  grid.setAttribute(\n    \"aria-label\",\n    \"Library resource counts\",\n  );\n\n  for (const item of [\n    [\"Primitives\", \"primitive\"],\n    [\"Components\", \"component\"],\n    [\"Layouts\", \"layout\"],\n    [\"Themes\", \"theme\"],\n    [\"Presets\", \"preset\"],\n    [\"Assets\", \"asset\"],\n  ]) {\n    const card = element(\n      \"article\",\n      \"library-stat\",\n    );\n    card.append(\n      element(\n        \"span\",\n        \"\",\n        item[0],\n      ),\n      element(\n        \"strong\",\n        \"\",\n        String(\n          counts[item[1]] ?? 0,\n        ),\n      ),\n    );\n    grid.append(card);\n  }\n\n  fragment.append(grid);\n\n  const levels = countBy(\n    resources,\n    (item) =>\n      item.level ?? \"unscoped\",\n  );\n  const lifecycle = element(\n    \"section\",\n    \"section-block\",\n  );\n  lifecycle.append(\n    sectionHeading(\n      \"Reuse lifecycle\",\n      \"Prefer consuming Core. Prefer creating locally.\",\n    ),\n  );\n\n  const statusGrid = element(\n    \"div\",\n    \"status-grid\",\n  );\n  statusGrid.append(\n    definitionPanel(\n      \"Current scope\",\n      [\n        [\n          \"Core\",\n          String(levels.core ?? 0),\n        ],\n        [\n          \"Collection\",\n          String(\n            levels.collection ?? 0,\n          ),\n        ],\n        [\n          \"Local\",\n          String(levels.local ?? 0),\n        ],\n      ],\n    ),\n    definitionPanel(\n      \"Library health\",\n      [\n        [\n          \"Discovery issues\",\n          String(\n            state.snapshot\n              .libraryIssues.length,\n          ),\n        ],\n        [\n          \"Resources\",\n          String(resources.length),\n        ],\n        [\n          \"Revision\",\n          shortRevision(),\n        ],\n      ],\n    ),\n  );\n  lifecycle.append(statusGrid);\n  fragment.append(lifecycle);\n\n  return fragment;\n}\n\nfunction renderSettings() {\n  const fragment =\n    document.createDocumentFragment();\n  const git = state.snapshot.git ?? {};\n  const revision =\n    state.snapshot.state?.revision ??\n    {};\n  const caches =\n    state.snapshot.state?.caches ??\n    {};\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Workspace\",\n      title:\n        \"Settings and runtime state.\",\n      summary:\n        \"The navigator is read-only. Appearance preferences and personal defaults arrive in a later layer.\",\n      asideValue:\n        git.clean === true\n          ? \"Clean\"\n          : \"Live\",\n      asideLabel:\n        git.branch\n          ? `Branch ${git.branch}`\n          : \"Repository status\",\n    }),\n  );\n\n  const grid = element(\n    \"section\",\n    \"settings-grid\",\n  );\n  grid.append(\n    definitionPanel(\n      \"Workspace\",\n      [\n        [\n          \"Name\",\n          state.snapshot.health\n            ?.workspace?.name ??\n            \"My Dashboards\",\n        ],\n        [\n          \"Revision\",\n          revision.id ??\n            \"Unavailable\",\n        ],\n        [\n          \"Sequence\",\n          String(\n            revision.sequence ?? \"—\",\n          ),\n        ],\n        [\n          \"Detected\",\n          formatTimestamp(\n            revision.detectedAt,\n          ),\n        ],\n      ],\n      \"settings-card\",\n    ),\n    definitionPanel(\n      \"Git\",\n      [\n        [\n          \"Branch\",\n          git.branch ??\n            \"Unavailable\",\n        ],\n        [\n          \"Clean\",\n          git.clean === true\n            ? \"Yes\"\n            : git.clean === false\n              ? \"No\"\n              : \"Unknown\",\n        ],\n        [\n          \"Upstream\",\n          git.upstream ??\n            \"Not configured\",\n        ],\n        [\n          \"Changes\",\n          String(\n            git.changes?.length ??\n            git.changeCount ??\n            0,\n          ),\n        ],\n      ],\n      \"settings-card\",\n    ),\n    definitionPanel(\n      \"Server caches\",\n      Object.entries(caches).map(\n        ([name, value]) => [\n          titleCase(name),\n          `${value.size ?? 0} / ${value.maxEntries ?? \"—\"} entries`,\n        ],\n      ),\n      \"settings-card\",\n    ),\n    definitionPanel(\n      \"Runtime\",\n      [\n        [\n          \"Service\",\n          state.snapshot.health\n            ?.service ??\n            \"my-dashboards\",\n        ],\n        [\n          \"Version\",\n          state.snapshot.health\n            ?.version ??\n            \"Unknown\",\n        ],\n        [\n          \"Uptime\",\n          formatDuration(\n            state.snapshot.health\n              ?.uptimeSeconds,\n          ),\n        ],\n        [\n          \"HTTP mode\",\n          \"Read-only\",\n        ],\n      ],\n      \"settings-card\",\n    ),\n  );\n\n  fragment.append(grid);\n  return fragment;\n}\n\nfunction pageHeading(config) {\n  const section = element(\n    \"header\",\n    \"page-heading\",\n  );\n  const copy = element(\"div\");\n  copy.append(\n    element(\n      \"p\",\n      \"navigator-eyebrow\",\n      config.eyebrow,\n    ),\n    element(\n      \"h1\",\n      \"\",\n      config.title,\n    ),\n    element(\n      \"p\",\n      \"page-heading__summary\",\n      config.summary,\n    ),\n  );\n\n  const aside = element(\n    \"div\",\n    \"page-heading__aside\",\n  );\n  aside.append(\n    element(\n      \"strong\",\n      \"\",\n      config.asideValue,\n    ),\n    element(\n      \"span\",\n      \"\",\n      config.asideLabel,\n    ),\n  );\n\n  section.append(copy, aside);\n  return section;\n}\n\nfunction overviewCard(item) {\n  const card = element(\n    \"a\",\n    \"overview-card\",\n  );\n  card.href = item.route;\n  card.dataset.navigatorLink = \"\";\n  card.append(\n    element(\n      \"div\",\n      \"\",\n    ),\n  );\n\n  const label = element(\n    \"div\",\n  );\n  label.append(\n    element(\n      \"span\",\n      \"overview-card__label\",\n      item.label,\n    ),\n    element(\n      \"strong\",\n      \"overview-card__count\",\n      String(item.count),\n    ),\n  );\n\n  card.replaceChildren(\n    label,\n    element(\n      \"span\",\n      \"overview-card__action\",\n      \"Open section →\",\n    ),\n  );\n\n  return card;\n}\n\nfunction workspaceStatusPanel() {\n  const panel = element(\n    \"article\",\n    \"status-panel\",\n  );\n  const top = element(\n    \"div\",\n    \"status-panel__topline\",\n  );\n  top.append(\n    element(\n      \"h3\",\n      \"\",\n      \"Repository\",\n    ),\n    element(\n      \"span\",\n      \"status-badge\",\n      \"Live\",\n    ),\n  );\n\n  const list =\n    definitionList([\n      [\n        \"Workspace\",\n        state.snapshot.health\n          ?.workspace?.name ??\n          \"My Dashboards\",\n      ],\n      [\n        \"Branch\",\n        state.snapshot.git?.branch ??\n          \"Unknown\",\n      ],\n      [\n        \"Revision\",\n        shortRevision(),\n      ],\n    ]);\n\n  panel.append(top, list);\n  return panel;\n}\n\nfunction cacheStatusPanel() {\n  const caches =\n    state.snapshot.state?.caches ??\n    {};\n  const values =\n    Object.values(caches);\n  const hits = values.reduce(\n    (sum, value) =>\n      sum +\n      (value.metrics?.hits ?? 0),\n    0,\n  );\n  const loads = values.reduce(\n    (sum, value) =>\n      sum +\n      (value.metrics?.loads ?? 0),\n    0,\n  );\n\n  return definitionPanel(\n    \"Shared services\",\n    [\n      [\n        \"Cache hits\",\n        String(hits),\n      ],\n      [\n        \"Loads\",\n        String(loads),\n      ],\n      [\n        \"Library issues\",\n        String(\n          state.snapshot\n            .libraryIssues.length,\n        ),\n      ],\n    ],\n  );\n}\n\nfunction definitionPanel(\n  title,\n  rows,\n  className = \"status-panel\",\n) {\n  const panel = element(\n    \"article\",\n    className,\n  );\n  panel.append(\n    element(\n      \"h2\",\n      \"\",\n      title,\n    ),\n    definitionList(rows),\n  );\n  return panel;\n}\n\nfunction definitionList(rows) {\n  const list = element(\n    \"dl\",\n    \"status-list\",\n  );\n\n  for (const [term, value] of rows) {\n    const item = element(\"div\");\n    item.append(\n      element(\n        \"dt\",\n        \"\",\n        term,\n      ),\n      element(\n        \"dd\",\n        \"\",\n        value,\n      ),\n    );\n    list.append(item);\n  }\n\n  return list;\n}\n\nfunction sectionHeading(\n  title,\n  supporting,\n) {\n  const heading = element(\n    \"header\",\n    \"section-heading\",\n  );\n  heading.append(\n    element(\n      \"h2\",\n      \"\",\n      title,\n    ),\n    element(\n      \"p\",\n      \"\",\n      supporting,\n    ),\n  );\n  return heading;\n}\n\nfunction artifactCounts() {\n  return countBy(\n    state.snapshot.artefacts,\n    (item) => item.kind,\n  );\n}\n\nfunction countBy(items, selector) {\n  const result = {};\n\n  for (const item of items) {\n    const key = selector(item);\n    result[key] =\n      (result[key] ?? 0) + 1;\n  }\n\n  return result;\n}\n\nfunction isLibraryResource(item) {\n  return [\n    \"primitive\",\n    \"component\",\n    \"layout\",\n    \"theme\",\n    \"preset\",\n    \"asset\",\n  ].includes(item.kind);\n}\n\nfunction isUiResource(item) {\n  return [\n    \"primitive\",\n    \"component\",\n    \"layout\",\n  ].includes(item.kind);\n}\n\nfunction setConnection(\n  mode,\n  label,\n) {\n  elements.connection.dataset.state =\n    mode;\n  elements.connectionLabel.textContent =\n    label;\n}\n\nfunction updateRevisionLabel() {\n  elements.footerRevision.textContent =\n    state.revisionId\n      ? `Revision ${shortRevision()}`\n      : \"Revision unavailable\";\n}\n\nfunction shortRevision() {\n  return (\n    state.revisionId?.slice(0, 8) ??\n    \"unknown\"\n  );\n}\n\nfunction formatTimestamp(value) {\n  if (!value) return \"Unavailable\";\n\n  const date = new Date(value);\n\n  if (Number.isNaN(date.getTime())) {\n    return String(value);\n  }\n\n  return new Intl.DateTimeFormat(\n    \"en-GB\",\n    {\n      dateStyle: \"medium\",\n      timeStyle: \"short\",\n    },\n  ).format(date);\n}\n\nfunction formatDuration(value) {\n  if (\n    !Number.isFinite(value)\n  ) {\n    return \"Unknown\";\n  }\n\n  if (value < 60) {\n    return `${Math.floor(value)} sec`;\n  }\n\n  if (value < 3600) {\n    return `${Math.floor(\n      value / 60,\n    )} min`;\n  }\n\n  return `${Math.floor(\n    value / 3600,\n  )} hr ${Math.floor(\n    (value % 3600) / 60,\n  )} min`;\n}\n\nfunction pluralise(\n  count,\n  singular,\n  plural,\n) {\n  return count === 1\n    ? singular\n    : plural;\n}\n\nfunction titleCase(value) {\n  return String(value)\n    .replaceAll(\"-\", \" \")\n    .replace(/\\b\\w/g, (letter) =>\n      letter.toUpperCase(),\n    );\n}\n\nfunction element(\n  tagName,\n  className = \"\",\n  text = null,\n) {\n  const result =\n    document.createElement(tagName);\n\n  if (className) {\n    result.className = className;\n  }\n\n  if (text !== null) {\n    result.textContent = text;\n  }\n\n  return result;\n}\n\nfunction renderFatalError(error) {\n  console.error(error);\n  setConnection(\n    \"error\",\n    \"Connection failed\",\n  );\n\n  const section = element(\n    \"section\",\n    \"navigator-error\",\n  );\n  section.append(\n    element(\n      \"h1\",\n      \"\",\n      \"The navigator could not open\",\n    ),\n    element(\n      \"p\",\n      \"\",\n      error instanceof Error\n        ? error.message\n        : String(error),\n    ),\n  );\n  elements.main.replaceChildren(\n    section,\n  );\n}\n"}, "server/routes/navigator.mjs": {"content": "import express, {\n  Router,\n} from \"express\";\nimport {\n  join,\n} from \"node:path\";\n\nexport const NAVIGATOR_PATHS = Object.freeze([\n  \"/\",\n  \"/dashboards\",\n  \"/presentations\",\n  \"/concepts\",\n  \"/components\",\n  \"/settings\",\n]);\n\nconst CONTENT_SECURITY_POLICY = [\n  \"default-src 'self'\",\n  \"base-uri 'none'\",\n  \"connect-src 'self'\",\n  \"font-src 'self'\",\n  \"form-action 'self'\",\n  \"frame-ancestors 'self'\",\n  \"img-src 'self' data:\",\n  \"object-src 'none'\",\n  \"script-src 'self'\",\n  \"style-src 'self'\",\n].join(\"; \");\n\nexport function createNavigatorRouter(\n  context,\n) {\n  const router = Router();\n  const root =\n    context.navigatorRoot;\n  const indexPath =\n    join(root, \"index.html\");\n\n  router.use(\n    \"/navigator\",\n    express.static(root, {\n      dotfiles: \"deny\",\n      etag: true,\n      fallthrough: true,\n      immutable: false,\n      index: false,\n      lastModified: true,\n      maxAge: 0,\n      redirect: false,\n      setHeaders(response) {\n        setNavigatorHeaders(\n          response,\n          {\n            contentType:\n              response.getHeader(\n                \"Content-Type\",\n              ),\n          },\n        );\n      },\n    }),\n  );\n\n  router.get(\n    NAVIGATOR_PATHS,\n    (request, response, next) => {\n      setNavigatorHeaders(response);\n      response.sendFile(\n        indexPath,\n        (error) => {\n          if (error) next(error);\n        },\n      );\n    },\n  );\n\n  return router;\n}\n\nfunction setNavigatorHeaders(\n  response,\n) {\n  response.setHeader(\n    \"Cache-Control\",\n    \"private, no-cache, must-revalidate\",\n  );\n  response.setHeader(\n    \"Content-Security-Policy\",\n    CONTENT_SECURITY_POLICY,\n  );\n  response.setHeader(\n    \"Permissions-Policy\",\n    \"camera=(), microphone=(), geolocation=(), payment=(), usb=()\",\n  );\n  response.setHeader(\n    \"X-Frame-Options\",\n    \"SAMEORIGIN\",\n  );\n}\n"}, "server/app.mjs": {"content": "import express from \"express\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport {\n  loadWorkspaceConfig,\n} from \"../src/workspace/load-config.mjs\";\nimport {\n  loadPackageMetadata,\n} from \"../src/workspace/package-metadata.mjs\";\nimport {\n  errorHandler,\n  notFoundHandler,\n} from \"./middleware/errors.mjs\";\nimport {\n  requestContext,\n} from \"./middleware/request-context.mjs\";\nimport {\n  securityHeaders,\n} from \"./middleware/security.mjs\";\nimport {\n  createApiRouter,\n} from \"./routes/index.mjs\";\nimport {\n  createNavigatorRouter,\n} from \"./routes/navigator.mjs\";\nimport {\n  createNavigatorServices,\n} from \"./services/navigator-services.mjs\";\n\nconst DEFAULT_NAVIGATOR_ROOT = resolve(\n  dirname(\n    fileURLToPath(import.meta.url),\n  ),\n  \"../app\",\n);\n\nexport async function createApplication(\n  options,\n) {\n  const workspaceRoot =\n    options.workspaceRoot;\n  const now =\n    options.now ?? (() => new Date());\n  const logger =\n    options.logger ?? defaultLogger;\n  const config =\n    options.config ??\n    (await loadWorkspaceConfig(\n      workspaceRoot,\n    ));\n  const packageMetadata =\n    options.packageMetadata ??\n    (await loadPackageMetadata(\n      workspaceRoot,\n    ));\n  const startedAt =\n    options.startedAt ?? now();\n  const services =\n    options.services ??\n    createNavigatorServices({\n      workspaceRoot,\n      now,\n      logger,\n      pollIntervalMs:\n        options.revisionPollIntervalMs,\n      minimumCheckIntervalMs:\n        options.minimumRevisionCheckIntervalMs,\n    });\n\n  await services.start();\n\n  const context = {\n    workspaceRoot,\n    navigatorRoot:\n      options.navigatorRoot ??\n      DEFAULT_NAVIGATOR_ROOT,\n    config,\n    packageMetadata,\n    now,\n    startedAt,\n    logger,\n    services,\n  };\n  const app = express();\n\n  app.disable(\"x-powered-by\");\n  app.set(\"query parser\", \"simple\");\n  app.use(\n    requestContext({\n      now,\n      logger,\n    }),\n  );\n  app.use(securityHeaders);\n  app.use(\n    \"/api\",\n    express.json({\n      limit: \"64kb\",\n      strict: true,\n      type: \"application/json\",\n    }),\n  );\n  app.use(\n    \"/api\",\n    createApiRouter(context),\n  );\n  app.use(\n    createNavigatorRouter(context),\n  );\n  app.use(notFoundHandler);\n  app.use(\n    errorHandler({ logger }),\n  );\n\n  let closed = false;\n\n  return {\n    app,\n    context,\n    async close() {\n      if (closed) return;\n      closed = true;\n      await services.close();\n    },\n  };\n}\n\nfunction defaultLogger(record) {\n  process.stdout.write(\n    `${JSON.stringify(record)}\\n`,\n  );\n}\n", "allowedPrevious": ["import express from \"express\";\nimport {\n  loadWorkspaceConfig,\n} from \"../src/workspace/load-config.mjs\";\nimport {\n  loadPackageMetadata,\n} from \"../src/workspace/package-metadata.mjs\";\nimport {\n  errorHandler,\n  notFoundHandler,\n} from \"./middleware/errors.mjs\";\nimport {\n  requestContext,\n} from \"./middleware/request-context.mjs\";\nimport {\n  securityHeaders,\n} from \"./middleware/security.mjs\";\nimport {\n  createApiRouter,\n} from \"./routes/index.mjs\";\nimport {\n  createNavigatorServices,\n} from \"./services/navigator-services.mjs\";\n\nexport async function createApplication(\n  options,\n) {\n  const workspaceRoot =\n    options.workspaceRoot;\n  const now =\n    options.now ?? (() => new Date());\n  const logger =\n    options.logger ?? defaultLogger;\n  const config =\n    options.config ??\n    (await loadWorkspaceConfig(\n      workspaceRoot,\n    ));\n  const packageMetadata =\n    options.packageMetadata ??\n    (await loadPackageMetadata(\n      workspaceRoot,\n    ));\n  const startedAt =\n    options.startedAt ?? now();\n  const services =\n    options.services ??\n    createNavigatorServices({\n      workspaceRoot,\n      now,\n      logger,\n      pollIntervalMs:\n        options.revisionPollIntervalMs,\n      minimumCheckIntervalMs:\n        options.minimumRevisionCheckIntervalMs,\n    });\n\n  await services.start();\n\n  const context = {\n    workspaceRoot,\n    config,\n    packageMetadata,\n    now,\n    startedAt,\n    logger,\n    services,\n  };\n  const app = express();\n\n  app.disable(\"x-powered-by\");\n  app.set(\"query parser\", \"simple\");\n  app.use(\n    requestContext({\n      now,\n      logger,\n    }),\n  );\n  app.use(securityHeaders);\n  app.use(\n    \"/api\",\n    express.json({\n      limit: \"64kb\",\n      strict: true,\n      type: \"application/json\",\n    }),\n  );\n\n  app.get(\"/\", (request, response) => {\n    response.redirect(307, \"/api\");\n  });\n  app.use(\n    \"/api\",\n    createApiRouter(context),\n  );\n  app.use(notFoundHandler);\n  app.use(\n    errorHandler({ logger }),\n  );\n\n  let closed = false;\n\n  return {\n    app,\n    context,\n    async close() {\n      if (closed) return;\n      closed = true;\n      await services.close();\n    },\n  };\n}\n\nfunction defaultLogger(record) {\n  process.stdout.write(\n    `${JSON.stringify(record)}\\n`,\n  );\n}\n"]}, "server/README.md": {"content": "# HTTP server\n\nThe server is a thin Express interface over the same shared services used by the\nCLI. It does not reimplement discovery, resolution, export, validation or Git\nlogic.\n\n## Start\n\n```text\nnpm start\n```\n\nThe default address comes from `config/workspace.json`:\n\n```text\nhttp://127.0.0.1:4173\n```\n\nEnvironment overrides:\n\n```text\nMYDASH_HOST=127.0.0.1\nMYDASH_PORT=4173\n```\n\n## API\n\n```text\nGET  /api\nGET  /api/health\nGET  /api/capabilities\n\nGET  /api/library\nGET  /api/library/:kind/:id\n\nGET  /api/artifacts\nGET  /api/artifacts/:kind/:id\nGET  /api/artifacts/:kind/:id/preview\n\nPOST /api/validation\n\nGET  /api/git/status\n```\n\nThe server is deliberately read-only at this stage. Preview and validation\nbuilds happen in memory. It does not expose file writes, recipe refreshes,\nexports to disk, Git commits or pushes.\n\n## Response envelope\n\nJSON responses use:\n\n```json\n{\n  \"ok\": true,\n  \"data\": {},\n  \"meta\": {\n    \"requestId\": \"uuid\",\n    \"durationMs\": 3\n  }\n}\n```\n\nErrors use the same metadata with an `error` object.\n\n## Security\n\n- `X-Powered-By` is disabled.\n- API responses are not cached.\n- JSON request bodies are limited to 64 KiB.\n- Request IDs are validated before reuse.\n- The default host is loopback-only.\n- No CORS middleware is installed.\n- Preview HTML is generated through the standalone export validator.\n\n\n## Live state and caching\n\nBootstrap 14 adds a revision-aware service layer:\n\n```text\nGET /api/state\nGET /api/events\n```\n\nThe workspace revision is calculated from filesystem metadata beneath\n`config/`, `library/`, `recipes/` and `package.json`. The poller does not read\nor execute artefact code.\n\nLibrary scans, standalone previews and validation reports are cached against the\ncurrent revision. A detected change clears every revision-bound cache.\n\nRead-only GET routes return ETags. Clients may send `If-None-Match`; unchanged\nresponses return `304 Not Modified`.\n\nThe event stream emits:\n\n```text\nevent: workspace-revision\ndata: {\"id\":\"...\",\"sequence\":2}\n```\n\nThe future navigator can invalidate its own state immediately instead of\npolling every endpoint.\n\n\n## Navigator UI\n\nBootstrap 18 serves the human-facing navigator from `app/`.\n\n```text\nGET /\nGET /dashboards\nGET /presentations\nGET /concepts\nGET /components\nGET /settings\n```\n\nStatic browser modules are served below:\n\n```text\n/navigator/\n```\n\nThe supported application routes return the same `index.html` document and the\nbrowser resolves the active route through the History API.\n\nNavigator responses apply a restrictive Content Security Policy and do not\npermit external scripts, external styles, camera, microphone, geolocation,\npayment or USB access.\n\nUnknown paths continue through the normal JSON 404 handler. API routes remain\nunder `/api`.\n", "allowedPrevious": ["# HTTP server\n\nThe server is a thin Express interface over the same shared services used by the\nCLI. It does not reimplement discovery, resolution, export, validation or Git\nlogic.\n\n## Start\n\n```text\nnpm start\n```\n\nThe default address comes from `config/workspace.json`:\n\n```text\nhttp://127.0.0.1:4173\n```\n\nEnvironment overrides:\n\n```text\nMYDASH_HOST=127.0.0.1\nMYDASH_PORT=4173\n```\n\n## API\n\n```text\nGET  /api\nGET  /api/health\nGET  /api/capabilities\n\nGET  /api/library\nGET  /api/library/:kind/:id\n\nGET  /api/artifacts\nGET  /api/artifacts/:kind/:id\nGET  /api/artifacts/:kind/:id/preview\n\nPOST /api/validation\n\nGET  /api/git/status\n```\n\nThe server is deliberately read-only at this stage. Preview and validation\nbuilds happen in memory. It does not expose file writes, recipe refreshes,\nexports to disk, Git commits or pushes.\n\n## Response envelope\n\nJSON responses use:\n\n```json\n{\n  \"ok\": true,\n  \"data\": {},\n  \"meta\": {\n    \"requestId\": \"uuid\",\n    \"durationMs\": 3\n  }\n}\n```\n\nErrors use the same metadata with an `error` object.\n\n## Security\n\n- `X-Powered-By` is disabled.\n- API responses are not cached.\n- JSON request bodies are limited to 64 KiB.\n- Request IDs are validated before reuse.\n- The default host is loopback-only.\n- No CORS middleware is installed.\n- Preview HTML is generated through the standalone export validator.\n\n\n## Live state and caching\n\nBootstrap 14 adds a revision-aware service layer:\n\n```text\nGET /api/state\nGET /api/events\n```\n\nThe workspace revision is calculated from filesystem metadata beneath\n`config/`, `library/`, `recipes/` and `package.json`. The poller does not read\nor execute artefact code.\n\nLibrary scans, standalone previews and validation reports are cached against the\ncurrent revision. A detected change clears every revision-bound cache.\n\nRead-only GET routes return ETags. Clients may send `If-None-Match`; unchanged\nresponses return `304 Not Modified`.\n\nThe event stream emits:\n\n```text\nevent: workspace-revision\ndata: {\"id\":\"...\",\"sequence\":2}\n```\n\nThe future navigator can invalidate its own state immediately instead of\npolling every endpoint.\n"]}, "src/workspace/capabilities.mjs": {"content": "export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"navigator.ui-shell\",\n        title: \"Human-facing navigator shell\",\n        available: true,\n        routes: [\n          \"/\",\n          \"/dashboards\",\n          \"/presentations\",\n          \"/concepts\",\n          \"/components\",\n          \"/settings\"\n        ],\n        liveRevisionEvents: true,\n      },\n      {\n        id: \"artifact.reference-dashboard\",\n        title: \"Reference governance dashboard\",\n        available: true,\n        artifactId: \"ai-use-case-governance\",\n        artifactKind: \"dashboard\",\n        standaloneExport: true,\n      },\n      {\n        id: \"library.minimal-core\",\n        title: \"Minimal reusable Core library\",\n        available: true,\n        resourceCount: 8,\n        defaultTheme: \"hsbc-light\",\n        defaultPreset: \"default\",\n        brandAsset: \"mydash-brand-mark\",\n      },\n      {\n        id: \"agent.skills\",\n        title: \"Project agent skills\",\n        available: true,\n        logicalSkillCount: 9,\n        commandCount: 10,\n        activeDirectory: \".claude/skills\",\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n", "allowedPrevious": ["export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"artifact.reference-dashboard\",\n        title: \"Reference governance dashboard\",\n        available: true,\n        artifactId: \"ai-use-case-governance\",\n        artifactKind: \"dashboard\",\n        standaloneExport: true,\n      },\n      {\n        id: \"library.minimal-core\",\n        title: \"Minimal reusable Core library\",\n        available: true,\n        resourceCount: 8,\n        defaultTheme: \"hsbc-light\",\n        defaultPreset: \"default\",\n        brandAsset: \"mydash-brand-mark\",\n      },\n      {\n        id: \"agent.skills\",\n        title: \"Project agent skills\",\n        available: true,\n        logicalSkillCount: 9,\n        commandCount: 10,\n        activeDirectory: \".claude/skills\",\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n"]}, "tests/unit/navigator-router.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport test from \"node:test\";\nimport {\n  NAVIGATOR_ROUTES,\n  isNavigatorPath,\n  normaliseNavigatorPath,\n  routeForId,\n  routeForPath,\n} from \"../../app/router.js\";\n\ntest(\"navigator routes cover the intended foundation sections\", () => {\n  assert.deepEqual(\n    NAVIGATOR_ROUTES.map(\n      (route) => route.path,\n    ),\n    [\n      \"/\",\n      \"/dashboards\",\n      \"/presentations\",\n      \"/concepts\",\n      \"/components\",\n      \"/settings\",\n    ],\n  );\n});\n\ntest(\"navigator path normalisation removes query, fragments and trailing slashes\", () => {\n  assert.equal(\n    normaliseNavigatorPath(\n      \"/dashboards/?view=all#top\",\n    ),\n    \"/dashboards\",\n  );\n  assert.equal(\n    normaliseNavigatorPath(\"///\"),\n    \"/\",\n  );\n});\n\ntest(\"unknown routes fall back to home without becoming allowed routes\", () => {\n  assert.equal(\n    isNavigatorPath(\"/missing\"),\n    false,\n  );\n  assert.equal(\n    routeForPath(\"/missing\").id,\n    \"home\",\n  );\n});\n\ntest(\"route lookup by id returns category metadata\", () => {\n  assert.equal(\n    routeForId(\"presentations\")\n      .category,\n    \"presentation\",\n  );\n  assert.equal(\n    routeForId(\"unknown\").id,\n    \"home\",\n  );\n});\n"}, "tests/integration/navigator-server.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  createServer,\n} from \"node:http\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport test from \"node:test\";\nimport {\n  createApplication,\n} from \"../../server/app.mjs\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\nconst workspaceRoot = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"export-workspace\",\n);\n\ntest(\"navigator root serves the application shell instead of redirecting\", async () => {\n  await withServer(async (baseUrl) => {\n    const response = await fetch(\n      `${baseUrl}/`,\n      {\n        redirect: \"manual\",\n      },\n    );\n    const html = await response.text();\n\n    assert.equal(\n      response.status,\n      200,\n    );\n    assert.match(\n      response.headers.get(\n        \"content-type\",\n      ),\n      /^text\\/html/,\n    );\n    assert.match(\n      response.headers.get(\n        \"content-security-policy\",\n      ),\n      /default-src 'self'/,\n    );\n    assert.match(\n      html,\n      /<title>My Dashboards<\\/title>/,\n    );\n    assert.match(\n      html,\n      /id=\"navigator-nav\"/,\n    );\n    assert.match(\n      html,\n      /src=\"\\/navigator\\/main\\.js\"/,\n    );\n    assert.doesNotMatch(\n      html,\n      /<script(?![^>]+src=)/i,\n    );\n  });\n});\n\ntest(\"supported category routes return the same navigator document\", async () => {\n  await withServer(async (baseUrl) => {\n    for (const path of [\n      \"/dashboards\",\n      \"/presentations\",\n      \"/concepts\",\n      \"/components\",\n      \"/settings\",\n    ]) {\n      const response = await fetch(\n        `${baseUrl}${path}`,\n      );\n      const html =\n        await response.text();\n\n      assert.equal(\n        response.status,\n        200,\n        path,\n      );\n      assert.match(\n        html,\n        /id=\"category-selector\"/,\n      );\n    }\n  });\n});\n\ntest(\"browser modules are served with revalidation and no external dependencies\", async () => {\n  await withServer(async (baseUrl) => {\n    const response = await fetch(\n      `${baseUrl}/navigator/main.js`,\n    );\n    const source =\n      await response.text();\n\n    assert.equal(\n      response.status,\n      200,\n    );\n    assert.match(\n      response.headers.get(\n        \"content-type\",\n      ),\n      /javascript/,\n    );\n    assert.match(\n      response.headers.get(\n        \"cache-control\",\n      ),\n      /no-cache/,\n    );\n    assert.match(\n      source,\n      /EventSource\\(\"\\/api\\/events\"\\)/,\n    );\n    assert.doesNotMatch(\n      source,\n      /https?:\\/\\//,\n    );\n  });\n});\n\ntest(\"API routes remain available beside the navigator\", async () => {\n  await withServer(async (baseUrl) => {\n    const response = await fetch(\n      `${baseUrl}/api/health`,\n    );\n    const body = await response.json();\n\n    assert.equal(\n      response.status,\n      200,\n    );\n    assert.equal(body.ok, true);\n    assert.equal(\n      body.data.status,\n      \"ok\",\n    );\n  });\n});\n\ntest(\"unknown browser paths keep the structured 404 envelope\", async () => {\n  await withServer(async (baseUrl) => {\n    const response = await fetch(\n      `${baseUrl}/not-a-route`,\n    );\n    const body = await response.json();\n\n    assert.equal(\n      response.status,\n      404,\n    );\n    assert.equal(\n      body.error.code,\n      \"ROUTE_NOT_FOUND\",\n    );\n  });\n});\n\nasync function withServer(callback) {\n  const created =\n    await createApplication({\n      workspaceRoot,\n      logger() {},\n      revisionPollIntervalMs: 50,\n      minimumRevisionCheckIntervalMs: 0,\n    });\n  const server = createServer(\n    created.app,\n  );\n\n  await new Promise(\n    (resolvePromise, reject) => {\n      server.once(\"error\", reject);\n      server.listen(\n        0,\n        \"127.0.0.1\",\n        () => {\n          server.off(\"error\", reject);\n          resolvePromise();\n        },\n      );\n    },\n  );\n\n  const address = server.address();\n  const baseUrl =\n    `http://127.0.0.1:${address.port}`;\n\n  try {\n    await callback(baseUrl);\n  } finally {\n    server.closeAllConnections?.();\n    await new Promise(\n      (resolvePromise, reject) => {\n        server.close((error) => {\n          if (error) reject(error);\n          else resolvePromise();\n        });\n      },\n    );\n    await created.close();\n  }\n}\n"}, "scripts/tasks/test-navigator.mjs": {"content": "#!/usr/bin/env node\n\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  scriptDirectory,\n  \"../..\",\n);\n\nconst tests = [\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"unit\",\n    \"navigator-router.test.mjs\",\n  ),\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"integration\",\n    \"navigator-server.test.mjs\",\n  ),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n    maxBuffer:\n      64 * 1024 * 1024,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode =\n  result.status ?? 1;\n"}};

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
  preserved: [],
  warnings: [],
  validation: [],
  navigator: {
    url: "http://127.0.0.1:4173/",
    routes: [
      "/",
      "/dashboards",
      "/presentations",
      "/concepts",
      "/components",
      "/settings",
    ],
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
      "Bootstrap 18 must run from the root of the My Dashboards Git repository.",
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

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "18-add-navigator-ui-foundation.mjs",
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
        "The navigator UI foundation was created and tested, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 18

Usage:
  node scripts/18-add-navigator-ui-foundation.mjs [options]

Options:
  --target <path>  Add the navigator to a specific repository root.
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
    "node_modules/express",
    "app/README.md",
    "server/app.mjs",
    "server/README.md",
    "server/routes/index.mjs",
    "server/routes/state.mjs",
    "server/services/navigator-services.mjs",
    "src/workspace/capabilities.mjs",
    "library/dashboards/ai-use-case-governance/artifact.json",
    "scripts/tasks/test-reference-dashboard.mjs",
    "scripts/tasks/test-server.mjs",
    "scripts/tasks/test-core.mjs",
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
        "Bootstrap 17 has not been completed.",
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
        "package.json had pre-existing changes, so the navigator test command was not added automatically.",
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
  value.scripts["test:navigator"] =
    value.scripts["test:navigator"] ??
    "node scripts/tasks/test-navigator.mjs";

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

async function validateGeneratedState() {
  if (args.dryRun) {
    report.validation.push({
      check: "dry-run",
      ok: true,
      message:
        "The navigator UI foundation was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "app/router.js",
    "app/api.js",
    "app/main.js",
    "server/routes/navigator.mjs",
    "server/app.mjs",
    "src/workspace/capabilities.mjs",
    "tests/unit/navigator-router.test.mjs",
    "tests/integration/navigator-server.test.mjs",
    "scripts/tasks/test-navigator.mjs",
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
      `${modulePaths.length} navigator, server and test modules passed Node syntax checks.`,
  });

  const tests = run(
    process.execPath,
    [
      join(
        targetRoot,
        "scripts",
        "tasks",
        "test-navigator.mjs",
      ),
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Navigator UI tests failed:\n${
        tests.stderr ||
        tests.stdout
      }`,
    );
  }

  report.validation.push({
    check: "navigator-tests",
    ok: true,
    message:
      "Routing, static delivery, browser security headers, API coexistence and 404 tests passed.",
  });

  const validation = run(
    process.execPath,
    [
      join(
        targetRoot,
        "bin",
        "mydash.mjs",
      ),
      "validate",
      "--json",
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (validation.status !== 0) {
    throw new Error(
      `Workspace validation failed:\n${
        validation.stderr ||
        validation.stdout
      }`,
    );
  }

  report.validation.push({
    check: "workspace-validation",
    ok: true,
    message:
      "Consolidated workspace validation still passes.",
  });

  for (const task of [
    "scripts/tasks/test-reference-dashboard.mjs",
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
      "Reference dashboard, Core, skills, server, Git, validation, export, resolution, library, data, Office, filesystem, CLI and contract tests still pass.",
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
        "The navigator UI foundation was already present; there were no task-owned changes to commit.",
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
        "The navigator was created and tested, but no commit was made because Git user.name or user.email is missing.",
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
    "\nMy Dashboards — navigator UI foundation\n",
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
    "Preserved",
    report.preserved,
  );

  console.log("\nNavigator:");
  console.log(
    `  URL: ${report.navigator.url}`,
  );
  console.log(
    `  Routes: ${report.navigator.routes.join(", ")}`,
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
