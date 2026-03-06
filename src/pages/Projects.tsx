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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FolderKanban, Plus } from "lucide-react";

export default function Projects() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
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
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: (project) => {
      toast.success("Projeto criado");
      setOpen(false);
      setName("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setActiveProjectId(project.id);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao criar projeto"),
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
              Cada projeto tem seu próprio orçamento, balancete e lançamentos.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]">
                <Plus className="mr-2 h-4 w-4" />
                Novo projeto
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>Criar projeto</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Nome</div>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-2xl" placeholder="Ex: Projeto X" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Descrição (opcional)</div>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-2xl" placeholder="Objetivo, convênio, observações…" />
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
        {items.map((p) => (
          <Card
            key={p.id}
            className={cn(
              "group rounded-3xl border bg-white p-5 shadow-sm transition",
              activeProjectId === p.id ? "ring-2 ring-[hsl(var(--brand)/0.35)]" : "hover:shadow-md"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold tracking-tight text-[hsl(var(--ink))]">
                  {p.name}
                </div>
                {p.description ? (
                  <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">{p.description}</div>
                ) : (
                  <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">Sem descrição.</div>
                )}
              </div>
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
