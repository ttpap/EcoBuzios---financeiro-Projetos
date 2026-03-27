import { useEffect, useMemo } from "react";
import type { BudgetLine, Transaction } from "@/lib/supabaseTypes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPtBrDecimal, parsePtBrMoneyToNumber } from "@/lib/money";
import { monthRefFromIndex, fetchVendorById } from "@/lib/fileUtils";
import { useTransactionForm } from "@/hooks/useTransactionForm";
import { useTransactionMutations } from "@/hooks/useTransactionMutations";
import { TransactionFormCard } from "@/components/execucao/TransactionFormCard";
import { TransactionListCard } from "@/components/execucao/TransactionListCard";

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
  const form = useTransactionForm(monthIndex, line?.id ?? "");

  const monthRef = useMemo(() => monthRefFromIndex(form.currentMonthIndex), [form.currentMonthIndex]);

  const {
    linesForSelect,
    transactions,
    attachments,
    monthTotal,
    createTx,
    updateTx,
    deleteTx,
    removeAttachment,
    signedUrl,
  } = useTransactionMutations({
    open,
    budgetId,
    projectId,
    line,
    monthRef,
    editingLineId: form.editingLineId,
    onChangeSelectedLineId,
  });

  function fillFormFromTx(t: any) {
    form.setPaymentMethod((t.payment_method as any) || "");
    form.setDocumentNumber(t.document_number || "");
    form.setDueDate(t.due_date || "");
    form.setPaidDate(t.paid_date || "");
    form.setAmount(formatPtBrDecimal(Number(t.amount ?? 0)));
    form.setNotes(t.notes || "");
    form.setEditingMonthIndex(Number(t.month_index ?? form.currentMonthIndex));
    form.setEditingLineId(String(t.budget_line_id || line?.id || ""));
    form.setFiles([]);
    const vendorId = String(t.vendor_id || "");
    if (vendorId) fetchVendorById(vendorId).then((v) => v && form.setVendor(v));
    else form.setVendor(null);
  }

  function startEditCompletely(t: any) { form.setActionTxId(null); form.setEditing(t as Transaction); fillFormFromTx(t); }

  function startCloneTx(t: any) {
    form.setActionTxId(null); form.setEditing(null);
    const nextMonth = Number(t.month_index ?? form.currentMonthIndex);
    if (Number.isFinite(nextMonth) && nextMonth > 0) form.setCurrentMonthIndex(nextMonth);
    fillFormFromTx(t);
  }

  useEffect(() => {
    if (!open) {
      form.setCurrentMonthIndex(monthIndex);
      form.setEditing(null);
      form.setVendor(null);
      form.setPaymentMethod("");
      form.setDocumentNumber("");
      form.setDueDate("");
      form.setPaidDate("");
      form.setAmount("");
      form.setNotes("");
      form.setFiles([]);
      form.setEditingMonthIndex(monthIndex);
      form.setEditingLineId(line?.id ?? "");
      form.setActionTxId(null);
      return;
    }
    form.setCurrentMonthIndex(monthIndex);
    form.setEditingLineId(line?.id ?? "");
    form.setActionTxId(null);
  }, [open, monthIndex, line?.id]);

  function handleSave() {
    const mutationParams = {
      vendor: form.vendor,
      paymentMethod: form.paymentMethod,
      paidDate: form.paidDate,
      amount: form.amount,
      currentMonthIndex: form.currentMonthIndex,
      documentNumber: form.documentNumber,
      notes: form.notes,
      dueDate: form.dueDate,
      files: form.files,
      parsePtBrMoneyToNumber,
    };

    if (!form.editing) {
      createTx.mutate(mutationParams, {
        onSuccess: () => {
          form.setEditing(null);
          form.setVendor(null);
          form.setPaymentMethod("");
          form.setDocumentNumber("");
          form.setDueDate("");
          form.setPaidDate("");
          form.setAmount("");
          form.setNotes("");
          form.setFiles([]);
        },
      });
    } else {
      updateTx.mutate(
        {
          ...mutationParams,
          editing: form.editing,
          editingMonthIndex: form.editingMonthIndex,
        },
        {
          onSuccess: ({ tx }) => {
            const newMonthIndex = Number((tx as any).month_index ?? form.editingMonthIndex);
            form.setEditing(null);
            form.setFiles([]);
            if (newMonthIndex !== form.currentMonthIndex) form.setCurrentMonthIndex(newMonthIndex);
          },
        }
      );
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              Lançamentos — {line?.code || ""} {line?.name || ""} · Mês {form.currentMonthIndex}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <TransactionFormCard
              monthTotal={monthTotal}
              editing={form.editing}
              linesForSelect={linesForSelect}
              editingLineId={form.editingLineId}
              onEditingLineIdChange={form.setEditingLineId}
              editingMonthIndex={form.editingMonthIndex}
              onEditingMonthIndexChange={form.setEditingMonthIndex}
              monthsCount={monthsCount}
              vendor={form.vendor}
              onVendorChange={form.setVendor}
              paymentMethod={form.paymentMethod}
              onPaymentMethodChange={form.setPaymentMethod}
              documentNumber={form.documentNumber}
              onDocumentNumberChange={form.setDocumentNumber}
              dueDate={form.dueDate}
              onDueDateChange={form.setDueDate}
              paidDate={form.paidDate}
              onPaidDateChange={form.setPaidDate}
              amount={form.amount}
              onAmountChange={form.setAmount}
              onAmountBlur={() => {
                if (!form.amount.trim()) return;
                const n = parsePtBrMoneyToNumber(form.amount);
                form.setAmount(formatPtBrDecimal(n));
              }}
              notes={form.notes}
              onNotesChange={form.setNotes}
              files={form.files}
              onFilesChange={form.setFiles}
              onFileInputChange={(fileList) => {
                const list = Array.from(fileList ?? []);
                if (list.length) form.setFiles((curr) => [...curr, ...list]);
              }}
              onCancelEdit={() => {
                form.setEditing(null);
                form.setVendor(null);
                form.setPaymentMethod("");
                form.setDocumentNumber("");
                form.setDueDate("");
                form.setPaidDate("");
                form.setAmount("");
                form.setNotes("");
                form.setFiles([]);
                form.setEditingMonthIndex(form.currentMonthIndex);
                form.setEditingLineId(line?.id ?? "");
              }}
              onSave={handleSave}
              isSaving={createTx.isPending || updateTx.isPending}
              currentMonthIndex={form.currentMonthIndex}
              lineId={line?.id}
            />

            <TransactionListCard
              transactions={transactions}
              attachments={attachments}
              editing={form.editing}
              actionTxId={form.actionTxId}
              projectId={projectId}
              onEditClick={(t) => form.setActionTxId(t.id)}
              onCloneClick={startCloneTx}
              onEditCompletelyClick={startEditCompletely}
              onCancelAction={() => form.setActionTxId(null)}
              onDeleteClick={(id) => deleteTx.mutate(id)}
              onRemoveAttachment={(a, tx) => removeAttachment.mutate({ attachment: a, tx })}
              onGetSignedUrl={(path) => signedUrl.mutateAsync(path)}
              onPreviewOpen={(url) => {
                form.setPreviewUrl(url);
                form.setPreviewOpen(true);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={form.previewOpen} onOpenChange={form.setPreviewOpen}>
        <DialogContent className="max-w-5xl rounded-3xl">
          <DialogHeader>
            <DialogTitle>Visualizar nota fiscal</DialogTitle>
          </DialogHeader>
          <div className="h-[75vh] overflow-hidden rounded-2xl border bg-white">
            <iframe title="Nota fiscal" src={form.previewUrl} className="h-full w-full" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
