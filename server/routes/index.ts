import { Router } from "express";
import { createArtifactsRouter } from "./artifacts.js";
import { createCapabilitiesRouter } from "./capabilities.js";
import { createGitRouter } from "./git.js";
import { createHealthRouter } from "./health.js";
import { createLibraryRouter } from "./library.js";
import { createStateRouter } from "./state.js";
import { createReadinessRouter } from "./readiness.js";
import { createValidationRouter } from "./validation.js";
import type { RouteContext } from "../types.js";

export function createApiRouter(context: RouteContext): Router {
  const router = Router();

  router.use(createCapabilitiesRouter(context));
  router.use(createHealthRouter(context));
  router.use(createStateRouter(context));
  router.use(createReadinessRouter(context));
  router.use(createLibraryRouter(context));
  router.use(createArtifactsRouter(context));
  router.use(createValidationRouter(context));
  router.use(createGitRouter(context));

  return router;
}