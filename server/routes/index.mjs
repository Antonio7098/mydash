import {
  Router,
} from "express";
import {
  createArtifactsRouter,
} from "./artifacts.mjs";
import {
  createCapabilitiesRouter,
} from "./capabilities.mjs";
import {
  createGitRouter,
} from "./git.mjs";
import {
  createHealthRouter,
} from "./health.mjs";
import {
  createLibraryRouter,
} from "./library.mjs";
import {
  createStateRouter,
} from "./state.mjs";
import {
  createReadinessRouter,
} from "./readiness.mjs";
import {
  createValidationRouter,
} from "./validation.mjs";

export function createApiRouter(context) {
  const router = Router();

  router.use(
    createCapabilitiesRouter(context),
  );
  router.use(
    createHealthRouter(context),
  );
  router.use(
    createStateRouter(context),
  );
  router.use(
    createReadinessRouter(context),
  );
  router.use(
    createLibraryRouter(context),
  );
  router.use(
    createArtifactsRouter(context),
  );
  router.use(
    createValidationRouter(context),
  );
  router.use(
    createGitRouter(context),
  );

  return router;
}
