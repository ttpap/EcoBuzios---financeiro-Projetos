export function normalizePayMethod(pm: string | null | undefined) {
  const v = String(pm ?? "");
  if (v === "transferencia") return "Transferência";
  if (v === "cheque") return "Cheque";
  if (v === "boleto") return "Boleto";
  if (v === "pix") return "Pix";
  return v || "-";
}

export function formatDateBR(dateISO: string | null | undefined) {
  if (!dateISO) return "";
  // dateISO pode vir como YYYY-MM-DD
  const [y, m, d] = String(dateISO).slice(0, 10).split("-");
  if (!y || !m || !d) return String(dateISO);
  return `${d}/${m}/${y}`;
}
