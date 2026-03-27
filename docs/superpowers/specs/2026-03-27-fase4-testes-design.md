# Fase 4 — Testes Unitários para Funções Financeiras

**Data:** 2026-03-27
**Projeto:** EcoBúzios - Financeiro Projetos
**Escopo:** Instalar Vitest, extrair funções de cálculo de `PlanilhaProjeto.tsx` para `src/lib/budgetUtils.ts`, e cobrir as funções puras financeiras com testes unitários.

---

## Contexto

O projeto não tem nenhum framework de testes. A auditoria identificou funções puras críticas sem cobertura:

- `parsePtBrMoneyToNumber` — usado em todos os lançamentos financeiros; erros silenciosos de parsing causariam valores errados no banco
- `calcMonthAmount` — distribui o orçamento de uma rubrica pelos meses; erro afeta a planilha inteira
- `nextSubitemCode` — gera códigos de subitem; lógica de prefixo com casos de borda

---

## Seção 1 — Setup do Vitest

### Instalação

```bash
npm install --save-dev vitest
```

### Configuração em `vite.config.ts`

Adicionar bloco `test` dentro do `defineConfig` existente:

```ts
import { defineConfig } from "vite";
// ... imports existentes

export default defineConfig({
  // ... config existente

  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

Isso reutiliza os path aliases `@/*` já definidos sem arquivo de config separado.

### Scripts em `package.json`

Adicionar ao bloco `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

### Verificação

```bash
npx vitest run
```

Esperado: framework inicializa sem erros (mesmo sem testes ainda).

---

## Seção 2 — Extração para `src/lib/budgetUtils.ts`

### Objetivo

Tornar `calcMonthAmount` e `nextSubitemCode` testáveis extraindo-as de `PlanilhaProjeto.tsx` para `src/lib/budgetUtils.ts`.

### Interface pública

```ts
import { BudgetLine } from "@/lib/supabaseTypes";

/**
 * Calcula o valor de uma linha de orçamento para um mês específico.
 * Distribui total_approved igualmente entre start_month e end_month.
 * Retorna 0 se monthIndex1 estiver fora do intervalo.
 */
export function calcMonthAmount(line: BudgetLine, monthIndex1: number): number

/**
 * Retorna o próximo código de subitem para um item pai.
 * Ex: itemCode=1, existingCodes=["1.1","1.2"] → "1.3"
 * Ex: itemCode=2, existingCodes=[] → "2.1"
 */
export function nextSubitemCode(
  itemCode: number,
  existingCodes: Array<string | null | undefined>
): string
```

### Dependência auxiliar

`calcMonthAmount` usa `monthlyValue` internamente — incluir como função privada (não exportada) no mesmo arquivo.

### Atualização de `PlanilhaProjeto.tsx`

Substituir as definições locais por imports:

```ts
import { calcMonthAmount, nextSubitemCode } from "@/lib/budgetUtils";
```

Manter `clampInt` e `buildMonthLabels` locais em `PlanilhaProjeto.tsx` — não são testáveis por valor e não precisam de extração.

---

## Seção 3 — Arquivos de teste

### `src/lib/money.test.ts`

Cobre `parsePtBrMoneyToNumber` e `formatBRL`.

**Casos para `parsePtBrMoneyToNumber`:**

| Input | Esperado | Cenário |
|-------|---------|---------|
| `"1.234,56"` | `1234.56` | pt-BR com separador de milhar |
| `"1234,56"` | `1234.56` | apenas vírgula decimal |
| `"R$ 1.234,56"` | `1234.56` | com símbolo de moeda |
| `"1234.56"` | `1234.56` | formato US (sem vírgula) |
| `"0"` | `0` | zero |
| `""` | `0` | string vazia |
| `"abc"` | `0` | inválido |
| `"-100,50"` | `-100.50` | valor negativo |
| `"1.000.000,00"` | `1000000.00` | milhão |

**Casos para `formatBRL`:**

| Input | Esperado |
|-------|---------|
| `1234.56` | `"R$ 1.234,56"` |
| `0` | `"R$ 0,00"` |
| `-50` | `"-R$ 50,00"` |

---

### `src/lib/reportBuilders.test.ts`

Cobre `normalizePayMethod` e `formatDateBR`.

**Casos para `normalizePayMethod`:**

| Input | Esperado |
|-------|---------|
| `"transferencia"` | `"Transferência"` |
| `"cheque"` | `"Cheque"` |
| `"boleto"` | `"Boleto"` |
| `"pix"` | `"Pix"` |
| `null` | `"-"` |
| `""` | `"-"` |
| `"outro"` | `"outro"` |

**Casos para `formatDateBR`:**

| Input | Esperado |
|-------|---------|
| `"2024-03-15"` | `"15/03/2024"` |
| `"2024-01-01"` | `"01/01/2024"` |
| `null` | `""` |
| `""` | `""` |
| `undefined` | `""` |

---

### `src/lib/budgetUtils.test.ts`

Cobre `calcMonthAmount` e `nextSubitemCode`.

**Casos para `calcMonthAmount`:**

| Cenário | line | monthIndex1 | Esperado |
|---------|------|-------------|---------|
| Mês dentro do range | `{start_month:1, end_month:3, total_approved:300}` | `2` | `100` |
| Primeiro mês do range | `{start_month:2, end_month:4, total_approved:300}` | `2` | `100` |
| Último mês do range | `{start_month:2, end_month:4, total_approved:300}` | `4` | `100` |
| Mês antes do range | `{start_month:3, end_month:5, total_approved:300}` | `2` | `0` |
| Mês depois do range | `{start_month:1, end_month:2, total_approved:300}` | `3` | `0` |
| Mês único (start=end) | `{start_month:2, end_month:2, total_approved:500}` | `2` | `500` |
| Total zero | `{start_month:1, end_month:3, total_approved:0}` | `1` | `0` |
| Sem end_month (usa start) | `{start_month:2, total_approved:400}` | `2` | `400` |

**Casos para `nextSubitemCode`:**

| itemCode | existingCodes | Esperado |
|----------|--------------|---------|
| `1` | `[]` | `"1.1"` |
| `1` | `["1.1"]` | `"1.2"` |
| `1` | `["1.1", "1.2"]` | `"1.3"` |
| `1` | `["1.1", "1.3"]` (gap) | `"1.4"` |
| `2` | `["1.1", "1.2"]` (outro prefixo) | `"2.1"` |
| `1` | `[null, undefined, "1.1"]` | `"1.2"` |
| `3` | `["3.1", "3.2", "3.10"]` | `"3.11"` |

---

## Critérios de aceite

- [ ] `npm test` passa com 0 falhas
- [ ] Vitest configurado em `vite.config.ts` (sem arquivo separado)
- [ ] `src/lib/budgetUtils.ts` existe com `calcMonthAmount` e `nextSubitemCode` exportados
- [ ] `PlanilhaProjeto.tsx` importa de `budgetUtils.ts` (comportamento idêntico)
- [ ] 3 arquivos de teste em `src/lib/`
- [ ] Todos os casos de tabela cobertos

---

## Ordem de execução

1. Setup Vitest + scripts
2. Criar `budgetUtils.ts` + atualizar `PlanilhaProjeto.tsx`
3. Escrever testes (TDD: falha → implementa → passa)
