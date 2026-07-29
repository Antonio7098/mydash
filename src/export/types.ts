import type { ArtifactManifest } from "../library/types.js";

export interface ArtifactEntry {
  id: string;
  kind: string;
  title: string | null;
  displayPath: string | null;
  directory: string;
  manifestPath: string;
  manifest: ArtifactManifest;
}