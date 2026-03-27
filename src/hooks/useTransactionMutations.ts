import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetLine, Transaction, TransactionAttachment, Vendor } from "@/lib/supabaseTypes";
import { toast } from "sonner";
import { safeFileName, fileToLowResPdf } from "@/lib/fileUtils";
import { parsePtBrMoneyToNumber } from "@/lib/money";

async function fetchVendorById(vendorId: string): Promise<Vendor | null> {
  const { data, error } = await supabase.from("vendors").select("*").eq("id", vendorId).single();
  if (error) return null;
  return (data as Vendor) ?? null;
}

export function useTransactionMutations({
  open,
  budgetId,
  projectId,
  line,
  monthRef,
  editingLineId,
  onChangeSelectedLineId,
}: {
  open: boolean;
  budgetId: string;
  projectId: string;
  line: BudgetLine | null;
  monthRef: string;
  editingLineId: string;
  onChangeSelectedLineId?: (lineId: string) => void;
}) {
  const queryClient = useQueryClient();

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

  const attachmentsQuery = useQuery({
    queryKey: ["txAttachments", projectId, txQuery.data?.map((t) => t.id).join("|")],
    enabled: Boolean(open && (txQuery.data ?? []).length),
    queryFn: async () => {
      const ids = (txQuery.data ?? []).map((t) => t.id);
      const { data, error } = await supabase
        .from("transaction_attachments")
        .select("*")
        .in("transaction_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const byTx = new Map<string, TransactionAttachment[]>();
      for (const row of (data ?? []) as TransactionAttachment[]) {
        byTx.set(row.transaction_id, [...(byTx.get(row.transaction_id) ?? []), row]);
      }
      return byTx;
    },
  });

  const addAttachmentsToTx = useMutation({
    mutationFn: async ({ txId, projectId: pid, files }: { txId: string; projectId: string; files: File[] }) => {
      if (!files.length) return [] as TransactionAttachment[];

      const uploaded: TransactionAttachment[] = [];

      for (const f of files) {
        const { bytes, fileName, sizeBytes } = await fileToLowResPdf(f);
        const path = `${pid}/${txId}/${Date.now()}-${safeFileName(fileName)}`;

        const { error: upErr } = await supabase.storage
          .from("invoices")
          .upload(path, bytes, { contentType: "application/pdf", upsert: false });
        if (upErr) throw upErr;

        const { data, error } = await supabase
          .from("transaction_attachments")
          .insert({
            transaction_id: txId,
            project_id: pid,
            file_name: fileName,
            storage_path: path,
            size_bytes: sizeBytes,
            mime_type: "application/pdf",
          } as any)
          .select("*")
          .single();
        if (error) throw error;

        uploaded.push(data as TransactionAttachment);
      }

      return uploaded;
    },
  });

  const removeAttachment = useMutation({
    mutationFn: async ({ attachment, tx }: { attachment: TransactionAttachment; tx: Transaction }) => {
      await supabase.storage.from("invoices").remove([attachment.storage_path]);
      const { error } = await supabase.from("transaction_attachments").delete().eq("id", attachment.id);
      if (error) throw error;

      // Se removeu o "principal", tenta apontar para outro anexo (ou limpar)
      if ((tx as any).invoice_path && String((tx as any).invoice_path) === attachment.storage_path) {
        const { data } = await supabase
          .from("transaction_attachments")
          .select("*")
          .eq("transaction_id", tx.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const next = (data?.[0] as any) as TransactionAttachment | undefined;
        await supabase
          .from("transactions")
          .update({
            invoice_path: next?.storage_path ?? null,
            invoice_file_name: next?.file_name ?? null,
            invoice_size_bytes: next?.size_bytes ?? null,
          } as any)
          .eq("id", tx.id);
      }

      return attachment.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["txAttachments"] });
      queryClient.invalidateQueries({ queryKey: ["execTx", projectId, budgetId] });
      queryClient.invalidateQueries({ queryKey: ["execTxMonth", projectId, budgetId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao remover anexo"),
  });

  const signedUrl = useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 60);
      if (error) throw error;
      return data.signedUrl;
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao gerar link"),
  });

  const createTx = useMutation({
    mutationFn: async ({
      vendor,
      paymentMethod,
      paidDate,
      amount,
      currentMonthIndex,
      documentNumber,
      notes,
      dueDate,
      files,
    }: {
      vendor: { id: string } | null;
      paymentMethod: string;
      paidDate: string;
      amount: string;
      currentMonthIndex: number;
      documentNumber: string;
      notes: string;
      dueDate: string;
      files: File[];
    }) => {
      if (!line?.id) throw new Error("Linha inválida");
      if (!vendor?.id) throw new Error("Selecione um fornecedor");
      if (!paymentMethod) throw new Error("Selecione a forma de pagamento");
      if (!paidDate) throw new Error("Informe a data de pagamento");

      const parsedAmount = parsePtBrMoneyToNumber(amount);
      if (!parsedAmount || parsedAmount <= 0) throw new Error("Informe um valor válido");

      const user = await supabase.auth.getUser();
      const userId = user.data.user?.id;
      if (!userId) throw new Error("Sem sessão");

      const { data: tx, error } = await supabase
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
        } as any)
        .select("*")
        .single();
      if (error) throw error;

      const uploaded = await addAttachmentsToTx.mutateAsync({ txId: tx.id, projectId, files });

      // Mantém compatibilidade: preenche invoice_* com o primeiro anexo
      if (uploaded.length) {
        const first = uploaded[0];
        await supabase
          .from("transactions")
          .update({
            invoice_file_name: first.file_name,
            invoice_path: first.storage_path,
            invoice_size_bytes: first.size_bytes,
          } as any)
          .eq("id", tx.id);
      }

      return tx as Transaction;
    },
    onSuccess: () => {
      toast.success("Lançamento salvo");
      queryClient.invalidateQueries({ queryKey: ["execTx", projectId, budgetId] });
      queryClient.invalidateQueries({ queryKey: ["execTxMonth", projectId, budgetId, line?.id] });
      queryClient.invalidateQueries({ queryKey: ["txAttachments"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  const updateTx = useMutation({
    mutationFn: async ({
      editing,
      vendor,
      paymentMethod,
      paidDate,
      amount,
      editingMonthIndex,
      currentMonthIndex,
      documentNumber,
      notes,
      dueDate,
      files,
    }: {
      editing: Transaction | null;
      vendor: { id: string } | null;
      paymentMethod: string;
      paidDate: string;
      amount: string;
      editingMonthIndex: number;
      currentMonthIndex: number;
      documentNumber: string;
      notes: string;
      dueDate: string;
      files: File[];
    }) => {
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
        } as any)
        .eq("id", editing.id)
        .select("*")
        .single();
      if (error) throw error;

      const uploaded = await addAttachmentsToTx.mutateAsync({ txId: editing.id, projectId, files });
      if (uploaded.length && !(editing as any).invoice_path) {
        const first = uploaded[0];
        await supabase
          .from("transactions")
          .update({
            invoice_file_name: first.file_name,
            invoice_path: first.storage_path,
            invoice_size_bytes: first.size_bytes,
          } as any)
          .eq("id", editing.id);
      }

      return { tx: data as Transaction, oldMonthIndex, oldLineId, newLineId: nextLineId };
    },
    onSuccess: ({ tx, oldMonthIndex, oldLineId, newLineId }) => {
      const newMonthIndex = Number((tx as any).month_index ?? oldMonthIndex);

      const movedMonth = newMonthIndex !== oldMonthIndex;
      const movedLine = newLineId && oldLineId && newLineId !== oldLineId;

      toast.success(
        movedMonth
          ? `Lançamento movido para Mês ${newMonthIndex}`
          : movedLine
            ? "Lançamento movido para outro item"
            : "Lançamento atualizado"
      );

      if (movedLine && onChangeSelectedLineId) onChangeSelectedLineId(newLineId);

      queryClient.invalidateQueries({ queryKey: ["execTx", projectId, budgetId] });
      queryClient.invalidateQueries({ queryKey: ["execTxMonth", projectId, budgetId] });
      queryClient.invalidateQueries({ queryKey: ["txAttachments"] });
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

  return {
    linesForSelect: linesForSelectQuery.data ?? [],
    transactions: txQuery.data ?? [],
    attachments: attachmentsQuery.data ?? [],
    monthTotal,
    isLoading: txQuery.isLoading,
    txQueryData: txQuery.data,
    createTx,
    updateTx,
    deleteTx,
    addAttachmentsToTx,
    removeAttachment,
    signedUrl,
    fetchVendorById,
  };
}
