import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CalendarRange, CheckCircle2, ClipboardList, Gauge, Wallet } from "lucide-react";
import { useAppStore } from "@/lib/appStore";
import {
  fetchActiveBudget,
  fetchDashboardTotals,
  fetchProjectsDashboardRows,
  groupProjectsDashboardRowsByYear,
} from "@/lib/dashboard";
import type { Project } from "@/lib/supabaseTypes";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardStatCard } from "@/components/dashboard/DashboardStatCard";
import { FinancialSplitCard } from "@/components/dashboard/FinancialSplitCard";

export default function DashboardProjeto() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  const projectsQuery = useQuery({
    queryKey: ["dashboard-rollup"],
    queryFn: fetchProjectsDashboardRows,
  });

  const groupedProjects = useMemo(
    () => groupProjectsDashboardRowsByYear(projectsQuery.data ?? []),
    [projectsQuery.data]
  );

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
    const planned = totalsQuery.data?.approved ?? 0;
    const executed = totalsQuery.data?.executed ?? 0;
    const remaining = planned - executed;
    const pct = planned > 0 ? (executed / planned) * 100 : 0;
    return { planned, executed, remaining, pct };
  }, [totalsQuery.data]);

  const activeProjectRow = useMemo(
    () => (projectsQuery.data ?? []).find((project) => project.id === activeProjectId) ?? null,
    [projectsQuery.data, activeProjectId]
  );

  if (!activeProjectId || !activeProjectRow) {
    return (
      <div className="grid gap-6">
        <div className="rounded-[28px] border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-semibold text-[hsl(var(--brand))]">
                <BarChart3 className="h-3.5 w-3.5" />
                Dashboard do Projeto
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[hsl(var(--ink))]">
                Selecione um projeto para ver a visão detalhada
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[hsl(var(--muted-ink))]">
                Aqui você verá somente os números do projeto escolhido: total planejado, total executado,
                saldo restante e percentual de execução.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/dashboard">Voltar ao Dashboard Geral</Link>
              </Button>
              <Button asChild className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]">
                <Link to="/projects">Escolher projeto</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {groupedProjects.map((group) => (
            <Card key={group.yearLabel} className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-semibold text-[hsl(var(--brand-strong))]">
                    {group.yearLabel === "Sem ano" ? "Sem Ano de Execução" : `Execução ${group.yearLabel}`}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-ink))]">{group.projects.length} projeto(s)</div>
                </div>
                <div className="text-sm text-[hsl(var(--muted-ink))]">
                  Total planejado do ano: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(group.planned)}</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => setActiveProjectId(project.id)}
                    className="rounded-3xl border bg-[hsl(var(--app-bg))] p-4 text-left transition hover:bg-white hover:shadow-sm"
                  >
                    <div className="truncate text-base font-semibold tracking-tight text-[hsl(var(--ink))]">{project.name}</div>
                    <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
                      {project.projectNumber ? `#${project.projectNumber} · ` : ""}
                      {project.durationMonths} meses
                    </div>
                    <div className="mt-4 text-xs font-medium text-[hsl(var(--muted-ink))]">Planejado do projeto</div>
                    <div className="mt-1 text-xl font-semibold tracking-tight text-[hsl(var(--ink))]">
                      {formatBRL(project.planned)}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-[hsl(var(--muted-ink))]">
                      <span>Executado: {formatBRL(project.executed)}</span>
                      <span className="font-semibold text-[hsl(var(--ink))]">Selecionar</span>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-[28px] border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-semibold text-[hsl(var(--brand))]">
              <BarChart3 className="h-3.5 w-3.5" />
              Dashboard do Projeto
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              {projectQuery.data?.name ?? activeProjectRow.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[hsl(var(--muted-ink))]">
              {activeProjectRow.projectNumber ? (
                <span className="rounded-full bg-[hsl(var(--app-bg))] px-3 py-1 font-semibold text-[hsl(var(--ink))]">
                  #{activeProjectRow.projectNumber}
                </span>
              ) : null}
              <span className="rounded-full bg-[hsl(var(--app-bg))] px-3 py-1 font-semibold text-[hsl(var(--ink))]">
                {activeProjectRow.executionYear ? `Execução ${activeProjectRow.executionYear}` : "Sem ano"}
              </span>
              <span className="rounded-full bg-[hsl(var(--app-bg))] px-3 py-1 font-semibold text-[hsl(var(--ink))]">
                {activeProjectRow.durationMonths} meses
              </span>
            </div>
            {projectQuery.data?.description ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[hsl(var(--muted-ink))]">
                {projectQuery.data.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/dashboard">Dashboard Geral</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/projects">Trocar projeto</Link>
            </Button>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          title="Valor total planejado"
          value={formatBRL(stats.planned)}
          hint="Total aprovado do projeto"
          icon={Wallet}
          tone="amber"
        />
        <DashboardStatCard
          title="Valor total executado"
          value={formatBRL(stats.executed)}
          hint="Soma dos lançamentos do projeto"
          icon={CheckCircle2}
          tone="teal"
        />
        <DashboardStatCard
          title="Saldo restante"
          value={formatBRL(stats.remaining)}
          hint="Valor ainda disponível"
          icon={Gauge}
          tone={stats.remaining < 0 ? "red" : "brand"}
        />
        <DashboardStatCard
          title="Percentual de execução"
          value={`${stats.pct.toFixed(1)}%`}
          hint="Quanto do projeto já foi executado"
          icon={BarChart3}
          tone={stats.pct > 90 ? "red" : "violet"}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <FinancialSplitCard
          title="Gráfico do projeto"
          description="Leitura visual do total do projeto, do valor já executado e do saldo restante disponível."
          planned={stats.planned}
          executed={stats.executed}
          remaining={stats.remaining}
        />

        <Card className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold tracking-tight text-[hsl(var(--ink))]">Atalhos do projeto</div>
          <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
            Acesse rapidamente as áreas operacionais do projeto selecionado.
          </div>

          <div className="mt-5 grid gap-3">
            <Button asChild className="justify-between rounded-2xl bg-[hsl(var(--brand))] px-4 text-white hover:bg-[hsl(var(--brand-strong))]">
              <Link to="/balancete">
                Balancete PRO
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between rounded-2xl px-4">
              <Link to="/balancete/execucao">
                Execução do Projeto
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between rounded-2xl px-4">
              <Link to="/balancete/relatorios">
                Relatórios do Projeto
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[hsl(var(--app-bg))] p-4">
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Ano de Execução</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--ink))]">
                <CalendarRange className="h-4 w-4" />
                {activeProjectRow.executionYear ?? "Não informado"}
              </div>
            </div>
            <div className="rounded-2xl bg-[hsl(var(--app-bg))] p-4">
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Duração do projeto</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--ink))]">
                <ClipboardList className="h-4 w-4" />
                {activeProjectRow.durationMonths} meses
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold tracking-tight text-[hsl(var(--ink))]">Trocar projeto</div>
            <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Selecione outro projeto sem sair do dashboard.
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4">
          {groupedProjects.map((group) => (
            <div key={group.yearLabel} className="rounded-3xl border bg-[hsl(var(--app-bg))] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[hsl(var(--ink))] ring-1 ring-black/5">
                  {group.yearLabel === "Sem ano" ? "Sem Ano de Execução" : `Execução ${group.yearLabel}`}
                </div>
                <div className="text-xs text-[hsl(var(--muted-ink))]">{group.projects.length} projeto(s)</div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {group.projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => setActiveProjectId(project.id)}
                    className={cn(
                      "rounded-2xl bg-white px-3 py-3 text-left ring-1 ring-black/5 transition hover:bg-black/5",
                      activeProjectId === project.id ? "ring-2 ring-[hsl(var(--brand)/0.35)]" : ""
                    )}
                  >
                    <div className="truncate text-sm font-semibold text-[hsl(var(--ink))]">{project.name}</div>
                    <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
                      Planejado {formatBRL(project.planned)} · Executado {formatBRL(project.executed)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
