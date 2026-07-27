import { loadDataset } from "./load.mjs";

export async function inspectDataset(path, options = {}) {
  const dataset = await loadDataset(path, options);

  return {
    source: dataset.source,
    displayPath: dataset.displayPath,
    format: dataset.format,
    shape: dataset.shape,
    rowCount: dataset.rowCount,
    sampled: dataset.sampled,
    sampleRowCount: dataset.records.length,
    columnCount: dataset.columns.length,
    columns: dataset.columns,
    sizeBytes: dataset.sizeBytes,
    sample: dataset.records.slice(0, 10),
    warnings: dataset.warnings,
  };
}
