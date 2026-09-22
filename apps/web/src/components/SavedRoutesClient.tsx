"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Filter } from "lucide-react";
import { AuthGate } from "./AuthGate";
import { SavedRouteCard } from "./SavedRouteCard";
import type { SavedRoutesQuery, SavedRoutesSort } from "@/lib/api-client/savedRoutes";
import { useRouteStore } from "@/store/routeStore";
import type { ActivityType } from "@/types/route";

const emptyFilters: SavedRoutesQuery = {
  q: "",
  activity: "",
  folder: "",
  tag: "",
  minDistanceKm: undefined,
  maxDistanceKm: undefined,
  minElevationM: undefined,
  maxElevationM: undefined,
  savedAfter: "",
  savedBefore: "",
  sort: "newest",
};

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function SavedRoutesClient() {
  const savedRoutes = useRouteStore((state) => state.savedRoutes);
  const savedRoutesStatus = useRouteStore((state) => state.savedRoutesStatus);
  const savedRoutesError = useRouteStore((state) => state.savedRoutesError);
  const loadSavedRoutes = useRouteStore((state) => state.loadSavedRoutes);

  const [draft, setDraft] = useState<SavedRoutesQuery>(emptyFilters);
  const [applied, setApplied] = useState<SavedRoutesQuery>(emptyFilters);

  useEffect(() => {
    void loadSavedRoutes(applied);
  }, [applied, loadSavedRoutes]);

  const folders = useMemo(() => {
    const values = new Set<string>();
    for (const route of savedRoutes) {
      if (route.folder) {
        values.add(route.folder);
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [savedRoutes]);

  const tags = useMemo(() => {
    const values = new Set<string>();
    for (const route of savedRoutes) {
      for (const tag of route.tags ?? []) {
        values.add(tag);
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [savedRoutes]);

  return (
    <AuthGate>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="inline-flex items-center gap-2 font-semibold text-emerald-800">
            <Bookmark size={18} />
            Saved routes
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-stone-950">Your RouteCraft library</h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Search, filter, and organize routes you want to ride or run again.
          </p>
        </div>

        <form
          className="mb-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied({
              ...draft,
              q: draft.q?.trim() || "",
              folder: draft.folder?.trim() || "",
              tag: draft.tag?.trim() || "",
            });
          }}
        >
          <div className="mb-4 flex items-center gap-2 font-semibold text-stone-800">
            <Filter size={17} />
            Filters
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block xl:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Search
              </span>
              <input
                value={draft.q ?? ""}
                onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="Name or notes"
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Activity
              </span>
              <select
                value={draft.activity ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    activity: event.target.value as ActivityType | "",
                  }))
                }
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              >
                <option value="">All</option>
                <option value="running">Running</option>
                <option value="hiking">Hiking</option>
                <option value="cycling">Cycling</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Sort
              </span>
              <select
                value={draft.sort ?? "newest"}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    sort: event.target.value as SavedRoutesSort,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              >
                <option value="newest">Newest</option>
                <option value="distance">Distance</option>
                <option value="elevation">Elevation</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Folder
              </span>
              <input
                list="saved-folders"
                value={draft.folder ?? ""}
                onChange={(event) => setDraft((prev) => ({ ...prev, folder: event.target.value }))}
                placeholder="Any folder"
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              />
              <datalist id="saved-folders">
                {folders.map((folder) => (
                  <option key={folder} value={folder} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Tag
              </span>
              <input
                list="saved-tags"
                value={draft.tag ?? ""}
                onChange={(event) => setDraft((prev) => ({ ...prev, tag: event.target.value }))}
                placeholder="Any tag"
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              />
              <datalist id="saved-tags">
                {tags.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Min distance (km)
              </span>
              <input
                type="number"
                min={0}
                step="0.1"
                value={draft.minDistanceKm ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    minDistanceKm: parseOptionalNumber(event.target.value),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Max distance (km)
              </span>
              <input
                type="number"
                min={0}
                step="0.1"
                value={draft.maxDistanceKm ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    maxDistanceKm: parseOptionalNumber(event.target.value),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Min elevation (m)
              </span>
              <input
                type="number"
                min={0}
                step="1"
                value={draft.minElevationM ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    minElevationM: parseOptionalNumber(event.target.value),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Max elevation (m)
              </span>
              <input
                type="number"
                min={0}
                step="1"
                value={draft.maxElevationM ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    maxElevationM: parseOptionalNumber(event.target.value),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Saved after
              </span>
              <input
                type="date"
                value={draft.savedAfter ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, savedAfter: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Saved before
              </span>
              <input
                type="date"
                value={draft.savedBefore ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, savedBefore: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 outline-none focus:border-emerald-700"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-stone-950"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(emptyFilters);
                setApplied(emptyFilters);
              }}
              className="rounded-lg border border-stone-300 px-4 py-2 font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50"
            >
              Reset
            </button>
          </div>
        </form>

        {savedRoutesStatus === "loading" && savedRoutes.length === 0 ? (
          <section className="rounded-lg border border-stone-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-stone-950">Loading saved routes</h2>
          </section>
        ) : savedRoutesStatus === "error" && savedRoutes.length === 0 ? (
          <section className="rounded-lg border border-stone-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-stone-950">Saved routes unavailable</h2>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-stone-600">
              {savedRoutesError ?? "Start the RouteCraft API and try again."}
            </p>
          </section>
        ) : savedRoutes.length === 0 ? (
          <section className="rounded-lg border border-stone-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-stone-950">No matching routes</h2>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-stone-600">
              Adjust filters, or save a generated, Strava, or uploaded route from results.
            </p>
            <Link
              href="/route-source"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-stone-950"
            >
              Create a route
            </Link>
          </section>
        ) : (
          <div className="grid gap-4">
            {savedRoutes.map((route) => (
              <SavedRouteCard key={`${route.id}-${route.savedAt}`} route={route} />
            ))}
          </div>
        )}
      </div>
    </AuthGate>
  );
}
