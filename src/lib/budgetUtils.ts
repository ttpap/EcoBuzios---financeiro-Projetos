import type { BudgetLine } from "./supabaseTypes";

function monthlyValue(total: number, months: number): number {
  const d = Math.max(1, months);
  return total / d;
}

/**
 * Calcula o valor de uma linha de orçamento para um mês específico (1-based).
 * Distribui total_approved igualmente entre start_month e end_month.
 * Retorna 0 se monthIndex1 estiver fora do intervalo.
 */
export function calcMonthAmount(line: BudgetLine, monthIndex1: number): number {
  const start = Number(line.start_month ?? 1);
  const end = Number(line.end_month ?? start);
  if (monthIndex1 < start || monthIndex1 > end) return 0;
  const total = Number(line.total_approved ?? 0);
  const months = end - start + 1;
  return monthlyValue(total, months);
}

/**
 * Retorna o próximo código de subitem para um item pai.
 * Ex: itemCode=1, existingCodes=["1.1","1.2"] → "1.3"
 */
export function nextSubitemCode(
  itemCode: number,
  existingCodes: Array<string | null | undefined>
): string {
  const prefix = `${itemCode}.`;
  let max = 0;
  for (const c of existingCodes) {
    const s = String(c ?? "").trim();
    if (!s.startsWith(prefix)) continue;
    const tail = s.slice(prefix.length);
    const n = Number(tail.split(".")[0]);
    if (Number.isFinite(n)) max = Math.max(max, Math.trunc(n));
  }
  return `${itemCode}.${max + 1}`;
}
