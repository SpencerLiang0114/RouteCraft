"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { loadSavedRoutes as fetchSavedRoutes, saveRoute as persistSavedRoute } from "@/frontend/api/savedRoutes";
import type { RouteCandidate, SavedRoute } from "@/types/route";

const routecraftStorageKey = "routecraft-flow";

interface RouteFlowState {
  results: RouteCandidate[];
  activeRouteId: string | null;
  savedRoutes: SavedRoute[];
  savedRoutesStatus: "idle" | "loading" | "ready" | "error";
  savedRoutesError: string | null;
  setResults: (routes: RouteCandidate[], activeRouteId?: string) => void;
  setActiveRoute: (routeId: string) => void;
  loadSavedRoutes: () => Promise<void>;
  saveRoute: (route: RouteCandidate) => Promise<SavedRoute>;
}

type PersistedRouteFlowState = Pick<RouteFlowState, "results" | "activeRouteId">;

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const storage = createJSONStorage<PersistedRouteFlowState>(() =>
  typeof window === "undefined" ? noopStorage : window.localStorage,
);

export const useRouteStore = create<RouteFlowState>()(
  persist<RouteFlowState, [], [], PersistedRouteFlowState>(
    (set) => ({
      results: [],
      activeRouteId: null,
      savedRoutes: [],
      savedRoutesStatus: "idle",
      savedRoutesError: null,
      setResults: (routes, activeRouteId) =>
        set({
          results: routes,
          activeRouteId: activeRouteId ?? routes[0]?.id ?? null,
        }),
      setActiveRoute: (routeId) => set({ activeRouteId: routeId }),
      loadSavedRoutes: async () => {
        set({ savedRoutesStatus: "loading", savedRoutesError: null });
        try {
          const savedRoutes = await fetchSavedRoutes();
          set({ savedRoutes, savedRoutesStatus: "ready" });
        } catch (error) {
          set({
            savedRoutesStatus: "error",
            savedRoutesError: error instanceof Error ? error.message : "Could not load saved routes.",
          });
        }
      },
      saveRoute: async (route) => {
        try {
          const savedRoute = await persistSavedRoute(route);
          set((state) => ({
            savedRoutes: [
              savedRoute,
              ...state.savedRoutes.filter((existing) => existing.id !== savedRoute.id),
            ],
            savedRoutesStatus: "ready",
            savedRoutesError: null,
          }));
          return savedRoute;
        } catch (error) {
          set({
            savedRoutesStatus: "error",
            savedRoutesError: error instanceof Error ? error.message : "Could not save route.",
          });
          throw error;
        }
      },
    }),
    {
      name: routecraftStorageKey,
      storage,
      partialize: (state) => ({
        results: state.results,
        activeRouteId: state.activeRouteId,
      }),
    },
  ),
);
