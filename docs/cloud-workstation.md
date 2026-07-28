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

## Data refresh

User-supplied and live-local workbooks must be copied into an artefact source
snapshot before analysis. Machine-specific live paths belong in the ignored
`.mydash-local/sources.json` file. See [Data refresh](data-refresh.md) for the
staging, synchronisation, quality and scheduling procedure.

Workstation cron or `systemd --user` timers are best-effort because a cloud
workstation may stop or suspend. Use an always-available scheduled service when
the refresh service-level requirement extends beyond workstation uptime.
