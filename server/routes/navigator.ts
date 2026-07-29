import express, {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { join } from "node:path";
import type { RouteContext } from "../types.js";

export const NAVIGATOR_PATHS: readonly string[] = Object.freeze([
  "/",
  "/dashboards",
  "/presentations",
  "/concepts",
  "/components",
]);

const NAVIGATOR_PATH_LIST: string[] = [
  ...NAVIGATOR_PATHS,
];

const VIEWER_PATTERN =
  /^\/view\/[a-z0-9][a-z0-9-]{0,127}\/[a-z0-9][a-z0-9-]{0,127}$/;
const LIBRARY_ENTRY_PATTERN =
  /^\/components\/[a-z0-9][a-z0-9-]{0,127}\/[a-z0-9][a-z0-9-]{0,127}$/;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "frame-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
].join("; ");

export function createNavigatorRouter(context: RouteContext): Router {
  const router = Router();
  const root = context.navigatorRoot;
  const indexPath = join(root, "index.html");

  const sendNavigator: RequestHandler = function sendNavigatorMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    setNavigatorHeaders(response);
    response.sendFile(indexPath, (error) => {
      if (error) next(error);
    });
  };

  router.use(
    "/navigator",
    express.static(root, {
      dotfiles: "deny",
      etag: true,
      fallthrough: true,
      immutable: false,
      index: false,
      lastModified: true,
      maxAge: 0,
      redirect: false,
      setHeaders(response: Response) {
        setNavigatorHeaders(response);
      },
    }),
  );

  router.get(NAVIGATOR_PATH_LIST, sendNavigator);

  router.get(
    ["/view/:kind/:id", "/components/:kind/:id"],
    (request, response, next) => {
      if (
        !VIEWER_PATTERN.test(request.path) &&
        !LIBRARY_ENTRY_PATTERN.test(request.path)
      ) {
        next();
        return;
      }

      sendNavigator(request, response, next);
    },
  );

  return router;
}

function setNavigatorHeaders(response: Response): void {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader(
    "Content-Security-Policy",
    CONTENT_SECURITY_POLICY,
  );
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
}