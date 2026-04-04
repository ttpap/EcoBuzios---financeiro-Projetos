import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/lib/supabaseTypes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Archive, RotateCcw } from "lucide-react";

export default function ArchivedProjects() {
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ["archivedProjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("deleted_at", "1970-01-01T00:00:00.000Z")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
  });

  const restoreProject = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from("projects")
        .update({ deleted_at: null } as any)
        .eq("id", projectId);
      if (error) throw error;
      return projectId;
    },
    onSuccess: () => {
      toast.success("Projeto restaurado");
      queryClient.invalidateQueries({ queryKey: ["archivedProjects"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projectsRemainingRollup"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao restaurar"),
  });

  const grouped = useMemo(() => {
    const arr = projectsQuery.data ?? [];
    const groups = new Map<string, Project[]>();

    for (const p of arr) {
      const y = p.execution_year ? String(p.execution_year) : "Sem ano";
      groups.set(y, [...(groups.get(y) ?? []), p]);
    }

    const sortedYears = Array.from(groups.keys()).sort((a, b) => {
      if (a === "Sem ano") return 1;
      if (b === "Sem ano") return -1;
      return Number(b) - Number(a);
    });

    return sortedYears.map((y) => ({
      yearLabel: y,
      projects: (groups.get(y) ?? []).slice().sort((p1, p2) =>
        String(p2.created_at).localeCompare(String(p1.created_at))
      ),
    }));
  }, [projectsQuery.data]);

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              <Archive className="h-3.5 w-3.5" />
              Arquivados
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              Projetos Arquivados
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Projetos que foram arquivados. Clique em <span className="font-semibold text-[hsl(var(--ink))]">Restaurar</span> para devolver ao Dashboard.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {grouped.map((g) => (
          <div key={g.yearLabel} className="grid gap-3">
            <div>
              <div
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                  g.yearLabel === "Sem ano"
                    ? "bg-black/5 text-[hsl(var(--muted-ink))]"
                    : "bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand-strong))]"
                )}
              >
                {g.yearLabel === "Sem ano" ? "Sem Ano de Execução" : `Execução ${g.yearLabel}`}
                <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--ink))]">
                  {g.projects.length}
                </span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {g.projects.map((p) => (
                <Card
                  key={p.id}
                  className="group rounded-3xl border bg-white p-5 shadow-sm opacity-70 transition hover:opacity-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-ink))]">
                        <span>
                          {p.project_number ? `#${p.project_number}` : ""} {p.duration_months ?? 12} meses
                        </span>
                        <span className="h-1 w-1 rounded-full bg-black/20" />
                        <span className="rounded-full bg-black/5 px-2 py-0.5 font-medium text-[hsl(var(--ink))]">
                          {p.execution_year ? `Execução ${p.execution_year}` : "Sem ano"}
                        </span>
                      </div>

                      <div className="mt-1 text-lg font-semibold tracking-tight text-[hsl(var(--ink))]">
                        {p.name}
                      </div>
                      {p.description ? (
                        <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">{p.description}</div>
                      ) : null}

                      <div className="mt-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                          <Archive className="h-3 w-3" />
                          Arquivado
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        className="rounded-full border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                        onClick={() => restoreProject.mutate(p.id)}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restaurar
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}

        {!grouped.length && (
          <div className="rounded-3xl border bg-white p-6 text-sm text-[hsl(var(--muted-ink))]">
            Nenhum projeto arquivado.
          </div>
        )}
      </div>
    </div>
  );
}
