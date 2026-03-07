import NotImplemented from "@/pages/NotImplemented";
import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";

export default function BalanceteAlertas() {
  return (
    <div className="grid gap-6">
      <BalanceteTabs />
      <NotImplemented title="Alertas" />
    </div>
  );
}
