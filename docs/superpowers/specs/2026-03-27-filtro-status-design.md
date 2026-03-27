# Filtro de Status no Dashboard + Migração DB

**Data:** 2026-03-27
**Projeto:** EcoBúzios - Financeiro Projetos
**Escopo:** Chips de filtro por status (Todos/Ativo/Pausado/Finalizado) na seção de cards do Dashboard, afetando cards e donut; e migração DB para fixar o default e constraint da coluna `projects.status`.

---

## Contexto

O Dashboard agora exibe um badge de status em cada card de projeto (Ativo/Pausado/Finalizado). Porém projetos de todos os status aparecem misturados na lista e no donut. O usuário quer poder filtrar a visão por status — por exemplo, ver só os projetos ativos.

O banco ainda tem `status` sem default definido em português e sem constraint de valores válidos, o que permite inserções inválidas.

---

## Seção 1 — Migração DB

Dois comandos SQL aplicados via `apply_migration` no Supabase:

```sql
ALTER TABLE projects
  ALTER COLUMN status SET DEFAULT 'ativo';

ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('ativo', 'pausado', 'finalizado'));
```

Nenhuma mudança de código frontend.

---

## Seção 2 — Hook `useDashboardData`

### Assinatura

```ts
export function useDashboardData(yearFilter: string, statusFilter: string)
```

`statusFilter` aceita `"all" | "ativo" | "pausado" | "finalizado"`. Valor `"all"` não filtra.

### Filtro em `projectsByYear`

```ts
const projectsByYear = useMemo(() => {
  const filtered = (rollupQuery.data ?? []).filter(
    (p) => statusFilter === "all" || p.status === statusFilter
  );
  // ... agrupamento por ano usando `filtered` em vez de rollupQuery.data
}, [rollupQuery.data, statusFilter]);
```

### Filtro em `donutItems`

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

### `yearRows` — sem mudança

`yearRows` (barras por ano) **não recebe** `statusFilter` — mantém a visão macro do saldo total por ano intacta.

---

## Seção 3 — UI em `Dashboard.tsx`

### Estado

```ts
const [statusFilter, setStatusFilter] = useState<string>("all");
```

Destruturar de `useDashboardData(yearFilter, statusFilter)`.

### Chips de filtro

No cabeçalho da seção "Total arrecadado por projeto", substituir o texto "Toque em um projeto para selecionar" por um conjunto de chips clicáveis:

```tsx
const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "pausado", label: "Pausado" },
  { value: "finalizado", label: "Finalizado" },
];
```

```tsx
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
```

O texto "Toque em um projeto para selecionar" é removido (não acrescenta valor com os chips presentes).

---

## Arquivos alterados

| Arquivo | Ação |
|---------|------|
| Supabase migration | `ALTER COLUMN status SET DEFAULT 'ativo'` + `ADD CONSTRAINT` |
| `src/hooks/useDashboardData.ts` | Aceitar `statusFilter`, filtrar `projectsByYear` e `donutItems` |
| `src/pages/Dashboard.tsx` | Estado `statusFilter`, chips de filtro no cabeçalho da seção |

---

## Critérios de aceite

- [ ] `projects.status` tem default `'ativo'` no banco
- [ ] `projects.status` tem constraint `CHECK (status IN ('ativo', 'pausado', 'finalizado'))`
- [ ] Chips "Todos / Ativo / Pausado / Finalizado" visíveis acima dos cards
- [ ] Chip ativo destacado com cor da brand
- [ ] Filtrar por "Ativo" remove projetos pausados/finalizados dos cards E do donut
- [ ] `yearRows` (barras por ano) não é afetado pelo filtro de status
- [ ] Default ao abrir: "Todos"
