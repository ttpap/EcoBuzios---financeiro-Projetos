import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function DashboardStatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "brand",
}: {
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "brand" | "teal" | "amber" | "violet" | "red";
}) {
  const toneClasses = {
    brand: "bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand))]",
    teal: "bg-teal-500/12 text-teal-700",
    amber: "bg-amber-500/14 text-amber-700",
    violet: "bg-violet-500/12 text-violet-700",
    red: "bg-red-500/12 text-red-700",
  } as const;

  return (
    <Card className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-ink))]">
            {title}
          </div>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))] sm:text-3xl">
            {value}
          </div>
          {hint ? <div className="mt-2 text-sm text-[hsl(var(--muted-ink))]">{hint}</div> : null}
        </div>

        <div className={cn("grid h-11 w-11 place-items-center rounded-2xl", toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
