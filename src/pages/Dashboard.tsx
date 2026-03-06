import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/appStore";
import { supabase } from "@/integrations/supabase/client";
import type { Budget, Project } from "@/lib/supabaseTypes";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

type Totals = {
  approved: number;
  executed: number;
};

async function fetchActiveBudget(projectId: string) {
  const { data: budgets, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (budgets?.[0] as Budget | undefined) ?? null;
}

async function fetchDashboardTotals(projectId: string, budgetId: string): Promise<Totals> {
  const [{ data: lines, error: lErr }, { data: tx, error: tErr }] = await Promise.all([
    supabase.from("budget_lines").select("total_approved").eq("budget_id", budgetId),
    supabase
      .from("transactions")
      .select("amount,deleted_at")
      .eq("project_id", projectId)
      .eq("budget_id", budgetId)
      .is("deleted_at", null),
  ]);

  if (lErr) throw lErr;
  if (tErr) throw tErr;

  const approved = (lines ?? []).reduce((acc, r) => acc + Number(r.total_approved ?? 0), 0);
  const executed = (tx ?? []).reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
  return { approved, executed };
}

export default function Dashboard() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const projectQuery = useQuery({
    queryKey: ["project", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", activeProjectId).single();
      if (error) throw error;
      return data as Project;
    },
  });

  const budgetQuery = useQuery({
    queryKey: ["activeBudget", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: () => fetchActiveBudget(activeProjectId!),
  });

  const totalsQuery = useQuery({
    queryKey: ["dashboardTotals", activeProjectId, budgetQuery.data?.id],
    enabled: Boolean(activeProjectId && budgetQuery.data?.id),
    queryFn: () => fetchDashboardTotals(activeProjectId!, budgetQuery.data!.id),
  });

  const stats = useMemo(() => {
    const approved = totalsQuery.data?.approved ?? 0;
    const executed = totalsQuery.data?.executed ?? 0;
    const remaining = Math.max(0, approved - executed);
    const pct = approved > 0 ? (executed / approved) * 100 : 0;
    return { approved, executed, remaining, pct };
  }, [totalsQuery.data]);

  if (!activeProjectId) {
    return (
      <div className="grid gap-6">
        <div className="rounded-3xl border bg-white p-6">
          <div className="text-sm font-semibold text-[hsl(var(--ink))]">Selecione um projeto</div>
          <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
            Crie ou selecione um projeto para visualizar os totais e o balancete.
          </p>
          <Button asChild className="mt-4 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]">
            <Link to="/projects">Ir para Projetos</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-medium text-[hsl(var(--brand))]">
              <BarChart3 className="h-3.5 w-3.5" />
              Visão geral
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              {projectQuery.data?.name ?? "Projeto"}
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Acompanhe o total aprovado, execução e saldo disponível.
            </p>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/import">Importar orçamento</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total aprovado</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
            {formatBRL(stats.approved)}
          </div>
        </Card>
        <Card className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total executado</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
            {formatBRL(stats.executed)}
          </div>
          <div className={cn("mt-2 inline-flex items-center gap-1 text-xs", stats.pct > 90 ? "text-red-600" : "text-[hsl(var(--muted-ink))]")}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            {stats.pct.toFixed(1)}% do orçamento
          </div>
        </Card>
        <Card className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Saldo disponível</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
            {formatBRL(stats.remaining)}
          </div>
        </Card>
      </div>

      <div className="rounded-3xl border bg-white p-6">
        <div className="text-sm font-semibold text-[hsl(var(--ink))]">Próximos passos</div>
        <div className="mt-2 grid gap-3 text-sm text-[hsl(var(--muted-ink))] md:grid-cols-3">
          <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
            <div className="font-medium text-[hsl(var(--ink))]">1) Importe o orçamento</div>
            <div className="mt-1">Excel/CSV → revisão → confirmar.</div>
          </div>
          <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
            <div className="font-medium text-[hsl(var(--ink))]">2) Use o balancete</div>
            <div className="mt-1">Aprovado, executado, saldo e % por rubrica.</div>
          </div>
          <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
            <div className="font-medium text-[hsl(var(--ink))]">3) Lance despesas</div>
            <div className="mt-1">Débito automático por linha e por mês.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
