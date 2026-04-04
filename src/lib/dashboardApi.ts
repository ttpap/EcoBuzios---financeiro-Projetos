import { supabase } from "@/integrations/supabase/client";
import type { Budget, Project } from "@/lib/supabaseTypes";

export interface Totals {
  planned: number;
  executed: number;
  remaining: number;
}

export async function fetchProjectById(projectId: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (error) return null;
  return data as Project ?? null;
}

export type ProjectRollup = {
  id: string;
  name: string;
  executionYear: number | null;
  planned: number;
  executed: number;
  remaining: number;
  status: string; // "ativo" | "pausado" | "finalizado"
};

export async function fetchActiveBudget(projectId: string) {
  const { data: budgets, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (budgets?.[0] as Budget | undefined) ?? null;
}

export async function fetchDashboardTotals(projectId: string, budgetId: string): Promise<Totals> {
  const [{ data: lines, error: lErr }, { data: tx, error: tErr }] = await Promise.all([
    supabase.from("budget_lines").select("total_approved,is_subtotal").eq("budget_id", budgetId),
    supabase
      .from("transactions")
      .select("amount,deleted_at")
      .eq("project_id", projectId)
      .eq("budget_id", budgetId)
      .is("deleted_at", null),
  ]);

  if (lErr) throw lErr;
  if (tErr) throw tErr;

  const planned = (lines ?? []).reduce(
    (acc, r: any) => acc + (r.is_subtotal ? 0 : Number(r.total_approved ?? 0)),
    0
  );
  const executed = (tx ?? []).reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
  return { planned, executed, remaining: planned - executed };
}

export async function fetchProjectsRemainingRollup(): Promise<ProjectRollup[]> {
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id,name,execution_year,status,created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (pErr) throw pErr;

  const list = (projects ?? []) as Array<{ id: string; name: string; execution_year: number | null; status: string | null }>;
  if (!list.length) return [];

  const projectIds = list.map((p) => p.id);

  const { data: budgets, error: bErr } = await supabase
    .from("budgets")
    .select("id,project_id,created_at")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });
  if (bErr) throw bErr;

  // Latest budget per project
  const latestBudgetByProject = new Map<string, string>();
  for (const b of (budgets ?? []) as any[]) {
    const pid = String(b.project_id);
    if (!latestBudgetByProject.has(pid)) latestBudgetByProject.set(pid, String(b.id));
  }

  const budgetIds = Array.from(latestBudgetByProject.values());

  const [linesRes, txRes] = await Promise.all([
    budgetIds.length
      ? supabase
          .from("budget_lines")
          .select("budget_id,total_approved,is_subtotal")
          .in("budget_id", budgetIds)
      : Promise.resolve({ data: [], error: null } as any),
    budgetIds.length
      ? supabase
          .from("transactions")
          .select("project_id,budget_id,amount")
          .in("budget_id", budgetIds)
          .in("project_id", projectIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (linesRes.error) throw linesRes.error;
  if (txRes.error) throw txRes.error;

  const plannedByBudget = new Map<string, number>();
  for (const r of (linesRes.data ?? []) as any[]) {
    if (r.is_subtotal) continue;
    const bid = String(r.budget_id);
    plannedByBudget.set(bid, (plannedByBudget.get(bid) ?? 0) + Number(r.total_approved ?? 0));
  }

  const executedByProject = new Map<string, number>();
  for (const t of (txRes.data ?? []) as any[]) {
    const pid = String(t.project_id);
    executedByProject.set(pid, (executedByProject.get(pid) ?? 0) + Number(t.amount ?? 0));
  }

  return list.map((p) => {
    const bid = latestBudgetByProject.get(p.id) ?? null;
    const planned = bid ? plannedByBudget.get(bid) ?? 0 : 0;
    const executed = executedByProject.get(p.id) ?? 0;
    return {
      id: p.id,
      name: p.name,
      executionYear: p.execution_year ?? null,
      planned,
      executed,
      remaining: planned - executed,
      status: p.status ?? "ativo",
    };
  });
}

export const ARCHIVED_MARKER = "ARCHIVED";

export async function archiveProject(projectId: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: ARCHIVED_MARKER } as any)
    .eq("id", projectId);
  if (error) throw error;
}

export async function restoreProject(projectId: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: null } as any)
    .eq("id", projectId)
    .eq("deleted_at", ARCHIVED_MARKER);
  if (error) throw error;
}

export async function updateProjectStatus(projectId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ status } as any)
    .eq("id", projectId);
  if (error) throw error;
}
