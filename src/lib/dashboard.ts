import { supabase } from "@/integrations/supabase/client";
import type { Budget } from "@/lib/supabaseTypes";

export type Totals = {
  approved: number;
  executed: number;
};

export type ProjectDashboardRow = {
  id: string;
  name: string;
  projectNumber: string | null;
  description: string | null;
  executionYear: number | null;
  durationMonths: number;
  planned: number;
  executed: number;
  remaining: number;
};

export type GroupedProjectDashboardRows = {
  yearLabel: string;
  projects: ProjectDashboardRow[];
  planned: number;
  executed: number;
  remaining: number;
};

export function getGlobalDashboardStats(rows: ProjectDashboardRow[]) {
  const totalProjects = rows.length;
  const planned = rows.reduce((acc, row) => acc + row.planned, 0);
  const executed = rows.reduce((acc, row) => acc + row.executed, 0);
  const remaining = planned - executed;
  const pct = planned > 0 ? (executed / planned) * 100 : 0;
  return { totalProjects, planned, executed, remaining, pct };
}

export function groupProjectsDashboardRowsByYear(rows: ProjectDashboardRow[]): GroupedProjectDashboardRows[] {
  const groups = new Map<string, ProjectDashboardRow[]>();

  for (const row of rows) {
    const yearLabel = row.executionYear ? String(row.executionYear) : "Sem ano";
    groups.set(yearLabel, [...(groups.get(yearLabel) ?? []), row]);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === "Sem ano") return 1;
      if (b === "Sem ano") return -1;
      return Number(b) - Number(a);
    })
    .map(([yearLabel, projects]) => ({
      yearLabel,
      projects: projects.slice().sort((a, b) => b.planned - a.planned),
      planned: projects.reduce((acc, p) => acc + p.planned, 0),
      executed: projects.reduce((acc, p) => acc + p.executed, 0),
      remaining: projects.reduce((acc, p) => acc + p.remaining, 0),
    }));
}

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

  const approved = (lines ?? []).reduce(
    (acc, r: any) => acc + (r.is_subtotal ? 0 : Number(r.total_approved ?? 0)),
    0
  );
  const executed = (tx ?? []).reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
  return { approved, executed };
}

export async function fetchProjectsDashboardRows(): Promise<ProjectDashboardRow[]> {
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id,name,project_number,description,execution_year,duration_months,created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (pErr) throw pErr;

  const list = (projects ?? []) as Array<{
    id: string;
    name: string;
    project_number: string | null;
    description: string | null;
    execution_year: number | null;
    duration_months: number | null;
  }>;

  if (!list.length) return [];

  const projectIds = list.map((p) => p.id);

  const { data: budgets, error: bErr } = await supabase
    .from("budgets")
    .select("id,project_id,created_at")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });
  if (bErr) throw bErr;

  const latestBudgetByProject = new Map<string, string>();
  for (const b of (budgets ?? []) as Array<{ id: string; project_id: string }>) {
    if (!latestBudgetByProject.has(b.project_id)) latestBudgetByProject.set(b.project_id, b.id);
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
          .in("project_id", projectIds)
          .in("budget_id", budgetIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (linesRes.error) throw linesRes.error;
  if (txRes.error) throw txRes.error;

  const plannedByBudget = new Map<string, number>();
  for (const row of (linesRes.data ?? []) as Array<{ budget_id: string; total_approved: number | null; is_subtotal: boolean | null }>) {
    if (row.is_subtotal) continue;
    plannedByBudget.set(row.budget_id, (plannedByBudget.get(row.budget_id) ?? 0) + Number(row.total_approved ?? 0));
  }

  const executedByProject = new Map<string, number>();
  for (const row of (txRes.data ?? []) as Array<{ project_id: string; amount: number | null }>) {
    executedByProject.set(row.project_id, (executedByProject.get(row.project_id) ?? 0) + Number(row.amount ?? 0));
  }

  return list.map((project) => {
    const latestBudgetId = latestBudgetByProject.get(project.id);
    const planned = latestBudgetId ? plannedByBudget.get(latestBudgetId) ?? 0 : 0;
    const executed = executedByProject.get(project.id) ?? 0;

    return {
      id: project.id,
      name: project.name,
      projectNumber: project.project_number,
      description: project.description,
      executionYear: project.execution_year,
      durationMonths: Number(project.duration_months ?? 12),
      planned,
      executed,
      remaining: planned - executed,
    };
  });
}