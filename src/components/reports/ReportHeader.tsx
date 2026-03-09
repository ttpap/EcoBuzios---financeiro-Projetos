import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/money";
import type { Project } from "@/lib/supabaseTypes";
import { getProjectLogoUrl } from "@/lib/projectLogos";

export function ReportHeader({
  title,
  subtitle,
  planned,
  executed,
  project,
}: {
  title: string;
  subtitle?: string;
  planned: number;
  executed: number;
  project?: Project | null;
}) {
  const remaining = planned - executed;
  const executedPct = planned > 0 ? executed / planned : 0;
  const remainingPct = planned > 0 ? remaining / planned : 0;

  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!project?.logo_path) {
        setLogoUrl(null);
        return;
      }
      const url = await getProjectLogoUrl(project.logo_path);
      if (!alive) return;
      setLogoUrl(url);
    })();
    return () => {
      alive = false;
    };
  }, [project?.logo_path]);

  return (
    <div className="rounded-3xl border bg-white p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Relatórios</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">{subtitle}</div>}
          {project?.name && (
            <div className="mt-2 text-sm font-semibold text-[hsl(var(--ink))]">{project.name}</div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={project?.name ? `Logo ${project.name}` : "Logo do projeto"}
              className="h-12 w-auto rounded-xl border bg-white p-2"
            />
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
          <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total Planejado</div>
          <div className="mt-1 text-lg font-semibold text-[hsl(var(--ink))]">{formatBRL(planned)}</div>
          <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">100%</div>
        </div>
        <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
          <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total Executado</div>
          <div className="mt-1 text-lg font-semibold text-[hsl(var(--ink))]">{formatBRL(executed)}</div>
          <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">{Math.round(executedPct * 100)}%</div>
        </div>
        <div className="rounded-2xl border bg-[hsl(var(--app-bg))] p-4">
          <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Saldo Disponível</div>
          <div className="mt-1 text-lg font-semibold text-[hsl(var(--ink))]">{formatBRL(remaining)}</div>
          <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">{Math.round(remainingPct * 100)}%</div>
        </div>
      </div>
    </div>
  );
}