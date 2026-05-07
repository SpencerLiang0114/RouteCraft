"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { SavedRouteCard } from "./SavedRouteCard";
import { useRouteStore } from "@/store/routeStore";

export function SavedRoutesClient() {
  const savedRoutes = useRouteStore((state) => state.savedRoutes);
  const savedRoutesStatus = useRouteStore((state) => state.savedRoutesStatus);
  const savedRoutesError = useRouteStore((state) => state.savedRoutesError);
  const loadSavedRoutes = useRouteStore((state) => state.loadSavedRoutes);

  useEffect(() => {
    void loadSavedRoutes();
  }, [loadSavedRoutes]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="inline-flex items-center gap-2 font-semibold text-emerald-800">
          <Bookmark size={18} />
          Saved routes
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-stone-950">Your RouteCraft library</h1>
      </div>

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
          <h2 className="text-2xl font-semibold text-stone-950">No saved routes yet</h2>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-stone-600">
            Save a generated, Strava, or uploaded route from the results page.
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
  );
}
