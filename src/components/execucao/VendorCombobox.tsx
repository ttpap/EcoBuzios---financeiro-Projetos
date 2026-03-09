import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, Plus, Search } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import type { Vendor } from "@/lib/supabaseTypes";

export function VendorCombobox({
  value,
  onChange,
}: {
  value: Vendor | null;
  onChange: (v: Vendor | null) => void;
}) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

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

  const createVendor = useMutation({
    mutationFn: async (payload: { name: string; tax_id: string; address?: string; phone?: string; email?: string }) => {
      const owner = session?.user?.id;
      if (!owner) throw new Error("Sem sessão");

      const { data, error } = await supabase
        .from("vendors")
        .insert({
          owner_user_id: owner,
          name: payload.name.trim(),
          tax_id: payload.tax_id.trim(),
          address: payload.address?.trim() || null,
          phone: payload.phone?.trim() || null,
          email: payload.email?.trim() || null,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as Vendor;
    },
    onSuccess: (v) => {
      toast.success("Fornecedor cadastrado");
      queryClient.invalidateQueries({ queryKey: ["vendors", session?.user?.id] });
      onChange(v);
      setOpen(false);
      setCreateOpen(false);
      setName("");
      setTaxId("");
      setAddress("");
      setPhone("");
      setEmail("");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao cadastrar"),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 justify-between rounded-2xl"
          onClick={() => setOpen((o) => !o)}
        >
          <span
            className={cn(
              "truncate text-sm",
              value ? "text-[hsl(var(--ink))]" : "text-[hsl(var(--muted-ink))]"
            )}
          >
            {value ? `${value.name} · ${value.tax_id}` : "Selecionar fornecedor"}
          </span>
          <Search className="h-4 w-4 text-[hsl(var(--muted-ink))]" />
        </Button>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              className="h-10 rounded-2xl bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>Cadastrar fornecedor</DialogTitle>
            </DialogHeader>

            <div className="grid gap-3">
              <div>
                <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Nome *</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-2xl" />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">CNPJ/CPF *</div>
                <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="rounded-2xl" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Telefone</div>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-2xl" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">E-mail</div>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-2xl" />
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-ink))]">Endereço</div>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-2xl" />
              </div>

              <Button
                disabled={!name.trim() || !taxId.trim() || createVendor.isPending}
                onClick={() => createVendor.mutate({ name, tax_id: taxId, address, phone, email })}
                className="rounded-full bg-[hsl(var(--brand))] text-white hover:bg-[hsl(var(--brand-strong))]"
              >
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {open && (
        <Card className="rounded-3xl border bg-white p-3 shadow-sm">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-2xl"
            placeholder="Buscar por nome ou CNPJ/CPF"
          />
          <div className="mt-3 max-h-64 overflow-auto rounded-2xl border">
            <div className="divide-y">
              {(filtered ?? []).map((v) => {
                const selected = value?.id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                      selected ? "bg-[hsl(var(--brand)/0.12)]" : "hover:bg-black/5"
                    )}
                    onClick={() => {
                      onChange(v);
                      setOpen(false);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[hsl(var(--ink))]">{v.name}</div>
                      <div className="truncate text-xs text-[hsl(var(--muted-ink))]">{v.tax_id}</div>
                    </div>
                    {selected && <Check className="h-4 w-4 text-[hsl(var(--brand))]" />}
                  </button>
                );
              })}

              {!filtered.length && (
                <div className="px-3 py-6 text-center text-sm text-[hsl(var(--muted-ink))]">
                  Nenhum fornecedor encontrado.
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}