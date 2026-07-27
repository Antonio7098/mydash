import {
  createServer,
} from "node:http";
import process from "node:process";
import {
  resolve,
} from "node:path";
import {
  pathToFileURL,
} from "node:url";
import {
  createApplication,
} from "./app.mjs";
import {
  describeServerStartError,
} from "./start-errors.mjs";

export async function startApplicationServer(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const created = await createApplication({
    workspaceRoot,
    logger: options.logger,
    now: options.now,
    revisionPollIntervalMs: options.revisionPollIntervalMs,
    minimumRevisionCheckIntervalMs: options.minimumRevisionCheckIntervalMs,
  });
  const host = options.host ?? process.env.MYDASH_HOST ?? created.context.config.preview.host ?? "127.0.0.1";
  const port = parsePort(options.port ?? process.env.MYDASH_PORT ?? created.context.config.preview.port ?? 4173);
  const server = createServer(created.app);

  server.requestTimeout = 120_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;

  try {
    await new Promise((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolvePromise();
      });
    });
  } catch (error) {
    await created.close();
    const wrapped = new Error(describeServerStartError(error, { host, port }));
    wrapped.code = error?.code ?? "SERVER_START_FAILED";
    wrapped.cause = error;
    throw wrapped;
  }

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const logger = options.logger ?? ((record) => process.stdout.write(`${JSON.stringify(record)}\n`));
  let closing = false;
  const signalHandlers = new Map();

  async function close(signal = "explicit") {
    if (closing) return;
    closing = true;
    removeSignalHandlers();

    logger({ timestamp: new Date().toISOString(), level: "info", event: "server.stopping", signal });
    const timer = setTimeout(() => server.closeAllConnections?.(), 10_000);
    timer.unref();

    try {
      if (server.listening) {
        await new Promise((resolvePromise, reject) => {
          server.close((error) => error ? reject(error) : resolvePromise());
        });
      }
      await created.close();
      logger({ timestamp: new Date().toISOString(), level: "info", event: "server.stopped" });
    } finally {
      clearTimeout(timer);
    }
  }

  function installSignalHandler(signal) {
    const handler = () => {
      close(signal).catch((error) => {
        logger({ timestamp: new Date().toISOString(), level: "error", event: "server.stop.failed", message: error.message });
        process.exitCode = 1;
      });
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }

  function removeSignalHandlers() {
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    signalHandlers.clear();
  }

  logger({ timestamp: new Date().toISOString(), level: "info", event: "server.started", host, port: actualPort, workspaceRoot });

  if (options.installSignalHandlers !== false) {
    installSignalHandler("SIGINT");
    installSignalHandler("SIGTERM");
  }

  return {
    server,
    app: created.app,
    context: created.context,
    host,
    port: actualPort,
    url: `http://${formatHost(host)}:${actualPort}`,
    close,
  };
}

function parsePort(value) {
  const text = String(value);
  if (!/^\d+$/.test(text)) throw new Error(`Server port must be an integer. Received: ${value}`);
  const port = Number.parseInt(text, 10);
  if (port < 0 || port > 65535) throw new Error(`Server port must be between 0 and 65535. Received: ${value}`);
  return port;
}

function formatHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}

const direct = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (direct === import.meta.url) {
  try {
    await startApplicationServer();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
