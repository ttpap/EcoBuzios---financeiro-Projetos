import { useState } from "react";
import { useAppStore } from "@/lib/appStore";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { Download, FileText, Printer } from "lucide-react";
import { useReportData } from "@/hooks/useReportData";
import { useReportExports } from "@/hooks/useReportExports";
import { formatDateBR } from "@/lib/reportBuilders";

export default function BalanceteRelatorios() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const [report, setReport] = useState<"rubricas" | "lancamentos" | "notas">("rubricas");

  const {
    project,
    budget,
    rubricasRows,
    lancamentosRows,
    notasRows,
    plannedTotal,
    executedTotal,
  } = useReportData();

  const {
    printRef,
    exportRubricasPdf,
    exportLancamentosPdf,
    exportRubricasXlsx,
    exportLancamentosXlsx,
    mergeInvoicesPdf,
    exportNotasConsolidadasPdf,
  } = useReportExports({ rubricasRows, lancamentosRows, notasRows, project, budget, plannedTotal, executedTotal });

  const handlePrint = () => {
    window.print();
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

  if (!budget) {
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

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-3">
        <div className="flex min-w-0 flex-wrap gap-2">
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
            <span className="sm:hidden">Rubricas</span>
            <span className="hidden sm:inline">Relatório de Rubricas</span>
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
            <span className="sm:hidden">Lançamentos</span>
            <span className="hidden sm:inline">Relatório de Lançamentos</span>
          </Button>
          <Button
            variant={report === "notas" ? "default" : "outline"}
            className={cn(
              "rounded-full",
              report === "notas" ? "bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]" : ""
            )}
            onClick={() => setReport("notas")}
          >
            <span className="sm:hidden">Notas</span>
            <span className="hidden sm:inline">Relatório de Notas Fiscais</span>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 md:ml-auto">
          {report === "rubricas" && (
            <>
              <Button variant="outline" className="rounded-full" onClick={exportRubricasPdf}>
                <FileText className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button variant="outline" className="rounded-full" onClick={exportRubricasXlsx}>
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
              <Button variant="outline" className="rounded-full" onClick={handlePrint}>
                <Printer className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Imprimir</span>
              </Button>
            </>
          )}

          {report === "lancamentos" && (
            <>
              <Button variant="outline" className="rounded-full" onClick={exportLancamentosPdf}>
                <FileText className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button variant="outline" className="rounded-full" onClick={exportLancamentosXlsx}>
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
              <Button variant="outline" className="rounded-full" onClick={handlePrint}>
                <Printer className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Imprimir</span>
              </Button>
            </>
          )}

          {report === "notas" && (
            <>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={mergeInvoicesPdf}
                disabled={!notasRows.length}
              >
                <FileText className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Visualizar</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={exportNotasConsolidadasPdf}
                disabled={!notasRows.length}
              >
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Baixar PDF</span>
              </Button>
              <Button variant="outline" className="rounded-full" onClick={handlePrint}>
                <Printer className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Imprimir</span>
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
              project={project}
            />

            <Card className="rounded-3xl border bg-white p-0 shadow-sm">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Código</TableHead>
                      <TableHead className="min-w-[320px]">Item / Subitem</TableHead>
                      <TableHead className="min-w-[160px] text-right">Planejado</TableHead>
                      <TableHead className="min-w-[160px] text-right">Executado</TableHead>
                      <TableHead className="min-w-[160px] text-right">Saldo</TableHead>
                      <TableHead className="min-w-[140px] text-right">% Executado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rubricasRows.map((r, idx) => (
                      <TableRow
                        key={`${r.kind}-${r.code}-${idx}`}
                        className={cn(
                          r.kind === "item" ? "bg-black/[0.03]" : "",
                          r.kind === "total_project" ? "bg-[hsl(var(--ink))] text-white" : ""
                        )}
                      >
                        <TableCell
                          className={cn(
                            "font-semibold",
                            r.kind === "total_project" ? "text-white" : "text-[hsl(var(--ink))]"
                          )}
                        >
                          {r.code}
                        </TableCell>
                        <TableCell
                          className={cn(
                            r.kind === "item" ? "font-semibold" : r.kind === "subitem" ? "pl-6" : "font-semibold",
                            r.kind === "total_project" ? "text-white" : "text-[hsl(var(--ink))]"
                          )}
                        >
                          {r.name}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            r.kind === "total_project" ? "text-white" : "text-[hsl(var(--ink))]"
                          )}
                        >
                          {formatBRL(r.planned)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            r.kind === "total_project" ? "text-white" : "text-[hsl(var(--ink))]"
                          )}
                        >
                          {formatBRL(r.executed)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            r.kind === "total_project" ? "text-white" : "text-[hsl(var(--ink))]"
                          )}
                        >
                          {formatBRL(r.saldo)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            r.kind === "total_project" ? "text-white" : "text-[hsl(var(--ink))]"
                          )}
                        >
                          {`${Math.round(r.pct * 100)}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}

        {report === "lancamentos" && (
          <>
            <ReportHeader title="Relatório de Lançamentos" planned={plannedTotal} executed={executedTotal} project={project} />

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
            <ReportHeader title="Relatório de Notas Fiscais" planned={plannedTotal} executed={executedTotal} project={project} />

            <Card className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-[hsl(var(--ink))]">Notas anexadas</div>
              <div className="mt-2 text-sm text-[hsl(var(--muted-ink))]">
                O sistema irá consolidar as notas fiscais anexadas (PDF) em um único arquivo, ordenadas pela data da nota fiscal.
              </div>

              <div className="mt-4 grid gap-2">
                {notasRows.map((n, idx) => (
                  <div
                    key={`${n.invoice_path}-${idx}`}
                    className="flex items-center justify-between rounded-2xl border bg-[hsl(var(--app-bg))] p-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[hsl(var(--ink))]">{n.invoice_file_name}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">Data NF: {formatDateBR(n.due_date)}</div>
                    </div>
                    <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">#{idx + 1}</div>
                  </div>
                ))}

                {!notasRows.length && (
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
