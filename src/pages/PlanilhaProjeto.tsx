import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/appStore";
import type { Budget, BudgetCategory, BudgetLine, Project } from "@/lib/supabaseTypes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL, parsePtBrMoneyToNumber } from "@/lib/money";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

function clampInt(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function buildMonthLabels(monthsCount: number) {
  return Array.from({ length: monthsCount }, (_, i) => ({
    idx: i + 1,
    label: `Mês ${i + 1}`,
  }));
}

function monthlyValue(total: number, durationMonths: number) {
  const d = Math.max(1, durationMonths);
  return total / d;
}

function calcMonthAmount(line: BudgetLine, monthIndex1: number) {
  const start = Number(line.start_month ?? 1);
  const dur = Number(line.duration_months ?? 1);
  const end = start + dur - 1;
  if (monthIndex1 < start || monthIndex1 > end) return 0;
  const total = Number(line.total_approved ?? 0);
  return monthlyValue(total, dur);
}

export default function PlanilhaProjeto() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const projectQuery = useQuery({
    queryKey: ["project", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", activeProjectId)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return data as Project;
    },
  });

  const ensureBudgetMutation = useMutation({
    mutationFn: async () => {
      if (!activeProjectId) throw new Error("Selecione um projeto");

      const { data: existing, error: eErr } = await supabase
        .from("budgets")
        .select("*")
        .eq("project_id", activeProjectId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (eErr) throw eErr;
      const last = (existing?.[0] as Budget | undefined) ?? null;
      if (last) return last;

      const months = Number((projectQuery.data as any)?.duration_months ?? 12);

      const { data, error } = await supabase
        .from("budgets")
        .insert({
          project_id: activeProjectId,
          name: "Planilha orçamentária",
          months_count: clampInt(months, 1, 60),
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as Budget;
    },
    onSuccess: (b) => {
      queryClient.invalidateQueries({ queryKey: ["budget", activeProjectId] });
      toast.success("Planilha pronta");
      return b;
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao criar planilha"),
  });

  const budgetQuery = useQuery({
    queryKey: ["budget", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("project_id", activeProjectId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as Budget | undefined) ?? null;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["planilhaCats", budgetQuery.data?.id],
    enabled: Boolean(budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_categories")
        .select("*")
        .eq("budget_id", budgetQuery.data!.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BudgetCategory[];
    },
  });

  const linesQuery = useQuery({
    queryKey: ["planilhaLines", budgetQuery.data?.id],
    enabled: Boolean(budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_lines")
        .select("*")
        .eq("budget_id", budgetQuery.data!.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BudgetLine[];
    },
  });

  const monthsCount = budgetQuery.data?.months_count ?? Number((projectQuery.data as any)?.duration_months ?? 12) ?? 12;
  const monthCols = useMemo(() => buildMonthLabels(monthsCount), [monthsCount]);

  const [newItemName, setNewItemName] = useState("");

  useEffect(() => {
    // Quando abrir a página, se ainda não existe budget, cria.
    if (!activeProjectId) return;
    if (budgetQuery.isLoading) return;
    if (!budgetQuery.data) ensureBudgetMutation.mutate();
  }, [activeProjectId, budgetQuery.isLoading, budgetQuery.data]);

  const addItem = useMutation({
    mutationFn: async () => {
      if (!budgetQuery.data?.id) throw new Error("Planilha não carregada");
      const name = newItemName.trim();
      if (!name) throw new Error("Informe o nome do item");

      const sortOrder = (categoriesQuery.data?.length ?? 0) + 1;
      const { data, error } = await supabase
        .from("budget_categories")
        .insert({
          budget_id: budgetQuery.data.id,
          name,
          sort_order: sortOrder,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as BudgetCategory;
    },
    onSuccess: () => {
      setNewItemName("");
      queryClient.invalidateQueries({ queryKey: ["planilhaCats", budgetQuery.data?.id] });
      toast.success("Item adicionado");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao adicionar"),
  });

  const addSubitem = useMutation({
    mutationFn: async (categoryId: string) => {
      if (!budgetQuery.data?.id) throw new Error("Planilha não carregada");

      const sortOrder = (linesQuery.data?.length ?? 0) + 1;
      const { data, error } = await supabase
        .from("budget_lines")
        .insert({
          budget_id: budgetQuery.data.id,
          category_id: categoryId,
          code: null,
          name: "Novo subitem",
          total_approved: 0,
          start_month: 1,
          duration_months: 1,
          is_subtotal: false,
          sort_order: sortOrder,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as BudgetLine;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planilhaLines", budgetQuery.data?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao adicionar subitem"),
  });

  const updateLine = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<BudgetLine> }) => {
      const { error } = await supabase
        .from("budget_lines")
        .update(payload.patch as any)
        .eq("id", payload.id);
      if (error) throw error;
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planilhaLines", budgetQuery.data?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  const deleteLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budget_lines").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planilhaLines", budgetQuery.data?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir"),
  });

  const itemTotals = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const l of linesQuery.data ?? []) {
      if (l.is_subtotal) continue;
      const cid = l.category_id ?? "";
      byCat.set(cid, (byCat.get(cid) ?? 0) + Number(l.total_approved ?? 0));
    }
    return byCat;
  }, [linesQuery.data]);

  const totalGeral = useMemo(() => {
    return (linesQuery.data ?? []).reduce(
      (acc, l) => acc + (l.is_subtotal ? 0 : Number(l.total_approved ?? 0)),
      0
    );
  }, [linesQuery.data]);

  const totalsByMonth = useMemo(() => {
    const totals = Array.from({ length: monthsCount }, () => 0);
    for (const l of linesQuery.data ?? []) {
      if (l.is_subtotal) continue;
      for (let m = 1; m <= monthsCount; m++) {
        totals[m - 1] += calcMonthAmount(l, m);
      }
    }
    return totals;
  }, [linesQuery.data, monthsCount]);

  if (!activeProjectId) {
    return (
      <div className="rounded-3xl border bg-white p-6">
        <div className="text-sm font-semibold text-[hsl(var(--ink))]">Selecione um projeto</div>
        <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
          Para montar a planilha, escolha um projeto.
        </p>
        <Button
          asChild
          className="mt-4 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
        >
          <Link to="/projects">Ir para Projetos</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => navigate("/projects")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              Planilha orçamentária
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              {projectQuery.data?.project_number ? `#${(projectQuery.data as any).project_number} · ` : ""}
              {projectQuery.data?.name} · {monthsCount} meses
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="h-10 w-56 rounded-full"
              placeholder="Novo item (ex: Pessoal)"
            />
            <Button
              onClick={() => addItem.mutate()}
              disabled={!newItemName.trim() || addItem.isPending}
              className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar item
            </Button>
          </div>
        </div>
      </div>

      <Card className="rounded-3xl border bg-white p-0 shadow-sm">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[110px]">Código</TableHead>
                <TableHead className="min-w-[320px]">Descrição</TableHead>
                <TableHead className="min-w-[160px] text-right">Valor total</TableHead>
                <TableHead className="min-w-[140px] text-right">Meses</TableHead>
                <TableHead className="min-w-[140px] text-right">Mês inicial</TableHead>
                {monthCols.map((m) => (
                  <TableHead key={m.idx} className="min-w-[120px] text-right">
                    {m.label}
                  </TableHead>
                ))}
                <TableHead className="min-w-[90px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(categoriesQuery.data ?? []).map((cat) => {
                const lines = (linesQuery.data ?? []).filter((l) => l.category_id === cat.id);
                const itemTotal = itemTotals.get(cat.id) ?? 0;

                return (
                  <>
                    <TableRow key={cat.id} className="bg-black/[0.03]">
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">{cat.sort_order}</TableCell>
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">
                        {cat.name}
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() => addSubitem.mutate(cat.id)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar subitem
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                        {formatBRL(itemTotal)}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      {monthCols.map((m) => (
                        <TableCell key={m.idx} />
                      ))}
                      <TableCell />
                    </TableRow>

                    {lines.map((l) => {
                      const dur = clampInt(Number(l.duration_months ?? 1), 1, monthsCount);
                      const start = clampInt(Number(l.start_month ?? 1), 1, monthsCount);
                      const invalid = start + dur - 1 > monthsCount;

                      return (
                        <TableRow key={l.id}>
                          <TableCell className="text-sm text-[hsl(var(--muted-ink))]">
                            <Input
                              value={l.code ?? ""}
                              onChange={(e) => updateLine.mutate({ id: l.id, patch: { code: e.target.value } })}
                              className="h-9 w-24 rounded-full"
                              placeholder="1.1"
                            />
                          </TableCell>

                          <TableCell>
                            <Input
                              value={l.name}
                              onChange={(e) => updateLine.mutate({ id: l.id, patch: { name: e.target.value } })}
                              className="h-9 rounded-full"
                              placeholder="Ex: Coordenador Geral"
                            />
                          </TableCell>

                          <TableCell className="text-right">
                            <Input
                              value={String(l.total_approved ?? 0).replace(".", ",")}
                              onChange={(e) =>
                                updateLine.mutate({
                                  id: l.id,
                                  patch: { total_approved: parsePtBrMoneyToNumber(e.target.value) } as any,
                                })
                              }
                              className="h-9 rounded-full text-right"
                              inputMode="decimal"
                            />
                          </TableCell>

                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={1}
                              max={monthsCount}
                              value={dur}
                              onChange={(e) => {
                                const nextDur = clampInt(Number(e.target.value), 1, monthsCount);
                                updateLine.mutate({ id: l.id, patch: { duration_months: nextDur } as any });
                              }}
                              className="h-9 w-24 rounded-full text-right"
                            />
                          </TableCell>

                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={1}
                              max={monthsCount}
                              value={start}
                              onChange={(e) => {
                                const nextStart = clampInt(Number(e.target.value), 1, monthsCount);
                                updateLine.mutate({ id: l.id, patch: { start_month: nextStart } as any });
                              }}
                              className={cn(
                                "h-9 w-24 rounded-full text-right",
                                invalid ? "border-red-300" : ""
                              )}
                            />
                            {invalid && (
                              <div className="mt-1 text-[11px] text-red-600">
                                Ultrapassa o limite do projeto.
                              </div>
                            )}
                          </TableCell>

                          {monthCols.map((m) => {
                            const amt = calcMonthAmount(l, m.idx);
                            return (
                              <TableCell key={m.idx} className="text-right">
                                <span className={cn("text-sm", amt ? "font-semibold text-[hsl(var(--ink))]" : "text-[hsl(var(--muted-ink))]")}> 
                                  {formatBRL(amt)}
                                </span>
                              </TableCell>
                            );
                          })}

                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={() => deleteLine.mutate(l.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                );
              })}

              {!!(categoriesQuery.data ?? []).length && (
                <TableRow className="bg-[hsl(var(--app-bg))]">
                  <TableCell />
                  <TableCell className="font-semibold text-[hsl(var(--ink))]">TOTAL GERAL</TableCell>
                  <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">
                    {formatBRL(totalGeral)}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  {monthCols.map((m) => (
                    <TableCell key={m.idx} className="text-right font-semibold text-[hsl(var(--ink))]">
                      {formatBRL(totalsByMonth[m.idx - 1] ?? 0)}
                    </TableCell>
                  ))}
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="text-xs text-[hsl(var(--muted-ink))]">
        Regra: mês inicial + duração - 1 não pode ultrapassar {monthsCount}. O banco valida isso no salvamento.
      </div>
    </div>
  );
}
