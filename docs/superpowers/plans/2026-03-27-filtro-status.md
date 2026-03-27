# Filtro de Status no Dashboard — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar chips de filtro por status (Todos/Ativo/Pausado/Finalizado) no Dashboard e fixar o constraint da coluna `projects.status` no banco.

**Architecture:** Três tarefas independentes e sequenciais: (1) migração DB via Supabase MCP — sem código frontend; (2) hook `useDashboardData` recebe `statusFilter` e filtra `projectsByYear` e `donutItems`; (3) Dashboard.tsx adiciona estado `statusFilter` e chips de filtro no cabeçalho da seção de cards.

**Tech Stack:** TypeScript strict, React 19, TanStack Query v5, Supabase MCP, Tailwind CSS

---

## Mapeamento de arquivos

| Arquivo | Ação |
|---------|------|
| Supabase migration (via MCP) | DEFAULT `'ativo'` + CHECK constraint |
| `src/hooks/useDashboardData.ts` | Aceitar `statusFilter: string`, filtrar `projectsByYear` e `donutItems` |
| `src/pages/Dashboard.tsx` | Estado `statusFilter`, chips de filtro, passar para hook |

---

## Task 1: Migração DB

**Files:**
- Supabase migration via MCP (`apply_migration`)

- [ ] **Step 1: Aplicar migração**

Usar a ferramenta MCP `apply_migration` no projeto `pttidjztgnqcyrsreygn` com o SQL:

```sql
ALTER TABLE projects
  ALTER COLUMN status SET DEFAULT 'ativo';

ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('ativo', 'pausado', 'finalizado'));
```

Nome da migração: `fix_projects_status_default_and_constraint`

- [ ] **Step 2: Verificar migração**

Usar `execute_sql` para confirmar:

```sql
SELECT column_default, check_clause
FROM information_schema.columns c
LEFT JOIN information_schema.check_constraints cc
  ON cc.constraint_name = 'projects_status_check'
WHERE c.table_name = 'projects' AND c.column_name = 'status';
```

Esperado: `column_default = 'ativo'` e `check_clause` presente.

- [ ] **Step 3: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && git add -A && git commit -m "feat: constraint e default 'ativo' na coluna projects.status"
```

---

## Task 2: Hook `useDashboardData`

**Files:**
- Modify: `src/hooks/useDashboardData.ts`

- [ ] **Step 1: Adicionar `statusFilter` à assinatura do hook**

Localizar (linha 14):
```ts
export function useDashboardData(yearFilter: string) {
```

Substituir por:
```ts
export function useDashboardData(yearFilter: string, statusFilter: string) {
```

- [ ] **Step 2: Filtrar `projectsByYear` por statusFilter**

Localizar (linhas 60-77):
```ts
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
```

Substituir por:
```ts
  const projectsByYear = useMemo(() => {
    const source = (rollupQuery.data ?? []).filter(
      (p) => statusFilter === "all" || p.status === statusFilter
    );
    const groups = new Map<string, ProjectRollup[]>();
    for (const p of source) {
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
  }, [rollupQuery.data, statusFilter]);
```

- [ ] **Step 3: Filtrar `donutItems` por statusFilter**

Localizar (linhas 79-87):
```ts
  const donutItems = useMemo(() => {
    const list = rollupQuery.data ?? [];
    const filtered =
      yearFilter === "all"
        ? list
        : list.filter((p) => String(p.executionYear ?? "Sem ano") === yearFilter);

    return filtered.map((p) => ({ id: p.id, name: p.name, value: Math.max(0, p.remaining) }));
  }, [rollupQuery.data, yearFilter]);
```

Substituir por:
```ts
  const donutItems = useMemo(() => {
    const list = (rollupQuery.data ?? []).filter(
      (p) => statusFilter === "all" || p.status === statusFilter
    );
    const filtered =
      yearFilter === "all"
        ? list
        : list.filter((p) => String(p.executionYear ?? "Sem ano") === yearFilter);

    return filtered.map((p) => ({ id: p.id, name: p.name, value: Math.max(0, p.remaining) }));
  }, [rollupQuery.data, yearFilter, statusFilter]);
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit
```

Esperado: nenhuma saída, exit code 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && git add src/hooks/useDashboardData.ts && git commit -m "feat: filtrar projectsByYear e donutItems por statusFilter"
```

---

## Task 3: UI em `Dashboard.tsx`

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Adicionar estado `statusFilter`**

Localizar (linha 35):
```ts
  const [yearFilter, setYearFilter] = useState<string>("all");
```

Adicionar logo abaixo:
```ts
  const [statusFilter, setStatusFilter] = useState<string>("all");
```

- [ ] **Step 2: Passar `statusFilter` ao hook**

Localizar (linha 46):
```ts
  } = useDashboardData(yearFilter);
```

Substituir por:
```ts
  } = useDashboardData(yearFilter, statusFilter);
```

- [ ] **Step 3: Adicionar constante de opções de filtro**

Após as constantes `STATUS_COLORS` (linha ~30), antes de `export default function Dashboard()`, adicionar:

```ts
const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "pausado", label: "Pausado" },
  { value: "finalizado", label: "Finalizado" },
];
```

- [ ] **Step 4: Substituir cabeçalho da seção de cards**

Localizar (linhas 87-100):
```tsx
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
```

Substituir por:
```tsx
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
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit
```

Esperado: nenhuma saída, exit code 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && git add src/pages/Dashboard.tsx && git commit -m "feat: chips de filtro por status nos cards do Dashboard"
```

---

## Critérios de aceite

- [ ] `projects.status` tem default `'ativo'` no banco
- [ ] `projects.status` tem constraint `CHECK (status IN ('ativo', 'pausado', 'finalizado'))`
- [ ] Chips "Todos / Ativo / Pausado / Finalizado" visíveis no cabeçalho da seção de cards
- [ ] Chip selecionado destacado com cor da brand (fundo `--brand`, texto branco)
- [ ] Filtrar por "Ativo" remove projetos pausados/finalizados dos cards E do donut
- [ ] `yearRows` (barras por ano) não é afetado pelo filtro de status
- [ ] Default ao abrir: "Todos" (todos os projetos visíveis)
- [ ] `npx tsc --noEmit` passa com 0 erros
