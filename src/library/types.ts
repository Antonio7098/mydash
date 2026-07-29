export type LibraryUser = string;

export type LibraryResourceKind =
  | "ui"
  | "theme"
  | "preset"
  | "asset"
  | "component"
  | "layout"
  | "primitive";

export type ArtifactKind =
  | "dashboard"
  | "presentation"
  | "concept";

export type LibraryCategory = "artifact" | "ui" | "theme" | "preset" | "asset";

export type ReferenceableKind = ArtifactKind | LibraryResourceKind;

export type ReferenceScope = "local" | "collection" | "core";

export type ReferenceLifecycle = "Local" | "Collection" | "Core";

export interface ManifestReference {
  id: string;
  kind: LibraryResourceKind | string;
}

export interface ArtifactManifest {
  $schema?: string | undefined;
  schemaVersion: number;
  id: string;
  kind: ArtifactKind | string;
  title: string;
  description?: string | undefined;
  user: LibraryUser;
  appearance?: {
    theme?: ManifestReference | null | undefined;
    preset?: ManifestReference | null | undefined;
    layout?: ManifestReference | null | undefined;
    components?: ManifestReference[] | undefined;
    primitives?: ManifestReference[] | undefined;
    assetSlots?: Record<string, ManifestReference | string> | undefined;
    properties?: Record<string, unknown> | undefined;
    overrides?: Record<string, unknown> | undefined;
  } | null | undefined;
  data?: Record<string, unknown> | undefined;
  source?: Record<string, unknown> | undefined;
  entry?: string | undefined;
  [extension: string]: unknown;
}

export interface LibraryEntry {
  id: string;
  kind: string;
  category: LibraryCategory | string;
  title: string | null;
  summary?: string | undefined;
  lifecycle: ReferenceLifecycle;
  scope: ReferenceScope;
  placement: string;
  owner?: LibraryUser | null | undefined;
  thumbnail?: string | null | undefined;
  references?: ManifestReference[] | undefined;
  path: string;
  manifestPath: string;
  manifest: Record<string, unknown>;
  level: string | null;
  collection: string | null;
  ownerArtifact: string | null;
  user: string | null;
  directory: string;
  relativeDirectory: string;
  displayPath: string;
  rootKey: string;
  rootPath: string;
  contractValid: boolean;
  [extension: string]: unknown;
}

export interface LibrarySummaryEntry {
  id: string;
  kind: string;
  category: string;
  title: string | null;
  summary?: string | undefined;
  lifecycle: ReferenceLifecycle;
  scope: ReferenceScope;
  placement: string;
  owner?: LibraryUser | null | undefined;
  thumbnail?: string | null | undefined;
  manifestPath: string;
  level: string | null;
  collection: string | null;
  user: string | null;
  displayPath: string;
  ownerArtifact?: string | null;
}

export interface LibraryScan {
  workspaceRoot: string;
  config: Record<string, unknown>;
  entries: LibraryEntry[];
  references: CollectedLibraryReference[];
  diagnostics?: LibraryDiagnostic[];
  issues?: LibraryDiagnostic[];
  summary: ScanSummary;
}

export interface ScanSummary {
  entryCount: number;
  artifactCount: number;
  resourceCount: number;
  errorCount: number;
  warningCount: number;
  byKind: Record<string, number>;
}

export interface LibraryDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  path?: string | undefined;
  manifestPath?: string | undefined;
  [extension: string]: unknown;
}

export interface LibraryReference {
  id: string;
  kind: string;
  lifecycle: ReferenceLifecycle;
  scope: ReferenceScope;
  path?: string | undefined;
}

export type CollectedLibraryReference = LibraryReference & {
  sourceManifestPath: string;
  sourceId: string;
  sourceKind: string;
  sourceCategory: string;
  targetManifestPath?: string | undefined;
  targetId?: string | undefined;
};

export interface ConsumerLink {
  id: string;
  kind: string;
  title?: string | undefined;
  lifecycle?: ReferenceLifecycle | undefined;
  scope?: ReferenceScope | undefined;
  owner?: LibraryUser | null | undefined;
  path?: string | undefined;
  via?: string | undefined;
}

export interface DependencyLink {
  id: string;
  kind: string;
  lifecycle?: ReferenceLifecycle | undefined;
  scope?: ReferenceScope | undefined;
  path?: string | undefined;
}