import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetLine, Transaction, Vendor } from "@/lib/supabaseTypes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL, formatPtBrDecimal, parsePtBrMoneyToNumber } from "@/lib/money";
import { toast } from "sonner";
import { VendorCombobox } from "@/components/execucao/VendorCombobox";
import { cn } from "@/lib/utils";
import { PDFDocument } from "pdf-lib";
import { Download, FileUp, Trash2, Eye, Pencil, X } from "lucide-react";

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

function monthRefFromIndex(index1: number) {
  const base = new Date(Date.UTC(2000, 0, 1));
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + (index1 - 1), 1));
  return d.toISOString().slice(0, 10);
}

async function compressPdf(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfDoc = await PDFDocument.load(bytes);
  const out = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  return out;
}

function downloadBlobUrl(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function fetchVendorById(vendorId: string): Promise<Vendor | null> {
  const { data, error } = await supabase.from("vendors").select("*").eq("id", vendorId).single();
  if (error) return null;
  return (data as Vendor) ?? null;
}

export function ExecucaoLancamentosDialog({
  open,
  onOpenChange,
  projectId,
  budgetId,
  line,
  monthIndex,
  monthsCount,
  onChangeSelectedLineId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  budgetId: string;
  line: BudgetLine | null;
  monthIndex: number;
  monthsCount: number;
  onChangeSelectedLineId?: (lineId: string) => void;
}) {
  const queryClient = useQueryClient();

  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(monthIndex);
  const monthRef = useMemo(() => monthRefFromIndex(currentMonthIndex), [currentMonthIndex]);

  const linesForSelectQuery = useQuery({
    queryKey: ["execBudgetLines", budgetId],
    enabled: Boolean(open && budgetId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_lines")
        .select("id,code,name,is_subtotal")
        .eq("budget_id", budgetId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<Pick<BudgetLine, "id" | "code" | "name" | "is_subtotal">>;
    },
  });

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
  const [notes, setNotes] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editingMonthIndex, setEditingMonthIndex] = useState<number>(monthIndex);
  const [editingLineId, setEditingLineId] = useState<string>(line?.id ?? "");
  const [actionTxId, setActionTxId] = useState<string | null>(null);

  function fillFormFromTx(t: any) {
    setPaymentMethod((t.payment_method as any) || "");
    setDocumentNumber(t.document_number || "");
    setDueDate(t.due_date || "");
    setPaidDate(t.paid_date || "");
    setAmount(formatPtBrDecimal(Number(t.amount ?? 0)));
    setNotes(t.notes || "");
    setEditingMonthIndex(Number(t.month_index ?? currentMonthIndex));
    setEditingLineId(String(t.budget_line_id || line?.id || ""));
    setFile(null);

    const vendorId = String(t.vendor_id || "");
    if (vendorId) {
      fetchVendorById(vendorId).then((v) => v && setVendor(v));
    } else {
      setVendor(null);
    }
  }

  function startEditCompletely(t: any) {
    setActionTxId(null);
    setEditing(t as Transaction);
    fillFormFromTx(t);
  }

  function startCloneTx(t: any) {
    setActionTxId(null);
    setEditing(null);
    const nextMonth = Number(t.month_index ?? currentMonthIndex);
    if (Number.isFinite(nextMonth) && nextMonth > 0) setCurrentMonthIndex(nextMonth);
    fillFormFromTx(t);
  }

  useEffect(() => {
    if (!open) {
      setCurrentMonthIndex(monthIndex);
      setEditing(null);
      setVendor(null);
      setPaymentMethod("");
      setDocumentNumber("");
      setDueDate("");
      setPaidDate("");
      setAmount("");
      setNotes("");
      setFile(null);
      setEditingMonthIndex(monthIndex);
      setEditingLineId(line?.id ?? "");
      setActionTxId(null);
      return;
    }

    setCurrentMonthIndex(monthIndex);
    setEditingLineId(line?.id ?? "");
    setActionTxId(null);
  }, [open, monthIndex, line?.id]);

  const signedUrl = useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 60);
      if (error) throw error;
      return data.signedUrl;
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao gerar link"),
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

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

      const user = await supabase.auth.getUser();
      const userId = user.data.user?.id;
      if (!userId) throw new Error("Sem sessão");

      const { data, error } = await supabase
        .from("transactions")
        .insert({
          project_id: projectId,
          budget_id: budgetId,
          budget_line_id: line.id,
          date: paidDate,
          month_index: currentMonthIndex,
          amount: parsedAmount,
          description: line.name,
          document_number: documentNumber.trim() || null,
          notes: notes.trim() || null,
          created_by_user_id: userId,
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
      setEditing(null);
      setVendor(null);
      setPaymentMethod("");
      setDocumentNumber("");
      setDueDate("");
      setPaidDate("");
      setAmount("");
      setNotes("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["execTx", projectId, budgetId] });
      queryClient.invalidateQueries({ queryKey: ["execTxMonth", projectId, budgetId, line?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  const updateTx = useMutation({
    mutationFn: async () => {
      if (!editing?.id) throw new Error("Selecione um lançamento para editar");
      if (!vendor?.id) throw new Error("Selecione um fornecedor");
      if (!paymentMethod) throw new Error("Selecione a forma de pagamento");
      if (!paidDate) throw new Error("Informe a data de pagamento");

      const parsedAmount = parsePtBrMoneyToNumber(amount);
      if (!parsedAmount || parsedAmount <= 0) throw new Error("Informe um valor válido");

      const oldMonthIndex = Number((editing as any).month_index ?? currentMonthIndex);
      const oldLineId = String((editing as any).budget_line_id ?? "");

      const nextLineId = String(editingLineId || oldLineId || line?.id || "");
      if (!nextLineId) throw new Error("Selecione o item (rubrica)");

      const lines = (linesForSelectQuery.data ?? []).filter((l) => !l.is_subtotal);
      const nextLine = lines.find((l) => l.id === nextLineId);

      let invoice_path: string | null | undefined;
      let invoice_file_name: string | null | undefined;
      let invoice_size_bytes: number | null | undefined;

      const oldPath = (editing as any).invoice_path as string | null | undefined;

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

        if (oldPath && oldPath !== path) {
          await supabase.storage.from("invoices").remove([oldPath]);
        }
      }

      const { data, error } = await supabase
        .from("transactions")
        .update({
          budget_line_id: nextLineId,
          description: nextLine?.name ?? (editing as any).description ?? null,
          vendor_id: vendor.id,
          payment_method: paymentMethod,
          document_number: documentNumber.trim() || null,
          due_date: dueDate || null,
          paid_date: paidDate,
          date: paidDate,
          amount: parsedAmount,
          notes: notes.trim() || null,
          month_index: editingMonthIndex,
          ...(invoice_path !== undefined
            ? { invoice_path, invoice_file_name, invoice_size_bytes }
            : {}),
        } as any)
        .eq("id", editing.id)
        .select("*")
        .single();
      if (error) throw error;

      return { tx: data as Transaction, oldMonthIndex, oldLineId, newLineId: nextLineId };
    },
    onSuccess: ({ tx, oldMonthIndex, oldLineId, newLineId }) => {
      const newMonthIndex = Number((tx as any).month_index ?? editingMonthIndex);

      const movedMonth = newMonthIndex !== oldMonthIndex;
      const movedLine = newLineId && oldLineId && newLineId !== oldLineId;

      toast.success(
        movedMonth
          ? `Lançamento movido para Mês ${newMonthIndex}`
          : movedLine
            ? "Lançamento movido para outro item"
            : "Lançamento atualizado"
      );

      setEditing(null);
      setFile(null);

      if (newMonthIndex !== currentMonthIndex) setCurrentMonthIndex(newMonthIndex);
      if (movedLine && onChangeSelectedLineId) onChangeSelectedLineId(newLineId);

      queryClient.invalidateQueries({ queryKey: ["execTx", projectId, budgetId] });
      queryClient.invalidateQueries({ queryKey: ["execTxMonth", projectId, budgetId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar"),
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
      queryClient.invalidateQueries({ queryKey: ["execTxMonth", projectId, budgetId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir"),
  });

  const canEdit = editing != null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              Lançamentos — {line?.code || ""} {line?.name || ""} · Mês {currentMonthIndex}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <Card className="rounded-3xl border bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total do mês</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
                    {formatBRL(monthTotal)}
                  </div>
                </div>

                {editing && (
                  <div className="rounded-2xl border bg-[hsl(var(--app-bg))] px-3 py-2">
                    <div className="text-xs text-[hsl(var(--muted-ink))]">
                      Editando lançamento: <span className="font-medium text-[hsl(var(--ink))]">{editing.id.slice(0, 8)}</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-2 h-8 rounded-full"
                      onClick={() => {
                        setEditing(null);
                        setVendor(null);
                        setPaymentMethod("");
                        setDocumentNumber("");
                        setDueDate("");
                        setPaidDate("");
                        setAmount("");
                        setNotes("");
                        setFile(null);
                        setEditingMonthIndex(currentMonthIndex);
                        setEditingLineId(line?.id ?? "");
                      }}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Sair da edição
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3">
                {editing && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Item (rubrica)</div>
                      <Select value={editingLineId} onValueChange={(v) => setEditingLineId(v)}>
                        <SelectTrigger className="rounded-2xl">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {(linesForSelectQuery.data ?? [])
                            .filter((l) => !l.is_subtotal)
                            .map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {(l.code ? `${l.code} — ` : "") + l.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Mês do lançamento</div>
                      <Select value={String(editingMonthIndex)} onValueChange={(v) => setEditingMonthIndex(Number(v))}>
                        <SelectTrigger className="rounded-2xl">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: monthsCount }, (_, i) => i + 1).map((m) => (
                            <SelectItem key={m} value={String(m)}>
                              Mês {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Fornecedor / Credor</div>
                  <VendorCombobox value={vendor} onChange={setVendor} />
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
                  <Input
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    className="rounded-2xl"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
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
                    onBlur={() => {
                      if (!amount.trim()) return;
                      const n = parsePtBrMoneyToNumber(amount);
                      setAmount(formatPtBrDecimal(n));
                    }}
                    className="rounded-2xl"
                    inputMode="decimal"
                    placeholder="Ex: 100,20"
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Observações</div>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-2xl" />
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Anexar Nota Fiscal (PDF)</div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      type="file"
                      accept="application/pdf"
                      className="rounded-2xl"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    <Button type="button" variant="outline" className="h-10 rounded-2xl" onClick={() => setFile(null)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {!canEdit ? (
                  <Button
                    onClick={() => createTx.mutate()}
                    disabled={createTx.isPending}
                    className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                  >
                    <FileUp className="mr-2 h-4 w-4" />
                    Salvar lançamento
                  </Button>
                ) : (
                  <Button
                    onClick={() => updateTx.mutate()}
                    disabled={updateTx.isPending}
                    className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Salvar alterações
                  </Button>
                )}
              </div>
            </Card>

            <Card className="rounded-3xl border bg-white p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div className="text-sm font-semibold text-[hsl(var(--ink))]">Lançamentos do mês</div>
                <div className="text-xs text-[hsl(var(--muted-ink))]">
                  {txQuery.data?.length ? `${txQuery.data.length} lançamento(s)` : "Nenhum lançamento"}
                </div>
              </div>

              <div className="mt-3 max-h-[320px] overflow-y-auto pr-1">
                <div className="grid gap-2">
                  {(txQuery.data ?? []).map((t: any) => (
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
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 rounded-full"
                                onClick={() => startCloneTx(t)}
                              >
                                Clonar lançamento
                              </Button>
                              <Button
                                type="button"
                                className="h-8 rounded-full bg-[hsl(var(--brand))] px-3 text-white hover:bg-[hsl(var(--brand-strong))]"
                                onClick={() => startEditCompletely(t)}
                              >
                                Editar completamente
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-8 rounded-full"
                                onClick={() => setActionTxId(null)}
                              >
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 rounded-full"
                              onClick={() => setActionTxId(t.id)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </Button>
                          )}

                          {t.invoice_file_name && t.invoice_path && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 rounded-full"
                                onClick={async () => {
                                  const url = await signedUrl.mutateAsync(String(t.invoice_path));
                                  setPreviewUrl(url);
                                  setPreviewOpen(true);
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
                                  const url = await signedUrl.mutateAsync(String(t.invoice_path));
                                  downloadBlobUrl(url, String(t.invoice_file_name || "nota-fiscal.pdf"));
                                }}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Baixar
                              </Button>
                            </>
                          )}
                        </div>

                        {!t.invoice_path && (
                          <div className="mt-2 text-xs font-medium text-red-700">Sem PDF anexado.</div>
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
              </div>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl rounded-3xl">
          <DialogHeader>
            <DialogTitle>Visualizar nota fiscal</DialogTitle>
          </DialogHeader>
          <div className="h-[75vh] overflow-hidden rounded-2xl border bg-white">
            <iframe title="Nota fiscal" src={previewUrl} className="h-full w-full" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}