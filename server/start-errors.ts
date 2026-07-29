export interface ServerStartErrorContext {
  host?: string;
  port?: number | string;
}

export function describeServerStartError(
  error: unknown,
  context: ServerStartErrorContext = {},
): string {
  const code =
    error instanceof Error && "code" in error
      ? (error as Error & { code?: string }).code
      : typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
      : undefined;

  if (code === "EADDRINUSE") {
    return `MyDash could not start because ${context.host ?? "the configured host"}:${context.port ?? "the configured port"} is already in use. Close the other process or set MYDASH_PORT to another port.`;
  }

  if (code === "EACCES") {
    return `MyDash does not have permission to listen on ${context.host ?? "the configured host"}:${context.port ?? "the configured port"}. Choose a non-privileged local port.`;
  }

  if (code === "EADDRNOTAVAIL") {
    return `MyDash cannot bind to ${context.host ?? "the configured host"}. Use 127.0.0.1 for local use or a valid workstation interface.`;
  }

  return `MyDash could not start: ${error instanceof Error ? error.message : String(error)}`;
}
