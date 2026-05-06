"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Footprints, Mountain, Signal } from "lucide-react";
import { mockAllTrailsRoutes } from "@/lib/mockRoutes";
import { normalizeExternalRoute } from "@/lib/routeNormalizer";
import { formatActivity } from "@/lib/geoUtils";
import { useRouteStore } from "@/store/routeStore";

export function AllTrailsRoutePicker() {
  const router = useRouter();
  const setResults = useRouteStore((state) => state.setResults);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {mockAllTrailsRoutes.map((route) => (
        <article
          key={route.id}
          className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-700">Source: AllTrails</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">{route.name}</h2>
            </div>
            <span className="rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
              {formatActivity(route.activity)}
            </span>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <Metric icon={<Footprints size={17} />} label="Distance" value={`${route.distanceKm} km`} />
            <Metric icon={<Mountain size={17} />} label="Gain" value={`${route.elevationGainM} m`} />
            <Metric icon={<Signal size={17} />} label="Difficulty" value={route.difficulty ?? "Moderate"} />
          </dl>
          <button
            type="button"
            onClick={() => {
              const candidate = normalizeExternalRoute(route);
              setResults([candidate], candidate.id);
              router.push("/results");
            }}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-950 px-4 py-3 font-semibold text-white hover:bg-emerald-950"
          >
            Analyze this route
            <ArrowRight size={18} />
          </button>
        </article>
      ))}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <dt className="flex items-center gap-2 text-stone-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-stone-950">{value}</dd>
    </div>
  );
}
