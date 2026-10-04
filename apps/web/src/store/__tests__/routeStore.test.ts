import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteCandidate, SavedRoute } from "@/types/route";

const api = vi.hoisted(() => ({
  saveRoute: vi.fn(),
  deleteSavedRoute: vi.fn(),
  loadSavedRoutes: vi.fn(),
  updateSavedRoute: vi.fn(),
}));

vi.mock("@/lib/api-client/savedRoutes", () => api);
vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
  del: vi.fn(async () => undefined),
}));

const { isSavedRoute, useRouteStore } = await import("../routeStore");

function candidate(id: string): RouteCandidate {
  return { id, name: id } as RouteCandidate;
}

function saved(id: string, from: RouteCandidate): SavedRoute {
  return { ...from, id, savedAt: "2026-10-03T00:00:00.000Z", notes: "n" };
}

describe("routeStore saved-route state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteStore.setState({
      results: [candidate("generated-loop-1"), candidate("generated-loop-2")],
      activeRouteId: "generated-loop-1",
      savedRoutes: [],
      savedRoutesStatus: "idle",
      savedRoutesError: null,
    });
  });

  it("swaps the saved copy in for its candidate so the view stays saved after remounts", async () => {
    const route = useRouteStore.getState().results[0];
    api.saveRoute.mockResolvedValue(saved("saved-a", route));

    await useRouteStore.getState().saveRoute(route);

    const state = useRouteStore.getState();
    expect(state.results.map((r) => r.id)).toEqual(["saved-a", "generated-loop-2"]);
    expect(isSavedRoute(state.results[0])).toBe(true);
    expect(state.activeRouteId).toBe("saved-a");
    expect(state.savedRoutes.map((r) => r.id)).toEqual(["saved-a"]);
  });

  it("keeps earlier saves when a later save comes from a candidate with the same client id", async () => {
    api.saveRoute.mockResolvedValueOnce(saved("saved-a", candidate("generated-loop-1")));
    await useRouteStore.getState().saveRoute(useRouteStore.getState().results[0]);

    useRouteStore.setState({ results: [candidate("generated-loop-1")], activeRouteId: "generated-loop-1" });
    api.saveRoute.mockResolvedValueOnce(saved("saved-b", candidate("generated-loop-1")));
    await useRouteStore.getState().saveRoute(useRouteStore.getState().results[0]);

    expect(useRouteStore.getState().savedRoutes.map((r) => r.id)).toEqual(["saved-b", "saved-a"]);
  });

  it("turns a deleted saved route in the results back into a savable candidate", async () => {
    const reopened = saved("saved-a", candidate("generated-loop-1"));
    useRouteStore.setState({ results: [reopened], activeRouteId: "saved-a", savedRoutes: [reopened] });
    api.deleteSavedRoute.mockResolvedValue(undefined);

    await useRouteStore.getState().deleteRoute("saved-a");

    const [route] = useRouteStore.getState().results;
    expect(route.id).toBe("saved-a");
    expect(isSavedRoute(route)).toBe(false);
    expect("notes" in route).toBe(false);
    expect(useRouteStore.getState().savedRoutes).toEqual([]);
  });

  it("clearLibrary drops the library and saved flags for the next account", () => {
    const reopened = saved("saved-a", candidate("generated-loop-1"));
    useRouteStore.setState({ results: [reopened], savedRoutes: [reopened], savedRoutesStatus: "ready" });

    useRouteStore.getState().clearLibrary();

    const state = useRouteStore.getState();
    expect(state.savedRoutes).toEqual([]);
    expect(state.savedRoutesStatus).toBe("idle");
    expect(isSavedRoute(state.results[0])).toBe(false);
  });
});
