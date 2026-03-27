# Fase 3 — TypeScript Rigoroso

**Data:** 2026-03-27
**Projeto:** EcoBúzios - Financeiro Projetos
**Escopo:** Habilitar `strict: true` no TypeScript, corrigir os 2 erros existentes, substituir `e: any` por `e: unknown` nos 5 arquivos mais problemáticos, e tipar resultados Supabase onde possível.

---

## Contexto

A auditoria identificou `strict: false` no `tsconfig.app.json` e 148 ocorrências de `as any` no projeto. Com `--strict` ativado, apenas **2 erros** aparecem — o código já é quase compatível. Os 148 `any` são casts explícitos que se dividem em 3 categorias:

1. **Fixáveis:** `e: any` em handlers de erro, casts de resultado Supabase onde o tipo já existe
2. **Necessários (limitação de biblioteca):** xlsx/jsPDF sem tipagem adequada — manter com comentário explicativo
3. **Discutíveis:** payloads de mutation `} as any)` para INSERT/UPDATE do Supabase — manter por ora

---

## Seção 1 — Habilitar strict mode

### Mudança em `tsconfig.app.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  }
}
```

### Corrigir 2 erros existentes

**Erro 1:** `src/components/execucao/ExecucaoLancamentosDialog.tsx:204`
```
Type 'never[] | Map<string, TransactionAttachment[]>' is not assignable to type 'Map<string, TransactionAttachment[]> | undefined'
```
Fix: inicializar o valor com `new Map<string, TransactionAttachment[]>()` ao invés de `[]`.

**Erro 2:** `src/lib/edgeFunctions.ts:4`
```
Type 'unknown' is not assignable to type 'string | FormData | ...'
```
Fix: cast explícito com type assertion ou narrowing adequado.

---

## Seção 2 — Substituir `e: any` em handlers de erro

### Padrão atual
```ts
onError: (e: any) => toast.error(e.message ?? "Falha ao salvar")
catch (e: any) { toast.error(e.message) }
```

### Padrão correto
```ts
onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar")
catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro desconhecido") }
```

### Arquivos afetados

| Arquivo | Ocorrências |
|---------|------------|
| `src/hooks/useTransactionMutations.ts` | ~8 |
| `src/pages/PlanilhaProjeto.tsx` | ~8 |
| `src/hooks/useReportExports.ts` | 1 |

**Comportamento idêntico ao original** — se `e` for um `Error` (caso normal), `e.message` funciona igual. Para erros não-Error (raro), exibe a mensagem padrão.

---

## Seção 3 — Tipar resultados Supabase

### Objetivo

Substituir casts `(t as any).campo` por acesso direto quando o campo já existe no tipo TypeScript.

### Mapeamento de correções

**`src/hooks/useReportData.ts` e `src/hooks/useTransactionMutations.ts`:**

| Cast atual | Correção | Tipo |
|-----------|---------|------|
| `(t as any).amount` | `t.amount` | `Transaction.amount` existe |
| `(t as any).budget_line_id` | `t.budget_line_id` | `Transaction.budget_line_id` existe |
| `(t as any).month_index` | `t.month_index` ou cast tipado | Verificar `Transaction` type |
| `(t as any).invoice_path` | `t.invoice_path` | Verificar `Transaction` type |
| `(editing as any).month_index` | `(editing as Transaction).month_index` | Type assertion tipada |
| `(editing as any).invoice_path` | `(editing as Transaction).invoice_path` | Type assertion tipada |
| `(cat as any).code` | `cat.code` | Verificar `BudgetCategory` type |

**`src/pages/PlanilhaProjeto.tsx`:**

| Cast atual | Correção |
|-----------|---------|
| `(projectQuery.data as any)?.duration_months` | `projectQuery.data?.duration_months` — se campo existir no tipo `Project`; senão, adicionar ao tipo |
| `(line as any).end_month` | `(line as BudgetLine).end_month` — verificar se campo existe |
| `(l: any)` em maps/filters | Tipar o array com o tipo correto |

### Regra geral

Para cada `(x as any).campo`, verificar em `src/lib/supabaseTypes.ts` se o campo existe no tipo. Se sim, remover o cast. Se não, verificar se o campo existe no banco (via Supabase dashboard ou código) e adicionar ao tipo manual se necessário.

### Casts que permanecem (com comentário obrigatório)

Os casts a seguir são **necessários** por limitação de biblioteca e devem ser mantidos com comentário explicativo:

**`src/lib/reporting.ts`:**
```ts
// xlsx-js-style não exporta tipos para WorkSheet/Workbook internos
const cell = (ws as any)[addr];
wb.Workbook = wb.Workbook ?? ({} as any);
```

**`src/hooks/useReportExports.ts`:**
```ts
// jsPDF-autotable adiciona lastAutoTable ao objeto doc em runtime
const endY = (doc as any).lastAutoTable?.finalY ?? 70;
```

**Payloads de mutation `} as any)`:**
Manter por ora — os tipos gerados pelo Supabase às vezes divergem do schema real para INSERT/UPDATE. Resolver na Fase de tipos Supabase (futura).

---

## Arquivos fora do escopo desta fase

Os demais 72 `any` nos outros arquivos (`ExecucaoProjeto`, `Balancete`, `ImportBudget`, `ImportConferencia`, `Fornecedores`, etc.) ficam para uma limpeza futura ou quando esses arquivos forem modificados por outras razões.

---

## Critérios de aceite

- [ ] `tsconfig.app.json` com `strict: true`
- [ ] `npx tsc --noEmit` passa com 0 erros após habilitar strict
- [ ] Nenhum `e: any` nos 3 arquivos alvo
- [ ] `(t as any).amount`, `(t as any).budget_line_id` substituídos por acesso tipado
- [ ] Casts de biblioteca marcados com comentário explicativo
- [ ] App funciona normalmente após as mudanças

---

## Ordem de execução

1. Habilitar strict + corrigir 2 erros → verificar tsc
2. Substituir `e: any` nos 3 arquivos
3. Tipar resultados Supabase nos arquivos alvo
4. Marcar casts necessários com comentários
