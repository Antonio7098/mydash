import type { LibraryUser } from "../library/types.js";
import type { ValidationReport } from "../validation/types.js";

export interface PreviewConfig {
  host?: string;
  port?: number;
}

export interface LibraryConfig {
  roots?: string[];
}

export interface WorkspaceConfig {
  $schema?: string;
  schemaVersion: number;
  name: string;
  description?: string;
  user: LibraryUser;
  library?: LibraryConfig;
  preview?: PreviewConfig;
  data?: Record<string, unknown>;
  [extension: string]: unknown;
}

export interface PackageMetadata {
  name: string;
  version: string;
}

export interface WorkspaceCapabilities {
  schemaVersion: number;
  workspace: { name: string; version: string };
  features: string[];
}

export interface ReadinessCheck {
  id: string;
  label: string;
  required: boolean;
  status: "pass" | "fail" | "unavailable";
  state?: "passed" | "warning" | "failed";
  action?: string;
  value?: unknown;
  message: string;
}

export interface ReadinessReport {
  healthy: boolean;
  workspaceRoot: string | null;
  user: LibraryUser | null;
  checks: ReadinessCheck[];
  warnings: { code: string; message: string }[];
  validation?: ValidationReport | null;
}