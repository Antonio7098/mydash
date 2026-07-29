import type { Request, Response, NextFunction, RequestHandler } from "express";

export const securityHeaders: RequestHandler = function securityHeadersMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Cross-Origin-Resource-Policy",
    "same-origin",
  );

  if (request.path.startsWith("/api")) {
    const cacheControl =
      request.method === "GET" || request.method === "HEAD"
        ? "private, no-cache, must-revalidate"
        : "no-store";

    response.setHeader("Cache-Control", cacheControl);
  }

  next();
};