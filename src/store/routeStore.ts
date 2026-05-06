"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { RouteCandidate, SavedRoute } from "@/types/route";
import { routecraftStorageKey, toSavedRoute } from "@/lib/storage";

interface RouteFlowState {
  results: RouteCandidate[];
  activeRouteId: string | null;
  savedRoutes: SavedRoute[];
  setResults: (routes: RouteCandidate[], activeRouteId?: string) => void;
  setActiveRoute: (routeId: string) => void;
  saveRoute: (route: RouteCandidate) => void;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const storage = createJSONStorage<RouteFlowState>(() =>
  typeof window === "undefined" ? noopStorage : window.localStorage,
);

export const useRouteStore = create<RouteFlowState>()(
  persist(
    (set) => ({
      results: [],
      activeRouteId: null,
      savedRoutes: [],
      setResults: (routes, activeRouteId) =>
        set({
          results: routes,
          activeRouteId: activeRouteId ?? routes[0]?.id ?? null,
        }),
      setActiveRoute: (routeId) => set({ activeRouteId: routeId }),
      saveRoute: (route) =>
        set((state) => {
          const savedRoute = toSavedRoute(route);
          return {
            savedRoutes: [
              savedRoute,
              ...state.savedRoutes.filter((existing) => existing.id !== route.id),
            ],
          };
        }),
    }),
    {
      name: routecraftStorageKey,
      storage,
    },
  ),
);
