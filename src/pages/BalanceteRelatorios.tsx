import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/appStore";
import type { Budget, BudgetCategory, BudgetLine, Transaction, Vendor } from "@/lib/supabaseTypes";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { downloadXlsxFromRows, formatPercent } from "@/lib/reporting";
import { Download, FileText, Printer } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function normalizePayMethod(pm: string | null | undefined) {
  const v = String(pm ?? "");
  if (v === "transferencia") return "Transferência";
  if (v === "cheque") return "Cheque";
  if (v === "boleto") return "Boleto";
  if (v === "pix") return "Pix";
  return v || "-";
}

function formatDateBR(dateISO: string | null | undefined) {
  if (!dateISO) return "";
  // dateISO pode vir como YYYY-MM-DD
  const [y, m, d] = String(dateISO).slice(0, 10).split("-");
  if (!y || !m || !d) return String(dateISO);
  return `${d}/${m}/${y}`;
}

export default function BalanceteRelatorios() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const printRef = useRef<HTMLDivElement | null>(null);

  const [report, setReport] = useState<"rubricas" | "lancamentos" | "notas">("rubricas");

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
    return (linesQuery.data ?? []).filter((l) => !l.is_subtotal).reduce((acc, l) => acc + Number(l.total_approved ?? 0), 0);
  }, [linesQuery.data]);

  const executedTotal = useMemo(() => {
    return (txQuery.data ?? []).reduce((acc, t) => acc + Number((t as any).amount ?? 0), 0);
  }, [txQuery.data]);

  const rubricasRows = useMemo(() => {
    const rows: Array<{
      kind: "item" | "subitem";
      code: string;
      name: string;
      planned: number;
      executed: number;
      pct: number;
    }> = [];

    for (const cat of categoriesQuery.data ?? []) {
      rows.push({ kind: "item", code: String((cat as any).code), name: cat.name, planned: 0, executed: 0, pct: 0 });

      const lines = (linesQuery.data ?? []).filter((l) => l.category_id === cat.id && !l.is_subtotal);
      for (const l of lines) {
        const planned = Number(l.total_approved ?? 0);
        const executed = executedByLine.get(l.id) ?? 0;
        const pct = planned > 0 ? executed / planned : 0;
        rows.push({ kind: "subitem", code: String(l.code ?? ""), name: l.name, planned, executed, pct });
      }
    }

    return rows;
  }, [categoriesQuery.data, linesQuery.data, executedByLine]);

  const lancamentosRows = useMemo(() => {
    const list = (txQuery.data ?? [])
      .slice()
      .sort((a: any, b: any) => String(a.paid_date ?? a.date ?? "").localeCompare(String(b.paid_date ?? b.date ?? "")));

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

  const handlePrint = () => {
    window.print();
  };

  const exportRubricasPdf = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    doc.setFontSize(14);
    doc.text("Relatório de Rubricas (Planejado x Executado)", 40, 40);

    doc.setFontSize(10);
    doc.text(`Total Planejado: ${formatBRL(plannedTotal)} (100%)`, 40, 64);
    doc.text(
      `Total Executado: ${formatBRL(executedTotal)} (${plannedTotal > 0 ? Math.round((executedTotal / plannedTotal) * 100) : 0}%)`,
      40,
      80
    );
    doc.text(
      `Saldo Disponível: ${formatBRL(plannedTotal - executedTotal)} (${plannedTotal > 0 ? Math.round(((plannedTotal - executedTotal) / plannedTotal) * 100) : 0}%)`,
      40,
      96
    );

    const body = rubricasRows.map((r) => [
      r.code,
      r.kind === "item" ? r.name : `  ${r.name}`,
      r.kind === "item" ? "" : formatBRL(r.planned),
      r.kind === "item" ? "" : formatBRL(r.executed),
      r.kind === "item" ? "" : `${Math.round(r.pct * 100)}%`,
    ]);

    autoTable(doc, {
      startY: 120,
      head: [["Código", "Item/Subitem", "Planejado", "Executado", "% Exec."]],
      body,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [96, 74, 255] },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
    });

    const endY = (doc as any).lastAutoTable?.finalY ?? 120;
    autoTable(doc, {
      startY: endY + 12,
      head: [["Total Planejado", "Total Executado", "Saldo Restante"]],
      body: [[formatBRL(plannedTotal), formatBRL(executedTotal), formatBRL(plannedTotal - executedTotal)]],
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [16, 24, 40] },
      columnStyles: { 0: { halign: "right" }, 1: { halign: "right" }, 2: { halign: "right" } },
    });

    doc.save("relatorio-rubricas.pdf");
  };

  const exportLancamentosPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Relatório de Lançamentos", 40, 40);

    const rows = lancamentosRows.map((r) => [
      r.codigo,
      r.descricao,
      r.fornecedor,
      r.cnpj_cpf,
      r.forma_pagamento,
      r.data_pagamento,
      r.numero_documento,
      r.data_nota,
      formatBRL(r.valor),
    ]);

    autoTable(doc, {
      startY: 70,
      head: [["Subitem", "Descrição", "Fornecedor", "CNPJ/CPF", "Forma", "Data pag.", "Nº Doc", "Data NF", "Valor"]],
      body: rows,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [96, 74, 255] },
      columnStyles: { 8: { halign: "right" } },
    });

    const totalPago = lancamentosRows.reduce((acc, r) => acc + r.valor, 0);
    const endY = (doc as any).lastAutoTable?.finalY ?? 70;
    doc.setFontSize(10);
    doc.text(`Total Pago no Projeto: ${formatBRL(totalPago)}`, 40, endY + 18);

    doc.save("relatorio-lancamentos.pdf");
  };

  const exportRubricasXlsx = () => {
    const rows = rubricasRows.map((r) => ({
      Codigo: r.code,
      "Item/Subitem": r.kind === "item" ? r.name : r.name,
      Planejado: r.kind === "item" ? "" : r.planned,
      Executado: r.kind === "item" ? "" : r.executed,
      "% Executado": r.kind === "item" ? "" : formatPercent(r.pct),
    }));

    // Resumo também no Excel (primeiras linhas)
    const summary = [
      { Campo: "Total Planejado", Valor: plannedTotal, Percentual: "100%" },
      {
        Campo: "Total Executado",
        Valor: executedTotal,
        Percentual: plannedTotal > 0 ? formatPercent(executedTotal / plannedTotal) : "0%",
      },
      {
        Campo: "Saldo Disponível",
        Valor: plannedTotal - executedTotal,
        Percentual: plannedTotal > 0 ? formatPercent((plannedTotal - executedTotal) / plannedTotal) : "0%",
      },
    ];

    downloadXlsxFromRows("relatorio-rubricas.xlsx", "Resumo", summary as any);
    downloadXlsxFromRows("relatorio-rubricas-detalhe.xlsx", "Rubricas", rows as any);
  };

  const exportLancamentosXlsx = () => {
    downloadXlsxFromRows(
      "relatorio-lancamentos.xlsx",
      "Lancamentos",
      lancamentosRows.map((r) => ({
        Subitem: r.codigo,
        Descricao: r.descricao,
        Fornecedor: r.fornecedor,
        "CNPJ/CPF": r.cnpj_cpf,
        "Forma de pagamento": r.forma_pagamento,
        "Data pagamento": r.data_pagamento,
        "Nº Nota": r.numero_documento,
        "Data Nota": r.data_nota,
        Valor: r.valor,
      }))
    );
  };

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

  const mergeInvoicesPdf = async () => {
    if (!notasDisponiveis.length) return;

    // Estratégia simples e segura: baixar cada PDF via signed URL e mesclar no browser.
    const { PDFDocument } = await import("pdf-lib");
    const merged = await PDFDocument.create();

    for (const inv of notasDisponiveis) {
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(inv.invoice_path, 60);
      if (error) throw error;

      const res = await fetch(data.signedUrl);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const src = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }

    const out = await merged.save();
    const blob = new Blob([out as any], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");

  };

  const exportNotasConsolidadasPdf = async () => {
    try {
      if (!notasDisponiveis.length) {
        alert("Nenhuma nota fiscal anexada.");
        return;
      }

      const { PDFDocument } = await import("pdf-lib");
      const merged = await PDFDocument.create();

      for (const inv of notasDisponiveis) {
        const { data, error } = await supabase.storage.from("invoices").createSignedUrl(inv.invoice_path, 60);
        if (error) throw error;

        const res = await fetch(data.signedUrl);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const src = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }

      const out = await merged.save();
      const blob = new Blob([out as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "notas-fiscais-consolidadas.pdf";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

    } catch (e: any) {
      alert(e?.message ?? "Falha ao gerar PDF");
    }
  };

  if (!activeProjectId) {
    return (
      <div className="grid gap-6">
        <BalanceteTabs />
        <div className="rounded-3xl border bg-white p-6">
          <div className="text-sm font-semibold text-[hsl(var(--ink))]">Selecione um projeto</div>
        </div>
      </div>
    );
  }

  if (!budgetQuery.data) {
    return (
      <div className="grid gap-6">
        <BalanceteTabs />
        <div className="rounded-3xl border bg-white p-6">
          <div className="text-sm font-semibold text-[hsl(var(--ink))]">Sem orçamento</div>
          <div className="mt-2 text-sm text-[hsl(var(--muted-ink))]">Crie o orçamento no Balancete PRO.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <BalanceteTabs />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={report === "rubricas" ? "default" : "outline"}
            className={cn(
              "rounded-full",
              report === "rubricas"
                ? "bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                : ""
            )}
            onClick={() => setReport("rubricas")}
          >
            Relatório de Rubricas
          </Button>
          <Button
            variant={report === "lancamentos" ? "default" : "outline"}
            className={cn(
              "rounded-full",
              report === "lancamentos"
                ? "bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                : ""
            )}
            onClick={() => setReport("lancamentos")}
          >
            Relatório de Lançamentos
          </Button>
          <Button
            variant={report === "notas" ? "default" : "outline"}
            className={cn(
              "rounded-full",
              report === "notas" ? "bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]" : ""
            )}
            onClick={() => setReport("notas")}
          >
            Relatório de Notas Fiscais
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {report === "rubricas" && (
            <>
              <Button variant="outline" className="rounded-full" onClick={exportRubricasPdf}>
                <FileText className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button variant="outline" className="rounded-full" onClick={exportRubricasXlsx}>
                <Download className="mr-2 h-4 w-4" />
                Excel
              </Button>
              <Button variant="outline" className="rounded-full" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
            </>
          )}

          {report === "lancamentos" && (
            <>
              <Button variant="outline" className="rounded-full" onClick={exportLancamentosPdf}>
                <FileText className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button variant="outline" className="rounded-full" onClick={exportLancamentosXlsx}>
                <Download className="mr-2 h-4 w-4" />
                Excel
              </Button>
              <Button variant="outline" className="rounded-full" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
            </>
          )}

          {report === "notas" && (
            <>
              <Button variant="outline" className="rounded-full" onClick={mergeInvoicesPdf} disabled={!notasDisponiveis.length}>
                <FileText className="mr-2 h-4 w-4" />
                Visualizar
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={exportNotasConsolidadasPdf}
                disabled={!notasDisponiveis.length}
              >
                <Download className="mr-2 h-4 w-4" />
                Baixar PDF
              </Button>
              <Button variant="outline" className="rounded-full" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
            </>
          )}
        </div>
      </div>

      <div ref={printRef} className="grid gap-6">
        {report === "rubricas" && (
          <>
            <ReportHeader
              title="Relatório de Rubricas (Planejado x Executado)"
              planned={plannedTotal}
              executed={executedTotal}
            />

            <Card className="rounded-3xl border bg-white p-0 shadow-sm">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Código</TableHead>
                      <TableHead className="min-w-[320px]">Item / Subitem</TableHead>
                      <TableHead className="min-w-[160px] text-right">Planejado</TableHead>
                      <TableHead className="min-w-[160px] text-right">Executado</TableHead>
                      <TableHead className="min-w-[140px] text-right">% Executado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rubricasRows.map((r, idx) => (
                      <TableRow key={`${r.kind}-${r.code}-${idx}`} className={cn(r.kind === "item" ? "bg-black/[0.03]" : "")}>
                        <TableCell className="font-semibold text-[hsl(var(--ink))]">{r.code}</TableCell>
                        <TableCell className={cn(r.kind === "item" ? "font-semibold" : "pl-6")}>{r.name}</TableCell>
                        <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                          {r.kind === "item" ? "" : formatBRL(r.planned)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                          {r.kind === "item" ? "" : formatBRL(r.executed)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                          {r.kind === "item" ? "" : `${Math.round(r.pct * 100)}%`}
                        </TableCell>
                      </TableRow>
                    ))}

                    <TableRow className="bg-[hsl(var(--app-bg))]">
                      <TableCell />
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">TOTAL</TableCell>
                      <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(plannedTotal)}</TableCell>
                      <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(executedTotal)}</TableCell>
                      <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                        {plannedTotal > 0 ? `${Math.round((executedTotal / plannedTotal) * 100)}%` : "0%"}
                      </TableCell>
                    </TableRow>
                    <TableRow className="bg-[hsl(var(--app-bg))]">
                      <TableCell />
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">SALDO RESTANTE</TableCell>
                      <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(plannedTotal - executedTotal)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                        {plannedTotal > 0 ? `${Math.round(((plannedTotal - executedTotal) / plannedTotal) * 100)}%` : "0%"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}

        {report === "lancamentos" && (
          <>
            <ReportHeader title="Relatório de Lançamentos" planned={plannedTotal} executed={executedTotal} />

            <Card className="rounded-3xl border bg-white p-0 shadow-sm">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[110px]">Subitem</TableHead>
                      <TableHead className="min-w-[260px]">Descrição</TableHead>
                      <TableHead className="min-w-[220px]">Fornecedor</TableHead>
                      <TableHead className="min-w-[170px]">CNPJ/CPF</TableHead>
                      <TableHead className="min-w-[140px]">Forma</TableHead>
                      <TableHead className="min-w-[140px]">Data pag.</TableHead>
                      <TableHead className="min-w-[120px]">Nº Doc</TableHead>
                      <TableHead className="min-w-[140px]">Data NF</TableHead>
                      <TableHead className="min-w-[140px] text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lancamentosRows.map((r, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-semibold text-[hsl(var(--ink))]">{r.codigo}</TableCell>
                        <TableCell>{r.descricao}</TableCell>
                        <TableCell>{r.fornecedor}</TableCell>
                        <TableCell>{r.cnpj_cpf}</TableCell>
                        <TableCell>{r.forma_pagamento}</TableCell>
                        <TableCell>{r.data_pagamento}</TableCell>
                        <TableCell>{r.numero_documento}</TableCell>
                        <TableCell>{r.data_nota}</TableCell>
                        <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(r.valor)}</TableCell>
                      </TableRow>
                    ))}

                    <TableRow className="bg-[hsl(var(--app-bg))]">
                      <TableCell />
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">TOTAL PAGO NO PROJETO</TableCell>
                      <TableCell colSpan={6} />
                      <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                        {formatBRL(lancamentosRows.reduce((acc, r) => acc + r.valor, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}

        {report === "notas" && (
          <>
            <ReportHeader title="Relatório de Notas Fiscais" planned={plannedTotal} executed={executedTotal} />

            <Card className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-[hsl(var(--ink))]">Notas anexadas</div>
              <div className="mt-2 text-sm text-[hsl(var(--muted-ink))]">
                O sistema irá consolidar as notas fiscais anexadas (PDF) em um único arquivo, ordenadas pela data da nota fiscal.
              </div>

              <div className="mt-4 grid gap-2">
                {notasDisponiveis.map((n, idx) => (
                  <div key={`${n.invoice_path}-${idx}`} className="flex items-center justify-between rounded-2xl border bg-[hsl(var(--app-bg))] p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[hsl(var(--ink))]">{n.invoice_file_name}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">Data NF: {formatDateBR(n.due_date)}</div>
                    </div>
                    <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">#{idx + 1}</div>
                  </div>
                ))}

                {!notasDisponiveis.length && (
                  <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-6 text-center text-sm text-[hsl(var(--muted-ink))]">
                    Nenhuma nota fiscal anexada ao projeto.
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>

      <style>{`
        @media print {
          header, footer { display: none !important; }
          button { display: none !important; }
          a { text-decoration: none; }
          .print\:p-0 { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
