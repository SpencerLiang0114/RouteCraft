"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, RotateCcw } from "lucide-react";
import { ExportButtons } from "./ExportButtons";
import { formatActivity, formatSource } from "@/lib/geoUtils";
import { useRouteStore } from "@/store/routeStore";
import type { SavedRoute } from "@/types/route";

export function SavedRouteCard({ route }: { route: SavedRoute }) {
  const router = useRouter();
  const setResults = useRouteStore((state) => state.setResults);
  const savedDate = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(route.savedAt));

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-emerald-800">
            {formatSource(route.source)} · {formatActivity(route.activity)}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-950">{route.name}</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-stone-600">
            <span>{route.distanceKm} km</span>
            <span>{route.elevationGainM} m gain</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={15} />
              Saved {savedDate}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setResults([route], route.id);
            router.push("/results");
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-stone-950 px-4 py-3 font-semibold text-white hover:bg-emerald-950"
        >
          <RotateCcw size={17} />
          Reopen
        </button>
      </div>
      <div className="mt-5">
        <ExportButtons route={route} compact />
      </div>
    </article>
  );
}
