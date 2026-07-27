# Troubleshooting

## Port 4173 is already in use

```powershell
$env:MYDASH_PORT = "4174"
npm start
```

## Git is unavailable

The navigator, preview and exports still work. Initialise Git only when you want focused checkpoints:

```bash
git init
git config user.name "Your Name"
git config user.email "you@example.com"
```

## npm install is blocked

Use the approved company npm registry or proxy. Do not disable corporate controls. Once dependencies are installed, MyDash does not require an internet connection at runtime.

## A resource or artefact is missing

Run:

```bash
npm run validate
npm run mydash -- library scan
```

The Settings page and resource detail pages show scoped diagnostics.
