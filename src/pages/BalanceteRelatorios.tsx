import NotImplemented from "@/pages/NotImplemented";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";

export default function BalanceteRelatorios() {
  return (
    <div className="grid gap-6">
      <BalanceteTabs />
      <NotImplemented title="Relatórios" />
    </div>
  );
}
