import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/lib/supabaseTypes";
import { useSession } from "@/context/SessionContext";
import { useAppStore } from "@/lib/appStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BarChart3, FolderKanban, Pencil, Plus, Trash2, Table2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ProjectLogoUploader } from "@/components/projects/ProjectLogoUploader";
import { PageHeader } from "@/components/app/PageHeader";

function clampInt(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function normalizeYear(v: string) {
  const n = Number(String(v).replace(/\D/g, "").slice(0, 4));
  if (!Number.isFinite(n)) return null;
  if (n < 2000 || n > 2100) return null;
  return Math.trunc(n);
}

export default function Projects() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const [projectNumber, setProjectNumber] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [executionYear, setExecutionYear] = useState<string>("");

  useEffect(() => {
    if (!open) return;

    if (editing) {
      setProjectNumber(editing.project_number ?? "");
      setName(editing.name ?? "");
      setDescription(editing.description ?? "");
      setDurationMonths(Number(editing.duration_months ?? 12));
      setExecutionYear(editing.execution_year ? String(editing.execution_year) : "");
    } else {
      setProjectNumber("");
      setName("");
      setDescription("");
      setDurationMonths(12);
      setExecutionYear(String(new Date().getFullYear()));
    }
  }, [open, editing]);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
  });

  const createProject = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error("Sem sessão");
      const months = clampInt(Number(durationMonths || 0), 1, 120);
      const yr = normalizeYear(executionYear);
      if (!yr) throw new Error("Informe o Ano de Execução (ex: 2026)");

      const { data, error } = await supabase
        .from("projects")
        .insert({
          owner_user_id: session.user.id,
          project_number: projectNumber.trim() || null,
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
          duration_months: months,
          execution_year: yr,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: (project) => {
      toast.success("Projeto criado");
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setActiveProjectId(project.id);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao criar projeto"),
  });

  const updateProject = useMutation({
    mutationFn: async () => {
      if (!editing?.id) throw new Error("Projeto inválido");
      const months = clampInt(Number(durationMonths || 0), 1, 120);
      const yr = normalizeYear(executionYear);
      if (!yr) throw new Error("Informe o Ano de Execução (ex: 2026)");

      const { data, error } = await supabase
        .from("projects")
        .update({
          project_number: projectNumber.trim() || null,
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
          duration_months: months,
          execution_year: yr,
        } as any)
        .eq("id", editing.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: (project) => {
      toast.success("Projeto atualizado");
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (activeProjectId === project.id) setActiveProjectId(project.id);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  const deleteProject = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from("projects")
        .update({ deleted_at: new Date().toISOString(), status: "deleted" } as any)
        .eq("id", projectId);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      toast.success("Projeto removido");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (activeProjectId === projectId) setActiveProjectId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir"),
  });

  const groupedProjects = useMemo(() => {
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

    return sortedYears.map((y) => {
      const projects = (groups.get(y) ?? []).slice().sort((p1, p2) => {
        // Dentro do ano: primeiro os mais recentes
        return String(p2.created_at).localeCompare(String(p1.created_at));
      });
      return { yearLabel: y, projects };
    });
  }, [projectsQuery.data]);

  const isEditing = Boolean(editing);

  return (
    <div className="grid gap-6">
      <PageHeader
        badge={
          <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-semibold text-[hsl(var(--brand))]">
            <FolderKanban className="h-3.5 w-3.5" />
            Projetos
          </div>
        }
        title="Projetos"
        description={
          <>
            Organize por <span className="font-semibold text-[hsl(var(--ink))]">Ano de Execução</span>, selecione o projeto ativo e
            acesse rapidamente o módulo de execução.
          </>
        }
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button
                onClick={() => setEditing(null)}
                className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Projeto
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>{isEditing ? "Editar projeto" : "Adicionar projeto"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Ano de Execução</div>
                    <Input
                      value={executionYear}
                      onChange={(e) => setExecutionYear(e.target.value)}
                      className="rounded-2xl"
                      inputMode="numeric"
                      placeholder="2026"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Duração total (meses)</div>
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      value={durationMonths}
                      onChange={(e) => setDurationMonths(Number(e.target.value))}
                      className="rounded-2xl"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Número (opcional)</div>
                    <Input value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)} className="rounded-2xl" />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Nome do projeto</div>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-2xl" />
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Descrição (opcional)</div>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[92px] rounded-2xl" />
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => (editing ? updateProject.mutate() : createProject.mutate())}
                    disabled={!name.trim() || !executionYear.trim() || createProject.isPending || updateProject.isPending}
                    className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                  >
                    {editing ? "Salvar" : "Criar projeto"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4">
        {groupedProjects.map((group) => (
          <div key={group.yearLabel} className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[hsl(var(--ink))] ring-1 ring-black/5">
                  {group.yearLabel === "Sem ano" ? "Sem Ano de Execução" : `Execução ${group.yearLabel}`}
                </div>
                <div className="text-xs text-[hsl(var(--muted-ink))]">{group.projects.length} projeto(s)</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.projects.map((p) => (
                <Card
                  key={p.id}
                  className={cn(
                    "rounded-3xl border bg-white p-5 shadow-sm transition",
                    "hover:shadow-md",
                    activeProjectId === p.id ? "ring-2 ring-[hsl(var(--brand)/0.35)]" : ""
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-base font-semibold tracking-tight text-[hsl(var(--ink))]">
                          {p.name}
                        </div>
                        {activeProjectId === p.id ? (
                          <span className="shrink-0 rounded-full bg-[hsl(var(--brand))] px-2 py-1 text-[10px] font-semibold text-white">
                            Ativo
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
                        {p.project_number ? `#${p.project_number} · ` : ""}
                        {Number(p.duration_months ?? 12)} meses
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <ProjectLogoUploader project={p} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant={activeProjectId === p.id ? "default" : "outline"}
                      className={cn(
                        "rounded-full",
                        activeProjectId === p.id
                          ? "bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                          : ""
                      )}
                      onClick={() => setActiveProjectId(p.id)}
                    >
                      {activeProjectId === p.id ? "Projeto ativo" : "Selecionar"}
                    </Button>

                    <Button asChild variant="outline" className="rounded-full">
                      <Link to="/balancete" onClick={() => setActiveProjectId(p.id)}>
                        <Table2 className="mr-2 h-4 w-4" />
                        Abrir Balancete
                      </Link>
                    </Button>

                    <Button asChild variant="outline" className="rounded-full">
                      <Link to="/dashboard" onClick={() => setActiveProjectId(p.id)}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Dashboard
                      </Link>
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Dialog
                      open={open && editing?.id === p.id}
                      onOpenChange={(v) => {
                        if (!v) setEditing(null);
                      }}
                    />

                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="rounded-full">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-3xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir projeto</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir <span className="font-semibold">{p.name}</span>?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-full bg-red-600 text-white hover:bg-red-700"
                            onClick={() => deleteProject.mutate(p.id)}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {!groupedProjects.length ? (
        <div className="rounded-3xl border bg-white p-6 text-sm text-[hsl(var(--muted-ink))]">
          Nenhum projeto cadastrado ainda.
        </div>
      ) : null}
    </div>
  );
}