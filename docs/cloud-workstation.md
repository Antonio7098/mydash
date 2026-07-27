# Cloud workstation

MyDash is designed for a Linux cloud workstation with a browser-accessible forwarded port.

```bash
git clone <repository>
cd mydash
npm install --no-audit --no-fund
npm start
```

Forward local port 4173 through the workstation platform. Keep `MYDASH_HOST=127.0.0.1` unless the platform explicitly requires another interface.

Git is the recommended persistence and recovery layer. The browser remains usable without a remote, but artefact-default appearance changes require a local Git repository and commit identity.
