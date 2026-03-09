import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetLine, Transaction } from "@/lib/supabaseTypes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL, parsePtBrMoneyToNumber } from "@/lib/money";
import { toast } from "sonner";
import { VendorCombobox, type Vendor } from "@/components/execucao/VendorCombobox";
import { cn } from "@/lib/utils";
import { PDFDocument } from "pdf-lib";
import { Download, FileUp, Trash2 } from "lucide-react";

type PaymentMethod = "transferencia" | "cheque" | "boleto" | "pix";

function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

async function compressPdf(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // "Compressão" básica: re-salva via pdf-lib com compressão de objetos.
  const pdfDoc = await PDFDocument.load(bytes);
  const out = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  return out;
}

export function ExecucaoLancamentosDialog({
  open,
  onOpenChange,
  projectId,
  budgetId,
  line,
  monthIndex,
  monthRef,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  budgetId: string;
  line: BudgetLine | null;
  monthIndex: number;
  monthRef: string; // YYYY-MM-01 (estável)
}) {
  const queryClient = useQueryClient();

  const txQuery = useQuery({
    queryKey: ["execTxMonth", projectId, budgetId, line?.id, monthRef],
    enabled: Boolean(open && projectId && budgetId && line?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("project_id", projectId)
        .eq("budget_id", budgetId)
        .eq("budget_line_id", line!.id)
        .eq("month_ref", monthRef)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });

  const monthTotal = useMemo(() => {
    return (txQuery.data ?? []).reduce((acc, t) => acc + Number((t as any).amount ?? 0), 0);
  }, [txQuery.data]);

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const createTx = useMutation({
    mutationFn: async () => {
      if (!line?.id) throw new Error("Linha inválida");
      if (!vendor?.id) throw new Error("Selecione um fornecedor");
      if (!paymentMethod) throw new Error("Selecione a forma de pagamento");
      if (!paidDate) throw new Error("Informe a data de pagamento");

      const parsedAmount = parsePtBrMoneyToNumber(amount);
      if (!parsedAmount || parsedAmount <= 0) throw new Error("Informe um valor válido");

      let invoice_path: string | null = null;
      let invoice_file_name: string | null = null;
      let invoice_size_bytes: number | null = null;

      if (file) {
        if (file.type !== "application/pdf") throw new Error("Anexe um PDF");

        const compressed = await compressPdf(file);
        const safeName = safeFileName(file.name || "nota-fiscal.pdf");
        const path = `${projectId}/${Date.now()}-${safeName}`;

        const { error: upErr } = await supabase.storage
          .from("invoices")
          .upload(path, compressed, { contentType: "application/pdf", upsert: false });
        if (upErr) throw upErr;

        invoice_path = path;
        invoice_file_name = safeName;
        invoice_size_bytes = compressed.byteLength;
      }

      const { data, error } = await supabase
        .from("transactions")
        .insert({
          project_id: projectId,
          budget_id: budgetId,
          budget_line_id: line.id,
          date: paidDate,
          month_ref: monthRef,
          amount: parsedAmount,
          description: line.name,
          document_number: documentNumber.trim() || null,
          created_by_user_id: (await supabase.auth.getUser()).data.user?.id,
          vendor_id: vendor.id,
          payment_method: paymentMethod,
          due_date: dueDate || null,
          paid_date: paidDate,
          invoice_file_name,
          invoice_path,
          invoice_size_bytes,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as Transaction;
    },
    onSuccess: () => {
      toast.success("Lançamento salvo");
      setDocumentNumber("");
      setDueDate("");
      setPaidDate("");
      setAmount("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["execTx", projectId, budgetId] });
      queryClient.invalidateQueries({ queryKey: ["execTxMonth", projectId, budgetId, line?.id, monthRef] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  const deleteTx = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("transactions")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      queryClient.invalidateQueries({ queryKey: ["execTx", projectId, budgetId] });
      queryClient.invalidateQueries({ queryKey: ["execTxMonth", projectId, budgetId, line?.id, monthRef] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir"),
  });

  const downloadInvoice = useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 60);
      if (error) throw error;
      return data.signedUrl;
    },
    onSuccess: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (e: any) => toast.error(e.message ?? "Falha ao baixar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-3xl">
        <DialogHeader>
          <DialogTitle>
            Lançamentos — {line?.code || ""} {line?.name || ""} · Mês {monthIndex}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-3xl border bg-white p-4">
            <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total do mês</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              {formatBRL(monthTotal)}
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Fornecedor / Credor</div>
                <VendorCombobox projectId={projectId} value={vendor} onChange={setVendor} />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Forma de pagamento</div>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transferencia">Transferência bancária</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="boleto">Boleto bancário</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Número do documento</div>
                <Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} className="rounded-2xl" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Data de vencimento</div>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-2xl" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Data de pagamento</div>
                  <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="rounded-2xl" />
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Valor</div>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="rounded-2xl"
                  inputMode="decimal"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Anexar Nota Fiscal (PDF)</div>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="application/pdf"
                    className="rounded-2xl"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => setFile(null)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-1 text-[11px] text-[hsl(var(--muted-ink))]">
                  O PDF é otimizado antes do upload para manter o sistema leve.
                </div>
              </div>

              <Button
                onClick={() => createTx.mutate()}
                disabled={createTx.isPending}
                className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
              >
                <FileUp className="mr-2 h-4 w-4" />
                Salvar lançamento
              </Button>
            </div>
          </Card>

          <Card className="rounded-3xl border bg-white p-4">
            <div className="text-sm font-semibold text-[hsl(var(--ink))]">Lançamentos do mês</div>
            <div className="mt-3 grid gap-2">
              {(txQuery.data ?? []).map((t: any) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-2xl border bg-[hsl(var(--app-bg))] p-3"
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[hsl(var(--ink))]">{formatBRL(Number(t.amount ?? 0))}</div>
                    <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
                      {t.paid_date ? `Pago em ${t.paid_date}` : ""}
                      {t.document_number ? ` · Doc: ${t.document_number}` : ""}
                    </div>
                    {t.invoice_file_name && (
                      <button
                        className="mt-2 inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs font-medium text-[hsl(var(--ink))] hover:bg-black/5"
                        onClick={() => downloadInvoice.mutate(String(t.invoice_path))}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar nota fiscal
                      </button>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => deleteTx.mutate(t.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {!txQuery.data?.length && (
                <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4 text-sm text-[hsl(var(--muted-ink))]">
                  Nenhum lançamento neste mês.
                </div>
              )}
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
