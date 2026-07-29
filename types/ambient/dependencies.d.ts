import type { default as ExcelJSType } from "exceljs";

declare module "exceljs" {
  const ExcelJS: typeof ExcelJSType;
  export default ExcelJS;
}

declare module "fflate" {
  export function unzipSync(data: Uint8Array, opts?: { filename?: (rel: string) => boolean }): Record<string, Uint8Array>;
  export function unzipSync(data: Uint8Array, opts?: { filename?: (rel: string) => boolean }, out?: Record<string, Uint8Array>): Record<string, Uint8Array>;
  export function strFromU8(data: Uint8Array): string;
  export function strToU8(data: string): Uint8Array;
}