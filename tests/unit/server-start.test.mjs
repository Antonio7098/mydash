import assert from "node:assert/strict";
import test from "node:test";
import { describeServerStartError } from "../../server/start-errors.mjs";

test("port conflicts produce an actionable message", () => {
  assert.match(describeServerStartError({ code: "EADDRINUSE" }, { host: "127.0.0.1", port: 4173 }), /4173 is already in use/);
  assert.match(describeServerStartError({ code: "EADDRINUSE" }, { host: "127.0.0.1", port: 4173 }), /MYDASH_PORT/);
});

test("permission and address errors are explained", () => {
  assert.match(describeServerStartError({ code: "EACCES" }, { port: 80 }), /permission/);
  assert.match(describeServerStartError({ code: "EADDRNOTAVAIL" }, { host: "bad-host" }), /cannot bind/);
});
