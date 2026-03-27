# Fase 3 — TypeScript Rigoroso — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar `strict: true` no TypeScript e eliminar os `any` evitáveis nos 3 arquivos de hook/página mais críticos, substituindo por tipos seguros.

**Architecture:** Três tarefas independentes e sequenciais: (1) habilitar strict mode no tsconfig — já passa com 0 erros; (2) substituir `e: any` por `e: unknown` em handlers de erro nos 3 arquivos alvo; (3) substituir `(x as any).campo` por acesso tipado onde o campo já existe em `supabaseTypes.ts`, e marcar casts necessários de biblioteca com comentários explicativos.

**Tech Stack:** TypeScript 5, Vite, `npx tsc --noEmit` como verificação

---

## Mapeamento de arquivos

| Arquivo | O que muda |
|---------|------------|
| `tsconfig.app.json` | `strict: true`, remover `noImplicitAny: false` |
| `src/hooks/useTransactionMutations.ts` | 5× `e: any` → `e: unknown`; 5× `(editing as any).campo` → `(editing as Transaction).campo`; 1× `(t as any).amount` → `t.amount` |
| `src/hooks/useReportData.ts` | 2× `(t as any).campo` → `t.campo`; 2× `(cat as any).code` → `cat.code` |
| `src/hooks/useReportExports.ts` | 1× `e: any` → `e: unknown`; confirmar comentário no cast `(doc as any).lastAutoTable` |
| `src/pages/PlanilhaProjeto.tsx` | 8× `e: any` → `e: unknown`; 2× `(l: any)` → `(l)` em maps; 1× `(cat as any).code` → `cat.code`; 1× `(l as any).end_month` → `(l as BudgetLine).end_month`; 3× `(projectQuery.data as any)?.duration_months` → `projectQuery.data?.duration_months` |
| `src/lib/reporting.ts` | Adicionar comentários explicativos nos casts `(ws as any)` e `(wb.Workbook as any)` |

---

## Task 1: Habilitar strict mode

**Files:**
- Modify: `tsconfig.app.json`

- [ ] **Step 1: Atualizar tsconfig.app.json**

Substituir o bloco `/* Linting */` atual:

```json
/* Linting */
"strict": false,
"noUnusedLocals": false,
"noUnusedParameters": false,
"noImplicitAny": false,
"noFallthroughCasesInSwitch": false,
```

Por:

```json
/* Linting */
"strict": true,
"noUnusedLocals": false,
"noUnusedParameters": false,
"noFallthroughCasesInSwitch": false,
```

(Remove `noImplicitAny: false` — redundante com `strict: true`.)

- [ ] **Step 2: Verificar 0 erros**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit
```

Esperado: nenhuma saída, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add tsconfig.app.json
git commit -m "feat: habilitar strict: true no TypeScript"
```

---

## Task 2: Substituir `e: any` por `e: unknown` nos 3 arquivos alvo

**Files:**
- Modify: `src/hooks/useTransactionMutations.ts`
- Modify: `src/hooks/useReportExports.ts`
- Modify: `src/pages/PlanilhaProjeto.tsx`

### Padrão de substituição

**`onError` em useMutation:**
```ts
// Antes
onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),

// Depois
onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
```

**`catch` block:**
```ts
// Antes
} catch (e: any) {
  alert(e?.message ?? "Falha ao gerar PDF");
}

// Depois
} catch (e: unknown) {
  alert(e instanceof Error ? e.message : "Falha ao gerar PDF");
}
```

- [ ] **Step 1: Substituir em `useTransactionMutations.ts`**

Há 5 ocorrências. Substituir cada uma:

Linha ~158:
```ts
onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao remover anexo"),
```

Linha ~167:
```ts
onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao gerar link"),
```

Linha ~249:
```ts
onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
```

Linha ~350:
```ts
onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar"),
```

Linha ~367:
```ts
onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao excluir"),
```

- [ ] **Step 2: Substituir em `useReportExports.ts`**

Linha ~286 — catch block:
```ts
} catch (e: unknown) {
  alert(e instanceof Error ? e.message : "Falha ao gerar PDF");
}
```

- [ ] **Step 3: Substituir em `PlanilhaProjeto.tsx`**

Há 8 ocorrências de `onError: (e: any) =>`. Substituir todas usando o padrão:

```ts
onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "<mensagem original>"),
```

As mensagens originais são (na ordem em que aparecem no arquivo):
- linha ~118: `"Falha ao criar"`
- linha ~231: `"Falha ao criar item"`
- linha ~243: `"Falha ao salvar item"`
- linha ~284: `"Falha ao atualizar código"`
- linha ~323: `"Falha ao excluir item"`
- linha ~361: `"Falha ao adicionar subitem"`
- linha ~376: `"Falha ao salvar"`
- linha ~388: `"Falha ao excluir"`

- [ ] **Step 4: Verificar 0 erros de TypeScript**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit
```

Esperado: nenhuma saída, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTransactionMutations.ts src/hooks/useReportExports.ts src/pages/PlanilhaProjeto.tsx
git commit -m "feat: substituir e: any por e: unknown nos handlers de erro"
```

---

## Task 3: Tipar resultados Supabase e comentar casts de biblioteca

**Files:**
- Modify: `src/hooks/useReportData.ts`
- Modify: `src/hooks/useTransactionMutations.ts`
- Modify: `src/pages/PlanilhaProjeto.tsx`
- Modify: `src/lib/reporting.ts`
- Modify: `src/hooks/useReportExports.ts`

### Contexto de tipos disponíveis em `src/lib/supabaseTypes.ts`

```ts
BudgetCategory { code: number; ... }
BudgetLine     { end_month?: number; ... }
Transaction    { amount: number; budget_line_id: string; month_index: number;
                 description: string | null; invoice_path?: string | null; ... }
Project        { duration_months?: number; ... }
```

---

- [ ] **Step 1: Corrigir casts em `useReportData.ts`**

**Substituição 1 — `executedByLine` useMemo (linha ~103-105):**
```ts
// Antes
const lid = String((t as any).budget_line_id);
m.set(lid, (m.get(lid) ?? 0) + Number((t as any).amount ?? 0));

// Depois
const lid = String(t.budget_line_id);
m.set(lid, (m.get(lid) ?? 0) + Number(t.amount ?? 0));
```

**Substituição 2 — `executedTotal` useMemo (linha ~117):**
```ts
// Antes
return (txQuery.data ?? []).reduce((acc, t) => acc + Number((t as any).amount ?? 0), 0);

// Depois
return (txQuery.data ?? []).reduce((acc, t) => acc + Number(t.amount ?? 0), 0);
```

**Substituição 3 — `rubricasRows` useMemo — 2 ocorrências de `(cat as any).code` (linhas ~149 e ~169):**
```ts
// Antes (linha ~149)
code: String((cat as any).code),

// Depois
code: String(cat.code),
```

```ts
// Antes (linha ~169)
code: `Total Rubrica ${String((cat as any).code)}`,

// Depois
code: `Total Rubrica ${String(cat.code)}`,
```

- [ ] **Step 2: Corrigir casts em `useTransactionMutations.ts`**

**Substituição 1 — `monthTotal` useMemo (linha ~67):**
```ts
// Antes
return (txQuery.data ?? []).reduce((acc, t) => acc + Number((t as any).amount ?? 0), 0);

// Depois
return (txQuery.data ?? []).reduce((acc, t) => acc + Number(t.amount ?? 0), 0);
```

**Substituição 2 — `updateTx.mutationFn` (linhas ~286-316) — 5 casts de `editing`:**

`editing` é o parâmetro tipado como `Transaction` na interface do hook. Substituir os 5 casts `(editing as any).campo` por `(editing as Transaction).campo`:

```ts
// Antes
const oldMonthIndex = Number((editing as any).month_index ?? currentMonthIndex);
const oldLineId = String((editing as any).budget_line_id ?? "");
// ...
description: nextLine?.name ?? (editing as any).description ?? null,
// ...
if (uploaded.length && !(editing as any).invoice_path) {

// Depois
const oldMonthIndex = Number((editing as Transaction).month_index ?? currentMonthIndex);
const oldLineId = String((editing as Transaction).budget_line_id ?? "");
// ...
description: nextLine?.name ?? (editing as Transaction).description ?? null,
// ...
if (uploaded.length && !(editing as Transaction).invoice_path) {
```

Verificar que `Transaction` já está importado no arquivo (deve estar — é usado em outros casts).

- [ ] **Step 3: Corrigir casts em `PlanilhaProjeto.tsx`**

**Substituição 1 — `(projectQuery.data as any)?.duration_months` (linha ~101):**

`Project` tem `duration_months?: number`. Substituir:
```ts
// Antes
const months = Number((projectQuery.data as any)?.duration_months ?? 12);

// Depois
const months = Number(projectQuery.data?.duration_months ?? 12);
```

**Substituição 2 — `(lines ?? []).map((l: any) =>` em `renameCategoryCode.mutationFn` (linha ~260):**

`lines` é resultado de `supabase.from("budget_lines").select("id, code")`. Remover a anotação explícita `: any`:
```ts
// Antes
const updates = (lines ?? []).map((l: any) => {

// Depois
const updates = (lines ?? []).map((l) => {
```

**Substituição 3 — `(lines ?? []).map((l: any) =>` em `deleteCategory.mutationFn` (linha ~298):**
```ts
// Antes
const lineIds = (lines ?? []).map((l: any) => String(l.id));

// Depois
const lineIds = (lines ?? []).map((l) => String(l.id));
```

**Substituição 4 — `(cat as any).code` em `addSubitem.mutationFn` (linha ~337):**
```ts
// Antes
const code = nextSubitemCode(Number((cat as any).code), existingCodes);

// Depois
const code = nextSubitemCode(Number(cat.code), existingCodes);
```

**Substituição 5 — `(l as any).end_month` no JSX (linha ~589):**
```ts
// Antes
const end = clampInt(Number((l as any).end_month ?? start), 1, monthsCount);

// Depois — BudgetLine tem end_month?: number
const end = clampInt(Number((l as BudgetLine).end_month ?? start), 1, monthsCount);
```

Verificar que `BudgetLine` está importado de `@/lib/supabaseTypes` no arquivo.

- [ ] **Step 4: Adicionar comentários nos casts de biblioteca em `reporting.ts`**

Localizar o bloco onde `(ws as any)` é usado (linhas ~91 e ~103) e adicionar comentário acima do primeiro uso do bloco:

```ts
// xlsx-js-style não exporta tipos para células e workbook internos; casts necessários
const cell = (ws as any)[addr];
```

Localizar `wb.Workbook = wb.Workbook ?? ({} as any)` (linha ~122) e adicionar:

```ts
// xlsx-js-style não exporta o tipo WorkbookProperties; cast necessário para print titles
wb.Workbook = wb.Workbook ?? ({} as any);
```

- [ ] **Step 5: Confirmar comentário em `useReportExports.ts`**

Localizar linha ~151 (`(doc as any).lastAutoTable`). Se não tiver comentário explicativo, adicionar acima:

```ts
// jsPDF-autotable adiciona lastAutoTable ao objeto doc em runtime; não há tipo oficial
const endY = (doc as any).lastAutoTable?.finalY ?? 70;
```

- [ ] **Step 6: Verificar 0 erros de TypeScript**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit
```

Esperado: nenhuma saída, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useReportData.ts src/hooks/useTransactionMutations.ts src/pages/PlanilhaProjeto.tsx src/lib/reporting.ts src/hooks/useReportExports.ts
git commit -m "feat: tipar resultados Supabase e documentar casts de biblioteca"
```

---

## Critérios de aceite finais

- [ ] `tsconfig.app.json` com `strict: true` (sem `noImplicitAny: false`)
- [ ] `npx tsc --noEmit` passa com 0 erros
- [ ] Nenhum `e: any` nos 3 arquivos alvo
- [ ] `(t as any).amount`, `(t as any).budget_line_id`, `(cat as any).code` removidos dos arquivos alvo
- [ ] Casts `(ws as any)` em `reporting.ts` e `(doc as any).lastAutoTable` em `useReportExports.ts` comentados
- [ ] App funciona normalmente
