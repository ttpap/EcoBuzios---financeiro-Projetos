import { formatBRL } from "@/lib/money";

export function ReportHeader({
  title,
  subtitle,
  planned,
  executed,
}: {
  title: string;
  subtitle?: string;
  planned: number;
  executed: number;
}) {
  const remaining = planned - executed;
  const executedPct = planned > 0 ? executed / planned : 0;
  const remainingPct = planned > 0 ? remaining / planned : 0;

  return (
    <div className="rounded-3xl border bg-white p-6">
      <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Relatórios</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">{title}</h1>
      {subtitle && <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">{subtitle}</div>}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
          <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total Planejado</div>
          <div className="mt-1 text-lg font-semibold text-[hsl(var(--ink))]">{formatBRL(planned)}</div>
          <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">100%</div>
        </div>
        <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
          <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total Executado</div>
          <div className="mt-1 text-lg font-semibold text-[hsl(var(--ink))]">{formatBRL(executed)}</div>
          <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">{Math.round(executedPct * 100)}%</div>
        </div>
        <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
          <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Saldo Disponível</div>
          <div className="mt-1 text-lg font-semibold text-[hsl(var(--ink))]">{formatBRL(remaining)}</div>
          <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">{Math.round(remainingPct * 100)}%</div>
        </div>
      </div>
    </div>
  );
}
