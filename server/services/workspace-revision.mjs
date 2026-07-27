import {
  EventEmitter,
} from "node:events";
import {
  fingerprintWorkspace,
} from "../../src/files/workspace-fingerprint.mjs";

export function createWorkspaceRevisionService(
  options,
) {
  const emitter = new EventEmitter();
  const workspaceRoot =
    options.workspaceRoot;
  const pollIntervalMs =
    options.pollIntervalMs ?? 1_000;
  const minimumCheckIntervalMs =
    options.minimumCheckIntervalMs ?? 200;
  const now =
    options.now ?? (() => new Date());
  const logger =
    options.logger ?? (() => {});
  let state = null;
  let inFlight = null;
  let timer = null;
  let lastCheckedAtMs = 0;
  let pendingReason = "initial";

  async function current(
    currentOptions = {},
  ) {
    const currentTime = now().getTime();

    if (
      !currentOptions.force &&
      state &&
      currentTime - lastCheckedAtMs <
        minimumCheckIntervalMs
    ) {
      return state;
    }

    if (inFlight) return inFlight;

    inFlight = detectChange(
      currentOptions.reason ??
        pendingReason,
    ).finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  async function detectChange(reason) {
    const fingerprint =
      await fingerprintWorkspace(
        workspaceRoot,
      );
    const previous = state;
    lastCheckedAtMs = now().getTime();
    pendingReason = "poll";

    if (
      previous &&
      previous.id === fingerprint.id
    ) {
      state = {
        ...previous,
        checkedAt: now().toISOString(),
      };
      return state;
    }

    state = {
      id: fingerprint.id,
      sequence:
        (previous?.sequence ?? 0) + 1,
      detectedAt: now().toISOString(),
      checkedAt: now().toISOString(),
      reason,
      fingerprint,
    };

    if (previous) {
      const event = {
        previous,
        current: state,
        reason,
      };
      emitter.emit("change", event);
      logger({
        timestamp: now().toISOString(),
        level: "info",
        event:
          "workspace.revision.changed",
        previousRevision: previous.id,
        revision: state.id,
        sequence: state.sequence,
        reason,
      });
    } else {
      emitter.emit("ready", state);
    }

    return state;
  }

  async function start() {
    await current({
      force: true,
      reason: "startup",
    });

    if (!timer) {
      timer = setInterval(() => {
        current({
          force: true,
          reason: "poll",
        }).catch((error) => {
          logger({
            timestamp: now().toISOString(),
            level: "error",
            event:
              "workspace.revision.failed",
            message: error.message,
            code: error.code ?? null,
          });
        });
      }, pollIntervalMs);
      timer.unref();
    }

    return state;
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function invalidate(
    reason = "explicit-invalidation",
  ) {
    lastCheckedAtMs = 0;
    pendingReason = reason;
  }

  function onChange(listener) {
    emitter.on("change", listener);

    return () => {
      emitter.off("change", listener);
    };
  }

  return {
    current,
    start,
    stop,
    invalidate,
    onChange,
    get pollIntervalMs() {
      return pollIntervalMs;
    },
  };
}
