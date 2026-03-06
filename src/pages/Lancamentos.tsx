import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/appStore";
import type { Transaction } from "@/lib/supabaseTypes";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

function toMonthRef(month: string) {
  // HTML month input: YYYY-MM
  if (!month) return null;
  return `${month}-01`;
}

export default function Lancamentos() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const activeBudgetId = useAppStore((s) => s.activeBudgetId);
  const [month, setMonth] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const txQuery = useQuery({
    queryKey: ["transactions", activeProjectId, activeBudgetId, month],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("*")
        .eq("project_id", activeProjectId!)
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .limit(200);

      if (activeBudgetId) query = query.eq("budget_id", activeBudgetId);

      const monthRef = toMonthRef(month);
      if (monthRef) query = query.eq("month_ref", monthRef);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return txQuery.data ?? [];
    return (txQuery.data ?? []).filter((t) => {
      const hay = `${t.description ?? ""} ${t.expense_type ?? ""} ${t.document_number ?? ""} ${t.notes ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [txQuery.data, q]);

  const total = useMemo(() => rows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0), [rows]);

  if (!activeProjectId) {
    return (
      <div className="rounded-3xl border bg-white p-6">
        <div className="text-sm font-semibold text-[hsl(var(--ink))]">Selecione um projeto</div>
        <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">Você precisa selecionar um projeto para ver lançamentos.</p>
        <Button asChild className="mt-4 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]">
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
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-medium text-[hsl(var(--brand))]">
              <Receipt className="h-3.5 w-3.5" />
              Lançamentos
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">Histórico do projeto</h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Total filtrado: <span className="font-semibold text-[hsl(var(--ink))]">{formatBRL(total)}</span>
            </p>
          </div>

          <div className="grid w-full gap-2 md:w-auto md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Mês de referência</div>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-full" />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Buscar</div>
              <Input value={q} onChange={(e) => setQ(e.target.value)} className="rounded-full" placeholder="Descrição, tipo, doc…" />
            </div>
          </div>
        </div>
      </div>

      <Card className="rounded-3xl border bg-white p-0 shadow-sm">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Mês ref.</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm text-[hsl(var(--muted-ink))]">{t.date}</TableCell>
                  <TableCell className="text-sm text-[hsl(var(--muted-ink))]">{t.month_ref}</TableCell>
                  <TableCell className="text-sm font-medium text-[hsl(var(--ink))]">{t.description ?? "—"}</TableCell>
                  <TableCell className="text-sm text-[hsl(var(--muted-ink))]">{t.expense_type ?? "—"}</TableCell>
                  <TableCell className="text-sm text-[hsl(var(--muted-ink))]">{t.document_number ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-[hsl(var(--ink))]">{formatBRL(Number(t.amount))}</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-[hsl(var(--muted-ink))]">
                    Nenhum lançamento encontrado.
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
