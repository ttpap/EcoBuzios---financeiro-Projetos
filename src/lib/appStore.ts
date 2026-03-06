import { create } from "zustand";

type AppState = {
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  activeBudgetId: string | null;
  setActiveBudgetId: (id: string | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id, activeBudgetId: null }),
  activeBudgetId: null,
  setActiveBudgetId: (id) => set({ activeBudgetId: id }),
}));
