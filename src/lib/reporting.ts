import { utils, writeFile, type WorkBook, type WorkSheet } from "xlsx-js-style";

type SheetSpec = {
  name: string;
  rows: Array<Record<string, any>>;
};

function toSafeSheetName(name: string) {
  // Excel: max 31 chars, cannot contain : \ / ? * [ ]
  const cleaned = name.replace(/[:\\/?*\[\]]/g, " ").trim();
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned || "Planilha";
}

function computeColWidths(rows: Array<Record<string, any>>) {
  const headers = Object.keys(rows[0] ?? {});
  const widths = headers.map((h) => Math.max(10, String(h).length + 2));

  for (const r of rows) {
    headers.forEach((h, idx) => {
      const v = (r as any)[h];
      const s =
        v == null
          ? ""
          : typeof v === "number"
            ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : String(v);
      widths[idx] = Math.max(widths[idx], Math.min(60, s.length + 2));
    });
  }

  return widths.map((wch) => ({ wch }));
}

const BORDER_COLOR = "D9D9D9";

const baseCellStyle = {
  font: { color: { rgb: "1F2937" } },
  alignment: { vertical: "top", wrapText: true },
  border: {
    top: { style: "thin", color: { rgb: BORDER_COLOR } },
    bottom: { style: "thin", color: { rgb: BORDER_COLOR } },
    left: { style: "thin", color: { rgb: BORDER_COLOR } },
    right: { style: "thin", color: { rgb: BORDER_COLOR } },
  },
} as const;

const headerCellStyle = {
  ...baseCellStyle,
  font: { bold: true, color: { rgb: "111827" } },
  fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
} as const;

const totalCellStyle = {
  ...baseCellStyle,
  font: { bold: true, color: { rgb: "111827" } },
  fill: { patternType: "solid", fgColor: { rgb: "EEF2FF" } },
  border: {
    top: { style: "medium", color: { rgb: "9CA3AF" } },
    bottom: { style: "thin", color: { rgb: BORDER_COLOR } },
    left: { style: "thin", color: { rgb: BORDER_COLOR } },
    right: { style: "thin", color: { rgb: BORDER_COLOR } },
  },
} as const;

function applyFormatting(ws: WorkSheet, rows: Array<Record<string, any>>) {
  if (!ws["!ref"]) return;

  ws["!cols"] = computeColWidths(rows);

  // row heights: header a bit taller
  ws["!rows"] = [{ hpt: 20 }];

  const range = utils.decode_range(ws["!ref"]);
  const colCount = range.e.c - range.s.c + 1;

  // Print setup
  ws["!margins"] = { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 };
  ws["!printOptions"] = { gridLines: false };
  ws["!pageSetup"] = {
    orientation: colCount > 6 ? "landscape" : "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9, // A4
  };

  const isTotalRow = (r: number) => {
    if (r === 0) return false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = utils.encode_cell({ r, c });
      // xlsx-js-style não exporta tipos para células e workbook internos; casts necessários
      const cell = (ws as any)[addr];
      const v = cell?.v;
      if (typeof v === "string" && v.trim().toUpperCase().startsWith("TOTAL")) return true;
    }
    return false;
  };

  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowStyle = r === 0 ? headerCellStyle : isTotalRow(r) ? totalCellStyle : baseCellStyle;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = utils.encode_cell({ r, c });
      const cell = (ws as any)[addr];
      if (!cell) continue;

      // Keep existing number/date types; just apply style.
      cell.s = rowStyle;

      // Align numbers to the right by default
      if (typeof cell.v === "number" && r !== 0) {
        cell.s = {
          ...rowStyle,
          alignment: { ...(rowStyle as any).alignment, horizontal: "right" },
          numFmt: "#,##0.00",
        };
      }
    }
  }
}

function addPrintTitles(wb: WorkBook, sheetIndex: number, sheetName: string) {
  // xlsx-js-style não exporta o tipo WorkbookProperties; cast necessário para print titles
  wb.Workbook = wb.Workbook ?? ({} as any);
  const names = ((wb.Workbook as any).Names ?? []) as any[];

  names.push({
    Name: "_xlnm.Print_Titles",
    Sheet: sheetIndex,
    Ref: `'${sheetName}'!$1:$1`,
  });

  (wb.Workbook as any).Names = names;
}

export function downloadXlsxFromRows(fileName: string, sheetName: string, rows: Array<Record<string, any>>) {
  const safeName = toSafeSheetName(sheetName);
  const ws = utils.json_to_sheet(rows);
  applyFormatting(ws, rows);

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, safeName);
  addPrintTitles(wb as any, 0, safeName);

  writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

export function downloadXlsxWithSheets(fileName: string, sheets: Array<SheetSpec>) {
  const wb = utils.book_new();

  const safeSheets = sheets.map((s) => ({ ...s, name: toSafeSheetName(s.name) }));

  safeSheets.forEach((s, idx) => {
    const ws = utils.json_to_sheet(s.rows);
    applyFormatting(ws, s.rows);
    utils.book_append_sheet(wb, ws, s.name);
    addPrintTitles(wb as any, idx, s.name);
  });

  writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

export function formatPercent(value01: number) {
  if (!Number.isFinite(value01)) return "-";
  return `${Math.round(value01 * 100)}%`;
}