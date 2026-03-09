import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/SessionContext";
import type { Vendor } from "@/lib/supabaseTypes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";

function emptyForm() {
  return { name: "", taxId: "", address: "", phone: "", email: "" };
}

export default function Fornecedores() {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm());

  const vendorsQuery = useQuery({
    queryKey: ["vendors", session?.user?.id],
    enabled: Boolean(session?.user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return vendorsQuery.data ?? [];
    return (vendorsQuery.data ?? []).filter((v) => {
      return v.name.toLowerCase().includes(query) || v.tax_id.toLowerCase().includes(query);
    });
  }, [vendorsQuery.data, q]);

  const upsertVendor = useMutation({
    mutationFn: async () => {
      const owner = session?.user?.id;
      if (!owner) throw new Error("Sem sessão");

      const name = form.name.trim();
      const taxId = form.taxId.trim();
      if (!name || !taxId) throw new Error("Nome e CNPJ/CPF são obrigatórios");

      if (!editing) {
        const { data, error } = await supabase
          .from("vendors")
          .insert({
            owner_user_id: owner,
            name,
            tax_id: taxId,
            address: form.address.trim() || null,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
          } as any)
          .select("*")
          .single();
        if (error) throw error;
        return data as Vendor;
      }

      const { data, error } = await supabase
        .from("vendors")
        .update({
          name,
          tax_id: taxId,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
        } as any)
        .eq("id", editing.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Vendor;
    },
    onSuccess: () => {
      toast.success(editing ? "Fornecedor atualizado" : "Fornecedor cadastrado");
      queryClient.invalidateQueries({ queryKey: ["vendors", session?.user?.id] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm());
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  const deleteVendor = useMutation({
    mutationFn: async (vendor: Vendor) => {
      // Impede exclusão se já estiver vinculado a lançamentos.
      const { count, error: countErr } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", vendor.id)
        .is("deleted_at", null);
      if (countErr) throw countErr;

      if ((count ?? 0) > 0) {
        throw new Error("Este fornecedor já possui lançamentos e não pode ser excluído.");
      }

      const { error } = await supabase.from("vendors").delete().eq("id", vendor.id);
      if (error) throw error;
      return vendor.id;
    },
    onSuccess: () => {
      toast.success("Fornecedor excluído");
      queryClient.invalidateQueries({ queryKey: ["vendors", session?.user?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir"),
  });

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Cadastro global</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">Fornecedores</h1>
            <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
              Uma vez cadastrado, o fornecedor pode ser usado em qualquer projeto.
            </div>
          </div>

          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) {
                setEditing(null);
                setForm(emptyForm());
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]">
                <Plus className="mr-2 h-4 w-4" />
                Novo fornecedor
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar fornecedor" : "Cadastrar fornecedor"}</DialogTitle>
              </DialogHeader>

              <div className="grid gap-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Nome *</div>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    className="rounded-2xl"
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">CNPJ/CPF *</div>
                  <Input
                    value={form.taxId}
                    onChange={(e) => setForm((s) => ({ ...s, taxId: e.target.value }))}
                    className="rounded-2xl"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Telefone</div>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                      className="rounded-2xl"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">E-mail</div>
                    <Input
                      value={form.email}
                      onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                      className="rounded-2xl"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Endereço</div>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                    className="rounded-2xl"
                  />
                </div>

                <Button
                  disabled={!form.name.trim() || !form.taxId.trim() || upsertVendor.isPending}
                  onClick={() => upsertVendor.mutate()}
                  className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
                >
                  Salvar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand))]">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[hsl(var(--ink))]">Lista de fornecedores</div>
              <div className="text-xs text-[hsl(var(--muted-ink))]">
                {vendorsQuery.data?.length ?? 0} cadastrados
              </div>
            </div>
          </div>

          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou CNPJ/CPF"
            className="w-full rounded-2xl md:max-w-sm"
          />
        </div>

        <div className="mt-4 grid gap-2">
          {(filtered ?? []).map((v) => (
            <div
              key={v.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border bg-[hsl(var(--app-bg))] p-3",
                "hover:bg-black/5"
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[hsl(var(--ink))]">{v.name}</div>
                <div className="mt-1 truncate text-xs text-[hsl(var(--muted-ink))]">
                  {v.tax_id}
                  {v.email ? ` · ${v.email}` : ""}
                  {v.phone ? ` · ${v.phone}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="h-9 rounded-full"
                  onClick={() => {
                    setEditing(v);
                    setForm({
                      name: v.name ?? "",
                      taxId: v.tax_id ?? "",
                      address: v.address ?? "",
                      phone: v.phone ?? "",
                      email: v.email ?? "",
                    });
                    setOpen(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>

                <Button
                  variant="outline"
                  className="h-9 rounded-full"
                  onClick={() => deleteVendor.mutate(v)}
                  disabled={deleteVendor.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
              </div>
            </div>
          ))}

          {!vendorsQuery.isLoading && !filtered.length && (
            <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-6 text-center text-sm text-[hsl(var(--muted-ink))]">
              Nenhum fornecedor cadastrado.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
