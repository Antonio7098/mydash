import type {
  RevisionCacheInterface,
  RevisionCacheOptions,
  RevisionCacheSnapshot,
} from "../types.js";

interface RevisionCacheEntry<T> {
  key: string;
  revisionId: string;
  createdAt: number;
  lastAccessedAt: number;
  promise: Promise<T>;
}

interface RevisionCacheMetrics {
  hits: number;
  misses: number;
  loads: number;
  loadErrors: number;
  evictions: number;
  invalidations: number;
}

export class RevisionCache<T = unknown> implements RevisionCacheInterface<T> {
  public readonly name: string;
  public readonly maxEntries: number;
  private readonly entries: Map<string, RevisionCacheEntry<T>>;
  private readonly metrics: RevisionCacheMetrics;
  private lastInvalidationReason: string | null;

  constructor(name: string, options: RevisionCacheOptions = {}) {
    this.name = name;
    this.maxEntries = options.maxEntries ?? 32;
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

  async get(
    key: string,
    revisionId: string,
    loader: () => Promise<T> | T,
  ): Promise<T> {
    const existing = this.entries.get(key);

    if (existing && existing.revisionId === revisionId) {
      this.metrics.hits += 1;
      existing.lastAccessedAt = Date.now();
      this.touch(key, existing);
      return existing.promise;
    }

    this.metrics.misses += 1;
    this.metrics.loads += 1;

    const entry: RevisionCacheEntry<T> = {
      key,
      revisionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      promise: Promise.resolve().then(loader),
    };

    entry.promise = entry.promise.catch((error: unknown) => {
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

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(reason: string = "manual"): void {
    if (this.entries.size > 0) {
      this.metrics.invalidations += 1;
    }

    this.entries.clear();
    this.lastInvalidationReason = reason;
  }

  snapshot(): RevisionCacheSnapshot {
    return {
      name: this.name,
      size: this.entries.size,
      maxEntries: this.maxEntries,
      metrics: {
        ...this.metrics,
      },
      lastInvalidationReason: this.lastInvalidationReason,
      entries: [...this.entries.values()].map((entry) => ({
        key: entry.key,
        revisionId: entry.revisionId,
        ageMs: Date.now() - entry.createdAt,
        idleMs: Date.now() - entry.lastAccessedAt,
      })),
    };
  }

  private touch(key: string, entry: RevisionCacheEntry<T>): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
      this.metrics.evictions += 1;
    }
  }
}