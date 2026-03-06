import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/appStore";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/SessionContext";
import { parseBudgetFile, type ParsedBudget } from "@/lib/budgetParser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { toast } from "sonner";
import { FileUp, Wand2 } from "lucide-react";

export default function ImportBudget() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveBudgetId = useAppStore((s) => s.setActiveBudgetId);

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedBudget | null>(null);
  const [monthsCount, setMonthsCount] = useState<number>(12);
  const [budgetName, setBudgetName] = useState<string>("Orçamento");

  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um arquivo");
      const result = await parseBudgetFile(file);
      return result;
    },
    onSuccess: (res) => {
      setParsed(res);
      setMonthsCount(res.monthsCount || 12);
      toast.success("Arquivo interpretado. Revise e confirme.");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao ler arquivo"),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!activeProjectId) throw new Error("Selecione um projeto");
      if (!session?.user?.id) throw new Error("Sem sessão");
      if (!parsed) throw new Error("Faça a leitura primeiro");

      // Create budget
      const { data: budget, error: bErr } = await supabase
        .from("budgets")
        .insert({
          project_id: activeProjectId,
          name: budgetName.trim() || "Orçamento",
          months_count: Math.max(1, Math.min(60, monthsCount)),
        })
        .select("*")
        .single();
      if (bErr) throw bErr;

      // Create categories
      const categories = parsed.categories.filter((c) => c.key !== "geral");
      const { data: catRows, error: cErr } = await supabase
        .from("budget_categories")
        .insert(
          categories.map((c, i) => ({
            budget_id: budget.id,
            name: c.name,
            sort_order: i,
          }))
        )
        .select("*");
      if (cErr) throw cErr;

      const catByKey = new Map<string, string>();
      (catRows ?? []).forEach((c: any) => {
        const key = parsed.categories.find((cc) => cc.name === c.name)?.key;
        if (key) catByKey.set(key, c.id);
      });

      // Insert lines
      const { error: lErr } = await supabase.from("budget_lines").insert(
        parsed.lines.map((l, i) => ({
          budget_id: budget.id,
          category_id: l.categoryKey === "geral" ? null : catByKey.get(l.categoryKey) ?? null,
          name: l.name,
          quantity: l.quantity ?? null,
          unit_value: l.unitValue ?? null,
          total_approved: l.totalApproved,
          is_subtotal: Boolean(l.isSubtotal),
          sort_order: i,
        }))
      );
      if (lErr) throw lErr;

      // Save an imports record (lightweight MVP)
      await supabase.from("imports").insert({
        project_id: activeProjectId,
        status: "confirmed",
        file_name: file.name,
        file_type: file.type || "unknown",
        parsed_budget_json: parsed,
        created_by_user_id: session.user.id,
      });

      return budget.id as string;
    },
    onSuccess: async (budgetId) => {
      toast.success("Orçamento importado");
      setActiveBudgetId(budgetId);
      queryClient.invalidateQueries({ queryKey: ["activeBudget", activeProjectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboardTotals", activeProjectId, budgetId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao confirmar"),
  });

  const previewRows = useMemo(() => parsed?.lines.slice(0, 30) ?? [], [parsed]);
  const totalApproved = useMemo(() => (parsed?.lines ?? []).reduce((acc, l) => acc + (l.isSubtotal ? 0 : l.totalApproved), 0), [parsed]);

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-medium text-[hsl(var(--brand))]">
              <FileUp className="h-3.5 w-3.5" />
              Importar orçamento
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">Planilha → Balancete</h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              MVP: Excel/CSV. O sistema interpreta categorias e rubricas e cria o orçamento.
            </p>
          </div>
        </div>
      </div>

      {!activeProjectId ? (
        <div className="rounded-3xl border bg-white p-6 text-sm text-[hsl(var(--muted-ink))]">
          Selecione um projeto antes de importar.
        </div>
      ) : (
        <Card className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Arquivo (CSV/XLSX)</div>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="mt-1 rounded-2xl"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="mt-2 text-xs text-[hsl(var(--muted-ink))]">
                Dica: tenha uma coluna de “Item/Rubrica” e uma de “Subtotal total/Total”.
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Nome do orçamento</div>
              <Input value={budgetName} onChange={(e) => setBudgetName(e.target.value)} className="mt-1 rounded-2xl" />

              <div className="mt-3 text-xs font-medium text-[hsl(var(--muted-ink))]">Quantidade de meses</div>
              <Input
                value={monthsCount}
                type="number"
                min={1}
                max={60}
                onChange={(e) => setMonthsCount(Number(e.target.value))}
                className="mt-1 rounded-2xl"
              />

              <div className="mt-4 flex gap-2">
                <Button
                  onClick={() => parseMutation.mutate()}
                  disabled={!file || parseMutation.isPending}
                  className="flex-1 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Ler
                </Button>
                <Button
                  onClick={() => confirmMutation.mutate()}
                  disabled={!parsed || confirmMutation.isPending}
                  variant="outline"
                  className="flex-1 rounded-full"
                >
                  Confirmar
                </Button>
              </div>
            </div>
          </div>

          {parsed && (
            <div className="mt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--ink))]">Prévia</div>
                  <div className="text-xs text-[hsl(var(--muted-ink))]">
                    Mostrando até 30 linhas (você poderá refinar na próxima etapa).
                  </div>
                </div>
                <div className="text-sm font-semibold text-[hsl(var(--ink))]">Total importado: {formatBRL(totalApproved)}</div>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Rubrica</TableHead>
                      <TableHead className="text-right">Aprovado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((r, idx) => (
                      <TableRow key={idx} className={r.isSubtotal ? "bg-black/[0.03]" : ""}>
                        <TableCell className="text-sm text-[hsl(var(--muted-ink))]">
                          {(parsed.categories.find((c) => c.key === r.categoryKey)?.name ?? "Geral")}
                        </TableCell>
                        <TableCell className="font-medium text-[hsl(var(--ink))]">{r.name}</TableCell>
                        <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(r.totalApproved)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
