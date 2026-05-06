import { Bike, Footprints, Mountain, Star } from "lucide-react";
import type { ActivityType, RouteCandidate } from "@/types/route";
import { formatActivity, formatSource } from "@/lib/geoUtils";

const activityIcons: Record<ActivityType, typeof Footprints> = {
  running: Footprints,
  hiking: Mountain,
  cycling: Bike,
};

export function RouteCard({
  route,
  selected,
  onSelect,
}: {
  route: RouteCandidate;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const Icon = activityIcons[route.activity];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-5 text-left shadow-sm transition ${
        selected
          ? "border-emerald-800 bg-emerald-950 text-white shadow-lg"
          : "border-stone-200 bg-white text-stone-950 hover:border-emerald-700"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${selected ? "text-emerald-100" : "text-emerald-800"}`}>
            Source: {formatSource(route.source)}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{route.name}</h2>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1 text-sm font-semibold ${
            selected ? "bg-white/15 text-white" : "bg-stone-100 text-stone-700"
          }`}
        >
          <Icon size={16} />
          {formatActivity(route.activity)}
        </span>
      </div>
      <p className={`mt-4 leading-7 ${selected ? "text-emerald-50" : "text-stone-600"}`}>
        {route.explanation}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Metric selected={selected} label="Distance" value={`${route.distanceKm} km`} />
        <Metric selected={selected} label="Duration" value={`${route.estimatedDurationMin} min`} />
        <Metric selected={selected} label="Elevation gain" value={`${route.elevationGainM} m`} />
        <Metric selected={selected} label="Difficulty" value={route.difficulty ?? "Moderate"} />
      </div>
      <div className="mt-5 grid gap-3">
        <ScoreBar selected={selected} label="Park/path percentage" value={route.metrics.parkScore} />
        <ScoreBar selected={selected} label="Shade score" value={route.metrics.shadeScore} />
        <ScoreBar selected={selected} label="Safety score" value={route.metrics.safetyScore} />
        <ScoreBar selected={selected} label="Exploration score" value={route.metrics.explorationScore} />
      </div>
      <div className={`mt-5 flex items-center gap-2 font-semibold ${selected ? "text-amber-200" : "text-amber-700"}`}>
        <Star size={18} fill="currentColor" />
        Total score {route.metrics.totalScore}
      </div>
    </button>
  );
}

function Metric({
  label,
  value,
  selected,
}: {
  label: string;
  value: string;
  selected?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${selected ? "bg-white/10" : "bg-stone-50"}`}>
      <p className={selected ? "text-emerald-100" : "text-stone-500"}>{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  selected,
}: {
  label: string;
  value: number;
  selected?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className={`mt-2 h-2 overflow-hidden rounded-full ${selected ? "bg-white/15" : "bg-stone-200"}`}>
        <div
          className={selected ? "h-full bg-amber-300" : "h-full bg-emerald-800"}
          style={{ width: `${Math.round(value)}%` }}
        />
      </div>
    </div>
  );
}
