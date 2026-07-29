import { EventEmitter } from "node:events";
import { fingerprintWorkspace } from "../../src/files/workspace-fingerprint.js";
import type {
  RevisionEvent,
  RevisionService,
  ServerLogger,
  WorkspaceRevision,
} from "../types.js";

export interface WorkspaceRevisionServiceOptions {
  workspaceRoot: string;
  pollIntervalMs?: number;
  minimumCheckIntervalMs?: number;
  now?: () => Date;
  logger?: ServerLogger;
}

interface CurrentOptions {
  force?: boolean;
  reason?: string;
}

export function createWorkspaceRevisionService(
  options: WorkspaceRevisionServiceOptions,
): RevisionService {
  const emitter = new EventEmitter();
  const workspaceRoot = options.workspaceRoot;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const minimumCheckIntervalMs =
    options.minimumCheckIntervalMs ?? 200;
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? (() => {});

  let state: WorkspaceRevision | null = null;
  let inFlight: Promise<WorkspaceRevision> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastCheckedAtMs = 0;
  let pendingReason = "initial";

  async function current(
    currentOptions: CurrentOptions = {},
  ): Promise<WorkspaceRevision> {
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

    const reason = currentOptions.reason ?? pendingReason;
    inFlight = detectChange(reason).finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  async function detectChange(
    reason: string,
  ): Promise<WorkspaceRevision> {
    const fingerprint = await fingerprintWorkspace(workspaceRoot);
    const previous = state;
    lastCheckedAtMs = now().getTime();
    pendingReason = "poll";

    if (previous && previous.id === fingerprint.id) {
      const refreshed: WorkspaceRevision = {
        ...previous,
        checkedAt: now().toISOString(),
      };
      state = refreshed;
      return refreshed;
    }

    const next: WorkspaceRevision = {
      id: fingerprint.id,
      sequence: (previous?.sequence ?? 0) + 1,
      detectedAt: now().toISOString(),
      checkedAt: now().toISOString(),
      reason,
      fingerprint: fingerprint as unknown as Record<string, unknown>,
    };

    state = next;

    if (previous) {
      const event: RevisionEvent = {
        previous,
        current: next,
        reason,
      };
      emitter.emit("change", event);
      logger({
        timestamp: now().toISOString(),
        level: "info",
        event: "workspace.revision.changed",
        previousRevision: previous.id,
        revision: next.id,
        sequence: next.sequence,
        reason,
      });
    } else {
      emitter.emit("ready", next);
    }

    return next;
  }

  async function start(): Promise<WorkspaceRevision> {
    await current({
      force: true,
      reason: "startup",
    });

    if (!timer) {
      timer = setInterval(() => {
        current({
          force: true,
          reason: "poll",
        }).catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          const code =
            error instanceof Error && "code" in error
              ? (error as Error & { code?: string }).code ?? null
              : null;
          logger({
            timestamp: now().toISOString(),
            level: "error",
            event: "workspace.revision.failed",
            message,
            code,
          });
        });
      }, pollIntervalMs);
      timer.unref();
    }

    return state as WorkspaceRevision;
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function invalidate(reason: string = "explicit-invalidation"): void {
    lastCheckedAtMs = 0;
    pendingReason = reason;
  }

  function onChange(
    listener: (event: RevisionEvent) => void,
  ): () => void {
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