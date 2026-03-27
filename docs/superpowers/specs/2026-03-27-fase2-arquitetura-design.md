# Fase 2 — Arquitetura: Extração de Hooks e Utilitários

**Data:** 2026-03-27
**Projeto:** EcoBúzios - Financeiro Projetos
**Escopo:** Refatorar os 3 componentes maiores extraindo hooks customizados e funções utilitárias, reduzindo cada componente ao mínimo de responsabilidade (só rendering).

---

## Contexto

A auditoria identificou 3 componentes com mistura excessiva de responsabilidades:

| Componente | Linhas | Problema |
|-----------|--------|---------|
| `ExecucaoLancamentosDialog.tsx` | 926 | Utilitários de arquivo + 12 estados + 6 mutations + UI |
| `BalanceteRelatorios.tsx` | 814 | 6 queries + mapeamento + builders de relatório + exports + UI |
| `Dashboard.tsx` | 472 | Funções async soltas + 6 aggregations + UI |

**Abordagem:** Extrair hooks customizados por componente + funções puras para `lib/`. Cada unidade terá uma responsabilidade clara e poderá ser entendida/testada de forma independente. Sem criar camada de queries compartilhada (overkill para este app).

---

## Seção 1 — ExecucaoLancamentosDialog

### Arquivos

**Criar:**
- `src/lib/fileUtils.ts` — funções puras de processamento de arquivo
- `src/hooks/useTransactionForm.ts` — estado do formulário
- `src/hooks/useTransactionMutations.ts` — queries e mutations de transações

**Modificar:**
- `src/components/execucao/ExecucaoLancamentosDialog.tsx` — remover lógica extraída, consumir hooks

### Detalhes

**`src/lib/fileUtils.ts`**

Mover as funções puras atualmente no topo de `ExecucaoLancamentosDialog.tsx`:
- Compressão/conversão de imagem para PDF em baixa resolução
- Sanitização de nome de arquivo
- Qualquer outra função pura sem dependências React

Interface pública:
```ts
export function sanitizeFileName(name: string): string
export function compressImageToPdf(file: File): Promise<Blob>
export function isImageFile(file: File): boolean
```

**`src/hooks/useTransactionForm.ts`**

Encapsula os 12 `useState` do formulário (vendor, amount, dates, payment method, files, edit mode etc).

Interface pública:
```ts
export function useTransactionForm(initialValues?: Partial<TransactionFormFields>) {
  return {
    fields: TransactionFormFields,
    setField: (key, value) => void,
    reset: () => void,
  }
}
```

**`src/hooks/useTransactionMutations.ts`**

Encapsula as 3 useQuery e 6 useMutation do componente:
- Queries: `linesForSelect`, `transactions`, `attachments`
- Mutations: `createTx`, `updateTx`, `deleteTx`, `addAttachment`, `removeAttachment`, `getSignedUrl`

Interface pública:
```ts
export function useTransactionMutations(params: { budgetLineId: string; budgetId: string }) {
  return {
    transactions: Transaction[],
    attachments: Attachment[],
    isLoading: boolean,
    createTx: UseMutationResult,
    updateTx: UseMutationResult,
    deleteTx: UseMutationResult,
    addAttachment: UseMutationResult,
    removeAttachment: UseMutationResult,
    getSignedUrl: UseMutationResult,
  }
}
```

**`ExecucaoLancamentosDialog.tsx` após refatoração**

Responsabilidade: só rendering. Consome `useTransactionForm`, `useTransactionMutations`, e importa de `fileUtils`.
Tamanho estimado: ~150 linhas.

---

## Seção 2 — BalanceteRelatorios

### Arquivos

**Criar:**
- `src/lib/reportBuilders.ts` — funções puras que constroem linhas de relatório
- `src/hooks/useReportData.ts` — 6 queries + 4 memos de mapeamento de dados
- `src/hooks/useReportExports.ts` — handlers de exportação PDF e Excel + printRef

**Modificar:**
- `src/pages/BalanceteRelatorios.tsx` — remover lógica extraída, consumir hooks

### Detalhes

**`src/lib/reportBuilders.ts`**

Funções puras sem dependências React que recebem dados mapeados e retornam arrays de linhas:

```ts
export function buildRubricasRows(params: RubricasParams): ReportRow[]
export function buildLancamentosRows(params: LancamentosParams): ReportRow[]
export function buildNotasRows(params: NotasParams): ReportRow[]
```

**`src/hooks/useReportData.ts`**

Encapsula as 6 useQuery (project, budget, categories, lines, transactions, vendors) e os 4 useMemo de mapeamento (vendorById, lineById, executedByLine, totals).

```ts
export function useReportData(projectId: string, budgetId: string) {
  return {
    rubricasRows: ReportRow[],
    lancamentosRows: ReportRow[],
    notasRows: ReportRow[],
    projectName: string,
    isLoading: boolean,
  }
}
```

**`src/hooks/useReportExports.ts`**

Encapsula os handlers de PDF (jsPDF) e Excel (xlsx) e o `useRef` para impressão.

```ts
export function useReportExports(data: ReportExportData) {
  return {
    printRef: React.RefObject<HTMLDivElement>,
    exportPdf: () => void,
    exportExcel: () => void,
  }
}
```

**`BalanceteRelatorios.tsx` após refatoração**

Responsabilidade: só tabs + botões de download. Consome `useReportData` e `useReportExports`.
Tamanho estimado: ~80 linhas.

---

## Seção 3 — Dashboard

### Arquivos

**Criar:**
- `src/lib/dashboardApi.ts` — 3 funções async que chamam Supabase
- `src/hooks/useDashboardData.ts` — rollupQuery + 6 useMemo de aggregation

**Modificar:**
- `src/pages/Dashboard.tsx` — remover lógica extraída, consumir hook

### Detalhes

**`src/lib/dashboardApi.ts`**

Move as 3 funções async atualmente declaradas no module level de `Dashboard.tsx`:

```ts
export async function fetchActiveBudget(projectId: string): Promise<Budget | null>
export async function fetchDashboardTotals(budgetId: string): Promise<Totals>
export async function fetchProjectsRemainingRollup(projectIds: string[]): Promise<ProjectRollup[]>
```

**`src/hooks/useDashboardData.ts`**

Encapsula o `rollupQuery` e os 6 `useMemo` (yearRows, yearOptions, projectsByYear, donutItems, filteredProjects, filteredTotals).

```ts
export function useDashboardData(yearFilter: string | null) {
  // Lê activeProjectId internamente do Zustand store
  return {
    yearRows: YearRow[],
    yearOptions: string[],
    projectsByYear: Record<string, ProjectRollup[]>,
    donutItems: DonutItem[],
    filteredProjects: ProjectRollup[],
    filteredTotals: Totals,
    isLoading: boolean,
  }
}
```

**`Dashboard.tsx` após refatoração**

Responsabilidade: `useState(yearFilter)` + rendering. Consome `useDashboardData`.
Tamanho estimado: ~150 linhas.

---

## Princípios aplicados a todos os componentes

1. **`lib/`** — apenas funções puras sem imports React. Testáveis com Jest puro.
2. **`hooks/`** — lógica React (useState, useQuery, useMutation, useMemo). Testáveis com React Testing Library.
3. **Componente** — apenas JSX. Sem lógica de negócio.
4. **Interfaces explícitas** — cada hook tem tipos de retorno definidos.
5. **Zero mudanças de comportamento** — refatoração pura, sem alterar features.

---

## Critérios de aceite

- [ ] `ExecucaoLancamentosDialog.tsx` ≤ 200 linhas
- [ ] `BalanceteRelatorios.tsx` ≤ 120 linhas
- [ ] `Dashboard.tsx` ≤ 200 linhas
- [ ] Todos os arquivos em `src/lib/` sem imports React
- [ ] App funciona igual após cada refatoração (sem regressões visuais ou funcionais)
- [ ] Cada novo arquivo tem responsabilidade única e bem definida

---

## Ordem de execução

1. `ExecucaoLancamentosDialog` — maior risco, maior ganho
2. `BalanceteRelatorios` — independente
3. `Dashboard` — mais simples, finaliza a fase
