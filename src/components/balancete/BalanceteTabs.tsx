import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const tabs = [
  { to: "/balancete/importar", label: "Importar Orçamento" },
  { to: "/balancete", label: "Balancete" },
  { to: "/balancete/lancamentos", label: "Lançamentos" },
  { to: "/balancete/relatorios", label: "Relatórios" },
  { to: "/balancete/alertas", label: "Alertas" },
  { to: "/balancete/configuracoes", label: "Configurações" },
];

export function BalanceteTabs() {
  const location = useLocation();

  return (
    <Card className="rounded-3xl border bg-white p-2 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = location.pathname === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-[hsl(var(--brand))] text-white"
                  : "text-[hsl(var(--ink))] hover:bg-black/5"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
