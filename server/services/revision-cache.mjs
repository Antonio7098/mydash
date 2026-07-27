export class RevisionCache {
  constructor(name, options = {}) {
    this.name = name;
    this.maxEntries =
      options.maxEntries ?? 32;
    this.entries = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      loads: 0,
      loadErrors: 0,
      evictions: 0,
      invalidations: 0,
    };
    this.lastInvalidationReason = null;
  }

  async get(key, revisionId, loader) {
    const existing = this.entries.get(key);

    if (
      existing &&
      existing.revisionId === revisionId
    ) {
      this.metrics.hits += 1;
      existing.lastAccessedAt = Date.now();
      this.touch(key, existing);
      return existing.promise;
    }

    this.metrics.misses += 1;
    this.metrics.loads += 1;

    const entry = {
      key,
      revisionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      promise: null,
    };

    entry.promise = Promise.resolve()
      .then(loader)
      .catch((error) => {
        if (this.entries.get(key) === entry) {
          this.entries.delete(key);
        }
        this.metrics.loadErrors += 1;
        throw error;
      });

    this.entries.set(key, entry);
    this.evictIfNeeded();

    return entry.promise;
  }

  delete(key) {
    return this.entries.delete(key);
  }

  clear(reason = "manual") {
    if (this.entries.size > 0) {
      this.metrics.invalidations += 1;
    }

    this.entries.clear();
    this.lastInvalidationReason = reason;
  }

  snapshot() {
    return {
      name: this.name,
      size: this.entries.size,
      maxEntries: this.maxEntries,
      metrics: {
        ...this.metrics,
      },
      lastInvalidationReason:
        this.lastInvalidationReason,
      entries: [...this.entries.values()].map(
        (entry) => ({
          key: entry.key,
          revisionId: entry.revisionId,
          ageMs:
            Date.now() - entry.createdAt,
          idleMs:
            Date.now() -
            entry.lastAccessedAt,
        }),
      ),
    };
  }

  touch(key, entry) {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  evictIfNeeded() {
    while (
      this.entries.size > this.maxEntries
    ) {
      const oldest =
        this.entries.keys().next().value;
      this.entries.delete(oldest);
      this.metrics.evictions += 1;
    }
  }
}
