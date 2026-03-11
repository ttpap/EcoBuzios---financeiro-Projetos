import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BarChart3, CalendarRange, CheckCircle2, FolderKanban, Gauge, Wallet } from "lucide-react";
import { useAppStore } from "@/lib/appStore";
import { fetchProjectsDashboardRows, getGlobalDashboardStats, groupProjectsDashboardRowsByYear } from "@/lib/dashboard";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardStatCard } from "@/components/dashboard/DashboardStatCard";
import { FinancialSplitCard } from "@/components/dashboard/FinancialSplitCard";
import { PageHeader } from "@/components/app/PageHeader";

export default function Dashboard() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  const rollupQuery = useQuery({
    queryKey: ["dashboard-rollup"],
    queryFn: fetchProjectsDashboardRows,
  });

  const rows = rollupQuery.data ?? [];
  const globalStats = useMemo(() => getGlobalDashboardStats(rows), [rows]);
  const projectsByYear = useMemo(() => groupProjectsDashboardRowsByYear(rows), [rows]);

  return (
    <div className="grid gap-6">
      <PageHeader
        badge={
          <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-semibold text-[hsl(var(--brand))]">
            <BarChart3 className="h-3.5 w-3.5" />
            Dashboard Geral
          </div>
        }
        title="Visão consolidada de todos os projetos"
        description={
          "Acompanhe o panorama completo do sistema com totais consolidados e leitura rápida da execução financeira."
        }
        actions={
          <>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/projects">Gerenciar projetos</Link>
            </Button>
            <Button
              asChild
              className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
            >
              <Link to="/balancete">Abrir módulo Balancete</Link>
            </Button>
          </>
        }
      />

      <section className="grid gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <DashboardStatCard
            title="Projetos cadastrados"
            value={String(globalStats.totalProjects)}
            hint="Projetos ativos no sistema"
            icon={FolderKanban}
            tone="brand"
          />
          <DashboardStatCard
            title="Valor total planejado"
            value={formatBRL(globalStats.planned)}
            hint="Soma de todos os orçamentos"
            icon={Wallet}
            tone="amber"
          />
          <DashboardStatCard
            title="Valor total executado"
            value={formatBRL(globalStats.executed)}
            hint="Soma de todos os lançamentos"
            icon={CheckCircle2}
            tone="teal"
          />
          <DashboardStatCard
            title="Execução geral"
            value={`${globalStats.pct.toFixed(1)}%`}
            hint="Percentual executado do sistema"
            icon={Gauge}
            tone={globalStats.pct > 90 ? "red" : "violet"}
          />
          <DashboardStatCard
            title="Saldo total disponível"
            value={formatBRL(globalStats.remaining)}
            hint="Planejado menos executado"
            icon={BarChart3}
            tone={globalStats.remaining < 0 ? "red" : "brand"}
          />
        </div>

        <FinancialSplitCard
          title="Resumo consolidado"
          description="Leitura simples do total planejado, total executado e saldo restante do sistema."
          planned={globalStats.planned}
          executed={globalStats.executed}
          remaining={globalStats.remaining}
        />
      </section>

      <section className="grid gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-[hsl(var(--ink))]">Projetos por ano</h2>
            <p className="text-sm text-[hsl(var(--muted-ink))]">
              Selecione um projeto para trabalhar no Balancete e acompanhar a execução.
            </p>
          </div>

          {activeProjectId ? (
            <Button variant="outline" className="rounded-full" onClick={() => setActiveProjectId(null)}>
              Limpar projeto ativo
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4">
          {projectsByYear.map((group) => (
            <Card key={group.yearLabel} className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-semibold text-[hsl(var(--brand-strong))]">
                    {group.yearLabel === "Sem ano" ? "Sem Ano de Execução" : `Execução ${group.yearLabel}`}
                  </div>
                  <div className="rounded-full bg-[hsl(var(--app-bg))] px-3 py-1 text-xs font-semibold text-[hsl(var(--ink))]">
                    <CalendarRange className="mr-1 inline h-3.5 w-3.5" />
                    {group.projects.length} projeto(s)
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="text-[hsl(var(--muted-ink))]">
                    Planejado: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(group.planned)}</span>
                  </div>
                  <div className="text-[hsl(var(--muted-ink))]">
                    Executado: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(group.executed)}</span>
                  </div>
                  <div className="text-[hsl(var(--muted-ink))]">
                    Saldo: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(group.remaining)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.projects.map((project) => (
                  <Card
                    key={project.id}
                    className={cn(
                      "rounded-3xl border bg-[hsl(var(--app-bg))] p-4 shadow-none transition hover:bg-white hover:shadow-sm",
                      activeProjectId === project.id ? "ring-2 ring-[hsl(var(--brand)/0.35)]" : ""
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold tracking-tight text-[hsl(var(--ink))]">{project.name}</div>
                        <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
                          {project.projectNumber ? `#${project.projectNumber} · ` : ""}
                          {project.durationMonths} meses
                        </div>
                      </div>
                      {activeProjectId === project.id ? (
                        <div className="rounded-full bg-[hsl(var(--brand))] px-2 py-1 text-[10px] font-semibold text-white">Ativo</div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
                        <div className="text-[11px] font-medium text-[hsl(var(--muted-ink))]">Planejado</div>
                        <div className="mt-1 text-sm font-semibold text-[hsl(var(--ink))]">{formatBRL(project.planned)}</div>
                      </div>
                      <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
                        <div className="text-[11px] font-medium text-[hsl(var(--muted-ink))]">Executado</div>
                        <div className="mt-1 text-sm font-semibold text-[hsl(var(--ink))]">{formatBRL(project.executed)}</div>
                      </div>
                      <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
                        <div className="text-[11px] font-medium text-[hsl(var(--muted-ink))]">Saldo</div>
                        <div className="mt-1 text-sm font-semibold text-[hsl(var(--ink))]">{formatBRL(project.remaining)}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant={activeProjectId === project.id ? "default" : "outline"}
                        className={cn(
                          "rounded-full",
                          activeProjectId === project.id
                            ? "bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                            : ""
                        )}
                        onClick={() => setActiveProjectId(project.id)}
                      >
                        {activeProjectId === project.id ? "Projeto ativo" : "Selecionar"}
                      </Button>

                      <Button asChild variant="outline" className="rounded-full">
                        <Link to="/balancete" onClick={() => setActiveProjectId(project.id)}>
                          Abrir Balancete
                        </Link>
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          ))}

          {!projectsByYear.length ? (
            <div className="rounded-3xl border bg-white p-6 text-sm text-[hsl(var(--muted-ink))]">Nenhum projeto cadastrado ainda.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}