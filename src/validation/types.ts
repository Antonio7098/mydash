import type {
  LibraryEntry,
  LibrarySummaryEntry,
} from "../library/types.js";

export type ValidationSeverity = "info" | "warning" | "error";

export type ValidationStageStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "pending";

export interface ValidationStage {
  id?: string | undefined;
  label?: string | undefined;
  status: ValidationStageStatus;
  artifactCount?: number | undefined;
  entryCount?: number | undefined;
  recipeCount?: number | undefined;
  sourceCount?: number | undefined;
  validatedCount?: number | undefined;
  skippedCount?: number | undefined;
  errorCount: number;
  warningCount: number;
  diagnostics?: ValidationIssue[] | undefined;
  summary?: string | undefined;
  durationMs?: number | undefined;
  entries?: LibraryEntry[] | undefined;
}

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string | undefined;
  stage?: string | undefined;
  artifactId?: string | undefined;
  artifactKind?: string | undefined;
  sourceId?: string | undefined;
  policyPath?: string | undefined;
  recipePath?: string | undefined;
  recipeId?: string | undefined;
  [extension: string]: unknown;
}

export interface ValidationReport {
  ok: boolean;
  stages: Record<string, ValidationStage>;
  diagnostics: ValidationIssue[];
  summary?: {
    valid: boolean;
    errorCount: number;
    warningCount: number;
    entryCount?: number | undefined;
    resourceCount?: number | undefined;
    artifactCount?: number | undefined;
    recipeCount?: number | undefined;
    sourceCount?: number | undefined;
    exportValidatedCount?: number | undefined;
    exportFailedCount?: number | undefined;
  } | null;
}

export type ImpactRisk = "low" | "medium" | "high";

export interface ImpactTarget {
  id: string;
  kind: string;
  category: string;
  title: string | null;
  level: string;
  collection: string | null;
  ownerArtifact: string | null;
  user: string | null;
  contractVersion: number | null;
  slot: string | null;
  displayPath: string;
  manifestPath: string;
  manifestPathAlt?: string;
  lifecycle: "Local" | "Collection" | "Core";
  scope: "local" | "collection" | "core";
  placement: string;
}

export interface ImpactReport {
  target: ImpactTarget;
  changeType: string;
  directConsumers: unknown[];
  transitiveConsumers: unknown[];
  affectedArtifacts: LibrarySummaryEntry[];
  affectedResources: LibrarySummaryEntry[];
  edges: unknown[];
  recommendations: string[];
  summary: {
    scope: string;
    risk: ImpactRisk;
    directConsumerCount: number;
    transitiveConsumerCount: number;
    affectedArtifactCount: number;
    affectedResourceCount: number;
  };
}