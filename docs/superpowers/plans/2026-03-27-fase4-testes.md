# Fase 4 — Testes Unitários — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar Vitest, extrair funções de cálculo financeiro para `src/lib/budgetUtils.ts`, e cobrir todas as funções puras críticas com testes unitários.

**Architecture:** Vitest configurado dentro do `vite.config.ts` existente (reutiliza path aliases). TDD para `budgetUtils.ts` (funções extraídas de `PlanilhaProjeto.tsx`); testes diretos para `money.ts` e `reportBuilders.ts` (funções já existem). Sem mocks — todas as funções são puras.

**Tech Stack:** Vitest, TypeScript, Vite path aliases (`@/*`)

---

## Mapeamento de arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `package.json` | Modify | Adicionar scripts `test` e `test:watch` |
| `vite.config.ts` | Modify | Adicionar bloco `test` com environment e include |
| `src/lib/budgetUtils.ts` | Create | `calcMonthAmount` e `nextSubitemCode` extraídas de PlanilhaProjeto |
| `src/pages/PlanilhaProjeto.tsx` | Modify | Importar de `budgetUtils.ts`, remover definições locais |
| `src/lib/budgetUtils.test.ts` | Create | Testes para `calcMonthAmount` e `nextSubitemCode` |
| `src/lib/money.test.ts` | Create | Testes para `parsePtBrMoneyToNumber` e `formatBRL` |
| `src/lib/reportBuilders.test.ts` | Create | Testes para `normalizePayMethod` e `formatDateBR` |

---

## Task 1: Instalar e configurar Vitest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`

- [ ] **Step 1: Instalar vitest**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npm install --save-dev vitest
```

Esperado: vitest aparece em `devDependencies` no `package.json`.

- [ ] **Step 2: Adicionar scripts ao `package.json`**

No bloco `"scripts"`, adicionar após `"preview"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Resultado do bloco scripts:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "build:dev": "vite build --mode development",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

- [ ] **Step 3: Configurar Vitest no `vite.config.ts`**

Adicionar a referência de tipos no topo e o bloco `test` dentro do `defineConfig`:

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
  },
  plugins: [dyadComponentTagger(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "lucide-react", "@supabase/auth-ui-react"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
```

- [ ] **Step 4: Verificar que o framework inicializa**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npm test
```

Esperado: `No test files found` ou saída limpa com 0 testes. Exit code 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && git add package.json vite.config.ts package-lock.json
git commit -m "feat: instalar e configurar Vitest"
```

---

## Task 2: Criar `budgetUtils.ts` e testes (TDD)

**Files:**
- Create: `src/lib/budgetUtils.test.ts`
- Create: `src/lib/budgetUtils.ts`
- Modify: `src/pages/PlanilhaProjeto.tsx`

### Step 1-2: Escrever os testes primeiro (TDD)

- [ ] **Step 1: Criar `src/lib/budgetUtils.test.ts` com todos os casos**

```ts
import { describe, it, expect } from "vitest";
import { calcMonthAmount, nextSubitemCode } from "./budgetUtils";
import type { BudgetLine } from "./supabaseTypes";

function line(overrides: Partial<BudgetLine> = {}): BudgetLine {
  return {
    id: "1",
    budget_id: "b1",
    category_id: "c1",
    name: "Test",
    quantity: null,
    unit_value: null,
    total_approved: 300,
    notes: null,
    status: "active",
    is_subtotal: false,
    sort_order: 1,
    start_month: 1,
    end_month: 3,
    ...overrides,
  };
}

describe("calcMonthAmount", () => {
  it("distributes evenly across months in range", () => {
    expect(calcMonthAmount(line({ start_month: 1, end_month: 3, total_approved: 300 }), 2)).toBe(100);
  });

  it("returns amount for first month of range", () => {
    expect(calcMonthAmount(line({ start_month: 2, end_month: 4, total_approved: 300 }), 2)).toBe(100);
  });

  it("returns amount for last month of range", () => {
    expect(calcMonthAmount(line({ start_month: 2, end_month: 4, total_approved: 300 }), 4)).toBe(100);
  });

  it("returns 0 for month before range", () => {
    expect(calcMonthAmount(line({ start_month: 3, end_month: 5, total_approved: 300 }), 2)).toBe(0);
  });

  it("returns 0 for month after range", () => {
    expect(calcMonthAmount(line({ start_month: 1, end_month: 2, total_approved: 300 }), 3)).toBe(0);
  });

  it("returns full amount when start equals end equals month", () => {
    expect(calcMonthAmount(line({ start_month: 2, end_month: 2, total_approved: 500 }), 2)).toBe(500);
  });

  it("returns 0 when total_approved is 0", () => {
    expect(calcMonthAmount(line({ start_month: 1, end_month: 3, total_approved: 0 }), 1)).toBe(0);
  });

  it("uses start_month as end when end_month is undefined", () => {
    const l = line({ start_month: 2, total_approved: 400 });
    delete (l as Partial<BudgetLine>).end_month;
    expect(calcMonthAmount(l, 2)).toBe(400);
    expect(calcMonthAmount(l, 3)).toBe(0);
  });
});

describe("nextSubitemCode", () => {
  it("returns 1.1 for item 1 with empty list", () => {
    expect(nextSubitemCode(1, [])).toBe("1.1");
  });

  it("returns 1.2 when 1.1 exists", () => {
    expect(nextSubitemCode(1, ["1.1"])).toBe("1.2");
  });

  it("returns 1.3 when 1.1 and 1.2 exist", () => {
    expect(nextSubitemCode(1, ["1.1", "1.2"])).toBe("1.3");
  });

  it("returns 1.4 when gap exists (1.1, 1.3)", () => {
    expect(nextSubitemCode(1, ["1.1", "1.3"])).toBe("1.4");
  });

  it("ignores codes from other prefixes", () => {
    expect(nextSubitemCode(2, ["1.1", "1.2"])).toBe("2.1");
  });

  it("handles null and undefined in list", () => {
    expect(nextSubitemCode(1, [null, undefined, "1.1"])).toBe("1.2");
  });

  it("handles numeric ordering correctly (1.10 > 1.9)", () => {
    expect(nextSubitemCode(3, ["3.1", "3.2", "3.10"])).toBe("3.11");
  });

  it("returns 2.1 for item 2 with empty list", () => {
    expect(nextSubitemCode(2, [])).toBe("2.1");
  });
});
```

- [ ] **Step 2: Verificar que os testes falham (arquivo não existe ainda)**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npm test
```

Esperado: erro de import — `Cannot find module './budgetUtils'`. Isso confirma o ciclo TDD.

- [ ] **Step 3: Criar `src/lib/budgetUtils.ts`**

```ts
import type { BudgetLine } from "./supabaseTypes";

function monthlyValue(total: number, months: number): number {
  const d = Math.max(1, months);
  return total / d;
}

/**
 * Calcula o valor de uma linha de orçamento para um mês específico (1-based).
 * Distribui total_approved igualmente entre start_month e end_month.
 * Retorna 0 se monthIndex1 estiver fora do intervalo.
 */
export function calcMonthAmount(line: BudgetLine, monthIndex1: number): number {
  const start = Number(line.start_month ?? 1);
  const end = Number(line.end_month ?? start);
  if (monthIndex1 < start || monthIndex1 > end) return 0;
  const total = Number(line.total_approved ?? 0);
  const months = end - start + 1;
  return monthlyValue(total, months);
}

/**
 * Retorna o próximo código de subitem para um item pai.
 * Ex: itemCode=1, existingCodes=["1.1","1.2"] → "1.3"
 */
export function nextSubitemCode(
  itemCode: number,
  existingCodes: Array<string | null | undefined>
): string {
  const prefix = `${itemCode}.`;
  let max = 0;
  for (const c of existingCodes) {
    const s = String(c ?? "").trim();
    if (!s.startsWith(prefix)) continue;
    const tail = s.slice(prefix.length);
    const n = Number(tail.split(".")[0]);
    if (Number.isFinite(n)) max = Math.max(max, Math.trunc(n));
  }
  return `${itemCode}.${max + 1}`;
}
```

- [ ] **Step 4: Verificar que os testes passam**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npm test
```

Esperado: `16 tests passed` (8 calcMonthAmount + 8 nextSubitemCode). Exit code 0.

- [ ] **Step 5: Atualizar `src/pages/PlanilhaProjeto.tsx`**

Adicionar import após a linha `import { formatBRL, formatPtBrDecimal, parsePtBrMoneyToNumber } from "@/lib/money";`:

```ts
import { calcMonthAmount, nextSubitemCode } from "@/lib/budgetUtils";
```

Remover as 3 definições locais das linhas ~40-65 (as funções `monthlyValue`, `calcMonthAmount` e `nextSubitemCode`). Manter `clampInt` e `buildMonthLabels` — são locais e não precisam de extração.

O trecho a remover é exatamente:
```ts
function monthlyValue(total: number, months: number) {
  const d = Math.max(1, months);
  return total / d;
}

function calcMonthAmount(line: BudgetLine, monthIndex1: number) {
  const start = Number(line.start_month ?? 1);
  const end = Number((line as any).end_month ?? start);
  if (monthIndex1 < start || monthIndex1 > end) return 0;
  const total = Number(line.total_approved ?? 0);
  const months = end - start + 1;
  return monthlyValue(total, months);
}

function nextSubitemCode(itemCode: number, existingCodes: Array<string | null | undefined>) {
  const prefix = `${itemCode}.`;
  let max = 0;
  for (const c of existingCodes) {
    const s = String(c ?? "").trim();
    if (!s.startsWith(prefix)) continue;
    const tail = s.slice(prefix.length);
    const n = Number(tail.split(".")[0]);
    if (Number.isFinite(n)) max = Math.max(max, Math.trunc(n));
  }
  return `${itemCode}.${max + 1}`;
}
```

- [ ] **Step 6: Verificar TypeScript e testes após extração**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit && npm test
```

Esperado: 0 erros TypeScript, 16 testes passando.

- [ ] **Step 7: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && git add src/lib/budgetUtils.ts src/lib/budgetUtils.test.ts src/pages/PlanilhaProjeto.tsx
git commit -m "feat: extrair calcMonthAmount e nextSubitemCode para budgetUtils + testes"
```

---

## Task 3: Testes para `money.ts`

**Files:**
- Create: `src/lib/money.test.ts`

- [ ] **Step 1: Criar `src/lib/money.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parsePtBrMoneyToNumber, formatBRL } from "./money";

describe("parsePtBrMoneyToNumber", () => {
  it("parses pt-BR format with thousands separator", () => {
    expect(parsePtBrMoneyToNumber("1.234,56")).toBe(1234.56);
  });

  it("parses value with only comma decimal separator", () => {
    expect(parsePtBrMoneyToNumber("1234,56")).toBe(1234.56);
  });

  it("parses value with R$ currency symbol", () => {
    expect(parsePtBrMoneyToNumber("R$ 1.234,56")).toBe(1234.56);
  });

  it("parses US format (dot as decimal)", () => {
    expect(parsePtBrMoneyToNumber("1234.56")).toBe(1234.56);
  });

  it("returns 0 for zero string", () => {
    expect(parsePtBrMoneyToNumber("0")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parsePtBrMoneyToNumber("")).toBe(0);
  });

  it("returns 0 for invalid string", () => {
    expect(parsePtBrMoneyToNumber("abc")).toBe(0);
  });

  it("parses negative value", () => {
    expect(parsePtBrMoneyToNumber("-100,50")).toBe(-100.5);
  });

  it("parses million value", () => {
    expect(parsePtBrMoneyToNumber("1.000.000,00")).toBe(1000000);
  });

  it("parses integer value without decimals", () => {
    expect(parsePtBrMoneyToNumber("500")).toBe(500);
  });
});

describe("formatBRL", () => {
  it("formats positive value as BRL", () => {
    // Intl formatting — value should contain 1.234,56
    const result = formatBRL(1234.56);
    expect(result).toContain("1.234,56");
  });

  it("formats zero", () => {
    const result = formatBRL(0);
    expect(result).toContain("0,00");
  });
});
```

- [ ] **Step 2: Rodar os testes**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npm test
```

Esperado: todos os testes anteriores + 12 novos de money passando. Exit code 0.

- [ ] **Step 3: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && git add src/lib/money.test.ts
git commit -m "test: cobertura de parsePtBrMoneyToNumber e formatBRL"
```

---

## Task 4: Testes para `reportBuilders.ts`

**Files:**
- Create: `src/lib/reportBuilders.test.ts`

- [ ] **Step 1: Criar `src/lib/reportBuilders.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { normalizePayMethod, formatDateBR } from "./reportBuilders";

describe("normalizePayMethod", () => {
  it("normalizes transferencia", () => {
    expect(normalizePayMethod("transferencia")).toBe("Transferência");
  });

  it("normalizes cheque", () => {
    expect(normalizePayMethod("cheque")).toBe("Cheque");
  });

  it("normalizes boleto", () => {
    expect(normalizePayMethod("boleto")).toBe("Boleto");
  });

  it("normalizes pix", () => {
    expect(normalizePayMethod("pix")).toBe("Pix");
  });

  it("returns dash for null", () => {
    expect(normalizePayMethod(null)).toBe("-");
  });

  it("returns dash for empty string", () => {
    expect(normalizePayMethod("")).toBe("-");
  });

  it("returns unknown value unchanged", () => {
    expect(normalizePayMethod("outro")).toBe("outro");
  });
});

describe("formatDateBR", () => {
  it("formats ISO date to dd/mm/yyyy", () => {
    expect(formatDateBR("2024-03-15")).toBe("15/03/2024");
  });

  it("formats date with zero-padded month and day", () => {
    expect(formatDateBR("2024-01-01")).toBe("01/01/2024");
  });

  it("returns empty string for null", () => {
    expect(formatDateBR(null)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatDateBR("")).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDateBR(undefined)).toBe("");
  });
});
```

- [ ] **Step 2: Rodar todos os testes**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npm test
```

Esperado: saída com 3 suites, todos os testes passando. Contagem esperada: 16 (budgetUtils) + 12 (money) + 12 (reportBuilders) = 40 testes. Exit code 0.

- [ ] **Step 3: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && git add src/lib/reportBuilders.test.ts
git commit -m "test: cobertura de normalizePayMethod e formatDateBR"
```

---

## Critérios de aceite finais

- [ ] `npm test` passa com 0 falhas
- [ ] 40 testes no total (16 + 12 + 12)
- [ ] `npx tsc --noEmit` ainda passa com 0 erros
- [ ] `src/lib/budgetUtils.ts` existe com `calcMonthAmount` e `nextSubitemCode` exportados
- [ ] `PlanilhaProjeto.tsx` importa de `budgetUtils.ts` e não define mais `calcMonthAmount`/`nextSubitemCode` localmente
