import * as XLSX from "xlsx";
import Papa from "papaparse";
import { parsePtBrMoneyToNumber } from "@/lib/money";

export type ParsedBudget = {
  monthsCount: number;
  categories: { key: string; name: string }[];
  lines: Array<{
    categoryKey: string;
    name: string;
    totalApproved: number;
    quantity?: number | null;
    unitValue?: number | null;
    notes?: string | null;
    isSubtotal?: boolean;
    approvedByMonth?: number[]; // length monthsCount
  }>;
  detected: {
    hasMonthColumns: boolean;
    totalGeneral?: number;
  };
};

type Row = Record<string, unknown>;

function normalizeHeader(h: string) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function guessMonthsFromHeaders(headers: string[]): { monthsCount: number; monthIndexes: number[] } {
  const normalized = headers.map(normalizeHeader);

  const monthTokens = [
    "jan",
    "janeiro",
    "fev",
    "fevereiro",
    "mar",
    "marco",
    "abril",
    "abr",
    "mai",
    "maio",
    "jun",
    "junho",
    "jul",
    "julho",
    "ago",
    "agosto",
    "set",
    "setembro",
    "out",
    "outubro",
    "nov",
    "novembro",
    "dez",
    "dezembro",
  ];

  const monthIndexes: number[] = [];
  normalized.forEach((h, idx) => {
    const hit = monthTokens.some((t) => h === t || h.includes(` ${t}`) || h.startsWith(`${t} `));
    if (hit) monthIndexes.push(idx);
  });

  // If the file has Jan..Dez, return 12; otherwise 0 (MVP will use project monthsCount)
  const monthsCount = monthIndexes.length >= 6 ? monthIndexes.length : 0;
  return { monthsCount, monthIndexes };
}

function findColumn(headers: string[], candidates: string[]) {
  const normalized = headers.map(normalizeHeader);
  const normalizedCandidates = candidates.map(normalizeHeader);
  const idx = normalized.findIndex((h) => normalizedCandidates.some((c) => h === c || h.includes(c)));
  return idx >= 0 ? idx : null;
}

function rowToArray(row: Row, headers: string[]) {
  return headers.map((h) => row[h]);
}

function isCategoryRow(cells: unknown[], valueCellsSum: number) {
  const text = String(cells[0] ?? "").trim();
  if (!text) return false;
  if (valueCellsSum > 0) return false;
  // Looks like a section header if it's mostly letters and usually uppercase
  const lettersRatio = text.replace(/[^A-Za-zÀ-ÿ]/g, "").length / Math.max(1, text.length);
  const uppercaseRatio = text.replace(/[^A-Za-zÀ-ÿ]/g, "").length
    ? text.replace(/[^A-Za-zÀ-ÿ]/g, "").replace(/[^A-ZÀ-Ý]/g, "").length /
      text.replace(/[^A-Za-zÀ-ÿ]/g, "").length
    : 0;
  return lettersRatio > 0.55 && uppercaseRatio > 0.5;
}

function isSubtotalLike(label: string) {
  const n = normalizeHeader(label);
  return n.includes("subtotal") || n.includes("total geral") || n === "total";
}

export async function parseBudgetFile(file: File): Promise<ParsedBudget> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "csv") {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const rows = (parsed.data ?? []) as Row[];
    const headers = (parsed.meta.fields ?? []).filter(Boolean);
    return parseRows(headers, rows);
  }

  // xlsx, xls
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });

  const headers = rows.length
    ? Object.keys(rows[0] as Row)
    : (XLSX.utils.sheet_to_json(sheet, { header: 1 })?.[0] as string[]) ?? [];

  return parseRows(headers, rows);
}

function parseRows(headers: string[], rows: Row[]): ParsedBudget {
  const colItem = findColumn(headers, ["item", "rubrica", "funcao", "funcao/item", "descricao", "item / rubrica"]);
  const colQtd = findColumn(headers, ["quantidade", "qtd", "qtde"]);
  const colUnit = findColumn(headers, ["valor unitario", "vl unit", "unitario"]);

  // Prefer a total column if present
  const colTotal =
    findColumn(headers, ["subtotal total", "valor total", "total", "subtotal_total"]) ??
    findColumn(headers, ["subtotal", "total (r$)", "total r$"]);

  const { monthsCount: detectedMonthsCount, monthIndexes } = guessMonthsFromHeaders(headers);

  let currentCategory = "geral";
  const categories = new Map<string, string>([["geral", "Geral"]]);

  const lines: ParsedBudget["lines"] = [];

  let detectedTotalGeneral: number | undefined;

  for (const row of rows) {
    const cells = rowToArray(row, headers);
    const rawLabel = String(
      (colItem != null ? cells[colItem] : cells[0]) ?? ""
    ).trim();

    const numericCandidates = cells
      .map((c) => parsePtBrMoneyToNumber(String(c ?? "")))
      .filter((n) => Number.isFinite(n));

    const valueCellsSum = numericCandidates.reduce((a, b) => a + b, 0);

    if (!rawLabel) continue;

    if (isCategoryRow(cells, valueCellsSum)) {
      currentCategory = normalizeHeader(rawLabel);
      categories.set(currentCategory, rawLabel);
      continue;
    }

    const subtotalFlag = isSubtotalLike(rawLabel);

    const totalApproved = colTotal != null ? parsePtBrMoneyToNumber(String(cells[colTotal] ?? "")) : 0;

    // If there's no total column, try last numeric cell
    const fallbackTotal = totalApproved || (numericCandidates.length ? numericCandidates[numericCandidates.length - 1] : 0);

    if (subtotalFlag && normalizeHeader(rawLabel).includes("total geral")) {
      detectedTotalGeneral = fallbackTotal || detectedTotalGeneral;
    }

    // Skip rows with no money at all (but keep subtotal lines if they have money)
    if (!fallbackTotal && !subtotalFlag) continue;

    const quantity = colQtd != null ? Number(String(cells[colQtd] ?? "").replace(",", ".")) : null;
    const unitValue = colUnit != null ? parsePtBrMoneyToNumber(String(cells[colUnit] ?? "")) : null;

    const approvedByMonth =
      detectedMonthsCount && monthIndexes.length
        ? monthIndexes.map((idx) => parsePtBrMoneyToNumber(String(cells[idx] ?? "")))
        : undefined;

    lines.push({
      categoryKey: currentCategory,
      name: rawLabel,
      totalApproved: fallbackTotal,
      quantity: Number.isFinite(quantity as number) ? (quantity as number) : null,
      unitValue: Number.isFinite(unitValue as number) ? (unitValue as number) : null,
      isSubtotal: subtotalFlag,
      approvedByMonth: approvedByMonth?.length ? approvedByMonth : undefined,
    });
  }

  const monthsCount = detectedMonthsCount || 12; // UI will let the user set it per project/budget

  return {
    monthsCount,
    categories: Array.from(categories.entries()).map(([key, name]) => ({ key, name })),
    lines,
    detected: {
      hasMonthColumns: Boolean(detectedMonthsCount),
      totalGeneral: detectedTotalGeneral,
    },
  };
}
