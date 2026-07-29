declare module "../../ui/viewer-model.js" {
  export function viewerShortcutAction(value: unknown): string | null;
  export function formatBytes(value: number): string;
  export function shortHash(value: string, length: number): string;
  export function selectedAppearance(value: unknown): {
    theme: string;
    preset: string;
    layout: string;
  };
  export function dependencyGroups(value: unknown): Array<{
    kind: string;
    entries: Array<{ id: string }>;
  }>;
  export function exportReadiness(value: unknown): {
    mode: string;
    label: string;
  };
  export function exportResourceRows(value: unknown): string[][];
}

declare module "../../ui/appearance-model.js" {
  interface Appearance {
    theme: string | null;
    preset: string | null;
    overrides: {
      layout?: string | null;
      components?: Record<string, string>;
      primitives?: Record<string, string>;
      assets?: Record<string, string>;
    };
  }

  interface Storage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  }

  export function appearanceEqual(first: Appearance, second: Appearance): boolean;
  export function clearPersonalAppearance(storage: Storage, artifact: unknown): void;
  export function normaliseBrowserAppearance(value: Appearance): Appearance;
  export function personalAppearanceKey(artifact: unknown): string;
  export function readPersonalAppearance(storage: Storage, artifact: unknown): Appearance | null;
  export function withAppearanceQuery(path: string, appearance: Appearance): string;
  export function writePersonalAppearance(storage: Storage, artifact: unknown, appearance: Appearance): Appearance;
}

declare module "../../ui/gallery-model.js" {
  interface Artifact {
    id: string;
    kind: string;
    title?: string;
    user?: string;
  }

  export function artifactDownloadPath(artifact: Artifact): string;
  export function artifactPreviewPath(artifact: Artifact): string;
  export function artifactViewerPath(artifact: Artifact): string;
  export function categoryPathForKind(kind: string): string;
  export function galleryVariantForArtifact(artifact: Artifact): string;
  export function kindLabel(kind: string): string;
  export function sortArtifacts(artifacts: Artifact[]): Artifact[];
}

declare module "../../ui/router.js" {
  interface Route {
    id: string;
    path: string;
    category?: string;
    params?: Record<string, string>;
  }

  export const NAVIGATOR_ROUTES: Route[];
  export function isNavigatorPath(path: string): boolean;
  export function normaliseNavigatorPath(path: string): string;
  export function routeForId(id: string): Route;
  export function routeForPath(path: string): Route;
}

declare module "../../ui/library-model.js" {
  interface LibraryEntry {
    id: string;
    kind: string;
    name: string;
    description: string;
    reference: string;
    level: string;
    slot: string;
    variants: Record<string, string[]>;
    supportedThemes?: string[];
    ownerArtifact?: string;
  }

  export function consumerTargetPath(value: unknown): string;
  export function dependencyTargetPath(value: unknown): string | null;
  export function filterLibraryEntries(entries: LibraryEntry[], filters?: unknown): LibraryEntry[];
  export function libraryCounts(entries: LibraryEntry[]): unknown;
  export function libraryEntryPath(entry: LibraryEntry): string;
  export function lifecycleLabel(entry: LibraryEntry): string;
  export function presetMappingRows(value: unknown): Array<{ group: string; slot: string; reference: string }>;
  export function propRows(value: unknown): Array<{ name: string }>;
  export function themeTokenRows(value: unknown): Array<{ name: string; colour: boolean }>;
}

declare module "../../ui/readiness-model.js" {
  export function readinessProgress(value: unknown): {
    total: number;
    percentage: number;
  };
  export function readinessTitle(value: unknown): string;
}

declare module "../../library/dashboards/ai-use-case-governance/src/model.js" {
  interface UseCase {
    id: string;
    risk: string;
  }

  interface Portfolio {
    useCases: UseCase[];
  }

  export function calculateSummary(value: UseCase[]): unknown;
  export function countByStage(value: UseCase[]): Array<{ id: string; count: number }>;
  export function filterUseCases(value: UseCase[], filters: unknown): UseCase[];
  export function formatDate(value: string): string;
  export function normalisePortfolio(value: unknown): Portfolio;
  export function owners(value: UseCase[]): string[];
  export function riskTone(value: string): string;
  export function statusTone(value: string): string;
}
