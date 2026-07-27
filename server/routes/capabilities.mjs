import {
  Router,
} from "express";
import {
  asyncRoute,
  sendJson,
} from "../http.mjs";
import {
  createEtag,
} from "../etag.mjs";
import {
  getWorkspaceCapabilities,
} from "../../src/workspace/capabilities.mjs";

export function createCapabilitiesRouter(
  context,
) {
  const router = Router();
  const capabilities =
    getWorkspaceCapabilities({
      name: context.config.name,
      version:
        context.packageMetadata.version,
    });
  const capabilitiesEtag =
    createEtag(
      JSON.stringify(capabilities),
    );

  router.get(
    "/",
    asyncRoute(async (request, response) => {
      sendJson(
        response,
        {
          service: {
            name: "My Dashboards API",
            version:
              context.packageMetadata.version,
          },
          links: {
            health: "/api/health",
            capabilities:
              "/api/capabilities",
            state: "/api/state",
            readiness: "/api/readiness",
            events: "/api/events",
            library: "/api/library",
            artifacts: "/api/artifacts",
            validation: "/api/validation",
            gitStatus: "/api/git/status",
          },
        },
        {
          etag: createEtag(
            `${context.packageMetadata.version}:api-index-v2`,
          ),
        },
      );
    }),
  );

  router.get(
    "/capabilities",
    asyncRoute(async (request, response) => {
      sendJson(
        response,
        capabilities,
        {
          etag: capabilitiesEtag,
        },
      );
    }),
  );

  return router;
}
