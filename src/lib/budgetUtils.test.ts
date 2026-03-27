import { describe, it, expect } from "vitest";
import { calcMonthAmount, nextSubitemCode } from "./budgetUtils";
import type { BudgetLine } from "./supabaseTypes";

function line(overrides: Partial<BudgetLine> = {}): BudgetLine {
  return {
    id: "1",
    budget_id: "b1",
    category_id: "c1",
    name: "Test",
    quantity: null,
    unit_value: null,
    total_approved: 300,
    notes: null,
    status: "active",
    is_subtotal: false,
    sort_order: 1,
    start_month: 1,
    end_month: 3,
    ...overrides,
  };
}

describe("calcMonthAmount", () => {
  it("distributes evenly across months in range", () => {
    expect(calcMonthAmount(line({ start_month: 1, end_month: 3, total_approved: 300 }), 2)).toBe(100);
  });

  it("returns amount for first month of range", () => {
    expect(calcMonthAmount(line({ start_month: 2, end_month: 4, total_approved: 300 }), 2)).toBe(100);
  });

  it("returns amount for last month of range", () => {
    expect(calcMonthAmount(line({ start_month: 2, end_month: 4, total_approved: 300 }), 4)).toBe(100);
  });

  it("returns 0 for month before range", () => {
    expect(calcMonthAmount(line({ start_month: 3, end_month: 5, total_approved: 300 }), 2)).toBe(0);
  });

  it("returns 0 for month after range", () => {
    expect(calcMonthAmount(line({ start_month: 1, end_month: 2, total_approved: 300 }), 3)).toBe(0);
  });

  it("returns full amount when start equals end equals month", () => {
    expect(calcMonthAmount(line({ start_month: 2, end_month: 2, total_approved: 500 }), 2)).toBe(500);
  });

  it("returns 0 when total_approved is 0", () => {
    expect(calcMonthAmount(line({ start_month: 1, end_month: 3, total_approved: 0 }), 1)).toBe(0);
  });

  it("uses start_month as end when end_month is undefined", () => {
    const l = line({ start_month: 2, total_approved: 400 });
    delete (l as Partial<BudgetLine>).end_month;
    expect(calcMonthAmount(l, 2)).toBe(400);
    expect(calcMonthAmount(l, 3)).toBe(0);
  });
});

describe("nextSubitemCode", () => {
  it("returns 1.1 for item 1 with empty list", () => {
    expect(nextSubitemCode(1, [])).toBe("1.1");
  });

  it("returns 1.2 when 1.1 exists", () => {
    expect(nextSubitemCode(1, ["1.1"])).toBe("1.2");
  });

  it("returns 1.3 when 1.1 and 1.2 exist", () => {
    expect(nextSubitemCode(1, ["1.1", "1.2"])).toBe("1.3");
  });

  it("returns 1.4 when gap exists (1.1, 1.3)", () => {
    expect(nextSubitemCode(1, ["1.1", "1.3"])).toBe("1.4");
  });

  it("ignores codes from other prefixes", () => {
    expect(nextSubitemCode(2, ["1.1", "1.2"])).toBe("2.1");
  });

  it("handles null and undefined in list", () => {
    expect(nextSubitemCode(1, [null, undefined, "1.1"])).toBe("1.2");
  });

  it("handles numeric ordering correctly (1.10 > 1.9)", () => {
    expect(nextSubitemCode(3, ["3.1", "3.2", "3.10"])).toBe("3.11");
  });

  it("returns 2.1 for item 2 with empty list", () => {
    expect(nextSubitemCode(2, [])).toBe("2.1");
  });
});
