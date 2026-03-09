import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";

type YearRow = {
  yearLabel: string;
  value: number;
  projectsCount: number;
};

export function YearTotalsBars({ rows }: { rows: YearRow[] }) {
  const max = useMemo(() => Math.max(0, ...rows.map((r) => Math.abs(r.value))), [rows]);

  return (
    <Card className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold tracking-tight text-[hsl(var(--ink))]">
            Total por ano (saldo)
          </div>
          <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
            Planejado − Executado, somado por ano de execução
          </div>
        </div>
      </div>

      {!rows.length ? (
        <div className="mt-5 rounded-2xl border bg-[hsl(var(--app-bg))] p-4 text-sm text-[hsl(var(--muted-ink))]">
          Sem dados para exibir.
        </div>
      ) : (
        <div className="mt-5 grid gap-2">
          {rows.map((r) => {
            const w = max > 0 ? (Math.abs(r.value) / max) * 100 : 0;
            const negative = r.value < 0;
            return (
              <div key={r.yearLabel} className="rounded-2xl border bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[hsl(var(--ink))]">{r.yearLabel}</div>
                    <div className="text-xs text-[hsl(var(--muted-ink))]">{r.projectsCount} projeto(s)</div>
                  </div>
                  <div className={cn("text-sm font-semibold", negative ? "text-red-600" : "text-[hsl(var(--ink))]")}
                  >
                    {formatBRL(r.value)}
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-black/5">
                  <div
                    className={cn(
                      "h-2 rounded-full",
                      negative ? "bg-red-500/70" : "bg-[hsl(var(--brand))]"
                    )}
                    style={{ width: `${w}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
