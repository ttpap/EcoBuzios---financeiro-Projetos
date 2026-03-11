import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/appStore";
import type { Budget, BudgetCategory, BudgetLine, Project, Transaction } from "@/lib/supabaseTypes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ExecucaoLancamentosDialog } from "@/components/execucao/ExecucaoLancamentosDialog";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FinancialSplitCard } from "@/components/dashboard/FinancialSplitCard";
import { PageHeader } from "@/components/app/PageHeader";

function clampInt(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function buildMonthLabels(monthsCount: number) {
  return Array.from({ length: monthsCount }, (_, i) => ({ idx: i + 1, label: `Mês ${i + 1}` }));
}

function monthRefFromIndex(index1: number) {
  // Sem calendário real nesta etapa: usamos um date estável por mês (2000-01-01 + (index-1) meses)
  const base = new Date(Date.UTC(2000, 0, 1));
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + (index1 - 1), 1));
  return d.toISOString().slice(0, 10);
}

function plannedMonthAmount(line: BudgetLine, monthIndex1: number) {
  const start = Number(line.start_month ?? 1);
  const end = Number((line as any).end_month ?? start);
  if (monthIndex1 < start || monthIndex1 > end) return 0;
  const months = Math.max(1, end - start + 1);
  const total = Number(line.total_approved ?? 0);
  return total / months;
}

export default function ExecucaoProjeto() {
  const queryClient = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const projectQuery = useQuery({
    queryKey: ["project", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", activeProjectId)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return data as Project;
    },
  });

  const budgetQuery = useQuery({
    queryKey: ["budget", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("project_id", activeProjectId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as Budget | undefined) ?? null;
    },
  });

  useEffect(() => {
    if (!budgetQuery.data?.id) return;
    if (budgetQuery.isLoading || projectQuery.isLoading) return;

    const months = clampInt(Number((projectQuery.data as any)?.duration_months ?? 12), 1, 120);
    const budgetMonths = clampInt(Number(budgetQuery.data?.months_count ?? months), 1, 120);
    if (months === budgetMonths) return;

    supabase
      .from("budgets")
      .update({ months_count: months } as any)
      .eq("id", budgetQuery.data.id)
      .then(({ error }) => {
        if (!error) queryClient.invalidateQueries({ queryKey: ["budget", activeProjectId] });
      });
  }, [budgetQuery.data?.id, budgetQuery.data?.months_count, budgetQuery.isLoading, projectQuery.data, projectQuery.isLoading]);

  const categoriesQuery = useQuery({
    queryKey: ["execCats", budgetQuery.data?.id],
    enabled: Boolean(budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_categories")
        .select("*")
        .eq("budget_id", budgetQuery.data!.id)
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BudgetCategory[];
    },
  });

  const linesQuery = useQuery({
    queryKey: ["execLines", budgetQuery.data?.id],
    enabled: Boolean(budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_lines")
        .select("*")
        .eq("budget_id", budgetQuery.data!.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BudgetLine[];
    },
  });

  const txQuery = useQuery({
    queryKey: ["execTx", activeProjectId, budgetQuery.data?.id],
    enabled: Boolean(activeProjectId && budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("project_id", activeProjectId)
        .eq("budget_id", budgetQuery.data!.id)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });

  const monthsCount = clampInt(
    Number((projectQuery.data as any)?.duration_months ?? budgetQuery.data?.months_count ?? 12),
    1,
    120
  );
  const monthCols = useMemo(() => buildMonthLabels(monthsCount), [monthsCount]);

  const executedAgg = useMemo(() => {
    const byLineMonth = new Map<string, number>();
    const byLine = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const missingInvoice = new Set<string>(); // key: lineId__monthRef
    let total = 0;

    for (const t of txQuery.data ?? []) {
      const lineId = String((t as any).budget_line_id);
      const mk = String((t as any).month_ref);
      const amount = Number((t as any).amount ?? 0);

      total += amount;
      byLine.set(lineId, (byLine.get(lineId) ?? 0) + amount);
      byMonth.set(mk, (byMonth.get(mk) ?? 0) + amount);
      byLineMonth.set(`${lineId}__${mk}`, (byLineMonth.get(`${lineId}__${mk}`) ?? 0) + amount);

      const hasPdf = Boolean((t as any).invoice_path);
      if (!hasPdf) missingInvoice.add(`${lineId}__${mk}`);
    }

    return { total, byLine, byMonth, byLineMonth, missingInvoice };
  }, [txQuery.data]);

  const plannedAgg = useMemo(() => {
    const byLineMonth = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const byLine = new Map<string, number>();
    let total = 0;

    for (const l of linesQuery.data ?? []) {
      if (l.is_subtotal) continue;
      const lineTotal = Number(l.total_approved ?? 0);
      total += lineTotal;
      byLine.set(l.id, (byLine.get(l.id) ?? 0) + lineTotal);

      for (let m = 1; m <= monthsCount; m++) {
        const mk = monthRefFromIndex(m);
        const planned = plannedMonthAmount(l, m);
        if (!planned) continue;
        byMonth.set(mk, (byMonth.get(mk) ?? 0) + planned);
        byLineMonth.set(`${l.id}__${mk}`, planned);
      }
    }

    return { total, byLine, byMonth, byLineMonth };
  }, [linesQuery.data, monthsCount]);

  const lineTotals = useMemo(() => {
    const byLine = new Map<string, { planned: number; executed: number }>();
    for (const l of linesQuery.data ?? []) {
      if (l.is_subtotal) continue;
      const planned = Number(l.total_approved ?? 0);
      const executed = executedAgg.byLine.get(l.id) ?? 0;
      byLine.set(l.id, { planned, executed });
    }
    return byLine;
  }, [linesQuery.data, executedAgg.byLine]);

  const itemTotals = useMemo(() => {
    const byCat = new Map<string, { planned: number; executed: number }>();
    for (const l of linesQuery.data ?? []) {
      if (l.is_subtotal) continue;
      const cid = l.category_id ?? "";
      const curr = byCat.get(cid) ?? { planned: 0, executed: 0 };
      curr.planned += Number(l.total_approved ?? 0);
      curr.executed += executedAgg.byLine.get(l.id) ?? 0;
      byCat.set(cid, curr);
    }
    return byCat;
  }, [linesQuery.data, executedAgg.byLine]);

  const monthTotals = useMemo(() => {
    return monthCols.map((m) => {
      const mk = monthRefFromIndex(m.idx);
      const planned = plannedAgg.byMonth.get(mk) ?? 0;
      const executed = executedAgg.byMonth.get(mk) ?? 0;
      return { mk, planned, executed, remaining: planned - executed };
    });
  }, [monthCols, plannedAgg.byMonth, executedAgg.byMonth]);

  const [openCell, setOpenCell] = useState<{ line: BudgetLine; monthIndex1: number } | null>(null);

  if (!activeProjectId) {
    return (
      <div className="rounded-3xl border bg-white p-6">
        <div className="text-sm font-semibold text-[hsl(var(--ink))]">Selecione um projeto</div>
        <Button asChild className="mt-4 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]">
          <Link to="/projects">Ir para Projetos</Link>
        </Button>
      </div>
    );
  }

  if (!budgetQuery.data) {
    return (
      <div className="grid gap-6">
        <BalanceteTabs />
        <div className="rounded-3xl border bg-white p-6">
          <div className="text-sm font-semibold text-[hsl(var(--ink))]">Sem orçamento</div>
          <div className="mt-2 text-sm text-[hsl(var(--muted-ink))]">
            Crie o orçamento no Balancete PRO antes de lançar execução.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <BalanceteTabs />

      <PageHeader
        badge={
          <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-semibold text-[hsl(var(--brand))]">
            Execução do Projeto
          </div>
        }
        title={projectQuery.data?.name ?? "Balancete de Execução"}
        description={
          <>
            Planejado: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(plannedAgg.total)}</span> · Executado:{" "}
            <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(executedAgg.total)}</span> · Saldo:{" "}
            <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(plannedAgg.total - executedAgg.total)}</span>
          </>
        }
        actions={
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/projects">Trocar projeto</Link>
          </Button>
        }
      />

      <FinancialSplitCard
        title="Gráfico do projeto"
        description="Resumo visual do total planejado, valor executado e saldo restante do projeto selecionado."
        planned={plannedAgg.total}
        executed={executedAgg.total}
        remaining={plannedAgg.total - executedAgg.total}
      />

      <Card className="rounded-3xl border bg-white p-0 shadow-sm">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[110px]">Código</TableHead>
                <TableHead className="min-w-[320px]">Descrição</TableHead>
                {monthCols.map((m) => (
                  <TableHead key={m.idx} className="min-w-[120px] text-right">
                    {m.label}
                  </TableHead>
                ))}
                <TableHead className="min-w-[140px] text-right">Planejado</TableHead>
                <TableHead className="min-w-[140px] text-right">Executado</TableHead>
                <TableHead className="min-w-[140px] text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(categoriesQuery.data ?? []).map((cat: any) => {
                const lines = (linesQuery.data ?? []).filter((l) => l.category_id === cat.id);
                const item = itemTotals.get(cat.id) ?? { planned: 0, executed: 0 };

                return (
                  <>
                    <TableRow key={cat.id} className="bg-black/[0.03]">
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">{cat.code}</TableCell>
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">{cat.name}</TableCell>
                      {monthCols.map((m) => (
                        <TableCell key={m.idx} />
                      ))}
                      <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(item.planned)}</TableCell>
                      <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(item.executed)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold",
                          item.planned - item.executed < 0 ? "text-red-700" : "text-[hsl(var(--ink))]"
                        )}
                      >
                        {formatBRL(item.planned - item.executed)}
                      </TableCell>
                    </TableRow>

                    {lines.map((l) => {
                      if (l.is_subtotal) return null;
                      const totals = lineTotals.get(l.id) ?? { planned: 0, executed: 0 };
                      const saldoLine = totals.planned - totals.executed;

                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium text-[hsl(var(--ink))]">{l.code}</TableCell>
                          <TableCell className="text-[hsl(var(--ink))]">{l.name}</TableCell>

                          {monthCols.map((m) => {
                            const mk = monthRefFromIndex(m.idx);
                            const planned = plannedAgg.byLineMonth.get(`${l.id}__${mk}`) ?? 0;
                            const executed = executedAgg.byLineMonth.get(`${l.id}__${mk}`) ?? 0;
                            const remaining = planned - executed;
                            const hasTx = executed !== 0;
                            const missingPdf = executedAgg.missingInvoice.has(`${l.id}__${mk}`);

                            const display = hasTx ? remaining : planned;

                            return (
                              <TableCell key={m.idx} className="text-right">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className={cn(
                                        "w-full rounded-xl px-2 py-1 text-right text-sm font-semibold transition",
                                        "hover:bg-black/5",
                                        hasTx
                                          ? remaining < 0
                                            ? "text-red-700"
                                            : remaining === 0
                                              ? "text-emerald-700"
                                              : "text-[hsl(var(--brand-strong))]"
                                          : planned
                                            ? "text-[hsl(var(--ink))]"
                                            : "text-[hsl(var(--muted-ink))]",
                                        missingPdf ? "ring-2 ring-red-500/70" : ""
                                      )}
                                      onClick={() => {
                                        setOpenCell({ line: l, monthIndex1: m.idx });
                                      }}
                                    >
                                      {formatBRL(display)}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <div className="text-xs">
                                      <div>
                                        Planejado: <span className="font-semibold">{formatBRL(planned)}</span>
                                      </div>
                                      <div>
                                        Executado: <span className="font-semibold">{formatBRL(executed)}</span>
                                      </div>
                                      <div>
                                        Saldo: <span className="font-semibold">{formatBRL(remaining)}</span>
                                      </div>
                                      {missingPdf && (
                                        <div className="mt-2 font-semibold text-red-700">
                                          Atenção: há lançamento sem PDF.
                                        </div>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                            );
                          })}

                          <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                            {formatBRL(totals.planned)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                            {formatBRL(totals.executed)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold",
                              saldoLine < 0 ? "text-red-700" : "text-[hsl(var(--ink))]"
                            )}
                          >
                            {formatBRL(saldoLine)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                );
              })}

              <TableRow className="bg-[hsl(var(--app-bg))]">
                <TableCell />
                <TableCell className="font-semibold text-[hsl(var(--ink))]">TOTAL GERAL</TableCell>
                {monthTotals.map((m) => (
                  <TableCell
                    key={m.mk}
                    className={cn(
                      "text-right font-semibold",
                      m.remaining < 0 ? "text-red-700" : "text-[hsl(var(--ink))]"
                    )}
                  >
                    {formatBRL(m.remaining)}
                  </TableCell>
                ))}
                <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(plannedAgg.total)}</TableCell>
                <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(executedAgg.total)}</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold",
                    plannedAgg.total - executedAgg.total < 0 ? "text-red-700" : "text-[hsl(var(--ink))]"
                  )}
                >
                  {formatBRL(plannedAgg.total - executedAgg.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      <ExecucaoLancamentosDialog
        open={openCell !== null}
        onOpenChange={(v) => {
          if (!v) setOpenCell(null);
        }}
        projectId={activeProjectId}
        budgetId={budgetQuery.data.id}
        line={openCell?.line}
        monthIndex={openCell?.monthIndex1}
        monthsCount={monthsCount}
      />
    </div>
  );
}