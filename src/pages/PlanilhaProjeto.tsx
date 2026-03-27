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
import { formatBRL, formatPtBrDecimal, parsePtBrMoneyToNumber } from "@/lib/money";
import { calcMonthAmount, nextSubitemCode } from "@/lib/budgetUtils";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

      const months = Number(projectQuery.data?.duration_months ?? 12);

      const { data, error } = await supabase
        .from("budgets")
        .insert({
          project_id: activeProjectId,
          name: "Orçamento",
          months_count: clampInt(months, 1, 120),
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as Budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget", activeProjectId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao criar"),
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

  const syncBudgetMonths = useMutation({
    mutationFn: async (payload: { budgetId: string; months: number }) => {
      const { error } = await supabase
        .from("budgets")
        .update({ months_count: payload.months } as any)
        .eq("id", payload.budgetId);
      if (error) throw error;
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget", activeProjectId] });
    },
  });

  useEffect(() => {
    const months = clampInt(Number((projectQuery.data as any)?.duration_months ?? 12), 1, 120);
    const budgetMonths = Number(budgetQuery.data?.months_count ?? months);
    if (!budgetQuery.data?.id) return;
    if (budgetQuery.isLoading || projectQuery.isLoading) return;
    if (budgetMonths === months) return;

    syncBudgetMonths.mutate({ budgetId: budgetQuery.data.id, months });
  }, [budgetQuery.data?.id, budgetQuery.data?.months_count, budgetQuery.isLoading, projectQuery.data, projectQuery.isLoading]);

  const categoriesQuery = useQuery({
    queryKey: ["planilhaCats", budgetQuery.data?.id],
    enabled: Boolean(budgetQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_categories")
        .select("*")
        .eq("budget_id", budgetQuery.data!.id)
        .order("code", { ascending: true });
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

  const monthsCount = clampInt(
    Number((projectQuery.data as any)?.duration_months ?? budgetQuery.data?.months_count ?? 12),
    1,
    120
  );
  const monthCols = useMemo(() => buildMonthLabels(monthsCount), [monthsCount]);

  const [newItemCode, setNewItemCode] = useState<string>("");
  const [newItemName, setNewItemName] = useState<string>("");
  const [approvedDrafts, setApprovedDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!activeProjectId) return;
    if (budgetQuery.isLoading) return;
    if (!budgetQuery.data) ensureBudgetMutation.mutate();
  }, [activeProjectId, budgetQuery.isLoading, budgetQuery.data]);

  const addItem = useMutation({
    mutationFn: async () => {
      if (!budgetQuery.data?.id) throw new Error("Orçamento não carregado");
      const code = clampInt(Number(newItemCode), 1, 9999);
      const name = newItemName.trim();
      if (!Number.isFinite(code) || !name) throw new Error("Preencha código e descrição");

      const { data, error } = await supabase
        .from("budget_categories")
        .insert({
          budget_id: budgetQuery.data.id,
          code,
          name,
          sort_order: code,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as BudgetCategory;
    },
    onSuccess: () => {
      setNewItemCode("");
      setNewItemName("");
      queryClient.invalidateQueries({ queryKey: ["planilhaCats", budgetQuery.data?.id] });
      toast.success("Item criado");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao criar item"),
  });

  const updateCategory = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<BudgetCategory> & { code?: number } }) => {
      const { error } = await supabase.from("budget_categories").update(payload.patch as any).eq("id", payload.id);
      if (error) throw error;
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planilhaCats", budgetQuery.data?.id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar item"),
  });

  const updateCategoryCode = useMutation({
    mutationFn: async (payload: { categoryId: string; oldCode: number; newCode: number }) => {
      if (!budgetQuery.data?.id) throw new Error("Orçamento não carregado");

      const { data: lines, error: lErr } = await supabase
        .from("budget_lines")
        .select("id,code")
        .eq("budget_id", budgetQuery.data.id)
        .eq("category_id", payload.categoryId);
      if (lErr) throw lErr;

      const prefixOld = `${payload.oldCode}.`;
      const prefixNew = `${payload.newCode}.`;

      const updates = (lines ?? []).map((l) => {
        const c = String(l.code ?? "");
        const next = c.startsWith(prefixOld) ? `${prefixNew}${c.slice(prefixOld.length)}` : c;
        return { id: String(l.id), code: next };
      });

      for (const u of updates) {
        const { error } = await supabase.from("budget_lines").update({ code: u.code } as any).eq("id", u.id);
        if (error) throw error;
      }

      const { error: cErr } = await supabase
        .from("budget_categories")
        .update({ code: payload.newCode, sort_order: payload.newCode } as any)
        .eq("id", payload.categoryId);
      if (cErr) throw cErr;

      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planilhaCats", budgetQuery.data?.id] });
      queryClient.invalidateQueries({ queryKey: ["planilhaLines", budgetQuery.data?.id] });
      toast.success("Código do item atualizado");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar código"),
  });

  const deleteCategory = useMutation({
    mutationFn: async (categoryId: string) => {
      if (!budgetQuery.data?.id) throw new Error("Orçamento não carregado");

      const { data: lines, error: lErr } = await supabase
        .from("budget_lines")
        .select("id")
        .eq("budget_id", budgetQuery.data.id)
        .eq("category_id", categoryId);
      if (lErr) throw lErr;

      const lineIds = (lines ?? []).map((l) => String(l.id));
      if (lineIds.length) {
        const { count, error: tErr } = await supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .in("budget_line_id", lineIds)
          .is("deleted_at", null);
        if (tErr) throw tErr;
        if ((count ?? 0) > 0) {
          throw new Error("Este item possui lançamentos na Execução. Não é possível excluir.");
        }

        const { error: delLinesErr } = await supabase.from("budget_lines").delete().eq("category_id", categoryId);
        if (delLinesErr) throw delLinesErr;
      }

      const { error } = await supabase.from("budget_categories").delete().eq("id", categoryId);
      if (error) throw error;
      return categoryId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planilhaCats", budgetQuery.data?.id] });
      queryClient.invalidateQueries({ queryKey: ["planilhaLines", budgetQuery.data?.id] });
      toast.success("Item excluído");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao excluir item"),
  });

  const addSubitem = useMutation({
    mutationFn: async (categoryId: string) => {
      if (!budgetQuery.data?.id) throw new Error("Orçamento não carregado");

      const cat = (categoriesQuery.data ?? []).find((c) => c.id === categoryId);
      if (!cat) throw new Error("Item inválido");

      const existingCodes = (linesQuery.data ?? [])
        .filter((l) => l.category_id === categoryId)
        .map((l) => l.code);

      const code = nextSubitemCode(Number(cat.code), existingCodes);

      const sortOrder = (linesQuery.data?.length ?? 0) + 1;
      const { data, error } = await supabase
        .from("budget_lines")
        .insert({
          budget_id: budgetQuery.data.id,
          category_id: categoryId,
          code,
          name: "",
          total_approved: 0,
          start_month: 1,
          end_month: 1,
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
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao adicionar subitem"),
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
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
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
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao excluir"),
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
      <BalanceteTabs />

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
              Balancete PRO
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              {projectQuery.data?.project_number
                ? `#${(projectQuery.data as any).project_number} · `
                : ""}
              {projectQuery.data?.name} · {monthsCount} meses
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Código do item</div>
              <Input
                value={newItemCode}
                onChange={(e) => setNewItemCode(e.target.value)}
                className="h-10 w-28 rounded-full"
                inputMode="numeric"
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Descrição do item</div>
              <Input
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="h-10 w-64 rounded-full"
              />
            </div>
            <Button
              onClick={() => addItem.mutate()}
              disabled={!newItemCode.trim() || !newItemName.trim() || addItem.isPending}
              className="h-10 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Criar Item
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
                <TableHead className="min-w-[140px] text-right">Mês inicial</TableHead>
                <TableHead className="min-w-[140px] text-right">Mês final</TableHead>
                {monthCols.map((m) => (
                  <TableHead key={m.idx} className="min-w-[120px] text-right">
                    {m.label}
                  </TableHead>
                ))}
                <TableHead className="min-w-[90px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(categoriesQuery.data ?? []).map((cat: any) => {
                const lines = (linesQuery.data ?? []).filter((l) => l.category_id === cat.id);
                const itemTotal = itemTotals.get(cat.id) ?? 0;

                return (
                  <>
                    <TableRow key={cat.id} className="bg-black/[0.03]">
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">
                        <Input
                          defaultValue={String(cat.code ?? "")}
                          className="h-9 w-24 rounded-full bg-white text-right"
                          inputMode="numeric"
                          onBlur={(e) => {
                            const next = clampInt(Number(e.target.value), 1, 9999);
                            const old = Number(cat.code);
                            if (!Number.isFinite(next) || next === old) return;
                            updateCategoryCode.mutate({ categoryId: cat.id, oldCode: old, newCode: next });
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-semibold text-[hsl(var(--ink))]">
                        <Input
                          defaultValue={String(cat.name ?? "")}
                          className="h-9 rounded-full bg-white"
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            const old = String(cat.name ?? "").trim();
                            if (!next || next === old) return;
                            updateCategory.mutate({ id: cat.id, patch: { name: next } as any });
                          }}
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() => addSubitem.mutate(cat.id)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar Subitem
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
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="rounded-full">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-3xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir item {cat.code}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Isso removerá todos os subitens deste item. Se já houver lançamentos na Execução, a exclusão será bloqueada.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-full bg-red-600 text-white hover:bg-red-700"
                                onClick={() => deleteCategory.mutate(cat.id)}
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>

                    {lines.map((l, lineIdx) => {
                      const start = clampInt(Number(l.start_month ?? 1), 1, monthsCount);
                      const end = clampInt(Number((l as BudgetLine).end_month ?? start), 1, monthsCount);
                      const invalid = end < start || end > monthsCount;

                      return (
                        <TableRow key={l.id} className={lineIdx % 2 === 1 ? "!bg-blue-100" : ""}>
                          <TableCell className="text-sm font-semibold text-[hsl(var(--ink))]">
                            {l.code || ""}
                          </TableCell>

                          <TableCell>
                            <Input
                              value={l.name}
                              onChange={(e) =>
                                updateLine.mutate({ id: l.id, patch: { name: e.target.value } })
                              }
                              className="h-9 rounded-full"
                            />
                          </TableCell>

                          <TableCell className="text-right">
                            <Input
                              value={approvedDrafts[l.id] ?? formatPtBrDecimal(Number(l.total_approved ?? 0))}
                              onChange={(e) =>
                                setApprovedDrafts((curr) => ({ ...curr, [l.id]: e.target.value }))
                              }
                              onBlur={(e) => {
                                const parsed = parsePtBrMoneyToNumber(e.target.value);
                                const current = Number(l.total_approved ?? 0);

                                setApprovedDrafts((curr) => {
                                  const next = { ...curr };
                                  delete next[l.id];
                                  return next;
                                });

                                if (parsed !== current) {
                                  updateLine.mutate({
                                    id: l.id,
                                    patch: { total_approved: parsed } as any,
                                  });
                                }
                              }}
                              className="h-9 rounded-full text-right"
                              inputMode="decimal"
                              placeholder="Ex: 100,20"
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
                                const nextEnd = Math.max(nextStart, end);
                                updateLine.mutate({
                                  id: l.id,
                                  patch: { start_month: nextStart, end_month: nextEnd } as any,
                                });
                              }}
                              className={cn(
                                "h-9 w-24 rounded-full text-right",
                                invalid ? "border-red-300" : ""
                              )}
                            />
                          </TableCell>

                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={1}
                              max={monthsCount}
                              value={end}
                              onChange={(e) => {
                                const nextEnd = clampInt(Number(e.target.value), 1, monthsCount);
                                updateLine.mutate({
                                  id: l.id,
                                  patch: { end_month: nextEnd } as any,
                                });
                              }}
                              className={cn(
                                "h-9 w-24 rounded-full text-right",
                                invalid ? "border-red-300" : ""
                              )}
                            />
                          </TableCell>

                          {monthCols.map((m) => {
                            const amt = calcMonthAmount(l, m.idx);
                            return (
                              <TableCell key={m.idx} className="text-right">
                                <span
                                  className={cn(
                                    "text-sm",
                                    amt
                                      ? "font-semibold text-[hsl(var(--ink))]"
                                      : "text-[hsl(var(--muted-ink))]"
                                  )}
                                >
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

              <TableRow className="bg-[hsl(var(--app-bg))]">
                <TableCell />
                <TableCell className="font-semibold text-[hsl(var(--ink))]">TOTAL</TableCell>
                <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(totalGeral)}</TableCell>
                <TableCell />
                <TableCell />
                {totalsByMonth.map((t, idx) => (
                  <TableCell key={idx} className="text-right font-semibold text-[hsl(var(--ink))]">
                    {formatBRL(t)}
                  </TableCell>
                ))}
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}