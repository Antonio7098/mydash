import assert from "node:assert/strict";
import test from "node:test";
import {
  NAVIGATOR_ROUTES,
  isNavigatorPath,
  normaliseNavigatorPath,
  routeForId,
  routeForPath,
} from "../../ui/router.js";

test("navigator routes cover the intended foundation sections", () => {
  assert.deepEqual(
    NAVIGATOR_ROUTES.map(
      (route) => route.path,
    ),
    [
      "/",
      "/dashboards",
      "/presentations",
      "/concepts",
      "/components",
    ],
  );
});

test("navigator path normalisation removes query, fragments and trailing slashes", () => {
  assert.equal(
    normaliseNavigatorPath(
      "/dashboards/?view=all#top",
    ),
    "/dashboards",
  );
  assert.equal(
    normaliseNavigatorPath("///"),
    "/",
  );
});

test("unknown routes fall back to home without becoming allowed routes", () => {
  const route = routeForPath("/missing");

  if (!route) throw new Error("Expected fallback route.");

  assert.equal(
    isNavigatorPath("/missing"),
    false,
  );
  assert.equal(
    route.id,
    "home",
  );
});

test("route lookup by id returns category metadata", () => {
  const presentations = routeForId("presentations");
  const unknown = routeForId("unknown");

  if (!presentations || !unknown) throw new Error("Expected navigator routes.");

  assert.equal(
    presentations.category,
    "presentation",
  );
  assert.equal(
    unknown.id,
    "home",
  );
});
