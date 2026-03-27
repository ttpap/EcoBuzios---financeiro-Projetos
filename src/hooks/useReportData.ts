import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/appStore";
import type { Budget, BudgetCategory, BudgetLine, Project, Transaction, Vendor } from "@/lib/supabaseTypes";
import { normalizePayMethod, formatDateBR } from "@/lib/reportBuilders";

export function useReportData() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const activeBudgetId = useAppStore((s) => s.activeBudgetId);

  const projectQuery = useQuery({
    queryKey: ["project", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", activeProjectId).single();
      if (error) throw error;
      return data as Project;
    },
  });

  const budgetQuery = useQuery({
    queryKey: ["budget", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("project_id", activeProjectId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as Budget | undefined) ?? null;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["repCats", budgetQuery.data?.id],
    enabled: Boolean(budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_categories")
        .select("*")
        .eq("budget_id", budgetQuery.data!.id)
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BudgetCategory[];
    },
  });

  const linesQuery = useQuery({
    queryKey: ["repLines", budgetQuery.data?.id],
    enabled: Boolean(budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_lines")
        .select("*")
        .eq("budget_id", budgetQuery.data!.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BudgetLine[];
    },
  });

  const txQuery = useQuery({
    queryKey: ["repTx", activeProjectId, budgetQuery.data?.id],
    enabled: Boolean(activeProjectId && budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("project_id", activeProjectId)
        .eq("budget_id", budgetQuery.data!.id)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });

  const vendorsQuery = useQuery({
    queryKey: ["repVendors"],
    enabled: true,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*");
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });

  const vendorById = useMemo(() => {
    const m = new Map<string, Vendor>();
    for (const v of vendorsQuery.data ?? []) m.set(v.id, v);
    return m;
  }, [vendorsQuery.data]);

  const lineById = useMemo(() => {
    const m = new Map<string, BudgetLine>();
    for (const l of linesQuery.data ?? []) m.set(l.id, l);
    return m;
  }, [linesQuery.data]);

  const executedByLine = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txQuery.data ?? []) {
      const lid = String((t as any).budget_line_id);
      m.set(lid, (m.get(lid) ?? 0) + Number((t as any).amount ?? 0));
    }
    return m;
  }, [txQuery.data]);

  const plannedTotal = useMemo(() => {
    return (linesQuery.data ?? [])
      .filter((l) => !l.is_subtotal)
      .reduce((acc, l) => acc + Number(l.total_approved ?? 0), 0);
  }, [linesQuery.data]);

  const executedTotal = useMemo(() => {
    return (txQuery.data ?? []).reduce((acc, t) => acc + Number((t as any).amount ?? 0), 0);
  }, [txQuery.data]);

  const rubricasRows = useMemo(() => {
    type RowKind = "item" | "subitem" | "total_item" | "total_project";
    const rows: Array<{
      kind: RowKind;
      code: string;
      name: string;
      planned: number;
      executed: number;
      saldo: number;
      pct: number;
    }> = [];

    for (const cat of categoriesQuery.data ?? []) {
      const lines = (linesQuery.data ?? []).filter((l) => l.category_id === cat.id && !l.is_subtotal);

      let plannedCat = 0;
      let executedCat = 0;

      for (const l of lines) {
        plannedCat += Number(l.total_approved ?? 0);
        executedCat += executedByLine.get(l.id) ?? 0;
      }

      const saldoCat = plannedCat - executedCat;
      const pctCat = plannedCat > 0 ? executedCat / plannedCat : 0;

      // Linha do item (rubrica) já com totais.
      rows.push({
        kind: "item",
        code: String((cat as any).code),
        name: cat.name,
        planned: plannedCat,
        executed: executedCat,
        saldo: saldoCat,
        pct: pctCat,
      });

      // Subitens
      for (const l of lines) {
        const planned = Number(l.total_approved ?? 0);
        const executed = executedByLine.get(l.id) ?? 0;
        const saldo = planned - executed;
        const pct = planned > 0 ? executed / planned : 0;
        rows.push({ kind: "subitem", code: String(l.code ?? ""), name: l.name, planned, executed, saldo, pct });
      }

      // Linha explícita de total por rubrica (como no exemplo)
      rows.push({
        kind: "total_item",
        code: `Total Rubrica ${String((cat as any).code)}`,
        name: "",
        planned: plannedCat,
        executed: executedCat,
        saldo: saldoCat,
        pct: pctCat,
      });
    }

    const saldoProject = plannedTotal - executedTotal;
    const pctProject = plannedTotal > 0 ? executedTotal / plannedTotal : 0;
    rows.push({
      kind: "total_project",
      code: "TOTAL GERAL DO PROJETO",
      name: "",
      planned: plannedTotal,
      executed: executedTotal,
      saldo: saldoProject,
      pct: pctProject,
    });

    return rows;
  }, [categoriesQuery.data, linesQuery.data, executedByLine, plannedTotal, executedTotal]);

  const lancamentosRows = useMemo(() => {
    const list = (txQuery.data ?? [])
      .slice()
      .sort((a: any, b: any) =>
        String(a.paid_date ?? a.date ?? "").localeCompare(String(b.paid_date ?? b.date ?? ""))
      );

    return list.map((t: any) => {
      const line = lineById.get(String(t.budget_line_id));
      const vendor = t.vendor_id ? vendorById.get(String(t.vendor_id)) : null;
      return {
        codigo: String(line?.code ?? ""),
        descricao: String(line?.name ?? t.description ?? ""),
        fornecedor: vendor?.name ?? "",
        cnpj_cpf: vendor?.tax_id ?? "",
        forma_pagamento: normalizePayMethod(t.payment_method),
        data_pagamento: formatDateBR(t.paid_date ?? t.date),
        numero_documento: t.document_number ?? "",
        data_nota: formatDateBR(t.due_date),
        valor: Number(t.amount ?? 0),
      };
    });
  }, [txQuery.data, lineById, vendorById]);

  const notasDisponiveis = useMemo(() => {
    const list = (txQuery.data ?? [])
      .filter((t: any) => Boolean(t.invoice_path))
      .map((t: any) => ({
        invoice_path: String(t.invoice_path),
        invoice_file_name: String(t.invoice_file_name ?? "nota-fiscal.pdf"),
        due_date: String(t.due_date ?? ""),
      }))
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    return list;
  }, [txQuery.data]);

  return {
    project: projectQuery.data ?? null,
    budget: budgetQuery.data ?? null,
    rubricasRows,
    lancamentosRows,
    notasRows: notasDisponiveis,
    plannedTotal,
    executedTotal,
    vendorById,
    lineById,
    transactions: txQuery.data ?? [],
    isLoading: projectQuery.isLoading || linesQuery.isLoading || txQuery.isLoading,
  };
}
