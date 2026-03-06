export function parsePtBrMoneyToNumber(input: string): number {
  const raw = String(input ?? "").trim();
  if (!raw) return 0;

  // Remove currency and spaces
  const noCurrency = raw.replace(/\s/g, "").replace(/^R\$/i, "");

  // Keep digits, comma, dot, minus
  const cleaned = noCurrency.replace(/[^0-9,.-]/g, "");

  // If contains both '.' and ',' assume pt-BR thousands '.' and decimal ','
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  // If only comma, treat as decimal separator
  if (cleaned.includes(",")) {
    const normalized = cleaned.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}
