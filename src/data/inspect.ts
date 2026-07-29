import { loadDataset, type Dataset, type LoadDatasetOptions } from "./load.js";

export type InspectDatasetResult = Pick<
  Dataset,
  | "source"
  | "displayPath"
  | "format"
  | "shape"
  | "rowCount"
  | "sampled"
  | "columns"
  | "sizeBytes"
  | "warnings"
> & {
  sampleRowCount: number;
  columnCount: number;
  sample: Dataset["records"];
};

export async function inspectDataset(
  path: string,
  options: LoadDatasetOptions = {},
): Promise<InspectDatasetResult> {
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