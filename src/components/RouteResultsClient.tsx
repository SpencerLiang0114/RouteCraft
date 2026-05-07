"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  const analysisColumnRef = useRef<HTMLDivElement | null>(null);
  const [analysisColumnHeight, setAnalysisColumnHeight] = useState<number | null>(null);

  useEffect(() => {
    const column = analysisColumnRef.current;
    if (!column) return;

    const updateHeight = () => {
      setAnalysisColumnHeight(Math.ceil(column.getBoundingClientRect().height));
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(column);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [activeRoute?.id, results.length]);

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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
        <div ref={analysisColumnRef}>
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

        <aside
          className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm lg:max-h-[var(--analysis-column-height)]"
          style={
            {
              "--analysis-column-height": analysisColumnHeight ? `${analysisColumnHeight}px` : "none",
            } as CSSProperties
          }
        >
          <div className="border-b border-stone-200 p-4">
            <p className="font-semibold text-emerald-800">Generated routes</p>
            <p className="mt-1 text-sm text-stone-600">Compare options and select a route to inspect.</p>
          </div>
          <div className="grid gap-4 overflow-y-auto p-4 lg:min-h-0">
            {results.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                selected={route.id === activeRoute.id}
                onSelect={() => setActiveRoute(route.id)}
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
