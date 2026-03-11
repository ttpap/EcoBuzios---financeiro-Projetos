import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

function percent(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

export function FinancialSplitCard({
  title,
  description,
  planned,
  executed,
  remaining,
}: {
  title: string;
  description: string;
  planned: number;
  executed: number;
  remaining: number;
}) {
  const executedPct = percent(executed, planned);
  const remainingPct = remaining > 0 ? percent(remaining, planned) : 0;
  const overBudget = remaining < 0;

  return (
    <Card className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold tracking-tight text-[hsl(var(--ink))]">{title}</div>
          <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">{description}</div>
        </div>
        <div className="rounded-full bg-[hsl(var(--app-bg))] px-3 py-1 text-xs font-semibold text-[hsl(var(--ink))]">
          Planejado: {formatBRL(planned)}
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border bg-[hsl(var(--app-bg))] p-4">
        <div className="h-4 overflow-hidden rounded-full bg-white ring-1 ring-black/5">
          <div className="flex h-full w-full">
            <div
              className="h-full bg-[hsl(var(--brand))]"
              style={{ width: `${overBudget ? 100 : executedPct}%` }}
            />
            {!overBudget ? (
              <div className="h-full bg-amber-400/90" style={{ width: `${remainingPct}%` }} />
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
            <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Executado</div>
            <div className="mt-1 text-lg font-semibold text-[hsl(var(--ink))]">{formatBRL(executed)}</div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">{executedPct.toFixed(1)}% do total</div>
          </div>

          <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
            <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Saldo</div>
            <div className={cn("mt-1 text-lg font-semibold", overBudget ? "text-red-600" : "text-[hsl(var(--ink))]")}>{formatBRL(remaining)}</div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
              {overBudget ? "Projeto acima do orçamento" : `${remainingPct.toFixed(1)}% disponível`}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
            <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Leitura</div>
            <div className="mt-1 text-sm font-semibold text-[hsl(var(--ink))]">
              {overBudget ? "Executado acima do planejado" : "Execução dentro do orçamento"}
            </div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
              {overBudget ? `Excesso de ${formatBRL(Math.abs(remaining))}` : `Restam ${formatBRL(remaining)}`}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
