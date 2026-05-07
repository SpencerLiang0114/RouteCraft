"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { ElevationChart } from "./ElevationChart";
import { ExportButtons } from "./ExportButtons";
import { RouteCard } from "./RouteCard";
import { RouteMap } from "./RouteMap";
import { useRouteStore } from "@/store/routeStore";

export function RouteResultsClient() {
  const results = useRouteStore((state) => state.results);
  const activeRouteId = useRouteStore((state) => state.activeRouteId);
  const setActiveRoute = useRouteStore((state) => state.setActiveRoute);
  const activeRoute = results.find((route) => route.id === activeRouteId) ?? results[0];
  const searchParams = useSearchParams();
  const sharedRouteId = searchParams.get("route");

  useEffect(() => {
    if (!sharedRouteId) return;
    const { results: currentResults, savedRoutes, setResults, setActiveRoute: activate } = useRouteStore.getState();
    const inResults = currentResults.find((r) => r.id === sharedRouteId);
    if (inResults) {
      activate(sharedRouteId);
      return;
    }
    const inSaved = savedRoutes.find((r) => r.id === sharedRouteId);
    if (inSaved) {
      setResults([inSaved], inSaved.id);
    }
  }, [sharedRouteId]);

  if (!activeRoute) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-4xl font-semibold text-stone-950">No route selected yet</h1>
        <p className="mt-4 text-lg leading-8 text-stone-600">
          Choose a mock Strava route or generate a new route.
        </p>
        <Link
          href="/route-source"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-stone-950"
        >
          <ArrowLeft size={18} />
          Choose route source
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 font-semibold text-emerald-800">
            <Sparkles size={18} />
            Route analysis
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-stone-950">{activeRoute.name}</h1>
        </div>
        <Link href="/route-source" className="font-semibold text-stone-700 hover:text-emerald-900">
          Pick another route
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <RouteMap
            routes={results}
            selectedRouteId={activeRoute.id}
            onSelectRoute={setActiveRoute}
          />
          {activeRoute.elevationProfile && activeRoute.elevationProfile.length >= 2 && (
            <ElevationChart profile={activeRoute.elevationProfile} />
          )}
          <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <ExportButtons route={activeRoute} />
          </div>
        </div>

        <aside className="grid gap-4">
          {results.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              selected={route.id === activeRoute.id}
              onSelect={() => setActiveRoute(route.id)}
            />
          ))}
        </aside>
      </div>
    </div>
  );
}
