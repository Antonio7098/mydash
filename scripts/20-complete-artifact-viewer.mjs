#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 20: Complete viewer controls and details
 *
 * Adds:
 *
 *   - preview reload and fullscreen controls;
 *   - metadata and resolved dependency details;
 *   - standalone export status without returning the HTML body;
 *   - keyboard shortcuts and help;
 *   - revision, source, resource and diagnostic information.
 *
 * Usage:
 *   node scripts/20-complete-artifact-viewer.mjs
 *   node scripts/20-complete-artifact-viewer.mjs --dry-run
 *   node scripts/20-complete-artifact-viewer.mjs --no-commit
 *   node scripts/20-complete-artifact-viewer.mjs --no-push
 *   node scripts/20-complete-artifact-viewer.mjs --json
 *   node scripts/20-complete-artifact-viewer.mjs --target /path/to/my-dashboards
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
  "20-complete-artifact-viewer";
const COMMIT_MESSAGE =
  "Complete artefact viewer controls";
const MIN_NODE_MAJOR = 20;
const FILES = {"app/README.md": {"content": "# Navigator application\n\nThe navigator is a lightweight browser interface over the repository and HTTP\nservices. It does not maintain a separate database or artefact index.\n\n## Start\n\n```bash\nnpm start\n```\n\nOpen:\n\n```text\nhttp://127.0.0.1:4173/\n```\n\n## Routes\n\n```text\n/\n /dashboards\n /presentations\n /concepts\n /components\n /settings\n```\n\nThe shell uses History API routing and the Express server returns `index.html`\nfor each supported route.\n\n## Current scope\n\nBootstrap 18 provides:\n\n- minimal white-and-red application chrome;\n- compact expandable navigation;\n- top-centre category selector;\n- route-aware views;\n- live health and revision status;\n- artefact and library counts;\n- component-library summary;\n- Git and cache state;\n- ETag-aware API reads;\n- live refresh through `/api/events`.\n\nIt deliberately does not yet render miniature artefact previews or the final\ngallery card system. Those belong to the next bootstrap.\n\n## Browser modules\n\n```text\nindex.html\nstyles.css\nrouter.js\napi.js\nmain.js\n```\n\nNo bundler or framework is required. All browser code is ordinary ES modules\nserved by Express.\n\n## Safety\n\n- no external scripts or styles;\n- no inline scripts;\n- no cross-origin API calls;\n- repository text is inserted with `textContent`;\n- navigation routes are allow-listed;\n- Content Security Policy is applied by the server;\n- the HTTP interface remains read-only.\n\n\n## Artefact gallery and viewer\n\nBootstrap 19 adds live miniature previews to Home and the artefact category\nroutes.\n\n```text\n/view/<kind>/<id>\n```\n\nViewer pages keep the navigator chrome while presenting a large interactive\npreview and direct standalone-download action.\n\nGallery previews:\n\n- use native and observer-based lazy loading;\n- use sandboxed iframes;\n- do not accept pointer interaction;\n- show explicit loading and failure states;\n- preserve title/action metadata outside the iframe;\n- choose a deterministic mount shape from the artefact identity.\n\nThe gallery never stores thumbnails or a manual artefact index. It renders the\ncurrent `/api/artifacts` response and loads previews from the existing\nstandalone exporter.\n\n\n## Dedicated viewer controls\n\nBootstrap 20 completes the viewer toolbar.\n\n```text\nR          reload preview\nF          enter or exit fullscreen\nI          show or hide artefact details\n?          show keyboard shortcuts\nEscape     leave fullscreen or close shortcut help\n```\n\nViewer details are loaded from:\n\n```text\nGET /api/artifacts/:kind/:id\nGET /api/artifacts/:kind/:id/export-status\n```\n\nThe export-status route uses the existing revision-aware standalone-preview\ncache. Its JSON response contains hashes, byte size, resource counts,\nvalidation and warnings, but never contains the generated HTML document.\n\nThe details panel shows:\n\n- manifest metadata;\n- selected theme, preset and layout;\n- dependency closure and lifecycle scope;\n- export readiness, size and SHA-256;\n- embedded resource counts;\n- related discovery or resolution issues;\n- active workspace revision.\n\nThe viewer remains read-only.\n", "allowedPrevious": ["# Navigator application\n\nThe navigator is a lightweight browser interface over the repository and HTTP\nservices. It does not maintain a separate database or artefact index.\n\n## Start\n\n```bash\nnpm start\n```\n\nOpen:\n\n```text\nhttp://127.0.0.1:4173/\n```\n\n## Routes\n\n```text\n/\n /dashboards\n /presentations\n /concepts\n /components\n /settings\n```\n\nThe shell uses History API routing and the Express server returns `index.html`\nfor each supported route.\n\n## Current scope\n\nBootstrap 18 provides:\n\n- minimal white-and-red application chrome;\n- compact expandable navigation;\n- top-centre category selector;\n- route-aware views;\n- live health and revision status;\n- artefact and library counts;\n- component-library summary;\n- Git and cache state;\n- ETag-aware API reads;\n- live refresh through `/api/events`.\n\nIt deliberately does not yet render miniature artefact previews or the final\ngallery card system. Those belong to the next bootstrap.\n\n## Browser modules\n\n```text\nindex.html\nstyles.css\nrouter.js\napi.js\nmain.js\n```\n\nNo bundler or framework is required. All browser code is ordinary ES modules\nserved by Express.\n\n## Safety\n\n- no external scripts or styles;\n- no inline scripts;\n- no cross-origin API calls;\n- repository text is inserted with `textContent`;\n- navigation routes are allow-listed;\n- Content Security Policy is applied by the server;\n- the HTTP interface remains read-only.\n\n\n## Artefact gallery and viewer\n\nBootstrap 19 adds live miniature previews to Home and the artefact category\nroutes.\n\n```text\n/view/<kind>/<id>\n```\n\nViewer pages keep the navigator chrome while presenting a large interactive\npreview and direct standalone-download action.\n\nGallery previews:\n\n- use native and observer-based lazy loading;\n- use sandboxed iframes;\n- do not accept pointer interaction;\n- show explicit loading and failure states;\n- preserve title/action metadata outside the iframe;\n- choose a deterministic mount shape from the artefact identity.\n\nThe gallery never stores thumbnails or a manual artefact index. It renders the\ncurrent `/api/artifacts` response and loads previews from the existing\nstandalone exporter.\n"]}, "app/styles.css": {"content": ":root {\n  color-scheme: light;\n  --nav-red: #db0011;\n  --nav-red-dark: #b3000e;\n  --nav-red-soft: #fff2f3;\n  --nav-canvas: #ffffff;\n  --nav-surface: #ffffff;\n  --nav-surface-muted: #f6f6f6;\n  --nav-text: #1f1f1f;\n  --nav-text-muted: #666666;\n  --nav-border: #dddddd;\n  --nav-border-strong: #b9b9b9;\n  --nav-focus: #0066cc;\n  --nav-positive: #237804;\n  --nav-warning: #8a5a00;\n  --nav-critical: #b42318;\n  --nav-shadow:\n    0 18px 45px rgba(0, 0, 0, 0.12),\n    0 2px 10px rgba(0, 0, 0, 0.06);\n  --nav-radius-sm: 0.35rem;\n  --nav-radius-md: 0.65rem;\n  --nav-radius-lg: 1rem;\n  --nav-max-width: 92rem;\n  font-family:\n    Inter,\n    Arial,\n    Helvetica,\n    system-ui,\n    -apple-system,\n    BlinkMacSystemFont,\n    \"Segoe UI\",\n    sans-serif;\n  line-height: 1.5;\n  background: var(--nav-canvas);\n  color: var(--nav-text);\n}\n\n* {\n  box-sizing: border-box;\n}\n\nhtml {\n  min-width: 20rem;\n  min-height: 100%;\n  background: var(--nav-canvas);\n}\n\nbody {\n  min-height: 100vh;\n  margin: 0;\n  background:\n    radial-gradient(\n      circle at 50% -18rem,\n      rgba(219, 0, 17, 0.065),\n      transparent 32rem\n    ),\n    var(--nav-canvas);\n  color: var(--nav-text);\n}\n\nbutton,\ninput,\nselect {\n  font: inherit;\n}\n\na {\n  color: inherit;\n}\n\n.skip-link {\n  position: fixed;\n  z-index: 100;\n  top: 0.75rem;\n  left: 50%;\n  padding: 0.65rem 0.9rem;\n  transform: translate(-50%, -200%);\n  border-radius: var(--nav-radius-sm);\n  color: #ffffff;\n  background: var(--nav-text);\n}\n\n.skip-link:focus {\n  transform: translate(-50%, 0);\n}\n\n.visually-hidden {\n  position: absolute !important;\n  width: 1px !important;\n  height: 1px !important;\n  overflow: hidden !important;\n  clip: rect(0 0 0 0) !important;\n  white-space: nowrap !important;\n  clip-path: inset(50%) !important;\n}\n\n.navigator-chrome {\n  position: relative;\n  z-index: 20;\n  display: grid;\n  grid-template-columns: 1fr auto 1fr;\n  align-items: start;\n  min-height: 6.5rem;\n  padding:\n    clamp(1rem, 2.5vw, 1.75rem)\n    clamp(1rem, 3vw, 2.25rem);\n  pointer-events: none;\n}\n\n.navigator-chrome > * {\n  pointer-events: auto;\n}\n\n.navigator-nav {\n  position: fixed;\n  top: clamp(1rem, 2.5vw, 1.75rem);\n  left: clamp(1rem, 3vw, 2.25rem);\n  display: grid;\n  width: 3.2rem;\n  max-height: 3.2rem;\n  overflow: hidden;\n  border: 1px solid var(--nav-border);\n  border-radius: 1.6rem;\n  background: rgba(255, 255, 255, 0.96);\n  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);\n  transition:\n    width 180ms ease,\n    max-height 220ms ease 100ms,\n    border-radius 180ms ease,\n    box-shadow 180ms ease;\n  backdrop-filter: blur(18px);\n}\n\n.navigator-nav[data-open=\"true\"] {\n  width: min(16rem, calc(100vw - 2rem));\n  max-height: 31rem;\n  border-radius: var(--nav-radius-lg);\n  box-shadow: var(--nav-shadow);\n  transition:\n    width 180ms ease,\n    max-height 240ms ease 120ms,\n    border-radius 180ms ease,\n    box-shadow 180ms ease;\n}\n\n.navigator-nav__toggle {\n  display: grid;\n  grid-template-columns: 2rem minmax(0, 1fr) 1rem;\n  gap: 0.65rem;\n  align-items: center;\n  width: 100%;\n  min-height: 3.1rem;\n  padding: 0.3rem 0.55rem;\n  border: 0;\n  color: var(--nav-text);\n  background: transparent;\n  cursor: pointer;\n  text-align: left;\n}\n\n.navigator-mark {\n  position: relative;\n  display: grid;\n  width: 2rem;\n  height: 2rem;\n  place-items: center;\n  overflow: hidden;\n  border-radius: 50%;\n  color: var(--nav-text);\n  background: var(--nav-surface-muted);\n  font-size: 0.68rem;\n  font-weight: 800;\n  letter-spacing: -0.03em;\n}\n\n.navigator-mark__bar {\n  position: absolute;\n  inset: 0 auto 0 0;\n  width: 0.28rem;\n  background: var(--nav-red);\n}\n\n.navigator-mark__letters {\n  transform: translateX(0.09rem);\n}\n\n.navigator-nav__toggle-label {\n  overflow: hidden;\n  font-size: 0.9rem;\n  font-weight: 700;\n  opacity: 0;\n  white-space: nowrap;\n  transition: opacity 100ms ease;\n}\n\n.navigator-nav__chevron {\n  display: grid;\n  place-items: center;\n  color: var(--nav-text-muted);\n  font-size: 1.25rem;\n  opacity: 0;\n  transform: rotate(0deg);\n  transition:\n    opacity 100ms ease,\n    transform 180ms ease;\n}\n\n.navigator-nav[data-open=\"true\"] .navigator-nav__toggle-label,\n.navigator-nav[data-open=\"true\"] .navigator-nav__chevron {\n  opacity: 1;\n  transition-delay: 150ms;\n}\n\n.navigator-nav[data-open=\"true\"] .navigator-nav__chevron {\n  transform: rotate(90deg);\n}\n\n.navigator-nav__toggle:focus-visible,\n.navigator-nav__panel a:focus-visible,\n.category-switcher select:focus-visible {\n  outline: 3px solid color-mix(in srgb, var(--nav-focus) 28%, transparent);\n  outline-offset: 2px;\n}\n\n.navigator-nav__panel {\n  display: grid;\n  gap: 0.2rem;\n  padding: 0.35rem 0.45rem 0.6rem;\n  opacity: 0;\n  transform: translateY(-0.25rem);\n  transition:\n    opacity 120ms ease,\n    transform 120ms ease;\n  visibility: hidden;\n}\n\n.navigator-nav[data-open=\"true\"] .navigator-nav__panel {\n  opacity: 1;\n  transform: translateY(0);\n  transition-delay: 170ms;\n  visibility: visible;\n}\n\n.navigator-nav__panel a {\n  display: flex;\n  min-height: 2.5rem;\n  align-items: center;\n  padding: 0.55rem 0.8rem;\n  border-radius: var(--nav-radius-md);\n  color: var(--nav-text-muted);\n  font-size: 0.9rem;\n  font-weight: 600;\n  text-decoration: none;\n}\n\n.navigator-nav__panel a:hover {\n  color: var(--nav-text);\n  background: var(--nav-surface-muted);\n}\n\n.navigator-nav__panel a[aria-current=\"page\"] {\n  color: var(--nav-red-dark);\n  background: var(--nav-red-soft);\n}\n\n.navigator-nav__separator {\n  height: 1px;\n  margin: 0.4rem 0.75rem;\n  background: var(--nav-border);\n}\n\n.category-switcher {\n  grid-column: 2;\n  justify-self: center;\n}\n\n.category-switcher select {\n  min-height: 2.65rem;\n  min-width: 10rem;\n  padding: 0.5rem 2.3rem 0.5rem 0.9rem;\n  border: 1px solid var(--nav-border);\n  border-radius: 999px;\n  color: var(--nav-text);\n  background:\n    linear-gradient(45deg, transparent 50%, var(--nav-text-muted) 50%)\n      calc(100% - 1rem) 51% / 0.32rem 0.32rem no-repeat,\n    linear-gradient(135deg, var(--nav-text-muted) 50%, transparent 50%)\n      calc(100% - 0.7rem) 51% / 0.32rem 0.32rem no-repeat,\n    rgba(255, 255, 255, 0.92);\n  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.045);\n  font-size: 0.88rem;\n  font-weight: 700;\n  appearance: none;\n  cursor: pointer;\n  backdrop-filter: blur(15px);\n}\n\n.connection-status {\n  grid-column: 3;\n  justify-self: end;\n  display: inline-flex;\n  min-height: 2.65rem;\n  align-items: center;\n  gap: 0.55rem;\n  padding: 0.45rem 0.8rem;\n  border: 1px solid var(--nav-border);\n  border-radius: 999px;\n  color: var(--nav-text-muted);\n  background: rgba(255, 255, 255, 0.9);\n  font-size: 0.78rem;\n  font-weight: 650;\n  backdrop-filter: blur(15px);\n}\n\n.connection-status__dot {\n  width: 0.48rem;\n  height: 0.48rem;\n  border-radius: 50%;\n  background: var(--nav-border-strong);\n}\n\n.connection-status[data-state=\"ready\"] .connection-status__dot {\n  background: var(--nav-positive);\n  box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--nav-positive) 15%, transparent);\n}\n\n.connection-status[data-state=\"stale\"] .connection-status__dot {\n  background: var(--nav-warning);\n}\n\n.connection-status[data-state=\"error\"] .connection-status__dot {\n  background: var(--nav-critical);\n}\n\n.navigator-main {\n  width: min(\n    calc(100% - 2 * clamp(1rem, 4vw, 3rem)),\n    var(--nav-max-width)\n  );\n  min-height: calc(100vh - 11rem);\n  margin-inline: auto;\n  padding:\n    clamp(1rem, 3vw, 2rem)\n    0\n    clamp(4rem, 8vw, 7rem);\n  outline: none;\n}\n\n.navigator-loading {\n  max-width: 42rem;\n  margin: clamp(4rem, 12vh, 9rem) auto 0;\n  text-align: center;\n}\n\n.navigator-eyebrow {\n  margin: 0 0 0.8rem;\n  color: var(--nav-red);\n  font-size: 0.74rem;\n  font-weight: 800;\n  letter-spacing: 0.14em;\n  text-transform: uppercase;\n}\n\n.navigator-loading h1,\n.page-heading h1 {\n  margin: 0;\n  color: var(--nav-text);\n  font-size: clamp(2.7rem, 7vw, 5.8rem);\n  font-weight: 750;\n  letter-spacing: -0.065em;\n  line-height: 0.94;\n}\n\n.navigator-loading p:last-child,\n.page-heading__summary {\n  max-width: 60ch;\n  margin: 1.25rem 0 0;\n  color: var(--nav-text-muted);\n  font-size: clamp(1rem, 2vw, 1.2rem);\n}\n\n.page-heading {\n  display: grid;\n  grid-template-columns: minmax(0, 1.4fr) minmax(15rem, 0.55fr);\n  gap: clamp(2rem, 7vw, 7rem);\n  align-items: end;\n  padding:\n    clamp(3rem, 8vw, 7rem)\n    0\n    clamp(2.5rem, 6vw, 5rem);\n}\n\n.page-heading__summary {\n  margin-inline: 0;\n}\n\n.page-heading__aside {\n  display: grid;\n  gap: 0.45rem;\n  padding: 1rem 0 1rem 1.3rem;\n  border-left: 0.25rem solid var(--nav-red);\n}\n\n.page-heading__aside strong {\n  font-size: clamp(2rem, 5vw, 3.5rem);\n  letter-spacing: -0.05em;\n  line-height: 1;\n}\n\n.page-heading__aside span {\n  color: var(--nav-text-muted);\n  font-size: 0.86rem;\n}\n\n.overview-grid {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 1rem;\n}\n\n.overview-card,\n.status-panel,\n.library-stat,\n.empty-category {\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-lg);\n  background: var(--nav-surface);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.035);\n}\n\n.overview-card {\n  position: relative;\n  display: grid;\n  min-height: 11rem;\n  align-content: space-between;\n  gap: 1.5rem;\n  padding: 1.35rem;\n  color: var(--nav-text);\n  text-decoration: none;\n  transition:\n    transform 140ms ease,\n    border-color 140ms ease,\n    box-shadow 140ms ease;\n}\n\n.overview-card::before {\n  position: absolute;\n  inset: 0 auto 0 0;\n  width: 0.22rem;\n  border-radius: var(--nav-radius-lg) 0 0 var(--nav-radius-lg);\n  background: transparent;\n  content: \"\";\n}\n\n.overview-card:hover {\n  transform: translateY(-2px);\n  border-color: var(--nav-border-strong);\n  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.07);\n}\n\n.overview-card:hover::before {\n  background: var(--nav-red);\n}\n\n.overview-card__label {\n  color: var(--nav-text-muted);\n  font-size: 0.82rem;\n  font-weight: 700;\n}\n\n.overview-card__count {\n  display: block;\n  margin-top: 0.35rem;\n  font-size: clamp(2.3rem, 5vw, 4rem);\n  font-weight: 760;\n  letter-spacing: -0.055em;\n  line-height: 1;\n}\n\n.overview-card__action {\n  color: var(--nav-red-dark);\n  font-size: 0.82rem;\n  font-weight: 700;\n}\n\n.section-block {\n  margin-top: clamp(3rem, 7vw, 6rem);\n}\n\n.section-heading {\n  display: flex;\n  align-items: end;\n  justify-content: space-between;\n  gap: 2rem;\n  margin-bottom: 1.25rem;\n}\n\n.section-heading h2 {\n  margin: 0;\n  font-size: clamp(1.55rem, 3vw, 2.4rem);\n  letter-spacing: -0.035em;\n}\n\n.section-heading p {\n  max-width: 52ch;\n  margin: 0;\n  color: var(--nav-text-muted);\n  font-size: 0.9rem;\n  text-align: right;\n}\n\n.status-grid {\n  display: grid;\n  grid-template-columns: minmax(0, 1.5fr) minmax(18rem, 0.65fr);\n  gap: 1rem;\n}\n\n.status-panel {\n  display: grid;\n  gap: 1.15rem;\n  padding: 1.4rem;\n}\n\n.status-panel__topline {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 1rem;\n}\n\n.status-panel__topline h3 {\n  margin: 0;\n  font-size: 1rem;\n}\n\n.status-badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.45rem;\n  color: var(--nav-positive);\n  font-size: 0.78rem;\n  font-weight: 750;\n}\n\n.status-badge::before {\n  width: 0.45rem;\n  height: 0.45rem;\n  border-radius: 50%;\n  background: currentColor;\n  content: \"\";\n}\n\n.status-list {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 1rem;\n  margin: 0;\n}\n\n.status-list div {\n  min-width: 0;\n}\n\n.status-list dt {\n  color: var(--nav-text-muted);\n  font-size: 0.72rem;\n  font-weight: 750;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.status-list dd {\n  overflow: hidden;\n  margin: 0.3rem 0 0;\n  font-size: 0.94rem;\n  font-weight: 650;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.category-intro {\n  display: grid;\n  grid-template-columns: minmax(0, 1.1fr) minmax(17rem, 0.6fr);\n  gap: clamp(2rem, 7vw, 7rem);\n  align-items: center;\n  min-height: 21rem;\n  padding: clamp(2rem, 6vw, 5rem);\n  border: 1px solid var(--nav-border);\n  border-radius: clamp(1rem, 2.5vw, 1.8rem);\n  background:\n    linear-gradient(\n      112deg,\n      var(--nav-red-soft),\n      var(--nav-surface) 54%\n    );\n}\n\n.category-intro h2 {\n  max-width: 12ch;\n  margin: 0;\n  font-size: clamp(2.4rem, 6vw, 5.4rem);\n  letter-spacing: -0.06em;\n  line-height: 0.96;\n}\n\n.category-intro p {\n  max-width: 56ch;\n  margin: 1.2rem 0 0;\n  color: var(--nav-text-muted);\n}\n\n.category-intro__count {\n  display: grid;\n  justify-items: start;\n  gap: 0.6rem;\n  padding-left: clamp(1rem, 4vw, 3rem);\n  border-left: 1px solid var(--nav-border-strong);\n}\n\n.category-intro__count strong {\n  font-size: clamp(4rem, 10vw, 8rem);\n  letter-spacing: -0.075em;\n  line-height: 0.8;\n}\n\n.category-intro__count span {\n  color: var(--nav-text-muted);\n  font-size: 0.86rem;\n}\n\n.primary-action,\n.secondary-action {\n  display: inline-flex;\n  min-height: 2.8rem;\n  align-items: center;\n  justify-content: center;\n  margin-top: 1.5rem;\n  padding: 0.65rem 1rem;\n  border: 1px solid transparent;\n  border-radius: var(--nav-radius-sm);\n  font-size: 0.84rem;\n  font-weight: 750;\n  text-decoration: none;\n}\n\n.primary-action {\n  color: #ffffff;\n  background: var(--nav-red);\n}\n\n.primary-action:hover {\n  background: var(--nav-red-dark);\n}\n\n.secondary-action {\n  color: var(--nav-text);\n  border-color: var(--nav-border-strong);\n  background: var(--nav-surface);\n}\n\n.empty-category {\n  margin-top: 1rem;\n  padding: 1.6rem;\n  color: var(--nav-text-muted);\n}\n\n.empty-category strong {\n  display: block;\n  margin-bottom: 0.3rem;\n  color: var(--nav-text);\n}\n\n.library-grid {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 1rem;\n}\n\n.library-stat {\n  padding: 1.35rem;\n}\n\n.library-stat span {\n  color: var(--nav-text-muted);\n  font-size: 0.78rem;\n  font-weight: 700;\n}\n\n.library-stat strong {\n  display: block;\n  margin-top: 0.45rem;\n  font-size: 2.4rem;\n  letter-spacing: -0.05em;\n  line-height: 1;\n}\n\n.settings-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 1rem;\n}\n\n.settings-card {\n  min-width: 0;\n  padding: 1.4rem;\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-lg);\n  background: var(--nav-surface);\n}\n\n.settings-card h2 {\n  margin: 0 0 1rem;\n  font-size: 1rem;\n}\n\n.settings-card dl {\n  display: grid;\n  gap: 0.9rem;\n  margin: 0;\n}\n\n.settings-card dl div {\n  display: grid;\n  grid-template-columns: minmax(7rem, 0.55fr) minmax(0, 1fr);\n  gap: 1rem;\n  padding-bottom: 0.9rem;\n  border-bottom: 1px solid var(--nav-border);\n}\n\n.settings-card dl div:last-child {\n  padding-bottom: 0;\n  border-bottom: 0;\n}\n\n.settings-card dt {\n  color: var(--nav-text-muted);\n  font-size: 0.78rem;\n}\n\n.settings-card dd {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  margin: 0;\n  font-size: 0.86rem;\n  font-weight: 650;\n  text-align: right;\n}\n\n.navigator-error {\n  max-width: 42rem;\n  margin: 6rem auto;\n  padding: 1.6rem;\n  border: 1px solid color-mix(in srgb, var(--nav-critical) 35%, white);\n  border-radius: var(--nav-radius-lg);\n  background: #fff4f2;\n}\n\n.navigator-error h1,\n.navigator-error p {\n  margin: 0;\n}\n\n.navigator-error p {\n  margin-top: 0.75rem;\n  color: var(--nav-text-muted);\n}\n\n.navigator-footer {\n  display: flex;\n  justify-content: center;\n  gap: 0.55rem;\n  min-height: 4rem;\n  align-items: center;\n  padding: 1rem;\n  color: var(--nav-text-muted);\n  font-size: 0.74rem;\n}\n\n@media (max-width: 64rem) {\n  .overview-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n\n  .page-heading,\n  .category-intro,\n  .status-grid {\n    grid-template-columns: 1fr;\n  }\n\n  .page-heading__aside,\n  .category-intro__count {\n    max-width: 22rem;\n  }\n\n  .library-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n}\n\n@media (max-width: 44rem) {\n  .navigator-chrome {\n    grid-template-columns: 1fr auto;\n    min-height: 7.5rem;\n  }\n\n  .category-switcher {\n    grid-column: 2;\n    justify-self: end;\n  }\n\n  .connection-status {\n    grid-column: 1 / -1;\n    grid-row: 2;\n    justify-self: end;\n    margin-top: 0.65rem;\n  }\n\n  .connection-status span:last-child {\n    max-width: 9rem;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n  }\n\n  .overview-grid,\n  .library-grid,\n  .settings-grid,\n  .status-list {\n    grid-template-columns: 1fr;\n  }\n\n  .section-heading {\n    align-items: start;\n    flex-direction: column;\n  }\n\n  .section-heading p {\n    text-align: left;\n  }\n\n  .category-intro__count {\n    padding-top: 1.5rem;\n    padding-left: 0;\n    border-top: 1px solid var(--nav-border-strong);\n    border-left: 0;\n  }\n\n  .settings-card dl div {\n    grid-template-columns: 1fr;\n    gap: 0.3rem;\n  }\n\n  .settings-card dd {\n    text-align: left;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    scroll-behavior: auto !important;\n    transition-duration: 0.01ms !important;\n    transition-delay: 0ms !important;\n  }\n}\n\n\n/* Artefact gallery */\n\n.artifact-gallery {\n  margin-top: 1.25rem;\n}\n\n.artifact-gallery__grid {\n  display: grid;\n  grid-template-columns: repeat(12, minmax(0, 1fr));\n  gap:\n    clamp(1rem, 2.5vw, 1.65rem)\n    clamp(1rem, 2.5vw, 1.65rem);\n  align-items: start;\n}\n\n.artifact-card {\n  grid-column: span 4;\n  min-width: 0;\n}\n\n.artifact-card[data-variant=\"wide\"] {\n  grid-column: span 7;\n}\n\n.artifact-card[data-variant=\"tall\"] {\n  grid-column: span 5;\n}\n\n.artifact-preview-mount {\n  position: relative;\n  z-index: 1;\n  width: calc(100% - clamp(0.7rem, 2vw, 1.3rem));\n  margin-inline: auto;\n  overflow: hidden;\n  border: 1px solid var(--nav-border);\n  border-radius:\n    clamp(0.9rem, 2vw, 1.4rem)\n    clamp(0.9rem, 2vw, 1.4rem)\n    0.45rem\n    0.45rem;\n  background: var(--nav-surface-muted);\n  box-shadow:\n    0 1.4rem 3.4rem rgba(0, 0, 0, 0.13),\n    0 0.25rem 0.8rem rgba(0, 0, 0, 0.055);\n}\n\n.artifact-card:not([data-kind=\"dashboard\"])\n  .artifact-preview-mount {\n  border-color:\n    rgba(255, 255, 255, 0.7);\n  background:\n    linear-gradient(\n      145deg,\n      rgba(255, 255, 255, 0.78),\n      rgba(255, 255, 255, 0.38)\n    );\n  box-shadow:\n    0 1.8rem 4.5rem rgba(0, 0, 0, 0.13),\n    inset 0 1px 0 rgba(255, 255, 255, 0.82);\n  backdrop-filter: blur(24px);\n}\n\n.artifact-preview-mount[data-variant=\"standard\"] {\n  aspect-ratio: 5 / 4;\n}\n\n.artifact-preview-mount[data-variant=\"wide\"] {\n  aspect-ratio: 16 / 9;\n}\n\n.artifact-preview-mount[data-variant=\"tall\"] {\n  width: calc(100% - clamp(1.5rem, 4vw, 3rem));\n  aspect-ratio: 4 / 5;\n}\n\n.artifact-preview-viewport {\n  position: absolute;\n  inset: 0;\n  overflow: hidden;\n  background:\n    linear-gradient(\n      135deg,\n      #f5f5f5,\n      #ffffff\n    );\n}\n\n.artifact-preview-viewport iframe {\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 1440px;\n  height: 900px;\n  border: 0;\n  transform:\n    scale(\n      var(--preview-scale, 0.25)\n    );\n  transform-origin: top left;\n  pointer-events: none;\n  opacity: 0;\n  background: #ffffff;\n  transition: opacity 220ms ease;\n}\n\n.artifact-preview-viewport\n  iframe[data-state=\"ready\"] {\n  opacity: 1;\n}\n\n.artifact-preview-status {\n  position: absolute;\n  inset: 0;\n  display: grid;\n  place-content: center;\n  justify-items: center;\n  gap: 0.7rem;\n  color: var(--nav-text-muted);\n  background:\n    radial-gradient(\n      circle at 50% 30%,\n      rgba(219, 0, 17, 0.08),\n      transparent 45%\n    ),\n    var(--nav-surface-muted);\n  font-size: 0.78rem;\n  font-weight: 700;\n  transition:\n    opacity 180ms ease,\n    visibility 180ms ease;\n}\n\n.artifact-preview-status[data-state=\"ready\"] {\n  opacity: 0;\n  visibility: hidden;\n}\n\n.artifact-preview-status[data-state=\"error\"] {\n  color: var(--nav-critical);\n  background: #fff4f2;\n}\n\n.artifact-preview-status__spinner {\n  width: 1.65rem;\n  height: 1.65rem;\n  border: 2px solid var(--nav-border);\n  border-top-color: var(--nav-red);\n  border-radius: 50%;\n  animation:\n    artifact-preview-spin 900ms\n    linear infinite;\n}\n\n.artifact-preview-status[data-state=\"error\"]\n  .artifact-preview-status__spinner {\n  border: 0;\n  animation: none;\n}\n\n.artifact-preview-status[data-state=\"error\"]\n  .artifact-preview-status__spinner::before {\n  content: \"!\";\n  font-size: 1.5rem;\n  font-weight: 800;\n}\n\n.artifact-preview-link {\n  position: absolute;\n  z-index: 3;\n  inset: 0;\n}\n\n.artifact-preview-link:focus-visible {\n  outline:\n    4px solid\n    color-mix(\n      in srgb,\n      var(--nav-focus) 45%,\n      transparent\n    );\n  outline-offset: -4px;\n}\n\n.artifact-card__panel {\n  position: relative;\n  z-index: 2;\n  display: grid;\n  grid-template-columns:\n    minmax(0, 1fr)\n    auto;\n  gap: 1rem;\n  align-items: end;\n  min-height: 8.5rem;\n  margin-top: -0.2rem;\n  padding:\n    clamp(1rem, 2vw, 1.35rem);\n  border: 1px solid var(--nav-border);\n  border-radius:\n    0.35rem\n    0.35rem\n    var(--nav-radius-lg)\n    var(--nav-radius-lg);\n  background: var(--nav-surface);\n  box-shadow:\n    0 0.25rem 1.1rem\n    rgba(0, 0, 0, 0.055);\n}\n\n.artifact-card__copy {\n  min-width: 0;\n}\n\n.artifact-card__kind {\n  margin: 0;\n  color: var(--nav-red-dark);\n  font-size: 0.68rem;\n  font-weight: 800;\n  letter-spacing: 0.11em;\n  text-transform: uppercase;\n}\n\n.artifact-card__title {\n  margin: 0.35rem 0 0;\n  color: var(--nav-text);\n  font-size:\n    clamp(1.15rem, 2.5vw, 1.55rem);\n  letter-spacing: -0.035em;\n  line-height: 1.12;\n}\n\n.artifact-card__description {\n  display: -webkit-box;\n  max-width: 52ch;\n  overflow: hidden;\n  margin: 0.55rem 0 0;\n  color: var(--nav-text-muted);\n  font-size: 0.78rem;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 2;\n}\n\n.artifact-card__actions {\n  display: grid;\n  gap: 0.55rem;\n  justify-items: end;\n}\n\n.artifact-card__view,\n.artifact-card__download {\n  display: inline-flex;\n  min-height: 2.25rem;\n  align-items: center;\n  justify-content: center;\n  padding: 0.45rem 0.7rem;\n  border-radius: var(--nav-radius-sm);\n  font-size: 0.76rem;\n  font-weight: 750;\n  text-decoration: none;\n  white-space: nowrap;\n}\n\n.artifact-card__view {\n  color: #ffffff;\n  background: var(--nav-red);\n}\n\n.artifact-card__view:hover {\n  background: var(--nav-red-dark);\n}\n\n.artifact-card__download {\n  color: var(--nav-text-muted);\n  border: 1px solid var(--nav-border);\n  background: var(--nav-surface);\n}\n\n.artifact-card__download:hover {\n  color: var(--nav-text);\n  border-color: var(--nav-border-strong);\n}\n\n.artifact-viewer {\n  display: grid;\n  gap: 1.2rem;\n  padding-top:\n    clamp(1.5rem, 4vw, 3rem);\n}\n\n.artifact-viewer__toolbar {\n  display: flex;\n  align-items: end;\n  justify-content: space-between;\n  gap: 2rem;\n}\n\n.artifact-viewer__identity {\n  min-width: 0;\n}\n\n.artifact-viewer__back {\n  display: inline-flex;\n  margin-bottom: 0.8rem;\n  color: var(--nav-text-muted);\n  font-size: 0.78rem;\n  font-weight: 700;\n  text-decoration: none;\n}\n\n.artifact-viewer__back:hover {\n  color: var(--nav-red-dark);\n}\n\n.artifact-viewer__kind {\n  margin: 0;\n  color: var(--nav-red-dark);\n  font-size: 0.7rem;\n  font-weight: 800;\n  letter-spacing: 0.12em;\n  text-transform: uppercase;\n}\n\n.artifact-viewer__title {\n  margin: 0.25rem 0 0;\n  font-size:\n    clamp(2rem, 5vw, 4.5rem);\n  letter-spacing: -0.06em;\n  line-height: 0.98;\n}\n\n.artifact-viewer__actions {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 0.7rem;\n}\n\n.artifact-viewer__actions\n  .primary-action,\n.artifact-viewer__actions\n  .secondary-action {\n  margin-top: 0;\n}\n\n.artifact-viewer__mount {\n  position: relative;\n  min-height:\n    clamp(35rem, 72vh, 62rem);\n  overflow: hidden;\n  border: 1px solid var(--nav-border);\n  border-radius:\n    clamp(0.8rem, 2vw, 1.4rem);\n  background: var(--nav-surface-muted);\n  box-shadow: var(--nav-shadow);\n}\n\n.artifact-viewer__mount iframe {\n  width: 100%;\n  height:\n    clamp(35rem, 72vh, 62rem);\n  border: 0;\n  background: #ffffff;\n  opacity: 0;\n  transition: opacity 180ms ease;\n}\n\n.artifact-viewer__mount\n  iframe[data-state=\"ready\"] {\n  opacity: 1;\n}\n\n.artifact-viewer__status {\n  position: absolute;\n  inset: 0;\n  display: grid;\n  place-content: center;\n  color: var(--nav-text-muted);\n  background:\n    radial-gradient(\n      circle at 50% 20%,\n      rgba(219, 0, 17, 0.07),\n      transparent 38%\n    ),\n    var(--nav-surface-muted);\n  font-size: 0.84rem;\n  font-weight: 700;\n  pointer-events: none;\n  transition:\n    opacity 160ms ease,\n    visibility 160ms ease;\n}\n\n.artifact-viewer__status[data-state=\"ready\"] {\n  opacity: 0;\n  visibility: hidden;\n}\n\n.artifact-viewer__status[data-state=\"error\"] {\n  color: var(--nav-critical);\n  background: #fff4f2;\n}\n\n.artifact-viewer__description {\n  max-width: 70ch;\n  margin: 0;\n  color: var(--nav-text-muted);\n  font-size: 0.86rem;\n}\n\n@keyframes artifact-preview-spin {\n  to {\n    transform: rotate(1turn);\n  }\n}\n\n@media (max-width: 72rem) {\n  .artifact-card,\n  .artifact-card[data-variant=\"wide\"],\n  .artifact-card[data-variant=\"tall\"] {\n    grid-column: span 6;\n  }\n}\n\n@media (max-width: 48rem) {\n  .artifact-card,\n  .artifact-card[data-variant=\"wide\"],\n  .artifact-card[data-variant=\"tall\"] {\n    grid-column: 1 / -1;\n  }\n\n  .artifact-preview-mount[data-variant=\"tall\"] {\n    width: calc(100% - 2rem);\n    aspect-ratio: 5 / 4;\n  }\n\n  .artifact-card__panel {\n    grid-template-columns: 1fr;\n    align-items: start;\n  }\n\n  .artifact-card__actions {\n    grid-template-columns:\n      repeat(2, minmax(0, 1fr));\n    justify-items: stretch;\n  }\n\n  .artifact-viewer__toolbar {\n    align-items: start;\n    flex-direction: column;\n  }\n\n  .artifact-viewer__actions {\n    justify-content: flex-start;\n  }\n\n  .artifact-viewer__mount,\n  .artifact-viewer__mount iframe {\n    min-height: 31rem;\n    height: 65vh;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .artifact-preview-status__spinner {\n    animation-duration: 2s;\n  }\n}\n\n\n/* Dedicated viewer controls and details */\n\n.artifact-viewer__toolbar {\n  position: sticky;\n  z-index: 8;\n  top: 0.65rem;\n  padding: 0.85rem;\n  border: 1px solid\n    color-mix(\n      in srgb,\n      var(--nav-border) 82%,\n      transparent\n    );\n  border-radius: var(--nav-radius-lg);\n  background:\n    color-mix(\n      in srgb,\n      var(--nav-surface) 94%,\n      transparent\n    );\n  box-shadow:\n    0 0.6rem 1.8rem\n    rgba(0, 0, 0, 0.055);\n  backdrop-filter: blur(22px);\n}\n\n.artifact-viewer__toolbar-right {\n  display: grid;\n  gap: 0.65rem;\n  justify-items: end;\n}\n\n.viewer-export-status {\n  display: inline-flex;\n  min-height: 1.8rem;\n  align-items: center;\n  gap: 0.45rem;\n  padding: 0.25rem 0.6rem;\n  border: 1px solid var(--nav-border);\n  border-radius: 999px;\n  color: var(--nav-text-muted);\n  background: var(--nav-surface-muted);\n  font-size: 0.7rem;\n  font-weight: 750;\n}\n\n.viewer-export-status::before {\n  width: 0.42rem;\n  height: 0.42rem;\n  border-radius: 50%;\n  background: var(--nav-border-strong);\n  content: \"\";\n}\n\n.viewer-export-status[data-state=\"ready\"] {\n  color: var(--nav-positive);\n  border-color:\n    color-mix(\n      in srgb,\n      var(--nav-positive) 26%,\n      white\n    );\n  background:\n    color-mix(\n      in srgb,\n      var(--nav-positive) 7%,\n      white\n    );\n}\n\n.viewer-export-status[data-state=\"ready\"]::before {\n  background: var(--nav-positive);\n}\n\n.viewer-export-status[data-state=\"error\"] {\n  color: var(--nav-critical);\n  border-color:\n    color-mix(\n      in srgb,\n      var(--nav-critical) 28%,\n      white\n    );\n  background: #fff4f2;\n}\n\n.viewer-export-status[data-state=\"error\"]::before {\n  background: var(--nav-critical);\n}\n\n.artifact-viewer__controls {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 0.45rem;\n}\n\n.viewer-control {\n  display: inline-flex;\n  min-height: 2.25rem;\n  align-items: center;\n  gap: 0.45rem;\n  padding: 0.42rem 0.65rem;\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-sm);\n  color: var(--nav-text-muted);\n  background: var(--nav-surface);\n  font-size: 0.74rem;\n  font-weight: 750;\n  cursor: pointer;\n}\n\n.viewer-control:hover,\n.viewer-control[data-active=\"true\"] {\n  color: var(--nav-text);\n  border-color: var(--nav-border-strong);\n  background: var(--nav-surface-muted);\n}\n\n.viewer-control:focus-visible {\n  outline:\n    3px solid\n    color-mix(\n      in srgb,\n      var(--nav-focus) 28%,\n      transparent\n    );\n  outline-offset: 2px;\n}\n\n.viewer-control kbd {\n  display: grid;\n  min-width: 1.35rem;\n  min-height: 1.35rem;\n  place-items: center;\n  padding-inline: 0.25rem;\n  border: 1px solid var(--nav-border);\n  border-bottom-color: var(--nav-border-strong);\n  border-radius: 0.28rem;\n  color: var(--nav-text-muted);\n  background: var(--nav-surface-muted);\n  box-shadow: 0 1px 0 var(--nav-border-strong);\n  font-family: inherit;\n  font-size: 0.65rem;\n}\n\n.artifact-viewer__details {\n  display: grid;\n  grid-template-columns:\n    repeat(4, minmax(0, 1fr));\n  gap: 0.8rem;\n  scroll-margin-top: 8rem;\n}\n\n.artifact-viewer__details[hidden] {\n  display: none;\n}\n\n.viewer-details-card {\n  min-width: 0;\n  padding: 1rem;\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-lg);\n  background: var(--nav-surface);\n}\n\n.viewer-details-card--wide {\n  grid-column: span 2;\n}\n\n.viewer-details-card--loading,\n.viewer-details-card--error {\n  grid-column: 1 / -1;\n}\n\n.viewer-details-card--loading {\n  color: var(--nav-text-muted);\n  background: var(--nav-surface-muted);\n}\n\n.viewer-details-card--error {\n  color: var(--nav-critical);\n  background: #fff4f2;\n}\n\n.viewer-details-card h2 {\n  margin: 0 0 0.85rem;\n  font-size: 0.88rem;\n  letter-spacing: -0.015em;\n}\n\n.viewer-details-card p {\n  margin: 0;\n}\n\n.viewer-details-list {\n  display: grid;\n  gap: 0.65rem;\n  margin: 0;\n}\n\n.viewer-details-list div {\n  display: grid;\n  grid-template-columns:\n    minmax(5.5rem, 0.55fr)\n    minmax(0, 1fr);\n  gap: 0.7rem;\n  padding-bottom: 0.6rem;\n  border-bottom: 1px solid var(--nav-border);\n}\n\n.viewer-details-list div:last-child {\n  padding-bottom: 0;\n  border-bottom: 0;\n}\n\n.viewer-details-list dt {\n  color: var(--nav-text-muted);\n  font-size: 0.69rem;\n}\n\n.viewer-details-list dd {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  margin: 0;\n  font-size: 0.74rem;\n  font-weight: 700;\n  text-align: right;\n}\n\n.viewer-dependency-groups {\n  display: grid;\n  grid-template-columns:\n    repeat(auto-fit, minmax(9rem, 1fr));\n  gap: 0.75rem;\n}\n\n.viewer-dependency-group {\n  min-width: 0;\n}\n\n.viewer-dependency-group h3 {\n  margin: 0 0 0.45rem;\n  color: var(--nav-text-muted);\n  font-size: 0.68rem;\n  letter-spacing: 0.07em;\n  text-transform: uppercase;\n}\n\n.viewer-dependency-list,\n.viewer-diagnostics-list {\n  display: grid;\n  gap: 0.4rem;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.viewer-dependency-list li {\n  display: grid;\n  gap: 0.1rem;\n  padding: 0.48rem;\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-sm);\n  background: var(--nav-surface-muted);\n}\n\n.viewer-dependency-list strong {\n  overflow: hidden;\n  font-size: 0.72rem;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.viewer-dependency-list span {\n  color: var(--nav-text-muted);\n  font-size: 0.64rem;\n}\n\n.viewer-diagnostics-clear {\n  color: var(--nav-positive);\n  font-size: 0.75rem;\n  font-weight: 700;\n}\n\n.viewer-diagnostics-list li {\n  display: grid;\n  gap: 0.2rem;\n  padding: 0.55rem;\n  border-left: 0.2rem solid var(--nav-critical);\n  color: var(--nav-critical);\n  background: #fff4f2;\n}\n\n.viewer-diagnostics-list li[data-severity=\"warning\"] {\n  border-left-color: var(--nav-warning);\n  color: var(--nav-warning);\n  background: #fff8e8;\n}\n\n.viewer-diagnostics-list strong {\n  font-size: 0.67rem;\n}\n\n.viewer-diagnostics-list span {\n  color: var(--nav-text-muted);\n  font-size: 0.7rem;\n}\n\n.viewer-details-empty {\n  color: var(--nav-text-muted);\n  font-size: 0.75rem;\n}\n\n.artifact-viewer__footer {\n  display: flex;\n  align-items: start;\n  justify-content: space-between;\n  gap: 2rem;\n}\n\n.artifact-viewer__revision {\n  flex: 0 0 auto;\n  margin: 0;\n  color: var(--nav-text-muted);\n  font-size: 0.72rem;\n  font-weight: 700;\n}\n\n.viewer-fullscreen-hud {\n  position: absolute;\n  z-index: 20;\n  top: 1rem;\n  right: 1rem;\n  display: flex;\n  align-items: center;\n  gap: 0.7rem;\n  padding: 0.45rem 0.5rem 0.45rem 0.75rem;\n  border: 1px solid\n    rgba(255, 255, 255, 0.7);\n  border-radius: 999px;\n  color: #ffffff;\n  background: rgba(20, 20, 20, 0.82);\n  box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.24);\n  font-size: 0.7rem;\n  font-weight: 700;\n  backdrop-filter: blur(16px);\n}\n\n.viewer-fullscreen-hud[hidden] {\n  display: none;\n}\n\n.viewer-fullscreen-hud__exit {\n  min-height: 2rem;\n  padding: 0.35rem 0.65rem;\n  border: 1px solid rgba(255, 255, 255, 0.35);\n  border-radius: 999px;\n  color: #ffffff;\n  background: rgba(255, 255, 255, 0.12);\n  font: inherit;\n  cursor: pointer;\n}\n\n.artifact-viewer__mount:fullscreen {\n  width: 100vw;\n  height: 100vh;\n  border: 0;\n  border-radius: 0;\n  background: #ffffff;\n}\n\n.artifact-viewer__mount:fullscreen iframe {\n  width: 100%;\n  height: 100%;\n  min-height: 100vh;\n}\n\n.viewer-shortcut-dialog {\n  width: min(30rem, calc(100vw - 2rem));\n  padding: 0;\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-lg);\n  color: var(--nav-text);\n  background: var(--nav-surface);\n  box-shadow: var(--nav-shadow);\n}\n\n.viewer-shortcut-dialog::backdrop {\n  background: rgba(0, 0, 0, 0.35);\n  backdrop-filter: blur(5px);\n}\n\n.viewer-shortcut-dialog__heading {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 1rem;\n  padding: 1rem;\n  border-bottom: 1px solid var(--nav-border);\n}\n\n.viewer-shortcut-dialog__heading h2 {\n  margin: 0;\n  font-size: 1rem;\n}\n\n.viewer-shortcut-dialog__close {\n  min-height: 2.1rem;\n  padding: 0.35rem 0.65rem;\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-sm);\n  color: var(--nav-text);\n  background: var(--nav-surface);\n  font: inherit;\n  font-size: 0.72rem;\n  font-weight: 700;\n  cursor: pointer;\n}\n\n.viewer-shortcut-list {\n  display: grid;\n  gap: 0;\n  margin: 0;\n  padding: 0.5rem 1rem 1rem;\n}\n\n.viewer-shortcut-list div {\n  display: grid;\n  grid-template-columns: 5rem 1fr;\n  gap: 1rem;\n  padding: 0.7rem 0;\n  border-bottom: 1px solid var(--nav-border);\n}\n\n.viewer-shortcut-list div:last-child {\n  border-bottom: 0;\n}\n\n.viewer-shortcut-list dt {\n  font-weight: 800;\n}\n\n.viewer-shortcut-list dd {\n  margin: 0;\n  color: var(--nav-text-muted);\n}\n\n@media (max-width: 72rem) {\n  .artifact-viewer__toolbar {\n    position: static;\n    align-items: start;\n    flex-direction: column;\n  }\n\n  .artifact-viewer__toolbar-right {\n    width: 100%;\n    justify-items: start;\n  }\n\n  .artifact-viewer__controls,\n  .artifact-viewer__actions {\n    justify-content: flex-start;\n  }\n\n  .artifact-viewer__details {\n    grid-template-columns:\n      repeat(2, minmax(0, 1fr));\n  }\n}\n\n@media (max-width: 44rem) {\n  .artifact-viewer__details {\n    grid-template-columns: 1fr;\n  }\n\n  .viewer-details-card--wide {\n    grid-column: auto;\n  }\n\n  .artifact-viewer__controls {\n    display: grid;\n    grid-template-columns:\n      repeat(2, minmax(0, 1fr));\n    width: 100%;\n  }\n\n  .viewer-control {\n    justify-content: space-between;\n  }\n\n  .artifact-viewer__actions {\n    display: grid;\n    grid-template-columns:\n      repeat(2, minmax(0, 1fr));\n    width: 100%;\n  }\n\n  .artifact-viewer__footer {\n    flex-direction: column;\n    gap: 0.5rem;\n  }\n\n  .viewer-fullscreen-hud span {\n    display: none;\n  }\n}\n", "allowedPrevious": [":root {\n  color-scheme: light;\n  --nav-red: #db0011;\n  --nav-red-dark: #b3000e;\n  --nav-red-soft: #fff2f3;\n  --nav-canvas: #ffffff;\n  --nav-surface: #ffffff;\n  --nav-surface-muted: #f6f6f6;\n  --nav-text: #1f1f1f;\n  --nav-text-muted: #666666;\n  --nav-border: #dddddd;\n  --nav-border-strong: #b9b9b9;\n  --nav-focus: #0066cc;\n  --nav-positive: #237804;\n  --nav-warning: #8a5a00;\n  --nav-critical: #b42318;\n  --nav-shadow:\n    0 18px 45px rgba(0, 0, 0, 0.12),\n    0 2px 10px rgba(0, 0, 0, 0.06);\n  --nav-radius-sm: 0.35rem;\n  --nav-radius-md: 0.65rem;\n  --nav-radius-lg: 1rem;\n  --nav-max-width: 92rem;\n  font-family:\n    Inter,\n    Arial,\n    Helvetica,\n    system-ui,\n    -apple-system,\n    BlinkMacSystemFont,\n    \"Segoe UI\",\n    sans-serif;\n  line-height: 1.5;\n  background: var(--nav-canvas);\n  color: var(--nav-text);\n}\n\n* {\n  box-sizing: border-box;\n}\n\nhtml {\n  min-width: 20rem;\n  min-height: 100%;\n  background: var(--nav-canvas);\n}\n\nbody {\n  min-height: 100vh;\n  margin: 0;\n  background:\n    radial-gradient(\n      circle at 50% -18rem,\n      rgba(219, 0, 17, 0.065),\n      transparent 32rem\n    ),\n    var(--nav-canvas);\n  color: var(--nav-text);\n}\n\nbutton,\ninput,\nselect {\n  font: inherit;\n}\n\na {\n  color: inherit;\n}\n\n.skip-link {\n  position: fixed;\n  z-index: 100;\n  top: 0.75rem;\n  left: 50%;\n  padding: 0.65rem 0.9rem;\n  transform: translate(-50%, -200%);\n  border-radius: var(--nav-radius-sm);\n  color: #ffffff;\n  background: var(--nav-text);\n}\n\n.skip-link:focus {\n  transform: translate(-50%, 0);\n}\n\n.visually-hidden {\n  position: absolute !important;\n  width: 1px !important;\n  height: 1px !important;\n  overflow: hidden !important;\n  clip: rect(0 0 0 0) !important;\n  white-space: nowrap !important;\n  clip-path: inset(50%) !important;\n}\n\n.navigator-chrome {\n  position: relative;\n  z-index: 20;\n  display: grid;\n  grid-template-columns: 1fr auto 1fr;\n  align-items: start;\n  min-height: 6.5rem;\n  padding:\n    clamp(1rem, 2.5vw, 1.75rem)\n    clamp(1rem, 3vw, 2.25rem);\n  pointer-events: none;\n}\n\n.navigator-chrome > * {\n  pointer-events: auto;\n}\n\n.navigator-nav {\n  position: fixed;\n  top: clamp(1rem, 2.5vw, 1.75rem);\n  left: clamp(1rem, 3vw, 2.25rem);\n  display: grid;\n  width: 3.2rem;\n  max-height: 3.2rem;\n  overflow: hidden;\n  border: 1px solid var(--nav-border);\n  border-radius: 1.6rem;\n  background: rgba(255, 255, 255, 0.96);\n  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);\n  transition:\n    width 180ms ease,\n    max-height 220ms ease 100ms,\n    border-radius 180ms ease,\n    box-shadow 180ms ease;\n  backdrop-filter: blur(18px);\n}\n\n.navigator-nav[data-open=\"true\"] {\n  width: min(16rem, calc(100vw - 2rem));\n  max-height: 31rem;\n  border-radius: var(--nav-radius-lg);\n  box-shadow: var(--nav-shadow);\n  transition:\n    width 180ms ease,\n    max-height 240ms ease 120ms,\n    border-radius 180ms ease,\n    box-shadow 180ms ease;\n}\n\n.navigator-nav__toggle {\n  display: grid;\n  grid-template-columns: 2rem minmax(0, 1fr) 1rem;\n  gap: 0.65rem;\n  align-items: center;\n  width: 100%;\n  min-height: 3.1rem;\n  padding: 0.3rem 0.55rem;\n  border: 0;\n  color: var(--nav-text);\n  background: transparent;\n  cursor: pointer;\n  text-align: left;\n}\n\n.navigator-mark {\n  position: relative;\n  display: grid;\n  width: 2rem;\n  height: 2rem;\n  place-items: center;\n  overflow: hidden;\n  border-radius: 50%;\n  color: var(--nav-text);\n  background: var(--nav-surface-muted);\n  font-size: 0.68rem;\n  font-weight: 800;\n  letter-spacing: -0.03em;\n}\n\n.navigator-mark__bar {\n  position: absolute;\n  inset: 0 auto 0 0;\n  width: 0.28rem;\n  background: var(--nav-red);\n}\n\n.navigator-mark__letters {\n  transform: translateX(0.09rem);\n}\n\n.navigator-nav__toggle-label {\n  overflow: hidden;\n  font-size: 0.9rem;\n  font-weight: 700;\n  opacity: 0;\n  white-space: nowrap;\n  transition: opacity 100ms ease;\n}\n\n.navigator-nav__chevron {\n  display: grid;\n  place-items: center;\n  color: var(--nav-text-muted);\n  font-size: 1.25rem;\n  opacity: 0;\n  transform: rotate(0deg);\n  transition:\n    opacity 100ms ease,\n    transform 180ms ease;\n}\n\n.navigator-nav[data-open=\"true\"] .navigator-nav__toggle-label,\n.navigator-nav[data-open=\"true\"] .navigator-nav__chevron {\n  opacity: 1;\n  transition-delay: 150ms;\n}\n\n.navigator-nav[data-open=\"true\"] .navigator-nav__chevron {\n  transform: rotate(90deg);\n}\n\n.navigator-nav__toggle:focus-visible,\n.navigator-nav__panel a:focus-visible,\n.category-switcher select:focus-visible {\n  outline: 3px solid color-mix(in srgb, var(--nav-focus) 28%, transparent);\n  outline-offset: 2px;\n}\n\n.navigator-nav__panel {\n  display: grid;\n  gap: 0.2rem;\n  padding: 0.35rem 0.45rem 0.6rem;\n  opacity: 0;\n  transform: translateY(-0.25rem);\n  transition:\n    opacity 120ms ease,\n    transform 120ms ease;\n  visibility: hidden;\n}\n\n.navigator-nav[data-open=\"true\"] .navigator-nav__panel {\n  opacity: 1;\n  transform: translateY(0);\n  transition-delay: 170ms;\n  visibility: visible;\n}\n\n.navigator-nav__panel a {\n  display: flex;\n  min-height: 2.5rem;\n  align-items: center;\n  padding: 0.55rem 0.8rem;\n  border-radius: var(--nav-radius-md);\n  color: var(--nav-text-muted);\n  font-size: 0.9rem;\n  font-weight: 600;\n  text-decoration: none;\n}\n\n.navigator-nav__panel a:hover {\n  color: var(--nav-text);\n  background: var(--nav-surface-muted);\n}\n\n.navigator-nav__panel a[aria-current=\"page\"] {\n  color: var(--nav-red-dark);\n  background: var(--nav-red-soft);\n}\n\n.navigator-nav__separator {\n  height: 1px;\n  margin: 0.4rem 0.75rem;\n  background: var(--nav-border);\n}\n\n.category-switcher {\n  grid-column: 2;\n  justify-self: center;\n}\n\n.category-switcher select {\n  min-height: 2.65rem;\n  min-width: 10rem;\n  padding: 0.5rem 2.3rem 0.5rem 0.9rem;\n  border: 1px solid var(--nav-border);\n  border-radius: 999px;\n  color: var(--nav-text);\n  background:\n    linear-gradient(45deg, transparent 50%, var(--nav-text-muted) 50%)\n      calc(100% - 1rem) 51% / 0.32rem 0.32rem no-repeat,\n    linear-gradient(135deg, var(--nav-text-muted) 50%, transparent 50%)\n      calc(100% - 0.7rem) 51% / 0.32rem 0.32rem no-repeat,\n    rgba(255, 255, 255, 0.92);\n  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.045);\n  font-size: 0.88rem;\n  font-weight: 700;\n  appearance: none;\n  cursor: pointer;\n  backdrop-filter: blur(15px);\n}\n\n.connection-status {\n  grid-column: 3;\n  justify-self: end;\n  display: inline-flex;\n  min-height: 2.65rem;\n  align-items: center;\n  gap: 0.55rem;\n  padding: 0.45rem 0.8rem;\n  border: 1px solid var(--nav-border);\n  border-radius: 999px;\n  color: var(--nav-text-muted);\n  background: rgba(255, 255, 255, 0.9);\n  font-size: 0.78rem;\n  font-weight: 650;\n  backdrop-filter: blur(15px);\n}\n\n.connection-status__dot {\n  width: 0.48rem;\n  height: 0.48rem;\n  border-radius: 50%;\n  background: var(--nav-border-strong);\n}\n\n.connection-status[data-state=\"ready\"] .connection-status__dot {\n  background: var(--nav-positive);\n  box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--nav-positive) 15%, transparent);\n}\n\n.connection-status[data-state=\"stale\"] .connection-status__dot {\n  background: var(--nav-warning);\n}\n\n.connection-status[data-state=\"error\"] .connection-status__dot {\n  background: var(--nav-critical);\n}\n\n.navigator-main {\n  width: min(\n    calc(100% - 2 * clamp(1rem, 4vw, 3rem)),\n    var(--nav-max-width)\n  );\n  min-height: calc(100vh - 11rem);\n  margin-inline: auto;\n  padding:\n    clamp(1rem, 3vw, 2rem)\n    0\n    clamp(4rem, 8vw, 7rem);\n  outline: none;\n}\n\n.navigator-loading {\n  max-width: 42rem;\n  margin: clamp(4rem, 12vh, 9rem) auto 0;\n  text-align: center;\n}\n\n.navigator-eyebrow {\n  margin: 0 0 0.8rem;\n  color: var(--nav-red);\n  font-size: 0.74rem;\n  font-weight: 800;\n  letter-spacing: 0.14em;\n  text-transform: uppercase;\n}\n\n.navigator-loading h1,\n.page-heading h1 {\n  margin: 0;\n  color: var(--nav-text);\n  font-size: clamp(2.7rem, 7vw, 5.8rem);\n  font-weight: 750;\n  letter-spacing: -0.065em;\n  line-height: 0.94;\n}\n\n.navigator-loading p:last-child,\n.page-heading__summary {\n  max-width: 60ch;\n  margin: 1.25rem 0 0;\n  color: var(--nav-text-muted);\n  font-size: clamp(1rem, 2vw, 1.2rem);\n}\n\n.page-heading {\n  display: grid;\n  grid-template-columns: minmax(0, 1.4fr) minmax(15rem, 0.55fr);\n  gap: clamp(2rem, 7vw, 7rem);\n  align-items: end;\n  padding:\n    clamp(3rem, 8vw, 7rem)\n    0\n    clamp(2.5rem, 6vw, 5rem);\n}\n\n.page-heading__summary {\n  margin-inline: 0;\n}\n\n.page-heading__aside {\n  display: grid;\n  gap: 0.45rem;\n  padding: 1rem 0 1rem 1.3rem;\n  border-left: 0.25rem solid var(--nav-red);\n}\n\n.page-heading__aside strong {\n  font-size: clamp(2rem, 5vw, 3.5rem);\n  letter-spacing: -0.05em;\n  line-height: 1;\n}\n\n.page-heading__aside span {\n  color: var(--nav-text-muted);\n  font-size: 0.86rem;\n}\n\n.overview-grid {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 1rem;\n}\n\n.overview-card,\n.status-panel,\n.library-stat,\n.empty-category {\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-lg);\n  background: var(--nav-surface);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.035);\n}\n\n.overview-card {\n  position: relative;\n  display: grid;\n  min-height: 11rem;\n  align-content: space-between;\n  gap: 1.5rem;\n  padding: 1.35rem;\n  color: var(--nav-text);\n  text-decoration: none;\n  transition:\n    transform 140ms ease,\n    border-color 140ms ease,\n    box-shadow 140ms ease;\n}\n\n.overview-card::before {\n  position: absolute;\n  inset: 0 auto 0 0;\n  width: 0.22rem;\n  border-radius: var(--nav-radius-lg) 0 0 var(--nav-radius-lg);\n  background: transparent;\n  content: \"\";\n}\n\n.overview-card:hover {\n  transform: translateY(-2px);\n  border-color: var(--nav-border-strong);\n  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.07);\n}\n\n.overview-card:hover::before {\n  background: var(--nav-red);\n}\n\n.overview-card__label {\n  color: var(--nav-text-muted);\n  font-size: 0.82rem;\n  font-weight: 700;\n}\n\n.overview-card__count {\n  display: block;\n  margin-top: 0.35rem;\n  font-size: clamp(2.3rem, 5vw, 4rem);\n  font-weight: 760;\n  letter-spacing: -0.055em;\n  line-height: 1;\n}\n\n.overview-card__action {\n  color: var(--nav-red-dark);\n  font-size: 0.82rem;\n  font-weight: 700;\n}\n\n.section-block {\n  margin-top: clamp(3rem, 7vw, 6rem);\n}\n\n.section-heading {\n  display: flex;\n  align-items: end;\n  justify-content: space-between;\n  gap: 2rem;\n  margin-bottom: 1.25rem;\n}\n\n.section-heading h2 {\n  margin: 0;\n  font-size: clamp(1.55rem, 3vw, 2.4rem);\n  letter-spacing: -0.035em;\n}\n\n.section-heading p {\n  max-width: 52ch;\n  margin: 0;\n  color: var(--nav-text-muted);\n  font-size: 0.9rem;\n  text-align: right;\n}\n\n.status-grid {\n  display: grid;\n  grid-template-columns: minmax(0, 1.5fr) minmax(18rem, 0.65fr);\n  gap: 1rem;\n}\n\n.status-panel {\n  display: grid;\n  gap: 1.15rem;\n  padding: 1.4rem;\n}\n\n.status-panel__topline {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 1rem;\n}\n\n.status-panel__topline h3 {\n  margin: 0;\n  font-size: 1rem;\n}\n\n.status-badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.45rem;\n  color: var(--nav-positive);\n  font-size: 0.78rem;\n  font-weight: 750;\n}\n\n.status-badge::before {\n  width: 0.45rem;\n  height: 0.45rem;\n  border-radius: 50%;\n  background: currentColor;\n  content: \"\";\n}\n\n.status-list {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 1rem;\n  margin: 0;\n}\n\n.status-list div {\n  min-width: 0;\n}\n\n.status-list dt {\n  color: var(--nav-text-muted);\n  font-size: 0.72rem;\n  font-weight: 750;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.status-list dd {\n  overflow: hidden;\n  margin: 0.3rem 0 0;\n  font-size: 0.94rem;\n  font-weight: 650;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.category-intro {\n  display: grid;\n  grid-template-columns: minmax(0, 1.1fr) minmax(17rem, 0.6fr);\n  gap: clamp(2rem, 7vw, 7rem);\n  align-items: center;\n  min-height: 21rem;\n  padding: clamp(2rem, 6vw, 5rem);\n  border: 1px solid var(--nav-border);\n  border-radius: clamp(1rem, 2.5vw, 1.8rem);\n  background:\n    linear-gradient(\n      112deg,\n      var(--nav-red-soft),\n      var(--nav-surface) 54%\n    );\n}\n\n.category-intro h2 {\n  max-width: 12ch;\n  margin: 0;\n  font-size: clamp(2.4rem, 6vw, 5.4rem);\n  letter-spacing: -0.06em;\n  line-height: 0.96;\n}\n\n.category-intro p {\n  max-width: 56ch;\n  margin: 1.2rem 0 0;\n  color: var(--nav-text-muted);\n}\n\n.category-intro__count {\n  display: grid;\n  justify-items: start;\n  gap: 0.6rem;\n  padding-left: clamp(1rem, 4vw, 3rem);\n  border-left: 1px solid var(--nav-border-strong);\n}\n\n.category-intro__count strong {\n  font-size: clamp(4rem, 10vw, 8rem);\n  letter-spacing: -0.075em;\n  line-height: 0.8;\n}\n\n.category-intro__count span {\n  color: var(--nav-text-muted);\n  font-size: 0.86rem;\n}\n\n.primary-action,\n.secondary-action {\n  display: inline-flex;\n  min-height: 2.8rem;\n  align-items: center;\n  justify-content: center;\n  margin-top: 1.5rem;\n  padding: 0.65rem 1rem;\n  border: 1px solid transparent;\n  border-radius: var(--nav-radius-sm);\n  font-size: 0.84rem;\n  font-weight: 750;\n  text-decoration: none;\n}\n\n.primary-action {\n  color: #ffffff;\n  background: var(--nav-red);\n}\n\n.primary-action:hover {\n  background: var(--nav-red-dark);\n}\n\n.secondary-action {\n  color: var(--nav-text);\n  border-color: var(--nav-border-strong);\n  background: var(--nav-surface);\n}\n\n.empty-category {\n  margin-top: 1rem;\n  padding: 1.6rem;\n  color: var(--nav-text-muted);\n}\n\n.empty-category strong {\n  display: block;\n  margin-bottom: 0.3rem;\n  color: var(--nav-text);\n}\n\n.library-grid {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 1rem;\n}\n\n.library-stat {\n  padding: 1.35rem;\n}\n\n.library-stat span {\n  color: var(--nav-text-muted);\n  font-size: 0.78rem;\n  font-weight: 700;\n}\n\n.library-stat strong {\n  display: block;\n  margin-top: 0.45rem;\n  font-size: 2.4rem;\n  letter-spacing: -0.05em;\n  line-height: 1;\n}\n\n.settings-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 1rem;\n}\n\n.settings-card {\n  min-width: 0;\n  padding: 1.4rem;\n  border: 1px solid var(--nav-border);\n  border-radius: var(--nav-radius-lg);\n  background: var(--nav-surface);\n}\n\n.settings-card h2 {\n  margin: 0 0 1rem;\n  font-size: 1rem;\n}\n\n.settings-card dl {\n  display: grid;\n  gap: 0.9rem;\n  margin: 0;\n}\n\n.settings-card dl div {\n  display: grid;\n  grid-template-columns: minmax(7rem, 0.55fr) minmax(0, 1fr);\n  gap: 1rem;\n  padding-bottom: 0.9rem;\n  border-bottom: 1px solid var(--nav-border);\n}\n\n.settings-card dl div:last-child {\n  padding-bottom: 0;\n  border-bottom: 0;\n}\n\n.settings-card dt {\n  color: var(--nav-text-muted);\n  font-size: 0.78rem;\n}\n\n.settings-card dd {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  margin: 0;\n  font-size: 0.86rem;\n  font-weight: 650;\n  text-align: right;\n}\n\n.navigator-error {\n  max-width: 42rem;\n  margin: 6rem auto;\n  padding: 1.6rem;\n  border: 1px solid color-mix(in srgb, var(--nav-critical) 35%, white);\n  border-radius: var(--nav-radius-lg);\n  background: #fff4f2;\n}\n\n.navigator-error h1,\n.navigator-error p {\n  margin: 0;\n}\n\n.navigator-error p {\n  margin-top: 0.75rem;\n  color: var(--nav-text-muted);\n}\n\n.navigator-footer {\n  display: flex;\n  justify-content: center;\n  gap: 0.55rem;\n  min-height: 4rem;\n  align-items: center;\n  padding: 1rem;\n  color: var(--nav-text-muted);\n  font-size: 0.74rem;\n}\n\n@media (max-width: 64rem) {\n  .overview-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n\n  .page-heading,\n  .category-intro,\n  .status-grid {\n    grid-template-columns: 1fr;\n  }\n\n  .page-heading__aside,\n  .category-intro__count {\n    max-width: 22rem;\n  }\n\n  .library-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n}\n\n@media (max-width: 44rem) {\n  .navigator-chrome {\n    grid-template-columns: 1fr auto;\n    min-height: 7.5rem;\n  }\n\n  .category-switcher {\n    grid-column: 2;\n    justify-self: end;\n  }\n\n  .connection-status {\n    grid-column: 1 / -1;\n    grid-row: 2;\n    justify-self: end;\n    margin-top: 0.65rem;\n  }\n\n  .connection-status span:last-child {\n    max-width: 9rem;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n  }\n\n  .overview-grid,\n  .library-grid,\n  .settings-grid,\n  .status-list {\n    grid-template-columns: 1fr;\n  }\n\n  .section-heading {\n    align-items: start;\n    flex-direction: column;\n  }\n\n  .section-heading p {\n    text-align: left;\n  }\n\n  .category-intro__count {\n    padding-top: 1.5rem;\n    padding-left: 0;\n    border-top: 1px solid var(--nav-border-strong);\n    border-left: 0;\n  }\n\n  .settings-card dl div {\n    grid-template-columns: 1fr;\n    gap: 0.3rem;\n  }\n\n  .settings-card dd {\n    text-align: left;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    scroll-behavior: auto !important;\n    transition-duration: 0.01ms !important;\n    transition-delay: 0ms !important;\n  }\n}\n\n\n/* Artefact gallery */\n\n.artifact-gallery {\n  margin-top: 1.25rem;\n}\n\n.artifact-gallery__grid {\n  display: grid;\n  grid-template-columns: repeat(12, minmax(0, 1fr));\n  gap:\n    clamp(1rem, 2.5vw, 1.65rem)\n    clamp(1rem, 2.5vw, 1.65rem);\n  align-items: start;\n}\n\n.artifact-card {\n  grid-column: span 4;\n  min-width: 0;\n}\n\n.artifact-card[data-variant=\"wide\"] {\n  grid-column: span 7;\n}\n\n.artifact-card[data-variant=\"tall\"] {\n  grid-column: span 5;\n}\n\n.artifact-preview-mount {\n  position: relative;\n  z-index: 1;\n  width: calc(100% - clamp(0.7rem, 2vw, 1.3rem));\n  margin-inline: auto;\n  overflow: hidden;\n  border: 1px solid var(--nav-border);\n  border-radius:\n    clamp(0.9rem, 2vw, 1.4rem)\n    clamp(0.9rem, 2vw, 1.4rem)\n    0.45rem\n    0.45rem;\n  background: var(--nav-surface-muted);\n  box-shadow:\n    0 1.4rem 3.4rem rgba(0, 0, 0, 0.13),\n    0 0.25rem 0.8rem rgba(0, 0, 0, 0.055);\n}\n\n.artifact-card:not([data-kind=\"dashboard\"])\n  .artifact-preview-mount {\n  border-color:\n    rgba(255, 255, 255, 0.7);\n  background:\n    linear-gradient(\n      145deg,\n      rgba(255, 255, 255, 0.78),\n      rgba(255, 255, 255, 0.38)\n    );\n  box-shadow:\n    0 1.8rem 4.5rem rgba(0, 0, 0, 0.13),\n    inset 0 1px 0 rgba(255, 255, 255, 0.82);\n  backdrop-filter: blur(24px);\n}\n\n.artifact-preview-mount[data-variant=\"standard\"] {\n  aspect-ratio: 5 / 4;\n}\n\n.artifact-preview-mount[data-variant=\"wide\"] {\n  aspect-ratio: 16 / 9;\n}\n\n.artifact-preview-mount[data-variant=\"tall\"] {\n  width: calc(100% - clamp(1.5rem, 4vw, 3rem));\n  aspect-ratio: 4 / 5;\n}\n\n.artifact-preview-viewport {\n  position: absolute;\n  inset: 0;\n  overflow: hidden;\n  background:\n    linear-gradient(\n      135deg,\n      #f5f5f5,\n      #ffffff\n    );\n}\n\n.artifact-preview-viewport iframe {\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 1440px;\n  height: 900px;\n  border: 0;\n  transform:\n    scale(\n      var(--preview-scale, 0.25)\n    );\n  transform-origin: top left;\n  pointer-events: none;\n  opacity: 0;\n  background: #ffffff;\n  transition: opacity 220ms ease;\n}\n\n.artifact-preview-viewport\n  iframe[data-state=\"ready\"] {\n  opacity: 1;\n}\n\n.artifact-preview-status {\n  position: absolute;\n  inset: 0;\n  display: grid;\n  place-content: center;\n  justify-items: center;\n  gap: 0.7rem;\n  color: var(--nav-text-muted);\n  background:\n    radial-gradient(\n      circle at 50% 30%,\n      rgba(219, 0, 17, 0.08),\n      transparent 45%\n    ),\n    var(--nav-surface-muted);\n  font-size: 0.78rem;\n  font-weight: 700;\n  transition:\n    opacity 180ms ease,\n    visibility 180ms ease;\n}\n\n.artifact-preview-status[data-state=\"ready\"] {\n  opacity: 0;\n  visibility: hidden;\n}\n\n.artifact-preview-status[data-state=\"error\"] {\n  color: var(--nav-critical);\n  background: #fff4f2;\n}\n\n.artifact-preview-status__spinner {\n  width: 1.65rem;\n  height: 1.65rem;\n  border: 2px solid var(--nav-border);\n  border-top-color: var(--nav-red);\n  border-radius: 50%;\n  animation:\n    artifact-preview-spin 900ms\n    linear infinite;\n}\n\n.artifact-preview-status[data-state=\"error\"]\n  .artifact-preview-status__spinner {\n  border: 0;\n  animation: none;\n}\n\n.artifact-preview-status[data-state=\"error\"]\n  .artifact-preview-status__spinner::before {\n  content: \"!\";\n  font-size: 1.5rem;\n  font-weight: 800;\n}\n\n.artifact-preview-link {\n  position: absolute;\n  z-index: 3;\n  inset: 0;\n}\n\n.artifact-preview-link:focus-visible {\n  outline:\n    4px solid\n    color-mix(\n      in srgb,\n      var(--nav-focus) 45%,\n      transparent\n    );\n  outline-offset: -4px;\n}\n\n.artifact-card__panel {\n  position: relative;\n  z-index: 2;\n  display: grid;\n  grid-template-columns:\n    minmax(0, 1fr)\n    auto;\n  gap: 1rem;\n  align-items: end;\n  min-height: 8.5rem;\n  margin-top: -0.2rem;\n  padding:\n    clamp(1rem, 2vw, 1.35rem);\n  border: 1px solid var(--nav-border);\n  border-radius:\n    0.35rem\n    0.35rem\n    var(--nav-radius-lg)\n    var(--nav-radius-lg);\n  background: var(--nav-surface);\n  box-shadow:\n    0 0.25rem 1.1rem\n    rgba(0, 0, 0, 0.055);\n}\n\n.artifact-card__copy {\n  min-width: 0;\n}\n\n.artifact-card__kind {\n  margin: 0;\n  color: var(--nav-red-dark);\n  font-size: 0.68rem;\n  font-weight: 800;\n  letter-spacing: 0.11em;\n  text-transform: uppercase;\n}\n\n.artifact-card__title {\n  margin: 0.35rem 0 0;\n  color: var(--nav-text);\n  font-size:\n    clamp(1.15rem, 2.5vw, 1.55rem);\n  letter-spacing: -0.035em;\n  line-height: 1.12;\n}\n\n.artifact-card__description {\n  display: -webkit-box;\n  max-width: 52ch;\n  overflow: hidden;\n  margin: 0.55rem 0 0;\n  color: var(--nav-text-muted);\n  font-size: 0.78rem;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 2;\n}\n\n.artifact-card__actions {\n  display: grid;\n  gap: 0.55rem;\n  justify-items: end;\n}\n\n.artifact-card__view,\n.artifact-card__download {\n  display: inline-flex;\n  min-height: 2.25rem;\n  align-items: center;\n  justify-content: center;\n  padding: 0.45rem 0.7rem;\n  border-radius: var(--nav-radius-sm);\n  font-size: 0.76rem;\n  font-weight: 750;\n  text-decoration: none;\n  white-space: nowrap;\n}\n\n.artifact-card__view {\n  color: #ffffff;\n  background: var(--nav-red);\n}\n\n.artifact-card__view:hover {\n  background: var(--nav-red-dark);\n}\n\n.artifact-card__download {\n  color: var(--nav-text-muted);\n  border: 1px solid var(--nav-border);\n  background: var(--nav-surface);\n}\n\n.artifact-card__download:hover {\n  color: var(--nav-text);\n  border-color: var(--nav-border-strong);\n}\n\n.artifact-viewer {\n  display: grid;\n  gap: 1.2rem;\n  padding-top:\n    clamp(1.5rem, 4vw, 3rem);\n}\n\n.artifact-viewer__toolbar {\n  display: flex;\n  align-items: end;\n  justify-content: space-between;\n  gap: 2rem;\n}\n\n.artifact-viewer__identity {\n  min-width: 0;\n}\n\n.artifact-viewer__back {\n  display: inline-flex;\n  margin-bottom: 0.8rem;\n  color: var(--nav-text-muted);\n  font-size: 0.78rem;\n  font-weight: 700;\n  text-decoration: none;\n}\n\n.artifact-viewer__back:hover {\n  color: var(--nav-red-dark);\n}\n\n.artifact-viewer__kind {\n  margin: 0;\n  color: var(--nav-red-dark);\n  font-size: 0.7rem;\n  font-weight: 800;\n  letter-spacing: 0.12em;\n  text-transform: uppercase;\n}\n\n.artifact-viewer__title {\n  margin: 0.25rem 0 0;\n  font-size:\n    clamp(2rem, 5vw, 4.5rem);\n  letter-spacing: -0.06em;\n  line-height: 0.98;\n}\n\n.artifact-viewer__actions {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 0.7rem;\n}\n\n.artifact-viewer__actions\n  .primary-action,\n.artifact-viewer__actions\n  .secondary-action {\n  margin-top: 0;\n}\n\n.artifact-viewer__mount {\n  position: relative;\n  min-height:\n    clamp(35rem, 72vh, 62rem);\n  overflow: hidden;\n  border: 1px solid var(--nav-border);\n  border-radius:\n    clamp(0.8rem, 2vw, 1.4rem);\n  background: var(--nav-surface-muted);\n  box-shadow: var(--nav-shadow);\n}\n\n.artifact-viewer__mount iframe {\n  width: 100%;\n  height:\n    clamp(35rem, 72vh, 62rem);\n  border: 0;\n  background: #ffffff;\n  opacity: 0;\n  transition: opacity 180ms ease;\n}\n\n.artifact-viewer__mount\n  iframe[data-state=\"ready\"] {\n  opacity: 1;\n}\n\n.artifact-viewer__status {\n  position: absolute;\n  inset: 0;\n  display: grid;\n  place-content: center;\n  color: var(--nav-text-muted);\n  background:\n    radial-gradient(\n      circle at 50% 20%,\n      rgba(219, 0, 17, 0.07),\n      transparent 38%\n    ),\n    var(--nav-surface-muted);\n  font-size: 0.84rem;\n  font-weight: 700;\n  pointer-events: none;\n  transition:\n    opacity 160ms ease,\n    visibility 160ms ease;\n}\n\n.artifact-viewer__status[data-state=\"ready\"] {\n  opacity: 0;\n  visibility: hidden;\n}\n\n.artifact-viewer__status[data-state=\"error\"] {\n  color: var(--nav-critical);\n  background: #fff4f2;\n}\n\n.artifact-viewer__description {\n  max-width: 70ch;\n  margin: 0;\n  color: var(--nav-text-muted);\n  font-size: 0.86rem;\n}\n\n@keyframes artifact-preview-spin {\n  to {\n    transform: rotate(1turn);\n  }\n}\n\n@media (max-width: 72rem) {\n  .artifact-card,\n  .artifact-card[data-variant=\"wide\"],\n  .artifact-card[data-variant=\"tall\"] {\n    grid-column: span 6;\n  }\n}\n\n@media (max-width: 48rem) {\n  .artifact-card,\n  .artifact-card[data-variant=\"wide\"],\n  .artifact-card[data-variant=\"tall\"] {\n    grid-column: 1 / -1;\n  }\n\n  .artifact-preview-mount[data-variant=\"tall\"] {\n    width: calc(100% - 2rem);\n    aspect-ratio: 5 / 4;\n  }\n\n  .artifact-card__panel {\n    grid-template-columns: 1fr;\n    align-items: start;\n  }\n\n  .artifact-card__actions {\n    grid-template-columns:\n      repeat(2, minmax(0, 1fr));\n    justify-items: stretch;\n  }\n\n  .artifact-viewer__toolbar {\n    align-items: start;\n    flex-direction: column;\n  }\n\n  .artifact-viewer__actions {\n    justify-content: flex-start;\n  }\n\n  .artifact-viewer__mount,\n  .artifact-viewer__mount iframe {\n    min-height: 31rem;\n    height: 65vh;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .artifact-preview-status__spinner {\n    animation-duration: 2s;\n  }\n}\n"]}, "app/api.js": {"content": "const responseCache = new Map();\n\nexport class NavigatorApiError extends Error {\n  constructor(message, options = {}) {\n    super(message);\n    this.name = \"NavigatorApiError\";\n    this.status = options.status ?? 0;\n    this.code = options.code ?? \"NAVIGATOR_API_ERROR\";\n    this.details = options.details ?? null;\n  }\n}\n\nexport async function loadNavigatorSnapshot(\n  options = {},\n) {\n  const signal = options.signal;\n\n  const [\n    health,\n    artefacts,\n    library,\n    state,\n    git,\n  ] = await Promise.all([\n    getJson(\"/api/health\", { signal }),\n    getJson(\"/api/artifacts\", { signal }),\n    getJson(\"/api/library\", { signal }),\n    getJson(\"/api/state\", {\n      signal,\n      cache: false,\n    }),\n    getJson(\"/api/git/status\", {\n      signal,\n      cache: false,\n    }),\n  ]);\n\n  return {\n    health,\n    artefacts:\n      artefacts.artifacts ?? [],\n    library:\n      library.entries ?? [],\n    librarySummary:\n      library.summary ?? {},\n    libraryIssues:\n      library.issues ?? [],\n    state,\n    git,\n  };\n}\n\nexport async function loadArtifactViewerData(\n  kind,\n  id,\n  options = {},\n) {\n  const base =\n    `/api/artifacts/${encodeURIComponent(\n      kind,\n    )}/${encodeURIComponent(id)}`;\n  const [\n    detail,\n    exportStatus,\n  ] = await Promise.all([\n    getJson(base, {\n      signal: options.signal,\n    }),\n    getJson(\n      `${base}/export-status`,\n      {\n        signal: options.signal,\n      },\n    ),\n  ]);\n\n  return {\n    artifact: detail.artifact,\n    resolution: detail.resolution,\n    relatedIssues:\n      detail.relatedIssues ?? [],\n    exportStatus,\n  };\n}\n\nexport async function getJson(\n  path,\n  options = {},\n) {\n  const cached =\n    responseCache.get(path);\n  const headers = new Headers(\n    options.headers,\n  );\n\n  if (\n    options.cache !== false &&\n    cached?.etag\n  ) {\n    headers.set(\n      \"If-None-Match\",\n      cached.etag,\n    );\n  }\n\n  const response = await fetch(\n    path,\n    {\n      method: \"GET\",\n      headers,\n      signal: options.signal,\n      credentials: \"same-origin\",\n    },\n  );\n\n  if (\n    response.status === 304 &&\n    cached\n  ) {\n    return cached.data;\n  }\n\n  let envelope;\n\n  try {\n    envelope =\n      await response.json();\n  } catch {\n    throw new NavigatorApiError(\n      `The server returned an unreadable response for ${path}.`,\n      {\n        status: response.status,\n        code:\n          \"NAVIGATOR_RESPONSE_INVALID\",\n      },\n    );\n  }\n\n  if (\n    !response.ok ||\n    envelope.ok !== true\n  ) {\n    throw new NavigatorApiError(\n      envelope.error?.message ??\n        `Request failed for ${path}.`,\n      {\n        status: response.status,\n        code:\n          envelope.error?.code ??\n          \"NAVIGATOR_REQUEST_FAILED\",\n        details:\n          envelope.error?.details ??\n          null,\n      },\n    );\n  }\n\n  const data = envelope.data;\n  const etag =\n    response.headers.get(\"etag\");\n\n  if (\n    options.cache !== false &&\n    etag\n  ) {\n    responseCache.set(path, {\n      etag,\n      data,\n    });\n  }\n\n  return data;\n}\n\nexport function clearApiCache() {\n  responseCache.clear();\n}\n", "allowedPrevious": ["const responseCache = new Map();\n\nexport class NavigatorApiError extends Error {\n  constructor(message, options = {}) {\n    super(message);\n    this.name = \"NavigatorApiError\";\n    this.status = options.status ?? 0;\n    this.code = options.code ?? \"NAVIGATOR_API_ERROR\";\n    this.details = options.details ?? null;\n  }\n}\n\nexport async function loadNavigatorSnapshot(\n  options = {},\n) {\n  const signal = options.signal;\n\n  const [\n    health,\n    artefacts,\n    library,\n    state,\n    git,\n  ] = await Promise.all([\n    getJson(\"/api/health\", { signal }),\n    getJson(\"/api/artifacts\", { signal }),\n    getJson(\"/api/library\", { signal }),\n    getJson(\"/api/state\", {\n      signal,\n      cache: false,\n    }),\n    getJson(\"/api/git/status\", {\n      signal,\n      cache: false,\n    }),\n  ]);\n\n  return {\n    health,\n    artefacts:\n      artefacts.artifacts ?? [],\n    library:\n      library.entries ?? [],\n    librarySummary:\n      library.summary ?? {},\n    libraryIssues:\n      library.issues ?? [],\n    state,\n    git,\n  };\n}\n\nexport async function getJson(\n  path,\n  options = {},\n) {\n  const cached =\n    responseCache.get(path);\n  const headers = new Headers(\n    options.headers,\n  );\n\n  if (\n    options.cache !== false &&\n    cached?.etag\n  ) {\n    headers.set(\n      \"If-None-Match\",\n      cached.etag,\n    );\n  }\n\n  const response = await fetch(\n    path,\n    {\n      method: \"GET\",\n      headers,\n      signal: options.signal,\n      credentials: \"same-origin\",\n    },\n  );\n\n  if (\n    response.status === 304 &&\n    cached\n  ) {\n    return cached.data;\n  }\n\n  let envelope;\n\n  try {\n    envelope =\n      await response.json();\n  } catch {\n    throw new NavigatorApiError(\n      `The server returned an unreadable response for ${path}.`,\n      {\n        status: response.status,\n        code:\n          \"NAVIGATOR_RESPONSE_INVALID\",\n      },\n    );\n  }\n\n  if (\n    !response.ok ||\n    envelope.ok !== true\n  ) {\n    throw new NavigatorApiError(\n      envelope.error?.message ??\n        `Request failed for ${path}.`,\n      {\n        status: response.status,\n        code:\n          envelope.error?.code ??\n          \"NAVIGATOR_REQUEST_FAILED\",\n        details:\n          envelope.error?.details ??\n          null,\n      },\n    );\n  }\n\n  const data = envelope.data;\n  const etag =\n    response.headers.get(\"etag\");\n\n  if (\n    options.cache !== false &&\n    etag\n  ) {\n    responseCache.set(path, {\n      etag,\n      data,\n    });\n  }\n\n  return data;\n}\n\nexport function clearApiCache() {\n  responseCache.clear();\n}\n"]}, "app/main.js": {"content": "import {\n  clearApiCache,\n  loadNavigatorSnapshot,\n} from \"./api.js\";\nimport {\n  activateArtifactPreviews,\n  createArtifactGallery,\n} from \"./gallery.js\";\nimport {\n  categoryPathForKind,\n  sortArtifacts,\n} from \"./gallery-model.js\";\nimport {\n  activateArtifactViewer,\n  createArtifactViewer,\n} from \"./viewer.js\";\nimport {\n  navigate,\n  routeForPath,\n} from \"./router.js\";\n\nconst elements = {\n  nav:\n    document.querySelector(\n      \"#navigator-nav\",\n    ),\n  navToggle:\n    document.querySelector(\n      \"#nav-toggle\",\n    ),\n  categorySelector:\n    document.querySelector(\n      \"#category-selector\",\n    ),\n  connection:\n    document.querySelector(\n      \"#connection-status\",\n    ),\n  connectionLabel:\n    document.querySelector(\n      \"#connection-status-label\",\n    ),\n  main:\n    document.querySelector(\n      \"#page-content\",\n    ),\n  footerRevision:\n    document.querySelector(\n      \"#footer-revision\",\n    ),\n};\n\nconst state = {\n  snapshot: null,\n  route: routeForPath(\n    window.location.pathname,\n  ),\n  eventSource: null,\n  loadingController: null,\n  revisionId: null,\n  deactivatePreviews: null,\n  deactivateViewer: null,\n};\n\ninitialise().catch(\n  renderFatalError,\n);\n\nasync function initialise() {\n  bindNavigation();\n  restoreNavigationState();\n  updateRouteChrome();\n  await refreshSnapshot({\n    focus: false,\n  });\n  connectRevisionEvents();\n}\n\nfunction bindNavigation() {\n  elements.navToggle.addEventListener(\n    \"click\",\n    () => {\n      setNavOpen(\n        elements.nav.dataset.open !==\n          \"true\",\n      );\n    },\n  );\n\n  elements.categorySelector.addEventListener(\n    \"change\",\n    () => {\n      navigate(\n        elements.categorySelector.value,\n      );\n    },\n  );\n\n  document.addEventListener(\n    \"click\",\n    (event) => {\n      const link =\n        event.target.closest(\n          \"[data-navigator-link]\",\n        );\n\n      if (link) {\n        event.preventDefault();\n        navigate(\n          link.getAttribute(\"href\"),\n        );\n        setNavOpen(false);\n        return;\n      }\n\n      if (\n        elements.nav.dataset.open ===\n          \"true\" &&\n        !elements.nav.contains(\n          event.target,\n        )\n      ) {\n        setNavOpen(false);\n      }\n    },\n  );\n\n  document.addEventListener(\n    \"keydown\",\n    (event) => {\n      if (\n        event.key === \"Escape\" &&\n        elements.nav.dataset.open ===\n          \"true\"\n      ) {\n        setNavOpen(false);\n        elements.navToggle.focus();\n      }\n    },\n  );\n\n  window.addEventListener(\n    \"popstate\",\n    () => {\n      state.route = routeForPath(\n        window.location.pathname,\n      );\n      updateRouteChrome();\n      renderCurrentRoute({\n        focus: true,\n      });\n    },\n  );\n}\n\nfunction restoreNavigationState() {\n  const saved =\n    window.localStorage.getItem(\n      \"mydash.navigator.nav-open\",\n    );\n\n  setNavOpen(saved === \"true\", {\n    persist: false,\n  });\n}\n\nfunction setNavOpen(\n  open,\n  options = {},\n) {\n  elements.nav.dataset.open =\n    String(open);\n  elements.navToggle.setAttribute(\n    \"aria-expanded\",\n    String(open),\n  );\n\n  if (options.persist !== false) {\n    window.localStorage.setItem(\n      \"mydash.navigator.nav-open\",\n      String(open),\n    );\n  }\n}\n\nasync function refreshSnapshot(\n  options = {},\n) {\n  state.loadingController?.abort();\n  state.loadingController =\n    new AbortController();\n\n  setConnection(\n    \"loading\",\n    state.snapshot\n      ? \"Refreshing\"\n      : \"Connecting\",\n  );\n\n  try {\n    const snapshot =\n      await loadNavigatorSnapshot({\n        signal:\n          state.loadingController.signal,\n      });\n\n    state.snapshot = snapshot;\n    state.revisionId =\n      snapshot.state?.revision?.id ??\n      snapshot.health?.revision?.id ??\n      null;\n\n    setConnection(\n      \"ready\",\n      \"Workspace live\",\n    );\n    updateRevisionLabel();\n    renderCurrentRoute({\n      focus:\n        options.focus ?? false,\n    });\n  } catch (error) {\n    if (\n      error?.name === \"AbortError\"\n    ) {\n      return;\n    }\n\n    setConnection(\n      state.snapshot\n        ? \"stale\"\n        : \"error\",\n      state.snapshot\n        ? \"Showing cached state\"\n        : \"Connection failed\",\n    );\n\n    if (!state.snapshot) {\n      renderFatalError(error);\n    }\n  }\n}\n\nfunction connectRevisionEvents() {\n  state.eventSource?.close();\n\n  const source =\n    new EventSource(\"/api/events\");\n  state.eventSource = source;\n\n  source.addEventListener(\n    \"workspace-revision\",\n    (event) => {\n      let revision;\n\n      try {\n        revision =\n          JSON.parse(event.data);\n      } catch {\n        return;\n      }\n\n      if (\n        revision.id &&\n        revision.id !==\n          state.revisionId\n      ) {\n        state.revisionId =\n          revision.id;\n        clearApiCache();\n        refreshSnapshot({\n          focus: false,\n        });\n      }\n    },\n  );\n\n  source.addEventListener(\n    \"open\",\n    () => {\n      if (state.snapshot) {\n        setConnection(\n          \"ready\",\n          \"Workspace live\",\n        );\n      }\n    },\n  );\n\n  source.addEventListener(\n    \"error\",\n    () => {\n      if (state.snapshot) {\n        setConnection(\n          \"stale\",\n          \"Reconnecting\",\n        );\n      }\n    },\n  );\n}\n\nfunction updateRouteChrome() {\n  const selectorPath =\n    state.route.id === \"viewer\"\n      ? categoryPathForKind(\n          state.route.params.kind,\n        )\n      : state.route.path;\n  elements.categorySelector.value =\n    selectorPath;\n\n  document.title =\n    state.route.id === \"home\"\n      ? \"My Dashboards\"\n      : state.route.id === \"viewer\"\n        ? \"Viewer · My Dashboards\"\n        : `${state.route.title} · My Dashboards`;\n\n  for (\n    const link of document.querySelectorAll(\n      \"[data-navigator-link]\",\n    )\n  ) {\n    const linkRoute =\n      link.dataset.route;\n    const current =\n      state.route.id === \"viewer\"\n        ? routeMatchesKind(\n            linkRoute,\n            state.route.params.kind,\n          )\n        : linkRoute ===\n          state.route.id;\n\n    if (current) {\n      link.setAttribute(\n        \"aria-current\",\n        \"page\",\n      );\n    } else {\n      link.removeAttribute(\n        \"aria-current\",\n      );\n    }\n  }\n}\n\nfunction renderCurrentRoute(\n  options = {},\n) {\n  if (!state.snapshot) return;\n\n  state.deactivatePreviews?.();\n  state.deactivatePreviews = null;\n  state.deactivateViewer?.();\n  state.deactivateViewer = null;\n\n  const view = {\n    home: renderHome,\n    dashboards: () =>\n      renderCategory({\n        kind: \"dashboard\",\n        singular: \"dashboard\",\n        plural: \"dashboards\",\n        title: \"Dashboards\",\n        description:\n          \"Operational views, decision support and live portfolio summaries.\",\n      }),\n    presentations: () =>\n      renderCategory({\n        kind: \"presentation\",\n        singular: \"presentation\",\n        plural: \"presentations\",\n        title: \"Presentations\",\n        description:\n          \"Narrative artefacts designed to explain evidence, implications and action.\",\n      }),\n    concepts: () =>\n      renderCategory({\n        kind: \"concept\",\n        singular: \"concept\",\n        plural: \"concepts\",\n        title: \"Concepts\",\n        description:\n          \"Lightweight prototypes for exploring an idea before it becomes shared architecture.\",\n      }),\n    components:\n      renderComponents,\n    settings:\n      renderSettings,\n    viewer:\n      renderViewer,\n  }[state.route.id];\n\n  elements.main.replaceChildren(\n    view(),\n  );\n\n  state.deactivatePreviews =\n    activateArtifactPreviews(\n      elements.main,\n    );\n\n  if (\n    state.route.id ===\n    \"viewer\"\n  ) {\n    const artifact =\n      currentViewerArtifact();\n\n    if (artifact) {\n      state.deactivateViewer =\n        activateArtifactViewer(\n          elements.main,\n          {\n            artifact,\n            revisionId:\n              state.revisionId,\n          },\n        );\n    }\n  }\n\n  if (options.focus) {\n    elements.main.focus({\n      preventScroll: true,\n    });\n  }\n}\n\nfunction renderHome() {\n  const fragment =\n    document.createDocumentFragment();\n  const counts =\n    artifactCounts();\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Repository navigator\",\n      title:\n        \"Everything you make, in one place.\",\n      summary:\n        \"Browse dashboards, presentations, concepts and shared UI directly from the filesystem.\",\n      asideValue:\n        String(\n          state.snapshot.artefacts.length,\n        ),\n      asideLabel:\n        pluralise(\n          state.snapshot.artefacts.length,\n          \"artefact\",\n          \"artefacts\",\n        ),\n    }),\n  );\n\n  const overview = element(\n    \"section\",\n    \"overview-grid\",\n  );\n  overview.setAttribute(\n    \"aria-label\",\n    \"Artefact categories\",\n  );\n\n  for (const item of [\n    {\n      route: \"/dashboards\",\n      label: \"Dashboards\",\n      count: counts.dashboard,\n    },\n    {\n      route: \"/presentations\",\n      label: \"Presentations\",\n      count:\n        counts.presentation,\n    },\n    {\n      route: \"/concepts\",\n      label: \"Concepts\",\n      count: counts.concept,\n    },\n    {\n      route: \"/components\",\n      label: \"Shared UI\",\n      count:\n        state.snapshot.library.filter(\n          isUiResource,\n        ).length,\n    },\n  ]) {\n    overview.append(\n      overviewCard(item),\n    );\n  }\n\n  fragment.append(overview);\n\n  if (\n    state.snapshot.artefacts.length >\n    0\n  ) {\n    const artefacts = element(\n      \"section\",\n      \"section-block\",\n    );\n    artefacts.append(\n      sectionHeading(\n        \"Your artefacts\",\n        \"Live previews are loaded only as they approach the viewport.\",\n      ),\n      createArtifactGallery(\n        state.snapshot.artefacts,\n        {\n          name: \"home\",\n          label:\n            \"Discovered artefacts\",\n        },\n      ),\n    );\n    fragment.append(artefacts);\n  }\n\n  const statusSection = element(\n    \"section\",\n    \"section-block\",\n  );\n  statusSection.append(\n    sectionHeading(\n      \"Workspace status\",\n      \"Live repository state from the shared server services.\",\n    ),\n  );\n\n  const statusGrid = element(\n    \"div\",\n    \"status-grid\",\n  );\n  statusGrid.append(\n    workspaceStatusPanel(),\n    cacheStatusPanel(),\n  );\n  statusSection.append(statusGrid);\n  fragment.append(statusSection);\n\n  return fragment;\n}\n\nfunction renderCategory(config) {\n  const matching =\n    sortArtifacts(\n      state.snapshot.artefacts.filter(\n        (item) =>\n          item.kind === config.kind,\n      ),\n    );\n  const fragment =\n    document.createDocumentFragment();\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Artefact library\",\n      title: config.title,\n      summary:\n        config.description,\n      asideValue:\n        String(matching.length),\n      asideLabel:\n        pluralise(\n          matching.length,\n          config.singular,\n          config.plural,\n        ),\n    }),\n  );\n\n  if (matching.length === 0) {\n    const note = element(\n      \"div\",\n      \"empty-category\",\n    );\n    note.append(\n      element(\n        \"strong\",\n        \"\",\n        `No ${config.plural} yet`,\n      ),\n      element(\n        \"span\",\n        \"\",\n        `Create one with the /${config.singular} skill or add a valid artefact folder to the repository.`,\n      ),\n    );\n    fragment.append(note);\n    return fragment;\n  }\n\n  fragment.append(\n    createArtifactGallery(\n      matching,\n      {\n        name: config.plural,\n        label:\n          `${config.title} gallery`,\n      },\n    ),\n  );\n\n  return fragment;\n}\n\nfunction renderViewer() {\n  const artifact =\n    currentViewerArtifact();\n\n  if (!artifact) {\n    const missing = element(\n      \"section\",\n      \"navigator-error\",\n    );\n    missing.append(\n      element(\n        \"p\",\n        \"navigator-eyebrow\",\n        \"Artefact not found\",\n      ),\n      element(\n        \"h1\",\n        \"\",\n        \"This artefact is no longer available.\",\n      ),\n      element(\n        \"p\",\n        \"\",\n        \"It may have been renamed, removed or changed while the navigator was open.\",\n      ),\n    );\n    const back = element(\n      \"a\",\n      \"secondary-action\",\n      \"Return to library\",\n    );\n    back.href =\n      categoryPathForKind(\n        state.route.params.kind,\n      );\n    back.dataset.navigatorLink =\n      \"\";\n    missing.append(back);\n    return missing;\n  }\n\n  document.title =\n    `${artifact.title} · My Dashboards`;\n\n  return createArtifactViewer(\n    artifact,\n    {\n      revisionId:\n        state.revisionId,\n    },\n  );\n}\n\nfunction currentViewerArtifact() {\n  if (\n    state.route.id !== \"viewer\"\n  ) {\n    return null;\n  }\n\n  return (\n    state.snapshot.artefacts.find(\n      (item) =>\n        item.kind ===\n          state.route.params.kind &&\n        item.id ===\n          state.route.params.id,\n    ) ?? null\n  );\n}\n\nfunction renderComponents() {\n  const fragment =\n    document.createDocumentFragment();\n  const resources =\n    state.snapshot.library.filter(\n      isLibraryResource,\n    );\n  const counts = countBy(\n    resources,\n    (item) => item.kind,\n  );\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Shared library\",\n      title:\n        \"Primitives, components and layouts.\",\n      summary:\n        \"Core stays small. New UI begins locally and earns promotion through real reuse.\",\n      asideValue:\n        String(resources.length),\n      asideLabel:\n        pluralise(\n          resources.length,\n          \"resource\",\n          \"resources\",\n        ),\n    }),\n  );\n\n  const grid = element(\n    \"section\",\n    \"library-grid\",\n  );\n  grid.setAttribute(\n    \"aria-label\",\n    \"Library resource counts\",\n  );\n\n  for (const item of [\n    [\"Primitives\", \"primitive\"],\n    [\"Components\", \"component\"],\n    [\"Layouts\", \"layout\"],\n    [\"Themes\", \"theme\"],\n    [\"Presets\", \"preset\"],\n    [\"Assets\", \"asset\"],\n  ]) {\n    const card = element(\n      \"article\",\n      \"library-stat\",\n    );\n    card.append(\n      element(\n        \"span\",\n        \"\",\n        item[0],\n      ),\n      element(\n        \"strong\",\n        \"\",\n        String(\n          counts[item[1]] ?? 0,\n        ),\n      ),\n    );\n    grid.append(card);\n  }\n\n  fragment.append(grid);\n\n  const levels = countBy(\n    resources,\n    (item) =>\n      item.level ?? \"unscoped\",\n  );\n  const lifecycle = element(\n    \"section\",\n    \"section-block\",\n  );\n  lifecycle.append(\n    sectionHeading(\n      \"Reuse lifecycle\",\n      \"Prefer consuming Core. Prefer creating locally.\",\n    ),\n  );\n\n  const statusGrid = element(\n    \"div\",\n    \"status-grid\",\n  );\n  statusGrid.append(\n    definitionPanel(\n      \"Current scope\",\n      [\n        [\n          \"Core\",\n          String(levels.core ?? 0),\n        ],\n        [\n          \"Collection\",\n          String(\n            levels.collection ?? 0,\n          ),\n        ],\n        [\n          \"Local\",\n          String(levels.local ?? 0),\n        ],\n      ],\n    ),\n    definitionPanel(\n      \"Library health\",\n      [\n        [\n          \"Discovery issues\",\n          String(\n            state.snapshot\n              .libraryIssues.length,\n          ),\n        ],\n        [\n          \"Resources\",\n          String(resources.length),\n        ],\n        [\n          \"Revision\",\n          shortRevision(),\n        ],\n      ],\n    ),\n  );\n  lifecycle.append(statusGrid);\n  fragment.append(lifecycle);\n\n  return fragment;\n}\n\nfunction renderSettings() {\n  const fragment =\n    document.createDocumentFragment();\n  const git = state.snapshot.git ?? {};\n  const revision =\n    state.snapshot.state?.revision ??\n    {};\n  const caches =\n    state.snapshot.state?.caches ??\n    {};\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Workspace\",\n      title:\n        \"Settings and runtime state.\",\n      summary:\n        \"The navigator is read-only. Appearance preferences and personal defaults arrive in a later layer.\",\n      asideValue:\n        git.clean === true\n          ? \"Clean\"\n          : \"Live\",\n      asideLabel:\n        git.branch\n          ? `Branch ${git.branch}`\n          : \"Repository status\",\n    }),\n  );\n\n  const grid = element(\n    \"section\",\n    \"settings-grid\",\n  );\n  grid.append(\n    definitionPanel(\n      \"Workspace\",\n      [\n        [\n          \"Name\",\n          state.snapshot.health\n            ?.workspace?.name ??\n            \"My Dashboards\",\n        ],\n        [\n          \"Revision\",\n          revision.id ??\n            \"Unavailable\",\n        ],\n        [\n          \"Sequence\",\n          String(\n            revision.sequence ?? \"—\",\n          ),\n        ],\n        [\n          \"Detected\",\n          formatTimestamp(\n            revision.detectedAt,\n          ),\n        ],\n      ],\n      \"settings-card\",\n    ),\n    definitionPanel(\n      \"Git\",\n      [\n        [\n          \"Branch\",\n          git.branch ??\n            \"Unavailable\",\n        ],\n        [\n          \"Clean\",\n          git.clean === true\n            ? \"Yes\"\n            : git.clean === false\n              ? \"No\"\n              : \"Unknown\",\n        ],\n        [\n          \"Upstream\",\n          git.upstream ??\n            \"Not configured\",\n        ],\n        [\n          \"Changes\",\n          String(\n            git.changes?.length ??\n            git.changeCount ??\n            0,\n          ),\n        ],\n      ],\n      \"settings-card\",\n    ),\n    definitionPanel(\n      \"Server caches\",\n      Object.entries(caches).map(\n        ([name, value]) => [\n          titleCase(name),\n          `${value.size ?? 0} / ${value.maxEntries ?? \"—\"} entries`,\n        ],\n      ),\n      \"settings-card\",\n    ),\n    definitionPanel(\n      \"Runtime\",\n      [\n        [\n          \"Service\",\n          state.snapshot.health\n            ?.service ??\n            \"my-dashboards\",\n        ],\n        [\n          \"Version\",\n          state.snapshot.health\n            ?.version ??\n            \"Unknown\",\n        ],\n        [\n          \"Uptime\",\n          formatDuration(\n            state.snapshot.health\n              ?.uptimeSeconds,\n          ),\n        ],\n        [\n          \"HTTP mode\",\n          \"Read-only\",\n        ],\n      ],\n      \"settings-card\",\n    ),\n  );\n\n  fragment.append(grid);\n  return fragment;\n}\n\nfunction pageHeading(config) {\n  const section = element(\n    \"header\",\n    \"page-heading\",\n  );\n  const copy = element(\"div\");\n  copy.append(\n    element(\n      \"p\",\n      \"navigator-eyebrow\",\n      config.eyebrow,\n    ),\n    element(\n      \"h1\",\n      \"\",\n      config.title,\n    ),\n    element(\n      \"p\",\n      \"page-heading__summary\",\n      config.summary,\n    ),\n  );\n\n  const aside = element(\n    \"div\",\n    \"page-heading__aside\",\n  );\n  aside.append(\n    element(\n      \"strong\",\n      \"\",\n      config.asideValue,\n    ),\n    element(\n      \"span\",\n      \"\",\n      config.asideLabel,\n    ),\n  );\n\n  section.append(copy, aside);\n  return section;\n}\n\nfunction overviewCard(item) {\n  const card = element(\n    \"a\",\n    \"overview-card\",\n  );\n  card.href = item.route;\n  card.dataset.navigatorLink = \"\";\n\n  const label = element(\"div\");\n  label.append(\n    element(\n      \"span\",\n      \"overview-card__label\",\n      item.label,\n    ),\n    element(\n      \"strong\",\n      \"overview-card__count\",\n      String(item.count),\n    ),\n  );\n\n  card.append(\n    label,\n    element(\n      \"span\",\n      \"overview-card__action\",\n      \"Open section →\",\n    ),\n  );\n\n  return card;\n}\n\nfunction workspaceStatusPanel() {\n  const panel = element(\n    \"article\",\n    \"status-panel\",\n  );\n  const top = element(\n    \"div\",\n    \"status-panel__topline\",\n  );\n  top.append(\n    element(\n      \"h3\",\n      \"\",\n      \"Repository\",\n    ),\n    element(\n      \"span\",\n      \"status-badge\",\n      \"Live\",\n    ),\n  );\n\n  const list =\n    definitionList([\n      [\n        \"Workspace\",\n        state.snapshot.health\n          ?.workspace?.name ??\n          \"My Dashboards\",\n      ],\n      [\n        \"Branch\",\n        state.snapshot.git?.branch ??\n          \"Unknown\",\n      ],\n      [\n        \"Revision\",\n        shortRevision(),\n      ],\n    ]);\n\n  panel.append(top, list);\n  return panel;\n}\n\nfunction cacheStatusPanel() {\n  const caches =\n    state.snapshot.state?.caches ??\n    {};\n  const values =\n    Object.values(caches);\n  const hits = values.reduce(\n    (sum, value) =>\n      sum +\n      (value.metrics?.hits ?? 0),\n    0,\n  );\n  const loads = values.reduce(\n    (sum, value) =>\n      sum +\n      (value.metrics?.loads ?? 0),\n    0,\n  );\n\n  return definitionPanel(\n    \"Shared services\",\n    [\n      [\n        \"Cache hits\",\n        String(hits),\n      ],\n      [\n        \"Loads\",\n        String(loads),\n      ],\n      [\n        \"Library issues\",\n        String(\n          state.snapshot\n            .libraryIssues.length,\n        ),\n      ],\n    ],\n  );\n}\n\nfunction definitionPanel(\n  title,\n  rows,\n  className = \"status-panel\",\n) {\n  const panel = element(\n    \"article\",\n    className,\n  );\n  panel.append(\n    element(\n      \"h2\",\n      \"\",\n      title,\n    ),\n    definitionList(rows),\n  );\n  return panel;\n}\n\nfunction definitionList(rows) {\n  const list = element(\n    \"dl\",\n    \"status-list\",\n  );\n\n  for (const [term, value] of rows) {\n    const item = element(\"div\");\n    item.append(\n      element(\n        \"dt\",\n        \"\",\n        term,\n      ),\n      element(\n        \"dd\",\n        \"\",\n        value,\n      ),\n    );\n    list.append(item);\n  }\n\n  return list;\n}\n\nfunction sectionHeading(\n  title,\n  supporting,\n) {\n  const heading = element(\n    \"header\",\n    \"section-heading\",\n  );\n  heading.append(\n    element(\n      \"h2\",\n      \"\",\n      title,\n    ),\n    element(\n      \"p\",\n      \"\",\n      supporting,\n    ),\n  );\n  return heading;\n}\n\nfunction artifactCounts() {\n  return countBy(\n    state.snapshot.artefacts,\n    (item) => item.kind,\n  );\n}\n\nfunction countBy(items, selector) {\n  const result = {};\n\n  for (const item of items) {\n    const key = selector(item);\n    result[key] =\n      (result[key] ?? 0) + 1;\n  }\n\n  return result;\n}\n\nfunction isLibraryResource(item) {\n  return [\n    \"primitive\",\n    \"component\",\n    \"layout\",\n    \"theme\",\n    \"preset\",\n    \"asset\",\n  ].includes(item.kind);\n}\n\nfunction isUiResource(item) {\n  return [\n    \"primitive\",\n    \"component\",\n    \"layout\",\n  ].includes(item.kind);\n}\n\nfunction routeMatchesKind(\n  routeId,\n  kind,\n) {\n  return (\n    (routeId === \"dashboards\" &&\n      kind === \"dashboard\") ||\n    (routeId ===\n      \"presentations\" &&\n      kind ===\n        \"presentation\") ||\n    (routeId === \"concepts\" &&\n      kind === \"concept\")\n  );\n}\n\nfunction setConnection(\n  mode,\n  label,\n) {\n  elements.connection.dataset.state =\n    mode;\n  elements.connectionLabel.textContent =\n    label;\n}\n\nfunction updateRevisionLabel() {\n  elements.footerRevision.textContent =\n    state.revisionId\n      ? `Revision ${shortRevision()}`\n      : \"Revision unavailable\";\n}\n\nfunction shortRevision() {\n  return (\n    state.revisionId?.slice(0, 8) ??\n    \"unknown\"\n  );\n}\n\nfunction formatTimestamp(value) {\n  if (!value) return \"Unavailable\";\n\n  const date = new Date(value);\n\n  if (Number.isNaN(date.getTime())) {\n    return String(value);\n  }\n\n  return new Intl.DateTimeFormat(\n    \"en-GB\",\n    {\n      dateStyle: \"medium\",\n      timeStyle: \"short\",\n    },\n  ).format(date);\n}\n\nfunction formatDuration(value) {\n  if (\n    !Number.isFinite(value)\n  ) {\n    return \"Unknown\";\n  }\n\n  if (value < 60) {\n    return `${Math.floor(value)} sec`;\n  }\n\n  if (value < 3600) {\n    return `${Math.floor(\n      value / 60,\n    )} min`;\n  }\n\n  return `${Math.floor(\n    value / 3600,\n  )} hr ${Math.floor(\n    (value % 3600) / 60,\n  )} min`;\n}\n\nfunction pluralise(\n  count,\n  singular,\n  plural,\n) {\n  return count === 1\n    ? singular\n    : plural;\n}\n\nfunction titleCase(value) {\n  return String(value)\n    .replaceAll(\"-\", \" \")\n    .replace(/\\b\\w/g, (letter) =>\n      letter.toUpperCase(),\n    );\n}\n\nfunction element(\n  tagName,\n  className = \"\",\n  text = null,\n) {\n  const result =\n    document.createElement(tagName);\n\n  if (className) {\n    result.className = className;\n  }\n\n  if (text !== null) {\n    result.textContent = text;\n  }\n\n  return result;\n}\n\nfunction renderFatalError(error) {\n  console.error(error);\n  setConnection(\n    \"error\",\n    \"Connection failed\",\n  );\n\n  const section = element(\n    \"section\",\n    \"navigator-error\",\n  );\n  section.append(\n    element(\n      \"h1\",\n      \"\",\n      \"The navigator could not open\",\n    ),\n    element(\n      \"p\",\n      \"\",\n      error instanceof Error\n        ? error.message\n        : String(error),\n    ),\n  );\n  elements.main.replaceChildren(\n    section,\n  );\n}\n", "allowedPrevious": ["import {\n  clearApiCache,\n  loadNavigatorSnapshot,\n} from \"./api.js\";\nimport {\n  activateArtifactPreviews,\n  activateViewer,\n  createArtifactGallery,\n} from \"./gallery.js\";\nimport {\n  artifactDownloadPath,\n  artifactPreviewPath,\n  categoryPathForKind,\n  kindLabel,\n  sortArtifacts,\n} from \"./gallery-model.js\";\nimport {\n  navigate,\n  routeForPath,\n} from \"./router.js\";\n\nconst elements = {\n  nav:\n    document.querySelector(\n      \"#navigator-nav\",\n    ),\n  navToggle:\n    document.querySelector(\n      \"#nav-toggle\",\n    ),\n  categorySelector:\n    document.querySelector(\n      \"#category-selector\",\n    ),\n  connection:\n    document.querySelector(\n      \"#connection-status\",\n    ),\n  connectionLabel:\n    document.querySelector(\n      \"#connection-status-label\",\n    ),\n  main:\n    document.querySelector(\n      \"#page-content\",\n    ),\n  footerRevision:\n    document.querySelector(\n      \"#footer-revision\",\n    ),\n};\n\nconst state = {\n  snapshot: null,\n  route: routeForPath(\n    window.location.pathname,\n  ),\n  eventSource: null,\n  loadingController: null,\n  revisionId: null,\n  deactivatePreviews: null,\n};\n\ninitialise().catch(\n  renderFatalError,\n);\n\nasync function initialise() {\n  bindNavigation();\n  restoreNavigationState();\n  updateRouteChrome();\n  await refreshSnapshot({\n    focus: false,\n  });\n  connectRevisionEvents();\n}\n\nfunction bindNavigation() {\n  elements.navToggle.addEventListener(\n    \"click\",\n    () => {\n      setNavOpen(\n        elements.nav.dataset.open !==\n          \"true\",\n      );\n    },\n  );\n\n  elements.categorySelector.addEventListener(\n    \"change\",\n    () => {\n      navigate(\n        elements.categorySelector.value,\n      );\n    },\n  );\n\n  document.addEventListener(\n    \"click\",\n    (event) => {\n      const link =\n        event.target.closest(\n          \"[data-navigator-link]\",\n        );\n\n      if (link) {\n        event.preventDefault();\n        navigate(\n          link.getAttribute(\"href\"),\n        );\n        setNavOpen(false);\n        return;\n      }\n\n      if (\n        elements.nav.dataset.open ===\n          \"true\" &&\n        !elements.nav.contains(\n          event.target,\n        )\n      ) {\n        setNavOpen(false);\n      }\n    },\n  );\n\n  document.addEventListener(\n    \"keydown\",\n    (event) => {\n      if (\n        event.key === \"Escape\" &&\n        elements.nav.dataset.open ===\n          \"true\"\n      ) {\n        setNavOpen(false);\n        elements.navToggle.focus();\n      }\n    },\n  );\n\n  window.addEventListener(\n    \"popstate\",\n    () => {\n      state.route = routeForPath(\n        window.location.pathname,\n      );\n      updateRouteChrome();\n      renderCurrentRoute({\n        focus: true,\n      });\n    },\n  );\n}\n\nfunction restoreNavigationState() {\n  const saved =\n    window.localStorage.getItem(\n      \"mydash.navigator.nav-open\",\n    );\n\n  setNavOpen(saved === \"true\", {\n    persist: false,\n  });\n}\n\nfunction setNavOpen(\n  open,\n  options = {},\n) {\n  elements.nav.dataset.open =\n    String(open);\n  elements.navToggle.setAttribute(\n    \"aria-expanded\",\n    String(open),\n  );\n\n  if (options.persist !== false) {\n    window.localStorage.setItem(\n      \"mydash.navigator.nav-open\",\n      String(open),\n    );\n  }\n}\n\nasync function refreshSnapshot(\n  options = {},\n) {\n  state.loadingController?.abort();\n  state.loadingController =\n    new AbortController();\n\n  setConnection(\n    \"loading\",\n    state.snapshot\n      ? \"Refreshing\"\n      : \"Connecting\",\n  );\n\n  try {\n    const snapshot =\n      await loadNavigatorSnapshot({\n        signal:\n          state.loadingController.signal,\n      });\n\n    state.snapshot = snapshot;\n    state.revisionId =\n      snapshot.state?.revision?.id ??\n      snapshot.health?.revision?.id ??\n      null;\n\n    setConnection(\n      \"ready\",\n      \"Workspace live\",\n    );\n    updateRevisionLabel();\n    renderCurrentRoute({\n      focus:\n        options.focus ?? false,\n    });\n  } catch (error) {\n    if (\n      error?.name === \"AbortError\"\n    ) {\n      return;\n    }\n\n    setConnection(\n      state.snapshot\n        ? \"stale\"\n        : \"error\",\n      state.snapshot\n        ? \"Showing cached state\"\n        : \"Connection failed\",\n    );\n\n    if (!state.snapshot) {\n      renderFatalError(error);\n    }\n  }\n}\n\nfunction connectRevisionEvents() {\n  state.eventSource?.close();\n\n  const source =\n    new EventSource(\"/api/events\");\n  state.eventSource = source;\n\n  source.addEventListener(\n    \"workspace-revision\",\n    (event) => {\n      let revision;\n\n      try {\n        revision =\n          JSON.parse(event.data);\n      } catch {\n        return;\n      }\n\n      if (\n        revision.id &&\n        revision.id !==\n          state.revisionId\n      ) {\n        state.revisionId =\n          revision.id;\n        clearApiCache();\n        refreshSnapshot({\n          focus: false,\n        });\n      }\n    },\n  );\n\n  source.addEventListener(\n    \"open\",\n    () => {\n      if (state.snapshot) {\n        setConnection(\n          \"ready\",\n          \"Workspace live\",\n        );\n      }\n    },\n  );\n\n  source.addEventListener(\n    \"error\",\n    () => {\n      if (state.snapshot) {\n        setConnection(\n          \"stale\",\n          \"Reconnecting\",\n        );\n      }\n    },\n  );\n}\n\nfunction updateRouteChrome() {\n  const selectorPath =\n    state.route.id === \"viewer\"\n      ? categoryPathForKind(\n          state.route.params.kind,\n        )\n      : state.route.path;\n  elements.categorySelector.value =\n    selectorPath;\n\n  document.title =\n    state.route.id === \"home\"\n      ? \"My Dashboards\"\n      : state.route.id === \"viewer\"\n        ? \"Viewer · My Dashboards\"\n        : `${state.route.title} · My Dashboards`;\n\n  for (\n    const link of document.querySelectorAll(\n      \"[data-navigator-link]\",\n    )\n  ) {\n    const linkRoute =\n      link.dataset.route;\n    const current =\n      state.route.id === \"viewer\"\n        ? routeMatchesKind(\n            linkRoute,\n            state.route.params.kind,\n          )\n        : linkRoute ===\n          state.route.id;\n\n    if (current) {\n      link.setAttribute(\n        \"aria-current\",\n        \"page\",\n      );\n    } else {\n      link.removeAttribute(\n        \"aria-current\",\n      );\n    }\n  }\n}\n\nfunction renderCurrentRoute(\n  options = {},\n) {\n  if (!state.snapshot) return;\n\n  state.deactivatePreviews?.();\n  state.deactivatePreviews = null;\n\n  const view = {\n    home: renderHome,\n    dashboards: () =>\n      renderCategory({\n        kind: \"dashboard\",\n        singular: \"dashboard\",\n        plural: \"dashboards\",\n        title: \"Dashboards\",\n        description:\n          \"Operational views, decision support and live portfolio summaries.\",\n      }),\n    presentations: () =>\n      renderCategory({\n        kind: \"presentation\",\n        singular: \"presentation\",\n        plural: \"presentations\",\n        title: \"Presentations\",\n        description:\n          \"Narrative artefacts designed to explain evidence, implications and action.\",\n      }),\n    concepts: () =>\n      renderCategory({\n        kind: \"concept\",\n        singular: \"concept\",\n        plural: \"concepts\",\n        title: \"Concepts\",\n        description:\n          \"Lightweight prototypes for exploring an idea before it becomes shared architecture.\",\n      }),\n    components:\n      renderComponents,\n    settings:\n      renderSettings,\n    viewer:\n      renderViewer,\n  }[state.route.id];\n\n  elements.main.replaceChildren(\n    view(),\n  );\n\n  state.deactivatePreviews =\n    activateArtifactPreviews(\n      elements.main,\n    );\n  activateViewer(\n    elements.main,\n  );\n\n  if (options.focus) {\n    elements.main.focus({\n      preventScroll: true,\n    });\n  }\n}\n\nfunction renderHome() {\n  const fragment =\n    document.createDocumentFragment();\n  const counts =\n    artifactCounts();\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Repository navigator\",\n      title:\n        \"Everything you make, in one place.\",\n      summary:\n        \"Browse dashboards, presentations, concepts and shared UI directly from the filesystem.\",\n      asideValue:\n        String(\n          state.snapshot.artefacts.length,\n        ),\n      asideLabel:\n        pluralise(\n          state.snapshot.artefacts.length,\n          \"artefact\",\n          \"artefacts\",\n        ),\n    }),\n  );\n\n  const overview = element(\n    \"section\",\n    \"overview-grid\",\n  );\n  overview.setAttribute(\n    \"aria-label\",\n    \"Artefact categories\",\n  );\n\n  for (const item of [\n    {\n      route: \"/dashboards\",\n      label: \"Dashboards\",\n      count: counts.dashboard,\n    },\n    {\n      route: \"/presentations\",\n      label: \"Presentations\",\n      count:\n        counts.presentation,\n    },\n    {\n      route: \"/concepts\",\n      label: \"Concepts\",\n      count: counts.concept,\n    },\n    {\n      route: \"/components\",\n      label: \"Shared UI\",\n      count:\n        state.snapshot.library.filter(\n          isUiResource,\n        ).length,\n    },\n  ]) {\n    overview.append(\n      overviewCard(item),\n    );\n  }\n\n  fragment.append(overview);\n\n  if (\n    state.snapshot.artefacts.length >\n    0\n  ) {\n    const artefacts = element(\n      \"section\",\n      \"section-block\",\n    );\n    artefacts.append(\n      sectionHeading(\n        \"Your artefacts\",\n        \"Live previews are loaded only as they approach the viewport.\",\n      ),\n      createArtifactGallery(\n        state.snapshot.artefacts,\n        {\n          name: \"home\",\n          label:\n            \"Discovered artefacts\",\n        },\n      ),\n    );\n    fragment.append(artefacts);\n  }\n\n  const statusSection = element(\n    \"section\",\n    \"section-block\",\n  );\n  statusSection.append(\n    sectionHeading(\n      \"Workspace status\",\n      \"Live repository state from the shared server services.\",\n    ),\n  );\n\n  const statusGrid = element(\n    \"div\",\n    \"status-grid\",\n  );\n  statusGrid.append(\n    workspaceStatusPanel(),\n    cacheStatusPanel(),\n  );\n  statusSection.append(statusGrid);\n  fragment.append(statusSection);\n\n  return fragment;\n}\n\nfunction renderCategory(config) {\n  const matching =\n    sortArtifacts(\n      state.snapshot.artefacts.filter(\n        (item) =>\n          item.kind === config.kind,\n      ),\n    );\n  const fragment =\n    document.createDocumentFragment();\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Artefact library\",\n      title: config.title,\n      summary:\n        config.description,\n      asideValue:\n        String(matching.length),\n      asideLabel:\n        pluralise(\n          matching.length,\n          config.singular,\n          config.plural,\n        ),\n    }),\n  );\n\n  if (matching.length === 0) {\n    const note = element(\n      \"div\",\n      \"empty-category\",\n    );\n    note.append(\n      element(\n        \"strong\",\n        \"\",\n        `No ${config.plural} yet`,\n      ),\n      element(\n        \"span\",\n        \"\",\n        `Create one with the /${config.singular} skill or add a valid artefact folder to the repository.`,\n      ),\n    );\n    fragment.append(note);\n    return fragment;\n  }\n\n  fragment.append(\n    createArtifactGallery(\n      matching,\n      {\n        name: config.plural,\n        label:\n          `${config.title} gallery`,\n      },\n    ),\n  );\n\n  return fragment;\n}\n\nfunction renderViewer() {\n  const artifact =\n    state.snapshot.artefacts.find(\n      (item) =>\n        item.kind ===\n          state.route.params.kind &&\n        item.id ===\n          state.route.params.id,\n    );\n\n  if (!artifact) {\n    const missing = element(\n      \"section\",\n      \"navigator-error\",\n    );\n    missing.append(\n      element(\n        \"p\",\n        \"navigator-eyebrow\",\n        \"Artefact not found\",\n      ),\n      element(\n        \"h1\",\n        \"\",\n        \"This artefact is no longer available.\",\n      ),\n      element(\n        \"p\",\n        \"\",\n        \"It may have been renamed, removed or changed while the navigator was open.\",\n      ),\n    );\n    const back = element(\n      \"a\",\n      \"secondary-action\",\n      \"Return to library\",\n    );\n    back.href =\n      categoryPathForKind(\n        state.route.params.kind,\n      );\n    back.dataset.navigatorLink =\n      \"\";\n    missing.append(back);\n    return missing;\n  }\n\n  document.title =\n    `${artifact.title} · My Dashboards`;\n\n  const section = element(\n    \"section\",\n    \"artifact-viewer\",\n  );\n  const toolbar = element(\n    \"header\",\n    \"artifact-viewer__toolbar\",\n  );\n  const identity = element(\n    \"div\",\n    \"artifact-viewer__identity\",\n  );\n\n  const back = element(\n    \"a\",\n    \"artifact-viewer__back\",\n    `← ${kindLabel(\n      artifact.kind,\n    )} library`,\n  );\n  back.href =\n    categoryPathForKind(\n      artifact.kind,\n    );\n  back.dataset.navigatorLink =\n    \"\";\n\n  identity.append(\n    back,\n    element(\n      \"p\",\n      \"artifact-viewer__kind\",\n      kindLabel(\n        artifact.kind,\n      ),\n    ),\n    element(\n      \"h1\",\n      \"artifact-viewer__title\",\n      artifact.title,\n    ),\n  );\n\n  const actions = element(\n    \"div\",\n    \"artifact-viewer__actions\",\n  );\n  const standalone = element(\n    \"a\",\n    \"secondary-action\",\n    \"Open standalone\",\n  );\n  standalone.href =\n    artifactPreviewPath(\n      artifact,\n    );\n  standalone.target = \"_blank\";\n  standalone.rel = \"noreferrer\";\n\n  const download = element(\n    \"a\",\n    \"primary-action\",\n    \"Download HTML\",\n  );\n  download.href =\n    artifactDownloadPath(\n      artifact,\n    );\n  download.setAttribute(\n    \"download\",\n    artifact.exportFileName ??\n      `${artifact.id}.html`,\n  );\n\n  actions.append(\n    standalone,\n    download,\n  );\n  toolbar.append(\n    identity,\n    actions,\n  );\n\n  const mount = element(\n    \"div\",\n    \"artifact-viewer__mount\",\n  );\n  mount.dataset.kind =\n    artifact.kind;\n\n  const status = element(\n    \"div\",\n    \"artifact-viewer__status\",\n    \"Loading interactive preview\",\n  );\n  status.dataset.viewerStatus =\n    \"\";\n\n  const frame =\n    document.createElement(\n      \"iframe\",\n    );\n  frame.title =\n    `${artifact.title} interactive preview`;\n  frame.src =\n    artifactPreviewPath(\n      artifact,\n    );\n  frame.sandbox =\n    \"allow-scripts allow-forms\";\n  frame.referrerPolicy =\n    \"no-referrer\";\n  frame.dataset.viewerFrame =\n    \"\";\n  frame.dataset.state =\n    \"loading\";\n\n  mount.append(\n    frame,\n    status,\n  );\n  section.append(\n    toolbar,\n    mount,\n  );\n\n  if (artifact.description) {\n    section.append(\n      element(\n        \"p\",\n        \"artifact-viewer__description\",\n        artifact.description,\n      ),\n    );\n  }\n\n  return section;\n}\n\nfunction renderComponents() {\n  const fragment =\n    document.createDocumentFragment();\n  const resources =\n    state.snapshot.library.filter(\n      isLibraryResource,\n    );\n  const counts = countBy(\n    resources,\n    (item) => item.kind,\n  );\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Shared library\",\n      title:\n        \"Primitives, components and layouts.\",\n      summary:\n        \"Core stays small. New UI begins locally and earns promotion through real reuse.\",\n      asideValue:\n        String(resources.length),\n      asideLabel:\n        pluralise(\n          resources.length,\n          \"resource\",\n          \"resources\",\n        ),\n    }),\n  );\n\n  const grid = element(\n    \"section\",\n    \"library-grid\",\n  );\n  grid.setAttribute(\n    \"aria-label\",\n    \"Library resource counts\",\n  );\n\n  for (const item of [\n    [\"Primitives\", \"primitive\"],\n    [\"Components\", \"component\"],\n    [\"Layouts\", \"layout\"],\n    [\"Themes\", \"theme\"],\n    [\"Presets\", \"preset\"],\n    [\"Assets\", \"asset\"],\n  ]) {\n    const card = element(\n      \"article\",\n      \"library-stat\",\n    );\n    card.append(\n      element(\n        \"span\",\n        \"\",\n        item[0],\n      ),\n      element(\n        \"strong\",\n        \"\",\n        String(\n          counts[item[1]] ?? 0,\n        ),\n      ),\n    );\n    grid.append(card);\n  }\n\n  fragment.append(grid);\n\n  const levels = countBy(\n    resources,\n    (item) =>\n      item.level ?? \"unscoped\",\n  );\n  const lifecycle = element(\n    \"section\",\n    \"section-block\",\n  );\n  lifecycle.append(\n    sectionHeading(\n      \"Reuse lifecycle\",\n      \"Prefer consuming Core. Prefer creating locally.\",\n    ),\n  );\n\n  const statusGrid = element(\n    \"div\",\n    \"status-grid\",\n  );\n  statusGrid.append(\n    definitionPanel(\n      \"Current scope\",\n      [\n        [\n          \"Core\",\n          String(levels.core ?? 0),\n        ],\n        [\n          \"Collection\",\n          String(\n            levels.collection ?? 0,\n          ),\n        ],\n        [\n          \"Local\",\n          String(levels.local ?? 0),\n        ],\n      ],\n    ),\n    definitionPanel(\n      \"Library health\",\n      [\n        [\n          \"Discovery issues\",\n          String(\n            state.snapshot\n              .libraryIssues.length,\n          ),\n        ],\n        [\n          \"Resources\",\n          String(resources.length),\n        ],\n        [\n          \"Revision\",\n          shortRevision(),\n        ],\n      ],\n    ),\n  );\n  lifecycle.append(statusGrid);\n  fragment.append(lifecycle);\n\n  return fragment;\n}\n\nfunction renderSettings() {\n  const fragment =\n    document.createDocumentFragment();\n  const git = state.snapshot.git ?? {};\n  const revision =\n    state.snapshot.state?.revision ??\n    {};\n  const caches =\n    state.snapshot.state?.caches ??\n    {};\n\n  fragment.append(\n    pageHeading({\n      eyebrow: \"Workspace\",\n      title:\n        \"Settings and runtime state.\",\n      summary:\n        \"The navigator is read-only. Appearance preferences and personal defaults arrive in a later layer.\",\n      asideValue:\n        git.clean === true\n          ? \"Clean\"\n          : \"Live\",\n      asideLabel:\n        git.branch\n          ? `Branch ${git.branch}`\n          : \"Repository status\",\n    }),\n  );\n\n  const grid = element(\n    \"section\",\n    \"settings-grid\",\n  );\n  grid.append(\n    definitionPanel(\n      \"Workspace\",\n      [\n        [\n          \"Name\",\n          state.snapshot.health\n            ?.workspace?.name ??\n            \"My Dashboards\",\n        ],\n        [\n          \"Revision\",\n          revision.id ??\n            \"Unavailable\",\n        ],\n        [\n          \"Sequence\",\n          String(\n            revision.sequence ?? \"—\",\n          ),\n        ],\n        [\n          \"Detected\",\n          formatTimestamp(\n            revision.detectedAt,\n          ),\n        ],\n      ],\n      \"settings-card\",\n    ),\n    definitionPanel(\n      \"Git\",\n      [\n        [\n          \"Branch\",\n          git.branch ??\n            \"Unavailable\",\n        ],\n        [\n          \"Clean\",\n          git.clean === true\n            ? \"Yes\"\n            : git.clean === false\n              ? \"No\"\n              : \"Unknown\",\n        ],\n        [\n          \"Upstream\",\n          git.upstream ??\n            \"Not configured\",\n        ],\n        [\n          \"Changes\",\n          String(\n            git.changes?.length ??\n            git.changeCount ??\n            0,\n          ),\n        ],\n      ],\n      \"settings-card\",\n    ),\n    definitionPanel(\n      \"Server caches\",\n      Object.entries(caches).map(\n        ([name, value]) => [\n          titleCase(name),\n          `${value.size ?? 0} / ${value.maxEntries ?? \"—\"} entries`,\n        ],\n      ),\n      \"settings-card\",\n    ),\n    definitionPanel(\n      \"Runtime\",\n      [\n        [\n          \"Service\",\n          state.snapshot.health\n            ?.service ??\n            \"my-dashboards\",\n        ],\n        [\n          \"Version\",\n          state.snapshot.health\n            ?.version ??\n            \"Unknown\",\n        ],\n        [\n          \"Uptime\",\n          formatDuration(\n            state.snapshot.health\n              ?.uptimeSeconds,\n          ),\n        ],\n        [\n          \"HTTP mode\",\n          \"Read-only\",\n        ],\n      ],\n      \"settings-card\",\n    ),\n  );\n\n  fragment.append(grid);\n  return fragment;\n}\n\nfunction pageHeading(config) {\n  const section = element(\n    \"header\",\n    \"page-heading\",\n  );\n  const copy = element(\"div\");\n  copy.append(\n    element(\n      \"p\",\n      \"navigator-eyebrow\",\n      config.eyebrow,\n    ),\n    element(\n      \"h1\",\n      \"\",\n      config.title,\n    ),\n    element(\n      \"p\",\n      \"page-heading__summary\",\n      config.summary,\n    ),\n  );\n\n  const aside = element(\n    \"div\",\n    \"page-heading__aside\",\n  );\n  aside.append(\n    element(\n      \"strong\",\n      \"\",\n      config.asideValue,\n    ),\n    element(\n      \"span\",\n      \"\",\n      config.asideLabel,\n    ),\n  );\n\n  section.append(copy, aside);\n  return section;\n}\n\nfunction overviewCard(item) {\n  const card = element(\n    \"a\",\n    \"overview-card\",\n  );\n  card.href = item.route;\n  card.dataset.navigatorLink = \"\";\n\n  const label = element(\"div\");\n  label.append(\n    element(\n      \"span\",\n      \"overview-card__label\",\n      item.label,\n    ),\n    element(\n      \"strong\",\n      \"overview-card__count\",\n      String(item.count),\n    ),\n  );\n\n  card.append(\n    label,\n    element(\n      \"span\",\n      \"overview-card__action\",\n      \"Open section →\",\n    ),\n  );\n\n  return card;\n}\n\nfunction workspaceStatusPanel() {\n  const panel = element(\n    \"article\",\n    \"status-panel\",\n  );\n  const top = element(\n    \"div\",\n    \"status-panel__topline\",\n  );\n  top.append(\n    element(\n      \"h3\",\n      \"\",\n      \"Repository\",\n    ),\n    element(\n      \"span\",\n      \"status-badge\",\n      \"Live\",\n    ),\n  );\n\n  const list =\n    definitionList([\n      [\n        \"Workspace\",\n        state.snapshot.health\n          ?.workspace?.name ??\n          \"My Dashboards\",\n      ],\n      [\n        \"Branch\",\n        state.snapshot.git?.branch ??\n          \"Unknown\",\n      ],\n      [\n        \"Revision\",\n        shortRevision(),\n      ],\n    ]);\n\n  panel.append(top, list);\n  return panel;\n}\n\nfunction cacheStatusPanel() {\n  const caches =\n    state.snapshot.state?.caches ??\n    {};\n  const values =\n    Object.values(caches);\n  const hits = values.reduce(\n    (sum, value) =>\n      sum +\n      (value.metrics?.hits ?? 0),\n    0,\n  );\n  const loads = values.reduce(\n    (sum, value) =>\n      sum +\n      (value.metrics?.loads ?? 0),\n    0,\n  );\n\n  return definitionPanel(\n    \"Shared services\",\n    [\n      [\n        \"Cache hits\",\n        String(hits),\n      ],\n      [\n        \"Loads\",\n        String(loads),\n      ],\n      [\n        \"Library issues\",\n        String(\n          state.snapshot\n            .libraryIssues.length,\n        ),\n      ],\n    ],\n  );\n}\n\nfunction definitionPanel(\n  title,\n  rows,\n  className = \"status-panel\",\n) {\n  const panel = element(\n    \"article\",\n    className,\n  );\n  panel.append(\n    element(\n      \"h2\",\n      \"\",\n      title,\n    ),\n    definitionList(rows),\n  );\n  return panel;\n}\n\nfunction definitionList(rows) {\n  const list = element(\n    \"dl\",\n    \"status-list\",\n  );\n\n  for (const [term, value] of rows) {\n    const item = element(\"div\");\n    item.append(\n      element(\n        \"dt\",\n        \"\",\n        term,\n      ),\n      element(\n        \"dd\",\n        \"\",\n        value,\n      ),\n    );\n    list.append(item);\n  }\n\n  return list;\n}\n\nfunction sectionHeading(\n  title,\n  supporting,\n) {\n  const heading = element(\n    \"header\",\n    \"section-heading\",\n  );\n  heading.append(\n    element(\n      \"h2\",\n      \"\",\n      title,\n    ),\n    element(\n      \"p\",\n      \"\",\n      supporting,\n    ),\n  );\n  return heading;\n}\n\nfunction artifactCounts() {\n  return countBy(\n    state.snapshot.artefacts,\n    (item) => item.kind,\n  );\n}\n\nfunction countBy(items, selector) {\n  const result = {};\n\n  for (const item of items) {\n    const key = selector(item);\n    result[key] =\n      (result[key] ?? 0) + 1;\n  }\n\n  return result;\n}\n\nfunction isLibraryResource(item) {\n  return [\n    \"primitive\",\n    \"component\",\n    \"layout\",\n    \"theme\",\n    \"preset\",\n    \"asset\",\n  ].includes(item.kind);\n}\n\nfunction isUiResource(item) {\n  return [\n    \"primitive\",\n    \"component\",\n    \"layout\",\n  ].includes(item.kind);\n}\n\nfunction routeMatchesKind(\n  routeId,\n  kind,\n) {\n  return (\n    (routeId === \"dashboards\" &&\n      kind === \"dashboard\") ||\n    (routeId ===\n      \"presentations\" &&\n      kind ===\n        \"presentation\") ||\n    (routeId === \"concepts\" &&\n      kind === \"concept\")\n  );\n}\n\nfunction setConnection(\n  mode,\n  label,\n) {\n  elements.connection.dataset.state =\n    mode;\n  elements.connectionLabel.textContent =\n    label;\n}\n\nfunction updateRevisionLabel() {\n  elements.footerRevision.textContent =\n    state.revisionId\n      ? `Revision ${shortRevision()}`\n      : \"Revision unavailable\";\n}\n\nfunction shortRevision() {\n  return (\n    state.revisionId?.slice(0, 8) ??\n    \"unknown\"\n  );\n}\n\nfunction formatTimestamp(value) {\n  if (!value) return \"Unavailable\";\n\n  const date = new Date(value);\n\n  if (Number.isNaN(date.getTime())) {\n    return String(value);\n  }\n\n  return new Intl.DateTimeFormat(\n    \"en-GB\",\n    {\n      dateStyle: \"medium\",\n      timeStyle: \"short\",\n    },\n  ).format(date);\n}\n\nfunction formatDuration(value) {\n  if (\n    !Number.isFinite(value)\n  ) {\n    return \"Unknown\";\n  }\n\n  if (value < 60) {\n    return `${Math.floor(value)} sec`;\n  }\n\n  if (value < 3600) {\n    return `${Math.floor(\n      value / 60,\n    )} min`;\n  }\n\n  return `${Math.floor(\n    value / 3600,\n  )} hr ${Math.floor(\n    (value % 3600) / 60,\n  )} min`;\n}\n\nfunction pluralise(\n  count,\n  singular,\n  plural,\n) {\n  return count === 1\n    ? singular\n    : plural;\n}\n\nfunction titleCase(value) {\n  return String(value)\n    .replaceAll(\"-\", \" \")\n    .replace(/\\b\\w/g, (letter) =>\n      letter.toUpperCase(),\n    );\n}\n\nfunction element(\n  tagName,\n  className = \"\",\n  text = null,\n) {\n  const result =\n    document.createElement(tagName);\n\n  if (className) {\n    result.className = className;\n  }\n\n  if (text !== null) {\n    result.textContent = text;\n  }\n\n  return result;\n}\n\nfunction renderFatalError(error) {\n  console.error(error);\n  setConnection(\n    \"error\",\n    \"Connection failed\",\n  );\n\n  const section = element(\n    \"section\",\n    \"navigator-error\",\n  );\n  section.append(\n    element(\n      \"h1\",\n      \"\",\n      \"The navigator could not open\",\n    ),\n    element(\n      \"p\",\n      \"\",\n      error instanceof Error\n        ? error.message\n        : String(error),\n    ),\n  );\n  elements.main.replaceChildren(\n    section,\n  );\n}\n"]}, "app/viewer-model.js": {"content": "export const VIEWER_SHORTCUTS = Object.freeze([\n  {\n    key: \"R\",\n    action: \"reload\",\n    label: \"Reload preview\",\n  },\n  {\n    key: \"F\",\n    action: \"fullscreen\",\n    label: \"Enter or exit fullscreen\",\n  },\n  {\n    key: \"I\",\n    action: \"details\",\n    label: \"Show or hide details\",\n  },\n  {\n    key: \"?\",\n    action: \"shortcuts\",\n    label: \"Show keyboard shortcuts\",\n  },\n  {\n    key: \"Escape\",\n    action: \"escape\",\n    label: \"Exit fullscreen or close help\",\n  },\n]);\n\nexport function viewerShortcutAction(\n  event,\n) {\n  if (\n    event.defaultPrevented ||\n    event.ctrlKey ||\n    event.metaKey ||\n    event.altKey\n  ) {\n    return null;\n  }\n\n  if (\n    isEditableTarget(\n      event.target,\n    )\n  ) {\n    return null;\n  }\n\n  const key = String(\n    event.key ?? \"\",\n  ).toLowerCase();\n\n  return {\n    r: \"reload\",\n    f: \"fullscreen\",\n    i: \"details\",\n    \"?\": \"shortcuts\",\n  }[key] ?? null;\n}\n\nexport function formatBytes(\n  value,\n  locale = \"en-GB\",\n) {\n  if (\n    !Number.isFinite(value) ||\n    value < 0\n  ) {\n    return \"Unavailable\";\n  }\n\n  if (value < 1024) {\n    return `${Math.round(value)} B`;\n  }\n\n  const units = [\n    \"KB\",\n    \"MB\",\n    \"GB\",\n  ];\n  let amount = value / 1024;\n  let unitIndex = 0;\n\n  while (\n    amount >= 1024 &&\n    unitIndex <\n      units.length - 1\n  ) {\n    amount /= 1024;\n    unitIndex += 1;\n  }\n\n  return `${new Intl.NumberFormat(\n    locale,\n    {\n      maximumFractionDigits:\n        amount >= 10 ? 1 : 2,\n    },\n  ).format(amount)} ${\n    units[unitIndex]\n  }`;\n}\n\nexport function shortHash(\n  value,\n  length = 12,\n) {\n  if (\n    typeof value !== \"string\" ||\n    !value\n  ) {\n    return \"Unavailable\";\n  }\n\n  return value.slice(\n    0,\n    Math.max(4, length),\n  );\n}\n\nexport function selectedAppearance(\n  resolution,\n) {\n  return {\n    theme:\n      resolution?.selections\n        ?.theme?.entry?.id ??\n      \"None\",\n    preset:\n      resolution?.selections\n        ?.preset?.entry?.id ??\n      \"None\",\n    layout:\n      resolution?.selections\n        ?.layout?.entry?.id ??\n      \"None\",\n  };\n}\n\nexport function dependencyGroups(\n  resolution,\n) {\n  const groups = new Map();\n\n  for (\n    const dependency of\n      resolution\n        ?.dependencyClosure ?? []\n  ) {\n    const kind =\n      dependency.kind ??\n      \"other\";\n\n    if (!groups.has(kind)) {\n      groups.set(kind, []);\n    }\n\n    groups.get(kind).push(\n      dependency,\n    );\n  }\n\n  return [...groups.entries()]\n    .sort(\n      ([left], [right]) =>\n        dependencyKindOrder(left) -\n          dependencyKindOrder(right) ||\n        left.localeCompare(\n          right,\n          \"en-GB\",\n        ),\n    )\n    .map(([kind, entries]) => ({\n      kind,\n      entries: entries.sort(\n        (left, right) =>\n          String(left.id).localeCompare(\n            String(right.id),\n            \"en-GB\",\n          ),\n      ),\n    }));\n}\n\nexport function exportResourceRows(\n  resources,\n) {\n  const labels = {\n    stylesheets: \"Stylesheets\",\n    scripts: \"Scripts\",\n    dataFiles: \"Data files\",\n    uiResources: \"UI resources\",\n    assets: \"Assets\",\n    htmlFragments: \"HTML fragments\",\n  };\n\n  return Object.entries(\n    resources ?? {},\n  )\n    .filter(\n      ([, value]) =>\n        Number.isFinite(value),\n    )\n    .sort(\n      ([left], [right]) =>\n        (resourceOrder(left) -\n          resourceOrder(right)) ||\n        left.localeCompare(\n          right,\n          \"en-GB\",\n        ),\n    )\n    .map(([key, value]) => [\n      labels[key] ??\n        titleCase(key),\n      String(value),\n    ]);\n}\n\nexport function exportReadiness(\n  status,\n) {\n  if (!status) {\n    return {\n      mode: \"loading\",\n      label:\n        \"Checking export\",\n    };\n  }\n\n  if (\n    status.export?.ready ===\n    true\n  ) {\n    return {\n      mode: \"ready\",\n      label:\n        `Export ready · ${formatBytes(\n          status.export.sizeBytes,\n        )}`,\n    };\n  }\n\n  return {\n    mode: \"error\",\n    label:\n      \"Export needs attention\",\n  };\n}\n\nfunction isEditableTarget(\n  target,\n) {\n  const tagName =\n    target?.tagName\n      ?.toLowerCase?.();\n\n  return (\n    target?.isContentEditable ===\n      true ||\n    [\n      \"input\",\n      \"select\",\n      \"textarea\",\n      \"button\",\n    ].includes(tagName)\n  );\n}\n\nfunction dependencyKindOrder(\n  kind,\n) {\n  return {\n    theme: 0,\n    preset: 1,\n    layout: 2,\n    primitive: 3,\n    component: 4,\n    asset: 5,\n  }[kind] ?? 9;\n}\n\nfunction resourceOrder(key) {\n  return {\n    stylesheets: 0,\n    scripts: 1,\n    dataFiles: 2,\n    uiResources: 3,\n    assets: 4,\n    htmlFragments: 5,\n  }[key] ?? 9;\n}\n\nfunction titleCase(value) {\n  return String(value)\n    .replaceAll(\"-\", \" \")\n    .replace(\n      /([a-z])([A-Z])/g,\n      \"$1 $2\",\n    )\n    .replace(/\\b\\w/g, (letter) =>\n      letter.toUpperCase(),\n    );\n}\n"}, "app/viewer.js": {"content": "import {\n  loadArtifactViewerData,\n} from \"./api.js\";\nimport {\n  artifactDownloadPath,\n  artifactPreviewPath,\n  categoryPathForKind,\n  kindLabel,\n} from \"./gallery-model.js\";\nimport {\n  VIEWER_SHORTCUTS,\n  dependencyGroups,\n  exportReadiness,\n  exportResourceRows,\n  formatBytes,\n  selectedAppearance,\n  shortHash,\n  viewerShortcutAction,\n} from \"./viewer-model.js\";\n\nconst PREVIEW_TIMEOUT_MS =\n  20_000;\n\nexport function createArtifactViewer(\n  artifact,\n  options = {},\n) {\n  const section = element(\n    \"section\",\n    \"artifact-viewer\",\n  );\n  section.dataset.viewer =\n    `${artifact.kind}:${artifact.id}`;\n\n  const toolbar = element(\n    \"header\",\n    \"artifact-viewer__toolbar\",\n  );\n  const identity = element(\n    \"div\",\n    \"artifact-viewer__identity\",\n  );\n  const back = element(\n    \"a\",\n    \"artifact-viewer__back\",\n    `← ${kindLabel(\n      artifact.kind,\n    )} library`,\n  );\n  back.href =\n    categoryPathForKind(\n      artifact.kind,\n    );\n  back.dataset.navigatorLink =\n    \"\";\n\n  identity.append(\n    back,\n    element(\n      \"p\",\n      \"artifact-viewer__kind\",\n      kindLabel(\n        artifact.kind,\n      ),\n    ),\n    element(\n      \"h1\",\n      \"artifact-viewer__title\",\n      artifact.title,\n    ),\n  );\n\n  const toolbarRight = element(\n    \"div\",\n    \"artifact-viewer__toolbar-right\",\n  );\n  const readiness = element(\n    \"span\",\n    \"viewer-export-status\",\n    \"Checking export\",\n  );\n  readiness.dataset.viewerExportStatus =\n    \"\";\n  readiness.dataset.state =\n    \"loading\";\n\n  const controls = element(\n    \"div\",\n    \"artifact-viewer__controls\",\n  );\n  controls.append(\n    controlButton(\n      \"Reload\",\n      \"R\",\n      \"viewerReload\",\n    ),\n    controlButton(\n      \"Full screen\",\n      \"F\",\n      \"viewerFullscreen\",\n    ),\n    controlButton(\n      \"Details\",\n      \"I\",\n      \"viewerDetails\",\n    ),\n    controlButton(\n      \"Shortcuts\",\n      \"?\",\n      \"viewerShortcuts\",\n    ),\n  );\n\n  const actions = element(\n    \"div\",\n    \"artifact-viewer__actions\",\n  );\n  const standalone = element(\n    \"a\",\n    \"secondary-action\",\n    \"Open standalone\",\n  );\n  standalone.href =\n    artifactPreviewPath(\n      artifact,\n    );\n  standalone.target = \"_blank\";\n  standalone.rel = \"noreferrer\";\n\n  const download = element(\n    \"a\",\n    \"primary-action\",\n    \"Download HTML\",\n  );\n  download.href =\n    artifactDownloadPath(\n      artifact,\n    );\n  download.setAttribute(\n    \"download\",\n    artifact.exportFileName ??\n      `${artifact.id}.html`,\n  );\n\n  actions.append(\n    standalone,\n    download,\n  );\n  toolbarRight.append(\n    readiness,\n    controls,\n    actions,\n  );\n  toolbar.append(\n    identity,\n    toolbarRight,\n  );\n\n  const details = element(\n    \"section\",\n    \"artifact-viewer__details\",\n  );\n  details.id =\n    \"artifact-viewer-details\";\n  details.hidden = true;\n  details.dataset.viewerDetailsPanel =\n    \"\";\n  details.setAttribute(\n    \"aria-label\",\n    \"Artefact details\",\n  );\n  details.append(\n    loadingDetails(),\n  );\n\n  const mount = element(\n    \"div\",\n    \"artifact-viewer__mount\",\n  );\n  mount.dataset.kind =\n    artifact.kind;\n  mount.dataset.viewerMount =\n    \"\";\n\n  const status = element(\n    \"div\",\n    \"artifact-viewer__status\",\n    \"Loading interactive preview\",\n  );\n  status.dataset.viewerStatus =\n    \"\";\n  status.setAttribute(\n    \"role\",\n    \"status\",\n  );\n  status.setAttribute(\n    \"aria-live\",\n    \"polite\",\n  );\n\n  const frame =\n    document.createElement(\n      \"iframe\",\n    );\n  frame.title =\n    `${artifact.title} interactive preview`;\n  frame.dataset.viewerSrc =\n    artifactPreviewPath(\n      artifact,\n    );\n  frame.sandbox =\n    \"allow-scripts allow-forms\";\n  frame.referrerPolicy =\n    \"no-referrer\";\n  frame.dataset.viewerFrame =\n    \"\";\n  frame.dataset.state =\n    \"loading\";\n\n  const fullscreenHud = element(\n    \"div\",\n    \"viewer-fullscreen-hud\",\n  );\n  fullscreenHud.dataset.viewerFullscreenHud =\n    \"\";\n  fullscreenHud.hidden = true;\n  fullscreenHud.append(\n    element(\n      \"span\",\n      \"\",\n      \"Full screen · press Escape to exit\",\n    ),\n  );\n  const fullscreenExit = element(\n    \"button\",\n    \"viewer-fullscreen-hud__exit\",\n    \"Exit full screen\",\n  );\n  fullscreenExit.type = \"button\";\n  fullscreenExit.dataset.viewerFullscreenExit =\n    \"\";\n  fullscreenHud.append(\n    fullscreenExit,\n  );\n\n  mount.append(\n    frame,\n    status,\n    fullscreenHud,\n  );\n\n  const footer = element(\n    \"div\",\n    \"artifact-viewer__footer\",\n  );\n  footer.append(\n    element(\n      \"p\",\n      \"artifact-viewer__description\",\n      artifact.description ??\n        \"No artefact description is available.\",\n    ),\n    element(\n      \"p\",\n      \"artifact-viewer__revision\",\n      options.revisionId\n        ? `Workspace revision ${shortHash(\n            options.revisionId,\n            8,\n          )}`\n        : \"Workspace revision unavailable\",\n    ),\n  );\n\n  const shortcutDialog =\n    createShortcutDialog();\n\n  section.append(\n    toolbar,\n    details,\n    mount,\n    footer,\n    shortcutDialog,\n  );\n\n  return section;\n}\n\nexport function activateArtifactViewer(\n  root,\n  options,\n) {\n  const artifact =\n    options.artifact;\n  const frame =\n    root.querySelector(\n      \"iframe[data-viewer-frame]\",\n    );\n\n  if (!frame) {\n    return () => {};\n  }\n\n  const controller =\n    new AbortController();\n  const mount =\n    root.querySelector(\n      \"[data-viewer-mount]\",\n    );\n  const status =\n    root.querySelector(\n      \"[data-viewer-status]\",\n    );\n  const reloadButton =\n    root.querySelector(\n      \"[data-viewer-reload]\",\n    );\n  const fullscreenButton =\n    root.querySelector(\n      \"[data-viewer-fullscreen]\",\n    );\n  const fullscreenExit =\n    root.querySelector(\n      \"[data-viewer-fullscreen-exit]\",\n    );\n  const fullscreenHud =\n    root.querySelector(\n      \"[data-viewer-fullscreen-hud]\",\n    );\n  const detailsButton =\n    root.querySelector(\n      \"[data-viewer-details]\",\n    );\n  const detailsPanel =\n    root.querySelector(\n      \"[data-viewer-details-panel]\",\n    );\n  const shortcutsButton =\n    root.querySelector(\n      \"[data-viewer-shortcuts]\",\n    );\n  const shortcutsDialog =\n    root.querySelector(\n      \"[data-viewer-shortcut-dialog]\",\n    );\n  const shortcutClose =\n    root.querySelector(\n      \"[data-viewer-shortcut-close]\",\n    );\n  const exportStatus =\n    root.querySelector(\n      \"[data-viewer-export-status]\",\n    );\n\n  let reloadSequence = 0;\n  let loadTimer = null;\n  let disposed = false;\n\n  bindFrameLoad();\n  frame.src =\n    frame.dataset.viewerSrc;\n\n  const reload = () => {\n    reloadSequence += 1;\n    const url = new URL(\n      artifactPreviewPath(\n        artifact,\n      ),\n      window.location.origin,\n    );\n    url.searchParams.set(\n      \"viewerReload\",\n      String(reloadSequence),\n    );\n    setPreviewState(\n      \"loading\",\n      \"Reloading interactive preview\",\n    );\n    bindFrameLoad();\n    frame.src =\n      `${url.pathname}${url.search}`;\n  };\n\n  const toggleFullscreen =\n    async () => {\n      if (\n        document.fullscreenElement ===\n        mount\n      ) {\n        await document.exitFullscreen();\n        return;\n      }\n\n      if (\n        typeof mount\n          ?.requestFullscreen !==\n        \"function\"\n      ) {\n        announce(\n          status,\n          \"Full screen is not supported by this browser.\",\n        );\n        return;\n      }\n\n      await mount.requestFullscreen();\n  };\n\n  const toggleDetails = () => {\n    const open =\n      detailsPanel.hidden;\n    detailsPanel.hidden = !open;\n    detailsButton.setAttribute(\n      \"aria-expanded\",\n      String(open),\n    );\n    detailsButton.dataset.active =\n      String(open);\n\n    if (open) {\n      detailsPanel.scrollIntoView({\n        block: \"nearest\",\n        behavior:\n          prefersReducedMotion()\n            ? \"auto\"\n            : \"smooth\",\n      });\n    }\n  };\n\n  const openShortcuts = () => {\n    if (\n      typeof shortcutsDialog\n        ?.showModal ===\n      \"function\"\n    ) {\n      shortcutsDialog.showModal();\n    } else {\n      shortcutsDialog.hidden =\n        false;\n    }\n  };\n\n  const closeShortcuts = () => {\n    if (\n      typeof shortcutsDialog\n        ?.close ===\n      \"function\" &&\n      shortcutsDialog.open\n    ) {\n      shortcutsDialog.close();\n    } else {\n      shortcutsDialog.hidden =\n        true;\n    }\n  };\n\n  const onFullscreenChange = () => {\n    const active =\n      document.fullscreenElement ===\n      mount;\n    fullscreenButton.textContent =\n      active\n        ? \"Exit full screen\"\n        : \"Full screen\";\n    fullscreenButton.setAttribute(\n      \"aria-pressed\",\n      String(active),\n    );\n    fullscreenHud.hidden =\n      !active;\n  };\n\n  const onKeydown = (event) => {\n    const action =\n      viewerShortcutAction(\n        event,\n      );\n\n    if (!action) return;\n\n    event.preventDefault();\n\n    if (action === \"reload\") {\n      reload();\n    } else if (\n      action === \"fullscreen\"\n    ) {\n      toggleFullscreen().catch(\n        handleControlError,\n      );\n    } else if (\n      action === \"details\"\n    ) {\n      toggleDetails();\n    } else if (\n      action === \"shortcuts\"\n    ) {\n      openShortcuts();\n    }\n  };\n\n  reloadButton.addEventListener(\n    \"click\",\n    reload,\n  );\n  fullscreenButton.addEventListener(\n    \"click\",\n    () =>\n      toggleFullscreen().catch(\n        handleControlError,\n      ),\n  );\n  fullscreenExit.addEventListener(\n    \"click\",\n    () =>\n      toggleFullscreen().catch(\n        handleControlError,\n      ),\n  );\n  detailsButton.addEventListener(\n    \"click\",\n    toggleDetails,\n  );\n  shortcutsButton.addEventListener(\n    \"click\",\n    openShortcuts,\n  );\n  shortcutClose.addEventListener(\n    \"click\",\n    closeShortcuts,\n  );\n  document.addEventListener(\n    \"fullscreenchange\",\n    onFullscreenChange,\n  );\n  document.addEventListener(\n    \"keydown\",\n    onKeydown,\n  );\n\n  loadArtifactViewerData(\n    artifact.kind,\n    artifact.id,\n    {\n      signal:\n        controller.signal,\n    },\n  )\n    .then((data) => {\n      if (disposed) return;\n      renderViewerDetails(\n        detailsPanel,\n        data,\n        options.revisionId,\n      );\n      const readiness =\n        exportReadiness(\n          data.exportStatus,\n        );\n      exportStatus.textContent =\n        readiness.label;\n      exportStatus.dataset.state =\n        readiness.mode;\n    })\n    .catch((error) => {\n      if (\n        error?.name ===\n        \"AbortError\"\n      ) {\n        return;\n      }\n\n      exportStatus.textContent =\n        \"Export status unavailable\";\n      exportStatus.dataset.state =\n        \"error\";\n      renderDetailsFailure(\n        detailsPanel,\n        error,\n      );\n    });\n\n  return () => {\n    disposed = true;\n    controller.abort();\n    window.clearTimeout(\n      loadTimer,\n    );\n    reloadButton.removeEventListener(\n      \"click\",\n      reload,\n    );\n    detailsButton.removeEventListener(\n      \"click\",\n      toggleDetails,\n    );\n    shortcutsButton.removeEventListener(\n      \"click\",\n      openShortcuts,\n    );\n    shortcutClose.removeEventListener(\n      \"click\",\n      closeShortcuts,\n    );\n    document.removeEventListener(\n      \"fullscreenchange\",\n      onFullscreenChange,\n    );\n    document.removeEventListener(\n      \"keydown\",\n      onKeydown,\n    );\n\n    if (\n      document.fullscreenElement ===\n      mount\n    ) {\n      document.exitFullscreen()\n        .catch(() => {});\n    }\n  };\n\n  function bindFrameLoad() {\n    window.clearTimeout(\n      loadTimer,\n    );\n    loadTimer = window.setTimeout(\n      () => {\n        if (\n          frame.dataset.state !==\n          \"ready\"\n        ) {\n          setPreviewState(\n            \"error\",\n            \"Preview is taking longer than expected\",\n          );\n        }\n      },\n      PREVIEW_TIMEOUT_MS,\n    );\n\n    frame.addEventListener(\n      \"load\",\n      () => {\n        window.clearTimeout(\n          loadTimer,\n        );\n        setPreviewState(\n          \"ready\",\n          \"Interactive preview loaded\",\n        );\n      },\n      { once: true },\n    );\n\n    frame.addEventListener(\n      \"error\",\n      () => {\n        window.clearTimeout(\n          loadTimer,\n        );\n        setPreviewState(\n          \"error\",\n          \"Interactive preview unavailable\",\n        );\n      },\n      { once: true },\n    );\n  }\n\n  function setPreviewState(\n    mode,\n    message,\n  ) {\n    frame.dataset.state =\n      mode;\n    status.dataset.state =\n      mode;\n    status.textContent =\n      message;\n  }\n\n  function handleControlError(\n    error,\n  ) {\n    console.error(error);\n    announce(\n      status,\n      error instanceof Error\n        ? error.message\n        : String(error),\n    );\n  }\n}\n\nfunction renderViewerDetails(\n  panel,\n  data,\n  revisionId,\n) {\n  const artifact =\n    data.artifact;\n  const manifest =\n    artifact.manifest ?? {};\n  const resolution =\n    data.resolution ?? {};\n  const exportData =\n    data.exportStatus?.export ??\n    {};\n  const appearance =\n    selectedAppearance(\n      resolution,\n    );\n\n  panel.replaceChildren(\n    detailsCard(\n      \"Artefact\",\n      [\n        [\"ID\", artifact.id],\n        [\n          \"Kind\",\n          kindLabel(\n            artifact.kind,\n          ),\n        ],\n        [\n          \"Owner\",\n          manifest.owner ??\n            \"Not specified\",\n        ],\n        [\n          \"Entry\",\n          manifest.entry ??\n            \"Unavailable\",\n        ],\n        [\n          \"Manifest\",\n          artifact.displayPath ??\n            artifact.manifestPath ??\n            \"Unavailable\",\n        ],\n        [\n          \"Tags\",\n          (artifact.tags ?? [])\n            .join(\", \") ||\n            \"None\",\n        ],\n      ],\n    ),\n    detailsCard(\n      \"Appearance\",\n      [\n        [\n          \"Theme\",\n          appearance.theme,\n        ],\n        [\n          \"Preset\",\n          appearance.preset,\n        ],\n        [\n          \"Layout\",\n          appearance.layout,\n        ],\n        [\n          \"Dependencies\",\n          String(\n            resolution.summary\n              ?.dependencyCount ??\n            0,\n          ),\n        ],\n        [\n          \"Valid\",\n          resolution.summary\n            ?.valid\n            ? \"Yes\"\n            : \"No\",\n        ],\n        [\n          \"Revision\",\n          revisionId\n            ? shortHash(\n                revisionId,\n                12,\n              )\n            : \"Unavailable\",\n        ],\n      ],\n    ),\n    detailsCard(\n      \"Standalone export\",\n      [\n        [\n          \"Ready\",\n          exportData.ready\n            ? \"Yes\"\n            : \"No\",\n        ],\n        [\n          \"File\",\n          exportData.fileName ??\n            artifact.exportFileName ??\n            `${artifact.id}.html`,\n        ],\n        [\n          \"Size\",\n          formatBytes(\n            exportData.sizeBytes,\n          ),\n        ],\n        [\n          \"SHA-256\",\n          shortHash(\n            exportData.sha256,\n            16,\n          ),\n        ],\n        [\n          \"Validation\",\n          exportData.validation\n            ?.valid\n            ? \"Passed\"\n            : \"Needs attention\",\n        ],\n        [\n          \"Warnings\",\n          String(\n            exportData.warnings\n              ?.length ?? 0,\n          ),\n        ],\n      ],\n    ),\n    detailsCard(\n      \"Embedded resources\",\n      exportResourceRows(\n        exportData.resources,\n      ),\n    ),\n    dependencyCard(\n      resolution,\n    ),\n    issuesCard(\n      [\n        ...(data.relatedIssues ?? []),\n        ...(resolution.issues ?? []),\n        ...(exportData.validation\n          ?.issues ?? []),\n      ],\n    ),\n  );\n}\n\nfunction detailsCard(\n  title,\n  rows,\n) {\n  const card = element(\n    \"article\",\n    \"viewer-details-card\",\n  );\n  card.append(\n    element(\n      \"h2\",\n      \"\",\n      title,\n    ),\n  );\n  const list = element(\n    \"dl\",\n    \"viewer-details-list\",\n  );\n\n  for (const [term, value] of rows) {\n    const item = element(\"div\");\n    item.append(\n      element(\n        \"dt\",\n        \"\",\n        term,\n      ),\n      element(\n        \"dd\",\n        \"\",\n        value ?? \"Unavailable\",\n      ),\n    );\n    list.append(item);\n  }\n\n  card.append(list);\n  return card;\n}\n\nfunction dependencyCard(\n  resolution,\n) {\n  const card = element(\n    \"article\",\n    \"viewer-details-card viewer-details-card--wide\",\n  );\n  card.append(\n    element(\n      \"h2\",\n      \"\",\n      \"Resolved dependencies\",\n    ),\n  );\n\n  const groups =\n    dependencyGroups(\n      resolution,\n    );\n\n  if (groups.length === 0) {\n    card.append(\n      element(\n        \"p\",\n        \"viewer-details-empty\",\n        \"No resolved appearance dependencies.\",\n      ),\n    );\n    return card;\n  }\n\n  const container = element(\n    \"div\",\n    \"viewer-dependency-groups\",\n  );\n\n  for (const group of groups) {\n    const section = element(\n      \"section\",\n      \"viewer-dependency-group\",\n    );\n    section.append(\n      element(\n        \"h3\",\n        \"\",\n        titleCase(group.kind),\n      ),\n    );\n    const list = element(\n      \"ul\",\n      \"viewer-dependency-list\",\n    );\n\n    for (\n      const dependency of\n        group.entries\n    ) {\n      const item = element(\"li\");\n      item.append(\n        element(\n          \"strong\",\n          \"\",\n          dependency.id,\n        ),\n        element(\n          \"span\",\n          \"\",\n          [\n            dependency.level ??\n              dependency.category,\n            dependency.slot,\n          ]\n            .filter(Boolean)\n            .join(\" · \"),\n        ),\n      );\n      list.append(item);\n    }\n\n    section.append(list);\n    container.append(section);\n  }\n\n  card.append(container);\n  return card;\n}\n\nfunction issuesCard(issues) {\n  const card = element(\n    \"article\",\n    \"viewer-details-card viewer-details-card--wide\",\n  );\n  card.append(\n    element(\n      \"h2\",\n      \"\",\n      \"Diagnostics\",\n    ),\n  );\n\n  if (issues.length === 0) {\n    const clear = element(\n      \"p\",\n      \"viewer-diagnostics-clear\",\n      \"No discovery, resolution or export issues.\",\n    );\n    card.append(clear);\n    return card;\n  }\n\n  const list = element(\n    \"ul\",\n    \"viewer-diagnostics-list\",\n  );\n\n  for (const issue of issues) {\n    const item = element(\"li\");\n    item.dataset.severity =\n      issue.severity ??\n      \"error\";\n    item.append(\n      element(\n        \"strong\",\n        \"\",\n        issue.code ??\n          \"DIAGNOSTIC\",\n      ),\n      element(\n        \"span\",\n        \"\",\n        issue.message ??\n          \"An issue was reported.\",\n      ),\n    );\n    list.append(item);\n  }\n\n  card.append(list);\n  return card;\n}\n\nfunction loadingDetails() {\n  const card = element(\n    \"article\",\n    \"viewer-details-card viewer-details-card--loading\",\n  );\n  card.append(\n    element(\n      \"h2\",\n      \"\",\n      \"Loading artefact details\",\n    ),\n    element(\n      \"p\",\n      \"\",\n      \"Resolving metadata, dependencies and standalone export status.\",\n    ),\n  );\n  return card;\n}\n\nfunction renderDetailsFailure(\n  panel,\n  error,\n) {\n  const card = element(\n    \"article\",\n    \"viewer-details-card viewer-details-card--error\",\n  );\n  card.append(\n    element(\n      \"h2\",\n      \"\",\n      \"Details unavailable\",\n    ),\n    element(\n      \"p\",\n      \"\",\n      error instanceof Error\n        ? error.message\n        : String(error),\n    ),\n  );\n  panel.replaceChildren(card);\n}\n\nfunction createShortcutDialog() {\n  const dialog =\n    document.createElement(\n      \"dialog\",\n    );\n  dialog.className =\n    \"viewer-shortcut-dialog\";\n  dialog.dataset\n    .viewerShortcutDialog = \"\";\n  const heading = element(\n    \"div\",\n    \"viewer-shortcut-dialog__heading\",\n  );\n  heading.append(\n    element(\n      \"h2\",\n      \"\",\n      \"Viewer shortcuts\",\n    ),\n  );\n  const close = element(\n    \"button\",\n    \"viewer-shortcut-dialog__close\",\n    \"Close\",\n  );\n  close.type = \"button\";\n  close.dataset\n    .viewerShortcutClose = \"\";\n  heading.append(close);\n\n  const list = element(\n    \"dl\",\n    \"viewer-shortcut-list\",\n  );\n\n  for (\n    const shortcut of\n      VIEWER_SHORTCUTS\n  ) {\n    const item = element(\"div\");\n    item.append(\n      element(\n        \"dt\",\n        \"\",\n        shortcut.key,\n      ),\n      element(\n        \"dd\",\n        \"\",\n        shortcut.label,\n      ),\n    );\n    list.append(item);\n  }\n\n  dialog.append(\n    heading,\n    list,\n  );\n  return dialog;\n}\n\nfunction controlButton(\n  label,\n  shortcut,\n  datasetName,\n) {\n  const button = element(\n    \"button\",\n    \"viewer-control\",\n    label,\n  );\n  button.type = \"button\";\n  button.title =\n    `${label} (${shortcut})`;\n  button.dataset[\n    datasetName\n  ] = \"\";\n\n  if (\n    datasetName ===\n    \"viewerDetails\"\n  ) {\n    button.setAttribute(\n      \"aria-controls\",\n      \"artifact-viewer-details\",\n    );\n    button.setAttribute(\n      \"aria-expanded\",\n      \"false\",\n    );\n  }\n\n  if (\n    datasetName ===\n    \"viewerFullscreen\"\n  ) {\n    button.setAttribute(\n      \"aria-pressed\",\n      \"false\",\n    );\n  }\n\n  const key = element(\n    \"kbd\",\n    \"\",\n    shortcut,\n  );\n  button.append(key);\n  return button;\n}\n\nfunction announce(\n  region,\n  message,\n) {\n  region.dataset.state =\n    \"error\";\n  region.textContent =\n    message;\n}\n\nfunction prefersReducedMotion() {\n  return window.matchMedia?.(\n    \"(prefers-reduced-motion: reduce)\",\n  ).matches === true;\n}\n\nfunction titleCase(value) {\n  return String(value)\n    .replaceAll(\"-\", \" \")\n    .replace(/\\b\\w/g, (letter) =>\n      letter.toUpperCase(),\n    );\n}\n\nfunction element(\n  tagName,\n  className = \"\",\n  text = null,\n) {\n  const result =\n    document.createElement(tagName);\n\n  if (className) {\n    result.className = className;\n  }\n\n  if (text !== null) {\n    result.textContent = text;\n  }\n\n  return result;\n}\n"}, "server/routes/artifacts.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  createRevisionEtag,\n  etagMatches,\n} from \"../etag.mjs\";\nimport {\n  HttpError,\n  asyncRoute,\n  booleanQuery,\n  integerQuery,\n  requireIdentifier,\n  sendJson,\n} from \"../http.mjs\";\n\nconst DEFAULT_MAX_BYTES =\n  50 * 1024 * 1024;\n\nexport function createArtifactsRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/artifacts\",\n    asyncRoute(async (request, response) => {\n      const result =\n        await context.services.artifacts.list();\n      const etag = createRevisionEtag(\n        result.revision.id,\n        \"artifact-list-v2\",\n      );\n\n      sendJson(\n        response,\n        {\n          artifacts:\n            result.artifacts.map(\n              publicArtifact,\n            ),\n          count:\n            result.artifacts.length,\n          librarySummary:\n            result.scan.summary,\n        },\n        {\n          etag,\n          revisionId:\n            result.revision.id,\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id\",\n    asyncRoute(async (request, response) => {\n      const kind = requireIdentifier(\n        request.params.kind,\n        \"kind\",\n      );\n      const id = requireIdentifier(\n        request.params.id,\n        \"id\",\n      );\n      const result =\n        await context.services.artifacts.get(\n          kind,\n          id,\n        );\n      const etag = createRevisionEtag(\n        result.revision.id,\n        \"artifact-detail-v3\",\n        kind,\n        id,\n      );\n\n      sendJson(\n        response,\n        {\n          artifact: {\n            ...publicArtifact(\n              result.artifact,\n            ),\n            manifest:\n              result.artifact.manifest,\n          },\n          resolution:\n            result.resolution,\n          relatedIssues:\n            result.scan.issues.filter(\n              (issue) =>\n                issue.manifestPath ===\n                result.artifact\n                  .manifestPath,\n            ),\n          revision:\n            result.revision,\n        },\n        {\n          etag,\n          revisionId:\n            result.revision.id,\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id/export-status\",\n    asyncRoute(async (request, response) => {\n      const requestData =\n        parseBuildRequest(request);\n      const detail =\n        await context.services.artifacts.get(\n          requestData.kind,\n          requestData.id,\n        );\n\n      if (\n        !detail.resolution.summary.valid\n      ) {\n        const etag = createRevisionEtag(\n          detail.revision.id,\n          \"artifact-export-status-v1\",\n          requestData.kind,\n          requestData.id,\n          \"invalid\",\n        );\n\n        sendJson(\n          response,\n          {\n            artifact:\n              publicArtifact(\n                detail.artifact,\n              ),\n            export: {\n              ready: false,\n              fileName:\n                exportFileName(\n                  detail.artifact,\n                ),\n              sizeBytes: null,\n              sha256: null,\n              validation: {\n                valid: false,\n                issues:\n                  detail.resolution\n                    .issues,\n              },\n              resources: {},\n              warnings: [],\n            },\n            resolution:\n              detail.resolution.summary,\n            revision:\n              detail.revision,\n          },\n          {\n            etag,\n            revisionId:\n              detail.revision.id,\n          },\n        );\n        return;\n      }\n\n      const result =\n        await context.services.artifacts.preview(\n          requestData.kind,\n          requestData.id,\n          requestData.options,\n        );\n      const etag = createRevisionEtag(\n        result.revision.id,\n        \"artifact-export-status-v1\",\n        requestData.kind,\n        requestData.id,\n        result.built.sha256,\n      );\n\n      sendJson(\n        response,\n        {\n          artifact:\n            publicArtifact(\n              result.artifact,\n            ),\n          export: {\n            ready: true,\n            fileName:\n              exportFileName(\n                result.artifact,\n              ),\n            sizeBytes:\n              result.built.sizeBytes,\n            sha256:\n              result.built.sha256,\n            validation:\n              result.built.validation,\n            resources:\n              result.built.resources,\n            warnings:\n              result.built.warnings,\n          },\n          resolution:\n            result.resolution.summary,\n          revision:\n            result.revision,\n        },\n        {\n          etag,\n          revisionId:\n            result.revision.id,\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id/preview\",\n    asyncRoute(async (request, response) => {\n      const requestData =\n        parseBuildRequest(request);\n      const result =\n        await context.services.artifacts.preview(\n          requestData.kind,\n          requestData.id,\n          requestData.options,\n        );\n\n      sendStandalone(\n        request,\n        response,\n        result,\n        {\n          disposition: \"inline\",\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id/download\",\n    asyncRoute(async (request, response) => {\n      const requestData =\n        parseBuildRequest(request);\n      const result =\n        await context.services.artifacts.preview(\n          requestData.kind,\n          requestData.id,\n          requestData.options,\n        );\n\n      sendStandalone(\n        request,\n        response,\n        result,\n        {\n          disposition:\n            \"attachment\",\n        },\n      );\n    }),\n  );\n\n  return router;\n}\n\nfunction parseBuildRequest(\n  request,\n) {\n  const kind = requireIdentifier(\n    request.params.kind,\n    \"kind\",\n  );\n  const id = requireIdentifier(\n    request.params.id,\n    \"id\",\n  );\n  const minify = booleanQuery(\n    request.query.minify,\n    \"minify\",\n    false,\n  );\n  const maxBytes = integerQuery(\n    request.query.maxBytes,\n    \"maxBytes\",\n    {\n      minimum: 1024,\n      maximum:\n        200 * 1024 * 1024,\n      defaultValue:\n        DEFAULT_MAX_BYTES,\n    },\n  );\n\n  return {\n    kind,\n    id,\n    options: {\n      minify,\n      maxBytes,\n    },\n  };\n}\n\nfunction sendStandalone(\n  request,\n  response,\n  result,\n  options,\n) {\n  if (\n    !result.resolution.summary.valid\n  ) {\n    throw new HttpError(\n      422,\n      \"APPEARANCE_INVALID\",\n      `Artefact ${result.artifact.kind}:${result.artifact.id} has unresolved appearance errors.`,\n      {\n        details: {\n          issues:\n            result.resolution.issues,\n        },\n      },\n    );\n  }\n\n  const etag =\n    `\"sha256-${result.built.sha256}\"`;\n  const fileName =\n    safeFilename(\n      exportFileName(\n        result.artifact,\n      ),\n    );\n\n  response.setHeader(\n    \"ETag\",\n    etag,\n  );\n  response.setHeader(\n    \"X-MyDash-Revision\",\n    result.revision.id,\n  );\n  response.setHeader(\n    \"Cache-Control\",\n    \"private, no-cache, must-revalidate\",\n  );\n\n  if (\n    etagMatches(\n      request.get(\"if-none-match\"),\n      etag,\n    )\n  ) {\n    response.status(304).end();\n    return;\n  }\n\n  response.status(200);\n  response.type(\"html\");\n  response.setHeader(\n    \"Content-Disposition\",\n    `${options.disposition}; filename=\"${fileName}\"`,\n  );\n  response.setHeader(\n    \"X-MyDash-SHA256\",\n    result.built.sha256,\n  );\n  response.setHeader(\n    \"X-MyDash-Artifact\",\n    `${result.artifact.kind}:${result.artifact.id}`,\n  );\n  response.send(\n    result.built.html,\n  );\n}\n\nfunction publicArtifact(entry) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    title: entry.title,\n    description:\n      entry.manifest.description ??\n      null,\n    tags:\n      entry.manifest.tags ?? [],\n    exportFileName:\n      exportFileName(entry),\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n\nfunction exportFileName(entry) {\n  return (\n    entry.manifest.export\n      ?.fileName ??\n    `${entry.id}.html`\n  );\n}\n\nfunction safeFilename(value) {\n  const name = String(value)\n    .replaceAll(\"\\\\\", \"-\")\n    .replaceAll(\"/\", \"-\")\n    .replace(\n      /[^a-z0-9._-]/gi,\n      \"-\",\n    )\n    .replace(/-+/g, \"-\")\n    .replace(/^\\.+/, \"\")\n    .slice(0, 180);\n\n  return name.toLowerCase()\n    .endsWith(\".html\")\n      ? name\n      : `${name || \"artifact\"}.html`;\n}\n", "allowedPrevious": ["import {\n  Router,\n} from \"express\";\nimport {\n  createRevisionEtag,\n  etagMatches,\n} from \"../etag.mjs\";\nimport {\n  HttpError,\n  asyncRoute,\n  booleanQuery,\n  integerQuery,\n  requireIdentifier,\n  sendJson,\n} from \"../http.mjs\";\n\nconst DEFAULT_MAX_BYTES =\n  50 * 1024 * 1024;\n\nexport function createArtifactsRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/artifacts\",\n    asyncRoute(async (request, response) => {\n      const result =\n        await context.services.artifacts.list();\n      const etag = createRevisionEtag(\n        result.revision.id,\n        \"artifact-list-v2\",\n      );\n\n      sendJson(\n        response,\n        {\n          artifacts:\n            result.artifacts.map(\n              publicArtifact,\n            ),\n          count:\n            result.artifacts.length,\n          librarySummary:\n            result.scan.summary,\n        },\n        {\n          etag,\n          revisionId:\n            result.revision.id,\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id\",\n    asyncRoute(async (request, response) => {\n      const kind = requireIdentifier(\n        request.params.kind,\n        \"kind\",\n      );\n      const id = requireIdentifier(\n        request.params.id,\n        \"id\",\n      );\n      const result =\n        await context.services.artifacts.get(\n          kind,\n          id,\n        );\n      const etag = createRevisionEtag(\n        result.revision.id,\n        \"artifact-detail-v2\",\n        kind,\n        id,\n      );\n\n      sendJson(\n        response,\n        {\n          artifact: {\n            ...publicArtifact(\n              result.artifact,\n            ),\n            manifest:\n              result.artifact.manifest,\n          },\n          resolution:\n            result.resolution,\n          relatedIssues:\n            result.scan.issues.filter(\n              (issue) =>\n                issue.manifestPath ===\n                result.artifact\n                  .manifestPath,\n            ),\n        },\n        {\n          etag,\n          revisionId:\n            result.revision.id,\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id/preview\",\n    asyncRoute(async (request, response) => {\n      const requestData =\n        parseBuildRequest(request);\n      const result =\n        await context.services.artifacts.preview(\n          requestData.kind,\n          requestData.id,\n          requestData.options,\n        );\n\n      sendStandalone(\n        request,\n        response,\n        result,\n        {\n          disposition: \"inline\",\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id/download\",\n    asyncRoute(async (request, response) => {\n      const requestData =\n        parseBuildRequest(request);\n      const result =\n        await context.services.artifacts.preview(\n          requestData.kind,\n          requestData.id,\n          requestData.options,\n        );\n\n      sendStandalone(\n        request,\n        response,\n        result,\n        {\n          disposition:\n            \"attachment\",\n        },\n      );\n    }),\n  );\n\n  return router;\n}\n\nfunction parseBuildRequest(\n  request,\n) {\n  const kind = requireIdentifier(\n    request.params.kind,\n    \"kind\",\n  );\n  const id = requireIdentifier(\n    request.params.id,\n    \"id\",\n  );\n  const minify = booleanQuery(\n    request.query.minify,\n    \"minify\",\n    false,\n  );\n  const maxBytes = integerQuery(\n    request.query.maxBytes,\n    \"maxBytes\",\n    {\n      minimum: 1024,\n      maximum:\n        200 * 1024 * 1024,\n      defaultValue:\n        DEFAULT_MAX_BYTES,\n    },\n  );\n\n  return {\n    kind,\n    id,\n    options: {\n      minify,\n      maxBytes,\n    },\n  };\n}\n\nfunction sendStandalone(\n  request,\n  response,\n  result,\n  options,\n) {\n  if (\n    !result.resolution.summary.valid\n  ) {\n    throw new HttpError(\n      422,\n      \"APPEARANCE_INVALID\",\n      `Artefact ${result.artifact.kind}:${result.artifact.id} has unresolved appearance errors.`,\n      {\n        details: {\n          issues:\n            result.resolution.issues,\n        },\n      },\n    );\n  }\n\n  const etag =\n    `\"sha256-${result.built.sha256}\"`;\n  const fileName =\n    safeFilename(\n      result.artifact.manifest\n        .export?.fileName ??\n      `${result.artifact.id}.html`,\n    );\n\n  response.setHeader(\n    \"ETag\",\n    etag,\n  );\n  response.setHeader(\n    \"X-MyDash-Revision\",\n    result.revision.id,\n  );\n  response.setHeader(\n    \"Cache-Control\",\n    \"private, no-cache, must-revalidate\",\n  );\n\n  if (\n    etagMatches(\n      request.get(\"if-none-match\"),\n      etag,\n    )\n  ) {\n    response.status(304).end();\n    return;\n  }\n\n  response.status(200);\n  response.type(\"html\");\n  response.setHeader(\n    \"Content-Disposition\",\n    `${options.disposition}; filename=\"${fileName}\"`,\n  );\n  response.setHeader(\n    \"X-MyDash-SHA256\",\n    result.built.sha256,\n  );\n  response.setHeader(\n    \"X-MyDash-Artifact\",\n    `${result.artifact.kind}:${result.artifact.id}`,\n  );\n  response.send(\n    result.built.html,\n  );\n}\n\nfunction publicArtifact(entry) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    title: entry.title,\n    description:\n      entry.manifest.description ??\n      null,\n    tags:\n      entry.manifest.tags ?? [],\n    exportFileName:\n      entry.manifest.export\n        ?.fileName ??\n      `${entry.id}.html`,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n\nfunction safeFilename(value) {\n  const name = String(value)\n    .replaceAll(\"\\\\\", \"-\")\n    .replaceAll(\"/\", \"-\")\n    .replace(\n      /[^a-z0-9._-]/gi,\n      \"-\",\n    )\n    .replace(/-+/g, \"-\")\n    .replace(/^\\.+/, \"\")\n    .slice(0, 180);\n\n  return name.toLowerCase()\n    .endsWith(\".html\")\n      ? name\n      : `${name || \"artifact\"}.html`;\n}\n"]}, "server/README.md": {"content": "# HTTP server\n\nThe server is a thin Express interface over the same shared services used by the\nCLI. It does not reimplement discovery, resolution, export, validation or Git\nlogic.\n\n## Start\n\n```text\nnpm start\n```\n\nThe default address comes from `config/workspace.json`:\n\n```text\nhttp://127.0.0.1:4173\n```\n\nEnvironment overrides:\n\n```text\nMYDASH_HOST=127.0.0.1\nMYDASH_PORT=4173\n```\n\n## API\n\n```text\nGET  /api\nGET  /api/health\nGET  /api/capabilities\n\nGET  /api/library\nGET  /api/library/:kind/:id\n\nGET  /api/artifacts\nGET  /api/artifacts/:kind/:id\nGET  /api/artifacts/:kind/:id/preview\n\nPOST /api/validation\n\nGET  /api/git/status\n```\n\nThe server is deliberately read-only at this stage. Preview and validation\nbuilds happen in memory. It does not expose file writes, recipe refreshes,\nexports to disk, Git commits or pushes.\n\n## Response envelope\n\nJSON responses use:\n\n```json\n{\n  \"ok\": true,\n  \"data\": {},\n  \"meta\": {\n    \"requestId\": \"uuid\",\n    \"durationMs\": 3\n  }\n}\n```\n\nErrors use the same metadata with an `error` object.\n\n## Security\n\n- `X-Powered-By` is disabled.\n- API responses are not cached.\n- JSON request bodies are limited to 64 KiB.\n- Request IDs are validated before reuse.\n- The default host is loopback-only.\n- No CORS middleware is installed.\n- Preview HTML is generated through the standalone export validator.\n\n\n## Live state and caching\n\nBootstrap 14 adds a revision-aware service layer:\n\n```text\nGET /api/state\nGET /api/events\n```\n\nThe workspace revision is calculated from filesystem metadata beneath\n`config/`, `library/`, `recipes/` and `package.json`. The poller does not read\nor execute artefact code.\n\nLibrary scans, standalone previews and validation reports are cached against the\ncurrent revision. A detected change clears every revision-bound cache.\n\nRead-only GET routes return ETags. Clients may send `If-None-Match`; unchanged\nresponses return `304 Not Modified`.\n\nThe event stream emits:\n\n```text\nevent: workspace-revision\ndata: {\"id\":\"...\",\"sequence\":2}\n```\n\nThe future navigator can invalidate its own state immediately instead of\npolling every endpoint.\n\n\n## Navigator UI\n\nBootstrap 18 serves the human-facing navigator from `app/`.\n\n```text\nGET /\nGET /dashboards\nGET /presentations\nGET /concepts\nGET /components\nGET /settings\n```\n\nStatic browser modules are served below:\n\n```text\n/navigator/\n```\n\nThe supported application routes return the same `index.html` document and the\nbrowser resolves the active route through the History API.\n\nNavigator responses apply a restrictive Content Security Policy and do not\npermit external scripts, external styles, camera, microphone, geolocation,\npayment or USB access.\n\nUnknown paths continue through the normal JSON 404 handler. API routes remain\nunder `/api`.\n\n\n## Artefact gallery support\n\nBootstrap 19 adds a download form of the in-memory standalone export:\n\n```text\nGET /api/artifacts/:kind/:id/download\n```\n\nIt uses the same revision-aware preview cache as the inline preview route and\nreturns `Content-Disposition: attachment`.\n\nDeep navigator viewer routes are also served:\n\n```text\nGET /view/:kind/:id\n```\n\nThe navigator Content Security Policy now permits same-origin preview frames\nand nothing cross-origin.\n\n\n## Viewer metadata and export status\n\nBootstrap 20 adds:\n\n```text\nGET /api/artifacts/:kind/:id/export-status\n```\n\nFor a valid artefact the response contains:\n\n- export readiness;\n- filename;\n- byte size;\n- SHA-256;\n- standalone validation result;\n- embedded resource counts;\n- build warnings;\n- active revision.\n\nThe endpoint reuses the existing in-memory preview build and cache. It never\nreturns the generated HTML.\n\nThe artefact-detail response also includes the revision object used for its\nresolution.\n", "allowedPrevious": ["# HTTP server\n\nThe server is a thin Express interface over the same shared services used by the\nCLI. It does not reimplement discovery, resolution, export, validation or Git\nlogic.\n\n## Start\n\n```text\nnpm start\n```\n\nThe default address comes from `config/workspace.json`:\n\n```text\nhttp://127.0.0.1:4173\n```\n\nEnvironment overrides:\n\n```text\nMYDASH_HOST=127.0.0.1\nMYDASH_PORT=4173\n```\n\n## API\n\n```text\nGET  /api\nGET  /api/health\nGET  /api/capabilities\n\nGET  /api/library\nGET  /api/library/:kind/:id\n\nGET  /api/artifacts\nGET  /api/artifacts/:kind/:id\nGET  /api/artifacts/:kind/:id/preview\n\nPOST /api/validation\n\nGET  /api/git/status\n```\n\nThe server is deliberately read-only at this stage. Preview and validation\nbuilds happen in memory. It does not expose file writes, recipe refreshes,\nexports to disk, Git commits or pushes.\n\n## Response envelope\n\nJSON responses use:\n\n```json\n{\n  \"ok\": true,\n  \"data\": {},\n  \"meta\": {\n    \"requestId\": \"uuid\",\n    \"durationMs\": 3\n  }\n}\n```\n\nErrors use the same metadata with an `error` object.\n\n## Security\n\n- `X-Powered-By` is disabled.\n- API responses are not cached.\n- JSON request bodies are limited to 64 KiB.\n- Request IDs are validated before reuse.\n- The default host is loopback-only.\n- No CORS middleware is installed.\n- Preview HTML is generated through the standalone export validator.\n\n\n## Live state and caching\n\nBootstrap 14 adds a revision-aware service layer:\n\n```text\nGET /api/state\nGET /api/events\n```\n\nThe workspace revision is calculated from filesystem metadata beneath\n`config/`, `library/`, `recipes/` and `package.json`. The poller does not read\nor execute artefact code.\n\nLibrary scans, standalone previews and validation reports are cached against the\ncurrent revision. A detected change clears every revision-bound cache.\n\nRead-only GET routes return ETags. Clients may send `If-None-Match`; unchanged\nresponses return `304 Not Modified`.\n\nThe event stream emits:\n\n```text\nevent: workspace-revision\ndata: {\"id\":\"...\",\"sequence\":2}\n```\n\nThe future navigator can invalidate its own state immediately instead of\npolling every endpoint.\n\n\n## Navigator UI\n\nBootstrap 18 serves the human-facing navigator from `app/`.\n\n```text\nGET /\nGET /dashboards\nGET /presentations\nGET /concepts\nGET /components\nGET /settings\n```\n\nStatic browser modules are served below:\n\n```text\n/navigator/\n```\n\nThe supported application routes return the same `index.html` document and the\nbrowser resolves the active route through the History API.\n\nNavigator responses apply a restrictive Content Security Policy and do not\npermit external scripts, external styles, camera, microphone, geolocation,\npayment or USB access.\n\nUnknown paths continue through the normal JSON 404 handler. API routes remain\nunder `/api`.\n\n\n## Artefact gallery support\n\nBootstrap 19 adds a download form of the in-memory standalone export:\n\n```text\nGET /api/artifacts/:kind/:id/download\n```\n\nIt uses the same revision-aware preview cache as the inline preview route and\nreturns `Content-Disposition: attachment`.\n\nDeep navigator viewer routes are also served:\n\n```text\nGET /view/:kind/:id\n```\n\nThe navigator Content Security Policy now permits same-origin preview frames\nand nothing cross-origin.\n"]}, "src/workspace/capabilities.mjs": {"content": "export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"navigator.viewer-controls\",\n        title: \"Dedicated artefact viewer controls\",\n        available: true,\n        controls: [\n          \"reload\",\n          \"fullscreen\",\n          \"details\",\n          \"shortcuts\"\n        ],\n        exportStatus: true,\n        dependencyDetails: true,\n      },\n      {\n        id: \"navigator.artifact-gallery\",\n        title: \"Live artefact gallery and viewer\",\n        available: true,\n        lazyPreviews: true,\n        viewerRoutes: true,\n        downloadEndpoint: true,\n      },\n      {\n        id: \"navigator.ui-shell\",\n        title: \"Human-facing navigator shell\",\n        available: true,\n        routes: [\n          \"/\",\n          \"/dashboards\",\n          \"/presentations\",\n          \"/concepts\",\n          \"/components\",\n          \"/settings\"\n        ],\n        liveRevisionEvents: true,\n      },\n      {\n        id: \"artifact.reference-dashboard\",\n        title: \"Reference governance dashboard\",\n        available: true,\n        artifactId: \"ai-use-case-governance\",\n        artifactKind: \"dashboard\",\n        standaloneExport: true,\n      },\n      {\n        id: \"library.minimal-core\",\n        title: \"Minimal reusable Core library\",\n        available: true,\n        resourceCount: 8,\n        defaultTheme: \"hsbc-light\",\n        defaultPreset: \"default\",\n        brandAsset: \"mydash-brand-mark\",\n      },\n      {\n        id: \"agent.skills\",\n        title: \"Project agent skills\",\n        available: true,\n        logicalSkillCount: 9,\n        commandCount: 10,\n        activeDirectory: \".claude/skills\",\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n", "allowedPrevious": ["export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"navigator.artifact-gallery\",\n        title: \"Live artefact gallery and viewer\",\n        available: true,\n        lazyPreviews: true,\n        viewerRoutes: true,\n        downloadEndpoint: true,\n      },\n      {\n        id: \"navigator.ui-shell\",\n        title: \"Human-facing navigator shell\",\n        available: true,\n        routes: [\n          \"/\",\n          \"/dashboards\",\n          \"/presentations\",\n          \"/concepts\",\n          \"/components\",\n          \"/settings\"\n        ],\n        liveRevisionEvents: true,\n      },\n      {\n        id: \"artifact.reference-dashboard\",\n        title: \"Reference governance dashboard\",\n        available: true,\n        artifactId: \"ai-use-case-governance\",\n        artifactKind: \"dashboard\",\n        standaloneExport: true,\n      },\n      {\n        id: \"library.minimal-core\",\n        title: \"Minimal reusable Core library\",\n        available: true,\n        resourceCount: 8,\n        defaultTheme: \"hsbc-light\",\n        defaultPreset: \"default\",\n        brandAsset: \"mydash-brand-mark\",\n      },\n      {\n        id: \"agent.skills\",\n        title: \"Project agent skills\",\n        available: true,\n        logicalSkillCount: 9,\n        commandCount: 10,\n        activeDirectory: \".claude/skills\",\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n"]}, "tests/unit/viewer-controls.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport test from \"node:test\";\nimport {\n  dependencyGroups,\n  exportReadiness,\n  exportResourceRows,\n  formatBytes,\n  selectedAppearance,\n  shortHash,\n  viewerShortcutAction,\n} from \"../../app/viewer-model.js\";\n\ntest(\"viewer shortcuts ignore modified and editable key events\", () => {\n  assert.equal(\n    viewerShortcutAction({\n      key: \"r\",\n      ctrlKey: false,\n      metaKey: false,\n      altKey: false,\n      defaultPrevented: false,\n      target: {\n        tagName: \"DIV\",\n        isContentEditable: false,\n      },\n    }),\n    \"reload\",\n  );\n\n  assert.equal(\n    viewerShortcutAction({\n      key: \"f\",\n      ctrlKey: true,\n      metaKey: false,\n      altKey: false,\n      defaultPrevented: false,\n      target: {\n        tagName: \"DIV\",\n        isContentEditable: false,\n      },\n    }),\n    null,\n  );\n\n  assert.equal(\n    viewerShortcutAction({\n      key: \"i\",\n      ctrlKey: false,\n      metaKey: false,\n      altKey: false,\n      defaultPrevented: false,\n      target: {\n        tagName: \"INPUT\",\n        isContentEditable: false,\n      },\n    }),\n    null,\n  );\n});\n\ntest(\"byte and hash formatting is stable for en-GB\", () => {\n  assert.equal(\n    formatBytes(512),\n    \"512 B\",\n  );\n  assert.equal(\n    formatBytes(12_345),\n    \"12.1 KB\",\n  );\n  assert.equal(\n    formatBytes(2_621_440),\n    \"2.5 MB\",\n  );\n  assert.equal(\n    shortHash(\n      \"0123456789abcdef\",\n      8,\n    ),\n    \"01234567\",\n  );\n});\n\ntest(\"selected appearance reads resolved entries\", () => {\n  assert.deepEqual(\n    selectedAppearance({\n      selections: {\n        theme: {\n          entry: {\n            id: \"hsbc-light\",\n          },\n        },\n        preset: {\n          entry: {\n            id: \"default\",\n          },\n        },\n        layout: {\n          entry: {\n            id: \"dashboard-shell\",\n          },\n        },\n      },\n    }),\n    {\n      theme: \"hsbc-light\",\n      preset: \"default\",\n      layout: \"dashboard-shell\",\n    },\n  );\n});\n\ntest(\"dependencies group in semantic order\", () => {\n  const groups =\n    dependencyGroups({\n      dependencyClosure: [\n        {\n          kind: \"component\",\n          id: \"metric-card\",\n        },\n        {\n          kind: \"theme\",\n          id: \"hsbc-light\",\n        },\n        {\n          kind: \"primitive\",\n          id: \"button\",\n        },\n        {\n          kind: \"component\",\n          id: \"section-heading\",\n        },\n      ],\n    });\n\n  assert.deepEqual(\n    groups.map(\n      (group) => [\n        group.kind,\n        group.entries.map(\n          (entry) => entry.id,\n        ),\n      ],\n    ),\n    [\n      [\"theme\", [\"hsbc-light\"]],\n      [\"primitive\", [\"button\"]],\n      [\n        \"component\",\n        [\n          \"metric-card\",\n          \"section-heading\",\n        ],\n      ],\n    ],\n  );\n});\n\ntest(\"export status summaries expose readiness and resources\", () => {\n  assert.deepEqual(\n    exportReadiness({\n      export: {\n        ready: true,\n        sizeBytes: 65_536,\n      },\n    }),\n    {\n      mode: \"ready\",\n      label:\n        \"Export ready · 64 KB\",\n    },\n  );\n\n  assert.deepEqual(\n    exportResourceRows({\n      uiResources: 6,\n      scripts: 2,\n      stylesheets: 3,\n      dataFiles: 1,\n    }),\n    [\n      [\"Stylesheets\", \"3\"],\n      [\"Scripts\", \"2\"],\n      [\"Data files\", \"1\"],\n      [\"UI resources\", \"6\"],\n    ],\n  );\n});\n"}, "tests/integration/viewer-controls-server.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  createServer,\n} from \"node:http\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport test from \"node:test\";\nimport {\n  createApplication,\n} from \"../../server/app.mjs\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\nconst workspaceRoot = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"export-workspace\",\n);\n\ntest(\"export status returns build metadata without the HTML document\", async () => {\n  await withServer(async (baseUrl) => {\n    const response = await fetch(\n      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/export-status`,\n    );\n    const body =\n      await response.json();\n\n    assert.equal(\n      response.status,\n      200,\n    );\n    assert.equal(\n      body.data.export.ready,\n      true,\n    );\n    assert.equal(\n      body.data.export.fileName,\n      \"use-case-pipeline.html\",\n    );\n    assert.equal(\n      body.data.export.validation.valid,\n      true,\n    );\n    assert.equal(\n      body.data.export.resources.uiResources,\n      3,\n    );\n    assert.match(\n      body.data.export.sha256,\n      /^[a-f0-9]{64}$/,\n    );\n    assert.equal(\n      Object.hasOwn(\n        body.data.export,\n        \"html\",\n      ),\n      false,\n    );\n    assert.match(\n      response.headers.get(\n        \"etag\",\n      ),\n      /^\"/,\n    );\n  });\n});\n\ntest(\"export status supports conditional requests\", async () => {\n  await withServer(async (baseUrl) => {\n    const first = await fetch(\n      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/export-status`,\n    );\n    const etag =\n      first.headers.get(\"etag\");\n\n    const second = await fetch(\n      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/export-status`,\n      {\n        headers: {\n          \"If-None-Match\": etag,\n        },\n      },\n    );\n\n    assert.equal(\n      second.status,\n      304,\n    );\n    assert.equal(\n      await second.text(),\n      \"\",\n    );\n  });\n});\n\ntest(\"artefact detail includes resolution revision metadata\", async () => {\n  await withServer(async (baseUrl) => {\n    const response = await fetch(\n      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline`,\n    );\n    const body =\n      await response.json();\n\n    assert.equal(\n      response.status,\n      200,\n    );\n    assert.equal(\n      body.data.resolution.summary.valid,\n      true,\n    );\n    assert.match(\n      body.data.revision.id,\n      /^[a-f0-9]{64}$/,\n    );\n    assert.equal(\n      body.data.artifact.manifest.entry,\n      \"src/index.html\",\n    );\n  });\n});\n\ntest(\"viewer browser modules are served without external dependencies\", async () => {\n  await withServer(async (baseUrl) => {\n    for (const path of [\n      \"/navigator/viewer-model.js\",\n      \"/navigator/viewer.js\",\n    ]) {\n      const response = await fetch(\n        `${baseUrl}${path}`,\n      );\n      const source =\n        await response.text();\n\n      assert.equal(\n        response.status,\n        200,\n        path,\n      );\n      assert.match(\n        source,\n        /viewer/i,\n      );\n      assert.doesNotMatch(\n        source,\n        /https?:\\/\\//,\n      );\n      assert.doesNotMatch(\n        source,\n        /innerHTML/,\n      );\n    }\n  });\n});\n\nasync function withServer(callback) {\n  const created =\n    await createApplication({\n      workspaceRoot,\n      logger() {},\n      revisionPollIntervalMs: 50,\n      minimumRevisionCheckIntervalMs: 0,\n    });\n  const server = createServer(\n    created.app,\n  );\n\n  await new Promise(\n    (resolvePromise, reject) => {\n      server.once(\"error\", reject);\n      server.listen(\n        0,\n        \"127.0.0.1\",\n        () => {\n          server.off(\"error\", reject);\n          resolvePromise();\n        },\n      );\n    },\n  );\n\n  const address = server.address();\n  const baseUrl =\n    `http://127.0.0.1:${address.port}`;\n\n  try {\n    await callback(baseUrl);\n  } finally {\n    server.closeAllConnections?.();\n    await new Promise(\n      (resolvePromise, reject) => {\n        server.close((error) => {\n          if (error) reject(error);\n          else resolvePromise();\n        });\n      },\n    );\n    await created.close();\n  }\n}\n"}, "scripts/tasks/test-viewer.mjs": {"content": "#!/usr/bin/env node\n\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  scriptDirectory,\n  \"../..\",\n);\n\nconst tests = [\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"unit\",\n    \"viewer-controls.test.mjs\",\n  ),\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"integration\",\n    \"viewer-controls-server.test.mjs\",\n  ),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n    maxBuffer:\n      64 * 1024 * 1024,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode =\n  result.status ?? 1;\n"}};

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
  viewer: {
    shortcuts: [
      "R reload",
      "F fullscreen",
      "I details",
      "? help",
    ],
    exportStatusEndpoint:
      "/api/artifacts/<kind>/<id>/export-status",
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
      "Bootstrap 20 must run from the root of the My Dashboards Git repository.",
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
    "20-complete-artifact-viewer.mjs",
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
        "The completed viewer was created and tested, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 20

Usage:
  node scripts/20-complete-artifact-viewer.mjs [options]

Options:
  --target <path>  Complete the viewer in a specific repository root.
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
    "app/styles.css",
    "app/api.js",
    "app/main.js",
    "app/gallery-model.js",
    "app/gallery.js",
    "server/routes/artifacts.mjs",
    "server/services/artifacts.mjs",
    "src/workspace/capabilities.mjs",
    "library/dashboards/ai-use-case-governance/artifact.json",
    "scripts/tasks/test-gallery.mjs",
    "scripts/tasks/test-navigator.mjs",
    "scripts/tasks/test-server.mjs",
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
        "Bootstrap 19 has not been completed.",
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
        "package.json had pre-existing changes, so the viewer test command was not added automatically.",
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
  value.scripts["test:viewer"] =
    value.scripts["test:viewer"] ??
    "node scripts/tasks/test-viewer.mjs";

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
        "The completed viewer was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "app/api.js",
    "app/main.js",
    "app/viewer-model.js",
    "app/viewer.js",
    "server/routes/artifacts.mjs",
    "src/workspace/capabilities.mjs",
    "tests/unit/viewer-controls.test.mjs",
    "tests/integration/viewer-controls-server.test.mjs",
    "scripts/tasks/test-viewer.mjs",
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
      `${modulePaths.length} viewer, API, server and test modules passed Node syntax checks.`,
  });

  const tests = run(
    process.execPath,
    [
      join(
        targetRoot,
        "scripts",
        "tasks",
        "test-viewer.mjs",
      ),
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Viewer control tests failed:\n${
        tests.stderr ||
        tests.stdout
      }`,
    );
  }

  report.validation.push({
    check: "viewer-tests",
    ok: true,
    message:
      "Shortcut, metadata, dependency, export-status, conditional request and static module tests passed.",
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
    "scripts/tasks/test-gallery.mjs",
    "scripts/tasks/test-navigator.mjs",
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
      "Gallery, navigator, reference dashboard, Core, skills, server, Git, validation, export, resolution, library, data, Office, filesystem, CLI and contract tests still pass.",
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
        "The completed viewer was already present; there were no task-owned changes to commit.",
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
        "The completed viewer was created and tested, but no commit was made because Git user.name or user.email is missing.",
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
    "\nMy Dashboards — completed artefact viewer\n",
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

  console.log("\nViewer:");
  console.log(
    `  Shortcuts: ${report.viewer.shortcuts.join(", ")}`,
  );
  console.log(
    `  Export status: ${report.viewer.exportStatusEndpoint}`,
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
