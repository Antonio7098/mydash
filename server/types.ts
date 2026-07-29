export interface HttpErrorShape {
  status: number;
  code: string;
  message: string;
  details: unknown;
  hint?: string | null;
}

export interface RequestContextLocals {
  requestId: string;
  requestStartedAt: bigint;
}

export interface ServerLogger {
  (record: Record<string, unknown>): void;
}

export interface RevisionEvent {
  previous: WorkspaceRevision;
  current: WorkspaceRevision;
  reason: string;
}

export interface WorkspaceRevision {
  id: string;
  sequence: number;
  detectedAt: string;
  checkedAt: string;
  reason: string;
  fingerprint: Record<string, unknown>;
}

export interface RevisionService {
  current(options?: {
    force?: boolean;
    reason?: string;
  }): Promise<WorkspaceRevision>;
  start(): Promise<WorkspaceRevision>;
  stop(): void;
  invalidate(reason?: string): void;
  onChange(listener: (event: RevisionEvent) => void): () => void;
  readonly pollIntervalMs: number;
}

export interface LibraryScanLike {
  workspaceRoot: string;
  config: Record<string, unknown>;
  entries: LibraryEntryLike[];
  references: LibraryReferenceLike[];
  diagnostics?: unknown[];
  issues?: LibraryDiagnosticLike[];
  summary: ScanSummaryLike;
}

export interface ScanSummaryLike {
  entryCount: number;
  artifactCount: number;
  resourceCount: number;
  errorCount: number;
  warningCount: number;
  byKind: Record<string, number>;
}

export interface LibraryEntryLike {
  id: string;
  kind: string;
  category: string;
  title: string | null;
  manifest: Record<string, unknown>;
  manifestPath: string;
  displayPath: string;
  level: string | null;
  collection: string | null;
  ownerArtifact: string | null;
  user: string | null;
  path?: string;
  directory?: string;
  relativeDirectory?: string;
  rootKey?: string;
  rootPath?: string;
  placement?: string;
  lifecycle?: string;
  scope?: string;
  contractValid?: boolean;
  [extension: string]: unknown;
}

export interface LibraryReferenceLike {
  sourceManifestPath: string;
  sourceId: string;
  sourceKind: string;
  sourceCategory: string;
  value?: string;
  targetKind?: string;
  field?: string;
  targetManifestPath?: string;
  targetId?: string;
  reference?: string;
}

export interface LibraryDiagnosticLike {
  severity: string;
  code: string;
  message: string;
  manifestPath?: string;
  targetManifestPath?: string;
  sourceManifestPath?: string;
  [extension: string]: unknown;
}

export interface ConsumerGraphLike {
  incoming: Map<string, ConsumerEdgeLike[]>;
  outgoing: Map<string, ConsumerEdgeLike[]>;
}

export interface ConsumerEdgeLike {
  source: ConsumerTargetLike;
  target: ConsumerTargetLike | { id: string; kind: string; manifestPath: null };
  field: string;
  reference: string;
  resolved: boolean;
}

export interface ConsumerTargetLike {
  id: string;
  kind: string;
  category: string;
  title: string | null;
  level: string | null;
  collection: string | null;
  ownerArtifact: string | null;
  user: string | null;
  displayPath: string | null;
  manifestPath: string | null;
}

export interface LibraryService {
  snapshot(): Promise<LibraryServiceSnapshot>;
  list(
    filters?: Record<string, string | undefined>,
  ): Promise<LibraryServiceSnapshot & {
    entries: LibraryEntryLike[];
    filters: Record<string, string | undefined>;
  }>;
  inspect(
    kind: string,
    id: string,
  ): Promise<LibraryServiceSnapshot & {
    matches: LibraryEntryLike[];
    graph: ConsumerGraphLike;
  }>;
  consumersFor(entry: LibraryEntryLike, graph: ConsumerGraphLike): ConsumerEdgeLike[];
  dependenciesFor(entry: LibraryEntryLike, graph: ConsumerGraphLike): ConsumerEdgeLike[];
}

export interface LibraryServiceSnapshot {
  revision: WorkspaceRevision;
  scan: LibraryScanLike;
}

export interface PreviewBuilt {
  html: string;
  sizeBytes: number;
  sha256: string;
  validation: unknown;
  resources: unknown;
  warnings: unknown[];
}

export interface PreviewOptions {
  minify?: boolean;
  maxBytes?: number;
  appearance?: unknown;
  user?: string | null;
}

export interface ArtifactDetailResult {
  revision: WorkspaceRevision;
  scan: LibraryScanLike;
  user: string | null;
  sourceArtifact: LibraryEntryLike & { manifest: Record<string, unknown> };
  artifact: LibraryEntryLike & { manifest: Record<string, unknown> };
  appearance: unknown;
  resolution: ArtifactAppearanceResolutionLike;
}

export interface ArtifactListResult {
  revision: WorkspaceRevision;
  scan: LibraryScanLike;
  user: string | null;
  artifacts: LibraryEntryLike[];
}

export interface ArtifactUsersResult {
  revision: WorkspaceRevision;
  scan: LibraryScanLike;
  currentUser: string | null;
  users: string[];
}

export interface ArtifactAppearanceOptionsResult {
  revision: WorkspaceRevision;
  scan: LibraryScanLike;
  user: string | null;
  sourceArtifact: LibraryEntryLike & { manifest: Record<string, unknown> };
  artifact: LibraryEntryLike & { manifest: Record<string, unknown> };
  appearance: unknown;
  resolution: ArtifactAppearanceResolutionLike;
  controls: AppearanceControlsLike;
}

export interface AppearanceControlsLike {
  current: unknown;
  options: {
    themes: unknown[];
    presets: unknown[];
    layouts: unknown[];
    components: Record<string, unknown[]>;
    primitives: Record<string, unknown[]>;
    assets: unknown[];
  };
  slots: {
    components: string[];
    primitives: string[];
    assets: string[];
  };
}

export interface ArtifactPreviewResult {
  revision: WorkspaceRevision;
  scan: LibraryScanLike;
  user: string | null;
  sourceArtifact: LibraryEntryLike & { manifest: Record<string, unknown> };
  artifact: LibraryEntryLike & { manifest: Record<string, unknown> };
  appearance: unknown;
  resolution: ArtifactAppearanceResolutionLike;
  built: PreviewBuilt;
  cacheKey: string;
}

export interface ArtifactSaveAppearanceResult {
  artifact: LibraryEntryLike & { manifest: Record<string, unknown> };
  appearance: unknown;
  resolution: ArtifactAppearanceResolutionLike;
  export: {
    ready: boolean;
    sizeBytes?: number;
    sha256?: string;
    validation?: unknown;
    warnings?: unknown[];
  };
  checkpoint: unknown;
  revision: WorkspaceRevision;
}

export interface ArtifactService {
  list(user?: string | null): Promise<ArtifactListResult>;
  users(): Promise<ArtifactUsersResult>;
  get(
    kind: string,
    id: string,
    appearance?: unknown,
    user?: string | null,
  ): Promise<ArtifactDetailResult>;
  appearanceOptions(
    kind: string,
    id: string,
    user?: string | null,
  ): Promise<ArtifactAppearanceOptionsResult>;
  preview(
    kind: string,
    id: string,
    options?: PreviewOptions,
  ): Promise<ArtifactPreviewResult>;
  saveAppearance(
    kind: string,
    id: string,
    request: { appearance: unknown; expectedRevision: string },
    user?: string | null,
  ): Promise<ArtifactSaveAppearanceResult>;
}

export interface ArtifactAppearanceResolutionLike {
  artifact: ConsumerTargetLike;
  selections: {
    theme: ResolvedSelectionLike | null;
    preset: ResolvedSelectionLike | null;
    layout: ResolvedSelectionLike | null;
    components: Record<string, ResolvedSelectionLike | null>;
    primitives: Record<string, ResolvedSelectionLike | null>;
    assets: Record<string, ResolvedSelectionLike | null>;
  };
  dependencyClosure: ConsumerTargetLike[];
  edges: {
    source: ConsumerTargetLike;
    target: ConsumerTargetLike;
    field: string;
    reference: string;
  }[];
  issues: unknown[];
  summary: {
    valid: boolean;
    errorCount: number;
    warningCount: number;
    dependencyCount: number;
  };
}

export interface ResolvedSelectionLike {
  reference: string;
  source: string;
  field: string;
  resolved: boolean;
  entry: ConsumerTargetLike | null;
}

export interface ValidationServiceOptions {
  artifactId?: string | null;
  artifactKind?: string | null;
  validateExports?: boolean;
  validateRecipes?: boolean;
  minify?: boolean;
  maxBytes?: number;
  failOnWarning?: boolean;
}

export interface ValidationServiceResult {
  revision: WorkspaceRevision;
  report: unknown;
  cacheKey: string;
}

export interface ValidationService {
  validate(options: ValidationServiceOptions): Promise<ValidationServiceResult>;
}

export interface GitStatusResult {
  available: boolean;
  [extension: string]: unknown;
}

export interface GitService {
  status(): Promise<GitStatusResult>;
}

export interface ReadinessServiceResult {
  revision: WorkspaceRevision;
  report: unknown;
}

export interface StateServiceResult {
  revision: WorkspaceRevision;
  pollIntervalMs: number;
  caches: Record<string, unknown>;
}

export interface ServiceBundle {
  revision: RevisionService;
  library: LibraryService;
  artifacts: ArtifactService;
  validation: ValidationService;
  git: GitService;
  readiness(): Promise<ReadinessServiceResult>;
  state(): Promise<StateServiceResult>;
  start(): Promise<WorkspaceRevision>;
  close(): Promise<void>;
}

export interface RouteContext {
  workspaceRoot: string;
  navigatorRoot: string;
  config: {
    id?: string | null;
    name: string;
    preview?: { host?: string; port?: number };
    [extension: string]: unknown;
  };
  packageMetadata: { name: string; version: string };
  now: () => Date;
  startedAt: Date;
  logger: ServerLogger;
  services: ServiceBundle;
}

export interface ApplicationOptions {
  workspaceRoot: string;
  navigatorRoot?: string;
  now?: () => Date;
  logger?: ServerLogger;
  config?: RouteContext["config"];
  packageMetadata?: { name: string; version: string };
  startedAt?: Date;
  services?: ServiceBundle;
  revisionPollIntervalMs?: number;
  minimumRevisionCheckIntervalMs?: number;
}

export interface Application {
  app: import("express").Express;
  context: RouteContext;
  close(): Promise<void>;
}

export interface StartServerOptions {
  workspaceRoot?: string;
  host?: string;
  port?: number | string;
  logger?: ServerLogger;
  now?: () => Date;
  revisionPollIntervalMs?: number;
  minimumRevisionCheckIntervalMs?: number;
  installSignalHandlers?: boolean;
}

export interface StartedServer {
  server: import("node:http").Server;
  app: import("express").Express;
  context: RouteContext;
  host: string;
  port: number;
  url: string;
  close(signal?: string): Promise<void>;
}

export interface RevisionCacheSnapshot {
  name: string;
  size: number;
  maxEntries: number;
  metrics: {
    hits: number;
    misses: number;
    loads: number;
    loadErrors: number;
    evictions: number;
    invalidations: number;
  };
  lastInvalidationReason: string | null;
  entries: {
    key: string;
    revisionId: string;
    ageMs: number;
    idleMs: number;
  }[];
}

export interface RevisionCacheOptions {
  maxEntries?: number;
}

export interface RevisionCacheInterface<T> {
  get(
    key: string,
    revisionId: string,
    loader: () => Promise<T> | T,
  ): Promise<T>;
  delete(key: string): boolean;
  clear(reason?: string): void;
  snapshot(): RevisionCacheSnapshot;
}