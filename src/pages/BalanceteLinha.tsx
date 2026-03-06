import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/appStore";
import type { Budget, BudgetLine, Transaction } from "@/lib/supabaseTypes";
import { useSession } from "@/context/SessionContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, parsePtBrMoneyToNumber } from "@/lib/money";
import { toast } from "sonner";
import { ArrowLeft, PlusCircle } from "lucide-react";

function toMonthRef(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return first.toISOString().slice(0, 10);
}

export default function BalanceteLinha() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const activeBudgetId = useAppStore((s) => s.activeBudgetId);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [expenseType, setExpenseType] = useState<string>("");
  const [documentNumber, setDocumentNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const lineQuery = useQuery({
    queryKey: ["budgetLine", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("budget_lines").select("*").eq("id", id).single();
      if (error) throw error;
      return data as BudgetLine;
    },
  });

  const budgetQuery = useQuery({
    queryKey: ["budgetFromLine", lineQuery.data?.budget_id],
    enabled: Boolean(lineQuery.data?.budget_id),
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("*").eq("id", lineQuery.data!.budget_id).single();
      if (error) throw error;
      return data as Budget;
    },
  });

  const txQuery = useQuery({
    queryKey: ["lineTransactions", activeProjectId, lineQuery.data?.budget_id, id],
    enabled: Boolean(activeProjectId && lineQuery.data?.budget_id && id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("project_id", activeProjectId)
        .eq("budget_id", lineQuery.data!.budget_id)
        .eq("budget_line_id", id)
        .is("deleted_at", null)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });

  const totals = useMemo(() => {
    const approved = Number(lineQuery.data?.total_approved ?? 0);
    const executed = (txQuery.data ?? []).reduce((acc, t) => acc + Number(t.amount ?? 0), 0);
    const remaining = approved - executed;
    const pct = approved > 0 ? (executed / approved) * 100 : 0;
    return { approved, executed, remaining, pct };
  }, [lineQuery.data, txQuery.data]);

  const createTx = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error("Sem sessão");
      if (!activeProjectId) throw new Error("Selecione um projeto");
      if (!id) throw new Error("Linha inválida");
      const line = lineQuery.data;
      if (!line) throw new Error("Carregando linha");
      if (line.is_subtotal) throw new Error("Subtotal não recebe lançamentos");

      const value = parsePtBrMoneyToNumber(amount);
      if (!value || value <= 0) throw new Error("Informe um valor válido");

      const month_ref = toMonthRef(date);

      // Soft rule: warn when exceeding
      const remaining = totals.remaining;
      const willOver = value > remaining;

      const { error } = await supabase.from("transactions").insert({
        project_id: activeProjectId,
        budget_id: line.budget_id,
        budget_line_id: id,
        date,
        month_ref,
        amount: value,
        description: description.trim() ? description.trim() : null,
        expense_type: expenseType.trim() ? expenseType.trim() : null,
        document_number: documentNumber.trim() ? documentNumber.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
        created_by_user_id: session.user.id,
      });
      if (error) throw error;

      return { willOver };
    },
    onSuccess: ({ willOver }) => {
      toast.success(willOver ? "Lançamento salvo (acima do saldo)" : "Lançamento salvo");
      setAmount("");
      setDescription("");
      setExpenseType("");
      setDocumentNumber("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["lineTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactionsAgg"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardTotals"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar lançamento"),
  });

  const deleteTx = useMutation({
    mutationFn: async (txId: string) => {
      const { error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", txId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      queryClient.invalidateQueries({ queryKey: ["lineTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactionsAgg"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardTotals"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao remover"),
  });

  if (!activeProjectId) {
    return (
      <div className="rounded-3xl border bg-white p-6">
        <div className="text-sm font-semibold text-[hsl(var(--ink))]">Selecione um projeto</div>
        <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">Você precisa selecionar um projeto para lançar despesas.</p>
        <Button onClick={() => navigate("/projects")} className="mt-4 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]">Ir para Projetos</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <Button variant="outline" className="rounded-full" onClick={() => navigate("/balancete")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              {lineQuery.data?.name ?? "Rubrica"}
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Aprovado {formatBRL(totals.approved)} · Executado {formatBRL(totals.executed)} · Saldo {formatBRL(totals.remaining)} · {totals.pct.toFixed(1)}%
            </p>
            {activeBudgetId && budgetQuery.data?.id !== activeBudgetId && (
              <p className="mt-2 text-xs text-[hsl(var(--muted-ink))]">
                Observação: esta linha pertence a outro orçamento. (Tudo bem no MVP.)
              </p>
            )}
          </div>
        </div>
      </div>

      <Card className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[hsl(var(--ink))]">Novo lançamento</div>
            <div className="text-xs text-[hsl(var(--muted-ink))]">O débito é automático pela soma dos lançamentos.</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Data</div>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-2xl" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Valor</div>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-2xl" placeholder="Ex: 10.000,00" />
            {amount && parsePtBrMoneyToNumber(amount) > totals.remaining && (
              <div className="mt-1 text-xs text-red-600">Atenção: valor acima do saldo da rubrica.</div>
            )}
          </div>
          <div className="md:col-span-2">
            <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Descrição</div>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-2xl" placeholder="Ex: Pagamento coordenador (Jan)" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Tipo</div>
            <Input value={expenseType} onChange={(e) => setExpenseType(e.target.value)} className="rounded-2xl" placeholder="Ex: Folha / NF / Recibo" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Nº documento</div>
            <Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} className="rounded-2xl" placeholder="Ex: NF 1234" />
          </div>
          <div className="md:col-span-2">
            <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Observações</div>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-2xl" />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => createTx.mutate()}
            disabled={createTx.isPending}
            className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Salvar lançamento
          </Button>
        </div>
      </Card>

      <Card className="rounded-3xl border bg-white p-0 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <div>
            <div className="text-sm font-semibold text-[hsl(var(--ink))]">Histórico</div>
            <div className="text-xs text-[hsl(var(--muted-ink))]">Últimos lançamentos desta rubrica.</div>
          </div>
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Mês ref.</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(txQuery.data ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm text-[hsl(var(--muted-ink))]">{t.date}</TableCell>
                  <TableCell className="text-sm text-[hsl(var(--muted-ink))]">{t.month_ref}</TableCell>
                  <TableCell className="text-sm font-medium text-[hsl(var(--ink))]">{t.description ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(Number(t.amount))}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => deleteTx.mutate(t.id)}>
                      Excluir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!(txQuery.data ?? []).length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-[hsl(var(--muted-ink))]">
                    Nenhum lançamento ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
