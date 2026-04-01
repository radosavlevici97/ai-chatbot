import { create } from "zustand";

type SidebarTab = "chat" | "devbot";

type UIState = {
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  sidebarTab: "chat",
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
}));
