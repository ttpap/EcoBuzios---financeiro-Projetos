# Status de Projeto no Dashboard

**Data:** 2026-03-27
**Projeto:** EcoBúzios - Financeiro Projetos
**Escopo:** Adicionar dropdown de status (Ativo / Pausado / Finalizado) em cada card de projeto na seção "Participação do saldo por projeto" do Dashboard, usando `projects.status` existente no banco.

---

## Contexto

O Dashboard exibe cards de projeto agrupados por ano. Cada card mostra nome, planejado, executado e saldo. O usuário quer controlar o ciclo de vida de cada projeto (em andamento, pausado, encerrado) diretamente pelo Dashboard, sem precisar navegar para outra tela.

O campo `projects.status` já existe na tabela e no tipo TypeScript `Project`. Os valores adotados serão: `"ativo"`, `"pausado"`, `"finalizado"`. Projetos sem status definido são tratados como `"ativo"`.

---

## Seção 1 — Dados

### Tipo `ProjectRollup` em `src/lib/dashboardApi.ts`

Adicionar campo `status`:

```ts
export type ProjectRollup = {
  id: string;
  name: string;
  executionYear: number | null;
  planned: number;
  executed: number;
  remaining: number;
  status: string;  // "ativo" | "pausado" | "finalizado"
};
```

### `fetchProjectsRemainingRollup` em `src/lib/dashboardApi.ts`

Adicionar `status` ao select de projetos:

```ts
.select("id,name,execution_year,status,created_at")
```

Incluir `status` no objeto de retorno:

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

### Nova função `updateProjectStatus` em `src/lib/dashboardApi.ts`

```ts
export async function updateProjectStatus(projectId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ status } as any)
    .eq("id", projectId);
  if (error) throw error;
}
```

---

## Seção 2 — Mutation em `src/hooks/useDashboardData.ts`

Adicionar import de `updateProjectStatus` e `useQueryClient` + `useMutation`.

Adicionar mutation ao hook:

```ts
const updateStatus = useMutation({
  mutationFn: ({ projectId, status }: { projectId: string; status: string }) =>
    updateProjectStatus(projectId, status),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projectsRollup"] }),
  onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar status"),
});
```

Retornar no objeto do hook:

```ts
return {
  // ... campos existentes
  updateStatus,
};
```

---

## Seção 3 — UI em `src/pages/Dashboard.tsx`

### Estilos por status

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

### Opacidade do card

Cards com status `"pausado"` ou `"finalizado"` recebem `opacity-60`:

```tsx
<button
  className={cn(
    "text-left rounded-3xl border bg-white p-4 shadow-sm transition hover:shadow-md",
    activeProjectId === p.id ? "ring-2 ring-[hsl(var(--brand)/0.35)]" : "",
    p.status === "pausado" || p.status === "finalizado" ? "opacity-60" : ""
  )}
  onClick={() => setActiveProjectId(p.id)}
>
```

### Dropdown de status

No topo do card, ao lado do badge de seleção existente, adicionar um `DropdownMenu` com as 3 opções:

```tsx
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
```

O `e.stopPropagation()` é necessário para não disparar o `onClick` do card (que seleciona o projeto) ao clicar no dropdown.

### Layout do topo do card

```tsx
<div className="flex items-start justify-between gap-3">
  <div className="min-w-0">
    <div className="truncate text-sm font-semibold">{p.name}</div>
    <div className="mt-1 text-xs text-muted">Planejado: {formatBRL(p.planned)}</div>
  </div>
  <div className="flex flex-none items-center gap-1">
    {/* Dropdown de status */}
    <DropdownMenu>...</DropdownMenu>
    {/* Badge de seleção existente */}
    <div className={cn("rounded-full px-2 py-1 text-xs font-semibold", ...)}>
      {activeProjectId === p.id ? "Ativo" : "Selecionar"}
    </div>
  </div>
</div>
```

---

## Critérios de aceite

- [ ] `ProjectRollup` tem campo `status`
- [ ] `fetchProjectsRemainingRollup` inclui `status` do projeto
- [ ] `updateProjectStatus` existe em `dashboardApi.ts`
- [ ] `useDashboardData` exporta `updateStatus` mutation
- [ ] Cada card tem dropdown com 3 opções (Ativo, Pausado, Finalizado)
- [ ] Badge colorido reflete o status atual (verde / âmbar / cinza)
- [ ] Cards Pausado/Finalizado têm `opacity-60`
- [ ] Clicar no dropdown não dispara seleção do projeto
- [ ] Após salvar, a lista atualiza automaticamente

---

## Arquivos alterados

| Arquivo | Ação |
|---------|------|
| `src/lib/dashboardApi.ts` | Adicionar `status` ao `ProjectRollup`, ao select, ao return, e `updateProjectStatus` |
| `src/hooks/useDashboardData.ts` | Adicionar `updateStatus` mutation |
| `src/pages/Dashboard.tsx` | Dropdown de status + estilos por status |
