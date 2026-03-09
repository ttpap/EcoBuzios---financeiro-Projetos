import { useMemo, useState } from "react";
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
import { FolderKanban, Plus, Trash2, Table2 } from "lucide-react";
import { Link } from "react-router-dom";

const durationOptions = [1, 2, 3, 6, 12] as const;

export default function Projects() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  const [open, setOpen] = useState(false);
  const [projectNumber, setProjectNumber] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMonths, setDurationMonths] = useState<number>(12);

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
      const { data, error } = await supabase
        .from("projects")
        .insert({
          owner_user_id: session.user.id,
          project_number: projectNumber.trim() || null,
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
          duration_months: Math.max(1, Math.min(60, durationMonths)),
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: (project) => {
      toast.success("Projeto criado");
      setOpen(false);
      setProjectNumber("");
      setName("");
      setDescription("");
      setDurationMonths(12);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setActiveProjectId(project.id);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao criar projeto"),
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

  const items = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand)/0.12)] px-3 py-1 text-xs font-medium text-[hsl(var(--brand))]">
              <FolderKanban className="h-3.5 w-3.5" />
              Projetos
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              Seus projetos
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Crie projetos e monte a planilha orçamentária mensalmente distribuída.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Projeto
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>Adicionar projeto</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Número do projeto</div>
                  <Input
                    value={projectNumber}
                    onChange={(e) => setProjectNumber(e.target.value)}
                    className="rounded-2xl"
                    placeholder="Ex: 2026-ICMS-01"
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Nome</div>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-2xl" placeholder="Ex: Projeto X" />
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Descrição (opcional)</div>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-2xl" placeholder="Objetivo, convênio, observações…" />
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium text-[hsl(var(--muted-ink))]">Duração total (meses)</div>
                  <div className="flex flex-wrap gap-2">
                    {durationOptions.map((m) => (
                      <Button
                        key={m}
                        type="button"
                        variant={durationMonths === m ? "default" : "outline"}
                        className={cn(
                          "rounded-full",
                          durationMonths === m
                            ? "bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                            : ""
                        )}
                        onClick={() => setDurationMonths(m)}
                      >
                        {m} {m === 1 ? "mês" : "meses"}
                      </Button>
                    ))}
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={durationMonths}
                      onChange={(e) => setDurationMonths(Number(e.target.value))}
                      className="h-10 w-24 rounded-full"
                    />
                  </div>
                </div>

                <Button
                  disabled={!name.trim() || createProject.isPending}
                  onClick={() => createProject.mutate()}
                  className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                >
                  Criar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((p: any) => (
          <Card
            key={p.id}
            className={cn(
              "group rounded-3xl border bg-white p-5 shadow-sm transition",
              activeProjectId === p.id ? "ring-2 ring-[hsl(var(--brand)/0.35)]" : "hover:shadow-md"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-[hsl(var(--muted-ink))]">
                  {p.project_number ? `#${p.project_number}` : "Sem número"} · {p.duration_months ?? 12} meses
                </div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-[hsl(var(--ink))]">
                  {p.name}
                </div>
                {p.description ? (
                  <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">{p.description}</div>
                ) : (
                  <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">Sem descrição.</div>
                )}
              </div>
              <div className="flex flex-col gap-2">
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
                  {activeProjectId === p.id ? "Ativo" : "Selecionar"}
                </Button>

                <Button asChild variant="outline" className="rounded-full">
                  <Link to={`/balancete?project=${p.id}`}>
                    <Table2 className="mr-2 h-4 w-4" />
                    Montar Planilha
                  </Link>
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
                      <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação remove o projeto da sua lista (exclusão lógica). Você poderá recuperar depois via suporte.
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
            </div>
          </Card>
        ))}

        {!items.length && (
          <div className="rounded-3xl border bg-white p-6 text-sm text-[hsl(var(--muted-ink))]">
            Crie seu primeiro projeto para começar.
          </div>
        )}
      </div>
    </div>
  );
}