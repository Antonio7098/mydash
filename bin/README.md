# Executable entry points

This directory contains the thin `mydash.mjs` launcher that resolves the
package root and imports the compiled CLI from `dist/cli/index.js` after
`npm run build` produces it. The package `bin` field points at the same
`dist/cli/index.js` entry point once the TypeScript build has run.

Command logic belongs in `cli/`; reusable behaviour belongs in `src/`.
