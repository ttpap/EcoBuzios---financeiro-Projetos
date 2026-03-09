import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/appStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";
import { formatBRL, parsePtBrMoneyToNumber } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

type Node = {
  id: string;
  title: string;
  value: number; // próprio (se quiser usar em item também)
  children: Node[];
};

function newNode(title = ""):
  Node {
  return { id: nanoid(), title, value: 0, children: [] };
}

function moneyInputToNumber(v: string) {
  return parsePtBrMoneyToNumber(v);
}

function sumNode(node: Node): number {
  return Number(node.value || 0) + node.children.reduce((acc, c) => acc + sumNode(c), 0);
}

function computeCode(pathIdx: number[]) {
  return pathIdx.map((n) => String(n + 1)).join(".");
}

export default function MontarPlanilha() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const [titulo, setTitulo] = useState("Orçamento do projeto");
  const [projectName, setProjectName] = useState("");
  const [monthsCount, setMonthsCount] = useState<number>(12);
  const [items, setItems] = useState<Node[]>([newNode("Pessoal"), newNode("Produção")]);

  const flattened = useMemo(() => {
    const rows: Array<{
      node: Node;
      depth: number;
      pathIdx: number[];
      parentId: string | null;
      total: number;
    }> = [];

    const walk = (node: Node, depth: number, pathIdx: number[], parentId: string | null) => {
      rows.push({ node, depth, pathIdx, parentId, total: sumNode(node) });
      node.children.forEach((c, i) => walk(c, depth + 1, [...pathIdx, i], node.id));
    };

    items.forEach((n, i) => walk(n, 0, [i], null));
    return rows;
  }, [items]);

  const totalGeral = useMemo(() => {
    return items.reduce((acc, n) => acc + sumNode(n), 0);
  }, [items]);

  const createImportMutation = useMutation({
    mutationFn: async () => {
      if (!activeProjectId) throw new Error("Selecione um projeto");

      const categories = items.map((it, idx) => ({
        key: `item_${idx + 1}`,
        name: it.title.trim() || `Item ${idx + 1}`,
      }));

      const lines: any[] = [];
      const pushLeaves = (node: Node, topIdx: number, pathIdx: number[]) => {
        const code = computeCode(pathIdx);
        const hasChildren = node.children.length > 0;

        // Se não tem filhos, é uma rubrica “folha” (leaf)
        if (!hasChildren) {
          lines.push({
            categoryKey: categories[topIdx].key,
            code,
            name: node.title.trim() || `Rubrica ${code}`,
            totalApproved: Number(node.value || 0),
            quantity: null,
            unitValue: null,
            isSubtotal: false,
          });
          return;
        }

        // Se tem filhos, só desce. (mantemos os nós de grupo como estrutura visual, mas não vira rubrica)
        node.children.forEach((c, i) => pushLeaves(c, topIdx, [...pathIdx, i]));
      };

      items.forEach((top, i) => {
        top.children.forEach((c, j) => pushLeaves(c, i, [i, j]));

        // Se o item não tem filhos, vira uma rubrica leaf nele mesmo
        if (!top.children.length) {
          pushLeaves(top, i, [i]);
        }
      });

      if (!lines.length) throw new Error("Adicione pelo menos um subitem com valor");

      const payload = {
        titulo_planilha: titulo.trim() || "Orçamento",
        nome_projeto: projectName.trim() || null,
        meses_referencia: Math.max(1, Math.min(60, monthsCount)),
        itens: items,
        total_geral: totalGeral,
        // Formato já compatível com a tela de conferência atual
        categories,
        lines,
        detected: { totalGeneral: totalGeral },
      };

      const { data, error } = await supabase
        .from("orcamentos_importados")
        .insert({
          projeto_id: activeProjectId,
          nome_arquivo: "Montagem manual",
          tipo_arquivo: "manual",
          arquivo_path: null,
          arquivo_url: null,
          status_importacao: "review",
          total_orcamento: totalGeral,
          extracted_raw_json: { kind: "manual" },
          parsed_budget_json: payload,
          erros_json: null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (importId) => {
      toast.success("Planilha criada. Agora confira antes de confirmar.");
      queryClient.invalidateQueries({ queryKey: ["orcamentosImportados", activeProjectId] });
      navigate(`/balancete/importar/${importId}`);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao criar planilha"),
  });

  const updateNode = (id: string, fn: (n: Node) => Node) => {
    const rec = (nodes: Node[]): Node[] =>
      nodes.map((n) => {
        if (n.id === id) return fn(n);
        if (!n.children.length) return n;
        return { ...n, children: rec(n.children) };
      });

    setItems((curr) => rec(curr));
  };

  const deleteNode = (id: string) => {
    const rec = (nodes: Node[]): Node[] =>
      nodes
        .filter((n) => n.id !== id)
        .map((n) => ({ ...n, children: rec(n.children) }));
    setItems((curr) => rec(curr));
  };

  const addChild = (parentId: string) => {
    updateNode(parentId, (n) => ({
      ...n,
      children: [...n.children, newNode("")],
    }));
  };

  const addTopItem = () => setItems((curr) => [...curr, newNode("")]);

  if (!activeProjectId) {
    return (
      <div className="grid gap-6">
        <BalanceteTabs />
        <div className="rounded-3xl border bg-white p-6">
          <div className="text-sm font-semibold text-[hsl(var(--ink))]">Selecione um projeto</div>
          <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
            Para montar uma planilha, selecione um projeto primeiro.
          </p>
          <Button
            variant="outline"
            className="mt-4 rounded-full"
            onClick={() => navigate("/projects")}
          >
            Ir para Projetos
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
              Montar Planilha
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Crie a estrutura hierárquica e deixe o sistema calcular os totais.
            </p>
          </div>

          <Button
            onClick={() => createImportMutation.mutate()}
            disabled={createImportMutation.isPending}
            className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
          >
            Continuar para conferência
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border bg-white p-6 shadow-sm md:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Título</div>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="mt-1 rounded-2xl" />
            </div>
            <div>
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Projeto (identificação)</div>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Ex: ICMS 2026"
              />
            </div>
            <div>
              <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Quantidade de meses</div>
              <Input
                value={monthsCount}
                type="number"
                min={1}
                max={60}
                onChange={(e) => setMonthsCount(Number(e.target.value))}
                className="mt-1 rounded-2xl"
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full rounded-full" onClick={addTopItem}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar item
              </Button>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border">
            <div className="grid grid-cols-[110px_1fr_160px_110px] gap-0 bg-black/[0.03] px-4 py-3 text-xs font-medium text-[hsl(var(--muted-ink))]">
              <div>Código</div>
              <div>Título</div>
              <div className="text-right">Valor / Total</div>
              <div className="text-right">Ações</div>
            </div>

            <div className="divide-y">
              {flattened.map((r) => {
                const code = computeCode(r.pathIdx);
                const isLeaf = r.node.children.length === 0;
                return (
                  <div
                    key={r.node.id}
                    className={cn(
                      "grid grid-cols-[110px_1fr_160px_110px] gap-0 px-4 py-3",
                      r.depth === 0 ? "bg-white" : "bg-white"
                    )}
                  >
                    <div className="text-sm font-semibold text-[hsl(var(--ink))]">{code}</div>

                    <div className="min-w-0">
                      <div className={cn("flex items-center gap-2", r.depth ? "pl-4" : "pl-0")}>
                        <Input
                          value={r.node.title}
                          onChange={(e) =>
                            updateNode(r.node.id, (n) => ({ ...n, title: e.target.value }))
                          }
                          className={cn("rounded-2xl", r.depth === 0 ? "font-semibold" : "")}
                          placeholder={r.depth === 0 ? "Ex: Pessoal" : "Ex: Coordenador"}
                        />
                        <Button
                          variant="outline"
                          className="rounded-full"
                          size="sm"
                          onClick={() => addChild(r.node.id)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="text-right">
                      {isLeaf ? (
                        <Input
                          value={String(r.node.value || "").replace(".", ",")}
                          onChange={(e) =>
                            updateNode(r.node.id, (n) => ({
                              ...n,
                              value: moneyInputToNumber(e.target.value),
                            }))
                          }
                          className="rounded-2xl text-right"
                          inputMode="decimal"
                          placeholder="0,00"
                        />
                      ) : (
                        <div className="mt-2 text-sm font-semibold text-[hsl(var(--ink))]">
                          {formatBRL(r.total)}
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => deleteNode(r.node.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total geral</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              {formatBRL(totalGeral)}
            </div>
            <div className="mt-3 text-xs text-[hsl(var(--muted-ink))]">
              Dica: use o botão <span className="font-medium">+</span> para criar subitens e sub-subitens.
            </div>
          </Card>

          <Card className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-[hsl(var(--ink))]">Totais por item</div>
            <div className="mt-3 grid gap-2">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between rounded-2xl border bg-[hsl(var(--app-bg))] px-3 py-2"
                >
                  <div className="min-w-0 text-sm font-medium text-[hsl(var(--ink))]">
                    {idx + 1}. {it.title || `Item ${idx + 1}`}
                  </div>
                  <div className="text-sm font-semibold text-[hsl(var(--ink))]">
                    {formatBRL(sumNode(it))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
