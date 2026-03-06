export type Project = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  status: string;
  created_at: string;
};

export type Budget = {
  id: string;
  project_id: string;
  version: number;
  name: string;
  months_count: number;
  status: string;
  created_at: string;
};

export type BudgetCategory = {
  id: string;
  budget_id: string;
  name: string;
  sort_order: number;
};

export type BudgetLine = {
  id: string;
  budget_id: string;
  category_id: string | null;
  name: string;
  quantity: number | null;
  unit_value: number | null;
  total_approved: number;
  notes: string | null;
  status: string;
  is_subtotal: boolean;
  sort_order: number;
};

export type Transaction = {
  id: string;
  project_id: string;
  budget_id: string;
  budget_line_id: string;
  date: string;
  month_ref: string;
  amount: number;
  description: string | null;
  expense_type: string | null;
  document_number: string | null;
  notes: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
