export function describeServerStartError(error, context = {}) {
  if (error?.code === "EADDRINUSE") {
    return `MyDash could not start because ${context.host ?? "the configured host"}:${context.port ?? "the configured port"} is already in use. Close the other process or set MYDASH_PORT to another port.`;
  }

  if (error?.code === "EACCES") {
    return `MyDash does not have permission to listen on ${context.host ?? "the configured host"}:${context.port ?? "the configured port"}. Choose a non-privileged local port.`;
  }

  if (error?.code === "EADDRNOTAVAIL") {
    return `MyDash cannot bind to ${context.host ?? "the configured host"}. Use 127.0.0.1 for local use or a valid workstation interface.`;
  }

  return `MyDash could not start: ${error instanceof Error ? error.message : String(error)}`;
}
