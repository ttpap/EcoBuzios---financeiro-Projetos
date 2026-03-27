import { useState } from "react";
import { useAppStore } from "@/lib/appStore";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { BarChart3, ChevronDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ProjectsShareDonut } from "@/components/dashboard/ProjectsShareDonut";
import { YearTotalsBars } from "@/components/dashboard/YearTotalsBars";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  finalizado: "Finalizado",
};

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-green-100 text-green-700",
  pausado: "bg-amber-100 text-amber-700",
  finalizado: "bg-gray-100 text-gray-500",
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "pausado", label: "Pausado" },
  { value: "finalizado", label: "Finalizado" },
];

export default function Dashboard() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const {
    yearRows,
    yearOptions,
    projectsByYear,
    donutItems,
    donutSubtitle,
    stats,
    projectData,
    updateStatus,
  } = useDashboardData(yearFilter, statusFilter);

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold tracking-tight text-[hsl(var(--ink))]">
              Total arrecadado por projeto
            </div>
            <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Orçamento aprovado (planejado), agrupado por Ano de Execução
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition",
                  statusFilter === opt.value
                    ? "bg-[hsl(var(--brand))] text-white"
                    : "bg-[hsl(var(--app-bg))] text-[hsl(var(--ink))] hover:bg-[hsl(var(--brand)/0.12)]"
                )}
              >
                {opt.label}
              </button>
            ))}
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
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveProjectId(p.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActiveProjectId(p.id); }}
                    className={cn(
                      "cursor-pointer text-left",
                      "rounded-3xl border bg-white p-4 shadow-sm transition hover:shadow-md",
                      activeProjectId === p.id ? "ring-2 ring-[hsl(var(--brand)/0.35)]" : "",
                      p.status === "pausado" || p.status === "finalizado" ? "opacity-60" : ""
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
                      <div className="flex flex-none items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                                STATUS_COLORS[p.status ?? "ativo"]
                              )}
                            >
                              {STATUS_LABELS[p.status ?? "ativo"]}
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(["ativo", "pausado", "finalizado"] as const).map((s) => (
                              <DropdownMenuItem
                                key={s}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStatus.mutate({ projectId: p.id, status: s });
                                }}
                              >
                                {STATUS_LABELS[s]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                  </div>
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
                  {projectData?.name ?? "Projeto"}
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
