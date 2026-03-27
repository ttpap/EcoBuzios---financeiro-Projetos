import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/lib/supabaseTypes";
import { safeFileName } from "@/lib/projectLogos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ImageUp, ImageIcon, Trash2 } from "lucide-react";

export function ProjectLogoUploader({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const ext = useMemo(() => {
    const n = file?.name ?? "";
    const last = n.lastIndexOf(".");
    return last >= 0 ? n.slice(last + 1).toLowerCase() : "png";
  }, [file]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione uma imagem");
      if (!project?.id) throw new Error("Projeto inválido");
      if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) throw new Error("Use PNG/JPG/WebP");

      const path = `${project.id}/${Date.now()}-${safeFileName(file.name || `logo.${ext}`)}`;

      const { error: upErr } = await supabase.storage
        .from("project-logos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      if (project.logo_path) {
        await supabase.storage.from("project-logos").remove([project.logo_path]);
      }

      const { error } = await supabase
        .from("projects")
        .update({
          logo_path: path,
          logo_file_name: safeFileName(file.name || `logo.${ext}`),
          logo_size_bytes: file.size,
        } as any)
        .eq("id", project.id);
      if (error) throw error;
      return path;
    },
    onSuccess: () => {
      toast.success("Logo do projeto atualizada");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar logo"),
  });

  const clear = useMutation({
    mutationFn: async () => {
      if (!project?.id) throw new Error("Projeto inválido");
      if (project.logo_path) {
        await supabase.storage.from("project-logos").remove([project.logo_path]);
      }
      const { error } = await supabase
        .from("projects")
        .update({ logo_path: null, logo_file_name: null, logo_size_bytes: null } as any)
        .eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Logo removida");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao remover"),
  });

  const logoUrl = useMemo(() => {
    if (!project.logo_path) return null;
    const { data } = supabase.storage.from("project-logos").getPublicUrl(project.logo_path);
    return data.publicUrl;
  }, [project.logo_path]);

  return (
    <div className="flex items-start gap-4">
      {/* Moldura da logo */}
      <div className="flex h-32 w-32 flex-none items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-black/10 bg-[hsl(var(--app-bg))] transition hover:border-[hsl(var(--brand)/0.4)]">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-1.5" />
        ) : (
          <ImageIcon className="h-8 w-8 text-black/15" />
        )}
      </div>

      {/* Controles */}
      <div className="min-w-0 grid gap-2">
        <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Logo do projeto (opcional)</div>
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="rounded-2xl"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
            onClick={() => upload.mutate()}
            disabled={!file || upload.isPending}
          >
            <ImageUp className="mr-2 h-4 w-4" />
            Salvar logo
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => clear.mutate()}>
            <Trash2 className="mr-2 h-4 w-4" />
            Remover
          </Button>
        </div>
      </div>
    </div>
  );
}
