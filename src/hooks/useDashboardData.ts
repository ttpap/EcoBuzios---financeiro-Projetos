import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/appStore";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/lib/supabaseTypes";
import {
  fetchActiveBudget,
  fetchDashboardTotals,
  fetchProjectsRemainingRollup,
  type ProjectRollup,
} from "@/lib/dashboardApi";

export function useDashboardData(yearFilter: string) {
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const rollupQuery = useQuery({
    queryKey: ["projectsRemainingRollup"],
    queryFn: fetchProjectsRemainingRollup,
  });

  const yearRows = useMemo(() => {
    const groups = new Map<string, { value: number; count: number }>();
    for (const p of rollupQuery.data ?? []) {
      const y = p.executionYear ? String(p.executionYear) : "Sem ano";
      const curr = groups.get(y) ?? { value: 0, count: 0 };
      curr.value += p.remaining;
      curr.count += 1;
      groups.set(y, curr);
    }

    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === "Sem ano") return 1;
      if (b === "Sem ano") return -1;
      return Number(b) - Number(a);
    });

    return keys.map((k) => ({
      yearLabel: k,
      value: groups.get(k)!.value,
      projectsCount: groups.get(k)!.count,
    }));
  }, [rollupQuery.data]);

  const yearOptions = useMemo(() => {
    const years = Array.from(new Set((rollupQuery.data ?? []).map((p) => p.executionYear).filter(Boolean) as number[]))
      .sort((a, b) => b - a)
      .map(String);
    return years;
  }, [rollupQuery.data]);

  const projectsByYear = useMemo(() => {
    const groups = new Map<string, ProjectRollup[]>();
    for (const p of rollupQuery.data ?? []) {
      const y = p.executionYear ? String(p.executionYear) : "Sem ano";
      groups.set(y, [...(groups.get(y) ?? []), p]);
    }

    const years = Array.from(groups.keys()).sort((a, b) => {
      if (a === "Sem ano") return 1;
      if (b === "Sem ano") return -1;
      return Number(b) - Number(a);
    });

    return years.map((y) => ({
      yearLabel: y,
      projects: (groups.get(y) ?? []).slice().sort((p1, p2) => p2.planned - p1.planned),
    }));
  }, [rollupQuery.data]);

  const donutItems = useMemo(() => {
    const list = rollupQuery.data ?? [];
    const filtered =
      yearFilter === "all"
        ? list
        : list.filter((p) => String(p.executionYear ?? "Sem ano") === yearFilter);

    return filtered.map((p) => ({ id: p.id, name: p.name, value: Math.max(0, p.remaining) }));
  }, [rollupQuery.data, yearFilter]);

  const donutSubtitle = useMemo(() => {
    if (yearFilter === "all") return "Saldo (Planejado − Executado) de cada projeto, considerando todos os anos";
    return `Saldo (Planejado − Executado) por projeto no ano ${yearFilter}`;
  }, [yearFilter]);

  const projectQuery = useQuery({
    queryKey: ["project", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", activeProjectId).single();
      if (error) throw error;
      return data as Project;
    },
  });

  const budgetQuery = useQuery({
    queryKey: ["activeBudget", activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: () => fetchActiveBudget(activeProjectId!),
  });

  const totalsQuery = useQuery({
    queryKey: ["dashboardTotals", activeProjectId, budgetQuery.data?.id],
    enabled: Boolean(activeProjectId && budgetQuery.data?.id),
    queryFn: () => fetchDashboardTotals(activeProjectId!, budgetQuery.data!.id),
  });

  const stats = useMemo(() => {
    const approved = totalsQuery.data?.approved ?? 0;
    const executed = totalsQuery.data?.executed ?? 0;
    const remaining = approved - executed;
    const pct = approved > 0 ? (executed / approved) * 100 : 0;
    return { approved, executed, remaining, pct };
  }, [totalsQuery.data]);

  return {
    yearRows,
    yearOptions,
    projectsByYear,
    donutItems,
    donutSubtitle,
    stats,
    projectData: projectQuery.data,
    isLoading: rollupQuery.isLoading,
    rollupData: rollupQuery.data ?? [],
  };
}
