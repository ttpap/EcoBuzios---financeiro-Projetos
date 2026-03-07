import { BalanceteTabs } from "@/components/balancete/BalanceteTabs";
import Lancamentos from "@/pages/Lancamentos";

export default function BalanceteLancamentos() {
  return (
    <div className="grid gap-6">
      <BalanceteTabs />
      <Lancamentos />
    </div>
  );
}
