import type { Transaction, TransactionAttachment } from "@/lib/supabaseTypes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Download, Trash2, Eye, Pencil } from "lucide-react";
import { downloadBlobUrl } from "@/lib/fileUtils";

interface TransactionListCardProps {
  transactions: Transaction[];
  attachments: Map<string, TransactionAttachment[]> | undefined;
  editing: Transaction | null;
  actionTxId: string | null;
  projectId: string;
  onEditClick: (t: Transaction) => void;
  onCloneClick: (t: Transaction) => void;
  onEditCompletelyClick: (t: Transaction) => void;
  onCancelAction: () => void;
  onDeleteClick: (id: string) => void;
  onRemoveAttachment: (attachment: TransactionAttachment, tx: Transaction) => void;
  onGetSignedUrl: (path: string) => Promise<string>;
  onPreviewOpen: (url: string) => void;
}

export function TransactionListCard({
  transactions,
  attachments,
  editing,
  actionTxId,
  projectId,
  onEditClick,
  onCloneClick,
  onEditCompletelyClick,
  onCancelAction,
  onDeleteClick,
  onRemoveAttachment,
  onGetSignedUrl,
  onPreviewOpen,
}: TransactionListCardProps) {
  return (
    <Card className="rounded-3xl border bg-white p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="text-sm font-semibold text-[hsl(var(--ink))]">Lançamentos do mês</div>
        <div className="text-xs text-[hsl(var(--muted-ink))]">
          {transactions.length ? `${transactions.length} lançamento(s)` : "Nenhum lançamento"}
        </div>
      </div>

      <div className="mt-3 max-h-[320px] overflow-y-auto pr-1">
        <div className="grid gap-2">
          {(transactions as any[]).map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex items-start justify-between gap-3 rounded-2xl border bg-[hsl(var(--app-bg))] p-3",
                editing?.id === t.id ? "ring-2 ring-[hsl(var(--brand)/0.35)]" : ""
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[hsl(var(--ink))]">{formatBRL(Number(t.amount ?? 0))}</div>
                <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
                  {t.paid_date ? `Pago em ${t.paid_date}` : ""}
                  {t.document_number ? ` · Doc: ${t.document_number}` : ""}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {editing?.id === t.id ? (
                    <div className="rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-semibold text-[hsl(var(--brand))]">
                      Em edição
                    </div>
                  ) : actionTxId === t.id ? (
                    <>
                      <Button type="button" variant="outline" className="h-8 rounded-full" onClick={() => onCloneClick(t)}>
                        Clonar lançamento
                      </Button>
                      <Button
                        type="button"
                        className="h-8 rounded-full bg-[hsl(var(--brand))] px-3 text-white hover:bg-[hsl(var(--brand-strong))]"
                        onClick={() => onEditCompletelyClick(t)}
                      >
                        Editar completamente
                      </Button>
                      <Button type="button" variant="ghost" className="h-8 rounded-full" onClick={onCancelAction}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="outline" className="h-8 rounded-full" onClick={() => onEditClick(t)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                  )}

                  {(() => {
                    const list = attachments?.get(t.id) ?? [];
                    const legacy = t.invoice_path
                      ? [
                          {
                            id: "legacy",
                            transaction_id: t.id,
                            project_id: projectId,
                            file_name: String(t.invoice_file_name ?? "nota-fiscal.pdf"),
                            storage_path: String(t.invoice_path),
                            size_bytes: Number(t.invoice_size_bytes ?? 0) || null,
                            mime_type: "application/pdf",
                            created_at: String(t.created_at ?? ""),
                          } as TransactionAttachment,
                        ]
                      : [];

                    const merged = list.length ? list : legacy;
                    if (!merged.length) {
                      return <div className="mt-2 text-xs font-medium text-red-700">Sem PDF anexado.</div>;
                    }

                    return (
                      <div className="mt-2 w-full rounded-2xl border bg-white p-3">
                        <div className="text-xs font-semibold text-[hsl(var(--ink))]">Anexos ({merged.length})</div>
                        <div className="mt-2 grid gap-2">
                          {merged.map((a) => (
                            <div key={a.storage_path} className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0 truncate text-sm text-[hsl(var(--ink))]">{a.file_name}</div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-full"
                                  onClick={async () => {
                                    const url = await onGetSignedUrl(String(a.storage_path));
                                    onPreviewOpen(url);
                                  }}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  Visualizar
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-full"
                                  onClick={async () => {
                                    const url = await onGetSignedUrl(String(a.storage_path));
                                    downloadBlobUrl(url, String(a.file_name || "anexo.pdf"));
                                  }}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Baixar
                                </Button>
                                {a.id !== "legacy" ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 rounded-full"
                                    onClick={() => onRemoveAttachment(a, t as Transaction)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remover
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => onDeleteClick(t.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {!transactions.length && (
            <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4 text-sm text-[hsl(var(--muted-ink))]">
              Nenhum lançamento neste mês.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
