import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/appStore";
import type { Budget, BudgetCategory, BudgetLine, Transaction } from "@/lib/supabaseTypes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ExecucaoLancamentosDialog } from "@/components/execucao/ExecucaoLancamentosDialog";

function buildMonthLabels(monthsCount: number) {
  return Array.from({ length: monthsCount }, (_, i) => ({ idx: i + 1, label: `Mês ${i + 1}` }));
}

function monthRefFromIndex(index1: number) {
  // Sem calendário real nesta etapa: usamos um date estável por mês (2000-01-01 + (index-1) meses)
  const base = new Date(Date.UTC(2000, 0, 1));
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + (index1 - 1), 1));
  return d.toISOString().slice(0, 10);
}

export default function ExecucaoProjeto() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);

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

  const monthsCount = budgetQuery.data?.months_count ?? 12;
  const monthCols = useMemo(() => buildMonthLabels(monthsCount), [monthsCount]);

  const agg = useMemo(() => {
    const byLineMonth = new Map<string, number>();
    const byLine = new Map<string, number>();
    const byMonth = new Map<string, number>();
    let total = 0;

    for (const t of txQuery.data ?? []) {
      const lineId = String((t as any).budget_line_id);
      const mk = String((t as any).month_ref);
      const amount = Number((t as any).amount ?? 0);

      total += amount;
      byLine.set(lineId, (byLine.get(lineId) ?? 0) + amount);
      byMonth.set(mk, (byMonth.get(mk) ?? 0) + amount);
      byLineMonth.set(`${lineId}__${mk}`, (byLineMonth.get(`${lineId}__${mk}`) ?? 0) + amount);
    }

    return { total, byLine, byMonth, byLineMonth };
  }, [txQuery.data]);

  const itemTotals = useMemo(() => {
    const byCat = new Map<string, number>();
    const lines = linesQuery.data ?? [];
    for (const l of lines) {
      if (l.is_subtotal) continue;
      const cid = l.category_id ?? "";
      byCat.set(cid, (byCat.get(cid) ?? 0) + (agg.byLine.get(l.id) ?? 0));
    }
    return byCat;
  }, [linesQuery.data, agg.byLine]);

  const [open, setOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<BudgetLine | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(1);

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
      <div className="rounded-3xl border bg-white p-6">
        <div className="text-sm font-semibold text-[hsl(var(--ink))]">Sem orçamento</div>
        <div className="mt-2 text-sm text-[hsl(var(--muted-ink))]">
          Crie o orçamento no Balancete PRO antes de lançar execução.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Execução do Projeto</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              Balancete de Execução
            </h1>
            <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Total executado: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(agg.total)}</span>
            </div>
          </div>
        </div>
      </div>

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
                <TableHead className="min-w-[160px] text-right">Executado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(categoriesQuery.data ?? []).map((cat: any) => {
                const lines = (linesQuery.data ?? []).filter((l) => l.category_id === cat.id);
                const itemTotal = itemTotals.get(cat.id) ?? 0;

                return (
                  <>
                    <TableRow key={cat.id} className="bg-black/[0.03]">
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">{cat.code}</TableCell>
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">{cat.name}</TableCell>
                      {monthCols.map((m) => {
                        const mk = monthRefFromIndex(m.idx);
                        const v = agg.byMonth.get(mk) ?? 0;
                        return <TableCell key={m.idx} className="text-right text-sm text-[hsl(var(--muted-ink))]">{formatBRL(v)}</TableCell>;
                      })}
                      <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(itemTotal)}</TableCell>
                    </TableRow>

                    {lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm text-[hsl(var(--muted-ink))]">{l.code || ""}</TableCell>
                        <TableCell className="text-sm font-medium text-[hsl(var(--ink))]">{l.name}</TableCell>
                        {monthCols.map((m) => {
                          const mk = monthRefFromIndex(m.idx);
                          const v = agg.byLineMonth.get(`${l.id}__${mk}`) ?? 0;
                          return (
                            <TableCell key={m.idx} className="text-right">
                              <button
                                className={cn(
                                  "w-full rounded-xl px-2 py-1 text-sm transition",
                                  v ? "bg-[hsl(var(--brand)/0.12)] font-semibold text-[hsl(var(--ink))]" : "text-[hsl(var(--muted-ink))] hover:bg-black/5"
                                )}
                                onClick={() => {
                                  setSelectedLine(l);
                                  setSelectedMonth(m.idx);
                                  setOpen(true);
                                }}
                              >
                                {formatBRL(v)}
                              </button>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                          {formatBRL(agg.byLine.get(l.id) ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                );
              })}

              <TableRow className="bg-[hsl(var(--app-bg))]">
                <TableCell />
                <TableCell className="font-semibold text-[hsl(var(--ink))]">TOTAL GERAL</TableCell>
                {monthCols.map((m) => {
                  const mk = monthRefFromIndex(m.idx);
                  return (
                    <TableCell key={m.idx} className="text-right font-semibold text-[hsl(var(--ink))]">
                      {formatBRL(agg.byMonth.get(mk) ?? 0)}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(agg.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      <ExecucaoLancamentosDialog
        open={open}
        onOpenChange={setOpen}
        projectId={activeProjectId}
        budgetId={budgetQuery.data.id}
        line={selectedLine}
        monthIndex={selectedMonth}
        monthRef={monthRefFromIndex(selectedMonth)}
      />
    </div>
  );
}
