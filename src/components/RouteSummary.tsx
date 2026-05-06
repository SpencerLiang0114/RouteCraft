import { Bike, Footprints, Mountain } from "lucide-react";
import type { ActivityType, UserPreferences } from "@/types/route";
import { formatRouteType } from "@/lib/geoUtils";

const activityIcons: Record<ActivityType, typeof Footprints> = {
  running: Footprints,
  hiking: Mountain,
  cycling: Bike,
};

const preferenceLabel = (value: number) => (value === 3 ? "high" : value === 2 ? "medium" : "low");

export function RouteSummary({ preferences }: { preferences: UserPreferences }) {
  const Icon = activityIcons[preferences.activity];
  const target = preferences.targetDistanceKm
    ? `${preferences.targetDistanceKm} km`
    : preferences.targetDurationMin
      ? `${preferences.targetDurationMin} min`
      : "flexible distance";
  const startLabel = preferences.startPoint
    ? `${preferences.startPoint.lat.toFixed(5)}, ${preferences.startPoint.lng.toFixed(5)}`
    : "no start selected";

  return (
    <div className="rounded-lg border border-emerald-800 bg-emerald-950 p-6 text-white">
      <div className="flex items-center gap-3">
        <Icon size={26} />
        <h2 className="text-2xl font-semibold">Route summary</h2>
      </div>
      <p className="mt-5 text-2xl leading-9 text-emerald-50">
        {preferences.activity} · {target} · {formatRouteType(preferences.routeType)} ·{" "}
        {preferenceLabel(preferences.parkPreference)} park preference ·{" "}
        {preferenceLabel(preferences.elevationPreference)} elevation · avoid strong sun ·{" "}
        {preferenceLabel(preferences.explorationPreference)} exploration
      </p>
      <p className="mt-4 text-sm font-semibold text-emerald-100">Start: {startLabel}</p>
    </div>
  );
}
