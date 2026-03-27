import type { BudgetLine, Transaction, Vendor } from "@/lib/supabaseTypes";
import type { PaymentMethod } from "@/lib/fileUtils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL, formatPtBrDecimal, parsePtBrMoneyToNumber } from "@/lib/money";
import { VendorCombobox } from "@/components/execucao/VendorCombobox";
import { FileUp, Pencil, X } from "lucide-react";

interface TransactionFormCardProps {
  monthTotal: number;
  editing: Transaction | null;
  linesForSelect: Array<Pick<BudgetLine, "id" | "code" | "name" | "is_subtotal">>;
  editingLineId: string;
  onEditingLineIdChange: (v: string) => void;
  editingMonthIndex: number;
  onEditingMonthIndexChange: (v: number) => void;
  monthsCount: number;
  vendor: Vendor | null;
  onVendorChange: (v: Vendor | null) => void;
  paymentMethod: PaymentMethod | "";
  onPaymentMethodChange: (v: PaymentMethod | "") => void;
  documentNumber: string;
  onDocumentNumberChange: (v: string) => void;
  dueDate: string;
  onDueDateChange: (v: string) => void;
  paidDate: string;
  onPaidDateChange: (v: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  onAmountBlur: () => void;
  notes: string;
  onNotesChange: (v: string) => void;
  files: File[];
  onFilesChange: (updater: (curr: File[]) => File[]) => void;
  onFileInputChange: (files: FileList | null) => void;
  onCancelEdit: () => void;
  onSave: () => void;
  isSaving: boolean;
  currentMonthIndex: number;
  lineId: string | undefined;
}

export function TransactionFormCard({
  monthTotal,
  editing,
  linesForSelect,
  editingLineId,
  onEditingLineIdChange,
  editingMonthIndex,
  onEditingMonthIndexChange,
  monthsCount,
  vendor,
  onVendorChange,
  paymentMethod,
  onPaymentMethodChange,
  documentNumber,
  onDocumentNumberChange,
  dueDate,
  onDueDateChange,
  paidDate,
  onPaidDateChange,
  amount,
  onAmountChange,
  onAmountBlur,
  notes,
  onNotesChange,
  files,
  onFilesChange,
  onFileInputChange,
  onCancelEdit,
  onSave,
  isSaving,
  currentMonthIndex,
  lineId,
}: TransactionFormCardProps) {
  const canEdit = editing != null;

  return (
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
            <Button type="button" variant="outline" className="mt-2 h-8 rounded-full" onClick={onCancelEdit}>
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
              <Select value={editingLineId} onValueChange={onEditingLineIdChange}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {linesForSelect
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
              <Select value={String(editingMonthIndex)} onValueChange={(v) => onEditingMonthIndexChange(Number(v))}>
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
          <VendorCombobox value={vendor} onChange={onVendorChange} />
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Forma de pagamento</div>
          <Select value={paymentMethod} onValueChange={(v) => onPaymentMethodChange(v as any)}>
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
          <Input value={documentNumber} onChange={(e) => onDocumentNumberChange(e.target.value)} className="rounded-2xl" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Data de vencimento</div>
            <Input type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} className="rounded-2xl" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Data de pagamento</div>
            <Input type="date" value={paidDate} onChange={(e) => onPaidDateChange(e.target.value)} className="rounded-2xl" />
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Valor</div>
          <Input
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            onBlur={onAmountBlur}
            className="rounded-2xl"
            inputMode="decimal"
            placeholder="Ex: 100,20"
          />
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Observações</div>
          <Textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} className="rounded-2xl" />
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Anexos (PDF ou imagem)</div>
          <div className="grid gap-2">
            <Input
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="rounded-2xl"
              onChange={(e) => {
                onFileInputChange(e.target.files);
                e.currentTarget.value = "";
              }}
            />

            {files.length ? (
              <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-3">
                <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Arquivos selecionados</div>
                <div className="mt-2 grid gap-2">
                  {files.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-sm font-medium text-[hsl(var(--ink))]">{f.name}</div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-full"
                        onClick={() => onFilesChange((curr) => curr.filter((_, i) => i !== idx))}
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-[hsl(var(--muted-ink))]">
                  Imagens serão convertidas para PDF em baixa resolução automaticamente.
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {!canEdit ? (
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
          >
            <FileUp className="mr-2 h-4 w-4" />
            Salvar lançamento
          </Button>
        ) : (
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
          >
            <Pencil className="mr-2 h-4 w-4" />
            Salvar alterações
          </Button>
        )}
      </div>
    </Card>
  );
}
