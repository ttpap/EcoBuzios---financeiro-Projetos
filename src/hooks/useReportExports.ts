import { useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { downloadXlsxFromRows, downloadXlsxWithSheets, formatPercent } from "@/lib/reporting";
import { normalizePayMethod, formatDateBR } from "@/lib/reportBuilders";
import { formatBRL } from "@/lib/money";
import { supabase } from "@/integrations/supabase/client";
import type { Project, Budget } from "@/lib/supabaseTypes";

type RubricaRow = {
  kind: "item" | "subitem" | "total_item" | "total_project";
  code: string;
  name: string;
  planned: number;
  executed: number;
  saldo: number;
  pct: number;
};

type LancamentoRow = {
  codigo: string;
  descricao: string;
  fornecedor: string;
  cnpj_cpf: string;
  forma_pagamento: string;
  data_pagamento: string;
  numero_documento: string;
  data_nota: string;
  valor: number;
};

type NotaRow = {
  invoice_path: string;
  invoice_file_name: string;
  due_date: string;
};

interface UseReportExportsProps {
  rubricasRows: RubricaRow[];
  lancamentosRows: LancamentoRow[];
  notasRows: NotaRow[];
  project: Project | null;
  budget: Budget | null;
  plannedTotal: number;
  executedTotal: number;
}

export function useReportExports({
  rubricasRows,
  lancamentosRows,
  notasRows,
  plannedTotal,
  executedTotal,
}: UseReportExportsProps) {
  const printRef = useRef<HTMLDivElement | null>(null);

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

    const body = rubricasRows.map((r) => {
      const isSub = r.kind === "subitem";
      const name = isSub ? `  ${r.name}` : r.name;
      return [
        r.code,
        name,
        formatBRL(r.planned),
        formatBRL(r.executed),
        formatBRL(r.saldo),
        `${Math.round(r.pct * 100)}%`,
      ];
    });

    autoTable(doc, {
      startY: 120,
      head: [["Código", "Item/Subitem", "Planejado", "Executado", "Saldo", "% Exec."]],
      body,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [96, 74, 255] },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      didParseCell: (data) => {
        const rowIndex = data.row.index;
        const kind = rubricasRows[rowIndex]?.kind;
        if (kind === "item") {
          data.cell.styles.fillColor = [245, 245, 246];
          data.cell.styles.fontStyle = "bold";
        }
        if (kind === "total_item") {
          data.cell.styles.fillColor = [232, 236, 255];
          data.cell.styles.fontStyle = "bold";
        }
        if (kind === "total_project") {
          data.cell.styles.fillColor = [16, 24, 40];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = "bold";
        }

      },
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

    const rows = rubricasRows.map((r) => ({
      Codigo: r.code,
      "Item/Subitem": r.name,
      Planejado: r.planned,
      Executado: r.executed,
      Saldo: r.saldo,
      "% Executado": formatPercent(r.pct),
    }));

    rows.push({
      Codigo: "",
      "Item/Subitem": "TOTAL GERAL DO PROJETO",
      Planejado: plannedTotal,
      Executado: executedTotal,
      Saldo: plannedTotal - executedTotal,
      "% Executado": plannedTotal > 0 ? formatPercent(executedTotal / plannedTotal) : "0%",
    } as any);

    downloadXlsxWithSheets("relatorio-rubricas.xlsx", [
      { name: "Resumo", rows: summary as any },
      { name: "Rubricas", rows: rows as any },
    ]);
  };

  const exportLancamentosXlsx = () => {
    const totalPago = lancamentosRows.reduce((acc, r) => acc + r.valor, 0);

    downloadXlsxFromRows(
      "relatorio-lancamentos.xlsx",
      "Lancamentos",
      [
        ...lancamentosRows.map((r) => ({
          Subitem: r.codigo,
          Descricao: r.descricao,
          Fornecedor: r.fornecedor,
          "CNPJ/CPF": r.cnpj_cpf,
          "Forma de pagamento": r.forma_pagamento,
          "Data pagamento": r.data_pagamento,
          "Nº Nota": r.numero_documento,
          "Data Nota": r.data_nota,
          Valor: r.valor,
        })),
        {
          Subitem: "",
          Descricao: "TOTAL PAGO NO PROJETO",
          Fornecedor: "",
          "CNPJ/CPF": "",
          "Forma de pagamento": "",
          "Data pagamento": "",
          "Nº Nota": "",
          "Data Nota": "",
          Valor: totalPago,
        } as any,
      ]
    );
  };

  const mergeInvoicesPdf = async () => {
    if (!notasRows.length) return;

    const { PDFDocument } = await import("pdf-lib");
    const merged = await PDFDocument.create();

    for (const inv of notasRows) {
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
      if (!notasRows.length) {
        alert("Nenhuma nota fiscal anexada.");
        return;
      }

      const { PDFDocument } = await import("pdf-lib");
      const merged = await PDFDocument.create();

      for (const inv of notasRows) {
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

  return {
    printRef,
    exportRubricasPdf,
    exportLancamentosPdf,
    exportRubricasXlsx,
    exportLancamentosXlsx,
    mergeInvoicesPdf,
    exportNotasConsolidadasPdf,
  };
}
