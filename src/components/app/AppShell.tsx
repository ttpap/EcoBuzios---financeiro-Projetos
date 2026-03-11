import { PropsWithChildren } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BarChart3, Building2, FolderKanban, LogOut, Settings, Table2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const nav = [
  { to: "/dashboard", label: "Dashboard Geral", icon: BarChart3 },
  { to: "/projects", label: "Projetos", icon: FolderKanban },
  { to: "/balancete", label: "Balancete", icon: Table2 },
  { to: "/fornecedores", label: "Fornecedores", icon: Building2 },
  { to: "/settings", label: "Configurações", icon: Settings },
];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[hsl(var(--app-bg))]">
      <header className="sticky top-0 z-30 border-b bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link to="/dashboard" className="group flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--brand))] text-white shadow-sm">
              <Table2 className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight text-[hsl(var(--ink))]">
                Balancete PRO
              </div>
              <div className="text-xs text-[hsl(var(--muted-ink))]">
                Orçamento • Execução • Relatórios
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
            {nav.map((item) => {
              const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand))]"
                      : "text-[hsl(var(--ink))] hover:bg-black/5"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-6 md:hidden">
          <div className="rounded-2xl border bg-white p-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {nav.map((item) => {
                const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-medium",
                      active
                        ? "bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand))]"
                        : "text-[hsl(var(--ink))] hover:bg-black/5"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
          <Separator className="mt-6" />
        </div>

        {children}
      </main>

      <footer className="border-t bg-white/50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 text-xs text-[hsl(var(--muted-ink))] md:px-6">
          <span>Feito para controle de execução financeira por rubrica.</span>
          <span>v0.2 (módulo)</span>
        </div>
      </footer>
    </div>
  );
}