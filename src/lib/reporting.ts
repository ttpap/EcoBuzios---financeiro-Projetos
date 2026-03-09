import { utils, writeFile } from "xlsx";

export function downloadXlsxFromRows(
  fileName: string,
  sheetName: string,
  rows: Array<Record<string, any>>
) {
  const ws = utils.json_to_sheet(rows);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, sheetName);
  writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

export function formatPercent(value01: number) {
  if (!Number.isFinite(value01)) return "-";
  return `${Math.round(value01 * 100)}%`;
}
