# Getting started

## Requirements

- Node.js 20 or later
- npm
- Git is recommended, but not required for browsing, previewing or exporting

## Windows work laptop

Extract the release zip into a writable folder, such as your user profile. Double-click `start-mydash.cmd`, or run:

```powershell
npm install --no-audit --no-fund
npm start
```

Open `http://127.0.0.1:4173/`.

If company proxy settings block npm, use the approved internal npm registry or proxy configuration supplied by your organisation. MyDash itself makes no external runtime requests after dependencies are installed.

## Linux or cloud workstation

```bash
./start-mydash.sh
```

For a forwarded cloud port, keep the default loopback host and forward port 4173 through the workstation platform. Set `MYDASH_PORT` when the default port is occupied.

## Verify the installation

```bash
npm run check:source
npm run validate
npm test
npm run smoke
```
