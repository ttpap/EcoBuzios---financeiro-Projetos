# Fase 2 — Arquitetura: Extração de Hooks e Utilitários

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar os 3 maiores componentes extraindo hooks customizados e utilitários, reduzindo cada componente a puro rendering sem lógica de negócio.

**Architecture:** Para cada componente: funções puras sem React vão para `src/lib/`, lógica React (queries/mutations/state) vai para `src/hooks/`, o componente fica apenas com JSX. Nenhum comportamento é alterado — refatoração pura.

**Tech Stack:** React 19, TypeScript, TanStack Query (useQuery/useMutation), Zustand, Supabase, jsPDF, xlsx

---

## Arquivo: estrutura de arquivos

```
src/
  lib/
    fileUtils.ts           ← NEW: safeFileName, monthRefFromIndex, compressPdf, downloadBlobUrl, imageToLowResPdfBytes, fetchVendorById
    reportBuilders.ts      ← NEW: normalizePayMethod, formatDateBR (utils) — rubricasRows, lancamentosRows, notasRows serão memos no hook
    dashboardApi.ts        ← NEW: fetchActiveBudget, fetchProjectsRemainingRollup (tipos: Totals, ProjectRollup)
  hooks/
    useTransactionForm.ts       ← NEW: 14 useState do ExecucaoLancamentosDialog
    useTransactionMutations.ts  ← NEW: 3 useQuery + 6 useMutation do ExecucaoLancamentosDialog
    useReportData.ts            ← NEW: 6 useQuery + 5 useMemo (vendorById, lineById, executedByLine, totals, rows)
    useReportExports.ts         ← NEW: printRef + handlers exportPdf + exportExcel
    useDashboardData.ts         ← NEW: rollupQuery + projectQuery + budgetQuery + totalsQuery + 6 useMemo
  components/execucao/
    ExecucaoLancamentosDialog.tsx  ← MODIFY: consumir hooks, manter só JSX (~150 linhas)
  pages/
    BalanceteRelatorios.tsx        ← MODIFY: consumir hooks, manter só JSX + tabs (~80 linhas)
    Dashboard.tsx                  ← MODIFY: consumir hook, manter só yearFilter state + JSX (~150 linhas)
```

---

## Task 1: Refatorar ExecucaoLancamentosDialog

**Files:**
- Create: `src/lib/fileUtils.ts`
- Create: `src/hooks/useTransactionForm.ts`
- Create: `src/hooks/useTransactionMutations.ts`
- Modify: `src/components/execucao/ExecucaoLancamentosDialog.tsx`

### Contexto

`ExecucaoLancamentosDialog.tsx` tem 926 linhas com 4 responsabilidades misturadas:
- **Linhas 1-140:** funções utilitárias puras (safeFileName, compressPdf, imageToLowResPdfBytes, fetchVendorById)
- **Linhas 140-270:** props + 14 useState + 3 useQuery
- **Linhas 277-540:** 6 useMutation
- **Linhas 540-926:** event handlers + JSX

Props do componente:
```ts
{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  budgetId: string;
  line: BudgetLine | null;
  monthIndex: number;
  monthsCount: number;
  onChangeSelectedLineId?: (lineId: string) => void;
}
```

---

- [ ] **Step 1: Criar `src/lib/fileUtils.ts`**

Mover as funções puras do topo de `ExecucaoLancamentosDialog.tsx` para este novo arquivo. Ler o arquivo original e copiar as funções abaixo (linhas ~23-140):

```ts
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import type { Vendor } from "@/lib/supabaseTypes";

export type PaymentMethod = "transferencia" | "cheque" | "boleto" | "pix";

export function safeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function monthRefFromIndex(index1: number): string {
  const base = new Date(Date.UTC(2000, 0, 1));
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + (index1 - 1), 1));
  return d.toISOString().slice(0, 10);
}

export async function compressPdf(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfDoc = await PDFDocument.load(bytes);
  const out = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  return out;
}

export function downloadBlobUrl(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
}

export async function imageToLowResPdfBytes(file: File): Promise<Uint8Array> {
  // Copiar implementação exata do arquivo original
  // (converte imagem para PDF em baixa resolução usando canvas)
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const MAX_W = 1200;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const jpgBytes = await new Promise<ArrayBuffer>((res, rej) => {
          canvas.toBlob((b) => (b ? b.arrayBuffer().then(res) : rej(new Error("canvas toBlob falhou"))), "image/jpeg", 0.6);
        });
        const pdfDoc = await PDFDocument.create();
        const jpgImage = await pdfDoc.embedJpg(new Uint8Array(jpgBytes));
        const page = pdfDoc.addPage([w, h]);
        page.drawImage(jpgImage, { x: 0, y: 0, width: w, height: h });
        resolve(await pdfDoc.save());
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Falha ao carregar imagem")); };
    img.src = url;
  });
}

export async function fetchVendorById(vendorId: string): Promise<Vendor | null> {
  const { data, error } = await supabase.from("vendors").select("*").eq("id", vendorId).single();
  if (error) return null;
  return (data as Vendor) ?? null;
}
```

> **IMPORTANTE:** Ler o arquivo original para copiar a implementação exata de `imageToLowResPdfBytes` e qualquer outra função utilitária presente antes da declaração do componente. O código acima é um guia — use o código real do arquivo.

- [ ] **Step 2: Criar `src/hooks/useTransactionForm.ts`**

```ts
import { useState } from "react";
import type { Transaction, BudgetLine, Vendor } from "@/lib/supabaseTypes";
import type { PaymentMethod } from "@/lib/fileUtils";

export interface TransactionFormFields {
  currentMonthIndex: number;
  vendor: Vendor | null;
  paymentMethod: PaymentMethod | "";
  documentNumber: string;
  dueDate: string;
  paidDate: string;
  amount: string;
  notes: string;
  files: File[];
  editing: Transaction | null;
  editingMonthIndex: number;
  editingLineId: string;
  actionTxId: string | null;
  previewOpen: boolean;
  previewUrl: string;
}

export function useTransactionForm(initialMonthIndex: number, initialLineId: string) {
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(initialMonthIndex);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editingMonthIndex, setEditingMonthIndex] = useState<number>(initialMonthIndex);
  const [editingLineId, setEditingLineId] = useState<string>(initialLineId);
  const [actionTxId, setActionTxId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  function resetForm() {
    setVendor(null);
    setPaymentMethod("");
    setDocumentNumber("");
    setDueDate("");
    setPaidDate("");
    setAmount("");
    setNotes("");
    setFiles([]);
    setEditing(null);
    setActionTxId(null);
  }

  return {
    currentMonthIndex, setCurrentMonthIndex,
    vendor, setVendor,
    paymentMethod, setPaymentMethod,
    documentNumber, setDocumentNumber,
    dueDate, setDueDate,
    paidDate, setPaidDate,
    amount, setAmount,
    notes, setNotes,
    files, setFiles,
    editing, setEditing,
    editingMonthIndex, setEditingMonthIndex,
    editingLineId, setEditingLineId,
    actionTxId, setActionTxId,
    previewOpen, setPreviewOpen,
    previewUrl, setPreviewUrl,
    resetForm,
  };
}
```

- [ ] **Step 3: Criar `src/hooks/useTransactionMutations.ts`**

Ler `ExecucaoLancamentosDialog.tsx` e mover as 3 useQuery (linhas ~152-275) e 6 useMutation (linhas ~277-540) para este hook. Estrutura:

```ts
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BudgetLine, Transaction, TransactionAttachment } from "@/lib/supabaseTypes";
import { safeFileName, compressPdf, imageToLowResPdfBytes } from "@/lib/fileUtils";

export function useTransactionMutations({
  open,
  budgetId,
  line,
  monthRef,
  editingLineId,
  onChangeSelectedLineId,
}: {
  open: boolean;
  budgetId: string;
  line: BudgetLine | null;
  monthRef: string;
  editingLineId: string;
  onChangeSelectedLineId?: (lineId: string) => void;
}) {
  const queryClient = useQueryClient();

  // Copiar as 3 useQuery do arquivo original:
  // linesForSelectQuery (queryKey: ["execBudgetLines", budgetId])
  // txQuery (queryKey: ["execTx", editingLineId, monthRef])
  // attachmentsQuery (queryKey: ["txAttachments", ...])

  // Copiar as 6 useMutation do arquivo original:
  // addAttachmentsToTx, removeAttachment, signedUrl, createTx, updateTx, deleteTx

  const monthTotal = useMemo(() => {
    return (txQuery.data ?? []).reduce((acc, t) => acc + Number((t as any).amount ?? 0), 0);
  }, [txQuery.data]);

  return {
    linesForSelect: linesForSelectQuery.data ?? [],
    transactions: txQuery.data ?? [],
    attachments: attachmentsQuery.data ?? [],
    monthTotal,
    isLoading: txQuery.isLoading,
    createTx,
    updateTx,
    deleteTx,
    addAttachmentsToTx,
    removeAttachment,
    signedUrl,
  };
}
```

> **IMPORTANTE:** Ler o arquivo original e copiar o código EXATO das queries e mutations — não reescrever. Preserve todas as opções (queryKey, enabled, queryFn, onSuccess, onError, invalidateQueries, etc).

- [ ] **Step 4: Atualizar `ExecucaoLancamentosDialog.tsx`**

Substituir o conteúdo do arquivo mantendo apenas imports + props type + JSX, consumindo os novos hooks:

```ts
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetLine } from "@/lib/supabaseTypes";
// UI imports (manter todos os imports de @/components/ui/*)
import { formatBRL, formatPtBrDecimal, parsePtBrMoneyToNumber } from "@/lib/money";
import { toast } from "sonner";
import { VendorCombobox } from "@/components/execucao/VendorCombobox";
import { cn } from "@/lib/utils";
import { fetchVendorById, monthRefFromIndex, downloadBlobUrl } from "@/lib/fileUtils";
import { useTransactionForm } from "@/hooks/useTransactionForm";
import { useTransactionMutations } from "@/hooks/useTransactionMutations";
// ... demais imports de ícones

export function ExecucaoLancamentosDialog({
  open, onOpenChange, projectId, budgetId, line, monthIndex, monthsCount, onChangeSelectedLineId,
}: { /* tipos exatos iguais ao original */ }) {

  const form = useTransactionForm(monthIndex, line?.id ?? "");
  const monthRef = useMemo(() => monthRefFromIndex(form.currentMonthIndex), [form.currentMonthIndex]);

  const {
    linesForSelect, transactions, attachments, monthTotal,
    createTx, updateTx, deleteTx, addAttachmentsToTx, removeAttachment, signedUrl,
  } = useTransactionMutations({
    open, budgetId, line, monthRef,
    editingLineId: form.editingLineId,
    onChangeSelectedLineId,
  });

  // Manter APENAS os event handlers e JSX do arquivo original
  // (handleSubmit, handleEdit, handleDelete, handleFileChange, etc.)
  // NÃO reescrever a lógica — copiar do original
}
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit 2>&1 | head -50
```

Esperado: 0 erros. Se houver erros, corrigir antes de continuar.

- [ ] **Step 6: Verificar tamanho do componente**

```bash
wc -l "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos/src/components/execucao/ExecucaoLancamentosDialog.tsx"
```

Esperado: ≤ 250 linhas.

- [ ] **Step 7: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos"
git add src/lib/fileUtils.ts src/hooks/useTransactionForm.ts src/hooks/useTransactionMutations.ts src/components/execucao/ExecucaoLancamentosDialog.tsx
git commit -m "refactor: extrair fileUtils, useTransactionForm e useTransactionMutations de ExecucaoLancamentosDialog"
```

---

## Task 2: Refatorar BalanceteRelatorios

**Files:**
- Create: `src/lib/reportBuilders.ts`
- Create: `src/hooks/useReportData.ts`
- Create: `src/hooks/useReportExports.ts`
- Modify: `src/pages/BalanceteRelatorios.tsx`

### Contexto

`BalanceteRelatorios.tsx` tem 814 linhas com 4 responsabilidades:
- **Linhas 1-34:** imports + funções utilitárias (`normalizePayMethod`, `formatDateBR`)
- **Linhas 35-148:** 6 useQuery + 5 useMemo de mapeamento de dados
- **Linhas 150-600:** 3 useMemo gigantes de construção de linhas de relatório (`rubricasRows`, `lancamentosRows`, `notasDisponiveis`)
- **Linhas 600-814:** handlers de export PDF/Excel + JSX

---

- [ ] **Step 1: Criar `src/lib/reportBuilders.ts`**

Mover as duas funções utilitárias puras do arquivo original:

```ts
export function normalizePayMethod(pm: string | null | undefined): string {
  const v = String(pm ?? "");
  if (v === "transferencia") return "Transferência";
  if (v === "cheque") return "Cheque";
  if (v === "boleto") return "Boleto";
  if (v === "pix") return "Pix";
  return v || "-";
}

export function formatDateBR(dateISO: string | null | undefined): string {
  if (!dateISO) return "";
  const [y, m, d] = String(dateISO).slice(0, 10).split("-");
  if (!y || !m || !d) return String(dateISO);
  return `${d}/${m}/${y}`;
}
```

- [ ] **Step 2: Criar `src/hooks/useReportData.ts`**

Mover as 6 useQuery e os 5 useMemo de mapeamento + geração de linhas de `BalanceteRelatorios.tsx` (linhas 41-600):

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/appStore";
import type { Budget, BudgetCategory, BudgetLine, Project, Transaction, Vendor } from "@/lib/supabaseTypes";

export function useReportData() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const activeBudgetId = useAppStore((s) => s.activeBudgetId);

  // Copiar as 6 useQuery do original:
  // projectQuery, budgetQuery, categoriesQuery, linesQuery, txQuery, vendorsQuery

  // Copiar os 5 useMemo de mapeamento:
  // vendorById, lineById, executedByLine, plannedTotal, executedTotal

  // Copiar os 3 useMemo de geração de linhas:
  // rubricasRows (linhas ~150-222), lancamentosRows (linhas ~223-423), notasDisponiveis (linhas ~424-...)

  return {
    project: projectQuery.data ?? null,
    budget: budgetQuery.data ?? null,
    rubricasRows,
    lancamentosRows,
    notasRows: notasDisponiveis,
    plannedTotal,
    executedTotal,
    isLoading: projectQuery.isLoading || budgetQuery.isLoading || txQuery.isLoading,
  };
}
```

> **IMPORTANTE:** Copiar o código EXATO das queries e memos do arquivo original — não resumir ou reescrever. Os memos `rubricasRows` e `lancamentosRows` têm ~150 linhas cada; copiar na íntegra.

- [ ] **Step 3: Criar `src/hooks/useReportExports.ts`**

Mover o `useRef` e os handlers de exportação (linhas ~600-750 do original):

```ts
import { useRef } from "react";
import type { RefObject } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { downloadXlsxFromRows, downloadXlsxWithSheets } from "@/lib/reporting";
import { normalizePayMethod, formatDateBR } from "@/lib/reportBuilders";

export function useReportExports({
  rubricasRows,
  lancamentosRows,
  notasRows,
  projectName,
  budgetName,
}: {
  rubricasRows: unknown[];
  lancamentosRows: unknown[];
  notasRows: unknown[];
  projectName: string;
  budgetName: string;
}) {
  const printRef = useRef<HTMLDivElement | null>(null);

  // Copiar os handlers exportPdf e exportExcel do arquivo original (linhas ~600-750)
  // Eles usam jsPDF + autoTable para PDF e downloadXlsxWithSheets para Excel

  return {
    printRef,
    exportPdf: () => { /* implementação copiada do original */ },
    exportExcel: () => { /* implementação copiada do original */ },
  };
}
```

> **IMPORTANTE:** Copiar as implementações reais de `exportPdf` e `exportExcel` — elas têm ~100 linhas cada com formatação de tabelas.

- [ ] **Step 4: Atualizar `src/pages/BalanceteRelatorios.tsx`**

Substituir pelo conteúdo slim:

```ts
import { useState } from "react";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";
import { Button } from "@/components/ui/button";
import { Download, FileText, Printer } from "lucide-react";
import { useReportData } from "@/hooks/useReportData";
import { useReportExports } from "@/hooks/useReportExports";

export default function BalanceteRelatorios() {
  const [report, setReport] = useState<"rubricas" | "lancamentos" | "notas">("rubricas");

  const {
    project, budget, rubricasRows, lancamentosRows, notasRows,
    plannedTotal, executedTotal, isLoading,
  } = useReportData();

  const { printRef, exportPdf, exportExcel } = useReportExports({
    rubricasRows,
    lancamentosRows,
    notasRows,
    projectName: project?.name ?? "",
    budgetName: budget?.name ?? "",
  });

  if (isLoading) return <div>Carregando...</div>;

  // Manter o JSX original (tabs, tabelas, botões de download, área de impressão)
  // NÃO reescrever — copiar do original (linhas ~750-814)
}
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit 2>&1 | head -50
```

Esperado: 0 erros.

- [ ] **Step 6: Verificar tamanho do componente**

```bash
wc -l "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos/src/pages/BalanceteRelatorios.tsx"
```

Esperado: ≤ 120 linhas.

- [ ] **Step 7: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos"
git add src/lib/reportBuilders.ts src/hooks/useReportData.ts src/hooks/useReportExports.ts src/pages/BalanceteRelatorios.tsx
git commit -m "refactor: extrair reportBuilders, useReportData e useReportExports de BalanceteRelatorios"
```

---

## Task 3: Refatorar Dashboard

**Files:**
- Create: `src/lib/dashboardApi.ts`
- Create: `src/hooks/useDashboardData.ts`
- Modify: `src/pages/Dashboard.tsx`

### Contexto

`Dashboard.tsx` tem 472 linhas com 3 responsabilidades:
- **Linhas 1-140:** tipos + 3 funções async soltas no module level (`fetchActiveBudget`, `fetchProjectsRemainingRollup` + 1 helper)
- **Linhas 140-250:** `rollupQuery` + 3 useQuery adicionais + 6 useMemo
- **Linhas 250-472:** JSX

---

- [ ] **Step 1: Criar `src/lib/dashboardApi.ts`**

Mover os tipos e as 3 funções async do module level de `Dashboard.tsx` (linhas 1-140):

```ts
import { supabase } from "@/integrations/supabase/client";
import type { Budget } from "@/lib/supabaseTypes";

export interface Totals {
  planned: number;
  executed: number;
  remaining: number;
}

export interface ProjectRollup {
  id: string;
  name: string;
  executionYear: number | null;
  planned: number;
  executed: number;
  remaining: number;
}

export async function fetchActiveBudget(projectId: string): Promise<Budget | null> {
  const { data: budgets, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (budgets?.[0] as Budget | undefined) ?? null;
}

// Copiar fetchProjectsRemainingRollup e qualquer helper do arquivo original (linhas ~40-140)
// A função busca projects + budgets + budget_lines + transactions e agrega remaining por projeto
export async function fetchProjectsRemainingRollup(): Promise<ProjectRollup[]> {
  // COPIAR DO ORIGINAL — não resumir
}
```

- [ ] **Step 2: Criar `src/hooks/useDashboardData.ts`**

Mover o `rollupQuery`, os 3 useQuery adicionais e os 6 useMemo do Dashboard (linhas ~145-250):

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/appStore";
import { fetchProjectsRemainingRollup, fetchActiveBudget, type ProjectRollup, type Totals } from "@/lib/dashboardApi";

export function useDashboardData(yearFilter: string) {
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const rollupQuery = useQuery({
    queryKey: ["projectsRemainingRollup"],
    queryFn: fetchProjectsRemainingRollup,
  });

  // Copiar projectQuery, budgetQuery, totalsQuery do original

  // Copiar os 6 useMemo do original:
  // yearRows, yearOptions, projectsByYear, donutItems, donutSubtitle, stats

  return {
    yearRows,
    yearOptions,
    projectsByYear,
    donutItems,
    donutSubtitle,
    stats,
    isLoading: rollupQuery.isLoading,
    activeProjectId,
  };
}
```

> **IMPORTANTE:** Copiar o código EXATO dos useMemo do arquivo original — os memos têm lógica de agrupamento por ano que não deve ser reescrita.

- [ ] **Step 3: Atualizar `src/pages/Dashboard.tsx`**

```ts
import { useState } from "react";
import { useAppStore } from "@/lib/appStore";
import { useDashboardData } from "@/hooks/useDashboardData";
// Manter imports de UI (Card, charts, etc.)

export default function Dashboard() {
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const [yearFilter, setYearFilter] = useState<string>("all");

  const {
    yearRows, yearOptions, projectsByYear, donutItems, donutSubtitle,
    stats, isLoading, activeProjectId,
  } = useDashboardData(yearFilter);

  // Manter APENAS o JSX do original (linhas ~250-472)
  // NÃO reescrever — copiar do original
}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos" && npx tsc --noEmit 2>&1 | head -50
```

Esperado: 0 erros.

- [ ] **Step 5: Verificar tamanho do componente**

```bash
wc -l "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos/src/pages/Dashboard.tsx"
```

Esperado: ≤ 200 linhas.

- [ ] **Step 6: Commit**

```bash
cd "/Users/pap/dyad-apps/EcoBuzios - financeiro Projetos"
git add src/lib/dashboardApi.ts src/hooks/useDashboardData.ts src/pages/Dashboard.tsx
git commit -m "refactor: extrair dashboardApi e useDashboardData de Dashboard"
```

---

## Critérios de aceite finais

- [ ] `ExecucaoLancamentosDialog.tsx` ≤ 250 linhas
- [ ] `BalanceteRelatorios.tsx` ≤ 120 linhas
- [ ] `Dashboard.tsx` ≤ 200 linhas
- [ ] Todos os arquivos em `src/lib/` sem imports React (`import { useState }`, `import { useQuery }`, etc.)
- [ ] `npx tsc --noEmit` passa sem erros após cada task
- [ ] App visualmente idêntico após cada refatoração
