import {
  buildConsumerGraph,
  consumersForEntry,
  dependenciesForEntry,
} from "../../src/library/consumers.mjs";
import {
  findLibraryEntries,
  scanWorkspaceLibrary,
} from "../../src/library/scan.mjs";

export function createLibraryService(
  options,
) {
  const {
    workspaceRoot,
    revision,
    cache,
  } = options;

  async function snapshot() {
    for (
      let attempt = 0;
      attempt < 2;
      attempt += 1
    ) {
      const before =
        await revision.current();
      const scan = await cache.get(
        "workspace-scan",
        before.id,
        () =>
          scanWorkspaceLibrary(
            workspaceRoot,
          ),
      );
      const after =
        await revision.current({
          force: true,
          reason:
            "scan-consistency-check",
        });

      if (before.id === after.id) {
        return {
          revision: after,
          scan,
        };
      }

      cache.clear(
        "workspace-changed-during-scan",
      );
    }

    const error = new Error(
      "The workspace changed repeatedly while the library was being scanned.",
    );
    error.code =
      "WORKSPACE_CHANGED_DURING_READ";
    throw error;
  }

  async function list(filters = {}) {
    const value = await snapshot();

    return {
      ...value,
      entries: findLibraryEntries(
        value.scan.entries,
        filters,
      ),
      filters,
    };
  }

  async function inspect(kind, id) {
    const value = await snapshot();
    const matches =
      value.scan.entries.filter(
        (entry) =>
          entry.id === id &&
          (entry.kind === kind ||
            entry.category === kind),
      );

    return {
      ...value,
      matches,
      graph: buildConsumerGraph(
        value.scan,
      ),
    };
  }

  return {
    snapshot,
    list,
    inspect,
    consumersFor(entry, graph) {
      return consumersForEntry(
        entry,
        graph,
      );
    },
    dependenciesFor(entry, graph) {
      return dependenciesForEntry(
        entry,
        graph,
      );
    },
  };
}
