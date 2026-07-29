interface CapabilityFeature {
  id: string;
  title: string;
  available: boolean;
  [extension: string]: unknown;
}

export interface CapabilitiesDocument {
  schemaVersion: number;
  product: { name: string; version: string };
  runtime: {
    node: string;
    readOnlyHttp: boolean;
    mutationScope: string[];
  };
  features: CapabilityFeature[];
}

export interface WorkspaceCapabilitiesOptions {
  name?: string;
  version?: string;
}

const FEATURES: CapabilityFeature[] = [
  {
    id: "office.excel",
    title: "Excel inspection",
    available: true,
    formats: ["xlsx", "xlsm"],
  },
  {
    id: "office.powerpoint",
    title: "PowerPoint inspection",
    available: true,
    formats: ["pptx", "pptm"],
  },
  {
    id: "data.utilities",
    title: "CSV, JSON and NDJSON utilities",
    available: true,
    formats: ["csv", "json", "ndjson", "jsonl"],
  },
  {
    id: "data.refresh",
    title: "Snapshot-based artefact data refresh",
    available: true,
    acquisitionModes: ["manual", "live-local"],
    qualityGates: true,
    atomicPublication: true,
    provenance: true,
    freshnessStatus: true,
  },
  {
    id: "library.discovery",
    title: "Filesystem library discovery",
    available: true,
  },
  {
    id: "appearance.resolution",
    title: "Appearance and dependency resolution",
    available: true,
  },
  {
    id: "artifact.standalone-export",
    title: "Standalone HTML export",
    available: true,
    fileProtocolCompatible: true,
  },
  {
    id: "workspace.validation",
    title: "Consolidated validation",
    available: true,
  },
  {
    id: "navigator.live-state",
    title: "Live filesystem revision detection",
    available: true,
    serverSentEvents: true,
    conditionalRequests: true,
  },
  {
    id: "server.cache",
    title: "Revision-aware scan and preview caching",
    available: true,
    exposedOverHttp: true,
  },
  {
    id: "workspace.readiness",
    title: "First-run and release readiness",
    available: true,
    gitOptionalForBrowse: true,
    standaloneExportChecks: true,
  },
  {
    id: "navigator.library-browser",
    title: "Visual UI library browser",
    available: true,
    resourceKinds: ["theme", "preset", "layout", "component", "primitive", "asset"],
    lifecycleLevels: ["core", "collection", "local"],
    deepLinks: true,
  },
  {
    id: "navigator.appearance-controls",
    title: "Scoped appearance controls",
    available: true,
    scopes: ["preview", "personal", "artifact-default"],
    safeCheckpoint: true,
  },
  {
    id: "navigator.viewer-controls",
    title: "Dedicated artefact viewer controls",
    available: true,
    controls: ["reload", "fullscreen", "details", "shortcuts"],
    exportStatus: true,
    dependencyDetails: true,
  },
  {
    id: "navigator.artifact-gallery",
    title: "Live artefact gallery and viewer",
    available: true,
    lazyPreviews: true,
    viewerRoutes: true,
    downloadEndpoint: true,
  },
  {
    id: "navigator.ui-shell",
    title: "Human-facing navigator shell",
    available: true,
    routes: ["/", "/dashboards", "/presentations", "/concepts", "/components"],
    liveRevisionEvents: true,
  },
  {
    id: "artifact.reference-dashboard",
    title: "Reference governance dashboard",
    available: true,
    artifactId: "ai-use-case-governance",
    artifactKind: "dashboard",
    standaloneExport: true,
  },
  {
    id: "library.minimal-core",
    title: "Minimal reusable Core library",
    available: true,
    resourceCount: 8,
    defaultTheme: "hsbc-light",
    defaultPreset: "default",
    brandAsset: "mydash-brand-mark",
  },
  {
    id: "agent.skills",
    title: "Project agent skills",
    available: true,
    logicalSkillCount: 9,
    commandCount: 10,
    activeDirectory: ".claude/skills",
  },
  {
    id: "git.checkpoint",
    title: "Constrained Git checkpoints",
    available: true,
    exposedOverHttp: false,
  },
];

export function getWorkspaceCapabilities(
  options: WorkspaceCapabilitiesOptions = {},
): CapabilitiesDocument {
  return {
    schemaVersion: 1,
    product: {
      name: options.name ?? "My Dashboards",
      version: options.version ?? "0.0.0",
    },
    runtime: {
      node: process.versions.node,
      readOnlyHttp: false,
      mutationScope: ["artifact.appearance"],
    },
    features: FEATURES,
  };
}