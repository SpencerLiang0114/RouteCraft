"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { RouteCandidate, SavedRoute } from "@/types/route";

const routecraftStorageKey = "routecraft-flow";

function toSavedRoute(route: RouteCandidate): SavedRoute {
  // TODO: Promote local saved routes into user route history for personalized recommendations.
  return { ...route, savedAt: new Date().toISOString() };
}

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
