import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/appStore";
import { supabase } from "@/integrations/supabase/client";
import type { Budget, BudgetCategory, BudgetLine } from "@/lib/supabaseTypes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ArrowRight, Table2 } from "lucide-react";
import { Link } from "react-router-dom";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";

type LineAgg = {
  executedTotal: number;
  byMonth: Record<string, number>; // key: YYYY-MM-01
};

function monthKey(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return d.toISOString().slice(0, 10);
}

function buildMonthColumns(startMonth: string, monthsCount: number) {
  const [y, m] = startMonth.split("-").map(Number);
  const start = new Date(Date.UTC(y, (m ?? 1) - 1, 1));

  return Array.from({ length: monthsCount }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    return {
      label: d.toLocaleString("pt-BR", { month: "short" }).replace(".", ""),
      key: monthKey(d),
    };
  });
}

export default function Balancete() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const activeBudgetId = useAppStore((s) => s.activeBudgetId);
  const [q, setQ] = useState("");

  const budgetQuery = useQuery({
    queryKey: ["budget", activeProjectId, activeBudgetId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      // Use selected budget if present; otherwise last budget
      if (activeBudgetId) {
        const { data, error } = await supabase
          .from("budgets")
          .select("*")
          .eq("id", activeBudgetId)
          .single();
        if (error) throw error;
        return data as Budget;
      }
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
    queryKey: ["budgetCategories", budgetQuery.data?.id],
    enabled: Boolean(budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_categories")
        .select("*")
        .eq("budget_id", budgetQuery.data!.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BudgetCategory[];
    },
  });

  const linesQuery = useQuery({
    queryKey: ["budgetLines", budgetQuery.data?.id],
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
    queryKey: ["transactionsAgg", activeProjectId, budgetQuery.data?.id],
    enabled: Boolean(activeProjectId && budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("budget_line_id,month_ref,amount")
        .eq("project_id", activeProjectId)
        .eq("budget_id", budgetQuery.data!.id)
        .is("deleted_at", null);
      if (error) throw error;

      const agg = new Map<string, LineAgg>();
      for (const r of data ?? []) {
        const lineId = String((r as any).budget_line_id);
        const mk = String((r as any).month_ref);
        const amount = Number((r as any).amount ?? 0);
        const curr = agg.get(lineId) ?? { executedTotal: 0, byMonth: {} };
        curr.executedTotal += amount;
        curr.byMonth[mk] = (curr.byMonth[mk] ?? 0) + amount;
        agg.set(lineId, curr);
      }
      return agg;
    },
  });

  const monthsCount = budgetQuery.data?.months_count ?? 12;
  const startMonth = (budgetQuery.data as any)?.start_month
    ? String((budgetQuery.data as any).start_month).slice(0, 7)
    : new Date().toISOString().slice(0, 7);
  const monthCols = useMemo(
    () => buildMonthColumns(startMonth, monthsCount),
    [startMonth, monthsCount]
  );

  const catById = useMemo(() => {
    const m = new Map<string, BudgetCategory>();
    (categoriesQuery.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [categoriesQuery.data]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (linesQuery.data ?? []).filter((l) => {
      if (!query) return true;
      const cat = l.category_id ? catById.get(l.category_id)?.name ?? "" : "";
      return l.name.toLowerCase().includes(query) || cat.toLowerCase().includes(query);
    });
  }, [linesQuery.data, q, catById]);

  const totals = useMemo(() => {
    const approved = (linesQuery.data ?? []).reduce(
      (acc, l) => acc + (l.is_subtotal ? 0 : Number(l.total_approved ?? 0)),
      0
    );
    const executed = Array.from((txQuery.data ?? new Map()).values()).reduce(
      (acc, a) => acc + a.executedTotal,
      0
    );
    return { approved, executed, remaining: Math.max(0, approved - executed) };
  }, [linesQuery.data, txQuery.data]);

  if (!activeProjectId) {
    return (
      <div className="rounded-3xl border bg-white p-6">
        <div className="text-sm font-semibold text-[hsl(var(--ink))]">Selecione um projeto</div>
        <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">Para ver o balancete, escolha um projeto.</p>
        <Button
          asChild
          className="mt-4 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
        >
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
          <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">Importe uma planilha para gerar o balancete.</p>
          <Button
            asChild
            className="mt-4 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
          >
            <Link to="/balancete/importar">Importar orçamento</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <BalanceteTabs />

      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-medium text-[hsl(var(--brand))]">
              <Table2 className="h-3.5 w-3.5" />
              Balancete
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              {budgetQuery.data.name}
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Aprovado: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(totals.approved)}</span> ·
              Executado: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(totals.executed)}</span> ·
              Saldo: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(totals.remaining)}</span>
            </p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-full md:w-72"
              placeholder="Filtrar por rubrica/categoria…"
            />
          </div>
        </div>
      </div>

      <Card className="rounded-3xl border bg-white p-0 shadow-sm">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Categoria</TableHead>
                <TableHead className="min-w-[320px]">Item / Rubrica</TableHead>
                <TableHead className="text-right">Aprovado</TableHead>
                <TableHead className="text-right">Executado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">%</TableHead>
                {monthCols.map((m) => (
                  <TableHead key={m.key} className="text-right">
                    {m.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => {
                const cat = l.category_id ? catById.get(l.category_id)?.name ?? "—" : "—";
                const agg = txQuery.data?.get(l.id);
                const executed = agg?.executedTotal ?? 0;
                const approved = Number(l.total_approved ?? 0);
                const remaining = approved - executed;
                const pct = approved > 0 ? (executed / approved) * 100 : 0;
                const over = remaining < 0;

                return (
                  <TableRow
                    key={l.id}
                    className={cn(l.is_subtotal ? "bg-black/[0.03]" : "", over ? "bg-red-50" : "")}
                  >
                    <TableCell className="text-sm text-[hsl(var(--muted-ink))]">{cat}</TableCell>
                    <TableCell
                      className={cn(
                        "font-medium",
                        l.is_subtotal ? "text-[hsl(var(--muted-ink))]" : "text-[hsl(var(--ink))]"
                      )}
                    >
                      {l.name}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                      {formatBRL(approved)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                      {formatBRL(executed)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold",
                        over ? "text-red-700" : "text-[hsl(var(--ink))]"
                      )}
                    >
                      {formatBRL(remaining)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right",
                        over ? "text-red-700" : "text-[hsl(var(--muted-ink))]"
                      )}
                    >
                      {pct.toFixed(1)}%
                    </TableCell>
                    {monthCols.map((m) => (
                      <TableCell key={m.key} className="text-right text-[hsl(var(--muted-ink))]">
                        {formatBRL(agg?.byMonth?.[m.key] ?? 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button
                        asChild
                        size="sm"
                        className={cn(
                          "rounded-full",
                          l.is_subtotal
                            ? "pointer-events-none opacity-40"
                            : "bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                        )}
                      >
                        <Link to={`/balancete/linha/${l.id}`}>
                          Lançar
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!rows.length && (
                <TableRow>
                  <TableCell
                    colSpan={7 + monthCols.length}
                    className="py-8 text-center text-sm text-[hsl(var(--muted-ink))]"
                  >
                    Nenhuma rubrica encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}