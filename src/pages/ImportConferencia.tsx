import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/appStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, parsePtBrMoneyToNumber } from "@/lib/money";
import { toast } from "sonner";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Trash2,
  TriangleAlert,
} from "lucide-react";

type ParsedBudgetJson = {
  categories?: { key: string; name: string }[];
  lines?: Array<{
    categoryKey?: string;
    name: string;
    totalApproved: number;
    quantity?: number | null;
    unitValue?: number | null;
    isSubtotal?: boolean;
  }>;
  detected?: { totalGeneral?: number };
};

type ReviewLine = {
  id: string;
  category: string;
  rubrica: string;
  valor_original: number;
  quantidade: number | null;
  valor_unitario: number | null;
};

function moneyInputToNumber(v: string) {
  return parsePtBrMoneyToNumber(v);
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function ImportConferencia() {
  const { id } = useParams();
  const importId = id ?? "";
  const validId = Boolean(importId && isUuid(importId));

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const importQuery = useQuery({
    queryKey: ["orcamentoImportado", importId],
    enabled: validId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orcamentos_importados")
        .select("*")
        .eq("id", importId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const parsed = useMemo<ParsedBudgetJson | null>(() => {
    const raw = importQuery.data?.parsed_budget_json;
    return raw ? (raw as ParsedBudgetJson) : null;
  }, [importQuery.data]);

  const initialLines = useMemo<ReviewLine[]>(() => {
    const cats = new Map<string, string>();
    (parsed?.categories ?? []).forEach((c) => cats.set(c.key, c.name));

    return (parsed?.lines ?? [])
      .filter((l) => !l.isSubtotal)
      .map((l, idx) => ({
        id: `${idx}-${l.name}`,
        category: l.categoryKey ? cats.get(l.categoryKey) ?? "" : "",
        rubrica: l.name,
        valor_original: Number(l.totalApproved ?? 0),
        quantidade: l.quantity ?? null,
        valor_unitario: l.unitValue ?? null,
      }));
  }, [parsed]);

  const [lines, setLines] = useState<ReviewLine[]>([]);

  useEffect(() => {
    if (!importQuery.data) return;
    setLines(initialLines);
  }, [importQuery.data, initialLines]);

  const totals = useMemo(() => {
    const total = lines.reduce((acc, l) => acc + Number(l.valor_original ?? 0), 0);
    const detected = Number(parsed?.detected?.totalGeneral ?? 0);
    return { total, detected };
  }, [lines, parsed]);

  const warnings = useMemo(() => {
    const w: Array<{ level: "info" | "warn"; text: string }> = [];

    const emptyValue = lines.filter((l) => !l.valor_original || l.valor_original <= 0)
      .length;
    if (emptyValue) {
      w.push({
        level: "warn",
        text: `${emptyValue} linha(s) sem valor original válido.`,
      });
    }

    const seen = new Map<string, number>();
    for (const l of lines) {
      const key = l.rubrica.trim().toLowerCase();
      if (!key) continue;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dup = Array.from(seen.values()).filter((c) => c > 1).length;
    if (dup) {
      w.push({ level: "warn", text: `${dup} rubrica(s) duplicada(s) (mesmo nome).` });
    }

    if (totals.detected > 0) {
      const diff = Math.abs(totals.total - totals.detected);
      if (diff > 0.01) {
        w.push({
          level: "warn",
          text: `Total calculado (${formatBRL(totals.total)}) difere do Total Geral detectado (${formatBRL(totals.detected)}).`,
        });
      }
    }

    return w;
  }, [lines, totals]);

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const path = (importQuery.data?.arquivo_path as string | null) ?? null;
      if (!path) throw new Error("Arquivo não disponível");
      const { data, error } = await supabase.storage
        .from("balancete")
        .createSignedUrl(path, 60);
      if (error) throw error;
      return data.signedUrl;
    },
    onSuccess: (url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao gerar link"),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!validId) throw new Error("Importação inválida");
      if (!activeProjectId) throw new Error("Selecione um projeto");
      if (importQuery.data?.projeto_id !== activeProjectId) {
        throw new Error("Esta importação pertence a outro projeto");
      }

      const cleaned = lines
        .map((l, ordem) => ({
          ...l,
          ordem,
          rubrica: l.rubrica.trim(),
          category: l.category.trim(),
          valor_original: Number(l.valor_original ?? 0),
        }))
        .filter((l) => l.rubrica && l.valor_original > 0);

      if (!cleaned.length) throw new Error("Nenhuma rubrica válida para confirmar");

      const total = cleaned.reduce((acc, l) => acc + l.valor_original, 0);

      const { error: uErr } = await supabase
        .from("orcamentos_importados")
        .update({
          status_importacao: "confirmed",
          total_orcamento: total,
          parsed_budget_json: {
            ...((parsed ?? {}) as any),
            reviewed: true,
            reviewedAt: new Date().toISOString(),
          },
        })
        .eq("id", importId);
      if (uErr) throw uErr;

      const { error: dErr } = await supabase
        .from("rubricas_orcamento")
        .delete()
        .eq("orcamento_importado_id", importId);
      if (dErr) throw dErr;

      const { error: iErr } = await supabase.from("rubricas_orcamento").insert(
        cleaned.map((l) => ({
          projeto_id: activeProjectId,
          orcamento_importado_id: importId,
          codigo_rubrica: null,
          rubrica: l.rubrica,
          descricao: null,
          categoria: l.category || null,
          unidade: null,
          quantidade: l.quantidade,
          valor_unitario: l.valor_unitario,
          valor_original: l.valor_original,
          valor_utilizado: 0,
          saldo_restante: l.valor_original,
          percentual_executado: 0,
          ordem: l.ordem,
        }))
      );
      if (iErr) throw iErr;

      return true;
    },
    onSuccess: () => {
      toast.success("Importação confirmada. Orçamento-base criado.");
      queryClient.invalidateQueries({ queryKey: ["orcamentosImportados"] });
      navigate("/balancete", { replace: true });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao confirmar"),
  });

  if (!validId) {
    return (
      <div className="grid gap-6">
        <BalanceteTabs />
        <div className="rounded-3xl border bg-white p-6">
          <div className="text-sm font-semibold text-[hsl(var(--ink))]">
            Link de conferência inválido
          </div>
          <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
            O identificador desta importação não parece válido. Volte e selecione a importação novamente.
          </p>
          <Button
            variant="outline"
            className="mt-4 rounded-full"
            onClick={() => navigate("/balancete/importar")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Importar
          </Button>
        </div>
      </div>
    );
  }

  if (!activeProjectId) {
    return (
      <div className="grid gap-6">
        <BalanceteTabs />
        <div className="rounded-3xl border bg-white p-6">
          <div className="text-sm font-semibold text-[hsl(var(--ink))]">
            Selecione um projeto
          </div>
          <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
            Para conferir uma importação, selecione um projeto.
          </p>
          <Button
            asChild
            className="mt-4 rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
          >
            <Link to="/projects">Ir para Projetos</Link>
          </Button>
        </div>
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
              onClick={() => navigate("/balancete/importar")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              Conferência da importação
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Ajuste rubricas e valores antes de confirmar o orçamento-base.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending || !importQuery.data?.arquivo_path}
            >
              <Download className="mr-2 h-4 w-4" />
              Baixar arquivo
            </Button>
            <Button
              className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
              onClick={() => confirmMutation.mutate()}
              disabled={
                confirmMutation.isPending ||
                importQuery.data?.status_importacao === "confirmed" ||
                !parsed
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirmar importação
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border bg-white p-5 shadow-sm md:col-span-2">
          {!parsed ? (
            <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4 text-sm text-[hsl(var(--muted-ink))]">
              Esta importação ainda não possui estrutura de rubricas (ex.: PDF/imagem).
              A próxima etapa vai incluir OCR/tabela e um modo de correção manual.
            </div>
          ) : (
            <div className="overflow-auto rounded-2xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Categoria</TableHead>
                    <TableHead className="min-w-[320px]">Rubrica</TableHead>
                    <TableHead className="min-w-[160px] text-right">Valor original</TableHead>
                    <TableHead className="min-w-[120px] text-right">Qtd</TableHead>
                    <TableHead className="min-w-[160px] text-right">Unitário</TableHead>
                    <TableHead className="min-w-[90px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, idx) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Input
                          value={l.category}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLines((curr) =>
                              curr.map((x, i) => (i === idx ? { ...x, category: v } : x))
                            );
                          }}
                          className="rounded-2xl"
                          placeholder="Ex: Folha / Divulgação"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.rubrica}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLines((curr) =>
                              curr.map((x, i) => (i === idx ? { ...x, rubrica: v } : x))
                            );
                          }}
                          className="rounded-2xl"
                          placeholder="Ex: Coordenador"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          value={String(l.valor_original).replace(".", ",")}
                          onChange={(e) => {
                            const n = moneyInputToNumber(e.target.value);
                            setLines((curr) =>
                              curr.map((x, i) => (i === idx ? { ...x, valor_original: n } : x))
                            );
                          }}
                          className="rounded-2xl text-right"
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          value={l.quantidade ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            const n = v.trim() ? Number(v.replace(",", ".")) : null;
                            setLines((curr) =>
                              curr.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      quantidade: Number.isFinite(n as any) ? n : null,
                                    }
                                  : x
                              )
                            );
                          }}
                          className="rounded-2xl text-right"
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          value={l.valor_unitario ?? ""}
                          onChange={(e) => {
                            const n = moneyInputToNumber(e.target.value);
                            setLines((curr) =>
                              curr.map((x, i) =>
                                i === idx ? { ...x, valor_unitario: n || null } : x
                              )
                            );
                          }}
                          className="rounded-2xl text-right"
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => setLines((curr) => curr.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {!lines.length && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-10 text-center text-sm text-[hsl(var(--muted-ink))]"
                      >
                        Nenhuma linha para conferir.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        <div className="grid gap-4">
          <Card className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total (calculado)</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              {formatBRL(totals.total)}
            </div>
            {totals.detected > 0 && (
              <div className="mt-2 text-xs text-[hsl(var(--muted-ink))]">
                Total Geral detectado no arquivo: {" "}
                <span className="font-medium text-[hsl(var(--ink))]">
                  {formatBRL(totals.detected)}
                </span>
              </div>
            )}
          </Card>

          <Card className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[hsl(var(--ink))]">Avisos</div>
              <TriangleAlert className="h-4 w-4 text-[hsl(var(--muted-ink))]" />
            </div>
            <div className="mt-3 grid gap-2">
              {!warnings.length ? (
                <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-3 text-sm text-[hsl(var(--muted-ink))]">
                  Nenhum aviso crítico.
                </div>
              ) : (
                warnings.map((w, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-2xl border p-3 text-sm",
                      w.level === "warn"
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-slate-200 bg-[hsl(var(--app-bg))] text-[hsl(var(--muted-ink))]"
                    )}
                  >
                    {w.text}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}