import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAppStore } from "@/lib/appStore";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/SessionContext";
import { parseBudgetFile, type ParsedBudget } from "@/lib/budgetParser";
import { extractPdfText } from "@/lib/pdfTextExtractor";
import { buildProjectStoragePath, safeFileExt } from "@/lib/fileUtils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { toast } from "sonner";
import { FileUp, Wand2 } from "lucide-react";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";

type ParseOutput =
  | { kind: "budget"; parsed: ParsedBudget }
  | { kind: "pdf"; text: string }
  | { kind: "image"; note: string };

export default function ImportBudget() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveBudgetId = useAppStore((s) => s.setActiveBudgetId);

  const [file, setFile] = useState<File | null>(null);
  const [parseOut, setParseOut] = useState<ParseOutput | null>(null);
  const [monthsCount, setMonthsCount] = useState<number>(12);
  const [budgetName, setBudgetName] = useState<string>("Orçamento");

  const importsQuery = useQuery({
    queryKey: ["orcamentosImportados", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orcamentos_importados")
        .select("id,nome_arquivo,status_importacao,created_at,total_orcamento")
        .eq("projeto_id", activeProjectId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um arquivo");
      const ext = safeFileExt(file.name);

      if (ext === "pdf") {
        const text = await extractPdfText(file);
        return { kind: "pdf", text } as const;
      }

      if (ext === "png" || ext === "jpg" || ext === "jpeg") {
        return {
          kind: "image",
          note: "Imagem detectada. A leitura inteligente via OCR entra na próxima etapa (Etapa 3).",
        } as const;
      }

      const parsed = await parseBudgetFile(file);
      return { kind: "budget", parsed } as const;
    },
    onSuccess: (res) => {
      setParseOut(res);
      if (res.kind === "budget") {
        setMonthsCount(res.parsed.monthsCount || 12);
        toast.success("Planilha interpretada. Revise e confirme.");
      } else if (res.kind === "pdf") {
        toast.success("PDF lido. Vamos usar isso como prévia e evoluir para extração de tabela/OCR.");
      } else {
        toast.message("Imagem recebida", { description: res.note });
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao ler arquivo"),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!activeProjectId) throw new Error("Selecione um projeto");
      if (!session?.user?.id) throw new Error("Sem sessão");
      if (!file) throw new Error("Selecione um arquivo");

      const ext = safeFileExt(file.name);
      const storagePath = buildProjectStoragePath(activeProjectId, file.name);

      const { error: upErr } = await supabase.storage
        .from("balancete")
        .upload(storagePath, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw upErr;

      // Cria importação em modo conferência
      const { data: oi, error: oiErr } = await supabase
        .from("orcamentos_importados")
        .insert({
          projeto_id: activeProjectId,
          nome_arquivo: file.name,
          tipo_arquivo: file.type || ext,
          arquivo_path: storagePath,
          arquivo_url: null,
          status_importacao: "review",
          extracted_raw_json:
            parseOut?.kind === "pdf"
              ? { kind: "pdf", text: parseOut.text.slice(0, 20000) }
              : parseOut?.kind === "image"
                ? { kind: "image" }
                : null,
          parsed_budget_json: parseOut?.kind === "budget" ? parseOut.parsed : null,
          erros_json: null,
        })
        .select("*")
        .single();
      if (oiErr) throw oiErr;

      if (parseOut?.kind === "budget") {
        const parsed = parseOut.parsed;

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

        setActiveBudgetId(budget.id);
        queryClient.invalidateQueries({ queryKey: ["activeBudget", activeProjectId] });
        queryClient.invalidateQueries({ queryKey: ["dashboardTotals", activeProjectId, budget.id] });
      }

      return oi.id as string;
    },
    onSuccess: (importId) => {
      toast.success("Arquivo enviado. Agora confira antes de confirmar.");
      queryClient.invalidateQueries({ queryKey: ["orcamentosImportados", activeProjectId] });
      window.location.assign(`/balancete/importar/${importId}`);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao enviar"),
  });

  const previewRows = useMemo(() => {
    if (parseOut?.kind !== "budget") return [];
    return parseOut.parsed.lines.slice(0, 30);
  }, [parseOut]);

  const totalApproved = useMemo(() => {
    if (parseOut?.kind !== "budget") return 0;
    return (parseOut.parsed.lines ?? []).reduce(
      (acc, l) => acc + (l.isSubtotal ? 0 : l.totalApproved),
      0
    );
  }, [parseOut]);

  return (
    <div className="grid gap-6">
      <BalanceteTabs />

      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-medium text-[hsl(var(--brand))]">
              <FileUp className="h-3.5 w-3.5" />
              Importar orçamento
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              Upload + prévia
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Próximo passo: conferência (corrigir rubricas/valores) antes de confirmar.
            </p>
          </div>
        </div>
      </div>

      {!!(importsQuery.data ?? []).length && (
        <Card className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-[hsl(var(--ink))]">Importações recentes</div>
          <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
            Clique em uma importação em modo conferência para revisar.
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(importsQuery.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium text-[hsl(var(--ink))]">{r.nome_arquivo ?? "—"}</TableCell>
                    <TableCell className="text-sm text-[hsl(var(--muted-ink))]">{r.status_importacao}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-[hsl(var(--ink))]">{formatBRL(Number(r.total_orcamento ?? 0))}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" className="rounded-full">
                        <Link to={`/balancete/importar/${r.id}`}>Conferir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {!activeProjectId ? (
        <div className="rounded-3xl border bg-white p-6 text-sm text-[hsl(var(--muted-ink))]">
          Selecione um projeto antes de importar.
        </div>
      ) : (
        <Card className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Arquivo (XLS/XLSX/CSV/PDF/Imagem)</div>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg"
                className="mt-1 rounded-2xl"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setParseOut(null);
                }}
              />
              <div className="mt-2 text-xs text-[hsl(var(--muted-ink))]">
                O arquivo será salvo no Storage como <span className="font-medium">{activeProjectId}/...</span>
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
                  disabled={!file || confirmMutation.isPending}
                  variant="outline"
                  className="flex-1 rounded-full"
                >
                  Enviar
                </Button>
              </div>
            </div>
          </div>

          {parseOut?.kind === "budget" && (
            <div className="mt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--ink))]">Prévia</div>
                  <div className="text-xs text-[hsl(var(--muted-ink))]">Mostrando até 30 linhas.</div>
                </div>
                <div className="text-sm font-semibold text-[hsl(var(--ink))]">Total: {formatBRL(totalApproved)}</div>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Rubrica</TableHead>
                      <TableHead className="text-right">Valor original</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((r, idx) => (
                      <TableRow key={idx} className={r.isSubtotal ? "bg-black/[0.03]" : ""}>
                        <TableCell className="text-sm text-[hsl(var(--muted-ink))]">
                          {parseOut.parsed.categories.find((c) => c.key === r.categoryKey)?.name ?? "Geral"}
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

          {parseOut?.kind === "pdf" && (
            <div className="mt-6 rounded-3xl border bg-[hsl(var(--app-bg))] p-5">
              <div className="text-sm font-semibold text-[hsl(var(--ink))]">Prévia do PDF (texto extraído)</div>
              <div className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-[hsl(var(--muted-ink))]">
                {parseOut.text || "(Sem texto detectável — provavelmente é PDF imagem)"}
              </div>
            </div>
          )}

          {parseOut?.kind === "image" && (
            <div className="mt-6 rounded-3xl border bg-[hsl(var(--app-bg))] p-5">
              <div className="text-sm font-semibold text-[hsl(var(--ink))]">Imagem recebida</div>
              <div className="mt-2 text-sm text-[hsl(var(--muted-ink))]">{parseOut.note}</div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}