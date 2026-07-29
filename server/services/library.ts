import {
  buildConsumerGraph,
  consumersForEntry,
  dependenciesForEntry,
} from "../../src/library/consumers.js";
import {
  findLibraryEntries,
  scanWorkspaceLibrary,
} from "../../src/library/scan.js";
import { RevisionCache } from "./revision-cache.js";
import type {
  ConsumerGraphLike,
  ConsumerEdgeLike,
  LibraryEntryLike,
  LibraryScanLike,
  LibraryService,
  LibraryServiceSnapshot,
  RevisionService,
  WorkspaceRevision,
} from "../types.js";

export interface LibraryServiceOptions {
  workspaceRoot: string;
  revision: RevisionService;
  cache: RevisionCache<LibraryScanLike>;
}

interface ListResult extends LibraryServiceSnapshot {
  entries: LibraryEntryLike[];
  filters: Record<string, string | undefined>;
}

interface InspectResult extends LibraryServiceSnapshot {
  matches: LibraryEntryLike[];
  graph: ConsumerGraphLike;
}

export function createLibraryService(
  options: LibraryServiceOptions,
): LibraryService {
  const { workspaceRoot, revision, cache } = options;

  async function snapshot(): Promise<LibraryServiceSnapshot> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before: WorkspaceRevision = await revision.current();
      const scan: LibraryScanLike = await cache.get(
        "workspace-scan",
        before.id,
        () =>
          scanWorkspaceLibrary(
            workspaceRoot,
          ) as unknown as Promise<LibraryScanLike>,
      );
      const after: WorkspaceRevision = await revision.current({
        force: true,
        reason: "scan-consistency-check",
      });

      if (before.id === after.id) {
        return {
          revision: after,
          scan,
        };
      }

      cache.clear("workspace-changed-during-scan");
    }

    const error = new Error(
      "The workspace changed repeatedly while the library was being scanned.",
    ) as Error & { code: string };
    error.code = "WORKSPACE_CHANGED_DURING_READ";
    throw error;
  }

  async function list(
    filters: Record<string, string | undefined> = {},
  ): Promise<ListResult> {
    const value = await snapshot();

    return {
      ...value,
      entries: findLibraryEntries(
        value.scan.entries as never,
        filters as never,
      ) as unknown as LibraryEntryLike[],
      filters,
    };
  }

  async function inspect(
    kind: string,
    id: string,
  ): Promise<InspectResult> {
    const value = await snapshot();
    const matches = value.scan.entries.filter(
      (entry: LibraryEntryLike) =>
        entry.id === id &&
        (entry.kind === kind || entry.category === kind),
    );

    return {
      ...value,
      matches,
      graph: buildConsumerGraph(
        value.scan as never,
      ) as unknown as ConsumerGraphLike,
    };
  }

  function consumersFor(
    entry: LibraryEntryLike,
    graph: ConsumerGraphLike,
  ): ConsumerEdgeLike[] {
    return consumersForEntry(
      entry as never,
      graph as never,
    ) as unknown as ConsumerEdgeLike[];
  }

  function dependenciesFor(
    entry: LibraryEntryLike,
    graph: ConsumerGraphLike,
  ): ConsumerEdgeLike[] {
    return dependenciesForEntry(
      entry as never,
      graph as never,
    ) as unknown as ConsumerEdgeLike[];
  }

  return {
    snapshot,
    list,
    inspect,
    consumersFor,
    dependenciesFor,
  };
}