import { create } from 'zustand';

/**
 * Global UI state (client-only). Domain/server state lives in React Query, not here —
 * Zustand is reserved for ephemeral UI concerns (layout, modals, theme).
 */
interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebar: (open) => set({ sidebarOpen: open }),
}));
