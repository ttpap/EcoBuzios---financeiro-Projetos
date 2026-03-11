import { useMemo, useState } from "react";
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
import { ProjectsShareDonut } from "@/components/dashboard/ProjectsShareDonut";
import { YearTotalsBars } from "@/components/dashboard/YearTotalsBars";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Totals = {
  approved: number;
  executed: number;
};

type ProjectRollup = {
  id: string;
  name: string;
  executionYear: number | null;
  planned: number;
  executed: number;
  remaining: number;
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
    supabase.from("budget_lines").select("total_approved,is_subtotal").eq("budget_id", budgetId),
    supabase
      .from("transactions")
      .select("amount,deleted_at")
      .eq("project_id", projectId)
      .eq("budget_id", budgetId)
      .is("deleted_at", null),
  ]);

  if (lErr) throw lErr;
  if (tErr) throw tErr;

  const approved = (lines ?? []).reduce(
    (acc, r: any) => acc + (r.is_subtotal ? 0 : Number(r.total_approved ?? 0)),
    0
  );
  const executed = (tx ?? []).reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
  return { approved, executed };
}

async function fetchProjectsRemainingRollup(): Promise<ProjectRollup[]> {
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id,name,execution_year,created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (pErr) throw pErr;

  const list = (projects ?? []) as Array<{ id: string; name: string; execution_year: number | null }>;
  if (!list.length) return [];

  const projectIds = list.map((p) => p.id);

  const { data: budgets, error: bErr } = await supabase
    .from("budgets")
    .select("id,project_id,created_at")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });
  if (bErr) throw bErr;

  // Latest budget per project
  const latestBudgetByProject = new Map<string, string>();
  for (const b of (budgets ?? []) as any[]) {
    const pid = String(b.project_id);
    if (!latestBudgetByProject.has(pid)) latestBudgetByProject.set(pid, String(b.id));
  }

  const budgetIds = Array.from(latestBudgetByProject.values());

  const [linesRes, txRes] = await Promise.all([
    budgetIds.length
      ? supabase
          .from("budget_lines")
          .select("budget_id,total_approved,is_subtotal")
          .in("budget_id", budgetIds)
      : Promise.resolve({ data: [], error: null } as any),
    budgetIds.length
      ? supabase
          .from("transactions")
          .select("project_id,budget_id,amount")
          .in("budget_id", budgetIds)
          .in("project_id", projectIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (linesRes.error) throw linesRes.error;
  if (txRes.error) throw txRes.error;

  const plannedByBudget = new Map<string, number>();
  for (const r of (linesRes.data ?? []) as any[]) {
    if (r.is_subtotal) continue;
    const bid = String(r.budget_id);
    plannedByBudget.set(bid, (plannedByBudget.get(bid) ?? 0) + Number(r.total_approved ?? 0));
  }

  const executedByProject = new Map<string, number>();
  for (const t of (txRes.data ?? []) as any[]) {
    const pid = String(t.project_id);
    executedByProject.set(pid, (executedByProject.get(pid) ?? 0) + Number(t.amount ?? 0));
  }

  return list.map((p) => {
    const bid = latestBudgetByProject.get(p.id) ?? null;
    const planned = bid ? plannedByBudget.get(bid) ?? 0 : 0;
    const executed = executedByProject.get(p.id) ?? 0;
    return {
      id: p.id,
      name: p.name,
      executionYear: p.execution_year ?? null,
      planned,
      executed,
      remaining: planned - executed,
    };
  });
}

export default function Dashboard() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const [yearFilter, setYearFilter] = useState<string>("all");

  const rollupQuery = useQuery({
    queryKey: ["projectsRemainingRollup"],
    queryFn: fetchProjectsRemainingRollup,
  });

  const yearRows = useMemo(() => {
    const groups = new Map<string, { value: number; count: number }>();
    for (const p of rollupQuery.data ?? []) {
      const y = p.executionYear ? String(p.executionYear) : "Sem ano";
      const curr = groups.get(y) ?? { value: 0, count: 0 };
      curr.value += p.remaining;
      curr.count += 1;
      groups.set(y, curr);
    }

    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === "Sem ano") return 1;
      if (b === "Sem ano") return -1;
      return Number(b) - Number(a);
    });

    return keys.map((k) => ({
      yearLabel: k,
      value: groups.get(k)!.value,
      projectsCount: groups.get(k)!.count,
    }));
  }, [rollupQuery.data]);

  const yearOptions = useMemo(() => {
    const years = Array.from(new Set((rollupQuery.data ?? []).map((p) => p.executionYear).filter(Boolean) as number[]))
      .sort((a, b) => b - a)
      .map(String);
    return years;
  }, [rollupQuery.data]);

  const projectsByYear = useMemo(() => {
    const groups = new Map<string, ProjectRollup[]>();
    for (const p of rollupQuery.data ?? []) {
      const y = p.executionYear ? String(p.executionYear) : "Sem ano";
      groups.set(y, [...(groups.get(y) ?? []), p]);
    }

    const years = Array.from(groups.keys()).sort((a, b) => {
      if (a === "Sem ano") return 1;
      if (b === "Sem ano") return -1;
      return Number(b) - Number(a);
    });

    return years.map((y) => ({
      yearLabel: y,
      projects: (groups.get(y) ?? []).slice().sort((p1, p2) => p2.planned - p1.planned),
    }));
  }, [rollupQuery.data]);

  const donutItems = useMemo(() => {
    const list = rollupQuery.data ?? [];
    const filtered =
      yearFilter === "all"
        ? list
        : list.filter((p) => String(p.executionYear ?? "Sem ano") === yearFilter);

    return filtered.map((p) => ({ id: p.id, name: p.name, value: Math.max(0, p.remaining) }));
  }, [rollupQuery.data, yearFilter]);

  const donutSubtitle = useMemo(() => {
    if (yearFilter === "all") return "Saldo (Planejado − Executado) de cada projeto, considerando todos os anos";
    return `Saldo (Planejado − Executado) por projeto no ano ${yearFilter}`;
  }, [yearFilter]);

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
    const remaining = approved - executed;
    const pct = approved > 0 ? (executed / approved) * 100 : 0;
    return { approved, executed, remaining, pct };
  }, [totalsQuery.data]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <YearTotalsBars rows={yearRows} />

        <div className="grid gap-3">
          <div className="flex flex-col gap-2 rounded-3xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold tracking-tight text-[hsl(var(--ink))]">Saldo por projeto</div>
              <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
                Percentual do saldo dentro do filtro escolhido
              </div>
            </div>

            <div className="w-full sm:w-[220px]">
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="h-10 rounded-full">
                  <SelectValue placeholder="Filtrar ano" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="all">Todos os anos</SelectItem>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ProjectsShareDonut
            items={donutItems}
            title={yearFilter === "all" ? "Participação do saldo por projeto" : `Participação do saldo · ${yearFilter}`}
            subtitle={donutSubtitle}
          />
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold tracking-tight text-[hsl(var(--ink))]">
              Total arrecadado por projeto
            </div>
            <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Orçamento aprovado (planejado), agrupado por Ano de Execução
            </div>
          </div>
          <div className="text-xs text-[hsl(var(--muted-ink))]">
            Toque em um projeto para selecionar
          </div>
        </div>

        <div className="mt-5 grid gap-6">
          {projectsByYear.map((g) => (
            <div key={g.yearLabel} className="grid gap-3">
              <div
                className={cn(
                  "inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold",
                  g.yearLabel === "Sem ano"
                    ? "bg-black/5 text-[hsl(var(--muted-ink))]"
                    : "bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand-strong))]"
                )}
              >
                {g.yearLabel === "Sem ano" ? "Sem Ano de Execução" : `Execução ${g.yearLabel}`}
                <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--ink))]">
                  {g.projects.length}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {g.projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveProjectId(p.id)}
                    className={cn(
                      "text-left",
                      "rounded-3xl border bg-white p-4 shadow-sm transition hover:shadow-md",
                      activeProjectId === p.id ? "ring-2 ring-[hsl(var(--brand)/0.35)]" : ""
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold tracking-tight text-[hsl(var(--ink))]">
                          {p.name}
                        </div>
                        <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
                          Planejado: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(p.planned)}</span>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "flex-none rounded-full px-2 py-1 text-xs font-semibold",
                          activeProjectId === p.id
                            ? "bg-[hsl(var(--brand))] text-white"
                            : "bg-[hsl(var(--app-bg))] text-[hsl(var(--ink))]"
                        )}
                      >
                        {activeProjectId === p.id ? "Ativo" : "Selecionar"}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-2">
                        <div className="text-[hsl(var(--muted-ink))]">Executado</div>
                        <div className="mt-0.5 font-semibold text-[hsl(var(--ink))]">{formatBRL(p.executed)}</div>
                      </div>
                      <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-2">
                        <div className="text-[hsl(var(--muted-ink))]">Saldo</div>
                        <div
                          className={cn(
                            "mt-0.5 font-semibold",
                            p.remaining < 0 ? "text-red-600" : "text-[hsl(var(--ink))]"
                          )}
                        >
                          {formatBRL(p.remaining)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}

                {!g.projects.length ? (
                  <div className="rounded-3xl border bg-[hsl(var(--app-bg))] p-4 text-sm text-[hsl(var(--muted-ink))]">
                    Nenhum projeto.
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {!projectsByYear.length ? (
            <div className="rounded-3xl border bg-[hsl(var(--app-bg))] p-4 text-sm text-[hsl(var(--muted-ink))]">
              Nenhum projeto cadastrado.
            </div>
          ) : null}
        </div>
      </div>

      {!activeProjectId ? (
        <div className="rounded-3xl border bg-white p-6">
          <div className="text-sm font-semibold text-[hsl(var(--ink))]">Selecione um projeto</div>
          <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
            Para ver os totais do projeto (planejado, executado e saldo), selecione um projeto.
          </p>
          <Button asChild className="mt-4 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]">
            <Link to="/projects">Ir para Projetos</Link>
          </Button>
        </div>
      ) : (
        <>
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
                  Acompanhe o total planejado, execução e saldo disponível.
                </p>
              </div>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/import">Importar orçamento</Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total planejado</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
                {formatBRL(stats.approved)}
              </div>
            </Card>
            <Card className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total executado</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
                {formatBRL(stats.executed)}
              </div>
              <div
                className={cn(
                  "mt-2 inline-flex items-center gap-1 text-xs",
                  stats.pct > 90 ? "text-red-600" : "text-[hsl(var(--muted-ink))]"
                )}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                {stats.pct.toFixed(1)}% do orçamento
              </div>
            </Card>
            <Card className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Saldo (planejado − executado)</div>
              <div
                className={cn(
                  "mt-2 text-2xl font-semibold tracking-tight",
                  stats.remaining < 0 ? "text-red-600" : "text-[hsl(var(--ink))]"
                )}
              >
                {formatBRL(stats.remaining)}
              </div>
            </Card>
          </div>

          <div className="rounded-3xl border bg-white p-6">
            <div className="text-sm font-semibold text-[hsl(var(--ink))]">Próximos passos</div>
            <div className="mt-2 grid gap-3 text-sm text-[hsl(var(--muted-ink))] md:grid-cols-3">
              <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
                <div className="font-medium text-[hsl(var(--ink))]">1) Monte o orçamento</div>
                <div className="mt-1">Crie os itens/subitens no Balancete PRO.</div>
              </div>
              <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
                <div className="font-medium text-[hsl(var(--ink))]">2) Lance despesas</div>
                <div className="mt-1">Registre as despesas por subitem e mês.</div>
              </div>
              <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
                <div className="font-medium text-[hsl(var(--ink))]">3) Gere relatórios</div>
                <div className="mt-1">Exporte PDF/Excel e imprima com diagramação.</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}