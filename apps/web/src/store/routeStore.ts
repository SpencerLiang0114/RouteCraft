"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { get, set as idbSet, del } from "idb-keyval";
import { loadSavedRoutes as fetchSavedRoutes, saveRoute as persistSavedRoute, deleteSavedRoute, updateSavedRoute } from "@/lib/api-client/savedRoutes";
import type { RouteCandidate, SavedRoute } from "@/types/route";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const routecraftStorageKey = "routecraft-flow";

export function isSavedRoute(route: RouteCandidate): route is SavedRoute {
  return "savedAt" in route && typeof (route as SavedRoute).savedAt === "string";
}

// Drops the library fields so a route the current user no longer owns can be saved again.
function toCandidate(route: RouteCandidate): RouteCandidate {
  if (!isSavedRoute(route)) {
    return route;
  }
  const candidate: Partial<SavedRoute> = { ...route };
  delete candidate.savedAt;
  delete candidate.notes;
  return candidate as RouteCandidate;
}

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
  updateRoute: (id: string, patch: { name?: string; notes?: string | null }) => Promise<SavedRoute>;
  deleteRoute: (id: string) => Promise<void>;
  clearLibrary: () => void;
}

type PersistedRouteFlowState = Pick<RouteFlowState, "results" | "activeRouteId">;

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const indexedDBStorage: StateStorage = {
  getItem: async (name): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name, value): Promise<void> => {
    await idbSet(name, value);
  },
  removeItem: async (name): Promise<void> => {
    await del(name);
  },
};

const storage = createJSONStorage<PersistedRouteFlowState>(() =>
  typeof window === "undefined" ? noopStorage : indexedDBStorage,
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
            savedRoutesError: getErrorMessage(error, "Could not load saved routes."),
          });
        }
      },
      saveRoute: async (route) => {
        try {
          const savedRoute = await persistSavedRoute(route);
          // Every save gets a new server id, so swap the copy in for the candidate it came from;
          // the results view then still knows the route is saved after a remount or reload.
          set((state) => ({
            savedRoutes: [savedRoute, ...state.savedRoutes],
            results: state.results.map((existing) => (existing.id === route.id ? savedRoute : existing)),
            activeRouteId: state.activeRouteId === route.id ? savedRoute.id : state.activeRouteId,
            savedRoutesStatus: "ready",
            savedRoutesError: null,
          }));
          return savedRoute;
        } catch (error) {
          set({
            savedRoutesStatus: "error",
            savedRoutesError: getErrorMessage(error, "Could not save route."),
          });
          throw error;
        }
      },
      updateRoute: async (id, patch) => {
        const savedRoute = await updateSavedRoute(id, patch);
        set((state) => ({
          savedRoutes: state.savedRoutes.map((route) => (route.id === id ? savedRoute : route)),
          savedRoutesStatus: "ready",
          savedRoutesError: null,
        }));
        return savedRoute;
      },
      deleteRoute: async (id) => {
        await deleteSavedRoute(id);
        set((state) => ({
          savedRoutes: state.savedRoutes.filter((route) => route.id !== id),
          results: state.results.map((route) => (route.id === id ? toCandidate(route) : route)),
          savedRoutesStatus: "ready",
          savedRoutesError: null,
        }));
      },
      clearLibrary: () =>
        set((state) => ({
          savedRoutes: [],
          results: state.results.map(toCandidate),
          savedRoutesStatus: "idle",
          savedRoutesError: null,
        })),
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
