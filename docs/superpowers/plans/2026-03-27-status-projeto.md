# Status de Projeto no Dashboard — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar dropdown de status (Ativo / Pausado / Finalizado) em cada card de projeto na seção "Total arrecadado por projeto" do Dashboard, persistindo em `projects.status` via Supabase.

**Architecture:** Três tarefas sequenciais: (1) camada de dados — adicionar `status` ao tipo `ProjectRollup`, ao select e ao return de `fetchProjectsRemainingRollup`, e criar `updateProjectStatus`; (2) hook — adicionar mutation `updateStatus` em `useDashboardData`; (3) UI — dropdown colorido com `e.stopPropagation()`, badge de status e `opacity-60` para projetos pausados/finalizados.

**Tech Stack:** TypeScript strict, React 19, TanStack Query v5, Supabase, Radix UI DropdownMenu (já instalado em `src/components/ui/dropdown-menu.tsx`), Sonner toast, Lucide React icons

---

## Mapeamento de arquivos

| Arquivo | Ação |
|---------|------|
| `src/lib/dashboardApi.ts` | Adicionar `status` ao tipo, ao select, ao return e criar `updateProjectStatus` |
| `src/hooks/useDashboardData.ts` | Adicionar `updateStatus` mutation, exportar no return |
| `src/pages/Dashboard.tsx` | Dropdown de status + badge colorido + opacity-60 |

---

## Task 1: Camada de dados em `dashboardApi.ts`

**Files:**
- Modify: `src/lib/dashboardApi.ts`

- [ ] **Step 1: Adicionar `status` ao tipo `ProjectRollup`**

Localizar (linha ~20-27):
```ts
export type ProjectRollup = {
  id: string;
  name: string;
  executionYear: number | null;
  planned: number;
  executed: number;
  remaining: number;
};
```

Substituir por:
```ts
export type ProjectRollup = {
  id: string;
  name: string;
  executionYear: number | null;
  planned: number;
  executed: number;
  remaining: number;
  status: string; // "ativo" | "pausado" | "finalizado"
};
```

- [ ] **Step 2: Adicionar `status` ao select de `fetchProjectsRemainingRollup`**

Localizar (linha ~65):
```ts
    .select("id,name,execution_year,created_at")
```

Substituir por:
```ts
    .select("id,name,execution_year,status,created_at")
```

- [ ] **Step 3: Adicionar `status` ao tipo da variável `list`**

Localizar (linha ~70):
```ts
  const list = (projects ?? []) as Array<{ id: string; name: string; execution_year: number | null }>;
```

Substituir por:
```ts
  const list = (projects ?? []) as Array<{ id: string; name: string; execution_year: number | null; status: string | null }>;
```

- [ ] **Step 4: Incluir `status` no objeto de retorno**

Localizar (linha ~128-135):
```ts
    return {
      id: p.id,
      name: p.name,
      executionYear: p.execution_year ?? null,
      planned,
      executed,
      remaining: planned - executed,
    };
```

Substituir por:
```ts
    return {
      id: p.id,
      name: p.name,
      executionYear: p.execution_year ?? null,
      planned,
      executed,
      remaining: planned - executed,
      status: p.status ?? "ativo",
    };
```

- [ ] **Step 5: Adicionar função `updateProjectStatus` no final do arquivo**

Após a última função, adicionar:
```ts
export async function updateProjectStatus(projectId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ status } as any)
    .eq("id", projectId);
  if (error) throw error;
}
```

- [ ] **Step 6: Verificar TypeScript**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit
```

Esperado: nenhuma saída, exit code 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && git add src/lib/dashboardApi.ts && git commit -m "feat: adicionar status ao ProjectRollup e updateProjectStatus"
```

---

## Task 2: Mutation em `useDashboardData.ts`

**Files:**
- Modify: `src/hooks/useDashboardData.ts`

- [ ] **Step 1: Atualizar imports**

Localizar linha 2:
```ts
import { useQuery } from "@tanstack/react-query";
```

Substituir por:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
```

Localizar linha 4-10:
```ts
import {
  fetchActiveBudget,
  fetchDashboardTotals,
  fetchProjectById,
  fetchProjectsRemainingRollup,
  type ProjectRollup,
} from "@/lib/dashboardApi";
```

Substituir por:
```ts
import {
  fetchActiveBudget,
  fetchDashboardTotals,
  fetchProjectById,
  fetchProjectsRemainingRollup,
  updateProjectStatus,
  type ProjectRollup,
} from "@/lib/dashboardApi";
import { toast } from "sonner";
```

- [ ] **Step 2: Instanciar `queryClient` dentro do hook**

Localizar (linha ~13):
```ts
  const activeProjectId = useAppStore((s) => s.activeProjectId);
```

Adicionar `queryClient` antes dessa linha:
```ts
  const queryClient = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
```

- [ ] **Step 3: Adicionar mutation `updateStatus`**

Adicionar após a instância de `queryClient` e antes de `rollupQuery`:
```ts
  const updateStatus = useMutation({
    mutationFn: ({ projectId, status }: { projectId: string; status: string }) =>
      updateProjectStatus(projectId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projectsRemainingRollup"] }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar status"),
  });
```

- [ ] **Step 4: Retornar `updateStatus` no objeto do hook**

Localizar (linha ~110-121):
```ts
  return {
    yearRows,
    yearOptions,
    projectsByYear,
    donutItems,
    donutSubtitle,
    stats,
    projectData: projectQuery.data,
    isLoading: rollupQuery.isLoading,
    rollupData: rollupQuery.data ?? [],
    activeProjectId,
  };
```

Substituir por:
```ts
  return {
    yearRows,
    yearOptions,
    projectsByYear,
    donutItems,
    donutSubtitle,
    stats,
    projectData: projectQuery.data,
    isLoading: rollupQuery.isLoading,
    rollupData: rollupQuery.data ?? [],
    activeProjectId,
    updateStatus,
  };
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit
```

Esperado: nenhuma saída, exit code 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && git add src/hooks/useDashboardData.ts && git commit -m "feat: adicionar updateStatus mutation em useDashboardData"
```

---

## Task 3: UI em `Dashboard.tsx`

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Atualizar imports**

Localizar linha 6:
```ts
import { BarChart3, TrendingUp } from "lucide-react";
```

Substituir por:
```ts
import { BarChart3, ChevronDown, TrendingUp } from "lucide-react";
```

Após a linha `import { useDashboardData } from "@/hooks/useDashboardData";`, adicionar:
```ts
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

- [ ] **Step 2: Adicionar constantes de status após os imports**

Antes da linha `export default function Dashboard()`, adicionar:
```ts
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
```

- [ ] **Step 3: Desestruturar `updateStatus` do hook**

Localizar (linha ~19-27):
```ts
  const {
    yearRows,
    yearOptions,
    projectsByYear,
    donutItems,
    donutSubtitle,
    stats,
    projectData,
  } = useDashboardData(yearFilter);
```

Substituir por:
```ts
  const {
    yearRows,
    yearOptions,
    projectsByYear,
    donutItems,
    donutSubtitle,
    stats,
    projectData,
    updateStatus,
  } = useDashboardData(yearFilter);
```

- [ ] **Step 4: Adicionar `opacity-60` ao botão do card e dropdown de status**

Localizar o bloco do card (linha ~101-149):
```tsx
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
```

Substituir por:
```tsx
                  <button
                    key={p.id}
                    onClick={() => setActiveProjectId(p.id)}
                    className={cn(
                      "text-left",
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
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit
```

Esperado: nenhuma saída, exit code 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && git add src/pages/Dashboard.tsx && git commit -m "feat: dropdown de status (Ativo/Pausado/Finalizado) nos cards de projeto"
```

---

## Critérios de aceite

- [ ] `ProjectRollup` tem campo `status: string`
- [ ] `fetchProjectsRemainingRollup` seleciona e retorna `status` (default `"ativo"`)
- [ ] `updateProjectStatus` existe e persiste no Supabase
- [ ] `useDashboardData` exporta `updateStatus` mutation
- [ ] Cada card tem dropdown com 3 opções (Ativo, Pausado, Finalizado)
- [ ] Badge colorido reflete o status atual (verde / âmbar / cinza)
- [ ] Cards Pausado/Finalizado têm `opacity-60`
- [ ] Clicar no dropdown não dispara seleção do projeto (`e.stopPropagation()`)
- [ ] Após salvar, a lista atualiza automaticamente (invalidateQueries)
- [ ] `npx tsc --noEmit` passa com 0 erros
