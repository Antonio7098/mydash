import assert from "node:assert/strict";
import test from "node:test";
import {
  NAVIGATOR_ROUTES,
  isNavigatorPath,
  normaliseNavigatorPath,
  routeForId,
  routeForPath,
} from "../../app/router.js";

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
      "/settings",
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
  assert.equal(
    isNavigatorPath("/missing"),
    false,
  );
  assert.equal(
    routeForPath("/missing").id,
    "home",
  );
});

test("route lookup by id returns category metadata", () => {
  assert.equal(
    routeForId("presentations")
      .category,
    "presentation",
  );
  assert.equal(
    routeForId("unknown").id,
    "home",
  );
});
